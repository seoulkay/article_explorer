import type { NextApiRequest, NextApiResponse } from 'next'
import { fetchArxivPapers } from '../../lib/arxiv'
import { analyzePaper } from '../../lib/analyzer'
import { supabaseAdmin } from '../../lib/supabase'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { secret, count = 10 } = req.body
  const safeCount = Math.min(Number(count), 50)

  if (secret !== process.env.CRAWL_SECRET) {
    return res.status(401).json({ error: '인증 실패' })
  }

  try {
    // DB에 저장된 논문 수로 start 오프셋 계산 → 항상 새 논문 가져옴
    const { count: dbCount } = await supabaseAdmin
      .from('papers')
      .select('*', { count: 'exact', head: true })

    const startOffset = dbCount || 0
    console.log(`DB 논문 수: ${startOffset}, arXiv start: ${startOffset}`)

    const papers = await fetchArxivPapers(safeCount, startOffset)
    console.log(`arXiv에서 ${papers.length}개 논문 수집 (offset: ${startOffset})`)

    const results = []
    const errors = []
    const skipped = []

    for (const paper of papers) {
      try {
        // 혹시 모를 중복 체크 (id 기준)
        const { data: existing } = await supabaseAdmin
          .from('papers')
          .select('id')
          .eq('id', paper.id)
          .maybeSingle()

        if (existing) {
          skipped.push(paper.id)
          continue
        }

        // Claude로 분석 (JSON + 쉬운설명 병렬 호출)
        const analysis = await analyzePaper(paper.title_en, paper.abstract_en)

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
        console.log(`✓ ${analysis.title_ko}`)

        // arXiv 레이트리밋 방지 (논문당 1초 대기)
        await new Promise(r => setTimeout(r, 1000))

      } catch (e: any) {
        console.error(`✗ ${paper.id}: ${e.message}`)
        errors.push({ id: paper.id, error: e.message })
      }
    }

    res.status(200).json({
      success: true,
      saved: results.length,
      skipped: skipped.length,
      errors: errors.length,
      total_in_db: (dbCount || 0) + results.length,
      results,
      error_details: errors,
    })
  } catch (e: any) {
    res.status(500).json({ error: e.message })
  }
}
