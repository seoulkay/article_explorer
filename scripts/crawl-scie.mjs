// SCIE 저널 논문 크롤링 스크립트 (Crossref API)
// arXiv 크롤러와 병행하여 정식 출판된 AI/ML 저널 논문을 수집

import snowflake from 'snowflake-sdk'
import { randomUUID } from 'crypto'

const SF_ACCOUNT = process.env.SNOWFLAKE_ACCOUNT
const SF_USERNAME = process.env.SNOWFLAKE_USERNAME
const SF_PRIVATE_KEY = process.env.SNOWFLAKE_PRIVATE_KEY?.replace(/\\n/g, '\n')
const SF_PRIVATE_KEY_PASS = process.env.SNOWFLAKE_PRIVATE_KEY_PASSPHRASE
const SF_DATABASE = process.env.SNOWFLAKE_DATABASE
const SF_SCHEMA = process.env.SNOWFLAKE_SCHEMA
const SF_WAREHOUSE = process.env.SNOWFLAKE_WAREHOUSE
const PER_JOURNAL = parseInt(process.env.SCIE_PER_JOURNAL || '10')

snowflake.configure({ logLevel: 'ERROR' })

// ── 대상 SCIE 저널 목록 ──
const JOURNALS = [
  { issn: '0893-6080', name: 'Neural Networks' },
  { issn: '0004-3702', name: 'Artificial Intelligence' },
]

// ── Snowflake 헬퍼 (crawl.mjs와 동일) ──
function parseAccount(raw) {
  if (!raw) return {}
  const parts = raw.split('.')
  if (parts.length === 1) return { account: raw }
  return { account: parts[0], host: `${raw}.snowflakecomputing.com` }
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
    `INSERT INTO crawl_logs (id, trigger_type, target_count, status) VALUES (:1, 'scie_scheduler', :2, 'running')`,
    [logId, PER_JOURNAL * JOURNALS.length]
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
    message: `✅ SCIE 저장 ${saved}편 · 스킵 ${skipped}편 · 오류 ${errors}편`,
    details: JSON.stringify(details),
  })
}

// ── Crossref API ──
async function fetchCrossref(issn, journalName, rows = 10) {
  // 최근 14일 이내 Crossref에 인덱싱된 논문 (pub-date가 아닌 index-date 사용)
  const fromDate = new Date(Date.now() - 14 * 86400000).toISOString().slice(0, 10)
  const url = `https://api.crossref.org/works?filter=type:journal-article,from-index-date:${fromDate},issn:${issn}&sort=indexed&order=desc&rows=${rows}`

  const res = await fetch(url, {
    headers: { 'User-Agent': 'ArticleExplorer/1.0 (mailto:kay.lee@snowflake.com)' }
  })

  if (!res.ok) {
    throw new Error(`Crossref API 오류: ${res.status} ${res.statusText} (${journalName})`)
  }

  const data = await res.json()
  const items = data?.message?.items || []

  return items.map(item => {
      const authors = (item.author || []).slice(0, 5).map(a =>
        [a.given, a.family].filter(Boolean).join(' ')
      )
      const pubDate = item.published?.['date-parts']?.[0]
      const dateStr = pubDate
        ? `${pubDate[0]}-${String(pubDate[1] || 1).padStart(2, '0')}-${String(pubDate[2] || 1).padStart(2, '0')}`
        : null

      // abstract에서 HTML 태그 제거 (없으면 빈 문자열)
      const abstract = (item.abstract || '')
        .replace(/<[^>]+>/g, '')
        .replace(/\n/g, ' ')
        .trim()

      return {
        id: item.DOI,
        doi: item.DOI,
        title_en: (item.title?.[0] || '').replace(/\n/g, ' ').trim(),
        abstract_en: abstract,
        authors,
        published_at: dateStr,
        paper_url: item.URL || `https://doi.org/${item.DOI}`,
        journal_name: journalName,
      }
    })
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

// ── AI 분석 ──
async function analyzeStructured(title, abstract) {
  const abstractPart = abstract
    ? `\n초록: ${abstract}`
    : '\n(초록 미제공 - 제목으로만 분석)'
  const prompt = `다음 AI 논문을 분석해 JSON으로만 응답하세요. 마크다운 없이 순수 JSON만 출력하세요.

제목: ${title}${abstractPart}

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
  const abstractPart = abstract
    ? `\n초록: ${abstract}`
    : '\n(초록 미제공 - 제목으로만 분석)'
  const prompt = `다음 AI 논문을 고등학생도 이해할 수 있게 설명해주세요. 전문 용어는 반드시 괄호로 풀어서 설명하세요.

제목: ${title}${abstractPart}

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
  console.log(`📚 SCIE 크롤링 시작 — ${JOURNALS.length}개 저널, 저널당 ${PER_JOURNAL}편`)

  let totalSaved = 0, totalSkipped = 0, totalErrors = 0
  const allDetails = []

  for (const journal of JOURNALS) {
    console.log(`\n📖 [${journal.name}] (ISSN: ${journal.issn})`)

    let papers
    try {
      papers = await fetchCrossref(journal.issn, journal.name, PER_JOURNAL)
      console.log(`  📥 ${papers.length}편 수신 (abstract 있는 것만)`)
    } catch (e) {
      console.log(`  ❌ 수집 실패: ${e.message}`)
      totalErrors++
      allDetails.push({ journal: journal.name, error: e.message })
      continue
    }

    if (papers.length === 0) {
      console.log(`  ⏭ 논문 없음 (최근 14일 인덱싱)`)
      continue
    }

    for (let i = 0; i < papers.length; i++) {
      const paper = papers[i]
      console.log(`  [${i + 1}/${papers.length}] ${paper.title_en.slice(0, 55)}...`)

      // 중복 체크 (DOI 기반)
      const existing = await queryOne(`SELECT id FROM papers WHERE id = :1`, [paper.id])
      if (existing) {
        console.log(`  ⏭ 중복 스킵`)
        totalSkipped++
        allDetails.push({ id: paper.id, journal: journal.name, error: '중복' })
        continue
      }

      try {
        const [structured, easy] = await Promise.all([
          analyzeStructured(paper.title_en, paper.abstract_en),
          analyzeEasy(paper.title_en, paper.abstract_en),
        ])

        await mutate(
          `INSERT INTO papers (
            id, title_en, title_ko, abstract_en, summary_ko,
            key_contributions, dataset, model, performance,
            github_url, easy_explanation, paper_url,
            tags, authors, published_at, source, journal_name, doi
          ) SELECT
            :1, :2, :3, :4, :5,
            :6, :7, :8, :9,
            :10, :11, :12,
            PARSE_JSON(:13), PARSE_JSON(:14), :15::TIMESTAMP_NTZ, :16, :17, :18`,
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
            'scie',
            paper.journal_name,
            paper.doi,
          ]
        )

        totalSaved++
        console.log(`  ✅ 저장: ${structured.title_ko}`)
        allDetails.push({ id: paper.id, journal: journal.name, title_ko: structured.title_ko })

        if (totalSaved % 5 === 0) {
          await updateLog({ saved_count: totalSaved, skipped_count: totalSkipped, error_count: totalErrors })
        }

      } catch (e) {
        totalErrors++
        console.log(`  ❌ 실패: ${e.message}`)
        allDetails.push({ id: paper.id, journal: journal.name, error: e.message })
      }

      // 논문 간 2초 대기 (Cortex API 부하 방지)
      if (i < papers.length - 1) await sleep(2000)
    }

    // 저널 간 1초 대기
    await sleep(1000)
  }

  await finishLog(totalSaved, totalSkipped, totalErrors, allDetails)
  console.log(`\n🎉 SCIE 완료 — 저장 ${totalSaved}편 · 스킵 ${totalSkipped}편 · 오류 ${totalErrors}편`)
}

main().catch(async e => {
  console.error('💥 SCIE 크롤링 실패:', e.message)
  await updateLog({ status: 'failed', finished_at: new Date().toISOString(), message: `실패: ${e.message}` })
  process.exit(1)
})
