package exam

import (
	"testing"
	"time"
)

func TestCanViewResultByPolicy(t *testing.T) {
	now := time.Now()
	past := now.Add(-time.Minute)
	future := now.Add(time.Minute)

	tests := []struct {
		name        string
		policy      string
		status      string
		examEndAt   *time.Time
		expectAllow bool
	}{
		{name: "after_submit submitted", policy: "after_submit", status: "submitted", expectAllow: true},
		{name: "after_submit in_progress", policy: "after_submit", status: "in_progress", expectAllow: false},
		{name: "after_exam_end before_end", policy: "after_exam_end", status: "submitted", examEndAt: &future, expectAllow: false},
		{name: "after_exam_end after_end", policy: "after_exam_end", status: "submitted", examEndAt: &past, expectAllow: true},
		{name: "after_exam_end no_end", policy: "after_exam_end", status: "submitted", examEndAt: nil, expectAllow: false},
		{name: "score_only finalized", policy: "score_only", status: "submitted", expectAllow: true},
		{name: "immediate finalized", policy: "immediate", status: "expired", expectAllow: true},
		{name: "disabled finalized", policy: "disabled", status: "submitted", expectAllow: false},
		{name: "unknown policy fallback", policy: "other", status: "submitted", expectAllow: true},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got := canViewResultByPolicy(tc.policy, tc.status, tc.examEndAt)
			if got != tc.expectAllow {
				t.Fatalf("expected %v, got %v", tc.expectAllow, got)
			}
		})
	}
}

func TestCanStudentSeePublishedExam(t *testing.T) {
	tests := []struct {
		name            string
		hasAssignment   bool
		isNonRegular    bool
		allowNonRegular bool
		expectVisible   bool
	}{
		{name: "assigned regular visible", hasAssignment: true, isNonRegular: false, allowNonRegular: false, expectVisible: true},
		{name: "assigned non regular visible", hasAssignment: true, isNonRegular: true, allowNonRegular: false, expectVisible: true},
		{name: "non regular allowed visible", hasAssignment: false, isNonRegular: true, allowNonRegular: true, expectVisible: true},
		{name: "non regular not allowed hidden", hasAssignment: false, isNonRegular: true, allowNonRegular: false, expectVisible: false},
		{name: "regular not assigned hidden", hasAssignment: false, isNonRegular: false, allowNonRegular: true, expectVisible: false},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got := canStudentSeePublishedExam(tc.hasAssignment, tc.isNonRegular, tc.allowNonRegular)
			if got != tc.expectVisible {
				t.Fatalf("expected %v, got %v", tc.expectVisible, got)
			}
		})
	}
}

func TestCanStudentSelfEnrollExam(t *testing.T) {
	tests := []struct {
		name            string
		hasAssignment   bool
		isNonRegular    bool
		allowNonRegular bool
		expectAllowed   bool
	}{
		{name: "assigned regular allowed", hasAssignment: true, isNonRegular: false, allowNonRegular: false, expectAllowed: true},
		{name: "assigned non regular allowed", hasAssignment: true, isNonRegular: true, allowNonRegular: false, expectAllowed: true},
		{name: "legacy regular preserved", hasAssignment: false, isNonRegular: false, allowNonRegular: false, expectAllowed: true},
		{name: "non regular allowed by exam flag", hasAssignment: false, isNonRegular: true, allowNonRegular: true, expectAllowed: true},
		{name: "non regular blocked without flag", hasAssignment: false, isNonRegular: true, allowNonRegular: false, expectAllowed: false},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got := canStudentSelfEnrollExam(tc.hasAssignment, tc.isNonRegular, tc.allowNonRegular)
			if got != tc.expectAllowed {
				t.Fatalf("expected %v, got %v", tc.expectAllowed, got)
			}
		})
	}
}
