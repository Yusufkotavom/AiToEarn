import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'

@Schema({ collection: 'driveImportRecord', timestamps: true })
export class DriveImportRecord {
  @Prop({ required: true, index: true })
  userId: string

  @Prop({ required: true })
  sourcePath: string

  @Prop({ required: true, index: true })
  checksum: string

  @Prop({ required: true })
  fileSize: number

  @Prop({ required: true })
  mtimeMs: number

  @Prop({ required: true })
  materialId: string
}

export const DriveImportRecordSchema = SchemaFactory.createForClass(DriveImportRecord)
DriveImportRecordSchema.index({ userId: 1, checksum: 1 }, { unique: true })

