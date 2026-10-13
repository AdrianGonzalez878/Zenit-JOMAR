import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { ConversationStatus } from "@/types";
import { z } from "zod";

const schema = z
  .object({
    status: z.enum(["ai_active", "paused", "resolved"]).optional(),
    needs_advisor: z.boolean().optional(),
    needs_advisor_reason: z.string().max(160).optional(),
  })
  .refine((data) => data.status !== undefined || data.needs_advisor !== undefined, {
    message: "Nada que actualizar",
  });

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();

  const result = schema.safeParse(body);
  if (!result.success) {
    return NextResponse.json({ error: "Estado inválido" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const patch: {
    status?: ConversationStatus;
    needs_advisor?: boolean;
    needs_advisor_at?: string | null;
    needs_advisor_reason?: string | null;
  } = {};

  if (result.data.status) {
    patch.status = result.data.status as ConversationStatus;
  }

  if (result.data.needs_advisor === false) {
    patch.needs_advisor = false;
    patch.needs_advisor_at = null;
    patch.needs_advisor_reason = null;
  } else if (result.data.needs_advisor === true) {
    patch.needs_advisor = true;
    patch.needs_advisor_at = new Date().toISOString();
    patch.needs_advisor_reason = result.data.needs_advisor_reason ?? "Marcado por el asesor";
  }

  const { data, error } = await supabase
    .from("conversations")
    .update(patch)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}
