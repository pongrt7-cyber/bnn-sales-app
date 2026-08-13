import { useState, useEffect } from "react";
import { db } from "./firebase";
import { ref, onValue, set, remove, push } from "firebase/database";

const BRANCH = "BNN : 790";
const DB_SALES = "sales_summary";
const DB_LOGS = "activity_logs";

const IPHONE_FIELDS = [
  { key: "iphone", label: "iPhone" },
  { key: "appIn", label: "App in" },
  { key: "approve", label: "Approve" },
  { key: "reject", label: "Reject" },
];

const TRADE_FIELDS = [
  { key: "tradeIn", label: "Trade in" },
  { key: "buy", label: "Buy" },
];

const ALL_FIELDS = [...IPHONE_FIELDS, ...TRADE_FIELDS];
const ALL_FIELD_KEYS = ALL_FIELDS.map(f => f.key);
const EMPTY_TOTALS = () => Object.fromEntries(ALL_FIELD_KEYS.map(k => [k, 0]));

function getTodayISO() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function getTodayTH() {
  const now = new Date();
  const d = String(now.getDate()).padStart(2,"0");
  const m = String(now.getMonth()+1).padStart(2,"0");
  return `${d}/${m}/${now.getFullYear()+543}`;
}

function getTimeTH() {
  const now = new Date();
  const h = String(now.getHours()).padStart(2,"0");
  const m = String(now.getMinutes()).padStart(2,"0");
  const s = String(now.getSeconds()).padStart(2,"0");
  return `${h}:${m}:${s}`;
}

function formatSummary(totals, notes) {
  const t = totals;
  const lines = [
    `iPhone = ${t.iphone}`,
    `App in = ${t.appIn}`,
    `Approve = ${t.approve}`,
    `Reject = ${t.reject}`,
    ``,
    `Trade in = ${t.tradeIn}`,
    `Buy = ${t.buy}`,
  ];
  const noteText = notes.map(n => n.text).join("\n");
  if (noteText.trim()) lines.push(``, noteText.trim());
  return lines.join("\n");
}

export default function App() {
  const [activeTab, setActiveTab] = useState("main"); // "main" | "team"

  // ===== STATE: หน้าหลัก (Sales Summary) =====
  const [totals, setTotals] = useState(null);
  const [notes, setNotes] = useState([]);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);
  const [flash, setFlash] = useState(false);
  const [iphoneInputs, setIphoneInputs] = useState(EMPTY_TOTALS());
  const [inputNote, setInputNote] = useState("");

  // ===== STATE: หน้าสรุปยอดทีม (Team Report) =====
  const [teamMeta, setTeamMeta] = useState({
    staff: 7, pia: 1, ss: 1, pt: 1, pc: 3, pctrue: 1, target: 8
  });

  const [teamData, setTeamData] = useState({
    p1i_in: 0, p1i_app: 0, p1s_in: 0, p1s_app: 0,
    p2i_in: 0, p2i_app: 0, p2s_in: 0, p2s_app: 0,
    f_in: 1, f_app: 1,
    i_in: 0, i_app: 0,
    p_in: 0, p_app: 0,
    n_in: 0, n_app: 0,
    k_in: 1, k_app: 1,
    po_in: 4, po_app: 2,
    b_in: 0, b_app: 0,
  });

  const [teamCopied, setTeamCopied] = useState(false);

  useEffect(() => {
    let loaded = 0;
    const check = () => { loaded++; if (loaded >= 2) setLoading(false); };

    const unsubSales = onValue(ref(db, DB_SALES), snap => {
      const d = snap.val();
      if (d) {
        if (d.dateISO && d.dateISO !== getTodayISO()) {
          remove(ref(db, DB_SALES));
          remove(ref(db, DB_LOGS));
          setTotals(null); setNotes([]); setLogs([]);
          check(); return;
        }
        if (d.totals) setTotals(d.totals);
        if (d.notes) setNotes(d.notes || []);
      } else {
        setTotals(null); setNotes([]);
      }
      check();
    }, () => check());

    const unsubLogs = onValue(ref(db, DB_LOGS), snap => {
      const d = snap.val();
      if (d) {
        const arr = Object.values(d).sort((a, b) => b.ts - a.ts);
        setLogs(arr);
      } else setLogs([]);
      check();
    }, () => check());

    return () => { unsubSales(); unsubLogs(); };
  }, []);

  const saveAll = async (newTotals, newNotes) => {
    setSaving(true);
    try {
      await set(ref(db, DB_SALES), { 
        dateISO: getTodayISO(), date: getTodayTH(), totals: newTotals, notes: newNotes 
      });
    } catch(e) { console.error(e); } finally { setSaving(false); }
  };

  const addLog = async (changes, note) => {
    const entry = { 
      ts: Date.now(), time: getTimeTH(), dateISO: getTodayISO(), date: getTodayTH(), changes, note: note || "" 
    };
    await push(ref(db, DB_LOGS), entry);
  };

  const handleUpdate = async () => {
    const base = totals ?? EMPTY_TOTALS();
    const newTotals = { ...base };
    const changes = [];

    ALL_FIELDS.forEach(({ key, label }) => {
      const inputVal = parseInt(iphoneInputs[key]) || 0;
      if (inputVal !== 0) {
        const currentTotal = base[key] || 0;
        const newTotal = Math.max(0, currentTotal + inputVal);
        const actualDelta = newTotal - currentTotal; 

        if (actualDelta !== 0) {
          newTotals[key] = newTotal;
          changes.push({ label, delta: actualDelta });
        }
      }
    });

    const newNotes = inputNote.trim() ? [...notes, { id: Date.now(), text: inputNote.trim() }] : notes;
    setTotals(newTotals); setNotes(newNotes);
    setIphoneInputs(EMPTY_TOTALS());
    setInputNote("");
    setFlash(true); setTimeout(() => setFlash(false), 600);

    await saveAll(newTotals, newNotes);
    if (changes.length > 0) await addLog(changes, inputNote.trim());
  };

  const handleReset = async () => {
    if (!window.confirm("ต้องการรีเซ็ตข้อมูลทั้งหมดหรือไม่?")) return;
    setTotals(null); setNotes([]); setLogs([]);
    await remove(ref(db, DB_SALES));
    await remove(ref(db, DB_LOGS));
  };

  const handleDeleteNote = async (id) => {
    const n = notes.filter(x => x.id !== id);
    setNotes(n); await saveAll(totals, n);
  };

  const handleCopy = () => {
    if (!totals) return;
    navigator.clipboard.writeText(formatSummary(totals, notes)).then(() => {
      setCopied(true); setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleSendLine = async () => {
    if (!totals) return;
    setSending(true);
    try {
      await fetch("https://bnn-sales-app.vercel.app/api/send-line", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: formatSummary(totals, notes) }),
      });
      setSent(true); setTimeout(() => setSent(false), 3000);
    } catch(e) { alert("ส่งไม่สำเร็จ"); } finally { setSending(false); }
  };

  const step = (key, delta) => {
    setIphoneInputs(prev => ({
      ...prev,
      [key]: (parseInt(prev[key]) || 0) + delta
    }));
  };

  const handleInputChange = (key, val) => {
    setIphoneInputs(prev => ({ ...prev, [key]: isNaN(parseInt(val)) && val !== "-" ? 0 : val }));
  };

  // ===== ฟังก์ชันคำนวณสำหรับหน้าสรุปยอดทีม =====
  const chgMeta = (key, delta) => {
    setTeamMeta(prev => ({ ...prev, [key]: Math.max(0, (parseInt(prev[key]) || 0) + delta) }));
  };

  const chgTeam = (key, delta) => {
    setTeamData(prev => ({ ...prev, [key]: Math.max(0, (parseInt(prev[key]) || 0) + delta) }));
  };

  const getTeamTotals = () => {
    const td = teamData;
    let tin = td.p1i_in + td.p1s_in + td.p2i_in + td.p2s_in + td.f_in + td.i_in + td.p_in + td.n_in + td.k_in + td.po_in + td.b_in;
    let tapp = td.p1i_app + td.p1s_app + td.p2i_app + td.p2s_app + td.f_app + td.i_app + td.p_app + td.n_app + td.k_app + td.po_app + td.b_app;
    let pcSum = td.f_in + td.i_in + td.p_in + td.n_in;
    return { tin, tapp, pcSum };
  };

  const generateTeamReport = () => {
    const tm = teamMeta;
    const td = teamData;
    const { tin, tapp, pcSum } = getTeamTotals();

    let s = '';
    s += 'ID ร้าน :790\n';
    s += 'ชื่อร้าน : BNN big c บ้านดู่\n';
    s += 'จำนวนคนมาทำงาน : ' + tm.staff + '\n';
    s += 'PIA : ' + tm.pia + '\n';
    s += 'Super sale:' + tm.ss + '\n';
    s += 'Part-time:' + tm.pt + '\n';
    s += 'PC : ' + tm.pc + '\n';
    s += 'Pc ทรู :' + tm.pctrue + '\n\n';

    s += '1.PIA : แป้ง \n';
    s += 'App in iPhone ' + td.p1i_in + ': App in =' + td.p1i_in + ' / Approve =' + td.p1i_app + '\n';
    s += 'App in SMP ' + td.p1s_in + ' : App in ' + td.p1s_in + '/Approve ' + td.p1s_app + '\n\n';

    s += '1. PIA : แอม \n';
    s += 'App in iPhone ' + td.p2i_in + ' : App in=' + td.p2i_in + ' / Approve =' + td.p2i_app + '\n';
    s += 'App in SMP ' + td.p2s_in + ' : App in ' + td.p2s_in + '/Approve ' + td.p2s_app + '\n\n';

    s += '…….\nPC Brand App in ' + pcSum + '\n\n';

    s += '1. ฝ้าย PC / Brand: oppo\nApp in = ' + td.f_in + ' / Approve =' + td.f_app + '\n\n';
    s += '2.ไอซ์ PC / Brand: Samsung\nApp in= ' + td.i_in + ' / Approve=' + td.i_app + '\n\n';
    s += '3. ปัน pc/ Brand: Xiaomi \nApp in= ' + td.p_in + ' / Approve=' + td.p_app + '\n\n';
    s += '4. นิด pc ทรู เบอร์  \nApp in=' + td.n_in + ' /Approve =' + td.n_app + '\n\n';
    s += '5.กิ้ว SP \napp in=' + td.k_in + ' /Approve= ' + td.k_app + '\n\n';
    s += '5.part-time:พง \nApp in = ' + td.po_in + ' /Approve =' + td.po_app + '\n\n';
    s += '6. part-time:บาส\nApp in = ' + td.b_in + ' /Approve =' + td.b_app + '\n\n';

    s += 'Total App in Target Today =  ' + tm.target + '\n';
    s += 'Total App in Today = ' + tin + '\n';
    s += 'Total Approve Today = ' + tapp;
    return s;
  };

  const copyTeamReport = () => {
    const text = generateTeamReport();
    navigator.clipboard.writeText(text).then(() => {
      setTeamCopied(true);
      setTimeout(() => setTeamCopied(false), 2000);
    });
  };

  const resetTeamData = () => {
    if (!window.confirm("ต้องการรีเซ็ตข้อมูลทีมทั้งหมดหรือไม่?")) return;
    setTeamMeta({ staff: 0, pia: 0, ss: 0, pt: 0, pc: 0, pctrue: 0, target: 0 });
    setTeamData({
      p1i_in: 0, p1i_app: 0, p1s_in: 0, p1s_app: 0,
      p2i_in: 0, p2i_app: 0, p2s_in: 0, p2s_app: 0,
      f_in: 0, f_app: 0, i_in: 0, i_app: 0, p_in: 0, p_app: 0,
      n_in: 0, n_app: 0, k_in: 0, k_app: 0, po_in: 0, po_app: 0, b_in: 0, b_app: 0
    });
  };

  if (loading) return (
    <div style={{ minHeight:"100vh", background:"linear-gradient(135deg,#e0e7ff,#f0f4ff,#fce7f3)", display:"flex", alignItems:"center", justifyContent:"center", fontFamily:"Sarabun,sans-serif", color:"#64748b", fontSize:15 }}>
      กำลังโหลดข้อมูล...
    </div>
  );

  const teamTotals = getTeamTotals();

  return (
    <div style={{ minHeight:"100vh", background:"linear-gradient(135deg,#e0e7ff 0%,#f0f4ff 50%,#fce7f3 100%)", fontFamily:"'Sarabun','Segoe UI',sans-serif", display:"flex", flexDirection:"column", alignItems:"center", padding:"20px 16px 40px", color:"#1e293b" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Sarabun:wght@300;400;600;700&display=swap');
        *{box-sizing:border-box;}
        input[type=number]::-webkit-inner-spin-button,input[type=number]::-webkit-outer-spin-button{-webkit-appearance:none;margin:0;}
        input[type=number]{-moz-appearance:textfield;}
        .glass{background:rgba(255,255,255,0.65);border:1px solid rgba(255,255,255,0.85);border-radius:20px;backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);box-shadow:0 8px 32px rgba(100,120,200,0.1),0 1px 0 rgba(255,255,255,0.9) inset;}
        
        /* Tab Switcher */
        .tab-bar{display:flex;background:rgba(255,255,255,0.5);padding:4px;border-radius:30px;border:1px solid rgba(200,210,240,0.8);margin-bottom:16px;width:100%;max-width:460px;}
        .tab-btn{flex:1;padding:8px 12px;border:none;border-radius:25px;font-family:'Sarabun',sans-serif;font-size:13px;font-weight:700;cursor:pointer;transition:all 0.2s;color:#64748b;background:transparent;}
        .tab-btn.active{background:#4f46e5;color:#fff;box-shadow:0 2px 10px rgba(79,70,229,0.3);}

        .step-btn{background:rgba(255,255,255,0.8);border:1px solid rgba(200,210,240,0.9);color:#4f46e5;width:30px;height:30px;border-radius:8px;cursor:pointer;font-size:16px;display:flex;align-items:center;justify-content:center;transition:background 0.15s,transform 0.1s;user-select:none;box-shadow:0 2px 6px rgba(0,0,0,0.06);flex-shrink:0;}
        .step-btn:hover{background:#fff;transform:scale(1.05);}
        .step-btn:active{transform:scale(0.95);}
        .num-input{background:rgba(255,255,255,0.8);border:1px solid rgba(200,210,240,0.9);border-radius:8px;color:#1e293b;font-size:15px;font-weight:700;text-align:center;width:44px;height:30px;box-shadow:0 1px 4px rgba(0,0,0,0.06) inset;}
        
        .update-btn{background:rgba(99,102,241,0.9);border:1px solid rgba(255,255,255,0.6);color:#fff;font-size:15px;font-weight:700;padding:13px 52px;border-radius:50px;cursor:pointer;letter-spacing:1px;backdrop-filter:blur(8px);box-shadow:0 4px 20px rgba(99,102,241,0.35);transition:transform 0.1s,box-shadow 0.15s;}
        .update-btn:hover{transform:translateY(-2px);box-shadow:0 8px 28px rgba(99,102,241,0.45);}
        .line-btn{background:rgba(0,185,0,0.85);border:1px solid rgba(255,255,255,0.6);color:#fff;font-size:15px;font-weight:700;padding:13px 40px;border-radius:50px;cursor:pointer;backdrop-filter:blur(8px);box-shadow:0 4px 20px rgba(0,185,0,0.3);}
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
        .log-time{font-size:12px;color:#6366f1;font-weight:700;margin-bottom:4px;}
        .log-change{font-size:13px;color:#334155;line-height:1.6;}
        .log-note{font-size:12px;color:#94a3b8;margin-top:2px;}

        /* Custom UI สำหรับหน้าสรุปทีม */
        .person-card{background:rgba(255,255,255,0.4);border:1px solid rgba(200,210,240,0.6);border-radius:12px;padding:10px;margin-bottom:10px;}
        .person-title{font-size:13px;font-weight:700;color:#334155;margin-bottom:8px;}
        .tag{display:inline-block;padding:2px 6px;border-radius:4px;font-size:10px;font-weight:700;margin-right:4px;}
        .tag-green{background:#dcfce7;color:#15803d;}
        .tag-orange{background:#fef3c7;color:#b45309;}
        .sep{color:#94a3b8;font-size:12px;margin:0 2px;}
      `}</style>

      {/* HEADER TAB SWITCHER */}
      <div className="tab-bar">
        <button className={`tab-btn ${activeTab === "main" ? "active" : ""}`} onClick={() => setActiveTab("main")}>
          Sales Summary
        </button>
        <button className={`tab-btn ${activeTab === "team" ? "active" : ""}`} onClick={() => setActiveTab("team")}>
          สรุปยอดทีม
        </button>
      </div>

      {/* ==================== TAB 1: SALES SUMMARY (หน้าหลัก) ==================== */}
      {activeTab === "main" && (
        <>
          <div style={{ width:"100%", maxWidth:460, textAlign:"center", marginBottom:16 }}>
            <h1 style={{ margin:0, fontSize:22, fontWeight:700, color:"#3730a3" }}>Sales Summary</h1>
            <div style={{ fontSize:11, color:"#6366f1", fontWeight:600 }}>{BRANCH} · {getTodayTH()}</div>
            <div style={{ fontSize:11, color:"#94a3b8", marginTop:2 }}>บันทึกอัตโนมัติ · รีเซ็ตทุกวัน</div>
          </div>

          <div className="glass" style={{ width:"100%", maxWidth:460, padding:"18px 12px", marginBottom:16 }}>
            <div style={{ paddingLeft:6, paddingRight:6, marginBottom:12 }}>
              <div className="label-text">กรอกยอดประจำวัน</div>
            </div>

            <div className="section-header">
              <span style={{ fontSize:13, fontWeight:700, color:"#4f46e5" }}>iPhone</span>
            </div>
            {IPHONE_FIELDS.map(({ key, label }) => (
              <div key={key} className="field-row">
                <div className="field-label">{label}</div>
                <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                  <button className="step-btn" onClick={() => step(key, -1)}>−</button>
                  <input className="num-input" type="text" value={iphoneInputs[key]} onChange={e => handleInputChange(key, e.target.value)} />
                  <button className="step-btn" onClick={() => step(key, 1)}>+</button>
                </div>
              </div>
            ))}

            <hr className="section-divider" />

            <div className="section-header">
              <span style={{ fontSize:13, fontWeight:700, color:"#4f46e5" }}>Trade in / Buy</span>
            </div>
            {TRADE_FIELDS.map(({ key, label }) => (
              <div key={key} className="field-row">
                <div className="field-label">{label}</div>
                <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                  <button className="step-btn" onClick={() => step(key, -1)}>−</button>
                  <input className="num-input" type="text" value={iphoneInputs[key]} onChange={e => handleInputChange(key, e.target.value)} />
                  <button className="step-btn" onClick={() => step(key, 1)}>+</button>
                </div>
              </div>
            ))}

            <hr className="section-divider" style={{ marginTop:12 }} />
            <div style={{ paddingLeft:6, paddingRight:6 }}>
              <div style={{ fontSize:12, color:"#94a3b8", marginBottom:6 }}>หมายเหตุ (ถ้ามี)</div>
              <textarea className="textarea-note" placeholder="พิมพ์หมายเหตุที่นี่..." value={inputNote} onChange={e => setInputNote(e.target.value)} />
            </div>
          </div>

          <button className="update-btn" onClick={handleUpdate} style={{ marginBottom:16 }}>UPDATE</button>

          <div className="glass" style={{ width:"100%", maxWidth:460, padding:"18px" }}>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:12 }}>
              <div className="label-text">สรุปยอด {saving && <span className="save-dot" />}</div>
              <div style={{ display:"flex", gap:8 }}>
                {totals && <button className="reset-btn" onClick={handleReset}>รีเซ็ต</button>}
                <button className="copy-btn" onClick={handleCopy} disabled={!totals}>
                  {copied ? "คัดลอกแล้ว" : "คัดลอก"}
                </button>
              </div>
            </div>

            <div className={`summary-box ${flash ? "flash" : ""}`} style={{ marginBottom: notes.length ? 12 : 0 }}>
              {totals
                ? formatSummary(totals, notes)
                : <span style={{ color:"#94a3b8", fontFamily:"Sarabun,sans-serif", fontSize:14 }}>ยังไม่มีข้อมูล กรอกแล้วกด UPDATE</span>
              }
            </div>

            {notes.length > 0 && (
              <div style={{ marginBottom:12 }}>
                <div style={{ fontSize:12, color:"#94a3b8", marginBottom:8 }}>หมายเหตุ</div>
                {notes.map(n => (
                  <div key={n.id} className="note-chip">
                    <span style={{ flex:1 }}>{n.text}</span>
                    <button className="note-del" onClick={() => handleDeleteNote(n.id)}>✕</button>
                  </div>
                ))}
              </div>
            )}

            <div style={{ display:"flex", justifyContent:"center", marginTop:12 }}>
              <button className="line-btn" onClick={handleSendLine} disabled={!totals || sending}>
                {sending ? "กำลังส่ง..." : sent ? "ส่งแล้ว!" : "ส่งไป LINE"}
              </button>
            </div>
          </div>

          <div className="glass" style={{ width:"100%", maxWidth:460, padding:"18px", marginTop:16 }}>
            <div className="label-text" style={{ marginBottom:12 }}>ประวัติวันนี้</div>
            {logs.length === 0
              ? <div style={{ color:"#94a3b8", fontSize:13, textAlign:"center", padding:"10px 0" }}>ยังไม่มีประวัติ</div>
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
                          <span key={ci} style={{ marginRight:8 }}>
                            <span style={{ color: isMinus ? "#ef4444" : "#16a34a", fontWeight:700 }}>
                              {isMinus ? "−" : "+"}{Math.abs(c.delta)}
                            </span>
                            {" "}{c.label}
                          </span>
                        )
                      })}
                    </div>
                    {log.note ? <div className="log-note">หมายเหตุ: {log.note}</div> : null}
                  </div>
                );
              })
            }
          </div>
        </>
      )}

      {/* ==================== TAB 2: สรุปยอดทีม (TEAM REPORT) ==================== */}
      {activeTab === "team" && (
        <div style={{ width:"100%", maxWidth:460 }}>
          <div style={{ textAlign:"center", marginBottom:16 }}>
            <h1 style={{ margin:0, fontSize:22, fontWeight:700, color:"#3730a3" }}>กรอกยอดทีม</h1>
            <div style={{ fontSize:11, color:"#6366f1", fontWeight:600 }}>BNN big c บ้านดู่ (790)</div>
          </div>

          {/* META GRID CARD */}
          <div className="glass" style={{ padding:"16px", marginBottom:14 }}>
            <div className="label-text" style={{ marginBottom:12 }}>จำนวนพนักงานปฏิบัติงาน</div>
            
            {[
              { key: "staff", label: "จำนวนคนมาทำงาน" },
              { key: "pia", label: "PIA" },
              { key: "ss", label: "Super sale" },
              { key: "pt", label: "Part-time" },
              { key: "pc", label: "PC" },
              { key: "pctrue", label: "Pc ทรู" },
            ].map(({ key, label }) => (
              <div key={key} className="field-row" style={{ marginBottom:6 }}>
                <span className="field-label">{label}</span>
                <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                  <button className="step-btn" onClick={() => chgMeta(key, -1)}>−</button>
                  <input className="num-input" type="number" value={teamMeta[key]} onChange={e => setTeamMeta({...teamMeta, [key]: parseInt(e.target.value)||0})} />
                  <button className="step-btn" onClick={() => chgMeta(key, 1)}>+</button>
                </div>
              </div>
            ))}
          </div>

          {/* SECTION: PIA */}
          <div className="glass" style={{ padding:"16px", marginBottom:14 }}>
            <div className="section-header">
              <span style={{ fontSize:13, fontWeight:700, color:"#4f46e5" }}>PIA</span>
            </div>

            {/* แป้ง */}
            <div className="person-card">
              <div className="person-title">1. PIA : แป้ง</div>
              <div className="field-row" style={{ marginBottom:6 }}>
                <span className="tag tag-green">iPhone</span>
                <div style={{ display:"flex", alignItems:"center", gap:4 }}>
                  <button className="step-btn" onClick={() => chgTeam('p1i_in', -1)}>−</button>
                  <input className="num-input" type="number" value={teamData.p1i_in} onChange={e => setTeamData({...teamData, p1i_in: parseInt(e.target.value)||0})} />
                  <button className="step-btn" onClick={() => chgTeam('p1i_in', 1)}>+</button>
                  <span className="sep">/</span>
                  <button className="step-btn" onClick={() => chgTeam('p1i_app', -1)}>−</button>
                  <input className="num-input" type="number" value={teamData.p1i_app} onChange={e => setTeamData({...teamData, p1i_app: parseInt(e.target.value)||0})} />
                  <button className="step-btn" onClick={() => chgTeam('p1i_app', 1)}>+</button>
                </div>
              </div>
              <div className="field-row">
                <span className="tag tag-orange">SMP</span>
                <div style={{ display:"flex", alignItems:"center", gap:4 }}>
                  <button className="step-btn" onClick={() => chgTeam('p1s_in', -1)}>−</button>
                  <input className="num-input" type="number" value={teamData.p1s_in} onChange={e => setTeamData({...teamData, p1s_in: parseInt(e.target.value)||0})} />
                  <button className="step-btn" onClick={() => chgTeam('p1s_in', 1)}>+</button>
                  <span className="sep">/</span>
                  <button className="step-btn" onClick={() => chgTeam('p1s_app', -1)}>−</button>
                  <input className="num-input" type="number" value={teamData.p1s_app} onChange={e => setTeamData({...teamData, p1s_app: parseInt(e.target.value)||0})} />
                  <button className="step-btn" onClick={() => chgTeam('p1s_app', 1)}>+</button>
                </div>
              </div>
            </div>

            {/* แอม */}
            <div className="person-card" style={{ marginBottom:0 }}>
              <div className="person-title">1. PIA : แอม</div>
              <div className="field-row" style={{ marginBottom:6 }}>
                <span className="tag tag-green">iPhone</span>
                <div style={{ display:"flex", alignItems:"center", gap:4 }}>
                  <button className="step-btn" onClick={() => chgTeam('p2i_in', -1)}>−</button>
                  <input className="num-input" type="number" value={teamData.p2i_in} onChange={e => setTeamData({...teamData, p2i_in: parseInt(e.target.value)||0})} />
                  <button className="step-btn" onClick={() => chgTeam('p2i_in', 1)}>+</button>
                  <span className="sep">/</span>
                  <button className="step-btn" onClick={() => chgTeam('p2i_app', -1)}>−</button>
                  <input className="num-input" type="number" value={teamData.p2i_app} onChange={e => setTeamData({...teamData, p2i_app: parseInt(e.target.value)||0})} />
                  <button className="step-btn" onClick={() => chgTeam('p2i_app', 1)}>+</button>
                </div>
              </div>
              <div className="field-row">
                <span className="tag tag-orange">SMP</span>
                <div style={{ display:"flex", alignItems:"center", gap:4 }}>
                  <button className="step-btn" onClick={() => chgTeam('p2s_in', -1)}>−</button>
                  <input className="num-input" type="number" value={teamData.p2s_in} onChange={e => setTeamData({...teamData, p2s_in: parseInt(e.target.value)||0})} />
                  <button className="step-btn" onClick={() => chgTeam('p2s_in', 1)}>+</button>
                  <span className="sep">/</span>
                  <button className="step-btn" onClick={() => chgTeam('p2s_app', -1)}>−</button>
                  <input className="num-input" type="number" value={teamData.p2s_app} onChange={e => setTeamData({...teamData, p2s_app: parseInt(e.target.value)||0})} />
                  <button className="step-btn" onClick={() => chgTeam('p2s_app', 1)}>+</button>
                </div>
              </div>
            </div>
          </div>

          {/* SECTION: PC BRAND */}
          <div className="glass" style={{ padding:"16px", marginBottom:14 }}>
            <div className="section-header" style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
              <span style={{ fontSize:13, fontWeight:700, color:"#4f46e5" }}>📊 PC Brand</span>
              <span style={{ fontSize:12, fontWeight:600, color:"#6366f1" }}>App in {teamTotals.pcSum}</span>
            </div>

            {[
              { title: "1. ฝ้าย PC / Brand: oppo", keyIn: "f_in", keyApp: "f_app" },
              { title: "2. ไอซ์ PC / Brand: Samsung", keyIn: "i_in", keyApp: "i_app" },
              { title: "3. ปัน pc / Brand: Xiaomi", keyIn: "p_in", keyApp: "p_app" },
              { title: "4. นิด pc ทรู เบอร์", keyIn: "n_in", keyApp: "n_app" },
              { title: "5. กิ้ว SP", keyIn: "k_in", keyApp: "k_app" },
              { title: "5. part-time: พง", keyIn: "po_in", keyApp: "po_app" },
              { title: "6. part-time: บาส", keyIn: "b_in", keyApp: "b_app" },
            ].map((p, idx) => (
              <div key={idx} className="person-card">
                <div className="person-title">{p.title}</div>
                <div className="field-row">
                  <span style={{ fontSize:12, color:"#64748b" }}>App in / Approve</span>
                  <div style={{ display:"flex", alignItems:"center", gap:4 }}>
                    <button className="step-btn" onClick={() => chgTeam(p.keyIn, -1)}>−</button>
                    <input className="num-input" type="number" value={teamData[p.keyIn]} onChange={e => setTeamData({...teamData, [p.keyIn]: parseInt(e.target.value)||0})} />
                    <button className="step-btn" onClick={() => chgTeam(p.keyIn, 1)}>+</button>
                    <span className="sep">/</span>
                    <button className="step-btn" onClick={() => chgTeam(p.keyApp, -1)}>−</button>
                    <input className="num-input" type="number" value={teamData[p.keyApp]} onChange={e => setTeamData({...teamData, [p.keyApp]: parseInt(e.target.value)||0})} />
                    <button className="step-btn" onClick={() => chgTeam(p.keyApp, 1)}>+</button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* SUMMARY SECTION */}
          <div className="glass" style={{ padding:"16px", marginBottom:14, background:"rgba(236,253,245,0.7)", border:"1px solid rgba(167,243,208,0.9)" }}>
            <div className="label-text" style={{ color:"#047857", marginBottom:12 }}>สรุปยอดรวมทีม</div>
            
            <div className="field-row" style={{ marginBottom:8 }}>
              <span style={{ fontSize:13, fontWeight:700, color:"#065f46" }}>🔺 Target Today</span>
              <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                <button className="step-btn" onClick={() => chgMeta('target', -1)}>−</button>
                <input className="num-input" type="number" value={teamMeta.target} onChange={e => setTeamMeta({...teamMeta, target: parseInt(e.target.value)||0})} style={{ color:"#047857" }} />
                <button className="step-btn" onClick={() => chgMeta('target', 1)}>+</button>
              </div>
            </div>

            <div className="field-row" style={{ marginBottom:6 }}>
              <span style={{ fontSize:13, fontWeight:600, color:"#047857" }}>▪️ Total App in Today</span>
              <span style={{ fontSize:16, fontWeight:700, color:"#047857" }}>{teamTotals.tin}</span>
            </div>

            <div className="field-row">
              <span style={{ fontSize:13, fontWeight:600, color:"#047857" }}>▪️ Total Approve Today</span>
              <span style={{ fontSize:16, fontWeight:700, color:"#047857" }}>{teamTotals.tapp}</span>
            </div>
          </div>

          {/* CONTROL BUTTONS */}
          <div style={{ display:"flex", gap:10, marginBottom:16 }}>
            <button className="reset-btn" onClick={resetTeamData} style={{ flex:1, padding:"12px" }}>
              ↺ รีเซ็ตยอดทีม
            </button>
            <button className="update-btn" onClick={copyTeamReport} style={{ flex:1, padding:"12px", background: teamCopied ? "#22c55e" : "rgba(99,102,241,0.9)" }}>
              {teamCopied ? "✓ คัดลอกแล้ว!" : "📋 Copy ข้อความ"}
            </button>
          </div>

          {/* PREVIEW BOX */}
          <div className="glass" style={{ padding:"16px" }}>
            <div className="label-text" style={{ marginBottom:8 }}>ตัวอย่างข้อความรายงาน</div>
            <div className="summary-box">
              {generateTeamReport()}
            </div>
          </div>
        </div>
      )}

      <div style={{ marginTop:16, fontSize:11, color:"#94a3b8", textAlign:"center" }}>BNN Sales Summary App</div>
    </div>
  );
}