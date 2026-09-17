package devices_test

import (
	"testing"
	_ "unsafe"
)

// decodePingOutput 把 ping 命令的原始输出转成 UTF-8 文本。
//
//go:linkname decodePingOutput github.com/your-org/inspect-system/backend-go/internal/devices.decodePingOutput
func decodePingOutput(output []byte) string

// Windows 的 ping 按控制台代码页（中文系统为 GBK）输出，直接当 UTF-8 用会在探测
// 失败原因里出现乱码；Linux/英文系统输出本就是合法 UTF-8，必须原样返回不能重复解码。
func TestDecodePingOutput(t *testing.T) {
	t.Run("合法 UTF-8 原样返回", func(t *testing.T) {
		in := "PING 10.0.0.1: 请求超时"
		if got := decodePingOutput([]byte(in)); got != in {
			t.Fatalf("got %q, want %q", got, in)
		}
	})

	t.Run("GBK 字节按 GBK 解码", func(t *testing.T) {
		// "请求超时" 的 GBK 编码
		gbk := []byte{0xc7, 0xeb, 0xc7, 0xf3, 0xb3, 0xac, 0xca, 0xb1}
		if got := decodePingOutput(gbk); got != "请求超时" {
			t.Fatalf("got %q, want %q", got, "请求超时")
		}
	})
}
