package auth

import (
	"context"
	"testing"
	"time"

	"github.com/DATA-DOG/go-sqlmock"
	"golang.org/x/crypto/bcrypt"
)

func TestAuthenticatePasswordMatchesIdentifierCaseInsensitively(t *testing.T) {
	t.Parallel()

	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("sqlmock.New: %v", err)
	}
	defer db.Close()

	hash, err := bcrypt.GenerateFromPassword([]byte("secret123"), bcrypt.MinCost)
	if err != nil {
		t.Fatalf("GenerateFromPassword: %v", err)
	}

	svc := &Service{
		db:               db,
		loginMaxFailures: 5,
	}

	mock.ExpectQuery(`SELECT locked_until\s+FROM auth_guard_states\s+WHERE purpose = \$1 AND subject_key = \$2`).
		WithArgs("password_login", "admin@example.com").
		WillReturnRows(sqlmock.NewRows([]string{"locked_until"}))
	mock.ExpectQuery(`SELECT id, username, email, full_name, role, account_status, approved_at, is_non_regular, password_hash\s+FROM users\s+WHERE LOWER\(username\) = LOWER\(\$1\) OR LOWER\(email\) = LOWER\(\$1\)\s+LIMIT 1`).
		WithArgs("Admin@Example.com").
		WillReturnRows(sqlmock.NewRows([]string{
			"id", "username", "email", "full_name", "role", "account_status", "approved_at", "is_non_regular", "password_hash",
		}).AddRow(
			int64(7), "admin", "admin@example.com", "Admin", "admin", "active", time.Now(), false, string(hash),
		))
	mock.ExpectExec(`DELETE FROM auth_guard_states\s+WHERE purpose = \$1 AND subject_key = \$2`).
		WithArgs("password_login", "admin@example.com").
		WillReturnResult(sqlmock.NewResult(0, 1))

	user, err := svc.AuthenticatePassword(context.Background(), "Admin@Example.com", "secret123")
	if err != nil {
		t.Fatalf("AuthenticatePassword: %v", err)
	}
	if user == nil || user.ID != 7 {
		t.Fatalf("unexpected user result: %+v", user)
	}

	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("unmet sql expectations: %v", err)
	}
}
