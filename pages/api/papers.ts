import type { NextApiRequest, NextApiResponse } from 'next'
import { executeQuery, executeOne } from '../../lib/snowflake'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const { tag, q, page = '1', limit = '20', showFailed = 'false' } = req.query
  const pageNum = parseInt(page as string)
  const limitNum = parseInt(limit as string)
  const offset = (pageNum - 1) * limitNum

  // WHERE 조건 동적 빌드
  const conditions: string[] = []
  const binds: any[] = []

  if (showFailed !== 'true') {
    conditions.push(`summary_ko NOT ILIKE '%분석 실패%'`)
    conditions.push(`summary_ko NOT ILIKE '%생성할 수 없%'`)
    conditions.push(`title_ko != ''`)
  }

  if (tag && tag !== '전체') {
    binds.push(JSON.stringify(tag as string)) // e.g. '"LLM"'
    conditions.push(`ARRAY_CONTAINS(PARSE_JSON(:${binds.length}), tags)`)
  }

  if (q) {
    const searchVal = `%${q}%`
    binds.push(searchVal)
    const idx = binds.length
    conditions.push(`(title_ko ILIKE :${idx} OR title_en ILIKE :${idx} OR summary_ko ILIKE :${idx})`)
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

  // 총 개수
  const countRow = await executeOne<{ cnt: number }>(
    `SELECT COUNT(*) AS cnt FROM papers ${where}`,
    binds
  )
  const total = countRow?.cnt ?? 0

  // 페이지 데이터
  const paginationBinds = [...binds, limitNum, offset]
  const limitIdx = paginationBinds.length - 1
  const offsetIdx = paginationBinds.length

  const papers = await executeQuery(
    `SELECT * FROM papers ${where} ORDER BY created_at DESC LIMIT :${limitIdx} OFFSET :${offsetIdx}`,
    paginationBinds
  )

  // 분야별 트렌드 데이터 (최근 30일)
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
  const trendData = await executeQuery(
    `SELECT tags, published_at FROM papers WHERE published_at >= :1 ORDER BY published_at ASC`,
    [thirtyDaysAgo]
  )

  res.status(200).json({
    papers,
    total,
    page: pageNum,
    limit: limitNum,
    trendData,
  })
}
