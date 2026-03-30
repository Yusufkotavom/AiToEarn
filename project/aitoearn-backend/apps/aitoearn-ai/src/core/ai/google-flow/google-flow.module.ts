import { Module } from '@nestjs/common'
import { GoogleFlowBrowserModule } from '../libs/google-flow-browser'
import { GoogleFlowController } from './google-flow.controller'
import { PlaywrightController } from './playwright.controller'

@Module({
  imports: [GoogleFlowBrowserModule],
  controllers: [GoogleFlowController, PlaywrightController],
})
export class GoogleFlowModule {}
