-- 기존 papers 테이블 (변경 없음)
CREATE TABLE IF NOT EXISTS papers (
  id TEXT PRIMARY KEY,
  title_en TEXT NOT NULL,
  title_ko TEXT,
  abstract_en TEXT,
  summary_ko TEXT,
  key_contributions TEXT,
  dataset TEXT,
  model TEXT,
  performance TEXT,
  github_url TEXT,
  easy_explanation TEXT,
  paper_url TEXT,
  tags TEXT[],
  authors TEXT[],
  published_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

-- 크롤링 로그 테이블
CREATE TABLE IF NOT EXISTS crawl_logs (
  id SERIAL PRIMARY KEY,
  trigger TEXT DEFAULT 'manual',      -- 'manual' | 'scheduler'
  target_count INT DEFAULT 50,
  saved_count INT DEFAULT 0,
  skipped_count INT DEFAULT 0,
  error_count INT DEFAULT 0,
  status TEXT DEFAULT 'running',      -- 'running' | 'retrying' | 'success' | 'failed'
  message TEXT,
  details JSONB,
  started_at TIMESTAMP DEFAULT NOW(),
  finished_at TIMESTAMP
);

-- 트렌드 분석 캐시 테이블
CREATE TABLE IF NOT EXISTS trend_analysis (
  id SERIAL PRIMARY KEY,
  analysis_text TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- 인덱스
CREATE INDEX IF NOT EXISTS papers_created_at_idx ON papers(created_at DESC);
CREATE INDEX IF NOT EXISTS papers_published_at_idx ON papers(published_at DESC);
CREATE INDEX IF NOT EXISTS papers_tags_idx ON papers USING gin(tags);
CREATE INDEX IF NOT EXISTS crawl_logs_started_at_idx ON crawl_logs(started_at DESC);

-- easy_explanation 컬럼 (없으면 추가)
ALTER TABLE papers ADD COLUMN IF NOT EXISTS easy_explanation TEXT;
