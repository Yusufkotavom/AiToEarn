import { Module } from '@nestjs/common'
import { GoogleFlowBrowserModule } from '../libs/google-flow-browser'
import { GoogleFlowController } from './google-flow.controller'
import { PlaywrightAuthService } from './playwright-auth.service'
import { PlaywrightController } from './playwright.controller'

@Module({
  imports: [GoogleFlowBrowserModule],
  controllers: [GoogleFlowController, PlaywrightController],
  providers: [PlaywrightAuthService],
})
export class GoogleFlowModule {}
