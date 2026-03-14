import { NextResponse } from 'next/server'

export function GET() {
  return NextResponse.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    // 仅用于开发环境自检（这些本身就是 NEXT_PUBLIC 变量，不涉及敏感信息）
    config: {
      apiUrl: process.env.NEXT_PUBLIC_API_URL ?? null,
      wsUrl: process.env.NEXT_PUBLIC_WS_URL ?? null,
      useMockData: process.env.NEXT_PUBLIC_USE_MOCK_DATA ?? null,
      disableAuthCheck: process.env.NEXT_PUBLIC_DISABLE_AUTH_CHECK ?? null,
    },
  })
}
