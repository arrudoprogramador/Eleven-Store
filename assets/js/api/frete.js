// ============================================================
// api/frete.js — Vercel Serverless Function
// Proxy seguro para a API do Melhor Envio
//
// Por que esse arquivo existe?
// A API do Melhor Envio bloqueia chamadas diretas do navegador
// (CORS). Esse endpoint roda no servidor, faz a chamada com o
// token secreto e devolve só o que o frontend precisa.
//
// Deploy: coloque na raiz do projeto e rode `vercel`
// Env vars necessárias no painel da Vercel:
//   ME_TOKEN   → seu token do Melhor Envio (sandbox ou produção)
//   ME_CEP_ORIGEM → CEP do seu estoque/loja (somente números)
// ============================================================

export default async function handler(req, res) {

  const origem = req.headers.origin || '';
  const dominiosPermitidos = [
    'http://localhost',
    'http://127.0.0.1',
    'eleven-store-arruda.vercel.app'
  ];
  const permiteQualquer = dominiosPermitidos.some(d => origem.startsWith(d));
  res.setHeader('Access-Control-Allow-Origin', permiteQualquer ? origem : dominiosPermitidos[0]);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')   return res.status(405).json({ erro: 'Método não permitido' });

  // ── Lê variáveis de ambiente ──────────────────────────────
  const ME_TOKEN     = process.env.ME_TOKEN;
  const CEP_ORIGEM   = process.env.ME_CEP_ORIGEM;

  if (!ME_TOKEN || !CEP_ORIGEM) {
    return res.status(500).json({ erro: 'Variáveis de ambiente não configuradas' });
  }

  // ── Valida corpo da requisição ────────────────────────────
  const { cep_destino, produtos } = req.body || {};

  if (!cep_destino || !/^\d{8}$/.test(cep_destino)) {
    return res.status(400).json({ erro: 'CEP de destino inválido' });
  }
  if (!Array.isArray(produtos) || produtos.length === 0) {
    return res.status(400).json({ erro: 'Lista de produtos inválida' });
  }

  const payload = {
    from: { postal_code: CEP_ORIGEM },
    to:   { postal_code: cep_destino },
    services: '1,2',          // PAC e SEDEX — adicione mais se quiser
    options: {
      receipt:   false,       // aviso de recebimento
      own_hand:  false,       // mão própria
      collect:   false,       // coleta pelo transportador
      insurance_value: 0,     // seguro — use o valor real do pedido em produção
    },
    products: produtos.map(p => ({
      id:        String(p.id),
      width:     p.largura  || 15,   // cm — ajuste para seus produtos
      height:    p.altura   || 5,    // cm
      length:    p.comprimento || 20, // cm
      weight:    p.peso     || 0.3,  // kg
      insurance_value: p.preco || 0,
      quantity:  p.quantidade || 1,
    })),
  };

  const ME_URL = process.env.ME_SANDBOX === 'false'
    ? 'https://melhorenvio.com.br/api/v2/me/shipment/calculate'
    : 'https://sandbox.melhorenvio.com.br/api/v2/me/shipment/calculate';

  let meRes;
  try {
    meRes = await fetch(ME_URL, {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Accept':        'application/json',
        'Authorization': `Bearer ${ME_TOKEN}`,
        'User-Agent':    'Eleven Store (contato@elevenstore.com.br)', // obrigatório pela ME
      },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    console.error('[frete] Erro de rede ao chamar Melhor Envio:', err);
    return res.status(502).json({ erro: 'Erro ao consultar transportadoras' });
  }

  if (!meRes.ok) {
    const texto = await meRes.text();
    console.error('[frete] Melhor Envio retornou erro:', meRes.status, texto);
    return res.status(502).json({ erro: 'Transportadora retornou erro', detalhes: texto });
  }

  const dados = await meRes.json();

  // ── Filtra e formata apenas serviços com preço válido ─────
  const LABELS = {
    'PAC':        'PAC — Correios',
    'SEDEX':      'SEDEX — Correios',
    'SEDEX 10':   'SEDEX 10 — Correios',
    '.Package':   'Jadlog .Package',
    '.Com':       'Jadlog .Com',
  };

  const opcoes = dados
    .filter(s => !s.error && s.price && parseFloat(s.price) > 0)
    .map(s => ({
      tipo:  s.name,
      label: LABELS[s.name] || s.name,
      valor: parseFloat(s.price),
      prazo: s.delivery_time
        ? `${s.delivery_time} dia${s.delivery_time > 1 ? 's' : ''} útil${s.delivery_time > 1 ? 'eis' : ''}`
        : 'Prazo a confirmar',
      transportadora: s.company?.name || '',
    }))
    .sort((a, b) => a.valor - b.valor); // ordena do mais barato ao mais caro

  if (opcoes.length === 0) {
    return res.status(200).json({
      opcoes: [],
      aviso: 'Nenhuma opção de frete disponível para esse CEP',
    });
  }

  return res.status(200).json({ opcoes });
}