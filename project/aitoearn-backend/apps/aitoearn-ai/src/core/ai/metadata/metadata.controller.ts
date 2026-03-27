import { Body, Controller, Post } from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import { GetToken, TokenInfo } from '@yikart/aitoearn-auth'
import { ApiDoc } from '@yikart/common'
import { GenerateMetadataDto } from './metadata.dto'
import { MetadataService } from './metadata.service'
import { GenerateMetadataVo } from './metadata.vo'

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
}
