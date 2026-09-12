# Spec Feature 1: QA loop Docker local cho Sutagrow

Một agent implement Feature 1 từ file này. File này là nguồn sự thật. Ticket Linear chỉ cắt việc, không thêm quyết định.

Thuật ngữ: [`CONTEXT.md`](../../CONTEXT.md). Map: [Spec Feature 1: QA loop Docker local cho Sutagrow](https://linear.app/andie-monterro/issue/AND-120/spec-feature-1-qa-loop-docker-local-cho-sutagrow).

## Xong khi nào

Operator trên một Mac chạy một lệnh, dán URL GitHub PR của `sutagrow-api` hoặc `sutagrow-web`. Agent trong container kéo code, start Stack, test theo Claim, đăng Report lên GitHub và ticket Plane khớp. Cả PASS lẫn FAIL đều có comment.

Spec này chưa phải CLI chạy được. Implement xong mới là CLI chạy được.

## Ngoài phạm vi

CI. Nhiều operator. `sutagrow-mobile`, `sutagrow-admin`, `sutagrow-tenant-admin`. Harness cho stack khác. Test trên staging/prod server. Merge script vào `sutagrow-automation-test`. Agent khác Claude Code. Docker-in-Docker. Playwright trên host.

## Kiến trúc

Một file compose. Bốn service: `agent`, `api`, `web`, `mongo`. Cùng Docker network.

```
Mac operator
  bin/taw-qa run <pr-url>
    → compose up `agent` (host chỉ start agent)
         agent mount docker.sock
         agent checkout PR → $HOME/taw-qa/checkouts/
         agent start `mongo` (restore dump nếu volume trống)
         agent start `api` + `web`
         Playwright MCP trong agent gọi http://api:3005 và http://web:3002
         Report → GitHub PR + mọi ticket Plane khớp
```

Agent không thuộc Stack. Stack là `api` + `web` + `mongo`.

### Path trên Mac

| Cái | Path |
| --- | --- |
| Checkout PR | `$HOME/taw-qa/checkouts/sutagrow-api`, `$HOME/taw-qa/checkouts/sutagrow-web` |
| Dump Mongo | `$HOME/taw-qa/mongo/` (archive gzip) |
| `.env` api | `/Users/andie/agribeacon-ws/sutagrow-api/.env` |
| `.env` web | `/Users/andie/agribeacon-ws/sutagrow-web/.env` |
| Volume Claude | named volume `taw-qa-agent-claude` |
| Volume Mongo | named volume, persist giữa các lần chạy |

Không đụng working tree `/Users/andie/agribeacon-ws` lúc checkout.

Repo GitHub: `agribeacon/sutagrow-api`, `agribeacon/sutagrow-web`.

### Image

Dockerfile runtime nằm trong repo taw-qa. Node >= 20. Không `COPY` source của api/web. Không rebuild image theo PR. Rebuild image khi Dockerfile đổi.

Image Agent: Claude Code, `@playwright/mcp`, Chromium, `git`, `gh`, Docker CLI (nói chuyện qua `docker.sock`). Playwright: Chromium headless, `--no-sandbox`. MCP stdio trong cùng container. Không copy `.mcp.json` host. Không image sidecar `mcr.microsoft.com/playwright/mcp`. Không `.auth/user.json` staging.

### Cổng và env stack

Api listen 3005. Web listen 3002. Không publish ra Mac.

Playwright gọi `http://api:3005` và `http://web:3002`. Không `localhost`.

Compose `env_file` lấy `.env` trên Mac. `environment` ghi đè:

- `MONGODB_URI=mongodb://mongo:27017/farm_management`
- `PORT` (3005 api, 3002 web)
- `SKIP_MQTT=true`
- `NEXT_PUBLIC_API_URL=http://api:3005/api`
- `NEXT_PUBLIC_SOCKET_URL=http://api:3005`
- `NEXT_PUBLIC_SITE_URL=http://web:3002`
- `SITE_URL=http://web:3002` trên api

Không Redis. Mongo bắt buộc. `CHATBOT_PROVIDER` + model + API key phải có trong `.env` Mac (api boot cần). PostGIS không chặn HTTP.

Start api: `npm ci` nếu cần, `npm run build`, `node dist/server.js`. Start web: `npm ci` nếu cần, `next build`, `next start --hostname 0.0.0.0`. Không `next dev`. Không git pull trong container app.

Named volume Linux đè `/app/node_modules`, `/app/dist` (api), `/app/.next` (web). Source bind-mount `/app`.

### Token

Agent không bind-mount `~/.claude`, `~/.ssh`, `~/.config/gh`.

| Thứ | Cách |
| --- | --- |
| Claude | Lần đầu operator chạy `claude /login` trong Agent. Persist volume `taw-qa-agent-claude` + `CLAUDE_CONFIG_DIR`. |
| GitHub | Host lấy `gh auth token` account `nghiahsgs`, truyền `GH_TOKEN` vào Agent. |
| Plane | Host đọc `PLANE_API_KEY` từ `~/.claude/settings.json`, truyền env. Base URL `https://plane.agribeacon.tech`, workspace `agribeacon`. |

Thiếu `GH_TOKEN` hoặc `PLANE_API_KEY` lúc start thì hỏi operator. Không bịa.

## Một lần chạy

Mỗi bước xong khi tiêu chí dưới đây đúng.

### 1. Host nhận PR

Operator chạy `bin/taw-qa run <pr-url>`.

Xong khi: URL parse được là PR `agribeacon/sutagrow-api` hoặc `agribeacon/sutagrow-web`. Thiếu token thì đã hỏi. `.env` api và web tồn tại, hoặc operator đã được hỏi.

### 2. Khớp ticket Plane

Trước khi test.

Tập auto-match:

1. Đọc `AND-n` trên title, body, branch của PR. Đây là Plane project AND, không phải Linear taw-qa.
2. Giữ work item thuộc Plane project AND. Identifier lệch project bỏ.
3. Cộng work item project AND có comment chứa URL PR hoặc `owner/repo#N`.
4. Không lọc Done hay Canceled.

Nếu tập ≥ 1: không hỏi.

Nếu tập = 0: hỏi operator trước khi test. Prompt tiếng Việt: URL PR, đã tìm gì, nhập identifier hoặc URL Plane (được nhiều cái), hoặc bỏ Plane. Identifier operator đưa dùng nếu work item tồn tại trên Plane, không bắt buộc project AND. Id không tồn tại: báo và hỏi lại id lỗi; id đúng vẫn dùng. Không còn id nào thì hỏi lại. Operator bỏ Plane: tiếp tục, Report chỉ GitHub.

Xong khi: có tập ticket (có thể rỗng vì skip), hoặc operator đã trả lời.

### 3. Claim

Claim = ER và bước repro có thể assert trên PR, cộng mọi mục QA trên mọi ticket khớp. Không có ticket thì lấy PR title + body + ER nếu có. Bước chỉ để đi tới màn hình là setup, không phải Claim.

Claim mobile, MQTT, prod: bỏ, ghi `không test` trong Report.

Xong khi: danh sách Claim testable (api hoặc web) đã viết ra. Zero Claim testable thì không PASS.

### 4. Checkout

Repo của PR: fetch head PR, checkout đúng commit đó. Không merge vào `staging`.

Repo kia: checkout branch `staging`.

Đặt vào `$HOME/taw-qa/checkouts/sutagrow-api` và `sutagrow-web`.

Fetch hoặc checkout fail: không start `api`/`web`. Hỏi operator. Nếu đọc được PR thì Report GitHub FAIL, lý do checkout. Plane: comment nếu đã khớp ticket.

Một lần chạy một PR. Không tự tìm PR cặp. Report ghi repo kia đang ở `staging`.

Xong khi: hai thư mục checkout đúng ref, hoặc nhánh fail đã hỏi và đã Report nếu được.

### 5. `.env`

PR không đụng `.env` / `.env.example`: dùng file Mac.

PR đụng `.env` hoặc `.env.example`: hiện diff so với file Mac, hỏi operator giữ file Mac hay lấy giá trị PR. Không ghi đè im lặng.

Thiếu file Mac: hỏi. Không bịa.

Xong khi: hai file `.env` sẵn cho compose `env_file`.

### 6. Start Stack

Agent start `mongo`. Volume trống thì `mongorestore` từ `$HOME/taw-qa/mongo/` (archive gzip, db `farm_management`). Dump giữ nguyên PII. Dump thiếu: hỏi operator, không seed rỗng.

Agent start `api` và `web`. Health: HTTP lắng nghe trên `api:3005` và `web:3002`.

Xong khi: hai healthcheck xanh, Mongo có data `farm_management`.

### 7. Test

Agent tự viết và chạy Playwright. Operator không duyệt script trước.

Assertion phải fail nếu Claim sai (status, body, text, giá trị). Không đủ trang hiện hay status 2xx suông.

Test đúng layer của Claim. Stack vẫn luôn chạy đủ ba tầng.

PASS khi mọi Claim testable đều có assertion và mọi assertion đó xanh. Một assertion fail thì cả lần chạy FAIL. Script đã chốt là script của lần xanh đó. File đổi ngoài Claim không mở thêm bar.

Zero Claim testable: không PASS.

Xong khi: có kết quả PASS hoặc FAIL, kèm script `.spec.ts`.

### 8. Report

Cùng một markdown trên GitHub PR và mọi ticket Plane khớp. Chữ tiếng Việt. Script và message lỗi giữ English.

Script trong fence `ts`. Quá 65k ký tự GitHub thì thay fence bằng gist. Không dùng file đính kèm làm nguồn chính.

Nhiều ticket: dòng `**Plane:**` liệt kê mọi URL. Skip Plane: không có dòng `**Plane:**`. GitHub luôn có Report.

Ảnh fail: markdown image, một URL dùng chung hai nơi. Agent host URL (gist raw hoặc upload GitHub). PASS không có screenshot.

Không dump log container. Không Playwright trace.

#### PASS

- Header: `## taw-qa: PASS`
- `**PR:**` url
- `**Plane:**` url (mọi ticket; bỏ dòng này khi skip)
- `### Đã test` rồi vài bullet (`API: POST /x → 201`, `e2e: login → tạo farm → thấy trên list`)
- `### Không test` nếu có Claim mobile/MQTT/prod
- `### Script` rồi fence `ts` chứa `.spec.ts`

#### FAIL

- Header: `## taw-qa: FAIL`
- Cùng PR, Plane, và bullet đã test (bước fail ghi rõ)
- `### Lỗi` rồi message / stack snippet; API thì thêm status và đoạn body
- `### Screenshot` rồi `![fail](url)` — chỉ khi fail e2e
- `### Script (chưa chốt)` rồi fence `ts` chứa `.spec.ts` lần chạy cuối

Xong khi: comment đã lên GitHub, và lên mọi ticket Plane khớp (hoặc đã skip Plane).

### 9. Timeout và teardown

Timeout 45 phút cho cả lần chạy, tính từ lúc `agent` start. Hết giờ: Report FAIL lỗi `timeout` (GitHub, và Plane nếu đã khớp), rồi teardown.

Teardown: stop `api` và `web`. Giữ volume mongo. Giữ `taw-qa-agent-claude`. Giữ checkouts. Agent thoát.

Xong khi: container `api`/`web` không còn chạy. Volume còn.

## Dump Mongo (một lần trên Mac)

Làm ngoài vòng test, trước lần chạy đầu.

Trên server `sutagrow`, Mongo bind `127.0.0.1`, không auth, db `farm_management` (~84 MiB).

```
mongodump --gzip --archive
scp về $HOME/taw-qa/mongo/
```

Không cắt collection. Không redact PII (`users.email` / `phone` / password hash, `devices_active.blePassword` plain).

## Việc implement

Viết Dockerfile, compose, `bin/taw-qa`, prompt Agent, code khớp Plane. Ticket con của [Implement Feature 1: QA loop Docker local](https://linear.app/andie-monterro/issue/AND-132/implement-feature-1-qa-loop-docker-local).

Thứ tự: [Dockerfile Agent và compose stack](https://linear.app/andie-monterro/issue/AND-137/dockerfile-agent-va-compose-stack) → [Checkout PR và start api+web](https://linear.app/andie-monterro/issue/AND-133/checkout-pr-va-start-apiweb) và [Host CLI bin/taw-qa run và token](https://linear.app/andie-monterro/issue/AND-134/host-cli-bintaw-qa-run-va-token) → [Agent suy Claim và chạy Playwright](https://linear.app/andie-monterro/issue/AND-135/agent-suy-claim-va-chay-playwright) → [Report GitHub Plane, timeout, teardown](https://linear.app/andie-monterro/issue/AND-136/report-github-plane-timeout-teardown). Dump Mongo: [Lấy dump Mongo staging về Mac](https://linear.app/andie-monterro/issue/AND-138/lay-dump-mongo-staging-ve-mac), làm song song.
