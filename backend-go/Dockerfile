FROM golang:1.23-alpine AS development

WORKDIR /app
RUN apk add --no-cache git ca-certificates

# GOPROXY 指向国内镜像，避免容器内拉取依赖超时（容器不继承宿主机代理/VPN）
ENV GOPROXY=https://goproxy.cn,direct

COPY go.mod go.sum ./
RUN go mod download

COPY . .

# 应用版本注入（权威源：仓库根 VERSION，经 compose build args 传入）。
# development 以 go run 运行、无法走 ldflags，改经 APP_VERSION 环境变量生效（优先级最高）。
# 未传时保持为空：容器内无 VERSION 文件，运行时回退链自动落到编译期兜底值。
ARG APP_VERSION
ENV APP_VERSION=${APP_VERSION}
ENV CGO_ENABLED=0
CMD ["go", "run", "./cmd/api"]

FROM golang:1.23-alpine AS builder

WORKDIR /app
RUN apk add --no-cache git ca-certificates

# GOPROXY 指向国内镜像，避免容器内拉取依赖超时（容器不继承宿主机代理/VPN）
ENV GOPROXY=https://goproxy.cn,direct

COPY go.mod go.sum ./
RUN go mod download

COPY . .

# 应用版本注入：与 build-release.sh / deploy-ubuntu.sh 相同的 ldflags 口径，
# 注入目标 buildInjectedVersion 为空表示「未注入」，运行时回退链自动落到编译期兜底值。
ARG APP_VERSION
ENV CGO_ENABLED=0
RUN go build -ldflags "-s -w -X github.com/your-org/inspect-system/backend-go/internal/config.buildInjectedVersion=${APP_VERSION}" -o /out/inspect-api ./cmd/api

FROM alpine:3.19 AS release

RUN apk add --no-cache ca-certificates
RUN adduser -D -H appuser

WORKDIR /app
COPY --from=builder /out/inspect-api /app/inspect-api
RUN chown -R appuser:appuser /app

USER appuser
EXPOSE 9000

CMD ["/app/inspect-api"]
