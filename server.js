import express from "express";
import fetch from "node-fetch";
import cors from "cors";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json());

// ให้เสิร์ฟไฟล์หน้าเว็บ
app.use(express.static(path.join(__dirname, "public")));

/**
 * 1) ดึงราคาเหรียญ
 * - พยายามดึงจาก CoinGecko ก่อน
 * - ถ้าไม่มี id บน CG จะ fallback เป็น mock 2.5-3.0 THB แบบสุ่มเล็กน้อย
 * ใช้: GET /api/price?id=caet&vs=thb
 */
app.get("/api/price", async (req, res) => {
  const id = (req.query.id || "binancecoin").toLowerCase(); // เปลี่ยนเป็น id token ของคุณถ้ามีบน CG
  const vs = (req.query.vs || "usd").toLowerCase();

  const url = `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(
    id
  )}&vs_currencies=${encodeURIComponent(vs)}&include_24hr_change=true`;

  try {
    const r = await fetch(url);
    if (!r.ok) throw new Error(`CG error ${r.status}`);
    const j = await r.json();

    if (!j[id] || j[id][vs] == null) {
      // Fallback mock (2.5-3 THB)
      const mock = (2.5 + Math.random() * 0.5).toFixed(2);
      return res.json({
        source: "fallback",
        id,
        vs,
        price: Number(mock),
        change24h: 0
      });
    }

    return res.json({
      source: "coingecko",
      id,
      vs,
      price: j[id][vs],
      change24h: j[id][`${vs}_24h_change`] ?? 0
    });
  } catch (e) {
    // Fallback เมื่อดึงไม่ได้
    const mock = (2.5 + Math.random() * 0.5).toFixed(2);
    return res.json({
      source: "fallback-error",
      id,
      vs,
      price: Number(mock),
      change24h: 0
    });
  }
});

/**
 * 2) ดึงประวัติธุรกรรม (โทเคน) โดย proxy ไป BscScan Testnet
 * - ใช้ action=tokentx (ธุรกรรมโทเคนทั้งหมดที่เกี่ยวข้องกับ address)
 * ใช้: GET /api/txs?address=0x...&startblock=0
 */
app.get("/api/txs", async (req, res) => {
  const addr = (req.query.address || "").trim();
  const startblock = req.query.startblock || "0";
  if (!addr) return res.status(400).json({ error: "address required" });

  const apiKey = process.env.BSC_API_KEY || "demo";
  // Testnet host:
  const host = "https://api-testnet.bscscan.com/api";
  // ถ้าอยากใช้ mainnet: https://api.bscscan.com/api

  const qs = new URLSearchParams({
    module: "account",
    action: "tokentx",
    address: addr,
    startblock,
    endblock: "99999999",
    sort: "desc",
    apikey: apiKey
  });

  const url = `${host}?${qs.toString()}`;

  try {
    const r = await fetch(url);
    const j = await r.json();
    // BscScan รูปแบบ { status, message, result }
    if (!j || !j.result) throw new Error("Invalid response");
    return res.json(j.result.slice(0, 50)); // limit 50 รายการ
  } catch (e) {
    return res.status(500).json({ error: e.message || "fetch failed" });
  }
});

// ถ้าไม่มี route ตรงกัน ให้ส่ง index.html (รองรับ SPA)
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running http://localhost:${PORT}`);
});