'use client'

import { ExternalLink, Pencil, Plus, Save, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import seedTools from '@/config/internal-tools.json'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { toast } from '@/lib/toast'

interface InternalToolItem {
  id: string
  title: string
  url: string
  description?: string
  enabled: boolean
}

const STORAGE_KEY = 'internal-tools-hub:v1'

function validateUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  }
  catch {
    return false
  }
}

export function InternalToolsPageCore() {
  const [tools, setTools] = useState<InternalToolItem[]>([])
  const [activeId, setActiveId] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [url, setUrl] = useState('')
  const [description, setDescription] = useState('')
  const [enabled, setEnabled] = useState(true)

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY)
      if (raw) {
        const parsed = JSON.parse(raw) as InternalToolItem[]
        if (Array.isArray(parsed) && parsed.length > 0) {
          setTools(parsed)
          const firstEnabled = parsed.find(item => item.enabled)
          setActiveId((firstEnabled || parsed[0]).id)
          return
        }
      }
    }
    catch {
      // Ignore invalid localStorage payload.
    }

    const defaults = (seedTools as InternalToolItem[]).map(item => ({
      ...item,
      enabled: item.enabled !== false,
    }))
    setTools(defaults)
    if (defaults.length > 0) {
      setActiveId(defaults[0].id)
    }
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(tools))
  }, [tools])

  const activeTool = useMemo(() => tools.find(item => item.id === activeId), [activeId, tools])

  const resetForm = () => {
    setEditingId(null)
    setTitle('')
    setUrl('')
    setDescription('')
    setEnabled(true)
  }

  const handleSave = () => {
    const nextTitle = title.trim()
    const nextUrl = url.trim()
    if (!nextTitle) {
      toast.error('Title is required')
      return
    }
    if (!nextUrl || !validateUrl(nextUrl)) {
      toast.error('Valid URL is required')
      return
    }

    if (editingId) {
      setTools(prev => prev.map(item => item.id === editingId
        ? {
            ...item,
            title: nextTitle,
            url: nextUrl,
            description: description.trim(),
            enabled,
          }
        : item))
      toast.success('Tool updated')
      return
    }

    const newItem: InternalToolItem = {
      id: `tool-${Date.now()}`,
      title: nextTitle,
      url: nextUrl,
      description: description.trim(),
      enabled,
    }
    setTools(prev => [newItem, ...prev])
    setActiveId(newItem.id)
    resetForm()
    toast.success('Tool added')
  }

  const handleEdit = (item: InternalToolItem) => {
    setEditingId(item.id)
    setTitle(item.title)
    setUrl(item.url)
    setDescription(item.description || '')
    setEnabled(item.enabled)
  }

  const handleDelete = (id: string) => {
    setTools((prev) => {
      const next = prev.filter(item => item.id !== id)
      if (activeId === id) {
        const firstEnabled = next.find(item => item.enabled)
        setActiveId(firstEnabled?.id || next[0]?.id || '')
      }
      return next
    })
    if (editingId === id) {
      resetForm()
    }
    toast.success('Tool removed')
  }

  const handleToggleEnabled = (id: string, checked: boolean) => {
    setTools(prev => prev.map(item => item.id === id ? { ...item, enabled: checked } : item))
  }

  const handleOpenNewTab = () => {
    if (!activeTool?.url) {
      return
    }
    window.open(activeTool.url, '_blank', 'noopener,noreferrer')
  }

  return (
    <div className="p-3 md:p-6 grid grid-cols-1 xl:grid-cols-12 gap-4 min-h-full">
      <Card className="xl:col-span-4">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Internal Tools Hub</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 gap-2">
            <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="Tool title" />
            <Input value={url} onChange={e => setUrl(e.target.value)} placeholder="Tool URL (http/https)" />
            <Input value={description} onChange={e => setDescription(e.target.value)} placeholder="Description (optional)" />
            <div className="flex items-center gap-2 text-sm">
              <Checkbox checked={enabled} onCheckedChange={checked => setEnabled(Boolean(checked))} />
              Enabled
            </div>
            <div className="flex items-center gap-2">
              <Button className="flex-1" onClick={handleSave}>
                {editingId ? <Save className="w-4 h-4 mr-1" /> : <Plus className="w-4 h-4 mr-1" />}
                {editingId ? 'Save Changes' : 'Add Tool'}
              </Button>
              {editingId && (
                <Button variant="outline" onClick={resetForm}>Cancel</Button>
              )}
            </div>
          </div>

          <div className="border rounded-md max-h-[55vh] overflow-auto">
            {tools.length === 0 && (
              <div className="p-3 text-sm text-muted-foreground">No tools configured.</div>
            )}
            {tools.map(item => (
              <div
                key={item.id}
                className={`p-3 border-b last:border-b-0 cursor-pointer ${activeId === item.id ? 'bg-muted/60' : ''}`}
                onClick={() => setActiveId(item.id)}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-medium truncate">{item.title}</div>
                    <div className="text-xs text-muted-foreground truncate">{item.url}</div>
                    {item.description && (
                      <div className="text-xs text-muted-foreground mt-1">{item.description}</div>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Checkbox
                      checked={item.enabled}
                      onCheckedChange={checked => handleToggleEnabled(item.id, Boolean(checked))}
                      onClick={e => e.stopPropagation()}
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={(e) => {
                        e.stopPropagation()
                        handleEdit(item)
                      }}
                    >
                      <Pencil className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-destructive"
                      onClick={(e) => {
                        e.stopPropagation()
                        handleDelete(item.id)
                      }}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card className="xl:col-span-8">
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <CardTitle className="text-base truncate">
            {activeTool ? activeTool.title : 'Preview'}
          </CardTitle>
          <Button
            variant="outline"
            size="sm"
            onClick={handleOpenNewTab}
            disabled={!activeTool?.url}
          >
            <ExternalLink className="w-4 h-4 mr-1" />
            Open in New Tab
          </Button>
        </CardHeader>
        <CardContent>
          {!activeTool && (
            <div className="h-[70vh] rounded-md border flex items-center justify-center text-muted-foreground">
              Select a tool.
            </div>
          )}
          {activeTool && !activeTool.enabled && (
            <div className="h-[70vh] rounded-md border flex items-center justify-center text-muted-foreground">
              This tool is disabled.
            </div>
          )}
          {activeTool && activeTool.enabled && (
            <iframe
              key={activeTool.id}
              title={activeTool.title}
              src={activeTool.url}
              className="w-full h-[70vh] rounded-md border"
              referrerPolicy="no-referrer"
            />
          )}
        </CardContent>
      </Card>
    </div>
  )
}
