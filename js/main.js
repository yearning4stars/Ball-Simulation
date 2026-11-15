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
  sel.addEventListener("change", () => { sfx.unlock(); sfx.click(); });
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
      spawnParticles(e.x, e.y, "#fff3b0", 6, 200);
      sfx.shoot();
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
  const barW = (W - 60) / 2; // หลอดสองฝั่งพอดีความกว้างสนาม เว้นขอบ 20 และช่องกลาง 20
  const barH = 38;
  b.fighters.forEach((f, i) => {
    const x = i === 0 ? 20 : W - 20 - barW;
    const y = 20;
    // เลือดฝั่งผู้เล่น 2 ลดจากซ้ายไปขวา (หลอดกลับด้านกัน)
    const rect = (ratio) => {
      const w = barW * ratio;
      return [i === 0 ? x : x + barW - w, y, w, barH];
    };

    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.fillRect(x - 3, y - 3, barW + 6, barH + 6);
    ctx.fillStyle = "#2a2f3f";
    ctx.fillRect(x, y, barW, barH);

    // แถบตามหลัง (สีขาวโปร่ง) แล้วค่อยทับด้วยเลือดจริง
    const trail = f.trailHp === undefined ? f.hp : f.trailHp;
    ctx.fillStyle = "rgba(255,255,255,0.55)";
    ctx.fillRect(...rect(trail / f.maxHp));

    const ratio = f.hp / f.maxHp;
    ctx.fillStyle = ratio > 0.5 ? "#4cd964" : ratio > 0.25 ? "#ffcc00" : "#ff453a";
    ctx.fillRect(...rect(ratio));

    // ตัวเลขเลือดกลางหลอด: 73 / 100
    ctx.font = "700 24px " + FONT;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const label = Math.ceil(f.hp) + " / " + f.maxHp;
    ctx.lineWidth = 4;
    ctx.strokeStyle = "rgba(0,0,0,0.75)";
    ctx.strokeText(label, x + barW / 2, y + barH / 2 + 1);
    ctx.fillStyle = "#fff";
    ctx.fillText(label, x + barW / 2, y + barH / 2 + 1);
    ctx.textBaseline = "alphabetic";

    ctx.font = "700 20px " + FONT;
    ctx.textAlign = i === 0 ? "left" : "right";
    ctx.fillText(f.def.name, i === 0 ? x : x + barW, y + barH + 26);
  });
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
    battle.fighters.forEach((f) => { if (f.hp > 0) drawFighter(f, keyOf(f.def)); });
    drawShards();

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
    ctx.font = "700 30px " + FONT;
    ctx.textAlign = "center";
    for (const f of floaters) {
      ctx.globalAlpha = Math.min(1, f.life / 0.4);
      ctx.fillText(f.text, f.x, f.y);
    }
    ctx.globalAlpha = 1;
    drawHud(battle);
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
function fitCanvas() {
  if (typeof window === "undefined" || !window.innerHeight || !canvas.getBoundingClientRect) return;
  const parent = canvas.parentElement;
  const availW = (parent && parent.clientWidth ? parent.clientWidth : window.innerWidth) - 32;
  // พื้นที่แนวตั้งที่เหลือใต้แถบปุ่ม เผื่อบรรทัดเวอร์ชันด้านล่างไว้ด้วย
  const top = canvas.getBoundingClientRect().top + (window.scrollY || 0);
  const availH = window.innerHeight - top - 48;
  const size = Math.floor(Math.max(240, Math.min(W, availW, availH)));
  canvas.style.width = size + "px";
  canvas.style.height = size + "px";
}

// ---------- ตรวจว่าไฟล์ JS โหลดครบและเป็นเวอร์ชันเดียวกัน ----------
const EXPECTED_VERSION = 5;
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
