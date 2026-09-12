# taw-qa

CLI QA chạy local trên một Mac. Spec Feature 1: [`docs/spec/feature-1.md`](docs/spec/feature-1.md).

```
bin/taw-qa run https://github.com/agribeacon/sutagrow-api/pull/123
```

Thiếu `GH_TOKEN`, `PLANE_API_KEY`, hoặc `.env` Mac thì CLI hỏi. Không bịa secret.
