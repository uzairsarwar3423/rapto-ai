import { Card } from '@/components/ui/card'

function stripLeadingBulletChar(text: string) {
  return text.replace(/^[-*•]\s*/, '')
}

export function MeetingSummaryBlock({ summary }: { summary: string | null }) {
  if (!summary) {
    return (
      <Card className="p-4">
        <h3 className="mb-2 text-xs font-medium text-foreground">Summary</h3>
        <p className="text-xs text-muted-foreground">
          Summary will appear once the meeting finishes processing.
        </p>
      </Card>
    )
  }

  const bullets = summary.split('\n').filter(Boolean)

  return (
    <Card className="p-4">
      <h3 className="mb-2.5 text-xs font-medium text-foreground">Summary</h3>
      <ul className="space-y-1.5">
        {bullets.map((bullet, i) => (
          <li key={i} className="flex gap-2 text-sm text-foreground">
            <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-muted-foreground" />
            <span className="flex-1">{stripLeadingBulletChar(bullet)}</span>
          </li>
        ))}
      </ul>
    </Card>
  )
}
