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

export const createMetadataBatchVoSchema = z.object({
  jobId: z.string(),
})

export class CreateMetadataBatchVo extends createZodDto(createMetadataBatchVoSchema, 'CreateMetadataBatchVo') {}

export const metadataBatchItemVoSchema = z.object({
  index: z.number(),
  status: z.enum(['queued', 'running', 'success', 'failed']),
  result: generateMetadataVoSchema.optional(),
  error: z.string().optional(),
})

export const metadataBatchStatusVoSchema = z.object({
  jobId: z.string(),
  status: z.enum(['queued', 'running', 'completed', 'failed']),
  total: z.number(),
  successCount: z.number(),
  failedCount: z.number(),
  items: z.array(metadataBatchItemVoSchema),
})

export class MetadataBatchStatusVo extends createZodDto(metadataBatchStatusVoSchema, 'MetadataBatchStatusVo') {}
