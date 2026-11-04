"use client";

import { useEffect, useState } from "react";

function isStandalone() {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    ("standalone" in window.navigator && Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone))
  );
}

export function InstallHint() {
  const [visible, setVisible] = useState(false);
  const [ios, setIos] = useState(false);

  useEffect(() => {
    if (isStandalone()) return;
    if (sessionStorage.getItem("pwa-install-dismissed") === "1") return;
    const ua = window.navigator.userAgent;
    const isIos = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    setIos(isIos);
    setVisible(true);
  }, []);

  if (!visible) return null;

  return (
    <div className="mt-4 rounded-xl bg-white/90 border border-[#e9edef] px-3.5 py-3 text-center shadow-sm">
      <p className="text-[#111b21] text-[13px] font-medium">Úsala como app</p>
      <p className="text-[#667781] text-[12px] mt-1 leading-relaxed">
        {ios
          ? "En Safari: botón Compartir → Agregar a pantalla de inicio."
          : "En Chrome: menú ⋮ → Instalar app / Agregar a pantalla de inicio."}
      </p>
      <button
        type="button"
        onClick={() => {
          sessionStorage.setItem("pwa-install-dismissed", "1");
          setVisible(false);
        }}
        className="mt-2 text-[12px] text-[#00a884] font-medium"
      >
        Entendido
      </button>
    </div>
  );
}
