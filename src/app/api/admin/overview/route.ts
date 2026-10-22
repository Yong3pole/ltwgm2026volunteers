import { isAdminAuthenticated } from "@/lib/admin-auth";
import { getAdminOverview } from "@/lib/database";

export async function GET() {
  if (!(await isAdminAuthenticated())) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    return Response.json(await getAdminOverview());
  } catch (error) {
    console.error("Unable to load admin overview", error);
    return Response.json({ error: "Unable to load the schedule overview." }, { status: 503 });
  }
}
