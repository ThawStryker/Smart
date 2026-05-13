import { useEffect, useState } from "react";
import { client } from "@/lib/edgespark";

interface Profile {
  userId: string;
  role: string;
  displayName: string | null;
  isAdmin: boolean;
}

export function useProfile() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let ignore = false;
    const fetchProfile = () => {
      client.api.fetch("/api/profile/me")
        .then(r => r.json())
        .then((data: Profile) => {
          if (!ignore) { setProfile(data); setLoading(false); }
        })
        .catch(() => {
          if (!ignore) setLoading(false);
        });
    };
    fetchProfile();
    return () => { ignore = true; };
  }, []);

  return { profile, loading, isAdmin: profile?.isAdmin ?? false };
}
