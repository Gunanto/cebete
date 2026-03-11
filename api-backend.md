# API Backend

Sumber: `internal/app/router.go`.

## Public (tanpa auth)

- `GET /healthz`
- `GET /metrics`
- `POST /api/v1/bootstrap/init`
- `POST /api/v1/auth/login-password`
- `POST /api/v1/auth/otp/request`
- `POST /api/v1/auth/otp/verify`
- `POST /api/v1/auth/signup/otp/request`
- `POST /api/v1/auth/signup/otp/verify`
- `POST /api/v1/registrations`
- `POST /api/v1/assistant`

## Authenticated (RequireAuth + CSRF)

Auth
- `GET /api/v1/auth/me`
- `GET /api/v1/auth/me/student-profile`
- `POST /api/v1/auth/logout`

Subjects & Levels
- `GET /api/v1/subjects`
- `POST /api/v1/subjects` (guru)
- `PUT /api/v1/subjects/{id}` (guru)
- `DELETE /api/v1/subjects/{id}` (guru)
- `GET /api/v1/levels`

Learning Goals (admin/proktor/guru)
- `GET /api/v1/learning-goals`
- `GET /api/v1/learning-goals/export`
- `POST /api/v1/learning-goals`
- `GET /api/v1/learning-goals/import-template`
- `POST /api/v1/learning-goals/import`
- `PUT /api/v1/learning-goals/{id}`
- `DELETE /api/v1/learning-goals/{id}`

Exams (general/siswa)
- `GET /api/v1/exams`
- `GET /api/v1/exams/published` (siswa)
- `POST /api/v1/exams/{id}/self-enroll` (siswa)

Attempts
- `POST /api/v1/attempts/start`
- `POST /api/v1/attempts/token/preview`
- `GET /api/v1/attempts/{id}`
- `GET /api/v1/attempts/{id}/questions/{no}`
- `PUT /api/v1/attempts/{id}/answers/{questionID}`
- `POST /api/v1/attempts/{id}/submit`
- `GET /api/v1/attempts/{id}/result`
- `POST /api/v1/attempts/{id}/events`
- `GET /api/v1/attempts/{id}/events` (admin/proktor/guru)

Exam events (admin/proktor/guru)
- `GET /api/v1/exams/{id}/events`
- `GET /api/v1/exams/{id}/classes/{class_id}/events`

Question Codes (admin/proktor/guru)
- `GET /api/v1/question-codes`
- `POST /api/v1/question-codes`
- `PUT /api/v1/question-codes/{id}`
- `DELETE /api/v1/question-codes/{id}`

Questions & Versions (admin/proktor/guru)
- `POST /api/v1/questions`
- `GET /api/v1/questions`
- `POST /api/v1/questions/export`
- `POST /api/v1/questions/transfer`
- `PUT /api/v1/questions/{id}/code`
- `PUT /api/v1/questions/{id}/learning-goal`
- `POST /api/v1/questions/{id}/versions`
- `PUT /api/v1/questions/{id}/versions/{version}`
- `DELETE /api/v1/questions/{id}/versions/{version}`
- `POST /api/v1/questions/{id}/versions/{version}/finalize`
- `GET /api/v1/questions/{id}/versions`
- `GET /api/v1/questions/{id}/reviews`

Question Parallels (admin/proktor/guru)
- `POST /api/v1/exams/{id}/parallels`
- `GET /api/v1/exams/{id}/parallels`
- `PUT /api/v1/exams/{id}/parallels/{parallelID}`
- `DELETE /api/v1/exams/{id}/parallels/{parallelID}`

Review Tasks (admin/proktor/guru)
- `POST /api/v1/reviews/tasks`
- `POST /api/v1/reviews/tasks/{id}/decision`
- `GET /api/v1/reviews/tasks`

Media
- `POST /api/v1/media/question-images` (admin/proktor/guru)
- `GET /api/v1/media/question-images/*`

## Admin/Proktor/Guru (admin area)

Exams manage
- `GET /api/v1/admin/exams/manage`
- `POST /api/v1/admin/exams`
- `PUT /api/v1/admin/exams/{id}`
- `DELETE /api/v1/admin/exams/{id}`
- `POST /api/v1/admin/exams/{id}/regrade`
- `GET /api/v1/admin/exams/{id}/questions`
- `POST /api/v1/admin/exams/{id}/questions`
- `PUT /api/v1/admin/exams/{id}/questions/{questionID}`
- `DELETE /api/v1/admin/exams/{id}/questions/{questionID}`
- `GET /api/v1/admin/exams/{id}/question-codes`
- `POST /api/v1/admin/exams/{id}/question-codes`
- `DELETE /api/v1/admin/exams/{id}/question-codes/{questionCodeID}`
- `POST /api/v1/admin/exams/{id}/question-codes/sync`
- `PUT /api/v1/admin/exams/{id}/question-incidents`

Assignments & results
- `GET /api/v1/admin/exams/{id}/assignments`
- `PUT /api/v1/admin/exams/{id}/assignments`
- `PUT /api/v1/admin/exams/{id}/assignments/by-class`
- `POST /api/v1/admin/exams/{id}/assignments/by-class/append`
- `DELETE /api/v1/admin/exams/{id}/assignments/{user_id}`
- `GET /api/v1/admin/exams/{id}/results`
- `GET /api/v1/admin/exams/{id}/results/export`
- `DELETE /api/v1/admin/exams/{id}/attempts/{attemptID}`
- `POST /api/v1/admin/exams/{id}/attempts/reset` (admin/proktor only)

Master data
- `GET /api/v1/admin/classes`
- `GET /api/v1/admin/schools`
- `GET /api/v1/admin/users`

## Admin/Proktor only

- `GET /api/v1/admin/dashboard/stats`
- `GET /api/v1/admin/exams`
- `POST /api/v1/admin/exams/{id}/token`
- `POST /api/v1/admin/users/{id}/photo`
- `DELETE /api/v1/admin/users/{id}/photo`
- `PUT /api/v1/admin/users/{id}/class-placement`
- `GET /api/v1/admin/registrations`
- `POST /api/v1/admin/registrations/{id}/approve`
- `POST /api/v1/admin/registrations/{id}/reject`
- `GET /api/v1/admin/audit-logs`
- `POST /api/v1/admin/schools`
- `POST /api/v1/admin/classes`
- `GET /api/v1/admin/imports/classes/template`
- `POST /api/v1/admin/imports/classes`
- `POST /api/v1/admin/imports/students`

## Admin only

- `POST /api/v1/admin/users`
- `PUT /api/v1/admin/users/{id}`
- `DELETE /api/v1/admin/users/{id}`
- `GET /api/v1/admin/users/export`
- `GET /api/v1/admin/users/import-template`
- `POST /api/v1/admin/users/import`
- `PUT /api/v1/admin/schools/{id}`
- `DELETE /api/v1/admin/schools/{id}`
- `PUT /api/v1/admin/classes/{id}`
- `DELETE /api/v1/admin/classes/{id}`
- `POST /api/v1/admin/levels`
- `PUT /api/v1/admin/levels/{id}`
- `DELETE /api/v1/admin/levels/{id}`
