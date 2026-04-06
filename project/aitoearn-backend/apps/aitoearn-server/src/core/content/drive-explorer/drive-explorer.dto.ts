import { createZodDto } from '@yikart/common'
import { z } from 'zod'

const MediaTypeSchema = z.enum(['video', 'img', 'all'])
const DriveImportModeSchema = z.enum(['file', 'folder'])

export const BrowseDriveDtoSchema = z.object({
  path: z.string().min(1),
  cursor: z.string().optional(),
  pageSize: z.number().int().min(1).max(200).default(50),
  mediaType: MediaTypeSchema.default('all'),
})

export class BrowseDriveDto extends createZodDto(BrowseDriveDtoSchema) {}

export const PreviewDriveImportDtoSchema = z.object({
  groupId: z.string().min(1),
  paths: z.array(z.string().min(1)).min(1).max(100),
  mode: DriveImportModeSchema.default('file'),
})

export class PreviewDriveImportDto extends createZodDto(PreviewDriveImportDtoSchema) {}

export const CreateDriveImportDtoSchema = z.object({
  groupId: z.string().min(1),
  paths: z.array(z.string().min(1)).min(1).max(100),
  mode: DriveImportModeSchema.default('file'),
})

export class CreateDriveImportDto extends createZodDto(CreateDriveImportDtoSchema) {}

