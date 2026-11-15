// ============================================================
//  ตรรกะการต่อสู้ล้วนๆ (ไม่แตะ DOM) เลยเอาไปเทสใน Node ได้
// ============================================================
class Battle {
  constructor(width, height, defA, defB, rng = Math.random) {
    this.w = width;
    this.h = height;
    this.rng = rng;
    this.time = 0;
    this.projectiles = [];
    this.events = []; // เอฟเฟกต์ให้ตัววาดเอาไปใช้ แล้วเคลียร์ทุกเฟรม
    this.winner = null; // 0, 1 หรือ "draw"
    this.contactCooldown = 0;

    this.fighters = [
      this._makeFighter(defA, width * 0.25, height * 0.5, 0),
      this._makeFighter(defB, width * 0.75, height * 0.5, Math.PI),
    ];
  }

  _makeFighter(def, x, y, angle) {
    const jitter = (this.rng() - 0.5) * 1.2;
    const a = angle + jitter;
    return {
      def,
      x,
      y,
      vx: Math.cos(a) * def.speed,
      vy: Math.sin(a) * def.speed,
      r: def.radius,
      hp: def.hp,
      maxHp: def.hp,
      facing: 1,
      cooldown: 0.8 + this.rng() * 0.6,
      frame: "idle",
      cast: null, // {t, fired}
      dashTimer: 0,
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
    this.contactCooldown = Math.max(0, this.contactCooldown - dt);

    const [a, b] = this.fighters;
    for (const f of this.fighters) {
      const enemy = f === a ? b : a;
      f.facing = enemy.x >= f.x ? 1 : -1;
      f.hitFlash = Math.max(0, f.hitFlash - dt);
      f.cooldown -= dt;
      this._updateSkill(f, enemy, dt);
      this._move(f, dt);
    }

    this._fighterCollision(a, b);
    this._updateProjectiles(dt);
    this._checkWinner();
  }

  // ---------- สกิล ----------
  _updateSkill(f, enemy, dt) {
    const sk = f.def.skill;
    if (!sk) return;

    if (f.cast) {
      f.cast.t += dt;
      if (sk.type === "projectile" && !f.cast.fired && f.cast.t >= (sk.fireDelay || 0)) {
        f.cast.fired = true;
        this._fireProjectile(f, enemy, sk);
      }
      if (f.cast.t >= sk.duration) {
        f.cast = null;
        f.frame = "idle";
        f.dashTimer = 0;
      }
    } else if (f.cooldown <= 0) {
      f.cooldown = sk.cooldown;
      f.cast = { t: 0, fired: false };
      f.frame = sk.frame;
      if (sk.type === "dash") {
        f.dashTimer = sk.duration;
        const dx = enemy.x - f.x;
        const dy = enemy.y - f.y;
        const len = Math.hypot(dx, dy) || 1;
        const sp = f.def.speed * sk.speedMult;
        f.vx = (dx / len) * sp;
        f.vy = (dy / len) * sp;
        this.events.push({ type: "dash", x: f.x, y: f.y });
      }
    }
  }

  _fireProjectile(f, enemy, sk) {
    const dx = enemy.x - f.x;
    const dy = enemy.y - f.y;
    const len = Math.hypot(dx, dy) || 1;
    const muzzle = f.r + 6;
    this.projectiles.push({
      x: f.x + (dx / len) * muzzle,
      y: f.y + (dy / len) * muzzle,
      vx: (dx / len) * sk.projectileSpeed,
      vy: (dy / len) * sk.projectileSpeed,
      r: sk.projectileRadius,
      damage: sk.damage,
      owner: f,
      color: f.def.color,
    });
    this.events.push({ type: "muzzle", x: f.x + (dx / len) * muzzle, y: f.y + (dy / len) * muzzle });
  }

  // ---------- การเคลื่อนที่ ----------
  _move(f, dt) {
    const dashing = f.dashTimer > 0;
    if (dashing) f.dashTimer -= dt;
    const target = f.def.speed * (dashing ? f.def.skill.speedMult : 1);
    const cur = Math.hypot(f.vx, f.vy) || 1;
    f.vx = (f.vx / cur) * target;
    f.vy = (f.vy / cur) * target;

    f.x += f.vx * dt;
    f.y += f.vy * dt;

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

    if (this.contactCooldown <= 0) {
      this.contactCooldown = 0.35;
      this._damage(b, this._contactDmg(a), a.x + nx * a.r, a.y + ny * a.r);
      this._damage(a, this._contactDmg(b), b.x - nx * b.r, b.y - ny * b.r);
    }
  }

  _contactDmg(f) {
    const sk = f.def.skill;
    const bonus = f.dashTimer > 0 && sk && sk.contactBonus ? sk.contactBonus : 1;
    return f.def.contactDamage * bonus;
  }

  // ---------- กระสุน ----------
  _updateProjectiles(dt) {
    for (const p of this.projectiles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      const target = this.fighters.find((f) => f !== p.owner);
      if (target.hp > 0 && Math.hypot(target.x - p.x, target.y - p.y) < target.r + p.r) {
        this._damage(target, p.damage, p.x, p.y);
        // ถีบเบาๆ ตามทิศกระสุน
        const len = Math.hypot(p.vx, p.vy) || 1;
        target.x += (p.vx / len) * 6;
        target.y += (p.vy / len) * 6;
        p.dead = true;
      } else if (p.x < -20 || p.x > this.w + 20 || p.y < -20 || p.y > this.h + 20) {
        p.dead = true;
      }
    }
    this.projectiles = this.projectiles.filter((p) => !p.dead);
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
      this.projectiles = []; // กระสุนที่ค้างอยู่หายไปพร้อมจบแมตช์
      for (const f of this.fighters) {
        f.cast = null;
        f.frame = "idle";
        f.dashTimer = 0;
      }
    }
  }
}

if (typeof module !== "undefined") module.exports = { Battle };
