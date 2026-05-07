-- Supabase SQL Editor에서 실행하세요
-- https://supabase.com/dashboard → SQL Editor

CREATE TABLE IF NOT EXISTS papers (
  id TEXT PRIMARY KEY,                    -- arXiv ID (예: 2405.12345)
  title_en TEXT NOT NULL,                 -- 영문 제목
  title_ko TEXT,                          -- 한글 번역 제목
  abstract_en TEXT,                       -- 영문 초록
  summary_ko TEXT,                        -- 한글 3줄 요약
  key_contributions TEXT,                 -- 핵심 기여점
  dataset TEXT,                           -- 사용 데이터셋
  model TEXT,                             -- 사용 모델
  performance TEXT,                       -- 성능 향상 수치
  github_url TEXT,                        -- GitHub 주소
  paper_url TEXT,                         -- 논문 arXiv 주소
  tags TEXT[],                            -- 분야 태그
  authors TEXT[],                         -- 저자 목록
  published_at TIMESTAMP,                 -- 게재일
  created_at TIMESTAMP DEFAULT NOW()      -- 수집일
);

-- 검색용 인덱스
CREATE INDEX IF NOT EXISTS papers_published_at_idx ON papers(published_at DESC);
CREATE INDEX IF NOT EXISTS papers_tags_idx ON papers USING gin(tags);

-- 전문 검색 인덱스
CREATE INDEX IF NOT EXISTS papers_title_ko_idx ON papers USING gin(to_tsvector('simple', coalesce(title_ko, '')));
