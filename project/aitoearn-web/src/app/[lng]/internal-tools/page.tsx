import type { Metadata } from 'next'
import { InternalToolsPageCore } from './InternalToolsPageCore'

export const metadata: Metadata = {
  title: 'Internal Tools Hub',
  description: 'Manage and navigate internal iframe tools quickly',
}

export default function InternalToolsPage() {
  return <InternalToolsPageCore />
}
