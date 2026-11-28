// ============================================================
//  ตั้งค่าเสียงเอฟเฟกต์ / เพลงธีมแบบ custom (ไฟล์นี้ไม่บังคับ ไม่ใส่อะไรเลยเกมก็ใช้เสียงเดิม)
//
//  วิธีใช้: ใส่ไฟล์เสียง (mp3 / ogg / wav) ไว้ในโฟลเดอร์ assets/sfx/ และ assets/music/
//  แล้วเอา path มาใส่ด้านล่าง  ใส่เป็นรายการ [ ... ] ได้ จะสุ่มเล่นทีละไฟล์
//  อยากลองโดยไม่แก้โค้ด: กดปุ่ม "🎵 ตั้งค่าเสียง" ในเกมแล้วเลือกไฟล์จากเครื่องได้เลย (ไฟล์ที่เลือกในเกมจะ "ทับ" ไฟล์ในนี้)
//
//  ชื่อเสียงเอฟเฟกต์ที่ใส่ได้:
//    click start shoot kick meta dodge hit dash note wave deflect
//    slash erase rewind accel slow word breakdown ko win draw
// ============================================================
const SOUND_CONFIG = {
  sfx: {
    erase: "assets/sfx/erase.mp3",
    meta: "assets/sfx/meta.mp3",
    rewind: "assets/sfx/rewind.mp3",
    slow: "assets/sfx/slow.mp3",
    accel: "assets/sfx/accel.mp3"
    // shoot: "assets/sfx/shoot.mp3",
    // hit: ["assets/sfx/hit1.mp3", "assets/sfx/hit2.mp3"],
    // slash: "assets/sfx/slash.ogg",
  },

  music: {
    // เพลงธีมที่เล่นเมื่อมีฝั่งที่ "ได้เปรียบ" (เลือดนำ) ถ้าตัวละครของฝั่งนั้นไม่มีธีมของตัวเอง จะใช้เพลงนี้แทน
    // advantage: "assets/music/advantage.mp3",

    // ธีมประจำตัวละคร: เล่นตอนตัวละครนั้นนำอยู่ (ชื่อตัวละครคือชื่อ key ใน js/characters.js)
    characters: {
      redmist: "assets/music/redmist.mp3",
      isagi: "assets/music/isagi.mp3",
      // funx: "assets/music/funx.mp3",
      // florentino: "assets/music/florentino.mp3",
    },
  },

  // เพลงโหมดคลื่น (Survival Waves) — ไม่ตั้งอะไรเลยก็มีเพลงสังเคราะห์ในตัวให้ครบ
  // ชื่อธีมในตัว: calm early mid late boss boss2 finale zombie skibidi
  // ค่าที่ใส่ในช่องด้านล่างคือ "ชื่อธีม" (ของในตัวหรือที่คุณตั้งเองใน files)
  waves: {
    // ผูกไฟล์เพลงของคุณกับชื่อธีม: ชื่อเดียวกับธีมในตัว = ใช้ไฟล์แทนเพลงในตัว / ชื่อใหม่ = ธีมใหม่ของคุณ
    files: {
      // boss: "assets/music/my-boss.mp3",
      // wave15: "assets/music/wave15.mp3",
    },
    break: "calm",                       // ช่วงพักระหว่างคลื่น
    fight: [                             // เพลงตอนสู้ตามเลขคลื่น (upTo = ถึงคลื่นที่เท่าไร)
      { upTo: 3, music: "early" },
      { upTo: 7, music: "mid" },
      { music: "late" },                 // นอกนั้น
    ],
    boss: "boss",                        // คลื่นที่มีบอส
    finale: "finale",                    // คลื่นสุดท้ายของโหมดที่จำกัดจำนวนคลื่น
    byWave: { 10: "boss2" },             // เพลงเฉพาะด่าน: เลขคลื่น -> ธีม (ชนะทุกกฎ) เช่น { 3: "zombie", 15: "wave15" }
    byCategory: { zombie: "zombie", skibidi: "skibidi" }, // เพลงประจำหมวดศัตรู (ใช้กับคลื่นธรรมดา)
  },

  // เกณฑ์ "ได้เปรียบ" วัดจากเลือดรวมของฝั่ง (เปอร์เซ็นต์ของเลือดเต็ม)
  advantage: {
    lead: 25,     // นำฝั่งที่สองอยู่กี่ % ถึงเริ่มเล่นเพลง
    release: 10,  // นำเหลือน้อยกว่ากี่ % เพลงถึงจะเฟดออก (กันเพลงเปลี่ยนไปมา)
    minHold: 4,   // เล่นแล้วอย่างน้อยกี่วินาทีก่อนจะเปลี่ยน/หยุด
  },
};

if (typeof window !== "undefined") window.SOUND_CONFIG = SOUND_CONFIG;
