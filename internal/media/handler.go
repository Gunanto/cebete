package media

import (
	"context"
	"errors"
	"io"
	"net/http"
	"strconv"

	"cbtlms/internal/app/apiresp"

	"github.com/go-chi/chi/v5"
)

type mediaService interface {
	UploadQuestionImage(ctx context.Context, raw []byte, contentType, ext string) (*UploadResult, error)
	DownloadQuestionImage(ctx context.Context, key string) (*ObjectResult, error)
}

type Handler struct {
	svc mediaService
}

func NewHandler(svc mediaService) *Handler {
	return &Handler{svc: svc}
}

func (h *Handler) UploadQuestionImage(w http.ResponseWriter, r *http.Request) {
	if err := r.ParseMultipartForm(3 << 20); err != nil {
		apiresp.WriteError(w, r, http.StatusBadRequest, "invalid multipart form")
		return
	}
	file, _, err := r.FormFile("file")
	if err != nil {
		apiresp.WriteError(w, r, http.StatusBadRequest, "file is required")
		return
	}
	defer file.Close()

	raw, err := io.ReadAll(io.LimitReader(file, QuestionImageMaxBytes+1))
	if err != nil {
		apiresp.WriteError(w, r, http.StatusBadRequest, "failed to read file")
		return
	}
	if len(raw) == 0 {
		apiresp.WriteError(w, r, http.StatusBadRequest, "file is empty")
		return
	}
	if len(raw) > QuestionImageMaxBytes {
		apiresp.WriteError(w, r, http.StatusBadRequest, "ukuran gambar maksimal 2MB")
		return
	}

	contentType, ext, err := DetectImageType(raw)
	if err != nil {
		if errors.Is(err, ErrUnsupportedContentType) {
			apiresp.WriteError(w, r, http.StatusBadRequest, "format file harus jpg/png/webp")
			return
		}
		apiresp.WriteError(w, r, http.StatusBadRequest, "file tidak valid")
		return
	}

	out, err := h.svc.UploadQuestionImage(r.Context(), raw, contentType, ext)
	if err != nil {
		switch {
		case errors.Is(err, ErrMediaUnavailable):
			apiresp.WriteError(w, r, http.StatusServiceUnavailable, "media storage belum siap")
		case errors.Is(err, ErrInvalidInput):
			apiresp.WriteError(w, r, http.StatusBadRequest, "invalid upload payload")
		default:
			apiresp.WriteError(w, r, http.StatusInternalServerError, "gagal upload gambar")
		}
		return
	}

	apiresp.WriteOK(w, r, http.StatusOK, out)
}

func (h *Handler) ServeQuestionImage(w http.ResponseWriter, r *http.Request) {
	key := chi.URLParam(r, "*")
	if key == "" {
		apiresp.WriteError(w, r, http.StatusBadRequest, "invalid image key")
		return
	}
	out, err := h.svc.DownloadQuestionImage(r.Context(), key)
	if err != nil {
		switch {
		case errors.Is(err, ErrInvalidInput):
			apiresp.WriteError(w, r, http.StatusBadRequest, "invalid image key")
		case errors.Is(err, ErrObjectNotFound):
			apiresp.WriteError(w, r, http.StatusNotFound, "image not found")
		case errors.Is(err, ErrMediaUnavailable):
			apiresp.WriteError(w, r, http.StatusServiceUnavailable, "media storage belum siap")
		default:
			apiresp.WriteError(w, r, http.StatusInternalServerError, "gagal mengambil gambar")
		}
		return
	}
	defer out.Reader.Close()

	contentType := out.ContentType
	if contentType == "" {
		contentType = "application/octet-stream"
	}
	w.Header().Set("Content-Type", contentType)
	if out.Size > 0 {
		w.Header().Set("Content-Length", strconv.FormatInt(out.Size, 10))
	}
	w.Header().Set("Cache-Control", "private, max-age=86400")
	w.WriteHeader(http.StatusOK)
	_, _ = io.Copy(w, out.Reader)
}
