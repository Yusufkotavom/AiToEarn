/**
 * usePricingData - 图片模型定价数据 hook
 * 模块级缓存 + 防重复请求，多实例共享
 */

import type { DraftGenerationPricingVo, VideoModelInfo } from '@/api/types/draftGeneration'
import { useEffect, useState } from 'react'
import { apiGetDraftGenerationPricing } from '@/api/draftGeneration'
import http from '@/utils/request'
import { IMAGE_TEXT_ASPECT_RATIOS } from './constants'

let cachedData: DraftGenerationPricingVo | null = null
let fetchPromise: Promise<DraftGenerationPricingVo | null> | null = null

function toNumber(value: unknown): number {
  const num = Number(value)
  return Number.isFinite(num) ? num : 0
}

function normalizeFallbackVideoModel(model: any): VideoModelInfo {
  const pricing = Array.isArray(model?.pricing)
    ? model.pricing.map((p: any) => ({
        duration: toNumber(p?.duration),
        price: toNumber(p?.price),
        resolution: p?.resolution,
        aspectRatio: p?.aspectRatio,
        discount: p?.discount,
        originPrice: p?.originPrice,
      }))
    : []

  return {
    name: model?.name || '',
    description: model?.description || model?.name || '',
    resolutions: Array.isArray(model?.resolutions) ? model.resolutions : [],
    durations: Array.isArray(model?.durations) ? model.durations : [],
    maxInputImages: toNumber(model?.maxInputImages),
    aspectRatios: Array.isArray(model?.aspectRatios) ? model.aspectRatios : [],
    tags: Array.isArray(model?.tags)
      ? model.tags.map((tag: any) => (typeof tag === 'string' ? tag : (tag?.en ?? tag?.zhCN ?? ''))).filter(Boolean)
      : [],
    defaults: {
      resolution: model?.defaults?.resolution,
      aspectRatio: model?.defaults?.aspectRatio,
      duration: model?.defaults?.duration,
    },
    pricing,
  }
}

async function fetchPricingFallback(): Promise<DraftGenerationPricingVo | null> {
  try {
    const [imageResp, videoResp] = await Promise.all([
      http.get<any[]>('ai/models/image/generation', undefined, true),
      http.get<any[]>('ai/models/video/generation', undefined, true),
    ])

    const imageModelsRaw = Array.isArray(imageResp?.data) ? imageResp.data : []
    const videoModelsRaw = Array.isArray(videoResp?.data) ? videoResp.data : []

    if (!imageModelsRaw.length && !videoModelsRaw.length)
      return null

    const imageModels = imageModelsRaw.map((model: any) => {
      const resolutions = Array.isArray(model?.sizes) && model.sizes.length > 0
        ? model.sizes
        : ['1K']
      const pricePerImage = toNumber(model?.pricing)

      return {
        model: model?.name || '',
        displayName: model?.description || model?.name || '',
        pricing: resolutions.map((resolution: string) => ({
          resolution,
          pricePerImage,
        })),
        supportedAspectRatios: IMAGE_TEXT_ASPECT_RATIOS.map(item => item.label),
        maxInputImages: model?.maxInputImages ?? 14,
      }
    }).filter(item => !!item.model)

    const videoModels = videoModelsRaw
      .map(normalizeFallbackVideoModel)
      .filter(item => !!item.name)

    if (!imageModels.length && !videoModels.length)
      return null

    return {
      imageModels,
      videoModels,
    }
  }
  catch {
    return null
  }
}

async function fetchPricing(): Promise<DraftGenerationPricingVo | null> {
  if (cachedData)
    return cachedData
  if (fetchPromise)
    return fetchPromise

  fetchPromise = apiGetDraftGenerationPricing()
    .then(async (res) => {
      if (res?.data?.imageModels?.length) {
        cachedData = res.data
        return cachedData
      }

      const fallback = await fetchPricingFallback()
      if (fallback) {
        cachedData = fallback
        return cachedData
      }

      return null
    })
    .catch(async () => {
      const fallback = await fetchPricingFallback()
      if (fallback) {
        cachedData = fallback
        return cachedData
      }
      return null
    })
    .finally(() => {
      fetchPromise = null
    })

  return fetchPromise
}

export function usePricingData() {
  const [pricingData, setPricingData] = useState<DraftGenerationPricingVo | null>(cachedData)
  const [isLoading, setIsLoading] = useState(!cachedData)
  const [error, setError] = useState<boolean>(false)

  useEffect(() => {
    if (cachedData) {
      setPricingData(cachedData)
      setIsLoading(false)
      return
    }

    let cancelled = false
    setIsLoading(true)

    fetchPricing().then((data) => {
      if (cancelled)
        return
      if (data) {
        setPricingData(data)
      }
      else {
        setError(true)
      }
      setIsLoading(false)
    })

    return () => { cancelled = true }
  }, [])

  return { pricingData, isLoading, error }
}
