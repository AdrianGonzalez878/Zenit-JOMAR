"use client";

import { useEffect, useState } from "react";
import { canUseWebPush, subscribeWebPush } from "@/lib/push/client";

type Status = "idle" | "on" | "off" | "blocked" | "unsupported" | "missing-sql";

function isIos() {
  if (typeof window === "undefined") return false;
  const ua = window.navigator.userAgent;
  return (
    /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

function computeInitialStatus(): Status {
  if (!canUseWebPush()) return "unsupported";
  if (Notification.permission === "denied") return "blocked";
  if (Notification.permission === "granted") return "idle";
  return "off";
}

export function EnablePushButton() {
  const [status, setStatus] = useState<Status>(computeInitialStatus);
  const [busy, setBusy] = useState(false);
  const [hint, setHint] = useState<string | null>(null);

  useEffect(() => {
    if (!canUseWebPush() || Notification.permission !== "granted") return;
    void subscribeWebPush().then((result) => {
      if (result.ok) setStatus("on");
      else if (result.error?.includes("push_subscriptions")) setStatus("missing-sql");
      else setStatus("off");
    });
  }, []);

  async function enable() {
    setBusy(true);
    setHint(null);
    const result = await subscribeWebPush();
    setBusy(false);
    if (result.ok) {
      setStatus("on");
      const test = await fetch("/api/push/test", { method: "POST" });
      const data = (await test.json().catch(() => null)) as { sent?: number } | null;
      setHint(
        data?.sent
          ? "Listo. Debes ver un aviso de prueba."
          : "Suscrito. Si no suena, abre la app instalada y prueba de nuevo."
      );
      return;
    }
    if (result.error?.includes("push_subscriptions") || result.error?.includes("SQL")) {
      setStatus("missing-sql");
      return;
    }
    setStatus(Notification.permission === "denied" ? "blocked" : "off");
    setHint(result.error ?? "No se pudieron activar los avisos.");
  }

  if (status === "unsupported") {
    return (
      <span
        className="hidden sm:inline text-[11px] text-white/80 max-w-[140px] truncate"
        title={
          isIos()
            ? "En iPhone: Safari → Compartir → Agregar a inicio, y abre la app desde ahí."
            : "Este navegador no admite avisos con la app cerrada."
        }
      >
        {isIos() ? "Instala la app" : "Sin push"}
      </span>
    );
  }

  if (status === "missing-sql") {
    return (
      <span className="text-[11px] text-amber-100 max-w-[130px] truncate" title="Falta el SQL 005 en Supabase">
        Falta SQL avisos
      </span>
    );
  }

  if (status === "blocked") {
    return (
      <span className="text-[11px] text-white/80 max-w-[130px] truncate" title="Activa notificaciones en Ajustes">
        Avisos bloqueados
      </span>
    );
  }

  if (status === "on") {
    return (
      <span className="text-[11px] text-white/90" title={hint ?? "Avisos del celular activos"}>
        Avisos on
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={() => void enable()}
      disabled={busy}
      className="text-[11px] sm:text-xs font-medium text-white/90 hover:text-white px-2 py-2 rounded-lg hover:bg-white/15 disabled:opacity-50 whitespace-nowrap"
      title="Activar avisos en el celular aunque la app esté cerrada"
    >
      {busy ? "…" : "Activar avisos"}
    </button>
  );
}
