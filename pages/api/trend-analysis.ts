import type { NextApiRequest, NextApiResponse } from 'next'
import { supabaseAdmin } from '../../lib/supabase'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  // 캐시 확인 (6시간 이내)
  const { data: cached } = await supabaseAdmin
    .from('trend_analysis')
    .select('*')
    .gte('created_at', new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString())
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (cached) {
    return res.status(200).json({ analysis: cached.analysis_text, cached: true })
  }

  // 최근 7일 논문 데이터 수집
  const { data: papers } = await supabaseAdmin
    .from('papers')
    .select('title_ko, tags, summary_ko, published_at')
    .gte('published_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
    .order('published_at', { ascending: false })
    .limit(100)

  if (!papers || papers.length === 0) {
    return res.status(200).json({ analysis: '아직 분석할 논문 데이터가 충분하지 않아요. 논문을 더 수집해주세요!', cached: false })
  }

  // 태그 통계
  const tagCount: Record<string, number> = {}
  papers.forEach(p => (p.tags || []).forEach((t: string) => { tagCount[t] = (tagCount[t] || 0) + 1 }))
  const topTags = Object.entries(tagCount).sort((a, b) => b[1] - a[1]).slice(0, 8)

  // 최근 논문 제목 샘플 (최대 20개)
  const titleSample = papers.slice(0, 20).map(p => p.title_ko || '').filter(Boolean).join('\n')

  const prompt = `다음은 최근 7일간 arXiv에 등록된 AI 논문 ${papers.length}편의 데이터입니다.

분야별 논문 수:
${topTags.map(([tag, cnt]) => `- ${tag}: ${cnt}편`).join('\n')}

최근 논문 제목 샘플:
${titleSample}

위 데이터를 바탕으로 "최근 AI 연구 트렌드 분석"을 다음 형식으로 작성해주세요:

📌 **이번 주 AI 연구 핵심 트렌드**

**1. [가장 활발한 연구 분야]**
(해당 분야에서 어떤 연구가 집중되고 있는지, 왜 주목받는지 2-3문장)

**2. [두 번째 주목할 분야]**
(설명 2-3문장)

**3. [떠오르는 연구 주제]**
(논문 제목들에서 보이는 새로운 트렌드 2-3문장)

**💡 이번 주 인사이트**
(전체적인 흐름에서 주목할 만한 점을 2-3문장으로 정리)

전문 용어는 괄호로 풀어서 설명해주세요. 구체적이고 흥미롭게 작성해주세요.`

  try {
    const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY!,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1000,
        messages: [{ role: 'user', content: prompt }],
      }),
    })
    const aiData = await aiRes.json()
    const analysis = aiData.content?.[0]?.text || '트렌드 분석 실패'

    // 캐시 저장
    await supabaseAdmin.from('trend_analysis').insert({ analysis_text: analysis })

    res.status(200).json({ analysis, cached: false })
  } catch (e: any) {
    res.status(500).json({ error: e.message })
  }
}
