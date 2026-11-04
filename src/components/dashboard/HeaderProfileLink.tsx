"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function HeaderProfileLink() {
  const pathname = usePathname();
  const active = pathname.startsWith("/dashboard/perfil");

  return (
    <Link
      href="/dashboard/perfil"
      className={`flex items-center gap-1.5 text-xs font-medium transition-colors px-2.5 py-2 rounded-lg ${
        active ? "bg-white/25 text-white" : "text-white/90 hover:text-white hover:bg-white/15"
      }`}
      title="Perfil de WhatsApp"
    >
      <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.5 20.25a8.25 8.25 0 0115 0" />
      </svg>
      <span className="hidden sm:inline">Perfil</span>
    </Link>
  );
}
