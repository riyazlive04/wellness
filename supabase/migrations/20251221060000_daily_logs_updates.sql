-- Create a function to handle daily log updates atomically and securely
-- Re-run this entire script to update the function definition

create or replace function public.log_daily_metric(
  p_client_id uuid,
  p_metric_type text,
  p_value numeric,
  p_date date
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_daily_log_id uuid;
  v_current_data record;
  v_new_data record;
begin
  -- 1. Authorization Check
  -- Get the user_id associated with the client
  select user_id into v_user_id
  from public.clients
  where id = p_client_id;
  
  -- If no client found, unauthorized (or bad request)
  if v_user_id is null then
    raise exception 'Client not found';
  end if;

  -- Check if the current user is the owner of the client profile OR an admin
  -- Use explicit casting to text to avoid "operator does not exist: text = uuid" errors
  -- Use public.is_admin() for cleaner admin check
  if v_user_id::text != auth.uid()::text and not public.is_admin() then
    raise exception 'Access denied';
  end if;

  -- 2. Upsert Daily Log
  -- We use ON CONFLICT to handle both insert and update atomically
  insert into public.daily_logs (client_id, log_date)
  values (p_client_id, p_date)
  on conflict (client_id, log_date) do nothing;

  -- Get the ID of the daily log (whether it was just inserted or already existed)
  select id into v_daily_log_id
  from public.daily_logs
  where client_id = p_client_id and log_date = p_date;

  -- 3. Update the specific metric
  -- For Water and Activity, we ADD to the existing value (aggregation)
  -- For Weight, we OVERWRITE (latest value wins)
  
  if p_metric_type = 'water' then
    update public.daily_logs
    set water_intake = coalesce(water_intake, 0) + p_value
    where id = v_daily_log_id
    returning * into v_new_data;
    
  elsif p_metric_type = 'activity' then
    update public.daily_logs
    set activity_minutes = coalesce(activity_minutes, 0) + p_value
    where id = v_daily_log_id
    returning * into v_new_data;
    
  elsif p_metric_type = 'weight' then
    update public.daily_logs
    set weight = p_value
    where id = v_daily_log_id
    returning * into v_new_data;

    -- Also update the client's last_weight for quick access
    update public.clients
    set last_weight = p_value
    where id = p_client_id;
  end if;

  return row_to_json(v_new_data);
end;
$$;
