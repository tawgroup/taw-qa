# Spec Feature 2: taw-qa online cho `sutagrow-web`

Một agent implement Feature 2 từ file này. File này là nguồn sự thật.

Feature 2 **thêm** một đường chạy, không sửa Feature 1. `bin/taw-qa run <pr-url>` trên Mac phải còn chạy được sau khi implement xong. Mọi thay đổi code là additive.

Thuật ngữ: [`CONTEXT.md`](../../CONTEXT.md). Feature 1: [`feature-1.md`](feature-1.md).

## Xong khi nào

Một người có quyền write comment `/taw-qa` trên một PR của `agribeacon/sutagrow-web`. Runner nhận webhook, đọc Block trong PR body, checkout PR, dựng FE từ code PR, trỏ qua Proxy tới BE staging thật, chạy Playwright theo Claim, đăng Report lên GitHub PR và mọi ticket Plane khớp. PASS, FAIL và BLOCKED đều có comment.

Không ai phải ngồi trước máy lúc chạy.

## Ngoài phạm vi

Mode mock (`test:e2e:mock-api` của repo). PR của `sutagrow-api`. Auto-run theo `opened` hoặc `synchronize`. FE repo khác (`sutagrow-admin`, `sutagrow-tenant-admin`, `EasyHire-FE`). Checkout BE. Mongo, dump, restore. WebSocket / realtime. Docker-in-Docker. Multi-tenant. Sửa `sutagrow-api` hay `sutagrow-web` để chạy được taw-qa.

Những thứ này ngoài phạm vi Feature 2, không phải bị xoá khỏi Feature 1.

## Kiến trúc

BE không phải thứ ta dựng. BE là một URL. Cái ta dựng là FE từ code PR, cộng một Proxy đứng giữa.

```
GitHub PR comment `/taw-qa`
  → API Gateway → Lambda  (luôn sống, ~$0)
      xác thực chữ ký, lọc điều kiện bước 1
      → start EC2 Runner (tắt sẵn)
          → Runner: một lần chạy rồi tự tắt
           checkout PR → /work/pr-<n>/sutagrow-web
           ghi .env FE từ Project config
           start Proxy   127.0.0.1:3018
           playwright test → webServer của repo tự build + start FE 127.0.0.1:3000
           Chromium (origin http://127.0.0.1:3000)
                → 127.0.0.1:3018  [Proxy]
                    → https://farm-dev-be.agribeacon.tech/api  [BE staging, không đổi]
           Report → GitHub PR + mọi ticket Plane khớp
           `shutdown` chính nó
```

Proxy, FE và Chromium nghe trên `127.0.0.1` của Runner. Không mở port nào ra Internet. Runner không có inbound; Lambda là mặt duy nhất lộ ra ngoài.

### Hạ tầng

AWS account `lavni` (`864821056059`), region `ap-southeast-1` — cùng khu vực BE staging (`103.82.195.15`, VN) nên mỗi API call ~40ms thay vì ~250ms từ `us-east-1`.

| Thành phần | Cấu hình | Vì sao |
| --- | --- | --- |
| Lambda + API Gateway | nhận `issue_comment`, xác thực HMAC chữ ký GitHub App, `ec2:StartInstances` | Luôn sống mà gần như $0. Không có server thứ hai phải vá |
| EC2 Runner | `m7i-flex.xlarge` (4 vCPU / 16GB), 50GB gp3, **stopped** khi rảnh | `next build` xin heap 4GB (`playwright.config.ts:11`), `.next` 2.8G + `node_modules` 1.0G, và build phải xong trong trần 480s (`playwright.config.ts:56`). 2 vCPU không kịp |

Runner tự `shutdown` cuối bước 9. Lambda không tắt hộ — Runner chết thì `stop` theo alarm idle là lưới an toàn, không phải đường chính.

Chi phí ở mức ~20 run/tháng: **~$10-15/tháng**. Bật 24/7 thì là ~$180/tháng ($0.2394/hr on-demand, giá Singapore đã tra).

Một Runner chạy một run tại một thời điểm. Nhiều PR cùng lúc: xếp hàng, không chạy song song. Song song cần nhiều instance — ngoài phạm vi Feature 2.

### Vì sao Proxy chứ không sửa CORS của BE

BE staging trả `Access-Control-Allow-Origin: https://sutagrow-dev.agribeacon.tech` kèm `Access-Control-Allow-Credentials: true`. Không phải `*`, và spec CORS cấm `*` khi `credentials: true`. Origin `http://127.0.0.1:3000` sẽ bị chặn.

Proxy giải quyết mà không đụng BE. Đây là điều kiện để "không sửa repo của người ta" thành đúng.

### Vì sao dùng lại `playwright.config.ts` của repo

`sutagrow-web` đã có sẵn harness e2e. Feature 2 cắm vào, không dựng lại:

| Thứ có sẵn | Feature 2 dùng thế nào |
| --- | --- |
| `webServer[0]` url `http://127.0.0.1:3018/health`, `reuseExistingServer: !CI` | Proxy start trước và trả `/health` 200 → Playwright **reuse**, không start mock |
| `webServer[1]` build + `next start --port 3000` | Dùng nguyên lệnh, không đụng |
| `buildPrefix` bake `NEXT_PUBLIC_API_URL=http://127.0.0.1:3018/api` | Bundle FE trỏ thẳng vào Proxy |
| `globalSetup` POST `/__test__/reset` | Proxy trả 200 no-op |
| `screenshot: 'only-on-failure'` | Ảnh cho Report FAIL |
| `tests/e2e/helpers`, `fixtures` | Spec taw-qa dùng lại |

Spec này **phụ thuộc** vào dòng `buildPrefix` trong `playwright.config.ts`. Repo đổi dòng đó thì Feature 2 phải gãy ra tiếng, không được chạy tiếp im lặng.

## Một lần chạy

### 1. Trigger

GitHub App, webhook `issue_comment` → API Gateway → Lambda. Lambda xác thực chữ ký HMAC trước mọi thứ khác; sai chữ ký thì `401`, không start gì.

Lambda lọc, Runner không lọc lại. Chạy khi **tất cả** đúng: payload có `issue.pull_request` (không phải issue thường), PR thuộc `agribeacon/sutagrow-web`, body comment khớp `^/taw-qa\b`, và `comment.author_association` thuộc `OWNER` / `MEMBER` / `COLLABORATOR`. Khác đi thì bỏ qua, không comment gì.

Dùng `author_association` trong payload chứ không gọi API collaborators: nó đủ để chặn người ngoài mà không phải xin thêm permission nào ngoài bốn cái dưới. Đánh đổi: `MEMBER` là thành viên org, không hẳn có quyền write trên đúng repo này. Chấp nhận được với một repo nội bộ; mở cho repo nhiều người ngoài thì siết lại bằng API.

Quyền GitHub App, đúng bốn cái, cài **chỉ** trên `sutagrow-web` (`Only select repositories`):

| Permission | Mức | Để làm gì |
| --- | --- | --- |
| Metadata | Read | Bắt buộc |
| Contents | Read | Clone code PR |
| Pull requests | Read | (thay bằng Write, xem dòng dưới) |
| Issues | Write | Nhận `issue_comment` |
| Pull requests | **Write** | **Đăng Report.** `Issues: Write` KHÔNG đủ: thử nghiệm cho thấy token đăng được comment lên issue thường (201) nhưng lên PR thì 403 `Resource not accessible by integration`. Docs không ghi chỗ này |

Không xin Contents write, không xin Administration, không xin Actions. App không push, không merge, không đổi setting, không thấy repo khác.

Private key của App đọc được code mọi repo đã cài, nên nằm trong AWS Secrets Manager, không nằm trong repo và không nằm trong biến môi trường plaintext của Lambda.

App không dùng OAuth user authorization. Chỉ installation — chủ org cài một lần vào `sutagrow-web`.

Token: không có token sống mãi. Private key ký một JWT ngắn hạn, đổi lấy **installation access token sống 1 giờ**, dùng cho cả REST API lẫn HTTP password để `git clone` (cần quyền `Contents`, nên không phải thêm deploy key hay SSH key).

Run timeout 45 phút mà token sống 60 phút, biên chỉ 15 phút — và thứ chạy cuối cùng lại chính là đăng Report. Vì vậy: đúc token lúc bắt đầu để clone, **đúc lại ngay trước khi đăng Report**. Không bao giờ để mất Report vì token hết hạn ở phút 46.

Một Runner, một run. Khoá là một **SSM Parameter** `/taw-qa/current-run`, Lambda ghi với `Overwrite=false`.

Không dùng `DescribeInstances` làm khoá: hai `/taw-qa` trong cùng một giây đều thấy instance `stopped`, cả hai cùng `StartInstances`, và cả hai đều tưởng mình sở hữu lần chạy. `Overwrite=false` thì người đầu ghi được, người sau nhận `ParameterAlreadyExists` → comment `đang chạy` rồi bỏ.

Runner đọc khoá lúc boot, **xoá lúc teardown**. Việc xoá nằm ở **`ExecStopPost` của systemd unit**, không chỉ trong `finally` của Node: `stop-instances` gửi SIGKILL nên `finally` không bao giờ chạy, và khoá kẹt lại. `ExecStopPost` chạy kể cả khi `ExecStart` bị giết.

Lưới cuối: Lambda coi khoá có `claimedAt` quá **50 phút** là rác và cướp lại. Timeout một lần chạy là 45 phút nên 50 là biên an toàn.

Xong khi: Runner đã được start với `PR_URL`, hoặc đã bỏ qua có lý do.

### 2. Block và Claim

**Block chỉ đọc từ PR body.** Không đọc Block trên Plane. Một PR là một môi trường, nguồn sự thật nằm cùng chỗ với code.

Cú pháp: `<taw-qa start>` và `<taw-qa end>`, mỗi cái một dòng riêng. Giữa hai dòng đó, mỗi dòng bullet (`-`, `*`, `1.`) là một Claim ứng viên.

Nhiều cặp `start`/`end` trong một PR body: gộp union, dedup theo nội dung dòng sau khi trim. `start` không có `end` đóng lại: coi như thiếu Block.

PR body không có Block: comment lên PR `thiếu block taw-qa`, kèm cú pháp mẫu, rồi **dừng**. Không PASS, không FAIL, không chạy test. Không fallback về heuristic Feature 1 — heuristic đó chỉ còn dùng cho `bin/taw-qa run` chạy tay.

Có Block rồi thì luật Claim của Feature 1 áp dụng tiếp: dòng chỉ để đi tới màn hình là setup, không phải Claim; Claim mobile/MQTT/prod bỏ và ghi `không test`.

Thêm với Feature 2: Claim realtime / socket / notification đẩy cũng ghi `không test`. Lý do ở bước 5.

Zero Claim testable: không PASS. Report FAIL, lý do `zero testable claim`.

Xong khi: danh sách Claim testable đã viết ra, hoặc đã comment thiếu Block và dừng.

### 3. Khớp ticket Plane

Như Feature 1 bước 2, dùng lại `autoMatchPlane` trong `src/plane-match.ts`. Ticket khớp **chỉ để nhận Report**, không phải nguồn Claim.

Khác Feature 1 một chỗ: online không có operator để hỏi. Tập rỗng thì **không hỏi**, đi tiếp, Report chỉ lên GitHub.

Xong khi: có tập ticket khớp, có thể rỗng.

### 4. Checkout và env FE

Fetch head PR, checkout đúng commit đó, vào `/work/pr-<n>/sutagrow-web`. Không merge vào `staging`. Không checkout repo BE.

Checkout sạch **không có `.env`** (`.env` nằm trong `.gitignore`), và `buildPrefix` chỉ set `NEXT_PUBLIC_API_URL`. Mọi biến `NEXT_PUBLIC_*` khác sẽ undefined lúc build. Nên: Runner ghi file `.env` vào checkout từ Project config **trước khi** build. `NEXT_PUBLIC_API_URL` trong file đó vẫn bị `buildPrefix` ghi đè — đúng như mong muốn.

Ghi lại SHA đã checkout. Report phải có nó.

Xong khi: checkout đúng ref, `.env` đã ghi, hoặc fail đã Report.

### 5. Proxy

Proxy nghe `127.0.0.1:3018`. Một tiến trình cho một lần chạy.

**Guard trước tiên.** Host của `BE_URL` khớp `saas-be.agribeacon.tech` hoặc `sutagrow.agribeacon.tech`: **refuse to start**. Không phải warning. Mode này ghi data thật; sai URL là ghi vào prod.

Trả lời tại chỗ, không forward:

| Request | Trả |
| --- | --- |
| `GET /health` | 200 |
| `POST /__test__/reset` | 200 no-op (không trả thì `globalSetup` treo 30s rồi mới warn) |
| `OPTIONS *` | 204 + header CORS bên dưới + `Access-Control-Allow-Headers: Authorization, Content-Type` |
| `/socket.io/*` | 404 |

Preflight **không được forward** — BE sẽ từ chối `OPTIONS` từ origin lạ.

Không proxy WebSocket. `use-notification-socket.ts:14` suy socket URL từ `NEXT_PUBLIC_API_URL` nên nó sẽ gọi vào Proxy, nhận 404, rồi socket.io tự retry im lặng. Đây **đúng bằng** hành vi e2e hiện có của repo: `tests/e2e/mock-api/server.mjs` không phục vụ socket.io và không spec e2e nào của repo đụng socket. Vì vậy Claim realtime ghi `không test` (bước 2), không dựng WS proxy.

Còn lại forward tới `BE_URL`:

- Request lên: `Origin` ghi thành `https://sutagrow-dev.agribeacon.tech` (hostname BE allowlist). `Host` ghi thành host upstream.
- Response về: **xoá hết** header `Access-Control-*` của upstream, rồi set:
  - `Access-Control-Allow-Origin: http://127.0.0.1:3000`
  - `Access-Control-Allow-Credentials: true`
  - `Access-Control-Expose-Headers: ETag, Retry-After` — FE đọc hai header này (`lib/api/multipart-upload.ts:104`, `lib/api/retry.ts:110`) và cả hai không nằm trong danh sách safelist của CORS
  - `Vary: Origin`

Proxy gọi `GET {BE_URL}/api/health` **trước và sau** lần chạy, lưu `data.uptime`. Dùng cho BLOCKED ở bước 8.

Proxy đếm mọi response `429`, `502`, `503` và mọi lỗi connection tới upstream trong suốt lần chạy.

Xong khi: Proxy trả `/health` 200, và `GET {BE_URL}/health` upstream trả 200.

### 6. Test

Spec do **opencode Zen** viết (`https://opencode.ai/zen/v1`, OpenAI-compatible, model `kimi-k3` thuộc gói Go). Gọi thẳng bằng `fetch` — không cài CLI `opencode` lên Runner vì CLI cất credential ở `~/.local/share/opencode/auth.json` qua lệnh `/connect` trong TUI, không có đường khai báo headless.

**Không tin model.** Spec phải qua `checkSpec`: có `import @playwright/test`, có `test()`, có `expect()`, không `waitForTimeout`, không URL tuyệt đối ngoài `127.0.0.1`. Quan trọng nhất là `expect()` — spec không có nó thì assertion không bao giờ đỏ được, tức là PASS cả khi PR sai, tệ hơn FAIL oan. Không đạt thì rơi về bộ sinh tất định (`src/online-spec.ts`), không đẩy file rác vào repo người ta.

Spec ghi vào `tests/e2e/taw-qa-pr-<n>.spec.ts` trong checkout.

Agent cần DOM thật để viết spec, nên phải start FE **trước** khi snapshot bằng Playwright MCP. Lệnh start phải là **đúng** `webServer[1]` của repo (`buildPrefix && startCmd`) — chạy lệnh khác thì bundle không trỏ `:3018`, và sau đó `reuseExistingServer` sẽ vui vẻ reuse đúng cái build sai đó.

Spec phải mở đầu bằng `test.describe.configure({ mode: 'serial' })`. Repo để `fullyParallel: true` (`playwright.config.ts:19`), nên không khai serial thì thứ tự test bị xáo — mà mode này ghi vào staging dùng chung, Claim đọc state do Claim trước tạo ra sẽ flaky.

Chạy: `npx playwright test tests/e2e/taw-qa-pr-<n>.spec.ts --workers=1`, với `CI` **không set** (để `reuseExistingServer` là true, Playwright reuse Proxy ở `:3018` và FE ở `:3000` thay vì cố start lại). `E2E_SKIP_BUILD=1` khi FE đã build ở bước snapshot.

Assertion phải fail nếu Claim sai. Không đủ trang hiện hay 2xx suông.

PASS khi mọi Claim testable đều có assertion và mọi assertion xanh. Một cái fail thì cả lần chạy FAIL.

Playwright phải chạy bằng **`spawn` bất đồng bộ**, tuyệt đối không `execFileSync`. Proxy sống trong cùng tiến trình Runner; `execFileSync` chặn event loop nên Proxy nhận kết nối mà không trả lời nổi, trong khi Playwright đang chờ `:3018/health`. Hai bên chờ nhau tới hết timeout. Triệu chứng đánh lừa: `ss` báo port LISTEN, `curl` trả `000`.

`git` và `npm ci` được phép dùng lệnh đồng bộ vì chúng chạy trước khi Proxy start.

Xong khi: có verdict, kèm file spec.

### 7. Write pollution và dọn

Mode này ghi vào staging thật.

Login bằng tài khoản test của Project config. Không dùng tài khoản người thật.

Mọi thực thể test tạo ra mang prefix `tawqa-pr<n>-` ở trường tên. Cuối lần chạy có bước dọn xoá chúng.

Dọn fail: ghi mục `### Không dọn được` trong Report, liệt kê thứ còn lại. **Không** đổi verdict.

Xong khi: bước dọn đã chạy, kết quả đã ghi.

### 8. Verdict và Report

Cùng một markdown trên GitHub PR và mọi ticket Plane khớp. Chữ tiếng Việt, script và message lỗi giữ English. Luật fence `ts` và ngưỡng 65k của Feature 1 giữ nguyên.

Report luôn có `**Commit:**` SHA đã checkout và `**BE:**` `BE_URL`.

#### PASS

Như Feature 1, cộng `**Commit:**` và `**BE:**`.

#### FAIL

Như Feature 1, cộng `**Commit:**`, `**BE:**`, và `### Không dọn được` nếu có.

#### BLOCKED

Header `## taw-qa: BLOCKED`, rồi `### Lý do`. Không kết luận được về PR, nên **không có** mục Screenshot và không có mục Script chốt.

Lý do được phép, theo **đúng thứ tự ưu tiên** này khi nhiều cái cùng đúng. Thứ tự cố định để Report không đổi chữ giữa hai lần chạy giống nhau. `blockedReason()` trong `src/verdict.ts` là nguồn sự thật cho tie-break.

| # | Lý do | Observable |
| --- | --- | --- |
| 1 | Proxy từ chối host prod | guard bước 5. Đứng đầu vì nó nghĩa là lẽ ra không được bắt đầu |
| 2 | BE không xanh trước khi chạy | `GET {BE_URL}/api/health` pre-flight không 200 (controller trả 503 khi Mongo rớt). Đường dẫn là `/api/health` chứ không phải `/health` — health mount dưới router `/api` |
| 3 | Hết giờ | bước 9 |
| 4 | BE restart giữa lúc chạy | `data.uptime` sau < trước. `deploy-staging.yml` có `cancel-in-progress: true` và deploy mọi push vào `staging`, nên chuyện này xảy ra thật |
| 5 | BE biến mất giữa chừng | đọc được `uptime` trước mà không đọc được sau |
| 6 | Rate limit | có `429`. Trần `2000` request / `900s` dùng chung theo IP Runner |
| 7 | BE chập giữa chừng | có `5xx` hoặc lỗi connection tới upstream trong lúc chạy |

BLOCKED phải tách khỏi FAIL. Nhập hai cái làm một thì FAIL mất uy tín và cả team ignore bot.

Xong khi: comment đã lên GitHub, và lên mọi ticket Plane khớp (hoặc tập rỗng).

### 9. Timeout và teardown

Timeout 45 phút cho cả lần chạy, tính từ lúc Runner start. Hết giờ: BLOCKED lý do `timeout`.

Teardown: kill Proxy, kill `next start`, chạy bước dọn, xoá `/work/pr-<n>`, rồi Runner tự `shutdown`.

Report phải đăng **xong** rồi mới `shutdown`. Tắt trước khi đăng thì lần chạy coi như không xảy ra với người đọc PR.

Xong khi: Report đã lên GitHub, thư mục work đã xoá, instance ở trạng thái `stopped`.

## Secret và config

Không thứ nào suy từ `.env` trên máy bất kỳ ai. Lý do cụ thể: `.env` của `sutagrow-web` trên Mac operator đang trỏ `saas-be.agribeacon.tech` (**prod**) với `NEXT_PUBLIC_APP_ENV=production`, trong khi `.env.example` cùng repo ghi `farm-dev-be` là staging. File `.env` không phải nguồn tin cậy.

| Thứ | Nguồn |
| --- | --- |
| Claude | API key qua env. Không dùng volume `claude /login` — không chạy được headless |
| GitHub | GitHub App installation token |
| Plane | Key theo project |
| `BE_URL` | Project config, **hỏi lúc setup**, không suy |
| Tài khoản test BE | Project config mã hoá |
| `.env` FE ghi vào checkout | Project config |

Thiếu bất kỳ thứ nào: run fail ngay lúc start với lý do rõ. Không bịa.

## Việc implement

Feature 1 phải còn chạy. Mọi thay đổi là additive: thêm file, thêm nhánh, thêm tham số. Không xoá đường chạy tay.

Code mới:

- `src/proxy.ts` — Proxy bước 5, kèm guard host prod, đếm `429`/`5xx`, lưu `uptime` trước/sau.
- `src/webhook.ts` — handler Lambda: xác thực HMAC, lọc `issue.pull_request` + repo + `^/taw-qa\b` + quyền write, check instance đang `running`, `StartInstances` kèm `PR_URL`.
- `infra/` — OpenTofu cho Lambda, API Gateway, EC2, IAM, security group, SSM lock. Không tạo tay bằng console.

Hai chi tiết vận hành đã phát hiện lúc dựng, ghi lại kẻo lặp lại:

- `aws_instance` **luôn tạo ra ở trạng thái `running`**; không khai `stopped` được trong Terraform. Sau `apply` đầu tiên phải `stop-instances` bằng tay, nếu không instance nằm không mà vẫn tính $0.2394/giờ.
- cloud-init chỉ chạy `user-data` **một lần**, ở lần boot đầu. Mà Lambda start/stop instance liên tục. Nên `user-data` chỉ làm nhiệm vụ cài đặt rồi lắp một **systemd oneshot unit**; chính unit đó mới là thứ chạy `src/runner.ts` ở mọi lần boot. Xem log một lần chạy: `journalctl -u taw-qa`.
- `src/block.ts` — parse `<taw-qa start>`/`<taw-qa end>` từ PR body, gộp nhiều cặp, dedup.
- `src/verdict.ts` — ba verdict, điều kiện BLOCKED.
- `src/cleanup.ts` — xoá thực thể prefix `tawqa-pr<n>-`.
- `src/project-config.ts` — `BE_URL`, tài khoản test, Plane project, nội dung `.env` FE.
- `docker-compose.online.yml` — chỉ service Runner. File riêng, `docker-compose.yml` của Feature 1 giữ nguyên.
- `src/shutdown.ts` — teardown bước 9, chỉ `shutdown` sau khi Report đã đăng.

Code sửa, additive:

| File | Thêm gì (không xoá gì) |
| --- | --- |
| `src/config.ts` | Thêm chế độ runner đọc từ Project config. `HOST_HOME`, `PATHS`, `PLANE_PROJECT` giữ nguyên cho Feature 1 |
| `src/checkout.ts` | Thêm `feOnlyPlan()` cạnh `checkoutPlan()`. `checkoutPlan` và `otherRepo` giữ nguyên |
| `src/claims.ts` | Nhánh online nhận Claim từ `src/block.ts`. `assembleClaims` và regex giữ nguyên cho `bin/taw-qa run` |
| `src/report.ts` | Thêm BLOCKED, `**Commit:**`, `**BE:**`, `### Không dọn được` |
| `agent/skills/qa-loop/SKILL.md` | Thêm nhánh online: start Proxy + FE bằng đúng lệnh `webServer[1]` trước khi MCP snapshot; spec ghi vào `tests/e2e/taw-qa-pr-<n>.spec.ts`. Nhánh `tmp/taw-qa.spec.mjs` giữ cho chạy tay |
| `CLAUDE.md` | Nói rõ `tmp/taw-qa.spec.mjs` là đường chạy tay; online ghi vào `tests/e2e/` |

Thứ tự: `src/block.ts` → `src/project-config.ts` → `src/verdict.ts` → `src/proxy.ts` → `infra/` và `src/webhook.ts` → skill `qa-loop` → `src/report.ts` → `src/cleanup.ts` và `src/shutdown.ts`.

Bốn cái đầu không phụ thuộc hạ tầng, code và test được trước khi AWS dựng xong.
