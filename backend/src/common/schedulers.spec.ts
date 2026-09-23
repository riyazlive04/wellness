import { schedulersEnabled, skipScheduled } from './schedulers';

/**
 * This switch decides whether a process delivers real customers' scheduled
 * messages and sends real push notifications. Getting the default backwards
 * would silently stop production from sending anything, so the "absent config
 * means ON" behaviour is pinned here explicitly.
 */
describe('schedulersEnabled', () => {
  const original = process.env.SCHEDULERS_ENABLED;
  afterEach(() => {
    if (original === undefined) delete process.env.SCHEDULERS_ENABLED;
    else process.env.SCHEDULERS_ENABLED = original;
  });

  it('defaults to ENABLED when unset — production sets nothing', () => {
    delete process.env.SCHEDULERS_ENABLED;
    expect(schedulersEnabled()).toBe(true);
  });

  it('stays enabled for an empty or whitespace value', () => {
    process.env.SCHEDULERS_ENABLED = '';
    expect(schedulersEnabled()).toBe(true);
    process.env.SCHEDULERS_ENABLED = '   ';
    expect(schedulersEnabled()).toBe(true);
  });

  it.each(['false', 'FALSE', 'False', '0', 'off', 'no', '  false  '])(
    'disables on %p',
    (value) => {
      process.env.SCHEDULERS_ENABLED = value;
      expect(schedulersEnabled()).toBe(false);
    },
  );

  it.each(['true', '1', 'on', 'yes', 'anything-else'])('stays enabled on %p', (value) => {
    process.env.SCHEDULERS_ENABLED = value;
    expect(schedulersEnabled()).toBe(true);
  });
});

describe('skipScheduled', () => {
  const original = process.env.SCHEDULERS_ENABLED;
  afterEach(() => {
    if (original === undefined) delete process.env.SCHEDULERS_ENABLED;
    else process.env.SCHEDULERS_ENABLED = original;
  });

  it('does not skip when enabled, and stays silent', () => {
    delete process.env.SCHEDULERS_ENABLED;
    const logger = { log: jest.fn() };
    expect(skipScheduled(logger, 'some.job')).toBe(false);
    expect(logger.log).not.toHaveBeenCalled();
  });

  it('skips when disabled', () => {
    process.env.SCHEDULERS_ENABLED = 'false';
    const logger = { log: jest.fn() };
    expect(skipScheduled(logger, 'unique.job.a')).toBe(true);
  });

  it('logs ONCE per job, not once per tick', () => {
    // deliverScheduledMessages fires every second; a log per call would push a
    // line a second and bury everything else in the console.
    process.env.SCHEDULERS_ENABLED = 'false';
    const logger = { log: jest.fn() };
    for (let i = 0; i < 50; i++) skipScheduled(logger, 'unique.job.b');
    expect(logger.log).toHaveBeenCalledTimes(1);
  });

  it('announces each job separately', () => {
    process.env.SCHEDULERS_ENABLED = 'false';
    const logger = { log: jest.fn() };
    skipScheduled(logger, 'unique.job.c');
    skipScheduled(logger, 'unique.job.d');
    expect(logger.log).toHaveBeenCalledTimes(2);
  });
});
