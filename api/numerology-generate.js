import Stripe from 'stripe';
import Anthropic from '@anthropic-ai/sdk';
import { calcLifePathNumber, NUMBER_NAMES } from '../engine/numerology.js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const client = new Anthropic();

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();

  const { session_id } = req.query;
  if (!session_id) return res.status(400).json({ error: 'パラメータ不足' });

  let session;
  try {
    session = await stripe.checkout.sessions.retrieve(session_id);
  } catch {
    return res.status(404).json({ error: 'セッションが見つかりません' });
  }

  if (session.payment_status !== 'paid') {
    return res.status(402).json({ error: '未決済です' });
  }

  const birth = JSON.parse(session.metadata.birth);
  const lifePathNumber = calcLifePathNumber(birth.year, birth.month, birth.day);
  const numberName = NUMBER_NAMES[lifePathNumber];
  const name = birth.name || 'あなた';

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const send = (data) => res.write(`data: ${JSON.stringify(data)}\n\n`);

  send({ type: 'meta', lifePathNumber, numberName, birth });

  try {
    const stream = client.messages.stream({
      model: 'claude-opus-4-8',
      max_tokens: 2000,
      thinking: { type: 'adaptive' },
      system: `あなたは数秘術の専門家です。生年月日から導き出した運命数をもとに、クライアントへ向けた深みのある個人鑑定文を書いてください。
・クライアントの名前は「${name}さん」です。文章の中で自然に名前を呼びかけてください
・1,200〜1,500字程度
・占い師がクライアントに語りかける文体
・運命数の意味、その人の才能・課題・これからの可能性を具体的に
・最後の一段落で「星の配置からさらに深く読み解く西洋占星術鑑定も承っています」という趣旨を自然に添える`,
      messages: [{
        role: 'user',
        content: `以下の情報をもとに鑑定文を書いてください。\n\nお名前：${name}\n生年月日：${birth.year}年${birth.month}月${birth.day}日\n運命数：${lifePathNumber}（${numberName}）`,
      }],
    });

    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        send({ type: 'text', text: event.delta.text });
      }
    }

    send({ type: 'done' });
  } catch (err) {
    send({ type: 'error', message: err.message });
  }

  res.end();
}
