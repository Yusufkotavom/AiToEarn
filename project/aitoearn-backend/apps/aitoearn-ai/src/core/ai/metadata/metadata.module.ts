import { Module } from '@nestjs/common'
import { ChatModule } from '../chat'
import { ModelsConfigModule } from '../models-config'
import { MetadataController } from './metadata.controller'
import { MetadataService } from './metadata.service'

@Module({
  imports: [ChatModule, ModelsConfigModule],
  controllers: [MetadataController],
  providers: [MetadataService],
  exports: [MetadataService],
})
export class MetadataModule {}
