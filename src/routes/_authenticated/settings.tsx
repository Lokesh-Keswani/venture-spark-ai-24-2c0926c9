import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/hooks/use-auth";
import { useTheme } from "@/hooks/use-theme";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { LogOut, Trash2 } from "lucide-react";
import { useState } from "react";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({ meta: [{ title: "Settings — VentureIQ AI" }] }),
  component: SettingsPage,
});

function SettingsPage() {
  const { user, signOut } = useAuth();
  const { theme, setTheme } = useTheme();
  const navigate = useNavigate();
  const [pwBusy, setPwBusy] = useState(false);

  async function resetPassword() {
    if (!user?.email) return;
    setPwBusy(true);
    const { error } = await supabase.auth.resetPasswordForEmail(user.email, {
      redirectTo: `${window.location.origin}/auth`,
    });
    setPwBusy(false);
    if (error) toast.error(error.message);
    else toast.success("Password reset email sent");
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
      <h1 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">
        Settings
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">Workspace preferences.</p>

      <section className="mt-6 space-y-4 rounded-xl border border-border bg-card p-6 shadow-soft">
        <h2 className="font-display text-base font-semibold">Appearance</h2>
        <div className="flex items-center justify-between">
          <div>
            <Label htmlFor="dark">Dark mode</Label>
            <p className="text-xs text-muted-foreground">Easier on the eyes at night.</p>
          </div>
          <Switch
            id="dark"
            checked={theme === "dark"}
            onCheckedChange={(c) => setTheme(c ? "dark" : "light")}
          />
        </div>
      </section>

      <section className="mt-4 space-y-4 rounded-xl border border-border bg-card p-6 shadow-soft">
        <h2 className="font-display text-base font-semibold">Account</h2>
        <div>
          <p className="text-sm">Email</p>
          <p className="text-xs text-muted-foreground">{user?.email}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={resetPassword} disabled={pwBusy}>
            Send password reset
          </Button>
          <Button
            variant="ghost"
            onClick={async () => {
              await signOut();
              navigate({ to: "/", replace: true });
            }}
          >
            <LogOut className="mr-1.5 h-4 w-4" /> Sign out
          </Button>
        </div>
      </section>

      <section className="mt-4 space-y-3 rounded-xl border border-destructive/30 bg-card p-6 shadow-soft">
        <h2 className="font-display text-base font-semibold text-destructive">Danger zone</h2>
        <p className="text-sm text-muted-foreground">
          Delete all your projects and reports. This cannot be undone.
        </p>
        <Button
          variant="outline"
          className="border-destructive/40 text-destructive hover:bg-destructive/10"
          onClick={async () => {
            if (!confirm("Delete all your projects and reports?")) return;
            const { error } = await supabase
              .from("startup_projects")
              .delete()
              .eq("user_id", user!.id);
            if (error) toast.error(error.message);
            else toast.success("All projects deleted");
          }}
        >
          <Trash2 className="mr-1.5 h-4 w-4" /> Delete all projects
        </Button>
      </section>
    </div>
  );
}
