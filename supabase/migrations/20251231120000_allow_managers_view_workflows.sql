-- Grant Managers Access to Workflow and Related Tables
-- This allows managers to view workflows and daily logs for all clients

-- Add manager access to client_workflow_state (read-only)
CREATE POLICY "Managers can view workflow state"
ON public.client_workflow_state
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id::text = auth.uid()::text
    AND role = 'manager'
  )
);

-- Add manager access to workflow_history (read-only)
CREATE POLICY "Managers can view workflow history"
ON public.workflow_history
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id::text = auth.uid()::text
    AND role = 'manager'
  )
);

-- Add manager access to daily_logs (read-only)
CREATE POLICY "Managers can view daily logs"
ON public.daily_logs
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id::text = auth.uid()::text
    AND role = 'manager'
  )
);
