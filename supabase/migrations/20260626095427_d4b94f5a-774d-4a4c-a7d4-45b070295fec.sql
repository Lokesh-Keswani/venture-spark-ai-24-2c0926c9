
REVOKE EXECUTE ON FUNCTION public.is_workspace_member(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.workspace_role(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.can_manage_workspace(uuid, uuid) FROM PUBLIC, anon, authenticated;
-- Policies invoke these via SECURITY DEFINER context regardless of grant, so no grant needed.
