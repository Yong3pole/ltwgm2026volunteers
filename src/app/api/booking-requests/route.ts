import { createBookingRequest } from "@/lib/database";

type BookingPayload = {
  people?: unknown;
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

  const people = Array.isArray(payload.people)
    ? payload.people.map((person) => {
      const value = person && typeof person === "object" ? person as Record<string, unknown> : {};
      return {
        stakeDistrict: textValue(value.stakeDistrict),
        wardBranch: textValue(value.wardBranch),
        fullName: textValue(value.fullName),
        phone: textValue(value.phone),
        shiftId: textValue(value.shiftId),
      };
    })
    : [];

  if (people.length === 0 || people.some((person) =>
    !person.stakeDistrict || !person.wardBranch || !person.fullName || !person.phone || !person.shiftId
  )) {
    return Response.json(
      { error: "Please complete all required fields." },
      { status: 400 },
    );
  }

  if (people.some((person) => person.shiftId.length > 64 ||
    person.fullName.length > 120 || person.phone.length > 40 ||
    person.stakeDistrict.length > 100 || person.wardBranch.length > 160
  )) {
    return Response.json({ error: "One or more fields are too long." }, { status: 400 });
  }

  const phonePattern = /^(09\d{9}|\+639\d{9})$/;
  if (people.some((person) => !phonePattern.test(person.phone))) {
    return Response.json({ error: "Use Philippine mobile format: 09XXXXXXXXX or +639XXXXXXXXX." }, { status: 400 });
  }

  try {
    const groupReference = `GRP-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
    const result = await createBookingRequest({ people, groupReference });
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
