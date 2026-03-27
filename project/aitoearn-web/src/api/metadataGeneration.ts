import http from '@/utils/request'

export type MetadataAiProvider = 'auto' | 'groq' | 'gemini'

export interface GenerateMetadataRequest {
  provider: MetadataAiProvider
  promptTemplate: string
  strategy: 'replace_empty' | 'replace_all'
  apiKeys?: {
    groqApiKey?: string
    geminiApiKey?: string
  }
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
  promptTemplate: string
  strategy: 'replace_empty' | 'replace_all'
  apiKeys?: {
    groqApiKey?: string
    geminiApiKey?: string
  }
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
