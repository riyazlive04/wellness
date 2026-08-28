import {
  BadRequestException, Body, Controller, Delete, ForbiddenException, Get,
  Param, ParseFilePipeBuilder, Post, UploadedFile, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { WorkspaceRole } from '../auth/decorators/workspace-role.decorator';
import type { AuthUser } from '../auth/types/auth-user.type';
import { KnowledgeService, type KbScope } from './knowledge.service';

/**
 * Knowledge base — documents the assistant can answer from.
 *
 *   GET    /api/v1/knowledge/documents        what this caller can see
 *   POST   /api/v1/knowledge/documents        upload and index a file
 *   DELETE /api/v1/knowledge/documents/:id    remove it and its chunks
 *   POST   /api/v1/knowledge/ask              a grounded, cited answer
 *
 * Scope is derived from the caller, never accepted from the request body. A
 * super admin writes platform documents; workspace staff write documents
 * belonging to their own workspace and can never name another one.
 */

const MAX_BYTES = 10 * 1024 * 1024;
const TEXT_MIMES = [
  'text/plain', 'text/markdown', 'text/x-markdown', 'application/json', 'text/csv',
];

@ApiTags('Knowledge Base')
@ApiBearerAuth()
@Controller({ path: 'knowledge', version: '1' })
export class KnowledgeController {
  constructor(private readonly kb: KnowledgeService) {}

  @Get('documents')
  @WorkspaceRole('owner', 'nutritionist')
  @ApiOperation({ summary: 'Documents the caller can retrieve from.' })
  async list(@CurrentUser() user: AuthUser) {
    return { data: await this.kb.listDocuments(user.workspaceId ?? null) };
  }

  @Post('documents')
  @WorkspaceRole('owner', 'nutritionist')
  @ApiOperation({
    summary: 'Upload and index a document.',
    description:
      'Plain text, Markdown, CSV or JSON. The file is chunked on its headings, embedded, and stored for retrieval. Scope comes from the caller: super admins create platform documents, workspace staff create documents for their own workspace.',
  })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_BYTES } }))
  async upload(
    @CurrentUser() user: AuthUser,
    @UploadedFile(new ParseFilePipeBuilder().addMaxSizeValidator({ maxSize: MAX_BYTES }).build({ fileIsRequired: true }))
    file: Express.Multer.File,
    @Body() body: Record<string, unknown> = {},
  ) {
    const mime = (file.mimetype || '').toLowerCase().split(';')[0];
    const looksTextual = TEXT_MIMES.includes(mime) || /\.(md|markdown|txt|csv|json)$/i.test(file.originalname || '');
    if (!looksTextual) {
      // PDF and DOCX need an extraction step that does not exist yet. Saying
      // so is better than indexing the raw bytes and producing a document that
      // retrieves gibberish.
      throw new BadRequestException(
        `Only text-based files are supported right now (.md, .txt, .csv, .json). "${file.originalname}" is ${mime || 'an unknown type'}.`,
      );
    }

    const scope: KbScope = user.isSuperAdmin ? 'platform' : 'workspace';
    if (scope === 'workspace' && !user.workspaceId) {
      throw new ForbiddenException('You are not in a workspace.');
    }

    const title = typeof body.title === 'string' && body.title.trim()
      ? body.title.trim().slice(0, 200)
      : (file.originalname || 'Untitled').replace(/\.[a-z0-9]+$/i, '');

    return {
      data: await this.kb.ingestText({
        scope,
        workspaceId: scope === 'workspace' ? user.workspaceId! : null,
        title,
        text: file.buffer.toString('utf8'),
        sourceName: file.originalname,
        mimeType: mime,
        uploadedBy: user.id,
      }),
    };
  }

  @Delete('documents/:id')
  @WorkspaceRole('owner', 'nutritionist')
  @ApiOperation({ summary: 'Delete a document and everything indexed from it.' })
  async remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    await this.kb.deleteDocument(id, user.workspaceId ?? null);
    return { data: { deleted: true } };
  }

  @Post('ask')
  @WorkspaceRole('owner', 'nutritionist')
  @ApiOperation({
    summary: 'Ask a question and get an answer grounded in the indexed documents.',
    description:
      'Answers only from retrieved passages and cites them. When nothing relevant is found it returns outcome "no_match" and says so, rather than answering from general knowledge.',
  })
  async ask(@CurrentUser() user: AuthUser, @Body() body: { question?: string }) {
    return { data: await this.kb.ask(body?.question ?? '', user.workspaceId ?? null) };
  }
}
