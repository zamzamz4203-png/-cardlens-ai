const schema = {
  type: 'object', additionalProperties: false,
  properties: {
    object_type: { type: 'string', enum: ['card','pack'] },
    name: { type: 'string' }, set: { type: 'string' }, number: { type: 'string' }, rarity: { type: 'string' },
    identification_confidence: { type: 'number', minimum: 0, maximum: 1 },
    estimated_grade: { type: 'string' },
    raw_price_estimate: { type: 'string' }, psa9_price_estimate: { type: 'string' }, psa10_price_estimate: { type: 'string' },
    authenticity_probability: { type: 'number', minimum: 0, maximum: 1 },
    reseal_risk: { type: 'number', minimum: 0, maximum: 1 },
    notes: { type: 'array', items: { type: 'string' }, maxItems: 6 }
  },
  required: ['object_type','name','set','number','rarity','identification_confidence','estimated_grade','raw_price_estimate','psa9_price_estimate','psa10_price_estimate','authenticity_probability','reseal_risk','notes']
};

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  if (!process.env.OPENAI_API_KEY) return res.status(500).json({ error: 'OPENAI_API_KEY가 설정되지 않았습니다.' });
  const { front, back, guideMode } = req.body || {};
  if (!front || !back) return res.status(400).json({ error: '앞면과 뒷면 이미지가 필요합니다.' });
  if (front.length > 6_000_000 || back.length > 6_000_000) return res.status(413).json({ error: '이미지가 너무 큽니다.' });

  const prompt = `당신은 포켓몬 트레이딩 카드 및 밀봉 부스터팩 이미지 분석 전문가다. 두 이미지는 같은 물건의 앞면과 뒷면이다. 사용자가 선택한 가이드 힌트는 ${guideMode || 'unknown'}이다. 힌트보다 실제 이미지를 우선한다.\n\n해야 할 일:\n1) 카드인지 밀봉 팩인지 구분한다.\n2) 보이는 글자, 세트 로고, 카드 번호, 캐릭터, 포장 디자인을 사용해 이름/세트/번호/희귀도를 최대한 식별한다. 확실하지 않으면 '식별 불확실'이라고 쓴다.\n3) 카드면 센터링, 모서리, 가장자리, 표면 결함을 보고 PSA 예상 등급 범위를 적는다. 팩이면 등급 대신 '미개봉 상태: 양호/보통/주의'처럼 적는다.\n4) 가격은 실시간 확정가가 아니라 현재 일반 시장 범위를 KRW로 보수적으로 추정한다. 팩이면 PSA 9/10 가격은 '해당 없음'으로 적는다. 식별이 불확실하면 '판단 어려움'으로 적는다.\n5) 진품 가능성과 팩 재포장 위험을 0~1로 제시한다. 사진만으로 확정하지 말고, 인쇄/색상/글꼴/재단/실링/접착선/주름 등 관찰 근거를 notes에 한국어로 적는다. 카드의 reseal_risk는 0으로 둔다.\n6) 과도한 확신을 피한다.`;

  try {
    const r = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || 'gpt-5.6-luna',
        input: [{ role: 'user', content: [
          { type: 'input_text', text: prompt },
          { type: 'input_image', image_url: front },
          { type: 'input_image', image_url: back }
        ]}],
        text: { format: { type: 'json_schema', name: 'card_analysis', strict: true, schema } },
        max_output_tokens: 1200
      })
    });
    const json = await r.json();
    if (!r.ok) return res.status(r.status).json({ error: json?.error?.message || 'OpenAI API 오류' });
    const text = json.output_text || json.output?.flatMap(x=>x.content||[]).find(x=>x.type==='output_text')?.text;
    if (!text) return res.status(502).json({ error: 'AI 응답을 읽지 못했습니다.' });
    return res.status(200).json(JSON.parse(text));
  } catch (e) {
    return res.status(500).json({ error: e.message || '분석 서버 오류' });
  }
};
