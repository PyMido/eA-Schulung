# Staging E2E Testplan (Phase 5)

## 0) Benötigte Testkonten

- `admin.staging@<domain>` (Rolle `admin`, bereits in `role_assignments`)
- `pharma.staging@<domain>` (Rolle `pharma`, via Invite anlegen)
- `nonpharma.staging@<domain>` (Rolle `non_pharma`, via Invite anlegen)

## 1) Voraussetzungen vor Ausführung

- Netlify Env gesetzt: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_INVITE_REDIRECT_URL`.
- Supabase Auth:
  - Site URL = Staging-Domain
  - Redirect Allowlist enthält Staging-Root (`https://<staging-domain>/`)
- `SUPABASE_INVITE_REDIRECT_URL` zeigt auf dieselbe Staging-Domain.

## 2) Konkrete E2E-Reihenfolge (ein Durchlauf)

1. **Admin-Invite (pharma user)**
   - Als Admin `v1-admin-invite` aufrufen (E-Mail `pharma.staging@...`, Rolle `pharma`).
   - Erwartung: `200`.
   - In Supabase Invite-Mail prüfen: Link enthält Redirect auf Staging-Domain.

2. **Passwort-Setup / Invite-Redirect**
   - Invite-Link öffnen.
   - Erwartung: Redirect auf Staging-App (`/`) und gültige Supabase Session.

3. **Login**
   - In der Staging-App mit `pharma.staging@...` anmelden.
   - Erwartung: Login erfolgreich, kein Token in `localStorage`.

4. **Dashboard**
   - Erwartung: `v1-dashboard` liefert User mit korrekter Rolle + Fortschrittsdaten.

5. **Training Start**
   - Ein Training öffnen/Start ausführen.
   - Erwartung: `v1-start-training` = `200`, neuer/aktualisierter Fortschritt sichtbar.
   - Verifikation: kein direkter Client-Schreibpfad auf Audit-Tabellen erforderlich (nur Function-Call).

6. **Quiz Submit**
   - Quiz beantworten und absenden.
   - Erwartung: `v1-submit-quiz` = `200`, Attempt + Progress + Certificate werden aktualisiert.

7. **Admin Report**
   - Mit `admin.staging@...` anmelden.
   - Erwartung: `v1-admin-report` = `200`, Testnutzer in Reportdaten sichtbar.

8. **Logout**
   - In der App ausloggen.
   - Erwartung: Session beendet; nach Reload/geschütztem Aufruf keine autorisierte Dashboard-Antwort ohne neues Login.

## 3) Negativ-Kurzchecks im selben Lauf

- `v1-admin-report` als `pharma`/`non_pharma` -> `403`.
- `v1-start-training` oder `v1-submit-quiz` als `admin` -> `403`.
- geschützter Endpoint ohne Bearer Token -> `401`.
