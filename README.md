# AI 논문 탐색기

arXiv 최신 AI/ML 논문을 자동 수집하고, Snowflake Cortex AI로 한글 분석 후 저장하는 서비스입니다.

## 아키텍처

- **Backend**: Snowflake (데이터 저장 + Cortex AI 분석)
- **Frontend**: Next.js (Pages Router)
- **크롤링**: GitHub Actions (매일 자동) + 수동 트리거
- **대시보드**: Streamlit in Snowflake

## 설치 순서

### 1. Snowflake 설정
1. Snowflake 계정에서 `snowflake_schema.sql` 실행 (테이블 생성)
2. 키페어 인증 설정 (RSA 키 생성 후 사용자에 공개키 등록)

### 2. 환경변수 설정

`.env.local` 파일을 생성하고 아래 변수를 설정합니다:

```
SNOWFLAKE_ACCOUNT=<your-account-locator>
SNOWFLAKE_USERNAME=<your-username>
SNOWFLAKE_PRIVATE_KEY=<pem-format-private-key>
SNOWFLAKE_PRIVATE_KEY_PASSPHRASE=<optional>
SNOWFLAKE_DATABASE=ARTICLE_EXPLORER
SNOWFLAKE_SCHEMA=PUBLIC
SNOWFLAKE_WAREHOUSE=<your-warehouse>
CRAWL_SECRET=<your-admin-password>
```

### 3. 실행
```bash
npm install
npm run dev
# http://localhost:3000
```

### 4. GitHub Actions 자동 수집
- `.github/workflows/crawl.yml`이 매일 UTC 18:00 (KST 03:00)에 10편 자동 수집
- GitHub Secrets에 Snowflake 환경변수 등록 필요

## 비용 안내

| 항목 | 비용 |
|------|------|
| arXiv API | 무료 |
| Snowflake Cortex AI (논문 1편 분석) | 크레딧 소량 |
| Snowflake 스토리지 | 크레딧 소량 |
| GitHub Actions | 무료 (public repo) |

## 프로젝트 구조

```
├── pages/
│   ├── index.tsx          # 메인 UI (논문 목록 + 로그 뷰어)
│   └── api/
│       ├── papers.ts      # 논문 조회 API
│       ├── crawl.ts       # 수동 크롤링 API
│       ├── logs.ts        # 크롤링 로그 API
│       └── scheduler.ts   # 스케줄러 API
├── lib/
│   └── snowflake.ts       # Snowflake 연결 헬퍼
├── scripts/
│   └── crawl.mjs          # GitHub Actions 크롤링 스크립트
└── snowflake_schema.sql   # DDL
```
