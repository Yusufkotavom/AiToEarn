import { Module } from '@nestjs/common'
import { GoogleFlowBrowserModule } from '../libs/google-flow-browser'
import { GoogleFlowController } from './google-flow.controller'

@Module({
  imports: [GoogleFlowBrowserModule],
  controllers: [GoogleFlowController],
})
export class GoogleFlowModule {}
