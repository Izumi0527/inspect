FROM golang:1.23-alpine AS development

WORKDIR /app
RUN apk add --no-cache git ca-certificates

COPY go.mod go.sum ./
RUN go mod download

COPY . .

ENV CGO_ENABLED=0
CMD ["go", "run", "./cmd/api"]

FROM golang:1.23-alpine AS builder

WORKDIR /app
RUN apk add --no-cache git ca-certificates

COPY go.mod go.sum ./
RUN go mod download

COPY . .

ENV CGO_ENABLED=0
RUN go build -o /out/inspect-api ./cmd/api

FROM alpine:3.19 AS release

RUN apk add --no-cache ca-certificates
RUN adduser -D -H appuser

WORKDIR /app
COPY --from=builder /out/inspect-api /app/inspect-api
RUN chown -R appuser:appuser /app

USER appuser
EXPOSE 9000

CMD ["/app/inspect-api"]
