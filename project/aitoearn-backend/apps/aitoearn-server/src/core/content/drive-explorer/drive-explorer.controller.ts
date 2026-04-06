import type { Response } from 'express'
import type { DriveBrowseVo, DriveImportStatusVo, DrivePreviewVo } from './drive-explorer.vo'
import { Body, Controller, Get, Param, Post, Query, Res, StreamableFile } from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import { GetToken, TokenInfo } from '@yikart/aitoearn-auth'
import { ApiDoc } from '@yikart/common'
import {
  BrowseDriveDto,
  BrowseDriveDtoSchema,
  CreateDriveImportDto,
  CreateDriveImportDtoSchema,
  PreviewDriveImportDto,
  PreviewDriveImportDtoSchema,
} from './drive-explorer.dto'
import { DriveExplorerService } from './drive-explorer.service'

@ApiTags('Me/Drive-Explorer')
@Controller('drive-explorer')
export class DriveExplorerController {
  constructor(private readonly driveExplorerService: DriveExplorerService) {}

  @ApiDoc({
    summary: 'Browse local drive directory',
    body: BrowseDriveDtoSchema,
  })
  @Post('/browse')
  async browse(
    @GetToken() token: TokenInfo,
    @Body() body: BrowseDriveDto,
  ): Promise<DriveBrowseVo> {
    return this.driveExplorerService.browse(token.id, body)
  }

  @ApiDoc({
    summary: 'Preview drive import files',
    body: PreviewDriveImportDtoSchema,
  })
  @Post('/preview')
  async preview(
    @GetToken() token: TokenInfo,
    @Body() body: PreviewDriveImportDto,
  ): Promise<DrivePreviewVo> {
    return this.driveExplorerService.preview(token.id, body)
  }

  @ApiDoc({
    summary: 'Create drive import job',
    body: CreateDriveImportDtoSchema,
  })
  @Post('/import')
  async createImport(
    @GetToken() token: TokenInfo,
    @Body() body: CreateDriveImportDto,
  ): Promise<{ jobId: string }> {
    return this.driveExplorerService.createImportJob(token.id, body)
  }

  @ApiDoc({
    summary: 'Get drive import job status',
  })
  @Get('/import/:jobId')
  getStatus(
    @GetToken() token: TokenInfo,
    @Param('jobId') jobId: string,
  ): DriveImportStatusVo {
    return this.driveExplorerService.getImportStatus(token.id, jobId)
  }

  @ApiDoc({
    summary: 'Get image thumbnail from drive path',
  })
  @Get('/thumbnail')
  async thumbnail(
    @GetToken() token: TokenInfo,
    @Query('path') sourcePath: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const file = await this.driveExplorerService.getThumbnailStream(token.id, sourcePath)
    res.setHeader('Content-Type', file.mimeType)
    res.setHeader('Content-Length', String(file.fileSize))
    res.setHeader('Cache-Control', 'private, max-age=60')
    return new StreamableFile(file.stream)
  }
}

