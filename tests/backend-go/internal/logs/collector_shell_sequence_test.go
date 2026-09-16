package logs_test

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"strings"
	"sync"
	"testing"
	"time"
	_ "unsafe"

	_ "github.com/your-org/inspect-system/backend-go/internal/logs"
)

// 会话内多命令顺序契约（任务 D1）：同一个 shell 里顺序执行多条命令，
// 读到第 i 条命令的结束标记后才发第 i+1 条，输出按命令切分；
// 某条命令的标记始终读不到（例如被分页提示吞掉）时，后续命令不再发送、其输出段为空，但不报错。

//go:linkname runShellCommands github.com/your-org/inspect-system/backend-go/internal/logs.runShellCommands
func runShellCommands(ctx context.Context, stdin io.WriteCloser, stdout io.Reader, commands []string) ([]string, error)

//go:linkname shellReadyDelay github.com/your-org/inspect-system/backend-go/internal/logs.shellReadyDelay
var shellReadyDelay time.Duration

//go:linkname commandSettleDelay github.com/your-org/inspect-system/backend-go/internal/logs.commandSettleDelay
var commandSettleDelay time.Duration

//go:linkname sessionExitDelay github.com/your-org/inspect-system/backend-go/internal/logs.sessionExitDelay
var sessionExitDelay time.Duration

//go:linkname commandReadTimeout github.com/your-org/inspect-system/backend-go/internal/logs.commandReadTimeout
var commandReadTimeout time.Duration

// fakeShell 模拟网络设备的交互 shell：回显每一行输入（结束标记正是靠这个回显被读到），
// 命中命令表的行再吐出预置输出；swallow 中的行被"分页器"吞掉，不回显。
type fakeShell struct {
	mu       sync.Mutex
	received []string
	outputs  map[string]string
	swallow  map[string]bool
	pending  bytes.Buffer
	pw       *io.PipeWriter
}

func newFakeShell(outputs map[string]string, swallow ...string) (*fakeShell, io.Reader) {
	pr, pw := io.Pipe()
	shell := &fakeShell{outputs: outputs, swallow: map[string]bool{}, pw: pw}
	for _, line := range swallow {
		shell.swallow[line] = true
	}
	return shell, pr
}

func (f *fakeShell) Write(p []byte) (int, error) {
	f.pending.Write(p)
	for {
		raw := f.pending.String()
		idx := strings.IndexByte(raw, '\n')
		if idx < 0 {
			break
		}
		line := raw[:idx]
		f.pending.Next(idx + 1)
		f.handle(line)
	}
	return len(p), nil
}

func (f *fakeShell) Close() error { return nil }

func (f *fakeShell) handle(line string) {
	f.mu.Lock()
	f.received = append(f.received, line)
	f.mu.Unlock()
	if f.swallow[line] {
		return
	}
	fmt.Fprintf(f.pw, "%s\n", line)
	if out, ok := f.outputs[line]; ok {
		fmt.Fprint(f.pw, out)
	}
	if line == "exit" {
		_ = f.pw.Close()
	}
}

func (f *fakeShell) lines() []string {
	f.mu.Lock()
	defer f.mu.Unlock()
	return append([]string(nil), f.received...)
}

func fastShellTiming(t *testing.T) {
	t.Helper()
	prev := []time.Duration{shellReadyDelay, commandSettleDelay, sessionExitDelay, commandReadTimeout}
	shellReadyDelay, commandSettleDelay, sessionExitDelay, commandReadTimeout =
		10*time.Millisecond, 10*time.Millisecond, 10*time.Millisecond, 300*time.Millisecond
	t.Cleanup(func() {
		shellReadyDelay, commandSettleDelay, sessionExitDelay, commandReadTimeout = prev[0], prev[1], prev[2], prev[3]
	})
}

// runGuarded 给被测调用加 3 秒守卫：并发/超时逻辑写错时应当失败而不是把整个包挂到 go test 超时。
func runGuarded(t *testing.T, run func() ([]string, error)) ([]string, error) {
	t.Helper()
	type result struct {
		outputs []string
		err     error
	}
	done := make(chan result, 1)
	go func() {
		outputs, err := run()
		done <- result{outputs, err}
	}()
	select {
	case r := <-done:
		return r.outputs, r.err
	case <-time.After(3 * time.Second):
		t.Fatal("runShellCommands 3 秒内未返回")
		return nil, nil
	}
}

func indexOf(lines []string, target string) int {
	for i, line := range lines {
		if line == target {
			return i
		}
	}
	return -1
}

func TestRunShellCommands_ShouldSplitOutputsPerCommandInOrder(t *testing.T) {
	fastShellTiming(t)
	shell, stdout := newFakeShell(map[string]string{
		"display trapbuffer":   "TRAP-LINE-1\nTRAP-LINE-2\n",
		"display alarm active": "ALARM-LINE-1\n",
	})

	outputs, err := runGuarded(t, func() ([]string, error) {
		return runShellCommands(context.Background(), shell, stdout,
			[]string{"screen-length 0 temporary", "display trapbuffer", "display alarm active"})
	})
	if err != nil {
		t.Fatalf("err = %v", err)
	}
	if len(outputs) != 3 {
		t.Fatalf("outputs = %d 段, want 3", len(outputs))
	}
	if !strings.Contains(outputs[1], "TRAP-LINE-2") || strings.Contains(outputs[1], "ALARM-LINE-1") {
		t.Fatalf("trap 段内容错误: %q", outputs[1])
	}
	if !strings.Contains(outputs[2], "ALARM-LINE-1") || strings.Contains(outputs[2], "TRAP-LINE-1") {
		t.Fatalf("alarm 段内容错误: %q", outputs[2])
	}

	lines := shell.lines()
	trapMarker := indexOf(lines, "echo __CMD_END_7f3a9b2c_1__")
	alarmCmd := indexOf(lines, "display alarm active")
	if trapMarker < 0 || alarmCmd < 0 || alarmCmd < trapMarker {
		t.Fatalf("第二条命令必须在第一条的结束标记之后才发送，实际顺序: %v", lines)
	}
	if indexOf(lines, "exit") < 0 {
		t.Fatalf("会话结束应发送 exit，实际顺序: %v", lines)
	}
}

func TestRunShellCommands_SwallowedMarkerShouldTimeOutWithoutSendingNext(t *testing.T) {
	fastShellTiming(t)
	// 分页器把第一条命令的结束标记当按键吞掉：标记永远读不到
	shell, stdout := newFakeShell(map[string]string{
		"display trapbuffer": "TRAP-LINE-1\n",
	}, "echo __CMD_END_7f3a9b2c_1__")

	outputs, err := runGuarded(t, func() ([]string, error) {
		return runShellCommands(context.Background(), shell, stdout,
			[]string{"screen-length 0 temporary", "display trapbuffer", "display alarm active"})
	})
	if err != nil {
		t.Fatalf("读超时应返回已收到的内容而不是错误，err = %v", err)
	}
	if !strings.Contains(outputs[1], "TRAP-LINE-1") {
		t.Fatalf("超时前已收到的 trap 输出应保留: %q", outputs[1])
	}
	if outputs[2] != "" {
		t.Fatalf("未发送的命令输出段应为空: %q", outputs[2])
	}
	if indexOf(shell.lines(), "display alarm active") >= 0 {
		t.Fatalf("前一条标记未读到时不应发送下一条命令: %v", shell.lines())
	}
}

func TestRunShellCommands_CanceledContextShouldReturnCanceled(t *testing.T) {
	fastShellTiming(t)
	shell, stdout := newFakeShell(map[string]string{}, "echo __CMD_END_7f3a9b2c_0__")
	ctx, cancel := context.WithCancel(context.Background())
	go func() {
		time.Sleep(50 * time.Millisecond)
		cancel()
	}()

	_, err := runGuarded(t, func() ([]string, error) {
		return runShellCommands(ctx, shell, stdout, []string{"screen-length 0 temporary"})
	})
	if err == nil {
		t.Fatal("ctx 取消后应返回 ErrCollectionCanceled")
	}
}
