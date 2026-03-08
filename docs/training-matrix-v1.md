# Training Matrix V1 (vereinfacht)

Die V1 ist auf ein bewusst einfaches Rollenmodell reduziert.

## Rollenmodell

- `admin` (Systemrolle, keine Lernzuweisung)
- `pharma`
- `non_pharma`

Weitere Annahmen:
- Azubis laufen unter `pharma`.
- Eine Filiale (kein Multi-Standort in V1).
- Rollen werden per Einladung/E-Mail gesetzt und nicht im UI bearbeitet.

## Matrix-Quelle

Führende Datei: `docs/training-matrix-v1.json`

Diese enthält je Schulung:
- `required_for`
- `optional_for`
- `slides`
- `quiz`

## Statuslogik in V1

Resolver-Ausgabe je Schulung:
- `required`
- `optional`
- `excluded`

Lernfortschritt im UI:
- `offen`
- `begonnen`
- `abgeschlossen`

`abgeschlossen` bedeutet in V1: Quiz wurde abgeschickt (keine blockierende Bestehensgrenze).
