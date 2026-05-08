import React, { useState, useEffect, useCallback, useMemo } from 'react'
import Head from 'next/head'

interface Paper {
  id: string
  title_en: string
  title_ko: string
  summary_ko: string
  key_contributions: string
  dataset: string
  model: string
  performance: string
  github_url: string
  paper_url: string
  tags: string[]
  authors: string[]
  published_at: string
  created_at: string
  easy_explanation: string
}

const ALL_TAGS = ['전체', 'NLP', '컴퓨터비전', '강화학습', '생성모델', '멀티모달', '추천시스템', '의료AI', '그래프신경망', '자율주행']
const TAG_COLORS: Record<string, string> = {
  'NLP': '#6366f1', '컴퓨터비전': '#a855f7', '강화학습': '#ec4899',
  '생성모델': '#f59e0b', '멀티모달': '#10b981', '추천시스템': '#3b82f6',
  '의료AI': '#ef4444', '그래프신경망': '#8b5cf6', '자율주행': '#06b6d4',
}

// ─── EasyExplain 컴포넌트 ───
function EasyExplain({ text }: { text: string }) {
  const [open, setOpen] = useState(false)
  const renderSections = (raw: string) => {
    const lines = raw.split('\n')
    const elements: React.ReactNode[] = []
    let key = 0
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed) {
        elements.push(<div key={key++} style={{ height: 8 }} />)
      } else if (trimmed.startsWith('[') && trimmed.includes(']')) {
        const title = trimmed.replace(/^\[/, '').replace(/\].*$/, '')
        const rest = trimmed.replace(/^\[[^\]]+\]\s*/, '')
        elements.push(
          <div key={key++} style={{ marginTop: 16, marginBottom: 6 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: '#f59e0b', background: 'rgba(245,158,11,0.1)', padding: '3px 10px', borderRadius: 6 }}>{title}</span>
            {rest && <p style={{ fontSize: 13, color: '#d1fae5', lineHeight: 1.85, marginTop: 8 }}>{rest}</p>}
          </div>
        )
      } else {
        elements.push(<p key={key++} style={{ fontSize: 13, color: '#ccc', lineHeight: 1.85 }}>{trimmed}</p>)
      }
    }
    return elements
  }
  return (
    <div style={{ marginBottom: 20, border: '1px solid #2a2a1a', borderRadius: 12, overflow: 'hidden' }}>
      <button onClick={() => setOpen(o => !o)} style={{ width: '100%', padding: '12px 16px', background: '#1a1a0e', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontFamily: 'inherit' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 16 }}>🎓</span>
          <span style={{ fontSize: 12, color: '#f59e0b', fontWeight: 600 }}>쉬운 설명</span>
          <span style={{ fontSize: 11, color: '#666' }}>— 비전문가도 이해할 수 있어요</span>
        </div>
        <span style={{ fontSize: 11, color: '#666', display: 'inline-block', transform: open ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}>▼</span>
      </button>
      {open && (
        <div style={{ padding: '16px 20px 20px', background: '#0e0e08', borderTop: '1px solid #2a2a1a' }}>
          {renderSections(text)}
        </div>
      )}
    </div>
  )
}

// ─── 트렌드 차트 컴포넌트 ───
function TrendChart({ trendData }: { trendData: { tags: string[], published_at: string }[] }) {
  const [open, setOpen] = useState(false)

  const chartData = useMemo(() => {
    if (!trendData.length) return { dates: [], series: [] }
    // 날짜별 태그 카운트
    const dateMap: Record<string, Record<string, number>> = {}
    trendData.forEach(p => {
      const date = p.published_at?.slice(0, 10) || ''
      if (!date) return
      if (!dateMap[date]) dateMap[date] = {}
      ;(p.tags || []).forEach(tag => {
        dateMap[date][tag] = (dateMap[date][tag] || 0) + 1
      })
    })
    const dates = Object.keys(dateMap).sort()
    const topTags = ['NLP', '컴퓨터비전', '강화학습', '생성모델', '멀티모달']
    const series = topTags.map(tag => ({
      tag,
      color: TAG_COLORS[tag] || '#888',
      values: dates.map(d => dateMap[d]?.[tag] || 0),
    }))
    return { dates, series }
  }, [trendData])

  if (!chartData.dates.length) return null

  const W = 700, H = 200, PAD = { top: 20, right: 120, bottom: 40, left: 40 }
  const innerW = W - PAD.left - PAD.right
  const innerH = H - PAD.top - PAD.bottom
  const maxVal = Math.max(...chartData.series.flatMap(s => s.values), 1)
  const xStep = chartData.dates.length > 1 ? innerW / (chartData.dates.length - 1) : innerW

  const toPath = (values: number[]) =>
    values.map((v, i) => {
      const x = PAD.left + i * xStep
      const y = PAD.top + innerH - (v / maxVal) * innerH
      return `${i === 0 ? 'M' : 'L'} ${x} ${y}`
    }).join(' ')

  // x축 날짜 레이블 (5개만)
  const labelIdxs = chartData.dates.length <= 5
    ? chartData.dates.map((_, i) => i)
    : [0, Math.floor(chartData.dates.length * 0.25), Math.floor(chartData.dates.length * 0.5), Math.floor(chartData.dates.length * 0.75), chartData.dates.length - 1]

  return (
    <div style={{ background: '#111122', border: '1px solid #1e1e2e', borderRadius: 16, marginBottom: 24, overflow: 'hidden' }}>
      <button onClick={() => setOpen(o => !o)} style={{ width: '100%', padding: '14px 20px', background: 'transparent', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontFamily: 'inherit' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 14 }}>📊</span>
          <span style={{ fontSize: 13, fontWeight: 600, color: '#e2e2e8' }}>분야별 논문 트렌드</span>
          <span style={{ fontSize: 11, color: '#555' }}>최근 30일</span>
        </div>
        <span style={{ fontSize: 11, color: '#555', display: 'inline-block', transform: open ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}>▼</span>
      </button>
      {open && (
        <div style={{ padding: '0 20px 20px', overflowX: 'auto' }}>
          <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', minWidth: 400, height: 'auto' }}>
            {/* 배경 그리드 */}
            {[0, 0.25, 0.5, 0.75, 1].map(r => (
              <line key={r} x1={PAD.left} y1={PAD.top + innerH * (1 - r)} x2={PAD.left + innerW} y2={PAD.top + innerH * (1 - r)} stroke="#1e1e2e" strokeWidth="1" />
            ))}
            {/* Y축 레이블 */}
            {[0, 0.5, 1].map(r => (
              <text key={r} x={PAD.left - 6} y={PAD.top + innerH * (1 - r) + 4} textAnchor="end" fontSize="10" fill="#555">{Math.round(maxVal * r)}</text>
            ))}
            {/* X축 레이블 */}
            {labelIdxs.map(i => (
              <text key={i} x={PAD.left + i * xStep} y={H - 8} textAnchor="middle" fontSize="9" fill="#555">
                {chartData.dates[i]?.slice(5)}
              </text>
            ))}
            {/* 선 그래프 */}
            {chartData.series.map(s => (
              <path key={s.tag} d={toPath(s.values)} fill="none" stroke={s.color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" opacity="0.85" />
            ))}
            {/* 범례 */}
            {chartData.series.map((s, i) => (
              <g key={s.tag} transform={`translate(${W - PAD.right + 12}, ${PAD.top + i * 22})`}>
                <line x1="0" y1="6" x2="16" y2="6" stroke={s.color} strokeWidth="2" />
                <text x="20" y="10" fontSize="11" fill="#aaa">{s.tag}</text>
              </g>
            ))}
          </svg>
        </div>
      )}
    </div>
  )
}

// ─── 메인 ───
export default function Home() {
  const [papers, setPapers] = useState<Paper[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(false)
  const [crawling, setCrawling] = useState(false)
  const [selectedTag, setSelectedTag] = useState('전체')
  const [query, setQuery] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [selectedPaper, setSelectedPaper] = useState<Paper | null>(null)
  const [crawlSecret, setCrawlSecret] = useState('')
  const [crawlCount, setCrawlCount] = useState(10)
  const [crawlResult, setCrawlResult] = useState<any>(null)
  const [showCrawlPanel, setShowCrawlPanel] = useState(false)
  const [showFailed, setShowFailed] = useState(false)
  const [trendData, setTrendData] = useState<any[]>([])

  const fetchPapers = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        page: String(page), limit: '20',
        showFailed: String(showFailed),
        ...(selectedTag !== '전체' && { tag: selectedTag }),
        ...(query && { q: query }),
      })
      const res = await fetch(`/api/papers?${params}`)
      const data = await res.json()
      setPapers(data.papers || [])
      setTotal(data.total || 0)
      if (data.trendData) setTrendData(data.trendData)
    } finally {
      setLoading(false)
    }
  }, [page, selectedTag, query, showFailed])

  useEffect(() => { fetchPapers() }, [fetchPapers])

  const handleCrawl = async () => {
    setCrawling(true); setCrawlResult(null)
    try {
      const res = await fetch('/api/crawl', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ secret: crawlSecret, count: crawlCount }),
      })
      const data = await res.json()
      setCrawlResult(data)
      if (data.success) fetchPapers()
    } catch (e: any) {
      setCrawlResult({ error: e.message })
    } finally {
      setCrawling(false)
    }
  }

  const handleSearch = () => { setQuery(searchInput); setPage(1) }
  const fmtDate = (d: string) => d ? new Date(d).toLocaleDateString('ko-KR') : ''
  const totalPages = Math.ceil(total / 20)
  const isFailed = (p: Paper) => !p.summary_ko || p.summary_ko.includes('분석 실패') || p.summary_ko.includes('생성할 수 없')

  return (
    <>
      <Head><title>AI 논문 탐색기</title></Head>

      <div style={{ minHeight: '100vh', background: '#0a0a0f' }}>
        {/* 헤더 */}
        <header style={{ borderBottom: '1px solid #1e1e2e', padding: '0 2rem', height: 56, display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, background: '#0a0a0f', zIndex: 100 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 28, height: 28, background: 'linear-gradient(135deg, #6366f1, #a855f7)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14 }}>✦</div>
            <span style={{ fontWeight: 600, fontSize: 15, letterSpacing: '-0.02em' }}>AI 논문 탐색기</span>
            <span className="mono" style={{ fontSize: 11, color: '#6366f1', background: '#1e1e3f', padding: '2px 8px', borderRadius: 4 }}>arXiv · SCIE</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 12, color: '#666' }}>총 {total.toLocaleString()}편</span>
            <button onClick={() => setShowCrawlPanel(!showCrawlPanel)} style={{ height: 32, padding: '0 14px', background: '#6366f1', border: 'none', borderRadius: 8, color: 'white', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>+ 논문 수집</button>
          </div>
        </header>

        {/* 수집 패널 */}
        {showCrawlPanel && (
          <div style={{ background: '#111122', borderBottom: '1px solid #1e1e2e', padding: '1.5rem 2rem' }}>
            <div style={{ maxWidth: 800, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <div>
                <div style={{ fontSize: 11, color: '#888', marginBottom: 6 }}>관리자 키</div>
                <input type="password" value={crawlSecret} onChange={e => setCrawlSecret(e.target.value)} placeholder=".env의 CRAWL_SECRET" style={{ height: 36, padding: '0 12px', background: '#1a1a2e', border: '1px solid #2e2e4e', borderRadius: 8, color: '#e2e2e8', fontSize: 13, fontFamily: 'inherit', width: 200 }} />
              </div>
              <div>
                <div style={{ fontSize: 11, color: '#888', marginBottom: 6 }}>수집 편수</div>
                <input type="number" value={crawlCount} onChange={e => setCrawlCount(Number(e.target.value))} min={1} max={50} style={{ height: 36, padding: '0 12px', background: '#1a1a2e', border: '1px solid #2e2e4e', borderRadius: 8, color: '#e2e2e8', fontSize: 13, fontFamily: 'inherit', width: 80 }} />
              </div>
              <button onClick={handleCrawl} disabled={crawling} style={{ height: 36, padding: '0 20px', background: crawling ? '#333' : 'linear-gradient(135deg, #6366f1, #a855f7)', border: 'none', borderRadius: 8, color: 'white', fontSize: 13, cursor: crawling ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
                {crawling ? '수집 중...' : 'arXiv 수집 시작'}
              </button>
              {crawlResult && (
                <div style={{ fontSize: 12, padding: '8px 12px', background: crawlResult.error ? '#2e1111' : '#112e11', borderRadius: 8, color: crawlResult.error ? '#f87171' : '#86efac' }}>
                  {crawlResult.error ? `오류: ${crawlResult.error}` : `저장 ${crawlResult.saved}편 · 스킵 ${crawlResult.skipped}편 · 오류 ${crawlResult.errors}편`}
                </div>
              )}
            </div>
          </div>
        )}

        <main style={{ maxWidth: 1200, margin: '0 auto', padding: '2rem' }}>

          {/* 트렌드 차트 */}
          <TrendChart trendData={trendData} />

          {/* 검색 + 필터 옵션 */}
          <div style={{ marginBottom: '1rem', display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <input
              value={searchInput} onChange={e => setSearchInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSearch()}
              placeholder="논문 제목, 요약 검색..."
              style={{ flex: 1, minWidth: 200, height: 44, padding: '0 16px', background: '#111122', border: '1px solid #2e2e4e', borderRadius: 12, color: '#e2e2e8', fontSize: 14, fontFamily: 'inherit', outline: 'none' }}
            />
            <button onClick={handleSearch} style={{ height: 44, padding: '0 20px', background: '#6366f1', border: 'none', borderRadius: 12, color: 'white', fontSize: 14, cursor: 'pointer', fontFamily: 'inherit' }}>검색</button>
            {query && <button onClick={() => { setQuery(''); setSearchInput(''); setPage(1) }} style={{ height: 44, padding: '0 16px', background: '#1e1e2e', border: '1px solid #2e2e4e', borderRadius: 12, color: '#888', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>초기화</button>}
            {/* 분석실패 토글 */}
            <button
              onClick={() => { setShowFailed(v => !v); setPage(1) }}
              style={{ height: 44, padding: '0 16px', background: showFailed ? '#2e1111' : '#1a1a2e', border: `1px solid ${showFailed ? '#ef4444' : '#2e2e4e'}`, borderRadius: 12, color: showFailed ? '#f87171' : '#555', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}
            >
              {showFailed ? '⚠️ 분석실패 포함 중' : '분석실패 숨김'}
            </button>
          </div>

          {/* 태그 필터 */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: '1.5rem' }}>
            {ALL_TAGS.map(tag => (
              <button key={tag} onClick={() => { setSelectedTag(tag); setPage(1) }}
                style={{ height: 30, padding: '0 14px', background: selectedTag === tag ? (TAG_COLORS[tag] || '#6366f1') : '#1a1a2e', border: `1px solid ${selectedTag === tag ? (TAG_COLORS[tag] || '#6366f1') : '#2e2e4e'}`, borderRadius: 20, color: selectedTag === tag ? 'white' : '#888', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s' }}>
                {tag}
              </button>
            ))}
          </div>

          {loading && <div style={{ textAlign: 'center', padding: '4rem', color: '#666', fontSize: 13 }}>논문 불러오는 중...</div>}

          {!loading && papers.length === 0 && (
            <div style={{ textAlign: 'center', padding: '4rem', color: '#666' }}>
              <div style={{ fontSize: 32, marginBottom: 12 }}>📄</div>
              <div style={{ fontSize: 14 }}>논문이 없어요. 위에서 arXiv 수집을 해보세요!</div>
            </div>
          )}

          {/* 논문 그리드 */}
          {!loading && papers.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: 16 }}>
              {papers.map(paper => (
                <div key={paper.id} onClick={() => setSelectedPaper(paper)}
                  style={{ background: isFailed(paper) ? '#1a1010' : '#111122', border: `1px solid ${isFailed(paper) ? '#3e1e1e' : '#1e1e2e'}`, borderRadius: 16, padding: '1.25rem', cursor: 'pointer', transition: 'border-color 0.15s', position: 'relative' }}
                  onMouseEnter={e => (e.currentTarget.style.borderColor = isFailed(paper) ? '#ef4444' : '#6366f1')}
                  onMouseLeave={e => (e.currentTarget.style.borderColor = isFailed(paper) ? '#3e1e1e' : '#1e1e2e')}
                >
                  {isFailed(paper) && (
                    <div style={{ position: 'absolute', top: 10, right: 10, fontSize: 10, color: '#ef4444', background: '#2e1111', padding: '2px 6px', borderRadius: 4 }}>⚠️ 분석실패</div>
                  )}
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
                    {(paper.tags || []).slice(0, 3).map(tag => (
                      <span key={tag} style={{ fontSize: 10, padding: '2px 8px', background: '#1e1e3f', color: TAG_COLORS[tag] || '#818cf8', borderRadius: 4 }}>{tag}</span>
                    ))}
                  </div>
                  <h3 style={{ fontSize: 14, fontWeight: 600, lineHeight: 1.5, marginBottom: 8, color: '#e2e2e8' }}>{paper.title_ko || paper.title_en}</h3>
                  <p style={{ fontSize: 11, color: '#555', marginBottom: 10, fontStyle: 'italic' }}>{paper.title_en.slice(0, 80)}{paper.title_en.length > 80 ? '...' : ''}</p>
                  <p style={{ fontSize: 12, color: '#888', lineHeight: 1.6, marginBottom: 12 }}>{(paper.summary_ko || '').split('\n')[0]}</p>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span className="mono" style={{ fontSize: 10, color: '#555' }}>{fmtDate(paper.published_at)}</span>
                    <div style={{ display: 'flex', gap: 8 }}>
                      {paper.github_url && <span style={{ fontSize: 10, color: '#6366f1' }}>GitHub ↗</span>}
                      {paper.performance && paper.performance !== '명시되지 않음' && (
                        <span style={{ fontSize: 10, color: '#86efac', background: '#112e11', padding: '2px 6px', borderRadius: 4 }}>{paper.performance.slice(0, 20)}</span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* 페이지네이션 */}
          {totalPages > 1 && (
            <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: '2rem' }}>
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} style={{ height: 36, padding: '0 16px', background: '#1a1a2e', border: '1px solid #2e2e4e', borderRadius: 8, color: page === 1 ? '#444' : '#888', fontSize: 13, cursor: page === 1 ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>← 이전</button>
              <span style={{ height: 36, display: 'flex', alignItems: 'center', fontSize: 13, color: '#666' }}>{page} / {totalPages}</span>
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} style={{ height: 36, padding: '0 16px', background: '#1a1a2e', border: '1px solid #2e2e4e', borderRadius: 8, color: page === totalPages ? '#444' : '#888', fontSize: 13, cursor: page === totalPages ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>다음 →</button>
            </div>
          )}
        </main>
      </div>

      {/* 논문 상세 모달 */}
      {selectedPaper && (
        <div onClick={() => setSelectedPaper(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#111122', border: '1px solid #2e2e4e', borderRadius: 20, maxWidth: 720, width: '100%', maxHeight: '85vh', overflow: 'auto', padding: '2rem' }}>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
              {(selectedPaper.tags || []).map(tag => (
                <span key={tag} style={{ fontSize: 11, padding: '3px 10px', background: '#1e1e3f', color: TAG_COLORS[tag] || '#818cf8', borderRadius: 6 }}>{tag}</span>
              ))}
            </div>
            <h2 style={{ fontSize: 18, fontWeight: 600, lineHeight: 1.5, marginBottom: 6 }}>{selectedPaper.title_ko}</h2>
            <p style={{ fontSize: 12, color: '#555', fontStyle: 'italic', marginBottom: 20 }}>{selectedPaper.title_en}</p>
            {[
              { label: '📝 3줄 요약', value: selectedPaper.summary_ko, multiline: true },
              { label: '💡 핵심 기여점', value: selectedPaper.key_contributions },
              { label: '🗂 사용 데이터셋', value: selectedPaper.dataset },
              { label: '🤖 사용 모델', value: selectedPaper.model },
              { label: '📈 성능 향상', value: selectedPaper.performance },
            ].map(({ label, value, multiline }) => (
              <div key={label} style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 11, color: '#6366f1', fontWeight: 600, marginBottom: 6, letterSpacing: '0.05em' }}>{label}</div>
                <div style={{ fontSize: 13, color: '#ccc', lineHeight: 1.7, whiteSpace: multiline ? 'pre-line' : 'normal' }}>{value || '명시되지 않음'}</div>
              </div>
            ))}
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 11, color: '#6366f1', fontWeight: 600, marginBottom: 6 }}>👤 저자</div>
              <div style={{ fontSize: 12, color: '#888' }}>{(selectedPaper.authors || []).join(', ')}</div>
            </div>
            {selectedPaper.easy_explanation && !selectedPaper.easy_explanation.includes('실패') && (
              <EasyExplain text={selectedPaper.easy_explanation} />
            )}
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <a href={selectedPaper.paper_url.replace(/_$/, '')} target="_blank" rel="noopener noreferrer" style={{ height: 38, padding: '0 18px', background: '#6366f1', borderRadius: 10, color: 'white', fontSize: 13, display: 'flex', alignItems: 'center', textDecoration: 'none' }}>📖 arXiv HTML 보기</a>
              {selectedPaper.github_url && (
                <a href={selectedPaper.github_url} target="_blank" rel="noopener noreferrer" style={{ height: 38, padding: '0 18px', background: '#1a1a2e', border: '1px solid #2e2e4e', borderRadius: 10, color: '#e2e2e8', fontSize: 13, display: 'flex', alignItems: 'center', textDecoration: 'none' }}>⚡ GitHub 코드</a>
              )}
              <button onClick={() => setSelectedPaper(null)} style={{ height: 38, padding: '0 18px', background: 'transparent', border: '1px solid #2e2e4e', borderRadius: 10, color: '#666', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', marginLeft: 'auto' }}>닫기</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
