# Environment Template (Staging/Pilot)

## 1) Pflichtvariablen

### Public (Frontend erlaubt)
Diese Werte dürfen im Browser landen (werden über `v1-auth-config` ausgeliefert):

- `SUPABASE_URL=https://<project-ref>.supabase.co`
- `SUPABASE_ANON_KEY=<supabase-anon-public-key>`

### Server-only (Netlify Functions, niemals Frontend)

- `SUPABASE_SERVICE_ROLE_KEY=<supabase-service-role-secret>`
- `SUPABASE_INVITE_REDIRECT_URL=https://<staging-domain>/`

## 2) Empfohlen für Staging-Betrieb

- `NETLIFY_SITE_URL=https://<staging-domain>`
  - wird als Fallback für Invite-Redirect genutzt, falls `SUPABASE_INVITE_REDIRECT_URL` fehlt.
- `LOG_LEVEL=info`

## 3) Klare Trennung Public vs Server-Secrets

- **Public:** `SUPABASE_URL`, `SUPABASE_ANON_KEY`
- **Server-only:** `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_INVITE_REDIRECT_URL`

## 4) Staging-Beispielwerte

- `SUPABASE_URL=https://abcd1234.supabase.co`
- `SUPABASE_ANON_KEY=eyJhbGciOi...public...`
- `SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOi...secret...`
- `SUPABASE_INVITE_REDIRECT_URL=https://ea-schulung-staging.netlify.app/`
- `NETLIFY_SITE_URL=https://ea-schulung-staging.netlify.app`

## 5) Sicherheitsregeln

- `SUPABASE_SERVICE_ROLE_KEY` nur in Netlify Functions setzen (kein Frontend, kein Repo).
- `v1-auth-config` darf nur Public-Variablen zurückgeben.
- Service-Role-Aufrufe laufen ausschließlich serverseitig über `netlify/functions/lib/supabase.js`.
