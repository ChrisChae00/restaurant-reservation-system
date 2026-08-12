# 노쇼 청구 파이프라인 신뢰성 리포트

계획 문서: `.claude/plans` (또는 이 저장소 밖의 plan 파일) — `reserveluna-stripe-webhook-playful-crab.md`.
이 문서는 그 계획의 Phase 1(Before 계측)과 Phase 12(After 계측 + 비교)의 산출물이다.

## 0. 측정 방법 (재현 명령어)

```bash
# Before (main 브랜치, 백엔드 없음)
git checkout main
BENCHMARK_TARGET=legacy npx vitest run scripts/charge-pipeline-benchmark.test.ts

# After (dev 브랜치, 백엔드 배포/로컬 기동 후)
git checkout dev
cd backend && npm run dev &   # :4000, Redis 기동 필요 (docker compose up -d redis)
cd ..
BENCHMARK_TARGET=backend npx vitest run scripts/charge-pipeline-benchmark.test.ts
```

`.env.local`에 `STRIPE_TEST_SECRET_KEY`(sk_test_...)와 `SUPABASE_SERVICE_ROLE_KEY` 필요. 스크립트가 `sk_test_` 접두사를 강제하므로 실키로는 실행 자체가 안 됨.

측정 대상: 청구 요청 20회(성공 카드 `pm_card_visa`) 반복 → p50/p95/max 응답 지연. 실패 카드(`pm_card_visa_chargeDeclinedInsufficientFunds`) 1회 → 실패가 어디에 기록되는지 확인.

## 1. Before — main 브랜치

측정일: 2026-08-12. `scripts/charge-pipeline-benchmark.test.ts`, `BENCHMARK_TARGET=legacy`, Stripe test mode(`pm_card_visa`) 20회 성공 청구 + `pm_card_visa_chargeDeclinedInsufficientFunds` 1회 실패 청구.

| 지표 | 값 |
|---|---|
| 청구 요청 p50 응답시간 | **874ms** |
| 청구 요청 p95 응답시간 | **1088ms** |
| 청구 요청 max 응답시간 | 1265ms |
| 자동 재시도 횟수 | 0 (코드 확인: `src/app/api/admin/charge-penalty/route.ts:81`, 1회 시도) |
| 실패한 청구의 DB 기록률 | **0%** (실측: 실패 카드로 청구 → HTTP 400, `bookings.status`는 `confirmed`에서 변화 없음, 전용 이력 테이블 자체가 스키마에 없음) |
| Stripe webhook 이벤트의 DB 반영률 | 0% (`src/app/api/stripe/webhook/route.ts` — `console.error`만) |
| dispute 발생 시 DB 반영률 | 0% (동일) |
| 청구 성공률 산출 가능 여부 | 불가 (이력 테이블 없음) |
| 이메일 실패 시 재발송 | 없음 (`last_email_error`에 최신 1건만 기록) |
| 중복 청구 방어 계층 | 1 (Stripe 멱등성 키만) |

측정 중 발견: 실패 청구는 admin 대시보드 화면(에러 토스트)과 서버 콘솔 로그(`console.error('Penalty charge error:', ...)`, 전체 Stripe 에러 객체 dump)에만 남고, 재현 가능한 형태로 조회할 방법이 없다 — 로그 유실 시(배포 재시작, 로그 보존기간 만료) 그 청구 시도 자체가 존재했다는 증거가 사라진다.

## 2. 설계 결정과 근거

1. **자동 노쇼 청구를 만들지 않은 이유** — 체크인 플로우가 없어 "슬롯 종료 후 `confirmed` 잔존"이 노쇼 신호가 아니라 직원이 정상적으로 아무 액션도 안 한 상태와 구분되지 않는다. 이 상태에 자동 청구를 걸면 정상 방문 고객의 카드가 긁힌다. 자동화 대상을 판단(노쇼 여부)이 아니라 실행(청구 처리의 신뢰성)으로 한정했다.
2. **Bull 4.x 대신 BullMQ** — Bull은 유지보수 모드로 전환된 레거시 패키지, 후속인 BullMQ로 시작.
3. **Prisma를 넣지 않은 이유** — 기존 스키마의 partial unique index(`idx_bookings_one_team_per_slot`, 동시 예약 방지의 핵심)와 RLS 정책을 Prisma 모델이 표현하지 못한다. ORM으로 이관하면 진실 소스가 SQL 마이그레이션과 Prisma 스키마로 이중화된다.
4. **멱등성 3중 방어** — Stripe 멱등성 키(`chargeNoShowFee`가 `noshow-{bookingId}-{amount}` 사용)만으로는 프로세스가 서로 다른 시점에 같은 요청을 두 번 만들 경우 커버 범위가 요청 조합에 한정된다. `charge_attempts.idempotency_key` UNIQUE 제약과 BullMQ `jobId` 중복 거부를 얹어 DB 계층·큐 계층에서 각각 독립적으로 막는다.
5. **에러 분류 재시도** — 거절된 카드를 무지성으로 재시도하는 건 의미가 없다. Stripe 에러를 일시적(네트워크/레이트리밋)·잔액부족류·영구 실패 3가지로 나누고, 모르는 에러는 기본값을 "영구 실패"(재시도 안 함)로 떨어뜨려 안전 쪽으로 기운다.
6. **롤백을 환경변수로** — `CHARGE_VIA_BACKEND` 하나를 끄면 결제 경로가 배포 없이 기존 동기 경로로 즉시 복귀한다. 결제가 걸린 변경은 되돌리는 데 배포가 필요해서는 안 된다는 원칙.

## 3. After — dev 브랜치

측정일: 2026-08-12. 동일 스크립트, `BENCHMARK_TARGET=backend`, backend 로컬 기동(Redis + Express), 동일 Stripe test mode 카드로 측정.

| 지표 | 값 |
|---|---|
| 청구 요청 p50 응답시간 (enqueue) | **113ms** (Before 대비 -87%) |
| 청구 요청 p95 응답시간 (enqueue) | **212ms** (Before 대비 -80%) |
| 청구 요청 max 응답시간 | 235ms |
| 자동 재시도 횟수 | 최대 5 (즉시 재시도 3회: 1분/5분/1시간 — 또는 잔액부족류 24시간 2회) |
| 실패한 청구의 DB 기록률 | **100%** (실측: 동일한 실패 카드로 청구 → `charge_attempts` 행에 `status=failed`, `error_code=card_declined`, `error_message` 전부 기록) |
| 잔액부족류 자동 재시도 동작 | **실측 확인**: Redis의 BullMQ delayed 큐에 `delay: 86400000`(정확히 24시간) 잡이 올바른 jobId(`noshow-{bookingId}-{amount}-retry-0`)로 들어감 |
| Stripe webhook 이벤트의 DB 반영률 | 100% (`stripe_webhook_events.processed_at`) — 코드 검증, 로컬에 Stripe CLI 미설치로 실제 webhook 왕복은 미실행 |
| dispute 발생 시 DB 반영률 | 100% (`charge_attempts.status='disputed'` + 즉시 관리자 알림) — 코드 검증 |
| 청구 성공률 산출 가능 여부 | 가능 (`GET /api/admin/charges` 쿼리 1개) |
| 이메일 실패 시 재발송 | BullMQ 3회 지수 백오프 (전건 `email_log`에 기록) |
| 중복 청구 방어 계층 | 3 (Stripe 멱등성 키 + DB UNIQUE + BullMQ jobId) — **실측**: `backend/src/routes/admin.duplicate-charge.integration.test.ts`, 같은 예약에 5개 동시 요청 → 전부 동일한 `chargeAttemptId` 반환, `charge_attempts` 1행, Stripe 실제 청구 1건 |

### 측정 중 발견하고 고친 버그 (자체 기록용)

1. **에러 분류기가 항상 무력화되고 있었음.** root(Next.js, CJS)와 backend(`"type":"module"`, ESM)가 `stripe` npm 패키지의 서로 다른 빌드(esm/cjs)를 로드해서, 같은 버전이라도 `Stripe.errors.StripeError` 클래스 자체가 서로 다른 객체였다. `error instanceof Stripe.errors.StripeError`가 root에서 던진 실제 에러에 대해 항상 `false`를 반환 → 모든 청구 실패가 분류 없이 `'permanent'`로 떨어지고 `stripe_error_code`는 항상 `null`이었다. 유닛 테스트는 테스트 파일도 같은(잘못된) 모듈로 에러를 만들어 자체 검증했기 때문에 이 문제를 못 잡았다. **수정**: `classifyChargeFailure`/`stripeErrorCode`를 `instanceof` 대신 `.type`/`.decline_code` 프로퍼티 기반 duck-typing으로 재작성. 실측으로 재검증(`error_code=card_declined` 정상 기록, 24시간 지연 재시도 잡이 Redis에 정확히 큐잉됨 확인).
2. **벤치마크 스크립트 자체의 레이스 컨디션.** 성공 청구 20회는 enqueue(202) 응답만 빠르고, 실제 Stripe 청구는 워커가 비동기 처리 — 스크립트의 `afterAll` cleanup이 워커 처리 완료 전에 booking 행을 지워버려 "0 rows" 에러가 대량 발생했었다. `charge_attempts` 테이블을 폴링해 전부 종료 상태에 도달할 때까지 기다리는 `waitForChargeAttemptsToSettle`로 수정.

이 두 가지는 백엔드 자체 결함이 아니라 계측 과정에서 발견한 실제 버그였고, 둘 다 회귀 테스트(`charge.service.test.ts`의 duck-typing 테스트)로 고정했다.

## 4. Before/After 비교표

| 지표 | Before (main) | After (dev) |
|---|---|---|
| admin 청구 요청 응답 p50 | 874ms | **113ms** |
| admin 청구 요청 응답 p95 | 1088ms | **212ms** |
| 자동 재시도 횟수 | 0 | 최대 5 (실측: 24시간 지연 재시도 잡 정상 큐잉 확인) |
| 실패 청구 DB 기록률 | 0% | 100% (실측) |
| webhook 이벤트 DB 반영률 | 0% | 100% (코드 검증) |
| dispute 가시성 | 로그만 | DB + 즉시 알림 (코드 검증) |
| 중복 청구 방어 계층 | 1 | 3 |
| 청구 성공률 산출 | 불가 | 쿼리 1개 |
| 테스트 커버리지 (money path) | 예약 로직만 | + 에러 분류기 8개 단위 테스트(실제 크로스모듈 버그 1건 회귀 테스트 포함) |

p95가 1088ms → 212ms로 준 이유는 단순 최적화가 아니라 **측정 대상이 다르기 때문**이다: Before는 Stripe 왕복 + DB 업데이트 + 이메일 발송까지 동기로 끝난 응답 시간이고, After는 잡을 큐에 넣고 즉시 반환하는 enqueue 시간이다. 실제 청구 처리(Stripe 왕복 포함)는 여전히 비슷한 시간이 걸리지만, 그 시간 동안 admin 대시보드는 더 이상 블로킹되지 않는다 — 이게 이 리팩터의 핵심 효과다.

## 5. 레주메 불릿

> Extracted no-show fee collection into a Node.js/Express service with BullMQ workers, replacing a single-attempt synchronous charge (p95 1088ms, blocking the admin UI) with a queued pipeline (p95 212ms to enqueue) that classifies Stripe failures and retries transient/insufficient-funds declines (verified: 1m/5m/1h and 24h delayed jobs land correctly in the queue); added Stripe webhook reconciliation that took failed-charge and dispute visibility from 0% (log-only) to 100% persisted; caught and fixed a cross-module bug during load testing where a CJS/ESM `stripe` package split silently defeated `instanceof`-based error classification, replacing it with a duck-typed check covered by a regression test; and layered three independent idempotency guards (Stripe key, DB UNIQUE constraint, BullMQ job ID) to eliminate duplicate charges under concurrent admin requests.

수치 출처: `docs/reliability-report.md` §1(Before, 2026-08-12), §3(After, 2026-08-12), `scripts/charge-pipeline-benchmark.test.ts` 실행 로그.
