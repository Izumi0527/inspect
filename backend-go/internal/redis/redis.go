package redis

import (
    "context"

    "github.com/redis/go-redis/v9"

    "github.com/your-org/inspect-system/backend-go/internal/config"
)

func NewClient(cfg config.Config) (*redis.Client, error) {
    opts, err := redis.ParseURL(cfg.RedisURL)
    if err != nil {
        return nil, err
    }

    client := redis.NewClient(opts)
    if err := client.Ping(context.Background()).Err(); err != nil {
        return nil, err
    }

    return client, nil
}
