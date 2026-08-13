import { useState } from "react";

const POSITIONS = ["PIA", "PC Brand", "PC True", "SP", "Part-time"];

export default function AdminTeamManager({ teamMembers, onSave }) {
  const [pendingTeamMembers, setPendingTeamMembers] = useState(
    teamMembers.map((m) => ({ ...m, position: m.position || "PC Brand" }))
  );

  const updateMember = (id, field, value) => {
    setPendingTeamMembers((prev) =>
      prev.map((m) => (m.id === id ? { ...m, [field]: value } : m))
    );
  };

  const move = (index, direction) => {
    const member = pendingTeamMembers[index];
    const categoryMembers = pendingTeamMembers.filter(
      (m) => m.position === member.position
    );
    const categoryIndex = categoryMembers.indexOf(member);

    if (
      (direction === -1 && categoryIndex === 0) ||
      (direction === 1 && categoryIndex === categoryMembers.length - 1)
    )
      return;

    const newMembers = [...pendingTeamMembers];
    const targetCategoryIndex = categoryIndex + direction;
    const targetMember = categoryMembers[targetCategoryIndex];
    const targetIndex = newMembers.indexOf(targetMember);

    [newMembers[index], newMembers[targetIndex]] = [
      newMembers[targetIndex],
      newMembers[index],
    ];
    setPendingTeamMembers(newMembers);
  };

  const grouped = POSITIONS.reduce((acc, pos) => {
    acc[pos] = pendingTeamMembers.filter((m) => m.position === pos);
    return acc;
  }, {});

  return (
    <div style={{ width: "100%" }}>
      {POSITIONS.map((pos) => (
        <div key={pos} style={{ marginBottom: "20px" }}>
          <h4 style={{ margin: "0 0 10px 0", color: "#4f46e5" }}>{pos}</h4>
          {grouped[pos].map((m, i) => {
            const index = pendingTeamMembers.indexOf(m);
            return (
              <div key={m.id} className="admin-row" style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                <span style={{ minWidth: "20px", fontWeight: 700 }}>{i + 1}.</span>
                <input
                  className="add-input"
                  style={{ marginBottom: 0, flex: 1 }}
                  value={m.name}
                  onChange={(e) => updateMember(m.id, "name", e.target.value)}
                />
                <select
                  className="add-input"
                  style={{ marginBottom: 0, width: "100px" }}
                  value={m.position}
                  onChange={(e) => updateMember(m.id, "position", e.target.value)}
                >
                  {POSITIONS.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
                <button className="step-btn" onClick={() => move(index, -1)}>↑</button>
                <button className="step-btn" onClick={() => move(index, 1)}>↓</button>
              </div>
            );
          })}
        </div>
      ))}
      <button className="update-btn" style={{ marginTop: "20px" }} onClick={() => onSave(pendingTeamMembers)}>
        บันทึกการเปลี่ยนแปลง
      </button>
    </div>
  );
}
