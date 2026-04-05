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
	mock.ExpectQuery(`SELECT id\s+FROM schools\s+WHERE LOWER\(name\) = LOWER\(\$1\)\s+LIMIT 1`).
		WithArgs("SMP Contoh").
		WillReturnError(sql.ErrNoRows)
	mock.ExpectQuery(`SELECT column_name\s+FROM information_schema\.columns`).
		WillReturnRows(sqlmock.NewRows([]string{"column_name"}))
	mock.ExpectQuery(`INSERT INTO schools \(\s*name, code, address, is_active, created_at, updated_at\s*\)`).
		WithArgs("SMP Contoh", "12345678", "Bandung, Jawa Barat").
		WillReturnRows(sqlmock.NewRows([]string{"id"}).AddRow(77))
	mock.ExpectRollback()

	id, _, err := upsertSchoolTx(
		context.Background(),
		tx,
		nil,
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
	mock.ExpectExec(`UPDATE schools\s+SET name = COALESCE\(NULLIF\(\$1,''\), name\),\s*code = COALESCE\(NULLIF\(\$2,''\), code\),\s*address = COALESCE\(NULLIF\(\$3,''\), address\),\s*city = COALESCE\(NULLIF\(\$4,''\), city\),\s*province = COALESCE\(NULLIF\(\$5,''\), province\),\s*kecamatan = COALESCE\(NULLIF\(\$6,''\), kecamatan\),\s*jenjang = COALESCE\(NULLIF\(\$7,''\), jenjang\),\s*status_sekolah = COALESCE\(NULLIF\(\$8,''\), status_sekolah\),\s*school_email = COALESCE\(NULLIF\(\$9,''\), school_email\),\s*updated_at = now\(\)\s*WHERE id = \$10`).
		WithArgs("SMP Contoh", "12345678", "Jl. Melati", "Bandung", "Jawa Barat", "Coblong", "SMP", "swasta", "admin@smpcontoh.sch.id", int64(55)).
		WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectRollback()

	id, _, err := upsertSchoolTx(
		context.Background(),
		tx,
		nil,
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

func TestUpsertSchoolTxFallsBackToNameWhenCodeNotFound(t *testing.T) {
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
		WithArgs("40203583").
		WillReturnError(sql.ErrNoRows)
	mock.ExpectQuery(`SELECT id\s+FROM schools\s+WHERE LOWER\(name\) = LOWER\(\$1\)\s+LIMIT 1`).
		WithArgs("SMP NEGERI 6 PALU").
		WillReturnRows(sqlmock.NewRows([]string{"id"}).AddRow(81))
	mock.ExpectQuery(`SELECT column_name\s+FROM information_schema\.columns`).
		WillReturnRows(sqlmock.NewRows([]string{"column_name"}))
	mock.ExpectExec(`UPDATE schools\s+SET name = COALESCE\(NULLIF\(\$1,''\), name\),\s*code = COALESCE\(NULLIF\(\$2,''\), code\),\s*address = COALESCE\(NULLIF\(\$3,''\), address\),\s*updated_at = now\(\)\s*WHERE id = \$4`).
		WithArgs("SMP NEGERI 6 PALU", "40203583", "Kota Palu, Prov. Sulawesi Tengah", int64(81)).
		WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectRollback()

	id, _, err := upsertSchoolTx(
		context.Background(),
		tx,
		nil,
		"SMP NEGERI 6 PALU",
		"40203583",
		"Kota Palu",
		"Prov. Sulawesi Tengah",
		"",
		"",
		"",
		"",
		"",
	)
	if err != nil {
		t.Fatalf("upsertSchoolTx: %v", err)
	}
	if id != 81 {
		t.Fatalf("expected school id 81, got %d", id)
	}

	if err := tx.Rollback(); err != nil {
		t.Fatalf("Rollback: %v", err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("unmet sql expectations: %v", err)
	}
}

func TestUpsertSchoolTxInsertCreatesTenantWhenRequired(t *testing.T) {
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
		WithArgs("10801878").
		WillReturnError(sql.ErrNoRows)
	mock.ExpectQuery(`SELECT id\s+FROM schools\s+WHERE LOWER\(name\) = LOWER\(\$1\)\s+LIMIT 1`).
		WithArgs("SMP NEGERI 2 BUMI RATU NUBAN").
		WillReturnError(sql.ErrNoRows)
	mock.ExpectQuery(`SELECT column_name\s+FROM information_schema\.columns`).
		WillReturnRows(sqlmock.NewRows([]string{"column_name"}).
			AddRow("city").
			AddRow("province").
			AddRow("tenant_id"))
	mock.ExpectQuery(`SELECT id\s+FROM tenants\s+WHERE LOWER\(name\) = LOWER\(\$1\)\s+LIMIT 1`).
		WithArgs("SMP NEGERI 2 BUMI RATU NUBAN").
		WillReturnError(sql.ErrNoRows)
	mock.ExpectQuery(`SELECT slug\s+FROM tenants\s+WHERE slug = \$1\s+LIMIT 1`).
		WithArgs("school-smp-negeri-2-bumi-ratu-nuban").
		WillReturnError(sql.ErrNoRows)
	mock.ExpectQuery(`INSERT INTO tenants \(slug, name, status, created_at, updated_at\)`).
		WithArgs("school-smp-negeri-2-bumi-ratu-nuban", "SMP NEGERI 2 BUMI RATU NUBAN").
		WillReturnRows(sqlmock.NewRows([]string{"id"}).AddRow(99))
	mock.ExpectQuery(`INSERT INTO schools \(\s*name, code, address, city, province, tenant_id, is_active, created_at, updated_at\s*\)`).
		WithArgs("SMP NEGERI 2 BUMI RATU NUBAN", "10801878", "Lampung Tengah, Lampung", "Lampung Tengah", "Lampung", int64(99)).
		WillReturnRows(sqlmock.NewRows([]string{"id"}).AddRow(77))
	mock.ExpectRollback()

	id, tenantID, err := upsertSchoolTx(
		context.Background(),
		tx,
		nil,
		"SMP NEGERI 2 BUMI RATU NUBAN",
		"10801878",
		"Lampung Tengah",
		"Lampung",
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
	if tenantID == nil || *tenantID != 99 {
		t.Fatalf("expected tenant id 99, got %v", tenantID)
	}

	if err := tx.Rollback(); err != nil {
		t.Fatalf("Rollback: %v", err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("unmet sql expectations: %v", err)
	}
}

func TestUpsertClassTxInsertIncludesTenantWhenRequired(t *testing.T) {
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

	mock.ExpectQuery(`SELECT id\s+FROM classes\s+WHERE school_id = \$1 AND grade_level = \$2 AND name = \$3\s+LIMIT 1`).
		WithArgs(int64(77), "Kelas 9", "Kelas 9").
		WillReturnError(sql.ErrNoRows)
	mock.ExpectQuery(`SELECT EXISTS \(\s*SELECT 1\s+FROM information_schema\.columns`).
		WithArgs("classes", "tenant_id").
		WillReturnRows(sqlmock.NewRows([]string{"exists"}).AddRow(true))
	mock.ExpectQuery(`INSERT INTO classes \(school_id, name, grade_level, is_active, created_at, updated_at, tenant_id\)`).
		WithArgs(int64(77), "Kelas 9", "Kelas 9", int64(99)).
		WillReturnRows(sqlmock.NewRows([]string{"id"}).AddRow(11))
	mock.ExpectRollback()

	tenantID := int64(99)
	id, err := upsertClassTx(context.Background(), tx, 77, &tenantID, "Kelas 9")
	if err != nil {
		t.Fatalf("upsertClassTx: %v", err)
	}
	if id != 11 {
		t.Fatalf("expected class id 11, got %d", id)
	}

	if err := tx.Rollback(); err != nil {
		t.Fatalf("Rollback: %v", err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("unmet sql expectations: %v", err)
	}
}

func TestNormalizeGradeLevel(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name      string
		className string
		want      string
	}{
		{name: "short stays same", className: "Kelas 8", want: "Kelas 8"},
		{name: "long class extracts grade", className: "Kelas 9.kihajar Dewantara", want: "Kelas 9"},
		{name: "fallback truncates", className: "Rombel Program Khusus Sangat Panjang", want: "Rombel Program Khusu"},
	}

	for _, tc := range tests {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			got := normalizeGradeLevel(tc.className)
			if got != tc.want {
				t.Fatalf("normalizeGradeLevel(%q) = %q, want %q", tc.className, got, tc.want)
			}
		})
	}
}

func TestMergeRegistrationPayloadColumnsFillsMissingValues(t *testing.T) {
	t.Parallel()

	payload := RegistrationFormPayload{
		NonRegular: true,
		SchoolName: "",
		NPSN:       "",
		Kabupaten:  "",
		Provinsi:   "Jawa Barat",
		ClassName:  "",
	}

	mergeRegistrationPayloadColumns(
		&payload,
		sql.NullString{String: " SMP Contoh ", Valid: true},
		sql.NullString{String: "12345678", Valid: true},
		sql.NullString{String: " Bandung ", Valid: true},
		sql.NullString{String: "DKI Jakarta", Valid: true},
		sql.NullString{String: "Coblong", Valid: true},
		sql.NullString{String: "Jl. Melati", Valid: true},
		sql.NullString{String: "admin@smpcontoh.sch.id", Valid: true},
		sql.NullString{String: "SMP", Valid: true},
		sql.NullString{String: "swasta", Valid: true},
		sql.NullString{String: "Kelas 9A", Valid: true},
	)

	if payload.SchoolName != "SMP Contoh" {
		t.Fatalf("expected school_name to be filled from registration columns, got %q", payload.SchoolName)
	}
	if payload.NPSN != "12345678" {
		t.Fatalf("expected NPSN to be filled from registration columns, got %q", payload.NPSN)
	}
	if payload.Kabupaten != "Bandung" {
		t.Fatalf("expected kabupaten to be filled from registration columns, got %q", payload.Kabupaten)
	}
	if payload.Provinsi != "Jawa Barat" {
		t.Fatalf("expected existing provinsi to be preserved, got %q", payload.Provinsi)
	}
	if payload.Kecamatan != "Coblong" {
		t.Fatalf("expected kecamatan to be filled from registration columns, got %q", payload.Kecamatan)
	}
	if payload.Alamat != "Jl. Melati" {
		t.Fatalf("expected alamat to be filled from registration columns, got %q", payload.Alamat)
	}
	if payload.SchoolEmail != "admin@smpcontoh.sch.id" {
		t.Fatalf("expected school_email to be filled from registration columns, got %q", payload.SchoolEmail)
	}
	if payload.Jenjang != "SMP" {
		t.Fatalf("expected jenjang to be filled from registration columns, got %q", payload.Jenjang)
	}
	if payload.StatusSekolah != "swasta" {
		t.Fatalf("expected status_sekolah to be filled from registration columns, got %q", payload.StatusSekolah)
	}
	if payload.ClassName != "Kelas 9A" {
		t.Fatalf("expected class_name to be filled from registration columns, got %q", payload.ClassName)
	}
}
