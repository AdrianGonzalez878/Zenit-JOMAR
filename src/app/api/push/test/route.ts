import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { sendUserPush } from "@/lib/push/send";

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await sendUserPush(user.id, {
    title: "Aviso de prueba",
    body: "Si ves esto, el celular ya puede sonar con el panel cerrado.",
    conversationId: "",
    tag: "push-test",
  });

  return NextResponse.json({ status: "ok", sent: result.sent });
}
