"use client";

import { useRef, useState } from "react";

const OPEN = 92;
const COMMIT = 150;

export function SwipeToDeleteRow({
  label,
  selected,
  onOpen,
  onDelete,
  children,
}: {
  label: string;
  selected: boolean;
  onOpen: () => void;
  onDelete: () => Promise<void>;
  children: React.ReactNode;
}) {
  const [offset, setOffset] = useState(0);
  const offsetRef = useRef(0);
  const [dragging, setDragging] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const start = useRef<{ x: number; y: number; base: number; pointerId: number } | null>(null);
  const axis = useRef<"x" | "y" | null>(null);
  const moved = useRef(false);

  function setSlide(next: number) {
    offsetRef.current = next;
    setOffset(next);
  }

  function reset() {
    setSlide(0);
    setConfirming(false);
    setError(null);
  }

  function onPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (event.button !== 0 || confirming) return;
    start.current = {
      x: event.clientX,
      y: event.clientY,
      base: offsetRef.current,
      pointerId: event.pointerId,
    };
    axis.current = null;
    moved.current = false;
  }

  function onPointerMove(event: React.PointerEvent<HTMLDivElement>) {
    if (!start.current || start.current.pointerId !== event.pointerId) return;
    const dx = event.clientX - start.current.x;
    const dy = event.clientY - start.current.y;
    if (!axis.current) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      axis.current = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
      if (axis.current === "y") return;
      event.currentTarget.setPointerCapture(event.pointerId);
      setDragging(true);
    }
    if (axis.current !== "x") return;
    moved.current = true;
    const next = Math.max(0, Math.min(start.current.base + dx, 220));
    setSlide(next);
  }

  function onPointerUp(event: React.PointerEvent<HTMLDivElement>) {
    if (!start.current || start.current.pointerId !== event.pointerId) return;
    const wasSwipe = axis.current === "x";
    start.current = null;
    axis.current = null;
    setDragging(false);
    if (!wasSwipe) return;
    const current = offsetRef.current;
    if (current >= COMMIT) {
      setSlide(0);
      setConfirming(true);
      return;
    }
    setSlide(current > 48 ? OPEN : 0);
  }

  async function confirmDelete() {
    setBusy(true);
    setError(null);
    try {
      await onDelete();
    } catch {
      setError("No se pudo eliminar el chat.");
      setBusy(false);
    }
  }

  return (
    <div className="relative overflow-hidden border-b border-[#f0f2f5]">
      <button
        type="button"
        className="absolute inset-y-0 left-0 w-[92px] bg-[#ea0038] text-white text-sm font-medium"
        onClick={() => setConfirming(true)}
      >
        Eliminar
      </button>
      <div
        role="button"
        tabIndex={0}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onClick={() => {
          if (moved.current) {
            moved.current = false;
            return;
          }
          if (offset > 0) {
            reset();
            return;
          }
          onOpen();
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onOpen();
          }
        }}
        className="relative w-full text-left flex items-center gap-3 px-4 py-3 bg-white select-none"
        style={{
          transform: `translateX(${offset}px)`,
          transition: dragging ? "none" : "transform 180ms ease",
          background: selected ? "#f0f2f5" : "#ffffff",
          touchAction: "pan-y",
        }}
      >
        {children}
      </div>
      {confirming && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 px-4 pb-6 sm:pb-0"
          onClick={() => {
            if (!busy) reset();
          }}
        >
          <div
            className="bg-white rounded-2xl w-full max-w-sm p-5 shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <p className="text-[#111b21] text-base font-medium">¿Eliminar chat?</p>
            <p className="text-[#667781] text-sm mt-1.5 leading-relaxed">
              Se borra el historial con {label}. El siguiente mensaje de este número empieza de cero.
            </p>
            {error && <p className="text-[#d92d20] text-sm mt-2">{error}</p>}
            <div className="flex justify-end gap-2 mt-4">
              <button
                type="button"
                disabled={busy}
                onClick={reset}
                className="h-10 px-4 rounded-lg text-sm text-[#54656f] hover:bg-[#f0f2f5]"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void confirmDelete()}
                className="h-10 px-4 rounded-lg text-sm font-medium text-white bg-[#ea0038] disabled:opacity-60"
              >
                {busy ? "Eliminando..." : "Eliminar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
