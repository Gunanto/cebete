package masterdata

import (
	"context"
	"testing"

	"github.com/DATA-DOG/go-sqlmock"
)

func TestCreateClassAssignsTenantFromSchoolWhenRequired(t *testing.T) {
	t.Parallel()

	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("sqlmock.New: %v", err)
	}
	defer db.Close()

	svc := NewService(db)
	ctx := context.Background()

	mock.ExpectBegin()
	mock.ExpectQuery(`SELECT EXISTS \(`).
		WithArgs("classes", "tenant_id").
		WillReturnRows(sqlmock.NewRows([]string{"exists"}).AddRow(true))
	mock.ExpectQuery(`SELECT EXISTS \(`).
		WithArgs("schools", "tenant_id").
		WillReturnRows(sqlmock.NewRows([]string{"exists"}).AddRow(true))
	mock.ExpectQuery(`SELECT tenant_id, name\s+FROM schools\s+WHERE id = \$1`).
		WithArgs(int64(10)).
		WillReturnRows(sqlmock.NewRows([]string{"tenant_id", "name"}).AddRow(int64(77), "SMP Contoh"))
	mock.ExpectQuery(`INSERT INTO classes \(`).
		WithArgs(int64(10), "X-A", "10", int64(77)).
		WillReturnRows(sqlmock.NewRows([]string{"id", "school_id", "name", "grade_level"}).AddRow(int64(55), int64(10), "X-A", "10"))
	mock.ExpectCommit()
	mock.ExpectExec(`INSERT INTO audit_logs`).
		WithArgs(int64(9), "class_created", "class", "55", sqlmock.AnyArg()).
		WillReturnResult(sqlmock.NewResult(1, 1))

	out, err := svc.CreateClass(ctx, 9, CreateClassInput{
		SchoolID:   10,
		Name:       "X-A",
		GradeLevel: "10",
	})
	if err != nil {
		t.Fatalf("CreateClass: %v", err)
	}
	if out.ID != 55 {
		t.Fatalf("expected class id 55, got %d", out.ID)
	}

	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("unmet sql expectations: %v", err)
	}
}

func TestUpdateClassBackfillsTenantWhenRequired(t *testing.T) {
	t.Parallel()

	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("sqlmock.New: %v", err)
	}
	defer db.Close()

	svc := NewService(db)
	ctx := context.Background()

	mock.ExpectBegin()
	mock.ExpectQuery(`SELECT EXISTS \(`).
		WithArgs("classes", "tenant_id").
		WillReturnRows(sqlmock.NewRows([]string{"exists"}).AddRow(true))
	mock.ExpectQuery(`SELECT EXISTS \(`).
		WithArgs("schools", "tenant_id").
		WillReturnRows(sqlmock.NewRows([]string{"exists"}).AddRow(true))
	mock.ExpectQuery(`SELECT tenant_id, name\s+FROM schools\s+WHERE id = \$1`).
		WithArgs(int64(10)).
		WillReturnRows(sqlmock.NewRows([]string{"tenant_id", "name"}).AddRow(int64(77), "SMP Contoh"))
	mock.ExpectQuery(`UPDATE classes`).
		WithArgs(int64(5), int64(10), "X-B", "10", int64(77)).
		WillReturnRows(sqlmock.NewRows([]string{"id", "school_id", "name", "grade_level"}).AddRow(int64(5), int64(10), "X-B", "10"))
	mock.ExpectCommit()
	mock.ExpectExec(`INSERT INTO audit_logs`).
		WithArgs(int64(9), "class_updated", "class", "5", sqlmock.AnyArg()).
		WillReturnResult(sqlmock.NewResult(1, 1))

	out, err := svc.UpdateClass(ctx, 9, 5, UpdateClassInput{
		SchoolID:   10,
		Name:       "X-B",
		GradeLevel: "10",
	})
	if err != nil {
		t.Fatalf("UpdateClass: %v", err)
	}
	if out.ID != 5 {
		t.Fatalf("expected class id 5, got %d", out.ID)
	}

	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("unmet sql expectations: %v", err)
	}
}
