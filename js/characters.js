// ============================================================
//  ตัวละครทั้งหมดของเกมอยู่ในไฟล์นี้
//  อยากเพิ่มตัวใหม่: ใส่ PNG ไว้ใน assets/characters/<ชื่อ>/ แล้วเพิ่มบล็อกใหม่ด้านล่าง
//
//  frames  = ชื่อท่า -> path ของ PNG  (ต้องมี "idle" เสมอ)
//            ภาพควรหันหน้าไปทาง "ขวา" เกมจะกลับด้านให้เองเวลาศัตรูอยู่ฝั่งซ้าย
//  skill   = สกิลที่ใช้เองอัตโนมัติเมื่อคูลดาวน์หมด
//     type "projectile": ยิงกระสุนใส่ศัตรู
//     type "dash":       พุ่งเข้าใส่ศัตรู (ชนแล้วดาเมจแรงขึ้น)
//     frame      = ท่าที่จะสลับไปใช้ตอนใช้สกิล
//     duration   = ท่านั้นค้างกี่วินาที
// ============================================================
const CHARACTERS = {
  gunner: {
    name: "Gunner",
    color: "#3c6ec8",
    hp: 100,
    speed: 190,
    radius: 38,
    contactDamage: 4,
    frames: {
      idle: "assets/characters/gunner/idle.png",
      shoot: "assets/characters/gunner/shoot.png",
    },
    skill: {
      type: "projectile",
      cooldown: 1.6,
      frame: "shoot",
      duration: 0.35,
      fireDelay: 0.12,
      damage: 7,
      projectileSpeed: 520,
      projectileRadius: 7,
    },
  },

  dasher: {
    name: "Dasher",
    color: "#c83c46",
    hp: 120,
    speed: 170,
    radius: 40,
    contactDamage: 5,
    frames: {
      idle: "assets/characters/dasher/idle.png",
      dash: "assets/characters/dasher/dash.png",
    },
    skill: {
      type: "dash",
      cooldown: 2.2,
      frame: "dash",
      duration: 0.55,
      speedMult: 3.2,
      contactBonus: 3, // ตอนพุ่ง ดาเมจจากการชนคูณเท่านี้
    },
  },
};

// เลขเวอร์ชันของไฟล์นี้ (main.js ใช้ตรวจว่าโหลดไฟล์ครบและตรงกันหรือไม่)
if (typeof window !== "undefined") (window.BB_FILES = window.BB_FILES || {}).characters = 5;

if (typeof module !== "undefined") module.exports = { CHARACTERS };
