package auth

import "testing"

func TestNormalizeSchoolMatchKey(t *testing.T) {
	t.Parallel()

	cases := []struct {
		in   string
		want string
	}{
		{in: "SMPN2 KOTAGAJAH", want: "smpn2kotagajah"},
		{in: "SMP NEGERI 2 KOTAGAJAH", want: "smpn2kotagajah"},
		{in: "Sekolah Menengah Pertama Negeri 2 Kotagajah", want: "smpn2kotagajah"},
		{in: "10801875", want: "10801875"},
	}

	for _, tc := range cases {
		got := normalizeSchoolMatchKey(tc.in)
		if got != tc.want {
			t.Fatalf("normalizeSchoolMatchKey(%q) = %q, want %q", tc.in, got, tc.want)
		}
	}
}

func TestMatchesScopedSchool(t *testing.T) {
	t.Parallel()

	name := "SMP NEGERI 2 KOTAGAJAH"
	npsn := "10801875"
	reg := RegistrationRecord{
		SchoolName: &name,
		NPSN:       &npsn,
	}

	if !matchesScopedSchool(reg, []scopedSchool{{Code: "69790496", Name: "SMPN2 KOTAGAJAH"}}) {
		t.Fatal("expected normalized school name to match")
	}
	if matchesScopedSchool(reg, []scopedSchool{{Code: "12345678", Name: "SMP Negeri 1 Punggur"}}) {
		t.Fatal("expected unrelated school not to match")
	}
}
