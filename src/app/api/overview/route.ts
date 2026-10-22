import { getAdminOverview } from "@/lib/database";

export async function GET() {
  try {
    return Response.json(await getAdminOverview());
  } catch (error) {
    console.error("Unable to load public overview", error);
    return Response.json({ error: "Unable to load the volunteer overview." }, { status: 503 });
  }
}
