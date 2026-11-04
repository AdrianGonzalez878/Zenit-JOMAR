"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { WhatsAppBusinessProfile } from "@/lib/whatsapp/profile-constants";

type ProfileContextValue = {
  photoUrl: string;
  refreshProfile: () => Promise<void>;
  setPhotoUrl: (url: string) => void;
};

const WhatsAppProfileContext = createContext<ProfileContextValue | null>(null);

export function WhatsAppProfileProvider({ children }: { children: React.ReactNode }) {
  const [photoUrl, setPhotoUrlState] = useState("");

  const setPhotoUrl = useCallback((url: string) => {
    const clean = url.trim();
    if (!clean) {
      setPhotoUrlState("");
      return;
    }
    if (clean.startsWith("blob:") || clean.startsWith("data:")) {
      setPhotoUrlState(clean);
      return;
    }
    const stamp = Date.now();
    if (/facebook|fbcdn|fbsbx|whatsapp/i.test(clean)) {
      setPhotoUrlState(`/api/admin/whatsapp-profile/photo?t=${stamp}`);
      return;
    }
    setPhotoUrlState(clean.includes("?") ? `${clean}&t=${stamp}` : `${clean}?t=${stamp}`);
  }, []);

  const refreshProfile = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/whatsapp-profile", { cache: "no-store" });
      const data = (await res.json()) as WhatsAppBusinessProfile & { error?: string };
      if (!res.ok) return;
      setPhotoUrl(data.profile_picture_url ?? "");
    } catch {
      // El avatar se queda con la inicial
    }
  }, [setPhotoUrl]);

  useEffect(() => {
    void refreshProfile();
  }, [refreshProfile]);

  const value = useMemo(
    () => ({ photoUrl, refreshProfile, setPhotoUrl }),
    [photoUrl, refreshProfile, setPhotoUrl]
  );

  return (
    <WhatsAppProfileContext.Provider value={value}>
      {children}
    </WhatsAppProfileContext.Provider>
  );
}

export function useWhatsAppProfilePhoto() {
  return useContext(WhatsAppProfileContext);
}
