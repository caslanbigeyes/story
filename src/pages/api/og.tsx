import { ImageResponse } from "next/og";
import type { NextRequest } from "next/server";

export const config = { runtime: "edge" };

export default function handler(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const title = (searchParams.get("title") || "llf").slice(0, 80);
  const subtitle = (searchParams.get("subtitle") || "思考、记录、分享").slice(0, 80);
  const tags = (searchParams.get("tags") || "")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 4);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "72px 80px",
          background:
            "linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #312e81 100%)",
          color: "white",
          fontFamily: "system-ui, -apple-system, sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 12,
              background: "linear-gradient(135deg, #fff, #cbd5e1)",
              color: "#0f172a",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 26,
              fontWeight: 700,
            }}
          >
            M
          </div>
          <div style={{ fontSize: 24, fontWeight: 600, opacity: 0.9 }}>
            llf
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div
            style={{
              fontSize: 64,
              fontWeight: 800,
              lineHeight: 1.15,
              letterSpacing: "-0.02em",
            }}
          >
            {title}
          </div>
          <div style={{ fontSize: 26, opacity: 0.75, lineHeight: 1.4 }}>
            {subtitle}
          </div>
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            fontSize: 22,
            opacity: 0.8,
          }}
        >
          <div style={{ display: "flex", gap: 10 }}>
            {tags.map((t) => (
              <div
                key={t}
                style={{
                  padding: "6px 16px",
                  borderRadius: 999,
                  background: "rgba(255,255,255,0.12)",
                  fontSize: 20,
                }}
              >
                #{t}
              </div>
            ))}
          </div>
          <div>gghh.xyz</div>
        </div>
      </div>
    ),
    { width: 1200, height: 630 }
  );
}
