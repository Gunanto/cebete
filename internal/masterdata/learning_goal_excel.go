package masterdata

import (
	"bytes"
	"context"
	"fmt"
	"time"

	"github.com/xuri/excelize/v2"
)

func (s *Service) ExportLearningGoalsExcel(ctx context.Context, mataPelajaran, kelas string, semester int16, ownerID *int64) ([]byte, string, error) {
	items, err := s.ListLearningGoals(ctx, mataPelajaran, kelas, semester, ownerID)
	if err != nil {
		return nil, "", err
	}
	buf, err := buildLearningGoalsExcel(items)
	if err != nil {
		return nil, "", err
	}
	filename := "tujuan_pembelajaran_" + time.Now().Format("20060102_150405") + ".xlsx"
	return buf, filename, nil
}

func buildLearningGoalsExcel(items []LearningGoal) ([]byte, error) {
	f := excelize.NewFile()
	sheet := f.GetSheetName(0)

	headers := []string{"ID", "Mapel", "Tingkat/Grade", "Semester", "Materi", "Tujuan"}
	for i, h := range headers {
		cell, _ := excelize.CoordinatesToCellName(i+1, 1)
		_ = f.SetCellValue(sheet, cell, h)
	}

	for idx, it := range items {
		row := idx + 2
		values := []any{
			it.ID,
			it.MataPelajaran,
			it.Kelas,
			it.Semester,
			it.Materi,
			it.TujuanPembelajaran,
		}
		for col, v := range values {
			cell, _ := excelize.CoordinatesToCellName(col+1, row)
			_ = f.SetCellValue(sheet, cell, v)
		}
	}

	_ = f.SetColWidth(sheet, "A", "A", 10)
	_ = f.SetColWidth(sheet, "B", "C", 20)
	_ = f.SetColWidth(sheet, "D", "D", 12)
	_ = f.SetColWidth(sheet, "E", "E", 24)
	_ = f.SetColWidth(sheet, "F", "F", 60)

	var b bytes.Buffer
	if err := f.Write(&b); err != nil {
		return nil, fmt.Errorf("write excel: %w", err)
	}
	return b.Bytes(), nil
}
