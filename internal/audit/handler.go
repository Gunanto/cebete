package audit

import (
	"net/http"
	"strconv"
	"strings"

	"cbtlms/internal/app/apiresp"
)

type Handler struct {
	svc *Service
}

func NewHandler(svc *Service) *Handler {
	return &Handler{svc: svc}
}

func (h *Handler) ListAuditLogs(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	limit := parseInt(q.Get("limit"), 50)
	offset := parseInt(q.Get("offset"), 0)
	userID := int64(parseInt(q.Get("user_id"), 0))

	items, err := h.svc.ListAuditLogs(r.Context(), ListAuditInput{
		Action:     strings.TrimSpace(q.Get("action")),
		EntityType: strings.TrimSpace(q.Get("entity_type")),
		EntityID:   strings.TrimSpace(q.Get("entity_id")),
		UserID:     userID,
		Limit:      limit,
		Offset:     offset,
	})
	if err != nil {
		apiresp.WriteError(w, r, http.StatusInternalServerError, "internal error")
		return
	}
	apiresp.WriteOK(w, r, http.StatusOK, items)
}

func parseInt(raw string, fallback int) int {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return fallback
	}
	n, err := strconv.Atoi(raw)
	if err != nil {
		return fallback
	}
	return n
}
