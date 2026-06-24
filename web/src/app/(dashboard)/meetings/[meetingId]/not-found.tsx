import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { Button } from '@/components/ui/button'
import { SearchX } from 'lucide-react'
import Link from 'next/link'
import { PageContainer } from '@/components/shared/layout/PageContainer'

export default function MeetingNotFound() {
  return (
    <PageContainer className="flex items-center justify-center">
      <Empty className="max-w-md">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <SearchX className="text-muted-foreground" />
          </EmptyMedia>
          <EmptyTitle>Meeting not found</EmptyTitle>
          <EmptyDescription>It may have been deleted, or you may not have access to it.</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button size="sm" variant="outline" asChild>
            <Link href="/meetings">Back to meetings</Link>
          </Button>
        </EmptyContent>
      </Empty>
    </PageContainer>
  )
}
