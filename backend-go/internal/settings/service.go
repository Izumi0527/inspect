package settings

import (
	"time"

	"github.com/redis/go-redis/v9"
	"go.uber.org/zap"
	"gorm.io/gorm"

	"github.com/your-org/inspect-system/backend-go/internal/config"
)

type Service struct {
	db           *gorm.DB
	redis        *redis.Client
	cfg          config.Config
	logger       *zap.Logger
	processStart time.Time
}

func NewService(db *gorm.DB, redisClient *redis.Client, cfg config.Config, logger *zap.Logger) *Service {
	return &Service{
		db:           db,
		redis:        redisClient,
		cfg:          cfg,
		logger:       logger,
		processStart: time.Now().UTC(),
	}
}

func (s *Service) isReady() bool {
	return s != nil && s.db != nil
}
