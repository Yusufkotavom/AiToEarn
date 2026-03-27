import axios from 'axios'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PlaywrightRelayService } from './playwright-relay.service'

vi.mock('@yikart/mongodb', () => ({
  AiLogStatus: {
    Generating: 'generating',
    Success: 'success',
    Failed: 'failed',
  },
}))

vi.mock('axios', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
  },
}))

vi.mock('../../../config', () => ({
  config: {
    ai: {
      playwrightRelay: {
        enabled: true,
        baseUrl: 'http://relay.local',
        apiKey: 'test-key',
        timeoutMs: 1000,
        genImageMode: 'playwright-relay',
        genVideoMode: 'playwright-relay',
        defaultImageProvider: 'google-whisk',
        defaultVideoProvider: 'grok-imagine',
      },
    },
  },
}))

describe('playwright relay service', () => {
  const axiosGet = vi.mocked(axios.get)
  const axiosPost = vi.mocked(axios.post)
  let service: PlaywrightRelayService

  beforeEach(() => {
    vi.clearAllMocks()
    service = new PlaywrightRelayService()
  })

  it('should submit image task and extract job id', async () => {
    axiosPost.mockResolvedValueOnce({ data: { data: { jobId: 'job-image-1' } } } as never)

    const result = await service.createImageTask({ prompt: 'test' })

    expect(result.taskId).toBe('job-image-1')
    expect(axiosPost).toHaveBeenCalledWith(
      'http://relay.local/gen/image/start',
      { prompt: 'test' },
      expect.objectContaining({
        timeout: 1000,
        headers: { 'x-api-key': 'test-key' },
      }),
    )
  })

  it('should normalize success status and parse assets', async () => {
    axiosGet.mockResolvedValueOnce({
      data: {
        data: {
          status: 'completed',
          assets: [
            { type: 'video', url: 'https://cdn/video.mp4', thumbUrl: 'https://cdn/thumb.jpg' },
            { type: 'image', url: 'https://cdn/image.png' },
          ],
        },
      },
    } as never)

    const result = await service.getTaskStatus('job-video-1')

    expect(result.status).toBe('success')
    expect(result.assets).toEqual([
      { type: 'video', url: 'https://cdn/video.mp4', thumbUrl: 'https://cdn/thumb.jpg' },
      { type: 'image', url: 'https://cdn/image.png', thumbUrl: undefined },
    ])
  })

  it('should parse snake_case relay response fields', async () => {
    axiosGet.mockResolvedValueOnce({
      data: {
        data: {
          status: 'PROCESSING',
          fail_reason: 'temporary',
          assets: [
            { type: 'video', video_url: 'https://cdn/video2.mp4', thumb_url: 'https://cdn/thumb2.jpg' },
          ],
        },
      },
    } as never)

    const result = await service.getTaskStatus('job-video-2')

    expect(result.status).toBe('generating')
    expect(result.errorMessage).toBe('temporary')
    expect(result.assets).toEqual([
      { type: 'video', url: 'https://cdn/video2.mp4', thumbUrl: 'https://cdn/thumb2.jpg' },
    ])
  })

  it('should normalize failure status', async () => {
    axiosGet.mockResolvedValueOnce({
      data: { data: { status: 'error', errorMessage: 'relay failed', assets: [] } },
    } as never)

    const result = await service.getTaskStatus('job-failed-1')

    expect(result.status).toBe('failed')
    expect(result.errorMessage).toBe('relay failed')
  })

  it('should throw when relay create response does not include task id', async () => {
    axiosPost.mockResolvedValueOnce({ data: { data: {} } } as never)

    await expect(service.createVideoTask({ prompt: 'x' })).rejects.toThrow('missing task id')
  })

  it('should extract snake_case task id', async () => {
    axiosPost.mockResolvedValueOnce({ data: { data: { task_id: 'relay-task-1' } } } as never)

    const result = await service.createVideoTask({ prompt: 'x' })

    expect(result.taskId).toBe('relay-task-1')
  })
})
