"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { WHATSAPP_DISPLAY_NAME } from "@/lib/branding";
import { useWhatsAppProfilePhoto } from "@/components/dashboard/WhatsAppProfileContext";
import { WHATSAPP_VERTICALS } from "@/lib/whatsapp/profile-constants";
import type { WhatsAppBusinessProfile } from "@/lib/whatsapp/profile-constants";

export function WhatsAppProfilePanel() {
  const [profile, setProfile] = useState<WhatsAppBusinessProfile | null>(null);
  const [about, setAbout] = useState("");
  const [description, setDescription] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [website, setWebsite] = useState("");
  const [vertical, setVertical] = useState("PROF_SERVICES");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [photoFailed, setPhotoFailed] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const sharedPhoto = useWhatsAppProfilePhoto();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/admin/whatsapp-profile");
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "No se pudo cargar el perfil");
        if (cancelled) return;
        applyProfile(data);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "No se pudo cargar el perfil");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  function applyProfile(data: WhatsAppBusinessProfile) {
    setProfile(data);
    setAbout(data.about ?? "");
    setDescription(data.description ?? "");
    setEmail(data.email ?? "");
    setAddress(data.address ?? "");
    setWebsite(data.websites?.[0] ?? "");
    setVertical(data.vertical || "PROF_SERVICES");
    if (data.profile_picture_url) {
      setPhotoFailed(false);
      sharedPhoto?.setPhotoUrl(data.profile_picture_url);
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch("/api/admin/whatsapp-profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          about,
          description,
          email,
          address,
          vertical,
          websites: website.trim() ? [website.trim()] : [],
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "No se pudo guardar");
      applyProfile(data);
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar");
    } finally {
      setSaving(false);
    }
  }

  async function handlePhoto(file: File | undefined) {
    if (!file) return;
    setPhotoFailed(false);
    sharedPhoto?.setPhotoUrl(URL.createObjectURL(file));
    setUploading(true);
    setError(null);
    setSaved(false);
    try {
      const form = new FormData();
      form.set("photo", file);
      const res = await fetch("/api/admin/whatsapp-profile", {
        method: "POST",
        body: form,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "No se pudo subir la foto");
      applyProfile(data);
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo subir la foto");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  const initial = (profile?.verified_name || WHATSAPP_DISPLAY_NAME).charAt(0).toUpperCase();
  const photoUrl = sharedPhoto?.photoUrl || profile?.profile_picture_url || "";

  return (
    <div className="h-full min-h-0 flex flex-col bg-[#f0f2f5]">
      <div className="flex items-center gap-2 sm:gap-3 px-2 sm:px-4 py-2 shrink-0 bg-[#f0f2f5] border-b border-[#e9edef]">
        <Link
          href="/dashboard"
          className="md:hidden shrink-0 w-9 h-9 flex items-center justify-center rounded-full text-[#54656f] hover:bg-[#e9edef]"
          aria-label="Volver a conversaciones"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </Link>
        <div className="min-w-0">
          <p className="text-[#111b21] text-sm font-medium leading-tight">Perfil de WhatsApp</p>
          <p className="text-[#667781] text-xs truncate">Así te ven los clientes</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto pb-10">
          {loading ? (
            <div className="flex justify-center pt-16">
              <div className="w-6 h-6 border-2 border-[#d1d7db] border-t-[#00a884] rounded-full animate-spin" />
            </div>
          ) : (
            <form onSubmit={handleSave}>
              <section className="bg-white mt-0 md:mt-3 px-5 py-6 flex flex-col items-center">
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  disabled={uploading}
                  className="relative cursor-pointer"
                  aria-label="Cambiar foto de perfil"
                >
                  {photoUrl && !photoFailed ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={photoUrl}
                      alt="Foto de perfil"
                      className="w-28 h-28 md:w-32 md:h-32 rounded-full object-cover bg-[#d1d7db]"
                      referrerPolicy="no-referrer"
                      onError={() => setPhotoFailed(true)}
                    />
                  ) : (
                    <div className="w-28 h-28 md:w-32 md:h-32 rounded-full bg-teal-600 text-white text-4xl font-semibold flex items-center justify-center">
                      {initial}
                    </div>
                  )}
                  <span className="absolute bottom-0.5 right-0.5 w-8 h-8 rounded-full bg-[#00a884] text-white flex items-center justify-center shadow-sm">
                    {uploading ? (
                      <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                    ) : (
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                        <path d="M9 3 7.17 5H4a2 2 0 00-2 2v12a2 2 0 002 2h16a2 2 0 002-2V7a2 2 0 00-2-2h-3.17L15 3H9zm3 15a5 5 0 110-10 5 5 0 010 10z" />
                      </svg>
                    )}
                  </span>
                </button>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={(e) => void handlePhoto(e.target.files?.[0])}
                />
                <p className="text-[#667781] text-xs mt-3">Toca la foto para cambiarla</p>
              </section>

              <p className="px-4 pt-4 pb-2 text-[12px] text-[#667781] uppercase tracking-wide">
                Solo Meta puede cambiar esto
              </p>
              <section className="bg-white">
                <LockedField
                  label="Nombre"
                  value={profile?.verified_name || WHATSAPP_DISPLAY_NAME}
                  hint="Lo aprueba Meta. No se edita desde el panel."
                />
                <LockedField
                  label="Teléfono"
                  value={profile?.display_phone_number ? `+${profile.display_phone_number}` : "—"}
                  hint="El número registrado en WhatsApp Cloud API."
                />
                {profile?.quality_rating ? (
                  <LockedField
                    label="Calidad"
                    value={profile.quality_rating}
                    hint="La califica Meta según reportes y bloqueos."
                  />
                ) : null}
              </section>

              <p className="px-4 pt-4 pb-2 text-[12px] text-[#667781] uppercase tracking-wide">
                Info del negocio
              </p>
              <section className="bg-white">
                <Field label="Recado" hint={`${about.length}/139 · Lo que sale bajo tu nombre`}>
                  <input
                    value={about}
                    maxLength={139}
                    onChange={(e) => setAbout(e.target.value)}
                    className="wa-field"
                    placeholder="Ej. Terrenos en Puerto Escondido"
                  />
                </Field>
                <Field label="Descripción" hint={`${description.length}/512`}>
                  <textarea
                    value={description}
                    maxLength={512}
                    rows={4}
                    onChange={(e) => setDescription(e.target.value)}
                    className="wa-field resize-none"
                    placeholder="Cuéntales a tus clientes quiénes son"
                  />
                </Field>
                <Field
                  label="Categoría"
                  hint="Meta no tiene Inmobiliaria. La más cercana es Servicios profesionales."
                >
                  <select
                    value={vertical}
                    onChange={(e) => setVertical(e.target.value)}
                    className="wa-field cursor-pointer"
                  >
                    {WHATSAPP_VERTICALS.map((item) => (
                      <option key={item.value} value={item.value}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Correo">
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="wa-field"
                    placeholder="hola@jomar.mx"
                  />
                </Field>
                <Field label="Dirección">
                  <input
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    className="wa-field"
                    placeholder="Bajos de Chila, Puerto Escondido"
                  />
                </Field>
                <Field label="Sitio web">
                  <input
                    type="url"
                    value={website}
                    onChange={(e) => setWebsite(e.target.value)}
                    className="wa-field"
                    placeholder="https://"
                  />
                </Field>
              </section>

              {error && (
                <p className="mx-4 mt-4 text-sm text-[#d92d20] bg-[#fff0f0] border border-[#f5c2c7] rounded-lg px-3 py-2">
                  {error}
                </p>
              )}
              {saved && !error && (
                <p className="mx-4 mt-4 text-sm text-[#008f72] bg-[#e7f8f2] rounded-lg px-3 py-2">
                  Perfil actualizado. Los cambios pueden tardar unos minutos en verse en WhatsApp.
                </p>
              )}

              <div className="px-4 pt-5">
                <button
                  type="submit"
                  disabled={saving}
                  className="w-full md:w-auto md:min-w-[220px] h-12 bg-[#00a884] hover:bg-[#008f72] disabled:bg-[#aebac1] text-white font-medium rounded-lg text-sm"
                >
                  {saving ? "Guardando…" : "Guardar perfil"}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

function LockedField({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div
      className="px-5 py-3.5 border-b border-[#f0f2f5] bg-[#f6f7f8] cursor-not-allowed"
      title="Solo Meta puede cambiar este dato"
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-[12px] text-[#8696a0] font-medium">{label}</p>
        <svg className="w-3.5 h-3.5 text-[#8696a0] shrink-0" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <path d="M17 8h-1V6a4 4 0 10-8 0v2H7a2 2 0 00-2 2v8a2 2 0 002 2h10a2 2 0 002-2v-8a2 2 0 00-2-2zm-7-2a2 2 0 114 0v2h-4V6zm7 12H7v-8h10v8z" />
        </svg>
      </div>
      <input
        readOnly
        tabIndex={-1}
        value={value}
        className="wa-field-locked mt-1"
        aria-readonly="true"
      />
      {hint ? <p className="text-[#8696a0] text-[11px] mt-1">{hint}</p> : null}
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block px-5 py-3.5 border-b border-[#f0f2f5] cursor-text">
      <span className="text-[12px] text-[#00a884] font-medium">{label}</span>
      <div className="mt-1">{children}</div>
      {hint ? <p className="text-[#667781] text-[11px] mt-1">{hint}</p> : null}
    </label>
  );
}
