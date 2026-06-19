import { Module } from '@nestjs/common';
import { SessionsController } from './sessions.controller';
import { SessionsService } from './sessions.service';

/**
 * SessionsModule — real device/login session management backed by Supabase's
 * auth.sessions table (list + revoke).
 */
@Module({
  controllers: [SessionsController],
  providers: [SessionsService],
})
export class SessionsModule {}
