# Repository Guidelines

## Project Structure & Module Organization
- `cmd/web` is the main application entry point.
- `internal/` holds domain packages (e.g., `internal/exam`, `internal/question`, `internal/app`) and their tests.
- `web/` contains server-rendered templates and web assets.
- `public/` and `assets/` hold static files and source assets.
- `deployments/` contains Docker Compose for local dependencies.
- `scripts/` includes migration and ops helpers (e.g., `migrate.sh`, `backup.sh`).
- `docs/` includes runbooks and UAT references.

## Build, Test, and Development Commands
- `make compose-up`: Start PostgreSQL/Redis/MinIO via Docker Compose.
- `make dev`: Load `.env.local`, run migrations, and start the server.
- `make run`: Run the web server without migrations.
- `./scripts/migrate.sh up`: Apply database migrations.
- `./scripts/migrate.sh status`: Show migration status.
- `go test ./...`: Run all Go tests.
- `go test ./internal/app -run TestFrontendSmokePublicRoutes -v`: Run the frontend smoke test suite.

## Coding Style & Naming Conventions
- Go code should be formatted with `gofmt`.
- Tests follow Go conventions: `*_test.go` with `TestXxx` names.
- Keep package names short and lower-case; keep new endpoints under `internal/` and wire them in `cmd/web`.

## Testing Guidelines
- Primary framework is the Go standard testing package.
- Integration tests live alongside modules (e.g., `internal/exam/service_integration_test.go`).
- No explicit coverage threshold is enforced; add tests for behavior changes and migrations.

## Commit & Pull Request Guidelines
- Commit history shows conventional prefixes like `feat:`, `fix(scope):`, `chore:`, and `style:`. Use short, descriptive summaries.
- PRs should include a clear description, test notes (`go test ./...` or targeted runs), and screenshots for UI changes.
- If a change adds a migration, include the new migration name in the PR description.

## Security & Configuration Tips
- Copy `.env.example` to `.env.local` and set secure values, especially `DB_DSN` and `BOOTSTRAP_TOKEN`.
- Use `APP_ENV=production` only with secure DB and CSRF settings; avoid default credentials.
