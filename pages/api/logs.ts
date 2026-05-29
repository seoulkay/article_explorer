import type { NextApiRequest, NextApiResponse } from 'next'
import { executeQuery } from '../../lib/snowflake'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const logs = await executeQuery(
    `SELECT * FROM crawl_logs ORDER BY started_at DESC LIMIT 30`
  ).catch((e: Error) => { throw e })

  res.status(200).json({ logs })
}
