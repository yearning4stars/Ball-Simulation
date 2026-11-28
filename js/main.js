// ============================================================
//  ส่วนวาดภาพ + UI
// ============================================================
const canvas = document.getElementById("arena");
const ctx = canvas.getContext("2d");
const W = canvas.width;
const H = canvas.height;
const FONT = '"Prompt", "Noto Sans Thai", system-ui, sans-serif';

const selMode = document.getElementById("mode");
const selCount = document.getElementById("ffaCount");
const playersBox = document.getElementById("players");
let playerSels = []; // select เลือกตัวละครของผู้เล่นแต่ละคน (จำนวนเปลี่ยนตามโหมด)
let layout = null; // รายละเอียดโหมดที่เลือกอยู่ {mode, n, teams, labels, colors}
const btnFight = document.getElementById("fight");

const sfx = new SoundFX();

let battle = null;
let particles = [];
let shards = []; // เศษภาพของตัวที่แพ้
let floaters = [];
let witherRings = []; // วงระเบิดของ Wither {x,y,r,t,life,blue}
let speedMult = 1;
try { const v = parseFloat(localStorage.getItem("bb_speed")); if ([0.5, 1, 2].includes(v)) speedMult = v; } catch (e) { /* ข้าม */ }
let paused = false; // หยุดเกมชั่วคราวตอนเปิดหน้าต่างตั้งค่าระหว่างสู้
let lastTs = 0;
let shake = 0;
let sonicBlasts = []; // วงระเบิดตอน Sonic Boom โดนเป้า
let screenFlash = 0; // วาบขาวทั้งจอ (ตอนเริ่มตัดเวลา)
let ghosts = []; // ภาพติดตาของคนที่กำลังเร่งเวลา (Johan)
let ghostAcc = 0;
// ความเหนื่อย 0..1 ของตัวละครที่มีสตามินา (ให้ตรงกับ _fatigue ใน battle.js)
function fatigueOf(f) {
  const d = f.def;
  if (!d || !d.staminaMax) return 0;
  const fr = f.stamina / d.staminaMax, tb = d.tiredBelow || 0.35;
  return Math.max(fr >= tb ? 0 : (tb - fr) / tb, f.exhausted ? 0.6 : 0);
}
let metaFx = []; // เอฟเฟกต์ของ Isagi: วงคลื่น / เส้นความเร็ว / ประกาย {k,x,y,t,life,...}
let ballTrail = []; // ภาพติดตาของลูกบอลที่ถูกเตะ {x,y,r,life,meta}
let ballTrailAcc = 0;
let metaDim = 0; // 0..1 ความมืดฟ้ารอบสนามตอน Meta Vision (ค่อยๆ เข้า/ออก)
const charKey = (def) => (def && def.__dummy ? "__dummy" : def && def.__key ? def.__key : Object.keys(CHARACTERS).find((k) => CHARACTERS[k] === def));

// ---------- โหลดภาพ ----------
const fxImages = {}; // fxImages[charKey][fxName] = สไปรต์เอฟเฟกต์ฟัน | null (ไม่มีไฟล์ = วาดรอยฟันด้วยโค้ด)
let slashFxList = []; // รอยฟันที่กำลังแสดง
const images = { __dummy: {} }; // images[charKey][frameName] = HTMLImageElement | null (หุ่นฝึกไม่มีภาพ = วาดเป็นบอล)

function loadAllImages() {
  const jobs = [];
  for (const [key, def] of Object.entries(CHARACTERS)) {
    images[key] = {};
    fxImages[key] = {};
    for (const [name, src] of Object.entries(def.effects || {})) {
      jobs.push(
        new Promise((resolve) => {
          const img = new Image();
          img.onload = () => { fxImages[key][name] = img; resolve(); };
          img.onerror = () => { fxImages[key][name] = null; resolve(); };
          img.src = src;
        })
      );
    }
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
  // ศัตรูโหมดคลื่น: หมวดที่ใช้ PNG (เช่น สกิบิดี้) โหลดรูปของคุณ ไม่มีไฟล์ = ได้บอลสีเปล่า / หมวดวาดด้วยโค้ดไม่ต้องโหลดอะไร
  if (typeof enemyImageList === "function") {
    for (const { key, src } of enemyImageList()) {
      images[key] = {};
      fxImages[key] = {};
      if (!src) continue;
      jobs.push(
        new Promise((resolve) => {
          const img = new Image();
          img.onload = () => { images[key].idle = img; resolve(); };
          img.onerror = () => { images[key].idle = null; resolve(); };
          img.src = src;
        })
      );
    }
  }
  return Promise.all(jobs);
}

// ---------- UI ----------
// ---------- โหมดการเล่น ----------
const TEAM_INFO = [
  { name: "ทีมแดง", color: "#ff6b6b" },
  { name: "ทีมฟ้า", color: "#4db8ff" },
];
const FFA_COLORS = ["#ff6b6b", "#4db8ff", "#6bff9e", "#ffd35a", "#d28bff", "#ff9f5a"];
// โหมดเอาชีวิตรอดเป็นคลื่น: หมวดศัตรู / จำนวนคลื่น (0 = ไม่จำกัด) / จำนวนผู้เล่น
const waveCfg = { cat: DEFAULT_ENEMY_CATEGORY, total: 5, heroes: 2 };
function saveWavePrefs() { try { localStorage.setItem("bb_wave", JSON.stringify(waveCfg)); } catch (e) { /* ข้าม */ } }

// อ่านโหมดที่เลือกอยู่ แล้วบอกว่ามีกี่คน ใครอยู่ทีมไหน ป้ายชื่อ และสีประจำตัว (colors = null: ไม่วาดวงสีใต้ตัวละคร)
function currentLayout() {
  const mode = selMode.value;
  if (mode === "2v2") {
    const teams = [0, 0, 1, 1];
    return {
      mode, n: 4, teams,
      labels: ["ทีมแดง 1", "ทีมแดง 2", "ทีมฟ้า 1", "ทีมฟ้า 2"],
      colors: teams.map((t) => TEAM_INFO[t].color),
    };
  }
  if (mode === "waves") {
    const n = Math.max(1, Math.min(4, waveCfg.heroes));
    const idx = Array.from({ length: n }, (_, i) => i);
    return { mode, n, teams: idx.map(() => 0), labels: idx.map((i) => "ผู้เล่น " + (i + 1)), colors: idx.map((i) => FFA_COLORS[i]) };
  }
  if (mode === "ffa") {
    const n = Math.max(3, Math.min(6, parseInt(selCount.value, 10) || 4));
    const idx = Array.from({ length: n }, (_, i) => i);
    return { mode, n, teams: idx, labels: idx.map((i) => "ผู้เล่น " + (i + 1)), colors: idx.map((i) => FFA_COLORS[i]) };
  }
  return { mode: "1v1", n: 2, teams: [0, 1], labels: ["ผู้เล่น 1", "ผู้เล่น 2"], colors: null };
}

// ---------- เพลงธีมตอนได้เปรียบ (วัดจากเลือดรวมของแต่ละฝั่ง) ----------
let musicState = { team: null, since: 0 };
function teamRatios(b) {
  const sum = {};
  for (const f of b.fighters) {
    const t = sum[f.team] || (sum[f.team] = { hp: 0, max: 0 });
    t.hp += Math.max(0, f.hp);
    t.max += f.maxHp;
  }
  return Object.entries(sum)
    .map(([team, v]) => ({ team: isNaN(+team) ? team : +team, r: v.max ? (v.hp / v.max) * 100 : 0 }))
    .sort((a, c) => c.r - a.r);
}
function updateMusic(b) {
  if (b.winner !== null) { musicState.team = null; return; }
  const cfg = (window.SOUND_CONFIG && SOUND_CONFIG.advantage) || {};
  const lead = cfg.lead !== undefined ? cfg.lead : 25;
  const release = cfg.release !== undefined ? cfg.release : 10;
  const hold = (cfg.minHold !== undefined ? cfg.minHold : 4) * 1000;
  const rs = teamRatios(b);
  if (rs.length < 2) return;
  const gap = rs[0].r - rs[1].r;
  const now = performance.now();
  const ms = musicState;
  if (ms.team !== null) {
    const mine = rs.find((x) => x.team === ms.team);
    const other = rs.filter((x) => x.team !== ms.team)[0];
    const still = mine && other && mine.r - other.r >= release;
    if (!still && now - ms.since >= hold) {
      ms.team = null;
      ms.since = now;
      sfx.musicStop(1.5);
    } else if (!still) {
      return; // ยังไม่ครบเวลาขั้นต่ำ
    }
  }
  if (ms.team === null && gap >= lead && now - ms.since >= 600) {
    ms.team = rs[0].team;
    ms.since = now;
  }
  if (ms.team === null) return;
  // เลือกธีม: ตัวที่เลือดมากที่สุดของฝั่งที่นำ (ถ้ามีธีมของตัวเอง) ไม่งั้นใช้เพลงทั่วไป
  const mates = b.fighters.filter((f) => f.team === ms.team && f.hp > 0).sort((x, y) => y.hp / y.maxHp - x.hp / x.maxHp);
  let pick = null;
  for (const f of mates) {
    const k = "char:" + charKey(f.def);
    if (sfx.hasMusic(k)) { pick = k; break; }
  }
  if (!pick && sfx.hasMusic("advantage")) pick = "advantage";
  if (pick) sfx.musicPlay(pick, 1.2);
}

// ---------- ตั้งค่าเสียง: โหลดไฟล์จาก js/sound-config.js แล้วทับด้วยไฟล์ที่อัปโหลดในเกม ----------
function loadSoundConfig() {
  const cfg = window.SOUND_CONFIG;
  if (cfg) {
    for (const [n, v] of Object.entries(cfg.sfx || {})) if (v && (!Array.isArray(v) || v.length)) sfx.setCustom("sfx:" + n, v, "config");
    const m = cfg.music || {};
    if (m.advantage) sfx.setCustom("music:advantage", m.advantage, "config");
    for (const [k, v] of Object.entries(m.characters || {})) if (v) sfx.setCustom("music:char:" + k, v, "config");
  }
  CustomStore.all().then((rows) => {
    for (const r of rows) sfx.setCustom(r.key, r.blob, "upload", r.name);
  });
}

let soundEl = null;
function closeSoundSettings() {
  if (soundEl) soundEl.remove();
  soundEl = null;
  document.removeEventListener("keydown", soundKey);
}
function soundKey(e) { if (e.key === "Escape") closeSoundSettings(); }

function openSoundSettings() {
  closeSoundSettings();
  const ov = document.createElement("div");
  ov.className = "pk-overlay";
  ov.addEventListener("mousedown", (e) => { if (e.target === ov) closeSoundSettings(); });
  const box = document.createElement("div");
  box.className = "pk-box";
  const head = document.createElement("div");
  head.className = "pk-head";
  head.innerHTML = '<div class="pk-title">ตั้งค่าเสียงและเพลงธีม</div>';
  const x = document.createElement("button");
  x.type = "button";
  x.className = "secondary";
  x.textContent = "✕";
  x.addEventListener("click", closeSoundSettings);
  head.appendChild(x);
  const body = document.createElement("div");
  body.className = "snd-body";

  const note = document.createElement("p");
  note.className = "snd-note";
  note.textContent = "เลือกไฟล์เสียง (mp3 / ogg / wav) จากเครื่องเพื่อใช้แทนเสียงเดิม ไฟล์จะถูกเก็บไว้ในเบราว์เซอร์นี้ " +
    "ถ้าอยากให้ติดไปกับเกมบน GitHub ให้ใส่ไฟล์ในโฟลเดอร์ assets แล้วตั้งค่าใน js/sound-config.js";
  body.appendChild(note);

  const slider = (label, which) => {
    const row = document.createElement("label");
    row.className = "snd-vol";
    const input = document.createElement("input");
    input.type = "range"; input.min = "0"; input.max = "100";
    input.value = String(Math.round((which === "sfx" ? sfx.sfxVol : sfx.musicVol) * 100));
    input.addEventListener("input", () => sfx.setVolume(which, input.value / 100));
    row.append(label + " ", input);
    return row;
  };
  body.appendChild(slider("ความดังเอฟเฟกต์", "sfx"));
  body.appendChild(slider("ความดังเพลงธีม", "music"));

  const file = document.createElement("input");
  file.type = "file"; file.accept = "audio/*"; file.hidden = true;
  document.body.appendChild(file);
  const refreshers = [];

  const addRow = (parent, key, label) => {
    const row = document.createElement("div");
    row.className = "snd-row";
    const nm = document.createElement("span");
    nm.className = "snd-name";
    nm.textContent = label;
    const st = document.createElement("span");
    st.className = "snd-st";
    const pick = document.createElement("button");
    pick.type = "button"; pick.className = "secondary"; pick.textContent = "เลือกไฟล์";
    const play = document.createElement("button");
    play.type = "button"; play.className = "secondary"; play.textContent = "▶"; play.title = "ลองฟัง";
    const clr = document.createElement("button");
    clr.type = "button"; clr.className = "secondary"; clr.textContent = "ล้าง"; clr.title = "กลับไปใช้ค่าเริ่มต้น";
    const refresh = () => {
      const src = sfx.sources[key];
      st.textContent = src ? (src === "upload" ? "[ไฟล์] " : "[ลิงก์] ") + (sfx.names[key] || "") : "ค่าเริ่มต้น";
      st.classList.toggle("on", !!src);
      play.disabled = !src;
      clr.disabled = !src;
    };
    refreshers.push(refresh);
    pick.addEventListener("click", () => {
      file.value = "";
      file.onchange = () => {
        const f = file.files && file.files[0];
        if (!f) return;
        sfx.unlock();
        sfx.setCustom(key, f, "upload", f.name);
        CustomStore.put(key, f, f.name);
        refresh();
        setTimeout(() => sfx.preview(key), 50);
      };
      file.click();
    });
    play.addEventListener("click", () => { sfx.preview(key); });
    clr.addEventListener("click", () => {
      sfx.removeCustom(key);
      CustomStore.del(key);
      // ถ้า sound-config.js มีไฟล์สำหรับชื่อนี้ ให้กลับไปใช้ไฟล์นั้น
      const cfg = window.SOUND_CONFIG || {};
      const n = key.split(":").slice(1).join(":");
      const fromCfg = key.startsWith("sfx:") ? (cfg.sfx || {})[n]
        : n === "advantage" ? (cfg.music || {}).advantage : ((cfg.music || {}).characters || {})[n.replace("char:", "")];
      if (fromCfg) sfx.setCustom(key, fromCfg, "config");
      refresh();
    });
    row.append(nm, st, pick, play, clr);
    parent.appendChild(row);
    refresh();
  };

  const h1 = document.createElement("h3");
  h1.textContent = "เพลงธีมตอนได้เปรียบ (เลือดนำ)";
  body.appendChild(h1);
  const adv = (window.SOUND_CONFIG && SOUND_CONFIG.advantage) || {};
  const hint = document.createElement("p");
  hint.className = "snd-note";
  hint.textContent = "เพลงจะเล่นเมื่อฝั่งใดฝั่งหนึ่งมีเลือดรวมนำอีกฝั่งตั้งแต่ " + (adv.lead !== undefined ? adv.lead : 25) +
    "% ขึ้นไป และเฟดออกเมื่อนำน้อยกว่า " + (adv.release !== undefined ? adv.release : 10) +
    "% (ปรับได้ใน js/sound-config.js) ถ้าตัวละครที่นำอยู่มีธีมของตัวเอง จะเล่นธีมนั้น ไม่งั้นเล่นเพลงทั่วไป";
  body.appendChild(hint);
  addRow(body, "music:advantage", "เพลงทั่วไป (ทุกตัวละคร)");
  for (const k of Object.keys(CHARACTERS)) addRow(body, "music:char:" + k, "ธีม " + CHARACTERS[k].name);

  const h2 = document.createElement("h3");
  h2.textContent = "เสียงเอฟเฟกต์";
  body.appendChild(h2);
  for (const [n, label] of Object.entries(SFX_LABELS)) addRow(body, "sfx:" + n, label);

  box.append(head, body);
  ov.appendChild(box);
  document.body.appendChild(ov);
  soundEl = ov;
  document.addEventListener("keydown", soundKey);
  // ไฟล์จาก IndexedDB อาจโหลดเสร็จทีหลัง: รีเฟรชสถานะสั้นๆ
  setTimeout(() => refreshers.forEach((r) => r()), 400);
}

// ---------- จำตัวที่เลือกไว้ (เปิดหน้าเว็บใหม่แล้วยังอยู่) ----------
function savedPick(i) {
  try {
    const arr = JSON.parse(localStorage.getItem("bb_picks") || "[]");
    return arr[i] && CHARACTERS[arr[i]] ? arr[i] : null;
  } catch (e) { return null; }
}
function savePicks() {
  try {
    const prev = JSON.parse(localStorage.getItem("bb_picks") || "[]");
    playerSels.forEach((sel, i) => { prev[i] = sel.value; });
    localStorage.setItem("bb_picks", JSON.stringify(prev));
  } catch (e) { /* ใช้ไม่ได้ก็ไม่เป็นไร */ }
}

// ---------- หน้าต่างเลือกตัวละคร ----------
let pickerEl = null;
let pickerFor = -1;
let pickerTab = "all";

// หมวดหมู่ตัวละครในหน้าต่างเลือก: เพิ่มตัวละครใหม่ใส่ชื่อ (หรือ key) ใน match ของหมวดที่ต้องการ
// ตัวที่ไม่ตรงหมวดไหนจะไปอยู่หมวด "อื่นๆ" ให้อัตโนมัติ
const CHAR_CATEGORIES = [
  { id: "general", label: "General", match: ["gunner", "dasher"] },
  { id: "aoso", label: "Wheel of Aoso", match: ["funx", "johan", "solar", "hatsu"] },
  { id: "projectmoon", label: "Project Moon", match: ["red mist", "redmist", "the red mist"] },
  { id: "alien", label: "Alien Stage", match: ["luka"] },
  { id: "bluelock", label: "Blue Lock", match: ["isagi"] },
  { id: "rov", label: "RoV", match: ["florentino"] },
  { id: "minecraft", label: "Minecraft", match: ["warden", "wither"] },
];
function categoryOf(key) {
  const hay = (key + " " + (CHARACTERS[key].name || "")).toLowerCase().replace(/[_\-]/g, " ");
  const compact = hay.replace(/\s+/g, "");
  for (const c of CHAR_CATEGORIES) {
    if (c.match.some((m) => hay.includes(m) || compact.includes(m.replace(/\s+/g, "")))) return c.id;
  }
  return "other";
}

function closePicker() {
  if (pickerEl) pickerEl.remove();
  pickerEl = null;
  pickerFor = -1;
  document.removeEventListener("keydown", pickerKey);
}
function pickerKey(e) {
  if (e.key === "Escape") closePicker();
}
function choose(i, key) {
  const sel = playerSels[i];
  if (!sel) return;
  sel.value = key;
  sel.dispatchEvent(new Event("change"));
  sfx.click();
}
function randomizeAll() {
  const keys = Object.keys(CHARACTERS);
  playerSels.forEach((_, i) => choose(i, keys[Math.floor(Math.random() * keys.length)]));
}

// ---------- หน้าต่างเลือกสกิน (เหมือนหน้าต่างเลือกตัวละคร) ----------
function openSkinPicker(i) {
  closePicker();
  const sel = playerSels[i];
  if (!sel) return;
  pickerFor = i;
  const key = sel.value, d = CHARACTERS[key];
  const ov = document.createElement("div");
  ov.className = "pk-overlay";
  ov.addEventListener("mousedown", (e) => { if (e.target === ov) closePicker(); });
  const box = document.createElement("div");
  box.className = "pk-box pk-box-sm";
  box.setAttribute("role", "dialog");
  const head = document.createElement("div");
  head.className = "pk-head";
  const title = document.createElement("div");
  title.className = "pk-title";
  title.textContent = "เลือกสกิน — " + d.name + " (" + layout.labels[i] + ")";
  if (layout.colors) title.style.color = layout.colors[i];
  const x = document.createElement("button");
  x.type = "button"; x.className = "secondary"; x.textContent = "✕"; x.title = "ปิด (Esc)";
  x.addEventListener("click", closePicker);
  head.appendChild(title); head.appendChild(x);
  const body = document.createElement("div");
  body.className = "pk-body";
  const gr = document.createElement("div");
  gr.className = "pk-grid";
  for (const id of skinsOf(key)) {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "pk-card" + (id === sel.skin ? " cur" : "");
    card.style.setProperty("--c", d.color);
    const img = document.createElement("img");
    img.onerror = () => { img.style.visibility = "hidden"; };
    img.src = thumbSrc(key, id); img.alt = SKINS[id].name;
    const nm = document.createElement("div");
    nm.className = "pk-name"; nm.textContent = SKINS[id].name;
    const st = document.createElement("div");
    st.className = "pk-stat"; st.textContent = id === sel.skin ? "กำลังใช้อยู่" : "กดเพื่อใช้สกินนี้";
    card.appendChild(img); card.appendChild(nm); card.appendChild(st);
    card.addEventListener("click", () => { setSkin(i, id); closePicker(); });
    gr.appendChild(card);
  }
  body.appendChild(gr);
  box.appendChild(head); box.appendChild(body);
  ov.appendChild(box);
  document.body.appendChild(ov);
  pickerEl = ov;
  document.addEventListener("keydown", pickerKey);
  const cur = body.querySelector(".cur"); if (cur) cur.focus();
}

function openPicker(i) {
  closePicker();
  pickerFor = i;
  const keys = Object.keys(CHARACTERS);
  const ov = document.createElement("div");
  ov.className = "pk-overlay";
  ov.addEventListener("mousedown", (e) => { if (e.target === ov) closePicker(); });
  const box = document.createElement("div");
  box.className = "pk-box";
  box.setAttribute("role", "dialog");

  const head = document.createElement("div");
  head.className = "pk-head";
  const title = document.createElement("div");
  title.className = "pk-title";
  title.textContent = "เลือกตัวละคร — " + layout.labels[i];
  if (layout.colors) title.style.color = layout.colors[i];
  const rnd = document.createElement("button");
  rnd.type = "button";
  rnd.className = "secondary";
  rnd.textContent = "สุ่ม";
  rnd.addEventListener("click", () => { choose(i, keys[Math.floor(Math.random() * keys.length)]); closePicker(); });
  const x = document.createElement("button");
  x.type = "button";
  x.className = "secondary";
  x.textContent = "✕";
  x.title = "ปิด (Esc)";
  x.addEventListener("click", closePicker);
  head.appendChild(title);
  head.appendChild(rnd);
  head.appendChild(x);

  const cur = playerSels[i].value;
  const makeCard = (k) => {
    const d = CHARACTERS[k];
    const card = document.createElement("button");
    card.type = "button";
    card.className = "pk-card" + (k === cur ? " cur" : "");
    card.style.setProperty("--c", d.color);
    const img = document.createElement("img");
    img.onerror = () => { img.style.visibility = "hidden"; };
    img.style.visibility = "visible";
    img.src = thumbSrc(k, playerSels[i].skin);
    img.alt = d.name;
    const nm = document.createElement("div");
    nm.className = "pk-name";
    nm.textContent = d.name;
    const st = document.createElement("div");
    st.className = "pk-stat";
    st.textContent = "HP " + d.hp + " · เร็ว " + d.speed;
    const sks = document.createElement("div");
    sks.className = "pk-skills";
    for (const sk of skillsOf(d)) {
      const it = document.createElement("div");
      it.className = "pk-sk";
      it.textContent = (sk.name || sk.type) + " · " + sk.cooldown + " วิ";
      sks.appendChild(it);
    }
    card.appendChild(img);
    card.appendChild(nm);
    card.appendChild(st);
    card.appendChild(sks);
    // ป้ายบอกว่าผู้เล่นคนอื่นเลือกตัวนี้อยู่
    const others = playerSels.map((sl, j) => (j !== i && sl.value === k ? j + 1 : null)).filter(Boolean);
    if (others.length && layout.n > 2) {
      const tag = document.createElement("div");
      tag.className = "pk-tag";
      tag.textContent = "ผู้เล่น " + others.join(", ");
      card.appendChild(tag);
    }
    card.addEventListener("click", () => { choose(i, k); closePicker(); });
    return card;
  };

  // จัดตัวละครเข้าหมวด (หมวดที่ว่างจะไม่แสดง)
  const cats = CHAR_CATEGORIES.map((c) => ({ id: c.id, label: c.label, keys: [] }));
  const others = { id: "other", label: "อื่นๆ", keys: [] };
  for (const k of keys) {
    const id = categoryOf(k);
    (cats.find((c) => c.id === id) || others).keys.push(k);
  }
  const groups = cats.concat([others]).filter((c) => c.keys.length);
  if (pickerTab !== "all" && !groups.some((g) => g.id === pickerTab)) pickerTab = "all";

  const tabs = document.createElement("div");
  tabs.className = "pk-tabs";
  const body = document.createElement("div");
  body.className = "pk-body";
  const renderBody = () => {
    body.innerHTML = "";
    for (const g of groups) {
      if (pickerTab !== "all" && pickerTab !== g.id) continue;
      const sec = document.createElement("div");
      sec.className = "pk-cat";
      const h = document.createElement("div");
      h.className = "pk-cat-title";
      h.textContent = g.label + " (" + g.keys.length + ")";
      const gr = document.createElement("div");
      gr.className = "pk-grid";
      for (const k of g.keys) gr.appendChild(makeCard(k));
      sec.appendChild(h);
      sec.appendChild(gr);
      body.appendChild(sec);
    }
    tabs.querySelectorAll("button").forEach((b) => b.classList.toggle("on", b.dataset.id === pickerTab));
  };
  for (const t of [{ id: "all", label: "ทั้งหมด" }].concat(groups)) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "pk-tab";
    b.dataset.id = t.id;
    b.textContent = t.label;
    b.addEventListener("click", () => { pickerTab = t.id; renderBody(); });
    tabs.appendChild(b);
  }
  renderBody();
  box.appendChild(head);
  box.appendChild(tabs);
  box.appendChild(body);
  ov.appendChild(box);
  document.body.appendChild(ov);
  pickerEl = ov;
  document.addEventListener("keydown", pickerKey);
  const curCard = body.querySelector(".cur");
  if (curCard) curCard.focus();
}

// ---------- การ์ดเลือกโหมด ----------
const MODE_DEFS = [
  { id: "1v1", name: "1 ต่อ 1", desc: "ดวลตัวต่อตัว" },
  { id: "2v2", name: "2 ต่อ 2", desc: "ทีมแดง vs ทีมฟ้า" },
  { id: "ffa", name: "ทุกคนสู้กันเอง", desc: "FFA คนสุดท้ายชนะ" },
  { id: "waves", name: "เอาชีวิตรอดเป็นคลื่น", desc: "รับมือศัตรูทีละคลื่น เลือกหมวดศัตรูได้" },
];
const modeDots = (cols) => cols.map((c) => '<i style="background:' + c + '"></i>').join("");
function modePips(id) {
  const r = TEAM_INFO[0].color, b = TEAM_INFO[1].color;
  if (id === "1v1") return modeDots([r]) + "<b>vs</b>" + modeDots([b]);
  if (id === "2v2") return modeDots([r, r]) + "<b>vs</b>" + modeDots([b, b]);
  if (id === "waves") {
    const cat = ENEMY_CATEGORIES[waveCfg.cat] || ENEMY_CATEGORIES[DEFAULT_ENEMY_CATEGORY];
    return modeDots(FFA_COLORS.slice(0, Math.min(3, waveCfg.heroes))) + "<b>vs</b>" + modeDots([cat.roles.walker.color, cat.roles.runner.color, cat.roles.brute.color]);
  }
  return modeDots(FFA_COLORS.slice(0, 5));
}
function saveModePrefs() {
  try { localStorage.setItem("bb_mode", selMode.value); localStorage.setItem("bb_ffa", selCount.value); } catch (e) { /* ข้าม */ }
}
function setMode(id, count) {
  const same = selMode.value === id && (!count || selCount.value === String(count));
  if (count) selCount.value = String(count);
  selMode.value = id;
  saveModePrefs();
  if (same) return;
  selMode.dispatchEvent(new Event("change")); // ตัวจัดการเดิมจะเสียงคลิก + สร้างช่องผู้เล่นใหม่
}
const modeBtn = document.getElementById("modeBtn");
// ปุ่มโหมดในหน้าเตรียมสู้: แสดงโหมดปัจจุบัน กดแล้วเปิดหน้าต่างเลือกโหมด (เหมือนหน้าต่างเลือกตัวละคร)
function buildModeCards() {
  if (!modeBtn) return;
  modeBtn.addEventListener("click", () => { sfx.unlock(); sfx.click(); openModePicker(); });
}
function refreshModeCards() {
  if (!modeBtn) return;
  const m = MODE_DEFS.find((x) => x.id === selMode.value) || MODE_DEFS[0];
  const wc = ENEMY_CATEGORIES[waveCfg.cat] || ENEMY_CATEGORIES[DEFAULT_ENEMY_CATEGORY];
  const extra = m.id === "ffa" ? " · " + selCount.value + " คน" : "";
  const desc = m.id === "waves" ? wc.icon + wc.name + " · " + (waveCfg.total ? waveCfg.total + " คลื่น" : "ไม่จำกัด") + " · " + waveCfg.heroes + " คน" : m.desc;
  modeBtn.innerHTML =
    '<span class="mc-txt"><b>' + m.name + extra + "</b><small>" + desc + "</small></span>" +
    '<span class="mc-pips">' + modePips(m.id) + '</span><span class="mb-chg">เปลี่ยน ▾</span>';
}
function openModePicker() {
  closePicker();
  const ov = document.createElement("div");
  ov.className = "pk-overlay";
  ov.addEventListener("mousedown", (e) => { if (e.target === ov) closePicker(); });
  const box = document.createElement("div");
  box.className = "pk-box pk-box-sm";
  box.setAttribute("role", "dialog");
  const head = document.createElement("div");
  head.className = "pk-head";
  head.innerHTML = '<div class="pk-title">เลือกโหมด</div>';
  const x = document.createElement("button");
  x.type = "button"; x.className = "secondary"; x.textContent = "✕"; x.title = "ปิด (Esc)";
  x.addEventListener("click", closePicker);
  head.appendChild(x);
  const body = document.createElement("div");
  body.className = "pk-body mode-list";
  for (const m of MODE_DEFS) {
    const on = m.id === selMode.value;
    const card = document.createElement("div");
    card.className = "mode-card" + (on ? " on" : "");
    card.innerHTML =
      '<button type="button" class="mc-main">' +
      '<span class="mc-txt"><b>' + m.name + "</b><small>" + m.desc + "</small></span></button>" +
      '<div class="mc-pips">' + modePips(m.id) + "</div>";
    if (m.id === "ffa") {
      const cnt = document.createElement("div");
      cnt.className = "mc-count";
      cnt.innerHTML = "<span>จำนวนผู้เล่น</span>";
      for (const n of [3, 4, 5, 6]) {
        const nb = document.createElement("button");
        nb.type = "button";
        nb.className = "mc-n" + (on && selCount.value === String(n) ? " on" : "");
        nb.textContent = String(n);
        nb.addEventListener("click", (e) => { e.stopPropagation(); sfx.unlock(); setMode("ffa", n); closePicker(); });
        cnt.appendChild(nb);
      }
      card.appendChild(cnt);
    }
    if (m.id === "waves") {
      const applyWave = () => {
        saveWavePrefs();
        const same = selMode.value === "waves";
        selMode.value = "waves";
        saveModePrefs();
        if (same) { battle = null; rebuildPlayers(); refreshModeCards(); } else selMode.dispatchEvent(new Event("change"));
      };
      const mkRow = (label, items, cur, pick) => {
        const row = document.createElement("div");
        row.className = "mc-count";
        row.innerHTML = "<span>" + label + "</span>";
        for (const it of items) {
          const nb = document.createElement("button");
          nb.type = "button";
          nb.className = "mc-n wide" + (on && cur === it.v ? " on" : "");
          nb.textContent = it.t;
          if (it.d) nb.title = it.d;
          nb.addEventListener("click", (e) => { e.stopPropagation(); sfx.unlock(); pick(it.v); applyWave(); closePicker(); });
          row.appendChild(nb);
        }
        card.appendChild(row);
      };
      mkRow("หมวดศัตรู", Object.entries(ENEMY_CATEGORIES).map(([id, c]) => ({ v: id, t: c.icon + " " + c.name, d: c.desc })), waveCfg.cat, (v) => { waveCfg.cat = v; });
      mkRow("จำนวนคลื่น", WAVE_TOTAL_CHOICES.map((v) => ({ v, t: v ? String(v) : "ไม่จำกัด" })), waveCfg.total, (v) => { waveCfg.total = v; });
      mkRow("ผู้เล่น", [1, 2, 3, 4].map((v) => ({ v, t: String(v) })), waveCfg.heroes, (v) => { waveCfg.heroes = v; });
    }
    card.addEventListener("click", () => { sfx.unlock(); setMode(m.id); closePicker(); });
    body.appendChild(card);
  }
  box.append(head, body);
  ov.appendChild(box);
  document.body.appendChild(ov);
  pickerEl = ov;
  document.addEventListener("keydown", pickerKey);
  const cur = body.querySelector(".mode-card.on .mc-main");
  if (cur) cur.focus();
}
// จัดช่องผู้เล่นเป็นกลุ่มทีม: 1v1 = 2 ฝั่ง, 2v2 = ทีมแดง/ฟ้า (มีปุ่มสลับฝั่ง), FFA = กลุ่มเดียว
function assembleTeams(slotEls) {
  const mkTeam = (title, color, els, cls) => {
    const t = document.createElement("div");
    t.className = "team" + (cls ? " " + cls : "");
    t.style.setProperty("--tc", color);
    const h = document.createElement("div");
    h.className = "team-head";
    h.textContent = title;
    t.appendChild(h);
    const row = document.createElement("div");
    row.className = "team-slots";
    els.forEach((el) => row.appendChild(el));
    t.appendChild(row);
    return t;
  };
  if (layout.mode === "waves") {
    const wc = ENEMY_CATEGORIES[waveCfg.cat] || ENEMY_CATEGORIES[DEFAULT_ENEMY_CATEGORY];
    playersBox.appendChild(mkTeam("ผู้เล่น " + layout.n + " คน · รับมือคลื่น " + wc.icon + wc.name + " (" + (waveCfg.total ? waveCfg.total + " คลื่น" : "ไม่จำกัด") + ")", "#7fae5a", slotEls, "ffa"));
    return;
  }
  if (layout.mode === "ffa") {
    playersBox.appendChild(mkTeam("ทุกคนสู้กันเอง · " + layout.n + " คน", "#ff7a59", slotEls, "ffa"));
    return;
  }
  const half = layout.n / 2;
  const names = layout.mode === "2v2" ? [TEAM_INFO[0].name, TEAM_INFO[1].name] : ["ฝั่งซ้าย", "ฝั่งขวา"];
  const vs = document.createElement("div");
  vs.className = "vs-wrap";
  const vt = document.createElement("span");
  vt.className = "vs";
  vt.textContent = "VS";
  const swap = document.createElement("button");
  swap.type = "button";
  swap.className = "secondary swap-btn";
  swap.title = "สลับตัวละครระหว่างสองฝั่ง";
  swap.textContent = "⇄";
  swap.addEventListener("click", () => {
    sfx.unlock();
    for (let k = 0; k < half; k++) {
      const a = playerSels[k], b = playerSels[k + half];
      if (!a || !b) continue;
      [a.value, b.value] = [b.value, a.value];
      [a.skin, b.skin] = [b.skin, a.skin];
      a.dispatchEvent(new Event("change"));
      b.dispatchEvent(new Event("change"));
    }
    sfx.click();
  });
  vs.append(vt, swap);
  playersBox.append(
    mkTeam(names[0], TEAM_INFO[0].color, slotEls.slice(0, half)),
    vs,
    mkTeam(names[1], TEAM_INFO[1].color, slotEls.slice(half)),
  );
}

// สร้างช่องเลือกตัวละครตามจำนวนผู้เล่นของโหมด (เก็บค่าที่เลือกไว้เดิมตามลำดับ)
function rebuildPlayers() {
  const keys = Object.keys(CHARACTERS);
  const old = playerSels.map((sel) => sel.value);
  const oldSkins = playerSels.map((sel) => sel.skin);
  layout = currentLayout();
  refreshModeCards();
  playersBox.innerHTML = "";
  playerSels = [];
  const slotEls = [];
  for (let i = 0; i < layout.n; i++) {
    const label = document.createElement("div");
    label.className = "pslot";
    const lt = document.createElement("span");
    lt.className = "plabel";
    lt.textContent = layout.labels[i];
    if (layout.colors) lt.style.color = layout.colors[i];
    // select ถูกซ่อนไว้เก็บค่าที่เลือก (โค้ดส่วนอื่นอ่านค่าจากตรงนี้) ผู้เล่นเลือกผ่านปุ่ม/หน้าต่างเลือกตัวละครแทน
    const sel = document.createElement("select");
    sel.hidden = true;
    for (const k of keys) {
      const opt = document.createElement("option");
      opt.value = k;
      opt.textContent = CHARACTERS[k].name;
      sel.appendChild(opt);
    }
    sel.value = old[i] && CHARACTERS[old[i]] ? old[i] : savedPick(i) || keys[i % keys.length];
    sel.skin = fixSkin(sel.value, oldSkins[i] || savedSkin(i) || DEFAULT_SKIN);
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "pick";
    btn.title = "กดเพื่อเลือกตัวละคร";
    const thumb = document.createElement("img");
    thumb.alt = "";
    const nm = document.createElement("span");
    btn.appendChild(thumb);
    btn.appendChild(nm);
    const refresh = () => {
      const d = CHARACTERS[sel.value];
      thumb.onerror = () => { thumb.style.visibility = "hidden"; };
      thumb.style.visibility = "visible";
      thumb.src = thumbSrc(sel.value, sel.skin);
      nm.textContent = d.name;
      btn.style.borderColor = d.color;
    };
    refresh();
    // ปุ่มสกิน: เปิดหน้าต่างเลือกสกินของตัวละครในช่องนี้
    const skinBtn = document.createElement("button");
    skinBtn.type = "button";
    skinBtn.className = "secondary skin-btn";
    skinBtn.title = "เลือกสกินตัวละคร";
    const fillSkins = () => {
      sel.skin = fixSkin(sel.value, sel.skin);
      skinBtn.textContent = SKINS[sel.skin].name;
      skinBtn.hidden = skinsOf(sel.value).length < 2;
    };
    fillSkins();
    skinBtn.addEventListener("click", () => { sfx.unlock(); sfx.click(); openSkinPicker(i); });
    sel.addEventListener("change", () => {
      fillSkins();
      refresh();
      savePicks();
      if (view === "setup") refreshInfo();
      if (!battle || battle.winner !== null) setIdleHud();
    });
    btn.addEventListener("click", () => {
      sfx.unlock();
      sfx.click();
      openPicker(i);
    });
    label.appendChild(lt);
    label.appendChild(sel);
    label.appendChild(btn);
    label.appendChild(skinBtn);
    // ปุ่มสุ่มเฉพาะช่องนี้
    const rndBtn = document.createElement("button");
    rndBtn.type = "button";
    rndBtn.className = "secondary rnd-btn";
    rndBtn.title = "สุ่มตัวละครช่องนี้";
    rndBtn.textContent = "สุ่ม";
    rndBtn.addEventListener("click", () => { sfx.unlock(); choose(i, keys[Math.floor(Math.random() * keys.length)]); });
    label.appendChild(rndBtn);
    slotEls.push(label);
    playerSels.push(sel);
  }
  assembleTeams(slotEls);
  buildHudPanels();
  setIdleHud();
  fitCanvas();
  if (view === "setup") refreshInfo();
}

function startBattle() {
  sfx.unlock();
  sfx.musicReset();
  musicState = { team: null, since: 0 };
  sfx.start();
  const defs = playerSels.map((sel) => CHARACTERS[sel.value]);
  battle = new Battle(W, H, defs, Math.random, layout.teams);
  battle.layout = layout;
  waveBanner = null;
  if (layout.mode === "waves") battle.startSurvival(surviveConfig(waveCfg.cat, waveCfg.total, layout.n));
  battle.fighters.forEach((f, i) => { f.trailHp = f.hp; f.skin = (playerSels[i] && playerSels[i].skin) || DEFAULT_SKIN; }); // แถบเลือดที่ค่อยๆ ลดตามหลัง
  particles = [];
  shards = [];
  floaters = [];
  slashFxList = [];
  ghosts = [];
  metaFx = []; ballTrail = []; metaDim = 0;
  sonicBlasts = [];
  shake = 0;
}

// ---------- หน้าจอ: เมนู / เตรียมสู้ / ในเกม ----------
let view = "menu";
function setView(v) {
  view = v;
  document.body.dataset.view = v;
  closePicker();
  paused = false;
  if (v === "setup") {
    rebuildPlayers(); // ให้ภาพย่อตัวละครตรงกับรูปแบบที่เลือกอยู่
    mountLab();
    refreshInfo();
  } else {
    unmountLab();
    if (v === "menu") battle = null;
  }
  requestAnimationFrame(() => { fitCanvas(); fitCanvas(); });
  fitCanvas();
}

function goBattle() {
  closePicker();
  setView("game");
  startBattle();
}
function goSetup() {
  battle = null;
  setIdleHud();
  setView("setup");
}

// ---------- หน้าต่างตั้งค่า (ความเร็ว / เสียง / เพลงธีม) ----------
let settingsEl = null;
function closeSettings() {
  if (settingsEl) settingsEl.remove();
  settingsEl = null;
  document.removeEventListener("keydown", settingsKey);
  paused = false;
}
function settingsKey(e) { if (e.key === "Escape" && !soundEl) closeSettings(); }

function openSettings() {
  closeSettings();
  const ov = document.createElement("div");
  ov.className = "pk-overlay";
  ov.addEventListener("mousedown", (e) => { if (e.target === ov) closeSettings(); });
  const box = document.createElement("div");
  box.className = "pk-box set-box";
  box.setAttribute("role", "dialog");
  const head = document.createElement("div");
  head.className = "pk-head";
  head.innerHTML = '<div class="pk-title">ตั้งค่า</div>';
  const x = document.createElement("button");
  x.type = "button"; x.className = "secondary"; x.textContent = "✕"; x.title = "ปิด (Esc)";
  x.addEventListener("click", closeSettings);
  head.appendChild(x);
  const body = document.createElement("div");
  body.className = "set-body";
  const sec = (t) => {
    const d = document.createElement("div");
    d.className = "set-sec";
    const h = document.createElement("div");
    h.className = "set-sec-t";
    h.textContent = t;
    d.appendChild(h);
    body.appendChild(d);
    return d;
  };
  const secGame = sec("เกม");
  const secSnd = sec("เสียง");

  // ความเร็วเกม
  const spRow = document.createElement("div");
  spRow.className = "set-row";
  spRow.innerHTML = '<span class="set-label">ความเร็วเกม</span>';
  const seg = document.createElement("div");
  seg.className = "seg";
  const spBtns = [[0.5, "ช้า x0.5"], [1, "ปกติ x1"], [2, "เร็ว x2"]].map(([v, label]) => {
    const b = document.createElement("button");
    b.type = "button"; b.className = "secondary"; b.textContent = label;
    b.addEventListener("click", () => {
      sfx.unlock(); sfx.click();
      speedMult = v;
      try { localStorage.setItem("bb_speed", String(v)); } catch (e) { /* ข้าม */ }
      refreshSp();
    });
    seg.appendChild(b);
    return [v, b];
  });
  const refreshSp = () => spBtns.forEach(([v, b]) => b.classList.toggle("on", v === speedMult));
  refreshSp();
  spRow.appendChild(seg);
  secGame.appendChild(spRow);

  // เสียงเปิด/ปิด
  const mRow = document.createElement("div");
  mRow.className = "set-row";
  mRow.innerHTML = '<span class="set-label">เสียง</span>';
  const mBtn = document.createElement("button");
  mBtn.type = "button"; mBtn.className = "secondary";
  const refreshM = () => { mBtn.textContent = sfx.muted ? "เสียง: ปิด (กดเพื่อเปิด)" : "เสียง: เปิด (กดเพื่อปิด)"; };
  refreshM();
  mBtn.addEventListener("click", () => { sfx.unlock(); sfx.toggleMute(); sfx.click(); refreshM(); });
  mRow.appendChild(mBtn);
  secSnd.appendChild(mRow);

  // ความดัง
  const vol = (label, which) => {
    const row = document.createElement("label");
    row.className = "set-row";
    const t = document.createElement("span");
    t.className = "set-label"; t.textContent = label;
    const input = document.createElement("input");
    input.type = "range"; input.min = "0"; input.max = "100";
    input.value = String(Math.round((which === "sfx" ? sfx.sfxVol : sfx.musicVol) * 100));
    const showV = () => { t.textContent = label + " · " + input.value + "%"; };
    showV();
    input.addEventListener("input", () => { sfx.setVolume(which, input.value / 100); showV(); });
    row.append(t, input);
    return row;
  };
  secSnd.appendChild(vol("ความดังเอฟเฟกต์", "sfx"));
  secSnd.appendChild(vol("ความดังเพลงธีม", "music"));

  const custom = document.createElement("button");
  custom.type = "button"; custom.className = "secondary";
  custom.textContent = "ตั้งค่าเสียงและเพลงธีมเอง…";
  custom.addEventListener("click", () => { sfx.unlock(); sfx.click(); openSoundSettings(); });
  secSnd.appendChild(custom);

  box.appendChild(head);
  box.appendChild(body);
  ov.appendChild(box);
  document.body.appendChild(ov);
  settingsEl = ov;
  document.addEventListener("keydown", settingsKey);
  if (view === "game") paused = true; // หยุดเกมไว้ระหว่างเปิดตั้งค่า
}
// ปิดหน้าต่างตั้งค่าเสียงแล้วถ้าตั้งค่าหลักยังเปิดอยู่ให้เกมยังหยุดต่อ

const on = (id, fn) => { const el = document.getElementById(id); if (el) el.addEventListener("click", () => { sfx.unlock(); sfx.click(); fn(); }); };
on("menuPlay", () => setView("setup"));
on("menuSettings", openSettings);
on("backMenu", () => setView("menu"));
on("setupSettings", openSettings);
on("fight", goBattle);
on("randomAll", randomizeAll);
on("gbAgain", startBattle);
on("gbSetup", goSetup);
on("gbMenu", () => { battle = null; setIdleHud(); setView("menu"); });
on("gbSettings", openSettings);
loadSoundConfig();

// ============================================================
//  หน้าเตรียมสู้: รายละเอียดตัวละคร (กราฟค่าพลัง + สกิล) และห้องทดลองสกิล
//  ห้องทดลอง = ใช้เอนจินจริง ให้ตัวละครใช้สกิลที่เลือกใส่หุ่นฝึก (ย้ายแคนวาสสนามมาแสดงในกรอบนี้)
// ============================================================
const TYPE_NAME = {
  projectile: "ยิงกระสุน", dash: "พุ่งชน", shockwave: "คลื่นกระแทก", timeerase: "ตัดเวลา", rewind: "ย้อนเวลา",
  timeaccel: "เร่งเวลา", timeslow: "ชะลอเวลา", ballkick: "เตะบอล", slash: "ฟันรอบตัว", summon: "เรียกเพื่อน",
  triplethreat: "คอมโบ 3 ท่า", duel: "ดวล", metavision: "เห็นอนาคต", squeeze: "ฟื้นเลือด",
};
const STAT_LABELS = ["พลังชีวิต", "ความเร็ว", "ดาเมจต่อครั้ง", "ดาเมจต่อวินาที", "ระยะโจมตี", "ควบคุม"];
const DUMMY_DEF = { __dummy: true, name: "หุ่นฝึก", color: "#8a93b5", hp: 99999, speed: 0, radius: 34, frames: { idle: "" }, skills: [] };

let labMode = false;
let labSel = { slot: 0, skill: 0 }; // skill = -1 -> ใช้ทุกสกิลสลับกัน
let labHome = { x: 0, y: 0 };
let labSqueezeN = 0;
const infoEl = document.getElementById("info");
const cardsEl = document.getElementById("cards");
const cardTabsEl = document.getElementById("cardTabs");
const labWrap = document.getElementById("labWrap");

function skillDamage(sk) {
  return (sk.damage || 0) * (sk.count || 1);
}
// คำนวณค่าพลัง 6 ด้าน (0-1) จากข้อมูลตัวละคร: เป็นค่าประมาณเพื่อเทียบกันคร่าวๆ ไม่ใช่ค่าที่เกมใช้จริง
function statsOf(def) {
  const sks = skillsOf(def);
  const wp = def.weapon;
  let burst = 0, dps = 0, range = 0, ctrl = 0;
  for (const sk of sks) {
    const d = skillDamage(sk);
    burst = Math.max(burst, d);
    dps += d / Math.max(0.5, sk.cooldown || 1);
    let r = 0.5;
    if (sk.type === "projectile") r = 0.85;
    else if (sk.type === "shockwave") r = Math.min(1, (sk.waveRange || 400) / 700);
    else if (sk.type === "dash") r = 0.35;
    else if (sk.type === "slash") r = 0.3;
    else if (sk.type === "ballkick") r = 0.7;
    range = Math.max(range, r);
    let c = 0;
    if (sk.stunNear) c += 0.3;
    if (sk.mindDamage || sk.waveMind) c += 0.3;
    if (sk.knockback > 300) c += 0.15;
    if (sk.slowDuration || sk.bleed || sk.silence || sk.cdPenalty) c += 0.2;
    if (["timeerase", "timeslow", "rewind", "duel", "metavision"].includes(sk.type)) c += 0.45;
    ctrl += c;
  }
  if (wp) {
    burst = Math.max(burst, wp.damage || 0);
    dps += (wp.damage || 0) / Math.max(0.2, wp.hitCooldown || 0.4);
    range = Math.max(range, 0.4);
  }
  return [
    Math.min(1, def.hp / 200),
    Math.min(1, def.speed / 250),
    Math.min(1, burst / 32),
    Math.min(1, dps / 14),
    Math.min(1, range),
    Math.min(1, ctrl),
  ];
}

function drawRadar(cv, vals, color) {
  const dpr = window.devicePixelRatio || 1;
  const S = 230;
  cv.width = S * dpr; cv.height = S * dpr;
  const g = cv.getContext("2d");
  g.scale(dpr, dpr);
  g.clearRect(0, 0, S, S);
  const cx = S / 2, cy = S / 2 + 2, R = 62, n = vals.length;
  const ang = (i) => -Math.PI / 2 + (i / n) * Math.PI * 2;
  g.strokeStyle = "#2d3350"; g.lineWidth = 1;
  for (let ring = 1; ring <= 4; ring++) {
    g.beginPath();
    for (let i = 0; i < n; i++) {
      const x = cx + Math.cos(ang(i)) * R * ring / 4, y = cy + Math.sin(ang(i)) * R * ring / 4;
      i ? g.lineTo(x, y) : g.moveTo(x, y);
    }
    g.closePath(); g.stroke();
  }
  for (let i = 0; i < n; i++) {
    g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(ang(i)) * R, cy + Math.sin(ang(i)) * R); g.stroke();
  }
  g.beginPath();
  vals.forEach((v, i) => {
    const r = R * Math.max(0.04, v);
    const x = cx + Math.cos(ang(i)) * r, y = cy + Math.sin(ang(i)) * r;
    i ? g.lineTo(x, y) : g.moveTo(x, y);
  });
  g.closePath();
  g.fillStyle = color + "55"; g.fill();
  g.strokeStyle = color; g.lineWidth = 2; g.stroke();
  g.fillStyle = color;
  vals.forEach((v, i) => {
    const r = R * Math.max(0.04, v);
    g.beginPath(); g.arc(cx + Math.cos(ang(i)) * r, cy + Math.sin(ang(i)) * r, 2.5, 0, Math.PI * 2); g.fill();
  });
  g.font = "600 10px " + FONT; g.fillStyle = "#c3c9e0"; g.textAlign = "center"; g.textBaseline = "middle";
  STAT_LABELS.forEach((t, i) => {
    const a = ang(i), lx = cx + Math.cos(a) * (R + 22), ly = cy + Math.sin(a) * (R + 14);
    g.fillText(t, lx, ly);
  });
}

function skillDetail(sk) {
  const parts = [];
  const d = skillDamage(sk);
  if (d) {
    let t = "ดาเมจ " + sk.damage + (sk.count > 1 ? " ×" + sk.count : "");
    if (sk.damageFar !== undefined && sk.damageFar !== sk.damage) t += " → " + sk.damageFar + " (ที่ปลายระยะ)";
    parts.push(t);
  }
  if (sk.stunNear) parts.push("สตั้น " + sk.stunNear + " วิ");
  if (sk.mindDamage || sk.waveMind) parts.push("สติ −" + (sk.waveMind || sk.mindDamage));
  if (sk.type === "squeeze") {
    parts.push("ฟื้น " + sk.healPerSec + " HP/วิ (ใช้เมื่อเลือด < " + Math.round((sk.useBelow || 0.85) * 100) + "%)");
    parts.push("โดนดาเมจ = ยกเลิก แฮมสเตอร์หลุดวิ่งหนี ชนศัตรู สติ −" + (sk.hamsterMind || 25));
  }
  if (sk.knockback) parts.push("ผลัก " + sk.knockback);
  if (sk.bleed) parts.push("เลือดไหล " + sk.bleed + " วิ");
  if (sk.slowDuration) parts.push("ชะลอ " + sk.slowDuration + " วิ");
  if (sk.silence) parts.push("ใบ้สกิล " + sk.silence + " วิ");
  if (["timeerase", "timeaccel", "timeslow", "rewind"].includes(sk.type) && sk.duration) parts.push("นาน " + sk.duration + " วิ");
  if (sk.type === "shockwave" && sk.waveArcDeg) parts.push(sk.waveArcDeg >= 360 ? "วงกว้างรอบตัว" : "มุม " + sk.waveArcDeg + "°");
  if (sk.requires === "ego") parts.push("ปลดล็อกเมื่อ E.G.O. ปรากฏ");
  return (sk.desc ? sk.desc + " · " : "") + parts.join(" · ");
}

function refreshInfo() {
  if (!infoEl || !playerSels.length) return;
  infoEl.className = "setup-grid";
  if (labSel.slot >= playerSels.length) labSel = { slot: 0, skill: 0 };
  const defOf = (i) => CHARACTERS[playerSels[i].value];
  if (labSel.skill >= skillsOf(defOf(labSel.slot)).length) labSel.skill = 0;

  cardsEl.innerHTML = "";
  // แท็บเลือกผู้เล่น: แสดงรายละเอียดทีละคน (คนที่เลือกอยู่ = ตัวที่ห้องทดลองใช้ด้วย)
  cardTabsEl.innerHTML = "";
  playerSels.forEach((sel, i) => {
    const tb = document.createElement("button");
    tb.type = "button";
    tb.className = "ctab" + (labSel.slot === i ? " on" : "");
    const col = layout && layout.colors ? layout.colors[i] : i === 0 ? TEAM_INFO[0].color : TEAM_INFO[1].color;
    tb.style.setProperty("--tc", col);
    const im = document.createElement("img");
    im.alt = "";
    im.onerror = () => { im.style.visibility = "hidden"; };
    im.src = thumbSrc(sel.value, sel.skin);
    const tl = document.createElement("span");
    tl.textContent = layout ? layout.labels[i].replace("ผู้เล่น ", "P").replace("ทีมแดง ", "แดง ").replace("ทีมฟ้า ", "ฟ้า ") : "P" + (i + 1);
    tb.append(im, tl);
    tb.title = CHARACTERS[sel.value].name;
    tb.addEventListener("click", () => { if (labSel.slot === i) return; sfx.unlock(); sfx.click(); labSel = { slot: i, skill: 0 }; refreshInfo(); });
    cardTabsEl.appendChild(tb);
  });
  playerSels.forEach((sel, i) => {
    if (i !== labSel.slot) return; // แสดงเฉพาะการ์ดของผู้เล่นที่เลือกอยู่
    const def = CHARACTERS[sel.value];
    const card = document.createElement("div");
    card.className = "card";
    card.style.borderColor = layout && layout.colors ? layout.colors[i] : "#232844";
    const head = document.createElement("div");
    head.className = "card-head";
    const img = document.createElement("img");
    img.onerror = () => { img.style.visibility = "hidden"; };
    img.src = thumbSrc(sel.value, sel.skin); img.alt = "";
    const tt = document.createElement("div");
    tt.innerHTML = '<div class="card-name"></div><div class="card-sub"></div>';
    tt.firstChild.textContent = def.name; tt.firstChild.style.color = def.color;
    tt.lastChild.textContent = (layout ? layout.labels[i] : "") + (CHAR_CATEGORIES ? " · " + (catLabel(sel.value)) : "");
    head.append(img, tt);
    card.appendChild(head);

    const chips = document.createElement("div");
    chips.className = "card-stats";
    for (const t of ["HP " + def.hp, "เร็ว " + def.speed, "ขนาด " + def.radius, def.weapon ? "อาวุธ: " + (def.weapon.name || "หมุนรอบตัว") : null]) {
      if (!t) continue;
      const c = document.createElement("span"); c.className = "chip"; c.textContent = t; chips.appendChild(c);
    }
    card.appendChild(chips);

    const cv = document.createElement("canvas");
    cv.className = "radar";
    card.appendChild(cv);
    drawRadar(cv, statsOf(def), def.color);

    const sec = document.createElement("div");
    sec.className = "card-sec"; sec.textContent = "สกิล (กดเพื่อดูการจำลอง)";
    card.appendChild(sec);
    skillsOf(def).forEach((sk, j) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "skrow" + (labSel.slot === i && labSel.skill === j ? " on" : "");
      const top = document.createElement("div");
      top.className = "sk-top";
      const nm = document.createElement("span");
      nm.textContent = (sk.name || sk.type);
      const cd = document.createElement("span");
      cd.className = "sk-type"; cd.textContent = (TYPE_NAME[sk.type] || sk.type) + " · " + sk.cooldown + " วิ";
      top.append(nm, cd);
      const det = document.createElement("div");
      det.className = "sk-det"; det.textContent = skillDetail(sk);
      b.append(top, det);
      b.addEventListener("click", () => { sfx.unlock(); sfx.click(); labSel = { slot: i, skill: j }; refreshInfo(); if (window.innerWidth <= 1000) setSetupTab("center"); }); // มือถือ: เลือกสกิลแล้วพาไปดูการจำลองเลย
      card.appendChild(b);
    });
    cardsEl.appendChild(card);
  });
  startLab();
}
function catLabel(key) {
  const id = categoryOf(key);
  const c = CHAR_CATEGORIES.find((x) => x.id === id);
  return c ? c.label : "อื่นๆ";
}

function mountLab() {
  labMode = true;
  if (canvas.parentElement !== labWrap) labWrap.appendChild(canvas);
  const pageW = (infoEl.clientWidth || window.innerWidth);
  const wide = window.innerWidth > 1000; // จอกว้าง: 3 ช่องเรียงกันในหน้าเดียว (ซ้าย 270 / ขวา 310)
  const avail = wide ? pageW - 270 - 310 - 20 - 24 : pageW - 36;
  // สนามทดลองเล็กลงให้พอดีจอ: จำกัดตามความสูงจอ (เผื่อแถบบน ชื่อห้อง ปุ่ม และคำอธิบายด้านล่าง) ไม่ให้ต้องเลื่อน
  const byH = (window.innerHeight || 800) - (wide ? 230 : 300);
  labWrap.style.setProperty("--arena", Math.floor(Math.max(220, Math.min(560, avail, byH))) + "px");
}
function unmountLab() {
  labMode = false;
  const stage = document.getElementById("stage");
  const hr = document.getElementById("hudR");
  if (stage && canvas.parentElement !== stage) stage.insertBefore(canvas, hr);
}

function startLab() {
  if (!labMode || typeof Battle === "undefined" || !playerSels.length) return;
  const def = CHARACTERS[playerSels[labSel.slot].value];
  labBattle_new(def);
  const sks = skillsOf(def);
  const sk = labSel.skill >= 0 ? sks[labSel.skill] : null;
  const t = document.getElementById("labTitle");
  if (t) t.textContent = "ห้องทดลองสกิล — " + def.name + " · " + (sk ? (sk.name || sk.type) : "ทุกสกิล");
  const b = document.getElementById("labAll");
  if (b) b.classList.toggle("on", labSel.skill === -1);
}
function labBattle_new(def) {
  battle = new Battle(W, H, [def, DUMMY_DEF], Math.random, [0, 1]);
  battle.layout = { mode: "1v1", n: 2, teams: [0, 1], labels: ["", ""], colors: null };
  const [f, d] = battle.fighters;
  f.skin = playerSels[labSel.slot] ? playerSels[labSel.slot].skin : DEFAULT_SKIN; d.skin = "sprite";
  f.x = W * 0.27; f.y = H * 0.55;
  d.x = W * 0.73; d.y = H * 0.55;
  d.vx = d.vy = 0;
  labHome = { x: d.x, y: d.y };
  particles = []; shards = []; floaters = []; witherRings = []; slashFxList = []; ghosts = []; metaFx = []; ballTrail = []; metaDim = 0; sonicBlasts = []; shake = 0;
}
// ทุกเฟรมในห้องทดลอง: เลือดเต็มเสมอ, หุ่นอยู่กับที่, ให้ใช้เฉพาะสกิลที่เลือก
function labTick(dt) {
  const b = battle;
  if (!b || b.fighters.length < 2) return;
  const [f, d] = b.fighters;
  const wantsHeal = f.skills.some((sk, i) => sk.type === "squeeze" && (labSel.skill === -1 || labSel.skill === i));
  f.hp = wantsHeal ? f.maxHp * 0.5 : f.maxHp; d.hp = d.maxHp;
  d.vx = d.vy = 0;
  const k = Math.min(1, dt * 2.5);
  d.x += (labHome.x - d.x) * k;
  d.y += (labHome.y - d.y) * k;
  if (f.def.energyMax) f.energy = f.def.energyMax;
  if (f.def.blind) f.hear = { x: d.x, y: d.y, age: 0 }; // ห้องทดลอง: ให้ตาบอดได้ยินหุ่นเป้าเสมอ
  // สาธิตแฮมสเตอร์: การบีบครั้งที่ 2, 4, ... จะโดนดาเมจกลางท่า ให้เห็นแฮมสเตอร์หลุดวิ่งหนี
  if (f.cast && f.cast.sk.type === "squeeze" && f.cast.t > 1.2) {
    if (f.cast.demo === undefined) f.cast.demo = (labSqueezeN++ % 2) === 1;
    if (f.cast.demo) b._damage(f, 1, f.x, f.y, false, true);
  }
  f.skills.forEach((sk, i) => {
    const mine = labSel.skill === -1 || labSel.skill === i;
    if (!mine) { f.cds[i] = 9999; return; }
    if (f.cds[i] > Math.min(sk.cooldown, 3.2)) f.cds[i] = Math.min(sk.cooldown, 3.2);
    if (sk.requires === "ego") { f.ego = true; f.egoUsed = true; }
    if (sk.requires === "lunge") f.lunge = true;
  });
}

const setupTabsEl = document.getElementById("setupTabs");
function setSetupTab(t) {
  infoEl.dataset.tab = t;
  if (setupTabsEl) for (const b of setupTabsEl.children) b.classList.toggle("on", b.dataset.tab === t);
  if (t === "center" && labMode) mountLab();
}
if (setupTabsEl) setupTabsEl.addEventListener("click", (e) => {
  const b = e.target.closest("button[data-tab]");
  if (b) { sfx.unlock(); sfx.click(); setSetupTab(b.dataset.tab); }
});
on("labReplay", () => { startLab(); });
on("labAll", () => { labSel = { slot: labSel.slot, skill: labSel.skill === -1 ? 0 : -1 }; refreshInfo(); });
selMode.addEventListener("change", () => {
  sfx.unlock();
  sfx.click();
  battle = null; // เปลี่ยนโหมดแล้วกลับไปหน้าเลือกตัว
  rebuildPlayers();
});
selCount.addEventListener("change", () => {
  sfx.unlock();
  sfx.click();
  battle = null;
  rebuildPlayers();
});

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
  let img = images[key] && (images[key][f.frame] || images[key].idle);
  if (skinKind(f.skin || skinForKey(key)) === "ball") { // สกินบอล: หั่นรูปบอลที่วาดไว้เป็นเศษ
    const cv = document.createElement("canvas");
    cv.width = cv.height = 156;
    const c = cv.getContext("2d");
    c.translate(78, 78);
    drawCodeBall(c, key, f.def, 60, { t: 0.4, hp: Math.ceil(f.hp) });
    img = cv;
  }
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
      spawnParticles(e.x, e.y, e.style === "witherburst" ? "#ffffff" : e.style ? "#2de0d0" : "#ffffff", 14, 260);
      shake = Math.max(shake, e.style === "roar" || e.style === "witherburst" ? 9 : 5);
      if (e.style === "roar" || e.style === "witherburst") screenFlash = Math.max(screenFlash, 0.12);
      sfx.wave();
    } else if (e.type === "hear") {
      // วอร์เดนได้ยินเสียง: วงคลื่นเสียงจางๆ ที่ต้นเสียง + วงหูฟังรอบตัว
      spawnParticles(e.x, e.y, "#2de0d0", 6, 120);
      sonicBlasts.push({ x: e.x, y: e.y, ang: 0, t: 0.35 });
    } else if (e.type === "sonicHit") {
      // Sonic Boom ถึงเป้า: ระเบิดวงคลื่นสีฟ้าเขียว + เศษประกาย + จอสั่น
      spawnParticles(e.x, e.y, "#2de0d0", 30, 420);
      spawnParticles(e.x, e.y, "#ffffff", 12, 300);
      sonicBlasts.push({ x: e.x, y: e.y, ang: e.ang, t: 0 });
      shake = Math.max(shake, 15);
      screenFlash = Math.max(screenFlash, 0.3);
      sfx.hit();
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
      // คลื่นวงฟ้าซ้อน 3 ชั้น + วงตาที่ขยายออกจากตัว + เส้นรัศมีพุ่งออก
      metaRing(e.x, e.y, 260, "143,224,255", 0.7, 5, 0);
      metaRing(e.x, e.y, 190, "79,184,255", 0.6, 3, 0.1);
      metaRing(e.x, e.y, 150, "255,255,255", 0.45, 2, 0.2);
      for (let i = 0; i < 18; i++) metaFx.push({ k: "ray", x: e.x, y: e.y, ang: (i / 18) * Math.PI * 2 + Math.random() * 0.2, len: 60 + Math.random() * 90, r0: 50, col: "143,224,255", t: 0, life: 0.5 });
      floaters.push({ x: e.x, y: e.y - 62, text: "Meta Vision!", life: 1.2, color: "#8fe0ff", size: 30 });
      sfx.meta();
    } else if (e.type === "metaEnd") {
      spawnParticles(e.x, e.y, "#6fd3ff", 12, 220);
      metaFx.push({ k: "in", x: e.x, y: e.y, r: 200, col: "143,224,255", t: 0, life: 0.45 }); // วงหดเข้าหาตัว = สิ้นสุดการมองเห็น
      metaRing(e.x, e.y, 120, "255,214,90", 0.4, 3, 0.25); // วงทองตอนพร้อมเตะสวน
      floaters.push({ x: e.x, y: e.y - 62, text: "เห็นช่องว่างแล้ว!", life: 1.0, color: "#8fe0ff", size: 26 });
    } else if (e.type === "dodge") {
      const f = battle.fighters.find((g) => g.hp > 0 && Math.hypot(g.x - e.x, g.y - e.y) < 1);
      // ภาพติดตา 6 ภาพเรียงถอยหลังตามทิศที่สไลด์ (ใสลงเรื่อยๆ) + เส้นความเร็ว + วงที่จุดเริ่มหลบ
      if (f) for (let i = 1; i <= 6; i++) ghosts.push({ key: charKey(f.def), x: f.x - e.nx * i * 16, y: f.y - e.ny * i * 16, r: f.r, vy: f.vy, facing: f.facing, frame: f.frame, life: 0.2 + i * 0.06, tint: "blue" });
      const da = Math.atan2(e.ny, e.nx);
      for (let i = 0; i < 9; i++) {
        const off = (Math.random() - 0.5) * (f ? f.r * 1.8 : 50);
        metaFx.push({ k: "streak", x: e.x - e.ny * off, y: e.y + e.nx * off, ang: da + Math.PI, len: 70 + Math.random() * 90, col: "180,235,255", t: 0, life: 0.3 });
      }
      metaRing(e.x - e.nx * 24, e.y - e.ny * 24, 90, "143,224,255", 0.35, 3, 0);
      spawnParticles(e.x, e.y, "#6fd3ff", 14, 280);
      floaters.push({ x: e.x, y: e.y - 56, text: "หลบ!", life: 0.8, color: "#8fe0ff", size: 28 });
      sfx.dodge();
    } else if (e.type === "enemySpawn") {
      spawnParticles(e.x, e.y, e.boss ? "#ff6a5a" : "#9fbf7a", e.boss ? 18 : 5, e.boss ? 260 : 110);
      if (e.boss) shake = Math.max(shake, 8);
    } else if (e.type === "waveStart") {
      waveBanner = { text: "คลื่นที่ " + e.n + (e.total ? " / " + e.total : ""), sub: e.boss ? "👑 บอสมาแล้ว!" : "ศัตรู " + e.count + " ตัว", t: 2.2, boss: e.boss };
    } else if (e.type === "waveClear") {
      waveBanner = { text: "เคลียร์คลื่น " + e.n + "!", sub: e.total && e.n >= e.total ? "" : "ฟื้นเลือดเล็กน้อย", t: 2.2, boss: false };
    } else if (e.type === "tired") {
      floaters.push({ x: e.x, y: e.y - 70, text: "เหนื่อยแล้ว…", life: 1.1, color: "#ffd65a", size: 22 });
    } else if (e.type === "exhausted") {
      spawnParticles(e.x, e.y, "#9fd8ff", 14, 160);
      shake = Math.max(shake, 5);
      floaters.push({ x: e.x, y: e.y - 70, text: "หมดแรง!", life: 1.4, color: "#ff7a5a", size: 30 });
    } else if (e.type === "staminaRecover") {
      floaters.push({ x: e.x, y: e.y - 70, text: "ฟื้นแรงแล้ว", life: 1.0, color: "#7dde6a", size: 22 });
    } else if (e.type === "dodgeFail") {
      floaters.push({ x: e.x, y: e.y - 70, text: "แรงไม่พอหลบ!", life: 1.0, color: "#ff9d7a", size: 24 });
    } else if (e.type === "metaAnalyze") {
      // วิเคราะห์ท่าศัตรู: ท่าใหม่ขึ้นข้อความ + วงสแกนฟ้า-ขาว (ท่าที่เคยเห็นแล้วแค่วงเล็ก)
      metaRing(e.x, e.y, e.isNew ? 140 : 90, e.isNew ? "255,255,255" : "143,224,255", 0.4, e.isNew ? 3 : 2, 0.05);
      if (e.isNew) floaters.push({ x: e.x, y: e.y - 82, text: "วิเคราะห์: " + e.text + "  (" + e.level + "/" + e.max + ")", life: 1.3, color: "#c9f1ff", size: 22 });
      else if (e.level >= e.max) floaters.push({ x: e.x, y: e.y - 82, text: "ปรับตัวเต็มที่!", life: 1.0, color: "#ffd65a", size: 24 });
    } else if (e.type === "kick") {
      // ทิศของลูกที่เพิ่งถูกเตะ ใช้พ่นประกายเป็นรูปกรวยไปทางเดียวกับบอล
      let kb = null, kd = 1e9;
      for (const b of battle.balls) { const d = Math.hypot(b.x - e.x, b.y - e.y); if (d < kd) { kd = d; kb = b; } }
      const ka = kb && Math.hypot(kb.vx, kb.vy) > 1 ? Math.atan2(kb.vy, kb.vx) : Math.random() * Math.PI * 2;
      const kcol = e.meta ? "255,214,90" : "190,230,255";
      metaRing(e.x, e.y, e.meta ? 130 : 80, kcol, e.meta ? 0.45 : 0.3, e.meta ? 5 : 3, 0);
      if (e.meta) metaRing(e.x, e.y, 200, "255,255,255", 0.5, 2, 0.06);
      for (let i = 0; i < (e.meta ? 16 : 9); i++) {
        const a = ka + (Math.random() - 0.5) * (e.meta ? 1.1 : 0.8);
        metaFx.push({ k: "streak", x: e.x, y: e.y, ang: a, len: 50 + Math.random() * (e.meta ? 130 : 80), col: kcol, t: 0, life: e.meta ? 0.4 : 0.28, out: true });
      }
      spawnParticles(e.x, e.y, e.meta ? "#ffd65a" : "#ffffff", e.meta ? 22 : 12, e.meta ? 380 : 260);
      shake = Math.max(shake, e.meta ? 9 : 5);
      if (e.volley) {
        // วอลเลย์: วงกระแทกซ้อน 3 ชั้นสีส้ม-ขาว + เส้นพุ่งตามทิศบอลยาวกว่าปกติ + จอสั่นแรง
        metaRing(e.x, e.y, 170, "255,150,60", 0.5, 6, 0);
        metaRing(e.x, e.y, 260, "255,255,255", 0.55, 3, 0.05);
        metaRing(e.x, e.y, 110, "255,214,90", 0.35, 4, 0.1);
        for (let i = 0; i < 14; i++) {
          const a = ka + (Math.random() - 0.5) * 0.5;
          metaFx.push({ k: "streak", x: e.x, y: e.y, ang: a, len: 140 + Math.random() * 200, col: "255,190,90", t: 0, life: 0.45, out: true });
        }
        spawnParticles(e.x, e.y, "#ff9d3c", 20, 460);
        shake = Math.max(shake, 14);
        floaters.push({ x: e.x, y: e.y - 44, text: "Volley!", life: 1.1, color: "#ff9d3c", size: 36 });
      } else if (e.meta) floaters.push({ x: e.x, y: e.y - 40, text: "Meta Kick!", life: 1.0, color: "#ffd65a", size: 30 });
      sfx.kick();
    } else if (e.type === "reflect") {
      spawnParticles(e.x, e.y, "#ffffff", 16, 320);
      floaters.push({ x: e.x, y: e.y - 36, text: "สะท้อน!", life: 0.9, color: "#fff3b0", size: 30 });
      shake = Math.max(shake, 6);
      sfx.deflect();
    } else if (e.type === "flowers") {
      spawnParticles(e.x, e.y, "#ff8fb8", 16, 260);
      floaters.push({ x: e.x, y: e.y - 50, text: "ดอกไม้!", life: 0.9, color: "#ff9fc4", size: 26 });
    } else if (e.type === "flower") {
      spawnParticles(e.x, e.y, "#ff8fb8", 14, 240);
      floaters.push({ x: e.x, y: e.y - 30, text: "พลังงานเต็ม!", life: 0.9, color: "#8fe0ff", size: 24 });
      sfx.note();
    } else if (e.type === "dartStun") {
      floaters.push({ x: e.x, y: e.y - 56, text: "สตัน!", life: 0.8, color: "#ffe27a", size: 26 });
    } else if (e.type === "triple") {
      floaters.push({ x: e.x, y: e.y - 62, text: "Triple Threat!", life: 1.0, color: "#ffd65a", size: 28 });
    } else if (e.type === "summon") {
      screenFlash = 0.1;
      floaters.push({ x: e.x, y: e.y - 62, text: "เรียก " + e.name + "!", life: 1.0, color: e.color || "#ffd65a", size: 28 });
      sfx.dash();
    } else if (e.type === "slashFx") {
      const key = Object.keys(CHARACTERS).find((k) => CHARACTERS[k] === e.owner.def);
      slashFxList.push({ x: e.x, y: e.y, ang: e.ang, arc: e.arc, reach: e.reach, color: e.color, owner: e.owner, img: key && fxImages[key] ? fxImages[key][e.fx] || null : null, t: 0 });
      shake = Math.max(shake, e.arc >= 360 ? 10 : 6);
      sfx.slash();
    } else if (e.type === "ego") {
      screenFlash = 0.3;
      shake = Math.max(shake, 14);
      spawnParticles(e.x, e.y, "#ff2a40", 40, 420);
      floaters.push({ x: e.x, y: e.y - 70, text: "E.G.O. ปรากฏ!", life: 1.6, color: "#ff3b4f", size: 38 });
    } else if (e.type === "evade") {
      floaters.push({ x: e.x, y: e.y - 60, text: "หลบ!", life: 0.7, color: "#9fe8ff", size: 26 });
    } else if (e.type === "block") {
      floaters.push({ x: e.x, y: e.y - 48, text: "ป้องกัน!", life: 0.7, color: "#c3c9dc", size: 24 });
    } else if (e.type === "bleed") {
      if (e.kind === "wither") {
        spawnParticles(e.x, e.y, "#f4f6fb", 10, 160);
        floaters.push({ x: e.x, y: e.y - 56, text: "Wither!", life: 0.8, color: "#ffffff", size: 24 });
      } else {
        spawnParticles(e.x, e.y, "#b0001c", 8, 160);
        floaters.push({ x: e.x, y: e.y - 56, text: "เลือดไหล!", life: 0.8, color: "#ff5468", size: 24 });
      }
    } else if (e.type === "explosion") {
      // ระเบิดกะโหลก Wither: โทนขาว (ฝุ่นกระดูก + วงแหวนขาว) ลูกใหญ่ (blue = ลูกใหญ่) แรงกว่า
      spawnParticles(e.x, e.y, "#ffffff", e.blue ? 24 : 12, e.blue ? 400 : 260);
      spawnParticles(e.x, e.y, "#b9bfd0", e.blue ? 14 : 7, e.blue ? 300 : 200);
      witherRings.push({ x: e.x, y: e.y, r: e.r || 90, t: 0, life: e.blue ? 0.55 : 0.4, blue: !!e.blue });
      shake = Math.max(shake, e.blue ? 10 : 4);
    } else if (e.type === "armorBlock") {
      spawnParticles(e.x, e.y, "#ffffff", 5, 220);
      floaters.push({ x: e.x, y: e.y - 30, text: "กัน!", life: 0.5, color: "#ffffff", size: 20 });
    } else if (e.type === "witherArmor") {
      screenFlash = 0.35;
      shake = Math.max(shake, 16);
      spawnParticles(e.x, e.y, "#ffffff", 44, 480);
      spawnParticles(e.x, e.y, "#b9bfd0", 26, 340);
      witherRings.push({ x: e.x, y: e.y, r: e.r || 300, t: 0, life: 0.8, blue: true, big: true });
      witherRings.push({ x: e.x, y: e.y, r: (e.r || 300) * 0.6, t: -0.12, life: 0.7, blue: false, big: true });
      floaters.push({ x: e.x, y: e.y - 80, text: "เกราะ Wither!", life: 1.6, color: "#ffffff", size: 36 });
    } else if (e.type === "cdBreak") {
      floaters.push({ x: e.x, y: e.y - 70, text: "สกิลถูกบั่นทอน!", life: 1.0, color: "#ff9aa6", size: 26 });
    } else if (e.type === "hoop") {
      hoopFlash = e.scored ? 0.6 : 0;
      if (e.scored) {
        screenFlash = e.three ? 0.12 : 0.05;
        shake = Math.max(shake, e.three ? 9 : 4);
        spawnParticles(e.x, e.y + 20, "#ff8a1f", e.three ? 26 : 14, 320);
      }
      floaters.push({ x: e.x, y: e.y + 60, text: e.scored ? (e.three ? "ลง! 3 แต้ม!" : e.dunk === "dunk" ? "DUNK! 2 แต้ม" : "ลง! 2 แต้ม") : "ชนห่วง!", life: 1.1, color: e.scored ? "#ffb347" : "#b8c0d8", size: e.scored ? 34 : 26 });
    } else if (e.type === "rim") {
      spawnParticles(e.x, e.y, "#ff6a2a", 8, 220);
      shake = Math.max(shake, 3);
      sfx.deflect();
    } else if (e.type === "dunk") {
      spawnParticles(e.x, e.y + 10, "#ffd27a", e.style === "dunk" ? 22 : 10, 300);
      shake = Math.max(shake, e.style === "dunk" ? 8 : 3);
      floaters.push({ x: e.x, y: e.y + 100, text: e.style === "dunk" ? "แดงก!" : "เลย์อัพ!", life: 0.9, color: "#ffb347", size: 30 });
    } else if (e.type === "floorBall") {
      spawnParticles(e.x, e.y + 10, "#c9b79c", 3, 90);
      sfx.kick();
    } else if (e.type === "guestStrike") {
      spawnParticles(e.x, e.y, e.color || "#fff", 22, 320);
      shake = Math.max(shake, 7);
      floaters.push({ x: e.x, y: e.y - 40, text: e.silence ? "ใบ้สกิล!" : e.slow ? "ช้าลง!" : "โจมตี!", life: 0.9, color: e.color || "#fff", size: 26 });
    } else if (e.type === "airborne") {
      spawnParticles(e.x, e.y, "#ffffff", 10, 200);
      floaters.push({ x: e.x, y: e.y - 56, text: "ลอย!", life: 0.8, color: "#ffffff", size: 26 });
    } else if (e.type === "duelCharge") {
      screenFlash = 0.15;
      floaters.push({ x: e.x, y: e.y - 62, text: "Gentleman's Duel!", life: 1.2, color: "#ffd65a", size: 30 });
      sfx.dash();
    } else if (e.type === "duel") {
      spawnParticles(e.x, e.y, "#ffd65a", 26, 340);
      shake = Math.max(shake, 8);
    } else if (e.type === "four") {
      floaters.push({ x: e.x, y: e.y - 64, text: "4! ดาเมจ +" + e.bonus, life: 1.1, color: "#ff8f5a", size: 26 });
      spawnParticles(e.x, e.y, "#ff5a5f", 10, 240);
    } else if (e.type === "hamsterDrop") {
      floaters.push({ x: e.x, y: e.y - 40, text: "แฮมสเตอร์หลุด!", life: 1.0, color: "#ffb0c8", size: 22 });
      spawnParticles(e.x, e.y, "#ffd0e0", 10, 220);
    } else if (e.type === "hamsterBump") {
      spawnParticles(e.x, e.y, "#ffd0e0", 8, 200);
      shake = Math.max(shake, 3);
    } else if (e.type === "squeeze") {
      spawnParticles(e.x, e.y, "#ffd0e0", 5, 140);
    } else if (e.type === "heal") {
      floaters.push({ x: e.x, y: e.y - 50, text: "+" + e.amount, life: 0.8, color: "#6bff9e", size: 24 });
    } else if (e.type === "adStack") {
      floaters.push({ x: e.x, y: e.y - 56, text: "พลังโจมตี +" + e.stacks, life: 1.1, color: "#ffb35a", size: 26 });
    } else if (e.type === "bounce") {
      spawnParticles(e.x, e.y, "#ffffff", 8, 200);
    } else if (e.type === "rewind") {
      screenFlash = 0.35;
      sfx.rewind();
    } else if (e.type === "death") {
      // ตายกลางแมตช์: แตกเป็นเศษภาพ (คนที่เหลือสู้ต่อ)
      const f = e.fighter;
      spawnParticles(f.x, f.y, f.def.color, 40, 420);
      spawnShards(f, charKey(f.def));
      shake = Math.max(shake, 12);
      sfx.breakdown();
    } else if (e.type === "ko") {
      shake = 16;
      sfx.musicStop(1.0);
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
  // เอฟเฟกต์ Isagi: วงคลื่น/เส้นความเร็ว, รอยบอลที่ถูกเตะ, ความมืดฟ้ารอบสนามตอน Meta Vision
  if (waveBanner) { waveBanner.t -= dt; if (waveBanner.t <= 0) waveBanner = null; }
  for (const m of metaFx) m.t += dt;
  metaFx = metaFx.filter((m) => m.t < m.life);
  for (const bt of ballTrail) bt.life -= dt;
  ballTrail = ballTrail.filter((bt) => bt.life > 0);
  let metaOn = false;
  if (battle) {
    ballTrailAcc += dt;
    for (const b of battle.balls) {
      if (b.hot && Math.hypot(b.vx, b.vy) > 60 && ballTrailAcc >= 0.02) ballTrail.push({ x: b.x, y: b.y, r: b.r, life: b.meta ? 0.35 : 0.24, max: b.meta ? 0.35 : 0.24, meta: !!b.meta });
    }
    if (ballTrailAcc >= 0.02) ballTrailAcc = 0;
    for (const f of battle.fighters) {
      if (f.hp > 0 && f.cast && f.cast.sk.type === "metavision") {
        metaOn = true;
        // เลือดน้อย = โหมดตื่นตัว: ประกายทองไหลรอบตัวมากขึ้น (คูลดาวน์เดินเร็วขึ้นตามเลือดที่หาย)
        const lost = 1 - Math.max(0, f.hp) / f.maxHp;
        if (Math.random() < 0.5 + lost * 0.8) {
          const a = Math.random() * Math.PI * 2;
          const rr = f.r * (0.9 + Math.random() * 0.5);
          particles.push({ x: f.x + Math.cos(a) * rr, y: f.y + Math.sin(a) * rr, vx: Math.cos(a) * 30, vy: -60 - Math.random() * 70, life: 0.5 + Math.random() * 0.4, color: lost > 0.55 && Math.random() < lost ? "#ffd65a" : "#8fe0ff" });
        }
      }
    }
  }
  metaDim = Math.max(0, Math.min(1, metaDim + (metaOn ? 3 : -2.5) * dt));
  if (battle) {
    for (const f of battle.fighters) { // เหนื่อย: เหงื่อกระเซ็นรอบตัว ยิ่งเหนื่อยยิ่งถี่
      const fat = fatigueOf(f);
      if (f.hp > 0 && fat > 0 && Math.random() < (0.08 + fat * 0.3) * dt * 60 * 0.5) {
        const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.2;
        particles.push({ x: f.x + Math.cos(a) * f.r * 0.8, y: f.y - f.r * 0.6, vx: Math.cos(a) * 50, vy: Math.sin(a) * 60 - 20, life: 0.5, color: "#9fd8ff" });
      }
    }
  }
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

// เลือกภาพตามสถานะ (เฉพาะตัวละครที่ตั้ง autoPose): ท่าสกิล > หลบ > ป้องกัน > โดนตี > เคลื่อนที่/ยืนนิ่ง และใช้ชุด ego* เมื่อ E.G.O. ปรากฏ
function poseFrame(f, key) {
  const imgs = images[key];
  if (!imgs || !f.def.autoPose) return f.frame;
  let base;
  if (f.cast && f.frame && f.frame !== "idle") base = f.frame;
  else if (f.evadeT > 0) base = "evade";
  else if (f.blockT > 0) base = "block";
  else if (f.hurtT > 0) base = "damaged";
  else base = Math.hypot(f.vx || 0, f.vy || 0) > 60 && !(f.stun > 0) ? "move" : "idle";
  if (f.ego && !base.startsWith("ego") && imgs["ego" + base]) base = "ego" + base;
  if (imgs[base]) return base;
  const plain = base.replace(/^ego/, "");
  return imgs[plain] ? plain : "idle";
}

// ============================================================
//  รูปแบบตัวละคร: 1 = ต้นฉบับ (ภาพ PNG ในโค้ด)  2 = บอลกลมวาดด้วยโค้ด มีสัญลักษณ์เด่นประจำตัวละคร
// ============================================================
// ระบบสกิน: เลือกสกินได้ทีละช่องผู้เล่น (เก็บที่ sel.skin) เพิ่มสกินใหม่ = เพิ่มรายการใน SKINS
//   name = ชื่อในรายการ, kind = "sprite" (ใช้ภาพ PNG ของตัวละคร) | "ball" (วาดด้วยโค้ด)
//   ตัวละครจำกัดสกินเองได้ด้วย CHARACTERS[k].skins = ["sprite", ...]
const SKINS = {
  sprite: { name: "ต้นฉบับ", icon: "🖼️", kind: "sprite" },
  ball: { name: "บอลกลม", icon: "⚽", kind: "ball" },
};
const DEFAULT_SKIN = (() => { try { return localStorage.getItem("bb_style") === "ball" ? "ball" : "sprite"; } catch (e) { return "sprite"; } })();
// ค่าเริ่มต้นทุกตัวมีแค่สกิน "ต้นฉบับ"; ตัวที่มีสกินอื่นต้องระบุ skins ใน characters.js (ตอนนี้มีแค่ Warden ที่มีบอล)
const skinsOf = (key) => ((CHARACTERS[key] && CHARACTERS[key].skins) || ["sprite"]).filter((id) => SKINS[id]);
const fixSkin = (key, id) => (SKINS[id] && skinsOf(key).includes(id) ? id : skinsOf(key)[0] || "sprite");
const skinKind = (id) => (SKINS[id] || SKINS.sprite).kind;
// สกินของตัวละครที่กำลังสู้อยู่ (ใช้กับภาพติดตา/เศษ/เพื่อนที่ถูกเรียกมา ซึ่งไม่มี fighter ติดมาด้วย)
function skinForKey(key) {
  const f = battle && battle.fighters.find((x) => charKey(x.def) === key);
  return fixSkin(key, (f && f.skin) || DEFAULT_SKIN); // ตัวที่ไม่มีสกินบอล (เช่น เพื่อนที่ Solar เรียกมา) ใช้ภาพต้นฉบับเสมอ
}

function shade(hex, amt) { // amt -1..1: มืดลง..สว่างขึ้น
  const n = parseInt(hex.replace("#", ""), 16);
  const c = (v) => Math.max(0, Math.min(255, Math.round(amt >= 0 ? v + (255 - v) * amt : v * (1 + amt))));
  return "rgb(" + c((n >> 16) & 255) + "," + c((n >> 8) & 255) + "," + c(n & 255) + ")";
}

// สัญลักษณ์เด่นของแต่ละตัว (พิกัดสมมติหันขวา ขนาดอิงรัศมี r): body = สีตัว, back = วาดหลังตัว, front = วาดทับตัว,
// eyes = "none" ไม่ใส่ตา หรือสีตา; ตัวที่ไม่ได้ลงทะเบียนจะเป็นบอลเปล่าๆ ใส่ตาอย่างเดียว
// ---------- สไตล์บอลของศัตรูโหมดคลื่น (หมวดซอมบี้ วาดด้วยโค้ดทั้งหมด) คีย์ = "<หมวด>_<role>" ----------
const ZOMBIE_STYLES = {
  zombie_walker: {
    eyes: "none",
    back(c, r, t) { // แขนยื่นไปข้างหน้า ส่ายเล็กน้อย
      c.fillStyle = "#6b9a4a"; c.strokeStyle = "#3f5f2b"; c.lineWidth = r * 0.06;
      for (const dy of [-0.18, 0.3]) {
        const sw = Math.sin(t * 3 + dy * 9) * r * 0.06;
        c.beginPath(); c.roundRect(r * 0.55, r * dy - r * 0.09 + sw, r * 0.85, r * 0.19, r * 0.09); c.fill(); c.stroke();
      }
    },
    front(c, r, t) {
      c.fillStyle = "#e9efd0"; c.beginPath(); c.ellipse(r * 0.2, -r * 0.14, r * 0.2, r * 0.25, 0, 0, Math.PI * 2); c.fill(); // ตาใหญ่ขุ่น
      c.fillStyle = "#b8332b"; c.beginPath(); c.arc(r * 0.26, -r * 0.1, r * 0.07, 0, Math.PI * 2); c.fill();
      c.fillStyle = "#20301a"; c.beginPath(); c.ellipse(r * 0.62, -r * 0.1, r * 0.12, r * 0.14, 0, 0, Math.PI * 2); c.fill(); // ตาเล็กเว้าลึก
      c.strokeStyle = "#20301a"; c.lineWidth = r * 0.05; c.lineJoin = "round"; // ปากฉีกมีฟัน
      c.beginPath(); c.moveTo(r * 0.1, r * 0.3); for (let i = 0; i < 6; i++) c.lineTo(r * (0.1 + i * 0.12), r * (i % 2 ? 0.3 : 0.42)); c.stroke();
      c.strokeStyle = "rgba(40,60,30,0.8)"; c.lineWidth = r * 0.04; // รอยเย็บบนหน้าผาก
      c.beginPath(); c.moveTo(-r * 0.5, -r * 0.62); c.lineTo(-r * 0.1, -r * 0.7); c.stroke();
      for (let i = 0; i < 3; i++) { c.beginPath(); c.moveTo(-r * (0.45 - i * 0.14), -r * (0.7 - i * 0.03)); c.lineTo(-r * (0.45 - i * 0.14) + r * 0.03, -r * (0.55 - i * 0.03)); c.stroke(); }
      c.fillStyle = "rgba(60,30,25,0.55)"; c.fillRect(-r * 0.7, r * 0.1, r * 0.4, r * 0.25); // เสื้อขาด
    },
  },
  zombie_runner: {
    eyes: "none",
    back(c, r, t) { // เส้นลมตอนวิ่ง
      c.strokeStyle = "rgba(220,240,160,0.5)"; c.lineWidth = r * 0.07; c.lineCap = "round";
      for (let i = -1; i <= 1; i++) { const o = ((t * 4 + i) % 1) * r * 0.3; c.beginPath(); c.moveTo(-r * 1.05 - o, i * r * 0.4); c.lineTo(-r * 1.6 - o, i * r * 0.4); c.stroke(); }
    },
    front(c, r, t) {
      c.fillStyle = "#ff4a3a"; // ตาแดงหยีโกรธ
      for (const ex of [0.2, 0.62]) { c.beginPath(); c.moveTo(r * (ex - 0.14), -r * 0.2); c.lineTo(r * (ex + 0.14), -r * 0.08); c.lineTo(r * (ex - 0.08), -r * 0.02); c.closePath(); c.fill(); }
      c.fillStyle = "#1c2a14"; c.beginPath(); c.ellipse(r * 0.45, r * 0.3, r * 0.3, r * 0.17 + Math.sin(t * 20) * r * 0.03, 0, 0, Math.PI * 2); c.fill(); // ปากอ้ากว้าง
      c.fillStyle = "#f2f0d8"; for (let i = 0; i < 4; i++) c.fillRect(r * (0.22 + i * 0.1), r * 0.16, r * 0.06, r * 0.08);
    },
  },
  zombie_spitter: {
    eyes: "none",
    front(c, r, t) {
      c.fillStyle = "#e9f2c8"; c.beginPath(); c.arc(r * 0.25, -r * 0.14, r * 0.17, 0, Math.PI * 2); c.fill();
      c.fillStyle = "#2a5b3a"; c.beginPath(); c.arc(r * 0.3, -r * 0.12, r * 0.07, 0, Math.PI * 2); c.fill();
      c.fillStyle = "#e9f2c8"; c.beginPath(); c.arc(r * 0.66, -r * 0.1, r * 0.13, 0, Math.PI * 2); c.fill();
      c.fillStyle = "#2a5b3a"; c.beginPath(); c.arc(r * 0.7, -r * 0.08, r * 0.06, 0, Math.PI * 2); c.fill();
      const pulse = 0.5 + 0.5 * Math.sin(t * 6); // ถุงกรดที่แก้มพองหายใจ + หยดกรดไหลจากปาก
      c.fillStyle = "rgba(150,255,80," + (0.55 + pulse * 0.3).toFixed(2) + ")";
      c.beginPath(); c.arc(-r * 0.3, r * 0.3, r * (0.2 + pulse * 0.05), 0, Math.PI * 2); c.fill();
      c.beginPath(); c.arc(r * 0.15, r * 0.52, r * 0.1, 0, Math.PI * 2); c.fill();
      c.fillStyle = "#1c3a22"; c.beginPath(); c.ellipse(r * 0.45, r * 0.32, r * 0.2, r * 0.12, 0, 0, Math.PI * 2); c.fill();
      c.fillStyle = "rgba(150,255,80,0.9)"; c.fillRect(r * 0.42, r * 0.38, r * 0.06, r * (0.2 + pulse * 0.15));
    },
  },
  zombie_brute: {
    eyes: "none",
    rim: "#24361a",
    back(c, r, t) { // แขนใหญ่ทั้งสองข้าง
      c.fillStyle = "#4e6e35"; c.strokeStyle = "#24361a"; c.lineWidth = r * 0.05;
      for (const dy of [-0.3, 0.45]) { c.beginPath(); c.roundRect(r * 0.5, r * dy - r * 0.16, r * 0.95, r * 0.32, r * 0.14); c.fill(); c.stroke(); }
    },
    front(c, r, t) {
      c.fillStyle = "#d9d3b0"; // หนามกระดูกที่หัว
      for (let i = -2; i <= 2; i++) { c.beginPath(); c.moveTo(r * i * 0.26 - r * 0.09, -r * 0.88); c.lineTo(r * i * 0.26, -r * 1.2 - Math.abs(i) * -r * 0.04); c.lineTo(r * i * 0.26 + r * 0.09, -r * 0.88); c.closePath(); c.fill(); }
      c.fillStyle = "#f4efd2"; c.beginPath(); c.ellipse(r * 0.38, -r * 0.14, r * 0.3, r * 0.3, 0, 0, Math.PI * 2); c.fill(); // ตาเดียวใหญ่
      c.fillStyle = "#c0261c"; c.beginPath(); c.arc(r * 0.45, -r * 0.1, r * 0.13, 0, Math.PI * 2); c.fill();
      c.fillStyle = "#1c1208"; c.beginPath(); c.arc(r * 0.47, -r * 0.1, r * 0.06, 0, Math.PI * 2); c.fill();
      c.strokeStyle = "#1c2a12"; c.lineWidth = r * 0.07; c.lineCap = "round"; // คิ้วขมวด + ปากเหยียด
      c.beginPath(); c.moveTo(r * 0.05, -r * 0.5); c.lineTo(r * 0.7, -r * 0.34); c.stroke();
      c.beginPath(); c.moveTo(-r * 0.1, r * 0.42); c.lineTo(r * 0.7, r * 0.38); c.stroke();
      c.fillStyle = "#f2f0d8"; for (let i = 0; i < 5; i++) c.fillRect(r * (0.02 + i * 0.14), r * 0.42, r * 0.07, r * 0.13);
      c.strokeStyle = "rgba(30,20,10,0.7)"; c.lineWidth = r * 0.04; // แผลเป็นข้ามตัว
      c.beginPath(); c.moveTo(-r * 0.6, -r * 0.1); c.lineTo(-r * 0.2, r * 0.3); c.stroke();
    },
  },
};

const BALL_STYLES = {
  ...ZOMBIE_STYLES,
  gunner: {
    front(c, r) {
      c.fillStyle = "#2b3350"; // หมวกแก๊ป
      c.beginPath(); c.arc(0, -r * 0.1, r * 0.98, Math.PI * 1.08, Math.PI * 1.92); c.closePath(); c.fill();
      c.fillRect(r * 0.2, -r * 0.62, r * 0.85, r * 0.16);
      c.fillStyle = "#3a4256"; c.fillRect(r * 0.55, r * 0.12, r * 0.8, r * 0.2); // ปืนพก
      c.fillRect(r * 0.55, r * 0.2, r * 0.2, r * 0.38);
      c.fillStyle = "#ffd54a"; c.fillRect(r * 1.3, r * 0.15, r * 0.1, r * 0.14);
    },
  },
  dasher: {
    back(c, r, t) {
      c.strokeStyle = "rgba(255,255,255,0.55)"; c.lineWidth = r * 0.07; c.lineCap = "round";
      for (let i = -1; i <= 1; i++) {
        const o = ((t * 3 + i) % 1) * r * 0.25;
        c.beginPath(); c.moveTo(-r * 1.05 - o, i * r * 0.42); c.lineTo(-r * 1.55 - o, i * r * 0.42); c.stroke();
      }
    },
    front(c, r, t) {
      c.fillStyle = "#fff"; // ผ้าคาดหัว + ชายปลิว
      c.fillRect(-r * 0.97, -r * 0.5, r * 1.94, r * 0.17);
      const w = Math.sin(t * 14) * r * 0.1;
      c.beginPath(); c.moveTo(-r * 0.95, -r * 0.46); c.lineTo(-r * 1.5, -r * 0.62 + w); c.lineTo(-r * 1.4, -r * 0.4 + w); c.closePath(); c.fill();
    },
  },
  singer: {
    front(c, r, t, o) {
      c.strokeStyle = "#2a2f45"; c.lineWidth = r * 0.12; c.lineCap = "round"; // หูฟัง
      c.beginPath(); c.arc(0, -r * 0.05, r * 0.98, Math.PI * 1.05, Math.PI * 1.95); c.stroke();
      c.fillStyle = "#2a2f45";
      c.beginPath(); c.ellipse(-r * 0.95, -r * 0.1, r * 0.17, r * 0.3, 0, 0, Math.PI * 2); c.fill();
      c.beginPath(); c.ellipse(r * 0.95, -r * 0.1, r * 0.17, r * 0.3, 0, 0, Math.PI * 2); c.fill();
      c.fillStyle = "#fff"; c.font = "700 " + Math.round(r * 0.6) + "px " + FONT; c.textAlign = "center"; c.textBaseline = "middle";
      c.save(); c.scale((o && o.facing) || 1, 1); c.fillText("♪", -r * 0.1 * ((o && o.facing) || 1), r * 0.55); c.restore();
    },
  },
  funx: {
    front(c, r, t) {
      c.fillStyle = "#d63a4a"; // ผ้าพันคอแดง
      c.fillRect(-r * 0.9, r * 0.38, r * 1.8, r * 0.2);
      c.beginPath(); c.moveTo(-r * 0.85, r * 0.5); c.lineTo(-r * 1.4, r * 0.4 + Math.sin(t * 9) * r * 0.1); c.lineTo(-r * 1.3, r * 0.65); c.closePath(); c.fill();
      clockIcon(c, -r * 0.05, -r * 0.62, r * 0.27, t);
    },
  },
  johan: {
    front(c, r, t) {
      hourglassIcon(c, 0, -r * 0.8, r * 0.22, t);
    },
  },
  isagi: {
    eyes: "#3fa8ff",
    front(c, r) {
      c.strokeStyle = "#3fa8ff"; c.lineWidth = r * 0.07; // วงตา Meta Vision
      c.beginPath(); c.arc(r * 0.45, -r * 0.12, r * 0.3, 0, Math.PI * 2); c.stroke();
      const bx = r * 0.55, by = r * 0.68, br = r * 0.3; // ลูกฟุตบอลข้างเท้า
      c.fillStyle = "#fff"; c.beginPath(); c.arc(bx, by, br, 0, Math.PI * 2); c.fill();
      c.fillStyle = "#222"; c.beginPath();
      for (let i = 0; i < 5; i++) { const a = -Math.PI / 2 + i * Math.PI * 0.4; c.lineTo(bx + Math.cos(a) * br * 0.5, by + Math.sin(a) * br * 0.5); }
      c.closePath(); c.fill();
    },
  },
  florentino: {
    eyes: "none", // ไม่มีตา
    // ดีไซน์ของเราเอง: สุภาพบุรุษนักดวล — ผ้าคลุมแดง กุหลาบที่อก ดาบเรเพียร์ กลีบกุหลาบลอยรอบตัว (อิงชุดสกิลในเกมนี้: ปักดอกไม้ / รำดาบ)
    back(c, r, t) {
      c.fillStyle = "#9c2236"; // ผ้าคลุมด้านหลัง พลิ้วเบาๆ
      const w = Math.sin(t * 3) * r * 0.08;
      c.beginPath(); c.moveTo(-r * 0.7, -r * 0.5); c.quadraticCurveTo(-r * 1.5 + w, r * 0.2, -r * 1.15 + w, r * 1.0);
      c.lineTo(-r * 0.2, r * 0.7); c.closePath(); c.fill();
      c.strokeStyle = "#e8c15a"; c.lineWidth = r * 0.04; c.stroke();
    },
    front(c, r, t, o) {
      t = t || 0; o = o || {};
      // ผมสีชมพู: ปอยผมปัดไปด้านหน้าบนหัว
      c.save(); c.beginPath(); c.arc(0, 0, r * 0.98, 0, Math.PI * 2); c.clip();
      c.fillStyle = "#ff7fb8";
      c.beginPath(); c.moveTo(-r * 1.1, -r * 0.1); c.quadraticCurveTo(-r * 0.9, -r * 1.1, r * 0.2, -r * 1.05);
      c.quadraticCurveTo(r * 0.9, -r * 0.95, r * 1.05, -r * 0.35); c.quadraticCurveTo(r * 0.45, -r * 0.7, r * 0.1, -r * 0.45);
      c.quadraticCurveTo(-r * 0.3, -r * 0.2, -r * 0.55, -r * 0.5); c.quadraticCurveTo(-r * 0.7, -r * 0.1, -r * 1.1, -r * 0.1); c.closePath(); c.fill();
      c.strokeStyle = "#ffc2dd"; c.lineWidth = r * 0.04; c.beginPath(); c.moveTo(-r * 0.4, -r * 0.85); c.quadraticCurveTo(r * 0.2, -r * 0.95, r * 0.7, -r * 0.55); c.stroke();
      c.restore();
      c.fillStyle = "#d63a4a"; // กุหลาบติดที่อก (ไม่มีหมวด)
      c.beginPath(); c.arc(r * 0.3, r * 0.5, r * 0.13, 0, Math.PI * 2); c.fill();
      c.fillStyle = "#8f1f2e"; c.beginPath(); c.arc(r * 0.3, r * 0.5, r * 0.06, 0, Math.PI * 2); c.fill();
      // ปกเสื้อขาว
      c.fillStyle = "#f2eee8";
      c.beginPath(); c.moveTo(-r * 0.25, r * 0.62); c.lineTo(0, r * 0.95); c.lineTo(r * 0.25, r * 0.62); c.closePath(); c.fill();
      // ดาบเรเพียร์ ด้ามทอง (ฟันแทงเมื่อกำลังร่ายสกิล)
      c.save(); c.translate(r * 0.55, r * 0.5);
      c.rotate(o.casting ? -0.25 + Math.sin(t * 22) * 0.9 : -0.25); // ท่าปาดอก: ฟาดดาบเป็นวง
      c.strokeStyle = "#e8e8f0"; c.lineWidth = r * 0.05; c.lineCap = "round";
      c.beginPath(); c.moveTo(r * 0.12, 0); c.lineTo(r * 1.0, 0); c.stroke();
      c.strokeStyle = "#e8c15a"; c.lineWidth = r * 0.07;
      c.beginPath(); c.moveTo(r * 0.12, -r * 0.14); c.lineTo(r * 0.12, r * 0.14); c.stroke();
      c.restore();
      // ท่าปาดอก: เส้นปาดเป็นเสี้ยวพระจันทร์ + กลีบกุหลาบกระเด็นออกตามแนวปาด
      if (o.casting) {
        const ph = (t * 5) % 1;
        c.save(); c.globalAlpha = 0.85 * (1 - ph * 0.5);
        c.strokeStyle = "#ff9ac8"; c.lineCap = "round"; c.lineWidth = r * (0.22 - 0.12 * ph);
        c.beginPath(); c.arc(0, 0, r * (1.25 + ph * 0.45), -1.0 + ph * 0.3, 1.0 + ph * 0.3); c.stroke();
        c.strokeStyle = "#fff"; c.lineWidth = r * 0.05;
        c.beginPath(); c.arc(0, 0, r * (1.25 + ph * 0.45), -0.8 + ph * 0.3, 0.8 + ph * 0.3); c.stroke();
        c.fillStyle = "#d63a4a";
        for (let i = 0; i < 5; i++) {
          const a = -0.9 + i * 0.45 + ph * 0.3, d = r * (1.4 + ph * 0.7 + i * 0.05);
          c.beginPath(); c.ellipse(Math.cos(a) * d, Math.sin(a) * d, r * 0.1, r * 0.05, a, 0, Math.PI * 2); c.fill();
        }
        c.restore();
      }
      // กลีบกุหลาบลอยรอบตัว
      c.fillStyle = "rgba(214,58,74,0.85)";
      for (let i = 0; i < 4; i++) {
        const a = t * 1.3 + i * 1.57, rr = r * (1.12 + 0.08 * Math.sin(t * 2 + i));
        c.save(); c.translate(Math.cos(a) * rr, Math.sin(a) * rr * 0.8); c.rotate(a * 2);
        c.beginPath(); c.ellipse(0, 0, r * 0.1, r * 0.05, 0, 0, Math.PI * 2); c.fill(); c.restore();
      }
    },
  },
  solar: {
    body: "#ffb82e",
    back(c, r, t) {
      c.fillStyle = "#ffe27a";
      for (let i = 0; i < 12; i++) {
        c.save(); c.rotate(t * 0.8 + (i * Math.PI) / 6);
        c.beginPath(); c.moveTo(r * 0.9, -r * 0.14); c.lineTo(r * 1.4, 0); c.lineTo(r * 0.9, r * 0.14); c.closePath(); c.fill();
        c.restore();
      }
    },
  },
  redmist: {
    body: "#3a0d14",
    eyes: "#ff2d3d",
    back(c, r, t) {
      for (let i = 0; i < 5; i++) {
        const a = t * 0.9 + i * 1.26;
        c.fillStyle = "rgba(220, 30, 50, 0.35)";
        c.beginPath(); c.arc(Math.cos(a) * r * 1.0, Math.sin(a) * r * 0.9, r * 0.32, 0, Math.PI * 2); c.fill();
      }
    },
    front(c, r) {
      c.fillStyle = "#c81e32"; // ปกเสื้อโค้ทแดง
      c.beginPath(); c.moveTo(-r * 0.45, r * 0.4); c.lineTo(0, r * 0.95); c.lineTo(r * 0.45, r * 0.4); c.lineTo(0, r * 0.55); c.closePath(); c.fill();
    },
  },
  warden: {
    // ลักษณะเด่นของ Warden: หัวมืดไม่มีตา มีปากโหวงขอบพิกเซลเรืองฟ้า, เขาบนหัวสองข้าง, กลางอกเป็นกลุ่มคริสตัล Sculk เรืองแสงบนซี่โครงเขียวเข้ม,
    // แผงข้างลำตัวมีลายเขียว  (เขา = หนวด Sculk โค้งบนหัวเหมือนต้นฉบับ)
    body: "#0d2532",
    rim: "#2de0d0",
    eyes: "none",
    back(c, r, t, o) {
      const hornT = (o && o.horn) || 0; // >0 = เพิ่งได้ยินเสียง เขากระตุกเอนไปทางเสียง
      // เขา (horn) บนหัวสองข้าง: ไม้เลื้อย Sculk พิกเซลโค้งชี้ขึ้น-ออก มีกิ่งแยก ปลายสว่าง
      const lerp = (a, b, k) => Math.round(a + (b - a) * k);
      for (const sx of [-1, 1]) {
        const sway = Math.sin(t * 2.4 + sx) * r * 0.1 + hornT * r * (0.32 + 0.12 * Math.sin(t * 38 + sx * 2)); // แกว่งเบาๆ + กระตุกไปข้างหน้าเมื่อได้ยิน
        const pos = (k) => [sx * r * (0.5 + 0.85 * k - 0.15 * k * k) + sway * k * k * 2.2, -r * (0.9 + 0.62 * k - 0.1 * k * k)];
        const N = 9;
        for (let i = 0; i <= N; i++) {
          const k = i / N, [x, y] = pos(k);
          const sz = r * (0.28 - 0.12 * k);
          c.fillStyle = "rgb(" + lerp(18, 80, k) + "," + lerp(84, 214, k) + "," + lerp(96, 206, k) + ")";
          c.fillRect(x - sz / 2, y - sz / 2, sz, sz);
        }
        for (const [kb, dir, len] of [[0.35, 1, 3], [0.62, -1, 2], [0.85, 1, 2]]) { // กิ่งแยก
          const [bx, by] = pos(kb);
          for (let j = 1; j <= len; j++) {
            const sz = r * (0.17 - j * 0.02);
            c.fillStyle = j === len ? "#7ff0e4" : "#2a9aa6";
            c.fillRect(bx + sx * dir * j * r * 0.14 - sz / 2, by - j * r * 0.12 - sz / 2, sz, sz);
          }
        }
        const [tx, ty] = pos(1);
        c.save(); c.shadowColor = "#2de0d0"; c.shadowBlur = r * 0.25; c.fillStyle = "#b9fff6";
        c.fillRect(tx - r * 0.06, ty - r * 0.06, r * 0.12, r * 0.12); c.restore();
      }
    },
    front(c, r, t, o) {
      c.save();
      c.beginPath(); c.arc(0, 0, r * 0.96, 0, Math.PI * 2); c.clip();
      // หัว: แผ่นมืดด้านบน มีจุดเรืองฟ้าเล็กๆ ที่กระหม่อม
      c.fillStyle = "#08171f"; c.fillRect(-r, -r, r * 2, r * 1.02);
      c.fillStyle = "#2de0d0";
      for (const [dx, dy] of [[-0.35, -0.82], [0.1, -0.88], [0.45, -0.76], [-0.05, -0.7]]) c.fillRect(dx * r, dy * r, r * 0.07, r * 0.07);
      // ปากโหวงขอบพิกเซลฟ้า (โค้งคว่ำเหมือนร้องไห้)
      const q = r * 0.085;
      c.fillStyle = "#04090d";
      c.beginPath(); c.ellipse(0, -r * 0.3, r * 0.55, r * 0.3, 0, Math.PI, 0); c.lineTo(r * 0.55, -r * 0.1); c.lineTo(-r * 0.55, -r * 0.1); c.closePath(); c.fill();
      c.fillStyle = "#1fb8c8";
      for (let a = Math.PI; a <= Math.PI * 2 + 0.01; a += 0.22) {
        c.fillRect(Math.cos(a) * r * 0.6 - q / 2, -r * 0.3 + Math.sin(a) * r * 0.36 - q / 2, q, q);
      }
      c.fillRect(-r * 0.62, -r * 0.3, q, r * 0.22); c.fillRect(r * 0.56, -r * 0.3, q, r * 0.22);
      c.fillRect(-r * 0.5, -r * 0.1, r * 0.35, q * 0.8); c.fillRect(r * 0.15, -r * 0.1, r * 0.35, q * 0.8);
      // แผงข้างลำตัว: เขียวเข้มมีลายเฉียง
      for (const sx of [-1, 1]) {
        c.fillStyle = "#0b2a30"; c.fillRect(sx > 0 ? r * 0.58 : -r, 0.0, r * 0.42, r);
        c.fillStyle = "#2f8f72";
        for (let i = 0; i < 3; i++) {
          c.save(); c.translate(sx * r * (0.72 + i * 0.1), r * 0.35); c.rotate(sx * 0.25);
          c.fillRect(-q * 0.4, 0, q * 0.8, r * 0.4); c.restore();
        }
      }
      // กลางอก: ซี่โครงเขียวเข้ม + คริสตัล Sculk เรืองแสง
      c.fillStyle = "#1f6b5e";
      for (let i = 0; i < 3; i++) { c.fillRect(-r * 0.5, r * (0.08 + i * 0.2), r * 0.3, r * 0.1); c.fillRect(r * 0.2, r * (0.08 + i * 0.2), r * 0.3, r * 0.1); }
      const glow = 0.7 + 0.3 * Math.sin(t * 3.2);
      c.shadowColor = "#2de0d0"; c.shadowBlur = r * 0.3 * glow;
      c.fillStyle = "#4df5ea";
      for (const [dx, dy] of [[0, 0.05], [0.12, 0.17], [-0.06, 0.3], [0.1, 0.44], [-0.12, 0.54], [0.04, 0.64]]) c.fillRect(dx * r - q / 2, dy * r, q * 1.1, q * 1.1);
      c.restore();
    },
  },
  wither: {
    // ลักษณะเด่นของ Wither: ลูกบอลดำเทาเข้มขอบขาว มี "สามหัวกะโหลก" โผล่เหนือตัว (กลางใหญ่ ข้างเล็ก) ตาขาวเรืองแสง
    // ซี่โครงขาวพาดอก และเถ้าขาวลอยรอบตัว; เมื่อมีเกราะ (o.armor) มีโล่ขาวเส้นประหมุนรอบตัว
    body: "#20222c",
    rim: "#e6e9f2",
    eyes: "none",
    back(c, r, t, o) {
      const q = r * 0.11;
      const skull = (x, y, s, bob) => {
        c.save(); c.translate(x, y + bob);
        c.fillStyle = "#08080c"; c.fillRect(-s - q * 0.5, -s - q * 0.5, s * 2 + q, s * 2 + q);
        c.fillStyle = "#2c2f3d"; c.fillRect(-s, -s, s * 2, s * 2);
        c.shadowColor = "#ffffff"; c.shadowBlur = r * 0.18; c.fillStyle = "#ffffff";
        c.fillRect(-s * 0.7, -s * 0.45, s * 0.55, s * 0.4); c.fillRect(s * 0.15, -s * 0.45, s * 0.55, s * 0.4); // ตาขาวเรืองแสง
        c.shadowBlur = 0; c.fillStyle = "#b9bfd0";
        for (let i = 0; i < 3; i++) c.fillRect(-s * 0.6 + i * s * 0.45, s * 0.35, s * 0.28, s * 0.3); // ฟัน
        c.restore();
      };
      skull(-r * 0.72, -r * 0.92, r * 0.27, Math.sin(t * 2.1) * r * 0.04);
      skull(r * 0.72, -r * 0.92, r * 0.27, Math.sin(t * 2.1 + 2) * r * 0.04);
      skull(0, -r * 1.12, r * 0.36, Math.sin(t * 2.1 + 1) * r * 0.05);
      for (let i = 0; i < 5; i++) { // เถ้าขาวลอย
        const ph = (t * 0.6 + i / 5) % 1;
        c.globalAlpha = 0.6 * (1 - ph); c.fillStyle = "#ffffff";
        const sz = r * (0.08 + 0.08 * ph);
        c.fillRect(Math.cos(i * 2.4) * r * 0.9 - sz / 2, r * 0.5 - ph * r * 1.5 - sz / 2, sz, sz);
      }
      c.globalAlpha = 1;
      if (o && o.armor) { // โล่เกราะ (กันกระสุน)
        c.save(); c.strokeStyle = "rgba(255,255,255," + (0.55 + 0.25 * Math.sin(t * 6)).toFixed(2) + ")";
        c.lineWidth = r * 0.07; c.setLineDash([r * 0.3, r * 0.22]); c.lineDashOffset = -t * r;
        c.beginPath(); c.arc(0, 0, r * 1.18, 0, Math.PI * 2); c.stroke(); c.restore();
      }
    },
    front(c, r) {
      // ซี่โครงขาวพาดอก + กระดูกสันหลังกลางตัว
      c.fillStyle = "#e6e9f2";
      const h = r * 0.09;
      c.fillRect(-r * 0.08, -r * 0.1, r * 0.16, r * 0.95);
      for (let i = 0; i < 4; i++) {
        const y = r * (0.0 + i * 0.2), w = r * (0.62 - i * 0.07);
        c.fillRect(-w, y, w * 2, h);
      }
      c.fillStyle = "#14161e";
      c.fillRect(-r * 0.28, -r * 0.42, r * 0.2, r * 0.14); c.fillRect(r * 0.08, -r * 0.42, r * 0.2, r * 0.14); // เบ้าตาบนตัว
    },
  },
  hatsu: {
    front(c, r, t, o) {
      c.scale((o && o.facing) || 1, 1);
      c.font = "900 " + Math.round(r * 0.95) + "px " + FONT; c.textAlign = "center"; c.textBaseline = "middle";
      c.lineWidth = r * 0.12; c.strokeStyle = "#5a0d12"; c.strokeText("4", 0, r * 0.52);
      c.fillStyle = "#fff"; c.fillText("4", 0, r * 0.52);
    },
  },
};
// หนวด Sculk พิกเซลแตกกิ่ง (ศูนย์กลางที่ x,y หมุน rot ขนาดรวม size)
function sculkTendril(c, x, y, size, rot, t) {
  const u = size * 0.2;
  const cells = [[0,0],[0,1],[1,1],[1,2],[2,2],[2,3],[-1,1],[-2,1],[-2,0],[3,3],[3,2],[1,3],[0,3],[-1,3],[-1,4],[2,4],[3,4],[4,3],[0,-1],[-1,-1]];
  c.save(); c.translate(x, y); c.rotate(rot);
  cells.forEach(([cx, cy], i) => {
    const w = Math.sin(t * 4 + i * 0.7) * u * 0.15;
    c.fillStyle = i % 3 === 0 ? "#26b5c4" : "#16899a";
    c.fillRect((cx - 1.5) * u + w, (cy - 2) * u, u * 0.9, u * 0.9);
  });
  c.restore();
}
function clockIcon(c, x, y, rr, t) {
  c.save(); c.translate(x, y);
  c.fillStyle = "#fff"; c.strokeStyle = "#222"; c.lineWidth = rr * 0.22;
  c.beginPath(); c.arc(0, 0, rr, 0, Math.PI * 2); c.fill(); c.stroke();
  c.lineWidth = rr * 0.2; c.lineCap = "round";
  c.beginPath(); c.moveTo(0, 0); c.lineTo(Math.cos(t * 3) * rr * 0.7, Math.sin(t * 3) * rr * 0.7); c.stroke();
  c.beginPath(); c.moveTo(0, 0); c.lineTo(0, -rr * 0.5); c.stroke();
  c.restore();
}
function hourglassIcon(c, x, y, rr, t) {
  c.save(); c.translate(x, y); c.rotate(Math.sin(t * 2) * 0.1);
  c.fillStyle = "#ffe9a8"; c.strokeStyle = "#3a2a10"; c.lineWidth = rr * 0.2; c.lineJoin = "round";
  c.beginPath(); c.moveTo(-rr, -rr * 1.2); c.lineTo(rr, -rr * 1.2); c.lineTo(0, 0); c.lineTo(rr, rr * 1.2); c.lineTo(-rr, rr * 1.2); c.lineTo(0, 0); c.closePath();
  c.fill(); c.stroke(); c.restore();
}

// วาดบอลตัวละคร (พิกัดกลางตัว หันขวา) ไว้ใน ctx ที่ส่งมา
function drawCodeBall(c, key, def, r, o) {
  o = o || {};
  const st = BALL_STYLES[key] || {};
  const t = o.t !== undefined ? o.t : performance.now() / 1000;
  const base = st.body || def.color;
  if (st.back) { c.save(); st.back(c, r, t, o); c.restore(); }
  if (o.casting) { // กำลังใช้สกิล: ออร่าเรืองรอบตัว
    c.save(); c.globalAlpha = 0.35 + 0.25 * Math.sin(t * 16); c.strokeStyle = def.color; c.lineWidth = r * 0.16;
    c.beginPath(); c.arc(0, 0, r * 1.12, 0, Math.PI * 2); c.stroke(); c.restore();
  }
  const g = c.createRadialGradient(-r * 0.35, -r * 0.4, r * 0.1, 0, 0, r);
  g.addColorStop(0, shade(base, 0.45)); g.addColorStop(0.6, base); g.addColorStop(1, shade(base, -0.4));
  c.fillStyle = o.flash ? "#fff" : g;
  c.beginPath(); c.arc(0, 0, r, 0, Math.PI * 2); c.fill();
  c.lineWidth = Math.max(2, r * 0.07); c.strokeStyle = o.flash ? "#fff" : st.rim || shade(base, -0.6); c.stroke();
  if (st.eyes !== "none") { // ตา มองไปทางขวา (ทิศที่หัน)
    const ec = st.eyes || "#1b1f33";
    for (const ex of [0.2, 0.6]) {
      c.fillStyle = "#fff"; c.beginPath(); c.ellipse(r * ex, -r * 0.12, r * 0.15, r * 0.2, 0, 0, Math.PI * 2); c.fill();
      c.fillStyle = ec; c.beginPath(); c.arc(r * (ex + 0.05), -r * 0.1, r * 0.09, 0, Math.PI * 2); c.fill();
    }
  }
  if (st.front && !o.flash) { c.save(); st.front(c, r, t, o); c.restore(); }
}

const ballIcons = {};
function ballIconURL(key) { // รูปบอลเล็ก ใช้เป็นภาพย่อในปุ่มเลือกตัวละครและการ์ดข้อมูล
  if (ballIcons[key]) return ballIcons[key];
  const cv = document.createElement("canvas");
  cv.width = cv.height = 128;
  const c = cv.getContext("2d");
  c.translate(64, 76);
  drawCodeBall(c, key, CHARACTERS[key], 33, { t: 0.4, hp: CHARACTERS[key].hp });
  return (ballIcons[key] = cv.toDataURL());
}
const thumbSrc = (key, skin) => (skinKind(fixSkin(key, skin)) === "ball" ? ballIconURL(key) : CHARACTERS[key].frames.idle);

// เปลี่ยนสกินของช่องผู้เล่น i
function setSkin(i, id) {
  const sel = playerSels[i];
  if (!sel) return;
  sel.skin = fixSkin(sel.value, id);
  saveSkins();
  if (view === "setup") rebuildPlayers();
}
function saveSkins() {
  try { localStorage.setItem("bb_skins", JSON.stringify(playerSels.map((s) => s.skin))); } catch (e) { /* ข้าม */ }
}
function savedSkin(i) {
  try { return JSON.parse(localStorage.getItem("bb_skins") || "[]")[i] || null; } catch (e) { return null; }
}

function drawFighter(f, key) {
  const size = f.r * 2.6;
  const img = images[key] && (images[key][poseFrame(f, key)] || images[key].idle);

  ctx.save();
  ctx.translate(f.x, f.y);

  // เงา
  ctx.fillStyle = "rgba(0,0,0,0.3)";
  ctx.beginPath();
  ctx.ellipse(0, f.r * 0.95, f.r * 0.9, f.r * 0.25, 0, 0, Math.PI * 2);
  ctx.fill();

  // กระโดด dunk / lay up: ตัวลอยขึ้นจากเงา
  if (f.cast && f.cast.sk && f.cast.sk.type === "dunk" && f.lift) ctx.translate(0, -f.lift);

  // เอียงตามทิศเคลื่อนที่นิดหน่อยให้ดูมีชีวิต
  ctx.rotate(Math.max(-0.25, Math.min(0.25, (f.vy / 800) * f.facing)));
  ctx.scale(f.facing, 1);

  if (skinKind(f.skin || skinForKey(key)) === "ball") {
    drawCodeBall(ctx, key, f.def, f.r, { flash: f.hitFlash > 0, casting: !!f.cast, hp: Math.ceil(f.hp), facing: f.facing, horn: f.hornT || 0, armor: !!f.armor });
  } else if (img) {
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
  const enemy = battle && battle._target(f);
  const now = performance.now() / 1000;
  // มุมเข็ม (สัมพัทธ์กับก้านที่หมุนอยู่): ชี้ไปที่ศัตรู ถ้าไม่มีศัตรูให้หมุนเล่น
  const toEnemy = enemy && enemy !== f && enemy.hp > 0 ? Math.atan2(enemy.y - f.y, enemy.x - f.x) : now * 5;
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
    ctx.globalAlpha = Math.min(1, Math.max(0, g.life / 0.3)) * 0.35;
    ctx.filter = g.tint === "blue" ? "sepia(1) hue-rotate(160deg) saturate(5) brightness(1.2)" : "sepia(1) saturate(4) brightness(1.1)";
    drawFighter({ x: g.x, y: g.y, r: g.r, vy: g.vy, facing: g.facing, frame: g.frame, hitFlash: 0, def: CHARACTERS[g.key] }, g.key);
    ctx.restore();
  }
  ctx.filter = "none";
}

// ป้ายนับถอยหลังด้านบนสนาม (ใช้กับเร่ง/ชะลอเวลา)
let labelRow = 0; // ป้ายด้านบนสนามหลายป้ายพร้อมกัน (หลายคนใช้สกิลเวลาพร้อมกัน) ให้เรียงลงมา
function drawTimeLabel(txt, color) {
  const ly = 42 + 32 * labelRow++;
  ctx.save();
  ctx.textAlign = "center";
  ctx.font = "700 26px " + FONT;
  ctx.lineWidth = 5;
  ctx.strokeStyle = "rgba(0,0,0,0.7)";
  ctx.strokeText(txt, W / 2, ly);
  ctx.fillStyle = color;
  ctx.fillText(txt, W / 2, ly);
  ctx.restore();
}

// วงสีทีม/ผู้เล่นใต้ตัวละคร + เลขผู้เล่น (โหมด 2v2 และ ffa)
// ---------- โหมดคลื่น: แถบสถานะบนสนาม / แถบเลือดศัตรู / ป้ายใหญ่ตอนเริ่มคลื่น ----------
let waveBanner = null; // {text, sub, t, boss}

function drawEnemyBar(f) {
  const w = Math.max(36, f.r * 1.5), x = f.x - w / 2, y = f.y - f.r - 15;
  ctx.save();
  ctx.fillStyle = "rgba(0,0,0,0.55)"; ctx.fillRect(x - 1, y - 1, w + 2, f.def.boss ? 8 : 6);
  const ratio = Math.max(0, f.hp / f.maxHp);
  ctx.fillStyle = f.def.boss ? "#ff6a5a" : hpColor(ratio);
  ctx.fillRect(x, y, w * ratio, f.def.boss ? 6 : 4);
  if (f.def.boss) {
    ctx.font = "700 13px " + FONT; ctx.textAlign = "center"; ctx.textBaseline = "alphabetic";
    ctx.lineWidth = 3; ctx.strokeStyle = "rgba(0,0,0,0.7)"; ctx.strokeText("👑 " + f.def.name, f.x, y - 4);
    ctx.fillStyle = "#ffe8b0"; ctx.fillText("👑 " + f.def.name, f.x, y - 4);
  }
  ctx.restore();
}

function drawWaveHud(b) {
  const w = b.wave;
  if (!w) return;
  const total = w.total ? " / " + w.total : "";
  let line;
  if (w.state === "break") line = (w.n ? "พักก่อนคลื่น " + (w.n + 1) + total : "เตรียมตัว… คลื่น 1" + total) + "  ·  อีก " + Math.max(1, Math.ceil(w.t)) + " วิ";
  else line = "คลื่น " + w.n + total + "  ·  ศัตรูเหลือ " + (b._enemiesAlive() + w.queue.length) + (w.boss ? "  ·  👑 บอส" : "") + "  ·  กำจัดแล้ว " + (w.kills + b.fighters.filter((f) => f.team === 1 && f.hp <= 0).length);
  ctx.save();
  ctx.font = "700 15px " + FONT;
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  const tw = ctx.measureText(line).width + 28;
  ctx.fillStyle = "rgba(10,12,24,0.72)";
  ctx.beginPath(); ctx.roundRect(W / 2 - tw / 2, 10, tw, 28, 14); ctx.fill();
  ctx.fillStyle = w.boss && w.state === "fight" ? "#ff9a8a" : "#e8ebf5";
  ctx.fillText(line, W / 2, 25);
  if (waveBanner) {
    const k = Math.min(1, waveBanner.t / 0.5, (2.2 - waveBanner.t) / 0.25 + 0.05);
    ctx.globalAlpha = Math.max(0, Math.min(1, k));
    ctx.font = "700 52px " + FONT;
    ctx.lineWidth = 7; ctx.strokeStyle = "rgba(0,0,0,0.65)";
    ctx.strokeText(waveBanner.text, W / 2, H * 0.34);
    ctx.fillStyle = waveBanner.boss ? "#ff7a6a" : "#ffffff";
    ctx.fillText(waveBanner.text, W / 2, H * 0.34);
    if (waveBanner.sub) {
      ctx.font = "600 24px " + FONT;
      ctx.lineWidth = 5; ctx.strokeText(waveBanner.sub, W / 2, H * 0.34 + 46);
      ctx.fillStyle = "#ffe08a"; ctx.fillText(waveBanner.sub, W / 2, H * 0.34 + 46);
    }
  }
  ctx.restore();
}

function drawTeamMark(f, color, num) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 4;
  ctx.globalAlpha = 0.9;
  ctx.beginPath();
  ctx.ellipse(f.x, f.y + f.r * 0.95, f.r * 1.15, f.r * 0.38, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(f.x, f.y + f.r * 0.95 + f.r * 0.38 + 9, 9, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#10131d";
  ctx.font = "700 12px " + FONT;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(String(num), f.x, f.y + f.r * 0.95 + f.r * 0.38 + 10);
  ctx.textBaseline = "alphabetic";
  ctx.restore();
}

// ---------- Florentino: ลูกดอก ดอกไม้ และเส้นดวล ----------
function drawDart(p) {
  const a = Math.atan2(p.dy, p.dx);
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(a);
  ctx.strokeStyle = "rgba(255,150,190,0.5)"; // รอยหางสีชมพู
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(-34, 0);
  ctx.lineTo(-8, 0);
  ctx.stroke();
  ctx.fillStyle = "#ff8fb8"; // หางขนนก
  ctx.beginPath();
  ctx.moveTo(-18, 0); ctx.lineTo(-26, -6); ctx.lineTo(-22, 0); ctx.lineTo(-26, 6);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "#dfe6f2"; // ก้าน
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(-20, 0);
  ctx.lineTo(10, 0);
  ctx.stroke();
  ctx.fillStyle = "#ffffff"; // ปลายแหลม
  ctx.beginPath();
  ctx.moveTo(10, -4); ctx.lineTo(20, 0); ctx.lineTo(10, 4);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawFlower(fl) {
  const t = performance.now() / 1000;
  const fade = fl.t < 1 ? 0.35 + 0.65 * Math.abs(Math.sin(t * 14)) : 1; // ใกล้หมดเวลากะพริบ
  const bob = Math.sin(t * 3 + fl.bob) * 2.5;
  ctx.save();
  ctx.translate(fl.x, fl.y + bob);
  ctx.globalAlpha = fade;
  ctx.shadowColor = "#ff8fb8";
  ctx.shadowBlur = 16;
  ctx.rotate(t * 0.8 + fl.bob);
  ctx.fillStyle = "#ff7aa8";
  for (let i = 0; i < 5; i++) {
    ctx.beginPath();
    ctx.ellipse(0, -9, 6.5, 10, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.rotate((Math.PI * 2) / 5);
  }
  ctx.shadowBlur = 0;
  ctx.fillStyle = "#ffe27a";
  ctx.beginPath();
  ctx.arc(0, 0, 5.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// เส้นดวล: เส้นประทองระหว่างคู่ดวล + ป้ายเวลาเหนือหัวคู่ดวล
function drawDuelLink(f) {
  const d = f.duel;
  if (!d || d.target.hp <= 0) return;
  const t = performance.now() / 1000;
  ctx.save();
  ctx.strokeStyle = "rgba(255,214,90,0.85)";
  ctx.lineWidth = 3;
  ctx.setLineDash([10, 8]);
  ctx.lineDashOffset = -t * 60;
  ctx.beginPath();
  ctx.moveTo(f.x, f.y);
  ctx.lineTo(d.target.x, d.target.y);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.strokeStyle = "#ffd65a";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(d.target.x, d.target.y, d.target.r + 10 + Math.sin(t * 8) * 2, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = "#ffd65a";
  ctx.font = "700 16px " + FONT;
  ctx.textAlign = "center";
  ctx.strokeStyle = "rgba(0,0,0,0.7)";
  ctx.lineWidth = 4;
  const txt = "⚔ ดวล " + Math.max(0, d.t).toFixed(1);
  ctx.strokeText(txt, d.target.x, d.target.y - d.target.r - 18);
  ctx.fillText(txt, d.target.x, d.target.y - d.target.r - 18);
  ctx.restore();
}

// ---------- ลูกฟุตบอล (กระสุนของ Isagi) ----------
// The Red Mist หลัง E.G.O. ปรากฏ: หมอกแดงลุกรอบตัว
function drawEgoAura(f) {
  const t = performance.now() / 1000;
  const R = f.r * 1.6;
  ctx.save();
  ctx.translate(f.x, f.y);
  const g = ctx.createRadialGradient(0, 0, R * 0.3, 0, 0, R);
  g.addColorStop(0, "rgba(255,30,60,0)");
  g.addColorStop(0.7, "rgba(255,30,60," + (0.28 + 0.08 * Math.sin(t * 7)) + ")");
  g.addColorStop(1, "rgba(120,0,20,0)");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, R, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// ตัวที่เลือดไหล: หยดเลือดร่วงจากตัว
function drawBleed(f) {
  const t = performance.now() / 1000;
  ctx.save();
  if (f.bleedKind === "wither") {
    // ติด Wither: เถ้ากระดูกสีขาวลอยขึ้น + หมอกขาวจางๆ + กะโหลกเล็กขาววนรอบตัว
    const g = ctx.createRadialGradient(f.x, f.y, f.r * 0.3, f.x, f.y, f.r * 1.25);
    g.addColorStop(0, "rgba(255,255,255,0)");
    g.addColorStop(1, "rgba(255,255,255," + (0.22 + 0.08 * Math.sin(t * 5)).toFixed(2) + ")");
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(f.x, f.y, f.r * 1.25, 0, Math.PI * 2); ctx.fill();
    for (let i = 0; i < 8; i++) {
      const ph = (t * 0.9 + i / 8) % 1;
      const ang = i * 2.4 + t * 0.7;
      const rr = f.r * (0.55 + 0.4 * Math.sin(i * 1.7));
      const sz = 3 + 4 * (1 - ph);
      ctx.globalAlpha = 0.95 * (1 - ph);
      ctx.fillStyle = i % 3 === 0 ? "#b9bfd0" : "#ffffff";
      ctx.fillRect(f.x + Math.cos(ang) * rr - sz / 2, f.y + Math.sin(ang) * rr * 0.6 - ph * f.r * 1.1 - sz / 2, sz, sz);
    }
    ctx.globalAlpha = 0.9;
    ctx.shadowColor = "#ffffff"; ctx.shadowBlur = 8;
    ctx.font = Math.round(f.r * 0.45) + "px " + FONT;
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText("💀", f.x + Math.cos(t * 2.2) * f.r * 0.95, f.y - f.r * 0.9 + Math.sin(t * 2.2) * 4);
    ctx.restore();
    return;
  }
  ctx.fillStyle = "#c4102a";
  for (let i = 0; i < 3; i++) {
    const ph = (t * 1.6 + i / 3) % 1;
    ctx.globalAlpha = 1 - ph;
    ctx.beginPath();
    ctx.arc(f.x + (i - 1) * f.r * 0.5, f.y - f.r * 0.2 + ph * f.r * 1.1, 4, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

let hoopFlash = 0; // แป้นวาบสีส้มตอนลง
function drawHoop(h) {
  hoopFlash = Math.max(0, hoopFlash - 1 / 60);
  ctx.save();
  ctx.translate(h.x, h.y);
  // เสา + แป้น
  ctx.fillStyle = "#2a3047";
  ctx.fillRect(-4, -h.r - 34, 8, 34);
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.strokeStyle = hoopFlash > 0 ? "#ffb347" : "#8d97b8";
  ctx.lineWidth = 3;
  ctx.fillRect(-h.r * 1.7, -h.r - 52, h.r * 3.4, 34);
  ctx.strokeRect(-h.r * 1.7, -h.r - 52, h.r * 3.4, 34);
  ctx.strokeStyle = "#d94a2a";
  ctx.lineWidth = 2;
  ctx.strokeRect(-h.r * 0.5, -h.r - 36, h.r, 16);
  // ตาข่าย
  ctx.strokeStyle = "rgba(255,255,255,0.6)";
  ctx.lineWidth = 1.5;
  for (let i = -3; i <= 3; i++) {
    ctx.beginPath();
    ctx.moveTo(i * h.r * 0.28, 0);
    ctx.lineTo(i * h.r * 0.16, h.r * 0.9);
    ctx.stroke();
  }
  // ห่วง
  ctx.strokeStyle = hoopFlash > 0 ? "#ffd27a" : "#ff6a2a";
  ctx.lineWidth = 5;
  if (hoopFlash > 0) { ctx.shadowColor = "#ffb347"; ctx.shadowBlur = 22; }
  ctx.beginPath();
  ctx.ellipse(0, 0, h.r, h.r * 0.38, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function drawBasketball(p) {
  const r = p.r;
  // วิถีโค้งแบบยิงบาส: ลูกลอยสูงตอนกลางทางแล้วลงที่เป้า (วาดอย่างเดียว การชนยังเป็นพื้นราบ)
  const prog = p.shotT ? Math.min(1, p.t / p.shotT) : 1;
  const lift = p.z !== undefined ? p.z : 8 + Math.sin(prog * Math.PI) * (p.three ? 62 : 34); // ลูกชู้ตลอยสูงเหนือหัว / ลูกตกพื้นใช้ความสูง z
  ctx.fillStyle = "rgba(0,0,0,0.28)";
  ctx.beginPath();
  ctx.ellipse(p.x, p.y + r * 0.9, r * (0.9 - lift / 140), r * 0.3, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.save();
  ctx.translate(p.x, p.y - lift);
  if (p.three) { ctx.shadowColor = "#ffb347"; ctx.shadowBlur = 16; }
  ctx.rotate(p.t * 10 * (p.spin >= 0 ? 1 : -1));
  ctx.fillStyle = "#e8731f";
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#3a1c08";
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.moveTo(-r, 0); ctx.lineTo(r, 0);
  ctx.moveTo(0, -r); ctx.lineTo(0, r);
  ctx.moveTo(-r * 0.7, -r * 0.7); ctx.quadraticCurveTo(0, 0, -r * 0.7, r * 0.7);
  ctx.moveTo(r * 0.7, -r * 0.7); ctx.quadraticCurveTo(0, 0, r * 0.7, r * 0.7);
  ctx.stroke();
  ctx.restore();
}

// เพื่อนที่ Solar เรียกมา: วาดเป็นตัวละครโปร่งแสงเรืองสีประจำตัว พุ่งเข้าหาเป้า แล้วจางหาย
function drawGuest(gu) {
  const key = Object.keys(CHARACTERS).find((k) => CHARACTERS[k].name === gu.name);
  if (!key) return;
  const def = CHARACTERS[key];
  ctx.save();
  ctx.globalAlpha = gu.phase === "out" ? Math.max(0, 1 - gu.t / 0.45) * 0.9 : 0.9;
  ctx.filter = "drop-shadow(0 0 12px " + (gu.g.color || "#fff") + ")";
  drawFighter({ x: gu.x, y: gu.y, r: def.radius, vy: 0, facing: gu.facing, frame: "idle", hitFlash: 0, def }, key);
  ctx.restore();
  if (gu.phase === "squeeze") drawHamster({ x: gu.x, y: gu.y, r: def.radius, facing: gu.facing, cast: { t: gu.t } }); // บีบแฮมสเตอร์
}

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
// เพิ่มวงคลื่นของ Isagi (สร้างตอน metaStart / dodge / kick) delay = รอกี่วินาทีก่อนเริ่มขยาย
function metaRing(x, y, r, col, life, lw, delay) {
  metaFx.push({ k: "ring", x, y, r, col, lw: lw || 3, d: delay || 0, t: 0, life: life + (delay || 0), dur: life });
}

// ออร่า: แสงเรืองฟ้า, วงประหมุนสวนทางกัน, เปลวฟ้าลอยขึ้น, ดวงตาเหนือหัวที่มองตามศัตรู + วงนับเวลาที่เหลือ
// ยิ่งเลือดน้อย (ซึ่งคูลดาวน์เดินเร็วขึ้น) ยิ่งมีสีทองปนและหมุนไวขึ้น = ตื่นตัว
function drawMetaAura(f) {
  const t = performance.now() / 1000;
  const c = f.cast;
  const lost = 1 - Math.max(0, f.hp) / f.maxHp;
  const fade = Math.max(0, Math.min(1, c.t / 0.25, (c.sk.duration - c.t) / 0.3)) * (1 - 0.45 * fatigueOf(f) * (0.65 + 0.35 * Math.sin(t * 14))); // เหนื่อย = ออร่าแกว่งจางลง
  const R = f.r * 1.5;
  const spin = 1 + lost * 1.5;
  ctx.save();
  ctx.translate(f.x, f.y);
  ctx.globalCompositeOperation = "lighter";
  // แสงเรืองรอบตัว
  const g = ctx.createRadialGradient(0, 0, f.r * 0.4, 0, 0, R * 1.35);
  g.addColorStop(0, "rgba(79,184,255,0)");
  g.addColorStop(0.6, "rgba(79,184,255," + ((0.22 + 0.06 * Math.sin(t * 6)) * fade).toFixed(3) + ")");
  g.addColorStop(1, "rgba(79,184,255,0)");
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(0, 0, R * 1.35, 0, Math.PI * 2); ctx.fill();
  // เปลวฟ้าลอยขึ้นรอบตัว
  for (let i = 0; i < 12; i++) {
    const ph = (t * 0.9 * spin + i / 12) % 1;
    const a = i * 2.399 + Math.sin(t + i) * 0.3;
    const rr = f.r * (0.75 + 0.45 * Math.sin(i * 1.9));
    const x = Math.cos(a) * rr;
    const y = Math.sin(a) * rr * 0.5 + f.r * 0.5 - ph * f.r * 1.9;
    const sz = (1 - ph) * f.r * 0.2 + 2;
    const gold = lost > 0.5 && i % 3 === 0;
    const fg = ctx.createRadialGradient(x, y, 0, x, y, sz * 2.2);
    fg.addColorStop(0, gold ? "rgba(255,230,140," + (0.9 * (1 - ph) * fade).toFixed(3) + ")" : "rgba(190,240,255," + (0.9 * (1 - ph) * fade).toFixed(3) + ")");
    fg.addColorStop(1, "rgba(79,184,255,0)");
    ctx.fillStyle = fg;
    ctx.beginPath(); ctx.ellipse(x, y, sz * 1.2, sz * 2.2, 0, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalCompositeOperation = "source-over";
  // วงหมุนสวนทางกัน 2 ชั้น (เส้นประ) + ขีดสั้นรอบวงนอก
  ctx.strokeStyle = "#8fe0ff";
  ctx.globalAlpha = 0.85 * fade;
  ctx.lineWidth = 2.5;
  ctx.setLineDash([4, 7]);
  ctx.lineDashOffset = t * 40 * spin;
  ctx.beginPath(); ctx.arc(0, 0, R, 0, Math.PI * 2); ctx.stroke();
  ctx.strokeStyle = lost > 0.5 ? "#ffd65a" : "#c9f1ff";
  ctx.lineWidth = 1.8;
  ctx.setLineDash([14, 10]);
  ctx.lineDashOffset = -t * 55 * spin;
  ctx.beginPath(); ctx.arc(0, 0, R * 0.82, 0, Math.PI * 2); ctx.stroke();
  ctx.setLineDash([]);
  ctx.lineWidth = 3;
  for (let i = 0; i < 6; i++) {
    const a = t * 1.4 * spin + (i / 6) * Math.PI * 2;
    ctx.beginPath();
    ctx.arc(0, 0, R * 1.08, a, a + 0.16);
    ctx.stroke();
  }
  // ดวงตาเหนือหัว: มองตามศัตรูที่ใกล้ที่สุด กะพริบเป็นระยะ
  let foe = null, fd = 1e9;
  for (const g2 of battle.fighters) {
    if (g2 === f || g2.hp <= 0 || g2.team === f.team) continue;
    const d = Math.hypot(g2.x - f.x, g2.y - f.y);
    if (d < fd) { fd = d; foe = g2; }
  }
  let lx = 0, ly = 0;
  if (foe) { const d = Math.hypot(foe.x - f.x, foe.y - f.y) || 1; lx = (foe.x - f.x) / d * 7; ly = (foe.y - f.y) / d * 3.5; }
  const ey = -f.r - 26;
  const blink = (t % 3.2) > 3.08 ? 0.15 : 1;
  const ew = 24, eh = 12 * blink;
  ctx.globalAlpha = fade;
  ctx.shadowColor = "#6fd3ff"; ctx.shadowBlur = 14;
  ctx.fillStyle = "rgba(8,24,52,0.9)";
  ctx.beginPath();
  ctx.moveTo(-ew, ey);
  ctx.quadraticCurveTo(0, ey - eh * 2, ew, ey);
  ctx.quadraticCurveTo(0, ey + eh * 2, -ew, ey);
  ctx.closePath(); ctx.fill();
  ctx.strokeStyle = "#8fe0ff"; ctx.lineWidth = 2; ctx.stroke();
  ctx.shadowBlur = 0;
  if (blink > 0.5) {
    const ig = ctx.createRadialGradient(lx, ey + ly, 1, lx, ey + ly, 9);
    ig.addColorStop(0, "#ffffff"); ig.addColorStop(0.45, "#8fe0ff"); ig.addColorStop(1, "#2f7bff");
    ctx.fillStyle = ig;
    ctx.beginPath(); ctx.arc(lx, ey + ly, 8, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#04122a";
    ctx.beginPath(); ctx.ellipse(lx, ey + ly, 2.4, 6, 0, 0, Math.PI * 2); ctx.fill();
  }
  // ระดับการวิเคราะห์/ปรับตัว: เม็ดเพชร 5 เม็ดเหนือดวงตา (เต็ม = ทอง)
  const mem = f.metaMem;
  if (mem && mem.level > 0) {
    const mx = f.def.skills.find((k) => k.type === "metavision");
    const adaptMax = (mx && mx.adaptMax) || 10;
    const lv = (mem.level / adaptMax) * 10;
    for (let i = 0; i < 5; i++) {
      const fill = Math.max(0, Math.min(1, (lv - i * 2) / 2));
      const px = (i - 2) * 11, py = ey - 26;
      ctx.beginPath();
      ctx.moveTo(px, py - 5); ctx.lineTo(px + 4, py); ctx.lineTo(px, py + 5); ctx.lineTo(px - 4, py);
      ctx.closePath();
      ctx.fillStyle = "rgba(8,24,52,0.8)"; ctx.fill();
      ctx.fillStyle = (mem.level >= adaptMax ? "rgba(255,214,90," : "rgba(143,224,255,") + (0.15 + 0.85 * fill).toFixed(2) + ")";
      ctx.fill();
      ctx.strokeStyle = "rgba(143,224,255,0.8)"; ctx.lineWidth = 1; ctx.stroke();
    }
    // แถบคูลดาวน์การปรับตัว: ใต้เม็ดเพชร ค่อยๆ หดจนหมด = เรียนรู้ท่าต่อไปได้
    if (mem.cd > 0 && mem.cdMax > 0 && mem.level < adaptMax) {
      const w = 50 * Math.min(1, mem.cd / mem.cdMax);
      ctx.fillStyle = "rgba(8,24,52,0.8)"; ctx.fillRect(-25, ey - 17, 50, 3);
      ctx.fillStyle = "rgba(143,224,255,0.95)"; ctx.fillRect(-25, ey - 17, w, 3);
    }
  }
  // วงนับเวลาที่เหลือรอบดวงตา
  const left = Math.max(0, Math.min(1, (c.sk.duration - c.t) / c.sk.duration));
  ctx.strokeStyle = "rgba(143,224,255,0.9)"; ctx.lineWidth = 3; ctx.lineCap = "round";
  ctx.beginPath(); ctx.arc(0, ey, ew + 7, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * left); ctx.stroke();
  ctx.restore();
}

// เส้นอนาคตที่ Isagi เห็น: เส้นไล่แสงจากท่าของศัตรูไปจุดที่จะโดน + จุดแสงวิ่งตามเส้น + กากบาทและวงเตือนที่จุดตกกระทบ
function drawMetaThreats(f) {
  const th = f.cast && f.cast.threats;
  if (!th || !th.length) return;
  const t = performance.now() / 1000;
  ctx.save();
  ctx.lineCap = "round";
  for (const q of th) {
    const dx = q.ex - q.x, dy = q.ey - q.y;
    const len = Math.hypot(dx, dy);
    if (len < 2) continue;
    const g = ctx.createLinearGradient(q.x, q.y, q.ex, q.ey);
    g.addColorStop(0, "rgba(143,224,255,0.05)");
    g.addColorStop(1, "rgba(190,240,255,0.95)");
    ctx.strokeStyle = g;
    ctx.lineWidth = 2.5;
    ctx.shadowColor = "#6fd3ff"; ctx.shadowBlur = 10;
    ctx.setLineDash([10, 7]);
    ctx.lineDashOffset = -t * 30;
    ctx.beginPath(); ctx.moveTo(q.x, q.y); ctx.lineTo(q.ex, q.ey); ctx.stroke();
    ctx.setLineDash([]);
    ctx.shadowBlur = 0;
    // จุดแสงวิ่งไปตามเส้น (2 จุดเหลื่อมกัน)
    for (let k = 0; k < 2; k++) {
      const p = (t * 1.6 + k * 0.5) % 1;
      ctx.fillStyle = "rgba(255,255,255," + (0.35 + 0.6 * p).toFixed(2) + ")";
      ctx.beginPath(); ctx.arc(q.x + dx * p, q.y + dy * p, 3 + 2 * p, 0, Math.PI * 2); ctx.fill();
    }
    // หัวลูกศรปลายเส้น
    const ang = Math.atan2(dy, dx);
    ctx.fillStyle = "rgba(190,240,255,0.95)";
    ctx.beginPath();
    ctx.moveTo(q.ex + Math.cos(ang) * 4, q.ey + Math.sin(ang) * 4);
    ctx.lineTo(q.ex + Math.cos(ang + 2.5) * 13, q.ey + Math.sin(ang + 2.5) * 13);
    ctx.lineTo(q.ex + Math.cos(ang - 2.5) * 13, q.ey + Math.sin(ang - 2.5) * 13);
    ctx.closePath(); ctx.fill();
    // วงเตือน + กากบาทที่จุดตกกระทบ
    const pulse = (t * 1.8) % 1;
    ctx.strokeStyle = "rgba(143,224,255," + (0.8 * (1 - pulse)).toFixed(2) + ")";
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(q.ex, q.ey, 8 + pulse * 20, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = "rgba(255,255,255,0.9)";
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(q.ex - 7, q.ey - 7); ctx.lineTo(q.ex + 7, q.ey + 7);
    ctx.moveTo(q.ex + 7, q.ey - 7); ctx.lineTo(q.ex - 7, q.ey + 7);
    ctx.stroke();
  }
  ctx.restore();
}

// รอยบอลที่ถูกเตะ: วงกลมซ้อนจางหายตามหลัง (Meta Kick เป็นสีทอง)
function drawBallTrail() {
  if (!ballTrail.length) return;
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (const bt of ballTrail) {
    const k = Math.max(0, bt.life / bt.max);
    ctx.fillStyle = (bt.meta ? "rgba(255,200,70," : "rgba(110,190,255,") + (0.38 * k).toFixed(3) + ")";
    ctx.beginPath(); ctx.arc(bt.x, bt.y, bt.r * (0.45 + 0.7 * k), 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}

// เอฟเฟกต์ลอยตัวของ Isagi: วงคลื่น, วงหด, เส้นรัศมี, เส้นความเร็ว
function drawMetaFx() {
  if (!metaFx.length) return;
  ctx.save();
  ctx.lineCap = "round";
  for (const m of metaFx) {
    const tt = m.t - (m.d || 0);
    if (tt < 0) continue;
    const dur = m.dur || m.life;
    const k = Math.min(1, tt / dur);
    const e = 1 - Math.pow(1 - k, 3);
    if (m.k === "ring") {
      ctx.strokeStyle = "rgba(" + m.col + "," + (0.9 * (1 - k)).toFixed(3) + ")";
      ctx.lineWidth = m.lw * (1 - k * 0.6);
      ctx.shadowColor = "rgb(" + m.col + ")"; ctx.shadowBlur = 12;
      ctx.beginPath(); ctx.arc(m.x, m.y, Math.max(1, m.r * e), 0, Math.PI * 2); ctx.stroke();
      ctx.shadowBlur = 0;
    } else if (m.k === "in") {
      ctx.strokeStyle = "rgba(" + m.col + "," + (0.2 + 0.7 * k).toFixed(3) + ")";
      ctx.lineWidth = 2 + 3 * k;
      ctx.beginPath(); ctx.arc(m.x, m.y, Math.max(1, m.r * (1 - e)), 0, Math.PI * 2); ctx.stroke();
    } else if (m.k === "ray") {
      const a0 = m.r0 + m.len * e * 0.4, a1 = m.r0 + m.len * e;
      ctx.strokeStyle = "rgba(" + m.col + "," + (0.9 * (1 - k)).toFixed(3) + ")";
      ctx.lineWidth = 3 * (1 - k) + 1;
      ctx.beginPath();
      ctx.moveTo(m.x + Math.cos(m.ang) * a0, m.y + Math.sin(m.ang) * a0);
      ctx.lineTo(m.x + Math.cos(m.ang) * a1, m.y + Math.sin(m.ang) * a1);
      ctx.stroke();
    } else if (m.k === "streak") {
      const dx = Math.cos(m.ang), dy = Math.sin(m.ang);
      const head = m.len * e, tail = m.len * Math.max(0, e - 0.55);
      ctx.strokeStyle = "rgba(" + m.col + "," + (0.85 * (1 - k)).toFixed(3) + ")";
      ctx.lineWidth = 2.5 * (1 - k) + 0.8;
      ctx.beginPath();
      ctx.moveTo(m.x + dx * tail, m.y + dy * tail);
      ctx.lineTo(m.x + dx * head, m.y + dy * head);
      ctx.stroke();
    }
  }
  ctx.restore();
}

// ความมืดฟ้าที่ขอบจอตอน Meta Vision: รอบตัว Isagi ยังสว่าง เหมือน "โฟกัส" ที่ตัวเองและสิ่งที่กำลังจะมา
function drawMetaVignette() {
  if (metaDim <= 0.01) return;
  let who = null;
  for (const f of battle.fighters) if (f.hp > 0 && f.cast && f.cast.sk.type === "metavision") { who = f; break; }
  if (!who) return;
  const R = Math.max(W, H);
  const g = ctx.createRadialGradient(who.x, who.y, 220, who.x, who.y, R);
  g.addColorStop(0, "rgba(4,18,46,0)");
  g.addColorStop(1, "rgba(4,18,46," + (0.42 * metaDim).toFixed(3) + ")");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}

// ---------- กรอบคำพูด (กระสุนบั่นทอนสติ) ----------
// กระสุนเลข 4 ของ Hatsu: ตัวเลข 4 ตัวหนาเรืองแสงหมุนเล็กน้อย
// กะโหลก Wither = "หัว" ของ Wither ที่ถูกปล่อยออกไป: ลูกบาศก์เทาเข้มเหมือนหัวในเกม ตาขาว ปากขาว มีควันเทา-ขาวลอยตามหลัง
// ลูกใหญ่ (r > 20 = Blue Skull) คือหัวเดียวกันที่เคลือบสีน้ำเงิน มีรัศมีและควันสีน้ำเงิน
function drawWitherSkull(p) {
  const blue = p.r > 20;
  const t = performance.now() / 1000;
  ctx.save();
  ctx.translate(p.x, p.y);
  // ควัน: กลุ่มก้อนกลมซ้อนกัน ลอยตามหลังหัวและค่อยๆ ขยายจางหาย
  for (let i = 1; i <= 9; i++) {
    const k = i / 9;
    const wob = Math.sin(t * 9 + i * 1.7 + p.phase) * p.r * 0.3;
    const rr = p.r * (0.45 + 0.75 * k);
    ctx.globalAlpha = 0.55 * (1 - k);
    ctx.fillStyle = blue ? (i % 2 ? "#9fc4ff" : "#4f7fc4") : (i % 2 ? "#e4e7f1" : "#8e919e");
    ctx.beginPath();
    ctx.arc(-p.dx * p.r * 0.85 * i - p.dy * wob, -p.dy * p.r * 0.85 * i + p.dx * wob, rr, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  if (blue) {
    const g = ctx.createRadialGradient(0, 0, p.r * 0.5, 0, 0, p.r * 2.1);
    g.addColorStop(0, "rgba(90,150,255,0.5)");
    g.addColorStop(1, "rgba(90,150,255,0)");
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(0, 0, p.r * 2.1, 0, Math.PI * 2); ctx.fill();
  }
  ctx.rotate(Math.atan2(p.dy, p.dx) + Math.sin(t * 8 + p.phase) * 0.1);
  const s = p.r, q = s / 5; // 1 พิกเซลของหัว (กริด 10x10)
  ctx.fillStyle = "#101014"; ctx.fillRect(-s - q * 0.6, -s - q * 0.6, s * 2 + q * 1.2, s * 2 + q * 1.2); // ขอบ
  ctx.fillStyle = blue ? "#3d5f94" : "#3a3a40"; ctx.fillRect(-s, -s, s * 2, s * 2); // หน้า
  ctx.fillStyle = blue ? "#4a72ad" : "#47474f"; // ลายพิกเซลให้ดูเป็นก้อนหิน
  for (const [x, y] of [[-3, -4], [2, -3], [-4, 1], [3, 3], [0, 4], [-1, -1]]) ctx.fillRect(x * q, y * q, q * 1.4, q * 1.4);
  ctx.fillStyle = "#101014"; ctx.fillRect(-q * 3.6, -q * 2.6, q * 7.2, q * 0.9); // คิ้ว
  ctx.fillStyle = "#ffffff"; // ตาขาว
  ctx.fillRect(-q * 3.4, -q * 1.7, q * 2.6, q * 1.7); ctx.fillRect(q * 0.8, -q * 1.7, q * 2.6, q * 1.7);
  ctx.fillRect(-q * 2.4, q * 2.2, q * 4.8, q * 1.3); // ปาก
  ctx.restore();
}

// วงระเบิดของกะโหลก Wither / เกราะขึ้น: วงขาวขยายตัว + เส้นรัศมีสั้นๆ พุ่งออก (ไม่ใช่วงฟ้าแบบ Warden)
function drawWitherRings(dt) {
  for (const w of witherRings) w.t += dt;
  witherRings = witherRings.filter((w) => w.t < w.life);
  for (const w of witherRings) {
    if (w.t < 0) continue;
    const k = w.t / w.life;
    const e = 1 - Math.pow(1 - k, 3);
    ctx.save();
    ctx.globalAlpha = 1 - k;
    ctx.fillStyle = "rgba(255,255,255," + (w.big ? 0.18 : 0.14) + ")";
    ctx.beginPath(); ctx.arc(w.x, w.y, w.r * e, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "#ffffff";
    ctx.shadowColor = "#ffffff"; ctx.shadowBlur = 14;
    ctx.lineWidth = (w.big ? 7 : 4) * (1 - k) + 1;
    ctx.beginPath(); ctx.arc(w.x, w.y, w.r * e, 0, Math.PI * 2); ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = "#b9bfd0";
    ctx.lineWidth = 2;
    for (let i = 0; i < 12; i++) { // เส้นรัศมี
      const a = i * Math.PI / 6 + (w.big ? 0.13 : 0);
      ctx.beginPath();
      ctx.moveTo(w.x + Math.cos(a) * w.r * e * 0.55, w.y + Math.sin(a) * w.r * e * 0.55);
      ctx.lineTo(w.x + Math.cos(a) * w.r * e * 0.9, w.y + Math.sin(a) * w.r * e * 0.9);
      ctx.stroke();
    }
    ctx.restore();
  }
}

// ท่า Wither Burst (คลื่นรอบตัว): วงสว่างขาวขยายออก + เส้นรัศมีเป็นเศษพิกเซลกระดูกพุ่งออก + เถ้าขาวค้างในวง
function drawWitherBurst(w) {
  const fade = Math.max(0, 1 - w.r / w.maxR);
  ctx.save();
  const g = ctx.createRadialGradient(w.x, w.y, w.r * 0.2, w.x, w.y, w.r);
  g.addColorStop(0, "rgba(255,255,255,0)");
  g.addColorStop(1, "rgba(255,255,255," + (0.3 * fade).toFixed(3) + ")");
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(w.x, w.y, w.r, 0, Math.PI * 2); ctx.fill();
  ctx.globalAlpha = Math.min(1, fade * 1.5);
  ctx.shadowColor = "#ffffff"; ctx.shadowBlur = 20;
  ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 10;
  ctx.beginPath(); ctx.arc(w.x, w.y, w.r, 0, Math.PI * 2); ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.fillStyle = "#ffffff";
  const n = 28;
  for (let i = 0; i < n; i++) { // เศษพิกเซลกระดูกพุ่งออกตามรัศมี
    const a = (i / n) * Math.PI * 2;
    const rr = w.r * (0.62 + 0.3 * ((i * 37) % 10) / 10);
    const sz = 4 + ((i * 13) % 4);
    ctx.fillRect(w.x + Math.cos(a) * rr - sz / 2, w.y + Math.sin(a) * rr - sz / 2, sz, sz);
  }
  ctx.restore();
}

// ออร่าของ Wither เอง: เถ้ากระดูกขาวลอยรอบตัว และเมื่อมีเกราะ (เลือดต่ำกว่าครึ่ง) = โล่ขาวกะพริบเป็นเส้นประหมุน + ประกาย
// (เกราะกันได้เฉพาะ "กระสุน")
function drawWitherSelf(f) {
  const t = performance.now() / 1000;
  ctx.save();
  for (let i = 0; i < 6; i++) {
    const ph = (t * 0.7 + i / 6) % 1;
    const a = i * 1.05 + t * 0.5;
    const sz = 4 + 5 * ph;
    ctx.globalAlpha = 0.55 * (1 - ph);
    ctx.fillStyle = i % 2 ? "#ffffff" : "#b9bfd0";
    ctx.fillRect(f.x + Math.cos(a) * f.r * 0.9 - sz / 2, f.y + f.r * 0.3 - ph * f.r * 1.2 + Math.sin(a) * 6 - sz / 2, sz, sz);
  }
  if (f.armor) {
    const pulse = 0.55 + 0.25 * Math.sin(t * 6);
    const g = ctx.createRadialGradient(f.x, f.y, f.r * 0.7, f.x, f.y, f.r * 1.3);
    g.addColorStop(0, "rgba(255,255,255,0)");
    g.addColorStop(1, "rgba(255,255,255," + (pulse * 0.4).toFixed(2) + ")");
    ctx.globalAlpha = 1;
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(f.x, f.y, f.r * 1.3, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255," + pulse.toFixed(2) + ")";
    ctx.lineWidth = 3;
    ctx.setLineDash([10, 8]);
    ctx.lineDashOffset = -t * 40;
    ctx.beginPath(); ctx.arc(f.x, f.y, f.r * 1.12, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = "#ffffff";
    for (let i = 0; i < 3; i++) {
      const a = t * 3 + i * 2.1;
      ctx.globalAlpha = 0.5 + 0.5 * Math.sin(t * 9 + i);
      ctx.fillRect(f.x + Math.cos(a) * f.r * 1.12 - 2, f.y + Math.sin(a) * f.r * 1.12 - 2, 4, 4);
    }
  }
  ctx.restore();
}

function drawFour(p) {
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(Math.sin(p.t * 6 + p.phase) * 0.18);
  ctx.shadowColor = "#ff5a5f"; ctx.shadowBlur = 16;
  ctx.font = "900 " + Math.round(p.r * 2.6) + "px " + FONT;
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.lineWidth = 5; ctx.strokeStyle = "#5a0d12";
  ctx.strokeText("4", 0, 0);
  ctx.fillStyle = "#fff1f1";
  ctx.fillText("4", 0, 0);
  ctx.restore();
}

// แฮมสเตอร์ที่หลุดมือแล้ววิ่งหนี (หันตามทิศวิ่ง สั่นเล็กน้อย จางลงตอนใกล้หาย)
function drawRunningHamsters(b) {
  for (const h of b.hamsters || []) {
    const left = h.life - h.t;
    ctx.save();
    ctx.globalAlpha = Math.min(1, left / 0.8);
    ctx.translate(h.x, h.y + Math.sin(h.t * 30) * 2);
    ctx.scale(-h.flip, 1); // อิโมจิหันซ้ายเป็นค่าเริ่มต้น
    ctx.font = "30px " + FONT;
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText("🐹", 0, 0);
    ctx.restore();
  }
}

// แฮมสเตอร์ที่ Hatsu กำลังบีบ: ตัวอิโมจิถูกบีบยืดหดเป็นจังหวะ
function drawHamster(f) {
  const t = f.cast.t;
  const sq = 1 + Math.sin(t * 14) * 0.18;
  ctx.save();
  ctx.translate(f.x + f.facing * f.r * 0.95, f.y - f.r * 0.15);
  ctx.scale(1 / sq, sq);
  ctx.font = Math.round(f.r * 0.95) + "px " + FONT;
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText("🐹", 0, 0);
  ctx.restore();
  ctx.save();
  ctx.globalAlpha = 0.5 + 0.5 * Math.sin(t * 7);
  ctx.font = "16px " + FONT; ctx.textAlign = "center";
  ctx.fillText("💚", f.x + f.facing * f.r * 0.5, f.y - f.r - 8 - ((t * 30) % 14));
  ctx.restore();
}

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
  const lvl = battle && battle.isDazed(f) ? Math.max(0.5, f.mind / 100) : Math.min(1, f.mind / 100);
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
  const dz = battle && battle.isDazed(f);
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

// ---------- รอยฟัน: ใช้สไปรต์เอฟเฟกต์ของตัวละคร (ถ้ามี) ไม่งั้นวาดรอยโค้งด้วยโค้ด ----------
function drawSlashFx(dt) {
  const LIFE = 0.28;
  for (const s of slashFxList) {
    s.t += dt;
    const k = Math.min(1, s.t / LIFE); // 0 -> 1
    const o = s.owner;
    const full = s.arc >= 360;
    ctx.save();
    ctx.translate(o.x, o.y); // รอยฟันตามตัวคนฟัน
    ctx.globalAlpha = Math.max(0, 1 - Math.max(0, k - 0.35) / 0.65);
    if (s.img) {
      if (full) {
        ctx.rotate(k * Math.PI * 1.2);
        const d = s.reach * 2 * (0.8 + 0.3 * k);
        ctx.drawImage(s.img, -d / 2, -d / 2, d, d);
      } else {
        ctx.rotate(s.ang);
        const w = s.reach * (0.85 + 0.25 * k);
        const h = w * (s.img.height / s.img.width);
        ctx.drawImage(s.img, 0, -h / 2, w, h); // รอยฟันหันขวา: ขอบซ้ายของรูป = กลางตัวคนฟัน
      }
    } else {
      // ไม่มีสไปรต์: ฟันเป็นรอยโค้งขาว-แดง กวาดตามมุมฟัน
      const half = (s.arc * Math.PI) / 360;
      const a0 = full ? s.ang - Math.PI : s.ang - half;
      const a1 = full ? s.ang + Math.PI : s.ang + half;
      const sweep = a0 + (a1 - a0) * Math.min(1, k * 2.2);
      const rr = s.reach * 0.82;
      ctx.lineCap = "round";
      for (let pass = 0; pass < 2; pass++) {
        ctx.shadowColor = s.color;
        ctx.shadowBlur = 20;
        ctx.strokeStyle = pass === 0 ? s.color : "#ffffff";
        ctx.lineWidth = pass === 0 ? 20 : 8;
        ctx.beginPath();
        ctx.arc(0, 0, rr, a0 + (sweep - a0) * 0.35, sweep);
        ctx.stroke();
      }
    }
    ctx.restore();
  }
  slashFxList = slashFxList.filter((s) => s.t < LIFE);
}


// ---------- Warden: Sonic Boom (ลำแสงวงคลื่น) / Roar (วงคำรามรอบตัว) / ประกายชาร์จ ----------
function drawSonicBeam(w) {
  const dx = Math.cos(w.ang), dy = Math.sin(w.ang);
  const front = w.r, tail = Math.max(w.r0, front - 380);
  if (front <= tail) return;
  const fade = Math.min(1, (w.maxR - w.r) / 160 + 0.15);
  const x0 = w.x + dx * tail, y0 = w.y + dy * tail, x1 = w.x + dx * front, y1 = w.y + dy * front;
  ctx.save();
  ctx.globalAlpha = fade;
  ctx.lineCap = "round";
  // แกนลำแสง: จางที่หาง สว่างที่หัว
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  g.addColorStop(0, "rgba(45,224,208,0)");
  g.addColorStop(0.7, "rgba(45,224,208,0.55)");
  g.addColorStop(1, "rgba(220,255,252,1)");
  ctx.shadowColor = "#2de0d0"; ctx.shadowBlur = 28;
  ctx.strokeStyle = g; ctx.lineWidth = 30;
  ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = "rgba(255,255,255,0.9)"; ctx.lineWidth = 9;
  ctx.beginPath(); ctx.moveTo(x0 + dx * (front - tail) * 0.4, y0 + dy * (front - tail) * 0.4); ctx.lineTo(x1, y1); ctx.stroke();
  // วงแหวนเสียงซ้อนกันตามแนวลำแสง (เหมือนเอฟเฟกต์ Sonic Boom ในเกม) ยิ่งไปข้างหน้ายิ่งกว้าง
  const gap = 46, phase = (w.r % gap);
  for (let d = front - phase; d > tail; d -= gap) {
    const k = (d - tail) / (front - tail); // 0 หาง .. 1 หัว
    const rx = 5 + k * 9, ry = 16 + k * 34;
    ctx.globalAlpha = fade * (0.25 + 0.75 * k);
    ctx.strokeStyle = k > 0.85 ? "#ffffff" : "#2de0d0";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.ellipse(w.x + dx * d, w.y + dy * d, rx, ry, w.ang, 0, Math.PI * 2);
    ctx.stroke();
  }
  // หัวลำแสง
  ctx.globalAlpha = fade;
  ctx.fillStyle = "#e8fffd"; ctx.shadowColor = "#2de0d0"; ctx.shadowBlur = 24;
  ctx.beginPath(); ctx.arc(x1, y1, 13, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

function drawRoarRing(w) {
  const fade = Math.max(0, 1 - w.r / w.maxR);
  for (let k = 0; k < 3; k++) {
    const rr = w.r - k * 34;
    if (rr < 10) continue;
    ctx.save();
    ctx.globalAlpha = Math.min(1, fade * 1.4) * (1 - k * 0.3);
    ctx.shadowColor = "#2de0d0"; ctx.shadowBlur = 22;
    ctx.strokeStyle = k === 0 ? "#bffcf6" : "#2de0d0";
    ctx.lineWidth = 16 - k * 4;
    ctx.beginPath(); ctx.arc(w.x, w.y, rr, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }
  // พื้นมืดจางๆ ภายในวง (ความมืดของ Warden)
  ctx.save();
  const g = ctx.createRadialGradient(w.x, w.y, w.r * 0.3, w.x, w.y, w.r);
  g.addColorStop(0, "rgba(2,12,18,0)");
  g.addColorStop(1, "rgba(2,20,28," + (0.35 * fade).toFixed(3) + ")");
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(w.x, w.y, w.r, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

// ประกายชาร์จที่อกตอนกำลังเตรียม Sonic Boom + วงระเบิดตอนโดนเป้า
function drawWardenFx(b, dt) {
  for (const f of b.fighters) {
    const c = f.cast;
    if (!c || !c.sk.charge || c.fired || f.hp <= 0) continue;
    const need = c.sk.fireDelay || 0.8;
    const k = Math.min(1, c.t / need);
    const cx = f.x, cy = f.y - f.r * 0.1;
    ctx.save();
    ctx.globalAlpha = 0.35 + 0.5 * k;
    ctx.shadowColor = "#2de0d0"; ctx.shadowBlur = 26;
    ctx.strokeStyle = "#2de0d0"; ctx.lineWidth = 3;
    for (let i = 0; i < 3; i++) {
      const rr = f.r * (1.6 - ((k * 2 + i / 3) % 1) * 1.3);
      ctx.beginPath(); ctx.arc(cx, cy, Math.max(4, rr), 0, Math.PI * 2); ctx.stroke();
    }
    ctx.fillStyle = "#e8fffd";
    ctx.beginPath(); ctx.arc(cx, cy, 6 + k * 16, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
  for (const s of sonicBlasts) {
    s.t += dt;
    const k = s.t / 0.45;
    if (k >= 1) continue;
    ctx.save();
    ctx.globalAlpha = 1 - k;
    ctx.shadowColor = "#2de0d0"; ctx.shadowBlur = 24;
    ctx.strokeStyle = "#e8fffd"; ctx.lineWidth = 10 * (1 - k) + 2;
    ctx.beginPath(); ctx.arc(s.x, s.y, 20 + k * 110, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = "#2de0d0"; ctx.lineWidth = 6 * (1 - k) + 1;
    ctx.beginPath(); ctx.arc(s.x, s.y, 10 + k * 70, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }
  sonicBlasts = sonicBlasts.filter((s) => s.t < 0.45);
}

// ---------- คลื่นเสียง: ส่วนโค้งหลายชั้นแผ่ออกไปทางศัตรู ----------
function drawWaves(b) {
  for (const w of b.waves) {
    if (w.style === "sonicboom") { drawSonicBeam(w); continue; }
    if (w.style === "roar") { drawRoarRing(w); continue; }
    if (w.style === "witherburst") { drawWitherBurst(w); continue; }
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
let hud = []; // แผงของผู้เล่นแต่ละคน (สร้างใหม่ตามโหมดที่เลือก)

// side ของแผง: 1v1 ซ้าย/ขวา, 2v2 ทีมแดงซ้าย ทีมฟ้าขวา, ffa สลับซ้าย/ขวา (แผงอยู่รอบสนาม)
function panelSide(i) {
  if (!layout || layout.mode === "1v1") return i === 0 ? "left" : "right";
  if (layout.mode === "2v2") return layout.teams[i] === 0 ? "left" : "right";
  return i % 2 === 0 ? "left" : "right";
}

// ไอคอนสกิล: ใส่ icon: "🔥" ในสกิลใน characters.js เพื่อกำหนดเอง ไม่ใส่ = เลือกตามชนิดสกิล
const SKILL_ICONS = {
  projectile: "🎯", dash: "💨", shockwave: "🌊", timeerase: "⏳", rewind: "⏪",
  timeaccel: "⚡", timeslow: "🐌", ballkick: "⚽", squeeze: "🐹",
};
function skillIcon(sk) {
  if (sk.icon) return sk.icon;
  if (sk.type === "projectile") return sk.shape === "note" ? "🎵" : sk.shape === "text" ? "💬" : "🎯";
  return SKILL_ICONS[sk.type] || "✨";
}

function buildHudPanels() {
  const boxL = document.getElementById("hudL");
  const boxR = document.getElementById("hudR");
  if (!boxL || !boxR || !layout) return;
  boxL.innerHTML = "";
  boxR.innerHTML = "";
  const n = layout.n;
  hud = new Array(n);
  for (let i = 0; i < n; i++) {
    const panel = document.createElement("div");
    panel.className = "panel " + panelSide(i);
    panel.innerHTML =
      '<div class="pname"><span class="pnum"></span><span class="pnm">-</span></div>' +
      '<div class="bar hp"><div class="trail"></div><div class="fill"></div><span class="val">-</span></div>' +
      '<div class="thin"><div class="mindbar" title="สติ/ความมั่นใจที่ถูกบั่นทอน"><div class="fill"></div></div>' +
      '<div class="ebar" title="พลังงาน"><div class="fill"></div></div></div>' +
      '<div class="skills"></div>';
    (panelSide(i) === "left" ? boxL : boxR).appendChild(panel);
    const q = (sel) => panel.querySelector(sel);
    const num = q(".pnum");
    if (layout.colors) {
      num.textContent = String(i + 1);
      num.style.background = layout.colors[i];
    } else {
      num.style.display = "none";
    }
    hud[i] = {
      panel,
      name: q(".pnm"),
      trail: q(".trail"),
      fill: q(".bar.hp .fill"),
      hpVal: q(".bar.hp .val"),
      skillBox: q(".skills"),
      mind: q(".mindbar .fill"),
      ebar: q(".ebar"),
      energy: q(".ebar .fill"),
      rows: [],
      builtFor: null,
    };
  }
}

function hpColor(ratio) {
  return ratio > 0.5 ? "#4cd964" : ratio > 0.25 ? "#ffcc00" : "#ff453a";
}

// สร้างไอคอนสกิลให้ตรงกับสกิลของตัวละคร (ขนาดช่องคงที่ ไม่ทำให้แผงสูงขึ้น)
function buildSkillRows(h, def) {
  if (h.builtFor === def) return false;
  h.builtFor = def;
  h.rows = [];
  h.skillBox.innerHTML = "";
  for (const sk of skillsOf(def)) {
    const wrap = document.createElement("div");
    wrap.className = "skw";
    wrap.title = (sk.name || sk.type) + " (คูลดาวน์ " + sk.cooldown + " วิ)";
    const bar = document.createElement("div");
    bar.className = "sk";
    const gl = document.createElement("i");
    gl.className = "gl";
    gl.textContent = skillIcon(sk);
    const fill = document.createElement("b");
    fill.className = "ov";
    const val = document.createElement("span");
    val.className = "cdn";
    bar.appendChild(gl);
    bar.appendChild(fill);
    bar.appendChild(val);
    const nm = document.createElement("span");
    nm.className = "skn";
    nm.textContent = sk.name || sk.type;
    wrap.appendChild(bar);
    wrap.appendChild(nm);
    h.skillBox.appendChild(wrap);
    h.rows.push({ bar, fill, val });
  }
  return true;
}

// ตั้งความมืดของไอคอน: pct = ความคืบหน้าคูลดาวน์ 0-100 (ส่วนที่ยังไม่หมดจะมืดไล่เป็นวงกลม)
function setSkillRow(row, cls, pct, txt) {
  row.bar.className = "sk" + cls;
  row.fill.style.setProperty("--r", 100 - pct + "%");
  row.val.textContent = txt;
}

// ก่อนเริ่มสู้: โชว์ข้อมูลของตัวละครที่เลือกไว้ในช่อง
function setIdleHud() {
  playerSels.forEach((sel, i) => {
    const def = CHARACTERS[sel.value];
    const h = hud[i];
    if (!def || !h || !h.panel) return;
    buildSkillRows(h, def);
    h.panel.className = "panel " + panelSide(i);
    h.panel.style.borderColor = layout && layout.colors ? layout.colors[i] : "";
    h.name.textContent = def.name;
    h.name.style.color = def.color;
    h.trail.style.width = "100%";
    h.fill.style.width = "100%";
    h.fill.style.background = hpColor(1);
    h.hpVal.textContent = def.hp + " / " + def.hp;
    if (h.mind) h.mind.style.width = "0%";
    if (h.ebar) {
      h.ebar.style.visibility = def.energyMax || def.staminaMax ? "visible" : "hidden";
      h.ebar.classList.toggle("stam", !!def.staminaMax);
      h.ebar.title = def.staminaMax ? "สตามินา" : "พลังงาน";
      h.energy.style.background = "";
      h.energy.style.width = "100%";
    }
    skillsOf(def).forEach((sk, j) => {
      const row = h.rows[j];
      if (row) setSkillRow(row, "", 0, sk.cooldown);
    });
  });
}

// ระหว่างสู้: อัปเดตเลือดและคูลดาวน์ทุกเฟรม
function updateHud(b) {
  b.fighters.forEach((f, i) => {
    const h = hud[i];
    if (!h || !h.panel) return;
    buildSkillRows(h, f.def);
    const alive = f.hp > 0;
    const won = b.winner === f.team;
    h.panel.className = "panel " + panelSide(i) + (alive ? "" : " dead") + (won ? " winner" : "");
    h.panel.style.borderColor = layout && layout.colors && !won ? layout.colors[i] : "";
    h.name.textContent = f.def.name;
    h.name.style.color = f.def.color;

    const ratio = f.hp / f.maxHp;
    const trail = (f.trailHp === undefined ? f.hp : f.trailHp) / f.maxHp;
    h.fill.style.width = ratio * 100 + "%";
    h.fill.style.background = hpColor(ratio);
    h.trail.style.width = trail * 100 + "%";
    h.hpVal.textContent = Math.ceil(f.hp) + " / " + f.maxHp;
    if (h.mind) h.mind.style.width = Math.min(100, f.mind) + "%";
    if (h.ebar) {
      h.ebar.style.visibility = f.def.energyMax || f.def.staminaMax ? "visible" : "hidden";
      if (f.def.energyMax) h.energy.style.width = Math.max(0, Math.min(100, (f.energy / f.def.energyMax) * 100)) + "%";
      else if (f.def.staminaMax) {
        const fr = Math.max(0, Math.min(1, f.stamina / f.def.staminaMax));
        h.energy.style.width = fr * 100 + "%";
        h.energy.style.background = f.exhausted ? "#ff5a4a" : fr > 0.5 ? "#7dde6a" : fr > (f.def.tiredBelow || 0.35) ? "#ffd65a" : "#ff8a4a";
      }
    }

    f.skills.forEach((sk, j) => {
      const row = h.rows[j];
      if (!row) return;
      let cls = "";
      let pct = 0;
      let txt = "";
      if (alive && b.winner === null) {
        if (f.cast && f.cast.i === j) {
          cls = " casting";
          pct = 100;
          txt = "!";
        } else {
          const remain = Math.max(0, f.cds[j]);
          if (remain <= 0.05 && f.silence > 0) {
            cls = " silenced";
            pct = 100;
            txt = "🔇";
          } else if (remain <= 0.05) {
            cls = " ready";
            pct = 100;
          } else {
            pct = Math.max(0, Math.min(1, 1 - remain / sk.cooldown)) * 100;
            txt = remain >= 10 ? String(Math.ceil(remain)) : remain.toFixed(1);
          }
        }
      }
      setSkillRow(row, cls, pct, txt);
    });
  });
}

// ป้ายผู้ชนะ วาดไว้ "หลัง" ตัวละคร เพื่อให้คนชนะที่ยังเด้งอยู่วิ่งผ่านหน้าป้ายได้
function drawWinnerBanner(b) {
  ctx.fillStyle = "rgba(0,0,0,0.38)";
  ctx.fillRect(0, H / 2 - 80, W, 150);
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  let text = "เสมอ!";
  if (b.winner !== "draw") {
    const L = b.layout;
    if (L && L.mode === "waves") {
      const kills = b.wave ? b.wave.kills : 0;
      text = b.winner === 0 ? "รอดครบ " + b.wave.total + " คลื่น! (กำจัด " + kills + " ตัว)" : "ตกรอบที่คลื่น " + b.wave.n + " (กำจัด " + kills + " ตัว)";
    } else if (L && L.mode === "2v2") text = TEAM_INFO[b.winner].name + " ชนะ!";
    else if (L && L.mode === "ffa") text = "ผู้เล่น " + (b.winner + 1) + " (" + b.fighters[b.winner].def.name + ") ชนะ!";
    else text = b.fighters[b.winner].def.name + " ชนะ!";
  }
  ctx.font = "700 " + (text.length > 18 ? 40 : 56) + "px " + FONT;
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
  const ly = 42 + 32 * labelRow++;
  ctx.strokeText(txt, W / 2, ly);
  ctx.fillStyle = "#ff6b8a";
  ctx.fillText(txt, W / 2, ly);
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
    labelRow = 0;
    const keyOf = (def) => charKey(def) || Object.keys(CHARACTERS)[0];
    if (battle.winner !== null) drawWinnerBanner(battle);
    if (battle.eraser && battle.eraser.cast) drawEraseBackdrop(battle);
    if (battle.slower && battle.slower.cast) drawSlowField(battle);
    drawGhosts();
    // เหม่อลอย = สีจาง/ขาวดำบางส่วน, คนที่ตัดเวลา = ตัวโปร่งแสงเรืองแดง (อยู่นอกความจริง)
    const gray = (on) => { ctx.filter = on ? "grayscale(0.85) brightness(0.85)" : "none"; };
    if (battle.phantom) drawPhantom(battle);
    drawWaves(battle);
    drawRunningHamsters(battle);
    drawWardenFx(battle, 1 / 60);
    drawWitherRings(1 / 60);
    drawSlashFx(1 / 60);
    battle.fighters.forEach((f) => {
      if (f.hp <= 0) return;
      gray(battle.isDazed(f));
      if (f === battle.eraser) {
        ctx.filter = "drop-shadow(0 0 10px #ff2a55)";
        ctx.globalAlpha = 0.72;
      }
      if (battle.layout && battle.layout.colors && f.idx >= 0 && battle.layout.colors[f.idx]) drawTeamMark(f, battle.layout.colors[f.idx], f.idx + 1);
      drawFighter(f, keyOf(f.def));
      if (f.isEnemy) drawEnemyBar(f);
      ctx.globalAlpha = 1;
      if (f === battle.eraser) ctx.filter = "none";
      if (f.weapon && !f.disarmed) (f.weapon.type === "compass" ? drawCompass(f) : drawKatana(f));
      if (f.cast && f.cast.sk.type === "timeaccel") drawAccelAura(f);
      if (f.cast && f.cast.sk.type === "squeeze") drawHamster(f);
      if (f.cast && f.cast.sk.type === "metavision") drawMetaAura(f);
      if (f.ego) drawEgoAura(f);
      if (f.def.armorAt) drawWitherSelf(f);
      if (f.bleedT > 0) drawBleed(f);
      if (f.mind > 4 || f.stun > 0 || battle.isDazed(f)) drawMindAura(f);
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
    for (const f of battle.fighters) if (f.hp > 0) drawDuelLink(f);

    if (battle.hoop) drawHoop(battle.hoop);
    for (const lb of battle.looseBalls || []) { // ลูกบาสที่ตกพื้น (ค่อยๆ จางหายตอนหยุดนิ่ง)
      ctx.globalAlpha = lb.rest > 0 ? Math.max(0, 1 - lb.rest / 1.2) : 1;
      drawBasketball({ x: lb.x, y: lb.y, r: lb.r, t: lb.rest > 0 ? 0 : lb.t * 0.6, spin: lb.spin, z: lb.z });
      ctx.globalAlpha = 1;
    }
    for (const gu of battle.guests || []) drawGuest(gu);
    for (const fl of battle.flowers) drawFlower(fl);
    drawBallTrail();
    for (const b of battle.balls) drawBall(b);
    drawMetaFx();
    for (const p of battle.projectiles) {
      gray(battle.isDazed(p.owner));
      if (p.shape === "note") { drawNote(p); gray(false); continue; }
      if (p.shape === "text") { drawWord(p); gray(false); continue; }
      if (p.shape === "four") { drawFour(p); gray(false); continue; }
      if (p.shape === "witherskull") { drawWitherSkull(p); gray(false); continue; }
      if (p.shape === "soccer") { drawSoccer(p); gray(false); continue; }
      if (p.shape === "dart") { drawDart(p); gray(false); continue; }
      if (p.shape === "basketball") { drawBasketball(p); gray(false); continue; }
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
    drawMetaVignette();
    drawWaveHud(battle);
    for (const f of battle.fighters) {
      if (!f.cast || f.hp <= 0) continue;
      const c = f.cast;
      const left = Math.max(0, c.sk.duration - c.t).toFixed(1);
      if (c.sk.type === "timeaccel") drawTimeLabel("⏩ เร่งเวลา x" + (c.sk.rate || 2) + "  " + left + " วิ", "#ffcf5a");
      else if (c.sk.type === "timeslow") drawTimeLabel("⏳ ชะลอเวลา  " + left + " วิ", "#7ff5dc");
      else if (c.sk.type === "metavision") drawTimeLabel("👁 Meta Vision  " + left + " วิ  (หลบได้อีก " + Math.max(0, (c.sk.maxDodges || 0) + Math.floor(Math.min(1, ((f.metaMem && f.metaMem.level) || 0) / (c.sk.adaptMax || 10)) * (c.sk.adaptDodges !== undefined ? c.sk.adaptDodges : 4)) - (c.dodges || 0)) + ")" + (f.metaMem && f.metaMem.level ? "  วิเคราะห์ " + f.metaMem.level + "/" + (c.sk.adaptMax || 10) : ""), "#8fe0ff");
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
  const dt = Math.min(0.033, (ts - lastTs) / 1000 || 0) * (paused ? 0 : speedMult);
  lastTs = ts;
  if (battle) {
    if (labMode) labTick(dt);
    // แบ่งก้าวย่อย กันกระสุนเร็วทะลุตัว
    const steps = Math.max(1, Math.ceil(dt / 0.008));
    for (let i = 0; i < steps; i++) {
      battle.update(dt / steps);
      handleEvents(battle.events);
    }
  }
  updateEffects(dt);
  render();
  if (battle && !labMode) { updateHud(battle); updateMusic(battle); }
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

// ---------- ปรับขนาดสนามให้พอดีจอ (สี่เหลี่ยมจัตุรัส ขนาดคงที่) ----------
// ขนาดสนามคำนวณจาก "ขนาดหน้าต่าง + โหมด" เท่านั้น ไม่ขึ้นกับตัวละครที่เลือกหรือเนื้อหาในแผง
// จอกว้าง: แผงผู้เล่นอยู่ซ้าย/ขวาของสนาม | จอแคบ (มือถือ): แผงอยู่เหนือสนาม สูงคงที่
const SIDE_W = 210;   // ความกว้างแผงข้างสนาม (จอกว้าง)
const GAP = 10;
const PANEL_H_WIDE = 96;   // ความสูงแผงต่อผู้เล่น (จอกว้าง ไอคอนมีชื่อสกิลใต้ไอคอน)
const PANEL_H_NARROW = 66; // ความสูงแผงต่อผู้เล่น (จอแคบ ไอคอนอย่างเดียว)
function fitCanvas() {
  if (typeof window === "undefined" || !window.innerHeight) return;
  const stage = document.getElementById("stage");
  if (!stage || !stage.getBoundingClientRect) return;
  const parent = stage.parentElement;
  const pageW = (parent && parent.clientWidth ? parent.clientWidth : window.innerWidth);
  const top = stage.getBoundingClientRect().top + (window.scrollY || 0);
  const availH = window.innerHeight - top - 28; // เผื่อบรรทัดเวอร์ชันด้านล่าง
  const nL = hud.filter((_, i) => panelSide(i) === "left").length;
  const nR = hud.length - nL;
  const rows = Math.max(1, nL, nR);

  // จอกว้างพอวางแผงสองข้างได้ไหม (ต้องเหลือสนามอย่างน้อย 380px)
  const wideSize = Math.floor(Math.min(W, pageW - 2 * SIDE_W - 2 * GAP - 4, availH));
  const wide = wideSize >= 380;
  stage.classList.toggle("wide", wide);
  stage.classList.toggle("narrow", !wide);

  let size;
  if (wide) {
    size = wideSize;
    stage.style.setProperty("--ph", PANEL_H_WIDE + "px");
    stage.style.width = size + 2 * SIDE_W + 2 * GAP + "px";
  } else {
    const hudH = rows * PANEL_H_NARROW + (rows - 1) * 4 + 6;
    size = Math.floor(Math.max(240, Math.min(W, pageW - 8, availH - hudH)));
    stage.style.setProperty("--ph", PANEL_H_NARROW + "px");
    stage.style.width = size + "px";
  }
  stage.style.setProperty("--arena", size + "px");
}

// ---------- ตรวจว่าไฟล์ JS โหลดครบและเป็นเวอร์ชันเดียวกัน ----------
const EXPECTED_VERSION = 41;
function checkVersions() {
  const el = document.getElementById("ver");
  if (!el || typeof window === "undefined" || !window.BB_FILES) return;
  const stale = ["characters", "battle", "audio", "waves"].filter((k) => window.BB_FILES[k] !== EXPECTED_VERSION);
  if (stale.length) {
    el.className = "ver warn";
    el.textContent =
      "ไฟล์เหล่านี้ยังเป็นเวอร์ชันเก่าหรือไม่ได้อัปโหลด: " +
      stale.map((k) => "js/" + k + ".js").join(", ") +
      " — อัปโหลดไฟล์ใหม่ทับ แล้วรีเฟรชแรงๆ (Ctrl+Shift+R)";
  } else {
    el.textContent = "เวอร์ชัน " + EXPECTED_VERSION + " · UI 72";
  }
}

// จำโหมดที่เล่นล่าสุด
try {
  const sm = localStorage.getItem("bb_mode");
  if (sm && ["1v1", "2v2", "ffa", "waves"].includes(sm)) selMode.value = sm;
  const sw = JSON.parse(localStorage.getItem("bb_wave") || "null");
  if (sw) {
    if (ENEMY_CATEGORIES[sw.cat]) waveCfg.cat = sw.cat;
    if (WAVE_TOTAL_CHOICES.includes(sw.total)) waveCfg.total = sw.total;
    if ([1, 2, 3, 4].includes(sw.heroes)) waveCfg.heroes = sw.heroes;
  }
  const sc = localStorage.getItem("bb_ffa");
  if (sc && ["3", "4", "5", "6"].includes(sc)) selCount.value = sc;
} catch (e) { /* ข้าม */ }
buildModeCards();
rebuildPlayers();
setView("menu");
checkVersions();
fitCanvas();
if (typeof window !== "undefined" && window.addEventListener) {
  window.addEventListener("resize", fitCanvas);
  window.addEventListener("resize", () => { if (labMode) mountLab(); });
  window.addEventListener("orientationchange", () => setTimeout(fitCanvas, 100));
}
Promise.all([loadAllImages(), loadFonts()]).then(() => {
  fitCanvas(); // ฟอนต์โหลดเสร็จอาจทำให้แถบปุ่มสูงขึ้น คำนวณใหม่อีกรอบ
  requestAnimationFrame(loop);
});
