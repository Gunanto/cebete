package exam

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
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
			"exam_token_plain", "exam_token_generated_at", "exam_token_expires_at", "exam_token_published_at",
		}).AddRow(91, "MAT-01", "Try Out Matematika", 8, "Matematika", "SMA", "Wajib", endAt, nil, nil, nil, nil))

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
	mock.ExpectQuery(`SELECT EXISTS \(`).
		WithArgs("exams", "management_scope").
		WillReturnRows(sqlmock.NewRows([]string{"exists"}).AddRow(true))
	mock.ExpectQuery(`SELECT EXISTS \(`).
		WithArgs("exams", "owner_school_id").
		WillReturnRows(sqlmock.NewRows([]string{"exists"}).AddRow(true))

	mock.ExpectQuery(`SELECT[\s\S]*COALESCE\(ea\.assigned_count, 0\) AS assigned_count[\s\S]*creator_en\.user_id = e\.created_by[\s\S]*creator_scope\.user_id = \$1`).
		WithArgs(int64(17)).
		WillReturnRows(sqlmock.NewRows([]string{
			"id", "code", "title", "management_scope", "owner_school_id", "subject_id", "subject_name", "education_level", "subject_type",
			"kktp", "duration_minutes", "max_attempts", "start_at", "end_at", "review_policy",
			"randomize_questions", "randomize_options", "allow_non_regular_self_enroll", "is_active",
			"created_by", "created_at", "question_count", "assigned_count",
		}).AddRow(
			91, "MAT-01", "Try Out Matematika", "same_school", int64(3), 8, "Matematika", "SMA", "Wajib",
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
	mock.ExpectQuery(`WITH attempt_base AS \([\s\S]*scoped_en\.user_id = u\.id[\s\S]*scoped_school\.user_id = \$2[\s\S]*SELECT COUNT\(1\) FROM attempt_base`).
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

func TestLoadExamParticipantResultFiltersProktorScopesFilterOptions(t *testing.T) {
	t.Parallel()

	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("sqlmock.New: %v", err)
	}
	defer db.Close()

	svc := NewService(db, 90)
	ctx := auth.ContextWithUser(context.Background(), &auth.User{ID: 17, Role: "proktor"})

	mock.ExpectQuery(`SELECT COALESCE\(MAX\(attempt_ke\), 0\) FROM attempt_base`).
		WithArgs(int64(91), int64(17)).
		WillReturnRows(sqlmock.NewRows([]string{"max_attempt"}).AddRow(2))
	mock.ExpectQuery(`SELECT DISTINCT class_name[\s\S]*FROM attempt_base`).
		WithArgs(int64(91), int64(17)).
		WillReturnRows(sqlmock.NewRows([]string{"class_name"}).AddRow("Kelas Scoped"))
	mock.ExpectQuery(`SELECT DISTINCT school_name[\s\S]*FROM attempt_base`).
		WithArgs(int64(91), int64(17)).
		WillReturnRows(sqlmock.NewRows([]string{"school_name"}).AddRow("Sekolah Scoped"))

	out, err := svc.loadExamParticipantResultFilters(ctx, 91, 17)
	if err != nil {
		t.Fatalf("loadExamParticipantResultFilters: %v", err)
	}
	if len(out.Attempts) != 2 || out.Attempts[0] != 1 || out.Attempts[1] != 2 {
		t.Fatalf("expected attempts [1 2], got %+v", out.Attempts)
	}
	if len(out.Classes) != 1 || out.Classes[0] != "Kelas Scoped" {
		t.Fatalf("expected scoped class filter, got %+v", out.Classes)
	}
	if len(out.Schools) != 1 || out.Schools[0] != "Sekolah Scoped" {
		t.Fatalf("expected scoped school filter, got %+v", out.Schools)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("unmet sql expectations: %v", err)
	}
}

func TestGetExamScoreRecapProktorUsesScopedAssignments(t *testing.T) {
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
	mock.ExpectQuery(`SELECT id[\s\S]*FROM attempts[\s\S]*WHERE exam_id = \$1[\s\S]*status = 'in_progress'`).
		WithArgs(int64(91)).
		WillReturnRows(sqlmock.NewRows([]string{"id"}))
	mock.ExpectQuery(`SELECT EXISTS\(SELECT 1 FROM exams WHERE id = \$1\),[\s\S]*SELECT kktp FROM exams WHERE id = \$1`).
		WithArgs(int64(91)).
		WillReturnRows(sqlmock.NewRows([]string{"exists", "kktp"}).AddRow(true, 70.0))

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
			"latest_attempt_score", "latest_started_at", "latest_submitted_at", "latest_activity_at",
		}).AddRow(
			int64(201), "siswa_scope", "siswa_scope@example.test", "Siswa Scoped", nil, nil, true, "siswa",
			int64(8), "Sekolah Scoped", "Jl. Scoped", "Kota Scoped", "Prov Scoped", int64(18), "Kelas Scoped",
			"active", now, int64(17), "Proktor Scoped", int64(301), "submitted", 8.0, now.Add(-30*time.Minute), now.Add(-10*time.Minute), now.Add(-5*time.Minute),
		))

	mock.ExpectQuery(`SELECT[\s\S]*e\.code,[\s\S]*e\.title,[\s\S]*COALESCE\(s\.name, ''\) AS subject_name[\s\S]*COALESCE\(u\.full_name, ''\) AS teacher_name[\s\S]*FROM exams e[\s\S]*WHERE e\.id = \$1`).
		WithArgs(int64(91)).
		WillReturnRows(sqlmock.NewRows([]string{"code", "title", "subject_name", "teacher_name", "start_at", "end_at"}).
			AddRow("EX-91", "Ujian Scoped", "Matematika", "Guru Scoped", nil, nil))
	mock.ExpectQuery(`SELECT COALESCE\(SUM\(weight\), 0\)[\s\S]*FROM exam_questions[\s\S]*WHERE exam_id = \$1`).
		WithArgs(int64(91)).
		WillReturnRows(sqlmock.NewRows([]string{"sum"}).AddRow(10.0))
	mock.ExpectQuery(`SELECT COUNT\(\*\)[\s\S]*FROM exam_questions[\s\S]*WHERE exam_id = \$1`).
		WithArgs(int64(91)).
		WillReturnRows(sqlmock.NewRows([]string{"count"}).AddRow(10))
	mock.ExpectQuery(`SELECT id, status, COALESCE\(score, 0\), started_at, submitted_at[\s\S]*FROM attempts[\s\S]*WHERE exam_id = \$1 AND student_id = \$2`).
		WithArgs(int64(91), int64(201)).
		WillReturnRows(sqlmock.NewRows([]string{"id", "status", "score", "started_at", "submitted_at"}).
			AddRow(int64(301), "submitted", 8.0, now.Add(-30*time.Minute), now.Add(-10*time.Minute)))

	out, err := svc.GetExamScoreRecap(ctx, 91, "highest", nil, nil)
	if err != nil {
		t.Fatalf("GetExamScoreRecap: %v", err)
	}
	if out == nil {
		t.Fatal("expected recap, got nil")
	}
	if out.Summary.ParticipantCount != 1 {
		t.Fatalf("expected 1 scoped participant, got %d", out.Summary.ParticipantCount)
	}
	if len(out.Rows) != 1 {
		t.Fatalf("expected 1 recap row, got %d", len(out.Rows))
	}
	if out.Rows[0].UserID != 201 {
		t.Fatalf("expected scoped student id 201, got %d", out.Rows[0].UserID)
	}
	if out.Rows[0].FinalScore == nil || *out.Rows[0].FinalScore != 80 {
		t.Fatalf("expected normalized final score 80, got %+v", out.Rows[0].FinalScore)
	}
	if out.Rows[0].FinalStatus != "passed" {
		t.Fatalf("expected passed final status, got %q", out.Rows[0].FinalStatus)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("unmet sql expectations: %v", err)
	}
}

func TestLoadTeacherAccessProfileReturnsCrossSchool(t *testing.T) {
	t.Parallel()

	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("sqlmock.New: %v", err)
	}
	defer db.Close()

	svc := NewService(db, 90)
	mock.ExpectQuery(`SELECT teacher_access_profile[\s\S]*FROM users`).
		WithArgs(int64(9)).
		WillReturnRows(sqlmock.NewRows([]string{"teacher_access_profile"}).AddRow("cross_school"))

	profile, err := svc.loadTeacherAccessProfile(context.Background(), 9)
	if err != nil {
		t.Fatalf("loadTeacherAccessProfile: %v", err)
	}
	if profile != teacherAccessProfileCrossSchool {
		t.Fatalf("expected profile %q, got %q", teacherAccessProfileCrossSchool, profile)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("unmet sql expectations: %v", err)
	}
}

func TestLoadTeacherAccessProfileDefaultsWhenColumnMissing(t *testing.T) {
	t.Parallel()

	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("sqlmock.New: %v", err)
	}
	defer db.Close()

	svc := NewService(db, 90)
	mock.ExpectQuery(`SELECT teacher_access_profile[\s\S]*FROM users`).
		WithArgs(int64(11)).
		WillReturnError(fmt.Errorf(`pq: column "teacher_access_profile" does not exist`))
	mock.ExpectQuery(`SELECT role[\s\S]*FROM users`).
		WithArgs(int64(11)).
		WillReturnRows(sqlmock.NewRows([]string{"role"}).AddRow("guru"))

	profile, err := svc.loadTeacherAccessProfile(context.Background(), 11)
	if err != nil {
		t.Fatalf("loadTeacherAccessProfile: %v", err)
	}
	if profile != teacherAccessProfileSchool {
		t.Fatalf("expected profile %q, got %q", teacherAccessProfileSchool, profile)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("unmet sql expectations: %v", err)
	}
}

func TestLoadUserPrimarySchoolIDReturnsLatestSchool(t *testing.T) {
	t.Parallel()

	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("sqlmock.New: %v", err)
	}
	defer db.Close()

	svc := NewService(db, 90)
	mock.ExpectQuery(`SELECT school_id[\s\S]*FROM enrollments`).
		WithArgs(int64(13)).
		WillReturnRows(sqlmock.NewRows([]string{"school_id"}).AddRow(int64(77)))

	schoolID, err := svc.loadUserPrimarySchoolID(context.Background(), 13)
	if err != nil {
		t.Fatalf("loadUserPrimarySchoolID: %v", err)
	}
	if schoolID == nil || *schoolID != 77 {
		t.Fatalf("expected school id 77, got %+v", schoolID)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("unmet sql expectations: %v", err)
	}
}

func TestLoadUserPrimarySchoolIDFallsBackToScopedSchool(t *testing.T) {
	t.Parallel()

	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("sqlmock.New: %v", err)
	}
	defer db.Close()

	svc := NewService(db, 90)
	mock.ExpectQuery(`SELECT school_id[\s\S]*FROM enrollments`).
		WithArgs(int64(13)).
		WillReturnError(sql.ErrNoRows)
	mock.ExpectQuery(`SELECT school_id[\s\S]*FROM user_school_scopes`).
		WithArgs(int64(13)).
		WillReturnRows(sqlmock.NewRows([]string{"school_id"}).AddRow(int64(88)))

	schoolID, err := svc.loadUserPrimarySchoolID(context.Background(), 13)
	if err != nil {
		t.Fatalf("loadUserPrimarySchoolID: %v", err)
	}
	if schoolID == nil || *schoolID != 88 {
		t.Fatalf("expected scoped school id 88, got %+v", schoolID)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("unmet sql expectations: %v", err)
	}
}

func TestLoadExamManagementScopeReturnsStoredScope(t *testing.T) {
	t.Parallel()

	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("sqlmock.New: %v", err)
	}
	defer db.Close()

	svc := NewService(db, 90)
	mock.ExpectQuery(`SELECT management_scope, owner_school_id[\s\S]*FROM exams`).
		WithArgs(int64(21)).
		WillReturnRows(sqlmock.NewRows([]string{"management_scope", "owner_school_id"}).AddRow("cross_school", int64(9)))

	scope, ownerSchoolID, err := svc.loadExamManagementScope(context.Background(), 21)
	if err != nil {
		t.Fatalf("loadExamManagementScope: %v", err)
	}
	if scope != examManagementScopeCrossSchool {
		t.Fatalf("expected scope %q, got %q", examManagementScopeCrossSchool, scope)
	}
	if ownerSchoolID == nil || *ownerSchoolID != 9 {
		t.Fatalf("expected owner_school_id=9, got %+v", ownerSchoolID)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("unmet sql expectations: %v", err)
	}
}

func TestLoadExamManagementScopeFallsBackWhenColumnMissing(t *testing.T) {
	t.Parallel()

	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("sqlmock.New: %v", err)
	}
	defer db.Close()

	svc := NewService(db, 90)
	mock.ExpectQuery(`SELECT management_scope, owner_school_id[\s\S]*FROM exams`).
		WithArgs(int64(22)).
		WillReturnError(fmt.Errorf(`pq: column "management_scope" does not exist`))
	mock.ExpectQuery(`SELECT enr\.school_id[\s\S]*FROM exams e`).
		WithArgs(int64(22)).
		WillReturnRows(sqlmock.NewRows([]string{"school_id"}).AddRow(int64(15)))

	scope, ownerSchoolID, err := svc.loadExamManagementScope(context.Background(), 22)
	if err != nil {
		t.Fatalf("loadExamManagementScope: %v", err)
	}
	if scope != examManagementScopeSameSchool {
		t.Fatalf("expected scope %q, got %q", examManagementScopeSameSchool, scope)
	}
	if ownerSchoolID == nil || *ownerSchoolID != 15 {
		t.Fatalf("expected owner_school_id=15, got %+v", ownerSchoolID)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("unmet sql expectations: %v", err)
	}
}

func TestCreateExamDefaultsToSameSchoolForSchoolTeacher(t *testing.T) {
	t.Parallel()

	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("sqlmock.New: %v", err)
	}
	defer db.Close()

	svc := NewService(db, 90)
	ctx := auth.ContextWithUser(context.Background(), &auth.User{ID: 21, Role: "guru"})
	createdAt := time.Now()

	mock.ExpectQuery(`SELECT school_id[\s\S]*FROM enrollments`).
		WithArgs(int64(21)).
		WillReturnRows(sqlmock.NewRows([]string{"school_id"}).AddRow(int64(3)))
	mock.ExpectQuery(`SELECT teacher_access_profile[\s\S]*FROM users`).
		WithArgs(int64(21)).
		WillReturnRows(sqlmock.NewRows([]string{"teacher_access_profile"}).AddRow("school"))
	mock.ExpectQuery(`SELECT EXISTS \(`).
		WithArgs("exams", "tenant_id").
		WillReturnRows(sqlmock.NewRows([]string{"exists"}).AddRow(false))
	mock.ExpectQuery(`SELECT EXISTS \(`).
		WithArgs("exams", "management_scope").
		WillReturnRows(sqlmock.NewRows([]string{"exists"}).AddRow(true))
	mock.ExpectQuery(`SELECT EXISTS \(`).
		WithArgs("exams", "owner_school_id").
		WillReturnRows(sqlmock.NewRows([]string{"exists"}).AddRow(true))
	mock.ExpectQuery(`INSERT INTO exams \(`).
		WithArgs(
			"SC-001",
			"Ujian Scope Guru",
			int64(8),
			75.0,
			90,
			1,
			nil,
			nil,
			"after_submit",
			false,
			false,
			false,
			int64(21),
			"same_school",
			int64(3),
		).
		WillReturnRows(sqlmock.NewRows([]string{"id"}).AddRow(int64(91)))
	mock.ExpectQuery(`SELECT EXISTS \(`).
		WithArgs("exams", "management_scope").
		WillReturnRows(sqlmock.NewRows([]string{"exists"}).AddRow(true))
	mock.ExpectQuery(`SELECT EXISTS \(`).
		WithArgs("exams", "owner_school_id").
		WillReturnRows(sqlmock.NewRows([]string{"exists"}).AddRow(true))
	mock.ExpectQuery(`SELECT[\s\S]*FROM exams e[\s\S]*WHERE e\.id = \$1`).
		WithArgs(int64(91)).
		WillReturnRows(sqlmock.NewRows([]string{
			"id", "code", "title", "management_scope", "owner_school_id", "subject_id", "subject_name", "education_level", "subject_type",
			"kktp", "duration_minutes", "max_attempts", "start_at", "end_at", "review_policy",
			"randomize_questions", "randomize_options", "allow_non_regular_self_enroll", "is_active",
			"created_by", "created_at", "question_count", "assigned_count",
		}).AddRow(
			91, "SC-001", "Ujian Scope Guru", "same_school", int64(3), 8, "Matematika", "SMA", "Wajib",
			75.0, 90, 1, nil, nil, "after_submit",
			false, false, false, true,
			21, createdAt, 0, 0,
		))

	out, err := svc.CreateExam(ctx, CreateExamInput{
		Code:      "sc-001",
		Title:     "Ujian Scope Guru",
		SubjectID: 8,
		KKTP:      75,
		CreatedBy: 21,
	})
	if err != nil {
		t.Fatalf("CreateExam: %v", err)
	}
	if out == nil {
		t.Fatal("expected exam, got nil")
	}
	if out.ManagementScope != "same_school" {
		t.Fatalf("expected management_scope same_school, got %q", out.ManagementScope)
	}
	if out.OwnerSchoolID == nil || *out.OwnerSchoolID != 3 {
		t.Fatalf("expected owner_school_id 3, got %+v", out.OwnerSchoolID)
	}
	if out.Code != "SC-001" {
		t.Fatalf("expected normalized code SC-001, got %q", out.Code)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("unmet sql expectations: %v", err)
	}
}

func TestCreateExamRejectsCrossSchoolForSchoolTeacher(t *testing.T) {
	t.Parallel()

	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("sqlmock.New: %v", err)
	}
	defer db.Close()

	svc := NewService(db, 90)
	ctx := auth.ContextWithUser(context.Background(), &auth.User{ID: 21, Role: "guru"})

	mock.ExpectQuery(`SELECT teacher_access_profile[\s\S]*FROM users`).
		WithArgs(int64(21)).
		WillReturnRows(sqlmock.NewRows([]string{"teacher_access_profile"}).AddRow("school"))

	_, err = svc.CreateExam(ctx, CreateExamInput{
		Code:            "SC-002",
		Title:           "Ujian Lintas",
		SubjectID:       8,
		ManagementScope: "cross_school",
		CreatedBy:       21,
	})
	if !errors.Is(err, ErrExamForbidden) {
		t.Fatalf("expected ErrExamForbidden, got %v", err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("unmet sql expectations: %v", err)
	}
}

func TestCreateExamUsesSchoolTenantWhenGuruTenantMissing(t *testing.T) {
	t.Parallel()

	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("sqlmock.New: %v", err)
	}
	defer db.Close()

	svc := NewService(db, 90)
	ctx := auth.ContextWithUser(context.Background(), &auth.User{ID: 21, Role: "guru"})
	createdAt := time.Now()

	mock.ExpectQuery(`SELECT school_id[\s\S]*FROM enrollments`).
		WithArgs(int64(21)).
		WillReturnRows(sqlmock.NewRows([]string{"school_id"}).AddRow(int64(3)))
	mock.ExpectQuery(`SELECT teacher_access_profile[\s\S]*FROM users`).
		WithArgs(int64(21)).
		WillReturnRows(sqlmock.NewRows([]string{"teacher_access_profile"}).AddRow("school"))
	mock.ExpectQuery(`SELECT EXISTS \(`).
		WithArgs("exams", "tenant_id").
		WillReturnRows(sqlmock.NewRows([]string{"exists"}).AddRow(true))
	mock.ExpectQuery(`SELECT EXISTS \(`).
		WithArgs("exams", "management_scope").
		WillReturnRows(sqlmock.NewRows([]string{"exists"}).AddRow(true))
	mock.ExpectQuery(`SELECT EXISTS \(`).
		WithArgs("exams", "owner_school_id").
		WillReturnRows(sqlmock.NewRows([]string{"exists"}).AddRow(true))
	mock.ExpectQuery(`SELECT EXISTS \(`).
		WithArgs("users", "tenant_id").
		WillReturnRows(sqlmock.NewRows([]string{"exists"}).AddRow(true))
	mock.ExpectQuery(`SELECT tenant_id FROM users WHERE id = \$1`).
		WithArgs(int64(21)).
		WillReturnRows(sqlmock.NewRows([]string{"tenant_id"}).AddRow(nil))
	mock.ExpectQuery(`SELECT EXISTS \(`).
		WithArgs("schools", "tenant_id").
		WillReturnRows(sqlmock.NewRows([]string{"exists"}).AddRow(true))
	mock.ExpectQuery(`SELECT tenant_id[\s\S]*FROM schools[\s\S]*WHERE id = \$1`).
		WithArgs(int64(3)).
		WillReturnRows(sqlmock.NewRows([]string{"tenant_id"}).AddRow(int64(99)))
	mock.ExpectQuery(`INSERT INTO exams \(`).
		WithArgs(
			"SC-003",
			"Ujian Tenant Sekolah",
			int64(8),
			75.0,
			90,
			1,
			nil,
			nil,
			"after_submit",
			false,
			false,
			false,
			int64(21),
			"same_school",
			int64(3),
			int64(99),
		).
		WillReturnRows(sqlmock.NewRows([]string{"id"}).AddRow(int64(93)))
	mock.ExpectQuery(`SELECT EXISTS \(`).
		WithArgs("exams", "management_scope").
		WillReturnRows(sqlmock.NewRows([]string{"exists"}).AddRow(true))
	mock.ExpectQuery(`SELECT EXISTS \(`).
		WithArgs("exams", "owner_school_id").
		WillReturnRows(sqlmock.NewRows([]string{"exists"}).AddRow(true))
	mock.ExpectQuery(`SELECT[\s\S]*FROM exams e[\s\S]*WHERE e\.id = \$1`).
		WithArgs(int64(93)).
		WillReturnRows(sqlmock.NewRows([]string{
			"id", "code", "title", "management_scope", "owner_school_id", "subject_id", "subject_name", "education_level", "subject_type",
			"kktp", "duration_minutes", "max_attempts", "start_at", "end_at", "review_policy",
			"randomize_questions", "randomize_options", "allow_non_regular_self_enroll", "is_active",
			"created_by", "created_at", "question_count", "assigned_count",
		}).AddRow(
			93, "SC-003", "Ujian Tenant Sekolah", "same_school", int64(3), 8, "Matematika", "SMA", "Wajib",
			75.0, 90, 1, nil, nil, "after_submit",
			false, false, false, true,
			21, createdAt, 0, 0,
		))

	out, err := svc.CreateExam(ctx, CreateExamInput{
		Code:      "sc-003",
		Title:     "Ujian Tenant Sekolah",
		SubjectID: 8,
		KKTP:      75,
		CreatedBy: 21,
	})
	if err != nil {
		t.Fatalf("CreateExam: %v", err)
	}
	if out == nil {
		t.Fatal("expected exam, got nil")
	}
	if out.OwnerSchoolID == nil || *out.OwnerSchoolID != 3 {
		t.Fatalf("expected owner_school_id 3, got %+v", out.OwnerSchoolID)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("unmet sql expectations: %v", err)
	}
}

func TestUpdateExamSameSchoolReplacesOwnerSchoolWithTeacherPrimarySchool(t *testing.T) {
	t.Parallel()

	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("sqlmock.New: %v", err)
	}
	defer db.Close()

	svc := NewService(db, 90)
	ctx := auth.ContextWithUser(context.Background(), &auth.User{ID: 21, Role: "guru"})
	createdAt := time.Now()

	mock.ExpectQuery(`SELECT management_scope, owner_school_id[\s\S]*FROM exams`).
		WithArgs(int64(91)).
		WillReturnRows(sqlmock.NewRows([]string{"management_scope", "owner_school_id"}).AddRow("cross_school", int64(9)))
	mock.ExpectQuery(`SELECT teacher_access_profile[\s\S]*FROM users`).
		WithArgs(int64(21)).
		WillReturnRows(sqlmock.NewRows([]string{"teacher_access_profile"}).AddRow("school"))
	mock.ExpectQuery(`SELECT EXISTS\(`).
		WithArgs(int64(21), int64(3)).
		WillReturnRows(sqlmock.NewRows([]string{"exists"}).AddRow(false))
	mock.ExpectQuery(`SELECT school_id[\s\S]*FROM enrollments`).
		WithArgs(int64(21)).
		WillReturnRows(sqlmock.NewRows([]string{"school_id"}).AddRow(int64(3)))
	mock.ExpectQuery(`SELECT EXISTS \(`).
		WithArgs("exams", "management_scope").
		WillReturnRows(sqlmock.NewRows([]string{"exists"}).AddRow(true))
	mock.ExpectQuery(`SELECT EXISTS \(`).
		WithArgs("exams", "owner_school_id").
		WillReturnRows(sqlmock.NewRows([]string{"exists"}).AddRow(true))
	mock.ExpectQuery(`UPDATE exams\s+SET`).
		WithArgs(
			int64(91),
			"SC-091",
			"Exam Updated",
			int64(8),
			75.0,
			90,
			1,
			nil,
			nil,
			"after_submit",
			false,
			false,
			false,
			true,
			"same_school",
			int64(3),
		).
		WillReturnRows(sqlmock.NewRows([]string{"id"}).AddRow(int64(91)))
	mock.ExpectQuery(`SELECT EXISTS \(`).
		WithArgs("exams", "management_scope").
		WillReturnRows(sqlmock.NewRows([]string{"exists"}).AddRow(true))
	mock.ExpectQuery(`SELECT EXISTS \(`).
		WithArgs("exams", "owner_school_id").
		WillReturnRows(sqlmock.NewRows([]string{"exists"}).AddRow(true))
	mock.ExpectQuery(`SELECT[\s\S]*FROM exams e[\s\S]*WHERE e\.id = \$1`).
		WithArgs(int64(91)).
		WillReturnRows(sqlmock.NewRows([]string{
			"id", "code", "title", "management_scope", "owner_school_id", "subject_id", "subject_name", "education_level", "subject_type",
			"kktp", "duration_minutes", "max_attempts", "start_at", "end_at", "review_policy",
			"randomize_questions", "randomize_options", "allow_non_regular_self_enroll", "is_active",
			"created_by", "created_at", "question_count", "assigned_count",
		}).AddRow(
			91, "SC-091", "Exam Updated", "same_school", int64(3), 8, "Matematika", "SMA", "Wajib",
			75.0, 90, 1, nil, nil, "after_submit",
			false, false, false, true,
			21, createdAt, 0, 0,
		))

	out, err := svc.UpdateExam(ctx, UpdateExamInput{
		ID:              91,
		Code:            "sc-091",
		Title:           "Exam Updated",
		SubjectID:       8,
		KKTP:            75,
		ManagementScope: "same_school",
		IsActive:        true,
	})
	if err != nil {
		t.Fatalf("UpdateExam: %v", err)
	}
	if out == nil {
		t.Fatal("expected updated exam, got nil")
	}
	if out.ManagementScope != "same_school" {
		t.Fatalf("expected management_scope same_school, got %q", out.ManagementScope)
	}
	if out.OwnerSchoolID == nil || *out.OwnerSchoolID != 3 {
		t.Fatalf("expected owner_school_id 3, got %+v", out.OwnerSchoolID)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("unmet sql expectations: %v", err)
	}
}

func TestCanAutoAssignNonRegularStudentAllowsCrossSchoolExam(t *testing.T) {
	t.Parallel()

	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("sqlmock.New: %v", err)
	}
	defer db.Close()

	svc := NewService(db, 90)

	mock.ExpectQuery(`SELECT role, COALESCE\(is_non_regular, FALSE\)`).
		WithArgs(int64(31)).
		WillReturnRows(sqlmock.NewRows([]string{"role", "is_non_regular"}).AddRow("siswa", true))
	mock.ExpectQuery(`SELECT management_scope, owner_school_id[\s\S]*FROM exams`).
		WithArgs(int64(91)).
		WillReturnRows(sqlmock.NewRows([]string{"management_scope", "owner_school_id"}).AddRow("cross_school", nil))
	mock.ExpectQuery(`SELECT COALESCE\(allow_non_regular_self_enroll, FALSE\)`).
		WithArgs(int64(91)).
		WillReturnRows(sqlmock.NewRows([]string{"allow_non_regular_self_enroll"}).AddRow(true))

	allowed, err := svc.canAutoAssignNonRegularStudent(context.Background(), 91, 31)
	if err != nil {
		t.Fatalf("canAutoAssignNonRegularStudent: %v", err)
	}
	if !allowed {
		t.Fatal("expected non-regular cross-school student to be auto-assignable")
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("unmet sql expectations: %v", err)
	}
}

func TestUpdateExamRejectsCrossSchoolForSchoolTeacher(t *testing.T) {
	t.Parallel()

	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("sqlmock.New: %v", err)
	}
	defer db.Close()

	svc := NewService(db, 90)
	ctx := auth.ContextWithUser(context.Background(), &auth.User{ID: 21, Role: "guru"})

	mock.ExpectQuery(`SELECT management_scope, owner_school_id[\s\S]*FROM exams`).
		WithArgs(int64(91)).
		WillReturnRows(sqlmock.NewRows([]string{"management_scope", "owner_school_id"}).AddRow("same_school", int64(3)))
	mock.ExpectQuery(`SELECT teacher_access_profile[\s\S]*FROM users`).
		WithArgs(int64(21)).
		WillReturnRows(sqlmock.NewRows([]string{"teacher_access_profile"}).AddRow("school"))

	_, err = svc.UpdateExam(ctx, UpdateExamInput{
		ID:              91,
		Code:            "SC-091",
		Title:           "Exam Updated",
		SubjectID:       8,
		KKTP:            75,
		ManagementScope: "cross_school",
		IsActive:        true,
	})
	if !errors.Is(err, ErrExamForbidden) {
		t.Fatalf("expected ErrExamForbidden, got %v", err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("unmet sql expectations: %v", err)
	}
}

func TestTeacherCanManageSchoolUsesManagedScope(t *testing.T) {
	t.Parallel()

	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("sqlmock.New: %v", err)
	}
	defer db.Close()

	svc := NewService(db, 90)

	mock.ExpectQuery(`SELECT EXISTS\(`).
		WithArgs(int64(21), int64(3)).
		WillReturnRows(sqlmock.NewRows([]string{"exists"}).AddRow(true))

	allowed, err := svc.teacherCanManageSchool(context.Background(), 21, 3)
	if err != nil {
		t.Fatalf("teacherCanManageSchool: %v", err)
	}
	if !allowed {
		t.Fatal("expected teacher to be allowed for managed school scope")
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("unmet sql expectations: %v", err)
	}
}

func TestReplaceExamAssignmentsByClassRejectsSchoolOutsideSameSchoolScope(t *testing.T) {
	t.Parallel()

	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("sqlmock.New: %v", err)
	}
	defer db.Close()

	svc := NewService(db, 90)
	ctx := auth.ContextWithUser(context.Background(), &auth.User{ID: 21, Role: "guru"})
	createdAt := time.Now()

	mock.ExpectQuery(`SELECT EXISTS \(`).
		WithArgs("exams", "management_scope").
		WillReturnRows(sqlmock.NewRows([]string{"exists"}).AddRow(true))
	mock.ExpectQuery(`SELECT EXISTS \(`).
		WithArgs("exams", "owner_school_id").
		WillReturnRows(sqlmock.NewRows([]string{"exists"}).AddRow(true))
	mock.ExpectQuery(`SELECT[\s\S]*FROM exams e[\s\S]*WHERE e\.id = \$1`).
		WithArgs(int64(91)).
		WillReturnRows(sqlmock.NewRows([]string{
			"id", "code", "title", "management_scope", "owner_school_id", "subject_id", "subject_name", "education_level", "subject_type",
			"kktp", "duration_minutes", "max_attempts", "start_at", "end_at", "review_policy",
			"randomize_questions", "randomize_options", "allow_non_regular_self_enroll", "is_active",
			"created_by", "created_at", "question_count", "assigned_count",
		}).AddRow(
			91, "MAT-01", "Try Out Matematika", "same_school", int64(3), 8, "Matematika", "SMA", "Wajib",
			75.0, 90, 1, nil, nil, "after_submit",
			false, false, false, true,
			21, createdAt, 10, 2,
		))
	mock.ExpectQuery(`SELECT management_scope, owner_school_id[\s\S]*FROM exams`).
		WithArgs(int64(91)).
		WillReturnRows(sqlmock.NewRows([]string{"management_scope", "owner_school_id"}).AddRow("same_school", int64(3)))
	mock.ExpectQuery(`SELECT[\s\S]*FROM exams e[\s\S]*JOIN users u ON u\.id = e\.created_by[\s\S]*WHERE e\.id = \$1`).
		WithArgs(int64(91)).
		WillReturnRows(sqlmock.NewRows([]string{"role", "teacher_access_profile"}).AddRow("guru", "school"))
	mock.ExpectQuery(`SELECT teacher_access_profile[\s\S]*FROM users`).
		WithArgs(int64(21)).
		WillReturnRows(sqlmock.NewRows([]string{"teacher_access_profile"}).AddRow("school"))

	_, err = svc.ReplaceExamAssignmentsByClass(ctx, ReplaceExamAssignmentsByClassInput{
		ExamID:     91,
		SchoolID:   4,
		ClassID:    11,
		AssignedBy: 21,
	})
	if !errors.Is(err, ErrExamForbidden) {
		t.Fatalf("expected ErrExamForbidden, got %v", err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("unmet sql expectations: %v", err)
	}
}

func TestReplaceExamAssignmentsRejectsStudentOutsideSameSchoolScopeForSchoolTeacher(t *testing.T) {
	t.Parallel()

	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("sqlmock.New: %v", err)
	}
	defer db.Close()

	svc := NewService(db, 90)
	ctx := auth.ContextWithUser(context.Background(), &auth.User{ID: 21, Role: "guru"})
	createdAt := time.Now()

	mock.ExpectQuery(`SELECT EXISTS \(`).
		WithArgs("exams", "management_scope").
		WillReturnRows(sqlmock.NewRows([]string{"exists"}).AddRow(true))
	mock.ExpectQuery(`SELECT EXISTS \(`).
		WithArgs("exams", "owner_school_id").
		WillReturnRows(sqlmock.NewRows([]string{"exists"}).AddRow(true))
	mock.ExpectQuery(`SELECT[\s\S]*FROM exams e[\s\S]*WHERE e\.id = \$1`).
		WithArgs(int64(91)).
		WillReturnRows(sqlmock.NewRows([]string{
			"id", "code", "title", "management_scope", "owner_school_id", "subject_id", "subject_name", "education_level", "subject_type",
			"kktp", "duration_minutes", "max_attempts", "start_at", "end_at", "review_policy",
			"randomize_questions", "randomize_options", "allow_non_regular_self_enroll", "is_active",
			"created_by", "created_at", "question_count", "assigned_count",
		}).AddRow(
			91, "MAT-01", "Try Out Matematika", "same_school", int64(3), 8, "Matematika", "SMA", "Wajib",
			75.0, 90, 1, nil, nil, "after_submit",
			false, false, false, true,
			21, createdAt, 10, 0,
		))
	mock.ExpectQuery(`SELECT management_scope, owner_school_id[\s\S]*FROM exams`).
		WithArgs(int64(91)).
		WillReturnRows(sqlmock.NewRows([]string{"management_scope", "owner_school_id"}).AddRow("same_school", int64(3)))
	mock.ExpectQuery(`SELECT[\s\S]*FROM exams e[\s\S]*JOIN users u ON u\.id = e\.created_by[\s\S]*WHERE e\.id = \$1`).
		WithArgs(int64(91)).
		WillReturnRows(sqlmock.NewRows([]string{"role", "teacher_access_profile"}).AddRow("guru", "school"))
	mock.ExpectQuery(`SELECT teacher_access_profile[\s\S]*FROM users`).
		WithArgs(int64(21)).
		WillReturnRows(sqlmock.NewRows([]string{"teacher_access_profile"}).AddRow("school"))
	mock.ExpectQuery(`SELECT EXISTS\(`).
		WithArgs(int64(21), int64(3)).
		WillReturnRows(sqlmock.NewRows([]string{"exists"}).AddRow(false))
	mock.ExpectQuery(`SELECT school_id[\s\S]*FROM enrollments`).
		WithArgs(int64(21)).
		WillReturnRows(sqlmock.NewRows([]string{"school_id"}).AddRow(int64(3)))
	mock.ExpectQuery(`SELECT EXISTS \(`).
		WithArgs("exam_assignments", "tenant_id").
		WillReturnRows(sqlmock.NewRows([]string{"exists"}).AddRow(false))
	mock.ExpectQuery(`SELECT EXISTS\([\s\S]*FROM enrollments[\s\S]*WHERE user_id = \$1[\s\S]*school_id = \$2`).
		WithArgs(int64(55), int64(3)).
		WillReturnRows(sqlmock.NewRows([]string{"exists"}).AddRow(false))
	mock.ExpectQuery(`SELECT[\s\S]*FROM schools[\s\S]*WHERE id = \$1`).
		WithArgs(int64(3)).
		WillReturnRows(sqlmock.NewRows([]string{"code", "name"}).AddRow("12345678", "SMA Owner"))
	mock.ExpectQuery(`SELECT[\s\S]*FROM enrollments e[\s\S]*JOIN schools s ON s\.id = e\.school_id[\s\S]*WHERE e\.user_id = \$1`).
		WithArgs(int64(55)).
		WillReturnRows(sqlmock.NewRows([]string{"code", "name"}).AddRow("87654321", "SMA Peserta"))

	_, err = svc.ReplaceExamAssignments(ctx, ReplaceExamAssignmentsInput{
		ExamID:     91,
		UserIDs:    []int64{55},
		AssignedBy: 21,
	})
	if !errors.Is(err, ErrExamForbidden) {
		t.Fatalf("expected ErrExamForbidden, got %v", err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("unmet sql expectations: %v", err)
	}
}

func TestAppendExamAssignmentsByClassRejectsCrossSchoolForSchoolTeacher(t *testing.T) {
	t.Parallel()

	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("sqlmock.New: %v", err)
	}
	defer db.Close()

	svc := NewService(db, 90)
	ctx := auth.ContextWithUser(context.Background(), &auth.User{ID: 21, Role: "guru"})
	createdAt := time.Now()

	mock.ExpectQuery(`SELECT EXISTS \(`).
		WithArgs("exams", "management_scope").
		WillReturnRows(sqlmock.NewRows([]string{"exists"}).AddRow(true))
	mock.ExpectQuery(`SELECT EXISTS \(`).
		WithArgs("exams", "owner_school_id").
		WillReturnRows(sqlmock.NewRows([]string{"exists"}).AddRow(true))
	mock.ExpectQuery(`SELECT[\s\S]*FROM exams e[\s\S]*WHERE e\.id = \$1`).
		WithArgs(int64(92)).
		WillReturnRows(sqlmock.NewRows([]string{
			"id", "code", "title", "management_scope", "owner_school_id", "subject_id", "subject_name", "education_level", "subject_type",
			"kktp", "duration_minutes", "max_attempts", "start_at", "end_at", "review_policy",
			"randomize_questions", "randomize_options", "allow_non_regular_self_enroll", "is_active",
			"created_by", "created_at", "question_count", "assigned_count",
		}).AddRow(
			92, "MAT-02", "Try Out Campuran", "cross_school", int64(3), 8, "Matematika", "SMA", "Wajib",
			75.0, 90, 1, nil, nil, "after_submit",
			false, false, false, true,
			21, createdAt, 10, 2,
		))
	mock.ExpectQuery(`SELECT management_scope, owner_school_id[\s\S]*FROM exams`).
		WithArgs(int64(92)).
		WillReturnRows(sqlmock.NewRows([]string{"management_scope", "owner_school_id"}).AddRow("cross_school", int64(3)))
	mock.ExpectQuery(`SELECT[\s\S]*FROM exams e[\s\S]*JOIN users u ON u\.id = e\.created_by[\s\S]*WHERE e\.id = \$1`).
		WithArgs(int64(92)).
		WillReturnRows(sqlmock.NewRows([]string{"role", "teacher_access_profile"}).AddRow("admin", ""))
	mock.ExpectQuery(`SELECT teacher_access_profile[\s\S]*FROM users`).
		WithArgs(int64(21)).
		WillReturnRows(sqlmock.NewRows([]string{"teacher_access_profile"}).AddRow("school"))

	_, err = svc.AppendExamAssignmentsByClass(ctx, AppendExamAssignmentsByClassInput{
		ExamID:     92,
		SchoolID:   4,
		ClassID:    11,
		AssignedBy: 21,
	})
	if !errors.Is(err, ErrExamForbidden) {
		t.Fatalf("expected ErrExamForbidden, got %v", err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("unmet sql expectations: %v", err)
	}
}

func TestReplaceExamAssignmentsRejectsCrossSchoolExamForSchoolTeacher(t *testing.T) {
	t.Parallel()

	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("sqlmock.New: %v", err)
	}
	defer db.Close()

	svc := NewService(db, 90)
	ctx := auth.ContextWithUser(context.Background(), &auth.User{ID: 21, Role: "guru"})
	createdAt := time.Now()

	mock.ExpectQuery(`SELECT EXISTS \(`).
		WithArgs("exams", "management_scope").
		WillReturnRows(sqlmock.NewRows([]string{"exists"}).AddRow(true))
	mock.ExpectQuery(`SELECT EXISTS \(`).
		WithArgs("exams", "owner_school_id").
		WillReturnRows(sqlmock.NewRows([]string{"exists"}).AddRow(true))
	mock.ExpectQuery(`SELECT[\s\S]*FROM exams e[\s\S]*WHERE e\.id = \$1`).
		WithArgs(int64(92)).
		WillReturnRows(sqlmock.NewRows([]string{
			"id", "code", "title", "management_scope", "owner_school_id", "subject_id", "subject_name", "education_level", "subject_type",
			"kktp", "duration_minutes", "max_attempts", "start_at", "end_at", "review_policy",
			"randomize_questions", "randomize_options", "allow_non_regular_self_enroll", "is_active",
			"created_by", "created_at", "question_count", "assigned_count",
		}).AddRow(
			92, "MAT-02", "Try Out Campuran", "cross_school", int64(3), 8, "Matematika", "SMA", "Wajib",
			75.0, 90, 1, nil, nil, "after_submit",
			false, false, false, true,
			21, createdAt, 10, 0,
		))
	mock.ExpectQuery(`SELECT management_scope, owner_school_id[\s\S]*FROM exams`).
		WithArgs(int64(92)).
		WillReturnRows(sqlmock.NewRows([]string{"management_scope", "owner_school_id"}).AddRow("cross_school", int64(3)))
	mock.ExpectQuery(`SELECT[\s\S]*FROM exams e[\s\S]*JOIN users u ON u\.id = e\.created_by[\s\S]*WHERE e\.id = \$1`).
		WithArgs(int64(92)).
		WillReturnRows(sqlmock.NewRows([]string{"role", "teacher_access_profile"}).AddRow("admin", ""))
	mock.ExpectQuery(`SELECT teacher_access_profile[\s\S]*FROM users`).
		WithArgs(int64(21)).
		WillReturnRows(sqlmock.NewRows([]string{"teacher_access_profile"}).AddRow("school"))

	_, err = svc.ReplaceExamAssignments(ctx, ReplaceExamAssignmentsInput{
		ExamID:     92,
		UserIDs:    []int64{55},
		AssignedBy: 21,
	})
	if !errors.Is(err, ErrExamForbidden) {
		t.Fatalf("expected ErrExamForbidden, got %v", err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("unmet sql expectations: %v", err)
	}
}

func TestEnsureStudentWithinExamScopeRejectsStudentOutsideOwnerSchool(t *testing.T) {
	t.Parallel()

	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("sqlmock.New: %v", err)
	}
	defer db.Close()

	svc := NewService(db, 90)
	mock.ExpectQuery(`SELECT management_scope, owner_school_id[\s\S]*FROM exams`).
		WithArgs(int64(91)).
		WillReturnRows(sqlmock.NewRows([]string{"management_scope", "owner_school_id"}).AddRow("same_school", int64(3)))
	mock.ExpectQuery(`SELECT[\s\S]*FROM exams e[\s\S]*JOIN users u ON u\.id = e\.created_by[\s\S]*WHERE e\.id = \$1`).
		WithArgs(int64(91)).
		WillReturnRows(sqlmock.NewRows([]string{"role", "teacher_access_profile"}).AddRow("guru", "school"))
	mock.ExpectQuery(`SELECT EXISTS\([\s\S]*FROM enrollments[\s\S]*WHERE user_id = \$1[\s\S]*school_id = \$2`).
		WithArgs(int64(55), int64(3)).
		WillReturnRows(sqlmock.NewRows([]string{"exists"}).AddRow(false))
	mock.ExpectQuery(`SELECT[\s\S]*FROM schools[\s\S]*WHERE id = \$1`).
		WithArgs(int64(3)).
		WillReturnRows(sqlmock.NewRows([]string{"code", "name"}).AddRow("12345678", "SMA Owner"))
	mock.ExpectQuery(`SELECT[\s\S]*FROM enrollments e[\s\S]*JOIN schools s ON s\.id = e\.school_id[\s\S]*WHERE e\.user_id = \$1`).
		WithArgs(int64(55)).
		WillReturnRows(sqlmock.NewRows([]string{"code", "name"}).AddRow("87654321", "SMA Peserta"))

	err = svc.ensureStudentWithinExamScope(context.Background(), 91, 55)
	if !errors.Is(err, ErrAttemptForbidden) {
		t.Fatalf("expected ErrAttemptForbidden, got %v", err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("unmet sql expectations: %v", err)
	}
}

func TestEnsureStudentWithinExamScopeAllowsCrossSchoolExam(t *testing.T) {
	t.Parallel()

	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("sqlmock.New: %v", err)
	}
	defer db.Close()

	svc := NewService(db, 90)
	mock.ExpectQuery(`SELECT management_scope, owner_school_id[\s\S]*FROM exams`).
		WithArgs(int64(92)).
		WillReturnRows(sqlmock.NewRows([]string{"management_scope", "owner_school_id"}).AddRow("cross_school", int64(3)))
	mock.ExpectQuery(`SELECT[\s\S]*FROM exams e[\s\S]*JOIN users u ON u\.id = e\.created_by[\s\S]*WHERE e\.id = \$1`).
		WithArgs(int64(92)).
		WillReturnRows(sqlmock.NewRows([]string{"role", "teacher_access_profile"}).AddRow("admin", ""))

	if err := svc.ensureStudentWithinExamScope(context.Background(), 92, 55); err != nil {
		t.Fatalf("ensureStudentWithinExamScope: %v", err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("unmet sql expectations: %v", err)
	}
}

func TestEnsureStudentWithinExamScopeAllowsStudentWithMatchingSchoolCode(t *testing.T) {
	t.Parallel()

	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("sqlmock.New: %v", err)
	}
	defer db.Close()

	svc := NewService(db, 90)
	mock.ExpectQuery(`SELECT management_scope, owner_school_id[\s\S]*FROM exams`).
		WithArgs(int64(93)).
		WillReturnRows(sqlmock.NewRows([]string{"management_scope", "owner_school_id"}).AddRow("same_school", int64(3)))
	mock.ExpectQuery(`SELECT[\s\S]*FROM exams e[\s\S]*JOIN users u ON u\.id = e\.created_by[\s\S]*WHERE e\.id = \$1`).
		WithArgs(int64(93)).
		WillReturnRows(sqlmock.NewRows([]string{"role", "teacher_access_profile"}).AddRow("guru", "school"))
	mock.ExpectQuery(`SELECT EXISTS\([\s\S]*FROM enrollments[\s\S]*WHERE user_id = \$1[\s\S]*school_id = \$2`).
		WithArgs(int64(55), int64(3)).
		WillReturnRows(sqlmock.NewRows([]string{"exists"}).AddRow(false))
	mock.ExpectQuery(`SELECT[\s\S]*FROM schools[\s\S]*WHERE id = \$1`).
		WithArgs(int64(3)).
		WillReturnRows(sqlmock.NewRows([]string{"code", "name"}).AddRow("12345678", "SMA Contoh"))
	mock.ExpectQuery(`SELECT[\s\S]*FROM enrollments e[\s\S]*JOIN schools s ON s\.id = e\.school_id[\s\S]*WHERE e\.user_id = \$1`).
		WithArgs(int64(55)).
		WillReturnRows(sqlmock.NewRows([]string{"code", "name"}).AddRow("12345678", "SMA Lain"))

	if err := svc.ensureStudentWithinExamScope(context.Background(), 93, 55); err != nil {
		t.Fatalf("ensureStudentWithinExamScope: %v", err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("unmet sql expectations: %v", err)
	}
}

func TestEnsureStudentWithinExamScopeAllowsStudentWithMatchingSchoolName(t *testing.T) {
	t.Parallel()

	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("sqlmock.New: %v", err)
	}
	defer db.Close()

	svc := NewService(db, 90)
	mock.ExpectQuery(`SELECT management_scope, owner_school_id[\s\S]*FROM exams`).
		WithArgs(int64(94)).
		WillReturnRows(sqlmock.NewRows([]string{"management_scope", "owner_school_id"}).AddRow("same_school", int64(3)))
	mock.ExpectQuery(`SELECT[\s\S]*FROM exams e[\s\S]*JOIN users u ON u\.id = e\.created_by[\s\S]*WHERE e\.id = \$1`).
		WithArgs(int64(94)).
		WillReturnRows(sqlmock.NewRows([]string{"role", "teacher_access_profile"}).AddRow("guru", "school"))
	mock.ExpectQuery(`SELECT EXISTS\([\s\S]*FROM enrollments[\s\S]*WHERE user_id = \$1[\s\S]*school_id = \$2`).
		WithArgs(int64(56), int64(3)).
		WillReturnRows(sqlmock.NewRows([]string{"exists"}).AddRow(false))
	mock.ExpectQuery(`SELECT[\s\S]*FROM schools[\s\S]*WHERE id = \$1`).
		WithArgs(int64(3)).
		WillReturnRows(sqlmock.NewRows([]string{"code", "name"}).AddRow("", "SMA Nusantara"))
	mock.ExpectQuery(`SELECT[\s\S]*FROM enrollments e[\s\S]*JOIN schools s ON s\.id = e\.school_id[\s\S]*WHERE e\.user_id = \$1`).
		WithArgs(int64(56)).
		WillReturnRows(sqlmock.NewRows([]string{"code", "name"}).AddRow("", "  sma nusantara  "))

	if err := svc.ensureStudentWithinExamScope(context.Background(), 94, 56); err != nil {
		t.Fatalf("ensureStudentWithinExamScope: %v", err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("unmet sql expectations: %v", err)
	}
}

func TestSelfEnrollExamRejectsStudentOutsideTeacherSchoolScope(t *testing.T) {
	t.Parallel()

	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("sqlmock.New: %v", err)
	}
	defer db.Close()

	svc := NewService(db, 90)

	mock.ExpectQuery(`SELECT role, COALESCE\(is_non_regular, FALSE\)`).
		WithArgs(int64(55)).
		WillReturnRows(sqlmock.NewRows([]string{"role", "is_non_regular"}).AddRow("siswa", false))
	mock.ExpectQuery(`SELECT[\s\S]*FROM exams e[\s\S]*WHERE id = \$1 AND is_active = TRUE`).
		WithArgs(int64(91), int64(55)).
		WillReturnRows(sqlmock.NewRows([]string{"start_at", "end_at", "allow_non_regular_self_enroll", "has_assignment"}).AddRow(nil, nil, false, false))
	mock.ExpectQuery(`SELECT management_scope, owner_school_id[\s\S]*FROM exams`).
		WithArgs(int64(91)).
		WillReturnRows(sqlmock.NewRows([]string{"management_scope", "owner_school_id"}).AddRow("cross_school", int64(3)))
	mock.ExpectQuery(`SELECT[\s\S]*FROM exams e[\s\S]*JOIN users u ON u\.id = e\.created_by[\s\S]*WHERE e\.id = \$1`).
		WithArgs(int64(91)).
		WillReturnRows(sqlmock.NewRows([]string{"role", "teacher_access_profile"}).AddRow("guru", "school"))
	mock.ExpectQuery(`SELECT EXISTS\([\s\S]*FROM enrollments[\s\S]*WHERE user_id = \$1[\s\S]*school_id = \$2`).
		WithArgs(int64(55), int64(3)).
		WillReturnRows(sqlmock.NewRows([]string{"exists"}).AddRow(false))
	mock.ExpectQuery(`SELECT[\s\S]*FROM schools[\s\S]*WHERE id = \$1`).
		WithArgs(int64(3)).
		WillReturnRows(sqlmock.NewRows([]string{"code", "name"}).AddRow("12345678", "SMA Owner"))
	mock.ExpectQuery(`SELECT[\s\S]*FROM enrollments e[\s\S]*JOIN schools s ON s\.id = e\.school_id[\s\S]*WHERE e\.user_id = \$1`).
		WithArgs(int64(55)).
		WillReturnRows(sqlmock.NewRows([]string{"code", "name"}).AddRow("87654321", "SMA Peserta"))

	err = svc.SelfEnrollExam(context.Background(), 91, 55)
	if !errors.Is(err, ErrAttemptForbidden) {
		t.Fatalf("expected ErrAttemptForbidden, got %v", err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("unmet sql expectations: %v", err)
	}
}

func TestCanAccessAttemptGuruForbiddenWhenExamNotOwned(t *testing.T) {
	t.Parallel()

	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("sqlmock.New: %v", err)
	}
	defer db.Close()

	svc := NewService(db, 90)
	mock.ExpectQuery(`SELECT[\s\S]*FROM attempts[\s\S]*WHERE id = \$1`).
		WithArgs(int64(41)).
		WillReturnRows(sqlmock.NewRows([]string{
			"id", "exam_id", "student_id", "status", "started_at", "expires_at", "submitted_at", "score", "total_correct", "total_wrong", "total_unanswered",
		}).AddRow(41, 91, 7, "submitted", time.Now(), time.Now(), nil, 80, 8, 2, 0))
	mock.ExpectQuery(`SELECT created_by[\s\S]*FROM exams[\s\S]*WHERE id = \$1`).
		WithArgs(int64(91)).
		WillReturnRows(sqlmock.NewRows([]string{"created_by"}).AddRow(int64(99)))

	err = svc.CanAccessAttempt(context.Background(), 41, 55, "guru")
	if !errors.Is(err, ErrAttemptForbidden) {
		t.Fatalf("expected ErrAttemptForbidden, got %v", err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("unmet sql expectations: %v", err)
	}
}

func TestCanAccessAttemptProktorForbiddenWhenOutsideScope(t *testing.T) {
	t.Parallel()

	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("sqlmock.New: %v", err)
	}
	defer db.Close()

	svc := NewService(db, 90)
	ctx := auth.ContextWithUser(context.Background(), &auth.User{ID: 17, Role: "proktor"})
	mock.ExpectQuery(`SELECT[\s\S]*FROM attempts[\s\S]*WHERE id = \$1`).
		WithArgs(int64(51)).
		WillReturnRows(sqlmock.NewRows([]string{
			"id", "exam_id", "student_id", "status", "started_at", "expires_at", "submitted_at", "score", "total_correct", "total_wrong", "total_unanswered",
		}).AddRow(51, 91, 7, "submitted", time.Now(), time.Now(), nil, 80, 8, 2, 0))
	mock.ExpectQuery(`SELECT EXISTS\([\s\S]*FROM attempts a[\s\S]*user_school_scopes uss[\s\S]*a\.id = \$2[\s\S]*uss\.user_id = \$1[\s\S]*\)`).
		WithArgs(int64(17), int64(51)).
		WillReturnRows(sqlmock.NewRows([]string{"exists"}).AddRow(false))

	err = svc.CanAccessAttempt(ctx, 51, 17, "proktor")
	if !errors.Is(err, ErrAttemptForbidden) {
		t.Fatalf("expected ErrAttemptForbidden, got %v", err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("unmet sql expectations: %v", err)
	}
}

func TestCanAccessAttemptSiswaOwnAttemptAllowed(t *testing.T) {
	t.Parallel()

	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("sqlmock.New: %v", err)
	}
	defer db.Close()

	svc := NewService(db, 90)
	mock.ExpectQuery(`SELECT[\s\S]*FROM attempts[\s\S]*WHERE id = \$1`).
		WithArgs(int64(61)).
		WillReturnRows(sqlmock.NewRows([]string{
			"id", "exam_id", "student_id", "status", "started_at", "expires_at", "submitted_at", "score", "total_correct", "total_wrong", "total_unanswered",
		}).AddRow(61, 91, 77, "submitted", time.Now(), time.Now(), nil, 80, 8, 2, 0))

	if err := svc.CanAccessAttempt(context.Background(), 61, 77, "siswa"); err != nil {
		t.Fatalf("CanAccessAttempt: %v", err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("unmet sql expectations: %v", err)
	}
}

func TestPreviewExamByTokenForStaffGuruForbiddenWhenExamNotOwned(t *testing.T) {
	t.Parallel()

	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("sqlmock.New: %v", err)
	}
	defer db.Close()

	svc := NewService(db, 90)
	ctx := auth.ContextWithUser(context.Background(), &auth.User{ID: 21, Role: "guru"})

	expiresAt := time.Now().Add(30 * time.Minute)

	mock.ExpectQuery(`SELECT[\s\S]*FROM exams e[\s\S]*WHERE e\.is_active = TRUE[\s\S]*exam_token_hash = \$1`).
		WithArgs(hashExamToken("ABC123"), sqlmock.AnyArg()).
		WillReturnRows(sqlmock.NewRows([]string{
			"id", "code", "title", "subject_name", "duration_minutes", "max_attempts", "exam_token_expires_at", "exam_token_generated_at", "start_at", "end_at",
		}).AddRow(int64(91), "EX-91", "Exam Token", "Matematika", 60, 1, expiresAt, nil, nil, nil))
	mock.ExpectQuery(`SELECT created_by[\s\S]*FROM exams[\s\S]*WHERE id = \$1`).
		WithArgs(int64(91)).
		WillReturnRows(sqlmock.NewRows([]string{"created_by"}).AddRow(int64(99)))

	_, err = svc.PreviewExamByTokenForStaff(ctx, "ABC123")
	if !errors.Is(err, ErrExamForbidden) {
		t.Fatalf("expected ErrExamForbidden, got %v", err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("unmet sql expectations: %v", err)
	}
}

func TestPreviewExamByTokenForStaffGuruOwnedAllowed(t *testing.T) {
	t.Parallel()

	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("sqlmock.New: %v", err)
	}
	defer db.Close()

	svc := NewService(db, 90)
	ctx := auth.ContextWithUser(context.Background(), &auth.User{ID: 21, Role: "guru"})

	now := time.Now()
	expiresAt := now.Add(30 * time.Minute)
	startAt := now.Add(-10 * time.Minute)
	endAt := now.Add(50 * time.Minute)

	mock.ExpectQuery(`SELECT[\s\S]*FROM exams e[\s\S]*WHERE e\.is_active = TRUE[\s\S]*exam_token_hash = \$1`).
		WithArgs(hashExamToken("ABC123"), sqlmock.AnyArg()).
		WillReturnRows(sqlmock.NewRows([]string{
			"id", "code", "title", "subject_name", "duration_minutes", "max_attempts", "exam_token_expires_at", "exam_token_generated_at", "start_at", "end_at",
		}).AddRow(int64(91), "EX-91", "Exam Token", "Matematika", 60, 2, expiresAt, nil, startAt, endAt))
	mock.ExpectQuery(`SELECT created_by[\s\S]*FROM exams[\s\S]*WHERE id = \$1`).
		WithArgs(int64(91)).
		WillReturnRows(sqlmock.NewRows([]string{"created_by"}).AddRow(int64(21)))

	out, err := svc.PreviewExamByTokenForStaff(ctx, "ABC123")
	if err != nil {
		t.Fatalf("PreviewExamByTokenForStaff: %v", err)
	}
	if out == nil || out.ExamID != 91 {
		t.Fatalf("expected preview exam id 91, got %+v", out)
	}
	if out.AttemptsRemaining != 2 {
		t.Fatalf("expected remaining attempts 2, got %d", out.AttemptsRemaining)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("unmet sql expectations: %v", err)
	}
}
