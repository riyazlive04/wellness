/**
 * When trial reminders go out.
 *
 * Must match TRIAL_WARN_DAYS in backend/src/billing/trial.service.ts and the
 * cron in billing-scheduler.service.ts — the admin screens state the schedule
 * to the person deciding whether to send manually, so a stale copy here is
 * worse than no copy at all.
 *
 * 7 is the early notice; then every day of the final three, so nobody reaches
 * their last day having heard nothing since day 3. 0 is the day it lapses.
 */
export const TRIAL_WARN_BUCKETS = [7, 3, 2, 1, 0] as const;

/** The hour the daily job runs, for wording like "due today, 10am". */
export const TRIAL_WARN_TIME = '10am IST';
