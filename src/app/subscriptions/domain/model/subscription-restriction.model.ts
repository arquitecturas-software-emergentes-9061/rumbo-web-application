/**
 * Restriction the API applied because of the clinic's plan (US-23, WI-US23-03, PR-99).
 * - `INACTIVE`: `SUBSCRIPTION_REQUIRED`.
 *   - 403 when an existing site is changed; `standing` is `EXPIRED` (plan lapsed) or `NONE` (never subscribed).
 *     Sites can still be read, but not changed.
 *   - 409 when a site, floor or beacon is created without an active plan; the API does not say why, so `standing`
 *     is `UNKNOWN`.
 * - `PLAN_LIMIT`: 409 `PLAN_QUOTA_EXCEEDED`; the plan allows at most `limit` of the resource being created.
 */
export type SubscriptionStanding = 'EXPIRED' | 'NONE' | 'UNKNOWN';
export type PlanResource = 'SITE' | 'FLOOR' | 'BEACON';

export type SubscriptionRestriction =
  | { kind: 'INACTIVE'; standing: SubscriptionStanding; message: string }
  | { kind: 'PLAN_LIMIT'; resource: PlanResource | null; limit: number | null; message: string };

export const SUBSCRIPTION_REQUIRED = 'SUBSCRIPTION_REQUIRED';
export const PLAN_QUOTA_EXCEEDED = 'PLAN_QUOTA_EXCEEDED';

/** The quota error does not name the resource, so it is read from the creation URL that was rejected. */
export function resourceFromUrl(url: string): PlanResource | null {
  const path = url.split('?')[0].replace(/\/+$/, '');
  if (/\/sites\/[^/]+\/beacons$/.test(path)) return 'BEACON';
  if (/\/sites\/[^/]+\/floors$/.test(path)) return 'FLOOR';
  if (/\/sites$/.test(path)) return 'SITE';
  return null;
}

/** Reads the restriction from an API Problem Details body; `null` when the error is about something else. */
export function restrictionFrom(status: number, body: unknown, url = ''): SubscriptionRestriction | null {
  if (!body || typeof body !== 'object') return null;
  const problem = body as { code?: unknown; standing?: unknown; limit?: unknown; detail?: unknown };
  const message = typeof problem.detail === 'string' ? problem.detail : '';
  if ((status === 403 || status === 409) && problem.code === SUBSCRIPTION_REQUIRED) {
    const standing = problem.standing === 'NONE' || problem.standing === 'EXPIRED' ? problem.standing : 'UNKNOWN';
    return { kind: 'INACTIVE', standing, message };
  }
  if (status === 409 && problem.code === PLAN_QUOTA_EXCEEDED) {
    const limit = typeof problem.limit === 'number' ? problem.limit : null;
    return { kind: 'PLAN_LIMIT', resource: resourceFromUrl(url), limit, message };
  }
  return null;
}
