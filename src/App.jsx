import { useState, useEffect } from "react";
import { db } from "./firebase";
import { ref, onValue, set, remove } from "firebase/database";

const BRANCH = "BNN : 790";
const DB_KEY = "sales_summary";

const SECTIONS = [
  {
    key: "iphone", title: "iPhone", emoji: "📱",
    fields: [
      { key: "iphone", label: "iPhone" },
      { key: "appIn", label: "App in" },
      { key: "approve", label: "Approve" },
      { key: "reject", label: "Reject" },
    ],
  },
  {
    key: "tradein", title: "Trade in / Buy", emoji: "🔄",
    fields: [
      { key: "tradeIn", label: "Trade in" },
      { key: "buy", label: "Buy" },
    ],
  },
  {
    key: "smartphone", title: "Smartphone", emoji: "📲",
    fields: [
      { key: "smartphone", label: "Smartphone" },
      { key: "smartAppIn", label: "App in" },
      { key: "smartApprove", label: "Approve" },
      { key: "smartReject", label: "Reject" },
    ],
  },
  {
    key: "brands", title: "Brands", emoji: "🏷️",
    fields: [
      { key: "oppo", label: "Oppo" },
      { key: "vivo", label: "Vivo" },
      { key: "xiaomi", label: "Xiaomi" },
      { key: "honor", label: "Honor" },
      { key: "infinix", label: "Infinix" },
      { key: "zte", label: "ZTE" },
      { key: "realme", label: "Realme" },
    ],
  },
  {
    key: "notebook", title: "Notebook", emoji: "💻",
    fields: [
      { key: "notebook", label: "Notebook" },
      { key: "noteAppIn", label: "App in" },
      { key: "noteApprove", label: "Approve" },
      { key: "noteReject", label: "Reject" },
    ],
  },
];

const ALL_FIELDS = SECTIONS.flatMap(s => s.fields.map(f => f.key));
const EMPTY = () => Object.fromEntries(ALL_FIELDS.map(k => [k, 0]));

function getTodayTH() {
  const now = new Date();
  const day = String(now.getDate()).padStart(2, "0");
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const year = now.getFullYear() + 543;
  return `${day}/${month}/${year}`;
}

function formatSummary(totals, notes) {
  const t = totals;
  const lines = [
    BRANCH, getTodayTH(), ``,
    `iPhone = ${t.iphone}`, `App in = ${t.appIn}`, `Approve = ${t.approve}`, `Reject = ${t.reject}`, ``,
    `Trade in = ${t.tradeIn}`, `Buy = ${t.buy}`, ``,
    `Smartphone = ${t.smartphone}`, `App in = ${t.smartAppIn}`, `Approve = ${t.smartApprove}`, `Reject = ${t.smartReject}`, ``,
    `Oppo = ${t.oppo}`, `Vivo = ${t.vivo}`, `Xiaomi = ${t.xiaomi}`, `Honor = ${t.honor}`,
    `Infinix = ${t.infinix}`, `ZTE = ${t.zte}`, `Realme = ${t.realme}`, ``,
    `Notebook = ${t.notebook}`, `App in = ${t.noteAppIn}`, `Approve = ${t.noteApprove}`, `Reject = ${t.noteReject}`,
  ];
  const noteText = notes.map(n => n.text).join("\n");
  if (noteText.trim()) lines.push(``, noteText.trim());
  return lines.join("\n");
}

export default function App() {
  const [inputs, setInputs] = useState(EMPTY());
  const [totals, setTotals] = useState(null);
  const [notes, setNotes] = useState([]);
  const [inputNote, setInputNote] = useState("");
  const [copied, setCopied] = useState(false);
  const [flash, setFlash] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // โหลดข้อมูลจาก Firebase แบบ real-time
  useEffect(() => {
    const dbRef = ref(db, DB_KEY);
    const unsub = onValue(dbRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        if (data.totals) setTotals(data.totals);
        if (data.notes) setNotes(data.notes);
      }
      setLoading(false);
    }, () => setLoading(false));
    return () => unsub();
  }, []);

  const saveToFirebase = async (t, n) => {
    setSaving(true);
    try {
      await set(ref(db, DB_KEY), { totals: t, notes: n });
    } catch (e) {
      console.error("Save failed:", e);
    } finally {
      setSaving(false);
    }
  };

  const handleChange = (key, val) => {
    const num = parseInt(val, 10);
    setInputs(prev => ({ ...prev, [key]: isNaN(num) ? 0 : Math.max(0, num) }));
  };

  const handleStep = (key, delta) => {
    setInputs(prev => ({ ...prev, [key]: Math.max(0, prev[key] + delta) }));
  };

  const handleUpdate = async () => {
    const base = totals ?? EMPTY();
    const newTotals = Object.fromEntries(ALL_FIELDS.map(k => [k, (base[k] || 0) + (inputs[k] || 0)]));
    const newNotes = inputNote.trim() ? [...notes, { id: Date.now(), text: inputNote.trim() }] : notes;
    setTotals(newTotals);
    setNotes(newNotes);
    setInputs(EMPTY());
    setInputNote("");
    setFlash(true);
    setTimeout(() => setFlash(false), 600);
    await saveToFirebase(newTotals, newNotes);
  };

  const handleDeleteNote = async (id) => {
    const n = notes.filter(x => x.id !== id);
    setNotes(n);
    await saveToFirebase(totals, n);
  };

  const handleReset = async () => {
    if (!window.confirm("ต้องการรีเซ็ตข้อมูลทั้งหมดหรือไม่?")) return;
    setTotals(null);
    setNotes([]);
    await remove(ref(db, DB_KEY));
  };

  const handleCopy = () => {
    if (!totals) return;
    navigator.clipboard.writeText(formatSummary(totals, notes)).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  if (loading) return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(135deg,#e0e7ff,#f0f4ff,#fce7f3)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "Sarabun,sans-serif", color: "#64748b", fontSize: 15 }}>
      ⏳ กำลังโหลดข้อมูล...
    </div>
  );

  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(135deg,#e0e7ff 0%,#f0f4ff 50%,#fce7f3 100%)", fontFamily: "'Sarabun','Segoe UI',sans-serif", display: "flex", flexDirection: "column", alignItems: "center", padding: "24px 16px 40px", color: "#1e293b" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Sarabun:wght@300;400;600;700&display=swap');
        * { box-sizing: border-box; }
        input[type=number]::-webkit-inner-spin-button,input[type=number]::-webkit-outer-spin-button{-webkit-appearance:none;margin:0;}
        input[type=number]{-moz-appearance:textfield;}
        .glass{background:rgba(255,255,255,0.55);border:1px solid rgba(255,255,255,0.8);border-radius:20px;backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);box-shadow:0 8px 32px rgba(100,120,200,0.1),0 1px 0 rgba(255,255,255,0.9) inset;}
        .step-btn{background:rgba(255,255,255,0.7);border:1px solid rgba(200,210,240,0.8);color:#4f46e5;width:30px;height:30px;border-radius:8px;cursor:pointer;font-size:16px;display:flex;align-items:center;justify-content:center;transition:background 0.15s,transform 0.1s;user-select:none;box-shadow:0 2px 6px rgba(0,0,0,0.06);flex-shrink:0;}
        .step-btn:hover{background:rgba(255,255,255,0.95);transform:scale(1.08);}
        .step-btn:active{transform:scale(0.95);}
        .num-input{background:rgba(255,255,255,0.6);border:1px solid rgba(200,210,240,0.8);border-radius:8px;color:#1e293b;font-size:17px;font-weight:700;text-align:center;width:52px;height:30px;box-shadow:0 1px 4px rgba(0,0,0,0.06) inset;}
        .update-btn{background:rgba(99,102,241,0.85);border:1px solid rgba(255,255,255,0.6);color:#fff;font-size:15px;font-weight:700;padding:13px 52px;border-radius:50px;cursor:pointer;letter-spacing:1px;backdrop-filter:blur(8px);box-shadow:0 4px 20px rgba(99,102,241,0.35);transition:transform 0.1s,box-shadow 0.15s,background 0.15s;}
        .update-btn:hover{transform:translateY(-2px);box-shadow:0 8px 28px rgba(99,102,241,0.45);background:rgba(99,102,241,0.95);}
        .update-btn:active{transform:scale(0.97);}
        .copy-btn{background:rgba(255,255,255,0.6);border:1px solid rgba(200,210,240,0.9);color:#4f46e5;padding:7px 18px;border-radius:10px;cursor:pointer;font-size:13px;font-weight:600;transition:background 0.15s;box-shadow:0 2px 6px rgba(0,0,0,0.05);}
        .copy-btn:hover{background:rgba(255,255,255,0.9);}
        .copy-btn:disabled{opacity:0.4;cursor:default;}
        .reset-btn{background:rgba(255,255,255,0.4);border:1px solid rgba(239,68,68,0.3);color:#ef4444;padding:6px 14px;border-radius:10px;cursor:pointer;font-size:13px;transition:background 0.15s;}
        .reset-btn:hover{background:rgba(254,226,226,0.7);}
        .summary-box{background:rgba(255,255,255,0.45);border:1px solid rgba(255,255,255,0.85);border-radius:14px;padding:16px;font-family:'Courier New',monospace;font-size:13px;line-height:1.85;color:#1e293b;white-space:pre-wrap;word-break:break-word;box-shadow:0 2px 8px rgba(0,0,0,0.04) inset;}
        .note-chip{display:flex;align-items:flex-start;gap:8px;background:rgba(255,255,255,0.55);border:1px solid rgba(200,210,240,0.8);border-radius:10px;padding:8px 10px;font-size:13px;color:#334155;box-shadow:0 1px 4px rgba(0,0,0,0.05);margin-bottom:6px;}
        .note-del{background:none;border:none;color:#94a3b8;cursor:pointer;font-size:15px;line-height:1;padding:0 2px;flex-shrink:0;margin-top:1px;transition:color 0.15s;}
        .note-del:hover{color:#ef4444;}
        .textarea-note{background:rgba(255,255,255,0.55);border:1px solid rgba(200,210,240,0.8);border-radius:12px;color:#1e293b;font-size:14px;padding:10px 12px;resize:vertical;width:100%;min-height:52px;font-family:'Sarabun',sans-serif;box-shadow:0 1px 4px rgba(0,0,0,0.05) inset;}
        .textarea-note::placeholder{color:#94a3b8;}
        .flash{animation:flashAnim 0.5s ease;}
        @keyframes flashAnim{0%,100%{opacity:1}50%{opacity:0.5}}
        .section-header{display:flex;align-items:center;gap:8px;padding:10px 14px;background:rgba(99,102,241,0.08);border-radius:12px;margin-bottom:4px;}
        .field-row{display:flex;align-items:center;justify-content:space-between;padding:8px 14px;border-radius:10px;transition:background 0.1s;}
        .field-row:hover{background:rgba(255,255,255,0.5);}
        .field-label{font-size:14px;font-weight:600;color:#334155;min-width:90px;}
        .section-divider{border:none;border-top:1px solid rgba(200,210,240,0.5);margin:8px 0;}
        .label-text{font-size:12px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:1.5px;}
        .save-dot{display:inline-block;width:7px;height:7px;border-radius:50%;background:#22c55e;margin-left:6px;vertical-align:middle;animation:pulse 1s infinite;}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:0.3}}
      `}</style>

      <div style={{ textAlign: "center", marginBottom: 20 }}>
        <div style={{ fontSize: 11, color: "#94a3b8", letterSpacing: 3, textTransform: "uppercase", marginBottom: 2 }}>Daily</div>
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, color: "#3730a3" }}>Sales Summary</h1>
        <div style={{ fontSize: 12, color: "#6366f1", marginTop: 4, fontWeight: 600 }}>{BRANCH} · {getTodayTH()}</div>
        <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>🔥 ซิงค์ข้อมูล real-time</div>
      </div>

      <div className="glass" style={{ width: "100%", maxWidth: 460, padding: "18px 12px", marginBottom: 16 }}>
        <div className="label-text" style={{ marginBottom: 14, paddingLeft: 6 }}>กรอกยอดประจำวัน</div>
        {SECTIONS.map((section, si) => (
          <div key={section.key}>
            <div className="section-header">
              <span style={{ fontSize: 16 }}>{section.emoji}</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: "#4f46e5" }}>{section.title}</span>
            </div>
            {section.fields.map(({ key, label }) => (
              <div key={key} className="field-row">
                <div className="field-label">{label}</div>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <button className="step-btn" onClick={() => handleStep(key, -1)}>−</button>
                  <input className="num-input" type="number" min="0" value={inputs[key]} onChange={e => handleChange(key, e.target.value)} />
                  <button className="step-btn" onClick={() => handleStep(key, 1)}>+</button>
                </div>
              </div>
            ))}
            {si < SECTIONS.length - 1 && <hr className="section-divider" />}
          </div>
        ))}
        <hr className="section-divider" style={{ marginTop: 12 }} />
        <div style={{ paddingLeft: 6, paddingRight: 6 }}>
          <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 6 }}>📝 หมายเหตุ (ถ้ามี)</div>
          <textarea className="textarea-note" placeholder="พิมพ์หมายเหตุที่นี่..." value={inputNote} onChange={e => setInputNote(e.target.value)} />
        </div>
      </div>

      <button className="update-btn" onClick={handleUpdate} style={{ marginBottom: 20 }}>
        💾 UPDATE
      </button>

      <div className="glass" style={{ width: "100%", maxWidth: 460, padding: "18px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <div className="label-text">สรุปยอด {saving && <span className="save-dot" />}</div>
          <div style={{ display: "flex", gap: 8 }}>
            {totals && <button className="reset-btn" onClick={handleReset}>รีเซ็ต</button>}
            <button className="copy-btn" onClick={handleCopy} disabled={!totals}>
              {copied ? "✓ คัดลอกแล้ว" : "📋 คัดลอก"}
            </button>
          </div>
        </div>
        <div className={`summary-box ${flash ? "flash" : ""}`} style={{ marginBottom: notes.length ? 12 : 0 }}>
          {totals
            ? formatSummary(totals, notes)
            : <span style={{ color: "#94a3b8", fontFamily: "Sarabun,sans-serif", fontSize: 14 }}>ยังไม่มีข้อมูล กรอกแล้วกด UPDATE</span>
          }
        </div>
        {notes.length > 0 && (
          <div>
            <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 8 }}>📝 หมายเหตุ</div>
            {notes.map(n => (
              <div key={n.id} className="note-chip">
                <span style={{ flex: 1 }}>{n.text}</span>
                <button className="note-del" onClick={() => handleDeleteNote(n.id)}>✕</button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{ marginTop: 16, fontSize: 11, color: "#94a3b8" }}>กดปุ่มคัดลอกเพื่อนำไปวางได้เลย</div>
    </div>
  );
}