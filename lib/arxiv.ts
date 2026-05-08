import xml2js from 'xml2js'

export interface ArxivPaper {
  id: string
  title_en: string
  abstract_en: string
  authors: string[]
  published_at: string
  paper_url: string
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

export async function fetchArxivPapers(
  maxResults = 20,
  start = 0  // 페이지네이션 오프셋
): Promise<ArxivPaper[]> {
  const query = 'cat:cs.AI+OR+cat:cs.LG+OR+cat:cs.CV+OR+cat:cs.CL'
  const url = `https://export.arxiv.org/api/query?search_query=${query}&sortBy=submittedDate&sortOrder=descending&max_results=${maxResults}&start=${start}`

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'ArxivExplorer/1.0 (research tool)' },
      })
      const text = await res.text()

      if (text.includes('Rate exceeded') || text.includes('rate limit')) {
        console.log(`Rate limit (시도 ${attempt}/3), ${10 * attempt}초 대기...`)
        await sleep(10000 * attempt)
        continue
      }

      if (!text.trim().startsWith('<?xml') && !text.trim().startsWith('<feed')) {
        throw new Error(`예상치 못한 응답: ${text.slice(0, 200)}`)
      }

      const parsed = await xml2js.parseStringPromise(text, { explicitArray: false })
      const entries = parsed?.feed?.entry
      if (!entries) return []

      const list = Array.isArray(entries) ? entries : [entries]

      return list.map((entry: any) => {
        const rawId = (entry.id || '').split('/abs/').pop() || ''
        const cleanId = rawId.replace(/v\d+$/, '')
        const authors = entry.author
          ? Array.isArray(entry.author)
            ? entry.author.map((a: any) => a.name || '')
            : [entry.author.name || '']
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

    } catch (e: any) {
      if (attempt === 3) throw e
      console.log(`오류 (시도 ${attempt}/3): ${e.message}, 5초 대기...`)
      await sleep(5000)
    }
  }
  return []
}
