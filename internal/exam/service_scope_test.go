package exam

import (
	"context"
	"testing"
	"time"

	"cbtlms/internal/auth"

	"github.com/DATA-DOG/go-sqlmock"
)

func TestEnsureProktorExamScopeAllowsExamFromCreatorSchool(t *testing.T) {
	t.Parallel()

	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("sqlmock.New: %v", err)
	}
	defer db.Close()

	svc := NewService(db, 90)
	ctx := auth.ContextWithUser(context.Background(), &auth.User{ID: 17, Role: "proktor"})

	mock.ExpectQuery(`SELECT EXISTS\([\s\S]*FROM exams e[\s\S]*creator_en\.user_id = e\.created_by[\s\S]*creator_scope\.user_id = \$1[\s\S]*\)`).
		WithArgs(int64(17), int64(91)).
		WillReturnRows(sqlmock.NewRows([]string{"exists"}).AddRow(true))

	if err := svc.ensureProktorExamScope(ctx, 91); err != nil {
		t.Fatalf("ensureProktorExamScope: %v", err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("unmet sql expectations: %v", err)
	}
}

func TestListExamsForTokenProktorIncludesSameSchoolCreatorExam(t *testing.T) {
	t.Parallel()

	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("sqlmock.New: %v", err)
	}
	defer db.Close()

	svc := NewService(db, 90)
	ctx := auth.ContextWithUser(context.Background(), &auth.User{ID: 17, Role: "proktor"})
	endAt := time.Now().Add(2 * time.Hour)

	mock.ExpectQuery(`FROM exams e[\s\S]*creator_en\.user_id = e\.created_by[\s\S]*creator_scope\.user_id = \$1`).
		WithArgs(int64(17)).
		WillReturnRows(sqlmock.NewRows([]string{
			"id", "code", "title", "subject_id", "subject_name", "education_level", "subject_type", "end_at",
		}).AddRow(91, "MAT-01", "Try Out Matematika", 8, "Matematika", "SMA", "Wajib", endAt))

	items, err := svc.ListExamsForToken(ctx)
	if err != nil {
		t.Fatalf("ListExamsForToken: %v", err)
	}
	if len(items) != 1 {
		t.Fatalf("expected 1 exam, got %d", len(items))
	}
	if items[0].ID != 91 {
		t.Fatalf("expected exam id 91, got %d", items[0].ID)
	}
	if items[0].EndAt == nil || !items[0].EndAt.Equal(endAt) {
		t.Fatalf("expected end_at %v, got %v", endAt, items[0].EndAt)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("unmet sql expectations: %v", err)
	}
}

func TestListAdminExamsProktorIncludesSameSchoolCreatorExam(t *testing.T) {
	t.Parallel()

	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("sqlmock.New: %v", err)
	}
	defer db.Close()

	svc := NewService(db, 90)
	ctx := auth.ContextWithUser(context.Background(), &auth.User{ID: 17, Role: "proktor"})
	createdAt := time.Now()

	mock.ExpectQuery(`SELECT[\s\S]*COALESCE\(ea\.assigned_count, 0\) AS assigned_count[\s\S]*creator_en\.user_id = e\.created_by[\s\S]*creator_scope\.user_id = \$1`).
		WithArgs(int64(17)).
		WillReturnRows(sqlmock.NewRows([]string{
			"id", "code", "title", "subject_id", "subject_name", "education_level", "subject_type",
			"kktp", "duration_minutes", "max_attempts", "start_at", "end_at", "review_policy",
			"randomize_questions", "randomize_options", "allow_non_regular_self_enroll", "is_active",
			"created_by", "created_at", "question_count", "assigned_count",
		}).AddRow(
			91, "MAT-01", "Try Out Matematika", 8, "Matematika", "SMA", "Wajib",
			75.0, 90, 1, nil, nil, "after_submit",
			false, false, false, true,
			21, createdAt, 10, 0,
		))

	items, err := svc.ListAdminExams(ctx, false)
	if err != nil {
		t.Fatalf("ListAdminExams: %v", err)
	}
	if len(items) != 1 {
		t.Fatalf("expected 1 exam, got %d", len(items))
	}
	if items[0].CreatedBy == nil || *items[0].CreatedBy != 21 {
		t.Fatalf("expected created_by 21, got %+v", items[0].CreatedBy)
	}
	if items[0].AssignedCount != 0 {
		t.Fatalf("expected assigned_count 0, got %d", items[0].AssignedCount)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("unmet sql expectations: %v", err)
	}
}

func TestListExamAssignmentsProktorFiltersStudentsOutsideScope(t *testing.T) {
	t.Parallel()

	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("sqlmock.New: %v", err)
	}
	defer db.Close()

	svc := NewService(db, 90)
	ctx := auth.ContextWithUser(context.Background(), &auth.User{ID: 17, Role: "proktor"})

	mock.ExpectQuery(`SELECT EXISTS\([\s\S]*FROM exams e[\s\S]*creator_scope\.user_id = \$1[\s\S]*\)`).
		WithArgs(int64(17), int64(91)).
		WillReturnRows(sqlmock.NewRows([]string{"exists"}).AddRow(true))
	mock.ExpectQuery(`SELECT id[\s\S]*FROM attempts[\s\S]*WHERE exam_id = \$1[\s\S]*status = 'in_progress'`).
		WithArgs(int64(91)).
		WillReturnRows(sqlmock.NewRows([]string{"id"}))
	mock.ExpectQuery(`FROM exam_assignments ea[\s\S]*WHERE ea\.exam_id = \$1[\s\S]*scoped_en\.user_id = u\.id[\s\S]*scoped_school\.user_id = \$2`).
		WithArgs(int64(91), int64(17)).
		WillReturnRows(sqlmock.NewRows([]string{
			"id", "username", "email", "full_name", "participant_no", "photo_data_url", "is_active", "role",
			"school_id", "school_name", "school_address", "school_city", "school_province", "class_id", "class_name",
			"status", "assigned_at", "assigned_by", "assigned_by_name", "latest_attempt_id", "latest_attempt_status",
			"latest_attempt_score", "latest_started_at", "latest_submitted_at",
		}))

	items, err := svc.ListExamAssignments(ctx, 91)
	if err != nil {
		t.Fatalf("ListExamAssignments: %v", err)
	}
	if len(items) != 0 {
		t.Fatalf("expected filtered assignments to be empty, got %d", len(items))
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("unmet sql expectations: %v", err)
	}
}

func TestListExamParticipantResultsProktorFiltersStudentsOutsideScope(t *testing.T) {
	t.Parallel()

	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("sqlmock.New: %v", err)
	}
	defer db.Close()

	svc := NewService(db, 90)
	ctx := auth.ContextWithUser(context.Background(), &auth.User{ID: 17, Role: "proktor"})

	mock.ExpectQuery(`SELECT EXISTS\([\s\S]*FROM exams e[\s\S]*creator_scope\.user_id = \$1[\s\S]*\)`).
		WithArgs(int64(17), int64(91)).
		WillReturnRows(sqlmock.NewRows([]string{"exists"}).AddRow(true))
	mock.ExpectQuery(`SELECT id[\s\S]*FROM attempts[\s\S]*WHERE exam_id = \$1[\s\S]*status = 'in_progress'`).
		WithArgs(int64(91)).
		WillReturnRows(sqlmock.NewRows([]string{"id"}))
	mock.ExpectQuery(`SELECT EXISTS\(SELECT 1 FROM exams WHERE id = \$1\)`).
		WithArgs(int64(91)).
		WillReturnRows(sqlmock.NewRows([]string{"exists"}).AddRow(true))
	mock.ExpectQuery(`SELECT COALESCE\(MIN\(seq_no\), 0\), COALESCE\(MAX\(seq_no\), 0\), COUNT\(\*\)[\s\S]*FROM exam_questions[\s\S]*WHERE exam_id = \$1`).
		WithArgs(int64(91)).
		WillReturnRows(sqlmock.NewRows([]string{"min_seq", "max_seq", "count"}).AddRow(0, 0, 0))
	mock.ExpectQuery(`FROM exam_questions eq[\s\S]*WHERE eq\.exam_id = \$1`).
		WithArgs(int64(91)).
		WillReturnRows(sqlmock.NewRows([]string{"seq_no", "question_id", "question_type", "answer_key", "weight"}))
	mock.ExpectQuery(`SELECT COALESCE\(MAX\(attempt_ke\), 0\) FROM attempt_base`).
		WithArgs(int64(91), int64(17)).
		WillReturnRows(sqlmock.NewRows([]string{"max_attempt"}).AddRow(0))
	mock.ExpectQuery(`SELECT DISTINCT class_name[\s\S]*FROM attempt_base`).
		WithArgs(int64(91), int64(17)).
		WillReturnRows(sqlmock.NewRows([]string{"class_name"}))
	mock.ExpectQuery(`SELECT DISTINCT school_name[\s\S]*FROM attempt_base`).
		WithArgs(int64(91), int64(17)).
		WillReturnRows(sqlmock.NewRows([]string{"school_name"}))
	mock.ExpectQuery(`SELECT COUNT\(1\)[\s\S]*FROM attempt_base[\s\S]*scoped_en\.user_id = u\.id[\s\S]*scoped_school\.user_id = \$2`).
		WithArgs(int64(91), int64(17)).
		WillReturnRows(sqlmock.NewRows([]string{"count"}).AddRow(0))
	mock.ExpectQuery(`WITH attempt_base AS \([\s\S]*FROM attempts a[\s\S]*WHERE a\.exam_id = \$1[\s\S]*scoped_en\.user_id = u\.id[\s\S]*scoped_school\.user_id = \$2`).
		WithArgs(int64(91), int64(17), 25, 0).
		WillReturnRows(sqlmock.NewRows([]string{
			"id", "student_id", "username", "full_name", "school_name", "class_name", "score", "started_at", "ended_at", "submitted_at", "attempt_ke",
		}))

	out, err := svc.ListExamParticipantResults(ctx, 91, 25, 0, nil, nil, nil)
	if err != nil {
		t.Fatalf("ListExamParticipantResults: %v", err)
	}
	if len(out.Rows) != 0 {
		t.Fatalf("expected filtered result rows to be empty, got %d", len(out.Rows))
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("unmet sql expectations: %v", err)
	}
}
