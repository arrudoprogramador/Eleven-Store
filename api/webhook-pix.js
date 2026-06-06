module.exports = async function handler(req, res) {

  res.setHeader('Access-Control-Allow-Origin', process.env.BASE_URL || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method === 'GET') {
    const { id } = req.query;
    if (!id) return res.status(400).json({ erro: 'payment_id ausente' });

    const MP_TOKEN = process.env.MP_ACCESS_TOKEN;
    if (!MP_TOKEN) return res.status(500).json({ erro: 'MP_ACCESS_TOKEN não configurado' });

    let mpRes;
    try {
      mpRes = await fetch(`https://api.mercadopago.com/v1/payments/${id}`, {
        headers: { 'Authorization': `Bearer ${MP_TOKEN}` },
      });
    } catch (err) {
      console.error('[webhook-pix] Erro ao consultar MP:', err);
      return res.status(502).json({ erro: 'Erro ao consultar Mercado Pago' });
    }

    if (!mpRes.ok) {
      return res.status(mpRes.status).json({ erro: 'Pagamento não encontrado' });
    }

    const data = await mpRes.json();

    // Retorna apenas o necessário para o frontend
    return res.status(200).json({
      paymentId:  data.id,
      status:     data.status,           // pending | approved | rejected | cancelled
      statusDetail: data.status_detail,  // ex: accredited
      pedidoId:   data.external_reference,
      total:      data.transaction_amount,
    });
  }

  // ══════════════════════════════════════════════════════════════
  // POST /api/webhook-pix
  // Webhook: Mercado Pago avisa que o pagamento mudou de status
  // ══════════════════════════════════════════════════════════════
  if (req.method === 'POST') {
    const { type, data } = req.body || {};

    // MP envia vários tipos de notificação — só processamos pagamentos
    if (type !== 'payment') {
      return res.status(200).json({ ignorado: true, tipo: type });
    }

    const paymentId = data?.id;
    if (!paymentId) return res.status(400).json({ erro: 'payment_id ausente no webhook' });

    const MP_TOKEN = process.env.MP_ACCESS_TOKEN;

    // Consulta o pagamento para confirmar o status real
    // (nunca confie cegamente no corpo do webhook — pode ser forjado)
    let mpRes;
    try {
      mpRes = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
        headers: { 'Authorization': `Bearer ${MP_TOKEN}` },
      });
    } catch (err) {
      console.error('[webhook-pix] Erro ao verificar pagamento:', err);
      return res.status(500).json({ erro: 'Erro ao verificar pagamento' });
    }

    const pagamento = await mpRes.json();

    console.log(`[webhook-pix] Pagamento ${paymentId} — status: ${pagamento.status} — ref: ${pagamento.external_reference}`);

    if (pagamento.status === 'approved') {
      // ── PAGAMENTO CONFIRMADO ──────────────────────────────────
      // Aqui você pode:
      //   - Salvar em banco de dados (Vercel KV, PlanetScale, Supabase...)
      //   - Enviar e-mail de confirmação
      //   - Notificar sistema de estoque
      //
      // Por ora, apenas logamos. O frontend detecta via polling.
      console.log(`[webhook-pix] ✅ APROVADO — Pedido: ${pagamento.external_reference} — R$ ${pagamento.transaction_amount}`);
    }

    // Mercado Pago exige resposta 200 em até 22s, senão retenta
    return res.status(200).json({ recebido: true });
  }

  return res.status(405).json({ erro: 'Método não permitido' });
}