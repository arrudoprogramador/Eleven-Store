import MercadoPago from 'mercadopago';

const client = new MercadoPago({ accessToken: process.env.MP_ACCESS_TOKEN });

export default async function handler(req, res) {
  const { nome, email, total, pedidoId } = req.body;

  const payment = await client.payment.create({
    transaction_amount: total,
    description: 'Pedido Eleven Store',
    payment_method_id: 'pix',
    payer: { email, first_name: nome },
    external_reference: pedidoId,
    notification_url: `${process.env.BASE_URL}/api/webhook-pix`,
  });

  res.json({
    qr_code: payment.point_of_interaction.transaction_data.qr_code,
    qr_code_base64: payment.point_of_interaction.transaction_data.qr_code_base64,
    payment_id: payment.id,
  });
}