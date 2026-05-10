import { ImageResponse } from "next/og"

export const runtime = "edge"
export const alt = "nodepad — spatial AI research tool"
export const size = { width: 1200, height: 630 }
export const contentType = "image/png"

const OG_COLORS = {
  background: "#0a0a0a",
  text: "#f0f0f0",
  muted: "#666666",
  brand: "#3ecf6e",
}

export default function OGImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-start",
          justifyContent: "flex-end",
          background: OG_COLORS.background,
          padding: "80px 96px",
          fontFamily: "sans-serif",
        }}
      >
        {/* Logo mark */}
        <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "48px" }}>
          <div style={{ display: "flex", gap: "6px" }}>
            <div style={{ width: 28, height: 28, borderRadius: 5, background: OG_COLORS.brand }} />
            <div style={{ width: 28, height: 28, borderRadius: 5, background: OG_COLORS.brand, opacity: 0.6 }} />
            <div style={{ width: 28, height: 28, borderRadius: 5, background: OG_COLORS.brand, opacity: 0.3 }} />
          </div>
          <span style={{ fontSize: 28, fontWeight: 600, color: OG_COLORS.text, letterSpacing: "-0.5px" }}>
            nodepad
          </span>
        </div>

        {/* Headline */}
        <div
          style={{
            fontSize: 72,
            fontWeight: 700,
            color: OG_COLORS.text,
            lineHeight: 1.05,
            letterSpacing: "-2px",
            marginBottom: 32,
          }}
        >
          Think spatially.
          <br />
          <span style={{ color: OG_COLORS.brand }}>Let AI fill the gaps.</span>
        </div>

        {/* Subline */}
        <div style={{ fontSize: 24, color: OG_COLORS.muted, fontWeight: 400, letterSpacing: "-0.3px" }}>
          nodepad.space
        </div>
      </div>
    ),
    { ...size },
  )
}
