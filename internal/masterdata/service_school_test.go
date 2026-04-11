package masterdata

import (
	"context"
	"database/sql"
	"testing"

	"github.com/DATA-DOG/go-sqlmock"
)

func TestCreateSchoolAssignsTenantWhenRequired(t *testing.T) {
	t.Parallel()

	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("sqlmock.New: %v", err)
	}
	defer db.Close()

	svc := NewService(db)
	ctx := context.Background()

	mock.ExpectBegin()
	mock.ExpectQuery(`SELECT EXISTS \(\s*SELECT 1\s+FROM information_schema\.columns\s+WHERE table_schema = current_schema\(\)\s+AND table_name = \$1\s+AND column_name = \$2\s*\)`).
		WithArgs("users", "tenant_id").
		WillReturnRows(sqlmock.NewRows([]string{"exists"}).AddRow(true))
	mock.ExpectQuery(`SELECT tenant_id FROM users WHERE id = \$1`).
		WithArgs(int64(7)).
		WillReturnRows(sqlmock.NewRows([]string{"tenant_id"}).AddRow(int64(22)))
	mock.ExpectQuery(`SELECT EXISTS \(\s*SELECT 1\s+FROM information_schema\.columns\s+WHERE table_schema = current_schema\(\)\s+AND table_name = \$1\s+AND column_name = \$2\s*\)`).
		WithArgs("schools", "tenant_id").
		WillReturnRows(sqlmock.NewRows([]string{"exists"}).AddRow(true))
	mock.ExpectQuery(`INSERT INTO schools \(`).
		WithArgs(
			"SMP Uji Tenant",
			"12345678",
			"Jl. Uji No. 1",
			"Bandar Lampung",
			"Lampung",
			"Enggal",
			"SMP",
			"Swasta",
			"uji@example.test",
			int64(22),
		).
		WillReturnRows(sqlmock.NewRows([]string{
			"id", "name", "code", "address", "city", "province", "kecamatan", "jenjang", "status_sekolah", "school_email",
		}).AddRow(
			int64(15),
			"SMP Uji Tenant",
			"12345678",
			"Jl. Uji No. 1",
			"Bandar Lampung",
			"Lampung",
			"Enggal",
			"SMP",
			"Swasta",
			"uji@example.test",
		))
	mock.ExpectCommit()
	mock.ExpectExec(`INSERT INTO audit_logs`).
		WithArgs(int64(7), "school_created", "school", "15", sqlmock.AnyArg()).
		WillReturnResult(sqlmock.NewResult(1, 1))

	out, err := svc.CreateSchool(ctx, 7, CreateSchoolInput{
		Name:          "SMP Uji Tenant",
		Code:          "12345678",
		Address:       "Jl. Uji No. 1",
		City:          "Bandar Lampung",
		Province:      "Lampung",
		Kecamatan:     "Enggal",
		Jenjang:       "SMP",
		StatusSekolah: "Swasta",
		SchoolEmail:   "uji@example.test",
	})
	if err != nil {
		t.Fatalf("CreateSchool: %v", err)
	}
	if out.ID != 15 {
		t.Fatalf("expected school id 15, got %d", out.ID)
	}
	if out.Name != "SMP Uji Tenant" {
		t.Fatalf("unexpected school name: %q", out.Name)
	}

	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("unmet sql expectations: %v", err)
	}
}

func TestCreateSchoolCreatesTenantBySchoolNameWhenActorHasNoTenant(t *testing.T) {
	t.Parallel()

	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("sqlmock.New: %v", err)
	}
	defer db.Close()

	svc := NewService(db)
	ctx := context.Background()

	mock.ExpectBegin()
	mock.ExpectQuery(`SELECT EXISTS \(\s*SELECT 1\s+FROM information_schema\.columns\s+WHERE table_schema = current_schema\(\)\s+AND table_name = \$1\s+AND column_name = \$2\s*\)`).
		WithArgs("users", "tenant_id").
		WillReturnRows(sqlmock.NewRows([]string{"exists"}).AddRow(true))
	mock.ExpectQuery(`SELECT tenant_id FROM users WHERE id = \$1`).
		WithArgs(int64(9)).
		WillReturnRows(sqlmock.NewRows([]string{"tenant_id"}).AddRow(nil))
	mock.ExpectQuery(`SELECT EXISTS \(\s*SELECT 1\s+FROM information_schema\.columns\s+WHERE table_schema = current_schema\(\)\s+AND table_name = \$1\s+AND column_name = \$2\s*\)`).
		WithArgs("schools", "tenant_id").
		WillReturnRows(sqlmock.NewRows([]string{"exists"}).AddRow(true))
	mock.ExpectQuery(`SELECT id\s+FROM tenants\s+WHERE LOWER\(name\) = LOWER\(\$1\)\s+LIMIT 1`).
		WithArgs("SMP Nama Tenant").
		WillReturnError(sql.ErrNoRows)
	mock.ExpectQuery(`SELECT slug\s+FROM tenants\s+WHERE slug = \$1\s+LIMIT 1`).
		WithArgs("smp-nama-tenant").
		WillReturnError(sql.ErrNoRows)
	mock.ExpectQuery(`INSERT INTO tenants \(slug, name, status, created_at, updated_at\)`).
		WithArgs("smp-nama-tenant", "SMP Nama Tenant").
		WillReturnRows(sqlmock.NewRows([]string{"id"}).AddRow(int64(88)))
	mock.ExpectQuery(`INSERT INTO schools \(`).
		WithArgs(
			"SMP Nama Tenant",
			"",
			"Metro, Lampung",
			"Metro",
			"Lampung",
			"",
			"",
			"",
			"",
			int64(88),
		).
		WillReturnRows(sqlmock.NewRows([]string{
			"id", "name", "code", "address", "city", "province", "kecamatan", "jenjang", "status_sekolah", "school_email",
		}).AddRow(
			int64(16),
			"SMP Nama Tenant",
			"",
			"Metro, Lampung",
			"Metro",
			"Lampung",
			"",
			"",
			"",
			"",
		))
	mock.ExpectCommit()
	mock.ExpectExec(`INSERT INTO audit_logs`).
		WithArgs(int64(9), "school_created", "school", "16", sqlmock.AnyArg()).
		WillReturnResult(sqlmock.NewResult(1, 1))

	out, err := svc.CreateSchool(ctx, 9, CreateSchoolInput{
		Name:     "SMP Nama Tenant",
		City:     "Metro",
		Province: "Lampung",
	})
	if err != nil {
		t.Fatalf("CreateSchool: %v", err)
	}
	if out.ID != 16 {
		t.Fatalf("expected school id 16, got %d", out.ID)
	}
	if out.Address != "Metro, Lampung" {
		t.Fatalf("unexpected school address: %q", out.Address)
	}

	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("unmet sql expectations: %v", err)
	}
}
