'use client'

import type { PromotionMaterial, PromotionPlan } from '@/app/[lng]/brand-promotion/brandPromotionStore/types'
import type { ScheduleRule, SchedulerFrequency } from '@/api/scheduler'
import { AccountPlatInfoMap } from '@/app/config/platConfig'
import dayjs from 'dayjs'
import { CalendarClock, Loader2, RefreshCw } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { apiGetMaterialGroupList, apiGetMaterialList } from '@/api/material'
import { getPublishList } from '@/api/plat/publish'
import type { PublishRecordItem } from '@/api/plat/types/publish.types'
import {
  apiCreateScheduleBatch,
  apiCreateScheduleRule,
  apiDeleteScheduleRule,
  apiGetQueueOverview,
  apiListScheduleRules,
  apiUpdateScheduleRule,
} from '@/api/scheduler'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from '@/lib/toast'
import { cn } from '@/lib/utils'
import { useAccountStore } from '@/store/account'

type QueueStatus = 'ready' | 'queued' | 'running' | 'published' | 'failed'
type SchedulerMode = 'viral_slots' | 'interval' | 'recurrence'
type PostPanelMode = 'queue' | 'list'
type ListStatusFilter = 'all' | 'queued' | 'running' | 'published' | 'failed'
type VirtualListRow = {
  key: string
  kind: 'date' | 'item'
  height: number
  date?: string
  item?: PublishRecordItem
}

const LIST_DATE_ROW_HEIGHT = 34
const LIST_ITEM_ROW_HEIGHT = 50
const LIST_OVERSCAN_PX = 320

const WEEKDAY_OPTIONS = [
  { label: 'Sun', value: 0 },
  { label: 'Mon', value: 1 },
  { label: 'Tue', value: 2 },
  { label: 'Wed', value: 3 },
  { label: 'Thu', value: 4 },
  { label: 'Fri', value: 5 },
  { label: 'Sat', value: 6 },
]

function toLocalDateTimeInput(date: Date) {
  const adjusted = new Date(date.getTime() - date.getTimezoneOffset() * 60000)
  return adjusted.toISOString().slice(0, 16)
}

export default function ContentSchedulerShell() {
  const accountList = useAccountStore(state => state.accountList)
  const accountInit = useAccountStore(state => state.accountInit)

  const [loading, setLoading] = useState(false)
  const [groups, setGroups] = useState<PromotionPlan[]>([])
  const [selectedGroupId, setSelectedGroupId] = useState<string>('')
  const [materials, setMaterials] = useState<PromotionMaterial[]>([])
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [mode, setMode] = useState<SchedulerMode>('viral_slots')
  const [scheduleStartAt, setScheduleStartAt] = useState<string>(toLocalDateTimeInput(dayjs().add(30, 'minute').toDate()))
  const [slotsText, setSlotsText] = useState('10:00,15:00,17:00')
  const [intervalHours, setIntervalHours] = useState(4)
  const [accountId, setAccountId] = useState<string>('')
  const [queueStatus, setQueueStatus] = useState<QueueStatus>('ready')
  const [postPanelMode, setPostPanelMode] = useState<PostPanelMode>('queue')
  const [queueOverview, setQueueOverview] = useState<{
    counts: Record<QueueStatus, number>
    lists: Record<QueueStatus, any[]>
  }>({
    counts: { ready: 0, queued: 0, running: 0, published: 0, failed: 0 },
    lists: { ready: [], queued: [], running: [], published: [], failed: [] },
  })
  const [rules, setRules] = useState<ScheduleRule[]>([])

  const [recurrenceFrequency, setRecurrenceFrequency] = useState<SchedulerFrequency>('weekly')
  const [recurrenceTime, setRecurrenceTime] = useState('10:00')
  const [recurrenceWeekdays, setRecurrenceWeekdays] = useState<number[]>([1])
  const [lastActionMessage, setLastActionMessage] = useState<string>('')
  const [allPosts, setAllPosts] = useState<PublishRecordItem[]>([])
  const [postsLoading, setPostsLoading] = useState(false)
  const [visiblePostCount, setVisiblePostCount] = useState(40)
  const postListContainerRef = useRef<HTMLDivElement | null>(null)
  const [listScrollTop, setListScrollTop] = useState(0)
  const [listViewportHeight, setListViewportHeight] = useState(360)
  const [listPlatformFilter, setListPlatformFilter] = useState<string>('all')
  const [listStatusFilter, setListStatusFilter] = useState<ListStatusFilter>('all')

  const selectedAccount = useMemo(
    () => accountList.find(item => item.id === accountId),
    [accountId, accountList],
  )

  const selectedMaterials = useMemo(
    () => materials.filter(item => selectedIds.has(item.id)),
    [materials, selectedIds],
  )

  const estimate = useMemo(() => {
    const total = selectedIds.size
    if (total === 0)
      return null
    if (mode === 'viral_slots') {
      const slots = slotsText.split(',').map(v => v.trim()).filter(Boolean)
      const perDay = Math.max(1, slots.length)
      const days = Math.ceil(total / perDay)
      return `${total} items · ${perDay}/day · ~${days} days`
    }
    if (mode === 'interval') {
      const totalHours = Math.max(0, (total - 1) * intervalHours)
      return `${total} items · every ${intervalHours}h · ~${totalHours}h`
    }
    return `${total} selected`
  }, [selectedIds.size, mode, slotsText, intervalHours])

  const loadGroups = async () => {
    setLoading(true)
    try {
      const res = await apiGetMaterialGroupList(1, 100)
      const list = res?.data?.list || []
      setGroups(list)
      if (!selectedGroupId && list.length > 0) {
        setSelectedGroupId(list[0].id)
      }
    }
    finally {
      setLoading(false)
    }
  }

  const loadMaterials = async (groupId: string) => {
    if (!groupId)
      return
    setLoading(true)
    try {
      const res = await apiGetMaterialList(groupId, 1, 200)
      setMaterials(res?.data?.list || [])
      setSelectedIds(new Set())
    }
    finally {
      setLoading(false)
    }
  }

  const loadQueueOverview = async () => {
    const res = await apiGetQueueOverview(100)
    if (res?.data) {
      setQueueOverview(res.data as any)
    }
  }

  const loadAllPosts = async () => {
    setPostsLoading(true)
    try {
      const res = await getPublishList({})
      const posts = (res?.data || []) as PublishRecordItem[]
      posts.sort((a, b) => dayjs(b.publishTime).valueOf() - dayjs(a.publishTime).valueOf())
      setAllPosts(posts)
      setVisiblePostCount(40)
    }
    finally {
      setPostsLoading(false)
    }
  }

  const loadRules = async () => {
    const res = await apiListScheduleRules()
    setRules(res?.data || [])
  }

  useEffect(() => {
    accountInit()
    void loadGroups()
    void loadQueueOverview()
    void loadRules()
  }, [accountInit])

  useEffect(() => {
    if (!accountId && accountList.length > 0) {
      setAccountId(accountList[0].id)
    }
  }, [accountId, accountList])

  useEffect(() => {
    if (selectedGroupId) {
      void loadMaterials(selectedGroupId)
    }
  }, [selectedGroupId])

  useEffect(() => {
    setVisiblePostCount(40)
    setListScrollTop(0)
    if (postListContainerRef.current) {
      postListContainerRef.current.scrollTop = 0
    }
  }, [listPlatformFilter, listStatusFilter])

  const toggleMaterial = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id))
        next.delete(id)
      else
        next.add(id)
      return next
    })
  }

  const handleSelectAll = () => {
    setSelectedIds(new Set(materials.map(item => item.id)))
  }

  const handleClearSelection = () => {
    setSelectedIds(new Set())
  }

  const handleScheduleBatch = async () => {
    setLastActionMessage('')
    if (!selectedAccount) {
      toast.error('Select account first')
      setLastActionMessage('Select account first')
      return
    }
    if (selectedIds.size === 0) {
      toast.error('Select at least one content item')
      setLastActionMessage('Select at least one content item')
      return
    }

    const startAt = new Date(scheduleStartAt)
    if (Number.isNaN(startAt.getTime())) {
      toast.error('Invalid schedule start time')
      setLastActionMessage('Invalid schedule start time')
      return
    }

    setLoading(true)
    try {
      const payload: any = {
        mode,
        itemIds: Array.from(selectedIds),
        accountId: selectedAccount.id,
        accountType: selectedAccount.type,
        startAt: startAt.toISOString(),
        timezone: 'Asia/Jakarta',
      }
      if (mode === 'viral_slots') {
        payload.slots = slotsText.split(',').map(v => v.trim()).filter(Boolean)
      }
      else if (mode === 'interval') {
        payload.intervalHours = intervalHours
      }

      const res = await apiCreateScheduleBatch(payload)
      if (res?.code === 0) {
        const successCount = res?.data?.totalScheduled || 0
        const failedCount = res?.data?.totalFailed || 0
        const firstFailedError = res?.data?.failedItems?.[0]?.error
        const summary = failedCount > 0
          ? `Scheduled ${successCount} items, failed ${failedCount}${firstFailedError ? ` (${firstFailedError})` : ''}`
          : `Scheduled ${successCount} items`
        toast.success(summary)
        setLastActionMessage(summary)
        void loadQueueOverview()
      }
      else {
        const message = res?.message || 'Batch schedule request rejected'
        toast.error(message)
        setLastActionMessage(message)
      }
    }
    catch (error) {
      const message = error instanceof Error ? error.message : 'Batch schedule request failed'
      toast.error(message)
      setLastActionMessage(message)
    }
    finally {
      setLoading(false)
    }
  }

  const handleCreateRecurrence = async () => {
    setLastActionMessage('')
    if (!selectedAccount) {
      toast.error('Select account first')
      setLastActionMessage('Select account first')
      return
    }
    if (selectedIds.size !== 1) {
      toast.error('Recurrence requires exactly one selected content')
      setLastActionMessage('Recurrence requires exactly one selected content')
      return
    }
    const materialId = Array.from(selectedIds)[0]

    setLoading(true)
    try {
      const res = await apiCreateScheduleRule({
        materialId,
        accountId: selectedAccount.id,
        accountType: selectedAccount.type,
        frequency: recurrenceFrequency,
        weekdays: recurrenceFrequency === 'custom_weekdays' ? recurrenceWeekdays : undefined,
        timeOfDay: recurrenceTime,
        timezone: 'Asia/Jakarta',
      })
      if (res?.code === 0) {
        toast.success('Recurrence rule created')
        setLastActionMessage('Recurrence rule created')
        void loadRules()
      }
      else {
        const message = res?.message || 'Recurrence rule request rejected'
        toast.error(message)
        setLastActionMessage(message)
      }
    }
    catch (error) {
      const message = error instanceof Error ? error.message : 'Recurrence request failed'
      toast.error(message)
      setLastActionMessage(message)
    }
    finally {
      setLoading(false)
    }
  }

  const handleToggleRule = async (rule: ScheduleRule) => {
    const nextStatus = rule.status === 'active' ? 'paused' : 'active'
    await apiUpdateScheduleRule(rule.id, { status: nextStatus })
    void loadRules()
  }

  const handleDeleteRule = async (ruleId: string) => {
    await apiDeleteScheduleRule(ruleId)
    void loadRules()
  }

  const currentQueueList = queueOverview.lists[queueStatus] || []
  const visiblePosts = useMemo(
    () => {
      const normalizeStatus = (status: unknown): ListStatusFilter | 'unknown' => {
        if (status === 1 || status === '1' || status === 'published')
          return 'published'
        if (status === 2 || status === '2' || status === 'publishing' || status === 'running')
          return 'running'
        if (status === -1 || status === '-1' || status === 'failed')
          return 'failed'
        if (status === 0 || status === '0' || status === 'queued' || status === 'unpublish')
          return 'queued'
        return 'unknown'
      }

      const filtered = allPosts.filter((post) => {
        if (listPlatformFilter !== 'all' && post.accountType !== listPlatformFilter) {
          return false
        }
        if (listStatusFilter !== 'all') {
          const postStatus = normalizeStatus(post.status)
          if (postStatus !== listStatusFilter) {
            return false
          }
        }
        return true
      })

      return filtered.slice(0, visiblePostCount)
    },
    [allPosts, listPlatformFilter, listStatusFilter, visiblePostCount],
  )
  const filteredTotalPosts = useMemo(() => {
    const normalizeStatus = (status: unknown): ListStatusFilter | 'unknown' => {
      if (status === 1 || status === '1' || status === 'published')
        return 'published'
      if (status === 2 || status === '2' || status === 'publishing' || status === 'running')
        return 'running'
      if (status === -1 || status === '-1' || status === 'failed')
        return 'failed'
      if (status === 0 || status === '0' || status === 'queued' || status === 'unpublish')
        return 'queued'
      return 'unknown'
    }
    return allPosts.filter((post) => {
      if (listPlatformFilter !== 'all' && post.accountType !== listPlatformFilter) {
        return false
      }
      if (listStatusFilter !== 'all') {
        const postStatus = normalizeStatus(post.status)
        if (postStatus !== listStatusFilter) {
          return false
        }
      }
      return true
    }).length
  }, [allPosts, listPlatformFilter, listStatusFilter])
  const hasMorePosts = visiblePostCount < filteredTotalPosts
  const listPlatformOptions = useMemo(
    () => Array.from(new Set(allPosts.map(post => post.accountType).filter(Boolean))),
    [allPosts],
  )
  const virtualRows = useMemo(() => {
    const rows: VirtualListRow[] = []
    let currentDate = ''
    for (const post of visiblePosts) {
      const dateKey = dayjs(post.publishTime).format('YYYY-MM-DD')
      if (dateKey !== currentDate) {
        currentDate = dateKey
        rows.push({
          key: `date-${dateKey}`,
          kind: 'date',
          date: dateKey,
          height: LIST_DATE_ROW_HEIGHT,
        })
      }
      rows.push({
        key: post.id,
        kind: 'item',
        item: post,
        height: LIST_ITEM_ROW_HEIGHT,
      })
    }
    return rows
  }, [visiblePosts])
  const virtualLayout = useMemo(() => {
    const offsets: number[] = new Array(virtualRows.length)
    let totalHeight = 0
    for (let i = 0; i < virtualRows.length; i++) {
      offsets[i] = totalHeight
      totalHeight += virtualRows[i].height
    }
    return { offsets, totalHeight }
  }, [virtualRows])

  const binarySearchStartIndex = (targetTop: number) => {
    const { offsets } = virtualLayout
    if (offsets.length === 0)
      return 0
    let left = 0
    let right = offsets.length - 1
    while (left < right) {
      const mid = Math.floor((left + right) / 2)
      const rowBottom = offsets[mid] + virtualRows[mid].height
      if (rowBottom < targetTop)
        left = mid + 1
      else
        right = mid
    }
    return left
  }

  const virtualRange = useMemo(() => {
    if (virtualRows.length === 0) {
      return { start: 0, end: 0 }
    }
    const start = binarySearchStartIndex(Math.max(0, listScrollTop - LIST_OVERSCAN_PX))
    const endTarget = listScrollTop + listViewportHeight + LIST_OVERSCAN_PX
    let end = start
    while (end < virtualRows.length && virtualLayout.offsets[end] < endTarget) {
      end++
    }
    return { start, end: Math.min(virtualRows.length, end + 1) }
  }, [listScrollTop, listViewportHeight, virtualRows, virtualLayout])
  const isBatchReady = !!selectedAccount && selectedIds.size > 0 && !!scheduleStartAt
  const batchDisabledReason = !selectedAccount
    ? 'Select account first'
    : selectedIds.size === 0
      ? 'Select at least one content item'
      : !scheduleStartAt
        ? 'Set start time first'
        : ''

  return (
    <div className="h-full min-h-0 p-4 md:p-6 overflow-auto">
      <div className="max-w-[1400px] mx-auto grid grid-cols-1 xl:grid-cols-[1.4fr_1fr] gap-4">
        <Card className="min-h-[500px]">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-3">
              <CardTitle className="text-base flex items-center gap-2">
                <CalendarClock className="w-4 h-4" />
                Content Scheduler
              </CardTitle>
              <Button variant="outline" size="sm" onClick={() => void loadMaterials(selectedGroupId)} disabled={loading}>
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label>Material Group</Label>
                <Select value={selectedGroupId} onValueChange={setSelectedGroupId}>
                  <SelectTrigger><SelectValue placeholder="Select group" /></SelectTrigger>
                  <SelectContent>
                    {groups.map(group => (
                      <SelectItem key={group.id} value={group.id}>{group.name || group.title || group.id}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Account</Label>
                  <Select value={accountId} onValueChange={setAccountId}>
                    <SelectTrigger><SelectValue placeholder="Select account" /></SelectTrigger>
                    <SelectContent>
                      {accountList.map((account) => {
                        const platformInfo = AccountPlatInfoMap.get(account.type as any)
                        const rawIcon = platformInfo?.icon as any
                        const iconSrc = typeof rawIcon === 'string' ? rawIcon : rawIcon?.src
                        return (
                          <SelectItem key={account.id} value={account.id}>
                            <span className="inline-flex items-center gap-2">
                              {iconSrc && (
                                <img
                                  src={iconSrc}
                                  alt={platformInfo?.name || account.type}
                                  className="w-4 h-4 rounded-sm object-cover"
                                />
                              )}
                              <span>{account.nickname || account.account || account.id}</span>
                            </span>
                          </SelectItem>
                        )
                      })}
                    </SelectContent>
                  </Select>
                </div>
              <div className="flex items-end gap-2">
                <Button variant="outline" className="w-full" onClick={handleSelectAll}>Select All</Button>
                <Button variant="outline" className="w-full" onClick={handleClearSelection}>Clear</Button>
              </div>
            </div>

            <div className="rounded-md border max-h-[420px] overflow-auto">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 p-2">
                {materials.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={cn(
                      'rounded border p-2 text-left flex gap-2 hover:bg-accent/30',
                      selectedIds.has(item.id) && 'border-primary bg-primary/5',
                    )}
                    onClick={() => toggleMaterial(item.id)}
                  >
                    <Checkbox checked={selectedIds.has(item.id)} className="mt-1" />
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate">{item.title || 'Untitled'}</div>
                      <div className="text-xs text-muted-foreground truncate">{item.desc || '-'}</div>
                      <div className="text-[11px] text-muted-foreground mt-1">{item.type || item.mediaList[0]?.type || 'content'}</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div className="text-xs text-muted-foreground">{estimate}</div>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Batch Scheduler</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1">
                <Label>Mode</Label>
                <Select value={mode} onValueChange={value => setMode(value as SchedulerMode)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="viral_slots">Viral Slots</SelectItem>
                    <SelectItem value="interval">Interval</SelectItem>
                    <SelectItem value="recurrence">Recurrence (single item)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label>Timezone</Label>
                <Input value="Asia/Jakarta (WIB)" readOnly />
              </div>

              {mode !== 'recurrence' && (
                <>
                  <div className="space-y-1">
                    <Label>Start At</Label>
                    <Input type="datetime-local" value={scheduleStartAt} onChange={e => setScheduleStartAt(e.target.value)} />
                  </div>

                  {mode === 'viral_slots' && (
                    <div className="space-y-1">
                      <Label>Slots (HH:mm, comma separated)</Label>
                      <Input value={slotsText} onChange={e => setSlotsText(e.target.value)} />
                    </div>
                  )}

                  {mode === 'interval' && (
                    <div className="space-y-1">
                      <Label>Interval Hours</Label>
                      <Input
                        type="number"
                        min={1}
                        value={intervalHours}
                        onChange={e => setIntervalHours(Math.max(1, Number(e.target.value || 1)))}
                      />
                    </div>
                  )}

                  <Button className="w-full" onClick={() => void handleScheduleBatch()} disabled={loading || !isBatchReady}>
                    {loading ? 'Scheduling...' : 'Apply Batch Schedule'}
                  </Button>
                  {!!batchDisabledReason && (
                    <div className="text-[11px] text-muted-foreground">{batchDisabledReason}</div>
                  )}
                </>
              )}

              {mode === 'recurrence' && (
                <>
                  <div className="space-y-1">
                    <Label>Frequency</Label>
                    <Select value={recurrenceFrequency} onValueChange={value => setRecurrenceFrequency(value as SchedulerFrequency)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="daily">Daily</SelectItem>
                        <SelectItem value="weekly">Weekly</SelectItem>
                        <SelectItem value="custom_weekdays">Custom weekdays</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label>Time Of Day</Label>
                    <Input type="time" value={recurrenceTime} onChange={e => setRecurrenceTime(e.target.value)} />
                  </div>
                  {recurrenceFrequency === 'custom_weekdays' && (
                    <div className="space-y-1">
                      <Label>Weekdays</Label>
                      <div className="flex flex-wrap gap-2">
                        {WEEKDAY_OPTIONS.map(option => (
                          <Button
                            key={option.value}
                            type="button"
                            variant={recurrenceWeekdays.includes(option.value) ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => {
                              setRecurrenceWeekdays((prev) => {
                                if (prev.includes(option.value))
                                  return prev.filter(v => v !== option.value)
                                return [...prev, option.value].sort((a, b) => a - b)
                              })
                            }}
                          >
                            {option.label}
                          </Button>
                        ))}
                      </div>
                    </div>
                  )}
                  <Button className="w-full" onClick={() => void handleCreateRecurrence()} disabled={loading}>
                    Create Recurrence Rule
                  </Button>
                </>
              )}
            </CardContent>
          </Card>

          {!!lastActionMessage && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Last Action</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-xs text-muted-foreground">{lastActionMessage}</div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="text-base">Queue Overview</CardTitle>
                <div className="flex items-center gap-2">
                  <div className="rounded border p-0.5 flex">
                    <Button
                      variant={postPanelMode === 'queue' ? 'default' : 'ghost'}
                      size="sm"
                      className="h-7 px-2"
                      onClick={() => setPostPanelMode('queue')}
                    >
                      Queue
                    </Button>
                    <Button
                      variant={postPanelMode === 'list' ? 'default' : 'ghost'}
                      size="sm"
                      className="h-7 px-2"
                      onClick={() => {
                        setPostPanelMode('list')
                        if (allPosts.length === 0) {
                          void loadAllPosts()
                        }
                      }}
                    >
                      List
                    </Button>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      if (postPanelMode === 'queue')
                        void loadQueueOverview()
                      else
                        void loadAllPosts()
                    }}
                  >
                    Refresh
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              {postPanelMode === 'queue' && (
                <>
                  <div className="grid grid-cols-5 gap-1 text-[11px]">
                    {(['ready', 'queued', 'running', 'published', 'failed'] as QueueStatus[]).map(status => (
                      <button
                        key={status}
                        className={cn(
                          'rounded border px-2 py-1 uppercase',
                          queueStatus === status && 'bg-primary text-primary-foreground',
                        )}
                        onClick={() => setQueueStatus(status)}
                      >
                        {status}
                        <div className="font-semibold">{queueOverview.counts[status] || 0}</div>
                      </button>
                    ))}
                  </div>
                  <div className="rounded border p-2 max-h-[260px] overflow-auto space-y-1">
                    {currentQueueList.length === 0 && (
                      <div className="text-xs text-muted-foreground">No items</div>
                    )}
                    {currentQueueList.map(item => (
                      <div key={item.id} className="rounded border px-2 py-1">
                        <div className="text-xs font-medium truncate">{item.title || item.id}</div>
                        <div className="text-[11px] text-muted-foreground">{dayjs(item.publishTime).format('YYYY-MM-DD HH:mm')}</div>
                      </div>
                    ))}
                  </div>
                </>
              )}

              {postPanelMode === 'list' && (
                <>
                  <div className="text-[11px] text-muted-foreground">
                    All posts: {filteredTotalPosts} · showing {visiblePosts.length}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Select value={listPlatformFilter} onValueChange={setListPlatformFilter}>
                      <SelectTrigger className="h-8">
                        <SelectValue placeholder="Platform" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Platforms</SelectItem>
                        {listPlatformOptions.map(platform => (
                          <SelectItem key={platform} value={platform}>{platform}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select
                      value={listStatusFilter}
                      onValueChange={value => setListStatusFilter(value as ListStatusFilter)}
                    >
                      <SelectTrigger className="h-8">
                        <SelectValue placeholder="Status" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Status</SelectItem>
                        <SelectItem value="queued">Queued</SelectItem>
                        <SelectItem value="running">Running</SelectItem>
                        <SelectItem value="published">Published</SelectItem>
                        <SelectItem value="failed">Failed</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div
                    ref={postListContainerRef}
                    className="rounded border p-2 max-h-[360px] overflow-auto space-y-2"
                    onScroll={(event) => {
                      const element = event.currentTarget
                      setListScrollTop(element.scrollTop)
                      setListViewportHeight(element.clientHeight)
                      if (element.scrollTop + element.clientHeight >= element.scrollHeight - 60 && hasMorePosts) {
                        setVisiblePostCount(prev => Math.min(prev + 30, filteredTotalPosts))
                      }
                    }}
                  >
                    {postsLoading && (
                      <div className="text-xs text-muted-foreground">Loading posts...</div>
                    )}
                    {!postsLoading && virtualRows.length === 0 && (
                      <div className="text-xs text-muted-foreground">No posts</div>
                    )}
                    {virtualRows.length > 0 && (
                      <div style={{ height: virtualLayout.totalHeight, position: 'relative' }}>
                        {virtualRows.slice(virtualRange.start, virtualRange.end).map((row, index) => {
                          const actualIndex = virtualRange.start + index
                          const top = virtualLayout.offsets[actualIndex]
                          if (row.kind === 'date') {
                            return (
                              <div
                                key={row.key}
                                className="rounded border bg-background/95 text-[11px] font-semibold px-2 py-1"
                                style={{
                                  position: 'absolute',
                                  top,
                                  left: 0,
                                  right: 0,
                                  height: row.height,
                                }}
                              >
                                {dayjs(row.date).format('ddd, DD MMM YYYY')}
                              </div>
                            )
                          }

                          const item = row.item!
                          return (
                            <div
                              key={row.key}
                              className="rounded border px-2 py-1.5"
                              style={{
                                position: 'absolute',
                                top,
                                left: 0,
                                right: 0,
                                height: row.height,
                              }}
                            >
                              <div className="text-xs font-medium truncate">{item.title || item.id}</div>
                              <div className="text-[11px] text-muted-foreground flex items-center justify-between">
                                <span>{dayjs(item.publishTime).format('HH:mm')}</span>
                                <span className="uppercase">{item.accountType || '-'}</span>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}
                    {hasMorePosts && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="w-full"
                        onClick={() => setVisiblePostCount(prev => Math.min(prev + 30, filteredTotalPosts))}
                      >
                        Load more
                      </Button>
                    )}
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Recurrence Rules</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 max-h-[260px] overflow-auto">
              {rules.length === 0 && (
                <div className="text-xs text-muted-foreground">No rules</div>
              )}
              {rules.map(rule => (
                <div key={rule.id} className="rounded border p-2">
                  <div className="text-xs font-medium">
                    {rule.frequency} · {rule.timeOfDay} · {rule.status}
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    next: {dayjs(rule.nextRunAt).format('YYYY-MM-DD HH:mm')}
                  </div>
                  <div className="flex gap-2 mt-2">
                    <Button size="sm" variant="outline" onClick={() => void handleToggleRule(rule)}>
                      {rule.status === 'active' ? 'Pause' : 'Resume'}
                    </Button>
                    <Button size="sm" variant="destructive" onClick={() => void handleDeleteRule(rule.id)}>
                      Delete
                    </Button>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
