import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/server";
import {
  getWhatsAppBusinessProfile,
  updateWhatsAppBusinessProfile,
  uploadWhatsAppProfilePicture,
} from "@/lib/whatsapp/profile";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await requireUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const profile = await getWhatsAppBusinessProfile();
    return NextResponse.json(profile);
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudo leer el perfil";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

export async function POST(request: Request) {
  const user = await requireUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const contentType = request.headers.get("content-type") ?? "";

    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      const photo = form.get("photo");
      if (!(photo instanceof File) || photo.size === 0) {
        return NextResponse.json({ error: "Falta la foto" }, { status: 400 });
      }
      if (photo.size > 5 * 1024 * 1024) {
        return NextResponse.json({ error: "La foto debe pesar menos de 5 MB" }, { status: 400 });
      }
      await uploadWhatsAppProfilePicture(photo);
    } else {
      const body = await request.json();
      await updateWhatsAppBusinessProfile({
        about: typeof body.about === "string" ? body.about : undefined,
        address: typeof body.address === "string" ? body.address : undefined,
        description: typeof body.description === "string" ? body.description : undefined,
        email: typeof body.email === "string" ? body.email : undefined,
        vertical: typeof body.vertical === "string" ? body.vertical : undefined,
        websites: Array.isArray(body.websites)
          ? body.websites.filter((w: unknown) => typeof w === "string")
          : undefined,
      });
    }

    const profile = await getWhatsAppBusinessProfile();
    return NextResponse.json(profile);
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudo guardar el perfil";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
