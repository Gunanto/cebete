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
	matrix, err := s.ListExamParticipantResults(ctx, examID, 0, 0, nil, nil, nil)
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

func (s *Service) ExportExamScoreRecapExcel(ctx context.Context, examID int64, finalScheme string, classFilter, schoolFilter *string) ([]byte, string, error) {
	recap, err := s.GetExamScoreRecap(ctx, examID, finalScheme, classFilter, schoolFilter)
	if err != nil {
		return nil, "", err
	}
	title, err := s.loadExamTitle(ctx, s.db, examID)
	if err != nil {
		return nil, "", err
	}
	buf, err := buildExamScoreRecapExcel(recap)
	if err != nil {
		return nil, "", err
	}
	filenameParts := []string{
		"rekap_nilai",
		sanitizeExcelFilename(title),
		normalizeFinalScheme(finalScheme),
	}
	if classFilter != nil {
		if className := sanitizeExcelFilename(strings.TrimSpace(*classFilter)); className != "" {
			filenameParts = append(filenameParts, className)
		}
	}
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

func buildExamScoreRecapExcel(recap *ExamScoreRecap) ([]byte, error) {
	f := excelize.NewFile()
	sheet := f.GetSheetName(0)

	metaRows := [][]interface{}{
		{"Jenis Laporan", "Rekap Nilai"},
		{"Skema Nilai Akhir", normalizeFinalScheme(func() string {
			if recap == nil {
				return ""
			}
			return recap.FinalScheme
		}())},
		{"KKTP", fmt.Sprintf("%.2f", func() float64 {
			if recap == nil {
				return 0
			}
			return recap.KKTP
		}())},
	}
	if recap != nil && recap.ClassFilter != nil && strings.TrimSpace(*recap.ClassFilter) != "" {
		metaRows = append(metaRows, []interface{}{"Filter Kelas", strings.TrimSpace(*recap.ClassFilter)})
	}
	if recap != nil && recap.SchoolFilter != nil && strings.TrimSpace(*recap.SchoolFilter) != "" {
		metaRows = append(metaRows, []interface{}{"Filter Sekolah", strings.TrimSpace(*recap.SchoolFilter)})
	}
	summary := ExamScoreRecapSummary{}
	if recap != nil {
		summary = recap.Summary
	}
	metaRows = append(metaRows,
		[]interface{}{"Jumlah Peserta", summary.ParticipantCount},
		[]interface{}{"Sudah Ikut", summary.StartedCount},
		[]interface{}{"Belum Ikut", summary.NotStartedCount},
		[]interface{}{"Tuntas", summary.PassedCount},
		[]interface{}{"Belum Tuntas", summary.NotPassedCount},
		[]interface{}{"Belum Selesai", summary.UnfinishedCount},
		[]interface{}{"Rata-rata Nilai Akhir", fmt.Sprintf("%.2f", summary.AverageFinalScore)},
		[]interface{}{"Nilai Tertinggi", fmt.Sprintf("%.2f", summary.HighestFinalScore)},
		[]interface{}{"Nilai Terendah", fmt.Sprintf("%.2f", summary.LowestFinalScore)},
	)
	for rowIdx, rowValues := range metaRows {
		for colIdx, v := range rowValues {
			cell, _ := excelize.CoordinatesToCellName(colIdx+1, rowIdx+1)
			_ = f.SetCellValue(sheet, cell, v)
		}
	}

	headers := []string{
		"Nama",
		"Username",
		"Sekolah",
		"Kelas",
		"Jumlah Attempt",
		"Attempt 1",
		"Attempt 2",
		"Attempt 3",
		"Nilai Akhir",
		"Status Akhir",
	}
	headerRow := len(metaRows) + 2
	for i, h := range headers {
		cell, _ := excelize.CoordinatesToCellName(i+1, headerRow)
		_ = f.SetCellValue(sheet, cell, h)
	}

	rows := []ExamScoreRecapRow{}
	if recap != nil {
		rows = recap.Rows
	}
	for idx, it := range rows {
		rowNo := headerRow + 1 + idx
		values := []interface{}{
			it.FullName,
			it.Username,
			strings.TrimSpace(derefString(it.SchoolName)),
			strings.TrimSpace(derefString(it.ClassName)),
			it.AttemptCount,
			scoreCellValue(it.AttemptScores, 0),
			scoreCellValue(it.AttemptScores, 1),
			scoreCellValue(it.AttemptScores, 2),
			func() interface{} {
				if it.FinalScore == nil {
					return "-"
				}
				return fmt.Sprintf("%.2f", *it.FinalScore)
			}(),
			finalStatusLabelExcel(it.FinalStatus),
		}
		for col, v := range values {
			cell, _ := excelize.CoordinatesToCellName(col+1, rowNo)
			_ = f.SetCellValue(sheet, cell, v)
		}
	}

	lastCol, _ := excelize.ColumnNumberToName(len(headers))
	_ = f.SetColWidth(sheet, "A", lastCol, 18)
	var b bytes.Buffer
	if err := f.Write(&b); err != nil {
		return nil, fmt.Errorf("write score recap excel: %w", err)
	}
	return b.Bytes(), nil
}

func scoreCellValue(scores []float64, idx int) interface{} {
	if idx < 0 || idx >= len(scores) {
		return "-"
	}
	return fmt.Sprintf("%.2f", scores[idx])
}

func finalStatusLabelExcel(status string) string {
	switch strings.ToLower(strings.TrimSpace(status)) {
	case "passed":
		return "Tuntas"
	case "not_passed":
		return "Belum Tuntas"
	case "unfinished":
		return "Belum Selesai"
	default:
		return "Belum Ikut"
	}
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
