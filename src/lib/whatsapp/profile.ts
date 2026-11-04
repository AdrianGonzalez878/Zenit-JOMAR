import type { WhatsAppBusinessProfile } from "@/lib/whatsapp/profile-constants";

export type { WhatsAppBusinessProfile };

const WHATSAPP_API_URL = "https://graph.facebook.com/v20.0";

const PROFILE_FIELDS =
  "about,address,description,email,profile_picture_url,websites,vertical";

export interface WhatsAppProfileUpdate {
  about?: string;
  address?: string;
  description?: string;
  email?: string;
  websites?: string[];
  vertical?: string;
  profile_picture_handle?: string;
}

function token() {
  const value = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!value || !phoneId) {
    throw new Error("Falta WHATSAPP_ACCESS_TOKEN o WHATSAPP_PHONE_NUMBER_ID");
  }
  return { token: value, phoneId };
}

async function graphGet<T>(path: string): Promise<T> {
  const { token: accessToken } = token();
  const response = await fetch(`${WHATSAPP_API_URL}${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  const json = await response.json();
  if (!response.ok) {
    throw new Error(json?.error?.message ?? JSON.stringify(json));
  }
  return json as T;
}

async function graphPost<T>(path: string, body: object): Promise<T> {
  const { token: accessToken } = token();
  const response = await fetch(`${WHATSAPP_API_URL}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const json = await response.json();
  if (!response.ok) {
    throw new Error(json?.error?.message ?? JSON.stringify(json));
  }
  return json as T;
}

export async function getWhatsAppBusinessProfile(): Promise<WhatsAppBusinessProfile> {
  const { phoneId } = token();

  const [profileRes, phoneRes] = await Promise.all([
    graphGet<{ data?: Array<Partial<WhatsAppBusinessProfile>> }>(
      `/${phoneId}/whatsapp_business_profile?fields=${PROFILE_FIELDS}`
    ),
    graphGet<{
      verified_name?: string;
      display_phone_number?: string;
      quality_rating?: string;
    }>(`/${phoneId}?fields=verified_name,display_phone_number,quality_rating`),
  ]);

  const profile = profileRes.data?.[0] ?? {};

  return {
    about: profile.about ?? "",
    address: profile.address ?? "",
    description: profile.description ?? "",
    email: profile.email ?? "",
    profile_picture_url: profile.profile_picture_url ?? "",
    websites: profile.websites ?? [],
    vertical: profile.vertical ?? "OTHER",
    verified_name: phoneRes.verified_name ?? "",
    display_phone_number: phoneRes.display_phone_number ?? "",
    quality_rating: phoneRes.quality_rating ?? "",
  };
}

export async function updateWhatsAppBusinessProfile(update: WhatsAppProfileUpdate) {
  const { phoneId } = token();
  const body: Record<string, unknown> = {
    messaging_product: "whatsapp",
  };

  if (update.about !== undefined) body.about = update.about.slice(0, 139);
  if (update.address !== undefined) body.address = update.address;
  if (update.description !== undefined) body.description = update.description.slice(0, 512);
  if (update.email !== undefined) body.email = update.email;
  if (update.vertical !== undefined) body.vertical = update.vertical;
  if (update.websites !== undefined) {
    body.websites = update.websites.filter(Boolean).slice(0, 2);
  }
  if (update.profile_picture_handle) {
    body.profile_picture_handle = update.profile_picture_handle;
  }

  return graphPost(`/${phoneId}/whatsapp_business_profile`, body);
}

async function getAppId() {
  const { token: accessToken } = token();
  const json = await graphGet<{ data?: { app_id?: string } }>(
    `/debug_token?input_token=${encodeURIComponent(accessToken)}`
  );
  const appId = json.data?.app_id;
  if (!appId) throw new Error("No se pudo obtener el App ID de Meta para subir la foto");
  return appId;
}

export async function uploadWhatsAppProfilePicture(file: File) {
  const { token: accessToken } = token();
  const appId = await getAppId();
  const bytes = Buffer.from(await file.arrayBuffer());
  const mime = file.type || "image/jpeg";
  const name = file.name || "perfil.jpg";

  const session = await graphPost<{ id: string }>(
    `/${appId}/uploads?file_name=${encodeURIComponent(name)}&file_length=${bytes.length}&file_type=${encodeURIComponent(mime)}`,
    {}
  );

  const upload = await fetch(`${WHATSAPP_API_URL}/${session.id}`, {
    method: "POST",
    headers: {
      Authorization: `OAuth ${accessToken}`,
      file_offset: "0",
    },
    body: bytes,
  });
  const uploaded = await upload.json();
  if (!upload.ok || !uploaded.h) {
    throw new Error(uploaded?.error?.message ?? "No se pudo subir la foto de perfil");
  }

  await updateWhatsAppBusinessProfile({ profile_picture_handle: uploaded.h });
  return uploaded.h as string;
}
