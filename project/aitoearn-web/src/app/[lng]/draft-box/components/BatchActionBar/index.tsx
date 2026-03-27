/**
 * BatchActionBar - 批量模式底部固定操作栏
 * 显示已选数量、取消按钮、删除按钮
 */

'use client'

import type { MetadataBatchStatusResponse } from '@/api/metadataGeneration'
import type { PromotionMaterial } from '@/app/[lng]/brand-promotion/brandPromotionStore/types'
import { Loader2, Sparkles, Trash2 } from 'lucide-react'
import { memo, useCallback, useEffect, useMemo, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { apiCreateMetadataBatch, apiGetMetadataBatchJob } from '@/api/metadataGeneration'
import { usePlanDetailStore } from '@/app/[lng]/brand-promotion/planDetailStore'
import { useTransClient } from '@/app/i18n/client'
import { Button } from '@/components/ui/button'
import { confirm } from '@/lib/confirm'
import { toast } from '@/lib/toast'
import { buildPromptFromTemplate, extractHashTags } from '@/utils/metadataAi'
import { useMetadataAiSettingsStore } from '../CreateMaterialModal/metadataAiSettingsStore'

const BatchActionBar = memo(() => {
  const { t } = useTransClient('brandPromotion')
  const [batchGenerating, setBatchGenerating] = useState(false)
  const [activeJobId, setActiveJobId] = useState<string>()
  const [batchStatus, setBatchStatus] = useState<MetadataBatchStatusResponse>()

  const { selectedMaterialIds, batchDeleting, materials } = usePlanDetailStore(
    useShallow(state => ({
      selectedMaterialIds: state.selectedMaterialIds,
      batchDeleting: state.batchDeleting,
      materials: state.materials,
    })),
  )
  const metadataSettings = useMetadataAiSettingsStore(state => state.settings)

  const selectedMaterials = useMemo(() => {
    const idSet = new Set(selectedMaterialIds)
    return materials.filter(item => idSet.has(item.id))
  }, [materials, selectedMaterialIds])

  const exitBatchMode = usePlanDetailStore(state => state.exitBatchMode)
  const batchDeleteMaterials = usePlanDetailStore(state => state.batchDeleteMaterials)

  const extractTags = (material: PromotionMaterial) => {
    const topicTags = (material.topics || []).filter(Boolean).map(tag => String(tag).replace(/^#/, '').trim())
    const descTags = extractHashTags(material.desc)
    return Array.from(new Set([...topicTags, ...descTags]))
  }

  const handleBatchGenerateMetadata = useCallback(async () => {
    if (selectedMaterials.length === 0)
      return

    setBatchGenerating(true)
    try {
      const response = await apiCreateMetadataBatch({
        provider: metadataSettings.provider,
        model: metadataSettings.model,
        strategy: metadataSettings.strategy,
        promptTemplate: metadataSettings.promptTemplate,
        items: selectedMaterials.map((material) => {
          const tags = extractTags(material)
          const platforms = (material.accountTypes || []).map(type => String(type))
          return {
            materialId: material.id,
            title: material.title || '',
            description: material.desc || '',
            tags,
            platforms,
            prompt: buildPromptFromTemplate(metadataSettings.promptTemplate, {
              title: material.title || '',
              description: material.desc || '',
              tags,
              platforms,
            }),
          }
        }),
      })

      if (response?.code !== 0 || !response?.data?.jobId) {
        toast.error(response?.message || t('draftManage.batchGenerateMetadataFailed'))
        return
      }

      setActiveJobId(response.data.jobId)
      toast.success(t('draftManage.batchGenerateMetadataStarted', { count: selectedMaterials.length }))
    }
    catch {
      toast.error(t('draftManage.batchGenerateMetadataFailed'))
    }
    finally {
      setBatchGenerating(false)
    }
  }, [selectedMaterials, metadataSettings, t])

  useEffect(() => {
    if (!activeJobId)
      return

    let stopped = false
    const run = async () => {
      const response = await apiGetMetadataBatchJob(activeJobId)
      if (stopped || response?.code !== 0 || !response?.data)
        return
      setBatchStatus(response.data)
      if (response.data.status === 'completed' || response.data.status === 'failed') {
        return
      }
      setTimeout(run, 1500)
    }

    void run()
    return () => {
      stopped = true
    }
  }, [activeJobId])

  const handleRetryFailed = useCallback(async () => {
    if (!batchStatus || batchStatus.failedCount === 0)
      return
    const failedItems = batchStatus.items.filter(item => item.status === 'failed')
    const failedMaterials = failedItems
      .map(item => selectedMaterials[item.index])
      .filter(Boolean)

    if (failedMaterials.length === 0)
      return

    setBatchGenerating(true)
    try {
      const response = await apiCreateMetadataBatch({
        provider: metadataSettings.provider,
        model: metadataSettings.model,
        strategy: metadataSettings.strategy,
        promptTemplate: metadataSettings.promptTemplate,
        items: failedMaterials.map((material) => {
          const tags = extractTags(material)
          const platforms = (material.accountTypes || []).map(type => String(type))
          return {
            materialId: material.id,
            title: material.title || '',
            description: material.desc || '',
            tags,
            platforms,
            prompt: buildPromptFromTemplate(metadataSettings.promptTemplate, {
              title: material.title || '',
              description: material.desc || '',
              tags,
              platforms,
            }),
          }
        }),
      })
      if (response?.code !== 0 || !response?.data?.jobId) {
        toast.error(response?.message || t('draftManage.batchGenerateMetadataFailed'))
        return
      }
      setActiveJobId(response.data.jobId)
      setBatchStatus(undefined)
      toast.success(t('draftManage.batchGenerateRetryStarted', { count: failedMaterials.length }))
    }
    catch {
      toast.error(t('draftManage.batchGenerateMetadataFailed'))
    }
    finally {
      setBatchGenerating(false)
    }
  }, [batchStatus, selectedMaterials, metadataSettings, t])

  const handleDelete = useCallback(() => {
    const count = selectedMaterialIds.length
    if (count === 0)
      return

    confirm({
      title: t('draftManage.batchDeleteConfirmTitle'),
      content: t('draftManage.batchDeleteConfirmDesc', { count }),
      okType: 'destructive',
      onOk: async () => {
        const success = await batchDeleteMaterials()
        if (success) {
          toast.success(t('draftManage.batchDeleteSuccess'))
        }
        else {
          toast.error(t('draftManage.batchDeleteFailed'))
        }
      },
    })
  }, [selectedMaterialIds.length, batchDeleteMaterials, t])

  return (
    <div data-testid="draftbox-batch-bar" className="fixed bottom-0 left-0 right-0 z-50 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 px-6 py-3">
      <div className="flex items-center justify-between max-w-screen-2xl mx-auto">
        <span data-testid="draftbox-batch-selected-count" className="text-sm text-muted-foreground">
          {t('draftManage.selectedCount', { count: selectedMaterialIds.length })}
        </span>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          {batchStatus && (
            <div className="text-xs text-muted-foreground mr-2">
              {t('draftManage.batchGenerateProgress', {
                success: batchStatus.successCount,
                failed: batchStatus.failedCount,
                total: batchStatus.total,
              })}
            </div>
          )}
          {batchStatus?.failedCount
            ? (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleRetryFailed}
                  disabled={batchGenerating}
                  className="cursor-pointer"
                >
                  {t('draftManage.batchGenerateRetryFailed')}
                </Button>
              )
            : null}
          <Button variant="ghost" size="sm" onClick={exitBatchMode} className="cursor-pointer">
            {t('draftManage.cancel')}
          </Button>
          <Button
            data-testid="draftbox-batch-generate-metadata-btn"
            variant="outline"
            size="sm"
            onClick={handleBatchGenerateMetadata}
            disabled={selectedMaterialIds.length === 0 || batchGenerating}
            className="cursor-pointer gap-1.5"
          >
            {batchGenerating
              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
              : <Sparkles className="h-3.5 w-3.5" />}
            {t('draftManage.batchGenerateMetadata')}
          </Button>
          <Button
            data-testid="draftbox-batch-delete-btn"
            variant="destructive"
            size="sm"
            onClick={handleDelete}
            disabled={selectedMaterialIds.length === 0 || batchDeleting}
            className="cursor-pointer gap-1.5"
          >
            {batchDeleting
              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
              : <Trash2 className="h-3.5 w-3.5" />}
            {t('common.delete')}
          </Button>
        </div>
      </div>
    </div>
  )
})

BatchActionBar.displayName = 'BatchActionBar'

export { BatchActionBar }
