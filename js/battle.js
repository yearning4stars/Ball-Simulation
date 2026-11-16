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

class Battle {
  constructor(width, height, defA, defB, rng = Math.random) {
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
    this.dazed = null; // ตัวที่ตกอยู่ในเวลาที่ถูกตัด: เหม่อลอย ทำตามโชคชะตาที่บันทึกไว้ (ไม่รู้ว่า FuNx อยู่ตรงไหนจริงๆ)
    this.slower = null; // ตัวที่กำลังใช้ "ชะลอเวลา" (Johan) วงชะลอเวลาอยู่รอบตัวนี้
    this.phantom = null; // ตำแหน่งที่ FuNx เคยยืนก่อนตัดเวลา: สิ่งเดียวที่ตัวเหม่อลอย "จำได้" และใช้เล็ง

    this.fighters = [
      this._makeFighter(defA, width * 0.25, height * 0.5, 0),
      this._makeFighter(defB, width * 0.75, height * 0.5, Math.PI),
    ];
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
      gcd: 0, // พักสั้นๆ หลังใช้สกิลจบ ก่อนใช้สกิลถัดไป
      frame: "idle",
      cast: null, // {i, sk, t, shots, fired, hit}
      dashTimer: 0,
      dashMult: 1,
      hitFlash: 0,
      mind: 0, // ระดับสติ/ความมั่นใจที่ถูกบั่นทอน 0-100 (โดนคำพูดของ Luka)
      stun: 0, // เวลาที่เหลือของอาการสติแตก
      // อาวุธที่หมุนรอบตัวตลอดเวลา (เช่นดาบคาตานะ): หมุนไปเรื่อยๆ จนฟันโดนแล้วกลับทิศ
      weapon: def.weapon || null,
      weaponAng: this.rng() * Math.PI * 2,
      weaponDir: 1,
      weaponCd: 0,
    };
  }

  update(dt) {
    this.events.length = 0;
    if (this.winner !== null) {
      // จบแมตช์แล้ว: คนชนะยังเด้งไปมาต่อ ส่วนคนแพ้ไม่ถูกคำนวณอีก (ตัววาดจะทำให้แตกกระจาย)
      for (const f of this.fighters) {
        if (f.hp <= 0) continue;
        f.hitFlash = Math.max(0, f.hitFlash - dt);
        if (f.weapon) f.weaponAng += f.weaponDir * f.weapon.spinSpeed * dt;
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

    const [a, b] = this.fighters;
    // ตัดเวลา (King Crimson): เวลายังเดินต่อ แต่ผู้ใช้ "ไม่อยู่ในความจริง" (โดนอะไรไม่ได้ ทะลุผ่านหมด)
    // ส่วนศัตรูในรัศมีจะเหม่อลอยทำตามโชคชะตาเดิม โดยเล็งไปที่ตำแหน่งเก่าของผู้ใช้เท่านั้น
    this.eraser = this.fighters.find((f) => f.cast && f.cast.sk.type === "timeerase") || null;
    this.dazed = this.eraser && this.eraser.cast.dazed ? (this.eraser === a ? b : a) : null;
    // ชะลอเวลา (Johan): คนอื่นที่อยู่ในวงจะเดินช้าลง / เร่งเวลา: ผู้ใช้เองเดินเร็วขึ้น
    this.slower = this.fighters.find((f) => f.cast && f.cast.sk.type === "timeslow") || null;
    for (const f of this.fighters) {
      let enemy = f === a ? b : a;
      if (f === this.dazed) enemy = this.phantom;
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
      f.mind = Math.max(0, f.mind - 7 * fdt);
      if (m > 0) this._rotate(f, (this.rng() - 0.5) * 8 * m * fdt);
      const slow = 1 - 0.4 * m;
      f.gcd = Math.max(0, f.gcd - fdt * slow);
      for (let i = 0; i < f.cds.length; i++) f.cds[i] -= fdt * slow;
      if (f.stun > 0) {
        f.stun -= fdt; // สติแตก: ใช้สกิลไม่ได้ ขยับได้ช้า
        f.cast = null;
        f.frame = "idle";
        f.dashTimer = 0;
      } else {
        this._updateSkill(f, enemy, cdt);
      }
      this._move(f, fdt);
    }

    if (this.rewind) { this._checkWinner(); return; } // เพิ่งเริ่มย้อนเวลาในก้าวนี้
    this._fighterCollision(a, b);
    for (const f of this.fighters) {
      if (f.weapon) this._updateWeapon(f, f === a ? b : a, f.tdt);
    }
    this._updateProjectiles(dt);
    this._updateWaves(dt);
    // ตัดเวลาอาจจบกลางก้าวนี้ (cast ถูกเคลียร์) ให้สถานะที่ตัววาดอ่านตรงกับความจริงเสมอ
    if (this.eraser && !(this.eraser.cast && this.eraser.cast.sk.type === "timeerase")) {
      this.eraser = null;
      this.dazed = null;
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
    if (!s || !s.cast || owner === s) return 1;
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
      } else if (sk.type === "dash" && sk.homing) {
        this._steer(f, enemy, sk.homing * dt); // เลี้ยวเข้าหาศัตรูเล็กน้อยระหว่างพุ่ง
      } else if (sk.type === "timeerase") {
        this._steer(f, enemy, (sk.homing || 3) * dt); // ระหว่างเวลาถูกตัด วิ่งเข้าหาศัตรูเพื่อฟันสวน
      } else if ((sk.type === "timeaccel" || sk.type === "timeslow") && sk.homing) {
        // เร่ง/ชะลอเวลา: วิ่งเข้าหาศัตรูเพื่อใช้เวลาที่ได้เปรียบให้คุ้ม (เร่งเวลา เลี้ยวไวขึ้นตามเวลาที่เร็วขึ้น)
        this._steer(f, enemy, sk.homing * dt * (sk.type === "timeaccel" ? sk.rate || 2 : 1));
      }

      if (c.t >= sk.duration) {
        if (sk.type === "timeerase" && c.dazed && enemy.hp > 0) {
          // เวลากลับมา: ศัตรูจำอะไรในช่วงที่ถูกตัดไม่ได้เลย ยืนงงไปครู่หนึ่ง
          enemy.stun = Math.max(enemy.stun, sk.afterStun !== undefined ? sk.afterStun : 0.6);
          this.events.push({ type: "confused", x: enemy.x, y: enemy.y });
        }
        f.cast = null;
        f.frame = "idle";
        f.dashTimer = 0;
        f.gcd = 0.25;
      }
      return;
    }

    if (f.gcd > 0) return;

    // เลือกสกิลที่พร้อมใช้ โดยให้สกิลที่รอมานานที่สุดไปก่อน (กันสกิลแรกแย่งใช้ตลอด)
    let pick = -1;
    const timeBusy = this.rewind || this.fighters.some((g) => g.cast && TIME_SKILLS.includes(g.cast.sk.type));
    for (let i = 0; i < f.skills.length; i++) {
      const s2 = f.skills[i];
      if (f.cds[i] > 0) continue;
      if (timeBusy && TIME_SKILLS.includes(s2.type)) continue; // เวลาถูกแตะอยู่แล้ว
      // ย้อนเวลาจะใช้ก็ต่อเมื่อเสียเลือดไปพอสมควรในช่วงที่ย้อนกลับได้ (ไม่งั้นย้อนไปก็เปล่าประโยชน์)
      if (s2.type === "rewind" && !this._rewindWorthIt(f, s2)) continue;
      if (pick === -1 || f.cds[i] < f.cds[pick]) pick = i;
    }
    if (pick === -1) return;

    const sk = f.skills[pick];
    f.cds[pick] = sk.cooldown;
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
      const inRange = Math.hypot(enemy.x - f.x, enemy.y - f.y) <= (sk.radius || 480);
      f.cast.dazed = inRange;
      this.phantom = inRange ? { x: f.x, y: f.y, r: f.r, vx: 0, vy: 0, hp: f.hp } : null;
      this.events.push({ type: "erase", x: f.x, y: f.y, dazed: inRange });
    } else if (sk.type === "rewind") {
      this._startRewind(f, sk);
    } else if (sk.type === "timeaccel") {
      // เร่งเวลาตัวเอง: ความเร็วเดินจริงถูกคูณ rate ในลูปหลัก (ดู fdt) ที่นี่แค่ประกาศเริ่ม
      this.events.push({ type: "accel", x: f.x, y: f.y, rate: sk.rate || 2 });
    } else if (sk.type === "timeslow") {
      this.events.push({ type: "slow", x: f.x, y: f.y, radius: sk.radius || 300 });
    }
  }

  // ---------- ย้อนเวลา ----------
  _snapshot() {
    return {
      t: this.wt,
      fighters: this.fighters.map((f) => ({
        x: f.x, y: f.y, vx: f.vx, vy: f.vy, knockX: f.knockX, knockY: f.knockY, hp: f.hp, mind: f.mind,
      })),
      projectiles: this.projectiles.map((p) => ({ ...p })),
      waves: this.waves.map((w) => ({ ...w })),
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
      if (g === f) continue;
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
      if (f === r.owner) { f.hp = Math.min(f.maxHp, s.hp); f.mind = s.mind; } // เลือดตัวเองย้อนกลับไปเท่ากับตอนนั้นเป๊ะๆ
    });
    this.projectiles = snap.projectiles.map((p) => ({ ...p }));
    this.waves = snap.waves.map((w) => ({ ...w }));

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
    f.weaponAng += f.weaponDir * wp.spinSpeed * (near ? wp.aimBoost || 1.8 : 1) * dt;
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
    if (f.weaponCd > 0 || enemy.hp <= 0 || enemy === this.eraser) return; // ฟันคนที่อยู่นอกความจริงไม่โดน
    const t = Math.max(s0, Math.min(s1, px * ca + py * sa)); // จุดบนใบดาบที่ใกล้ศัตรูที่สุด
    const dx = px - ca * t;
    const dy = py - sa * t;
    let hx = f.x + ca * t;
    let hy = f.y + sa * t;
    const rodHit = Math.hypot(dx, dy) <= enemy.r + reachW;
    const headHit = head > 0 && Math.hypot(px - hcx, py - hcy) <= enemy.r + head;
    if (!rodHit && !headHit) return;
    if (!rodHit && headHit) { hx = f.x + hcx; hy = f.y + hcy; } // โดนที่หัวเข็มทิศ

    this._damage(enemy, this._out(f, wp.damage), hx, hy);
    this._knock(enemy, px, py, wp.knockback || 0);
    f.weaponDir *= -1; // ฟันโดนแล้วหมุนกลับอีกทิศ
    f.weaponCd = wp.hitCooldown || 0.4;
    this.events.push({ type: "slash", x: hx, y: hy, ang: f.weaponAng });
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
    const base = Math.atan2(enemy.y - f.y, enemy.x - f.x);
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
      damage: this._out(f, sk.damage),
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
      projectileEffect: sk.projectileEffect || "none", // "push" ผลักกระสุนศัตรู | "stop" ทำลายกระสุนศัตรู
      knockback: sk.knockback || 0,
      owner: f,
      color: f.def.color,
      hit: false,
    });
    this.events.push({ type: "wave", x: f.x, y: f.y, sound: sk.sound || "wave" });
  }

  // ---------- การเคลื่อนที่ ----------
  _move(f, dt) {
    const dashing = f.dashTimer > 0;
    if (dashing) f.dashTimer -= dt;
    const target = f.def.speed * (dashing ? f.dashMult : 1) * (f.stun > 0 ? 0.25 : 1);
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

    this._dashHit(a, b, nx, ny);
    this._dashHit(b, a, -nx, -ny);
  }

  // สกิลพุ่ง: ชนศัตรูครั้งแรกในการพุ่งแต่ละครั้งเท่านั้นที่เป็นดาเมจ
  _dashHit(attacker, target, nx, ny) {
    const c = attacker.cast;
    if (!c || c.sk.type !== "dash" || c.hit) return;
    c.hit = true;
    this._damage(target, this._out(attacker, c.sk.damage), attacker.x + nx * attacker.r, attacker.y + ny * attacker.r);
    const kb = c.sk.knockback || 0;
    this._knock(target, nx, ny, kb);
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

      const target = this.fighters.find((f) => f !== p.owner);
      if (target === this.eraser) {
        // เป้าหมายอยู่นอกความจริง: กระสุนบินทะลุผ่านความว่างเปล่าไป
        if (p.x < -30 || p.x > this.w + 30 || p.y < -30 || p.y > this.h + 30) p.dead = true;
      } else if (target.hp > 0 && Math.hypot(target.x - p.x, target.y - p.y) < target.r + p.r) {
        this._damage(target, p.damage, p.x, p.y);
        if (p.mindDamage) this._hurtMind(target, p.mindDamage, p.x, p.y);
        // ถีบเบาๆ ตามทิศกระสุน
        target.x += p.dx * 6;
        target.y += p.dy * 6;
        this._knock(target, p.dx, p.dy, p.knockback);
        p.dead = true;
      } else if (p.x < -30 || p.x > this.w + 30 || p.y < -30 || p.y > this.h + 30) {
        p.dead = true;
      }
    }
    // กระสุนของคนละฝ่ายชนกัน -> แตกทั้งคู่
    const ps = this.projectiles;
    for (let i = 0; i < ps.length; i++) {
      const p = ps[i];
      if (p.dead) continue;
      for (let j = i + 1; j < ps.length; j++) {
        const q = ps[j];
        if (q.dead || q.owner === p.owner) continue;
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
      if (!w.hit) {
        const t = this.fighters.find((f) => f !== w.owner);
        if (t.hp > 0 && t !== this.eraser) { // คนที่ตัดเวลาอยู่ คลื่นทะลุผ่านตัวไป
          const dx = t.x - w.x;
          const dy = t.y - w.y;
          const dist = Math.hypot(dx, dy) || 0.0001;
          // ศัตรูอยู่ในมุมของคลื่นหรือไม่ (เผื่อขนาดตัวศัตรูด้วย)
          let da = Math.atan2(dy, dx) - w.ang;
          while (da > Math.PI) da -= Math.PI * 2;
          while (da < -Math.PI) da += Math.PI * 2;
          const slack = Math.asin(Math.min(1, t.r / dist));
          if (Math.abs(da) <= w.halfArc + slack && dist - t.r <= w.r) {
            w.hit = true;
            // ยิ่งคลื่นเดินทางไกล ดาเมจยิ่งลดลงเป็นเส้นตรง จากค่า damage ไปจนถึง damageFar
            const travel = Math.max(0, Math.min(1, (w.r - w.r0) / (w.maxR - w.r0)));
            const dmg = Math.max(1, Math.round(w.damage + (w.damageFar - w.damage) * travel));
            this._damage(t, this._out(w.owner, dmg), t.x - (dx / dist) * t.r, t.y - (dy / dist) * t.r);
            this._knock(t, dx, dy, w.knockback);
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
        if (p.owner === w.owner || p.dead || p.hitByWave) continue;
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
    if (changed) this.projectiles = this.projectiles.filter((p) => !p.dead);
  }

  // ดาเมจที่ผู้โจมตีทำได้จริง: ความมั่นใจลด (mind สูง) ดาเมจลดสูงสุด 35%
  _out(f, dmg) {
    return Math.max(1, Math.round(dmg * (1 - 0.35 * (f.mind / 100))));
  }

  _hurtMind(f, amount, x, y) {
    f.mind = Math.min(100, f.mind + amount);
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
    this.events.push({ type: "hit", x, y, amount });
  }

  _checkWinner() {
    const [a, b] = this.fighters;
    if (a.hp <= 0 && b.hp <= 0) this.winner = "draw";
    else if (a.hp <= 0) this.winner = 1;
    else if (b.hp <= 0) this.winner = 0;
    if (this.winner !== null) {
      this.events.push({ type: "ko" });
      this.projectiles = []; // กระสุนและคลื่นที่ค้างอยู่หายไปพร้อมจบแมตช์
      this.waves = [];
      this.rewind = null;
      this.eraser = null;
      this.dazed = null;
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
if (typeof window !== "undefined") (window.BB_FILES = window.BB_FILES || {}).battle = 13;

if (typeof module !== "undefined") module.exports = { Battle, skillsOf };
