package auth

import (
	"context"
	"crypto/tls"
	"fmt"
	"net"
	"net/smtp"
	"strings"
)

type OTPMailer interface {
	SendOTP(ctx context.Context, email, code string) error
	SendFirstLoginLink(ctx context.Context, email, loginURL string) error
}

type SMTPMailer struct {
	host     string
	port     int
	user     string
	pass     string
	from     string
	startTLS bool
}

type SMTPConfig struct {
	Host     string
	Port     int
	User     string
	Pass     string
	From     string
	StartTLS bool
}

func NewSMTPMailer(cfg SMTPConfig) OTPMailer {
	if strings.TrimSpace(cfg.Host) == "" || cfg.Port <= 0 || strings.TrimSpace(cfg.From) == "" {
		return nil
	}
	return &SMTPMailer{
		host:     strings.TrimSpace(cfg.Host),
		port:     cfg.Port,
		user:     strings.TrimSpace(cfg.User),
		pass:     cfg.Pass,
		from:     strings.TrimSpace(cfg.From),
		startTLS: cfg.StartTLS,
	}
}

func (m *SMTPMailer) SendOTP(ctx context.Context, email, code string) error {
	subject := "Kode OTP Login CBT LMS"
	body := fmt.Sprintf("Kode OTP Anda: %s\nBerlaku 5 menit. Jangan bagikan kode ini.", code)
	return m.sendMail(ctx, email, subject, body)
}

func (m *SMTPMailer) SendFirstLoginLink(ctx context.Context, email, loginURL string) error {
	subject := "Akun Non-Reguler Anda Sudah Disetujui"
	body := fmt.Sprintf(
		"Akun Anda sudah disetujui.\nKlik tautan berikut untuk login pertama tanpa OTP tambahan:\n%s\n\nTautan ini hanya berlaku sekali dan akan kedaluwarsa dalam 30 menit.",
		strings.TrimSpace(loginURL),
	)
	return m.sendMail(ctx, email, subject, body)
}

func (m *SMTPMailer) sendMail(ctx context.Context, email, subject, body string) error {
	addr := fmt.Sprintf("%s:%d", m.host, m.port)
	msg := "From: " + m.from + "\r\n" +
		"To: " + email + "\r\n" +
		"Subject: " + subject + "\r\n" +
		"MIME-Version: 1.0\r\n" +
		"Content-Type: text/plain; charset=UTF-8\r\n\r\n" +
		body + "\r\n"

	var auth smtp.Auth
	if m.user != "" {
		auth = smtp.PlainAuth("", m.user, m.pass, m.host)
	}

	dialer := &net.Dialer{}
	conn, err := dialer.DialContext(ctx, "tcp", addr)
	if err != nil {
		return fmt.Errorf("smtp dial: %w", err)
	}
	defer conn.Close()

	client, err := smtp.NewClient(conn, m.host)
	if err != nil {
		return fmt.Errorf("smtp client: %w", err)
	}
	defer client.Close()

	if m.startTLS {
		ok, _ := client.Extension("STARTTLS")
		if !ok {
			return fmt.Errorf("smtp starttls: server does not support STARTTLS")
		}
		if err := client.StartTLS(&tls.Config{ServerName: m.host, MinVersion: tls.VersionTLS12}); err != nil {
			return fmt.Errorf("smtp starttls: %w", err)
		}
	}

	if auth != nil {
		if err := client.Auth(auth); err != nil {
			return fmt.Errorf("smtp auth: %w", err)
		}
	}
	if err := client.Mail(m.from); err != nil {
		return fmt.Errorf("smtp mail from: %w", err)
	}
	if err := client.Rcpt(email); err != nil {
		return fmt.Errorf("smtp rcpt to: %w", err)
	}
	wc, err := client.Data()
	if err != nil {
		return fmt.Errorf("smtp data: %w", err)
	}
	if _, err := wc.Write([]byte(msg)); err != nil {
		_ = wc.Close()
		return fmt.Errorf("smtp write body: %w", err)
	}
	if err := wc.Close(); err != nil {
		return fmt.Errorf("smtp close body: %w", err)
	}
	if err := client.Quit(); err != nil {
		return fmt.Errorf("smtp quit: %w", err)
	}
	return nil
}
