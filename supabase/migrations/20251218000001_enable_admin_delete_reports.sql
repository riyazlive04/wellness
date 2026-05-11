-- Enable delete for admins on pending_review_cards

create policy "Enable delete for admins"
on "public"."pending_review_cards"
as permissive
for delete
to authenticated
using (
  (auth.uid() IN ( SELECT user_roles.user_id
   FROM user_roles
   WHERE (user_roles.role = 'admin'::app_role)))
);
