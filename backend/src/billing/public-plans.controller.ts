import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { Public } from '../auth/decorators/public.decorator';
import { PLANS, TOPUPS } from './plans';

/**
 * The plan catalogue, readable without signing in — for the public pricing
 * page.
 *
 * The signed-in `/billing/me/plans` cannot serve it: the global auth guard
 * still applies there, so an anonymous visitor gets a 401. This returns the
 * same catalogue minus anything operational (no Razorpay key, no
 * configuration state) — a price list is public by nature, but the gateway
 * details are not.
 */
@ApiTags('Public · Plans')
@Controller({ path: 'public/plans', version: '1' })
export class PublicPlansController {
  @Get()
  @Public()
  @ApiOperation({ summary: 'Plans and credit packs, for the public pricing page.' })
  list() {
    return {
      data: {
        plans: PLANS.map((p) => ({
          key: p.key,
          name: p.name,
          tagline: p.tagline,
          priceInr: p.priceInr,
          priceInrAnnual: p.priceInrAnnual ?? null,
          setupFeeInr: p.setupFeeInr ?? null,
          setupIncludes: p.setupIncludes ?? [],
          features: p.features,
          promise: p.promise ?? null,
          recommended: p.recommended === true,
          // Surfaced from limits so a card can show the allowances without
          // exposing the whole limits object.
          maxClients: p.limits.maxClients,
          maxTeam: p.limits.maxTeam,
          aiCreditsPerMonth: p.limits.aiCallsPerMonth,
          storageGb: p.limits.maxStorageBytes == null ? null : Math.round(p.limits.maxStorageBytes / (1024 ** 3)),
          videoHoursPerMonth: p.limits.videoMinutesPerMonth == null ? null : p.limits.videoMinutesPerMonth / 60,
        })),
        topups: TOPUPS.map((t) => ({
          key: t.key, name: t.name, priceInr: t.priceInr, units: t.units,
          description: t.description, savePct: t.savePct ?? null, popular: t.popular === true,
        })),
      },
    };
  }
}
