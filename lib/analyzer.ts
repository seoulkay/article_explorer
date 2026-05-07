export interface PaperAnalysis {
  title_ko: string
  summary_ko: string
  key_contributions: string
  dataset: string
  model: string
  performance: string
  github_url: string
  tags: string[]
  easy_explanation: string
}

export async function analyzePaper(
  title_en: string,
  abstract_en: string
): Promise<PaperAnalysis> {
  const prompt = `다음 AI 논문의 제목과 초록을 분석하여 JSON으로 응답해주세요.

제목: ${title_en}
초록: ${abstract_en}

다음 JSON 형식으로만 응답하세요 (다른 텍스트 없이):
{
  "title_ko": "한글로 번역된 제목",
  "summary_ko": "논문의 핵심 내용을 한국어로 3줄로 요약. 각 줄은 \\n으로 구분.",
  "key_contributions": "이 논문의 핵심 기여점 1-3가지를 한국어로 작성",
  "dataset": "사용된 데이터셋 이름들 (없으면 '명시되지 않음')",
  "model": "제안된 또는 사용된 모델/방법론 이름 (없으면 '명시되지 않음')",
  "performance": "성능 향상 수치나 결과 (예: 'BLEU +2.3', 'Accuracy 94.5%', 없으면 '명시되지 않음')",
  "github_url": "초록에 GitHub URL이 있으면 추출, 없으면 빈 문자열",
  "tags": ["관련 분야 태그 3-5개 (예: NLP, 컴퓨터비전, 강화학습, 생성모델, 멀티모달, 추천시스템, 의료AI 등)"],
  "easy_explanation": "이 논문을 고등학생도 이해할 수 있게 비유와 예시를 들어 3-4문장으로 쉽게 설명. 전문 용어 최소화."
}`

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY!,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001', // 빠르고 저렴한 모델로 분석
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    }),
  })

  const data = await res.json()
  const text = data.content?.[0]?.text || '{}'

  try {
    const clean = text.replace(/```json|```/g, '').trim()
    return JSON.parse(clean)
  } catch {
    return {
      title_ko: title_en,
      summary_ko: '분석 실패',
      key_contributions: '분석 실패',
      dataset: '명시되지 않음',
      model: '명시되지 않음',
      performance: '명시되지 않음',
      github_url: '',
      tags: ['AI'],
      easy_explanation: '분석 실패',
    }
  }
}
