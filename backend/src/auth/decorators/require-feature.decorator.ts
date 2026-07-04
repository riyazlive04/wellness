import { SetMetadata } from '@nestjs/common';
import type { Feature } from '../../common/features';

export const REQUIRE_FEATURE_KEY = 'requireFeature';

/**
 * Require the caller's workspace plan to include ALL of the given features.
 * Enforced by FeaturesGuard (resolves the plan, checks PLAN_FEATURES). Super
 * admins and org owners/admins of the parent org bypass, mirroring
 * @RequirePermission. On a miss the guard throws 402 FeatureLockedException.
 *
 * Example: @RequireFeature('appointments')
 */
export const RequireFeature = (...features: Feature[]) =>
  SetMetadata(REQUIRE_FEATURE_KEY, features);
