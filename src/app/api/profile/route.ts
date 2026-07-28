import { getPublicProfiles } from "@/lib/profiles";

export async function GET() {
  try {
    return Response.json(getPublicProfiles());
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
