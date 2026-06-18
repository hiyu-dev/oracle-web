import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic();
const MODEL = 'claude-opus-4-8';

function chartSummary(chart) {
  const pos = chart.positions.map(p =>
    `${p.planet}：${p.sign} ${p.deg.toFixed(1)}度（第${p.house}ハウス）`
  ).join('\n');
  const asp = chart.aspects.slice(0, 15).map(a =>
    `${a.planet1} × ${a.planet2}：${a.aspect}（オーブ${a.orb}度）`
  ).join('\n');
  return `【天体配置】\n${pos}\n上昇宮（ASC）：${chart.asc.sign} ${chart.asc.deg.toFixed(1)}度\nMC（天頂）：${chart.mc.sign} ${chart.mc.deg.toFixed(1)}度\n\n【主要アスペクト】\n${asp}`;
}

function makeSystem(birth) {
  const name    = birth.name    || 'あなた';
  const gender  = birth.gender  === 'female' ? '女性' : birth.gender === 'male' ? '男性' : '';
  const theme   = birth.theme   || '';
  const concern = birth.concern || '';

  const genderLine   = gender  ? `・クライアントは${gender}です。自然な表現で配慮してください` : '';
  const themeLine    = theme   ? `・クライアントが今一番気になっていること：「${theme}」。この視点を各章に自然に織り込んでください` : '';
  const concernLine  = concern ? `・クライアントの現在の状況・悩み：「${concern}」。鑑定文の中でこの状況に寄り添った言葉を入れてください` : '';

  return `あなたは西洋占星術の第一人者です。
出生ホロスコープのデータをもとに、クライアントへ向けた深みのある鑑定文を書いてください。
・クライアントの名前は「${name}さん」です。文章の中で自然に名前を呼びかけてください
${genderLine}
${themeLine}
${concernLine}
・丁寧語・です/ます調で書く
・具体的で温かみがあり、読んで励まされる文章
・各セクション600〜900文字程度
・箇条書きは使わず、段落文章で書く
・占いはエンターテインメントとして提供する`.replace(/\n{3,}/g, '\n');
}

const CHAPTERS = [
  {
    title: '第1章　あなたの本質 — 太陽・月・上昇宮',
    prompt: (summary, sun, moon, asc) => `
クライアントの出生ホロスコープ：\n${summary}\n
太陽サイン（${sun.sign}）、月サイン（${moon.sign}）、上昇宮（${asc.sign}）の三位一体から、
この人の本質的な性格・魂の気質・世界への見せ方を、600〜900文字で鑑定してください。`
  },
  {
    title: '第2章　生まれながらの才能と魂の使命',
    prompt: (summary) => `
クライアントの出生ホロスコープ：\n${summary}\n
第1ハウス・第10ハウス・MC・木星の配置から、
この人が持って生まれた才能、社会での輝き方、天職・使命について600〜900文字で鑑定してください。`
  },
  {
    title: '第3章　恋愛と魂の絆 — 愛の傾向とパートナーシップ',
    prompt: (summary) => `
クライアントの出生ホロスコープ：\n${summary}\n
第5ハウス・第7ハウス・金星・火星の配置から、
この人の恋愛傾向、理想のパートナー像、関係において大切にすべきことを600〜900文字で鑑定してください。`
  },
  {
    title: '第4章　仕事・財運 — 物質世界での成功法則',
    prompt: (summary) => `
クライアントの出生ホロスコープ：\n${summary}\n
第2ハウス・第6ハウス・第10ハウス・土星・木星の配置から、
この人に合った働き方、財を引き寄せるコツ、成功するための条件を600〜900文字で鑑定してください。`
  },
  {
    title: `第5章　人生の転換期`,
    prompt: (summary) => {
      const y = new Date().getFullYear();
      return `
クライアントの出生ホロスコープ：\n${summary}\n
木星・土星のサイクルと現在の天体運行から、
${y}〜${y + 2}年に訪れる転換期・チャンスの時期を600〜900文字で鑑定してください。`;
    }
  },
  {
    title: '第6章　魂への手紙 — あなたへの統合メッセージ',
    prompt: (summary) => `
クライアントの出生ホロスコープ：\n${summary}\n
ここまでの全ての配置を総合して、このクライアントへ向けた
魂を揺さぶる締めくくりのメッセージを900〜1200文字で書いてください。
未来への希望と力強い励ましを込めてください。`
  },
];

/**
 * 指定章をストリーミングで生成する
 * onChunk(text) が呼ばれるたびにフロントへ流す
 */
export async function generateChapter(chart, chapterIndex, plan, onChunk, birth = {}) {
  const summary = chartSummary(chart);
  const sun  = chart.positions[0];
  const moon = chart.positions[1];
  const asc  = chart.asc;

  const maxChapter = plan === 'full' ? 6 : 2;
  if (chapterIndex >= maxChapter) return null;

  const chapter = CHAPTERS[chapterIndex];
  const userPrompt = chapter.prompt(summary, sun, moon, asc);

  const stream = await client.messages.create({
    model: MODEL,
    max_tokens: 1500,
    system: makeSystem(birth),
    messages: [{ role: 'user', content: userPrompt }],
    stream: true,
    thinking: { type: 'adaptive' },
  });

  let fullText = '';
  for await (const event of stream) {
    if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
      const text = event.delta.text;
      fullText += text;
      onChunk(text);
    }
  }
  return { title: chapter.title, text: fullText };
}

export { CHAPTERS };
