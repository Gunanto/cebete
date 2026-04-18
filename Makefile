APP=cbtlms

.PHONY: run
run:
	go run ./cmd/web

.PHONY: dev
dev:
	@bash -lc 'set -a; [ -f .env.local ] && source .env.local; set +a; ./scripts/migrate.sh up; go run ./cmd/web'

.PHONY: compose-up
compose-up:
	docker compose -f deployments/docker-compose.yml up -d

.PHONY: compose-down
compose-down:
	docker compose -f deployments/docker-compose.yml down

.PHONY: migrate-status
migrate-status:
	./scripts/migrate.sh status

.PHONY: migrate-up
migrate-up:
	./scripts/migrate.sh up

.PHONY: migrate-down
migrate-down:
	./scripts/migrate.sh down

.PHONY: migrate-reset
migrate-reset:
	./scripts/migrate.sh reset

.PHONY: guru-ui-guard
guru-ui-guard:
	./scripts/guru_ui_guard.sh

.PHONY: guru-ui-preflight
guru-ui-preflight: guru-ui-guard
	@echo "guru ui preflight passed"

.PHONY: guru-ui-uat-smoke
guru-ui-uat-smoke:
	./scripts/uat_guru_ui_smoke.sh

.PHONY: guru-ui-release-gate
guru-ui-release-gate: guru-ui-preflight guru-ui-uat-smoke
	@echo "guru ui release gate passed"
