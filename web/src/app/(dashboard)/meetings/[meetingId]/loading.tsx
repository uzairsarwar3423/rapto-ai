import { Skeleton } from '@/components/ui/skeleton'
import { PageContainer } from '@/components/shared/layout/PageContainer'

export default function MeetingDetailLoading() {
  return (
    <PageContainer>
      {/* Header skeleton mirrors MeetingDetailHeader's exact height/padding */}
      <div className="flex items-center justify-between py-1">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <Skeleton className="h-4 w-4 rounded-full" />
            <Skeleton className="h-5 w-48" />
            <Skeleton className="h-4 w-16 rounded-full" />
          </div>
          <Skeleton className="h-3 w-32" />
        </div>
        <Skeleton className="h-7 w-7 rounded-md" />
      </div>
      {/* Tab bar skeleton — 4 pills, matches MeetingDetailTabs height exactly */}
      <div className="mt-3 flex gap-5 border-b border-border pb-0">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="mb-2 h-3 w-16" />
        ))}
      </div>
      {/* Overview content skeleton */}
      <div className="mt-4 grid grid-cols-12 gap-4">
        <Skeleton className="col-span-12 md:col-span-8 h-40 rounded-md" />
        <Skeleton className="col-span-12 md:col-span-4 h-40 rounded-md" />
      </div>
    </PageContainer>
  )
}
