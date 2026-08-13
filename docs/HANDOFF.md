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

## PR #5 리뷰 대응 — Before/After (2026-08-12)

`/pr-review-toolkit:review-pr`로 PR #5 전체 코드 직접 추적(백엔드 11개 파일 + 마이그레이션 +
프론트 프록시 + 테스트 실행) 후 발견한 Critical 3건 + Important 5건 전부 수정. 각 항목: 문제였던
이유(재현/실측) → 고친 방향과 그게 맞는 이유. 파일별 상세 근거는 커밋 diff 참고, 여기는 왜만.

### 1. `stripe`가 devDependencies (Critical)

**Before**: `backend/package.json`에 `stripe`가 `devDependencies`에 있었음. `Dockerfile:9`는
`npm install --omit=dev`. 실측: `node -e "console.log(require('./package.json').dependencies.stripe)"`
→ `undefined`. 런타임 경로(`charge.worker.ts`, `webhook.worker.ts`, `webhooks.ts`)가 전부
`@/lib/stripe`를 통해 `stripe` 패키지를 직접 import하므로, 프로덕션 컨테이너는 100% 부팅
실패(`Cannot find module 'stripe'`)였을 것. 로컬 `npm run dev`는 루트 `node_modules`에 있는
`stripe`(devDep)를 그대로 resolve해서 증상이 로컬에서는 절대 안 보임 — Docker 빌드로만 드러나는
클래스의 버그.

**After**: `dependencies`로 이동. 이 방향이 맞는 이유: 이 패키지는 "개발 중에만 필요한 도구"가
아니라 프로덕션 요청 경로에서 매번 실행되는 코드가 import하는 런타임 의존성 — devDependencies의
정의(빌드/테스트 전용)에 애초에 안 맞았음. `npm install`로 lockfile도 갱신, `tsc --noEmit` 클린
확인.

### 2. `DISABLE_EMAIL_SENDING` boolean 파싱 버그 (Critical)

**Before**: `z.coerce.boolean()` = `Boolean(문자열)`이라 빈 문자열 외 전부 true. 실측:
`z.coerce.boolean().parse('false')` → `true`, `.parse('0')` → `true`. `.env`에
`DISABLE_EMAIL_SENDING=false`라고 명시적으로 적어도 이메일이 꺼짐. 영향받는 템플릿 2개
(`admin-charge-failed`, `admin-dispute-opened`) 전부 — 결제 실패나 분쟁이 발생해도 관리자에게
알림이 안 가고, 에러도 안 나서 아무도 못 알아챔(silent failure).

**After**: `z.string().optional().transform(v => v === 'true')`로 교체. 리터럴 문자열 `'true'`만
true로 인정, 그 외(`'false'`, `'0'`, undefined)는 전부 false. 검증: `parse('false')` → `false`,
`parse('true')` → `true`, `parse(undefined)` → `false`(기존 `.default(false)`와 동일 동작 유지).
이 방향이 맞는 이유: env var는 사람이 손으로 적는 텍스트라 "명시적으로 쓴 값만 신뢰"가 안전한
기본값 — 애매한 coercion 규칙에 맡기면 오타 하나가 알림 전체를 죽인다.

### 3. 재시도가 실제로 재청구 안 됨 (Critical)

**Before**: `chargeNoShowFee()`(`src/lib/stripe.ts`)가 Stripe idempotency key를
`noshow-{bookingId}-{amount}`로 고정 생성. `charge.worker.ts`의 재시도(`handleChargeError`)는
같은 `chargeAttemptId`로 같은 job을 다시 실행 → 같은 booking+amount → **같은 Stripe key**.
Stripe idempotency key는 24시간 동안 최초 응답(실패 포함)을 그대로 재생하는 게 스펙 동작 —
즉 transient 재시도 3회(1분/5분/1시간)와 insufficient_funds 재시도(24시간)가 설계상 존재하는
재시도 슬롯 4개 중 사실상 전부, Stripe에 도달하기 전에 죽는 네트워크 에러(`ECONNRESET` 등)를
제외하고는 **실제로 카드에 아무 일도 안 일어남**. "3중 방어" 문서화 주장과 달리 재시도 로직은
죽은 코드에 가까웠음.

**After**: `chargeNoShowFee()`에 선택적 `idempotencySuffix` 파라미터 추가, 워커가 매 시도마다
증가하는 `attempt_count`를 넘겨서 Stripe key가 `noshow-{bookingId}-{amount}-{attemptNumber}`로
매번 달라지게 함. 동기 경로(`charge-penalty/route.ts`, 재시도 없음)는 인자를 안 넘기므로
기존 키 형식 그대로 — 회귀 없음. `charge_attempts.idempotency_key`(DB UNIQUE, 앱 레벨
중복 방어)는 그대로 booking+amount 고정 유지 — "이 청구 시도"를 식별하는 키와 "이번 Stripe
호출"을 식별하는 키는 서로 다른 레이어라 분리하는 게 맞음: 전자는 안 바뀌어야 진짜 중복 요청을
잡고, 후자는 매 재시도마다 바뀌어야 재시도가 의미를 가짐.

### 4. Permanent 실패 후 UI에서 영구 재청구 불가 (Important)

**Before**: `idempotencyKey`가 booking+amount로 고정이라, 관리자가 실패한 청구를 다시
누르면 `insertChargeAttempt`가 UNIQUE 충돌 → `describeExistingAttempt`가 새 job 없이 기존
`failed` 행을 그대로 반환. 새 카드로 다시 시도할 방법이 UI상 전혀 없었음(DB 직접 수정 외에는).

**After**: `admin.ts`에서 기존 attempt가 `failed`(=영구 실패, 워커가 더 이상 자동 재시도
안 하는 상태) 상태일 때만 `${idempotencyKey}-manual{n}` 키로 새 행을 만들도록 분기 추가.
`n`은 같은 prefix를 가진 기존 행 개수로 계산. 동시에 두 요청이 같은 `n`을 계산해도
`insertChargeAttempt`의 기존 UNIQUE-충돌-후-재조회 로직이 그대로 안전망이 됨(race-safe,
새 코드 아님, 기존 패턴 재사용). `requires_action`은 3DS 등 고객 조치가 필요한 상태라 단순
재청구 대상이 아니므로 의도적으로 제외.

### 5. 통합 테스트 거짓 양성 + 훅 타임아웃 (Important)

**Before**: 백엔드 미기동 시 `console.warn` + `return` → vitest는 이걸 "1 passed"로 집계.
이중청구 방어라는 핵심 주장이 실제로는 검증 안 된 채 초록불. 게다가 `fetch`에 타임아웃이
없어서 네트워크 접근이 막힌 환경에서는 훅 자체가 10초 타임아웃으로 스위트 전체가 FAIL.
실측: 수정 전 `npm test` → `FAIL ... Hook timed out in 10000ms`, 전체 실행 11.61초.

**After**: `AbortSignal.timeout(2000)`로 헬스체크에 상한, `ctx.skip(skipReason)`으로 진짜
skip 처리(vitest 자체 카운트에 잡힘). 실측: 수정 후 `npm test` → `12 passed | 1 skipped`,
전체 실행 0.95초(12배 이상 단축, 네트워크 대기가 사라졌으므로). 이 방향이 맞는 이유: "테스트가
초록불"과 "테스트가 실제로 뭔가 검증했다"는 다른 얘기 — 전자만 만족시키는 코드는 있으나 마나.

### 6. Stuck-복구 job이 BullMQ dedup을 무력화 (Important)

**Before**: `scheduler.ts`의 `recoverStuckChargeAttempts`가
`jobId: '${idempotency_key}-recover-${Date.now()}'`. 이 스케줄러는 10분마다 실행되고, 복구
대상 기준은 "1시간 이상 업데이트 없음"이라 최악의 경우 같은 stuck 행에 대해 최대 6개의
서로 다른 jobId(매 스캔마다 새 `Date.now()`)가 큐에 쌓임 — jobId 기반 dedup을 설계자가
직접 무력화한 코드.

**After**: `jobId`를 `${idempotency_key}-recover-${attempt.attempt_count}`로 결정론화 —
같은 행이 같은 `attempt_count`인 동안은 여러 번 스캔돼도 항상 같은 jobId라 BullMQ가 자동
dedup. 실제로 워커가 집어서 실행하면 `attempt_count`가 올라가고 `updated_at`도 갱신되므로
스캔 조건(`updated_at < cutoff`)에서 자연히 빠짐 — 별도 정리 로직 없이 저절로 멈춤.
`removeOnComplete`/`removeOnFail` 추가해서 jobId 재사용 시 "이미 완료된 job" 충돌도 방지.

### 7. 다른 금액 동시 요청 시 이중 청구 경로 (Important)

**Before**: idempotency key에 `amountCents`가 포함되므로, 같은 예약에 대해 금액이 다른
동시 요청 2건은 서로 다른 키 → 둘 다 UNIQUE 통과 → 둘 다 `booking.status !== 'noshow_charged'`
read-then-write 가드 통과 가능(둘 다 아직 안 charged인 시점에 읽음) → `charge_attempts` 행
2개, Stripe 실제 청구 2건 가능. 마이그레이션 주석은 UNIQUE가 "중복 청구 방어"라 서술했지만
**동일 금액에 한해서만** 참이었음 — 앱 레벨 read-then-write 가드는 원천적으로 이 레이스를
못 막음(DB 트랜잭션 없이 두 프로세스가 동시에 읽으면 항상 뚫림).

**After**: 새 마이그레이션(`20260812000300_charge_attempts_one_active_per_booking.sql`)으로
`booking_id`에 partial UNIQUE INDEX(`WHERE status != 'failed'`) 추가 — 한 booking당
active/resolved 행이 항상 최대 1개만 존재하도록 DB가 직접 강제. `failed`는 제외(4번 항목의
수동 재시도 흐름과 호환). `db.ts`의 `insertChargeAttempt`가 이 새 제약의 충돌도 구분해서
처리(에러 메시지로 어느 제약인지 판별 후 적절히 재조회). 이 방향이 맞는 이유: 애플리케이션
레벨 read-then-write 체크는 원리적으로 레이스를 못 막는다 — DB 제약만이 진짜 원자적 보장이고,
이건 그 원칙을 따른 것. Supabase에 수동 적용 완료(사용자 확인).

### 8. Graceful shutdown 부재 (Important)

**Before**: `index.ts`에 SIGTERM/SIGINT 핸들러 없음. 배포 시 플랫폼이 SIGTERM을 보내면
Node가 즉시 종료 — 진행 중이던 Stripe 호출이 그 자리에서 잘림. 이후 최대 1시간 동안(6번
항목의 stuck 복구 주기 기준 threshold) `processing` 상태로 매달려 있다가 복구됨. Grace
period 사실상 0초.

**After**: `SIGTERM`/`SIGINT` 핸들러 추가, `chargeWorker/emailWorker/webhookWorker/
schedulerWorker` 전부 `worker.close()`(BullMQ가 진행 중인 job이 끝날 때까지 대기 후
종료) 호출 후 프로세스 종료. 이 방향이 맞는 이유: 결제 코드 경로는 "언제 죽어도 괜찮은"
코드가 아님 — 배포가 매일 여러 번 일어날 수 있는데, 그때마다 진행 중인 Stripe 호출이
잘릴 위험을 감수할 이유가 없고, `worker.close()` 몇 줄로 없앨 수 있는 위험이었음.

### 검증

- `backend`: `tsc --noEmit` 클린, `npm test` → 12 passed | 1 skipped (변경 전: 1 suite
  FAIL, hook timeout)
- root: `tsc --noEmit` 클린(암묵적으로 `src/lib/stripe.ts` 시그니처 변경 영향 확인),
  `npm test` → 30 passed | 1 skipped
- `backend/package-lock.json` 갱신 확인(`stripe` deps 이동 반영)

### 안 한 것 (스코프 밖, 사용자 확인 필요)

- 새 마이그레이션(`20260812000300`) — 사용자가 Supabase에 수동 적용 완료
- 6번 항목: `processing` 상태에서 실제로 아직 살아있는 job과 stuck 복구 job이 동시에
  도는 이론적 레이스(1시간 이상 걸리는 Stripe 호출은 사실상 없다는 전제로 리스크 낮음)는
  건드리지 않음 — jobId dedup 버그만 고침, 근본적인 "복구 대상 판정" 로직 자체는 그대로

## PR #5 2차 리뷰 대응 — 정원(capacity) P1 2건 (2026-08-12)

Vercel 체크 실패 수정 + 2차 코드 리뷰가 지적한 P1 2건 수정. 계획 원본은
`.claude/plans/findings-p1-resilient-perlis.md` (로컬 plan 파일, repo 밖).

### 0. Vercel 빌드 실패 — root tsconfig가 `backend/`를 삼킴 (커밋 48f2c63)

**Before**: root `tsconfig.json`의 `include`가 `**/*.ts`라 새로 생긴 `backend/`까지 쓸어담음.
Next.js 빌드의 TypeScript 단계가 `backend/src/index.ts`를 타입체크하다
`Cannot find module 'express'`로 실패 — `express`는 `backend/node_modules`에만 있고 root에는
없으니까. 로컬 `npm test`는 `src`만 보므로 증상이 안 보였고, Vercel 배포에서만 터짐.

**After**: root `tsconfig.json`의 `exclude`에 `backend` 추가. backend는 자기 `tsconfig.json`과
`npm run build`(=`tsc --noEmit`)를 따로 갖고 있으므로 타입 커버리지 손실 없음.

### 1. 겹치는 슬롯이 정원 합산에서 누락 (P1, 정확성)

**근본 원인**: `MAX_CAPACITY = 45`가 사실상 **죽은 상수**였음. 실제 소비처는 두 곳뿐 —
`availability.ts`의 admin override 분기, `admin/page.tsx`의 경고 문구. 공개 예약 라우트,
availability 라우트, admin PATCH, SQL 어디에도 없었음. 실제로 동작하던 규칙은 정원이 아니라
one-team-per-slot(`idx_bookings_one_team_per_slot` 부분 유니크 인덱스)이고, 점유 판정이 전부
`(booking_date, slot_start, slot_end)` **정확 일치**였음.

그런데 슬롯 정의는 시간상 겹침 — 일/수/목의 early(17:00–19:30)와 mid(18:00–20:15)는 90분
동안 같은 홀에 있음. 정확 일치 필터는 이 둘을 다른 버킷으로 세므로 동시 인원이 합산에서 빠짐.

**After — 두 개념을 분리한 게 핵심**:

| 개념 | 질문 | 판정 | 함수 |
|---|---|---|---|
| 슬롯 점유 | "이 슬롯에 이미 팀이 있나?" | 정확 일치 | `getGuestsInTimeRange` (기존, 그대로) |
| 동시 인원 | "이 시각 홀에 몇 명인가?" | 시간 겹침 | `getConcurrentGuests` (신설) |

**`getGuestsInTimeRange`를 겹침 쿼리로 바꾸면 안 됨** — `checkSlotAvailability`가 그 반환값으로
`hasExistingBooking`을 만들고 이게 one-team-per-slot 게이트라, 겹침으로 바꾸면 early 슬롯에
팀이 있을 때 mid 슬롯 예약이 통째로 막힘(제품 파괴). 다음 세션에서 "왜 두 함수가 비슷한 걸
세고 있지?" 하고 합치려 하지 말 것. `availability.ts`의 doc comment가 원래
"querying overlapping bookings"라고 거짓말하고 있던 게 이번 결함의 직접 원인이라 정직하게 고침.

겹침 판정(`slotsOverlap`)은 SQL이 아니라 JS에서 함. 금/토 late 슬롯이 `slot_end = '00:00'`
(=다음날 자정)인데 PostgREST의 `time` 비교로는 이걸 표현할 수 없음. 날짜당 행 수가 슬롯 3개
규모라 비용은 무의미. `timeToMinutes(t, isEnd)`가 종료 시각 `'00:00'`만 1440으로 읽음.

override 분기(`checkSlotAvailability`)도 `getConcurrentGuests`로 교체 — 안 그러면 override가
겹치는 좌석 위에 45명을 더 앉힐 수 있음.

### 2. 정원이 서버에서 강제되지 않음 (P1, 보안/무결성)

**Before**: `admin/bookings/[id]/route.ts`는 `party_size >= 1`만 검사. UI는 경고만 띄우고
저장 허용("저장은 가능합니다"). 인증된 요청으로 `{"party_size": 200}`을 직접 보내면 그대로
저장됨 — UI 경고는 보안 경계가 아님.

**After**: 인원/시간/날짜가 바뀌면 `getConcurrentGuests(targetDate, targetStart, targetEnd, id)`로
자기 자신을 제외한 동시 인원을 세고, 합계가 `MAX_CAPACITY` 초과면 409
`{ capacityExceeded, currentGuests, requested, max }`. 라우트에 **이미 있던 `force_overbook`
플래그를 재사용** — 관리자가 확인 후 재요청하면 통과하고 `bypassed_slot_limit = true`로 흔적을
남김. 신규 필드/마이그레이션 없음. 별도 audit 테이블은 안 만듦(`bypassed_slot_limit`이 이미
흔적), 누가/언제가 필요해지면 그때.

`updates.bypassed_slot_limit = false`(슬롯 충돌 없음 분기)를 정원 override가 덮어쓰도록 순서
배치했음 — 두 블록 순서 바꾸지 말 것.

### 3. 클라이언트 중복 계산 삭제

`admin/page.tsx`에서 `/api/bookings?date=`를 fetch해 정확 일치로 합산하던 useEffect(~40줄)와
경고 렌더링 블록 삭제. 서버가 409를 주면 **기존 `conflict` 409 확인 다이얼로그 흐름을 재사용**해
확인받고 `force_overbook: true`로 재요청. 클라이언트/서버 규칙 드리프트가 이번 P1-a의 원인이라
계산 자체를 한쪽에서 없앰.

### 4. `requireAuth` 타입 (부수 수정, 필요했음)

`Promise<{ authenticated: boolean; error?: Response }>`라 `return auth.error`가
`Response | undefined`가 되고, 모든 admin 라우트의 핸들러 반환 타입에 `undefined`가 섞임.
새 통합 테스트에서 `response.status` 접근이 TS18048로 터져서 발견. discriminated union
(`{authenticated: true} | {authenticated: false; error: Response}`)으로 교체 — 호출부
narrowing이 자동으로 되므로 기존 라우트 12곳 수정 불필요.

### 검증

- `slotsOverlap` 유닛 5건(자정 wrap-around, `HH:MM:SS` 입력, 경계 접촉 non-overlap)
- `src/app/api/admin/bookings/[id]/route.integration.test.ts` 신설 3건 — 실제 Supabase.
  **강제 로직을 비활성화하니 2건이 실패하는 것까지 확인**(빈 테스트 아님). 이웃 예약을 일부러
  *겹치는 다른 슬롯*에 심어서, 정확 일치 방식이면 others=0이 나와 통과해버리도록 설계함.
- 공개 예약 회귀 1건 — 겹치는 두 슬롯을 각각 예약해도 둘 다 200 (이번 변경의 최대 리스크인
  "정상 예약 차단"을 직접 방어)
- `tsc --noEmit` 클린, `npm run lint` 24 problems(베이스라인과 **동일**, 3 errors 전부 기존
  `any` 관련), `npm test` 7 files / 39 passed | 1 skipped, `npm run build` 성공

### 안 한 것 (스코프 밖)

- admin PATCH의 시간 값을 슬롯 카탈로그(`getSlotsForDate`)에 대조하는 검증 — 지금은 정규식만
  통과하면 임의 시각 저장 가능(공개 경로에는 있는 검증). 별개 결함, 이번 P1과 무관해서 안 건드림.
- `getAvailabilityForDate`의 슬롯당 N+1 쿼리, admin 라우트 zod 스키마 도입, 정원 override
  audit 테이블

## 함정 주의 (반복 실수 방지)

- **Stripe 매직 카드 토큰 순서 중요**: `pm_card_visa`는 attach 후 반드시 `usage:'off_session'` SetupIntent를 confirm까지 거쳐야 나중에 off-session 청구가 성공함(안 그러면 insufficient_funds로 거절됨 — Radar가 "미인증 첫 사용"으로 봄). 반대로 `pm_card_visa_chargeDeclinedInsufficientFunds` 같은 decline 토큰은 **attach 자체도 거절됨** — SetupIntent도 attach도 건너뛰고 토큰 문자열을 그대로 `payment_method_id`로 써야 함. `scripts/charge-pipeline-benchmark.test.ts`의 `createTestCustomerWithCard` vs `createDeclineTestCustomer` 참고.
- **BullMQ enqueue 응답(202)과 실제 처리(워커)는 별개 타이밍**. 테스트에서 booking row를 지우기 전에 `charge_attempts` 상태가 종료 상태(succeeded/failed/...)에 도달할 때까지 폴링해서 기다려야 함(`waitForChargeAttemptsToSettle` 패턴). 안 그러면 워커가 이미 지워진 booking을 찾다가 "0 rows" 에러 남.
- **CJS/ESM 프로젝트 간 같은 npm 패키지를 `instanceof`로 비교하지 말 것.** root는 CJS(Next.js), backend는 `"type":"module"`(ESM) — 같은 `stripe` 버전이라도 서로 다른 클래스 인스턴스. 에러 판별은 무조건 프로퍼티(`.type`, `.code` 등) 기반으로.
- **통합 테스트끼리 예약 날짜가 겹치면 서로를 깨뜨림.** vitest는 테스트 *파일*을 병렬 실행하는데 DB는 하나뿐이라, 이메일 도메인 격리는 cleanup만 지켜줄 뿐 슬롯 점유는 못 막음. 실제로 새 capacity 테스트가 offset 8일부터 날짜를 고르는 바람에 `route.race.test.ts`가 노리던 슬롯을 선점해서 race 테스트가 "50개 요청 전부 409"로 실패했음. 현재 분할: `route.race.test.ts` 8–30일, `route.integration.test.ts` 15–30일, `admin/bookings/[id]/route.integration.test.ts` **31–60일**. 새 통합 테스트를 추가하면 겹치지 않는 구간을 새로 잡을 것.
- 벤치마크/테스트가 만드는 데이터는 이메일 도메인으로 격리됨: `@benchmarktest.example`, `@duplicatechargetest.example`, `@loadtest.example`(기존 concurrency-benchmark). 전부 `afterAll`에서 정리되지만, 테스트가 중간에 죽으면 수동으로 지워야 할 수 있음.
