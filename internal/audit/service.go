package audit

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"strings"
	"time"
)

type Service struct {
	db *sql.DB
}

type AuditLog struct {
	ID         int64           `json:"id"`
	UserID     *int64          `json:"user_id,omitempty"`
	UserName   *string         `json:"user_name,omitempty"`
	UserRole   *string         `json:"user_role,omitempty"`
	Action     string          `json:"action"`
	EntityType *string         `json:"entity_type,omitempty"`
	EntityID   *string         `json:"entity_id,omitempty"`
	Payload    json.RawMessage `json:"payload"`
	CreatedAt  time.Time       `json:"created_at"`
}

type ListAuditInput struct {
	Action     string
	EntityType string
	EntityID   string
	UserID     int64
	Limit      int
	Offset     int
}

func NewService(db *sql.DB) *Service {
	return &Service{db: db}
}

func (s *Service) ListAuditLogs(ctx context.Context, in ListAuditInput) ([]AuditLog, error) {
	if in.Limit <= 0 {
		in.Limit = 50
	}
	if in.Limit > 200 {
		in.Limit = 200
	}
	if in.Offset < 0 {
		in.Offset = 0
	}
	in.Action = strings.TrimSpace(in.Action)
	in.EntityType = strings.TrimSpace(in.EntityType)
	in.EntityID = strings.TrimSpace(in.EntityID)

	var b strings.Builder
	args := make([]any, 0, 6)
	b.WriteString(`
    SELECT al.id, al.user_id, u.full_name, u.role, al.action, al.entity_type, al.entity_id, al.payload, al.created_at
    FROM audit_logs al
    LEFT JOIN users u ON u.id = al.user_id
    WHERE 1=1
  `)
	if in.Action != "" {
		args = append(args, in.Action)
		b.WriteString(fmt.Sprintf(" AND al.action = $%d", len(args)))
	}
	if in.EntityType != "" {
		args = append(args, in.EntityType)
		b.WriteString(fmt.Sprintf(" AND al.entity_type = $%d", len(args)))
	}
	if in.EntityID != "" {
		args = append(args, in.EntityID)
		b.WriteString(fmt.Sprintf(" AND al.entity_id = $%d", len(args)))
	}
	if in.UserID > 0 {
		args = append(args, in.UserID)
		b.WriteString(fmt.Sprintf(" AND al.user_id = $%d", len(args)))
	}
	args = append(args, in.Limit)
	b.WriteString(fmt.Sprintf(" ORDER BY al.id DESC LIMIT $%d", len(args)))
	args = append(args, in.Offset)
	b.WriteString(fmt.Sprintf(" OFFSET $%d", len(args)))

	rows, err := s.db.QueryContext(ctx, b.String(), args...)
	if err != nil {
		return nil, fmt.Errorf("query audit logs: %w", err)
	}
	defer rows.Close()

	out := make([]AuditLog, 0)
	for rows.Next() {
		var item AuditLog
		var userID sql.NullInt64
		var userName sql.NullString
		var userRole sql.NullString
		var entityType sql.NullString
		var entityID sql.NullString
		if err := rows.Scan(
			&item.ID,
			&userID,
			&userName,
			&userRole,
			&item.Action,
			&entityType,
			&entityID,
			&item.Payload,
			&item.CreatedAt,
		); err != nil {
			return nil, fmt.Errorf("scan audit log: %w", err)
		}
		if userID.Valid {
			item.UserID = &userID.Int64
		}
		if userName.Valid {
			v := userName.String
			item.UserName = &v
		}
		if userRole.Valid {
			v := userRole.String
			item.UserRole = &v
		}
		if entityType.Valid {
			v := entityType.String
			item.EntityType = &v
		}
		if entityID.Valid {
			v := entityID.String
			item.EntityID = &v
		}
		if len(item.Payload) == 0 {
			item.Payload = json.RawMessage(`{}`)
		}
		out = append(out, item)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate audit logs: %w", err)
	}
	return out, nil
}
