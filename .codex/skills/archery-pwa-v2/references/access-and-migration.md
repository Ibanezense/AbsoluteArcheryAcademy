# Access And Migration

## Access flow

- admin creates every account
- users do not self-register
- login is based on `profiles.access_code`
- keep standard Supabase sessions after login so existing app guards and RLS continue to work

## Routing rules

- `admin` -> `/admin`
- `guardian` -> `/hub`
- `student` -> `/`

## Guardian UX rules

- guardian must select or operate in a student context
- do not assume guardian data can be rendered through old student-only hooks
- avoid sending guardians directly to student pages that still depend on legacy `profiles` fields

## SQL/auth guardrails

- normalize `access_code` to uppercase
- preserve compatibility with existing accounts during transition
- avoid destructive auth rewrites unless explicitly requested
- if a task changes login, verify both API and client session handling

## Repo hot spots

- `supabase/migrations/20260227_create_v2_core_entities.sql`
- `supabase/migrations/20260227_transition_to_v2_students.sql`
- `supabase/migrations/20260228_prepare_access_code_login.sql`
- `app/api/auth/access-code/login/route.ts`
- `app/login/page.tsx`
- `app/hub/page.tsx`
