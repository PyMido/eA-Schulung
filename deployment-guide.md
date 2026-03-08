# Deployment Guide (Staging/Pilot Readiness)

## Ziel

Diese Schritte stellen **Staging-/Pilot-Betriebsbereitschaft** her (kein produktiver Go-Live).

## 1) Supabase vorbereiten

1. Im Supabase-Projekt SQL-Editor öffnen.
2. `supabase-schema.sql` vollständig ausführen.
3. Prüfen, dass RLS aktiv ist für:
   - `user_profile`
   - `training_progress`
   - `quiz_attempts`
   - `certificates`
   - `role_assignments`
4. Initiale Rollen-Zuordnung in `role_assignments` für mindestens einen Admin anlegen.

## 2) Netlify Runtime-Variablen setzen

In Netlify (Site Settings → Environment variables) setzen:

- Public:
  - `SUPABASE_URL`
  - `SUPABASE_ANON_KEY`
- Server-only:
  - `SUPABASE_SERVICE_ROLE_KEY`
  - `SUPABASE_INVITE_REDIRECT_URL`
- Optional:
  - `NETLIFY_SITE_URL`
  - `LOG_LEVEL`

Wichtig:
- `SUPABASE_SERVICE_ROLE_KEY` darf nur in Functions verfügbar sein.
- `SUPABASE_INVITE_REDIRECT_URL` muss auf die Staging-URL zeigen.

## 3) Auth-URLs für Staging prüfen

Im Supabase Dashboard (`Authentication`):

1. **Site URL** auf Staging-Domain setzen.
2. **Redirect URLs** um die Staging-Domain ergänzen (mindestens Root `/`).
3. Sicherstellen, dass Invite-/Auth-Mails auf Staging-URLs zurückführen.

## 4) Deploy auslösen

1. Branch nach Netlify deployen (Preview oder Staging Branch).
2. Deployment ohne fehlende Env-Variablen abschließen.
3. `/.netlify/functions/v1-auth-config` aufrufen und prüfen:
   - gibt `supabase_url` + `supabase_anon_key` zurück
   - gibt **keinen** service role key zurück

## 5) Funktions-Smoke-Tests (Staging)

1. **Admin-Invite prüfen**
   - Als Admin `v1-admin-invite` aufrufen
   - Erwartung: `200`, Invite versendet, Redirect auf Staging
2. **Login + Dashboard prüfen**
   - Eingeladener User setzt Passwort über Supabase Invite Link
   - Login im Frontend
   - `v1-dashboard` liefert Userdaten + Trainingsstände
3. **Training Flow prüfen**
   - `v1-start-training` -> `200`
   - `v1-submit-quiz` -> `200`, Attempt + Progress + Certificate aktualisiert
4. **Admin-Report prüfen**
   - `v1-admin-report` als Admin -> `200`
   - als Non-Admin -> `403`

## 6) Pilot-Freigabe-Kriterium

Staging gilt als bereit, wenn alle Punkte in `go-live-checklist.md` Abschnitt **Staging-Readiness** erfüllt sind.


## 7) Reale Staging-Blocker (vor Pilot auflösen)

Deployment/Pilot ist blockiert, wenn einer dieser Punkte fehlt:

- `SUPABASE_INVITE_REDIRECT_URL` fehlt oder zeigt nicht auf die Staging-Domain.
- `SUPABASE_SERVICE_ROLE_KEY` fehlt in Netlify Functions.
- Supabase Auth `Site URL`/`Redirect URLs` enthalten die Staging-Domain nicht.
- `role_assignments` enthält keinen initialen Admin.
- Staging-Domain ist uneindeutig (abweichende Domain zwischen Netlify und Supabase Redirects).
