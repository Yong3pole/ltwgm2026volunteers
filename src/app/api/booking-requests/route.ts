import { createBookingRequest } from "@/lib/database";

type BookingPayload = {
  shiftId?: unknown;
  fullName?: unknown;
  phone?: unknown;
  organization?: unknown;
  leaderName?: unknown;
  leaderPhone?: unknown;
};

function textValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export async function POST(request: Request) {
  let payload: BookingPayload;

  try {
    payload = (await request.json()) as BookingPayload;
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }

  const input = {
    shiftId: textValue(payload.shiftId),
    fullName: textValue(payload.fullName),
    phone: textValue(payload.phone),
    organization: textValue(payload.organization),
    leaderName: textValue(payload.leaderName),
    leaderPhone: textValue(payload.leaderPhone),
  };

  if (!input.shiftId || !input.fullName || !input.phone || !input.organization || !input.leaderName) {
    return Response.json(
      { error: "Please complete all required fields." },
      { status: 400 },
    );
  }

  if (input.fullName.length > 120 || input.phone.length > 40 ||
      input.organization.length > 160 || input.leaderName.length > 120 || input.leaderPhone.length > 40) {
    return Response.json({ error: "One or more fields are too long." }, { status: 400 });
  }

  const phonePattern = /^(09\d{9}|\+639\d{9})$/;
  if (!phonePattern.test(input.phone) || (input.leaderPhone && !phonePattern.test(input.leaderPhone))) {
    return Response.json({ error: "Use Philippine mobile format: 09XXXXXXXXX or +639XXXXXXXXX." }, { status: 400 });
  }

  try {
    const result = await createBookingRequest(input);
    return Response.json(result, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("already has a request")) {
      return Response.json({ error: message }, { status: 409 });
    }

    console.error("Unable to create booking request", error);
    return Response.json(
      { error: "We could not save your request. Please try again." },
      { status: 503 },
    );
  }
}
