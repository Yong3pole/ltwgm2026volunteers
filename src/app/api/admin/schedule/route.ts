import { isAdminAuthenticated } from "@/lib/admin-auth";
import { addScheduleDate, getAdminSchedule, removeScheduleDate, updateScheduleDate } from "@/lib/database";

export async function GET() {
  if (!(await isAdminAuthenticated())) return Response.json({ error: "Unauthorized." }, { status: 401 });
  try {
    return Response.json({ schedule: await getAdminSchedule() });
  } catch (error) {
    console.error("Unable to load admin schedule", error);
    return Response.json({ error: "Unable to load schedule." }, { status: 503 });
  }
}

export async function POST(request: Request) {
  if (!(await isAdminAuthenticated())) return Response.json({ error: "Unauthorized." }, { status: 401 });
  try {
    const body = (await request.json()) as { date?: unknown; sourceDate?: unknown };
    const date = typeof body.date === "string" ? body.date : "";
    const sourceDate = typeof body.sourceDate === "string" ? body.sourceDate : undefined;
    await addScheduleDate(date, sourceDate);
    return Response.json({ created: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to add schedule date.";
    return Response.json({ error: message }, { status: 400 });
  }
}

export async function PATCH(request: Request) {
  if (!(await isAdminAuthenticated())) return Response.json({ error: "Unauthorized." }, { status: 401 });
  try {
    const body = (await request.json()) as { currentDate?: unknown; date?: unknown; shifts?: unknown };
    if (typeof body.currentDate !== "string" || typeof body.date !== "string" || !Array.isArray(body.shifts)) {
      return Response.json({ error: "A date and both shifts are required." }, { status: 400 });
    }
    await updateScheduleDate(body.currentDate, body.date, body.shifts as { shiftId: string; startTime: string; endTime: string; capacity: number }[]);
    return Response.json({ updated: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to update schedule.";
    return Response.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(request: Request) {
  if (!(await isAdminAuthenticated())) return Response.json({ error: "Unauthorized." }, { status: 401 });
  const date = new URL(request.url).searchParams.get("date") ?? "";
  try {
    await removeScheduleDate(date);
    return Response.json({ deleted: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to remove schedule.";
    return Response.json({ error: message }, { status: 400 });
  }
}
