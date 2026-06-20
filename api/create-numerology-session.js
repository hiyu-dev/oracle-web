import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  let birth;
  try {
    birth = req.body.birth;
    if (!birth || !birth.year) throw new Error();
  } catch {
    return res.status(400).json({ error: 'パラメータ不足' });
  }

  const session = await stripe.checkout.sessions.create({
    payment_method_types: ['card'],
    line_items: [{
      price_data: {
        currency: 'jpy',
        product_data: { name: '数秘術 AI詳細鑑定' },
        unit_amount: 500,
      },
      quantity: 1,
    }],
    mode: 'payment',
    success_url: `${process.env.BASE_URL}/numerology-result.html?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${process.env.BASE_URL}/numerology.html`,
    metadata: { birth: JSON.stringify(birth) },
  });

  res.json({ url: session.url });
}
