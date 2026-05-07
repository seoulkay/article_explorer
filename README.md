# AI 논문 탐색기

arXiv 최신 AI 논문을 자동 수집하고, Claude AI로 한글 분석 후 데이터베이스에 저장하는 서비스입니다.

## 필요한 것들 (모두 무료)

1. **Anthropic API 키** → https://console.anthropic.com/api-keys
2. **Supabase 프로젝트** → https://supabase.com (무료 플랜)
3. **Vercel 계정** → 배포용

---

## 설치 순서

### 1. Supabase 설정
1. https://supabase.com → 새 프로젝트 생성
2. SQL Editor → `supabase_schema.sql` 내용 붙여넣고 실행
3. Settings → API → `URL`, `anon key`, `service_role key` 복사

### 2. 환경변수 설정
```bash
cp .env.local.example .env.local
# .env.local 열어서 키 입력
```

.env.local 내용:
```
ANTHROPIC_API_KEY=YOUR_API_KEY
NEXT_PUBLIC_SUPABASE_URL=YOUR_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR_KEY
SUPABASE_SERVICE_ROLE_KEY=YOUR_KEY
CRAWL_SECRET=YOUR_SECRET  # 크롤링 버튼 누를 때 입력할 비밀번호
```

### 3. 실행
```bash
npm install
npm run dev
# http://localhost:3000
```

### 4. 논문 수집
1. 사이트 우상단 **"+ 논문 수집"** 클릭
2. 관리자 키에 `.env.local`의 `CRAWL_SECRET` 입력
3. 수집 편수 설정 (처음엔 10편 추천)
4. **"arXiv 수집 시작"** 클릭
5. 수집 완료까지 약 1~2분 대기

---

## 비용 안내

| 항목 | 비용 |
|------|------|
| arXiv API | 무료 |
| Supabase (500MB 이하) | 무료 |
| Vercel 배포 | 무료 |
| Claude API (논문 1편 분석) | 약 $0.001 (0.1원) |
| 논문 100편 분석 | 약 $0.1 (약 14원) |

---

## Vercel 배포
```bash
git init && git add . && git commit -m "init"
# GitHub에 push 후 vercel.com에서 import
# 환경변수 5개 설정 필수
```
