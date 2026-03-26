package auth

import (
	"context"
	"database/sql"
	"testing"

	"github.com/DATA-DOG/go-sqlmock"
)

func TestUpsertSchoolTxInsertWorksWithLegacySchema(t *testing.T) {
	t.Parallel()

	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("sqlmock.New: %v", err)
	}
	defer db.Close()

	mock.ExpectBegin()
	tx, err := db.BeginTx(context.Background(), nil)
	if err != nil {
		t.Fatalf("BeginTx: %v", err)
	}

	mock.ExpectQuery(`SELECT id\s+FROM schools\s+WHERE code = \$1\s+LIMIT 1`).
		WithArgs("12345678").
		WillReturnError(sql.ErrNoRows)
	mock.ExpectQuery(`SELECT column_name\s+FROM information_schema\.columns`).
		WillReturnRows(sqlmock.NewRows([]string{"column_name"}))
	mock.ExpectQuery(`INSERT INTO schools \(\s*name, code, address, is_active, created_at, updated_at\s*\)`).
		WithArgs("SMP Contoh", "12345678", "Bandung, Jawa Barat").
		WillReturnRows(sqlmock.NewRows([]string{"id"}).AddRow(77))
	mock.ExpectRollback()

	id, err := upsertSchoolTx(
		context.Background(),
		tx,
		"SMP Contoh",
		"12345678",
		"Bandung",
		"Jawa Barat",
		"",
		"",
		"",
		"",
		"",
	)
	if err != nil {
		t.Fatalf("upsertSchoolTx: %v", err)
	}
	if id != 77 {
		t.Fatalf("expected school id 77, got %d", id)
	}

	if err := tx.Rollback(); err != nil {
		t.Fatalf("Rollback: %v", err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("unmet sql expectations: %v", err)
	}
}

func TestUpsertSchoolTxUpdatesExistingSchool(t *testing.T) {
	t.Parallel()

	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("sqlmock.New: %v", err)
	}
	defer db.Close()

	mock.ExpectBegin()
	tx, err := db.BeginTx(context.Background(), nil)
	if err != nil {
		t.Fatalf("BeginTx: %v", err)
	}

	mock.ExpectQuery(`SELECT id\s+FROM schools\s+WHERE code = \$1\s+LIMIT 1`).
		WithArgs("12345678").
		WillReturnRows(sqlmock.NewRows([]string{"id"}).AddRow(55))
	mock.ExpectQuery(`SELECT column_name\s+FROM information_schema\.columns`).
		WillReturnRows(sqlmock.NewRows([]string{"column_name"}).
			AddRow("city").
			AddRow("province").
			AddRow("kecamatan").
			AddRow("jenjang").
			AddRow("status_sekolah").
			AddRow("school_email"))
	mock.ExpectExec(`UPDATE schools\s+SET address = COALESCE\(NULLIF\(\$1,''\), address\),\s*city = COALESCE\(NULLIF\(\$2,''\), city\),\s*province = COALESCE\(NULLIF\(\$3,''\), province\),\s*kecamatan = COALESCE\(NULLIF\(\$4,''\), kecamatan\),\s*jenjang = COALESCE\(NULLIF\(\$5,''\), jenjang\),\s*status_sekolah = COALESCE\(NULLIF\(\$6,''\), status_sekolah\),\s*school_email = COALESCE\(NULLIF\(\$7,''\), school_email\),\s*updated_at = now\(\)\s*WHERE id = \$8`).
		WithArgs("Jl. Melati", "Bandung", "Jawa Barat", "Coblong", "SMP", "swasta", "admin@smpcontoh.sch.id", int64(55)).
		WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectRollback()

	id, err := upsertSchoolTx(
		context.Background(),
		tx,
		"SMP Contoh",
		"12345678",
		"Bandung",
		"Jawa Barat",
		"Coblong",
		"Jl. Melati",
		"SMP",
		"swasta",
		"admin@smpcontoh.sch.id",
	)
	if err != nil {
		t.Fatalf("upsertSchoolTx: %v", err)
	}
	if id != 55 {
		t.Fatalf("expected school id 55, got %d", id)
	}

	if err := tx.Rollback(); err != nil {
		t.Fatalf("Rollback: %v", err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("unmet sql expectations: %v", err)
	}
}
