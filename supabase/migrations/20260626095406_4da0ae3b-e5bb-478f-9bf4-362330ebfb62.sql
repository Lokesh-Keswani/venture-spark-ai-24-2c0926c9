
-- ============ INVESTOR READINESS ============
CREATE TABLE public.investor_readiness_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.startup_projects(id) ON DELETE CASCADE,
  score integer NOT NULL DEFAULT 0,
  confidence text,
  breakdown jsonb NOT NULL DEFAULT '{}'::jsonb,
  concerns jsonb NOT NULL DEFAULT '[]'::jsonb,
  weaknesses jsonb NOT NULL DEFAULT '[]'::jsonb,
  improvements jsonb NOT NULL DEFAULT '{}'::jsonb,
  strengths jsonb NOT NULL DEFAULT '[]'::jsonb,
  recommendations jsonb NOT NULL DEFAULT '[]'::jsonb,
  pdf_path text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.investor_readiness_reports TO authenticated;
GRANT ALL ON public.investor_readiness_reports TO service_role;
ALTER TABLE public.investor_readiness_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own investor reports" ON public.investor_readiness_reports
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER trg_invrep_updated BEFORE UPDATE ON public.investor_readiness_reports
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ WORKSPACES ============
CREATE TABLE public.workspaces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.workspaces TO authenticated;
GRANT ALL ON public.workspaces TO service_role;
ALTER TABLE public.workspaces ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_workspaces_updated BEFORE UPDATE ON public.workspaces
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.workspace_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('owner','admin','editor','viewer')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.workspace_members TO authenticated;
GRANT ALL ON public.workspace_members TO service_role;
ALTER TABLE public.workspace_members ENABLE ROW LEVEL SECURITY;

-- Security definer helpers to avoid recursion
CREATE OR REPLACE FUNCTION public.is_workspace_member(_workspace_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.workspace_members WHERE workspace_id = _workspace_id AND user_id = _user_id);
$$;

CREATE OR REPLACE FUNCTION public.workspace_role(_workspace_id uuid, _user_id uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT role FROM public.workspace_members WHERE workspace_id = _workspace_id AND user_id = _user_id LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.can_manage_workspace(_workspace_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.workspace_members
    WHERE workspace_id = _workspace_id AND user_id = _user_id AND role IN ('owner','admin'));
$$;

-- Workspaces policies
CREATE POLICY "Members view workspaces" ON public.workspaces
  FOR SELECT TO authenticated USING (public.is_workspace_member(id, auth.uid()));
CREATE POLICY "Anyone create workspaces" ON public.workspaces
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "Admins update workspaces" ON public.workspaces
  FOR UPDATE TO authenticated USING (public.can_manage_workspace(id, auth.uid()));
CREATE POLICY "Owner delete workspaces" ON public.workspaces
  FOR DELETE TO authenticated USING (auth.uid() = owner_id);

-- Members policies
CREATE POLICY "Members view members" ON public.workspace_members
  FOR SELECT TO authenticated USING (public.is_workspace_member(workspace_id, auth.uid()));
CREATE POLICY "Admins add members" ON public.workspace_members
  FOR INSERT TO authenticated WITH CHECK (
    public.can_manage_workspace(workspace_id, auth.uid())
    OR (auth.uid() = user_id AND role = 'owner' AND NOT EXISTS (SELECT 1 FROM public.workspace_members m WHERE m.workspace_id = workspace_members.workspace_id))
  );
CREATE POLICY "Admins update members" ON public.workspace_members
  FOR UPDATE TO authenticated USING (public.can_manage_workspace(workspace_id, auth.uid()));
CREATE POLICY "Admins remove members" ON public.workspace_members
  FOR DELETE TO authenticated USING (
    public.can_manage_workspace(workspace_id, auth.uid()) OR auth.uid() = user_id
  );

-- Invitations
CREATE TABLE public.workspace_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  email text NOT NULL,
  role text NOT NULL CHECK (role IN ('admin','editor','viewer')),
  token text NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(18), 'hex'),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','revoked')),
  invited_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.workspace_invitations TO authenticated;
GRANT ALL ON public.workspace_invitations TO service_role;
ALTER TABLE public.workspace_invitations ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_invites_updated BEFORE UPDATE ON public.workspace_invitations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE POLICY "Members view invitations" ON public.workspace_invitations
  FOR SELECT TO authenticated USING (public.is_workspace_member(workspace_id, auth.uid()));
CREATE POLICY "Admins create invitations" ON public.workspace_invitations
  FOR INSERT TO authenticated WITH CHECK (public.can_manage_workspace(workspace_id, auth.uid()) AND invited_by = auth.uid());
CREATE POLICY "Admins update invitations" ON public.workspace_invitations
  FOR UPDATE TO authenticated USING (public.can_manage_workspace(workspace_id, auth.uid()));
CREATE POLICY "Admins delete invitations" ON public.workspace_invitations
  FOR DELETE TO authenticated USING (public.can_manage_workspace(workspace_id, auth.uid()));

-- Activity log
CREATE TABLE public.workspace_activity (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action text NOT NULL,
  target text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.workspace_activity TO authenticated;
GRANT ALL ON public.workspace_activity TO service_role;
ALTER TABLE public.workspace_activity ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members view activity" ON public.workspace_activity
  FOR SELECT TO authenticated USING (public.is_workspace_member(workspace_id, auth.uid()));
CREATE POLICY "Members log own activity" ON public.workspace_activity
  FOR INSERT TO authenticated WITH CHECK (public.is_workspace_member(workspace_id, auth.uid()) AND user_id = auth.uid());

CREATE INDEX idx_invrep_project ON public.investor_readiness_reports(project_id);
CREATE INDEX idx_invrep_user ON public.investor_readiness_reports(user_id);
CREATE INDEX idx_members_workspace ON public.workspace_members(workspace_id);
CREATE INDEX idx_members_user ON public.workspace_members(user_id);
CREATE INDEX idx_invites_workspace ON public.workspace_invitations(workspace_id);
CREATE INDEX idx_invites_email ON public.workspace_invitations(lower(email));
CREATE INDEX idx_activity_workspace ON public.workspace_activity(workspace_id, created_at DESC);
