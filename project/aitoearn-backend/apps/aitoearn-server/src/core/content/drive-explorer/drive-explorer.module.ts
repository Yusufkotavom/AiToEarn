import { Module } from '@nestjs/common'
import { MongooseModule } from '@nestjs/mongoose'
import { AssetsModule } from '../../assets/assets.module'
import { ContentModule } from '../content.module'
import { DriveExplorerController } from './drive-explorer.controller'
import { DriveExplorerService } from './drive-explorer.service'
import { DriveImportRecord, DriveImportRecordSchema } from './drive-import-record.schema'

@Module({
  imports: [
    AssetsModule,
    ContentModule,
    MongooseModule.forFeature([{ name: DriveImportRecord.name, schema: DriveImportRecordSchema }]),
  ],
  controllers: [DriveExplorerController],
  providers: [DriveExplorerService],
})
export class DriveExplorerModule {}

