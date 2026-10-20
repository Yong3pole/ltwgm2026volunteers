import { getShiftAvailability } from "@/lib/database";
import { connection } from "next/server";

export async function GET() {
  await connection();

  try {
    const shifts = await getShiftAvailability();
    return Response.json({ shifts });
  } catch (error) {
    console.error("Unable to load shift availability", error);
    return Response.json(
      { error: "Availability is temporarily unavailable." },
      { status: 503 },
    );
  }
}
