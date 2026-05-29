-- Snowflake DDL for Article Explorer
-- Account: YOUR_ACCOUNT
-- Database: ARTICLE_EXPLORER, Schema: PUBLIC

CREATE DATABASE IF NOT EXISTS ARTICLE_EXPLORER;
CREATE SCHEMA IF NOT EXISTS ARTICLE_EXPLORER.PUBLIC;

USE SCHEMA ARTICLE_EXPLORER.PUBLIC;

-- 논문 테이블
CREATE TABLE IF NOT EXISTS papers (
  id VARCHAR PRIMARY KEY,
  title_en VARCHAR NOT NULL,
  title_ko VARCHAR,
  abstract_en VARCHAR,
  summary_ko VARCHAR,
  key_contributions VARCHAR,
  dataset VARCHAR,
  model VARCHAR,
  performance VARCHAR,
  github_url VARCHAR,
  easy_explanation VARCHAR,
  paper_url VARCHAR,
  tags ARRAY,
  authors ARRAY,
  published_at TIMESTAMP_NTZ,
  created_at TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP()
);

-- 크롤링 로그 테이블 (id: UUID 문자열, 클라이언트에서 생성)
CREATE TABLE IF NOT EXISTS crawl_logs (
  id VARCHAR PRIMARY KEY,
  trigger_type VARCHAR DEFAULT 'manual',
  target_count NUMBER DEFAULT 50,
  saved_count NUMBER DEFAULT 0,
  skipped_count NUMBER DEFAULT 0,
  error_count NUMBER DEFAULT 0,
  status VARCHAR DEFAULT 'running',
  message VARCHAR,
  details VARIANT,
  started_at TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP(),
  finished_at TIMESTAMP_NTZ
);

-- 트렌드 분석 캐시 테이블 (id: UUID 문자열, 클라이언트에서 생성)
CREATE TABLE IF NOT EXISTS trend_analysis (
  id VARCHAR PRIMARY KEY,
  analysis_text VARCHAR NOT NULL,
  created_at TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP()
);

-- Snowflake 일반 테이블은 CREATE INDEX 미지원 (Hybrid Table 전용)
-- 정렬은 쿼리의 ORDER BY로 처리, 대용량 시 CLUSTER BY 고려
