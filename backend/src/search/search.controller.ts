import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthUser } from '../auth/types/auth-user.type';
import { SearchService } from './search.service';

@ApiTags('Search')
@ApiBearerAuth()
@Controller({ path: 'search', version: '1' })
export class SearchController {
  constructor(private readonly search: SearchService) {}

  @Get()
  @ApiOperation({ summary: 'Search clients, programs, and recipes in the caller’s workspace.' })
  async query(@CurrentUser() user: AuthUser, @Query('q') q?: string) {
    if (!user.workspaceId || !q) return { data: [] };
    return { data: await this.search.search(user.workspaceId, q) };
  }
}
