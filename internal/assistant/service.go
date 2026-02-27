package assistant

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

const defaultPrompt = "Anda adalah asisten AI untuk platform ujian sekolah bernama g-cbt. Jawab singkat, jelas, dan profesional dalam bahasa Indonesia. Fokus pada login, token ujian, kendala submit, waktu ujian, dan etika ujian."

type ServiceConfig struct {
	GeminiAPIKey string
	GeminiModel  string
	HTTPClient   *http.Client
}

type Service struct {
	geminiAPIKey string
	geminiModel  string
	client       *http.Client
}

type Result struct {
	Reply  string
	Source string
}

func NewService(cfg ServiceConfig) *Service {
	model := strings.TrimSpace(cfg.GeminiModel)
	if model == "" {
		model = "gemini-2.5-flash"
	}
	client := cfg.HTTPClient
	if client == nil {
		client = &http.Client{Timeout: 18 * time.Second}
	}
	return &Service{
		geminiAPIKey: strings.TrimSpace(cfg.GeminiAPIKey),
		geminiModel:  model,
		client:       client,
	}
}

func (s *Service) Generate(ctx context.Context, query string) (Result, error) {
	q := strings.TrimSpace(query)
	if q == "" {
		return Result{}, fmt.Errorf("query is required")
	}
	if len(q) > 1200 {
		return Result{}, fmt.Errorf("query too long")
	}
	if isCheatingQuery(q) {
		return Result{Reply: refusalReply(), Source: "policy"}, nil
	}

	if s.geminiAPIKey == "" {
		return Result{Reply: localReply(q), Source: "local"}, nil
	}

	reply, err := s.generateWithGemini(ctx, q)
	if err != nil {
		return Result{Reply: localReply(q), Source: "local_fallback"}, nil
	}
	return Result{Reply: reply, Source: "gemini"}, nil
}

func (s *Service) generateWithGemini(ctx context.Context, query string) (string, error) {
	reqBody := map[string]any{
		"contents": []map[string]any{
			{
				"parts": []map[string]string{
					{"text": query},
				},
			},
		},
		"systemInstruction": map[string]any{
			"parts": []map[string]string{
				{"text": defaultPrompt},
			},
		},
		"generationConfig": map[string]any{
			"temperature":     0.4,
			"maxOutputTokens": 320,
		},
	}

	body, err := json.Marshal(reqBody)
	if err != nil {
		return "", err
	}

	url := fmt.Sprintf("https://generativelanguage.googleapis.com/v1beta/models/%s:generateContent?key=%s", s.geminiModel, s.geminiAPIKey)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := s.client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	raw, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if err != nil {
		return "", err
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return "", fmt.Errorf("gemini status %d", resp.StatusCode)
	}

	var out geminiGenerateResponse
	if err := json.Unmarshal(raw, &out); err != nil {
		return "", err
	}
	if out.hasIncompleteFinishReason() {
		return "", fmt.Errorf("incomplete gemini response: %s", out.firstFinishReason())
	}
	reply := strings.TrimSpace(out.firstText())
	if reply == "" {
		return "", fmt.Errorf("empty gemini response")
	}
	if isLikelyTruncatedReply(reply) {
		return "", fmt.Errorf("truncated gemini response")
	}
	return reply, nil
}

func localReply(query string) string {
	q := strings.ToLower(strings.TrimSpace(query))
	if isCheatingQuery(q) {
		return refusalReply()
	}
	switch {
	case strings.Contains(q, "login"), strings.Contains(q, "masuk"):
		return "Klik Masuk ke Sistem Ujian, lalu login dengan akun resmi sekolah. Pastikan username/email dan password benar."
	case strings.Contains(q, "token"):
		return "Token ujian diberikan proktor. Pastikan token sesuai sesi aktif dan belum kedaluwarsa."
	case strings.Contains(q, "submit"), strings.Contains(q, "kirim"):
		return "Sebelum submit, cek nomor soal yang masih kosong. Jika sudah yakin, klik Submit sekali dan tunggu konfirmasi sukses."
	case strings.Contains(q, "waktu"), strings.Contains(q, "timer"):
		return "Timer mengikuti waktu server. Simpan jawaban berkala dan selesaikan sebelum waktu habis."
	case strings.Contains(q, "error"), strings.Contains(q, "gagal"):
		return "Coba refresh halaman, login ulang, dan cek koneksi. Jika tetap gagal, laporkan ke proktor beserta jam kejadian."
	default:
		return "Saya bisa bantu seputar login, token ujian, timer, submit, dan kendala teknis CBT. Jelaskan masalah Anda singkat."
	}
}

func isCheatingQuery(query string) bool {
	q := strings.ToLower(strings.TrimSpace(query))
	keywords := []string{
		"jawab soal",
		"menjawab soal",
		"jawaban soal",
		"bantu jawab",
		"membantu saya menjawab",
		"kunci jawaban",
		"contekan",
		"cheat",
		"bocoran",
		"kerjain soal",
	}
	for _, kw := range keywords {
		if strings.Contains(q, kw) {
			return true
		}
	}
	return false
}

func refusalReply() string {
	return "Saya tidak dapat membantu menjawab soal ujian secara langsung atau memberi kunci jawaban. Saya bisa bantu memahami materi, langkah penyelesaian, dan strategi belajar agar Anda bisa menjawab mandiri."
}

func isLikelyTruncatedReply(reply string) bool {
	s := strings.TrimSpace(strings.ToLower(reply))
	if s == "" {
		return true
	}
	if strings.HasSuffix(s, ".") || strings.HasSuffix(s, "!") || strings.HasSuffix(s, "?") {
		return false
	}
	if len(s) < 80 {
		return true
	}
	badEndings := []string{
		"dan",
		"atau",
		"karena",
		"sebagai",
		"adalah",
		"untuk",
		"dengan",
		"yang",
		"jika",
		"agar",
	}
	for _, end := range badEndings {
		if strings.HasSuffix(s, " "+end) || s == end {
			return true
		}
	}
	return false
}

type geminiGenerateResponse struct {
	Candidates []struct {
		FinishReason string `json:"finishReason"`
		Content      struct {
			Parts []struct {
				Text string `json:"text"`
			} `json:"parts"`
		} `json:"content"`
	} `json:"candidates"`
}

func (r geminiGenerateResponse) hasIncompleteFinishReason() bool {
	for _, c := range r.Candidates {
		reason := strings.ToUpper(strings.TrimSpace(c.FinishReason))
		if reason == "" || reason == "STOP" {
			continue
		}
		if reason == "MAX_TOKENS" || reason == "OTHER" || reason == "SAFETY" {
			return true
		}
	}
	return false
}

func (r geminiGenerateResponse) firstFinishReason() string {
	for _, c := range r.Candidates {
		reason := strings.TrimSpace(c.FinishReason)
		if reason != "" {
			return reason
		}
	}
	return "unknown"
}

func (r geminiGenerateResponse) firstText() string {
	for _, c := range r.Candidates {
		for _, p := range c.Content.Parts {
			if strings.TrimSpace(p.Text) != "" {
				return p.Text
			}
		}
	}
	return ""
}
