package exam

import (
	"context"
	"testing"
	"time"

	"cbtlms/internal/auth"

	"github.com/DATA-DOG/go-sqlmock"
)

func TestListExamEventsProktorFiltersStudentsOutsideScope(t *testing.T) {
	t.Parallel()

	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("sqlmock.New: %v", err)
	}
	defer db.Close()

	svc := NewService(db, 90)
	ctx := auth.ContextWithUser(context.Background(), &auth.User{ID: 17, Role: "proktor"})
	now := time.Now()

	mock.ExpectQuery(`SELECT EXISTS\([\s\S]*FROM exams e[\s\S]*creator_scope\.user_id = \$1[\s\S]*\)`).
		WithArgs(int64(17), int64(91)).
		WillReturnRows(sqlmock.NewRows([]string{"exists"}).AddRow(true))
	mock.ExpectQuery(`SELECT EXISTS\(SELECT 1 FROM exams WHERE id = \$1\)`).
		WithArgs(int64(91)).
		WillReturnRows(sqlmock.NewRows([]string{"exists"}).AddRow(true))
	mock.ExpectQuery(`FROM attempt_events ae[\s\S]*JOIN attempts a ON a\.id = ae\.attempt_id[\s\S]*scoped_en\.user_id = a\.student_id[\s\S]*scoped_school\.user_id = \$3`).
		WithArgs(int64(91), 200, int64(17)).
		WillReturnRows(sqlmock.NewRows([]string{
			"id", "attempt_id", "event_type", "payload", "client_ts", "server_ts", "actor_user_id", "full_name", "created_at",
		}).AddRow(
			int64(1), int64(501), "tab_blur", []byte(`{"tab":"hidden"}`), now, now, int64(17), "Proktor A", now,
		))

	items, err := svc.ListExamEvents(ctx, 91, 0)
	if err != nil {
		t.Fatalf("ListExamEvents: %v", err)
	}
	if len(items) != 1 {
		t.Fatalf("expected 1 event, got %d", len(items))
	}
	if items[0].AttemptID != 501 {
		t.Fatalf("expected attempt_id 501, got %d", items[0].AttemptID)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("unmet sql expectations: %v", err)
	}
}

func TestListExamClassEventsProktorAppliesExamAndSchoolScope(t *testing.T) {
	t.Parallel()

	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("sqlmock.New: %v", err)
	}
	defer db.Close()

	svc := NewService(db, 90)
	ctx := auth.ContextWithUser(context.Background(), &auth.User{ID: 17, Role: "proktor"})
	now := time.Now()

	mock.ExpectQuery(`SELECT EXISTS\([\s\S]*FROM exams e[\s\S]*creator_scope\.user_id = \$1[\s\S]*\)`).
		WithArgs(int64(17), int64(91)).
		WillReturnRows(sqlmock.NewRows([]string{"exists"}).AddRow(true))
	mock.ExpectQuery(`SELECT school_id[\s\S]*FROM classes[\s\S]*WHERE id = \$1`).
		WithArgs(int64(41)).
		WillReturnRows(sqlmock.NewRows([]string{"school_id"}).AddRow(int64(8)))
	mock.ExpectQuery(`SELECT EXISTS\([\s\S]*FROM user_school_scopes[\s\S]*WHERE user_id = \$1[\s\S]*school_id = \$2`).
		WithArgs(int64(17), int64(8)).
		WillReturnRows(sqlmock.NewRows([]string{"exists"}).AddRow(true))
	mock.ExpectQuery(`SELECT EXISTS\(SELECT 1 FROM exams WHERE id = \$1\)`).
		WithArgs(int64(91)).
		WillReturnRows(sqlmock.NewRows([]string{"exists"}).AddRow(true))
	mock.ExpectQuery(`FROM attempt_events ae[\s\S]*JOIN enrollments en ON en\.user_id = a\.student_id AND en\.status = 'active'[\s\S]*WHERE a\.exam_id = \$1[\s\S]*en\.class_id = \$2`).
		WithArgs(int64(91), int64(41), 200).
		WillReturnRows(sqlmock.NewRows([]string{
			"id", "attempt_id", "event_type", "payload", "client_ts", "server_ts", "actor_user_id", "full_name", "created_at",
		}).AddRow(
			int64(2), int64(601), "fullscreen_exit", []byte(`{"state":"exit"}`), now, now, int64(17), "Proktor A", now,
		))

	items, err := svc.ListExamClassEvents(ctx, 91, 41, 0)
	if err != nil {
		t.Fatalf("ListExamClassEvents: %v", err)
	}
	if len(items) != 1 {
		t.Fatalf("expected 1 event, got %d", len(items))
	}
	if items[0].AttemptID != 601 {
		t.Fatalf("expected attempt_id 601, got %d", items[0].AttemptID)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("unmet sql expectations: %v", err)
	}
}
