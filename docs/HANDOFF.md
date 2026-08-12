# 인수인계 — 노쇼 청구 파이프라인 백엔드 작업

새 세션에서 이어갈 때 이 파일부터 읽을 것. 계획 원본은
`.claude/plans/reserveluna-stripe-webhook-playful-crab.md` (로컬 plan 파일, repo 밖).
실측 수치·설계 근거·레주메 불릿은 `docs/reliability-report.md`.

## 지금 상태 (요약)

`dev` 브랜치에서 작업 중. Express 백엔드(`backend/`)로 노쇼 수수료 청구를
동기 1회 시도 → 큐 기반 재시도+관측 파이프라인으로 교체하는 작업 **거의 완료**.
**자동 노쇼 청구는 만들지 않음** — 체크인 플로우가 없어서 오탐=오청구 리스크,
청구 트리거는 항상 admin 수동. 이 결정은 사용자가 명시적으로 확정함, 절대 뒤집지 말 것.

## 완료된 것

- [x] Phase 0: `dev` ← `main` 동기화, push 완료
- [x] Phase 2: 마이그레이션 3개 (`supabase/migrations/20260812000{000,100,200}_*.sql`) — **Supabase에 이미 적용 완료**, 확인함 (`stripe_webhook_events`, `charge_attempts`, `email_log` 테이블 존재)
- [x] Phase 3~9: `backend/` 전체 스캐폴딩 — webhook 정산, 청구 큐+워커(에러 3분류 재시도: 일시적/잔액부족/영구), 이메일 워커+로그, admin 조회 API, 스케줄 잡(미해결 예약 리마인더 + 막힌 청구 복구, **자동 청구 아님**)
- [x] Phase 8: `src/app/api/admin/charge-penalty/route.ts`에 백엔드 프록시 분기(`CHARGE_VIA_BACKEND` env로 롤백), `src/app/admin/page.tsx`에 폴링 UI, `src/app/api/admin/charges/[bookingId]/route.ts` 신설(프록시)
- [x] 보안 리뷰 반영: HTML injection(admin 알림 메일 이스케이프), 청구 금액 zod 검증 추가
- [x] Phase 1 Before 실측 (main 동기 경로): p50=874ms, p95=1088ms, 실패 청구 DB 기록률 0%
- [x] Phase 12 After 실측 (backend 큐 경로): p50=113ms, p95=212ms, 실패 청구 DB 기록률 100%, 24시간 재시도 잡 Redis에 실제 큐잉 확인
- [x] 중복 청구 방어 실측: 5개 동시 요청 → `charge_attempts` 1행, Stripe 실제 청구 1건 (`backend/src/routes/admin.duplicate-charge.integration.test.ts`)
- [x] **치명적 버그 발견+수정**: root(CJS, Next.js)와 backend(`"type":"module"`, ESM)가 `stripe` npm 패키지의 다른 빌드(cjs/esm)를 로드 → `instanceof Stripe.errors.StripeError`가 항상 false → 에러 분류기가 전부 'permanent'로 떨어지고 `stripe_error_code`가 항상 null이었음. `backend/src/services/charge.service.ts`를 duck-typing(`.type`/`.decline_code` 프로퍼티 체크)으로 재작성, 회귀 테스트 추가(`charge.service.test.ts`)
- [x] 타입체크(root+backend) 클린, 테스트 전부 통과 (root 31개, backend 13개)
- [x] `.gitignore`에 `backend/node_modules`, `backend/dist` 추가 (원래 루트만 잡던 버그 발견해서 고침)
- [x] 리포트 완성: `docs/reliability-report.md` (Before/After 표, 설계 근거 6가지, 레주메 불릿 확정본)

## 안 한 것 / 스킵한 것

- [ ] **Stripe CLI로 webhook 실시간 왕복 테스트 안 함** (사용자가 스킵 선택). `stripe listen --forward-to localhost:4000/api/webhooks/stripe` + `stripe trigger payment_intent.payment_failed` / `charge.dispute.created` 로 실행 가능. 코드 자체는 작성됐고 로직 리뷰는 됐지만 실제 Stripe 이벤트로 검증은 안 됨.
- [ ] **실제 배포 안 함** (Railway/Render 등). `backend/Dockerfile` 있음, 계획 Phase 11 참고.
- [ ] `CHARGE_VIA_BACKEND=true`로 실제 admin UI에서 브라우저 클릭 테스트 안 함 — API 레벨(curl/vitest)로만 검증됨. Chrome에서 로그인 → 대시보드 → 청구 버튼 눌러서 폴링 UI 눈으로 확인 필요.
- [ ] `.env.local.example` / `backend/.env.example`는 갱신했지만 실제 프로덕션(Vercel) 환경변수는 아직 하나도 안 건드림 (`BACKEND_URL`, `BACKEND_INTERNAL_SECRET`, `CHARGE_VIA_BACKEND`, `STRIPE_WEBHOOK_SECRET`).

## 로컬 개발 환경 상태 (다음 세션에서 그대로 재현 가능)

- **Redis**: `docker compose up -d redis` — `docker-compose.yml`이 repo 루트에 있음
- **backend/.env**: 이미 로컬에 존재함(gitignored, 커밋 안 됨). `.env.local`(root)의 값 재사용 + 랜덤 생성한 `BACKEND_INTERNAL_SECRET`(48자 hex). `DISABLE_EMAIL_SENDING=true`로 되어있어서 로컬 테스트 중 진짜 관리자 메일 안 나감. `STRIPE_WEBHOOK_SECRET`은 플레이스홀더(`whsec_local_placeholder_no_stripe_cli`) — 실제 webhook 테스트하려면 Stripe CLI로 발급받은 진짜 값으로 교체 필요.
- **root `.env.local`**: `STRIPE_TEST_SECRET_KEY`(rk_test_... restricted key, 권한: Customers/PaymentMethods/SetupIntents/PaymentIntents Write + Charges Read), `BACKEND_URL=http://localhost:4000`, `BACKEND_INTERNAL_SECRET`(backend/.env와 동일 값), `CHARGE_VIA_BACKEND=false`(기본 꺼짐, 프로덕션 안전)
- backend 기동: `cd backend && npm run dev` (포트 4000, tsx watch)
- 벤치마크 재실행: `BENCHMARK_TARGET=legacy|backend npx vitest run scripts/charge-pipeline-benchmark.test.ts --reporter=verbose` (verbose 안 쓰면 성공 시 console.log 안 보임, 주의)

## 다음에 할 일 후보 (사용자 확인 필요, 임의로 진행하지 말 것)

1. Stripe CLI 설치(`brew install stripe/stripe-cli/stripe`) 후 실제 webhook 왕복 테스트
2. Chrome으로 admin UI에서 `CHARGE_VIA_BACKEND=true` 켜고 실제 클릭 테스트
3. Railway/Render 배포 (계획 Phase 11)
4. `docs/reliability-report.md`의 레주메 불릿 최종 확정 (지금 초안 있음, 배포 후 수치 안 바뀌면 그대로 써도 됨)

## 함정 주의 (반복 실수 방지)

- **Stripe 매직 카드 토큰 순서 중요**: `pm_card_visa`는 attach 후 반드시 `usage:'off_session'` SetupIntent를 confirm까지 거쳐야 나중에 off-session 청구가 성공함(안 그러면 insufficient_funds로 거절됨 — Radar가 "미인증 첫 사용"으로 봄). 반대로 `pm_card_visa_chargeDeclinedInsufficientFunds` 같은 decline 토큰은 **attach 자체도 거절됨** — SetupIntent도 attach도 건너뛰고 토큰 문자열을 그대로 `payment_method_id`로 써야 함. `scripts/charge-pipeline-benchmark.test.ts`의 `createTestCustomerWithCard` vs `createDeclineTestCustomer` 참고.
- **BullMQ enqueue 응답(202)과 실제 처리(워커)는 별개 타이밍**. 테스트에서 booking row를 지우기 전에 `charge_attempts` 상태가 종료 상태(succeeded/failed/...)에 도달할 때까지 폴링해서 기다려야 함(`waitForChargeAttemptsToSettle` 패턴). 안 그러면 워커가 이미 지워진 booking을 찾다가 "0 rows" 에러 남.
- **CJS/ESM 프로젝트 간 같은 npm 패키지를 `instanceof`로 비교하지 말 것.** root는 CJS(Next.js), backend는 `"type":"module"`(ESM) — 같은 `stripe` 버전이라도 서로 다른 클래스 인스턴스. 에러 판별은 무조건 프로퍼티(`.type`, `.code` 등) 기반으로.
- 벤치마크/테스트가 만드는 데이터는 이메일 도메인으로 격리됨: `@benchmarktest.example`, `@duplicatechargetest.example`, `@loadtest.example`(기존 concurrency-benchmark). 전부 `afterAll`에서 정리되지만, 테스트가 중간에 죽으면 수동으로 지워야 할 수 있음.
