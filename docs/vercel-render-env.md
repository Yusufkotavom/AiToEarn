# Vercel + Render Env Checklist

Use this setup when:
- frontend (`project/aitoearn-web`) deploys to Vercel
- backend server (`aitoearn-server`) deploys to Render

## 1) Render (`render.yaml`) mandatory env

Set real values before deploy:
- `APP_DOMAIN` = your Render domain (or custom API domain), without protocol
- `MONGODB_URI` = Atlas URI
- `REDIS_URL` = Upstash `rediss://...`
- `ASSETS_CONFIG` = one-line JSON S3/R2 config
- `JWT_SECRET`
- `INTERNAL_TOKEN`

Optional but recommended:
- `MONGODB_CHANNEL_URI`
- OAuth / Mail / SMS / Relay values

## 2) Vercel env for `aitoearn-web`

Required:
- `NEXT_PUBLIC_API_URL=https://<your-render-domain>/api`
- `NEXT_PUBLIC_APP_DOMAIN=<your-render-domain>`
- `NEXT_PUBLIC_APP_URL=https://<your-render-domain>`
- `NEXT_PUBLIC_DISABLE_AI=1`

Optional:
- `NEXT_PUBLIC_DOCS_URL=...`
- `NEXT_PUBLIC_GOOGLE_CLIENT_ID=...`
- `NEXT_PUBLIC_ENABLE_XHS_SIGN=true|false`

## 3) Quick validation after deploy

1. Open `https://<render-domain>/health` -> should return 200.
2. Open Vercel app and login flow.
3. Test one API call from browser devtools (status 200/401 expected, no CORS error).
4. Open System Logs page to verify backend Mongo log reader works.

## 4) Common mismatch to avoid

- Backend reads `ASSETS_CONFIG`, not `SERVER_ASSETS_CONFIG`.
- Frontend needs `NEXT_PUBLIC_API_URL`; without it requests will fail.
