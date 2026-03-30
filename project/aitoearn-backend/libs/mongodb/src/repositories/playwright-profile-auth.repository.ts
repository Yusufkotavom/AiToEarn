import { Injectable } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model } from 'mongoose'
import { PlaywrightProfileAuth } from '../schemas'
import { BaseRepository, UpdateDocumentType } from './base.repository'

@Injectable()
export class PlaywrightProfileAuthRepository extends BaseRepository<PlaywrightProfileAuth> {
  constructor(
    @InjectModel(PlaywrightProfileAuth.name) playwrightProfileAuthModel: Model<PlaywrightProfileAuth>,
  ) {
    super(playwrightProfileAuthModel)
  }

  async getByProfileId(profileId: string) {
    return await this.findOne({ profileId })
  }

  async upsertByProfileId(profileId: string, update: UpdateDocumentType<PlaywrightProfileAuth>) {
    return await this.model
      .findOneAndUpdate(
        { profileId },
        { ...update, profileId },
        { new: true, upsert: true, setDefaultsOnInsert: true },
      )
      .lean({ virtuals: true })
      .exec()
  }
}

