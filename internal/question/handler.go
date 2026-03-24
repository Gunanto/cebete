package question

import (
	"context"
	"encoding/csv"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

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

type createQuestionVersionRequest struct {
	StimulusType    *string               `json:"stimulus_type"`
	StimulusContent json.RawMessage       `json:"stimulus_content"`
	StimulusHTML    *string               `json:"stimulus_html"`
	StemHTML        *string               `json:"stem_html"`
	ExplanationHTML *string               `json:"explanation_html"`
	HintHTML        *string               `json:"hint_html"`
	AnswerKey       json.RawMessage       `json:"answer_key"`
	Options         []QuestionOptionInput `json:"options"`
	DurationSeconds *int                  `json:"duration_seconds"`
	Weight          *float64              `json:"weight"`
	ChangeNote      *string               `json:"change_note"`
	Dedup           bool                  `json:"dedup"`
}

type updateQuestionVersionRequest struct {
	StimulusType    *string               `json:"stimulus_type"`
	StimulusContent json.RawMessage       `json:"stimulus_content"`
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
	rows := make([][]string, 0, len(req.Items)+1)
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
		rows = append(rows, buildExportRow(data))
	}

	w.Header().Set("Content-Type", "text/csv; charset=utf-8")
	w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=\"naskah_soal_%s.csv\"", time.Now().Format("20060102")))
	w.WriteHeader(http.StatusOK)
	writer := csv.NewWriter(w)
	_ = writer.WriteAll(rows)
	writer.Flush()
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

func buildExportRow(data *ExportQuestionData) []string {
	mapel := strings.TrimSpace(data.SubjectName)
	kodeSoal := strings.TrimSpace(data.QuestionCode)
	kodeTP := ""
	if data.LearningGoalID > 0 {
		kodeTP = fmt.Sprintf("TP-%d", data.LearningGoalID)
	}
	namaKode := strings.TrimSpace(data.QuestionCodeName)
	stimulus := stripHTML(ptrString(data.StimulusHTML))
	soal := stripHTML(data.StemHTML)
	penjelasan := stripHTML(ptrString(data.ExplanationHTML))
	hint := stripHTML(ptrString(data.HintHTML))
	opsi := buildExportOptions(data)
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
	}
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

func buildExportOptions(data *ExportQuestionData) string {
	qType := strings.ToLower(strings.TrimSpace(data.QuestionType))
	if qType == "benar_salah_pernyataan" {
		statements := extractTFStatements(data.AnswerKey)
		parts := make([]string, 0, len(statements))
		for i, st := range statements {
			label := fmt.Sprintf("P%d. %s", i+1, st)
			parts = append(parts, label)
		}
		return strings.Join(parts, ", ")
	}
	parts := make([]string, 0, len(data.Options))
	for i, opt := range data.Options {
		key := strings.TrimSpace(opt.OptionKey)
		if key == "" {
			key = string(rune('A' + i))
		}
		text := stripHTML(opt.OptionHTML)
		if text == "" {
			continue
		}
		parts = append(parts, fmt.Sprintf("%s. %s", strings.ToUpper(key), text))
	}
	return strings.Join(parts, ", ")
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
		items = append(items, stripHTML(st.Statement))
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
		StimulusType:    req.StimulusType,
		StimulusContent: req.StimulusContent,
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
		StimulusType:    req.StimulusType,
		StimulusContent: req.StimulusContent,
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
