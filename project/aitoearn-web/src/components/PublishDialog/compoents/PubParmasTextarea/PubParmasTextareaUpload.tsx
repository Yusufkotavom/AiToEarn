/**
 * PubParmasTextareaUpload - 上传文件组件
 * 支持图片和视频上传，本地上传和素材库选择
 */
import type { ForwardedRef } from 'react'
import type { DraftGenerationTask } from '@/api/draftGeneration'
import type { MediaItem } from '@/components/PublishDialog/compoents/MaterialSelectionModal'
import type { MediaType } from '@/components/PublishDialog/compoents/MaterialSelectionModal/types'
import type { UploadResult } from '@/components/PublishDialog/compoents/PublishManageUpload/usePublishManageUpload.type'
import type { IImgFile, IVideoFile } from '@/components/PublishDialog/publishDialog.type'
import { Check, Loader2, Plus, Upload } from 'lucide-react'
import React, { forwardRef, memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { apiGetDraftGenerationList } from '@/api/draftGeneration'
import { useTransClient } from '@/app/i18n/client'
import { MaterialSelectionModal } from '@/components/PublishDialog/compoents/MaterialSelectionModal'
import { UploadTaskTypeEnum } from '@/components/PublishDialog/compoents/PublishManageUpload/publishManageUpload.enum'
import { usePublishManageUpload } from '@/components/PublishDialog/compoents/PublishManageUpload/usePublishManageUpload'
import {
  formatImg,
  formatVideo,
  VideoGrabFrame,
} from '@/components/PublishDialog/PublishDialog.util'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import { toast } from '@/lib/toast'
import { cn } from '@/lib/utils'
import { getOssUrl } from '@/utils/oss'

export interface IPubParmasTextareaUploadRef {}

export interface IPubParmasTextareaUploadProps {
  uploadAccept: string
  checkFileListType: (fileList: File[]) => boolean
  onVideoUpdateFinish: (video: IVideoFile) => void
  onImgUpdateFinish: (img: IImgFile[]) => void
  enableGlobalDrag?: boolean // 是否启用全局拖拽上传
}

const PubParmasTextareaUpload = memo(
  forwardRef(
    (
      {
        uploadAccept,
        checkFileListType,
        onVideoUpdateFinish,
        onImgUpdateFinish,
        enableGlobalDrag = false,
      }: IPubParmasTextareaUploadProps,
      ref: ForwardedRef<IPubParmasTextareaUploadRef>,
    ) => {
      const { t } = useTransClient('publish')
      const fileInputRef = useRef<HTMLInputElement>(null)
      const [materialSelectionOpen, setMaterialSelectionOpen] = useState(false)
      const [aiGeneratedSelectionOpen, setAiGeneratedSelectionOpen] = useState(false)
      const [importLoading, setImportLoading] = useState(false)
      const [isDragOver, setIsDragOver] = useState(false)
      const [isGlobalDragging, setIsGlobalDragging] = useState(false)
      const [aiGeneratedLoading, setAiGeneratedLoading] = useState(false)
      const [aiGeneratedItems, setAiGeneratedItems] = useState<Array<{ id: string, url: string, title?: string, createdAt?: string }>>([])
      const [selectedAiGeneratedIds, setSelectedAiGeneratedIds] = useState<Set<string>>(new Set())
      const enqueueUpload = usePublishManageUpload(state => state.enqueueUpload)

      // 判断是否为视频模式
      const isVideoMode = uploadAccept.includes('video') && !uploadAccept.includes('image')
      // 判断是否为图片模式
      const isImageMode = uploadAccept.includes('image') && !uploadAccept.includes('video')
      // 计算媒体类型（支持单个或多个）- 使用 useMemo 缓存避免每次渲染创建新数组
      const mediaTypes = useMemo<MediaType | MediaType[]>(() => {
        if (isVideoMode)
          return 'video'
        if (isImageMode)
          return 'img'
        // 同时支持图片和视频
        return ['video', 'img']
      }, [isVideoMode, isImageMode])

      const isAbortError = useCallback((error: unknown) => {
        if (error instanceof DOMException) {
          return error.name === 'AbortError'
        }
        return Boolean((error as { name?: string })?.name === 'AbortError')
      }, [])

      // 上传视频
      const uploadVideo = useCallback(
        async (video: IVideoFile) => {
          const videoHandle = enqueueUpload({
            file: video.file,
            fileName: video.filename,
            type: UploadTaskTypeEnum.Video,
          })
          const coverHandle = enqueueUpload({
            file: video.cover.file,
            fileName: video.cover.filename,
            type: UploadTaskTypeEnum.VideoCover,
          })

          const videoWithTasks: IVideoFile = {
            ...video,
            cover: {
              ...video.cover,
              uploadTaskId: coverHandle.taskId,
            },
            uploadTaskIds: {
              video: videoHandle.taskId,
              cover: coverHandle.taskId,
            },
          }

          onVideoUpdateFinish(videoWithTasks)

          try {
            const [videoResult, coverResult] = await Promise.all([
              videoHandle.promise,
              coverHandle.promise,
            ])

            onVideoUpdateFinish({
              ...videoWithTasks,
              ossUrl: videoResult.ossUrl,
              cover: {
                ...videoWithTasks.cover,
                ossUrl: coverResult.ossUrl,
              },
            })
          }
          catch (error) {
            if (!isAbortError(error)) {
              console.error(error)
              toast.error('Upload failed, please try again later')
              videoHandle.cancel()
              coverHandle.cancel()
            }
          }
        },
        [enqueueUpload, isAbortError, onVideoUpdateFinish],
      )

      // 上传图片
      const uploadImg = useCallback(
        async (fileList: File[]) => {
          const uploads: Array<{
            image: IImgFile
            promise: Promise<UploadResult>
            cancel: () => void
          }> = []

          for (const file of fileList) {
            const image = await formatImg({
              blob: file!,
              path: file.name,
            })

            const handle = enqueueUpload({
              file: image.file,
              fileName: image.filename,
              type: UploadTaskTypeEnum.Image,
            })

            const imageWithTask: IImgFile = {
              ...image,
              uploadTaskId: handle.taskId,
            }

            uploads.push({
              image: imageWithTask,
              promise: handle.promise,
              cancel: handle.cancel,
            })
          }

          if (uploads.length) {
            onImgUpdateFinish(uploads.map(item => item.image))
          }

          uploads.forEach(({ image, promise, cancel }) => {
            promise
              .then((result) => {
                onImgUpdateFinish([
                  {
                    ...image,
                    ossUrl: result.ossUrl,
                  },
                ])
              })
              .catch((error) => {
                if (!isAbortError(error)) {
                  console.error(error)
                  toast.error('Upload failed, please try again later')
                  cancel()
                }
              })
          })
        },
        [enqueueUpload, isAbortError, onImgUpdateFinish],
      )

      // 全局拖拽事件处理
      useEffect(() => {
        if (!enableGlobalDrag)
          return

        let dragCounter = 0

        const handleGlobalDragEnter = (e: DragEvent) => {
          e.preventDefault()
          dragCounter++
          if (e.dataTransfer?.types.includes('Files')) {
            setIsGlobalDragging(true)
          }
        }

        const handleGlobalDragLeave = (e: DragEvent) => {
          e.preventDefault()
          dragCounter--
          if (dragCounter === 0) {
            setIsGlobalDragging(false)
          }
        }

        const handleGlobalDragOver = (e: DragEvent) => {
          e.preventDefault()
        }

        const handleGlobalDrop = async (e: DragEvent) => {
          e.preventDefault()
          dragCounter = 0
          setIsGlobalDragging(false)

          const files = Array.from(e.dataTransfer?.files || [])

          // 检查文件类型
          if (!checkFileListType(files)) {
            return
          }

          // 处理视频
          const videoFiles = files.filter(file => file.type.startsWith('video/'))
          for (const file of videoFiles) {
            const video = await formatVideo(file)
            await uploadVideo(video)
          }

          // 处理图片
          const imageFiles = files.filter(file => file.type.startsWith('image/'))
          if (imageFiles.length > 0) {
            await uploadImg(imageFiles)
          }
        }

        document.addEventListener('dragenter', handleGlobalDragEnter)
        document.addEventListener('dragleave', handleGlobalDragLeave)
        document.addEventListener('dragover', handleGlobalDragOver)
        document.addEventListener('drop', handleGlobalDrop)

        return () => {
          document.removeEventListener('dragenter', handleGlobalDragEnter)
          document.removeEventListener('dragleave', handleGlobalDragLeave)
          document.removeEventListener('dragover', handleGlobalDragOver)
          document.removeEventListener('drop', handleGlobalDrop)
        }
      }, [enableGlobalDrag, checkFileListType, uploadVideo, uploadImg])

      // 处理文件选择
      const handleFileChange = useCallback(
        async (event: React.ChangeEvent<HTMLInputElement>) => {
          const files = event.target.files
          if (!files || files.length === 0)
            return

          const fileList = Array.from(files)

          // 检查文件类型
          if (!checkFileListType(fileList)) {
            // 清空 input
            if (fileInputRef.current) {
              fileInputRef.current.value = ''
            }
            return
          }

          // 处理视频
          const videoFiles = fileList.filter(file => file.type.startsWith('video/'))
          for (const file of videoFiles) {
            const video = await formatVideo(file)
            await uploadVideo(video)
          }

          // 处理图片
          const imageFiles = fileList.filter(file => file.type.startsWith('image/'))
          if (imageFiles.length > 0) {
            await uploadImg(imageFiles)
          }

          // 清空 input 以便下次选择同一文件
          if (fileInputRef.current) {
            fileInputRef.current.value = ''
          }
        },
        [checkFileListType, uploadVideo, uploadImg],
      )

      // 触发文件选择
      const triggerFileInput = useCallback(() => {
        fileInputRef.current?.click()
      }, [])

      // 处理拖拽进入
      const handleDragEnter = useCallback((e: React.DragEvent) => {
        e.preventDefault()
        e.stopPropagation()
        setIsDragOver(true)
      }, [])

      // 处理拖拽离开
      const handleDragLeave = useCallback((e: React.DragEvent) => {
        e.preventDefault()
        e.stopPropagation()
        setIsDragOver(false)
      }, [])

      // 处理拖拽悬停
      const handleDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault()
        e.stopPropagation()
      }, [])

      // 处理文件释放
      const handleDrop = useCallback(
        async (e: React.DragEvent) => {
          e.preventDefault()
          e.stopPropagation()
          setIsDragOver(false)

          const files = Array.from(e.dataTransfer.files)

          // 检查文件类型
          if (!checkFileListType(files)) {
            return
          }

          // 处理视频
          const videoFiles = files.filter(file => file.type.startsWith('video/'))
          for (const file of videoFiles) {
            const video = await formatVideo(file)
            await uploadVideo(video)
          }

          // 处理图片
          const imageFiles = files.filter(file => file.type.startsWith('image/'))
          if (imageFiles.length > 0) {
            await uploadImg(imageFiles)
          }
        },
        [checkFileListType, uploadVideo, uploadImg],
      )

      // 处理图片素材导入
      const processImageMedia = useCallback(async (media: MediaItem): Promise<IImgFile> => {
        const ossUrl = getOssUrl(media.url)
        const req = await fetch(ossUrl)
        const blob = await req.blob()
        const imagefile = await formatImg({
          blob,
          path: `${media.title || 'image'}.${blob.type.split('/')[1]}`,
        })
        imagefile.ossUrl = media.url
        return imagefile
      }, [])

      // 处理视频素材导入
      const processVideoMedia = useCallback(async (media: MediaItem): Promise<IVideoFile> => {
        const ossUrl = getOssUrl(media.url)
        const coverOss = getOssUrl(media.thumbUrl)

        // 下载封面
        const req = await fetch(coverOss)
        const blob = await req.blob()
        const imagefile = await formatImg({
          blob,
          path: `${media.title || 'cover'}_cover.${blob.type.split('/')[1]}`,
        })
        imagefile.ossUrl = media.thumbUrl

        // 获取视频信息
        const videoInfo = await VideoGrabFrame(ossUrl, 0)

        // 从素材库导入的视频已上传到OSS，创建空占位文件
        const filename = media.title || `video_${Date.now()}.mp4`

        const video: IVideoFile = {
          ossUrl,
          videoUrl: ossUrl,
          // 素材库导入时不需要file，创建空Blob占位
          file: new Blob([], { type: 'video/mp4' }),
          filename,
          width: videoInfo.width,
          height: videoInfo.height,
          duration: videoInfo.duration,
          size: media.metadata?.size || 0,
          cover: imagefile,
        }

        return video
      }, [])

      // 处理素材选择
      const handleMediaSelect = useCallback(
        async (media: MediaItem | MediaItem[]) => {
          setImportLoading(true)
          try {
            const items = Array.isArray(media) ? media : [media]
            const images: IImgFile[] = []

            for (const item of items) {
              if (item.type === 'video') {
                const video = await processVideoMedia(item)
                onVideoUpdateFinish(video)
              }
              else {
                const image = await processImageMedia(item)
                images.push(image)
              }
            }

            if (images.length > 0) {
              onImgUpdateFinish(images)
            }
          }
          catch (error) {
            console.error('Failed to import media:', error)
            toast.error('Failed to import assets')
          }
          finally {
            setImportLoading(false)
          }
        },
        [processImageMedia, processVideoMedia, onImgUpdateFinish, onVideoUpdateFinish],
      )

      const loadAiGeneratedImages = useCallback(async () => {
        setAiGeneratedLoading(true)
        try {
          const pageSize = 20
          const maxPages = 5
          const map = new Map<string, { id: string, url: string, title?: string, createdAt?: string }>()

          for (let page = 1; page <= maxPages; page++) {
            const res = await apiGetDraftGenerationList(page, pageSize)
            const list = (res?.data?.list || []) as DraftGenerationTask[]
            if (list.length === 0) {
              break
            }

            for (const task of list) {
              if (task.status !== 'success') {
                continue
              }
              const urls = task.response?.imageUrls || []
              if (!Array.isArray(urls) || urls.length === 0) {
                continue
              }
              for (const rawUrl of urls) {
                const cleanUrl = String(rawUrl || '').trim()
                if (!cleanUrl || map.has(cleanUrl)) {
                  continue
                }
                map.set(cleanUrl, {
                  id: `${task.id}:${cleanUrl}`,
                  url: cleanUrl,
                  title: task.response?.title,
                  createdAt: task.createdAt,
                })
              }
            }

            const totalPages = Number(res?.data?.totalPages || page)
            if (page >= totalPages) {
              break
            }
          }

          setAiGeneratedItems(Array.from(map.values()))
          setSelectedAiGeneratedIds(new Set())
        }
        catch (error) {
          console.error('Failed to load AI generated images:', error)
          toast.error('Failed to load AI generated images')
        }
        finally {
          setAiGeneratedLoading(false)
        }
      }, [])

      const processAiGeneratedImage = useCallback(async (rawUrl: string): Promise<IImgFile> => {
        const sourceUrl = String(rawUrl || '').trim()
        const downloadUrl = getOssUrl(sourceUrl)
        const req = await fetch(downloadUrl)
        if (!req.ok) {
          throw new Error(`Failed to fetch image: ${req.status}`)
        }
        const blob = await req.blob()
        const ext = (blob.type || 'image/jpeg').split('/')[1] || 'jpg'
        const imageFile = await formatImg({
          blob,
          path: `ai_generated_${Date.now()}.${ext}`,
        })
        imageFile.ossUrl = sourceUrl
        return imageFile
      }, [])

      const openAiGeneratedPicker = useCallback(async () => {
        if (!uploadAccept.includes('image')) {
          toast.warning(t('validation.uploadImage'))
          return
        }
        setAiGeneratedSelectionOpen(true)
        await loadAiGeneratedImages()
      }, [loadAiGeneratedImages, t, uploadAccept])

      const toggleAiGeneratedSelection = useCallback((id: string) => {
        setSelectedAiGeneratedIds((prev) => {
          const next = new Set(prev)
          if (next.has(id)) {
            next.delete(id)
          }
          else {
            next.add(id)
          }
          return next
        })
      }, [])

      const importSelectedAiGeneratedImages = useCallback(async () => {
        if (selectedAiGeneratedIds.size === 0) {
          return
        }
        setImportLoading(true)
        try {
          const selectedItems = aiGeneratedItems.filter(item => selectedAiGeneratedIds.has(item.id))
          const images: IImgFile[] = []
          for (const item of selectedItems) {
            const image = await processAiGeneratedImage(item.url)
            images.push(image)
          }
          if (images.length > 0) {
            onImgUpdateFinish(images)
          }
          setAiGeneratedSelectionOpen(false)
        }
        catch (error) {
          console.error('Failed to import AI generated images:', error)
          toast.error('Failed to import AI generated images')
        }
        finally {
          setImportLoading(false)
        }
      }, [aiGeneratedItems, onImgUpdateFinish, processAiGeneratedImage, selectedAiGeneratedIds])

      return (
        <div className="relative h-[110px]" onClick={e => e.stopPropagation()}>
          <MaterialSelectionModal
            open={materialSelectionOpen}
            onOpenChange={setMaterialSelectionOpen}
            mediaTypes={mediaTypes}
            onSelect={handleMediaSelect}
          />
          <Dialog open={aiGeneratedSelectionOpen} onOpenChange={setAiGeneratedSelectionOpen}>
            <DialogContent className="sm:max-w-4xl max-h-[85vh]">
              <DialogHeader>
                <DialogTitle>Select AI Generated Images</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                {aiGeneratedLoading
                  ? (
                      <div className="h-52 flex items-center justify-center text-muted-foreground">
                        <Loader2 className="h-5 w-5 animate-spin mr-2" />
                        Loading...
                      </div>
                    )
                  : aiGeneratedItems.length === 0
                    ? (
                        <div className="h-52 flex items-center justify-center text-muted-foreground">
                          No generated images found.
                        </div>
                      )
                    : (
                        <ScrollArea className="h-[52vh] pr-2">
                          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                            {aiGeneratedItems.map(item => (
                              <button
                                key={item.id}
                                type="button"
                                className={cn(
                                  'relative group rounded-md overflow-hidden border bg-muted cursor-pointer text-left',
                                  selectedAiGeneratedIds.has(item.id)
                                    ? 'border-primary ring-2 ring-primary/40'
                                    : 'border-border',
                                )}
                                onClick={() => toggleAiGeneratedSelection(item.id)}
                              >
                                <img
                                  src={getOssUrl(item.url)}
                                  alt={item.title || 'AI generated'}
                                  className="w-full aspect-square object-cover"
                                />
                                <div className="absolute top-2 right-2 h-5 w-5 rounded-full bg-black/60 text-white flex items-center justify-center">
                                  {selectedAiGeneratedIds.has(item.id) && <Check className="h-3.5 w-3.5" />}
                                </div>
                              </button>
                            ))}
                          </div>
                        </ScrollArea>
                      )}
                <div className="flex items-center justify-between">
                  <div className="text-xs text-muted-foreground">
                    {selectedAiGeneratedIds.size}
                    {' '}
                    selected
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      className="cursor-pointer"
                      onClick={() => setAiGeneratedSelectionOpen(false)}
                    >
                      Cancel
                    </Button>
                    <Button
                      type="button"
                      className="cursor-pointer"
                      disabled={selectedAiGeneratedIds.size === 0 || importLoading}
                      onClick={importSelectedAiGeneratedImages}
                    >
                      {importLoading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                      Use Selected
                    </Button>
                  </div>
                </div>
              </div>
            </DialogContent>
          </Dialog>

          {/* 隐藏的文件输入 */}
          <input
            ref={fileInputRef}
            type="file"
            accept={uploadAccept}
            multiple={uploadAccept.includes('image')}
            onChange={handleFileChange}
            className="hidden"
            data-testid="publish-file-input"
          />

          {/* 上传区域 - 支持拖拽上传，点击直接上传，hover显示菜单 */}
          <div className="group w-full h-full relative">
            <div
              className={cn(
                'w-full h-full border border-dashed border-border rounded-md flex flex-col items-center justify-center cursor-pointer gap-2.5 text-sm text-muted-foreground transition-colors',
                'hover:border-primary',
                isDragOver && 'border-primary bg-primary/5',
                importLoading && 'pointer-events-none opacity-50',
              )}
              onClick={triggerFileInput}
              onDragEnter={handleDragEnter}
              onDragLeave={handleDragLeave}
              onDragOver={handleDragOver}
              onDrop={handleDrop}
              data-testid="publish-upload-area"
            >
              {importLoading ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  {t('upload.importing')}
                </>
              ) : (
                <>
                  <Plus className="h-5 w-5" />
                  {isDragOver ? t('upload.dropHere') : t('upload.selectFile')}
                </>
              )}
            </div>

            {/* 常驻操作按钮（避免仅靠 hover 菜单导致触屏/某些环境不可见） */}
            {!importLoading && (
              <div className="absolute left-1/2 -translate-x-1/2 bottom-2 z-30 flex items-center gap-1 rounded-md border border-border bg-background/90 backdrop-blur px-1 py-1">
                <button
                  type="button"
                  className="px-2 py-1 text-xs cursor-pointer rounded hover:bg-accent transition-colors whitespace-nowrap"
                  onClick={(e) => {
                    e.stopPropagation()
                    triggerFileInput()
                  }}
                  data-testid="publish-upload-local-inline-button"
                >
                  {t('upload.uploadLocal')}
                </button>
                <button
                  type="button"
                  className="px-2 py-1 text-xs cursor-pointer rounded hover:bg-accent transition-colors whitespace-nowrap"
                  onClick={(e) => {
                    e.stopPropagation()
                    setMaterialSelectionOpen(true)
                  }}
                  data-testid="publish-select-material-inline-button"
                >
                  {t('actions.selectMaterial')}
                </button>
                <button
                  type="button"
                  className="px-2 py-1 text-xs cursor-pointer rounded hover:bg-accent transition-colors whitespace-nowrap"
                  onClick={(e) => {
                    e.stopPropagation()
                    void openAiGeneratedPicker()
                  }}
                  data-testid="publish-select-ai-generated-inline-button"
                >
                  Select AI Generated
                </button>
              </div>
            )}

            {/* Hover 菜单 */}
            {!importLoading && (
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50">
                <div className="bg-popover border border-border rounded-md shadow-md p-1 min-w-[120px]">
                  <div
                    className="px-3 py-1.5 text-sm cursor-pointer rounded hover:bg-accent transition-colors whitespace-nowrap"
                    onClick={triggerFileInput}
                    data-testid="publish-upload-local-button"
                  >
                    {t('upload.uploadLocal')}
                  </div>
                  <div
                    className="px-3 py-1.5 text-sm cursor-pointer rounded hover:bg-accent transition-colors whitespace-nowrap"
                    onClick={() => setMaterialSelectionOpen(true)}
                    data-testid="publish-select-material-button"
                  >
                    {t('actions.selectMaterial')}
                  </div>
                  <div
                    className="px-3 py-1.5 text-sm cursor-pointer rounded hover:bg-accent transition-colors whitespace-nowrap"
                    onClick={() => { void openAiGeneratedPicker() }}
                    data-testid="publish-select-ai-generated-button"
                  >
                    Select AI Generated
                  </div>
                </div>
                {/* 箭头 */}
                <div className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-t-[6px] border-t-border" />
              </div>
            )}
          </div>

          {/* 全局拖拽覆盖层 */}
          {enableGlobalDrag && isGlobalDragging && (
            <div className="fixed inset-0 z-[9999] bg-background/80 backdrop-blur-sm flex items-center justify-center pointer-events-none">
              <div className="flex flex-col items-center gap-4 p-8 rounded-2xl border-2 border-dashed border-primary bg-card">
                <Upload className="w-12 h-12 text-primary" />
                <p className="text-lg font-medium text-foreground">{t('upload.dropToUpload')}</p>
              </div>
            </div>
          )}
        </div>
      )
    },
  ),
)

export default PubParmasTextareaUpload
