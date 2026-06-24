package main

import (
	"errors"
	"strings"
)

// ErrSeedPasswordRequired 表示未通过 --password 或 INSPECT_SEED_PASSWORD 提供初始口令。
// 生产安装流程不再内置硬编码默认口令，避免弱口令被预置后遗留。
var ErrSeedPasswordRequired = errors.New("必须通过 --password 或环境变量 INSPECT_SEED_PASSWORD 提供管理员口令；不再使用内置默认口令")

// resolveSeedPassword 解析管理员初始口令：优先命令行 --password，其次环境变量
// INSPECT_SEED_PASSWORD；两者皆空（含仅空白）则返回错误。返回原始非空值（不裁剪），
// 仅以裁剪后是否为空判定“是否已提供”，以免破坏口令中可能存在的有意空白。
func resolveSeedPassword(flagValue, envValue string) (string, error) {
	if strings.TrimSpace(flagValue) != "" {
		return flagValue, nil
	}
	if strings.TrimSpace(envValue) != "" {
		return envValue, nil
	}
	return "", ErrSeedPasswordRequired
}
