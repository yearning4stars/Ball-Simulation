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
//        knockback                แรงผลักศัตรูตอนโดน (px/วินาที ตัวเลขน้อย = ผลักนิดเดียว)
//   "dash"        พุ่งเข้าหาศัตรู ชนครั้งแรกในการพุ่งแต่ละครั้งทำดาเมจ
//        speedMult, homing (เลี้ยวเข้าหาศัตรูระหว่างพุ่ง เรเดียน/วินาที), knockback
//   "shockwave"   ปล่อยคลื่นเสียงเป็นส่วนโค้งแผ่ออกไปทางศัตรู โดนแล้วกระเด็น
//        waveSpeed, waveRange, waveArcDeg (มุมกว้างของคลื่น องศา), knockback
//        damageFar               ดาเมจที่ปลายระยะ (ยิ่งไกลยิ่งเบา ไม่ใส่ = ดาเมจเท่ากันตลอด)
//        projectileEffect        "push" ผลักกระสุนศัตรูออก | "stop" ทำลายกระสุนศัตรู | ไม่ใส่ = ไม่มีผล
//   "timeerase"   ตัดเวลา (King Crimson): ศัตรูถูกแช่แข็งทั้งตัว กระสุน คลื่น และคูลดาวน์ นาน duration วินาที
//        duration (= ระยะเวลาตัดเวลา), speedMult (ตัวเองเร็วขึ้นกี่เท่า), homing (วิ่งตามศัตรู)
//   "rewind"      ย้อนเวลา (Mandom): ทุกอย่างในสนามย้อนกลับไป rewindSeconds วินาที เลือดคนใช้สกิลก็ย้อนด้วย
//        duration (= กี่วินาทีที่เล่นภาพย้อน), rewindSeconds, minGain (ใช้เมื่อเสียเลือดมากกว่านี้ในช่วงที่ย้อนได้)
//
//  weapon (ไม่บังคับ) อาวุธที่หมุนรอบตัวตลอดเวลา หมุนไปเรื่อยๆ จนฟันโดนศัตรูแล้วกลับทิศ
//        length (ความยาวใบดาบ), width, startRatio (จุดจับ เทียบรัศมีตัว), damage, spinSpeed (เรเดียน/วินาที),
//        hitCooldown (พักก่อนฟันซ้ำได้), knockback, aimBoost/aimRange (เร่งหมุนเมื่อศัตรูอยู่ในระยะ ให้ฟันแม่นขึ้น)
//        ใบดาบปัดกระสุนศัตรูที่โดนทิ้งเอง และกระสุนคนละฝ่ายที่ชนกันจะแตกทั้งคู่
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

  // Luka (Alien Stage) แฟนเกม: คีย์ "singer" และโฟลเดอร์ assets/characters/singer/ คงชื่อเดิมไว้ เพื่อไม่ให้ภาพที่ใส่แล้วหาย
  // ใส่ PNG ของคุณทับชื่อไฟล์เดิมได้เลย (ดูวิธีใน README)
  singer: {
    name: "Luka",
    color: "#a64bd6",
    hp: 100,
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
        knockback: 70, // โน้ตผลักศัตรูถอยหลังเล็กน้อยทุกครั้งที่โดน
        sound: "note",
      },
      {
        type: "shockwave",
        name: "คลื่นเสียง",
        cooldown: 5.0,
        frame: "wave",
        duration: 0.6,
        fireDelay: 0.2,
        damage: 12, // ดาเมจเมื่อโดนที่ระยะใกล้ตัว
        damageFar: 5, // ดาเมจเมื่อโดนที่ปลายระยะ (ระหว่างทางลดลงเป็นเส้นตรง)
        projectileEffect: "push", // คลื่นปะทะกระสุนศัตรู: "push" = ผลักออก, "stop" = ทำลายทิ้ง
        waveSpeed: 480,
        waveRange: 620,
        waveArcDeg: 80,
        knockback: 520,
        sound: "wave",
      },
    ],
  },

  // FuNx: ดาบคาตานะหมุนรอบตัวตลอดเวลา + ตัดเวลา (King Crimson) + ย้อนเวลา (Mandom) แบบ JoJo ภาค 5
  // ภาพ: assets/characters/funx/idle.png, erase.png (ท่าตัดเวลา), rewind.png (ท่าย้อนเวลา)  ส่วนดาบเกมวาดให้เองด้วยโค้ด
  funx: {
    name: "FuNx",
    color: "#d6315a",
    hp: 110,
    speed: 180,
    radius: 38,
    frames: {
      idle: "assets/characters/funx/idle.png",
      erase: "assets/characters/funx/erase.png",
      rewind: "assets/characters/funx/rewind.png",
    },
    weapon: {
      type: "katana",
      name: "ดาบคาตานะ",
      length: 66,
      width: 9,
      startRatio: 0.45,
      damage: 6,
      spinSpeed: 8,
      hitCooldown: 0.35,
      aimBoost: 1.8, // ศัตรูอยู่ในระยะดาบ -> หมุนเร็วขึ้นกี่เท่าเพื่อกวาดเข้าหา
      aimRange: 40, // เผื่อระยะก่อนถึงปลายดาบ (px) ที่เริ่มเร่ง
      knockback: 140,
    },
    skills: [
      {
        type: "timeerase",
        name: "ตัดเวลา",
        cooldown: 16, // นับตั้งแต่เริ่มใช้ (รวมช่วง 5 วินาทีที่ตัดเวลาด้วย)
        initialCooldown: 4,
        frame: "erase",
        duration: 5, // ศัตรูถูกแช่แข็ง 5 วินาที
        speedMult: 1.5,
        homing: 3.2,
      },
      {
        type: "rewind",
        name: "ย้อนเวลา",
        cooldown: 14,
        initialCooldown: 6,
        frame: "rewind",
        duration: 1.0, // เล่นภาพย้อนกลับ 1 วินาที (ย้อนโลกกลับไป 5 วินาที)
        rewindSeconds: 5,
        minGain: 10, // ใช้เมื่อเลือดหายไปอย่างน้อย 10 ในช่วง 5 วินาทีที่ผ่านมา
      },
    ],
  },
};

// เลขเวอร์ชันของไฟล์นี้ (main.js ใช้ตรวจว่าโหลดไฟล์ครบและตรงกันหรือไม่)
if (typeof window !== "undefined") (window.BB_FILES = window.BB_FILES || {}).characters = 10;

if (typeof module !== "undefined") module.exports = { CHARACTERS };
