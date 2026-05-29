import type { NextApiRequest, NextApiResponse } from 'next'
import { randomUUID } from 'crypto'
import { runCrawl } from '../../lib/crawler'
import { executeOne, executeMutation } from '../../lib/snowflake'

// Vercel 함수 최대 실행시간 (Pro: 300초, Hobby: 60초)
export const config = { maxDuration: 300 }

// Vercel Cron 또는 외부 스케줄러에서 호출
// Vercel cron: vercel.json에 설정
// 외부: cron-job.org 등에서 매일 새벽 3시에 POST 요청

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST' && req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  // Vercel cron secret 또는 수동 secret 체크
  const authHeader = req.headers.authorization
  const cronSecret = process.env.CRON_SECRET || process.env.CRAWL_SECRET
  const provided = authHeader?.replace('Bearer ', '') || req.query.secret

  if (provided !== cronSecret) {
    return res.status(401).json({ error: '인증 실패' })
  }

  // 오늘 이미 실행했는지 체크 (중복 실행 방지)
  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)

  const todayLog = await executeOne<{ id: string; status: string; saved_count: number }>(
    `SELECT id, status, saved_count FROM crawl_logs
     WHERE trigger_type = 'scheduler'
       AND started_at >= :1::TIMESTAMP_NTZ
       AND status = 'success'
     LIMIT 1`,
    [todayStart.toISOString()]
  )

  if (todayLog) {
    return res.status(200).json({
      skipped: true,
      message: `오늘 이미 실행됨 (저장 ${todayLog.saved_count}편)`,
    })
  }

  // 로그 생성 (UUID를 클라이언트에서 생성)
  const logId = randomUUID()
  try {
    await executeMutation(
      `INSERT INTO crawl_logs (id, trigger_type, target_count, status)
       VALUES (:1, 'scheduler', 30, 'running')`,
      [logId]
    )
  } catch (e: any) {
    return res.status(500).json({ error: '로그 생성 실패' })
  }

  // Vercel은 함수 실행시간 제한이 있어서 응답 먼저 보내고 백그라운드 실행
  res.status(200).json({ success: true, log_id: logId, message: '스케줄러 실행 시작' })

  // 백그라운드에서 크롤링 실행
  try {
    const result = await runCrawl(30, logId)
    await executeMutation(
      `UPDATE crawl_logs SET
        status = 'success',
        finished_at = CURRENT_TIMESTAMP(),
        saved_count = :1,
        skipped_count = :2,
        error_count = :3,
        message = :4,
        details = PARSE_JSON(:5)
       WHERE id = :6`,
      [
        result.saved,
        result.skipped,
        result.errors,
        `✅ 스케줄 완료 — 저장 ${result.saved}편 · 스킵 ${result.skipped}편 · 오류 ${result.errors}편`,
        JSON.stringify(result.details),
        logId,
      ]
    )
  } catch (e: any) {
    await executeMutation(
      `UPDATE crawl_logs SET
        status = 'failed',
        finished_at = CURRENT_TIMESTAMP(),
        message = :1
       WHERE id = :2`,
      [`❌ 실패: ${e.message}`, logId]
    )
  }
}
