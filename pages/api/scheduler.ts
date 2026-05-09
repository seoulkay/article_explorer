import type { NextApiRequest, NextApiResponse } from 'next'
import { runCrawl } from '../../lib/crawler'
import { supabaseAdmin } from '../../lib/supabase'

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

  const { data: todayLog } = await supabaseAdmin
    .from('crawl_logs')
    .select('id, status, saved_count')
    .eq('trigger', 'scheduler')
    .gte('started_at', todayStart.toISOString())
    .eq('status', 'success')
    .maybeSingle()

  if (todayLog) {
    return res.status(200).json({
      skipped: true,
      message: `오늘 이미 실행됨 (저장 ${todayLog.saved_count}편)`,
    })
  }

  // 로그 생성
  const { data: log, error: logErr } = await supabaseAdmin
    .from('crawl_logs')
    .insert({ trigger: 'scheduler', target_count: 30, status: 'running' })
    .select().single()

  if (logErr || !log) {
    return res.status(500).json({ error: '로그 생성 실패' })
  }

  // Vercel은 함수 실행시간 제한이 있어서 응답 먼저 보내고 백그라운드 실행
  res.status(200).json({ success: true, log_id: log.id, message: '스케줄러 실행 시작' })

  // 백그라운드에서 크롤링 실행
  try {
    const result = await runCrawl(30, log.id)
    await supabaseAdmin.from('crawl_logs').update({
      status: 'success',
      finished_at: new Date().toISOString(),
      saved_count: result.saved,
      skipped_count: result.skipped,
      error_count: result.errors,
      message: `✅ 스케줄 완료 — 저장 ${result.saved}편 · 스킵 ${result.skipped}편 · 오류 ${result.errors}편`,
      details: result.details,
    }).eq('id', log.id)
  } catch (e: any) {
    await supabaseAdmin.from('crawl_logs').update({
      status: 'failed',
      finished_at: new Date().toISOString(),
      message: `❌ 실패: ${e.message}`,
    }).eq('id', log.id)
  }
}
