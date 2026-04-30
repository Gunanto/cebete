package question

import (
	"bytes"
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"html"
	"sort"
	"strings"
	"time"
)

var (
	ErrInvalidInput          = errors.New("invalid input")
	ErrSubjectNotFound       = errors.New("subject not found")
	ErrLearningGoalNotFound  = errors.New("learning goal not found")
	ErrQuestionCodeNotFound  = errors.New("question code not found")
	ErrQuestionCodeExists    = errors.New("question code already exists")
	ErrQuestionCodeTenantReq = errors.New("question code tenant required")
	ErrForbidden             = errors.New("forbidden")
	ErrExamNotFound          = errors.New("exam not found")
	ErrQuestionNotFound      = errors.New("question not found")
	ErrParallelNotFound      = errors.New("question parallel not found")
	ErrQuestionNotInExam     = errors.New("question not in exam")
	ErrVersionNotFound       = errors.New("question version not found")
	ErrStimulusGroupNotFound = errors.New("stimulus group not found")
	ErrStimulusGroupFeature  = errors.New("stimulus group migration required")
	ErrReviewTaskNotFound    = errors.New("review task not found")
	ErrReviewForbidden       = errors.New("review forbidden")
	ErrReopenNotAllowed      = errors.New("reopen final tidak diizinkan karena soal sudah pernah dipakai ujian")
	ErrReopenPending         = errors.New("permintaan reopen final masih menunggu persetujuan")
	ErrUserNotFound          = errors.New("user not found")
)

type DuplicateQuestionError struct {
	ExistingQuestionID int64
}

func (e *DuplicateQuestionError) Error() string {
	return "duplicate question content"
}

type Service struct {
	db *sql.DB
}

type columnQuerier interface {
	QueryRowContext(ctx context.Context, query string, args ...any) *sql.Row
}

func (s *Service) ensureSubjectAccess(ctx context.Context, subjectID, actorID int64, enforceOwner bool) error {
	if subjectID <= 0 {
		return ErrInvalidInput
	}
	var createdBy sql.NullInt64
	if err := s.db.QueryRowContext(ctx, `
		SELECT created_by
		FROM subjects
		WHERE id = $1
		  AND is_active = TRUE
	`, subjectID).Scan(&createdBy); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return ErrSubjectNotFound
		}
		return fmt.Errorf("load subject access: %w", err)
	}
	if enforceOwner && (!createdBy.Valid || createdBy.Int64 != actorID) {
		return ErrForbidden
	}
	return nil
}

func isUndefinedTableErr(err error, table string) bool {
	if err == nil {
		return false
	}
	lower := strings.ToLower(err.Error())
	if table == "" {
		return strings.Contains(lower, "does not exist") || strings.Contains(lower, "undefined_table")
	}
	return strings.Contains(lower, `relation "`+strings.ToLower(table)+`" does not exist`) ||
		(strings.Contains(lower, "undefined_table") && strings.Contains(lower, strings.ToLower(table)))
}

type CreateQuestionInput struct {
	SubjectID      int64
	LearningGoalID int64
	QuestionCodeID *int64
	EnforceOwner   bool
	QuestionType   string
	Title          string
	Indicator      string
	Material       string
	Objective      string
	CognitiveLevel string
	Difficulty     *int
	CreatedBy      int64
}

type QuestionBlueprint struct {
	ID             int64           `json:"id"`
	SubjectID      int64           `json:"subject_id"`
	LearningGoalID int64           `json:"learning_goal_id"`
	QuestionCodeID *int64          `json:"question_code_id,omitempty"`
	QuestionCode   *string         `json:"question_code,omitempty"`
	StemPreview    string          `json:"stem_preview,omitempty"`
	EducationLevel string          `json:"education_level"`
	SubjectType    string          `json:"subject_type"`
	SubjectName    string          `json:"subject_name"`
	QuestionType   string          `json:"question_type"`
	Title          string          `json:"title"`
	Indicator      string          `json:"indicator"`
	Material       string          `json:"material"`
	Objective      string          `json:"objective"`
	CognitiveLevel string          `json:"cognitive_level"`
	Difficulty     *int            `json:"difficulty,omitempty"`
	CreatedAt      time.Time       `json:"created_at"`
	UpdatedAt      time.Time       `json:"updated_at"`
	Metadata       json.RawMessage `json:"metadata,omitempty"`
}

type CreateQuestionVersionInput struct {
	QuestionID      int64
	StimulusGroupID *int64
	StimulusType    *string
	StimulusContent json.RawMessage
	StimulusHTML    *string
	StemHTML        *string
	ExplanationHTML *string
	HintHTML        *string
	QuestionContent json.RawMessage
	AnswerKey       json.RawMessage
	Options         []QuestionOptionInput
	DurationSeconds *int
	Weight          *float64
	ChangeNote      *string
	CreatedBy       int64
	EnforceOwner    bool
	Dedup           bool
}

type QuestionCode struct {
	ID        int64      `json:"id"`
	SubjectID int64      `json:"subject_id"`
	Code      string     `json:"code"`
	Name      string     `json:"name"`
	IsActive  bool       `json:"is_active"`
	CreatedBy *int64     `json:"created_by,omitempty"`
	CreatedAt time.Time  `json:"created_at"`
	UpdatedAt *time.Time `json:"updated_at,omitempty"`
}

type CreateQuestionCodeInput struct {
	SubjectID int64
	Code      string
	Name      string
	CreatedBy int64
}

type UpdateQuestionCodeInput struct {
	ID           int64
	SubjectID    int64
	Code         string
	Name         string
	ActorID      int64
	EnforceOwner bool
}

type AssignQuestionCodeInput struct {
	QuestionID     int64
	QuestionCodeID *int64
	ActorID        int64
	EnforceOwner   bool
}

type AssignQuestionLearningGoalInput struct {
	QuestionID     int64
	LearningGoalID int64
	ActorID        int64
	EnforceOwner   bool
}

type UpdateQuestionVersionInput struct {
	QuestionID      int64
	VersionNo       int
	QuestionType    *string
	StimulusGroupID *int64
	StimulusType    *string
	StimulusContent json.RawMessage
	StimulusHTML    *string
	StemHTML        *string
	ExplanationHTML *string
	HintHTML        *string
	QuestionContent json.RawMessage
	AnswerKey       json.RawMessage
	Options         []QuestionOptionInput
	DurationSeconds *int
	Weight          *float64
	ChangeNote      *string
	ActorID         int64
	EnforceOwner    bool
}

type QuestionOptionInput struct {
	OptionKey  string `json:"option_key"`
	OptionHTML string `json:"option_html"`
}

type QuestionVersion struct {
	ID              int64                 `json:"id"`
	QuestionID      int64                 `json:"question_id"`
	VersionNo       int                   `json:"version_no"`
	StimulusGroupID *int64                `json:"stimulus_group_id,omitempty"`
	StimulusType    *string               `json:"stimulus_type,omitempty"`
	StimulusContent json.RawMessage       `json:"stimulus_content,omitempty"`
	StimulusHTML    *string               `json:"stimulus_html,omitempty"`
	StemHTML        string                `json:"stem_html"`
	ExplanationHTML *string               `json:"explanation_html,omitempty"`
	HintHTML        *string               `json:"hint_html,omitempty"`
	QuestionContent json.RawMessage       `json:"question_content,omitempty"`
	AnswerKey       json.RawMessage       `json:"answer_key"`
	Status          string                `json:"status"`
	IsPublic        bool                  `json:"is_public"`
	IsActive        bool                  `json:"is_active"`
	DurationSeconds *int                  `json:"duration_seconds,omitempty"`
	Weight          float64               `json:"weight"`
	ChangeNote      *string               `json:"change_note,omitempty"`
	Options         []QuestionOptionInput `json:"options,omitempty"`
	CreatedBy       *int64                `json:"created_by,omitempty"`
	CreatedAt       time.Time             `json:"created_at"`
}

type CreateStimulusGroupInput struct {
	SubjectID       int64
	Title           string
	StimulusType    *string
	StimulusContent json.RawMessage
	StimulusHTML    *string
	CreatedBy       int64
	EnforceOwner    bool
}

type UpdateStimulusGroupInput struct {
	ID              int64
	SubjectID       int64
	Title           *string
	StimulusType    *string
	StimulusContent json.RawMessage
	StimulusHTML    *string
	ActorID         int64
	EnforceOwner    bool
}

type StimulusGroup struct {
	ID              int64           `json:"id"`
	SubjectID       int64           `json:"subject_id"`
	Title           string          `json:"title"`
	StimulusType    *string         `json:"stimulus_type,omitempty"`
	StimulusContent json.RawMessage `json:"stimulus_content,omitempty"`
	StimulusHTML    *string         `json:"stimulus_html,omitempty"`
	IsActive        bool            `json:"is_active"`
	CreatedBy       *int64          `json:"created_by,omitempty"`
	CreatedAt       time.Time       `json:"created_at"`
	UpdatedAt       *time.Time      `json:"updated_at,omitempty"`
	LinkedQuestions int             `json:"linked_questions,omitempty"`
}

type ExportQuestionData struct {
	QuestionID           int64
	VersionNo            int
	SubjectID            int64
	SubjectName          string
	EducationLevel       string
	LearningGoalID       int64
	LearningGoalText     string
	LearningGoalMateri   string
	LearningGoalKelas    string
	LearningGoalSemester int16
	QuestionCode         string
	QuestionCodeName     string
	QuestionType         string
	Title                string
	Indicator            string
	Material             string
	Objective            string
	CognitiveLevel       string
	Difficulty           *int
	StimulusGroupID      *int64
	StimulusType         *string
	StimulusContent      json.RawMessage
	StimulusHTML         *string
	StemHTML             string
	ExplanationHTML      *string
	HintHTML             *string
	QuestionContent      json.RawMessage
	AnswerKey            json.RawMessage
	Options              []QuestionOptionInput
}

type CloneQuestionInput struct {
	Source          *ExportQuestionData
	TargetUserID    int64
	TargetSubjectID int64
	TargetRole      string
}

type CloneQuestionResult struct {
	QuestionID int64 `json:"question_id"`
	VersionNo  int   `json:"version_no"`
}

type CreateQuestionParallelInput struct {
	ExamID        int64
	QuestionID    int64
	ParallelGroup string
	ParallelOrder int
	ParallelLabel string
}

type UpdateQuestionParallelInput struct {
	ExamID        int64
	ParallelID    int64
	QuestionID    int64
	ParallelGroup string
	ParallelOrder int
	ParallelLabel string
}

type QuestionParallel struct {
	ID            int64     `json:"id"`
	ExamID        int64     `json:"exam_id"`
	QuestionID    int64     `json:"question_id"`
	ParallelGroup string    `json:"parallel_group"`
	ParallelOrder int       `json:"parallel_order"`
	ParallelLabel string    `json:"parallel_label"`
	IsActive      bool      `json:"is_active"`
	CreatedAt     time.Time `json:"created_at"`
}

type CreateReviewTaskInput struct {
	QuestionVersionID int64
	ExamID            *int64
	ReviewerID        int64
	Note              string
}

type ReviewDecisionInput struct {
	TaskID       int64
	ReviewerID   int64
	IsPrivileged bool
	Status       string
	Note         string
}

type ReviewTask struct {
	ID                int64      `json:"id"`
	QuestionVersionID int64      `json:"question_version_id"`
	QuestionID        int64      `json:"question_id"`
	ExamID            *int64     `json:"exam_id,omitempty"`
	ReviewerID        int64      `json:"reviewer_id"`
	Status            string     `json:"status"`
	AssignedAt        time.Time  `json:"assigned_at"`
	ReviewedAt        *time.Time `json:"reviewed_at,omitempty"`
	Note              *string    `json:"note,omitempty"`
}

type ReviewComment struct {
	ID           int64     `json:"id"`
	ReviewTaskID int64     `json:"review_task_id"`
	AuthorID     int64     `json:"author_id"`
	CommentType  string    `json:"comment_type"`
	CommentText  string    `json:"comment_text"`
	CreatedAt    time.Time `json:"created_at"`
}

type QuestionReview struct {
	Task     ReviewTask      `json:"task"`
	Comments []ReviewComment `json:"comments"`
}

type RequestReopenFinalInput struct {
	QuestionID    int64
	VersionNo     int
	Reason        string
	RequestedBy   int64
	RequestedRole string
}

type ApproveReopenFinalInput struct {
	QuestionID   int64
	VersionNo    int
	ApproverID   int64
	ApproverRole string
	Note         string
}

type ReopenFinalRequest struct {
	ID              int64      `json:"id"`
	QuestionID      int64      `json:"question_id"`
	VersionNo       int        `json:"version_no"`
	Reason          string     `json:"reason"`
	Status          string     `json:"status"`
	RequestedBy     int64      `json:"requested_by"`
	RequestedRole   string     `json:"requested_role"`
	RequestedAt     time.Time  `json:"requested_at"`
	DecidedBy       *int64     `json:"decided_by,omitempty"`
	DecidedRole     *string    `json:"decided_role,omitempty"`
	DecidedNote     *string    `json:"decided_note,omitempty"`
	DecidedAt       *time.Time `json:"decided_at,omitempty"`
	ApprovalCount   int        `json:"approval_count"`
	ApprovedByRoles []string   `json:"approved_by_roles,omitempty"`
}

func NewService(db *sql.DB) *Service {
	return &Service{db: db}
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

func loadUserTenantID(ctx context.Context, q columnQuerier, userID int64) (*int64, error) {
	if userID <= 0 {
		return nil, nil
	}
	hasTenant, err := hasColumn(ctx, q, "users", "tenant_id")
	if err != nil {
		return nil, err
	}
	if !hasTenant {
		return nil, nil
	}
	var tenantID sql.NullInt64
	if err := q.QueryRowContext(ctx, `SELECT tenant_id FROM users WHERE id = $1`, userID).Scan(&tenantID); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrUserNotFound
		}
		return nil, fmt.Errorf("load user tenant: %w", err)
	}
	if !tenantID.Valid || tenantID.Int64 <= 0 {
		return nil, nil
	}
	out := tenantID.Int64
	return &out, nil
}

func normalizeQuestionType(v string) string {
	v = strings.TrimSpace(strings.ToLower(v))
	switch v {
	case "pg_tunggal", "multi_jawaban", "benar_salah_pernyataan", "menjodohkan_drag_drop", "short_answer":
		return v
	default:
		return ""
	}
}

func normalizeReopenActorRole(v string) string {
	switch strings.TrimSpace(strings.ToLower(v)) {
	case "admin", "proktor", "guru":
		return strings.TrimSpace(strings.ToLower(v))
	default:
		return ""
	}
}

func normalizeQuestionCode(v string) string {
	v = strings.TrimSpace(strings.ToUpper(v))
	if v == "" {
		return ""
	}
	return v
}

func nullableDifficulty(v *int) any {
	if v == nil {
		return nil
	}
	return *v
}

func populateBlueprintMetadata(out *QuestionBlueprint, raw json.RawMessage) {
	if out == nil || len(raw) == 0 {
		return
	}
	var obj map[string]any
	if err := json.Unmarshal(raw, &obj); err != nil {
		return
	}
	getText := func(key string) string {
		rawValue, ok := obj[key]
		if !ok || rawValue == nil {
			return ""
		}
		s, ok := rawValue.(string)
		if !ok {
			return ""
		}
		return strings.TrimSpace(s)
	}
	out.Title = getText("title")
	out.Indicator = getText("indicator")
	out.Material = getText("material")
	out.Objective = getText("objective")
	out.CognitiveLevel = getText("cognitive_level")
}

func (s *Service) CreateStimulusGroup(ctx context.Context, in CreateStimulusGroupInput) (*StimulusGroup, error) {
	if in.SubjectID <= 0 || in.CreatedBy <= 0 {
		return nil, ErrInvalidInput
	}
	if err := s.ensureSubjectAccess(ctx, in.SubjectID, in.CreatedBy, in.EnforceOwner); err != nil {
		return nil, err
	}
	stimType, stimContent, stimHTML, err := normalizeStimulusFields(in.StimulusType, in.StimulusContent, in.StimulusHTML)
	if err != nil {
		return nil, err
	}
	title := strings.TrimSpace(in.Title)
	if title == "" {
		title = "Stimulus"
	}
	row := s.db.QueryRowContext(ctx, `
		INSERT INTO stimulus_groups (
			subject_id, title, stimulus_type, stimulus_content, stimulus_html, is_active, created_by, created_at, updated_at
		) VALUES (
			$1, $2, $3, $4::jsonb, $5, TRUE, NULLIF($6, 0), now(), now()
		)
		RETURNING id, subject_id, title, stimulus_type, stimulus_content, stimulus_html, is_active, created_by, created_at, updated_at, 0::bigint
	`, in.SubjectID, title, nullStringPtr(stimType), nullJSONBytes(stimContent), nullStringPtr(stimHTML), in.CreatedBy)
	out, err := scanStimulusGroup(row)
	if err != nil {
		if isUndefinedTableErr(err, "stimulus_groups") {
			return nil, ErrStimulusGroupFeature
		}
		return nil, fmt.Errorf("insert stimulus group: %w", err)
	}
	return out, nil
}

func (s *Service) ListStimulusGroups(ctx context.Context, subjectID int64, ownerID *int64) ([]StimulusGroup, error) {
	query := `
		SELECT sg.id, sg.subject_id, sg.title, sg.stimulus_type, sg.stimulus_content, sg.stimulus_html,
			sg.is_active, sg.created_by, sg.created_at, sg.updated_at,
			COUNT(DISTINCT qv.question_id) AS linked_questions
		FROM stimulus_groups sg
		LEFT JOIN question_versions qv ON qv.stimulus_group_id = sg.id
		WHERE sg.is_active = TRUE
	`
	args := make([]any, 0, 2)
	if subjectID > 0 {
		query += fmt.Sprintf(" AND sg.subject_id = $%d", len(args)+1)
		args = append(args, subjectID)
	}
	if ownerID != nil && *ownerID > 0 {
		query += fmt.Sprintf(" AND sg.created_by = $%d", len(args)+1)
		args = append(args, *ownerID)
	}
	query += ` GROUP BY sg.id ORDER BY sg.id DESC`
	rows, err := s.db.QueryContext(ctx, query, args...)
	if err != nil {
		if isUndefinedTableErr(err, "stimulus_groups") {
			return nil, ErrStimulusGroupFeature
		}
		return nil, fmt.Errorf("query stimulus groups: %w", err)
	}
	defer rows.Close()
	items := make([]StimulusGroup, 0)
	for rows.Next() {
		item, err := scanStimulusGroup(rows)
		if err != nil {
			return nil, fmt.Errorf("scan stimulus group: %w", err)
		}
		items = append(items, *item)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate stimulus groups: %w", err)
	}
	return items, nil
}

func (s *Service) UpdateStimulusGroup(ctx context.Context, in UpdateStimulusGroupInput) (*StimulusGroup, error) {
	if in.ID <= 0 || in.ActorID <= 0 {
		return nil, ErrInvalidInput
	}
	row := s.db.QueryRowContext(ctx, `
		SELECT subject_id, title, stimulus_type, stimulus_content, stimulus_html, created_by
		FROM stimulus_groups
		WHERE id = $1
		  AND is_active = TRUE
	`, in.ID)
	var subjectID int64
	var title string
	var stimType sql.NullString
	var stimContent []byte
	var stimHTML sql.NullString
	var createdBy sql.NullInt64
	if err := row.Scan(&subjectID, &title, &stimType, &stimContent, &stimHTML, &createdBy); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrStimulusGroupNotFound
		}
		if isUndefinedTableErr(err, "stimulus_groups") {
			return nil, ErrStimulusGroupFeature
		}
		return nil, fmt.Errorf("load stimulus group: %w", err)
	}
	if in.SubjectID > 0 && in.SubjectID != subjectID {
		if err := s.ensureSubjectAccess(ctx, in.SubjectID, in.ActorID, in.EnforceOwner); err != nil {
			return nil, err
		}
		subjectID = in.SubjectID
	} else if in.EnforceOwner && (!createdBy.Valid || createdBy.Int64 != in.ActorID) {
		return nil, ErrForbidden
	}
	nextTitle := title
	if in.Title != nil {
		nextTitle = strings.TrimSpace(*in.Title)
		if nextTitle == "" {
			nextTitle = "Stimulus"
		}
	}
	var currentStimType *string
	if stimType.Valid {
		currentStimType = &stimType.String
	}
	var currentStimHTML *string
	if stimHTML.Valid {
		currentStimHTML = &stimHTML.String
	}
	currentStimContent := json.RawMessage(nil)
	if len(bytes.TrimSpace(stimContent)) > 0 {
		currentStimContent = append(json.RawMessage(nil), stimContent...)
	}
	nextStimType, nextStimContent, nextStimHTML := currentStimType, currentStimContent, currentStimHTML
	if in.StimulusType != nil || len(bytes.TrimSpace(in.StimulusContent)) > 0 || in.StimulusHTML != nil {
		var err error
		nextStimType, nextStimContent, nextStimHTML, err = normalizeStimulusFields(in.StimulusType, in.StimulusContent, in.StimulusHTML)
		if err != nil {
			return nil, err
		}
	}
	updated := s.db.QueryRowContext(ctx, `
		UPDATE stimulus_groups
		SET subject_id = $2,
			title = $3,
			stimulus_type = $4,
			stimulus_content = $5::jsonb,
			stimulus_html = $6,
			updated_at = now()
		WHERE id = $1
		  AND is_active = TRUE
		RETURNING id, subject_id, title, stimulus_type, stimulus_content, stimulus_html, is_active, created_by, created_at, updated_at, 0::bigint
	`, in.ID, subjectID, nextTitle, nullStringPtr(nextStimType), nullJSONBytes(nextStimContent), nullStringPtr(nextStimHTML))
	out, err := scanStimulusGroup(updated)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrStimulusGroupNotFound
		}
		if isUndefinedTableErr(err, "stimulus_groups") {
			return nil, ErrStimulusGroupFeature
		}
		return nil, fmt.Errorf("update stimulus group: %w", err)
	}
	return out, nil
}

func (s *Service) DeleteStimulusGroup(ctx context.Context, id, actorID int64, enforceOwner bool) error {
	if id <= 0 || actorID <= 0 {
		return ErrInvalidInput
	}
	var createdBy sql.NullInt64
	if err := s.db.QueryRowContext(ctx, `
		SELECT created_by
		FROM stimulus_groups
		WHERE id = $1
		  AND is_active = TRUE
	`, id).Scan(&createdBy); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return ErrStimulusGroupNotFound
		}
		if isUndefinedTableErr(err, "stimulus_groups") {
			return ErrStimulusGroupFeature
		}
		return fmt.Errorf("load stimulus group delete: %w", err)
	}
	if enforceOwner && (!createdBy.Valid || createdBy.Int64 != actorID) {
		return ErrForbidden
	}
	if _, err := s.db.ExecContext(ctx, `
		UPDATE stimulus_groups
		SET is_active = FALSE, updated_at = now()
		WHERE id = $1
	`, id); err != nil {
		if isUndefinedTableErr(err, "stimulus_groups") {
			return ErrStimulusGroupFeature
		}
		return fmt.Errorf("delete stimulus group: %w", err)
	}
	return nil
}

func (s *Service) CreateQuestion(ctx context.Context, in CreateQuestionInput) (*QuestionBlueprint, error) {
	in.QuestionType = normalizeQuestionType(in.QuestionType)
	in.Title = strings.TrimSpace(in.Title)
	in.Indicator = strings.TrimSpace(in.Indicator)
	in.Material = strings.TrimSpace(in.Material)
	in.Objective = strings.TrimSpace(in.Objective)
	in.CognitiveLevel = strings.TrimSpace(in.CognitiveLevel)

	if in.SubjectID <= 0 || in.LearningGoalID <= 0 || in.QuestionType == "" || in.Title == "" {
		return nil, ErrInvalidInput
	}
	if in.Difficulty != nil && (*in.Difficulty < 1 || *in.Difficulty > 5) {
		return nil, fmt.Errorf("%w: difficulty must be between 1 and 5", ErrInvalidInput)
	}

	var subject struct {
		educationLevel string
		subjectType    string
		name           string
	}
	if err := s.db.QueryRowContext(ctx, `
		SELECT education_level, subject_type, name
		FROM subjects
		WHERE id = $1 AND is_active = TRUE
	`, in.SubjectID).Scan(&subject.educationLevel, &subject.subjectType, &subject.name); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrSubjectNotFound
		}
		return nil, fmt.Errorf("load subject: %w", err)
	}
	var validGoal bool
	if err := s.db.QueryRowContext(ctx, `
		SELECT EXISTS(
			SELECT 1
			FROM learning_goals lg
			WHERE lg.id = $1
			  AND lg.mata_pelajaran = $2
		)
	`, in.LearningGoalID, subject.name).Scan(&validGoal); err != nil {
		return nil, fmt.Errorf("check learning goal: %w", err)
	}
	if !validGoal {
		return nil, ErrLearningGoalNotFound
	}

	if in.QuestionCodeID != nil {
		if *in.QuestionCodeID <= 0 {
			return nil, ErrInvalidInput
		}
		var codeSubjectID int64
		var codeCreatedBy sql.NullInt64
		if err := s.db.QueryRowContext(ctx, `
			SELECT subject_id, created_by
			FROM question_codes
			WHERE id = $1
			  AND is_active = TRUE
		`, *in.QuestionCodeID).Scan(&codeSubjectID, &codeCreatedBy); err != nil {
			if errors.Is(err, sql.ErrNoRows) {
				return nil, ErrQuestionCodeNotFound
			}
			return nil, fmt.Errorf("load question code: %w", err)
		}
		if codeSubjectID != in.SubjectID {
			return nil, fmt.Errorf("%w: question_code subject mismatch", ErrInvalidInput)
		}
		// Guru only: code must be owned by actor.
		if in.EnforceOwner && (!codeCreatedBy.Valid || codeCreatedBy.Int64 != in.CreatedBy) {
			return nil, ErrForbidden
		}
	}

	metaRaw, err := json.Marshal(map[string]any{
		"title":           in.Title,
		"indicator":       in.Indicator,
		"material":        in.Material,
		"objective":       in.Objective,
		"cognitive_level": in.CognitiveLevel,
		"created_via":     "guru_dashboard",
	})
	if err != nil {
		return nil, fmt.Errorf("marshal metadata: %w", err)
	}

	stem := "<p>" + in.Title + "</p>"
	questionHasTenant, err := hasColumn(ctx, s.db, "questions", "tenant_id")
	if err != nil {
		return nil, err
	}
	var questionTenantID *int64
	if questionHasTenant {
		questionTenantID, err = loadUserTenantID(ctx, s.db, in.CreatedBy)
		if err != nil {
			return nil, err
		}
		if questionTenantID == nil || *questionTenantID <= 0 {
			return nil, fmt.Errorf("resolve question tenant: tenant_id is required")
		}
	}

	insertColumns := []string{
		"subject_id", "learning_goal_id", "question_code_id", "question_type", "stem_html", "stimulus_html", "difficulty",
		"metadata", "is_active", "version", "created_at", "updated_at",
	}
	insertValues := []string{
		"$1", "$2", "$3", "$4", "$5", "NULL", "$6", "$7::jsonb", "TRUE", "1", "now()", "now()",
	}
	insertArgs := []any{in.SubjectID, in.LearningGoalID, nullInt64Ptr(in.QuestionCodeID), in.QuestionType, stem, nullableDifficulty(in.Difficulty), []byte(metaRaw)}
	if questionHasTenant {
		insertColumns = append(insertColumns, "tenant_id")
		insertValues = append(insertValues, fmt.Sprintf("$%d", len(insertArgs)+1))
		insertArgs = append(insertArgs, *questionTenantID)
	}
	row := s.db.QueryRowContext(ctx, fmt.Sprintf(`
		INSERT INTO questions (
			%s
		) VALUES (
			%s
		)
		RETURNING id, subject_id, learning_goal_id, question_code_id, question_type, difficulty, metadata, created_at, updated_at
	`, strings.Join(insertColumns, ", "), strings.Join(insertValues, ", ")), insertArgs...)

	var out QuestionBlueprint
	var questionCodeID sql.NullInt64
	var difficulty sql.NullInt64
	if err := row.Scan(
		&out.ID,
		&out.SubjectID,
		&out.LearningGoalID,
		&questionCodeID,
		&out.QuestionType,
		&difficulty,
		&out.Metadata,
		&out.CreatedAt,
		&out.UpdatedAt,
	); err != nil {
		return nil, fmt.Errorf("insert question: %w", err)
	}
	if questionCodeID.Valid {
		out.QuestionCodeID = &questionCodeID.Int64
	}
	if difficulty.Valid {
		d := int(difficulty.Int64)
		out.Difficulty = &d
	}
	out.EducationLevel = subject.educationLevel
	out.SubjectType = subject.subjectType
	out.SubjectName = subject.name
	populateBlueprintMetadata(&out, out.Metadata)
	return &out, nil
}

func (s *Service) ListQuestions(ctx context.Context, subjectID int64, ownerID *int64) ([]QuestionBlueprint, error) {
	query := `
		SELECT q.id, q.subject_id, q.learning_goal_id, q.question_code_id, qc.code, s.education_level, s.subject_type, s.name,
			q.question_type, q.difficulty, q.metadata, q.created_at, q.updated_at,
			COALESCE(qv.stem_html, q.stem_html, '') AS stem_preview
		FROM questions q
		JOIN subjects s ON s.id = q.subject_id
		LEFT JOIN question_codes qc ON qc.id = q.question_code_id
		LEFT JOIN LATERAL (
			SELECT qv.stem_html
			FROM question_versions qv
			WHERE qv.question_id = q.id
			ORDER BY CASE
				WHEN qv.version_no = q.version THEN 0
				WHEN qv.status = 'final' THEN 1
				ELSE 2
			END, qv.is_active DESC, qv.version_no DESC
			LIMIT 1
		) qv ON TRUE
		WHERE q.is_active = TRUE
	`
	args := make([]any, 0, 2)
	if subjectID > 0 {
		query += fmt.Sprintf(` AND q.subject_id = $%d`, len(args)+1)
		args = append(args, subjectID)
	}
	if ownerID != nil && *ownerID > 0 {
		ownerClauses := make([]string, 0, 3)
		questionHasCreatedBy, err := hasColumn(ctx, s.db, "questions", "created_by")
		if err != nil {
			return nil, err
		}
		if questionHasCreatedBy {
			ownerClauses = append(ownerClauses, fmt.Sprintf("q.created_by = $%d", len(args)+1))
			args = append(args, *ownerID)
		}
		versionHasCreatedBy, err := hasColumn(ctx, s.db, "question_versions", "created_by")
		if err != nil {
			return nil, err
		}
		if versionHasCreatedBy {
			ownerClauses = append(ownerClauses, fmt.Sprintf(`EXISTS (
				SELECT 1 FROM question_versions qv_owner
				WHERE qv_owner.question_id = q.id
				  AND qv_owner.created_by = $%d
			)`, len(args)+1))
			args = append(args, *ownerID)
			// Legacy fallback: jika metadata owner belum pernah diisi di version,
			// jangan sembunyikan soal agar daftar pick/sync tidak kosong.
			ownerClauses = append(ownerClauses, `NOT EXISTS (
				SELECT 1 FROM question_versions qv_owner_meta
				WHERE qv_owner_meta.question_id = q.id
				  AND qv_owner_meta.created_by IS NOT NULL
			)`)
		}
		if len(ownerClauses) > 0 {
			query += " AND (" + strings.Join(ownerClauses, " OR ") + ")"
		}
	}
	query += ` ORDER BY q.id DESC`

	rows, err := s.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("query questions: %w", err)
	}
	defer rows.Close()

	items := make([]QuestionBlueprint, 0)
	for rows.Next() {
		var out QuestionBlueprint
		var questionCodeID sql.NullInt64
		var questionCode sql.NullString
		var difficulty sql.NullInt64
		if err := rows.Scan(
			&out.ID,
			&out.SubjectID,
			&out.LearningGoalID,
			&questionCodeID,
			&questionCode,
			&out.EducationLevel,
			&out.SubjectType,
			&out.SubjectName,
			&out.QuestionType,
			&difficulty,
			&out.Metadata,
			&out.CreatedAt,
			&out.UpdatedAt,
			&out.StemPreview,
		); err != nil {
			return nil, fmt.Errorf("scan question: %w", err)
		}
		if difficulty.Valid {
			d := int(difficulty.Int64)
			out.Difficulty = &d
		}
		if questionCodeID.Valid {
			out.QuestionCodeID = &questionCodeID.Int64
		}
		if questionCode.Valid {
			out.QuestionCode = &questionCode.String
		}
		populateBlueprintMetadata(&out, out.Metadata)
		items = append(items, out)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate questions: %w", err)
	}
	return items, nil
}

func (s *Service) CreateQuestionCode(ctx context.Context, in CreateQuestionCodeInput) (*QuestionCode, error) {
	in.Code = normalizeQuestionCode(in.Code)
	in.Name = strings.TrimSpace(in.Name)
	if in.SubjectID <= 0 || in.Code == "" || in.Name == "" {
		return nil, ErrInvalidInput
	}

	var exists bool
	if err := s.db.QueryRowContext(ctx, `
		SELECT EXISTS(SELECT 1 FROM subjects WHERE id = $1 AND is_active = TRUE)
	`, in.SubjectID).Scan(&exists); err != nil {
		return nil, fmt.Errorf("check subject for question code: %w", err)
	}
	if !exists {
		return nil, ErrSubjectNotFound
	}
	codeHasTenant, err := hasColumn(ctx, s.db, "question_codes", "tenant_id")
	if err != nil {
		return nil, err
	}
	var tenantID *int64
	if codeHasTenant {
		tenantID, err = loadUserTenantID(ctx, s.db, in.CreatedBy)
		if err != nil {
			return nil, err
		}
		if tenantID == nil || *tenantID <= 0 {
			return nil, ErrQuestionCodeTenantReq
		}
	}

	insertColumns := []string{"subject_id", "code", "name", "is_active", "created_by", "created_at", "updated_at"}
	insertValues := []string{"$1", "$2", "$3", "TRUE", "NULLIF($4, 0)", "now()", "now()"}
	insertArgs := []any{in.SubjectID, in.Code, in.Name, in.CreatedBy}
	if codeHasTenant {
		insertColumns = append(insertColumns, "tenant_id")
		insertValues = append(insertValues, fmt.Sprintf("$%d", len(insertArgs)+1))
		insertArgs = append(insertArgs, *tenantID)
	}
	row := s.db.QueryRowContext(ctx, fmt.Sprintf(`
		INSERT INTO question_codes (%s)
		VALUES (%s)
		RETURNING id, subject_id, code, name, is_active, created_by, created_at, updated_at
	`, strings.Join(insertColumns, ", "), strings.Join(insertValues, ", ")), insertArgs...)
	out, err := scanQuestionCode(row)
	if err != nil {
		lower := strings.ToLower(err.Error())
		if strings.Contains(lower, "question_codes_subject_id_code_key") ||
			strings.Contains(lower, "ux_question_codes_tenant_subject_code") {
			return nil, ErrQuestionCodeExists
		}
		return nil, fmt.Errorf("create question code: %w", err)
	}
	return out, nil
}

func (s *Service) ListQuestionCodes(ctx context.Context, subjectID int64, q string, ownerID *int64) ([]QuestionCode, error) {
	q = strings.TrimSpace(strings.ToLower(q))
	var ownerFilter int64
	if ownerID != nil && *ownerID > 0 {
		ownerFilter = *ownerID
	}

	// If no owner filter, use simple query
	if ownerFilter <= 0 {
		rows, err := s.db.QueryContext(ctx, `
			SELECT id, subject_id, code, name, is_active, created_by, created_at, updated_at
			FROM question_codes
			WHERE is_active = TRUE
			  AND ($1 <= 0 OR subject_id = $1)
			  AND ($2 = '' OR LOWER(code) LIKE '%' || $2 || '%' OR LOWER(name) LIKE '%' || $2 || '%')
			ORDER BY subject_id ASC, code ASC, id ASC
		`, subjectID, q)
		if err != nil {
			return nil, fmt.Errorf("list question codes: %w", err)
		}
		defer rows.Close()

		items := make([]QuestionCode, 0)
		for rows.Next() {
			it, err := scanQuestionCode(rows)
			if err != nil {
				return nil, fmt.Errorf("scan question code: %w", err)
			}
			items = append(items, *it)
		}
		if err := rows.Err(); err != nil {
			return nil, fmt.Errorf("iterate question codes: %w", err)
		}
		return items, nil
	}

	// For guru, show codes they created OR codes with questions they own
	rows, err := s.db.QueryContext(ctx, `
		SELECT id, subject_id, code, name, is_active, created_by, created_at, updated_at
		FROM question_codes
		WHERE is_active = TRUE
		  AND ($1 <= 0 OR subject_id = $1)
		  AND ($2 = '' OR LOWER(code) LIKE '%' || $2 || '%' OR LOWER(name) LIKE '%' || $2 || '%')
		  AND (
		    created_by = $3
		    OR id IN (
		      SELECT DISTINCT question_code_id
		      FROM questions
		      WHERE created_by = $3 AND is_active = TRUE AND question_code_id IS NOT NULL
		    )
		  )
		ORDER BY subject_id ASC, code ASC, id ASC
	`, subjectID, q, ownerFilter)
	if err != nil {
		return nil, fmt.Errorf("list question codes: %w", err)
	}
	defer rows.Close()

	items := make([]QuestionCode, 0)
	for rows.Next() {
		it, err := scanQuestionCode(rows)
		if err != nil {
			return nil, fmt.Errorf("scan question code: %w", err)
		}
		items = append(items, *it)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate question codes: %w", err)
	}
	return items, nil
}

func (s *Service) UpdateQuestionCode(ctx context.Context, in UpdateQuestionCodeInput) (*QuestionCode, error) {
	in.Code = normalizeQuestionCode(in.Code)
	in.Name = strings.TrimSpace(in.Name)
	if in.ID <= 0 || in.SubjectID <= 0 || in.Code == "" || in.Name == "" {
		return nil, ErrInvalidInput
	}
	if in.EnforceOwner && in.ActorID <= 0 {
		return nil, ErrInvalidInput
	}

	var ownerFilter int64
	if in.EnforceOwner {
		ownerFilter = in.ActorID
	}

	row := s.db.QueryRowContext(ctx, `
		UPDATE question_codes
		SET subject_id = $2,
			code = $3,
			name = $4
		WHERE id = $1
		  AND is_active = TRUE
		  AND ($5 <= 0 OR created_by = $5)
		RETURNING id, subject_id, code, name, is_active, created_by, created_at, updated_at
	`, in.ID, in.SubjectID, in.Code, in.Name, ownerFilter)
	out, err := scanQuestionCode(row)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			if in.EnforceOwner {
				return nil, ErrForbidden
			}
			return nil, ErrQuestionCodeNotFound
		}
		lower := strings.ToLower(err.Error())
		if strings.Contains(lower, "question_codes_subject_id_code_key") ||
			strings.Contains(lower, "ux_question_codes_tenant_subject_code") {
			return nil, ErrQuestionCodeExists
		}
		return nil, fmt.Errorf("update question code: %w", err)
	}
	return out, nil
}

func (s *Service) DeleteQuestionCode(ctx context.Context, id int64, actorID int64, enforceOwner bool) error {
	if id <= 0 {
		return ErrInvalidInput
	}
	if enforceOwner && actorID <= 0 {
		return ErrInvalidInput
	}
	var ownerFilter int64
	if enforceOwner {
		ownerFilter = actorID
	}
	var deletedID int64
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("begin delete question code tx: %w", err)
	}
	defer func() { _ = tx.Rollback() }()

	if err := tx.QueryRowContext(ctx, `
		UPDATE question_codes
		SET is_active = FALSE
		WHERE id = $1
		  AND is_active = TRUE
		  AND ($2 <= 0 OR created_by = $2)
		RETURNING id
	`, id, ownerFilter).Scan(&deletedID); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			if enforceOwner {
				return ErrForbidden
			}
			return ErrQuestionCodeNotFound
		}
		return fmt.Errorf("delete question code: %w", err)
	}
	if _, err := tx.ExecContext(ctx, `
		UPDATE questions
		SET question_code_id = NULL
		WHERE question_code_id = $1
	`, deletedID); err != nil {
		return fmt.Errorf("clear question code on questions: %w", err)
	}
	if err := tx.Commit(); err != nil {
		return fmt.Errorf("commit delete question code: %w", err)
	}
	return nil
}

func (s *Service) AssignQuestionCode(ctx context.Context, in AssignQuestionCodeInput) (*QuestionBlueprint, error) {
	if in.QuestionID <= 0 {
		return nil, ErrInvalidInput
	}
	if in.EnforceOwner && in.ActorID <= 0 {
		return nil, ErrInvalidInput
	}

	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, fmt.Errorf("begin assign question code tx: %w", err)
	}
	defer func() { _ = tx.Rollback() }()

	var subjectID int64
	if err := tx.QueryRowContext(ctx, `
		SELECT subject_id
		FROM questions
		WHERE id = $1 AND is_active = TRUE
	`, in.QuestionID).Scan(&subjectID); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrQuestionNotFound
		}
		return nil, fmt.Errorf("load question subject: %w", err)
	}

	if in.EnforceOwner {
		ok, err := s.canCreateVersionTx(ctx, tx, in.QuestionID, in.ActorID)
		if err != nil {
			return nil, err
		}
		if !ok {
			return nil, ErrForbidden
		}
	}

	var questionCodeID any
	if in.QuestionCodeID != nil {
		if *in.QuestionCodeID <= 0 {
			return nil, ErrInvalidInput
		}
		var codeSubjectID int64
		var codeCreatedBy sql.NullInt64
		if err := tx.QueryRowContext(ctx, `
			SELECT subject_id, created_by
			FROM question_codes
			WHERE id = $1
			  AND is_active = TRUE
		`, *in.QuestionCodeID).Scan(&codeSubjectID, &codeCreatedBy); err != nil {
			if errors.Is(err, sql.ErrNoRows) {
				return nil, ErrQuestionCodeNotFound
			}
			return nil, fmt.Errorf("load question code for assign: %w", err)
		}
		if codeSubjectID != subjectID {
			return nil, fmt.Errorf("%w: question_code subject mismatch", ErrInvalidInput)
		}
		if in.EnforceOwner && (!codeCreatedBy.Valid || codeCreatedBy.Int64 != in.ActorID) {
			return nil, ErrForbidden
		}
		questionCodeID = *in.QuestionCodeID
	}

	if _, err := tx.ExecContext(ctx, `
		UPDATE questions
		SET question_code_id = $2,
			updated_at = now()
		WHERE id = $1
	`, in.QuestionID, questionCodeID); err != nil {
		return nil, fmt.Errorf("assign question code: %w", err)
	}

	out, err := s.getQuestionBlueprintTx(ctx, tx, in.QuestionID)
	if err != nil {
		return nil, err
	}

	if err := tx.Commit(); err != nil {
		return nil, fmt.Errorf("commit assign question code tx: %w", err)
	}
	return out, nil
}

func (s *Service) AssignQuestionLearningGoal(ctx context.Context, in AssignQuestionLearningGoalInput) (*QuestionBlueprint, error) {
	if in.QuestionID <= 0 || in.LearningGoalID <= 0 {
		return nil, ErrInvalidInput
	}
	if in.EnforceOwner && in.ActorID <= 0 {
		return nil, ErrInvalidInput
	}

	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, fmt.Errorf("begin assign learning goal tx: %w", err)
	}
	defer func() { _ = tx.Rollback() }()

	var subjectID int64
	if err := tx.QueryRowContext(ctx, `
		SELECT subject_id
		FROM questions
		WHERE id = $1 AND is_active = TRUE
	`, in.QuestionID).Scan(&subjectID); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrQuestionNotFound
		}
		return nil, fmt.Errorf("load question subject: %w", err)
	}

	if in.EnforceOwner {
		ok, err := s.canCreateVersionTx(ctx, tx, in.QuestionID, in.ActorID)
		if err != nil {
			return nil, err
		}
		if !ok {
			return nil, ErrForbidden
		}
	}

	var subjectName string
	if err := tx.QueryRowContext(ctx, `
		SELECT name
		FROM subjects
		WHERE id = $1 AND is_active = TRUE
	`, subjectID).Scan(&subjectName); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrSubjectNotFound
		}
		return nil, fmt.Errorf("load subject: %w", err)
	}

	var validGoal bool
	if err := tx.QueryRowContext(ctx, `
		SELECT EXISTS(
			SELECT 1
			FROM learning_goals lg
			WHERE lg.id = $1
			  AND lg.mata_pelajaran = $2
		)
	`, in.LearningGoalID, subjectName).Scan(&validGoal); err != nil {
		return nil, fmt.Errorf("check learning goal: %w", err)
	}
	if !validGoal {
		return nil, ErrLearningGoalNotFound
	}

	if _, err := tx.ExecContext(ctx, `
		UPDATE questions
		SET learning_goal_id = $2,
			updated_at = now()
		WHERE id = $1
	`, in.QuestionID, in.LearningGoalID); err != nil {
		return nil, fmt.Errorf("assign learning goal: %w", err)
	}

	out, err := s.getQuestionBlueprintTx(ctx, tx, in.QuestionID)
	if err != nil {
		return nil, err
	}

	if err := tx.Commit(); err != nil {
		return nil, fmt.Errorf("commit assign learning goal tx: %w", err)
	}
	return out, nil
}

func (s *Service) validateStimulusGroupForQuestion(ctx context.Context, tx *sql.Tx, stimulusGroupID *int64, subjectID, actorID int64, enforceOwner bool) (*int64, error) {
	if stimulusGroupID == nil {
		return nil, nil
	}
	if *stimulusGroupID <= 0 {
		return nil, ErrInvalidInput
	}
	var groupSubjectID int64
	var createdBy sql.NullInt64
	if err := tx.QueryRowContext(ctx, `
		SELECT subject_id, created_by
		FROM stimulus_groups
		WHERE id = $1
		  AND is_active = TRUE
	`, *stimulusGroupID).Scan(&groupSubjectID, &createdBy); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrStimulusGroupNotFound
		}
		return nil, fmt.Errorf("load stimulus group for question: %w", err)
	}
	if groupSubjectID != subjectID {
		return nil, fmt.Errorf("%w: stimulus_group subject mismatch", ErrInvalidInput)
	}
	if enforceOwner && (!createdBy.Valid || createdBy.Int64 != actorID) {
		return nil, ErrForbidden
	}
	v := *stimulusGroupID
	return &v, nil
}

func (s *Service) CreateQuestionVersion(ctx context.Context, in CreateQuestionVersionInput) (*QuestionVersion, error) {
	if in.QuestionID <= 0 {
		return nil, ErrInvalidInput
	}

	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, fmt.Errorf("begin tx: %w", err)
	}
	defer func() { _ = tx.Rollback() }()

	var currentStem string
	var questionType string
	var subjectID int64
	questionHasTenant, err := hasColumn(ctx, tx, "questions", "tenant_id")
	if err != nil {
		return nil, err
	}
	var questionTenantID sql.NullInt64
	loadQuestionSQL := `
		SELECT stem_html, question_type, subject_id
		FROM questions
		WHERE id = $1
	`
	if questionHasTenant {
		loadQuestionSQL = `
			SELECT stem_html, question_type, subject_id, tenant_id
			FROM questions
			WHERE id = $1
		`
		err = tx.QueryRowContext(ctx, loadQuestionSQL, in.QuestionID).Scan(&currentStem, &questionType, &subjectID, &questionTenantID)
	} else {
		err = tx.QueryRowContext(ctx, loadQuestionSQL, in.QuestionID).Scan(&currentStem, &questionType, &subjectID)
	}
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrQuestionNotFound
		}
		return nil, fmt.Errorf("load question: %w", err)
	}
	if in.EnforceOwner {
		if in.CreatedBy <= 0 {
			return nil, ErrInvalidInput
		}
		ok, err := s.canCreateVersionTx(ctx, tx, in.QuestionID, in.CreatedBy)
		if err != nil {
			return nil, err
		}
		if !ok {
			return nil, ErrForbidden
		}
	}

	base, nextVersion, err := s.loadBaseVersionForCreate(ctx, tx, in.QuestionID, currentStem)
	if err != nil {
		return nil, err
	}
	if in.StimulusGroupID != nil {
		base.StimulusGroupID, err = s.validateStimulusGroupForQuestion(ctx, tx, in.StimulusGroupID, subjectID, in.CreatedBy, in.EnforceOwner)
		if err != nil {
			return nil, err
		}
	}

	if in.StimulusType != nil || len(bytes.TrimSpace(in.StimulusContent)) > 0 || in.StimulusHTML != nil {
		stimType, stimContent, stimHTML, err := normalizeStimulusFields(in.StimulusType, in.StimulusContent, in.StimulusHTML)
		if err != nil {
			return nil, err
		}
		base.StimulusType = stimType
		base.StimulusContent = stimContent
		base.StimulusHTML = stimHTML
	}
	if in.StemHTML != nil {
		v := strings.TrimSpace(*in.StemHTML)
		if v == "" {
			return nil, fmt.Errorf("%w: stem_html cannot be empty", ErrInvalidInput)
		}
		base.StemHTML = v
	}
	if in.ExplanationHTML != nil {
		v := strings.TrimSpace(*in.ExplanationHTML)
		base.ExplanationHTML = &v
	}
	if in.HintHTML != nil {
		v := strings.TrimSpace(*in.HintHTML)
		base.HintHTML = &v
	}
	if len(in.AnswerKey) > 0 {
		if !json.Valid(in.AnswerKey) {
			return nil, fmt.Errorf("%w: answer_key must be valid json", ErrInvalidInput)
		}
		base.AnswerKey = in.AnswerKey
	}
	if len(bytes.TrimSpace(in.QuestionContent)) > 0 {
		base.QuestionContent = in.QuestionContent
	}
	if in.DurationSeconds != nil {
		if *in.DurationSeconds < 0 {
			return nil, fmt.Errorf("%w: duration_seconds cannot be negative", ErrInvalidInput)
		}
		base.DurationSeconds = in.DurationSeconds
	}
	if in.Weight != nil {
		if *in.Weight <= 0 {
			return nil, fmt.Errorf("%w: weight must be > 0", ErrInvalidInput)
		}
		base.Weight = *in.Weight
	}
	if in.ChangeNote != nil {
		v := strings.TrimSpace(*in.ChangeNote)
		base.ChangeNote = &v
	}

	if strings.TrimSpace(base.StemHTML) == "" {
		return nil, fmt.Errorf("%w: stem_html is required", ErrInvalidInput)
	}
	if len(base.AnswerKey) == 0 {
		base.AnswerKey = json.RawMessage(`{}`)
	}
	base.QuestionContent, err = normalizeQuestionContent(questionType, base.QuestionContent)
	if err != nil {
		return nil, err
	}
	if err := validateAnswerKey(questionType, base.AnswerKey); err != nil {
		return nil, err
	}
	if questionType == "menjodohkan_drag_drop" {
		if err := validateMatchingReferences(base.QuestionContent, base.AnswerKey); err != nil {
			return nil, err
		}
	}
	normalizedOptions, correctOptionKeys, err := normalizeAndValidateOptions(questionType, in.Options, base.AnswerKey)
	if err != nil {
		return nil, err
	}

	contentHash, err := computeQuestionContentHash(
		questionType,
		base.StemHTML,
		base.StimulusType,
		base.StimulusContent,
		base.StimulusHTML,
		base.ExplanationHTML,
		base.HintHTML,
		base.QuestionContent,
		base.AnswerKey,
		normalizedOptions,
	)
	if err != nil {
		return nil, err
	}
	if in.Dedup {
		if err := s.backfillContentHashCandidates(ctx, tx, subjectID, questionType, base.StemHTML); err != nil {
			return nil, err
		}
		var existingID int64
		err := tx.QueryRowContext(ctx, `
			SELECT q.id
			FROM questions q
			JOIN question_versions qv ON qv.question_id = q.id
			WHERE q.is_active = TRUE
			  AND q.subject_id = $1
			  AND qv.content_hash = $2
			LIMIT 1
		`, subjectID, contentHash).Scan(&existingID)
		if err == nil {
			var versionsCount int
			if err := tx.QueryRowContext(ctx, `
				SELECT COUNT(1)
				FROM question_versions
				WHERE question_id = $1
			`, in.QuestionID).Scan(&versionsCount); err != nil {
				return nil, fmt.Errorf("check question versions: %w", err)
			}
			if versionsCount == 0 {
				if _, err := tx.ExecContext(ctx, `
					UPDATE questions
					SET is_active = FALSE, updated_at = now()
					WHERE id = $1
				`, in.QuestionID); err != nil {
					return nil, fmt.Errorf("deactivate duplicate question: %w", err)
				}
			}
			if err := tx.Commit(); err != nil {
				return nil, fmt.Errorf("commit dedup tx: %w", err)
			}
			return nil, &DuplicateQuestionError{ExistingQuestionID: existingID}
		}
		if err != nil && !errors.Is(err, sql.ErrNoRows) {
			return nil, fmt.Errorf("check duplicate question: %w", err)
		}
	}

	versionHasTenant, err := hasColumn(ctx, tx, "question_versions", "tenant_id")
	if err != nil {
		return nil, err
	}
	versionColumns := []string{
		"question_id", "version_no", "stimulus_group_id", "stimulus_type", "stimulus_content", "stimulus_html", "stem_html", "explanation_html", "hint_html",
		"question_content", "answer_key", "status", "is_public", "is_active", "duration_seconds", "weight", "change_note",
		"content_hash", "created_by", "created_at",
	}
	versionValues := []string{
		"$1", "$2", "$3", "$4", "$5::jsonb", "$6", "$7", "$8", "$9",
		"$10::jsonb", "$11::jsonb", "'draft'", "FALSE", "TRUE", "$12", "$13", "$14",
		"$15", "NULLIF($16, 0)", "now()",
	}
	versionArgs := []any{in.QuestionID, nextVersion, nullInt64Ptr(base.StimulusGroupID), nullStringPtr(base.StimulusType), nullJSONBytes(base.StimulusContent), nullStringPtr(base.StimulusHTML), base.StemHTML, nullStringPtr(base.ExplanationHTML), nullStringPtr(base.HintHTML), []byte(base.QuestionContent), []byte(base.AnswerKey), nullIntPtr(base.DurationSeconds), base.Weight, nullStringPtr(base.ChangeNote), contentHash, in.CreatedBy}
	if versionHasTenant {
		if !questionTenantID.Valid || questionTenantID.Int64 <= 0 {
			return nil, fmt.Errorf("resolve question version tenant: tenant_id is required")
		}
		versionColumns = append(versionColumns, "tenant_id")
		versionValues = append(versionValues, fmt.Sprintf("$%d", len(versionArgs)+1))
		versionArgs = append(versionArgs, questionTenantID.Int64)
	}
	row := tx.QueryRowContext(ctx, fmt.Sprintf(`
			INSERT INTO question_versions (
				%s
			) VALUES (
				%s
			)
			RETURNING id, question_id, version_no, stimulus_group_id, stimulus_type, stimulus_content, stimulus_html, stem_html, explanation_html, hint_html,
				question_content, answer_key, status, is_public, is_active, duration_seconds, weight, change_note, created_by, created_at
		`, strings.Join(versionColumns, ", "), strings.Join(versionValues, ", ")), versionArgs...)

	out, err := scanQuestionVersion(row)
	if err != nil {
		return nil, fmt.Errorf("insert question version: %w", err)
	}

	if _, err := tx.ExecContext(ctx, `UPDATE questions SET version = $2, updated_at = now() WHERE id = $1`, in.QuestionID, nextVersion); err != nil {
		return nil, fmt.Errorf("update question current version: %w", err)
	}
	if len(normalizedOptions) > 0 {
		if _, err := tx.ExecContext(ctx, `DELETE FROM question_options WHERE question_id = $1`, in.QuestionID); err != nil {
			return nil, fmt.Errorf("clear question options: %w", err)
		}
		for _, opt := range normalizedOptions {
			isCorrect := correctOptionKeys[opt.OptionKey]
			if _, err := tx.ExecContext(ctx, `
				INSERT INTO question_options (question_id, option_key, option_html, is_correct)
				VALUES ($1, $2, $3, $4)
			`, in.QuestionID, opt.OptionKey, opt.OptionHTML, isCorrect); err != nil {
				return nil, fmt.Errorf("insert question option: %w", err)
			}
		}
	}

	if err := tx.Commit(); err != nil {
		return nil, fmt.Errorf("commit tx: %w", err)
	}
	return out, nil
}

func (s *Service) FinalizeQuestionVersion(ctx context.Context, questionID int64, versionNo int, actorID int64, enforceOwner bool) (*QuestionVersion, error) {
	if questionID <= 0 || versionNo <= 0 {
		return nil, ErrInvalidInput
	}
	if enforceOwner && actorID <= 0 {
		return nil, ErrInvalidInput
	}

	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, fmt.Errorf("begin tx: %w", err)
	}
	defer func() { _ = tx.Rollback() }()

	row := tx.QueryRowContext(ctx, `
			SELECT id, question_id, version_no, stimulus_group_id, stimulus_type, stimulus_content, stimulus_html, stem_html, explanation_html, hint_html,
				question_content, answer_key, status, is_public, is_active, duration_seconds, weight, change_note, created_by, created_at
			FROM question_versions
			WHERE question_id = $1 AND version_no = $2
			FOR UPDATE
		`, questionID, versionNo)

	item, err := scanQuestionVersion(row)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrVersionNotFound
		}
		return nil, fmt.Errorf("load question version: %w", err)
	}
	if enforceOwner && (item.CreatedBy == nil || *item.CreatedBy != actorID) {
		return nil, ErrForbidden
	}

	if item.Status != "final" {
		if _, err := tx.ExecContext(ctx, `
			UPDATE question_versions
			SET status = 'final', is_public = TRUE, is_active = TRUE
			WHERE question_id = $1 AND version_no = $2
		`, questionID, versionNo); err != nil {
			return nil, fmt.Errorf("finalize version: %w", err)
		}
		if _, err := tx.ExecContext(ctx, `
			UPDATE question_versions
			SET is_active = FALSE
			WHERE question_id = $1 AND version_no <> $2
		`, questionID, versionNo); err != nil {
			return nil, fmt.Errorf("deactivate other versions: %w", err)
		}
		if _, err := tx.ExecContext(ctx, `UPDATE questions SET version = $2, updated_at = now() WHERE id = $1`, questionID, versionNo); err != nil {
			return nil, fmt.Errorf("update question version pointer: %w", err)
		}
	}

	refetch := tx.QueryRowContext(ctx, `
			SELECT id, question_id, version_no, stimulus_group_id, stimulus_type, stimulus_content, stimulus_html, stem_html, explanation_html, hint_html,
				question_content, answer_key, status, is_public, is_active, duration_seconds, weight, change_note, created_by, created_at
			FROM question_versions
			WHERE question_id = $1 AND version_no = $2
	`, questionID, versionNo)
	out, err := scanQuestionVersion(refetch)
	if err != nil {
		return nil, fmt.Errorf("reload question version: %w", err)
	}

	if err := tx.Commit(); err != nil {
		return nil, fmt.Errorf("commit tx: %w", err)
	}
	return out, nil
}

func (s *Service) RequestReopenFinal(ctx context.Context, in RequestReopenFinalInput) (*ReopenFinalRequest, error) {
	if in.QuestionID <= 0 || in.VersionNo <= 0 || in.RequestedBy <= 0 {
		return nil, ErrInvalidInput
	}
	in.Reason = strings.TrimSpace(in.Reason)
	if in.Reason == "" {
		return nil, ErrInvalidInput
	}
	in.RequestedRole = normalizeReopenActorRole(in.RequestedRole)
	if in.RequestedRole == "" {
		return nil, ErrReviewForbidden
	}

	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, fmt.Errorf("begin reopen request tx: %w", err)
	}
	defer func() { _ = tx.Rollback() }()

	var status string
	if err := tx.QueryRowContext(ctx, `
		SELECT status
		FROM question_versions
		WHERE question_id = $1 AND version_no = $2
		FOR UPDATE
	`, in.QuestionID, in.VersionNo).Scan(&status); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrVersionNotFound
		}
		return nil, fmt.Errorf("load version for reopen request: %w", err)
	}
	if status != "final" {
		return nil, fmt.Errorf("%w: hanya versi final yang bisa diajukan reopen", ErrInvalidInput)
	}

	var usedInAttempts bool
	if err := tx.QueryRowContext(ctx, `
		SELECT EXISTS(
			SELECT 1
			FROM exam_questions eq
			JOIN attempts a ON a.exam_id = eq.exam_id
			WHERE eq.question_id = $1
			LIMIT 1
		)
	`, in.QuestionID).Scan(&usedInAttempts); err != nil {
		return nil, fmt.Errorf("check version usage attempts: %w", err)
	}
	if usedInAttempts {
		return nil, ErrReopenNotAllowed
	}

	var pendingCount int
	if err := tx.QueryRowContext(ctx, `
		SELECT COUNT(*)
		FROM question_reopen_requests
		WHERE question_id = $1
		  AND version_no = $2
		  AND status = 'pending'
	`, in.QuestionID, in.VersionNo).Scan(&pendingCount); err != nil {
		return nil, fmt.Errorf("check pending reopen requests: %w", err)
	}
	if pendingCount > 0 {
		return nil, ErrReopenPending
	}

	var out ReopenFinalRequest
	if err := tx.QueryRowContext(ctx, `
		INSERT INTO question_reopen_requests (
			question_id, version_no, reason, status, requested_by, requested_role, requested_at, created_at, updated_at
		) VALUES (
			$1, $2, $3, 'pending', $4, $5, now(), now(), now()
		)
		RETURNING id, question_id, version_no, reason, status, requested_by, requested_role, requested_at
	`, in.QuestionID, in.VersionNo, in.Reason, in.RequestedBy, in.RequestedRole).Scan(
		&out.ID,
		&out.QuestionID,
		&out.VersionNo,
		&out.Reason,
		&out.Status,
		&out.RequestedBy,
		&out.RequestedRole,
		&out.RequestedAt,
	); err != nil {
		return nil, fmt.Errorf("insert reopen request: %w", err)
	}
	out.ApprovalCount = 0

	if err := tx.Commit(); err != nil {
		return nil, fmt.Errorf("commit reopen request tx: %w", err)
	}
	return &out, nil
}

func (s *Service) ApproveReopenFinal(ctx context.Context, in ApproveReopenFinalInput) (*ReopenFinalRequest, error) {
	if in.QuestionID <= 0 || in.VersionNo <= 0 || in.ApproverID <= 0 {
		return nil, ErrInvalidInput
	}
	in.Note = strings.TrimSpace(in.Note)
	in.ApproverRole = normalizeReopenActorRole(in.ApproverRole)
	if in.ApproverRole == "" {
		return nil, ErrReviewForbidden
	}

	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, fmt.Errorf("begin reopen approve tx: %w", err)
	}
	defer func() { _ = tx.Rollback() }()

	var reqID int64
	var reqStatus string
	var reqRole string
	var reqBy int64
	if err := tx.QueryRowContext(ctx, `
		SELECT id, status, requested_role, requested_by
		FROM question_reopen_requests
		WHERE question_id = $1
		  AND version_no = $2
		ORDER BY requested_at DESC, id DESC
		LIMIT 1
		FOR UPDATE
	`, in.QuestionID, in.VersionNo).Scan(&reqID, &reqStatus, &reqRole, &reqBy); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrVersionNotFound
		}
		return nil, fmt.Errorf("load reopen request: %w", err)
	}
	if reqStatus != "pending" {
		return nil, fmt.Errorf("%w: tidak ada request reopen yang menunggu persetujuan", ErrInvalidInput)
	}
	if reqBy == in.ApproverID {
		return nil, fmt.Errorf("%w: pengaju tidak boleh menyetujui request sendiri", ErrReviewForbidden)
	}
	if reqRole == in.ApproverRole {
		return nil, fmt.Errorf("%w: persetujuan harus dari peran berbeda", ErrReviewForbidden)
	}

	if _, err := tx.ExecContext(ctx, `
		INSERT INTO question_reopen_approvals (
			reopen_request_id, approver_id, approver_role, note, approved_at
		) VALUES ($1,$2,$3,NULLIF($4,''),now())
		ON CONFLICT (reopen_request_id, approver_id)
		DO UPDATE SET note = EXCLUDED.note, approved_at = now()
	`, reqID, in.ApproverID, in.ApproverRole, in.Note); err != nil {
		return nil, fmt.Errorf("insert reopen approval: %w", err)
	}

	if _, err := tx.ExecContext(ctx, `
		UPDATE question_versions
		SET status = 'revisi',
			is_public = FALSE,
			is_active = TRUE
		WHERE question_id = $1
		  AND version_no = $2
	`, in.QuestionID, in.VersionNo); err != nil {
		return nil, fmt.Errorf("reopen final version to revisi: %w", err)
	}
	if _, err := tx.ExecContext(ctx, `
		UPDATE question_versions
		SET is_active = FALSE
		WHERE question_id = $1
		  AND version_no <> $2
	`, in.QuestionID, in.VersionNo); err != nil {
		return nil, fmt.Errorf("deactivate other versions after reopen: %w", err)
	}

	if _, err := tx.ExecContext(ctx, `
		UPDATE question_reopen_requests
		SET status = 'approved',
			decided_by = $2,
			decided_role = $3,
			decided_note = NULLIF($4,''),
			decided_at = now(),
			updated_at = now()
		WHERE id = $1
	`, reqID, in.ApproverID, in.ApproverRole, in.Note); err != nil {
		return nil, fmt.Errorf("mark reopen request approved: %w", err)
	}

	out, err := s.loadReopenRequestTx(ctx, tx, reqID)
	if err != nil {
		return nil, err
	}

	if err := tx.Commit(); err != nil {
		return nil, fmt.Errorf("commit reopen approve tx: %w", err)
	}
	return out, nil
}

func (s *Service) ListQuestionVersions(ctx context.Context, questionID int64, ownerID *int64) ([]QuestionVersion, error) {
	if questionID <= 0 {
		return nil, ErrInvalidInput
	}
	var ownerFilter int64
	if ownerID != nil && *ownerID > 0 {
		ownerFilter = *ownerID
	}

	rows, err := s.db.QueryContext(ctx, `
		SELECT id, question_id, version_no, stimulus_group_id, stimulus_type, stimulus_content, stimulus_html, stem_html, explanation_html, hint_html,
			question_content, answer_key, status, is_public, is_active, duration_seconds, weight, change_note, created_by, created_at
		FROM question_versions
		WHERE question_id = $1
		  AND ($2 <= 0 OR created_by = $2)
		ORDER BY version_no DESC
	`, questionID, ownerFilter)
	if err != nil {
		return nil, fmt.Errorf("query question versions: %w", err)
	}
	defer rows.Close()

	items := make([]QuestionVersion, 0)
	for rows.Next() {
		item, err := scanQuestionVersion(rows)
		if err != nil {
			return nil, fmt.Errorf("scan question version: %w", err)
		}
		items = append(items, *item)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate question versions: %w", err)
	}
	options, err := s.listQuestionOptions(ctx, s.db, questionID)
	if err != nil {
		return nil, err
	}
	for i := range items {
		items[i].Options = append([]QuestionOptionInput(nil), options...)
	}
	return items, nil
}

func (s *Service) GetQuestionExportData(ctx context.Context, questionID int64, versionNo int, ownerID *int64) (*ExportQuestionData, error) {
	if questionID <= 0 {
		return nil, ErrInvalidInput
	}
	var out ExportQuestionData
	var questionCodeID sql.NullInt64
	var questionCode sql.NullString
	var questionCodeName sql.NullString
	var difficulty sql.NullInt64
	var outMeta json.RawMessage
	if err := s.db.QueryRowContext(ctx, `
		SELECT q.subject_id, s.name, s.education_level, q.learning_goal_id, q.question_code_id,
			qc.code, qc.name, q.question_type, q.difficulty, q.metadata
		FROM questions q
		JOIN subjects s ON s.id = q.subject_id
		LEFT JOIN question_codes qc ON qc.id = q.question_code_id
		WHERE q.id = $1
		  AND q.is_active = TRUE
	`, questionID).Scan(
		&out.SubjectID,
		&out.SubjectName,
		&out.EducationLevel,
		&out.LearningGoalID,
		&questionCodeID,
		&questionCode,
		&questionCodeName,
		&out.QuestionType,
		&difficulty,
		&outMeta,
	); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrQuestionNotFound
		}
		return nil, fmt.Errorf("load question export: %w", err)
	}
	out.QuestionID = questionID
	if difficulty.Valid {
		d := int(difficulty.Int64)
		out.Difficulty = &d
	}
	if questionCodeID.Valid {
		out.QuestionCode = strings.TrimSpace(questionCode.String)
		out.QuestionCodeName = strings.TrimSpace(questionCodeName.String)
	}
	var lgText, lgMateri, lgMapel, lgKelas sql.NullString
	var lgSemester sql.NullInt64
	if err := s.db.QueryRowContext(ctx, `
		SELECT tujuan_pembelajaran, materi, mata_pelajaran, kelas, semester
		FROM learning_goals
		WHERE id = $1
	`, out.LearningGoalID).Scan(&lgText, &lgMateri, &lgMapel, &lgKelas, &lgSemester); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrLearningGoalNotFound
		}
		return nil, fmt.Errorf("load learning goal: %w", err)
	}
	if lgText.Valid {
		out.LearningGoalText = lgText.String
	}
	if lgMateri.Valid {
		out.LearningGoalMateri = lgMateri.String
	}
	if lgKelas.Valid {
		out.LearningGoalKelas = lgKelas.String
	}
	if lgSemester.Valid {
		out.LearningGoalSemester = int16(lgSemester.Int64)
	}

	var ownerFilter int64
	if ownerID != nil && *ownerID > 0 {
		ownerFilter = *ownerID
	}
	var verQuery strings.Builder
	verQuery.WriteString(`
		SELECT version_no, stimulus_group_id, stimulus_type, stimulus_content, stimulus_html, stem_html, explanation_html, hint_html, question_content, answer_key
		FROM question_versions
		WHERE question_id = $1
		  AND ($2 <= 0 OR created_by = $2)
	`)
	args := []any{questionID, ownerFilter}
	if versionNo > 0 {
		verQuery.WriteString(" AND version_no = $3")
		args = append(args, versionNo)
	}
	verQuery.WriteString(" ORDER BY is_active DESC, version_no DESC LIMIT 1")
	var stimulusGroupID sql.NullInt64
	var stimulusType sql.NullString
	var stimulusContent []byte
	var stimulus sql.NullString
	var explanation sql.NullString
	var hint sql.NullString
	if err := s.db.QueryRowContext(ctx, verQuery.String(), args...).Scan(
		&out.VersionNo,
		&stimulusGroupID,
		&stimulusType,
		&stimulusContent,
		&stimulus,
		&out.StemHTML,
		&explanation,
		&hint,
		&out.QuestionContent,
		&out.AnswerKey,
	); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			if ownerID != nil && *ownerID > 0 {
				return nil, ErrForbidden
			}
			return nil, ErrVersionNotFound
		}
		return nil, fmt.Errorf("load question version: %w", err)
	}
	if stimulusType.Valid {
		out.StimulusType = &stimulusType.String
	}
	if stimulusGroupID.Valid {
		out.StimulusGroupID = &stimulusGroupID.Int64
	}
	if len(bytes.TrimSpace(stimulusContent)) > 0 {
		out.StimulusContent = append(json.RawMessage(nil), stimulusContent...)
	}
	if stimulus.Valid {
		out.StimulusHTML = &stimulus.String
	}
	if explanation.Valid {
		out.ExplanationHTML = &explanation.String
	}
	if hint.Valid {
		out.HintHTML = &hint.String
	}

	options, err := s.listQuestionOptions(ctx, s.db, questionID)
	if err != nil {
		return nil, err
	}
	out.Options = append([]QuestionOptionInput(nil), options...)

	var meta QuestionBlueprint
	meta.Metadata = outMeta
	populateBlueprintMetadata(&meta, meta.Metadata)
	out.Title = meta.Title
	out.Indicator = meta.Indicator
	out.Material = meta.Material
	out.Objective = meta.Objective
	out.CognitiveLevel = meta.CognitiveLevel
	return &out, nil
}

func (s *Service) GetUserRole(ctx context.Context, userID int64) (string, error) {
	if userID <= 0 {
		return "", ErrInvalidInput
	}
	var role string
	if err := s.db.QueryRowContext(ctx, `
		SELECT role
		FROM users
		WHERE id = $1
		  AND is_active = TRUE
	`, userID).Scan(&role); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return "", ErrUserNotFound
		}
		return "", fmt.Errorf("load user role: %w", err)
	}
	return role, nil
}

func (s *Service) CloneQuestion(ctx context.Context, in CloneQuestionInput) (*CloneQuestionResult, error) {
	if in.Source == nil || in.TargetUserID <= 0 || in.TargetSubjectID <= 0 {
		return nil, ErrInvalidInput
	}
	role := strings.ToLower(strings.TrimSpace(in.TargetRole))
	if role == "" {
		role = "guru"
	}
	var subjName, subjLevel string
	var subjType string
	if err := s.db.QueryRowContext(ctx, `
		SELECT name, education_level, subject_type
		FROM subjects
		WHERE id = $1 AND is_active = TRUE
	`, in.TargetSubjectID).Scan(&subjName, &subjLevel, &subjType); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrSubjectNotFound
		}
		return nil, fmt.Errorf("load target subject: %w", err)
	}
	_ = subjType
	lgID, err := s.ensureLearningGoalForTransfer(ctx, in.TargetUserID, role, subjName, subjLevel, in.Source)
	if err != nil {
		return nil, err
	}
	codeID, codeOwnerID, err := s.ensureQuestionCodeForTransfer(ctx, in.TargetUserID, in.TargetSubjectID, in.Source.QuestionCode, in.Source.QuestionCodeName)
	if err != nil {
		return nil, err
	}
	enforceOwner := role == "guru" && (codeOwnerID == 0 || codeOwnerID == in.TargetUserID)
	var codePtr *int64
	if codeID > 0 {
		codePtr = &codeID
	}

	questionTitle := strings.TrimSpace(in.Source.Title)
	if questionTitle == "" {
		questionTitle = fallbackTitleFromStem(in.Source.StemHTML)
	}
	if questionTitle == "" {
		questionTitle = "Clone Soal"
	}
	created, err := s.CreateQuestion(ctx, CreateQuestionInput{
		SubjectID:      in.TargetSubjectID,
		LearningGoalID: lgID,
		QuestionCodeID: codePtr,
		EnforceOwner:   enforceOwner,
		QuestionType:   in.Source.QuestionType,
		Title:          questionTitle,
		Indicator:      in.Source.Indicator,
		Material:       in.Source.Material,
		Objective:      in.Source.Objective,
		CognitiveLevel: in.Source.CognitiveLevel,
		Difficulty:     in.Source.Difficulty,
		CreatedBy:      in.TargetUserID,
	})
	if err != nil {
		return nil, err
	}

	version, err := s.CreateQuestionVersion(ctx, CreateQuestionVersionInput{
		QuestionID:      created.ID,
		StimulusHTML:    in.Source.StimulusHTML,
		StemHTML:        &in.Source.StemHTML,
		ExplanationHTML: in.Source.ExplanationHTML,
		HintHTML:        in.Source.HintHTML,
		AnswerKey:       in.Source.AnswerKey,
		Options:         in.Source.Options,
		CreatedBy:       in.TargetUserID,
		EnforceOwner:    role == "guru",
		Dedup:           false,
	})
	if err != nil {
		_, _ = s.db.ExecContext(ctx, `UPDATE questions SET is_active = FALSE WHERE id = $1`, created.ID)
		return nil, err
	}

	return &CloneQuestionResult{QuestionID: created.ID, VersionNo: version.VersionNo}, nil
}

func (s *Service) ensureLearningGoalForTransfer(ctx context.Context, targetUserID int64, targetRole, subjectName, subjectLevel string, src *ExportQuestionData) (int64, error) {
	goalText := strings.TrimSpace(src.LearningGoalText)
	goalMateri := strings.TrimSpace(src.LearningGoalMateri)
	goalKelas := strings.TrimSpace(src.LearningGoalKelas)
	if goalKelas == "" {
		goalKelas = subjectLevel
	}
	goalSemester := int64(src.LearningGoalSemester)
	if goalSemester <= 0 {
		goalSemester = 1
	}
	if goalText == "" {
		goalText = "Transfer Soal"
	}
	if goalMateri == "" {
		goalMateri = "Transfer Soal"
	}
	ownerFilter := int64(0)
	if targetRole == "guru" {
		ownerFilter = targetUserID
	}
	var existingID int64
	if err := s.db.QueryRowContext(ctx, `
		SELECT id
		FROM learning_goals
		WHERE LOWER(mata_pelajaran) = LOWER($1)
		  AND LOWER(kelas) = LOWER($2)
		  AND semester = $3
		  AND LOWER(tujuan_pembelajaran) = LOWER($4)
		  AND LOWER(materi) = LOWER($5)
		  AND ($6 <= 0 OR created_by = $6)
		LIMIT 1
	`, subjectName, goalKelas, goalSemester, goalText, goalMateri, ownerFilter).Scan(&existingID); err == nil {
		return existingID, nil
	} else if err != nil && !errors.Is(err, sql.ErrNoRows) {
		return 0, fmt.Errorf("find learning goal: %w", err)
	}

	var outID int64
	if err := s.db.QueryRowContext(ctx, `
		INSERT INTO learning_goals (tujuan_pembelajaran, materi, mata_pelajaran, kelas, semester, created_by)
		VALUES ($1, $2, $3, $4, $5, NULLIF($6, 0))
		RETURNING id
	`, goalText, goalMateri, subjectName, goalKelas, goalSemester, targetUserID).Scan(&outID); err != nil {
		return 0, fmt.Errorf("create learning goal: %w", err)
	}
	return outID, nil
}

func (s *Service) ensureQuestionCodeForTransfer(ctx context.Context, targetUserID, targetSubjectID int64, code, name string) (int64, int64, error) {
	code = normalizeQuestionCode(code)
	name = strings.TrimSpace(name)
	if code == "" {
		return 0, 0, nil
	}
	var id int64
	var createdBy sql.NullInt64
	if err := s.db.QueryRowContext(ctx, `
		SELECT id, created_by
		FROM question_codes
		WHERE subject_id = $1
		  AND code = $2
		  AND is_active = TRUE
		LIMIT 1
	`, targetSubjectID, code).Scan(&id, &createdBy); err == nil {
		ownerID := int64(0)
		if createdBy.Valid {
			ownerID = createdBy.Int64
		}
		return id, ownerID, nil
	} else if err != nil && !errors.Is(err, sql.ErrNoRows) {
		return 0, 0, fmt.Errorf("load question code: %w", err)
	}
	created, err := s.CreateQuestionCode(ctx, CreateQuestionCodeInput{
		SubjectID: targetSubjectID,
		Code:      code,
		Name:      defaultString(name, code),
		CreatedBy: targetUserID,
	})
	if err != nil {
		return 0, 0, err
	}
	return created.ID, targetUserID, nil
}

func fallbackTitleFromStem(stemHTML string) string {
	clean := stripHTMLForTitle(stemHTML)
	if clean == "" {
		return ""
	}
	if len(clean) > 180 {
		return clean[:180]
	}
	return clean
}

func stripHTMLForTitle(raw string) string {
	text := strings.TrimSpace(raw)
	if text == "" {
		return ""
	}
	replacer := strings.NewReplacer(
		"<br>", " ",
		"<br/>", " ",
		"<br />", " ",
		"</p>", " ",
		"</div>", " ",
		"</li>", " ",
	)
	text = replacer.Replace(text)
	var b strings.Builder
	inTag := false
	for _, r := range text {
		if r == '<' {
			inTag = true
			continue
		}
		if r == '>' {
			inTag = false
			continue
		}
		if !inTag {
			b.WriteRune(r)
		}
	}
	out := html.UnescapeString(b.String())
	out = strings.ReplaceAll(out, "\u00a0", " ")
	out = strings.Join(strings.Fields(out), " ")
	return strings.TrimSpace(out)
}

func defaultString(val, fallback string) string {
	if strings.TrimSpace(val) == "" {
		return fallback
	}
	return val
}

func (s *Service) UpdateQuestionVersion(ctx context.Context, in UpdateQuestionVersionInput) (*QuestionVersion, error) {
	if in.QuestionID <= 0 || in.VersionNo <= 0 {
		return nil, ErrInvalidInput
	}
	if in.EnforceOwner && in.ActorID <= 0 {
		return nil, ErrInvalidInput
	}

	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, fmt.Errorf("begin tx: %w", err)
	}
	defer func() { _ = tx.Rollback() }()

	row := tx.QueryRowContext(ctx, `
		SELECT id, question_id, version_no, stimulus_group_id, stimulus_type, stimulus_content, stimulus_html, stem_html, explanation_html, hint_html,
			question_content, answer_key, status, is_public, is_active, duration_seconds, weight, change_note, created_by, created_at
		FROM question_versions
		WHERE question_id = $1 AND version_no = $2
		FOR UPDATE
	`, in.QuestionID, in.VersionNo)
	item, err := scanQuestionVersion(row)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrVersionNotFound
		}
		return nil, fmt.Errorf("load question version: %w", err)
	}
	if in.EnforceOwner && (item.CreatedBy == nil || *item.CreatedBy != in.ActorID) {
		return nil, ErrForbidden
	}
	var questionType string
	var subjectID int64
	if err := tx.QueryRowContext(ctx, `SELECT question_type, subject_id FROM questions WHERE id = $1 FOR UPDATE`, in.QuestionID).Scan(&questionType, &subjectID); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrQuestionNotFound
		}
		return nil, fmt.Errorf("load question type: %w", err)
	}
	originalQuestionType := questionType
	requestedQuestionType := originalQuestionType
	if in.QuestionType != nil && strings.TrimSpace(*in.QuestionType) != "" {
		requestedQuestionType = strings.TrimSpace(strings.ToLower(*in.QuestionType))
	}
	if requestedQuestionType != originalQuestionType {
		if err := s.changeQuestionTypeTx(ctx, tx, in.QuestionID, originalQuestionType, requestedQuestionType, in.VersionNo, in.AnswerKey); err != nil {
			return nil, err
		}
		questionType = requestedQuestionType
	}

	next := *item
	prevAnswerKey := append([]byte(nil), item.AnswerKey...)
	if in.StimulusType != nil || len(bytes.TrimSpace(in.StimulusContent)) > 0 || in.StimulusHTML != nil {
		stimType, stimContent, stimHTML, err := normalizeStimulusFields(in.StimulusType, in.StimulusContent, in.StimulusHTML)
		if err != nil {
			return nil, err
		}
		next.StimulusType = stimType
		next.StimulusContent = stimContent
		next.StimulusHTML = stimHTML
	}
	if in.StimulusGroupID != nil {
		next.StimulusGroupID, err = s.validateStimulusGroupForQuestion(ctx, tx, in.StimulusGroupID, subjectID, in.ActorID, in.EnforceOwner)
		if err != nil {
			return nil, err
		}
	}
	if in.StemHTML != nil {
		v := strings.TrimSpace(*in.StemHTML)
		if v == "" {
			return nil, fmt.Errorf("%w: stem_html cannot be empty", ErrInvalidInput)
		}
		next.StemHTML = v
	}
	if in.ExplanationHTML != nil {
		v := strings.TrimSpace(*in.ExplanationHTML)
		next.ExplanationHTML = &v
	}
	if in.HintHTML != nil {
		v := strings.TrimSpace(*in.HintHTML)
		next.HintHTML = &v
	}
	if len(in.AnswerKey) > 0 {
		if !json.Valid(in.AnswerKey) {
			return nil, fmt.Errorf("%w: answer_key must be valid json", ErrInvalidInput)
		}
		next.AnswerKey = in.AnswerKey
	}
	if in.DurationSeconds != nil {
		if *in.DurationSeconds < 0 {
			return nil, fmt.Errorf("%w: duration_seconds cannot be negative", ErrInvalidInput)
		}
		next.DurationSeconds = in.DurationSeconds
	}
	if in.Weight != nil {
		if *in.Weight <= 0 {
			return nil, fmt.Errorf("%w: weight must be > 0", ErrInvalidInput)
		}
		next.Weight = *in.Weight
	}
	if in.ChangeNote != nil {
		v := strings.TrimSpace(*in.ChangeNote)
		next.ChangeNote = &v
	}
	if strings.TrimSpace(next.StemHTML) == "" {
		return nil, fmt.Errorf("%w: stem_html is required", ErrInvalidInput)
	}
	if len(next.AnswerKey) == 0 {
		next.AnswerKey = json.RawMessage(`{}`)
	}
	if requestedQuestionType != originalQuestionType && len(in.AnswerKey) == 0 {
		convertedKey, err := convertQuestionAnswerKey(originalQuestionType, requestedQuestionType, next.AnswerKey)
		if err != nil {
			return nil, err
		}
		next.AnswerKey = convertedKey
	}
	if len(bytes.TrimSpace(in.QuestionContent)) > 0 {
		next.QuestionContent = in.QuestionContent
	}
	next.QuestionContent, err = normalizeQuestionContent(questionType, next.QuestionContent)
	if err != nil {
		return nil, err
	}
	if err := validateAnswerKey(questionType, next.AnswerKey); err != nil {
		return nil, err
	}
	if questionType == "menjodohkan_drag_drop" {
		if err := validateMatchingReferences(next.QuestionContent, next.AnswerKey); err != nil {
			return nil, err
		}
	}

	optionsInput := in.Options
	if len(optionsInput) == 0 {
		optionsInput, err = s.listQuestionOptions(ctx, tx, in.QuestionID)
		if err != nil {
			return nil, err
		}
	}
	normalizedOptions, correctOptionKeys, err := normalizeAndValidateOptions(questionType, optionsInput, next.AnswerKey)
	if err != nil {
		return nil, err
	}
	contentHash, err := computeQuestionContentHash(
		questionType,
		next.StemHTML,
		next.StimulusType,
		next.StimulusContent,
		next.StimulusHTML,
		next.ExplanationHTML,
		next.HintHTML,
		next.QuestionContent,
		next.AnswerKey,
		normalizedOptions,
	)
	if err != nil {
		return nil, err
	}

	updatedRow := tx.QueryRowContext(ctx, `
		UPDATE question_versions
		SET stimulus_group_id = $3,
			stimulus_type = $4,
			stimulus_content = $5::jsonb,
			stimulus_html = $6,
			stem_html = $7,
			explanation_html = $8,
			hint_html = $9,
			question_content = $10::jsonb,
			answer_key = $11::jsonb,
			duration_seconds = $12,
			weight = $13,
			change_note = $14,
			content_hash = $15
		WHERE question_id = $1 AND version_no = $2
		RETURNING id, question_id, version_no, stimulus_group_id, stimulus_type, stimulus_content, stimulus_html, stem_html, explanation_html, hint_html,
			question_content, answer_key, status, is_public, is_active, duration_seconds, weight, change_note, created_by, created_at
	`, in.QuestionID, in.VersionNo, nullInt64Ptr(next.StimulusGroupID), nullStringPtr(next.StimulusType), nullJSONBytes(next.StimulusContent), nullStringPtr(next.StimulusHTML), next.StemHTML, nullStringPtr(next.ExplanationHTML), nullStringPtr(next.HintHTML), []byte(next.QuestionContent), []byte(next.AnswerKey), nullIntPtr(next.DurationSeconds), next.Weight, nullStringPtr(next.ChangeNote), contentHash)
	out, err := scanQuestionVersion(updatedRow)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrVersionNotFound
		}
		return nil, fmt.Errorf("update question version: %w", err)
	}

	if len(normalizedOptions) > 0 {
		if _, err := tx.ExecContext(ctx, `DELETE FROM question_options WHERE question_id = $1`, in.QuestionID); err != nil {
			return nil, fmt.Errorf("clear question options: %w", err)
		}
		for _, opt := range normalizedOptions {
			isCorrect := correctOptionKeys[opt.OptionKey]
			if _, err := tx.ExecContext(ctx, `
				INSERT INTO question_options (question_id, option_key, option_html, is_correct)
				VALUES ($1, $2, $3, $4)
			`, in.QuestionID, opt.OptionKey, opt.OptionHTML, isCorrect); err != nil {
				return nil, fmt.Errorf("insert question option: %w", err)
			}
		}
	}

	if _, err := tx.ExecContext(ctx, `UPDATE questions SET updated_at = now() WHERE id = $1`, in.QuestionID); err != nil {
		return nil, fmt.Errorf("update question timestamp: %w", err)
	}
	if in.ActorID > 0 {
		prevNorm := normalizeJSONBytes(prevAnswerKey)
		nextNorm := normalizeJSONBytes(next.AnswerKey)
		if !bytes.Equal(prevNorm, nextNorm) {
			entityID := fmt.Sprintf("%d:%d", in.QuestionID, in.VersionNo)
			if err := s.writeAuditTx(ctx, tx, in.ActorID, "question_answer_key_update", "question_version", entityID, map[string]any{
				"question_id": in.QuestionID,
				"version_no":  in.VersionNo,
				"before":      json.RawMessage(prevNorm),
				"after":       json.RawMessage(nextNorm),
			}); err != nil {
				return nil, fmt.Errorf("write audit log: %w", err)
			}
		}
	}
	if err := tx.Commit(); err != nil {
		return nil, fmt.Errorf("commit tx: %w", err)
	}
	return out, nil
}

func (s *Service) changeQuestionTypeTx(ctx context.Context, tx *sql.Tx, questionID int64, currentType string, nextType string, editingVersionNo int, editingAnswerKey json.RawMessage) error {
	currentType = strings.TrimSpace(strings.ToLower(currentType))
	nextType = strings.TrimSpace(strings.ToLower(nextType))
	if currentType == nextType {
		return nil
	}
	if !isSafeQuestionTypeChange(currentType, nextType) {
		return fmt.Errorf("%w: tipe soal hanya bisa diubah antara MC dan MR", ErrInvalidInput)
	}

	var usedInExamAttempt bool
	if err := tx.QueryRowContext(ctx, `
		SELECT EXISTS (
			SELECT 1
			FROM exam_questions eq
			JOIN attempts a
			  ON a.exam_id = eq.exam_id
			WHERE eq.question_id = $1
		)
	`, questionID).Scan(&usedInExamAttempt); err != nil {
		return fmt.Errorf("check question exam attempt usage: %w", err)
	}
	if usedInExamAttempt {
		return fmt.Errorf("%w: tipe soal tidak bisa diubah karena soal sudah punya attempt pada ujian", ErrInvalidInput)
	}

	rows, err := tx.QueryContext(ctx, `
		SELECT version_no, answer_key
		FROM question_versions
		WHERE question_id = $1
		FOR UPDATE
	`, questionID)
	if err != nil {
		return fmt.Errorf("list question versions for type change: %w", err)
	}
	defer rows.Close()

	type versionAnswerKey struct {
		VersionNo int
		AnswerKey []byte
	}
	versions := make([]versionAnswerKey, 0)
	for rows.Next() {
		var item versionAnswerKey
		if err := rows.Scan(&item.VersionNo, &item.AnswerKey); err != nil {
			return fmt.Errorf("scan version answer key: %w", err)
		}
		versions = append(versions, item)
	}
	if err := rows.Err(); err != nil {
		return fmt.Errorf("iterate version answer keys: %w", err)
	}

	for _, item := range versions {
		targetAnswerKey := append([]byte(nil), item.AnswerKey...)
		if item.VersionNo == editingVersionNo && len(editingAnswerKey) > 0 {
			targetAnswerKey = append([]byte(nil), editingAnswerKey...)
		} else {
			targetAnswerKey, err = convertQuestionAnswerKey(currentType, nextType, targetAnswerKey)
			if err != nil {
				return fmt.Errorf("%w: versi %d tidak bisa dikonversi dari %s ke %s: %v", ErrInvalidInput, item.VersionNo, currentType, nextType, err)
			}
		}
		if err := validateAnswerKey(nextType, targetAnswerKey); err != nil {
			return fmt.Errorf("%w: versi %d tidak valid untuk tipe %s: %v", ErrInvalidInput, item.VersionNo, nextType, err)
		}
		if item.VersionNo == editingVersionNo {
			continue
		}
		if _, err := tx.ExecContext(ctx, `
			UPDATE question_versions
			SET answer_key = $2::jsonb
			WHERE question_id = $1
			  AND version_no = $3
		`, questionID, []byte(targetAnswerKey), item.VersionNo); err != nil {
			return fmt.Errorf("update version answer key for type change: %w", err)
		}
	}

	if _, err := tx.ExecContext(ctx, `
		UPDATE questions
		SET question_type = $2,
			updated_at = now()
		WHERE id = $1
	`, questionID, nextType); err != nil {
		return fmt.Errorf("update question type: %w", err)
	}
	return nil
}

func isSafeQuestionTypeChange(currentType, nextType string) bool {
	currentType = strings.TrimSpace(strings.ToLower(currentType))
	nextType = strings.TrimSpace(strings.ToLower(nextType))
	return (currentType == "pg_tunggal" && nextType == "multi_jawaban") ||
		(currentType == "multi_jawaban" && nextType == "pg_tunggal")
}

func convertQuestionAnswerKey(currentType, nextType string, raw json.RawMessage) (json.RawMessage, error) {
	currentType = strings.TrimSpace(strings.ToLower(currentType))
	nextType = strings.TrimSpace(strings.ToLower(nextType))
	if currentType == nextType {
		return append(json.RawMessage(nil), raw...), nil
	}

	var obj map[string]any
	if err := json.Unmarshal(raw, &obj); err != nil {
		return nil, fmt.Errorf("answer_key must be object")
	}

	switch {
	case currentType == "pg_tunggal" && nextType == "multi_jawaban":
		correct, _ := obj["correct"].(string)
		correct = strings.TrimSpace(strings.ToUpper(correct))
		if correct == "" {
			return nil, fmt.Errorf("pg_tunggal answer_key.correct (string) is required")
		}
		converted, err := json.Marshal(map[string]any{
			"correct": []string{correct},
			"mode":    "exact",
		})
		if err != nil {
			return nil, fmt.Errorf("marshal converted answer_key: %w", err)
		}
		return json.RawMessage(converted), nil
	case currentType == "multi_jawaban" && nextType == "pg_tunggal":
		rawCorrect, _ := obj["correct"].([]any)
		if len(rawCorrect) != 1 {
			return nil, fmt.Errorf("multi_jawaban harus memiliki tepat 1 jawaban benar")
		}
		correct, _ := rawCorrect[0].(string)
		correct = strings.TrimSpace(strings.ToUpper(correct))
		if correct == "" {
			return nil, fmt.Errorf("multi_jawaban answer_key.correct[0] must be non-empty string")
		}
		converted, err := json.Marshal(map[string]any{
			"correct": correct,
		})
		if err != nil {
			return nil, fmt.Errorf("marshal converted answer_key: %w", err)
		}
		return json.RawMessage(converted), nil
	default:
		return nil, fmt.Errorf("unsupported question type change")
	}
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

	auditHasTenant, err := hasColumn(ctx, tx, "audit_logs", "tenant_id")
	if err != nil {
		return err
	}
	insertColumns := []string{"user_id", "action", "entity_type", "entity_id", "payload", "created_at"}
	insertValues := []string{"$1", "$2", "$3", "$4", "$5::jsonb", "now()"}
	insertArgs := []any{userID, action, entityType, entityID, string(b)}
	if auditHasTenant {
		tenantID, err := loadUserTenantID(ctx, tx, userID)
		if err != nil {
			return err
		}
		if tenantID == nil || *tenantID <= 0 {
			return fmt.Errorf("resolve audit log tenant: tenant_id is required")
		}
		insertColumns = append(insertColumns, "tenant_id")
		insertValues = append(insertValues, fmt.Sprintf("$%d", len(insertArgs)+1))
		insertArgs = append(insertArgs, *tenantID)
	}
	_, err = tx.ExecContext(ctx, fmt.Sprintf(`
		INSERT INTO audit_logs (%s)
		VALUES (%s)
	`, strings.Join(insertColumns, ", "), strings.Join(insertValues, ", ")), insertArgs...)
	return err
}

func normalizeJSONBytes(raw []byte) []byte {
	if len(raw) == 0 {
		return []byte("{}")
	}
	var buf bytes.Buffer
	if err := json.Compact(&buf, raw); err != nil {
		return bytes.TrimSpace(raw)
	}
	return buf.Bytes()
}

func (s *Service) DeleteQuestionVersion(ctx context.Context, questionID int64, versionNo int, actorID int64, enforceOwner bool) error {
	if questionID <= 0 || versionNo <= 0 {
		return ErrInvalidInput
	}
	if enforceOwner && actorID <= 0 {
		return ErrInvalidInput
	}

	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("begin tx: %w", err)
	}
	defer func() { _ = tx.Rollback() }()

	var createdBy sql.NullInt64
	if err := tx.QueryRowContext(ctx, `
		SELECT created_by
		FROM question_versions
		WHERE question_id = $1 AND version_no = $2
		FOR UPDATE
	`, questionID, versionNo).Scan(&createdBy); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return ErrVersionNotFound
		}
		return fmt.Errorf("load question version: %w", err)
	}
	if enforceOwner && (!createdBy.Valid || createdBy.Int64 != actorID) {
		return ErrForbidden
	}
	res, err := tx.ExecContext(ctx, `
		DELETE FROM question_versions
		WHERE question_id = $1 AND version_no = $2
	`, questionID, versionNo)
	if err != nil {
		return fmt.Errorf("delete question version: %w", err)
	}
	affected, _ := res.RowsAffected()
	if affected == 0 {
		return ErrVersionNotFound
	}

	var maxVersion sql.NullInt64
	if err := tx.QueryRowContext(ctx, `SELECT MAX(version_no) FROM question_versions WHERE question_id = $1`, questionID).Scan(&maxVersion); err != nil {
		return fmt.Errorf("load latest version: %w", err)
	}
	if maxVersion.Valid {
		if _, err := tx.ExecContext(ctx, `UPDATE questions SET version = $2, updated_at = now() WHERE id = $1`, questionID, int(maxVersion.Int64)); err != nil {
			return fmt.Errorf("update question version pointer: %w", err)
		}
	} else {
		if _, err := tx.ExecContext(ctx, `UPDATE questions SET version = 1, updated_at = now() WHERE id = $1`, questionID); err != nil {
			return fmt.Errorf("reset question version pointer: %w", err)
		}
	}

	if err := tx.Commit(); err != nil {
		return fmt.Errorf("commit tx: %w", err)
	}
	return nil
}

func (s *Service) CreateQuestionParallel(ctx context.Context, in CreateQuestionParallelInput) (*QuestionParallel, error) {
	in.ParallelGroup = strings.TrimSpace(in.ParallelGroup)
	in.ParallelLabel = strings.TrimSpace(in.ParallelLabel)
	if in.ParallelGroup == "" {
		in.ParallelGroup = "default"
	}
	if in.ExamID <= 0 || in.QuestionID <= 0 || in.ParallelOrder <= 0 || in.ParallelLabel == "" {
		return nil, ErrInvalidInput
	}

	if err := s.ensureExamAndQuestionLinked(ctx, in.ExamID, in.QuestionID); err != nil {
		return nil, err
	}

	row := s.db.QueryRowContext(ctx, `
		INSERT INTO question_parallels (exam_id, question_id, parallel_group, parallel_order, parallel_label, is_active, created_at)
		VALUES ($1, $2, $3, $4, $5, TRUE, now())
		RETURNING id, exam_id, question_id, parallel_group, parallel_order, parallel_label, is_active, created_at
	`, in.ExamID, in.QuestionID, in.ParallelGroup, in.ParallelOrder, in.ParallelLabel)
	out, err := scanQuestionParallel(row)
	if err != nil {
		return nil, fmt.Errorf("insert question parallel: %w", err)
	}
	return out, nil
}

func (s *Service) ListQuestionParallels(ctx context.Context, examID int64, parallelGroup string) ([]QuestionParallel, error) {
	if examID <= 0 {
		return nil, ErrInvalidInput
	}
	parallelGroup = strings.TrimSpace(parallelGroup)

	var examExists bool
	if err := s.db.QueryRowContext(ctx, `SELECT EXISTS(SELECT 1 FROM exams WHERE id = $1)`, examID).Scan(&examExists); err != nil {
		return nil, fmt.Errorf("check exam exists: %w", err)
	}
	if !examExists {
		return nil, ErrExamNotFound
	}

	query := `
		SELECT id, exam_id, question_id, parallel_group, parallel_order, parallel_label, is_active, created_at
		FROM question_parallels
		WHERE exam_id = $1
	`
	args := []any{examID}
	if parallelGroup != "" {
		query += ` AND parallel_group = $2`
		args = append(args, parallelGroup)
	}
	query += ` ORDER BY parallel_group ASC, parallel_order ASC, id ASC`

	rows, err := s.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("query question parallels: %w", err)
	}
	defer rows.Close()

	items := make([]QuestionParallel, 0)
	for rows.Next() {
		item, err := scanQuestionParallel(rows)
		if err != nil {
			return nil, fmt.Errorf("scan question parallel: %w", err)
		}
		items = append(items, *item)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate question parallels: %w", err)
	}
	return items, nil
}

func (s *Service) UpdateQuestionParallel(ctx context.Context, in UpdateQuestionParallelInput) (*QuestionParallel, error) {
	in.ParallelGroup = strings.TrimSpace(in.ParallelGroup)
	in.ParallelLabel = strings.TrimSpace(in.ParallelLabel)
	if in.ParallelGroup == "" {
		in.ParallelGroup = "default"
	}
	if in.ExamID <= 0 || in.ParallelID <= 0 || in.QuestionID <= 0 || in.ParallelOrder <= 0 || in.ParallelLabel == "" {
		return nil, ErrInvalidInput
	}

	if err := s.ensureExamAndQuestionLinked(ctx, in.ExamID, in.QuestionID); err != nil {
		return nil, err
	}

	row := s.db.QueryRowContext(ctx, `
		UPDATE question_parallels
		SET question_id = $3,
			parallel_group = $4,
			parallel_order = $5,
			parallel_label = $6,
			is_active = TRUE
		WHERE id = $1 AND exam_id = $2
		RETURNING id, exam_id, question_id, parallel_group, parallel_order, parallel_label, is_active, created_at
	`, in.ParallelID, in.ExamID, in.QuestionID, in.ParallelGroup, in.ParallelOrder, in.ParallelLabel)
	out, err := scanQuestionParallel(row)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrParallelNotFound
		}
		return nil, fmt.Errorf("update question parallel: %w", err)
	}
	return out, nil
}

func (s *Service) DeleteQuestionParallel(ctx context.Context, examID, parallelID int64) error {
	if examID <= 0 || parallelID <= 0 {
		return ErrInvalidInput
	}
	res, err := s.db.ExecContext(ctx, `DELETE FROM question_parallels WHERE id = $1 AND exam_id = $2`, parallelID, examID)
	if err != nil {
		return fmt.Errorf("delete question parallel: %w", err)
	}
	affected, err := res.RowsAffected()
	if err != nil {
		return fmt.Errorf("delete question parallel affected rows: %w", err)
	}
	if affected == 0 {
		return ErrParallelNotFound
	}
	return nil
}

func (s *Service) CreateReviewTask(ctx context.Context, in CreateReviewTaskInput) (*ReviewTask, error) {
	in.Note = strings.TrimSpace(in.Note)
	if in.QuestionVersionID <= 0 || in.ReviewerID <= 0 {
		return nil, ErrInvalidInput
	}

	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, fmt.Errorf("begin tx: %w", err)
	}
	defer func() { _ = tx.Rollback() }()

	var questionID int64
	err = tx.QueryRowContext(ctx, `
		SELECT question_id FROM question_versions WHERE id = $1
	`, in.QuestionVersionID).Scan(&questionID)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrVersionNotFound
		}
		return nil, fmt.Errorf("load question version: %w", err)
	}

	if in.ExamID != nil && *in.ExamID > 0 {
		var examExists bool
		if err := tx.QueryRowContext(ctx, `SELECT EXISTS(SELECT 1 FROM exams WHERE id = $1)`, *in.ExamID).Scan(&examExists); err != nil {
			return nil, fmt.Errorf("check exam exists: %w", err)
		}
		if !examExists {
			return nil, ErrExamNotFound
		}
	}

	row := tx.QueryRowContext(ctx, `
		INSERT INTO review_tasks (question_version_id, exam_id, reviewer_id, status, assigned_at, note)
		VALUES ($1, $2, $3, 'menunggu_reviu', now(), NULLIF($4,''))
		ON CONFLICT (question_version_id, reviewer_id)
		DO UPDATE SET status='menunggu_reviu', assigned_at=now(), note=EXCLUDED.note
		RETURNING id, question_version_id, reviewer_id, status, assigned_at, reviewed_at, note, exam_id
	`, in.QuestionVersionID, nullInt64Ptr(in.ExamID), in.ReviewerID, in.Note)

	var out ReviewTask
	var reviewedAt sql.NullTime
	var note sql.NullString
	var examID sql.NullInt64
	if err := row.Scan(&out.ID, &out.QuestionVersionID, &out.ReviewerID, &out.Status, &out.AssignedAt, &reviewedAt, &note, &examID); err != nil {
		return nil, fmt.Errorf("insert review task: %w", err)
	}
	out.QuestionID = questionID
	if reviewedAt.Valid {
		out.ReviewedAt = &reviewedAt.Time
	}
	if note.Valid {
		out.Note = &note.String
	}
	if examID.Valid {
		out.ExamID = &examID.Int64
	}

	if _, err := tx.ExecContext(ctx, `
		UPDATE question_versions
		SET status = 'menunggu_reviu'
		WHERE id = $1
	`, in.QuestionVersionID); err != nil {
		return nil, fmt.Errorf("update question_version review status: %w", err)
	}

	if err := tx.Commit(); err != nil {
		return nil, fmt.Errorf("commit tx: %w", err)
	}
	return &out, nil
}

func (s *Service) DecideReviewTask(ctx context.Context, in ReviewDecisionInput) (*ReviewTask, error) {
	in.Status = strings.TrimSpace(in.Status)
	in.Note = strings.TrimSpace(in.Note)
	if in.TaskID <= 0 || in.ReviewerID <= 0 {
		return nil, ErrInvalidInput
	}
	if in.Status != "disetujui" && in.Status != "perlu_revisi" {
		return nil, ErrInvalidInput
	}
	if in.Status == "perlu_revisi" && in.Note == "" {
		return nil, fmt.Errorf("%w: review note is required for perlu_revisi", ErrInvalidInput)
	}

	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, fmt.Errorf("begin tx: %w", err)
	}
	defer func() { _ = tx.Rollback() }()

	var questionVersionID int64
	var questionID int64
	var reviewerID int64
	err = tx.QueryRowContext(ctx, `
		SELECT rt.question_version_id, qv.question_id, rt.reviewer_id
		FROM review_tasks rt
		JOIN question_versions qv ON qv.id = rt.question_version_id
		WHERE rt.id = $1
		FOR UPDATE
	`, in.TaskID).Scan(&questionVersionID, &questionID, &reviewerID)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrReviewTaskNotFound
		}
		return nil, fmt.Errorf("load review task: %w", err)
	}
	if !in.IsPrivileged && reviewerID != in.ReviewerID {
		return nil, ErrReviewForbidden
	}

	_, err = tx.ExecContext(ctx, `
		UPDATE review_tasks
		SET status = $2, reviewed_at = now(), note = NULLIF($3,'')
		WHERE id = $1
	`, in.TaskID, in.Status, in.Note)
	if err != nil {
		return nil, fmt.Errorf("update review task decision: %w", err)
	}

	commentType := "keputusan"
	if in.Status == "perlu_revisi" {
		commentType = "revisi"
	}
	if in.Note != "" {
		if _, err := tx.ExecContext(ctx, `
			INSERT INTO review_comments (review_task_id, author_id, comment_type, comment_text, created_at)
			VALUES ($1, $2, $3, $4, now())
		`, in.TaskID, in.ReviewerID, commentType, in.Note); err != nil {
			return nil, fmt.Errorf("insert review comment: %w", err)
		}
	}

	nextQvStatus := "revisi"
	if in.Status == "disetujui" {
		nextQvStatus = "final"
	}
	if _, err := tx.ExecContext(ctx, `
		UPDATE question_versions
		SET status = $2
		WHERE id = $1
	`, questionVersionID, nextQvStatus); err != nil {
		return nil, fmt.Errorf("update question_version status from review: %w", err)
	}

	row := tx.QueryRowContext(ctx, `
		SELECT id, question_version_id, reviewer_id, status, assigned_at, reviewed_at, note, exam_id
		FROM review_tasks
		WHERE id = $1
	`, in.TaskID)
	var out ReviewTask
	var reviewedAt sql.NullTime
	var note sql.NullString
	var examID sql.NullInt64
	if err := row.Scan(&out.ID, &out.QuestionVersionID, &out.ReviewerID, &out.Status, &out.AssignedAt, &reviewedAt, &note, &examID); err != nil {
		return nil, fmt.Errorf("reload review task: %w", err)
	}
	out.QuestionID = questionID
	if reviewedAt.Valid {
		out.ReviewedAt = &reviewedAt.Time
	}
	if note.Valid {
		out.Note = &note.String
	}
	if examID.Valid {
		out.ExamID = &examID.Int64
	}

	if err := tx.Commit(); err != nil {
		return nil, fmt.Errorf("commit tx: %w", err)
	}
	return &out, nil
}

func (s *Service) ListReviewTasks(ctx context.Context, reviewerID int64, status string) ([]ReviewTask, error) {
	status = strings.TrimSpace(status)
	if reviewerID <= 0 {
		return nil, ErrInvalidInput
	}
	if status != "" && status != "menunggu_reviu" && status != "disetujui" && status != "perlu_revisi" {
		return nil, ErrInvalidInput
	}

	query := `
		SELECT rt.id, rt.question_version_id, qv.question_id, rt.reviewer_id, rt.status, rt.assigned_at, rt.reviewed_at, rt.note, rt.exam_id
		FROM review_tasks rt
		JOIN question_versions qv ON qv.id = rt.question_version_id
		WHERE rt.reviewer_id = $1
	`
	args := []any{reviewerID}
	if status != "" {
		query += ` AND rt.status = $2`
		args = append(args, status)
	}
	query += ` ORDER BY rt.assigned_at DESC`

	rows, err := s.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("query review tasks: %w", err)
	}
	defer rows.Close()

	items := make([]ReviewTask, 0)
	for rows.Next() {
		var item ReviewTask
		var reviewedAt sql.NullTime
		var note sql.NullString
		var examID sql.NullInt64
		if err := rows.Scan(&item.ID, &item.QuestionVersionID, &item.QuestionID, &item.ReviewerID, &item.Status, &item.AssignedAt, &reviewedAt, &note, &examID); err != nil {
			return nil, fmt.Errorf("scan review task: %w", err)
		}
		if reviewedAt.Valid {
			item.ReviewedAt = &reviewedAt.Time
		}
		if note.Valid {
			item.Note = &note.String
		}
		if examID.Valid {
			item.ExamID = &examID.Int64
		}
		items = append(items, item)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate review tasks: %w", err)
	}
	return items, nil
}

func (s *Service) GetQuestionReviews(ctx context.Context, questionID int64) ([]QuestionReview, error) {
	if questionID <= 0 {
		return nil, ErrInvalidInput
	}

	rows, err := s.db.QueryContext(ctx, `
		SELECT rt.id, rt.question_version_id, qv.question_id, rt.reviewer_id, rt.status, rt.assigned_at, rt.reviewed_at, rt.note, rt.exam_id
		FROM review_tasks rt
		JOIN question_versions qv ON qv.id = rt.question_version_id
		WHERE qv.question_id = $1
		ORDER BY rt.assigned_at DESC
	`, questionID)
	if err != nil {
		return nil, fmt.Errorf("query question review tasks: %w", err)
	}
	defer rows.Close()

	out := make([]QuestionReview, 0)
	for rows.Next() {
		var task ReviewTask
		var reviewedAt sql.NullTime
		var note sql.NullString
		var examID sql.NullInt64
		if err := rows.Scan(&task.ID, &task.QuestionVersionID, &task.QuestionID, &task.ReviewerID, &task.Status, &task.AssignedAt, &reviewedAt, &note, &examID); err != nil {
			return nil, fmt.Errorf("scan question review task: %w", err)
		}
		if reviewedAt.Valid {
			task.ReviewedAt = &reviewedAt.Time
		}
		if note.Valid {
			task.Note = &note.String
		}
		if examID.Valid {
			task.ExamID = &examID.Int64
		}

		comments, err := s.listReviewComments(ctx, task.ID)
		if err != nil {
			return nil, err
		}
		out = append(out, QuestionReview{
			Task:     task,
			Comments: comments,
		})
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate question review tasks: %w", err)
	}
	return out, nil
}

func (s *Service) listReviewComments(ctx context.Context, taskID int64) ([]ReviewComment, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT id, review_task_id, author_id, comment_type, comment_text, created_at
		FROM review_comments
		WHERE review_task_id = $1
		ORDER BY created_at ASC, id ASC
	`, taskID)
	if err != nil {
		return nil, fmt.Errorf("query review comments: %w", err)
	}
	defer rows.Close()

	items := make([]ReviewComment, 0)
	for rows.Next() {
		var c ReviewComment
		if err := rows.Scan(&c.ID, &c.ReviewTaskID, &c.AuthorID, &c.CommentType, &c.CommentText, &c.CreatedAt); err != nil {
			return nil, fmt.Errorf("scan review comment: %w", err)
		}
		items = append(items, c)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate review comments: %w", err)
	}
	return items, nil
}

func (s *Service) ensureExamAndQuestionLinked(ctx context.Context, examID, questionID int64) error {
	var examExists bool
	if err := s.db.QueryRowContext(ctx, `SELECT EXISTS(SELECT 1 FROM exams WHERE id = $1)`, examID).Scan(&examExists); err != nil {
		return fmt.Errorf("check exam exists: %w", err)
	}
	if !examExists {
		return ErrExamNotFound
	}

	var linked bool
	if err := s.db.QueryRowContext(ctx, `
		SELECT EXISTS(
			SELECT 1 FROM exam_questions WHERE exam_id = $1 AND question_id = $2
		)
	`, examID, questionID).Scan(&linked); err != nil {
		return fmt.Errorf("check question in exam: %w", err)
	}
	if !linked {
		return ErrQuestionNotInExam
	}
	return nil
}

type baseVersionData struct {
	StimulusGroupID *int64
	StimulusType    *string
	StimulusContent json.RawMessage
	StimulusHTML    *string
	StemHTML        string
	ExplanationHTML *string
	HintHTML        *string
	QuestionContent json.RawMessage
	AnswerKey       json.RawMessage
	DurationSeconds *int
	Weight          float64
	ChangeNote      *string
}

func normalizeStimulusFields(stimulusType *string, stimulusContent json.RawMessage, stimulusHTML *string) (*string, json.RawMessage, *string, error) {
	trimmedHTML := ""
	if stimulusHTML != nil {
		trimmedHTML = strings.TrimSpace(*stimulusHTML)
	}

	hasStructured := stimulusType != nil || len(bytes.TrimSpace(stimulusContent)) > 0
	if !hasStructured {
		if trimmedHTML == "" {
			return nil, nil, nil, nil
		}
		return nil, nil, &trimmedHTML, nil
	}

	if stimulusType == nil {
		return nil, nil, nil, fmt.Errorf("%w: stimulus_type is required when stimulus_content is set", ErrInvalidInput)
	}
	typ := strings.TrimSpace(strings.ToLower(*stimulusType))
	switch typ {
	case "single", "multiteks":
	default:
		return nil, nil, nil, fmt.Errorf("%w: stimulus_type must be single or multiteks", ErrInvalidInput)
	}

	content := bytes.TrimSpace(stimulusContent)
	if len(content) == 0 {
		return nil, nil, nil, fmt.Errorf("%w: stimulus_content is required when stimulus_type is set", ErrInvalidInput)
	}

	rendered, normalizedContent, err := buildStimulusHTMLFromContent(typ, content)
	if err != nil {
		return nil, nil, nil, err
	}
	if rendered == "" {
		return nil, nil, nil, nil
	}
	normalizedType := typ
	return &normalizedType, normalizedContent, &rendered, nil
}

func buildStimulusHTMLFromContent(stimulusType string, raw json.RawMessage) (string, json.RawMessage, error) {
	switch strings.TrimSpace(strings.ToLower(stimulusType)) {
	case "single":
		var payload struct {
			Body string `json:"body"`
		}
		if err := json.Unmarshal(raw, &payload); err != nil {
			return "", nil, fmt.Errorf("%w: stimulus_content single must be object", ErrInvalidInput)
		}
		payload.Body = strings.TrimSpace(payload.Body)
		if payload.Body == "" {
			return "", nil, nil
		}
		normalized, err := json.Marshal(map[string]string{"body": payload.Body})
		if err != nil {
			return "", nil, fmt.Errorf("marshal stimulus content: %w", err)
		}
		return payload.Body, normalized, nil
	case "multiteks":
		var payload struct {
			Tabs []struct {
				Title string `json:"title"`
				Body  string `json:"body"`
			} `json:"tabs"`
		}
		if err := json.Unmarshal(raw, &payload); err != nil {
			return "", nil, fmt.Errorf("%w: stimulus_content multiteks must be object", ErrInvalidInput)
		}
		tabs := make([]map[string]string, 0, len(payload.Tabs))
		var b strings.Builder
		for i, tab := range payload.Tabs {
			title := strings.TrimSpace(tab.Title)
			body := strings.TrimSpace(tab.Body)
			if body == "" {
				continue
			}
			tabs = append(tabs, map[string]string{
				"title": title,
				"body":  body,
			})
			if title == "" {
				title = fmt.Sprintf("Tab %d", i+1)
			}
			b.WriteString(`<section class="panel mt"><h4>`)
			b.WriteString(html.EscapeString(title))
			b.WriteString(`</h4><div class="box mt">`)
			b.WriteString(body)
			b.WriteString(`</div></section>`)
		}
		if len(tabs) == 0 {
			return "", nil, nil
		}
		normalized, err := json.Marshal(map[string]any{"tabs": tabs})
		if err != nil {
			return "", nil, fmt.Errorf("marshal stimulus content: %w", err)
		}
		return strings.TrimSpace(b.String()), normalized, nil
	default:
		return "", nil, fmt.Errorf("%w: stimulus_type must be single or multiteks", ErrInvalidInput)
	}
}

type queryContextRunner interface {
	QueryContext(ctx context.Context, query string, args ...any) (*sql.Rows, error)
}

func (s *Service) canCreateVersionTx(ctx context.Context, tx *sql.Tx, questionID int64, ownerID int64) (bool, error) {
	var totalVersions int
	var ownedVersions int
	if err := tx.QueryRowContext(ctx, `
		SELECT
			COUNT(1) AS total_versions,
			COUNT(1) FILTER (WHERE created_by = $2) AS owned_versions
		FROM question_versions
		WHERE question_id = $1
	`, questionID, ownerID).Scan(&totalVersions, &ownedVersions); err != nil {
		return false, fmt.Errorf("check question version ownership: %w", err)
	}
	if totalVersions == 0 {
		return true, nil
	}
	return ownedVersions > 0, nil
}

func (s *Service) loadBaseVersionForCreate(ctx context.Context, tx *sql.Tx, questionID int64, defaultStem string) (*baseVersionData, int, error) {
	row := tx.QueryRowContext(ctx, `
		SELECT version_no, stimulus_group_id, stimulus_type, stimulus_content, stimulus_html, stem_html, explanation_html, hint_html,
			question_content, answer_key, duration_seconds, weight, change_note
		FROM question_versions
		WHERE question_id = $1
		ORDER BY version_no DESC
		LIMIT 1
		FOR UPDATE
	`, questionID)

	var versionNo int
	var stimulusGroupID sql.NullInt64
	var stimulusType sql.NullString
	var stimulusContent []byte
	var stimulusHTML sql.NullString
	var stemHTML string
	var explanation sql.NullString
	var hint sql.NullString
	var questionContent json.RawMessage
	var answerKey json.RawMessage
	var duration sql.NullInt64
	var weight float64
	var change sql.NullString
	if err := row.Scan(&versionNo, &stimulusGroupID, &stimulusType, &stimulusContent, &stimulusHTML, &stemHTML, &explanation, &hint, &questionContent, &answerKey, &duration, &weight, &change); err != nil {
		if !errors.Is(err, sql.ErrNoRows) {
			return nil, 0, fmt.Errorf("load latest version: %w", err)
		}

		if strings.TrimSpace(defaultStem) == "" {
			return nil, 0, fmt.Errorf("%w: question stem_html is empty", ErrInvalidInput)
		}
		return &baseVersionData{
			StemHTML:        defaultStem,
			QuestionContent: json.RawMessage(`{}`),
			AnswerKey:       json.RawMessage(`{}`),
			Weight:          1,
		}, 1, nil
	}

	var stimulusGroupIDPtr *int64
	if stimulusGroupID.Valid {
		stimulusGroupIDPtr = &stimulusGroupID.Int64
	}
	var stimulusTypePtr *string
	if stimulusType.Valid {
		stimulusTypePtr = &stimulusType.String
	}
	var stimulusContentRaw json.RawMessage
	if len(bytes.TrimSpace(stimulusContent)) > 0 {
		stimulusContentRaw = append(json.RawMessage(nil), stimulusContent...)
	}
	var stimulusHTMLPtr *string
	if stimulusHTML.Valid {
		stimulusHTMLPtr = &stimulusHTML.String
	}
	var explanationPtr *string
	if explanation.Valid {
		explanationPtr = &explanation.String
	}
	var hintPtr *string
	if hint.Valid {
		hintPtr = &hint.String
	}
	var durationPtr *int
	if duration.Valid {
		d := int(duration.Int64)
		durationPtr = &d
	}
	var changePtr *string
	if change.Valid {
		changePtr = &change.String
	}
	if len(answerKey) == 0 {
		answerKey = json.RawMessage(`{}`)
	}
	if weight <= 0 {
		weight = 1
	}

	return &baseVersionData{
		StimulusGroupID: stimulusGroupIDPtr,
		StimulusType:    stimulusTypePtr,
		StimulusContent: stimulusContentRaw,
		StimulusHTML:    stimulusHTMLPtr,
		StemHTML:        stemHTML,
		ExplanationHTML: explanationPtr,
		HintHTML:        hintPtr,
		QuestionContent: questionContent,
		AnswerKey:       answerKey,
		DurationSeconds: durationPtr,
		Weight:          weight,
		ChangeNote:      changePtr,
	}, versionNo + 1, nil
}

func (s *Service) listQuestionOptions(ctx context.Context, q queryContextRunner, questionID int64) ([]QuestionOptionInput, error) {
	rows, err := q.QueryContext(ctx, `
		SELECT option_key, option_html
		FROM question_options
		WHERE question_id = $1
		ORDER BY option_key ASC
	`, questionID)
	if err != nil {
		return nil, fmt.Errorf("query question options: %w", err)
	}
	defer rows.Close()

	options := make([]QuestionOptionInput, 0)
	for rows.Next() {
		var opt QuestionOptionInput
		if err := rows.Scan(&opt.OptionKey, &opt.OptionHTML); err != nil {
			return nil, fmt.Errorf("scan question option: %w", err)
		}
		options = append(options, opt)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate question options: %w", err)
	}
	return options, nil
}

type matchingContentItem struct {
	ID   string `json:"id"`
	HTML string `json:"html"`
}

type matchingQuestionContent struct {
	Prompts  []matchingContentItem `json:"prompts"`
	Choices  []matchingContentItem `json:"choices"`
	NoteHTML string                `json:"note_html,omitempty"`
}

type matchingPair struct {
	PromptID string `json:"prompt_id"`
	ChoiceID string `json:"choice_id"`
}

type matchingAnswerKey struct {
	Mode  string         `json:"mode,omitempty"`
	Pairs []matchingPair `json:"pairs"`
}

type shortAnswerQuestionContent struct {
	Placeholder string `json:"placeholder,omitempty"`
	InputType   string `json:"input_type,omitempty"`
	MaxLength   int    `json:"max_length,omitempty"`
}

type shortAnswerAnswerKey struct {
	AcceptedAnswers []string `json:"accepted_answers"`
	MatchMode       string   `json:"match_mode,omitempty"`
}

func normalizeQuestionContent(questionType string, raw json.RawMessage) (json.RawMessage, error) {
	qType := strings.TrimSpace(strings.ToLower(questionType))
	if len(bytes.TrimSpace(raw)) == 0 || string(bytes.TrimSpace(raw)) == "null" {
		if qType == "menjodohkan_drag_drop" {
			return nil, fmt.Errorf("%w: question_content is required for menjodohkan_drag_drop", ErrInvalidInput)
		}
		return json.RawMessage(`{}`), nil
	}
	if !json.Valid(raw) {
		return nil, fmt.Errorf("%w: question_content must be valid json", ErrInvalidInput)
	}

	var obj map[string]any
	if err := json.Unmarshal(raw, &obj); err != nil {
		return nil, fmt.Errorf("%w: question_content must be object", ErrInvalidInput)
	}
	if qType == "short_answer" {
		content, err := parseShortAnswerQuestionContent(raw)
		if err != nil {
			return nil, err
		}
		normalized, err := json.Marshal(content)
		if err != nil {
			return nil, fmt.Errorf("marshal normalized question_content: %w", err)
		}
		return json.RawMessage(normalized), nil
	}
	if qType != "menjodohkan_drag_drop" {
		return json.RawMessage(`{}`), nil
	}

	content, err := parseMatchingQuestionContent(raw)
	if err != nil {
		return nil, err
	}
	normalized, err := json.Marshal(content)
	if err != nil {
		return nil, fmt.Errorf("marshal normalized question_content: %w", err)
	}
	return json.RawMessage(normalized), nil
}

func parseMatchingQuestionContent(raw json.RawMessage) (matchingQuestionContent, error) {
	var payload matchingQuestionContent
	if err := json.Unmarshal(raw, &payload); err != nil {
		return matchingQuestionContent{}, fmt.Errorf("%w: question_content must be object", ErrInvalidInput)
	}

	prompts, err := normalizeMatchingContentItems(payload.Prompts, "prompts")
	if err != nil {
		return matchingQuestionContent{}, err
	}
	choices, err := normalizeMatchingContentItems(payload.Choices, "choices")
	if err != nil {
		return matchingQuestionContent{}, err
	}
	payload.Prompts = prompts
	payload.Choices = choices
	payload.NoteHTML = strings.TrimSpace(payload.NoteHTML)
	return payload, nil
}

func normalizeMatchingContentItems(items []matchingContentItem, field string) ([]matchingContentItem, error) {
	if len(items) == 0 {
		return nil, fmt.Errorf("%w: question_content.%s must be non-empty array", ErrInvalidInput, field)
	}
	seen := map[string]struct{}{}
	out := make([]matchingContentItem, 0, len(items))
	for i, item := range items {
		id := strings.TrimSpace(item.ID)
		html := strings.TrimSpace(item.HTML)
		if id == "" {
			return nil, fmt.Errorf("%w: question_content.%s[%d].id is required", ErrInvalidInput, field, i)
		}
		if html == "" {
			return nil, fmt.Errorf("%w: question_content.%s[%d].html is required", ErrInvalidInput, field, i)
		}
		if _, exists := seen[id]; exists {
			return nil, fmt.Errorf("%w: duplicate %s id '%s'", ErrInvalidInput, field[:len(field)-1], id)
		}
		seen[id] = struct{}{}
		out = append(out, matchingContentItem{ID: id, HTML: html})
	}
	return out, nil
}

func parseMatchingAnswerKey(raw json.RawMessage) (matchingAnswerKey, error) {
	var payload matchingAnswerKey
	if err := json.Unmarshal(raw, &payload); err != nil {
		return matchingAnswerKey{}, fmt.Errorf("%w: answer_key must be object", ErrInvalidInput)
	}
	mode := strings.TrimSpace(strings.ToLower(payload.Mode))
	if mode == "" {
		mode = "exact"
	}
	if mode != "exact" {
		return matchingAnswerKey{}, fmt.Errorf("%w: menjodohkan_drag_drop answer_key.mode must be 'exact'", ErrInvalidInput)
	}
	if len(payload.Pairs) == 0 {
		return matchingAnswerKey{}, fmt.Errorf("%w: menjodohkan_drag_drop answer_key.pairs (non-empty array) is required", ErrInvalidInput)
	}
	seenPrompt := map[string]struct{}{}
	seenChoice := map[string]struct{}{}
	out := make([]matchingPair, 0, len(payload.Pairs))
	for i, pair := range payload.Pairs {
		promptID := strings.TrimSpace(pair.PromptID)
		choiceID := strings.TrimSpace(pair.ChoiceID)
		if promptID == "" || choiceID == "" {
			return matchingAnswerKey{}, fmt.Errorf("%w: menjodohkan_drag_drop answer_key.pairs[%d].prompt_id and choice_id are required", ErrInvalidInput, i)
		}
		if _, exists := seenPrompt[promptID]; exists {
			return matchingAnswerKey{}, fmt.Errorf("%w: duplicate prompt_id '%s' in answer_key.pairs", ErrInvalidInput, promptID)
		}
		if _, exists := seenChoice[choiceID]; exists {
			return matchingAnswerKey{}, fmt.Errorf("%w: duplicate choice_id '%s' in answer_key.pairs", ErrInvalidInput, choiceID)
		}
		seenPrompt[promptID] = struct{}{}
		seenChoice[choiceID] = struct{}{}
		out = append(out, matchingPair{PromptID: promptID, ChoiceID: choiceID})
	}
	sort.Slice(out, func(i, j int) bool {
		return out[i].PromptID < out[j].PromptID
	})
	return matchingAnswerKey{Mode: mode, Pairs: out}, nil
}

func parseShortAnswerQuestionContent(raw json.RawMessage) (shortAnswerQuestionContent, error) {
	var payload shortAnswerQuestionContent
	if err := json.Unmarshal(raw, &payload); err != nil {
		return shortAnswerQuestionContent{}, fmt.Errorf("%w: question_content must be object", ErrInvalidInput)
	}
	payload.Placeholder = strings.TrimSpace(payload.Placeholder)
	payload.InputType = strings.TrimSpace(strings.ToLower(payload.InputType))
	if payload.InputType == "" {
		payload.InputType = "textarea"
	}
	if payload.InputType != "text" && payload.InputType != "textarea" {
		return shortAnswerQuestionContent{}, fmt.Errorf("%w: short_answer question_content.input_type must be 'text' or 'textarea'", ErrInvalidInput)
	}
	if payload.MaxLength == 0 {
		payload.MaxLength = 33
	}
	if payload.MaxLength < 1 || payload.MaxLength > 33 {
		return shortAnswerQuestionContent{}, fmt.Errorf("%w: short_answer question_content.max_length must be between 1 and 33", ErrInvalidInput)
	}
	return payload, nil
}

func normalizeShortAnswerTextForCompare(raw string) string {
	raw = strings.TrimSpace(strings.ToLower(raw))
	if raw == "" {
		return ""
	}
	return strings.Join(strings.Fields(raw), " ")
}

func parseShortAnswerAnswerKey(raw json.RawMessage) (shortAnswerAnswerKey, error) {
	var payload shortAnswerAnswerKey
	if err := json.Unmarshal(raw, &payload); err != nil {
		return shortAnswerAnswerKey{}, fmt.Errorf("%w: answer_key must be object", ErrInvalidInput)
	}
	mode := strings.TrimSpace(strings.ToLower(payload.MatchMode))
	if mode == "" {
		mode = "normalized_exact"
	}
	if mode != "normalized_exact" {
		return shortAnswerAnswerKey{}, fmt.Errorf("%w: short_answer answer_key.match_mode must be 'normalized_exact'", ErrInvalidInput)
	}
	if len(payload.AcceptedAnswers) == 0 {
		return shortAnswerAnswerKey{}, fmt.Errorf("%w: short_answer answer_key.accepted_answers (non-empty array) is required", ErrInvalidInput)
	}
	seenLiteral := map[string]struct{}{}
	seenNormalized := map[string]struct{}{}
	out := make([]string, 0, len(payload.AcceptedAnswers))
	for i, item := range payload.AcceptedAnswers {
		val := strings.TrimSpace(item)
		if val == "" {
			return shortAnswerAnswerKey{}, fmt.Errorf("%w: short_answer answer_key.accepted_answers[%d] must be non-empty string", ErrInvalidInput, i)
		}
		if _, exists := seenLiteral[val]; exists {
			return shortAnswerAnswerKey{}, fmt.Errorf("%w: short_answer answer_key.accepted_answers has duplicate '%s'", ErrInvalidInput, val)
		}
		seenLiteral[val] = struct{}{}
		normalized := normalizeShortAnswerTextForCompare(val)
		if normalized == "" {
			return shortAnswerAnswerKey{}, fmt.Errorf("%w: short_answer answer_key.accepted_answers[%d] must be non-empty string", ErrInvalidInput, i)
		}
		if _, exists := seenNormalized[normalized]; exists {
			return shortAnswerAnswerKey{}, fmt.Errorf("%w: short_answer answer_key.accepted_answers has duplicate after normalization '%s'", ErrInvalidInput, val)
		}
		seenNormalized[normalized] = struct{}{}
		out = append(out, val)
	}
	sort.Slice(out, func(i, j int) bool {
		left := normalizeShortAnswerTextForCompare(out[i])
		right := normalizeShortAnswerTextForCompare(out[j])
		if left == right {
			return out[i] < out[j]
		}
		return left < right
	})
	return shortAnswerAnswerKey{
		AcceptedAnswers: out,
		MatchMode:       mode,
	}, nil
}

func validateMatchingReferences(contentRaw, answerKeyRaw json.RawMessage) error {
	content, err := parseMatchingQuestionContent(contentRaw)
	if err != nil {
		return err
	}
	key, err := parseMatchingAnswerKey(answerKeyRaw)
	if err != nil {
		return err
	}

	promptSet := make(map[string]struct{}, len(content.Prompts))
	for _, item := range content.Prompts {
		promptSet[item.ID] = struct{}{}
	}
	choiceSet := make(map[string]struct{}, len(content.Choices))
	for _, item := range content.Choices {
		choiceSet[item.ID] = struct{}{}
	}
	if len(key.Pairs) != len(content.Prompts) {
		return fmt.Errorf("%w: menjodohkan_drag_drop answer_key.pairs must cover every prompt", ErrInvalidInput)
	}
	for _, pair := range key.Pairs {
		if _, ok := promptSet[pair.PromptID]; !ok {
			return fmt.Errorf("%w: answer_key references unknown prompt_id '%s'", ErrInvalidInput, pair.PromptID)
		}
		if _, ok := choiceSet[pair.ChoiceID]; !ok {
			return fmt.Errorf("%w: answer_key references unknown choice_id '%s'", ErrInvalidInput, pair.ChoiceID)
		}
	}
	return nil
}

func validateAnswerKey(questionType string, raw json.RawMessage) error {
	questionType = strings.TrimSpace(strings.ToLower(questionType))
	if len(raw) == 0 || !json.Valid(raw) {
		return fmt.Errorf("%w: answer_key must be valid json", ErrInvalidInput)
	}

	var obj map[string]any
	if err := json.Unmarshal(raw, &obj); err != nil {
		return fmt.Errorf("%w: answer_key must be object", ErrInvalidInput)
	}

	switch questionType {
	case "pg_tunggal":
		correct, ok := obj["correct"].(string)
		if !ok || strings.TrimSpace(correct) == "" {
			return fmt.Errorf("%w: pg_tunggal answer_key.correct (string) is required", ErrInvalidInput)
		}
	case "multi_jawaban":
		correct, ok := obj["correct"].([]any)
		if !ok || len(correct) == 0 {
			return fmt.Errorf("%w: multi_jawaban answer_key.correct (non-empty array) is required", ErrInvalidInput)
		}
		seen := map[string]struct{}{}
		for i, item := range correct {
			v, ok := item.(string)
			v = strings.TrimSpace(v)
			if !ok || v == "" {
				return fmt.Errorf("%w: multi_jawaban answer_key.correct[%d] must be non-empty string", ErrInvalidInput, i)
			}
			if _, exists := seen[v]; exists {
				return fmt.Errorf("%w: multi_jawaban answer_key.correct has duplicate '%s'", ErrInvalidInput, v)
			}
			seen[v] = struct{}{}
		}
		if modeRaw, ok := obj["mode"]; ok {
			mode, ok := modeRaw.(string)
			mode = strings.TrimSpace(strings.ToLower(mode))
			if !ok || mode == "" {
				return fmt.Errorf("%w: multi_jawaban answer_key.mode must be string", ErrInvalidInput)
			}
			if mode != "exact" {
				return fmt.Errorf("%w: multi_jawaban answer_key.mode must be 'exact'", ErrInvalidInput)
			}
		}
	case "benar_salah_pernyataan":
		statements, ok := obj["statements"].([]any)
		if !ok || len(statements) == 0 {
			return fmt.Errorf("%w: benar_salah_pernyataan answer_key.statements (non-empty array) is required", ErrInvalidInput)
		}
		seen := map[string]struct{}{}
		for i, item := range statements {
			stmt, ok := item.(map[string]any)
			if !ok {
				return fmt.Errorf("%w: statements[%d] must be object", ErrInvalidInput, i)
			}
			id, _ := stmt["id"].(string)
			id = strings.TrimSpace(id)
			correct, ok := stmt["correct"].(bool)
			_ = correct
			if id == "" || !ok {
				return fmt.Errorf("%w: statements[%d].id and statements[%d].correct are required", ErrInvalidInput, i, i)
			}
			if _, exists := seen[id]; exists {
				return fmt.Errorf("%w: duplicate statement id '%s'", ErrInvalidInput, id)
			}
			seen[id] = struct{}{}
		}
	case "menjodohkan_drag_drop":
		_, err := parseMatchingAnswerKey(raw)
		if err != nil {
			return err
		}
	case "short_answer":
		_, err := parseShortAnswerAnswerKey(raw)
		if err != nil {
			return err
		}
	default:
		return fmt.Errorf("%w: unsupported question_type '%s'", ErrInvalidInput, questionType)
	}

	return nil
}

func parseCorrectKeysForOptions(questionType string, raw json.RawMessage) (map[string]bool, error) {
	keys := map[string]bool{}
	var obj map[string]any
	if err := json.Unmarshal(raw, &obj); err != nil {
		return nil, fmt.Errorf("%w: answer_key must be object", ErrInvalidInput)
	}
	switch strings.TrimSpace(strings.ToLower(questionType)) {
	case "pg_tunggal":
		v, _ := obj["correct"].(string)
		v = strings.TrimSpace(strings.ToUpper(v))
		if v == "" {
			return nil, fmt.Errorf("%w: pg_tunggal answer_key.correct (string) is required", ErrInvalidInput)
		}
		keys[v] = true
	case "multi_jawaban":
		rawKeys, _ := obj["correct"].([]any)
		if len(rawKeys) == 0 {
			return nil, fmt.Errorf("%w: multi_jawaban answer_key.correct (non-empty array) is required", ErrInvalidInput)
		}
		for i, item := range rawKeys {
			v, _ := item.(string)
			v = strings.TrimSpace(strings.ToUpper(v))
			if v == "" {
				return nil, fmt.Errorf("%w: multi_jawaban answer_key.correct[%d] must be non-empty string", ErrInvalidInput, i)
			}
			keys[v] = true
		}
	case "menjodohkan_drag_drop", "short_answer":
		return nil, nil
	}
	return keys, nil
}

func normalizeAndValidateOptions(questionType string, options []QuestionOptionInput, answerKey json.RawMessage) ([]QuestionOptionInput, map[string]bool, error) {
	qType := strings.TrimSpace(strings.ToLower(questionType))
	if qType == "benar_salah_pernyataan" || qType == "menjodohkan_drag_drop" || qType == "short_answer" {
		return nil, nil, nil
	}
	if len(options) == 0 {
		return nil, nil, nil
	}

	correctKeys, err := parseCorrectKeysForOptions(qType, answerKey)
	if err != nil {
		return nil, nil, err
	}
	if len(options) < 2 {
		return nil, nil, fmt.Errorf("%w: options must contain at least 2 rows", ErrInvalidInput)
	}

	seen := map[string]struct{}{}
	out := make([]QuestionOptionInput, 0, len(options))
	for i, it := range options {
		key := strings.TrimSpace(strings.ToUpper(it.OptionKey))
		html := strings.TrimSpace(it.OptionHTML)
		if key == "" {
			return nil, nil, fmt.Errorf("%w: options[%d].option_key is required", ErrInvalidInput, i)
		}
		if html == "" {
			return nil, nil, fmt.Errorf("%w: options[%d].option_html is required", ErrInvalidInput, i)
		}
		if _, ok := seen[key]; ok {
			return nil, nil, fmt.Errorf("%w: duplicate option_key '%s'", ErrInvalidInput, key)
		}
		seen[key] = struct{}{}
		out = append(out, QuestionOptionInput{
			OptionKey:  key,
			OptionHTML: html,
		})
	}

	for key := range correctKeys {
		if _, ok := seen[key]; !ok {
			return nil, nil, fmt.Errorf("%w: answer_key references unknown option '%s'", ErrInvalidInput, key)
		}
	}
	return out, correctKeys, nil
}

type normalizedStatement struct {
	ID        string `json:"id"`
	Statement string `json:"statement"`
	Correct   bool   `json:"correct"`
}

type normalizedAnswerKey struct {
	Correct    string                `json:"correct,omitempty"`
	CorrectSet []string              `json:"correct_set,omitempty"`
	Mode       string                `json:"mode,omitempty"`
	Statements []normalizedStatement `json:"statements,omitempty"`
	Pairs      []matchingPair        `json:"pairs,omitempty"`
	Accepted   []string              `json:"accepted,omitempty"`
}

type normalizedMatchingContent struct {
	Prompts  []matchingContentItem `json:"prompts,omitempty"`
	Choices  []matchingContentItem `json:"choices,omitempty"`
	NoteHTML string                `json:"note_html,omitempty"`
}

type normalizedShortAnswerContent struct {
	Placeholder string `json:"placeholder,omitempty"`
	InputType   string `json:"input_type,omitempty"`
	MaxLength   int    `json:"max_length,omitempty"`
}

type questionContentForHash struct {
	QuestionType       string                       `json:"question_type"`
	StemHTML           string                       `json:"stem_html"`
	StimulusType       string                       `json:"stimulus_type,omitempty"`
	StimulusContent    json.RawMessage              `json:"stimulus_content,omitempty"`
	StimulusHTML       string                       `json:"stimulus_html,omitempty"`
	ExplanationHTML    string                       `json:"explanation_html,omitempty"`
	HintHTML           string                       `json:"hint_html,omitempty"`
	QuestionContent    normalizedMatchingContent    `json:"question_content,omitempty"`
	ShortAnswerContent normalizedShortAnswerContent `json:"short_answer_content,omitempty"`
	Options            []QuestionOptionInput        `json:"options,omitempty"`
	AnswerKey          normalizedAnswerKey          `json:"answer_key"`
}

func computeQuestionContentHash(questionType string, stemHTML string, stimulusType *string, stimulusContent json.RawMessage, stimulusHTML *string, explanationHTML *string, hintHTML *string, questionContent json.RawMessage, answerKey json.RawMessage, options []QuestionOptionInput) (string, error) {
	qType := strings.TrimSpace(strings.ToLower(questionType))
	var obj map[string]any
	if err := json.Unmarshal(answerKey, &obj); err != nil {
		return "", fmt.Errorf("%w: answer_key must be object", ErrInvalidInput)
	}

	var normalized normalizedAnswerKey
	var normalizedContent normalizedMatchingContent
	switch qType {
	case "pg_tunggal":
		correct, _ := obj["correct"].(string)
		normalized.Correct = strings.TrimSpace(strings.ToUpper(correct))
	case "multi_jawaban":
		rawKeys, _ := obj["correct"].([]any)
		keys := make([]string, 0, len(rawKeys))
		for _, item := range rawKeys {
			v, _ := item.(string)
			v = strings.TrimSpace(strings.ToUpper(v))
			if v == "" {
				continue
			}
			keys = append(keys, v)
		}
		sort.Strings(keys)
		normalized.CorrectSet = keys
		if modeRaw, ok := obj["mode"]; ok {
			mode, _ := modeRaw.(string)
			normalized.Mode = strings.TrimSpace(strings.ToLower(mode))
		}
	case "benar_salah_pernyataan":
		rawStatements, _ := obj["statements"].([]any)
		stmts := make([]normalizedStatement, 0, len(rawStatements))
		for _, item := range rawStatements {
			stmt, ok := item.(map[string]any)
			if !ok {
				continue
			}
			id, _ := stmt["id"].(string)
			statement, _ := stmt["statement"].(string)
			correct, _ := stmt["correct"].(bool)
			id = strings.TrimSpace(strings.ToUpper(id))
			statement = strings.TrimSpace(statement)
			if id == "" || statement == "" {
				continue
			}
			stmts = append(stmts, normalizedStatement{
				ID:        id,
				Statement: statement,
				Correct:   correct,
			})
		}
		sort.Slice(stmts, func(i, j int) bool {
			return stmts[i].ID < stmts[j].ID
		})
		normalized.Statements = stmts
	case "menjodohkan_drag_drop":
		key, err := parseMatchingAnswerKey(answerKey)
		if err != nil {
			return "", err
		}
		content, err := parseMatchingQuestionContent(questionContent)
		if err != nil {
			return "", err
		}
		normalized.Mode = key.Mode
		normalized.Pairs = key.Pairs
		normalizedContent = normalizedMatchingContent{
			Prompts:  content.Prompts,
			Choices:  content.Choices,
			NoteHTML: content.NoteHTML,
		}
	case "short_answer":
		key, err := parseShortAnswerAnswerKey(answerKey)
		if err != nil {
			return "", err
		}
		normalized.Mode = key.MatchMode
		normalized.Accepted = key.AcceptedAnswers
	}

	normalizedOptions := make([]QuestionOptionInput, 0, len(options))
	for _, opt := range options {
		normalizedOptions = append(normalizedOptions, QuestionOptionInput{
			OptionKey:  strings.TrimSpace(strings.ToUpper(opt.OptionKey)),
			OptionHTML: strings.TrimSpace(opt.OptionHTML),
		})
	}
	sort.Slice(normalizedOptions, func(i, j int) bool {
		return normalizedOptions[i].OptionKey < normalizedOptions[j].OptionKey
	})

	payload := questionContentForHash{
		QuestionType: qType,
		StemHTML:     strings.TrimSpace(stemHTML),
		Options:      normalizedOptions,
		AnswerKey:    normalized,
	}
	if qType == "menjodohkan_drag_drop" {
		payload.QuestionContent = normalizedContent
	}
	if qType == "short_answer" {
		contentRaw := bytes.TrimSpace(questionContent)
		content := shortAnswerQuestionContent{InputType: "textarea", MaxLength: 33}
		if len(contentRaw) > 0 && string(contentRaw) != "{}" && string(contentRaw) != "null" {
			parsed, err := parseShortAnswerQuestionContent(questionContent)
			if err != nil {
				return "", err
			}
			content = parsed
		}
		payload.ShortAnswerContent = normalizedShortAnswerContent{
			Placeholder: content.Placeholder,
			InputType:   content.InputType,
			MaxLength:   content.MaxLength,
		}
	}
	if stimulusType != nil {
		payload.StimulusType = strings.TrimSpace(strings.ToLower(*stimulusType))
	}
	if len(bytes.TrimSpace(stimulusContent)) > 0 {
		payload.StimulusContent = append(json.RawMessage(nil), bytes.TrimSpace(stimulusContent)...)
	}
	if stimulusHTML != nil {
		payload.StimulusHTML = strings.TrimSpace(*stimulusHTML)
	}
	if explanationHTML != nil {
		payload.ExplanationHTML = strings.TrimSpace(*explanationHTML)
	}
	if hintHTML != nil {
		payload.HintHTML = strings.TrimSpace(*hintHTML)
	}

	raw, err := json.Marshal(payload)
	if err != nil {
		return "", fmt.Errorf("marshal content hash: %w", err)
	}
	sum := sha256.Sum256(raw)
	return hex.EncodeToString(sum[:]), nil
}

func (s *Service) backfillContentHashCandidates(ctx context.Context, tx *sql.Tx, subjectID int64, questionType string, stemHTML string) error {
	if subjectID <= 0 || strings.TrimSpace(questionType) == "" || strings.TrimSpace(stemHTML) == "" {
		return nil
	}

	rows, err := tx.QueryContext(ctx, `
		SELECT qv.id, qv.question_id, qv.stimulus_html, qv.stem_html, qv.explanation_html, qv.hint_html, qv.question_content, qv.answer_key
		FROM question_versions qv
		JOIN questions q ON q.id = qv.question_id
		WHERE q.is_active = TRUE
		  AND q.subject_id = $1
		  AND q.question_type = $2
		  AND qv.stem_html = $3
		  AND qv.content_hash IS NULL
	`, subjectID, strings.TrimSpace(strings.ToLower(questionType)), strings.TrimSpace(stemHTML))
	if err != nil {
		return fmt.Errorf("list content hash candidates: %w", err)
	}
	defer rows.Close()

	type candidate struct {
		id              int64
		questionID      int64
		stimulusHTML    sql.NullString
		stemHTML        string
		explanationHTML sql.NullString
		hintHTML        sql.NullString
		questionContent json.RawMessage
		answerKey       json.RawMessage
	}
	candidates := make([]candidate, 0)
	for rows.Next() {
		var c candidate
		if err := rows.Scan(&c.id, &c.questionID, &c.stimulusHTML, &c.stemHTML, &c.explanationHTML, &c.hintHTML, &c.questionContent, &c.answerKey); err != nil {
			return fmt.Errorf("scan content hash candidate: %w", err)
		}
		candidates = append(candidates, c)
	}
	if err := rows.Err(); err != nil {
		return fmt.Errorf("iterate content hash candidates: %w", err)
	}
	if len(candidates) == 0 {
		return nil
	}

	for _, c := range candidates {
		opts := []QuestionOptionInput{}
		if strings.TrimSpace(strings.ToLower(questionType)) != "benar_salah_pernyataan" && strings.TrimSpace(strings.ToLower(questionType)) != "menjodohkan_drag_drop" && strings.TrimSpace(strings.ToLower(questionType)) != "short_answer" {
			optRows, err := tx.QueryContext(ctx, `
				SELECT option_key, option_html
				FROM question_options
				WHERE question_id = $1
				ORDER BY option_key ASC
			`, c.questionID)
			if err != nil {
				return fmt.Errorf("load options for hash: %w", err)
			}
			for optRows.Next() {
				var opt QuestionOptionInput
				if err := optRows.Scan(&opt.OptionKey, &opt.OptionHTML); err != nil {
					_ = optRows.Close()
					return fmt.Errorf("scan options for hash: %w", err)
				}
				opts = append(opts, opt)
			}
			if err := optRows.Err(); err != nil {
				_ = optRows.Close()
				return fmt.Errorf("iterate options for hash: %w", err)
			}
			_ = optRows.Close()
		}

		var stimPtr *string
		if c.stimulusHTML.Valid {
			stimPtr = &c.stimulusHTML.String
		}
		var explPtr *string
		if c.explanationHTML.Valid {
			explPtr = &c.explanationHTML.String
		}
		var hintPtr *string
		if c.hintHTML.Valid {
			hintPtr = &c.hintHTML.String
		}
		hash, err := computeQuestionContentHash(
			questionType,
			c.stemHTML,
			nil,
			nil,
			stimPtr,
			explPtr,
			hintPtr,
			c.questionContent,
			c.answerKey,
			opts,
		)
		if err != nil {
			return err
		}
		if _, err := tx.ExecContext(ctx, `
			UPDATE question_versions
			SET content_hash = $2
			WHERE id = $1
		`, c.id, hash); err != nil {
			return fmt.Errorf("update content hash: %w", err)
		}
	}
	return nil
}

func (s *Service) loadReopenRequestTx(ctx context.Context, tx *sql.Tx, requestID int64) (*ReopenFinalRequest, error) {
	var out ReopenFinalRequest
	var decidedBy sql.NullInt64
	var decidedRole sql.NullString
	var decidedNote sql.NullString
	var decidedAt sql.NullTime
	if err := tx.QueryRowContext(ctx, `
		SELECT
			id,
			question_id,
			version_no,
			reason,
			status,
			requested_by,
			requested_role,
			requested_at,
			decided_by,
			decided_role,
			decided_note,
			decided_at
		FROM question_reopen_requests
		WHERE id = $1
	`, requestID).Scan(
		&out.ID,
		&out.QuestionID,
		&out.VersionNo,
		&out.Reason,
		&out.Status,
		&out.RequestedBy,
		&out.RequestedRole,
		&out.RequestedAt,
		&decidedBy,
		&decidedRole,
		&decidedNote,
		&decidedAt,
	); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrVersionNotFound
		}
		return nil, fmt.Errorf("load reopen request detail: %w", err)
	}
	if decidedBy.Valid {
		out.DecidedBy = &decidedBy.Int64
	}
	if decidedRole.Valid {
		out.DecidedRole = &decidedRole.String
	}
	if decidedNote.Valid {
		out.DecidedNote = &decidedNote.String
	}
	if decidedAt.Valid {
		out.DecidedAt = &decidedAt.Time
	}

	rows, err := tx.QueryContext(ctx, `
		SELECT approver_role
		FROM question_reopen_approvals
		WHERE reopen_request_id = $1
		ORDER BY approved_at ASC, id ASC
	`, requestID)
	if err != nil {
		return nil, fmt.Errorf("list reopen approvals: %w", err)
	}
	defer rows.Close()
	roles := make([]string, 0)
	for rows.Next() {
		var role string
		if err := rows.Scan(&role); err != nil {
			return nil, fmt.Errorf("scan reopen approval role: %w", err)
		}
		roles = append(roles, strings.TrimSpace(role))
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate reopen approvals: %w", err)
	}
	out.ApprovalCount = len(roles)
	out.ApprovedByRoles = roles
	return &out, nil
}

func (s *Service) getQuestionBlueprintTx(ctx context.Context, tx *sql.Tx, questionID int64) (*QuestionBlueprint, error) {
	row := tx.QueryRowContext(ctx, `
		SELECT
			q.id,
			q.subject_id,
			q.learning_goal_id,
			q.question_code_id,
			qc.code,
			s.education_level,
			s.subject_type,
			s.name,
			q.question_type,
			q.difficulty,
			q.metadata,
			q.created_at,
			q.updated_at
		FROM questions q
		JOIN subjects s ON s.id = q.subject_id
		LEFT JOIN question_codes qc ON qc.id = q.question_code_id
		WHERE q.id = $1
		  AND q.is_active = TRUE
	`, questionID)

	var out QuestionBlueprint
	var questionCodeID sql.NullInt64
	var questionCode sql.NullString
	var difficulty sql.NullInt64
	if err := row.Scan(
		&out.ID,
		&out.SubjectID,
		&out.LearningGoalID,
		&questionCodeID,
		&questionCode,
		&out.EducationLevel,
		&out.SubjectType,
		&out.SubjectName,
		&out.QuestionType,
		&difficulty,
		&out.Metadata,
		&out.CreatedAt,
		&out.UpdatedAt,
	); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrQuestionNotFound
		}
		return nil, fmt.Errorf("load question blueprint: %w", err)
	}
	if difficulty.Valid {
		d := int(difficulty.Int64)
		out.Difficulty = &d
	}
	if questionCodeID.Valid {
		out.QuestionCodeID = &questionCodeID.Int64
	}
	if questionCode.Valid {
		out.QuestionCode = &questionCode.String
	}
	populateBlueprintMetadata(&out, out.Metadata)
	return &out, nil
}

func scanQuestionCode(scanner interface{ Scan(dest ...any) error }) (*QuestionCode, error) {
	var out QuestionCode
	var createdBy sql.NullInt64
	var updatedAt sql.NullTime
	if err := scanner.Scan(
		&out.ID,
		&out.SubjectID,
		&out.Code,
		&out.Name,
		&out.IsActive,
		&createdBy,
		&out.CreatedAt,
		&updatedAt,
	); err != nil {
		return nil, err
	}
	if createdBy.Valid {
		out.CreatedBy = &createdBy.Int64
	}
	if updatedAt.Valid {
		out.UpdatedAt = &updatedAt.Time
	}
	return &out, nil
}

func scanStimulusGroup(scanner interface{ Scan(dest ...any) error }) (*StimulusGroup, error) {
	var out StimulusGroup
	var stimType sql.NullString
	var stimContent []byte
	var stimHTML sql.NullString
	var createdBy sql.NullInt64
	var updatedAt sql.NullTime
	var linkedQuestions sql.NullInt64
	if err := scanner.Scan(
		&out.ID,
		&out.SubjectID,
		&out.Title,
		&stimType,
		&stimContent,
		&stimHTML,
		&out.IsActive,
		&createdBy,
		&out.CreatedAt,
		&updatedAt,
		&linkedQuestions,
	); err != nil {
		return nil, err
	}
	if stimType.Valid {
		out.StimulusType = &stimType.String
	}
	if len(bytes.TrimSpace(stimContent)) > 0 {
		out.StimulusContent = append(json.RawMessage(nil), stimContent...)
	}
	if stimHTML.Valid {
		out.StimulusHTML = &stimHTML.String
	}
	if createdBy.Valid {
		out.CreatedBy = &createdBy.Int64
	}
	if updatedAt.Valid {
		out.UpdatedAt = &updatedAt.Time
	}
	if linkedQuestions.Valid {
		out.LinkedQuestions = int(linkedQuestions.Int64)
	}
	return &out, nil
}

func scanQuestionVersion(scanner interface{ Scan(dest ...any) error }) (*QuestionVersion, error) {
	var out QuestionVersion
	var stimulusGroupID sql.NullInt64
	var stimulusType sql.NullString
	var stimulusContent []byte
	var stimulusHTML sql.NullString
	var explanation sql.NullString
	var hint sql.NullString
	var questionContent []byte
	var duration sql.NullInt64
	var change sql.NullString
	var createdBy sql.NullInt64
	if err := scanner.Scan(
		&out.ID,
		&out.QuestionID,
		&out.VersionNo,
		&stimulusGroupID,
		&stimulusType,
		&stimulusContent,
		&stimulusHTML,
		&out.StemHTML,
		&explanation,
		&hint,
		&questionContent,
		&out.AnswerKey,
		&out.Status,
		&out.IsPublic,
		&out.IsActive,
		&duration,
		&out.Weight,
		&change,
		&createdBy,
		&out.CreatedAt,
	); err != nil {
		return nil, err
	}
	if stimulusGroupID.Valid {
		out.StimulusGroupID = &stimulusGroupID.Int64
	}
	if stimulusType.Valid {
		out.StimulusType = &stimulusType.String
	}
	if len(bytes.TrimSpace(stimulusContent)) > 0 {
		out.StimulusContent = append(json.RawMessage(nil), stimulusContent...)
	}
	if stimulusHTML.Valid {
		out.StimulusHTML = &stimulusHTML.String
	}
	if explanation.Valid {
		out.ExplanationHTML = &explanation.String
	}
	if hint.Valid {
		out.HintHTML = &hint.String
	}
	if len(bytes.TrimSpace(questionContent)) > 0 {
		out.QuestionContent = append(json.RawMessage(nil), questionContent...)
	}
	if duration.Valid {
		d := int(duration.Int64)
		out.DurationSeconds = &d
	}
	if change.Valid {
		out.ChangeNote = &change.String
	}
	if createdBy.Valid {
		out.CreatedBy = &createdBy.Int64
	}
	return &out, nil
}

func scanQuestionParallel(scanner interface{ Scan(dest ...any) error }) (*QuestionParallel, error) {
	var out QuestionParallel
	if err := scanner.Scan(
		&out.ID,
		&out.ExamID,
		&out.QuestionID,
		&out.ParallelGroup,
		&out.ParallelOrder,
		&out.ParallelLabel,
		&out.IsActive,
		&out.CreatedAt,
	); err != nil {
		return nil, err
	}
	return &out, nil
}

func nullStringPtr(v *string) any {
	if v == nil {
		return nil
	}
	s := strings.TrimSpace(*v)
	if s == "" {
		return nil
	}
	return s
}

func nullJSONBytes(v json.RawMessage) any {
	if len(bytes.TrimSpace(v)) == 0 {
		return nil
	}
	return []byte(bytes.TrimSpace(v))
}

func nullInt64Ptr(v *int64) any {
	if v == nil {
		return nil
	}
	if *v <= 0 {
		return nil
	}
	return *v
}

func nullIntPtr(v *int) any {
	if v == nil {
		return nil
	}
	if *v < 0 {
		return nil
	}
	return *v
}
