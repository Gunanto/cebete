package exam

import (
	"bytes"
	"testing"
	"time"

	"github.com/xuri/excelize/v2"
)

func TestBuildExamParticipantResultsExcelWritesAnswerKeyRow(t *testing.T) {
	start := time.Date(2026, 3, 11, 8, 0, 0, 0, time.UTC)
	end := start.Add(30 * time.Minute)

	buf, err := buildExamParticipantResultsExcel(&ExamParticipantResult{
		QuestionNos: []int{1, 2, 3},
		AnswerKeys:  []string{"A", "B,C", "T,F"},
		TotalWeight: 3,
		Rows: []ExamParticipantResultRow{
			{
				FullName:  "Siswa Uji",
				ClassName: ptrStringValue("X IPA 1"),
				AttemptKe: 1,
				SkorTotal: 2,
				StartedAt: start,
				EndedAt:   end,
				Answers:   []string{"A", "BC", "TFT"},
			},
		},
	})
	if err != nil {
		t.Fatalf("build excel: %v", err)
	}

	f, err := excelize.OpenReader(bytes.NewReader(buf))
	if err != nil {
		t.Fatalf("open excel: %v", err)
	}
	defer func() { _ = f.Close() }()

	sheet := f.GetSheetName(0)
	if got, err := f.GetCellValue(sheet, "A1"); err != nil || got != "Kunci Jawaban" {
		t.Fatalf("A1 = %q, %v; want Kunci Jawaban", got, err)
	}
	if got, err := f.GetCellValue(sheet, "H1"); err != nil || got != "A" {
		t.Fatalf("H1 = %q, %v; want A", got, err)
	}
	if got, err := f.GetCellValue(sheet, "I1"); err != nil || got != "B,C" {
		t.Fatalf("I1 = %q, %v; want B,C", got, err)
	}
	if got, err := f.GetCellValue(sheet, "J1"); err != nil || got != "T,F" {
		t.Fatalf("J1 = %q, %v; want T,F", got, err)
	}
	if got, err := f.GetCellValue(sheet, "H2"); err != nil || got != "1" {
		t.Fatalf("H2 = %q, %v; want 1", got, err)
	}
	if got, err := f.GetCellValue(sheet, "A3"); err != nil || got != "Siswa Uji" {
		t.Fatalf("A3 = %q, %v; want Siswa Uji", got, err)
	}
}

func ptrStringValue(v string) *string {
	return &v
}
