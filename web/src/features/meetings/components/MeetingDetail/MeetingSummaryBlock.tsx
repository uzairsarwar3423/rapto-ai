import { Card } from '@/components/ui/card'
import { FileText } from 'lucide-react'

function stripLeadingBulletChar(text: string) {
  return text.replace(/^[-*•]\s*/, '')
}

export function MeetingSummaryBlock({ summary }: { summary: string | null }) {
  if (!summary) {
    return (
      <Card className="p-4 sm:p-5 border-border/40 bg-gradient-to-br from-card to-card/50 shadow-sm transition-all duration-300">
        <div className="flex items-center gap-2 mb-3">
          <div className="p-1.5 rounded-md bg-brand/10 text-brand">
            <FileText className="w-4 h-4" />
          </div>
          <h3 className="text-sm font-semibold tracking-tight text-foreground">Summary</h3>
        </div>
        <div className="space-y-2">
           <div className="h-3 bg-muted/40 rounded w-3/4 animate-pulse" />
           <div className="h-3 bg-muted/40 rounded w-1/2 animate-pulse" />
        </div>
        <p className="mt-4 text-xs text-muted-foreground italic pl-1">
          Summary will appear once the meeting finishes processing.
        </p>
      </Card>
    )
  }

  const bullets = summary.split('\n').filter(Boolean)

  return (
    <Card className="p-4 sm:p-5 border-border/40 bg-gradient-to-br from-card to-card/50 shadow-sm transition-all duration-300 group/card hover:shadow-md">
      <div className="flex items-center gap-2 mb-4">
        <div className="p-1.5 rounded-md bg-brand/10 text-brand ring-1 ring-brand/20 shadow-inner group-hover/card:bg-brand/15 transition-colors duration-300">
          <FileText className="w-4 h-4" />
        </div>
        <h3 className="text-sm font-semibold tracking-tight text-foreground">Meeting Summary</h3>
      </div>
      <ul className="space-y-3 sm:space-y-4">
        {bullets.map((bullet, i) => (
          <li 
            key={i} 
            className="group flex gap-3 text-sm text-foreground items-start px-2 py-1 -mx-2 rounded-lg hover:bg-muted/30 transition-colors duration-200"
          >
            <div className="mt-2 shrink-0 w-1.5 h-1.5 rounded-full bg-brand/40 group-hover:bg-brand group-hover:scale-125 transition-all duration-300 shadow-sm" />
            <span className="flex-1 leading-relaxed text-foreground/80 group-hover:text-foreground transition-colors duration-200 break-words">
              {stripLeadingBulletChar(bullet)}
            </span>
          </li>
        ))}
      </ul>
    </Card>
  )
}
