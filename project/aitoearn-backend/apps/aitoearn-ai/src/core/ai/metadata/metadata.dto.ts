import { createZodDto } from '@yikart/common'
import { z } from 'zod'

export const metadataProviderSchema = z.enum(['auto', 'groq', 'gemini'])

export const generateMetadataItemSchema = z.object({
  materialId: z.string().optional(),
  title: z.string().default(''),
  description: z.string().default(''),
  tags: z.array(z.string()).default([]),
  platforms: z.array(z.string()).default([]),
  prompt: z.string().optional(),
})

export const generateMetadataDtoSchema = z.object({
  provider: metadataProviderSchema.default('auto'),
  model: z.string().optional(),
  promptTemplate: z.string().default(''),
  strategy: z.enum(['replace_empty', 'replace_all']).default('replace_empty'),
  item: generateMetadataItemSchema,
})

export class GenerateMetadataDto extends createZodDto(generateMetadataDtoSchema, 'GenerateMetadataDto') {}

export const metadataSettingsSchema = z.object({
  provider: metadataProviderSchema.default('groq'),
  model: z.string().optional(),
  promptTemplate: z.string().default(''),
  strategy: z.enum(['replace_empty', 'replace_all']).default('replace_empty'),
})

export class MetadataSettingsDto extends createZodDto(metadataSettingsSchema, 'MetadataSettingsDto') {}

export const createMetadataBatchDtoSchema = z.object({
  provider: metadataProviderSchema.default('auto'),
  model: z.string().optional(),
  promptTemplate: z.string().default(''),
  strategy: z.enum(['replace_empty', 'replace_all']).default('replace_empty'),
  items: z.array(generateMetadataItemSchema).min(1).max(100),
})

export class CreateMetadataBatchDto extends createZodDto(createMetadataBatchDtoSchema, 'CreateMetadataBatchDto') {}
