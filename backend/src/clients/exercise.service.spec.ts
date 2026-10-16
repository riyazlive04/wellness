import { ExerciseService } from './exercise.service';
import { MyExerciseController, WorkspaceExerciseController } from './exercise.controller';
import type { ClientsService } from './clients.service';
import type { PrismaService } from '../database/prisma.service';

const CLIENT = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const WS = '33333333-3333-4333-8333-333333333333';

function make() {
  const calls: Array<{ sql: string; args: unknown[] }> = [];
  const prisma = {
    $queryRawUnsafe: jest.fn(async (sql: string, ...args: unknown[]) => {
      calls.push({ sql, args });
      if (sql.includes('AT TIME ZONE')) return [{ d: '2026-10-16' }];
      if (sql.includes('INSERT INTO public.exercise_logs')) {
        return [{ id: 'log-1', client_id: CLIENT, name: args[2], kind: args[3],
                  performed_on: args[4], performed_at: args[5], duration_min: args[6],
                  notes: args[7], submitted_at: new Date() }];
      }
      return [];
    }),
    $executeRawUnsafe: jest.fn(async (sql: string, ...args: unknown[]) => {
      calls.push({ sql, args });
      return 1;
    }),
  } as unknown as PrismaService;

  const clients = {
    workspaceOfClient: jest.fn(async () => WS),
    assertStorageAvailableFor: jest.fn(async () => undefined),
    createUploadTicket: jest.fn(async (bucket: string, key: string) => ({ uploadUrl: 'u', storageKey: key, token: 't' })),
    signStorageObject: jest.fn(async () => ({ url: 'signed', expiresInSeconds: 3600 })),
    deleteFromStorage: jest.fn(async () => undefined),
  } as unknown as ClientsService;

  return { svc: new ExerciseService(prisma, clients), calls, clients, prisma };
}

describe('ExerciseService', () => {
  it('refuses a photo key belonging to another client', async () => {
    const { svc } = make();
    await expect(
      svc.create(CLIENT, { name: 'Walk', photos: [{ storage_key: `${OTHER}/sneaky.jpg` }] }),
    ).rejects.toThrow(/does not belong to you/i);
  });

  it('accepts a photo key inside the client’s own folder', async () => {
    const { svc, calls } = make();
    await svc.create(CLIENT, { name: 'Walk', photos: [{ storage_key: `${CLIENT}/ok.jpg` }] });
    expect(calls.some((c) => c.sql.includes('INSERT INTO public.exercise_log_photos'))).toBe(true);
  });

  it('requires a name', async () => {
    const { svc } = make();
    await expect(svc.create(CLIENT, { name: '   ' })).rejects.toThrow(/what exercise/i);
  });

  it('dates the entry in the practice timezone when none is given', async () => {
    const { svc, calls } = make();
    await svc.create(CLIENT, { name: 'Yoga' });
    const ins = calls.find((c) => c.sql.includes('INSERT INTO public.exercise_logs'))!;
    expect(ins.args[4]).toBe('2026-10-16');
  });

  it('keeps the date the client gave, so a back-filled log counts for its own day', async () => {
    const { svc, calls } = make();
    await svc.create(CLIENT, { name: 'Run', performed_on: '2026-10-14', performed_at: '06:30' });
    const ins = calls.find((c) => c.sql.includes('INSERT INTO public.exercise_logs'))!;
    expect(ins.args[4]).toBe('2026-10-14');
    expect(ins.args[5]).toBe('06:30');
  });

  it('caps the photos stored on one entry', async () => {
    const { svc, calls } = make();
    await svc.create(CLIENT, {
      name: 'Gym',
      photos: Array.from({ length: 10 }, (_, i) => ({ storage_key: `${CLIENT}/p${i}.jpg` })),
    });
    const ins = calls.find((c) => c.sql.includes('INSERT INTO public.exercise_log_photos'))!;
    // log_id + client_id, then a (key, bytes) pair per photo.
    expect((ins.args.length - 2) / 2).toBe(6);
  });

  it('trims and bounds the free-text fields', async () => {
    const { svc, calls } = make();
    await svc.create(CLIENT, { name: '  ' + 'n'.repeat(200), kind: '  running  ', notes: '  x  ' });
    const ins = calls.find((c) => c.sql.includes('INSERT INTO public.exercise_logs'))!;
    expect((ins.args[2] as string).length).toBe(120);
    expect(ins.args[3]).toBe('running');
    expect(ins.args[7]).toBe('x');
  });

  it('scopes a photo signature to the asker, so neither id alone is enough', async () => {
    const { svc, prisma } = make();
    (prisma.$queryRawUnsafe as jest.Mock).mockResolvedValueOnce([{ storage_key: 'k' }]);
    await svc.signPhoto('photo-1', { workspaceId: WS });
    const call = (prisma.$queryRawUnsafe as jest.Mock).mock.calls.at(-1)!;
    expect(call[0]).toContain('exercise_log_photos');
    expect(call[2]).toBeNull();   // no clientId given
    expect(call[3]).toBe(WS);
  });

  it('reports a missing photo rather than signing a guessed id', async () => {
    const { svc } = make();
    await expect(svc.signPhoto('nope', { workspaceId: WS })).rejects.toThrow(/not found/i);
  });
});

describe('exercise controllers', () => {
  // Decorators run at module load; a class referenced before its declaration
  // crashes the app on boot rather than at call time.
  it('load without a temporal dead zone error', () => {
    expect(typeof MyExerciseController).toBe('function');
    expect(typeof WorkspaceExerciseController).toBe('function');
  });
});
