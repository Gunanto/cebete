package media

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"
)

type mockMediaService struct {
	uploadFn   func(ctx context.Context, raw []byte, contentType, ext string) (*UploadResult, error)
	downloadFn func(ctx context.Context, key string) (*ObjectResult, error)
}

func (m *mockMediaService) UploadQuestionImage(ctx context.Context, raw []byte, contentType, ext string) (*UploadResult, error) {
	if m.uploadFn == nil {
		return nil, errors.New("not implemented")
	}
	return m.uploadFn(ctx, raw, contentType, ext)
}

func (m *mockMediaService) DownloadQuestionImage(ctx context.Context, key string) (*ObjectResult, error) {
	if m.downloadFn == nil {
		return nil, errors.New("not implemented")
	}
	return m.downloadFn(ctx, key)
}

func decodeEnvelope(t *testing.T, rr *httptest.ResponseRecorder) map[string]any {
	t.Helper()
	var out map[string]any
	if err := json.Unmarshal(rr.Body.Bytes(), &out); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	return out
}

func makeMultipartImageRequest(t *testing.T, data []byte) *http.Request {
	t.Helper()
	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	part, err := writer.CreateFormFile("file", "image.png")
	if err != nil {
		t.Fatalf("create part: %v", err)
	}
	if _, err := part.Write(data); err != nil {
		t.Fatalf("write part: %v", err)
	}
	if err := writer.Close(); err != nil {
		t.Fatalf("close writer: %v", err)
	}
	req := httptest.NewRequest(http.MethodPost, "/api/v1/media/question-images", &body)
	req.Header.Set("Content-Type", writer.FormDataContentType())
	return req
}

func TestUploadQuestionImageSuccess(t *testing.T) {
	h := NewHandler(&mockMediaService{
		uploadFn: func(ctx context.Context, raw []byte, contentType, ext string) (*UploadResult, error) {
			if contentType != "image/png" {
				t.Fatalf("unexpected content type: %s", contentType)
			}
			if ext != ".png" {
				t.Fatalf("unexpected ext: %s", ext)
			}
			return &UploadResult{
				Key:         "question-images/test.png",
				URL:         "/api/v1/media/question-images/question-images/test.png",
				ContentType: contentType,
				Size:        int64(len(raw)),
			}, nil
		},
	})

	png := []byte{0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00}
	req := makeMultipartImageRequest(t, png)
	rr := httptest.NewRecorder()

	h.UploadQuestionImage(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", rr.Code, rr.Body.String())
	}
	out := decodeEnvelope(t, rr)
	if out["ok"] != true {
		t.Fatalf("expected ok=true, got %+v", out)
	}
}

func TestUploadQuestionImageTooLarge(t *testing.T) {
	h := NewHandler(&mockMediaService{
		uploadFn: func(ctx context.Context, raw []byte, contentType, ext string) (*UploadResult, error) {
			t.Fatalf("upload should not be called")
			return nil, nil
		},
	})

	oversize := bytes.Repeat([]byte("a"), QuestionImageMaxBytes+1)
	req := makeMultipartImageRequest(t, oversize)
	rr := httptest.NewRecorder()

	h.UploadQuestionImage(rr, req)

	if rr.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, body = %s", rr.Code, rr.Body.String())
	}
}

func TestUploadQuestionImageUnavailable(t *testing.T) {
	h := NewHandler(&mockMediaService{
		uploadFn: func(ctx context.Context, raw []byte, contentType, ext string) (*UploadResult, error) {
			return nil, ErrMediaUnavailable
		},
	})

	png := []byte{0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00}
	req := makeMultipartImageRequest(t, png)
	rr := httptest.NewRecorder()

	h.UploadQuestionImage(rr, req)

	if rr.Code != http.StatusServiceUnavailable {
		t.Fatalf("status = %d, body = %s", rr.Code, rr.Body.String())
	}
}

func TestServeQuestionImageSuccess(t *testing.T) {
	h := NewHandler(&mockMediaService{
		downloadFn: func(ctx context.Context, key string) (*ObjectResult, error) {
			if key != "question-images/abc.png" {
				t.Fatalf("unexpected key: %s", key)
			}
			return &ObjectResult{
				ContentType: "image/png",
				Size:        3,
				Reader:      io.NopCloser(strings.NewReader("PNG")),
			}, nil
		},
	})

	req := httptest.NewRequest(http.MethodGet, "/api/v1/media/question-images/question-images/abc.png", nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("*", "question-images/abc.png")
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	rr := httptest.NewRecorder()

	h.ServeQuestionImage(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", rr.Code, rr.Body.String())
	}
	if got := rr.Header().Get("Content-Type"); got != "image/png" {
		t.Fatalf("unexpected content type: %s", got)
	}
}

func TestServeQuestionImageNotFound(t *testing.T) {
	h := NewHandler(&mockMediaService{
		downloadFn: func(ctx context.Context, key string) (*ObjectResult, error) {
			return nil, ErrObjectNotFound
		},
	})

	req := httptest.NewRequest(http.MethodGet, "/api/v1/media/question-images/question-images/missing.png", nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("*", "question-images/missing.png")
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	rr := httptest.NewRecorder()

	h.ServeQuestionImage(rr, req)

	if rr.Code != http.StatusNotFound {
		t.Fatalf("status = %d, body = %s", rr.Code, rr.Body.String())
	}
}
