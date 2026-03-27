import { Body, Controller, Get, Param, Post } from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import { GetToken, TokenInfo } from '@yikart/aitoearn-auth'
import { ApiDoc } from '@yikart/common'
import { CreateMetadataBatchDto, GenerateMetadataDto, MetadataSettingsDto } from './metadata.dto'
import { MetadataService } from './metadata.service'
import { CreateMetadataBatchVo, GenerateMetadataVo, MetadataBatchStatusVo } from './metadata.vo'

@ApiTags('Me/Ai/Metadata')
@Controller('ai/metadata')
export class MetadataController {
  constructor(private readonly metadataService: MetadataService) {}

  @ApiDoc({
    summary: 'Generate social media metadata',
    body: GenerateMetadataDto.schema,
    response: GenerateMetadataVo,
  })
  @Post('/generate')
  async generate(@GetToken() token: TokenInfo, @Body() body: GenerateMetadataDto): Promise<GenerateMetadataVo> {
    return this.metadataService.generateMetadata(token.id, body)
  }

  @ApiDoc({
    summary: 'Create metadata generation batch job',
    body: CreateMetadataBatchDto.schema,
    response: CreateMetadataBatchVo,
  })
  @Post('/generate/batch')
  async createBatch(@GetToken() token: TokenInfo, @Body() body: CreateMetadataBatchDto): Promise<CreateMetadataBatchVo> {
    return this.metadataService.createBatch(token.id, body)
  }

  @ApiDoc({
    summary: 'Get metadata batch status',
    response: MetadataBatchStatusVo,
  })
  @Get('/generate/batch/:jobId')
  async getBatchStatus(@GetToken() token: TokenInfo, @Param('jobId') jobId: string): Promise<MetadataBatchStatusVo> {
    return this.metadataService.getBatchStatus(token.id, jobId)
  }

  @ApiDoc({
    summary: 'Get metadata generation settings',
    response: MetadataSettingsDto,
  })
  @Get('/settings')
  async getSettings(@GetToken() token: TokenInfo): Promise<MetadataSettingsDto> {
    return this.metadataService.getSettings(token.id)
  }

  @ApiDoc({
    summary: 'Update metadata generation settings',
    body: MetadataSettingsDto.schema,
    response: MetadataSettingsDto,
  })
  @Post('/settings')
  async updateSettings(@GetToken() token: TokenInfo, @Body() body: MetadataSettingsDto): Promise<MetadataSettingsDto> {
    return this.metadataService.updateSettings(token.id, body)
  }
}
