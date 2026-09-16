package logs_test

import (
	"context"
	"fmt"
	"strings"
	"testing"
	_ "unsafe"

	"github.com/DATA-DOG/go-sqlmock"

	"github.com/your-org/inspect-system/backend-go/internal/logs"
)

// 本系统自身活动识别（任务 C）：SSH 轮询设备日志时，本系统的每次登录都被设备记成
// VTYUSERLOGIN / SHELL LOGIN 之类的会话日志再被采回，实测占全部 SSH 来源日志的 38%、
// "安全"设施的 100%。判定依据 = 消息里出现本机 IP（整词匹配）+ 会话类关键词；
// 只按 IP 会把"loghost 不可达"这类必须让运维看到的事件一起藏掉。
// 命中的记录不丢弃、打 self_generated 标记，列表/统计默认排除，可显式包含。

//go:linkname markSelfGenerated github.com/your-org/inspect-system/backend-go/internal/logs.markSelfGenerated
func markSelfGenerated(records []logs.DeviceLog, matcher *logs.SelfActivityMatcher)

func TestSelfActivityMatcher_ShouldMatchSessionLogsMentioningLocalIP(t *testing.T) {
	matcher := logs.NewSelfActivityMatcher([]string{"192.168.20.2"})
	cases := []struct {
		name    string
		message string
		want    bool
	}{
		{"华为 trapbuffer 登录 Trap", "LINE/5/VTYUSERLOGIN: OID 1.3.6.1.4.1.2011.5.25.207.2.2 A user login. (UserIndex=34, UserName=admin, UserIP=192.168.20.2, UserChannel=VTY0)", true},
		{"华为 logbuffer 登录", "%%01SHELL/5/LOGIN(l)[12]:The user succeeded in logging in. (UserName=admin, IPAddress=192.168.20.2, VpnName=)", true},
		{"华为命令记录", "%%01SHELL/6/CMDRECORD(s)[13]:Recorded command information. (Task=VT0, Ip=192.168.20.2, User=admin, Command=\"display logbuffer\")", true},
		{"H3C 登录（带端口后缀）", "SSHS/6/SSHS_LOG: Accepted password for admin from 192.168.20.2:51234 ssh2", true},
		{"H3C 登出", "SHELL/5/SHELL_LOGOUT: admin logged out from 192.168.20.2.", true},
		{"登录失败也是自身活动", "LINE/5/VTYUSERLOGINFAIL: OID 1.3.6.1.4.1.2011.5.25.207.2.3 A user login fail. (UserIndex=34, UserName=VTY, UserIP=192.168.20.2, UserChannel=VTY0)", true},
		{"别的主机登录", "LINE/5/VTYUSERLOGIN: OID 1.3.6.1.4.1.2011.5.25.207.2.2 A user login. (UserIndex=35, UserName=admin, UserIP=192.168.10.7, UserChannel=VTY1)", false},
		{"IP 前缀相同但不是本机（整词匹配）", "LINE/5/VTYUSERLOGIN: A user login. (UserName=admin, UserIP=192.168.20.20, UserChannel=VTY1)", false},
		{"控制台登录", "LINE/5/VTYUSERLOGIN: A user login. (UserIndex=0, UserName=Console, UserIP=con0, UserChannel=CON0)", false},
		{"提到本机 IP 但不是会话事件（运维必须看到）", "%%01INFO/4/LOGHOST_UNREACHABLE(l):The log host 192.168.20.2 is unreachable.", false},
		{"提到本机 IP 的 NTP 事件", "%%01NTP/4/SERVER_UNREACHABLE(l):NTP server 192.168.20.2 is unreachable.", false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := matcher.Match(tc.message); got != tc.want {
				t.Fatalf("Match(%q) = %v, want %v", tc.message, got, tc.want)
			}
		})
	}
}

func TestSelfActivityMatcher_ShouldNeverMatchWithoutLocalIPs(t *testing.T) {
	message := "LINE/5/VTYUSERLOGIN: A user login. (UserName=admin, UserIP=192.168.20.2, UserChannel=VTY0)"
	if logs.NewSelfActivityMatcher(nil).Match(message) {
		t.Fatal("没有本机 IP 时不应匹配任何记录")
	}
	if logs.NewSelfActivityMatcher([]string{" ", ""}).Match(message) {
		t.Fatal("空白 IP 应被忽略")
	}
	var nilMatcher *logs.SelfActivityMatcher
	if nilMatcher.Match(message) {
		t.Fatal("nil matcher 应安全返回 false")
	}
}

func TestMarkSelfGenerated_ShouldFlagOnlyMatchingRecords(t *testing.T) {
	matcher := logs.NewSelfActivityMatcher([]string{"192.168.20.2"})
	records := []logs.DeviceLog{
		{Message: "LINE/5/VTYUSERLOGIN: A user login. (UserName=admin, UserIP=192.168.20.2, UserChannel=VTY0)"},
		{Message: "IFNET/4/IF_PVCDOWN: OID 1.3.6.1.6.3.1.1.5.3 Interface 10 turned into DOWN state."},
	}
	markSelfGenerated(records, matcher)
	if !records[0].SelfGenerated {
		t.Fatal("本机登录记录应被标记为 self_generated")
	}
	if records[1].SelfGenerated {
		t.Fatal("接口事件不应被标记")
	}
}

func TestListLogs_ShouldExcludeSelfGeneratedByDefault(t *testing.T) {
	db, mock, cleanup := newLogsGormDBWithSQLMock(t, sqlmock.QueryMatcherRegexp)
	defer cleanup()
	service := logs.NewService(db, nil)

	// GORM 走参数化 SQL：条件体现为 self_generated = $n，值 false 在参数里
	mock.ExpectQuery(`^SELECT count\(\*\) .*l\.self_generated = \$\d+`).
		WithArgs(sqlmock.AnyArg(), false).
		WillReturnRows(sqlmock.NewRows([]string{"count"}).AddRow(0))
	mock.ExpectQuery(`^SELECT l\.\*.*l\.self_generated = \$\d+`).
		WillReturnRows(sqlmock.NewRows([]string{"id"}))

	if _, _, err := service.ListLogs(context.Background(), logs.LogFilter{Limit: 10}); err != nil {
		t.Fatalf("ListLogs: %v", err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("默认查询必须带 self_generated = false 过滤: %v", err)
	}
}

// noSelfGeneratedClause 在正则匹配之外额外断言 SQL 里没有 self_generated 条件（RE2 不支持负向前瞻）。
var noSelfGeneratedClause = sqlmock.QueryMatcherFunc(func(expectedSQL, actualSQL string) error {
	if strings.Contains(actualSQL, "self_generated") {
		return fmt.Errorf("include_self 时不应过滤 self_generated，实际 SQL: %s", actualSQL)
	}
	return sqlmock.QueryMatcherRegexp.Match(expectedSQL, actualSQL)
})

func TestListLogs_ShouldIncludeSelfGeneratedWhenAsked(t *testing.T) {
	db, mock, cleanup := newLogsGormDBWithSQLMock(t, noSelfGeneratedClause)
	defer cleanup()
	service := logs.NewService(db, nil)

	mock.ExpectQuery(`^SELECT count\(\*\)`).WillReturnRows(sqlmock.NewRows([]string{"count"}).AddRow(0))
	mock.ExpectQuery(`^SELECT l\.\*`).WillReturnRows(sqlmock.NewRows([]string{"id"}))

	if _, _, err := service.ListLogs(context.Background(), logs.LogFilter{Limit: 10, IncludeSelf: true}); err != nil {
		t.Fatalf("ListLogs: %v", err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("include_self 查询未按预期执行: %v", err)
	}
}
