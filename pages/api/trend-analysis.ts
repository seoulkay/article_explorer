import type { NextApiRequest, NextApiResponse } from 'next'
import { randomUUID } from 'crypto'
import { executeOne, executeQuery, executeMutation } from '../../lib/snowflake'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  // 캐시 확인 (6시간 이내)
  const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString()
  const cached = await executeOne<{ analysis_text: string }>(
    `SELECT analysis_text FROM trend_analysis
     WHERE created_at >= :1::TIMESTAMP_NTZ
     ORDER BY created_at DESC
     LIMIT 1`,
    [sixHoursAgo]
  )

  if (cached) {
    return res.status(200).json({ analysis: cached.analysis_text, cached: true })
  }

  // 최근 수집 논문 50편 기준 분석
  const papers = await executeQuery<{ title_ko: string; tags: any; summary_ko: string; published_at: string; source: string; journal_name: string }>(
    `SELECT title_ko, tags, summary_ko, published_at, source, journal_name FROM papers
     ORDER BY created_at DESC
     LIMIT 50`,
    []
  )

  if (!papers || papers.length === 0) {
    return res.status(200).json({ analysis: '아직 분석할 논문 데이터가 충분하지 않아요. 논문을 더 수집해주세요!', cached: false })
  }

  // 태그 통계
  const tagCount: Record<string, number> = {}
  papers.forEach(p => {
    const tags = Array.isArray(p.tags) ? p.tags : []
    tags.forEach((t: string) => { tagCount[t] = (tagCount[t] || 0) + 1 })
  })
  const topTags = Object.entries(tagCount).sort((a, b) => b[1] - a[1]).slice(0, 8)

  // 최근 논문 제목 샘플 (최대 20개)
  const titleSample = papers.slice(0, 20).map(p => p.title_ko || '').filter(Boolean).join('\n')

  const prompt = `다음은 최근 수집된 AI 논문 ${papers.length}편의 데이터입니다 (arXiv + SCIE 저널).

분야별 논문 수:
${topTags.map(([tag, cnt]) => `- ${tag}: ${cnt}편`).join('\n')}

최근 논문 제목 샘플:
${titleSample}

위 데이터를 바탕으로 "최근 AI 연구 트렌드 분석"을 다음 형식으로 작성해주세요:

📌 **최근 수집 논문 기반 AI 연구 트렌드**

**1. [가장 활발한 연구 분야]**
(해당 분야에서 어떤 연구가 집중되고 있는지, 왜 주목받는지 2-3문장)

**2. [두 번째 주목할 분야]**
(설명 2-3문장)

**3. [떠오르는 연구 주제]**
(논문 제목들에서 보이는 새로운 트렌드 2-3문장)

**💡 인사이트**
(전체적인 흐름에서 주목할 만한 점을 2-3문장으로 정리)

전문 용어는 괄호로 풀어서 설명해주세요. 구체적이고 흥미롭게 작성해주세요.`

  try {
    const cortexRow = await executeOne<{ result: string }>(
      `SELECT SNOWFLAKE.CORTEX.COMPLETE(
         'mistral-large2',
         ARRAY_CONSTRUCT(OBJECT_CONSTRUCT('role', 'user', 'content', :1))
       ):choices[0]:messages::VARCHAR AS result`,
      [prompt]
    )
    const analysis = cortexRow?.result?.trim() || '트렌드 분석 실패'

    // 캐시 저장 (UUID 생성)
    await executeMutation(
      `INSERT INTO trend_analysis (id, analysis_text) VALUES (:1, :2)`,
      [randomUUID(), analysis]
    )

    res.status(200).json({ analysis, cached: false })
  } catch (e: any) {
    res.status(500).json({ error: e.message })
  }
}
