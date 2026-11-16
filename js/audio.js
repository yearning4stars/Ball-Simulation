// ============================================================
//  เสียงทั้งหมดสร้างจากโค้ดด้วย Web Audio (ไม่ต้องมีไฟล์เสียง)
//  อยากใช้ไฟล์เสียงของตัวเองแทน: แก้เมธอดด้านล่างให้ใช้ new Audio("assets/sfx/xxx.mp3")
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

    // บัฟเฟอร์เสียงซ่า ใช้ซ้ำทุกเสียงที่ต้องการ noise
    const len = this.ctx.sampleRate;
    this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
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
    osc.connect(g).connect(this.master);
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
    src.connect(filter).connect(g).connect(this.master);
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
}

// เลขเวอร์ชันของไฟล์นี้ (main.js ใช้ตรวจว่าโหลดไฟล์ครบและตรงกันหรือไม่)
if (typeof window !== "undefined") (window.BB_FILES = window.BB_FILES || {}).audio = 6;

if (typeof module !== "undefined") module.exports = { SoundFX };
