import { fetchArxivPapers } from './arxiv'
import { analyzePaper } from './analyzer'
import { supabaseAdmin } from './supabase'

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

export interface CrawlResult {
  saved: number
  skipped: number
  errors: number
  details: { id: string; title_ko?: string; error?: string }[]
}

// 논문 한 편 저장
async function savePaper(paper: any): Promise<{ ok: boolean; title_ko?: string; error?: string }> {
  // 중복 체크
  const { data: existing } = await supabaseAdmin
    .from('papers').select('id').eq('id', paper.id).maybeSingle()
  if (existing) return { ok: false, error: 'duplicate' }

  // Claude 분석
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
  if (error) throw new Error(error.message)
  return { ok: true, title_ko: analysis.title_ko }
}

// 메인 크롤링 함수 (재시도 포함)
export async function runCrawl(
  count: number,
  logId: number,
  onProgress?: (msg: string) => void
): Promise<CrawlResult> {
  const log = (msg: string) => {
    console.log(msg)
    onProgress?.(msg)
  }

  const result: CrawlResult = { saved: 0, skipped: 0, errors: 0, details: [] }

  // DB 논문 수로 오프셋 계산
  const { count: dbCount } = await supabaseAdmin
    .from('papers').select('*', { count: 'exact', head: true })
  const startOffset = dbCount || 0

  log(`📥 arXiv 수집 시작 (offset: ${startOffset}, 목표: ${count}편)`)

  // 로그 업데이트 helper
  const updateLog = async (patch: object) => {
    await supabaseAdmin.from('crawl_logs').update(patch).eq('id', logId)
  }

  // arXiv에서 논문 목록 가져오기 (Rate limit 재시도 포함)
  let papers: any[] = []
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      papers = await fetchArxivPapers(count, startOffset)
      log(`✅ arXiv에서 ${papers.length}편 목록 수신`)
      break
    } catch (e: any) {
      if (e.message?.includes('Rate') && attempt < 5) {
        const wait = attempt * 15 // 15초, 30초, 45초, 60초
        log(`⏳ Rate limit — ${wait}초 대기 후 재시도 (${attempt}/5)`)
        await updateLog({ status: 'retrying', message: `Rate limit 재시도 ${attempt}/5` })
        await sleep(wait * 1000)
        continue
      }
      throw e
    }
  }

  // 논문별 분석 & 저장
  for (let i = 0; i < papers.length; i++) {
    const paper = papers[i]

    // 논문당 최대 3번 재시도
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const r = await savePaper(paper)
        if (r.error === 'duplicate') {
          result.skipped++
          log(`⏭ [${i + 1}/${papers.length}] 중복 스킵: ${paper.id}`)
          result.details.push({ id: paper.id, error: '중복' })
        } else {
          result.saved++
          log(`✓ [${i + 1}/${papers.length}] 저장: ${r.title_ko}`)
          result.details.push({ id: paper.id, title_ko: r.title_ko })
        }

        // 진행상황 로그 업데이트 (5편마다)
        if ((result.saved + result.skipped) % 5 === 0) {
          await updateLog({ saved_count: result.saved, skipped_count: result.skipped, error_count: result.errors })
        }
        break

      } catch (e: any) {
        const isRateLimit = e.message?.includes('Rate') || e.message?.includes('429')
        if (isRateLimit && attempt < 3) {
          const wait = attempt * 20
          log(`⏳ [${i + 1}] Rate limit — ${wait}초 대기 후 재시도`)
          await updateLog({ status: 'retrying', message: `논문 ${paper.id} rate limit 재시도 ${attempt}/3` })
          await sleep(wait * 1000)
          continue
        }
        result.errors++
        log(`✗ [${i + 1}/${papers.length}] 실패: ${paper.id} — ${e.message}`)
        result.details.push({ id: paper.id, error: e.message })
        break
      }
    }

    // 논문 간 간격 (arXiv 권장: 3초, Claude API 부하 방지)
    if (i < papers.length - 1) await sleep(3000)
  }

  return result
}
