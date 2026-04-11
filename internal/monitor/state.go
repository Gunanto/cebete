package monitor

import (
	"os"
	"path/filepath"
	"strings"
)

func ensureDir(dir string) error {
	dir = strings.TrimSpace(dir)
	if dir == "" {
		return nil
	}
	return os.MkdirAll(dir, 0o750)
}

func readStateFile(path string) (string, error) {
	b, err := os.ReadFile(path)
	if err != nil {
		return "", err
	}
	return strings.TrimSpace(string(b)), nil
}

func writeStateFileAtomic(dir, name, content string) error {
	if err := ensureDir(dir); err != nil {
		return err
	}
	tmp := filepath.Join(dir, "."+name+".tmp")
	final := filepath.Join(dir, name)
	if err := os.WriteFile(tmp, []byte(content), 0o600); err != nil {
		return err
	}
	return os.Rename(tmp, final)
}
