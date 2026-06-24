# admin-password.ps1 — 初始管理员口令生成器
# 无副作用，仅定义函数；供 init-database.ps1 dot-source，以及 installer/tests 复用。

function New-InitialAdminPassword {
    # 生成 CSPRNG 随机初始口令。
    # - 字符集去除易混淆字符（0/O、1/l/I），便于一次性手工输入；
    # - 采用拒绝采样消除取模偏置，保证字符均匀分布。
    param([int]$Length = 20)

    $charset = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789"
    $n = $charset.Length
    $limit = 256 - (256 % $n)

    $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    try {
        $sb = New-Object System.Text.StringBuilder
        $buf = New-Object byte[] 1
        while ($sb.Length -lt $Length) {
            $rng.GetBytes($buf)
            $b = [int]$buf[0]
            if ($b -ge $limit) { continue }   # 拒绝采样：丢弃落入偏置区间的字节
            [void]$sb.Append($charset[$b % $n])
        }
        return $sb.ToString()
    } finally {
        $rng.Dispose()
    }
}
