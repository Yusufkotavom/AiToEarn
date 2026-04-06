export interface DriveBrowseItemVo {
  name: string
  path: string
  kind: 'directory' | 'file'
  mediaType?: 'video' | 'img'
  size?: number
  mtimeMs?: number
  hasMetadataJson?: boolean
  metadataPath?: string
}

export interface DriveBrowseVo {
  path: string
  cursor: string
  nextCursor?: string
  total: number
  list: DriveBrowseItemVo[]
}

export interface DrivePreviewItemVo {
  sourceKind?: 'file' | 'directory'
  path: string
  name: string
  resolvedPath?: string
  mediaType: 'video' | 'img'
  size: number
  title: string
  desc: string
  tags: string[]
  jsonStatus: 'found' | 'missing' | 'invalid'
  metadataPath?: string
  duplicate: boolean
  valid: boolean
  reason?: string
}

export interface DrivePreviewVo {
  groupId: string
  total: number
  validCount: number
  duplicateCount: number
  list: DrivePreviewItemVo[]
}

export interface DriveImportItemVo {
  path: string
  status: 'created' | 'skipped_duplicate' | 'failed'
  materialId?: string
  reason?: string
}

export interface DriveImportStatusVo {
  jobId: string
  status: 'queued' | 'running' | 'completed' | 'failed'
  total: number
  processed: number
  created: number
  skipped: number
  failed: number
  createdAt: string
  updatedAt: string
  items: DriveImportItemVo[]
}

