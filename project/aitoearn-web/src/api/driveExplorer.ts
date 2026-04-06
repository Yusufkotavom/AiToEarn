import http from '@/utils/request'

export type DriveMediaType = 'video' | 'img' | 'all'
export type DriveImportMode = 'file' | 'folder'

export interface DriveBrowseItem {
  name: string
  path: string
  kind: 'directory' | 'file'
  mediaType?: 'video' | 'img'
  size?: number
  mtimeMs?: number
  hasMetadataJson?: boolean
  metadataPath?: string
}

export interface DriveBrowseResult {
  path: string
  cursor: string
  nextCursor?: string
  total: number
  list: DriveBrowseItem[]
}

export interface DrivePreviewItem {
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

export interface DrivePreviewResult {
  groupId: string
  total: number
  validCount: number
  duplicateCount: number
  list: DrivePreviewItem[]
}

export interface DriveImportItem {
  path: string
  status: 'created' | 'skipped_duplicate' | 'failed'
  materialId?: string
  reason?: string
}

export interface DriveImportStatus {
  jobId: string
  status: 'queued' | 'running' | 'completed' | 'failed'
  total: number
  processed: number
  created: number
  skipped: number
  failed: number
  createdAt: string
  updatedAt: string
  items: DriveImportItem[]
}

export function apiBrowseDrive(data: {
  path: string
  cursor?: string
  pageSize?: number
  mediaType?: DriveMediaType
}) {
  return http.post<DriveBrowseResult>('drive-explorer/browse', data)
}

export function apiPreviewDriveImport(data: {
  groupId: string
  paths: string[]
  mode?: DriveImportMode
}) {
  return http.post<DrivePreviewResult>('drive-explorer/preview', data)
}

export function apiCreateDriveImport(data: {
  groupId: string
  paths: string[]
  mode?: DriveImportMode
}) {
  return http.post<{ jobId: string }>('drive-explorer/import', data)
}

export function apiGetDriveImportStatus(jobId: string) {
  return http.get<DriveImportStatus>(`drive-explorer/import/${jobId}`)
}
