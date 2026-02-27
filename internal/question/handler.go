package question

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"strings"

	"cbtlms/internal/app/apiresp"
	"cbtlms/internal/auth"

	"github.com/go-chi/chi/v5"
)

type Handler struct {
	svc questionService
}

type questionService interface {
	CreateQuestionCode(ctx context.Context, in CreateQuestionCodeInput) (*QuestionCode, error)
	ListQuestionCodes(ctx context.Context, subjectID int64, q string, ownerID *int64) ([]QuestionCode, error)
	UpdateQuestionCode(ctx context.Context, in UpdateQuestionCodeInput) (*QuestionCode, error)
	DeleteQuestionCode(ctx context.Context, id int64, actorID int64, enforceOwner bool) error
	CreateQuestion(ctx context.Context, in CreateQuestionInput) (*QuestionBlueprint, error)
	AssignQuestionCode(ctx context.Context, in AssignQuestionCodeInput) (*QuestionBlueprint, error)
	ListQuestions(ctx context.Context, subjectID int64, ownerID *int64) ([]QuestionBlueprint, error)
	CreateQuestionVersion(ctx context.Context, in CreateQuestionVersionInput) (*QuestionVersion, error)
	UpdateQuestionVersion(ctx context.Context, in UpdateQuestionVersionInput) (*QuestionVersion, error)
	DeleteQuestionVersion(ctx context.Context, questionID int64, versionNo int, actorID int64, enforceOwner bool) error
	FinalizeQuestionVersion(ctx context.Context, questionID int64, versionNo int, actorID int64, enforceOwner bool) (*QuestionVersion, error)
	RequestReopenFinal(ctx context.Context, in RequestReopenFinalInput) (*ReopenFinalRequest, error)
	ApproveReopenFinal(ctx context.Context, in ApproveReopenFinalInput) (*ReopenFinalRequest, error)
	ListQuestionVersions(ctx context.Context, questionID int64, ownerID *int64) ([]QuestionVersion, error)
	CreateQuestionParallel(ctx context.Context, in CreateQuestionParallelInput) (*QuestionParallel, error)
	ListQuestionParallels(ctx context.Context, examID int64, parallelGroup string) ([]QuestionParallel, error)
	UpdateQuestionParallel(ctx context.Context, in UpdateQuestionParallelInput) (*QuestionParallel, error)
	DeleteQuestionParallel(ctx context.Context, examID, parallelID int64) error
	CreateReviewTask(ctx context.Context, in CreateReviewTaskInput) (*ReviewTask, error)
	DecideReviewTask(ctx context.Context, in ReviewDecisionInput) (*ReviewTask, error)
	ListReviewTasks(ctx context.Context, reviewerID int64, status string) ([]ReviewTask, error)
	GetQuestionReviews(ctx context.Context, questionID int64) ([]QuestionReview, error)
}

type apiResponse struct {
	OK    bool        `json:"ok"`
	Data  interface{} `json:"data,omitempty"`
	Error string      `json:"error,omitempty"`
}

type createQuestionRequest struct {
	SubjectID      int64  `json:"subject_id"`
	LearningGoalID int64  `json:"learning_goal_id"`
	QuestionCodeID *int64 `json:"question_code_id"`
	QuestionType   string `json:"question_type"`
	Title          string `json:"title"`
	Indicator      string `json:"indicator"`
	Material       string `json:"material"`
	Objective      string `json:"objective"`
	CognitiveLevel string `json:"cognitive_level"`
	Difficulty     *int   `json:"difficulty"`
}

type createQuestionCodeRequest struct {
	SubjectID int64  `json:"subject_id"`
	Code      string `json:"code"`
	Name      string `json:"name"`
}

type updateQuestionCodeRequest struct {
	SubjectID int64  `json:"subject_id"`
	Code      string `json:"code"`
	Name      string `json:"name"`
}

type assignQuestionCodeRequest struct {
	QuestionCodeID *int64 `json:"question_code_id"`
}

type createQuestionVersionRequest struct {
	StimulusHTML    *string               `json:"stimulus_html"`
	StemHTML        *string               `json:"stem_html"`
	ExplanationHTML *string               `json:"explanation_html"`
	HintHTML        *string               `json:"hint_html"`
	AnswerKey       json.RawMessage       `json:"answer_key"`
	Options         []QuestionOptionInput `json:"options"`
	DurationSeconds *int                  `json:"duration_seconds"`
	Weight          *float64              `json:"weight"`
	ChangeNote      *string               `json:"change_note"`
}

type updateQuestionVersionRequest struct {
	StimulusHTML    *string               `json:"stimulus_html"`
	StemHTML        *string               `json:"stem_html"`
	ExplanationHTML *string               `json:"explanation_html"`
	HintHTML        *string               `json:"hint_html"`
	AnswerKey       json.RawMessage       `json:"answer_key"`
	Options         []QuestionOptionInput `json:"options"`
	DurationSeconds *int                  `json:"duration_seconds"`
	Weight          *float64              `json:"weight"`
	ChangeNote      *string               `json:"change_note"`
}

type requestReopenFinalRequest struct {
	Reason string `json:"reason"`
}

type approveReopenFinalRequest struct {
	Note string `json:"note"`
}

type createQuestionParallelRequest struct {
	QuestionID    int64  `json:"question_id"`
	ParallelGroup string `json:"parallel_group"`
	ParallelOrder int    `json:"parallel_order"`
	ParallelLabel string `json:"parallel_label"`
}

type createReviewTaskRequest struct {
	QuestionVersionID int64  `json:"question_version_id"`
	ExamID            *int64 `json:"exam_id"`
	ReviewerID        int64  `json:"reviewer_id"`
	Note              string `json:"note"`
}

type reviewDecisionRequest struct {
	Status string `json:"status"`
	Note   string `json:"note"`
}

func NewHandler(svc *Service) *Handler {
	return &Handler{svc: svc}
}

func (h *Handler) ListQuestionCodes(w http.ResponseWriter, r *http.Request) {
	user, ok := auth.CurrentUser(r.Context())
	if !ok {
		writeJSON(w, r, http.StatusUnauthorized, apiResponse{OK: false, Error: "unauthorized"})
		return
	}

	var subjectID int64
	subjectIDRaw := strings.TrimSpace(r.URL.Query().Get("subject_id"))
	if subjectIDRaw != "" {
		parsed, err := strconv.ParseInt(subjectIDRaw, 10, 64)
		if err != nil || parsed <= 0 {
			writeJSON(w, r, http.StatusBadRequest, apiResponse{OK: false, Error: "subject_id must be positive"})
			return
		}
		subjectID = parsed
	}
	q := strings.TrimSpace(r.URL.Query().Get("q"))
	var ownerID *int64
	if strings.EqualFold(strings.TrimSpace(user.Role), "guru") {
		ownerID = &user.ID
	}

	items, err := h.svc.ListQuestionCodes(r.Context(), subjectID, q, ownerID)
	if err != nil {
		writeJSON(w, r, http.StatusInternalServerError, apiResponse{OK: false, Error: "internal error"})
		return
	}
	writeJSON(w, r, http.StatusOK, apiResponse{OK: true, Data: items})
}

func (h *Handler) CreateQuestionCode(w http.ResponseWriter, r *http.Request) {
	user, ok := auth.CurrentUser(r.Context())
	if !ok {
		writeJSON(w, r, http.StatusUnauthorized, apiResponse{OK: false, Error: "unauthorized"})
		return
	}
	var req createQuestionCodeRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, r, http.StatusBadRequest, apiResponse{OK: false, Error: "invalid request body"})
		return
	}
	item, err := h.svc.CreateQuestionCode(r.Context(), CreateQuestionCodeInput{
		SubjectID: req.SubjectID,
		Code:      req.Code,
		Name:      req.Name,
		CreatedBy: user.ID,
	})
	if err != nil {
		switch {
		case errors.Is(err, ErrInvalidInput):
			writeJSON(w, r, http.StatusBadRequest, apiResponse{OK: false, Error: err.Error()})
		case errors.Is(err, ErrSubjectNotFound), errors.Is(err, ErrQuestionCodeNotFound):
			writeJSON(w, r, http.StatusNotFound, apiResponse{OK: false, Error: err.Error()})
		case errors.Is(err, ErrQuestionCodeExists):
			writeJSON(w, r, http.StatusConflict, apiResponse{OK: false, Error: err.Error()})
		default:
			writeJSON(w, r, http.StatusInternalServerError, apiResponse{OK: false, Error: "internal error"})
		}
		return
	}
	writeJSON(w, r, http.StatusCreated, apiResponse{OK: true, Data: item})
}

func (h *Handler) UpdateQuestionCode(w http.ResponseWriter, r *http.Request) {
	user, ok := auth.CurrentUser(r.Context())
	if !ok {
		writeJSON(w, r, http.StatusUnauthorized, apiResponse{OK: false, Error: "unauthorized"})
		return
	}
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil || id <= 0 {
		writeJSON(w, r, http.StatusBadRequest, apiResponse{OK: false, Error: "invalid question code id"})
		return
	}
	var req updateQuestionCodeRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, r, http.StatusBadRequest, apiResponse{OK: false, Error: "invalid request body"})
		return
	}

	item, err := h.svc.UpdateQuestionCode(r.Context(), UpdateQuestionCodeInput{
		ID:           id,
		SubjectID:    req.SubjectID,
		Code:         req.Code,
		Name:         req.Name,
		ActorID:      user.ID,
		EnforceOwner: strings.EqualFold(strings.TrimSpace(user.Role), "guru"),
	})
	if err != nil {
		switch {
		case errors.Is(err, ErrInvalidInput):
			writeJSON(w, r, http.StatusBadRequest, apiResponse{OK: false, Error: err.Error()})
		case errors.Is(err, ErrForbidden):
			writeJSON(w, r, http.StatusForbidden, apiResponse{OK: false, Error: err.Error()})
		case errors.Is(err, ErrQuestionCodeNotFound):
			writeJSON(w, r, http.StatusNotFound, apiResponse{OK: false, Error: err.Error()})
		case errors.Is(err, ErrQuestionCodeExists):
			writeJSON(w, r, http.StatusConflict, apiResponse{OK: false, Error: err.Error()})
		default:
			writeJSON(w, r, http.StatusInternalServerError, apiResponse{OK: false, Error: "internal error"})
		}
		return
	}
	writeJSON(w, r, http.StatusOK, apiResponse{OK: true, Data: item})
}

func (h *Handler) DeleteQuestionCode(w http.ResponseWriter, r *http.Request) {
	user, ok := auth.CurrentUser(r.Context())
	if !ok {
		writeJSON(w, r, http.StatusUnauthorized, apiResponse{OK: false, Error: "unauthorized"})
		return
	}
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil || id <= 0 {
		writeJSON(w, r, http.StatusBadRequest, apiResponse{OK: false, Error: "invalid question code id"})
		return
	}
	if err := h.svc.DeleteQuestionCode(r.Context(), id, user.ID, strings.EqualFold(strings.TrimSpace(user.Role), "guru")); err != nil {
		switch {
		case errors.Is(err, ErrInvalidInput):
			writeJSON(w, r, http.StatusBadRequest, apiResponse{OK: false, Error: err.Error()})
		case errors.Is(err, ErrForbidden):
			writeJSON(w, r, http.StatusForbidden, apiResponse{OK: false, Error: err.Error()})
		case errors.Is(err, ErrQuestionCodeNotFound):
			writeJSON(w, r, http.StatusNotFound, apiResponse{OK: false, Error: err.Error()})
		default:
			writeJSON(w, r, http.StatusInternalServerError, apiResponse{OK: false, Error: "internal error"})
		}
		return
	}
	writeJSON(w, r, http.StatusOK, apiResponse{OK: true, Data: map[string]any{"deleted": true}})
}

func (h *Handler) CreateQuestion(w http.ResponseWriter, r *http.Request) {
	user, ok := auth.CurrentUser(r.Context())
	if !ok {
		writeJSON(w, r, http.StatusUnauthorized, apiResponse{OK: false, Error: "unauthorized"})
		return
	}

	var req createQuestionRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, r, http.StatusBadRequest, apiResponse{OK: false, Error: "invalid request body"})
		return
	}

	item, err := h.svc.CreateQuestion(r.Context(), CreateQuestionInput{
		SubjectID:      req.SubjectID,
		LearningGoalID: req.LearningGoalID,
		QuestionCodeID: req.QuestionCodeID,
		EnforceOwner:   strings.EqualFold(strings.TrimSpace(user.Role), "guru"),
		QuestionType:   req.QuestionType,
		Title:          req.Title,
		Indicator:      req.Indicator,
		Material:       req.Material,
		Objective:      req.Objective,
		CognitiveLevel: req.CognitiveLevel,
		Difficulty:     req.Difficulty,
		CreatedBy:      user.ID,
	})
	if err != nil {
		switch {
		case errors.Is(err, ErrInvalidInput):
			writeJSON(w, r, http.StatusBadRequest, apiResponse{OK: false, Error: err.Error()})
		case errors.Is(err, ErrSubjectNotFound), errors.Is(err, ErrLearningGoalNotFound):
			writeJSON(w, r, http.StatusNotFound, apiResponse{OK: false, Error: err.Error()})
		default:
			writeJSON(w, r, http.StatusInternalServerError, apiResponse{OK: false, Error: "internal error"})
		}
		return
	}

	writeJSON(w, r, http.StatusCreated, apiResponse{OK: true, Data: item})
}

func (h *Handler) AssignQuestionCode(w http.ResponseWriter, r *http.Request) {
	user, ok := auth.CurrentUser(r.Context())
	if !ok {
		writeJSON(w, r, http.StatusUnauthorized, apiResponse{OK: false, Error: "unauthorized"})
		return
	}

	questionID, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil || questionID <= 0 {
		writeJSON(w, r, http.StatusBadRequest, apiResponse{OK: false, Error: "invalid question id"})
		return
	}

	var req assignQuestionCodeRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, r, http.StatusBadRequest, apiResponse{OK: false, Error: "invalid request body"})
		return
	}

	item, err := h.svc.AssignQuestionCode(r.Context(), AssignQuestionCodeInput{
		QuestionID:     questionID,
		QuestionCodeID: req.QuestionCodeID,
		ActorID:        user.ID,
		EnforceOwner:   strings.EqualFold(strings.TrimSpace(user.Role), "guru"),
	})
	if err != nil {
		switch {
		case errors.Is(err, ErrInvalidInput):
			writeJSON(w, r, http.StatusBadRequest, apiResponse{OK: false, Error: err.Error()})
		case errors.Is(err, ErrForbidden):
			writeJSON(w, r, http.StatusForbidden, apiResponse{OK: false, Error: err.Error()})
		case errors.Is(err, ErrQuestionNotFound), errors.Is(err, ErrQuestionCodeNotFound):
			writeJSON(w, r, http.StatusNotFound, apiResponse{OK: false, Error: err.Error()})
		default:
			writeJSON(w, r, http.StatusInternalServerError, apiResponse{OK: false, Error: "internal error"})
		}
		return
	}
	writeJSON(w, r, http.StatusOK, apiResponse{OK: true, Data: item})
}

func (h *Handler) ListQuestions(w http.ResponseWriter, r *http.Request) {
	user, ok := auth.CurrentUser(r.Context())
	if !ok {
		writeJSON(w, r, http.StatusUnauthorized, apiResponse{OK: false, Error: "unauthorized"})
		return
	}

	var subjectID int64
	subjectIDRaw := strings.TrimSpace(r.URL.Query().Get("subject_id"))
	if subjectIDRaw != "" {
		parsed, err := strconv.ParseInt(subjectIDRaw, 10, 64)
		if err != nil || parsed <= 0 {
			writeJSON(w, r, http.StatusBadRequest, apiResponse{OK: false, Error: "subject_id must be positive"})
			return
		}
		subjectID = parsed
	}

	ownerOnly := strings.EqualFold(strings.TrimSpace(user.Role), "guru")
	if !ownerOnly {
		ownerOnlyRaw := strings.TrimSpace(r.URL.Query().Get("owner_only"))
		if ownerOnlyRaw != "" {
			parsed, err := strconv.ParseBool(ownerOnlyRaw)
			if err != nil {
				writeJSON(w, r, http.StatusBadRequest, apiResponse{OK: false, Error: "owner_only must be boolean"})
				return
			}
			ownerOnly = parsed
		}
	}
	if strings.EqualFold(strings.TrimSpace(user.Role), "guru") {
		ownerOnly = true
	}

	var ownerID *int64
	if ownerOnly {
		ownerID = &user.ID
	}

	items, err := h.svc.ListQuestions(r.Context(), subjectID, ownerID)
	if err != nil {
		if errors.Is(err, ErrInvalidInput) {
			writeJSON(w, r, http.StatusBadRequest, apiResponse{OK: false, Error: err.Error()})
			return
		}
		writeJSON(w, r, http.StatusInternalServerError, apiResponse{OK: false, Error: "internal error"})
		return
	}
	writeJSON(w, r, http.StatusOK, apiResponse{OK: true, Data: items})
}

func (h *Handler) CreateQuestionVersion(w http.ResponseWriter, r *http.Request) {
	user, ok := auth.CurrentUser(r.Context())
	if !ok {
		writeJSON(w, r, http.StatusUnauthorized, apiResponse{OK: false, Error: "unauthorized"})
		return
	}

	questionID, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil || questionID <= 0 {
		writeJSON(w, r, http.StatusBadRequest, apiResponse{OK: false, Error: "invalid question id"})
		return
	}

	var req createQuestionVersionRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, r, http.StatusBadRequest, apiResponse{OK: false, Error: "invalid request body"})
		return
	}

	item, err := h.svc.CreateQuestionVersion(r.Context(), CreateQuestionVersionInput{
		QuestionID:      questionID,
		StimulusHTML:    req.StimulusHTML,
		StemHTML:        req.StemHTML,
		ExplanationHTML: req.ExplanationHTML,
		HintHTML:        req.HintHTML,
		AnswerKey:       req.AnswerKey,
		Options:         req.Options,
		DurationSeconds: req.DurationSeconds,
		Weight:          req.Weight,
		ChangeNote:      req.ChangeNote,
		CreatedBy:       user.ID,
		EnforceOwner:    strings.EqualFold(strings.TrimSpace(user.Role), "guru"),
	})
	if err != nil {
		switch {
		case errors.Is(err, ErrInvalidInput):
			writeJSON(w, r, http.StatusBadRequest, apiResponse{OK: false, Error: err.Error()})
		case errors.Is(err, ErrForbidden):
			writeJSON(w, r, http.StatusForbidden, apiResponse{OK: false, Error: err.Error()})
		case errors.Is(err, ErrQuestionNotFound):
			writeJSON(w, r, http.StatusNotFound, apiResponse{OK: false, Error: err.Error()})
		default:
			writeJSON(w, r, http.StatusInternalServerError, apiResponse{OK: false, Error: "internal error"})
		}
		return
	}

	writeJSON(w, r, http.StatusCreated, apiResponse{OK: true, Data: item})
}

func (h *Handler) FinalizeQuestionVersion(w http.ResponseWriter, r *http.Request) {
	user, ok := auth.CurrentUser(r.Context())
	if !ok {
		writeJSON(w, r, http.StatusUnauthorized, apiResponse{OK: false, Error: "unauthorized"})
		return
	}

	questionID, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil || questionID <= 0 {
		writeJSON(w, r, http.StatusBadRequest, apiResponse{OK: false, Error: "invalid question id"})
		return
	}
	versionNo, err := strconv.Atoi(chi.URLParam(r, "version"))
	if err != nil || versionNo <= 0 {
		writeJSON(w, r, http.StatusBadRequest, apiResponse{OK: false, Error: "invalid version"})
		return
	}

	item, err := h.svc.FinalizeQuestionVersion(
		r.Context(),
		questionID,
		versionNo,
		user.ID,
		strings.EqualFold(strings.TrimSpace(user.Role), "guru"),
	)
	if err != nil {
		switch {
		case errors.Is(err, ErrInvalidInput):
			writeJSON(w, r, http.StatusBadRequest, apiResponse{OK: false, Error: err.Error()})
		case errors.Is(err, ErrForbidden):
			writeJSON(w, r, http.StatusForbidden, apiResponse{OK: false, Error: err.Error()})
		case errors.Is(err, ErrVersionNotFound):
			writeJSON(w, r, http.StatusNotFound, apiResponse{OK: false, Error: err.Error()})
		default:
			writeJSON(w, r, http.StatusInternalServerError, apiResponse{OK: false, Error: "internal error"})
		}
		return
	}

	writeJSON(w, r, http.StatusOK, apiResponse{OK: true, Data: item})
}

func (h *Handler) RequestReopenFinal(w http.ResponseWriter, r *http.Request) {
	user, ok := auth.CurrentUser(r.Context())
	if !ok {
		writeJSON(w, r, http.StatusUnauthorized, apiResponse{OK: false, Error: "unauthorized"})
		return
	}

	questionID, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil || questionID <= 0 {
		writeJSON(w, r, http.StatusBadRequest, apiResponse{OK: false, Error: "invalid question id"})
		return
	}
	versionNo, err := strconv.Atoi(chi.URLParam(r, "version"))
	if err != nil || versionNo <= 0 {
		writeJSON(w, r, http.StatusBadRequest, apiResponse{OK: false, Error: "invalid version"})
		return
	}

	var req requestReopenFinalRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, r, http.StatusBadRequest, apiResponse{OK: false, Error: "invalid request body"})
		return
	}

	out, err := h.svc.RequestReopenFinal(r.Context(), RequestReopenFinalInput{
		QuestionID:    questionID,
		VersionNo:     versionNo,
		Reason:        req.Reason,
		RequestedBy:   user.ID,
		RequestedRole: user.Role,
	})
	if err != nil {
		switch {
		case errors.Is(err, ErrInvalidInput), errors.Is(err, ErrReopenPending), errors.Is(err, ErrReopenNotAllowed):
			writeJSON(w, r, http.StatusBadRequest, apiResponse{OK: false, Error: err.Error()})
		case errors.Is(err, ErrReviewForbidden):
			writeJSON(w, r, http.StatusForbidden, apiResponse{OK: false, Error: err.Error()})
		case errors.Is(err, ErrVersionNotFound):
			writeJSON(w, r, http.StatusNotFound, apiResponse{OK: false, Error: err.Error()})
		default:
			writeJSON(w, r, http.StatusInternalServerError, apiResponse{OK: false, Error: "internal error"})
		}
		return
	}
	writeJSON(w, r, http.StatusCreated, apiResponse{OK: true, Data: out})
}

func (h *Handler) ApproveReopenFinal(w http.ResponseWriter, r *http.Request) {
	user, ok := auth.CurrentUser(r.Context())
	if !ok {
		writeJSON(w, r, http.StatusUnauthorized, apiResponse{OK: false, Error: "unauthorized"})
		return
	}

	questionID, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil || questionID <= 0 {
		writeJSON(w, r, http.StatusBadRequest, apiResponse{OK: false, Error: "invalid question id"})
		return
	}
	versionNo, err := strconv.Atoi(chi.URLParam(r, "version"))
	if err != nil || versionNo <= 0 {
		writeJSON(w, r, http.StatusBadRequest, apiResponse{OK: false, Error: "invalid version"})
		return
	}

	var req approveReopenFinalRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, r, http.StatusBadRequest, apiResponse{OK: false, Error: "invalid request body"})
		return
	}

	out, err := h.svc.ApproveReopenFinal(r.Context(), ApproveReopenFinalInput{
		QuestionID:   questionID,
		VersionNo:    versionNo,
		ApproverID:   user.ID,
		ApproverRole: user.Role,
		Note:         req.Note,
	})
	if err != nil {
		switch {
		case errors.Is(err, ErrInvalidInput):
			writeJSON(w, r, http.StatusBadRequest, apiResponse{OK: false, Error: err.Error()})
		case errors.Is(err, ErrReviewForbidden):
			writeJSON(w, r, http.StatusForbidden, apiResponse{OK: false, Error: err.Error()})
		case errors.Is(err, ErrVersionNotFound):
			writeJSON(w, r, http.StatusNotFound, apiResponse{OK: false, Error: err.Error()})
		default:
			writeJSON(w, r, http.StatusInternalServerError, apiResponse{OK: false, Error: "internal error"})
		}
		return
	}
	writeJSON(w, r, http.StatusOK, apiResponse{OK: true, Data: out})
}

func (h *Handler) UpdateQuestionVersion(w http.ResponseWriter, r *http.Request) {
	user, ok := auth.CurrentUser(r.Context())
	if !ok {
		writeJSON(w, r, http.StatusUnauthorized, apiResponse{OK: false, Error: "unauthorized"})
		return
	}

	questionID, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil || questionID <= 0 {
		writeJSON(w, r, http.StatusBadRequest, apiResponse{OK: false, Error: "invalid question id"})
		return
	}
	versionNo, err := strconv.Atoi(chi.URLParam(r, "version"))
	if err != nil || versionNo <= 0 {
		writeJSON(w, r, http.StatusBadRequest, apiResponse{OK: false, Error: "invalid version"})
		return
	}

	var req updateQuestionVersionRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, r, http.StatusBadRequest, apiResponse{OK: false, Error: "invalid request body"})
		return
	}

	item, err := h.svc.UpdateQuestionVersion(r.Context(), UpdateQuestionVersionInput{
		QuestionID:      questionID,
		VersionNo:       versionNo,
		StimulusHTML:    req.StimulusHTML,
		StemHTML:        req.StemHTML,
		ExplanationHTML: req.ExplanationHTML,
		HintHTML:        req.HintHTML,
		AnswerKey:       req.AnswerKey,
		Options:         req.Options,
		DurationSeconds: req.DurationSeconds,
		Weight:          req.Weight,
		ChangeNote:      req.ChangeNote,
		ActorID:         user.ID,
		EnforceOwner:    strings.EqualFold(strings.TrimSpace(user.Role), "guru"),
	})
	if err != nil {
		switch {
		case errors.Is(err, ErrInvalidInput):
			writeJSON(w, r, http.StatusBadRequest, apiResponse{OK: false, Error: err.Error()})
		case errors.Is(err, ErrForbidden):
			writeJSON(w, r, http.StatusForbidden, apiResponse{OK: false, Error: err.Error()})
		case errors.Is(err, ErrQuestionNotFound), errors.Is(err, ErrVersionNotFound):
			writeJSON(w, r, http.StatusNotFound, apiResponse{OK: false, Error: err.Error()})
		default:
			writeJSON(w, r, http.StatusInternalServerError, apiResponse{OK: false, Error: "internal error"})
		}
		return
	}

	writeJSON(w, r, http.StatusOK, apiResponse{OK: true, Data: item})
}

func (h *Handler) DeleteQuestionVersion(w http.ResponseWriter, r *http.Request) {
	user, ok := auth.CurrentUser(r.Context())
	if !ok {
		writeJSON(w, r, http.StatusUnauthorized, apiResponse{OK: false, Error: "unauthorized"})
		return
	}

	questionID, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil || questionID <= 0 {
		writeJSON(w, r, http.StatusBadRequest, apiResponse{OK: false, Error: "invalid question id"})
		return
	}
	versionNo, err := strconv.Atoi(chi.URLParam(r, "version"))
	if err != nil || versionNo <= 0 {
		writeJSON(w, r, http.StatusBadRequest, apiResponse{OK: false, Error: "invalid version"})
		return
	}

	if err := h.svc.DeleteQuestionVersion(
		r.Context(),
		questionID,
		versionNo,
		user.ID,
		strings.EqualFold(strings.TrimSpace(user.Role), "guru"),
	); err != nil {
		switch {
		case errors.Is(err, ErrInvalidInput):
			writeJSON(w, r, http.StatusBadRequest, apiResponse{OK: false, Error: err.Error()})
		case errors.Is(err, ErrForbidden):
			writeJSON(w, r, http.StatusForbidden, apiResponse{OK: false, Error: err.Error()})
		case errors.Is(err, ErrVersionNotFound):
			writeJSON(w, r, http.StatusNotFound, apiResponse{OK: false, Error: err.Error()})
		default:
			writeJSON(w, r, http.StatusInternalServerError, apiResponse{OK: false, Error: "internal error"})
		}
		return
	}

	writeJSON(w, r, http.StatusOK, apiResponse{OK: true, Data: map[string]any{"deleted": true}})
}

func (h *Handler) ListQuestionVersions(w http.ResponseWriter, r *http.Request) {
	user, ok := auth.CurrentUser(r.Context())
	if !ok {
		writeJSON(w, r, http.StatusUnauthorized, apiResponse{OK: false, Error: "unauthorized"})
		return
	}

	questionID, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil || questionID <= 0 {
		writeJSON(w, r, http.StatusBadRequest, apiResponse{OK: false, Error: "invalid question id"})
		return
	}

	var ownerID *int64
	if strings.EqualFold(strings.TrimSpace(user.Role), "guru") {
		ownerID = &user.ID
	}

	items, err := h.svc.ListQuestionVersions(r.Context(), questionID, ownerID)
	if err != nil {
		if errors.Is(err, ErrInvalidInput) {
			writeJSON(w, r, http.StatusBadRequest, apiResponse{OK: false, Error: err.Error()})
			return
		}
		writeJSON(w, r, http.StatusInternalServerError, apiResponse{OK: false, Error: "internal error"})
		return
	}

	writeJSON(w, r, http.StatusOK, apiResponse{OK: true, Data: items})
}

func (h *Handler) CreateQuestionParallel(w http.ResponseWriter, r *http.Request) {
	examID, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil || examID <= 0 {
		writeJSON(w, r, http.StatusBadRequest, apiResponse{OK: false, Error: "invalid exam id"})
		return
	}

	var req createQuestionParallelRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, r, http.StatusBadRequest, apiResponse{OK: false, Error: "invalid request body"})
		return
	}

	item, err := h.svc.CreateQuestionParallel(r.Context(), CreateQuestionParallelInput{
		ExamID:        examID,
		QuestionID:    req.QuestionID,
		ParallelGroup: req.ParallelGroup,
		ParallelOrder: req.ParallelOrder,
		ParallelLabel: req.ParallelLabel,
	})
	if err != nil {
		switch {
		case errors.Is(err, ErrInvalidInput):
			writeJSON(w, r, http.StatusBadRequest, apiResponse{OK: false, Error: err.Error()})
		case errors.Is(err, ErrExamNotFound):
			writeJSON(w, r, http.StatusNotFound, apiResponse{OK: false, Error: err.Error()})
		case errors.Is(err, ErrQuestionNotInExam):
			writeJSON(w, r, http.StatusConflict, apiResponse{OK: false, Error: err.Error()})
		default:
			writeJSON(w, r, http.StatusInternalServerError, apiResponse{OK: false, Error: "internal error"})
		}
		return
	}

	writeJSON(w, r, http.StatusCreated, apiResponse{OK: true, Data: item})
}

func (h *Handler) ListQuestionParallels(w http.ResponseWriter, r *http.Request) {
	examID, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil || examID <= 0 {
		writeJSON(w, r, http.StatusBadRequest, apiResponse{OK: false, Error: "invalid exam id"})
		return
	}
	parallelGroup := strings.TrimSpace(r.URL.Query().Get("parallel_group"))

	items, err := h.svc.ListQuestionParallels(r.Context(), examID, parallelGroup)
	if err != nil {
		switch {
		case errors.Is(err, ErrInvalidInput):
			writeJSON(w, r, http.StatusBadRequest, apiResponse{OK: false, Error: err.Error()})
		case errors.Is(err, ErrExamNotFound):
			writeJSON(w, r, http.StatusNotFound, apiResponse{OK: false, Error: err.Error()})
		default:
			writeJSON(w, r, http.StatusInternalServerError, apiResponse{OK: false, Error: "internal error"})
		}
		return
	}
	writeJSON(w, r, http.StatusOK, apiResponse{OK: true, Data: items})
}

func (h *Handler) UpdateQuestionParallel(w http.ResponseWriter, r *http.Request) {
	examID, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil || examID <= 0 {
		writeJSON(w, r, http.StatusBadRequest, apiResponse{OK: false, Error: "invalid exam id"})
		return
	}
	parallelID, err := strconv.ParseInt(chi.URLParam(r, "parallelID"), 10, 64)
	if err != nil || parallelID <= 0 {
		writeJSON(w, r, http.StatusBadRequest, apiResponse{OK: false, Error: "invalid parallel id"})
		return
	}

	var req createQuestionParallelRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, r, http.StatusBadRequest, apiResponse{OK: false, Error: "invalid request body"})
		return
	}

	item, err := h.svc.UpdateQuestionParallel(r.Context(), UpdateQuestionParallelInput{
		ExamID:        examID,
		ParallelID:    parallelID,
		QuestionID:    req.QuestionID,
		ParallelGroup: req.ParallelGroup,
		ParallelOrder: req.ParallelOrder,
		ParallelLabel: req.ParallelLabel,
	})
	if err != nil {
		switch {
		case errors.Is(err, ErrInvalidInput):
			writeJSON(w, r, http.StatusBadRequest, apiResponse{OK: false, Error: err.Error()})
		case errors.Is(err, ErrParallelNotFound), errors.Is(err, ErrExamNotFound):
			writeJSON(w, r, http.StatusNotFound, apiResponse{OK: false, Error: err.Error()})
		case errors.Is(err, ErrQuestionNotInExam):
			writeJSON(w, r, http.StatusConflict, apiResponse{OK: false, Error: err.Error()})
		default:
			writeJSON(w, r, http.StatusInternalServerError, apiResponse{OK: false, Error: "internal error"})
		}
		return
	}
	writeJSON(w, r, http.StatusOK, apiResponse{OK: true, Data: item})
}

func (h *Handler) DeleteQuestionParallel(w http.ResponseWriter, r *http.Request) {
	examID, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil || examID <= 0 {
		writeJSON(w, r, http.StatusBadRequest, apiResponse{OK: false, Error: "invalid exam id"})
		return
	}
	parallelID, err := strconv.ParseInt(chi.URLParam(r, "parallelID"), 10, 64)
	if err != nil || parallelID <= 0 {
		writeJSON(w, r, http.StatusBadRequest, apiResponse{OK: false, Error: "invalid parallel id"})
		return
	}

	if err := h.svc.DeleteQuestionParallel(r.Context(), examID, parallelID); err != nil {
		switch {
		case errors.Is(err, ErrInvalidInput):
			writeJSON(w, r, http.StatusBadRequest, apiResponse{OK: false, Error: err.Error()})
		case errors.Is(err, ErrParallelNotFound):
			writeJSON(w, r, http.StatusNotFound, apiResponse{OK: false, Error: err.Error()})
		default:
			writeJSON(w, r, http.StatusInternalServerError, apiResponse{OK: false, Error: "internal error"})
		}
		return
	}

	writeJSON(w, r, http.StatusOK, apiResponse{OK: true, Data: map[string]string{"status": "deleted"}})
}

func (h *Handler) CreateReviewTask(w http.ResponseWriter, r *http.Request) {
	var req createReviewTaskRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, r, http.StatusBadRequest, apiResponse{OK: false, Error: "invalid request body"})
		return
	}

	item, err := h.svc.CreateReviewTask(r.Context(), CreateReviewTaskInput{
		QuestionVersionID: req.QuestionVersionID,
		ExamID:            req.ExamID,
		ReviewerID:        req.ReviewerID,
		Note:              req.Note,
	})
	if err != nil {
		switch {
		case errors.Is(err, ErrInvalidInput):
			writeJSON(w, r, http.StatusBadRequest, apiResponse{OK: false, Error: err.Error()})
		case errors.Is(err, ErrVersionNotFound), errors.Is(err, ErrExamNotFound):
			writeJSON(w, r, http.StatusNotFound, apiResponse{OK: false, Error: err.Error()})
		default:
			writeJSON(w, r, http.StatusInternalServerError, apiResponse{OK: false, Error: "internal error"})
		}
		return
	}
	writeJSON(w, r, http.StatusCreated, apiResponse{OK: true, Data: item})
}

func (h *Handler) DecideReviewTask(w http.ResponseWriter, r *http.Request) {
	user, ok := auth.CurrentUser(r.Context())
	if !ok {
		writeJSON(w, r, http.StatusUnauthorized, apiResponse{OK: false, Error: "unauthorized"})
		return
	}
	taskID, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil || taskID <= 0 {
		writeJSON(w, r, http.StatusBadRequest, apiResponse{OK: false, Error: "invalid review task id"})
		return
	}

	var req reviewDecisionRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, r, http.StatusBadRequest, apiResponse{OK: false, Error: "invalid request body"})
		return
	}

	item, err := h.svc.DecideReviewTask(r.Context(), ReviewDecisionInput{
		TaskID:       taskID,
		ReviewerID:   user.ID,
		IsPrivileged: user.Role == "admin" || user.Role == "proktor",
		Status:       req.Status,
		Note:         req.Note,
	})
	if err != nil {
		switch {
		case errors.Is(err, ErrInvalidInput):
			writeJSON(w, r, http.StatusBadRequest, apiResponse{OK: false, Error: err.Error()})
		case errors.Is(err, ErrReviewTaskNotFound):
			writeJSON(w, r, http.StatusNotFound, apiResponse{OK: false, Error: err.Error()})
		case errors.Is(err, ErrReviewForbidden):
			writeJSON(w, r, http.StatusForbidden, apiResponse{OK: false, Error: "forbidden"})
		default:
			writeJSON(w, r, http.StatusInternalServerError, apiResponse{OK: false, Error: "internal error"})
		}
		return
	}
	writeJSON(w, r, http.StatusOK, apiResponse{OK: true, Data: item})
}

func (h *Handler) ListReviewTasks(w http.ResponseWriter, r *http.Request) {
	user, ok := auth.CurrentUser(r.Context())
	if !ok {
		writeJSON(w, r, http.StatusUnauthorized, apiResponse{OK: false, Error: "unauthorized"})
		return
	}
	status := strings.TrimSpace(r.URL.Query().Get("status"))
	reviewerID := user.ID
	if user.Role == "admin" || user.Role == "proktor" {
		if raw := strings.TrimSpace(r.URL.Query().Get("reviewer_id")); raw != "" {
			if parsed, err := strconv.ParseInt(raw, 10, 64); err == nil && parsed > 0 {
				reviewerID = parsed
			}
		}
	}

	items, err := h.svc.ListReviewTasks(r.Context(), reviewerID, status)
	if err != nil {
		if errors.Is(err, ErrInvalidInput) {
			writeJSON(w, r, http.StatusBadRequest, apiResponse{OK: false, Error: err.Error()})
			return
		}
		writeJSON(w, r, http.StatusInternalServerError, apiResponse{OK: false, Error: "internal error"})
		return
	}
	writeJSON(w, r, http.StatusOK, apiResponse{OK: true, Data: items})
}

func (h *Handler) GetQuestionReviews(w http.ResponseWriter, r *http.Request) {
	questionID, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil || questionID <= 0 {
		writeJSON(w, r, http.StatusBadRequest, apiResponse{OK: false, Error: "invalid question id"})
		return
	}

	items, err := h.svc.GetQuestionReviews(r.Context(), questionID)
	if err != nil {
		if errors.Is(err, ErrInvalidInput) {
			writeJSON(w, r, http.StatusBadRequest, apiResponse{OK: false, Error: err.Error()})
			return
		}
		writeJSON(w, r, http.StatusInternalServerError, apiResponse{OK: false, Error: "internal error"})
		return
	}
	writeJSON(w, r, http.StatusOK, apiResponse{OK: true, Data: items})
}

func writeJSON(w http.ResponseWriter, r *http.Request, code int, payload apiResponse) {
	if payload.OK {
		apiresp.WriteOK(w, r, code, payload.Data)
		return
	}
	apiresp.WriteError(w, r, code, payload.Error)
}
