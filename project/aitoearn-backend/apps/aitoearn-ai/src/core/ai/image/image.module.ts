import { Module } from '@nestjs/common'
import { ModelsConfigModule } from '../models-config'
import { PlaywrightRelayService } from '../relay/playwright-relay.service'
import { ImageConsumer } from './image.consumer'
import { ImageController } from './image.controller'
import { ImageService } from './image.service'

@Module({
  imports: [
    ModelsConfigModule,
  ],
  controllers: [ImageController],
  providers: [ImageService, ImageConsumer, PlaywrightRelayService],
  exports: [ImageService],
})
export class ImageModule {}
