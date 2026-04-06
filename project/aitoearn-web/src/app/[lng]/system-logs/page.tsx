import React from 'react'

export default function SystemLogsPage() {
  return (
    <div style={{ width: '100%', height: 'calc(100vh - 64px)', overflow: 'hidden' }}>
      <iframe
        src="/system-logs-proxy/"
        style={{ width: '100%', height: '100%', border: 'none', borderRadius: '8px' }}
        title="System Logs"
      />
    </div>
  )
}
