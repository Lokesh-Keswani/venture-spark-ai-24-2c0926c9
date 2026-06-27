
-- =========================================================
-- 1. DROP WORKSPACE SYSTEM
-- =========================================================
DROP TABLE IF EXISTS public.workspace_activity CASCADE;
DROP TABLE IF EXISTS public.workspace_invitations CASCADE;
DROP TABLE IF EXISTS public.workspace_members CASCADE;
DROP TABLE IF EXISTS public.workspaces CASCADE;
DROP FUNCTION IF EXISTS public.is_workspace_member(uuid, uuid) CASCADE;
DROP FUNCTION IF EXISTS public.can_manage_workspace(uuid, uuid) CASCADE;
DROP FUNCTION IF EXISTS public.workspace_role(uuid, uuid) CASCADE;

-- =========================================================
-- 2. PROJECT-CENTRIC COLLABORATION TABLES
-- =========================================================

-- 2a. project_members
CREATE TABLE public.project_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.startup_projects(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  role text NOT NULL CHECK (role IN ('owner','admin','editor','viewer')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_members TO authenticated;
GRANT ALL ON public.project_members TO service_role;
ALTER TABLE public.project_members ENABLE ROW LEVEL SECURITY;

-- 2b. project_invites
CREATE TABLE public.project_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.startup_projects(id) ON DELETE CASCADE,
  email text NOT NULL,
  role text NOT NULL CHECK (role IN ('admin','editor','viewer')),
  invited_by uuid NOT NULL,
  token text NOT NULL UNIQUE DEFAULT replace(gen_random_uuid()::text, '-', ''),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','revoked')),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_invites TO authenticated;
GRANT ALL ON public.project_invites TO service_role;
ALTER TABLE public.project_invites ENABLE ROW LEVEL SECURITY;

-- 2c. project_messages (team chat)
CREATE TABLE public.project_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.startup_projects(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  kind text NOT NULL DEFAULT 'text' CHECK (kind IN ('text','voice')),
  content text,
  voice_path text,
  voice_duration numeric,
  reactions jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX project_messages_project_created_idx ON public.project_messages(project_id, created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_messages TO authenticated;
GRANT ALL ON public.project_messages TO service_role;
ALTER TABLE public.project_messages ENABLE ROW LEVEL SECURITY;

-- 2d. project_files
CREATE TABLE public.project_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.startup_projects(id) ON DELETE CASCADE,
  uploaded_by uuid NOT NULL,
  name text NOT NULL,
  path text NOT NULL,
  mime_type text,
  size_bytes bigint,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX project_files_project_idx ON public.project_files(project_id, created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_files TO authenticated;
GRANT ALL ON public.project_files TO service_role;
ALTER TABLE public.project_files ENABLE ROW LEVEL SECURITY;

-- 2e. project_comments
CREATE TABLE public.project_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.startup_projects(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  target text NOT NULL CHECK (target IN ('analysis','pitch','roadmap','investor')),
  parent_id uuid REFERENCES public.project_comments(id) ON DELETE CASCADE,
  body text NOT NULL,
  resolved boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX project_comments_project_target_idx ON public.project_comments(project_id, target, created_at);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_comments TO authenticated;
GRANT ALL ON public.project_comments TO service_role;
ALTER TABLE public.project_comments ENABLE ROW LEVEL SECURITY;

-- 2f. project_activity
CREATE TABLE public.project_activity (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.startup_projects(id) ON DELETE CASCADE,
  user_id uuid,
  action text NOT NULL,
  target text,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX project_activity_project_idx ON public.project_activity(project_id, created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_activity TO authenticated;
GRANT ALL ON public.project_activity TO service_role;
ALTER TABLE public.project_activity ENABLE ROW LEVEL SECURITY;

-- =========================================================
-- 3. SECURITY DEFINER HELPERS
-- =========================================================
CREATE OR REPLACE FUNCTION public.is_project_member(_project_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.project_members WHERE project_id = _project_id AND user_id = _user_id
  ) OR EXISTS (
    SELECT 1 FROM public.startup_projects WHERE id = _project_id AND user_id = _user_id
  );
$$;

CREATE OR REPLACE FUNCTION public.project_role(_project_id uuid, _user_id uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE
    WHEN EXISTS (SELECT 1 FROM public.startup_projects WHERE id = _project_id AND user_id = _user_id) THEN 'owner'
    ELSE (SELECT role FROM public.project_members WHERE project_id = _project_id AND user_id = _user_id LIMIT 1)
  END;
$$;

CREATE OR REPLACE FUNCTION public.can_manage_project(_project_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.project_role(_project_id, _user_id) IN ('owner','admin');
$$;

CREATE OR REPLACE FUNCTION public.can_edit_project(_project_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.project_role(_project_id, _user_id) IN ('owner','admin','editor');
$$;

GRANT EXECUTE ON FUNCTION public.is_project_member(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.project_role(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_project(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_edit_project(uuid, uuid) TO authenticated;

-- =========================================================
-- 4. RLS POLICIES — NEW TABLES
-- =========================================================

-- project_members
CREATE POLICY "Members view memberships" ON public.project_members FOR SELECT
  USING (public.is_project_member(project_id, auth.uid()));
CREATE POLICY "Admins add members" ON public.project_members FOR INSERT
  WITH CHECK (public.can_manage_project(project_id, auth.uid()));
CREATE POLICY "Admins update members" ON public.project_members FOR UPDATE
  USING (public.can_manage_project(project_id, auth.uid()))
  WITH CHECK (public.can_manage_project(project_id, auth.uid()));
CREATE POLICY "Admins or self remove member" ON public.project_members FOR DELETE
  USING (public.can_manage_project(project_id, auth.uid()) OR auth.uid() = user_id);

-- project_invites
CREATE POLICY "Members view invites" ON public.project_invites FOR SELECT
  USING (public.is_project_member(project_id, auth.uid()));
CREATE POLICY "Admins create invites" ON public.project_invites FOR INSERT
  WITH CHECK (public.can_manage_project(project_id, auth.uid()) AND invited_by = auth.uid());
CREATE POLICY "Admins update invites" ON public.project_invites FOR UPDATE
  USING (public.can_manage_project(project_id, auth.uid()))
  WITH CHECK (public.can_manage_project(project_id, auth.uid()));
CREATE POLICY "Admins delete invites" ON public.project_invites FOR DELETE
  USING (public.can_manage_project(project_id, auth.uid()));

-- project_messages
CREATE POLICY "Members view messages" ON public.project_messages FOR SELECT
  USING (public.is_project_member(project_id, auth.uid()));
CREATE POLICY "Members send messages" ON public.project_messages FOR INSERT
  WITH CHECK (public.is_project_member(project_id, auth.uid()) AND user_id = auth.uid());
CREATE POLICY "Author edit own message" ON public.project_messages FOR UPDATE
  USING (user_id = auth.uid() OR public.can_manage_project(project_id, auth.uid()))
  WITH CHECK (public.is_project_member(project_id, auth.uid()));
CREATE POLICY "Author or admin delete message" ON public.project_messages FOR DELETE
  USING (user_id = auth.uid() OR public.can_manage_project(project_id, auth.uid()));

-- project_files
CREATE POLICY "Members view files" ON public.project_files FOR SELECT
  USING (public.is_project_member(project_id, auth.uid()));
CREATE POLICY "Editors upload files" ON public.project_files FOR INSERT
  WITH CHECK (public.can_edit_project(project_id, auth.uid()) AND uploaded_by = auth.uid());
CREATE POLICY "Uploader or admin delete file" ON public.project_files FOR DELETE
  USING (uploaded_by = auth.uid() OR public.can_manage_project(project_id, auth.uid()));

-- project_comments
CREATE POLICY "Members view comments" ON public.project_comments FOR SELECT
  USING (public.is_project_member(project_id, auth.uid()));
CREATE POLICY "Members add comments" ON public.project_comments FOR INSERT
  WITH CHECK (public.is_project_member(project_id, auth.uid()) AND user_id = auth.uid());
CREATE POLICY "Author or admin update comment" ON public.project_comments FOR UPDATE
  USING (user_id = auth.uid() OR public.can_manage_project(project_id, auth.uid()))
  WITH CHECK (public.is_project_member(project_id, auth.uid()));
CREATE POLICY "Author or admin delete comment" ON public.project_comments FOR DELETE
  USING (user_id = auth.uid() OR public.can_manage_project(project_id, auth.uid()));

-- project_activity
CREATE POLICY "Members view activity" ON public.project_activity FOR SELECT
  USING (public.is_project_member(project_id, auth.uid()));
CREATE POLICY "Members log activity" ON public.project_activity FOR INSERT
  WITH CHECK (public.is_project_member(project_id, auth.uid()) AND (user_id IS NULL OR user_id = auth.uid()));

-- =========================================================
-- 5. EXTEND ASSET TABLES TO MEMBERS
-- =========================================================

-- startup_projects
DROP POLICY IF EXISTS "Users manage own projects" ON public.startup_projects;
CREATE POLICY "Members view project" ON public.startup_projects FOR SELECT
  USING (auth.uid() = user_id OR public.is_project_member(id, auth.uid()));
CREATE POLICY "Owner create project" ON public.startup_projects FOR INSERT
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Editors update project" ON public.startup_projects FOR UPDATE
  USING (auth.uid() = user_id OR public.can_edit_project(id, auth.uid()))
  WITH CHECK (auth.uid() = user_id OR public.can_edit_project(id, auth.uid()));
CREATE POLICY "Owner delete project" ON public.startup_projects FOR DELETE
  USING (auth.uid() = user_id);

-- startup_reports
DROP POLICY IF EXISTS "Users manage own reports" ON public.startup_reports;
CREATE POLICY "Members view reports" ON public.startup_reports FOR SELECT
  USING (auth.uid() = user_id OR public.is_project_member(project_id, auth.uid()));
CREATE POLICY "Editors write reports" ON public.startup_reports FOR INSERT
  WITH CHECK (auth.uid() = user_id AND (auth.uid() = user_id OR public.can_edit_project(project_id, auth.uid())));
CREATE POLICY "Editors update reports" ON public.startup_reports FOR UPDATE
  USING (auth.uid() = user_id OR public.can_edit_project(project_id, auth.uid()))
  WITH CHECK (auth.uid() = user_id OR public.can_edit_project(project_id, auth.uid()));
CREATE POLICY "Author or admin delete reports" ON public.startup_reports FOR DELETE
  USING (auth.uid() = user_id OR public.can_manage_project(project_id, auth.uid()));

-- pitch_decks
DROP POLICY IF EXISTS "Users manage own decks" ON public.pitch_decks;
CREATE POLICY "Members view decks" ON public.pitch_decks FOR SELECT
  USING (auth.uid() = user_id OR public.is_project_member(project_id, auth.uid()));
CREATE POLICY "Editors write decks" ON public.pitch_decks FOR INSERT
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Editors update decks" ON public.pitch_decks FOR UPDATE
  USING (auth.uid() = user_id OR public.can_edit_project(project_id, auth.uid()))
  WITH CHECK (auth.uid() = user_id OR public.can_edit_project(project_id, auth.uid()));
CREATE POLICY "Author or admin delete decks" ON public.pitch_decks FOR DELETE
  USING (auth.uid() = user_id OR public.can_manage_project(project_id, auth.uid()));

-- roadmaps
DROP POLICY IF EXISTS "Users manage own roadmaps" ON public.roadmaps;
CREATE POLICY "Members view roadmaps" ON public.roadmaps FOR SELECT
  USING (auth.uid() = user_id OR public.is_project_member(project_id, auth.uid()));
CREATE POLICY "Editors write roadmaps" ON public.roadmaps FOR INSERT
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Editors update roadmaps" ON public.roadmaps FOR UPDATE
  USING (auth.uid() = user_id OR public.can_edit_project(project_id, auth.uid()))
  WITH CHECK (auth.uid() = user_id OR public.can_edit_project(project_id, auth.uid()));
CREATE POLICY "Author or admin delete roadmaps" ON public.roadmaps FOR DELETE
  USING (auth.uid() = user_id OR public.can_manage_project(project_id, auth.uid()));

-- investor_readiness_reports
DROP POLICY IF EXISTS "Users manage own investor reports" ON public.investor_readiness_reports;
CREATE POLICY "Members view investor reports" ON public.investor_readiness_reports FOR SELECT
  USING (auth.uid() = user_id OR public.is_project_member(project_id, auth.uid()));
CREATE POLICY "Editors write investor reports" ON public.investor_readiness_reports FOR INSERT
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Editors update investor reports" ON public.investor_readiness_reports FOR UPDATE
  USING (auth.uid() = user_id OR public.can_edit_project(project_id, auth.uid()))
  WITH CHECK (auth.uid() = user_id OR public.can_edit_project(project_id, auth.uid()));
CREATE POLICY "Author or admin delete investor reports" ON public.investor_readiness_reports FOR DELETE
  USING (auth.uid() = user_id OR public.can_manage_project(project_id, auth.uid()));

-- Allow members to read each other's profile info (name/avatar) in shared projects
CREATE POLICY "Members view co-member profiles" ON public.profiles FOR SELECT
  USING (
    auth.uid() = id
    OR EXISTS (
      SELECT 1 FROM public.project_members pm1
      JOIN public.project_members pm2 ON pm1.project_id = pm2.project_id
      WHERE pm1.user_id = auth.uid() AND pm2.user_id = profiles.id
    )
    OR EXISTS (
      SELECT 1 FROM public.startup_projects sp
      JOIN public.project_members pm ON pm.project_id = sp.id
      WHERE (sp.user_id = auth.uid() AND pm.user_id = profiles.id)
         OR (pm.user_id = auth.uid() AND sp.user_id = profiles.id)
    )
  );

-- =========================================================
-- 6. REALTIME
-- =========================================================
ALTER TABLE public.project_messages REPLICA IDENTITY FULL;
ALTER TABLE public.project_comments REPLICA IDENTITY FULL;
ALTER TABLE public.project_activity REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.project_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.project_comments;
ALTER PUBLICATION supabase_realtime ADD TABLE public.project_activity;

-- =========================================================
-- 7. STORAGE RLS — buckets created via tool calls separately
-- =========================================================
-- Files live at: project-files/<project_id>/<file>
-- Voice notes:   project-voice/<project_id>/<file>

CREATE POLICY "Project members read files"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id IN ('project-files','project-voice')
    AND public.is_project_member((split_part(name, '/', 1))::uuid, auth.uid())
  );

CREATE POLICY "Editors upload files"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id IN ('project-files','project-voice')
    AND public.can_edit_project((split_part(name, '/', 1))::uuid, auth.uid())
    AND owner = auth.uid()
  );

CREATE POLICY "Owner or admin delete files"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id IN ('project-files','project-voice')
    AND (owner = auth.uid() OR public.can_manage_project((split_part(name, '/', 1))::uuid, auth.uid()))
  );
