---
name: qa-loop
description: Write a Playwright spec for a Sutagrow PR. Restate Claims, explore the live DOM with Playwright MCP, then write the spec file. Use when claims are known and api/web are up.
---

# qa-loop

Three phases, in order. The spec file is the last phase.

First decide the mode. The run prompt names it.

| | Mode `local` (Feature 1) | Mode `online` (Feature 2) |
| --- | --- | --- |
| Stack | `api:3005` + `web:3002` in Docker | FE on `127.0.0.1:3000`, BE via Proxy on `127.0.0.1:3018` |
| Claims from | claims JSON the prompt names | same JSON, built from the PR body Block |
| Spec path | `/Users/andie/Documents/GitHub/taw-qa/tmp/taw-qa.spec.mjs` | `<checkout>/tests/e2e/taw-qa-pr-<n>.spec.ts` |
| Runner | host agent runs the file after you exit | `npx playwright test` in the checkout |

Login UI may be Vietnamese (`Đăng nhập`, `Đăng ký`) even when the Claim says Login.

## 1. Claims

Read the claims JSON the run prompt names.

Restate every testable Claim as something observable: status, body text, or on-screen text. Skip mobile, MQTT, prod as `không test`.

Mode `online` also skips realtime / socket / push-notification Claims as `không test`. The Proxy answers `/socket.io/*` with 404 on purpose; a Claim that needs a live socket cannot go green here and must not be asserted.

Done when each testable Claim has that observable written down. Browser still closed.

## 2. MCP

### Mode `local`

URLs: `http://api:3005` and `http://web:3002`. Never `localhost`.

### Mode `online`

The app is not up yet. Start it before you snapshot, in this order:

1. Proxy on `127.0.0.1:3018` — the Runner starts it. Confirm with `GET http://127.0.0.1:3018/health` → 200.
2. FE — run the **exact** `webServer[1]` command from the checkout's `playwright.config.ts` (`buildPrefix && startCmd`).

Running any other build command is the one mistake that silently ruins the run: `buildPrefix` bakes `NEXT_PUBLIC_API_URL=http://127.0.0.1:3018/api` into the bundle, and `reuseExistingServer` will happily reuse a wrong build later without complaining.

URL: `http://127.0.0.1:3000`. Log in with the test account the run prompt names, never a real person's account.

### Both modes

Open Playwright MCP. Navigate to the URL the Claim needs. Snapshot.

Keep snapshot / click / fill until you can point at the element, text, or response field that would prove the Claim, from a snapshot taken this run.

Done when every testable Claim has a locator or response field taken from this run's snapshot.

## 3. Spec

Each testable Claim gets an assertion that fails if the Claim is wrong. Not "page renders", not "status is 2xx".

### Mode `local`

Write `/Users/andie/Documents/GitHub/taw-qa/tmp/taw-qa.spec.mjs`. Playwright import: the absolute `index.mjs` path given in the run prompt. E2e records video to `/Users/andie/Documents/GitHub/taw-qa/tmp/videos`; close the browser context before the browser so the file flushes.

Done when that path exists and contains an `import` of playwright plus `api:3005` or `web:3002`.

### Mode `online`

Write `<checkout>/tests/e2e/taw-qa-pr-<n>.spec.ts`. Import from `@playwright/test` and reuse the repo's own `tests/e2e/helpers` and `fixtures` rather than writing your own.

First line of the file:

```ts
test.describe.configure({ mode: 'serial' });
```

The repo sets `fullyParallel: true`. Without serial, Playwright shuffles order — and this mode writes to shared staging, so a Claim that reads state an earlier Claim created will flake.

Anything the spec creates is named with the prefix `tawqa-pr<n>-`. The cleanup step finds them by that prefix; an entity without it stays in staging forever.

No `page.waitForTimeout`. No screenshot calls — `playwright.config.ts` already has `screenshot: 'only-on-failure'`.

Done when that path exists, starts with the serial line, imports `@playwright/test`, and every created entity name carries the `tawqa-pr<n>-` prefix.
