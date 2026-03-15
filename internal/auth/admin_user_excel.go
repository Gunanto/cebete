package auth

import (
	"bytes"
	"context"
	"database/sql"
	"errors"
	"fmt"
	"io"
	"net/mail"
	"regexp"
	"strconv"
	"strings"

	"github.com/xuri/excelize/v2"
)

const defaultImportedSiswaPassword = "Punggur1Jaya"

var npsnImportPattern = regexp.MustCompile(`^[A-Za-z0-9]{8}$`)

type UserImportRowError struct {
	Row      int    `json:"row"`
	Username string `json:"username,omitempty"`
	Error    string `json:"error"`
}

type UserImportReport struct {
	TotalRows   int                  `json:"total_rows"`
	SuccessRows int                  `json:"success_rows"`
	FailedRows  int                  `json:"failed_rows"`
	Errors      []UserImportRowError `json:"errors"`
	Infos       []UserImportRowInfo  `json:"infos,omitempty"`
}

type UserImportRowInfo struct {
	Row      int    `json:"row"`
	Username string `json:"username,omitempty"`
	Info     string `json:"info"`
}

func (s *Service) ExportUsersExcel(ctx context.Context, role, q string) ([]byte, error) {
	items, err := s.ListUsers(ctx, role, q, 10000, 0, true)
	if err != nil {
		return nil, err
	}

	f := excelize.NewFile()
	sheet := f.GetSheetName(0)
	headers := []string{
		"username",
		"email",
		"full_name",
		"role",
		"participant_no",
		"nisn",
		"school_name",
		"school_npsn",
		"school_city",
		"school_province",
		"school_kecamatan",
		"school_address",
		"school_jenjang",
		"school_status",
		"school_email",
		"class_name",
		"grade_level",
		"is_active",
		"account_status",
		"created_at",
	}
	for i, h := range headers {
		cell, _ := excelize.CoordinatesToCellName(i+1, 1)
		_ = f.SetCellValue(sheet, cell, h)
	}
	for i, it := range items {
		row := i + 2
		email := ""
		if it.Email != nil {
			email = *it.Email
		}
		schoolName := ""
		if it.SchoolName != nil {
			schoolName = strings.TrimSpace(*it.SchoolName)
		}
		className := ""
		if it.ClassName != nil {
			className = strings.TrimSpace(*it.ClassName)
		}
		gradeLevel := ""
		if it.ClassGrade != nil {
			gradeLevel = strings.TrimSpace(*it.ClassGrade)
		}
		schoolNPSN := ""
		if it.SchoolCode != nil {
			schoolNPSN = strings.TrimSpace(*it.SchoolCode)
		}
		schoolCity := ""
		if it.SchoolCity != nil {
			schoolCity = strings.TrimSpace(*it.SchoolCity)
		}
		schoolProvince := ""
		if it.SchoolProvince != nil {
			schoolProvince = strings.TrimSpace(*it.SchoolProvince)
		}
		schoolKecamatan := ""
		if it.SchoolKecamatan != nil {
			schoolKecamatan = strings.TrimSpace(*it.SchoolKecamatan)
		}
		schoolAddress := ""
		if it.SchoolAddress != nil {
			schoolAddress = strings.TrimSpace(*it.SchoolAddress)
		}
		schoolJenjang := ""
		if it.SchoolJenjang != nil {
			schoolJenjang = strings.TrimSpace(*it.SchoolJenjang)
		}
		schoolStatus := ""
		if it.SchoolStatus != nil {
			schoolStatus = strings.TrimSpace(*it.SchoolStatus)
		}
		schoolEmail := ""
		if it.SchoolEmail != nil {
			schoolEmail = strings.TrimSpace(*it.SchoolEmail)
		}
		values := []any{
			it.Username,
			email,
			it.FullName,
			it.Role,
			strOrEmpty(it.ParticipantNo),
			strOrEmpty(it.NISN),
			schoolName,
			schoolNPSN,
			schoolCity,
			schoolProvince,
			schoolKecamatan,
			schoolAddress,
			schoolJenjang,
			schoolStatus,
			schoolEmail,
			className,
			gradeLevel,
			it.IsActive,
			it.AccountStatus,
			it.CreatedAt.Format("2006-01-02 15:04:05"),
		}
		for col, v := range values {
			cell, _ := excelize.CoordinatesToCellName(col+1, row)
			_ = f.SetCellValue(sheet, cell, v)
		}
	}
	_ = f.SetColWidth(sheet, "A", "T", 22)

	var buf bytes.Buffer
	if err := f.Write(&buf); err != nil {
		return nil, fmt.Errorf("write excel: %w", err)
	}
	return buf.Bytes(), nil
}

func (s *Service) ExportUserImportTemplateExcel() ([]byte, error) {
	f := excelize.NewFile()
	sheet := f.GetSheetName(0)
	headers := []string{
		"username",
		"email",
		"full_name",
		"role",
		"participant_no",
		"nisn",
		"password",
		"school_name",
		"school_npsn",
		"school_city",
		"school_province",
		"school_kecamatan",
		"school_address",
		"school_jenjang",
		"school_status",
		"school_email",
		"class_name",
		"grade_level",
		"is_active",
	}
	for i, h := range headers {
		cell, _ := excelize.CoordinatesToCellName(i+1, 1)
		_ = f.SetCellValue(sheet, cell, h)
	}

	exampleRows := [][]any{
		{"siswa_demo_001", "siswa001@example.com", "Siswa Demo 001", "siswa", "PST-2026-0001", "0123456789", "password123", "SMPN 1 Punggur", "12345678", "Lampung Tengah", "Lampung", "Punggur", "Jl. Ahmad Yani No. 1", "SMP", "NEGERI", "smpn1@example.sch.id", "TKA Matematika", "Kelas 9", "true"},
		{"guru_demo_001", "guru001@example.com", "Guru Demo 001", "guru", "", "", "password123", "", "", "", "", "", "", "", "", "", "", "", "true"},
	}
	for i, row := range exampleRows {
		rowNo := i + 2
		for j, v := range row {
			cell, _ := excelize.CoordinatesToCellName(j+1, rowNo)
			_ = f.SetCellValue(sheet, cell, v)
		}
	}

	noteRow := len(exampleRows) + 4
	_ = f.SetCellValue(sheet, "A"+strconv.Itoa(noteRow), "Catatan:")
	_ = f.SetCellValue(sheet, "A"+strconv.Itoa(noteRow+1), "- role siswa wajib isi participant_no, nisn, school_name, class_name, grade_level.")
	_ = f.SetCellValue(sheet, "A"+strconv.Itoa(noteRow+2), "- school_name dan class_name+grade_level harus sudah ada di Data Master.")
	_ = f.SetCellValue(sheet, "A"+strconv.Itoa(noteRow+3), "- role admin/proktor/guru boleh kosongkan kolom kelas.")

	_ = f.SetColWidth(sheet, "A", "S", 24)

	var buf bytes.Buffer
	if err := f.Write(&buf); err != nil {
		return nil, fmt.Errorf("write import template excel: %w", err)
	}
	return buf.Bytes(), nil
}

func (s *Service) ImportUsersExcel(ctx context.Context, actorID int64, r io.Reader) (*UserImportReport, error) {
	f, err := excelize.OpenReader(r)
	if err != nil {
		return nil, fmt.Errorf("open excel: %w", err)
	}
	defer func() { _ = f.Close() }()

	sheets := f.GetSheetList()
	if len(sheets) == 0 {
		return nil, errors.New("excel sheet is empty")
	}
	rows, err := f.GetRows(sheets[0])
	if err != nil {
		return nil, fmt.Errorf("read rows: %w", err)
	}
	if len(rows) < 2 {
		return nil, errors.New("no data rows found")
	}

	header := map[string]int{}
	for i, h := range rows[0] {
		header[strings.ToLower(strings.TrimSpace(h))] = i
	}
	required := []string{"username", "full_name", "role"}
	for _, col := range required {
		if _, ok := header[col]; !ok {
			return nil, fmt.Errorf("missing required column: %s", col)
		}
	}

	report := &UserImportReport{
		Errors: make([]UserImportRowError, 0),
		Infos:  make([]UserImportRowInfo, 0),
	}
	reservedUsernames := make(map[string]struct{})
	reservedEmails := make(map[string]struct{})
	for i := 1; i < len(rows); i++ {
		rowNo := i + 1
		row := rows[i]
		report.TotalRows++

		get := func(key string) string {
			idx, ok := header[key]
			if !ok || idx >= len(row) {
				return ""
			}
			return strings.TrimSpace(row[idx])
		}

		rawUsername := get("username")
		username := normalizeUsername(rawUsername)
		fullName := get("full_name")
		role := strings.ToLower(get("role"))
		rawEmail := get("email")
		email := normalizeImportedEmailInput(rawEmail)
		password := get("password")
		participantNo := get("participant_no")
		nisn := get("nisn")
		activeRaw := strings.ToLower(get("is_active"))
		schoolName := get("school_name")
		schoolNpsn := get("school_npsn")
		schoolCity := get("school_city")
		schoolProvince := get("school_province")
		schoolKecamatan := get("school_kecamatan")
		schoolAddress := get("school_address")
		schoolJenjang := get("school_jenjang")
		schoolStatus := get("school_status")
		schoolEmail := get("school_email")
		className := get("class_name")
		gradeLevel := get("grade_level")

		if username == "" || fullName == "" || !isValidRole(role) {
			report.FailedRows++
			report.Errors = append(report.Errors, UserImportRowError{
				Row:      rowNo,
				Username: username,
				Error:    "username/full_name/role tidak valid",
			})
			continue
		}
		rowInfos := make([]string, 0, 4)
		if rawUsername != username {
			rowInfos = append(rowInfos, "username dinormalisasi (spasi/karakter khusus dihapus)")
		}
		if strings.TrimSpace(rawEmail) != email {
			rowInfos = append(rowInfos, "email dinormalisasi (spasi dihapus)")
		}
		if email != "" {
			if _, err := mail.ParseAddress(email); err != nil {
				report.FailedRows++
				report.Errors = append(report.Errors, UserImportRowError{
					Row:      rowNo,
					Username: username,
					Error:    "email tidak valid",
				})
				continue
			}
		}
		if schoolEmail != "" {
			if _, err := mail.ParseAddress(schoolEmail); err != nil {
				report.FailedRows++
				report.Errors = append(report.Errors, UserImportRowError{
					Row:      rowNo,
					Username: username,
					Error:    "email sekolah tidak valid",
				})
				continue
			}
		}
		if schoolNpsn != "" && !npsnImportPattern.MatchString(schoolNpsn) {
			report.FailedRows++
			report.Errors = append(report.Errors, UserImportRowError{
				Row:      rowNo,
				Username: username,
				Error:    "format NPSN tidak valid",
			})
			continue
		}
		originalUsername := username
		resolvedUsername, err := s.resolveImportUsername(ctx, username, reservedUsernames)
		if err != nil {
			report.FailedRows++
			report.Errors = append(report.Errors, UserImportRowError{
				Row:      rowNo,
				Username: username,
				Error:    err.Error(),
			})
			continue
		}
		username = resolvedUsername
		if username != originalUsername {
			rowInfos = append(rowInfos, "username bentrok, otomatis jadi "+username)
		}
		if email != "" {
			originalEmail := email
			resolvedEmail, err := s.resolveImportEmail(ctx, email, reservedEmails)
			if err != nil {
				report.FailedRows++
				report.Errors = append(report.Errors, UserImportRowError{
					Row:      rowNo,
					Username: username,
					Error:    err.Error(),
				})
				continue
			}
			email = resolvedEmail
			if email != originalEmail {
				rowInfos = append(rowInfos, "email bentrok, otomatis jadi "+email)
			}
		}
		var schoolID *int64
		var classID *int64
		isSiswa := role == "siswa"
		if isSiswa && (strings.TrimSpace(participantNo) == "" || strings.TrimSpace(nisn) == "") {
			report.FailedRows++
			report.Errors = append(report.Errors, UserImportRowError{
				Row:      rowNo,
				Username: username,
				Error:    "untuk role siswa, participant_no dan nisn wajib diisi",
			})
			continue
		}
		extraSchoolFields := strings.TrimSpace(schoolNpsn) != "" ||
			strings.TrimSpace(schoolCity) != "" ||
			strings.TrimSpace(schoolProvince) != "" ||
			strings.TrimSpace(schoolKecamatan) != "" ||
			strings.TrimSpace(schoolAddress) != "" ||
			strings.TrimSpace(schoolJenjang) != "" ||
			strings.TrimSpace(schoolStatus) != "" ||
			strings.TrimSpace(schoolEmail) != ""
		if extraSchoolFields && strings.TrimSpace(schoolName) == "" {
			report.FailedRows++
			report.Errors = append(report.Errors, UserImportRowError{
				Row:      rowNo,
				Username: username,
				Error:    "school_name wajib diisi jika kolom sekolah lainnya diisi",
			})
			continue
		}
		containsPlacement := strings.TrimSpace(schoolName) != "" || strings.TrimSpace(className) != "" || strings.TrimSpace(gradeLevel) != ""
		if isSiswa || containsPlacement {
			if strings.TrimSpace(schoolName) == "" || strings.TrimSpace(className) == "" || strings.TrimSpace(gradeLevel) == "" {
				report.FailedRows++
				report.Errors = append(report.Errors, UserImportRowError{
					Row:      rowNo,
					Username: username,
					Error:    "untuk role siswa, school_name, class_name, grade_level wajib diisi",
				})
				continue
			}
			sid, cid, resolveErr := s.resolveEnrollmentFromNames(ctx, schoolName, className, gradeLevel)
			if resolveErr != nil {
				report.FailedRows++
				report.Errors = append(report.Errors, UserImportRowError{
					Row:      rowNo,
					Username: username,
					Error:    resolveErr.Error(),
				})
				continue
			}
			schoolID = &sid
			classID = &cid
		}

		finalPassword := strings.TrimSpace(password)
		if isSiswa {
			finalPassword = defaultImportedSiswaPassword
			rowInfos = append(rowInfos, "password siswa diset default kebijakan")
		}
		if len(finalPassword) < 8 {
			report.FailedRows++
			report.Errors = append(report.Errors, UserImportRowError{
				Row:      rowNo,
				Username: username,
				Error:    "password minimal 8 karakter untuk user baru",
			})
			continue
		}

		created, err := s.CreateUserByAdmin(ctx, actorID, AdminCreateUserInput{
			Username:      username,
			Email:         email,
			Password:      finalPassword,
			FullName:      fullName,
			Role:          role,
			ParticipantNo: participantNo,
			NISN:          nisn,
			SchoolID:      schoolID,
			ClassID:       classID,
		})
		if err != nil {
			report.FailedRows++
			report.Errors = append(report.Errors, UserImportRowError{
				Row:      rowNo,
				Username: username,
				Error:    err.Error(),
			})
			continue
		}
		userID := created.ID
		reservedUsernames[username] = struct{}{}
		if email != "" {
			reservedEmails[email] = struct{}{}
		}

		if activeRaw != "" {
			isActive := parseBoolLoose(activeRaw)
			if !isActive {
				_ = s.DeactivateUserByAdmin(ctx, actorID, userID)
			}
		}

		report.SuccessRows++
		if len(rowInfos) > 0 {
			report.Infos = append(report.Infos, UserImportRowInfo{
				Row:      rowNo,
				Username: username,
				Info:     strings.Join(rowInfos, "; "),
			})
		}
	}

	return report, nil
}

func (s *Service) resolveImportUsername(ctx context.Context, base string, reserved map[string]struct{}) (string, error) {
	base = normalizeUsername(base)
	if base == "" {
		return "", errors.New("username kosong")
	}
	candidate := base
	for n := 0; n < 10000; n++ {
		if n > 0 {
			candidate = base + strconv.Itoa(n)
		}
		if _, ok := reserved[candidate]; ok {
			continue
		}
		exists, err := s.userExistsByUsername(ctx, candidate)
		if err != nil {
			return "", err
		}
		if !exists {
			return candidate, nil
		}
	}
	return "", errors.New("gagal membuat username unik")
}

func (s *Service) resolveImportEmail(ctx context.Context, base string, reserved map[string]struct{}) (string, error) {
	base = strings.ToLower(strings.TrimSpace(base))
	if base == "" {
		return "", nil
	}
	at := strings.LastIndex(base, "@")
	if at <= 0 || at == len(base)-1 {
		return "", errors.New("email tidak valid")
	}
	local := base[:at]
	domain := base[at+1:]
	candidate := base
	for n := 0; n < 10000; n++ {
		if n > 0 {
			candidate = local + strconv.Itoa(n) + "@" + domain
		}
		if _, ok := reserved[candidate]; ok {
			continue
		}
		exists, err := s.userExistsByEmail(ctx, candidate)
		if err != nil {
			return "", err
		}
		if !exists {
			return candidate, nil
		}
	}
	return "", errors.New("gagal membuat email unik")
}

func (s *Service) userExistsByUsername(ctx context.Context, username string) (bool, error) {
	var exists bool
	if err := s.db.QueryRowContext(ctx, `
		SELECT EXISTS(
			SELECT 1
			FROM users
			WHERE LOWER(username) = LOWER($1)
		)
	`, strings.TrimSpace(username)).Scan(&exists); err != nil {
		return false, fmt.Errorf("cek username existing: %w", err)
	}
	return exists, nil
}

func (s *Service) userExistsByEmail(ctx context.Context, email string) (bool, error) {
	var exists bool
	if err := s.db.QueryRowContext(ctx, `
		SELECT EXISTS(
			SELECT 1
			FROM users
			WHERE email IS NOT NULL
			  AND LOWER(email) = LOWER($1)
		)
	`, strings.TrimSpace(email)).Scan(&exists); err != nil {
		return false, fmt.Errorf("cek email existing: %w", err)
	}
	return exists, nil
}

func (s *Service) resolveEnrollmentFromNames(ctx context.Context, schoolName, className, gradeLevel string) (int64, int64, error) {
	schoolName = strings.TrimSpace(schoolName)
	className = strings.TrimSpace(className)
	gradeLevel = strings.TrimSpace(gradeLevel)

	var schoolID int64
	if err := s.db.QueryRowContext(ctx, `
		SELECT id
		FROM schools
		WHERE LOWER(name) = LOWER($1)
		  AND is_active = TRUE
		LIMIT 1
	`, schoolName).Scan(&schoolID); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return 0, 0, fmt.Errorf("school_name tidak ditemukan: %s", schoolName)
		}
		return 0, 0, fmt.Errorf("lookup school_name gagal: %w", err)
	}

	var classID int64
	if err := s.db.QueryRowContext(ctx, `
		SELECT id
		FROM classes
		WHERE school_id = $1
		  AND LOWER(name) = LOWER($2)
		  AND LOWER(grade_level) = LOWER($3)
		  AND is_active = TRUE
		LIMIT 1
	`, schoolID, className, gradeLevel).Scan(&classID); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return 0, 0, fmt.Errorf("kelas tidak ditemukan: %s | %s | %s", schoolName, gradeLevel, className)
		}
		return 0, 0, fmt.Errorf("lookup kelas gagal: %w", err)
	}
	return schoolID, classID, nil
}

func parseBoolLoose(v string) bool {
	v = strings.TrimSpace(strings.ToLower(v))
	if v == "" {
		return true
	}
	switch v {
	case "1", "true", "ya", "yes", "aktif":
		return true
	case "0", "false", "tidak", "no", "nonaktif":
		return false
	default:
		if n, err := strconv.Atoi(v); err == nil {
			return n != 0
		}
		return true
	}
}

func strOrEmpty(v *string) string {
	if v == nil {
		return ""
	}
	return strings.TrimSpace(*v)
}

func normalizeImportedEmailInput(v string) string {
	v = strings.ToLower(strings.TrimSpace(v))
	if v == "" {
		return ""
	}
	return strings.Join(strings.Fields(v), "")
}
