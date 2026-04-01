'use client'

import { Loader2, Play, Square, WandSparkles } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  generateImage,
  getImageGenerationModels,
  getImageTaskStatus,
  listPlaywrightProfiles,
} from '@/api/ai'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { toast } from '@/lib/toast'
import { getOssUrl } from '@/utils/oss'

interface PlaywrightProfileOption {
  id: string
  label: string
  status: string
}

interface ImageModelOption {
  name: string
  sizes: string[]
}

type BatchItemStatus = 'queued' | 'submitted' | 'running' | 'success' | 'failed' | 'cancelled'

interface BatchItemResult {
  index: number
  prompt: string
  status: BatchItemStatus
  logId?: string
  images: string[]
  error?: string
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function parsePrompts(raw: string) {
  return raw
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)
}

function normalizeModels(res: any): ImageModelOption[] {
  const list = Array.isArray(res?.data) ? res.data : []
  return list
    .map((item: any) => ({
      name: String(item?.name || ''),
      sizes: Array.isArray(item?.sizes) ? item.sizes.map((v: any) => String(v)) : [],
    }))
    .filter((item: ImageModelOption) => item.name.startsWith('google-flow-browser-image'))
}

function normalizeProfiles(res: any): PlaywrightProfileOption[] {
  const list = Array.isArray(res?.data?.profiles) ? res.data.profiles : []
  return list.map((item: any) => ({
    id: String(item?.id || ''),
    label: String(item?.label || item?.id || ''),
    status: String(item?.status || 'idle'),
  })).filter((item: PlaywrightProfileOption) => item.id)
}

export function PlaywrightBatchPageCore() {
  const [profiles, setProfiles] = useState<PlaywrightProfileOption[]>([])
  const [imageModels, setImageModels] = useState<ImageModelOption[]>([])
  const [selectedProfileId, setSelectedProfileId] = useState('')
  const [selectedModel, setSelectedModel] = useState('')
  const [selectedSize, setSelectedSize] = useState('1024x1024')
  const [imageCount, setImageCount] = useState('1')
  const [promptText, setPromptText] = useState('')
  const [running, setRunning] = useState(false)
  const [currentIndex, setCurrentIndex] = useState<number | null>(null)
  const [results, setResults] = useState<BatchItemResult[]>([])

  const cancelRef = useRef(false)
  const resultsRef = useRef<BatchItemResult[]>([])

  useEffect(() => {
    resultsRef.current = results
  }, [results])

  const selectedModelMeta = useMemo(
    () => imageModels.find(item => item.name === selectedModel),
    [imageModels, selectedModel],
  )

  const loadOptions = useCallback(async () => {
    const [profilesRes, modelsRes] = await Promise.all([
      listPlaywrightProfiles(),
      getImageGenerationModels(),
    ])

    const nextProfiles = normalizeProfiles(profilesRes)
    const nextModels = normalizeModels(modelsRes)

    setProfiles(nextProfiles)
    setImageModels(nextModels)

    const storedProfile = localStorage.getItem('ai_image_playwright_profile_id') || localStorage.getItem('playwright_profile_id') || ''
    const profileExists = nextProfiles.some(item => item.id === storedProfile)
    const profileId = profileExists ? storedProfile : nextProfiles[0]?.id || ''
    setSelectedProfileId(profileId)

    const firstModel = nextModels[0]
    if (firstModel) {
      setSelectedModel(firstModel.name)
      setSelectedSize(firstModel.sizes[0] || '1024x1024')
    }
  }, [])

  useEffect(() => {
    void loadOptions().catch((error: any) => {
      toast.error(error?.message || 'Failed to load Playwright options')
    })
  }, [loadOptions])

  useEffect(() => {
    if (!selectedProfileId)
      return
    localStorage.setItem('ai_image_playwright_profile_id', selectedProfileId)
  }, [selectedProfileId])

  useEffect(() => {
    if (!selectedModelMeta)
      return
    if (!selectedModelMeta.sizes.includes(selectedSize)) {
      setSelectedSize(selectedModelMeta.sizes[0] || '1024x1024')
    }
  }, [selectedModelMeta, selectedSize])

  const updateResult = useCallback((index: number, updater: (prev: BatchItemResult) => BatchItemResult) => {
    setResults((prev) => {
      const next = [...prev]
      if (!next[index])
        return prev
      next[index] = updater(next[index])
      return next
    })
  }, [])

  const pollTaskUntilDone = useCallback(async (logId: string, index: number) => {
    const startedAt = Date.now()
    while (Date.now() - startedAt < 12 * 60 * 1000) {
      if (cancelRef.current) {
        updateResult(index, prev => ({ ...prev, status: 'cancelled', error: 'Cancelled by user' }))
        return
      }

      const res: any = await getImageTaskStatus(logId)
      const status = String(res?.data?.status || '').toLowerCase()

      if (status === 'success') {
        const images = Array.isArray(res?.data?.images)
          ? res.data.images.map((item: any) => getOssUrl(String(item?.url || ''))).filter(Boolean)
          : []
        updateResult(index, prev => ({ ...prev, status: 'success', images }))
        return
      }

      if (status === 'failed') {
        updateResult(index, prev => ({
          ...prev,
          status: 'failed',
          error: String(res?.data?.errorMessage || 'Generation failed'),
        }))
        return
      }

      updateResult(index, prev => ({ ...prev, status: 'running' }))
      await sleep(4000)
    }

    updateResult(index, prev => ({ ...prev, status: 'failed', error: 'Task timeout' }))
  }, [updateResult])

  const runBatch = useCallback(async () => {
    const prompts = parsePrompts(promptText)
    const parsedCount = Number.parseInt(imageCount, 10)
    const n = Number.isFinite(parsedCount) ? Math.max(1, Math.min(parsedCount, 8)) : 1

    if (!selectedProfileId) {
      toast.error('Select Playwright profile first')
      return
    }
    if (!selectedModel) {
      toast.error('Select image model first')
      return
    }
    if (!prompts.length) {
      toast.error('Input prompts first (one prompt per line)')
      return
    }

    cancelRef.current = false
    setRunning(true)
    setCurrentIndex(0)

    const initialResults: BatchItemResult[] = prompts.map((prompt, index) => ({
      index,
      prompt,
      status: 'queued',
      images: [],
    }))
    setResults(initialResults)

    try {
      for (let index = 0; index < prompts.length; index += 1) {
        if (cancelRef.current) {
          setResults(prev => prev.map((item, itemIndex) => (
            itemIndex >= index && item.status === 'queued'
              ? { ...item, status: 'cancelled', error: 'Cancelled by user' }
              : item
          )))
          break
        }

        setCurrentIndex(index)
        updateResult(index, prev => ({ ...prev, status: 'submitted' }))

        try {
          const res: any = await generateImage({
            model: selectedModel,
            prompt: prompts[index],
            n,
            size: selectedSize,
            response_format: 'url',
            profileId: selectedProfileId,
          })
          const logId = String(res?.data?.logId || '')
          if (!logId) {
            throw new Error('Missing logId from generate response')
          }

          updateResult(index, prev => ({ ...prev, logId, status: 'running' }))
          await pollTaskUntilDone(logId, index)
        }
        catch (error: any) {
          updateResult(index, prev => ({
            ...prev,
            status: 'failed',
            error: String(error?.message || 'Generation request failed'),
          }))
        }
      }
    }
    finally {
      setCurrentIndex(null)
      setRunning(false)

      const snapshot = resultsRef.current
      const successCount = snapshot.filter(item => item.status === 'success').length
      const failedCount = snapshot.filter(item => item.status === 'failed').length
      if (successCount > 0 || failedCount > 0) {
        toast.success(`Batch finished. success=${successCount} failed=${failedCount}`)
      }
    }
  }, [imageCount, pollTaskUntilDone, promptText, selectedModel, selectedProfileId, selectedSize, updateResult])

  const stopBatch = useCallback(() => {
    cancelRef.current = true
    toast.success('Stop requested. Finishing current polling cycle...')
  }, [])

  const doneCount = useMemo(
    () => results.filter(item => ['success', 'failed', 'cancelled'].includes(item.status)).length,
    [results],
  )

  return (
    <div className="max-w-7xl mx-auto p-4 md:p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <WandSparkles className="h-6 w-6" />
          Playwright Batch Generator
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Input banyak prompt, satu prompt per baris. Sistem akan generate berurutan per baris.
        </p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Batch Inputs</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
            <div>
              <div className="text-xs text-muted-foreground mb-1">Playwright Profile</div>
              <Select value={selectedProfileId || undefined} onValueChange={setSelectedProfileId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select profile" />
                </SelectTrigger>
                <SelectContent>
                  {profiles.map(item => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.label} ({item.status})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <div className="text-xs text-muted-foreground mb-1">Image Model</div>
              <Select
                value={selectedModel || undefined}
                onValueChange={(value) => {
                  setSelectedModel(value)
                  const found = imageModels.find(item => item.name === value)
                  if (found) {
                    setSelectedSize(found.sizes[0] || '1024x1024')
                  }
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select model" />
                </SelectTrigger>
                <SelectContent>
                  {imageModels.map(item => (
                    <SelectItem key={item.name} value={item.name}>{item.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <div className="text-xs text-muted-foreground mb-1">Resolution</div>
              <Select value={selectedSize} onValueChange={setSelectedSize}>
                <SelectTrigger>
                  <SelectValue placeholder="Select size" />
                </SelectTrigger>
                <SelectContent>
                  {(selectedModelMeta?.sizes || ['1024x1024']).map(size => (
                    <SelectItem key={size} value={size}>{size}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <div className="text-xs text-muted-foreground mb-1">Images per Prompt</div>
              <Input
                type="number"
                min={1}
                max={8}
                value={imageCount}
                onChange={e => setImageCount(e.target.value)}
              />
            </div>
          </div>

          <div>
            <div className="text-xs text-muted-foreground mb-1">Prompts (one per line)</div>
            <Textarea
              value={promptText}
              onChange={e => setPromptText(e.target.value)}
              rows={10}
              placeholder={'Contoh:\nBangunan hancur cinematic 16:9\nKucing astronaut gaya poster retro\nPantai anime style pencahayaan pagi'}
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={() => void runBatch()} disabled={running}>
              {running
                ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                    Running...
                  </>
                )
                : (
                  <>
                    <Play className="h-4 w-4 mr-1" />
                    Run Batch
                  </>
                )}
            </Button>
            <Button variant="outline" onClick={stopBatch} disabled={!running}>
              <Square className="h-4 w-4 mr-1" />
              Stop
            </Button>
            <Button variant="outline" onClick={() => {
              setPromptText('')
              setResults([])
              setCurrentIndex(null)
            }} disabled={running}>
              Clear
            </Button>
            <div className="text-xs text-muted-foreground">
              Progress: {doneCount}/{results.length || parsePrompts(promptText).length || 0}
              {currentIndex !== null ? ` | current line: ${currentIndex + 1}` : ''}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Batch Results</CardTitle>
        </CardHeader>
        <CardContent>
          {results.length === 0
            ? (
              <div className="text-sm text-muted-foreground">Belum ada hasil. Jalankan batch dulu.</div>
            )
            : (
              <div className="space-y-3">
                {results.map(item => (
                  <div key={`${item.index}-${item.prompt}`} className="border rounded-md p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-xs text-muted-foreground">Line {item.index + 1}</div>
                        <div className="text-sm break-words">{item.prompt}</div>
                      </div>
                      <div className="text-xs uppercase tracking-wide px-2 py-1 rounded bg-muted shrink-0">
                        {item.status}
                      </div>
                    </div>
                    {item.error && (
                      <div className="text-xs text-destructive mt-2">{item.error}</div>
                    )}
                    {item.logId && (
                      <div className="text-xs text-muted-foreground mt-2">Task: {item.logId}</div>
                    )}
                    {item.images.length > 0 && (
                      <div className="mt-2 grid grid-cols-2 md:grid-cols-4 gap-2">
                        {item.images.map((url, idx) => (
                          <a key={`${url}-${idx}`} href={url} target="_blank" rel="noreferrer" className="block border rounded overflow-hidden">
                            <img src={url} alt={`result-${item.index + 1}-${idx + 1}`} className="w-full h-32 object-cover" />
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
        </CardContent>
      </Card>
    </div>
  )
}
