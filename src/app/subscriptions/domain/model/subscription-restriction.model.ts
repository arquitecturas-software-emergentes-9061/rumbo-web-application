/**
 * Restriction the API applied because of the clinic's plan (US-23, WI-US23-03).
 * - `INACTIVE`: 403 `SUBSCRIPTION_INACTIVE`; `standing` is `EXPIRED` (plan lapsed) or `NONE` (never subscribed).
 *   Sites can still be read, but not changed.
 * - `PLAN_LIMIT`: `PLAN_LIMIT_EXCEEDED`; the plan does not allow more of a resource (sites, floors or beacons).
 */
export type SubscriptionRestriction =
  | { kind: 'INACTIVE'; standing: 'EXPIRED' | 'NONE'; message: string }
  | { kind: 'PLAN_LIMIT'; resource: string | null; message: string };

export const SUBSCRIPTION_INACTIVE = 'SUBSCRIPTION_INACTIVE';
export const PLAN_LIMIT_EXCEEDED = 'PLAN_LIMIT_EXCEEDED';

/** Reads the restriction from an API Problem Details body; `null` when the error is about something else. */
export function restrictionFrom(status: number, body: unknown): SubscriptionRestriction | null {
  if (!body || typeof body !== 'object') return null;
  const problem = body as { code?: unknown; standing?: unknown; resource?: unknown; detail?: unknown };
  const message = typeof problem.detail === 'string' ? problem.detail : '';
  if (status === 403 && problem.code === SUBSCRIPTION_INACTIVE) {
    return { kind: 'INACTIVE', standing: problem.standing === 'NONE' ? 'NONE' : 'EXPIRED', message };
  }
  if (problem.code === PLAN_LIMIT_EXCEEDED) {
    return { kind: 'PLAN_LIMIT', resource: typeof problem.resource === 'string' ? problem.resource : null, message };
  }
  return null;
}
