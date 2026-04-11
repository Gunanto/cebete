package main

import (
	"context"
	"fmt"
	"os"
	"strconv"
	"strings"
	"time"

	"cbtlms/internal/db"
	"cbtlms/internal/monitor"
)

func usage() {
	fmt.Fprintf(os.Stderr, `cebete-monitor

Usage:
  cebete-monitor watch-ssh
  cebete-monitor daily-exam-summary

Env (common):
  TELEGRAM_BOT_TOKEN   (required)
  TELEGRAM_CHAT_ID     (required)
  TZ                   (default: Asia/Jakarta)
  STATE_DIR            (default: /tmp/cebete-monitor)

Env (watch-ssh):
  SSH_JOURNAL_UNIT     (default: ssh.service)

Env (daily-exam-summary):
  CBTLMS_DSN           (required) e.g. postgres://user:pass@127.0.0.1:5432/cbtlms?sslmode=disable
  RECONNECT_ANOMALY_THRESHOLD (default: 10)
`)
}

func main() {
	cmd := ""
	if len(os.Args) >= 2 {
		cmd = strings.TrimSpace(os.Args[1])
	}
	if cmd == "" || cmd == "-h" || cmd == "--help" || cmd == "help" {
		usage()
		os.Exit(2)
	}

	cfg, err := monitor.LoadConfigFromEnv()
	if err != nil {
		fmt.Fprintf(os.Stderr, "config error: %v\n", err)
		os.Exit(2)
	}

	loc, err := time.LoadLocation(cfg.TZ)
	if err != nil {
		fmt.Fprintf(os.Stderr, "invalid TZ %q: %v\n", cfg.TZ, err)
		os.Exit(2)
	}

	ctx := context.Background()
	notif := monitor.NewTelegramNotifier(cfg.TelegramBotToken, cfg.TelegramChatID)

	switch cmd {
	case "watch-ssh":
		unit := strings.TrimSpace(os.Getenv("SSH_JOURNAL_UNIT"))
		if unit == "" {
			unit = "ssh.service"
		}
		opts := monitor.WatchSSHOptions{
			JournalUnit: unit,
			StateDir:    cfg.StateDir,
			Location:    loc,
			Notifier:    notif,
		}
		if err := monitor.WatchSSHLogins(ctx, opts); err != nil {
			fmt.Fprintf(os.Stderr, "watch-ssh error: %v\n", err)
			os.Exit(1)
		}
		return

	case "daily-exam-summary":
		dsn := strings.TrimSpace(os.Getenv("CBTLMS_DSN"))
		if dsn == "" {
			fmt.Fprintln(os.Stderr, "CBTLMS_DSN is required for daily-exam-summary")
			os.Exit(2)
		}
		thr := 10
		if v := strings.TrimSpace(os.Getenv("RECONNECT_ANOMALY_THRESHOLD")); v != "" {
			n, err := strconv.Atoi(v)
			if err != nil || n < 0 {
				fmt.Fprintf(os.Stderr, "invalid RECONNECT_ANOMALY_THRESHOLD=%q\n", v)
				os.Exit(2)
			}
			thr = n
		}

		dbCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
		defer cancel()
		conn, err := db.OpenPostgres(dbCtx, dsn)
		if err != nil {
			fmt.Fprintf(os.Stderr, "open db: %v\n", err)
			os.Exit(1)
		}
		defer conn.Close()

		opts := monitor.DailyExamSummaryOptions{
			DB:                         conn,
			Location:                   loc,
			StateDir:                   cfg.StateDir,
			ReconnectAnomalyThreshold:  thr,
			Notifier:                   notif,
			IncludeTopScoreStudentInfo: true,
		}
		if err := monitor.SendDailyExamSummary(ctx, opts); err != nil {
			fmt.Fprintf(os.Stderr, "daily-exam-summary error: %v\n", err)
			os.Exit(1)
		}
		return

	default:
		usage()
		os.Exit(2)
	}
}
