package exam

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"html"
	"math"
	"sort"
	"strconv"
	"strings"
	"time"

	"cbtlms/internal/auth"

	"github.com/lib/pq"
)

var (
	ErrInvalidInput             = errors.New("invalid input")
	ErrExamNotFound             = errors.New("exam not found")
	ErrExamForbidden            = errors.New("exam forbidden")
	ErrSubjectNotFound          = errors.New("subject not found")
	ErrSubjectForbidden         = errors.New("subject forbidden")
	ErrAttemptNotFound          = errors.New("attempt not found")
	ErrAttemptNotEditable       = errors.New("attempt is not editable")
	ErrQuestionNotInExam        = errors.New("question not in exam")
	ErrAttemptForbidden         = errors.New("attempt forbidden")
	ErrAttemptNotFinal          = errors.New("attempt not final")
	ErrResultPolicyDenied       = errors.New("result not available by review policy")
	ErrInvalidEventType         = errors.New("invalid event type")
	ErrExamTokenRequired        = errors.New("token ujian wajib diisi")
	ErrExamTokenInvalid         = errors.New("token ujian tidak valid")
	ErrExamTokenExpired         = errors.New("token ujian sudah kedaluwarsa")
	ErrExamTokenUnavailable     = errors.New("token ujian belum disiapkan proktor")
	ErrExamTokenAlreadyUsed     = errors.New("token ujian sudah digunakan, minta token baru")
	ErrExamNotAssigned          = errors.New("peserta tidak terdaftar pada ujian ini")
	ErrExamCodeExists           = errors.New("kode ujian sudah digunakan")
	ErrAttemptLimitReached      = errors.New("jumlah attempt ujian sudah mencapai batas")
	ErrAssignmentFeature        = errors.New("fitur enroll ujian belum aktif di database")
	ErrStudentDataMissing       = errors.New("data peserta belum lengkap (nomor peserta, nama, kelas, nisn, nama sekolah, npsn)")
	ErrIncidentPolicyInvalid    = errors.New("kebijakan insiden tidak valid")
	ErrQuestionCodeRuleNotFound = errors.New("exam question code rule not found")
	ErrUserNotFound             = errors.New("user not found")
	ErrExamNotStarted           = errors.New("ujian belum dimulai")
	ErrExamEnded                = errors.New("waktu ujian sudah berakhir")
	ErrReviewPolicySchema       = errors.New("review policy score_only belum didukung schema database; jalankan migrasi terbaru")
)

type Service struct {
	db                 *sql.DB
	defaultExamMinutes int
}

func currentScopedProktor(ctx context.Context) (*auth.User, bool) {
	user, ok := auth.CurrentUser(ctx)
	if !ok || user == nil || user.Role != "proktor" {
		return nil, false
	}
	return user, true
}

func proktorExamScopeClause(examExpr, creatorExpr, userExpr string, includeAssignments bool) string {
	parts := make([]string, 0, 2)
	if includeAssignments {
		parts = append(parts, fmt.Sprintf(`
			EXISTS (
				SELECT 1
				FROM exam_assignments ea
				JOIN enrollments en ON en.user_id = ea.user_id AND en.status = 'active'
				JOIN user_school_scopes uss ON uss.school_id = en.school_id
				WHERE ea.exam_id = %s
				  AND ea.status = 'active'
				  AND uss.user_id = %s
			)
		`, examExpr, userExpr))
	}
	parts = append(parts, fmt.Sprintf(`
		EXISTS (
			SELECT 1
			FROM enrollments creator_en
			JOIN user_school_scopes creator_scope ON creator_scope.school_id = creator_en.school_id
			WHERE creator_en.user_id = %s
			  AND creator_en.status = 'active'
			  AND creator_scope.user_id = %s
		)
	`, creatorExpr, userExpr))
	return "(" + strings.Join(parts, " OR ") + ")"
}

func proktorStudentScopeClause(studentExpr, userExpr string) string {
	return fmt.Sprintf(`
		EXISTS (
			SELECT 1
			FROM enrollments scoped_en
			JOIN user_school_scopes scoped_school ON scoped_school.school_id = scoped_en.school_id
			WHERE scoped_en.user_id = %s
			  AND scoped_en.status = 'active'
			  AND scoped_school.user_id = %s
		)
	`, studentExpr, userExpr)
}

func (s *Service) ensureProktorSchoolScope(ctx context.Context, schoolID int64) error {
	user, ok := currentScopedProktor(ctx)
	if !ok {
		return nil
	}
	if schoolID <= 0 {
		return ErrExamForbidden
	}
	var allowed bool
	if err := s.db.QueryRowContext(ctx, `
		SELECT EXISTS(
			SELECT 1
			FROM user_school_scopes
			WHERE user_id = $1
			  AND school_id = $2
		)
	`, user.ID, schoolID).Scan(&allowed); err != nil {
		return fmt.Errorf("check proktor school scope: %w", err)
	}
	if !allowed {
		return ErrExamForbidden
	}
	return nil
}

func (s *Service) ensureProktorStudentScope(ctx context.Context, studentID int64) error {
	user, ok := currentScopedProktor(ctx)
	if !ok {
		return nil
	}
	var allowed bool
	if err := s.db.QueryRowContext(ctx, `
		SELECT EXISTS(
			SELECT 1
			FROM enrollments e
			JOIN user_school_scopes uss ON uss.school_id = e.school_id
			WHERE e.user_id = $2
			  AND e.status = 'active'
			  AND uss.user_id = $1
		)
	`, user.ID, studentID).Scan(&allowed); err != nil {
		return fmt.Errorf("check proktor student scope: %w", err)
	}
	if !allowed {
		return ErrExamForbidden
	}
	return nil
}

func (s *Service) ensureProktorExamScope(ctx context.Context, examID int64) error {
	user, ok := currentScopedProktor(ctx)
	if !ok {
		return nil
	}
	var allowed bool
	query := fmt.Sprintf(`
		SELECT EXISTS(
			SELECT 1
			FROM exams e
			WHERE e.id = $2
			  AND %s
		)
	`, proktorExamScopeClause("e.id", "e.created_by", "$1", true))
	if err := s.db.QueryRowContext(ctx, query, user.ID, examID).Scan(&allowed); err != nil {
		if isUndefinedTableErr(err, "exam_assignments") {
			return ErrAssignmentFeature
		}
		return fmt.Errorf("check proktor exam scope: %w", err)
	}
	if !allowed {
		return ErrExamForbidden
	}
	return nil
}

func (s *Service) ensureProktorAttemptScope(ctx context.Context, attemptID int64) error {
	user, ok := currentScopedProktor(ctx)
	if !ok {
		return nil
	}
	var allowed bool
	if err := s.db.QueryRowContext(ctx, `
		SELECT EXISTS(
			SELECT 1
			FROM attempts a
			JOIN enrollments e ON e.user_id = a.student_id AND e.status = 'active'
			JOIN user_school_scopes uss ON uss.school_id = e.school_id
			WHERE a.id = $2
			  AND uss.user_id = $1
		)
	`, user.ID, attemptID).Scan(&allowed); err != nil {
		return fmt.Errorf("check proktor attempt scope: %w", err)
	}
	if !allowed {
		return ErrExamForbidden
	}
	return nil
}

type Attempt struct {
	ID        int64     `json:"id"`
	ExamID    int64     `json:"exam_id"`
	StudentID int64     `json:"student_id"`
	Status    string    `json:"status"`
	StartedAt time.Time `json:"started_at"`
	ExpiresAt time.Time `json:"expires_at"`
}

type AttemptSummary struct {
	ID              int64      `json:"id"`
	ExamID          int64      `json:"exam_id"`
	ExamCode        string     `json:"exam_code,omitempty"`
	Title           string     `json:"title"`
	SubjectName     string     `json:"subject_name,omitempty"`
	TeacherName     string     `json:"teacher_name,omitempty"`
	StudentID       int64      `json:"student_id"`
	ClassName       string     `json:"class_name,omitempty"`
	SchoolName      string     `json:"school_name,omitempty"`
	Status          string     `json:"status"`
	StartedAt       time.Time  `json:"started_at"`
	ExpiresAt       time.Time  `json:"expires_at"`
	ExamStartAt     *time.Time `json:"exam_start_at,omitempty"`
	ExamEndAt       *time.Time `json:"exam_end_at,omitempty"`
	SubmittedAt     *time.Time `json:"submitted_at,omitempty"`
	RemainingSecs   int64      `json:"remaining_secs"`
	TotalQuestions  int        `json:"total_questions"`
	TotalPages      int        `json:"total_pages"`
	TotalWeight     float64    `json:"total_weight"`
	ClassAvgScore   float64    `json:"class_average_score,omitempty"`
	Answered        int        `json:"answered"`
	Doubt           int        `json:"doubt"`
	TotalCorrect    int        `json:"total_correct"`
	TotalWrong      int        `json:"total_wrong"`
	TotalUnanswered int        `json:"total_unanswered"`
	Score           float64    `json:"score"`
}

type SaveAnswerInput struct {
	AttemptID     int64
	QuestionID    int64
	AnswerPayload json.RawMessage
	IsDoubt       bool
}

type AttemptResult struct {
	Summary   AttemptSummary      `json:"summary"`
	Items     []AttemptResultItem `json:"items"`
	ScoreOnly bool                `json:"score_only,omitempty"`
}

type StudentExamOption struct {
	ID          int64  `json:"id"`
	Code        string `json:"code"`
	Title       string `json:"title"`
	SubjectName string `json:"subject_name"`
}

type StudentAttemptSummary struct {
	AttemptID   int64      `json:"attempt_id"`
	AttemptNo   int        `json:"attempt_no"`
	Status      string     `json:"status"`
	Score       float64    `json:"score"`
	StartedAt   time.Time  `json:"started_at"`
	SubmittedAt *time.Time `json:"submitted_at,omitempty"`
}

type StudentExamAttempts struct {
	ExamID         int64                   `json:"exam_id"`
	ExamTitle      string                  `json:"exam_title"`
	TotalWeight    float64                 `json:"total_weight"`
	TotalQuestions int                     `json:"total_questions"`
	Attempts       []StudentAttemptSummary `json:"attempts"`
}

type SubjectOption struct {
	ID             int64  `json:"id"`
	EducationLevel string `json:"education_level"`
	SubjectType    string `json:"subject_type"`
	Name           string `json:"name"`
}

type CreateSubjectInput struct {
	EducationLevel string
	SubjectType    string
	Name           string
	CreatedBy      int64
}

type UpdateSubjectInput struct {
	ID             int64
	EducationLevel string
	SubjectType    string
	Name           string
	ActorID        int64
	ActorRole      string
}

type ExamOption struct {
	ID            int64      `json:"id"`
	Code          string     `json:"code"`
	Title         string     `json:"title"`
	SubjectID     int64      `json:"subject_id"`
	EndAt         *time.Time `json:"end_at,omitempty"`
	ReviewPolicy  string     `json:"review_policy"`
	TokenRequired bool       `json:"token_required"`
}

type ExamAdminRecord struct {
	ID                 int64      `json:"id"`
	Code               string     `json:"code"`
	Title              string     `json:"title"`
	SubjectID          int64      `json:"subject_id"`
	SubjectName        string     `json:"subject_name"`
	EducationLevel     string     `json:"education_level"`
	SubjectType        string     `json:"subject_type"`
	KKTP               float64    `json:"kktp"`
	DurationMinutes    int        `json:"duration_minutes"`
	MaxAttempts        int        `json:"max_attempts"`
	StartAt            *time.Time `json:"start_at,omitempty"`
	EndAt              *time.Time `json:"end_at,omitempty"`
	ReviewPolicy       string     `json:"review_policy"`
	RandomizeQuestions bool       `json:"randomize_questions"`
	RandomizeOptions   bool       `json:"randomize_options"`
	AllowNonRegular    bool       `json:"allow_non_regular_self_enroll"`
	IsActive           bool       `json:"is_active"`
	CreatedBy          *int64     `json:"created_by,omitempty"`
	CreatedAt          time.Time  `json:"created_at"`
	QuestionCount      int        `json:"question_count"`
	AssignedCount      int        `json:"assigned_count"`
}

type CreateExamInput struct {
	Code               string
	Title              string
	SubjectID          int64
	KKTP               float64
	DurationMinutes    int
	MaxAttempts        int
	StartAt            *time.Time
	EndAt              *time.Time
	ReviewPolicy       string
	RandomizeQuestions bool
	RandomizeOptions   bool
	AllowNonRegular    bool
	CreatedBy          int64
}

type UpdateExamInput struct {
	ID                 int64
	Code               string
	Title              string
	SubjectID          int64
	KKTP               float64
	DurationMinutes    int
	MaxAttempts        int
	StartAt            *time.Time
	EndAt              *time.Time
	ReviewPolicy       string
	RandomizeQuestions bool
	RandomizeOptions   bool
	AllowNonRegular    bool
	IsActive           bool
}

type ExamTokenExam struct {
	ID             int64      `json:"id"`
	Code           string     `json:"code"`
	Title          string     `json:"title"`
	SubjectID      int64      `json:"subject_id"`
	SubjectName    string     `json:"subject_name"`
	EducationLevel string     `json:"education_level"`
	SubjectType    string     `json:"subject_type"`
	EndAt          *time.Time `json:"end_at,omitempty"`
	Token          string     `json:"token,omitempty"`
	TokenExpiresAt *time.Time `json:"token_expires_at,omitempty"`
}

type ExamAccessToken struct {
	ExamID      int64     `json:"exam_id"`
	Token       string    `json:"token"`
	TTLMinutes  int       `json:"ttl_minutes"`
	GeneratedAt time.Time `json:"generated_at"`
	ExpiresAt   time.Time `json:"expires_at"`
	GeneratedBy int64     `json:"generated_by"`
}

type ExamTokenPublish struct {
	ExamID      int64     `json:"exam_id"`
	PublishedAt time.Time `json:"published_at"`
	ExpiresAt   time.Time `json:"expires_at"`
}

type ExamTokenPreview struct {
	ExamID            int64      `json:"exam_id"`
	ExamCode          string     `json:"exam_code"`
	ExamTitle         string     `json:"exam_title"`
	SubjectName       string     `json:"subject_name"`
	DurationMinutes   int        `json:"duration_minutes"`
	MaxAttempts       int        `json:"max_attempts"`
	AttemptsUsed      int        `json:"attempts_used"`
	AttemptsRemaining int        `json:"attempts_remaining"`
	TokenExpiresAt    time.Time  `json:"token_expires_at"`
	StartAt           *time.Time `json:"start_at,omitempty"`
	EndAt             *time.Time `json:"end_at,omitempty"`
}

type ExamAssignmentUser struct {
	UserID              int64      `json:"user_id"`
	Username            string     `json:"username"`
	Email               *string    `json:"email,omitempty"`
	FullName            string     `json:"full_name"`
	ParticipantNo       *string    `json:"participant_no,omitempty"`
	PhotoDataURL        *string    `json:"photo_data_url,omitempty"`
	UserActive          bool       `json:"user_active"`
	Role                string     `json:"role"`
	SchoolID            *int64     `json:"school_id,omitempty"`
	SchoolName          *string    `json:"school_name,omitempty"`
	SchoolAddress       *string    `json:"school_address,omitempty"`
	SchoolCity          *string    `json:"school_city,omitempty"`
	SchoolProvince      *string    `json:"school_province,omitempty"`
	ClassID             *int64     `json:"class_id,omitempty"`
	ClassName           *string    `json:"class_name,omitempty"`
	Status              string     `json:"status"`
	AssignedAt          time.Time  `json:"assigned_at"`
	AssignedBy          *int64     `json:"assigned_by,omitempty"`
	AssignedByN         *string    `json:"assigned_by_name,omitempty"`
	LatestAttemptID     *int64     `json:"latest_attempt_id,omitempty"`
	LatestAttemptStatus *string    `json:"latest_attempt_status,omitempty"`
	LatestAttemptScore  *float64   `json:"latest_attempt_score,omitempty"`
	LatestStartedAt     *time.Time `json:"latest_started_at,omitempty"`
	LatestSubmittedAt   *time.Time `json:"latest_submitted_at,omitempty"`
	LatestActivityAt    *time.Time `json:"latest_activity_at,omitempty"`
}

type ExamParticipantResult struct {
	ExamID      int64                         `json:"exam_id"`
	QuestionNos []int                         `json:"question_nos"`
	AnswerKeys  []string                      `json:"answer_keys,omitempty"`
	TotalWeight float64                       `json:"total_weight"`
	Limit       int                           `json:"limit"`
	Offset      int                           `json:"offset"`
	TotalRows   int                           `json:"total_rows"`
	Filters     *ExamParticipantResultFilters `json:"filters,omitempty"`
	Rows        []ExamParticipantResultRow    `json:"rows"`
}

type ExamParticipantResultFilters struct {
	Attempts []int    `json:"attempts,omitempty"`
	Classes  []string `json:"classes,omitempty"`
	Schools  []string `json:"schools,omitempty"`
}

type LearningGoalAchievementResult struct {
	ExamID          int64                         `json:"exam_id"`
	KKTP            float64                       `json:"kktp"`
	AttemptFilter   *int                          `json:"attempt_filter,omitempty"`
	ClassFilter     *string                       `json:"class_filter,omitempty"`
	TotalStudents   int                           `json:"total_students"`
	TotalGoals      int                           `json:"total_goals"`
	AchievedGoals   int                           `json:"achieved_goals"`
	UnachievedGoals int                           `json:"unachieved_goals"`
	Items           []LearningGoalAchievementItem `json:"items"`
}

type LearningGoalAchievementItem struct {
	LearningGoalID       *int64                           `json:"learning_goal_id,omitempty"`
	LearningGoalText     string                           `json:"learning_goal_text"`
	LearningGoalMateri   string                           `json:"learning_goal_materi,omitempty"`
	QuestionCount        int                              `json:"question_count"`
	TotalWeight          float64                          `json:"total_weight"`
	AveragePercent       float64                          `json:"average_percent"`
	AchievedStudentCount int                              `json:"achieved_student_count"`
	StudentCount         int                              `json:"student_count"`
	Achieved             bool                             `json:"achieved"`
	Students             []LearningGoalAchievementStudent `json:"students"`
}

type LearningGoalAchievementStudent struct {
	UserID       int64   `json:"user_id"`
	FullName     string  `json:"full_name"`
	ClassName    *string `json:"class_name,omitempty"`
	AttemptID    int64   `json:"attempt_id"`
	AttemptKe    int     `json:"attempt_ke"`
	EarnedWeight float64 `json:"earned_weight"`
	TotalWeight  float64 `json:"total_weight"`
	Percent      float64 `json:"percent"`
	Achieved     bool    `json:"achieved"`
}

type AttemptLearningGoalResult struct {
	AttemptID int64                     `json:"attempt_id"`
	ExamID    int64                     `json:"exam_id"`
	KKTP      float64                   `json:"kktp"`
	Items     []AttemptLearningGoalItem `json:"items"`
}

type AttemptLearningGoalItem struct {
	LearningGoalID     *int64  `json:"learning_goal_id,omitempty"`
	LearningGoalText   string  `json:"learning_goal_text"`
	LearningGoalMateri string  `json:"learning_goal_materi,omitempty"`
	EarnedWeight       float64 `json:"earned_weight"`
	TotalWeight        float64 `json:"total_weight"`
	Percent            float64 `json:"percent"`
	Achieved           bool    `json:"achieved"`
}

type AttemptStudentSchoolInfo struct {
	AttemptID  int64  `json:"attempt_id"`
	ExamID     int64  `json:"exam_id"`
	SchoolName string `json:"school_name"`
	SchoolCity string `json:"school_city"`
}

type ExamParticipantResultRow struct {
	UserID       int64      `json:"user_id"`
	Username     string     `json:"username"`
	FullName     string     `json:"full_name"`
	SchoolName   *string    `json:"school_name,omitempty"`
	ClassName    *string    `json:"class_name,omitempty"`
	AttemptID    int64      `json:"attempt_id"`
	AttemptKe    int        `json:"attempt_ke"`
	SkorTotal    float64    `json:"skor_total"`
	StartedAt    time.Time  `json:"started_at"`
	EndedAt      time.Time  `json:"ended_at"`
	Answers      []string   `json:"answers"`
	AnswerStates []string   `json:"answer_states,omitempty"`
	SubmittedAt  *time.Time `json:"submitted_at,omitempty"`
}

type ReplaceExamAssignmentsInput struct {
	ExamID      int64
	UserIDs     []int64
	AssignedBy  int64
	AllowedRole string
}

type ReplaceExamAssignmentsByClassInput struct {
	ExamID     int64
	SchoolID   int64
	ClassID    int64
	AssignedBy int64
}

type AppendExamAssignmentsByClassInput struct {
	ExamID     int64
	SchoolID   int64
	ClassID    int64
	AssignedBy int64
}

type ExamQuestionManageItem struct {
	ExamID        int64   `json:"exam_id"`
	QuestionID    int64   `json:"question_id"`
	SeqNo         int     `json:"seq_no"`
	Weight        float64 `json:"weight"`
	QuestionType  string  `json:"question_type"`
	QuestionCode  string  `json:"question_code"`
	QuestionTitle string  `json:"question_title"`
	StemPreview   string  `json:"stem_preview"`
	SubjectID     int64   `json:"subject_id"`
	SubjectName   string  `json:"subject_name"`
	VersionNo     *int    `json:"version_no,omitempty"`
	VersionStatus *string `json:"version_status,omitempty"`
}

type UpsertExamQuestionInput struct {
	ExamID     int64
	QuestionID int64
	SeqNo      int
	Weight     float64
}

type ExamQuestionCodeRule struct {
	ExamID           int64   `json:"exam_id"`
	QuestionCodeID   int64   `json:"question_code_id"`
	QuestionCode     string  `json:"question_code"`
	QuestionCodeName string  `json:"question_code_name"`
	SubjectID        int64   `json:"subject_id"`
	Strategy         string  `json:"strategy"`
	PickCount        *int    `json:"pick_count,omitempty"`
	Weight           float64 `json:"weight"`
	IsActive         bool    `json:"is_active"`
}

type UpsertExamQuestionCodeRuleInput struct {
	ExamID         int64
	QuestionCodeID int64
	Strategy       string
	PickCount      *int
	Weight         float64
	CreatedBy      int64
}

type SyncExamQuestionsByCodeInput struct {
	ExamID int64
}

type SyncExamQuestionsByCodeResult struct {
	ExamID        int64 `json:"exam_id"`
	RuleCount     int   `json:"rule_count"`
	SelectedCount int   `json:"selected_count"`
	InsertedCount int   `json:"inserted_count"`
}

type UpsertExamQuestionIncidentInput struct {
	ExamID             int64
	QuestionID         int64
	Policy             string
	Reason             string
	DecidedBy          int64
	RecomputeSubmitted bool
}

type ExamQuestionIncidentResult struct {
	ExamID             int64      `json:"exam_id"`
	QuestionID         int64      `json:"question_id"`
	Policy             string     `json:"policy"`
	Reason             string     `json:"reason"`
	IsActive           bool       `json:"is_active"`
	DecidedBy          *int64     `json:"decided_by,omitempty"`
	DecidedAt          *time.Time `json:"decided_at,omitempty"`
	RecomputedAttempts int        `json:"recomputed_attempts"`
}

type RegradeExamResult struct {
	ExamID            int64 `json:"exam_id"`
	RegradedAttempts  int   `json:"regraded_attempts"`
	SkippedInProgress int   `json:"skipped_in_progress"`
}

type AttemptResultItem struct {
	QuestionID      int64            `json:"question_id"`
	QuestionType    string           `json:"question_type"`
	StemHTML        string           `json:"stem_html,omitempty"`
	StimulusHTML    *string          `json:"stimulus_html,omitempty"`
	ExplanationHTML *string          `json:"explanation_html,omitempty"`
	Options         []QuestionOption `json:"options,omitempty"`
	Selected        []string         `json:"selected"`
	Correct         []string         `json:"correct"`
	IsCorrect       *bool            `json:"is_correct,omitempty"`
	EarnedScore     float64          `json:"earned_score"`
	Reason          string           `json:"reason,omitempty"`
	Breakdown       []StatementScore `json:"breakdown,omitempty"`
}

type AttemptQuestion struct {
	AttemptID       int64            `json:"attempt_id"`
	QuestionID      int64            `json:"question_id"`
	SeqNo           int              `json:"seq_no"`
	QuestionType    string           `json:"question_type"`
	StemHTML        string           `json:"stem_html"`
	StimulusHTML    *string          `json:"stimulus_html,omitempty"`
	QuestionContent json.RawMessage  `json:"question_content,omitempty"`
	AnswerKey       json.RawMessage  `json:"answer_key"`
	AnswerPayload   json.RawMessage  `json:"answer_payload"`
	IsDoubt         bool             `json:"is_doubt"`
	Options         []QuestionOption `json:"options,omitempty"`
}

type AttemptPageRef struct {
	PageNo          int     `json:"page_no"`
	QuestionNos     []int   `json:"question_nos"`
	QuestionIDs     []int64 `json:"question_ids"`
	StimulusGroupID *int64  `json:"stimulus_group_id,omitempty"`
}

type AttemptPageList struct {
	AttemptID      int64            `json:"attempt_id"`
	TotalPages     int              `json:"total_pages"`
	TotalQuestions int              `json:"total_questions"`
	Pages          []AttemptPageRef `json:"pages"`
}

type AttemptPage struct {
	AttemptID       int64             `json:"attempt_id"`
	PageNo          int               `json:"page_no"`
	QuestionNos     []int             `json:"question_nos"`
	QuestionIDs     []int64           `json:"question_ids"`
	StimulusGroupID *int64            `json:"stimulus_group_id,omitempty"`
	StimulusHTML    *string           `json:"stimulus_html,omitempty"`
	Items           []AttemptQuestion `json:"items"`
}

type ExamQuestionDetail struct {
	QuestionID      int64            `json:"question_id"`
	QuestionType    string           `json:"question_type"`
	StemHTML        string           `json:"stem_html"`
	StimulusHTML    *string          `json:"stimulus_html,omitempty"`
	QuestionContent json.RawMessage  `json:"question_content,omitempty"`
	AnswerKey       json.RawMessage  `json:"answer_key"`
	Options         []QuestionOption `json:"options,omitempty"`
}

type QuestionOption struct {
	OptionKey  string `json:"option_key"`
	OptionHTML string `json:"option_html"`
}

type AttemptEventInput struct {
	AttemptID   int64
	EventType   string
	Payload     json.RawMessage
	ClientTS    *time.Time
	ActorUserID int64
}

type AttemptEvent struct {
	ID          int64           `json:"id"`
	AttemptID   int64           `json:"attempt_id"`
	EventType   string          `json:"event_type"`
	Payload     json.RawMessage `json:"payload"`
	ClientTS    *time.Time      `json:"client_ts,omitempty"`
	ServerTS    time.Time       `json:"server_ts"`
	ActorUserID *int64          `json:"actor_user_id,omitempty"`
	ActorName   *string         `json:"actor_name,omitempty"`
	CreatedAt   time.Time       `json:"created_at"`
}

type attemptRow struct {
	ID              int64
	ExamID          int64
	StudentID       int64
	Status          string
	StartedAt       time.Time
	ExpiresAt       time.Time
	SubmittedAt     sql.NullTime
	Score           sql.NullFloat64
	TotalCorrect    sql.NullInt64
	TotalWrong      sql.NullInt64
	TotalUnanswered sql.NullInt64
}

type questionEvalRow struct {
	QuestionID     int64
	QuestionType   string
	Weight         float64
	Payload        []byte
	AnswerKey      []byte
	CorrectKeys    []string
	IncidentPolicy string
}

type columnQuerier interface {
	QueryRowContext(ctx context.Context, query string, args ...any) *sql.Row
}

func NewService(db *sql.DB, defaultExamMinutes int) *Service {
	if defaultExamMinutes <= 0 {
		defaultExamMinutes = 90
	}
	return &Service{db: db, defaultExamMinutes: defaultExamMinutes}
}

func hasColumn(ctx context.Context, q columnQuerier, tableName, columnName string) (bool, error) {
	var exists bool
	if err := q.QueryRowContext(ctx, `
		SELECT EXISTS (
			SELECT 1
			FROM information_schema.columns
			WHERE table_schema = current_schema()
			  AND table_name = $1
			  AND column_name = $2
		)
	`, tableName, columnName).Scan(&exists); err != nil {
		return false, fmt.Errorf("check %s.%s column: %w", tableName, columnName, err)
	}
	return exists, nil
}

func loadExamTenantID(ctx context.Context, q columnQuerier, examID int64) (*int64, error) {
	if examID <= 0 {
		return nil, ErrInvalidInput
	}
	hasTenant, err := hasColumn(ctx, q, "exams", "tenant_id")
	if err != nil {
		return nil, err
	}
	if !hasTenant {
		return nil, nil
	}
	var tenantID sql.NullInt64
	if err := q.QueryRowContext(ctx, `SELECT tenant_id FROM exams WHERE id = $1`, examID).Scan(&tenantID); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrExamNotFound
		}
		return nil, fmt.Errorf("load exam tenant: %w", err)
	}
	if !tenantID.Valid || tenantID.Int64 <= 0 {
		return nil, nil
	}
	out := tenantID.Int64
	return &out, nil
}

func loadAttemptTenantID(ctx context.Context, q columnQuerier, attemptID int64) (*int64, error) {
	if attemptID <= 0 {
		return nil, ErrAttemptNotFound
	}
	hasTenant, err := hasColumn(ctx, q, "attempts", "tenant_id")
	if err != nil {
		return nil, err
	}
	if !hasTenant {
		return nil, nil
	}
	var tenantID sql.NullInt64
	if err := q.QueryRowContext(ctx, `SELECT tenant_id FROM attempts WHERE id = $1`, attemptID).Scan(&tenantID); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrAttemptNotFound
		}
		return nil, fmt.Errorf("load attempt tenant: %w", err)
	}
	if !tenantID.Valid || tenantID.Int64 <= 0 {
		return nil, nil
	}
	out := tenantID.Int64
	return &out, nil
}

func (s *Service) StartAttempt(ctx context.Context, examID, studentID int64, examToken string) (*Attempt, error) {
	if err := s.ensureProktorExamScope(ctx, examID); err != nil {
		return nil, err
	}
	if err := s.ensureProktorStudentScope(ctx, studentID); err != nil {
		return nil, err
	}
	isSimulation, err := s.isSimulationStudent(ctx, studentID)
	if err != nil {
		return nil, err
	}
	if !isSimulation {
		if err := s.ensureStudentAttemptProfileComplete(ctx, studentID); err != nil {
			return nil, err
		}
	}

	duration := s.defaultExamMinutes
	maxAttempts := 1
	var examTokenHash sql.NullString
	var examTokenExpires sql.NullTime
	var examTokenGeneratedAt sql.NullTime
	var examStartAt sql.NullTime
	var examEndAt sql.NullTime
	if err := s.db.QueryRowContext(ctx, `
		SELECT duration_minutes, max_attempts, exam_token_hash, exam_token_expires_at, exam_token_generated_at, start_at, end_at
		FROM exams
		WHERE id = $1 AND is_active = TRUE
	`, examID).Scan(&duration, &maxAttempts, &examTokenHash, &examTokenExpires, &examTokenGeneratedAt, &examStartAt, &examEndAt); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrExamNotFound
		}
		return nil, fmt.Errorf("query exam duration: %w", err)
	}
	if maxAttempts <= 0 {
		maxAttempts = 1
	}
	now := time.Now()
	if err := validateExamScheduleWindow(now, examStartAt, examEndAt); err != nil {
		return nil, err
	}
	row := s.db.QueryRowContext(ctx, `
		SELECT id, exam_id, student_id, status, started_at, expires_at
		FROM attempts
		WHERE exam_id = $1 AND student_id = $2
		  AND status = 'in_progress'
		ORDER BY started_at DESC, id DESC
		LIMIT 1
	`, examID, studentID)

	var existing Attempt
	if err := row.Scan(&existing.ID, &existing.ExamID, &existing.StudentID, &existing.Status, &existing.StartedAt, &existing.ExpiresAt); err == nil {
		if !time.Now().Before(existing.ExpiresAt) {
			if _, err := s.finalizeAttempt(ctx, existing.ID, "expired"); err != nil {
				return nil, err
			}
		} else {
			return &existing, nil
		}
	} else if !errors.Is(err, sql.ErrNoRows) {
		return nil, fmt.Errorf("query existing attempt: %w", err)
	}
	var assignmentCount int
	if err := s.db.QueryRowContext(ctx, `
		SELECT COUNT(*)
		FROM exam_assignments
		WHERE exam_id = $1
		  AND status = 'active'
	`, examID).Scan(&assignmentCount); err != nil {
		if !isUndefinedTableErr(err, "exam_assignments") {
			return nil, fmt.Errorf("query assignment count: %w", err)
		}
		assignmentCount = 0
	}
	if !isSimulation && assignmentCount > 0 {
		var assigned bool
		if err := s.db.QueryRowContext(ctx, `
			SELECT EXISTS(
				SELECT 1
				FROM exam_assignments
				WHERE exam_id = $1
				  AND user_id = $2
				  AND status = 'active'
			)
		`, examID, studentID).Scan(&assigned); err != nil {
			return nil, fmt.Errorf("check assignment: %w", err)
		}
		if !assigned {
			return nil, ErrExamNotAssigned
		}
	}
	inputToken := normalizeExamToken(examToken)
	if inputToken == "" {
		return nil, ErrExamTokenRequired
	}
	if !examTokenHash.Valid || strings.TrimSpace(examTokenHash.String) == "" {
		return nil, ErrExamTokenUnavailable
	}
	if !examTokenExpires.Valid || now.After(examTokenExpires.Time) {
		return nil, ErrExamTokenExpired
	}
	if subtle.ConstantTimeCompare([]byte(hashExamToken(inputToken)), []byte(examTokenHash.String)) != 1 {
		return nil, ErrExamTokenInvalid
	}
	if !isSimulation && examTokenGeneratedAt.Valid {
		var tokenAlreadyUsed bool
		if err := s.db.QueryRowContext(ctx, `
			SELECT EXISTS(
				SELECT 1
				FROM attempts
				WHERE exam_id = $1
				  AND student_id = $2
				  AND status <> 'in_progress'
				  AND submitted_at IS NOT NULL
				  AND submitted_at >= $3
			)
		`, examID, studentID, examTokenGeneratedAt.Time).Scan(&tokenAlreadyUsed); err != nil {
			return nil, fmt.Errorf("check exam token usage: %w", err)
		}
		if tokenAlreadyUsed {
			return nil, ErrExamTokenAlreadyUsed
		}
	}
	var totalAttempts int
	if err := s.db.QueryRowContext(ctx, `
		SELECT COUNT(*)
		FROM attempts
		WHERE exam_id = $1 AND student_id = $2
	`, examID, studentID).Scan(&totalAttempts); err != nil {
		return nil, fmt.Errorf("count attempts: %w", err)
	}
	if !isSimulation && totalAttempts >= maxAttempts {
		return nil, ErrAttemptLimitReached
	}

	startedAt := now
	expiresAt := startedAt.Add(time.Duration(duration) * time.Minute)
	if examEndAt.Valid && examEndAt.Time.Before(expiresAt) {
		expiresAt = examEndAt.Time
	}
	attemptHasTenant, err := hasColumn(ctx, s.db, "attempts", "tenant_id")
	if err != nil {
		return nil, err
	}
	var examTenantID *int64
	if attemptHasTenant {
		examTenantID, err = loadExamTenantID(ctx, s.db, examID)
		if err != nil {
			return nil, err
		}
		if examTenantID == nil || *examTenantID <= 0 {
			return nil, fmt.Errorf("resolve attempt tenant: tenant_id is required")
		}
	}
	attemptColumns := []string{"exam_id", "student_id", "status", "started_at", "expires_at"}
	attemptValues := []string{"$1", "$2", "'in_progress'", "$3", "$4"}
	attemptArgs := []any{examID, studentID, startedAt, expiresAt}
	if attemptHasTenant {
		attemptColumns = append(attemptColumns, "tenant_id")
		attemptValues = append(attemptValues, fmt.Sprintf("$%d", len(attemptArgs)+1))
		attemptArgs = append(attemptArgs, *examTenantID)
	}

	row = s.db.QueryRowContext(ctx, fmt.Sprintf(`
		INSERT INTO attempts (
			%s
		) VALUES (
			%s
		)
		RETURNING id, exam_id, student_id, status, started_at, expires_at
	`, strings.Join(attemptColumns, ", "), strings.Join(attemptValues, ", ")), attemptArgs...)

	var created Attempt
	if err := row.Scan(&created.ID, &created.ExamID, &created.StudentID, &created.Status, &created.StartedAt, &created.ExpiresAt); err != nil {
		return nil, fmt.Errorf("insert attempt: %w", err)
	}

	return &created, nil
}

func (s *Service) isSimulationStudent(ctx context.Context, userID int64) (bool, error) {
	var role string
	if err := s.db.QueryRowContext(ctx, `
		SELECT role
		FROM users
		WHERE id = $1
		  AND is_active = TRUE
	`, userID).Scan(&role); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return false, ErrInvalidInput
		}
		return false, fmt.Errorf("load user role: %w", err)
	}
	return strings.TrimSpace(strings.ToLower(role)) == "guru", nil
}

func (s *Service) PreviewExamByToken(ctx context.Context, studentID int64, examToken string) (*ExamTokenPreview, error) {
	if err := s.ensureStudentAttemptProfileComplete(ctx, studentID); err != nil {
		return nil, err
	}

	examID, examCode, examTitle, subjectName, durationMinutes, maxAttempts, tokenExpiresAt, tokenGeneratedAt, startAt, endAt, err :=
		s.lookupExamByToken(ctx, examToken)
	if err != nil {
		return nil, err
	}
	if err := validateExamScheduleWindow(time.Now(), startAt, endAt); err != nil {
		return nil, err
	}

	if maxAttempts <= 0 {
		maxAttempts = 1
	}
	if durationMinutes <= 0 {
		durationMinutes = s.defaultExamMinutes
	}

	var assignmentCount int
	if err := s.db.QueryRowContext(ctx, `
		SELECT COUNT(*)
		FROM exam_assignments
		WHERE exam_id = $1
		  AND status = 'active'
	`, examID).Scan(&assignmentCount); err != nil {
		if !isUndefinedTableErr(err, "exam_assignments") {
			return nil, fmt.Errorf("query assignment count: %w", err)
		}
		assignmentCount = 0
	}
	if assignmentCount > 0 {
		var assigned bool
		if err := s.db.QueryRowContext(ctx, `
			SELECT EXISTS(
				SELECT 1
				FROM exam_assignments
				WHERE exam_id = $1
				  AND user_id = $2
				  AND status = 'active'
			)
		`, examID, studentID).Scan(&assigned); err != nil {
			return nil, fmt.Errorf("check assignment: %w", err)
		}
		if !assigned {
			return nil, ErrExamNotAssigned
		}
	}

	var totalAttempts int
	if err := s.db.QueryRowContext(ctx, `
		SELECT COUNT(*)
		FROM attempts
		WHERE exam_id = $1 AND student_id = $2
	`, examID, studentID).Scan(&totalAttempts); err != nil {
		return nil, fmt.Errorf("count attempts: %w", err)
	}
	if totalAttempts >= maxAttempts {
		return nil, ErrAttemptLimitReached
	}
	if tokenGeneratedAt.Valid {
		var tokenAlreadyUsed bool
		if err := s.db.QueryRowContext(ctx, `
			SELECT EXISTS(
				SELECT 1
				FROM attempts
				WHERE exam_id = $1
				  AND student_id = $2
				  AND status <> 'in_progress'
				  AND submitted_at IS NOT NULL
				  AND submitted_at >= $3
			)
		`, examID, studentID, tokenGeneratedAt.Time).Scan(&tokenAlreadyUsed); err != nil {
			return nil, fmt.Errorf("check exam token usage preview: %w", err)
		}
		if tokenAlreadyUsed {
			return nil, ErrExamTokenAlreadyUsed
		}
	}

	out := &ExamTokenPreview{
		ExamID:            examID,
		ExamCode:          examCode,
		ExamTitle:         examTitle,
		SubjectName:       subjectName,
		DurationMinutes:   durationMinutes,
		MaxAttempts:       maxAttempts,
		AttemptsUsed:      totalAttempts,
		AttemptsRemaining: maxAttempts - totalAttempts,
		TokenExpiresAt:    tokenExpiresAt,
	}
	if startAt.Valid {
		out.StartAt = &startAt.Time
	}
	if endAt.Valid {
		out.EndAt = &endAt.Time
	}
	return out, nil
}

func (s *Service) PreviewExamByTokenForStaff(ctx context.Context, examToken string) (*ExamTokenPreview, error) {
	examID, examCode, examTitle, subjectName, durationMinutes, maxAttempts, tokenExpiresAt, _, startAt, endAt, err :=
		s.lookupExamByToken(ctx, examToken)
	if err != nil {
		return nil, err
	}
	if err := s.ensureProktorExamScope(ctx, examID); err != nil {
		return nil, err
	}
	if err := validateExamScheduleWindow(time.Now(), startAt, endAt); err != nil {
		return nil, err
	}

	if maxAttempts <= 0 {
		maxAttempts = 1
	}
	if durationMinutes <= 0 {
		durationMinutes = s.defaultExamMinutes
	}

	out := &ExamTokenPreview{
		ExamID:            examID,
		ExamCode:          examCode,
		ExamTitle:         examTitle,
		SubjectName:       subjectName,
		DurationMinutes:   durationMinutes,
		MaxAttempts:       maxAttempts,
		AttemptsUsed:      0,
		AttemptsRemaining: maxAttempts,
		TokenExpiresAt:    tokenExpiresAt,
	}
	if startAt.Valid {
		out.StartAt = &startAt.Time
	}
	if endAt.Valid {
		out.EndAt = &endAt.Time
	}
	return out, nil
}

func (s *Service) lookupExamByToken(ctx context.Context, examToken string) (int64, string, string, string, int, int, time.Time, sql.NullTime, sql.NullTime, sql.NullTime, error) {
	inputToken := normalizeExamToken(examToken)
	if inputToken == "" {
		return 0, "", "", "", 0, 0, time.Time{}, sql.NullTime{}, sql.NullTime{}, sql.NullTime{}, ErrExamTokenRequired
	}

	tokenHash := hashExamToken(inputToken)
	now := time.Now()

	var (
		examID           int64
		examCode         string
		examTitle        string
		subjectName      string
		durationMinutes  int
		maxAttempts      int
		tokenExpiresAt   time.Time
		tokenGeneratedAt sql.NullTime
		startAt          sql.NullTime
		endAt            sql.NullTime
	)

	err := s.db.QueryRowContext(ctx, `
		SELECT
			e.id,
			e.code,
			e.title,
			s.name AS subject_name,
			e.duration_minutes,
			e.max_attempts,
			e.exam_token_expires_at,
			e.exam_token_generated_at,
			e.start_at,
			e.end_at
		FROM exams e
		JOIN subjects s ON s.id = e.subject_id
		WHERE e.is_active = TRUE
		  AND e.exam_token_hash = $1
		  AND e.exam_token_expires_at IS NOT NULL
		  AND e.exam_token_expires_at > $2
		ORDER BY e.created_at DESC, e.id DESC
		LIMIT 1
	`, tokenHash, now).Scan(
		&examID,
		&examCode,
		&examTitle,
		&subjectName,
		&durationMinutes,
		&maxAttempts,
		&tokenExpiresAt,
		&tokenGeneratedAt,
		&startAt,
		&endAt,
	)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			var exists int
			errExpired := s.db.QueryRowContext(ctx, `
				SELECT COUNT(*)
				FROM exams
				WHERE is_active = TRUE
				  AND exam_token_hash = $1
			`, tokenHash).Scan(&exists)
			if errExpired != nil {
				return 0, "", "", "", 0, 0, time.Time{}, sql.NullTime{}, sql.NullTime{}, sql.NullTime{}, fmt.Errorf("query exam token existence: %w", errExpired)
			}
			if exists > 0 {
				return 0, "", "", "", 0, 0, time.Time{}, sql.NullTime{}, sql.NullTime{}, sql.NullTime{}, ErrExamTokenExpired
			}
			return 0, "", "", "", 0, 0, time.Time{}, sql.NullTime{}, sql.NullTime{}, sql.NullTime{}, ErrExamTokenInvalid
		}
		return 0, "", "", "", 0, 0, time.Time{}, sql.NullTime{}, sql.NullTime{}, sql.NullTime{}, fmt.Errorf("query exam by token: %w", err)
	}

	return examID, examCode, examTitle, subjectName, durationMinutes, maxAttempts, tokenExpiresAt, tokenGeneratedAt, startAt, endAt, nil
}

func validateExamScheduleWindow(now time.Time, startAt, endAt sql.NullTime) error {
	if startAt.Valid && now.Before(startAt.Time) {
		return ErrExamNotStarted
	}
	if endAt.Valid && !now.Before(endAt.Time) {
		return ErrExamEnded
	}
	return nil
}

func (s *Service) ensureStudentAttemptProfileComplete(ctx context.Context, studentID int64) error {
	if studentID <= 0 {
		return ErrInvalidInput
	}

	var role string
	var fullName string
	var participantNo string
	var nisn string
	var schoolName string
	var schoolCode string
	var className string
	var isNonRegular bool
	if err := s.db.QueryRowContext(ctx, `
		SELECT
			u.role,
			COALESCE(NULLIF(btrim(u.full_name), ''), ''),
			COALESCE(NULLIF(btrim(u.participant_no), ''), ''),
			COALESCE(NULLIF(btrim(u.nisn), ''), ''),
			COALESCE(NULLIF(btrim(enr.school_name), ''), ''),
			COALESCE(NULLIF(btrim(enr.school_code), ''), ''),
			COALESCE(NULLIF(btrim(enr.class_name), ''), ''),
			COALESCE(u.is_non_regular, FALSE)
		FROM users u
		LEFT JOIN LATERAL (
			SELECT
				s.name AS school_name,
				s.code AS school_code,
				c.name AS class_name
			FROM enrollments e
			JOIN schools s ON s.id = e.school_id
			JOIN classes c ON c.id = e.class_id
			WHERE e.user_id = u.id
			ORDER BY e.enrolled_at DESC, e.id DESC
			LIMIT 1
		) enr ON TRUE
		WHERE u.id = $1
		  AND u.is_active = TRUE
	`, studentID).Scan(&role, &fullName, &participantNo, &nisn, &schoolName, &schoolCode, &className, &isNonRegular); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return ErrAttemptForbidden
		}
		return fmt.Errorf("load student profile: %w", err)
	}
	if role == "guru" {
		return nil
	}
	if role != "siswa" {
		return ErrAttemptForbidden
	}

	if fullName == "" || className == "" || schoolName == "" || schoolCode == "" {
		return ErrStudentDataMissing
	}
	if !isNonRegular && (participantNo == "" || nisn == "") {
		return ErrStudentDataMissing
	}
	return nil
}

func canStudentSeePublishedExam(hasAssignment, isNonRegular, allowNonRegular bool) bool {
	if hasAssignment {
		return true
	}
	return isNonRegular && allowNonRegular
}

func canStudentSelfEnrollExam(hasAssignment, isNonRegular, allowNonRegular bool) bool {
	if hasAssignment {
		return true
	}
	if !isNonRegular {
		// Preserve the legacy behavior for regular students.
		return true
	}
	return allowNonRegular
}

func (s *Service) ListExamsForToken(ctx context.Context) ([]ExamTokenExam, error) {
	user, isProktor := currentScopedProktor(ctx)
	rows, err := s.db.QueryContext(ctx, fmt.Sprintf(`
		SELECT
			e.id,
			e.code,
			e.title,
			e.subject_id,
			s.name AS subject_name,
			s.education_level,
			s.subject_type,
			e.end_at
		FROM exams e
		JOIN subjects s ON s.id = e.subject_id
		WHERE e.is_active = TRUE
		  AND (
			$1 = 0
			OR %s
		  )
		ORDER BY e.created_at DESC, e.id DESC
	`, proktorExamScopeClause("e.id", "e.created_by", "$1", true)), func() int64 {
		if isProktor {
			return user.ID
		}
		return 0
	}())
	if err != nil {
		return nil, fmt.Errorf("query exams for token: %w", err)
	}
	defer rows.Close()

	items := make([]ExamTokenExam, 0)
	for rows.Next() {
		var it ExamTokenExam
		var endAt sql.NullTime
		if err := rows.Scan(
			&it.ID,
			&it.Code,
			&it.Title,
			&it.SubjectID,
			&it.SubjectName,
			&it.EducationLevel,
			&it.SubjectType,
			&endAt,
		); err != nil {
			return nil, fmt.Errorf("scan exams for token: %w", err)
		}
		if endAt.Valid {
			it.EndAt = &endAt.Time
		}
		items = append(items, it)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate exams for token: %w", err)
	}
	return items, nil
}

func (s *Service) ListPublishedExamsForStudent(ctx context.Context, studentID int64) ([]ExamTokenExam, error) {
	return s.listPublishedExamsForStudent(ctx, studentID)
}

func (s *Service) listPublishedExamsForStudent(ctx context.Context, studentID int64) ([]ExamTokenExam, error) {
	if studentID <= 0 {
		return nil, ErrInvalidInput
	}
	var role string
	var isNonRegular bool
	if err := s.db.QueryRowContext(ctx, `
		SELECT role, COALESCE(is_non_regular, FALSE)
		FROM users
		WHERE id = $1
		  AND is_active = TRUE
	`, studentID).Scan(&role, &isNonRegular); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrAttemptForbidden
		}
		return nil, fmt.Errorf("load student visibility profile: %w", err)
	}
	if strings.TrimSpace(strings.ToLower(role)) != "siswa" {
		return nil, ErrAttemptForbidden
	}
	now := time.Now()
	query := `
		SELECT
			e.id,
			e.code,
			e.title,
			e.subject_id,
			s.name AS subject_name,
			s.education_level,
			s.subject_type,
			e.end_at,
			e.exam_token_plain,
			e.exam_token_expires_at,
			e.exam_token_published_at,
			CASE WHEN ea.user_id IS NULL THEN FALSE ELSE TRUE END AS has_assignment,
			COALESCE(e.allow_non_regular_self_enroll, FALSE) AS allow_non_regular
		FROM exams e
		LEFT JOIN exam_assignments ea
			ON ea.exam_id = e.id
			AND ea.user_id = $1
			AND ea.status = 'active'
		JOIN subjects s ON s.id = e.subject_id
		WHERE e.is_active = TRUE
		  AND (e.start_at IS NULL OR e.start_at <= $2)
		  AND (e.end_at IS NULL OR e.end_at > $2)
		ORDER BY e.created_at DESC, e.id DESC
	`
	rows, err := s.db.QueryContext(ctx, query, studentID, now)
	if err != nil {
		if isUndefinedTableErr(err, "exam_assignments") {
			return nil, ErrAssignmentFeature
		}
		return nil, fmt.Errorf("query published exams: %w", err)
	}
	defer rows.Close()

	items := make([]ExamTokenExam, 0)
	for rows.Next() {
		var it ExamTokenExam
		var endAt sql.NullTime
		var tokenPlain sql.NullString
		var tokenExpiresAt sql.NullTime
		var tokenPublishedAt sql.NullTime
		var hasAssignment bool
		var allowNonRegular bool
		if err := rows.Scan(
			&it.ID,
			&it.Code,
			&it.Title,
			&it.SubjectID,
			&it.SubjectName,
			&it.EducationLevel,
			&it.SubjectType,
			&endAt,
			&tokenPlain,
			&tokenExpiresAt,
			&tokenPublishedAt,
			&hasAssignment,
			&allowNonRegular,
		); err != nil {
			return nil, fmt.Errorf("scan published exams: %w", err)
		}
		if !canStudentSeePublishedExam(hasAssignment, isNonRegular, allowNonRegular) {
			continue
		}
		if endAt.Valid {
			it.EndAt = &endAt.Time
		}
		if tokenPublishedAt.Valid && tokenExpiresAt.Valid && tokenPlain.Valid {
			if tokenExpiresAt.Time.After(now) {
				it.Token = strings.TrimSpace(tokenPlain.String)
				it.TokenExpiresAt = &tokenExpiresAt.Time
			}
		}
		items = append(items, it)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate published exams: %w", err)
	}
	return items, nil
}

func (s *Service) SelfEnrollExam(ctx context.Context, examID, studentID int64) error {
	if examID <= 0 || studentID <= 0 {
		return ErrInvalidInput
	}
	assignmentHasTenant, err := hasColumn(ctx, s.db, "exam_assignments", "tenant_id")
	if err != nil {
		return err
	}
	var examTenantID *int64
	if assignmentHasTenant {
		examTenantID, err = loadExamTenantID(ctx, s.db, examID)
		if err != nil {
			return err
		}
		if examTenantID == nil || *examTenantID <= 0 {
			return fmt.Errorf("resolve exam assignment tenant: tenant_id is required")
		}
	}

	var role string
	var isNonRegular bool
	if err := s.db.QueryRowContext(ctx, `
		SELECT role, COALESCE(is_non_regular, FALSE)
		FROM users
		WHERE id = $1
		  AND is_active = TRUE
	`, studentID).Scan(&role, &isNonRegular); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return ErrAttemptForbidden
		}
		return fmt.Errorf("load user role: %w", err)
	}
	if strings.TrimSpace(strings.ToLower(role)) != "siswa" {
		return ErrAttemptForbidden
	}

	var startAt sql.NullTime
	var endAt sql.NullTime
	var allowNonRegular bool
	var hasAssignment bool
	if err := s.db.QueryRowContext(ctx, `
		SELECT
			e.start_at,
			e.end_at,
			COALESCE(e.allow_non_regular_self_enroll, FALSE),
			EXISTS(
				SELECT 1
				FROM exam_assignments ea
				WHERE ea.exam_id = e.id
				  AND ea.user_id = $2
				  AND ea.status = 'active'
			)
		FROM exams e
		WHERE id = $1 AND is_active = TRUE
	`, examID, studentID).Scan(&startAt, &endAt, &allowNonRegular, &hasAssignment); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return ErrExamNotFound
		}
		return fmt.Errorf("load exam schedule: %w", err)
	}
	if err := validateExamScheduleWindow(time.Now(), startAt, endAt); err != nil {
		return err
	}
	if !canStudentSelfEnrollExam(hasAssignment, isNonRegular, allowNonRegular) {
		return ErrAttemptForbidden
	}

	assignmentColumns := []string{"exam_id", "user_id", "status", "assigned_by", "assigned_at", "created_at", "updated_at"}
	assignmentValues := []string{"$1", "$2", "'active'", "NULL", "now()", "now()", "now()"}
	assignmentArgs := []any{examID, studentID}
	if assignmentHasTenant {
		assignmentColumns = append(assignmentColumns, "tenant_id")
		assignmentValues = append(assignmentValues, fmt.Sprintf("$%d", len(assignmentArgs)+1))
		assignmentArgs = append(assignmentArgs, *examTenantID)
	}
	if _, err := s.db.ExecContext(ctx, fmt.Sprintf(`
		INSERT INTO exam_assignments (
			%s
		) VALUES (
			%s
		)
		ON CONFLICT (exam_id, user_id)
		DO UPDATE SET
			status = 'active',
			assigned_by = NULL,
			assigned_at = now(),
			updated_at = now()
	`, strings.Join(assignmentColumns, ", "), strings.Join(assignmentValues, ", ")), assignmentArgs...); err != nil {
		if isUndefinedTableErr(err, "exam_assignments") {
			return ErrAssignmentFeature
		}
		return fmt.Errorf("upsert exam assignment: %w", err)
	}

	return nil
}

func (s *Service) GenerateExamToken(ctx context.Context, examID, generatedBy int64, ttlMinutes int) (*ExamAccessToken, error) {
	if examID <= 0 {
		return nil, ErrInvalidInput
	}
	if generatedBy <= 0 {
		return nil, ErrInvalidInput
	}
	if ttlMinutes <= 0 {
		ttlMinutes = 120
	}
	if ttlMinutes > 1440 {
		ttlMinutes = 1440
	}
	if err := s.ensureProktorExamScope(ctx, examID); err != nil {
		return nil, err
	}

	token, err := randomExamToken(6)
	if err != nil {
		return nil, fmt.Errorf("generate exam token: %w", err)
	}
	tokenHash := hashExamToken(token)

	var generatedAt time.Time
	var expiresAt time.Time
	if err := s.db.QueryRowContext(ctx, `
		UPDATE exams
		SET exam_token_hash = $2,
			exam_token_plain = $3,
			exam_token_expires_at = now() + make_interval(mins => $4),
			exam_token_generated_at = now(),
			exam_token_generated_by = $5,
			exam_token_published_at = NULL,
			exam_token_published_by = NULL
		WHERE id = $1
		  AND is_active = TRUE
		RETURNING exam_token_generated_at, exam_token_expires_at
	`, examID, tokenHash, token, ttlMinutes, generatedBy).Scan(&generatedAt, &expiresAt); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrExamNotFound
		}
		return nil, fmt.Errorf("update exam token: %w", err)
	}

	return &ExamAccessToken{
		ExamID:      examID,
		Token:       token,
		TTLMinutes:  ttlMinutes,
		GeneratedAt: generatedAt,
		ExpiresAt:   expiresAt,
		GeneratedBy: generatedBy,
	}, nil
}

func (s *Service) PublishExamToken(ctx context.Context, examID, publishedBy int64) (*ExamTokenPublish, error) {
	if examID <= 0 {
		return nil, ErrInvalidInput
	}
	if publishedBy <= 0 {
		return nil, ErrInvalidInput
	}
	if err := s.ensureProktorExamScope(ctx, examID); err != nil {
		return nil, err
	}

	var tokenPlain sql.NullString
	var expiresAt sql.NullTime
	if err := s.db.QueryRowContext(ctx, `
		SELECT exam_token_plain, exam_token_expires_at
		FROM exams
		WHERE id = $1
		  AND is_active = TRUE
	`, examID).Scan(&tokenPlain, &expiresAt); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrExamNotFound
		}
		return nil, fmt.Errorf("load exam token: %w", err)
	}

	if !tokenPlain.Valid || strings.TrimSpace(tokenPlain.String) == "" {
		return nil, ErrExamTokenUnavailable
	}
	if !expiresAt.Valid {
		return nil, ErrExamTokenExpired
	}
	if time.Now().After(expiresAt.Time) {
		return nil, ErrExamTokenExpired
	}

	var publishedAt time.Time
	var expires time.Time
	if err := s.db.QueryRowContext(ctx, `
		UPDATE exams
		SET exam_token_published_at = now(),
			exam_token_published_by = $2
		WHERE id = $1
		RETURNING exam_token_published_at, exam_token_expires_at
	`, examID, publishedBy).Scan(&publishedAt, &expires); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrExamNotFound
		}
		return nil, fmt.Errorf("publish exam token: %w", err)
	}

	return &ExamTokenPublish{
		ExamID:      examID,
		PublishedAt: publishedAt,
		ExpiresAt:   expires,
	}, nil
}

func (s *Service) ListAdminExams(ctx context.Context, includeInactive bool) ([]ExamAdminRecord, error) {
	return s.listAdminExams(ctx, includeInactive, nil)
}

func (s *Service) ListAdminExamsByOwner(ctx context.Context, ownerID int64, includeInactive bool) ([]ExamAdminRecord, error) {
	if ownerID <= 0 {
		return nil, ErrInvalidInput
	}
	return s.listAdminExams(ctx, includeInactive, &ownerID)
}

func (s *Service) listAdminExams(ctx context.Context, includeInactive bool, ownerID *int64) ([]ExamAdminRecord, error) {
	user, isProktor := currentScopedProktor(ctx)
	query := `
		SELECT
			e.id,
			e.code,
			e.title,
			e.subject_id,
			s.name AS subject_name,
			s.education_level,
			s.subject_type,
			e.kktp,
			e.duration_minutes,
			e.max_attempts,
			e.start_at,
			e.end_at,
			e.review_policy,
			e.randomize_questions,
			e.randomize_options,
			e.allow_non_regular_self_enroll,
			e.is_active,
			e.created_by,
			e.created_at,
			COALESCE(eq.question_count, 0) AS question_count,
			COALESCE(ea.assigned_count, 0) AS assigned_count
		FROM exams e
		JOIN subjects s ON s.id = e.subject_id
		LEFT JOIN (
			SELECT exam_id, COUNT(*)::int AS question_count
			FROM exam_questions
			GROUP BY exam_id
		) eq ON eq.exam_id = e.id
			LEFT JOIN (
				SELECT exam_id, COUNT(*)::int AS assigned_count
				FROM exam_assignments
				WHERE status = 'active'
				GROUP BY exam_id
			) ea ON ea.exam_id = e.id
	`
	args := make([]any, 0, 2)
	clauses := make([]string, 0, 2)
	if !includeInactive {
		clauses = append(clauses, "e.is_active = TRUE")
	}
	if ownerID != nil {
		clauses = append(clauses, fmt.Sprintf("e.created_by = $%d", len(args)+1))
		args = append(args, *ownerID)
	}
	if isProktor {
		clauses = append(clauses, proktorExamScopeClause("e.id", "e.created_by", fmt.Sprintf("$%d", len(args)+1), true))
		args = append(args, user.ID)
	}
	if len(clauses) > 0 {
		query += " WHERE " + strings.Join(clauses, " AND ")
	}
	query += " ORDER BY e.created_at DESC, e.id DESC"

	rows, err := s.db.QueryContext(ctx, query, args...)
	if err != nil {
		if isUndefinedTableErr(err, "exam_assignments") {
			query = `
				SELECT
					e.id,
					e.code,
					e.title,
					e.subject_id,
					s.name AS subject_name,
					s.education_level,
					s.subject_type,
					e.kktp,
					e.duration_minutes,
					e.max_attempts,
					e.start_at,
					e.end_at,
					e.review_policy,
					e.randomize_questions,
					e.randomize_options,
					e.allow_non_regular_self_enroll,
					e.is_active,
					e.created_by,
					e.created_at,
					COALESCE(eq.question_count, 0) AS question_count,
					0::int AS assigned_count
				FROM exams e
				JOIN subjects s ON s.id = e.subject_id
				LEFT JOIN (
					SELECT exam_id, COUNT(*)::int AS question_count
					FROM exam_questions
					GROUP BY exam_id
				) eq ON eq.exam_id = e.id
			`
			fallbackClauses := make([]string, 0, len(clauses))
			fallbackClauses = append(fallbackClauses, clauses...)
			if isProktor {
				fallbackClauses[len(fallbackClauses)-1] = proktorExamScopeClause("e.id", "e.created_by", fmt.Sprintf("$%d", len(args)), false)
			}
			if len(fallbackClauses) > 0 {
				query += " WHERE " + strings.Join(fallbackClauses, " AND ")
			}
			query += " ORDER BY e.created_at DESC, e.id DESC"
			rows, err = s.db.QueryContext(ctx, query, args...)
		}
	}
	if err != nil {
		return nil, fmt.Errorf("list admin exams: %w", err)
	}
	defer rows.Close()

	items := make([]ExamAdminRecord, 0)
	for rows.Next() {
		var it ExamAdminRecord
		var startAt sql.NullTime
		var endAt sql.NullTime
		var createdBy sql.NullInt64
		if err := rows.Scan(
			&it.ID,
			&it.Code,
			&it.Title,
			&it.SubjectID,
			&it.SubjectName,
			&it.EducationLevel,
			&it.SubjectType,
			&it.KKTP,
			&it.DurationMinutes,
			&it.MaxAttempts,
			&startAt,
			&endAt,
			&it.ReviewPolicy,
			&it.RandomizeQuestions,
			&it.RandomizeOptions,
			&it.AllowNonRegular,
			&it.IsActive,
			&createdBy,
			&it.CreatedAt,
			&it.QuestionCount,
			&it.AssignedCount,
		); err != nil {
			return nil, fmt.Errorf("scan admin exam: %w", err)
		}
		if startAt.Valid {
			it.StartAt = &startAt.Time
		}
		if endAt.Valid {
			it.EndAt = &endAt.Time
		}
		if createdBy.Valid {
			it.CreatedBy = &createdBy.Int64
		}
		items = append(items, it)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate admin exams: %w", err)
	}
	return items, nil
}

func (s *Service) CreateExam(ctx context.Context, in CreateExamInput) (*ExamAdminRecord, error) {
	in.Code = strings.ToUpper(strings.TrimSpace(in.Code))
	in.Title = strings.TrimSpace(in.Title)
	in.ReviewPolicy = normalizeReviewPolicy(in.ReviewPolicy)
	if in.Title == "" || in.SubjectID <= 0 || in.CreatedBy <= 0 {
		return nil, ErrInvalidInput
	}
	if in.DurationMinutes <= 0 {
		in.DurationMinutes = s.defaultExamMinutes
	}
	in.KKTP = normalizeKKTP(in.KKTP)
	if in.MaxAttempts <= 0 {
		in.MaxAttempts = 1
	}
	if _, isProktor := currentScopedProktor(ctx); isProktor {
		return nil, ErrExamForbidden
	}
	insertOnce := func(code string) (int64, error) {
		var outID int64
		if err := s.db.QueryRowContext(ctx, `
			INSERT INTO exams (
				code, title, subject_id, kktp, duration_minutes, max_attempts,
				start_at, end_at, review_policy, randomize_questions, randomize_options,
				allow_non_regular_self_enroll, is_active, created_by, created_at
			) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,TRUE,$13,now())
			RETURNING id
		`, code, in.Title, in.SubjectID, in.KKTP, in.DurationMinutes, in.MaxAttempts, in.StartAt, in.EndAt, in.ReviewPolicy, in.RandomizeQuestions, in.RandomizeOptions, in.AllowNonRegular, in.CreatedBy).Scan(&outID); err != nil {
			return 0, err
		}
		return outID, nil
	}

	if in.Code != "" {
		outID, err := insertOnce(in.Code)
		if err != nil {
			if in.ReviewPolicy == "score_only" && isReviewPolicyConstraintErr(err) {
				return nil, ErrReviewPolicySchema
			}
			if strings.Contains(strings.ToLower(err.Error()), "exams_code_key") {
				return nil, ErrExamCodeExists
			}
			return nil, fmt.Errorf("create exam: %w", err)
		}
		return s.GetExamAdminByID(ctx, outID)
	}

	for i := 0; i < 8; i++ {
		token, err := randomExamToken(4)
		if err != nil {
			return nil, fmt.Errorf("generate exam code: %w", err)
		}
		autoCode := "EXAM-" + time.Now().Format("20060102") + "-" + token
		outID, err := insertOnce(autoCode)
		if err != nil {
			if in.ReviewPolicy == "score_only" && isReviewPolicyConstraintErr(err) {
				return nil, ErrReviewPolicySchema
			}
			if strings.Contains(strings.ToLower(err.Error()), "exams_code_key") {
				continue
			}
			return nil, fmt.Errorf("create exam: %w", err)
		}
		return s.GetExamAdminByID(ctx, outID)
	}
	return nil, fmt.Errorf("create exam: gagal generate kode ujian unik")
}

func (s *Service) IsExamOwnedBy(ctx context.Context, examID, ownerID int64) (bool, error) {
	if examID <= 0 || ownerID <= 0 {
		return false, ErrInvalidInput
	}
	var createdBy sql.NullInt64
	if err := s.db.QueryRowContext(ctx, `
		SELECT created_by
		FROM exams
		WHERE id = $1
	`, examID).Scan(&createdBy); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return false, ErrExamNotFound
		}
		return false, fmt.Errorf("load exam owner: %w", err)
	}
	if createdBy.Valid && createdBy.Int64 == ownerID {
		return true, nil
	}
	return false, nil
}

func (s *Service) UpdateExam(ctx context.Context, in UpdateExamInput) (*ExamAdminRecord, error) {
	in.Code = strings.ToUpper(strings.TrimSpace(in.Code))
	in.Title = strings.TrimSpace(in.Title)
	in.ReviewPolicy = normalizeReviewPolicy(in.ReviewPolicy)
	if in.ID <= 0 || in.Code == "" || in.Title == "" || in.SubjectID <= 0 {
		return nil, ErrInvalidInput
	}
	if in.DurationMinutes <= 0 {
		in.DurationMinutes = s.defaultExamMinutes
	}
	in.KKTP = normalizeKKTP(in.KKTP)
	if in.MaxAttempts <= 0 {
		in.MaxAttempts = 1
	}
	if err := s.ensureProktorExamScope(ctx, in.ID); err != nil {
		return nil, err
	}
	var outID int64
	if err := s.db.QueryRowContext(ctx, `
		UPDATE exams
		SET code = $2,
			title = $3,
			subject_id = $4,
			kktp = $5,
			duration_minutes = $6,
			max_attempts = $7,
			start_at = $8,
			end_at = $9,
			review_policy = $10,
			randomize_questions = $11,
			randomize_options = $12,
			allow_non_regular_self_enroll = $13,
			is_active = $14
		WHERE id = $1
		RETURNING id
	`, in.ID, in.Code, in.Title, in.SubjectID, in.KKTP, in.DurationMinutes, in.MaxAttempts, in.StartAt, in.EndAt, in.ReviewPolicy, in.RandomizeQuestions, in.RandomizeOptions, in.AllowNonRegular, in.IsActive).Scan(&outID); err != nil {
		if in.ReviewPolicy == "score_only" && isReviewPolicyConstraintErr(err) {
			return nil, ErrReviewPolicySchema
		}
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrExamNotFound
		}
		if strings.Contains(strings.ToLower(err.Error()), "exams_code_key") {
			return nil, ErrExamCodeExists
		}
		return nil, fmt.Errorf("update exam: %w", err)
	}
	return s.GetExamAdminByID(ctx, outID)
}

func (s *Service) DeleteExam(ctx context.Context, examID int64) error {
	if examID <= 0 {
		return ErrInvalidInput
	}
	if err := s.ensureProktorExamScope(ctx, examID); err != nil {
		return err
	}
	var outID int64
	if err := s.db.QueryRowContext(ctx, `
		UPDATE exams
		SET is_active = FALSE
		WHERE id = $1
		RETURNING id
	`, examID).Scan(&outID); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return ErrExamNotFound
		}
		return fmt.Errorf("delete exam: %w", err)
	}
	return nil
}

func (s *Service) GetExamAdminByID(ctx context.Context, examID int64) (*ExamAdminRecord, error) {
	if examID <= 0 {
		return nil, ErrInvalidInput
	}
	if err := s.ensureProktorExamScope(ctx, examID); err != nil {
		return nil, err
	}
	rows, err := s.db.QueryContext(ctx, `
		SELECT
			e.id,
			e.code,
			e.title,
			e.subject_id,
			s.name AS subject_name,
			s.education_level,
			s.subject_type,
			e.kktp,
			e.duration_minutes,
			e.max_attempts,
			e.start_at,
			e.end_at,
			e.review_policy,
			e.randomize_questions,
			e.randomize_options,
			e.allow_non_regular_self_enroll,
			e.is_active,
			e.created_by,
			e.created_at,
			COALESCE(eq.question_count, 0) AS question_count,
			COALESCE(ea.assigned_count, 0) AS assigned_count
		FROM exams e
		JOIN subjects s ON s.id = e.subject_id
		LEFT JOIN (
			SELECT exam_id, COUNT(*)::int AS question_count
			FROM exam_questions
			GROUP BY exam_id
		) eq ON eq.exam_id = e.id
			LEFT JOIN (
				SELECT exam_id, COUNT(*)::int AS assigned_count
				FROM exam_assignments
				WHERE status = 'active'
				GROUP BY exam_id
			) ea ON ea.exam_id = e.id
			WHERE e.id = $1
	`, examID)
	if err != nil {
		if isUndefinedTableErr(err, "exam_assignments") {
			rows, err = s.db.QueryContext(ctx, `
				SELECT
					e.id,
					e.code,
					e.title,
					e.subject_id,
					s.name AS subject_name,
					s.education_level,
					s.subject_type,
					e.kktp,
					e.duration_minutes,
					e.max_attempts,
					e.start_at,
					e.end_at,
					e.review_policy,
					e.randomize_questions,
					e.randomize_options,
					e.allow_non_regular_self_enroll,
					e.is_active,
					e.created_by,
					e.created_at,
					COALESCE(eq.question_count, 0) AS question_count,
					0::int AS assigned_count
				FROM exams e
				JOIN subjects s ON s.id = e.subject_id
				LEFT JOIN (
					SELECT exam_id, COUNT(*)::int AS question_count
					FROM exam_questions
					GROUP BY exam_id
				) eq ON eq.exam_id = e.id
				WHERE e.id = $1
			`, examID)
		}
	}
	if err != nil {
		return nil, fmt.Errorf("get exam admin: %w", err)
	}
	defer rows.Close()
	if !rows.Next() {
		return nil, ErrExamNotFound
	}
	var it ExamAdminRecord
	var startAt sql.NullTime
	var endAt sql.NullTime
	var createdBy sql.NullInt64
	if err := rows.Scan(
		&it.ID,
		&it.Code,
		&it.Title,
		&it.SubjectID,
		&it.SubjectName,
		&it.EducationLevel,
		&it.SubjectType,
		&it.KKTP,
		&it.DurationMinutes,
		&it.MaxAttempts,
		&startAt,
		&endAt,
		&it.ReviewPolicy,
		&it.RandomizeQuestions,
		&it.RandomizeOptions,
		&it.AllowNonRegular,
		&it.IsActive,
		&createdBy,
		&it.CreatedAt,
		&it.QuestionCount,
		&it.AssignedCount,
	); err != nil {
		return nil, fmt.Errorf("scan exam admin: %w", err)
	}
	if startAt.Valid {
		it.StartAt = &startAt.Time
	}
	if endAt.Valid {
		it.EndAt = &endAt.Time
	}
	if createdBy.Valid {
		it.CreatedBy = &createdBy.Int64
	}
	return &it, nil
}

func (s *Service) ResetExamAttempt(ctx context.Context, examID, studentID, actorID int64) (int64, error) {
	if examID <= 0 || studentID <= 0 || actorID <= 0 {
		return 0, ErrInvalidInput
	}
	if _, err := s.GetExamAdminByID(ctx, examID); err != nil {
		return 0, err
	}
	if err := s.ensureProktorStudentScope(ctx, studentID); err != nil {
		return 0, err
	}

	var attemptID int64
	if err := s.db.QueryRowContext(ctx, `
		SELECT id
		FROM attempts
		WHERE exam_id = $1 AND student_id = $2
		ORDER BY started_at DESC, id DESC
		LIMIT 1
	`, examID, studentID).Scan(&attemptID); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return 0, ErrAttemptNotFound
		}
		return 0, fmt.Errorf("select latest attempt: %w", err)
	}

	if _, err := s.db.ExecContext(ctx, `DELETE FROM attempts WHERE id = $1`, attemptID); err != nil {
		return 0, fmt.Errorf("delete attempt: %w", err)
	}
	return attemptID, nil
}

func (s *Service) DeleteExamAttempt(ctx context.Context, examID, attemptID, actorID int64, actorRole string) (int64, error) {
	if examID <= 0 || attemptID <= 0 || actorID <= 0 {
		return 0, ErrInvalidInput
	}
	role := strings.ToLower(strings.TrimSpace(actorRole))
	if role == "guru" {
		owned, err := s.IsExamOwnedBy(ctx, examID, actorID)
		if err != nil {
			return 0, err
		}
		if !owned {
			return 0, ErrExamForbidden
		}
	}
	if _, err := s.GetExamAdminByID(ctx, examID); err != nil {
		return 0, err
	}
	if err := s.ensureProktorAttemptScope(ctx, attemptID); err != nil {
		return 0, err
	}

	var status string
	if err := s.db.QueryRowContext(ctx, `
		SELECT status
		FROM attempts
		WHERE id = $1 AND exam_id = $2
	`, attemptID, examID).Scan(&status); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return 0, ErrAttemptNotFound
		}
		return 0, fmt.Errorf("load attempt status: %w", err)
	}
	if status == "in_progress" {
		return 0, ErrAttemptNotFinal
	}

	res, err := s.db.ExecContext(ctx, `
		DELETE FROM attempts
		WHERE id = $1 AND exam_id = $2
	`, attemptID, examID)
	if err != nil {
		return 0, fmt.Errorf("delete attempt: %w", err)
	}
	affected, _ := res.RowsAffected()
	if affected == 0 {
		return 0, ErrAttemptNotFound
	}
	return attemptID, nil
}

func (s *Service) ListExamAssignments(ctx context.Context, examID int64) ([]ExamAssignmentUser, error) {
	if examID <= 0 {
		return nil, ErrInvalidInput
	}
	if err := s.ensureProktorExamScope(ctx, examID); err != nil {
		return nil, err
	}
	if err := s.finalizeExpiredAttemptsForExam(ctx, examID); err != nil {
		return nil, err
	}
	user, isProktor := currentScopedProktor(ctx)
	rows, err := s.db.QueryContext(ctx, fmt.Sprintf(`
		SELECT
			u.id,
			u.username,
			u.email,
			u.full_name,
			NULLIF(btrim(u.participant_no), '') AS participant_no,
			u.photo_data_url,
			u.is_active,
			u.role,
			en.school_id,
			sch.name AS school_name,
			sch.address AS school_address,
			sch.city AS school_city,
			sch.province AS school_province,
			en.class_id,
			cls.name AS class_name,
			ea.status,
			ea.assigned_at,
			ea.assigned_by,
			ab.full_name AS assigned_by_name,
			la.id AS latest_attempt_id,
			la.status AS latest_attempt_status,
			la.score AS latest_attempt_score,
			la.started_at AS latest_started_at,
			la.submitted_at AS latest_submitted_at,
			le.latest_activity_at
		FROM exam_assignments ea
		JOIN users u ON u.id = ea.user_id
		LEFT JOIN enrollments en ON en.user_id = u.id AND en.status = 'active'
		LEFT JOIN schools sch ON sch.id = en.school_id
		LEFT JOIN classes cls ON cls.id = en.class_id
		LEFT JOIN users ab ON ab.id = ea.assigned_by
		LEFT JOIN LATERAL (
			SELECT a.id, a.status, a.score, a.submitted_at, a.started_at
			FROM attempts a
			WHERE a.exam_id = ea.exam_id
			  AND a.student_id = ea.user_id
			ORDER BY COALESCE(a.submitted_at, a.started_at) DESC, a.id DESC
			LIMIT 1
		) la ON TRUE
		LEFT JOIN LATERAL (
			SELECT ae.server_ts AS latest_activity_at
			FROM attempt_events ae
			WHERE ae.attempt_id = la.id
			ORDER BY ae.server_ts DESC, ae.id DESC
			LIMIT 1
		) le ON TRUE
		WHERE ea.exam_id = $1
		  AND ea.status = 'active'
		  AND ($2 = 0 OR %s)
		ORDER BY u.role, u.full_name, u.username
	`, proktorStudentScopeClause("u.id", "$2")), examID, func() int64 {
		if isProktor {
			return user.ID
		}
		return 0
	}())
	if err != nil {
		if isUndefinedTableErr(err, "exam_assignments") {
			return nil, ErrAssignmentFeature
		}
		return nil, fmt.Errorf("list exam assignments: %w", err)
	}
	defer rows.Close()
	items := make([]ExamAssignmentUser, 0)
	for rows.Next() {
		var it ExamAssignmentUser
		var email sql.NullString
		var participantNo sql.NullString
		var photoDataURL sql.NullString
		var schoolID sql.NullInt64
		var schoolName sql.NullString
		var schoolAddress sql.NullString
		var schoolCity sql.NullString
		var schoolProvince sql.NullString
		var classID sql.NullInt64
		var className sql.NullString
		var assignedBy sql.NullInt64
		var assignedByName sql.NullString
		var latestAttemptID sql.NullInt64
		var latestAttemptStatus sql.NullString
		var latestAttemptScore sql.NullFloat64
		var latestStartedAt sql.NullTime
		var latestSubmittedAt sql.NullTime
		var latestActivityAt sql.NullTime
		if err := rows.Scan(
			&it.UserID,
			&it.Username,
			&email,
			&it.FullName,
			&participantNo,
			&photoDataURL,
			&it.UserActive,
			&it.Role,
			&schoolID,
			&schoolName,
			&schoolAddress,
			&schoolCity,
			&schoolProvince,
			&classID,
			&className,
			&it.Status,
			&it.AssignedAt,
			&assignedBy,
			&assignedByName,
			&latestAttemptID,
			&latestAttemptStatus,
			&latestAttemptScore,
			&latestStartedAt,
			&latestSubmittedAt,
			&latestActivityAt,
		); err != nil {
			return nil, fmt.Errorf("scan exam assignment: %w", err)
		}
		if email.Valid {
			v := strings.TrimSpace(email.String)
			if v != "" {
				it.Email = &v
			}
		}
		if participantNo.Valid {
			v := strings.TrimSpace(participantNo.String)
			if v != "" {
				it.ParticipantNo = &v
			}
		}
		if photoDataURL.Valid {
			v := strings.TrimSpace(photoDataURL.String)
			if v != "" {
				it.PhotoDataURL = &v
			}
		}
		if schoolName.Valid {
			it.SchoolName = &schoolName.String
		}
		if schoolAddress.Valid {
			v := strings.TrimSpace(schoolAddress.String)
			if v != "" {
				it.SchoolAddress = &v
			}
		}
		if schoolCity.Valid {
			v := strings.TrimSpace(schoolCity.String)
			if v != "" {
				it.SchoolCity = &v
			}
		}
		if schoolProvince.Valid {
			v := strings.TrimSpace(schoolProvince.String)
			if v != "" {
				it.SchoolProvince = &v
			}
		}
		if schoolID.Valid {
			v := schoolID.Int64
			it.SchoolID = &v
		}
		if className.Valid {
			it.ClassName = &className.String
		}
		if classID.Valid {
			v := classID.Int64
			it.ClassID = &v
		}
		if assignedBy.Valid {
			it.AssignedBy = &assignedBy.Int64
		}
		if assignedByName.Valid {
			it.AssignedByN = &assignedByName.String
		}
		if latestAttemptID.Valid {
			v := latestAttemptID.Int64
			it.LatestAttemptID = &v
		}
		if latestAttemptStatus.Valid {
			v := strings.TrimSpace(latestAttemptStatus.String)
			it.LatestAttemptStatus = &v
		}
		if latestAttemptScore.Valid {
			v := latestAttemptScore.Float64
			it.LatestAttemptScore = &v
		}
		if latestStartedAt.Valid {
			v := latestStartedAt.Time
			it.LatestStartedAt = &v
		}
		if latestSubmittedAt.Valid {
			v := latestSubmittedAt.Time
			it.LatestSubmittedAt = &v
		}
		if latestActivityAt.Valid {
			v := latestActivityAt.Time
			it.LatestActivityAt = &v
		}
		items = append(items, it)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate exam assignments: %w", err)
	}
	return items, nil
}

func (s *Service) SetUserPhotoDataURL(ctx context.Context, userID int64, dataURL string) (string, error) {
	if userID <= 0 {
		return "", ErrInvalidInput
	}
	if err := s.ensureProktorStudentScope(ctx, userID); err != nil {
		return "", err
	}
	dataURL = strings.TrimSpace(dataURL)
	if dataURL == "" {
		return "", ErrInvalidInput
	}
	if len(dataURL) > 4*1024*1024 {
		return "", ErrInvalidInput
	}

	var stored sql.NullString
	if err := s.db.QueryRowContext(ctx, `
		UPDATE users
		SET photo_data_url = $2,
			updated_at = now()
		WHERE id = $1
		  AND role = 'siswa'
		RETURNING photo_data_url
	`, userID, dataURL).Scan(&stored); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return "", ErrUserNotFound
		}
		return "", fmt.Errorf("set user photo data: %w", err)
	}
	return strings.TrimSpace(stored.String), nil
}

func (s *Service) ClearUserPhotoDataURL(ctx context.Context, userID int64) error {
	if userID <= 0 {
		return ErrInvalidInput
	}
	if err := s.ensureProktorStudentScope(ctx, userID); err != nil {
		return err
	}
	res, err := s.db.ExecContext(ctx, `
		UPDATE users
		SET photo_data_url = NULL,
			updated_at = now()
		WHERE id = $1
		  AND role = 'siswa'
	`, userID)
	if err != nil {
		return fmt.Errorf("clear user photo data: %w", err)
	}
	affected, _ := res.RowsAffected()
	if affected == 0 {
		return ErrUserNotFound
	}
	return nil
}

func (s *Service) ListExamParticipantResults(ctx context.Context, examID int64, limit, offset int, attemptFilter *int, classFilter, schoolFilter *string) (*ExamParticipantResult, error) {
	if examID <= 0 {
		return nil, ErrInvalidInput
	}
	if err := s.ensureProktorExamScope(ctx, examID); err != nil {
		return nil, err
	}
	if err := s.finalizeExpiredAttemptsForExam(ctx, examID); err != nil {
		return nil, err
	}

	var examExists bool
	if err := s.db.QueryRowContext(ctx, `SELECT EXISTS(SELECT 1 FROM exams WHERE id = $1)`, examID).Scan(&examExists); err != nil {
		return nil, fmt.Errorf("check exam exists for results: %w", err)
	}
	if !examExists {
		return nil, ErrExamNotFound
	}

	if err := s.ensureExamQuestionSeqNoContiguous(ctx, examID); err != nil {
		return nil, fmt.Errorf("ensure exam question seq no: %w", err)
	}
	if limit < 0 {
		return nil, ErrInvalidInput
	}
	if offset < 0 {
		offset = 0
	}
	if attemptFilter != nil && *attemptFilter <= 0 {
		attemptFilter = nil
	}
	var classFilterValue *string
	if classFilter != nil {
		v := strings.TrimSpace(*classFilter)
		if v != "" {
			classFilterValue = &v
		}
	}
	var schoolFilterValue *string
	if schoolFilter != nil {
		v := strings.TrimSpace(*schoolFilter)
		if v != "" {
			schoolFilterValue = &v
		}
	}

	type examQuestionColumn struct {
		SeqNo        int
		QuestionID   int64
		QuestionType string
		AnswerKey    []byte
		Weight       float64
	}
	questionCols := make([]examQuestionColumn, 0)
	qRows, err := s.db.QueryContext(ctx, `
		SELECT
			eq.seq_no,
			eq.question_id,
			q.question_type,
			COALESCE(
				NULLIF(qv.answer_key, '{}'::jsonb),
				NULLIF(qv_fallback.answer_key, '{}'::jsonb),
				'{}'::jsonb
			) AS answer_key,
			eq.weight
		FROM exam_questions eq
		JOIN questions q ON q.id = eq.question_id
		LEFT JOIN LATERAL (
			SELECT qv.answer_key
			FROM question_versions qv
			WHERE qv.question_id = eq.question_id
			ORDER BY CASE
				WHEN qv.version_no = q.version THEN 0
				WHEN qv.status = 'final' THEN 1
				ELSE 2
			END, qv.is_active DESC, qv.version_no DESC
			LIMIT 1
		) qv ON TRUE
		LEFT JOIN LATERAL (
			SELECT qv2.answer_key
			FROM questions q2
			JOIN question_versions qv2 ON qv2.question_id = q2.id
			WHERE q.question_code_id IS NOT NULL
			  AND q2.question_code_id = q.question_code_id
			  AND q2.id <> q.id
			  AND q2.question_type = q.question_type
			  AND (
				NULLIF(btrim(q.metadata->>'title'), '') IS NULL
				OR NULLIF(btrim(q2.metadata->>'title'), '') = NULLIF(btrim(q.metadata->>'title'), '')
			  )
			  AND (
				NULLIF(btrim(q.metadata->>'material'), '') IS NULL
				OR NULLIF(btrim(q2.metadata->>'material'), '') = NULLIF(btrim(q.metadata->>'material'), '')
			  )
			ORDER BY CASE
				WHEN qv2.status = 'final' THEN 0
				ELSE 1
			END, qv2.is_active DESC, qv2.version_no DESC, q2.id DESC
			LIMIT 1
		) qv_fallback ON TRUE
		WHERE eq.exam_id = $1
		ORDER BY eq.seq_no ASC
	`, examID)
	if err != nil {
		return nil, fmt.Errorf("list exam questions for results matrix: %w", err)
	}
	for qRows.Next() {
		var c examQuestionColumn
		if err := qRows.Scan(&c.SeqNo, &c.QuestionID, &c.QuestionType, &c.AnswerKey, &c.Weight); err != nil {
			_ = qRows.Close()
			return nil, fmt.Errorf("scan exam question for results matrix: %w", err)
		}
		questionCols = append(questionCols, c)
	}
	if err := qRows.Err(); err != nil {
		_ = qRows.Close()
		return nil, fmt.Errorf("iterate exam questions for results matrix: %w", err)
	}
	_ = qRows.Close()

	questionNos := make([]int, 0, len(questionCols))
	answerKeys := make([]string, 0, len(questionCols))
	questionTypeByID := make(map[int64]string, len(questionCols))
	questionIndexByID := make(map[int64]int, len(questionCols))
	totalWeight := 0.0
	for idx, c := range questionCols {
		questionNos = append(questionNos, c.SeqNo)
		answerKeys = append(answerKeys, formatAnswerKeyForResultsMatrix(c.QuestionType, c.AnswerKey))
		questionTypeByID[c.QuestionID] = c.QuestionType
		questionIndexByID[c.QuestionID] = idx
		totalWeight += c.Weight
	}

	type attemptRowLite struct {
		AttemptID   int64
		StudentID   int64
		Username    string
		FullName    string
		SchoolName  *string
		ClassName   *string
		Score       float64
		StartedAt   time.Time
		EndedAt     time.Time
		SubmittedAt *time.Time
		AttemptKe   int
	}
	attemptRows := make([]attemptRowLite, 0)
	user, isProktor := currentScopedProktor(ctx)
	scopeUserID := int64(0)
	if isProktor {
		scopeUserID = user.ID
	}
	filters, err := s.loadExamParticipantResultFilters(ctx, examID, scopeUserID)
	if err != nil {
		return nil, err
	}
	var totalRows int
	if err := s.db.QueryRowContext(ctx, fmt.Sprintf(`
		WITH attempt_base AS (
			SELECT
				a.id,
				u.id AS student_id,
				enr.school_name,
				enr.class_name,
				ROW_NUMBER() OVER (PARTITION BY a.student_id ORDER BY a.started_at ASC, a.id ASC) AS attempt_ke
			FROM attempts a
			JOIN users u ON u.id = a.student_id
			LEFT JOIN LATERAL (
				SELECT
					s.name AS school_name,
					c.name AS class_name
				FROM enrollments e
				JOIN classes c ON c.id = e.class_id
				JOIN schools s ON s.id = e.school_id
				WHERE e.user_id = u.id
				  AND e.status = 'active'
				ORDER BY e.enrolled_at DESC, e.id DESC
				LIMIT 1
			) enr ON TRUE
			WHERE a.exam_id = $1
			  AND u.role = 'siswa'
			  AND ($2 = 0 OR %s)
		)
		SELECT COUNT(1)
		FROM attempt_base
		%s
	`, proktorStudentScopeClause("u.id", "$2"), buildResultFilterClause(attemptFilter, classFilterValue, schoolFilterValue, 3)), buildResultFilterArgs(examID, scopeUserID, attemptFilter, classFilterValue, schoolFilterValue)...).Scan(&totalRows); err != nil {
		return nil, fmt.Errorf("count exam participant results: %w", err)
	}
	queryLimit := ""
	args := buildResultFilterArgs(examID, scopeUserID, attemptFilter, classFilterValue, schoolFilterValue)
	if limit > 0 {
		queryLimit = fmt.Sprintf("LIMIT $%d OFFSET $%d", len(args)+1, len(args)+2)
		args = append(args, limit, offset)
	}
	rows, err := s.db.QueryContext(ctx, fmt.Sprintf(`
		WITH attempt_base AS (
			SELECT
				a.id,
				u.id AS student_id,
				u.username,
				u.full_name,
				enr.school_name,
				enr.class_name,
				COALESCE(a.score, 0) AS score,
				a.started_at,
				COALESCE(a.submitted_at, a.expires_at) AS ended_at,
				a.submitted_at,
				ROW_NUMBER() OVER (PARTITION BY a.student_id ORDER BY a.started_at ASC, a.id ASC) AS attempt_ke
			FROM attempts a
			JOIN users u ON u.id = a.student_id
			LEFT JOIN LATERAL (
				SELECT
					s.name AS school_name,
					c.name AS class_name
				FROM enrollments e
				JOIN classes c ON c.id = e.class_id
				JOIN schools s ON s.id = e.school_id
				WHERE e.user_id = u.id
				  AND e.status = 'active'
				ORDER BY e.enrolled_at DESC, e.id DESC
				LIMIT 1
			) enr ON TRUE
			WHERE a.exam_id = $1
			  AND u.role = 'siswa'
			  AND ($2 = 0 OR %s)
		)
		SELECT
			id,
			student_id,
			username,
			full_name,
			school_name,
			class_name,
			score,
			started_at,
			ended_at,
			submitted_at,
			attempt_ke
		FROM attempt_base
		%s
		ORDER BY started_at ASC, id ASC
		%s
	`, proktorStudentScopeClause("u.id", "$2"), buildResultFilterClause(attemptFilter, classFilterValue, schoolFilterValue, 3), queryLimit), args...)
	if err != nil {
		return nil, fmt.Errorf("list exam participant results: %w", err)
	}
	defer rows.Close()
	attemptIDs := make([]int64, 0)
	for rows.Next() {
		var it attemptRowLite
		var schoolName sql.NullString
		var className sql.NullString
		var submittedAt sql.NullTime
		if err := rows.Scan(
			&it.AttemptID,
			&it.StudentID,
			&it.Username,
			&it.FullName,
			&schoolName,
			&className,
			&it.Score,
			&it.StartedAt,
			&it.EndedAt,
			&submittedAt,
			&it.AttemptKe,
		); err != nil {
			return nil, fmt.Errorf("scan exam participant result: %w", err)
		}
		if submittedAt.Valid {
			v := submittedAt.Time
			it.SubmittedAt = &v
		}
		if schoolName.Valid {
			it.SchoolName = &schoolName.String
		}
		if className.Valid {
			it.ClassName = &className.String
		}
		attemptRows = append(attemptRows, it)
		attemptIDs = append(attemptIDs, it.AttemptID)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate exam participant results: %w", err)
	}

	answerByAttemptQuestion := map[int64]map[int64]string{}
	answerStateByAttemptQuestion := map[int64]map[int64]string{}
	if len(attemptIDs) > 0 {
		answerRows, err := s.db.QueryContext(ctx, `
			SELECT aa.attempt_id, aa.question_id, aa.answer_payload
			FROM attempt_answers aa
			WHERE aa.attempt_id = ANY($1)
		`, pq.Array(attemptIDs))
		if err != nil {
			return nil, fmt.Errorf("list attempt answers for results matrix: %w", err)
		}
		for answerRows.Next() {
			var attemptID int64
			var questionID int64
			var payload []byte
			if err := answerRows.Scan(&attemptID, &questionID, &payload); err != nil {
				_ = answerRows.Close()
				return nil, fmt.Errorf("scan attempt answer for results matrix: %w", err)
			}
			formatted := formatAnswerForResultsMatrix(questionTypeByID[questionID], payload)
			if _, ok := answerByAttemptQuestion[attemptID]; !ok {
				answerByAttemptQuestion[attemptID] = map[int64]string{}
			}
			answerByAttemptQuestion[attemptID][questionID] = formatted
		}
		if err := answerRows.Err(); err != nil {
			_ = answerRows.Close()
			return nil, fmt.Errorf("iterate attempt answers for results matrix: %w", err)
		}
		_ = answerRows.Close()

		scoreRows, err := s.db.QueryContext(ctx, `
			SELECT s.attempt_id, s.question_id, s.is_correct, COALESCE(s.feedback->>'reason', '')
			FROM attempt_scores s
			WHERE s.attempt_id = ANY($1)
		`, pq.Array(attemptIDs))
		if err != nil {
			return nil, fmt.Errorf("list attempt score states for results matrix: %w", err)
		}
		for scoreRows.Next() {
			var attemptID int64
			var questionID int64
			var isCorrect sql.NullBool
			var reason string
			if err := scoreRows.Scan(&attemptID, &questionID, &isCorrect, &reason); err != nil {
				_ = scoreRows.Close()
				return nil, fmt.Errorf("scan attempt score state for results matrix: %w", err)
			}
			state := ""
			if isCorrect.Valid {
				if isCorrect.Bool {
					state = "correct"
				} else {
					state = "wrong"
				}
			} else if strings.TrimSpace(strings.ToLower(reason)) == "unanswered" {
				state = "wrong"
			}
			if _, ok := answerStateByAttemptQuestion[attemptID]; !ok {
				answerStateByAttemptQuestion[attemptID] = map[int64]string{}
			}
			answerStateByAttemptQuestion[attemptID][questionID] = state
		}
		if err := scoreRows.Err(); err != nil {
			_ = scoreRows.Close()
			return nil, fmt.Errorf("iterate attempt score states for results matrix: %w", err)
		}
		_ = scoreRows.Close()
	}

	resultRows := make([]ExamParticipantResultRow, 0, len(attemptRows))
	for _, a := range attemptRows {
		r := ExamParticipantResultRow{
			UserID:       a.StudentID,
			Username:     a.Username,
			FullName:     a.FullName,
			SchoolName:   a.SchoolName,
			ClassName:    a.ClassName,
			AttemptID:    a.AttemptID,
			AttemptKe:    a.AttemptKe,
			SkorTotal:    a.Score,
			StartedAt:    a.StartedAt,
			EndedAt:      a.EndedAt,
			Answers:      make([]string, len(questionCols)),
			AnswerStates: make([]string, len(questionCols)),
			SubmittedAt:  a.SubmittedAt,
		}
		for _, col := range questionCols {
			idx := questionIndexByID[col.QuestionID]
			if answersForAttempt, ok := answerByAttemptQuestion[a.AttemptID]; ok {
				r.Answers[idx] = strings.TrimSpace(answersForAttempt[col.QuestionID])
			}
			if statesForAttempt, ok := answerStateByAttemptQuestion[a.AttemptID]; ok {
				r.AnswerStates[idx] = strings.TrimSpace(statesForAttempt[col.QuestionID])
			}
		}
		resultRows = append(resultRows, r)
	}

	sort.SliceStable(resultRows, func(i, j int) bool {
		if resultRows[i].AttemptKe != resultRows[j].AttemptKe {
			return resultRows[i].AttemptKe < resultRows[j].AttemptKe
		}
		if resultRows[i].FullName != resultRows[j].FullName {
			return resultRows[i].FullName < resultRows[j].FullName
		}
		return resultRows[i].AttemptID < resultRows[j].AttemptID
	})

	return &ExamParticipantResult{
		ExamID:      examID,
		QuestionNos: questionNos,
		AnswerKeys:  answerKeys,
		TotalWeight: totalWeight,
		Limit:       limit,
		Offset:      offset,
		TotalRows:   totalRows,
		Filters:     filters,
		Rows:        resultRows,
	}, nil
}

func (s *Service) ListExamLearningGoalResults(ctx context.Context, examID int64, attemptFilter *int, classFilter *string) (*LearningGoalAchievementResult, error) {
	if examID <= 0 {
		return nil, ErrInvalidInput
	}
	if err := s.ensureProktorExamScope(ctx, examID); err != nil {
		return nil, err
	}
	if err := s.finalizeExpiredAttemptsForExam(ctx, examID); err != nil {
		return nil, err
	}

	out := &LearningGoalAchievementResult{ExamID: examID}
	if attemptFilter != nil {
		v := *attemptFilter
		out.AttemptFilter = &v
	}
	if classFilter != nil {
		v := strings.TrimSpace(*classFilter)
		if v != "" {
			out.ClassFilter = &v
		}
	}

	var (
		examExists bool
		kktp       float64
	)
	if err := s.db.QueryRowContext(ctx, `
		SELECT EXISTS(SELECT 1 FROM exams WHERE id = $1), COALESCE((SELECT kktp FROM exams WHERE id = $1), 70)
	`, examID).Scan(&examExists, &kktp); err != nil {
		return nil, fmt.Errorf("check exam exists for learning goal results: %w", err)
	}
	if !examExists {
		return nil, ErrExamNotFound
	}
	out.KKTP = normalizeKKTP(kktp)

	type questionMeta struct {
		QuestionID         int64
		LearningGoalID     *int64
		LearningGoalText   string
		LearningGoalMateri string
		Weight             float64
	}
	questions := make([]questionMeta, 0)
	rows, err := s.db.QueryContext(ctx, `
		SELECT
			eq.question_id,
			q.learning_goal_id,
			COALESCE(lg.tujuan_pembelajaran, ''),
			COALESCE(lg.materi, ''),
			eq.weight
		FROM exam_questions eq
		JOIN questions q ON q.id = eq.question_id
		LEFT JOIN learning_goals lg ON lg.id = q.learning_goal_id
		WHERE eq.exam_id = $1
		ORDER BY eq.seq_no ASC
	`, examID)
	if err != nil {
		return nil, fmt.Errorf("list exam questions for learning goal results: %w", err)
	}
	for rows.Next() {
		var (
			it       questionMeta
			goalID   sql.NullInt64
			goalText sql.NullString
			materi   sql.NullString
		)
		if err := rows.Scan(&it.QuestionID, &goalID, &goalText, &materi, &it.Weight); err != nil {
			_ = rows.Close()
			return nil, fmt.Errorf("scan exam question for learning goal results: %w", err)
		}
		if goalID.Valid {
			it.LearningGoalID = &goalID.Int64
		}
		if goalText.Valid {
			it.LearningGoalText = strings.TrimSpace(goalText.String)
		}
		if materi.Valid {
			it.LearningGoalMateri = strings.TrimSpace(materi.String)
		}
		if it.LearningGoalText == "" {
			it.LearningGoalText = "Tanpa TP"
		}
		questions = append(questions, it)
	}
	if err := rows.Err(); err != nil {
		_ = rows.Close()
		return nil, fmt.Errorf("iterate exam questions for learning goal results: %w", err)
	}
	_ = rows.Close()

	type goalAccumulator struct {
		item          LearningGoalAchievementItem
		seenQuestions map[int64]struct{}
	}
	goalByKey := make(map[string]*goalAccumulator)
	goalOrder := make([]string, 0)
	questionGoalKey := make(map[int64]string, len(questions))
	for _, q := range questions {
		key := "none"
		var goalIDCopy *int64
		if q.LearningGoalID != nil {
			key = strconv.FormatInt(*q.LearningGoalID, 10)
			idv := *q.LearningGoalID
			goalIDCopy = &idv
		}
		acc, ok := goalByKey[key]
		if !ok {
			acc = &goalAccumulator{
				item: LearningGoalAchievementItem{
					LearningGoalID:     goalIDCopy,
					LearningGoalText:   q.LearningGoalText,
					LearningGoalMateri: q.LearningGoalMateri,
				},
				seenQuestions: make(map[int64]struct{}),
			}
			goalByKey[key] = acc
			goalOrder = append(goalOrder, key)
		}
		if _, seen := acc.seenQuestions[q.QuestionID]; !seen {
			acc.seenQuestions[q.QuestionID] = struct{}{}
			acc.item.QuestionCount++
			acc.item.TotalWeight += q.Weight
		}
		questionGoalKey[q.QuestionID] = key
	}

	type attemptRowLite struct {
		AttemptID int64
		StudentID int64
		FullName  string
		ClassName *string
		AttemptKe int
	}
	user, isProktor := currentScopedProktor(ctx)
	rows, err = s.db.QueryContext(ctx, fmt.Sprintf(`
		SELECT
			a.id,
			u.id,
			u.full_name,
			enr.class_name
		FROM attempts a
		JOIN users u ON u.id = a.student_id
		LEFT JOIN LATERAL (
			SELECT c.name AS class_name
			FROM enrollments e
			JOIN classes c ON c.id = e.class_id
			WHERE e.user_id = u.id
			  AND e.status = 'active'
			ORDER BY e.enrolled_at DESC, e.id DESC
			LIMIT 1
		) enr ON TRUE
		WHERE a.exam_id = $1
		  AND u.role = 'siswa'
		  AND ($2 = 0 OR %s)
		ORDER BY a.started_at ASC, a.id ASC
	`, proktorStudentScopeClause("u.id", "$2")), examID, func() int64 {
		if isProktor {
			return user.ID
		}
		return 0
	}())
	if err != nil {
		return nil, fmt.Errorf("list attempts for learning goal results: %w", err)
	}
	attemptCountByStudent := map[int64]int{}
	selectedAttemptIDs := make([]int64, 0)
	selectedAttempts := make([]attemptRowLite, 0)
	for rows.Next() {
		var (
			it        attemptRowLite
			className sql.NullString
		)
		if err := rows.Scan(&it.AttemptID, &it.StudentID, &it.FullName, &className); err != nil {
			_ = rows.Close()
			return nil, fmt.Errorf("scan attempts for learning goal results: %w", err)
		}
		if className.Valid {
			it.ClassName = &className.String
		}
		attemptCountByStudent[it.StudentID]++
		it.AttemptKe = attemptCountByStudent[it.StudentID]
		if attemptFilter != nil && it.AttemptKe != *attemptFilter {
			continue
		}
		if out.ClassFilter != nil {
			currentClass := strings.TrimSpace(func() string {
				if it.ClassName == nil {
					return ""
				}
				return *it.ClassName
			}())
			if currentClass != *out.ClassFilter {
				continue
			}
		}
		selectedAttemptIDs = append(selectedAttemptIDs, it.AttemptID)
		selectedAttempts = append(selectedAttempts, it)
	}
	if err := rows.Err(); err != nil {
		_ = rows.Close()
		return nil, fmt.Errorf("iterate attempts for learning goal results: %w", err)
	}
	_ = rows.Close()

	out.TotalStudents = len(selectedAttempts)
	if len(goalOrder) == 0 {
		return out, nil
	}

	scoreByAttemptQuestion := make(map[int64]map[int64]float64)
	if len(selectedAttemptIDs) > 0 {
		rows, err = s.db.QueryContext(ctx, `
			SELECT s.attempt_id, s.question_id, s.earned_score
			FROM attempt_scores s
			WHERE s.attempt_id = ANY($1)
		`, pq.Array(selectedAttemptIDs))
		if err != nil {
			return nil, fmt.Errorf("list attempt scores for learning goal results: %w", err)
		}
		for rows.Next() {
			var (
				attemptID  int64
				questionID int64
				earned     float64
			)
			if err := rows.Scan(&attemptID, &questionID, &earned); err != nil {
				_ = rows.Close()
				return nil, fmt.Errorf("scan attempt scores for learning goal results: %w", err)
			}
			if _, ok := scoreByAttemptQuestion[attemptID]; !ok {
				scoreByAttemptQuestion[attemptID] = make(map[int64]float64)
			}
			scoreByAttemptQuestion[attemptID][questionID] = earned
		}
		if err := rows.Err(); err != nil {
			_ = rows.Close()
			return nil, fmt.Errorf("iterate attempt scores for learning goal results: %w", err)
		}
		_ = rows.Close()
	}

	type studentAccumulator struct {
		LearningGoalAchievementStudent
	}
	studentByGoalAttempt := make(map[string]map[int64]*studentAccumulator)
	for _, key := range goalOrder {
		studentByGoalAttempt[key] = make(map[int64]*studentAccumulator)
	}

	for _, attempt := range selectedAttempts {
		for _, q := range questions {
			key := questionGoalKey[q.QuestionID]
			acc := studentByGoalAttempt[key][attempt.AttemptID]
			if acc == nil {
				acc = &studentAccumulator{
					LearningGoalAchievementStudent: LearningGoalAchievementStudent{
						UserID:    attempt.StudentID,
						FullName:  attempt.FullName,
						ClassName: attempt.ClassName,
						AttemptID: attempt.AttemptID,
						AttemptKe: attempt.AttemptKe,
					},
				}
				studentByGoalAttempt[key][attempt.AttemptID] = acc
			}
			acc.TotalWeight += q.Weight
			if scoreByAttemptQuestion[attempt.AttemptID] != nil {
				acc.EarnedWeight += scoreByAttemptQuestion[attempt.AttemptID][q.QuestionID]
			}
		}
	}

	items := make([]LearningGoalAchievementItem, 0, len(goalOrder))
	for _, key := range goalOrder {
		acc := goalByKey[key]
		item := acc.item
		students := make([]LearningGoalAchievementStudent, 0, len(studentByGoalAttempt[key]))
		sumPercent := 0.0
		for _, studentAcc := range studentByGoalAttempt[key] {
			if studentAcc.TotalWeight > 0 {
				studentAcc.Percent = (studentAcc.EarnedWeight / studentAcc.TotalWeight) * 100
			}
			studentAcc.Achieved = studentAcc.Percent >= out.KKTP
			if studentAcc.Achieved {
				item.AchievedStudentCount++
			}
			sumPercent += studentAcc.Percent
			students = append(students, studentAcc.LearningGoalAchievementStudent)
		}
		sort.Slice(students, func(i, j int) bool {
			if students[i].FullName == students[j].FullName {
				return students[i].AttemptKe < students[j].AttemptKe
			}
			return students[i].FullName < students[j].FullName
		})
		item.Students = students
		item.StudentCount = len(students)
		if item.StudentCount > 0 {
			item.AveragePercent = sumPercent / float64(item.StudentCount)
		}
		item.Achieved = item.AveragePercent >= out.KKTP
		if item.Achieved {
			out.AchievedGoals++
		}
		items = append(items, item)
	}

	sort.Slice(items, func(i, j int) bool {
		return strings.ToLower(items[i].LearningGoalText) < strings.ToLower(items[j].LearningGoalText)
	})
	out.Items = items
	out.TotalGoals = len(items)
	out.UnachievedGoals = out.TotalGoals - out.AchievedGoals
	return out, nil
}

func (s *Service) GetAttemptLearningGoalResult(ctx context.Context, attemptID int64) (*AttemptLearningGoalResult, error) {
	if attemptID <= 0 {
		return nil, ErrInvalidInput
	}

	row, err := s.loadAttemptRow(ctx, s.db, attemptID)
	if err != nil {
		return nil, err
	}

	if row.Status == "in_progress" {
		if time.Now().After(row.ExpiresAt) {
			if _, err := s.finalizeAttempt(ctx, attemptID, "expired"); err != nil {
				return nil, err
			}
			row, err = s.loadAttemptRow(ctx, s.db, attemptID)
			if err != nil {
				return nil, err
			}
		} else {
			return nil, ErrAttemptNotFinal
		}
	}

	reviewPolicy, examEndAt, err := s.loadExamReviewPolicy(ctx, row.ExamID)
	if err != nil {
		return nil, err
	}
	policy := normalizeReviewPolicy(reviewPolicy)
	if !canViewResultByPolicy(policy, row.Status, examEndAt) {
		return nil, ErrResultPolicyDenied
	}

	out := &AttemptLearningGoalResult{
		AttemptID: attemptID,
		ExamID:    row.ExamID,
	}

	if err := s.db.QueryRowContext(ctx, `
		SELECT COALESCE(kktp, 70)
		FROM exams
		WHERE id = $1
	`, row.ExamID).Scan(&out.KKTP); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrExamNotFound
		}
		return nil, fmt.Errorf("load exam kktp for attempt learning goal result: %w", err)
	}
	out.KKTP = normalizeKKTP(out.KKTP)

	rows, err := s.db.QueryContext(ctx, `
		SELECT
			q.learning_goal_id,
			COALESCE(lg.tujuan_pembelajaran, ''),
			COALESCE(lg.materi, ''),
			eq.weight,
			COALESCE(s.earned_score, 0)
		FROM exam_questions eq
		JOIN questions q ON q.id = eq.question_id
		LEFT JOIN learning_goals lg ON lg.id = q.learning_goal_id
		LEFT JOIN attempt_scores s
			ON s.attempt_id = $2
		   AND s.question_id = eq.question_id
		WHERE eq.exam_id = $1
		ORDER BY eq.seq_no ASC
	`, row.ExamID, attemptID)
	if err != nil {
		return nil, fmt.Errorf("list attempt learning goal rows: %w", err)
	}
	defer rows.Close()

	itemByKey := make(map[string]*AttemptLearningGoalItem)
	order := make([]string, 0)
	for rows.Next() {
		var (
			goalID   sql.NullInt64
			goalText string
			materi   string
			weight   float64
			earned   float64
		)
		if err := rows.Scan(&goalID, &goalText, &materi, &weight, &earned); err != nil {
			return nil, fmt.Errorf("scan attempt learning goal row: %w", err)
		}
		goalText = strings.TrimSpace(goalText)
		materi = strings.TrimSpace(materi)
		key := "none"
		var goalIDCopy *int64
		if goalID.Valid {
			idv := goalID.Int64
			goalIDCopy = &idv
			key = strconv.FormatInt(idv, 10)
		}
		if goalText == "" {
			goalText = "Tanpa TP"
		}
		item := itemByKey[key]
		if item == nil {
			item = &AttemptLearningGoalItem{
				LearningGoalID:     goalIDCopy,
				LearningGoalText:   goalText,
				LearningGoalMateri: materi,
			}
			itemByKey[key] = item
			order = append(order, key)
		}
		item.TotalWeight += weight
		item.EarnedWeight += earned
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate attempt learning goal rows: %w", err)
	}

	items := make([]AttemptLearningGoalItem, 0, len(order))
	for _, key := range order {
		item := itemByKey[key]
		if item.TotalWeight > 0 {
			item.Percent = (item.EarnedWeight / item.TotalWeight) * 100
		}
		item.Achieved = item.Percent >= out.KKTP
		items = append(items, *item)
	}
	sort.Slice(items, func(i, j int) bool {
		return strings.ToLower(items[i].LearningGoalText) < strings.ToLower(items[j].LearningGoalText)
	})
	out.Items = items
	return out, nil
}

func (s *Service) GetAttemptStudentSchoolInfo(ctx context.Context, attemptID int64) (*AttemptStudentSchoolInfo, error) {
	if attemptID <= 0 {
		return nil, ErrInvalidInput
	}

	var out AttemptStudentSchoolInfo
	if err := s.db.QueryRowContext(ctx, `
		SELECT
			a.id,
			a.exam_id,
			COALESCE(s.name, ''),
			COALESCE(s.city, '')
		FROM attempts a
		JOIN users u ON u.id = a.student_id
		LEFT JOIN LATERAL (
			SELECT e.school_id
			FROM enrollments e
			WHERE e.user_id = u.id
			  AND e.status = 'active'
			ORDER BY e.enrolled_at DESC, e.id DESC
			LIMIT 1
		) enr ON TRUE
		LEFT JOIN schools s ON s.id = enr.school_id
		WHERE a.id = $1
	`, attemptID).Scan(&out.AttemptID, &out.ExamID, &out.SchoolName, &out.SchoolCity); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrAttemptNotFound
		}
		return nil, fmt.Errorf("load attempt student school info: %w", err)
	}
	return &out, nil
}

func (s *Service) ensureExamQuestionSeqNoContiguous(ctx context.Context, examID int64) error {
	if examID <= 0 {
		return ErrInvalidInput
	}
	var minSeq int64
	var maxSeq int64
	var total int64
	if err := s.db.QueryRowContext(ctx, `
		SELECT COALESCE(MIN(seq_no), 0), COALESCE(MAX(seq_no), 0), COUNT(*)
		FROM exam_questions
		WHERE exam_id = $1
	`, examID).Scan(&minSeq, &maxSeq, &total); err != nil {
		return fmt.Errorf("check exam question seq no: %w", err)
	}
	if total == 0 {
		return nil
	}
	if minSeq == 1 && maxSeq == total {
		return nil
	}

	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("begin renumber exam questions tx: %w", err)
	}
	defer func() { _ = tx.Rollback() }()

	if _, err := tx.ExecContext(ctx, `
		WITH ordered AS (
			SELECT question_id, ROW_NUMBER() OVER (ORDER BY seq_no ASC, question_id ASC) AS new_seq
			FROM exam_questions
			WHERE exam_id = $1
		)
		UPDATE exam_questions eq
		SET seq_no = -ordered.new_seq
		FROM ordered
		WHERE eq.exam_id = $1
		  AND eq.question_id = ordered.question_id
	`, examID); err != nil {
		return fmt.Errorf("renumber exam questions temp: %w", err)
	}

	if _, err := tx.ExecContext(ctx, `
		UPDATE exam_questions
		SET seq_no = -seq_no
		WHERE exam_id = $1
		  AND seq_no < 0
	`, examID); err != nil {
		return fmt.Errorf("renumber exam questions finalize: %w", err)
	}

	if err := tx.Commit(); err != nil {
		return fmt.Errorf("commit renumber exam questions: %w", err)
	}
	return nil
}

func (s *Service) loadExamParticipantResultFilters(ctx context.Context, examID int64, scopeUserID int64) (*ExamParticipantResultFilters, error) {
	if examID <= 0 {
		return nil, ErrInvalidInput
	}

	attemptBaseSQL := fmt.Sprintf(`
		WITH attempt_base AS (
			SELECT
				a.id,
				u.id AS student_id,
				enr.school_name,
				enr.class_name,
				ROW_NUMBER() OVER (PARTITION BY a.student_id ORDER BY a.started_at ASC, a.id ASC) AS attempt_ke
			FROM attempts a
			JOIN users u ON u.id = a.student_id
			LEFT JOIN LATERAL (
				SELECT
					s.name AS school_name,
					c.name AS class_name
				FROM enrollments e
				JOIN classes c ON c.id = e.class_id
				JOIN schools s ON s.id = e.school_id
				WHERE e.user_id = u.id
				  AND e.status = 'active'
				ORDER BY e.enrolled_at DESC, e.id DESC
				LIMIT 1
			) enr ON TRUE
			WHERE a.exam_id = $1
			  AND u.role = 'siswa'
			  AND ($2 = 0 OR %s)
		)
	`, proktorStudentScopeClause("u.id", "$2"))

	var maxAttempt int
	if err := s.db.QueryRowContext(ctx, attemptBaseSQL+`SELECT COALESCE(MAX(attempt_ke), 0) FROM attempt_base`, examID, scopeUserID).Scan(&maxAttempt); err != nil {
		return nil, fmt.Errorf("load result filter attempts: %w", err)
	}

	classRows, err := s.db.QueryContext(ctx, attemptBaseSQL+`
		SELECT DISTINCT class_name
		FROM attempt_base
		WHERE class_name IS NOT NULL
		  AND btrim(class_name) <> ''
		ORDER BY class_name ASC
	`, examID, scopeUserID)
	if err != nil {
		return nil, fmt.Errorf("load result filter classes: %w", err)
	}
	classes := make([]string, 0)
	for classRows.Next() {
		var name string
		if err := classRows.Scan(&name); err != nil {
			_ = classRows.Close()
			return nil, fmt.Errorf("scan result filter class: %w", err)
		}
		classes = append(classes, name)
	}
	if err := classRows.Err(); err != nil {
		_ = classRows.Close()
		return nil, fmt.Errorf("iterate result filter classes: %w", err)
	}
	_ = classRows.Close()

	schoolRows, err := s.db.QueryContext(ctx, attemptBaseSQL+`
		SELECT DISTINCT school_name
		FROM attempt_base
		WHERE school_name IS NOT NULL
		  AND btrim(school_name) <> ''
		ORDER BY school_name ASC
	`, examID, scopeUserID)
	if err != nil {
		return nil, fmt.Errorf("load result filter schools: %w", err)
	}
	schools := make([]string, 0)
	for schoolRows.Next() {
		var name string
		if err := schoolRows.Scan(&name); err != nil {
			_ = schoolRows.Close()
			return nil, fmt.Errorf("scan result filter school: %w", err)
		}
		schools = append(schools, name)
	}
	if err := schoolRows.Err(); err != nil {
		_ = schoolRows.Close()
		return nil, fmt.Errorf("iterate result filter schools: %w", err)
	}
	_ = schoolRows.Close()

	attempts := make([]int, 0)
	for i := 1; i <= maxAttempt; i++ {
		attempts = append(attempts, i)
	}
	return &ExamParticipantResultFilters{
		Attempts: attempts,
		Classes:  classes,
		Schools:  schools,
	}, nil
}

func buildResultFilterClause(attemptFilter *int, classFilter, schoolFilter *string, startIndex int) string {
	parts := make([]string, 0, 3)
	idx := startIndex
	if attemptFilter != nil {
		parts = append(parts, fmt.Sprintf("attempt_ke = $%d", idx))
		idx++
	}
	if classFilter != nil {
		parts = append(parts, fmt.Sprintf("class_name = $%d", idx))
		idx++
	}
	if schoolFilter != nil {
		parts = append(parts, fmt.Sprintf("school_name = $%d", idx))
		idx++
	}
	if len(parts) == 0 {
		return ""
	}
	return "WHERE " + strings.Join(parts, " AND ")
}

func buildResultFilterArgs(examID int64, scopeUserID int64, attemptFilter *int, classFilter, schoolFilter *string) []any {
	args := []any{examID, scopeUserID}
	if attemptFilter != nil {
		args = append(args, *attemptFilter)
	}
	if classFilter != nil {
		args = append(args, *classFilter)
	}
	if schoolFilter != nil {
		args = append(args, *schoolFilter)
	}
	return args
}

func (s *Service) ReplaceExamAssignments(ctx context.Context, in ReplaceExamAssignmentsInput) ([]ExamAssignmentUser, error) {
	if in.ExamID <= 0 || in.AssignedBy <= 0 {
		return nil, ErrInvalidInput
	}
	if _, err := s.GetExamAdminByID(ctx, in.ExamID); err != nil {
		return nil, err
	}

	ids := make([]int64, 0, len(in.UserIDs))
	seen := map[int64]struct{}{}
	for _, id := range in.UserIDs {
		if id <= 0 {
			continue
		}
		if _, ok := seen[id]; ok {
			continue
		}
		seen[id] = struct{}{}
		ids = append(ids, id)
	}
	for _, userID := range ids {
		if err := s.ensureProktorStudentScope(ctx, userID); err != nil {
			return nil, err
		}
	}

	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, fmt.Errorf("begin assignment tx: %w", err)
	}
	defer func() { _ = tx.Rollback() }()

	if _, err := tx.ExecContext(ctx, `
		UPDATE exam_assignments
		SET status = 'inactive',
			updated_at = now()
		WHERE exam_id = $1
	`, in.ExamID); err != nil {
		if isUndefinedTableErr(err, "exam_assignments") {
			return nil, ErrAssignmentFeature
		}
		return nil, fmt.Errorf("deactivate old exam assignments: %w", err)
	}

	for _, userID := range ids {
		var role string
		if err := tx.QueryRowContext(ctx, `
			SELECT role
			FROM users
			WHERE id = $1
			  AND is_active = TRUE
		`, userID).Scan(&role); err != nil {
			if errors.Is(err, sql.ErrNoRows) {
				continue
			}
			return nil, fmt.Errorf("load assignment user role: %w", err)
		}
		if role != "guru" && role != "siswa" {
			continue
		}
		if _, err := tx.ExecContext(ctx, `
			INSERT INTO exam_assignments (
				exam_id, user_id, status, assigned_by, assigned_at, created_at, updated_at
			) VALUES ($1, $2, 'active', $3, now(), now(), now())
			ON CONFLICT (exam_id, user_id)
			DO UPDATE SET
				status = 'active',
				assigned_by = EXCLUDED.assigned_by,
				assigned_at = now(),
				updated_at = now()
		`, in.ExamID, userID, in.AssignedBy); err != nil {
			return nil, fmt.Errorf("upsert exam assignment: %w", err)
		}
	}

	if err := tx.Commit(); err != nil {
		return nil, fmt.Errorf("commit assignment tx: %w", err)
	}
	return s.ListExamAssignments(ctx, in.ExamID)
}

func (s *Service) ReplaceExamAssignmentsByClass(ctx context.Context, in ReplaceExamAssignmentsByClassInput) ([]ExamAssignmentUser, error) {
	if in.ExamID <= 0 || in.SchoolID <= 0 || in.ClassID <= 0 || in.AssignedBy <= 0 {
		return nil, ErrInvalidInput
	}
	if _, err := s.GetExamAdminByID(ctx, in.ExamID); err != nil {
		return nil, err
	}
	if err := s.ensureProktorSchoolScope(ctx, in.SchoolID); err != nil {
		return nil, err
	}

	var classValid bool
	if err := s.db.QueryRowContext(ctx, `
		SELECT EXISTS(
			SELECT 1
			FROM classes c
			JOIN schools s ON s.id = c.school_id
			WHERE c.id = $1
			  AND c.school_id = $2
			  AND c.is_active = TRUE
			  AND s.is_active = TRUE
		)
	`, in.ClassID, in.SchoolID).Scan(&classValid); err != nil {
		return nil, fmt.Errorf("validate class for exam assignment: %w", err)
	}
	if !classValid {
		return nil, ErrInvalidInput
	}

	rows, err := s.db.QueryContext(ctx, `
		SELECT DISTINCT e.user_id
		FROM enrollments e
		JOIN users u ON u.id = e.user_id
		WHERE e.school_id = $1
		  AND e.class_id = $2
		  AND e.status = 'active'
		  AND u.is_active = TRUE
		  AND u.role = 'siswa'
		ORDER BY e.user_id
	`, in.SchoolID, in.ClassID)
	if err != nil {
		return nil, fmt.Errorf("list class users for exam assignment: %w", err)
	}
	defer rows.Close()

	userIDs := make([]int64, 0)
	for rows.Next() {
		var uid int64
		if err := rows.Scan(&uid); err != nil {
			return nil, fmt.Errorf("scan class user for exam assignment: %w", err)
		}
		userIDs = append(userIDs, uid)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate class users for exam assignment: %w", err)
	}

	return s.ReplaceExamAssignments(ctx, ReplaceExamAssignmentsInput{
		ExamID:     in.ExamID,
		UserIDs:    userIDs,
		AssignedBy: in.AssignedBy,
	})
}

func (s *Service) AppendExamAssignmentsByClass(ctx context.Context, in AppendExamAssignmentsByClassInput) ([]ExamAssignmentUser, error) {
	if in.ExamID <= 0 || in.SchoolID <= 0 || in.ClassID <= 0 || in.AssignedBy <= 0 {
		return nil, ErrInvalidInput
	}
	if _, err := s.GetExamAdminByID(ctx, in.ExamID); err != nil {
		return nil, err
	}
	if err := s.ensureProktorSchoolScope(ctx, in.SchoolID); err != nil {
		return nil, err
	}

	var classValid bool
	if err := s.db.QueryRowContext(ctx, `
		SELECT EXISTS(
			SELECT 1
			FROM classes c
			JOIN schools s ON s.id = c.school_id
			WHERE c.id = $1
			  AND c.school_id = $2
			  AND c.is_active = TRUE
			  AND s.is_active = TRUE
		)
	`, in.ClassID, in.SchoolID).Scan(&classValid); err != nil {
		return nil, fmt.Errorf("validate class for exam assignment: %w", err)
	}
	if !classValid {
		return nil, ErrInvalidInput
	}

	rows, err := s.db.QueryContext(ctx, `
		SELECT DISTINCT e.user_id
		FROM enrollments e
		JOIN users u ON u.id = e.user_id
		WHERE e.school_id = $1
		  AND e.class_id = $2
		  AND e.status = 'active'
		  AND u.is_active = TRUE
		  AND u.role = 'siswa'
		ORDER BY e.user_id
	`, in.SchoolID, in.ClassID)
	if err != nil {
		return nil, fmt.Errorf("list class users for exam assignment: %w", err)
	}
	defer rows.Close()

	userIDs := make([]int64, 0)
	for rows.Next() {
		var uid int64
		if err := rows.Scan(&uid); err != nil {
			return nil, fmt.Errorf("scan class user for exam assignment: %w", err)
		}
		userIDs = append(userIDs, uid)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate class users for exam assignment: %w", err)
	}

	for _, userID := range userIDs {
		var role string
		if err := s.db.QueryRowContext(ctx, `
			SELECT role
			FROM users
			WHERE id = $1
			  AND is_active = TRUE
		`, userID).Scan(&role); err != nil {
			if errors.Is(err, sql.ErrNoRows) {
				continue
			}
			return nil, fmt.Errorf("load assignment user role: %w", err)
		}
		if role != "guru" && role != "siswa" {
			continue
		}
		if _, err := s.db.ExecContext(ctx, `
			INSERT INTO exam_assignments (
				exam_id, user_id, status, assigned_by, assigned_at, created_at, updated_at
			) VALUES ($1, $2, 'active', $3, now(), now(), now())
			ON CONFLICT (exam_id, user_id)
			DO UPDATE SET
				status = 'active',
				assigned_by = EXCLUDED.assigned_by,
				assigned_at = now(),
				updated_at = now()
		`, in.ExamID, userID, in.AssignedBy); err != nil {
			return nil, fmt.Errorf("upsert exam assignment: %w", err)
		}
	}

	return s.ListExamAssignments(ctx, in.ExamID)
}

func (s *Service) RemoveExamAssignment(ctx context.Context, examID, userID, actorID int64) error {
	if examID <= 0 || userID <= 0 || actorID <= 0 {
		return ErrInvalidInput
	}
	if _, err := s.GetExamAdminByID(ctx, examID); err != nil {
		return err
	}
	if err := s.ensureProktorStudentScope(ctx, userID); err != nil {
		return err
	}
	if _, err := s.db.ExecContext(ctx, `
		UPDATE exam_assignments
		SET status = 'inactive',
			updated_at = now()
		WHERE exam_id = $1
		  AND user_id = $2
		  AND status = 'active'
	`, examID, userID); err != nil {
		if isUndefinedTableErr(err, "exam_assignments") {
			return ErrAssignmentFeature
		}
		return fmt.Errorf("deactivate exam assignment: %w", err)
	}
	return nil
}

func (s *Service) ListExamQuestions(ctx context.Context, examID int64) ([]ExamQuestionManageItem, error) {
	if examID <= 0 {
		return nil, ErrInvalidInput
	}
	if err := s.ensureProktorExamScope(ctx, examID); err != nil {
		return nil, err
	}
	rows, err := s.db.QueryContext(ctx, `
		SELECT
			eq.exam_id,
			eq.question_id,
			eq.seq_no,
			eq.weight,
			q.question_type,
			COALESCE(qc.code, '') AS question_code,
			COALESCE(qc.name, '') AS question_title,
			COALESCE(qv.stem_html, q.stem_html, '') AS stem_preview,
			q.subject_id,
			s.name AS subject_name,
			qv.version_no,
			qv.status
		FROM exam_questions eq
		JOIN questions q ON q.id = eq.question_id
		LEFT JOIN question_codes qc ON qc.id = q.question_code_id
		JOIN subjects s ON s.id = q.subject_id
		LEFT JOIN LATERAL (
			SELECT version_no, stem_html, status
			FROM question_versions
			WHERE question_id = q.id
			  AND is_active = TRUE
			ORDER BY version_no DESC
			LIMIT 1
		) qv ON TRUE
		WHERE eq.exam_id = $1
		ORDER BY eq.seq_no ASC
	`, examID)
	if err != nil {
		return nil, fmt.Errorf("list exam questions: %w", err)
	}
	defer rows.Close()
	items := make([]ExamQuestionManageItem, 0)
	for rows.Next() {
		var it ExamQuestionManageItem
		var versionNo sql.NullInt64
		var versionStatus sql.NullString
		if err := rows.Scan(
			&it.ExamID,
			&it.QuestionID,
			&it.SeqNo,
			&it.Weight,
			&it.QuestionType,
			&it.QuestionCode,
			&it.QuestionTitle,
			&it.StemPreview,
			&it.SubjectID,
			&it.SubjectName,
			&versionNo,
			&versionStatus,
		); err != nil {
			return nil, fmt.Errorf("scan exam question: %w", err)
		}
		if versionNo.Valid {
			v := int(versionNo.Int64)
			it.VersionNo = &v
		}
		if versionStatus.Valid {
			it.VersionStatus = &versionStatus.String
		}
		items = append(items, it)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate exam questions: %w", err)
	}
	return items, nil
}

func (s *Service) ListExamQuestionCodeRules(ctx context.Context, examID int64) ([]ExamQuestionCodeRule, error) {
	if examID <= 0 {
		return nil, ErrInvalidInput
	}
	if err := s.ensureProktorExamScope(ctx, examID); err != nil {
		return nil, err
	}
	rows, err := s.db.QueryContext(ctx, `
		SELECT
			r.exam_id,
			r.question_code_id,
			qc.code,
			qc.name,
			qc.subject_id,
			r.strategy,
			r.pick_count,
			r.weight,
			r.is_active
		FROM exam_question_code_rules r
		JOIN question_codes qc ON qc.id = r.question_code_id
		WHERE r.exam_id = $1
		  AND r.is_active = TRUE
		ORDER BY qc.code ASC, r.question_code_id ASC
	`, examID)
	if err != nil {
		return nil, fmt.Errorf("list exam question code rules: %w", err)
	}
	defer rows.Close()

	items := make([]ExamQuestionCodeRule, 0)
	for rows.Next() {
		var out ExamQuestionCodeRule
		var pickCount sql.NullInt64
		if err := rows.Scan(
			&out.ExamID,
			&out.QuestionCodeID,
			&out.QuestionCode,
			&out.QuestionCodeName,
			&out.SubjectID,
			&out.Strategy,
			&pickCount,
			&out.Weight,
			&out.IsActive,
		); err != nil {
			return nil, fmt.Errorf("scan exam question code rule: %w", err)
		}
		if pickCount.Valid {
			v := int(pickCount.Int64)
			out.PickCount = &v
		}
		items = append(items, out)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate exam question code rules: %w", err)
	}
	return items, nil
}

func (s *Service) UpsertExamQuestionCodeRule(ctx context.Context, in UpsertExamQuestionCodeRuleInput) (*ExamQuestionCodeRule, error) {
	if in.ExamID <= 0 || in.QuestionCodeID <= 0 {
		return nil, ErrInvalidInput
	}
	if err := s.ensureProktorExamScope(ctx, in.ExamID); err != nil {
		return nil, err
	}
	if in.Weight <= 0 {
		in.Weight = 1
	}
	strategy := normalizeExamQuestionCodeStrategy(in.Strategy)
	if strategy == "" {
		return nil, ErrInvalidInput
	}
	if strategy == "random" {
		if in.PickCount == nil || *in.PickCount <= 0 {
			return nil, ErrInvalidInput
		}
	} else {
		in.PickCount = nil
	}

	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, fmt.Errorf("begin upsert exam question code rule tx: %w", err)
	}
	defer func() { _ = tx.Rollback() }()

	var examSubjectID int64
	if err := tx.QueryRowContext(ctx, `
		SELECT subject_id
		FROM exams
		WHERE id = $1
	`, in.ExamID).Scan(&examSubjectID); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrExamNotFound
		}
		return nil, fmt.Errorf("load exam subject for code rule: %w", err)
	}

	var codeSubjectID int64
	if err := tx.QueryRowContext(ctx, `
		SELECT subject_id
		FROM question_codes
		WHERE id = $1
		  AND is_active = TRUE
	`, in.QuestionCodeID).Scan(&codeSubjectID); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrInvalidInput
		}
		return nil, fmt.Errorf("load question code for exam rule: %w", err)
	}
	if codeSubjectID != examSubjectID {
		return nil, ErrInvalidInput
	}

	if _, err := tx.ExecContext(ctx, `
		INSERT INTO exam_question_code_rules (
			exam_id, question_code_id, strategy, pick_count, weight, is_active, created_by, created_at, updated_at
		) VALUES (
			$1, $2, $3, $4, $5, TRUE, NULLIF($6, 0), now(), now()
		)
		ON CONFLICT (exam_id, question_code_id)
		DO UPDATE SET
			strategy = EXCLUDED.strategy,
			pick_count = EXCLUDED.pick_count,
			weight = EXCLUDED.weight,
			is_active = TRUE,
			updated_at = now()
	`, in.ExamID, in.QuestionCodeID, strategy, nullIntPtr(in.PickCount), in.Weight, in.CreatedBy); err != nil {
		return nil, fmt.Errorf("upsert exam question code rule: %w", err)
	}

	var out ExamQuestionCodeRule
	var pickCount sql.NullInt64
	if err := tx.QueryRowContext(ctx, `
		SELECT
			r.exam_id,
			r.question_code_id,
			qc.code,
			qc.name,
			qc.subject_id,
			r.strategy,
			r.pick_count,
			r.weight,
			r.is_active
		FROM exam_question_code_rules r
		JOIN question_codes qc ON qc.id = r.question_code_id
		WHERE r.exam_id = $1
		  AND r.question_code_id = $2
	`, in.ExamID, in.QuestionCodeID).Scan(
		&out.ExamID,
		&out.QuestionCodeID,
		&out.QuestionCode,
		&out.QuestionCodeName,
		&out.SubjectID,
		&out.Strategy,
		&pickCount,
		&out.Weight,
		&out.IsActive,
	); err != nil {
		return nil, fmt.Errorf("reload exam question code rule: %w", err)
	}
	if pickCount.Valid {
		v := int(pickCount.Int64)
		out.PickCount = &v
	}

	if err := tx.Commit(); err != nil {
		return nil, fmt.Errorf("commit upsert exam question code rule tx: %w", err)
	}
	return &out, nil
}

func (s *Service) DeleteExamQuestionCodeRule(ctx context.Context, examID, questionCodeID int64) error {
	if examID <= 0 || questionCodeID <= 0 {
		return ErrInvalidInput
	}
	if err := s.ensureProktorExamScope(ctx, examID); err != nil {
		return err
	}
	var deletedExamID int64
	if err := s.db.QueryRowContext(ctx, `
		UPDATE exam_question_code_rules
		SET is_active = FALSE,
			updated_at = now()
		WHERE exam_id = $1
		  AND question_code_id = $2
		  AND is_active = TRUE
		RETURNING exam_id
	`, examID, questionCodeID).Scan(&deletedExamID); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return ErrQuestionCodeRuleNotFound
		}
		return fmt.Errorf("delete exam question code rule: %w", err)
	}
	return nil
}

func (s *Service) SyncExamQuestionsByCode(ctx context.Context, in SyncExamQuestionsByCodeInput) (*SyncExamQuestionsByCodeResult, error) {
	if in.ExamID <= 0 {
		return nil, ErrInvalidInput
	}
	if err := s.ensureProktorExamScope(ctx, in.ExamID); err != nil {
		return nil, err
	}

	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, fmt.Errorf("begin sync exam questions by code tx: %w", err)
	}
	defer func() { _ = tx.Rollback() }()

	var examSubjectID int64
	if err := tx.QueryRowContext(ctx, `
		SELECT subject_id
		FROM exams
		WHERE id = $1
	`, in.ExamID).Scan(&examSubjectID); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrExamNotFound
		}
		return nil, fmt.Errorf("load exam for sync by code: %w", err)
	}

	ruleRows, err := tx.QueryContext(ctx, `
		SELECT question_code_id, strategy, pick_count, weight
		FROM exam_question_code_rules
		WHERE exam_id = $1
		  AND is_active = TRUE
		ORDER BY question_code_id ASC
	`, in.ExamID)
	if err != nil {
		return nil, fmt.Errorf("list rules for sync by code: %w", err)
	}
	defer ruleRows.Close()

	type rule struct {
		QuestionCodeID int64
		Strategy       string
		PickCount      *int
		Weight         float64
	}
	rules := make([]rule, 0)
	for ruleRows.Next() {
		var it rule
		var pickCount sql.NullInt64
		if err := ruleRows.Scan(&it.QuestionCodeID, &it.Strategy, &pickCount, &it.Weight); err != nil {
			return nil, fmt.Errorf("scan rule for sync by code: %w", err)
		}
		if pickCount.Valid {
			v := int(pickCount.Int64)
			it.PickCount = &v
		}
		rules = append(rules, it)
	}
	if err := ruleRows.Err(); err != nil {
		return nil, fmt.Errorf("iterate rules for sync by code: %w", err)
	}

	type selectedQuestion struct {
		QuestionID int64
		Weight     float64
	}
	selected := make([]selectedQuestion, 0)
	seenQuestion := map[int64]struct{}{}
	for _, rl := range rules {
		if rl.Strategy == "all" {
			rows, err := tx.QueryContext(ctx, `
				SELECT q.id
				FROM questions q
				WHERE q.question_code_id = $1
				  AND q.subject_id = $2
				  AND q.is_active = TRUE
				ORDER BY q.id ASC
			`, rl.QuestionCodeID, examSubjectID)
			if err != nil {
				return nil, fmt.Errorf("list questions by code (all): %w", err)
			}
			for rows.Next() {
				var qid int64
				if err := rows.Scan(&qid); err != nil {
					_ = rows.Close()
					return nil, fmt.Errorf("scan question by code (all): %w", err)
				}
				if _, exists := seenQuestion[qid]; exists {
					continue
				}
				seenQuestion[qid] = struct{}{}
				selected = append(selected, selectedQuestion{QuestionID: qid, Weight: rl.Weight})
			}
			if err := rows.Err(); err != nil {
				_ = rows.Close()
				return nil, fmt.Errorf("iterate questions by code (all): %w", err)
			}
			_ = rows.Close()
			continue
		}

		pickCount := 0
		if rl.PickCount != nil {
			pickCount = *rl.PickCount
		}
		if pickCount <= 0 {
			continue
		}
		rows, err := tx.QueryContext(ctx, `
			SELECT q.id
			FROM questions q
			WHERE q.question_code_id = $1
			  AND q.subject_id = $2
			  AND q.is_active = TRUE
			ORDER BY random()
			LIMIT $3
		`, rl.QuestionCodeID, examSubjectID, pickCount)
		if err != nil {
			return nil, fmt.Errorf("list questions by code (random): %w", err)
		}
		for rows.Next() {
			var qid int64
			if err := rows.Scan(&qid); err != nil {
				_ = rows.Close()
				return nil, fmt.Errorf("scan question by code (random): %w", err)
			}
			if _, exists := seenQuestion[qid]; exists {
				continue
			}
			seenQuestion[qid] = struct{}{}
			selected = append(selected, selectedQuestion{QuestionID: qid, Weight: rl.Weight})
		}
		if err := rows.Err(); err != nil {
			_ = rows.Close()
			return nil, fmt.Errorf("iterate questions by code (random): %w", err)
		}
		_ = rows.Close()
	}

	if _, err := tx.ExecContext(ctx, `
		DELETE FROM exam_questions
		WHERE exam_id = $1
	`, in.ExamID); err != nil {
		return nil, fmt.Errorf("clear exam questions on sync by code: %w", err)
	}

	for idx, it := range selected {
		if _, err := tx.ExecContext(ctx, `
			INSERT INTO exam_questions (exam_id, question_id, seq_no, weight)
			VALUES ($1, $2, $3, $4)
		`, in.ExamID, it.QuestionID, idx+1, it.Weight); err != nil {
			return nil, fmt.Errorf("insert synced exam question by code: %w", err)
		}
	}

	if err := tx.Commit(); err != nil {
		return nil, fmt.Errorf("commit sync exam questions by code tx: %w", err)
	}

	return &SyncExamQuestionsByCodeResult{
		ExamID:        in.ExamID,
		RuleCount:     len(rules),
		SelectedCount: len(selected),
		InsertedCount: len(selected),
	}, nil
}

func (s *Service) UpsertExamQuestion(ctx context.Context, in UpsertExamQuestionInput) (*ExamQuestionManageItem, error) {
	if in.ExamID <= 0 || in.QuestionID <= 0 {
		return nil, ErrInvalidInput
	}
	if err := s.ensureProktorExamScope(ctx, in.ExamID); err != nil {
		return nil, err
	}
	if in.Weight <= 0 {
		in.Weight = 1
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, fmt.Errorf("begin upsert exam question tx: %w", err)
	}
	defer func() { _ = tx.Rollback() }()

	var examExists bool
	if err := tx.QueryRowContext(ctx, `SELECT EXISTS(SELECT 1 FROM exams WHERE id = $1)`, in.ExamID).Scan(&examExists); err != nil {
		return nil, fmt.Errorf("check exam exists: %w", err)
	}
	if !examExists {
		return nil, ErrExamNotFound
	}
	var questionExists bool
	if err := tx.QueryRowContext(ctx, `SELECT EXISTS(SELECT 1 FROM questions WHERE id = $1)`, in.QuestionID).Scan(&questionExists); err != nil {
		return nil, fmt.Errorf("check question exists: %w", err)
	}
	if !questionExists {
		return nil, ErrQuestionNotInExam
	}

	seqNo := in.SeqNo
	if seqNo <= 0 {
		if err := tx.QueryRowContext(ctx, `
			SELECT COALESCE(MAX(seq_no), 0) + 1
			FROM exam_questions
			WHERE exam_id = $1
		`, in.ExamID).Scan(&seqNo); err != nil {
			return nil, fmt.Errorf("next seq_no exam question: %w", err)
		}
	}

	if _, err := tx.ExecContext(ctx, `
		INSERT INTO exam_questions (exam_id, question_id, seq_no, weight)
		VALUES ($1, $2, $3, $4)
		ON CONFLICT (exam_id, question_id)
		DO UPDATE SET
			seq_no = EXCLUDED.seq_no,
			weight = EXCLUDED.weight
	`, in.ExamID, in.QuestionID, seqNo, in.Weight); err != nil {
		return nil, fmt.Errorf("upsert exam question: %w", err)
	}

	if err := tx.Commit(); err != nil {
		return nil, fmt.Errorf("commit upsert exam question tx: %w", err)
	}

	items, err := s.ListExamQuestions(ctx, in.ExamID)
	if err != nil {
		return nil, err
	}
	for _, it := range items {
		if it.QuestionID == in.QuestionID {
			cloned := it
			return &cloned, nil
		}
	}
	return nil, ErrQuestionNotInExam
}

func (s *Service) DeleteExamQuestion(ctx context.Context, examID, questionID int64) error {
	if examID <= 0 || questionID <= 0 {
		return ErrInvalidInput
	}
	if err := s.ensureProktorExamScope(ctx, examID); err != nil {
		return err
	}
	res, err := s.db.ExecContext(ctx, `
		DELETE FROM exam_questions
		WHERE exam_id = $1
		  AND question_id = $2
	`, examID, questionID)
	if err != nil {
		return fmt.Errorf("delete exam question: %w", err)
	}
	affected, _ := res.RowsAffected()
	if affected == 0 {
		return ErrQuestionNotInExam
	}
	return nil
}

func (s *Service) UpsertExamQuestionIncident(ctx context.Context, in UpsertExamQuestionIncidentInput) (*ExamQuestionIncidentResult, error) {
	if in.ExamID <= 0 || in.QuestionID <= 0 || in.DecidedBy <= 0 {
		return nil, ErrInvalidInput
	}
	if err := s.ensureProktorExamScope(ctx, in.ExamID); err != nil {
		return nil, err
	}
	policy := normalizeIncidentPolicy(in.Policy)
	if policy == "" {
		return nil, ErrIncidentPolicyInvalid
	}
	in.Reason = strings.TrimSpace(in.Reason)
	if in.Reason == "" {
		return nil, ErrInvalidInput
	}

	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, fmt.Errorf("begin incident tx: %w", err)
	}
	defer func() { _ = tx.Rollback() }()

	var exists bool
	if err := tx.QueryRowContext(ctx, `
		SELECT EXISTS(
			SELECT 1
			FROM exam_questions
			WHERE exam_id = $1
			  AND question_id = $2
		)
	`, in.ExamID, in.QuestionID).Scan(&exists); err != nil {
		return nil, fmt.Errorf("validate incident question in exam: %w", err)
	}
	if !exists {
		return nil, ErrQuestionNotInExam
	}

	var out ExamQuestionIncidentResult
	var decidedBy sql.NullInt64
	var decidedAt sql.NullTime
	if err := tx.QueryRowContext(ctx, `
		INSERT INTO exam_question_incidents (
			exam_id, question_id, policy, reason, is_active, decided_by, decided_at, created_at, updated_at
		) VALUES (
			$1, $2, $3, $4, TRUE, $5, now(), now(), now()
		)
		ON CONFLICT (exam_id, question_id)
		DO UPDATE SET
			policy = EXCLUDED.policy,
			reason = EXCLUDED.reason,
			is_active = TRUE,
			decided_by = EXCLUDED.decided_by,
			decided_at = now(),
			updated_at = now()
		RETURNING exam_id, question_id, policy, reason, is_active, decided_by, decided_at
	`, in.ExamID, in.QuestionID, policy, in.Reason, in.DecidedBy).Scan(
		&out.ExamID,
		&out.QuestionID,
		&out.Policy,
		&out.Reason,
		&out.IsActive,
		&decidedBy,
		&decidedAt,
	); err != nil {
		return nil, fmt.Errorf("upsert incident: %w", err)
	}
	if decidedBy.Valid {
		out.DecidedBy = &decidedBy.Int64
	}
	if decidedAt.Valid {
		out.DecidedAt = &decidedAt.Time
	}

	if in.RecomputeSubmitted {
		rows, err := tx.QueryContext(ctx, `
			SELECT id
			FROM attempts
			WHERE exam_id = $1
			  AND status IN ('submitted','expired')
		`, in.ExamID)
		if err != nil {
			return nil, fmt.Errorf("list attempts for recompute: %w", err)
		}
		defer rows.Close()

		attemptIDs := make([]int64, 0)
		for rows.Next() {
			var attemptID int64
			if err := rows.Scan(&attemptID); err != nil {
				return nil, fmt.Errorf("scan recompute attempt: %w", err)
			}
			attemptIDs = append(attemptIDs, attemptID)
		}
		if err := rows.Err(); err != nil {
			return nil, fmt.Errorf("iterate recompute attempts: %w", err)
		}

		for _, attemptID := range attemptIDs {
			if err := s.recomputeFinalizedAttemptTx(ctx, tx, attemptID); err != nil {
				return nil, err
			}
			out.RecomputedAttempts++
		}
	}

	if err := tx.Commit(); err != nil {
		return nil, fmt.Errorf("commit incident tx: %w", err)
	}
	return &out, nil
}

func (s *Service) RegradeExamAttempts(ctx context.Context, examID, actorID int64, actorRole string) (*RegradeExamResult, error) {
	if examID <= 0 || actorID <= 0 {
		return nil, ErrInvalidInput
	}
	role := strings.ToLower(strings.TrimSpace(actorRole))
	if role == "guru" {
		owned, err := s.IsExamOwnedBy(ctx, examID, actorID)
		if err != nil {
			return nil, err
		}
		if !owned {
			return nil, ErrExamForbidden
		}
	}
	if err := s.ensureProktorExamScope(ctx, examID); err != nil {
		return nil, err
	}

	var exists bool
	if err := s.db.QueryRowContext(ctx, `
		SELECT EXISTS(SELECT 1 FROM exams WHERE id = $1)
	`, examID).Scan(&exists); err != nil {
		return nil, fmt.Errorf("check exam exists: %w", err)
	}
	if !exists {
		return nil, ErrExamNotFound
	}

	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, fmt.Errorf("begin regrade tx: %w", err)
	}
	defer func() { _ = tx.Rollback() }()

	rows, err := tx.QueryContext(ctx, `
		SELECT id, status
		FROM attempts
		WHERE exam_id = $1
	`, examID)
	if err != nil {
		return nil, fmt.Errorf("list attempts for regrade: %w", err)
	}

	type attemptLite struct {
		ID     int64
		Status string
	}
	attempts := make([]attemptLite, 0)
	for rows.Next() {
		var it attemptLite
		if err := rows.Scan(&it.ID, &it.Status); err != nil {
			_ = rows.Close()
			return nil, fmt.Errorf("scan attempt for regrade: %w", err)
		}
		attempts = append(attempts, it)
	}
	if err := rows.Err(); err != nil {
		_ = rows.Close()
		return nil, fmt.Errorf("iterate attempts for regrade: %w", err)
	}
	_ = rows.Close()

	out := &RegradeExamResult{ExamID: examID}
	for _, it := range attempts {
		if it.Status == "in_progress" {
			out.SkippedInProgress++
			continue
		}
		if err := s.recomputeFinalizedAttemptTx(ctx, tx, it.ID); err != nil {
			return nil, err
		}
		out.RegradedAttempts++
	}

	if err := s.writeAuditTx(ctx, tx, actorID, "exam_regrade", "exam", fmt.Sprintf("%d", examID), map[string]any{
		"exam_id":             examID,
		"regraded_attempts":   out.RegradedAttempts,
		"skipped_in_progress": out.SkippedInProgress,
	}); err != nil {
		return nil, fmt.Errorf("write audit log: %w", err)
	}

	if err := tx.Commit(); err != nil {
		return nil, fmt.Errorf("commit regrade tx: %w", err)
	}
	return out, nil
}

func (s *Service) writeAuditTx(ctx context.Context, tx *sql.Tx, userID int64, action, entityType, entityID string, payload map[string]any) error {
	if tx == nil {
		return ErrInvalidInput
	}
	if payload == nil {
		payload = map[string]any{}
	}
	b, err := json.Marshal(payload)
	if err != nil {
		return err
	}
	_, err = tx.ExecContext(ctx, `
		INSERT INTO audit_logs (user_id, action, entity_type, entity_id, payload, created_at)
		VALUES ($1, $2, $3, $4, $5::jsonb, now())
	`, userID, action, entityType, entityID, string(b))
	return err
}

func (s *Service) GetAttemptSummary(ctx context.Context, attemptID int64) (*AttemptSummary, error) {
	row, err := s.loadAttemptRow(ctx, s.db, attemptID)
	if err != nil {
		return nil, err
	}

	if row.Status == "in_progress" && time.Now().After(row.ExpiresAt) {
		if _, err := s.finalizeAttempt(ctx, attemptID, "expired"); err != nil {
			return nil, err
		}
		row, err = s.loadAttemptRow(ctx, s.db, attemptID)
		if err != nil {
			return nil, err
		}
	}

	return s.buildSummaryFromRow(ctx, s.db, row)
}

func (s *Service) SaveAnswer(ctx context.Context, input SaveAnswerInput) error {
	row, err := s.loadAttemptRow(ctx, s.db, input.AttemptID)
	if err != nil {
		return err
	}

	if row.Status != "in_progress" {
		return ErrAttemptNotEditable
	}
	if time.Now().After(row.ExpiresAt) {
		_, _ = s.finalizeAttempt(ctx, input.AttemptID, "expired")
		return ErrAttemptNotEditable
	}

	var exists bool
	if err := s.db.QueryRowContext(ctx, `
		SELECT EXISTS (
			SELECT 1
			FROM exam_questions eq
			WHERE eq.exam_id = $1 AND eq.question_id = $2
		)
	`, row.ExamID, input.QuestionID).Scan(&exists); err != nil {
		return fmt.Errorf("validate question in exam: %w", err)
	}
	if !exists {
		return ErrQuestionNotInExam
	}

	if len(input.AnswerPayload) == 0 {
		input.AnswerPayload = json.RawMessage(`{}`)
	}
	questionType, questionContent, err := s.loadQuestionValidationSchema(ctx, row.ExamID, input.QuestionID)
	if err != nil {
		return err
	}
	if err := validateAnswerPayload(questionType, questionContent, input.AnswerPayload); err != nil {
		return err
	}

	answerHasTenant, err := hasColumn(ctx, s.db, "attempt_answers", "tenant_id")
	if err != nil {
		return err
	}
	var attemptTenantID *int64
	if answerHasTenant {
		attemptTenantID, err = loadAttemptTenantID(ctx, s.db, input.AttemptID)
		if err != nil {
			return err
		}
		if attemptTenantID == nil || *attemptTenantID <= 0 {
			return fmt.Errorf("resolve attempt answer tenant: tenant_id is required")
		}
	}
	answerColumns := []string{"attempt_id", "question_id", "answer_payload", "is_doubt", "is_final", "updated_at"}
	answerValues := []string{"$1", "$2", "$3::jsonb", "$4", "FALSE", "now()"}
	answerArgs := []any{input.AttemptID, input.QuestionID, []byte(input.AnswerPayload), input.IsDoubt}
	if answerHasTenant {
		answerColumns = append(answerColumns, "tenant_id")
		answerValues = append(answerValues, fmt.Sprintf("$%d", len(answerArgs)+1))
		answerArgs = append(answerArgs, *attemptTenantID)
	}
	_, err = s.db.ExecContext(ctx, fmt.Sprintf(`
		INSERT INTO attempt_answers (
			%s
		) VALUES (%s)
		ON CONFLICT (attempt_id, question_id)
		DO UPDATE SET
			answer_payload = EXCLUDED.answer_payload,
			is_doubt = EXCLUDED.is_doubt,
			updated_at = now()
	`, strings.Join(answerColumns, ", "), strings.Join(answerValues, ", ")), answerArgs...)
	if err != nil {
		return fmt.Errorf("upsert answer: %w", err)
	}

	return nil
}

func (s *Service) loadQuestionValidationSchema(ctx context.Context, examID, questionID int64) (string, json.RawMessage, error) {
	var questionType string
	var questionContent json.RawMessage
	err := s.db.QueryRowContext(ctx, `
		SELECT
			q.question_type,
			COALESCE(NULLIF(qv.question_content, '{}'::jsonb), NULLIF(qv_fallback.question_content, '{}'::jsonb), '{}'::jsonb) AS question_content
		FROM exam_questions eq
		JOIN questions q
			ON q.id = eq.question_id
		LEFT JOIN LATERAL (
			SELECT qv.question_content
			FROM question_versions qv
			WHERE qv.question_id = q.id
			ORDER BY CASE
				WHEN qv.version_no = q.version THEN 0
				WHEN qv.status = 'final' THEN 1
				ELSE 2
			END, qv.is_active DESC, qv.version_no DESC
			LIMIT 1
		) qv ON TRUE
		LEFT JOIN LATERAL (
			SELECT qv2.question_content
			FROM questions q2
			JOIN question_versions qv2 ON qv2.question_id = q2.id
			WHERE q.question_code_id IS NOT NULL
			  AND q2.question_code_id = q.question_code_id
			  AND q2.id <> q.id
			  AND q2.question_type = q.question_type
			  AND (
				NULLIF(btrim(q.metadata->>'title'), '') IS NULL
				OR NULLIF(btrim(q2.metadata->>'title'), '') = NULLIF(btrim(q.metadata->>'title'), '')
			  )
			  AND (
				NULLIF(btrim(q.metadata->>'material'), '') IS NULL
				OR NULLIF(btrim(q2.metadata->>'material'), '') = NULLIF(btrim(q.metadata->>'material'), '')
			  )
			ORDER BY CASE
				WHEN qv2.status = 'final' THEN 0
				ELSE 1
			END, qv2.is_active DESC, qv2.version_no DESC, q2.id DESC
			LIMIT 1
		) qv_fallback ON TRUE
		WHERE eq.exam_id = $1
		  AND eq.question_id = $2
	`, examID, questionID).Scan(&questionType, &questionContent)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return "", nil, ErrQuestionNotInExam
		}
		return "", nil, fmt.Errorf("load question validation schema: %w", err)
	}
	return strings.TrimSpace(strings.ToLower(questionType)), questionContent, nil
}

func validateAnswerPayload(questionType string, questionContent, payload json.RawMessage) error {
	qType := strings.TrimSpace(strings.ToLower(questionType))
	if len(payload) == 0 {
		return nil
	}
	if !json.Valid(payload) {
		return ErrInvalidInput
	}
	switch qType {
	case "menjodohkan_drag_drop":
		return validateMatchingAnswerPayload(questionContent, payload)
	case "short_answer":
		return validateShortAnswerPayload(questionContent, payload)
	default:
		return nil
	}
}

func validateMatchingAnswerPayload(questionContent, payload json.RawMessage) error {
	var obj map[string]any
	if err := json.Unmarshal(payload, &obj); err != nil {
		return ErrInvalidInput
	}
	rawPairs, exists := obj["pairs"]
	if !exists || rawPairs == nil {
		return nil
	}
	arr, ok := rawPairs.([]any)
	if !ok {
		return ErrInvalidInput
	}
	if len(arr) == 0 {
		return nil
	}
	var content struct {
		Prompts []struct {
			ID string `json:"id"`
		} `json:"prompts"`
		Choices []struct {
			ID string `json:"id"`
		} `json:"choices"`
	}
	if len(questionContent) > 0 {
		if err := json.Unmarshal(questionContent, &content); err != nil {
			return ErrInvalidInput
		}
	}
	promptSet := map[string]struct{}{}
	for _, item := range content.Prompts {
		id := strings.TrimSpace(item.ID)
		if id != "" {
			promptSet[id] = struct{}{}
		}
	}
	choiceSet := map[string]struct{}{}
	for _, item := range content.Choices {
		id := strings.TrimSpace(item.ID)
		if id != "" {
			choiceSet[id] = struct{}{}
		}
	}
	seenPrompt := map[string]struct{}{}
	seenChoice := map[string]struct{}{}
	for _, item := range arr {
		pair, ok := item.(map[string]any)
		if !ok {
			return ErrInvalidInput
		}
		promptID, _ := pair["prompt_id"].(string)
		choiceID, _ := pair["choice_id"].(string)
		promptID = strings.TrimSpace(promptID)
		choiceID = strings.TrimSpace(choiceID)
		if promptID == "" || choiceID == "" {
			return ErrInvalidInput
		}
		if len(promptSet) > 0 {
			if _, ok := promptSet[promptID]; !ok {
				return ErrInvalidInput
			}
		}
		if len(choiceSet) > 0 {
			if _, ok := choiceSet[choiceID]; !ok {
				return ErrInvalidInput
			}
		}
		if _, exists := seenPrompt[promptID]; exists {
			return ErrInvalidInput
		}
		if _, exists := seenChoice[choiceID]; exists {
			return ErrInvalidInput
		}
		seenPrompt[promptID] = struct{}{}
		seenChoice[choiceID] = struct{}{}
	}
	return nil
}

func validateShortAnswerPayload(questionContent, payload json.RawMessage) error {
	var obj map[string]any
	if err := json.Unmarshal(payload, &obj); err != nil {
		return ErrInvalidInput
	}
	rawText, exists := obj["text"]
	if !exists || rawText == nil {
		return nil
	}
	text, ok := rawText.(string)
	if !ok {
		return ErrInvalidInput
	}
	maxLength := 33
	if len(questionContent) > 0 {
		var content struct {
			MaxLength int `json:"max_length"`
		}
		if err := json.Unmarshal(questionContent, &content); err != nil {
			return ErrInvalidInput
		}
		if content.MaxLength > 0 && content.MaxLength < maxLength {
			maxLength = content.MaxLength
		}
	}
	if len([]rune(text)) > maxLength {
		return ErrInvalidInput
	}
	return nil
}

func (s *Service) SubmitAttempt(ctx context.Context, attemptID int64) (*AttemptSummary, error) {
	return s.finalizeAttempt(ctx, attemptID, "submitted")
}

func (s *Service) GetAttemptOwner(ctx context.Context, attemptID int64) (int64, error) {
	var studentID int64
	if err := s.db.QueryRowContext(ctx, `
		SELECT student_id
		FROM attempts
		WHERE id = $1
	`, attemptID).Scan(&studentID); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return 0, ErrAttemptNotFound
		}
		return 0, fmt.Errorf("load attempt owner: %w", err)
	}
	return studentID, nil
}

func (s *Service) ListSubjects(ctx context.Context, level, subjectType string, actorID int64, actorRole string) ([]SubjectOption, error) {
	level = strings.TrimSpace(level)
	subjectType = strings.TrimSpace(subjectType)
	role := strings.ToLower(strings.TrimSpace(actorRole))

	query := `
		SELECT id, education_level, subject_type, name
		FROM subjects
		WHERE is_active = TRUE
	`
	args := make([]any, 0, 2)
	idx := 1
	if role == "guru" {
		if actorID <= 0 {
			return nil, ErrInvalidInput
		}
		query += fmt.Sprintf(" AND created_by = $%d", idx)
		args = append(args, actorID)
		idx++
	}
	if level != "" {
		query += fmt.Sprintf(" AND education_level = $%d", idx)
		args = append(args, level)
		idx++
	}
	if subjectType != "" {
		query += fmt.Sprintf(" AND subject_type = $%d", idx)
		args = append(args, subjectType)
		idx++
	}
	query += " ORDER BY education_level, subject_type, name"

	rows, err := s.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("query subjects: %w", err)
	}
	defer rows.Close()

	items := make([]SubjectOption, 0)
	for rows.Next() {
		var it SubjectOption
		if err := rows.Scan(&it.ID, &it.EducationLevel, &it.SubjectType, &it.Name); err != nil {
			return nil, fmt.Errorf("scan subject: %w", err)
		}
		items = append(items, it)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate subjects: %w", err)
	}
	return items, nil
}

func (s *Service) CreateSubject(ctx context.Context, in CreateSubjectInput) (*SubjectOption, error) {
	level := strings.TrimSpace(in.EducationLevel)
	subjectType := strings.TrimSpace(in.SubjectType)
	name := strings.TrimSpace(in.Name)
	if level == "" || subjectType == "" || name == "" {
		return nil, ErrInvalidInput
	}
	var out SubjectOption
	if err := s.db.QueryRowContext(ctx, `
		INSERT INTO subjects (education_level, subject_type, name, is_active, created_by)
		VALUES ($1, $2, $3, TRUE, NULLIF($4, 0))
		RETURNING id, education_level, subject_type, name
	`, level, subjectType, name, in.CreatedBy).Scan(&out.ID, &out.EducationLevel, &out.SubjectType, &out.Name); err != nil {
		return nil, fmt.Errorf("insert subject: %w", err)
	}
	return &out, nil
}

func (s *Service) UpdateSubject(ctx context.Context, in UpdateSubjectInput) (*SubjectOption, error) {
	if in.ID <= 0 {
		return nil, ErrInvalidInput
	}
	level := strings.TrimSpace(in.EducationLevel)
	subjectType := strings.TrimSpace(in.SubjectType)
	name := strings.TrimSpace(in.Name)
	if level == "" || subjectType == "" || name == "" {
		return nil, ErrInvalidInput
	}
	role := strings.ToLower(strings.TrimSpace(in.ActorRole))
	var out SubjectOption
	query := `
		UPDATE subjects
		SET education_level = $2,
			subject_type = $3,
			name = $4
		WHERE id = $1
		  AND is_active = TRUE
	`
	args := []any{in.ID, level, subjectType, name}
	if role == "guru" {
		if in.ActorID <= 0 {
			return nil, ErrInvalidInput
		}
		query += " AND created_by = $5"
		args = append(args, in.ActorID)
	}
	query += " RETURNING id, education_level, subject_type, name"
	if err := s.db.QueryRowContext(ctx, query, args...).Scan(&out.ID, &out.EducationLevel, &out.SubjectType, &out.Name); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			if role == "guru" {
				found, checkErr := s.subjectExistsAndActive(ctx, in.ID)
				if checkErr != nil {
					return nil, checkErr
				}
				if found {
					return nil, ErrSubjectForbidden
				}
			}
			return nil, ErrSubjectNotFound
		}
		return nil, fmt.Errorf("update subject: %w", err)
	}
	return &out, nil
}

func normalizeExamToken(token string) string {
	return strings.ToUpper(strings.TrimSpace(token))
}

func normalizeReviewPolicy(input string) string {
	v := strings.TrimSpace(strings.ToLower(input))
	switch v {
	case "score_only", "after_submit", "immediate", "disabled", "after_exam_end", "manual_release":
		return v
	case "after_end":
		return "after_exam_end"
	case "after_exam_closed":
		return "after_exam_end"
	default:
		return "after_submit"
	}
}

func normalizeKKTP(input float64) float64 {
	if input < 0 || input > 100 {
		return 70
	}
	return math.Round(input*100) / 100
}

func normalizeIncidentPolicy(input string) string {
	switch strings.TrimSpace(strings.ToLower(input)) {
	case "drop":
		return "drop"
	case "bonus_all":
		return "bonus_all"
	default:
		return ""
	}
}

func normalizeExamQuestionCodeStrategy(input string) string {
	switch strings.TrimSpace(strings.ToLower(input)) {
	case "", "all":
		return "all"
	case "random":
		return "random"
	default:
		return ""
	}
}

func isReviewPolicyConstraintErr(err error) bool {
	if err == nil {
		return false
	}
	msg := strings.ToLower(err.Error())
	return strings.Contains(msg, "chk_exams_review_policy") ||
		(strings.Contains(msg, "review_policy") && strings.Contains(msg, "check"))
}

func nullIntPtr(v *int) any {
	if v == nil {
		return nil
	}
	if *v <= 0 {
		return nil
	}
	return *v
}

func hashExamToken(token string) string {
	sum := sha256.Sum256([]byte(token))
	return hex.EncodeToString(sum[:])
}

func randomExamToken(length int) (string, error) {
	if length <= 0 {
		length = 6
	}
	const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
	buf := make([]byte, length)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	out := make([]byte, length)
	for i := range buf {
		out[i] = alphabet[int(buf[i])%len(alphabet)]
	}
	return string(out), nil
}

func isUndefinedTableErr(err error, table string) bool {
	if err == nil {
		return false
	}
	lower := strings.ToLower(err.Error())
	if table == "" {
		return strings.Contains(lower, "does not exist") || strings.Contains(lower, "undefined_table")
	}
	return strings.Contains(lower, "relation \""+strings.ToLower(table)+"\" does not exist") ||
		(strings.Contains(lower, "undefined_table") && strings.Contains(lower, strings.ToLower(table)))
}

func (s *Service) DeleteSubject(ctx context.Context, subjectID, actorID int64, actorRole string) error {
	if subjectID <= 0 {
		return ErrInvalidInput
	}
	role := strings.ToLower(strings.TrimSpace(actorRole))
	query := `
		UPDATE subjects
		SET is_active = FALSE
		WHERE id = $1
		  AND is_active = TRUE
	`
	args := []any{subjectID}
	if role == "guru" {
		if actorID <= 0 {
			return ErrInvalidInput
		}
		query += " AND created_by = $2"
		args = append(args, actorID)
	}
	query += " RETURNING id"
	var id int64
	if err := s.db.QueryRowContext(ctx, query, args...).Scan(&id); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			if role == "guru" {
				found, checkErr := s.subjectExistsAndActive(ctx, subjectID)
				if checkErr != nil {
					return checkErr
				}
				if found {
					return ErrSubjectForbidden
				}
			}
			return ErrSubjectNotFound
		}
		return fmt.Errorf("delete subject: %w", err)
	}
	return nil
}

func (s *Service) subjectExistsAndActive(ctx context.Context, subjectID int64) (bool, error) {
	var exists bool
	if err := s.db.QueryRowContext(ctx, `
		SELECT EXISTS(
			SELECT 1
			FROM subjects
			WHERE id = $1
			  AND is_active = TRUE
		)
	`, subjectID).Scan(&exists); err != nil {
		return false, fmt.Errorf("check subject exists: %w", err)
	}
	return exists, nil
}

func (s *Service) ListExamsBySubject(ctx context.Context, subjectID int64) ([]ExamOption, error) {
	if subjectID <= 0 {
		return nil, ErrInvalidInput
	}

	rows, err := s.db.QueryContext(ctx, `
		SELECT
			id,
			code,
			title,
			subject_id,
			end_at,
			review_policy,
			(exam_token_hash IS NOT NULL AND btrim(exam_token_hash) <> '') AS token_required
		FROM exams
		WHERE subject_id = $1
		  AND is_active = TRUE
		ORDER BY created_at DESC, id DESC
	`, subjectID)
	if err != nil {
		return nil, fmt.Errorf("query exams by subject: %w", err)
	}
	defer rows.Close()

	items := make([]ExamOption, 0)
	for rows.Next() {
		var it ExamOption
		var endAt sql.NullTime
		if err := rows.Scan(
			&it.ID,
			&it.Code,
			&it.Title,
			&it.SubjectID,
			&endAt,
			&it.ReviewPolicy,
			&it.TokenRequired,
		); err != nil {
			return nil, fmt.Errorf("scan exam: %w", err)
		}
		if endAt.Valid {
			it.EndAt = &endAt.Time
		}
		items = append(items, it)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate exams: %w", err)
	}
	return items, nil
}

func (s *Service) loadAttemptQuestionByRef(ctx context.Context, attemptID int64, ref examQuestionRef, randomizeOptions bool) (*AttemptQuestion, error) {
	r := s.db.QueryRowContext(ctx, `
			SELECT
				a.id,
				eq.question_id,
				q.question_type,
				COALESCE(NULLIF(qv.stem_html, ''), NULLIF(qv_fallback.stem_html, ''), q.stem_html) AS stem_html,
				COALESCE(qv.stimulus_html, qv_fallback.stimulus_html) AS version_stimulus_html,
				q.stimulus_html AS legacy_stimulus_html,
				COALESCE(NULLIF(qv.question_content, '{}'::jsonb), NULLIF(qv_fallback.question_content, '{}'::jsonb), '{}'::jsonb) AS question_content,
				COALESCE(NULLIF(qv.answer_key, '{}'::jsonb), NULLIF(qv_fallback.answer_key, '{}'::jsonb), '{}'::jsonb) AS answer_key,
				q.metadata,
			COALESCE(aa.answer_payload, '{}'::jsonb) AS answer_payload,
			COALESCE(aa.is_doubt, FALSE) AS is_doubt
		FROM attempts a
		JOIN exam_questions eq
			ON eq.exam_id = a.exam_id
		JOIN questions q
			ON q.id = eq.question_id
		LEFT JOIN attempt_answers aa
			ON aa.attempt_id = a.id
			AND aa.question_id = eq.question_id
		LEFT JOIN LATERAL (
				SELECT qv.answer_key, qv.question_content, qv.stimulus_html, qv.stem_html
				FROM question_versions qv
				WHERE qv.question_id = q.id
				ORDER BY CASE
					WHEN qv.version_no = q.version THEN 0
					WHEN qv.status = 'final' THEN 1
					ELSE 2
				END, qv.is_active DESC, qv.version_no DESC
			LIMIT 1
		) qv ON TRUE
		LEFT JOIN LATERAL (
				SELECT qv2.answer_key, qv2.question_content, qv2.stimulus_html, qv2.stem_html
				FROM questions q2
				JOIN question_versions qv2 ON qv2.question_id = q2.id
				WHERE q.question_code_id IS NOT NULL
				  AND q2.question_code_id = q.question_code_id
				  AND q2.id <> q.id
				  AND q2.question_type = q.question_type
				  AND (
					NULLIF(btrim(q.metadata->>'title'), '') IS NULL
					OR NULLIF(btrim(q2.metadata->>'title'), '') = NULLIF(btrim(q.metadata->>'title'), '')
				  )
				  AND (
					NULLIF(btrim(q.metadata->>'material'), '') IS NULL
					OR NULLIF(btrim(q2.metadata->>'material'), '') = NULLIF(btrim(q.metadata->>'material'), '')
				  )
				ORDER BY CASE
					WHEN qv2.status = 'final' THEN 0
					ELSE 1
				END, qv2.is_active DESC, qv2.version_no DESC, q2.id DESC
			LIMIT 1
		) qv_fallback ON TRUE
		WHERE a.id = $1
		  AND eq.question_id = $2
	`, attemptID, ref.QuestionID)

	var out AttemptQuestion
	var versionStimulus sql.NullString
	var legacyStimulus sql.NullString
	var questionMetadata json.RawMessage
	if err := r.Scan(
		&out.AttemptID,
		&out.QuestionID,
		&out.QuestionType,
		&out.StemHTML,
		&versionStimulus,
		&legacyStimulus,
		&out.QuestionContent,
		&out.AnswerKey,
		&questionMetadata,
		&out.AnswerPayload,
		&out.IsDoubt,
	); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrQuestionNotInExam
		}
		return nil, fmt.Errorf("query attempt question: %w", err)
	}
	out.SeqNo = ref.DisplayNo
	out.StimulusHTML = resolveAttemptStimulusHTML(versionStimulus, legacyStimulus, questionMetadata)

	optRows, err := s.db.QueryContext(ctx, `
		SELECT option_key, option_html
		FROM question_options
		WHERE question_id = $1
		ORDER BY option_key ASC
	`, out.QuestionID)
	if err != nil {
		return nil, fmt.Errorf("query question options: %w", err)
	}
	defer optRows.Close()

	for optRows.Next() {
		var opt QuestionOption
		if err := optRows.Scan(&opt.OptionKey, &opt.OptionHTML); err != nil {
			return nil, fmt.Errorf("scan question option: %w", err)
		}
		out.Options = append(out.Options, opt)
	}
	if err := optRows.Err(); err != nil {
		return nil, fmt.Errorf("iterate question options: %w", err)
	}
	if randomizeOptions && len(out.Options) > 1 {
		out.Options = shuffleQuestionOptionsByAttempt(out.Options, attemptID, out.QuestionID)
	}

	return &out, nil
}

func (s *Service) GetAttemptPages(ctx context.Context, attemptID int64) (*AttemptPageList, error) {
	if attemptID <= 0 {
		return nil, ErrInvalidInput
	}

	row, err := s.loadAttemptRow(ctx, s.db, attemptID)
	if err != nil {
		return nil, err
	}
	if row.Status == "in_progress" && time.Now().After(row.ExpiresAt) {
		if _, err := s.finalizeAttempt(ctx, attemptID, "expired"); err != nil {
			return nil, err
		}
	}

	randomizeQuestions, _, err := s.loadExamRandomizeConfig(ctx, row.ExamID)
	if err != nil {
		return nil, err
	}
	pages, err := s.buildAttemptPageRefs(ctx, row.ExamID, row.ID, randomizeQuestions)
	if err != nil {
		return nil, err
	}
	totalQuestions := 0
	for _, page := range pages {
		totalQuestions += len(page.QuestionIDs)
	}
	return &AttemptPageList{
		AttemptID:      attemptID,
		TotalPages:     len(pages),
		TotalQuestions: totalQuestions,
		Pages:          pages,
	}, nil
}

func (s *Service) GetAttemptPage(ctx context.Context, attemptID int64, pageNo int) (*AttemptPage, error) {
	if attemptID <= 0 || pageNo <= 0 {
		return nil, ErrInvalidInput
	}

	row, err := s.loadAttemptRow(ctx, s.db, attemptID)
	if err != nil {
		return nil, err
	}
	if row.Status == "in_progress" && time.Now().After(row.ExpiresAt) {
		if _, err := s.finalizeAttempt(ctx, attemptID, "expired"); err != nil {
			return nil, err
		}
	}

	randomizeQuestions, randomizeOptions, err := s.loadExamRandomizeConfig(ctx, row.ExamID)
	if err != nil {
		return nil, err
	}
	pages, err := s.buildAttemptPageRefs(ctx, row.ExamID, row.ID, randomizeQuestions)
	if err != nil {
		return nil, err
	}
	if pageNo > len(pages) {
		return nil, ErrQuestionNotInExam
	}
	pageRef := pages[pageNo-1]
	orderedRefs, err := s.orderedAttemptQuestionRefs(ctx, row.ExamID, row.ID, randomizeQuestions)
	if err != nil {
		return nil, err
	}
	refByQuestionID := make(map[int64]examQuestionRef, len(orderedRefs))
	for _, ref := range orderedRefs {
		refByQuestionID[ref.QuestionID] = ref
	}

	out := &AttemptPage{
		AttemptID:   attemptID,
		PageNo:      pageRef.PageNo,
		QuestionNos: append([]int(nil), pageRef.QuestionNos...),
		QuestionIDs: append([]int64(nil), pageRef.QuestionIDs...),
		Items:       make([]AttemptQuestion, 0, len(pageRef.QuestionIDs)),
	}
	if pageRef.StimulusGroupID != nil {
		id := *pageRef.StimulusGroupID
		out.StimulusGroupID = &id
	}
	for _, questionID := range pageRef.QuestionIDs {
		ref, ok := refByQuestionID[questionID]
		if !ok {
			return nil, ErrQuestionNotInExam
		}
		item, err := s.loadAttemptQuestionByRef(ctx, attemptID, ref, randomizeOptions)
		if err != nil {
			return nil, err
		}
		if out.StimulusHTML == nil && item.StimulusHTML != nil && strings.TrimSpace(*item.StimulusHTML) != "" {
			stimulus := *item.StimulusHTML
			out.StimulusHTML = &stimulus
		}
		if out.StimulusHTML != nil {
			item.StimulusHTML = nil
		}
		out.Items = append(out.Items, *item)
	}
	return out, nil
}

func (s *Service) GetAttemptQuestion(ctx context.Context, attemptID int64, questionNo int) (*AttemptQuestion, error) {
	if attemptID <= 0 || questionNo <= 0 {
		return nil, ErrInvalidInput
	}

	row, err := s.loadAttemptRow(ctx, s.db, attemptID)
	if err != nil {
		return nil, err
	}
	if row.Status == "in_progress" && time.Now().After(row.ExpiresAt) {
		if _, err := s.finalizeAttempt(ctx, attemptID, "expired"); err != nil {
			return nil, err
		}
	}

	randomizeQuestions, randomizeOptions, err := s.loadExamRandomizeConfig(ctx, row.ExamID)
	if err != nil {
		return nil, err
	}
	questionRefs, err := s.orderedAttemptQuestionRefs(ctx, row.ExamID, row.ID, randomizeQuestions)
	if err != nil {
		return nil, err
	}
	if questionNo > len(questionRefs) {
		return nil, ErrQuestionNotInExam
	}
	return s.loadAttemptQuestionByRef(ctx, attemptID, questionRefs[questionNo-1], randomizeOptions)
}

func (s *Service) GetExamQuestionDetail(ctx context.Context, examID, questionID int64) (*ExamQuestionDetail, error) {
	if examID <= 0 || questionID <= 0 {
		return nil, ErrInvalidInput
	}
	if err := s.ensureProktorExamScope(ctx, examID); err != nil {
		return nil, err
	}

	r := s.db.QueryRowContext(ctx, `
		SELECT
			eq.question_id,
			q.question_type,
			COALESCE(NULLIF(qv.stem_html, ''), NULLIF(qv_fallback.stem_html, ''), q.stem_html) AS stem_html,
			COALESCE(qv.stimulus_html, qv_fallback.stimulus_html) AS version_stimulus_html,
			q.stimulus_html AS legacy_stimulus_html,
			COALESCE(NULLIF(qv.question_content, '{}'::jsonb), NULLIF(qv_fallback.question_content, '{}'::jsonb), '{}'::jsonb) AS question_content,
			COALESCE(NULLIF(qv.answer_key, '{}'::jsonb), NULLIF(qv_fallback.answer_key, '{}'::jsonb), '{}'::jsonb) AS answer_key,
			q.metadata
		FROM exam_questions eq
		JOIN questions q
			ON q.id = eq.question_id
		LEFT JOIN LATERAL (
				SELECT qv.answer_key, qv.question_content, qv.stimulus_html, qv.stem_html
				FROM question_versions qv
				WHERE qv.question_id = q.id
				ORDER BY CASE
					WHEN qv.version_no = q.version THEN 0
					WHEN qv.status = 'final' THEN 1
					ELSE 2
				END, qv.is_active DESC, qv.version_no DESC
			LIMIT 1
		) qv ON TRUE
		LEFT JOIN LATERAL (
				SELECT qv2.answer_key, qv2.question_content, qv2.stimulus_html, qv2.stem_html
				FROM questions q2
				JOIN question_versions qv2 ON qv2.question_id = q2.id
				WHERE q.question_code_id IS NOT NULL
				  AND q2.question_code_id = q.question_code_id
				  AND q2.id <> q.id
				  AND q2.question_type = q.question_type
				  AND (
					NULLIF(btrim(q.metadata->>'title'), '') IS NULL
					OR NULLIF(btrim(q2.metadata->>'title'), '') = NULLIF(btrim(q.metadata->>'title'), '')
				  )
				  AND (
					NULLIF(btrim(q.metadata->>'material'), '') IS NULL
					OR NULLIF(btrim(q2.metadata->>'material'), '') = NULLIF(btrim(q.metadata->>'material'), '')
				  )
				ORDER BY CASE
					WHEN qv2.status = 'final' THEN 0
					ELSE 1
				END, qv2.is_active DESC, qv2.version_no DESC, q2.id DESC
			LIMIT 1
		) qv_fallback ON TRUE
		WHERE eq.exam_id = $1
		  AND eq.question_id = $2
	`, examID, questionID)

	var out ExamQuestionDetail
	var versionStimulus sql.NullString
	var legacyStimulus sql.NullString
	var questionMetadata json.RawMessage
	if err := r.Scan(
		&out.QuestionID,
		&out.QuestionType,
		&out.StemHTML,
		&versionStimulus,
		&legacyStimulus,
		&out.QuestionContent,
		&out.AnswerKey,
		&questionMetadata,
	); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrQuestionNotInExam
		}
		return nil, fmt.Errorf("query exam question detail: %w", err)
	}
	out.StimulusHTML = resolveAttemptStimulusHTML(versionStimulus, legacyStimulus, questionMetadata)

	optRows, err := s.db.QueryContext(ctx, `
		SELECT option_key, option_html
		FROM question_options
		WHERE question_id = $1
		ORDER BY option_key ASC
	`, out.QuestionID)
	if err != nil {
		return nil, fmt.Errorf("query question options: %w", err)
	}
	defer optRows.Close()

	for optRows.Next() {
		var opt QuestionOption
		if err := optRows.Scan(&opt.OptionKey, &opt.OptionHTML); err != nil {
			return nil, fmt.Errorf("scan question option: %w", err)
		}
		out.Options = append(out.Options, opt)
	}
	if err := optRows.Err(); err != nil {
		return nil, fmt.Errorf("iterate question options: %w", err)
	}

	return &out, nil
}

type examQuestionRef struct {
	QuestionID      int64
	SeqNo           int
	DisplayNo       int
	StimulusGroupID *int64
}

func (s *Service) listExamQuestionRefs(ctx context.Context, examID int64) ([]examQuestionRef, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT
			eq.question_id,
			eq.seq_no,
			qv_current.stimulus_group_id
		FROM exam_questions eq
		JOIN questions q ON q.id = eq.question_id
		LEFT JOIN LATERAL (
			SELECT qv.stimulus_group_id
			FROM question_versions qv
			WHERE qv.question_id = q.id
			ORDER BY CASE
				WHEN qv.version_no = q.version THEN 0
				WHEN qv.status = 'final' THEN 1
				ELSE 2
			END, qv.is_active DESC, qv.version_no DESC
			LIMIT 1
		) qv_current ON TRUE
		WHERE eq.exam_id = $1
		ORDER BY eq.seq_no ASC
	`, examID)
	if err != nil {
		return nil, fmt.Errorf("list exam question refs: %w", err)
	}
	defer rows.Close()

	refs := make([]examQuestionRef, 0)
	for rows.Next() {
		var ref examQuestionRef
		var stimulusGroupID sql.NullInt64
		if err := rows.Scan(&ref.QuestionID, &ref.SeqNo, &stimulusGroupID); err != nil {
			return nil, fmt.Errorf("scan exam question refs: %w", err)
		}
		if stimulusGroupID.Valid {
			id := stimulusGroupID.Int64
			ref.StimulusGroupID = &id
		}
		refs = append(refs, ref)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate exam question refs: %w", err)
	}
	return refs, nil
}

func (s *Service) loadExamRandomizeConfig(ctx context.Context, examID int64) (bool, bool, error) {
	var randomizeQuestions bool
	var randomizeOptions bool
	if err := s.db.QueryRowContext(ctx, `
		SELECT randomize_questions, randomize_options
		FROM exams
		WHERE id = $1
	`, examID).Scan(&randomizeQuestions, &randomizeOptions); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return false, false, ErrExamNotFound
		}
		return false, false, fmt.Errorf("load exam randomize config: %w", err)
	}
	return randomizeQuestions, randomizeOptions, nil
}

func shuffleQuestionRefsByAttempt(items []examQuestionRef, attemptID int64) []examQuestionRef {
	if len(items) <= 1 {
		return items
	}
	blocks := buildQuestionRefBlocks(items)
	sort.SliceStable(blocks, func(i, j int) bool {
		ri := deterministicRankForAttempt(attemptID, blocks[i].rankKey())
		rj := deterministicRankForAttempt(attemptID, blocks[j].rankKey())
		if ri == rj {
			return blocks[i].order < blocks[j].order
		}
		return ri < rj
	})
	shuffled := make([]examQuestionRef, 0, len(items))
	for _, block := range blocks {
		shuffled = append(shuffled, block.refs...)
	}
	assignDisplayNumbers(shuffled)
	return shuffled
}

type questionRefBlock struct {
	order int
	refs  []examQuestionRef
}

func (b questionRefBlock) rankKey() string {
	parts := make([]string, 0, len(b.refs))
	for _, ref := range b.refs {
		parts = append(parts, fmt.Sprintf("%d:%d", ref.QuestionID, ref.SeqNo))
	}
	return "qb:" + strings.Join(parts, "|")
}

func buildQuestionRefBlocks(items []examQuestionRef) []questionRefBlock {
	blocks := make([]questionRefBlock, 0, len(items))
	for _, ref := range items {
		if len(blocks) == 0 || !canGroupQuestionRefs(ref, blocks[len(blocks)-1].refs[len(blocks[len(blocks)-1].refs)-1]) {
			blocks = append(blocks, questionRefBlock{
				order: len(blocks),
				refs:  []examQuestionRef{ref},
			})
			continue
		}
		blocks[len(blocks)-1].refs = append(blocks[len(blocks)-1].refs, ref)
	}
	return blocks
}

func canGroupQuestionRefs(current, previous examQuestionRef) bool {
	if current.StimulusGroupID == nil || previous.StimulusGroupID == nil {
		return false
	}
	return *current.StimulusGroupID == *previous.StimulusGroupID
}

func assignDisplayNumbers(items []examQuestionRef) {
	for i := range items {
		items[i].DisplayNo = i + 1
	}
}

func countAttemptPages(refs []examQuestionRef) int {
	if len(refs) == 0 {
		return 0
	}
	count := 1
	for i := 1; i < len(refs); i++ {
		if !canGroupQuestionRefs(refs[i], refs[i-1]) {
			count++
		}
	}
	return count
}

func (s *Service) orderedAttemptQuestionRefs(ctx context.Context, examID, attemptID int64, randomizeQuestions bool) ([]examQuestionRef, error) {
	refs, err := s.listExamQuestionRefs(ctx, examID)
	if err != nil {
		return nil, err
	}
	if randomizeQuestions {
		return shuffleQuestionRefsByAttempt(refs, attemptID), nil
	}
	ordered := append([]examQuestionRef(nil), refs...)
	assignDisplayNumbers(ordered)
	return ordered, nil
}

func canAppendRefToPage(ref examQuestionRef, page AttemptPageRef) bool {
	if ref.StimulusGroupID == nil || page.StimulusGroupID == nil {
		return false
	}
	return *ref.StimulusGroupID == *page.StimulusGroupID
}

func (s *Service) buildAttemptPageRefs(ctx context.Context, examID, attemptID int64, randomizeQuestions bool) ([]AttemptPageRef, error) {
	refs, err := s.orderedAttemptQuestionRefs(ctx, examID, attemptID, randomizeQuestions)
	if err != nil {
		return nil, err
	}
	pages := make([]AttemptPageRef, 0, len(refs))
	for _, ref := range refs {
		if len(pages) == 0 || !canAppendRefToPage(ref, pages[len(pages)-1]) {
			page := AttemptPageRef{
				PageNo:      len(pages) + 1,
				QuestionNos: []int{ref.DisplayNo},
				QuestionIDs: []int64{ref.QuestionID},
			}
			if ref.StimulusGroupID != nil {
				id := *ref.StimulusGroupID
				page.StimulusGroupID = &id
			}
			pages = append(pages, page)
			continue
		}
		pages[len(pages)-1].QuestionNos = append(pages[len(pages)-1].QuestionNos, ref.DisplayNo)
		pages[len(pages)-1].QuestionIDs = append(pages[len(pages)-1].QuestionIDs, ref.QuestionID)
	}
	return pages, nil
}

func shuffleQuestionOptionsByAttempt(items []QuestionOption, attemptID int64, questionID int64) []QuestionOption {
	if len(items) <= 1 {
		return items
	}
	shuffled := append([]QuestionOption(nil), items...)
	sort.SliceStable(shuffled, func(i, j int) bool {
		ri := deterministicRankForAttempt(
			attemptID,
			fmt.Sprintf("o:%d:%s", questionID, strings.TrimSpace(shuffled[i].OptionKey)),
		)
		rj := deterministicRankForAttempt(
			attemptID,
			fmt.Sprintf("o:%d:%s", questionID, strings.TrimSpace(shuffled[j].OptionKey)),
		)
		if ri == rj {
			return shuffled[i].OptionKey < shuffled[j].OptionKey
		}
		return ri < rj
	})
	return shuffled
}

func deterministicRankForAttempt(attemptID int64, key string) string {
	raw := fmt.Sprintf("%d|%s", attemptID, strings.TrimSpace(key))
	sum := sha256.Sum256([]byte(raw))
	return hex.EncodeToString(sum[:])
}

func resolveAttemptStimulusHTML(version sql.NullString, legacy sql.NullString, metadata json.RawMessage) *string {
	if version.Valid && strings.TrimSpace(version.String) != "" {
		v := version.String
		return &v
	}
	if legacy.Valid && strings.TrimSpace(legacy.String) != "" {
		v := legacy.String
		return &v
	}
	if len(metadata) > 0 {
		var meta map[string]any
		if err := json.Unmarshal(metadata, &meta); err == nil {
			if material, ok := meta["material"].(string); ok {
				material = strings.TrimSpace(material)
				if material != "" {
					v := "<p>" + html.EscapeString(material) + "</p>"
					return &v
				}
			}
		}
	}
	return nil
}

func renderStimulusHTML(stimulusType string, raw string) string {
	if strings.TrimSpace(raw) == "" {
		return ""
	}
	var content map[string]any
	if err := json.Unmarshal([]byte(raw), &content); err != nil {
		return ""
	}

	switch strings.ToLower(strings.TrimSpace(stimulusType)) {
	case "multiteks":
		tabsRaw, ok := content["tabs"].([]any)
		if !ok || len(tabsRaw) == 0 {
			return ""
		}
		var b strings.Builder
		for i, tabRaw := range tabsRaw {
			tab, ok := tabRaw.(map[string]any)
			if !ok {
				continue
			}
			title, _ := tab["title"].(string)
			body, _ := tab["body"].(string)
			title = strings.TrimSpace(title)
			body = strings.TrimSpace(body)
			if title == "" {
				title = fmt.Sprintf("Tab %d", i+1)
			}
			if body == "" {
				body = `<span class="muted">(konten kosong)</span>`
			}
			b.WriteString(`<section class="panel mt"><h4>`)
			b.WriteString(html.EscapeString(title))
			b.WriteString(`</h4><div class="box mt">`)
			b.WriteString(body)
			b.WriteString(`</div></section>`)
		}
		return strings.TrimSpace(b.String())
	default:
		body, _ := content["body"].(string)
		return strings.TrimSpace(body)
	}
}

func (s *Service) GetAttemptResult(ctx context.Context, attemptID int64) (*AttemptResult, error) {
	row, err := s.loadAttemptRow(ctx, s.db, attemptID)
	if err != nil {
		return nil, err
	}

	if row.Status == "in_progress" {
		if time.Now().After(row.ExpiresAt) {
			if _, err := s.finalizeAttempt(ctx, attemptID, "expired"); err != nil {
				return nil, err
			}
			row, err = s.loadAttemptRow(ctx, s.db, attemptID)
			if err != nil {
				return nil, err
			}
		} else {
			return nil, ErrAttemptNotFinal
		}
	}

	reviewPolicy, examEndAt, err := s.loadExamReviewPolicy(ctx, row.ExamID)
	if err != nil {
		return nil, err
	}
	policy := normalizeReviewPolicy(reviewPolicy)
	if !canViewResultByPolicy(policy, row.Status, examEndAt) {
		return nil, ErrResultPolicyDenied
	}

	summary, err := s.buildSummaryFromRow(ctx, s.db, row)
	if err != nil {
		return nil, err
	}

	items := make([]AttemptResultItem, 0)
	if policy != "score_only" {
		items, err = s.loadAttemptResultItems(ctx, attemptID)
		if err != nil {
			return nil, err
		}
	}

	return &AttemptResult{
		Summary:   *summary,
		Items:     items,
		ScoreOnly: policy == "score_only",
	}, nil
}

func (s *Service) LogAttemptEvent(ctx context.Context, input AttemptEventInput) (*AttemptEvent, error) {
	if input.AttemptID <= 0 {
		return nil, ErrAttemptNotFound
	}

	eventType := strings.TrimSpace(strings.ToLower(input.EventType))
	if eventType != "tab_blur" && eventType != "reconnect" && eventType != "rapid_refresh" && eventType != "fullscreen_exit" {
		return nil, ErrInvalidEventType
	}

	if _, err := s.loadAttemptRow(ctx, s.db, input.AttemptID); err != nil {
		return nil, err
	}

	if len(input.Payload) == 0 {
		input.Payload = json.RawMessage(`{}`)
	}

	eventHasTenant, err := hasColumn(ctx, s.db, "attempt_events", "tenant_id")
	if err != nil {
		return nil, err
	}
	var attemptTenantID *int64
	if eventHasTenant {
		attemptTenantID, err = loadAttemptTenantID(ctx, s.db, input.AttemptID)
		if err != nil {
			return nil, err
		}
		if attemptTenantID == nil || *attemptTenantID <= 0 {
			return nil, fmt.Errorf("resolve attempt event tenant: tenant_id is required")
		}
	}
	eventColumns := []string{"attempt_id", "event_type", "payload", "client_ts", "server_ts", "actor_user_id", "created_at"}
	eventValues := []string{"$1", "$2", "$3::jsonb", "$4", "now()", "NULLIF($5, 0)", "now()"}
	eventArgs := []any{input.AttemptID, eventType, []byte(input.Payload), input.ClientTS, input.ActorUserID}
	if eventHasTenant {
		eventColumns = append(eventColumns, "tenant_id")
		eventValues = append(eventValues, fmt.Sprintf("$%d", len(eventArgs)+1))
		eventArgs = append(eventArgs, *attemptTenantID)
	}
	row := s.db.QueryRowContext(ctx, fmt.Sprintf(`
		INSERT INTO attempt_events (%s)
		VALUES (%s)
		RETURNING id, attempt_id, event_type, payload, client_ts, server_ts, actor_user_id, NULL::text, created_at
	`, strings.Join(eventColumns, ", "), strings.Join(eventValues, ", ")), eventArgs...)

	return scanAttemptEvent(row)
}

func (s *Service) ListAttemptEvents(ctx context.Context, attemptID int64, limit int) ([]AttemptEvent, error) {
	if attemptID <= 0 {
		return nil, ErrAttemptNotFound
	}
	if limit <= 0 || limit > 500 {
		limit = 200
	}
	if err := s.ensureProktorAttemptScope(ctx, attemptID); err != nil {
		return nil, err
	}

	if _, err := s.loadAttemptRow(ctx, s.db, attemptID); err != nil {
		return nil, err
	}

	rows, err := s.db.QueryContext(ctx, `
		SELECT ae.id, ae.attempt_id, ae.event_type, ae.payload, ae.client_ts, ae.server_ts, ae.actor_user_id,
		       u.full_name, ae.created_at
		FROM attempt_events ae
		LEFT JOIN users u ON u.id = ae.actor_user_id
		WHERE ae.attempt_id = $1
		ORDER BY ae.server_ts DESC, ae.id DESC
		LIMIT $2
	`, attemptID, limit)
	if err != nil {
		return nil, fmt.Errorf("query attempt events: %w", err)
	}
	defer rows.Close()

	items := make([]AttemptEvent, 0)
	for rows.Next() {
		item, err := scanAttemptEvent(rows)
		if err != nil {
			return nil, err
		}
		items = append(items, *item)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate attempt events: %w", err)
	}
	return items, nil
}

func (s *Service) ListExamEvents(ctx context.Context, examID int64, limit int) ([]AttemptEvent, error) {
	if examID <= 0 {
		return nil, ErrExamNotFound
	}
	if limit <= 0 || limit > 500 {
		limit = 200
	}
	if err := s.ensureProktorExamScope(ctx, examID); err != nil {
		return nil, err
	}
	var exists bool
	if err := s.db.QueryRowContext(ctx, `
		SELECT EXISTS(SELECT 1 FROM exams WHERE id = $1)
	`, examID).Scan(&exists); err != nil {
		return nil, fmt.Errorf("load exam: %w", err)
	}
	if !exists {
		return nil, ErrExamNotFound
	}
	user, isProktor := currentScopedProktor(ctx)
	rows, err := s.db.QueryContext(ctx, fmt.Sprintf(`
		SELECT ae.id, ae.attempt_id, ae.event_type, ae.payload, ae.client_ts, ae.server_ts, ae.actor_user_id,
		       u.full_name, ae.created_at
		FROM attempt_events ae
		JOIN attempts a ON a.id = ae.attempt_id
		LEFT JOIN users u ON u.id = ae.actor_user_id
		WHERE a.exam_id = $1
		  AND ($3 = 0 OR %s)
		ORDER BY ae.server_ts DESC, ae.id DESC
		LIMIT $2
	`, proktorStudentScopeClause("a.student_id", "$3")), examID, limit, func() int64 {
		if isProktor {
			return user.ID
		}
		return 0
	}())
	if err != nil {
		return nil, fmt.Errorf("query exam events: %w", err)
	}
	defer rows.Close()
	items := make([]AttemptEvent, 0)
	for rows.Next() {
		item, err := scanAttemptEvent(rows)
		if err != nil {
			return nil, err
		}
		items = append(items, *item)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate exam events: %w", err)
	}
	return items, nil
}

func (s *Service) ListExamClassEvents(ctx context.Context, examID int64, classID int64, limit int) ([]AttemptEvent, error) {
	if examID <= 0 {
		return nil, ErrExamNotFound
	}
	if classID <= 0 {
		return nil, ErrInvalidInput
	}
	if limit <= 0 || limit > 500 {
		limit = 200
	}
	if err := s.ensureProktorExamScope(ctx, examID); err != nil {
		return nil, err
	}
	var schoolID int64
	if err := s.db.QueryRowContext(ctx, `
		SELECT school_id
		FROM classes
		WHERE id = $1
	`, classID).Scan(&schoolID); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrInvalidInput
		}
		return nil, fmt.Errorf("load class school: %w", err)
	}
	if err := s.ensureProktorSchoolScope(ctx, schoolID); err != nil {
		return nil, err
	}
	var exists bool
	if err := s.db.QueryRowContext(ctx, `
		SELECT EXISTS(SELECT 1 FROM exams WHERE id = $1)
	`, examID).Scan(&exists); err != nil {
		return nil, fmt.Errorf("load exam: %w", err)
	}
	if !exists {
		return nil, ErrExamNotFound
	}
	rows, err := s.db.QueryContext(ctx, `
		SELECT ae.id, ae.attempt_id, ae.event_type, ae.payload, ae.client_ts, ae.server_ts, ae.actor_user_id,
		       u.full_name, ae.created_at
		FROM attempt_events ae
		JOIN attempts a ON a.id = ae.attempt_id
		JOIN enrollments en ON en.user_id = a.student_id AND en.status = 'active'
		LEFT JOIN users u ON u.id = ae.actor_user_id
		WHERE a.exam_id = $1
		  AND en.class_id = $2
		ORDER BY ae.server_ts DESC, ae.id DESC
		LIMIT $3
	`, examID, classID, limit)
	if err != nil {
		return nil, fmt.Errorf("query class events: %w", err)
	}
	defer rows.Close()
	items := make([]AttemptEvent, 0)
	for rows.Next() {
		item, err := scanAttemptEvent(rows)
		if err != nil {
			return nil, err
		}
		items = append(items, *item)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate class events: %w", err)
	}
	return items, nil
}

func (s *Service) loadExamReviewPolicy(ctx context.Context, examID int64) (string, *time.Time, error) {
	var policy sql.NullString
	var endAt sql.NullTime
	if err := s.db.QueryRowContext(ctx, `
		SELECT review_policy, end_at
		FROM exams
		WHERE id = $1
	`, examID).Scan(&policy, &endAt); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return "", nil, ErrExamNotFound
		}
		return "", nil, fmt.Errorf("load exam review policy: %w", err)
	}

	p := strings.TrimSpace(policy.String)
	if p == "" {
		p = "after_submit"
	}

	var e *time.Time
	if endAt.Valid {
		e = &endAt.Time
	}
	return p, e, nil
}

func (s *Service) finalizeAttempt(ctx context.Context, attemptID int64, finalStatus string) (*AttemptSummary, error) {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, fmt.Errorf("begin finalize tx: %w", err)
	}
	defer func() { _ = tx.Rollback() }()

	row, err := s.loadAttemptRowForUpdate(ctx, tx, attemptID)
	if err != nil {
		return nil, err
	}

	if row.Status != "in_progress" {
		summary, err := s.buildSummaryFromRow(ctx, tx, row)
		if err != nil {
			return nil, err
		}
		if err := tx.Commit(); err != nil {
			return nil, fmt.Errorf("commit finalize existing: %w", err)
		}
		return summary, nil
	}

	now := time.Now()
	if now.After(row.ExpiresAt) && finalStatus == "submitted" {
		finalStatus = "expired"
	}

	if finalStatus == "expired" && now.Before(row.ExpiresAt) {
		summary, err := s.buildSummaryFromRow(ctx, tx, row)
		if err != nil {
			return nil, err
		}
		if err := tx.Commit(); err != nil {
			return nil, fmt.Errorf("commit finalize noop: %w", err)
		}
		return summary, nil
	}

	evals, err := s.loadQuestionEvaluations(ctx, tx, row.ExamID, row.ID)
	if err != nil {
		return nil, err
	}

	if _, err := tx.ExecContext(ctx, `DELETE FROM attempt_scores WHERE attempt_id = $1`, row.ID); err != nil {
		return nil, fmt.Errorf("clear attempt_scores: %w", err)
	}

	totalQuestions := len(evals)
	answered := 0
	totalCorrect := 0
	totalWrong := 0
	score := 0.0

	for _, ev := range evals {
		result := scoreQuestionWithIncident(ev)

		if result.Answered {
			answered++
		}
		if result.IsCorrect != nil && *result.IsCorrect {
			totalCorrect++
			score += result.EarnedScore
		} else if result.IsCorrect != nil && !*result.IsCorrect {
			totalWrong++
		} else if result.EarnedScore > 0 {
			score += result.EarnedScore
		}

		var isCorrectPtr interface{}
		if result.IsCorrect != nil {
			isCorrectPtr = *result.IsCorrect
		} else {
			isCorrectPtr = nil
		}

		feedback := map[string]interface{}{
			"selected":  result.Selected,
			"correct":   result.Correct,
			"reason":    result.Reason,
			"breakdown": result.Breakdown,
		}
		feedbackJSON, _ := json.Marshal(feedback)

		scoreHasTenant, err := hasColumn(ctx, tx, "attempt_scores", "tenant_id")
		if err != nil {
			return nil, err
		}
		var attemptTenantID *int64
		if scoreHasTenant {
			attemptTenantID, err = loadAttemptTenantID(ctx, tx, row.ID)
			if err != nil {
				return nil, err
			}
			if attemptTenantID == nil || *attemptTenantID <= 0 {
				return nil, fmt.Errorf("resolve attempt score tenant: tenant_id is required")
			}
		}
		scoreColumns := []string{"attempt_id", "question_id", "earned_score", "is_correct", "feedback"}
		scoreValues := []string{"$1", "$2", "$3", "$4", "$5::jsonb"}
		scoreArgs := []any{row.ID, ev.QuestionID, result.EarnedScore, isCorrectPtr, feedbackJSON}
		if scoreHasTenant {
			scoreColumns = append(scoreColumns, "tenant_id")
			scoreValues = append(scoreValues, fmt.Sprintf("$%d", len(scoreArgs)+1))
			scoreArgs = append(scoreArgs, *attemptTenantID)
		}
		if _, err := tx.ExecContext(ctx, fmt.Sprintf(`
			INSERT INTO attempt_scores (
				%s
			) VALUES (%s)
		`, strings.Join(scoreColumns, ", "), strings.Join(scoreValues, ", ")), scoreArgs...); err != nil {
			return nil, fmt.Errorf("insert attempt_score: %w", err)
		}
	}

	totalUnanswered := totalQuestions - answered

	if _, err := tx.ExecContext(ctx, `
		UPDATE attempt_answers
		SET is_final = TRUE,
			updated_at = now()
		WHERE attempt_id = $1
	`, row.ID); err != nil {
		return nil, fmt.Errorf("mark attempt_answers final: %w", err)
	}

	if _, err := tx.ExecContext(ctx, `
		UPDATE attempts
		SET status = $2,
			submitted_at = now(),
			score = $3,
			total_correct = $4,
			total_wrong = $5,
			total_unanswered = $6
		WHERE id = $1
	`, row.ID, finalStatus, score, totalCorrect, totalWrong, totalUnanswered); err != nil {
		return nil, fmt.Errorf("update attempt final: %w", err)
	}

	row, err = s.loadAttemptRowForUpdate(ctx, tx, row.ID)
	if err != nil {
		return nil, err
	}

	summary, err := s.buildSummaryFromRow(ctx, tx, row)
	if err != nil {
		return nil, err
	}

	if err := tx.Commit(); err != nil {
		return nil, fmt.Errorf("commit finalize: %w", err)
	}
	return summary, nil
}

func (s *Service) finalizeExpiredAttemptsForExam(ctx context.Context, examID int64) error {
	if examID <= 0 {
		return ErrInvalidInput
	}

	rows, err := s.db.QueryContext(ctx, `
		SELECT id
		FROM attempts
		WHERE exam_id = $1
		  AND status = 'in_progress'
		  AND expires_at <= now()
		ORDER BY expires_at ASC, id ASC
	`, examID)
	if err != nil {
		return fmt.Errorf("list expired attempts for exam: %w", err)
	}
	defer rows.Close()

	attemptIDs := make([]int64, 0)
	for rows.Next() {
		var attemptID int64
		if err := rows.Scan(&attemptID); err != nil {
			return fmt.Errorf("scan expired attempt for exam: %w", err)
		}
		attemptIDs = append(attemptIDs, attemptID)
	}
	if err := rows.Err(); err != nil {
		return fmt.Errorf("iterate expired attempts for exam: %w", err)
	}

	for _, attemptID := range attemptIDs {
		if _, err := s.finalizeAttempt(ctx, attemptID, "expired"); err != nil {
			return fmt.Errorf("finalize expired attempt %d: %w", attemptID, err)
		}
	}
	return nil
}

func (s *Service) FinalizeExpiredAttempts(ctx context.Context, limit int) (int, error) {
	if limit <= 0 {
		limit = 50
	}

	rows, err := s.db.QueryContext(ctx, `
		SELECT id
		FROM attempts
		WHERE status = 'in_progress'
		  AND expires_at <= now()
		ORDER BY expires_at ASC, id ASC
		LIMIT $1
	`, limit)
	if err != nil {
		return 0, fmt.Errorf("list expired attempts: %w", err)
	}
	defer rows.Close()

	attemptIDs := make([]int64, 0, limit)
	for rows.Next() {
		var attemptID int64
		if err := rows.Scan(&attemptID); err != nil {
			return 0, fmt.Errorf("scan expired attempt: %w", err)
		}
		attemptIDs = append(attemptIDs, attemptID)
	}
	if err := rows.Err(); err != nil {
		return 0, fmt.Errorf("iterate expired attempts: %w", err)
	}

	finalized := 0
	for _, attemptID := range attemptIDs {
		if _, err := s.finalizeAttempt(ctx, attemptID, "expired"); err != nil {
			return finalized, fmt.Errorf("finalize expired attempt %d: %w", attemptID, err)
		}
		finalized++
	}
	return finalized, nil
}

func (s *Service) recomputeFinalizedAttemptTx(ctx context.Context, tx *sql.Tx, attemptID int64) error {
	row, err := s.loadAttemptRowForUpdate(ctx, tx, attemptID)
	if err != nil {
		return err
	}
	if row.Status == "in_progress" {
		return nil
	}

	evals, err := s.loadQuestionEvaluations(ctx, tx, row.ExamID, row.ID)
	if err != nil {
		return err
	}

	if _, err := tx.ExecContext(ctx, `DELETE FROM attempt_scores WHERE attempt_id = $1`, row.ID); err != nil {
		return fmt.Errorf("clear attempt_scores recompute: %w", err)
	}

	totalQuestions := len(evals)
	answered := 0
	totalCorrect := 0
	totalWrong := 0
	score := 0.0

	for _, ev := range evals {
		result := scoreQuestionWithIncident(ev)
		if result.Answered {
			answered++
		}
		if result.IsCorrect != nil && *result.IsCorrect {
			totalCorrect++
			score += result.EarnedScore
		} else if result.IsCorrect != nil && !*result.IsCorrect {
			totalWrong++
		} else if result.EarnedScore > 0 {
			score += result.EarnedScore
		}

		var isCorrectPtr interface{}
		if result.IsCorrect != nil {
			isCorrectPtr = *result.IsCorrect
		}
		feedback := map[string]interface{}{
			"selected":  result.Selected,
			"correct":   result.Correct,
			"reason":    result.Reason,
			"breakdown": result.Breakdown,
		}
		feedbackJSON, _ := json.Marshal(feedback)

		scoreHasTenant, err := hasColumn(ctx, tx, "attempt_scores", "tenant_id")
		if err != nil {
			return err
		}
		var attemptTenantID *int64
		if scoreHasTenant {
			attemptTenantID, err = loadAttemptTenantID(ctx, tx, row.ID)
			if err != nil {
				return err
			}
			if attemptTenantID == nil || *attemptTenantID <= 0 {
				return fmt.Errorf("resolve attempt score tenant: tenant_id is required")
			}
		}
		scoreColumns := []string{"attempt_id", "question_id", "earned_score", "is_correct", "feedback"}
		scoreValues := []string{"$1", "$2", "$3", "$4", "$5::jsonb"}
		scoreArgs := []any{row.ID, ev.QuestionID, result.EarnedScore, isCorrectPtr, feedbackJSON}
		if scoreHasTenant {
			scoreColumns = append(scoreColumns, "tenant_id")
			scoreValues = append(scoreValues, fmt.Sprintf("$%d", len(scoreArgs)+1))
			scoreArgs = append(scoreArgs, *attemptTenantID)
		}
		if _, err := tx.ExecContext(ctx, fmt.Sprintf(`
			INSERT INTO attempt_scores (
				%s
			) VALUES (%s)
		`, strings.Join(scoreColumns, ", "), strings.Join(scoreValues, ", ")), scoreArgs...); err != nil {
			return fmt.Errorf("insert attempt_score recompute: %w", err)
		}
	}

	totalUnanswered := totalQuestions - answered
	if _, err := tx.ExecContext(ctx, `
		UPDATE attempts
		SET score = $2,
			total_correct = $3,
			total_wrong = $4,
			total_unanswered = $5
		WHERE id = $1
	`, row.ID, score, totalCorrect, totalWrong, totalUnanswered); err != nil {
		return fmt.Errorf("update attempt recompute: %w", err)
	}
	return nil
}

func scoreQuestionWithIncident(ev questionEvalRow) ScoreResult {
	switch normalizeIncidentPolicy(ev.IncidentPolicy) {
	case "drop":
		return ScoreResult{
			Answered:    false,
			IsCorrect:   nil,
			EarnedScore: 0,
			Reason:      "incident_drop",
		}
	case "bonus_all":
		return ScoreResult{
			Answered:    true,
			IsCorrect:   boolPtr(true),
			EarnedScore: ev.Weight,
			Reason:      "incident_bonus_all",
		}
	default:
		return ScoreQuestion(ScoreInput{
			QuestionType:  ev.QuestionType,
			AnswerKey:     ev.AnswerKey,
			AnswerPayload: ev.Payload,
			CorrectKeys:   ev.CorrectKeys,
			Weight:        ev.Weight,
		})
	}
}

func (s *Service) loadQuestionEvaluations(ctx context.Context, q queryable, examID, attemptID int64) ([]questionEvalRow, error) {
	rows, err := q.QueryContext(ctx, `
		SELECT
			eq.question_id,
			qn.question_type,
			eq.weight,
			COALESCE(aa.answer_payload, '{}'::jsonb) AS answer_payload,
			COALESCE(
				NULLIF(qv.answer_key, '{}'::jsonb),
				NULLIF(qv_fallback.answer_key, '{}'::jsonb),
				'{}'::jsonb
			) AS answer_key,
			COALESCE(i.policy, '') AS incident_policy,
			COALESCE(
				json_agg(qo.option_key) FILTER (WHERE qo.is_correct),
				'[]'::json
			) AS correct_keys_json
		FROM exam_questions eq
		JOIN questions qn
			ON qn.id = eq.question_id
		LEFT JOIN attempt_answers aa
			ON aa.attempt_id = $1
			AND aa.question_id = eq.question_id
		LEFT JOIN LATERAL (
			SELECT qv.answer_key
			FROM question_versions qv
			WHERE qv.question_id = eq.question_id
			ORDER BY CASE
				WHEN qv.version_no = qn.version THEN 0
				WHEN qv.status = 'final' THEN 1
				ELSE 2
			END, qv.is_active DESC, qv.version_no DESC
			LIMIT 1
		) qv ON TRUE
		LEFT JOIN LATERAL (
			SELECT qv2.answer_key
			FROM questions q2
			JOIN question_versions qv2 ON qv2.question_id = q2.id
			WHERE qn.question_code_id IS NOT NULL
			  AND q2.question_code_id = qn.question_code_id
			  AND q2.id <> qn.id
			  AND q2.question_type = qn.question_type
			  AND (
				NULLIF(btrim(qn.metadata->>'title'), '') IS NULL
				OR NULLIF(btrim(q2.metadata->>'title'), '') = NULLIF(btrim(qn.metadata->>'title'), '')
			  )
			  AND (
				NULLIF(btrim(qn.metadata->>'material'), '') IS NULL
				OR NULLIF(btrim(q2.metadata->>'material'), '') = NULLIF(btrim(qn.metadata->>'material'), '')
			  )
			ORDER BY CASE
				WHEN qv2.status = 'final' THEN 0
				ELSE 1
			END, qv2.is_active DESC, qv2.version_no DESC, q2.id DESC
			LIMIT 1
		) qv_fallback ON TRUE
		LEFT JOIN question_options qo
			ON qo.question_id = eq.question_id
		LEFT JOIN exam_question_incidents i
			ON i.exam_id = eq.exam_id
			AND i.question_id = eq.question_id
			AND i.is_active = TRUE
		WHERE eq.exam_id = $2
		GROUP BY eq.question_id, qn.question_type, eq.weight, aa.answer_payload, qv.answer_key, qv_fallback.answer_key, i.policy, eq.seq_no
		ORDER BY eq.seq_no
	`, attemptID, examID)
	if err != nil {
		return nil, fmt.Errorf("query evaluations: %w", err)
	}
	defer rows.Close()

	out := make([]questionEvalRow, 0)
	for rows.Next() {
		var r questionEvalRow
		var correctKeysJSON []byte
		if err := rows.Scan(&r.QuestionID, &r.QuestionType, &r.Weight, &r.Payload, &r.AnswerKey, &r.IncidentPolicy, &correctKeysJSON); err != nil {
			return nil, fmt.Errorf("scan evaluation row: %w", err)
		}
		if len(correctKeysJSON) > 0 {
			if err := json.Unmarshal(correctKeysJSON, &r.CorrectKeys); err != nil {
				return nil, fmt.Errorf("decode correct keys json: %w", err)
			}
		}
		out = append(out, r)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate evaluations: %w", err)
	}
	return out, nil
}

func (s *Service) loadAttemptResultItems(ctx context.Context, attemptID int64) ([]AttemptResultItem, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT
			s.question_id,
			q.question_type,
			s.earned_score,
			s.is_correct,
			s.feedback,
			COALESCE(NULLIF(qv.stem_html, ''), NULLIF(qv_fallback.stem_html, ''), q.stem_html) AS stem_html,
			COALESCE(qv.stimulus_html, qv_fallback.stimulus_html) AS version_stimulus_html,
			q.stimulus_html AS legacy_stimulus_html,
			COALESCE(NULLIF(qv.explanation_html, ''), NULLIF(qv_fallback.explanation_html, ''), NULL) AS explanation_html,
			q.metadata
		FROM attempt_scores s
		JOIN questions q ON q.id = s.question_id
		LEFT JOIN LATERAL (
			SELECT qv.stimulus_html, qv.stem_html, qv.explanation_html
			FROM question_versions qv
			WHERE qv.question_id = q.id
			ORDER BY CASE
				WHEN qv.version_no = q.version THEN 0
				WHEN qv.status = 'final' THEN 1
				ELSE 2
			END, qv.is_active DESC, qv.version_no DESC
			LIMIT 1
		) qv ON TRUE
		LEFT JOIN LATERAL (
			SELECT qv2.stimulus_html, qv2.stem_html, qv2.explanation_html
			FROM questions q2
			JOIN question_versions qv2 ON qv2.question_id = q2.id
			WHERE q.question_code_id IS NOT NULL
			  AND q2.question_code_id = q.question_code_id
			  AND q2.id <> q.id
			  AND q2.question_type = q.question_type
			  AND (
				NULLIF(btrim(q.metadata->>'title'), '') IS NULL
				OR NULLIF(btrim(q2.metadata->>'title'), '') = NULLIF(btrim(q.metadata->>'title'), '')
			  )
			  AND (
				NULLIF(btrim(q.metadata->>'material'), '') IS NULL
				OR NULLIF(btrim(q2.metadata->>'material'), '') = NULLIF(btrim(q.metadata->>'material'), '')
			  )
			ORDER BY CASE
				WHEN qv2.status = 'final' THEN 0
				ELSE 1
			END, qv2.is_active DESC, qv2.version_no DESC, q2.id DESC
			LIMIT 1
		) qv_fallback ON TRUE
		WHERE s.attempt_id = $1
		ORDER BY s.question_id ASC
	`, attemptID)
	if err != nil {
		return nil, fmt.Errorf("query attempt result items: %w", err)
	}
	defer rows.Close()

	items := make([]AttemptResultItem, 0)
	questionIDs := make([]int64, 0)
	for rows.Next() {
		var (
			item        AttemptResultItem
			isCorrect   sql.NullBool
			feedbackRaw []byte
			versionStim sql.NullString
			legacyStim  sql.NullString
			explanation sql.NullString
			metadata    json.RawMessage
		)
		if err := rows.Scan(
			&item.QuestionID,
			&item.QuestionType,
			&item.EarnedScore,
			&isCorrect,
			&feedbackRaw,
			&item.StemHTML,
			&versionStim,
			&legacyStim,
			&explanation,
			&metadata,
		); err != nil {
			return nil, fmt.Errorf("scan result item: %w", err)
		}
		if isCorrect.Valid {
			v := isCorrect.Bool
			item.IsCorrect = &v
		}
		item.StimulusHTML = resolveAttemptStimulusHTML(versionStim, legacyStim, metadata)
		if explanation.Valid {
			text := strings.TrimSpace(explanation.String)
			if text != "" {
				item.ExplanationHTML = &text
			}
		}
		if len(feedbackRaw) > 0 {
			var f map[string]interface{}
			if err := json.Unmarshal(feedbackRaw, &f); err == nil {
				item.Selected = anyToStringSlice(f["selected"])
				item.Correct = anyToStringSlice(f["correct"])
				if reason, ok := f["reason"].(string); ok {
					item.Reason = strings.TrimSpace(reason)
				}
				item.Breakdown = anyToStatementScores(f["breakdown"])
			}
		}
		items = append(items, item)
		questionIDs = append(questionIDs, item.QuestionID)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate result items: %w", err)
	}

	if len(questionIDs) == 0 {
		return items, nil
	}

	placeholders := make([]string, 0, len(questionIDs))
	args := make([]any, 0, len(questionIDs))
	for i, id := range questionIDs {
		placeholders = append(placeholders, fmt.Sprintf("$%d", i+1))
		args = append(args, id)
	}
	optRows, err := s.db.QueryContext(ctx, `
		SELECT question_id, option_key, option_html
		FROM question_options
		WHERE question_id IN (`+strings.Join(placeholders, ",")+`)
		ORDER BY question_id ASC, option_key ASC
	`, args...)
	if err != nil {
		return nil, fmt.Errorf("query result options: %w", err)
	}
	defer optRows.Close()

	optionsByQuestion := make(map[int64][]QuestionOption)
	for optRows.Next() {
		var (
			qid int64
			opt QuestionOption
		)
		if err := optRows.Scan(&qid, &opt.OptionKey, &opt.OptionHTML); err != nil {
			return nil, fmt.Errorf("scan result option: %w", err)
		}
		optionsByQuestion[qid] = append(optionsByQuestion[qid], opt)
	}
	if err := optRows.Err(); err != nil {
		return nil, fmt.Errorf("iterate result options: %w", err)
	}

	for i := range items {
		if opts, ok := optionsByQuestion[items[i].QuestionID]; ok {
			items[i].Options = opts
		}
	}
	return items, nil
}

func (s *Service) buildSummaryFromRow(ctx context.Context, q queryable, row *attemptRow) (*AttemptSummary, error) {
	examCode, examTitle, subjectName, teacherName, examStartAt, examEndAt, err := s.loadAttemptSummaryMeta(ctx, q, row.ExamID)
	if err != nil {
		return nil, err
	}
	classID, className, schoolName, err := s.loadStudentClassInfo(ctx, q, row.StudentID)
	if err != nil {
		return nil, err
	}

	totalQuestions, answered, doubt, err := s.countProgress(ctx, q, row.ID, row.ExamID)
	if err != nil {
		return nil, err
	}
	randomizeQuestions, _, err := s.loadExamRandomizeConfig(ctx, row.ExamID)
	if err != nil {
		return nil, err
	}
	pageRefs, err := s.orderedAttemptQuestionRefs(ctx, row.ExamID, row.ID, randomizeQuestions)
	if err != nil {
		return nil, err
	}
	totalWeight, err := s.loadExamTotalWeight(ctx, q, row.ExamID)
	if err != nil {
		return nil, err
	}

	summary := &AttemptSummary{
		ID:             row.ID,
		ExamID:         row.ExamID,
		ExamCode:       examCode,
		Title:          examTitle,
		SubjectName:    subjectName,
		TeacherName:    teacherName,
		StudentID:      row.StudentID,
		ClassName:      className,
		SchoolName:     schoolName,
		Status:         row.Status,
		StartedAt:      row.StartedAt,
		ExpiresAt:      row.ExpiresAt,
		ExamStartAt:    examStartAt,
		ExamEndAt:      examEndAt,
		TotalQuestions: totalQuestions,
		TotalPages:     countAttemptPages(pageRefs),
		TotalWeight:    totalWeight,
		Answered:       answered,
		Doubt:          doubt,
		RemainingSecs:  remainingSeconds(row.Status, row.ExpiresAt),
	}
	if classID > 0 {
		avgScore, err := s.loadClassAverageScore(ctx, q, row.ExamID, classID)
		if err != nil {
			return nil, err
		}
		summary.ClassAvgScore = avgScore
	}

	if row.SubmittedAt.Valid {
		summary.SubmittedAt = &row.SubmittedAt.Time
	}
	if row.Score.Valid {
		summary.Score = row.Score.Float64
	}
	if row.TotalCorrect.Valid {
		summary.TotalCorrect = int(row.TotalCorrect.Int64)
	}
	if row.TotalWrong.Valid {
		summary.TotalWrong = int(row.TotalWrong.Int64)
	}
	if row.TotalUnanswered.Valid {
		summary.TotalUnanswered = int(row.TotalUnanswered.Int64)
	} else {
		summary.TotalUnanswered = totalQuestions - answered
	}

	if row.Status == "in_progress" {
		summary.TotalCorrect = 0
		summary.TotalWrong = 0
		summary.TotalUnanswered = totalQuestions - answered
	}

	return summary, nil
}

func (s *Service) loadStudentClassInfo(ctx context.Context, q queryable, studentID int64) (int64, string, string, error) {
	if studentID <= 0 {
		return 0, "", "", ErrInvalidInput
	}
	var (
		classID    sql.NullInt64
		className  sql.NullString
		schoolName sql.NullString
	)
	if err := q.QueryRowContext(ctx, `
		SELECT
			c.id,
			COALESCE(c.name, ''),
			COALESCE(s.name, '')
		FROM enrollments e
		JOIN classes c ON c.id = e.class_id
		JOIN schools s ON s.id = e.school_id
		WHERE e.user_id = $1
		  AND e.status = 'active'
		ORDER BY e.enrolled_at DESC, e.id DESC
		LIMIT 1
	`, studentID).Scan(&classID, &className, &schoolName); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return 0, "", "", nil
		}
		return 0, "", "", fmt.Errorf("load student class info: %w", err)
	}
	if !classID.Valid {
		return 0, "", "", nil
	}
	return classID.Int64, strings.TrimSpace(className.String), strings.TrimSpace(schoolName.String), nil
}

func (s *Service) loadClassAverageScore(ctx context.Context, q queryable, examID, classID int64) (float64, error) {
	if examID <= 0 || classID <= 0 {
		return 0, ErrInvalidInput
	}
	var avg sql.NullFloat64
	if err := q.QueryRowContext(ctx, `
		WITH latest AS (
			SELECT DISTINCT ON (a.student_id)
				a.student_id,
				a.score
			FROM attempts a
			JOIN enrollments e ON e.user_id = a.student_id
			WHERE a.exam_id = $1
			  AND e.class_id = $2
			  AND e.status = 'active'
			  AND a.score IS NOT NULL
			ORDER BY a.student_id, a.started_at DESC, a.id DESC
		)
		SELECT COALESCE(AVG(score), 0)
		FROM latest
	`, examID, classID).Scan(&avg); err != nil {
		return 0, fmt.Errorf("load class average score: %w", err)
	}
	if !avg.Valid {
		return 0, nil
	}
	return avg.Float64, nil
}

func (s *Service) loadAttemptSummaryMeta(ctx context.Context, q queryable, examID int64) (examCode, title, subjectName, teacherName string, examStartAt, examEndAt *time.Time, err error) {
	var (
		codeRaw    sql.NullString
		titleRaw   sql.NullString
		subjectRaw sql.NullString
		teacherRaw sql.NullString
		startAtRaw sql.NullTime
		endAtRaw   sql.NullTime
	)
	if err := q.QueryRowContext(ctx, `
		SELECT
			e.code,
			e.title,
			COALESCE(s.name, '') AS subject_name,
			COALESCE(u.full_name, '') AS teacher_name,
			e.start_at,
			e.end_at
		FROM exams e
		LEFT JOIN subjects s ON s.id = e.subject_id
		LEFT JOIN users u ON u.id = e.created_by
		WHERE e.id = $1
	`, examID).Scan(&codeRaw, &titleRaw, &subjectRaw, &teacherRaw, &startAtRaw, &endAtRaw); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return "", "", "", "", nil, nil, ErrExamNotFound
		}
		return "", "", "", "", nil, nil, fmt.Errorf("load attempt summary meta: %w", err)
	}
	if startAtRaw.Valid {
		v := startAtRaw.Time
		examStartAt = &v
	}
	if endAtRaw.Valid {
		v := endAtRaw.Time
		examEndAt = &v
	}
	return strings.TrimSpace(codeRaw.String), strings.TrimSpace(titleRaw.String), strings.TrimSpace(subjectRaw.String), strings.TrimSpace(teacherRaw.String), examStartAt, examEndAt, nil
}

func (s *Service) loadExamTitle(ctx context.Context, q queryable, examID int64) (string, error) {
	_, title, _, _, _, _, err := s.loadAttemptSummaryMeta(ctx, q, examID)
	if err != nil {
		return "", err
	}
	return title, nil
}

func (s *Service) ListStudentExamOptions(ctx context.Context, studentID int64) ([]StudentExamOption, error) {
	if studentID <= 0 {
		return nil, ErrInvalidInput
	}
	rows, err := s.db.QueryContext(ctx, `
		SELECT DISTINCT ON (e.id)
			e.id,
			e.code,
			e.title,
			COALESCE(s.name, '') AS subject_name,
			e.created_at
		FROM attempts a
		JOIN exams e ON e.id = a.exam_id
		LEFT JOIN subjects s ON s.id = e.subject_id
		WHERE a.student_id = $1
		ORDER BY e.id, e.created_at DESC
	`, studentID)
	if err != nil {
		return nil, fmt.Errorf("list student exams: %w", err)
	}
	defer rows.Close()

	items := make([]StudentExamOption, 0)
	for rows.Next() {
		var it StudentExamOption
		var createdAt time.Time
		if err := rows.Scan(&it.ID, &it.Code, &it.Title, &it.SubjectName, &createdAt); err != nil {
			return nil, fmt.Errorf("scan student exam: %w", err)
		}
		items = append(items, it)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate student exams: %w", err)
	}
	return items, nil
}

func (s *Service) ListStudentExamAttempts(ctx context.Context, examID, studentID int64) (*StudentExamAttempts, error) {
	if examID <= 0 || studentID <= 0 {
		return nil, ErrInvalidInput
	}
	title, err := s.loadExamTitle(ctx, s.db, examID)
	if err != nil {
		return nil, err
	}
	totalWeight, err := s.loadExamTotalWeight(ctx, s.db, examID)
	if err != nil {
		return nil, err
	}
	totalQuestions, err := s.loadExamQuestionCount(ctx, s.db, examID)
	if err != nil {
		return nil, err
	}
	rows, err := s.db.QueryContext(ctx, `
		SELECT id, status, COALESCE(score, 0), started_at, submitted_at
		FROM attempts
		WHERE exam_id = $1 AND student_id = $2
		ORDER BY started_at ASC, id ASC
	`, examID, studentID)
	if err != nil {
		return nil, fmt.Errorf("list student exam attempts: %w", err)
	}
	defer rows.Close()

	attempts := make([]StudentAttemptSummary, 0)
	attemptNo := 0
	for rows.Next() {
		var it StudentAttemptSummary
		var submittedAt sql.NullTime
		if err := rows.Scan(&it.AttemptID, &it.Status, &it.Score, &it.StartedAt, &submittedAt); err != nil {
			return nil, fmt.Errorf("scan student attempt: %w", err)
		}
		attemptNo += 1
		it.AttemptNo = attemptNo
		if submittedAt.Valid {
			it.SubmittedAt = &submittedAt.Time
		}
		attempts = append(attempts, it)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate student attempts: %w", err)
	}
	return &StudentExamAttempts{
		ExamID:         examID,
		ExamTitle:      title,
		TotalWeight:    totalWeight,
		TotalQuestions: totalQuestions,
		Attempts:       attempts,
	}, nil
}

func (s *Service) loadExamTotalWeight(ctx context.Context, q queryable, examID int64) (float64, error) {
	var total sql.NullFloat64
	if err := q.QueryRowContext(ctx, `
		SELECT COALESCE(SUM(weight), 0)
		FROM exam_questions
		WHERE exam_id = $1
	`, examID).Scan(&total); err != nil {
		return 0, fmt.Errorf("load exam total weight: %w", err)
	}
	if total.Valid {
		return total.Float64, nil
	}
	return 0, nil
}

func (s *Service) loadExamQuestionCount(ctx context.Context, q queryable, examID int64) (int, error) {
	var total int
	if err := q.QueryRowContext(ctx, `
		SELECT COUNT(*)
		FROM exam_questions
		WHERE exam_id = $1
	`, examID).Scan(&total); err != nil {
		return 0, fmt.Errorf("load exam question count: %w", err)
	}
	return total, nil
}

func (s *Service) countProgress(ctx context.Context, q queryable, attemptID, examID int64) (totalQuestions, answered, doubt int, err error) {
	if err = q.QueryRowContext(ctx, `
		SELECT COUNT(*)
		FROM exam_questions
		WHERE exam_id = $1
	`, examID).Scan(&totalQuestions); err != nil {
		return 0, 0, 0, fmt.Errorf("count total questions: %w", err)
	}

	if err = q.QueryRowContext(ctx, `
		SELECT
			COUNT(*) FILTER (
				WHERE answer_payload IS NOT NULL
				  AND answer_payload <> '{}'::jsonb
			),
			COUNT(*) FILTER (WHERE is_doubt = TRUE)
		FROM attempt_answers
		WHERE attempt_id = $1
	`, attemptID).Scan(&answered, &doubt); err != nil {
		return 0, 0, 0, fmt.Errorf("count answers: %w", err)
	}

	if answered > totalQuestions {
		answered = totalQuestions
	}

	return totalQuestions, answered, doubt, nil
}

func (s *Service) loadAttemptRow(ctx context.Context, q queryable, attemptID int64) (*attemptRow, error) {
	row := &attemptRow{}
	err := q.QueryRowContext(ctx, `
		SELECT
			id,
			exam_id,
			student_id,
			status,
			started_at,
			expires_at,
			submitted_at,
			score,
			total_correct,
			total_wrong,
			total_unanswered
		FROM attempts
		WHERE id = $1
	`, attemptID).Scan(
		&row.ID,
		&row.ExamID,
		&row.StudentID,
		&row.Status,
		&row.StartedAt,
		&row.ExpiresAt,
		&row.SubmittedAt,
		&row.Score,
		&row.TotalCorrect,
		&row.TotalWrong,
		&row.TotalUnanswered,
	)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrAttemptNotFound
		}
		return nil, fmt.Errorf("load attempt: %w", err)
	}
	return row, nil
}

func (s *Service) loadAttemptRowForUpdate(ctx context.Context, tx *sql.Tx, attemptID int64) (*attemptRow, error) {
	row := &attemptRow{}
	err := tx.QueryRowContext(ctx, `
		SELECT
			id,
			exam_id,
			student_id,
			status,
			started_at,
			expires_at,
			submitted_at,
			score,
			total_correct,
			total_wrong,
			total_unanswered
		FROM attempts
		WHERE id = $1
		FOR UPDATE
	`, attemptID).Scan(
		&row.ID,
		&row.ExamID,
		&row.StudentID,
		&row.Status,
		&row.StartedAt,
		&row.ExpiresAt,
		&row.SubmittedAt,
		&row.Score,
		&row.TotalCorrect,
		&row.TotalWrong,
		&row.TotalUnanswered,
	)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrAttemptNotFound
		}
		return nil, fmt.Errorf("load attempt for update: %w", err)
	}
	return row, nil
}

type queryable interface {
	QueryRowContext(ctx context.Context, query string, args ...interface{}) *sql.Row
	QueryContext(ctx context.Context, query string, args ...interface{}) (*sql.Rows, error)
}

func scanAttemptEvent(scanner interface{ Scan(dest ...any) error }) (*AttemptEvent, error) {
	var out AttemptEvent
	var clientTS sql.NullTime
	var actorUserID sql.NullInt64
	var actorName sql.NullString
	if err := scanner.Scan(
		&out.ID,
		&out.AttemptID,
		&out.EventType,
		&out.Payload,
		&clientTS,
		&out.ServerTS,
		&actorUserID,
		&actorName,
		&out.CreatedAt,
	); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrAttemptNotFound
		}
		return nil, fmt.Errorf("scan attempt event: %w", err)
	}
	if clientTS.Valid {
		out.ClientTS = &clientTS.Time
	}
	if actorUserID.Valid {
		out.ActorUserID = &actorUserID.Int64
	}
	if actorName.Valid {
		out.ActorName = &actorName.String
	}
	return &out, nil
}

func remainingSeconds(status string, expiresAt time.Time) int64 {
	if status != "in_progress" {
		return 0
	}
	remaining := time.Until(expiresAt)
	if remaining <= 0 {
		return 0
	}
	return int64(remaining.Seconds())
}

func extractSelectedKeys(payload []byte) []string {
	if len(payload) == 0 {
		return nil
	}

	var obj map[string]interface{}
	if err := json.Unmarshal(payload, &obj); err != nil {
		return nil
	}

	v, ok := obj["selected"]
	if !ok {
		return nil
	}

	set := map[string]struct{}{}
	switch t := v.(type) {
	case string:
		x := strings.TrimSpace(t)
		if x != "" {
			set[x] = struct{}{}
		}
	case []interface{}:
		for _, item := range t {
			s, ok := item.(string)
			if !ok {
				continue
			}
			s = strings.TrimSpace(s)
			if s != "" {
				set[s] = struct{}{}
			}
		}
	}

	out := make([]string, 0, len(set))
	for k := range set {
		out = append(out, k)
	}
	sort.Strings(out)
	return out
}

func equalSet(a, b []string) bool {
	if len(a) != len(b) {
		return false
	}
	aa := append([]string(nil), a...)
	bb := append([]string(nil), b...)
	sort.Strings(aa)
	sort.Strings(bb)
	for i := range aa {
		if aa[i] != bb[i] {
			return false
		}
	}
	return true
}

func anyToStringSlice(v interface{}) []string {
	set := map[string]struct{}{}
	switch t := v.(type) {
	case string:
		s := strings.TrimSpace(t)
		if s != "" {
			set[s] = struct{}{}
		}
	case []interface{}:
		for _, it := range t {
			if s, ok := it.(string); ok {
				s = strings.TrimSpace(s)
				if s != "" {
					set[s] = struct{}{}
				}
				continue
			}
			obj, ok := it.(map[string]interface{})
			if !ok {
				continue
			}
			id, _ := obj["id"].(string)
			id = strings.TrimSpace(id)
			if id == "" {
				continue
			}
			if val, ok := obj["value"].(bool); ok {
				set[id+":"+boolLabelTF(val)] = struct{}{}
				continue
			}
			if val, ok := obj["correct"].(bool); ok {
				set[id+":"+boolLabelTF(val)] = struct{}{}
				continue
			}
		}
	case []string:
		for _, s := range t {
			s = strings.TrimSpace(s)
			if s != "" {
				set[s] = struct{}{}
			}
		}
	}
	out := make([]string, 0, len(set))
	for k := range set {
		out = append(out, k)
	}
	sort.Strings(out)
	return out
}

func anyToStatementScores(v interface{}) []StatementScore {
	arr, ok := v.([]interface{})
	if !ok || len(arr) == 0 {
		return nil
	}

	out := make([]StatementScore, 0, len(arr))
	for _, it := range arr {
		obj, ok := it.(map[string]interface{})
		if !ok {
			continue
		}
		id, _ := obj["id"].(string)
		id = strings.TrimSpace(id)
		correct, ok := obj["correct"].(bool)
		if id == "" || !ok {
			continue
		}
		var answer *bool
		if val, ok := obj["answer"].(bool); ok {
			answer = &val
		}
		out = append(out, StatementScore{
			ID:      id,
			Correct: correct,
			Answer:  answer,
		})
	}
	if len(out) == 0 {
		return nil
	}
	return out
}

func formatAnswerForResultsMatrix(questionType string, payload []byte) string {
	qType := strings.TrimSpace(strings.ToLower(questionType))
	if len(payload) == 0 {
		return ""
	}
	var obj map[string]interface{}
	if err := json.Unmarshal(payload, &obj); err != nil {
		return ""
	}
	switch qType {
	case "pg_tunggal":
		selected, _ := obj["selected"].(string)
		return strings.ToUpper(strings.TrimSpace(selected))
	case "multi_jawaban":
		keys := anyToStringSlice(obj["selected"])
		if len(keys) == 0 {
			return ""
		}
		return strings.Join(keys, "")
	case "benar_salah_pernyataan":
		rawAnswers, ok := obj["answers"].([]interface{})
		if !ok || len(rawAnswers) == 0 {
			return ""
		}
		type tfPair struct {
			ID    string
			Value bool
		}
		pairs := make([]tfPair, 0, len(rawAnswers))
		for _, it := range rawAnswers {
			o, ok := it.(map[string]interface{})
			if !ok {
				continue
			}
			id, _ := o["id"].(string)
			id = strings.TrimSpace(id)
			val, ok := o["value"].(bool)
			if id == "" || !ok {
				continue
			}
			pairs = append(pairs, tfPair{ID: id, Value: val})
		}
		sort.SliceStable(pairs, func(i, j int) bool {
			return pairs[i].ID < pairs[j].ID
		})
		if len(pairs) == 0 {
			return ""
		}
		var b strings.Builder
		for _, p := range pairs {
			if p.Value {
				b.WriteByte('T')
			} else {
				b.WriteByte('F')
			}
		}
		return b.String()
	case "menjodohkan_drag_drop":
		rawPairs, ok := obj["pairs"].([]interface{})
		if !ok || len(rawPairs) == 0 {
			return ""
		}
		pairs := make([]string, 0, len(rawPairs))
		for _, it := range rawPairs {
			o, ok := it.(map[string]interface{})
			if !ok {
				continue
			}
			promptID, _ := o["prompt_id"].(string)
			choiceID, _ := o["choice_id"].(string)
			promptID = strings.TrimSpace(promptID)
			choiceID = strings.TrimSpace(choiceID)
			if promptID == "" || choiceID == "" {
				continue
			}
			pairs = append(pairs, promptID+":"+choiceID)
		}
		sort.Strings(pairs)
		return strings.Join(pairs, "|")
	case "short_answer":
		text, _ := obj["text"].(string)
		return strings.TrimSpace(text)
	default:
		return ""
	}
}

func formatAnswerKeyForResultsMatrix(questionType string, payload []byte) string {
	qType := strings.TrimSpace(strings.ToLower(questionType))
	if len(payload) == 0 {
		return ""
	}
	switch qType {
	case "pg_tunggal":
		var obj struct {
			Correct string `json:"correct"`
		}
		if err := json.Unmarshal(payload, &obj); err != nil {
			return ""
		}
		return strings.ToUpper(strings.TrimSpace(obj.Correct))
	case "multi_jawaban":
		var obj struct {
			Correct []string `json:"correct"`
		}
		if err := json.Unmarshal(payload, &obj); err != nil {
			return ""
		}
		keys := make([]string, 0, len(obj.Correct))
		for _, key := range obj.Correct {
			key = strings.ToUpper(strings.TrimSpace(key))
			if key != "" {
				keys = append(keys, key)
			}
		}
		return strings.Join(keys, ",")
	case "benar_salah_pernyataan":
		var obj struct {
			Statements []struct {
				Correct bool `json:"correct"`
			} `json:"statements"`
		}
		if err := json.Unmarshal(payload, &obj); err != nil {
			return ""
		}
		if len(obj.Statements) == 0 {
			return ""
		}
		vals := make([]string, 0, len(obj.Statements))
		for _, st := range obj.Statements {
			if st.Correct {
				vals = append(vals, "T")
				continue
			}
			vals = append(vals, "F")
		}
		return strings.Join(vals, ",")
	case "menjodohkan_drag_drop":
		var obj struct {
			Pairs []struct {
				PromptID string `json:"prompt_id"`
				ChoiceID string `json:"choice_id"`
			} `json:"pairs"`
		}
		if err := json.Unmarshal(payload, &obj); err != nil {
			return ""
		}
		if len(obj.Pairs) == 0 {
			return ""
		}
		pairs := make([]string, 0, len(obj.Pairs))
		for _, pair := range obj.Pairs {
			promptID := strings.TrimSpace(pair.PromptID)
			choiceID := strings.TrimSpace(pair.ChoiceID)
			if promptID == "" || choiceID == "" {
				continue
			}
			pairs = append(pairs, promptID+":"+choiceID)
		}
		sort.Strings(pairs)
		return strings.Join(pairs, "|")
	case "short_answer":
		var obj struct {
			AcceptedAnswers []string `json:"accepted_answers"`
		}
		if err := json.Unmarshal(payload, &obj); err != nil {
			return ""
		}
		if len(obj.AcceptedAnswers) == 0 {
			return ""
		}
		vals := make([]string, 0, len(obj.AcceptedAnswers))
		for _, answer := range obj.AcceptedAnswers {
			answer = strings.TrimSpace(answer)
			if answer != "" {
				vals = append(vals, answer)
			}
		}
		return strings.Join(vals, " | ")
	default:
		return ""
	}
}

func boolLabelTF(v bool) string {
	if v {
		return "T"
	}
	return "F"
}

func canViewResultByPolicy(policy, attemptStatus string, examEndAt *time.Time) bool {
	finalized := attemptStatus == "submitted" || attemptStatus == "expired"
	if !finalized {
		return false
	}

	switch strings.TrimSpace(policy) {
	case "score_only":
		return true
	case "", "after_submit":
		return true
	case "after_exam_end":
		if examEndAt == nil {
			return false
		}
		return time.Now().After(*examEndAt) || time.Now().Equal(*examEndAt)
	case "immediate":
		return true
	case "disabled":
		return false
	case "manual_release":
		return false
	default:
		// Safe fallback: treat unknown policy like after_submit.
		return true
	}
}
