import { isAdminAuthenticated } from "@/lib/admin-auth";
import {
  deleteBookingRequest,
  editBookingRequest,
  getAdminRequests,
  getAdminWaitlist,
  updateBookingStatus,
} from "@/lib/database";

export async function GET() {
  if (!(await isAdminAuthenticated())) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const [requests, waitlist] = await Promise.all([getAdminRequests(), getAdminWaitlist()]);
    return Response.json({ requests, waitlist });
  } catch (error) {
    console.error("Unable to load admin requests", error);
    return Response.json({ error: "Unable to load booking requests." }, { status: 503 });
  }
}

export async function PATCH(request: Request) {
  if (!(await isAdminAuthenticated())) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }

  let body: {
    reference?: unknown;
    status?: unknown;
    shiftId?: unknown;
    fullName?: unknown;
    phone?: unknown;
    stakeDistrict?: unknown;
    organization?: unknown;
    leaderName?: unknown;
    leaderPhone?: unknown;
  };
  try {
    body = (await request.json()) as { reference?: unknown; status?: unknown };
  } catch {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }

  const reference = typeof body.reference === "string" ? body.reference.trim() : "";
  const status = body.status === "pending" || body.status === "confirmed" ||
    body.status === "rejected" || body.status === "waitlisted" ? body.status : undefined;
  const shiftId = typeof body.shiftId === "string" ? body.shiftId.trim() : "";
  const editFields = {
    stakeDistrict: typeof body.stakeDistrict === "string" ? body.stakeDistrict.trim() : "",
    fullName: typeof body.fullName === "string" ? body.fullName.trim() : "",
    phone: typeof body.phone === "string" ? body.phone.trim() : "",
    organization: typeof body.organization === "string" ? body.organization.trim() : "",
  };
  const hasEditFields = Boolean(shiftId && Object.values(editFields).every(Boolean));
  if (!reference || (!status && !hasEditFields) || (status && !hasEditFields && body.shiftId !== undefined)) {
    return Response.json({ error: "A reference and an update are required." }, { status: 400 });
  }

  try {
    if (hasEditFields) {
      await editBookingRequest(reference, { ...editFields, shiftId, targetStatus: status });
    }
    if (status) await updateBookingStatus(reference, status);
    return Response.json({ updated: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("already full")) {
      return Response.json({ error: message }, { status: 409 });
    }
    console.error("Unable to update booking request", error);
    return Response.json({ error: "Unable to update that request." }, { status: 503 });
  }
}

export async function DELETE(request: Request) {
  if (!(await isAdminAuthenticated())) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }

  const reference = new URL(request.url).searchParams.get("reference")?.trim();
  if (!reference) {
    return Response.json({ error: "A booking reference is required." }, { status: 400 });
  }

  try {
    await deleteBookingRequest(reference);
    return Response.json({ deleted: true });
  } catch (error) {
    console.error("Unable to delete booking request", error);
    return Response.json({ error: "Unable to delete that booking." }, { status: 503 });
  }
}
