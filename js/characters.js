// ============================================================
//  ตัวละครทั้งหมดของเกมอยู่ในไฟล์นี้
//  อยากเพิ่มตัวใหม่: ใส่ PNG ไว้ใน assets/characters/<ชื่อ>/ แล้วเพิ่มบล็อกใหม่ด้านล่าง
//
//  กติกา: ตัวละครชนกันไม่เกิดดาเมจ ดาเมจมาจากสกิลเท่านั้น
//
//  frames  = ชื่อท่า -> path ของ PNG  (ต้องมี "idle" เสมอ)
//            ภาพควรหันหน้าไปทาง "ขวา" เกมจะกลับด้านให้เองเวลาศัตรูอยู่ฝั่งซ้าย
//  skills  = รายการสกิล (ใส่กี่สกิลก็ได้) ใช้เองอัตโนมัติเมื่อคูลดาวน์หมด แต่ละสกิลมีคูลดาวน์ของตัวเอง
//
//  ค่าที่ทุกสกิลมี
//     type       = ชนิดสกิล (ดูด้านล่าง)
//     name       = ชื่อสกิลที่โชว์ในแผงข้อมูลผู้เล่น
//     cooldown   = คูลดาวน์ (วินาที)
//     frame      = ท่า (ชื่อใน frames) ที่จะสลับไปใช้ตอนใช้สกิล
//     duration   = ท่านั้นค้างกี่วินาที
//     damage     = ดาเมจต่อการโดนหนึ่งครั้ง
//     fireDelay  = หน่วงกี่วินาทีหลังเปลี่ยนท่า ก่อนสกิลออกจริง
//
//  ชนิดสกิล
//   "projectile"  ยิงกระสุน/โน้ตใส่ศัตรู
//        count, interval  ยิงกี่ลูก ห่างกันกี่วินาที (เป็นชุด)
//        spread           มุมกระจาย (เรเดียน) ให้ทิศคลาดเคลื่อนสุ่มๆ
//        projectileSpeed, projectileRadius
//        shape: "ball" | "note"   หน้าตากระสุน (note = โน้ตดนตรี)
//        wobble, wobbleFreq       ให้ลอยส่ายเป็นลอน (px, ความถี่)
//        sound: "shoot" | "note"  เสียงตอนยิง
//   "dash"        พุ่งเข้าหาศัตรู ชนครั้งแรกในการพุ่งแต่ละครั้งทำดาเมจ
//        speedMult, homing (เลี้ยวเข้าหาศัตรูระหว่างพุ่ง เรเดียน/วินาที), knockback
//   "shockwave"   ปล่อยคลื่นเสียงเป็นส่วนโค้งแผ่ออกไปทางศัตรู โดนแล้วกระเด็น
//        waveSpeed, waveRange, waveArcDeg (มุมกว้างของคลื่น องศา), knockback
// ============================================================
const CHARACTERS = {
  gunner: {
    name: "Gunner",
    color: "#3c6ec8",
    hp: 100,
    speed: 190,
    radius: 38,
    frames: {
      idle: "assets/characters/gunner/idle.png",
      shoot: "assets/characters/gunner/shoot.png",
    },
    skills: [
      {
        type: "projectile",
        name: "ยิงปืน",
        cooldown: 1.4,
        frame: "shoot",
        duration: 0.35,
        fireDelay: 0.12,
        damage: 11,
        projectileSpeed: 520,
        projectileRadius: 7,
      },
    ],
  },

  dasher: {
    name: "Dasher",
    color: "#c83c46",
    hp: 120,
    speed: 170,
    radius: 40,
    frames: {
      idle: "assets/characters/dasher/idle.png",
      dash: "assets/characters/dasher/dash.png",
    },
    skills: [
      {
        type: "dash",
        name: "พุ่งชน",
        cooldown: 2.1,
        frame: "dash",
        duration: 0.55,
        speedMult: 3.2,
        homing: 2.2,
        damage: 16,
        knockback: 300,
      },
    ],
  },

  // ภาพของ Singer ที่ให้ไว้เป็นภาพชั่วคราว: ใส่ PNG ของคุณทับชื่อไฟล์เดิมได้เลย (ดูวิธีใน README)
  singer: {
    name: "Singer",
    color: "#a64bd6",
    hp: 97,
    speed: 175,
    radius: 38,
    frames: {
      idle: "assets/characters/singer/idle.png", // ท่ายืนปกติ
      sing: "assets/characters/singer/sing.png", // ท่าร้องเพลง (ตอนปล่อยโน้ต)
      wave: "assets/characters/singer/wave.png", // ท่าตะโกน/กระแทกคลื่นเสียง
    },
    skills: [
      {
        type: "projectile",
        name: "ร้องเพลง (โน้ต)",
        cooldown: 2.75,
        frame: "sing",
        duration: 1.0,
        fireDelay: 0.15,
        count: 4,
        interval: 0.2,
        spread: 0.25,
        damage: 3,
        projectileSpeed: 360,
        projectileRadius: 11,
        shape: "note",
        wobble: 14,
        wobbleFreq: 9,
        sound: "note",
      },
      {
        type: "shockwave",
        name: "คลื่นเสียง",
        cooldown: 5.0,
        frame: "wave",
        duration: 0.6,
        fireDelay: 0.2,
        damage: 12,
        waveSpeed: 480,
        waveRange: 620,
        waveArcDeg: 80,
        knockback: 520,
        sound: "wave",
      },
    ],
  },
};

// เลขเวอร์ชันของไฟล์นี้ (main.js ใช้ตรวจว่าโหลดไฟล์ครบและตรงกันหรือไม่)
if (typeof window !== "undefined") (window.BB_FILES = window.BB_FILES || {}).characters = 7;

if (typeof module !== "undefined") module.exports = { CHARACTERS };
