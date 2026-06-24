package main

import "testing"

// resolveSeedPassword 必须杜绝硬编码弱口令：优先 --password，其次环境变量，
// 两者皆空（含仅空白）时报错。
func TestResolveSeedPassword(t *testing.T) {
	t.Run("flag 优先于环境变量", func(t *testing.T) {
		got, err := resolveSeedPassword("flagpw", "envpw")
		if err != nil {
			t.Fatalf("不应报错: %v", err)
		}
		if got != "flagpw" {
			t.Fatalf("got %q, want flagpw", got)
		}
	})
	t.Run("flag 为空时回退环境变量", func(t *testing.T) {
		got, err := resolveSeedPassword("", "envpw")
		if err != nil {
			t.Fatalf("不应报错: %v", err)
		}
		if got != "envpw" {
			t.Fatalf("got %q, want envpw", got)
		}
	})
	t.Run("flag 仅空白视为未提供，回退环境变量", func(t *testing.T) {
		got, err := resolveSeedPassword("   ", "envpw")
		if err != nil {
			t.Fatalf("不应报错: %v", err)
		}
		if got != "envpw" {
			t.Fatalf("got %q, want envpw", got)
		}
	})
	t.Run("两者皆空时报错", func(t *testing.T) {
		if _, err := resolveSeedPassword("", ""); err == nil {
			t.Fatalf("未提供口令时应报错")
		}
	})
	t.Run("两者皆空白时报错", func(t *testing.T) {
		if _, err := resolveSeedPassword("  ", "  "); err == nil {
			t.Fatalf("仅空白口令应视为未提供并报错")
		}
	})
}
