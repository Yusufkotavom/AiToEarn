import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { DEFAULT_SCHEMA_OPTIONS } from '../mongodb.constants'
import { WithTimestampSchema } from './timestamp.schema'

export const PLAYWRIGHT_PROFILE_AUTH_STATUSES = [
  'idle',
  'starting',
  'awaiting_challenge',
  'authenticated',
  'expired',
  'failed',
] as const

export type PlaywrightProfileAuthStatus = (typeof PLAYWRIGHT_PROFILE_AUTH_STATUSES)[number]

@Schema({ ...DEFAULT_SCHEMA_OPTIONS, collection: 'playwrightProfileAuth' })
export class PlaywrightProfileAuth extends WithTimestampSchema {
  id: string

  @Prop({ required: true, unique: true, index: true })
  profileId: string

  @Prop({ required: true, default: 'google-flow' })
  provider: string

  @Prop({ required: true, default: '' })
  email: string

  @Prop({ required: true, default: '' })
  passwordEncrypted: string

  @Prop({ required: true, default: false })
  remember: boolean

  @Prop({ required: true, enum: PLAYWRIGHT_PROFILE_AUTH_STATUSES, default: 'idle' })
  status: PlaywrightProfileAuthStatus

  @Prop({ required: false, default: '' })
  account?: string

  @Prop({ required: false, default: '' })
  lastError?: string

  @Prop({ required: false, default: '' })
  lastStep?: string

  @Prop({ required: false, default: '' })
  lastUrl?: string

  @Prop({ required: false, default: '' })
  lastSnapshotPath?: string

  @Prop({ required: false, type: Date })
  lastCheckedAt?: Date
}

export const PlaywrightProfileAuthSchema = SchemaFactory.createForClass(PlaywrightProfileAuth)
PlaywrightProfileAuthSchema.index({ status: 1, updatedAt: -1 })

