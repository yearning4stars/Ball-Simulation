// ============================================================
//  เพลงธีมของโหมดเอาชีวิตรอดเป็นคลื่น
//
//  - มีเพลงสังเคราะห์ในตัวหลายธีม (สร้างจากโค้ด ไม่ต้องมีไฟล์เสียง) เล่นวนซ้ำ
//  - เลือกเพลงตามสถานการณ์: พักระหว่างคลื่น / คลื่นต้น-กลาง-ท้าย / บอส / คลื่นสุดท้าย / คลื่นที่กำหนดเฉพาะ / หมวดศัตรู
//  - อยากใช้เพลงของตัวเอง: ตั้งใน js/sound-config.js (หัวข้อ waves) หรือกด "🎵 ตั้งค่าเสียง" ในเกม
//    ไฟล์ที่ตั้งไว้จะ "ทับ" เพลงสังเคราะห์ของธีมชื่อเดียวกัน
//
//  ชื่อธีมในตัว: calm early mid late boss boss2 finale zombie skibidi
// ============================================================
(function () {
  // ---------- ธีมสังเคราะห์ ----------
  // bpm, bars, root (MIDI), scale, prog = [ระดับเสียงของคอร์ดต่อห้อง (องศาของสเกล 0-6)],
  // drums: แพตเทิร์น 16 ช่อง ("x" = ตี, "." = เว้น) ต่อห้อง
  // bass/arp/lead/pad: เปิด-ปิดและแบบเสียง
  const SCALES = {
    minor: [0, 2, 3, 5, 7, 8, 10],
    phrygian: [0, 1, 3, 5, 7, 8, 10],
    harmonic: [0, 2, 3, 5, 7, 8, 11],
    major: [0, 2, 4, 5, 7, 9, 11],
    dorian: [0, 2, 3, 5, 7, 9, 10],
  };

  const THEMES = {
    // พักระหว่างคลื่น: เบาๆ ผ่อนคลาย
    calm: {
      label: "พักระหว่างคลื่น (สงบ)", bpm: 72, bars: 8, root: 57, scale: "minor",
      prog: [0, 5, 2, 6, 0, 5, 6, 4], seed: 11,
      pad: { wave: "tri", vol: 0.55 }, arp: { pat: "x.x.x.x.x.x.x.x.", wave: "sine", vol: 0.35, oct: 1 },
      lead: { density: 0.22, wave: "sine", vol: 0.4, oct: 1 },
    },
    // คลื่นต้นๆ
    early: {
      label: "คลื่นต้น (เริ่มอุ่นเครื่อง)", bpm: 112, bars: 8, root: 57, scale: "minor",
      prog: [0, 0, 5, 6, 0, 0, 3, 6], seed: 23,
      bass: { pat: "x.x.x.x.x.x.x.xx", wave: "sq", vol: 0.6 },
      arp: { pat: "xxxxxxxxxxxxxxxx", wave: "pulse", vol: 0.28, oct: 1 },
      lead: { density: 0.35, wave: "pulse", vol: 0.45, oct: 1 },
      drums: { kick: "x...x...x...x...", snare: "....x.......x...", hat: "x.x.x.x.x.x.x.x." },
    },
    // คลื่นกลาง: เร่งขึ้น
    mid: {
      label: "คลื่นกลาง (เร่งจังหวะ)", bpm: 128, bars: 8, root: 50, scale: "dorian",
      prog: [0, 5, 6, 4, 0, 5, 6, 6], seed: 37,
      bass: { pat: "x.xxx.xxx.xxx.xx", wave: "saw", vol: 0.6 },
      arp: { pat: "x.xx.xx.x.xx.xx.", wave: "pulse", vol: 0.25, oct: 1 },
      lead: { density: 0.5, wave: "saw", vol: 0.4, oct: 1 },
      drums: { kick: "x...x...x...x...", snare: "....x.......x..x", hat: "..x...x...x...x." , hat2: true },
    },
    // คลื่นท้ายๆ: หนักและเร็ว
    late: {
      label: "คลื่นท้าย (ดุเดือด)", bpm: 144, bars: 8, root: 52, scale: "harmonic",
      prog: [0, 5, 3, 4, 0, 5, 6, 4], seed: 53,
      bass: { pat: "xxxxxxxxxxxxxxxx", wave: "saw", vol: 0.55 },
      arp: { pat: "xxxxxxxxxxxxxxxx", wave: "pulse", vol: 0.26, oct: 2 },
      lead: { density: 0.65, wave: "saw", vol: 0.42, oct: 1 },
      drums: { kick: "x..xx..xx..xx.x.", snare: "....x.......x.x.", hat: "xxxxxxxxxxxxxxxx" },
    },
    // บอส
    boss: {
      label: "บอส (หนักหน่วง)", bpm: 150, bars: 8, root: 48, scale: "phrygian",
      prog: [0, 1, 0, 6, 0, 1, 5, 6], seed: 71,
      bass: { pat: "x.xx.xx.x.xx.xxx", wave: "saw", vol: 0.7 },
      arp: { pat: "x.x.x.x.x.x.x.x.", wave: "sq", vol: 0.22, oct: 2 },
      lead: { density: 0.55, wave: "sq", vol: 0.45, oct: 1, stab: true },
      drums: { kick: "x.x.x..xx.x.x.x.", snare: "....x.......x...", hat: "x.x.x.x.x.x.x.xx" },
    },
    // บอสเฉพาะด่าน (ค่าเริ่มต้น: คลื่นที่ 10)
    boss2: {
      label: "บอสเฉพาะด่าน (คลั่ง)", bpm: 172, bars: 8, root: 45, scale: "harmonic",
      prog: [0, 0, 5, 4, 0, 6, 5, 4], seed: 89,
      bass: { pat: "xxxxxxxxxxxxxxxx", wave: "sq", vol: 0.6 },
      arp: { pat: "xxxxxxxxxxxxxxxx", wave: "pulse", vol: 0.3, oct: 2 },
      lead: { density: 0.75, wave: "saw", vol: 0.45, oct: 1, stab: true },
      drums: { kick: "x.xxx.xxx.xxx.xx", snare: "....x...x...x...", hat: "xxxxxxxxxxxxxxxx" },
    },
    // คลื่นสุดท้ายของโหมดที่มีจำนวนคลื่นจำกัด
    finale: {
      label: "คลื่นสุดท้าย (ฮึกเหิม)", bpm: 138, bars: 8, root: 53, scale: "major",
      prog: [0, 4, 5, 3, 0, 4, 5, 4], seed: 97,
      pad: { wave: "saw", vol: 0.3 },
      bass: { pat: "x.x.x.x.x.x.x.x.", wave: "saw", vol: 0.55 },
      arp: { pat: "xxxxxxxxxxxxxxxx", wave: "pulse", vol: 0.24, oct: 1 },
      lead: { density: 0.7, wave: "saw", vol: 0.45, oct: 1 },
      drums: { kick: "x...x...x...x..x", snare: "....x.......x...", hat: "x.x.x.x.x.x.x.xx" },
    },
    // ธีมหมวดซอมบี้: ลึกลับ น่ากลัว
    zombie: {
      label: "หมวดซอมบี้ (ขนลุก)", bpm: 100, bars: 8, root: 46, scale: "phrygian",
      prog: [0, 0, 1, 0, 0, 5, 1, 0], seed: 5,
      pad: { wave: "tri", vol: 0.4 },
      bass: { pat: "x.....x...x.....", wave: "tri", vol: 0.8 },
      arp: { pat: "x..x..x..x..x.x.", wave: "sine", vol: 0.3, oct: 2 },
      lead: { density: 0.3, wave: "sq", vol: 0.3, oct: 1 },
      drums: { kick: "x.......x.......", snare: "........x.......", hat: "..x...x...x...x." },
    },
    // ธีมหมวดสกิบิดี้: ตลกๆ เด้งๆ
    skibidi: {
      label: "หมวดสกิบิดี้ (ป่วนๆ)", bpm: 124, bars: 8, root: 55, scale: "major",
      prog: [0, 3, 4, 0, 0, 3, 4, 4], seed: 17,
      bass: { pat: "x..x..x.x..x..x.", wave: "sq", vol: 0.55 },
      arp: { pat: "x.xx.x.xx.xx.x.x", wave: "pulse", vol: 0.28, oct: 1 },
      lead: { density: 0.6, wave: "pulse", vol: 0.45, oct: 2 },
      drums: { kick: "x..x..x.x..x..x.", snare: "....x.......x.x.", hat: "x.x.x.x.x.x.x.x." },
    },
  };

  // ---------- ตัวสร้างเสียง ----------
  const SR = 32000;
  const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

  function rngFrom(seed) { // สุ่มแบบกำหนดผลได้ (เพลงเดิมได้ทำนองเดิมทุกครั้ง)
    let s = seed >>> 0;
    return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  }

  function osc(wave, ph) { // ph = 0..1
    switch (wave) {
      case "sine": return Math.sin(ph * 6.2831853);
      case "tri": return 4 * Math.abs(ph - 0.5) - 1;
      case "saw": return 2 * ph - 1;
      case "pulse": return ph < 0.25 ? 1 : -1;
      default: return ph < 0.5 ? 1 : -1; // sq
    }
  }

  // เล่นโน้ตหนึ่งตัวลงบัฟเฟอร์ (วนต่อหัวบัฟเฟอร์ เพื่อให้ลูปเนียน)
  function note(buf, startSec, durSec, midi, wave, vol, atk, rel) {
    const N = buf.length;
    const f = mtof(midi);
    const total = Math.floor((durSec + rel) * SR);
    const s0 = Math.floor(startSec * SR);
    let ph = 0;
    const inc = f / SR;
    const aN = Math.max(1, atk * SR);
    const dN = durSec * SR;
    const rN = Math.max(1, rel * SR);
    for (let i = 0; i < total; i++) {
      let env;
      if (i < aN) env = i / aN;
      else if (i < dN) env = 1 - 0.35 * ((i - aN) / Math.max(1, dN - aN)); // ลดลงเล็กน้อยระหว่างถือ
      else env = 0.65 * Math.max(0, 1 - (i - dN) / rN);
      buf[(s0 + i) % N] += osc(wave, ph) * env * vol;
      ph += inc; if (ph >= 1) ph -= 1;
    }
  }

  function kick(buf, startSec, vol) {
    const N = buf.length, s0 = Math.floor(startSec * SR), len = Math.floor(0.22 * SR);
    let ph = 0;
    for (let i = 0; i < len; i++) {
      const t = i / SR;
      const f = 45 + 110 * Math.exp(-t * 28);
      ph += f / SR;
      buf[(s0 + i) % N] += Math.sin(ph * 6.2831853) * Math.exp(-t * 14) * vol;
    }
  }

  function noiseHit(buf, startSec, len, decay, vol, hp, tone, rnd) {
    const N = buf.length, s0 = Math.floor(startSec * SR), n = Math.floor(len * SR);
    let prev = 0, ph = 0;
    for (let i = 0; i < n; i++) {
      const t = i / SR;
      let x = rnd() * 2 - 1;
      if (hp) { const y = x - prev; prev = x; x = y; } // กรองให้แหลม (ไฮแฮต)
      let v = x * Math.exp(-t * decay);
      if (tone) { ph += tone / SR; v += Math.sin(ph * 6.2831853) * Math.exp(-t * decay * 0.8) * 0.6; }
      buf[(s0 + i) % N] += v * vol;
    }
  }

  // คอร์ด: ไทรแอดจากสเกล (องศา d, d+2, d+4)
  function chordTones(scale, degree, root) {
    const at = (deg) => root + scale[((deg % 7) + 7) % 7] + 12 * Math.floor(deg / 7);
    return [at(degree), at(degree + 2), at(degree + 4)];
  }

  function render(id) {
    const T = THEMES[id];
    if (!T) return null;
    const scale = SCALES[T.scale];
    const stepSec = 60 / T.bpm / 4;
    const steps = T.bars * 16;
    const N = Math.round(steps * stepSec * SR);
    const buf = new Float32Array(N);
    const rnd = rngFrom(T.seed);
    const noise = rngFrom(T.seed * 7 + 1);
    const barSec = stepSec * 16;

    // ทำนองหลัก: สุ่มแบบกำหนดผลได้ โดยจังหวะหนักตกที่โน้ตของคอร์ด
    let prevDeg = 4;
    for (let bar = 0; bar < T.bars; bar++) {
      const cd = T.prog[bar % T.prog.length];
      const tones = chordTones(scale, cd, T.root);
      const t0 = bar * barSec;

      if (T.pad) {
        for (const m of tones) note(buf, t0, barSec * 0.98, m + 12, T.pad.wave, T.pad.vol * 0.12, 0.25, 0.3);
      }
      if (T.bass) {
        const bm = tones[0] - 12;
        for (let s = 0; s < 16; s++) {
          if (T.bass.pat[s] !== "x") continue;
          note(buf, t0 + s * stepSec, stepSec * 0.85, bm, T.bass.wave, T.bass.vol * 0.2, 0.004, 0.05);
        }
      }
      if (T.arp) {
        const seq = [tones[0], tones[1], tones[2], tones[1]];
        for (let s = 0; s < 16; s++) {
          if (T.arp.pat[s] !== "x") continue;
          const m = seq[s % 4] + 12 * (T.arp.oct || 1);
          note(buf, t0 + s * stepSec, stepSec * 0.7, m, T.arp.wave, T.arp.vol * 0.1, 0.003, 0.04);
        }
      }
      if (T.lead) {
        let s = 0;
        while (s < 16) {
          const strong = s % 4 === 0;
          if (rnd() < T.lead.density * (strong ? 1.25 : 0.8)) {
            let deg;
            if (strong) deg = cd + [0, 2, 4, 7][Math.floor(rnd() * 4)]; // โน้ตคอร์ดบนจังหวะหนัก
            else deg = prevDeg + [-2, -1, 1, 2][Math.floor(rnd() * 4)];
            deg = Math.max(cd - 2, Math.min(cd + 9, deg));
            prevDeg = deg;
            const len = T.lead.stab ? 1 : (rnd() < 0.5 ? 2 : (strong ? 4 : 1));
            const m = T.root + scale[((deg % 7) + 7) % 7] + 12 * Math.floor(deg / 7) + 12 * (T.lead.oct || 1);
            note(buf, t0 + s * stepSec, stepSec * len * 0.92, m, T.lead.wave, T.lead.vol * 0.16, 0.006, 0.08);
            s += len;
          } else s++;
        }
      }
      if (T.drums) {
        for (let s = 0; s < 16; s++) {
          const ts = t0 + s * stepSec;
          if (T.drums.kick[s] === "x") kick(buf, ts, 0.7);
          if (T.drums.snare[s] === "x") noiseHit(buf, ts, 0.16, 22, 0.28, false, 190, noise);
          if (T.drums.hat[s] === "x") noiseHit(buf, ts, 0.05, 70, 0.1, true, 0, noise);
        }
      }
    }

    // ปรับระดับเสียงให้พอเหมาะ (ยอดสูงสุด ~0.6) และกันคลิกตรงรอยต่อลูป
    let peak = 0;
    for (let i = 0; i < N; i++) { const a = Math.abs(buf[i]); if (a > peak) peak = a; }
    const g = peak > 0 ? 0.6 / peak : 1;
    for (let i = 0; i < N; i++) buf[i] *= g;
    return { data: buf, sampleRate: SR };
  }

  // ---------- เลือกเพลงตามสถานการณ์ ----------
  // wc = SOUND_CONFIG.waves; info = { state: "break"|"fight", n, total, boss, category }
  const DEFAULTS = {
    break: "calm",
    fight: [{ upTo: 3, music: "early" }, { upTo: 7, music: "mid" }, { music: "late" }],
    boss: "boss",
    finale: "finale",
    byWave: { 10: "boss2" },
    byCategory: { zombie: "zombie", skibidi: "skibidi" },
  };

  function pick(wc, info) {
    wc = wc || {};
    const v = (k) => (wc[k] !== undefined ? wc[k] : DEFAULTS[k]);
    if (info.state === "break") return v("break") || null;
    const byWave = v("byWave") || {};
    if (byWave[info.n]) return byWave[info.n]; // เพลงเฉพาะด่านชนะทุกอย่าง
    if (info.total && info.n >= info.total) return v("finale") || null; // คลื่นสุดท้าย
    if (info.boss) return v("boss") || null;
    const byCat = v("byCategory") || {};
    if (byCat[info.category]) return byCat[info.category];
    const tiers = v("fight") || [];
    for (const t of tiers) if (t.upTo === undefined || info.n <= t.upTo) return t.music;
    return null;
  }

  const api = { THEMES, DEFAULTS, render, pick, ids: () => Object.keys(THEMES) };
  if (typeof window !== "undefined") window.WaveMusic = api;
  if (typeof module !== "undefined") module.exports = api;
})();
