"use client";

type Props = {
    isDualSim: boolean;
    simSlotIndex: 0 | 1;
    onChange: (v: 0 | 1) => void;
};

export function SimToggle({ isDualSim, simSlotIndex, onChange }: Props) {
    if (!isDualSim) return <div className="hintText">Single SIM</div>;

    return (
        <div style={{ display: "flex", gap: 8 }}>
            <button
                onClick={() => onChange(0)}
                style={{
                    padding: "8px 10px",
                    borderRadius: 999,
                    border: "1px solid rgba(255,255,255,0.18)",
                    background:
                        simSlotIndex === 0 ? "rgba(255,255,255,0.12)" : "transparent",
                    color: "inherit",
                }}
            >
                SIM 1
            </button>
            <button
                onClick={() => onChange(1)}
                style={{
                    padding: "8px 10px",
                    borderRadius: 999,
                    border: "1px solid rgba(255,255,255,0.18)",
                    background:
                        simSlotIndex === 1 ? "rgba(255,255,255,0.12)" : "transparent",
                    color: "inherit",
                }}
            >
                SIM 2
            </button>
        </div>
    );
}
