package question

import (
	"encoding/json"
	"testing"
)

func TestValidateAnswerKey(t *testing.T) {
	tests := []struct {
		name         string
		questionType string
		answerKey    string
		wantErr      bool
	}{
		{name: "pg_tunggal valid", questionType: "pg_tunggal", answerKey: `{"correct":"B"}`, wantErr: false},
		{name: "pg_tunggal invalid", questionType: "pg_tunggal", answerKey: `{"correct":[]}`, wantErr: true},
		{name: "multi valid exact", questionType: "multi_jawaban", answerKey: `{"correct":["A","D"],"mode":"exact"}`, wantErr: false},
		{name: "multi valid without mode", questionType: "multi_jawaban", answerKey: `{"correct":["A","D"]}`, wantErr: false},
		{name: "multi invalid mode", questionType: "multi_jawaban", answerKey: `{"correct":["A","D"],"mode":"partial"}`, wantErr: true},
		{name: "multi invalid duplicate", questionType: "multi_jawaban", answerKey: `{"correct":["A","A"]}`, wantErr: true},
		{name: "bs valid", questionType: "benar_salah_pernyataan", answerKey: `{"statements":[{"id":"s1","correct":true},{"id":"s2","correct":false}]}`, wantErr: false},
		{name: "bs invalid duplicate id", questionType: "benar_salah_pernyataan", answerKey: `{"statements":[{"id":"s1","correct":true},{"id":"s1","correct":false}]}`, wantErr: true},
		{name: "bs invalid empty", questionType: "benar_salah_pernyataan", answerKey: `{"statements":[]}`, wantErr: true},
		{name: "matching valid", questionType: "menjodohkan_drag_drop", answerKey: `{"mode":"exact","pairs":[{"prompt_id":"P1","choice_id":"C2"},{"prompt_id":"P2","choice_id":"C1"}]}`, wantErr: false},
		{name: "matching invalid duplicate prompt", questionType: "menjodohkan_drag_drop", answerKey: `{"pairs":[{"prompt_id":"P1","choice_id":"C2"},{"prompt_id":"P1","choice_id":"C1"}]}`, wantErr: true},
		{name: "unsupported type", questionType: "isian", answerKey: `{"correct":"x"}`, wantErr: true},
		{name: "invalid json", questionType: "pg_tunggal", answerKey: `{"correct":`, wantErr: true},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			err := validateAnswerKey(tc.questionType, json.RawMessage(tc.answerKey))
			if tc.wantErr && err == nil {
				t.Fatalf("expected error, got nil")
			}
			if !tc.wantErr && err != nil {
				t.Fatalf("expected no error, got %v", err)
			}
		})
	}
}

func TestNormalizeAndValidateOptions(t *testing.T) {
	t.Run("mc valid", func(t *testing.T) {
		out, correct, err := normalizeAndValidateOptions(
			"pg_tunggal",
			[]QuestionOptionInput{
				{OptionKey: "a", OptionHTML: "<p>A</p>"},
				{OptionKey: "b", OptionHTML: "<p>B</p>"},
			},
			json.RawMessage(`{"correct":"A"}`),
		)
		if err != nil {
			t.Fatalf("expected no error, got %v", err)
		}
		if len(out) != 2 {
			t.Fatalf("expected 2 options, got %d", len(out))
		}
		if !correct["A"] {
			t.Fatalf("expected correct key A")
		}
	})

	t.Run("mr invalid unknown key", func(t *testing.T) {
		_, _, err := normalizeAndValidateOptions(
			"multi_jawaban",
			[]QuestionOptionInput{
				{OptionKey: "A", OptionHTML: "<p>A</p>"},
				{OptionKey: "B", OptionHTML: "<p>B</p>"},
			},
			json.RawMessage(`{"correct":["A","C"],"mode":"exact"}`),
		)
		if err == nil {
			t.Fatalf("expected error for unknown answer_key option")
		}
	})

	t.Run("tf ignore options", func(t *testing.T) {
		out, correct, err := normalizeAndValidateOptions(
			"benar_salah_pernyataan",
			[]QuestionOptionInput{
				{OptionKey: "A", OptionHTML: "<p>A</p>"},
			},
			json.RawMessage(`{"statements":[{"id":"s1","correct":true}]}`),
		)
		if err != nil {
			t.Fatalf("expected no error, got %v", err)
		}
		if out != nil || correct != nil {
			t.Fatalf("expected nil output for tf, got out=%v correct=%v", out, correct)
		}
	})

	t.Run("matching ignore options", func(t *testing.T) {
		out, correct, err := normalizeAndValidateOptions(
			"menjodohkan_drag_drop",
			[]QuestionOptionInput{
				{OptionKey: "A", OptionHTML: "<p>A</p>"},
			},
			json.RawMessage(`{"pairs":[{"prompt_id":"P1","choice_id":"C1"}]}`),
		)
		if err != nil {
			t.Fatalf("expected no error, got %v", err)
		}
		if out != nil || correct != nil {
			t.Fatalf("expected nil output for matching, got out=%v correct=%v", out, correct)
		}
	})
}

func TestNormalizeQuestionContentAndMatchingReferences(t *testing.T) {
	raw := json.RawMessage(`{
		"prompts":[{"id":"P1","html":"<p>Satu</p>"},{"id":"P2","html":"<p>Dua</p>"}],
		"choices":[{"id":"C1","html":"<p>A</p>"},{"id":"C2","html":"<p>B</p>"}],
		"note_html":"<p>Catatan</p>"
	}`)
	normalized, err := normalizeQuestionContent("menjodohkan_drag_drop", raw)
	if err != nil {
		t.Fatalf("expected no error, got %v", err)
	}
	if err := validateMatchingReferences(normalized, json.RawMessage(`{"pairs":[{"prompt_id":"P1","choice_id":"C2"},{"prompt_id":"P2","choice_id":"C1"}]}`)); err != nil {
		t.Fatalf("expected valid references, got %v", err)
	}
	if err := validateMatchingReferences(normalized, json.RawMessage(`{"pairs":[{"prompt_id":"P9","choice_id":"C2"},{"prompt_id":"P2","choice_id":"C1"}]}`)); err == nil {
		t.Fatalf("expected invalid references error")
	}
}
