package question

import (
	"context"
	"encoding/base64"
	"encoding/csv"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"strconv"
	"strings"
	"time"

	"cbtlms/internal/app/apiresp"
	"cbtlms/internal/auth"
	"cbtlms/internal/media"

	"github.com/go-chi/chi/v5"
)

type Handler struct {
	svc   questionService
	media questionMediaService
}

type questionMediaService interface {
	DownloadQuestionImage(ctx context.Context, key string) (*media.ObjectResult, error)
}

type questionService interface {
	CreateStimulusGroup(ctx context.Context, in CreateStimulusGroupInput) (*StimulusGroup, error)
	ListStimulusGroups(ctx context.Context, subjectID int64, ownerID *int64) ([]StimulusGroup, error)
	UpdateStimulusGroup(ctx context.Context, in UpdateStimulusGroupInput) (*StimulusGroup, error)
	DeleteStimulusGroup(ctx context.Context, id int64, actorID int64, enforceOwner bool) error
	CreateQuestionCode(ctx context.Context, in CreateQuestionCodeInput) (*QuestionCode, error)
	ListQuestionCodes(ctx context.Context, subjectID int64, q string, ownerID *int64) ([]QuestionCode, error)
	UpdateQuestionCode(ctx context.Context, in UpdateQuestionCodeInput) (*QuestionCode, error)
	DeleteQuestionCode(ctx context.Context, id int64, actorID int64, enforceOwner bool) error
	CreateQuestion(ctx context.Context, in CreateQuestionInput) (*QuestionBlueprint, error)
	AssignQuestionCode(ctx context.Context, in AssignQuestionCodeInput) (*QuestionBlueprint, error)
	AssignQuestionLearningGoal(ctx context.Context, in AssignQuestionLearningGoalInput) (*QuestionBlueprint, error)
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
	GetQuestionExportData(ctx context.Context, questionID int64, versionNo int, ownerID *int64) (*ExportQuestionData, error)
	GetUserRole(ctx context.Context, userID int64) (string, error)
	CloneQuestion(ctx context.Context, in CloneQuestionInput) (*CloneQuestionResult, error)
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

type assignQuestionLearningGoalRequest struct {
	LearningGoalID int64 `json:"learning_goal_id"`
}

type createStimulusGroupRequest struct {
	SubjectID       int64           `json:"subject_id"`
	Title           string          `json:"title"`
	StimulusType    *string         `json:"stimulus_type"`
	StimulusContent json.RawMessage `json:"stimulus_content"`
	StimulusHTML    *string         `json:"stimulus_html"`
}

type updateStimulusGroupRequest struct {
	SubjectID       int64           `json:"subject_id"`
	Title           *string         `json:"title"`
	StimulusType    *string         `json:"stimulus_type"`
	StimulusContent json.RawMessage `json:"stimulus_content"`
	StimulusHTML    *string         `json:"stimulus_html"`
}

type createQuestionVersionRequest struct {
	StimulusGroupID *int64                `json:"stimulus_group_id"`
	StimulusType    *string               `json:"stimulus_type"`
	StimulusContent json.RawMessage       `json:"stimulus_content"`
	StimulusHTML    *string               `json:"stimulus_html"`
	StemHTML        *string               `json:"stem_html"`
	ExplanationHTML *string               `json:"explanation_html"`
	HintHTML        *string               `json:"hint_html"`
	QuestionContent json.RawMessage       `json:"question_content"`
	AnswerKey       json.RawMessage       `json:"answer_key"`
	Options         []QuestionOptionInput `json:"options"`
	DurationSeconds *int                  `json:"duration_seconds"`
	Weight          *float64              `json:"weight"`
	ChangeNote      *string               `json:"change_note"`
	Dedup           bool                  `json:"dedup"`
}

type updateQuestionVersionRequest struct {
	QuestionType    *string               `json:"question_type"`
	StimulusGroupID *int64                `json:"stimulus_group_id"`
	StimulusType    *string               `json:"stimulus_type"`
	StimulusContent json.RawMessage       `json:"stimulus_content"`
	StimulusHTML    *string               `json:"stimulus_html"`
	StemHTML        *string               `json:"stem_html"`
	ExplanationHTML *string               `json:"explanation_html"`
	HintHTML        *string               `json:"hint_html"`
	QuestionContent json.RawMessage       `json:"question_content"`
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

type exportQuestionItem struct {
	QuestionID int64 `json:"question_id"`
	VersionNo  int   `json:"version_no,omitempty"`
}

type exportQuestionsRequest struct {
	Items []exportQuestionItem `json:"items"`
}

type transferQuestionsRequest struct {
	Items           []exportQuestionItem `json:"items"`
	TargetUserID    int64                `json:"target_user_id"`
	TargetSubjectID int64                `json:"target_subject_id"`
}

func NewHandler(svc *Service, mediaSvc ...questionMediaService) *Handler {
	h := &Handler{svc: svc}
	if len(mediaSvc) > 0 {
		h.media = mediaSvc[0]
	}
	return h
}

func (h *Handler) ListStimulusGroups(w http.ResponseWriter, r *http.Request) {
	user, ok := auth.CurrentUser(r.Context())
	if !ok {
		writeJSON(w, r, http.StatusUnauthorized, apiResponse{OK: false, Error: "unauthorized"})
		return
	}
	var subjectID int64
	if raw := strings.TrimSpace(r.URL.Query().Get("subject_id")); raw != "" {
		parsed, err := strconv.ParseInt(raw, 10, 64)
		if err != nil || parsed <= 0 {
			writeJSON(w, r, http.StatusBadRequest, apiResponse{OK: false, Error: "subject_id must be positive"})
			return
		}
		subjectID = parsed
	}
	var ownerID *int64
	if strings.EqualFold(strings.TrimSpace(user.Role), "guru") {
		ownerID = &user.ID
	}
	items, err := h.svc.ListStimulusGroups(r.Context(), subjectID, ownerID)
	if err != nil {
		writeJSON(w, r, http.StatusInternalServerError, apiResponse{OK: false, Error: "internal error"})
		return
	}
	writeJSON(w, r, http.StatusOK, apiResponse{OK: true, Data: items})
}

func (h *Handler) CreateStimulusGroup(w http.ResponseWriter, r *http.Request) {
	user, ok := auth.CurrentUser(r.Context())
	if !ok {
		writeJSON(w, r, http.StatusUnauthorized, apiResponse{OK: false, Error: "unauthorized"})
		return
	}
	var req createStimulusGroupRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, r, http.StatusBadRequest, apiResponse{OK: false, Error: "invalid request body"})
		return
	}
	item, err := h.svc.CreateStimulusGroup(r.Context(), CreateStimulusGroupInput{
		SubjectID:       req.SubjectID,
		Title:           req.Title,
		StimulusType:    req.StimulusType,
		StimulusContent: req.StimulusContent,
		StimulusHTML:    req.StimulusHTML,
		CreatedBy:       user.ID,
		EnforceOwner:    strings.EqualFold(strings.TrimSpace(user.Role), "guru"),
	})
	if err != nil {
		switch {
		case errors.Is(err, ErrInvalidInput):
			writeJSON(w, r, http.StatusBadRequest, apiResponse{OK: false, Error: err.Error()})
		case errors.Is(err, ErrSubjectNotFound):
			writeJSON(w, r, http.StatusNotFound, apiResponse{OK: false, Error: err.Error()})
		case errors.Is(err, ErrForbidden):
			writeJSON(w, r, http.StatusForbidden, apiResponse{OK: false, Error: err.Error()})
		default:
			writeJSON(w, r, http.StatusInternalServerError, apiResponse{OK: false, Error: "internal error"})
		}
		return
	}
	writeJSON(w, r, http.StatusCreated, apiResponse{OK: true, Data: item})
}

func (h *Handler) UpdateStimulusGroup(w http.ResponseWriter, r *http.Request) {
	user, ok := auth.CurrentUser(r.Context())
	if !ok {
		writeJSON(w, r, http.StatusUnauthorized, apiResponse{OK: false, Error: "unauthorized"})
		return
	}
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil || id <= 0 {
		writeJSON(w, r, http.StatusBadRequest, apiResponse{OK: false, Error: "invalid stimulus group id"})
		return
	}
	var req updateStimulusGroupRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, r, http.StatusBadRequest, apiResponse{OK: false, Error: "invalid request body"})
		return
	}
	item, err := h.svc.UpdateStimulusGroup(r.Context(), UpdateStimulusGroupInput{
		ID:              id,
		SubjectID:       req.SubjectID,
		Title:           req.Title,
		StimulusType:    req.StimulusType,
		StimulusContent: req.StimulusContent,
		StimulusHTML:    req.StimulusHTML,
		ActorID:         user.ID,
		EnforceOwner:    strings.EqualFold(strings.TrimSpace(user.Role), "guru"),
	})
	if err != nil {
		switch {
		case errors.Is(err, ErrInvalidInput):
			writeJSON(w, r, http.StatusBadRequest, apiResponse{OK: false, Error: err.Error()})
		case errors.Is(err, ErrStimulusGroupNotFound), errors.Is(err, ErrSubjectNotFound):
			writeJSON(w, r, http.StatusNotFound, apiResponse{OK: false, Error: err.Error()})
		case errors.Is(err, ErrForbidden):
			writeJSON(w, r, http.StatusForbidden, apiResponse{OK: false, Error: err.Error()})
		default:
			writeJSON(w, r, http.StatusInternalServerError, apiResponse{OK: false, Error: "internal error"})
		}
		return
	}
	writeJSON(w, r, http.StatusOK, apiResponse{OK: true, Data: item})
}

func (h *Handler) DeleteStimulusGroup(w http.ResponseWriter, r *http.Request) {
	user, ok := auth.CurrentUser(r.Context())
	if !ok {
		writeJSON(w, r, http.StatusUnauthorized, apiResponse{OK: false, Error: "unauthorized"})
		return
	}
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil || id <= 0 {
		writeJSON(w, r, http.StatusBadRequest, apiResponse{OK: false, Error: "invalid stimulus group id"})
		return
	}
	if err := h.svc.DeleteStimulusGroup(r.Context(), id, user.ID, strings.EqualFold(strings.TrimSpace(user.Role), "guru")); err != nil {
		switch {
		case errors.Is(err, ErrInvalidInput):
			writeJSON(w, r, http.StatusBadRequest, apiResponse{OK: false, Error: err.Error()})
		case errors.Is(err, ErrStimulusGroupNotFound):
			writeJSON(w, r, http.StatusNotFound, apiResponse{OK: false, Error: err.Error()})
		case errors.Is(err, ErrForbidden):
			writeJSON(w, r, http.StatusForbidden, apiResponse{OK: false, Error: err.Error()})
		default:
			writeJSON(w, r, http.StatusInternalServerError, apiResponse{OK: false, Error: "internal error"})
		}
		return
	}
	writeJSON(w, r, http.StatusOK, apiResponse{OK: true, Data: map[string]any{"deleted": true}})
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

func (h *Handler) AssignQuestionLearningGoal(w http.ResponseWriter, r *http.Request) {
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

	var req assignQuestionLearningGoalRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, r, http.StatusBadRequest, apiResponse{OK: false, Error: "invalid request body"})
		return
	}

	item, err := h.svc.AssignQuestionLearningGoal(r.Context(), AssignQuestionLearningGoalInput{
		QuestionID:     questionID,
		LearningGoalID: req.LearningGoalID,
		ActorID:        user.ID,
		EnforceOwner:   strings.EqualFold(strings.TrimSpace(user.Role), "guru"),
	})
	if err != nil {
		switch {
		case errors.Is(err, ErrInvalidInput):
			writeJSON(w, r, http.StatusBadRequest, apiResponse{OK: false, Error: err.Error()})
		case errors.Is(err, ErrForbidden):
			writeJSON(w, r, http.StatusForbidden, apiResponse{OK: false, Error: err.Error()})
		case errors.Is(err, ErrQuestionNotFound), errors.Is(err, ErrLearningGoalNotFound), errors.Is(err, ErrSubjectNotFound):
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

func (h *Handler) ExportQuestions(w http.ResponseWriter, r *http.Request) {
	user, ok := auth.CurrentUser(r.Context())
	if !ok {
		writeJSON(w, r, http.StatusUnauthorized, apiResponse{OK: false, Error: "unauthorized"})
		return
	}
	var req exportQuestionsRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, r, http.StatusBadRequest, apiResponse{OK: false, Error: "invalid request body"})
		return
	}
	if len(req.Items) == 0 {
		writeJSON(w, r, http.StatusBadRequest, apiResponse{OK: false, Error: "items is required"})
		return
	}
	var ownerID *int64
	if strings.EqualFold(strings.TrimSpace(user.Role), "guru") {
		ownerID = &user.ID
	}
	format := strings.ToLower(strings.TrimSpace(r.URL.Query().Get("format")))
	if format == "" {
		format = "csv"
	}
	rows := make([][]string, 0, len(req.Items)+1)
	if format == "csv" {
		rows = append(rows, []string{
			"Mapel",
			"Kode Soal",
			"Kode TP",
			"Nama Kode",
			"Stimulus",
			"Soal",
			"Opsi",
			"Kunci Jawaban",
			"Penjelasan",
			"Hint",
			"Tujuan Pembelajaran",
			"Materi",
			"Kelas",
			"Semester",
		})
	}
	blocks := make([]string, 0, len(req.Items))
	for _, it := range req.Items {
		if it.QuestionID <= 0 {
			writeJSON(w, r, http.StatusBadRequest, apiResponse{OK: false, Error: "invalid question id"})
			return
		}
		data, err := h.svc.GetQuestionExportData(r.Context(), it.QuestionID, it.VersionNo, ownerID)
		if err != nil {
			switch {
			case errors.Is(err, ErrForbidden):
				writeJSON(w, r, http.StatusForbidden, apiResponse{OK: false, Error: err.Error()})
			case errors.Is(err, ErrQuestionNotFound), errors.Is(err, ErrVersionNotFound):
				writeJSON(w, r, http.StatusNotFound, apiResponse{OK: false, Error: err.Error()})
			default:
				writeJSON(w, r, http.StatusInternalServerError, apiResponse{OK: false, Error: "internal error"})
			}
			return
		}
		switch format {
		case "csv":
			row, err := h.buildExportRow(r.Context(), data)
			if err != nil {
				writeJSON(w, r, http.StatusInternalServerError, apiResponse{OK: false, Error: "gagal menyiapkan export gambar"})
				return
			}
			rows = append(rows, row)
		case "txt":
			block, err := h.buildExportBlock(r.Context(), data)
			if err != nil {
				writeJSON(w, r, http.StatusInternalServerError, apiResponse{OK: false, Error: "gagal menyiapkan export gambar"})
				return
			}
			blocks = append(blocks, block)
		default:
			writeJSON(w, r, http.StatusBadRequest, apiResponse{OK: false, Error: "format harus csv atau txt"})
			return
		}
	}

	switch format {
	case "csv":
		w.Header().Set("Content-Type", "text/csv; charset=utf-8")
		w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=\"naskah_soal_%s.csv\"", time.Now().Format("20060102")))
		w.WriteHeader(http.StatusOK)
		writer := csv.NewWriter(w)
		_ = writer.WriteAll(rows)
		writer.Flush()
	case "txt":
		w.Header().Set("Content-Type", "text/plain; charset=utf-8")
		w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=\"naskah_soal_%s.txt\"", time.Now().Format("20060102")))
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(strings.Join(blocks, "\n\n")))
	}
}

func (h *Handler) TransferQuestions(w http.ResponseWriter, r *http.Request) {
	user, ok := auth.CurrentUser(r.Context())
	if !ok {
		writeJSON(w, r, http.StatusUnauthorized, apiResponse{OK: false, Error: "unauthorized"})
		return
	}
	var req transferQuestionsRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, r, http.StatusBadRequest, apiResponse{OK: false, Error: "invalid request body"})
		return
	}
	if len(req.Items) == 0 {
		writeJSON(w, r, http.StatusBadRequest, apiResponse{OK: false, Error: "items is required"})
		return
	}
	if req.TargetUserID <= 0 || req.TargetSubjectID <= 0 {
		writeJSON(w, r, http.StatusBadRequest, apiResponse{OK: false, Error: "target_user_id dan target_subject_id wajib diisi"})
		return
	}
	role, err := h.svc.GetUserRole(r.Context(), req.TargetUserID)
	if err != nil {
		if errors.Is(err, ErrUserNotFound) {
			writeJSON(w, r, http.StatusNotFound, apiResponse{OK: false, Error: "target user not found"})
			return
		}
		writeJSON(w, r, http.StatusInternalServerError, apiResponse{OK: false, Error: "internal error"})
		return
	}
	if !strings.EqualFold(strings.TrimSpace(role), "guru") {
		writeJSON(w, r, http.StatusBadRequest, apiResponse{OK: false, Error: "target user harus berperan guru"})
		return
	}

	var ownerID *int64
	if strings.EqualFold(strings.TrimSpace(user.Role), "guru") {
		ownerID = &user.ID
	}

	report := map[string]any{
		"total_items":   len(req.Items),
		"success_items": 0,
		"failed_items":  0,
		"errors":        []map[string]any{},
		"question_ids":  []int64{},
	}
	for _, it := range req.Items {
		if it.QuestionID <= 0 {
			report["failed_items"] = report["failed_items"].(int) + 1
			continue
		}
		data, err := h.svc.GetQuestionExportData(r.Context(), it.QuestionID, it.VersionNo, ownerID)
		if err != nil {
			report["failed_items"] = report["failed_items"].(int) + 1
			report["errors"] = append(report["errors"].([]map[string]any), map[string]any{
				"question_id": it.QuestionID,
				"error":       err.Error(),
			})
			continue
		}
		out, err := h.svc.CloneQuestion(r.Context(), CloneQuestionInput{
			Source:          data,
			TargetUserID:    req.TargetUserID,
			TargetSubjectID: req.TargetSubjectID,
			TargetRole:      role,
		})
		if err != nil {
			report["failed_items"] = report["failed_items"].(int) + 1
			report["errors"] = append(report["errors"].([]map[string]any), map[string]any{
				"question_id": it.QuestionID,
				"error":       err.Error(),
			})
			continue
		}
		report["success_items"] = report["success_items"].(int) + 1
		report["question_ids"] = append(report["question_ids"].([]int64), out.QuestionID)
	}

	writeJSON(w, r, http.StatusOK, apiResponse{OK: true, Data: report})
}

var exportImageTagPattern = regexp.MustCompile(`(?is)<img[^>]*\bsrc\s*=\s*["']([^"']+)["'][^>]*>`)

func (h *Handler) buildExportRow(ctx context.Context, data *ExportQuestionData) ([]string, error) {
	mapel := strings.TrimSpace(data.SubjectName)
	kodeSoal := strings.TrimSpace(data.QuestionCode)
	kodeTP := ""
	if data.LearningGoalID > 0 {
		kodeTP = fmt.Sprintf("TP-%d", data.LearningGoalID)
	}
	namaKode := strings.TrimSpace(data.QuestionCodeName)
	stimulus, err := h.serializeImportText(ctx, ptrString(data.StimulusHTML), true)
	if err != nil {
		return nil, err
	}
	soal, err := h.serializeImportText(ctx, data.StemHTML, true)
	if err != nil {
		return nil, err
	}
	penjelasan, err := h.serializeImportText(ctx, ptrString(data.ExplanationHTML), true)
	if err != nil {
		return nil, err
	}
	hint, err := h.serializeImportText(ctx, ptrString(data.HintHTML), true)
	if err != nil {
		return nil, err
	}
	opsi, err := h.buildExportOptions(ctx, data)
	if err != nil {
		return nil, err
	}
	kunci := buildExportAnswerKey(data)
	return []string{
		mapel,
		kodeSoal,
		kodeTP,
		namaKode,
		stimulus,
		soal,
		opsi,
		kunci,
		penjelasan,
		hint,
		strings.TrimSpace(data.LearningGoalText),
		strings.TrimSpace(data.LearningGoalMateri),
		strings.TrimSpace(data.LearningGoalKelas),
		formatSemester(data.LearningGoalSemester),
	}, nil
}

func (h *Handler) buildExportBlock(ctx context.Context, data *ExportQuestionData) (string, error) {
	lines := []string{
		"TYPE: " + exportQuestionTypeCode(data.QuestionType),
		"Mapel: " + strings.TrimSpace(data.SubjectName),
		"KodeSoal: " + strings.TrimSpace(data.QuestionCode),
		"NamaKode: " + strings.TrimSpace(data.QuestionCodeName),
	}
	stimulus, err := h.serializeImportText(ctx, ptrString(data.StimulusHTML), false)
	if err != nil {
		return "", err
	}
	if stimulus != "" {
		lines = append(lines, "S: "+stimulus)
	}
	soal, err := h.serializeImportText(ctx, data.StemHTML, false)
	if err != nil {
		return "", err
	}
	lines = append(lines, "Q: "+soal)
	bodyLines, err := h.buildExportBodyLines(ctx, data)
	if err != nil {
		return "", err
	}
	lines = append(lines, bodyLines...)
	lines = append(lines, "Kunci Jawaban: "+buildExportAnswerKey(data))
	explanation, err := h.serializeImportText(ctx, ptrString(data.ExplanationHTML), false)
	if err != nil {
		return "", err
	}
	if explanation != "" {
		lines = append(lines, "Penjelasan: "+explanation)
	}
	hint, err := h.serializeImportText(ctx, ptrString(data.HintHTML), false)
	if err != nil {
		return "", err
	}
	if hint != "" {
		lines = append(lines, "Hint: "+hint)
	}
	return strings.Join(lines, "\n"), nil
}

func exportQuestionTypeCode(questionType string) string {
	switch strings.TrimSpace(strings.ToLower(questionType)) {
	case "pg_tunggal":
		return "MC"
	case "multi_jawaban":
		return "MR"
	case "benar_salah_pernyataan":
		return "TF"
	case "menjodohkan_drag_drop":
		return "MATCH"
	case "short_answer":
		return "SA"
	default:
		return strings.ToUpper(strings.TrimSpace(questionType))
	}
}

func (h *Handler) buildExportBodyLines(ctx context.Context, data *ExportQuestionData) ([]string, error) {
	qType := strings.TrimSpace(strings.ToLower(data.QuestionType))
	switch qType {
	case "benar_salah_pernyataan":
		statements := extractTFStatements(data.AnswerKey)
		lines := make([]string, 0, len(statements))
		for i, st := range statements {
			text, err := h.serializeImportText(ctx, st, false)
			if err != nil {
				return nil, err
			}
			if strings.TrimSpace(text) == "" {
				continue
			}
			lines = append(lines, fmt.Sprintf("P%d: %s", i+1, text))
		}
		return lines, nil
	case "menjodohkan_drag_drop":
		return h.buildExportMatchingLines(ctx, data.QuestionContent)
	case "short_answer":
		return nil, nil
	default:
		lines := make([]string, 0, len(data.Options))
		for i, opt := range data.Options {
			key := strings.TrimSpace(opt.OptionKey)
			if key == "" {
				key = string(rune('A' + i))
			}
			text, err := h.serializeImportText(ctx, opt.OptionHTML, false)
			if err != nil {
				return nil, err
			}
			if text == "" {
				continue
			}
			lines = append(lines, strings.ToUpper(key)+": "+text)
		}
		return lines, nil
	}
}

func (h *Handler) buildExportMatchingLines(ctx context.Context, raw json.RawMessage) ([]string, error) {
	var payload struct {
		Prompts []struct {
			HTML string `json:"html"`
		} `json:"prompts"`
		Choices []struct {
			HTML string `json:"html"`
		} `json:"choices"`
	}
	if json.Unmarshal(raw, &payload) != nil {
		return nil, nil
	}
	lines := make([]string, 0, len(payload.Prompts)+len(payload.Choices))
	for i, prompt := range payload.Prompts {
		text, err := h.serializeImportText(ctx, prompt.HTML, false)
		if err != nil {
			return nil, err
		}
		if text == "" {
			continue
		}
		lines = append(lines, fmt.Sprintf("P%d: %s", i+1, text))
	}
	for i, choice := range payload.Choices {
		text, err := h.serializeImportText(ctx, choice.HTML, false)
		if err != nil {
			return nil, err
		}
		if text == "" {
			continue
		}
		lines = append(lines, fmt.Sprintf("%s: %s", string(rune('A'+i)), text))
	}
	return lines, nil
}

func buildExportMatchingAnswerKey(questionContent, answerKey json.RawMessage) string {
	var content struct {
		Prompts []struct {
			ID string `json:"id"`
		} `json:"prompts"`
		Choices []struct {
			ID string `json:"id"`
		} `json:"choices"`
	}
	var payload struct {
		Pairs []struct {
			PromptID string `json:"prompt_id"`
			ChoiceID string `json:"choice_id"`
		} `json:"pairs"`
	}
	if json.Unmarshal(questionContent, &content) != nil || json.Unmarshal(answerKey, &payload) != nil {
		return ""
	}
	promptMap := make(map[string]string, len(content.Prompts))
	choiceMap := make(map[string]string, len(content.Choices))
	for i, prompt := range content.Prompts {
		id := strings.TrimSpace(prompt.ID)
		if id == "" {
			continue
		}
		promptMap[id] = fmt.Sprintf("P%d", i+1)
	}
	for i, choice := range content.Choices {
		id := strings.TrimSpace(choice.ID)
		if id == "" {
			continue
		}
		choiceMap[id] = string(rune('A' + i))
	}
	pairs := make([]string, 0, len(payload.Pairs))
	for _, pair := range payload.Pairs {
		promptID := promptMap[strings.TrimSpace(pair.PromptID)]
		choiceID := choiceMap[strings.TrimSpace(pair.ChoiceID)]
		if promptID == "" || choiceID == "" {
			continue
		}
		pairs = append(pairs, promptID+"->"+choiceID)
	}
	return strings.Join(pairs, ", ")
}

func ptrString(val *string) string {
	if val == nil {
		return ""
	}
	return *val
}

func formatSemester(sem int16) string {
	if sem <= 0 {
		return ""
	}
	return strconv.FormatInt(int64(sem), 10)
}

func stripHTML(raw string) string {
	text := strings.TrimSpace(raw)
	if text == "" {
		return ""
	}
	replacer := strings.NewReplacer(
		"<br>", "\n",
		"<br/>", "\n",
		"<br />", "\n",
		"</p>", "\n",
		"</div>", "\n",
		"</li>", "\n",
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
	out := htmlUnescape(b.String())
	out = strings.ReplaceAll(out, "\u00a0", " ")
	lines := strings.Split(out, "\n")
	clean := make([]string, 0, len(lines))
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		clean = append(clean, line)
	}
	return strings.Join(clean, "\n")
}

func htmlUnescape(raw string) string {
	return strings.NewReplacer(
		"&nbsp;", " ",
		"&amp;", "&",
		"&lt;", "<",
		"&gt;", ">",
		"&#39;", "'",
		"&quot;", "\"",
	).Replace(raw)
}

func (h *Handler) serializeImportText(ctx context.Context, raw string, singleLine bool) (string, error) {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return "", nil
	}
	textWithTokens, err := h.replaceImageTagsWithTokens(ctx, trimmed)
	if err != nil {
		return "", err
	}
	out := stripHTML(textWithTokens)
	if singleLine {
		out = strings.Join(strings.Fields(out), " ")
	}
	return out, nil
}

func (h *Handler) replaceImageTagsWithTokens(ctx context.Context, raw string) (string, error) {
	matches := exportImageTagPattern.FindAllStringSubmatchIndex(raw, -1)
	if len(matches) == 0 {
		return raw, nil
	}
	var b strings.Builder
	last := 0
	for _, match := range matches {
		b.WriteString(raw[last:match[0]])
		src := raw[match[2]:match[3]]
		token, err := h.encodeImageSource(ctx, src)
		if err != nil {
			return "", err
		}
		if token != "" {
			b.WriteString("\n")
			b.WriteString(token)
			b.WriteString("\n")
		}
		last = match[1]
	}
	b.WriteString(raw[last:])
	return b.String(), nil
}

func (h *Handler) encodeImageSource(ctx context.Context, src string) (string, error) {
	normalized := strings.TrimSpace(src)
	if normalized == "" {
		return "", nil
	}
	if strings.HasPrefix(strings.ToLower(normalized), "data:image/") {
		return encodeImageToken(normalized), nil
	}
	key := mediaObjectKeyFromSrc(normalized)
	if key == "" {
		return "", nil
	}
	if h.media == nil {
		return "", fmt.Errorf("media service unavailable for export image")
	}
	obj, err := h.media.DownloadQuestionImage(ctx, key)
	if err != nil {
		return "", err
	}
	defer obj.Reader.Close()
	raw, err := io.ReadAll(io.LimitReader(obj.Reader, media.QuestionImageMaxBytes+1))
	if err != nil {
		return "", err
	}
	if len(raw) == 0 || len(raw) > media.QuestionImageMaxBytes {
		return "", nil
	}
	contentType := strings.TrimSpace(obj.ContentType)
	if contentType == "" {
		contentType = http.DetectContentType(raw)
	}
	if !strings.HasPrefix(strings.ToLower(contentType), "image/") {
		return "", nil
	}
	dataURL := "data:" + contentType + ";base64," + base64.StdEncoding.EncodeToString(raw)
	return encodeImageToken(dataURL), nil
}

func encodeImageToken(dataURL string) string {
	return "[[CBTIMG:" + base64.RawURLEncoding.EncodeToString([]byte(dataURL)) + "]]"
}

func mediaObjectKeyFromSrc(src string) string {
	parsed, err := url.Parse(strings.TrimSpace(src))
	if err != nil {
		return ""
	}
	pathValue := parsed.Path
	if pathValue == "" {
		pathValue = src
	}
	const prefix = "/api/v1/media/question-images/"
	if strings.HasPrefix(pathValue, prefix) {
		return strings.TrimPrefix(pathValue, prefix)
	}
	return ""
}

func (h *Handler) buildExportOptions(ctx context.Context, data *ExportQuestionData) (string, error) {
	qType := strings.ToLower(strings.TrimSpace(data.QuestionType))
	if qType == "benar_salah_pernyataan" {
		statements := extractTFStatements(data.AnswerKey)
		parts := make([]string, 0, len(statements))
		for i, st := range statements {
			text, err := h.serializeImportText(ctx, st, true)
			if err != nil {
				return "", err
			}
			label := fmt.Sprintf("P%d. %s", i+1, text)
			parts = append(parts, label)
		}
		return strings.Join(parts, ", "), nil
	}
	if qType == "menjodohkan_drag_drop" {
		var payload struct {
			Prompts []struct {
				ID   string `json:"id"`
				HTML string `json:"html"`
			} `json:"prompts"`
			Choices []struct {
				ID   string `json:"id"`
				HTML string `json:"html"`
			} `json:"choices"`
		}
		if json.Unmarshal(data.QuestionContent, &payload) == nil {
			prompts := make([]string, 0, len(payload.Prompts))
			for i, it := range payload.Prompts {
				txt, err := h.serializeImportText(ctx, it.HTML, true)
				if err != nil {
					return "", err
				}
				if txt != "" {
					prompts = append(prompts, fmt.Sprintf("P%d. %s", i+1, txt))
				}
			}
			choices := make([]string, 0, len(payload.Choices))
			for i, it := range payload.Choices {
				txt, err := h.serializeImportText(ctx, it.HTML, true)
				if err != nil {
					return "", err
				}
				if txt != "" {
					choices = append(choices, fmt.Sprintf("%s. %s", string(rune('A'+i)), txt))
				}
			}
			return "Prompts: " + strings.Join(prompts, "; ") + " | Choices: " + strings.Join(choices, "; "), nil
		}
		return "", nil
	}
	if qType == "short_answer" {
		return "Jawaban singkat", nil
	}
	parts := make([]string, 0, len(data.Options))
	for i, opt := range data.Options {
		key := strings.TrimSpace(opt.OptionKey)
		if key == "" {
			key = string(rune('A' + i))
		}
		text, err := h.serializeImportText(ctx, opt.OptionHTML, true)
		if err != nil {
			return "", err
		}
		if text == "" {
			continue
		}
		parts = append(parts, fmt.Sprintf("%s. %s", strings.ToUpper(key), text))
	}
	return strings.Join(parts, ", "), nil
}

func buildExportAnswerKey(data *ExportQuestionData) string {
	qType := strings.ToLower(strings.TrimSpace(data.QuestionType))
	key := strings.TrimSpace(string(data.AnswerKey))
	if key == "" || key == "null" {
		return ""
	}
	if qType == "pg_tunggal" {
		var payload struct {
			Correct string `json:"correct"`
		}
		if json.Unmarshal(data.AnswerKey, &payload) == nil {
			return strings.ToUpper(strings.TrimSpace(payload.Correct))
		}
		return ""
	}
	if qType == "multi_jawaban" {
		var payload struct {
			Correct []string `json:"correct"`
		}
		if json.Unmarshal(data.AnswerKey, &payload) == nil {
			keys := make([]string, 0, len(payload.Correct))
			for _, v := range payload.Correct {
				v = strings.ToUpper(strings.TrimSpace(v))
				if v != "" {
					keys = append(keys, v)
				}
			}
			return strings.Join(keys, ",")
		}
		return ""
	}
	if qType == "benar_salah_pernyataan" {
		var payload struct {
			Statements []struct {
				Correct bool `json:"correct"`
			} `json:"statements"`
		}
		if json.Unmarshal(data.AnswerKey, &payload) == nil {
			vals := make([]string, 0, len(payload.Statements))
			for _, st := range payload.Statements {
				if st.Correct {
					vals = append(vals, "T")
				} else {
					vals = append(vals, "F")
				}
			}
			return strings.Join(vals, ",")
		}
	}
	if qType == "menjodohkan_drag_drop" {
		return buildExportMatchingAnswerKey(data.QuestionContent, data.AnswerKey)
	}
	if qType == "short_answer" {
		var payload struct {
			AcceptedAnswers []string `json:"accepted_answers"`
		}
		if json.Unmarshal(data.AnswerKey, &payload) == nil {
			vals := make([]string, 0, len(payload.AcceptedAnswers))
			for _, v := range payload.AcceptedAnswers {
				v = strings.TrimSpace(v)
				if v != "" {
					vals = append(vals, v)
				}
			}
			return strings.Join(vals, " | ")
		}
	}
	return ""
}

func extractTFStatements(raw json.RawMessage) []string {
	var payload struct {
		Statements []struct {
			Statement string `json:"statement"`
		} `json:"statements"`
	}
	if json.Unmarshal(raw, &payload) != nil {
		return nil
	}
	items := make([]string, 0, len(payload.Statements))
	for _, st := range payload.Statements {
		items = append(items, strings.TrimSpace(st.Statement))
	}
	return items
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
		StimulusGroupID: req.StimulusGroupID,
		StimulusType:    req.StimulusType,
		StimulusContent: req.StimulusContent,
		StimulusHTML:    req.StimulusHTML,
		StemHTML:        req.StemHTML,
		ExplanationHTML: req.ExplanationHTML,
		HintHTML:        req.HintHTML,
		QuestionContent: req.QuestionContent,
		AnswerKey:       req.AnswerKey,
		Options:         req.Options,
		DurationSeconds: req.DurationSeconds,
		Weight:          req.Weight,
		ChangeNote:      req.ChangeNote,
		CreatedBy:       user.ID,
		EnforceOwner:    strings.EqualFold(strings.TrimSpace(user.Role), "guru"),
		Dedup:           req.Dedup,
	})
	if err != nil {
		var dupErr *DuplicateQuestionError
		if errors.As(err, &dupErr) {
			writeJSON(w, r, http.StatusOK, apiResponse{
				OK: true,
				Data: map[string]any{
					"deduped":              true,
					"existing_question_id": dupErr.ExistingQuestionID,
					"question_id":          dupErr.ExistingQuestionID,
				},
			})
			return
		}
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
		QuestionType:    req.QuestionType,
		StimulusGroupID: req.StimulusGroupID,
		StimulusType:    req.StimulusType,
		StimulusContent: req.StimulusContent,
		StimulusHTML:    req.StimulusHTML,
		StemHTML:        req.StemHTML,
		ExplanationHTML: req.ExplanationHTML,
		HintHTML:        req.HintHTML,
		QuestionContent: req.QuestionContent,
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
