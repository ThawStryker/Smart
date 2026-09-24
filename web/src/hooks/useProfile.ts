import { useEffect, useState } from "react";
import { client } from "@/lib/edgespark";
import { useAuth } from "@/hooks/useAuth";

interface Profile {
  userId: string;
  role: string;
  displayName: string | null;
  isAdmin: boolean;
}

export function useProfile() {
  const { isAuthenticated, loading: authLoading } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated) {
      setProfile(null);
      setLoading(false);
      return;
    }
    let ignore = false;
    setLoading(true);
    client.api.fetch("/api/profile/me")
      .then((r) => r.ok ? r.json() : null)
      .then((data: Profile | null) => {
        if (!ignore) { setProfile(data); setLoading(false); }
      })
      .catch(() => {
        if (!ignore) { setProfile(null); setLoading(false); }
      });
    return () => { ignore = true; };
  }, [isAuthenticated, authLoading]);

  return { profile, loading, isAdmin: profile?.isAdmin ?? false };
}
