import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/server";
import { getWhatsAppBusinessProfile } from "@/lib/whatsapp/profile";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await requireUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const profile = await getWhatsAppBusinessProfile();
    const photoUrl = profile.profile_picture_url;
    if (!photoUrl) {
      return new NextResponse(null, { status: 404 });
    }

    const image = await fetch(photoUrl, { cache: "no-store" });
    if (!image.ok) {
      return new NextResponse(null, { status: 502 });
    }

    return new NextResponse(image.body, {
      headers: {
        "Content-Type": image.headers.get("content-type") || "image/jpeg",
        "Cache-Control": "private, max-age=120",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudo leer la foto";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
