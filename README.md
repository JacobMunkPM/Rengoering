# Rengøringsopgaver

Delt webapp til registrering af rengøringsopgaver for teamet.

- **Frontend:** `index.html` (statisk HTML/JS)
- **API:** `api/` – Azure Functions (Node.js) mod MongoDB
- **Hosting:** Azure Static Web Apps, auto-deploy fra `main` via GitHub Actions

## Miljøvariabler (sættes i Azure → Environment variables)
- `MONGODB_URI` – forbindelsesstreng til MongoDB Atlas
- `MONGODB_DB` – databasenavn (standard: `rengoring`)
