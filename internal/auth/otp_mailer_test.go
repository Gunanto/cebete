package auth

import (
	"context"
	"database/sql"
	"errors"
	"strings"
	"testing"
	"time"

	"github.com/DATA-DOG/go-sqlmock"
)

type failingMailer struct {
	err error
}

func (m failingMailer) SendOTP(ctx context.Context, email, code string) error {
	return m.err
}

func (m failingMailer) SendFirstLoginLink(ctx context.Context, email, loginURL string) error {
	return m.err
}

func TestNewSMTPMailerUsesStartTLSConfig(t *testing.T) {
	t.Parallel()

	mailer := NewSMTPMailer(SMTPConfig{
		Host:     "smtp.example.com",
		Port:     587,
		From:     "noreply@example.com",
		StartTLS: true,
	})

	smtpMailer, ok := mailer.(*SMTPMailer)
	if !ok {
		t.Fatalf("expected *SMTPMailer, got %T", mailer)
	}
	if !smtpMailer.startTLS {
		t.Fatalf("expected startTLS to be enabled")
	}
}

func TestRequestSignupOTPReturnsErrorWhenMailerFails(t *testing.T) {
	t.Parallel()

	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("sqlmock.New: %v", err)
	}
	defer db.Close()

	svc := NewService(db, ServiceConfig{
		Mailer: failingMailer{err: errors.New("smtp down")},
	})
	email := "peserta@example.com"
	guardKey := normalizeGuardKey(email)

	mock.ExpectQuery(`SELECT locked_until`).
		WithArgs("otp_request", guardKey).
		WillReturnError(sql.ErrNoRows)
	mock.ExpectQuery(`SELECT EXISTS\(`).
		WithArgs(email).
		WillReturnRows(sqlmock.NewRows([]string{"exists"}).AddRow(false))
	mock.ExpectQuery(`SELECT EXISTS\(`).
		WithArgs(email).
		WillReturnRows(sqlmock.NewRows([]string{"exists"}).AddRow(false))
	mock.ExpectQuery(`SELECT created_at`).
		WithArgs(email).
		WillReturnError(sql.ErrNoRows)
	mock.ExpectExec(`INSERT INTO auth_otp_codes`).
		WithArgs(email, sqlmock.AnyArg(), sqlmock.AnyArg()).
		WillReturnResult(sqlmock.NewResult(1, 1))

	err = svc.RequestSignupOTP(context.Background(), email)
	if err == nil {
		t.Fatalf("expected error, got nil")
	}
	if !strings.Contains(err.Error(), "send signup otp email") {
		t.Fatalf("expected send signup otp email error, got %v", err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("unmet sql expectations: %v", err)
	}
}

func TestConsumeFirstLoginMagicLinkReturnsUser(t *testing.T) {
	t.Parallel()

	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("sqlmock.New: %v", err)
	}
	defer db.Close()

	svc := NewService(db, ServiceConfig{})
	token := "magic-token-123"
	tokenHash := hashToken(token)
	expiresAt := time.Now().Add(10 * time.Minute)
	approvedAt := time.Now()

	mock.ExpectBegin()
	mock.ExpectQuery(`SELECT id, user_id, expires_at`).
		WithArgs(tokenHash).
		WillReturnRows(sqlmock.NewRows([]string{"id", "user_id", "expires_at"}).AddRow(7, 21, expiresAt))
	mock.ExpectExec(`UPDATE auth_magic_links SET used_at = now\(\) WHERE id = \$1`).
		WithArgs(int64(7)).
		WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectQuery(`SELECT id, username, email, full_name, role, account_status, approved_at, is_non_regular`).
		WithArgs(int64(21)).
		WillReturnRows(sqlmock.NewRows([]string{"id", "username", "email", "full_name", "role", "account_status", "approved_at", "is_non_regular"}).
			AddRow(21, "peserta01", "peserta@example.com", "Peserta Uji", "siswa", "active", approvedAt, true))
	mock.ExpectCommit()

	user, err := svc.ConsumeFirstLoginMagicLink(context.Background(), token)
	if err != nil {
		t.Fatalf("ConsumeFirstLoginMagicLink: %v", err)
	}
	if user == nil || user.ID != 21 {
		t.Fatalf("unexpected user: %#v", user)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("unmet sql expectations: %v", err)
	}
}
