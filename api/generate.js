import Stripe from 'stripe';
import { calcChart } from '../engine/astro.js';
import { generateChapter, CHAPTERS } from '../engine/interpret.js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).end();
  }

  const { session_id, chapter } = req.query;
  const chapterIndex = parseInt(chapter, 10);

  if (!session_id || isNaN(chapterIndex)) {
    return res.status(400).json({ error: 'パラメータ不足' });
  }

  // Stripe で支払い確認
  let session;
  try {
    session = await stripe.checkout.sessions.retrieve(session_id);
  } catch {
    return res.status(404).json({ error: 'セッションが見つかりません' });
  }

  if (session.payment_status !== 'paid') {
    return res.status(402).json({ error: '未決済です' });
  }

  const plan  = session.metadata.plan;
  const birth = JSON.parse(session.metadata.birth);
  const maxChapter = plan === 'full' ? 6 : 2;

  if (chapterIndex >= maxChapter) {
    return res.status(400).json({ error: '章番号が範囲外です' });
  }

  // SSE ヘッダー
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const send = (data) => res.write(`data: ${JSON.stringify(data)}\n\n`);

  try {
    const chart = calcChart(birth);

    // チャプター0のときだけチャートデータも送る
    if (chapterIndex === 0) {
      send({ type: 'chart', chart: { positions: chart.positions, asc: chart.asc, mc: chart.mc, aspects: chart.aspects } });
      send({ type: 'meta', plan, maxChapter, birth });
    }

    send({ type: 'chapter_start', index: chapterIndex, title: CHAPTERS[chapterIndex].title });

    await generateChapter(chart, chapterIndex, plan, (text) => {
      send({ type: 'text', text });
    });

    send({ type: 'chapter_end', index: chapterIndex });

  } catch (err) {
    send({ type: 'error', message: err.message });
  }

  res.end();
}
