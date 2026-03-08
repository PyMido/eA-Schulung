# Serverseitige Persistenz V1 (Auth Hardening Pass)

## Knapper Auth-Flow

1. Admin erzeugt Einladung (`v1-admin-invite`) für E-Mail + Rolle.
2. Einladung enthält Setup-Token mit Ablaufzeit.
3. Nutzer setzt Passwort einmalig über `v1-setup-password`.
4. Login über E-Mail + Passwort (`v1-login`).
5. Server erzeugt Session (`user_sessions`) und gibt Bearer-Token zurück.
6. Geschützte Endpunkte prüfen Session serverseitig (`v1-dashboard`, `v1-start-training`, `v1-submit-quiz`, `v1-admin-report`).
7. Logout (`v1-logout`) invalidiert Session serverseitig.

## Invite-/Setup-Token-Härtung

- Token sind gehasht gespeichert (`user_invites.token_hash`), Klartext nur bei Erstellung.
- Token haben klare Ablaufzeit (`expires_at`).
- Token sind einmalig (`used_at` wird beim Einlösen atomar gesetzt).
- Wiederverwendung führt zu klaren Fehlern (`already used`, `expired`, `invalid`).

## Session-Härtung

- Session hat Ablaufzeit (`user_sessions.expires_at`, aktuell 12h).
- Session wird in allen geschützten Endpunkten serverseitig validiert.
- Fehlende Rolle / fehlender User / fehlender Auth-Account => Session ungültig.
- Logout invalidiert Session sofort (`v1-logout`).

## Frontend-Token-Speicherung

- Session-Token wird in V1 **nur im In-Memory-State** (`state.authToken`) gehalten, nicht in `localStorage`.
- Vorteil: Token überlebt keinen Tab-/Browser-Neustart und bleibt nicht persistent im Browserprofil.

## Benötigte Env-Variablen

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `ADMIN_INVITE_KEY` (für `v1-admin-invite`)

Service-Key wird ausschließlich serverseitig in Netlify Functions verwendet.

## Tabellen und Zweck

- `users`: stabiles Benutzerkonto (ID + E-Mail)
- `role_assignments`: serverseitige Rollenquelle (`admin|pharma|non_pharma`)
- `user_invites`: Einladungen + Tokenstatus + Ablauf
- `auth_accounts`: Passwort-Hashes pro E-Mail/User
- `user_sessions`: aktive Session-Tokens (gehasht) + Ablauf
- `training_progress`: Status je `user_id` + `training_id`
- `quiz_attempts`: Versuche/Score je `user_id`
- `certificates`: Teilnahmebestätigung je `user_id` + `training_id`

## Mindestschutz (Policies)

- `auth_accounts`, `user_sessions`, `user_invites`: nur Backend (kein direkter Clientzugriff)
- `role_assignments`: nur Admin/Backend schreiben
- `training_progress`, `quiz_attempts`, `certificates`: nur eigener User oder Admin
- Für V1 empfohlen: Browserzugriff auf Tabellen deaktivieren, Zugriff nur über Netlify Functions

## Datenkonsistenz

- Fortschritt/Versuche/Zertifikate sind durchgehend an `user_id` gebunden.
- `training_progress` und `certificates` nutzen je `(user_id, training_id)` eindeutige Zuordnung.
- `v1-start-training` ist idempotent (existierender Fortschritt wird wiederverwendet).
- `v1-submit-quiz` aktualisiert konsistent `attempt_count`, `last_score`, `last_attempt_at`, `completed_at`.

## Fehlerfälle (abgedeckt)

- ungültiger Invite-Token
- abgelaufener Setup-Token
- Invite-Token bereits verwendet
- Passwort bereits gesetzt
- ungültige/abgelaufene Session
- fehlende Rolle
- fehlender/gelöschter Accountbezug

## Was vor echtem Produktivbetrieb noch fehlt

1. Brute-Force-Schutz + Rate-Limits auf Login/Setup.
2. Session-Cleanup-Job (abgelaufene Sessions/Invites).
3. Password Policy Hardening (Komplexität, Rotation optional).
4. Optional E-Mail-Versand für Einladung/Teilnahmebestätigung.
5. RLS-Audit und Security-Review der produktiven Policies.
