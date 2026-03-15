package app

import (
	"database/sql"
	"html/template"
	"log"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"

	"cbtlms/internal/app/observability"
	"cbtlms/internal/assistant"
	"cbtlms/internal/audit"
	"cbtlms/internal/auth"
	"cbtlms/internal/exam"
	"cbtlms/internal/masterdata"
	"cbtlms/internal/media"
	"cbtlms/internal/question"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
)

func NewRouter(cfg Config, db *sql.DB) http.Handler {
	r := chi.NewRouter()
	r.Use(middleware.RequestID)
	r.Use(middleware.RealIP)
	r.Use(middleware.Recoverer)

	obs := observability.NewCollector(db)
	r.Use(obs.Middleware)
	authRateLimiter := NewIPRateLimiter(cfg.AuthRateLimitPerMin, time.Minute)
	aiRateLimiter := NewIPRateLimiter(cfg.AIRateLimitPerMin, time.Minute)

	tmpl := template.Must(template.ParseGlob("web/templates/layout/*.html"))
	template.Must(tmpl.ParseGlob("web/templates/pages/*.html"))

	mailer := auth.NewSMTPMailer(auth.SMTPConfig{
		Host:     cfg.SMTPHost,
		Port:     cfg.SMTPPort,
		User:     cfg.SMTPUser,
		Pass:     cfg.SMTPPass,
		From:     cfg.SMTPFrom,
		StartTLS: cfg.SMTPStartTLS,
	})

	authSvc := auth.NewService(db, auth.ServiceConfig{
		BootstrapToken:     cfg.BootstrapToken,
		Mailer:             mailer,
		AppBaseURL:         cfg.AppBaseURL,
		GoogleClientID:     cfg.GoogleOAuthClientID,
		GoogleClientSecret: cfg.GoogleOAuthClientSecret,
		GoogleRedirectURL:  cfg.GoogleOAuthRedirectURL,
		GoogleDomains:      cfg.GoogleOAuthDomains,
	})
	authHandler := auth.NewHandler(authSvc)
	auditSvc := audit.NewService(db)
	auditHandler := audit.NewHandler(auditSvc)
	assistantSvc := assistant.NewService(assistant.ServiceConfig{
		GeminiAPIKey: cfg.GeminiAPIKey,
		GeminiModel:  cfg.GeminiModel,
	})
	assistantHandler := assistant.NewHandler(assistantSvc)

	examSvc := exam.NewService(db, cfg.DefaultExamMinutes)
	examHandler := exam.NewHandler(examSvc)
	masterSvc := masterdata.NewService(db)
	masterHandler := masterdata.NewHandler(masterSvc)
	questionSvc := question.NewService(db)
	questionHandler := question.NewHandler(questionSvc)
	mediaSvc, err := media.NewService(media.ServiceConfig{
		Endpoint:  cfg.MinIOEndpoint,
		AccessKey: cfg.MinIOAccessKey,
		SecretKey: cfg.MinIOSecretKey,
		UseSSL:    cfg.MinIOUseSSL,
		Bucket:    cfg.MinIOBucket,
		Region:    cfg.MinIORegion,
	})
	if err != nil {
		log.Printf("media warning: failed initializing minio storage: %v", err)
		mediaSvc = media.NewDisabledService()
	}
	mediaHandler := media.NewHandler(mediaSvc)

	r.Get("/healthz", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"ok":true}`))
	})
	r.Get("/metrics", obs.MetricsHandler)

	renderPage := func(w http.ResponseWriter, contentTemplate, pageTitle string, extra map[string]any) {
		assetVersion := resolveAssetVersion(
			"web/static/css/app.css",
			"web/static/js/app.js",
			"web/static/js/guru_exams.js",
			"web/static/js/guru_enroll.js",
			"web/static/js/proktor_master.js",
			"web/static/js/admin_master.js",
			"web/static/js/proktor_exams.js",
		)
		data := map[string]any{
			"Title":           pageTitle,
			"Page":            contentTemplate,
			"ContentTemplate": contentTemplate,
			"AssetVersion":    assetVersion,
		}
		for k, v := range extra {
			data[k] = v
		}
		if err := tmpl.ExecuteTemplate(w, "base", data); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
		}
	}

	r.Get("/", func(w http.ResponseWriter, r *http.Request) {
		renderPage(w, "home_content", "g-cbt - Sistem Ujian Terintegrasi", map[string]any{})
	})
	r.Get("/login", func(w http.ResponseWriter, r *http.Request) {
		renderPage(w, "login_content", "Login CBT LMS", map[string]any{})
	})
	r.Get("/auth/first-login", authHandler.FirstLoginMagicLink)
	r.Get("/auth/google/start", authHandler.GoogleStart)
	r.Get("/auth/google/callback", authHandler.GoogleCallback)
	r.Get("/ujian", func(w http.ResponseWriter, r *http.Request) {
		renderPage(w, "ujian_content", "Ikuti Ujian", map[string]any{})
	})
	r.Get("/simulasi", func(w http.ResponseWriter, r *http.Request) {
		http.Redirect(w, r, "/ujian", http.StatusFound)
	})
	r.Get("/authoring", func(w http.ResponseWriter, r *http.Request) {
		renderPage(w, "authoring_content", "Authoring Soal", map[string]any{})
	})
	r.Get("/proktor", func(w http.ResponseWriter, r *http.Request) {
		renderPage(w, "proktor_content", "Dashboard Proktor", map[string]any{})
	})
	r.Get("/guru", func(w http.ResponseWriter, r *http.Request) {
		renderPage(w, "guru_content", "Dashboard Guru", map[string]any{})
	})
	r.Get("/peserta", func(w http.ResponseWriter, r *http.Request) {
		renderPage(w, "peserta_content", "Dashboard Peserta", map[string]any{})
	})
	r.Get("/admin", func(w http.ResponseWriter, r *http.Request) {
		renderPage(w, "admin_content", "Admin Dashboard", map[string]any{})
	})
	r.Get("/ujian/{id}", func(w http.ResponseWriter, r *http.Request) {
		attemptID := chi.URLParam(r, "id")
		renderPage(w, "attempt_content", "Pengerjaan Ujian", map[string]any{
			"AttemptID": attemptID,
		})
	})
	r.Get("/hasil/{id}", func(w http.ResponseWriter, r *http.Request) {
		attemptID := chi.URLParam(r, "id")
		renderPage(w, "result_content", "Hasil Ujian", map[string]any{
			"AttemptID": attemptID,
		})
	})

	r.Route("/api/v1", func(api chi.Router) {
		api.Post("/bootstrap/init", authHandler.BootstrapInit)
		api.With(RateLimitMiddleware(authRateLimiter)).Post("/auth/login-password", authHandler.LoginPassword)
		api.With(RateLimitMiddleware(authRateLimiter)).Post("/auth/otp/request", authHandler.RequestOTP)
		api.With(RateLimitMiddleware(authRateLimiter)).Post("/auth/otp/verify", authHandler.VerifyOTP)
		api.With(RateLimitMiddleware(authRateLimiter)).Post("/auth/signup/otp/request", authHandler.RequestSignupOTP)
		api.With(RateLimitMiddleware(authRateLimiter)).Post("/auth/signup/otp/check", authHandler.CheckSignupOTP)
		api.With(RateLimitMiddleware(authRateLimiter)).Post("/auth/signup/otp/verify", authHandler.VerifySignupOTP)
		api.With(RateLimitMiddleware(authRateLimiter)).Get("/auth/google/signup/prefill", authHandler.GoogleSignupPrefill)
		api.With(RateLimitMiddleware(authRateLimiter)).Post("/auth/google/signup/complete", authHandler.GoogleSignupComplete)
		api.With(RateLimitMiddleware(authRateLimiter)).Get("/auth/registrations/{id}/status", authHandler.RegistrationStatus)
		api.With(RateLimitMiddleware(authRateLimiter)).Post("/registrations", authHandler.CreateRegistration)
		api.With(RateLimitMiddleware(aiRateLimiter)).Post("/assistant", assistantHandler.Reply)

		api.Group(func(secure chi.Router) {
			secure.Use(authHandler.RequireAuth)
			secure.Use(CSRFMiddleware(cfg.CSRFEnforced))
			secure.Get("/auth/me", authHandler.Me)
			secure.Get("/auth/me/student-profile", authHandler.MeStudentProfile)
			secure.Post("/auth/logout", authHandler.Logout)
			secure.Get("/subjects", examHandler.ListSubjects)
			secure.With(authHandler.RequireRoles("admin", "proktor", "guru")).Get("/learning-goals", masterHandler.ListLearningGoals)
			secure.With(authHandler.RequireRoles("admin", "proktor", "guru")).Get("/learning-goals/export", masterHandler.ExportLearningGoalsExcel)
			secure.With(authHandler.RequireRoles("admin", "proktor", "guru")).Post("/learning-goals", masterHandler.CreateLearningGoal)
			secure.With(authHandler.RequireRoles("admin", "proktor", "guru")).Get("/learning-goals/import-template", masterHandler.ExportLearningGoalsImportTemplateCSV)
			secure.With(authHandler.RequireRoles("admin", "proktor", "guru")).Post("/learning-goals/import", masterHandler.ImportLearningGoalsCSV)
			secure.With(authHandler.RequireRoles("admin", "proktor", "guru")).Put("/learning-goals/{id}", masterHandler.UpdateLearningGoal)
			secure.With(authHandler.RequireRoles("admin", "proktor", "guru")).Delete("/learning-goals/{id}", masterHandler.DeleteLearningGoal)
			secure.With(authHandler.RequireRoles("guru")).Post("/subjects", examHandler.CreateSubject)
			secure.With(authHandler.RequireRoles("guru")).Put("/subjects/{id}", examHandler.UpdateSubject)
			secure.With(authHandler.RequireRoles("guru")).Delete("/subjects/{id}", examHandler.DeleteSubject)
			secure.Get("/exams", examHandler.ListExams)
			secure.With(authHandler.RequireRoles("siswa")).Get("/exams/published", examHandler.ListPublishedExams)
			secure.With(authHandler.RequireRoles("siswa")).Get("/exams/me", examHandler.ListStudentExams)
			secure.With(authHandler.RequireRoles("siswa")).Get("/exams/{id}/attempts/me", examHandler.ListStudentExamAttempts)
			secure.With(authHandler.RequireRoles("siswa")).Post("/exams/{id}/self-enroll", examHandler.SelfEnrollExam)
			secure.Get("/levels", masterHandler.ListEducationLevels)

			secure.Post("/attempts/start", examHandler.Start)
			secure.Post("/attempts/token/preview", examHandler.PreviewExamByToken)
			secure.Get("/attempts/{id}", examHandler.GetAttempt)
			secure.Get("/attempts/{id}/questions/{no}", examHandler.GetAttemptQuestion)
			secure.Get("/attempts/{id}/result", examHandler.Result)
			secure.Post("/attempts/{id}/events", examHandler.LogEvent)
			secure.Put("/attempts/{id}/answers/{questionID}", examHandler.SaveAnswer)
			secure.Post("/attempts/{id}/submit", examHandler.Submit)
			secure.With(authHandler.RequireRoles("admin", "proktor", "guru")).Get("/attempts/{id}/events", examHandler.ListEvents)
			secure.With(authHandler.RequireRoles("admin", "proktor", "guru")).Get("/exams/{id}/events", examHandler.ListExamEvents)
			secure.With(authHandler.RequireRoles("admin", "proktor", "guru")).Get("/exams/{id}/classes/{class_id}/events", examHandler.ListExamClassEvents)
			secure.With(authHandler.RequireRoles("admin", "proktor", "guru")).Get("/question-codes", questionHandler.ListQuestionCodes)
			secure.With(authHandler.RequireRoles("admin", "proktor", "guru")).Post("/question-codes", questionHandler.CreateQuestionCode)
			secure.With(authHandler.RequireRoles("admin", "proktor", "guru")).Put("/question-codes/{id}", questionHandler.UpdateQuestionCode)
			secure.With(authHandler.RequireRoles("admin", "proktor", "guru")).Delete("/question-codes/{id}", questionHandler.DeleteQuestionCode)
			secure.With(authHandler.RequireRoles("admin", "proktor", "guru")).Post("/questions", questionHandler.CreateQuestion)
			secure.With(authHandler.RequireRoles("admin", "proktor", "guru")).Put("/questions/{id}/code", questionHandler.AssignQuestionCode)
			secure.With(authHandler.RequireRoles("admin", "proktor", "guru")).Put("/questions/{id}/learning-goal", questionHandler.AssignQuestionLearningGoal)
			secure.With(authHandler.RequireRoles("admin", "proktor", "guru")).Get("/questions", questionHandler.ListQuestions)
			secure.With(authHandler.RequireRoles("admin", "proktor", "guru")).Post("/questions/export", questionHandler.ExportQuestions)
			secure.With(authHandler.RequireRoles("admin", "proktor", "guru")).Post("/questions/transfer", questionHandler.TransferQuestions)
			secure.With(authHandler.RequireRoles("admin", "proktor", "guru")).Post("/media/question-images", mediaHandler.UploadQuestionImage)
			secure.Get("/media/question-images/*", mediaHandler.ServeQuestionImage)
			secure.With(authHandler.RequireRoles("admin", "proktor", "guru")).Post("/questions/{id}/versions", questionHandler.CreateQuestionVersion)
			secure.With(authHandler.RequireRoles("admin", "proktor", "guru")).Put("/questions/{id}/versions/{version}", questionHandler.UpdateQuestionVersion)
			secure.With(authHandler.RequireRoles("admin", "proktor", "guru")).Delete("/questions/{id}/versions/{version}", questionHandler.DeleteQuestionVersion)
			secure.With(authHandler.RequireRoles("admin", "proktor", "guru")).Post("/questions/{id}/versions/{version}/finalize", questionHandler.FinalizeQuestionVersion)
			secure.With(authHandler.RequireRoles("admin", "proktor", "guru")).Get("/questions/{id}/versions", questionHandler.ListQuestionVersions)
			secure.With(authHandler.RequireRoles("admin", "proktor", "guru")).Post("/exams/{id}/parallels", questionHandler.CreateQuestionParallel)
			secure.With(authHandler.RequireRoles("admin", "proktor", "guru")).Get("/exams/{id}/parallels", questionHandler.ListQuestionParallels)
			secure.With(authHandler.RequireRoles("admin", "proktor", "guru")).Put("/exams/{id}/parallels/{parallelID}", questionHandler.UpdateQuestionParallel)
			secure.With(authHandler.RequireRoles("admin", "proktor", "guru")).Delete("/exams/{id}/parallels/{parallelID}", questionHandler.DeleteQuestionParallel)
			secure.With(authHandler.RequireRoles("admin", "proktor", "guru")).Post("/reviews/tasks", questionHandler.CreateReviewTask)
			secure.With(authHandler.RequireRoles("admin", "proktor", "guru")).Post("/reviews/tasks/{id}/decision", questionHandler.DecideReviewTask)
			secure.With(authHandler.RequireRoles("admin", "proktor", "guru")).Get("/reviews/tasks", questionHandler.ListReviewTasks)
			secure.With(authHandler.RequireRoles("admin", "proktor", "guru")).Get("/questions/{id}/reviews", questionHandler.GetQuestionReviews)
			secure.With(authHandler.RequireRoles("admin", "proktor", "guru")).Get("/admin/exams/manage", examHandler.ListAdminExams)
			secure.With(authHandler.RequireRoles("admin", "proktor", "guru")).Post("/admin/exams", examHandler.CreateExam)
			secure.With(authHandler.RequireRoles("admin", "proktor", "guru")).Put("/admin/exams/{id}", examHandler.UpdateExam)
			secure.With(authHandler.RequireRoles("admin", "proktor", "guru")).Delete("/admin/exams/{id}", examHandler.DeleteExam)
			secure.With(authHandler.RequireRoles("admin", "proktor")).Post("/admin/exams/{id}/attempts/reset", examHandler.ResetExamAttempt)
			secure.With(authHandler.RequireRoles("admin", "proktor", "guru")).Get("/admin/exams/{id}/assignments", examHandler.ListExamAssignments)
			secure.With(authHandler.RequireRoles("admin", "proktor", "guru")).Put("/admin/exams/{id}/assignments", examHandler.ReplaceExamAssignments)
			secure.With(authHandler.RequireRoles("admin", "proktor", "guru")).Put("/admin/exams/{id}/assignments/by-class", examHandler.ReplaceExamAssignmentsByClass)
			secure.With(authHandler.RequireRoles("admin", "proktor", "guru")).Post("/admin/exams/{id}/assignments/by-class/append", examHandler.AppendExamAssignmentsByClass)
			secure.With(authHandler.RequireRoles("admin", "proktor", "guru")).Delete("/admin/exams/{id}/assignments/{user_id}", examHandler.RemoveExamAssignment)
			secure.With(authHandler.RequireRoles("admin", "proktor", "guru")).Get("/admin/exams/{id}/results", examHandler.ListExamParticipantResults)
			secure.With(authHandler.RequireRoles("admin", "proktor", "guru")).Get("/admin/exams/{id}/results/export", examHandler.ExportExamParticipantResultsExcel)
			secure.With(authHandler.RequireRoles("admin", "proktor", "guru")).Delete("/admin/exams/{id}/attempts/{attemptID}", examHandler.DeleteExamAttempt)
			secure.With(authHandler.RequireRoles("admin", "proktor", "guru")).Get("/admin/exams/{id}/questions", examHandler.ListExamQuestions)
			secure.With(authHandler.RequireRoles("admin", "proktor", "guru")).Post("/admin/exams/{id}/questions", examHandler.UpsertExamQuestion)
			secure.With(authHandler.RequireRoles("admin", "proktor", "guru")).Put("/admin/exams/{id}/questions/{questionID}", examHandler.UpsertExamQuestion)
			secure.With(authHandler.RequireRoles("admin", "proktor", "guru")).Delete("/admin/exams/{id}/questions/{questionID}", examHandler.DeleteExamQuestion)
			secure.With(authHandler.RequireRoles("admin", "proktor", "guru")).Post("/admin/exams/{id}/regrade", examHandler.RegradeExam)
			secure.With(authHandler.RequireRoles("admin", "proktor", "guru")).Get("/admin/exams/{id}/question-codes", examHandler.ListExamQuestionCodeRules)
			secure.With(authHandler.RequireRoles("admin", "proktor", "guru")).Post("/admin/exams/{id}/question-codes", examHandler.UpsertExamQuestionCodeRule)
			secure.With(authHandler.RequireRoles("admin", "proktor", "guru")).Delete("/admin/exams/{id}/question-codes/{questionCodeID}", examHandler.DeleteExamQuestionCodeRule)
			secure.With(authHandler.RequireRoles("admin", "proktor", "guru")).Post("/admin/exams/{id}/question-codes/sync", examHandler.SyncExamQuestionsByCode)
			secure.With(authHandler.RequireRoles("admin", "proktor", "guru")).Put("/admin/exams/{id}/question-incidents", examHandler.UpsertExamQuestionIncident)
			secure.With(authHandler.RequireRoles("admin", "proktor", "guru")).Get("/admin/classes", masterHandler.ListClasses)
			secure.With(authHandler.RequireRoles("admin", "proktor", "guru")).Get("/admin/schools", masterHandler.ListSchools)
			secure.With(authHandler.RequireRoles("admin", "proktor", "guru")).Get("/admin/users", authHandler.ListUsers)

			secure.Group(func(admin chi.Router) {
				admin.Use(authHandler.RequireRoles("admin", "proktor", "guru"))
				admin.Get("/admin/dashboard/stats", authHandler.DashboardStats)
				admin.Get("/admin/exams", examHandler.ListExamsForToken)
				admin.Post("/admin/exams/{id}/token", examHandler.GenerateExamToken)
				admin.Post("/admin/users/{id}/photo", examHandler.UploadUserPhoto)
				admin.Delete("/admin/users/{id}/photo", examHandler.DeleteUserPhoto)
				admin.Put("/admin/users/{id}/class-placement", authHandler.AssignUserClass)
				admin.Get("/admin/registrations", authHandler.ListPendingRegistrations)
				admin.Get("/admin/audit-logs", auditHandler.ListAuditLogs)
				admin.Post("/admin/registrations/{id}/approve", authHandler.ApproveRegistration)
				admin.Post("/admin/registrations/{id}/reject", authHandler.RejectRegistration)
				admin.Post("/admin/schools", masterHandler.CreateSchool)
				admin.Post("/admin/classes", masterHandler.CreateClass)
				admin.Get("/admin/imports/classes/template", masterHandler.ExportClassesImportTemplateCSV)
				admin.Post("/admin/imports/classes", masterHandler.ImportClassesCSV)
				admin.Post("/admin/imports/students", masterHandler.ImportStudentsCSV)
			})

			secure.Group(func(adminOnly chi.Router) {
				adminOnly.Use(authHandler.RequireRoles("admin"))
				adminOnly.Post("/admin/users", authHandler.CreateUser)
				adminOnly.Put("/admin/users/{id}", authHandler.UpdateUser)
				adminOnly.Delete("/admin/users/{id}", authHandler.DeleteUser)
				adminOnly.Get("/admin/users/export", authHandler.ExportUsersExcel)
				adminOnly.Get("/admin/users/import-template", authHandler.ExportUsersImportTemplateExcel)
				adminOnly.Post("/admin/users/import", authHandler.ImportUsersExcel)
				adminOnly.Put("/admin/schools/{id}", masterHandler.UpdateSchool)
				adminOnly.Delete("/admin/schools/{id}", masterHandler.DeleteSchool)
				adminOnly.Put("/admin/classes/{id}", masterHandler.UpdateClass)
				adminOnly.Delete("/admin/classes/{id}", masterHandler.DeleteClass)
				adminOnly.Post("/admin/levels", masterHandler.CreateEducationLevel)
				adminOnly.Put("/admin/levels/{id}", masterHandler.UpdateEducationLevel)
				adminOnly.Delete("/admin/levels/{id}", masterHandler.DeleteEducationLevel)
			})
		})
	})

	staticFiles := http.FileServer(http.Dir("web/static"))
	r.Handle("/static/*", http.StripPrefix("/static/", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.TrimSpace(r.URL.Query().Get("v")) != "" {
			w.Header().Set("Cache-Control", "public, max-age=2592000, immutable")
		} else {
			w.Header().Set("Cache-Control", "public, max-age=300")
		}
		w.Header().Set("X-Content-Type-Options", "nosniff")
		staticFiles.ServeHTTP(w, r)
	})))

	return r
}

func resolveAssetVersion(paths ...string) string {
	var maxMtime int64
	for _, p := range paths {
		info, err := os.Stat(p)
		if err != nil {
			continue
		}
		mtime := info.ModTime().Unix()
		if mtime > maxMtime {
			maxMtime = mtime
		}
	}
	if maxMtime <= 0 {
		return "dev"
	}
	return strconv.FormatInt(maxMtime, 10)
}
