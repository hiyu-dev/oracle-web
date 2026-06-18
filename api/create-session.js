import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const PLANS = {
  basic: {
    name: '基本鑑定（2章）',
    amount: 980000, // 9,800円（テスト中は低額にして確認）
    chapters: 2,
  },
  full: {
    name: '総合鑑定（6章）',
    amount: 2980000, // 29,800円
    chapters: 6,
  },
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { plan, birth } = req.body;

  if (!plan || !birth) {
    return res.status(400).json({ error: '必須パラメータが不足しています' });
  }

  const planData = PLANS[plan];
  if (!planData) {
    return res.status(400).json({ error: '無効なプランです' });
  }

  const session = await stripe.checkout.sessions.create({
    payment_method_types: ['card'],
    line_items: [
      {
        price_data: {
          currency: 'jpy',
          product_data: {
            name: `ORACLE ${planData.name}`,
            description: `${birth.year}年${birth.month}月${birth.day}日生まれ / ${birth.placeName}`,
          },
          unit_amount: planData.amount,
        },
        quantity: 1,
      },
    ],
    mode: 'payment',
    success_url: `${process.env.BASE_URL}/result.html?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${process.env.BASE_URL}/`,
    metadata: {
      plan,
      birth: JSON.stringify(birth),
    },
  });

  res.json({ url: session.url });
}
