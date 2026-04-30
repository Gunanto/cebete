package question

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"cbtlms/internal/auth"
	mediasvc "cbtlms/internal/media"

	"github.com/go-chi/chi/v5"
)

type mockQuestionService struct {
	createStimulusGroupFn   func(ctx context.Context, in CreateStimulusGroupInput) (*StimulusGroup, error)
	listStimulusGroupsFn    func(ctx context.Context, subjectID int64, ownerID *int64) ([]StimulusGroup, error)
	updateStimulusGroupFn   func(ctx context.Context, in UpdateStimulusGroupInput) (*StimulusGroup, error)
	deleteStimulusGroupFn   func(ctx context.Context, id int64, actorID int64, enforceOwner bool) error
	createQuestionCodeFn    func(ctx context.Context, in CreateQuestionCodeInput) (*QuestionCode, error)
	listQuestionCodesFn     func(ctx context.Context, subjectID int64, q string, ownerID *int64) ([]QuestionCode, error)
	updateQuestionCodeFn    func(ctx context.Context, in UpdateQuestionCodeInput) (*QuestionCode, error)
	deleteQuestionCodeFn    func(ctx context.Context, id int64, actorID int64, enforceOwner bool) error
	createQuestionFn        func(ctx context.Context, in CreateQuestionInput) (*QuestionBlueprint, error)
	assignQuestionCodeFn    func(ctx context.Context, in AssignQuestionCodeInput) (*QuestionBlueprint, error)
	assignLearningGoalFn    func(ctx context.Context, in AssignQuestionLearningGoalInput) (*QuestionBlueprint, error)
	listQuestionsFn         func(ctx context.Context, subjectID int64, ownerID *int64) ([]QuestionBlueprint, error)
	createVersionFn         func(ctx context.Context, in CreateQuestionVersionInput) (*QuestionVersion, error)
	updateVersionFn         func(ctx context.Context, in UpdateQuestionVersionInput) (*QuestionVersion, error)
	deleteVersionFn         func(ctx context.Context, questionID int64, versionNo int, actorID int64, enforceOwner bool) error
	finalizeFn              func(ctx context.Context, questionID int64, versionNo int, actorID int64, enforceOwner bool) (*QuestionVersion, error)
	requestReopenFn         func(ctx context.Context, in RequestReopenFinalInput) (*ReopenFinalRequest, error)
	approveReopenFn         func(ctx context.Context, in ApproveReopenFinalInput) (*ReopenFinalRequest, error)
	listVersionsFn          func(ctx context.Context, questionID int64, ownerID *int64) ([]QuestionVersion, error)
	createParallelFn        func(ctx context.Context, in CreateQuestionParallelInput) (*QuestionParallel, error)
	listParallelsFn         func(ctx context.Context, examID int64, parallelGroup string) ([]QuestionParallel, error)
	updateParallelFn        func(ctx context.Context, in UpdateQuestionParallelInput) (*QuestionParallel, error)
	deleteParallelFn        func(ctx context.Context, examID, parallelID int64) error
	createReviewTaskFn      func(ctx context.Context, in CreateReviewTaskInput) (*ReviewTask, error)
	decideReviewTaskFn      func(ctx context.Context, in ReviewDecisionInput) (*ReviewTask, error)
	listReviewTasksFn       func(ctx context.Context, reviewerID int64, status string) ([]ReviewTask, error)
	getQuestionReviewsFn    func(ctx context.Context, questionID int64) ([]QuestionReview, error)
	getQuestionExportDataFn func(ctx context.Context, questionID int64, versionNo int, ownerID *int64) (*ExportQuestionData, error)
	getUserRoleFn           func(ctx context.Context, userID int64) (string, error)
	cloneQuestionFn         func(ctx context.Context, in CloneQuestionInput) (*CloneQuestionResult, error)
}

type mockQuestionMediaService struct {
	downloadFn func(ctx context.Context, key string) (*mediasvc.ObjectResult, error)
}

func (m *mockQuestionMediaService) DownloadQuestionImage(ctx context.Context, key string) (*mediasvc.ObjectResult, error) {
	if m.downloadFn == nil {
		return nil, errors.New("not implemented")
	}
	return m.downloadFn(ctx, key)
}

func (m *mockQuestionService) CreateStimulusGroup(ctx context.Context, in CreateStimulusGroupInput) (*StimulusGroup, error) {
	if m.createStimulusGroupFn == nil {
		return nil, errors.New("not implemented")
	}
	return m.createStimulusGroupFn(ctx, in)
}

func (m *mockQuestionService) ListStimulusGroups(ctx context.Context, subjectID int64, ownerID *int64) ([]StimulusGroup, error) {
	if m.listStimulusGroupsFn == nil {
		return nil, errors.New("not implemented")
	}
	return m.listStimulusGroupsFn(ctx, subjectID, ownerID)
}

func (m *mockQuestionService) UpdateStimulusGroup(ctx context.Context, in UpdateStimulusGroupInput) (*StimulusGroup, error) {
	if m.updateStimulusGroupFn == nil {
		return nil, errors.New("not implemented")
	}
	return m.updateStimulusGroupFn(ctx, in)
}

func (m *mockQuestionService) DeleteStimulusGroup(ctx context.Context, id int64, actorID int64, enforceOwner bool) error {
	if m.deleteStimulusGroupFn == nil {
		return errors.New("not implemented")
	}
	return m.deleteStimulusGroupFn(ctx, id, actorID, enforceOwner)
}

func (m *mockQuestionService) CreateQuestionCode(ctx context.Context, in CreateQuestionCodeInput) (*QuestionCode, error) {
	if m.createQuestionCodeFn == nil {
		return nil, errors.New("not implemented")
	}
	return m.createQuestionCodeFn(ctx, in)
}

func (m *mockQuestionService) ListQuestionCodes(ctx context.Context, subjectID int64, q string, ownerID *int64) ([]QuestionCode, error) {
	if m.listQuestionCodesFn == nil {
		return nil, errors.New("not implemented")
	}
	return m.listQuestionCodesFn(ctx, subjectID, q, ownerID)
}

func (m *mockQuestionService) UpdateQuestionCode(ctx context.Context, in UpdateQuestionCodeInput) (*QuestionCode, error) {
	if m.updateQuestionCodeFn == nil {
		return nil, errors.New("not implemented")
	}
	return m.updateQuestionCodeFn(ctx, in)
}

func (m *mockQuestionService) DeleteQuestionCode(ctx context.Context, id int64, actorID int64, enforceOwner bool) error {
	if m.deleteQuestionCodeFn == nil {
		return errors.New("not implemented")
	}
	return m.deleteQuestionCodeFn(ctx, id, actorID, enforceOwner)
}

func (m *mockQuestionService) CreateQuestion(ctx context.Context, in CreateQuestionInput) (*QuestionBlueprint, error) {
	if m.createQuestionFn == nil {
		return nil, errors.New("not implemented")
	}
	return m.createQuestionFn(ctx, in)
}

func (m *mockQuestionService) AssignQuestionCode(ctx context.Context, in AssignQuestionCodeInput) (*QuestionBlueprint, error) {
	if m.assignQuestionCodeFn == nil {
		return nil, errors.New("not implemented")
	}
	return m.assignQuestionCodeFn(ctx, in)
}

func (m *mockQuestionService) AssignQuestionLearningGoal(ctx context.Context, in AssignQuestionLearningGoalInput) (*QuestionBlueprint, error) {
	if m.assignLearningGoalFn == nil {
		return nil, errors.New("not implemented")
	}
	return m.assignLearningGoalFn(ctx, in)
}

func (m *mockQuestionService) ListQuestions(ctx context.Context, subjectID int64, ownerID *int64) ([]QuestionBlueprint, error) {
	if m.listQuestionsFn == nil {
		return nil, errors.New("not implemented")
	}
	return m.listQuestionsFn(ctx, subjectID, ownerID)
}

func (m *mockQuestionService) CreateQuestionVersion(ctx context.Context, in CreateQuestionVersionInput) (*QuestionVersion, error) {
	if m.createVersionFn == nil {
		return nil, errors.New("not implemented")
	}
	return m.createVersionFn(ctx, in)
}

func (m *mockQuestionService) UpdateQuestionVersion(ctx context.Context, in UpdateQuestionVersionInput) (*QuestionVersion, error) {
	if m.updateVersionFn == nil {
		return nil, errors.New("not implemented")
	}
	return m.updateVersionFn(ctx, in)
}

func (m *mockQuestionService) DeleteQuestionVersion(ctx context.Context, questionID int64, versionNo int, actorID int64, enforceOwner bool) error {
	if m.deleteVersionFn == nil {
		return errors.New("not implemented")
	}
	return m.deleteVersionFn(ctx, questionID, versionNo, actorID, enforceOwner)
}

func (m *mockQuestionService) FinalizeQuestionVersion(ctx context.Context, questionID int64, versionNo int, actorID int64, enforceOwner bool) (*QuestionVersion, error) {
	if m.finalizeFn == nil {
		return nil, errors.New("not implemented")
	}
	return m.finalizeFn(ctx, questionID, versionNo, actorID, enforceOwner)
}

func (m *mockQuestionService) RequestReopenFinal(ctx context.Context, in RequestReopenFinalInput) (*ReopenFinalRequest, error) {
	if m.requestReopenFn == nil {
		return nil, errors.New("not implemented")
	}
	return m.requestReopenFn(ctx, in)
}

func (m *mockQuestionService) ApproveReopenFinal(ctx context.Context, in ApproveReopenFinalInput) (*ReopenFinalRequest, error) {
	if m.approveReopenFn == nil {
		return nil, errors.New("not implemented")
	}
	return m.approveReopenFn(ctx, in)
}

func (m *mockQuestionService) ListQuestionVersions(ctx context.Context, questionID int64, ownerID *int64) ([]QuestionVersion, error) {
	if m.listVersionsFn == nil {
		return nil, errors.New("not implemented")
	}
	return m.listVersionsFn(ctx, questionID, ownerID)
}

func (m *mockQuestionService) CreateQuestionParallel(ctx context.Context, in CreateQuestionParallelInput) (*QuestionParallel, error) {
	if m.createParallelFn == nil {
		return nil, errors.New("not implemented")
	}
	return m.createParallelFn(ctx, in)
}

func (m *mockQuestionService) ListQuestionParallels(ctx context.Context, examID int64, parallelGroup string) ([]QuestionParallel, error) {
	if m.listParallelsFn == nil {
		return nil, errors.New("not implemented")
	}
	return m.listParallelsFn(ctx, examID, parallelGroup)
}

func (m *mockQuestionService) UpdateQuestionParallel(ctx context.Context, in UpdateQuestionParallelInput) (*QuestionParallel, error) {
	if m.updateParallelFn == nil {
		return nil, errors.New("not implemented")
	}
	return m.updateParallelFn(ctx, in)
}

func (m *mockQuestionService) DeleteQuestionParallel(ctx context.Context, examID, parallelID int64) error {
	if m.deleteParallelFn == nil {
		return errors.New("not implemented")
	}
	return m.deleteParallelFn(ctx, examID, parallelID)
}

func (m *mockQuestionService) CreateReviewTask(ctx context.Context, in CreateReviewTaskInput) (*ReviewTask, error) {
	if m.createReviewTaskFn == nil {
		return nil, errors.New("not implemented")
	}
	return m.createReviewTaskFn(ctx, in)
}

func (m *mockQuestionService) DecideReviewTask(ctx context.Context, in ReviewDecisionInput) (*ReviewTask, error) {
	if m.decideReviewTaskFn == nil {
		return nil, errors.New("not implemented")
	}
	return m.decideReviewTaskFn(ctx, in)
}

func (m *mockQuestionService) ListReviewTasks(ctx context.Context, reviewerID int64, status string) ([]ReviewTask, error) {
	if m.listReviewTasksFn == nil {
		return nil, errors.New("not implemented")
	}
	return m.listReviewTasksFn(ctx, reviewerID, status)
}

func (m *mockQuestionService) GetQuestionReviews(ctx context.Context, questionID int64) ([]QuestionReview, error) {
	if m.getQuestionReviewsFn == nil {
		return nil, errors.New("not implemented")
	}
	return m.getQuestionReviewsFn(ctx, questionID)
}

func (m *mockQuestionService) GetQuestionExportData(ctx context.Context, questionID int64, versionNo int, ownerID *int64) (*ExportQuestionData, error) {
	if m.getQuestionExportDataFn == nil {
		return nil, errors.New("not implemented")
	}
	return m.getQuestionExportDataFn(ctx, questionID, versionNo, ownerID)
}

func (m *mockQuestionService) GetUserRole(ctx context.Context, userID int64) (string, error) {
	if m.getUserRoleFn == nil {
		return "", errors.New("not implemented")
	}
	return m.getUserRoleFn(ctx, userID)
}

func (m *mockQuestionService) CloneQuestion(ctx context.Context, in CloneQuestionInput) (*CloneQuestionResult, error) {
	if m.cloneQuestionFn == nil {
		return nil, errors.New("not implemented")
	}
	return m.cloneQuestionFn(ctx, in)
}

func decodeMap(t *testing.T, rr *httptest.ResponseRecorder) map[string]any {
	t.Helper()
	var out map[string]any
	if err := json.Unmarshal(rr.Body.Bytes(), &out); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	return out
}

func withParam(r *http.Request, key, value string) *http.Request {
	rctx := chi.RouteContext(r.Context())
	if rctx == nil {
		rctx = chi.NewRouteContext()
	}
	rctx.URLParams.Add(key, value)
	return r.WithContext(context.WithValue(r.Context(), chi.RouteCtxKey, rctx))
}

func TestCreateStimulusGroupOK(t *testing.T) {
	h := &Handler{svc: &mockQuestionService{
		createStimulusGroupFn: func(ctx context.Context, in CreateStimulusGroupInput) (*StimulusGroup, error) {
			if in.SubjectID != 3 || in.CreatedBy != 9 {
				t.Fatalf("unexpected input: %+v", in)
			}
			return &StimulusGroup{ID: 10, SubjectID: 3, Title: "Stimulus A", IsActive: true}, nil
		},
	}}
	req := httptest.NewRequest(http.MethodPost, "/api/v1/stimulus-groups", bytes.NewReader([]byte(`{"subject_id":3,"title":"Stimulus A","stimulus_html":"<p>Teks</p>"}`)))
	req = req.WithContext(auth.ContextWithUser(req.Context(), &auth.User{ID: 9, Role: "guru"}))
	w := httptest.NewRecorder()
	h.CreateStimulusGroup(w, req)
	if w.Code != http.StatusCreated {
		t.Fatalf("expected 201, got %d", w.Code)
	}
}

func TestCreateStimulusGroupFeatureMigrationRequired(t *testing.T) {
	h := &Handler{svc: &mockQuestionService{
		createStimulusGroupFn: func(ctx context.Context, in CreateStimulusGroupInput) (*StimulusGroup, error) {
			return nil, ErrStimulusGroupFeature
		},
	}}
	req := httptest.NewRequest(http.MethodPost, "/api/v1/stimulus-groups", bytes.NewReader([]byte(`{"subject_id":3,"title":"Stimulus A","stimulus_html":"<p>Teks</p>"}`)))
	req = req.WithContext(auth.ContextWithUser(req.Context(), &auth.User{ID: 9, Role: "guru"}))
	w := httptest.NewRecorder()

	h.CreateStimulusGroup(w, req)

	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", w.Code)
	}
	var body map[string]any
	if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil {
		t.Fatalf("decode body: %v", err)
	}
	errText := ""
	if errObj, ok := body["error"].(map[string]any); ok {
		errText, _ = errObj["message"].(string)
	}
	if !strings.Contains(strings.ToLower(errText), "stimulus_groups") {
		t.Fatalf("expected migration error message, got %#v", body)
	}
}

func TestListStimulusGroupsGuruOwnerOnly(t *testing.T) {
	h := &Handler{svc: &mockQuestionService{
		listStimulusGroupsFn: func(ctx context.Context, subjectID int64, ownerID *int64) ([]StimulusGroup, error) {
			if subjectID != 3 {
				t.Fatalf("unexpected subject_id: %d", subjectID)
			}
			if ownerID == nil || *ownerID != 9 {
				t.Fatalf("expected ownerID=9, got %+v", ownerID)
			}
			return []StimulusGroup{{ID: 1, SubjectID: 3, Title: "Stimulus"}}, nil
		},
	}}
	req := httptest.NewRequest(http.MethodGet, "/api/v1/stimulus-groups?subject_id=3", nil)
	req = req.WithContext(auth.ContextWithUser(req.Context(), &auth.User{ID: 9, Role: "guru"}))
	w := httptest.NewRecorder()
	h.ListStimulusGroups(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}
}

func TestUpdateStimulusGroupNotFound(t *testing.T) {
	h := &Handler{svc: &mockQuestionService{
		updateStimulusGroupFn: func(ctx context.Context, in UpdateStimulusGroupInput) (*StimulusGroup, error) {
			return nil, ErrStimulusGroupNotFound
		},
	}}
	req := httptest.NewRequest(http.MethodPut, "/api/v1/stimulus-groups/5", bytes.NewReader([]byte(`{"title":"Baru"}`)))
	req = withParam(req, "id", "5")
	req = req.WithContext(auth.ContextWithUser(req.Context(), &auth.User{ID: 9, Role: "guru"}))
	w := httptest.NewRecorder()
	h.UpdateStimulusGroup(w, req)
	if w.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d", w.Code)
	}
}

func TestDeleteStimulusGroupForbidden(t *testing.T) {
	h := &Handler{svc: &mockQuestionService{
		deleteStimulusGroupFn: func(ctx context.Context, id int64, actorID int64, enforceOwner bool) error {
			return ErrForbidden
		},
	}}
	req := httptest.NewRequest(http.MethodDelete, "/api/v1/stimulus-groups/5", nil)
	req = withParam(req, "id", "5")
	req = req.WithContext(auth.ContextWithUser(req.Context(), &auth.User{ID: 9, Role: "guru"}))
	w := httptest.NewRecorder()
	h.DeleteStimulusGroup(w, req)
	if w.Code != http.StatusForbidden {
		t.Fatalf("expected 403, got %d", w.Code)
	}
}

func TestListQuestionsGuruDefaultsToOwnerOnly(t *testing.T) {
	h := &Handler{svc: &mockQuestionService{
		listQuestionsFn: func(ctx context.Context, subjectID int64, ownerID *int64) ([]QuestionBlueprint, error) {
			if subjectID != 3 {
				t.Fatalf("unexpected subject id: %d", subjectID)
			}
			if ownerID == nil || *ownerID != 9 {
				t.Fatalf("expected ownerID=9, got %+v", ownerID)
			}
			return []QuestionBlueprint{{ID: 101, SubjectID: 3}}, nil
		},
	}}

	req := httptest.NewRequest(http.MethodGet, "/api/v1/questions?subject_id=3", nil)
	req = req.WithContext(auth.ContextWithUser(req.Context(), &auth.User{ID: 9, Role: "guru"}))
	w := httptest.NewRecorder()

	h.ListQuestions(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}
}

func TestExportQuestionsCSV(t *testing.T) {
	h := &Handler{svc: &mockQuestionService{
		getQuestionExportDataFn: func(ctx context.Context, questionID int64, versionNo int, ownerID *int64) (*ExportQuestionData, error) {
			if questionID != 11 || versionNo != 2 {
				t.Fatalf("unexpected export input: question=%d version=%d", questionID, versionNo)
			}
			if ownerID == nil || *ownerID != 9 {
				t.Fatalf("expected ownerID=9, got %+v", ownerID)
			}
			explanation := "<p>Karena benar.</p>"
			return &ExportQuestionData{
				SubjectName:      "Matematika",
				QuestionCode:     "MAT-001",
				QuestionCodeName: "Paket A",
				QuestionType:     "pg_tunggal",
				StemHTML:         "<p>2 + 2 = ?</p>",
				ExplanationHTML:  &explanation,
				Options: []QuestionOptionInput{
					{OptionKey: "A", OptionHTML: "<p>4</p>"},
					{OptionKey: "B", OptionHTML: "<p>5</p>"},
				},
				AnswerKey: json.RawMessage(`{"correct":"A"}`),
			}, nil
		},
	}}
	req := httptest.NewRequest(http.MethodPost, "/api/v1/questions/export", bytes.NewBufferString(`{"items":[{"question_id":11,"version_no":2}]}`))
	req = req.WithContext(auth.ContextWithUser(req.Context(), &auth.User{ID: 9, Role: "guru"}))
	w := httptest.NewRecorder()

	h.ExportQuestions(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}
	if ct := w.Header().Get("Content-Type"); !strings.Contains(ct, "text/csv") {
		t.Fatalf("expected csv content-type, got %q", ct)
	}
	body := w.Body.String()
	if !strings.Contains(body, "Mapel,Kode Soal") {
		t.Fatalf("expected csv header, got %q", body)
	}
	if !strings.Contains(body, "Matematika,MAT-001") {
		t.Fatalf("expected csv row, got %q", body)
	}
}

func TestExportQuestionsTXT(t *testing.T) {
	h := &Handler{svc: &mockQuestionService{
		getQuestionExportDataFn: func(ctx context.Context, questionID int64, versionNo int, ownerID *int64) (*ExportQuestionData, error) {
			explanation := "<p>Cocokkan sinonimnya.</p>"
			return &ExportQuestionData{
				SubjectName:      "Bahasa Indonesia",
				QuestionCode:     "BIN-001",
				QuestionCodeName: "Sinonim",
				QuestionType:     "menjodohkan_drag_drop",
				StemHTML:         "<p>Pasangkan kata berikut.</p>",
				ExplanationHTML:  &explanation,
				QuestionContent: json.RawMessage(`{
					"prompts":[{"id":"left-1","html":"<p>cermat</p>"},{"id":"left-2","html":"<p>gembira</p>"}],
					"choices":[{"id":"right-1","html":"<p>teliti</p>"},{"id":"right-2","html":"<p>bahagia</p>"}]
				}`),
				AnswerKey: json.RawMessage(`{
					"mode":"exact",
					"pairs":[
						{"prompt_id":"left-1","choice_id":"right-1"},
						{"prompt_id":"left-2","choice_id":"right-2"}
					]
				}`),
			}, nil
		},
	}}
	req := httptest.NewRequest(http.MethodPost, "/api/v1/questions/export?format=txt", bytes.NewBufferString(`{"items":[{"question_id":12,"version_no":1}]}`))
	req = req.WithContext(auth.ContextWithUser(req.Context(), &auth.User{ID: 9, Role: "guru"}))
	w := httptest.NewRecorder()

	h.ExportQuestions(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}
	if ct := w.Header().Get("Content-Type"); !strings.Contains(ct, "text/plain") {
		t.Fatalf("expected text content-type, got %q", ct)
	}
	body := w.Body.String()
	for _, want := range []string{
		"TYPE: MATCH",
		"Mapel: Bahasa Indonesia",
		"Q: Pasangkan kata berikut.",
		"P1: cermat",
		"A: teliti",
		"Kunci Jawaban: P1->A, P2->B",
	} {
		if !strings.Contains(body, want) {
			t.Fatalf("expected body to contain %q, got %q", want, body)
		}
	}
}

func TestExportQuestionsCSVEncodesImages(t *testing.T) {
	h := &Handler{
		svc: &mockQuestionService{
			getQuestionExportDataFn: func(ctx context.Context, questionID int64, versionNo int, ownerID *int64) (*ExportQuestionData, error) {
				return &ExportQuestionData{
					SubjectName:      "IPA",
					QuestionCode:     "IPA-001",
					QuestionCodeName: "Gambar",
					QuestionType:     "pg_tunggal",
					StemHTML:         `<p>Lihat gambar berikut <img src="/api/v1/media/question-images/question-images/test.png"></p>`,
					Options: []QuestionOptionInput{
						{OptionKey: "A", OptionHTML: "<p>Benar</p>"},
						{OptionKey: "B", OptionHTML: `<p><img src="/api/v1/media/question-images/question-images/test.png"></p>`},
					},
					AnswerKey: json.RawMessage(`{"correct":"A"}`),
				}, nil
			},
		},
		media: &mockQuestionMediaService{
			downloadFn: func(ctx context.Context, key string) (*mediasvc.ObjectResult, error) {
				if key != "question-images/test.png" {
					t.Fatalf("unexpected key: %s", key)
				}
				raw := []byte{0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a}
				return &mediasvc.ObjectResult{
					ContentType: "image/png",
					Size:        int64(len(raw)),
					Reader:      io.NopCloser(bytes.NewReader(raw)),
				}, nil
			},
		},
	}
	req := httptest.NewRequest(http.MethodPost, "/api/v1/questions/export", bytes.NewBufferString(`{"items":[{"question_id":99,"version_no":1}]}`))
	req = req.WithContext(auth.ContextWithUser(req.Context(), &auth.User{ID: 9, Role: "guru"}))
	w := httptest.NewRecorder()

	h.ExportQuestions(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d body=%s", w.Code, w.Body.String())
	}
	body := w.Body.String()
	if !strings.Contains(body, "[[CBTIMG:") {
		t.Fatalf("expected encoded image token, got %q", body)
	}
}

func TestExportQuestionsCSVSkipsImagesWhenMediaUnavailable(t *testing.T) {
	h := &Handler{
		svc: &mockQuestionService{
			getQuestionExportDataFn: func(ctx context.Context, questionID int64, versionNo int, ownerID *int64) (*ExportQuestionData, error) {
				return &ExportQuestionData{
					SubjectName:      "IPA",
					QuestionCode:     "IPA-002",
					QuestionCodeName: "Gambar",
					QuestionType:     "pg_tunggal",
					StemHTML:         `<p>Lihat gambar berikut <img src="/api/v1/media/question-images/question-images/test.png"></p>`,
					Options: []QuestionOptionInput{
						{OptionKey: "A", OptionHTML: "<p>Benar</p>"},
					},
					AnswerKey: json.RawMessage(`{"correct":"A"}`),
				}, nil
			},
		},
		media: &mockQuestionMediaService{
			downloadFn: func(ctx context.Context, key string) (*mediasvc.ObjectResult, error) {
				return nil, errors.New("storage unavailable")
			},
		},
	}
	req := httptest.NewRequest(http.MethodPost, "/api/v1/questions/export", bytes.NewBufferString(`{"items":[{"question_id":99,"version_no":1}]}`))
	req = req.WithContext(auth.ContextWithUser(req.Context(), &auth.User{ID: 9, Role: "guru"}))
	w := httptest.NewRecorder()

	h.ExportQuestions(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d body=%s", w.Code, w.Body.String())
	}
	body := w.Body.String()
	if !strings.Contains(body, "Lihat gambar berikut") {
		t.Fatalf("expected question text to be exported, got %q", body)
	}
	if strings.Contains(body, "[[CBTIMG:") {
		t.Fatalf("expected no image token when media unavailable, got %q", body)
	}
}

func TestListQuestionsAdminDefaultsAll(t *testing.T) {
	h := &Handler{svc: &mockQuestionService{
		listQuestionsFn: func(ctx context.Context, subjectID int64, ownerID *int64) ([]QuestionBlueprint, error) {
			if ownerID != nil {
				t.Fatalf("expected ownerID nil, got %+v", ownerID)
			}
			return []QuestionBlueprint{{ID: 201, SubjectID: 1}}, nil
		},
	}}

	req := httptest.NewRequest(http.MethodGet, "/api/v1/questions", nil)
	req = req.WithContext(auth.ContextWithUser(req.Context(), &auth.User{ID: 1, Role: "admin"}))
	w := httptest.NewRecorder()

	h.ListQuestions(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}
}

func TestListQuestionsOwnerOnlyQueryFalseForGuru(t *testing.T) {
	h := &Handler{svc: &mockQuestionService{
		listQuestionsFn: func(ctx context.Context, subjectID int64, ownerID *int64) ([]QuestionBlueprint, error) {
			if ownerID == nil || *ownerID != 9 {
				t.Fatalf("expected ownerID=9 for guru, got %+v", ownerID)
			}
			return []QuestionBlueprint{{ID: 301, SubjectID: 2}}, nil
		},
	}}

	req := httptest.NewRequest(http.MethodGet, "/api/v1/questions?owner_only=false", nil)
	req = req.WithContext(auth.ContextWithUser(req.Context(), &auth.User{ID: 9, Role: "guru"}))
	w := httptest.NewRecorder()

	h.ListQuestions(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}
}

func TestCreateQuestionOK(t *testing.T) {
	h := &Handler{svc: &mockQuestionService{
		createQuestionFn: func(ctx context.Context, in CreateQuestionInput) (*QuestionBlueprint, error) {
			if in.SubjectID != 3 || in.LearningGoalID != 7 || in.QuestionType != "mc" || in.Title != "Soal uji" {
				t.Fatalf("unexpected create question input: %+v", in)
			}
			return &QuestionBlueprint{
				ID:             11,
				SubjectID:      3,
				LearningGoalID: 7,
				QuestionType:   "mc",
			}, nil
		},
	}}

	req := httptest.NewRequest(http.MethodPost, "/api/v1/questions", bytes.NewBufferString(`{"subject_id":3,"learning_goal_id":7,"question_type":"mc","title":"Soal uji"}`))
	req = req.WithContext(auth.ContextWithUser(req.Context(), &auth.User{ID: 9, Role: "guru"}))
	w := httptest.NewRecorder()

	h.CreateQuestion(w, req)

	if w.Code != http.StatusCreated {
		t.Fatalf("expected 201, got %d body=%s", w.Code, w.Body.String())
	}
	if !strings.Contains(w.Body.String(), `"id":11`) {
		t.Fatalf("expected response to contain created question id, got %s", w.Body.String())
	}
}

func TestCreateQuestionForbidden(t *testing.T) {
	h := &Handler{svc: &mockQuestionService{
		createQuestionFn: func(ctx context.Context, in CreateQuestionInput) (*QuestionBlueprint, error) {
			return nil, ErrForbidden
		},
	}}

	req := httptest.NewRequest(http.MethodPost, "/api/v1/questions", bytes.NewBufferString(`{"subject_id":3,"learning_goal_id":7,"question_type":"mc","title":"Soal uji"}`))
	req = req.WithContext(auth.ContextWithUser(req.Context(), &auth.User{ID: 9, Role: "guru"}))
	w := httptest.NewRecorder()

	h.CreateQuestion(w, req)

	if w.Code != http.StatusForbidden {
		t.Fatalf("expected 403, got %d body=%s", w.Code, w.Body.String())
	}
}

func TestCreateQuestionQuestionCodeNotFound(t *testing.T) {
	h := &Handler{svc: &mockQuestionService{
		createQuestionFn: func(ctx context.Context, in CreateQuestionInput) (*QuestionBlueprint, error) {
			return nil, ErrQuestionCodeNotFound
		},
	}}

	req := httptest.NewRequest(http.MethodPost, "/api/v1/questions", bytes.NewBufferString(`{"subject_id":3,"learning_goal_id":7,"question_code_id":19,"question_type":"mc","title":"Soal uji"}`))
	req = req.WithContext(auth.ContextWithUser(req.Context(), &auth.User{ID: 9, Role: "guru"}))
	w := httptest.NewRecorder()

	h.CreateQuestion(w, req)

	if w.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d body=%s", w.Code, w.Body.String())
	}
}

func TestCreateQuestionVersionOK(t *testing.T) {
	h := &Handler{svc: &mockQuestionService{
		createVersionFn: func(ctx context.Context, in CreateQuestionVersionInput) (*QuestionVersion, error) {
			if in.QuestionID != 5 || in.CreatedBy != 10 {
				t.Fatalf("unexpected input: %+v", in)
			}
			return &QuestionVersion{ID: 100, QuestionID: 5, VersionNo: 2, Status: "draft"}, nil
		},
	}}

	payload := []byte(`{"stem_html":"<p>baru</p>","answer_key":{"selected":["A"]}}`)
	req := httptest.NewRequest(http.MethodPost, "/api/v1/questions/5/versions", bytes.NewReader(payload))
	req = withParam(req, "id", "5")
	req = req.WithContext(auth.ContextWithUser(req.Context(), &auth.User{ID: 10, Role: "guru"}))
	w := httptest.NewRecorder()

	h.CreateQuestionVersion(w, req)

	if w.Code != http.StatusCreated {
		t.Fatalf("expected 201, got %d", w.Code)
	}
}

func TestFinalizeQuestionVersionNotFound(t *testing.T) {
	h := &Handler{svc: &mockQuestionService{
		finalizeFn: func(ctx context.Context, questionID int64, versionNo int, actorID int64, enforceOwner bool) (*QuestionVersion, error) {
			return nil, ErrVersionNotFound
		},
	}}

	req := httptest.NewRequest(http.MethodPost, "/api/v1/questions/5/versions/2/finalize", nil)
	req = withParam(req, "id", "5")
	req = withParam(req, "version", "2")
	req = req.WithContext(auth.ContextWithUser(req.Context(), &auth.User{ID: 10, Role: "guru"}))
	w := httptest.NewRecorder()

	h.FinalizeQuestionVersion(w, req)

	if w.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d", w.Code)
	}
}

func TestUpdateQuestionVersionOK(t *testing.T) {
	h := &Handler{svc: &mockQuestionService{
		updateVersionFn: func(ctx context.Context, in UpdateQuestionVersionInput) (*QuestionVersion, error) {
			if in.QuestionID != 5 || in.VersionNo != 2 {
				t.Fatalf("unexpected input: %+v", in)
			}
			if in.QuestionType == nil || *in.QuestionType != "multi_jawaban" {
				t.Fatalf("expected question_type to be passed through, got %+v", in.QuestionType)
			}
			return &QuestionVersion{ID: 100, QuestionID: 5, VersionNo: 2, Status: "draft"}, nil
		},
	}}

	payload := []byte(`{"question_type":"multi_jawaban","stem_html":"<p>ubah</p>","answer_key":{"correct":"A"}}`)
	req := httptest.NewRequest(http.MethodPut, "/api/v1/questions/5/versions/2", bytes.NewReader(payload))
	req = withParam(req, "id", "5")
	req = withParam(req, "version", "2")
	req = req.WithContext(auth.ContextWithUser(req.Context(), &auth.User{ID: 10, Role: "guru"}))
	w := httptest.NewRecorder()

	h.UpdateQuestionVersion(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}
}

func TestAssignQuestionLearningGoalOK(t *testing.T) {
	h := &Handler{svc: &mockQuestionService{
		assignLearningGoalFn: func(ctx context.Context, in AssignQuestionLearningGoalInput) (*QuestionBlueprint, error) {
			if in.QuestionID != 10 || in.LearningGoalID != 200 {
				t.Fatalf("unexpected input: %+v", in)
			}
			return &QuestionBlueprint{ID: in.QuestionID, LearningGoalID: in.LearningGoalID}, nil
		},
	}}

	payload := []byte(`{"learning_goal_id":200}`)
	req := httptest.NewRequest(http.MethodPut, "/api/v1/questions/10/learning-goal", bytes.NewReader(payload))
	req = withParam(req, "id", "10")
	req = req.WithContext(auth.ContextWithUser(req.Context(), &auth.User{ID: 99, Role: "guru"}))
	w := httptest.NewRecorder()

	h.AssignQuestionLearningGoal(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}
}

func TestAssignQuestionLearningGoalNotFound(t *testing.T) {
	h := &Handler{svc: &mockQuestionService{
		assignLearningGoalFn: func(ctx context.Context, in AssignQuestionLearningGoalInput) (*QuestionBlueprint, error) {
			return nil, ErrLearningGoalNotFound
		},
	}}

	payload := []byte(`{"learning_goal_id":200}`)
	req := httptest.NewRequest(http.MethodPut, "/api/v1/questions/10/learning-goal", bytes.NewReader(payload))
	req = withParam(req, "id", "10")
	req = req.WithContext(auth.ContextWithUser(req.Context(), &auth.User{ID: 1, Role: "guru"}))
	w := httptest.NewRecorder()

	h.AssignQuestionLearningGoal(w, req)

	if w.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d", w.Code)
	}
}

func TestDeleteQuestionVersionNotFound(t *testing.T) {
	h := &Handler{svc: &mockQuestionService{
		deleteVersionFn: func(ctx context.Context, questionID int64, versionNo int, actorID int64, enforceOwner bool) error {
			return ErrVersionNotFound
		},
	}}

	req := httptest.NewRequest(http.MethodDelete, "/api/v1/questions/5/versions/2", nil)
	req = withParam(req, "id", "5")
	req = withParam(req, "version", "2")
	req = req.WithContext(auth.ContextWithUser(req.Context(), &auth.User{ID: 10, Role: "guru"}))
	w := httptest.NewRecorder()

	h.DeleteQuestionVersion(w, req)

	if w.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d", w.Code)
	}
}

func TestListQuestionVersionsOK(t *testing.T) {
	h := &Handler{svc: &mockQuestionService{
		listVersionsFn: func(ctx context.Context, questionID int64, ownerID *int64) ([]QuestionVersion, error) {
			return []QuestionVersion{{ID: 1, QuestionID: questionID, VersionNo: 2}, {ID: 2, QuestionID: questionID, VersionNo: 1}}, nil
		},
	}}

	req := httptest.NewRequest(http.MethodGet, "/api/v1/questions/5/versions", nil)
	req = withParam(req, "id", "5")
	req = req.WithContext(auth.ContextWithUser(req.Context(), &auth.User{ID: 1, Role: "admin"}))
	w := httptest.NewRecorder()

	h.ListQuestionVersions(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}
}

func TestCreateQuestionParallelOK(t *testing.T) {
	h := &Handler{svc: &mockQuestionService{
		createParallelFn: func(ctx context.Context, in CreateQuestionParallelInput) (*QuestionParallel, error) {
			if in.ExamID != 7 || in.QuestionID != 10 {
				t.Fatalf("unexpected input: %+v", in)
			}
			return &QuestionParallel{ID: 1, ExamID: in.ExamID, QuestionID: in.QuestionID, ParallelGroup: "default", ParallelOrder: 1, ParallelLabel: "pararel_1", IsActive: true}, nil
		},
	}}

	reqBody := []byte(`{"question_id":10,"parallel_group":"default","parallel_order":1,"parallel_label":"pararel_1"}`)
	req := httptest.NewRequest(http.MethodPost, "/api/v1/exams/7/parallels", bytes.NewReader(reqBody))
	req = withParam(req, "id", "7")
	w := httptest.NewRecorder()

	h.CreateQuestionParallel(w, req)
	if w.Code != http.StatusCreated {
		t.Fatalf("expected 201, got %d", w.Code)
	}
}

func TestListQuestionParallelsOK(t *testing.T) {
	h := &Handler{svc: &mockQuestionService{
		listParallelsFn: func(ctx context.Context, examID int64, parallelGroup string) ([]QuestionParallel, error) {
			return []QuestionParallel{{ID: 1, ExamID: examID, QuestionID: 10, ParallelGroup: "default", ParallelOrder: 1, ParallelLabel: "pararel_1"}}, nil
		},
	}}

	req := httptest.NewRequest(http.MethodGet, "/api/v1/exams/7/parallels?parallel_group=default", nil)
	req = withParam(req, "id", "7")
	w := httptest.NewRecorder()

	h.ListQuestionParallels(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}
}

func TestUpdateQuestionParallelConflict(t *testing.T) {
	h := &Handler{svc: &mockQuestionService{
		updateParallelFn: func(ctx context.Context, in UpdateQuestionParallelInput) (*QuestionParallel, error) {
			return nil, ErrQuestionNotInExam
		},
	}}

	reqBody := []byte(`{"question_id":999,"parallel_group":"default","parallel_order":2,"parallel_label":"pararel_2"}`)
	req := httptest.NewRequest(http.MethodPut, "/api/v1/exams/7/parallels/1", bytes.NewReader(reqBody))
	req = withParam(req, "id", "7")
	req = withParam(req, "parallelID", "1")
	w := httptest.NewRecorder()

	h.UpdateQuestionParallel(w, req)
	if w.Code != http.StatusConflict {
		t.Fatalf("expected 409, got %d", w.Code)
	}
}

func TestDeleteQuestionParallelNotFound(t *testing.T) {
	h := &Handler{svc: &mockQuestionService{
		deleteParallelFn: func(ctx context.Context, examID, parallelID int64) error {
			return ErrParallelNotFound
		},
	}}

	req := httptest.NewRequest(http.MethodDelete, "/api/v1/exams/7/parallels/1", nil)
	req = withParam(req, "id", "7")
	req = withParam(req, "parallelID", "1")
	w := httptest.NewRecorder()

	h.DeleteQuestionParallel(w, req)
	if w.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d", w.Code)
	}
}

func TestCreateReviewTaskOK(t *testing.T) {
	h := &Handler{svc: &mockQuestionService{
		createReviewTaskFn: func(ctx context.Context, in CreateReviewTaskInput) (*ReviewTask, error) {
			if in.QuestionVersionID != 5 || in.ReviewerID != 77 {
				t.Fatalf("unexpected input: %+v", in)
			}
			return &ReviewTask{ID: 1, QuestionVersionID: 5, ReviewerID: 77, Status: "menunggu_reviu"}, nil
		},
	}}

	reqBody := []byte(`{"question_version_id":5,"reviewer_id":77,"note":"tolong telaah"}`)
	req := httptest.NewRequest(http.MethodPost, "/api/v1/reviews/tasks", bytes.NewReader(reqBody))
	w := httptest.NewRecorder()

	h.CreateReviewTask(w, req)
	if w.Code != http.StatusCreated {
		t.Fatalf("expected 201, got %d", w.Code)
	}
}

func TestDecideReviewTaskForbidden(t *testing.T) {
	h := &Handler{svc: &mockQuestionService{
		decideReviewTaskFn: func(ctx context.Context, in ReviewDecisionInput) (*ReviewTask, error) {
			return nil, ErrReviewForbidden
		},
	}}

	reqBody := []byte(`{"status":"disetujui","note":"ok"}`)
	req := httptest.NewRequest(http.MethodPost, "/api/v1/reviews/tasks/9/decision", bytes.NewReader(reqBody))
	req = withParam(req, "id", "9")
	req = req.WithContext(auth.ContextWithUser(req.Context(), &auth.User{ID: 8, Role: "guru"}))
	w := httptest.NewRecorder()

	h.DecideReviewTask(w, req)
	if w.Code != http.StatusForbidden {
		t.Fatalf("expected 403, got %d", w.Code)
	}
}

func TestListReviewTasksForcesReviewerForGuru(t *testing.T) {
	h := &Handler{svc: &mockQuestionService{
		listReviewTasksFn: func(ctx context.Context, reviewerID int64, status string) ([]ReviewTask, error) {
			if reviewerID != 22 {
				t.Fatalf("expected reviewer_id forced to user id, got %d", reviewerID)
			}
			return []ReviewTask{}, nil
		},
	}}

	req := httptest.NewRequest(http.MethodGet, "/api/v1/reviews/tasks?reviewer_id=999&status=menunggu_reviu", nil)
	req = req.WithContext(auth.ContextWithUser(req.Context(), &auth.User{ID: 22, Role: "guru"}))
	w := httptest.NewRecorder()

	h.ListReviewTasks(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}
}

func TestGetQuestionReviewsOK(t *testing.T) {
	h := &Handler{svc: &mockQuestionService{
		getQuestionReviewsFn: func(ctx context.Context, questionID int64) ([]QuestionReview, error) {
			return []QuestionReview{{Task: ReviewTask{ID: 1, QuestionID: questionID}}}, nil
		},
	}}

	req := httptest.NewRequest(http.MethodGet, "/api/v1/questions/5/reviews", nil)
	req = withParam(req, "id", "5")
	w := httptest.NewRecorder()

	h.GetQuestionReviews(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}
}
