package monitor

import (
	"context"
	"database/sql"
	"fmt"
	"math"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"time"
)

type DailyExamSummaryOptions struct {
	DB                         *sql.DB
	Location                   *time.Location
	StateDir                   string
	ReconnectAnomalyThreshold  int
	Notifier                   Notifier
	IncludeTopScoreStudentInfo bool
}

func SendDailyExamSummary(ctx context.Context, opts DailyExamSummaryOptions) error {
	if opts.DB == nil {
		return fmt.Errorf("DB is required")
	}
	if opts.Location == nil {
		opts.Location = time.Local
	}
	if opts.Notifier == nil {
		return fmt.Errorf("Notifier is required")
	}
	if opts.ReconnectAnomalyThreshold < 0 {
		opts.ReconnectAnomalyThreshold = 0
	}

	targetDate, err := resolveSummaryDate(opts.Location)
	if err != nil {
		return err
	}

	// Idempotency: if already sent for this date, exit quietly.
	stateName := fmt.Sprintf("daily.%s.sent", targetDate.Format("2006-01-02"))
	statePath := filepath.Join(strings.TrimSpace(opts.StateDir), stateName)
	if _, err := os.Stat(statePath); err == nil {
		return nil
	}

	start := time.Date(targetDate.Year(), targetDate.Month(), targetDate.Day(), 0, 0, 0, 0, opts.Location)
	end := start.AddDate(0, 0, 1)

	sum, err := loadDailySummary(ctx, opts.DB, start, end)
	if err != nil {
		return err
	}

	var top *topScoreInfo
	if sum.CountSubmitted > 0 {
		top, _ = loadTopScoreInfo(ctx, opts.DB, start, end, opts.IncludeTopScoreStudentInfo)
	}

	an, _ := loadReconnectAnomaly(ctx, opts.DB, start, end, opts.ReconnectAnomalyThreshold)

	appBaseURL := strings.TrimSpace(os.Getenv("APP_BASE_URL"))
	profileURL := buildStudentProfileURL(appBaseURL, top)
	text := buildDailySummaryMessage(targetDate, time.Now().In(opts.Location), sum, top, an, profileURL != "")
	sendCtx, cancel := context.WithTimeout(ctx, 12*time.Second)
	if bn, ok := opts.Notifier.(ButtonNotifier); ok && profileURL != "" {
		err = bn.SendTextWithButton(sendCtx, text, "🔗 Profile", profileURL)
	} else {
		err = opts.Notifier.SendText(sendCtx, text)
	}
	cancel()
	if err != nil {
		return err
	}

	_ = writeStateFileAtomic(strings.TrimSpace(opts.StateDir), stateName, time.Now().In(opts.Location).Format(time.RFC3339))
	return nil
}

func resolveSummaryDate(loc *time.Location) (time.Time, error) {
	// Default: summarize yesterday, because the timer runs at 01:30 WIB.
	now := time.Now().In(loc)
	if raw := strings.TrimSpace(os.Getenv("SUMMARY_DATE")); raw != "" {
		t, err := time.ParseInLocation("2006-01-02", raw, loc)
		if err != nil {
			return time.Time{}, fmt.Errorf("invalid SUMMARY_DATE=%q (expected YYYY-MM-DD)", raw)
		}
		return t, nil
	}
	return now.AddDate(0, 0, -1), nil
}

type dailySummary struct {
	CountSubmitted int64
	MaxScore       float64
	AvgSeconds     float64
	P95Seconds     float64
	MaxSeconds     float64
}

func loadDailySummary(ctx context.Context, db *sql.DB, start, end time.Time) (*dailySummary, error) {
	out := &dailySummary{}
	q := `
		SELECT
			COUNT(*)::bigint AS submitted_count,
			COALESCE(MAX(a.score::float8), 0) AS max_score,
			COALESCE(AVG(EXTRACT(EPOCH FROM (a.submitted_at - a.started_at))), 0) AS avg_seconds,
			COALESCE(PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (a.submitted_at - a.started_at))), 0) AS p95_seconds,
			COALESCE(MAX(EXTRACT(EPOCH FROM (a.submitted_at - a.started_at))), 0) AS max_seconds
		FROM attempts a
		WHERE a.status = 'submitted'
		  AND a.submitted_at IS NOT NULL
		  AND a.submitted_at >= $1
		  AND a.submitted_at < $2
	`
	if err := db.QueryRowContext(ctx, q, start, end).Scan(
		&out.CountSubmitted,
		&out.MaxScore,
		&out.AvgSeconds,
		&out.P95Seconds,
		&out.MaxSeconds,
	); err != nil {
		return nil, fmt.Errorf("load summary: %w", err)
	}
	return out, nil
}

type topScoreInfo struct {
	Score         float64
	MaxPossible   float64
	ExamTitle     string
	FullName      string
	ClassName     string
	School        string
	StudentID     int64
	Username      string
	ParticipantNo string
	NISN          string
}

func loadTopScoreInfo(ctx context.Context, db *sql.DB, start, end time.Time, includeStudentInfo bool) (*topScoreInfo, error) {
	// We try to load school/class from enrollments+classes when present, falling back to student_profiles.
	hasEnrollments, _ := tableExists(ctx, db, "enrollments")
	hasClasses, _ := tableExists(ctx, db, "classes")
	hasSchools, _ := tableExists(ctx, db, "schools")
	hasStudentProfiles, _ := tableExists(ctx, db, "student_profiles")

	classExpr := "''"
	schoolExpr := "''"
	joins := ""

	if includeStudentInfo {
		if hasEnrollments && hasClasses && hasSchools {
			joins += `
				LEFT JOIN LATERAL (
					SELECT e.school_id, e.class_id
					FROM enrollments e
					WHERE e.user_id = u.id
					  AND e.status = 'active'
					ORDER BY e.enrolled_at DESC, e.id DESC
					LIMIT 1
				) en ON TRUE
				LEFT JOIN classes c ON c.id = en.class_id
				LEFT JOIN schools s_en ON s_en.id = en.school_id
			`
			classExpr = `CASE
				WHEN NULLIF(btrim(c.grade_level), '') IS NOT NULL AND NULLIF(btrim(c.name), '') IS NOT NULL THEN NULLIF(btrim(c.grade_level), '') || '-' || NULLIF(btrim(c.name), '')
				WHEN NULLIF(btrim(c.name), '') IS NOT NULL THEN NULLIF(btrim(c.name), '')
				WHEN NULLIF(btrim(c.grade_level), '') IS NOT NULL THEN NULLIF(btrim(c.grade_level), '')
				ELSE ''
			END`
			schoolExpr = "COALESCE(NULLIF(btrim(s_en.name), ''), '')"
		}

		if hasStudentProfiles && hasSchools {
			joins += `
				LEFT JOIN student_profiles sp ON sp.user_id = u.id
				LEFT JOIN schools s_sp ON s_sp.id = sp.school_id
			`
			// Prefer enrollments-based if present, otherwise student_profiles.
			if classExpr == "''" {
				classExpr = "COALESCE(NULLIF(btrim(sp.grade_level), '') || '-' || NULLIF(btrim(sp.class_name), ''), NULLIF(btrim(sp.class_name), ''), NULLIF(btrim(sp.grade_level), ''), '')"
			} else {
				classExpr = fmt.Sprintf("COALESCE(NULLIF(%s, ''), COALESCE(NULLIF(btrim(sp.grade_level), '') || '-' || NULLIF(btrim(sp.class_name), ''), NULLIF(btrim(sp.class_name), ''), NULLIF(btrim(sp.grade_level), ''), ''))", classExpr)
			}

			if schoolExpr == "''" {
				schoolExpr = "COALESCE(NULLIF(btrim(s_sp.name), ''), '')"
			} else {
				schoolExpr = fmt.Sprintf("COALESCE(NULLIF(%s, ''), COALESCE(NULLIF(btrim(s_sp.name), ''), ''))", schoolExpr)
			}
		}
	}

	fullNameExpr := "''"
	if includeStudentInfo {
		fullNameExpr = "COALESCE(NULLIF(btrim(u.full_name), ''), u.username)"
	}

	participantExpr := "''"
	nisnExpr := "''"
	usernameExpr := "COALESCE(NULLIF(btrim(u.username), ''), '')"
	if ok, _ := columnExists(ctx, db, "users", "participant_no"); ok {
		participantExpr = "COALESCE(NULLIF(btrim(u.participant_no), ''), '')"
	}
	if ok, _ := columnExists(ctx, db, "users", "nisn"); ok {
		nisnExpr = "COALESCE(NULLIF(btrim(u.nisn), ''), '')"
	}

	q := fmt.Sprintf(`
		SELECT
			a.score::float8 AS score,
			COALESCE(eqsum.max_possible, 0)::float8 AS max_possible,
			COALESCE(NULLIF(btrim(ex.title), ''), ex.code) AS exam_title,
			%s AS full_name,
			%s AS class_name,
			%s AS school_name
			, u.id AS student_id
			, %s AS username
			, %s AS participant_no
			, %s AS nisn
		FROM attempts a
		JOIN exams ex ON ex.id = a.exam_id
		LEFT JOIN LATERAL (
			SELECT COALESCE(SUM(eq.weight::float8), 0) AS max_possible
			FROM exam_questions eq
			WHERE eq.exam_id = ex.id
		) eqsum ON TRUE
		JOIN users u ON u.id = a.student_id
		%s
		WHERE a.status = 'submitted'
		  AND a.submitted_at IS NOT NULL
		  AND a.submitted_at >= $1
		  AND a.submitted_at < $2
		  AND a.score IS NOT NULL
		ORDER BY a.score DESC, a.submitted_at DESC, a.id DESC
		LIMIT 1
	`, fullNameExpr, classExpr, schoolExpr, usernameExpr, participantExpr, nisnExpr, joins)

	var out topScoreInfo
	if err := db.QueryRowContext(ctx, q, start, end).Scan(
		&out.Score,
		&out.MaxPossible,
		&out.ExamTitle,
		&out.FullName,
		&out.ClassName,
		&out.School,
		&out.StudentID,
		&out.Username,
		&out.ParticipantNo,
		&out.NISN,
	); err != nil {
		if err == sql.ErrNoRows {
			return nil, nil
		}
		return nil, fmt.Errorf("load top score: %w", err)
	}
	return &out, nil
}

type reconnectAnomaly struct {
	Threshold int
	AnomalyN  int64
	MaxN      int64
}

func loadReconnectAnomaly(ctx context.Context, db *sql.DB, start, end time.Time, threshold int) (*reconnectAnomaly, error) {
	hasEvents, _ := tableExists(ctx, db, "attempt_events")
	if !hasEvents {
		return nil, nil
	}
	if threshold <= 0 {
		return &reconnectAnomaly{Threshold: threshold}, nil
	}

	q := `
		WITH per_attempt AS (
			SELECT
				a.id AS attempt_id,
				COUNT(ae.id)::bigint AS reconnect_count
			FROM attempts a
			LEFT JOIN attempt_events ae
			  ON ae.attempt_id = a.id
			 AND ae.event_type = 'reconnect'
			 AND ae.server_ts >= a.started_at
			 AND a.submitted_at IS NOT NULL
			 AND ae.server_ts <= a.submitted_at
			WHERE a.status = 'submitted'
			  AND a.submitted_at IS NOT NULL
			  AND a.submitted_at >= $1
			  AND a.submitted_at < $2
			GROUP BY a.id
		)
		SELECT
			COUNT(*) FILTER (WHERE reconnect_count >= $3)::bigint AS anomaly_attempts,
			COALESCE(MAX(reconnect_count), 0)::bigint AS max_reconnect
		FROM per_attempt
	`
	var out reconnectAnomaly
	out.Threshold = threshold
	if err := db.QueryRowContext(ctx, q, start, end, threshold).Scan(&out.AnomalyN, &out.MaxN); err != nil {
		return nil, fmt.Errorf("load reconnect anomaly: %w", err)
	}
	return &out, nil
}

func buildDailySummaryMessage(day time.Time, generatedAt time.Time, sum *dailySummary, top *topScoreInfo, an *reconnectAnomaly, hasProfileLink bool) string {
	var b strings.Builder
	genStr := generatedAt.Format("2006-01-02 15:04:05")
	_ = day // kept for potential future use (e.g., explicit coverage period in message)
	b.WriteString(fmt.Sprintf("REKAP UJIAN [diambil %s WIB]\n", genStr))
	if sum == nil {
		b.WriteString("Selesai: 0")
		return strings.TrimSpace(b.String())
	}
	b.WriteString(fmt.Sprintf("✅ Selesai: %d\n", sum.CountSubmitted))
	if sum.CountSubmitted == 0 {
		return strings.TrimSpace(b.String())
	}

	if top != nil && strings.TrimSpace(top.ExamTitle) != "" {
		score100 := ""
		if top.MaxPossible > 0 {
			v := (top.Score / top.MaxPossible) * 100.0
			score100 = formatFloatComma(v, 2)
		}

		if score100 != "" {
			b.WriteString(fmt.Sprintf("🏆 Nilai tertinggi: %.2f | %s\n", top.Score, score100))
		} else {
			b.WriteString(fmt.Sprintf("🏆 Nilai tertinggi: %.2f\n", top.Score))
		}
		b.WriteString(fmt.Sprintf("📝 Ujian: %s\n", strings.TrimSpace(top.ExamTitle)))
		if s := strings.TrimSpace(top.FullName); s != "" {
			if hasProfileLink {
				b.WriteString(fmt.Sprintf("👤 Nama Siswa: %s 🔗\n", s))
			} else {
				b.WriteString(fmt.Sprintf("👤 Nama Siswa: %s\n", s))
			}
		}
		if strings.TrimSpace(top.ClassName) != "" || strings.TrimSpace(top.School) != "" {
			parts := make([]string, 0, 2)
			if s := strings.TrimSpace(top.ClassName); s != "" {
				parts = append(parts, s)
			}
			if s := strings.TrimSpace(top.School); s != "" {
				parts = append(parts, s)
			}
			b.WriteString(fmt.Sprintf("🏫 Kelas: %s\n", strings.Join(parts, " | ")))
		}
	}

	b.WriteString(fmt.Sprintf("⏱️ Durasi: avg %s | p95 %s | max %s\n",
		formatSeconds(sum.AvgSeconds),
		formatSeconds(sum.P95Seconds),
		formatSeconds(sum.MaxSeconds),
	))

	if an != nil && an.Threshold > 0 {
		b.WriteString(fmt.Sprintf("🔄 Koneksi: Reconnect: %d attempt >= %dx (max %dx)\n", an.AnomalyN, an.Threshold, an.MaxN))
	}

	return strings.TrimSpace(b.String())
}

func formatSeconds(sec float64) string {
	if sec <= 0 {
		return "0m"
	}
	if math.IsNaN(sec) || math.IsInf(sec, 0) {
		return "-"
	}
	d := time.Duration(sec * float64(time.Second))
	if d < time.Minute {
		return "1m"
	}
	// round to whole minute for readability
	d = d.Round(time.Minute)
	h := d / time.Hour
	m := (d % time.Hour) / time.Minute
	if h > 0 {
		return fmt.Sprintf("%dh%02dm", h, m)
	}
	return fmt.Sprintf("%dm", m)
}

func formatFloatComma(v float64, decimals int) string {
	if decimals < 0 {
		decimals = 0
	}
	s := fmt.Sprintf("%.*f", decimals, v)
	// Indonesian formatting: decimal comma.
	return strings.ReplaceAll(s, ".", ",")
}

func tableExists(ctx context.Context, db *sql.DB, table string) (bool, error) {
	table = strings.TrimSpace(table)
	if table == "" {
		return false, nil
	}
	var reg sql.NullString
	if err := db.QueryRowContext(ctx, `SELECT to_regclass($1)`, "public."+table).Scan(&reg); err != nil {
		return false, err
	}
	return reg.Valid && strings.TrimSpace(reg.String) != "", nil
}

func columnExists(ctx context.Context, db *sql.DB, table, column string) (bool, error) {
	table = strings.TrimSpace(table)
	column = strings.TrimSpace(column)
	if table == "" || column == "" {
		return false, nil
	}
	var exists bool
	if err := db.QueryRowContext(ctx, `
		SELECT EXISTS(
			SELECT 1
			FROM information_schema.columns
			WHERE table_schema = 'public'
			  AND table_name = $1
			  AND column_name = $2
		)
	`, table, column).Scan(&exists); err != nil {
		return false, err
	}
	return exists, nil
}

func buildStudentProfileURL(appBaseURL string, top *topScoreInfo) string {
	appBaseURL = strings.TrimSpace(appBaseURL)
	if appBaseURL == "" || top == nil {
		return ""
	}
	u, err := url.Parse(strings.TrimRight(appBaseURL, "/") + "/admin")
	if err != nil {
		return ""
	}
	q := u.Query()
	key := strings.TrimSpace(top.ParticipantNo)
	if key == "" {
		key = strings.TrimSpace(top.NISN)
	}
	if key == "" {
		key = strings.TrimSpace(top.Username)
	}
	if key == "" {
		return ""
	}
	q.Set("menu", "users")
	q.Set("user_q", key)
	q.Set("open_detail", "1")
	u.RawQuery = q.Encode()
	return u.String()
}
