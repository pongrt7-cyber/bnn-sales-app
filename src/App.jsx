import { useState, useEffect, useRef } from "react";
import { db } from "./firebase";
import { ref, onValue, set, remove, push } from "firebase/database";
import Tesseract from "tesseract.js"; 

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
  const [page, setPage] = useState("main"); 
  
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

  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrProgress, setOcrProgress] = useState(0); 
  const [ocrData, setOcrData] = useState({ id: "", fname: "", lname: "", address: "", rawText: "" });
  
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const fileInputRef = useRef(null);

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

  // --- Camera & Cropping OCR Logic ---
  const startCamera = async () => {
    setIsCameraOpen(true);
    setOcrData({ id: "", fname: "", lname: "", address: "", rawText: "" });
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: "environment" } 
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (err) {
      alert("ไม่สามารถเปิดกล้องได้ กรุณาตรวจสอบการอนุญาตใช้งานกล้อง");
      setIsCameraOpen(false);
    }
  };

  const stopCamera = () => {
    if (videoRef.current && videoRef.current.srcObject) {
      videoRef.current.srcObject.getTracks().forEach(track => track.stop());
    }
    setIsCameraOpen(false);
  };

  const processCroppedImage = async (imageSource) => {
    setOcrLoading(true);
    setOcrProgress(0);
    setOcrData({ id: "", fname: "", lname: "", address: "", rawText: "" });

    try {
      const img = new Image();
      img.src = imageSource;
      await new Promise(r => img.onload = r);

      // สร้าง Canvas แม่แบบ เพื่อจัดขนาดให้เป็นมาตรฐาน 856x540 เสมอ
      const cardCanvas = document.createElement("canvas");
      cardCanvas.width = 856;
      cardCanvas.height = 540;
      const ctxCard = cardCanvas.getContext("2d");

      // ครอปเฉพาะส่วนตรงกลางของรูป (เผื่อถ่ายภาพมาติดพื้นหลังเยอะ)
      const iw = img.width;
      const ih = img.height;
      let cw = iw;
      let ch = cw / 1.585;
      if (ch > ih) {
         ch = ih;
         cw = ch * 1.585;
      }
      const cx = (iw - cw) / 2;
      const cy = (ih - ch) / 2;
      ctxCard.drawImage(img, cx, cy, cw, ch, 0, 0, 856, 540);

      // สร้าง Canvas ใหม่สำหรับต่อภาพ 3 ชิ้นส่วน
      const compCanvas = document.createElement("canvas");
      compCanvas.width = 500;
      compCanvas.height = 340; 
      const ctxComp = compCanvas.getContext("2d");
      ctxComp.fillStyle = "white";
      ctxComp.fillRect(0, 0, 500, 340);

      // 1. ครอปเลขบัตร (ดึงมุมขวาบน)
      ctxComp.drawImage(cardCanvas, 420, 30, 410, 80, 0, 0, 410, 80);
      // 2. ครอปชื่อ-สกุล (ดึงช่วงกลางบน)
      ctxComp.drawImage(cardCanvas, 200, 130, 500, 80, 0, 80, 500, 80);
      // 3. ครอปที่อยู่ (ดึงช่วงซ้ายล่าง)
      ctxComp.drawImage(cardCanvas, 60, 290, 500, 180, 0, 160, 500, 180);

      const compositeDataUrl = compCanvas.toDataURL("image/jpeg");

      const { data: { text } } = await Tesseract.recognize(
        compositeDataUrl, 
        'tha+eng',
        {
          logger: m => {
            if (m && typeof m.progress === 'number') {
              setOcrProgress(Math.round(m.progress * 100));
            }
          }
        }
      );
      
      let parsed = { id: "", fname: "", lname: "", address: "", rawText: text };
      const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

      const digitsOnly = text.replace(/\D/g, '');
      const idMatch = digitsOnly.match(/\d{13}/);
      if (idMatch) parsed.id = idMatch[0];

      const thaiOnlyText = text.replace(/[A-Za-z=)("*-]/g, ' '); 
      const nameMatch = thaiOnlyText.match(/(นาย|นาง|นางสาว|ด\.ช\.|ด\.ญ\.)\s*([ก-๙]+)\s+([ก-๙]+)/);
      if (nameMatch) {
        parsed.fname = nameMatch[2].trim(); 
        parsed.lname = nameMatch[3].trim();
      }

      const addrIndex = lines.findIndex(l => l.includes('หมู่') || l.includes('ต.') || l.includes('ตำบล'));
      if (addrIndex !== -1) {
        let rawAddr = lines.slice(addrIndex).join(' ');
        rawAddr = rawAddr.replace(/ที่อยู่/g, '')
                         .replace(/[A-Za-z=)("*-]/g, '')
                         .replace(/พ\.ศ\.|ม\.ค\.|ก\.พ\.|มี\.ค\.|เม\.ย\.|พ\.ค\.|มิ\.ย\.|ก\.ค\.|ส\.ค\.|ก\.ย\.|ต\.ค\.|พ\.ย\.|ธ\.ค\./g, '')
                         .replace(/\d{1,2}\s+\d{4}/g, '') 
                         .replace(/\s{2,}/g, ' ')
                         .trim();
        parsed.address = rawAddr;
      }

      setOcrData(parsed);
    } catch (err) {
      alert("อ่านข้อความไม่สำเร็จ กรุณาลองถ่ายรูปใหม่อีกครั้งครับ");
    } finally {
      setOcrLoading(false);
    }
  };

  const captureAndScan = () => {
    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    
    const imageDataUrl = canvas.toDataURL("image/jpeg");
    stopCamera();
    processCroppedImage(imageDataUrl);
  };

  const copyToClipboard = (text) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
  };

  if (loading) return (
    <div style={{ minHeight:"100vh", background:"linear-gradient(135deg,#e0e7ff,#f0f4ff,#fce7f3)", display:"flex", alignItems:"center", justifyContent:"center", fontFamily:"Sarabun,sans-serif", color:"#64748b", fontSize:15 }}>
      กำลังโหลดข้อมูล
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
        .section-header{padding:10px 14px;background:rgba(99,102,241,0.08);border-radius:12px;margin-bottom:4px;}
        .field-row{display:flex;align-items:center;justify-content:space-between;padding:8px 14px;border-radius:10px;transition:background 0.1s;}
        .field-row:hover{background:rgba(255,255,255,0.5);}
        .field-label{font-size:14px;font-weight:600;color:#334155;min-width:90px;}
        .section-divider{border:none;border-top:1px solid rgba(200,210,240,0.5);margin:8px 0;}
        .label-text{font-size:12px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:1.5px;}
        .log-item{background:rgba(255,255,255,0.5);border:1px solid rgba(200,210,240,0.7);border-radius:12px;padding:10px 14px;margin-bottom:8px;}
        .log-time{font-size:12px;color:#6366f1;font-weight:700;margin-bottom:4px;}
        .log-change{font-size:13px;color:#334155;line-height:1.6;}
        .log-note{font-size:12px;color:#94a3b8;margin-top:2px;}
        .menu-btn{background:rgba(255,255,255,0.6);border:1px solid rgba(200,210,240,0.8);border-radius:10px;padding:6px 14px;cursor:pointer;font-size:13px;font-weight:700;color:#4f46e5;transition:background 0.15s;}
        .menu-btn:hover{background:rgba(255,255,255,0.9);}
        .ocr-input{width:100%;background:rgba(255,255,255,0.7);border:1px solid rgba(200,210,240,0.9);border-radius:8px;padding:8px 12px;font-family:'Sarabun',sans-serif;font-size:14px;color:#1e293b;}
        .ocr-copy-btn{background:#e0e7ff;border:1px solid #c7d2fe;color:#4f46e5;border-radius:8px;padding:8px 12px;cursor:pointer;font-weight:600;font-size:13px;min-width:65px;}
        .ocr-copy-btn:hover{background:#c7d2fe;}
        
        .camera-container{position:relative;width:100%;max-width:400px;margin:0 auto 16px;border-radius:12px;overflow:hidden;background:#000;}
        .camera-video{width:100%;display:block;object-fit:cover;aspect-ratio:1.585/1;}
        .camera-overlay{position:absolute;top:0;left:0;right:0;bottom:0;box-shadow:0 0 0 9999px rgba(0,0,0,0.6);border:2px solid #22c55e;width:100%;height:100%;margin:auto;pointer-events:none;}
        .camera-btn-bar{display:flex;justify-content:center;gap:12px;margin-top:12px;}
        .capture-btn{background:#22c55e;color:#fff;border:none;padding:10px 24px;border-radius:50px;font-weight:700;font-size:14px;cursor:pointer;}
        .cancel-btn{background:rgba(255,255,255,0.3);color:#1e293b;border:1px solid #94a3b8;padding:10px 24px;border-radius:50px;font-weight:700;font-size:14px;cursor:pointer;}
      `}</style>

      <div style={{ width:"100%", maxWidth:460, display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:20 }}>
        <div style={{ width: 85 }}></div> 
        <div style={{ textAlign:"center", flex:1 }}>
          <h1 style={{ margin:0, fontSize:22, fontWeight:700, color:"#3730a3" }}>
            {page === "main" ? "Sales Summary" : "สแกนบัตร ปชช."}
          </h1>
          {page === "main" && (
            <>
              <div style={{ fontSize:11, color:"#6366f1", fontWeight:600 }}>{BRANCH} . {getTodayTH()}</div>
              <div style={{ fontSize:11, color:"#94a3b8", marginTop:2 }}>บันทึกอัตโนมัติ . รีเซ็ตทุกวัน</div>
            </>
          )}
        </div>
        <button className="menu-btn" onClick={() => {
          if (page === "scanner" && isCameraOpen) stopCamera();
          setPage(page === "main" ? "scanner" : "main");
        }} style={{ width: 85, textAlign: "center" }}>
          {page === "main" ? "สแกนบัตร" : "หน้าหลัก"}
        </button>
      </div>

      {page === "scanner" && (
        <div className="glass" style={{ width:"100%", maxWidth:460, padding:"18px 12px" }}>
          
          {!isCameraOpen && !ocrLoading && (
            <div style={{ textAlign:"center", marginBottom:20 }}>
              <button className="update-btn" onClick={startCamera} style={{ width:"100%", marginBottom:12 }}>
                เปิดกล้องถ่ายบัตร
              </button>
              <div style={{ color:"#94a3b8", fontSize:12, marginBottom:12 }}>หรืออัปโหลดรูปภาพ</div>
              <input 
                type="file" 
                accept="image/*" 
                onChange={(e) => {
                  const file = e.target.files[0];
                  if (file) {
                    const reader = new FileReader();
                    reader.onload = (event) => processCroppedImage(event.target.result);
                    reader.readAsDataURL(file);
                  }
                }} 
                style={{ display: "block", width: "100%", padding: "8px", background: "rgba(255,255,255,0.5)", borderRadius: "8px", fontFamily: "Sarabun, sans-serif" }}
              />
            </div>
          )}

          {isCameraOpen && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize:12, color:"#ef4444", textAlign:"center", marginBottom:8, fontWeight:600 }}>
                กรุณาจัดวางบัตรให้เต็มและพอดีกับกรอบมากที่สุด
              </div>
              <div className="camera-container">
                <video ref={videoRef} className="camera-video" autoPlay playsInline></video>
                <div className="camera-overlay"></div>
              </div>
              <canvas ref={canvasRef} style={{ display: "none" }}></canvas>
              
              <div className="camera-btn-bar">
                <button className="cancel-btn" onClick={stopCamera}>ยกเลิก</button>
                <button className="capture-btn" onClick={captureAndScan}>สแกนข้อความ</button>
              </div>
            </div>
          )}

          {ocrLoading && (
            <div style={{ textAlign:"center", color:"#4f46e5", fontWeight:600, padding:"20px 0", fontSize:16 }}>
              กำลังถอดข้อความ {ocrProgress}%
            </div>
          )}

          {!ocrLoading && !isCameraOpen && ocrData.rawText && (
            <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
              <div style={{ fontSize:12, color:"#ef4444", textAlign:"center", fontWeight:600 }}>
                ตรวจสอบและแก้ไขข้อความให้ถูกต้องก่อนคัดลอก
              </div>

              <div>
                <div className="label-text" style={{ marginBottom:4 }}>เลขประจำตัวบัตรประชาชน 13 หลัก</div>
                <div style={{ display:"flex", gap:6 }}>
                  <input className="ocr-input" value={ocrData.id} onChange={e => setOcrData({...ocrData, id: e.target.value})} />
                  <button className="ocr-copy-btn" onClick={() => copyToClipboard(ocrData.id)}>คัดลอก</button>
                </div>
              </div>
              
              <div>
                <div className="label-text" style={{ marginBottom:4 }}>ชื่อจริง</div>
                <div style={{ display:"flex", gap:6 }}>
                  <input className="ocr-input" value={ocrData.fname} onChange={e => setOcrData({...ocrData, fname: e.target.value})} />
                  <button className="ocr-copy-btn" onClick={() => copyToClipboard(ocrData.fname)}>คัดลอก</button>
                </div>
              </div>

              <div>
                <div className="label-text" style={{ marginBottom:4 }}>นามสกุล</div>
                <div style={{ display:"flex", gap:6 }}>
                  <input className="ocr-input" value={ocrData.lname} onChange={e => setOcrData({...ocrData, lname: e.target.value})} />
                  <button className="ocr-copy-btn" onClick={() => copyToClipboard(ocrData.lname)}>คัดลอก</button>
                </div>
              </div>

              <div>
                <div className="label-text" style={{ marginBottom:4 }}>ที่อยู่ตามบัตร</div>
                <div style={{ display:"flex", gap:6 }}>
                  <textarea className="ocr-input" rows={3} value={ocrData.address} onChange={e => setOcrData({...ocrData, address: e.target.value})} />
                  <button className="ocr-copy-btn" onClick={() => copyToClipboard(ocrData.address)}>คัดลอก</button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {page === "main" && (
        <>
          <div className="glass" style={{ width:"100%", maxWidth:460, padding:"18px 12px", marginBottom:16 }}>
            <div className="label-text" style={{ marginBottom:14, paddingLeft:6 }}>กรอกยอดประจำวัน</div>

            <div className="section-header">
              <span style={{ fontSize:13, fontWeight:700, color:"#4f46e5" }}>iPhone</span>
            </div>
            {IPHONE_FIELDS.map(({ key, label }) => (
              <div key={key} className="field-row">
                <div className="field-label">{label}</div>
                <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                  <button className="step-btn" onClick={() => step(key, -1)}>-</button>
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
                  <button className="step-btn" onClick={() => step(key, -1)}>-</button>
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
                    <button className="note-del" onClick={() => handleDeleteNote(n.id)}>ลบ</button>
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
                      {isSubtract ? "ลดยอด" : "เพิ่มยอด"} . {log.time} น.
                    </div>
                    <div className="log-change">
                      {log.changes?.map((c, ci) => {
                        const isMinus = c.delta < 0;
                        return (
                          <span key={ci} style={{ marginRight:8 }}>
                            <span style={{ color: isMinus ? "#ef4444" : "#16a34a", fontWeight:700 }}>
                              {isMinus ? "-" : "+"}{Math.abs(c.delta)}
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

      <div style={{ marginTop:16, fontSize:11, color:"#94a3b8" }}>กดปุ่มคัดลอกเพื่อนำไปวางได้เลย</div>
    </div>
  );
}