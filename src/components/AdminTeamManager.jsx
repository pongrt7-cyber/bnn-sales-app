import { useState } from "react";

const POSITIONS = ["PIA (พนักงานร้าน)", "PC Brand", "PC True", "Part-time"];

export default function AdminTeamManager({ teamMembers, onSave }) {
  const [pendingTeamMembers, setPendingTeamMembers] = useState(
    teamMembers.map((m) => {
      let pos = m.position || "PC Brand";
      // Merge SP into PIA
      if (pos === "SP") pos = POSITIONS[0];
      if (pos === "PIA") pos = POSITIONS[0];
      return { ...m, position: pos };
    })
  );
  const [newName, setNewName] = useState("");
  const [newPos, setNewPos] = useState(POSITIONS[0]);

  const updateMember = (id, field, value) => {
    setPendingTeamMembers((prev) =>
      prev.map((m) => (m.id === id ? { ...m, [field]: value } : m))
    );
  };

  const deleteMember = (id) => {
    if (!window.confirm("ยืนยันการลบพนักงานคนนี้?")) return;
    setPendingTeamMembers(prev => prev.filter(m => m.id !== id));
  };

  const addMember = () => {
    if (!newName.trim()) return;
    setPendingTeamMembers(prev => [...prev, { id: `tm_${Date.now()}`, name: newName.trim(), position: newPos }]);
    setNewName("");
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
                <button className="del-btn" style={{ height: "30px" }} onClick={() => deleteMember(m.id)}>ลบ</button>
              </div>
            );
          })}
        </div>
      ))}
      
      <div className="admin-row" style={{ marginTop: "20px", flexDirection: "column", gap: "10px", padding: "15px" }}>
        <input
          className="add-input"
          style={{ marginBottom: 0 }}
          placeholder="ชื่อพนักงานใหม่..."
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
        />
        <div style={{ display: "flex", gap: "8px", width: "100%" }}>
          <select
            className="add-input"
            style={{ marginBottom: 0, flex: 1 }}
            value={newPos}
            onChange={(e) => setNewPos(e.target.value)}
          >
            {POSITIONS.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
          <button className="add-btn" style={{ padding: "0 20px" }} onClick={addMember}>เพิ่ม</button>
        </div>
      </div>

      <button className="update-btn" style={{ marginTop: "20px" }} onClick={() => onSave(pendingTeamMembers)}>
        บันทึกการเปลี่ยนแปลง
      </button>
    </div>
  );
}
