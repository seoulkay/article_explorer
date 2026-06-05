import React, { useState, useEffect, useCallback, useMemo } from 'react'
import Head from 'next/head'

interface Paper {
  id: string; title_en: string; title_ko: string; summary_ko: string
  key_contributions: string; dataset: string; model: string; performance: string
  github_url: string; paper_url: string; tags: string[]; authors: string[]
  published_at: string; created_at: string; easy_explanation: string
  source: string; journal_name: string; doi: string
}
interface CrawlLog {
  id: string; trigger_type: string; target_count: number; saved_count: number
  skipped_count: number; error_count: number; status: string; message: string
  started_at: string; finished_at: string; details: any[]
}

const ALL_TAGS = ['전체','NLP','컴퓨터비전','강화학습','생성모델','멀티모달','추천시스템','의료AI','그래프신경망','자율주행']
const TAG_COLORS: Record<string,string> = {
  'NLP':'#6366f1','컴퓨터비전':'#a855f7','강화학습':'#ec4899','생성모델':'#f59e0b',
  '멀티모달':'#10b981','추천시스템':'#3b82f6','의료AI':'#ef4444','그래프신경망':'#8b5cf6','자율주행':'#06b6d4',
}

// ── EasyExplain ──
function EasyExplain({ text }: { text: string }) {
  const [open, setOpen] = useState(true)
  const renderSections = (raw: string) => {
    const lines = raw.split('\n'); const els: React.ReactNode[] = []; let k = 0
    for (const line of lines) {
      const t = line.trim()
      if (!t) { els.push(<div key={k++} style={{height:8}}/>) }
      else if (t.startsWith('[') && t.includes(']')) {
        const title = t.replace(/^\[/,'').replace(/\].*$/,'')
        const rest = t.replace(/^\[[^\]]+\]\s*/,'')
        els.push(<div key={k++} style={{marginTop:16,marginBottom:6}}>
          <span style={{fontSize:11,fontWeight:700,color:'#f59e0b',background:'rgba(245,158,11,0.1)',padding:'3px 10px',borderRadius:6}}>{title}</span>
          {rest && <p style={{fontSize:13,color:'#d1fae5',lineHeight:1.85,marginTop:8}}>{rest}</p>}
        </div>)
      } else { els.push(<p key={k++} style={{fontSize:13,color:'#ccc',lineHeight:1.85}}>{t}</p>) }
    }
    return els
  }
  return (
    <div style={{marginBottom:20,border:'1px solid #2a2a1a',borderRadius:12,overflow:'hidden'}}>
      <button onClick={()=>setOpen(o=>!o)} style={{width:'100%',padding:'12px 16px',background:'#1a1a0e',border:'none',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'space-between',fontFamily:'inherit'}}>
        <div style={{display:'flex',alignItems:'center',gap:8}}>
          <span style={{fontSize:16}}>🎓</span>
          <span style={{fontSize:12,color:'#f59e0b',fontWeight:600}}>쉬운 설명</span>
          <span style={{fontSize:11,color:'#666'}}>— 비전문가도 이해할 수 있어요</span>
        </div>
        <span style={{fontSize:11,color:'#666',display:'inline-block',transform:open?'rotate(180deg)':'rotate(0deg)',transition:'transform 0.2s'}}>▼</span>
      </button>
      {open && <div style={{padding:'16px 20px 20px',background:'#0e0e08',borderTop:'1px solid #2a2a1a'}}>{renderSections(text)}</div>}
    </div>
  )
}

// ── TrendChart + AI 분석 ──
function TrendSection({ trendData }: { trendData: {tags:string[],published_at:string}[] }) {
  const [open, setOpen] = useState(true)
  const [analysis, setAnalysis] = useState<string>('')
  const [analysisLoading, setAnalysisLoading] = useState(false)
  const [analysisCached, setAnalysisCached] = useState(false)

  useEffect(() => {
    if (!open || analysis) return
    setAnalysisLoading(true)
    fetch('/api/trend-analysis')
      .then(r => r.json())
      .then(d => { setAnalysis(d.analysis || ''); setAnalysisCached(d.cached) })
      .finally(() => setAnalysisLoading(false))
  }, [open])

  const chartData = useMemo(() => {
    if (!trendData.length) return { dates: [], series: [] }
    const dateMap: Record<string,Record<string,number>> = {}
    trendData.forEach(p => {
      const date = p.published_at?.slice(0,10) || ''; if (!date) return
      if (!dateMap[date]) dateMap[date] = {}
      ;(p.tags||[]).forEach(tag => { dateMap[date][tag] = (dateMap[date][tag]||0)+1 })
    })
    const dates = Object.keys(dateMap).sort()
    const topTags = ['NLP','컴퓨터비전','강화학습','생성모델','멀티모달']
    return { dates, series: topTags.map(tag => ({ tag, color: TAG_COLORS[tag]||'#888', values: dates.map(d => dateMap[d]?.[tag]||0) })) }
  }, [trendData])

  const renderAnalysis = (text: string) => {
    return text.split('\n').map((line, i) => {
      const t = line.trim(); if (!t) return <div key={i} style={{height:6}}/>
      if (t.startsWith('📌') || t.startsWith('**📌')) {
        return <div key={i} style={{fontSize:13,fontWeight:700,color:'#e2e2e8',marginBottom:10,marginTop:4}}>{t.replace(/\*\*/g,'')}</div>
      }
      if (t.match(/^\*\*\d+\./)||t.match(/^\*\*💡/)) {
        return <div key={i} style={{fontSize:12,fontWeight:700,color:'#a78bfa',marginTop:12,marginBottom:4}}>{t.replace(/\*\*/g,'')}</div>
      }
      return <p key={i} style={{fontSize:12,color:'#999',lineHeight:1.75}}>{t.replace(/\*\*/g,'')}</p>
    })
  }

  const W=700, H=180, PAD={top:16,right:110,bottom:36,left:36}
  const innerW=W-PAD.left-PAD.right, innerH=H-PAD.top-PAD.bottom
  const maxVal = Math.max(...(chartData.series.flatMap(s=>s.values)),1)
  const xStep = chartData.dates.length>1 ? innerW/(chartData.dates.length-1) : innerW
  const toPath = (vals: number[]) => vals.map((v,i)=>`${i===0?'M':'L'} ${PAD.left+i*xStep} ${PAD.top+innerH-(v/maxVal)*innerH}`).join(' ')
  const labelIdxs = chartData.dates.length<=5 ? chartData.dates.map((_,i)=>i)
    : [0,Math.floor(chartData.dates.length*0.25),Math.floor(chartData.dates.length*0.5),Math.floor(chartData.dates.length*0.75),chartData.dates.length-1]

  return (
    <div style={{background:'#111122',border:'1px solid #1e1e2e',borderRadius:16,marginBottom:24,overflow:'hidden'}}>
      <button onClick={()=>setOpen(o=>!o)} style={{width:'100%',padding:'14px 20px',background:'transparent',border:'none',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'space-between',fontFamily:'inherit'}}>
        <div style={{display:'flex',alignItems:'center',gap:10}}>
          <span style={{fontSize:14}}>📊</span>
          <span style={{fontSize:13,fontWeight:600,color:'#e2e2e8'}}>분야별 논문 트렌드 & AI 분석</span>
          <span style={{fontSize:11,color:'#555'}}>최근 30일</span>
          {analysisCached && <span style={{fontSize:10,color:'#555',background:'#1e1e2e',padding:'1px 6px',borderRadius:4}}>캐시</span>}
        </div>
        <span style={{fontSize:11,color:'#555',display:'inline-block',transform:open?'rotate(180deg)':'rotate(0deg)',transition:'transform 0.2s'}}>▼</span>
      </button>
      {open && (
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:0,borderTop:'1px solid #1e1e2e'}}>
          {/* 좌: 차트 */}
          <div style={{padding:'16px 20px 20px',borderRight:'1px solid #1e1e2e'}}>
            <div style={{fontSize:11,color:'#555',marginBottom:12}}>일별 분야별 논문 수</div>
            {chartData.dates.length > 0 ? (
              <svg viewBox={`0 0 ${W} ${H}`} style={{width:'100%',height:'auto'}}>
                {[0,0.5,1].map(r=>(
                  <line key={r} x1={PAD.left} y1={PAD.top+innerH*(1-r)} x2={PAD.left+innerW} y2={PAD.top+innerH*(1-r)} stroke="#1e1e2e" strokeWidth="1"/>
                ))}
                {[0,0.5,1].map(r=>(
                  <text key={r} x={PAD.left-4} y={PAD.top+innerH*(1-r)+4} textAnchor="end" fontSize="9" fill="#444">{Math.round(maxVal*r)}</text>
                ))}
                {labelIdxs.map(i=>(
                  <text key={i} x={PAD.left+i*xStep} y={H-6} textAnchor="middle" fontSize="9" fill="#444">{chartData.dates[i]?.slice(5)}</text>
                ))}
                {chartData.series.map(s=>(
                  <path key={s.tag} d={toPath(s.values)} fill="none" stroke={s.color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" opacity="0.85"/>
                ))}
                {chartData.series.map((s,i)=>(
                  <g key={s.tag} transform={`translate(${W-PAD.right+10},${PAD.top+i*20})`}>
                    <line x1="0" y1="6" x2="14" y2="6" stroke={s.color} strokeWidth="2"/>
                    <text x="18" y="10" fontSize="10" fill="#888">{s.tag}</text>
                  </g>
                ))}
              </svg>
            ) : (
              <div style={{fontSize:12,color:'#444',padding:'2rem 0',textAlign:'center'}}>데이터 수집 후 표시됩니다</div>
            )}
          </div>
          {/* 우: AI 트렌드 분석 */}
          <div style={{padding:'16px 20px 20px',overflowY:'auto',maxHeight:280}}>
            <div style={{fontSize:11,color:'#555',marginBottom:12,display:'flex',alignItems:'center',gap:6}}>
              ✦ AI가 분석한 이번 주 트렌드
              <button onClick={()=>{setAnalysis('');setAnalysisLoading(true);fetch('/api/trend-analysis?refresh=1').then(r=>r.json()).then(d=>{setAnalysis(d.analysis||'');setAnalysisCached(false)}).finally(()=>setAnalysisLoading(false))}}
                style={{fontSize:10,color:'#555',background:'#1a1a2e',border:'1px solid #2e2e4e',borderRadius:4,padding:'1px 6px',cursor:'pointer',fontFamily:'inherit'}}>새로고침</button>
            </div>
            {analysisLoading ? (
              <div style={{fontSize:12,color:'#555',display:'flex',alignItems:'center',gap:8}}>
                <div style={{width:12,height:12,border:'2px solid #6366f1',borderTopColor:'transparent',borderRadius:'50%',animation:'spin 1s linear infinite'}}/>
                AI가 트렌드를 분석 중...
              </div>
            ) : analysis ? (
              <div>{renderAnalysis(analysis)}</div>
            ) : (
              <div style={{fontSize:12,color:'#444'}}>논문 수집 후 트렌드 분석이 표시됩니다</div>
            )}
          </div>
        </div>
      )}
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )
}

// ── 수집 로그 뷰어 ──
function LogViewer() {
  const [logs, setLogs] = useState<CrawlLog[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedLog, setSelectedLog] = useState<CrawlLog|null>(null)

  const fetchLogs = useCallback(async () => {
    setLoading(true)
    try { const r = await fetch('/api/logs'); const d = await r.json(); setLogs(d.logs||[]) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchLogs() }, [])

  const statusColor = (s: string) => s==='success'?'#86efac':s==='failed'?'#f87171':s==='running'?'#60a5fa':'#fbbf24'
  const statusBg = (s: string) => s==='success'?'#112e11':s==='failed'?'#2e1111':s==='running'?'#111a2e':'#2e2a11'
  const fmtDur = (start: string, end: string) => {
    if (!end) return '진행 중'
    const ms = new Date(end).getTime()-new Date(start).getTime()
    return ms>60000?`${Math.round(ms/60000)}분`:`${Math.round(ms/1000)}초`
  }
  const fmtTime = (d: string) => d ? new Date(d).toLocaleString('ko-KR', {month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}) : '-'

  // 통계 요약
  const stats = useMemo(() => {
    const total = logs.length
    const success = logs.filter(l=>l.status==='success').length
    const failed = logs.filter(l=>l.status==='failed').length
    const totalSaved = logs.reduce((sum,l)=>sum+(l.saved_count||0),0)
    const totalErrors = logs.reduce((sum,l)=>sum+(l.error_count||0),0)
    return { total, success, failed, totalSaved, totalErrors }
  }, [logs])

  return (
    <div>
      {/* 상단 통계 + 새로고침 */}
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:16}}>
        <div style={{display:'flex',gap:16,alignItems:'center'}}>
          <div style={{display:'flex',gap:12}}>
            <div style={{background:'#111122',border:'1px solid #1e1e2e',borderRadius:10,padding:'10px 16px',textAlign:'center'}}>
              <div style={{fontSize:18,fontWeight:700,color:'#e2e2e8'}}>{stats.total}</div>
              <div style={{fontSize:10,color:'#555',marginTop:2}}>전체 실행</div>
            </div>
            <div style={{background:'#112e11',border:'1px solid #1e3e1e',borderRadius:10,padding:'10px 16px',textAlign:'center'}}>
              <div style={{fontSize:18,fontWeight:700,color:'#86efac'}}>{stats.success}</div>
              <div style={{fontSize:10,color:'#555',marginTop:2}}>성공</div>
            </div>
            <div style={{background:'#2e1111',border:'1px solid #3e1e1e',borderRadius:10,padding:'10px 16px',textAlign:'center'}}>
              <div style={{fontSize:18,fontWeight:700,color:'#f87171'}}>{stats.failed}</div>
              <div style={{fontSize:10,color:'#555',marginTop:2}}>실패</div>
            </div>
            <div style={{background:'#111122',border:'1px solid #1e1e2e',borderRadius:10,padding:'10px 16px',textAlign:'center'}}>
              <div style={{fontSize:18,fontWeight:700,color:'#818cf8'}}>{stats.totalSaved}</div>
              <div style={{fontSize:10,color:'#555',marginTop:2}}>총 저장</div>
            </div>
          </div>
        </div>
        <button onClick={fetchLogs} disabled={loading}
          style={{height:34,padding:'0 14px',background:'#1a1a2e',border:'1px solid #2e2e4e',borderRadius:8,color:'#888',fontSize:12,cursor:'pointer',fontFamily:'inherit',display:'flex',alignItems:'center',gap:6}}>
          {loading ? <span style={{width:12,height:12,border:'2px solid #6366f1',borderTopColor:'transparent',borderRadius:'50%',animation:'spin 1s linear infinite',display:'inline-block'}}/> : '🔄'} 새로고침
        </button>
      </div>

      {/* 로그 리스트 */}
      <div style={{background:'#111122',border:'1px solid #1e1e2e',borderRadius:16,overflow:'hidden'}}>
        {/* 헤더 */}
        <div style={{display:'grid',gridTemplateColumns:'80px 1fr 100px 100px 80px',padding:'10px 20px',borderBottom:'1px solid #1e1e2e',background:'#0d0d18'}}>
          <span style={{fontSize:10,fontWeight:600,color:'#555',textTransform:'uppercase'}}>상태</span>
          <span style={{fontSize:10,fontWeight:600,color:'#555',textTransform:'uppercase'}}>실행 시간</span>
          <span style={{fontSize:10,fontWeight:600,color:'#555',textTransform:'uppercase'}}>결과</span>
          <span style={{fontSize:10,fontWeight:600,color:'#555',textTransform:'uppercase'}}>소요</span>
          <span style={{fontSize:10,fontWeight:600,color:'#555',textTransform:'uppercase'}}>트리거</span>
        </div>

        {loading && <div style={{padding:'2rem',textAlign:'center',fontSize:12,color:'#555'}}>로그 불러오는 중...</div>}
        {!loading && logs.length===0 && <div style={{padding:'2rem',textAlign:'center',fontSize:12,color:'#555'}}>수집 로그가 없습니다</div>}

        {!loading && logs.map(log=>(
          <div key={log.id}>
            <div onClick={()=>setSelectedLog(selectedLog?.id===log.id?null:log)}
              style={{display:'grid',gridTemplateColumns:'80px 1fr 100px 100px 80px',padding:'12px 20px',borderBottom:'1px solid #1a1a2e',cursor:'pointer',background:selectedLog?.id===log.id?'#1a1a2e':'transparent',transition:'background 0.1s',alignItems:'center'}}
              onMouseEnter={e=>{if(selectedLog?.id!==log.id)e.currentTarget.style.background='#141425'}}
              onMouseLeave={e=>{if(selectedLog?.id!==log.id)e.currentTarget.style.background='transparent'}}>
              <span style={{fontSize:11,padding:'3px 8px',background:statusBg(log.status),color:statusColor(log.status),borderRadius:4,fontWeight:600,textAlign:'center',width:'fit-content'}}>
                {log.status==='success'?'성공':log.status==='failed'?'실패':log.status==='running'?'실행중':'대기'}
              </span>
              <span style={{fontSize:12,color:'#aaa',fontFamily:'monospace'}}>{fmtTime(log.started_at)}</span>
              <div style={{display:'flex',gap:8,fontSize:11}}>
                <span style={{color:'#86efac'}}>{log.saved_count||0}</span>
                <span style={{color:'#555'}}>/</span>
                <span style={{color:'#888'}}>{log.skipped_count||0}</span>
                <span style={{color:'#555'}}>/</span>
                <span style={{color:(log.error_count||0)>0?'#f87171':'#555'}}>{log.error_count||0}</span>
              </div>
              <span style={{fontSize:11,color:'#666'}}>{fmtDur(log.started_at,log.finished_at)}</span>
              <span style={{fontSize:11,color:'#555'}}>{log.trigger_type==='scheduler'?'🕐 arXiv':log.trigger_type==='scie_scheduler'?'📚 SCIE':'👤 수동'}</span>
            </div>

            {/* 상세 패널 */}
            {selectedLog?.id===log.id && (
              <div style={{background:'#0d0d18',borderBottom:'1px solid #1e1e2e',padding:'16px 20px'}}>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:20}}>
                  {/* 좌: 요약 정보 */}
                  <div>
                    <div style={{fontSize:11,fontWeight:600,color:'#818cf8',marginBottom:10}}>실행 정보</div>
                    <div style={{display:'grid',gridTemplateColumns:'auto 1fr',gap:'6px 12px',fontSize:12}}>
                      <span style={{color:'#555'}}>ID</span>
                      <span style={{color:'#888',fontFamily:'monospace',fontSize:10}}>{log.id}</span>
                      <span style={{color:'#555'}}>시작</span>
                      <span style={{color:'#aaa'}}>{log.started_at ? new Date(log.started_at).toLocaleString('ko-KR') : '-'}</span>
                      <span style={{color:'#555'}}>종료</span>
                      <span style={{color:'#aaa'}}>{log.finished_at ? new Date(log.finished_at).toLocaleString('ko-KR') : '-'}</span>
                      <span style={{color:'#555'}}>목표</span>
                      <span style={{color:'#aaa'}}>{log.target_count}편</span>
                      <span style={{color:'#555'}}>결과</span>
                      <span style={{color:'#aaa'}}>저장 {log.saved_count||0} · 스킵 {log.skipped_count||0} · 오류 {log.error_count||0}</span>
                    </div>
                    {log.message && (
                      <div style={{marginTop:12,fontSize:12,color:'#888',padding:'8px 12px',background:'#111122',borderRadius:6,border:'1px solid #1e1e2e'}}>
                        {log.message}
                      </div>
                    )}
                  </div>

                  {/* 우: 상세 논문 목록 */}
                  <div>
                    <div style={{fontSize:11,fontWeight:600,color:'#818cf8',marginBottom:10}}>논문별 결과</div>
                    {log.details && (log.details as any[]).length > 0 ? (
                      <div style={{maxHeight:200,overflowY:'auto',borderRadius:8,border:'1px solid #1e1e2e'}}>
                        {(log.details as any[]).map((d,i)=>(
                          <div key={i} style={{padding:'6px 12px',borderBottom:'1px solid #1a1a2e',fontSize:11,display:'flex',alignItems:'center',gap:8}}>
                            <span style={{width:16,textAlign:'center'}}>
                              {d.error==='중복'?'⏭':d.error?'❌':'✅'}
                            </span>
                            <span style={{flex:1,color:d.error&&d.error!=='중복'?'#f87171':d.error==='중복'?'#666':'#ccc',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                              {d.title_ko||d.id}
                            </span>
                            {d.error&&d.error!=='중복' && (
                              <span style={{fontSize:10,color:'#f87171',background:'#2e1111',padding:'1px 6px',borderRadius:3,whiteSpace:'nowrap'}}>
                                {d.error.slice(0,40)}{d.error.length>40?'...':''}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div style={{fontSize:11,color:'#555',padding:'12px',textAlign:'center'}}>상세 정보 없음</div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )
}

// ── 메인 ──
export default function Home() {
  const [papers, setPapers] = useState<Paper[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(false)
  const [crawling, setCrawling] = useState(false)
  const [selectedTag, setSelectedTag] = useState('전체')
  const [query, setQuery] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [selectedPaper, setSelectedPaper] = useState<Paper|null>(null)
  const [crawlSecret, setCrawlSecret] = useState('')
  const [crawlCount, setCrawlCount] = useState(10)
  const [crawlResult, setCrawlResult] = useState<any>(null)
  const [showCrawlPanel, setShowCrawlPanel] = useState(false)
  const [showFailed, setShowFailed] = useState(false)
  const [trendData, setTrendData] = useState<any[]>([])
  const [tab, setTab] = useState<'papers'|'logs'>('papers')

  const fetchPapers = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page:String(page), limit:'20', showFailed:String(showFailed), ...(selectedTag!=='전체'&&{tag:selectedTag}), ...(query&&{q:query}) })
      const res = await fetch(`/api/papers?${params}`)
      const data = await res.json()
      setPapers(data.papers||[])
      setTotal(data.total||0)
      if (data.trendData) setTrendData(data.trendData)
    } finally { setLoading(false) }
  }, [page, selectedTag, query, showFailed])

  useEffect(()=>{ fetchPapers() },[fetchPapers])

  const handleCrawl = async () => {
    setCrawling(true); setCrawlResult(null)
    try {
      const res = await fetch('/api/crawl',{ method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({secret:crawlSecret,count:crawlCount}) })
      const data = await res.json()
      setCrawlResult(data)
      if (data.success) { fetchPapers(); setTab('logs') }
    } catch(e:any) { setCrawlResult({error:e.message}) }
    finally { setCrawling(false) }
  }

  const fmtDate = (d:string) => d?new Date(d).toLocaleDateString('ko-KR'):''
  const totalPages = Math.ceil(total/20)
  const isFailed = (p:Paper) => !p.summary_ko||p.summary_ko.includes('분석 실패')||p.summary_ko.includes('생성할 수 없')

  return (
    <>
      <Head><title>AI 논문 탐색기</title></Head>
      <div style={{minHeight:'100vh',background:'#0a0a0f'}}>
        {/* 헤더 */}
        <header style={{borderBottom:'1px solid #1e1e2e',padding:'0 2rem',height:56,display:'flex',alignItems:'center',justifyContent:'space-between',position:'sticky',top:0,background:'#0a0a0f',zIndex:100}}>
          <div style={{display:'flex',alignItems:'center',gap:12}}>
            <div style={{width:28,height:28,background:'linear-gradient(135deg,#6366f1,#a855f7)',borderRadius:8,display:'flex',alignItems:'center',justifyContent:'center',fontSize:14}}>✦</div>
            <span style={{fontWeight:600,fontSize:15,letterSpacing:'-0.02em'}}>AI 논문 탐색기</span>
            <span style={{fontSize:11,color:'#6366f1',background:'#1e1e3f',padding:'2px 8px',borderRadius:4,fontFamily:'monospace'}}>arXiv · SCIE</span>
          </div>
          <div style={{display:'flex',alignItems:'center',gap:10}}>
            <span style={{fontSize:12,color:'#666'}}>총 {total.toLocaleString()}편</span>
            {['papers','logs'].map(t=>(
              <button key={t} onClick={()=>setTab(t as any)}
                style={{height:32,padding:'0 14px',background:tab===t?'#1e1e3f':'transparent',border:`1px solid ${tab===t?'#6366f1':'#2e2e4e'}`,borderRadius:8,color:tab===t?'#818cf8':'#666',fontSize:12,cursor:'pointer',fontFamily:'inherit'}}>
                {t==='papers'?'논문':'📋 로그'}
              </button>
            ))}
            <button onClick={()=>setShowCrawlPanel(!showCrawlPanel)} style={{height:32,padding:'0 14px',background:'#6366f1',border:'none',borderRadius:8,color:'white',fontSize:12,cursor:'pointer',fontFamily:'inherit'}}>+ 수집</button>
          </div>
        </header>

        {/* 수집 패널 */}
        {showCrawlPanel && (
          <div style={{background:'#111122',borderBottom:'1px solid #1e1e2e',padding:'1.5rem 2rem'}}>
            <div style={{maxWidth:860,display:'flex',gap:12,flexWrap:'wrap',alignItems:'flex-end'}}>
              <div>
                <div style={{fontSize:11,color:'#888',marginBottom:6}}>관리자 키</div>
                <input type="password" value={crawlSecret} onChange={e=>setCrawlSecret(e.target.value)} placeholder=".env의 CRAWL_SECRET" style={{height:36,padding:'0 12px',background:'#1a1a2e',border:'1px solid #2e2e4e',borderRadius:8,color:'#e2e2e8',fontSize:13,fontFamily:'inherit',width:200}}/>
              </div>
              <div>
                <div style={{fontSize:11,color:'#888',marginBottom:6}}>수집 편수</div>
                <input type="number" value={crawlCount} onChange={e=>setCrawlCount(Number(e.target.value))} min={1} max={50} style={{height:36,padding:'0 12px',background:'#1a1a2e',border:'1px solid #2e2e4e',borderRadius:8,color:'#e2e2e8',fontSize:13,fontFamily:'inherit',width:80}}/>
              </div>
              <button onClick={handleCrawl} disabled={crawling} style={{height:36,padding:'0 20px',background:crawling?'#333':'linear-gradient(135deg,#6366f1,#a855f7)',border:'none',borderRadius:8,color:'white',fontSize:13,cursor:crawling?'not-allowed':'pointer',fontFamily:'inherit'}}>
                {crawling?'수집 중...':'arXiv 수집 시작'}
              </button>
              <div style={{fontSize:11,color:'#555',padding:'0 4px',lineHeight:1.6}}>
                🕐 자동 스케줄: 매일 새벽 3시(KST) 50편 자동 수집<br/>
                ⚡ Rate limit 감지 시 최대 5회 자동 재시도
              </div>
              {crawlResult && (
                <div style={{fontSize:12,padding:'8px 12px',background:crawlResult.error?'#2e1111':'#112e11',borderRadius:8,color:crawlResult.error?'#f87171':'#86efac'}}>
                  {crawlResult.error?`오류: ${crawlResult.error}`:`저장 ${crawlResult.saved}편 · 스킵 ${crawlResult.skipped}편 · 오류 ${crawlResult.errors}편`}
                </div>
              )}
            </div>
          </div>
        )}

        <main style={{maxWidth:1200,margin:'0 auto',padding:'2rem'}}>
          {/* 트렌드 섹션 */}
          <TrendSection trendData={trendData}/>

          {/* 탭: 로그 */}
          {tab==='logs' && <LogViewer/>}

          {/* 탭: 논문 */}
          {tab==='papers' && (
            <>
              <div style={{marginBottom:'1rem',display:'flex',gap:10,flexWrap:'wrap'}}>
                <input value={searchInput} onChange={e=>setSearchInput(e.target.value)} onKeyDown={e=>e.key==='Enter'&&(setQuery(searchInput),setPage(1))} placeholder="논문 제목, 요약 검색..."
                  style={{flex:1,minWidth:200,height:44,padding:'0 16px',background:'#111122',border:'1px solid #2e2e4e',borderRadius:12,color:'#e2e2e8',fontSize:14,fontFamily:'inherit',outline:'none'}}/>
                <button onClick={()=>{setQuery(searchInput);setPage(1)}} style={{height:44,padding:'0 20px',background:'#6366f1',border:'none',borderRadius:12,color:'white',fontSize:14,cursor:'pointer',fontFamily:'inherit'}}>검색</button>
                {query && <button onClick={()=>{setQuery('');setSearchInput('');setPage(1)}} style={{height:44,padding:'0 16px',background:'#1e1e2e',border:'1px solid #2e2e4e',borderRadius:12,color:'#888',fontSize:13,cursor:'pointer',fontFamily:'inherit'}}>초기화</button>}
                <button onClick={()=>{setShowFailed(v=>!v);setPage(1)}} style={{height:44,padding:'0 16px',background:showFailed?'#2e1111':'#1a1a2e',border:`1px solid ${showFailed?'#ef4444':'#2e2e4e'}`,borderRadius:12,color:showFailed?'#f87171':'#555',fontSize:12,cursor:'pointer',fontFamily:'inherit',whiteSpace:'nowrap'}}>
                  {showFailed?'⚠️ 분석실패 포함':'분석실패 숨김'}
                </button>
              </div>
              <div style={{display:'flex',gap:8,flexWrap:'wrap',marginBottom:'1.5rem'}}>
                {ALL_TAGS.map(tag=>(
                  <button key={tag} onClick={()=>{setSelectedTag(tag);setPage(1)}}
                    style={{height:30,padding:'0 14px',background:selectedTag===tag?(TAG_COLORS[tag]||'#6366f1'):'#1a1a2e',border:`1px solid ${selectedTag===tag?(TAG_COLORS[tag]||'#6366f1'):'#2e2e4e'}`,borderRadius:20,color:selectedTag===tag?'white':'#888',fontSize:12,cursor:'pointer',fontFamily:'inherit',transition:'all 0.15s'}}>
                    {tag}
                  </button>
                ))}
              </div>

              {loading && <div style={{textAlign:'center',padding:'4rem',color:'#666',fontSize:13}}>논문 불러오는 중...</div>}
              {!loading&&papers.length===0 && <div style={{textAlign:'center',padding:'4rem',color:'#666'}}><div style={{fontSize:32,marginBottom:12}}>📄</div><div style={{fontSize:14}}>논문이 없어요!</div></div>}

              {!loading&&papers.length>0 && (
                <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(360px,1fr))',gap:16}}>
                  {papers.map(paper=>(
                    <div key={paper.id} onClick={()=>setSelectedPaper(paper)}
                      style={{background:isFailed(paper)?'#1a1010':'#111122',border:`1px solid ${isFailed(paper)?'#3e1e1e':'#1e1e2e'}`,borderRadius:16,padding:'1.25rem',cursor:'pointer',transition:'border-color 0.15s',position:'relative'}}
                      onMouseEnter={e=>e.currentTarget.style.borderColor=isFailed(paper)?'#ef4444':'#6366f1'}
                      onMouseLeave={e=>e.currentTarget.style.borderColor=isFailed(paper)?'#3e1e1e':'#1e1e2e'}>
                      {isFailed(paper)&&<div style={{position:'absolute',top:10,right:10,fontSize:10,color:'#ef4444',background:'#2e1111',padding:'2px 6px',borderRadius:4}}>⚠️ 분석실패</div>}
                      <div style={{display:'flex',gap:6,flexWrap:'wrap',marginBottom:10}}>
                        <span style={{fontSize:10,padding:'2px 8px',background:paper.source==='scie'?'#1e2e1e':'#1e1e3f',color:paper.source==='scie'?'#86efac':'#818cf8',borderRadius:4,fontWeight:600}}>
                          {paper.source==='scie'?'SCIE':'arXiv'}
                        </span>
                        {paper.journal_name && <span style={{fontSize:10,padding:'2px 8px',background:'#1a1a2e',color:'#888',borderRadius:4}}>{paper.journal_name}</span>}
                        {(paper.tags||[]).slice(0,3).map(tag=>(<span key={tag} style={{fontSize:10,padding:'2px 8px',background:'#1e1e3f',color:TAG_COLORS[tag]||'#818cf8',borderRadius:4}}>{tag}</span>))}
                      </div>
                      <h3 style={{fontSize:14,fontWeight:600,lineHeight:1.5,marginBottom:8,color:'#e2e2e8'}}>{paper.title_ko||paper.title_en}</h3>
                      <p style={{fontSize:11,color:'#555',marginBottom:10,fontStyle:'italic'}}>{paper.title_en.slice(0,80)}{paper.title_en.length>80?'...':''}</p>
                      <p style={{fontSize:12,color:'#888',lineHeight:1.6,marginBottom:12}}>{(paper.summary_ko||'').split('\n')[0]}</p>
                      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                        <span style={{fontSize:10,color:'#555',fontFamily:'monospace'}}>{fmtDate(paper.published_at)}</span>
                        <div style={{display:'flex',gap:8}}>
                          {paper.github_url&&<span style={{fontSize:10,color:'#6366f1'}}>GitHub ↗</span>}
                          {paper.performance&&paper.performance!=='명시되지 않음'&&<span style={{fontSize:10,color:'#86efac',background:'#112e11',padding:'2px 6px',borderRadius:4}}>{paper.performance.slice(0,20)}</span>}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {totalPages>1&&(
                <div style={{display:'flex',justifyContent:'center',gap:8,marginTop:'2rem'}}>
                  <button onClick={()=>setPage(p=>Math.max(1,p-1))} disabled={page===1} style={{height:36,padding:'0 16px',background:'#1a1a2e',border:'1px solid #2e2e4e',borderRadius:8,color:page===1?'#444':'#888',fontSize:13,cursor:page===1?'not-allowed':'pointer',fontFamily:'inherit'}}>← 이전</button>
                  <span style={{height:36,display:'flex',alignItems:'center',fontSize:13,color:'#666'}}>{page} / {totalPages}</span>
                  <button onClick={()=>setPage(p=>Math.min(totalPages,p+1))} disabled={page===totalPages} style={{height:36,padding:'0 16px',background:'#1a1a2e',border:'1px solid #2e2e4e',borderRadius:8,color:page===totalPages?'#444':'#888',fontSize:13,cursor:page===totalPages?'not-allowed':'pointer',fontFamily:'inherit'}}>다음 →</button>
                </div>
              )}
            </>
          )}
        </main>
      </div>

      {/* 모달 */}
      {selectedPaper&&(
        <div onClick={()=>setSelectedPaper(null)} style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.8)',zIndex:200,display:'flex',alignItems:'center',justifyContent:'center',padding:'2rem'}}>
          <div onClick={e=>e.stopPropagation()} style={{background:'#111122',border:'1px solid #2e2e4e',borderRadius:20,maxWidth:720,width:'100%',maxHeight:'85vh',overflow:'auto',padding:'2rem'}}>
            <div style={{display:'flex',gap:6,flexWrap:'wrap',marginBottom:16}}>
              {(selectedPaper.tags||[]).map(tag=>(<span key={tag} style={{fontSize:11,padding:'3px 10px',background:'#1e1e3f',color:TAG_COLORS[tag]||'#818cf8',borderRadius:6}}>{tag}</span>))}
            </div>
            <h2 style={{fontSize:18,fontWeight:600,lineHeight:1.5,marginBottom:6}}>{selectedPaper.title_ko}</h2>
            <p style={{fontSize:12,color:'#555',fontStyle:'italic',marginBottom:20}}>{selectedPaper.title_en}</p>
            {[{label:'📝 3줄 요약',value:selectedPaper.summary_ko,multiline:true},{label:'💡 핵심 기여점',value:selectedPaper.key_contributions},{label:'🗂 사용 데이터셋',value:selectedPaper.dataset},{label:'🤖 사용 모델',value:selectedPaper.model},{label:'📈 성능 향상',value:selectedPaper.performance}].map(({label,value,multiline})=>(
              <div key={label} style={{marginBottom:16}}>
                <div style={{fontSize:11,color:'#6366f1',fontWeight:600,marginBottom:6,letterSpacing:'0.05em'}}>{label}</div>
                <div style={{fontSize:13,color:'#ccc',lineHeight:1.7,whiteSpace:multiline?'pre-line':'normal'}}>{value||'명시되지 않음'}</div>
              </div>
            ))}
            <div style={{marginBottom:16}}>
              <div style={{fontSize:11,color:'#6366f1',fontWeight:600,marginBottom:6}}>👤 저자</div>
              <div style={{fontSize:12,color:'#888'}}>{(selectedPaper.authors||[]).join(', ')}</div>
            </div>
            {selectedPaper.easy_explanation&&!selectedPaper.easy_explanation.includes('실패')&&<EasyExplain text={selectedPaper.easy_explanation}/>}
            <div style={{display:'flex',gap:10,flexWrap:'wrap'}}>
              <a href={selectedPaper.paper_url.replace(/_$/,'')} target="_blank" rel="noopener noreferrer" style={{height:38,padding:'0 18px',background:'#6366f1',borderRadius:10,color:'white',fontSize:13,display:'flex',alignItems:'center',textDecoration:'none'}}>📖 원문 보기</a>
              {selectedPaper.github_url&&<a href={selectedPaper.github_url} target="_blank" rel="noopener noreferrer" style={{height:38,padding:'0 18px',background:'#1a1a2e',border:'1px solid #2e2e4e',borderRadius:10,color:'#e2e2e8',fontSize:13,display:'flex',alignItems:'center',textDecoration:'none'}}>⚡ GitHub 코드</a>}
              <button onClick={()=>setSelectedPaper(null)} style={{height:38,padding:'0 18px',background:'transparent',border:'1px solid #2e2e4e',borderRadius:10,color:'#666',fontSize:13,cursor:'pointer',fontFamily:'inherit',marginLeft:'auto'}}>닫기</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
