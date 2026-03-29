import { Global, Module } from '@nestjs/common'
import { GoogleFlowBrowserService } from './google-flow-browser.service'

@Global()
@Module({
  providers: [GoogleFlowBrowserService],
  exports: [GoogleFlowBrowserService],
})
export class GoogleFlowBrowserModule {}
