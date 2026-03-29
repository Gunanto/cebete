package exam

import "testing"

func int64Ptr(v int64) *int64 {
	return &v
}

func TestCountAttemptPages_GroupsOnlyConsecutiveStimulusRefs(t *testing.T) {
	groupA := int64(10)
	groupB := int64(20)
	refs := []examQuestionRef{
		{QuestionID: 1, SeqNo: 1, DisplayNo: 1, StimulusGroupID: int64Ptr(groupA)},
		{QuestionID: 2, SeqNo: 2, DisplayNo: 2, StimulusGroupID: int64Ptr(groupA)},
		{QuestionID: 3, SeqNo: 3, DisplayNo: 3, StimulusGroupID: nil},
		{QuestionID: 4, SeqNo: 4, DisplayNo: 4, StimulusGroupID: int64Ptr(groupB)},
		{QuestionID: 5, SeqNo: 5, DisplayNo: 5, StimulusGroupID: int64Ptr(groupB)},
		{QuestionID: 6, SeqNo: 6, DisplayNo: 6, StimulusGroupID: int64Ptr(groupA)},
	}

	got := countAttemptPages(refs)
	if got != 4 {
		t.Fatalf("expected 4 pages, got %d", got)
	}
}

func TestBuildQuestionRefBlocks_OnlyConsecutiveEqualStimulusAreMerged(t *testing.T) {
	groupA := int64(10)
	groupB := int64(20)
	refs := []examQuestionRef{
		{QuestionID: 1, SeqNo: 1, StimulusGroupID: int64Ptr(groupA)},
		{QuestionID: 2, SeqNo: 2, StimulusGroupID: int64Ptr(groupA)},
		{QuestionID: 3, SeqNo: 3, StimulusGroupID: int64Ptr(groupB)},
		{QuestionID: 4, SeqNo: 4, StimulusGroupID: nil},
		{QuestionID: 5, SeqNo: 5, StimulusGroupID: int64Ptr(groupB)},
	}

	blocks := buildQuestionRefBlocks(refs)
	if len(blocks) != 4 {
		t.Fatalf("expected 4 blocks, got %d", len(blocks))
	}
	if len(blocks[0].refs) != 2 {
		t.Fatalf("expected first block to contain 2 refs, got %d", len(blocks[0].refs))
	}
	if len(blocks[1].refs) != 1 || len(blocks[2].refs) != 1 || len(blocks[3].refs) != 1 {
		t.Fatalf("expected trailing refs to stay separated")
	}
}

func TestShuffleQuestionRefsByAttempt_KeepsStimulusBlocksIntact(t *testing.T) {
	groupA := int64(10)
	groupB := int64(20)
	items := []examQuestionRef{
		{QuestionID: 101, SeqNo: 1, StimulusGroupID: int64Ptr(groupA)},
		{QuestionID: 102, SeqNo: 2, StimulusGroupID: int64Ptr(groupA)},
		{QuestionID: 201, SeqNo: 3, StimulusGroupID: nil},
		{QuestionID: 301, SeqNo: 4, StimulusGroupID: int64Ptr(groupB)},
		{QuestionID: 302, SeqNo: 5, StimulusGroupID: int64Ptr(groupB)},
	}

	got := shuffleQuestionRefsByAttempt(items, 99)
	if len(got) != len(items) {
		t.Fatalf("expected %d refs, got %d", len(items), len(got))
	}

	pos := map[int64]int{}
	for i, ref := range got {
		pos[ref.QuestionID] = i
		if ref.DisplayNo != i+1 {
			t.Fatalf("expected display number %d, got %d", i+1, ref.DisplayNo)
		}
	}
	if abs(pos[101]-pos[102]) != 1 {
		t.Fatalf("expected group A refs to stay adjacent, positions=%v", pos)
	}
	if abs(pos[301]-pos[302]) != 1 {
		t.Fatalf("expected group B refs to stay adjacent, positions=%v", pos)
	}
}

func abs(v int) int {
	if v < 0 {
		return -v
	}
	return v
}
