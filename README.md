# eA Schulung

V1-Fokus: einfache Schulungsplattform mit echter Einladung/Auth und zentraler Persistenz.

## V1-Rahmen

- Rollen: `admin`, `pharma`, `non_pharma`
- Eine Filiale
- Rolle vorab per E-Mail-Zuordnung (`role_assignments`)
- Keine zusätzliche Sonderrollenlogik

## Auth-/Einladungsflow (V1)

1. Admin erstellt Einladung für E-Mail + Rolle (`v1-admin-invite`).
2. Nutzer setzt Passwort mit Setup-Token (`v1-setup-password`).
3. Login via E-Mail + Passwort (`v1-login`).
4. Nach Login werden alle Daten serverseitig über Session-Token geladen/geschrieben.
5. Logout invalidiert Session serverseitig (`v1-logout`).

## Zentral gespeicherte Daten

- `users`
- `role_assignments`
- `user_invites`
- `auth_accounts`
- `user_sessions`
- `training_progress`
- `quiz_attempts`
- `certificates`

Details inkl. Auth-Härtung/Schutzanforderungen: `docs/server-persistence-v1.md`

## Komponenten

- Matrix: `docs/training-matrix-v1.json` und `public/training-matrix-v1.json`
- Resolver: `src/training-resolver/`
- Server Functions: `netlify/functions/v1-*.js`
- Frontend: `public/index.html`, `public/js/app.js`

## Tests

```bash
npm test
```

Für kontinuierliches Testen während der Entwicklung:

```bash
npm run test:watch
```
