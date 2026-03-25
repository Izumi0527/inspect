'use client'
import { WifiOff, ShieldOff, RefreshCw } from 'lucide-react'
import { Button, Card, CardContent } from '@/components/atoms'

export function SectionFailureContent({
  title,
  message,
  onRetry,
  className,
}: {
  title: string
  message: string
  onRetry: () => void
  className?: string
}) {
  return (
    <div className={`flex flex-col items-center justify-center text-center ${className ?? ''}`}>
      <WifiOff className="h-6 w-6 text-red-600 dark:text-red-400" />
      <p className="mt-2 text-sm font-semibold text-foreground">{title}</p>
      <p className="mt-1 text-xs text-muted-foreground">{message}</p>
      <Button variant="outline" onClick={onRetry} className="mt-3 cursor-pointer">
        <RefreshCw className="mr-2 h-4 w-4" />
        重试
      </Button>
    </div>
  )
}

export function SectionFailureCard({
  title,
  message,
  onRetry,
}: {
  title: string
  message: string
  onRetry: () => void
}) {
  return (
    <Card className="border-2 border-dashed border-red-200 bg-red-50/60 dark:border-red-800 dark:bg-red-900/10">
      <CardContent className="p-6">
        <SectionFailureContent title={title} message={message} onRetry={onRetry} />
      </CardContent>
    </Card>
  )
}

export function SectionPermissionLimitedCard({
  title,
  message,
}: {
  title: string
  message: string
}) {
  return (
    <Card className="border-2 border-dashed border-border bg-muted/40 dark:border-border dark:bg-muted/40">
      <CardContent className="p-6">
        <div className="flex flex-col items-center justify-center text-center">
          <ShieldOff className="h-6 w-6 text-muted-foreground" />
          <p className="mt-2 text-sm font-semibold text-foreground">{title}</p>
          <p className="mt-1 text-xs text-muted-foreground">{message}</p>
        </div>
      </CardContent>
    </Card>
  )
}
