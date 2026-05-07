import { Html, Head, Main, NextScript } from 'next/document'

export default function Document() {
  return (
    <Html lang="ko">
      <Head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+KR:wght@300;400;500;600&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet" />
        <style dangerouslySetInnerHTML={{ __html: `
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body { font-family: 'IBM Plex Sans KR', sans-serif; background: #0a0a0f; color: #e2e2e8; min-height: 100vh; }
          .mono { font-family: 'JetBrains Mono', monospace; }
          ::-webkit-scrollbar { width: 4px; }
          ::-webkit-scrollbar-track { background: #111; }
          ::-webkit-scrollbar-thumb { background: #333; border-radius: 2px; }
        `}} />
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  )
}
