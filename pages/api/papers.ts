import type { NextApiRequest, NextApiResponse } from 'next'
import { supabaseAdmin } from '../../lib/supabase'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const { tag, q, page = '1', limit = '20' } = req.query
  const pageNum = parseInt(page as string)
  const limitNum = parseInt(limit as string)
  const offset = (pageNum - 1) * limitNum

  let query = supabaseAdmin
    .from('papers')
    .select('*', { count: 'exact' })
    .order('published_at', { ascending: false })
    .range(offset, offset + limitNum - 1)

  if (tag && tag !== '전체') {
    query = query.contains('tags', [tag])
  }

  if (q) {
    query = query.or(`title_ko.ilike.%${q}%,title_en.ilike.%${q}%,summary_ko.ilike.%${q}%`)
  }

  const { data, error, count } = await query

  if (error) return res.status(500).json({ error: error.message })

  res.status(200).json({ papers: data, total: count, page: pageNum, limit: limitNum })
}
