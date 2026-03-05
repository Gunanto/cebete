package media

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"net/http"
	"path"
	"strings"
	"time"

	"github.com/minio/minio-go/v7"
	"github.com/minio/minio-go/v7/pkg/credentials"
)

const QuestionImageMaxBytes = 2 * 1024 * 1024

var (
	ErrMediaUnavailable       = errors.New("media service unavailable")
	ErrInvalidInput           = errors.New("invalid input")
	ErrUnsupportedContentType = errors.New("unsupported content type")
	ErrObjectNotFound         = errors.New("object not found")
)

type ServiceConfig struct {
	Endpoint  string
	AccessKey string
	SecretKey string
	UseSSL    bool
	Bucket    string
	Region    string
}

type UploadResult struct {
	Key         string `json:"key"`
	URL         string `json:"url"`
	ContentType string `json:"content_type"`
	Size        int64  `json:"size"`
}

type ObjectResult struct {
	ContentType string
	Size        int64
	Reader      io.ReadCloser
}

type Service struct {
	client  *minio.Client
	bucket  string
	enabled bool
}

func NewDisabledService() *Service {
	return &Service{enabled: false}
}

func NewService(cfg ServiceConfig) (*Service, error) {
	if strings.TrimSpace(cfg.Bucket) == "" {
		cfg.Bucket = "cbtlms-question-media"
	}
	if strings.TrimSpace(cfg.Region) == "" {
		cfg.Region = "us-east-1"
	}
	if strings.TrimSpace(cfg.Endpoint) == "" || strings.TrimSpace(cfg.AccessKey) == "" || strings.TrimSpace(cfg.SecretKey) == "" {
		return NewDisabledService(), nil
	}

	client, err := minio.New(strings.TrimSpace(cfg.Endpoint), &minio.Options{
		Creds:  credentials.NewStaticV4(strings.TrimSpace(cfg.AccessKey), strings.TrimSpace(cfg.SecretKey), ""),
		Secure: cfg.UseSSL,
		Region: cfg.Region,
	})
	if err != nil {
		return nil, err
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	exists, err := client.BucketExists(ctx, cfg.Bucket)
	if err != nil {
		return nil, err
	}
	if !exists {
		if err := client.MakeBucket(ctx, cfg.Bucket, minio.MakeBucketOptions{Region: cfg.Region}); err != nil {
			return nil, err
		}
	}

	return &Service{
		client:  client,
		bucket:  cfg.Bucket,
		enabled: true,
	}, nil
}

func DetectImageType(raw []byte) (contentType string, ext string, err error) {
	if len(raw) == 0 {
		return "", "", ErrInvalidInput
	}
	contentType = http.DetectContentType(raw)
	switch contentType {
	case "image/jpeg":
		return contentType, ".jpg", nil
	case "image/png":
		return contentType, ".png", nil
	case "image/webp":
		return contentType, ".webp", nil
	default:
		return "", "", ErrUnsupportedContentType
	}
}

func (s *Service) UploadQuestionImage(ctx context.Context, raw []byte, contentType, ext string) (*UploadResult, error) {
	if s == nil || !s.enabled || s.client == nil {
		return nil, ErrMediaUnavailable
	}
	if len(raw) == 0 || strings.TrimSpace(contentType) == "" || strings.TrimSpace(ext) == "" {
		return nil, ErrInvalidInput
	}
	if len(raw) > QuestionImageMaxBytes {
		return nil, ErrInvalidInput
	}

	key := "question-images/" + randomID() + ext
	reader := bytes.NewReader(raw)
	_, err := s.client.PutObject(ctx, s.bucket, key, reader, int64(len(raw)), minio.PutObjectOptions{
		ContentType: contentType,
	})
	if err != nil {
		return nil, err
	}

	return &UploadResult{
		Key:         key,
		URL:         "/api/v1/media/question-images/" + key,
		ContentType: contentType,
		Size:        int64(len(raw)),
	}, nil
}

func (s *Service) DownloadQuestionImage(ctx context.Context, key string) (*ObjectResult, error) {
	if s == nil || !s.enabled || s.client == nil {
		return nil, ErrMediaUnavailable
	}

	key = normalizeObjectKey(key)
	if key == "" {
		return nil, ErrInvalidInput
	}

	stat, err := s.client.StatObject(ctx, s.bucket, key, minio.StatObjectOptions{})
	if err != nil {
		resp := minio.ToErrorResponse(err)
		if resp.Code == "NoSuchKey" || resp.Code == "NoSuchObject" || resp.StatusCode == http.StatusNotFound {
			return nil, ErrObjectNotFound
		}
		return nil, err
	}

	obj, err := s.client.GetObject(ctx, s.bucket, key, minio.GetObjectOptions{})
	if err != nil {
		resp := minio.ToErrorResponse(err)
		if resp.Code == "NoSuchKey" || resp.Code == "NoSuchObject" || resp.StatusCode == http.StatusNotFound {
			return nil, ErrObjectNotFound
		}
		return nil, err
	}

	return &ObjectResult{
		ContentType: strings.TrimSpace(stat.ContentType),
		Size:        stat.Size,
		Reader:      obj,
	}, nil
}

func normalizeObjectKey(key string) string {
	trimmed := strings.TrimSpace(key)
	trimmed = strings.TrimPrefix(trimmed, "/")
	trimmed = path.Clean(trimmed)
	if trimmed == "." || trimmed == "" {
		return ""
	}
	if strings.Contains(trimmed, "..") || strings.Contains(trimmed, "\\") {
		return ""
	}
	if !strings.HasPrefix(trimmed, "question-images/") {
		return ""
	}
	return trimmed
}

func randomID() string {
	var b [16]byte
	if _, err := rand.Read(b[:]); err != nil {
		return fmt.Sprintf("%d", time.Now().UnixNano())
	}
	return hex.EncodeToString(b[:])
}
