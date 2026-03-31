package main

import (
	"encoding/csv"
	"flag"
	"fmt"
	"os"
	"regexp"
	"strings"
)

var labeledItemPattern = regexp.MustCompile(`^([A-Z][0-9]*|P[0-9]+)[\.\):\-\s]+(.+)$`)
var matchingItemPattern = regexp.MustCompile(`^([A-Z0-9]+)[\.\):\-\s]+(.+)$`)

func main() {
	inPath := flag.String("in", "", "path file CSV input")
	outPath := flag.String("out", "", "path file TXT output")
	flag.Parse()

	if strings.TrimSpace(*inPath) == "" || strings.TrimSpace(*outPath) == "" {
		fmt.Fprintln(os.Stderr, "usage: go run ./scripts/questions_csv_to_txt.go -in naskah.csv -out naskah.txt")
		os.Exit(2)
	}

	inFile, err := os.Open(*inPath)
	if err != nil {
		fmt.Fprintf(os.Stderr, "open input: %v\n", err)
		os.Exit(1)
	}
	defer inFile.Close()

	reader := csv.NewReader(inFile)
	reader.FieldsPerRecord = -1
	rows, err := reader.ReadAll()
	if err != nil {
		fmt.Fprintf(os.Stderr, "read csv: %v\n", err)
		os.Exit(1)
	}
	if len(rows) < 2 {
		fmt.Fprintln(os.Stderr, "csv tidak memiliki data")
		os.Exit(1)
	}

	header := make(map[string]int, len(rows[0]))
	for i, col := range rows[0] {
		header[normalizeHeader(col)] = i
	}

	blocks := make([]string, 0, len(rows)-1)
	for _, row := range rows[1:] {
		if isEmptyRow(row) {
			continue
		}
		block := buildBlock(header, row)
		if strings.TrimSpace(block) == "" {
			continue
		}
		blocks = append(blocks, block)
	}

	if err := os.WriteFile(*outPath, []byte(strings.Join(blocks, "\n\n")), 0o644); err != nil {
		fmt.Fprintf(os.Stderr, "write output: %v\n", err)
		os.Exit(1)
	}
}

func normalizeHeader(raw string) string {
	return strings.ToLower(strings.TrimSpace(raw))
}

func isEmptyRow(row []string) bool {
	for _, col := range row {
		if strings.TrimSpace(col) != "" {
			return false
		}
	}
	return true
}

func cell(header map[string]int, row []string, name string) string {
	idx, ok := header[normalizeHeader(name)]
	if !ok || idx < 0 || idx >= len(row) {
		return ""
	}
	return strings.TrimSpace(row[idx])
}

func buildBlock(header map[string]int, row []string) string {
	opsi := cell(header, row, "opsi")
	kunci := cell(header, row, "kunci jawaban")
	qType := inferType(cell(header, row, "tipe"), opsi, kunci)

	lines := []string{
		"TYPE: " + qType,
		"Mapel: " + cell(header, row, "mapel"),
		"KodeSoal: " + cell(header, row, "kode soal"),
		"NamaKode: " + cell(header, row, "nama kode"),
	}
	if stimulus := cell(header, row, "stimulus"); stimulus != "" {
		lines = append(lines, "S: "+stimulus)
	}
	lines = append(lines, "Q: "+cell(header, row, "soal"))

	switch qType {
	case "TF":
		for _, item := range splitLabeledItems(opsi) {
			lines = append(lines, item)
		}
	case "MATCH":
		for _, item := range splitMatchingItems(opsi) {
			lines = append(lines, item)
		}
	case "SA":
	default:
		for _, item := range splitLabeledItems(opsi) {
			lines = append(lines, item)
		}
	}

	lines = append(lines, "Kunci Jawaban: "+normalizeKey(qType, kunci))
	if explanation := cell(header, row, "penjelasan"); explanation != "" {
		lines = append(lines, "Penjelasan: "+explanation)
	}
	if hint := cell(header, row, "hint"); hint != "" {
		lines = append(lines, "Hint: "+hint)
	}
	return strings.Join(lines, "\n")
}

func inferType(typeRaw, opsi, kunci string) string {
	t := strings.ToUpper(strings.TrimSpace(typeRaw))
	switch t {
	case "MC", "MR", "TF", "MATCH", "SA":
		return t
	}
	if strings.Contains(kunci, "->") || strings.HasPrefix(strings.ToLower(strings.TrimSpace(opsi)), "prompts:") {
		return "MATCH"
	}
	if strings.EqualFold(strings.TrimSpace(opsi), "jawaban singkat") {
		return "SA"
	}
	if strings.Count(kunci, "T")+strings.Count(kunci, "F") > 0 && strings.Contains(strings.ToUpper(opsi), "P1.") {
		return "TF"
	}
	if strings.Contains(kunci, ",") {
		return "MR"
	}
	return "MC"
}

func splitLabeledItems(raw string) []string {
	parts := strings.Split(raw, ",")
	out := make([]string, 0, len(parts))
	for _, part := range parts {
		item := strings.TrimSpace(part)
		if item == "" {
			continue
		}
		m := labeledItemPattern.FindStringSubmatch(item)
		if len(m) == 3 {
			out = append(out, strings.ToUpper(strings.TrimSpace(m[1]))+": "+strings.TrimSpace(m[2]))
			continue
		}
		out = append(out, item)
	}
	return out
}

func splitMatchingItems(raw string) []string {
	sections := strings.Split(raw, "|")
	out := []string{}
	for _, section := range sections {
		section = strings.TrimSpace(section)
		if section == "" {
			continue
		}
		lower := strings.ToLower(section)
		switch {
		case strings.HasPrefix(lower, "prompts:"):
			body := strings.TrimSpace(section[len("Prompts:"):])
			for _, item := range strings.Split(body, ";") {
				item = strings.TrimSpace(item)
				if item == "" {
					continue
				}
				m := matchingItemPattern.FindStringSubmatch(item)
				if len(m) == 3 {
					out = append(out, strings.ToUpper(strings.TrimSpace(m[1]))+": "+strings.TrimSpace(m[2]))
				}
			}
		case strings.HasPrefix(lower, "choices:"):
			body := strings.TrimSpace(section[len("Choices:"):])
			for _, item := range strings.Split(body, ";") {
				item = strings.TrimSpace(item)
				if item == "" {
					continue
				}
				m := matchingItemPattern.FindStringSubmatch(item)
				if len(m) == 3 {
					out = append(out, strings.ToUpper(strings.TrimSpace(m[1]))+": "+strings.TrimSpace(m[2]))
				}
			}
		}
	}
	return out
}

func normalizeKey(qType, key string) string {
	key = strings.TrimSpace(key)
	switch qType {
	case "MATCH":
		key = strings.ReplaceAll(key, "|", ",")
		parts := strings.Split(key, ",")
		out := make([]string, 0, len(parts))
		for _, part := range parts {
			part = strings.TrimSpace(part)
			if part != "" {
				out = append(out, part)
			}
		}
		return strings.Join(out, ", ")
	case "TF":
		parts := strings.Split(key, ",")
		out := make([]string, 0, len(parts))
		for _, part := range parts {
			part = strings.TrimSpace(part)
			if part != "" {
				out = append(out, part)
			}
		}
		return strings.Join(out, ", ")
	default:
		return key
	}
}
