// Health check for Render: confirms the app is up and can reach the database.
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const sets = await getDb().set.count({ where: { status: "PUBLISHED" } });
    return Response.json({ ok: true, sets });
  } catch (error) {
    console.error("Health check failed", error);
    return Response.json({ ok: false, error: "database unreachable" }, { status: 503 });
  }
}
