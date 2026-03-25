'use client'

interface SectionHeaderProps {
  icon: React.ComponentType<{ className?: string }>
  title: string
  description?: string
}

export function SectionHeader({ icon: Icon, title, description }: SectionHeaderProps) {
  return (
    <div className="flex items-center gap-2.5 mb-3">
      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 dark:bg-primary/20">
        <Icon className="h-4 w-4 text-primary" />
      </div>
      <div>
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        {description && (
          <p className="text-xs text-muted-foreground dark:text-muted-foreground">{description}</p>
        )}
      </div>
    </div>
  )
}
