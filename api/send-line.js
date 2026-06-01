export default async function handler(req, res) {
  // บังคับให้รองรับ CORS จากหน้าเว็บ GitHub Pages ของนาย
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).send('Method Not Allowed');
  }

  const LINE_TOKEN = "DZtzVOrRGyk9bqfdYF/ubTGczoaaz6j7nWC6WuYIs1S6RagjkIXkZJIUYxeQaxbKTytwGmFtN6BuY6zyjvsjo46gVi8m3Co3giVwlSK6I69A3107tXSFFEId6zlEIOjYdqn4rDuxEf2OsBL51MSSMQdB04t89/1O/w1cDnyilFU=";
  const LINE_GROUP_ID = "C4b5cc9e7270d5164954d6e44eae8ae23";

  try {
    const { message } = req.body;
    
    const response = await fetch("https://api.line.me/v2/bot/message/push", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${LINE_TOKEN}`,
      },
      body: JSON.stringify({
        to: LINE_GROUP_ID,
        messages: [{ type: "text", text: message }],
      }),
    });

    return res.status(200).json({ success: true });
  } catch (error) {
    return res.status(500).send(error.toString());
  }
}