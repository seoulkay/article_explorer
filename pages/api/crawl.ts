import type { NextApiRequest, NextApiResponse } from 'next'
import { fetchArxivPapers } from '../../lib/arxiv'
import { analyzePaper } from '../../lib/analyzer'
import { executeOne, executeMutation } from '../../lib/snowflake'

// Vercel 함수 최대 실행시간 (Pro: 300초, Hobby: 60초)
export const config = { maxDuration: 300 }

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { secret, count = 10 } = req.body
  const safeCount = Math.min(Number(count), 50)

  if (secret !== process.env.CRAWL_SECRET) {
    return res.status(401).json({ error: '인증 실패' })
  }

  try {
    // DB에 저장된 논문 수로 start 오프셋 계산 → 항상 새 논문 가져옴
    const countRow = await executeOne<{ cnt: number }>(`SELECT COUNT(*) AS cnt FROM papers`)
    const startOffset = countRow?.cnt ?? 0
    console.log(`DB 논문 수: ${startOffset}, arXiv start: ${startOffset}`)

    const papers = await fetchArxivPapers(safeCount, startOffset)
    console.log(`arXiv에서 ${papers.length}개 논문 수집 (offset: ${startOffset})`)

    const results = []
    const errors = []
    const skipped = []

    for (const paper of papers) {
      try {
        // 중복 체크
        const existing = await executeOne(
          `SELECT id FROM papers WHERE id = :1`,
          [paper.id]
        )

        if (existing) {
          skipped.push(paper.id)
          continue
        }

        // Claude로 분석
        const analysis = await analyzePaper(paper.title_en, paper.abstract_en)

        await executeMutation(
          `INSERT INTO papers (
            id, title_en, title_ko, abstract_en, summary_ko,
            key_contributions, dataset, model, performance,
            github_url, easy_explanation, paper_url,
            tags, authors, published_at
          ) VALUES (
            :1, :2, :3, :4, :5,
            :6, :7, :8, :9,
            :10, :11, :12,
            PARSE_JSON(:13), PARSE_JSON(:14), :15::TIMESTAMP_NTZ
          )`,
          [
            paper.id,
            paper.title_en,
            analysis.title_ko,
            paper.abstract_en,
            analysis.summary_ko,
            analysis.key_contributions,
            analysis.dataset,
            analysis.model,
            analysis.performance,
            analysis.github_url || null,
            analysis.easy_explanation || null,
            paper.paper_url,
            JSON.stringify(analysis.tags),
            JSON.stringify(paper.authors),
            paper.published_at,
          ]
        )

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
      total_in_db: startOffset + results.length,
      results,
      error_details: errors,
    })
  } catch (e: any) {
    res.status(500).json({ error: e.message })
  }
}
