// ============================================================
//  ตรรกะการต่อสู้ล้วนๆ (ไม่แตะ DOM) เลยเอาไปเทสใน Node ได้
//
//  กติกา: ตัวละครชนกันแค่เด้งออกจากกัน "ไม่เกิดดาเมจ"
//         ดาเมจมาจากสกิลเท่านั้น (กระสุน/โน้ต, คลื่นเสียง, การพุ่งชน)
// ============================================================

// ตัวละครหนึ่งตัวมีได้หลายสกิล: skills: [ ... ]  (หรือ skill: {...} สกิลเดียวแบบเดิมก็ใช้ได้)
function skillsOf(def) {
  return def.skills || (def.skill ? [def.skill] : []);
}

// สกิลที่แตะเวลา: ใช้พร้อมกันไม่ได้ (ถ้ามีใครกำลังใช้อยู่ คนอื่นต้องรอ)
const TIME_SKILLS = ["timeerase", "rewind", "timeaccel", "timeslow"];

// สติแตกหนัก: mind >= MIND_DROP แล้วตัวที่ถือ weapon จะทิ้งอาวุธ และหันไปใช้ "การชนโจมตี" แทน
// จนกว่า mind จะลดลงต่ำกว่า MIND_PICKUP ค่อยหยิบอาวุธกลับมา (ห่างกันเพื่อไม่ให้สลับไปมารัวๆ)
const MIND_DROP = 50;
const MIND_PICKUP = 25;
// ค่าสติที่ถูกบั่นทอน (mind) พอโดนแล้วจะ "ค้างไว้" นานเท่านี้ (วินาที) ก่อนเริ่มค่อยๆ ฟื้นกลับ (โดนซ้ำก็นับค้างใหม่)
const MIND_HOLD = 2.5;

class Battle {
  // Battle(w, h, [def, def, ...], rng?, teams?)  หรือแบบเดิม Battle(w, h, defA, defB, rng?)
  // teams = เลขทีมของแต่ละคน เช่น [0,0,1,1] = 2v2, ไม่ใส่ = ทุกคนต่างคนต่างอยู่ (1v1 / ffa)
  constructor(width, height, a, b, c) {
    let defs, rng, teams;
    if (Array.isArray(a)) { defs = a; rng = b || Math.random; teams = c || null; }
    else { defs = [a, b]; rng = c || Math.random; teams = null; }
    this.w = width;
    this.h = height;
    this.rng = rng;
    this.time = 0;
    this.projectiles = [];
    this.waves = []; // คลื่นเสียงที่กำลังแผ่ออก
    this.events = []; // เอฟเฟกต์ให้ตัววาดเอาไปใช้ แล้วเคลียร์ทุกเฟรม
    this.winner = null; // 0, 1 หรือ "draw"
    this.wt = 0; // เวลาของ "โลก" (ย้อนเวลาแล้วถอยกลับตามจริง) ใช้กับประวัติสำหรับสกิลย้อนเวลา
    this.history = []; // ภาพถ่ายโลกทุก 0.05 วินาที เก็บย้อนหลังไม่กี่วินาที
    this._histAcc = 0;
    this.rewind = null; // กำลังย้อนเวลาอยู่หรือไม่ {owner, t, dur, back, t0}
    this.eraser = null; // ตัวที่กำลังใช้ "ตัดเวลา"
    this.dazedList = []; // ตัวที่ตกอยู่ในเวลาที่ถูกตัด: เหม่อลอย ทำตามโชคชะตาที่บันทึกไว้ (ไม่รู้ว่า FuNx อยู่ตรงไหนจริงๆ)
    this.slower = null; // ตัวที่กำลังใช้ "ชะลอเวลา" (Johan) วงชะลอเวลาอยู่รอบตัวนี้
    this.phantom = null; // ตำแหน่งที่ FuNx เคยยืนก่อนตัดเวลา: สิ่งเดียวที่ตัวเหม่อลอย "จำได้" และใช้เล็ง

    this.fighters = this._spawn(defs, teams);

    // บอลบนสนาม: สร้างเมื่อมีตัวละครที่มีสกิล ballkick (Isagi)
    this.balls = [];
    this.flowers = []; // ดอกไม้ของ Florentino (จาก Blossom): เก็บแล้วเติมพลังงานและรีเซ็ต Triple Threat
    const ks = this.fighters.map((f) => f.skills.find((k) => k.type === "ballkick")).find(Boolean);
    if (ks) {
      this.balls.push({
        x: width * 0.5, y: height * 0.5, vx: 0, vy: 0, r: ks.ballRadius || 15,
        hot: false, owner: null, meta: false, damage: 0, knock: 0, rot: 0, reflectCd: 0, evadedBy: null,
      });
    }
  }

  // วางตัวละคร: 2 ทีม = ทีมละฝั่ง (ซ้าย/ขวา) เรียงแนวตั้ง, มากกว่านั้น (ffa) = วางเป็นวงกลมรอบสนามหันเข้าหากลาง
  _spawn(defs, teams) {
    const n = defs.length;
    const tm = teams && teams.length === n ? teams : defs.map((_, i) => i);
    const uniq = [...new Set(tm)];
    const list = [];
    if (uniq.length === 2) {
      uniq.forEach((t, side) => {
        const members = tm.map((x, i) => (x === t ? i : -1)).filter((i) => i >= 0);
        members.forEach((i, k) => {
          const y = (this.h * (k + 1)) / (members.length + 1);
          list[i] = this._makeFighter(defs[i], this.w * (side === 0 ? 0.22 : 0.78), y, side === 0 ? 0 : Math.PI);
        });
      });
    } else {
      const R = Math.min(this.w, this.h) * 0.32;
      defs.forEach((d, i) => {
        const a = -Math.PI / 2 + (i / n) * Math.PI * 2;
        const x = this.w / 2 + Math.cos(a) * R;
        const y = this.h / 2 + Math.sin(a) * R;
        list[i] = this._makeFighter(d, x, y, Math.atan2(this.h / 2 - y, this.w / 2 - x));
      });
    }
    list.forEach((f, i) => { f.idx = i; f.team = tm[i]; });
    return list;
  }

  // ศัตรูที่ยังมีชีวิต (คนละทีม) ของ f
  _foes(f) {
    return this.fighters.filter((g) => g !== f && g.team !== f.team && g.hp > 0);
  }

  // เป้าหมายหลักของ f = ศัตรูที่อยู่ใกล้ที่สุด
  _target(f) {
    if (f.duel && f.duel.target.hp > 0) return f.duel.target; // ดวลอยู่: เล็งแต่คู่ดวล
    let best = null;
    let bd = Infinity;
    for (const g of this._foes(f)) {
      const d = Math.hypot(g.x - f.x, g.y - f.y);
      if (d < bd) { bd = d; best = g; }
    }
    return best || this.fighters.find((g) => g !== f && g.hp > 0) || f;
  }

  isDazed(f) {
    return this.dazedList.includes(f);
  }

  _evaded(o, f) {
    return !!(o.evadedBy && o.evadedBy.includes(f));
  }

  _markEvaded(o, f) {
    if (!o.evadedBy) o.evadedBy = [];
    o.evadedBy.push(f);
  }

  _makeFighter(def, x, y, angle) {
    const jitter = (this.rng() - 0.5) * 1.2;
    const a = angle + jitter;
    const skills = skillsOf(def);
    return {
      def,
      skills,
      x,
      y,
      vx: Math.cos(a) * def.speed,
      vy: Math.sin(a) * def.speed,
      knockX: 0, // แรงกระเด็นจากสกิลของศัตรู (ค่อยๆ หมดไปเอง)
      knockY: 0,
      r: def.radius,
      hp: def.hp,
      maxHp: def.hp,
      facing: 1,
      // คูลดาวน์ของแต่ละสกิล (วินาทีที่เหลือ) สกิลหลังๆ เริ่มช้ากว่าสกิลแรกเล็กน้อย
      cds: skills.map((sk, i) =>
        sk.initialCooldown !== undefined ? sk.initialCooldown : 0.8 + this.rng() * 0.6 + i * 0.9
      ),
      kickCd: 0, // พักก่อนเตะบอลซ้ำระหว่าง Meta Vision
      energy: def.energyMax || 0, // พลังงาน (Florentino): สกิลที่มี energyCost ต้องมีพลังงานพอ
      combatT: 99, // วินาทีนับจากที่ตัวเองโดน/ทำดาเมจครั้งล่าสุด (ออกจากการต่อสู้นานพอ = Lunge พร้อมใช้อีกครั้ง)
      lunge: true, // การโจมตีปกติครั้งถัดไปเป็นท่าแทง (Lunge) พร้อมใช้หรือยัง
      slowT: 0, // ถูกชะลอความเร็ว (วินาทีที่เหลือ) ตัวคูณอยู่ที่ slowMult
      slowMult: 1,
      boostT: 0, // วิ่งเร็วขึ้น +50% หลัง Shuffle
      ccT: 0, // กันสถานะ (สตัน/ใบ้) หลัง Shuffle
      duel: null, // กำลังดวลกับใคร {target, t, mult}
      adStacks: 0, // พลังโจมตีถาวรจากการชนะดวล (สูงสุด 10)
      gcd: 0, // พักสั้นๆ หลังใช้สกิลจบ ก่อนใช้สกิลถัดไป
      frame: "idle",
      cast: null, // {i, sk, t, shots, fired, hit}
      dashTimer: 0,
      dashMult: 1,
      hitFlash: 0,
      mind: 0, // ระดับสติ/ความมั่นใจที่ถูกบั่นทอน 0-100 (โดนคำพูดของ Luka)
      mindHold: 0, // เวลาที่ mind ยังค้างอยู่ก่อนจะเริ่มฟื้น
      silence: 0, // ถูกใบ้สกิล: ใช้สกิลไม่ได้ (ยังเดินได้) เวลาที่เหลือเป็นวินาที
      stun: 0, // เวลาที่เหลือของอาการสติแตก
      // อาวุธที่หมุนรอบตัวตลอดเวลา (เช่นดาบคาตานะ): หมุนไปเรื่อยๆ จนฟันโดนแล้วกลับทิศ
      weapon: def.weapon || null,
      weaponAng: this.rng() * Math.PI * 2,
      weaponDir: 1,
      weaponCd: 0,
      disarmed: false, // ทิ้งอาวุธเพราะสติแตกหนัก (ใช้การชนโจมตีแทน)
      ramCd: 0, // พักก่อนชนโจมตีซ้ำได้
      clashCd: 0, // พักก่อนอาวุธชนกัน (clash) ซ้ำได้
    };
  }

  update(dt) {
    this.events.length = 0;
    if (this.winner !== null) {
      // จบแมตช์แล้ว: คนชนะยังเด้งไปมาต่อ ส่วนคนแพ้ไม่ถูกคำนวณอีก (ตัววาดจะทำให้แตกกระจาย)
      for (const f of this.fighters) {
        if (f.hp <= 0) continue;
        f.hitFlash = Math.max(0, f.hitFlash - dt);
        if (f.weapon && !f.disarmed) f.weaponAng += f.weaponDir * f.weapon.spinSpeed * dt;
        this._move(f, dt);
      }
      return;
    }
    this.time += dt;

    // กำลังย้อนเวลา: โลกถูกควบคุมโดยการเล่นภาพย้อนหลัง ไม่คำนวณฟิสิกส์ปกติ
    if (this.rewind) {
      this._updateRewind(dt);
      this._checkWinner();
      return;
    }
    this.wt += dt;
    this._recordHistory(dt);

    // ตัดเวลา (King Crimson): เวลายังเดินต่อ แต่ผู้ใช้ "ไม่อยู่ในความจริง" (โดนอะไรไม่ได้ ทะลุผ่านหมด)
    // ส่วนศัตรูในรัศมีจะเหม่อลอยทำตามโชคชะตาเดิม โดยเล็งไปที่ตำแหน่งเก่าของผู้ใช้เท่านั้น
    this.eraser = this.fighters.find((f) => f.cast && f.cast.sk.type === "timeerase") || null;
    this.dazedList = this.eraser && this.eraser.cast.dazedList ? this.eraser.cast.dazedList.filter((g) => g.hp > 0) : [];
    // ชะลอเวลา (Johan): คนอื่นที่อยู่ในวงจะเดินช้าลง / เร่งเวลา: ผู้ใช้เองเดินเร็วขึ้น
    this.slower = this.fighters.find((f) => f.cast && f.cast.sk.type === "timeslow") || null;
    for (const f of this.fighters) {
      if (f.hp <= 0) continue;
      let enemy = this._target(f);
      if (this.isDazed(f) && this.phantom) enemy = this.phantom;
      f.facing = enemy.x >= f.x ? 1 : -1;
      f.hitFlash = Math.max(0, f.hitFlash - dt);
      // เวลาที่ตัวนี้ "รู้สึก": ถูกชะลอ (ts) และ/หรือเร่งเอง (rate)
      // cdt = นาฬิกาของสกิลที่กำลังร่าย (ไม่คูณ rate เพราะ duration ของเร่งเวลาเป็นวินาทีจริง)
      const ts = this._timeScale(f.x, f.y, f);
      const rate = f.cast && f.cast.sk.type === "timeaccel" ? f.cast.sk.rate || 2 : 1;
      const fdt = dt * ts * rate;
      const cdt = dt * ts;
      f.tdt = fdt;
      // สติ/ความมั่นใจ (mind 0-100): ยิ่งสูงยิ่งสับสน คูลดาวน์เดินช้าลง ทิศเดินเพี้ยน
      const m = f.mind / 100;
      if (f.mindHold > 0) f.mindHold -= fdt; // ค้างไว้ก่อน ยังไม่ฟื้น
      else f.mind = Math.max(0, f.mind - 7 * fdt);
      f.silence = Math.max(0, f.silence - fdt);
      f.combatT += fdt;
      if (f.def.energyMax) f.energy = Math.min(f.def.energyMax, f.energy + (f.def.energyRegen || 0) * fdt);
      f.slowT = Math.max(0, f.slowT - fdt);
      f.boostT = Math.max(0, f.boostT - fdt);
      if (f.ccT > 0) { f.ccT -= fdt; f.stun = 0; f.silence = 0; } // Shuffle: กันสถานะ
      if (f.duel) {
        f.duel.t -= fdt;
        if (f.duel.t <= 0 || f.duel.target.hp <= 0) f.duel = null;
      }
      if (!f.lunge && f.combatT >= (f.def.lungeRearm || 3) && f.skills.some((k) => k.requires === "lunge")) f.lunge = true;
      if (m > 0) this._rotate(f, (this.rng() - 0.5) * 8 * m * fdt);
      const slow = 1 - 0.4 * m;
      f.gcd = Math.max(0, f.gcd - fdt * slow);
      // hpRush: ยิ่งเลือดน้อย คูลดาวน์ของสกิลนั้นยิ่งเดินเร็ว (1 เท่าตอนเลือดเต็ม -> hpRush เท่าตอนเลือดหมด)
      const lost = 1 - Math.max(0, f.hp) / f.maxHp;
      for (let i = 0; i < f.cds.length; i++) {
        const rush = f.skills[i].hpRush ? 1 + (f.skills[i].hpRush - 1) * lost : 1;
        f.cds[i] -= fdt * slow * rush;
      }
      f.kickCd = Math.max(0, f.kickCd - fdt);
      f.ramCd = Math.max(0, f.ramCd - fdt);
      f.clashCd = Math.max(0, f.clashCd - fdt);
      this._updateDisarm(f);
      // ทิ้งอาวุธแล้ว: วิ่งเข้าหาศัตรูเพื่อชน (สกิลที่ควบคุมการเคลื่อนที่เองจะทับค่านี้ทีหลัง)
      if (f.disarmed && f.stun <= 0) this._steer(f, enemy, 1.8 * fdt);
      if (f.stun > 0) {
        f.stun -= fdt; // สติแตก: ใช้สกิลไม่ได้ ขยับได้ช้า
        f.cast = null;
        f.frame = "idle";
        f.dashTimer = 0;
      } else {
        if (!f.cast && !this._chaseFlowers(f, enemy, fdt)) this._approach(f, enemy, fdt); // ว่างๆ: วิ่งไปเก็บดอกไม้ของตัวเอง ไม่งั้นเข้าหาศัตรูให้อยู่ในระยะสกิล
        this._updateSkill(f, enemy, cdt);
      }
      this._move(f, fdt);
    }

    if (this.rewind) { this._checkWinner(); return; } // เพิ่งเริ่มย้อนเวลาในก้าวนี้
    const F = this.fighters;
    for (let i = 0; i < F.length; i++) {
      for (let j = i + 1; j < F.length; j++) if (F[i].hp > 0 && F[j].hp > 0) this._fighterCollision(F[i], F[j]);
    }
    for (let i = 0; i < F.length; i++) {
      for (let j = i + 1; j < F.length; j++) {
        if (F[i].team !== F[j].team) this._weaponClash(F[i], F[j]); // อาวุธชนอาวุธ: ปัดกันและเด้งออก (ก่อนคิดว่าอาวุธโดนตัว)
      }
    }
    for (const f of this.fighters) {
      if (f.hp > 0 && f.weapon && !f.disarmed) this._updateWeapon(f, this._target(f), f.tdt);
    }
    this._updateProjectiles(dt);
    this._updateBalls(dt);
    this._updateFlowers(dt);
    this._updateWaves(dt);
    // ตัดเวลาอาจจบกลางก้าวนี้ (cast ถูกเคลียร์) ให้สถานะที่ตัววาดอ่านตรงกับความจริงเสมอ
    // (นับจากสถานะจริงตอนนี้ ไม่ใช่ตัวที่จำไว้ตอนต้นก้าว เพราะอีกคนอาจเพิ่งเริ่มตัดเวลาต่อจากคนที่เพิ่งจบในก้าวเดียวกัน)
    if (!this.fighters.some((g) => g.cast && g.cast.sk.type === "timeerase")) {
      this.eraser = null;
      this.dazedList = [];
      this.phantom = null;
    }
    // ชะลอเวลาอาจจบกลางก้าวนี้ ให้ตัววาดเห็นสถานะตรงกับความจริง
    if (this.slower && !(this.slower.cast && this.slower.cast.sk.type === "timeslow")) this.slower = null;
    this._checkWinner();
  }

  // ตัวคูณเวลาที่จุด (x,y) สำหรับของที่เป็นของ owner: 1 = ปกติ, น้อยกว่า 1 = อยู่ในวงชะลอเวลาของ Johan
  // ผู้ใช้สกิลไม่ถูกชะลอ ขอบวง 20% นอกสุดค่อยๆ จางกลับเป็นปกติ (กันกระตุกตรงขอบ)
  _timeScale(x, y, owner) {
    const s = this.slower;
    if (!s || !s.cast || (owner && owner.team === s.team)) return 1;
    const sk = s.cast.sk;
    const R = sk.radius || 300;
    const d = Math.hypot(x - s.x, y - s.y);
    if (d >= R) return 1;
    const edge = Math.max(0, Math.min(1, (d - R * 0.8) / (R * 0.2)));
    const factor = sk.factor !== undefined ? sk.factor : 0.35;
    return factor + (1 - factor) * edge;
  }

  // ให้ตัววาดถามว่าตัวนี้ช้าลงเท่าไร (1 = ปกติ)
  timeScaleOf(f) {
    return this._timeScale(f.x, f.y, f);
  }

  // ---------- สกิล ----------
  _updateSkill(f, enemy, dt) {
    if (!f.skills.length) return;

    if (f.cast) {
      const c = f.cast;
      const sk = c.sk;
      c.t += dt;

      if (sk.type === "projectile") {
        // ยิงเป็นชุด: count ลูก ห่างกัน interval วินาที เริ่มที่ fireDelay
        const count = sk.count || 1;
        const interval = sk.interval || 0;
        while (c.shots < count && c.t >= (sk.fireDelay || 0) + c.shots * interval) {
          this._fireProjectile(f, enemy, sk);
          c.shots++;
        }
      } else if (sk.type === "shockwave") {
        if (!c.fired && c.t >= (sk.fireDelay || 0)) {
          c.fired = true;
          this._fireWave(f, enemy, sk);
        }
      } else if (sk.type === "triplethreat") {
        this._tripleRun(f, enemy, sk, c, dt); // รำ 3 ท่าติดกัน
      } else if (sk.type === "duel") {
        this._duelRun(f, enemy, sk, c, dt); // พุ่งเข้าหาแล้วประกาศดวล
      } else if (sk.type === "ballkick") {
        // พุ่งไปที่บอลแล้วเตะใส่ศัตรู (เตะเสร็จค้างท่าเตะนิดหนึ่งแล้วจบ)
        if (!c.kicked) {
          const st = this._chaseBall(f, sk, dt);
          if (st === "reach") {
            this._kickBall(f, enemy, sk, 1, 1, 1, false);
            c.kicked = true;
            c.kickedAt = c.t;
            f.frame = "kick";
            f.dashTimer = 0;
          } else if (st === "none") c.t = sk.duration;
        } else if (c.t - c.kickedAt >= 0.25) c.t = sk.duration;
      } else if (sk.type === "metavision") {
        this._metaVision(f, enemy, sk, c, dt); // มองเห็นอนาคต: หลบกระสุน/คลื่น/การพุ่งของศัตรู
      } else if (sk.type === "dash" && sk.homing) {
        this._steer(f, enemy, sk.homing * dt); // เลี้ยวเข้าหาศัตรูเล็กน้อยระหว่างพุ่ง
      } else if (sk.type === "timeerase") {
        if (sk.backstab) this._backstabRun(f, enemy, sk, c, dt); // วนไปด้านหลังศัตรูแล้วพุ่งแทง
        else this._steer(f, enemy, (sk.homing || 3) * dt); // ระหว่างเวลาถูกตัด วิ่งเข้าหาศัตรูเพื่อฟันสวน
      } else if (sk.type === "timeaccel" && sk.hitAndRun) {
        this._hitAndRun(f, enemy, sk, c, dt); // เร่งเวลา: วิ่งวนรอบศัตรู -> พุ่งเข้าโจมตี -> หลบออก วนซ้ำ
      } else if ((sk.type === "timeaccel" || sk.type === "timeslow") && sk.homing) {
        // เร่ง/ชะลอเวลา: วิ่งเข้าหาศัตรูเพื่อใช้เวลาที่ได้เปรียบให้คุ้ม (เร่งเวลา เลี้ยวไวขึ้นตามเวลาที่เร็วขึ้น)
        this._steer(f, enemy, sk.homing * dt * (sk.type === "timeaccel" ? sk.rate || 2 : 1));
      }

      if (c.t >= sk.duration) {
        if (sk.type === "timeerase") {
          this._endTimeErase(f, enemy, false);
        } else {
          if (sk.type === "ballkick" && !c.kicked) f.cds[c.i] = 1; // ไปไม่ถึงบอล: ลองใหม่เร็วๆ
          if (sk.type === "duel" && !f.duel) f.cds[c.i] = Math.min(f.cds[c.i], 3); // พุ่งไม่ถึงคู่ดวล: ลองใหม่เร็วๆ
          if (sk.shuffle) this._shuffle(f, enemy, sk.shuffle); // หลังท่า: ไถลออก + กันสถานะ + วิ่งเร็วขึ้นชั่วครู่
          if (sk.type === "metavision" && sk.counterKick) {
            // จบ Meta Vision: เห็นช่องว่างของศัตรูแล้ว พุ่งเตะบอลสวนทันที
            for (let i = 0; i < f.skills.length; i++) if (f.skills[i].type === "ballkick") f.cds[i] = Math.min(f.cds[i], 0.15);
            this.events.push({ type: "metaEnd", x: f.x, y: f.y });
          }
          f.cast = null;
          f.frame = "idle";
          f.dashTimer = 0;
          f.gcd = sk.restAfter !== undefined ? sk.restAfter : 0.25; // พักก่อนใช้สกิลถัดไป
        }
      }
      return;
    }

    if (f.gcd > 0 || f.silence > 0) return; // ถูกใบ้อยู่: ใช้สกิลไม่ได้ (คูลดาวน์ยังเดินต่อ)

    // เลือกสกิลที่พร้อมใช้ โดยให้สกิลที่รอมานานที่สุดไปก่อน (กันสกิลแรกแย่งใช้ตลอด)
    let pick = -1;
    const timeBusy = this.rewind || this.fighters.some((g) => g.cast && TIME_SKILLS.includes(g.cast.sk.type));
    for (let i = 0; i < f.skills.length; i++) {
      const s2 = f.skills[i];
      if (f.cds[i] > 0) continue;
      if (timeBusy && TIME_SKILLS.includes(s2.type)) continue; // เวลาถูกแตะอยู่แล้ว
      // ย้อนเวลาจะใช้ก็ต่อเมื่อเสียเลือดไปพอสมควรในช่วงที่ย้อนกลับได้ (ไม่งั้นย้อนไปก็เปล่าประโยชน์)
      if (s2.type === "rewind" && !this._rewindWorthIt(f, s2)) continue;
      // Lunge (โจมตีปกติ) ใช้ได้เมื่อพร้อม และไม่ใช้ระหว่างวงจรรำ (ยังมีดอกไม้ให้เก็บ หรือ Triple Threat พร้อมแทง)
      if (s2.requires === "lunge" && (!f.lunge || this.flowers.some((fl) => fl.owner === f) || this._stabReady(f, enemy))) continue;
      if (s2.energyCost && f.energy < s2.energyCost) continue; // พลังงานไม่พอ
      if (s2.maxRange && Math.hypot(enemy.x - f.x, enemy.y - f.y) > s2.maxRange) continue; // ศัตรูไกลเกินระยะ
      // เตะบอลได้เมื่อมีบอลเปล่าให้เตะ (ถ้าบอลกำลังลอยเป็นอันตรายอยู่ ต้องรอ)
      if (s2.type === "ballkick" && (!this.balls.length || this.balls[0].hot)) continue;
      if (pick === -1 || f.cds[i] < f.cds[pick]) pick = i;
    }
    if (pick === -1) return;

    const sk = f.skills[pick];
    f.cds[pick] = sk.cooldown;
    if (sk.energyCost) f.energy -= sk.energyCost;
    if (sk.requires === "lunge") f.lunge = false;
    f.cast = { i: pick, sk, t: 0, shots: 0, fired: false, hit: false };
    f.frame = sk.frame || "idle";

    if (sk.type === "dash") {
      f.dashTimer = sk.duration;
      f.dashMult = sk.speedMult;
      const dx = enemy.x - f.x;
      const dy = enemy.y - f.y;
      const len = Math.hypot(dx, dy) || 1;
      const sp = f.def.speed * sk.speedMult;
      f.vx = (dx / len) * sp;
      f.vy = (dy / len) * sp;
      this.events.push({ type: "dash", x: f.x, y: f.y });
    } else if (sk.type === "timeerase") {
      // ตัดเวลา: ตัวเองเร็วขึ้นและพุ่งหาศัตรู ศัตรูถูกแช่แข็งตลอด sk.duration วินาที
      f.dashTimer = sk.duration;
      f.dashMult = sk.speedMult || 1.5;
      const dx = enemy.x - f.x;
      const dy = enemy.y - f.y;
      const len = Math.hypot(dx, dy) || 1;
      f.vx = (dx / len) * f.def.speed;
      f.vy = (dy / len) * f.def.speed;
      // ศัตรูที่อยู่ในรัศมีจะเหม่อลอย ทำตามโชคชะตาเดิมโดยเล็งไปที่ตำแหน่งเก่าของ FuNx
      const list = this._foes(f).filter((g) => Math.hypot(g.x - f.x, g.y - f.y) <= (sk.radius || 480));
      const inRange = list.length > 0;
      f.cast.dazedList = list;
      f.cast.dazed = inRange;
      this.phantom = inRange ? { x: f.x, y: f.y, r: f.r, vx: 0, vy: 0, knockX: 0, knockY: 0, hp: f.hp } : null;
      this.events.push({ type: "erase", x: f.x, y: f.y, dazed: inRange });
    } else if (sk.type === "rewind") {
      this._startRewind(f, sk);
    } else if (sk.type === "timeaccel") {
      // เร่งเวลาตัวเอง: ความเร็วเดินจริงถูกคูณ rate ในลูปหลัก (ดู fdt) ที่นี่แค่ประกาศเริ่ม
      this.events.push({ type: "accel", x: f.x, y: f.y, rate: sk.rate || 2 });
    } else if (sk.type === "triplethreat") {
      this.events.push({ type: "triple", x: f.x, y: f.y });
    } else if (sk.type === "duel") {
      this.events.push({ type: "duelCharge", x: f.x, y: f.y });
    } else if (sk.type === "metavision") {
      f.cast.dodges = 0;
      f.cast.dodgeCd = 0.1;
      this.events.push({ type: "metaStart", x: f.x, y: f.y });
    } else if (sk.type === "timeslow") {
      this.events.push({ type: "slow", x: f.x, y: f.y, radius: sk.radius || 300 });
    }
  }

  // ---------- อาวุธชนอาวุธ (clash) ----------
  // รูปทรงของอาวุธเป็นแคปซูลหลายชิ้น: ก้าน (จากจุดจับถึงปลาย) และหัวเข็มทิศ (วงกลม ถ้ามี)
  // ---------- Florentino ----------
  // ตัวคูณดาเมจ: พลังโจมตีถาวรสะสม (+4% ต่อสแต็ก) x โบนัสตอนดวลกับเป้าหมายนั้น
  _dmgMult(f, target) {
    return (1 + 0.04 * (f.adStacks || 0)) * (f.duel && f.duel.target === target ? f.duel.mult : 1);
  }

  // ดาเมจของท่า Triple Threat / ประกาศดวล: ดาเมจกายภาพ + ดาเมจจริง truePct ของเลือดสูงสุดศัตรู
  _florHit(f, target, dmg, truePct) {
    let amt = this._out(f, dmg * this._dmgMult(f, target));
    if (truePct) amt += Math.max(1, Math.round(target.maxHp * truePct));
    const d = Math.hypot(target.x - f.x, target.y - f.y) || 1;
    this._damage(target, amt, target.x - ((target.x - f.x) / d) * target.r, target.y - ((target.y - f.y) / d) * target.r);
    this._knock(target, target.x - f.x, target.y - f.y, 90);
    f.combatT = 0;
    this.events.push({ type: "slash", x: target.x, y: target.y, ang: Math.atan2(target.y - f.y, target.x - f.x) });
  }

  // Triple Threat ("แทง"): พุ่งเข้าหาแล้วแทง 3 จังหวะ (ครั้งที่ 2 ส่งศัตรูลอย ครั้งที่ 3 แทงสองที) โดนฮีโร่ = Blossom คูลดาวน์ลด 1 วินาที
  // แล้ว "พุ่งทะลุตัวศัตรูไป" เก็บดอกไม้ที่อยู่ใกล้ที่สุด 1 ดอก (เก็บแล้วพลังงานเต็ม + แทงได้อีก) ระหว่างแทงจะไม่เก็บดอก
  _tripleRun(f, enemy, sk, c, dt) {
    const list = sk.strikes || [];
    c.next = c.next || 0;
    if (!c.exit) {
      // ช่วงแทง: เข้าหาศัตรู ถ้าทับตัวแล้วก็ไหลทะลุไปตามความเร็วเดิม (ไม่หมุนตามจุดศูนย์กลางที่ทับกัน)
      if (Math.hypot(enemy.x - f.x, enemy.y - f.y) > f.r + enemy.r * 0.5 + 4) this._steer(f, enemy, (sk.homing || 14) * dt);
      f.dashTimer = 0.2;
      f.dashMult = sk.speedMult || 2.4;
      while (c.next < list.length && c.t >= list[c.next].t) {
        const st = list[c.next++];
        const reach = f.r + enemy.r + (sk.reach || 60);
        if (enemy === this.phantom || enemy === this.eraser || enemy.hp <= 0) continue;
        if (Math.hypot(enemy.x - f.x, enemy.y - f.y) > reach) continue; // แทงไม่ถึง
        this._florHit(f, enemy, st.damage, sk.truePct || 0);
        if (st.stun) {
          enemy.stun = Math.max(enemy.stun, st.stun); // ลอยกลางอากาศ = ขยับ/ร่ายไม่ได้
          this.events.push({ type: "airborne", x: enemy.x, y: enemy.y });
        }
        if (!c.cutDone) {
          c.cutDone = true;
          f.skills.forEach((k, i) => { if (k.flowers) f.cds[i] = Math.max(0, f.cds[i] - 1); });
        }
      }
      if (c.next >= list.length && c.t >= (sk.exitAt || list[list.length - 1].t + 0.1)) {
        c.exit = true;
        c.flowersAtExit = this.flowers.filter((fl) => fl.owner === f).length;
      }
      return;
    }
    // ช่วงพุ่งออก: พุ่งทะลุไปหาดอกไม้ที่ใกล้ที่สุด (ไม่มีดอกไม้ = พุ่งผ่านตัวศัตรูไปอีกนิดแล้วจบ)
    let best = null;
    let bd = Infinity;
    for (const fl of this.flowers) {
      if (fl.owner !== f) continue;
      const d = Math.hypot(fl.x - f.x, fl.y - f.y);
      if (d < bd) { bd = d; best = fl; }
    }
    f.dashTimer = 0.2;
    f.dashMult = sk.exitSpeed || 3.4;
    if (best) {
      this._steer(f, best, 20 * dt);
      const now = this.flowers.filter((fl) => fl.owner === f).length;
      if (now < c.flowersAtExit) c.t = sk.duration; // เก็บดอกได้แล้ว: จบท่า
    } else if (c.t >= (c.exitStart = c.exitStart || c.t) + 0.2) {
      c.t = sk.duration;
    }
  }

  // Gentleman's Duel: ชาร์จสั้นๆ แล้วพุ่งเข้าหาศัตรูที่ใกล้ที่สุด ชนแล้วเริ่มดวล duelTime วินาที
  _duelRun(f, enemy, sk, c, dt) {
    f.dashTimer = 0.2;
    if (c.t < (sk.charge || 0.4)) { f.dashMult = 0.05; return; } // ชาร์จ: แทบหยุดนิ่ง
    this._steer(f, enemy, 14 * dt);
    f.dashMult = sk.speedMult || 5;
    if (f.duel || enemy === this.phantom || enemy === this.eraser || enemy.hp <= 0) return;
    if (Math.hypot(enemy.x - f.x, enemy.y - f.y) <= f.r + enemy.r + 10) {
      f.duel = { target: enemy, t: sk.duelTime || 5, mult: sk.duelMult || 1.4 };
      this._florHit(f, enemy, sk.damage || 5, 0);
      this.events.push({ type: "duel", x: enemy.x, y: enemy.y });
      c.t = sk.duration; // จบการพุ่ง
    }
  }

  // Shuffle: ไถลออกจากศัตรูเล็กน้อย กันสถานะ และวิ่งเร็วขึ้นชั่วครู่
  _shuffle(f, enemy, sh) {
    this._knock(f, f.x - enemy.x, f.y - enemy.y, sh.slide !== undefined ? sh.slide : 260);
    f.ccT = sh.ccImmune !== undefined ? sh.ccImmune : 0.5;
    f.boostT = sh.boost !== undefined ? sh.boost : 0.5;
  }

  // Blossom: ดอกไม้ปรากฏรอบเป้าหมาย (อยู่ได้ 5 วินาที) เฉพาะเจ้าของเก็บได้
  _spawnFlowers(owner, target, n, dist) {
    const a0 = this.rng() * Math.PI * 2;
    for (let k = 0; k < n; k++) {
      const a = a0 + (k / n) * Math.PI * 2;
      const x = Math.max(20, Math.min(this.w - 20, target.x + Math.cos(a) * (dist || 64)));
      const y = Math.max(20, Math.min(this.h - 20, target.y + Math.sin(a) * (dist || 64)));
      this.flowers.push({ x, y, r: 16, t: 5, life: 5, owner, bob: this.rng() * 6 });
    }
    this.events.push({ type: "flowers", x: target.x, y: target.y });
  }

  _updateFlowers(dt) {
    const got = new Set(); // เก็บได้ทีละดอกต่อเฟรม
    for (const fl of this.flowers) {
      fl.t -= dt;
      const o = fl.owner;
      if (fl.t <= 0 || o.hp <= 0) { fl.gone = true; continue; }
      // ระหว่างแทง (Triple Threat) ยังไม่เก็บ ต้องแทงจบแล้วพุ่งออกไปเก็บ (ทีละดอกต่อการแทง 1 ครั้ง)
      if (o.cast && o.cast.sk.type === "triplethreat" && !o.cast.exit) continue;
      if (got.has(o)) continue;
      // แทงพร้อมอยู่แล้ว (พลังงานเต็ม/คูลดาวน์หมด) = ไม่เก็บเอง เก็บด้วยการแทงพุ่งทะลุแทน (ได้ครบทุกดอก ทีละดอกต่อการแทง)
      if (!(o.cast && o.cast.sk.type === "triplethreat") && this._stabReady(o, this._target(o), true)) continue;
      if (Math.hypot(o.x - fl.x, o.y - fl.y) < o.r + fl.r) {
        got.add(o);
        // เก็บดอกไม้: เติมพลังงานเต็ม + Lunge พร้อมใช้ + รีเซ็ตคูลดาวน์สกิลที่ใช้พลังงาน (Triple Threat)
        fl.gone = true;
        o.energy = o.def.energyMax || o.energy;
        o.lunge = true;
        o.skills.forEach((k, i) => { if (k.energyCost) o.cds[i] = 0; });
        this.events.push({ type: "flower", x: fl.x, y: fl.y });
      }
    }
    this.flowers = this.flowers.filter((fl) => !fl.gone);
  }

  // สกิลที่ใช้พลังงาน (Triple Threat) พร้อมแทงเลยไหม: คูลดาวน์หมด พลังงานพอ และศัตรูอยู่ในระยะ
  _stabReady(f, enemy, ignoreRange) {
    return f.skills.some((k, i) =>
      k.energyCost && f.cds[i] <= 0 && f.energy >= k.energyCost &&
      (ignoreRange || !k.maxRange || Math.hypot(enemy.x - f.x, enemy.y - f.y) <= k.maxRange));
  }

  // ว่างๆ ก็วิ่งไปเก็บดอกไม้ของตัวเอง (เร็วขึ้นนิดหน่อย) ยกเว้นพร้อมแทงอยู่แล้ว (ให้แทงพุ่งทะลุไปเก็บแทน) คืน true ถ้าสั่งวิ่งไปแล้ว
  _chaseFlowers(f, enemy, dt) {
    if (!this.flowers.length || f.stun > 0 || this._stabReady(f, enemy, true)) return false; // พร้อมแทงอยู่ = เข้าหาศัตรูแล้วแทงทะลุไปเก็บ ไม่เดินไปเก็บเอง
    let best = null;
    let bd = Infinity;
    for (const fl of this.flowers) {
      if (fl.owner !== f) continue;
      const d = Math.hypot(fl.x - f.x, fl.y - f.y);
      if (d < bd) { bd = d; best = fl; }
    }
    if (!best) return false;
    this._steer(f, best, 8 * dt);
    f.dashTimer = Math.max(f.dashTimer, 0.1);
    f.dashMult = 1.6;
    return true;
  }

  // ตัวที่มีสกิลจำกัดระยะ (maxRange): เข้าหาศัตรูจนอยู่ในระยะของสกิลที่พร้อมใช้
  _approach(f, enemy, dt) {
    if (f.stun > 0 || enemy === f || enemy === this.phantom) return;
    let range = 0;
    f.skills.forEach((k, i) => {
      if (!k.maxRange || f.cds[i] > 0) return;
      if (k.energyCost && f.energy < k.energyCost) return;
      range = Math.max(range, k.maxRange);
    });
    if (!range) return;
    if (Math.hypot(enemy.x - f.x, enemy.y - f.y) > range * 0.85) {
      this._steer(f, enemy, 8 * dt);
      f.dashTimer = Math.max(f.dashTimer, 0.1);
      f.dashMult = 1.5;
    }
  }

  // ---------- บอลบนสนาม (Isagi) ----------
  // จุดที่ควรเตะไป: ศัตรูที่กำลังเคลื่อนที่ ณ เวลาที่บอลไปถึง
  _leadPoint(from, enemy, speed) {
    let tx = enemy.x;
    let ty = enemy.y;
    const evx = (enemy.vx || 0) + (enemy.knockX || 0);
    const evy = (enemy.vy || 0) + (enemy.knockY || 0);
    for (let i = 0; i < 3; i++) {
      const tt = Math.hypot(tx - from.x, ty - from.y) / speed;
      tx = enemy.x + evx * tt;
      ty = enemy.y + evy * tt;
    }
    return { x: Math.max(10, Math.min(this.w - 10, tx)), y: Math.max(10, Math.min(this.h - 10, ty)) };
  }

  // วิ่งไปหาบอลเปล่า: คืน "reach" (ถึงแล้ว เตะได้) | "chase" (กำลังไป) | "none" (ไม่มีบอลเปล่า)
  _chaseBall(f, ks, dt) {
    const b = this.balls[0];
    if (!b || b.hot) return "none";
    this._steer(f, b, 14 * dt);
    f.dashTimer = 0.2;
    f.dashMult = ks.chaseSpeed || 2.4;
    return Math.hypot(b.x - f.x, b.y - f.y) <= f.r + b.r + 6 ? "reach" : "chase";
  }

  _kickBall(f, enemy, ks, speedMult, dmgMult, knockMult, meta) {
    const b = this.balls[0];
    if (!b) return;
    const speed = (ks.kickSpeed || 640) * speedMult;
    const aim = this._leadPoint(b, enemy, speed);
    const ang = Math.atan2(aim.y - b.y, aim.x - b.x);
    b.vx = Math.cos(ang) * speed;
    b.vy = Math.sin(ang) * speed;
    b.hot = true;
    b.owner = f;
    b.meta = meta;
    b.damage = Math.round((ks.damage || 12) * dmgMult);
    b.knock = (ks.knockback || 0) * knockMult;
    b.evadedBy = null;
    b.reflectCd = 0.2;
    this.events.push({ type: "kick", x: b.x, y: b.y, meta });
  }

  // สะท้อนบอลของศัตรู: เจ้าของบอลเปลี่ยนเป็นคนปัด ส่งไปทาง (tx,ty) เร็วอย่างน้อย minSpeed
  _reflectBall(b, by, tx, ty, minSpeed) {
    if (b.reflectCd > 0) return;
    const sp = Math.max(minSpeed, Math.hypot(b.vx, b.vy));
    const ang = Math.atan2(ty - b.y, tx - b.x);
    b.vx = Math.cos(ang) * sp;
    b.vy = Math.sin(ang) * sp;
    b.owner = by;
    b.hot = true;
    b.evadedBy = null;
    b.reflectCd = 0.3;
    this.events.push({ type: "reflect", x: b.x, y: b.y });
  }

  _updateBalls(dt) {
    for (const b of this.balls) {
      if (!isFinite(b.x + b.y + b.vx + b.vy)) { // กันบั๊กเผื่อไว้: ค่าบอลเพี้ยน -> วางกลับกลางสนามเป็นบอลเปล่า
        b.x = this.w / 2; b.y = this.h / 2; b.vx = b.vy = 0; b.hot = false; b.owner = null; b.meta = false;
      }
      const d = dt * this._timeScale(b.x, b.y, b.owner);
      b.reflectCd = Math.max(0, b.reflectCd - dt);
      b.x += b.vx * d;
      b.y += b.vy * d;
      const sp = Math.hypot(b.vx, b.vy);
      b.rot += ((sp * d) / b.r) * (b.vx >= 0 ? 1 : -1);
      // เด้งกำแพง
      if (b.x < b.r) { b.x = b.r; b.vx = Math.abs(b.vx) * 0.92; }
      if (b.x > this.w - b.r) { b.x = this.w - b.r; b.vx = -Math.abs(b.vx) * 0.92; }
      if (b.y < b.r) { b.y = b.r; b.vy = Math.abs(b.vy) * 0.92; }
      if (b.y > this.h - b.r) { b.y = this.h - b.r; b.vy = -Math.abs(b.vy) * 0.92; }
      // ลูกที่เตะแล้วค่อยๆ ช้าลง บอลเปล่าหยุดเร็ว
      const drag = Math.exp(-(b.hot ? 0.2 : 1.3) * d);
      b.vx *= drag;
      b.vy *= drag;
      if (b.hot && Math.hypot(b.vx, b.vy) < 170) { b.hot = false; b.owner = null; b.meta = false; b.evadedBy = null; }

      for (const f of this.fighters) {
        if (f.hp <= 0) continue;
        const dx = b.x - f.x;
        const dy = b.y - f.y;
        const dist = Math.hypot(dx, dy) || 0.0001;
        if (dist >= f.r + b.r) continue;
        const nx = dx / dist;
        const ny = dy / dist;
        if (b.hot) {
          if (b.owner.team === f.team || this._evaded(b, f) || f === this.eraser) continue; // ทีมเดียวกับเจ้าของบอล/หลบไปแล้ว/อยู่นอกความจริง: ทะลุผ่าน
          this._damage(f, this._out(b.owner, b.damage), b.x - nx * b.r, b.y - ny * b.r);
          this._knock(f, b.vx, b.vy, b.knock);
          // บอลกระดอนออกจากตัวแล้วกลายเป็นบอลเปล่า
          const dot = b.vx * nx + b.vy * ny;
          b.vx = (b.vx - 2 * dot * nx) * 0.35;
          b.vy = (b.vy - 2 * dot * ny) * 0.35;
          b.x = f.x + nx * (f.r + b.r + 2);
          b.y = f.y + ny * (f.r + b.r + 2);
          b.hot = false;
          b.owner = null;
          b.meta = false;
          b.evadedBy = null;
        } else {
          // บอลเปล่า: ใครชนก็ดันบอลไป (ไม่มีดาเมจ)
          b.x = f.x + nx * (f.r + b.r);
          b.y = f.y + ny * (f.r + b.r);
          const fs = Math.hypot(f.vx + f.knockX, f.vy + f.knockY);
          const push = Math.max(fs * 1.1, 150);
          b.vx = nx * push;
          b.vy = ny * push;
        }
      }
    }
  }

  // ---------- Meta Vision (Isagi) ----------
  // ทุกก้าว: จำลองอนาคต lookahead วินาที ถ้ากระสุน/คลื่น/การพุ่งของศัตรูจะโดนตัว ก็สไลด์หลบแล้วทำให้ท่านั้นพลาดเป้า
  // (เก็บจำนวนครั้งที่หลบใน c.dodges และพักสั้นๆ ระหว่างหลบ ถ้าท่ามาถี่เกินไปก็อาจโดนบ้าง)
  _metaVision(f, enemy, sk, c, dt) {
    c.dodgeCd = Math.max(0, (c.dodgeCd || 0) - dt);
    c.threats = []; // ให้ตัววาดเอาไปวาดเส้น "อนาคตที่เห็น"
    // ระหว่าง Meta Vision ยังพุ่งเตะบอลได้ต่อเนื่อง และเตะแรงกว่าปกติ
    const ks = f.skills.find((k) => k.type === "ballkick");
    c.kickFlash = Math.max(0, (c.kickFlash || 0) - dt);
    f.frame = c.kickFlash > 0 ? "kick" : sk.frame || "idle";
    if (ks && f.kickCd <= 0) {
      const st = this._chaseBall(f, ks, dt);
      if (st === "reach") {
        this._kickBall(f, enemy, ks, sk.kickSpeedMult || 1.5, sk.kickDamageMult || 1.8, sk.kickKnockMult || 1.6, true);
        f.kickCd = sk.kickCd !== undefined ? sk.kickCd : 1;
        c.kickFlash = 0.25;
        f.dashTimer = 0;
      }
    }
    const look = sk.lookahead || 0.9;
    const maxD = sk.maxDodges !== undefined ? sk.maxDodges : 5;
    const threats = [];

    // กระสุนศัตรู: หาจุดที่เข้าใกล้ตัวมากที่สุดบนเส้นทางตรง
    for (const p of this.projectiles) {
      if (p.owner.team === f.team || p.dead || this._evaded(p, f)) continue;
      const ps = this._timeScale(p.x, p.y, p.owner);
      const sp = p.speed * ps;
      if (sp <= 0) continue;
      const rx = f.x - p.bx;
      const ry = f.y - p.by;
      const tc = (rx * p.dx + ry * p.dy) / sp; // เวลาที่เข้าใกล้ที่สุด
      if (tc < 0 || tc > look) continue;
      const cx = p.bx + p.dx * sp * tc - f.x;
      const cy = p.by + p.dy * sp * tc - f.y;
      if (Math.hypot(cx, cy) > f.r + p.r + (p.wobble || 0) + 10) continue;
      threats.push({ kind: "p", ref: p, t: tc, dx: p.dx, dy: p.dy, side: p.dx * (f.y - p.by) - p.dy * (f.x - p.bx) });
      c.threats.push({ x: p.x, y: p.y, ex: p.bx + p.dx * sp * Math.min(look, tc + 0.15), ey: p.by + p.dy * sp * Math.min(look, tc + 0.15) });
    }
    // บอลที่ศัตรูเตะ/สะท้อนมา
    for (const b of this.balls) {
      if (!b.hot || b.owner.team === f.team || this._evaded(b, f)) continue;
      const sp = Math.hypot(b.vx, b.vy);
      if (sp < 1) continue;
      const bdx = b.vx / sp;
      const bdy = b.vy / sp;
      const tc = ((f.x - b.x) * bdx + (f.y - b.y) * bdy) / sp;
      if (tc < 0 || tc > look) continue;
      const cx = b.x + bdx * sp * tc - f.x;
      const cy = b.y + bdy * sp * tc - f.y;
      if (Math.hypot(cx, cy) > f.r + b.r + 10) continue;
      threats.push({ kind: "b", ref: b, t: tc, dx: bdx, dy: bdy, side: bdx * (f.y - b.y) - bdy * (f.x - b.x) });
      c.threats.push({ x: b.x, y: b.y, ex: b.x + bdx * sp * Math.min(look, tc + 0.15), ey: b.y + bdy * sp * Math.min(look, tc + 0.15) });
    }
    // คลื่นเสียงของศัตรู: จะแผ่มาถึงตัวภายใน lookahead และตัวอยู่ในส่วนโค้ง
    for (const w of this.waves) {
      if (w.owner.team === f.team || w.hits.includes(f) || this._evaded(w, f)) continue;
      const dx = f.x - w.x;
      const dy = f.y - w.y;
      const dist = Math.hypot(dx, dy) || 0.0001;
      let da = Math.atan2(dy, dx) - w.ang;
      while (da > Math.PI) da -= Math.PI * 2;
      while (da < -Math.PI) da += Math.PI * 2;
      const slack = Math.asin(Math.min(1, f.r / dist));
      if (Math.abs(da) > w.halfArc + slack) continue;
      const tt = Math.max(0, (dist - f.r - w.r) / w.speed);
      if (tt > look || dist - f.r > w.maxR) continue;
      threats.push({ kind: "w", ref: w, t: tt, dx: Math.cos(w.ang), dy: Math.sin(w.ang), side: da >= 0 ? 1 : -1 });
      c.threats.push({ x: w.x + Math.cos(w.ang) * w.r, y: w.y + Math.sin(w.ang) * w.r, ex: f.x, ey: f.y });
    }
    // ศัตรูกำลังพุ่งชน: ยังไม่ชนและกำลังพุ่งมาทางนี้
    for (const enemy of this._foes(f)) {
    const ec = enemy.cast;
    if (ec && ec.sk.type === "dash" && !ec.hit && enemy.dashTimer > 0) {
      const dx = f.x - enemy.x;
      const dy = f.y - enemy.y;
      const dist = Math.hypot(dx, dy) || 0.0001;
      const sp = Math.hypot(enemy.vx, enemy.vy) || 1;
      const closing = (enemy.vx * dx + enemy.vy * dy) / (sp * dist); // 1 = พุ่งตรงมาที่เรา
      if (closing > 0.6 && (dist - f.r - enemy.r) / sp <= look) {
        threats.push({ kind: "d", ref: ec, t: (dist - f.r - enemy.r) / sp, dx: enemy.vx / sp, dy: enemy.vy / sp, side: (enemy.vx / sp) * dy - (enemy.vy / sp) * dx });
        c.threats.push({ x: enemy.x, y: enemy.y, ex: f.x, ey: f.y });
      }
    }
    }

    if (!threats.length || c.dodgeCd > 0 || c.dodges >= maxD) return;

    // หลบ: สไลด์ตั้งฉากกับทิศที่ท่ามา เลือกฝั่งที่ไม่ชนกำแพง (ไม่ชอบฝั่งที่อยู่ติดกำแพง)
    const first = threats.reduce((a, b) => (b.t < a.t ? b : a));
    let nx = -first.dy;
    let ny = first.dx;
    let sign = first.side >= 0 ? -1 : 1; // หนีไปฝั่งตรงข้ามกับที่ท่าเฉียดมาทางนั้น
    const margin = f.r * 2.2;
    const room = (sg) => {
      const px = f.x + nx * sg * 120;
      const py = f.y + ny * sg * 120;
      return Math.min(px, this.w - px, py, this.h - py);
    };
    if (room(sign) < margin && room(-sign) > room(sign)) sign = -sign;
    nx *= sign;
    ny *= sign;
    const power = sk.dodgePower || 620;
    this._knock(f, nx, ny, power);
    // ท่าทั้งหมดที่เห็นว่าจะโดนในช่วงเวลาใกล้กัน (ภายใน 0.35 วินาทีจากท่าแรก) ถือว่าหลบพร้อมกัน
    for (const th of threats) {
      if (th.t - first.t > 0.35) continue;
      if (th.kind === "d") th.ref.hit = true; // การพุ่งพลาดเป้า (ถือว่าใช้ไปแล้ว)
      else this._markEvaded(th.ref, f);
    }
    c.dodges++;
    c.dodgeCd = sk.dodgeCd !== undefined ? sk.dodgeCd : 0.28;
    this.events.push({ type: "dodge", x: f.x, y: f.y, nx, ny, left: maxD - c.dodges });
  }

  _weaponShapes(f) {
    const wp = f.weapon;
    const s0 = f.r * (wp.startRatio || 0.5);
    const s1 = f.r + wp.length;
    const head = wp.headRadius || 0;
    const ca = Math.cos(f.weaponAng);
    const sa = Math.sin(f.weaponAng);
    const rodEnd = head ? s1 - head : s1;
    const shapes = [{ x1: f.x + ca * s0, y1: f.y + sa * s0, x2: f.x + ca * rodEnd, y2: f.y + sa * rodEnd, r: (wp.width || 8) / 2 }];
    if (head) {
      const hx = f.x + ca * (s1 - head);
      const hy = f.y + sa * (s1 - head);
      shapes.push({ x1: hx, y1: hy, x2: hx, y2: hy, r: head });
    }
    return shapes;
  }

  // จุดที่ใกล้กันที่สุดระหว่างเส้นตรงสองเส้น (ถ้าตัดกัน ระยะ = 0)
  _segClosest(s, t) {
    const d1x = s.x2 - s.x1, d1y = s.y2 - s.y1;
    const d2x = t.x2 - t.x1, d2y = t.y2 - t.y1;
    const den = d1x * d2y - d1y * d2x;
    if (Math.abs(den) > 1e-9) {
      const u = ((t.x1 - s.x1) * d2y - (t.y1 - s.y1) * d2x) / den;
      const v = ((t.x1 - s.x1) * d1y - (t.y1 - s.y1) * d1x) / den;
      if (u >= 0 && u <= 1 && v >= 0 && v <= 1) {
        const x = s.x1 + d1x * u, y = s.y1 + d1y * u;
        return { d: 0, ax: x, ay: y, bx: x, by: y };
      }
    }
    const onSeg = (px, py, g) => {
      const gx = g.x2 - g.x1, gy = g.y2 - g.y1;
      const l2 = gx * gx + gy * gy;
      const k = l2 ? Math.max(0, Math.min(1, ((px - g.x1) * gx + (py - g.y1) * gy) / l2)) : 0;
      return { x: g.x1 + gx * k, y: g.y1 + gy * k };
    };
    let best = null;
    const tryPt = (px, py, g, swap) => {
      const q = onSeg(px, py, g);
      const d = Math.hypot(px - q.x, py - q.y);
      if (!best || d < best.d) best = swap ? { d, ax: q.x, ay: q.y, bx: px, by: py } : { d, ax: px, ay: py, bx: q.x, by: q.y };
    };
    tryPt(s.x1, s.y1, t, false); tryPt(s.x2, s.y2, t, false);
    tryPt(t.x1, t.y1, s, true); tryPt(t.x2, t.y2, s, true);
    return best;
  }

  _weaponClash(a, b) {
    if (!a.weapon || !b.weapon || a.disarmed || b.disarmed) return;
    if (a === this.eraser || b === this.eraser) return; // คนที่อยู่นอกความจริง อาวุธทะลุผ่านหมด
    if (a.clashCd > 0 || b.clashCd > 0 || a.hp <= 0 || b.hp <= 0) return;
    let hit = null;
    for (const sa of this._weaponShapes(a)) {
      for (const sb of this._weaponShapes(b)) {
        const c = this._segClosest(sa, sb);
        if (c.d <= sa.r + sb.r && (!hit || c.d < hit.d)) hit = c;
      }
    }
    if (!hit) return;
    for (const f of [a, b]) {
      f.weaponDir *= -1; // หมุนกลับทิศ แล้วดีดออกจากจุดชนเล็กน้อยกันติดกัน
      f.weaponAng += f.weaponDir * 0.35;
      f.weaponCd = Math.max(f.weaponCd, 0.15); // โดนปัดไว้ ยังฟันโดนตัวไม่ได้ครู่หนึ่ง
      f.clashCd = 0.45;
      if (f.cast && f.cast.hr) f.cast.hr.struck = true; // กำลังพุ่งโจมตีอยู่ -> ถูกปัด ต้องถอย
    }
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    this._knock(a, -dx, -dy, 130);
    this._knock(b, dx, dy, 130);
    this.events.push({ type: "clash", x: (hit.ax + hit.bx) / 2, y: (hit.ay + hit.by) / 2 });
  }

  // สติแตกหนักจนทิ้งอาวุธ / หยิบกลับมา
  _updateDisarm(f) {
    if (!f.weapon) return;
    if (!f.disarmed && f.mind >= MIND_DROP) {
      f.disarmed = true;
      this.events.push({ type: "dropWeapon", x: f.x, y: f.y, ang: f.weaponAng });
    } else if (f.disarmed && f.mind <= MIND_PICKUP) {
      f.disarmed = false;
      this.events.push({ type: "pickWeapon", x: f.x, y: f.y });
    }
  }

  // ตัดเวลาแบบ "ลอบแทงด้านหลัง": วนรอบศัตรูไปอยู่ด้านหลัง (ฝั่งตรงข้ามกับที่ศัตรูหันหน้า) แล้วพุ่งเข้าแทง
  // แทงสำเร็จจากด้านหลัง = ดาเมจ x damageMult และใบ้สกิลศัตรู silence วินาที (ดูที่ _updateWeapon)
  _backstabRun(f, enemy, sk, c, dt) {
    const bs = sk.backstab;
    if (!c.hr) c.hr = { phase: "retreat", t: 0, struck: false }; // เริ่มด้วยการถอยหลังออกห่างก่อน
    const s = c.hr;
    s.t += dt;
    const ex = f.x - enemy.x;
    const ey = f.y - enemy.y;
    const d = Math.hypot(ex, ey) || 0.0001;
    const ux = ex / d;
    const uy = ey / d;
    const R = bs.orbitRadius || 150;
    const backAng = enemy.facing > 0 ? Math.PI : 0; // ทิศด้านหลังศัตรู (มองจากตัวศัตรู)
    let diff = backAng - Math.atan2(ey, ex);
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    const tol = bs.angleTol || 0.5;
    let dx, dy;
    if (s.phase === "retreat") {
      // ถอยหลังออกจากศัตรูให้ได้ระยะวน (หรือถอยนานเกินไปเพราะติดกำแพง) แล้วค่อยวนไปด้านหลัง
      dx = ux;
      dy = uy;
      f.dashMult = bs.retreatSpeed || 2.0;
      if (d >= R * 0.92 || s.t >= (bs.retreatMax || 0.7)) { s.phase = "circle"; s.t = 0; }
    } else if (s.phase === "circle") {
      const dir = diff >= 0 ? 1 : -1; // วนไปทางที่สั้นที่สุด
      const corr = Math.max(-1, Math.min(1, ((R - d) / R) * 2.5));
      dx = -uy * dir + ux * corr;
      dy = ux * dir + uy * corr;
      f.dashMult = bs.orbitSpeed || 1.8;
      // ถึงด้านหลังแล้ว (หรือวนนานเกินไปเพราะติดกำแพง) -> พุ่งแทง
      if (Math.abs(diff) <= tol || s.t >= (bs.circleMax || 2.6)) { s.phase = "strike"; s.t = 0; s.struck = false; f.weaponCd = 0; }
    } else {
      dx = -ux;
      dy = -uy; // พุ่งเข้าหาศัตรู
      f.dashMult = bs.strikeSpeed || 2.4;
      // แทงแล้ว/โดนปัด/พุ่งนานเกิน หรือศัตรูหมุนตัวจนหลุดจากด้านหลัง -> ถอยออกแล้ววนไปแทงใหม่
      if (s.struck || s.t >= (bs.strikeMax || 0.5) || Math.abs(diff) > tol * 2.5) { s.phase = "retreat"; s.t = 0; }
    }
    const len = Math.hypot(dx, dy) || 1;
    const sp = Math.hypot(f.vx, f.vy) || f.def.speed;
    f.vx = (dx / len) * sp;
    f.vy = (dy / len) * sp;
    f.dashTimer = 1; // ให้ _move ใช้ dashMult ที่ตั้งไว้ (ตั้งใหม่ทุกก้าว)
  }

  // เร่งเวลาแบบ "วิ่งวน-โจมตี-หลบ": วนรอบศัตรูที่ระยะ orbitRadius แล้วพุ่งเข้าฟัน จากนั้นถอยออก แล้วเริ่มวนใหม่
  // ใช้เวลาจริงนับ phase (dt คือนาฬิกาของสกิล) ส่วนความเร็วเดินจริงถูกคูณ rate อยู่แล้วในลูปหลัก
  _hitAndRun(f, enemy, sk, c, dt) {
    const hr = sk.hitAndRun;
    if (!c.hr) c.hr = { phase: "orbit", t: 0, dir: this.rng() < 0.5 ? 1 : -1, struck: false, flip: 0 };
    const s = c.hr;
    s.t += dt;
    s.flip = Math.max(0, s.flip - dt);
    const ex = f.x - enemy.x;
    const ey = f.y - enemy.y;
    const d = Math.hypot(ex, ey) || 0.0001;
    const ux = ex / d; // ทิศจากศัตรูมาหาเรา
    const uy = ey / d;
    const R = hr.orbitRadius || 170;
    let dx, dy;

    // ชนขอบสนาม: กลับทิศวน กันติดกำแพง
    const atWall = f.x <= f.r + 2 || f.x >= this.w - f.r - 2 || f.y <= f.r + 2 || f.y >= this.h - f.r - 2;
    if (atWall && s.flip <= 0) { s.dir *= -1; s.flip = 0.5; }

    if (s.phase === "orbit") {
      // เส้นสัมผัสวงกลม + ดึงเข้า/ผลักออกให้อยู่ที่รัศมี R
      const corr = Math.max(-1, Math.min(1, (R - d) / R * 2.5));
      dx = -uy * s.dir + ux * corr;
      dy = ux * s.dir + uy * corr;
      f.dashMult = hr.orbitSpeed || 1.1;
      if (s.t >= (hr.orbitTime || 0.6)) { s.phase = "strike"; s.t = 0; s.struck = false; f.weaponCd = 0; }
    } else if (s.phase === "strike") {
      dx = -ux; dy = -uy; // พุ่งเข้าหาศัตรู
      f.dashMult = hr.strikeSpeed || 1.7;
      if (s.struck || s.t >= (hr.strikeMax || 0.45)) { s.phase = "retreat"; s.t = 0; s.dir *= -1; }
    } else {
      // หลบออก: ถอยหลังพร้อมเฉไปด้านข้างเล็กน้อย
      dx = ux + -uy * s.dir * 0.6;
      dy = uy + ux * s.dir * 0.6;
      f.dashMult = hr.retreatSpeed || 1.8;
      if (s.t >= (hr.retreatTime || 0.35) && d >= R * 0.85) { s.phase = "orbit"; s.t = 0; }
      else if (s.t >= (hr.retreatTime || 0.35) * 2) { s.phase = "orbit"; s.t = 0; }
    }
    const len = Math.hypot(dx, dy) || 1;
    const sp = Math.hypot(f.vx, f.vy) || f.def.speed;
    f.vx = (dx / len) * sp;
    f.vy = (dy / len) * sp;
    f.dashTimer = 1; // ให้ _move ใช้ dashMult ที่ตั้งไว้ (ถูกตั้งใหม่ทุกก้าว)
  }

  // จบการตัดเวลา: เวลากลับมา ศัตรูจำอะไรในช่วงที่ถูกตัดไม่ได้เลย ยืนงงไปครู่หนึ่ง
  // broken = true เมื่อผู้ใช้โจมตีจนเวลากลับมาก่อนครบกำหนด (แบบ King Crimson)
  _endTimeErase(f, enemy, broken) {
    const c = f.cast;
    if (!c || c.sk.type !== "timeerase") return;
    for (const g of c.dazedList || []) {
      if (g.hp <= 0) continue;
      g.stun = Math.max(g.stun, c.sk.afterStun !== undefined ? c.sk.afterStun : 0.6);
      this.events.push({ type: "confused", x: g.x, y: g.y });
    }
    if (broken) this.events.push({ type: "eraseBreak", x: f.x, y: f.y });
    f.cast = null;
    f.frame = "idle";
    f.dashTimer = 0;
    f.gcd = 0.25;
  }

  // ---------- ย้อนเวลา ----------
  _snapshot() {
    return {
      t: this.wt,
      fighters: this.fighters.map((f) => ({
        x: f.x, y: f.y, vx: f.vx, vy: f.vy, knockX: f.knockX, knockY: f.knockY, hp: f.hp, mind: f.mind,
      })),
      projectiles: this.projectiles.map((p) => ({ ...p })),
      waves: this.waves.map((w) => ({ ...w, hits: w.hits.slice() })),
      balls: this.balls.map((b) => ({ ...b })),
    };
  }

  _recordHistory(dt) {
    this._histAcc += dt;
    if (this.history.length && this._histAcc < 0.05) return;
    this._histAcc = 0;
    this.history.push(this._snapshot());
    const keep = 8; // เก็บย้อนหลังเผื่อไว้เกินที่สกิลย้อนได้
    while (this.history.length > 2 && this.history[0].t < this.wt - keep) this.history.shift();
  }

  // เสียเลือดไปอย่างน้อย sk.minGain ในช่วง sk.rewindSeconds วินาทีที่ผ่านมาหรือยัง
  _rewindWorthIt(f, sk) {
    if (!this.history.length) return false;
    const idx = this.fighters.indexOf(f);
    const goal = this.wt - (sk.rewindSeconds || 5);
    let old = this.history[0];
    for (let i = this.history.length - 1; i >= 0; i--) {
      if (this.history[i].t <= goal) { old = this.history[i]; break; }
    }
    return old.fighters[idx].hp - f.hp >= (sk.minGain !== undefined ? sk.minGain : 8);
  }

  _startRewind(f, sk) {
    this.rewind = { owner: f, t: 0, dur: sk.duration, back: sk.rewindSeconds || 5, t0: this.wt };
    for (const g of this.fighters) {
      if (g.team === f.team) continue;
      g.cast = null; // ศัตรูที่กำลังร่ายอยู่ถูกย้อนกลับไปด้วย
      g.frame = "idle";
      g.dashTimer = 0;
    }
    this.events.push({ type: "rewind", x: f.x, y: f.y });
  }

  _updateRewind(dt) {
    const r = this.rewind;
    r.t += dt;
    const prog = Math.min(1, r.t / r.dur);
    const target = Math.max(this.history[0].t, r.t0 - r.back * prog);
    let snap = this.history[0];
    for (let i = this.history.length - 1; i >= 0; i--) {
      if (this.history[i].t <= target) { snap = this.history[i]; break; }
    }
    this.fighters.forEach((f, i) => {
      const s = snap.fighters[i];
      f.x = s.x; f.y = s.y; f.vx = s.vx; f.vy = s.vy; f.knockX = s.knockX; f.knockY = s.knockY;
      f.hitFlash = Math.max(0, f.hitFlash - dt);
      // เลือดของคนใช้สกิลย้อนกลับไปด้วย (เลือดศัตรูไม่ถูกย้อน ดาเมจที่ทำไปแล้วยังอยู่)
      if (f === r.owner) { f.hp = Math.min(f.maxHp, s.hp); f.mind = s.mind; f.mindHold = 0; } // เลือดตัวเองย้อนกลับไปเท่ากับตอนนั้นเป๊ะๆ
    });
    this.projectiles = snap.projectiles.map((p) => ({ ...p }));
    this.waves = snap.waves.map((w) => ({ ...w, hits: w.hits.slice() }));
    this.balls = snap.balls.map((b) => ({ ...b }));

    if (prog >= 1) {
      this.wt = snap.t;
      this.history = this.history.filter((h) => h.t <= snap.t);
      this._histAcc = 0;
      r.owner.cast = null;
      r.owner.frame = "idle";
      r.owner.gcd = 0.25;
      this.rewind = null;
      this.events.push({ type: "rewindEnd", x: r.owner.x, y: r.owner.y });
    }
  }

  // ---------- อาวุธหมุน (ดาบคาตานะ) ----------
  _updateWeapon(f, enemy, dt) {
    const wp = f.weapon;
    const s0 = f.r * (wp.startRatio || 0.5);
    const s1 = f.r + wp.length;
    const px = enemy.x - f.x;
    const py = enemy.y - f.y;

    // เล็งแม่นขึ้น: ศัตรูเข้ามาในระยะดาบ -> ใบดาบหมุนเร็วขึ้นเพื่อกวาดเข้าหา (ยังหมุนทิศเดิมจนกว่าจะฟันโดน)
    const near = Math.hypot(px, py) <= s1 + enemy.r + (wp.aimRange || 40);
    const striking = f.cast && f.cast.hr && f.cast.hr.phase === "strike";
    if (striking) f.weaponAng = Math.atan2(py, px); // กำลังพุ่งโจมตี: ชี้อาวุธไปที่ศัตรูตรงๆ
    else f.weaponAng += f.weaponDir * wp.spinSpeed * (near ? wp.aimBoost || 1.8 : 1) * dt;
    f.weaponCd = Math.max(0, f.weaponCd - dt);

    const ca = Math.cos(f.weaponAng);
    const sa = Math.sin(f.weaponAng);

    // หัวเข็มทิศ (ถ้ามี): วงกลมที่ปลายก้าน นับเป็นส่วนที่ฟัน/ปัดได้ด้วย
    const head = wp.headRadius || 0;
    const hcx = ca * (s1 - head); // จุดกึ่งกลางหัว (ในพิกัดสัมพัทธ์กับตัว)
    const hcy = sa * (s1 - head);
    const reachW = (wp.width || 8) / 2;

    // ปัดกระสุนของศัตรูทิ้ง (ทำได้ตลอด ไม่เกี่ยวกับคูลดาวน์การฟัน)
    for (const p of this.projectiles) {
      if (p.owner === f || p.dead || p.indestructible) continue;
      const qx = p.x - f.x;
      const qy = p.y - f.y;
      const tt = Math.max(s0, Math.min(s1, qx * ca + qy * sa));
      const hitRod = Math.hypot(qx - ca * tt, qy - sa * tt) <= p.r + reachW + 3;
      const hitHead = head > 0 && Math.hypot(qx - hcx, qy - hcy) <= p.r + head + 2;
      if (hitRod || hitHead) {
        p.dead = true;
        this.events.push({ type: "deflect", x: p.x, y: p.y, effect: "parry" });
      }
    }
    // ปัดบอลของศัตรู: ไม่แตก แต่สะท้อนกลับไปหาคนเตะ
    for (const b of this.balls) {
      if (!b.hot || b.owner.team === f.team || b.reflectCd > 0) continue;
      const qx = b.x - f.x;
      const qy = b.y - f.y;
      const tt = Math.max(s0, Math.min(s1, qx * ca + qy * sa));
      const hitRod = Math.hypot(qx - ca * tt, qy - sa * tt) <= b.r + reachW + 3;
      const hitHead = head > 0 && Math.hypot(qx - hcx, qy - hcy) <= b.r + head + 2;
      if (hitRod || hitHead) {
        const back = this._leadPoint(b, b.owner, Math.max(520, Math.hypot(b.vx, b.vy)));
        this._reflectBall(b, f, back.x, back.y, 520);
        f.weaponDir *= -1;
      }
    }
    if (f.weaponCd > 0) return;
    for (const foe of this._foes(f)) {
      if (foe === this.eraser) continue; // ฟันคนที่อยู่นอกความจริงไม่โดน
      if (this._weaponHit(f, foe, wp, s0, s1, ca, sa, head, hcx, hcy, reachW)) return; // ฟันโดนได้ทีละคนต่อครั้ง
    }
  }

  _weaponHit(f, enemy, wp, s0, s1, ca, sa, head, hcx, hcy, reachW) {
    const px = enemy.x - f.x;
    const py = enemy.y - f.y;
    const t = Math.max(s0, Math.min(s1, px * ca + py * sa)); // จุดบนใบดาบที่ใกล้ศัตรูที่สุด
    const dx = px - ca * t;
    const dy = py - sa * t;
    let hx = f.x + ca * t;
    let hy = f.y + sa * t;
    const rodHit = Math.hypot(dx, dy) <= enemy.r + reachW;
    const headHit = head > 0 && Math.hypot(px - hcx, py - hcy) <= enemy.r + head;
    if (!rodHit && !headHit) return false;
    if (!rodHit && headHit) { hx = f.x + hcx; hy = f.y + hcy; } // โดนที่หัวเข็มทิศ

    // ลอบแทงด้านหลังระหว่างตัดเวลา: ดาเมจคูณ damageMult และใบ้สกิลศัตรู
    const ce = f.cast && f.cast.sk.type === "timeerase" && f.cast.sk.backstab ? f.cast : null;
    const behind = ce && (f.x - enemy.x) * enemy.facing < -enemy.r * 0.3;
    let dmg = this._out(f, wp.damage);
    if (behind) {
      dmg = Math.round(dmg * (ce.sk.backstab.damageMult || 2));
      enemy.silence = Math.max(enemy.silence, ce.sk.backstab.silence || 2.5);
      if (enemy.cast) { enemy.cast = null; enemy.frame = "idle"; enemy.dashTimer = 0; } // ถูกใบ้กลางร่าย = สกิลถูกตัดทิ้ง
      this.events.push({ type: "backstab", x: hx, y: hy });
    }
    this._damage(enemy, dmg, hx, hy);
    this._knock(enemy, px, py, wp.knockback || 0);
    f.weaponDir *= -1; // ฟันโดนแล้วหมุนกลับอีกทิศ
    f.weaponCd = wp.hitCooldown || 0.4;
    if (f.cast && f.cast.hr) f.cast.hr.struck = true; // จบจังหวะพุ่งโจมตี -> ถอยออก
    this.events.push({ type: "slash", x: hx, y: hy, ang: f.weaponAng });
    // ตัดเวลาอยู่แล้วโจมตี = เวลากลับมาทันที (แบบ King Crimson) ดาเมจนี้ยังโดนเต็ม
    if (f.cast && f.cast.sk.type === "timeerase") this._endTimeErase(f, enemy, true);
    return true;
  }

  // ผลักตัวละครตามทิศ (dx,dy) ตัวที่ถูกแช่แข็งไม่ถูกผลัก (ไม่งั้นแรงจะสะสมแล้วกระเด็นตอนเวลากลับมา)
  _knock(t, dx, dy, power) {
    if (!power) return;
    const len = Math.hypot(dx, dy) || 1;
    t.knockX += (dx / len) * power;
    t.knockY += (dy / len) * power;
  }

  // หมุนทิศความเร็วของ f เข้าหาศัตรู ไม่เกิน maxTurn เรเดียน
  _steer(f, enemy, maxTurn) {
    const want = Math.atan2(enemy.y - f.y, enemy.x - f.x);
    const cur = Math.atan2(f.vy, f.vx);
    let diff = want - cur;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    this._rotate(f, Math.max(-maxTurn, Math.min(maxTurn, diff)));
  }

  _fireProjectile(f, enemy, sk) {
    const spread = (sk.spread || 0) + 0.9 * (f.mind / 100); // สติเสีย -> เล็งเพี้ยน
    let tx = enemy.x;
    let ty = enemy.y;
    if (sk.lead && f.def.speed) {
      // เล็งนำหน้า: หาจุดที่ลูกบอลไปเจอศัตรูที่กำลังเคลื่อนที่ (วนคำนวณ 3 รอบพอ)
      const evx = (enemy.vx || 0) + (enemy.knockX || 0);
      const evy = (enemy.vy || 0) + (enemy.knockY || 0);
      for (let i = 0; i < 3; i++) {
        const tt = Math.hypot(tx - f.x, ty - f.y) / sk.projectileSpeed;
        tx = enemy.x + evx * tt;
        ty = enemy.y + evy * tt;
      }
      // ทำนายแล้วทะลุกำแพง -> เล็งไปที่ขอบสนามแทน
      tx = Math.max(10, Math.min(this.w - 10, tx));
      ty = Math.max(10, Math.min(this.h - 10, ty));
    }
    const base = Math.atan2(ty - f.y, tx - f.x);
    const ang = base + (this.rng() - 0.5) * spread;
    const dx = Math.cos(ang);
    const dy = Math.sin(ang);
    const muzzle = f.r + 6;
    const x = f.x + dx * muzzle;
    const y = f.y + dy * muzzle;
    this.projectiles.push({
      x,
      y,
      bx: x, // ตำแหน่งฐาน (ไม่รวมการส่ายซ้ายขวา)
      by: y,
      dx,
      dy,
      speed: sk.projectileSpeed,
      r: sk.projectileRadius,
      damage: this._out(f, sk.damage * this._dmgMult(f, enemy)),
      stunOnHit: sk.stun || 0, // โดนแล้วสตันศัตรูกี่วินาที (Blossom)
      flowers: sk.flowers || 0, // โดนแล้วดอกไม้ปรากฏรอบเป้าหมายกี่ดอก (Blossom)
      energyRefill: !!sk.energyRefill,
      flowerDist: sk.flowerDist || 64, // ดอกไม้อยู่ห่างจากจุดกึ่งกลางเป้าหมายกี่ px (ใกล้ตัวมาก ให้แทงทะลุไปเก็บได้)
      text: sk.texts ? sk.texts[Math.floor(this.rng() * sk.texts.length)] : null, // ข้อความบนกระสุนคำพูด
      mindDamage: sk.mindDamage || 0, // บั่นทอนสติ/ความมั่นใจเท่าไรเมื่อโดน
      indestructible: !!sk.indestructible, // ปัดทิ้ง/ชนแล้วไม่แตก
      owner: f,
      color: f.def.color,
      shape: sk.shape || "ball", // "ball" หรือ "note"
      noteKind: Math.floor(this.rng() * 3), // ให้ตัววาดเลือกหน้าตาโน้ตต่างๆ
      wobble: sk.wobble || 0, // ความกว้างการส่าย (px)
      wobbleFreq: sk.wobbleFreq || 10,
      knockback: sk.knockback || 0, // แรงผลักศัตรูตอนโดน (เช่นโน้ตของ Luka)
      bounces: sk.bounces || 0, // สะท้อนกำแพงได้อีกกี่ครั้ง (ลูกเตะของ Isagi)
      phase: this.rng() * Math.PI * 2,
      t: 0,
      spin: (this.rng() - 0.5) * 0.6,
    });
    this.events.push({ type: "muzzle", x, y, sound: sk.sound || "shoot" });
  }

  _fireWave(f, enemy, sk) {
    const ang = Math.atan2(enemy.y - f.y, enemy.x - f.x);
    this.waves.push({
      x: f.x,
      y: f.y,
      ang,
      r: f.r * 0.6,
      r0: f.r * 0.6, // รัศมีเริ่มต้น ใช้คำนวณว่าคลื่นเดินทางมาไกลแค่ไหน
      speed: sk.waveSpeed,
      maxR: sk.waveRange,
      halfArc: ((sk.waveArcDeg || 80) * Math.PI) / 360, // ครึ่งหนึ่งของมุมกว้างของคลื่น
      damage: sk.damage, // ดาเมจเมื่อโดนที่ระยะใกล้
      damageFar: sk.damageFar !== undefined ? sk.damageFar : sk.damage, // ดาเมจเมื่อโดนที่ปลายระยะ
      stunNear: sk.stunNear || 0, // ติดสตั้นกี่วินาที ถ้าโดนในระยะใกล้
      stunRange: sk.stunRange !== undefined ? sk.stunRange : 0.35, // "ใกล้" = คลื่นเดินทางไม่เกินสัดส่วนนี้ของระยะทั้งหมด
      projectileEffect: sk.projectileEffect || "none", // "push" ผลักกระสุนศัตรู | "stop" ทำลายกระสุนศัตรู
      knockback: sk.knockback || 0,
      owner: f,
      color: f.def.color,
      hits: [], // คนที่โดนคลื่นนี้ไปแล้ว (คลื่นลูกเดียวโดนคนเดียวกันได้ครั้งเดียว)
    });
    this.events.push({ type: "wave", x: f.x, y: f.y, sound: sk.sound || "wave" });
  }

  // ---------- การเคลื่อนที่ ----------
  _move(f, dt) {
    const dashing = f.dashTimer > 0;
    if (dashing) f.dashTimer -= dt;
    const target = f.def.speed * (dashing ? f.dashMult : 1) * (f.stun > 0 ? 0.25 : 1) * (f.slowT > 0 ? f.slowMult : 1) * (f.boostT > 0 ? 1.5 : 1);
    const cur = Math.hypot(f.vx, f.vy) || 1;
    f.vx = (f.vx / cur) * target;
    f.vy = (f.vy / cur) * target;

    f.x += (f.vx + f.knockX) * dt;
    f.y += (f.vy + f.knockY) * dt;
    const decay = Math.exp(-5 * dt);
    f.knockX *= decay;
    f.knockY *= decay;

    if (f.x < f.r) { f.x = f.r; f.vx = Math.abs(f.vx); this._wallBounce(f); }
    if (f.x > this.w - f.r) { f.x = this.w - f.r; f.vx = -Math.abs(f.vx); this._wallBounce(f); }
    if (f.y < f.r) { f.y = f.r; f.vy = Math.abs(f.vy); this._wallBounce(f); }
    if (f.y > this.h - f.r) { f.y = this.h - f.r; f.vy = -Math.abs(f.vy); this._wallBounce(f); }
  }

  _wallBounce(f) {
    // สุ่มมุมนิดหน่อย กันบอลวนซ้ำเส้นทางเดิมไม่จบ
    this._rotate(f, (this.rng() - 0.5) * 0.25);
    // กันเด้งแนวนอน/แนวตั้งล้วนจนเกมค้าง
    const minComp = f.def.speed * 0.2;
    if (Math.abs(f.vx) < minComp) f.vx = minComp * (f.vx < 0 ? -1 : 1);
    if (Math.abs(f.vy) < minComp) f.vy = minComp * (f.vy < 0 ? -1 : 1);
  }

  _rotate(f, ang) {
    const c = Math.cos(ang);
    const s = Math.sin(ang);
    const nx = f.vx * c - f.vy * s;
    const ny = f.vx * s + f.vy * c;
    f.vx = nx;
    f.vy = ny;
  }

  // ตัวละครชนกัน: เด้งออกจากกันเฉยๆ ไม่มีดาเมจ ยกเว้นสกิลพุ่งชนที่ทำดาเมจเมื่อชนศัตรู
  _fighterCollision(a, b) {
    if ((a.cast && a.cast.sk.passThrough) || (b.cast && b.cast.sk.passThrough)) return; // Triple Threat: แทงพุ่งทะลุตัวศัตรูไป ไม่ชนกัน
    if (a === this.eraser || b === this.eraser) return; // คนที่ตัดเวลาอยู่นอกความจริง ตัวละครเดินทะลุกันได้
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const dist = Math.hypot(dx, dy) || 0.0001;
    const minDist = a.r + b.r;
    if (dist >= minDist) return;

    const nx = dx / dist;
    const ny = dy / dist;
    const overlap = minDist - dist;

    a.x -= (nx * overlap) / 2;
    a.y -= (ny * overlap) / 2;
    b.x += (nx * overlap) / 2;
    b.y += (ny * overlap) / 2;

    // เด้งออกจากกันตามแนวปะทะ (มวลเท่ากัน = สลับส่วนประกอบตามแนวนั้น)
    const va = a.vx * nx + a.vy * ny;
    const vb = b.vx * nx + b.vy * ny;
    a.vx += (vb - va) * nx;
    a.vy += (vb - va) * ny;
    b.vx += (va - vb) * nx;
    b.vy += (va - vb) * ny;
    this._rotate(a, (this.rng() - 0.5) * 0.3);
    this._rotate(b, (this.rng() - 0.5) * 0.3);

    if (a.team === b.team) return; // เพื่อนร่วมทีมชนกันแค่เด้ง ไม่มีดาเมจ
    this._dashHit(a, b, nx, ny);
    this._dashHit(b, a, -nx, -ny);
    this._ramHit(a, b, nx, ny);
    this._ramHit(b, a, -nx, -ny);
  }

  // ทิ้งอาวุธแล้ว: ใช้การชนตัวโจมตีแทน (ดาเมจ = ramDamage ของอาวุธ ไม่ใส่ = เท่าดาเมจอาวุธ)
  _ramHit(att, tgt, nx, ny) {
    if (!att.disarmed || att.ramCd > 0 || tgt.hp <= 0) return;
    const wp = att.weapon;
    att.ramCd = 0.6;
    this._damage(tgt, this._out(att, wp.ramDamage !== undefined ? wp.ramDamage : wp.damage), att.x + nx * att.r, att.y + ny * att.r);
    this._knock(tgt, nx, ny, wp.ramKnockback !== undefined ? wp.ramKnockback : wp.knockback || 0);
    if (att.cast && att.cast.hr) att.cast.hr.struck = true;
    this.events.push({ type: "ram", x: att.x + nx * att.r, y: att.y + ny * att.r });
  }

  // สกิลพุ่ง: ชนศัตรูครั้งแรกในการพุ่งแต่ละครั้งเท่านั้นที่เป็นดาเมจ
  _dashHit(attacker, target, nx, ny) {
    const c = attacker.cast;
    if (!c || c.sk.type !== "dash" || c.hit) return;
    c.hit = true;
    this._damage(target, this._out(attacker, c.sk.damage * this._dmgMult(attacker, target)), attacker.x + nx * attacker.r, attacker.y + ny * attacker.r);
    const kb = c.sk.knockback || 0;
    this._knock(target, nx, ny, kb);
    attacker.combatT = 0;
    if (c.sk.slowDuration) { // Lunge: ชะลอศัตรู
      target.slowT = Math.max(target.slowT, c.sk.slowDuration);
      target.slowMult = c.sk.slowMult !== undefined ? c.sk.slowMult : 0.3;
    }
    if (c.sk.heal) { // Lunge โดนฮีโร่ = ฟื้นเลือด
      attacker.hp = Math.min(attacker.maxHp, attacker.hp + c.sk.heal);
      this.events.push({ type: "heal", x: attacker.x, y: attacker.y, amount: c.sk.heal });
    }
  }

  // ---------- กระสุน / โน้ต ----------
  _updateProjectiles(dt) {
    for (const p of this.projectiles) {
      const ps = this._timeScale(p.x, p.y, p.owner); // อยู่ในวงชะลอเวลาของ Johan -> ช้าลง
      p.t += dt * ps;
      p.bx += p.dx * p.speed * dt * ps;
      p.by += p.dy * p.speed * dt * ps;
      // ส่ายตั้งฉากกับทิศที่เคลื่อนที่ (โน้ตลอยเป็นลอน)
      const off = p.wobble ? Math.sin(p.t * p.wobbleFreq + p.phase) * p.wobble : 0;
      p.x = p.bx - p.dy * off;
      p.y = p.by + p.dx * off;

      if (p.bounces > 0) {
        // สะท้อนกำแพง (ฐานตำแหน่ง bx,by) แล้วบอลยังอันตรายอยู่
        let bounced = false;
        if (p.bx < p.r) { p.bx = p.r; p.dx = Math.abs(p.dx); bounced = true; }
        else if (p.bx > this.w - p.r) { p.bx = this.w - p.r; p.dx = -Math.abs(p.dx); bounced = true; }
        if (p.by < p.r) { p.by = p.r; p.dy = Math.abs(p.dy); bounced = true; }
        else if (p.by > this.h - p.r) { p.by = this.h - p.r; p.dy = -Math.abs(p.dy); bounced = true; }
        if (bounced) {
          p.bounces--;
          p.x = p.bx;
          p.y = p.by;
          this.events.push({ type: "bounce", x: p.x, y: p.y });
        }
      }
      let hit = false;
      for (const target of this._foes(p.owner)) {
        // หลบไปแล้ว (Meta Vision) / อยู่นอกความจริง (ตัดเวลา): กระสุนบินทะลุผ่านไป
        if (this._evaded(p, target) || target === this.eraser) continue;
        if (Math.hypot(target.x - p.x, target.y - p.y) < target.r + p.r) {
          this._damage(target, p.damage, p.x, p.y);
          if (p.mindDamage) this._hurtMind(target, p.mindDamage, p.x, p.y);
          // ถีบเบาๆ ตามทิศกระสุน
          target.x += p.dx * 6;
          target.y += p.dy * 6;
          this._knock(target, p.dx, p.dy, p.knockback);
          if (p.stunOnHit) {
            target.stun = Math.max(target.stun, p.stunOnHit);
            this.events.push({ type: "dartStun", x: target.x, y: target.y });
          }
          if (p.flowers) this._spawnFlowers(p.owner, target, p.flowers, p.flowerDist);
          if (p.energyRefill) p.owner.energy = p.owner.def.energyMax || p.owner.energy; // ปาโดนแล้วพร้อมแทงต่อทันที
          p.owner.combatT = 0;
          p.dead = true;
          hit = true;
          break;
        }
      }
      if (!hit && (p.x < -30 || p.x > this.w + 30 || p.y < -30 || p.y > this.h + 30)) p.dead = true;
    }
    // กระสุนของคนละฝ่ายชนกัน -> แตกทั้งคู่
    const ps = this.projectiles;
    for (let i = 0; i < ps.length; i++) {
      const p = ps[i];
      if (p.dead) continue;
      for (let j = i + 1; j < ps.length; j++) {
        const q = ps[j];
        if (q.dead || q.owner.team === p.owner.team) continue;
        if (p.indestructible && q.indestructible) continue; // ทะลุผ่านกันไป
        if (Math.hypot(p.x - q.x, p.y - q.y) < p.r + q.r) {
          // ฝั่งที่ทำลายไม่ได้ (โน้ต) รอด อีกฝั่งแตกอย่างเดียว
          if (!p.indestructible) p.dead = true;
          if (!q.indestructible) q.dead = true;
          this.events.push({ type: "deflect", x: (p.x + q.x) / 2, y: (p.y + q.y) / 2, effect: "clash" });
          break;
        }
      }
    }
    this.projectiles = this.projectiles.filter((p) => !p.dead);
  }

  // ---------- คลื่นเสียง ----------
  _updateWaves(dt) {
    for (const w of this.waves) {
      // ดูที่แนวหน้าคลื่น: ถ้าคลื่นของศัตรูเข้าไปในวงชะลอเวลา คลื่นจะแผ่ช้าลง
      const ws = this._timeScale(w.x + Math.cos(w.ang) * w.r, w.y + Math.sin(w.ang) * w.r, w.owner);
      w.r += w.speed * dt * ws;
      for (const t of this._foes(w.owner)) {
        if (w.hits.includes(t) || t === this.eraser || this._evaded(w, t)) continue; // โดนไปแล้ว / ตัดเวลาอยู่ / หลบไปแล้ว: คลื่นทะลุผ่านตัวไป
        {
          const dx = t.x - w.x;
          const dy = t.y - w.y;
          const dist = Math.hypot(dx, dy) || 0.0001;
          // ศัตรูอยู่ในมุมของคลื่นหรือไม่ (เผื่อขนาดตัวศัตรูด้วย)
          let da = Math.atan2(dy, dx) - w.ang;
          while (da > Math.PI) da -= Math.PI * 2;
          while (da < -Math.PI) da += Math.PI * 2;
          const slack = Math.asin(Math.min(1, t.r / dist));
          if (Math.abs(da) <= w.halfArc + slack && dist - t.r <= w.r) {
            w.hits.push(t);
            // ยิ่งคลื่นเดินทางไกล ดาเมจยิ่งลดลงเป็นเส้นตรง จากค่า damage ไปจนถึง damageFar
            const travel = Math.max(0, Math.min(1, (w.r - w.r0) / (w.maxR - w.r0)));
            const dmg = Math.max(1, Math.round(w.damage + (w.damageFar - w.damage) * travel));
            this._damage(t, this._out(w.owner, dmg), t.x - (dx / dist) * t.r, t.y - (dy / dist) * t.r);
            this._knock(t, dx, dy, w.knockback);
            // โดนคลื่นในระยะใกล้ตัวผู้ปล่อย = ติดสตั้น (ขยับช้า ใช้สกิลไม่ได้)
            if (w.stunNear && travel <= w.stunRange) {
              t.stun = Math.max(t.stun, w.stunNear);
              this.events.push({ type: "waveStun", x: t.x, y: t.y });
            }
          }
        }
      }
    }
    this._waveVsProjectiles(dt);
    this.waves = this.waves.filter((w) => w.r < w.maxR);
  }

  // คลื่นเสียงปะทะกระสุนของ "ศัตรู" ที่เข้ามาในส่วนโค้ง: ผลักออกไป หรือทำลายทิ้ง (ตาม projectileEffect)
  _waveVsProjectiles(dt) {
    let changed = false;
    for (const w of this.waves) {
      if (w.projectileEffect === "none") continue;
      const band = w.speed * dt + 16; // ความหนาของแนวคลื่นที่ปะทะกระสุนได้
      for (const p of this.projectiles) {
      if (p.owner.team === w.owner.team || p.dead || p.hitByWave) continue;
        const dx = p.x - w.x;
        const dy = p.y - w.y;
        const d = Math.hypot(dx, dy) || 0.0001;
        if (Math.abs(d - w.r) > band + p.r) continue;
        let da = Math.atan2(dy, dx) - w.ang;
        while (da > Math.PI) da -= Math.PI * 2;
        while (da < -Math.PI) da += Math.PI * 2;
        if (Math.abs(da) > w.halfArc + 0.1) continue;

        p.hitByWave = true; // กระสุนลูกหนึ่งโดนคลื่นลูกเดียวกันได้ครั้งเดียว
        if (w.projectileEffect === "stop" && !p.indestructible) {
          p.dead = true;
          changed = true;
        } else {
          // ผลัก: เปลี่ยนทิศให้พุ่งออกจากตัวผู้ปล่อยคลื่น และช้าลง
          p.bx = p.x;
          p.by = p.y;
          p.wobble = 0;
          p.dx = dx / d;
          p.dy = dy / d;
          p.speed = Math.max(160, p.speed * 0.7);
        }
        this.events.push({ type: "deflect", x: p.x, y: p.y, effect: w.projectileEffect });
      }
    }
    // คลื่นเสียงโดนบอลที่ศัตรูเตะ: สะท้อนออกไปทางด้านหน้าคลื่น (ไปหาคนเตะ)
    for (const w of this.waves) {
      if (w.projectileEffect === "none") continue;
      for (const b of this.balls) {
        if (!b.hot || b.owner.team === w.owner.team || b.reflectCd > 0) continue;
        const dx = b.x - w.x;
        const dy = b.y - w.y;
        const d = Math.hypot(dx, dy) || 0.0001;
        if (Math.abs(d - w.r) > w.speed * dt + 16 + b.r) continue;
        let da = Math.atan2(dy, dx) - w.ang;
        while (da > Math.PI) da -= Math.PI * 2;
        while (da < -Math.PI) da += Math.PI * 2;
        if (Math.abs(da) > w.halfArc + 0.1) continue;
        this._reflectBall(b, w.owner, b.x + (dx / d) * 100, b.y + (dy / d) * 100, 520);
      }
    }
    if (changed) this.projectiles = this.projectiles.filter((p) => !p.dead);
  }

  // ดาเมจที่ผู้โจมตีทำได้จริง: ความมั่นใจลด (mind สูง) ดาเมจลดสูงสุด 35%
  _out(f, dmg) {
    return Math.max(1, Math.round(dmg * (1 - 0.35 * (f.mind / 100))));
  }

  _hurtMind(f, amount, x, y) {
    f.mind = Math.min(100, f.mind + amount);
    f.mindHold = MIND_HOLD;
    this.events.push({ type: "mind", x, y, amount });
    if (f.mind >= 100 && f.stun <= 0) {
      f.stun = 1.2; // สติแตก
      f.mind = 45;
      this.events.push({ type: "breakdown", x: f.x, y: f.y });
    }
  }

  _damage(f, amount, x, y) {
    f.hp = Math.max(0, f.hp - amount);
    f.hitFlash = 0.15;
    f.combatT = 0;
    this.events.push({ type: "hit", x, y, amount });
    if (f.hp <= 0 && !f.dead) {
      // ตายกลางแมตช์ (โหมดหลายคน): หยุดสกิล แล้วให้ตัววาดทำให้แตกกระจาย
      f.dead = true;
      // คู่ดวลของ Florentino ตาย = ได้พลังโจมตีถาวรเพิ่ม (สูงสุด 10 ครั้ง)
      for (const g of this.fighters) {
        if (g.duel && g.duel.target === f) {
          g.adStacks = Math.min(10, g.adStacks + 1);
          g.duel = null;
          this.events.push({ type: "adStack", x: g.x, y: g.y, stacks: g.adStacks });
        }
      }
      f.cast = null;
      f.frame = "idle";
      f.dashTimer = 0;
      this.events.push({ type: "death", fighter: f, x: f.x, y: f.y });
    }
  }

  _checkWinner() {
    // ผู้ชนะ = เลขทีมที่เหลือรอดทีมเดียว (1v1 / ffa เลขทีม = ลำดับผู้เล่น) ตายหมดพร้อมกัน = เสมอ
    const alive = this.fighters.filter((f) => f.hp > 0);
    const teamsAlive = [...new Set(alive.map((f) => f.team))];
    if (!alive.length) this.winner = "draw";
    else if (teamsAlive.length === 1) this.winner = teamsAlive[0];
    if (this.winner !== null) {
      this.events.push({ type: "ko" });
      this.projectiles = []; // กระสุนและคลื่นที่ค้างอยู่หายไปพร้อมจบแมตช์
      this.balls = [];
      this.flowers = [];
      this.waves = [];
      this.rewind = null;
      this.eraser = null;
      this.dazedList = [];
      this.slower = null;
      this.phantom = null;
      for (const f of this.fighters) {
        f.cast = null;
        f.frame = "idle";
        f.dashTimer = 0;
      }
    }
  }
}

// เลขเวอร์ชันของไฟล์นี้ (main.js ใช้ตรวจว่าโหลดไฟล์ครบและตรงกันหรือไม่)
if (typeof window !== "undefined") (window.BB_FILES = window.BB_FILES || {}).battle = 24;

if (typeof module !== "undefined") module.exports = { Battle, skillsOf };
