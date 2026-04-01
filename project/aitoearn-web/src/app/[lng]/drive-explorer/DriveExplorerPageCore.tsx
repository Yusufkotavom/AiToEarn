'use client'

import type { DriveBrowseItem, DriveImportMode, DriveImportStatus, DriveMediaType, DrivePreviewResult } from '@/api/driveExplorer'
import type { PromotionPlan } from '@/app/[lng]/brand-promotion/brandPromotionStore/types'
import { ArrowLeft, ArrowRight, FileImage, FileVideo, FolderOpen, RefreshCw, Star, StarOff } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { apiBrowseDrive, apiCreateDriveImport, apiGetDriveImportStatus, apiPreviewDriveImport } from '@/api/driveExplorer'
import { apiGetMaterialGroupList } from '@/api/material'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Progress } from '@/components/ui/progress'
import { toast } from '@/lib/toast'
import { useUserStore } from '@/store/user'

const PAGE_SIZE = 50
const DESKTOP_THUMBNAIL_LIMIT = 24
const MOBILE_THUMBNAIL_LIMIT = 8
const MAX_THUMBNAIL_SIZE_BYTES = 15 * 1024 * 1024
const BOOKMARK_STORAGE_KEY = 'drive-explorer-bookmarks'

function formatSize(size?: number): string {
  if (!size || size <= 0) {
    return '-'
  }

  const units = ['B', 'KB', 'MB', 'GB']
  let value = size
  let unitIndex = 0
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024
    unitIndex += 1
  }
  return `${value.toFixed(value >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`
}

export function DriveExplorerPageCore() {
  const pollTimerRef = useRef<NodeJS.Timeout | null>(null)
  const thumbnailUrlRef = useRef<Record<string, string>>({})

  const [inputPath, setInputPath] = useState('')
  const [currentPath, setCurrentPath] = useState('')
  const [mediaType, setMediaType] = useState<DriveMediaType>('all')
  const [importMode, setImportMode] = useState<DriveImportMode>('file')
  const [browseItems, setBrowseItems] = useState<DriveBrowseItem[]>([])
  const [nextCursor, setNextCursor] = useState<string | undefined>()
  const [loadingBrowse, setLoadingBrowse] = useState(false)
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set())
  const [groups, setGroups] = useState<PromotionPlan[]>([])
  const [groupId, setGroupId] = useState('')
  const [previewData, setPreviewData] = useState<DrivePreviewResult | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [importJobId, setImportJobId] = useState('')
  const [importStatus, setImportStatus] = useState<DriveImportStatus | null>(null)
  const [importing, setImporting] = useState(false)
  const [detectingFolders, setDetectingFolders] = useState(false)
  const [thumbnailUrls, setThumbnailUrls] = useState<Record<string, string>>({})
  const [isMobileViewport, setIsMobileViewport] = useState(false)
  const [bookmarkValue, setBookmarkValue] = useState('')
  const [bookmarks, setBookmarks] = useState<string[]>([])
  const [history, setHistory] = useState<string[]>([])
  const [historyIndex, setHistoryIndex] = useState(-1)

  const token = useUserStore(state => state.token)
  const language = useUserStore(state => state.lang)

  const fileItems = useMemo(() => (browseItems || []).filter(item => item.kind === 'file'), [browseItems])
  const directoryItems = useMemo(() => (browseItems || []).filter(item => item.kind === 'directory'), [browseItems])
  const selectableItems = useMemo(
    () => importMode === 'folder' ? directoryItems : fileItems,
    [directoryItems, fileItems, importMode],
  )
  const selectedCount = selectedPaths.size
  const apiBaseUrl = useMemo(() => (process.env.NEXT_PUBLIC_API_URL || '').replace(/\/$/, ''), [])
  const importPercent = useMemo(() => {
    if (!importStatus) {
      return 0
    }
    const safeTotal = Math.max(importStatus.total, 1)
    return Math.max(0, Math.min(100, Math.round((importStatus.processed / safeTotal) * 100)))
  }, [importStatus])
  const canGoBack = historyIndex > 0
  const canGoForward = historyIndex >= 0 && historyIndex < history.length - 1

  const fetchGroups = useCallback(async () => {
    const res = await apiGetMaterialGroupList(1, 100)
    const list = res?.data?.list || []
    setGroups(list)
    if (!groupId && list.length > 0) {
      setGroupId(list[0].id)
    }
  }, [groupId])

  const fetchBrowse = useCallback(async (pathValue: string, cursor?: string, reset = false, recordHistory = false) => {
    if (!pathValue.trim()) {
      toast.error('Path is required')
      return
    }

    setLoadingBrowse(true)
    try {
      const res = await apiBrowseDrive({
        path: pathValue.trim(),
        cursor,
        pageSize: PAGE_SIZE,
        mediaType,
      })

      if (!res?.data) {
        toast.error(res?.message || 'Failed to browse path')
        return
      }

      setCurrentPath(res.data.path)
      setInputPath(res.data.path)
      setNextCursor(res.data.nextCursor)
      setBrowseItems(prev => (reset ? (res.data.list || []) : [...prev, ...(res.data.list || [])]))
      if (reset && recordHistory) {
        const nextPath = res.data.path
        setHistory((prev) => {
          const base = prev.slice(0, historyIndex + 1)
          if (base[base.length - 1] === nextPath) {
            return base
          }
          const nextHistory = [...base, nextPath].slice(-50)
          setHistoryIndex(nextHistory.length - 1)
          return nextHistory
        })
      }
      if (reset) {
        setSelectedPaths(new Set())
        setPreviewData(null)
      }
    }
    catch {
      toast.error('Failed to browse path')
    }
    finally {
      setLoadingBrowse(false)
    }
  }, [historyIndex, mediaType])

  const handleBrowse = useCallback(() => {
    void fetchBrowse(inputPath, undefined, true, true)
  }, [fetchBrowse, inputPath])

  const handleLoadMore = useCallback(() => {
    if (!nextCursor || !currentPath) {
      return
    }
    void fetchBrowse(currentPath, nextCursor, false)
  }, [currentPath, fetchBrowse, nextCursor])

  const togglePath = useCallback((filePath: string) => {
    setSelectedPaths((prev) => {
      const next = new Set(prev)
      if (next.has(filePath)) {
        next.delete(filePath)
      }
      else {
        next.add(filePath)
      }
      return next
    })
  }, [])

  const handleSelectAllVisible = useCallback(() => {
    setSelectedPaths((prev) => {
      const next = new Set(prev)
      const allSelected = selectableItems.length > 0 && selectableItems.every(item => next.has(item.path))
      if (allSelected) {
        selectableItems.forEach(item => next.delete(item.path))
      }
      else {
        selectableItems.forEach(item => next.add(item.path))
      }
      return next
    })
  }, [selectableItems])

  const handleDetectAllFoldersInRoot = useCallback(async () => {
    const rootPath = (currentPath || inputPath).trim()
    if (!rootPath) {
      toast.error('Path is required')
      return
    }

    setDetectingFolders(true)
    try {
      const found = new Set<string>()
      let cursor: string | undefined
      let loops = 0
      while (loops < 100) {
        loops += 1
        const res = await apiBrowseDrive({
          path: rootPath,
          cursor,
          pageSize: 200,
          mediaType: 'all',
        })
        const list = res?.data?.list || []
        for (const item of list) {
          if (item.kind === 'directory') {
            found.add(item.path)
          }
        }
        cursor = res?.data?.nextCursor
        if (!cursor) {
          break
        }
      }

      if (found.size === 0) {
        toast.error('No folders found in this root')
        return
      }

      setImportMode('folder')
      setSelectedPaths(found)
      setPreviewData(null)
      toast.success(`Detected ${found.size} folders`)
    }
    catch {
      toast.error('Failed to detect folders')
    }
    finally {
      setDetectingFolders(false)
    }
  }, [currentPath, inputPath])

  const handleOpenDirectory = useCallback((dirPath: string) => {
    void fetchBrowse(dirPath, undefined, true, true)
  }, [fetchBrowse])

  const handleGoBack = useCallback(() => {
    if (!canGoBack) {
      return
    }
    const nextIndex = historyIndex - 1
    const pathValue = history[nextIndex]
    if (!pathValue) {
      return
    }
    setHistoryIndex(nextIndex)
    void fetchBrowse(pathValue, undefined, true, false)
  }, [canGoBack, fetchBrowse, history, historyIndex])

  const handleGoForward = useCallback(() => {
    if (!canGoForward) {
      return
    }
    const nextIndex = historyIndex + 1
    const pathValue = history[nextIndex]
    if (!pathValue) {
      return
    }
    setHistoryIndex(nextIndex)
    void fetchBrowse(pathValue, undefined, true, false)
  }, [canGoForward, fetchBrowse, history, historyIndex])

  const handleAddBookmark = useCallback(() => {
    const pathValue = (currentPath || inputPath).trim()
    if (!pathValue) {
      toast.error('Path is required')
      return
    }

    setBookmarks((prev) => {
      if (prev.includes(pathValue)) {
        toast.error('Path already bookmarked')
        return prev
      }
      toast.success('Bookmark added')
      return [pathValue, ...prev].slice(0, 30)
    })
  }, [currentPath, inputPath])

  const handleRemoveBookmark = useCallback(() => {
    const pathValue = (currentPath || inputPath).trim()
    if (!pathValue) {
      return
    }

    setBookmarks((prev) => {
      const next = prev.filter(item => item !== pathValue)
      if (next.length !== prev.length) {
        toast.success('Bookmark removed')
        if (bookmarkValue === pathValue) {
          setBookmarkValue('')
        }
      }
      return next
    })
  }, [bookmarkValue, currentPath, inputPath])

  const handleSelectBookmark = useCallback((pathValue: string) => {
    setBookmarkValue(pathValue)
    setInputPath(pathValue)
    void fetchBrowse(pathValue, undefined, true, true)
  }, [fetchBrowse])

  const handlePreview = useCallback(async () => {
    if (!groupId) {
      toast.error('Please choose a target draft group')
      return
    }
    if (selectedPaths.size === 0) {
      toast.error(importMode === 'folder' ? 'Please select at least one folder' : 'Please select at least one file')
      return
    }

    setPreviewLoading(true)
    try {
      const res = await apiPreviewDriveImport({
        groupId,
        paths: Array.from(selectedPaths),
        mode: importMode,
      })
      if (!res?.data) {
        toast.error(res?.message || 'Preview failed')
        return
      }
      setPreviewData(res.data)
    }
    catch {
      toast.error('Preview failed')
    }
    finally {
      setPreviewLoading(false)
    }
  }, [groupId, importMode, selectedPaths])

  const stopPolling = useCallback(() => {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current)
      pollTimerRef.current = null
    }
  }, [])

  const pollImportStatus = useCallback((jobId: string) => {
    stopPolling()
    pollTimerRef.current = setInterval(async () => {
      const res = await apiGetDriveImportStatus(jobId)
      if (!res?.data) {
        return
      }

      setImportStatus(res.data)
      if (res.data.status === 'completed' || res.data.status === 'failed') {
        stopPolling()
        setImporting(false)
      }
    }, 2000)
  }, [stopPolling])

  const handleImport = useCallback(async () => {
    if (!groupId) {
      toast.error('Please choose a target draft group')
      return
    }
    if (selectedPaths.size === 0) {
      toast.error(importMode === 'folder' ? 'Please select at least one folder' : 'Please select at least one file')
      return
    }

    setImporting(true)
    try {
      const res = await apiCreateDriveImport({
        groupId,
        paths: Array.from(selectedPaths),
        mode: importMode,
      })
      const jobId = res?.data?.jobId
      if (!jobId) {
        setImporting(false)
        toast.error(res?.message || 'Failed to create import job')
        return
      }

      setImportJobId(jobId)
      toast.success('Import job created')
      pollImportStatus(jobId)
    }
    catch {
      setImporting(false)
      toast.error('Failed to create import job')
    }
  }, [groupId, importMode, selectedPaths, pollImportStatus])

  useEffect(() => {
    setSelectedPaths(new Set())
    setPreviewData(null)
  }, [importMode])

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }
    const media = window.matchMedia('(max-width: 767px)')
    const update = () => setIsMobileViewport(media.matches)
    update()
    if (typeof media.addEventListener === 'function') {
      media.addEventListener('change', update)
      return () => media.removeEventListener('change', update)
    }
    media.addListener(update)
    return () => media.removeListener(update)
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }
    try {
      const raw = window.localStorage.getItem(BOOKMARK_STORAGE_KEY)
      if (!raw) {
        return
      }
      const parsed = JSON.parse(raw)
      if (!Array.isArray(parsed)) {
        return
      }
      const cleaned = parsed.filter(item => typeof item === 'string' && item.trim())
      setBookmarks(cleaned.slice(0, 30))
    }
    catch {
      // Ignore invalid persisted bookmarks.
    }
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }
    window.localStorage.setItem(BOOKMARK_STORAGE_KEY, JSON.stringify(bookmarks))
  }, [bookmarks])

  useEffect(() => {
    void fetchGroups()
    return () => {
      stopPolling()
      Object.values(thumbnailUrlRef.current).forEach(url => URL.revokeObjectURL(url))
      thumbnailUrlRef.current = {}
    }
  }, [fetchGroups, stopPolling])

  useEffect(() => {
    const imageItems = (browseItems || [])
      .filter(item => item.kind === 'file' && item.mediaType === 'img')
      .filter(item => (item.size || 0) <= MAX_THUMBNAIL_SIZE_BYTES)
      .slice(0, isMobileViewport ? MOBILE_THUMBNAIL_LIMIT : DESKTOP_THUMBNAIL_LIMIT)

    Object.values(thumbnailUrlRef.current).forEach(url => URL.revokeObjectURL(url))
    thumbnailUrlRef.current = {}
    setThumbnailUrls({})

    if (!token || !apiBaseUrl || imageItems.length === 0) {
      return
    }

    let canceled = false

    const loadThumbnails = async () => {
      for (const item of imageItems) {
        if (canceled) {
          return
        }

        try {
          const response = await fetch(
            `${apiBaseUrl}/ai/drive-explorer/thumbnail?path=${encodeURIComponent(item.path)}`,
            {
              headers: {
                Authorization: `Bearer ${token}`,
                'Accept-Language': language || 'en',
              },
            },
          )

          if (!response.ok) {
            continue
          }

          const blob = await response.blob()
          const objectUrl = URL.createObjectURL(blob)
          thumbnailUrlRef.current[item.path] = objectUrl

          setThumbnailUrls((prev) => {
            if (canceled) {
              URL.revokeObjectURL(objectUrl)
              return prev
            }
            return {
              ...prev,
              [item.path]: objectUrl,
            }
          })
        }
        catch {
          // Ignore failed thumbnails per item.
        }
      }
    }

    void loadThumbnails()

    return () => {
      canceled = true
      Object.values(thumbnailUrlRef.current).forEach(url => URL.revokeObjectURL(url))
      thumbnailUrlRef.current = {}
    }
  }, [apiBaseUrl, browseItems, isMobileViewport, language, token])

  const renderThumbnail = useCallback((item: DriveBrowseItem) => {
    if (item.kind === 'directory') {
      return (
        <div className="w-12 h-12 rounded-md bg-muted flex items-center justify-center shrink-0">
          <FolderOpen className="w-5 h-5 text-muted-foreground" />
        </div>
      )
    }

    if (item.mediaType === 'img') {
      const thumbnailUrl = thumbnailUrls[item.path]
      if (thumbnailUrl) {
        return (
          <img
            src={thumbnailUrl}
            alt={item.name}
            className="w-12 h-12 rounded-md object-cover border shrink-0"
            loading="lazy"
          />
        )
      }

      return (
        <div className="w-12 h-12 rounded-md bg-muted flex items-center justify-center shrink-0 border">
          <FileImage className="w-5 h-5 text-muted-foreground" />
        </div>
      )
    }

    return (
      <div className="w-12 h-12 rounded-md bg-muted flex items-center justify-center shrink-0 border">
        <FileVideo className="w-5 h-5 text-muted-foreground" />
      </div>
    )
  }, [thumbnailUrls])

  return (
    <div className="p-3 pb-24 md:p-6 md:pb-6 space-y-4 min-h-full">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Drive Explorer</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
            <Input
              className="md:col-span-4"
              placeholder="Absolute path, e.g. /mnt/social-drive"
              value={inputPath}
              onChange={e => setInputPath(e.target.value)}
            />
            <Select value={mediaType} onValueChange={value => setMediaType(value as DriveMediaType)}>
              <SelectTrigger className="md:col-span-2">
                <SelectValue placeholder="Media type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="video">Video</SelectItem>
                <SelectItem value="img">Image</SelectItem>
              </SelectContent>
            </Select>
            <Select value={importMode} onValueChange={value => setImportMode(value as DriveImportMode)}>
              <SelectTrigger className="md:col-span-2">
                <SelectValue placeholder="Import mode" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="file">Import by File</SelectItem>
                <SelectItem value="folder">Import by Folder</SelectItem>
              </SelectContent>
            </Select>
            <Select value={groupId} onValueChange={setGroupId}>
              <SelectTrigger className="md:col-span-2">
                <SelectValue placeholder="Target draft group" />
              </SelectTrigger>
              <SelectContent>
                {groups.map(group => (
                  <SelectItem key={group.id} value={group.id}>{group.name || group.title || group.id}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button className="md:col-span-2" onClick={handleBrowse} disabled={loadingBrowse}>
              {loadingBrowse ? 'Browsing...' : 'Browse'}
            </Button>
          </div>

          <div className="grid grid-cols-2 md:flex gap-2">
            <Button variant="outline" onClick={handleGoBack} disabled={!canGoBack || loadingBrowse}>
              <ArrowLeft className="w-4 h-4 mr-1" />
              Back
            </Button>
            <Button variant="outline" onClick={handleGoForward} disabled={!canGoForward || loadingBrowse}>
              <ArrowRight className="w-4 h-4 mr-1" />
              Forward
            </Button>
            <Button variant="outline" onClick={handleAddBookmark}>
              <Star className="w-4 h-4 mr-1" />
              Bookmark
            </Button>
            <Button variant="outline" onClick={handleRemoveBookmark}>
              <StarOff className="w-4 h-4 mr-1" />
              Remove Bookmark
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
            <Select onValueChange={handleSelectBookmark} value={bookmarkValue}>
              <SelectTrigger className="md:col-span-6">
                <SelectValue placeholder="Open bookmarked path" />
              </SelectTrigger>
              <SelectContent>
                {bookmarks.map(pathValue => (
                  <SelectItem key={pathValue} value={pathValue}>{pathValue}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:flex gap-2">
            <Button variant="outline" onClick={handleSelectAllVisible} disabled={selectableItems.length === 0}>
              {importMode === 'folder' ? 'Toggle Select Visible Folders' : 'Toggle Select Visible Files'}
            </Button>
            <Button
              variant="outline"
              onClick={handleDetectAllFoldersInRoot}
              disabled={detectingFolders || loadingBrowse}
            >
              {detectingFolders ? 'Detecting Folders...' : 'Detect All Folders in Root'}
            </Button>
            <Button variant="outline" onClick={handlePreview} disabled={previewLoading || selectedCount === 0}>
              {previewLoading ? 'Preparing Preview...' : 'Preview Import'}
            </Button>
            <Button onClick={handleImport} disabled={importing || selectedCount === 0}>
              {importing ? 'Importing...' : 'Import to Drafts'}
            </Button>
            <Button variant="ghost" onClick={() => { void fetchGroups() }}>
              <RefreshCw className="w-4 h-4 mr-1" />
              Refresh Groups
            </Button>
          </div>

          <div className="text-sm text-muted-foreground break-all">
            Current Path:
            {' '}
            <span className="font-mono">{currentPath || '-'}</span>
            {' | Mode: '}
            {importMode}
            {' | '}
            History:
            {' '}
            {history.length === 0 ? '-' : `${historyIndex + 1}/${history.length}`}
            {' | '}
            Selected:
            {' '}
            {selectedCount}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Files & Folders</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="md:hidden space-y-2">
            {(browseItems || []).map(item => (
              <div key={item.path} className="border rounded-md p-3 space-y-2">
                <div className="flex items-start gap-3">
                  {renderThumbnail(item)}
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      {item.kind === 'directory'
                        ? (
                            <button
                              className="inline-flex items-center gap-1 text-primary hover:underline text-left"
                              onClick={() => handleOpenDirectory(item.path)}
                            >
                              <FolderOpen className="w-4 h-4" />
                              <span className="truncate">{item.name}</span>
                            </button>
                          )
                        : <span className="font-medium break-all">{item.name}</span>}

                      {((importMode === 'file' && item.kind === 'file')
                        || (importMode === 'folder' && item.kind === 'directory')) && (
                        <Checkbox
                          checked={selectedPaths.has(item.path)}
                          onCheckedChange={() => togglePath(item.path)}
                        />
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Type: {item.kind === 'directory' ? 'directory' : item.mediaType}
                      {' | '}
                      Size: {item.kind === 'file' ? formatSize(item.size) : '-'}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Metadata: {item.kind === 'file' ? (item.hasMetadataJson ? 'json found' : 'json missing') : '-'}
                    </div>
                  </div>
                </div>
                <div className="font-mono text-[11px] text-muted-foreground break-all">{item.path}</div>
              </div>
            ))}
            {(browseItems || []).length === 0 && (
              <div className="p-4 text-center text-muted-foreground border rounded-md">No data</div>
            )}
          </div>

          <div className="hidden md:block overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[50px]">Sel</TableHead>
                  <TableHead className="w-[72px]">Thumb</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Size</TableHead>
                  <TableHead>Metadata</TableHead>
                  <TableHead>Path</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(browseItems || []).map(item => (
                  <TableRow key={item.path}>
                    <TableCell>
                      {((importMode === 'file' && item.kind === 'file')
                        || (importMode === 'folder' && item.kind === 'directory')) && (
                        <Checkbox
                          checked={selectedPaths.has(item.path)}
                          onCheckedChange={() => togglePath(item.path)}
                        />
                      )}
                    </TableCell>
                    <TableCell>{renderThumbnail(item)}</TableCell>
                    <TableCell>
                      {item.kind === 'directory'
                        ? (
                            <button
                              className="inline-flex items-center gap-1 text-primary hover:underline"
                              onClick={() => handleOpenDirectory(item.path)}
                            >
                              <FolderOpen className="w-4 h-4" />
                              {item.name}
                            </button>
                          )
                        : item.name}
                    </TableCell>
                    <TableCell>{item.kind === 'directory' ? 'directory' : item.mediaType}</TableCell>
                    <TableCell>{item.kind === 'file' ? formatSize(item.size) : '-'}</TableCell>
                    <TableCell>{item.kind === 'file' ? (item.hasMetadataJson ? 'json found' : 'json missing') : '-'}</TableCell>
                    <TableCell className="font-mono text-xs break-all">{item.path}</TableCell>
                  </TableRow>
                ))}
                {(browseItems || []).length === 0 && (
                  <TableRow>
                    <td colSpan={7} className="p-4 text-center text-muted-foreground">No data</td>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          {nextCursor && (
            <div className="pt-4">
              <Button variant="outline" onClick={handleLoadMore} disabled={loadingBrowse}>
                Load More
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {previewData && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Preview Summary</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="text-sm text-muted-foreground">
              Total: {previewData.total}
              {' | '}
              Valid: {previewData.validCount}
              {' | '}
              Duplicates: {previewData.duplicateCount}
            </div>
            <div className="max-h-64 overflow-auto border rounded-md p-2">
              {previewData.list.map(item => (
                <div key={item.path} className="text-xs py-1 border-b last:border-b-0">
                  <div className="font-mono break-all">{item.path}</div>
                  {item.resolvedPath && item.resolvedPath !== item.path && (
                    <div className="font-mono break-all text-muted-foreground">
                      resolved=
                      {item.resolvedPath}
                    </div>
                  )}
                  <div>
                    valid=
                    {String(item.valid)}
                    {' | duplicate='}
                    {String(item.duplicate)}
                    {' | json='}
                    {item.jsonStatus}
                    {item.reason ? ` | reason=${item.reason}` : ''}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {importStatus && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Import Job Status</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Progress</span>
                <span>{importPercent}%</span>
              </div>
              <Progress value={importPercent} />
            </div>
            <div className="text-sm text-muted-foreground break-all">
              Job:
              {' '}
              {importJobId}
              {' | Status: '}
              {importStatus.status}
              {' | Processed: '}
              {importStatus.processed}
              /
              {importStatus.total}
              {' | Created: '}
              {importStatus.created}
              {' | Skipped: '}
              {importStatus.skipped}
              {' | Failed: '}
              {importStatus.failed}
            </div>
            <div className="max-h-64 overflow-auto border rounded-md p-2">
              {importStatus.items.map((item, index) => (
                <div key={`${item.path}-${index}`} className="text-xs py-1 border-b last:border-b-0">
                  <div className="font-mono break-all">{item.path}</div>
                  <div>
                    status=
                    {item.status}
                    {item.materialId ? ` | materialId=${item.materialId}` : ''}
                    {item.reason ? ` | reason=${item.reason}` : ''}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
