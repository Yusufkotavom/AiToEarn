import { AIMessageChunk } from '@langchain/core/messages'
import { Injectable } from '@nestjs/common'
import { AppException, ResponseCode, UserType } from '@yikart/common'
import { ChatService } from '../chat'
import { ModelsConfigService } from '../models-config'
import { GenerateMetadataDto } from './metadata.dto'
import { GenerateMetadataVo } from './metadata.vo'

@Injectable()
export class MetadataService {
  constructor(
    private readonly chatService: ChatService,
    private readonly modelsConfigService: ModelsConfigService,
  ) {}

  private inferProviderByModel(model: string): 'groq' | 'gemini' {
    const normalized = model.toLowerCase()
    if (normalized.includes('gemini')) {
      return 'gemini'
    }
    return 'groq'
  }

  private pickModel(provider: 'auto' | 'groq' | 'gemini'): string {
    const chatModels = this.modelsConfigService.config.chat.map(item => item.name)
    if (chatModels.length === 0) {
      throw new AppException(ResponseCode.InvalidModel)
    }

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

    return matched ?? chatModels[0]
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
      throw new AppException(ResponseCode.AiCallFailed, { error: 'Metadata model returned invalid JSON format' })
    }
  }

  async generateMetadata(userId: string, request: GenerateMetadataDto): Promise<GenerateMetadataVo> {
    const model = this.pickModel(request.provider)

    const prompt = request.item.prompt?.trim().length
      ? request.item.prompt
      : [
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

    const completion = await this.chatService.userChatCompletion({
      userId,
      userType: UserType.User,
      model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.6,
    })

    const parsed = this.parseGeneratedMetadata(this.extractText(completion.content))
    const resolvedProvider = request.provider === 'auto' ? this.inferProviderByModel(model) : request.provider

    return {
      ...parsed,
      provider: resolvedProvider,
      model,
      usage: {
        inputTokens: completion.usage.input_tokens,
        outputTokens: completion.usage.output_tokens,
      },
    }
  }
}
