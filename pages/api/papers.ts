import type { NextApiRequest, NextApiResponse } from 'next'
import { supabaseAdmin } from '../../lib/supabase'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const { tag, q, page = '1', limit = '20', showFailed = 'false' } = req.query
  const pageNum = parseInt(page as string)
  const limitNum = parseInt(limit as string)
  const offset = (pageNum - 1) * limitNum

  let query = supabaseAdmin
    .from('papers')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false }) // 수집 순서대로
    .range(offset, offset + limitNum - 1)

  // 분석 실패 숨기기 (기본값)
  if (showFailed !== 'true') {
    query = query.not('summary_ko', 'ilike', '%분석 실패%')
    query = query.not('summary_ko', 'ilike', '%생성할 수 없%')
    query = query.not('title_ko', 'eq', '')
  }

  if (tag && tag !== '전체') {
    query = query.contains('tags', [tag])
  }

  if (q) {
    query = query.or(`title_ko.ilike.%${q}%,title_en.ilike.%${q}%,summary_ko.ilike.%${q}%`)
  }

  const { data, error, count } = await query
  if (error) return res.status(500).json({ error: error.message })

  // 분야별 날짜 트렌드 데이터 (차트용) - 최근 30일
  const { data: trendData } = await supabaseAdmin
    .from('papers')
    .select('tags, published_at')
    .gte('published_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
    .order('published_at', { ascending: true })

  res.status(200).json({
    papers: data,
    total: count,
    page: pageNum,
    limit: limitNum,
    trendData: trendData || [],
  })
}
