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
      isagi: "asseets/music/isagi.mp3",
      // funx: "assets/music/funx.mp3",
      // florentino: "assets/music/florentino.mp3",
    },
  },

  // เกณฑ์ "ได้เปรียบ" วัดจากเลือดรวมของฝั่ง (เปอร์เซ็นต์ของเลือดเต็ม)
  advantage: {
    lead: 25,     // นำฝั่งที่สองอยู่กี่ % ถึงเริ่มเล่นเพลง
    release: 10,  // นำเหลือน้อยกว่ากี่ % เพลงถึงจะเฟดออก (กันเพลงเปลี่ยนไปมา)
    minHold: 4,   // เล่นแล้วอย่างน้อยกี่วินาทีก่อนจะเปลี่ยน/หยุด
  },
};

if (typeof window !== "undefined") window.SOUND_CONFIG = SOUND_CONFIG;
