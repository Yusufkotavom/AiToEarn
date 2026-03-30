import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  createPlaywrightProfile,
  getPlaywrightProfileDebug,
  getPlaywrightProfileLoginStatus,
  listPlaywrightProfiles,
  resetPlaywrightProfileLogin,
  resumePlaywrightProfileLogin,
  startPlaywrightProfileLogin,
} from '@/api/ai'
import { toast } from '@/lib/toast'

type LogLevel = 'info' | 'warn' | 'error' | 'success'
type ProfileStatus = 'idle' | 'starting' | 'awaiting_challenge' | 'authenticated' | 'expired' | 'failed'

export interface PlaywrightProfile {
  id: string
  label: string
  provider: string
  capabilities: string[]
  status: ProfileStatus
  account?: string
  loginUrl?: string
  headless?: boolean
}

export interface PlaywrightDebugEvent {
  at: string
  level: LogLevel
  message: string
}

function nowLabel() {
  return new Date().toLocaleString()
}

function normalizeProfiles(res: any): PlaywrightProfile[] {
  const list = Array.isArray(res?.data?.profiles) ? res.data.profiles : []
  return list.map((item: any): PlaywrightProfile => ({
    id: String(item?.id || ''),
    label: String(item?.label || item?.id || ''),
    provider: String(item?.provider || 'google-flow'),
    capabilities: Array.isArray(item?.capabilities) ? item.capabilities.map((v: any) => String(v)) : [],
    status: String(item?.status || 'idle') as ProfileStatus,
    account: item?.account ? String(item.account) : undefined,
    loginUrl: item?.loginUrl ? String(item.loginUrl) : undefined,
    headless: typeof item?.headless === 'boolean' ? item.headless : undefined,
  })).filter((item: PlaywrightProfile) => item.id)
}

export function usePlaywrightManager() {
  const [profiles, setProfiles] = useState<PlaywrightProfile[]>([])
  const [selectedProfileId, setSelectedProfileId] = useState(() => localStorage.getItem('playwright_profile_id') || '')
  const [creating, setCreating] = useState(false)
  const [newProfileLabel, setNewProfileLabel] = useState('')
  const [newProfileProvider, setNewProfileProvider] = useState('google-flow')

  const [loginUrl, setLoginUrl] = useState('')
  const [loggedIn, setLoggedIn] = useState<boolean | null>(null)
  const [account, setAccount] = useState('')
  const [status, setStatus] = useState<ProfileStatus>('idle')
  const [debugMessage, setDebugMessage] = useState('')
  const [lastCheckedAt, setLastCheckedAt] = useState('')
  const [checking, setChecking] = useState(false)
  const [startLoading, setStartLoading] = useState(false)
  const [resumeLoading, setResumeLoading] = useState(false)
  const [resetLoading, setResetLoading] = useState(false)
  const [autoPolling, setAutoPolling] = useState(false)
  const [events, setEvents] = useState<PlaywrightDebugEvent[]>([])

  const pollingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const pollingDeadlineRef = useRef<number>(0)

  const selectedProfile = useMemo(() => profiles.find(p => p.id === selectedProfileId), [profiles, selectedProfileId])

  const pushEvent = useCallback((level: LogLevel, message: string) => {
    setEvents(prev => [{ at: nowLabel(), level, message }, ...prev].slice(0, 200))
  }, [])

  const loadProfiles = useCallback(async () => {
    const res: any = await listPlaywrightProfiles()
    const nextProfiles = normalizeProfiles(res)
    setProfiles(nextProfiles)

    if (!nextProfiles.length) {
      setSelectedProfileId('')
      localStorage.removeItem('playwright_profile_id')
      return nextProfiles
    }

    const current = nextProfiles.find(p => p.id === selectedProfileId)
    if (current) {
      return nextProfiles
    }

    const nextId = nextProfiles[0].id
    setSelectedProfileId(nextId)
    localStorage.setItem('playwright_profile_id', nextId)
    return nextProfiles
  }, [selectedProfileId])

  const loadDebug = useCallback(async (profileId: string) => {
    try {
      const debugRes: any = await getPlaywrightProfileDebug(profileId)
      const debugEvents = Array.isArray(debugRes?.data?.debug?.events)
        ? debugRes.data.debug.events.map((item: any) => ({
            at: String(item?.at || nowLabel()),
            level: String(item?.level || 'info') as LogLevel,
            message: String(item?.message || ''),
          }))
        : []
      setEvents(debugEvents.slice(0, 200))
    }
    catch {
      // keep local event stream when debug endpoint fails
    }
  }, [])

  const checkSession = useCallback(async (opts?: { silentSuccess?: boolean }) => {
    if (!selectedProfileId) {
      setLoggedIn(null)
      setDebugMessage('No Playwright profile selected.')
      return false
    }

    setChecking(true)
    try {
      const res: any = await getPlaywrightProfileLoginStatus(selectedProfileId)
      const isLoggedIn = Boolean(res?.data?.loggedIn)
      const profileStatus = String(res?.data?.status || 'idle') as ProfileStatus
      const nextAccount = res?.data?.account ? String(res.data.account) : ''
      const nextLoginUrl = res?.data?.profile?.loginUrl ? String(res.data.profile.loginUrl) : ''

      setLoggedIn(isLoggedIn)
      setStatus(profileStatus)
      setAccount(nextAccount)
      setLoginUrl(nextLoginUrl)
      setLastCheckedAt(nowLabel())
      setDebugMessage(isLoggedIn ? 'Profile session authenticated.' : 'Profile session is not authenticated yet.')
      pushEvent(isLoggedIn ? 'success' : 'warn', `Status checked: ${profileStatus}`)

      await loadProfiles()
      await loadDebug(selectedProfileId)

      if (isLoggedIn && !opts?.silentSuccess) {
        toast.success('Playwright profile authenticated')
      }
      return isLoggedIn
    }
    catch (error: any) {
      const message = error?.message || 'Failed to check profile login status'
      setLoggedIn(null)
      setDebugMessage(message)
      pushEvent('error', message)
      toast.error(message)
      return false
    }
    finally {
      setChecking(false)
    }
  }, [selectedProfileId, pushEvent, loadProfiles, loadDebug])

  const stopAutoPolling = useCallback(() => {
    if (pollingTimerRef.current) {
      clearInterval(pollingTimerRef.current)
      pollingTimerRef.current = null
    }
    setAutoPolling(false)
    pushEvent('info', 'Auto-check stopped.')
  }, [pushEvent])

  const startAutoPolling = useCallback(() => {
    if (!selectedProfileId) {
      return
    }
    if (pollingTimerRef.current) {
      clearInterval(pollingTimerRef.current)
    }
    pollingDeadlineRef.current = Date.now() + 5 * 60 * 1000
    setAutoPolling(true)
    pushEvent('info', 'Auto-check started (5s interval, max 5 minutes).')

    pollingTimerRef.current = setInterval(async () => {
      const ok = await checkSession({ silentSuccess: true })
      if (ok) {
        stopAutoPolling()
        pushEvent('success', 'Auto-check confirmed session authenticated.')
        toast.success('Google login confirmed')
        return
      }
      if (Date.now() >= pollingDeadlineRef.current) {
        stopAutoPolling()
        pushEvent('error', 'Auto-check timeout reached.')
        toast.error('Auto-check timeout. Continue with Resume/Check manually.')
      }
    }, 5000)
  }, [selectedProfileId, checkSession, pushEvent, stopAutoPolling])

  const handleCreateProfile = useCallback(async () => {
    const label = newProfileLabel.trim()
    if (!label) {
      toast.error('Profile label is required')
      return
    }

    setCreating(true)
    try {
      const res: any = await createPlaywrightProfile({
        label,
        provider: newProfileProvider || 'google-flow',
        capabilities: ['image', 'video'],
      })
      const createdId = String(res?.data?.profile?.id || '')
      setNewProfileLabel('')
      await loadProfiles()
      if (createdId) {
        setSelectedProfileId(createdId)
        localStorage.setItem('playwright_profile_id', createdId)
      }
      pushEvent('success', `Profile created: ${label}`)
      toast.success('Playwright profile created')
    }
    catch (error: any) {
      const message = error?.message || 'Failed to create profile'
      pushEvent('error', message)
      toast.error(message)
    }
    finally {
      setCreating(false)
    }
  }, [newProfileLabel, newProfileProvider, loadProfiles, pushEvent])

  const handleStartLogin = useCallback(async () => {
    if (!selectedProfileId) {
      toast.error('Select profile first')
      return
    }

    setStartLoading(true)
    try {
      const res: any = await startPlaywrightProfileLogin(selectedProfileId)
      const nextProfile = res?.data?.profile
      const nextUrl = nextProfile?.loginUrl ? String(nextProfile.loginUrl) : ''
      setLoginUrl(nextUrl)
      setStatus(String(nextProfile?.status || 'starting') as ProfileStatus)
      setDebugMessage('Login started. Complete challenge if requested, then click Resume.')
      pushEvent('info', 'Start login requested.')
      toast.info('If OTP/challenge appears, complete it then click Resume Login')
      await loadProfiles()
      startAutoPolling()
    }
    catch (error: any) {
      const message = error?.message || 'Failed to start login flow'
      setDebugMessage(message)
      pushEvent('error', message)
      toast.error(message)
    }
    finally {
      setStartLoading(false)
    }
  }, [selectedProfileId, loadProfiles, pushEvent, startAutoPolling])

  const handleResumeLogin = useCallback(async () => {
    if (!selectedProfileId) {
      toast.error('Select profile first')
      return
    }

    setResumeLoading(true)
    try {
      const res: any = await resumePlaywrightProfileLogin(selectedProfileId)
      const nextStatus = String(res?.data?.status || 'idle') as ProfileStatus
      setStatus(nextStatus)
      setLoggedIn(Boolean(res?.data?.loggedIn))
      setAccount(res?.data?.account ? String(res.data.account) : '')
      setDebugMessage(nextStatus === 'authenticated' ? 'Resume succeeded and session authenticated.' : 'Resume requested; challenge may still be pending.')
      pushEvent(nextStatus === 'authenticated' ? 'success' : 'warn', `Resume login result: ${nextStatus}`)
      await loadProfiles()
      await loadDebug(selectedProfileId)
      startAutoPolling()
    }
    catch (error: any) {
      const message = error?.message || 'Failed to resume login'
      setDebugMessage(message)
      pushEvent('error', message)
      toast.error(message)
    }
    finally {
      setResumeLoading(false)
    }
  }, [selectedProfileId, loadProfiles, loadDebug, pushEvent, startAutoPolling])

  const handleResetLogin = useCallback(async () => {
    if (!selectedProfileId) {
      toast.error('Select profile first')
      return
    }

    setResetLoading(true)
    try {
      const res: any = await resetPlaywrightProfileLogin(selectedProfileId)
      const nextStatus = String(res?.data?.status || 'idle') as ProfileStatus
      setStatus(nextStatus)
      setLoggedIn(false)
      setAccount('')
      setDebugMessage('Session reset. Start login again.')
      pushEvent('warn', 'Session reset requested.')
      await loadProfiles()
      await loadDebug(selectedProfileId)
      toast.success('Playwright session reset')
    }
    catch (error: any) {
      const message = error?.message || 'Failed to reset login session'
      setDebugMessage(message)
      pushEvent('error', message)
      toast.error(message)
    }
    finally {
      setResetLoading(false)
    }
  }, [selectedProfileId, loadProfiles, loadDebug, pushEvent])

  const copyDebugReport = useCallback(async () => {
    const report = {
      selectedProfileId,
      selectedProfile,
      loginUrl,
      loggedIn,
      account,
      status,
      debugMessage,
      lastCheckedAt,
      autoPolling,
      events,
    }
    try {
      await navigator.clipboard.writeText(JSON.stringify(report, null, 2))
      toast.success('Debug report copied')
      pushEvent('success', 'Copied debug report to clipboard.')
    }
    catch (error: any) {
      pushEvent('error', error?.message || 'Failed to copy debug report')
      toast.error('Failed to copy debug report')
    }
  }, [selectedProfileId, selectedProfile, loginUrl, loggedIn, account, status, debugMessage, lastCheckedAt, autoPolling, events, pushEvent])

  useEffect(() => {
    void (async () => {
      try {
        await loadProfiles()
      }
      catch (error: any) {
        toast.error(error?.message || 'Failed to load Playwright profiles')
      }
    })()
  }, [loadProfiles])

  useEffect(() => {
    if (!selectedProfileId) {
      setLoggedIn(null)
      setAccount('')
      setStatus('idle')
      setDebugMessage('No profile selected.')
      return
    }

    localStorage.setItem('playwright_profile_id', selectedProfileId)
    setEvents([])
    void checkSession({ silentSuccess: true })
  }, [selectedProfileId, checkSession])

  useEffect(() => {
    return () => {
      if (pollingTimerRef.current) {
        clearInterval(pollingTimerRef.current)
        pollingTimerRef.current = null
      }
    }
  }, [])

  return {
    profiles,
    selectedProfileId,
    setSelectedProfileId,
    selectedProfile,

    newProfileLabel,
    setNewProfileLabel,
    newProfileProvider,
    setNewProfileProvider,
    creating,
    handleCreateProfile,

    loginUrl,
    loggedIn,
    account,
    status,
    debugMessage,
    lastCheckedAt,
    checking,
    startLoading,
    resumeLoading,
    resetLoading,
    autoPolling,
    events,

    checkSession,
    stopAutoPolling,
    handleStartLogin,
    handleResumeLogin,
    handleResetLogin,
    copyDebugReport,
  }
}
