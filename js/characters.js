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
//   "metavision"  Meta Vision (Isagi) มองเห็นอนาคตที่เป็นไปได้ นาน duration วินาที: คำนวณวิถีกระสุน/คลื่น/การพุ่งของศัตรูล่วงหน้า lookahead วินาที
//        ถ้าจะโดนก็สไลด์หลบทันที (ท่านั้นพลาดเป้า) หลบได้ maxDodges ครั้ง พักระหว่างหลบ dodgeCd วินาที dodgePower = แรงสไลด์
//        counterKick: true = จบแล้วลูกเตะพร้อมยิงสวนทันที ตัดเวลา (ตัดเวลา/ย้อนเวลา ฯลฯ) หลบไม่ได้ เพราะไม่ใช่สิ่งที่มองเห็นล่วงหน้าได้
//   "ballkick"    บอลฟุตบอลอยู่บนสนามตลอด (สร้างให้อัตโนมัติถ้ามีใครมีสกิลนี้) ผู้ใช้พุ่งไปที่บอลแล้วเตะใส่ศัตรู (เล็งนำหน้า)
//        บอลที่เตะแล้วทำดาเมจ damage + แรงผลัก knockback เด้งกำแพงได้ จนช้าลงถึงเกณฑ์ก็กลายเป็นบอลเปล่า (ไม่มีดาเมจ ใครชนก็ดันบอลได้)
//        ศัตรูปัดด้วยอาวุธ (ดาบ/เข็มทิศ) หรือคลื่นเสียง = บอลสะท้อนกลับไปหาผู้เตะ (เจ้าของบอลเปลี่ยน โดนผู้เตะได้เหมือนกัน)
//        duration (เวลาพุ่งหาบอลสูงสุด), chaseSpeed, kickSpeed, ballRadius
//        ใส่ใน metavision: kickCd, kickSpeedMult, kickDamageMult, kickKnockMult = เตะบอลระหว่าง Meta Vision ได้ แรงกว่าปกติ
//        projectile เพิ่ม: lead (เล็งนำหน้าศัตรูที่กำลังเคลื่อนที่), bounces (กระสุนสะท้อนกำแพงได้กี่ครั้ง), shape: "soccer" (ลูกฟุตบอล)
//   "summon"      เรียกเพื่อน (Solar): ถึง fireDelay แล้วสุ่ม 1 คนจาก guests [{name (ตรงกับ name ใน CHARACTERS), say, damage, silence, slow, slowMult, knockback}]
//        เพื่อนพุ่งมาหาศัตรูโจมตี 1 ครั้งแล้วหายไป  เรียกคนที่ศัตรูฝั่งตรงข้ามเป็นตัวนั้นอยู่ไม่ได้ (ไม่มีใครให้เรียก = ไม่ใช้สกิล)
//        projectile เพิ่ม: shape "basketball" (ลูกบาส)
//   "triplethreat" Triple Threat (Florentino): พุ่งเข้าหาแล้วแทงตามรายการ strikes [{t (วินาทีที่แทง), damage, stun (ส่งลอยกี่วินาที)}]
//        truePct = ดาเมจจริงต่อที (เศษส่วนของเลือดสูงสุดศัตรู) reach, speedMult, homing, shuffle  โดนฮีโร่ = สกิลที่มี flowers คูลดาวน์ลด 1 วินาที
//   "duel"        Gentleman's Duel (Florentino): ชาร์จ charge วินาทีแล้วพุ่งหาศัตรูที่ใกล้สุด ชนแล้วดวล duelTime วินาที (ดาเมจต่อคู่ดวล x duelMult)
//        คู่ดวลตายระหว่างดวล = พลังโจมตีถาวรเพิ่ม +4% (สูงสุด 10 ครั้ง) speedMult, damage
//   ค่าเพิ่มที่ใส่ได้ในทุกสกิล: energyCost (ใช้พลังงาน ต้องมีใน def: energyMax, energyRegen), maxRange (ศัตรูต้องอยู่ในระยะ px ถึงจะใช้),
//        requires: "lunge" (ใช้ได้เมื่อ Lunge พร้อม: ไม่โดน/ไม่ทำดาเมจนาน def.lungeRearm วินาที หรือเก็บดอกไม้) shuffle: {slide, ccImmune, boost} (ไถลออก กันสถานะ วิ่งเร็วขึ้นหลังจบท่า)
//        dash เพิ่ม: slowDuration, slowMult, heal  projectile เพิ่ม: stun (สตันเมื่อโดน), flowers (ดอกไม้ที่ปรากฏรอบเป้าหมาย) shape: "dart"
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
        minGain: 10, // ใช้เมื่อเลือดหายไปอย่างน้อย 10 ในช่วง 5 วินาทีที่ผ่านมา
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
        cooldown: 23.5, // เดิม 12
        initialCooldown: 5, // เดิม 3
        restAfter: 2.5, // ใช้เสร็จแล้วพักก่อนใช้สกิลถัดไปกี่วินาที (ไม่ใส่ = 0.25)
        frame: "accel",
        duration: 4, // เร่งเวลาตัวเอง 4 วินาที (วินาทีจริง)
        rate: 2.5, // ตัวเองเร็วขึ้น 2.5 เท่า (เดิน หมุนอาวุธ คูลดาวน์)
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
        factor: 0.2, // เดินช้าเหลือ 20% ของปกติ
        homing: 2, // ระหว่างชะลอเวลา วิ่งเข้าหาศัตรูที่ช้าลง
      },
    ],
  },
  // Isagi (Blue Lock): พุ่งเตะบอลที่อยู่บนสนามใส่ศัตรู + Meta Vision มองเห็นอนาคตที่เป็นไปได้แล้วหลบสกิลศัตรู
  // ภาพ: assets/characters/isagi/idle.png, kick.png (ท่าเตะ), meta.png (ท่า Meta Vision)  ลูกบอลกับเส้นอนาคต เกมวาดให้เองด้วยโค้ด
  isagi: {
    name: "Isagi",
    color: "#2f7bff",
    hp: 90,
    speed: 190,
    radius: 36,
    frames: {
      idle: "assets/characters/isagi/idle.png",
      kick: "assets/characters/isagi/kick.png",
      meta: "assets/characters/isagi/meta.png",
    },
    skills: [
      {
        // บอลอยู่บนสนามตลอด: Isagi พุ่งไปที่บอลแล้วเตะใส่ศัตรู (เล็งนำหน้า) บอลเด้งกำแพงได้
        // ศัตรูปัดด้วยอาวุธหรือคลื่นเสียง = บอลสะท้อนกลับมาหา Isagi แทน (ยังโดนดาเมจได้)
        type: "ballkick",
        name: "พุ่งเตะบอล",
        cooldown: 3.2,
        initialCooldown: 0.8,
        frame: "idle",
        duration: 3.5, // วิ่งไปหาบอลนานสุดเท่านี้ ถ้าไปไม่ถึงก็เลิก
        chaseSpeed: 2.4, // ตัวคูณความเร็วตอนพุ่งไปหาบอล
        damage: 4.5, // ดาเมจเมื่อบอลที่เตะโดนศัตรู
        kickSpeed: 640, // ความเร็วบอลหลังโดนเตะ
        knockback: 160,
        ballRadius: 15,
      },
      {
        type: "metavision",
        name: "Meta Vision",
        cooldown: 13,
        initialCooldown: 8,
        frame: "meta",
        duration: 5, // มองเห็นอนาคต 5 วินาที
        lookahead: 0.9, // มองล่วงหน้ากี่วินาที
        maxDodges: 10, // หลบได้กี่ครั้งต่อการใช้ 1 ครั้ง (ท่าถี่เกินไปก็หลบไม่ทัน)
        dodgeCd: 0.28, // พักสั้นๆ ระหว่างการหลบแต่ละครั้ง
        dodgePower: 620, // แรงสไลด์หลบ (px/วินาที ยิ่งมากยิ่งเลื่อนไกล)
        counterKick: true, // จบ Meta Vision แล้วเตะสวนทันที (รีเซ็ตคูลดาวน์ลูกเตะ)
        // ระหว่าง Meta Vision เตะบอลได้ต่อเนื่อง (ไม่ต้องรอคูลดาวน์ปกติ) และเตะแรงกว่าปกติ
        kickCd: 1.0, // เตะซ้ำได้ทุกกี่วินาทีระหว่าง Meta Vision
        kickSpeedMult: 1.5, // บอลเร็วขึ้นกี่เท่า
        kickDamageMult: 3, // ดาเมจแรงขึ้นกี่เท่า
        kickKnockMult: 1.6, // แรงผลักแรงขึ้นกี่เท่า
        restAfter: 0.4,
      },
    ],
  },
  // Florentino (RoV / Arena of Valor): ท่า "รำปาดอก" = ปาดอก (Blossom) -> วิ่งเก็บดอกไม้เติมพลังงานและรีเซ็ตสกิล 2 -> รำ 3 ท่า (Triple Threat) -> Shuffle ไถลออก
  // ค่าคูลดาวน์อ้างอิงเกมจริงที่เลเวลสูงสุด: Blossom 10 -> 8 วินาที, Gentleman's Duel 35 -> 25 วินาที
  // Triple Threat ในเกมจริงไม่มีคูลดาวน์เป็นตัวเลข ใช้พลังงาน 100 (เก็บดอกไม้ = เติมเต็ม + รีเซ็ต) ค่า cooldown 6 / energyRegen 8 ด้านล่างเป็นค่าที่ผมตั้งเอง ปรับได้
  // ภาพ: assets/characters/florentino/idle.png, blossom.png (ท่าปาดอก), triple.png (ท่ารำ), duel.png (ท่าประกาศดวล)  ดาบ ดอกไม้ ลูกดอก เกมวาดให้เองด้วยโค้ด
  florentino: {
    name: "Florentino",
    color: "#d4382f",
    hp: 100,
    speed: 190,
    radius: 36,
    energyMax: 100, // พลังงาน (Triple Threat ใช้ 100, Blossom ใช้ 20)
    energyRegen: 25, // พลังงานฟื้นเองวินาทีละเท่านี้ (เก็บดอกไม้ = เต็มทันที) ตั้งเอง ให้ปา -> แทง ต่อกันได้หลังแทงครั้งที่ 4
    lungeRearm: 3, // ไม่โดน/ไม่ทำดาเมจนานเท่านี้ (วินาที) = ออกจากการต่อสู้ แล้ว Lunge พร้อมใช้อีกครั้ง
    frames: {
      idle: "assets/characters/florentino/idle.png",
      blossom: "assets/characters/florentino/blossom.png",
      triple: "assets/characters/florentino/triple.png",
      duel: "assets/characters/florentino/duel.png",
    },
    skills: [
      {
        // Passive Shuffle: ออกจากการต่อสู้แล้ว การโจมตีปกติครั้งถัดไปเป็น Lunge: ดาเมจเพิ่ม ชะลอ 70% 0.5 วินาที โดนฮีโร่ฟื้นเลือด แล้วไถลออก
        type: "dash",
        name: "แทง (Lunge)",
        requires: "lunge",
        maxRange: 280,
        cooldown: 0.5,
        frame: "triple",
        duration: 0.45,
        speedMult: 3,
        homing: 4,
        damage: 4,
        knockback: 120,
        slowDuration: 0.5,
        slowMult: 0.3, // ชะลอ 70%
        heal: 4,
        shuffle: { slide: 260, ccImmune: 0.5, boost: 0.5 },
        restAfter: 0.2,
      },
      {
        // วงจรรำ: ปา -> แทง -> (พุ่งทะลุ เก็บดอก) แทง -> เก็บดอก แทง -> เก็บดอก แทง -> ปาอีกที  (แทง 4 ครั้งตัดคูลดาวน์ Blossom 4 วินาที จึงปาได้พอดี)
        // สกิล 1 Blossom: ปาลูกดอก ดาเมจ + สตัน 0.75 วินาที แล้วดอกไม้ 3 ดอกปรากฏรอบเป้าหมาย 5 วินาที (เก็บทีละดอกตอนแทงพุ่งออก: พลังงานเต็ม + Lunge พร้อม + รีเซ็ต Triple Threat)
        type: "projectile",
        name: "Blossom (ปาดอก)",
        cooldown: 8, // เกมจริง 10 / 9.6 / 9.2 / 8.8 / 8.4 / 8 วินาที (เลเวล 1-6)
        initialCooldown: 0.5,
        frame: "blossom",
        duration: 0.4,
        fireDelay: 0.12,
        damage: 5,
        projectileSpeed: 640,
        projectileRadius: 8,
        shape: "dart",
        stun: 0.75,
        flowers: 3,
        energyRefill: true, // ปาโดนแล้วพลังงานเต็ม ให้ "ปา -> แทง" ต่อกันได้ (ตั้งเองตามที่เล่นจริง)
        maxRange: 300, // ปาเมื่อศัตรูอยู่ในระยะนี้ (ไม่งั้นวิ่งเข้าหาก่อน)
        unblockable: true, // ปัดไม่ได้ (ดาบ/คลื่น/กระสุนไม่ทำให้แตกหรือเปลี่ยนทิศ)
        flowerDist: 64, // ดอกไม้อยู่ใกล้ตัวเป้าหมายมาก (px จากจุดกึ่งกลาง) ให้แทงทะลุไปเก็บได้ทีละดอก
        sound: "shoot",
        restAfter: 0.15,
      },
      {
        // สกิล 2 Triple Threat: แทง 3 จังหวะ (ครั้งที่ 2 ส่งศัตรูลอย 0.75 วินาที ครั้งที่ 3 แทงสองที) แต่ละที + ดาเมจจริง % ของเลือดสูงสุด จบด้วย Shuffle
        // โดนฮีโร่ = Blossom คูลดาวน์ลด 1 วินาที
        type: "triplethreat",
        name: "Triple Threat (รำ)",
        cooldown: 3, // เกมจริงไม่มีตัวเลข: ตั้งเอง (แทง 4 ครั้งต่อรอบ ครั้งละ ~1 วินาที ต้องพร้อมแทงต่อหลังปาอีกที)
        initialCooldown: 0,
        energyCost: 100,
        maxRange: 320,
        passThrough: true, // แทงพุ่งทะลุตัวศัตรู ไม่ชนกัน
        frame: "triple",
        duration: 1.5, // เพดานเวลา (ปกติจบเองตอนเก็บดอกไม้ได้)
        speedMult: 2.4,
        homing: 14,
        reach: 60, // แทงถึงเมื่อห่างจากขอบตัวศัตรูไม่เกินเท่านี้ (px)
        truePct: 0.01, // ดาเมจจริงต่อที = 1% ของเลือดสูงสุดศัตรู (เกมจริง 4%)
        strikes: [
          { t: 0.08, damage: 3 },
          { t: 0.22, damage: 3, stun: 0.75 }, // ลอย
          { t: 0.36, damage: 2 },
          { t: 0.44, damage: 2 },
        ],
        exitAt: 0.5, // แทงจบแล้วพุ่งทะลุตัวศัตรูไปเก็บดอกไม้ที่ใกล้สุด 1 ดอก (เก็บแล้วพลังงานเต็ม + แทงต่อได้ทันที)
        exitSpeed: 4.2,
        shuffle: { slide: 0, ccImmune: 0.5, boost: 0.5 },
        restAfter: 0, // เก็บดอกแล้วแทงต่อทันที (ตามคลิป: ห้ามรอ)
      },
      {
        // อัลติเมท Gentleman's Duel: ชาร์จแล้วพุ่งไปหาศัตรูที่ใกล้สุด เริ่มดวล 5 วินาที: ดาเมจที่ใส่คู่ดวลเพิ่ม (duelMult)
        // คู่ดวลตาย = พลังโจมตีถาวร +4% ต่อครั้ง (สูงสุด 10 ครั้ง)
        type: "duel",
        name: "Gentleman's Duel",
        cooldown: 25, // เกมจริง 35 / 30 / 25 วินาที (เลเวล 1-3)
        initialCooldown: 1,
        frame: "duel",
        duration: 1.6, // ชาร์จ + พุ่งนานสุดเท่านี้
        charge: 0.4,
        speedMult: 5,
        damage: 5,
        duelTime: 5, // ดวล 5 วินาที
        meleeResist: 0.5, // ระหว่างดวล ลดดาเมจระยะใกล้ที่โดนตัวเอง 50%
        duelExtend: 0.6, // ตีคู่ดวลซ้ำ 1 ครั้ง = เพิ่มเวลาดวล 0.6 วินาที (รำต่อได้)
        duelCap: 10, // เวลาดวลสะสมสูงสุด (วินาที)
        duelMult: 1.4, // ดาเมจต่อคู่ดวล x1.4 (เกมจริง: เกราะศัตรูลด 25% + ดาเมจเพิ่ม 20%)
        restAfter: 0.3,
      },
    ],
  },

  // ---------- Solar: ใช้บาสเกตบอลเป็นอาวุธ ----------
  // ภาพ: assets/characters/solar/idle.png, shoot.png (ท่าชู้ต), call.png (ท่าเรียกเพื่อน)
  solar: {
    name: "Solar",
    color: "#ff8a1f",
    hp: 100,
    speed: 185,
    radius: 36,
    frames: {
      idle: "assets/characters/solar/idle.png",
      shoot: "assets/characters/solar/shoot.png",
      call: "assets/characters/solar/call.png",
    },
    skills: [
      {
        // สกิล 1: ชู้ตบาสเข้าแป้น (toHoop) แป้นตั้งอยู่กลางขอบบนของสนาม ยิงจากห่างแป้น >= threeRange px = ช็อต 3 แต้ม
        // ลงแป้น = ข่มขวัญศัตรูทุกคน (3 แต้ม mindDamage / 2 แต้มครึ่งเดียว) พลาด = ไม่ได้อะไร
        // ถ้ามีศัตรูอยู่ในเส้นทางลูก ลูกจะโดนหน้าศัตรูแทน (แสกหน้า: ดาเมจ damageNear + ข่มขวัญเบา mindNear)
        type: "projectile",
        name: "ชู้ตเข้าแป้น",
        toHoop: true,
        cooldown: 4,
        initialCooldown: 0.6,
        frame: "shoot",
        duration: 0.5,
        fireDelay: 0.15,
        damage: 6, // ดาเมจเลือดตอนลง 3 แต้ม
        damageNear: 3, // ดาเมจเลือดตอน 2 แต้ม / ตอนลูกโดนหน้าศัตรูระหว่างทาง
        threeRange: 300, // ยิงห่างอย่างน้อยเท่านี้ (px) = 3 แต้ม
        mindDamage: 50, // 3 แต้มลง = ข่มขวัญหนัก (สติ -50) โดน 2 ลูกสติแตก ดูคำอธิบาย mindDamage ด้านบน
        mindNear: 20, // ลูกโดนหน้าศัตรูระหว่างทาง = ข่มขวัญเบา
        projectileSpeed: 560,
        projectileRadius: 20,
        shape: "basketball",
        lead: true, // เล็งนำหน้า
        knockback: 90,
        sound: "shoot",
      },
      {
        // สกิล 2: เรียกเพื่อน FuNx หรือ Johan มาโจมตีให้ 1 ครั้ง (ใช้สกิลของเขาให้แบบย่อ)
        // เรียกคนที่ "ต้องสู้ด้วยอยู่" ไม่ได้ (ถ้าศัตรูคนไหนชื่อเดียวกับเพื่อน จะเรียกคนนั้นไม่ได้)
        type: "summon",
        name: "เรียกเพื่อน",
        cooldown: 7,
        initialCooldown: 2.5,
        frame: "call",
        duration: 0.7,
        fireDelay: 0.35,
        restAfter: 0.2,
        guests: [
          // FuNx: ตัดเวลาแล้วฟันจากด้านหลัง = ดาเมจ + ใบ้สกิลศัตรู
          { name: "FuNx", say: "ตัดเวลา!", damage: 16, silence: 2.2, knockback: 140, color: "#ff2a55" },
          // Johan: เข็มทิศ + ชะลอเวลา = ดาเมจ + ศัตรูช้าลง
          { name: "Johan", say: "ชะลอเวลา!", damage: 10, slow: 3, slowMult: 0.4, knockback: 100, color: "#7ff5dc" },
        ],
      },
    ],
  },

  // ---------- The Red Mist (Library of Ruina: Kali / Gebura) ----------
  // ภาพ: assets/characters/redmist/idle.png, slash.png (ท่าฟัน/แทง), ego.png (ท่า E.G.O. ปรากฏ)
  // กติกาพิเศษ: egoAt = เลือดต่ำกว่าสัดส่วนนี้ครั้งเดียวต่อแมตช์ "E.G.O. ปรากฏ" -> ดาเมจ x egoMult ตลอดแมตช์ + ปลดล็อกท่าที่มี requires: "ego"
  //   bleed/bleedDps (พุ่ง/คลื่น) = โดนแล้วเลือดไหล, rechain (พุ่ง) = โดนแล้วใช้ท่าเดิมซ้ำได้เร็ว, cdPenalty = โดนแล้วคูลดาวน์ทุกสกิลศัตรูเพิ่ม
  redmist: {
    name: "The Red Mist",
    color: "#c8102e",
    hp: 120, // The Strongest
    speed: 205,
    radius: 40,
    egoAt: 0.5, // เลือดเหลือครึ่งเดียว = E.G.O. ปรากฏ
    egoMult: 1.2, // E.G.O.: ดาเมจ x1.2
    // ภาพตัวละครตามสถานะ/ท่า (autoPose): idle ยืนนิ่ง/ติดสถานะ, move เคลื่อนที่, slash/pierce/blunt ตอนใช้สกิล, block ป้องกัน,
    // evade หลบ, damaged โดนตี ส่วนชุด ego* ใช้แทนเมื่อ E.G.O. ปรากฏ (ถ้าไม่มีไฟล์ของ ego* จะใช้ชุดปกติแทน) egosplit = ท่า Greater Split
    autoPose: true,
    // Block: โดนตีตอนไม่ได้ใช้สกิล = ยกการ์ดลดดาเมจ (reduce) นาน dur วินาที พักการ์ด cd วินาที
    block: { reduce: 0.5, dur: 0.45, cd: 3 },
    // Evade: โดนตีตอนไม่ได้ใช้สกิล มีโอกาส chance ที่จะหลบพ้น (ไม่เสียเลือด) สไลด์หนี slide px พักหลบ cd วินาที
    evade: { chance: 0.25, dur: 0.4, cd: 3, slide: 300 },
    frames: {
      idle: "assets/characters/redmist/idle.png",
      move: "assets/characters/redmist/move.png",
      slash: "assets/characters/redmist/slash.png",
      pierce: "assets/characters/redmist/pierce.png",
      blunt: "assets/characters/redmist/blunt.png",
      block: "assets/characters/redmist/block.png",
      evade: "assets/characters/redmist/evade.png",
      damaged: "assets/characters/redmist/damaged.png",
      egoidle: "assets/characters/redmist/egoidle.png",
      egomove: "assets/characters/redmist/egomove.png",
      egoslash: "assets/characters/redmist/egoslash.png",
      egopierce: "assets/characters/redmist/egopierce.png",
      egoblunt: "assets/characters/redmist/egoblunt.png",
      egoblock: "assets/characters/redmist/egoblock.png",
      egoevade: "assets/characters/redmist/egoevade.png",
      egodamaged: "assets/characters/redmist/egodamaged.png",
      egosplit: "assets/characters/redmist/egosplit.png",
    },
    // เอฟเฟกต์ฟัน (สไปรต์ที่ใช้กับสกิล type "slash" ผ่าน fx ของสกิล) ถ้าไม่มีไฟล์จะวาดรอยฟันด้วยโค้ดแทน
    // รูปแบบไฟล์: PNG รอยฟันหันไปทาง "ขวา" (ศูนย์กลางแนวตั้งของรูป = กึ่งกลางแนวฟัน) ระบบหมุนตามทิศศัตรูและย่อ/ขยายให้พอดีระยะฟัน (reach)
    effects: {
      levelslash: "assets/effects/redmist/levelslash.png",
      split: "assets/effects/redmist/split.png",
    },
    skills: [
      {
        // Spear: พุ่งแทงทะลวง
        type: "dash",
        name: "Spear (พุ่งแทง)",
        cooldown: 3.2,
        initialCooldown: 0.5,
        frame: "pierce",
        duration: 0.5,
        speedMult: 3.2,
        homing: 6,
        damage: 9,
        knockback: 170,
        restAfter: 0.2,
      },
      {
        // Level Slash: ก้าวเข้าไปฟันเป็นส่วนโค้งกว้างตรงหน้า (ฟันจริง ไม่ใช่คลื่น) โดนแล้วเลือดไหล
        type: "slash",
        name: "Level Slash (ฟันเลือดไหล)",
        cooldown: 4.8,
        initialCooldown: 1.4,
        frame: "slash",
        fx: "levelslash", // สไปรต์เอฟเฟกต์ฟัน (ดู effects ด้านบน)
        duration: 0.55,
        fireDelay: 0.22,
        reach: 150, // ระยะฟันจากกลางตัว (px)
        arcDeg: 120, // ฟันกว้างกี่องศา
        step: 650, // ก้าวเข้าหาศัตรูก่อนฟัน (px/วิ)
        maxRange: 260, // ถ้าศัตรูไกลกว่านี้จะเดินเข้าไปก่อนค่อยฟัน
        damage: 10,
        knockback: 110,
        bleed: 4, // เลือดไหล 4 วินาที
        bleedDps: 3,
      },
      {
        // Onrush: พุ่งกระชาก ถ้าโดนศัตรูจะใช้ซ้ำได้เกือบทันที
        type: "dash",
        name: "Onrush (กระชากต่อเนื่อง)",
        cooldown: 6,
        initialCooldown: 2.4,
        frame: "blunt",
        duration: 0.55,
        speedMult: 4.5,
        homing: 8,
        damage: 7,
        knockback: 210,
        rechain: true,
        rechainCd: 0.8,
        restAfter: 0.15,
      },
      {
        // Greater Split: Horizontal: ฟันกวาด 180 องศาตรงหน้า ระยะไกลมาก ทำลายกระสุนและบั่นทอนสกิลของศัตรู (คูลดาวน์เพิ่ม)
        // grantsEgo: ใช้ท่านี้ = E.G.O. ปรากฏทันที (ถ้ายังไม่ปรากฏ) ดาเมจจึงได้ x egoMult เสมอ ใช้ได้ตั้งแต่ต้นแมตช์
        type: "slash",
        name: "Greater Split: Horizontal (E.G.O.)",
        grantsEgo: true,
        cooldown: 9,
        initialCooldown: 0.5,
        frame: "egosplit",
        fx: "split",
        duration: 0.8,
        fireDelay: 0.35,
        reach: 420, // ระยะฟันกว้างใหญ่มาก (สนาม 720 px)
        arcDeg: 180,
        step: 700,
        maxRange: 460,
        damage: 24,
        knockback: 260,
        cdPenalty: 3,
        projectileEffect: "stop",
      },
    ],
  },
};

// เลขเวอร์ชันของไฟล์นี้ (main.js ใช้ตรวจว่าโหลดไฟล์ครบและตรงกันหรือไม่)
if (typeof window !== "undefined") (window.BB_FILES = window.BB_FILES || {}).characters = 35;

if (typeof module !== "undefined") module.exports = { CHARACTERS };
