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
      spawnParticles(e.x, e.y, e.sound === "note" ? "#e6b3ff" : "#fff3b0", e.sound === "note" ? 4 : 6, 200);
      if (e.sound === "note") sfx.note();
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

  // แถบเลือดสีขาวที่ค่อยๆ ไหลตามหลังเลือดจริง
  if (battle) {
    for (const f of battle.fighters) {
      if (f.trailHp === undefined) f.trailHp = f.hp;
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
    const col = pass === 0 ? p.color : "#f6e3ff";
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
          if (remain <= 0.05) {
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
    drawWaves(battle);
    battle.fighters.forEach((f) => { if (f.hp > 0) drawFighter(f, keyOf(f.def)); });
    drawShards();

    for (const p of battle.projectiles) {
      if (p.shape === "note") { drawNote(p); continue; }
      ctx.fillStyle = "#fff6c2";
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = p.color;
      ctx.lineWidth = 3;
      ctx.stroke();
    }
    for (const p of particles) {
      ctx.globalAlpha = Math.max(0, p.life / 0.5);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - 3, p.y - 3, 6, 6);
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = "#fff";
    ctx.font = "700 30px " + FONT;
    ctx.textAlign = "center";
    for (const f of floaters) {
      ctx.globalAlpha = Math.min(1, f.life / 0.4);
      ctx.fillText(f.text, f.x, f.y);
    }
    ctx.globalAlpha = 1;
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
const EXPECTED_VERSION = 9;
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
