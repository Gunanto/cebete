package monitor

import (
	"fmt"
	"os"
	"strings"
)

type Config struct {
	TelegramBotToken string
	TelegramChatID   string
	TZ               string
	StateDir         string
}

func LoadConfigFromEnv() (Config, error) {
	var cfg Config
	cfg.TelegramBotToken = strings.TrimSpace(os.Getenv("TELEGRAM_BOT_TOKEN"))
	if cfg.TelegramBotToken == "" {
		// Backward compatibility with existing scripts.
		cfg.TelegramBotToken = strings.TrimSpace(os.Getenv("BOT_TOKEN"))
	}
	cfg.TelegramChatID = strings.TrimSpace(os.Getenv("TELEGRAM_CHAT_ID"))
	if cfg.TelegramChatID == "" {
		cfg.TelegramChatID = strings.TrimSpace(os.Getenv("CHAT_ID"))
	}

	cfg.TZ = strings.TrimSpace(os.Getenv("TZ"))
	if cfg.TZ == "" {
		cfg.TZ = "Asia/Jakarta"
	}

	cfg.StateDir = strings.TrimSpace(os.Getenv("STATE_DIR"))
	if cfg.StateDir == "" {
		cfg.StateDir = "/tmp/cebete-monitor"
	}

	if cfg.TelegramBotToken == "" {
		return Config{}, fmt.Errorf("TELEGRAM_BOT_TOKEN not set")
	}
	if cfg.TelegramChatID == "" {
		return Config{}, fmt.Errorf("TELEGRAM_CHAT_ID not set")
	}
	return cfg, nil
}
