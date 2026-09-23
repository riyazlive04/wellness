/**
 * Master switch for the background cron jobs.
 *
 * Why this exists: the schedulers are not read-only. `deliverScheduledMessages`
 * runs every second and CLAIMS rows — it rewrites `created_at`, strips the
 * scheduling metadata and fires push notifications to real clients.
 * `sendAppointmentReminders` stamps `reminded_at`, which makes any other
 * instance skip that reminder.
 *
 * Every developer running this backend against the shared database was
 * therefore a second production worker, racing the real one: delivering a
 * practice's scheduled messages early from a laptop, and silently consuming
 * appointment reminders the deployed server would then never send.
 *
 * DEFAULTS TO ENABLED, and deliberately so. A misconfigured or missing env var
 * must leave production behaving exactly as it does today; the only way to turn
 * the jobs off is to say so explicitly. Set `SCHEDULERS_ENABLED=false` in local
 * env files.
 */
export function schedulersEnabled(): boolean {
  const raw = (process.env.SCHEDULERS_ENABLED ?? '').trim().toLowerCase();
  return !(raw === 'false' || raw === '0' || raw === 'off' || raw === 'no');
}

const announced = new Set<string>();

/**
 * True when this job should not run. Logs ONCE per job, not once per tick —
 * `deliverScheduledMessages` fires every second, so an unconditional log would
 * push a line per second and bury everything else in the dev console.
 */
export function skipScheduled(logger: { log: (m: string) => void }, job: string): boolean {
  if (schedulersEnabled()) return false;
  if (!announced.has(job)) {
    announced.add(job);
    logger.log(`[scheduler] ${job} disabled — SCHEDULERS_ENABLED=false`);
  }
  return true;
}
