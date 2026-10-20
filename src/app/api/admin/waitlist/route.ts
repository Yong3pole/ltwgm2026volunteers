import { isAdminAuthenticated } from "@/lib/admin-auth";
import {
  getAdminWaitlist,
  promoteWaitlistEntry,
  removeWaitlistEntry,
} from "@/lib/database";

export async function GET() {
  if (!(await isAdminAuthenticated())) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }
  try {
    return Response.json({ waitlist: await getAdminWaitlist() });
  } catch (error) {
    console.error("Unable to load waitlist", error);
    return Response.json({ error: "Unable to load the waitlist." }, { status: 503 });
  }
}

export async function PATCH(request: Request) {
  if (!(await isAdminAuthenticated())) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }
  let body: { reference?: unknown };
  try {
    body = (await request.json()) as { reference?: unknown };
  } catch {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }
  const reference = typeof body.reference === "string" ? body.reference.trim() : "";
  if (!reference) return Response.json({ error: "A waitlist reference is required." }, { status: 400 });

  try {
    const bookingReference = await promoteWaitlistEntry(reference);
    return Response.json({ promoted: true, bookingReference });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("full")) return Response.json({ error: message }, { status: 409 });
    console.error("Unable to promote waitlist entry", error);
    return Response.json({ error: "Unable to promote that volunteer." }, { status: 503 });
  }
}

export async function DELETE(request: Request) {
  if (!(await isAdminAuthenticated())) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }
  const reference = new URL(request.url).searchParams.get("reference")?.trim();
  if (!reference) return Response.json({ error: "A waitlist reference is required." }, { status: 400 });
  try {
    await removeWaitlistEntry(reference);
    return Response.json({ removed: true });
  } catch (error) {
    console.error("Unable to remove waitlist entry", error);
    return Response.json({ error: "Unable to remove that waitlist entry." }, { status: 503 });
  }
}
