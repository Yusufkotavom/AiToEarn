import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'
import { Injectable } from '@nestjs/common'
import { PlaywrightProfileAuthRepository, type PlaywrightProfileAuthStatus } from '@yikart/mongodb'
import { AppException, ResponseCode } from '@yikart/common'
import { config } from '../../../config'
import { GoogleFlowBrowserService, type PlaywrightProfileDebugInfo, type PlaywrightProfileSummary } from '../libs/google-flow-browser'

interface LoginWithCredentialsInput {
  email?: string
  password?: string
  remember?: boolean
}

interface LoginWithCredentialsResult {
  loggedIn: boolean
  account?: string
  status?: PlaywrightProfileAuthStatus
  profile?: PlaywrightProfileSummary
  note?: string
  auth: {
    email?: string
    remember: boolean
    status?: PlaywrightProfileAuthStatus
    lastError?: string
    lastStep?: string
    lastUrl?: string
    lastSnapshotPath?: string
    lastCheckedAt?: string
  }
}

@Injectable()
export class PlaywrightAuthService {
  constructor(
    private readonly playwrightProfileAuthRepo: PlaywrightProfileAuthRepository,
    private readonly googleFlowBrowserService: GoogleFlowBrowserService,
  ) {}

  private get credentialsSecret() {
    return String(config.ai.googleFlowBrowser.credentialsSecret || '')
  }

  private get normalizedKey() {
    const secret = this.credentialsSecret
    if (!secret) {
      return null
    }
    return createHash('sha256').update(secret).digest()
  }

  private encryptPassword(password: string): string {
    const key = this.normalizedKey
    if (!key) {
      throw new AppException(ResponseCode.ValidationFailed, 'PLAYWRIGHT_CREDENTIALS_SECRET is required when remember=true')
    }
    const iv = randomBytes(12)
    const cipher = createCipheriv('aes-256-gcm', key, iv)
    const encrypted = Buffer.concat([cipher.update(password, 'utf8'), cipher.final()])
    const tag = cipher.getAuthTag()
    return `v1:${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`
  }

  private decryptPassword(encryptedValue: string): string {
    const key = this.normalizedKey
    if (!key) {
      throw new AppException(ResponseCode.ValidationFailed, 'PLAYWRIGHT_CREDENTIALS_SECRET is required to use saved credentials')
    }
    const [version, ivHex, tagHex, cipherHex] = String(encryptedValue || '').split(':')
    if (version !== 'v1' || !ivHex || !tagHex || !cipherHex) {
      throw new AppException(ResponseCode.ValidationFailed, 'Invalid saved credentials format')
    }
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivHex, 'hex'))
    decipher.setAuthTag(Buffer.from(tagHex, 'hex'))
    const plain = Buffer.concat([decipher.update(Buffer.from(cipherHex, 'hex')), decipher.final()])
    return plain.toString('utf8')
  }

  private normalizeStatus(value: string | undefined): PlaywrightProfileAuthStatus {
    if (value === 'starting' || value === 'awaiting_challenge' || value === 'authenticated' || value === 'expired' || value === 'failed') {
      return value
    }
    return 'idle'
  }

  private buildAuthState(input: {
    email?: string
    remember: boolean
    status?: PlaywrightProfileAuthStatus
    debug?: PlaywrightProfileDebugInfo['debug']
  }) {
    return {
      email: input.email || undefined,
      remember: input.remember,
      status: input.status,
      lastError: input.debug?.lastError || undefined,
      lastStep: input.debug?.lastStep || undefined,
      lastUrl: input.debug?.lastUrl || undefined,
      lastSnapshotPath: input.debug?.lastSnapshotPath || undefined,
      lastCheckedAt: new Date().toISOString(),
    }
  }

  async loginWithCredentials(profileId: string, input: LoginWithCredentialsInput): Promise<LoginWithCredentialsResult> {
    const profileIdValue = String(profileId || '').trim()
    if (!profileIdValue) {
      throw new AppException(ResponseCode.ValidationFailed, 'profileId is required')
    }

    let existing = await this.playwrightProfileAuthRepo.getByProfileId(profileIdValue)
    if (!existing && !input.email && !input.password) {
      // Backward-compatible fallback:
      // some old flows stored credentials using profile label (e.g. "yusuf")
      // while generation uses UUID profileId.
      const profile = await this.googleFlowBrowserService.getProfile(profileIdValue).catch(() => null)
      const fallbackKey = String(profile?.label || '').trim()
      if (fallbackKey && fallbackKey !== profileIdValue) {
        existing = await this.playwrightProfileAuthRepo.getByProfileId(fallbackKey)
      }
    }
    const remember = Boolean(input.remember ?? existing?.remember ?? false)
    const email = String(input.email || '').trim() || String(existing?.email || '').trim()

    let password = String(input.password || '')
    if (!password && existing?.passwordEncrypted) {
      password = this.decryptPassword(existing.passwordEncrypted)
    }

    if (!email) {
      throw new AppException(ResponseCode.ValidationFailed, 'Email is required')
    }
    if (!password) {
      throw new AppException(ResponseCode.ValidationFailed, 'Password is required')
    }

    if (remember && !this.credentialsSecret) {
      throw new AppException(ResponseCode.ValidationFailed, 'PLAYWRIGHT_CREDENTIALS_SECRET is required when remember=true')
    }

    try {
      const loginResult = await this.googleFlowBrowserService.loginProfileWithCredentials(profileIdValue, { email, password })
      const debugInfo = await this.googleFlowBrowserService.getProfileDebug(profileIdValue).catch(() => null)
      const debug = debugInfo?.debug
      const status = this.normalizeStatus(loginResult.status)
      const passwordEncrypted = remember ? this.encryptPassword(password) : ''

      const saved = await this.playwrightProfileAuthRepo.upsertByProfileId(profileIdValue, {
        provider: 'google-flow',
        email,
        passwordEncrypted,
        remember,
        status,
        account: loginResult.account || '',
        lastError: debug?.lastError || '',
        lastStep: debug?.lastStep || '',
        lastUrl: debug?.lastUrl || '',
        lastSnapshotPath: debug?.lastSnapshotPath || '',
        lastCheckedAt: new Date(),
      })

      return {
        loggedIn: Boolean(loginResult.loggedIn),
        account: loginResult.account,
        status,
        profile: loginResult.profile,
        note: loginResult.note,
        auth: this.buildAuthState({
          email,
          remember: Boolean(saved?.remember ?? remember),
          status: this.normalizeStatus(String(saved?.status || status)),
          debug,
        }),
      }
    }
    catch (error: any) {
      const message = error?.message || 'Credentials login failed'
      const debugInfo = await this.googleFlowBrowserService.getProfileDebug(profileIdValue).catch(() => null)
      const debug = debugInfo?.debug
      const status = debug?.lastStep?.includes('authenticated') ? 'authenticated' : this.normalizeStatus(String(existing?.status || 'failed'))

      await this.playwrightProfileAuthRepo.upsertByProfileId(profileIdValue, {
        provider: 'google-flow',
        email,
        passwordEncrypted: remember && password ? this.encryptPassword(password) : '',
        remember,
        status: status === 'authenticated' ? 'authenticated' : 'failed',
        account: String(existing?.account || ''),
        lastError: debug?.lastError || message,
        lastStep: debug?.lastStep || '',
        lastUrl: debug?.lastUrl || '',
        lastSnapshotPath: debug?.lastSnapshotPath || '',
        lastCheckedAt: new Date(),
      })

      throw error
    }
  }
}
