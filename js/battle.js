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
    this.frozen = null; // ตัวที่ถูกตัดเวลา (ขยับ/ใช้สกิลไม่ได้)

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
    // ใครกำลังใช้ตัดเวลาอยู่ ศัตรูของเขาจะถูกแช่แข็งทั้งตัว กระสุน คลื่น และคูลดาวน์
    this.eraser = this.fighters.find((f) => f.cast && f.cast.sk.type === "timeerase") || null;
    this.frozen = this.eraser ? (this.eraser === a ? b : a) : null;
    for (const f of this.fighters) {
      const enemy = f === a ? b : a;
      f.facing = enemy.x >= f.x ? 1 : -1;
      f.hitFlash = Math.max(0, f.hitFlash - dt);
      if (f === this.frozen) continue;
      f.gcd = Math.max(0, f.gcd - dt);
      for (let i = 0; i < f.cds.length; i++) f.cds[i] -= dt;
      this._updateSkill(f, enemy, dt);
      this._move(f, dt);
    }

    if (this.rewind) { this._checkWinner(); return; } // เพิ่งเริ่มย้อนเวลาในก้าวนี้
    this._fighterCollision(a, b);
    for (const f of this.fighters) {
      if (f !== this.frozen && f.weapon) this._updateWeapon(f, f === a ? b : a, dt);
    }
    this._updateProjectiles(dt);
    this._updateWaves(dt);
    this._checkWinner();
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
        this._steer(f, enemy, (sk.homing || 3) * dt); // ระหว่างเวลาถูกตัด วิ่งตามศัตรูที่ขยับไม่ได้
      }

      if (c.t >= sk.duration) {
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
    const timeBusy = this.rewind || this.fighters.some((g) => g.cast && g.cast.sk.type === "timeerase");
    for (let i = 0; i < f.skills.length; i++) {
      const s2 = f.skills[i];
      if (f.cds[i] > 0) continue;
      if (timeBusy && (s2.type === "timeerase" || s2.type === "rewind")) continue; // เวลาถูกแตะอยู่แล้ว
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
      this.events.push({ type: "erase", x: f.x, y: f.y });
    } else if (sk.type === "rewind") {
      this._startRewind(f, sk);
    }
  }

  // ---------- ย้อนเวลา ----------
  _snapshot() {
    return {
      t: this.wt,
      fighters: this.fighters.map((f) => ({
        x: f.x, y: f.y, vx: f.vx, vy: f.vy, knockX: f.knockX, knockY: f.knockY, hp: f.hp,
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
      if (f === r.owner) f.hp = Math.min(f.maxHp, Math.max(f.hp, s.hp));
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
    f.weaponAng += f.weaponDir * wp.spinSpeed * dt;
    f.weaponCd = Math.max(0, f.weaponCd - dt);
    if (f.weaponCd > 0 || enemy.hp <= 0) return;

    const ca = Math.cos(f.weaponAng);
    const sa = Math.sin(f.weaponAng);
    const s0 = f.r * (wp.startRatio || 0.5);
    const s1 = f.r + wp.length;
    const px = enemy.x - f.x;
    const py = enemy.y - f.y;
    const t = Math.max(s0, Math.min(s1, px * ca + py * sa)); // จุดบนใบดาบที่ใกล้ศัตรูที่สุด
    const dx = px - ca * t;
    const dy = py - sa * t;
    if (Math.hypot(dx, dy) > enemy.r * 0.85 + (wp.width || 8) / 2) return;

    const hx = f.x + ca * t;
    const hy = f.y + sa * t;
    this._damage(enemy, wp.damage, hx, hy);
    this._knock(enemy, px, py, wp.knockback || 0);
    f.weaponDir *= -1; // ฟันโดนแล้วหมุนกลับอีกทิศ
    f.weaponCd = wp.hitCooldown || 0.4;
    this.events.push({ type: "slash", x: hx, y: hy, ang: f.weaponAng });
  }

  // ผลักตัวละครตามทิศ (dx,dy) ตัวที่ถูกแช่แข็งไม่ถูกผลัก (ไม่งั้นแรงจะสะสมแล้วกระเด็นตอนเวลากลับมา)
  _knock(t, dx, dy, power) {
    if (!power || t === this.frozen) return;
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
    const spread = sk.spread || 0;
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
      damage: sk.damage,
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
    const target = f.def.speed * (dashing ? f.dashMult : 1);
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
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const dist = Math.hypot(dx, dy) || 0.0001;
    const minDist = a.r + b.r;
    if (dist >= minDist) return;

    const nx = dx / dist;
    const ny = dy / dist;
    const overlap = minDist - dist;

    // ตัวที่ถูกแช่แข็งอยู่นิ่ง ไม่ถูกดัน ฝ่ายที่ยังขยับได้เด้งออกอย่างเดียว
    if (a === this.frozen || b === this.frozen) {
      if (b === this.frozen) {
        a.x -= nx * overlap;
        a.y -= ny * overlap;
        const va = a.vx * nx + a.vy * ny;
        if (va > 0) { a.vx -= 2 * va * nx; a.vy -= 2 * va * ny; }
        this._rotate(a, (this.rng() - 0.5) * 0.3);
      } else {
        b.x += nx * overlap;
        b.y += ny * overlap;
        const vb = b.vx * nx + b.vy * ny;
        if (vb < 0) { b.vx -= 2 * vb * nx; b.vy -= 2 * vb * ny; }
        this._rotate(b, (this.rng() - 0.5) * 0.3);
      }
      return;
    }

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
    this._damage(target, c.sk.damage, attacker.x + nx * attacker.r, attacker.y + ny * attacker.r);
    const kb = c.sk.knockback || 0;
    this._knock(target, nx, ny, kb);
  }

  // ---------- กระสุน / โน้ต ----------
  _updateProjectiles(dt) {
    for (const p of this.projectiles) {
      if (p.owner === this.frozen) continue; // กระสุนของคนที่ถูกตัดเวลาค้างอยู่กลางอากาศ
      p.t += dt;
      p.bx += p.dx * p.speed * dt;
      p.by += p.dy * p.speed * dt;
      // ส่ายตั้งฉากกับทิศที่เคลื่อนที่ (โน้ตลอยเป็นลอน)
      const off = p.wobble ? Math.sin(p.t * p.wobbleFreq + p.phase) * p.wobble : 0;
      p.x = p.bx - p.dy * off;
      p.y = p.by + p.dx * off;

      const target = this.fighters.find((f) => f !== p.owner);
      if (target.hp > 0 && Math.hypot(target.x - p.x, target.y - p.y) < target.r + p.r) {
        this._damage(target, p.damage, p.x, p.y);
        // ถีบเบาๆ ตามทิศกระสุน
        target.x += p.dx * 6;
        target.y += p.dy * 6;
        this._knock(target, p.dx, p.dy, p.knockback);
        p.dead = true;
      } else if (p.x < -30 || p.x > this.w + 30 || p.y < -30 || p.y > this.h + 30) {
        p.dead = true;
      }
    }
    this.projectiles = this.projectiles.filter((p) => !p.dead);
  }

  // ---------- คลื่นเสียง ----------
  _updateWaves(dt) {
    for (const w of this.waves) {
      if (w.owner === this.frozen) continue;
      w.r += w.speed * dt;
      if (!w.hit) {
        const t = this.fighters.find((f) => f !== w.owner);
        if (t.hp > 0) {
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
            this._damage(t, dmg, t.x - (dx / dist) * t.r, t.y - (dy / dist) * t.r);
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
      if (w.projectileEffect === "none" || w.owner === this.frozen) continue;
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
        if (w.projectileEffect === "stop") {
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
      this.frozen = null;
      for (const f of this.fighters) {
        f.cast = null;
        f.frame = "idle";
        f.dashTimer = 0;
      }
    }
  }
}

// เลขเวอร์ชันของไฟล์นี้ (main.js ใช้ตรวจว่าโหลดไฟล์ครบและตรงกันหรือไม่)
if (typeof window !== "undefined") (window.BB_FILES = window.BB_FILES || {}).battle = 10;

if (typeof module !== "undefined") module.exports = { Battle, skillsOf };
