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

// เอา BNN และ วันที่ออกจากข้อความส่งไลน์ตามที่เคยสั่งไว้ครับ
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

  useEffect(() => {
    let loaded = 0;
    const check = () => { loaded++; if (loaded >= 2) setLoading(false); };

    const unsubSales = onValue(ref(db, DB_SALES), snap => {
      const d = snap.val();
      if (d) {
        if (d.date && d.date !== getTodayTH()) {
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
        const arr = Object.values(d).sort((a,b) => b.ts - a.ts);
        setLogs(arr);
      } else setLogs([]);
      check();
    }, () => check());

    return () => { unsubSales(); unsubLogs(); };
  }, []);

  const saveAll = async (newTotals, newNotes) => {
    setSaving(true);
    try {
      await set(ref(db, DB_SALES), { date: getTodayTH(), totals: newTotals, notes: newNotes });
    } catch(e) { console.error(e); } finally { setSaving(false); }
  };

  const addLog = async (changes, note) => {
    const entry = { ts: Date.now(), time: getTimeTH(), date: getTodayTH(), changes, note: note || "" };
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
        // ป้องกันบิลติดลบ
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
    const num = parseInt(val) || 0;
    setIphoneInputs(prev => ({ ...prev, [key]: isNaN(parseInt(val)) && val !== "-" ? 0 : val }));
  };

  if (loading) return (
    <div style={{ minHeight:"100vh", background:"linear-gradient(135deg,#e0e7ff,#f0f4ff,#fce7f3)", display:"flex", alignItems:"center", justifyContent:"center", fontFamily:"Sarabun,sans-serif", color:"#64748b", fontSize:15 }}>
      กำลังโหลดข้อมูล...
    </div>
  );

  return (
    <div style={{ minHeight:"100vh", background:"linear-gradient(135deg,#e0e7ff 0%,#f0f4ff 50%,#fce7f3 100%)", fontFamily:"'Sarabun','Segoe UI',sans-serif", display:"flex", flexDirection:"column", alignItems:"center", padding:"24px 16px 40px", color:"#1e293b" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Sarabun:wght@300;400;600;700&display=swap');
        *{box-sizing:border-box;}
        input[type=number]::-webkit-inner-spin-button,input[type=number]::-webkit-outer-spin-button{-webkit-appearance:none;margin:0;}
        input[type=number]{-moz-appearance:textfield;}
        .glass{background:rgba(255,255,255,0.55);border:1px solid rgba(255,255,255,0.8);border-radius:20px;backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);box-shadow:0 8px 32px rgba(100,120,200,0.1),0 1px 0 rgba(255,255,255,0.9) inset;}
        .step-btn{background:rgba(255,255,255,0.7);border:1px solid rgba(200,210,240,0.8);color:#4f46e5;width:30px;height:30px;border-radius:8px;cursor:pointer;font-size:16px;display:flex;align-items:center;justify-content:center;transition:background 0.15s,transform 0.1s;user-select:none;box-shadow:0 2px 6px rgba(0,0,0,0.06);flex-shrink:0;}
        .step-btn:hover{background:rgba(255,255,255,0.95);transform:scale(1.08);}
        .step-btn:active{transform:scale(0.95);}
        .num-input{background:rgba(255,255,255,0.6);border:1px solid rgba(200,210,240,0.8);border-radius:8px;color:#1e293b;font-size:17px;font-weight:700;text-align:center;width:52px;height:30px;box-shadow:0 1px 4px rgba(0,0,0,0.06) inset;}
        .update-btn{background:rgba(99,102,241,0.85);border:1px solid rgba(255,255,255,0.6);color:#fff;font-size:15px;font-weight:700;padding:13px 52px;border-radius:50px;cursor:pointer;letter-spacing:1px;backdrop-filter:blur(8px);box-shadow:0 4px 20px rgba(99,102,241,0.35);transition:transform 0.1s,box-shadow 0.15s;}
        .update-btn:hover{transform:translateY(-2px);box-shadow:0 8px 28px rgba(99,102,241,0.45);}
        .update-btn:active{transform:scale(0.97);}
        .line-btn{background:rgba(0,185,0,0.85);border:1px solid rgba(255,255,255,0.6);color:#fff;font-size:15px;font-weight:700;padding:13px 40px;border-radius:50px;cursor:pointer;backdrop-filter:blur(8px);box-shadow:0 4px 20px rgba(0,185,0,0.3);transition:transform 0.1s,box-shadow 0.15s;}
        .line-btn:hover{transform:translateY(-2px);}
        .line-btn:disabled{opacity:0.5;cursor:default;transform:none;}
        .copy-btn{background:rgba(255,255,255,0.6);border:1px solid rgba(200,210,240,0.9);color:#4f46e5;padding:7px 14px;border-radius:10px;cursor:pointer;font-size:13px;font-weight:600;transition:background 0.15s;}
        .copy-btn:hover{background:rgba(255,255,255,0.9);}
        .copy-btn:disabled{opacity:0.4;cursor:default;}
        .reset-btn{background:rgba(255,255,255,0.4);border:1px solid rgba(239,68,68,0.3);color:#ef4444;padding:7px 14px;border-radius:10px;cursor:pointer;font-size:13px;font-weight:600;transition:background 0.15s;}
        .reset-btn:hover{background:rgba(254,226,226,0.7);}
        .summary-box{background:rgba(255,255,255,0.45);border:1px solid rgba(255,255,255,0.85);border-radius:14px;padding:16px;font-family:'Courier New',monospace;font-size:13px;line-height:1.85;color:#1e293b;white-space:pre-wrap;word-break:break-word;box-shadow:0 2px 8px rgba(0,0,0,0.04) inset;}
        .note-chip{display:flex;align-items:flex-start;gap:8px;background:rgba(255,255,255,0.55);border:1px solid rgba(200,210,240,0.8);border-radius:10px;padding:8px 10px;font-size:13px;color:#334155;margin-bottom:6px;}
        .note-del{background:none;border:none;color:#94a3b8;cursor:pointer;font-size:15px;line-height:1;padding:0 2px;flex-shrink:0;transition:color 0.15s;}
        .note-del:hover{color:#ef4444;}
        .textarea-note{background:rgba(255,255,255,0.55);border:1px solid rgba(200,210,240,0.8);border-radius:12px;color:#1e293b;font-size:14px;padding:10px 12px;resize:vertical;width:100%;min-height:52px;font-family:'Sarabun',sans-serif;}
        .textarea-note::placeholder{color:#94a3b8;}
        .flash{animation:flashAnim 0.5s ease;}
        @keyframes flashAnim{0%,100%{opacity:1}50%{opacity:0.5}}
        .section-header{padding:10px 14px;background:rgba(99,102,241,0.08);border-radius:12px;margin-bottom:4px;}
        .field-row{display:flex;align-items:center;justify-content:space-between;padding:8px 14px;border-radius:10px;transition:background 0.1s;}
        .field-row:hover{background:rgba(255,255,255,0.5);}
        .field-label{font-size:14px;font-weight:600;color:#334155;min-width:90px;}
        .section-divider{border:none;border-top:1px solid rgba(200,210,240,0.5);margin:8px 0;}
        .label-text{font-size:12px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:1.5px;}
        .save-dot{display:inline-block;width:7px;height:7px;border-radius:50%;background:#22c55e;margin-left:6px;vertical-align:middle;animation:pulse 1s infinite;}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:0.3}}
        .log-item{background:rgba(255,255,255,0.5);border:1px solid rgba(200,210,240,0.7);border-radius:12px;padding:10px 14px;margin-bottom:8px;}
        .log-time{font-size:12px;color:#6366f1;font-weight:700;margin-bottom:4px;}
        .log-change{font-size:13px;color:#334155;line-height:1.6;}
        .log-note{font-size:12px;color:#94a3b8;margin-top:2px;}
      `}</style>

      {/* HEADER */}
      <div style={{ width:"100%", maxWidth:460, textAlign:"center", marginBottom:20 }}>
        <h1 style={{ margin:0, fontSize:22, fontWeight:700, color:"#3730a3" }}>Sales Summary</h1>
        <div style={{ fontSize:11, color:"#6366f1", fontWeight:600 }}>{BRANCH} · {getTodayTH()}</div>
        <div style={{ fontSize:11, color:"#94a3b8", marginTop:2 }}>บันทึกอัตโนมัติ · รีเซ็ตทุกวัน</div>
      </div>

      {/* INPUT CARD */}
      <div className="glass" style={{ width:"100%", maxWidth:460, padding:"18px 12px", marginBottom:16 }}>
        <div style={{ paddingLeft:6, paddingRight:6, marginBottom:14 }}>
          <div className="label-text">กรอกยอดประจำวัน</div>
        </div>

        {/* iPhone */}
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

        {/* Trade in / Buy */}
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

      {/* SUMMARY CARD */}
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

      {/* ACTIVITY LOG */}
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

      <div style={{ marginTop:16, fontSize:11, color:"#94a3b8", textAlign:"center" }}>กดปุ่มคัดลอกเพื่อนำไปวางได้เลย</div>
    </div>
  );
}