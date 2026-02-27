package masterdata

import (
	"database/sql"
	"encoding/csv"
	"encoding/json"
	"errors"
	"fmt"
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
	svc *Service
}

type apiResponse struct {
	OK    bool        `json:"ok"`
	Data  interface{} `json:"data,omitempty"`
	Error string      `json:"error,omitempty"`
}

type createSchoolRequest struct {
	Name    string `json:"name"`
	Code    string `json:"code"`
	Address string `json:"address"`
}

type createClassRequest struct {
	SchoolID   int64  `json:"school_id"`
	Name       string `json:"name"`
	GradeLevel string `json:"grade_level"`
}

type createEducationLevelRequest struct {
	Name string `json:"name"`
}

type createLearningGoalRequest struct {
	TujuanPembelajaran string `json:"tujuan_pembelajaran"`
	Materi             string `json:"materi"`
	MataPelajaran      string `json:"mata_pelajaran"`
	Kelas              string `json:"kelas"`
	Semester           int16  `json:"semester"`
}

type updateLearningGoalRequest struct {
	TujuanPembelajaran string `json:"tujuan_pembelajaran"`
	Materi             string `json:"materi"`
	MataPelajaran      string `json:"mata_pelajaran"`
	Kelas              string `json:"kelas"`
	Semester           int16  `json:"semester"`
}

type updateEducationLevelRequest struct {
	Name string `json:"name"`
}

type updateSchoolRequest struct {
	Name    string `json:"name"`
	Code    string `json:"code"`
	Address string `json:"address"`
}

type updateClassRequest struct {
	SchoolID   int64  `json:"school_id"`
	Name       string `json:"name"`
	GradeLevel string `json:"grade_level"`
}

type learningGoalImportRowError struct {
	Row           int    `json:"row"`
	MataPelajaran string `json:"mata_pelajaran,omitempty"`
	Kelas         string `json:"kelas,omitempty"`
	Materi        string `json:"materi,omitempty"`
	Semester      int16  `json:"semester,omitempty"`
	Error         string `json:"error"`
}

type learningGoalImportReport struct {
	TotalRows   int                          `json:"total_rows"`
	SuccessRows int                          `json:"success_rows"`
	FailedRows  int                          `json:"failed_rows"`
	Errors      []learningGoalImportRowError `json:"errors"`
}

func NewHandler(svc *Service) *Handler {
	return &Handler{svc: svc}
}

func (h *Handler) ListEducationLevels(w http.ResponseWriter, r *http.Request) {
	activeOnly := true
	if strings.TrimSpace(r.URL.Query().Get("all")) == "1" {
		activeOnly = false
	}

	items, err := h.svc.ListEducationLevels(r.Context(), activeOnly)
	if err != nil {
		writeJSON(w, r, http.StatusInternalServerError, apiResponse{OK: false, Error: "internal error"})
		return
	}
	writeJSON(w, r, http.StatusOK, apiResponse{OK: true, Data: items})
}

func (h *Handler) ListLearningGoals(w http.ResponseWriter, r *http.Request) {
	user, ok := auth.CurrentUser(r.Context())
	if !ok {
		writeJSON(w, r, http.StatusUnauthorized, apiResponse{OK: false, Error: "unauthorized"})
		return
	}

	mapel := strings.TrimSpace(r.URL.Query().Get("mata_pelajaran"))
	kelas := strings.TrimSpace(r.URL.Query().Get("kelas"))
	semester := int16(0)
	if raw := strings.TrimSpace(r.URL.Query().Get("semester")); raw != "" {
		n, err := strconv.Atoi(raw)
		if err != nil || n <= 0 {
			writeJSON(w, r, http.StatusBadRequest, apiResponse{OK: false, Error: "semester must be positive"})
			return
		}
		semester = int16(n)
	}

	var ownerID *int64
	if strings.EqualFold(strings.TrimSpace(user.Role), "guru") {
		ownerID = &user.ID
	}

	items, err := h.svc.ListLearningGoals(r.Context(), mapel, kelas, semester, ownerID)
	if err != nil {
		writeJSON(w, r, http.StatusInternalServerError, apiResponse{OK: false, Error: "internal error"})
		return
	}
	writeJSON(w, r, http.StatusOK, apiResponse{OK: true, Data: items})
}

func (h *Handler) CreateLearningGoal(w http.ResponseWriter, r *http.Request) {
	user, ok := auth.CurrentUser(r.Context())
	if !ok {
		writeJSON(w, r, http.StatusUnauthorized, apiResponse{OK: false, Error: "unauthorized"})
		return
	}

	var req createLearningGoalRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, r, http.StatusBadRequest, apiResponse{OK: false, Error: "invalid request body"})
		return
	}

	item, err := h.svc.CreateLearningGoal(r.Context(), user.ID, CreateLearningGoalInput{
		TujuanPembelajaran: req.TujuanPembelajaran,
		Materi:             req.Materi,
		MataPelajaran:      req.MataPelajaran,
		Kelas:              req.Kelas,
		Semester:           req.Semester,
	})
	if err != nil {
		if errors.Is(err, ErrInvalidInput) {
			writeJSON(w, r, http.StatusBadRequest, apiResponse{OK: false, Error: "tujuan_pembelajaran, materi, mata_pelajaran, kelas, semester wajib diisi"})
			return
		}
		writeJSON(w, r, http.StatusBadRequest, apiResponse{OK: false, Error: err.Error()})
		return
	}
	writeJSON(w, r, http.StatusCreated, apiResponse{OK: true, Data: item})
}

func (h *Handler) UpdateLearningGoal(w http.ResponseWriter, r *http.Request) {
	user, ok := auth.CurrentUser(r.Context())
	if !ok {
		writeJSON(w, r, http.StatusUnauthorized, apiResponse{OK: false, Error: "unauthorized"})
		return
	}

	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil || id <= 0 {
		writeJSON(w, r, http.StatusBadRequest, apiResponse{OK: false, Error: "invalid id"})
		return
	}

	var req updateLearningGoalRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, r, http.StatusBadRequest, apiResponse{OK: false, Error: "invalid request body"})
		return
	}

	item, err := h.svc.UpdateLearningGoal(r.Context(), user.ID, id, UpdateLearningGoalInput{
		TujuanPembelajaran: req.TujuanPembelajaran,
		Materi:             req.Materi,
		MataPelajaran:      req.MataPelajaran,
		Kelas:              req.Kelas,
		Semester:           req.Semester,
	}, ownerScopeByRole(user.Role, user.ID))
	if err != nil {
		switch {
		case errors.Is(err, ErrInvalidInput):
			writeJSON(w, r, http.StatusBadRequest, apiResponse{OK: false, Error: "id, tujuan_pembelajaran, materi, mata_pelajaran, kelas, semester wajib diisi"})
		case errors.Is(err, sql.ErrNoRows):
			writeJSON(w, r, http.StatusNotFound, apiResponse{OK: false, Error: "learning goal not found"})
		default:
			writeJSON(w, r, http.StatusBadRequest, apiResponse{OK: false, Error: err.Error()})
		}
		return
	}
	writeJSON(w, r, http.StatusOK, apiResponse{OK: true, Data: item})
}

func (h *Handler) DeleteLearningGoal(w http.ResponseWriter, r *http.Request) {
	user, ok := auth.CurrentUser(r.Context())
	if !ok {
		writeJSON(w, r, http.StatusUnauthorized, apiResponse{OK: false, Error: "unauthorized"})
		return
	}
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil || id <= 0 {
		writeJSON(w, r, http.StatusBadRequest, apiResponse{OK: false, Error: "invalid id"})
		return
	}
	if err := h.svc.DeleteLearningGoal(r.Context(), user.ID, id, ownerScopeByRole(user.Role, user.ID)); err != nil {
		switch {
		case errors.Is(err, ErrInvalidInput):
			writeJSON(w, r, http.StatusBadRequest, apiResponse{OK: false, Error: "invalid id"})
		case errors.Is(err, sql.ErrNoRows):
			writeJSON(w, r, http.StatusNotFound, apiResponse{OK: false, Error: "learning goal not found"})
		default:
			writeJSON(w, r, http.StatusBadRequest, apiResponse{OK: false, Error: err.Error()})
		}
		return
	}
	writeJSON(w, r, http.StatusOK, apiResponse{OK: true, Data: map[string]string{"status": "deleted"}})
}

func ownerScopeByRole(role string, userID int64) *int64 {
	if strings.EqualFold(strings.TrimSpace(role), "guru") && userID > 0 {
		return &userID
	}
	return nil
}

func (h *Handler) ExportLearningGoalsImportTemplateCSV(w http.ResponseWriter, r *http.Request) {
	filename := fmt.Sprintf("template_import_learning_goals_%s.csv", time.Now().Format("20060102_150405"))
	w.Header().Set("Content-Type", "text/csv; charset=utf-8")
	w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=%q", filename))
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write([]byte(strings.Join([]string{
		"mata_pelajaran,kelas,semester,materi,tujuan_pembelajaran",
		`"Matematika","X",1,"Fungsi Linear","Memahami konsep fungsi linear"`,
		`"Bahasa Indonesia","XI",2,"Teks Eksposisi","Menganalisis teks eksposisi"`,
		"",
	}, "\n")))
}

func (h *Handler) ImportLearningGoalsCSV(w http.ResponseWriter, r *http.Request) {
	user, ok := auth.CurrentUser(r.Context())
	if !ok {
		writeJSON(w, r, http.StatusUnauthorized, apiResponse{OK: false, Error: "unauthorized"})
		return
	}

	if err := r.ParseMultipartForm(16 << 20); err != nil {
		writeJSON(w, r, http.StatusBadRequest, apiResponse{OK: false, Error: "invalid multipart form"})
		return
	}

	file, hdr, err := r.FormFile("file")
	if err != nil {
		writeJSON(w, r, http.StatusBadRequest, apiResponse{OK: false, Error: "file field is required"})
		return
	}
	defer file.Close()

	reader := csv.NewReader(file)
	reader.TrimLeadingSpace = true

	headerRow, err := reader.Read()
	if err != nil {
		writeJSON(w, r, http.StatusBadRequest, apiResponse{OK: false, Error: "gagal membaca header csv"})
		return
	}
	header := map[string]int{}
	for i, raw := range headerRow {
		k := strings.ToLower(strings.TrimSpace(raw))
		if k != "" {
			header[k] = i
		}
	}
	required := []string{"mata_pelajaran", "kelas", "semester", "materi", "tujuan_pembelajaran"}
	for _, col := range required {
		if _, ok := header[col]; !ok {
			writeJSON(w, r, http.StatusBadRequest, apiResponse{OK: false, Error: fmt.Sprintf("kolom wajib tidak ditemukan: %s", col)})
			return
		}
	}

	get := func(row []string, key string) string {
		idx, ok := header[key]
		if !ok || idx < 0 || idx >= len(row) {
			return ""
		}
		return strings.TrimSpace(row[idx])
	}

	report := &learningGoalImportReport{Errors: make([]learningGoalImportRowError, 0)}
	rowNo := 1
	for {
		record, readErr := reader.Read()
		if errors.Is(readErr, io.EOF) {
			break
		}
		rowNo++
		if readErr != nil {
			report.TotalRows++
			report.FailedRows++
			report.Errors = append(report.Errors, learningGoalImportRowError{
				Row:   rowNo,
				Error: "format csv tidak valid",
			})
			continue
		}
		if isCSVRowEmpty(record) {
			continue
		}
		if len(record) > 0 && strings.HasPrefix(strings.TrimSpace(record[0]), "#") {
			continue
		}

		report.TotalRows++

		mapel := get(record, "mata_pelajaran")
		kelas := get(record, "kelas")
		semesterRaw := get(record, "semester")
		materi := get(record, "materi")
		tujuan := get(record, "tujuan_pembelajaran")
		semesterVal, convErr := strconv.Atoi(semesterRaw)
		if convErr != nil || semesterVal <= 0 {
			report.FailedRows++
			report.Errors = append(report.Errors, learningGoalImportRowError{
				Row:           rowNo,
				MataPelajaran: mapel,
				Kelas:         kelas,
				Error:         "semester harus angka positif",
			})
			continue
		}
		if strings.TrimSpace(mapel) == "" || strings.TrimSpace(kelas) == "" || strings.TrimSpace(materi) == "" || strings.TrimSpace(tujuan) == "" {
			report.FailedRows++
			report.Errors = append(report.Errors, learningGoalImportRowError{
				Row:           rowNo,
				MataPelajaran: mapel,
				Kelas:         kelas,
				Materi:        materi,
				Semester:      int16(semesterVal),
				Error:         "mata_pelajaran, kelas, materi, dan tujuan_pembelajaran wajib diisi",
			})
			continue
		}

		_, createErr := h.svc.CreateLearningGoal(r.Context(), user.ID, CreateLearningGoalInput{
			TujuanPembelajaran: tujuan,
			Materi:             materi,
			MataPelajaran:      mapel,
			Kelas:              kelas,
			Semester:           int16(semesterVal),
		})
		if createErr != nil {
			report.FailedRows++
			report.Errors = append(report.Errors, learningGoalImportRowError{
				Row:           rowNo,
				MataPelajaran: mapel,
				Kelas:         kelas,
				Materi:        materi,
				Semester:      int16(semesterVal),
				Error:         createErr.Error(),
			})
			continue
		}
		report.SuccessRows++
	}

	if report.TotalRows == 0 {
		writeJSON(w, r, http.StatusBadRequest, apiResponse{OK: false, Error: "tidak ada baris data pada file csv"})
		return
	}

	writeJSON(w, r, http.StatusOK, apiResponse{OK: true, Data: map[string]any{
		"filename": hdr.Filename,
		"report":   report,
		"summary":  "import completed",
	}})
}

func (h *Handler) ListSchools(w http.ResponseWriter, r *http.Request) {
	activeOnly := true
	if strings.TrimSpace(r.URL.Query().Get("all")) == "1" {
		activeOnly = false
	}

	items, err := h.svc.ListSchools(r.Context(), activeOnly)
	if err != nil {
		writeJSON(w, r, http.StatusInternalServerError, apiResponse{OK: false, Error: "internal error"})
		return
	}
	writeJSON(w, r, http.StatusOK, apiResponse{OK: true, Data: items})
}

func (h *Handler) ListClasses(w http.ResponseWriter, r *http.Request) {
	activeOnly := true
	if strings.TrimSpace(r.URL.Query().Get("all")) == "1" {
		activeOnly = false
	}

	schoolID := int64(0)
	if v := strings.TrimSpace(r.URL.Query().Get("school_id")); v != "" {
		id, err := strconv.ParseInt(v, 10, 64)
		if err != nil {
			writeJSON(w, r, http.StatusBadRequest, apiResponse{OK: false, Error: "invalid school_id"})
			return
		}
		schoolID = id
	}

	items, err := h.svc.ListClasses(r.Context(), schoolID, activeOnly)
	if err != nil {
		writeJSON(w, r, http.StatusInternalServerError, apiResponse{OK: false, Error: "internal error"})
		return
	}
	writeJSON(w, r, http.StatusOK, apiResponse{OK: true, Data: items})
}

func (h *Handler) CreateEducationLevel(w http.ResponseWriter, r *http.Request) {
	user, ok := auth.CurrentUser(r.Context())
	if !ok {
		writeJSON(w, r, http.StatusUnauthorized, apiResponse{OK: false, Error: "unauthorized"})
		return
	}

	var req createEducationLevelRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, r, http.StatusBadRequest, apiResponse{OK: false, Error: "invalid request body"})
		return
	}

	item, err := h.svc.CreateEducationLevel(r.Context(), user.ID, req.Name)
	if err != nil {
		if errors.Is(err, ErrInvalidInput) {
			writeJSON(w, r, http.StatusBadRequest, apiResponse{OK: false, Error: "name is required"})
			return
		}
		writeJSON(w, r, http.StatusBadRequest, apiResponse{OK: false, Error: err.Error()})
		return
	}
	writeJSON(w, r, http.StatusCreated, apiResponse{OK: true, Data: item})
}

func (h *Handler) UpdateEducationLevel(w http.ResponseWriter, r *http.Request) {
	user, ok := auth.CurrentUser(r.Context())
	if !ok {
		writeJSON(w, r, http.StatusUnauthorized, apiResponse{OK: false, Error: "unauthorized"})
		return
	}

	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil || id <= 0 {
		writeJSON(w, r, http.StatusBadRequest, apiResponse{OK: false, Error: "invalid id"})
		return
	}

	var req updateEducationLevelRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, r, http.StatusBadRequest, apiResponse{OK: false, Error: "invalid request body"})
		return
	}

	item, err := h.svc.UpdateEducationLevel(r.Context(), user.ID, id, req.Name)
	if err != nil {
		switch {
		case errors.Is(err, ErrInvalidInput):
			writeJSON(w, r, http.StatusBadRequest, apiResponse{OK: false, Error: "id and name are required"})
		case errors.Is(err, sql.ErrNoRows):
			writeJSON(w, r, http.StatusNotFound, apiResponse{OK: false, Error: "education level not found"})
		default:
			writeJSON(w, r, http.StatusBadRequest, apiResponse{OK: false, Error: err.Error()})
		}
		return
	}
	writeJSON(w, r, http.StatusOK, apiResponse{OK: true, Data: item})
}

func (h *Handler) DeleteEducationLevel(w http.ResponseWriter, r *http.Request) {
	user, ok := auth.CurrentUser(r.Context())
	if !ok {
		writeJSON(w, r, http.StatusUnauthorized, apiResponse{OK: false, Error: "unauthorized"})
		return
	}

	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil || id <= 0 {
		writeJSON(w, r, http.StatusBadRequest, apiResponse{OK: false, Error: "invalid id"})
		return
	}

	err = h.svc.DeleteEducationLevel(r.Context(), user.ID, id)
	if err != nil {
		switch {
		case errors.Is(err, ErrInvalidInput):
			writeJSON(w, r, http.StatusBadRequest, apiResponse{OK: false, Error: "invalid id"})
		case errors.Is(err, sql.ErrNoRows):
			writeJSON(w, r, http.StatusNotFound, apiResponse{OK: false, Error: "education level not found"})
		default:
			writeJSON(w, r, http.StatusBadRequest, apiResponse{OK: false, Error: err.Error()})
		}
		return
	}

	writeJSON(w, r, http.StatusOK, apiResponse{OK: true, Data: map[string]string{"status": "deleted"}})
}

func (h *Handler) CreateSchool(w http.ResponseWriter, r *http.Request) {
	user, ok := auth.CurrentUser(r.Context())
	if !ok {
		writeJSON(w, r, http.StatusUnauthorized, apiResponse{OK: false, Error: "unauthorized"})
		return
	}

	var req createSchoolRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, r, http.StatusBadRequest, apiResponse{OK: false, Error: "invalid request body"})
		return
	}

	school, err := h.svc.CreateSchool(r.Context(), user.ID, CreateSchoolInput{
		Name:    req.Name,
		Code:    req.Code,
		Address: req.Address,
	})
	if err != nil {
		if errors.Is(err, ErrInvalidInput) {
			writeJSON(w, r, http.StatusBadRequest, apiResponse{OK: false, Error: "name is required"})
			return
		}
		writeJSON(w, r, http.StatusBadRequest, apiResponse{OK: false, Error: err.Error()})
		return
	}

	writeJSON(w, r, http.StatusCreated, apiResponse{OK: true, Data: school})
}

func (h *Handler) UpdateSchool(w http.ResponseWriter, r *http.Request) {
	user, ok := auth.CurrentUser(r.Context())
	if !ok {
		writeJSON(w, r, http.StatusUnauthorized, apiResponse{OK: false, Error: "unauthorized"})
		return
	}

	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil || id <= 0 {
		writeJSON(w, r, http.StatusBadRequest, apiResponse{OK: false, Error: "invalid id"})
		return
	}

	var req updateSchoolRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, r, http.StatusBadRequest, apiResponse{OK: false, Error: "invalid request body"})
		return
	}

	item, err := h.svc.UpdateSchool(r.Context(), user.ID, id, UpdateSchoolInput{
		Name:    req.Name,
		Code:    req.Code,
		Address: req.Address,
	})
	if err != nil {
		switch {
		case errors.Is(err, ErrInvalidInput):
			writeJSON(w, r, http.StatusBadRequest, apiResponse{OK: false, Error: "id and name are required"})
		case errors.Is(err, sql.ErrNoRows):
			writeJSON(w, r, http.StatusNotFound, apiResponse{OK: false, Error: "school not found"})
		default:
			writeJSON(w, r, http.StatusBadRequest, apiResponse{OK: false, Error: err.Error()})
		}
		return
	}
	writeJSON(w, r, http.StatusOK, apiResponse{OK: true, Data: item})
}

func (h *Handler) DeleteSchool(w http.ResponseWriter, r *http.Request) {
	user, ok := auth.CurrentUser(r.Context())
	if !ok {
		writeJSON(w, r, http.StatusUnauthorized, apiResponse{OK: false, Error: "unauthorized"})
		return
	}

	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil || id <= 0 {
		writeJSON(w, r, http.StatusBadRequest, apiResponse{OK: false, Error: "invalid id"})
		return
	}

	err = h.svc.DeleteSchool(r.Context(), user.ID, id)
	if err != nil {
		switch {
		case errors.Is(err, ErrInvalidInput):
			writeJSON(w, r, http.StatusBadRequest, apiResponse{OK: false, Error: "invalid id"})
		case errors.Is(err, sql.ErrNoRows):
			writeJSON(w, r, http.StatusNotFound, apiResponse{OK: false, Error: "school not found"})
		default:
			writeJSON(w, r, http.StatusBadRequest, apiResponse{OK: false, Error: err.Error()})
		}
		return
	}
	writeJSON(w, r, http.StatusOK, apiResponse{OK: true, Data: map[string]string{"status": "deleted"}})
}

func (h *Handler) CreateClass(w http.ResponseWriter, r *http.Request) {
	user, ok := auth.CurrentUser(r.Context())
	if !ok {
		writeJSON(w, r, http.StatusUnauthorized, apiResponse{OK: false, Error: "unauthorized"})
		return
	}

	var req createClassRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, r, http.StatusBadRequest, apiResponse{OK: false, Error: "invalid request body"})
		return
	}

	class, err := h.svc.CreateClass(r.Context(), user.ID, CreateClassInput{
		SchoolID:   req.SchoolID,
		Name:       req.Name,
		GradeLevel: req.GradeLevel,
	})
	if err != nil {
		if errors.Is(err, ErrInvalidInput) {
			writeJSON(w, r, http.StatusBadRequest, apiResponse{OK: false, Error: "school_id, name, and grade_level are required"})
			return
		}
		writeJSON(w, r, http.StatusBadRequest, apiResponse{OK: false, Error: err.Error()})
		return
	}

	writeJSON(w, r, http.StatusCreated, apiResponse{OK: true, Data: class})
}

func (h *Handler) UpdateClass(w http.ResponseWriter, r *http.Request) {
	user, ok := auth.CurrentUser(r.Context())
	if !ok {
		writeJSON(w, r, http.StatusUnauthorized, apiResponse{OK: false, Error: "unauthorized"})
		return
	}

	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil || id <= 0 {
		writeJSON(w, r, http.StatusBadRequest, apiResponse{OK: false, Error: "invalid id"})
		return
	}

	var req updateClassRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, r, http.StatusBadRequest, apiResponse{OK: false, Error: "invalid request body"})
		return
	}

	item, err := h.svc.UpdateClass(r.Context(), user.ID, id, UpdateClassInput{
		SchoolID:   req.SchoolID,
		Name:       req.Name,
		GradeLevel: req.GradeLevel,
	})
	if err != nil {
		switch {
		case errors.Is(err, ErrInvalidInput):
			writeJSON(w, r, http.StatusBadRequest, apiResponse{OK: false, Error: "id, school_id, name, and grade_level are required"})
		case errors.Is(err, sql.ErrNoRows):
			writeJSON(w, r, http.StatusNotFound, apiResponse{OK: false, Error: "class not found"})
		default:
			writeJSON(w, r, http.StatusBadRequest, apiResponse{OK: false, Error: err.Error()})
		}
		return
	}
	writeJSON(w, r, http.StatusOK, apiResponse{OK: true, Data: item})
}

func (h *Handler) DeleteClass(w http.ResponseWriter, r *http.Request) {
	user, ok := auth.CurrentUser(r.Context())
	if !ok {
		writeJSON(w, r, http.StatusUnauthorized, apiResponse{OK: false, Error: "unauthorized"})
		return
	}

	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil || id <= 0 {
		writeJSON(w, r, http.StatusBadRequest, apiResponse{OK: false, Error: "invalid id"})
		return
	}

	err = h.svc.DeleteClass(r.Context(), user.ID, id)
	if err != nil {
		switch {
		case errors.Is(err, ErrInvalidInput):
			writeJSON(w, r, http.StatusBadRequest, apiResponse{OK: false, Error: "invalid id"})
		case errors.Is(err, sql.ErrNoRows):
			writeJSON(w, r, http.StatusNotFound, apiResponse{OK: false, Error: "class not found"})
		default:
			writeJSON(w, r, http.StatusBadRequest, apiResponse{OK: false, Error: err.Error()})
		}
		return
	}
	writeJSON(w, r, http.StatusOK, apiResponse{OK: true, Data: map[string]string{"status": "deleted"}})
}

func (h *Handler) ImportStudentsCSV(w http.ResponseWriter, r *http.Request) {
	user, ok := auth.CurrentUser(r.Context())
	if !ok {
		writeJSON(w, r, http.StatusUnauthorized, apiResponse{OK: false, Error: "unauthorized"})
		return
	}

	if err := r.ParseMultipartForm(16 << 20); err != nil {
		writeJSON(w, r, http.StatusBadRequest, apiResponse{OK: false, Error: "invalid multipart form"})
		return
	}

	file, hdr, err := r.FormFile("file")
	if err != nil {
		writeJSON(w, r, http.StatusBadRequest, apiResponse{OK: false, Error: "file field is required"})
		return
	}
	defer file.Close()

	report, err := h.svc.ImportStudentsCSV(r.Context(), user.ID, file)
	if err != nil {
		writeJSON(w, r, http.StatusBadRequest, apiResponse{OK: false, Error: err.Error()})
		return
	}

	writeJSON(w, r, http.StatusOK, apiResponse{OK: true, Data: map[string]any{
		"filename": hdr.Filename,
		"report":   report,
		"summary":  "import completed",
		"ok_rows":  strconv.Itoa(report.SuccessRows),
	}})
}

func isCSVRowEmpty(row []string) bool {
	for _, col := range row {
		if strings.TrimSpace(col) != "" {
			return false
		}
	}
	return true
}

func writeJSON(w http.ResponseWriter, r *http.Request, code int, payload apiResponse) {
	apiresp.WriteLegacy(w, r, code, payload.OK, payload.Data, payload.Error)
}
