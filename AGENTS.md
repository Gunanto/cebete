# Repository Guidelines

## Project Structure & Module Organization
- `cmd/web`: main entry point for the web server.
- `internal/`: domain modules and services (e.g., `internal/auth`, `internal/exam`, `internal/question`, `internal/masterdata`). Tests live alongside code as `*_test.go`.
- `web/`: server-rendered templates and static assets.
- `public/` and `assets/`: static files and source assets.
- `deployments/`: Docker Compose for local dependencies.
- `scripts/`: operational helpers, including DB migrations.
- `docs/`: runbooks and UAT references.

## Build, Test, and Development Commands
- `make compose-up`: start Postgres/Redis/MinIO via Docker Compose.
- `make dev`: load `.env.local`, run migrations, then start the web server.
- `make run`: start the web server without migrations.
- `./scripts/migrate.sh up`: apply DB migrations.
- `./scripts/migrate.sh status`: show migration status.
- `go test ./...`: run all tests.
- `go test ./internal/app -run TestFrontendSmokePublicRoutes -v`: smoke test for public routes.

## Coding Style & Naming Conventions
- Go code must be formatted with `gofmt`.
- Package names are short and lower-case.
- Tests follow `TestXxx` naming in `*_test.go`.
- Keep new endpoints under `internal/` and wire them in `cmd/web`.

## Testing Guidelines
- Primary framework: Go `testing` package.
- Integration tests are colocated (e.g., `internal/exam/service_integration_test.go`).
- No coverage threshold enforced; add tests for behavior changes and migrations.

## Commit & Pull Request Guidelines
- Commit messages use conventional prefixes like `feat:`, `fix(scope):`, `chore:`, `style:`.
- PRs should include a clear description, test notes (e.g., `go test ./...`), and screenshots for UI changes.
- If a change adds a migration, include the migration name in the PR description.

## Security & Configuration Tips
- Copy `.env.example` to `.env.local` and set secure values, especially `DB_DSN` and `BOOTSTRAP_TOKEN`.
- Use `APP_ENV=production` only with hardened DB and CSRF settings.
