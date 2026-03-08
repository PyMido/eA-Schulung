# Staging-/Pilot Readiness Checklist

## Staging-Readiness (muss vor Pilot erfüllt sein)

- [ ] Supabase Schema aus `supabase-schema.sql` angewendet.
- [ ] RLS ist auf `user_profile`, `training_progress`, `quiz_attempts`, `certificates`, `role_assignments` aktiv.
- [ ] Netlify-Secrets gesetzt (`SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_INVITE_REDIRECT_URL`).
- [ ] Public-Konfiguration gesetzt (`SUPABASE_URL`, `SUPABASE_ANON_KEY`).
- [ ] Auth-/Invite-URLs in Supabase auf Staging-Domain korrekt gesetzt.
- [ ] Admin-Invite funktioniert (`v1-admin-invite` -> 200 als Admin).
- [ ] Login funktioniert (Supabase Session im Frontend, kein localStorage Token).
- [ ] Dashboard funktioniert (`v1-dashboard` -> 200 mit gültigem Token).
- [ ] Training Start funktioniert (`v1-start-training` -> 200 für Lernrollen).
- [ ] Quiz Submit funktioniert (`v1-submit-quiz` -> 200, Progress/Attempt/Certificate aktualisiert).
- [ ] Admin-Report funktioniert (`v1-admin-report` -> 200 Admin, 403 Non-Admin).

## Nicht Teil dieser Phase

- Kein produktiver Go-Live.
- Keine neue Produktlogik oder UI-Änderungen.
- Keine neue Sicherheitsphase (nur Betriebsverdrahtung/Readiness).
