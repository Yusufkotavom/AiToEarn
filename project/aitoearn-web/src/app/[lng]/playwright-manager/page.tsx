'use client'

import { CheckCircle2, Loader2, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { usePlaywrightManager } from './usePlaywrightManager'

export default function PlaywrightManagerPage() {
  const {
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
    openLoginLoading,
    autoPolling,
    events,
    checkSession,
    stopAutoPolling,
    handleStartLogin,
    handleOpenLoginBrowser,
    handleResumeLogin,
    handleResetLogin,
    handleCredentialsLogin,
    copyDebugReport,
    credentialsModalOpen,
    setCredentialsModalOpen,
    credentialsEmail,
    setCredentialsEmail,
    credentialsPassword,
    setCredentialsPassword,
    credentialsRemember,
    setCredentialsRemember,
    credentialsSubmitting,
  } = usePlaywrightManager()

  return (
    <div className="max-w-5xl mx-auto p-6">
      <Dialog open={credentialsModalOpen} onOpenChange={setCredentialsModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Login Playwright Profile</DialogTitle>
            <DialogDescription>
              Session belum login. Masukkan email dan password Google untuk profile ini.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <div className="text-xs text-muted-foreground mb-1">Email</div>
              <Input
                type="email"
                value={credentialsEmail}
                onChange={e => setCredentialsEmail(e.target.value)}
                placeholder="you@example.com"
                disabled={credentialsSubmitting}
              />
            </div>
            <div>
              <div className="text-xs text-muted-foreground mb-1">Password</div>
              <Input
                type="password"
                value={credentialsPassword}
                onChange={e => setCredentialsPassword(e.target.value)}
                placeholder="Password"
                disabled={credentialsSubmitting}
              />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={credentialsRemember}
                onChange={e => setCredentialsRemember(e.target.checked)}
                disabled={credentialsSubmitting}
              />
              Remember credentials (encrypted in DB)
            </label>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setCredentialsModalOpen(false)} disabled={credentialsSubmitting}>
                Later
              </Button>
              <Button
                onClick={() => {
                  void handleCredentialsLogin()
                }}
                disabled={credentialsSubmitting || !credentialsEmail.trim() || !credentialsPassword}
              >
                {credentialsSubmitting
                  ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                      Logging in
                    </>
                  )
                  : 'Login'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <div className="mb-6">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <CheckCircle2 className="h-6 w-6" />
          Playwright Management
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Multi-profile login orchestration for headless Playwright worker.
        </p>
      </div>

      <div className="border rounded-md p-4 mb-4">
        <div className="font-semibold mb-2">Step-by-step Login Flow</div>
        <div className="text-sm text-muted-foreground space-y-1">
          <div>1. Create profile (once) and select profile.</div>
          <div>2. Click Open Login Browser (recommended) to login manually in remote browser.</div>
          <div>3. If OTP / verification challenge appears, complete it in worker browser environment.</div>
          <div>4. Click Resume Login, then Check Status until authenticated.</div>
          <div>5. Use this profileId in image/video generation requests.</div>
        </div>
      </div>

      <div className="border rounded-md p-4 mb-4 space-y-3">
        <div className="font-semibold">Profile Management</div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2 items-end">
          <div className="md:col-span-1">
            <div className="text-xs text-muted-foreground mb-1">Create Profile Label</div>
            <Input
              value={newProfileLabel}
              onChange={e => setNewProfileLabel(e.target.value)}
              placeholder="e.g. google-flow-main"
              disabled={creating}
            />
          </div>
          <div>
            <div className="text-xs text-muted-foreground mb-1">Provider</div>
            <Select value={newProfileProvider} onValueChange={setNewProfileProvider}>
              <SelectTrigger>
                <SelectValue placeholder="Select provider" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="google-flow">google-flow</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Button
              variant="outline"
              disabled={creating || !newProfileLabel.trim()}
              onClick={() => {
                void handleCreateProfile()
              }}
            >
              {creating
                ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                    Creating
                  </>
                )
                : 'Create Profile'}
            </Button>
          </div>
        </div>

        <div>
          <div className="text-xs text-muted-foreground mb-1">Selected Profile</div>
          <Select
            value={selectedProfileId || undefined}
            onValueChange={(value) => {
              setSelectedProfileId(value)
            }}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select profile" />
            </SelectTrigger>
            <SelectContent>
              {profiles.map(profile => (
                <SelectItem key={profile.id} value={profile.id}>
                  {profile.label}
                  {' '}
                  (
                  {profile.id}
                  )
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        <Button
          variant="outline"
          onClick={() => setCredentialsModalOpen(true)}
          disabled={!selectedProfileId || credentialsSubmitting}
        >
          {credentialsSubmitting
            ? (
              <>
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                Logging in
              </>
            )
            : 'Login with Email'}
        </Button>

        <Button
          variant="outline"
          onClick={() => {
            void handleOpenLoginBrowser()
          }}
          disabled={!selectedProfileId || checking || startLoading || resumeLoading || resetLoading || openLoginLoading}
        >
          {openLoginLoading
            ? (
              <>
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                Opening
              </>
            )
            : 'Open Login Browser'}
        </Button>

        <Button
          variant="outline"
          onClick={() => {
            void handleStartLogin()
          }}
          disabled={!selectedProfileId || checking || startLoading || resumeLoading || resetLoading || openLoginLoading}
        >
          {startLoading
            ? (
              <>
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                Starting
              </>
            )
            : 'Start Login'}
        </Button>

        <Button
          variant="outline"
          onClick={() => {
            void handleResumeLogin()
          }}
          disabled={!selectedProfileId || checking || startLoading || resumeLoading || resetLoading || openLoginLoading}
        >
          {resumeLoading
            ? (
              <>
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                Resuming
              </>
            )
            : 'Resume Login'}
        </Button>

        <Button
          variant="outline"
          onClick={() => {
            void checkSession()
          }}
          disabled={!selectedProfileId || checking || startLoading || resumeLoading || resetLoading || openLoginLoading}
        >
          {checking
            ? (
              <>
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                Checking
              </>
            )
            : (
              <>
                <RefreshCw className="h-4 w-4 mr-1" />
                Check Status
              </>
            )}
        </Button>

        <Button
          variant="outline"
          onClick={() => {
            void handleResetLogin()
          }}
          disabled={!selectedProfileId || checking || startLoading || resumeLoading || resetLoading || openLoginLoading}
        >
          {resetLoading
            ? (
              <>
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                Resetting
              </>
            )
            : 'Reset Session'}
        </Button>

        {autoPolling && (
          <Button variant="ghost" onClick={stopAutoPolling}>
            Stop Auto-check
          </Button>
        )}

        <Button variant="ghost" onClick={() => {
          void copyDebugReport()
        }}
        >
          Copy Debug Report
        </Button>
      </div>

      <div className="border rounded-md p-4 space-y-2 text-sm">
        <div>
          Profile ID:
          {' '}
          {selectedProfile?.id || '-'}
        </div>
        <div>
          Profile Label:
          {' '}
          {selectedProfile?.label || '-'}
        </div>
        <div>
          Status:
          {' '}
          {status || '-'}
          {' '}
          (
          {loggedIn == null ? 'Unknown' : loggedIn ? 'Logged In' : 'Not Logged In'}
          )
        </div>
        <div>
          Account:
          {' '}
          {account || '-'}
        </div>
        <div>
          Login URL:
          {' '}
          {(loginUrl || selectedProfile?.loginUrl)
            ? (
              <a
                className="break-all text-blue-600 underline"
                href={loginUrl || selectedProfile?.loginUrl}
                target="_blank"
                rel="noreferrer"
              >
                {loginUrl || selectedProfile?.loginUrl}
              </a>
            )
            : (
              <span>-</span>
            )}
        </div>
        <div>
          Auto-check:
          {' '}
          {autoPolling ? 'Running (5s interval)' : 'Stopped'}
        </div>
        <div>
          Last checked:
          {' '}
          {lastCheckedAt || '-'}
        </div>
        <div>
          Debug:
          {' '}
          {debugMessage || '-'}
        </div>
      </div>

      <div className="border rounded-md p-4 mt-4">
        <div className="font-semibold mb-2">Debug Timeline</div>
        <div className="space-y-1 max-h-[360px] overflow-y-auto text-xs">
          {events.length === 0 && <div className="text-muted-foreground">No events yet.</div>}
          {events.map((item, index) => (
            <div key={`${item.at}-${index}`} className="border rounded px-2 py-1">
              <span className="font-mono text-[11px] mr-2">{item.at}</span>
              <span className="uppercase mr-2">{item.level}</span>
              <span>{item.message}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
