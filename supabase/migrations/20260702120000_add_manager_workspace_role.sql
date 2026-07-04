-- 2026-07-02: Add the `manager` staff role to the WORKSPACE role enum.
--
-- Note: an earlier migration (20251231000000_add_manager_role.sql) added
-- 'manager' to public.app_role — that is the GLOBAL user-role enum. This is a
-- different enum: public.workspace_member_role governs per-workspace staff
-- roles (owner / nutritionist / …). The new Manager role supervises the
-- nutritionist team and is seat-capped per plan (Pro 1, Elite 4) in code.
--
-- The migration runner wraps this file in BEGIN/COMMIT. ALTER TYPE ADD VALUE is
-- transaction-safe in PG12+ as long as the new label isn't *used* in the same
-- transaction — we only add it here; membership rows adopt it at runtime.

ALTER TYPE public.workspace_member_role ADD VALUE IF NOT EXISTS 'manager';
