import type { NextApiRequest, NextApiResponse } from 'next'
import { fetchArxivPapers } from '../../lib/arxiv'
import { analyzePaper } from '../../lib/analyzer'
import { supabaseAdmin } from '../../lib/supabase'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  // 간단한 보안 키 체크
  const { secret, count = 10 } = req.body
  if (secret !== process.env.CRAWL_SECRET) {
    return res.status(401).json({ error: '인증 실패' })
  }

  try {
    // 1. arXiv에서 논문 가져오기
    const papers = await fetchArxivPapers(Number(count))
    console.log(`arXiv에서 ${papers.length}개 논문 수집`)

    const results = []
    const errors = []

    for (const paper of papers) {
      try {
        // 2. 이미 DB에 있는지 확인
        const { data: existing } = await supabaseAdmin
          .from('papers')
          .select('id')
          .eq('id', paper.id)
          .single()

        if (existing) {
          console.log(`이미 존재: ${paper.id}`)
          continue
        }

        // 3. Claude로 분석
        const analysis = await analyzePaper(paper.title_en, paper.abstract_en)

        // 4. Supabase에 저장
        const { error } = await supabaseAdmin.from('papers').insert({
          id: paper.id,
          title_en: paper.title_en,
          title_ko: analysis.title_ko,
          abstract_en: paper.abstract_en,
          summary_ko: analysis.summary_ko,
          key_contributions: analysis.key_contributions,
          dataset: analysis.dataset,
          model: analysis.model,
          performance: analysis.performance,
          github_url: analysis.github_url || null,
          easy_explanation: analysis.easy_explanation || null,
          paper_url: paper.paper_url,
          tags: analysis.tags,
          authors: paper.authors,
          published_at: paper.published_at,
        })

        if (error) throw error

        results.push({ id: paper.id, title_ko: analysis.title_ko })
        console.log(`저장 완료: ${analysis.title_ko}`)

        // API 레이트 리밋 방지
        await new Promise(r => setTimeout(r, 500))

      } catch (e: any) {
        errors.push({ id: paper.id, error: e.message })
      }
    }

    res.status(200).json({
      success: true,
      saved: results.length,
      skipped: papers.length - results.length - errors.length,
      errors: errors.length,
      results,
    })
  } catch (e: any) {
    res.status(500).json({ error: e.message })
  }
}
