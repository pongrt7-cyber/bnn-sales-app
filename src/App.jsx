import { useState, useEffect } from "react";
import { db } from "./firebase";
import { ref, onValue, set, remove, push } from "firebase/database";

const DB_SALES = "sales_summary";
const DB_LOGS = "activity_logs";
const DB_CONFIG = "app_config";

// ค่าเริ่มต้นตอนเปิดแอปครั้งแรก (จะถูกเซฟลง Firebase ตอนแอดมินกดบันทึก)
const DEFAULT_CONFIG = {
  branchName: "BNN big c บ้านดู่ (790)",
  salesFields: [
    { id: "iphone", label: "iPhone" },
    { id: "appIn", label: "App in" },
    { id: "approve", label: "Approve" },
    { id: "reject", label: "Reject" },
    { id: "tradeIn", label: "Trade in" },
    { id: "buy", label: "Buy" }
  ],
  teamMembers: [
    { id: "p1", name: "1. PIA : แป้ง", isPIA: true },
    { id: "p2", name: "1. PIA : แอม", isPIA: true },
    { id: "f", name: "1. ฝ้าย PC / Brand: oppo", isPIA: false },
    { id: "i", name: "2. ไอซ์ PC / Brand: Samsung", isPIA: false },
    { id: "p", name: "3. ปัน pc/ Brand: Xiaomi", isPIA: false },
    { id: "n", name: "4. นิด pc ทรู เบอร์", isPIA: false },
    { id: "k", name: "5. กิ้ว SP", isPIA: false },
    { id: "po", name: "5. part-time: พง", isPIA: false },
    { id: "b", name: "6. part-time: บาส", isPIA: false }
  ]
};

function getTodayISO() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}
function getTodayTH() {
  const now = new Date();
  return `${String(now.getDate()).padStart(2, "0")}/${String(now.getMonth() + 1).padStart(2, "0")}/${now.getFullYear() + 543}`;
}
function getTimeTH() {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}:${String(now.getSeconds()).padStart(2, "0")}`;
}

export default function App() {
  const [activeTab, setActiveTab] = useState("main");
  const [isAdmin, setIsAdmin] = useState(false);
  const [config, setConfig] = useState(DEFAULT_CONFIG);

  // ===== STATE: หน้าหลัก (Sales) =====
  const [totals, setTotals] = useState(null);
  const [notes, setNotes] = useState([]);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);
  const [flash, setFlash] = useState(false);
  const [salesInputs, setSalesInputs] = useState({});
  const [inputNote, setInputNote] = useState("");

  // ===== STATE: หน้าสรุปยอดทีม (Team) =====
  const [teamMeta, setTeamMeta] = useState({ staff: 7, pia: 1, ss: 1, pt: 1, pc: 3, pctrue: 1, target: 8 });
  const [teamData, setTeamData] = useState({});
  const [teamCopied, setTeamCopied] = useState(false);

  // ===== STATE: หน้าแอดมิน (Admin) =====
  const [adminBranch, setAdminBranch] = useState("");
  const [newFieldName, setNewFieldName] = useState("");
  const [newTeamName, setNewTeamName] = useState("");
  const [newTeamIsPIA, setNewTeamIsPIA] = useState(false);

  useEffect(() => {
    let loaded = 0;
    const check = () => { loaded++; if (loaded >= 3) setLoading(false); };

    // 1. ดึง Config
    const unsubConfig = onValue(ref(db, DB_CONFIG), snap => {
      const d = snap.val();
      if (d) {
        setConfig(d);
        setAdminBranch(d.branchName);
      } else {
        setAdminBranch(DEFAULT_CONFIG.branchName);
      }
      check();
    }, () => check());

    // 2. ดึง Sales
    const unsubSales = onValue(ref(db, DB_SALES), snap => {
      const d = snap.val();
      if (d) {
        if (d.dateISO && d.dateISO !== getTodayISO()) {
          remove(ref(db, DB_SALES));
          remove(ref(db, DB_LOGS));
          setTotals(null); setNotes([]); setLogs([]);
        } else {
          if (d.totals) setTotals(d.totals);
          if (d.notes) setNotes(d.notes || []);
        }
      } else {
        setTotals(null); setNotes([]);
      }
      check();
    }, () => check());

    // 3. ดึง Logs
    const unsubLogs = onValue(ref(db, DB_LOGS), snap => {
      const d = snap.val();
      if (d) setLogs(Object.values(d).sort((a, b) => b.ts - a.ts));
      else setLogs([]);
      check();
    }, () => check());

    return () => { unsubConfig(); unsubSales(); unsubLogs(); };
  }, []);

  // -------------------------------------------------------------
  // ระบบ Sales Summary (หน้า 1)
  // -------------------------------------------------------------
  const saveAllSales = async (newTotals, newNotes) => {
    setSaving(true);
    try {
      await set(ref(db, DB_SALES), { dateISO: getTodayISO(), date: getTodayTH(), totals: newTotals, notes: newNotes });
    } catch (e) { console.error(e); } finally { setSaving(false); }
  };

  const handleUpdateSales = async () => {
    const base = totals ?? {};
    const newTotals = { ...base };
    const changes = [];

    config.salesFields.forEach(({ id, label }) => {
      const inputVal = parseInt(salesInputs[id]) || 0;
      if (inputVal !== 0) {
        const currentTotal = base[id] || 0;
        const newTotal = Math.max(0, currentTotal + inputVal);
        if (newTotal - currentTotal !== 0) {
          newTotals[id] = newTotal;
          changes.push({ label, delta: newTotal - currentTotal });
        }
      }
    });

    const newNotes = inputNote.trim() ? [...notes, { id: Date.now(), text: inputNote.trim() }] : notes;
    setTotals(newTotals); setNotes(newNotes);
    setSalesInputs({});
    setInputNote("");
    setFlash(true); setTimeout(() => setFlash(false), 600);

    await saveAllSales(newTotals, newNotes);
    if (changes.length > 0) {
      await push(ref(db, DB_LOGS), { ts: Date.now(), time: getTimeTH(), dateISO: getTodayISO(), date: getTodayTH(), changes, note: inputNote.trim() });
    }
  };

  const formatSalesSummary = () => {
    const t = totals || {};
    let s = "";
    config.salesFields.forEach(f => {
      s += `${f.label} = ${t[f.id] || 0}\n`;
    });
    if (notes.length > 0) {
      s += `\n` + notes.map(n => n.text).join("\n");
    }
    return s.trim();
  };

  const handleSendLine = async () => {
    if (!totals) return;
    setSending(true);
    try {
      await fetch("https://bnn-sales-app.vercel.app/api/send-line", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: formatSalesSummary() }),
      });
      setSent(true); setTimeout(() => setSent(false), 3000);
    } catch (e) { alert("ส่งไม่สำเร็จ"); } finally { setSending(false); }
  };

  // -------------------------------------------------------------
  // ระบบ Team Report (หน้า 2)
  // -------------------------------------------------------------
  const chgTeam = (key, delta) => setTeamData(p => ({ ...p, [key]: Math.max(0, (parseInt(p[key]) || 0) + delta) }));

  const getTeamTotals = () => {
    let tin = 0, tapp = 0, pcSum = 0;
    config.teamMembers.forEach(m => {
      if (m.isPIA) {
        tin += (teamData[`${m.id}_i_in`] || 0) + (teamData[`${m.id}_s_in`] || 0);
        tapp += (teamData[`${m.id}_i_app`] || 0) + (teamData[`${m.id}_s_app`] || 0);
      } else {
        tin += (teamData[`${m.id}_in`] || 0);
        tapp += (teamData[`${m.id}_app`] || 0);
        pcSum += (teamData[`${m.id}_in`] || 0);
      }
    });
    return { tin, tapp, pcSum };
  };

  const generateTeamReport = () => {
    const { tin, tapp, pcSum } = getTeamTotals();
    let s = `ชื่อร้าน : ${config.branchName}\n`;
    s += `จำนวนคนมาทำงาน : ${teamMeta.staff}\nPIA : ${teamMeta.pia}\nSuper sale: ${teamMeta.ss}\nPart-time: ${teamMeta.pt}\nPC : ${teamMeta.pc}\nPc ทรู : ${teamMeta.pctrue}\n\n`;

    config.teamMembers.forEach(m => {
      if (m.isPIA) {
        s += `${m.name}\n`;
        s += `💚App in iPhone ${(teamData[`${m.id}_i_in`] || 0)}: App in =${(teamData[`${m.id}_i_in`] || 0)} / Approve =${(teamData[`${m.id}_i_app`] || 0)}\n`;
        s += `🧡App in SMP ${(teamData[`${m.id}_s_in`] || 0)} : App in ${(teamData[`${m.id}_s_in`] || 0)}/Approve ${(teamData[`${m.id}_s_app`] || 0)}\n\n`;
      }
    });

    s += `…….\n📊PC Brand App in ${pcSum}\n\n`;

    config.teamMembers.forEach(m => {
      if (!m.isPIA) {
        s += `${m.name}\nApp in = ${(teamData[`${m.id}_in`] || 0)} / Approve =${(teamData[`${m.id}_app`] || 0)}\n\n`;
      }
    });

    s += `🔺Total App in Target Today = ${teamMeta.target}\n▪️Total App in Today = ${tin}\n▪️Total Approve Today = ${tapp}`;
    return s;
  };

  // -------------------------------------------------------------
  // ระบบ Admin (หน้า 3 เมนูลับ)
  // -------------------------------------------------------------
  const triggerAdminLogin = () => {
    if (isAdmin) return;
    const pin = window.prompt("🔒 ระบุรหัสผ่าน Admin:");
    if (pin === "9999") { // <-- เปลี่ยนรหัสผ่านตรงนี้ได้เลยครับ bro!
      setIsAdmin(true);
      setActiveTab("admin");
    } else if (pin !== null) {
      alert("รหัสผ่านไม่ถูกต้อง!");
    }
  };

  const saveConfigToDB = async (newConfig) => {
    setConfig(newConfig);
    await set(ref(db, DB_CONFIG), newConfig);
    alert("บันทึกการตั้งค่าแล้ว!");
  };

  const adminAddField = () => {
    if (!newFieldName.trim()) return;
    const newConfig = { ...config, salesFields: [...config.salesFields, { id: `f_${Date.now()}`, label: newFieldName.trim() }] };
    saveConfigToDB(newConfig);
    setNewFieldName("");
  };

  const adminRemoveField = (id) => {
    if (!window.confirm("ยืนยันการลบหัวข้อนี้?")) return;
    const newConfig = { ...config, salesFields: config.salesFields.filter(f => f.id !== id) };
    saveConfigToDB(newConfig);
  };

  const adminAddTeam = () => {
    if (!newTeamName.trim()) return;
    const newConfig = { ...config, teamMembers: [...config.teamMembers, { id: `tm_${Date.now()}`, name: newTeamName.trim(), isPIA: newTeamIsPIA }] };
    saveConfigToDB(newConfig);
    setNewTeamName("");
  };

  const adminRemoveTeam = (id) => {
    if (!window.confirm("ยืนยันการลบพนักงานคนนี้?")) return;
    const newConfig = { ...config, teamMembers: config.teamMembers.filter(m => m.id !== id) };
    saveConfigToDB(newConfig);
  };


  if (loading) return <div style={{ minHeight: "100vh", background: "#e0e7ff", display: "flex", alignItems: "center", justifyContent: "center" }}>กำลังโหลดข้อมูล...</div>;

  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(135deg,#e0e7ff 0%,#f0f4ff 50%,#fce7f3 100%)", fontFamily: "'Sarabun','Segoe UI',sans-serif", display: "flex", flexDirection: "column", alignItems: "center", padding: "20px 16px 40px", color: "#1e293b" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Sarabun:wght@300;400;600;700&display=swap');
        *{box-sizing:border-box;} input[type=number]::-webkit-inner-spin-button,input[type=number]::-webkit-outer-spin-button{-webkit-appearance:none;margin:0;}
        .glass{background:rgba(255,255,255,0.65);border:1px solid rgba(255,255,255,0.85);border-radius:20px;backdrop-filter:blur(20px);box-shadow:0 8px 32px rgba(100,120,200,0.1); margin-bottom: 16px; padding: 16px;}
        .tab-bar{display:flex;background:rgba(255,255,255,0.5);padding:4px;border-radius:30px;border:1px solid rgba(200,210,240,0.8);margin-bottom:16px;width:100%;max-width:460px;}
        .tab-btn{flex:1;padding:8px 12px;border:none;border-radius:25px;font-family:'Sarabun',sans-serif;font-size:13px;font-weight:700;cursor:pointer;color:#64748b;background:transparent;}
        .tab-btn.active{background:#4f46e5;color:#fff;box-shadow:0 2px 10px rgba(79,70,229,0.3);}
        .step-btn{background:rgba(255,255,255,0.8);border:1px solid rgba(200,210,240,0.9);color:#4f46e5;width:30px;height:30px;border-radius:8px;cursor:pointer;font-size:16px;display:flex;align-items:center;justify-content:center;}
        .num-input{background:rgba(255,255,255,0.8);border:1px solid rgba(200,210,240,0.9);border-radius:8px;color:#1e293b;font-size:15px;font-weight:700;text-align:center;width:44px;height:30px;}
        .update-btn{background:rgba(99,102,241,0.9);border:none;color:#fff;font-size:15px;font-weight:700;padding:13px 52px;border-radius:50px;cursor:pointer;width:100%;max-width:460px;}
        .field-row{display:flex;align-items:center;justify-content:space-between;padding:6px 8px;border-radius:8px; margin-bottom: 6px;}
        .admin-row{display:flex; justify-content:space-between; align-items:center; background:rgba(255,255,255,0.5); padding:8px 12px; border-radius:8px; margin-bottom:8px; border:1px solid rgba(200,210,240,0.8);}
        .del-btn{background:#ef4444; color:#fff; border:none; border-radius:6px; padding:4px 8px; font-size:12px; cursor:pointer;}
        .add-input{width:100%; padding:8px 12px; border-radius:8px; border:1px solid #c7d2fe; font-family:'Sarabun'; margin-bottom:8px;}
        .add-btn{background:#22c55e; color:#fff; border:none; padding:8px 12px; border-radius:8px; cursor:pointer; font-weight:700;}
      `}</style>

      {/* HEADER TAB */}
      <div className="tab-bar">
        <button className={`tab-btn ${activeTab === "main" ? "active" : ""}`} onClick={() => setActiveTab("main")}>Sales Summary</button>
        <button className={`tab-btn ${activeTab === "team" ? "active" : ""}`} onClick={() => setActiveTab("team")}>สรุปยอดทีม</button>
        {isAdmin && <button className={`tab-btn ${activeTab === "admin" ? "active" : ""}`} onClick={() => setActiveTab("admin")}>⚙️ Admin</button>}
      </div>

      <div style={{ width: "100%", maxWidth: 460, textAlign: "center", marginBottom: 16 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: "#3730a3" }}>{activeTab === 'team' ? "กรอกยอดทีม" : activeTab === 'admin' ? "ตั้งค่าระบบ" : "Sales Summary"}</h1>
        <div style={{ fontSize: 12, color: "#6366f1", fontWeight: 600 }}>{config.branchName}</div>
      </div>

      {/* ==================== TAB 1: SALES ==================== */}
      {activeTab === "main" && (
        <div style={{ width: "100%", maxWidth: 460 }}>
          <div className="glass">
            <div style={{ fontSize: 12, fontWeight: 700, color: "#4f46e5", marginBottom: 12 }}>กรอกยอดประจำวัน</div>
            {config.salesFields.map(f => (
              <div key={f.id} className="field-row">
                <span style={{ fontSize: 14, fontWeight: 600 }}>{f.label}</span>
                <div style={{ display: "flex", gap: 6 }}>
                  <button className="step-btn" onClick={() => setSalesInputs(p => ({ ...p, [f.id]: Math.max(0, (parseInt(p[f.id]) || 0) - 1) }))}>−</button>
                  <input className="num-input" type="number" value={salesInputs[f.id] || 0} onChange={e => setSalesInputs(p => ({ ...p, [f.id]: parseInt(e.target.value) || 0 }))} />
                  <button className="step-btn" onClick={() => setSalesInputs(p => ({ ...p, [f.id]: Math.max(0, (parseInt(p[f.id]) || 0) + 1) }))}>+</button>
                </div>
              </div>
            ))}
            <hr style={{ borderTop: "1px solid rgba(200,210,240,0.5)", margin: "12px 0" }} />
            <textarea style={{ width: "100%", padding: "10px", borderRadius: "8px", border: "1px solid #c7d2fe", fontFamily: "Sarabun" }} placeholder="หมายเหตุ..." value={inputNote} onChange={e => setInputNote(e.target.value)} />
          </div>

          <button className="update-btn" onClick={handleUpdateSales} style={{ marginBottom: 16 }}>UPDATE ยอดขาย</button>

          <div className="glass">
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: "#4f46e5" }}>สรุปยอด {saving && "..."}</span>
              <button style={{ background: "#e0e7ff", border: "none", borderRadius: "8px", padding: "4px 10px", color: "#4f46e5", fontWeight: 700 }} onClick={() => {
                navigator.clipboard.writeText(formatSalesSummary());
                setCopied(true); setTimeout(() => setCopied(false), 2000);
              }}>{copied ? "คัดลอกแล้ว" : "คัดลอก"}</button>
            </div>
            <div style={{ background: "rgba(255,255,255,0.5)", padding: "12px", borderRadius: "10px", whiteSpace: "pre-wrap", fontSize: 13 }}>
              {totals ? formatSalesSummary() : <span style={{ color: "#94a3b8" }}>ยังไม่มีข้อมูล</span>}
            </div>
          </div>
        </div>
      )}

      {/* ==================== TAB 2: TEAM ==================== */}
      {activeTab === "team" && (
        <div style={{ width: "100%", maxWidth: 460 }}>
          <div className="glass">
            <div style={{ fontSize: 12, fontWeight: 700, color: "#4f46e5", marginBottom: 12 }}>ข้อมูลพนักงาน (ตั้งค่า)</div>
            {[{ k: "staff", l: "คนมาทำงาน" }, { k: "pia", l: "PIA" }, { k: "ss", l: "Super sale" }, { k: "pt", l: "Part-time" }, { k: "pc", l: "PC" }, { k: "pctrue", l: "Pc ทรู" }, { k: "target", l: "Target Today" }].map(m => (
              <div key={m.k} className="field-row">
                <span style={{ fontSize: 13, fontWeight: 600 }}>{m.l}</span>
                <div style={{ display: "flex", gap: 6 }}>
                  <button className="step-btn" onClick={() => setTeamMeta(p => ({ ...p, [m.k]: Math.max(0, p[m.k] - 1) }))}>−</button>
                  <input className="num-input" type="number" value={teamMeta[m.k]} onChange={e => setTeamMeta(p => ({ ...p, [m.k]: parseInt(e.target.value) || 0 }))} />
                  <button className="step-btn" onClick={() => setTeamMeta(p => ({ ...p, [m.k]: Math.max(0, p[m.k] + 1) }))}>+</button>
                </div>
              </div>
            ))}
          </div>

          {config.teamMembers.map(m => (
            <div key={m.id} className="glass" style={{ padding: "12px" }}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>{m.name} <span style={{ fontSize: 10, background: m.isPIA ? "#dcfce7" : "#fef3c7", padding: "2px 6px", borderRadius: "4px" }}>{m.isPIA ? "PIA" : "PC"}</span></div>

              {m.isPIA ? (
                <>
                  <div className="field-row">
                    <span style={{ fontSize: 12 }}>iPhone (In/App)</span>
                    <div style={{ display: "flex", gap: 4 }}>
                      <button className="step-btn" onClick={() => chgTeam(`${m.id}_i_in`, -1)}>−</button><input className="num-input" value={teamData[`${m.id}_i_in`] || 0} readOnly /><button className="step-btn" onClick={() => chgTeam(`${m.id}_i_in`, 1)}>+</button>
                      <button className="step-btn" onClick={() => chgTeam(`${m.id}_i_app`, -1)}>−</button><input className="num-input" value={teamData[`${m.id}_i_app`] || 0} readOnly /><button className="step-btn" onClick={() => chgTeam(`${m.id}_i_app`, 1)}>+</button>
                    </div>
                  </div>
                  <div className="field-row">
                    <span style={{ fontSize: 12 }}>SMP (In/App)</span>
                    <div style={{ display: "flex", gap: 4 }}>
                      <button className="step-btn" onClick={() => chgTeam(`${m.id}_s_in`, -1)}>−</button><input className="num-input" value={teamData[`${m.id}_s_in`] || 0} readOnly /><button className="step-btn" onClick={() => chgTeam(`${m.id}_s_in`, 1)}>+</button>
                      <button className="step-btn" onClick={() => chgTeam(`${m.id}_s_app`, -1)}>−</button><input className="num-input" value={teamData[`${m.id}_s_app`] || 0} readOnly /><button className="step-btn" onClick={() => chgTeam(`${m.id}_s_app`, 1)}>+</button>
                    </div>
                  </div>
                </>
              ) : (
                <div className="field-row">
                  <span style={{ fontSize: 12 }}>ยอด (In/App)</span>
                  <div style={{ display: "flex", gap: 4 }}>
                    <button className="step-btn" onClick={() => chgTeam(`${m.id}_in`, -1)}>−</button><input className="num-input" value={teamData[`${m.id}_in`] || 0} readOnly /><button className="step-btn" onClick={() => chgTeam(`${m.id}_in`, 1)}>+</button>
                    <button className="step-btn" onClick={() => chgTeam(`${m.id}_app`, -1)}>−</button><input className="num-input" value={teamData[`${m.id}_app`] || 0} readOnly /><button className="step-btn" onClick={() => chgTeam(`${m.id}_app`, 1)}>+</button>
                  </div>
                </div>
              )}
            </div>
          ))}

          <button className="update-btn" onClick={() => {
            navigator.clipboard.writeText(generateTeamReport());
            setTeamCopied(true); setTimeout(() => setTeamCopied(false), 2000);
          }} style={{ marginBottom: 16, background: teamCopied ? "#22c55e" : "#4f46e5" }}>
            {teamCopied ? "✓ คัดลอกข้อความแล้ว" : "📋 Copy ข้อความส่งงาน"}
          </button>
        </div>
      )}

      {/* ==================== TAB 3: ADMIN (เมนูลับ) ==================== */}
      {activeTab === "admin" && isAdmin && (
        <div style={{ width: "100%", maxWidth: 460 }}>

          <div className="glass">
            <h3 style={{ margin: "0 0 12px 0", color: "#3730a3", fontSize: 16 }}>🏢 1. แก้ไขชื่อสาขา</h3>
            <input className="add-input" value={adminBranch} onChange={e => setAdminBranch(e.target.value)} />
            <button className="add-btn" onClick={() => saveConfigToDB({ ...config, branchName: adminBranch })}>บันทึกชื่อสาขา</button>
          </div>

          <div className="glass">
            <h3 style={{ margin: "0 0 12px 0", color: "#3730a3", fontSize: 16 }}>📋 2. หัวข้อยอดขายหน้าแรก</h3>
            {config.salesFields.map(f => (
              <div key={f.id} className="admin-row">
                <span style={{ fontWeight: 600 }}>{f.label}</span>
                <button className="del-btn" onClick={() => adminRemoveField(f.id)}>ลบ</button>
              </div>
            ))}
            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              <input className="add-input" style={{ marginBottom: 0 }} placeholder="เพิ่มหัวข้อใหม่..." value={newFieldName} onChange={e => setNewFieldName(e.target.value)} />
              <button className="add-btn" onClick={adminAddField}>เพิ่ม</button>
            </div>
          </div>

          <div className="glass">
            <h3 style={{ margin: "0 0 12px 0", color: "#3730a3", fontSize: 16 }}>👥 3. จัดการรายชื่อพนักงาน</h3>
            {config.teamMembers.map(m => (
              <div key={m.id} className="admin-row">
                <div>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{m.name}</div>
                  <div style={{ fontSize: 11, color: "#64748b" }}>แผนก: {m.isPIA ? "PIA" : "PC / Part-time"}</div>
                </div>
                <button className="del-btn" onClick={() => adminRemoveTeam(m.id)}>ลบ</button>
              </div>
            ))}
            <div style={{ marginTop: 12, padding: "12px", background: "rgba(255,255,255,0.5)", borderRadius: "8px" }}>
              <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4 }}>เพิ่มพนักงานใหม่</div>
              <input className="add-input" placeholder="พิมพ์ชื่อพนักงาน..." value={newTeamName} onChange={e => setNewTeamName(e.target.value)} />
              <div style={{ display: "flex", gap: 8 }}>
                <select className="add-input" style={{ marginBottom: 0 }} value={newTeamIsPIA} onChange={e => setNewTeamIsPIA(e.target.value === "true")}>
                  <option value="false">PC / Part-time / SP</option>
                  <option value="true">PIA</option>
                </select>
                <button className="add-btn" onClick={adminAddTeam}>เพิ่มคน</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* FOOTER สำหรับกดเข้าเมนูลับ */}
      <div
        onClick={triggerAdminLogin}
        style={{ marginTop: 24, fontSize: 11, color: "#94a3b8", textAlign: "center", cursor: "pointer", padding: "10px" }}
      >
        BNN Sales Summary App v3.0
      </div>
    </div>
  );
}