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

  // JSON과 easy_explanation을 분리해서 두 번 호출 → 파싱 안정성 대폭 향상
  const [structured, easyExp] = await Promise.all([
    fetchStructured(title_en, abstract_en),
    fetchEasyExplanation(title_en, abstract_en),
  ])

  return { ...structured, easy_explanation: easyExp }
}

// 1단계: 구조화된 메타데이터 (JSON 파싱)
async function fetchStructured(title_en: string, abstract_en: string): Promise<Omit<PaperAnalysis, 'easy_explanation'>> {
  const prompt = `다음 AI 논문을 분석해 JSON으로만 응답하세요. 마크다운 없이 순수 JSON만 출력하세요.

제목: ${title_en}
초록: ${abstract_en}

{
  "title_ko": "한글 번역 제목",
  "summary_ko": "핵심 내용 3줄 요약 (줄바꿈 없이 한 문단으로)",
  "key_contributions": "핵심 기여점 1-3가지 (줄바꿈 없이 한 문단으로)",
  "dataset": "사용 데이터셋 (없으면 명시되지않음)",
  "model": "제안 모델 또는 방법론 (없으면 명시되지않음)",
  "performance": "성능 수치 (없으면 명시되지않음)",
  "github_url": "초록의 GitHub URL (없으면 빈문자열)",
  "tags": ["태그1", "태그2", "태그3"]
}`

  const fallback = {
    title_ko: title_en,
    summary_ko: '요약을 생성할 수 없습니다.',
    key_contributions: '분석 실패',
    dataset: '명시되지 않음',
    model: '명시되지 않음',
    performance: '명시되지 않음',
    github_url: '',
    tags: ['AI'],
  }

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY!,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        messages: [{ role: 'user', content: prompt }],
      }),
    })

    const data = await res.json()
    const text = (data.content?.[0]?.text || '').trim()
    // JSON 블록만 추출
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) return fallback
    return { ...fallback, ...JSON.parse(jsonMatch[0]) }
  } catch {
    return fallback
  }
}

// 2단계: 쉬운 설명 (일반 텍스트 → 파싱 오류 없음)
async function fetchEasyExplanation(title_en: string, abstract_en: string): Promise<string> {
  const prompt = `다음 AI 논문을 고등학생도 이해할 수 있게 설명해주세요. 전문 용어는 반드시 괄호로 풀어서 설명하세요.

제목: ${title_en}
초록: ${abstract_en}

아래 형식으로 작성하세요:

[한 줄 핵심 요약]
이 논문을 한 문장으로: (비유적 표현으로 핵심을 담아)

[배경: 왜 이 연구가 필요했나?]
기존 방식의 문제점과 한계를 일상적인 비유로 2-3문장으로 설명.

[핵심 아이디어 1: (제목)]
첫 번째 핵심 기여를 구체적인 예시와 비유로 2-3문장 설명.

[핵심 아이디어 2: (제목)]
두 번째 핵심 기여를 구체적인 예시와 비유로 2-3문장 설명.

[실제로 어디에 쓸 수 있나?]
실용적인 활용 사례를 2-3가지 구체적으로 설명.

[한 줄 정리]
이 연구의 의의를 비전문가도 이해할 수 있게 마무리.`

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY!,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1500,
        messages: [{ role: 'user', content: prompt }],
      }),
    })
    const data = await res.json()
    return (data.content?.[0]?.text || '설명 생성 실패').trim()
  } catch {
    return '설명 생성 실패'
  }
}
