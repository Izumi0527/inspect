package db_test

import (
	"go/ast"
	"go/parser"
	"go/token"
	"io/fs"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
)

// GORM 的 Raw 只把 SQL 写进 Statement，不执行；真正发出查询的是 Scan/Row/Rows/Exec 等结束方法。
// 写成 db.Raw("SELECT 1").Error 时查询从未发出、Error 恒为 nil——历史上 4 处数据库探活因此
// 永远报「已连接」。本守卫解析 backend-go 全部非测试源码，凡是 Raw(...) 链上没有结束方法就读
// .Error 的写法一律报错。只看同一表达式链，把 Raw 结果先存变量再读 .Error 的写法不在检测范围内。
var gormTerminalMethods = map[string]bool{
	"Scan": true, "Row": true, "Rows": true, "ScanRows": true, "Exec": true,
	"Find": true, "FindInBatches": true, "First": true, "Take": true, "Last": true,
	"Pluck": true, "Count": true, "Create": true, "Save": true,
	"Update": true, "Updates": true, "UpdateColumn": true, "UpdateColumns": true, "Delete": true,
}

func TestGormRawChainsAlwaysHaveTerminalMethod(t *testing.T) {
	root, err := filepath.Abs(filepath.Join("..", "..", "..", "..", "backend-go"))
	if err != nil {
		t.Fatalf("定位 backend-go 失败: %v", err)
	}
	if _, err := os.Stat(filepath.Join(root, "go.mod")); err != nil {
		t.Fatalf("backend-go/go.mod 不存在（root=%s）: %v", root, err)
	}

	fset := token.NewFileSet()
	var violations []string
	scanned := 0
	walkErr := filepath.WalkDir(root, func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if d.IsDir() || !strings.HasSuffix(path, ".go") || strings.HasSuffix(path, "_test.go") {
			return nil
		}
		file, err := parser.ParseFile(fset, path, nil, 0)
		if err != nil {
			return err
		}
		scanned++
		ast.Inspect(file, func(node ast.Node) bool {
			sel, ok := node.(*ast.SelectorExpr)
			if !ok || sel.Sel.Name != "Error" {
				return true
			}
			if rawWithoutTerminal(sel.X) {
				pos := fset.Position(sel.Pos())
				rel, _ := filepath.Rel(root, pos.Filename)
				violations = append(violations, filepath.ToSlash(rel)+":"+strconv.Itoa(pos.Line))
			}
			return true
		})
		return nil
	})
	if walkErr != nil {
		t.Fatalf("扫描源码失败: %v", walkErr)
	}
	if scanned == 0 {
		t.Fatalf("未扫描到任何源码文件（root=%s），守卫失效", root)
	}
	if len(violations) > 0 {
		t.Fatalf("以下位置在 Raw(...) 之后没有 Scan/Exec 等结束方法就读取 .Error，查询不会执行：\n  %s",
			strings.Join(violations, "\n  "))
	}
}

// rawWithoutTerminal 沿方法链向内回溯：先遇到结束方法即视为已执行，先遇到 Raw 则说明查询未执行。
func rawWithoutTerminal(expr ast.Expr) bool {
	for {
		call, ok := expr.(*ast.CallExpr)
		if !ok {
			return false
		}
		fun, ok := call.Fun.(*ast.SelectorExpr)
		if !ok {
			return false
		}
		switch {
		case gormTerminalMethods[fun.Sel.Name]:
			return false
		case fun.Sel.Name == "Raw":
			return true
		}
		expr = fun.X
	}
}
