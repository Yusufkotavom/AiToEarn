import { createZodDto } from '@yikart/common'
import { z } from 'zod'
import { metadataProviderSchema } from './metadata.dto'

export const generateMetadataVoSchema = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
  tags: z.array(z.string()).optional(),
  provider: metadataProviderSchema.optional(),
  model: z.string().optional(),
  usage: z.object({
    inputTokens: z.number().optional(),
    outputTokens: z.number().optional(),
  }).optional(),
})

export class GenerateMetadataVo extends createZodDto(generateMetadataVoSchema, 'GenerateMetadataVo') {}
