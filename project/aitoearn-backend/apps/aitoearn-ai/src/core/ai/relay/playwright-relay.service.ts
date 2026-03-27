import { Injectable } from '@nestjs/common'
import { AiLogStatus } from '@yikart/mongodb'
import axios from 'axios'
import { config } from '../../../config'

export interface PlaywrightRelayAsset {
  type: 'image' | 'video'
  url: string
  thumbUrl?: string
}

export interface PlaywrightRelayTaskResult {
  status: AiLogStatus
  assets: PlaywrightRelayAsset[]
  errorMessage?: string
  raw: unknown
}

@Injectable()
export class PlaywrightRelayService {
  private get relayConfig() {
    return config.ai.playwrightRelay
  }

  private get headers() {
    const headers: Record<string, string> = {}
    if (this.relayConfig.apiKey) {
      headers['x-api-key'] = this.relayConfig.apiKey
    }
    return headers
  }

  isImageEnabled() {
    return this.relayConfig.enabled && this.relayConfig.genImageMode === 'playwright-relay' && !!this.relayConfig.baseUrl
  }

  isVideoEnabled() {
    return this.relayConfig.enabled && this.relayConfig.genVideoMode === 'playwright-relay' && !!this.relayConfig.baseUrl
  }

  getDefaultImageProvider() {
    return this.relayConfig.defaultImageProvider
  }

  getDefaultVideoProvider() {
    return this.relayConfig.defaultVideoProvider
  }

  async createImageTask(payload: Record<string, unknown>) {
    return await this.createTask('/gen/image/start', payload)
  }

  async createVideoTask(payload: Record<string, unknown>) {
    return await this.createTask('/gen/video/start', payload)
  }

  async getTaskStatus(taskId: string): Promise<PlaywrightRelayTaskResult> {
    const response = await axios.get(`${this.relayConfig.baseUrl}/jobs/${taskId}`, {
      headers: this.headers,
      timeout: this.relayConfig.timeoutMs,
    })

    const data = response.data?.data ?? response.data
    const status = this.normalizeStatus(data?.status)

    const assetsRaw = Array.isArray(data?.assets)
      ? data.assets
      : []

    const assets: PlaywrightRelayAsset[] = assetsRaw
      .filter((item: unknown): item is Record<string, unknown> => !!item && typeof item === 'object')
      .map(item => ({
        type: item.type === 'video' ? 'video' : 'image',
        url: typeof item.url === 'string'
          ? item.url
          : typeof item.videoUrl === 'string'
            ? item.videoUrl
            : typeof item.video_url === 'string'
              ? item.video_url
              : '',
        thumbUrl: typeof item.thumbUrl === 'string'
          ? item.thumbUrl
          : typeof item.thumb_url === 'string'
            ? item.thumb_url
            : undefined,
      }))
      .filter(item => typeof item.url === 'string' && item.url.length > 0)

    return {
      status,
      assets,
      errorMessage: data?.errorMessage || data?.fail_reason || data?.error?.message,
      raw: data,
    }
  }

  private async createTask(path: string, payload: Record<string, unknown>) {
    const response = await axios.post(`${this.relayConfig.baseUrl}${path}`, payload, {
      headers: this.headers,
      timeout: this.relayConfig.timeoutMs,
    })

    const data = response.data?.data ?? response.data
    const taskId = data?.jobId || data?.taskId || data?.task_id || data?.id

    if (!taskId || typeof taskId !== 'string') {
      throw new Error('Invalid relay task response: missing task id')
    }

    return {
      taskId,
      raw: data,
    }
  }

  private normalizeStatus(status: string | undefined): AiLogStatus {
    const value = (status || '').toLowerCase()
    if (['success', 'succeeded', 'completed', 'done'].includes(value)) {
      return AiLogStatus.Success
    }
    if (['failed', 'error', 'cancelled', 'canceled'].includes(value)) {
      return AiLogStatus.Failed
    }
    return AiLogStatus.Generating
  }
}
