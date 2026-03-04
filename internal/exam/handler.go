package exam

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strconv"
	"strings"
	"time"

	"cbtlms/internal/app/apiresp"
	"cbtlms/internal/auth"

	"github.com/go-chi/chi/v5"
)

type Handler struct {
	svc examService
}

type examService interface {
	StartAttempt(ctx context.Context, examID, studentID int64, examToken string) (*Attempt, error)
	PreviewExamByToken(ctx context.Context, studentID int64, examToken string) (*ExamTokenPreview, error)
	PreviewExamByTokenForStaff(ctx context.Context, examToken string) (*ExamTokenPreview, error)
	ListAdminExams(ctx context.Context, includeInactive bool) ([]ExamAdminRecord, error)
	CreateExam(ctx context.Context, in CreateExamInput) (*ExamAdminRecord, error)
	UpdateExam(ctx context.Context, in UpdateExamInput) (*ExamAdminRecord, error)
	DeleteExam(ctx context.Context, examID int64) error
	ResetExamAttempt(ctx context.Context, examID, studentID, actorID int64) (int64, error)
	ListSubjects(ctx context.Context, level, subjectType string, actorID int64, actorRole string) ([]SubjectOption, error)
	CreateSubject(ctx context.Context, in CreateSubjectInput) (*SubjectOption, error)
	UpdateSubject(ctx context.Context, in UpdateSubjectInput) (*SubjectOption, error)
	DeleteSubject(ctx context.Context, subjectID, actorID int64, actorRole string) error
	ListExamsBySubject(ctx context.Context, subjectID int64) ([]ExamOption, error)
	ListExamsForToken(ctx context.Context) ([]ExamTokenExam, error)
	GenerateExamToken(ctx context.Context, examID, generatedBy int64, ttlMinutes int) (*ExamAccessToken, error)
	ListExamAssignments(ctx context.Context, examID int64) ([]ExamAssignmentUser, error)
	ListExamParticipantResults(ctx context.Context, examID int64) (*ExamParticipantResult, error)
	ExportExamParticipantResultsExcel(ctx context.Context, examID int64) ([]byte, string, error)
	ReplaceExamAssignments(ctx context.Context, in ReplaceExamAssignmentsInput) ([]ExamAssignmentUser, error)
	ReplaceExamAssignmentsByClass(ctx context.Context, in ReplaceExamAssignmentsByClassInput) ([]ExamAssignmentUser, error)
	AppendExamAssignmentsByClass(ctx context.Context, in AppendExamAssignmentsByClassInput) ([]ExamAssignmentUser, error)
	RemoveExamAssignment(ctx context.Context, examID, userID, actorID int64) error
	ListExamQuestions(ctx context.Context, examID int64) ([]ExamQuestionManageItem, error)
	ListExamQuestionCodeRules(ctx context.Context, examID int64) ([]ExamQuestionCodeRule, error)
	UpsertExamQuestionCodeRule(ctx context.Context, in UpsertExamQuestionCodeRuleInput) (*ExamQuestionCodeRule, error)
	DeleteExamQuestionCodeRule(ctx context.Context, examID, questionCodeID int64) error
	SyncExamQuestionsByCode(ctx context.Context, in SyncExamQuestionsByCodeInput) (*SyncExamQuestionsByCodeResult, error)
	UpsertExamQuestion(ctx context.Context, in UpsertExamQuestionInput) (*ExamQuestionManageItem, error)
	UpsertExamQuestionIncident(ctx context.Context, in UpsertExamQuestionIncidentInput) (*ExamQuestionIncidentResult, error)
	DeleteExamQuestion(ctx context.Context, examID, questionID int64) error
	GetAttemptSummary(ctx context.Context, attemptID int64) (*AttemptSummary, error)
	GetAttemptQuestion(ctx context.Context, attemptID int64, questionNo int) (*AttemptQuestion, error)
	GetAttemptResult(ctx context.Context, attemptID int64) (*AttemptResult, error)
	SaveAnswer(ctx context.Context, input SaveAnswerInput) error
	SubmitAttempt(ctx context.Context, attemptID int64) (*AttemptSummary, error)
	GetAttemptOwner(ctx context.Context, attemptID int64) (int64, error)
	LogAttemptEvent(ctx context.Context, input AttemptEventInput) (*AttemptEvent, error)
	ListAttemptEvents(ctx context.Context, attemptID int64, limit int) ([]AttemptEvent, error)
	ListExamEvents(ctx context.Context, examID int64, limit int) ([]AttemptEvent, error)
	ListExamClassEvents(ctx context.Context, examID int64, classID int64, limit int) ([]AttemptEvent, error)
	SetUserPhotoDataURL(ctx context.Context, userID int64, dataURL string) (string, error)
	ClearUserPhotoDataURL(ctx context.Context, userID int64) error
}

type response struct {
	OK    bool        `json:"ok"`
	Data  interface{} `json:"data,omitempty"`
	Error string      `json:"error,omitempty"`
}

type startAttemptRequest struct {
	ExamID    int64  `json:"exam_id"`
	StudentID int64  `json:"student_id"`
	ExamToken string `json:"exam_token"`
}

type previewExamByTokenRequest struct {
	ExamToken string `json:"exam_token"`
}

type saveAnswerRequest struct {
	AnswerPayload json.RawMessage `json:"answer_payload"`
	IsDoubt       bool            `json:"is_doubt"`
}

type attemptEventRequest struct {
	EventType string          `json:"event_type"`
	Payload   json.RawMessage `json:"payload"`
	ClientTS  string          `json:"client_ts"`
}

type upsertSubjectRequest struct {
	EducationLevel string `json:"education_level"`
	SubjectType    string `json:"subject_type"`
	Name           string `json:"name"`
}

type generateExamTokenRequest struct {
	TTLMinutes int `json:"ttl_minutes"`
}

type examManageRequest struct {
	Code               string `json:"code"`
	Title              string `json:"title"`
	SubjectID          int64  `json:"subject_id"`
	DurationMinutes    int    `json:"duration_minutes"`
	MaxAttempts        int    `json:"max_attempts"`
	StartAt            string `json:"start_at"`
	EndAt              string `json:"end_at"`
	ReviewPolicy       string `json:"review_policy"`
	RandomizeQuestions bool   `json:"randomize_questions"`
	RandomizeOptions   bool   `json:"randomize_options"`
	IsActive           *bool  `json:"is_active"`
}

type resetExamAttemptRequest struct {
	StudentID int64 `json:"student_id"`
}

type replaceExamAssignmentsRequest struct {
	UserIDs []int64 `json:"user_ids"`
}

type replaceExamAssignmentsByClassRequest struct {
	SchoolID int64 `json:"school_id"`
	ClassID  int64 `json:"class_id"`
}

type appendExamAssignmentsByClassRequest struct {
	SchoolID int64 `json:"school_id"`
	ClassID  int64 `json:"class_id"`
}

type upsertExamQuestionRequest struct {
	QuestionID int64   `json:"question_id"`
	SeqNo      int     `json:"seq_no"`
	Weight     float64 `json:"weight"`
}

type upsertExamQuestionCodeRuleRequest struct {
	QuestionCodeID int64   `json:"question_code_id"`
	Strategy       string  `json:"strategy"`
	PickCount      *int    `json:"pick_count"`
	Weight         float64 `json:"weight"`
}

type upsertExamQuestionIncidentRequest struct {
	QuestionID         int64  `json:"question_id"`
	Policy             string `json:"policy"`
	Reason             string `json:"reason"`
	RecomputeSubmitted bool   `json:"recompute_submitted"`
}

func NewHandler(svc examService) *Handler {
	return &Handler{svc: svc}
}

func (h *Handler) Start(w http.ResponseWriter, r *http.Request) {
	var req startAttemptRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, r, http.StatusBadRequest, response{OK: false, Error: "invalid request body"})
		return
	}
	if req.ExamID <= 0 {
		writeJSON(w, r, http.StatusBadRequest, response{OK: false, Error: "exam_id is required"})
		return
	}

	user, ok := auth.CurrentUser(r.Context())
	if !ok {
		writeJSON(w, r, http.StatusUnauthorized, response{OK: false, Error: "unauthorized"})
		return
	}

	isPrivileged := user.Role == "admin" || user.Role == "proktor"
	if isPrivileged {
		if req.StudentID <= 0 {
			writeJSON(w, r, http.StatusBadRequest, response{OK: false, Error: "student_id is required for admin/proktor"})
			return
		}
	} else {
		if req.StudentID > 0 && req.StudentID != user.ID {
			writeJSON(w, r, http.StatusForbidden, response{OK: false, Error: "forbidden"})
			return
		}
		req.StudentID = user.ID
	}

	attempt, err := h.svc.StartAttempt(r.Context(), req.ExamID, req.StudentID, req.ExamToken)
	if err != nil {
		switch {
		case errors.Is(err, ErrExamNotFound):
			writeJSON(w, r, http.StatusNotFound, response{OK: false, Error: err.Error()})
		case errors.Is(err, ErrExamNotAssigned):
			writeJSON(w, r, http.StatusForbidden, response{OK: false, Error: err.Error()})
		case errors.Is(err, ErrAttemptLimitReached):
			writeJSON(w, r, http.StatusConflict, response{OK: false, Error: err.Error()})
		case errors.Is(err, ErrAttemptForbidden):
			writeJSON(w, r, http.StatusForbidden, response{OK: false, Error: err.Error()})
		case errors.Is(err, ErrExamNotStarted), errors.Is(err, ErrExamEnded):
			writeJSON(w, r, http.StatusForbidden, response{OK: false, Error: err.Error()})
		case errors.Is(err, ErrStudentDataMissing):
			writeJSON(w, r, http.StatusBadRequest, response{OK: false, Error: err.Error()})
		case errors.Is(err, ErrExamTokenRequired), errors.Is(err, ErrExamTokenInvalid), errors.Is(err, ErrExamTokenExpired), errors.Is(err, ErrExamTokenUnavailable), errors.Is(err, ErrExamTokenAlreadyUsed):
			writeJSON(w, r, http.StatusBadRequest, response{OK: false, Error: err.Error()})
		default:
			writeJSON(w, r, http.StatusInternalServerError, response{OK: false, Error: "internal error"})
		}
		return
	}

	writeJSON(w, r, http.StatusOK, response{OK: true, Data: attempt})
}

func (h *Handler) PreviewExamByToken(w http.ResponseWriter, r *http.Request) {
	user, ok := auth.CurrentUser(r.Context())
	if !ok {
		writeJSON(w, r, http.StatusUnauthorized, response{OK: false, Error: "unauthorized"})
		return
	}
	role := strings.TrimSpace(strings.ToLower(user.Role))
	isStudent := role == "siswa"
	if !isStudent && role != "admin" && role != "guru" {
		writeJSON(w, r, http.StatusForbidden, response{OK: false, Error: "forbidden"})
		return
	}

	var req previewExamByTokenRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, r, http.StatusBadRequest, response{OK: false, Error: "invalid request body"})
		return
	}

	var out *ExamTokenPreview
	var err error
	if isStudent {
		out, err = h.svc.PreviewExamByToken(r.Context(), user.ID, req.ExamToken)
	} else {
		out, err = h.svc.PreviewExamByTokenForStaff(r.Context(), req.ExamToken)
	}
	if err != nil {
		switch {
		case errors.Is(err, ErrExamTokenRequired), errors.Is(err, ErrExamTokenInvalid), errors.Is(err, ErrExamTokenExpired), errors.Is(err, ErrExamTokenUnavailable), errors.Is(err, ErrExamTokenAlreadyUsed), errors.Is(err, ErrStudentDataMissing):
			writeJSON(w, r, http.StatusBadRequest, response{OK: false, Error: err.Error()})
		case errors.Is(err, ErrExamNotAssigned), errors.Is(err, ErrAttemptForbidden), errors.Is(err, ErrExamNotStarted), errors.Is(err, ErrExamEnded):
			writeJSON(w, r, http.StatusForbidden, response{OK: false, Error: err.Error()})
		case errors.Is(err, ErrAttemptLimitReached):
			writeJSON(w, r, http.StatusConflict, response{OK: false, Error: err.Error()})
		default:
			writeJSON(w, r, http.StatusInternalServerError, response{OK: false, Error: "internal error"})
		}
		return
	}

	writeJSON(w, r, http.StatusOK, response{OK: true, Data: out})
}

func (h *Handler) ListSubjects(w http.ResponseWriter, r *http.Request) {
	user, ok := auth.CurrentUser(r.Context())
	if !ok {
		writeJSON(w, r, http.StatusUnauthorized, response{OK: false, Error: "unauthorized"})
		return
	}
	level := strings.TrimSpace(r.URL.Query().Get("level"))
	subjectType := strings.TrimSpace(r.URL.Query().Get("type"))
	items, err := h.svc.ListSubjects(r.Context(), level, subjectType, user.ID, user.Role)
	if err != nil {
		if errors.Is(err, ErrInvalidInput) {
			writeJSON(w, r, http.StatusBadRequest, response{OK: false, Error: "invalid request"})
			return
		}
		writeJSON(w, r, http.StatusInternalServerError, response{OK: false, Error: "internal error"})
		return
	}
	writeJSON(w, r, http.StatusOK, response{OK: true, Data: items})
}

func (h *Handler) CreateSubject(w http.ResponseWriter, r *http.Request) {
	user, ok := auth.CurrentUser(r.Context())
	if !ok {
		writeJSON(w, r, http.StatusUnauthorized, response{OK: false, Error: "unauthorized"})
		return
	}
	var req upsertSubjectRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, r, http.StatusBadRequest, response{OK: false, Error: "invalid request body"})
		return
	}
	item, err := h.svc.CreateSubject(r.Context(), CreateSubjectInput{
		EducationLevel: req.EducationLevel,
		SubjectType:    req.SubjectType,
		Name:           req.Name,
		CreatedBy:      user.ID,
	})
	if err != nil {
		if errors.Is(err, ErrInvalidInput) {
			writeJSON(w, r, http.StatusBadRequest, response{OK: false, Error: "education_level, subject_type, name wajib diisi"})
			return
		}
		writeJSON(w, r, http.StatusInternalServerError, response{OK: false, Error: "internal error"})
		return
	}
	writeJSON(w, r, http.StatusCreated, response{OK: true, Data: item})
}

func (h *Handler) UpdateSubject(w http.ResponseWriter, r *http.Request) {
	user, ok := auth.CurrentUser(r.Context())
	if !ok {
		writeJSON(w, r, http.StatusUnauthorized, response{OK: false, Error: "unauthorized"})
		return
	}
	subjectID, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil || subjectID <= 0 {
		writeJSON(w, r, http.StatusBadRequest, response{OK: false, Error: "invalid subject id"})
		return
	}
	var req upsertSubjectRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, r, http.StatusBadRequest, response{OK: false, Error: "invalid request body"})
		return
	}
	item, err := h.svc.UpdateSubject(r.Context(), UpdateSubjectInput{
		ID:             subjectID,
		EducationLevel: req.EducationLevel,
		SubjectType:    req.SubjectType,
		Name:           req.Name,
		ActorID:        user.ID,
		ActorRole:      user.Role,
	})
	if err != nil {
		switch {
		case errors.Is(err, ErrInvalidInput):
			writeJSON(w, r, http.StatusBadRequest, response{OK: false, Error: "education_level, subject_type, name wajib diisi"})
		case errors.Is(err, ErrSubjectNotFound):
			writeJSON(w, r, http.StatusNotFound, response{OK: false, Error: "subject not found"})
		case errors.Is(err, ErrSubjectForbidden):
			writeJSON(w, r, http.StatusForbidden, response{OK: false, Error: "forbidden"})
		default:
			writeJSON(w, r, http.StatusInternalServerError, response{OK: false, Error: "internal error"})
		}
		return
	}
	writeJSON(w, r, http.StatusOK, response{OK: true, Data: item})
}

func (h *Handler) DeleteSubject(w http.ResponseWriter, r *http.Request) {
	user, ok := auth.CurrentUser(r.Context())
	if !ok {
		writeJSON(w, r, http.StatusUnauthorized, response{OK: false, Error: "unauthorized"})
		return
	}
	subjectID, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil || subjectID <= 0 {
		writeJSON(w, r, http.StatusBadRequest, response{OK: false, Error: "invalid subject id"})
		return
	}
	if err := h.svc.DeleteSubject(r.Context(), subjectID, user.ID, user.Role); err != nil {
		switch {
		case errors.Is(err, ErrInvalidInput):
			writeJSON(w, r, http.StatusBadRequest, response{OK: false, Error: "invalid subject id"})
		case errors.Is(err, ErrSubjectNotFound):
			writeJSON(w, r, http.StatusNotFound, response{OK: false, Error: "subject not found"})
		case errors.Is(err, ErrSubjectForbidden):
			writeJSON(w, r, http.StatusForbidden, response{OK: false, Error: "forbidden"})
		default:
			writeJSON(w, r, http.StatusInternalServerError, response{OK: false, Error: "internal error"})
		}
		return
	}
	writeJSON(w, r, http.StatusOK, response{OK: true, Data: map[string]string{"status": "deleted"}})
}

func (h *Handler) ListExams(w http.ResponseWriter, r *http.Request) {
	subjectID, err := strconv.ParseInt(strings.TrimSpace(r.URL.Query().Get("subject_id")), 10, 64)
	if err != nil || subjectID <= 0 {
		writeJSON(w, r, http.StatusBadRequest, response{OK: false, Error: "subject_id is required"})
		return
	}
	items, err := h.svc.ListExamsBySubject(r.Context(), subjectID)
	if err != nil {
		if errors.Is(err, ErrInvalidInput) {
			writeJSON(w, r, http.StatusBadRequest, response{OK: false, Error: err.Error()})
			return
		}
		writeJSON(w, r, http.StatusInternalServerError, response{OK: false, Error: "internal error"})
		return
	}
	writeJSON(w, r, http.StatusOK, response{OK: true, Data: items})
}

func (h *Handler) ListExamsForToken(w http.ResponseWriter, r *http.Request) {
	items, err := h.svc.ListExamsForToken(r.Context())
	if err != nil {
		writeJSON(w, r, http.StatusInternalServerError, response{OK: false, Error: "internal error"})
		return
	}
	writeJSON(w, r, http.StatusOK, response{OK: true, Data: items})
}

func (h *Handler) ListAdminExams(w http.ResponseWriter, r *http.Request) {
	includeInactive := strings.TrimSpace(r.URL.Query().Get("all")) == "1"
	items, err := h.svc.ListAdminExams(r.Context(), includeInactive)
	if err != nil {
		writeJSON(w, r, http.StatusInternalServerError, response{OK: false, Error: "internal error"})
		return
	}
	writeJSON(w, r, http.StatusOK, response{OK: true, Data: items})
}

func (h *Handler) CreateExam(w http.ResponseWriter, r *http.Request) {
	var req examManageRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, r, http.StatusBadRequest, response{OK: false, Error: "invalid request body"})
		return
	}
	user, ok := auth.CurrentUser(r.Context())
	if !ok {
		writeJSON(w, r, http.StatusUnauthorized, response{OK: false, Error: "unauthorized"})
		return
	}
	startAt, endAt, err := parseExamSchedule(req.StartAt, req.EndAt)
	if err != nil {
		writeJSON(w, r, http.StatusBadRequest, response{OK: false, Error: err.Error()})
		return
	}
	item, err := h.svc.CreateExam(r.Context(), CreateExamInput{
		Code:               req.Code,
		Title:              req.Title,
		SubjectID:          req.SubjectID,
		DurationMinutes:    req.DurationMinutes,
		MaxAttempts:        req.MaxAttempts,
		StartAt:            startAt,
		EndAt:              endAt,
		ReviewPolicy:       req.ReviewPolicy,
		RandomizeQuestions: req.RandomizeQuestions,
		RandomizeOptions:   req.RandomizeOptions,
		CreatedBy:          user.ID,
	})
	if err != nil {
		if errors.Is(err, ErrInvalidInput) {
			writeJSON(w, r, http.StatusBadRequest, response{OK: false, Error: "title dan subject_id wajib diisi"})
			return
		}
		if errors.Is(err, ErrExamCodeExists) {
			writeJSON(w, r, http.StatusConflict, response{OK: false, Error: "Kode ujian sudah digunakan. Pakai kode lain."})
			return
		}
		writeJSON(w, r, http.StatusBadRequest, response{OK: false, Error: err.Error()})
		return
	}
	writeJSON(w, r, http.StatusCreated, response{OK: true, Data: item})
}

func (h *Handler) UpdateExam(w http.ResponseWriter, r *http.Request) {
	examID, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil || examID <= 0 {
		writeJSON(w, r, http.StatusBadRequest, response{OK: false, Error: "invalid exam id"})
		return
	}
	var req examManageRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, r, http.StatusBadRequest, response{OK: false, Error: "invalid request body"})
		return
	}
	startAt, endAt, err := parseExamSchedule(req.StartAt, req.EndAt)
	if err != nil {
		writeJSON(w, r, http.StatusBadRequest, response{OK: false, Error: err.Error()})
		return
	}
	isActive := true
	if req.IsActive != nil {
		isActive = *req.IsActive
	}
	item, err := h.svc.UpdateExam(r.Context(), UpdateExamInput{
		ID:                 examID,
		Code:               req.Code,
		Title:              req.Title,
		SubjectID:          req.SubjectID,
		DurationMinutes:    req.DurationMinutes,
		MaxAttempts:        req.MaxAttempts,
		StartAt:            startAt,
		EndAt:              endAt,
		ReviewPolicy:       req.ReviewPolicy,
		RandomizeQuestions: req.RandomizeQuestions,
		RandomizeOptions:   req.RandomizeOptions,
		IsActive:           isActive,
	})
	if err != nil {
		switch {
		case errors.Is(err, ErrInvalidInput):
			writeJSON(w, r, http.StatusBadRequest, response{OK: false, Error: "data exam tidak valid"})
		case errors.Is(err, ErrExamNotFound):
			writeJSON(w, r, http.StatusNotFound, response{OK: false, Error: "exam not found"})
		case errors.Is(err, ErrExamCodeExists):
			writeJSON(w, r, http.StatusConflict, response{OK: false, Error: "Kode ujian sudah digunakan. Pakai kode lain."})
		default:
			writeJSON(w, r, http.StatusBadRequest, response{OK: false, Error: err.Error()})
		}
		return
	}
	writeJSON(w, r, http.StatusOK, response{OK: true, Data: item})
}

func (h *Handler) ResetExamAttempt(w http.ResponseWriter, r *http.Request) {
	examID, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil || examID <= 0 {
		writeJSON(w, r, http.StatusBadRequest, response{OK: false, Error: "invalid exam id"})
		return
	}

	var req resetExamAttemptRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, r, http.StatusBadRequest, response{OK: false, Error: "invalid request body"})
		return
	}
	if req.StudentID <= 0 {
		writeJSON(w, r, http.StatusBadRequest, response{OK: false, Error: "student_id is required"})
		return
	}

	user, ok := auth.CurrentUser(r.Context())
	if !ok || user.ID <= 0 {
		writeJSON(w, r, http.StatusUnauthorized, response{OK: false, Error: "unauthorized"})
		return
	}

	attemptID, err := h.svc.ResetExamAttempt(r.Context(), examID, req.StudentID, user.ID)
	if err != nil {
		switch {
		case errors.Is(err, ErrInvalidInput):
			writeJSON(w, r, http.StatusBadRequest, response{OK: false, Error: err.Error()})
		case errors.Is(err, ErrExamNotFound), errors.Is(err, ErrAttemptNotFound):
			writeJSON(w, r, http.StatusNotFound, response{OK: false, Error: err.Error()})
		default:
			writeJSON(w, r, http.StatusInternalServerError, response{OK: false, Error: "internal error"})
		}
		return
	}
	writeJSON(w, r, http.StatusOK, response{OK: true, Data: map[string]any{
		"reset":      true,
		"attempt_id": attemptID,
	}})
}

func (h *Handler) DeleteExam(w http.ResponseWriter, r *http.Request) {
	examID, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil || examID <= 0 {
		writeJSON(w, r, http.StatusBadRequest, response{OK: false, Error: "invalid exam id"})
		return
	}
	if err := h.svc.DeleteExam(r.Context(), examID); err != nil {
		switch {
		case errors.Is(err, ErrInvalidInput):
			writeJSON(w, r, http.StatusBadRequest, response{OK: false, Error: "invalid exam id"})
		case errors.Is(err, ErrExamNotFound):
			writeJSON(w, r, http.StatusNotFound, response{OK: false, Error: "exam not found"})
		default:
			writeJSON(w, r, http.StatusInternalServerError, response{OK: false, Error: "internal error"})
		}
		return
	}
	writeJSON(w, r, http.StatusOK, response{OK: true, Data: map[string]string{"status": "deleted"}})
}

func (h *Handler) ListExamAssignments(w http.ResponseWriter, r *http.Request) {
	examID, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil || examID <= 0 {
		writeJSON(w, r, http.StatusBadRequest, response{OK: false, Error: "invalid exam id"})
		return
	}
	items, err := h.svc.ListExamAssignments(r.Context(), examID)
	if err != nil {
		if errors.Is(err, ErrInvalidInput) {
			writeJSON(w, r, http.StatusBadRequest, response{OK: false, Error: "invalid exam id"})
			return
		}
		if errors.Is(err, ErrAssignmentFeature) {
			writeJSON(w, r, http.StatusBadRequest, response{OK: false, Error: "Tabel exam_assignments belum ada. Jalankan migration terbaru."})
			return
		}
		writeJSON(w, r, http.StatusInternalServerError, response{OK: false, Error: "internal error"})
		return
	}
	writeJSON(w, r, http.StatusOK, response{OK: true, Data: items})
}

func (h *Handler) UploadUserPhoto(w http.ResponseWriter, r *http.Request) {
	userID, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil || userID <= 0 {
		writeJSON(w, r, http.StatusBadRequest, response{OK: false, Error: "invalid user id"})
		return
	}
	if err := r.ParseMultipartForm(3 << 20); err != nil {
		writeJSON(w, r, http.StatusBadRequest, response{OK: false, Error: "invalid multipart form"})
		return
	}
	file, _, err := r.FormFile("file")
	if err != nil {
		writeJSON(w, r, http.StatusBadRequest, response{OK: false, Error: "file is required"})
		return
	}
	defer file.Close()

	limited := io.LimitReader(file, 2*1024*1024+1)
	raw, err := io.ReadAll(limited)
	if err != nil {
		writeJSON(w, r, http.StatusBadRequest, response{OK: false, Error: "failed to read file"})
		return
	}
	if len(raw) == 0 {
		writeJSON(w, r, http.StatusBadRequest, response{OK: false, Error: "file is empty"})
		return
	}
	if len(raw) > 2*1024*1024 {
		writeJSON(w, r, http.StatusBadRequest, response{OK: false, Error: "file terlalu besar (maks 2MB)"})
		return
	}

	contentType := http.DetectContentType(raw)
	switch contentType {
	case "image/jpeg", "image/png", "image/webp":
	default:
		writeJSON(w, r, http.StatusBadRequest, response{OK: false, Error: "format file harus jpg/png/webp"})
		return
	}

	dataURL := "data:" + contentType + ";base64," + base64.StdEncoding.EncodeToString(raw)
	stored, err := h.svc.SetUserPhotoDataURL(r.Context(), userID, dataURL)
	if err != nil {
		switch {
		case errors.Is(err, ErrInvalidInput):
			writeJSON(w, r, http.StatusBadRequest, response{OK: false, Error: "invalid request"})
		case errors.Is(err, ErrUserNotFound):
			writeJSON(w, r, http.StatusNotFound, response{OK: false, Error: "user not found"})
		default:
			writeJSON(w, r, http.StatusInternalServerError, response{OK: false, Error: "internal error"})
		}
		return
	}
	writeJSON(w, r, http.StatusOK, response{OK: true, Data: map[string]any{
		"user_id":        userID,
		"photo_data_url": stored,
	}})
}

func (h *Handler) DeleteUserPhoto(w http.ResponseWriter, r *http.Request) {
	userID, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil || userID <= 0 {
		writeJSON(w, r, http.StatusBadRequest, response{OK: false, Error: "invalid user id"})
		return
	}
	if err := h.svc.ClearUserPhotoDataURL(r.Context(), userID); err != nil {
		switch {
		case errors.Is(err, ErrInvalidInput):
			writeJSON(w, r, http.StatusBadRequest, response{OK: false, Error: "invalid request"})
		case errors.Is(err, ErrUserNotFound):
			writeJSON(w, r, http.StatusNotFound, response{OK: false, Error: "user not found"})
		default:
			writeJSON(w, r, http.StatusInternalServerError, response{OK: false, Error: "internal error"})
		}
		return
	}
	writeJSON(w, r, http.StatusOK, response{OK: true, Data: map[string]any{
		"user_id": userID,
		"cleared": true,
	}})
}

func (h *Handler) ListExamParticipantResults(w http.ResponseWriter, r *http.Request) {
	examID, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil || examID <= 0 {
		writeJSON(w, r, http.StatusBadRequest, response{OK: false, Error: "invalid exam id"})
		return
	}
	items, err := h.svc.ListExamParticipantResults(r.Context(), examID)
	if err != nil {
		switch {
		case errors.Is(err, ErrInvalidInput):
			writeJSON(w, r, http.StatusBadRequest, response{OK: false, Error: "invalid exam id"})
		case errors.Is(err, ErrExamNotFound):
			writeJSON(w, r, http.StatusNotFound, response{OK: false, Error: "exam not found"})
		default:
			writeJSON(w, r, http.StatusInternalServerError, response{OK: false, Error: "internal error"})
		}
		return
	}
	writeJSON(w, r, http.StatusOK, response{OK: true, Data: items})
}

func (h *Handler) ExportExamParticipantResultsExcel(w http.ResponseWriter, r *http.Request) {
	examID, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil || examID <= 0 {
		writeJSON(w, r, http.StatusBadRequest, response{OK: false, Error: "invalid exam id"})
		return
	}
	content, filename, err := h.svc.ExportExamParticipantResultsExcel(r.Context(), examID)
	if err != nil {
		switch {
		case errors.Is(err, ErrInvalidInput):
			writeJSON(w, r, http.StatusBadRequest, response{OK: false, Error: "invalid exam id"})
		case errors.Is(err, ErrExamNotFound):
			writeJSON(w, r, http.StatusNotFound, response{OK: false, Error: "exam not found"})
		default:
			writeJSON(w, r, http.StatusInternalServerError, response{OK: false, Error: "internal error"})
		}
		return
	}
	if strings.TrimSpace(filename) == "" {
		filename = "hasil_ujian.xlsx"
	}
	w.Header().Set("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
	w.Header().Set("Content-Disposition", `attachment; filename="`+filename+`"`)
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(content)
}

func (h *Handler) ReplaceExamAssignments(w http.ResponseWriter, r *http.Request) {
	examID, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil || examID <= 0 {
		writeJSON(w, r, http.StatusBadRequest, response{OK: false, Error: "invalid exam id"})
		return
	}
	var req replaceExamAssignmentsRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, r, http.StatusBadRequest, response{OK: false, Error: "invalid request body"})
		return
	}
	user, ok := auth.CurrentUser(r.Context())
	if !ok {
		writeJSON(w, r, http.StatusUnauthorized, response{OK: false, Error: "unauthorized"})
		return
	}
	items, err := h.svc.ReplaceExamAssignments(r.Context(), ReplaceExamAssignmentsInput{
		ExamID:     examID,
		UserIDs:    req.UserIDs,
		AssignedBy: user.ID,
	})
	if err != nil {
		switch {
		case errors.Is(err, ErrInvalidInput):
			writeJSON(w, r, http.StatusBadRequest, response{OK: false, Error: "invalid request"})
		case errors.Is(err, ErrExamNotFound):
			writeJSON(w, r, http.StatusNotFound, response{OK: false, Error: "exam not found"})
		case errors.Is(err, ErrAssignmentFeature):
			writeJSON(w, r, http.StatusBadRequest, response{OK: false, Error: "Tabel exam_assignments belum ada. Jalankan migration terbaru."})
		default:
			writeJSON(w, r, http.StatusInternalServerError, response{OK: false, Error: "internal error"})
		}
		return
	}
	writeJSON(w, r, http.StatusOK, response{OK: true, Data: items})
}

func (h *Handler) ReplaceExamAssignmentsByClass(w http.ResponseWriter, r *http.Request) {
	examID, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil || examID <= 0 {
		writeJSON(w, r, http.StatusBadRequest, response{OK: false, Error: "invalid exam id"})
		return
	}
	var req replaceExamAssignmentsByClassRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, r, http.StatusBadRequest, response{OK: false, Error: "invalid request body"})
		return
	}
	user, ok := auth.CurrentUser(r.Context())
	if !ok {
		writeJSON(w, r, http.StatusUnauthorized, response{OK: false, Error: "unauthorized"})
		return
	}

	items, err := h.svc.ReplaceExamAssignmentsByClass(r.Context(), ReplaceExamAssignmentsByClassInput{
		ExamID:     examID,
		SchoolID:   req.SchoolID,
		ClassID:    req.ClassID,
		AssignedBy: user.ID,
	})
	if err != nil {
		switch {
		case errors.Is(err, ErrInvalidInput):
			writeJSON(w, r, http.StatusBadRequest, response{OK: false, Error: "school_id dan class_id wajib valid"})
		case errors.Is(err, ErrExamNotFound):
			writeJSON(w, r, http.StatusNotFound, response{OK: false, Error: "exam not found"})
		case errors.Is(err, ErrAssignmentFeature):
			writeJSON(w, r, http.StatusBadRequest, response{OK: false, Error: "Tabel exam_assignments belum ada. Jalankan migration terbaru."})
		default:
			writeJSON(w, r, http.StatusInternalServerError, response{OK: false, Error: "internal error"})
		}
		return
	}
	writeJSON(w, r, http.StatusOK, response{OK: true, Data: items})
}

func (h *Handler) AppendExamAssignmentsByClass(w http.ResponseWriter, r *http.Request) {
	examID, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil || examID <= 0 {
		writeJSON(w, r, http.StatusBadRequest, response{OK: false, Error: "invalid exam id"})
		return
	}
	var req appendExamAssignmentsByClassRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, r, http.StatusBadRequest, response{OK: false, Error: "invalid request body"})
		return
	}
	user, ok := auth.CurrentUser(r.Context())
	if !ok {
		writeJSON(w, r, http.StatusUnauthorized, response{OK: false, Error: "unauthorized"})
		return
	}

	items, err := h.svc.AppendExamAssignmentsByClass(r.Context(), AppendExamAssignmentsByClassInput{
		ExamID:     examID,
		SchoolID:   req.SchoolID,
		ClassID:    req.ClassID,
		AssignedBy: user.ID,
	})
	if err != nil {
		switch {
		case errors.Is(err, ErrInvalidInput):
			writeJSON(w, r, http.StatusBadRequest, response{OK: false, Error: "school_id dan class_id wajib valid"})
		case errors.Is(err, ErrExamNotFound):
			writeJSON(w, r, http.StatusNotFound, response{OK: false, Error: "exam not found"})
		case errors.Is(err, ErrAssignmentFeature):
			writeJSON(w, r, http.StatusBadRequest, response{OK: false, Error: "Tabel exam_assignments belum ada. Jalankan migration terbaru."})
		default:
			writeJSON(w, r, http.StatusInternalServerError, response{OK: false, Error: "internal error"})
		}
		return
	}
	writeJSON(w, r, http.StatusOK, response{OK: true, Data: items})
}

func (h *Handler) RemoveExamAssignment(w http.ResponseWriter, r *http.Request) {
	examID, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil || examID <= 0 {
		writeJSON(w, r, http.StatusBadRequest, response{OK: false, Error: "invalid exam id"})
		return
	}
	userID, err := strconv.ParseInt(chi.URLParam(r, "user_id"), 10, 64)
	if err != nil || userID <= 0 {
		writeJSON(w, r, http.StatusBadRequest, response{OK: false, Error: "invalid user id"})
		return
	}
	user, ok := auth.CurrentUser(r.Context())
	if !ok {
		writeJSON(w, r, http.StatusUnauthorized, response{OK: false, Error: "unauthorized"})
		return
	}
	if err := h.svc.RemoveExamAssignment(r.Context(), examID, userID, user.ID); err != nil {
		switch {
		case errors.Is(err, ErrInvalidInput):
			writeJSON(w, r, http.StatusBadRequest, response{OK: false, Error: "invalid request"})
		case errors.Is(err, ErrExamNotFound):
			writeJSON(w, r, http.StatusNotFound, response{OK: false, Error: "exam not found"})
		case errors.Is(err, ErrAssignmentFeature):
			writeJSON(w, r, http.StatusBadRequest, response{OK: false, Error: "Tabel exam_assignments belum ada. Jalankan migration terbaru."})
		default:
			writeJSON(w, r, http.StatusInternalServerError, response{OK: false, Error: "internal error"})
		}
		return
	}
	writeJSON(w, r, http.StatusOK, response{OK: true, Data: map[string]any{
		"exam_id": examID,
		"user_id": userID,
		"removed": true,
	}})
}

func (h *Handler) ListExamQuestions(w http.ResponseWriter, r *http.Request) {
	examID, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil || examID <= 0 {
		writeJSON(w, r, http.StatusBadRequest, response{OK: false, Error: "invalid exam id"})
		return
	}
	items, err := h.svc.ListExamQuestions(r.Context(), examID)
	if err != nil {
		if errors.Is(err, ErrInvalidInput) {
			writeJSON(w, r, http.StatusBadRequest, response{OK: false, Error: "invalid exam id"})
			return
		}
		writeJSON(w, r, http.StatusInternalServerError, response{OK: false, Error: "internal error"})
		return
	}
	writeJSON(w, r, http.StatusOK, response{OK: true, Data: items})
}

func (h *Handler) UpsertExamQuestion(w http.ResponseWriter, r *http.Request) {
	examID, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil || examID <= 0 {
		writeJSON(w, r, http.StatusBadRequest, response{OK: false, Error: "invalid exam id"})
		return
	}
	var req upsertExamQuestionRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, r, http.StatusBadRequest, response{OK: false, Error: "invalid request body"})
		return
	}
	item, err := h.svc.UpsertExamQuestion(r.Context(), UpsertExamQuestionInput{
		ExamID:     examID,
		QuestionID: req.QuestionID,
		SeqNo:      req.SeqNo,
		Weight:     req.Weight,
	})
	if err != nil {
		switch {
		case errors.Is(err, ErrInvalidInput):
			writeJSON(w, r, http.StatusBadRequest, response{OK: false, Error: "question_id wajib diisi"})
		case errors.Is(err, ErrExamNotFound):
			writeJSON(w, r, http.StatusNotFound, response{OK: false, Error: "exam not found"})
		default:
			writeJSON(w, r, http.StatusInternalServerError, response{OK: false, Error: err.Error()})
		}
		return
	}
	writeJSON(w, r, http.StatusOK, response{OK: true, Data: item})
}

func (h *Handler) ListExamQuestionCodeRules(w http.ResponseWriter, r *http.Request) {
	examID, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil || examID <= 0 {
		writeJSON(w, r, http.StatusBadRequest, response{OK: false, Error: "invalid exam id"})
		return
	}
	items, err := h.svc.ListExamQuestionCodeRules(r.Context(), examID)
	if err != nil {
		switch {
		case errors.Is(err, ErrInvalidInput):
			writeJSON(w, r, http.StatusBadRequest, response{OK: false, Error: err.Error()})
		case errors.Is(err, ErrExamNotFound):
			writeJSON(w, r, http.StatusNotFound, response{OK: false, Error: err.Error()})
		default:
			writeJSON(w, r, http.StatusInternalServerError, response{OK: false, Error: "internal error"})
		}
		return
	}
	writeJSON(w, r, http.StatusOK, response{OK: true, Data: items})
}

func (h *Handler) UpsertExamQuestionCodeRule(w http.ResponseWriter, r *http.Request) {
	user, ok := auth.CurrentUser(r.Context())
	if !ok {
		writeJSON(w, r, http.StatusUnauthorized, response{OK: false, Error: "unauthorized"})
		return
	}
	examID, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil || examID <= 0 {
		writeJSON(w, r, http.StatusBadRequest, response{OK: false, Error: "invalid exam id"})
		return
	}

	var req upsertExamQuestionCodeRuleRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, r, http.StatusBadRequest, response{OK: false, Error: "invalid request body"})
		return
	}
	item, err := h.svc.UpsertExamQuestionCodeRule(r.Context(), UpsertExamQuestionCodeRuleInput{
		ExamID:         examID,
		QuestionCodeID: req.QuestionCodeID,
		Strategy:       req.Strategy,
		PickCount:      req.PickCount,
		Weight:         req.Weight,
		CreatedBy:      user.ID,
	})
	if err != nil {
		switch {
		case errors.Is(err, ErrInvalidInput):
			writeJSON(w, r, http.StatusBadRequest, response{OK: false, Error: err.Error()})
		case errors.Is(err, ErrExamNotFound):
			writeJSON(w, r, http.StatusNotFound, response{OK: false, Error: err.Error()})
		default:
			writeJSON(w, r, http.StatusInternalServerError, response{OK: false, Error: "internal error"})
		}
		return
	}
	writeJSON(w, r, http.StatusOK, response{OK: true, Data: item})
}

func (h *Handler) DeleteExamQuestionCodeRule(w http.ResponseWriter, r *http.Request) {
	examID, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil || examID <= 0 {
		writeJSON(w, r, http.StatusBadRequest, response{OK: false, Error: "invalid exam id"})
		return
	}
	questionCodeID, err := strconv.ParseInt(chi.URLParam(r, "questionCodeID"), 10, 64)
	if err != nil || questionCodeID <= 0 {
		writeJSON(w, r, http.StatusBadRequest, response{OK: false, Error: "invalid question code id"})
		return
	}
	if err := h.svc.DeleteExamQuestionCodeRule(r.Context(), examID, questionCodeID); err != nil {
		switch {
		case errors.Is(err, ErrInvalidInput):
			writeJSON(w, r, http.StatusBadRequest, response{OK: false, Error: err.Error()})
		case errors.Is(err, ErrQuestionCodeRuleNotFound):
			writeJSON(w, r, http.StatusNotFound, response{OK: false, Error: err.Error()})
		default:
			writeJSON(w, r, http.StatusInternalServerError, response{OK: false, Error: "internal error"})
		}
		return
	}
	writeJSON(w, r, http.StatusOK, response{OK: true, Data: map[string]any{"deleted": true}})
}

func (h *Handler) SyncExamQuestionsByCode(w http.ResponseWriter, r *http.Request) {
	examID, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil || examID <= 0 {
		writeJSON(w, r, http.StatusBadRequest, response{OK: false, Error: "invalid exam id"})
		return
	}
	out, err := h.svc.SyncExamQuestionsByCode(r.Context(), SyncExamQuestionsByCodeInput{
		ExamID: examID,
	})
	if err != nil {
		switch {
		case errors.Is(err, ErrInvalidInput):
			writeJSON(w, r, http.StatusBadRequest, response{OK: false, Error: err.Error()})
		case errors.Is(err, ErrExamNotFound):
			writeJSON(w, r, http.StatusNotFound, response{OK: false, Error: err.Error()})
		default:
			writeJSON(w, r, http.StatusInternalServerError, response{OK: false, Error: "internal error"})
		}
		return
	}
	writeJSON(w, r, http.StatusOK, response{OK: true, Data: out})
}

func (h *Handler) DeleteExamQuestion(w http.ResponseWriter, r *http.Request) {
	examID, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil || examID <= 0 {
		writeJSON(w, r, http.StatusBadRequest, response{OK: false, Error: "invalid exam id"})
		return
	}
	questionID, err := strconv.ParseInt(chi.URLParam(r, "questionID"), 10, 64)
	if err != nil || questionID <= 0 {
		writeJSON(w, r, http.StatusBadRequest, response{OK: false, Error: "invalid question id"})
		return
	}
	if err := h.svc.DeleteExamQuestion(r.Context(), examID, questionID); err != nil {
		switch {
		case errors.Is(err, ErrInvalidInput):
			writeJSON(w, r, http.StatusBadRequest, response{OK: false, Error: "invalid request"})
		case errors.Is(err, ErrQuestionNotInExam):
			writeJSON(w, r, http.StatusNotFound, response{OK: false, Error: "question not in exam"})
		default:
			writeJSON(w, r, http.StatusInternalServerError, response{OK: false, Error: "internal error"})
		}
		return
	}
	writeJSON(w, r, http.StatusOK, response{OK: true, Data: map[string]string{"status": "deleted"}})
}

func (h *Handler) UpsertExamQuestionIncident(w http.ResponseWriter, r *http.Request) {
	examID, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil || examID <= 0 {
		writeJSON(w, r, http.StatusBadRequest, response{OK: false, Error: "invalid exam id"})
		return
	}

	var req upsertExamQuestionIncidentRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, r, http.StatusBadRequest, response{OK: false, Error: "invalid request body"})
		return
	}

	user, ok := auth.CurrentUser(r.Context())
	if !ok || user.ID <= 0 {
		writeJSON(w, r, http.StatusUnauthorized, response{OK: false, Error: "unauthorized"})
		return
	}

	out, err := h.svc.UpsertExamQuestionIncident(r.Context(), UpsertExamQuestionIncidentInput{
		ExamID:             examID,
		QuestionID:         req.QuestionID,
		Policy:             req.Policy,
		Reason:             req.Reason,
		DecidedBy:          user.ID,
		RecomputeSubmitted: req.RecomputeSubmitted,
	})
	if err != nil {
		switch {
		case errors.Is(err, ErrInvalidInput), errors.Is(err, ErrIncidentPolicyInvalid):
			writeJSON(w, r, http.StatusBadRequest, response{OK: false, Error: err.Error()})
		case errors.Is(err, ErrExamNotFound):
			writeJSON(w, r, http.StatusNotFound, response{OK: false, Error: "exam not found"})
		case errors.Is(err, ErrQuestionNotInExam):
			writeJSON(w, r, http.StatusBadRequest, response{OK: false, Error: "question not in exam"})
		default:
			writeJSON(w, r, http.StatusInternalServerError, response{OK: false, Error: "internal error"})
		}
		return
	}
	writeJSON(w, r, http.StatusOK, response{OK: true, Data: out})
}

func (h *Handler) GenerateExamToken(w http.ResponseWriter, r *http.Request) {
	examID, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil || examID <= 0 {
		writeJSON(w, r, http.StatusBadRequest, response{OK: false, Error: "invalid exam id"})
		return
	}
	user, ok := auth.CurrentUser(r.Context())
	if !ok {
		writeJSON(w, r, http.StatusUnauthorized, response{OK: false, Error: "unauthorized"})
		return
	}

	var req generateExamTokenRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		req = generateExamTokenRequest{}
	}
	token, err := h.svc.GenerateExamToken(r.Context(), examID, user.ID, req.TTLMinutes)
	if err != nil {
		switch {
		case errors.Is(err, ErrInvalidInput):
			writeJSON(w, r, http.StatusBadRequest, response{OK: false, Error: "invalid request"})
		case errors.Is(err, ErrExamNotFound):
			writeJSON(w, r, http.StatusNotFound, response{OK: false, Error: err.Error()})
		default:
			writeJSON(w, r, http.StatusInternalServerError, response{OK: false, Error: "internal error"})
		}
		return
	}
	writeJSON(w, r, http.StatusOK, response{OK: true, Data: token})
}

func (h *Handler) GetAttempt(w http.ResponseWriter, r *http.Request) {
	user, ok := auth.CurrentUser(r.Context())
	if !ok {
		writeJSON(w, r, http.StatusUnauthorized, response{OK: false, Error: "unauthorized"})
		return
	}

	attemptID, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil || attemptID <= 0 {
		writeJSON(w, r, http.StatusBadRequest, response{OK: false, Error: "invalid attempt id"})
		return
	}

	if err := h.authorizeAttemptAccess(r, user, attemptID); err != nil {
		switch {
		case errors.Is(err, ErrAttemptNotFound):
			writeJSON(w, r, http.StatusNotFound, response{OK: false, Error: err.Error()})
		case errors.Is(err, ErrAttemptForbidden):
			writeJSON(w, r, http.StatusForbidden, response{OK: false, Error: "forbidden"})
		default:
			writeJSON(w, r, http.StatusInternalServerError, response{OK: false, Error: "internal error"})
		}
		return
	}

	summary, err := h.svc.GetAttemptSummary(r.Context(), attemptID)
	if err != nil {
		switch {
		case errors.Is(err, ErrAttemptNotFound):
			writeJSON(w, r, http.StatusNotFound, response{OK: false, Error: err.Error()})
		default:
			writeJSON(w, r, http.StatusInternalServerError, response{OK: false, Error: "internal error"})
		}
		return
	}

	writeJSON(w, r, http.StatusOK, response{OK: true, Data: summary})
}

func (h *Handler) GetAttemptQuestion(w http.ResponseWriter, r *http.Request) {
	user, ok := auth.CurrentUser(r.Context())
	if !ok {
		writeJSON(w, r, http.StatusUnauthorized, response{OK: false, Error: "unauthorized"})
		return
	}

	attemptID, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil || attemptID <= 0 {
		writeJSON(w, r, http.StatusBadRequest, response{OK: false, Error: "invalid attempt id"})
		return
	}
	no, err := strconv.Atoi(chi.URLParam(r, "no"))
	if err != nil || no <= 0 {
		writeJSON(w, r, http.StatusBadRequest, response{OK: false, Error: "invalid question number"})
		return
	}

	if err := h.authorizeAttemptAccess(r, user, attemptID); err != nil {
		switch {
		case errors.Is(err, ErrAttemptNotFound):
			writeJSON(w, r, http.StatusNotFound, response{OK: false, Error: err.Error()})
		case errors.Is(err, ErrAttemptForbidden):
			writeJSON(w, r, http.StatusForbidden, response{OK: false, Error: "forbidden"})
		default:
			writeJSON(w, r, http.StatusInternalServerError, response{OK: false, Error: "internal error"})
		}
		return
	}

	item, err := h.svc.GetAttemptQuestion(r.Context(), attemptID, no)
	if err != nil {
		switch {
		case errors.Is(err, ErrAttemptNotFound), errors.Is(err, ErrQuestionNotInExam):
			writeJSON(w, r, http.StatusNotFound, response{OK: false, Error: err.Error()})
		case errors.Is(err, ErrInvalidInput):
			writeJSON(w, r, http.StatusBadRequest, response{OK: false, Error: err.Error()})
		default:
			writeJSON(w, r, http.StatusInternalServerError, response{OK: false, Error: "internal error"})
		}
		return
	}

	writeJSON(w, r, http.StatusOK, response{OK: true, Data: item})
}

func (h *Handler) SaveAnswer(w http.ResponseWriter, r *http.Request) {
	user, ok := auth.CurrentUser(r.Context())
	if !ok {
		writeJSON(w, r, http.StatusUnauthorized, response{OK: false, Error: "unauthorized"})
		return
	}

	attemptID, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil || attemptID <= 0 {
		writeJSON(w, r, http.StatusBadRequest, response{OK: false, Error: "invalid attempt id"})
		return
	}

	questionID, err := strconv.ParseInt(chi.URLParam(r, "questionID"), 10, 64)
	if err != nil || questionID <= 0 {
		writeJSON(w, r, http.StatusBadRequest, response{OK: false, Error: "invalid question id"})
		return
	}

	var req saveAnswerRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, r, http.StatusBadRequest, response{OK: false, Error: "invalid request body"})
		return
	}
	if len(req.AnswerPayload) == 0 {
		req.AnswerPayload = json.RawMessage(`{}`)
	}

	if err := h.authorizeAttemptAccess(r, user, attemptID); err != nil {
		switch {
		case errors.Is(err, ErrAttemptNotFound):
			writeJSON(w, r, http.StatusNotFound, response{OK: false, Error: err.Error()})
		case errors.Is(err, ErrAttemptForbidden):
			writeJSON(w, r, http.StatusForbidden, response{OK: false, Error: "forbidden"})
		default:
			writeJSON(w, r, http.StatusInternalServerError, response{OK: false, Error: "internal error"})
		}
		return
	}

	err = h.svc.SaveAnswer(r.Context(), SaveAnswerInput{
		AttemptID:     attemptID,
		QuestionID:    questionID,
		AnswerPayload: req.AnswerPayload,
		IsDoubt:       req.IsDoubt,
	})
	if err != nil {
		switch {
		case errors.Is(err, ErrAttemptNotFound):
			writeJSON(w, r, http.StatusNotFound, response{OK: false, Error: err.Error()})
		case errors.Is(err, ErrAttemptNotEditable), errors.Is(err, ErrQuestionNotInExam):
			writeJSON(w, r, http.StatusBadRequest, response{OK: false, Error: err.Error()})
		default:
			writeJSON(w, r, http.StatusInternalServerError, response{OK: false, Error: "internal error"})
		}
		return
	}

	writeJSON(w, r, http.StatusOK, response{OK: true, Data: map[string]string{"status": "saved"}})
}

func (h *Handler) Submit(w http.ResponseWriter, r *http.Request) {
	user, ok := auth.CurrentUser(r.Context())
	if !ok {
		writeJSON(w, r, http.StatusUnauthorized, response{OK: false, Error: "unauthorized"})
		return
	}

	attemptID, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil || attemptID <= 0 {
		writeJSON(w, r, http.StatusBadRequest, response{OK: false, Error: "invalid attempt id"})
		return
	}

	if err := h.authorizeAttemptAccess(r, user, attemptID); err != nil {
		switch {
		case errors.Is(err, ErrAttemptNotFound):
			writeJSON(w, r, http.StatusNotFound, response{OK: false, Error: err.Error()})
		case errors.Is(err, ErrAttemptForbidden):
			writeJSON(w, r, http.StatusForbidden, response{OK: false, Error: "forbidden"})
		default:
			writeJSON(w, r, http.StatusInternalServerError, response{OK: false, Error: "internal error"})
		}
		return
	}

	summary, err := h.svc.SubmitAttempt(r.Context(), attemptID)
	if err != nil {
		switch {
		case errors.Is(err, ErrAttemptNotFound):
			writeJSON(w, r, http.StatusNotFound, response{OK: false, Error: err.Error()})
		default:
			writeJSON(w, r, http.StatusInternalServerError, response{OK: false, Error: "internal error"})
		}
		return
	}

	writeJSON(w, r, http.StatusOK, response{OK: true, Data: summary})
}

func (h *Handler) Result(w http.ResponseWriter, r *http.Request) {
	user, ok := auth.CurrentUser(r.Context())
	if !ok {
		writeJSON(w, r, http.StatusUnauthorized, response{OK: false, Error: "unauthorized"})
		return
	}

	attemptID, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil || attemptID <= 0 {
		writeJSON(w, r, http.StatusBadRequest, response{OK: false, Error: "invalid attempt id"})
		return
	}

	if err := h.authorizeAttemptAccess(r, user, attemptID); err != nil {
		switch {
		case errors.Is(err, ErrAttemptNotFound):
			writeJSON(w, r, http.StatusNotFound, response{OK: false, Error: err.Error()})
		case errors.Is(err, ErrAttemptForbidden):
			writeJSON(w, r, http.StatusForbidden, response{OK: false, Error: "forbidden"})
		default:
			writeJSON(w, r, http.StatusInternalServerError, response{OK: false, Error: "internal error"})
		}
		return
	}

	result, err := h.svc.GetAttemptResult(r.Context(), attemptID)
	if err != nil {
		switch {
		case errors.Is(err, ErrAttemptNotFound):
			writeJSON(w, r, http.StatusNotFound, response{OK: false, Error: err.Error()})
		case errors.Is(err, ErrAttemptNotFinal):
			writeJSON(w, r, http.StatusBadRequest, response{OK: false, Error: err.Error()})
		case errors.Is(err, ErrResultPolicyDenied):
			writeJSON(w, r, http.StatusForbidden, response{OK: false, Error: err.Error()})
		default:
			writeJSON(w, r, http.StatusInternalServerError, response{OK: false, Error: "internal error"})
		}
		return
	}

	writeJSON(w, r, http.StatusOK, response{OK: true, Data: result})
}

func (h *Handler) LogEvent(w http.ResponseWriter, r *http.Request) {
	user, ok := auth.CurrentUser(r.Context())
	if !ok {
		writeJSON(w, r, http.StatusUnauthorized, response{OK: false, Error: "unauthorized"})
		return
	}

	attemptID, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil || attemptID <= 0 {
		writeJSON(w, r, http.StatusBadRequest, response{OK: false, Error: "invalid attempt id"})
		return
	}

	if err := h.authorizeAttemptAccess(r, user, attemptID); err != nil {
		switch {
		case errors.Is(err, ErrAttemptNotFound):
			writeJSON(w, r, http.StatusNotFound, response{OK: false, Error: err.Error()})
		case errors.Is(err, ErrAttemptForbidden):
			writeJSON(w, r, http.StatusForbidden, response{OK: false, Error: "forbidden"})
		default:
			writeJSON(w, r, http.StatusInternalServerError, response{OK: false, Error: "internal error"})
		}
		return
	}

	var req attemptEventRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, r, http.StatusBadRequest, response{OK: false, Error: "invalid request body"})
		return
	}

	var clientTS *time.Time
	if v := strings.TrimSpace(req.ClientTS); v != "" {
		parsed, err := time.Parse(time.RFC3339, v)
		if err != nil {
			writeJSON(w, r, http.StatusBadRequest, response{OK: false, Error: "invalid client_ts"})
			return
		}
		clientTS = &parsed
	}

	event, err := h.svc.LogAttemptEvent(r.Context(), AttemptEventInput{
		AttemptID:   attemptID,
		EventType:   req.EventType,
		Payload:     req.Payload,
		ClientTS:    clientTS,
		ActorUserID: user.ID,
	})
	if err != nil {
		switch {
		case errors.Is(err, ErrAttemptNotFound):
			writeJSON(w, r, http.StatusNotFound, response{OK: false, Error: err.Error()})
		case errors.Is(err, ErrInvalidEventType):
			writeJSON(w, r, http.StatusBadRequest, response{OK: false, Error: err.Error()})
		default:
			writeJSON(w, r, http.StatusInternalServerError, response{OK: false, Error: "internal error"})
		}
		return
	}

	writeJSON(w, r, http.StatusCreated, response{OK: true, Data: event})
}

func (h *Handler) ListEvents(w http.ResponseWriter, r *http.Request) {
	attemptID, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil || attemptID <= 0 {
		writeJSON(w, r, http.StatusBadRequest, response{OK: false, Error: "invalid attempt id"})
		return
	}
	limit := 200
	if raw := strings.TrimSpace(r.URL.Query().Get("limit")); raw != "" {
		if n, err := strconv.Atoi(raw); err == nil {
			limit = n
		}
	}

	items, err := h.svc.ListAttemptEvents(r.Context(), attemptID, limit)
	if err != nil {
		switch {
		case errors.Is(err, ErrAttemptNotFound):
			writeJSON(w, r, http.StatusNotFound, response{OK: false, Error: err.Error()})
		default:
			writeJSON(w, r, http.StatusInternalServerError, response{OK: false, Error: "internal error"})
		}
		return
	}

	writeJSON(w, r, http.StatusOK, response{OK: true, Data: items})
}

func (h *Handler) ListExamEvents(w http.ResponseWriter, r *http.Request) {
	examID, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil || examID <= 0 {
		writeJSON(w, r, http.StatusBadRequest, response{OK: false, Error: "invalid exam id"})
		return
	}
	limit := 200
	if raw := strings.TrimSpace(r.URL.Query().Get("limit")); raw != "" {
		if n, err := strconv.Atoi(raw); err == nil {
			limit = n
		}
	}

	items, err := h.svc.ListExamEvents(r.Context(), examID, limit)
	if err != nil {
		switch {
		case errors.Is(err, ErrExamNotFound):
			writeJSON(w, r, http.StatusNotFound, response{OK: false, Error: err.Error()})
		case errors.Is(err, ErrInvalidInput):
			writeJSON(w, r, http.StatusBadRequest, response{OK: false, Error: err.Error()})
		default:
			writeJSON(w, r, http.StatusInternalServerError, response{OK: false, Error: "internal error"})
		}
		return
	}

	writeJSON(w, r, http.StatusOK, response{OK: true, Data: items})
}

func (h *Handler) ListExamClassEvents(w http.ResponseWriter, r *http.Request) {
	examID, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil || examID <= 0 {
		writeJSON(w, r, http.StatusBadRequest, response{OK: false, Error: "invalid exam id"})
		return
	}
	classID, err := strconv.ParseInt(chi.URLParam(r, "class_id"), 10, 64)
	if err != nil || classID <= 0 {
		writeJSON(w, r, http.StatusBadRequest, response{OK: false, Error: "invalid class id"})
		return
	}
	limit := 200
	if raw := strings.TrimSpace(r.URL.Query().Get("limit")); raw != "" {
		if n, err := strconv.Atoi(raw); err == nil {
			limit = n
		}
	}

	items, err := h.svc.ListExamClassEvents(r.Context(), examID, classID, limit)
	if err != nil {
		switch {
		case errors.Is(err, ErrExamNotFound):
			writeJSON(w, r, http.StatusNotFound, response{OK: false, Error: err.Error()})
		case errors.Is(err, ErrInvalidInput):
			writeJSON(w, r, http.StatusBadRequest, response{OK: false, Error: err.Error()})
		default:
			writeJSON(w, r, http.StatusInternalServerError, response{OK: false, Error: "internal error"})
		}
		return
	}

	writeJSON(w, r, http.StatusOK, response{OK: true, Data: items})
}

func parseExamSchedule(startRaw, endRaw string) (*time.Time, *time.Time, error) {
	parseOne := func(raw string) (*time.Time, error) {
		v := strings.TrimSpace(raw)
		if v == "" {
			return nil, nil
		}
		t, err := time.Parse(time.RFC3339, v)
		if err != nil {
			return nil, err
		}
		return &t, nil
	}
	startAt, err := parseOne(startRaw)
	if err != nil {
		return nil, nil, errors.New("format start_at harus RFC3339")
	}
	endAt, err := parseOne(endRaw)
	if err != nil {
		return nil, nil, errors.New("format end_at harus RFC3339")
	}
	if startAt != nil && endAt != nil && endAt.Before(*startAt) {
		return nil, nil, errors.New("end_at tidak boleh lebih kecil dari start_at")
	}
	return startAt, endAt, nil
}

func writeJSON(w http.ResponseWriter, r *http.Request, code int, payload response) {
	if payload.OK {
		apiresp.WriteOK(w, r, code, payload.Data)
		return
	}
	apiresp.WriteError(w, r, code, payload.Error)
}

func (h *Handler) authorizeAttemptAccess(r *http.Request, user *auth.User, attemptID int64) error {
	if user.Role == "admin" || user.Role == "proktor" || user.Role == "guru" {
		return nil
	}

	ownerID, err := h.svc.GetAttemptOwner(r.Context(), attemptID)
	if err != nil {
		return err
	}
	if ownerID != user.ID {
		return ErrAttemptForbidden
	}
	return nil
}
