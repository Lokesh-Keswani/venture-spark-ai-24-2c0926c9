import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

export function browserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

export function useUserTimezone(): string {
  const { user } = useAuth();
  const { data } = useQuery({
    queryKey: ["my-timezone", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("timezone")
        .eq("id", user!.id)
        .maybeSingle();
      return (data?.timezone as string | undefined) || browserTimezone();
    },
  });
  return data || browserTimezone();
}

export function formatTime(iso: string | Date, tz: string): string {
  try {
    return new Intl.DateTimeFormat(undefined, {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
      timeZone: tz,
    }).format(new Date(iso));
  } catch {
    return new Date(iso).toLocaleTimeString();
  }
}

export function formatDateTime(iso: string | Date, tz: string): string {
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
      hour12: true,
      timeZone: tz,
    }).format(new Date(iso));
  } catch {
    return new Date(iso).toLocaleString();
  }
}

export function formatDuration(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) seconds = 0;
  const s = Math.round(seconds);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}

export function listTimezones(): string[] {
  try {
    // @ts-expect-error - supportedValuesOf is widely supported
    const list = Intl.supportedValuesOf?.("timeZone") as string[] | undefined;
    if (list && list.length) return list;
  } catch {
    /* ignore */
  }
  return [
    "UTC",
    "America/New_York",
    "America/Chicago",
    "America/Denver",
    "America/Los_Angeles",
    "America/Sao_Paulo",
    "Europe/London",
    "Europe/Paris",
    "Europe/Berlin",
    "Europe/Madrid",
    "Europe/Moscow",
    "Africa/Cairo",
    "Africa/Johannesburg",
    "Asia/Dubai",
    "Asia/Karachi",
    "Asia/Kolkata",
    "Asia/Bangkok",
    "Asia/Singapore",
    "Asia/Hong_Kong",
    "Asia/Tokyo",
    "Asia/Shanghai",
    "Australia/Sydney",
    "Pacific/Auckland",
  ];
}
