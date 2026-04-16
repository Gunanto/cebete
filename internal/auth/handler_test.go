package auth

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/go-chi/chi/v5"
)

func TestCreateUserHandlerPassesTeacherAccessProfile(t *testing.T) {
	t.Parallel()

	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("sqlmock.New: %v", err)
	}
	defer db.Close()

	h := NewHandler(&Service{db: db, bcryptCost: 4})

	mock.ExpectBegin()
	mock.ExpectQuery(`SELECT EXISTS \(`).
		WithArgs("users", "teacher_access_profile").
		WillReturnRows(sqlmock.NewRows([]string{"exists"}).AddRow(true))
	mock.ExpectQuery(`INSERT INTO users \(`).
		WithArgs(
			"guruscope",
			sqlmock.AnyArg(),
			"Guru Scope",
			"guru",
			"guru.scope@example.com",
			"",
			"",
			int64(99),
			"cross_school",
		).
		WillReturnRows(sqlmock.NewRows([]string{
			"id", "username", "email", "full_name", "role", "participant_no", "nisn", "is_active", "account_status", "approved_at", "created_at",
		}).AddRow(
			int64(501), "guruscope", "guru.scope@example.com", "Guru Scope", "guru", nil, nil, true, "active", time.Now(), time.Now(),
		))
	mock.ExpectExec(`INSERT INTO auth_identities`).
		WithArgs(int64(501), "guruscope").
		WillReturnResult(sqlmock.NewResult(1, 1))
	mock.ExpectExec(`DELETE FROM user_school_scopes`).
		WithArgs(int64(501)).
		WillReturnResult(sqlmock.NewResult(0, 0))
	mock.ExpectCommit()
	mock.ExpectQuery(`SELECT s\.id, s\.name\s+FROM user_school_scopes uss`).
		WithArgs(int64(501)).
		WillReturnRows(sqlmock.NewRows([]string{"id", "name"}))

	body := bytes.NewBufferString(`{
		"username":"guru.scope",
		"email":"guru.scope@example.com",
		"password":"secret123",
		"full_name":"Guru Scope",
		"role":"guru",
		"teacher_access_profile":"cross_school"
	}`)
	req := httptest.NewRequest(http.MethodPost, "/api/v1/admin/users", body)
	req = req.WithContext(ContextWithUser(req.Context(), &User{ID: 99, Role: "admin"}))
	rec := httptest.NewRecorder()

	h.CreateUser(rec, req)

	if rec.Code != http.StatusCreated {
		t.Fatalf("expected status 201, got %d body=%s", rec.Code, rec.Body.String())
	}

	var out struct {
		OK   bool `json:"ok"`
		Data struct {
			ID                   int64  `json:"id"`
			TeacherAccessProfile string `json:"teacher_access_profile"`
		} `json:"data"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &out); err != nil {
		t.Fatalf("json.Unmarshal: %v", err)
	}
	if !out.OK {
		t.Fatalf("expected ok response, got body=%s", rec.Body.String())
	}
	if out.Data.ID != 501 {
		t.Fatalf("expected id 501, got %d", out.Data.ID)
	}
	if out.Data.TeacherAccessProfile != "cross_school" {
		t.Fatalf("expected teacher_access_profile cross_school, got %q", out.Data.TeacherAccessProfile)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("unmet sql expectations: %v", err)
	}
}

func TestUpdateUserHandlerDefaultsTeacherAccessProfileForGuru(t *testing.T) {
	t.Parallel()

	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("sqlmock.New: %v", err)
	}
	defer db.Close()

	h := NewHandler(&Service{db: db, bcryptCost: 4})

	mock.ExpectBegin()
	mock.ExpectQuery(`SELECT EXISTS \(`).
		WithArgs("users", "teacher_access_profile").
		WillReturnRows(sqlmock.NewRows([]string{"exists"}).AddRow(true))
	mock.ExpectQuery(`UPDATE users\s+SET`).
		WithArgs(
			int64(77),
			"Guru Lama",
			"guru",
			"guru.lama@example.com",
			"",
			"",
			"school",
		).
		WillReturnRows(sqlmock.NewRows([]string{
			"id", "username", "email", "full_name", "role", "participant_no", "nisn", "is_active", "account_status", "approved_at", "created_at",
		}).AddRow(
			int64(77), "guru.lama", "guru.lama@example.com", "Guru Lama", "guru", nil, nil, true, "active", time.Now(), time.Now(),
		))
	mock.ExpectExec(`DELETE FROM user_school_scopes`).
		WithArgs(int64(77)).
		WillReturnResult(sqlmock.NewResult(0, 0))
	mock.ExpectCommit()
	mock.ExpectQuery(`SELECT s\.id, s\.name\s+FROM user_school_scopes uss`).
		WithArgs(int64(77)).
		WillReturnRows(sqlmock.NewRows([]string{"id", "name"}))

	body := bytes.NewBufferString(`{
		"full_name":"Guru Lama",
		"email":"guru.lama@example.com",
		"role":"guru"
	}`)
	req := httptest.NewRequest(http.MethodPut, "/api/v1/admin/users/77", body)
	req = req.WithContext(ContextWithUser(req.Context(), &User{ID: 99, Role: "admin"}))
	req = withChiURLParam(req, "id", "77")
	rec := httptest.NewRecorder()

	h.UpdateUser(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d body=%s", rec.Code, rec.Body.String())
	}

	var out struct {
		OK   bool `json:"ok"`
		Data struct {
			ID                   int64  `json:"id"`
			TeacherAccessProfile string `json:"teacher_access_profile"`
		} `json:"data"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &out); err != nil {
		t.Fatalf("json.Unmarshal: %v", err)
	}
	if !out.OK {
		t.Fatalf("expected ok response, got body=%s", rec.Body.String())
	}
	if out.Data.ID != 77 {
		t.Fatalf("expected id 77, got %d", out.Data.ID)
	}
	if out.Data.TeacherAccessProfile != "school" {
		t.Fatalf("expected teacher_access_profile school, got %q", out.Data.TeacherAccessProfile)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("unmet sql expectations: %v", err)
	}
}

func withChiURLParam(r *http.Request, key, value string) *http.Request {
	routeCtx := chi.NewRouteContext()
	routeCtx.URLParams.Add(key, value)
	return r.WithContext(context.WithValue(r.Context(), chi.RouteCtxKey, routeCtx))
}
