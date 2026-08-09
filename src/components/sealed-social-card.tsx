export function SealedSocialCard() {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 54,
        background: "#faf7f1",
        color: "#24211f",
        padding: 72,
      }}
    >
      <svg width="220" height="220" viewBox="0 0 64 64" fill="none">
        <rect width="64" height="64" rx="14" fill="#295744" />
        <rect
          x="10"
          y="15"
          width="44"
          height="34"
          rx="6"
          fill="#faf7f1"
          stroke="#faf7f1"
          strokeWidth="3"
        />
        <path
          d="m13 20 19 14 19-14"
          stroke="#295744"
          strokeWidth="4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="32" cy="34" r="6" fill="#b7503c" />
        <path d="m28.5 38.5-1.5 8 5-2.4 5 2.4-1.5-8" fill="#b7503c" />
      </svg>
      <div style={{ display: "flex", flexDirection: "column" }}>
        <div style={{ fontSize: 104, fontWeight: 700, letterSpacing: -4 }}>
          Sealed
        </div>
        <div style={{ marginTop: 12, fontSize: 34, color: "#675f59" }}>
          A private address book, kept current.
        </div>
      </div>
    </div>
  );
}
