import { Module } from '@nestjs/common'
import { GoogleFlowBrowserModule } from '../libs/google-flow-browser'
import { ModelsConfigModule } from '../models-config'
import { ImageConsumer } from './image.consumer'
import { ImageController } from './image.controller'
import { ImageService } from './image.service'

@Module({
  imports: [
    ModelsConfigModule,
    GoogleFlowBrowserModule,
  ],
  controllers: [ImageController],
  providers: [ImageService, ImageConsumer],
  exports: [ImageService],
})
export class ImageModule {}
