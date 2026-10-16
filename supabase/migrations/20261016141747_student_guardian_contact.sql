-- Billing/contact identity is independent of the authenticated guardian account.
alter table public.students add column if not exists guardian_contact jsonb;
alter table public.students add constraint students_guardian_contact_object_chk
  check (guardian_contact is null or jsonb_typeof(guardian_contact) = 'object');
alter table public.students add constraint students_guardian_contact_dni_chk
  check (guardian_contact is null or guardian_contact->>'dni' is null or guardian_contact->>'dni' ~ '^[0-9]{8}$');
comment on column public.students.guardian_contact is 'Student-specific responsible contact for receipts; independent of profiles and login credentials. NULL falls back to the linked guardian profile.';
notify pgrst, 'reload schema';
