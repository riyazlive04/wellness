import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AuthUser, SupabaseJwtPayload } from '../types/auth-user.type';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('SUPABASE_JWT_SECRET'),
      audience: 'authenticated',
      algorithms: ['HS256'],
    });
  }

  async validate(payload: SupabaseJwtPayload): Promise<AuthUser> {
    return {
      id: payload.sub,
      email: payload.email,
      role: payload.role ?? 'authenticated',
      orgId: payload.app_metadata?.org_id,
      appRoles: payload.app_metadata?.roles ?? [],
    };
  }
}
