package monitor

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strings"
	"time"
)

type WatchSSHOptions struct {
	JournalUnit string
	StateDir    string
	Location    *time.Location
	Notifier    Notifier
}

var sshAcceptedRe = regexp.MustCompile(`\bAccepted\s+(?P<auth>\S+)\s+for\s+(?P<user>\S+)\s+from\s+(?P<ip>\S+)\b`)

func WatchSSHLogins(ctx context.Context, opts WatchSSHOptions) error {
	if opts.Location == nil {
		opts.Location = time.Local
	}
	if opts.Notifier == nil {
		return fmt.Errorf("Notifier is required")
	}
	unit := strings.TrimSpace(opts.JournalUnit)
	if unit == "" {
		unit = "ssh.service"
	}

	cursorPath := filepath.Join(strings.TrimSpace(opts.StateDir), "ssh.journal.cursor")
	afterCursor := ""
	if v, err := readStateFile(cursorPath); err == nil {
		afterCursor = v
	}

	args := []string{"journalctl", "-u", unit, "-o", "json", "-f", "-n", "0"}
	if afterCursor != "" {
		args = append(args, "--after-cursor", afterCursor)
	}

	cmd := exec.CommandContext(ctx, args[0], args[1:]...)
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return fmt.Errorf("journalctl stdout: %w", err)
	}
	stderr, err := cmd.StderrPipe()
	if err != nil {
		return fmt.Errorf("journalctl stderr: %w", err)
	}

	if err := cmd.Start(); err != nil {
		return fmt.Errorf("start journalctl: %w", err)
	}
	defer func() { _ = cmd.Process.Kill() }()

	// If journalctl fails (e.g. permission denied), surface stderr.
	stderrCh := make(chan string, 1)
	go func() {
		s := bufio.NewScanner(stderr)
		var lines []string
		for s.Scan() {
			lines = append(lines, s.Text())
			if len(lines) >= 5 {
				break
			}
		}
		if len(lines) > 0 {
			stderrCh <- strings.Join(lines, "\n")
		}
		close(stderrCh)
	}()

	sc := bufio.NewScanner(stdout)
	sc.Buffer(make([]byte, 0, 64*1024), 1024*1024)
	var lastKey string
	var lastSent time.Time
	for sc.Scan() {
		line := strings.TrimSpace(sc.Text())
		if line == "" {
			continue
		}

		var rec map[string]any
		if err := json.Unmarshal([]byte(line), &rec); err != nil {
			continue
		}

		msg, _ := rec["MESSAGE"].(string)
		msg = strings.TrimSpace(msg)
		if msg == "" {
			continue
		}

		m := sshAcceptedRe.FindStringSubmatch(msg)
		if m == nil {
			continue
		}

		auth := ""
		user := ""
		ip := ""
		for i, name := range sshAcceptedRe.SubexpNames() {
			if i == 0 || name == "" {
				continue
			}
			switch name {
			case "auth":
				auth = m[i]
			case "user":
				user = m[i]
			case "ip":
				ip = m[i]
			}
		}

		ts := time.Now().In(opts.Location)
		if raw, ok := rec["__REALTIME_TIMESTAMP"].(string); ok && raw != "" {
			if micros, err := parseJournalRealtimeMicros(raw); err == nil {
				ts = time.Unix(0, micros*int64(time.Microsecond)).In(opts.Location)
			}
		}

		key := user + "|" + ip + "|" + auth
		// Small de-dupe window in case journal repeats lines during restart.
		if key == lastKey && time.Since(lastSent) < 20*time.Second {
			continue
		}

		text := fmt.Sprintf("SSH LOGIN [%s WIB] user=%s ip=%s auth=%s",
			ts.Format("2006-01-02 15:04:05"), user, ip, auth,
		)
		sendCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
		err := opts.Notifier.SendText(sendCtx, text)
		cancel()
		if err != nil {
			// Don't crash on transient Telegram failures; keep watching.
			fmt.Fprintln(os.Stderr, "telegram send error:", err)
		} else {
			lastKey = key
			lastSent = time.Now()
		}

		if cur, _ := rec["__CURSOR"].(string); strings.TrimSpace(cur) != "" {
			_ = writeStateFileAtomic(strings.TrimSpace(opts.StateDir), "ssh.journal.cursor", strings.TrimSpace(cur))
		}
	}

	if err := sc.Err(); err != nil {
		if s, ok := <-stderrCh; ok && strings.TrimSpace(s) != "" {
			return fmt.Errorf("journalctl scan: %w: %s", err, s)
		}
		return fmt.Errorf("journalctl scan: %w", err)
	}

	if err := cmd.Wait(); err != nil {
		if s, ok := <-stderrCh; ok && strings.TrimSpace(s) != "" {
			return fmt.Errorf("journalctl exit: %w: %s", err, s)
		}
		return fmt.Errorf("journalctl exit: %w", err)
	}
	return nil
}

func parseJournalRealtimeMicros(s string) (int64, error) {
	// journald stores microseconds since epoch as a decimal string.
	s = strings.TrimSpace(s)
	if s == "" {
		return 0, fmt.Errorf("empty")
	}
	var out int64
	for _, r := range s {
		if r < '0' || r > '9' {
			return 0, fmt.Errorf("non-digit")
		}
		out = out*10 + int64(r-'0')
	}
	return out, nil
}
