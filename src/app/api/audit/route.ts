import { promises as fs } from "fs";
import path from "path";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const record = await req.json();

    if (!record.handId || typeof record.handId !== "string") {
      return NextResponse.json(
        { ok: false, error: "Missing or invalid handId" },
        { status: 400 },
      );
    }

    const dir = path.join(process.cwd(), "data", "audits");
    await fs.mkdir(dir, { recursive: true });

    const filePath = path.join(dir, `${record.handId}.json`);
    await fs.writeFile(filePath, JSON.stringify(record, null, 2), "utf-8");

    return NextResponse.json({ ok: true, handId: record.handId });
  } catch (err) {
    console.error("[audit] Failed to write hand record:", err);
    return NextResponse.json(
      { ok: false, error: "Internal server error" },
      { status: 500 },
    );
  }
}
