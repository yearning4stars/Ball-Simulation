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
//        indestructible: true     กระสุนทำลายไม่ได้ (ดาบปัดไม่ได้ ชนกระสุนอื่นก็ไม่แตก คลื่น "stop" ก็ไม่ได้ผล)
//        shape: "text" + texts: [...]  กระสุนเป็นกรอบข้อความ สุ่มคำจากรายการ
//        mindDamage               ตอนโดนจะบั่นทอนสติ/ความมั่นใจของศัตรู (0-100):
//                                 ดาเมจของเขาลดสูงสุด 35% เล็งเพี้ยน คูลดาวน์ช้าลง เดินส่าย ครบ 100 = สติแตก ขยับช้าใช้สกิลไม่ได้ 1.2 วิ
//   "dash"        พุ่งเข้าหาศัตรู ชนครั้งแรกในการพุ่งแต่ละครั้งทำดาเมจ
//        speedMult, homing (เลี้ยวเข้าหาศัตรูระหว่างพุ่ง เรเดียน/วินาที), knockback
//   "shockwave"   ปล่อยคลื่นเสียงเป็นส่วนโค้งแผ่ออกไปทางศัตรู โดนแล้วกระเด็น
//        waveSpeed, waveRange, waveArcDeg (มุมกว้างของคลื่น องศา), knockback
//        damageFar               ดาเมจที่ปลายระยะ (ยิ่งไกลยิ่งเบา ไม่ใส่ = ดาเมจเท่ากันตลอด)
//        projectileEffect        "push" ผลักกระสุนศัตรูออก | "stop" ทำลายกระสุนศัตรู | ไม่ใส่ = ไม่มีผล
//   "timeerase"   ตัดเวลา (King Crimson) นาน duration วินาที: เวลา "ไม่ได้หยุด" แต่ถูกตัดข้าม
//        ผู้ใช้: อยู่นอกความจริง กระสุน คลื่น ดาบ การพุ่งชน ทะลุผ่านตัวหมด เดินทะลุศัตรูได้ ขยับอิสระและฟันสวนได้
//        ศัตรูในรัศมี: เหม่อลอย ทำตามโชคชะตาเดิมเอง (ยังขยับ/ยิงสกิลต่อ แต่เล็งไปที่ตำแหน่งเก่าของผู้ใช้ก่อนตัดเวลา)
//                      พอเวลากลับมาจะจำอะไรไม่ได้ ยืนงง afterStun วินาที
//        duration, radius (รัศมีที่ศัตรูจะเหม่อลอย px), afterStun, speedMult (ผู้ใช้เร็วขึ้นกี่เท่า), homing (วิ่งเข้าหาศัตรู)
//        ถ้าผู้ใช้ฟันโดนศัตรูระหว่างตัดเวลา ดาเมจโดนเต็มและเวลากลับมาทันที (แบบ King Crimson) ไม่ต้องรอครบ duration
//   "rewind"      ย้อนเวลา (Mandom): ทุกอย่างในสนามย้อนกลับไป rewindSeconds วินาที เลือดคนใช้สกิลก็ย้อนด้วย
//        duration (= กี่วินาทีที่เล่นภาพย้อน), rewindSeconds, minGain (ใช้เมื่อเสียเลือดมากกว่านี้ในช่วงที่ย้อนได้)
//   "timeaccel"   เร่งเวลา (เฉพาะตัวเอง) นาน duration วินาที: ผู้ใช้เคลื่อนที่ เล็ง หมุนอาวุธ และคูลดาวน์เดินเร็วขึ้น rate เท่า
//        ส่วนคนอื่นและกระสุนเดินตามเวลาปกติ ผู้ใช้ยังโดนตีได้ตามปกติ
//        duration (วินาทีจริง), rate (เร็วขึ้นกี่เท่า), homing (วิ่งเข้าหาศัตรูระหว่างเร่ง เรเดียน/วินาที ไม่ใส่ = ไม่วิ่งเข้าหา)
//        hitAndRun (ไม่บังคับ) วิ่งวนรอบศัตรู -> พุ่งเข้าโจมตี -> หลบออก วนซ้ำตลอดช่วงเร่งเวลา (ถ้าใส่ จะใช้แทน homing)
//        hpRush (ใส่ได้ทุกสกิล) ยิ่งเลือดน้อยคูลดาวน์ยิ่งเดินเร็ว: 1 เท่าตอนเลือดเต็ม -> hpRush เท่าตอนเลือดหมด
//        stunNear, stunRange (shockwave) ถ้าโดนคลื่นตอนคลื่นเดินทางไม่เกิน stunRange (0-1 ของระยะทั้งหมด) จะติดสตั้น stunNear วินาที
//        restAfter (ใส่ได้ทุกสกิล) ใช้สกิลเสร็จแล้วพักกี่วินาทีก่อนใช้สกิลถัดไป ไม่ใส่ = 0.25
//        backstab (ใส่ในสกิล timeerase) วนไปด้านหลังศัตรูแล้วแทง สำเร็จ = ดาเมจ damageMult เท่า + ใบ้สกิลศัตรู silence วินาที
//        weapon ชนกับ weapon ของอีกฝ่าย (เช่น ดาบ FuNx กับเข็มทิศ Johan) จะปัดกันและเด้งออกทั้งคู่ ไม่ต้องตั้งค่าอะไร
//        ramDamage/ramKnockback (ใส่ใน weapon) ตอนสติแตกหนัก (mind >= 50) ตัวที่ถืออาวุธจะทิ้งอาวุธแล้ววิ่งชนศัตรูแทน จนสติลดต่ำกว่า 25 ค่อยหยิบกลับ
//   "timeslow"    ชะลอเวลาคนรอบข้าง นาน duration วินาที: ศัตรู กระสุน และคลื่นของศัตรูที่อยู่ในรัศมี radius รอบตัวผู้ใช้ เดินช้าลงเหลือ factor เท่า
//        (ขยับ ยิงสกิล คูลดาวน์ ฟันดาบ ช้าลงหมด) ผู้ใช้ไม่ถูกชะลอ วงชะลอเคลื่อนที่ตามผู้ใช้ ขอบวงค่อยๆ จาง
//        duration (วินาทีจริง), radius (px), factor (0-1 ยิ่งน้อยยิ่งช้า), homing (วิ่งเข้าหาศัตรูระหว่างชะลอ ไม่ใส่ = ไม่วิ่งเข้าหา)
//
//  weapon (ไม่บังคับ) อาวุธที่หมุนรอบตัวตลอดเวลา หมุนไปเรื่อยๆ จนฟันโดนศัตรูแล้วกลับทิศ
//        length (ความยาวใบดาบ), width, startRatio (จุดจับ เทียบรัศมีตัว), damage, spinSpeed (เรเดียน/วินาที),
//        hitCooldown (พักก่อนฟันซ้ำได้), knockback, aimBoost/aimRange (เร่งหมุนเมื่อศัตรูอยู่ในระยะ ให้ฟันแม่นขึ้น)
//        ใบดาบปัดกระสุนศัตรูที่โดนทิ้งเอง และกระสุนคนละฝ่ายที่ชนกันจะแตกทั้งคู่
//        type: "katana" (ค่าเริ่มต้น) = ดาบ | "compass" = ไม้เท้าหัวเข็มทิศ (เข็มชี้ไปที่ศัตรูเสมอ)
//        headRadius (เฉพาะ compass) = รัศมีหัวเข็มทิศ หัวก็ฟันโดนและปัดกระสุนได้ด้วย ไม่ใช่แค่ก้าน
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
    color: "#f6e27a", // เหลืองอ่อน (ใช้กับชื่อ โน้ต คลื่นเสียง และเอฟเฟกต์ของ Luka)
    hp: 70,
    speed: 200,
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
        indestructible: true, // โน้ตของ Luka ทำลายไม่ได้ (ดาบปัดไม่ออก ชนกระสุนอื่นก็ไม่แตก)
      },
      {
        type: "projectile",
        name: "คำพูดบั่นทอนใจ",
        cooldown: 5.5,
        frame: "sing", // อยากมีท่าพูดโดยเฉพาะ: เพิ่ม frame ใหม่ใน frames แล้วเปลี่ยนตรงนี้
        duration: 1.2,
        fireDelay: 0.2,
        count: 3,
        interval: 0.35,
        spread: 0.15,
        damage: 2, // ดาเมจเลือดนิดเดียว ตัวจริงคือบั่นทอนสติ
        mindDamage: 20, // สติ/ความมั่นใจของศัตรูลดลงต่อคำ (เต็ม 100) โดน 3 คำ = สติเหลือ ~40 -> ทิ้งอาวุธแล้วคลั่งวิ่งชน
        projectileSpeed: 300,
        projectileRadius: 18,
        shape: "text",
        texts: ["Pururu🌟", "My savior✨", "I'm tellin' you blink, gone", "Blink, gone", "Tick-tock"],
        sound: "word",
        indestructible: true, // คำพูดของ Luka ปัดไม่ได้ (เหมือนโน้ต) ทุกการโจมตีของ Luka ปัดป้องไม่ได้
        hpRush: 4, // ยิ่งเลือดน้อยคูลดาวน์ยิ่งเดินเร็ว: เลือดเต็ม 1 เท่า -> เลือดหมด 4 เท่า
      },
      {
        type: "shockwave",
        name: "คลื่นเสียง",
        cooldown: 7.0, // เดิม 5.0 (ดาเมจแรงขึ้นและมีสตั้น เลยให้ใช้ถี่น้อยลง)
        frame: "wave",
        duration: 0.6,
        fireDelay: 0.2,
        damage: 18, // ดาเมจเมื่อโดนที่ระยะใกล้ตัว (เดิม 12)
        damageFar: 8, // ดาเมจเมื่อโดนที่ปลายระยะ (ระหว่างทางลดลงเป็นเส้นตรง) เดิม 5
        stunNear: 1.75, // โดนคลื่นในระยะใกล้ ติดสตั้นกี่วินาที
        stunRange: 0.35, // "ใกล้" = คลื่นเดินทางไม่เกิน 35% ของ waveRange
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
    hp: 100,
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
      damage: 5.5,
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
        cooldown: 15, // นับตั้งแต่เริ่มใช้ (รวมช่วง 5 วินาทีที่ตัดเวลาด้วย)
        initialCooldown: 4,
        frame: "erase",
        duration: 5, // ตัดเวลา 5 วินาที
        radius: 480, // ศัตรูในรัศมีนี้ (px) จะเหม่อลอย
        afterStun: 0.6, // เวลากลับมา ศัตรูจำไม่ได้ว่าเกิดอะไรขึ้น ยืนงงกี่วินาที
        speedMult: 1.5,
        homing: 3.2,
        // ระหว่างตัดเวลา: วนไปด้านหลังศัตรู (ฝั่งตรงข้ามกับที่ศัตรูหันหน้า) แล้วพุ่งแทง ถ้าแทงสำเร็จจากด้านหลัง
        backstab: {
          damageMult: 2.5, // ดาเมจเป็น 2 เท่า
          silence: 5, // ใบ้สกิลศัตรู (ใช้สกิลไม่ได้ ยังเดินได้) กี่วินาที
          orbitRadius: 150, // รัศมีที่วนรอบศัตรู (px)
          orbitSpeed: 1.8, // ตัวคูณความเร็วตอนวน
          strikeSpeed: 2.4, // ตัวคูณความเร็วตอนพุ่งแทง
          angleTol: 0.5, // อยู่ในมุมด้านหลังไม่เกินกี่เรเดียน ถึงจะพุ่งแทง
          retreatSpeed: 2.0, // ตัวคูณความเร็วตอนถอยหลังออกห่างก่อนวน (และถอยใหม่หลังแทงพลาด)
          retreatMax: 0.7, // ถอยนานสุดกี่วินาที
        },
      },
      {
        type: "rewind",
        name: "ย้อนเวลา",
        cooldown: 14,
        initialCooldown: 6,
        frame: "rewind",
        duration: 1.0, // เล่นภาพย้อนกลับ 1 วินาที (ย้อนโลกกลับไป 5 วินาที)
        rewindSeconds: 5,
        minGain: 20, // ใช้เมื่อเลือดหายไปอย่างน้อย 20 ในช่วง 5 วินาทีที่ผ่านมา
      },
    ],
  },

  // Johan: ไม้เท้าหัวเข็มทิศหมุนรอบตัว (เข็มชี้ไปที่ศัตรูเสมอ) + เร่งเวลาตัวเอง + ชะลอเวลาคนรอบข้าง
  // ภาพ: assets/characters/johan/idle.png, accel.png (ท่าเร่งเวลา), slow.png (ท่าชะลอเวลา)  ส่วนเข็มทิศ เกมวาดให้เองด้วยโค้ด
  johan: {
    name: "Johan",
    color: "#e8a31f",
    hp: 110,
    speed: 175,
    radius: 38,
    frames: {
      idle: "assets/characters/johan/idle.png",
      accel: "assets/characters/johan/accel.png",
      slow: "assets/characters/johan/slow.png",
    },
    weapon: {
      type: "compass",
      name: "เข็มทิศ",
      length: 62, // ความยาวจากตัวถึงปลายหัวเข็มทิศ (รวมหัว)
      width: 7, // ความหนาก้าน
      headRadius: 17, // รัศมีหัวเข็มทิศ
      startRatio: 0.45,
      damage: 4, // เดิม 6 (ลดให้เบาลง)
      ramDamage: 3, // ดาเมจตอนทิ้งอาวุธเพราะสติแตก แล้วใช้การชนโจมตีแทน
      ramKnockback: 90,
      spinSpeed: 7.5,
      hitCooldown: 0.35,
      aimBoost: 1.8,
      aimRange: 40,
      knockback: 90,
    },
    skills: [
      {
        type: "timeaccel",
        name: "เร่งเวลา",
        cooldown: 18, // เดิม 12
        initialCooldown: 5, // เดิม 3
        restAfter: 2.5, // ใช้เสร็จแล้วพักก่อนใช้สกิลถัดไปกี่วินาที (ไม่ใส่ = 0.25)
        frame: "accel",
        duration: 4, // เร่งเวลาตัวเอง 4 วินาที (วินาทีจริง)
        rate: 4, // ตัวเองเร็วขึ้น 2 เท่า (เดิน หมุนอาวุธ คูลดาวน์)
        // ระหว่างเร่งเวลา: วิ่งวนรอบศัตรู -> พุ่งเข้าโจมตี -> หลบออก แล้วทำซ้ำไปเรื่อยๆ (ทุกค่าเป็นวินาทีจริง)
        hitAndRun: {
          orbitRadius: 170, // รัศมีที่วิ่งวนรอบศัตรู (px) ให้อยู่นอกระยะอาวุธ
          orbitTime: 0.6, // วิ่งวนนานเท่านี้ก่อนพุ่งเข้าหา
          orbitSpeed: 1.1, // ตัวคูณความเร็วตอนวิ่งวน
          strikeSpeed: 1.7, // ตัวคูณความเร็วตอนพุ่งเข้าโจมตี
          strikeMax: 0.45, // พุ่งไม่โดนก็เลิกหลังเท่านี้
          retreatTime: 0.35, // หลบออกนานเท่านี้
          retreatSpeed: 1.8, // ตัวคูณความเร็วตอนหลบ
        },
      },
      {
        type: "timeslow",
        name: "ชะลอเวลา",
        cooldown: 20, // เดิม 14
        initialCooldown: 10, // เดิม 7
        restAfter: 2.5,
        frame: "slow",
        duration: 5, // วงชะลอเวลาอยู่ 5 วินาที (วินาทีจริง)
        radius: 300, // ใครอยู่ในรัศมีนี้ (px) รอบตัว Johan จะช้าลง
        factor: 0.5, // เดินช้าเหลือ 50% ของปกติ
        homing: 2, // ระหว่างชะลอเวลา วิ่งเข้าหาศัตรูที่ช้าลง
      },
    ],
  },
};

// เลขเวอร์ชันของไฟล์นี้ (main.js ใช้ตรวจว่าโหลดไฟล์ครบและตรงกันหรือไม่)
if (typeof window !== "undefined") (window.BB_FILES = window.BB_FILES || {}).characters = 18;

if (typeof module !== "undefined") module.exports = { CHARACTERS };
