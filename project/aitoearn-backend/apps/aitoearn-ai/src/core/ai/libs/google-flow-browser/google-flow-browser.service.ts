import { Injectable } from '@nestjs/common'
import { AppException, ResponseCode } from '@yikart/common'
import { config } from '../../../../config'

export type GoogleFlowTaskStatus = 'queued' | 'processing' | 'succeeded' | 'failed'
export type PlaywrightProfileStatus = 'idle' | 'starting' | 'awaiting_challenge' | 'authenticated' | 'expired' | 'failed'

export interface GoogleFlowTaskResult {
  taskId?: string
  status: GoogleFlowTaskStatus
  outputUrl?: string
  error?: string
  raw: unknown
}

export interface GoogleFlowLoginInfo {
  url: string
  requiresLogin?: boolean
  note?: string
  raw: unknown
}

export interface GoogleFlowSessionStatus {
  loggedIn: boolean
  account?: string
  raw: unknown
}

export interface PlaywrightProfileSummary {
  id: string
  label: string
  provider: string
  capabilities: string[]
  headless?: boolean
  status: PlaywrightProfileStatus
  account?: string
  loginUrl?: string
  createdAt?: string
  updatedAt?: string
  raw?: unknown
}

export interface PlaywrightProfileDebugInfo {
  profile: PlaywrightProfileSummary
  debug: {
    lastStep?: string
    lastError?: string
    lastUrl?: string
    lastSnapshotPath?: string
    events?: Array<Record<string, unknown>>
  }
  raw: unknown
}

@Injectable()
export class GoogleFlowBrowserService {
  private get conf() {
    return config.ai.googleFlowBrowser
  }

  private ensureConfigured() {
    if (!this.conf.baseUrl) {
      throw new AppException(ResponseCode.AiCallFailed, 'Google Flow browser integration is not configured')
    }
  }

  private normalizeStatus(value: unknown): GoogleFlowTaskStatus {
    const status = String(value || '').toLowerCase()
    if (['done', 'success', 'succeeded', 'completed', 'complete', 'finished'].includes(status)) {
      return 'succeeded'
    }
    if (['fail', 'failed', 'error', 'cancelled', 'canceled'].includes(status)) {
      return 'failed'
    }
    if (['processing', 'running', 'in_progress', 'working'].includes(status)) {
      return 'processing'
    }
    return 'queued'
  }

  private normalizeProfileStatus(value: unknown): PlaywrightProfileStatus {
    const status = String(value || '').toLowerCase()
    if (status === 'authenticated') {
      return 'authenticated'
    }
    if (status === 'awaiting_challenge') {
      return 'awaiting_challenge'
    }
    if (status === 'starting') {
      return 'starting'
    }
    if (status === 'expired') {
      return 'expired'
    }
    if (status === 'failed') {
      return 'failed'
    }
    return 'idle'
  }

  private extractUrl(payload: Record<string, unknown>): string | undefined {
    const direct = payload['outputUrl'] || payload['url'] || payload['videoUrl'] || payload['imageUrl']
    if (typeof direct === 'string' && direct.length > 0) {
      return direct
    }
    const data = payload['data'] as Record<string, unknown> | undefined
    const result = payload['result'] as Record<string, unknown> | undefined
    const nested = data?.['url'] || data?.['videoUrl'] || data?.['imageUrl'] || result?.['url'] || result?.['videoUrl'] || result?.['imageUrl']
    return typeof nested === 'string' && nested.length > 0 ? nested : undefined
  }

  private extractError(payload: Record<string, unknown>): string | undefined {
    const direct = payload['error'] || payload['message']
    if (typeof direct === 'string' && direct.length > 0) {
      return direct
    }
    const errorObj = payload['error'] as Record<string, unknown> | undefined
    const nested = errorObj?.['message']
    return typeof nested === 'string' && nested.length > 0 ? nested : undefined
  }

  private normalizeTaskResult(raw: unknown): GoogleFlowTaskResult {
    const payload = (raw && typeof raw === 'object') ? raw as Record<string, unknown> : {}
    const taskIdValue = payload['taskId'] || payload['task_id'] || payload['id']
    const taskId = typeof taskIdValue === 'string' && taskIdValue.length > 0 ? taskIdValue : undefined
    const status = this.normalizeStatus(payload['status'] || payload['state'])
    const outputUrl = this.extractUrl(payload)
    const error = this.extractError(payload)

    const finalStatus = outputUrl && status === 'queued' ? 'succeeded' : status
    return { taskId, status: finalStatus, outputUrl, error, raw }
  }

  private normalizeProfile(raw: unknown): PlaywrightProfileSummary {
    const payload = (raw && typeof raw === 'object') ? raw as Record<string, unknown> : {}
    const id = typeof payload['id'] === 'string' ? payload['id'] : ''
    if (!id) {
      throw new AppException(ResponseCode.AiCallFailed, 'Playwright profile id is missing')
    }
    return {
      id,
      label: typeof payload['label'] === 'string' ? payload['label'] : id,
      provider: typeof payload['provider'] === 'string' ? payload['provider'] : 'google-flow',
      capabilities: Array.isArray(payload['capabilities']) ? payload['capabilities'].map(v => String(v)) : [],
      headless: typeof payload['headless'] === 'boolean' ? payload['headless'] : undefined,
      status: this.normalizeProfileStatus(payload['status']),
      account: typeof payload['account'] === 'string' ? payload['account'] : undefined,
      loginUrl: typeof payload['loginUrl'] === 'string' ? payload['loginUrl'] : undefined,
      createdAt: typeof payload['createdAt'] === 'string' ? payload['createdAt'] : undefined,
      updatedAt: typeof payload['updatedAt'] === 'string' ? payload['updatedAt'] : undefined,
      raw,
    }
  }

  private buildTaskStatusPath(taskId: string): string {
    const template = this.conf.taskStatusPath || '/v1/tasks/{taskId}'
    if (template.includes('{taskId}')) {
      return template.replace('{taskId}', encodeURIComponent(taskId))
    }
    return `${template.replace(/\/+$/, '')}/${encodeURIComponent(taskId)}`
  }

  private buildPath(template: string, params: Record<string, string>): string {
    let path = template
    for (const [k, v] of Object.entries(params)) {
      path = path.replace(new RegExp(`\\{${k}\\}`, 'g'), encodeURIComponent(v))
    }
    return path
  }

  private async requestJson(method: 'GET' | 'POST', path: string, body?: Record<string, unknown>): Promise<unknown> {
    this.ensureConfigured()
    const url = new URL(path, `${this.conf.baseUrl.replace(/\/+$/, '')}/`)
    const headers: Record<string, string> = {}
    if (this.conf.apiKey) {
      headers['Authorization'] = `Bearer ${this.conf.apiKey}`
    }
    if (method === 'POST') {
      headers['Content-Type'] = 'application/json'
    }

    const response = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(this.conf.timeoutMs),
    })

    const text = await response.text()
    let data: unknown = undefined
    if (text) {
      try {
        data = JSON.parse(text)
      }
      catch {
        data = { message: text }
      }
    }

    if (!response.ok) {
      const message = (typeof data === 'object' && data && 'message' in data && typeof (data as Record<string, unknown>)['message'] === 'string')
        ? (data as Record<string, unknown>)['message'] as string
        : `Google Flow browser request failed: HTTP ${response.status}`
      throw new AppException(ResponseCode.AiCallFailed, message)
    }

    return data || {}
  }

  async createImageTask(params: {
    prompt: string
    model: string
    size?: string
    image?: string
    userId: string
    profileId: string
  }): Promise<GoogleFlowTaskResult> {
    const response = await this.requestJson('POST', this.conf.imageGeneratePath, params)
    return this.normalizeTaskResult(response)
  }

  async createVideoTask(params: {
    prompt: string
    model: string
    size?: string
    duration?: number
    image?: string
    aspectRatio?: string
    userId: string
    profileId: string
  }): Promise<GoogleFlowTaskResult> {
    const response = await this.requestJson('POST', this.conf.videoGeneratePath, params)
    return this.normalizeTaskResult(response)
  }

  async getTaskStatus(taskId: string): Promise<GoogleFlowTaskResult> {
    const response = await this.requestJson('GET', this.buildTaskStatusPath(taskId))
    return this.normalizeTaskResult(response)
  }

  // Legacy compatibility
  async getLoginUrl(): Promise<GoogleFlowLoginInfo> {
    const response = await this.requestJson('GET', this.conf.loginUrlPath)
    const payload = (response && typeof response === 'object') ? response as Record<string, unknown> : {}
    const urlValue = payload['url']
    if (typeof urlValue !== 'string' || urlValue.length === 0) {
      throw new AppException(ResponseCode.AiCallFailed, 'Google Flow worker did not return login URL')
    }
    return {
      url: urlValue,
      requiresLogin: Boolean(payload['requiresLogin'] ?? true),
      note: typeof payload['note'] === 'string' ? payload['note'] : undefined,
      raw: response,
    }
  }

  // Legacy compatibility
  async getSessionStatus(): Promise<GoogleFlowSessionStatus> {
    const response = await this.requestJson('GET', this.conf.sessionStatusPath)
    const payload = (response && typeof response === 'object') ? response as Record<string, unknown> : {}
    return {
      loggedIn: Boolean(payload['loggedIn']),
      account: typeof payload['account'] === 'string' ? payload['account'] : undefined,
      raw: response,
    }
  }

  // Legacy compatibility
  async triggerRelogin(): Promise<GoogleFlowSessionStatus> {
    const response = await this.requestJson('POST', this.conf.reloginPath)
    const payload = (response && typeof response === 'object') ? response as Record<string, unknown> : {}
    return {
      loggedIn: Boolean(payload['loggedIn']),
      account: typeof payload['account'] === 'string' ? payload['account'] : undefined,
      raw: response,
    }
  }

  async listProfiles(): Promise<PlaywrightProfileSummary[]> {
    const response = await this.requestJson('GET', this.conf.profilesPath)
    const payload = (response && typeof response === 'object') ? response as Record<string, unknown> : {}
    const list = Array.isArray(payload['profiles']) ? payload['profiles'] : []
    return list.map(item => this.normalizeProfile(item))
  }

  async createProfile(params: {
    id?: string
    label: string
    provider?: string
    capabilities: string[]
    headless?: boolean
  }): Promise<PlaywrightProfileSummary> {
    const response = await this.requestJson('POST', this.conf.profilesPath, params)
    return this.normalizeProfile(response)
  }

  async getProfile(profileId: string): Promise<PlaywrightProfileSummary> {
    const path = this.buildPath(this.conf.profileByIdPath, { profileId })
    const response = await this.requestJson('GET', path)
    return this.normalizeProfile(response)
  }

  async startProfileLogin(profileId: string): Promise<PlaywrightProfileSummary> {
    const path = this.buildPath(this.conf.loginStartPath, { profileId })
    const response = await this.requestJson('POST', path)
    const payload = (response && typeof response === 'object') ? response as Record<string, unknown> : {}
    return this.normalizeProfile(payload['profile'] || response)
  }

  async getProfileLoginStatus(profileId: string): Promise<GoogleFlowSessionStatus & { status?: PlaywrightProfileStatus, profile?: PlaywrightProfileSummary }> {
    const path = this.buildPath(this.conf.loginStatusPath, { profileId })
    const response = await this.requestJson('GET', path)
    const payload = (response && typeof response === 'object') ? response as Record<string, unknown> : {}
    return {
      loggedIn: Boolean(payload['loggedIn']),
      account: typeof payload['account'] === 'string' ? payload['account'] : undefined,
      status: this.normalizeProfileStatus(payload['status']),
      profile: payload['profile'] ? this.normalizeProfile(payload['profile']) : undefined,
      raw: response,
    }
  }

  async resumeProfileLogin(profileId: string): Promise<GoogleFlowSessionStatus & { status?: PlaywrightProfileStatus, profile?: PlaywrightProfileSummary }> {
    const path = this.buildPath(this.conf.loginResumePath, { profileId })
    const response = await this.requestJson('POST', path)
    const payload = (response && typeof response === 'object') ? response as Record<string, unknown> : {}
    return {
      loggedIn: Boolean(payload['loggedIn']),
      account: typeof payload['account'] === 'string' ? payload['account'] : undefined,
      status: this.normalizeProfileStatus(payload['status']),
      profile: payload['profile'] ? this.normalizeProfile(payload['profile']) : undefined,
      raw: response,
    }
  }

  async resetProfileLogin(profileId: string): Promise<GoogleFlowSessionStatus & { status?: PlaywrightProfileStatus, profile?: PlaywrightProfileSummary }> {
    const path = this.buildPath(this.conf.loginResetPath, { profileId })
    const response = await this.requestJson('POST', path)
    const payload = (response && typeof response === 'object') ? response as Record<string, unknown> : {}
    return {
      loggedIn: Boolean(payload['loggedIn']),
      account: typeof payload['account'] === 'string' ? payload['account'] : undefined,
      status: this.normalizeProfileStatus(payload['status']),
      profile: payload['profile'] ? this.normalizeProfile(payload['profile']) : undefined,
      raw: response,
    }
  }

  async getProfileDebug(profileId: string): Promise<PlaywrightProfileDebugInfo> {
    const path = this.buildPath(this.conf.profileDebugPath, { profileId })
    const response = await this.requestJson('GET', path)
    const payload = (response && typeof response === 'object') ? response as Record<string, unknown> : {}
    const profileRaw = payload['profile'] || {}
    return {
      profile: this.normalizeProfile(profileRaw),
      debug: (payload['debug'] && typeof payload['debug'] === 'object') ? payload['debug'] as PlaywrightProfileDebugInfo['debug'] : {},
      raw: response,
    }
  }
}
