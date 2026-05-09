import type { NextApiRequest, NextApiResponse } from 'next'
import { supabaseAdmin } from '../../lib/supabase'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const { data, error } = await supabaseAdmin
    .from('crawl_logs')
    .select('*')
    .order('started_at', { ascending: false })
    .limit(30)

  if (error) return res.status(500).json({ error: error.message })
  res.status(200).json({ logs: data })
}
