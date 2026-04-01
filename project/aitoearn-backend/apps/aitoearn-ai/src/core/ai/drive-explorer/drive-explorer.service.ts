import type { Model } from 'mongoose'
import type { DriveBrowseItemVo, DriveBrowseVo, DriveImportItemVo, DriveImportStatusVo, DrivePreviewItemVo, DrivePreviewVo } from './drive-explorer.vo'
import { createHash, randomUUID } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { access, readdir, readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { Injectable } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { AitoearnServerClientService } from '@yikart/aitoearn-server-client'
import { AssetsService } from '@yikart/assets'
import { AppException, ResponseCode, UserType } from '@yikart/common'
import { AssetType, MaterialStatus, MaterialType, MediaType } from '@yikart/mongodb'
import mime from 'mime-types'
import { config } from '../../../config'
import { ChatService } from '../chat/chat.service'
import { BrowseDriveDto, CreateDriveImportDto, PreviewDriveImportDto } from './drive-explorer.dto'
import { DriveImportRecord } from './drive-import-record.schema'

type MediaKind = 'video' | 'img'

interface ParsedMetadata {
  status: 'found' | 'missing' | 'invalid'
  metadataPath?: string
  title?: string
  desc?: string
  tags: string[]
}

type DriveImportMode = 'file' | 'folder'

interface ResolvedImportSource {
  sourceKind: 'file' | 'directory'
  sourcePath: string
  mediaPath: string
  mediaType: MediaKind
  mediaSize: number
  mediaMtimeMs: number
  metadata: ParsedMetadata
  thumbnailPath?: string
}

interface DriveImportJob {
  jobId: string
  userId: string
  groupId: string
  mode: DriveImportMode
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

const VIDEO_EXTENSIONS = new Set(['.mp4', '.mov', '.mkv', '.webm', '.avi', '.m4v'])
const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif'])

@Injectable()
export class DriveExplorerService {
  private readonly jobs = new Map<string, DriveImportJob>()

  constructor(
    private readonly assetsService: AssetsService,
    private readonly serverClient: AitoearnServerClientService,
    private readonly chatService: ChatService,
    @InjectModel(DriveImportRecord.name)
    private readonly driveImportRecordModel: Model<DriveImportRecord>,
  ) {}

  async browse(_userId: string, dto: BrowseDriveDto): Promise<DriveBrowseVo> {
    const targetPath = await this.validateAbsolutePath(dto.path)

    const dirents = await readdir(targetPath, { withFileTypes: true })
    const items: DriveBrowseItemVo[] = []

    for (const dirent of dirents) {
      const fullPath = path.join(targetPath, dirent.name)

      if (dirent.isDirectory()) {
        items.push({
          name: dirent.name,
          path: fullPath,
          kind: 'directory',
        })
        continue
      }

      if (!dirent.isFile()) {
        continue
      }

      const mediaType = this.detectMediaType(dirent.name)
      if (!mediaType) {
        continue
      }
      if (dto.mediaType !== 'all' && dto.mediaType !== mediaType) {
        continue
      }

      const fileStat = await stat(fullPath)
      const metadataPath = this.getMetadataPath(fullPath)
      let hasMetadataJson = false
      try {
        await access(metadataPath)
        hasMetadataJson = true
      }
      catch {
        hasMetadataJson = false
      }

      items.push({
        name: dirent.name,
        path: fullPath,
        kind: 'file',
        mediaType,
        size: fileStat.size,
        mtimeMs: fileStat.mtimeMs,
        hasMetadataJson,
        metadataPath: hasMetadataJson ? metadataPath : undefined,
      })
    }

    const sorted = items.sort((a, b) => {
      if (a.kind !== b.kind) {
        return a.kind === 'directory' ? -1 : 1
      }
      return a.name.localeCompare(b.name)
    })

    const offset = this.parseCursor(dto.cursor)
    const pageSize = dto.pageSize ?? 50
    const paged = sorted.slice(offset, offset + pageSize)
    const nextOffset = offset + pageSize

    return {
      path: targetPath,
      cursor: String(offset),
      nextCursor: nextOffset < sorted.length ? String(nextOffset) : undefined,
      total: sorted.length,
      list: paged,
    }
  }

  async preview(userId: string, dto: PreviewDriveImportDto): Promise<DrivePreviewVo> {
    await this.ensureGroupBelongsToUser(userId, dto.groupId)

    const items: DrivePreviewItemVo[] = []
    let validCount = 0
    let duplicateCount = 0

    for (const inputPath of dto.paths) {
      const item = await this.buildPreviewItem(userId, inputPath, dto.mode || 'file')
      if (item.valid) {
        validCount++
      }
      if (item.duplicate) {
        duplicateCount++
      }
      items.push(item)
    }

    return {
      groupId: dto.groupId,
      total: items.length,
      validCount,
      duplicateCount,
      list: items,
    }
  }

  async createImportJob(userId: string, dto: CreateDriveImportDto): Promise<{ jobId: string }> {
    await this.ensureGroupBelongsToUser(userId, dto.groupId)

    const jobId = randomUUID()
    const now = new Date().toISOString()
    const job: DriveImportJob = {
      jobId,
      userId,
      groupId: dto.groupId,
      mode: dto.mode || 'file',
      status: 'queued',
      total: dto.paths.length,
      processed: 0,
      created: 0,
      skipped: 0,
      failed: 0,
      createdAt: now,
      updatedAt: now,
      items: [],
    }

    this.jobs.set(jobId, job)
    void this.runImportJob(jobId, dto.paths, dto.mode || 'file')

    return { jobId }
  }

  getImportStatus(userId: string, jobId: string): DriveImportStatusVo {
    const job = this.jobs.get(jobId)
    if (!job || job.userId !== userId) {
      throw new AppException(ResponseCode.AiLogNotFound, 'Import job not found')
    }

    return {
      ...job,
      items: [...job.items],
    }
  }

  async getThumbnailStream(_userId: string, sourcePath: string): Promise<{
    stream: ReturnType<typeof createReadStream>
    mimeType: string
    fileSize: number
  }> {
    const absPath = await this.validateAbsolutePath(sourcePath)
    const fileStat = await stat(absPath)
    if (!fileStat.isFile()) {
      throw new AppException(ResponseCode.ValidationFailed, 'Path must be a file')
    }

    const mediaType = this.detectMediaType(absPath)
    if (mediaType !== 'img') {
      throw new AppException(ResponseCode.ValidationFailed, 'Thumbnail only available for image files')
    }

    return {
      stream: createReadStream(absPath),
      mimeType: this.detectMimeType(absPath),
      fileSize: fileStat.size,
    }
  }

  private async runImportJob(jobId: string, sourcePaths: string[], mode: DriveImportMode): Promise<void> {
    const job = this.jobs.get(jobId)
    if (!job) {
      return
    }

    job.status = 'running'
    job.updatedAt = new Date().toISOString()

    try {
      for (const sourcePath of sourcePaths) {
        const result = await this.importSingle(job.userId, job.groupId, sourcePath, mode)
        job.items.push(result)

        job.processed += 1
        if (result.status === 'created') {
          job.created += 1
        }
        else if (result.status === 'skipped_duplicate') {
          job.skipped += 1
        }
        else {
          job.failed += 1
        }

        job.updatedAt = new Date().toISOString()
      }

      job.status = 'completed'
      job.updatedAt = new Date().toISOString()
    }
    catch {
      job.status = 'failed'
      job.updatedAt = new Date().toISOString()
    }
  }

  private async importSingle(
    userId: string,
    groupId: string,
    sourcePath: string,
    mode: DriveImportMode,
  ): Promise<DriveImportItemVo> {
    try {
      const resolved = await this.resolveImportSource(sourcePath, mode)
      const checksum = await this.computeFileChecksum(resolved.mediaPath)
      const duplicate = await this.driveImportRecordModel.findOne({ userId, checksum }).lean().exec()
      if (duplicate) {
        return { path: sourcePath, status: 'skipped_duplicate', reason: 'Duplicate file checksum' }
      }

      const metadata = resolved.metadata
      const filename = path.basename(resolved.mediaPath)

      const upload = await this.assetsService.uploadFromStream(
        userId,
        createReadStream(resolved.mediaPath),
        {
          type: AssetType.UserMedia,
          mimeType: this.detectMimeType(filename),
          filename,
          size: resolved.mediaSize,
        },
      )

      let coverUrl: string | undefined
      if (resolved.mediaType === 'img') {
        coverUrl = upload.asset.path
      }
      else if (resolved.thumbnailPath) {
        const thumbnailStat = await stat(resolved.thumbnailPath)
        const thumbnailUpload = await this.assetsService.uploadFromStream(
          userId,
          createReadStream(resolved.thumbnailPath),
          {
            type: AssetType.VideoThumbnail,
            mimeType: this.detectMimeType(resolved.thumbnailPath),
            filename: path.basename(resolved.thumbnailPath),
            size: thumbnailStat.size,
          },
        )
        coverUrl = thumbnailUpload.asset.path
      }

      const title = metadata.title?.trim() || path.parse(filename).name
      const desc = metadata.desc?.trim()
        || await this.generateAutoCaption({
          userId,
          title,
          mediaType: resolved.mediaType,
          tags: metadata.tags,
        })
        || `Imported from drive: ${path.parse(filename).name}`

      const material = await this.serverClient.content.createMaterial({
        userId,
        userType: UserType.User,
        groupId,
        coverUrl,
        mediaList: [{
          url: upload.asset.path,
          type: resolved.mediaType === 'video' ? MediaType.VIDEO : MediaType.IMG,
          ...(coverUrl ? { thumbUrl: coverUrl } : {}),
        }],
        title,
        desc,
        topics: metadata.tags,
        option: {
          source: {
            kind: 'drive',
            path: resolved.sourcePath,
            mediaPath: resolved.mediaPath,
            checksum,
            metadataPath: metadata.metadataPath,
          },
          autoCaption: true,
        },
        type: resolved.mediaType === 'video' ? MaterialType.VIDEO : MaterialType.ARTICLE,
        status: MaterialStatus.SUCCESS,
      })

      await this.driveImportRecordModel.create({
        userId,
        sourcePath: resolved.mediaPath,
        checksum,
        fileSize: resolved.mediaSize,
        mtimeMs: resolved.mediaMtimeMs,
        materialId: material.id || (material as any)._id,
      })

      return {
        path: sourcePath,
        status: 'created',
        materialId: material.id || (material as any)._id,
      }
    }
    catch (error: any) {
      return {
        path: sourcePath,
        status: 'failed',
        reason: error?.message || 'Import failed',
      }
    }
  }

  private async ensureGroupBelongsToUser(userId: string, groupId: string): Promise<void> {
    const group = await this.serverClient.content.getGroupInfo(groupId)
    if (!group || group.userId !== userId) {
      throw new AppException(ResponseCode.MaterialGroupNotFound)
    }
  }

  private async buildPreviewItem(userId: string, sourcePath: string, mode: DriveImportMode): Promise<DrivePreviewItemVo> {
    try {
      const resolved = await this.resolveImportSource(sourcePath, mode)
      const checksum = await this.computeFileChecksum(resolved.mediaPath)
      const duplicate = await this.driveImportRecordModel.exists({ userId, checksum })
      const metadata = resolved.metadata
      const fallbackTitle = path.parse(path.basename(resolved.mediaPath)).name

      return {
        sourceKind: resolved.sourceKind,
        path: resolved.sourcePath,
        name: path.basename(resolved.sourcePath),
        resolvedPath: resolved.mediaPath,
        mediaType: resolved.mediaType,
        size: resolved.mediaSize,
        title: metadata.title?.trim() || fallbackTitle,
        desc: metadata.desc?.trim() || `Imported from drive: ${fallbackTitle}`,
        tags: metadata.tags,
        jsonStatus: metadata.status,
        metadataPath: metadata.metadataPath,
        duplicate: !!duplicate,
        valid: true,
      }
    }
    catch (error: any) {
      return this.invalidPreview(sourcePath, error?.message || 'Invalid file path')
    }
  }

  private invalidPreview(sourcePath: string, reason: string): DrivePreviewItemVo {
    return {
      sourceKind: 'file',
      path: sourcePath,
      name: path.basename(sourcePath),
      mediaType: 'video',
      size: 0,
      title: '',
      desc: '',
      tags: [],
      jsonStatus: 'missing',
      duplicate: false,
      valid: false,
      reason,
    }
  }

  private async validateAbsolutePath(inputPath: string): Promise<string> {
    if (!path.isAbsolute(inputPath)) {
      throw new AppException(ResponseCode.ValidationFailed, 'Path must be absolute')
    }

    const fileStat = await stat(inputPath)
    if (!fileStat) {
      throw new AppException(ResponseCode.ValidationFailed, 'Path not found')
    }

    return inputPath
  }

  private async resolveImportSource(sourcePath: string, mode: DriveImportMode): Promise<ResolvedImportSource> {
    const absPath = await this.validateAbsolutePath(sourcePath)
    const sourceStat = await stat(absPath)

    if (mode === 'folder') {
      if (!sourceStat.isDirectory()) {
        throw new AppException(ResponseCode.ValidationFailed, 'Path must be a directory in folder mode')
      }
      return this.resolveFromDirectory(absPath)
    }

    if (!sourceStat.isFile()) {
      throw new AppException(ResponseCode.ValidationFailed, 'Path must be a file')
    }

    const mediaType = this.detectMediaType(absPath)
    if (!mediaType) {
      throw new AppException(ResponseCode.ValidationFailed, 'Unsupported media type')
    }

    const metadata = await this.readMetadataForMedia(absPath)
    const thumbnailPath = mediaType === 'video'
      ? await this.findNeighborThumbnail(absPath)
      : undefined
    return {
      sourceKind: 'file',
      sourcePath: absPath,
      mediaPath: absPath,
      mediaType,
      mediaSize: sourceStat.size,
      mediaMtimeMs: sourceStat.mtimeMs,
      metadata,
      thumbnailPath,
    }
  }

  private async resolveFromDirectory(dirPath: string): Promise<ResolvedImportSource> {
    const dirents = await readdir(dirPath, { withFileTypes: true })
    const filePaths = dirents
      .filter(dirent => dirent.isFile())
      .map(dirent => path.join(dirPath, dirent.name))

    const videoPaths = filePaths.filter(filePath => this.detectMediaType(filePath) === 'video')
    const imagePaths = filePaths.filter(filePath => this.detectMediaType(filePath) === 'img')

    const mediaPath = videoPaths.length > 0
      ? await this.pickLargestFile(videoPaths)
      : (imagePaths.length > 0 ? await this.pickLargestFile(imagePaths) : undefined)
    if (!mediaPath) {
      throw new AppException(ResponseCode.ValidationFailed, 'No media file found in directory')
    }

    const mediaType = this.detectMediaType(mediaPath)
    if (!mediaType) {
      throw new AppException(ResponseCode.ValidationFailed, 'Unsupported media type')
    }

    const mediaStat = await stat(mediaPath)
    const thumbnailPath = mediaType === 'video' && imagePaths.length > 0
      ? await this.pickPreferredThumbnail(mediaPath, imagePaths)
      : undefined

    const metadata = await this.readMetadataForDirectory(dirPath, mediaPath)

    return {
      sourceKind: 'directory',
      sourcePath: dirPath,
      mediaPath,
      mediaType,
      mediaSize: mediaStat.size,
      mediaMtimeMs: mediaStat.mtimeMs,
      metadata,
      thumbnailPath,
    }
  }

  private async pickLargestFile(paths: string[]): Promise<string> {
    let selectedPath = paths[0]
    let selectedSize = -1
    for (const filePath of paths) {
      const fileStat = await stat(filePath)
      if (fileStat.size > selectedSize) {
        selectedPath = filePath
        selectedSize = fileStat.size
      }
    }
    return selectedPath
  }

  private async pickPreferredThumbnail(mediaPath: string, imagePaths: string[]): Promise<string | undefined> {
    const parsed = path.parse(mediaPath)
    const sameBasename = imagePaths.find((imagePath) => {
      const imageParsed = path.parse(imagePath)
      return imageParsed.name.toLowerCase() === parsed.name.toLowerCase()
    })
    if (sameBasename) {
      return sameBasename
    }
    if (imagePaths.length === 0) {
      return undefined
    }
    return this.pickLargestFile(imagePaths)
  }

  private async findNeighborThumbnail(mediaPath: string): Promise<string | undefined> {
    const dirPath = path.dirname(mediaPath)
    const dirents = await readdir(dirPath, { withFileTypes: true })
    const imagePaths = dirents
      .filter(dirent => dirent.isFile())
      .map(dirent => path.join(dirPath, dirent.name))
      .filter(filePath => this.detectMediaType(filePath) === 'img')

    if (imagePaths.length === 0) {
      return undefined
    }

    return this.pickPreferredThumbnail(mediaPath, imagePaths)
  }

  private detectMediaType(filePath: string): MediaKind | undefined {
    const ext = path.extname(filePath).toLowerCase()
    if (VIDEO_EXTENSIONS.has(ext)) {
      return 'video'
    }
    if (IMAGE_EXTENSIONS.has(ext)) {
      return 'img'
    }
    return undefined
  }

  private getMetadataPath(mediaPath: string): string {
    const parsed = path.parse(mediaPath)
    return path.join(parsed.dir, `${parsed.name}.json`)
  }

  private async readMetadataForMedia(mediaPath: string): Promise<ParsedMetadata> {
    const metadataPath = this.getMetadataPath(mediaPath)

    try {
      await access(metadataPath)
    }
    catch {
      return { status: 'missing', tags: [] }
    }

    try {
      const raw = await readFile(metadataPath, 'utf-8')
      const parsed: any = JSON.parse(raw)

      const tags = this.normalizeTags(parsed.tags)
      const title = this.pickString(parsed.title, parsed.name)
      const desc = this.pickString(parsed.desc, parsed.description, parsed.caption)

      return {
        status: 'found',
        metadataPath,
        title,
        desc,
        tags,
      }
    }
    catch {
      return {
        status: 'invalid',
        metadataPath,
        tags: [],
      }
    }
  }

  private async readMetadataForDirectory(dirPath: string, mediaPath: string): Promise<ParsedMetadata> {
    const parsedMedia = path.parse(mediaPath)
    const candidates = [
      path.join(dirPath, 'metadata.json'),
      path.join(dirPath, `${parsedMedia.name}.json`),
    ]

    for (const metadataPath of candidates) {
      const parsed = await this.tryReadMetadataFile(metadataPath)
      if (parsed) {
        return parsed
      }
    }

    const dirents = await readdir(dirPath, { withFileTypes: true })
    const jsonFiles = dirents
      .filter(dirent => dirent.isFile() && path.extname(dirent.name).toLowerCase() === '.json')
      .map(dirent => path.join(dirPath, dirent.name))
      .filter(filePath => !candidates.includes(filePath))

    for (const metadataPath of jsonFiles) {
      const parsed = await this.tryReadMetadataFile(metadataPath)
      if (parsed) {
        return parsed
      }
    }

    return { status: 'missing', tags: [] }
  }

  private async tryReadMetadataFile(metadataPath: string): Promise<ParsedMetadata | null> {
    try {
      await access(metadataPath)
    }
    catch {
      return null
    }

    try {
      const raw = await readFile(metadataPath, 'utf-8')
      const parsed: any = JSON.parse(raw)
      return {
        status: 'found',
        metadataPath,
        title: this.pickString(parsed.title, parsed.name),
        desc: this.pickString(parsed.desc, parsed.description, parsed.caption),
        tags: this.normalizeTags(parsed.tags),
      }
    }
    catch {
      return {
        status: 'invalid',
        metadataPath,
        tags: [],
      }
    }
  }

  private pickString(...values: unknown[]): string | undefined {
    for (const value of values) {
      if (typeof value === 'string' && value.trim()) {
        return value.trim()
      }
    }
    return undefined
  }

  private normalizeTags(input: unknown): string[] {
    if (Array.isArray(input)) {
      return input
        .map(item => typeof item === 'string' ? item.trim() : '')
        .filter(Boolean)
        .map(tag => tag.startsWith('#') ? tag : `#${tag}`)
    }

    if (typeof input === 'string' && input.trim()) {
      return input
        .split(',')
        .map(item => item.trim())
        .filter(Boolean)
        .map(tag => tag.startsWith('#') ? tag : `#${tag}`)
    }

    return []
  }

  private detectMimeType(filename: string): string {
    const detected = mime.lookup(filename)
    if (typeof detected === 'string' && detected) {
      return detected
    }
    return 'application/octet-stream'
  }

  private parseCursor(cursor?: string): number {
    if (!cursor) {
      return 0
    }
    const offset = Number.parseInt(cursor, 10)
    if (!Number.isFinite(offset) || offset < 0) {
      return 0
    }
    return offset
  }

  private async computeFileChecksum(filePath: string): Promise<string> {
    const hash = createHash('sha256')
    await new Promise<void>((resolve, reject) => {
      const stream = createReadStream(filePath)
      stream.on('data', chunk => hash.update(chunk))
      stream.on('end', () => resolve())
      stream.on('error', reject)
    })
    return hash.digest('hex')
  }

  private async generateAutoCaption(params: {
    userId: string
    title: string
    mediaType: MediaKind
    tags: string[]
  }): Promise<string | undefined> {
    try {
      const model = config.ai.models.chat[0]?.name
      if (!model) {
        return undefined
      }

      const tagsText = params.tags.length > 0 ? params.tags.join(' ') : 'none'
      const prompt = [
        'Create one concise social media caption in English.',
        'Requirements: 1 sentence, maximum 140 characters, no markdown, no emoji flood.',
        `Media type: ${params.mediaType}`,
        `Title/context: ${params.title}`,
        `Tags/hints: ${tagsText}`,
      ].join('\n')

      const response = await this.chatService.chatCompletion({
        model,
        messages: [
          { role: 'system', content: 'You are a social media copywriter.' },
          { role: 'user', content: prompt },
        ],
        maxTokens: 120,
        temperature: 0.7,
      }, params.userId)

      return this.extractChatText(response?.content)
    }
    catch {
      return undefined
    }
  }

  private extractChatText(content: unknown): string | undefined {
    if (typeof content === 'string' && content.trim()) {
      return content.trim()
    }

    if (Array.isArray(content)) {
      for (const item of content) {
        if (typeof item === 'string' && item.trim()) {
          return item.trim()
        }
        if (item && typeof item === 'object') {
          const maybeText = (item as { text?: unknown }).text
          if (typeof maybeText === 'string' && maybeText.trim()) {
            return maybeText.trim()
          }
        }
      }
    }

    return undefined
  }
}
