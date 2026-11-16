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
    };
  }

  update(dt) {
    this.events.length = 0;
    if (this.winner !== null) {
      // จบแมตช์แล้ว: คนชนะยังเด้งไปมาต่อ ส่วนคนแพ้ไม่ถูกคำนวณอีก (ตัววาดจะทำให้แตกกระจาย)
      for (const f of this.fighters) {
        if (f.hp <= 0) continue;
        f.hitFlash = Math.max(0, f.hitFlash - dt);
        this._move(f, dt);
      }
      return;
    }
    this.time += dt;

    const [a, b] = this.fighters;
    for (const f of this.fighters) {
      const enemy = f === a ? b : a;
      f.facing = enemy.x >= f.x ? 1 : -1;
      f.hitFlash = Math.max(0, f.hitFlash - dt);
      f.gcd = Math.max(0, f.gcd - dt);
      for (let i = 0; i < f.cds.length; i++) f.cds[i] -= dt;
      this._updateSkill(f, enemy, dt);
      this._move(f, dt);
    }

    this._fighterCollision(a, b);
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
    for (let i = 0; i < f.skills.length; i++) {
      if (f.cds[i] <= 0 && (pick === -1 || f.cds[i] < f.cds[pick])) pick = i;
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
    }
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
      speed: sk.waveSpeed,
      maxR: sk.waveRange,
      halfArc: ((sk.waveArcDeg || 80) * Math.PI) / 360, // ครึ่งหนึ่งของมุมกว้างของคลื่น
      damage: sk.damage,
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
    target.knockX += nx * kb;
    target.knockY += ny * kb;
  }

  // ---------- กระสุน / โน้ต ----------
  _updateProjectiles(dt) {
    for (const p of this.projectiles) {
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
            this._damage(t, w.damage, t.x - (dx / dist) * t.r, t.y - (dy / dist) * t.r);
            t.knockX += (dx / dist) * w.knockback;
            t.knockY += (dy / dist) * w.knockback;
          }
        }
      }
    }
    this.waves = this.waves.filter((w) => w.r < w.maxR);
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
      for (const f of this.fighters) {
        f.cast = null;
        f.frame = "idle";
        f.dashTimer = 0;
      }
    }
  }
}

// เลขเวอร์ชันของไฟล์นี้ (main.js ใช้ตรวจว่าโหลดไฟล์ครบและตรงกันหรือไม่)
if (typeof window !== "undefined") (window.BB_FILES = window.BB_FILES || {}).battle = 7;

if (typeof module !== "undefined") module.exports = { Battle, skillsOf };
