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
	if got, err := f.GetCellValue(sheet, "I2"); err != nil || got != "Durasi" {
		t.Fatalf("I2 = %q, %v; want Durasi", got, err)
	}
	if got, err := f.GetCellValue(sheet, "J1"); err != nil || got != "A" {
		t.Fatalf("J1 = %q, %v; want A", got, err)
	}
	if got, err := f.GetCellValue(sheet, "K1"); err != nil || got != "B,C" {
		t.Fatalf("K1 = %q, %v; want B,C", got, err)
	}
	if got, err := f.GetCellValue(sheet, "L1"); err != nil || got != "T,F" {
		t.Fatalf("L1 = %q, %v; want T,F", got, err)
	}
	if got, err := f.GetCellValue(sheet, "J2"); err != nil || got != "1" {
		t.Fatalf("J2 = %q, %v; want 1", got, err)
	}
	if got, err := f.GetCellValue(sheet, "A3"); err != nil || got != "Siswa Uji" {
		t.Fatalf("A3 = %q, %v; want Siswa Uji", got, err)
	}
	if got, err := f.GetCellValue(sheet, "I3"); err != nil || got != "30 menit 0 detik" {
		t.Fatalf("I3 = %q, %v; want 30 menit 0 detik", got, err)
	}
}

func TestFilterExamParticipantResultBySchool(t *testing.T) {
	target := "SMA 1"
	other := "SMA 2"
	matrix := &ExamParticipantResult{
		ExamID:      12,
		QuestionNos: []int{1, 2},
		AnswerKeys:  []string{"A", "B"},
		Rows: []ExamParticipantResultRow{
			{FullName: "Peserta A", SchoolName: &target, AttemptID: 1},
			{FullName: "Peserta B", SchoolName: &other, AttemptID: 2},
			{FullName: "Peserta C", AttemptID: 3},
		},
	}

	out := filterExamParticipantResultBySchool(matrix, &target)
	if out == nil {
		t.Fatalf("filter output is nil")
	}
	if got := len(out.Rows); got != 1 {
		t.Fatalf("len(rows) = %d, want 1", got)
	}
	if got := out.Rows[0].FullName; got != "Peserta A" {
		t.Fatalf("row[0].FullName = %q, want Peserta A", got)
	}
	if got := len(matrix.Rows); got != 3 {
		t.Fatalf("source matrix mutated, len(rows) = %d, want 3", got)
	}
}

func ptrStringValue(v string) *string {
	return &v
}
