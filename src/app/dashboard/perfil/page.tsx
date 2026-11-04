"use client";

import { Suspense } from "react";
import { DashboardWorkspace } from "@/app/dashboard/page";

export default function PerfilPage() {
  return (
    <Suspense
      fallback={
        <div className="h-full flex items-center justify-center bg-white">
          <div className="w-5 h-5 border-2 border-[#e9edef] border-t-[#00a884] rounded-full animate-spin" />
        </div>
      }
    >
      <DashboardWorkspace panel="profile" />
    </Suspense>
  );
}
