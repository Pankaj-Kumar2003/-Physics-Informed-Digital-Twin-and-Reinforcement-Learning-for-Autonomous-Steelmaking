import { NextResponse } from "next/server";

const SIM_API_URL = process.env.SIM_API_URL || "http://127.0.0.1:8000";

async function proxyFetch(pathname: string, init?: RequestInit) {
  const target = new URL(pathname, SIM_API_URL).toString();
  const response = await fetch(target, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.detail || response.statusText);
  }
  return payload;
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const data = await proxyFetch("/twin/run", {
      method: "POST",
      body: JSON.stringify(body),
    });
    return NextResponse.json({ ok: true, data });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : "Simulation failed",
      },
      { status: 502 },
    );
  }
}

export async function GET() {
  try {
    const data = await proxyFetch("/twin/state");
    return NextResponse.json({ ok: true, data });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : "No simulation state",
      },
      { status: 502 },
    );
  }
}
