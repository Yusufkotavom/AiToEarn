import http from '@/utils/request'

export type MetadataAiProvider = 'auto' | 'groq' | 'gemini'

export interface GenerateMetadataRequest {
  provider: MetadataAiProvider
  model?: string
  promptTemplate: string
  strategy: 'replace_empty' | 'replace_all'
  item: {
    materialId?: string
    title: string
    description: string
    tags: string[]
    platforms: string[]
    prompt?: string
  }
}

export interface GenerateMetadataResponse {
  title?: string
  description?: string
  tags?: string[]
  provider?: MetadataAiProvider
  model?: string
  usage?: {
    inputTokens?: number
    outputTokens?: number
  }
}

export function apiGenerateMetadata(data: GenerateMetadataRequest) {
  return http.post<GenerateMetadataResponse>('ai/metadata/generate', data, true)
}

export interface CreateMetadataBatchRequest {
  provider: MetadataAiProvider
  model?: string
  promptTemplate: string
  strategy: 'replace_empty' | 'replace_all'
  items: Array<{
    materialId?: string
    title: string
    description: string
    tags: string[]
    platforms: string[]
    prompt?: string
  }>
}

export interface CreateMetadataBatchResponse {
  jobId: string
}

export function apiCreateMetadataBatch(data: CreateMetadataBatchRequest) {
  return http.post<CreateMetadataBatchResponse>('ai/metadata/generate/batch', data, true)
}

export interface MetadataBatchItemStatus {
  index: number
  status: 'queued' | 'running' | 'success' | 'failed'
  result?: GenerateMetadataResponse
  error?: string
}

export interface MetadataBatchStatusResponse {
  jobId: string
  status: 'queued' | 'running' | 'completed' | 'failed'
  total: number
  successCount: number
  failedCount: number
  items: MetadataBatchItemStatus[]
}

export function apiGetMetadataBatchJob(jobId: string) {
  return http.get<MetadataBatchStatusResponse>(`ai/metadata/generate/batch/${jobId}`, {}, true)
}

export interface MetadataSettings {
  provider: MetadataAiProvider
  model?: string
  promptTemplate: string
  strategy: 'replace_empty' | 'replace_all'
}

export function apiGetMetadataSettings() {
  return http.get<MetadataSettings>('ai/metadata/settings', {}, true)
}

export function apiUpdateMetadataSettings(data: MetadataSettings) {
  return http.post<MetadataSettings>('ai/metadata/settings', data, true)
}
