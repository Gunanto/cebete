package monitor

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

type Notifier interface {
	SendText(ctx context.Context, text string) error
}

type ButtonNotifier interface {
	SendTextWithButton(ctx context.Context, text, buttonText, buttonURL string) error
}

type TelegramNotifier struct {
	botToken string
	chatID   string
	client   *http.Client
}

func NewTelegramNotifier(botToken, chatID string) *TelegramNotifier {
	return &TelegramNotifier{
		botToken: strings.TrimSpace(botToken),
		chatID:   strings.TrimSpace(chatID),
		client: &http.Client{
			Timeout: 15 * time.Second,
		},
	}
}

func (t *TelegramNotifier) SendText(ctx context.Context, text string) error {
	text = strings.TrimSpace(text)
	if text == "" {
		return nil
	}

	form := url.Values{}
	form.Set("chat_id", t.chatID)
	form.Set("text", text)

	req, err := http.NewRequestWithContext(ctx, http.MethodPost,
		fmt.Sprintf("https://api.telegram.org/bot%s/sendMessage", t.botToken),
		strings.NewReader(form.Encode()),
	)
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	resp, err := t.client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		b, _ := io.ReadAll(io.LimitReader(resp.Body, 2048))
		return fmt.Errorf("telegram sendMessage failed: status=%s body=%q", resp.Status, strings.TrimSpace(string(b)))
	}
	// Ignore body.
	return nil
}

func (t *TelegramNotifier) SendTextWithButton(ctx context.Context, text, buttonText, buttonURL string) error {
	text = strings.TrimSpace(text)
	buttonText = strings.TrimSpace(buttonText)
	buttonURL = strings.TrimSpace(buttonURL)
	if text == "" {
		return nil
	}
	if buttonText == "" || buttonURL == "" {
		return t.SendText(ctx, text)
	}

	// Use JSON so we can pass reply_markup.
	type inlineButton struct {
		Text string `json:"text"`
		URL  string `json:"url"`
	}
	type replyMarkup struct {
		InlineKeyboard [][]inlineButton `json:"inline_keyboard"`
	}
	payload := struct {
		ChatID                string      `json:"chat_id"`
		Text                  string      `json:"text"`
		DisableWebPagePreview bool        `json:"disable_web_page_preview"`
		ReplyMarkup           replyMarkup `json:"reply_markup"`
	}{
		ChatID:                t.chatID,
		Text:                  text,
		DisableWebPagePreview: true,
		ReplyMarkup: replyMarkup{
			InlineKeyboard: [][]inlineButton{
				{
					{Text: buttonText, URL: buttonURL},
				},
			},
		},
	}

	b, err := json.Marshal(payload)
	if err != nil {
		return err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost,
		fmt.Sprintf("https://api.telegram.org/bot%s/sendMessage", t.botToken),
		bytes.NewReader(b),
	)
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := t.client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 2048))
		return fmt.Errorf("telegram sendMessage failed: status=%s body=%q", resp.Status, strings.TrimSpace(string(body)))
	}
	return nil
}
