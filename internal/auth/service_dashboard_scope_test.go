package auth

import (
	"context"
	"testing"

	"github.com/DATA-DOG/go-sqlmock"
)

func TestGuruDashboardStatsAppliesManagementScopeFilter(t *testing.T) {
	t.Parallel()

	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("sqlmock.New: %v", err)
	}
	defer db.Close()

	svc := &Service{db: db}
	mock.ExpectQuery(`SELECT EXISTS \(`).
		WithArgs("exams", "management_scope").
		WillReturnRows(sqlmock.NewRows([]string{"exists"}).AddRow(true))
	mock.ExpectQuery(`SELECT EXISTS \(`).
		WithArgs("exams", "owner_school_id").
		WillReturnRows(sqlmock.NewRows([]string{"exists"}).AddRow(true))

	mock.ExpectQuery(`COALESCE\(NULLIF\(btrim\(e\.management_scope\), ''\), 'same_school'\) = 'cross_school'`).
		WithArgs(int64(21)).
		WillReturnRows(sqlmock.NewRows([]string{"regular_count", "non_regular_count"}).AddRow(int64(8), int64(3)))
	mock.ExpectQuery(`COALESCE\(NULLIF\(btrim\(e\.management_scope\), ''\), 'same_school'\) = 'cross_school'`).
		WithArgs(int64(21)).
		WillReturnRows(sqlmock.NewRows([]string{"completed_exam_count"}).AddRow(int64(5)))
	mock.ExpectQuery(`COALESCE\(NULLIF\(btrim\(e\.management_scope\), ''\), 'same_school'\) = 'cross_school'`).
		WithArgs(int64(21)).
		WillReturnRows(sqlmock.NewRows([]string{"in_progress_count"}).AddRow(int64(2)))

	out, err := svc.GuruDashboardStats(context.Background(), 21)
	if err != nil {
		t.Fatalf("GuruDashboardStats: %v", err)
	}
	if out.UniqueParticipantCount != 11 {
		t.Fatalf("expected unique participant count 11, got %d", out.UniqueParticipantCount)
	}
	if out.CompletedExamCount != 5 {
		t.Fatalf("expected completed exam count 5, got %d", out.CompletedExamCount)
	}
	if out.InProgressCount != 2 {
		t.Fatalf("expected in progress count 2, got %d", out.InProgressCount)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("unmet sql expectations: %v", err)
	}
}
