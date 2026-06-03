// GitHub Actions에서 직접 실행하는 크롤링 스크립트
// Node.js 환경에서 실행되므로 환경변수를 직접 사용

import snowflake from 'snowflake-sdk'
import { parseStringPromise } from 'xml2js'
import { randomUUID } from 'crypto'

const SF_ACCOUNT = process.env.SNOWFLAKE_ACCOUNT
const SF_USERNAME = process.env.SNOWFLAKE_USERNAME
const SF_PRIVATE_KEY = process.env.SNOWFLAKE_PRIVATE_KEY?.replace(/\\n/g, '\n')
const SF_PRIVATE_KEY_PASS = process.env.SNOWFLAKE_PRIVATE_KEY_PASSPHRASE
const SF_DATABASE = process.env.SNOWFLAKE_DATABASE
const SF_SCHEMA = process.env.SNOWFLAKE_SCHEMA
const SF_WAREHOUSE = process.env.SNOWFLAKE_WAREHOUSE
const COUNT = parseInt(process.env.CRAWL_COUNT || '30')

snowflake.configure({ logLevel: 'ERROR' })

// ── Snowflake 헬퍼 ──
function parseAccount(raw) {
  // snowflake-sdk v1.15+ requires account to be a plain subdomain (no dots).
  // If the secret contains the full locator (e.g. "YOUR_ACCOUNT_LOCATOR"),
  // split it into account + host override.
  if (!raw) return {}
  const parts = raw.split('.')
  if (parts.length === 1) return { account: raw }
  // account is the first segment; reconstruct the host
  return {
    account: parts[0],
    host: `${raw}.snowflakecomputing.com`,
  }
}

function createConn() {
  const { account, host } = parseAccount(SF_ACCOUNT)
  const opts = {
    account,
    username: SF_USERNAME,
    authenticator: 'SNOWFLAKE_JWT',
    privateKey: SF_PRIVATE_KEY,
    database: SF_DATABASE,
    schema: SF_SCHEMA,
    warehouse: SF_WAREHOUSE,
  }
  if (host) opts.host = host
  if (SF_PRIVATE_KEY_PASS) opts.privateKeyPass = SF_PRIVATE_KEY_PASS
  return snowflake.createConnection(opts)
}

async function withConn(fn) {
  const conn = createConn()
  await new Promise((resolve, reject) => {
    conn.connect(err => err ? reject(err) : resolve())
  })
  try {
    return await fn(conn)
  } finally {
    conn.destroy(err => { if (err) console.error('연결 종료 오류:', err.message) })
  }
}

function normalizeRow(row) {
  const out = {}
  for (const [key, value] of Object.entries(row)) {
    const lk = key.toLowerCase()
    if (typeof value === 'string' && (value.startsWith('[') || value.startsWith('{'))) {
      try { out[lk] = JSON.parse(value) } catch { out[lk] = value }
    } else {
      out[lk] = value
    }
  }
  return out
}

async function query(sql, binds = []) {
  return withConn(conn => new Promise((resolve, reject) => {
    conn.execute({
      sqlText: sql,
      binds,
      complete: (err, _stmt, rows) => {
        if (err) reject(new Error(err.message))
        else resolve((rows || []).map(normalizeRow))
      },
    })
  }))
}

async function queryOne(sql, binds = []) {
  const rows = await query(sql, binds)
  return rows[0] ?? null
}

async function mutate(sql, binds = []) {
  await query(sql, binds)
}

const sleep = ms => new Promise(r => setTimeout(r, ms))

// ── 로그 헬퍼 ──
let logId = null

async function initLog() {
  logId = randomUUID()
  await mutate(
    `INSERT INTO crawl_logs (id, trigger_type, target_count, status) VALUES (:1, 'scheduler', :2, 'running')`,
    [logId, COUNT]
  )
  console.log(`📋 로그 ID: ${logId}`)
}

async function updateLog(patch) {
  if (!logId) return
  const keys = Object.keys(patch)
  const sets = keys.map((k, i) => `${k} = :${i + 1}`).join(', ')
  const values = [...Object.values(patch), logId]
  await mutate(`UPDATE crawl_logs SET ${sets} WHERE id = :${values.length}`, values)
}

async function finishLog(saved, skipped, errors, details) {
  await updateLog({
    status: errors > saved + skipped ? 'failed' : 'success',
    finished_at: new Date().toISOString(),
    saved_count: saved,
    skipped_count: skipped,
    error_count: errors,
    message: `✅ 저장 ${saved}편 · 스킵 ${skipped}편 · 오류 ${errors}편`,
    details: JSON.stringify(details),
  })
}

// ── arXiv 수집 ──
async function fetchArxiv(count, start) {
  const q = 'cat:cs.AI+OR+cat:cs.LG+OR+cat:cs.CV+OR+cat:cs.CL'
  const url = `https://export.arxiv.org/api/query?search_query=${q}&sortBy=submittedDate&sortOrder=descending&max_results=${count}&start=${start}`

  for (let attempt = 1; attempt <= 5; attempt++) {
    const res = await fetch(url, { headers: { 'User-Agent': 'ArxivExplorer/1.0' } })
    const text = await res.text()

    if (text.includes('Rate exceeded')) {
      const wait = attempt * 15
      console.log(`⏳ Rate limit — ${wait}초 대기 (${attempt}/5)`)
      await updateLog({ status: 'retrying', message: `Rate limit 재시도 ${attempt}/5` })
      await sleep(wait * 1000)
      continue
    }

    const parsed = await parseStringPromise(text, { explicitArray: false })
    const entries = parsed?.feed?.entry
    if (!entries) return []
    const list = Array.isArray(entries) ? entries : [entries]

    return list.map(entry => {
      const rawId = (entry.id || '').split('/abs/').pop() || ''
      const cleanId = rawId.replace(/v\d+$/, '')
      const authors = entry.author
        ? Array.isArray(entry.author) ? entry.author.map(a => a.name || '') : [entry.author.name || '']
        : []
      return {
        id: cleanId,
        title_en: (entry.title || '').replace(/\n/g, ' ').trim(),
        abstract_en: (entry.summary || '').replace(/\n/g, ' ').trim(),
        authors: authors.slice(0, 5),
        published_at: entry.published || '',
        paper_url: `https://arxiv.org/html/${cleanId}`,
      }
    })
  }
  throw new Error('arXiv Rate limit 초과 — 재시도 횟수 초과')
}

// ── Snowflake Cortex AI 분석 ──
const CORTEX_MODEL = 'mistral-large2'

async function cortexComplete(prompt) {
  const rows = await query(
    `SELECT SNOWFLAKE.CORTEX.COMPLETE(?, ?) AS result`,
    [CORTEX_MODEL, prompt]
  )
  return rows[0]?.result?.trim() ?? ''
}

// ── Claude 분석 ──
async function analyzeStructured(title, abstract) {
  const prompt = `다음 AI 논문을 분석해 JSON으로만 응답하세요. 마크다운 없이 순수 JSON만 출력하세요.

제목: ${title}
초록: ${abstract}

{
  "title_ko": "한글 번역 제목",
  "summary_ko": "핵심 내용 3줄 요약 (줄바꿈 없이 한 문단으로)",
  "key_contributions": "핵심 기여점 1-3가지 (줄바꿈 없이 한 문단으로)",
  "dataset": "사용 데이터셋 (없으면 명시되지않음)",
  "model": "제안 모델 또는 방법론 (없으면 명시되지않음)",
  "performance": "성능 수치 (없으면 명시되지않음)",
  "github_url": "초록의 GitHub URL (없으면 빈문자열)",
  "tags": ["태그1", "태그2", "태그3"]
}`

  try {
    const text = await cortexComplete(prompt)
    const match = text.match(/\{[\s\S]*\}/)
    if (!match) throw new Error('JSON 파싱 실패')
    return JSON.parse(match[0])
  } catch (e) {
    throw new Error(`구조화 분석 실패: ${e.message}`)
  }
}

async function analyzeEasy(title, abstract) {
  const prompt = `다음 AI 논문을 고등학생도 이해할 수 있게 설명해주세요. 전문 용어는 반드시 괄호로 풀어서 설명하세요.

제목: ${title}
초록: ${abstract}

아래 형식으로 작성하세요:

[한 줄 핵심 요약]
이 논문을 한 문장으로: (비유적 표현으로 핵심을 담아)

[배경: 왜 이 연구가 필요했나?]
기존 방식의 문제점과 한계를 일상적인 비유로 2-3문장으로 설명.

[핵심 아이디어 1: (제목)]
첫 번째 핵심 기여를 구체적인 예시와 비유로 2-3문장 설명.

[핵심 아이디어 2: (제목)]
두 번째 핵심 기여를 구체적인 예시와 비유로 2-3문장 설명.

[실제로 어디에 쓸 수 있나?]
실용적인 활용 사례를 2-3가지 구체적으로 설명.

[한 줄 정리]
이 연구의 의의를 비전문가도 이해할 수 있게 마무리.`

  try {
    return await cortexComplete(prompt)
  } catch {
    return '설명 생성 실패'
  }
}

// ── 메인 ──
async function main() {
  await initLog()

  const countRow = await queryOne(`SELECT COUNT(*) AS cnt FROM papers`)
  const startOffset = countRow?.cnt ?? 0
  console.log(`📊 현재 DB: ${startOffset}편, 목표 수집: ${COUNT}편 (offset: ${startOffset})`)

  const papers = await fetchArxiv(COUNT, startOffset)
  console.log(`📥 arXiv에서 ${papers.length}편 수신`)

  let saved = 0, skipped = 0, errors = 0
  const details = []

  for (let i = 0; i < papers.length; i++) {
    const paper = papers[i]
    console.log(`\n[${i + 1}/${papers.length}] ${paper.title_en.slice(0, 60)}...`)

    // 중복 체크
    const existing = await queryOne(`SELECT id FROM papers WHERE id = :1`, [paper.id])
    if (existing) {
      console.log(`⏭ 중복 스킵`)
      skipped++
      details.push({ id: paper.id, error: '중복' })
      continue
    }

    try {
      // 병렬로 분석
      const [structured, easy] = await Promise.all([
        analyzeStructured(paper.title_en, paper.abstract_en),
        analyzeEasy(paper.title_en, paper.abstract_en),
      ])

      await mutate(
        `INSERT INTO papers (
          id, title_en, title_ko, abstract_en, summary_ko,
          key_contributions, dataset, model, performance,
          github_url, easy_explanation, paper_url,
          tags, authors, published_at
        ) SELECT
          :1, :2, :3, :4, :5,
          :6, :7, :8, :9,
          :10, :11, :12,
          PARSE_JSON(:13), PARSE_JSON(:14), :15::TIMESTAMP_NTZ`,
        [
          paper.id,
          paper.title_en,
          structured.title_ko,
          paper.abstract_en,
          structured.summary_ko,
          structured.key_contributions,
          structured.dataset,
          structured.model,
          structured.performance,
          structured.github_url || null,
          easy || null,
          paper.paper_url,
          JSON.stringify(structured.tags),
          JSON.stringify(paper.authors),
          paper.published_at,
        ]
      )

      saved++
      console.log(`✅ 저장: ${structured.title_ko}`)
      details.push({ id: paper.id, title_ko: structured.title_ko })

      // 5편마다 로그 업데이트
      if (saved % 5 === 0) {
        await updateLog({ saved_count: saved, skipped_count: skipped, error_count: errors })
      }

    } catch (e) {
      errors++
      console.log(`❌ 실패: ${e.message}`)
      details.push({ id: paper.id, error: e.message })
    }

    // 논문 간 3초 대기
    if (i < papers.length - 1) await sleep(3000)
  }

  await finishLog(saved, skipped, errors, details)
  console.log(`\n🎉 완료 — 저장 ${saved}편 · 스킵 ${skipped}편 · 오류 ${errors}편`)
}

main().catch(async e => {
  console.error('💥 크롤링 실패:', e.message)
  await updateLog({ status: 'failed', finished_at: new Date().toISOString(), message: `실패: ${e.message}` })
  process.exit(1)
})
