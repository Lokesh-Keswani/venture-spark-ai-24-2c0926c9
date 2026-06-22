
-- Chat conversations
CREATE TABLE public.chat_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id uuid REFERENCES public.startup_projects(id) ON DELETE SET NULL,
  title text NOT NULL DEFAULT 'New conversation',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.chat_conversations TO authenticated;
GRANT ALL ON public.chat_conversations TO service_role;
ALTER TABLE public.chat_conversations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own conversations" ON public.chat_conversations
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER trg_chat_conv_updated BEFORE UPDATE ON public.chat_conversations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX idx_chat_conv_user ON public.chat_conversations(user_id, updated_at DESC);

-- Chat messages
CREATE TABLE public.chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.chat_conversations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user','assistant','system')),
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.chat_messages TO authenticated;
GRANT ALL ON public.chat_messages TO service_role;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own messages" ON public.chat_messages
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX idx_chat_msg_conv ON public.chat_messages(conversation_id, created_at);

-- Pitch decks
CREATE TABLE public.pitch_decks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.startup_projects(id) ON DELETE CASCADE,
  title text NOT NULL,
  slides jsonb NOT NULL,
  pdf_path text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pitch_decks TO authenticated;
GRANT ALL ON public.pitch_decks TO service_role;
ALTER TABLE public.pitch_decks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own decks" ON public.pitch_decks
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER trg_pitch_decks_updated BEFORE UPDATE ON public.pitch_decks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Roadmaps
CREATE TABLE public.roadmaps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.startup_projects(id) ON DELETE CASCADE,
  plan jsonb NOT NULL,
  pdf_path text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.roadmaps TO authenticated;
GRANT ALL ON public.roadmaps TO service_role;
ALTER TABLE public.roadmaps ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own roadmaps" ON public.roadmaps
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER trg_roadmaps_updated BEFORE UPDATE ON public.roadmaps
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- User activity log
CREATE TABLE public.user_activity (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind text NOT NULL,
  label text NOT NULL,
  ref_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, DELETE ON public.user_activity TO authenticated;
GRANT ALL ON public.user_activity TO service_role;
ALTER TABLE public.user_activity ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own activity" ON public.user_activity
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX idx_user_activity_user ON public.user_activity(user_id, created_at DESC);
