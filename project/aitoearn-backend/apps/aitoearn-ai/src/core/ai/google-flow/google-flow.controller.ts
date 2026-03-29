import { Controller, Get, Post } from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import { GetToken, TokenInfo } from '@yikart/aitoearn-auth'
import { GoogleFlowBrowserService } from '../libs/google-flow-browser'

@ApiTags('Me/Ai/GoogleFlow')
@Controller('ai/google-flow')
export class GoogleFlowController {
  constructor(private readonly googleFlowBrowserService: GoogleFlowBrowserService) {}

  @Get('/login-url')
  async getLoginUrl(@GetToken() _token: TokenInfo) {
    const result = await this.googleFlowBrowserService.getLoginUrl()
    return {
      url: result.url,
      requiresLogin: result.requiresLogin ?? true,
      note: result.note || 'Open this URL in browser and complete Google login for Flow session.',
    }
  }

  @Get('/session-status')
  async getSessionStatus(@GetToken() _token: TokenInfo) {
    const result = await this.googleFlowBrowserService.getSessionStatus()
    return {
      loggedIn: result.loggedIn,
      account: result.account,
    }
  }

  @Post('/relogin')
  async relogin(@GetToken() _token: TokenInfo) {
    const result = await this.googleFlowBrowserService.triggerRelogin()
    const login = await this.googleFlowBrowserService.getLoginUrl()
    return {
      loggedIn: result.loggedIn,
      account: result.account,
      loginUrl: login.url,
      note: login.note || 'Session reset requested, continue login via provided URL.',
    }
  }
}
