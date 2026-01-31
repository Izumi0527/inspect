package logger

import (
	"fmt"
	"os"
	"strings"
	"time"

	"go.uber.org/zap"
	"go.uber.org/zap/zapcore"

	"github.com/your-org/inspect-system/backend-go/internal/config"
)

// ANSI 颜色代码
const (
	ColorReset   = "\033[0m"
	ColorRed     = "\033[31m"
	ColorGreen   = "\033[32m"
	ColorYellow  = "\033[33m"
	ColorBlue    = "\033[34m"
	ColorMagenta = "\033[35m"
	ColorCyan    = "\033[36m"
	ColorWhite   = "\033[37m"
	ColorGray    = "\033[90m"

	// 加粗颜色
	ColorBoldRed    = "\033[1;31m"
	ColorBoldGreen  = "\033[1;32m"
	ColorBoldYellow = "\033[1;33m"
	ColorBoldBlue   = "\033[1;34m"
	ColorBoldCyan   = "\033[1;36m"
)

// coloredLevelEncoder 为日志级别添加颜色
func coloredLevelEncoder(level zapcore.Level, enc zapcore.PrimitiveArrayEncoder) {
	var coloredLevel string
	switch level {
	case zapcore.DebugLevel:
		coloredLevel = fmt.Sprintf("%sDEBUG%s", ColorGray, ColorReset)
	case zapcore.InfoLevel:
		coloredLevel = fmt.Sprintf("%sINFO%s", ColorBoldGreen, ColorReset)
	case zapcore.WarnLevel:
		coloredLevel = fmt.Sprintf("%sWARN%s", ColorBoldYellow, ColorReset)
	case zapcore.ErrorLevel:
		coloredLevel = fmt.Sprintf("%sERROR%s", ColorBoldRed, ColorReset)
	case zapcore.DPanicLevel, zapcore.PanicLevel:
		coloredLevel = fmt.Sprintf("%sPANIC%s", ColorBoldRed, ColorReset)
	case zapcore.FatalLevel:
		coloredLevel = fmt.Sprintf("%sFATAL%s", ColorBoldRed, ColorReset)
	default:
		coloredLevel = level.CapitalString()
	}
	enc.AppendString(coloredLevel)
}

// coloredTimeEncoder 为时间添加颜色
func coloredTimeEncoder(t time.Time, enc zapcore.PrimitiveArrayEncoder) {
	enc.AppendString(fmt.Sprintf("%s%s%s", ColorCyan, t.Format("2006-01-02 15:04:05.000"), ColorReset))
}

// coloredCallerEncoder 为调用者信息添加颜色
func coloredCallerEncoder(caller zapcore.EntryCaller, enc zapcore.PrimitiveArrayEncoder) {
	enc.AppendString(fmt.Sprintf("%s%s%s", ColorMagenta, caller.TrimmedPath(), ColorReset))
}

// coloredNameEncoder 为 logger 名称添加颜色
func coloredNameEncoder(name string, enc zapcore.PrimitiveArrayEncoder) {
	enc.AppendString(fmt.Sprintf("%s[%s]%s", ColorBlue, name, ColorReset))
}

func New(cfg config.Config) (*zap.Logger, error) {
	level := parseLevel(cfg.LogLevel)

	cores := make([]zapcore.Core, 0, 2)

	// 控制台输出 - 使用彩色编码器
	if cfg.LogToConsole {
		consoleEncoder := buildColoredEncoder()
		consoleCore := zapcore.NewCore(consoleEncoder, zapcore.Lock(os.Stdout), level)
		cores = append(cores, consoleCore)
	}

	// 文件输出 - 使用普通编码器（无颜色）
	if strings.TrimSpace(cfg.LogFile) != "" {
		file, err := os.OpenFile(cfg.LogFile, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0o644)
		if err != nil {
			return nil, err
		}
		fileEncoder := buildPlainEncoder(cfg.LogFormat)
		fileCore := zapcore.NewCore(fileEncoder, zapcore.AddSync(file), level)
		cores = append(cores, fileCore)
	}

	if len(cores) == 0 {
		consoleEncoder := buildColoredEncoder()
		cores = append(cores, zapcore.NewCore(consoleEncoder, zapcore.Lock(os.Stdout), level))
	}

	logger := zap.New(
		zapcore.NewTee(cores...),
		zap.AddCaller(),
		zap.AddStacktrace(zapcore.ErrorLevel), // 错误级别自动添加堆栈跟踪
	)
	return logger, nil
}

// buildColoredEncoder 创建彩色控制台编码器
func buildColoredEncoder() zapcore.Encoder {
	cfg := zapcore.EncoderConfig{
		TimeKey:        "time",
		LevelKey:       "level",
		NameKey:        "logger",
		CallerKey:      "caller",
		FunctionKey:    zapcore.OmitKey,
		MessageKey:     "msg",
		StacktraceKey:  "stacktrace",
		LineEnding:     zapcore.DefaultLineEnding,
		EncodeLevel:    coloredLevelEncoder,
		EncodeTime:     coloredTimeEncoder,
		EncodeDuration: zapcore.StringDurationEncoder,
		EncodeCaller:   coloredCallerEncoder,
		EncodeName:     coloredNameEncoder,
		ConsoleSeparator: " | ",
	}
	return zapcore.NewConsoleEncoder(cfg)
}

// buildPlainEncoder 创建普通编码器（用于文件输出）
func buildPlainEncoder(format string) zapcore.Encoder {
	cfg := zap.NewProductionEncoderConfig()
	cfg.EncodeTime = zapcore.ISO8601TimeEncoder
	cfg.EncodeLevel = zapcore.CapitalLevelEncoder

	if strings.EqualFold(format, "json") {
		return zapcore.NewJSONEncoder(cfg)
	}

	return zapcore.NewConsoleEncoder(cfg)
}

func parseLevel(level string) zapcore.Level {
	switch strings.ToLower(strings.TrimSpace(level)) {
	case "debug":
		return zapcore.DebugLevel
	case "warn", "warning":
		return zapcore.WarnLevel
	case "error":
		return zapcore.ErrorLevel
	default:
		return zapcore.InfoLevel
	}
}

// LogError 辅助函数：记录错误并返回
func LogError(logger *zap.Logger, msg string, err error, fields ...zap.Field) error {
	allFields := append([]zap.Field{zap.Error(err)}, fields...)
	logger.Error(msg, allFields...)
	return err
}

// LogWarn 辅助函数：记录警告
func LogWarn(logger *zap.Logger, msg string, fields ...zap.Field) {
	logger.Warn(msg, fields...)
}

// LogInfo 辅助函数：记录信息
func LogInfo(logger *zap.Logger, msg string, fields ...zap.Field) {
	logger.Info(msg, fields...)
}

// LogDebug 辅助函数：记录调试信息
func LogDebug(logger *zap.Logger, msg string, fields ...zap.Field) {
	logger.Debug(msg, fields...)
}

// PrintBanner 打印启动横幅
func PrintBanner(version, env string) {
	banner := fmt.Sprintf(`
%s╔══════════════════════════════════════════════════════════════╗
║                                                              ║
║   %s██╗███╗   ██╗███████╗██████╗ ███████╗ ██████╗████████╗%s      ║
║   %s██║████╗  ██║██╔════╝██╔══██╗██╔════╝██╔════╝╚══██╔══╝%s      ║
║   %s██║██╔██╗ ██║███████╗██████╔╝█████╗  ██║        ██║%s         ║
║   %s██║██║╚██╗██║╚════██║██╔═══╝ ██╔══╝  ██║        ██║%s         ║
║   %s██║██║ ╚████║███████║██║     ███████╗╚██████╗   ██║%s         ║
║   %s╚═╝╚═╝  ╚═══╝╚══════╝╚═╝     ╚══════╝ ╚═════╝   ╚═╝%s         ║
║                                                              ║
║   %s巡检系统 Backend API Server%s                                 ║
║   %sVersion: %-10s  Environment: %-10s%s                  ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝%s
`,
		ColorBoldCyan,
		ColorBoldGreen, ColorBoldCyan,
		ColorBoldGreen, ColorBoldCyan,
		ColorBoldGreen, ColorBoldCyan,
		ColorBoldGreen, ColorBoldCyan,
		ColorBoldGreen, ColorBoldCyan,
		ColorBoldGreen, ColorBoldCyan,
		ColorBoldYellow, ColorBoldCyan,
		ColorGray, version, env, ColorBoldCyan,
		ColorReset,
	)
	fmt.Println(banner)
}

// PrintStartupInfo 打印启动信息
func PrintStartupInfo(logger *zap.Logger, port int, env string) {
	logger.Info("🚀 Server starting",
		zap.Int("port", port),
		zap.String("environment", env),
	)
}

// PrintShutdownInfo 打印关闭信息
func PrintShutdownInfo(logger *zap.Logger) {
	logger.Info("👋 Server shutting down gracefully...")
}
