import { setAdminSession, verifyAdminPassword } from "@/lib/admin-auth";

export async function POST(request: Request) {
  let body: { password?: unknown };
  try {
    body = (await request.json()) as { password?: unknown };
  } catch {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }

  if (typeof body.password !== "string" || body.password.length === 0) {
    return Response.json({ error: "Enter the admin password." }, { status: 400 });
  }

  try {
    if (!(await verifyAdminPassword(body.password))) {
      return Response.json({ error: "Incorrect password." }, { status: 401 });
    }
    await setAdminSession();
    return Response.json({ authenticated: true });
  } catch (error) {
    console.error("Admin login failed", error);
    return Response.json({ error: "Admin login is not configured." }, { status: 503 });
  }
}
