package exam

import (
	"bytes"
	"context"
	"database/sql"
	"errors"
	"fmt"
	"os"
	"strings"
	"sync"
	"testing"
	"time"

	"cbtlms/internal/auth"
	internaldb "cbtlms/internal/db"

	"github.com/xuri/excelize/v2"
)

func TestSubmitAttemptIdempotent_DBIntegration(t *testing.T) {
	if os.Getenv("CBTLMS_INTEGRATION") != "1" {
		t.Skip("set CBTLMS_INTEGRATION=1 to run integration tests")
	}

	dsn := os.Getenv("CBTLMS_TEST_DSN")
	if strings.TrimSpace(dsn) == "" {
		dsn = "postgres://cbtlms:cbtlms_dev_password@localhost:5432/cbtlms?sslmode=disable"
	}

	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()

	dbConn, err := internaldb.OpenPostgres(ctx, dsn)
	if err != nil {
		t.Fatalf("open test db: %v", err)
	}
	defer dbConn.Close()

	svc := NewService(dbConn, 90)

	suffix := time.Now().UnixNano()
	subjectName := fmt.Sprintf("ITEST Subject %d", suffix)
	examCode := fmt.Sprintf("ITEST-EXAM-%d", suffix)
	studentUsername := fmt.Sprintf("itest_student_%d", suffix)

	tx, err := dbConn.BeginTx(ctx, nil)
	if err != nil {
		t.Fatalf("begin seed tx: %v", err)
	}
	defer func() { _ = tx.Rollback() }()

	var subjectID int64
	err = tx.QueryRowContext(ctx, `
		INSERT INTO subjects (education_level, subject_type, name, is_active)
		VALUES ('SMA', 'Wajib', $1, TRUE)
		RETURNING id
	`, subjectName).Scan(&subjectID)
	if err != nil {
		t.Fatalf("insert subject: %v", err)
	}

	var studentID int64
	err = tx.QueryRowContext(ctx, `
		INSERT INTO users (
			username, password_hash, full_name, role, is_active,
			email, email_verified_at, account_status, created_at, updated_at
		) VALUES (
			$1, 'dummy_hash', 'Integration Student', 'siswa', TRUE,
			$2, now(), 'active', now(), now()
		)
		RETURNING id
	`, studentUsername, studentUsername+"@example.test").Scan(&studentID)
	if err != nil {
		t.Fatalf("insert student: %v", err)
	}

	var examID int64
	err = tx.QueryRowContext(ctx, `
		INSERT INTO exams (
			code, title, subject_id, duration_minutes,
			randomize_questions, randomize_options, review_policy,
			is_active, created_at
		) VALUES (
			$1, 'Integration Exam', $2, 60,
			FALSE, FALSE, 'after_submit',
			TRUE, now()
		)
		RETURNING id
	`, examCode, subjectID).Scan(&examID)
	if err != nil {
		t.Fatalf("insert exam: %v", err)
	}

	var questionID int64
	err = tx.QueryRowContext(ctx, `
		INSERT INTO questions (
			subject_id, question_type, stem_html, metadata,
			is_active, version, created_at, updated_at
		) VALUES (
			$1, 'pg_tunggal', '<p>2+2=?</p>', '{}'::jsonb,
			TRUE, 1, now(), now()
		)
		RETURNING id
	`, subjectID).Scan(&questionID)
	if err != nil {
		t.Fatalf("insert question: %v", err)
	}

	_, err = tx.ExecContext(ctx, `
		INSERT INTO question_options (question_id, option_key, option_html, is_correct)
		VALUES
		($1, 'A', '<p>3</p>', FALSE),
		($1, 'B', '<p>4</p>', TRUE),
		($1, 'C', '<p>5</p>', FALSE)
	`, questionID)
	if err != nil {
		t.Fatalf("insert options: %v", err)
	}

	_, err = tx.ExecContext(ctx, `
		INSERT INTO exam_questions (exam_id, question_id, seq_no, weight)
		VALUES ($1, $2, 1, 2.0)
	`, examID, questionID)
	if err != nil {
		t.Fatalf("insert exam_question: %v", err)
	}

	var attemptID int64
	err = tx.QueryRowContext(ctx, `
		INSERT INTO attempts (
			exam_id, student_id, status, started_at, expires_at
		) VALUES (
			$1, $2, 'in_progress', now() - interval '5 minute', now() + interval '30 minute'
		)
		RETURNING id
	`, examID, studentID).Scan(&attemptID)
	if err != nil {
		t.Fatalf("insert attempt: %v", err)
	}

	_, err = tx.ExecContext(ctx, `
		INSERT INTO attempt_answers (attempt_id, question_id, answer_payload, is_doubt, is_final, updated_at)
		VALUES ($1, $2, '{"selected":["B"]}'::jsonb, FALSE, FALSE, now())
	`, attemptID, questionID)
	if err != nil {
		t.Fatalf("insert attempt_answer: %v", err)
	}

	if err := tx.Commit(); err != nil {
		t.Fatalf("commit seed: %v", err)
	}

	defer cleanupIntegrationFixture(t, dbConn, examID, questionID, subjectID, studentID)

	first, err := svc.SubmitAttempt(ctx, attemptID)
	if err != nil {
		t.Fatalf("first submit: %v", err)
	}
	second, err := svc.SubmitAttempt(ctx, attemptID)
	if err != nil {
		t.Fatalf("second submit: %v", err)
	}

	if first.Status != "submitted" || second.Status != "submitted" {
		t.Fatalf("expected submitted status, got first=%s second=%s", first.Status, second.Status)
	}
	if first.Score != second.Score {
		t.Fatalf("score changed across submits: first=%v second=%v", first.Score, second.Score)
	}
	if first.TotalCorrect != second.TotalCorrect || first.TotalWrong != second.TotalWrong || first.TotalUnanswered != second.TotalUnanswered {
		t.Fatalf("summary counts changed across submits")
	}

	if first.SubmittedAt == nil || second.SubmittedAt == nil {
		t.Fatalf("submitted_at should be set")
	}
	if !first.SubmittedAt.Equal(*second.SubmittedAt) {
		t.Fatalf("submitted_at changed across idempotent submit: first=%v second=%v", first.SubmittedAt, second.SubmittedAt)
	}

	var scoreRows int
	err = dbConn.QueryRowContext(ctx, `
		SELECT COUNT(*) FROM attempt_scores WHERE attempt_id = $1
	`, attemptID).Scan(&scoreRows)
	if err != nil {
		t.Fatalf("count attempt_scores: %v", err)
	}
	if scoreRows != 1 {
		t.Fatalf("expected exactly 1 attempt_scores row, got %d", scoreRows)
	}

	var storedStatus string
	var storedScore float64
	err = dbConn.QueryRowContext(ctx, `
		SELECT status, score FROM attempts WHERE id = $1
	`, attemptID).Scan(&storedStatus, &storedScore)
	if err != nil {
		t.Fatalf("load finalized attempt: %v", err)
	}
	if storedStatus != "submitted" {
		t.Fatalf("expected DB status submitted, got %s", storedStatus)
	}
	if storedScore != first.Score {
		t.Fatalf("expected DB score %v, got %v", first.Score, storedScore)
	}
}

func TestSubmitAttemptConcurrent_DBIntegration(t *testing.T) {
	if os.Getenv("CBTLMS_INTEGRATION") != "1" {
		t.Skip("set CBTLMS_INTEGRATION=1 to run integration tests")
	}

	dsn := os.Getenv("CBTLMS_TEST_DSN")
	if strings.TrimSpace(dsn) == "" {
		dsn = "postgres://cbtlms:cbtlms_dev_password@localhost:5432/cbtlms?sslmode=disable"
	}

	ctx, cancel := context.WithTimeout(context.Background(), 25*time.Second)
	defer cancel()

	dbConn, err := internaldb.OpenPostgres(ctx, dsn)
	if err != nil {
		t.Fatalf("open test db: %v", err)
	}
	defer dbConn.Close()

	svc := NewService(dbConn, 90)

	suffix := time.Now().UnixNano()
	subjectName := fmt.Sprintf("ITEST Concurrent Subject %d", suffix)
	examCode := fmt.Sprintf("ITEST-CONC-EXAM-%d", suffix)
	studentUsername := fmt.Sprintf("itest_conc_student_%d", suffix)

	tx, err := dbConn.BeginTx(ctx, nil)
	if err != nil {
		t.Fatalf("begin seed tx: %v", err)
	}
	defer func() { _ = tx.Rollback() }()

	var subjectID int64
	err = tx.QueryRowContext(ctx, `
		INSERT INTO subjects (education_level, subject_type, name, is_active)
		VALUES ('SMA', 'Wajib', $1, TRUE)
		RETURNING id
	`, subjectName).Scan(&subjectID)
	if err != nil {
		t.Fatalf("insert subject: %v", err)
	}

	var studentID int64
	err = tx.QueryRowContext(ctx, `
		INSERT INTO users (
			username, password_hash, full_name, role, is_active,
			email, email_verified_at, account_status, created_at, updated_at
		) VALUES (
			$1, 'dummy_hash', 'Integration Student', 'siswa', TRUE,
			$2, now(), 'active', now(), now()
		)
		RETURNING id
	`, studentUsername, studentUsername+"@example.test").Scan(&studentID)
	if err != nil {
		t.Fatalf("insert student: %v", err)
	}

	var examID int64
	err = tx.QueryRowContext(ctx, `
		INSERT INTO exams (
			code, title, subject_id, duration_minutes,
			randomize_questions, randomize_options, review_policy,
			is_active, created_at
		) VALUES (
			$1, 'Integration Exam', $2, 60,
			FALSE, FALSE, 'after_submit',
			TRUE, now()
		)
		RETURNING id
	`, examCode, subjectID).Scan(&examID)
	if err != nil {
		t.Fatalf("insert exam: %v", err)
	}

	var questionID int64
	err = tx.QueryRowContext(ctx, `
		INSERT INTO questions (
			subject_id, question_type, stem_html, metadata,
			is_active, version, created_at, updated_at
		) VALUES (
			$1, 'pg_tunggal', '<p>2+2=?</p>', '{}'::jsonb,
			TRUE, 1, now(), now()
		)
		RETURNING id
	`, subjectID).Scan(&questionID)
	if err != nil {
		t.Fatalf("insert question: %v", err)
	}

	_, err = tx.ExecContext(ctx, `
		INSERT INTO question_options (question_id, option_key, option_html, is_correct)
		VALUES
		($1, 'A', '<p>3</p>', FALSE),
		($1, 'B', '<p>4</p>', TRUE),
		($1, 'C', '<p>5</p>', FALSE)
	`, questionID)
	if err != nil {
		t.Fatalf("insert options: %v", err)
	}

	_, err = tx.ExecContext(ctx, `
		INSERT INTO exam_questions (exam_id, question_id, seq_no, weight)
		VALUES ($1, $2, 1, 2.0)
	`, examID, questionID)
	if err != nil {
		t.Fatalf("insert exam_question: %v", err)
	}

	var attemptID int64
	err = tx.QueryRowContext(ctx, `
		INSERT INTO attempts (
			exam_id, student_id, status, started_at, expires_at
		) VALUES (
			$1, $2, 'in_progress', now() - interval '5 minute', now() + interval '30 minute'
		)
		RETURNING id
	`, examID, studentID).Scan(&attemptID)
	if err != nil {
		t.Fatalf("insert attempt: %v", err)
	}

	_, err = tx.ExecContext(ctx, `
		INSERT INTO attempt_answers (attempt_id, question_id, answer_payload, is_doubt, is_final, updated_at)
		VALUES ($1, $2, '{"selected":["B"]}'::jsonb, FALSE, FALSE, now())
	`, attemptID, questionID)
	if err != nil {
		t.Fatalf("insert attempt_answer: %v", err)
	}

	if err := tx.Commit(); err != nil {
		t.Fatalf("commit seed: %v", err)
	}

	defer cleanupIntegrationFixture(t, dbConn, examID, questionID, subjectID, studentID)

	type submitRes struct {
		sum *AttemptSummary
		err error
	}
	results := make([]submitRes, 2)
	var wg sync.WaitGroup
	wg.Add(2)
	start := make(chan struct{})
	for i := 0; i < 2; i++ {
		go func(i int) {
			defer wg.Done()
			<-start
			results[i].sum, results[i].err = svc.SubmitAttempt(ctx, attemptID)
		}(i)
	}
	close(start)
	wg.Wait()

	for i := range results {
		if results[i].err != nil {
			t.Fatalf("submit call %d failed: %v", i+1, results[i].err)
		}
		if results[i].sum == nil || results[i].sum.Status != "submitted" {
			t.Fatalf("submit call %d unexpected summary: %+v", i+1, results[i].sum)
		}
	}

	if results[0].sum.Score != results[1].sum.Score {
		t.Fatalf("concurrent submit score mismatch: %v vs %v", results[0].sum.Score, results[1].sum.Score)
	}
	if results[0].sum.SubmittedAt == nil || results[1].sum.SubmittedAt == nil {
		t.Fatalf("submitted_at should be set in both responses")
	}

	var scoreRows int
	err = dbConn.QueryRowContext(ctx, `SELECT COUNT(*) FROM attempt_scores WHERE attempt_id = $1`, attemptID).Scan(&scoreRows)
	if err != nil {
		t.Fatalf("count attempt_scores: %v", err)
	}
	if scoreRows != 1 {
		t.Fatalf("expected exactly 1 attempt_scores row, got %d", scoreRows)
	}
}

func TestSubmitAttemptAfterExpiryMarkedExpired_DBIntegration(t *testing.T) {
	if os.Getenv("CBTLMS_INTEGRATION") != "1" {
		t.Skip("set CBTLMS_INTEGRATION=1 to run integration tests")
	}

	dsn := os.Getenv("CBTLMS_TEST_DSN")
	if strings.TrimSpace(dsn) == "" {
		dsn = "postgres://cbtlms:cbtlms_dev_password@localhost:5432/cbtlms?sslmode=disable"
	}

	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()

	dbConn, err := internaldb.OpenPostgres(ctx, dsn)
	if err != nil {
		t.Fatalf("open test db: %v", err)
	}
	defer dbConn.Close()

	svc := NewService(dbConn, 90)

	suffix := time.Now().UnixNano()
	subjectName := fmt.Sprintf("ITEST Expired Subject %d", suffix)
	examCode := fmt.Sprintf("ITEST-EXPIRED-EXAM-%d", suffix)
	studentUsername := fmt.Sprintf("itest_expired_student_%d", suffix)

	tx, err := dbConn.BeginTx(ctx, nil)
	if err != nil {
		t.Fatalf("begin seed tx: %v", err)
	}
	defer func() { _ = tx.Rollback() }()

	var subjectID int64
	if err := tx.QueryRowContext(ctx, `
		INSERT INTO subjects (education_level, subject_type, name, is_active)
		VALUES ('SMA', 'Wajib', $1, TRUE)
		RETURNING id
	`, subjectName).Scan(&subjectID); err != nil {
		t.Fatalf("insert subject: %v", err)
	}

	var studentID int64
	if err := tx.QueryRowContext(ctx, `
		INSERT INTO users (
			username, password_hash, full_name, role, is_active,
			email, email_verified_at, account_status, created_at, updated_at
		) VALUES (
			$1, 'dummy_hash', 'Integration Student', 'siswa', TRUE,
			$2, now(), 'active', now(), now()
		)
		RETURNING id
	`, studentUsername, studentUsername+"@example.test").Scan(&studentID); err != nil {
		t.Fatalf("insert student: %v", err)
	}

	var examID int64
	if err := tx.QueryRowContext(ctx, `
		INSERT INTO exams (
			code, title, subject_id, duration_minutes,
			randomize_questions, randomize_options, review_policy,
			is_active, created_at
		) VALUES (
			$1, 'Integration Expired Exam', $2, 30,
			FALSE, FALSE, 'after_submit',
			TRUE, now()
		)
		RETURNING id
	`, examCode, subjectID).Scan(&examID); err != nil {
		t.Fatalf("insert exam: %v", err)
	}

	var attemptID int64
	if err := tx.QueryRowContext(ctx, `
		INSERT INTO attempts (exam_id, student_id, status, started_at, expires_at)
		VALUES ($1, $2, 'in_progress', now() - interval '35 minute', now() - interval '5 minute')
		RETURNING id
	`, examID, studentID).Scan(&attemptID); err != nil {
		t.Fatalf("insert attempt: %v", err)
	}

	if err := tx.Commit(); err != nil {
		t.Fatalf("commit seed: %v", err)
	}

	defer cleanupIntegrationFixture(t, dbConn, examID, 0, subjectID, studentID)

	summary, err := svc.SubmitAttempt(ctx, attemptID)
	if err != nil {
		t.Fatalf("submit expired attempt: %v", err)
	}
	if summary.Status != "expired" {
		t.Fatalf("expected expired status, got %s", summary.Status)
	}

	var storedStatus string
	if err := dbConn.QueryRowContext(ctx, `
		SELECT status FROM attempts WHERE id = $1
	`, attemptID).Scan(&storedStatus); err != nil {
		t.Fatalf("load finalized attempt: %v", err)
	}
	if storedStatus != "expired" {
		t.Fatalf("expected DB status expired, got %s", storedStatus)
	}
}

func TestListExamParticipantResultsAutoFinalizesExpiredAttempt_DBIntegration(t *testing.T) {
	if os.Getenv("CBTLMS_INTEGRATION") != "1" {
		t.Skip("set CBTLMS_INTEGRATION=1 to run integration tests")
	}

	dsn := os.Getenv("CBTLMS_TEST_DSN")
	if strings.TrimSpace(dsn) == "" {
		dsn = "postgres://cbtlms:cbtlms_dev_password@localhost:5432/cbtlms?sslmode=disable"
	}

	ctx, cancel := context.WithTimeout(context.Background(), 25*time.Second)
	defer cancel()

	dbConn, err := internaldb.OpenPostgres(ctx, dsn)
	if err != nil {
		t.Fatalf("open test db: %v", err)
	}
	defer dbConn.Close()

	svc := NewService(dbConn, 90)

	suffix := time.Now().UnixNano()
	subjectName := fmt.Sprintf("ITEST Results Subject %d", suffix)
	examCode := fmt.Sprintf("ITEST-RESULTS-EXAM-%d", suffix)
	studentUsername := fmt.Sprintf("itest_results_student_%d", suffix)

	tx, err := dbConn.BeginTx(ctx, nil)
	if err != nil {
		t.Fatalf("begin seed tx: %v", err)
	}
	defer func() { _ = tx.Rollback() }()

	var subjectID int64
	if err := tx.QueryRowContext(ctx, `
		INSERT INTO subjects (education_level, subject_type, name, is_active)
		VALUES ('SMA', 'Wajib', $1, TRUE)
		RETURNING id
	`, subjectName).Scan(&subjectID); err != nil {
		t.Fatalf("insert subject: %v", err)
	}

	var studentID int64
	if err := tx.QueryRowContext(ctx, `
		INSERT INTO users (
			username, password_hash, full_name, role, is_active,
			email, email_verified_at, account_status, created_at, updated_at
		) VALUES (
			$1, 'dummy_hash', 'Integration Student', 'siswa', TRUE,
			$2, now(), 'active', now(), now()
		)
		RETURNING id
	`, studentUsername, studentUsername+"@example.test").Scan(&studentID); err != nil {
		t.Fatalf("insert student: %v", err)
	}

	var examID int64
	if err := tx.QueryRowContext(ctx, `
		INSERT INTO exams (
			code, title, subject_id, duration_minutes,
			randomize_questions, randomize_options, review_policy,
			is_active, created_at
		) VALUES (
			$1, 'Integration Results Exam', $2, 30,
			FALSE, FALSE, 'after_submit',
			TRUE, now()
		)
		RETURNING id
	`, examCode, subjectID).Scan(&examID); err != nil {
		t.Fatalf("insert exam: %v", err)
	}

	var q1, q2 int64
	if err := tx.QueryRowContext(ctx, `
		INSERT INTO questions (subject_id, question_type, stem_html, metadata, is_active, version, created_at, updated_at)
		VALUES ($1, 'pg_tunggal', '<p>Q1</p>', '{}'::jsonb, TRUE, 1, now(), now())
		RETURNING id
	`, subjectID).Scan(&q1); err != nil {
		t.Fatalf("insert q1: %v", err)
	}
	if err := tx.QueryRowContext(ctx, `
		INSERT INTO questions (subject_id, question_type, stem_html, metadata, is_active, version, created_at, updated_at)
		VALUES ($1, 'pg_tunggal', '<p>Q2</p>', '{}'::jsonb, TRUE, 1, now(), now())
		RETURNING id
	`, subjectID).Scan(&q2); err != nil {
		t.Fatalf("insert q2: %v", err)
	}

	if _, err := tx.ExecContext(ctx, `
		INSERT INTO question_options (question_id, option_key, option_html, is_correct)
		VALUES
		($1, 'A', '<p>3</p>', FALSE),
		($1, 'B', '<p>4</p>', TRUE),
		($2, 'A', '<p>5</p>', TRUE),
		($2, 'B', '<p>6</p>', FALSE)
	`, q1, q2); err != nil {
		t.Fatalf("insert options: %v", err)
	}

	if _, err := tx.ExecContext(ctx, `
		INSERT INTO question_versions (question_id, version_no, stem_html, answer_key, status, is_public, is_active, weight, created_at)
		VALUES
		($1, 1, '<p>Q1</p>', '{"correct":"B"}'::jsonb, 'final', TRUE, TRUE, 2.0, now()),
		($2, 1, '<p>Q2</p>', '{"correct":"A"}'::jsonb, 'final', TRUE, TRUE, 3.0, now())
	`, q1, q2); err != nil {
		t.Fatalf("insert versions: %v", err)
	}

	if _, err := tx.ExecContext(ctx, `
		INSERT INTO exam_questions (exam_id, question_id, seq_no, weight)
		VALUES
		($1, $2, 1, 2.0),
		($1, $3, 2, 3.0)
	`, examID, q1, q2); err != nil {
		t.Fatalf("insert exam questions: %v", err)
	}

	var attemptID int64
	if err := tx.QueryRowContext(ctx, `
		INSERT INTO attempts (exam_id, student_id, status, started_at, expires_at)
		VALUES ($1, $2, 'in_progress', now() - interval '40 minute', now() - interval '10 minute')
		RETURNING id
	`, examID, studentID).Scan(&attemptID); err != nil {
		t.Fatalf("insert attempt: %v", err)
	}

	if _, err := tx.ExecContext(ctx, `
		INSERT INTO attempt_answers (attempt_id, question_id, answer_payload, is_doubt, is_final, updated_at)
		VALUES ($1, $2, '{"selected":"B"}'::jsonb, FALSE, FALSE, now())
	`, attemptID, q1); err != nil {
		t.Fatalf("insert attempt answer: %v", err)
	}

	if err := tx.Commit(); err != nil {
		t.Fatalf("commit seed: %v", err)
	}

	defer cleanupIntegrationFixture(t, dbConn, examID, q1, subjectID, studentID)
	defer cleanupIntegrationFixtureExtraQuestions(t, dbConn, q2)

	matrix, err := svc.ListExamParticipantResults(ctx, examID, 0, 0, nil, nil, nil)
	if err != nil {
		t.Fatalf("list participant results: %v", err)
	}
	if len(matrix.Rows) != 1 {
		t.Fatalf("expected 1 result row, got %d", len(matrix.Rows))
	}

	row := matrix.Rows[0]
	if row.SkorTotal != 2 {
		t.Fatalf("expected score 2, got %v", row.SkorTotal)
	}
	if len(row.AnswerStates) != 2 {
		t.Fatalf("expected 2 answer states, got %d", len(row.AnswerStates))
	}
	if row.AnswerStates[0] != "correct" {
		t.Fatalf("expected first answer state correct, got %q", row.AnswerStates[0])
	}
	if row.AnswerStates[1] != "wrong" {
		t.Fatalf("expected unanswered cell marked wrong, got %q", row.AnswerStates[1])
	}

	var storedStatus string
	var storedScore float64
	var totalWrong int
	var totalUnanswered int
	if err := dbConn.QueryRowContext(ctx, `
		SELECT status, score, total_wrong, total_unanswered
		FROM attempts
		WHERE id = $1
	`, attemptID).Scan(&storedStatus, &storedScore, &totalWrong, &totalUnanswered); err != nil {
		t.Fatalf("load finalized attempt: %v", err)
	}
	if storedStatus != "expired" {
		t.Fatalf("expected DB status expired, got %s", storedStatus)
	}
	if storedScore != 2 {
		t.Fatalf("expected DB score 2, got %v", storedScore)
	}
	if totalWrong != 0 || totalUnanswered != 1 {
		t.Fatalf("unexpected counters wrong=%d unanswered=%d", totalWrong, totalUnanswered)
	}
}

func TestScopedProktorResultsAndRecapCrossSchoolExam_DBIntegration(t *testing.T) {
	if os.Getenv("CBTLMS_INTEGRATION") != "1" {
		t.Skip("set CBTLMS_INTEGRATION=1 to run integration tests")
	}

	dsn := os.Getenv("CBTLMS_TEST_DSN")
	if strings.TrimSpace(dsn) == "" {
		dsn = "postgres://cbtlms:cbtlms_dev_password@localhost:5432/cbtlms?sslmode=disable"
	}

	ctx, cancel := context.WithTimeout(context.Background(), 25*time.Second)
	defer cancel()

	dbConn, err := internaldb.OpenPostgres(ctx, dsn)
	if err != nil {
		t.Fatalf("open test db: %v", err)
	}
	defer dbConn.Close()

	svc := NewService(dbConn, 90)

	suffix := time.Now().UnixNano()
	subjectName := fmt.Sprintf("ITEST Scoped Result Subject %d", suffix)
	examCode := fmt.Sprintf("ITEST-SCOPED-RESULT-%d", suffix)
	schoolAName := fmt.Sprintf("ITEST Scoped School A %d", suffix)
	schoolBName := fmt.Sprintf("ITEST Scoped School B %d", suffix)
	classAName := fmt.Sprintf("X-A-%d", suffix)
	classBName := fmt.Sprintf("X-B-%d", suffix)
	proktorUsername := fmt.Sprintf("itest_proktor_%d", suffix)
	studentAUsername := fmt.Sprintf("itest_scoped_student_a_%d", suffix)
	studentBUsername := fmt.Sprintf("itest_scoped_student_b_%d", suffix)

	var (
		subjectID   int64
		questionID  int64
		examID      int64
		schoolAID   int64
		schoolBID   int64
		classAID    int64
		classBID    int64
		proktorID   int64
		studentAID  int64
		studentBID  int64
		attemptAID  int64
		attemptBID  int64
	)

	tx, err := dbConn.BeginTx(ctx, nil)
	if err != nil {
		t.Fatalf("begin seed tx: %v", err)
	}
	defer func() { _ = tx.Rollback() }()

	if err := tx.QueryRowContext(ctx, `
		INSERT INTO subjects (education_level, subject_type, name, is_active)
		VALUES ('SMA', 'Wajib', $1, TRUE)
		RETURNING id
	`, subjectName).Scan(&subjectID); err != nil {
		t.Fatalf("insert subject: %v", err)
	}

	if err := tx.QueryRowContext(ctx, `
		INSERT INTO schools (name, code, address, is_active, created_at, updated_at)
		VALUES ($1, $2, 'Jl. Scoped A', TRUE, now(), now())
		RETURNING id
	`, schoolAName, fmt.Sprintf("ITEST-SA-%d", suffix)).Scan(&schoolAID); err != nil {
		t.Fatalf("insert school A: %v", err)
	}
	if err := tx.QueryRowContext(ctx, `
		INSERT INTO schools (name, code, address, is_active, created_at, updated_at)
		VALUES ($1, $2, 'Jl. Scoped B', TRUE, now(), now())
		RETURNING id
	`, schoolBName, fmt.Sprintf("ITEST-SB-%d", suffix)).Scan(&schoolBID); err != nil {
		t.Fatalf("insert school B: %v", err)
	}

	if err := tx.QueryRowContext(ctx, `
		INSERT INTO classes (school_id, name, grade_level, is_active, created_at, updated_at)
		VALUES ($1, $2, '10', TRUE, now(), now())
		RETURNING id
	`, schoolAID, classAName).Scan(&classAID); err != nil {
		t.Fatalf("insert class A: %v", err)
	}
	if err := tx.QueryRowContext(ctx, `
		INSERT INTO classes (school_id, name, grade_level, is_active, created_at, updated_at)
		VALUES ($1, $2, '10', TRUE, now(), now())
		RETURNING id
	`, schoolBID, classBName).Scan(&classBID); err != nil {
		t.Fatalf("insert class B: %v", err)
	}

	if err := tx.QueryRowContext(ctx, `
		INSERT INTO users (
			username, password_hash, full_name, role, is_active,
			email, email_verified_at, account_status, created_at, updated_at
		) VALUES (
			$1, 'dummy_hash', 'Integration Proktor', 'proktor', TRUE,
			$2, now(), 'active', now(), now()
		)
		RETURNING id
	`, proktorUsername, proktorUsername+"@example.test").Scan(&proktorID); err != nil {
		t.Fatalf("insert proktor: %v", err)
	}
	if err := tx.QueryRowContext(ctx, `
		INSERT INTO users (
			username, password_hash, full_name, role, is_active,
			email, email_verified_at, account_status, created_at, updated_at
		) VALUES (
			$1, 'dummy_hash', 'Scoped Student A', 'siswa', TRUE,
			$2, now(), 'active', now(), now()
		)
		RETURNING id
	`, studentAUsername, studentAUsername+"@example.test").Scan(&studentAID); err != nil {
		t.Fatalf("insert student A: %v", err)
	}
	if err := tx.QueryRowContext(ctx, `
		INSERT INTO users (
			username, password_hash, full_name, role, is_active,
			email, email_verified_at, account_status, created_at, updated_at
		) VALUES (
			$1, 'dummy_hash', 'Scoped Student B', 'siswa', TRUE,
			$2, now(), 'active', now(), now()
		)
		RETURNING id
	`, studentBUsername, studentBUsername+"@example.test").Scan(&studentBID); err != nil {
		t.Fatalf("insert student B: %v", err)
	}

	if _, err := tx.ExecContext(ctx, `
		INSERT INTO enrollments (user_id, school_id, class_id, status, enrolled_at, created_at)
		VALUES
		($1, $2, $3, 'active', now(), now()),
		($4, $5, $6, 'active', now(), now())
	`, studentAID, schoolAID, classAID, studentBID, schoolBID, classBID); err != nil {
		t.Fatalf("insert enrollments: %v", err)
	}
	if _, err := tx.ExecContext(ctx, `
		INSERT INTO user_school_scopes (user_id, school_id, created_at)
		VALUES ($1, $2, now())
	`, proktorID, schoolAID); err != nil {
		t.Fatalf("insert proktor school scope: %v", err)
	}

	if err := tx.QueryRowContext(ctx, `
		INSERT INTO exams (
			code, title, subject_id, duration_minutes,
			randomize_questions, randomize_options, review_policy,
			management_scope, owner_school_id,
			is_active, created_at
		) VALUES (
			$1, 'Integration Scoped Cross School Exam', $2, 30,
			FALSE, FALSE, 'after_submit',
			'cross_school', $3,
			TRUE, now()
		)
		RETURNING id
	`, examCode, subjectID, schoolAID).Scan(&examID); err != nil {
		t.Fatalf("insert exam: %v", err)
	}

	if err := tx.QueryRowContext(ctx, `
		INSERT INTO questions (subject_id, question_type, stem_html, metadata, is_active, version, created_at, updated_at)
		VALUES ($1, 'pg_tunggal', '<p>Scoped Q1</p>', '{}'::jsonb, TRUE, 1, now(), now())
		RETURNING id
	`, subjectID).Scan(&questionID); err != nil {
		t.Fatalf("insert question: %v", err)
	}
	if _, err := tx.ExecContext(ctx, `
		INSERT INTO exam_questions (exam_id, question_id, seq_no, weight)
		VALUES ($1, $2, 1, 1.0)
	`, examID, questionID); err != nil {
		t.Fatalf("insert exam question: %v", err)
	}

	if _, err := tx.ExecContext(ctx, `
		INSERT INTO exam_assignments (exam_id, user_id, status, assigned_by, assigned_at, created_at, updated_at)
		VALUES
		($1, $2, 'active', $4, now(), now(), now()),
		($1, $3, 'active', $4, now(), now(), now())
	`, examID, studentAID, studentBID, proktorID); err != nil {
		t.Fatalf("insert exam assignments: %v", err)
	}

	if err := tx.QueryRowContext(ctx, `
		INSERT INTO attempts (exam_id, student_id, status, started_at, submitted_at, expires_at, score)
		VALUES ($1, $2, 'submitted', now() - interval '20 minute', now() - interval '10 minute', now() + interval '10 minute', 1)
		RETURNING id
	`, examID, studentAID).Scan(&attemptAID); err != nil {
		t.Fatalf("insert attempt A: %v", err)
	}
	if err := tx.QueryRowContext(ctx, `
		INSERT INTO attempts (exam_id, student_id, status, started_at, submitted_at, expires_at, score)
		VALUES ($1, $2, 'submitted', now() - interval '18 minute', now() - interval '8 minute', now() + interval '12 minute', 1)
		RETURNING id
	`, examID, studentBID).Scan(&attemptBID); err != nil {
		t.Fatalf("insert attempt B: %v", err)
	}

	if err := tx.Commit(); err != nil {
		t.Fatalf("commit seed: %v", err)
	}

	defer func() {
		cleanupCtx, cleanupCancel := context.WithTimeout(context.Background(), 15*time.Second)
		defer cleanupCancel()

		cleanupTx, cleanupErr := dbConn.BeginTx(cleanupCtx, nil)
		if cleanupErr != nil {
			t.Logf("cleanup begin tx failed: %v", cleanupErr)
			return
		}
		defer func() { _ = cleanupTx.Rollback() }()

		_, _ = cleanupTx.ExecContext(cleanupCtx, `DELETE FROM attempt_scores WHERE attempt_id IN ($1, $2)`, attemptAID, attemptBID)
		_, _ = cleanupTx.ExecContext(cleanupCtx, `DELETE FROM attempt_answers WHERE attempt_id IN ($1, $2)`, attemptAID, attemptBID)
		_, _ = cleanupTx.ExecContext(cleanupCtx, `DELETE FROM attempts WHERE id IN ($1, $2)`, attemptAID, attemptBID)
		_, _ = cleanupTx.ExecContext(cleanupCtx, `DELETE FROM exam_assignments WHERE exam_id = $1`, examID)
		_, _ = cleanupTx.ExecContext(cleanupCtx, `DELETE FROM exam_questions WHERE exam_id = $1`, examID)
		_, _ = cleanupTx.ExecContext(cleanupCtx, `DELETE FROM exams WHERE id = $1`, examID)
		_, _ = cleanupTx.ExecContext(cleanupCtx, `DELETE FROM question_options WHERE question_id = $1`, questionID)
		_, _ = cleanupTx.ExecContext(cleanupCtx, `DELETE FROM question_versions WHERE question_id = $1`, questionID)
		_, _ = cleanupTx.ExecContext(cleanupCtx, `DELETE FROM questions WHERE id = $1`, questionID)
		_, _ = cleanupTx.ExecContext(cleanupCtx, `DELETE FROM user_school_scopes WHERE user_id = $1`, proktorID)
		_, _ = cleanupTx.ExecContext(cleanupCtx, `DELETE FROM enrollments WHERE user_id IN ($1, $2)`, studentAID, studentBID)
		_, _ = cleanupTx.ExecContext(cleanupCtx, `DELETE FROM classes WHERE id IN ($1, $2)`, classAID, classBID)
		_, _ = cleanupTx.ExecContext(cleanupCtx, `DELETE FROM schools WHERE id IN ($1, $2)`, schoolAID, schoolBID)
		_, _ = cleanupTx.ExecContext(cleanupCtx, `DELETE FROM stimuli WHERE subject_id = $1`, subjectID)
		_, _ = cleanupTx.ExecContext(cleanupCtx, `DELETE FROM subjects WHERE id = $1`, subjectID)
		_, _ = cleanupTx.ExecContext(cleanupCtx, `DELETE FROM auth_identities WHERE user_id IN ($1, $2, $3)`, proktorID, studentAID, studentBID)
		_, _ = cleanupTx.ExecContext(cleanupCtx, `DELETE FROM auth_sessions WHERE user_id IN ($1, $2, $3)`, proktorID, studentAID, studentBID)
		_, _ = cleanupTx.ExecContext(cleanupCtx, `DELETE FROM student_profiles WHERE user_id IN ($1, $2)`, studentAID, studentBID)
		_, _ = cleanupTx.ExecContext(cleanupCtx, `DELETE FROM users WHERE id IN ($1, $2, $3)`, proktorID, studentAID, studentBID)

		if err := cleanupTx.Commit(); err != nil {
			t.Logf("cleanup commit failed: %v", err)
		}
	}()

	scopedCtx := auth.ContextWithUser(ctx, &auth.User{ID: proktorID, Role: "proktor"})

	matrix, err := svc.ListExamParticipantResults(scopedCtx, examID, 0, 0, nil, nil, nil)
	if err != nil {
		t.Fatalf("list participant results: %v", err)
	}
	if matrix.TotalRows != 1 || len(matrix.Rows) != 1 {
		t.Fatalf("expected exactly 1 scoped result row, total=%d rows=%d", matrix.TotalRows, len(matrix.Rows))
	}
	if matrix.Rows[0].UserID != studentAID {
		t.Fatalf("expected scoped student A only, got user_id=%d", matrix.Rows[0].UserID)
	}
	if matrix.Filters == nil {
		t.Fatal("expected result filters")
	}
	if len(matrix.Filters.Classes) != 1 || matrix.Filters.Classes[0] != classAName {
		t.Fatalf("expected only scoped class filter, got %+v", matrix.Filters.Classes)
	}
	if len(matrix.Filters.Schools) != 1 || matrix.Filters.Schools[0] != schoolAName {
		t.Fatalf("expected only scoped school filter, got %+v", matrix.Filters.Schools)
	}

	recap, err := svc.GetExamScoreRecap(scopedCtx, examID, "highest", nil, nil)
	if err != nil {
		t.Fatalf("get exam score recap: %v", err)
	}
	if recap.Summary.ParticipantCount != 1 || len(recap.Rows) != 1 {
		t.Fatalf("expected exactly 1 scoped recap row, summary=%d rows=%d", recap.Summary.ParticipantCount, len(recap.Rows))
	}
	if recap.Rows[0].UserID != studentAID {
		t.Fatalf("expected recap to include student A only, got user_id=%d", recap.Rows[0].UserID)
	}
}

func TestStartAttemptRequiresNewTokenAfterSubmit_DBIntegration(t *testing.T) {
	if os.Getenv("CBTLMS_INTEGRATION") != "1" {
		t.Skip("set CBTLMS_INTEGRATION=1 to run integration tests")
	}

	dsn := os.Getenv("CBTLMS_TEST_DSN")
	if strings.TrimSpace(dsn) == "" {
		dsn = "postgres://cbtlms:cbtlms_dev_password@localhost:5432/cbtlms?sslmode=disable"
	}

	ctx, cancel := context.WithTimeout(context.Background(), 25*time.Second)
	defer cancel()

	dbConn, err := internaldb.OpenPostgres(ctx, dsn)
	if err != nil {
		t.Fatalf("open test db: %v", err)
	}
	defer dbConn.Close()

	svc := NewService(dbConn, 90)

	suffix := time.Now().UnixNano()
	subjectName := fmt.Sprintf("ITEST Token Subject %d", suffix)
	examCode := fmt.Sprintf("ITEST-TOKEN-EXAM-%d", suffix)
	studentUsername := fmt.Sprintf("itest_token_student_%d", suffix)
	tokenV1 := "ABC123"
	tokenV2 := "XYZ789"

	tx, err := dbConn.BeginTx(ctx, nil)
	if err != nil {
		t.Fatalf("begin seed tx: %v", err)
	}
	defer func() { _ = tx.Rollback() }()

	var subjectID int64
	if err := tx.QueryRowContext(ctx, `
		INSERT INTO subjects (education_level, subject_type, name, is_active)
		VALUES ('SMA', 'Wajib', $1, TRUE)
		RETURNING id
	`, subjectName).Scan(&subjectID); err != nil {
		t.Fatalf("insert subject: %v", err)
	}

	var studentID int64
	if err := tx.QueryRowContext(ctx, `
		INSERT INTO users (
			username, password_hash, full_name, role, is_active,
			email, email_verified_at, account_status, created_at, updated_at
		) VALUES (
			$1, 'dummy_hash', 'Integration Student', 'siswa', TRUE,
			$2, now(), 'active', now(), now()
		)
		RETURNING id
	`, studentUsername, studentUsername+"@example.test").Scan(&studentID); err != nil {
		t.Fatalf("insert student: %v", err)
	}

	var examID int64
	if err := tx.QueryRowContext(ctx, `
		INSERT INTO exams (
			code, title, subject_id, duration_minutes,
			max_attempts, randomize_questions, randomize_options, review_policy,
			exam_token_hash, exam_token_generated_at, exam_token_expires_at,
			is_active, created_at
		) VALUES (
			$1, 'Integration Token Exam', $2, 30,
			2, FALSE, FALSE, 'after_submit',
			$3, now(), now() + interval '30 minute',
			TRUE, now()
		)
		RETURNING id
	`, examCode, subjectID, hashExamToken(tokenV1)).Scan(&examID); err != nil {
		t.Fatalf("insert exam: %v", err)
	}

	if err := tx.Commit(); err != nil {
		t.Fatalf("commit seed: %v", err)
	}

	defer cleanupIntegrationFixture(t, dbConn, examID, 0, subjectID, studentID)

	firstAttempt, err := svc.StartAttempt(ctx, examID, studentID, tokenV1)
	if err != nil {
		t.Fatalf("start first attempt: %v", err)
	}
	if firstAttempt.Status != "in_progress" {
		t.Fatalf("expected in_progress, got %s", firstAttempt.Status)
	}

	firstSummary, err := svc.SubmitAttempt(ctx, firstAttempt.ID)
	if err != nil {
		t.Fatalf("submit first attempt: %v", err)
	}
	if firstSummary.Status != "submitted" {
		t.Fatalf("expected submitted, got %s", firstSummary.Status)
	}

	_, err = svc.StartAttempt(ctx, examID, studentID, tokenV1)
	if !errors.Is(err, ErrExamTokenAlreadyUsed) {
		t.Fatalf("expected ErrExamTokenAlreadyUsed, got %v", err)
	}

	if _, err := dbConn.ExecContext(ctx, `
		UPDATE exams
		SET exam_token_hash = $2,
			exam_token_generated_at = now(),
			exam_token_expires_at = now() + interval '30 minute'
		WHERE id = $1
	`, examID, hashExamToken(tokenV2)); err != nil {
		t.Fatalf("rotate token: %v", err)
	}

	secondAttempt, err := svc.StartAttempt(ctx, examID, studentID, tokenV2)
	if err != nil {
		t.Fatalf("start second attempt with fresh token: %v", err)
	}
	if secondAttempt.Status != "in_progress" {
		t.Fatalf("expected in_progress for second attempt, got %s", secondAttempt.Status)
	}
}

func TestAdminToGuruTeacherAccessProfileFlow_DBIntegration(t *testing.T) {
	if os.Getenv("CBTLMS_INTEGRATION") != "1" {
		t.Skip("set CBTLMS_INTEGRATION=1 to run integration tests")
	}

	dsn := os.Getenv("CBTLMS_TEST_DSN")
	if strings.TrimSpace(dsn) == "" {
		dsn = "postgres://cbtlms:cbtlms_dev_password@localhost:5432/cbtlms?sslmode=disable"
	}

	ctx, cancel := context.WithTimeout(context.Background(), 25*time.Second)
	defer cancel()

	dbConn, err := internaldb.OpenPostgres(ctx, dsn)
	if err != nil {
		t.Fatalf("open test db: %v", err)
	}
	defer dbConn.Close()

	authSvc := auth.NewService(dbConn, auth.ServiceConfig{BcryptCost: 4})
	examSvc := NewService(dbConn, 90)

	suffix := time.Now().UnixNano()
	subjectName := fmt.Sprintf("ITEST Admin-Guru Subject %d", suffix)
	schoolAName := fmt.Sprintf("ITEST Admin-Guru School A %d", suffix)
	schoolBName := fmt.Sprintf("ITEST Admin-Guru School B %d", suffix)
	classAName := fmt.Sprintf("X-A-AG-%d", suffix)
	classBName := fmt.Sprintf("X-B-AG-%d", suffix)
	adminUsername := fmt.Sprintf("itest_admin_%d", suffix)
	guruUsername := fmt.Sprintf("itest_guru_%d", suffix)
	studentAUsername := fmt.Sprintf("itest_ag_student_a_%d", suffix)
	studentBUsername := fmt.Sprintf("itest_ag_student_b_%d", suffix)

	var (
		subjectID  int64
		schoolAID  int64
		schoolBID  int64
		classAID   int64
		classBID   int64
		adminID    int64
		guruID     int64
		studentAID int64
		studentBID int64
		examID     int64
	)

	tx, err := dbConn.BeginTx(ctx, nil)
	if err != nil {
		t.Fatalf("begin seed tx: %v", err)
	}
	defer func() { _ = tx.Rollback() }()

	if err := tx.QueryRowContext(ctx, `
		INSERT INTO subjects (education_level, subject_type, name, is_active)
		VALUES ('SMA', 'Wajib', $1, TRUE)
		RETURNING id
	`, subjectName).Scan(&subjectID); err != nil {
		t.Fatalf("insert subject: %v", err)
	}

	if err := tx.QueryRowContext(ctx, `
		INSERT INTO schools (name, code, address, is_active, created_at, updated_at)
		VALUES ($1, $2, 'Jl. Admin Guru A', TRUE, now(), now())
		RETURNING id
	`, schoolAName, fmt.Sprintf("ITEST-AGA-%d", suffix)).Scan(&schoolAID); err != nil {
		t.Fatalf("insert school A: %v", err)
	}
	if err := tx.QueryRowContext(ctx, `
		INSERT INTO schools (name, code, address, is_active, created_at, updated_at)
		VALUES ($1, $2, 'Jl. Admin Guru B', TRUE, now(), now())
		RETURNING id
	`, schoolBName, fmt.Sprintf("ITEST-AGB-%d", suffix)).Scan(&schoolBID); err != nil {
		t.Fatalf("insert school B: %v", err)
	}

	if err := tx.QueryRowContext(ctx, `
		INSERT INTO classes (school_id, name, grade_level, is_active, created_at, updated_at)
		VALUES ($1, $2, '10', TRUE, now(), now())
		RETURNING id
	`, schoolAID, classAName).Scan(&classAID); err != nil {
		t.Fatalf("insert class A: %v", err)
	}
	if err := tx.QueryRowContext(ctx, `
		INSERT INTO classes (school_id, name, grade_level, is_active, created_at, updated_at)
		VALUES ($1, $2, '10', TRUE, now(), now())
		RETURNING id
	`, schoolBID, classBName).Scan(&classBID); err != nil {
		t.Fatalf("insert class B: %v", err)
	}

	if err := tx.QueryRowContext(ctx, `
		INSERT INTO users (
			username, password_hash, full_name, role, is_active,
			email, email_verified_at, account_status, created_at, updated_at
		) VALUES (
			$1, 'dummy_hash', 'Integration Admin', 'admin', TRUE,
			$2, now(), 'active', now(), now()
		)
		RETURNING id
	`, adminUsername, adminUsername+"@example.test").Scan(&adminID); err != nil {
		t.Fatalf("insert admin: %v", err)
	}

	if err := tx.QueryRowContext(ctx, `
		INSERT INTO users (
			username, password_hash, full_name, role, is_active,
			email, email_verified_at, account_status, created_at, updated_at
		) VALUES (
			$1, 'dummy_hash', 'Integration Student A', 'siswa', TRUE,
			$2, now(), 'active', now(), now()
		)
		RETURNING id
	`, studentAUsername, studentAUsername+"@example.test").Scan(&studentAID); err != nil {
		t.Fatalf("insert student A: %v", err)
	}
	if err := tx.QueryRowContext(ctx, `
		INSERT INTO users (
			username, password_hash, full_name, role, is_active,
			email, email_verified_at, account_status, created_at, updated_at
		) VALUES (
			$1, 'dummy_hash', 'Integration Student B', 'siswa', TRUE,
			$2, now(), 'active', now(), now()
		)
		RETURNING id
	`, studentBUsername, studentBUsername+"@example.test").Scan(&studentBID); err != nil {
		t.Fatalf("insert student B: %v", err)
	}

	if _, err := tx.ExecContext(ctx, `
		INSERT INTO enrollments (user_id, school_id, class_id, status, enrolled_at, created_at)
		VALUES
		($1, $2, $3, 'active', now(), now()),
		($4, $5, $6, 'active', now(), now())
	`, studentAID, schoolAID, classAID, studentBID, schoolBID, classBID); err != nil {
		t.Fatalf("insert student enrollments: %v", err)
	}

	if err := tx.Commit(); err != nil {
		t.Fatalf("commit seed: %v", err)
	}

	defer func() {
		cleanupCtx, cleanupCancel := context.WithTimeout(context.Background(), 15*time.Second)
		defer cleanupCancel()

		cleanupTx, cleanupErr := dbConn.BeginTx(cleanupCtx, nil)
		if cleanupErr != nil {
			t.Logf("cleanup begin tx failed: %v", cleanupErr)
			return
		}
		defer func() { _ = cleanupTx.Rollback() }()

		if examID > 0 {
			_, _ = cleanupTx.ExecContext(cleanupCtx, `DELETE FROM attempt_scores WHERE attempt_id IN (SELECT id FROM attempts WHERE exam_id = $1)`, examID)
			_, _ = cleanupTx.ExecContext(cleanupCtx, `DELETE FROM attempt_answers WHERE attempt_id IN (SELECT id FROM attempts WHERE exam_id = $1)`, examID)
			_, _ = cleanupTx.ExecContext(cleanupCtx, `DELETE FROM attempts WHERE exam_id = $1`, examID)
			_, _ = cleanupTx.ExecContext(cleanupCtx, `DELETE FROM exam_assignments WHERE exam_id = $1`, examID)
			_, _ = cleanupTx.ExecContext(cleanupCtx, `DELETE FROM exam_questions WHERE exam_id = $1`, examID)
			_, _ = cleanupTx.ExecContext(cleanupCtx, `DELETE FROM exams WHERE id = $1`, examID)
		}

		if guruID > 0 {
			_, _ = cleanupTx.ExecContext(cleanupCtx, `DELETE FROM enrollments WHERE user_id = $1`, guruID)
		}

		_, _ = cleanupTx.ExecContext(cleanupCtx, `DELETE FROM enrollments WHERE user_id IN ($1, $2)`, studentAID, studentBID)
		_, _ = cleanupTx.ExecContext(cleanupCtx, `DELETE FROM classes WHERE id IN ($1, $2)`, classAID, classBID)
		_, _ = cleanupTx.ExecContext(cleanupCtx, `DELETE FROM schools WHERE id IN ($1, $2)`, schoolAID, schoolBID)
		_, _ = cleanupTx.ExecContext(cleanupCtx, `DELETE FROM stimuli WHERE subject_id = $1`, subjectID)
		_, _ = cleanupTx.ExecContext(cleanupCtx, `DELETE FROM subjects WHERE id = $1`, subjectID)

		if guruID > 0 {
			_, _ = cleanupTx.ExecContext(cleanupCtx, `DELETE FROM auth_identities WHERE user_id = $1`, guruID)
			_, _ = cleanupTx.ExecContext(cleanupCtx, `DELETE FROM auth_sessions WHERE user_id = $1`, guruID)
			_, _ = cleanupTx.ExecContext(cleanupCtx, `DELETE FROM users WHERE id = $1`, guruID)
		}

		_, _ = cleanupTx.ExecContext(cleanupCtx, `DELETE FROM auth_identities WHERE user_id IN ($1, $2, $3)`, adminID, studentAID, studentBID)
		_, _ = cleanupTx.ExecContext(cleanupCtx, `DELETE FROM auth_sessions WHERE user_id IN ($1, $2, $3)`, adminID, studentAID, studentBID)
		_, _ = cleanupTx.ExecContext(cleanupCtx, `DELETE FROM student_profiles WHERE user_id IN ($1, $2)`, studentAID, studentBID)
		_, _ = cleanupTx.ExecContext(cleanupCtx, `DELETE FROM users WHERE id IN ($1, $2, $3)`, adminID, studentAID, studentBID)

		if err := cleanupTx.Commit(); err != nil {
			t.Logf("cleanup commit failed: %v", err)
		}
	}()

	createdGuru, err := authSvc.CreateUserByAdmin(ctx, adminID, auth.AdminCreateUserInput{
		Username:             guruUsername,
		Email:                guruUsername + "@example.test",
		Password:             "AdminGuru123!",
		FullName:             "Integration Guru",
		Role:                 "guru",
		TeacherAccessProfile: "school",
	})
	if err != nil {
		t.Fatalf("create guru by admin: %v", err)
	}
	guruID = createdGuru.ID
	if createdGuru.TeacherAccessProfile != "school" {
		t.Fatalf("expected initial guru profile school, got %q", createdGuru.TeacherAccessProfile)
	}

	if _, err := dbConn.ExecContext(ctx, `
		INSERT INTO enrollments (user_id, school_id, class_id, status, enrolled_at, created_at)
		VALUES ($1, $2, $3, 'active', now(), now())
	`, guruID, schoolAID, classAID); err != nil {
		t.Fatalf("insert guru enrollment: %v", err)
	}

	guruCtx := auth.ContextWithUser(ctx, &auth.User{ID: guruID, Role: "guru"})

	createdExam, err := examSvc.CreateExam(guruCtx, CreateExamInput{
		Code:      fmt.Sprintf("ITEST-AG-%d", suffix),
		Title:     "Integration Admin->Guru Exam",
		SubjectID: subjectID,
		CreatedBy: guruID,
	})
	if err != nil {
		t.Fatalf("create exam by guru: %v", err)
	}
	examID = createdExam.ID
	if createdExam.ManagementScope != "same_school" {
		t.Fatalf("expected same_school default scope, got %q", createdExam.ManagementScope)
	}
	if createdExam.OwnerSchoolID == nil || *createdExam.OwnerSchoolID != schoolAID {
		t.Fatalf("expected owner school id %d, got %+v", schoolAID, createdExam.OwnerSchoolID)
	}

	_, err = examSvc.UpdateExam(guruCtx, UpdateExamInput{
		ID:              examID,
		Code:            createdExam.Code,
		Title:           createdExam.Title,
		SubjectID:       createdExam.SubjectID,
		KKTP:            createdExam.KKTP,
		DurationMinutes: createdExam.DurationMinutes,
		MaxAttempts:     createdExam.MaxAttempts,
		ReviewPolicy:    createdExam.ReviewPolicy,
		ManagementScope: "cross_school",
		IsActive:        true,
	})
	if !errors.Is(err, ErrExamForbidden) {
		t.Fatalf("expected ErrExamForbidden when school-profile guru updates to cross_school, got %v", err)
	}

	_, err = examSvc.AppendExamAssignmentsByClass(guruCtx, AppendExamAssignmentsByClassInput{
		ExamID:     examID,
		SchoolID:   schoolBID,
		ClassID:    classBID,
		AssignedBy: guruID,
	})
	if !errors.Is(err, ErrExamForbidden) {
		t.Fatalf("expected ErrExamForbidden for cross-school assign while profile=school, got %v", err)
	}

	updatedGuru, err := authSvc.UpdateUserByAdmin(ctx, adminID, guruID, auth.AdminUpdateUserInput{
		FullName:             createdGuru.FullName,
		Email:                guruUsername + "@example.test",
		Role:                 "guru",
		TeacherAccessProfile: "cross_school",
	})
	if err != nil {
		t.Fatalf("update guru profile to cross_school: %v", err)
	}
	if updatedGuru.TeacherAccessProfile != "cross_school" {
		t.Fatalf("expected updated guru profile cross_school, got %q", updatedGuru.TeacherAccessProfile)
	}

	updatedExam, err := examSvc.UpdateExam(guruCtx, UpdateExamInput{
		ID:              examID,
		Code:            createdExam.Code,
		Title:           createdExam.Title + " Updated",
		SubjectID:       createdExam.SubjectID,
		KKTP:            createdExam.KKTP,
		DurationMinutes: createdExam.DurationMinutes,
		MaxAttempts:     createdExam.MaxAttempts,
		ReviewPolicy:    createdExam.ReviewPolicy,
		ManagementScope: "cross_school",
		IsActive:        true,
	})
	if err != nil {
		t.Fatalf("update exam to cross_school after profile change: %v", err)
	}
	if updatedExam.ManagementScope != "cross_school" {
		t.Fatalf("expected updated scope cross_school, got %q", updatedExam.ManagementScope)
	}

	assignments, err := examSvc.AppendExamAssignmentsByClass(guruCtx, AppendExamAssignmentsByClassInput{
		ExamID:     examID,
		SchoolID:   schoolBID,
		ClassID:    classBID,
		AssignedBy: guruID,
	})
	if err != nil {
		t.Fatalf("append assignments after cross_school enabled: %v", err)
	}
	if len(assignments) != 1 || assignments[0].UserID != studentBID {
		t.Fatalf("expected one assignment for student B (id=%d), got %+v", studentBID, assignments)
	}
}

func TestExportResultAndRecapScopedAcrossSameAndCrossSchool_DBIntegration(t *testing.T) {
	if os.Getenv("CBTLMS_INTEGRATION") != "1" {
		t.Skip("set CBTLMS_INTEGRATION=1 to run integration tests")
	}

	dsn := os.Getenv("CBTLMS_TEST_DSN")
	if strings.TrimSpace(dsn) == "" {
		dsn = "postgres://cbtlms:cbtlms_dev_password@localhost:5432/cbtlms?sslmode=disable"
	}

	ctx, cancel := context.WithTimeout(context.Background(), 25*time.Second)
	defer cancel()

	dbConn, err := internaldb.OpenPostgres(ctx, dsn)
	if err != nil {
		t.Fatalf("open test db: %v", err)
	}
	defer dbConn.Close()

	svc := NewService(dbConn, 90)

	suffix := time.Now().UnixNano()
	subjectName := fmt.Sprintf("ITEST Export Scope Subject %d", suffix)
	schoolAName := fmt.Sprintf("ITEST Export School A %d", suffix)
	schoolBName := fmt.Sprintf("ITEST Export School B %d", suffix)
	classAName := fmt.Sprintf("X-A-EX-%d", suffix)
	classBName := fmt.Sprintf("X-B-EX-%d", suffix)
	proktorUsername := fmt.Sprintf("itest_export_proktor_%d", suffix)
	studentAUsername := fmt.Sprintf("itest_export_student_a_%d", suffix)
	studentBUsername := fmt.Sprintf("itest_export_student_b_%d", suffix)

	var (
		subjectID    int64
		schoolAID    int64
		schoolBID    int64
		classAID     int64
		classBID     int64
		proktorID    int64
		studentAID   int64
		studentBID   int64
		questionID   int64
		sameExamID   int64
		crossExamID  int64
		attemptSame  int64
		attemptCross int64
	)

	tx, err := dbConn.BeginTx(ctx, nil)
	if err != nil {
		t.Fatalf("begin seed tx: %v", err)
	}
	defer func() { _ = tx.Rollback() }()

	if err := tx.QueryRowContext(ctx, `
		INSERT INTO subjects (education_level, subject_type, name, is_active)
		VALUES ('SMA', 'Wajib', $1, TRUE)
		RETURNING id
	`, subjectName).Scan(&subjectID); err != nil {
		t.Fatalf("insert subject: %v", err)
	}

	if err := tx.QueryRowContext(ctx, `
		INSERT INTO schools (name, code, address, is_active, created_at, updated_at)
		VALUES ($1, $2, 'Jl. Export A', TRUE, now(), now())
		RETURNING id
	`, schoolAName, fmt.Sprintf("ITEST-EA-%d", suffix)).Scan(&schoolAID); err != nil {
		t.Fatalf("insert school A: %v", err)
	}
	if err := tx.QueryRowContext(ctx, `
		INSERT INTO schools (name, code, address, is_active, created_at, updated_at)
		VALUES ($1, $2, 'Jl. Export B', TRUE, now(), now())
		RETURNING id
	`, schoolBName, fmt.Sprintf("ITEST-EB-%d", suffix)).Scan(&schoolBID); err != nil {
		t.Fatalf("insert school B: %v", err)
	}

	if err := tx.QueryRowContext(ctx, `
		INSERT INTO classes (school_id, name, grade_level, is_active, created_at, updated_at)
		VALUES ($1, $2, '10', TRUE, now(), now())
		RETURNING id
	`, schoolAID, classAName).Scan(&classAID); err != nil {
		t.Fatalf("insert class A: %v", err)
	}
	if err := tx.QueryRowContext(ctx, `
		INSERT INTO classes (school_id, name, grade_level, is_active, created_at, updated_at)
		VALUES ($1, $2, '10', TRUE, now(), now())
		RETURNING id
	`, schoolBID, classBName).Scan(&classBID); err != nil {
		t.Fatalf("insert class B: %v", err)
	}

	if err := tx.QueryRowContext(ctx, `
		INSERT INTO users (
			username, password_hash, full_name, role, is_active,
			email, email_verified_at, account_status, created_at, updated_at
		) VALUES (
			$1, 'dummy_hash', 'Export Proktor', 'proktor', TRUE,
			$2, now(), 'active', now(), now()
		)
		RETURNING id
	`, proktorUsername, proktorUsername+"@example.test").Scan(&proktorID); err != nil {
		t.Fatalf("insert proktor: %v", err)
	}
	if err := tx.QueryRowContext(ctx, `
		INSERT INTO users (
			username, password_hash, full_name, role, is_active,
			email, email_verified_at, account_status, created_at, updated_at
		) VALUES (
			$1, 'dummy_hash', 'Export Student A', 'siswa', TRUE,
			$2, now(), 'active', now(), now()
		)
		RETURNING id
	`, studentAUsername, studentAUsername+"@example.test").Scan(&studentAID); err != nil {
		t.Fatalf("insert student A: %v", err)
	}
	if err := tx.QueryRowContext(ctx, `
		INSERT INTO users (
			username, password_hash, full_name, role, is_active,
			email, email_verified_at, account_status, created_at, updated_at
		) VALUES (
			$1, 'dummy_hash', 'Export Student B', 'siswa', TRUE,
			$2, now(), 'active', now(), now()
		)
		RETURNING id
	`, studentBUsername, studentBUsername+"@example.test").Scan(&studentBID); err != nil {
		t.Fatalf("insert student B: %v", err)
	}

	if _, err := tx.ExecContext(ctx, `
		INSERT INTO enrollments (user_id, school_id, class_id, status, enrolled_at, created_at)
		VALUES
		($1, $2, $3, 'active', now(), now()),
		($4, $5, $6, 'active', now(), now())
	`, studentAID, schoolAID, classAID, studentBID, schoolBID, classBID); err != nil {
		t.Fatalf("insert enrollments: %v", err)
	}
	if _, err := tx.ExecContext(ctx, `
		INSERT INTO user_school_scopes (user_id, school_id, created_at)
		VALUES ($1, $2, now())
	`, proktorID, schoolAID); err != nil {
		t.Fatalf("insert proktor scope: %v", err)
	}

	if err := tx.QueryRowContext(ctx, `
		INSERT INTO questions (subject_id, question_type, stem_html, metadata, is_active, version, created_at, updated_at)
		VALUES ($1, 'pg_tunggal', '<p>Export Q1</p>', '{}'::jsonb, TRUE, 1, now(), now())
		RETURNING id
	`, subjectID).Scan(&questionID); err != nil {
		t.Fatalf("insert question: %v", err)
	}

	if err := tx.QueryRowContext(ctx, `
		INSERT INTO exams (
			code, title, subject_id, duration_minutes,
			randomize_questions, randomize_options, review_policy,
			management_scope, owner_school_id, is_active, created_at
		) VALUES (
			$1, 'Integration Same School Export', $2, 30,
			FALSE, FALSE, 'after_submit',
			'same_school', $3, TRUE, now()
		)
		RETURNING id
	`, fmt.Sprintf("ITEST-EX-SAME-%d", suffix), subjectID, schoolAID).Scan(&sameExamID); err != nil {
		t.Fatalf("insert same_school exam: %v", err)
	}
	if err := tx.QueryRowContext(ctx, `
		INSERT INTO exams (
			code, title, subject_id, duration_minutes,
			randomize_questions, randomize_options, review_policy,
			management_scope, owner_school_id, is_active, created_at
		) VALUES (
			$1, 'Integration Cross School Export', $2, 30,
			FALSE, FALSE, 'after_submit',
			'cross_school', $3, TRUE, now()
		)
		RETURNING id
	`, fmt.Sprintf("ITEST-EX-CROSS-%d", suffix), subjectID, schoolAID).Scan(&crossExamID); err != nil {
		t.Fatalf("insert cross_school exam: %v", err)
	}

	if _, err := tx.ExecContext(ctx, `
		INSERT INTO exam_questions (exam_id, question_id, seq_no, weight)
		VALUES
		($1, $2, 1, 1.0),
		($3, $2, 1, 1.0)
	`, sameExamID, questionID, crossExamID); err != nil {
		t.Fatalf("insert exam questions: %v", err)
	}

	if _, err := tx.ExecContext(ctx, `
		INSERT INTO exam_assignments (exam_id, user_id, status, assigned_by, assigned_at, created_at, updated_at)
		VALUES
		($1, $2, 'active', $2, now(), now(), now()),
		($3, $2, 'active', $2, now(), now(), now()),
		($3, $4, 'active', $2, now(), now(), now())
	`, sameExamID, studentAID, crossExamID, studentBID); err != nil {
		t.Fatalf("insert assignments: %v", err)
	}

	if err := tx.QueryRowContext(ctx, `
		INSERT INTO attempts (exam_id, student_id, status, started_at, submitted_at, expires_at, score)
		VALUES ($1, $2, 'submitted', now() - interval '20 minute', now() - interval '10 minute', now() + interval '10 minute', 1)
		RETURNING id
	`, sameExamID, studentAID).Scan(&attemptSame); err != nil {
		t.Fatalf("insert same exam attempt: %v", err)
	}
	if err := tx.QueryRowContext(ctx, `
		INSERT INTO attempts (exam_id, student_id, status, started_at, submitted_at, expires_at, score)
		VALUES ($1, $2, 'submitted', now() - interval '18 minute', now() - interval '8 minute', now() + interval '12 minute', 1)
		RETURNING id
	`, crossExamID, studentAID).Scan(&attemptCross); err != nil {
		t.Fatalf("insert cross exam attempt A: %v", err)
	}
	if _, err := tx.ExecContext(ctx, `
		INSERT INTO attempts (exam_id, student_id, status, started_at, submitted_at, expires_at, score)
		VALUES ($1, $2, 'submitted', now() - interval '16 minute', now() - interval '6 minute', now() + interval '14 minute', 1)
	`, crossExamID, studentBID); err != nil {
		t.Fatalf("insert cross exam attempt B: %v", err)
	}

	if err := tx.Commit(); err != nil {
		t.Fatalf("commit seed: %v", err)
	}

	defer func() {
		cleanupCtx, cleanupCancel := context.WithTimeout(context.Background(), 15*time.Second)
		defer cleanupCancel()

		cleanupTx, cleanupErr := dbConn.BeginTx(cleanupCtx, nil)
		if cleanupErr != nil {
			t.Logf("cleanup begin tx failed: %v", cleanupErr)
			return
		}
		defer func() { _ = cleanupTx.Rollback() }()

		_, _ = cleanupTx.ExecContext(cleanupCtx, `DELETE FROM attempt_scores WHERE attempt_id IN (SELECT id FROM attempts WHERE exam_id IN ($1, $2))`, sameExamID, crossExamID)
		_, _ = cleanupTx.ExecContext(cleanupCtx, `DELETE FROM attempt_answers WHERE attempt_id IN (SELECT id FROM attempts WHERE exam_id IN ($1, $2))`, sameExamID, crossExamID)
		_, _ = cleanupTx.ExecContext(cleanupCtx, `DELETE FROM attempts WHERE exam_id IN ($1, $2)`, sameExamID, crossExamID)
		_, _ = cleanupTx.ExecContext(cleanupCtx, `DELETE FROM exam_assignments WHERE exam_id IN ($1, $2)`, sameExamID, crossExamID)
		_, _ = cleanupTx.ExecContext(cleanupCtx, `DELETE FROM exam_questions WHERE exam_id IN ($1, $2)`, sameExamID, crossExamID)
		_, _ = cleanupTx.ExecContext(cleanupCtx, `DELETE FROM exams WHERE id IN ($1, $2)`, sameExamID, crossExamID)
		_, _ = cleanupTx.ExecContext(cleanupCtx, `DELETE FROM question_options WHERE question_id = $1`, questionID)
		_, _ = cleanupTx.ExecContext(cleanupCtx, `DELETE FROM question_versions WHERE question_id = $1`, questionID)
		_, _ = cleanupTx.ExecContext(cleanupCtx, `DELETE FROM questions WHERE id = $1`, questionID)
		_, _ = cleanupTx.ExecContext(cleanupCtx, `DELETE FROM user_school_scopes WHERE user_id = $1`, proktorID)
		_, _ = cleanupTx.ExecContext(cleanupCtx, `DELETE FROM enrollments WHERE user_id IN ($1, $2)`, studentAID, studentBID)
		_, _ = cleanupTx.ExecContext(cleanupCtx, `DELETE FROM classes WHERE id IN ($1, $2)`, classAID, classBID)
		_, _ = cleanupTx.ExecContext(cleanupCtx, `DELETE FROM schools WHERE id IN ($1, $2)`, schoolAID, schoolBID)
		_, _ = cleanupTx.ExecContext(cleanupCtx, `DELETE FROM stimuli WHERE subject_id = $1`, subjectID)
		_, _ = cleanupTx.ExecContext(cleanupCtx, `DELETE FROM subjects WHERE id = $1`, subjectID)
		_, _ = cleanupTx.ExecContext(cleanupCtx, `DELETE FROM auth_identities WHERE user_id IN ($1, $2, $3)`, proktorID, studentAID, studentBID)
		_, _ = cleanupTx.ExecContext(cleanupCtx, `DELETE FROM auth_sessions WHERE user_id IN ($1, $2, $3)`, proktorID, studentAID, studentBID)
		_, _ = cleanupTx.ExecContext(cleanupCtx, `DELETE FROM student_profiles WHERE user_id IN ($1, $2)`, studentAID, studentBID)
		_, _ = cleanupTx.ExecContext(cleanupCtx, `DELETE FROM users WHERE id IN ($1, $2, $3)`, proktorID, studentAID, studentBID)

		if err := cleanupTx.Commit(); err != nil {
			t.Logf("cleanup commit failed: %v", err)
		}
	}()

	scopedCtx := auth.ContextWithUser(ctx, &auth.User{ID: proktorID, Role: "proktor"})

	sameResultExcel, _, err := svc.ExportExamParticipantResultsExcel(scopedCtx, sameExamID, nil)
	if err != nil {
		t.Fatalf("export same-school participant result: %v", err)
	}
	if got := countParticipantExcelRowsByName(t, sameResultExcel, "Export Student A"); got != 1 {
		t.Fatalf("expected 1 row for student A in same-school export, got %d", got)
	}

	crossResultExcel, _, err := svc.ExportExamParticipantResultsExcel(scopedCtx, crossExamID, nil)
	if err != nil {
		t.Fatalf("export cross-school participant result: %v", err)
	}
	if got := countParticipantExcelRowsByName(t, crossResultExcel, "Export Student A"); got != 1 {
		t.Fatalf("expected scoped row for student A in cross-school export, got %d", got)
	}
	if got := countParticipantExcelRowsByName(t, crossResultExcel, "Export Student B"); got != 0 {
		t.Fatalf("expected student B hidden by proktor scope, got %d rows", got)
	}

	crossFilteredB, _, err := svc.ExportExamParticipantResultsExcel(scopedCtx, crossExamID, &schoolBName)
	if err != nil {
		t.Fatalf("export cross-school participant result with school B filter: %v", err)
	}
	if got := countParticipantExcelDataRows(t, crossFilteredB); got != 0 {
		t.Fatalf("expected 0 rows after school B filter on scoped export, got %d", got)
	}

	crossRecapExcel, _, err := svc.ExportExamScoreRecapExcel(scopedCtx, crossExamID, "highest", nil, nil)
	if err != nil {
		t.Fatalf("export cross-school recap: %v", err)
	}
	if got := countRecapExcelRowsByName(t, crossRecapExcel, "Export Student A"); got != 1 {
		t.Fatalf("expected recap row for student A, got %d", got)
	}
	if got := countRecapExcelRowsByName(t, crossRecapExcel, "Export Student B"); got != 0 {
		t.Fatalf("expected no recap row for student B due to proktor scope, got %d", got)
	}

	_ = attemptSame
	_ = attemptCross
}

func TestSubmitAttempt_ScoringThreeTypes_DBIntegration(t *testing.T) {
	if os.Getenv("CBTLMS_INTEGRATION") != "1" {
		t.Skip("set CBTLMS_INTEGRATION=1 to run integration tests")
	}

	dsn := os.Getenv("CBTLMS_TEST_DSN")
	if strings.TrimSpace(dsn) == "" {
		dsn = "postgres://cbtlms:cbtlms_dev_password@localhost:5432/cbtlms?sslmode=disable"
	}

	ctx, cancel := context.WithTimeout(context.Background(), 25*time.Second)
	defer cancel()

	dbConn, err := internaldb.OpenPostgres(ctx, dsn)
	if err != nil {
		t.Fatalf("open test db: %v", err)
	}
	defer dbConn.Close()

	svc := NewService(dbConn, 90)

	suffix := time.Now().UnixNano()
	subjectName := fmt.Sprintf("ITEST Score Subject %d", suffix)
	examCode := fmt.Sprintf("ITEST-SCORE-EXAM-%d", suffix)
	studentUsername := fmt.Sprintf("itest_score_student_%d", suffix)

	tx, err := dbConn.BeginTx(ctx, nil)
	if err != nil {
		t.Fatalf("begin seed tx: %v", err)
	}
	defer func() { _ = tx.Rollback() }()

	var subjectID int64
	if err := tx.QueryRowContext(ctx, `
		INSERT INTO subjects (education_level, subject_type, name, is_active)
		VALUES ('SMA', 'Wajib', $1, TRUE)
		RETURNING id
	`, subjectName).Scan(&subjectID); err != nil {
		t.Fatalf("insert subject: %v", err)
	}

	var studentID int64
	if err := tx.QueryRowContext(ctx, `
		INSERT INTO users (
			username, password_hash, full_name, role, is_active,
			email, email_verified_at, account_status, created_at, updated_at
		) VALUES (
			$1, 'dummy_hash', 'Integration Student', 'siswa', TRUE,
			$2, now(), 'active', now(), now()
		)
		RETURNING id
	`, studentUsername, studentUsername+"@example.test").Scan(&studentID); err != nil {
		t.Fatalf("insert student: %v", err)
	}

	var examID int64
	if err := tx.QueryRowContext(ctx, `
		INSERT INTO exams (
			code, title, subject_id, duration_minutes,
			randomize_questions, randomize_options, review_policy,
			is_active, created_at
		) VALUES (
			$1, 'Integration Scoring Exam', $2, 60,
			FALSE, FALSE, 'after_submit',
			TRUE, now()
		)
		RETURNING id
	`, examCode, subjectID).Scan(&examID); err != nil {
		t.Fatalf("insert exam: %v", err)
	}

	var q1, q2, q3 int64
	if err := tx.QueryRowContext(ctx, `
		INSERT INTO questions (subject_id, question_type, stem_html, metadata, is_active, version, created_at, updated_at)
		VALUES ($1, 'pg_tunggal', '<p>Q1</p>', '{}'::jsonb, TRUE, 1, now(), now())
		RETURNING id
	`, subjectID).Scan(&q1); err != nil {
		t.Fatalf("insert q1: %v", err)
	}
	if err := tx.QueryRowContext(ctx, `
		INSERT INTO questions (subject_id, question_type, stem_html, metadata, is_active, version, created_at, updated_at)
		VALUES ($1, 'multi_jawaban', '<p>Q2</p>', '{}'::jsonb, TRUE, 1, now(), now())
		RETURNING id
	`, subjectID).Scan(&q2); err != nil {
		t.Fatalf("insert q2: %v", err)
	}
	if err := tx.QueryRowContext(ctx, `
		INSERT INTO questions (subject_id, question_type, stem_html, metadata, is_active, version, created_at, updated_at)
		VALUES ($1, 'benar_salah_pernyataan', '<p>Q3</p>', '{}'::jsonb, TRUE, 1, now(), now())
		RETURNING id
	`, subjectID).Scan(&q3); err != nil {
		t.Fatalf("insert q3: %v", err)
	}

	if _, err := tx.ExecContext(ctx, `
		INSERT INTO question_options (question_id, option_key, option_html, is_correct)
		VALUES
		($1, 'A', '<p>3</p>', FALSE),
		($1, 'B', '<p>4</p>', TRUE)
	`, q1); err != nil {
		t.Fatalf("insert q1 options: %v", err)
	}
	if _, err := tx.ExecContext(ctx, `
		INSERT INTO question_options (question_id, option_key, option_html, is_correct)
		VALUES
		($1, 'A', '<p>opt A</p>', TRUE),
		($1, 'B', '<p>opt B</p>', FALSE),
		($1, 'D', '<p>opt D</p>', TRUE)
	`, q2); err != nil {
		t.Fatalf("insert q2 options: %v", err)
	}

	if _, err := tx.ExecContext(ctx, `
		INSERT INTO question_versions (question_id, version_no, stem_html, answer_key, status, is_public, is_active, weight, created_at)
		VALUES ($1, 1, '<p>Q1</p>', '{"correct":"B"}'::jsonb, 'final', TRUE, TRUE, 2.0, now())
	`, q1); err != nil {
		t.Fatalf("insert q1 version: %v", err)
	}
	if _, err := tx.ExecContext(ctx, `
		INSERT INTO question_versions (question_id, version_no, stem_html, answer_key, status, is_public, is_active, weight, created_at)
		VALUES ($1, 1, '<p>Q2</p>', '{"correct":["A","D"],"mode":"exact"}'::jsonb, 'final', TRUE, TRUE, 3.0, now())
	`, q2); err != nil {
		t.Fatalf("insert q2 version: %v", err)
	}
	if _, err := tx.ExecContext(ctx, `
		INSERT INTO question_versions (question_id, version_no, stem_html, answer_key, status, is_public, is_active, weight, created_at)
		VALUES ($1, 1, '<p>Q3</p>', '{"statements":[{"id":"s1","correct":true},{"id":"s2","correct":false}]}'::jsonb, 'final', TRUE, TRUE, 4.0, now())
	`, q3); err != nil {
		t.Fatalf("insert q3 version: %v", err)
	}

	if _, err := tx.ExecContext(ctx, `
		INSERT INTO exam_questions (exam_id, question_id, seq_no, weight)
		VALUES
		($1, $2, 1, 2.0),
		($1, $3, 2, 3.0),
		($1, $4, 3, 4.0)
	`, examID, q1, q2, q3); err != nil {
		t.Fatalf("insert exam questions: %v", err)
	}

	var attemptID int64
	if err := tx.QueryRowContext(ctx, `
		INSERT INTO attempts (exam_id, student_id, status, started_at, expires_at)
		VALUES ($1, $2, 'in_progress', now() - interval '5 minute', now() + interval '30 minute')
		RETURNING id
	`, examID, studentID).Scan(&attemptID); err != nil {
		t.Fatalf("insert attempt: %v", err)
	}

	if _, err := tx.ExecContext(ctx, `
		INSERT INTO attempt_answers (attempt_id, question_id, answer_payload, is_doubt, is_final, updated_at)
		VALUES
		($1, $2, '{"selected":"B"}'::jsonb, FALSE, FALSE, now()),
		($1, $3, '{"selected":["A"]}'::jsonb, FALSE, FALSE, now()),
		($1, $4, '{"answers":[{"id":"s1","value":true},{"id":"s2","value":true}]}'::jsonb, FALSE, FALSE, now())
	`, attemptID, q1, q2, q3); err != nil {
		t.Fatalf("insert attempt answers: %v", err)
	}

	if err := tx.Commit(); err != nil {
		t.Fatalf("commit seed: %v", err)
	}

	defer cleanupIntegrationFixture(t, dbConn, examID, q1, subjectID, studentID)
	defer cleanupIntegrationFixtureExtraQuestions(t, dbConn, q2, q3)

	summary, err := svc.SubmitAttempt(ctx, attemptID)
	if err != nil {
		t.Fatalf("submit attempt: %v", err)
	}
	if summary.Status != "submitted" {
		t.Fatalf("expected submitted, got %s", summary.Status)
	}
	if summary.Score != 4 {
		t.Fatalf("expected score=4, got %v", summary.Score)
	}
	if summary.TotalCorrect != 1 || summary.TotalWrong != 2 || summary.TotalUnanswered != 0 {
		t.Fatalf("unexpected summary counters: correct=%d wrong=%d unanswered=%d", summary.TotalCorrect, summary.TotalWrong, summary.TotalUnanswered)
	}

	result, err := svc.GetAttemptResult(ctx, attemptID)
	if err != nil {
		t.Fatalf("get attempt result: %v", err)
	}
	if len(result.Items) != 3 {
		t.Fatalf("expected 3 result items, got %d", len(result.Items))
	}

	byQuestion := map[int64]AttemptResultItem{}
	for _, item := range result.Items {
		byQuestion[item.QuestionID] = item
	}

	item1 := byQuestion[q1]
	if item1.Reason != "correct" || item1.EarnedScore != 2 {
		t.Fatalf("unexpected q1 result: reason=%s earned=%v", item1.Reason, item1.EarnedScore)
	}
	item2 := byQuestion[q2]
	if item2.Reason != "wrong" || item2.EarnedScore != 0 {
		t.Fatalf("unexpected q2 result: reason=%s earned=%v", item2.Reason, item2.EarnedScore)
	}
	item3 := byQuestion[q3]
	if item3.Reason != "partial" || item3.EarnedScore != 2 {
		t.Fatalf("unexpected q3 result: reason=%s earned=%v", item3.Reason, item3.EarnedScore)
	}
	if len(item3.Breakdown) != 2 {
		t.Fatalf("expected q3 breakdown len=2, got %d", len(item3.Breakdown))
	}
}

func cleanupIntegrationFixture(t *testing.T, db *sql.DB, examID, questionID, subjectID, studentID int64) {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		t.Logf("cleanup begin tx failed: %v", err)
		return
	}
	defer func() { _ = tx.Rollback() }()

	if questionID > 0 {
		_, _ = tx.ExecContext(ctx, `DELETE FROM attempt_scores WHERE question_id = $1`, questionID)
		_, _ = tx.ExecContext(ctx, `DELETE FROM attempt_answers WHERE question_id = $1`, questionID)
	}
	_, _ = tx.ExecContext(ctx, `DELETE FROM attempts WHERE exam_id = $1`, examID)
	_, _ = tx.ExecContext(ctx, `DELETE FROM exam_questions WHERE exam_id = $1`, examID)
	_, _ = tx.ExecContext(ctx, `DELETE FROM exams WHERE id = $1`, examID)
	_, _ = tx.ExecContext(ctx, `DELETE FROM question_options WHERE question_id = $1`, questionID)
	_, _ = tx.ExecContext(ctx, `DELETE FROM question_versions WHERE question_id = $1`, questionID)
	_, _ = tx.ExecContext(ctx, `DELETE FROM questions WHERE id = $1`, questionID)
	_, _ = tx.ExecContext(ctx, `DELETE FROM stimuli WHERE subject_id = $1`, subjectID)
	_, _ = tx.ExecContext(ctx, `DELETE FROM subjects WHERE id = $1`, subjectID)
	_, _ = tx.ExecContext(ctx, `DELETE FROM auth_identities WHERE user_id = $1`, studentID)
	_, _ = tx.ExecContext(ctx, `DELETE FROM auth_sessions WHERE user_id = $1`, studentID)
	_, _ = tx.ExecContext(ctx, `DELETE FROM student_profiles WHERE user_id = $1`, studentID)
	_, _ = tx.ExecContext(ctx, `DELETE FROM users WHERE id = $1`, studentID)

	if err := tx.Commit(); err != nil {
		t.Logf("cleanup commit failed: %v", err)
	}
}

func cleanupIntegrationFixtureExtraQuestions(t *testing.T, db *sql.DB, questionIDs ...int64) {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		t.Logf("cleanup extra begin tx failed: %v", err)
		return
	}
	defer func() { _ = tx.Rollback() }()

	for _, qID := range questionIDs {
		if qID <= 0 {
			continue
		}
		_, _ = tx.ExecContext(ctx, `DELETE FROM attempt_scores WHERE question_id = $1`, qID)
		_, _ = tx.ExecContext(ctx, `DELETE FROM attempt_answers WHERE question_id = $1`, qID)
		_, _ = tx.ExecContext(ctx, `DELETE FROM exam_questions WHERE question_id = $1`, qID)
		_, _ = tx.ExecContext(ctx, `DELETE FROM question_options WHERE question_id = $1`, qID)
		_, _ = tx.ExecContext(ctx, `DELETE FROM question_versions WHERE question_id = $1`, qID)
		_, _ = tx.ExecContext(ctx, `DELETE FROM questions WHERE id = $1`, qID)
	}

	if err := tx.Commit(); err != nil {
		t.Logf("cleanup extra commit failed: %v", err)
	}
}

func countParticipantExcelRowsByName(t *testing.T, content []byte, fullName string) int {
	t.Helper()
	f, err := excelize.OpenReader(bytes.NewReader(content))
	if err != nil {
		t.Fatalf("open participant excel: %v", err)
	}
	defer func() { _ = f.Close() }()

	sheet := f.GetSheetName(0)
	rows, err := f.GetRows(sheet)
	if err != nil {
		t.Fatalf("read participant excel rows: %v", err)
	}
	count := 0
	for idx, row := range rows {
		if idx < 2 {
			continue
		}
		if len(row) == 0 || strings.TrimSpace(row[0]) == "" {
			continue
		}
		if strings.TrimSpace(row[0]) == strings.TrimSpace(fullName) {
			count++
		}
	}
	return count
}

func countParticipantExcelDataRows(t *testing.T, content []byte) int {
	t.Helper()
	f, err := excelize.OpenReader(bytes.NewReader(content))
	if err != nil {
		t.Fatalf("open participant excel: %v", err)
	}
	defer func() { _ = f.Close() }()

	sheet := f.GetSheetName(0)
	rows, err := f.GetRows(sheet)
	if err != nil {
		t.Fatalf("read participant excel rows: %v", err)
	}
	count := 0
	for idx, row := range rows {
		if idx < 2 {
			continue
		}
		if len(row) == 0 || strings.TrimSpace(row[0]) == "" {
			continue
		}
		count++
	}
	return count
}

func countRecapExcelRowsByName(t *testing.T, content []byte, fullName string) int {
	t.Helper()
	f, err := excelize.OpenReader(bytes.NewReader(content))
	if err != nil {
		t.Fatalf("open recap excel: %v", err)
	}
	defer func() { _ = f.Close() }()

	sheet := f.GetSheetName(0)
	rows, err := f.GetRows(sheet)
	if err != nil {
		t.Fatalf("read recap excel rows: %v", err)
	}

	headerRow := -1
	for idx, row := range rows {
		if len(row) < 2 {
			continue
		}
		if strings.TrimSpace(row[0]) == "Nama" && strings.TrimSpace(row[1]) == "Username" {
			headerRow = idx
			break
		}
	}
	if headerRow < 0 {
		t.Fatalf("recap header row not found")
	}

	count := 0
	for idx, row := range rows {
		if idx <= headerRow {
			continue
		}
		if len(row) == 0 || strings.TrimSpace(row[0]) == "" {
			continue
		}
		if strings.TrimSpace(row[0]) == strings.TrimSpace(fullName) {
			count++
		}
	}
	return count
}
