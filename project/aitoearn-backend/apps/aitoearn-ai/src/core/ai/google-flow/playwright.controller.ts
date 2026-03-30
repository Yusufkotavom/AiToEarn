import { Body, Controller, Get, Param, Post } from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import { GetToken, TokenInfo } from '@yikart/aitoearn-auth'
import { GoogleFlowBrowserService } from '../libs/google-flow-browser'
import { PlaywrightAuthService } from './playwright-auth.service'

@ApiTags('Me/Ai/Playwright')
@Controller('ai/playwright')
export class PlaywrightController {
  constructor(
    private readonly googleFlowBrowserService: GoogleFlowBrowserService,
    private readonly playwrightAuthService: PlaywrightAuthService,
  ) {}

  @Get('/profiles')
  async listProfiles(@GetToken() _token: TokenInfo) {
    const profiles = await this.googleFlowBrowserService.listProfiles()
    return { profiles }
  }

  @Post('/profiles')
  async createProfile(
    @GetToken() _token: TokenInfo,
    @Body() body: {
      id?: string
      label: string
      provider?: string
      capabilities?: string[]
      headless?: boolean
    },
  ) {
    const profile = await this.googleFlowBrowserService.createProfile({
      id: body.id,
      label: body.label,
      provider: body.provider || 'google-flow',
      capabilities: Array.isArray(body.capabilities) && body.capabilities.length ? body.capabilities : ['image', 'video'],
      headless: body.headless,
    })
    return { profile }
  }

  @Get('/profiles/:profileId')
  async getProfile(@GetToken() _token: TokenInfo, @Param('profileId') profileId: string) {
    const profile = await this.googleFlowBrowserService.getProfile(profileId)
    return { profile }
  }

  @Post('/profiles/:profileId/login/start')
  async startLogin(@GetToken() _token: TokenInfo, @Param('profileId') profileId: string) {
    const profile = await this.googleFlowBrowserService.startProfileLogin(profileId)
    return { profile }
  }

  @Post('/profiles/:profileId/login/open')
  async openLoginBrowser(@GetToken() _token: TokenInfo, @Param('profileId') profileId: string) {
    const result = await this.googleFlowBrowserService.openProfileLoginBrowser(profileId)
    return {
      profile: result.profile,
      loginUrl: result.loginUrl,
    }
  }

  @Get('/profiles/:profileId/login/status')
  async loginStatus(@GetToken() _token: TokenInfo, @Param('profileId') profileId: string) {
    const status = await this.googleFlowBrowserService.getProfileLoginStatus(profileId)
    return {
      loggedIn: status.loggedIn,
      account: status.account,
      status: status.status,
      profile: status.profile,
    }
  }

  @Post('/profiles/:profileId/login/resume')
  async resumeLogin(@GetToken() _token: TokenInfo, @Param('profileId') profileId: string) {
    const status = await this.googleFlowBrowserService.resumeProfileLogin(profileId)
    return {
      loggedIn: status.loggedIn,
      account: status.account,
      status: status.status,
      profile: status.profile,
    }
  }

  @Post('/profiles/:profileId/login/reset')
  async resetLogin(@GetToken() _token: TokenInfo, @Param('profileId') profileId: string) {
    const status = await this.googleFlowBrowserService.resetProfileLogin(profileId)
    return {
      loggedIn: status.loggedIn,
      account: status.account,
      status: status.status,
      profile: status.profile,
    }
  }

  @Post('/profiles/:profileId/login/credentials')
  async loginWithCredentials(
    @GetToken() _token: TokenInfo,
    @Param('profileId') profileId: string,
    @Body() body: {
      email?: string
      password?: string
      remember?: boolean
    },
  ) {
    return await this.playwrightAuthService.loginWithCredentials(profileId, body)
  }

  @Get('/profiles/:profileId/debug')
  async getDebug(@GetToken() _token: TokenInfo, @Param('profileId') profileId: string) {
    const info = await this.googleFlowBrowserService.getProfileDebug(profileId)
    return info
  }
}
