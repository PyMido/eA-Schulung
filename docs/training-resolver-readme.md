# Training Resolver V1 (einfaches Modell)

## Rollenmodell

- `admin` (keine Lernzuweisung)
- `pharma`
- `non_pharma`

Resolver-Zuweisung bleibt bewusst einfach:
- `required_for`
- `optional_for`
- sonst `excluded`

## Auth + Persistenz

- Auth läuft jetzt über Einladung + Passwort-Setup + Login-Session.
- Rolle wird nach Login serverseitig über `role_assignments` zum echten Benutzerkonto aufgelöst.
- Trainingsdaten (`training_progress`, `quiz_attempts`, `certificates`) sind an stabile `user_id` gebunden.

## Serverintegration

- `v1-admin-invite`
- `v1-setup-password`
- `v1-login`
- `v1-dashboard`
- `v1-start-training`
- `v1-submit-quiz`
- `v1-admin-report`
- `v1-logout`

## Altlogik entfernt/deaktiviert

- Feingranulare Rollen
- Standort-/Event-Sonderfälle
- lokale Fortschrittsspeicherung per localStorage

## Tests

- `tests/training-resolver.test.js`
- `npm test`


## Session-Token im Frontend

- Der Bearer-Token wird nur im In-Memory-State gehalten (kein localStorage).
- Bei 401 wird die Session im UI verworfen und erneuter Login verlangt.
