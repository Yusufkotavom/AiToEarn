import { Module } from '@nestjs/common'
import { config } from '../../config'
import { AideoModule } from './aideo'
import { AssetsModule } from './assets'
import { ChatModule } from './chat'
import { ImageModule } from './image'
import { OpenaiModule } from './libs/openai'
import { LogsModule } from './logs'
import { MetadataModule } from './metadata'
import { ModelsConfigModule } from './models-config'
import { VideoModule } from './video'

@Module({
  imports: [
    OpenaiModule.forRoot(config.ai.openai),
    ChatModule,
    LogsModule,
    ImageModule,
    VideoModule,
    AideoModule,
    ModelsConfigModule,
    AssetsModule,
    MetadataModule,
  ],
  controllers: [],
  providers: [],
  exports: [ChatModule, LogsModule, ImageModule, VideoModule, AideoModule, ModelsConfigModule, AssetsModule, MetadataModule],
})
export class AiModule { }
