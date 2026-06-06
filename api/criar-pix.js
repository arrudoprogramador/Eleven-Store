// ============================================================
// api/criar-pix.js — Vercel Serverless Function
// Cria uma cobrança PIX no Mercado Pago e retorna QR Code
//
// Env vars necessárias (Vercel → Settings → Environment Variables):
//   MP_ACCESS_TOKEN → token do Mercado Pago (sandbox ou produção)
//   BASE_URL        → URL pública do seu projeto (ex: https://elevenstore.vercel.app)
// ============================================================

module.exports = async function handler(req, res) {

  // ── CORS ─────────────────────────────────────────────────────
  res.setHeader('Access-Control-Allow-Origin', process.env.BASE_URL || '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')   return res.status(405).json({ erro: 'Método não permitido' });

  // ── Variáveis de ambiente ─────────────────────────────────────
  const MP_TOKEN = process.env.MP_ACCESS_TOKEN;
  if (!MP_TOKEN) return res.status(500).json({ erro: 'MP_ACCESS_TOKEN não configurado' });

  // ── Valida corpo ──────────────────────────────────────────────
  const { pedido } = req.body || {};
  if (!pedido) return res.status(400).json({ erro: 'Dados do pedido ausentes' });

  const { nome, email, total, itens, endereco, frete, pagamento } = pedido;

  if (!nome || !email || !total || total <= 0) {
    return res.status(400).json({ erro: 'Campos obrigatórios ausentes: nome, email, total' });
  }
  if (pagamento !== 'pix') {
    // Cartão e dinheiro não usam esse endpoint
    return res.status(400).json({ erro: 'Esse endpoint é exclusivo para PIX' });
  }

  // ── Gera ID único do pedido ───────────────────────────────────
  // Usado como referência externa para cruzar com o webhook
  const pedidoId = `ES-${Date.now()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;

  // ── Chama API do Mercado Pago ─────────────────────────────────
  // Documentação: https://www.mercadopago.com.br/developers/pt/reference/payments/_payments/post
  const mpPayload = {
    transaction_amount: parseFloat(total.toFixed(2)),
    description:        `Pedido Eleven Store — ${pedidoId}`,
    payment_method_id:  'pix',
    payer: {
      email,
      first_name: nome.split(' ')[0],
      last_name:  nome.split(' ').slice(1).join(' ') || '-',
    },
    external_reference: pedidoId,
    // Webhook: só inclui quando BASE_URL for pública (https)
    // Em localhost o MP rejeita — o polling do frontend já cobre a confirmação
    ...(process.env.BASE_URL?.startsWith('https://') && {
      notification_url: `${process.env.BASE_URL}/api/webhook-pix`,
    }),
    // PIX expira em 30 minutos
    date_of_expiration: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    // Metadados extras (aparecem no painel do MP)
    metadata: {
      pedido_id:  pedidoId,
      itens:      JSON.stringify(itens || []),
      endereco:   JSON.stringify(endereco || {}),
      frete_tipo: frete?.tipo || '',
    },
  };

  let mpRes;
  try {
    mpRes = await fetch('https://api.mercadopago.com/v1/payments', {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${MP_TOKEN}`,
        // Idempotência: evita duplicar cobrança em caso de retry
        'X-Idempotency-Key': pedidoId,
      },
      body: JSON.stringify(mpPayload),
    });
  } catch (err) {
    console.error('[criar-pix] Erro de rede ao chamar MP:', err);
    return res.status(502).json({ erro: 'Erro de conexão com Mercado Pago' });
  }

  const mpData = await mpRes.json();

  if (!mpRes.ok) {
    console.error('[criar-pix] MP retornou erro:', mpRes.status, mpData);
    return res.status(502).json({
      erro:     'Mercado Pago recusou a cobrança',
      detalhes: mpData?.message || mpData?.cause?.[0]?.description || 'Erro desconhecido',
    });
  }

  // ── Extrai QR Code ────────────────────────────────────────────
  const pix = mpData.point_of_interaction?.transaction_data;
  if (!pix?.qr_code) {
    console.error('[criar-pix] QR Code ausente na resposta:', mpData);
    return res.status(502).json({ erro: 'QR Code não retornado pelo Mercado Pago' });
  }

  // ── Responde ao frontend ──────────────────────────────────────
  return res.status(200).json({
    pedidoId,
    paymentId:   mpData.id,           // ID do pagamento no MP — usado para polling
    status:      mpData.status,       // pending
    qrCode:      pix.qr_code,         // string para Copia e Cola
    qrCodeBase64: pix.qr_code_base64, // imagem do QR Code
    expiracao:   mpPayload.date_of_expiration,
  });
}