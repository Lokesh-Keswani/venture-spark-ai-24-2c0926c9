
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS timezone text NOT NULL DEFAULT 'UTC';

ALTER TABLE public.project_members DROP CONSTRAINT IF EXISTS project_members_role_check;
ALTER TABLE public.project_invites DROP CONSTRAINT IF EXISTS project_invites_role_check;

UPDATE public.project_members SET role = 'member' WHERE role IN ('editor','viewer');
UPDATE public.project_invites SET role = 'member' WHERE role IN ('editor','viewer');

ALTER TABLE public.project_members ADD CONSTRAINT project_members_role_check CHECK (role IN ('owner','admin','member'));
ALTER TABLE public.project_invites ADD CONSTRAINT project_invites_role_check CHECK (role IN ('admin','member'));

CREATE OR REPLACE FUNCTION public.can_edit_project(_project_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.project_role(_project_id, _user_id) IN ('owner','admin','member');
$$;

CREATE OR REPLACE FUNCTION public.can_manage_project(_project_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.project_role(_project_id, _user_id) IN ('owner','admin');
$$;
