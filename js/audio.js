// ============================================================
//  เสียงทั้งหมดสร้างจากโค้ดด้วย Web Audio (ไม่ต้องมีไฟล์เสียง)
//  อยากใช้ไฟล์เสียง/เพลงของตัวเอง: ใส่ใน js/sound-config.js หรือกดปุ่ม "🎵 ตั้งค่าเสียง" ในเกม (ไม่ต้องแก้ไฟล์นี้)
//  เสียงที่ไม่ได้ตั้งไว้จะใช้เสียงสังเคราะห์ในไฟล์นี้เหมือนเดิม
//
//  เบราว์เซอร์จะอนุญาตให้มีเสียงหลังผู้ใช้กดอะไรสักอย่างเท่านั้น
//  เกมนี้เริ่มเสียงตอนกดปุ่มครั้งแรก
// ============================================================
class SoundFX {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.noiseBuf = null;
    this.lastPlay = {}; // กันเสียงเดียวกันรัวเกินไป
    this.muted = false;
    this.sfxBus = null;
    this.musicBus = null;
    this.pending = {};   // key -> { src: URL | Blob, name } ไฟล์ที่รอแปลงเสียง
    this.buffers = {};   // key -> [AudioBuffer]
    this.sources = {};   // key -> "config" | "upload" (ไว้โชว์ในหน้าตั้งค่า)
    this.names = {};     // key -> ชื่อไฟล์
    this.music = null;   // เพลงที่เล่นอยู่ { key, src, g, ... }
    this.resume = {};    // key -> ตำแหน่งที่เล่นค้างไว้ (วินาที)
    this.sfxVol = 1;
    this.musicVol = 0.7;
    try {
      const v = JSON.parse(localStorage.getItem("bb_vol") || "{}");
      if (typeof v.sfx === "number") this.sfxVol = v.sfx;
      if (typeof v.music === "number") this.musicVol = v.music;
    } catch (e) { /* ข้าม */ }
    try {
      this.muted = localStorage.getItem("bb_muted") === "1";
    } catch (e) { /* ไม่มี localStorage ก็ข้าม */ }
  }

  // เรียกจากการกดปุ่ม/คลิก เพื่อปลดล็อกเสียง
  unlock() {
    if (this.ctx) {
      if (this.ctx.state === "suspended") this.ctx.resume();
      return;
    }
    const AC = typeof window !== "undefined" && (window.AudioContext || window.webkitAudioContext);
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.5;
    this.master.connect(this.ctx.destination);
    this.sfxBus = this.ctx.createGain();
    this.sfxBus.gain.value = this.sfxVol;
    this.sfxBus.connect(this.master);
    this.musicBus = this.ctx.createGain();
    this.musicBus.gain.value = this.musicVol;
    this.musicBus.connect(this.master);

    // บัฟเฟอร์เสียงซ่า ใช้ซ้ำทุกเสียงที่ต้องการ noise
    const len = this.ctx.sampleRate;
    this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    this.decodePending();
  }

  setMuted(m) {
    this.muted = m;
    try { localStorage.setItem("bb_muted", m ? "1" : "0"); } catch (e) { /* ข้าม */ }
    if (this.master) this.master.gain.value = m ? 0 : 0.5;
  }

  toggleMute() {
    this.setMuted(!this.muted);
    return this.muted;
  }

  // ---------- ตัวช่วยสร้างเสียง ----------
  _tone(freq, endFreq, dur, type, vol, delay = 0) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (endFreq !== freq) osc.frequency.exponentialRampToValueAtTime(Math.max(1, endFreq), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(this.sfxBus);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  _noise(dur, vol, filterType, f0, f1, delay = 0) {
    if (!this.ctx || !this.noiseBuf) return;
    const t = this.ctx.currentTime + delay;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const filter = this.ctx.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) filter.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filter).connect(g).connect(this.sfxBus);
    src.start(t);
    src.stop(t + dur + 0.02);
  }

  _throttle(name, ms) {
    const now = performance.now();
    if (this.lastPlay[name] && now - this.lastPlay[name] < ms) return false;
    this.lastPlay[name] = now;
    return true;
  }

  // ---------- เสียงที่เกมเรียกใช้ ----------
  click() { // ปุ่ม / เปลี่ยนตัวเลือก
    if (!this._throttle("click", 40)) return;
    this._tone(880, 620, 0.07, "square", 0.08);
  }

  start() { // เริ่มสู้
    this._tone(392, 392, 0.12, "square", 0.1, 0);
    this._tone(523, 523, 0.12, "square", 0.1, 0.12);
    this._tone(784, 784, 0.25, "square", 0.12, 0.24);
  }

  shoot() { // ยิงปืน
    if (!this._throttle("shoot", 60)) return;
    this._noise(0.12, 0.22, "highpass", 1800, 900);
    this._tone(420, 90, 0.13, "sawtooth", 0.14);
  }

  kick() { // เตะบอล: ตุ้บหนักๆ + ลมหวิว
    if (!this._throttle("kick", 80)) return;
    this._tone(170, 60, 0.12, "sine", 0.3);
    this._noise(0.1, 0.18, "lowpass", 900, 200);
    this._tone(300, 520, 0.1, "triangle", 0.05, 0.03);
  }

  meta() { // Meta Vision: ใสๆ ขึ้นสูงเหมือนตาเปิด
    this._tone(660, 1320, 0.35, "sine", 0.1);
    this._tone(990, 1980, 0.3, "triangle", 0.05, 0.08);
    this._noise(0.3, 0.06, "highpass", 4500, 6000);
  }

  dodge() { // หลบ: วูบเบาๆ
    if (!this._throttle("dodge", 120)) return;
    this._noise(0.18, 0.2, "bandpass", 1800, 600);
    this._tone(900, 400, 0.14, "triangle", 0.06);
  }

  hit() { // โดนตี / ชน
    if (!this._throttle("hit", 60)) return;
    this._tone(200, 55, 0.14, "square", 0.16);
    this._noise(0.09, 0.2, "lowpass", 1400, 300);
  }

  dash() { // พุ่ง
    if (!this._throttle("dash", 100)) return;
    this._noise(0.32, 0.22, "bandpass", 500, 3200);
    this._tone(180, 520, 0.28, "triangle", 0.07);
  }

  note() { // โน้ตดนตรีตอนร้องเพลง (สุ่มโน้ตในบันไดเสียงเพนทาโทนิก)
    if (!this._throttle("note", 70)) return;
    const scale = [523.25, 587.33, 659.25, 783.99, 880.0, 1046.5];
    const f = scale[Math.floor(Math.random() * scale.length)];
    this._tone(f, f, 0.28, "sine", 0.16);
    this._tone(f * 2, f * 2, 0.16, "triangle", 0.05);
  }

  wave() { // คลื่นเสียงกระแทก
    if (!this._throttle("wave", 150)) return;
    this._tone(140, 40, 0.5, "sawtooth", 0.2);
    this._tone(900, 200, 0.35, "square", 0.06);
    this._noise(0.45, 0.22, "lowpass", 1800, 150);
  }

  deflect() { // คลื่นเสียงผลัก/หยุดกระสุนศัตรู
    if (!this._throttle("deflect", 80)) return;
    this._tone(1400, 800, 0.1, "triangle", 0.1);
    this._noise(0.08, 0.1, "highpass", 3000, 3000);
  }

  slash() { // ฟันดาบ
    if (!this._throttle("slash", 60)) return;
    this._noise(0.14, 0.2, "highpass", 3500, 7000);
    this._tone(1800, 700, 0.12, "triangle", 0.07);
  }

  erase() { // ตัดเวลา: ตึงๆ แล้วเงียบสนิท
    this._tone(90, 30, 0.9, "sawtooth", 0.22);
    this._noise(0.7, 0.2, "lowpass", 3000, 100);
    this._tone(1200, 1200, 0.05, "square", 0.08, 0.02);
  }

  rewind() { // ย้อนเวลา: เสียงสไลด์ถอยหลังเร็วๆ
    for (let i = 0; i < 6; i++) this._tone(1400 - i * 160, 300 - i * 20, 0.16, "triangle", 0.1, i * 0.15);
    this._noise(0.9, 0.12, "bandpass", 4000, 400);
  }

  accel() { // เร่งเวลา: เสียงติ๊กๆ ถี่ขึ้นเรื่อยๆ แล้วพุ่งขึ้น
    for (let i = 0; i < 8; i++) this._tone(500 + i * 130, 650 + i * 190, 0.07, "square", 0.06, i * 0.05);
    this._noise(0.5, 0.12, "bandpass", 800, 5000);
  }

  slow() { // ชะลอเวลา: เสียงต่ำลากยาวลงๆ เหมือนเทปช้าลง
    this._tone(900, 110, 0.9, "sine", 0.14);
    this._tone(110, 55, 0.7, "triangle", 0.18, 0.05);
    this._noise(0.8, 0.1, "lowpass", 2500, 120);
  }

  word() { // คำพูดบั่นทอนใจ: เสียงกระซิบแหลมต่ำ
    if (!this._throttle("word", 120)) return;
    this._noise(0.3, 0.12, "bandpass", 1200, 500);
    this._tone(330, 311, 0.3, "sine", 0.07);
    this._tone(349, 330, 0.3, "sine", 0.05);
  }

  breakdown() { // สติแตก
    this._tone(700, 90, 0.5, "sawtooth", 0.14);
    this._noise(0.4, 0.15, "bandpass", 3000, 300);
  }

  ko() { // น็อก
    this._tone(260, 35, 0.7, "sawtooth", 0.22);
    this._noise(0.5, 0.3, "lowpass", 2200, 120);
  }

  win() { // เสียงชนะ (เล่นต่อจาก ko)
    const notes = [523, 659, 784, 1047];
    notes.forEach((f, i) => this._tone(f, f, 0.22, "triangle", 0.15, 0.55 + i * 0.13));
  }

  draw() { // เสมอ
    this._tone(330, 247, 0.4, "triangle", 0.14, 0.55);
    this._tone(247, 196, 0.5, "triangle", 0.14, 0.95);
  }
  // ---------- เสียง/เพลงที่ผู้เล่นใส่เอง ----------
  // key: "sfx:<ชื่อเสียง>" | "music:advantage" | "music:char:<ชื่อตัวละคร>"
  // src: URL (string) หรือ Blob  แปลงเป็นเสียงตอนปลดล็อกเสียงแล้ว (ถ้ายังไม่ปลดล็อกจะรอไว้)
  setCustom(key, src, kind, name) {
    this.pending[key] = { src };
    delete this.buffers[key];
    this.sources[key] = kind || "config";
    this.names[key] = name || (typeof src === "string" ? src.split("/").pop() : "ไฟล์ของคุณ");
    if (this.ctx) this.decodePending();
  }

  removeCustom(key) {
    delete this.pending[key];
    delete this.buffers[key];
    delete this.sources[key];
    delete this.names[key];
    if (this.music && this.music.key === key.replace(/^music:/, "")) this.musicStop(0.3);
  }

  hasCustom(key) {
    return !!(this.buffers[key] && this.buffers[key].length) || !!this.pending[key];
  }

  async decodePending() {
    if (!this.ctx) return;
    const keys = Object.keys(this.pending);
    for (const key of keys) {
      const items = [].concat(this.pending[key].src);
      delete this.pending[key];
      const out = [];
      for (const it of items) {
        try {
          const ab = typeof it === "string" ? await (await fetch(it)).arrayBuffer() : await it.arrayBuffer();
          out.push(await this.ctx.decodeAudioData(ab));
        } catch (e) { /* ไฟล์หาย/เปิดไม่ได้: ใช้เสียงสังเคราะห์แทน */ }
      }
      if (out.length) this.buffers[key] = out;
      else { delete this.sources[key]; delete this.names[key]; }
    }
  }

  _playCustom(name, vol) {
    const list = this.buffers["sfx:" + name];
    if (!this.ctx || !list || !list.length) return false;
    if (!this._throttle("c:" + name, 35)) return true;
    const src = this.ctx.createBufferSource();
    src.buffer = list[Math.floor(Math.random() * list.length)];
    src.playbackRate.value = 0.96 + Math.random() * 0.08; // ไม่ซ้ำกันเป๊ะ
    const g = this.ctx.createGain();
    g.gain.value = vol === undefined ? 1 : vol;
    src.connect(g).connect(this.sfxBus);
    src.start();
    return true;
  }

  preview(key) {
    this.unlock();
    if (!this.ctx) return;
    const go = () => {
      const list = this.buffers[key];
      if (!list || !list.length) return;
      if (key.startsWith("sfx:")) this._playCustom(key.slice(4));
      else {
        const src = this.ctx.createBufferSource();
        src.buffer = list[0];
        const g = this.ctx.createGain();
        const t = this.ctx.currentTime;
        g.gain.setValueAtTime(1, t);
        g.gain.linearRampToValueAtTime(0, t + 6);
        src.connect(g).connect(this.musicBus);
        src.start();
        src.stop(t + 6);
      }
    };
    this.decodePending().then(go);
  }

  setVolume(which, v) {
    v = Math.max(0, Math.min(1, v));
    if (which === "sfx") { this.sfxVol = v; if (this.sfxBus) this.sfxBus.gain.value = v; }
    else { this.musicVol = v; if (this.musicBus) this.musicBus.gain.value = v; }
    try { localStorage.setItem("bb_vol", JSON.stringify({ sfx: this.sfxVol, music: this.musicVol })); } catch (e) { /* ข้าม */ }
  }

  // ---------- เพลงธีม (เล่นวนซ้ำ ค่อยๆ เฟดเข้า/ออก) ----------
  hasMusic(name) { return !!(this.buffers["music:" + name] && this.buffers["music:" + name].length); }

  musicPlay(name, fade = 1.2) {
    if (!this.ctx) return;
    if (this.music && this.music.key === name) return;
    const bufs = this.buffers["music:" + name];
    if (!bufs || !bufs.length) return;
    this.musicStop(fade);
    const t = this.ctx.currentTime;
    const buf = bufs[0];
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(1, t + fade);
    src.connect(g).connect(this.musicBus);
    const offset = (this.resume[name] || 0) % buf.duration;
    src.start(0, offset);
    this.music = { key: name, src, g, buf, t0: t, offset };
  }

  musicStop(fade = 1) {
    const m = this.music;
    if (!m || !this.ctx) return;
    this.music = null;
    const t = this.ctx.currentTime;
    this.resume[m.key] = (m.offset + (t - m.t0)) % m.buf.duration; // กลับมาเล่นต่อจากเดิม
    m.g.gain.cancelScheduledValues(t);
    m.g.gain.setValueAtTime(m.g.gain.value, t);
    m.g.gain.linearRampToValueAtTime(0, t + fade);
    try { m.src.stop(t + fade + 0.05); } catch (e) { /* หยุดไปแล้ว */ }
  }

  musicReset() { this.musicStop(0.4); this.resume = {}; }
}

// ชื่อเสียงที่ปรับแต่งได้ (ชื่อเมธอด -> คำอธิบายภาษาไทย) ใช้ในหน้า "ตั้งค่าเสียง" และ js/sound-config.js
const SFX_LABELS = {
  click: "กดปุ่ม", start: "เริ่มสู้", shoot: "ยิงปืน", kick: "เตะบอล", meta: "Meta Vision", dodge: "หลบ",
  hit: "โดนตี", dash: "พุ่ง", note: "โน้ตดนตรี", wave: "คลื่นเสียง", deflect: "ปัดกระสุน/ผลักกระสุน",
  slash: "ฟันดาบ", erase: "ตัดเวลา", rewind: "ย้อนเวลา", accel: "เร่งเวลา", slow: "ชะลอเวลา",
  word: "คำพูดบั่นทอนใจ", breakdown: "สติแตก", ko: "น็อก", win: "ชนะ", draw: "เสมอ",
};
// ครอบทุกเสียง: ถ้ามีไฟล์ของผู้เล่นให้เล่นไฟล์นั้น ไม่มีก็ใช้เสียงสังเคราะห์เดิม
for (const n of Object.keys(SFX_LABELS)) {
  const orig = SoundFX.prototype[n];
  SoundFX.prototype[n] = function (...a) {
    if (this._playCustom(n)) return;
    return orig.apply(this, a);
  };
}

// เก็บไฟล์ที่ผู้เล่นอัปโหลดในเบราว์เซอร์ (IndexedDB) เปิดหน้าใหม่แล้วยังอยู่
const CustomStore = {
  _db() {
    return new Promise((res, rej) => {
      if (typeof indexedDB === "undefined") return rej(new Error("no idb"));
      const r = indexedDB.open("bb_sounds", 1);
      r.onupgradeneeded = () => r.result.createObjectStore("files");
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
  },
  async all() {
    try {
      const db = await this._db();
      return await new Promise((res) => {
        const out = [];
        const rq = db.transaction("files").objectStore("files").openCursor();
        rq.onsuccess = () => {
          const c = rq.result;
          if (c) { out.push({ key: c.key, blob: c.value.blob, name: c.value.name }); c.continue(); } else res(out);
        };
        rq.onerror = () => res(out);
      });
    } catch (e) { return []; }
  },
  async put(key, blob, name) {
    try {
      const db = await this._db();
      db.transaction("files", "readwrite").objectStore("files").put({ blob, name }, key);
    } catch (e) { /* ใช้ไม่ได้ (เช่นโหมดไม่ระบุตัวตน) ก็ข้าม */ }
  },
  async del(key) {
    try {
      const db = await this._db();
      db.transaction("files", "readwrite").objectStore("files").delete(key);
    } catch (e) { /* ข้าม */ }
  },
};

// เลขเวอร์ชันของไฟล์นี้ (main.js ใช้ตรวจว่าโหลดไฟล์ครบและตรงกันหรือไม่)
if (typeof window !== "undefined") (window.BB_FILES = window.BB_FILES || {}).audio = 40;

if (typeof module !== "undefined") module.exports = { SoundFX, SFX_LABELS, CustomStore };
