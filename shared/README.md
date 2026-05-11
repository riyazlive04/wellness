# shared — cross-package code

Types, validation schemas, constants, and error codes consumed by both `frontend/` and `backend/`.

## Structure (planned)

```
shared/
├── src/
│   ├── types/         ← DTOs, entity shapes, API contracts
│   ├── validation/    ← Zod schemas used on both ends
│   ├── constants/     ← Roles, plan tiers, error codes, enums
│   └── index.ts       ← Public exports
├── package.json       ← Published locally as @sheizen/shared
└── tsconfig.json
```

## Why this exists

The #1 source of full-stack bugs is DTO drift — the frontend's idea of a `Client` diverging from the backend's. By generating types once (from Prisma + Zod) and importing them in both packages via pnpm workspaces, drift is impossible at compile time.

## When ready

```ts
// frontend
import type { ClientDto, CreateClientInput } from '@sheizen/shared';
import { CreateClientSchema } from '@sheizen/shared/validation';

// backend
import { CreateClientSchema } from '@sheizen/shared/validation';
```

Same schema. One source.
