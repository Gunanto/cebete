package exam

import (
	"bytes"
	"context"
	"fmt"
	"strconv"
	"strings"
	"time"

	"github.com/xuri/excelize/v2"
)

func (s *Service) ExportExamParticipantResultsExcel(ctx context.Context, examID int64, schoolFilter *string) ([]byte, string, error) {
	matrix, err := s.ListExamParticipantResults(ctx, examID)
	if err != nil {
		return nil, "", err
	}
	matrix = filterExamParticipantResultBySchool(matrix, schoolFilter)
	title, err := s.loadExamTitle(ctx, s.db, examID)
	if err != nil {
		return nil, "", err
	}
	buf, err := buildExamParticipantResultsExcel(matrix)
	if err != nil {
		return nil, "", err
	}
	filenameParts := []string{"hasil_ujian", sanitizeExcelFilename(title)}
	if schoolFilter != nil {
		if schoolName := sanitizeExcelFilename(strings.TrimSpace(*schoolFilter)); schoolName != "" {
			filenameParts = append(filenameParts, schoolName)
		}
	}
	filename := strings.Join(filenameParts, "_") + "_" + time.Now().Format("20060102_150405") + ".xlsx"
	return buf, filename, nil
}

func filterExamParticipantResultBySchool(matrix *ExamParticipantResult, schoolFilter *string) *ExamParticipantResult {
	if matrix == nil || schoolFilter == nil {
		return matrix
	}
	target := strings.TrimSpace(*schoolFilter)
	if target == "" {
		return matrix
	}
	out := *matrix
	out.Rows = make([]ExamParticipantResultRow, 0, len(matrix.Rows))
	for _, row := range matrix.Rows {
		if strings.TrimSpace(derefString(row.SchoolName)) != target {
			continue
		}
		out.Rows = append(out.Rows, row)
	}
	return &out
}

func buildExamParticipantResultsExcel(matrix *ExamParticipantResult) ([]byte, error) {
	f := excelize.NewFile()
	sheet := f.GetSheetName(0)

	fixedHeaders := []string{
		"Nama",
		"Sekolah",
		"Kelas",
		"Attempt Ke-",
		"Skor Total",
		"Nilai",
		"Start Ujian",
		"End Ujian",
		"Durasi",
	}
	headers := append([]string{}, fixedHeaders...)
	if matrix != nil {
		for _, no := range matrix.QuestionNos {
			headers = append(headers, strconv.Itoa(no))
		}
	}
	answerKeyRow := make([]string, len(headers))
	if len(answerKeyRow) > 0 {
		answerKeyRow[0] = "Kunci Jawaban"
	}
	if matrix != nil {
		for idx, key := range matrix.AnswerKeys {
			col := len(fixedHeaders) + idx
			if col >= len(answerKeyRow) {
				break
			}
			answerKeyRow[col] = strings.TrimSpace(key)
		}
	}
	for i, v := range answerKeyRow {
		cell, _ := excelize.CoordinatesToCellName(i+1, 1)
		_ = f.SetCellValue(sheet, cell, v)
	}
	for i, h := range headers {
		cell, _ := excelize.CoordinatesToCellName(i+1, 2)
		_ = f.SetCellValue(sheet, cell, h)
	}

	rows := []ExamParticipantResultRow{}
	if matrix != nil {
		rows = matrix.Rows
	}
	totalQuestions := 0
	totalWeight := 0.0
	if matrix != nil {
		totalQuestions = len(matrix.QuestionNos)
		totalWeight = matrix.TotalWeight
	}
	if totalWeight <= 0 && totalQuestions > 0 {
		totalWeight = float64(totalQuestions)
	}
	for idx, it := range rows {
		row := idx + 3
		nilai := 0.0
		if totalWeight > 0 {
			nilai = (it.SkorTotal / totalWeight) * 100
		}
		values := []interface{}{
			it.FullName,
			strings.TrimSpace(derefString(it.SchoolName)),
			strings.TrimSpace(derefString(it.ClassName)),
			it.AttemptKe,
			it.SkorTotal,
			fmt.Sprintf("%.2f", nilai),
			it.StartedAt.Format(time.RFC3339),
			it.EndedAt.Format(time.RFC3339),
			formatExamResultDuration(it.StartedAt, it.EndedAt),
		}
		for _, ans := range it.Answers {
			values = append(values, ans)
		}
		for col, v := range values {
			cell, _ := excelize.CoordinatesToCellName(col+1, row)
			_ = f.SetCellValue(sheet, cell, v)
		}
	}

	lastCol, _ := excelize.ColumnNumberToName(len(headers))
	_ = f.SetColWidth(sheet, "A", lastCol, 16)
	var b bytes.Buffer
	if err := f.Write(&b); err != nil {
		return nil, fmt.Errorf("write excel: %w", err)
	}
	return b.Bytes(), nil
}

func formatExamResultDuration(startedAt, endedAt time.Time) string {
	diff := endedAt.Sub(startedAt)
	if diff < 0 {
		diff = 0
	}
	totalSeconds := int(diff / time.Second)
	minutes := totalSeconds / 60
	seconds := totalSeconds % 60
	return fmt.Sprintf("%d menit %d detik", minutes, seconds)
}

func derefString(v *string) string {
	if v == nil {
		return ""
	}
	return *v
}

func sanitizeExcelFilename(input string) string {
	s := strings.TrimSpace(strings.ToLower(input))
	if s == "" {
		return "exam"
	}
	var b strings.Builder
	for _, r := range s {
		if (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') {
			b.WriteRune(r)
			continue
		}
		b.WriteByte('_')
	}
	out := b.String()
	out = strings.Trim(out, "_")
	if out == "" {
		return "exam"
	}
	if _, err := strconv.Atoi(out); err == nil {
		return "exam_" + out
	}
	return out
}
