package masterdata

import (
	"context"
	"database/sql"
	"encoding/csv"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/mail"
	"strings"
	"time"

	"cbtlms/internal/auth"

	"golang.org/x/crypto/bcrypt"
)

var (
	ErrInvalidInput             = errors.New("invalid input")
	ErrLearningGoalTenantNeeded = errors.New("learning goal tenant required")
	ErrUserNotFound             = errors.New("user not found")
)

type Service struct {
	db         *sql.DB
	bcryptCost int
}

type CreateSchoolInput struct {
	Name          string
	Code          string
	Address       string
	City          string
	Province      string
	Kecamatan     string
	Jenjang       string
	StatusSekolah string
	SchoolEmail   string
}

type School struct {
	ID            int64  `json:"id"`
	Name          string `json:"name"`
	Code          string `json:"code,omitempty"`
	Address       string `json:"address,omitempty"`
	City          string `json:"city,omitempty"`
	Province      string `json:"province,omitempty"`
	Kecamatan     string `json:"kecamatan,omitempty"`
	Jenjang       string `json:"jenjang,omitempty"`
	StatusSekolah string `json:"status_sekolah,omitempty"`
	SchoolEmail   string `json:"school_email,omitempty"`
}

type SchoolUserStats struct {
	SchoolID     int64  `json:"school_id"`
	SchoolName   string `json:"school_name"`
	AdminCount   int64  `json:"admin_count"`
	ProktorCount int64  `json:"proktor_count"`
	GuruCount    int64  `json:"guru_count"`
	SiswaCount   int64  `json:"siswa_count"`
}

type CreateClassInput struct {
	SchoolID   int64
	Name       string
	GradeLevel string
}

type UpdateSchoolInput struct {
	Name          string
	Code          string
	Address       string
	City          string
	Province      string
	Kecamatan     string
	Jenjang       string
	StatusSekolah string
	SchoolEmail   string
}

type UpdateClassInput struct {
	SchoolID   int64
	Name       string
	GradeLevel string
}

type Class struct {
	ID         int64  `json:"id"`
	SchoolID   int64  `json:"school_id"`
	Name       string `json:"name"`
	GradeLevel string `json:"grade_level"`
}

type ClassListItem struct {
	ID           int64  `json:"id"`
	SchoolID     int64  `json:"school_id"`
	Name         string `json:"name"`
	GradeLevel   string `json:"grade_level"`
	IsActive     bool   `json:"is_active"`
	StudentCount int64  `json:"student_count"`
}

type EducationLevel struct {
	ID       int64  `json:"id"`
	Name     string `json:"name"`
	IsActive bool   `json:"is_active"`
}

type LearningGoal struct {
	ID                 int64  `json:"id"`
	TujuanPembelajaran string `json:"tujuan_pembelajaran"`
	Materi             string `json:"materi"`
	MataPelajaran      string `json:"mata_pelajaran"`
	Kelas              string `json:"kelas"`
	Semester           int16  `json:"semester"`
	CreatedBy          *int64 `json:"created_by,omitempty"`
}

type CreateLearningGoalInput struct {
	TujuanPembelajaran string
	Materi             string
	MataPelajaran      string
	Kelas              string
	Semester           int16
}

type UpdateLearningGoalInput struct {
	TujuanPembelajaran string
	Materi             string
	MataPelajaran      string
	Kelas              string
	Semester           int16
}

type ImportStudentsReport struct {
	TotalRows   int              `json:"total_rows"`
	SuccessRows int              `json:"success_rows"`
	FailedRows  int              `json:"failed_rows"`
	Errors      []ImportRowError `json:"errors"`
}

type ImportClassesReport struct {
	TotalRows   int                   `json:"total_rows"`
	SuccessRows int                   `json:"success_rows"`
	FailedRows  int                   `json:"failed_rows"`
	CreatedRows int                   `json:"created_rows"`
	UpdatedRows int                   `json:"updated_rows"`
	Errors      []ImportClassRowError `json:"errors"`
}

type ImportClassRowError struct {
	Row        int    `json:"row"`
	SchoolName string `json:"school_name,omitempty"`
	ClassName  string `json:"class_name,omitempty"`
	GradeLevel string `json:"grade_level,omitempty"`
	Error      string `json:"error"`
}

type ImportRowError struct {
	Row   int    `json:"row"`
	Error string `json:"error"`
}

func NewService(db *sql.DB) *Service {
	return &Service{db: db, bcryptCost: bcrypt.DefaultCost}
}

func isUndefinedTableErr(err error, table string) bool {
	if err == nil {
		return false
	}
	lower := strings.ToLower(err.Error())
	if table == "" {
		return strings.Contains(lower, "does not exist") || strings.Contains(lower, "undefined_table")
	}
	return strings.Contains(lower, "relation \""+strings.ToLower(table)+"\" does not exist") ||
		(strings.Contains(lower, "undefined_table") && strings.Contains(lower, strings.ToLower(table)))
}

type columnQuerier interface {
	QueryRowContext(ctx context.Context, query string, args ...any) *sql.Row
}

func hasColumn(ctx context.Context, q columnQuerier, tableName, columnName string) (bool, error) {
	var exists bool
	if err := q.QueryRowContext(ctx, `
		SELECT EXISTS (
			SELECT 1
			FROM information_schema.columns
			WHERE table_schema = current_schema()
			  AND table_name = $1
			  AND column_name = $2
		)
	`, tableName, columnName).Scan(&exists); err != nil {
		return false, fmt.Errorf("check %s.%s column: %w", tableName, columnName, err)
	}
	return exists, nil
}

func loadUserTenantID(ctx context.Context, q columnQuerier, userID int64) (*int64, error) {
	if userID <= 0 {
		return nil, nil
	}
	hasTenant, err := hasColumn(ctx, q, "users", "tenant_id")
	if err != nil {
		return nil, err
	}
	if !hasTenant {
		return nil, nil
	}
	var tenantID sql.NullInt64
	if err := q.QueryRowContext(ctx, `SELECT tenant_id FROM users WHERE id = $1`, userID).Scan(&tenantID); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrUserNotFound
		}
		return nil, fmt.Errorf("load user tenant: %w", err)
	}
	if !tenantID.Valid || tenantID.Int64 <= 0 {
		return nil, nil
	}
	out := tenantID.Int64
	return &out, nil
}

func (s *Service) CreateSchool(ctx context.Context, actorID int64, in CreateSchoolInput) (*School, error) {
	name := strings.TrimSpace(in.Name)
	code := strings.TrimSpace(in.Code)
	address := strings.TrimSpace(in.Address)
	city := strings.TrimSpace(in.City)
	province := strings.TrimSpace(in.Province)
	kecamatan := strings.TrimSpace(in.Kecamatan)
	jenjang := strings.TrimSpace(in.Jenjang)
	statusSekolah := strings.TrimSpace(in.StatusSekolah)
	schoolEmail := strings.TrimSpace(in.SchoolEmail)
	if name == "" {
		return nil, ErrInvalidInput
	}
	if address == "" && (city != "" || province != "") {
		if city != "" && province != "" {
			address = city + ", " + province
		} else if city != "" {
			address = city
		} else {
			address = province
		}
	}

	var school School
	err := s.db.QueryRowContext(ctx, `
		INSERT INTO schools (
			name, code, address, city, province, kecamatan,
			jenjang, status_sekolah, school_email,
			created_at, updated_at
		)
		VALUES (
			$1, NULLIF($2,''), NULLIF($3,''), NULLIF($4,''), NULLIF($5,''), NULLIF($6,''),
			NULLIF($7,''), NULLIF($8,''), NULLIF($9,''),
			now(), now()
		)
		RETURNING id, name, COALESCE(code,''), COALESCE(address,''), COALESCE(city,''), COALESCE(province,''),
		          COALESCE(kecamatan,''), COALESCE(jenjang,''), COALESCE(status_sekolah,''), COALESCE(school_email,'')
	`, name, code, address, city, province, kecamatan, jenjang, statusSekolah, schoolEmail).Scan(
		&school.ID,
		&school.Name,
		&school.Code,
		&school.Address,
		&school.City,
		&school.Province,
		&school.Kecamatan,
		&school.Jenjang,
		&school.StatusSekolah,
		&school.SchoolEmail,
	)
	if err != nil {
		return nil, fmt.Errorf("create school: %w", err)
	}

	_ = s.writeAudit(ctx, actorID, "school_created", "school", fmt.Sprintf("%d", school.ID), map[string]any{
		"name": school.Name,
		"code": school.Code,
	})

	return &school, nil
}

func (s *Service) CreateClass(ctx context.Context, actorID int64, in CreateClassInput) (*Class, error) {
	name := strings.TrimSpace(in.Name)
	grade := strings.TrimSpace(in.GradeLevel)
	if in.SchoolID <= 0 || name == "" || grade == "" {
		return nil, ErrInvalidInput
	}

	var class Class
	err := s.db.QueryRowContext(ctx, `
		INSERT INTO classes (school_id, name, grade_level, created_at, updated_at)
		VALUES ($1, $2, $3, now(), now())
		RETURNING id, school_id, name, grade_level
	`, in.SchoolID, name, grade).Scan(&class.ID, &class.SchoolID, &class.Name, &class.GradeLevel)
	if err != nil {
		return nil, fmt.Errorf("create class: %w", err)
	}

	_ = s.writeAudit(ctx, actorID, "class_created", "class", fmt.Sprintf("%d", class.ID), map[string]any{
		"school_id":   class.SchoolID,
		"name":        class.Name,
		"grade_level": class.GradeLevel,
	})

	return &class, nil
}

func (s *Service) UpdateSchool(ctx context.Context, actorID, id int64, in UpdateSchoolInput) (*School, error) {
	name := strings.TrimSpace(in.Name)
	code := strings.TrimSpace(in.Code)
	address := strings.TrimSpace(in.Address)
	city := strings.TrimSpace(in.City)
	province := strings.TrimSpace(in.Province)
	kecamatan := strings.TrimSpace(in.Kecamatan)
	jenjang := strings.TrimSpace(in.Jenjang)
	statusSekolah := strings.TrimSpace(in.StatusSekolah)
	schoolEmail := strings.TrimSpace(in.SchoolEmail)
	if id <= 0 || name == "" {
		return nil, ErrInvalidInput
	}
	if address == "" && (city != "" || province != "") {
		if city != "" && province != "" {
			address = city + ", " + province
		} else if city != "" {
			address = city
		} else {
			address = province
		}
	}

	var out School
	err := s.db.QueryRowContext(ctx, `
		UPDATE schools
		SET name = $2,
			code = NULLIF($3,''),
			address = NULLIF($4,''),
			city = NULLIF($5,''),
			province = NULLIF($6,''),
			kecamatan = NULLIF($7,''),
			jenjang = NULLIF($8,''),
			status_sekolah = NULLIF($9,''),
			school_email = NULLIF($10,''),
			updated_at = now()
		WHERE id = $1
		RETURNING id, name, COALESCE(code,''), COALESCE(address,''), COALESCE(city,''), COALESCE(province,''),
		          COALESCE(kecamatan,''), COALESCE(jenjang,''), COALESCE(status_sekolah,''), COALESCE(school_email,'')
	`, id, name, code, address, city, province, kecamatan, jenjang, statusSekolah, schoolEmail).Scan(
		&out.ID,
		&out.Name,
		&out.Code,
		&out.Address,
		&out.City,
		&out.Province,
		&out.Kecamatan,
		&out.Jenjang,
		&out.StatusSekolah,
		&out.SchoolEmail,
	)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, sql.ErrNoRows
		}
		return nil, fmt.Errorf("update school: %w", err)
	}

	_ = s.writeAudit(ctx, actorID, "school_updated", "school", fmt.Sprintf("%d", out.ID), map[string]any{
		"name": out.Name,
		"code": out.Code,
	})
	return &out, nil
}

func (s *Service) DeleteSchool(ctx context.Context, actorID, id int64) error {
	if id <= 0 {
		return ErrInvalidInput
	}

	res, err := s.db.ExecContext(ctx, `
		DELETE FROM schools
		WHERE id = $1
	`, id)
	if err != nil {
		return fmt.Errorf("delete school: %w", err)
	}
	affected, _ := res.RowsAffected()
	if affected == 0 {
		return sql.ErrNoRows
	}

	_ = s.writeAudit(ctx, actorID, "school_deleted", "school", fmt.Sprintf("%d", id), map[string]any{})
	return nil
}

func (s *Service) UpdateClass(ctx context.Context, actorID, id int64, in UpdateClassInput) (*Class, error) {
	name := strings.TrimSpace(in.Name)
	grade := strings.TrimSpace(in.GradeLevel)
	if id <= 0 || in.SchoolID <= 0 || name == "" || grade == "" {
		return nil, ErrInvalidInput
	}

	var out Class
	err := s.db.QueryRowContext(ctx, `
		UPDATE classes
		SET school_id = $2,
			name = $3,
			grade_level = $4,
			updated_at = now()
		WHERE id = $1
		RETURNING id, school_id, name, grade_level
	`, id, in.SchoolID, name, grade).Scan(&out.ID, &out.SchoolID, &out.Name, &out.GradeLevel)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, sql.ErrNoRows
		}
		return nil, fmt.Errorf("update class: %w", err)
	}

	_ = s.writeAudit(ctx, actorID, "class_updated", "class", fmt.Sprintf("%d", out.ID), map[string]any{
		"school_id":   out.SchoolID,
		"name":        out.Name,
		"grade_level": out.GradeLevel,
	})
	return &out, nil
}

func (s *Service) DeleteClass(ctx context.Context, actorID, id int64) error {
	if id <= 0 {
		return ErrInvalidInput
	}

	res, err := s.db.ExecContext(ctx, `
		DELETE FROM classes
		WHERE id = $1
	`, id)
	if err != nil {
		return fmt.Errorf("delete class: %w", err)
	}
	affected, _ := res.RowsAffected()
	if affected == 0 {
		return sql.ErrNoRows
	}

	_ = s.writeAudit(ctx, actorID, "class_deleted", "class", fmt.Sprintf("%d", id), map[string]any{})
	return nil
}

func (s *Service) ListSchools(ctx context.Context, activeOnly bool) ([]School, error) {
	user, _ := auth.CurrentUser(ctx)
	restrictByScope := user != nil && user.Role == "proktor"
	query := `
		SELECT id, name, COALESCE(code,''), COALESCE(address,''), COALESCE(city,''), COALESCE(province,''),
		       COALESCE(kecamatan,''), COALESCE(jenjang,''), COALESCE(status_sekolah,''), COALESCE(school_email,'')
		FROM schools
	`
	conditions := make([]string, 0, 2)
	if activeOnly {
		conditions = append(conditions, "is_active = TRUE")
	}
	if restrictByScope {
		conditions = append(conditions, `EXISTS (
			SELECT 1
			FROM user_school_scopes uss
			WHERE uss.user_id = $1
			  AND uss.school_id = schools.id
		)`)
	}
	if len(conditions) > 0 {
		query += " WHERE " + strings.Join(conditions, " AND ")
	}
	query += " ORDER BY name ASC, id ASC"

	args := []interface{}{}
	if restrictByScope {
		args = append(args, user.ID)
	}
	rows, err := s.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("list schools: %w", err)
	}
	defer rows.Close()

	out := make([]School, 0)
	for rows.Next() {
		var it School
		if err := rows.Scan(&it.ID, &it.Name, &it.Code, &it.Address, &it.City, &it.Province, &it.Kecamatan, &it.Jenjang, &it.StatusSekolah, &it.SchoolEmail); err != nil {
			return nil, fmt.Errorf("scan school: %w", err)
		}
		out = append(out, it)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate schools: %w", err)
	}
	return out, nil
}

func (s *Service) GetSchoolUserStats(ctx context.Context, schoolID int64) (*SchoolUserStats, error) {
	if schoolID <= 0 {
		return nil, ErrInvalidInput
	}

	user, _ := auth.CurrentUser(ctx)
	restrictByScope := user != nil && user.Role == "proktor"

	query := `
		SELECT
			s.id,
			s.name,
			COALESCE((
				SELECT COUNT(*)
				FROM (
					SELECT DISTINCT u.id
					FROM users u
					JOIN (
						SELECT DISTINCT ON (e.user_id)
							e.user_id,
							e.school_id
						FROM enrollments e
						WHERE e.status = 'active'
						ORDER BY e.user_id, e.enrolled_at DESC, e.id DESC
					) latest_enrollment ON latest_enrollment.user_id = u.id
					WHERE u.is_active = TRUE
					  AND u.role = 'admin'
					  AND latest_enrollment.school_id = s.id
				) admins
			), 0) AS admin_count,
			COALESCE((
				SELECT COUNT(*)
				FROM (
					SELECT DISTINCT u.id
					FROM users u
					JOIN user_school_scopes uss ON uss.user_id = u.id
					WHERE u.is_active = TRUE
					  AND u.role = 'proktor'
					  AND uss.school_id = s.id
				) proktors
			), 0) AS proktor_count,
			COALESCE((
				SELECT COUNT(*)
				FROM (
					SELECT DISTINCT u.id
					FROM users u
					JOIN (
						SELECT DISTINCT ON (e.user_id)
							e.user_id,
							e.school_id
						FROM enrollments e
						WHERE e.status = 'active'
						ORDER BY e.user_id, e.enrolled_at DESC, e.id DESC
					) latest_enrollment ON latest_enrollment.user_id = u.id
					WHERE u.is_active = TRUE
					  AND u.role = 'guru'
					  AND latest_enrollment.school_id = s.id
				) gurus
			), 0) AS guru_count,
			COALESCE((
				SELECT COUNT(*)
				FROM (
					SELECT DISTINCT u.id
					FROM users u
					JOIN (
						SELECT DISTINCT ON (e.user_id)
							e.user_id,
							e.school_id
						FROM enrollments e
						WHERE e.status = 'active'
						ORDER BY e.user_id, e.enrolled_at DESC, e.id DESC
					) latest_enrollment ON latest_enrollment.user_id = u.id
					WHERE u.is_active = TRUE
					  AND u.role = 'siswa'
					  AND latest_enrollment.school_id = s.id
				) students
			), 0) AS siswa_count
		FROM schools s
		WHERE s.id = $1
	`

	args := []interface{}{schoolID}
	if restrictByScope {
		query += `
		  AND EXISTS (
			SELECT 1
			FROM user_school_scopes uss
			WHERE uss.user_id = $2
			  AND uss.school_id = s.id
		  )`
		args = append(args, user.ID)
	}

	var out SchoolUserStats
	err := s.db.QueryRowContext(ctx, query, args...).Scan(
		&out.SchoolID,
		&out.SchoolName,
		&out.AdminCount,
		&out.ProktorCount,
		&out.GuruCount,
		&out.SiswaCount,
	)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, sql.ErrNoRows
		}
		if isUndefinedTableErr(err, "user_school_scopes") && restrictByScope {
			return nil, sql.ErrNoRows
		}
		if isUndefinedTableErr(err, "user_school_scopes") {
			query = `
				SELECT
					s.id,
					s.name,
					COALESCE((
						SELECT COUNT(*)
						FROM (
							SELECT DISTINCT u.id
							FROM users u
							JOIN (
								SELECT DISTINCT ON (e.user_id)
									e.user_id,
									e.school_id
								FROM enrollments e
								WHERE e.status = 'active'
								ORDER BY e.user_id, e.enrolled_at DESC, e.id DESC
							) latest_enrollment ON latest_enrollment.user_id = u.id
							WHERE u.is_active = TRUE
							  AND u.role = 'admin'
							  AND latest_enrollment.school_id = s.id
						) admins
					), 0) AS admin_count,
					0 AS proktor_count,
					COALESCE((
						SELECT COUNT(*)
						FROM (
							SELECT DISTINCT u.id
							FROM users u
							JOIN (
								SELECT DISTINCT ON (e.user_id)
									e.user_id,
									e.school_id
								FROM enrollments e
								WHERE e.status = 'active'
								ORDER BY e.user_id, e.enrolled_at DESC, e.id DESC
							) latest_enrollment ON latest_enrollment.user_id = u.id
							WHERE u.is_active = TRUE
							  AND u.role = 'guru'
							  AND latest_enrollment.school_id = s.id
						) gurus
					), 0) AS guru_count,
					COALESCE((
						SELECT COUNT(*)
						FROM (
							SELECT DISTINCT u.id
							FROM users u
							JOIN (
								SELECT DISTINCT ON (e.user_id)
									e.user_id,
									e.school_id
								FROM enrollments e
								WHERE e.status = 'active'
								ORDER BY e.user_id, e.enrolled_at DESC, e.id DESC
							) latest_enrollment ON latest_enrollment.user_id = u.id
							WHERE u.is_active = TRUE
							  AND u.role = 'siswa'
							  AND latest_enrollment.school_id = s.id
						) students
					), 0) AS siswa_count
				FROM schools s
				WHERE s.id = $1
			`
			err = s.db.QueryRowContext(ctx, query, schoolID).Scan(
				&out.SchoolID,
				&out.SchoolName,
				&out.AdminCount,
				&out.ProktorCount,
				&out.GuruCount,
				&out.SiswaCount,
			)
			if err != nil {
				if errors.Is(err, sql.ErrNoRows) {
					return nil, sql.ErrNoRows
				}
				return nil, fmt.Errorf("get school user stats fallback: %w", err)
			}
			return &out, nil
		}
		return nil, fmt.Errorf("get school user stats: %w", err)
	}
	return &out, nil
}

func (s *Service) ListClasses(ctx context.Context, schoolID int64, activeOnly bool) ([]ClassListItem, error) {
	user, _ := auth.CurrentUser(ctx)
	restrictByScope := user != nil && user.Role == "proktor"
	query := `
		SELECT
			c.id,
			c.school_id,
			c.name,
			c.grade_level,
			c.is_active,
			COALESCE(COUNT(DISTINCT u.id), 0) AS student_count
		FROM classes c
		LEFT JOIN enrollments e ON e.class_id = c.id AND e.status = 'active'
		LEFT JOIN users u ON u.id = e.user_id AND u.is_active = TRUE AND u.role = 'siswa'
		WHERE ($1 <= 0 OR c.school_id = $1)
	`
	args := []interface{}{schoolID}
	if restrictByScope {
		query += `
		  AND EXISTS (
			SELECT 1
			FROM user_school_scopes uss
			WHERE uss.user_id = $2
			  AND uss.school_id = c.school_id
		  )`
		args = append(args, user.ID)
	}
	if activeOnly {
		query += " AND c.is_active = TRUE"
	}
	query += " GROUP BY c.id, c.school_id, c.name, c.grade_level, c.is_active"
	query += " ORDER BY c.grade_level ASC, c.name ASC, c.id ASC"

	rows, err := s.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("list classes: %w", err)
	}
	defer rows.Close()

	out := make([]ClassListItem, 0)
	for rows.Next() {
		var it ClassListItem
		if err := rows.Scan(
			&it.ID,
			&it.SchoolID,
			&it.Name,
			&it.GradeLevel,
			&it.IsActive,
			&it.StudentCount,
		); err != nil {
			return nil, fmt.Errorf("scan class: %w", err)
		}
		out = append(out, it)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate classes: %w", err)
	}
	return out, nil
}

func (s *Service) ImportStudentsCSV(ctx context.Context, actorID int64, r io.Reader) (*ImportStudentsReport, error) {
	reader := csv.NewReader(r)
	reader.TrimLeadingSpace = true

	header, err := reader.Read()
	if err != nil {
		return nil, fmt.Errorf("read csv header: %w", err)
	}
	index := make(map[string]int, len(header))
	for i, h := range header {
		n := normalizeHeader(h)
		if n != "" {
			index[n] = i
		}
	}

	required := []string{"full_name", "username", "password", "school_name", "class_name", "grade_level"}
	for _, col := range required {
		if _, ok := index[col]; !ok {
			return nil, fmt.Errorf("missing required column: %s", col)
		}
	}

	report := &ImportStudentsReport{Errors: make([]ImportRowError, 0)}
	rowNo := 1
	for {
		rowNo++
		rec, err := reader.Read()
		if errors.Is(err, io.EOF) {
			break
		}
		if err != nil {
			report.TotalRows++
			report.FailedRows++
			report.Errors = append(report.Errors, ImportRowError{Row: rowNo, Error: fmt.Sprintf("csv parse error: %v", err)})
			continue
		}

		report.TotalRows++
		if isRowEmpty(rec) {
			continue
		}

		row := map[string]string{
			"full_name":   cell(rec, index, "full_name"),
			"username":    normalizeUsernameCSV(cell(rec, index, "username")),
			"password":    cell(rec, index, "password"),
			"email":       strings.ToLower(cell(rec, index, "email")),
			"nisn":        cell(rec, index, "nisn"),
			"school_name": cell(rec, index, "school_name"),
			"class_name":  cell(rec, index, "class_name"),
			"grade_level": cell(rec, index, "grade_level"),
		}

		if err := validateImportRow(row); err != nil {
			report.FailedRows++
			report.Errors = append(report.Errors, ImportRowError{Row: rowNo, Error: err.Error()})
			continue
		}

		if err := s.importStudentRow(ctx, row); err != nil {
			report.FailedRows++
			report.Errors = append(report.Errors, ImportRowError{Row: rowNo, Error: err.Error()})
			continue
		}
		report.SuccessRows++
	}

	_ = s.writeAudit(ctx, actorID, "students_import_csv", "student_import", "csv", map[string]any{
		"total_rows":   report.TotalRows,
		"success_rows": report.SuccessRows,
		"failed_rows":  report.FailedRows,
	})

	return report, nil
}

func (s *Service) ImportClassesCSV(ctx context.Context, actorID int64, r io.Reader) (*ImportClassesReport, error) {
	reader := csv.NewReader(r)
	reader.TrimLeadingSpace = true

	header, err := reader.Read()
	if err != nil {
		return nil, fmt.Errorf("read csv header: %w", err)
	}
	index := make(map[string]int, len(header))
	for i, h := range header {
		n := normalizeHeader(h)
		if n != "" {
			index[n] = i
		}
	}

	required := []string{"school_name", "class_name", "grade_level"}
	for _, col := range required {
		if _, ok := index[col]; !ok {
			return nil, fmt.Errorf("missing required column: %s", col)
		}
	}

	report := &ImportClassesReport{Errors: make([]ImportClassRowError, 0)}
	rowNo := 1
	for {
		rowNo++
		rec, err := reader.Read()
		if errors.Is(err, io.EOF) {
			break
		}
		if err != nil {
			report.TotalRows++
			report.FailedRows++
			report.Errors = append(report.Errors, ImportClassRowError{
				Row:   rowNo,
				Error: fmt.Sprintf("csv parse error: %v", err),
			})
			continue
		}
		if isRowEmpty(rec) {
			continue
		}
		if len(rec) > 0 && strings.HasPrefix(strings.TrimSpace(rec[0]), "#") {
			continue
		}

		report.TotalRows++
		schoolName := cell(rec, index, "school_name")
		className := cell(rec, index, "class_name")
		gradeLevel := cell(rec, index, "grade_level")
		isActiveRaw := cell(rec, index, "is_active")
		isActive := parseBoolCSVDefaultTrue(isActiveRaw)

		if schoolName == "" || className == "" || gradeLevel == "" {
			report.FailedRows++
			report.Errors = append(report.Errors, ImportClassRowError{
				Row:        rowNo,
				SchoolName: schoolName,
				ClassName:  className,
				GradeLevel: gradeLevel,
				Error:      "school_name, class_name, dan grade_level wajib diisi",
			})
			continue
		}

		schoolID, lookupErr := s.lookupActiveSchoolIDByName(ctx, schoolName)
		if lookupErr != nil {
			report.FailedRows++
			report.Errors = append(report.Errors, ImportClassRowError{
				Row:        rowNo,
				SchoolName: schoolName,
				ClassName:  className,
				GradeLevel: gradeLevel,
				Error:      lookupErr.Error(),
			})
			continue
		}

		exists, checkErr := s.classExistsBySchoolGradeName(ctx, schoolID, className, gradeLevel)
		if checkErr != nil {
			report.FailedRows++
			report.Errors = append(report.Errors, ImportClassRowError{
				Row:        rowNo,
				SchoolName: schoolName,
				ClassName:  className,
				GradeLevel: gradeLevel,
				Error:      checkErr.Error(),
			})
			continue
		}

		if err := s.upsertClassByIdentity(ctx, schoolID, className, gradeLevel, isActive); err != nil {
			report.FailedRows++
			report.Errors = append(report.Errors, ImportClassRowError{
				Row:        rowNo,
				SchoolName: schoolName,
				ClassName:  className,
				GradeLevel: gradeLevel,
				Error:      err.Error(),
			})
			continue
		}

		report.SuccessRows++
		if exists {
			report.UpdatedRows++
		} else {
			report.CreatedRows++
		}
	}

	_ = s.writeAudit(ctx, actorID, "classes_import_csv", "class_import", "csv", map[string]any{
		"total_rows":   report.TotalRows,
		"success_rows": report.SuccessRows,
		"failed_rows":  report.FailedRows,
		"created_rows": report.CreatedRows,
		"updated_rows": report.UpdatedRows,
	})

	return report, nil
}

func (s *Service) ListEducationLevels(ctx context.Context, activeOnly bool) ([]EducationLevel, error) {
	query := `
		SELECT id, name, is_active
		FROM education_levels
	`
	if activeOnly {
		query += " WHERE is_active = TRUE"
	}
	query += " ORDER BY name ASC"

	rows, err := s.db.QueryContext(ctx, query)
	if err != nil {
		return nil, fmt.Errorf("list education levels: %w", err)
	}
	defer rows.Close()

	out := make([]EducationLevel, 0)
	for rows.Next() {
		var it EducationLevel
		if err := rows.Scan(&it.ID, &it.Name, &it.IsActive); err != nil {
			return nil, fmt.Errorf("scan education level: %w", err)
		}
		out = append(out, it)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate education levels: %w", err)
	}
	return out, nil
}

func (s *Service) CreateEducationLevel(ctx context.Context, actorID int64, name string) (*EducationLevel, error) {
	name = strings.TrimSpace(name)
	if name == "" {
		return nil, ErrInvalidInput
	}

	var out EducationLevel
	err := s.db.QueryRowContext(ctx, `
		INSERT INTO education_levels (name, is_active, created_at, updated_at)
		VALUES ($1, TRUE, now(), now())
		RETURNING id, name, is_active
	`, name).Scan(&out.ID, &out.Name, &out.IsActive)
	if err != nil {
		return nil, fmt.Errorf("create education level: %w", err)
	}

	_ = s.writeAudit(ctx, actorID, "education_level_created", "education_level", fmt.Sprintf("%d", out.ID), map[string]any{
		"name": out.Name,
	})
	return &out, nil
}

func (s *Service) UpdateEducationLevel(ctx context.Context, actorID, id int64, name string) (*EducationLevel, error) {
	name = strings.TrimSpace(name)
	if id <= 0 || name == "" {
		return nil, ErrInvalidInput
	}

	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, fmt.Errorf("begin tx: %w", err)
	}
	defer func() { _ = tx.Rollback() }()

	var oldName string
	if err := tx.QueryRowContext(ctx, `
		SELECT name FROM education_levels WHERE id = $1
	`, id).Scan(&oldName); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, sql.ErrNoRows
		}
		return nil, fmt.Errorf("load education level: %w", err)
	}

	var out EducationLevel
	if err := tx.QueryRowContext(ctx, `
		UPDATE education_levels
		SET name = $2,
			updated_at = now()
		WHERE id = $1
		RETURNING id, name, is_active
	`, id, name).Scan(&out.ID, &out.Name, &out.IsActive); err != nil {
		return nil, fmt.Errorf("update education level: %w", err)
	}

	if strings.TrimSpace(oldName) != strings.TrimSpace(name) {
		if _, err := tx.ExecContext(ctx, `
			UPDATE subjects
			SET education_level = $2
			WHERE education_level = $1
		`, oldName, name); err != nil {
			return nil, fmt.Errorf("sync subjects education_level: %w", err)
		}
	}

	if err := tx.Commit(); err != nil {
		return nil, fmt.Errorf("commit tx: %w", err)
	}

	_ = s.writeAudit(ctx, actorID, "education_level_updated", "education_level", fmt.Sprintf("%d", out.ID), map[string]any{
		"old_name": oldName,
		"name":     out.Name,
	})
	return &out, nil
}

func (s *Service) DeleteEducationLevel(ctx context.Context, actorID, id int64) error {
	if id <= 0 {
		return ErrInvalidInput
	}

	var name string
	if err := s.db.QueryRowContext(ctx, `
		SELECT name FROM education_levels WHERE id = $1
	`, id).Scan(&name); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return sql.ErrNoRows
		}
		return fmt.Errorf("load education level: %w", err)
	}

	var subjectCount int
	if err := s.db.QueryRowContext(ctx, `
		SELECT COUNT(1) FROM subjects WHERE education_level = $1
	`, name).Scan(&subjectCount); err != nil {
		return fmt.Errorf("count subject references: %w", err)
	}
	if subjectCount > 0 {
		return errors.New("education level is still used by subjects")
	}

	res, err := s.db.ExecContext(ctx, `
		DELETE FROM education_levels WHERE id = $1
	`, id)
	if err != nil {
		return fmt.Errorf("delete education level: %w", err)
	}
	affected, _ := res.RowsAffected()
	if affected == 0 {
		return sql.ErrNoRows
	}

	_ = s.writeAudit(ctx, actorID, "education_level_deleted", "education_level", fmt.Sprintf("%d", id), map[string]any{
		"name": name,
	})
	return nil
}

func (s *Service) ListLearningGoals(ctx context.Context, mataPelajaran, kelas string, semester int16, ownerID *int64) ([]LearningGoal, error) {
	query := `
		SELECT id, tujuan_pembelajaran, materi, mata_pelajaran, kelas, semester, created_by
		FROM learning_goals
		WHERE ($1 = '' OR LOWER(mata_pelajaran) = LOWER($1))
		  AND ($2 = '' OR LOWER(kelas) = LOWER($2))
		  AND ($3 <= 0 OR semester = $3)
		  AND ($4 <= 0 OR created_by = $4)
		ORDER BY mata_pelajaran ASC, kelas ASC, semester ASC, id ASC
	`
	var ownerFilter int64
	if ownerID != nil && *ownerID > 0 {
		ownerFilter = *ownerID
	}
	rows, err := s.db.QueryContext(ctx, query, strings.TrimSpace(mataPelajaran), strings.TrimSpace(kelas), semester, ownerFilter)
	if err != nil {
		return nil, fmt.Errorf("list learning goals: %w", err)
	}
	defer rows.Close()

	items := make([]LearningGoal, 0)
	for rows.Next() {
		var it LearningGoal
		var createdBy sql.NullInt64
		if err := rows.Scan(&it.ID, &it.TujuanPembelajaran, &it.Materi, &it.MataPelajaran, &it.Kelas, &it.Semester, &createdBy); err != nil {
			return nil, fmt.Errorf("scan learning goal: %w", err)
		}
		if createdBy.Valid {
			it.CreatedBy = &createdBy.Int64
		}
		items = append(items, it)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate learning goals: %w", err)
	}
	return items, nil
}

func (s *Service) CreateLearningGoal(ctx context.Context, actorID int64, in CreateLearningGoalInput) (*LearningGoal, error) {
	tujuan := strings.TrimSpace(in.TujuanPembelajaran)
	materi := strings.TrimSpace(in.Materi)
	mapel := strings.TrimSpace(in.MataPelajaran)
	kelas := strings.TrimSpace(in.Kelas)
	if tujuan == "" || materi == "" || mapel == "" || kelas == "" || in.Semester <= 0 {
		return nil, ErrInvalidInput
	}
	lgHasTenant, err := hasColumn(ctx, s.db, "learning_goals", "tenant_id")
	if err != nil {
		return nil, err
	}
	var tenantID *int64
	if lgHasTenant {
		tenantID, err = loadUserTenantID(ctx, s.db, actorID)
		if err != nil {
			return nil, err
		}
		if tenantID == nil || *tenantID <= 0 {
			return nil, ErrLearningGoalTenantNeeded
		}
	}

	var out LearningGoal
	var createdBy sql.NullInt64
	columns := []string{"tujuan_pembelajaran", "materi", "mata_pelajaran", "kelas", "semester", "created_by"}
	values := []string{"$1", "$2", "$3", "$4", "$5", "NULLIF($6, 0)"}
	args := []any{tujuan, materi, mapel, kelas, in.Semester, actorID}
	if lgHasTenant {
		columns = append(columns, "tenant_id")
		values = append(values, fmt.Sprintf("$%d", len(args)+1))
		args = append(args, *tenantID)
	}
	if err := s.db.QueryRowContext(ctx, fmt.Sprintf(`
		INSERT INTO learning_goals (%s)
		VALUES (%s)
		RETURNING id, tujuan_pembelajaran, materi, mata_pelajaran, kelas, semester, created_by
	`, strings.Join(columns, ", "), strings.Join(values, ", ")), args...).Scan(
		&out.ID, &out.TujuanPembelajaran, &out.Materi, &out.MataPelajaran, &out.Kelas, &out.Semester, &createdBy,
	); err != nil {
		return nil, fmt.Errorf("create learning goal: %w", err)
	}
	if createdBy.Valid {
		out.CreatedBy = &createdBy.Int64
	}

	_ = s.writeAudit(ctx, actorID, "learning_goal_created", "learning_goal", fmt.Sprintf("%d", out.ID), map[string]any{
		"mata_pelajaran": out.MataPelajaran,
		"kelas":          out.Kelas,
		"materi":         out.Materi,
		"semester":       out.Semester,
	})
	return &out, nil
}

func (s *Service) UpdateLearningGoal(ctx context.Context, actorID, id int64, in UpdateLearningGoalInput, ownerID *int64) (*LearningGoal, error) {
	tujuan := strings.TrimSpace(in.TujuanPembelajaran)
	materi := strings.TrimSpace(in.Materi)
	mapel := strings.TrimSpace(in.MataPelajaran)
	kelas := strings.TrimSpace(in.Kelas)
	if id <= 0 || tujuan == "" || materi == "" || mapel == "" || kelas == "" || in.Semester <= 0 {
		return nil, ErrInvalidInput
	}

	var ownerFilter int64
	if ownerID != nil && *ownerID > 0 {
		ownerFilter = *ownerID
	}

	var out LearningGoal
	var createdBy sql.NullInt64
	if err := s.db.QueryRowContext(ctx, `
		UPDATE learning_goals
		SET tujuan_pembelajaran = $2,
			materi = $3,
			mata_pelajaran = $4,
			kelas = $5,
			semester = $6
		WHERE id = $1
		  AND ($7 <= 0 OR created_by = $7)
		RETURNING id, tujuan_pembelajaran, materi, mata_pelajaran, kelas, semester, created_by
	`, id, tujuan, materi, mapel, kelas, in.Semester, ownerFilter).Scan(
		&out.ID, &out.TujuanPembelajaran, &out.Materi, &out.MataPelajaran, &out.Kelas, &out.Semester, &createdBy,
	); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, sql.ErrNoRows
		}
		return nil, fmt.Errorf("update learning goal: %w", err)
	}
	if createdBy.Valid {
		out.CreatedBy = &createdBy.Int64
	}

	_ = s.writeAudit(ctx, actorID, "learning_goal_updated", "learning_goal", fmt.Sprintf("%d", out.ID), map[string]any{
		"mata_pelajaran": out.MataPelajaran,
		"kelas":          out.Kelas,
		"materi":         out.Materi,
		"semester":       out.Semester,
	})
	return &out, nil
}

func (s *Service) DeleteLearningGoal(ctx context.Context, actorID, id int64, ownerID *int64) error {
	if id <= 0 {
		return ErrInvalidInput
	}

	var ownerFilter int64
	if ownerID != nil && *ownerID > 0 {
		ownerFilter = *ownerID
	}

	res, err := s.db.ExecContext(ctx, `
		DELETE FROM learning_goals
		WHERE id = $1
		  AND ($2 <= 0 OR created_by = $2)
	`, id, ownerFilter)
	if err != nil {
		return fmt.Errorf("delete learning goal: %w", err)
	}
	affected, _ := res.RowsAffected()
	if affected == 0 {
		return sql.ErrNoRows
	}

	_ = s.writeAudit(ctx, actorID, "learning_goal_deleted", "learning_goal", fmt.Sprintf("%d", id), map[string]any{})
	return nil
}

func (s *Service) importStudentRow(ctx context.Context, row map[string]string) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("begin tx: %w", err)
	}
	defer func() { _ = tx.Rollback() }()

	schoolID, err := getOrCreateSchoolTx(ctx, tx, row["school_name"])
	if err != nil {
		return err
	}
	classID, err := getOrCreateClassTx(ctx, tx, schoolID, row["class_name"], row["grade_level"])
	if err != nil {
		return err
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(row["password"]), s.bcryptCost)
	if err != nil {
		return fmt.Errorf("hash password: %w", err)
	}

	var email any
	var verifiedAt any
	if row["email"] != "" {
		email = row["email"]
		now := time.Now()
		verifiedAt = now
	}

	var userID int64
	err = tx.QueryRowContext(ctx, `
		INSERT INTO users (
			username, password_hash, full_name, role, is_active,
			email, email_verified_at, account_status, approved_at, created_at, updated_at
		) VALUES (
			$1, $2, $3, 'siswa', TRUE,
			$4, $5, 'active', now(), now(), now()
		)
		RETURNING id
	`, row["username"], string(hash), row["full_name"], email, verifiedAt).Scan(&userID)
	if err != nil {
		return fmt.Errorf("insert user: %w", err)
	}

	_, err = tx.ExecContext(ctx, `
		INSERT INTO auth_identities (user_id, provider, provider_key, created_at)
		VALUES ($1, 'password', $2, now())
		ON CONFLICT (provider, provider_key) DO NOTHING
	`, userID, row["username"])
	if err != nil {
		return fmt.Errorf("insert identity: %w", err)
	}

	_, err = tx.ExecContext(ctx, `
		INSERT INTO student_profiles (user_id, nisn, school_id, grade_level, class_name)
		VALUES ($1, NULLIF($2,''), $3, $4, $5)
		ON CONFLICT (user_id)
		DO UPDATE SET
			nisn = EXCLUDED.nisn,
			school_id = EXCLUDED.school_id,
			grade_level = EXCLUDED.grade_level,
			class_name = EXCLUDED.class_name
	`, userID, row["nisn"], schoolID, row["grade_level"], row["class_name"])
	if err != nil {
		return fmt.Errorf("upsert student profile: %w", err)
	}

	_, err = tx.ExecContext(ctx, `
		INSERT INTO enrollments (user_id, school_id, class_id, status, enrolled_at, created_at)
		VALUES ($1, $2, $3, 'active', now(), now())
		ON CONFLICT (user_id, class_id) DO NOTHING
	`, userID, schoolID, classID)
	if err != nil {
		return fmt.Errorf("insert enrollment: %w", err)
	}

	if err := tx.Commit(); err != nil {
		return fmt.Errorf("commit tx: %w", err)
	}
	return nil
}

func getOrCreateSchoolTx(ctx context.Context, tx *sql.Tx, schoolName string) (int64, error) {
	var schoolID int64
	err := tx.QueryRowContext(ctx, `
		SELECT id
		FROM schools
		WHERE LOWER(name) = LOWER($1)
		LIMIT 1
	`, schoolName).Scan(&schoolID)
	if err == nil {
		return schoolID, nil
	}
	if !errors.Is(err, sql.ErrNoRows) {
		return 0, fmt.Errorf("lookup school: %w", err)
	}

	err = tx.QueryRowContext(ctx, `
		INSERT INTO schools (name, created_at, updated_at)
		VALUES ($1, now(), now())
		RETURNING id
	`, schoolName).Scan(&schoolID)
	if err != nil {
		return 0, fmt.Errorf("insert school: %w", err)
	}
	return schoolID, nil
}

func getOrCreateClassTx(ctx context.Context, tx *sql.Tx, schoolID int64, className, gradeLevel string) (int64, error) {
	var classID int64
	err := tx.QueryRowContext(ctx, `
		SELECT id
		FROM classes
		WHERE school_id = $1 AND name = $2 AND grade_level = $3
		LIMIT 1
	`, schoolID, className, gradeLevel).Scan(&classID)
	if err == nil {
		return classID, nil
	}
	if !errors.Is(err, sql.ErrNoRows) {
		return 0, fmt.Errorf("lookup class: %w", err)
	}

	err = tx.QueryRowContext(ctx, `
		INSERT INTO classes (school_id, name, grade_level, created_at, updated_at)
		VALUES ($1, $2, $3, now(), now())
		RETURNING id
	`, schoolID, className, gradeLevel).Scan(&classID)
	if err != nil {
		return 0, fmt.Errorf("insert class: %w", err)
	}
	return classID, nil
}

func (s *Service) writeAudit(ctx context.Context, userID int64, action, entityType, entityID string, payload map[string]any) error {
	b, err := json.Marshal(payload)
	if err != nil {
		return err
	}
	_, err = s.db.ExecContext(ctx, `
		INSERT INTO audit_logs (user_id, action, entity_type, entity_id, payload, created_at)
		VALUES ($1, $2, $3, $4, $5::jsonb, now())
	`, userID, action, entityType, entityID, string(b))
	return err
}

func normalizeHeader(h string) string {
	h = strings.ToLower(strings.TrimSpace(h))
	h = strings.ReplaceAll(h, "-", "_")
	h = strings.ReplaceAll(h, " ", "_")
	return h
}

func normalizeUsernameCSV(s string) string {
	s = strings.ToLower(strings.TrimSpace(s))
	var b strings.Builder
	for _, r := range s {
		if (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') {
			b.WriteRune(r)
		}
	}
	return b.String()
}

func cell(rec []string, idx map[string]int, key string) string {
	i, ok := idx[key]
	if !ok || i < 0 || i >= len(rec) {
		return ""
	}
	return strings.TrimSpace(rec[i])
}

func validateImportRow(row map[string]string) error {
	if row["full_name"] == "" {
		return errors.New("full_name is required")
	}
	if row["username"] == "" {
		return errors.New("username is required")
	}
	if len(row["password"]) < 8 {
		return errors.New("password minimum length is 8")
	}
	if row["school_name"] == "" || row["class_name"] == "" || row["grade_level"] == "" {
		return errors.New("school_name, class_name, and grade_level are required")
	}
	if row["email"] != "" {
		if _, err := mail.ParseAddress(row["email"]); err != nil {
			return errors.New("invalid email format")
		}
	}
	return nil
}

func isRowEmpty(rec []string) bool {
	for _, c := range rec {
		if strings.TrimSpace(c) != "" {
			return false
		}
	}
	return true
}

func parseBoolCSVDefaultTrue(v string) bool {
	v = strings.TrimSpace(strings.ToLower(v))
	if v == "" {
		return true
	}
	switch v {
	case "1", "true", "yes", "ya", "aktif":
		return true
	case "0", "false", "no", "tidak", "nonaktif":
		return false
	default:
		return true
	}
}

func (s *Service) lookupActiveSchoolIDByName(ctx context.Context, schoolName string) (int64, error) {
	var id int64
	var isActive bool
	err := s.db.QueryRowContext(ctx, `
		SELECT id, is_active
		FROM schools
		WHERE LOWER(name) = LOWER($1)
		LIMIT 1
	`, strings.TrimSpace(schoolName)).Scan(&id, &isActive)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return 0, fmt.Errorf("school_name tidak ditemukan: %s", schoolName)
		}
		return 0, fmt.Errorf("lookup school_name gagal: %w", err)
	}
	if !isActive {
		return 0, fmt.Errorf("school_name nonaktif: %s", schoolName)
	}
	return id, nil
}

func (s *Service) classExistsBySchoolGradeName(ctx context.Context, schoolID int64, className, gradeLevel string) (bool, error) {
	var exists bool
	if err := s.db.QueryRowContext(ctx, `
		SELECT EXISTS(
			SELECT 1
			FROM classes
			WHERE school_id = $1
			  AND LOWER(name) = LOWER($2)
			  AND LOWER(grade_level) = LOWER($3)
		)
	`, schoolID, strings.TrimSpace(className), strings.TrimSpace(gradeLevel)).Scan(&exists); err != nil {
		return false, fmt.Errorf("cek kelas existing gagal: %w", err)
	}
	return exists, nil
}

func (s *Service) upsertClassByIdentity(ctx context.Context, schoolID int64, className, gradeLevel string, isActive bool) error {
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO classes (school_id, name, grade_level, is_active, created_at, updated_at)
		VALUES ($1, $2, $3, $4, now(), now())
		ON CONFLICT (school_id, grade_level, name)
		DO UPDATE SET
			is_active = EXCLUDED.is_active,
			updated_at = now()
	`, schoolID, strings.TrimSpace(className), strings.TrimSpace(gradeLevel), isActive)
	if err != nil {
		return fmt.Errorf("simpan kelas gagal: %w", err)
	}
	return nil
}
