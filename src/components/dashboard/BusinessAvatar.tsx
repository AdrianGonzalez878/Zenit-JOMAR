"use client";

import { WHATSAPP_DISPLAY_NAME } from "@/lib/branding";
import { useWhatsAppProfilePhoto } from "@/components/dashboard/WhatsAppProfileContext";

export function BusinessAvatar({
  size = "sm",
  className = "",
}: {
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const profile = useWhatsAppProfilePhoto();
  const photoUrl = profile?.photoUrl ?? "";
  const sizeClass = {
    sm: "w-10 h-10 text-sm",
    md: "w-12 h-12 text-base",
    lg: "w-24 h-24 text-3xl",
  }[size];

  return (
    <div
      className={`rounded-full overflow-hidden bg-teal-600 flex items-center justify-center shrink-0 ${sizeClass} ${className}`}
    >
      {photoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={photoUrl}
          alt={WHATSAPP_DISPLAY_NAME}
          className="w-full h-full object-cover"
          referrerPolicy="no-referrer"
        />
      ) : (
        <span className="text-white font-semibold">Z</span>
      )}
    </div>
  );
}
