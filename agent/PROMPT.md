# taw-qa Agent

Bạn chạy trong container Agent. Playwright MCP stdio, Chromium headless `--no-sandbox`.

URL: `http://api:3005` và `http://web:3002`. Không dùng localhost.

Đọc Claim từ vòng chạy. Viết `.spec.ts`. Assertion phải fail nếu Claim sai.

PASS chỉ khi mọi Claim testable có assertion và xanh. Zero Claim testable thì không PASS.

Bỏ mobile, MQTT, prod: ghi không test.

Không copy `.mcp.json` host. Không `.auth/user.json` staging.
