import { Card } from '@/components/ui/card'
import { Lightbulb, User2 } from 'lucide-react'

function stripLeadingBulletChar(text: string) {
  return text.replace(/^[-*•]\s*/, '')
}

export function MeetingDecisionsBlock({ decisions }: { decisions?: Array<{ id: string, text: string, madeBy: string | null }> }) {
  if (!decisions || decisions.length === 0) {
    return (
      <Card className="p-4 sm:p-5 border-border/40 bg-gradient-to-br from-card to-card/50 shadow-sm transition-all duration-300">
        <div className="flex items-center gap-2 mb-3">
          <div className="p-1.5 rounded-md bg-brand/10 text-brand">
            <Lightbulb className="w-4 h-4" />
          </div>
          <h3 className="text-sm font-semibold tracking-tight text-foreground">Decisions</h3>
        </div>
        <p className="text-sm text-muted-foreground/80 italic pl-1">
          No decisions were extracted from this meeting.
        </p>
      </Card>
    )
  }

  return (
    <Card className="p-4 sm:p-5 border-border/40 bg-gradient-to-br from-card to-card/50 shadow-sm transition-all duration-300 group/card hover:shadow-md">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-md bg-brand/10 text-brand ring-1 ring-brand/20 shadow-inner group-hover/card:bg-brand/15 transition-colors duration-300">
            <Lightbulb className="w-4 h-4" />
          </div>
          <h3 className="text-sm font-semibold tracking-tight text-foreground flex items-center">
            Decisions 
            <span className="ml-2 text-[10px] font-medium text-muted-foreground bg-muted/60 px-2 py-0.5 rounded-full border border-border/40">
              {decisions.length}
            </span>
          </h3>
        </div>
      </div>
      <ul className="space-y-2 sm:space-y-3">
        {decisions.map((decision, i) => (
          <li 
            key={decision.id} 
            className="group flex gap-3 text-sm text-foreground p-3 rounded-xl hover:bg-muted/40 border border-transparent hover:border-border/50 transition-all duration-200 ease-out shadow-none hover:shadow-sm"
          >
            <div className="mt-0.5 flex-shrink-0">
              <div className="w-5 h-5 rounded-full bg-background border border-brand/30 flex items-center justify-center group-hover:scale-110 group-hover:border-brand/50 group-hover:bg-brand/5 transition-all duration-300">
                <div className="w-1.5 h-1.5 rounded-full bg-brand/60 group-hover:bg-brand transition-colors" />
              </div>
            </div>
            <div className="flex-1 flex flex-col gap-1.5 min-w-0">
              <span className="text-foreground/90 font-medium leading-relaxed group-hover:text-foreground transition-colors break-words">
                {stripLeadingBulletChar(decision.text)}
              </span>
              {decision.madeBy && (
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground/80 mt-0.5 w-fit bg-muted/30 px-2 py-0.5 rounded-md border border-border/20">
                  <User2 className="w-3 h-3 opacity-70" />
                  <span className="font-medium text-muted-foreground truncate max-w-[200px] sm:max-w-xs">{decision.madeBy}</span>
                </div>
              )}
            </div>
          </li>
        ))}
      </ul>
    </Card>
  )
}
