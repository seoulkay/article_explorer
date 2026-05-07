import xml2js from 'xml2js'

export interface ArxivPaper {
  id: string
  title_en: string
  abstract_en: string
  authors: string[]
  published_at: string
  paper_url: string
}

// arXiv API에서 최신 AI 논문 가져오기
export async function fetchArxivPapers(maxResults = 20): Promise<ArxivPaper[]> {
  // cs.AI, cs.LG(머신러닝), cs.CV(컴퓨터비전), cs.CL(NLP) 분야
  const query = 'cat:cs.AI+OR+cat:cs.LG+OR+cat:cs.CV+OR+cat:cs.CL'
  const url = `https://export.arxiv.org/api/query?search_query=${query}&sortBy=submittedDate&sortOrder=descending&max_results=${maxResults}&start=0`

  const res = await fetch(url, {
    headers: { 'User-Agent': 'ArxivExplorer/1.0' },
  })
  const text = await res.text()
  const parsed = await xml2js.parseStringPromise(text, { explicitArray: false })

  const entries = parsed?.feed?.entry
  if (!entries) return []

  const list = Array.isArray(entries) ? entries : [entries]

  return list.map((entry: any) => {
    const rawId = entry.id || ''
    const id = rawId.split('/abs/').pop()?.replace('v', '_v') || rawId

    const authors = entry.author
      ? Array.isArray(entry.author)
        ? entry.author.map((a: any) => a.name || '')
        : [entry.author.name || '']
      : []

    return {
      id: id.split('v')[0], // 버전 제거
      title_en: (entry.title || '').replace(/\n/g, ' ').trim(),
      abstract_en: (entry.summary || '').replace(/\n/g, ' ').trim(),
      authors: authors.slice(0, 5), // 최대 5명
      published_at: entry.published || '',
      paper_url: `https://arxiv.org/html/${id.split('v')[0]}`,
    }
  })
}
