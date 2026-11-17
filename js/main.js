// ============================================================
//  ส่วนวาดภาพ + UI
// ============================================================
const canvas = document.getElementById("arena");
const ctx = canvas.getContext("2d");
const W = canvas.width;
const H = canvas.height;
const FONT = '"Prompt", "Noto Sans Thai", system-ui, sans-serif';

const selA = document.getElementById("charA");
const selB = document.getElementById("charB");
const btnFight = document.getElementById("fight");
const btnSpeed = document.getElementById("speed");
const btnMute = document.getElementById("mute");

const sfx = new SoundFX();

let battle = null;
let particles = [];
let shards = []; // เศษภาพของตัวที่แพ้
let floaters = [];
let speedMult = 1;
let lastTs = 0;
let shake = 0;
let screenFlash = 0; // วาบขาวทั้งจอ (ตอนเริ่มตัดเวลา)
let ghosts = []; // ภาพติดตาของคนที่กำลังเร่งเวลา (Johan)
let ghostAcc = 0;
const charKey = (def) => Object.keys(CHARACTERS).find((k) => CHARACTERS[k] === def);

// ---------- โหลดภาพ ----------
const images = {}; // images[charKey][frameName] = HTMLImageElement | null

function loadAllImages() {
  const jobs = [];
  for (const [key, def] of Object.entries(CHARACTERS)) {
    images[key] = {};
    for (const [frame, src] of Object.entries(def.frames)) {
      jobs.push(
        new Promise((resolve) => {
          const img = new Image();
          img.onload = () => { images[key][frame] = img; resolve(); };
          img.onerror = () => { images[key][frame] = null; resolve(); };
          img.src = src;
        })
      );
    }
  }
  return Promise.all(jobs);
}

// ---------- UI ----------
function fillSelects() {
  const keys = Object.keys(CHARACTERS);
  for (const sel of [selA, selB]) {
    sel.innerHTML = "";
    for (const k of keys) {
      const opt = document.createElement("option");
      opt.value = k;
      opt.textContent = CHARACTERS[k].name;
      sel.appendChild(opt);
    }
  }
  selA.value = keys[0];
  selB.value = keys[1] || keys[0];
}

function startBattle() {
  sfx.unlock();
  sfx.start();
  battle = new Battle(W, H, CHARACTERS[selA.value], CHARACTERS[selB.value]);
  battle.fighters.forEach((f) => { f.trailHp = f.hp; }); // แถบเลือดที่ค่อยๆ ลดตามหลัง
  particles = [];
  shards = [];
  floaters = [];
  ghosts = [];
  shake = 0;
}

function updateMuteLabel() {
  btnMute.textContent = sfx.muted ? "🔇 เสียง: ปิด" : "🔊 เสียง: เปิด";
}

btnFight.addEventListener("click", startBattle);
btnSpeed.addEventListener("click", () => {
  sfx.unlock();
  sfx.click();
  speedMult = speedMult === 1 ? 2 : speedMult === 2 ? 0.5 : 1;
  btnSpeed.textContent = "ความเร็ว x" + speedMult;
});
btnMute.addEventListener("click", () => {
  sfx.unlock();
  sfx.toggleMute();
  sfx.click();
  updateMuteLabel();
});
for (const sel of [selA, selB]) {
  sel.addEventListener("change", () => {
    sfx.unlock();
    sfx.click();
    if (!battle || battle.winner !== null) setIdleHud();
  });
}

// ---------- เอฟเฟกต์ ----------
function spawnParticles(x, y, color, n, power) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const s = (0.3 + Math.random()) * power;
    particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.4 + Math.random() * 0.3, color });
  }
}

// หั่นภาพตัวละครเป็นตาราง N x N แล้วให้แต่ละชิ้นกระเด็นออกจากจุดกึ่งกลาง
function spawnShards(f, key) {
  const img = images[key] && (images[key][f.frame] || images[key].idle);
  const size = f.r * 2.6;
  const N = 6;
  const tile = size / N;
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < N; j++) {
      const ox = (i + 0.5) * tile - size / 2; // ตำแหน่งชิ้นในภาพ (ก่อนกลับด้าน)
      const oy = (j + 0.5) * tile - size / 2;
      const wx = ox * f.facing;
      const ang = Math.atan2(oy, wx) + (Math.random() - 0.5) * 0.9;
      const sp = 140 + Math.random() * 380;
      const life = 0.9 + Math.random() * 0.6;
      shards.push({
        img,
        color: f.def.color,
        sx: img ? i * (img.width / N) : 0,
        sy: img ? j * (img.height / N) : 0,
        sw: img ? img.width / N : 0,
        sh: img ? img.height / N : 0,
        tile,
        facing: f.facing,
        x: f.x + wx,
        y: f.y + oy,
        vx: Math.cos(ang) * sp,
        vy: Math.sin(ang) * sp - 120,
        rot: 0,
        vr: (Math.random() - 0.5) * 14,
        life,
        maxLife: life,
      });
    }
  }
}

function handleEvents(events) {
  for (const e of events) {
    if (e.type === "hit") {
      spawnParticles(e.x, e.y, "#ffd54a", 10, 260);
      floaters.push({ x: e.x, y: e.y - 10, text: "-" + Math.round(e.amount), life: 0.8 });
      shake = Math.max(shake, 6);
      sfx.hit();
    } else if (e.type === "muzzle") {
      spawnParticles(e.x, e.y, e.sound === "note" ? "#fff1a8" : e.sound === "word" ? "#ffe27a" : "#fff3b0", e.sound === "note" ? 4 : 6, 200);
      if (e.sound === "note") sfx.note();
      else if (e.sound === "kick") sfx.kick();
      else if (e.sound === "word") sfx.word();
      else sfx.shoot();
    } else if (e.type === "deflect") {
      spawnParticles(e.x, e.y, "#ffffff", 8, 220);
      sfx.deflect();
    } else if (e.type === "wave") {
      spawnParticles(e.x, e.y, "#ffffff", 14, 260);
      shake = Math.max(shake, 5);
      sfx.wave();
    } else if (e.type === "dash") {
      spawnParticles(e.x, e.y, "#ffffff", 12, 220);
      sfx.dash();
    } else if (e.type === "mind") {
      spawnParticles(e.x, e.y, "#b38cff", 8, 180);
      floaters.push({ x: e.x + 14, y: e.y - 34, text: "สติ -" + Math.round(e.amount), life: 1.0, color: "#c9a8ff", size: 22 });
    } else if (e.type === "breakdown") {
      spawnParticles(e.x, e.y, "#c9a8ff", 30, 380);
      floaters.push({ x: e.x, y: e.y - 60, text: "สติแตก!", life: 1.3, color: "#ff9bd8", size: 34 });
      shake = Math.max(shake, 10);
      sfx.breakdown();
    } else if (e.type === "dropWeapon") {
      spawnParticles(e.x, e.y, "#c9a8ff", 14, 260);
      floaters.push({ x: e.x, y: e.y - 62, text: "ทิ้งอาวุธ!", life: 1.2, color: "#ff9bd8", size: 30 });
      sfx.breakdown();
    } else if (e.type === "pickWeapon") {
      floaters.push({ x: e.x, y: e.y - 62, text: "ตั้งสติได้!", life: 1.0, color: "#9be8ff", size: 26 });
      sfx.click();
    } else if (e.type === "backstab") {
      screenFlash = 0.3;
      spawnParticles(e.x, e.y, "#ff2a55", 26, 360);
      floaters.push({ x: e.x, y: e.y - 60, text: "แทงข้างหลัง! x2", life: 1.2, color: "#ff8fa8", size: 32 });
      floaters.push({ x: e.x, y: e.y - 28, text: "ใบ้สกิล!", life: 1.2, color: "#ffd1dc", size: 26 });
      shake = Math.max(shake, 12);
      sfx.slash();
    } else if (e.type === "clash") {
      spawnParticles(e.x, e.y, "#fff3b0", 16, 340);
      spawnParticles(e.x, e.y, "#ffffff", 8, 240);
      shake = Math.max(shake, 7);
      sfx.slash();
      sfx.deflect();
    } else if (e.type === "waveStun") {
      spawnParticles(e.x, e.y, "#fff3b0", 18, 320);
      floaters.push({ x: e.x, y: e.y - 62, text: "มึนงง!", life: 1.1, color: "#ffe98a", size: 30 });
      shake = Math.max(shake, 8);
    } else if (e.type === "ram") {
      spawnParticles(e.x, e.y, "#ffffff", 10, 280);
      shake = Math.max(shake, 5);
    } else if (e.type === "slash") {
      spawnParticles(e.x, e.y, "#ffb3c6", 10, 300);
      shake = Math.max(shake, 4);
      sfx.slash();
    } else if (e.type === "erase") {
      screenFlash = 0.6;
      spawnParticles(e.x, e.y, "#ff2a55", 24, 320);
      sfx.erase();
    } else if (e.type === "eraseBreak") {
      screenFlash = 0.5;
      spawnParticles(e.x, e.y, "#ff2a55", 30, 380);
      floaters.push({ x: e.x, y: e.y - 62, text: "เวลากลับมา!", life: 1.1, color: "#ff8fa8", size: 30 });
    } else if (e.type === "confused") {
      floaters.push({ x: e.x, y: e.y - 56, text: "เกิดอะไรขึ้น?", life: 1.2, color: "#ffd1dc", size: 26 });
      spawnParticles(e.x, e.y, "#ff6b8a", 10, 180);
    } else if (e.type === "accel") {
      screenFlash = 0.25;
      spawnParticles(e.x, e.y, "#ffb020", 24, 340);
      floaters.push({ x: e.x, y: e.y - 62, text: "เร่งเวลา x" + e.rate + "!", life: 1.1, color: "#ffcf5a", size: 30 });
      sfx.accel();
    } else if (e.type === "slow") {
      screenFlash = 0.25;
      spawnParticles(e.x, e.y, "#45e0c0", 24, 300);
      floaters.push({ x: e.x, y: e.y - 62, text: "ชะลอเวลา!", life: 1.1, color: "#7ff5dc", size: 30 });
      sfx.slow();
    } else if (e.type === "metaStart") {
      screenFlash = 0.2;
      spawnParticles(e.x, e.y, "#6fd3ff", 22, 300);
      floaters.push({ x: e.x, y: e.y - 62, text: "Meta Vision!", life: 1.2, color: "#8fe0ff", size: 30 });
      sfx.meta();
    } else if (e.type === "metaEnd") {
      spawnParticles(e.x, e.y, "#6fd3ff", 12, 220);
      floaters.push({ x: e.x, y: e.y - 62, text: "เห็นช่องว่างแล้ว!", life: 1.0, color: "#8fe0ff", size: 26 });
    } else if (e.type === "dodge") {
      const f = battle.fighters.find((g) => g.hp > 0 && Math.hypot(g.x - e.x, g.y - e.y) < 1);
      if (f) for (let i = 0; i < 4; i++) ghosts.push({ key: charKey(f.def), x: f.x - e.nx * i * 14, y: f.y - e.ny * i * 14, r: f.r, vy: f.vy, facing: f.facing, frame: f.frame, life: 0.35, tint: "blue" });
      spawnParticles(e.x, e.y, "#6fd3ff", 14, 280);
      floaters.push({ x: e.x, y: e.y - 56, text: "หลบ!", life: 0.8, color: "#8fe0ff", size: 28 });
      sfx.dodge();
    } else if (e.type === "kick") {
      spawnParticles(e.x, e.y, e.meta ? "#ffd65a" : "#ffffff", e.meta ? 22 : 12, e.meta ? 380 : 260);
      shake = Math.max(shake, e.meta ? 9 : 5);
      if (e.meta) floaters.push({ x: e.x, y: e.y - 40, text: "Meta Kick!", life: 1.0, color: "#ffd65a", size: 30 });
      sfx.kick();
    } else if (e.type === "reflect") {
      spawnParticles(e.x, e.y, "#ffffff", 16, 320);
      floaters.push({ x: e.x, y: e.y - 36, text: "สะท้อน!", life: 0.9, color: "#fff3b0", size: 30 });
      shake = Math.max(shake, 6);
      sfx.deflect();
    } else if (e.type === "bounce") {
      spawnParticles(e.x, e.y, "#ffffff", 8, 200);
    } else if (e.type === "rewind") {
      screenFlash = 0.35;
      sfx.rewind();
    } else if (e.type === "ko") {
      shake = 16;
      const keyOf = (def) => Object.keys(CHARACTERS).find((k) => CHARACTERS[k] === def);
      for (const f of battle.fighters) {
        if (f.hp > 0) continue;
        spawnParticles(f.x, f.y, f.def.color, 40, 420);
        spawnShards(f, keyOf(f.def));
      }
      sfx.ko();
      if (battle.winner === "draw") sfx.draw();
      else sfx.win();
    }
  }
}

function updateEffects(dt) {
  for (const p of particles) {
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vx *= 0.96;
    p.vy *= 0.96;
    p.life -= dt;
  }
  particles = particles.filter((p) => p.life > 0);
  for (const s of shards) {
    s.x += s.vx * dt;
    s.y += s.vy * dt;
    s.vy += 520 * dt; // แรงโน้มถ่วงเบาๆ ให้เศษร่วง
    s.vx *= 0.995;
    s.rot += s.vr * dt;
    s.life -= dt;
  }
  shards = shards.filter((s) => s.life > 0);
  for (const f of floaters) {
    f.y -= 40 * dt;
    f.life -= dt;
  }
  floaters = floaters.filter((f) => f.life > 0);
  shake = Math.max(0, shake - 40 * dt);
  screenFlash = Math.max(0, screenFlash - dt * 1.5);
  // ภาพติดตาสีแดงตามคนที่กำลังตัดเวลา
  if (battle && battle.eraser && Math.random() < 0.8) {
    spawnParticles(battle.eraser.x, battle.eraser.y, "#ff2a55", 1, 60);
  }

  // เร่งเวลา: ทิ้งภาพติดตาสีเหลืองตามหลัง Johan
  for (const g of ghosts) g.life -= dt;
  ghosts = ghosts.filter((g) => g.life > 0);
  if (battle) {
    ghostAcc += dt;
    for (const f of battle.fighters) {
      if (f.hp > 0 && f.cast && f.cast.sk.type === "timeaccel") {
        if (ghostAcc >= 0.035) {
          ghosts.push({ key: charKey(f.def), x: f.x, y: f.y, r: f.r, vy: f.vy, facing: f.facing, frame: f.frame, life: 0.3 });
        }
        if (Math.random() < 0.6) spawnParticles(f.x, f.y, "#ffb020", 1, 90);
      }
      // ชะลอเวลา: ตัวที่ถูกชะลอมีฝุ่นสีเขียวน้ำเงินลอยช้าๆ
      if (battle.slower && f !== battle.slower && f.hp > 0 && battle.timeScaleOf(f) < 0.95 && Math.random() < 0.3) {
        spawnParticles(f.x, f.y, "#45e0c0", 1, 40);
      }
    }
    if (ghostAcc >= 0.035) ghostAcc = 0;
  }

  // แถบเลือดสีขาวที่ค่อยๆ ไหลตามหลังเลือดจริง
  if (battle) {
    for (const f of battle.fighters) {
      if (f.trailHp === undefined) f.trailHp = f.hp;
      if (f.trailHp < f.hp) f.trailHp = f.hp; // เลือดเพิ่ม (ย้อนเวลา) ให้แถบตามทัน
      if (f.trailHp > f.hp) f.trailHp = Math.max(f.hp, f.trailHp - f.maxHp * 0.35 * dt);
    }
  }
}

// ---------- วาด ----------
function drawArena() {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, "#1b2030");
  g.addColorStop(1, "#10131d");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = "rgba(255,255,255,0.05)";
  ctx.lineWidth = 1;
  for (let x = 0; x <= W; x += 60) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
  for (let y = 0; y <= H; y += 60) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
}

// canvas เล็กๆ สำหรับทำเอฟเฟกต์วาบขาว (ใช้ซ้ำทุกเฟรม)
const flashCv = document.createElement("canvas");
const flashCtx = flashCv.getContext("2d");

function drawFighter(f, key) {
  const size = f.r * 2.6;
  const img = images[key] && (images[key][f.frame] || images[key].idle);

  ctx.save();
  ctx.translate(f.x, f.y);

  // เงา
  ctx.fillStyle = "rgba(0,0,0,0.3)";
  ctx.beginPath();
  ctx.ellipse(0, f.r * 0.95, f.r * 0.9, f.r * 0.25, 0, 0, Math.PI * 2);
  ctx.fill();

  // เอียงตามทิศเคลื่อนที่นิดหน่อยให้ดูมีชีวิต
  ctx.rotate(Math.max(-0.25, Math.min(0.25, (f.vy / 800) * f.facing)));
  ctx.scale(f.facing, 1);

  if (img) {
    if (f.hitFlash > 0) {
      // วาบขาวตอนโดนตี: ทาสีขาวบนสำเนาของภาพ (canvas แยก) เพื่อให้ทาเฉพาะส่วนตัวละคร ไม่ทาทั้งกล่อง
      flashCv.width = flashCv.height = Math.ceil(size);
      flashCtx.drawImage(img, 0, 0, flashCv.width, flashCv.height);
      flashCtx.globalCompositeOperation = "source-atop";
      flashCtx.globalAlpha = Math.min(1, f.hitFlash / 0.15) * 0.7;
      flashCtx.fillStyle = "#fff";
      flashCtx.fillRect(0, 0, flashCv.width, flashCv.height);
      ctx.drawImage(flashCv, -size / 2, -size / 2, size, size);
    } else {
      ctx.drawImage(img, -size / 2, -size / 2, size, size);
    }
  } else {
    // ไม่มีภาพ -> วาดเป็นบอลสีแทน
    ctx.fillStyle = f.hitFlash > 0 ? "#fff" : f.def.color;
    ctx.beginPath();
    ctx.arc(0, 0, f.r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

// ---------- ดาบคาตานะที่หมุนรอบตัว (วาดด้วยโค้ด) ----------
function drawKatana(f) {
  const wp = f.weapon;
  const s0 = f.r * (wp.startRatio || 0.5);
  const reach = f.r + wp.length;
  const dir = f.weaponDir;
  const hot = f.weaponCd > (wp.hitCooldown || 0.4) - 0.12; // เพิ่งฟันโดน: ใบดาบเรืองแสง

  ctx.save();
  ctx.translate(f.x, f.y);
  ctx.rotate(f.weaponAng);

  // รอยฟันจางๆ ตามหลังใบดาบ
  for (let k = 0; k < 8; k++) {
    const a0 = -dir * k * 0.09;
    const a1 = -dir * (k + 1) * 0.09;
    ctx.fillStyle = "rgba(255, 200, 215, " + (0.26 * (1 - k / 8)).toFixed(3) + ")";
    ctx.beginPath();
    ctx.arc(0, 0, reach - 2, Math.min(a0, a1), Math.max(a0, a1));
    ctx.arc(0, 0, f.r + 8, Math.max(a0, a1), Math.min(a0, a1), true);
    ctx.closePath();
    ctx.fill();
  }

  // ด้าม
  const hiltEnd = s0 + 24;
  ctx.fillStyle = "#2a1c24";
  ctx.fillRect(s0 - 6, -4, hiltEnd - s0 + 6, 8);
  ctx.strokeStyle = "#c9a14a";
  ctx.lineWidth = 1.5;
  for (let x = s0; x < hiltEnd; x += 6) {
    ctx.beginPath();
    ctx.moveTo(x, -4);
    ctx.lineTo(x + 4, 4);
    ctx.stroke();
  }
  // ที่กั้นมือ (tsuba)
  ctx.fillStyle = "#d4af37";
  ctx.beginPath();
  ctx.ellipse(hiltEnd, 0, 3, 10, 0, 0, Math.PI * 2);
  ctx.fill();

  // ใบดาบ: โค้งนิดๆ ปลายแหลม
  const bx = hiltEnd + 1;
  const w = (wp.width || 8) / 2;
  const g = ctx.createLinearGradient(0, -w, 0, w);
  g.addColorStop(0, "#ffffff");
  g.addColorStop(0.5, "#dfe7f3");
  g.addColorStop(1, "#8c98ad");
  ctx.shadowColor = hot ? "#ff3b6b" : "#bcd0ff";
  ctx.shadowBlur = hot ? 18 : 6;
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(bx, -w);
  ctx.quadraticCurveTo((bx + reach) / 2, -w - 3 * dir, reach + 6, -2 * dir);
  ctx.quadraticCurveTo((bx + reach) / 2, w - 3 * dir, bx, w);
  ctx.closePath();
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = "rgba(255,255,255,0.9)";
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(bx + 4, -1);
  ctx.quadraticCurveTo((bx + reach) / 2, -3 * dir - 1, reach, -2 * dir);
  ctx.stroke();
  ctx.restore();
}

// ---------- เข็มทิศที่หมุนรอบตัว (วาดด้วยโค้ด): ไม้เท้าหัวเข็มทิศ เข็มชี้ไปที่ศัตรูเสมอ ----------
function drawCompass(f) {
  const wp = f.weapon;
  const s0 = f.r * (wp.startRatio || 0.5);
  const reach = f.r + wp.length;
  const head = wp.headRadius || 16;
  const hc = reach - head; // จุดกึ่งกลางหัวเข็มทิศ
  const dir = f.weaponDir;
  const hot = f.weaponCd > (wp.hitCooldown || 0.4) - 0.12;
  const enemy = battle && battle.fighters.find((g) => g !== f);
  const now = performance.now() / 1000;
  // มุมเข็ม (สัมพัทธ์กับก้านที่หมุนอยู่): ชี้ไปที่ศัตรู ถ้าไม่มีศัตรูให้หมุนเล่น
  const toEnemy = enemy && enemy.hp > 0 ? Math.atan2(enemy.y - f.y, enemy.x - f.x) : now * 5;
  const needle = toEnemy - f.weaponAng + Math.sin(now * 11) * 0.07;

  ctx.save();
  ctx.translate(f.x, f.y);
  ctx.rotate(f.weaponAng);

  // รอยกวาดจางๆ ตามหลังหัวเข็มทิศ
  for (let k = 0; k < 8; k++) {
    const a0 = -dir * k * 0.09;
    const a1 = -dir * (k + 1) * 0.09;
    ctx.fillStyle = "rgba(255, 214, 120, " + (0.24 * (1 - k / 8)).toFixed(3) + ")";
    ctx.beginPath();
    ctx.arc(0, 0, reach - 2, Math.min(a0, a1), Math.max(a0, a1));
    ctx.arc(0, 0, reach - head * 2, Math.max(a0, a1), Math.min(a0, a1), true);
    ctx.closePath();
    ctx.fill();
  }

  // ก้านไม้เท้า + ด้ามพันผ้า
  const w = (wp.width || 7) / 2;
  ctx.fillStyle = "#5a3b22";
  ctx.fillRect(s0 - 6, -w, hc - head * 0.6 - s0 + 6, w * 2);
  ctx.strokeStyle = "#c9a14a";
  ctx.lineWidth = 1.5;
  for (let x = s0; x < s0 + 24; x += 6) {
    ctx.beginPath();
    ctx.moveTo(x, -w);
    ctx.lineTo(x + 4, w);
    ctx.stroke();
  }

  // ตัวเรือนเข็มทิศ: วงแหวนทองเหลือง + หน้าปัดสีครีม
  ctx.translate(hc, 0);
  ctx.shadowColor = hot ? "#ffb020" : "rgba(255, 220, 140, 0.55)";
  ctx.shadowBlur = hot ? 20 : 6;
  ctx.fillStyle = "#c99a2e";
  ctx.beginPath();
  ctx.arc(0, 0, head, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.fillStyle = "#f6efd8";
  ctx.beginPath();
  ctx.arc(0, 0, head - 3.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#7a5a14";
  ctx.lineWidth = 1.5;
  ctx.stroke();
  // ขีดทิศ 4 ทิศ
  ctx.strokeStyle = "#5a4a2a";
  ctx.lineWidth = 1.6;
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * (head - 7), Math.sin(a) * (head - 7));
    ctx.lineTo(Math.cos(a) * (head - 4), Math.sin(a) * (head - 4));
    ctx.stroke();
  }
  // เข็ม: ปลายแดงชี้ศัตรู ปลายขาวอีกข้าง
  ctx.save();
  ctx.rotate(needle);
  const nl = head - 5;
  ctx.fillStyle = "#e0243c";
  ctx.beginPath();
  ctx.moveTo(nl, 0);
  ctx.lineTo(0, -3.2);
  ctx.lineTo(0, 3.2);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.strokeStyle = "#8a8a8a";
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(-nl, 0);
  ctx.lineTo(0, -3.2);
  ctx.lineTo(0, 3.2);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
  ctx.fillStyle = "#333";
  ctx.beginPath();
  ctx.arc(0, 0, 2.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// วงชะลอเวลารอบ Johan: วงสีเขียวน้ำเงิน มีวงแหวนหดเข้าหาตัว และขีดนาฬิกาหมุนช้าๆ ที่ขอบ
function drawSlowField(b) {
  const s = b.slower;
  const R = s.cast.sk.radius || 300;
  const t = performance.now() / 1000;
  ctx.save();
  const g = ctx.createRadialGradient(s.x, s.y, R * 0.2, s.x, s.y, R);
  g.addColorStop(0, "rgba(69, 224, 192, 0.04)");
  g.addColorStop(0.8, "rgba(69, 224, 192, 0.14)");
  g.addColorStop(1, "rgba(69, 224, 192, 0.02)");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(s.x, s.y, R, 0, Math.PI * 2);
  ctx.fill();
  // วงแหวนหดเข้าหาตัว = เวลาถูกดูดให้ช้าลง
  for (let k = 0; k < 3; k++) {
    const ph = (t * 0.45 + k / 3) % 1;
    ctx.strokeStyle = "rgba(127, 245, 220, " + (0.35 * (1 - ph)).toFixed(3) + ")";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(s.x, s.y, R * (1 - ph * 0.85), 0, Math.PI * 2);
    ctx.stroke();
  }
  // ขอบวงประ + ขีดนาฬิกา
  ctx.strokeStyle = "rgba(127, 245, 220, 0.7)";
  ctx.lineWidth = 3;
  ctx.setLineDash([10, 8]);
  ctx.lineDashOffset = -t * 12;
  ctx.beginPath();
  ctx.arc(s.x, s.y, R, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  for (let k = 0; k < 24; k++) {
    const a = (k / 24) * Math.PI * 2 + t * 0.25;
    const len = k % 6 === 0 ? 14 : 7;
    ctx.beginPath();
    ctx.moveTo(s.x + Math.cos(a) * (R - len), s.y + Math.sin(a) * (R - len));
    ctx.lineTo(s.x + Math.cos(a) * R, s.y + Math.sin(a) * R);
    ctx.stroke();
  }
  ctx.restore();
}

// วงหมุนรอบตัวคนที่กำลังเร่งเวลา: เข็มนาฬิกาหมุนเร็วสองเข็ม
function drawAccelAura(f) {
  const t = performance.now() / 1000;
  const R = f.r * 1.3;
  ctx.save();
  ctx.translate(f.x, f.y);
  ctx.strokeStyle = "rgba(255, 190, 60, 0.7)";
  ctx.lineWidth = 3;
  ctx.setLineDash([6, 6]);
  ctx.lineDashOffset = -t * 90;
  ctx.beginPath();
  ctx.arc(0, 0, R, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.lineCap = "round";
  ctx.strokeStyle = "rgba(255, 224, 140, 0.85)";
  ctx.lineWidth = 3;
  for (const [sp, len] of [[9, R * 0.95], [2.2, R * 0.65]]) {
    const a = -Math.PI / 2 + t * sp;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(Math.cos(a) * len, Math.sin(a) * len);
    ctx.stroke();
  }
  ctx.restore();
}

// ภาพติดตาของคนที่เร่งเวลา (ทาสีเหลืองทอง โปร่งใสลดลงเรื่อยๆ)
function drawGhosts() {
  for (const g of ghosts) {
    ctx.save();
    ctx.globalAlpha = Math.max(0, g.life / 0.3) * 0.35;
    ctx.filter = g.tint === "blue" ? "sepia(1) hue-rotate(160deg) saturate(5) brightness(1.2)" : "sepia(1) saturate(4) brightness(1.1)";
    drawFighter({ x: g.x, y: g.y, r: g.r, vy: g.vy, facing: g.facing, frame: g.frame, hitFlash: 0, def: CHARACTERS[g.key] }, g.key);
    ctx.restore();
  }
  ctx.filter = "none";
}

// ป้ายนับถอยหลังด้านบนสนาม (ใช้กับเร่ง/ชะลอเวลา)
function drawTimeLabel(txt, color) {
  ctx.save();
  ctx.textAlign = "center";
  ctx.font = "700 26px " + FONT;
  ctx.lineWidth = 5;
  ctx.strokeStyle = "rgba(0,0,0,0.7)";
  ctx.strokeText(txt, W / 2, 42);
  ctx.fillStyle = color;
  ctx.fillText(txt, W / 2, 42);
  ctx.restore();
}

// ---------- ลูกฟุตบอล (กระสุนของ Isagi) ----------
function drawSoccer(p) {
  const r = p.r;
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(p.rot !== undefined ? p.rot : p.t * 14 * (p.spin >= 0 ? 1 : -1));
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#1a1a22";
  const pent = (cx, cy, rad, rot) => {
    ctx.beginPath();
    for (let i = 0; i < 5; i++) {
      const a = rot + (i / 5) * Math.PI * 2;
      const x = cx + Math.cos(a) * rad;
      const y = cy + Math.sin(a) * rad;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
  };
  pent(0, 0, r * 0.42, -Math.PI / 2);
  for (let i = 0; i < 5; i++) {
    const a = -Math.PI / 2 + (i / 5) * Math.PI * 2 + Math.PI / 5;
    pent(Math.cos(a) * r * 0.95, Math.sin(a) * r * 0.95, r * 0.32, a);
  }
  ctx.restore();
  ctx.strokeStyle = p.color;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
  ctx.stroke();
}

// บอลบนสนาม: เงา + ลูกฟุตบอล ถ้าถูกเตะ (hot) มีแสงและเส้นความเร็วตามหลัง (Meta Kick เป็นสีทองและแรงกว่า)
function drawBall(b) {
  const sp = Math.hypot(b.vx, b.vy);
  ctx.save();
  ctx.fillStyle = "rgba(0,0,0,0.3)";
  ctx.beginPath();
  ctx.ellipse(b.x, b.y + b.r * 0.9, b.r * 0.9, b.r * 0.3, 0, 0, Math.PI * 2);
  ctx.fill();
  if (b.hot && sp > 1) {
    const col = b.meta ? "255,214,90" : "120,200,255";
    const len = Math.min(0.09 * sp, 90);
    const ux = b.vx / sp;
    const uy = b.vy / sp;
    const g = ctx.createLinearGradient(b.x, b.y, b.x - ux * len, b.y - uy * len);
    g.addColorStop(0, "rgba(" + col + ",0.85)");
    g.addColorStop(1, "rgba(" + col + ",0)");
    ctx.strokeStyle = g;
    ctx.lineWidth = b.r * (b.meta ? 2.2 : 1.6);
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(b.x, b.y);
    ctx.lineTo(b.x - ux * len, b.y - uy * len);
    ctx.stroke();
    ctx.shadowColor = "rgb(" + col + ")";
    ctx.shadowBlur = b.meta ? 26 : 16;
  }
  drawSoccer({ x: b.x, y: b.y, r: b.r, rot: b.rot, color: b.hot ? (b.meta ? "#ffd65a" : "#78c8ff") : "#9aa3b5" });
  ctx.restore();
}

// ---------- Meta Vision: ออร่าฟ้า ตา และเส้น "อนาคตที่มองเห็น" ----------
function drawMetaAura(f) {
  const t = performance.now() / 1000;
  const R = f.r * 1.45;
  ctx.save();
  ctx.translate(f.x, f.y);
  ctx.globalAlpha = 0.16 + 0.06 * Math.sin(t * 6);
  ctx.fillStyle = "#4fb8ff";
  ctx.beginPath();
  ctx.arc(0, 0, R, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 0.85;
  ctx.strokeStyle = "#8fe0ff";
  ctx.lineWidth = 2.5;
  ctx.setLineDash([4, 7]);
  ctx.lineDashOffset = t * 40;
  ctx.beginPath();
  ctx.arc(0, 0, R, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  // ดวงตาเหนือหัว
  const ey = -f.r - 20;
  ctx.fillStyle = "rgba(10,30,60,0.8)";
  ctx.beginPath();
  ctx.ellipse(0, ey, 20, 10, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#8fe0ff";
  ctx.beginPath();
  ctx.arc(0, ey, 5.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// เส้นอนาคตที่ Isagi เห็น: เส้นประจากท่าของศัตรูไปจุดที่จะโดน
function drawMetaThreats(f) {
  const th = f.cast && f.cast.threats;
  if (!th || !th.length) return;
  ctx.save();
  ctx.strokeStyle = "rgba(143,224,255,0.75)";
  ctx.lineWidth = 2;
  ctx.setLineDash([8, 8]);
  ctx.lineDashOffset = -performance.now() / 40;
  for (const q of th) {
    ctx.beginPath();
    ctx.moveTo(q.x, q.y);
    ctx.lineTo(q.ex, q.ey);
    ctx.stroke();
  }
  ctx.setLineDash([]);
  ctx.fillStyle = "rgba(143,224,255,0.85)";
  for (const q of th) {
    ctx.beginPath();
    ctx.arc(q.ex, q.ey, 5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

// ---------- กรอบคำพูด (กระสุนบั่นทอนสติ) ----------
function drawWord(p) {
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(Math.sin(p.t * 5 + p.phase) * 0.08);
  ctx.font = "700 17px " + FONT;
  const w = ctx.measureText(p.text || "...").width + 22;
  const h = 30;
  ctx.shadowColor = p.color;
  ctx.shadowBlur = 14;
  ctx.fillStyle = "rgba(44, 36, 10, 0.92)";
  ctx.strokeStyle = "#ffe98a";
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.roundRect(-w / 2, -h / 2, w, h, 12);
  ctx.fill();
  ctx.stroke();
  // หางกรอบคำพูด ชี้ไปทางด้านหลัง (ทิศที่มา)
  const bx = -p.dx * (w / 2 - 6);
  ctx.beginPath();
  ctx.moveTo(-w / 4, h / 2 - 1);
  ctx.lineTo(-w / 4 - 6, h / 2 + 9);
  ctx.lineTo(-w / 4 + 8, h / 2 - 1);
  ctx.closePath();
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#fff7d1";
  ctx.fillText(p.text || "...", 0, 1);
  ctx.restore();
}

// ---------- ออร่าสติแตก: สัญลักษณ์วนรอบหัว + แสงม่วง ----------
function drawMindAura(f) {
  const lvl = battle && f === battle.dazed ? Math.max(0.5, f.mind / 100) : Math.min(1, f.mind / 100);
  const t = performance.now() / 1000;
  ctx.save();
  ctx.translate(f.x, f.y);
  ctx.globalAlpha = 0.12 + 0.22 * lvl + (f.stun > 0 ? 0.2 : 0);
  ctx.fillStyle = "#9a6bff";
  ctx.beginPath();
  ctx.arc(0, 0, f.r * 1.25, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = Math.min(1, 0.35 + lvl);
  ctx.font = "700 20px " + FONT;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#e0ccff";
  const dz = battle && f === battle.dazed;
  const glyphs = f.stun > 0 ? ["@", "?!", "@", "…"] : dz ? ["…", "…", "?"] : ["?", "…", "!"];
  glyphs.forEach((g, i) => {
    const a = t * 2.4 + (i / glyphs.length) * Math.PI * 2;
    ctx.fillText(g, Math.cos(a) * f.r * 0.9, -f.r * 1.15 + Math.sin(a) * 9);
  });
  ctx.restore();
}

// ---------- โน้ตดนตรี (กระสุนของ Singer) วาดด้วยโค้ด ไม่ต้องมีรูป ----------
function drawNote(p) {
  const s = p.r;
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(Math.sin(p.t * 6 + p.phase) * 0.3);
  ctx.shadowColor = p.color;
  ctx.shadowBlur = 12;
  ctx.lineCap = "round";
  const head = (x, y) => {
    ctx.beginPath();
    ctx.ellipse(x, y, s * 0.8, s * 0.55, -0.4, 0, Math.PI * 2);
  };
  const kind = p.noteKind;
  for (let pass = 0; pass < 2; pass++) {
    // pass 0 = ขอบสีตัวละคร (หนา), pass 1 = เนื้อโน้ตสีอ่อน
    const col = pass === 0 ? p.color : "#fffbe0";
    ctx.strokeStyle = col;
    ctx.fillStyle = col;
    ctx.lineWidth = pass === 0 ? 7 : 3.5;
    if (kind === 2) {
      // โน้ตคู่ มีคานเชื่อม
      head(-s * 0.9, s * 0.9); ctx.fill();
      head(s * 0.9, s * 0.5); ctx.fill();
      ctx.beginPath();
      ctx.moveTo(-s * 0.3, s * 0.75); ctx.lineTo(-s * 0.3, -s * 1.5);
      ctx.moveTo(s * 1.5, s * 0.35); ctx.lineTo(s * 1.5, -s * 1.9);
      ctx.moveTo(-s * 0.3, -s * 1.5); ctx.lineTo(s * 1.5, -s * 1.9);
      ctx.stroke();
    } else {
      head(-s * 0.4, s * 0.9); ctx.fill();
      ctx.beginPath();
      ctx.moveTo(s * 0.3, s * 0.75); ctx.lineTo(s * 0.3, -s * 1.6);
      if (kind === 0) ctx.quadraticCurveTo(s * 1.6, -s * 1.1, s * 1.1, s * 0.1); // หางโน้ตเขบ็ต
      ctx.stroke();
    }
  }
  ctx.restore();
}

// ---------- คลื่นเสียง: ส่วนโค้งหลายชั้นแผ่ออกไปทางศัตรู ----------
function drawWaves(b) {
  for (const w of b.waves) {
    const fade = Math.max(0, 1 - w.r / w.maxR);
    for (let k = 0; k < 4; k++) {
      const rr = w.r - k * 24;
      if (rr < 8) continue;
      ctx.save();
      ctx.globalAlpha = Math.min(1, fade * 1.3) * (1 - k * 0.22);
      ctx.shadowColor = w.color;
      ctx.shadowBlur = 16;
      ctx.strokeStyle = k === 0 ? "#ffffff" : w.color;
      ctx.lineWidth = 12 - k * 2.5;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.arc(w.x, w.y, rr, w.ang - w.halfArc, w.ang + w.halfArc);
      ctx.stroke();
      ctx.restore();
    }
  }
}

// ---------- แผงข้อมูลผู้เล่น (HTML อยู่นอกสนาม) ----------
const hud = [0, 1].map((i) => ({
  panel: document.getElementById("p" + i),
  name: document.getElementById("p" + i + "-name"),
  trail: document.getElementById("p" + i + "-trail"),
  fill: document.getElementById("p" + i + "-hp"),
  hpVal: document.getElementById("p" + i + "-hpval"),
  skillBox: document.getElementById("p" + i + "-skills"),
  mind: document.getElementById("p" + i + "-mind"),
  rows: [], // แถวสกิล: {bar, fill, val, name}
  builtFor: null, // ตัวละครที่แถวสกิลถูกสร้างไว้ให้
}));

function hpColor(ratio) {
  return ratio > 0.5 ? "#4cd964" : ratio > 0.25 ? "#ffcc00" : "#ff453a";
}

// สร้างแถวสกิล (ชื่อ + แถบคูลดาวน์) ให้ตรงกับจำนวนสกิลของตัวละคร
function buildSkillRows(h, def) {
  if (h.builtFor === def) return false;
  h.builtFor = def;
  h.rows = [];
  h.skillBox.innerHTML = "";
  const skills = skillsOf(def);
  for (const sk of skills) {
    const wrap = document.createElement("div");
    wrap.className = "skill";
    const name = document.createElement("span");
    name.className = "skname";
    name.textContent = "สกิล: " + (sk.name || sk.type);
    const bar = document.createElement("div");
    bar.className = "bar cd";
    const fill = document.createElement("div");
    fill.className = "fill";
    const val = document.createElement("span");
    val.className = "val";
    bar.appendChild(fill);
    bar.appendChild(val);
    wrap.appendChild(name);
    wrap.appendChild(bar);
    h.skillBox.appendChild(wrap);
    h.rows.push({ bar, fill, val });
  }
  if (!skills.length) {
    const none = document.createElement("span");
    none.className = "skname";
    none.textContent = "ไม่มีสกิล";
    h.skillBox.appendChild(none);
  }
  return true;
}

// ก่อนเริ่มสู้: โชว์ข้อมูลของตัวละครที่เลือกไว้ในช่อง
function setIdleHud() {
  let rebuilt = false;
  [selA, selB].forEach((sel, i) => {
    const def = CHARACTERS[sel.value];
    const h = hud[i];
    if (!def || !h.panel) return;
    if (buildSkillRows(h, def)) rebuilt = true;
    h.panel.className = "panel " + (i === 0 ? "left" : "right");
    h.name.textContent = def.name;
    h.name.style.color = def.color;
    h.trail.style.width = "100%";
    h.fill.style.width = "100%";
    h.fill.style.background = hpColor(1);
    h.hpVal.textContent = def.hp + " / " + def.hp;
    if (h.mind) h.mind.style.width = "0%";
    skillsOf(def).forEach((sk, j) => {
      const row = h.rows[j];
      row.bar.className = "bar cd";
      row.fill.style.width = "0%";
      row.val.textContent = "คูลดาวน์ " + sk.cooldown + " วิ";
    });
  });
  if (rebuilt) fitCanvas(); // ความสูงแผงเปลี่ยนตามจำนวนสกิล คำนวณขนาดสนามใหม่
}

// ระหว่างสู้: อัปเดตเลือดและคูลดาวน์ทุกเฟรม
function updateHud(b) {
  let rebuilt = false;
  b.fighters.forEach((f, i) => {
    const h = hud[i];
    if (!h.panel) return;
    if (buildSkillRows(h, f.def)) rebuilt = true;
    const alive = f.hp > 0;
    h.panel.className =
      "panel " + (i === 0 ? "left" : "right") + (alive ? "" : " dead") + (b.winner === i ? " winner" : "");
    h.name.textContent = f.def.name;
    h.name.style.color = f.def.color;

    const ratio = f.hp / f.maxHp;
    const trail = (f.trailHp === undefined ? f.hp : f.trailHp) / f.maxHp;
    h.fill.style.width = ratio * 100 + "%";
    h.fill.style.background = hpColor(ratio);
    h.trail.style.width = trail * 100 + "%";
    h.hpVal.textContent = Math.ceil(f.hp) + " / " + f.maxHp;
    if (h.mind) h.mind.style.width = Math.min(100, f.mind) + "%";

    f.skills.forEach((sk, j) => {
      const row = h.rows[j];
      if (!row) return;
      let cls = "bar cd";
      let pct = 0;
      let txt = "-";
      if (alive && b.winner === null) {
        if (f.cast && f.cast.i === j) {
          cls += " casting";
          pct = 100;
          txt = "กำลังใช้สกิล!";
        } else {
          const remain = Math.max(0, f.cds[j]);
          if (remain <= 0.05 && f.silence > 0) {
            pct = 100;
            txt = "ถูกใบ้!";
          } else if (remain <= 0.05) {
            cls += " ready";
            pct = 100;
            txt = "พร้อมใช้!";
          } else {
            pct = Math.max(0, Math.min(1, 1 - remain / sk.cooldown)) * 100;
            txt = remain.toFixed(1) + " วิ";
          }
        }
      }
      row.bar.className = cls;
      row.fill.style.width = pct + "%";
      row.val.textContent = txt;
    });
  });
  if (rebuilt) fitCanvas();
}

// ป้ายผู้ชนะ วาดไว้ "หลัง" ตัวละคร เพื่อให้คนชนะที่ยังเด้งอยู่วิ่งผ่านหน้าป้ายได้
function drawWinnerBanner(b) {
  ctx.fillStyle = "rgba(0,0,0,0.38)";
  ctx.fillRect(0, H / 2 - 80, W, 150);
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  const text = b.winner === "draw" ? "เสมอ!" : b.fighters[b.winner].def.name + " ชนะ!";
  ctx.font = "700 56px " + FONT;
  ctx.lineWidth = 6;
  ctx.strokeStyle = "rgba(0,0,0,0.6)";
  ctx.strokeText(text, W / 2, H / 2 + 8);
  ctx.fillStyle = "#fff";
  ctx.fillText(text, W / 2, H / 2 + 8);
  ctx.font = "400 20px " + FONT;
  ctx.fillStyle = "#e8ebf5";
  ctx.fillText("กด \"เริ่มสู้\" เพื่อเล่นอีกครั้ง", W / 2, H / 2 + 50);
}

// ---------- เอฟเฟกต์เวลา ----------
function drawEraseBackdrop() {
  // โลกที่ถูกตัดเวลา: โทนแดงเข้ม ขอบมืด เส้นความเร็วพุ่งเฉียง
  ctx.fillStyle = "rgba(110, 0, 30, 0.30)";
  ctx.fillRect(0, 0, W, H);
  const vg = ctx.createRadialGradient(W / 2, H / 2, H * 0.25, W / 2, H / 2, H * 0.75);
  vg.addColorStop(0, "rgba(0,0,0,0)");
  vg.addColorStop(1, "rgba(0,0,0,0.5)");
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, W, H);
}

// จุดที่ FuNx "เคยอยู่" ก่อนตัดเวลา: ตัวเหม่อลอยเล็งมาที่นี่ตามโชคชะตาเดิม
function drawPhantom(b) {
  const p = b.phantom;
  const t = performance.now() / 1000;
  ctx.save();
  ctx.globalAlpha = 0.35 + 0.15 * Math.sin(t * 6);
  ctx.strokeStyle = "#ff4d73";
  ctx.lineWidth = 3;
  ctx.setLineDash([8, 7]);
  ctx.beginPath();
  ctx.arc(p.x, p.y, p.r * 1.05, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.moveTo(p.x - 12, p.y - 12); ctx.lineTo(p.x + 12, p.y + 12);
  ctx.moveTo(p.x + 12, p.y - 12); ctx.lineTo(p.x - 12, p.y + 12);
  ctx.stroke();
  ctx.restore();
}

function drawEraseLabel(b) {
  const c = b.eraser.cast;
  const left = Math.max(0, c.sk.duration - c.t);
  ctx.save();
  ctx.textAlign = "center";
  ctx.font = "700 26px " + FONT;
  ctx.lineWidth = 5;
  ctx.strokeStyle = "rgba(0,0,0,0.7)";
  const txt = "⏱ เวลาถูกตัดทิ้ง  " + left.toFixed(1) + " วิ";
  ctx.strokeText(txt, W / 2, 42);
  ctx.fillStyle = "#ff6b8a";
  ctx.fillText(txt, W / 2, 42);
  ctx.restore();
}

function drawRewindOverlay(b) {
  const r = b.rewind;
  const prog = Math.min(1, r.t / r.dur);
  ctx.save();
  ctx.fillStyle = "rgba(40, 120, 255, 0.20)";
  ctx.fillRect(0, 0, W, H);
  // เส้นสแกนสไตล์วิดีโอเทปกรอกลับ
  ctx.fillStyle = "rgba(160, 210, 255, 0.07)";
  const off = (r.t * 400) % 8;
  for (let y = -8 + off; y < H; y += 8) ctx.fillRect(0, y, W, 2);
  for (let k = 0; k < 3; k++) {
    ctx.fillStyle = "rgba(120, 200, 255, 0.12)";
    ctx.fillRect(0, Math.random() * H, W, 4 + Math.random() * 10);
  }
  // นาฬิกาหมุนทวนเข็ม
  ctx.translate(W / 2, H / 2);
  ctx.globalAlpha = 0.4;
  ctx.strokeStyle = "#d6ecff";
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.arc(0, 0, 110, 0, Math.PI * 2);
  ctx.stroke();
  ctx.lineWidth = 3;
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * 94, Math.sin(a) * 94);
    ctx.lineTo(Math.cos(a) * 106, Math.sin(a) * 106);
    ctx.stroke();
  }
  ctx.lineCap = "round";
  const hand = (ang, len, wd) => {
    ctx.lineWidth = wd;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(Math.cos(ang) * len, Math.sin(ang) * len);
    ctx.stroke();
  };
  hand(-Math.PI / 2 - prog * Math.PI * 12, 90, 4); // เข็มนาที
  hand(-Math.PI / 2 - prog * Math.PI, 60, 7); // เข็มชั่วโมง
  ctx.restore();

  ctx.save();
  ctx.textAlign = "center";
  ctx.font = "700 26px " + FONT;
  ctx.lineWidth = 5;
  ctx.strokeStyle = "rgba(0,0,0,0.7)";
  const txt = "◀◀ ย้อนเวลา  -" + (r.back * prog).toFixed(1) + " วิ";
  ctx.strokeText(txt, W / 2, 42);
  ctx.fillStyle = "#9fd2ff";
  ctx.fillText(txt, W / 2, 42);
  ctx.restore();
}

function drawShards() {
  for (const s of shards) {
    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, s.life / (s.maxLife * 0.6)));
    ctx.translate(s.x, s.y);
    ctx.rotate(s.rot);
    ctx.scale(s.facing, 1);
    if (s.img) {
      ctx.drawImage(s.img, s.sx, s.sy, s.sw, s.sh, -s.tile / 2, -s.tile / 2, s.tile + 1, s.tile + 1);
    } else {
      ctx.fillStyle = s.color;
      ctx.fillRect(-s.tile / 2, -s.tile / 2, s.tile, s.tile);
    }
    ctx.restore();
  }
  ctx.globalAlpha = 1;
}

function render() {
  ctx.save();
  if (shake > 0) ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
  drawArena();
  if (battle) {
    const keys = [selA.value, selB.value];
    // หา key ของตัวละครจาก def (กันกรณีเปลี่ยน select กลางเกม)
    const keyOf = (def) => Object.keys(CHARACTERS).find((k) => CHARACTERS[k] === def) || keys[0];
    if (battle.winner !== null) drawWinnerBanner(battle);
    if (battle.eraser && battle.eraser.cast) drawEraseBackdrop(battle);
    if (battle.slower && battle.slower.cast) drawSlowField(battle);
    drawGhosts();
    // เหม่อลอย = สีจาง/ขาวดำบางส่วน, คนที่ตัดเวลา = ตัวโปร่งแสงเรืองแดง (อยู่นอกความจริง)
    const gray = (on) => { ctx.filter = on ? "grayscale(0.85) brightness(0.85)" : "none"; };
    if (battle.phantom) drawPhantom(battle);
    drawWaves(battle);
    battle.fighters.forEach((f) => {
      if (f.hp <= 0) return;
      gray(f === battle.dazed);
      if (f === battle.eraser) {
        ctx.filter = "drop-shadow(0 0 10px #ff2a55)";
        ctx.globalAlpha = 0.72;
      }
      drawFighter(f, keyOf(f.def));
      ctx.globalAlpha = 1;
      if (f === battle.eraser) ctx.filter = "none";
      if (f.weapon && !f.disarmed) (f.weapon.type === "compass" ? drawCompass(f) : drawKatana(f));
      if (f.cast && f.cast.sk.type === "timeaccel") drawAccelAura(f);
      if (f.cast && f.cast.sk.type === "metavision") drawMetaAura(f);
      if (f.mind > 4 || f.stun > 0 || f === battle.dazed) drawMindAura(f);
    });
    gray(false);
    // ตัวที่ถูกชะลอเวลา: โชว์ป้ายความเร็วเหนือหัว
    if (battle.slower) {
      for (const f of battle.fighters) {
        if (f === battle.slower || f.hp <= 0) continue;
        const sc = battle.timeScaleOf(f);
        if (sc >= 0.95) continue;
        ctx.save();
        ctx.textAlign = "center";
        ctx.font = "700 20px " + FONT;
        ctx.lineWidth = 4;
        ctx.strokeStyle = "rgba(0,0,0,0.7)";
        const txt = "⏳ ช้า x" + sc.toFixed(2);
        ctx.strokeText(txt, f.x, f.y - f.r - 14);
        ctx.fillStyle = "#7ff5dc";
        ctx.fillText(txt, f.x, f.y - f.r - 14);
        ctx.restore();
      }
    }
    // ตัวที่ถูกใบ้สกิล: โชว์ป้ายเวลาเหนือหัว
    for (const f of battle.fighters) {
      if (f.silence <= 0 || f.hp <= 0) continue;
      ctx.save();
      ctx.textAlign = "center";
      ctx.font = "700 20px " + FONT;
      ctx.lineWidth = 4;
      ctx.strokeStyle = "rgba(0,0,0,0.7)";
      const txt = "🚫 ใบ้สกิล " + f.silence.toFixed(1);
      ctx.strokeText(txt, f.x, f.y - f.r - 36);
      ctx.fillStyle = "#ffb3c6";
      ctx.fillText(txt, f.x, f.y - f.r - 36);
      ctx.restore();
    }
    drawShards();
    for (const f of battle.fighters) if (f.hp > 0 && f.cast && f.cast.sk.type === "metavision") drawMetaThreats(f);

    for (const b of battle.balls) drawBall(b);
    for (const p of battle.projectiles) {
      gray(p.owner === battle.dazed);
      if (p.shape === "note") { drawNote(p); gray(false); continue; }
      if (p.shape === "text") { drawWord(p); gray(false); continue; }
      if (p.shape === "soccer") { drawSoccer(p); gray(false); continue; }
      ctx.fillStyle = "#fff6c2";
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = p.color;
      ctx.lineWidth = 3;
      ctx.stroke();
      gray(false);
    }
    for (const p of particles) {
      ctx.globalAlpha = Math.max(0, p.life / 0.5);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - 3, p.y - 3, 6, 6);
    }
    ctx.globalAlpha = 1;
    ctx.textAlign = "center";
    for (const f of floaters) {
      ctx.globalAlpha = Math.min(1, f.life / 0.4);
      ctx.font = "700 " + (f.size || 30) + "px " + FONT;
      ctx.fillStyle = f.color || "#fff";
      ctx.fillText(f.text, f.x, f.y);
    }
    ctx.globalAlpha = 1;
    if (battle.rewind) drawRewindOverlay(battle);
    if (battle.eraser && battle.eraser.cast) drawEraseLabel(battle);
    for (const f of battle.fighters) {
      if (!f.cast || f.hp <= 0) continue;
      const c = f.cast;
      const left = Math.max(0, c.sk.duration - c.t).toFixed(1);
      if (c.sk.type === "timeaccel") drawTimeLabel("⏩ เร่งเวลา x" + (c.sk.rate || 2) + "  " + left + " วิ", "#ffcf5a");
      else if (c.sk.type === "timeslow") drawTimeLabel("⏳ ชะลอเวลา  " + left + " วิ", "#7ff5dc");
      else if (c.sk.type === "metavision") drawTimeLabel("👁 Meta Vision  " + left + " วิ  (หลบได้อีก " + Math.max(0, (c.sk.maxDodges || 0) - (c.dodges || 0)) + ")", "#8fe0ff");
    }
    if (screenFlash > 0) {
      ctx.fillStyle = "rgba(255,255,255," + Math.min(1, screenFlash).toFixed(3) + ")";
      ctx.fillRect(0, 0, W, H);
    }
  } else {
    ctx.fillStyle = "#fff";
    ctx.textAlign = "center";
    ctx.font = "400 24px " + FONT;
    ctx.fillText("เลือกตัวละครแล้วกด \"เริ่มสู้\"", W / 2, H / 2);
  }
  ctx.restore();
}

function loop(ts) {
  const dt = Math.min(0.033, (ts - lastTs) / 1000 || 0) * speedMult;
  lastTs = ts;
  if (battle) {
    // แบ่งก้าวย่อย กันกระสุนเร็วทะลุตัว
    const steps = Math.max(1, Math.ceil(dt / 0.008));
    for (let i = 0; i < steps; i++) {
      battle.update(dt / steps);
      handleEvents(battle.events);
    }
  }
  updateEffects(dt);
  render();
  if (battle) updateHud(battle);
  requestAnimationFrame(loop);
}

// รอฟอนต์โหลดก่อนเริ่มวาด (ไม่เกิน 2 วินาที ถ้าโหลดไม่ได้ก็ใช้ฟอนต์สำรอง)
function loadFonts() {
  if (typeof document === "undefined" || !document.fonts || !document.fonts.load) return Promise.resolve();
  const jobs = Promise.all([
    document.fonts.load('400 20px "Prompt"'),
    document.fonts.load('700 20px "Prompt"'),
  ]).catch(() => {});
  return Promise.race([jobs, new Promise((r) => setTimeout(r, 2000))]);
}

// ---------- ปรับขนาดสนามให้พอดีจอ (ยังเป็นสี่เหลี่ยมจัตุรัส) ----------
// ขนาดคำนวณจากพื้นที่ว่างจริง โดยหักความสูงของแผงข้อมูลผู้เล่นที่อยู่เหนือสนามออกไปด้วย
function fitCanvas() {
  if (typeof window === "undefined" || !window.innerHeight) return;
  const stage = document.getElementById("stage");
  if (!stage || !stage.getBoundingClientRect) return;
  const hudBox = document.getElementById("hud");
  const parent = stage.parentElement;
  const availW = (parent && parent.clientWidth ? parent.clientWidth : window.innerWidth) - 32;
  const top = stage.getBoundingClientRect().top + (window.scrollY || 0);

  let size = Math.floor(Math.max(240, Math.min(W, availW)));
  for (let pass = 0; pass < 3; pass++) {
    stage.style.width = size + "px";
    // ความสูงแผงเปลี่ยนตามความกว้าง จึงวัดซ้ำจนนิ่ง
    const hudH = hudBox && hudBox.offsetHeight ? hudBox.offsetHeight + 10 : 0;
    const availH = window.innerHeight - top - hudH - 48; // 48 = เผื่อบรรทัดเวอร์ชันด้านล่าง
    const next = Math.floor(Math.max(240, Math.min(W, availW, availH)));
    if (next === size) break;
    size = next;
  }
  stage.style.width = size + "px";
}

// ---------- ตรวจว่าไฟล์ JS โหลดครบและเป็นเวอร์ชันเดียวกัน ----------
const EXPECTED_VERSION = 20;
function checkVersions() {
  const el = document.getElementById("ver");
  if (!el || typeof window === "undefined" || !window.BB_FILES) return;
  const stale = ["characters", "battle", "audio"].filter((k) => window.BB_FILES[k] !== EXPECTED_VERSION);
  if (stale.length) {
    el.className = "ver warn";
    el.textContent =
      "ไฟล์เหล่านี้ยังเป็นเวอร์ชันเก่าหรือไม่ได้อัปโหลด: " +
      stale.map((k) => "js/" + k + ".js").join(", ") +
      " — อัปโหลดไฟล์ใหม่ทับ แล้วรีเฟรชแรงๆ (Ctrl+Shift+R)";
  } else {
    el.textContent = "เวอร์ชัน " + EXPECTED_VERSION;
  }
}

fillSelects();
setIdleHud();
updateMuteLabel();
checkVersions();
fitCanvas();
if (typeof window !== "undefined" && window.addEventListener) {
  window.addEventListener("resize", fitCanvas);
  window.addEventListener("orientationchange", () => setTimeout(fitCanvas, 100));
}
Promise.all([loadAllImages(), loadFonts()]).then(() => {
  fitCanvas(); // ฟอนต์โหลดเสร็จอาจทำให้แถบปุ่มสูงขึ้น คำนวณใหม่อีกรอบ
  requestAnimationFrame(loop);
});
