package exam

import (
	"encoding/json"
	"testing"
)

func TestValidateMatchingAnswerPayload(t *testing.T) {
	questionContent := json.RawMessage(`{
		"prompts":[{"id":"P1"},{"id":"P2"}],
		"choices":[{"id":"C1"},{"id":"C2"}]
	}`)

	tests := []struct {
		name    string
		payload string
		wantErr bool
	}{
		{name: "empty object allowed", payload: `{}`, wantErr: false},
		{name: "partial subset allowed", payload: `{"pairs":[{"prompt_id":"P1","choice_id":"C2"}]}`, wantErr: false},
		{name: "full valid", payload: `{"pairs":[{"prompt_id":"P1","choice_id":"C2"},{"prompt_id":"P2","choice_id":"C1"}]}`, wantErr: false},
		{name: "unknown prompt", payload: `{"pairs":[{"prompt_id":"P9","choice_id":"C2"}]}`, wantErr: true},
		{name: "unknown choice", payload: `{"pairs":[{"prompt_id":"P1","choice_id":"C9"}]}`, wantErr: true},
		{name: "duplicate prompt", payload: `{"pairs":[{"prompt_id":"P1","choice_id":"C2"},{"prompt_id":"P1","choice_id":"C1"}]}`, wantErr: true},
		{name: "duplicate choice", payload: `{"pairs":[{"prompt_id":"P1","choice_id":"C2"},{"prompt_id":"P2","choice_id":"C2"}]}`, wantErr: true},
		{name: "invalid shape", payload: `{"pairs":"bad"}`, wantErr: true},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			err := validateMatchingAnswerPayload(questionContent, json.RawMessage(tc.payload))
			if tc.wantErr && err == nil {
				t.Fatalf("expected error, got nil")
			}
			if !tc.wantErr && err != nil {
				t.Fatalf("expected no error, got %v", err)
			}
		})
	}
}

func TestValidateAnswerPayload_NonMatchingPassThrough(t *testing.T) {
	if err := validateAnswerPayload("pg_tunggal", nil, json.RawMessage(`{"selected":"A"}`)); err != nil {
		t.Fatalf("expected no error, got %v", err)
	}
}

func TestValidateShortAnswerPayload(t *testing.T) {
	questionContent := json.RawMessage(`{"max_length":33}`)

	tests := []struct {
		name    string
		payload string
		wantErr bool
	}{
		{name: "empty object allowed", payload: `{}`, wantErr: false},
		{name: "empty text allowed", payload: `{"text":""}`, wantErr: false},
		{name: "valid text", payload: `{"text":"Jakarta"}`, wantErr: false},
		{name: "non string text", payload: `{"text":123}`, wantErr: true},
		{name: "too long", payload: `{"text":"1234567890123456789012345678901234"}`, wantErr: true},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			err := validateAnswerPayload("short_answer", questionContent, json.RawMessage(tc.payload))
			if tc.wantErr && err == nil {
				t.Fatalf("expected error, got nil")
			}
			if !tc.wantErr && err != nil {
				t.Fatalf("expected no error, got %v", err)
			}
		})
	}
}
