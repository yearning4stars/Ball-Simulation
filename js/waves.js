// ============================================================
//  โหมดเอาชีวิตรอดเป็นคลื่น (Survival Waves)
//
//  ผู้เล่น 1-4 คน (ทีม 0) รับมือศัตรู (ความยากไม่เปลี่ยนตามจำนวนผู้เล่น)ที่ทยอยเข้ามาเป็นคลื่นๆ ผ่านครบ = ชนะ (หรือเล่นไม่จำกัดจนตาย)
//  ทุกๆ 5 คลื่นมีบอส (role "brute") คลื่นยิ่งสูงยิ่งเยอะและอึดขึ้น
//
//  หมวดศัตรู = ENEMY_CATEGORIES (เพิ่มหมวดใหม่ได้โดยเพิ่มรายการ ไม่ต้องแก้ที่อื่น)
//    skin: "ball"   = ตัววาดด้วยโค้ด (สไตล์อยู่ใน BALL_STYLES ของ main.js คีย์ "<หมวด>_<role>")
//    skin: "sprite" = ใช้รูป PNG ของคุณเอง วางที่ imageDir/<role>.png  (walker / runner / spitter / brute)
//                     ยังไม่มีไฟล์ = แสดงเป็นบอลสีเปล่าไปก่อน
//  แต่ละหมวดมีศัตรู 4 role เหมือนกัน (สถานะและสกิลอยู่ใน ENEMY_ROLES) หมวดตั้งได้แค่ชื่อ/สี/ภาพ
// ============================================================

// สถานะพื้นฐานของแต่ละ role (ก่อนคูณตามคลื่น)
const ENEMY_ROLES = {
  walker: {
    // ตัวธรรมดา เดินช้าแต่มาเป็นฝูง ตะปบระยะประชิด
    hp: 26, speed: 82, radius: 26,
    skills: [
      { type: "slash", name: "ตะปบ", cooldown: 1.3, initialCooldown: 0.6, frame: "idle", duration: 0.5, fireDelay: 0.28, reach: 78, arcDeg: 110, step: 260, maxRange: 95, damage: 5, knockback: 70 },
    ],
  },
  runner: {
    // ตัวพุ่ง วิ่งเร็ว เลือดน้อย กระโจนใส่
    hp: 16, speed: 140, radius: 22,
    skills: [
      { type: "dash", name: "พุ่งกัด", cooldown: 2.4, initialCooldown: 1.0, frame: "idle", duration: 0.5, speedMult: 2.6, homing: 2, damage: 6, knockback: 140 },
    ],
  },
  spitter: {
    // ตัวยิงไกล ถ่มกระสุนใส่จากระยะ
    hp: 20, speed: 66, radius: 24,
    skills: [
      { type: "projectile", name: "ถ่มกรด", cooldown: 2.2, initialCooldown: 1.0, frame: "idle", duration: 0.4, fireDelay: 0.2, damage: 5, projectileSpeed: 330, projectileRadius: 8 },
    ],
  },
  brute: {
    // บอส ตัวใหญ่ อึด ทุบแรง และพุ่งชน
    hp: 210, speed: 60, radius: 46,
    skills: [
      { type: "slash", name: "ทุบ", cooldown: 2.4, initialCooldown: 1.0, frame: "idle", duration: 0.7, fireDelay: 0.4, reach: 120, arcDeg: 150, step: 300, maxRange: 140, damage: 14, knockback: 240 },
      { type: "dash", name: "พุ่งชนทะลวง", cooldown: 5.5, initialCooldown: 3.0, frame: "idle", duration: 0.6, speedMult: 3, homing: 1.6, damage: 16, knockback: 320 },
    ],
  },
};

const ENEMY_CATEGORIES = {
  zombie: {
    name: "ซอมบี้",
    icon: "🧟",
    desc: "ฝูงเดินช้า มีตัวพุ่งและตัวถ่มกรด บอสคือซอมบี้ยักษ์",
    skin: "ball", // วาดด้วยโค้ด (ไม่ต้องมีรูป)
    roles: {
      walker: { name: "ซอมบี้", color: "#7fae5a" },
      runner: { name: "ซอมบี้วิ่ง", color: "#9bbf4a" },
      spitter: { name: "ซอมบี้ถ่มกรด", color: "#4fae8a" },
      brute: { name: "ซอมบี้ยักษ์", color: "#5d7f3f" },
    },
  },
  skibidi: {
    name: "สกิบิดี้",
    icon: "🚽",
    desc: "Normal / Mini / Police / Large Toilet · ใส่รูปของคุณเองที่ assets/enemies/skibidi/ (walker, runner, spitter, brute .png)",
    skin: "sprite", // ตัวละครนี้มีลิขสิทธิ์ ผมไม่ได้วาดให้ ใส่ PNG ของคุณเอง
    imageDir: "assets/enemies/skibidi/",
    roles: {
      walker: { name: "Normal Toilet", color: "#c9d3e6", hp: 4 }, // hp ตายตัว (ไม่เพิ่มตามคลื่น)
      runner: { name: "Mini Toilet", color: "#e6c9d3", hp: 2 },
      spitter: { name: "Police Toilet", color: "#9fb8e6", hp: 3 },
      brute: { name: "Large Toilet", color: "#e6dcc9", hp: 10 },
    },
  },
};

const DEFAULT_ENEMY_CATEGORY = "zombie";
const WAVE_TOTAL_CHOICES = [5, 10, 0]; // 0 = ไม่จำกัด (เล่นจนตาย)
const BOSS_EVERY = 5;

// คีย์ของศัตรู ใช้เป็นคีย์ภาพ/สไตล์บอล เช่น "zombie_walker"
const enemyKey = (cat, role) => cat + "_" + role;

// สร้าง def ของศัตรูสำหรับคลื่นที่ n (คลื่นสูงขึ้น = อึด/แรง/เร็วขึ้นเล็กน้อย)
function makeEnemyDef(catId, role, n) {
  const cat = ENEMY_CATEGORIES[catId] || ENEMY_CATEGORIES[DEFAULT_ENEMY_CATEGORY];
  const tpl = ENEMY_ROLES[role];
  const ov = cat.roles[role];
  const hpM = 1 + 0.1 * (n - 1);
  const dmgM = 1 + 0.06 * (n - 1);
  const spM = Math.min(1.3, 1 + 0.015 * (n - 1));
  return {
    __enemy: true,
    __key: enemyKey(catId, role),
    name: ov.name,
    color: ov.color,
    hp: ov.hp !== undefined ? ov.hp : Math.round(tpl.hp * hpM), // หมวดที่กำหนด hp เอง = ใช้ค่านั้นตลอดทุกคลื่น
    speed: Math.round(tpl.speed * spM),
    radius: tpl.radius,
    skin: cat.skin,
    boss: role === "brute",
    frames: { idle: cat.skin === "sprite" ? cat.imageDir + role + ".png" : "" },
    skills: tpl.skills.map((s) => Object.assign({}, s, { damage: Math.max(1, Math.round(s.damage * dmgM)) })),
  };
}

// รายชื่อศัตรูของคลื่นที่ n (แค่ role) heroes = จำนวนผู้เล่น (คนเยอะ = ศัตรูเยอะขึ้น)
function waveRoster(n, heroes, rng) {
  rng = rng || Math.random;
  const scale = 1; // จำนวนศัตรูไม่เพิ่มตามจำนวนผู้เล่น (heroes ไม่ใช้แล้ว)
  const cnt = (v) => Math.round(v * scale);
  const list = [];
  const add = (role, k) => { for (let i = 0; i < k; i++) list.push(role); };
  add("walker", cnt(3 + n * 1.6));
  if (n >= 2) add("runner", cnt((n - 1) * 1.1));
  if (n >= 3) add("spitter", cnt((n - 2) * 0.8));
  if (n % BOSS_EVERY === 0) add("brute", Math.max(1, Math.round((n / BOSS_EVERY) * Math.max(1, scale * 0.8))));
  for (let i = list.length - 1; i > 0; i--) { // สลับลำดับ ให้ตัวหลากชนิดทยอยออกมาปนกัน
    const j = Math.floor(rng() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list.slice(0, 48);
}

// ตั้งค่าที่ส่งให้ Battle.startSurvival
function surviveConfig(catId, total, heroes) {
  return {
    category: catId,
    total, // 0 = ไม่จำกัด
    maxAlive: 9, // อยู่บนสนามพร้อมกันไม่เกินนี้ ที่เหลือรอทยอยเข้า (ไม่เปลี่ยนตามจำนวนผู้เล่น)
    breakT: 3.2, // พักระหว่างคลื่น (วินาที)
    firstT: 2.5, // รอก่อนคลื่นแรก
    healFrac: 0.3, // จบคลื่นฟื้นเลือดผู้เล่นที่ยังรอด 30%
    spawn: (n, rng) => waveRoster(n, heroes, rng).map((role) => makeEnemyDef(catId, role, n)),
  };
}

// รายการภาพที่ต้องโหลด: [{key, src}] เฉพาะหมวดที่ใช้ PNG
function enemyImageList() {
  const out = [];
  for (const [cid, cat] of Object.entries(ENEMY_CATEGORIES)) {
    for (const role of Object.keys(cat.roles)) {
      out.push({ key: enemyKey(cid, role), src: cat.skin === "sprite" ? cat.imageDir + role + ".png" : null });
    }
  }
  return out;
}

if (typeof window !== "undefined") (window.BB_FILES = window.BB_FILES || {}).waves = 41;
if (typeof module !== "undefined") module.exports = { ENEMY_CATEGORIES, ENEMY_ROLES, makeEnemyDef, waveRoster, surviveConfig };
