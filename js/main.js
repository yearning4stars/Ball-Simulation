// ============================================================
//  ส่วนวาดภาพ + UI
// ============================================================
const canvas = document.getElementById("arena");
const ctx = canvas.getContext("2d");
const W = canvas.width;
const H = canvas.height;

const selA = document.getElementById("charA");
const selB = document.getElementById("charB");
const btnFight = document.getElementById("fight");
const btnSpeed = document.getElementById("speed");

let battle = null;
let particles = [];
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
  battle = new Battle(W, H, CHARACTERS[selA.value], CHARACTERS[selB.value]);
  particles = [];
  floaters = [];
  shake = 0;
}

btnFight.addEventListener("click", startBattle);
btnSpeed.addEventListener("click", () => {
  speedMult = speedMult === 1 ? 2 : speedMult === 2 ? 0.5 : 1;
  btnSpeed.textContent = "ความเร็ว x" + speedMult;
});

// ---------- เอฟเฟกต์ ----------
function spawnParticles(x, y, color, n, power) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const s = (0.3 + Math.random()) * power;
    particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.4 + Math.random() * 0.3, color });
  }
}

function handleEvents(events) {
  for (const e of events) {
    if (e.type === "hit") {
      spawnParticles(e.x, e.y, "#ffd54a", 10, 260);
      floaters.push({ x: e.x, y: e.y - 10, text: "-" + Math.round(e.amount), life: 0.8 });
      shake = Math.max(shake, 6);
    } else if (e.type === "muzzle") {
      spawnParticles(e.x, e.y, "#fff3b0", 6, 200);
    } else if (e.type === "dash") {
      spawnParticles(e.x, e.y, "#ffffff", 12, 220);
    } else if (e.type === "ko") {
      shake = 16;
      for (const f of battle.fighters) if (f.hp <= 0) spawnParticles(f.x, f.y, f.def.color, 40, 420);
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
  for (const f of floaters) {
    f.y -= 40 * dt;
    f.life -= dt;
  }
  floaters = floaters.filter((f) => f.life > 0);
  shake = Math.max(0, shake - 40 * dt);
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
    ctx.drawImage(img, -size / 2, -size / 2, size, size);
    if (f.hitFlash > 0) {
      ctx.globalCompositeOperation = "source-atop";
      ctx.globalAlpha = Math.min(1, f.hitFlash / 0.15) * 0.7;
      ctx.fillStyle = "#fff";
      ctx.fillRect(-size / 2, -size / 2, size, size);
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

function drawHud(b) {
  const barW = 280;
  const barH = 22;
  b.fighters.forEach((f, i) => {
    const x = i === 0 ? 20 : W - 20 - barW;
    const y = 20;
    ctx.fillStyle = "rgba(0,0,0,0.5)";
    ctx.fillRect(x - 3, y - 3, barW + 6, barH + 6);
    ctx.fillStyle = "#2a2f3f";
    ctx.fillRect(x, y, barW, barH);
    const ratio = f.hp / f.maxHp;
    ctx.fillStyle = ratio > 0.5 ? "#4cd964" : ratio > 0.25 ? "#ffcc00" : "#ff453a";
    const w = barW * ratio;
    ctx.fillRect(i === 0 ? x : x + barW - w, y, w, barH);
    ctx.fillStyle = "#fff";
    ctx.font = "bold 15px sans-serif";
    ctx.textAlign = i === 0 ? "left" : "right";
    ctx.fillText(f.def.name, i === 0 ? x : x + barW, y + barH + 20);
  });
}

function drawWinner(b) {
  ctx.fillStyle = "rgba(0,0,0,0.55)";
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "#fff";
  ctx.textAlign = "center";
  ctx.font = "bold 56px sans-serif";
  const text = b.winner === "draw" ? "เสมอ!" : b.fighters[b.winner].def.name + " ชนะ!";
  ctx.fillText(text, W / 2, H / 2);
  ctx.font = "20px sans-serif";
  ctx.fillText("กด \"เริ่มสู้\" เพื่อเล่นอีกครั้ง", W / 2, H / 2 + 44);
}

function render() {
  ctx.save();
  if (shake > 0) ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
  drawArena();
  if (battle) {
    const keys = [selA.value, selB.value];
    // หา key ของตัวละครจาก def (กันกรณีเปลี่ยน select กลางเกม)
    const keyOf = (def) => Object.keys(CHARACTERS).find((k) => CHARACTERS[k] === def) || keys[0];
    battle.fighters.forEach((f) => { if (f.hp > 0 || battle.winner === null) drawFighter(f, keyOf(f.def)); });

    for (const p of battle.projectiles) {
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
    ctx.font = "bold 22px sans-serif";
    ctx.textAlign = "center";
    for (const f of floaters) {
      ctx.globalAlpha = Math.min(1, f.life / 0.4);
      ctx.fillText(f.text, f.x, f.y);
    }
    ctx.globalAlpha = 1;
    drawHud(battle);
    if (battle.winner !== null) drawWinner(battle);
  } else {
    ctx.fillStyle = "#fff";
    ctx.textAlign = "center";
    ctx.font = "24px sans-serif";
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
  requestAnimationFrame(loop);
}

fillSelects();
loadAllImages().then(() => requestAnimationFrame(loop));
