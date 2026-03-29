'use client'

import type { PublishRecordItem } from '@/api/plat/types/publish.types'
import dayjs from 'dayjs'
import { Plus } from 'lucide-react'
import { memo, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import CalendarRecord from '../CalendarTimingItem/components/CalendarRecord'

interface IPCDayListViewProps {
  recordMap: Map<string, PublishRecordItem[]>
  loading: boolean
  onClickPub: (date: string) => void
}

const PCDayListView = memo<IPCDayListViewProps>(({ recordMap, loading, onClickPub }) => {
  const days = useMemo(() => {
    return Array.from(recordMap.keys()).sort((a, b) => dayjs(a).valueOf() - dayjs(b).valueOf())
  }, [recordMap])

  if (loading) {
    return (
      <div className="h-full overflow-auto p-4 space-y-3">
        {Array.from({ length: 6 }).map((_, idx) => (
          <Skeleton key={idx} className="h-20 w-full rounded-md" />
        ))}
      </div>
    )
  }

  if (days.length === 0) {
    return (
      <div className="h-full overflow-auto p-6 text-sm text-muted-foreground">
        No data available
      </div>
    )
  }

  return (
    <div className="h-full overflow-auto p-3 md:p-4 space-y-3">
      {days.map((day) => {
        const records = recordMap.get(day) || []
        return (
          <section key={day} className="rounded-md border bg-card">
            <div className="sticky top-0 z-10 border-b bg-card/95 backdrop-blur px-3 py-2 flex items-center justify-between gap-2">
              <div className="text-sm font-semibold">
                {dayjs(day).format('ddd, DD MMM YYYY')}
              </div>
              <Button
                variant="outline"
                size="sm"
                className="h-7 px-2 cursor-pointer"
                onClick={() => onClickPub(dayjs(day).hour(10).minute(0).second(0).format())}
              >
                <Plus className="h-3.5 w-3.5 mr-1" />
                Create
              </Button>
            </div>
            <div className="p-2 space-y-2">
              {records.length === 0 && (
                <div className="text-xs text-muted-foreground px-1 py-1">
                  No data available
                </div>
              )}
              {records.map(record => (
                <div key={`${record.id}-${record.updatedAt}`}>
                  <CalendarRecord publishRecord={record} />
                </div>
              ))}
            </div>
          </section>
        )
      })}
    </div>
  )
})

PCDayListView.displayName = 'PCDayListView'

export default PCDayListView
