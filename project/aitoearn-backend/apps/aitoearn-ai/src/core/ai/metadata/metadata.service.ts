import { AIMessageChunk } from '@langchain/core/messages'
import { Injectable } from '@nestjs/common'
import { AppException, ResponseCode, UserType } from '@yikart/common'
import { UserRepository } from '@yikart/mongodb'
import { ChatService } from '../chat'
import { ModelsConfigService } from '../models-config'
import { CreateMetadataBatchDto, GenerateMetadataDto, MetadataSettingsDto } from './metadata.dto'
import { GenerateMetadataVo, MetadataBatchStatusVo } from './metadata.vo'

type BatchItemStatus = 'queued' | 'running' | 'success' | 'failed'
type BatchJobStatus = 'queued' | 'running' | 'completed' | 'failed'

interface MetadataBatchJob {
  jobId: string
  userId: string
  status: BatchJobStatus
  total: number
  successCount: number
  failedCount: number
  items: Array<{
    index: number
    status: BatchItemStatus
    payload: GenerateMetadataDto['item']
    result?: GenerateMetadataVo
    error?: string
  }>
}

@Injectable()
export class MetadataService {
  private readonly jobs = new Map<string, MetadataBatchJob>()

  constructor(
    private readonly chatService: ChatService,
    private readonly modelsConfigService: ModelsConfigService,
    private readonly userRepo: UserRepository,
  ) {}

  private inferProviderByModel(model: string): 'groq' | 'gemini' {
    const normalized = model.toLowerCase()
    if (normalized.includes('gemini')) {
      return 'gemini'
    }
    return 'groq'
  }

  private pickModel(provider: 'auto' | 'groq' | 'gemini', requestedModel?: string): string {
    const chatModels = this.modelsConfigService.config.chat.map(item => item.name)
    const defaultGroqModel = 'llama-3.3-70b-versatile'
    if (chatModels.length === 0) {
      throw new AppException(ResponseCode.InvalidModel)
    }

    const pickByProvider = () => {
      if (provider === 'auto') {
        return chatModels[0]
      }
      const matched = chatModels.find((model) => {
        const normalized = model.toLowerCase()
        if (provider === 'gemini') {
          return normalized.includes('gemini')
        }
        return normalized.includes('groq') || normalized.includes('llama') || normalized.includes('qwen')
      })
      if (!matched) {
        if (provider === 'groq') {
          return defaultGroqModel
        }
        throw new AppException(ResponseCode.InvalidModel, { provider })
      }
      return matched
    }

    if (requestedModel?.trim()) {
      const normalizedRequestedModel = requestedModel.trim()
      const exactMatchedModel = chatModels.find(model => model.toLowerCase() === normalizedRequestedModel.toLowerCase())
      const fuzzyMatchedModel = exactMatchedModel
        || chatModels.find(model => model.toLowerCase().includes(normalizedRequestedModel.toLowerCase()))
      const selectedModel = fuzzyMatchedModel ?? normalizedRequestedModel

      const modelName = selectedModel.toLowerCase()
      if (provider === 'gemini' && !modelName.includes('gemini')) {
        const fallbackGemini = chatModels.find(model => model.toLowerCase().includes('gemini'))
        if (!fallbackGemini) {
          throw new AppException(ResponseCode.InvalidModel, { provider, requestedModel: normalizedRequestedModel })
        }
        return fallbackGemini
      }
      if (provider === 'groq' && modelName.includes('gemini')) {
        const fallbackGroq = chatModels.find((model) => {
          const normalized = model.toLowerCase()
          return normalized.includes('groq') || normalized.includes('llama') || normalized.includes('qwen')
        })
        if (!fallbackGroq) {
          throw new AppException(ResponseCode.InvalidModel, { provider, requestedModel: normalizedRequestedModel })
        }
        return fallbackGroq
      }

      return selectedModel
    }

    return pickByProvider()
  }

  private pickAlternativeModelByProvider(provider: 'groq' | 'gemini', excludeModel: string): string | undefined {
    const excluded = excludeModel.toLowerCase()
    const models = this.modelsConfigService.config.chat.map(item => item.name)
    return models.find((model) => {
      const normalized = model.toLowerCase()
      if (normalized === excluded) {
        return false
      }

      if (provider === 'gemini') {
        return normalized.includes('gemini')
      }

      return normalized.includes('groq') || normalized.includes('llama') || normalized.includes('qwen')
    })
  }

  private extractText(content: AIMessageChunk['content']): string {
    if (typeof content === 'string') {
      return content
    }

    if (Array.isArray(content)) {
      return content
        .map((part) => {
          if (typeof part === 'string') {
            return part
          }
          if (typeof part === 'object' && part !== null && 'text' in part && typeof part.text === 'string') {
            return part.text
          }
          return ''
        })
        .join('\n')
    }

    return ''
  }

  private extractGeminiText(result: unknown): string {
    if (typeof result !== 'object' || result == null) {
      return ''
    }

    const response = result as {
      candidates?: Array<{
        content?: {
          parts?: Array<{ text?: string }>
        }
      }>
    }

    const parts = response.candidates?.[0]?.content?.parts || []
    return parts
      .map(part => (typeof part?.text === 'string' ? part.text : ''))
      .filter(Boolean)
      .join('\n')
  }

  private parseGeneratedMetadata(text: string): Pick<GenerateMetadataVo, 'title' | 'description' | 'tags'> {
    const cleaned = text.replace(/```json|```/gi, '').trim()
    const jsonText = cleaned.match(/\{[\s\S]*\}/)?.[0] ?? cleaned

    try {
      const parsed = JSON.parse(jsonText) as Record<string, unknown>
      const title = parsed['title']
      const description = parsed['description']
      const tags = parsed['tags']

      return {
        title: typeof title === 'string' ? title.trim() : undefined,
        description: typeof description === 'string' ? description.trim() : undefined,
        tags: Array.isArray(tags)
          ? tags.filter((item): item is string => typeof item === 'string').map(tag => tag.trim()).filter(Boolean).slice(0, 10)
          : undefined,
      }
    }
    catch {
      const lines = cleaned.split('\n').map(line => line.trim()).filter(Boolean)
      const titleLine = lines.find(line => line.toLowerCase().startsWith('title:'))
      const descLine = lines.find(line => line.toLowerCase().startsWith('description:'))
      const tagsLine = lines.find(line => line.toLowerCase().startsWith('tags:'))

      const fallbackTitle = titleLine?.replace(/^title:\s*/i, '').trim()
      const fallbackDescription = descLine?.replace(/^description:\s*/i, '').trim() || cleaned
      const fallbackTags = tagsLine
        ?.replace(/^tags:\s*/i, '')
        .split(/[,\s]+/)
        .map(tag => tag.replace(/^#/, '').trim())
        .filter(Boolean)
        .slice(0, 10)

      if (!fallbackTitle && !fallbackDescription && (!fallbackTags || fallbackTags.length === 0)) {
        throw new AppException(ResponseCode.AiCallFailed, { error: 'Metadata model returned invalid JSON format' })
      }

      return {
        title: fallbackTitle,
        description: fallbackDescription,
        tags: fallbackTags,
      }
    }
  }

  private renderPromptTemplate(template: string, request: GenerateMetadataDto): string {
    const normalizedTemplate = template.trim()
    if (!normalizedTemplate) {
      return ''
    }

    const replacements: Record<string, string> = {
      title: request.item.title || '',
      description: request.item.description || '',
      tags: request.item.tags.join(', '),
      platform: request.item.platforms.join(', '),
      platforms: request.item.platforms.join(', '),
      language: 'auto',
      tone: 'engaging',
    }

    return normalizedTemplate.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key: string) => replacements[key] ?? '')
  }

  private applyStrategy(
    strategy: 'replace_empty' | 'replace_all',
    original: GenerateMetadataDto['item'],
    generated: Pick<GenerateMetadataVo, 'title' | 'description' | 'tags'>,
  ): Pick<GenerateMetadataVo, 'title' | 'description' | 'tags'> {
    if (strategy === 'replace_all') {
      return generated
    }

    return {
      title: original.title?.trim() ? original.title : generated.title,
      description: original.description?.trim() ? original.description : generated.description,
      tags: original.tags?.length ? original.tags : generated.tags,
    }
  }

  async generateMetadata(userId: string, request: GenerateMetadataDto): Promise<GenerateMetadataVo> {
    let model = this.pickModel(request.provider, request.model)
    let activeProvider: 'groq' | 'gemini' = request.provider === 'auto'
      ? this.inferProviderByModel(model)
      : request.provider
    const renderedPromptTemplate = this.renderPromptTemplate(request.promptTemplate, request)

    const prompt = request.item.prompt?.trim().length
      ? request.item.prompt
      : renderedPromptTemplate
        || [
          'You are a social media metadata assistant.',
          'Return strict JSON only with keys: title, description, tags.',
          '',
          `Title: ${request.item.title || ''}`,
          `Description: ${request.item.description || ''}`,
          `Tags: ${request.item.tags.join(', ')}`,
          `Platforms: ${request.item.platforms.join(', ')}`,
          '',
          'Rules:',
          '- Keep output concise and engaging.',
          '- Tags must be plain words without #.',
          '- Return 5-10 tags whenever possible.',
        ].join('\n')

    let generatedText = ''
    let usage: { inputTokens?: number, outputTokens?: number } = {}

    try {
      if (activeProvider === 'gemini') {
        const geminiResult = await this.chatService.userGeminiGenerateContent({
          userId,
          userType: UserType.User,
          model,
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          config: {
            temperature: 0.6,
          },
        })
        generatedText = this.extractGeminiText(geminiResult)
        usage = {
          inputTokens: geminiResult.usageMetadata?.promptTokenCount,
          outputTokens: geminiResult.usageMetadata?.candidatesTokenCount,
        }
      }
      else {
        const completion = await this.chatService.userChatCompletion({
          userId,
          userType: UserType.User,
          model,
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.6,
        })
        generatedText = this.extractText(completion.content)
        usage = {
          inputTokens: completion.usage.input_tokens,
          outputTokens: completion.usage.output_tokens,
        }
      }
    }
    catch (error) {
      const message = error instanceof Error ? error.message : ''
      const hasAuthError = message.includes('Incorrect API key provided')
        || message.includes('invalid_api_key')
        || message.includes('UNAUTHENTICATED')
        || message.includes('Unauthorized')
      const sameProviderFallbackModel = this.pickAlternativeModelByProvider(activeProvider, model)

      if (hasAuthError && sameProviderFallbackModel) {
        model = sameProviderFallbackModel

        if (activeProvider === 'gemini') {
          const geminiResult = await this.chatService.userGeminiGenerateContent({
            userId,
            userType: UserType.User,
            model,
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            config: {
              temperature: 0.6,
            },
          })
          generatedText = this.extractGeminiText(geminiResult)
          usage = {
            inputTokens: geminiResult.usageMetadata?.promptTokenCount,
            outputTokens: geminiResult.usageMetadata?.candidatesTokenCount,
          }
        }
        else {
          const completion = await this.chatService.userChatCompletion({
            userId,
            userType: UserType.User,
            model,
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.6,
          })
          generatedText = this.extractText(completion.content)
          usage = {
            inputTokens: completion.usage.input_tokens,
            outputTokens: completion.usage.output_tokens,
          }
        }
      }
      else {
        throw error
      }
    }

    const parsed = this.parseGeneratedMetadata(generatedText)
    const finalMetadata = this.applyStrategy(request.strategy, request.item, parsed)
    activeProvider = request.provider === 'auto' ? this.inferProviderByModel(model) : request.provider

    return {
      ...finalMetadata,
      provider: activeProvider,
      model,
      usage,
    }
  }

  private toBatchStatusVo(job: MetadataBatchJob): MetadataBatchStatusVo {
    return {
      jobId: job.jobId,
      status: job.status,
      total: job.total,
      successCount: job.successCount,
      failedCount: job.failedCount,
      items: job.items.map(item => ({
        index: item.index,
        status: item.status,
        result: item.result,
        error: item.error,
      })),
    }
  }

  async createBatch(userId: string, request: CreateMetadataBatchDto): Promise<{ jobId: string }> {
    const jobId = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
    const job: MetadataBatchJob = {
      jobId,
      userId,
      status: 'queued',
      total: request.items.length,
      successCount: 0,
      failedCount: 0,
      items: request.items.map((payload, index) => ({
        index,
        status: 'queued',
        payload,
      })),
    }

    this.jobs.set(jobId, job)
    void this.processBatch(jobId, request)
    return { jobId }
  }

  private async processBatch(jobId: string, request: CreateMetadataBatchDto): Promise<void> {
    const job = this.jobs.get(jobId)
    if (!job) {
      return
    }

    job.status = 'running'

    for (const item of job.items) {
      item.status = 'running'
      try {
        const result = await this.generateMetadata(job.userId, {
          provider: request.provider,
          model: request.model,
          promptTemplate: request.promptTemplate,
          strategy: request.strategy,
          item: item.payload,
        })
        item.result = result
        item.status = 'success'
        job.successCount += 1
      }
      catch (error) {
        item.status = 'failed'
        item.error = error instanceof Error ? error.message : 'Unknown error'
        job.failedCount += 1
      }
    }

    job.status = job.failedCount > 0 ? 'failed' : 'completed'
  }

  async getBatchStatus(userId: string, jobId: string): Promise<MetadataBatchStatusVo> {
    const job = this.jobs.get(jobId)
    if (!job || job.userId !== userId) {
      throw new AppException(ResponseCode.InvalidAiTaskId, { error: 'Invalid jobId' })
    }
    return this.toBatchStatusVo(job)
  }

  async getSettings(userId: string): Promise<MetadataSettingsDto> {
    const user = await this.userRepo.getById(userId)
    const option = user?.aiInfo?.agent?.option as Record<string, unknown> | undefined
    const metadata = option?.['metadataGeneration'] as Partial<MetadataSettingsDto> | undefined

    return {
      provider: metadata?.provider || 'groq',
      model: metadata?.model,
      promptTemplate: metadata?.promptTemplate || '',
      strategy: metadata?.strategy || 'replace_empty',
    }
  }

  async updateSettings(userId: string, settings: MetadataSettingsDto): Promise<MetadataSettingsDto> {
    const user = await this.userRepo.getById(userId)
    const existingAgentInfo = user?.aiInfo?.agent
    const option = (existingAgentInfo?.option as Record<string, unknown> | undefined) || {}

    const mergedOption = {
      ...option,
      metadataGeneration: settings,
    }

    await this.userRepo.updateAiConfigItemById(userId, 'agent', {
      defaultModel: existingAgentInfo?.defaultModel || settings.model || 'gpt-4o-mini',
      option: mergedOption,
    })

    return settings
  }
}
