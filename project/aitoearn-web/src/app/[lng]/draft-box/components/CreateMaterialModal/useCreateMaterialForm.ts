import type { MetadataAiSettings } from './metadataAiSettingsStore'
import type { MaterialMedia } from '@/api/material'
/**
 * useCreateMaterialForm - 创建/编辑素材表单逻辑 Hook
 * 从 CreateMaterialModalContent 中提取的共享表单逻辑，供桌面端和移动端组件复用
 */
import type { PromotionMaterial } from '@/app/[lng]/brand-promotion/brandPromotionStore/types'
import type { PlatType } from '@/app/config/platConfig'
import type { IImgFile, IVideoFile } from '@/components/PublishDialog/publishDialog.type'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useShallow } from 'zustand/react/shallow'
import { apiCreateMaterial, apiUpdateMaterial } from '@/api/material'
import { apiGenerateMetadata } from '@/api/metadataGeneration'
import { RegionTaskPlatInfoArr } from '@/app/config/platConfig'
import { PubType } from '@/app/config/publishConfig'
import { UploadTaskStatusEnum } from '@/components/PublishDialog/compoents/PublishManageUpload/publishManageUpload.enum'
import { usePublishManageUpload } from '@/components/PublishDialog/compoents/PublishManageUpload/usePublishManageUpload'
import { toast } from '@/lib/toast'
import { useAiProviderKeysStore } from '@/store/aiProviderKeys'
import { buildPromptFromTemplate, extractHashTags } from '@/utils/metadataAi'

export interface FormParams {
  title: string
  des: string
  images: IImgFile[]
  video?: IVideoFile
  selectedPlatforms: PlatType[]
}

export interface UseCreateMaterialFormProps {
  groupId: string | null
  editingMaterial?: PromotionMaterial | null
  isSubmitting?: boolean
  onClose: () => void
  onSuccess?: () => void
}

export function useCreateMaterialForm({
  groupId,
  editingMaterial,
  isSubmitting: externalSubmitting,
  onClose,
  onSuccess,
}: UseCreateMaterialFormProps) {
  const { t } = useTranslation('brandPromotion')
  const [submitting, setSubmitting] = useState(false)
  const [generatingMetadata, setGeneratingMetadata] = useState(false)
  const providerKeys = useAiProviderKeysStore(state => state.keys)

  // 获取上传任务状态
  const { tasks, md5Cache, cancelUpload } = usePublishManageUpload(
    useShallow(state => ({
      tasks: state.tasks,
      md5Cache: state.md5Cache,
      cancelUpload: state.cancelUpload,
    })),
  )

  // 默认全选平台
  const defaultPlatforms = useMemo(() => RegionTaskPlatInfoArr.map(([p]) => p), [])

  // 表单参数
  const [params, setParams] = useState<FormParams>({
    title: '',
    des: '',
    images: [],
    video: undefined,
    selectedPlatforms: defaultPlatforms,
  })

  const isEditing = !!editingMaterial

  // 初始化 - 如果是编辑模式，填充已有数据
  useEffect(() => {
    if (editingMaterial) {
      const images: IImgFile[] = editingMaterial.mediaList
        ?.filter(m => m.type === 'img')
        .map((m, index) => ({
          id: `edit-img-${index}`,
          size: 0,
          file: new File([], ''),
          imgUrl: m.url,
          filename: '',
          imgPath: '',
          width: 0,
          height: 0,
          ossUrl: m.url,
        })) || []

      const videoMedia = editingMaterial.mediaList?.find(m => m.type === 'video')
      const video: IVideoFile | undefined = videoMedia
        ? {
            size: 0,
            file: new Blob(),
            videoUrl: videoMedia.url,
            ossUrl: videoMedia.url,
            filename: '',
            width: 0,
            height: 0,
            duration: 0,
            cover: {
              id: 'edit-cover',
              size: 0,
              file: new File([], ''),
              imgUrl: editingMaterial.coverUrl || videoMedia.url,
              filename: '',
              imgPath: '',
              width: 0,
              height: 0,
              ossUrl: editingMaterial.coverUrl,
            },
          }
        : undefined

      setParams({
        title: editingMaterial.title || '',
        des: editingMaterial.desc || '',
        video,
        images,
        selectedPlatforms: editingMaterial.accountTypes?.length
          ? editingMaterial.accountTypes as PlatType[]
          : defaultPlatforms,
      })
    }
    else {
      setParams({
        title: '',
        des: '',
        images: [],
        video: undefined,
        selectedPlatforms: defaultPlatforms,
      })
    }
  }, [editingMaterial])

  // 更新参数
  const updateParams = useCallback((updates: Partial<FormParams>) => {
    setParams(prev => ({ ...prev, ...updates }))
  }, [])

  // 函数式更新图片列表（避免闭包陷值）
  const updateImages = useCallback((updater: (prev: IImgFile[]) => IImgFile[]) => {
    setParams(prev => ({ ...prev, images: updater(prev.images) }))
  }, [])

  // 函数式更新视频（避免闭包陷值）
  const updateVideo = useCallback((updater: (prev: IVideoFile | undefined) => IVideoFile | undefined) => {
    setParams(prev => ({ ...prev, video: updater(prev.video) }))
  }, [])

  // 同步上传结果到 params
  useEffect(() => {
    let hasChanges = false
    let newImages = params.images
    let newVideo = params.video

    // 同步图片 ossUrl
    if (params.images.length > 0) {
      newImages = params.images.map((img) => {
        if (!img.ossUrl && img.uploadTaskId) {
          const task = tasks[img.uploadTaskId]
          if (task?.md5 && md5Cache[task.md5]?.ossUrl) {
            hasChanges = true
            return { ...img, ossUrl: md5Cache[task.md5].ossUrl }
          }
        }
        return img
      })
    }

    // 同步视频 ossUrl
    if (params.video) {
      const video = params.video
      if (!video.ossUrl && video.uploadTaskIds?.video) {
        const task = tasks[video.uploadTaskIds.video]
        if (task?.md5 && md5Cache[task.md5]?.ossUrl) {
          hasChanges = true
          newVideo = { ...video, ossUrl: md5Cache[task.md5].ossUrl }
        }
      }
      if (newVideo && !newVideo.cover?.ossUrl && video.uploadTaskIds?.cover) {
        const task = tasks[video.uploadTaskIds.cover]
        if (task?.md5 && md5Cache[task.md5]?.ossUrl) {
          hasChanges = true
          newVideo = {
            ...newVideo,
            cover: { ...newVideo.cover, ossUrl: md5Cache[task.md5].ossUrl },
          }
        }
      }
    }

    if (hasChanges) {
      setParams(prev => ({ ...prev, images: newImages, video: newVideo }))
    }
  }, [tasks, md5Cache, params.images, params.video])

  // 检查是否有正在上传的任务
  const isUploading = useMemo(() => {
    const uploadingStatuses = [
      UploadTaskStatusEnum.Hashing,
      UploadTaskStatusEnum.Pending,
      UploadTaskStatusEnum.Uploading,
    ]

    for (const img of params.images) {
      if (img.uploadTaskId && tasks[img.uploadTaskId]) {
        if (uploadingStatuses.includes(tasks[img.uploadTaskId].status)) {
          return true
        }
      }
    }

    if (params.video?.uploadTaskIds) {
      const { video, cover } = params.video.uploadTaskIds
      if (video && tasks[video] && uploadingStatuses.includes(tasks[video].status)) {
        return true
      }
      if (cover && tasks[cover] && uploadingStatuses.includes(tasks[cover].status)) {
        return true
      }
    }

    return false
  }, [params.images, params.video, tasks])

  // 提交处理
  const handleSubmit = useCallback(async () => {
    if (!groupId) {
      toast.error(t('createMaterial.selectPlanFirst'))
      return
    }

    if (!params.title.trim()) {
      toast.error(t('createMaterial.titleRequired'))
      return
    }

    if (!params.des.trim()) {
      toast.error(t('createMaterial.descRequired'))
      return
    }

    const hasVideo = !!params.video?.ossUrl
    const hasImages = params.images && params.images.length > 0 && params.images.some(img => img.ossUrl)

    if (!hasVideo && !hasImages) {
      toast.error(t('createMaterial.pleaseUploadMedia'))
      return
    }

    setSubmitting(true)

    try {
      const mediaList: MaterialMedia[] = []

      if (hasVideo && params.video?.ossUrl) {
        mediaList.push({ url: params.video.ossUrl, type: 'video' })
      }

      if (hasImages && params.images) {
        params.images.forEach((img) => {
          if (img.ossUrl) {
            mediaList.push({ url: img.ossUrl, type: 'img' })
          }
        })
      }

      let coverUrl: string | undefined
      if (hasVideo && params.video?.cover?.ossUrl) {
        coverUrl = params.video.cover.ossUrl
      }
      else if (hasImages && params.images?.[0]?.ossUrl) {
        coverUrl = params.images[0].ossUrl
      }

      const type = hasVideo ? PubType.VIDEO : PubType.ImageText

      const materialData = {
        groupId,
        coverUrl,
        mediaList,
        title: params.title.trim(),
        desc: params.des,
        type,
        accountTypes: params.selectedPlatforms,
      }

      if (isEditing && editingMaterial?.id) {
        const res = await apiUpdateMaterial(editingMaterial.id, {
          coverUrl: materialData.coverUrl,
          mediaList: materialData.mediaList,
          title: materialData.title,
          desc: materialData.desc,
          accountTypes: materialData.accountTypes,
        })
        if (res?.code !== 0) {
          toast.error(res?.message || t('createMaterial.createFailed'))
          return
        }
        toast.success(t('createMaterial.createSuccess'))
      }
      else {
        const res = await apiCreateMaterial(materialData)
        if (res?.code !== 0) {
          toast.error(res?.message || t('createMaterial.createFailed'))
          return
        }
        toast.success(t('createMaterial.createSuccess'))
      }

      onSuccess?.()
      onClose()
    }
    catch {
      toast.error(t('createMaterial.createFailed'))
    }
    finally {
      setSubmitting(false)
    }
  }, [groupId, params, isEditing, editingMaterial, onSuccess, onClose, t])

  const generateMetadataByAi = useCallback(async (settings: MetadataAiSettings) => {
    setGeneratingMetadata(true)
    try {
      const currentTags = extractHashTags(params.des)
      const renderedPrompt = buildPromptFromTemplate(settings.promptTemplate, {
        title: params.title,
        description: params.des,
        tags: currentTags,
        platforms: params.selectedPlatforms.map(type => String(type)),
      })

      const response = await apiGenerateMetadata({
        provider: settings.provider,
        promptTemplate: settings.promptTemplate,
        strategy: settings.strategy,
        apiKeys: {
          groqApiKey: providerKeys.groqApiKey || undefined,
          geminiApiKey: providerKeys.geminiApiKey || undefined,
        },
        item: {
          materialId: editingMaterial?.id,
          title: params.title.trim(),
          description: params.des.trim(),
          tags: currentTags,
          platforms: params.selectedPlatforms as string[],
          prompt: renderedPrompt,
        },
      })

      if (response?.code !== 0 || !response?.data) {
        toast.error(response?.message || t('createMaterial.metadataGenerateFailed'))
        return false
      }

      const generated = response.data
      const nextTitle = settings.strategy === 'replace_all'
        ? (generated.title || params.title)
        : (params.title.trim() ? params.title : (generated.title || params.title))
      const nextDescription = settings.strategy === 'replace_all'
        ? (generated.description || params.des)
        : (params.des.trim() ? params.des : (generated.description || params.des))
      const nextTags = (generated.tags || []).filter(Boolean).slice(0, 10)
      const shouldAppendTags
        = settings.strategy === 'replace_all'
          ? true
          : !params.des.trim()
      const tagSuffix = shouldAppendTags && nextTags.length > 0
        ? `\n\n${nextTags.map(tag => `#${tag}`).join(' ')}`
        : ''

      updateParams({
        title: nextTitle,
        des: `${nextDescription}${tagSuffix}`.trim(),
      })
      toast.success(t('createMaterial.metadataGenerateSuccess'))
      return true
    }
    catch {
      toast.error(t('createMaterial.metadataGenerateFailed'))
      return false
    }
    finally {
      setGeneratingMetadata(false)
    }
  }, [params, editingMaterial?.id, updateParams, t, providerKeys])

  const isFormSubmitting = submitting || externalSubmitting || isUploading

  return {
    params,
    updateParams,
    updateImages,
    updateVideo,
    isSubmitting: isFormSubmitting,
    isGeneratingMetadata: generatingMetadata,
    handleSubmit,
    generateMetadataByAi,
    cancelUpload,
  }
}
