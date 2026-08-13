import { useState, useEffect } from "react";
import { db } from "./firebase";
import { ref, onValue, set, remove, push } from "firebase/database";
import AdminTeamManager from "./components/AdminTeamManager";

const DB_SALES = "sales_summary";
const DB_LOGS = "activity_logs";
const DB_CONFIG = "app_config";
const ADMIN_PIN = "9999"; // เปลี่ยนรหัสตรงนี้

const DEFAULT_CONFIG = {
  branchName: "BNN big c บ้านดู่ (790)",
  salesFields: [
    { id: "iphone", label: "iPhone" },
    { id: "appIn", label: "App in" },
    { id: "approve", label: "Approve" },
    { id: "reject", label: "Reject" },
    { id: "tradeIn", label: "Trade in" },
    { id: "buy", label: "Buy" },
  ],
  teamMembers: [
    { id: "p1", name: "แป้ง", position: "PIA (พนักงานร้าน)" },
    { id: "p2", name: "แอม", position: "PIA (พนักงานร้าน)" },
    { id: "f", name: "ฝ้าย", position: "PC Brand" },
    { id: "i", name: "ไอซ์", position: "PC Brand" },
    { id: "p", name: "ปัน", position: "PC Brand" },
    { id: "n", name: "นิด", position: "PC True" },
    { id: "k", name: "กิ้ว", position: "PIA (พนักงานร้าน)" },
    { id: "po", name: "พง", position: "Part-time" },
    { id: "b", name: "บาส", position: "Part-time" },
  ],
};

const getTodayISO = () => {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`;
};
const getTodayTH = () => {
  const n = new Date();
  return `${String(n.getDate()).padStart(2, "0")}/${String(n.getMonth() + 1).padStart(2, "0")}/${n.getFullYear() + 543}`;
};
const getTimeTH = () => {
  const n = new Date();
  return `${String(n.getHours()).padStart(2, "0")}:${String(n.getMinutes()).padStart(2, "0")}:${String(n.getSeconds()).padStart(2, "0")}`;
};

export default function App() {
  const [activeTab, setActiveTab] = useState("main");
  const [isAdmin, setIsAdmin] = useState(false);
  const [config, setConfig] = useState(DEFAULT_CONFIG);

  // ---- Sales ----
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

  // ---- Team ----
  const [teamMeta, setTeamMeta] = useState({ staff: 7, pia: 1, ss: 1, pt: 1, pc: 3, pctrue: 1, target: 8 });
  const [teamData, setTeamData] = useState({});
  const [teamCopied, setTeamCopied] = useState(false);

  // ---- Admin ----
  const [adminBranch, setAdminBranch] = useState("");
  const [newFieldName, setNewFieldName] = useState("");

  useEffect(() => {
    let loaded = 0;
    const check = () => { loaded++; if (loaded >= 3) setLoading(false); };

    const unsubConfig = onValue(ref(db, DB_CONFIG), snap => {
      const d = snap.val();
      if (d) { setConfig(d); setAdminBranch(d.branchName); }
      else setAdminBranch(DEFAULT_CONFIG.branchName);
      check();
    }, () => check());

    const unsubSales = onValue(ref(db, DB_SALES), snap => {
      const d = snap.val();
      if (d) {
        if (d.dateISO && d.dateISO !== getTodayISO()) {
          remove(ref(db, DB_SALES)); remove(ref(db, DB_LOGS));
          setTotals(null); setNotes([]); setLogs([]);
        } else {
          setTotals(d.totals || null); setNotes(d.notes || []);
        }
      } else { setTotals(null); setNotes([]); }
      check();
    }, () => check());

    const unsubLogs = onValue(ref(db, DB_LOGS), snap => {
      const d = snap.val();
      setLogs(d ? Object.values(d).sort((a, b) => b.ts - a.ts) : []);
      check();
    }, () => check());

    return () => { unsubConfig(); unsubSales(); unsubLogs(); };
  }, []);

  // ---- Sales logic ----
  const saveAllSales = async (newTotals, newNotes) => {
    setSaving(true);
    try { await set(ref(db, DB_SALES), { dateISO: getTodayISO(), date: getTodayTH(), totals: newTotals, notes: newNotes }); }
    catch (e) { console.error(e); } finally { setSaving(false); }
  };

  const step = (id, delta) => setSalesInputs(p => ({ ...p, [id]: (parseInt(p[id]) || 0) + delta }));
  const handleInputChange = (id, val) => setSalesInputs(p => ({ ...p, [id]: isNaN(parseInt(val)) && val !== "-" ? 0 : val }));

  const handleUpdateSales = async () => {
    const base = totals ?? {};
    const newTotals = { ...base };
    const changes = [];

    config.salesFields.forEach(({ id, label }) => {
      const inputVal = parseInt(salesInputs[id]) || 0;
      if (inputVal !== 0) {
        const currentTotal = base[id] || 0;
        const newTotal = Math.max(0, currentTotal + inputVal);
        const delta = newTotal - currentTotal;
        if (delta !== 0) { newTotals[id] = newTotal; changes.push({ label, delta }); }
      }
    });

    const newNotes = inputNote.trim() ? [...notes, { id: Date.now(), text: inputNote.trim() }] : notes;
    setTotals(newTotals); setNotes(newNotes);
    setSalesInputs({}); setInputNote("");
    setFlash(true); setTimeout(() => setFlash(false), 600);

    await saveAllSales(newTotals, newNotes);
    if (changes.length > 0) {
      await push(ref(db, DB_LOGS), { ts: Date.now(), time: getTimeTH(), dateISO: getTodayISO(), date: getTodayTH(), changes, note: inputNote.trim() });
    }
  };

  const handleResetSales = async () => {
    if (!window.confirm("รีเซ็ตยอดขายวันนี้?")) return;
    setTotals(null); setNotes([]); setLogs([]);
    await remove(ref(db, DB_SALES)); await remove(ref(db, DB_LOGS));
  };

  const handleDeleteNote = async (id) => {
    const n = notes.filter(x => x.id !== id);
    setNotes(n); await saveAllSales(totals, n);
  };

  const formatSalesSummary = () => {
    const t = totals || {};
    let s = config.salesFields.map(f => `${f.label} = ${t[f.id] || 0}`).join("\n");
    if (notes.length > 0) s += `\n\n` + notes.map(n => n.text).join("\n");
    return s.trim();
  };

  const handleCopy = () => {
    if (!totals) return;
    navigator.clipboard.writeText(formatSalesSummary()).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
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

  // ---- Team logic ----
  const chgMeta = (key, delta) => setTeamMeta(p => ({ ...p, [key]: Math.max(0, (parseInt(p[key]) || 0) + delta) }));
  const chgTeam = (key, delta) => setTeamData(p => ({ ...p, [key]: Math.max(0, (parseInt(p[key]) || 0) + delta) }));

  const getTeamTotals = () => {
    let tin = 0, tapp = 0, pcSum = 0;
    config.teamMembers.forEach(m => {
      if (m.position === "PIA (พนักงานร้าน)") {
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
    
    // Auto-calculate staff count
    let activeStaffCount = 0;
    config.teamMembers.forEach(m => {
        let hasActivity = false;
        if (m.position === "PIA (พนักงานร้าน)") {
            if ((teamData[`${m.id}_i_in`] || 0) > 0 || (teamData[`${m.id}_i_app`] || 0) > 0 || (teamData[`${m.id}_s_in`] || 0) > 0 || (teamData[`${m.id}_s_app`] || 0) > 0) hasActivity = true;
        } else {
            if ((teamData[`${m.id}_in`] || 0) > 0 || (teamData[`${m.id}_app`] || 0) > 0) hasActivity = true;
        }
        if (hasActivity) activeStaffCount++;
    });

    let s = `ID ร้าน :790\nชื่อร้าน : ${config.branchName}\n`;
    s += `จำนวนคนมาทำงาน : ${activeStaffCount}\n\n`;
    
    // Group PIA/SP
    const pias = config.teamMembers.filter(m => m.position === "PIA (พนักงานร้าน)");
    s += `PIA (พนักงานร้าน)\n`;
    pias.forEach((m, idx) => {
        s += `${idx + 1}. ${m.name}\n`;
        s += `App in iPhone ${teamData[`${m.id}_i_in`] || 0}: App in =${teamData[`${m.id}_i_in`] || 0} / Approve =${teamData[`${m.id}_i_app`] || 0}\n`;
        s += `App in SMP ${teamData[`${m.id}_s_in`] || 0} : App in ${teamData[`${m.id}_s_in`] || 0}/Approve ${teamData[`${m.id}_s_app`] || 0}\n\n`;
    });

    s += `…….\nPC Brand App in ${pcSum}\n\n`;
    
    // Group PC
    const pcs = config.teamMembers.filter(m => m.position !== "PIA (พนักงานร้าน)");
    pcs.forEach((m, idx) => {
        s += `${idx + 1}. ${m.name}\nApp in = ${teamData[`${m.id}_in`] || 0} / Approve =${teamData[`${m.id}_app`] || 0}\n\n`;
    });
    
    s += `Total App in Target Today = ${teamMeta.target}\nTotal App in Today = ${tin}\nTotal Approve Today = ${tapp}`;
    return s;
  };

  const copyTeamReport = () => {
    navigator.clipboard.writeText(generateTeamReport()).then(() => { setTeamCopied(true); setTimeout(() => setTeamCopied(false), 2000); });
  };

  const resetTeamData = () => {
    if (!window.confirm("รีเซ็ตข้อมูลทีมทั้งหมด?")) return;
    setTeamMeta({ staff: 0, pia: 0, ss: 0, pt: 0, pc: 0, pctrue: 0, target: 0 });
    setTeamData({});
  };

  // ---- Admin logic ----
  const triggerAdminLogin = () => {
    if (isAdmin) return;
    const pin = window.prompt("🔒 รหัสผ่าน Admin:");
    if (pin === ADMIN_PIN) { setIsAdmin(true); setActiveTab("admin"); }
    else if (pin !== null) alert("รหัสผ่านไม่ถูกต้อง!");
  };

  const saveConfigToDB = async (newConfig) => {
    setConfig(newConfig);
    await set(ref(db, DB_CONFIG), newConfig);
    alert("บันทึกการตั้งค่าแล้ว!");
  };

  const adminAddField = () => {
    if (!newFieldName.trim()) return;
    saveConfigToDB({ ...config, salesFields: [...config.salesFields, { id: `f_${Date.now()}`, label: newFieldName.trim() }] });
    setNewFieldName("");
  };
  const adminRemoveField = (id) => {
    if (!window.confirm("ยืนยันการลบหัวข้อนี้?")) return;
    saveConfigToDB({ ...config, salesFields: config.salesFields.filter(f => f.id !== id) });
  };
  const adminRemoveTeam = (id) => {
    if (!window.confirm("ยืนยันการลบพนักงานคนนี้?")) return;
    saveConfigToDB({ ...config, teamMembers: config.teamMembers.filter(m => m.id !== id) });
  };

  if (loading) return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(135deg,#e0e7ff,#f0f4ff,#fce7f3)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "Sarabun,sans-serif", color: "#64748b", fontSize: 15 }}>
      กำลังโหลดข้อมูล...
    </div>
  );

  const teamTotals = getTeamTotals();

  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(135deg,#e0e7ff 0%,#f0f4ff 50%,#fce7f3 100%)", fontFamily: "'Sarabun','Segoe UI',sans-serif", display: "flex", flexDirection: "column", alignItems: "center", padding: "20px 16px 40px", color: "#1e293b" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Sarabun:wght@300;400;600;700&display=swap');
        *{box-sizing:border-box;}
        input[type=number]::-webkit-inner-spin-button,input[type=number]::-webkit-outer-spin-button{-webkit-appearance:none;margin:0;}
        input[type=number]{-moz-appearance:textfield;}
        .glass{background:rgba(255,255,255,0.65);border:1px solid rgba(255,255,255,0.85);border-radius:20px;backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);box-shadow:0 8px 32px rgba(100,120,200,0.1),0 1px 0 rgba(255,255,255,0.9) inset;padding:18px;margin-bottom:16px;width:100%;max-width:460px;}
        .tab-bar{display:flex;background:rgba(255,255,255,0.5);padding:4px;border-radius:30px;border:1px solid rgba(200,210,240,0.8);margin-bottom:16px;width:100%;max-width:460px;}
        .tab-btn{flex:1;padding:8px 12px;border:none;border-radius:25px;font-family:'Sarabun',sans-serif;font-size:13px;font-weight:700;cursor:pointer;transition:all 0.2s;color:#64748b;background:transparent;}
        .tab-btn.active{background:#4f46e5;color:#fff;box-shadow:0 2px 10px rgba(79,70,229,0.3);}
        .step-btn{background:rgba(255,255,255,0.8);border:1px solid rgba(200,210,240,0.9);color:#4f46e5;width:30px;height:30px;border-radius:8px;cursor:pointer;font-size:16px;display:flex;align-items:center;justify-content:center;transition:background 0.15s,transform 0.1s;user-select:none;box-shadow:0 2px 6px rgba(0,0,0,0.06);flex-shrink:0;}
        .step-btn:hover{background:#fff;transform:scale(1.05);}
        .step-btn:active{transform:scale(0.95);}
        .num-input{background:rgba(255,255,255,0.8);border:1px solid rgba(200,210,240,0.9);border-radius:8px;color:#1e293b;font-size:15px;font-weight:700;text-align:center;width:44px;height:30px;box-shadow:0 1px 4px rgba(0,0,0,0.06) inset;}
        .update-btn{background:rgba(99,102,241,0.9);border:1px solid rgba(255,255,255,0.6);color:#fff;font-size:15px;font-weight:700;padding:13px 52px;border-radius:50px;cursor:pointer;letter-spacing:1px;box-shadow:0 4px 20px rgba(99,102,241,0.35);width:100%;max-width:460px;}
        .line-btn{background:rgba(0,185,0,0.85);border:1px solid rgba(255,255,255,0.6);color:#fff;font-size:15px;font-weight:700;padding:13px 40px;border-radius:50px;cursor:pointer;box-shadow:0 4px 20px rgba(0,185,0,0.3);}
        .copy-btn{background:rgba(255,255,255,0.8);border:1px solid rgba(200,210,240,0.9);color:#4f46e5;padding:7px 14px;border-radius:10px;cursor:pointer;font-size:13px;font-weight:600;}
        .reset-btn{background:rgba(255,255,255,0.5);border:1px solid rgba(239,68,68,0.3);color:#ef4444;padding:7px 14px;border-radius:10px;cursor:pointer;font-size:13px;font-weight:600;}
        .summary-box{background:rgba(255,255,255,0.5);border:1px solid rgba(255,255,255,0.9);border-radius:14px;padding:14px;font-family:'Courier New',monospace;font-size:13px;line-height:1.75;color:#1e293b;white-space:pre-wrap;word-break:break-word;}
        .note-chip{display:flex;align-items:flex-start;gap:8px;background:rgba(255,255,255,0.6);border:1px solid rgba(200,210,240,0.8);border-radius:10px;padding:8px 10px;font-size:13px;color:#334155;margin-bottom:6px;}
        .note-del{background:none;border:none;color:#94a3b8;cursor:pointer;font-size:15px;line-height:1;}
        .textarea-note{background:rgba(255,255,255,0.6);border:1px solid rgba(200,210,240,0.8);border-radius:12px;color:#1e293b;font-size:14px;padding:10px 12px;resize:vertical;width:100%;min-height:52px;font-family:'Sarabun',sans-serif;}
        .section-header{padding:8px 12px;background:rgba(99,102,241,0.08);border-radius:10px;margin-bottom:8px;}
        .field-row{display:flex;align-items:center;justify-content:space-between;padding:6px 8px;border-radius:8px;}
        .field-label{font-size:13px;font-weight:600;color:#334155;}
        .section-divider{border:none;border-top:1px solid rgba(200,210,240,0.5);margin:10px 0;}
        .label-text{font-size:12px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:1px;}
        .save-dot{display:inline-block;width:7px;height:7px;border-radius:50%;background:#22c55e;margin-left:6px;vertical-align:middle;}
        .log-item{background:rgba(255,255,255,0.5);border:1px solid rgba(200,210,240,0.7);border-radius:12px;padding:10px 14px;margin-bottom:8px;}
        .log-time{font-size:12px;font-weight:700;margin-bottom:4px;}
        .log-change{font-size:13px;color:#334155;line-height:1.6;}
        .log-note{font-size:12px;color:#94a3b8;margin-top:2px;}
        .person-card{background:rgba(255,255,255,0.4);border:1px solid rgba(200,210,240,0.6);border-radius:12px;padding:10px;margin-bottom:10px;}
        .person-title{font-size:13px;font-weight:700;color:#334155;margin-bottom:8px;}
        .tag{display:inline-block;padding:2px 6px;border-radius:4px;font-size:10px;font-weight:700;margin-right:4px;}
        .tag-green{background:#dcfce7;color:#15803d;}
        .tag-orange{background:#fef3c7;color:#b45309;}
        .sep{color:#94a3b8;font-size:12px;margin:0 2px;}
        .admin-row{display:flex;justify-content:space-between;align-items:center;background:rgba(255,255,255,0.5);padding:8px 12px;border-radius:8px;margin-bottom:8px;border:1px solid rgba(200,210,240,0.8);}
        .del-btn{background:#ef4444;color:#fff;border:none;border-radius:6px;padding:4px 8px;font-size:12px;cursor:pointer;}
        .add-input{width:100%;padding:8px 12px;border-radius:8px;border:1px solid #c7d2fe;font-family:'Sarabun';margin-bottom:8px;}
        .add-btn{background:#22c55e;color:#fff;border:none;padding:8px 12px;border-radius:8px;cursor:pointer;font-weight:700;}
      `}</style>

      <div className="tab-bar">
        <button className={`tab-btn ${activeTab === "main" ? "active" : ""}`} onClick={() => setActiveTab("main")}>Sales Summary</button>
        <button className={`tab-btn ${activeTab === "team" ? "active" : ""}`} onClick={() => setActiveTab("team")}>สรุปยอดทีม</button>
        {isAdmin && <button className={`tab-btn ${activeTab === "admin" ? "active" : ""}`} onClick={() => setActiveTab("admin")}>⚙️ Admin</button>}
      </div>

      <div style={{ width: "100%", maxWidth: 460, textAlign: "center", marginBottom: 16 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: "#3730a3" }}>
          {activeTab === "team" ? "กรอกยอดทีม" : activeTab === "admin" ? "ตั้งค่าระบบ" : "Sales Summary"}
        </h1>
        <div style={{ fontSize: 11, color: "#6366f1", fontWeight: 600 }}>{config.branchName} · {getTodayTH()}</div>
        {activeTab === "main" && <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>บันทึกอัตโนมัติ · รีเซ็ตทุกวัน</div>}
      </div>

      {/* ================= TAB: SALES ================= */}
      {activeTab === "main" && (
        <>
          <div className="glass">
            <div style={{ paddingLeft: 6, paddingRight: 6, marginBottom: 12 }}>
              <div className="label-text">กรอกยอดประจำวัน</div>
            </div>
            {config.salesFields.map(({ id, label }) => (
              <div key={id} className="field-row">
                <div className="field-label">{label}</div>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <button className="step-btn" onClick={() => step(id, -1)}>−</button>
                  <input className="num-input" type="text" value={salesInputs[id] ?? 0} onChange={e => handleInputChange(id, e.target.value)} />
                  <button className="step-btn" onClick={() => step(id, 1)}>+</button>
                </div>
              </div>
            ))}
            <hr className="section-divider" />
            <div style={{ paddingLeft: 6, paddingRight: 6 }}>
              <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 6 }}>หมายเหตุ (ถ้ามี)</div>
              <textarea className="textarea-note" placeholder="พิมพ์หมายเหตุที่นี่..." value={inputNote} onChange={e => setInputNote(e.target.value)} />
            </div>
          </div>

          <button className="update-btn" onClick={handleUpdateSales} style={{ marginBottom: 16 }}>UPDATE</button>

          <div className="glass">
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <div className="label-text">สรุปยอด {saving && <span className="save-dot" />}</div>
              <div style={{ display: "flex", gap: 8 }}>
                {totals && <button className="reset-btn" onClick={handleResetSales}>รีเซ็ต</button>}
                <button className="copy-btn" onClick={handleCopy} disabled={!totals}>{copied ? "คัดลอกแล้ว" : "คัดลอก"}</button>
              </div>
            </div>

            <div className="summary-box" style={{ marginBottom: notes.length ? 12 : 0 }}>
              {totals ? formatSalesSummary() : <span style={{ color: "#94a3b8", fontFamily: "Sarabun,sans-serif", fontSize: 14 }}>ยังไม่มีข้อมูล กรอกแล้วกด UPDATE</span>}
            </div>

            {notes.length > 0 && (
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 8 }}>หมายเหตุ</div>
                {notes.map(n => (
                  <div key={n.id} className="note-chip">
                    <span style={{ flex: 1 }}>{n.text}</span>
                    <button className="note-del" onClick={() => handleDeleteNote(n.id)}>✕</button>
                  </div>
                ))}
              </div>
            )}

            <div style={{ display: "flex", justifyContent: "center", marginTop: 12 }}>
              <button className="line-btn" onClick={handleSendLine} disabled={!totals || sending}>
                {sending ? "กำลังส่ง..." : sent ? "ส่งแล้ว!" : "ส่งไป LINE"}
              </button>
            </div>
          </div>

          <div className="glass">
            <div className="label-text" style={{ marginBottom: 12 }}>ประวัติวันนี้</div>
            {logs.length === 0
              ? <div style={{ color: "#94a3b8", fontSize: 13, textAlign: "center", padding: "10px 0" }}>ยังไม่มีประวัติ</div>
              : logs.map((log, i) => {
                const isSubtract = log.changes?.some(c => c.delta < 0);
                return (
                  <div key={i} className="log-item" style={{ borderLeft: `3px solid ${isSubtract ? "#ef4444" : "#22c55e"}` }}>
                    <div className="log-time" style={{ color: isSubtract ? "#ef4444" : "#6366f1" }}>
                      {isSubtract ? "− ลบยอด" : "+ เพิ่มยอด"} · {log.time} น.
                    </div>
                    <div className="log-change">
                      {log.changes?.map((c, ci) => {
                        const isMinus = c.delta < 0;
                        return (
                          <span key={ci} style={{ marginRight: 8 }}>
                            <span style={{ color: isMinus ? "#ef4444" : "#16a34a", fontWeight: 700 }}>{isMinus ? "−" : "+"}{Math.abs(c.delta)}</span>{" "}{c.label}
                          </span>
                        );
                      })}
                    </div>
                    {log.note ? <div className="log-note">หมายเหตุ: {log.note}</div> : null}
                  </div>
                );
              })}
          </div>
        </>
      )}

      {/* ================= TAB: TEAM ================= */}
      {activeTab === "team" && (
        <div style={{ width: "100%", maxWidth: 460 }}>
          <div className="glass">
            <div className="label-text" style={{ marginBottom: 12 }}>จำนวนพนักงานปฏิบัติงาน</div>
            {[
              { key: "staff", label: "จำนวนคนมาทำงาน" },
              { key: "pia", label: "PIA" },
              { key: "ss", label: "Super sale" },
              { key: "pt", label: "Part-time" },
              { key: "pc", label: "PC" },
              { key: "pctrue", label: "Pc ทรู" },
            ].map(({ key, label }) => (
              <div key={key} className="field-row" style={{ marginBottom: 6 }}>
                <span className="field-label">{label}</span>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <button className="step-btn" onClick={() => chgMeta(key, -1)}>−</button>
                  <input className="num-input" type="number" value={teamMeta[key]} onChange={e => setTeamMeta({ ...teamMeta, [key]: parseInt(e.target.value) || 0 })} />
                  <button className="step-btn" onClick={() => chgMeta(key, 1)}>+</button>
                </div>
              </div>
            ))}
          </div>

          <div className="glass">
            <div className="section-header"><span style={{ fontSize: 13, fontWeight: 700, color: "#4f46e5" }}>PIA (พนักงานร้าน)</span></div>
            {config.teamMembers.filter(m => m.position === "PIA (พนักงานร้าน)").map(m => (
              <div key={m.id} className="person-card">
                <div className="person-title">{m.name}</div>
                <div className="field-row" style={{ marginBottom: 6 }}>
                  <span className="tag tag-green">iPhone</span>
                  <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <button className="step-btn" onClick={() => chgTeam(`${m.id}_i_in`, -1)}>−</button>
                    <input className="num-input" type="number" value={teamData[`${m.id}_i_in`] || 0} onChange={e => setTeamData({ ...teamData, [`${m.id}_i_in`]: parseInt(e.target.value) || 0 })} />
                    <button className="step-btn" onClick={() => chgTeam(`${m.id}_i_in`, 1)}>+</button>
                    <span className="sep">/</span>
                    <button className="step-btn" onClick={() => chgTeam(`${m.id}_i_app`, -1)}>−</button>
                    <input className="num-input" type="number" value={teamData[`${m.id}_i_app`] || 0} onChange={e => setTeamData({ ...teamData, [`${m.id}_i_app`]: parseInt(e.target.value) || 0 })} />
                    <button className="step-btn" onClick={() => chgTeam(`${m.id}_i_app`, 1)}>+</button>
                  </div>
                </div>
                <div className="field-row">
                  <span className="tag tag-orange">SMP</span>
                  <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <button className="step-btn" onClick={() => chgTeam(`${m.id}_s_in`, -1)}>−</button>
                    <input className="num-input" type="number" value={teamData[`${m.id}_s_in`] || 0} onChange={e => setTeamData({ ...teamData, [`${m.id}_s_in`]: parseInt(e.target.value) || 0 })} />
                    <button className="step-btn" onClick={() => chgTeam(`${m.id}_s_in`, 1)}>+</button>
                    <span className="sep">/</span>
                    <button className="step-btn" onClick={() => chgTeam(`${m.id}_s_app`, -1)}>−</button>
                    <input className="num-input" type="number" value={teamData[`${m.id}_s_app`] || 0} onChange={e => setTeamData({ ...teamData, [`${m.id}_s_app`]: parseInt(e.target.value) || 0 })} />
                    <button className="step-btn" onClick={() => chgTeam(`${m.id}_s_app`, 1)}>+</button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="glass">
            <div className="section-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: "#4f46e5" }}>📊 PC Brand</span>
              <span style={{ fontSize: 12, fontWeight: 600, color: "#6366f1" }}>App in {teamTotals.pcSum}</span>
            </div>
            {config.teamMembers.filter(m => m.position !== "PIA (พนักงานร้าน)").map(m => (
              <div key={m.id} className="person-card">
                <div className="person-title">{m.name}</div>
                <div className="field-row">
                  <span style={{ fontSize: 12, color: "#64748b" }}>App in / Approve</span>
                  <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <button className="step-btn" onClick={() => chgTeam(`${m.id}_in`, -1)}>−</button>
                    <input className="num-input" type="number" value={teamData[`${m.id}_in`] || 0} onChange={e => setTeamData({ ...teamData, [`${m.id}_in`]: parseInt(e.target.value) || 0 })} />
                    <button className="step-btn" onClick={() => chgTeam(`${m.id}_in`, 1)}>+</button>
                    <span className="sep">/</span>
                    <button className="step-btn" onClick={() => chgTeam(`${m.id}_app`, -1)}>−</button>
                    <input className="num-input" type="number" value={teamData[`${m.id}_app`] || 0} onChange={e => setTeamData({ ...teamData, [`${m.id}_app`]: parseInt(e.target.value) || 0 })} />
                    <button className="step-btn" onClick={() => chgTeam(`${m.id}_app`, 1)}>+</button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="glass" style={{ background: "rgba(236,253,245,0.7)", border: "1px solid rgba(167,243,208,0.9)" }}>
            <div className="label-text" style={{ color: "#047857", marginBottom: 12 }}>สรุปยอดรวมทีม</div>
            <div className="field-row" style={{ marginBottom: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: "#065f46" }}>🔺 Target Today</span>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <button className="step-btn" onClick={() => chgMeta("target", -1)}>−</button>
                <input className="num-input" type="number" value={teamMeta.target} onChange={e => setTeamMeta({ ...teamMeta, target: parseInt(e.target.value) || 0 })} style={{ color: "#047857" }} />
                <button className="step-btn" onClick={() => chgMeta("target", 1)}>+</button>
              </div>
            </div>
            <div className="field-row" style={{ marginBottom: 6 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: "#047857" }}>▪️ Total App in Today</span>
              <span style={{ fontSize: 16, fontWeight: 700, color: "#047857" }}>{teamTotals.tin}</span>
            </div>
            <div className="field-row">
              <span style={{ fontSize: 13, fontWeight: 600, color: "#047857" }}>▪️ Total Approve Today</span>
              <span style={{ fontSize: 16, fontWeight: 700, color: "#047857" }}>{teamTotals.tapp}</span>
            </div>
          </div>

          <div style={{ display: "flex", gap: 10, marginBottom: 16, width: "100%", maxWidth: 460 }}>
            <button className="reset-btn" onClick={resetTeamData} style={{ flex: 1, padding: "12px" }}>↺ รีเซ็ตยอดทีม</button>
            <button className="update-btn" onClick={copyTeamReport} style={{ flex: 1, padding: "12px", background: teamCopied ? "#22c55e" : "rgba(99,102,241,0.9)" }}>
              {teamCopied ? "✓ คัดลอกแล้ว!" : "📋 Copy ข้อความ"}
            </button>
          </div>

          <div className="glass">
            <div className="label-text" style={{ marginBottom: 8 }}>ตัวอย่างข้อความรายงาน</div>
            <div className="summary-box">{generateTeamReport()}</div>
          </div>
        </div>
      )}

      {/* ================= TAB: ADMIN ================= */}
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
            <AdminTeamManager 
                teamMembers={config.teamMembers} 
                onSave={(newTeamMembers) => saveConfigToDB({...config, teamMembers: newTeamMembers})}
            />
          </div>
        </div>
      )}

      <div onClick={triggerAdminLogin} style={{ marginTop: 16, fontSize: 11, color: "#94a3b8", textAlign: "center", cursor: "pointer", padding: "10px" }}>
        BNN Sales Summary App v4.0
      </div>
    </div>
  );
}
