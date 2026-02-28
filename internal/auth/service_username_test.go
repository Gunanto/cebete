package auth

import "testing"

func TestNormalizeUsername(t *testing.T) {
	t.Parallel()

	cases := []struct {
		in   string
		want string
	}{
		{in: "ike a", want: "ikea"},
		{in: "jum'at", want: "jumat"},
		{in: " JuM'at 99 ", want: "jumat99"},
		{in: "a_b-c.d", want: "abcd"},
		{in: "   ", want: ""},
	}

	for _, tc := range cases {
		got := normalizeUsername(tc.in)
		if got != tc.want {
			t.Fatalf("normalizeUsername(%q) = %q, want %q", tc.in, got, tc.want)
		}
	}
}
