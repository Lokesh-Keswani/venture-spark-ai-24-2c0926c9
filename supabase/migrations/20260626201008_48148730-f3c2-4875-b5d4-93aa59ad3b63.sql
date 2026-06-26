REVOKE EXECUTE ON FUNCTION public.is_workspace_member(uuid, uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.can_manage_workspace(uuid, uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.workspace_role(uuid, uuid) FROM anon, PUBLIC;