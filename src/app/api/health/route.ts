import { NextResponse } from "next/server";

export function GET() {
  return NextResponse.json({
    service: "md-server",
    status: "ok",
    timestamp: new Date().toISOString(),
  });
}
