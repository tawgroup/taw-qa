# taw-qa

CLI QA chạy local trên một Mac. Spec Feature 1 đã chốt tại [`docs/spec/feature-1.md`](docs/spec/feature-1.md).

## Language

**Feature 1**:
Lát cắt đầu: operator dán một GitHub PR, CLI kéo code vào stack Docker local, start app, test API rồi e2e bằng Playwright, đăng Report lên GitHub PR và ticket Plane liên quan.
_Avoid_: product, platform, full taw-qa

**Operator**:
Một người chạy taw-qa trên một máy Mac.
_Avoid_: team, CI runner, user (mơ hồ)

**Stack**:
`sutagrow-api` (BE Node/TS/Mongoose) + `sutagrow-web` (FE Next.js) + Mongo, chạy Docker local trên máy operator, kèm volume data.
_Avoid_: generic harness, staging server as runtime, agribeacon-ws, sutagrow-mobile, sutagrow-admin

**Agent**:
Claude Code chạy trong một container. Token lấy từ Mac của operator. Container này mount `docker.sock` để start stack. Playwright MCP chạy trong cùng container.
_Avoid_: host CLI as the mind, Grok as the in-container agent, Docker-in-Docker, Playwright on the host

**PR**:
GitHub pull request của `sutagrow-api` hoặc `sutagrow-web`. Đây là input của Feature 1.
_Avoid_: Plane ticket as input, chỉ api, chỉ web

**Claim**:
Điều phải đúng, ghép từ ER, bước repro có thể assert, và mục QA trên mọi ticket Plane đã khớp. Không có ticket thì lấy từ PR. Bước chỉ để đi tới màn hình không phải Claim.
_Avoid_: AC, acceptance criteria, test case

**Report**:
Comment cùng markdown trên GitHub PR và mọi ticket Plane khớp sau một lần chạy. PASS khi hết Claim testable trên api+web xanh. Gồm bullet đã test và không test được, và script Playwright trong fence; khi fail thêm lỗi và screenshot e2e. Ticket Plane suy từ PR; nhiều thì comment tất cả; không tìm được thì hỏi operator, operator được bỏ Plane thì chỉ GitHub.
_Avoid_: chỉ GitHub bắt buộc, chỉ Plane, chỉ một ticket khi khớp nhiều, chỉ comment khi pass, file đính kèm làm nguồn chính

**Volume**:
Data Mongo local. Dump từ staging (server sutagrow, db `farm_management`), giữ nguyên PII trên máy operator.
_Avoid_: empty seed as default, prod dump without saying so, redact PII

**Spec**:
Artifact đích của Feature 1: architecture, flow, và quyết định đã chốt. Nguồn: [`docs/spec/feature-1.md`](docs/spec/feature-1.md). Một agent khác implement từ spec. Spec chưa phải CLI chạy được.
_Avoid_: working CLI, prototype as destination
