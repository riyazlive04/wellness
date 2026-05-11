# docs

Architecture, decisions, and runbooks.

## Structure

```
docs/
├── architecture/   ← High-level diagrams + per-module designs
├── adr/            ← Architecture Decision Records (one .md per decision)
├── runbooks/       ← On-call procedures (key rotation, incident response, recovery)
└── api/            ← Generated OpenAPI specs from the NestJS backend
```

## ADR conventions

Each ADR follows the lightweight format:

```
# ADR-NNN: <title>

## Status
Proposed | Accepted | Deprecated | Superseded by ADR-XXX

## Context
What forced this decision.

## Decision
What we chose.

## Consequences
What this enables, what it costs, what becomes harder.
```

ADRs are append-only. Wrong decisions get a successor ADR, not a rewrite.
