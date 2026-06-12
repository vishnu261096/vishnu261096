/* ============================================================
   STICK CARNAGE v2 — Stickman Blood & Gore Fighting Game (18+)
   40 main levels + 10 bonus arenas. A boss ends every level.
   A new power after every level. A growing weapon arsenal.
   Decapitations, headshots, blood fountains, fear & slow-mo.
   ============================================================ */
'use strict';

const cv = document.getElementById('cv');
const g = cv.getContext('2d');
const W = 960, H = 540, GROUND = 470;
const TAU = Math.PI * 2;
const rnd = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const pick = arr => arr[Math.floor(Math.random() * arr.length)];
function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const r = clamp((n >> 16) + amt, 0, 255), gr = clamp(((n >> 8) & 255) + amt, 0, 255), b = clamp((n & 255) + amt, 0, 255);
  return 'rgb(' + r + ',' + gr + ',' + b + ')';
}

const TESTING = false; // release build: levels unlock by beating them

/* ---------------- input ---------------- */
const keys = {}, once = {};
let mx = 0, my = 0, mclick = false;
addEventListener('keydown', e => {
  if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight',' '].includes(e.key)) e.preventDefault();
  const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  if (!e.repeat) once[k] = true;
  keys[k] = true;
  initAudio();
});
addEventListener('keyup', e => {
  const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  keys[k] = false;
});
cv.addEventListener('mousemove', e => {
  const r = cv.getBoundingClientRect();
  mx = (e.clientX - r.left) * (W / r.width);
  my = (e.clientY - r.top) * (H / r.height);
});
cv.addEventListener('mousedown', () => { mclick = true; initAudio(); });
const tap = k => !!once[k];

/* ---------------- touch controls (mobile) ---------------- */
const TOUCH = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
const TBTNS = [
  { k: 'a',     x: 58,      y: H - 52,  r: 36, label: '◀' },
  { k: 'd',     x: 152,     y: H - 52,  r: 36, label: '▶' },
  { k: 's',     x: 105,     y: H - 122, r: 24, label: '▼' },
  { k: 'k',     x: W - 58,  y: H - 64,  r: 34, label: 'KICK' },
  { k: 'j',     x: W - 148, y: H - 48,  r: 36, label: 'HIT' },
  { k: 'w',     x: W - 232, y: H - 70,  r: 30, label: 'JUMP' },
  { k: 'l',     x: W - 62,  y: H - 148, r: 25, label: 'SPL' },
  { k: 'Shift', x: W - 145, y: H - 132, r: 25, label: 'DASH' },
  { k: 'e',     x: W - 226, y: H - 145, r: 21, label: 'WPN' },
];
const touchMap = new Map();
function canvasPos(t) {
  const r = cv.getBoundingClientRect();
  return [(t.clientX - r.left) * (W / r.width), (t.clientY - r.top) * (H / r.height)];
}
function hitBtn(x, y) {
  let best = null, bd = 1e9;
  for (const b of TBTNS) {
    const d = Math.hypot(x - b.x, y - b.y);
    if (d < b.r + 16 && d < bd) { best = b; bd = d; }
  }
  return best;
}
cv.addEventListener('touchstart', ev => {
  ev.preventDefault(); initAudio();
  for (const t of ev.changedTouches) {
    const [x, y] = canvasPos(t);
    const b = (state === 'play' || state === 'pause') ? hitBtn(x, y) : null;
    if (b) {
      touchMap.set(t.identifier, b.k);
      if (!keys[b.k]) once[b.k] = true;
      keys[b.k] = true;
    } else { mx = x; my = y; mclick = true; }
  }
}, { passive: false });
cv.addEventListener('touchmove', ev => {
  ev.preventDefault();
  for (const t of ev.changedTouches) {
    const old = touchMap.get(t.identifier);
    if (!old) continue;
    const [x, y] = canvasPos(t);
    const b = hitBtn(x, y);
    if (b && b.k !== old) {
      keys[old] = false;
      touchMap.set(t.identifier, b.k);
      if (!keys[b.k]) once[b.k] = true;
      keys[b.k] = true;
    }
  }
}, { passive: false });
const touchEnd = ev => {
  for (const t of ev.changedTouches) {
    const k = touchMap.get(t.identifier);
    if (k) { keys[k] = false; touchMap.delete(t.identifier); }
  }
};
cv.addEventListener('touchend', touchEnd);
cv.addEventListener('touchcancel', touchEnd);

/* ---------------- audio (synthesized) ---------------- */
let AC = null, muted = false;
function initAudio() { if (!AC) { try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {} } }
function sfx(type) {
  if (!AC || muted) return;
  const t = AC.currentTime;
  const out = AC.createGain(); out.connect(AC.destination);
  function noise(dur, vol, freq) {
    const buf = AC.createBuffer(1, AC.sampleRate * dur, AC.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
    const src = AC.createBufferSource(); src.buffer = buf;
    const f = AC.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = freq;
    const gn = AC.createGain(); gn.gain.setValueAtTime(vol, t); gn.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f); f.connect(gn); gn.connect(out); src.start(t);
  }
  function tone(f0, f1, dur, vol, type2) {
    const o = AC.createOscillator(); o.type = type2 || 'sine';
    o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const gn = AC.createGain(); gn.gain.setValueAtTime(vol, t); gn.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(gn); gn.connect(out); o.start(t); o.stop(t + dur);
  }
  switch (type) {
    case 'punch':  noise(0.08, 0.5, 900); tone(180, 60, 0.08, 0.3, 'square'); break;
    case 'kick':   noise(0.12, 0.6, 700); tone(140, 40, 0.12, 0.4, 'square'); break;
    case 'slice':  noise(0.1, 0.5, 4000); tone(800, 200, 0.1, 0.25, 'sawtooth'); break;
    case 'squish': noise(0.22, 0.7, 500); tone(300, 50, 0.2, 0.35, 'sawtooth'); break;
    case 'gib':    noise(0.3, 0.8, 400); tone(220, 30, 0.3, 0.4, 'sawtooth'); break;
    case 'decap':  noise(0.18, 0.7, 3000); noise(0.35, 0.8, 400); tone(500, 40, 0.3, 0.4, 'sawtooth'); break;
    case 'hurt':   tone(250, 90, 0.15, 0.4, 'square'); noise(0.1, 0.3, 1200); break;
    case 'boom':   noise(0.5, 0.9, 300); tone(120, 25, 0.5, 0.6, 'sine'); break;
    case 'shoot':  tone(900, 300, 0.1, 0.25, 'square'); break;
    case 'gun':    noise(0.07, 0.7, 2500); tone(300, 80, 0.08, 0.4, 'square'); break;
    case 'shotgun':noise(0.2, 0.9, 1500); tone(150, 40, 0.2, 0.5, 'square'); break;
    case 'saw':    tone(120 + Math.random() * 60, 100, 0.08, 0.25, 'sawtooth'); noise(0.06, 0.2, 2000); break;
    case 'flame':  noise(0.1, 0.18, 700); break;
    case 'dash':   noise(0.12, 0.3, 2500); break;
    case 'power':  tone(300, 900, 0.3, 0.3, 'square'); tone(450, 1350, 0.3, 0.2, 'square'); break;
    case 'boss':   tone(80, 40, 0.8, 0.6, 'sawtooth'); noise(0.6, 0.5, 200); break;
    case 'laser':  tone(1400, 200, 0.45, 0.35, 'sawtooth'); break;
    case 'select': tone(500, 750, 0.07, 0.2, 'square'); break;
    case 'zap':    tone(1800, 100, 0.18, 0.35, 'sawtooth'); noise(0.12, 0.4, 4000); break;
    case 'scream': tone(rnd(600, 900), rnd(200, 400), 0.3, 0.2, 'sawtooth'); break;
  }
}

/* ---------------- music (procedural dark synth) ---------------- */
let nextBeatAC = 0, beatN = 0;
const BASS_RIFF = [0, 0, 3, 0, 5, 3, 0, 7];
function musicLoop() {
  if (!AC || muted || state !== 'play') { nextBeatAC = 0; return; }
  if (!nextBeatAC) { nextBeatAC = AC.currentTime + 0.1; beatN = 0; }
  const step = boss ? 0.17 : 0.21; // tempo rises for boss fights
  while (nextBeatAC < AC.currentTime + 0.35) {
    scheduleBeat(nextBeatAC, beatN, step);
    beatN++; nextBeatAC += step;
  }
}
function scheduleBeat(t, n, step) {
  const zi = zoneIdx(level);
  // kick
  if (n % 4 === 0) {
    const o = AC.createOscillator(), gn = AC.createGain();
    o.frequency.setValueAtTime(105, t); o.frequency.exponentialRampToValueAtTime(36, t + 0.14);
    gn.gain.setValueAtTime(0.20, t); gn.gain.exponentialRampToValueAtTime(0.001, t + 0.17);
    o.connect(gn); gn.connect(AC.destination); o.start(t); o.stop(t + 0.18);
  }
  // hat
  if (n % 2 === 1) {
    const buf = AC.createBuffer(1, AC.sampleRate * 0.04, AC.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
    const src = AC.createBufferSource(); src.buffer = buf;
    const f = AC.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 6000;
    const gn = AC.createGain(); gn.gain.setValueAtTime(0.05, t); gn.gain.exponentialRampToValueAtTime(0.001, t + 0.04);
    src.connect(f); f.connect(gn); gn.connect(AC.destination); src.start(t);
  }
  // bass riff, root tied to the zone
  if (n % 2 === 0) {
    const semi = BASS_RIFF[(n / 2) % 8] + (zi % 4) * 2;
    const o = AC.createOscillator(), gn = AC.createGain();
    o.type = 'sawtooth';
    o.frequency.value = 55 * Math.pow(2, semi / 12);
    const f = AC.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = boss ? 700 : 420;
    gn.gain.setValueAtTime(0.055, t); gn.gain.exponentialRampToValueAtTime(0.001, t + step * 1.8);
    o.connect(f); f.connect(gn); gn.connect(AC.destination); o.start(t); o.stop(t + step * 2);
  }
}

/* ---------------- save ---------------- */
let save = { unlocked: 1 };
try { const s = localStorage.getItem('stickCarnage'); if (s) save = JSON.parse(s); } catch (e) {}
// release migration: wipe testing-build saves (which had everything unlocked)
if (!save.v2) { save = { unlocked: 1, best: save.best || 0, v2: true }; persist(); }
function persist() { try { localStorage.setItem('stickCarnage', JSON.stringify(save)); } catch (e) {} }

/* ---------------- zones ---------------- */
const ZONES = [
  { name: 'TRAINING GROUNDS', sky: ['#2b3a55', '#10131d'], ground: '#2a2f3a', accent: '#7da0d0', sil: 'hills' },
  { name: 'NEON CITY',        sky: ['#1a0a2e', '#05030a'], ground: '#1c1530', accent: '#ff2bd6', sil: 'city' },
  { name: 'CRIMSON FOREST',   sky: ['#3d1020', '#120408'], ground: '#26101a', accent: '#e0455a', sil: 'trees' },
  { name: 'FROZEN WASTES',    sky: ['#2e4a66', '#0c1622'], ground: '#3a4f63', accent: '#aee6ff', sil: 'spikes' },
  { name: 'SCORCHED DESERT',  sky: ['#6e3a14', '#1c0d04'], ground: '#4d2c10', accent: '#ffb347', sil: 'dunes' },
  { name: 'TOXIC SEWERS',     sky: ['#1d3320', '#060d07'], ground: '#1f3322', accent: '#7bff4d', sil: 'pipes' },
  { name: 'SHADOW TEMPLE',    sky: ['#241a3d', '#0a0612'], ground: '#221a36', accent: '#9b6bff', sil: 'pillars' },
  { name: 'SKY FORTRESS',     sky: ['#3f5e8a', '#101b2a'], ground: '#324257', accent: '#ffe27a', sil: 'towers' },
  { name: 'HELL GATES',       sky: ['#5a0d0d', '#160202'], ground: '#3a0d0d', accent: '#ff5722', sil: 'flames' },
  { name: 'THE VOID',         sky: ['#0d0d1a', '#000000'], ground: '#15152a', accent: '#c44dff', sil: 'void' },
];

const BOSS_NAMES = [
  'BRUTUS THE BREAKER','SLEDGE','KANE THE CRUEL','GORM IRONJAW','PITMASTER VEX',
  'NEON REAPER','VOLT','MISS MASSACRE','CHROME FANG','MEGAWATT MAULER',
  'ROOTSNAPPER','THE WOODSMAN','BRIAR KING','CARRION CALLER','BLOODBARK',
  'FROSTBITE','GLACIUS','HAILSTORM HARROW','THE WENDIGO','PERMAFROST PRIME',
  'DUNE BUTCHER','SCORPION SID','MIRAGE','SANDSTORM SAVAGE','THE SUN EATER',
  'SLUDGE','RAT KING RECKON','TOXICANT','PLAGUE PIPER','THE FATBERG',
  'ACOLYTE OF AGONY','SHADOW SHIV','NULL MONK','THE WHISPERER','TEMPLE TYRANT',
  'SKYBREAKER','GALE FORCE GRIM','TURBINE TERROR','STRATOS','THE FALLING STAR',
  'HELLHOUND HARKER','INFERNUS','THE BRANDED ONE','CINDERLORD','ABYSSAL WARDEN',
  'VOIDSPAWN','ENTROPY','THE UNMAKER','OMEGA STITCH','DEATH INCARNATE',
];

function isBonusLevel(n) { return n === 49 || (n % 5 === 0 && n !== 50); }
function zoneOf(n) { return ZONES[Math.min(9, Math.floor((n - 1) / 5))]; }
function zoneIdx(n) { return Math.min(9, Math.floor((n - 1) / 5)); }

/* ---------------- weapons (unlock as levels rise) ---------------- */
const WEAPONS = [
  { id: 'fists',    name: 'FISTS',        lvl: 1,  type: 'melee',  dmg: 11, range: 46, cd: 0.30, kb: 3,  gore: 1 },
  { id: 'knife',    name: 'KNIFE',        lvl: 2,  type: 'melee',  dmg: 16, range: 46, cd: 0.24, kb: 2,  gore: 1.5, blade: true, decap: 0.3 },
  { id: 'bat',      name: 'SPIKED BAT',   lvl: 4,  type: 'melee',  dmg: 22, range: 58, cd: 0.45, kb: 9,  gore: 1.3 },
  { id: 'machete',  name: 'MACHETE',      lvl: 7,  type: 'melee',  dmg: 26, range: 56, cd: 0.38, kb: 4,  gore: 1.7, blade: true, decap: 0.45 },
  { id: 'sword',    name: 'SWORD',        lvl: 10, type: 'melee',  dmg: 32, range: 68, cd: 0.42, kb: 5,  gore: 1.8, blade: true, decap: 0.5 },
  { id: 'axe',      name: 'WAR AXE',      lvl: 13, type: 'melee',  dmg: 46, range: 60, cd: 0.62, kb: 10, gore: 2.2, blade: true, decap: 0.65 },
  { id: 'spear',    name: 'SPEAR',        lvl: 16, type: 'melee',  dmg: 32, range: 92, cd: 0.5,  kb: 6,  gore: 1.4, blade: true, decap: 0.15 },
  { id: 'pistol',   name: 'PISTOL',       lvl: 19, type: 'gun',    dmg: 18, cd: 0.3,  pspeed: 13, gore: 1.4 },
  { id: 'uzi',      name: 'UZI',          lvl: 23, type: 'gun',    dmg: 9,  cd: 0.09, pspeed: 13, gore: 1.2, auto: true, spread: 0.09 },
  { id: 'shotgun',  name: 'SHOTGUN',      lvl: 27, type: 'gun',    dmg: 12, cd: 0.75, pspeed: 12, gore: 2.4, pellets: 6, spread: 0.2, kb: 8 },
  { id: 'katana',   name: 'KATANA',       lvl: 31, type: 'melee',  dmg: 40, range: 72, cd: 0.3,  kb: 4,  gore: 2.2, blade: true, decap: 0.7 },
  { id: 'grenade',  name: 'GRENADES',     lvl: 35, type: 'thrown', dmg: 60, cd: 0.95, gore: 2.6 },
  { id: 'flamer',   name: 'FLAMETHROWER', lvl: 39, type: 'flame',  dmg: 3.6, cd: 0.045, gore: 1.2, auto: true },
  { id: 'laser',    name: 'LASER RIFLE',  lvl: 43, type: 'laser',  dmg: 34, cd: 0.55, gore: 2 },
  { id: 'chainsaw', name: 'CHAINSAW',     lvl: 47, type: 'saw',    dmg: 5,  range: 56, cd: 0.05, gore: 3, blade: true, decap: 0.25, auto: true },
];
function weaponDmg(w) {
  // arsenal grows sharper every level after a weapon is found
  return w.dmg * (1 + Math.max(0, level - w.lvl) * 0.04) * playerDmg();
}

/* ---------------- powers (one per level, 50 total) ---------------- */
const POWERS = [
  { name: 'IRON FISTS',        desc: '+25% attack damage',                    fn: s => s.dmgMul *= 1.25 },
  { name: 'SWIFT BOOTS',       desc: '+15% movement speed',                   fn: s => s.speed *= 1.15 },
  { name: 'VITAL CORE',        desc: '+30 max HP',                            fn: s => s.maxhp += 30 },
  { name: 'DOUBLE JUMP',       desc: 'Jump again in mid-air',                 fn: s => s.jumps = 2 },
  { name: 'BLOOD RUSH',        desc: 'Kills restore 4 HP',                    fn: s => s.killHeal += 4 },
  { name: 'SHADOW DASH',       desc: 'SHIFT to dash (brief invincibility)',   fn: s => s.dash = true },
  { name: 'HEAVY IMPACT',      desc: '+10% damage, massive knockback',        fn: s => { s.dmgMul *= 1.10; s.kbMul *= 1.6; } },
  { name: 'ADRENALINE',        desc: '+50% energy regeneration',              fn: s => s.energyRegen *= 1.5 },
  { name: 'IRON SKIN',         desc: 'Take 12% less damage',                  fn: s => s.defMul *= 0.88 },
  { name: 'SHOCKWAVE',         desc: 'SPECIAL [L]: ground shockwave',         fn: s => s.special = 'shockwave' },
  { name: 'RAZOR KICKS',       desc: 'Kicks deal +35% damage',                fn: s => s.kickMul *= 1.35 },
  { name: 'ACROBAT',           desc: '+20% jump power',                       fn: s => s.jumpMul *= 1.2 },
  { name: 'VITAL CORE II',     desc: '+40 max HP',                            fn: s => s.maxhp += 40 },
  { name: 'CRITICAL EYE',      desc: '15% chance to crit for 2.5x',           fn: s => { s.critC += 0.15; s.critM = Math.max(s.critM, 2.5); } },
  { name: 'VAMPIRE FISTS',     desc: 'Heal for 8% of damage dealt',           fn: s => s.lifesteal += 0.08 },
  { name: 'AIR DASH',          desc: 'Dash works in mid-air',                 fn: s => s.airDash = true },
  { name: 'BERSERKER',         desc: '+30% damage below 35% HP',              fn: s => s.berserk = true },
  { name: 'ENERGY WELL',       desc: '+40 max energy',                        fn: s => s.energyMax += 40 },
  { name: 'STONE GUARD',       desc: 'Take 12% less damage',                  fn: s => s.defMul *= 0.88 },
  { name: 'FIREBALL',          desc: 'SPECIAL [L]: explosive fireball',       fn: s => s.special = 'fireball' },
  { name: 'LONG REACH',        desc: '+25% attack range',                     fn: s => s.range *= 1.25 },
  { name: 'SPRINTER',          desc: '+15% movement speed',                   fn: s => s.speed *= 1.15 },
  { name: 'VITAL CORE III',    desc: '+50 max HP',                            fn: s => s.maxhp += 50 },
  { name: 'COMBO MASTER',      desc: 'Combo hits ramp damage up to +30%',     fn: s => s.comboMaster = true },
  { name: 'THORNS',            desc: 'Reflect 30% of damage taken',           fn: s => s.thorns += 0.30 },
  { name: 'TRIPLE JUMP',       desc: 'A third jump in mid-air',               fn: s => s.jumps = 3 },
  { name: 'EXECUTIONER',       desc: '+100% damage to enemies under 25% HP',  fn: s => s.executioner = true },
  { name: 'SURGE',             desc: '+50% energy regeneration',              fn: s => s.energyRegen *= 1.5 },
  { name: 'JUGGERNAUT',        desc: 'Take 10% less damage, knockback immune',fn: s => { s.defMul *= 0.90; s.kbImmune = true; } },
  { name: 'LIGHTNING STORM',   desc: 'SPECIAL [L]: chain lightning',          fn: s => s.special = 'lightning' },
  { name: 'CRITICAL EYE II',   desc: '+10% crit chance',                      fn: s => s.critC += 0.10 },
  { name: 'REGENERATOR',       desc: 'Regenerate 2 HP per second',            fn: s => s.regen += 2 },
  { name: 'VITAL CORE IV',     desc: '+60 max HP',                            fn: s => s.maxhp += 60 },
  { name: 'RAGE FUEL',         desc: 'Taking damage grants energy',           fn: s => s.rageFuel = true },
  { name: 'BLADE TORNADO',     desc: 'SPECIAL [L]: shredding spin attack',    fn: s => s.special = 'tornado' },
  { name: 'PHANTOM STEP',      desc: 'Dashing through enemies wounds them',   fn: s => s.dashDmg = true },
  { name: 'TITAN FISTS',       desc: '+35% attack damage',                    fn: s => s.dmgMul *= 1.35 },
  { name: 'SECOND WIND',       desc: 'Survive a fatal blow once per level',   fn: s => s.secondWind = true },
  { name: 'ENERGY WELL II',    desc: '+50 max energy',                        fn: s => s.energyMax += 50 },
  { name: 'METEOR CALL',       desc: 'SPECIAL [L]: rain burning meteors',     fn: s => s.special = 'meteor' },
  { name: 'BLOODLUST',         desc: 'Kills grant +15% damage for 5s',        fn: s => s.bloodlust = true },
  { name: 'SWIFT BOOTS III',   desc: '+15% movement speed',                   fn: s => s.speed *= 1.15 },
  { name: 'VITAL CORE V',      desc: '+80 max HP',                            fn: s => s.maxhp += 80 },
  { name: 'CRITICAL EYE III',  desc: '+10% crit chance, crits deal 3x',       fn: s => { s.critC += 0.10; s.critM = Math.max(s.critM, 3); } },
  { name: 'BLACK HOLE',        desc: 'SPECIAL [L]: devour everything nearby', fn: s => s.special = 'blackhole' },
  { name: 'GIANT SLAYER',      desc: '+30% damage to bosses',                 fn: s => s.bossDmg *= 1.3 },
  { name: 'OVERDRIVE',         desc: '+25% attack speed',                     fn: s => s.atkSpd *= 1.25 },
  { name: 'IMMORTAL SKIN',     desc: 'Take 15% less damage',                  fn: s => s.defMul *= 0.85 },
  { name: 'AVATAR OF CARNAGE', desc: '+20% damage, speed and max HP',         fn: s => { s.dmgMul *= 1.2; s.speed *= 1.2; s.maxhp = Math.round(s.maxhp * 1.2); } },
  { name: 'APOCALYPSE',        desc: 'SPECIAL [L]: annihilate the screen',    fn: s => s.special = 'apocalypse' },
];

const SPECIALS = {
  shockwave:  { cost: 25, label: 'SHOCKWAVE' },
  fireball:   { cost: 30, label: 'FIREBALL' },
  lightning:  { cost: 40, label: 'LIGHTNING STORM' },
  tornado:    { cost: 45, label: 'BLADE TORNADO' },
  meteor:     { cost: 55, label: 'METEOR CALL' },
  blackhole:  { cost: 65, label: 'BLACK HOLE' },
  apocalypse: { cost: 80, label: 'APOCALYPSE' },
};

function buildStats(powerCount) {
  const s = {
    maxhp: 100, dmgMul: 1, kickMul: 1, speed: 4.2, jumpMul: 1, jumps: 1,
    dash: false, airDash: false, dashDmg: false, energyMax: 100, energyRegen: 1,
    critC: 0, critM: 2, lifesteal: 0, killHeal: 0, thorns: 0, defMul: 1,
    regen: 0, range: 1, special: null, bossDmg: 1, atkSpd: 1, secondWind: false,
    rageFuel: false, bloodlust: false, comboMaster: false, executioner: false,
    berserk: false, kbMul: 1, kbImmune: false,
  };
  for (let i = 0; i < Math.min(powerCount, POWERS.length); i++) POWERS[i].fn(s);
  return s;
}

/* ---------------- world containers ---------------- */
let particles = [], gibs = [], decals = [], projs = [], effects = [], texts = [], enemies = [], corpses = [];
let plats = [], ladders = []; // vertical arena: platforms + ladders
let P = null, boss = null;
let shake = 0, hitstop = 0, flash = 0, slowmo = 0;
let state = 'menu';
let level = 1, wave = 0, totalWaves = 0, kills = 0, levelT = 0, banner = 0, nowT = 0;
let bossSpawned = false, bonusMode = false;
let streak = 0, streakT = 0;
let lives = 3; // 3 lives per run; +1 every 5th boss; death = restore on the spot
let score = 0; // run score; best kept in save.best
let menuPulse = 0;

/* ---------------- blood & gore ---------------- */
const BLOOD = ['#c40f0f', '#9e0b0b', '#e02222', '#7a0606'];
function blood(x, y, n, dirx, power) {
  if (particles.length > 600) return;
  for (let i = 0; i < n; i++) {
    particles.push({
      x, y: y + rnd(-14, 4), vx: (dirx || rnd(-1, 1)) * rnd(1, power || 5) + rnd(-2, 2),
      vy: rnd(-6, -1) * (power ? power / 4 : 1), r: rnd(1.2, 3.4),
      col: pick(BLOOD), life: rnd(0.6, 1.6), grav: 0.5, type: 'blood',
    });
  }
}
function fountain(x, y, n) {
  for (let i = 0; i < n; i++) {
    particles.push({
      x: x + rnd(-2, 2), y, vx: rnd(-1.5, 1.5), vy: rnd(-9, -5),
      r: rnd(1.5, 3.5), col: pick(BLOOD), life: rnd(0.7, 1.4), grav: 0.45, type: 'blood',
    });
  }
}
function addDecal(x, r) {
  decals.push({ x: x + rnd(-4, 4), y: GROUND + rnd(1, 26), r: r * rnd(0.8, 1.6), a: rnd(0.5, 0.9), col: pick(['#5e0505', '#700808', '#4a0404']) });
  if (decals.length > 300) decals.splice(0, decals.length - 300);
}
function gibBurst(x, y, col, scale, vx0, goreMul) {
  goreMul = goreMul || 1;
  sfx('gib');
  blood(x, y - 20 * scale, Math.round(30 * goreMul), vx0 ? Math.sign(vx0) : 0, 7);
  const parts = [
    { type: 'head', len: 7 * scale }, { type: 'torso', len: 20 * scale },
    { type: 'limb', len: 14 * scale }, { type: 'limb', len: 14 * scale },
    { type: 'limb', len: 16 * scale }, { type: 'limb', len: 16 * scale },
  ];
  if (goreMul > 1.8) parts.push({ type: 'limb', len: 10 * scale }, { type: 'limb', len: 8 * scale });
  for (const pt of parts) {
    gibs.push({
      x: x + rnd(-6, 6), y: y - rnd(10, 40) * scale,
      vx: (vx0 || 0) * 0.6 + rnd(-5, 5) * goreMul, vy: rnd(-9, -3) * Math.min(1.4, goreMul),
      rot: rnd(0, TAU), vr: rnd(-0.4, 0.4), len: pt.len, type: pt.type,
      col, life: rnd(4, 7), lw: 3.5 * scale, bled: 0,
    });
  }
  if (gibs.length > 110) gibs.splice(0, gibs.length - 110);
}
// blade kill: head rolls off, headless body stands spraying, then collapses
function decapitate(e, kb) {
  sfx('decap');
  gibs.push({
    x: e.x, y: e.y - 50 * (e.scale || 1), vx: (kb || 2) * 0.9 + rnd(-1, 3) * Math.sign(kb || 1),
    vy: rnd(-8, -5), rot: rnd(0, TAU), vr: rnd(0.3, 0.7) * Math.sign(kb || 1),
    len: 7 * (e.scale || 1), type: 'head', col: e.col, life: rnd(5, 8), lw: 3.5 * (e.scale || 1), bled: 0,
  });
  corpses.push({ x: e.x, y: e.y, vx: (kb || 0) * 0.15, facing: e.facing, col: e.col, scale: e.scale || 1, t: 0, rot: 0, fell: false, noHead: true });
  if (corpses.length > 14) corpses.splice(0, corpses.length - 14);
  blood(e.x, e.y - 48 * (e.scale || 1), 18, 0, 6);
  floatText(e.x, e.y - 70, 'DECAPITATED!', '#ff3333', true);
}
function headPop(e) {
  sfx('decap');
  blood(e.x, e.y - 48 * (e.scale || 1), 30, 0, 8);
  for (let i = 0; i < 5; i++) {
    gibs.push({
      x: e.x, y: e.y - 48 * (e.scale || 1), vx: rnd(-6, 6), vy: rnd(-8, -3),
      rot: rnd(0, TAU), vr: rnd(-0.6, 0.6), len: rnd(2, 4) * (e.scale || 1), type: 'limb',
      col: e.col, life: rnd(3, 5), lw: 2.5, bled: 0,
    });
  }
  corpses.push({ x: e.x, y: e.y, vx: 0, facing: e.facing, col: e.col, scale: e.scale || 1, t: 0, rot: 0, fell: false, noHead: true });
  if (corpses.length > 14) corpses.splice(0, corpses.length - 14);
  floatText(e.x, e.y - 70, 'HEADSHOT!', '#ffe14d', true);
}
function floatText(x, y, str, col, big) {
  texts.push({ x, y, str, col: col || '#fff', life: 1, big: !!big });
  if (texts.length > 40) texts.splice(0, texts.length - 40);
}

/* ---------------- player ---------------- */
function makePlayer() {
  const s = buildStats(level - 1);
  return {
    x: 140, y: GROUND, vx: 0, vy: 0, facing: 1, onGround: true,
    hp: s.maxhp, energy: s.energyMax * 0.5, stats: s,
    jumpsLeft: s.jumps, cd: 0, atkT: 0, atkDur: 0.2, atkPose: null, dashT: 0, dashCd: 0,
    inv: 0, hurtT: 0, combo: 0, comboT: 0, legPh: 0, dead: false,
    secondWindUsed: false, bloodlustT: 0, dashHitSet: new Set(),
    spinT: 0, castT: 0, lastJ: -9, lastK: -9, flameTick: 0,
    weapons: WEAPONS.filter(w => w.lvl <= level), wIdx: 0,
    standPlat: null, climbing: false, dropT: 0, wallT: 0, wallDir: 0,
  };
}

function playerDmg() {
  const s = P.stats;
  let m = s.dmgMul;
  if (s.berserk && P.hp < s.maxhp * 0.35) m *= 1.3;
  if (P.bloodlustT > 0) m *= 1.15;
  if (s.comboMaster) m *= 1 + Math.min(0.30, P.combo * 0.03);
  if (bonusMode) m *= 1.5;
  return m;
}

function hitEnemies(x0, x1, dmg, kb, opts) {
  opts = opts || {};
  let hitAny = false;
  const tryHit = (e, isBoss) => {
    if (e.hp <= 0) return;
    const half = (isBoss ? 30 : 14) * (e.scale || 1);
    if (e.x + half < Math.min(x0, x1) || e.x - half > Math.max(x0, x1)) return;
    if (opts.yBand && Math.abs((e.y - 30 * (e.scale || 1)) - opts.yBand) > 90) return;
    let d = dmg;
    const s = P.stats;
    if (Math.random() < s.critC) { d *= s.critM; floatText(e.x, e.y - 70, 'CRIT!', '#ffe14d', true); }
    if (s.executioner && e.hp < e.maxhp * 0.25) d *= 2;
    if (isBoss) d *= s.bossDmg;
    damageEnemy(e, d, kb * Math.sign(e.x - P.x || P.facing), isBoss, opts.ctx);
    hitAny = true;
  };
  for (const e of enemies) tryHit(e, false);
  if (boss) tryHit(boss, true);
  return hitAny;
}

function damageEnemy(e, d, kb, isBoss, ctx) {
  // shields block most frontal damage
  if (!isBoss && e.type === 'shield' && Math.sign(kb || 1) === -e.facing) {
    d *= 0.35;
    if (Math.random() < 0.4) floatText(e.x, e.y - 60, 'BLOCKED', '#b8c4d0', false);
  }
  e.hp -= d;
  // poise: enemies cannot be stun-locked — stagger has a cooldown
  if (!isBoss) {
    if (!e.poiseT || e.poiseT <= 0) {
      e.hurtT = 0.18;
      e.poiseT = (e.type === 'brute' || e.type === 'shield' || e.elite) ? 2.4 : 1.2;
    }
  } else e.hurtT = 0.18;
  if (d >= 2 && Math.random() < 0.8) floatText(e.x + rnd(-10, 10), e.y - 52 * (e.scale || 1) - rnd(0, 12), String(Math.round(d)), '#ffd9a0', false);
  if (!isBoss || !e.armored) {
    const kbRes = (e.elite || e.type === 'brute' || e.type === 'shield') ? 0.45 : 1;
    e.vx += kb * 0.17 * P.stats.kbMul * kbRes;
  }
  blood(e.x, e.y - 25 * (e.scale || 1), Math.min(18, 4 + d * 0.25), Math.sign(kb), 4);
  if (P.stats.lifesteal) P.hp = Math.min(P.stats.maxhp, P.hp + d * P.stats.lifesteal);
  P.combo++; P.comboT = 2;
  if (e.hp <= 0) {
    if (isBoss) killBoss(); else killEnemy(e, kb, ctx);
  } else { sfx('squish'); }
  shake = Math.min(14, shake + 2 + d * 0.05);
  hitstop = Math.max(hitstop, d > 30 ? 0.06 : 0.025);
}

function killEnemy(e, kb, ctx) {
  ctx = ctx || {};
  e.hp = 0; e.dead = true;
  kills++;
  score += Math.round((50 + level * 5) * (1 + streak * 0.15));
  const gore = ctx.gore || 1;
  if (ctx.headshot) headPop(e);
  else if (ctx.blade && Math.random() < (ctx.decap || 0)) decapitate(e, kb);
  else if (ctx.blade && Math.random() < 0.4) {
    // cut clean in half
    sfx('decap');
    gibBurst(e.x, e.y, e.col, e.scale || 1, kb, gore * 1.3);
    floatText(e.x, e.y - 70, 'SLICED IN HALF!', '#ff3333', true);
  }
  else gibBurst(e.x, e.y, e.col, e.scale || 1, kb, gore);
  if (e.elite) {
    score += 150 + level * 5;
    P.energy = Math.min(P.stats.energyMax, P.energy + 15);
    floatText(e.x, e.y - 85, 'ELITE BOUNTY +' + (150 + level * 5), '#ffe14d', true);
  }
  addDecal(e.x, rnd(8, 16) * gore); addDecal(e.x + rnd(-20, 20), rnd(5, 10));
  if (P.stats.killHeal) P.hp = Math.min(P.stats.maxhp, P.hp + P.stats.killHeal);
  if (P.stats.bloodlust) P.bloodlustT = 5;
  P.energy = Math.min(P.stats.energyMax, P.energy + 8);
  if (!ctx.headshot && !ctx.blade) floatText(e.x, e.y - 60, pick(['SPLAT!', 'REKT', 'SHREDDED', 'OBLITERATED', 'GORED']), '#ff3333', false);
  shake = Math.min(16, shake + 5);
  // kill streak satisfaction
  streak++; streakT = 1.6;
  if (streak === 3) { floatText(W / 2, 120, 'TRIPLE KILL', '#ffe14d', true); slowmo = Math.max(slowmo, 0.35); }
  if (streak === 5) { floatText(W / 2, 120, '★ BLOODBATH ★', '#ff3333', true); slowmo = Math.max(slowmo, 0.5); sfx('boss'); }
  if (streak === 8) { floatText(W / 2, 120, '★★ MASSACRE ★★', '#ff3333', true); slowmo = Math.max(slowmo, 0.6); }
  if (streak >= 12 && streak % 4 === 0) { floatText(W / 2, 120, '☠ GENOCIDE ☠', '#ff0044', true); slowmo = Math.max(slowmo, 0.6); }
  // last kill of a wave: brief savor
  if (enemies.filter(x => !x.dead).length === 0 && !boss) slowmo = Math.max(slowmo, 0.45);
  // nearby enemies witness the horror and may flee screaming
  for (const o of enemies) {
    if (!o.dead && o !== e && o.type !== 'brute' && o.fleeT <= 0 && Math.abs(o.x - e.x) < 240 && Math.random() < 0.4) {
      o.fleeT = rnd(1.8, 3.5);
      o.screamT = 0;
      floatText(o.x, o.y - 70, '!', '#ffe14d', true);
      sfx('scream');
    }
  }
}

function killBoss() {
  if (!boss || boss.dying) return;
  boss.dying = true; boss.hp = 0;
  score += 1000 + level * 100;
  sfx('boss'); sfx('gib');
  shake = 26; hitstop = 0.25; flash = 0.5; slowmo = 1.1;
  for (let i = 0; i < 3; i++) gibBurst(boss.x + rnd(-20, 20), boss.y, boss.col, boss.scale, rnd(-6, 6), 2);
  decapitate(boss, P.facing * 6);
  blood(boss.x, boss.y - 40, 80, 0, 9);
  for (let i = 0; i < 6; i++) addDecal(boss.x + rnd(-70, 70), rnd(8, 20));
  floatText(boss.x, boss.y - 110, 'BOSS SLAIN', '#ffe14d', true);
  effects.push({ type: 'explosion', x: boss.x, y: boss.y - 40, t: 0, dur: 0.7, r: 130, col: '#ff5722' });
  boss = null;
  levelClear();
}

function levelClear() {
  state = 'powerup';
  stateTimer = 0;
  banner = 0;
  earnedLife = level % 5 === 0; // every 5th boss grants an extra life
  if (earnedLife) lives = Math.min(9, lives + 1);
  if (level >= save.unlocked && !TESTING) { save.unlocked = Math.min(50, level + 1); persist(); }
  sfx('power');
}
let earnedLife = false, newBest = false;

/* ---------------- enemies ---------------- */
const ETYPES = ['grunt', 'runner', 'brute', 'ninja', 'gunner', 'bomber', 'mage', 'shield'];
const ECOL = { grunt: '#d8d8d8', runner: '#7ec8ff', brute: '#c98a4b', ninja: '#9a7bff', gunner: '#8cd97e', bomber: '#ff9b54', mage: '#ff7bd4', shield: '#b8c4d0' };

function makeEnemy(type, x) {
  const n = level;
  const skill = (n - 1) / 5; // fighters sharpen every single level
  const base = { grunt: 1, runner: 0.7, brute: 2.6, ninja: 0.9, gunner: 0.8, bomber: 0.6, mage: 1, shield: 1.8 }[type];
  // footsoldiers arm themselves with better blades as the war escalates
  const blade = ['grunt', 'runner', 'ninja'].includes(type)
    ? (n >= 44 ? 'katana' : n >= 32 ? 'sword' : n >= 20 ? 'machete' : n >= 8 ? 'knife' : null) : null;
  const e = {
    type, x, y: GROUND, vx: 0, vy: 0, facing: -1, onGround: true,
    hp: (18 + n * 5.5) * base * (bonusMode ? 0.7 : 1),
    maxhp: (18 + n * 5.5) * base * (bonusMode ? 0.7 : 1),
    dmg: (6 + n * 0.55) * (type === 'brute' ? 1.6 : 1) * (blade ? 1.3 : 1),
    speed: { grunt: 1.6, runner: 3.4, brute: 1.1, ninja: 2.4, gunner: 1.4, bomber: 3.0, mage: 1.0, shield: 1.2 }[type] + n * 0.02 + skill * 0.12,
    cd: rnd(0.5, 1.4), col: ECOL[type], scale: type === 'brute' ? 1.35 : type === 'shield' ? 1.15 : 1,
    hurtT: 0, legPh: rnd(0, TAU), dead: false, jumpCd: rnd(0.5, 2), t: 0,
    fleeT: 0, screamT: 0, atkT: 0, poiseT: 0,
    skill, dodgeCd: rnd(0, 1), burst: 0, slamCd: rnd(2, 4), blade, elite: false,
  };
  // elites: bigger, meaner, glowing — worth a bounty
  if (n >= 12 && type !== 'bomber' && Math.random() < 0.1 + n * 0.003) {
    e.elite = true;
    e.hp *= 1.7; e.maxhp *= 1.7; e.dmg *= 1.5; e.scale *= 1.22; e.speed *= 1.12;
  }
  return e;
}

function spawnWave() {
  wave++;
  const zi = zoneIdx(level);
  const pool = ETYPES.slice(0, Math.min(8, 2 + zi));
  let count = 5 + Math.floor(level / 5) + (bonusMode ? 3 : 0);
  count = Math.min(count, 15);
  for (let i = 0; i < count; i++) {
    const side = i % 2 === 0 ? rnd(W + 20, W + 180) : rnd(-180, -20);
    enemies.push(makeEnemy(pick(pool), side));
  }
  if (wave > 1) floatText(W / 2, 200, 'WAVE ' + wave + ' / ' + totalWaves, '#ffffff', true);
}

function updateEnemy(e, dt) {
  const f = dt * 60;
  e.t += dt;
  e.cd -= dt; e.hurtT -= dt; e.jumpCd -= dt; e.dodgeCd -= dt; e.slamCd -= dt; e.poiseT -= dt;
  const dx = P.x - e.x, adx = Math.abs(dx);
  let want = 0;

  // skilled fighters read your attacks and hop out of range
  if (e.skill >= 2 && e.fleeT <= 0 && e.hurtT <= 0 && e.onGround && e.dodgeCd <= 0
      && P.atkT > P.atkDur * 0.6 && adx < 90 && Math.random() < 0.06 + e.skill * 0.02) {
    e.dodgeCd = rnd(1.2, 2.2);
    e.vx = -Math.sign(dx || 1) * (7 + e.skill * 0.5);
    e.vy = -5.5;
    e.hurtT = -0.01;
    floatText(e.x, e.y - 60, 'DODGE', '#9fd0ff', false);
  }

  if (e.fleeT > 0) {
    // running scared from the slaughter
    e.fleeT -= dt;
    e.facing = Math.sign(e.x - P.x) || 1;
    want = e.facing * 1.4;
    e.screamT -= dt;
    if (e.screamT <= 0) { e.screamT = rnd(0.7, 1.2); if (Math.random() < 0.5) { floatText(e.x, e.y - 65, pick(['AAAH!', 'NO NO NO', 'RUN!!', 'HELP!']), '#ffd', false); sfx('scream'); } }
  } else {
    e.facing = P.x > e.x ? 1 : -1;
    if (e.hurtT > 0) {
      // staggered
    } else if (e.type === 'gunner') {
      if (adx < 200) want = -e.facing; else if (adx > 320) want = e.facing;
      if (e.burst > 0 && e.cd <= 0) {
        // veteran gunners rattle off 3-round bursts
        e.burst--; e.cd = 0.12;
        sfx('shoot');
        const a = Math.atan2((P.y - 30) - (e.y - 32), dx) + rnd(-0.06, 0.06);
        projs.push({ x: e.x + e.facing * 14, y: e.y - 32, vx: Math.cos(a) * 7, vy: Math.sin(a) * 7, r: 4, dmg: e.dmg * 0.8, from: 'enemy', col: '#aaff66', life: 3 });
      } else if (e.cd <= 0 && adx < 460) {
        e.cd = 1.5 - Math.min(0.7, level * 0.012);
        if (e.skill >= 4) { e.burst = 2; }
        sfx('shoot');
        const a = Math.atan2((P.y - 30) - (e.y - 32), dx);
        projs.push({ x: e.x + e.facing * 14, y: e.y - 32, vx: Math.cos(a) * 6.5, vy: Math.sin(a) * 6.5, r: 4, dmg: e.dmg, from: 'enemy', col: '#aaff66', life: 3 });
      }
    } else if (e.type === 'mage') {
      if (adx < 240) want = -e.facing * 0.6; else if (adx > 360) want = e.facing * 0.6;
      if (e.cd <= 0 && adx < 520) {
        e.cd = 2.4;
        projs.push({ x: e.x, y: e.y - 50, vx: e.facing * 2.5, vy: -2, r: 6, dmg: e.dmg * 1.2, from: 'enemy', col: '#ff7bd4', life: 4.5, homing: true });
      }
    } else if (e.type === 'bomber') {
      want = e.facing;
      if (adx < 34) {
        explode(e.x, e.y - 20, 70, e.dmg * 2.2, 'enemy');
        killEnemy(e, e.facing * 4, { gore: 2 });
        return;
      }
    } else {
      if (adx > 30) want = e.facing;
      if (e.type === 'ninja' && e.jumpCd <= 0 && e.onGround && adx < 260 && adx > 60) {
        e.vy = -11; e.vx = e.facing * 7; e.jumpCd = rnd(1.5, 3);
        // master ninjas fling a shuriken mid-leap
        if (e.skill >= 3) {
          sfx('slice');
          const a = Math.atan2((P.y - 30) - (e.y - 40), dx);
          projs.push({ x: e.x, y: e.y - 40, vx: Math.cos(a) * 8, vy: Math.sin(a) * 8, r: 4, dmg: e.dmg * 0.9, from: 'enemy', col: '#cfd8ff', life: 2 });
        }
      }
      // elite brutes leap and slam the ground
      if (e.type === 'brute' && e.skill >= 5 && e.slamCd <= 0 && e.onGround && adx < 220 && adx > 70) {
        e.slamCd = rnd(4, 6);
        e.vy = -10; e.vx = e.facing * Math.min(8, adx / 24);
        e.slamming = true;
      }
      if (e.slamming && e.onGround && e.vy === 0 && e.t > 0.2) {
        e.slamming = false;
        sfx('boom');
        shake = Math.min(14, shake + 6);
        effects.push({ type: 'shockwave', x: e.x, y: GROUND, t: 0, dur: 0.45, r: 0, maxR: 130, col: e.col, from: 'enemy', dmg: e.dmg * 1.2, hitSet: new Set() });
      }
      if (e.cd <= 0 && adx < 38 + (e.scale - 1) * 20 && Math.abs(P.y - e.y) < 60) {
        e.cd = (e.type === 'brute' ? 1.4 : 0.9) - Math.min(0.4, e.skill * 0.05);
        e.atkT = 0.2;
        damagePlayer(e.dmg, e.facing * (e.type === 'brute' ? 7 : 3), e);
      }
    }
  }

  // chase the player onto platforms: leap up after them
  if (e.fleeT <= 0 && e.hurtT <= 0 && P.y < e.y - 60 && adx < 180 && e.onGround && e.jumpCd <= 0
      && e.type !== 'gunner' && e.type !== 'mage' && e.type !== 'shield') {
    e.vy = -12.8; e.vx += e.facing * 2.5; e.jumpCd = rnd(0.9, 1.8);
  }

  e.vx += want * e.speed * 0.15 * f;
  e.vx *= Math.pow(0.86, f);
  e.vy += 0.55 * f;
  const prevY = e.y;
  e.x += e.vx * f; e.y += e.vy * f;
  e.x = clamp(e.x, -180, W + 180);
  e.onGround = landOn(e, prevY);
  if (Math.abs(e.vx) > 0.4 && e.onGround) e.legPh += dt * 11;
  if (e.atkT) e.atkT -= dt;
}

function explode(x, y, r, dmg, from) {
  sfx('boom');
  effects.push({ type: 'explosion', x, y, t: 0, dur: 0.5, r, col: '#ff7a2a' });
  blood(x, y, 6, 0, 5);
  shake = Math.min(18, shake + 7);
  if (from === 'enemy' || from === 'both') {
    if (Math.hypot(P.x - x, (P.y - 25) - y) < r) damagePlayer(dmg, Math.sign(P.x - x) * 6, null);
  }
  if (from === 'player' || from === 'both') {
    for (const e of enemies) if (!e.dead && Math.hypot(e.x - x, (e.y - 25) - y) < r) damageEnemy(e, dmg, Math.sign(e.x - x) * 6, false, { gore: 2.4 });
    if (boss && Math.hypot(boss.x - x, (boss.y - 40) - y) < r + 24) damageEnemy(boss, dmg * P.stats.bossDmg, Math.sign(boss.x - x) * 3, true);
  }
}

function damagePlayer(d, kb, src) {
  if (!P || P.dead || P.inv > 0 || state !== 'play') return;
  const s = P.stats;
  d *= s.defMul;
  P.hp -= d;
  P.inv = 0.45; P.hurtT = 0.25;
  if (!s.kbImmune) P.vx += kb;
  if (s.rageFuel) P.energy = Math.min(s.energyMax, P.energy + d * 0.8);
  if (s.thorns && src) damageEnemy(src, d * s.thorns, -kb, false);
  blood(P.x, P.y - 25, 10, Math.sign(kb), 4);
  addDecal(P.x, rnd(4, 8));
  sfx('hurt');
  shake = Math.min(15, shake + 6);
  P.combo = 0;
  if (P.hp <= 0) {
    if (s.secondWind && !P.secondWindUsed) {
      P.secondWindUsed = true; P.hp = s.maxhp * 0.4; P.inv = 2;
      floatText(P.x, P.y - 80, 'SECOND WIND!', '#7bff4d', true);
      flash = 0.4;
    } else if (lives > 1) {
      // burn a life and restore right where you fell
      lives--;
      P.hp = s.maxhp; P.energy = s.energyMax; P.inv = 2.5; P.vx = 0;
      flash = 0.6; slowmo = Math.max(slowmo, 0.7); shake = 18;
      sfx('boss'); sfx('power');
      blood(P.x, P.y - 25, 24, 0, 7);
      floatText(P.x, P.y - 95, 'LIFE LOST!', '#ff3333', true);
      floatText(P.x, P.y - 65, lives + (lives === 1 ? ' LIFE' : ' LIVES') + ' REMAINING', '#ffe14d', false);
      // blast everything off you so you aren't killed again instantly
      for (const e of enemies) if (Math.abs(e.x - P.x) < 160) { e.vx = Math.sign(e.x - P.x || 1) * 10; e.vy = -6; e.hurtT = 0.5; }
      if (boss && Math.abs(boss.x - P.x) < 180) { boss.vx = Math.sign(boss.x - P.x || 1) * 6; }
      effects.push({ type: 'shockwave', x: P.x, y: GROUND, t: 0, dur: 0.5, r: 0, maxR: 200, col: '#ffe14d', from: 'player', dmg: 0, hitSet: new Set() });
    } else {
      lives = 0;
      P.dead = true;
      gibBurst(P.x, P.y, '#ffffff', 1, kb, 1.5);
      addDecal(P.x, 14);
      shake = 22;
      stateTimer = 0;
      newBest = score > (save.best || 0);
      if (newBest) { save.best = score; persist(); }
      state = 'gameover';
    }
  }
}

/* ---------------- boss ---------------- */
/* every zone fights a different kind of monster */
const BOSS_LOOKS = ['warrior', 'mech', 'ogre', 'icetitan', 'dragon', 'seamonster', 'ghost', 'lion', 'devil', 'voidbeast'];
const LOOK_LABEL = {
  warrior: 'THE WARLORD', mech: 'WAR MACHINE', ogre: 'THE OGRE', icetitan: 'ICE TITAN',
  dragon: 'THE DRAGON', seamonster: 'SEA MONSTER', ghost: 'THE GHOST', lion: 'BEAST KING',
  devil: 'ARCH-DEVIL', voidbeast: 'VOID HORROR', death: 'DEATH ITSELF',
};
const LOOK_MOVES = {
  warrior:    ['charge', 'charge', 'slam'],
  mech:       ['shoot', 'shoot', 'laser'],
  ogre:       ['slam', 'slam', 'charge'],
  icetitan:   ['slam', 'shoot', 'charge'],
  dragon:     ['shoot', 'laser', 'charge'],
  seamonster: ['summon', 'slam', 'shoot'],
  ghost:      ['vanish', 'vanish', 'shoot'],
  lion:       ['charge', 'spin', 'slam'],
  devil:      ['laser', 'shoot', 'summon', 'charge'],
  voidbeast:  ['vanish', 'summon', 'laser', 'spin'],
  death:      ['charge', 'slam', 'laser', 'summon', 'vanish', 'spin'],
};
/* 5 fighting styles × 10 creature bodies × held weapons = 50 distinct bosses */
const BOSS_STYLES = [
  { name: 'BLITZ STYLE',   spd: 1.45, hp: 0.9,  addMove: 'charge' },
  { name: 'SNIPER STYLE',  spd: 1.0,  hp: 1,    addMove: 'shoot', projSpd: 1.4 },
  { name: 'WARLOCK STYLE', spd: 1.0,  hp: 1,    addMove: 'summon' },
  { name: 'PHANTOM STYLE', spd: 1.18, hp: 0.95, addMove: 'vanish' },
  { name: 'JUGGERNAUT',    spd: 0.85, hp: 1.4,  addMove: 'slam' },
];
const BOSS_WEAPONS = ['sword', 'axe', 'spear', 'katana', 'bat'];
function makeBoss() {
  const n = level;
  const zi = zoneIdx(n);
  const variant = (n - 1) % 5;
  const style = BOSS_STYLES[variant];
  const look = n === 50 ? 'death' : BOSS_LOOKS[zi];
  const hpMul = (n === 50 ? 1.8 : bonusMode ? 0.85 : 1) * style.hp;
  const z = zoneOf(n);
  sfx('boss');
  banner = 0;
  return {
    isBoss: true, look, style, name: BOSS_NAMES[n - 1],
    weaponHeld: BOSS_WEAPONS[(n - 1) % BOSS_WEAPONS.length],
    x: W - 130, y: GROUND, vx: 0, vy: 0, facing: -1, onGround: true,
    hp: (160 + n * 58) * hpMul, maxhp: (160 + n * 58) * hpMul,
    dmg: 10 + n * 0.72, speed: (1.7 + n * 0.03) * style.spd,
    projSpd: style.projSpd || 1,
    scale: n === 50 ? 2.6 : 1.9 + zi * 0.05 + variant * 0.06,
    col: n === 50 ? z.accent : shade(z.accent, (variant - 2) * 22),
    state: 'intro', t: 1.4, next: null, hurtT: 0, legPh: 0,
    enraged: false, dying: false, visible: true, atkT: 0,
    beamY: 0, armored: true, t2: 0, fleeT: 0,
  };
}

function bossChoose(b) {
  const moves = LOOK_MOVES[b.look].concat([b.style.addMove, b.style.addMove]);
  b.next = pick(moves);
  if (b.look === 'seamonster' && enemies.length > 5) b.next = 'shoot';
  if (b.next === 'summon' && enemies.length > 6) b.next = 'charge';
  b.state = 'tele';
  b.t = b.enraged ? 0.45 : 0.7;
}

function updateBoss(b, dt) {
  const f = dt * 60;
  b.t -= dt; b.hurtT -= dt;
  if (!b.enraged && b.hp < b.maxhp * 0.5) {
    b.enraged = true; b.speed *= 1.35; b.dmg *= 1.25;
    floatText(b.x, b.y - 120, 'ENRAGED!', '#ff3333', true);
    blood(b.x, b.y - 50, 20, 0, 6);
    sfx('boss');
  }
  const spd = b.speed * (b.enraged ? 1.2 : 1);
  if (b.state !== 'charge' && b.state !== 'vanish') b.facing = P.x > b.x ? 1 : -1;

  switch (b.state) {
    case 'intro':
      if (b.t <= 0) { b.state = 'idle'; b.t = 0.8; }
      break;
    case 'idle': {
      const dx = P.x - b.x;
      if (Math.abs(dx) > 90) b.vx += Math.sign(dx) * spd * 0.12 * f;
      if (Math.abs(dx) < 60 * b.scale && b.t < 0.45 && Math.abs(P.y - b.y) < 70) {
        b.atkT = 0.25;
        damagePlayer(b.dmg, b.facing * 6, b);
        b.t = 0.6;
      }
      // no camping on platforms: bosses answer with a volley
      b.airT = (P.y < b.y - 80) ? (b.airT || 0) + dt : 0;
      if (b.airT > 1.4) { b.airT = 0; b.next = 'shoot'; b.state = 'tele'; b.t = 0.5; break; }
      if (b.t <= 0) bossChoose(b);
      break;
    }
    case 'tele':
      if (b.t <= 0) {
        b.state = b.next;
        if (b.next === 'charge') { b.t = 0.85; b.chargeDir = Math.sign(P.x - b.x) || b.facing; b.facing = b.chargeDir; sfx('dash'); }
        if (b.next === 'slam')   { b.t = 1.0; b.vy = -13; b.vx = Math.sign(P.x - b.x) * Math.min(9, Math.abs(P.x - b.x) / 28); }
        if (b.next === 'shoot')  { b.t = b.look === 'death' ? 1.6 : 1.2; b.t2 = 0; }
        if (b.next === 'summon') { b.t = 0.6; b.didSummon = false; }
        if (b.next === 'vanish') { b.t = 0.7; b.visible = false; sfx('dash'); blood(b.x, b.y - 40, 8, 0, 3); }
        if (b.next === 'spin')   { b.t = 1.8; b.spinHit = 0; }
        if (b.next === 'laser')  { b.t = 1.5; b.beamY = P.y - 28; b.fired = false; sfx('laser'); }
      }
      break;
    case 'charge':
      b.vx = b.chargeDir * (8 + spd * 2);
      if (Math.abs(P.x - b.x) < 34 * b.scale && Math.abs(P.y - b.y) < 70 && P.inv <= 0) damagePlayer(b.dmg * 1.3, b.chargeDir * 9, b);
      if (b.t <= 0 || b.x < 50 || b.x > W - 50) { b.vx *= 0.2; b.state = 'recover'; b.t = b.enraged ? 0.5 : 0.9; shake = Math.min(12, shake + 4); }
      break;
    case 'slam':
      if (b.onGround && b.t < 0.8) {
        sfx('boom');
        shake = Math.min(20, shake + 10);
        effects.push({ type: 'shockwave', x: b.x, y: GROUND, t: 0, dur: 0.55, r: 0, maxR: 220, col: b.col, from: 'enemy', dmg: b.dmg * 1.2, hitSet: new Set() });
        b.state = 'recover'; b.t = b.enraged ? 0.6 : 1.0;
      }
      break;
    case 'shoot':
      b.t2 -= dt;
      if (b.t2 <= 0) {
        b.t2 = b.enraged ? 0.13 : 0.2;
        sfx('shoot');
        const a = Math.atan2((P.y - 28) - (b.y - 50 * b.scale * 0.6), P.x - b.x) + rnd(-0.12, 0.12);
        const ps = 7 * (b.projSpd || 1);
        projs.push({ x: b.x + b.facing * 20, y: b.y - 50 * b.scale * 0.6, vx: Math.cos(a) * ps, vy: Math.sin(a) * ps, r: 5, dmg: b.dmg * 0.7, from: 'enemy', col: b.col, life: 3 });
      }
      if (b.t <= 0) { b.state = 'recover'; b.t = 0.8; }
      break;
    case 'summon':
      if (!b.didSummon && b.t < 0.3) {
        b.didSummon = true;
        const zi = zoneIdx(level);
        const pool = ETYPES.slice(0, Math.min(8, 2 + zi));
        for (let i = 0; i < (b.enraged ? 3 : 2); i++) {
          const m = makeEnemy(pick(pool), b.x + rnd(-80, 80));
          m.hp *= 0.7; m.maxhp *= 0.7;
          enemies.push(m);
          blood(m.x, m.y - 20, 6, 0, 3);
        }
        sfx('zap');
      }
      if (b.t <= 0) { b.state = 'recover'; b.t = 1.0; }
      break;
    case 'vanish':
      if (b.t <= 0) {
        b.visible = true;
        b.x = clamp(P.x - P.facing * 60, 60, W - 60);
        b.facing = Math.sign(P.x - b.x) || 1;
        blood(b.x, b.y - 40, 10, 0, 4);
        sfx('dash');
        b.state = 'strike'; b.t = 0.28;
      }
      break;
    case 'strike':
      if (b.t < 0.14 && !b.struck) {
        b.struck = true; b.atkT = 0.2;
        if (Math.abs(P.x - b.x) < 70 && Math.abs(P.y - b.y) < 70) damagePlayer(b.dmg * 1.4, b.facing * 8, b);
      }
      if (b.t <= 0) { b.struck = false; b.state = 'recover'; b.t = 0.8; }
      break;
    case 'spin':
      b.vx += Math.sign(P.x - b.x) * spd * 0.3 * f;
      b.spinHit -= dt;
      if (Math.abs(P.x - b.x) < 40 * b.scale && Math.abs(P.y - b.y) < 70 && b.spinHit <= 0) {
        b.spinHit = 0.4;
        damagePlayer(b.dmg * 0.8, Math.sign(P.x - b.x) * 7, b);
      }
      if (b.t <= 0) { b.state = 'recover'; b.t = 1.1; }
      break;
    case 'laser':
      if (b.t < 0.9 && !b.fired) {
        b.fired = true;
        effects.push({ type: 'beam', x: b.x, y: b.beamY, dir: b.facing, t: 0, dur: 0.5, from: 'enemy', dmg: b.dmg * 1.6, hit: false });
        shake = Math.min(16, shake + 8);
      }
      if (b.t <= 0) { b.state = 'recover'; b.t = b.enraged ? 0.6 : 1.1; }
      break;
    case 'recover':
      if (b.t <= 0) { b.state = 'idle'; b.t = rnd(0.4, 0.9); }
      break;
  }

  b.vx *= Math.pow(0.87, f);
  b.vy += 0.55 * f;
  b.x += b.vx * f; b.y += b.vy * f;
  b.x = clamp(b.x, 40, W - 40);
  if (b.y >= GROUND) { b.y = GROUND; b.vy = 0; b.onGround = true; } else b.onGround = false;
  if (Math.abs(b.vx) > 0.4 && b.onGround) b.legPh += dt * 9;
  if (b.atkT) b.atkT -= dt;
}

/* ---------------- specials ---------------- */
function castSpecial() {
  const s = P.stats;
  if (!s.special) return;
  const sp = SPECIALS[s.special];
  const cost = bonusMode ? 0 : sp.cost;
  if (P.energy < cost) { floatText(P.x, P.y - 80, 'NO ENERGY', '#888', false); return; }
  P.energy -= cost;
  P.castT = 0.3;
  const dmgBase = 22 * playerDmg() * (1 + level * 0.05);
  switch (s.special) {
    case 'shockwave':
      sfx('boom');
      effects.push({ type: 'shockwave', x: P.x, y: GROUND, t: 0, dur: 0.55, r: 0, maxR: 260, col: '#ffe14d', from: 'player', dmg: dmgBase, hitSet: new Set() });
      shake = Math.min(14, shake + 6);
      break;
    case 'fireball':
      sfx('shoot');
      projs.push({ x: P.x + P.facing * 20, y: P.y - 30, vx: P.facing * 9, vy: 0, r: 9, dmg: dmgBase * 1.4, from: 'player', col: '#ff7a2a', life: 2, explosive: true });
      break;
    case 'lightning': {
      sfx('zap');
      flash = 0.25;
      const targets = enemies.filter(e => !e.dead).sort((a, b) => Math.abs(a.x - P.x) - Math.abs(b.x - P.x)).slice(0, 5);
      if (boss) targets.push(boss);
      let px = P.x, py = P.y - 40;
      for (const e of targets) {
        effects.push({ type: 'bolt', x1: px, y1: py, x2: e.x, y2: e.y - 35 * (e.scale || 1), t: 0, dur: 0.25 });
        damageEnemy(e, dmgBase * 1.2 * (e.isBoss ? P.stats.bossDmg : 1), Math.sign(e.x - P.x) * 3, !!e.isBoss, { gore: 1.6 });
        px = e.x; py = e.y - 35;
      }
      if (!targets.length) effects.push({ type: 'bolt', x1: px, y1: py, x2: px + P.facing * 200, y2: py, t: 0, dur: 0.25 });
      break;
    }
    case 'tornado':
      sfx('dash');
      P.spinT = 1.3;
      break;
    case 'meteor': {
      sfx('laser');
      for (let i = 0; i < 6; i++) {
        const tx = enemies.length && Math.random() < 0.7 ? pick(enemies).x : (boss ? boss.x : rnd(80, W - 80));
        projs.push({ x: tx + rnd(-60, 60), y: -20 - i * 50, vx: rnd(-1, 1), vy: 9, r: 10, dmg: dmgBase * 1.3, from: 'player', col: '#ff5722', life: 4, explosive: true, meteor: true });
      }
      break;
    }
    case 'blackhole':
      sfx('laser');
      effects.push({ type: 'blackhole', x: P.x + P.facing * 140, y: GROUND - 90, t: 0, dur: 2.2, dmg: dmgBase * 0.5, tick: 0 });
      break;
    case 'apocalypse': {
      sfx('boom'); sfx('boss');
      flash = 0.8; shake = 28; hitstop = 0.12;
      effects.push({ type: 'explosion', x: W / 2, y: GROUND - 100, t: 0, dur: 0.9, r: 600, col: '#ff2222' });
      for (const e of enemies) if (!e.dead) damageEnemy(e, dmgBase * 4, Math.sign(e.x - P.x) * 10, false, { gore: 2.6 });
      if (boss) damageEnemy(boss, dmgBase * 3 * P.stats.bossDmg, Math.sign(boss.x - P.x) * 6, true);
      for (let i = 0; i < 8; i++) addDecal(rnd(40, W - 40), rnd(6, 14));
      break;
    }
  }
}

/* ---------------- weapon attacks ---------------- */
function meleeAttack(w, double) {
  const s = P.stats;
  const mult = double ? 2.3 : 1;
  P.cd = (w.cd * (double ? 1.4 : 1)) / s.atkSpd;
  P.atkDur = double ? 0.34 : 0.22;
  P.atkT = P.atkDur;
  P.atkPose = w.id === 'fists' ? (double ? 'punch2' : 'punch') : (w.blade && w.range < 50 ? 'stab' : 'slash');
  const ctx = { blade: w.blade, decap: w.decap || 0, gore: w.gore || 1 };
  const hit = hitEnemies(P.x, P.x + P.facing * w.range * s.range, weaponDmg(w) * mult, (w.kb || 3), { yBand: P.y - 30, ctx });
  sfx(hit ? (w.blade ? 'slice' : w.id === 'fists' ? 'punch' : 'kick') : 'dash');
  if (double) floatText(P.x + P.facing * 30, P.y - 70, 'DOUBLE!', '#ffe14d', false);
}

function kickAttack(double) {
  const s = P.stats;
  const air = !P.onGround;
  const mult = (double ? 1.9 : 1) * (air ? 1.6 : 1);
  P.cd = (0.55 * (double ? 1.4 : 1)) / s.atkSpd;
  P.atkDur = air ? 0.32 : double ? 0.36 : 0.28;
  P.atkT = P.atkDur;
  P.atkPose = air ? 'jumpkick' : double ? 'kick2' : 'kick';
  const range = (air ? 66 : 58) * s.range;
  const hit = hitEnemies(P.x, P.x + P.facing * range, 14 * playerDmg() * s.kickMul * mult, air ? 8 : 5, { yBand: P.y - 30, ctx: { gore: air ? 1.5 : 1 } });
  sfx(hit ? 'kick' : 'dash');
  if (air && hit) floatText(P.x + P.facing * 40, P.y - 80, 'FLYING KICK!', '#7ec8ff', false);
  else if (double) floatText(P.x + P.facing * 30, P.y - 70, 'DOUBLE KICK!', '#ffe14d', false);
}

function gunAttack(w) {
  const s = P.stats;
  P.cd = w.cd / s.atkSpd;
  P.atkDur = 0.16; P.atkT = 0.16; P.atkPose = 'shoot';
  sfx(w.pellets ? 'shotgun' : 'gun');
  const hy = P.y - 32;
  const n = w.pellets || 1;
  for (let i = 0; i < n; i++) {
    const a = (rnd(-1, 1) * (w.spread || 0.02));
    projs.push({
      x: P.x + P.facing * 22, y: hy + rnd(-2, 2),
      vx: P.facing * (w.pspeed || 13) * Math.cos(a), vy: (w.pspeed || 13) * Math.sin(a),
      r: 3, dmg: weaponDmg(w), from: 'player', col: '#ffd866', life: 1.2, gun: true, gore: w.gore,
    });
  }
  // muzzle flash + recoil
  particles.push({ x: P.x + P.facing * 26, y: hy, vx: P.facing * 2, vy: 0, r: 7, col: '#ffe89a', life: 0.06, grav: 0, type: 'ghost' });
  P.vx -= P.facing * (w.pellets ? 3 : 0.8);
  shake = Math.min(10, shake + (w.pellets ? 4 : 1.5));
}

function grenadeAttack(w) {
  P.cd = w.cd / P.stats.atkSpd;
  P.atkDur = 0.2; P.atkT = 0.2; P.atkPose = 'slash';
  sfx('dash');
  projs.push({
    x: P.x + P.facing * 14, y: P.y - 40, vx: P.facing * 7.5, vy: -6.5,
    r: 5, dmg: weaponDmg(w), from: 'player', col: '#9db864', life: 4,
    explosive: true, grenade: true, grav: 0.35,
  });
}

function flameAttack(w, dt) {
  P.cd = w.cd;
  P.atkDur = 0.12; P.atkT = 0.12; P.atkPose = 'shoot';
  sfx('flame');
  const hy = P.y - 32;
  for (let i = 0; i < 3; i++) {
    particles.push({
      x: P.x + P.facing * 26, y: hy + rnd(-4, 4),
      vx: P.facing * rnd(6, 10), vy: rnd(-1.5, 0.5), r: rnd(3, 6),
      col: pick(['#ff7a2a', '#ffb347', '#ff4411']), life: rnd(0.25, 0.45), grav: -0.05, type: 'flame',
    });
  }
  // cone damage
  for (const e of enemies) {
    if (!e.dead && Math.sign(e.x - P.x) === P.facing && Math.abs(e.x - P.x) < 150 && Math.abs((e.y - 28) - hy) < 55) {
      damageEnemy(e, weaponDmg(w), P.facing * 0.6, false, { gore: w.gore });
    }
  }
  if (boss && Math.sign(boss.x - P.x) === P.facing && Math.abs(boss.x - P.x) < 160 && Math.abs(boss.y - P.y) < 80) {
    damageEnemy(boss, weaponDmg(w) * P.stats.bossDmg, P.facing * 0.2, true);
  }
}

function laserAttack(w) {
  P.cd = w.cd / P.stats.atkSpd;
  P.atkDur = 0.2; P.atkT = 0.2; P.atkPose = 'shoot';
  sfx('laser');
  const hy = P.y - 32;
  effects.push({ type: 'pbeam', x: P.x + P.facing * 24, y: hy, dir: P.facing, t: 0, dur: 0.22 });
  for (const e of enemies) {
    if (!e.dead && Math.sign(e.x - P.x) === P.facing && Math.abs((e.y - 28) - hy) < 34) {
      damageEnemy(e, weaponDmg(w), P.facing * 4, false, { gore: w.gore, headshot: Math.random() < 0.15 });
    }
  }
  if (boss && Math.sign(boss.x - P.x) === P.facing && Math.abs((boss.y - 45) - hy) < 70) {
    damageEnemy(boss, weaponDmg(w) * P.stats.bossDmg, P.facing * 2, true);
  }
  shake = Math.min(10, shake + 3);
}

function sawAttack(w) {
  P.cd = w.cd;
  P.atkDur = 0.1; P.atkT = 0.1; P.atkPose = 'shoot';
  if (Math.random() < 0.4) sfx('saw');
  const ctx = { blade: true, decap: w.decap, gore: w.gore };
  const hit = hitEnemies(P.x, P.x + P.facing * w.range * P.stats.range, weaponDmg(w), 0.5, { yBand: P.y - 30, ctx });
  if (hit) blood(P.x + P.facing * 40, P.y - 30, 4, P.facing, 6);
}

/* ---------------- platforms & ladders ---------------- */
function updatePlats(dt) {
  for (const p of plats) {
    const px = p.cx, py = p.cy;
    if (p.move) {
      p.ph += dt * p.move.speed;
      p.cx = p.x + (p.move.axis === 'x' ? Math.sin(p.ph) * p.move.amp : 0);
      p.cy = p.y + (p.move.axis === 'y' ? Math.sin(p.ph) * p.move.amp : 0);
    }
    p.dx = p.cx - px; p.dy = p.cy - py;
  }
  const ride = ent => { if (ent.standPlat) { ent.x += ent.standPlat.dx; ent.y = ent.standPlat.cy; } };
  if (P && !P.dead) ride(P);
  for (const e of enemies) ride(e);
}
// one-way landing on platforms, then the floor
function landOn(ent, prevY) {
  ent.standPlat = null;
  if (ent.vy >= 0 && (!ent.dropT || ent.dropT <= 0)) {
    for (const p of plats) {
      if (prevY <= p.cy + 7 && ent.y >= p.cy && ent.x > p.cx - 6 && ent.x < p.cx + p.w + 6) {
        ent.y = p.cy; ent.vy = 0; ent.standPlat = p;
        return true;
      }
    }
  }
  if (ent.y >= GROUND) { ent.y = GROUND; ent.vy = 0; return true; }
  return false;
}

/* ---------------- player update ---------------- */
function updatePlayer(dt) {
  const f = dt * 60;
  const s = P.stats;
  P.cd -= dt; P.inv -= dt; P.hurtT -= dt; P.dashCd -= dt; P.comboT -= dt;
  P.bloodlustT -= dt; P.castT -= dt; P.atkT -= dt; P.dropT -= dt; P.wallT -= dt;
  if (P.comboT <= 0) P.combo = 0;
  if (s.regen) P.hp = Math.min(s.maxhp, P.hp + s.regen * dt);
  P.energy = Math.min(s.energyMax, P.energy + (8 * s.energyRegen) * dt);

  const left = keys['a'] || keys['ArrowLeft'], right = keys['d'] || keys['ArrowRight'];
  let mv = 0;
  if (left) mv -= 1; if (right) mv += 1;

  if (P.dashT > 0) {
    P.dashT -= dt;
    P.vx = P.facing * 15;
    if (s.dashDmg) {
      for (const e of enemies) {
        if (!e.dead && !P.dashHitSet.has(e) && Math.abs(e.x - P.x) < 30 && Math.abs(e.y - P.y) < 60) {
          P.dashHitSet.add(e);
          damageEnemy(e, 14 * playerDmg(), P.facing * 5, false);
        }
      }
    }
    particles.push({ x: P.x, y: P.y - 25, vx: 0, vy: 0, r: 10, col: 'rgba(255,255,255,0.25)', life: 0.2, grav: 0, type: 'ghost' });
  } else {
    P.vx += mv * s.speed * 0.22 * f;
    P.vx *= Math.pow(0.82, f);
    if (mv !== 0 && P.hurtT <= 0) P.facing = mv;
  }

  // ladders: W at the base or S from the top grabs on; W/S climbs; SPACE jumps off
  const upHeld = keys['w'] || keys['ArrowUp'], downHeld = keys['s'] || keys['ArrowDown'];
  const lad = ladders.find(l => Math.abs(P.x - l.x) < 16 && P.y > l.y0 - 4 && P.y <= l.y1 + 4);
  if (!P.climbing && lad) {
    const grabUp = upHeld && Math.abs(P.x - lad.x) < 12 && (P.onGround ? Math.abs(P.vx) < 3.5 : P.vy > -2);
    const grabDown = downHeld && P.y < GROUND - 2;
    if (grabUp || grabDown) { P.climbing = true; P.vx = 0; P.vy = 0; P.dashT = 0; P.standPlat = null; P.onGround = false; }
  }
  if (P.climbing) {
    if (!lad) P.climbing = false;
    else {
      P.standPlat = null;
      P.x = lerp(P.x, lad.x, 0.35);
      P.vx = 0; P.vy = 0;
      if (upHeld) { P.y -= 3.1 * f; P.legPh += dt * 10; }
      if (downHeld) { P.y += 3.1 * f; P.legPh += dt * 10; }
      if (P.y <= lad.y0) { P.y = lad.y0; P.onGround = true; P.jumpsLeft = s.jumps; P.climbing = false; }
      if (P.y >= GROUND && downHeld) { P.y = GROUND; P.onGround = true; P.climbing = false; }
      if (tap(' ')) { P.climbing = false; P.vy = -11 * s.jumpMul; }
    }
  }

  // drop through a platform with S
  if (tap('s') && P.standPlat && !lad && !P.climbing) {
    P.dropT = 0.25; P.y += 8; P.onGround = false; P.standPlat = null;
  }

  if ((tap('w') || tap('ArrowUp') || tap(' ')) && state === 'play' && !P.climbing) {
    if (!P.onGround && P.wallT > 0) {
      // wall jump: kick off the arena wall
      P.vy = -12.5 * s.jumpMul;
      P.vx = -P.wallDir * 9;
      P.facing = -P.wallDir;
      P.wallT = 0;
      sfx('dash');
      particles.push({ x: P.x, y: P.y - 20, vx: -P.wallDir * 2, vy: 0, r: 8, col: 'rgba(255,255,255,0.25)', life: 0.25, grav: 0, type: 'ghost' });
    } else if (P.jumpsLeft > 0) {
      P.vy = -12.5 * s.jumpMul;
      P.jumpsLeft--;
      P.onGround = false;
      particles.push({ x: P.x, y: P.y, vx: 0, vy: 0, r: 8, col: 'rgba(255,255,255,0.2)', life: 0.25, grav: 0, type: 'ghost' });
    }
  }

  if (tap('Shift') && s.dash && P.dashCd <= 0 && (P.onGround || s.airDash)) {
    P.dashT = 0.17; P.dashCd = 0.8; P.inv = Math.max(P.inv, 0.28);
    P.dashHitSet = new Set();
    P.climbing = false;
    sfx('dash');
  }

  // weapon switching: Q/E cycle, 1-9/0 direct
  if (tap('q')) { P.wIdx = (P.wIdx - 1 + P.weapons.length) % P.weapons.length; sfx('select'); }
  if (tap('e')) { P.wIdx = (P.wIdx + 1) % P.weapons.length; sfx('select'); }
  for (let i = 0; i < 10; i++) {
    if (tap(String((i + 1) % 10)) && P.weapons[i]) { P.wIdx = i; sfx('select'); }
  }
  const w = P.weapons[P.wIdx] || WEAPONS[0];

  // primary attack [J] — held for auto weapons; for melee a second tap
  // during the first swing chains into a double strike
  const jDown = w.auto ? (keys['j'] || keys['z']) : (tap('j') || tap('z'));
  if (jDown) {
    if (P.cd <= 0) {
      if (w.type === 'melee' && !w.auto) { P.lastJ = nowT; P.jDoubled = false; meleeAttack(w, false); }
      else if (w.type === 'gun') gunAttack(w);
      else if (w.type === 'thrown') grenadeAttack(w);
      else if (w.type === 'flame') flameAttack(w, dt);
      else if (w.type === 'laser') laserAttack(w);
      else if (w.type === 'saw') sawAttack(w);
    } else if (w.type === 'melee' && !w.auto && !P.jDoubled && nowT - P.lastJ < 0.45) {
      P.jDoubled = true;
      meleeAttack(w, true);
    }
  }

  // kick [K] — kung-fu roundhouse; second tap chains a double kick; airborne = flying kick
  if (tap('k') || tap('x')) {
    if (P.cd <= 0) { P.lastK = nowT; P.kDoubled = false; kickAttack(false); }
    else if (!P.kDoubled && nowT - P.lastK < 0.45) { P.kDoubled = true; kickAttack(true); }
  }
  if ((tap('l') || tap('c')) && P.castT <= 0) castSpecial();

  if (P.spinT > 0) {
    P.spinT -= dt;
    P.spinTick = (P.spinTick || 0) - dt;
    if (P.spinTick <= 0) {
      P.spinTick = 0.12;
      sfx('dash');
      hitEnemies(P.x - 80, P.x + 80, 9 * playerDmg(), 4, { ctx: { blade: true, decap: 0.1, gore: 1.5 } });
      particles.push({ x: P.x + rnd(-30, 30), y: P.y - rnd(0, 50), vx: rnd(-3, 3), vy: rnd(-3, 0), r: 4, col: '#cfd8ff', life: 0.3, grav: 0, type: 'ghost' });
    }
  }

  if (!P.climbing) {
    P.vy += 0.55 * f;
    // wall cling: hold toward the arena wall while falling to slide slowly
    const pushL = (keys['a'] || keys['ArrowLeft']) && P.x <= 18;
    const pushR = (keys['d'] || keys['ArrowRight']) && P.x >= W - 18;
    if (!P.onGround && (pushL || pushR) && P.vy > 0.5) {
      P.vy = Math.min(P.vy, 1.4);
      P.wallDir = pushL ? -1 : 1;
      P.wallT = 0.15;
      if (Math.random() < 0.2) particles.push({ x: P.x + P.wallDir * 10, y: P.y - 25, vx: 0, vy: 1, r: 2.5, col: '#999', life: 0.3, grav: 0, type: 'ghost' });
    }
    const prevVy = P.vy, prevY = P.y;
    P.x += P.vx * f; P.y += P.vy * f;
    P.x = clamp(P.x, 16, W - 16);
    const wasAir = !P.onGround;
    P.onGround = landOn(P, prevY);
    if (P.onGround) {
      if (wasAir && prevVy > 8) shake = Math.min(shake + 2, 8);
      P.jumpsLeft = s.jumps;
    }
  }
  if (Math.abs(P.vx) > 0.5 && P.onGround) P.legPh += dt * 13;
}

/* ---------------- projectiles / effects / particles ---------------- */
function updateProjs(dt) {
  const f = dt * 60;
  for (let i = projs.length - 1; i >= 0; i--) {
    const p = projs[i];
    p.life -= dt;
    if (p.grav) p.vy += p.grav * f;
    if (p.homing && !P.dead) {
      const a = Math.atan2((P.y - 28) - p.y, P.x - p.x);
      p.vx = lerp(p.vx, Math.cos(a) * 4.5, 0.04 * f);
      p.vy = lerp(p.vy, Math.sin(a) * 4.5, 0.04 * f);
    }
    p.x += p.vx * f; p.y += p.vy * f;
    let dead = p.life <= 0 || p.x < -60 || p.x > W + 60;
    if (p.y > GROUND) {
      if (p.explosive) { explode(p.x, GROUND - 10, p.meteor || p.grenade ? 85 : 70, p.dmg, p.from === 'player' ? 'player' : 'enemy'); }
      dead = true;
    }
    if (!dead && p.from === 'enemy') {
      if (!P.dead && P.inv <= 0 && Math.abs(P.x - p.x) < 16 && Math.abs((P.y - 28) - p.y) < 30) {
        damagePlayer(p.dmg, Math.sign(p.vx) * 3, null);
        dead = true;
      }
    } else if (!dead && p.from === 'player') {
      for (const e of enemies) {
        if (!e.dead && Math.abs(e.x - p.x) < 18 * e.scale && Math.abs((e.y - 28) - p.y) < 36) {
          if (p.explosive) explode(p.x, p.y, p.meteor || p.grenade ? 85 : 70, p.dmg, 'player');
          else {
            const head = p.gun && p.y < e.y - 40 * e.scale;
            damageEnemy(e, p.dmg * (head ? 1.7 : 1), Math.sign(p.vx) * (p.gun ? 4 : 4), false, { gore: p.gore || 1, headshot: head });
            if (p.gun) blood(e.x + Math.sign(p.vx) * 8, p.y, 8, Math.sign(p.vx), 6); // exit wound
          }
          dead = true; break;
        }
      }
      if (!dead && boss && Math.abs(boss.x - p.x) < 26 * boss.scale && Math.abs((boss.y - 45) - p.y) < 60) {
        if (p.explosive) explode(p.x, p.y, 85, p.dmg, 'player');
        else damageEnemy(boss, p.dmg * P.stats.bossDmg, Math.sign(p.vx) * 2, true);
        dead = true;
      }
    }
    if (dead) projs.splice(i, 1);
  }
}

function updateEffects(dt) {
  for (let i = effects.length - 1; i >= 0; i--) {
    const e = effects[i];
    e.t += dt;
    if (e.type === 'shockwave') {
      e.r = (e.t / e.dur) * e.maxR;
      const ring = e.r;
      const checkHit = (tx, ty, isPlayer, ent) => {
        const d = Math.abs(Math.abs(tx - e.x) - ring);
        if (d < 26 && ty > GROUND - 60) {
          if (isPlayer) { damagePlayer(e.dmg, Math.sign(tx - e.x) * 6, null); }
          else if (!e.hitSet.has(ent)) { e.hitSet.add(ent); damageEnemy(ent, e.dmg * (ent.isBoss ? P.stats.bossDmg : 1), Math.sign(tx - e.x) * 6, !!ent.isBoss); }
        }
      };
      if (e.from === 'enemy' && !P.dead && P.inv <= 0 && P.onGround) checkHit(P.x, P.y, true, null);
      if (e.from === 'player') {
        for (const en of enemies) if (!en.dead && en.onGround) checkHit(en.x, en.y, false, en);
        if (boss && boss.onGround) checkHit(boss.x, boss.y, false, boss);
      }
    } else if (e.type === 'beam') {
      if (!e.hit && e.t > 0.05 && e.from === 'enemy' && !P.dead && P.inv <= 0) {
        if (Math.abs((P.y - 28) - e.y) < 26 && ((e.dir > 0 && P.x > e.x) || (e.dir < 0 && P.x < e.x))) {
          e.hit = true;
          damagePlayer(e.dmg, e.dir * 7, null);
        }
      }
    } else if (e.type === 'blackhole') {
      e.tick -= dt;
      const pull = (ent, isBoss) => {
        const dx = e.x - ent.x, dy = (e.y) - (ent.y - 30);
        const d = Math.hypot(dx, dy);
        if (d < 240) {
          ent.vx += (dx / (d + 1)) * (isBoss ? 0.5 : 1.6) * dt * 60;
          if (!isBoss && d < 200) ent.vy += (dy / (d + 1)) * 1.2 * dt * 60;
        }
      };
      for (const en of enemies) if (!en.dead) pull(en, false);
      if (boss) pull(boss, true);
      if (e.tick <= 0) {
        e.tick = 0.25;
        for (const en of enemies) if (!en.dead && Math.hypot(en.x - e.x, (en.y - 30) - e.y) < 90) damageEnemy(en, e.dmg, 0, false, { gore: 1.6 });
        if (boss && Math.hypot(boss.x - e.x, (boss.y - 45) - e.y) < 110) damageEnemy(boss, e.dmg * P.stats.bossDmg, 0, true);
      }
    }
    if (e.t >= e.dur) {
      if (e.type === 'blackhole') { explode(e.x, e.y, 110, e.dmg * 3, 'player'); }
      effects.splice(i, 1);
    }
  }
}

function updateCorpses(dt) {
  for (let i = corpses.length - 1; i >= 0; i--) {
    const c = corpses[i];
    c.t += dt;
    c.x += c.vx * dt * 60;
    c.vx *= 0.9;
    // arterial fountain while standing
    if (c.t < 0.9 && c.noHead) {
      const neckX = c.x + Math.sin(c.rot) * 52 * c.scale * -c.facing;
      const neckY = c.y - Math.cos(c.rot) * 52 * c.scale;
      fountain(neckX, neckY, 3);
    }
    // body crumples after a moment
    if (c.t > 0.7 && !c.fell) {
      c.rot = Math.min(1.55, (c.t - 0.7) * 5) * -c.facing;
      if (c.rot * -c.facing >= 1.55) {
        c.fell = true;
        addDecal(c.x - c.facing * 30, 12); addDecal(c.x - c.facing * 50, 8);
        blood(c.x - c.facing * 40, GROUND - 5, 8, -c.facing, 3);
        sfx('squish');
      }
    }
    if (c.t > 5) corpses.splice(i, 1);
  }
}

function updateParticles(dt) {
  const f = dt * 60;
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.life -= dt;
    p.vy += (p.grav || 0) * f;
    p.x += p.vx * f; p.y += p.vy * f;
    if (p.type === 'blood' && p.y >= GROUND + rnd(0, 20)) {
      addDecal(p.x, p.r * 1.8);
      p.life = 0;
    }
    if (p.life <= 0) particles.splice(i, 1);
  }
  for (let i = gibs.length - 1; i >= 0; i--) {
    const gb = gibs[i];
    gb.life -= dt;
    gb.vy += 0.5 * f;
    gb.x += gb.vx * f; gb.y += gb.vy * f;
    gb.rot += gb.vr * f;
    if (gb.y >= GROUND) {
      gb.y = GROUND;
      if (Math.abs(gb.vy) > 2) {
        gb.vy *= -0.45; gb.vx *= 0.6;
        if (gb.bled < 3) { gb.bled++; blood(gb.x, gb.y, 3, 0, 2); addDecal(gb.x, rnd(3, 7)); }
      } else {
        gb.vy = 0; gb.vx *= 0.8;
        // severed heads keep rolling
        if (gb.type === 'head' && Math.abs(gb.vx) > 0.3) gb.vr = gb.vx / gb.len;
        else gb.vr *= 0.8;
      }
    }
    if (gb.life <= 0) gibs.splice(i, 1);
  }
  for (let i = texts.length - 1; i >= 0; i--) {
    const t = texts[i];
    t.life -= dt; t.y -= 30 * dt;
    if (t.life <= 0) texts.splice(i, 1);
  }
}

/* ---------------- level flow ---------------- */
function startLevel(n, keepLives) {
  level = n;
  if (!keepLives) { lives = 3; score = 0; }
  bonusMode = isBonusLevel(n);
  particles = []; gibs = []; decals = []; projs = []; effects = []; texts = []; enemies = []; corpses = [];
  boss = null; bossSpawned = false;
  // build the arena: side platforms with ladders, higher decks and movers as levels rise
  plats = []; ladders = [];
  const mk = (x, y, w, move) => { const p = { x, y, w, move: move || null, cx: x, cy: y, dx: 0, dy: 0, ph: rnd(0, TAU) }; plats.push(p); return p; };
  const p1 = mk(85 + rnd(0, 50), GROUND - 105, 175);
  const p2 = mk(W - 310 - rnd(0, 50), GROUND - 125, 175);
  if (n >= 3) mk(W / 2 - 95, GROUND - 200, 190);
  if (n >= 6) mk(W / 2 - 65, GROUND - 95, 130, { axis: 'x', amp: Math.min(190, 90 + n * 2.5), speed: 0.8 + n * 0.012 });
  if (n >= 14) mk(W - 170, GROUND - 255, 115, { axis: 'y', amp: 55, speed: 1.05 });
  ladders.push({ x: p1.x + p1.w - 16, y0: p1.y, y1: GROUND });
  ladders.push({ x: p2.x + 16, y0: p2.y, y1: GROUND });
  wave = 0; kills = 0; levelT = 0; banner = 2.6;
  streak = 0; streakT = 0;
  totalWaves = bonusMode ? 3 : Math.min(5, 2 + Math.floor(n / 11));
  P = makePlayer();
  P.wIdx = P.weapons.length - 1; // newest weapon equipped
  const nw = WEAPONS.find(w => w.lvl === n);
  if (nw) floatText(W / 2, 240, 'NEW WEAPON: ' + nw.name, '#7ec8ff', true);
  else if (n > 1) floatText(W / 2, 240, 'WEAPON REWARD: ARSENAL SHARPENED +4%', '#7ec8ff', false);
  state = 'play';
  spawnWave();
}

function updatePlay(dt) {
  levelT += dt; banner -= dt;
  streakT -= dt;
  if (streakT <= 0) streak = 0;
  updatePlats(dt);
  if (!P.dead) updatePlayer(dt);
  for (let i = enemies.length - 1; i >= 0; i--) {
    if (enemies[i].dead) { enemies.splice(i, 1); continue; }
    updateEnemy(enemies[i], dt);
  }
  if (boss) updateBoss(boss, dt);
  updateProjs(dt);
  updateEffects(dt);
  updateCorpses(dt);

  if (!bossSpawned && enemies.length === 0) {
    if (wave < totalWaves) spawnWave();
    else {
      bossSpawned = true;
      boss = makeBoss();
      floatText(W / 2, 150, '— VS —', '#ffffff', true);
      floatText(W / 2, 180, BOSS_NAMES[level - 1], '#ff3333', true);
      floatText(W / 2, 208, LOOK_LABEL[boss.look] + ' · ' + boss.style.name, '#ffe14d', true);
    }
  }
  if (tap('p') || tap('Escape')) { state = 'pause'; }
}

/* ============================================================
   RENDERING
   ============================================================ */
function seg2(ax, ay, bx, by, cx, cy) {
  g.beginPath(); g.moveTo(ax, ay); g.lineTo(bx, by); g.lineTo(cx, cy); g.stroke();
}
function drawLimb(ax, ay, bx, by, bend) {
  const mxp = (ax + bx) / 2, myp = (ay + by) / 2;
  const dx = bx - ax, dy = by - ay;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len, ny = dx / len;
  g.beginPath();
  g.moveTo(ax, ay);
  g.quadraticCurveTo(mxp + nx * bend, myp + ny * bend, bx, by);
  g.stroke();
}
function fist(x, y, s, col) {
  g.fillStyle = col;
  g.beginPath(); g.arc(x, y, 2.4 * s, 0, TAU); g.fill();
}

function drawWeapon(id, hx, hy, ang, s, col) {
  g.save();
  g.translate(hx, hy);
  g.rotate(ang);
  g.strokeStyle = '#c9d2dd'; g.lineWidth = 2.5 * s; g.lineCap = 'round';
  const L = x => x * s;
  switch (id) {
    case 'knife':
      g.beginPath(); g.moveTo(0, 0); g.lineTo(L(11), 0); g.stroke(); break;
    case 'machete':
      g.lineWidth = 3 * s;
      g.beginPath(); g.moveTo(0, 0); g.lineTo(L(16), 0); g.stroke(); break;
    case 'sword':
      g.beginPath(); g.moveTo(0, 0); g.lineTo(L(22), 0); g.stroke();
      g.beginPath(); g.moveTo(L(3), -L(4)); g.lineTo(L(3), L(4)); g.stroke(); break;
    case 'katana':
      g.strokeStyle = '#e8eef5';
      g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(L(13), -L(2.5), L(25), -L(4)); g.stroke(); break;
    case 'axe':
      g.strokeStyle = '#8a6a3a';
      g.beginPath(); g.moveTo(0, 0); g.lineTo(L(17), 0); g.stroke();
      g.fillStyle = '#c9d2dd';
      g.beginPath(); g.moveTo(L(14), -L(7)); g.lineTo(L(22), 0); g.lineTo(L(14), L(7)); g.closePath(); g.fill(); break;
    case 'bat':
      g.strokeStyle = '#8a6a3a'; g.lineWidth = 4 * s;
      g.beginPath(); g.moveTo(0, 0); g.lineTo(L(17), 0); g.stroke();
      g.fillStyle = '#c9d2dd';
      for (let i = 6; i <= 15; i += 3) { g.beginPath(); g.arc(L(i), (i % 2 ? -1 : 1) * L(3), 1.4 * s, 0, TAU); g.fill(); }
      break;
    case 'spear':
      g.strokeStyle = '#8a6a3a';
      g.beginPath(); g.moveTo(-L(6), 0); g.lineTo(L(28), 0); g.stroke();
      g.fillStyle = '#c9d2dd';
      g.beginPath(); g.moveTo(L(28), -L(3)); g.lineTo(L(35), 0); g.lineTo(L(28), L(3)); g.closePath(); g.fill(); break;
    case 'pistol':
      g.fillStyle = '#3c4250';
      g.fillRect(0, -L(3), L(9), L(4)); g.fillRect(0, 0, L(3), L(5)); break;
    case 'uzi':
      g.fillStyle = '#3c4250';
      g.fillRect(0, -L(3.5), L(12), L(5)); g.fillRect(L(3), 0, L(3), L(7)); break;
    case 'shotgun':
      g.fillStyle = '#3c4250';
      g.fillRect(0, -L(3), L(18), L(4));
      g.fillStyle = '#8a6a3a'; g.fillRect(-L(4), -L(2), L(6), L(4)); break;
    case 'flamer':
      g.fillStyle = '#7a3434';
      g.fillRect(0, -L(4), L(14), L(6));
      g.fillStyle = '#ffb347';
      g.beginPath(); g.arc(L(15), -L(1), 2 * s, 0, TAU); g.fill(); break;
    case 'laser':
      g.fillStyle = '#2a3a55';
      g.fillRect(0, -L(3), L(17), L(4));
      g.fillStyle = '#6df';
      g.fillRect(L(15), -L(2.5), L(4), L(3)); break;
    case 'chainsaw':
      g.fillStyle = '#7a3434';
      g.fillRect(0, -L(5), L(7), L(8));
      g.fillStyle = '#c9d2dd';
      g.fillRect(L(6), -L(3), L(13), L(4));
      g.strokeStyle = '#888'; g.lineWidth = 1.5;
      g.beginPath();
      for (let i = 0; i < 6; i++) { g.moveTo(L(7 + i * 2), -L(4)); g.lineTo(L(8 + i * 2), -L(3)); }
      g.stroke(); break;
    case 'grenade':
      g.fillStyle = '#5a7a3a';
      g.beginPath(); g.arc(L(2), 0, 3 * s, 0, TAU); g.fill(); break;
  }
  g.restore();
}

/* kung-fu stickman renderer */
function drawStick(x, y, s, col, facing, o) {
  o = o || {};
  g.strokeStyle = col;
  g.lineWidth = (o.lw || 3.5) * s;
  g.lineCap = 'round';
  const run = o.run || 0;
  const ph = o.legPh || 0;
  const t = clamp(o.t || 0, 0, 1);
  const ext = Math.sin(t * Math.PI); // attack extension curve
  const pose = o.pose || 'guard';
  const time = o.time || 0;
  const bob = (pose === 'guard' && run < 0.3) ? Math.sin(time * 3) * 1.3 * s : 0;

  let lean = 0;
  if (run > 0.3) lean = facing * 5 * s;
  if (pose === 'punch' || pose === 'punch2' || pose === 'stab') lean = facing * 4 * s * ext;
  if (pose === 'kick' || pose === 'kick2') lean = -facing * 7 * s * ext;
  if (pose === 'jumpkick') lean = facing * 11 * s;
  if (pose === 'slash') lean = facing * 6 * s * ext;
  if (pose === 'hurt') lean = -facing * 5 * s;

  const hipX = x, hipY = y - 26 * s + bob;
  const shX = x + lean, shY = y - 44 * s + bob;
  const hx = shX + facing * 2 * s, hy = shY - 8 * s;

  // head (or gushing neck stub)
  if (!o.noHead) {
    g.beginPath(); g.arc(hx, hy, 7 * s, 0, TAU); g.stroke();
    if (o.eyes) {
      g.fillStyle = o.eyes;
      g.beginPath(); g.arc(hx + facing * 3 * s, hy - 1.5 * s, 1.6 * s, 0, TAU); g.fill();
    }
  } else {
    g.fillStyle = '#a00';
    g.beginPath(); g.arc(shX, shY - 2 * s, 3.5 * s, 0, TAU); g.fill();
  }
  // spine
  g.beginPath(); g.moveTo(shX, shY); g.lineTo(hipX, hipY); g.stroke();

  /* ---- legs ---- */
  const L = 26 * s; // full leg length
  if (pose === 'kick' || pose === 'kick2') {
    // roundhouse: foot sweeps an arc from the ground up past head height
    const a = ext * 1.9; // 0 = straight down, ~1.9 = above horizontal
    const fx = hipX + facing * Math.sin(a) * L;
    const fy = hipY + Math.cos(a) * L;
    const ka = a * 0.6;
    seg2(hipX, hipY, hipX + facing * Math.sin(ka) * L * 0.55, hipY + Math.cos(ka) * L * 0.55, fx, fy);
    fist(fx, fy, s * 1.1, col);
    if (pose === 'kick2') {
      const a2 = Math.max(0.2, ext * 1.2);
      const fx2 = hipX + facing * Math.sin(a2) * L;
      const fy2 = hipY + Math.cos(a2) * L;
      seg2(hipX, hipY, hipX + facing * Math.sin(a2 * 0.6) * L * 0.55, hipY + Math.cos(a2 * 0.6) * L * 0.55, fx2, fy2);
      fist(fx2, fy2, s, col);
    } else {
      // support leg, slightly bent
      seg2(hipX, hipY, hipX - facing * 4 * s, y - 10 * s, hipX - facing * 7 * s, y);
    }
    // motion arc behind the kick
    g.globalAlpha *= 0.35;
    g.beginPath(); g.arc(hipX, hipY, L * 0.95, facing > 0 ? 0.4 : Math.PI - 1.6, facing > 0 ? 1.6 : Math.PI - 0.4); g.stroke();
    g.globalAlpha /= 0.35;
  } else if (pose === 'jumpkick') {
    // flying kick: lead leg thrust straight, rear leg folded under
    const fx = hipX + facing * 26 * s, fy = hipY + 6 * s;
    seg2(hipX, hipY, hipX + facing * 13 * s, hipY + 3 * s, fx, fy);
    fist(fx, fy, s * 1.1, col);
    seg2(hipX, hipY, hipX - facing * 3 * s, hipY + 9 * s, hipX - facing * 11 * s, hipY + 5 * s);
  } else if (pose === 'jump') {
    // knees tucked
    seg2(hipX, hipY, hipX + facing * 6 * s, hipY + 9 * s, hipX - facing * 2 * s, hipY + 16 * s);
    seg2(hipX, hipY, hipX + facing * 9 * s, hipY + 11 * s, hipX + facing * 3 * s, hipY + 19 * s);
  } else if (run > 0.3) {
    const a = Math.sin(ph), b2 = Math.sin(ph + Math.PI);
    // knee-lift running gait
    seg2(hipX, hipY, hipX + (a * 7 + facing * 3) * s, hipY + 13 * s, x + a * 12 * s, y - Math.max(0, -a) * 9 * s);
    seg2(hipX, hipY, hipX + (b2 * 7 + facing * 3) * s, hipY + 13 * s, x + b2 * 12 * s, y - Math.max(0, -b2) * 9 * s);
  } else {
    // fighting stance: front foot forward, knees soft
    seg2(hipX, hipY, hipX + facing * 6 * s, hipY + 14 * s, x + facing * 9 * s, y);
    seg2(hipX, hipY, hipX - facing * 3 * s, hipY + 14 * s, x - facing * 7 * s, y);
  }

  /* ---- arms ---- */
  const weaponHand = (hxp, hyp, ang) => { if (o.weapon) drawWeapon(o.weapon, hxp, hyp, facing > 0 ? ang : Math.PI - ang, s, col); };
  if (pose === 'punch' || pose === 'stab') {
    // straight lead punch with rear guard at the chin
    const fx = shX + facing * (9 + 22 * ext) * s, fy = shY + 1 * s;
    seg2(shX, shY, shX + facing * (5 + 11 * ext) * s, shY + (4 - 3 * ext) * s, fx, fy);
    fist(fx, fy, s, col);
    if (pose === 'stab') weaponHand(fx, fy, 0);
    // speed lines
    if (ext > 0.55) {
      g.globalAlpha *= 0.4;
      g.beginPath(); g.moveTo(fx - facing * 14 * s, fy - 3 * s); g.lineTo(fx - facing * 4 * s, fy - 3 * s); g.stroke();
      g.beginPath(); g.moveTo(fx - facing * 14 * s, fy + 3 * s); g.lineTo(fx - facing * 4 * s, fy + 3 * s); g.stroke();
      g.globalAlpha /= 0.4;
    }
    const gx = shX + facing * 5 * s, gy = shY - 1 * s;
    seg2(shX, shY, shX - facing * 1 * s, shY + 8 * s, gx, gy);
    fist(gx, gy, s, col);
  } else if (pose === 'punch2') {
    // both fists driving forward
    const f1x = shX + facing * (10 + 21 * ext) * s, f1y = shY - 1 * s;
    const f2x = shX + facing * (6 + 15 * (1 - ext * 0.5)) * s, f2y = shY + 5 * s;
    seg2(shX, shY, shX + facing * 6 * s, shY + 2 * s, f1x, f1y);
    seg2(shX, shY, shX + facing * 3 * s, shY + 8 * s, f2x, f2y);
    fist(f1x, f1y, s, col); fist(f2x, f2y, s, col);
  } else if (pose === 'slash') {
    // overhead arc swing
    const ang = lerp(-2.0, 0.55, ext);
    const ax2 = Math.cos(ang), ay2 = Math.sin(ang);
    const hx2 = shX + facing * ax2 * 17 * s, hy2 = shY + ay2 * 17 * s;
    seg2(shX, shY, shX + facing * ax2 * 9 * s, shY + ay2 * 9 * s - 2 * s, hx2, hy2);
    fist(hx2, hy2, s, col);
    weaponHand(hx2, hy2, ang);
    // swing trail
    g.globalAlpha *= 0.3;
    g.beginPath();
    g.arc(shX, shY, 24 * s, facing > 0 ? ang - 1.1 : Math.PI - ang, facing > 0 ? ang : Math.PI - ang + 1.1);
    g.stroke();
    g.globalAlpha /= 0.3;
    const gx = shX - facing * 4 * s, gy = shY + 7 * s;
    seg2(shX, shY, shX - facing * 2 * s, shY + 5 * s, gx, gy);
  } else if (pose === 'shoot') {
    // two-hand firing stance, slight recoil
    const rec = (1 - ext) * 3 * s;
    const hx2 = shX + facing * (17 * s - rec), hy2 = shY + 3 * s;
    seg2(shX, shY, shX + facing * 9 * s, shY + 5 * s, hx2, hy2);
    seg2(shX, shY, shX + facing * 7 * s, shY + 7 * s, hx2 - facing * 3 * s, hy2 + 1 * s);
    weaponHand(hx2, hy2, 0);
  } else if (pose === 'cast') {
    seg2(shX, shY, shX - 7 * s, shY - 8 * s, shX - 9 * s, shY - 17 * s);
    seg2(shX, shY, shX + 7 * s, shY - 8 * s, shX + 9 * s, shY - 17 * s);
  } else if (pose === 'hurt') {
    seg2(shX, shY, shX - facing * 8 * s, shY + 2 * s, shX - facing * 13 * s, shY - 5 * s);
    seg2(shX, shY, shX + facing * 7 * s, shY + 1 * s, shX + facing * 11 * s, shY - 3 * s);
  } else if (pose === 'panic') {
    // arms flailing overhead
    const wig = Math.sin(time * 22) * 3 * s;
    seg2(shX, shY, shX - 6 * s, shY - 9 * s, shX - 8 * s + wig, shY - 18 * s);
    seg2(shX, shY, shX + 6 * s, shY - 9 * s, shX + 8 * s - wig, shY - 18 * s);
  } else if (pose === 'jumpkick' || pose === 'kick' || pose === 'kick2') {
    // guard arms while kicking
    const gx = shX + facing * 8 * s, gy = shY - 2 * s;
    seg2(shX, shY, shX + facing * 4 * s, shY + 6 * s, gx, gy);
    fist(gx, gy, s, col);
    seg2(shX, shY, shX - facing * 5 * s, shY + 6 * s, shX - facing * 2 * s, shY - 1 * s);
  } else if (pose === 'jump') {
    seg2(shX, shY, shX - facing * 6 * s, shY + 4 * s, shX - facing * 9 * s, shY - 6 * s);
    seg2(shX, shY, shX + facing * 7 * s, shY + 4 * s, shX + facing * 10 * s, shY - 4 * s);
  } else if (run > 0.3) {
    const a = Math.sin(ph + Math.PI), b2 = Math.sin(ph);
    seg2(shX, shY, shX + (a * 5 + facing * 3) * s, shY + 7 * s, shX + a * 10 * s, shY + 11 * s);
    seg2(shX, shY, shX + (b2 * 5 + facing * 3) * s, shY + 7 * s, shX + b2 * 10 * s, shY + 11 * s);
    if (o.weapon) weaponHand(shX + b2 * 10 * s, shY + 11 * s, -0.5);
  } else {
    // kung-fu guard: lead fist forward at chin height, rear fist close
    const f1x = shX + facing * 13 * s, f1y = shY - 1 * s + bob * 0.5;
    const f2x = shX + facing * 5 * s, f2y = shY + 3 * s;
    seg2(shX, shY, shX + facing * 7 * s, shY + 7 * s, f1x, f1y);
    seg2(shX, shY, shX - facing * 1 * s, shY + 9 * s, f2x, f2y);
    fist(f1x, f1y, s, col); fist(f2x, f2y, s, col);
    if (o.weapon) weaponHand(f1x, f1y, -0.6);
  }
}

function drawBackground() {
  const z = zoneOf(level);
  const grad = g.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, z.sky[0]); grad.addColorStop(1, z.sky[1]);
  g.fillStyle = grad; g.fillRect(0, 0, W, H);

  g.fillStyle = 'rgba(0,0,0,0.35)';
  const zi = zoneIdx(level);
  let seed = zi * 999 + 7;
  const srand = () => { seed = (seed * 16807) % 2147483647; return (seed % 1000) / 1000; };
  // parallax: silhouettes drift opposite the player for depth
  const par = (P && (state === 'play' || state === 'pause')) ? (P.x - W / 2) * -0.06 : 0;
  for (let i = 0; i < 14; i++) {
    const bx = i * 72 + srand() * 30 + par;
    const bh = 60 + srand() * 170;
    if (z.sil === 'city' || z.sil === 'towers') {
      g.fillRect(bx, GROUND - bh, 38 + srand() * 26, bh);
    } else if (z.sil === 'trees' || z.sil === 'hills') {
      g.beginPath(); g.arc(bx, GROUND, 30 + srand() * 70, Math.PI, TAU); g.fill();
    } else if (z.sil === 'spikes' || z.sil === 'flames' || z.sil === 'pillars') {
      g.beginPath(); g.moveTo(bx, GROUND); g.lineTo(bx + 20 + srand() * 14, GROUND - bh); g.lineTo(bx + 44, GROUND); g.fill();
    } else if (z.sil === 'pipes') {
      g.fillRect(bx, GROUND - 36 - srand() * 50, 60, 14);
    } else if (z.sil === 'dunes') {
      g.beginPath(); g.ellipse(bx, GROUND, 80, 24 + srand() * 30, 0, Math.PI, TAU); g.fill();
    } else {
      g.beginPath(); g.arc(bx, 80 + srand() * 280, 1 + srand() * 2.5, 0, TAU); g.fill();
    }
  }
  g.fillStyle = z.ground;
  g.fillRect(0, GROUND, W, H - GROUND);
  g.strokeStyle = z.accent; g.globalAlpha = 0.5; g.lineWidth = 2;
  g.beginPath(); g.moveTo(0, GROUND); g.lineTo(W, GROUND); g.stroke();
  g.globalAlpha = 1;
}

function drawPlats() {
  const z = zoneOf(level);
  for (const l of ladders) {
    g.strokeStyle = '#727b8d'; g.lineWidth = 2.5;
    g.beginPath();
    g.moveTo(l.x - 7, l.y0); g.lineTo(l.x - 7, l.y1);
    g.moveTo(l.x + 7, l.y0); g.lineTo(l.x + 7, l.y1);
    g.stroke();
    g.lineWidth = 2;
    for (let y = l.y0 + 8; y < l.y1 - 2; y += 13) {
      g.beginPath(); g.moveTo(l.x - 7, y); g.lineTo(l.x + 7, y); g.stroke();
    }
  }
  for (const p of plats) {
    g.fillStyle = '#10131b';
    g.fillRect(p.cx, p.cy, p.w, 10);
    g.strokeStyle = '#2a3040'; g.lineWidth = 1.5;
    g.strokeRect(p.cx, p.cy, p.w, 10);
    g.fillStyle = z.accent; g.globalAlpha = 0.8;
    g.fillRect(p.cx, p.cy, p.w, 2.5);
    g.globalAlpha = 1;
    if (p.move) { // mover lights
      g.fillStyle = '#ffe14d';
      g.beginPath(); g.arc(p.cx + 6, p.cy + 6, 2, 0, TAU); g.fill();
      g.beginPath(); g.arc(p.cx + p.w - 6, p.cy + 6, 2, 0, TAU); g.fill();
    }
  }
}

function drawDecals() {
  for (const d of decals) {
    g.globalAlpha = d.a;
    g.fillStyle = d.col;
    g.beginPath(); g.ellipse(d.x, d.y, d.r, d.r * 0.35, 0, 0, TAU); g.fill();
  }
  g.globalAlpha = 1;
}

function drawCorpses() {
  for (const c of corpses) {
    g.save();
    g.translate(c.x, c.y);
    g.rotate(c.rot);
    g.globalAlpha = c.t > 4 ? clamp(5 - c.t, 0, 1) : 1;
    drawStick(0, 0, c.scale, c.col, c.facing, { pose: 'hurt', noHead: c.noHead, lw: 3.5 });
    g.restore();
  }
  g.globalAlpha = 1;
}

function drawGibs() {
  for (const gb of gibs) {
    g.save();
    g.translate(gb.x, gb.y);
    g.rotate(gb.rot);
    g.strokeStyle = gb.col;
    g.lineWidth = gb.lw; g.lineCap = 'round';
    g.globalAlpha = clamp(gb.life, 0, 1);
    if (gb.type === 'head') {
      g.beginPath(); g.arc(0, 0, gb.len, 0, TAU); g.stroke();
      g.fillStyle = '#a00';
      g.beginPath(); g.arc(0, gb.len * 0.8, gb.len * 0.4, 0, TAU); g.fill();
    } else {
      g.beginPath(); g.moveTo(-gb.len / 2, 0); g.lineTo(gb.len / 2, 0); g.stroke();
      g.fillStyle = '#a00';
      g.beginPath(); g.arc(gb.len / 2, 0, gb.lw * 0.7, 0, TAU); g.fill();
    }
    g.restore();
  }
  g.globalAlpha = 1;
}

function drawParticles() {
  for (const p of particles) {
    g.globalAlpha = clamp(p.life * 1.5, 0, 1);
    g.fillStyle = p.col;
    g.beginPath(); g.arc(p.x, p.y, p.r, 0, TAU); g.fill();
  }
  g.globalAlpha = 1;
}

function drawProjs() {
  for (const p of projs) {
    g.fillStyle = p.col;
    if (p.gun) {
      // bullet tracer
      g.strokeStyle = p.col; g.lineWidth = 2;
      g.beginPath(); g.moveTo(p.x - p.vx * 1.5, p.y - p.vy * 1.5); g.lineTo(p.x, p.y); g.stroke();
    } else {
      g.beginPath(); g.arc(p.x, p.y, p.r, 0, TAU); g.fill();
      if (p.meteor || p.grenade) {
        g.globalAlpha = 0.4;
        g.beginPath(); g.arc(p.x - p.vx * 3, p.y - p.vy * 3, p.r * 0.7, 0, TAU); g.fill();
        g.globalAlpha = 1;
      }
    }
  }
}

function drawEffects() {
  for (const e of effects) {
    const k = e.t / e.dur;
    if (e.type === 'shockwave') {
      g.strokeStyle = e.col; g.lineWidth = 6 * (1 - k) + 1;
      g.globalAlpha = 1 - k;
      g.beginPath(); g.arc(e.x, e.y, e.r, Math.PI, TAU); g.stroke();
      g.beginPath(); g.arc(e.x, e.y, e.r * 0.7, Math.PI, TAU); g.stroke();
    } else if (e.type === 'explosion') {
      g.globalAlpha = 1 - k;
      g.fillStyle = e.col;
      g.beginPath(); g.arc(e.x, e.y, e.r * Math.min(1, k * 3), 0, TAU); g.fill();
      g.fillStyle = '#fff';
      g.beginPath(); g.arc(e.x, e.y, e.r * Math.min(1, k * 3) * 0.45, 0, TAU); g.fill();
    } else if (e.type === 'beam') {
      g.globalAlpha = 1 - k;
      g.fillStyle = '#ff4444';
      const x2 = e.dir > 0 ? W : 0;
      g.fillRect(Math.min(e.x, x2), e.y - 9 * (1 - k), Math.abs(x2 - e.x), 18 * (1 - k));
      g.fillStyle = '#fff';
      g.fillRect(Math.min(e.x, x2), e.y - 3 * (1 - k), Math.abs(x2 - e.x), 6 * (1 - k));
    } else if (e.type === 'pbeam') {
      g.globalAlpha = 1 - k;
      const x2 = e.dir > 0 ? W : 0;
      g.fillStyle = '#3df';
      g.fillRect(Math.min(e.x, x2), e.y - 5 * (1 - k), Math.abs(x2 - e.x), 10 * (1 - k));
      g.fillStyle = '#fff';
      g.fillRect(Math.min(e.x, x2), e.y - 2 * (1 - k), Math.abs(x2 - e.x), 4 * (1 - k));
    } else if (e.type === 'bolt') {
      g.globalAlpha = 1 - k;
      g.strokeStyle = '#aef'; g.lineWidth = 3;
      g.beginPath(); g.moveTo(e.x1, e.y1);
      const segs = 6;
      for (let i = 1; i <= segs; i++) {
        const t = i / segs;
        g.lineTo(lerp(e.x1, e.x2, t) + (i < segs ? rnd(-12, 12) : 0), lerp(e.y1, e.y2, t) + (i < segs ? rnd(-12, 12) : 0));
      }
      g.stroke();
    } else if (e.type === 'blackhole') {
      g.globalAlpha = 0.9;
      g.fillStyle = '#000';
      g.beginPath(); g.arc(e.x, e.y, 26 + Math.sin(e.t * 12) * 4, 0, TAU); g.fill();
      g.strokeStyle = '#c44dff'; g.lineWidth = 3; g.globalAlpha = 0.8;
      g.beginPath(); g.arc(e.x, e.y, 36 + Math.sin(e.t * 9) * 8, e.t * 5, e.t * 5 + 4); g.stroke();
      g.beginPath(); g.arc(e.x, e.y, 52 + Math.sin(e.t * 7) * 10, -e.t * 4, -e.t * 4 + 3); g.stroke();
    }
    g.globalAlpha = 1;
  }
}

/* ---------------- boss monster bodies ----------------
   every zone's boss is a different creature, drawn from scratch */
function drawBoss(b) {
  const s = b.scale, f = b.facing, t = levelT;
  const col = b.hurtT > 0 ? '#ffffff' : b.col;
  const eye = b.enraged ? '#ff2222' : '#ffe14d';
  g.save();
  g.translate(b.x, b.y);
  if (b.state === 'charge') g.rotate((b.chargeDir || f) * 0.13);
  if (b.state === 'spin') g.rotate(Math.sin(t * 18) * 0.35);
  if (b.state === 'tele') g.globalAlpha = 0.55 + 0.45 * Math.sin(t * 30);
  g.strokeStyle = col; g.fillStyle = col;
  g.lineWidth = Math.max(3.5, 2.2 * s); g.lineCap = 'round'; g.lineJoin = 'round';
  const E = (x, y, r) => { g.fillStyle = eye; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill(); g.fillStyle = col; };

  switch (b.look) {
    case 'warrior': {
      // armored warlord: horned helm, spiked pauldrons, greatsword
      drawStick(0, 0, s, col, f, { pose: b.atkT > 0 ? 'slash' : 'guard', t: b.atkT > 0 ? 1 - b.atkT / 0.25 : 0, run: Math.abs(b.vx) / 2, legPh: b.legPh, lw: 4.2 / s * s, eyes: eye, weapon: b.weaponHeld, time: t });
      const hx = f * 2 * s, hy = -52 * s;
      g.beginPath(); g.moveTo(hx - 5 * s, hy - 4 * s); g.lineTo(hx - 9 * s, hy - 12 * s); g.stroke();
      g.beginPath(); g.moveTo(hx + 5 * s, hy - 4 * s); g.lineTo(hx + 9 * s, hy - 12 * s); g.stroke();
      g.beginPath(); g.moveTo(-8 * s, -44 * s); g.lineTo(-13 * s, -52 * s); g.stroke();
      g.beginPath(); g.moveTo(8 * s, -44 * s); g.lineTo(13 * s, -52 * s); g.stroke();
      break;
    }
    case 'mech': {
      // war machine: boxy chassis, glowing visor, piston legs, arm cannon
      const bob2 = Math.sin(t * 4) * 1.5;
      g.fillStyle = '#1c2230';
      g.fillRect(-15 * s, -54 * s + bob2, 30 * s, 30 * s);
      g.strokeRect(-15 * s, -54 * s + bob2, 30 * s, 30 * s);
      g.fillRect(-9 * s, -66 * s + bob2, 18 * s, 12 * s);
      g.strokeRect(-9 * s, -66 * s + bob2, 18 * s, 12 * s);
      g.fillStyle = eye;
      g.fillRect(-6 * s + f * 2 * s, -62 * s + bob2, 10 * s, 2.5 * s); // visor
      g.fillStyle = col;
      g.beginPath(); g.moveTo(0, -66 * s + bob2); g.lineTo(0, -74 * s + bob2); g.stroke();
      g.beginPath(); g.arc(0, -75 * s + bob2, 1.6 * s, 0, TAU); g.fill();
      // arm cannon points at you
      g.beginPath(); g.moveTo(f * 14 * s, -46 * s + bob2); g.lineTo(f * 28 * s, -40 * s + bob2); g.stroke();
      g.fillRect(f * 24 * s - 3 * s, -44 * s + bob2, 6 * s, 6 * s);
      g.beginPath(); g.moveTo(-f * 14 * s, -46 * s + bob2); g.lineTo(-f * 22 * s, -32 * s + bob2); g.stroke();
      // piston legs
      seg2(-8 * s, -24 * s + bob2, -10 * s, -12 * s, -12 * s, 0);
      seg2(8 * s, -24 * s + bob2, 10 * s, -12 * s, 12 * s, 0);
      g.beginPath(); g.arc(-10 * s, -12 * s, 2.2 * s, 0, TAU); g.fill();
      g.beginPath(); g.arc(10 * s, -12 * s, 2.2 * s, 0, TAU); g.fill();
      break;
    }
    case 'ogre': {
      // fat tusked ogre with a club
      const br = Math.sin(t * 3) * s;
      g.beginPath(); g.ellipse(0, -26 * s + br * 0.4, 18 * s, 19 * s, 0, 0, TAU); g.stroke();
      g.beginPath(); g.arc(f * 7 * s, -50 * s + br * 0.6, 8 * s, 0, TAU); g.stroke();
      E(f * 10 * s, -52 * s + br * 0.6, 1.8 * s);
      g.beginPath(); g.moveTo(f * 3 * s, -45 * s); g.lineTo(f * 1 * s, -40 * s); g.stroke(); // tusks
      g.beginPath(); g.moveTo(f * 11 * s, -45 * s); g.lineTo(f * 13 * s, -40 * s); g.stroke();
      // club arm
      const swing = b.atkT > 0 ? Math.sin((1 - b.atkT / 0.25) * Math.PI) : 0;
      const ca = lerp(-0.9, 0.5, swing);
      const cx2 = f * Math.cos(ca) * 20 * s, cy2 = -40 * s + Math.sin(ca) * 20 * s;
      seg2(f * 10 * s, -40 * s, f * 16 * s, -42 * s + 6 * s * swing, cx2, cy2);
      g.lineWidth = Math.max(5, 3.4 * s);
      g.beginPath(); g.moveTo(cx2, cy2); g.lineTo(cx2 + f * 12 * s, cy2 - 2 * s); g.stroke();
      g.lineWidth = Math.max(3.5, 2.2 * s);
      seg2(-f * 10 * s, -40 * s, -f * 15 * s, -32 * s, -f * 13 * s, -22 * s);
      // stubby legs
      seg2(-7 * s, -10 * s, -8 * s, -5 * s, -9 * s, 0);
      seg2(7 * s, -10 * s, 8 * s, -5 * s, 9 * s, 0);
      break;
    }
    case 'icetitan': {
      // angular crystal colossus with a glowing core
      g.beginPath();
      g.moveTo(-12 * s, -16 * s); g.lineTo(-17 * s, -50 * s); g.lineTo(0, -60 * s);
      g.lineTo(17 * s, -50 * s); g.lineTo(12 * s, -16 * s); g.closePath();
      g.stroke();
      g.beginPath(); g.moveTo(-6 * s, -60 * s); g.lineTo(0, -72 * s); g.lineTo(6 * s, -60 * s); g.stroke(); // head shard
      E(f * 2 * s, -63 * s, 1.8 * s);
      // shoulder crystals
      g.beginPath(); g.moveTo(-17 * s, -50 * s); g.lineTo(-26 * s, -62 * s); g.lineTo(-12 * s, -54 * s); g.stroke();
      g.beginPath(); g.moveTo(17 * s, -50 * s); g.lineTo(26 * s, -62 * s); g.lineTo(12 * s, -54 * s); g.stroke();
      // glowing core
      g.fillStyle = eye; g.globalAlpha *= 0.5 + 0.5 * Math.sin(t * 5);
      g.beginPath(); g.arc(0, -38 * s, 4 * s, 0, TAU); g.fill();
      g.globalAlpha = b.state === 'tele' ? 0.55 + 0.45 * Math.sin(t * 30) : 1;
      g.fillStyle = col;
      // angular limbs
      seg2(-15 * s, -46 * s, -22 * s, -34 * s, -19 * s, -20 * s);
      seg2(15 * s, -46 * s, f > 0 ? 26 * s : 22 * s, -34 * s, 24 * s, -22 * s);
      seg2(-9 * s, -16 * s, -12 * s, -8 * s, -14 * s, 0);
      seg2(9 * s, -16 * s, 12 * s, -8 * s, 14 * s, 0);
      break;
    }
    case 'dragon': {
      // winged dragon: long neck, tail, flapping wings, fire maw
      const flap = Math.sin(t * 7) * 10 * s;
      // tail
      g.beginPath(); g.moveTo(-f * 14 * s, -24 * s);
      g.quadraticCurveTo(-f * 32 * s, -28 * s, -f * 42 * s, -14 * s); g.stroke();
      g.beginPath(); g.moveTo(-f * 42 * s, -14 * s); g.lineTo(-f * 47 * s, -19 * s); g.lineTo(-f * 45 * s, -10 * s); g.closePath(); g.fill();
      // body
      g.beginPath(); g.ellipse(-f * 2 * s, -24 * s, 20 * s, 11 * s, 0, 0, TAU); g.stroke();
      // legs
      seg2(-f * 10 * s, -16 * s, -f * 12 * s, -8 * s, -f * 14 * s, 0);
      seg2(f * 8 * s, -16 * s, f * 10 * s, -8 * s, f * 12 * s, 0);
      // neck + head
      g.beginPath(); g.moveTo(f * 14 * s, -30 * s);
      g.quadraticCurveTo(f * 24 * s, -44 * s, f * 26 * s, -54 * s); g.stroke();
      g.beginPath(); g.moveTo(f * 26 * s, -58 * s); g.lineTo(f * 38 * s, -53 * s); g.lineTo(f * 26 * s, -49 * s); g.closePath(); g.stroke();
      E(f * 28 * s, -55 * s, 1.7 * s);
      // horns
      g.beginPath(); g.moveTo(f * 26 * s, -58 * s); g.lineTo(f * 22 * s, -65 * s); g.stroke();
      // wings
      g.beginPath(); g.moveTo(-f * 2 * s, -32 * s); g.lineTo(-f * 16 * s, -52 * s - flap); g.lineTo(-f * 26 * s, -36 * s - flap * 0.5); g.stroke();
      g.beginPath(); g.moveTo(2 * f * s, -32 * s); g.lineTo(-f * 8 * s, -56 * s - flap); g.lineTo(-f * 20 * s, -42 * s - flap * 0.5); g.stroke();
      // fire glow in the maw when breathing
      if (b.state === 'shoot' || b.state === 'laser' || b.state === 'tele') {
        g.fillStyle = '#ff7a2a'; g.globalAlpha *= 0.8;
        g.beginPath(); g.arc(f * 36 * s, -53 * s, (2 + Math.sin(t * 20)) * s, 0, TAU); g.fill();
        g.globalAlpha = b.state === 'tele' ? 0.55 + 0.45 * Math.sin(t * 30) : 1;
      }
      break;
    }
    case 'seamonster': {
      // tentacled horror with one huge eye
      const bob2 = Math.sin(t * 2.5) * 4;
      for (let i = 0; i < 5; i++) {
        const bx = (i - 2) * 9 * s;
        const tipX = bx + Math.sin(t * 3 + i * 1.7) * 10 * s;
        g.beginPath();
        g.moveTo(bx * 0.6, -30 * s + bob2);
        g.quadraticCurveTo(bx, -14 * s, tipX, 0);
        g.stroke();
      }
      g.beginPath(); g.arc(0, -40 * s + bob2, 17 * s, 0, TAU); g.stroke();
      // dripping slime
      g.beginPath(); g.arc(8 * s, -24 * s + bob2 + Math.sin(t * 6) * 2, 1.5 * s, 0, TAU); g.fill();
      // the eye
      g.fillStyle = '#fff';
      g.beginPath(); g.ellipse(f * 5 * s, -42 * s + bob2, 7 * s, 8 * s, 0, 0, TAU); g.fill();
      g.fillStyle = b.enraged ? '#ff2222' : '#0a3a4a';
      g.beginPath(); g.arc(f * 7 * s, -42 * s + bob2, 3.2 * s, 0, TAU); g.fill();
      g.fillStyle = col;
      break;
    }
    case 'ghost': {
      // floating phantom, translucent, wailing
      const bob2 = Math.sin(t * 2) * 6;
      g.globalAlpha *= 0.78;
      g.beginPath();
      g.arc(0, -52 * s + bob2, 11 * s, Math.PI, 0);
      g.lineTo(13 * s, -16 * s + bob2);
      for (let i = 0; i < 4; i++) g.quadraticCurveTo((9.75 - i * 6.5) * s, (-8 + Math.sin(t * 5 + i) * 3) * s + bob2, (6.5 - i * 6.5) * s, -16 * s + bob2);
      g.closePath();
      g.stroke();
      // hollow eyes + mouth
      g.fillStyle = b.enraged ? '#ff2222' : '#000';
      g.beginPath(); g.ellipse(f * 6 * s - 3 * s, -54 * s + bob2, 2.4 * s, 3.4 * s, 0, 0, TAU); g.fill();
      g.beginPath(); g.ellipse(f * 6 * s + 4 * s, -54 * s + bob2, 2.4 * s, 3.4 * s, 0, 0, TAU); g.fill();
      g.beginPath(); g.ellipse(f * 5 * s, -46 * s + bob2, 2 * s, 3 * s + Math.sin(t * 4) * s, 0, 0, TAU); g.fill();
      g.fillStyle = col;
      break;
    }
    case 'lion': {
      // four-legged beast king with a spiked mane
      const gallop = Math.sin(b.legPh * 1.4);
      g.beginPath(); g.ellipse(-f * 2 * s, -26 * s, 21 * s, 10 * s, 0, 0, TAU); g.stroke();
      // legs
      seg2(-f * 14 * s, -20 * s, -f * 16 * s, -10 * s, -f * (16 + gallop * 4) * s, 0);
      seg2(-f * 8 * s, -20 * s, -f * 9 * s, -10 * s, -f * (9 - gallop * 4) * s, 0);
      seg2(f * 8 * s, -20 * s, f * 9 * s, -10 * s, f * (9 + gallop * 4) * s, 0);
      seg2(f * 14 * s, -20 * s, f * 16 * s, -10 * s, f * (16 - gallop * 4) * s, 0);
      // tail
      g.beginPath(); g.moveTo(-f * 22 * s, -28 * s); g.quadraticCurveTo(-f * 30 * s, -42 * s, -f * 26 * s, -46 * s); g.stroke();
      g.beginPath(); g.arc(-f * 26 * s, -47 * s, 2.2 * s, 0, TAU); g.fill();
      // head + mane
      const hx2 = f * 22 * s, hy2 = -38 * s;
      for (let i = 0; i < 9; i++) {
        const a = -Math.PI / 2 + (i - 4) * 0.42;
        g.beginPath(); g.moveTo(hx2 + Math.cos(a) * 8 * s, hy2 + Math.sin(a) * 8 * s);
        g.lineTo(hx2 + Math.cos(a) * (13 + (i % 2) * 2.5) * s, hy2 + Math.sin(a) * (13 + (i % 2) * 2.5) * s); g.stroke();
      }
      g.beginPath(); g.arc(hx2, hy2, 8 * s, 0, TAU); g.stroke();
      E(hx2 + f * 3 * s, hy2 - 2 * s, 1.7 * s);
      // fangs
      g.beginPath(); g.moveTo(hx2 + f * 6 * s, hy2 + 5 * s); g.lineTo(hx2 + f * 7 * s, hy2 + 9 * s); g.stroke();
      break;
    }
    case 'devil': {
      // arch-devil: horns, bat wings, arrow tail, trident
      const flap = Math.sin(t * 5) * 6 * s;
      // wings
      for (const side of [-1, 1]) {
        g.beginPath();
        g.moveTo(side * 6 * s, -44 * s);
        g.lineTo(side * 24 * s, -60 * s - flap);
        g.lineTo(side * 20 * s, -46 * s - flap * 0.4);
        g.lineTo(side * 30 * s, -44 * s - flap * 0.6);
        g.lineTo(side * 16 * s, -34 * s);
        g.stroke();
      }
      drawStick(0, 0, s, col, f, { pose: b.atkT > 0 ? 'punch' : 'guard', t: b.atkT > 0 ? 1 - b.atkT / 0.25 : 0, run: Math.abs(b.vx) / 2, legPh: b.legPh, eyes: eye, time: t });
      // horns
      const hx2 = f * 2 * s, hy2 = -52 * s;
      g.beginPath(); g.moveTo(hx2 - 4 * s, hy2 - 4 * s); g.quadraticCurveTo(hx2 - 9 * s, hy2 - 10 * s, hx2 - 6 * s, hy2 - 14 * s); g.stroke();
      g.beginPath(); g.moveTo(hx2 + 4 * s, hy2 - 4 * s); g.quadraticCurveTo(hx2 + 9 * s, hy2 - 10 * s, hx2 + 6 * s, hy2 - 14 * s); g.stroke();
      // arrow tail
      g.beginPath(); g.moveTo(0, -26 * s); g.quadraticCurveTo(-f * 16 * s, -14 * s, -f * 22 * s, -22 * s); g.stroke();
      g.beginPath(); g.moveTo(-f * 22 * s, -22 * s); g.lineTo(-f * 27 * s, -24 * s); g.lineTo(-f * 23 * s, -27 * s); g.closePath(); g.fill();
      // trident
      const tx2 = f * 15 * s, ty2 = -45 * s;
      g.beginPath(); g.moveTo(tx2 - f * 4 * s, ty2 + 18 * s); g.lineTo(tx2 + f * 6 * s, ty2 - 14 * s); g.stroke();
      for (const o of [-3, 0, 3]) {
        g.beginPath(); g.moveTo(tx2 + f * (3 + o * 0.4) * s + o * s, ty2 - 12 * s); g.lineTo(tx2 + f * 7 * s + o * s, ty2 - 21 * s); g.stroke();
      }
      break;
    }
    case 'voidbeast': {
      // mass of darkness around a great eye, tentacles of static
      const bob2 = Math.sin(t * 2.2) * 5;
      g.fillStyle = '#05050c';
      g.beginPath(); g.arc(0, -38 * s + bob2, 16 * s + Math.sin(t * 4) * 1.5 * s, 0, TAU); g.fill(); g.stroke();
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * TAU + t * 0.6;
        const r0 = 15 * s, r1 = (24 + 6 * Math.sin(t * 3 + i * 2)) * s;
        g.beginPath();
        g.moveTo(Math.cos(a) * r0, -38 * s + bob2 + Math.sin(a) * r0 * 0.8);
        g.quadraticCurveTo(Math.cos(a) * r1 * 1.15, -38 * s + bob2 + Math.sin(a) * r1, Math.cos(a + 0.5) * r1, Math.min(0, -38 * s + bob2 + Math.sin(a + 0.5) * r1 * 1.3));
        g.stroke();
      }
      // the eye
      g.fillStyle = '#fff';
      g.beginPath(); g.ellipse(0, -38 * s + bob2, 8 * s, 6 * s, 0, 0, TAU); g.fill();
      g.fillStyle = b.enraged ? '#ff2222' : '#5a0d8a';
      g.beginPath(); g.arc(f * 2.5 * s, -38 * s + bob2, 3 * s, 0, TAU); g.fill();
      g.fillStyle = '#000';
      g.beginPath(); g.ellipse(f * 2.5 * s, -38 * s + bob2, 1.2 * s, 2.6 * s, 0, 0, TAU); g.fill();
      g.fillStyle = col;
      // orbiting motes
      for (let i = 0; i < 3; i++) {
        const a = t * 2 + i * 2.1;
        g.beginPath(); g.arc(Math.cos(a) * 26 * s, -38 * s + bob2 + Math.sin(a) * 14 * s, 1.6 * s, 0, TAU); g.fill();
      }
      break;
    }
    case 'death': {
      // DEATH INCARNATE: hooded reaper, scythe, burning gaze
      const bob2 = Math.sin(t * 1.8) * 5;
      // pulsing aura
      g.globalAlpha *= 0.25 + 0.15 * Math.sin(t * 3);
      g.beginPath(); g.arc(0, -40 * s + bob2, 34 * s, 0, TAU); g.stroke();
      g.globalAlpha = b.state === 'tele' ? 0.55 + 0.45 * Math.sin(t * 30) : 1;
      // cloak
      g.fillStyle = '#0a0512';
      g.beginPath();
      g.moveTo(0, -68 * s + bob2);
      g.quadraticCurveTo(-14 * s, -60 * s + bob2, -12 * s, -34 * s + bob2);
      g.lineTo(-16 * s, 0);
      for (let i = 0; i < 4; i++) g.quadraticCurveTo((-12 + i * 8) * s, -7 * s + Math.sin(t * 4 + i) * 3 * s, (-8 + i * 8) * s, 0);
      g.lineTo(12 * s, -34 * s + bob2);
      g.quadraticCurveTo(14 * s, -60 * s + bob2, 0, -68 * s + bob2);
      g.closePath(); g.fill(); g.stroke();
      // hood + void face
      g.fillStyle = '#000';
      g.beginPath(); g.arc(f * 2 * s, -58 * s + bob2, 7.5 * s, 0, TAU); g.fill();
      g.fillStyle = b.enraged ? '#ff2222' : '#c44dff';
      g.beginPath(); g.arc(f * 4 * s - 2.5 * s, -59 * s + bob2, 1.6 * s, 0, TAU); g.fill();
      g.beginPath(); g.arc(f * 4 * s + 2.5 * s, -59 * s + bob2, 1.6 * s, 0, TAU); g.fill();
      g.fillStyle = col;
      // skeletal hands + scythe
      const swing = b.atkT > 0 ? Math.sin((1 - b.atkT / 0.25) * Math.PI) : 0;
      const sa = lerp(-0.5, 0.6, swing) * f;
      const shx = f * 14 * s, shy = -44 * s + bob2;
      g.beginPath(); g.arc(shx, shy, 2 * s, 0, TAU); g.fill();
      g.save();
      g.translate(shx, shy); g.rotate(sa);
      g.beginPath(); g.moveTo(-f * 4 * s, 22 * s); g.lineTo(f * 6 * s, -30 * s); g.stroke();
      g.lineWidth = Math.max(4, 2.6 * s);
      g.beginPath(); g.arc(f * 2 * s, -32 * s, 16 * s, f > 0 ? Math.PI * 1.15 : Math.PI * 1.45, f > 0 ? Math.PI * 1.55 : Math.PI * 1.85); g.stroke();
      g.restore();
      g.lineWidth = Math.max(3.5, 2.2 * s);
      break;
    }
  }
  g.restore();
  g.globalAlpha = 1;
}

function poseOf(ent, isPlayer) {
  if (isPlayer) {
    if (ent.hurtT > 0) return { pose: 'hurt' };
    if (P.climbing) return { pose: 'cast' };
    if (P.spinT > 0) return { pose: 'slash', t: (P.spinT * 8) % 1 };
    if (P.castT > 0) return { pose: 'cast' };
    if (P.atkT > 0) return { pose: P.atkPose || 'punch', t: 1 - P.atkT / P.atkDur };
    if (!P.onGround) return { pose: 'jump' };
    return { pose: 'guard' };
  }
  if (ent.fleeT > 0) return { pose: 'panic' };
  if (ent.hurtT > 0) return { pose: 'hurt' };
  if (ent.atkT > 0) return { pose: ent.blade ? 'slash' : 'punch', t: 1 - ent.atkT / 0.25 };
  if (!ent.onGround) return { pose: 'jump' };
  return { pose: 'guard' };
}

function drawEntities() {
  for (const e of enemies) {
    if (e.dead) continue;
    const o = poseOf(e, false);
    o.run = Math.abs(e.vx) / 2; o.legPh = e.legPh; o.time = levelT + e.t;
    o.eyes = e.fleeT > 0 ? '#fff' : e.elite ? '#ffe14d' : '#f33';
    if (e.blade) o.weapon = e.blade;
    if (e.elite) {
      // golden aura under elite fighters
      g.strokeStyle = '#ffe14d'; g.globalAlpha = 0.35 + 0.2 * Math.sin(levelT * 6);
      g.lineWidth = 2;
      g.beginPath(); g.ellipse(e.x, e.y + 2, 20 * e.scale, 6, 0, 0, TAU); g.stroke();
      g.globalAlpha = 1;
    }
    if (e.hurtT > 0) { g.globalAlpha = 0.7; }
    drawStick(e.x, e.y, e.scale, e.hurtT > 0 ? '#fff' : e.col, e.facing, o);
    g.globalAlpha = 1;
    if (e.elite) {
      g.font = 'bold 9px Courier New'; g.textAlign = 'center';
      g.fillStyle = '#ffe14d';
      g.fillText('ELITE', e.x, e.y - 68 * e.scale);
    }
    if (e.hp < e.maxhp) {
      g.fillStyle = '#300'; g.fillRect(e.x - 16, e.y - 62 * e.scale, 32, 4);
      g.fillStyle = '#e22'; g.fillRect(e.x - 16, e.y - 62 * e.scale, 32 * clamp(e.hp / e.maxhp, 0, 1), 4);
    }
    if (e.type === 'shield') {
      g.strokeStyle = '#dde'; g.lineWidth = 4;
      g.beginPath(); g.arc(e.x + e.facing * 16, e.y - 30, 14, -1.1, 1.1); g.stroke();
    }
    if (e.type === 'bomber') {
      g.fillStyle = Math.sin(levelT * 14) > 0 ? '#ff2222' : '#661111';
      g.beginPath(); g.arc(e.x, e.y - 56, 3.5, 0, TAU); g.fill();
    }
  }

  if (boss && boss.visible) {
    if (boss.state === 'laser' && !boss.fired) {
      g.strokeStyle = '#f33'; g.globalAlpha = 0.5; g.lineWidth = 2;
      g.setLineDash([8, 8]);
      g.beginPath(); g.moveTo(boss.x, boss.beamY); g.lineTo(boss.facing > 0 ? W : 0, boss.beamY); g.stroke();
      g.setLineDash([]);
      g.globalAlpha = 1;
    }
    drawBoss(boss);
  }

  if (P && !P.dead) {
    const o = poseOf(P, true);
    o.run = Math.abs(P.vx) / 2.2; o.legPh = P.legPh; o.time = levelT;
    o.eyes = '#3df';
    const w = P.weapons[P.wIdx];
    if (w && w.id !== 'fists') o.weapon = w.id;
    if (P.inv > 0 && Math.sin(levelT * 40) > 0) g.globalAlpha = 0.45;
    drawStick(P.x, P.y, 1.05, '#ffffff', P.facing, o);
    g.globalAlpha = 1;
  }
}

function drawTexts() {
  for (const t of texts) {
    g.globalAlpha = clamp(t.life, 0, 1);
    g.font = (t.big ? 'bold 26px' : 'bold 14px') + ' Courier New';
    g.textAlign = 'center';
    g.fillStyle = '#000'; g.fillText(t.str, t.x + 2, t.y + 2);
    g.fillStyle = t.col; g.fillText(t.str, t.x, t.y);
  }
  g.globalAlpha = 1;
}

function bar(x, y, w, h, frac, fg, bg, label) {
  g.fillStyle = bg; g.fillRect(x, y, w, h);
  g.fillStyle = fg; g.fillRect(x, y, w * clamp(frac, 0, 1), h);
  g.strokeStyle = '#000'; g.lineWidth = 2; g.strokeRect(x, y, w, h);
  if (label) {
    g.font = 'bold 11px Courier New'; g.textAlign = 'left';
    g.fillStyle = '#fff'; g.fillText(label, x + 4, y + h - 4);
  }
}

function drawHUD() {
  const s = P.stats;
  bar(16, 14, 220, 18, P.hp / s.maxhp, '#d61f1f', '#3a0a0a', 'HP ' + Math.ceil(Math.max(0, P.hp)));
  bar(16, 36, 180, 12, P.energy / s.energyMax, '#f0c428', '#3a3008', '');
  // lives
  g.font = 'bold 16px Courier New'; g.textAlign = 'left';
  g.fillStyle = '#ff4455';
  g.fillText('♥'.repeat(Math.max(0, lives)), 244, 29);
  // weapon readout
  const w = P.weapons[P.wIdx];
  g.font = 'bold 12px Courier New';
  g.fillStyle = '#7ec8ff';
  g.fillText('[Q/E] ' + (P.wIdx + 1) + '/' + P.weapons.length + ' — ' + w.name, 16, 62);
  if (s.special) {
    const sp = SPECIALS[s.special];
    g.fillStyle = P.energy >= sp.cost || bonusMode ? '#ffe14d' : '#776';
    g.fillText('[L] ' + sp.label + (bonusMode ? ' (FREE!)' : ''), 16, 78);
  }
  g.font = 'bold 13px Courier New'; g.textAlign = 'right';
  g.fillStyle = '#fff';
  const lbl = bonusMode ? 'BONUS ' : 'LEVEL ';
  g.fillText(lbl + level + ' — ' + zoneOf(level).name, W - 16, 24);
  g.fillStyle = '#f55';
  g.fillText('KILLS ' + kills, W - 16, 42);
  g.fillStyle = '#ffe14d';
  g.fillText('SCORE ' + score, W - 16, 60);
  if (save.best) { g.fillStyle = '#887'; g.fillText('BEST ' + save.best, W - 16, 76); }
  if (!bossSpawned) { g.fillStyle = '#aaa'; g.fillText('WAVE ' + wave + '/' + totalWaves, W - 16, save.best ? 92 : 76); }
  if (P.combo > 2) {
    g.font = 'bold 22px Courier New'; g.textAlign = 'center';
    g.fillStyle = '#ffe14d';
    g.fillText(P.combo + ' HIT COMBO', W / 2, 70);
  }
  if (bonusMode) {
    g.font = 'bold 14px Courier New'; g.textAlign = 'center';
    g.fillStyle = '#ff5fd0';
    g.fillText('☠ BLOOD FRENZY: +50% DMG · FREE SPECIALS ☠', W / 2, 26);
  }
  if (boss) {
    bar(W / 2 - 220, H - 36, 440, 16, boss.hp / boss.maxhp, boss.enraged ? '#ff2222' : '#c41f7a', '#2a0515', '');
    g.font = 'bold 13px Courier New'; g.textAlign = 'center';
    g.fillStyle = '#fff';
    g.fillText(boss.name + ' — ' + LOOK_LABEL[boss.look] + ' · ' + boss.style.name + (boss.enraged ? '  [ENRAGED]' : ''), W / 2, H - 42);
  }
  if (banner > 0) {
    g.globalAlpha = clamp(banner, 0, 1);
    g.font = 'bold 36px Courier New'; g.textAlign = 'center';
    g.fillStyle = '#000'; g.fillText((bonusMode ? 'BONUS ARENA ' : 'LEVEL ') + level, W / 2 + 3, 153);
    g.fillStyle = bonusMode ? '#ff5fd0' : '#fff';
    g.fillText((bonusMode ? 'BONUS ARENA ' : 'LEVEL ') + level, W / 2, 150);
    g.font = 'bold 18px Courier New';
    g.fillStyle = zoneOf(level).accent;
    g.fillText(zoneOf(level).name, W / 2, 178);
    g.globalAlpha = 1;
  }
}

/* vignette (precomputed) */
const vig = document.createElement('canvas');
vig.width = W; vig.height = H;
{
  const vg = vig.getContext('2d');
  const grd = vg.createRadialGradient(W / 2, H / 2, H * 0.42, W / 2, H / 2, H * 0.88);
  grd.addColorStop(0, 'rgba(0,0,0,0)');
  grd.addColorStop(1, 'rgba(0,0,0,0.42)');
  vg.fillStyle = grd; vg.fillRect(0, 0, W, H);
}

function drawTouchControls() {
  if (!TOUCH) return;
  for (const b of TBTNS) {
    g.globalAlpha = keys[b.k] ? 0.55 : 0.22;
    g.fillStyle = '#fff';
    g.beginPath(); g.arc(b.x, b.y, b.r, 0, TAU); g.fill();
    g.globalAlpha = keys[b.k] ? 0.95 : 0.5;
    g.strokeStyle = '#fff'; g.lineWidth = 2;
    g.beginPath(); g.arc(b.x, b.y, b.r, 0, TAU); g.stroke();
    g.fillStyle = '#000';
    g.font = 'bold ' + (b.label.length > 2 ? 11 : 20) + 'px Courier New';
    g.textAlign = 'center';
    g.fillText(b.label, b.x, b.y + (b.label.length > 2 ? 4 : 7));
  }
  g.globalAlpha = 1;
}

/* ---------------- screens ---------------- */
let stateTimer = 0;
function button(x, y, w, h, label, hot) {
  const over = mx > x && mx < x + w && my > y && my < y + h;
  g.fillStyle = over || hot ? '#5a0d0d' : '#1c1c22';
  g.fillRect(x, y, w, h);
  g.strokeStyle = over || hot ? '#ff3333' : '#555';
  g.lineWidth = 2; g.strokeRect(x, y, w, h);
  g.font = 'bold 17px Courier New'; g.textAlign = 'center';
  g.fillStyle = over || hot ? '#fff' : '#bbb';
  g.fillText(label, x + w / 2, y + h / 2 + 6);
  return over && mclick;
}

function drawMenu(dt) {
  menuPulse += dt;
  g.fillStyle = '#0a0a0c'; g.fillRect(0, 0, W, H);
  g.fillStyle = '#3a0505';
  for (let i = 0; i < 12; i++) {
    const x = 80 + i * 75;
    g.fillRect(x, 0, 16, 60 + Math.sin(menuPulse * 0.7 + i * 1.7) * 30 + i % 3 * 25);
    g.beginPath(); g.arc(x + 8, 60 + Math.sin(menuPulse * 0.7 + i * 1.7) * 30 + i % 3 * 25, 8, 0, TAU); g.fill();
  }
  g.font = 'bold 64px Courier New'; g.textAlign = 'center';
  g.fillStyle = '#000'; g.fillText('STICK CARNAGE', W / 2 + 4, 144);
  g.fillStyle = '#d61f1f'; g.fillText('STICK CARNAGE', W / 2, 140);
  g.font = 'bold 16px Courier New';
  g.fillStyle = '#888';
  g.fillText('50 BOSS MONSTERS: TITANS · OGRES · DRAGONS · GHOSTS · DEVILS · 50 POWERS · 16 WEAPONS · 3 LIVES', W / 2, 172);

  // 18+ adults-only badge
  g.fillStyle = '#5a0d0d'; g.fillRect(W / 2 - 165, 184, 330, 26);
  g.strokeStyle = '#ff2222'; g.lineWidth = 2; g.strokeRect(W / 2 - 165, 184, 330, 26);
  g.font = 'bold 14px Courier New'; g.fillStyle = '#ff5555';
  g.fillText('18+ EXTREME VIOLENCE · ADULTS ONLY', W / 2, 202);

  drawStick(W / 2 - 200, 360, 1.4, '#fff', 1, { pose: 'kick', t: 0.5 + Math.sin(menuPulse * 3) * 0.3 });
  drawStick(W / 2 + 200, 360, 1.4, '#d8d8d8', -1, { pose: 'hurt' });
  g.fillStyle = '#c40f0f';
  for (let i = 0; i < 5; i++) {
    g.beginPath();
    g.arc(W / 2 + 160 - i * 12, 320 + Math.sin(menuPulse * 5 + i) * 6, 3, 0, TAU); g.fill();
  }

  const contLevel = clamp(save.unlocked, 1, 50);
  const contLabel = contLevel > 1 ? 'CONTINUE — LEVEL ' + contLevel : 'START CARNAGE';
  if (button(W / 2 - 150, 240, 300, 44, contLabel) || tap('Enter')) {
    sfx('select'); startLevel(contLevel);
  }
  if (button(W / 2 - 150, 294, 300, 40, 'LEVEL SELECT')) { sfx('select'); state = 'select'; }

  // credits
  g.font = 'bold 17px Courier New'; g.textAlign = 'center';
  g.fillStyle = '#ffe14d';
  g.fillText('A GAME BY VISHNU KARTHIKEYAN', W / 2, 418);
  if (save.best) {
    g.font = 'bold 13px Courier New'; g.fillStyle = '#998';
    g.fillText('HIGH SCORE: ' + save.best, W / 2, 226);
  }

  g.font = '13px Courier New'; g.fillStyle = '#777'; g.textAlign = 'center';
  g.fillText('A/D move · W/SPACE jump · J attack (double-tap = double hit) · K kick (double-tap = double kick)', W / 2, 448);
  g.fillText('Q/E switch weapon · L special · SHIFT dash · W/S climb ladders · S drop through · wall-cling + jump = wall jump', W / 2, 466);
  g.fillStyle = '#f0c428';
  g.fillText('Beat a level to unlock the next — progress saves automatically. Die and you retry the SAME level.', W / 2, 492);
}

function drawSelect() {
  g.fillStyle = '#0a0a0c'; g.fillRect(0, 0, W, H);
  g.font = 'bold 30px Courier New'; g.textAlign = 'center';
  g.fillStyle = '#d61f1f'; g.fillText('CHOOSE YOUR SLAUGHTER', W / 2, 56);
  g.font = 'bold 12px Courier New'; g.fillStyle = '#f0c428';
  g.fillText('Beat each level to unlock the next', W / 2, 78);
  const cw = 76, ch = 56, ox = (W - cw * 10) / 2 + cw / 2, oy = 100;
  for (let n = 1; n <= 50; n++) {
    const col = (n - 1) % 10, row = Math.floor((n - 1) / 10);
    const x = ox + col * cw - 30, y = oy + row * (ch + 12);
    const locked = n > save.unlocked;
    const bonus = isBonusLevel(n);
    const over = mx > x && mx < x + 60 && my > y && my < y + ch;
    g.fillStyle = locked ? '#15151a' : bonus ? '#4d3a08' : n === 50 ? '#4d0820' : '#262630';
    if (over && !locked) g.fillStyle = '#5a0d0d';
    g.fillRect(x, y, 60, ch);
    g.strokeStyle = locked ? '#333' : bonus ? '#f0c428' : n === 50 ? '#ff2266' : zoneOf(n).accent;
    g.lineWidth = 1.5;
    g.strokeRect(x, y, 60, ch);
    g.font = 'bold 18px Courier New';
    g.fillStyle = locked ? '#444' : '#fff';
    g.fillText(locked ? '✖' : String(n), x + 30, y + 26);
    g.font = 'bold 9px Courier New';
    g.fillStyle = locked ? '#333' : bonus ? '#f0c428' : '#888';
    g.fillText(n === 50 ? 'FINAL' : bonus ? 'BONUS' : 'BOSS', x + 30, y + 44);
    if (over && mclick && !locked) { sfx('select'); startLevel(n); return; }
  }
  g.font = '13px Courier New'; g.fillStyle = '#777';
  g.fillText('Click a level — gold = bonus blood arenas · ESC/B to go back', W / 2, H - 14);
  if (tap('Escape') || tap('b')) { state = 'menu'; }
}

function drawPowerup(dt) {
  stateTimer += dt;
  drawBackground(); drawDecals(); drawCorpses(); drawGibs();
  g.fillStyle = 'rgba(0,0,0,0.78)'; g.fillRect(0, 0, W, H);
  const pw = POWERS[level - 1];
  g.font = 'bold 34px Courier New'; g.textAlign = 'center';
  g.fillStyle = '#7bff4d';
  g.fillText((bonusMode ? 'BONUS ARENA' : 'LEVEL ' + level) + ' CLEARED', W / 2, 110);
  g.font = 'bold 15px Courier New'; g.fillStyle = '#aaa';
  g.fillText(BOSS_NAMES[level - 1] + ' has been reduced to a red smear. Kills: ' + kills, W / 2, 140);

  const cy = 180, chh = 150;
  const pulse = 1 + Math.sin(stateTimer * 4) * 0.02;
  g.save();
  g.translate(W / 2, cy + chh / 2); g.scale(pulse, pulse); g.translate(-W / 2, -(cy + chh / 2));
  g.fillStyle = '#16202a'; g.fillRect(W / 2 - 210, cy, 420, chh);
  g.strokeStyle = '#ffe14d'; g.lineWidth = 3; g.strokeRect(W / 2 - 210, cy, 420, chh);
  g.font = 'bold 14px Courier New'; g.fillStyle = '#f0c428';
  g.fillText('NEW POWER UNLOCKED', W / 2, cy + 32);
  g.font = 'bold 28px Courier New'; g.fillStyle = '#fff';
  g.fillText(pw.name, W / 2, cy + 72);
  g.font = 'bold 16px Courier New'; g.fillStyle = '#9fd0ff';
  g.fillText(pw.desc, W / 2, cy + 102);
  g.font = '12px Courier New'; g.fillStyle = '#667';
  g.fillText('power ' + level + ' / 50', W / 2, cy + 130);
  g.restore();

  if (earnedLife) {
    g.font = 'bold 17px Courier New'; g.fillStyle = '#ff4455';
    g.fillText('♥ EXTRA LIFE EARNED — ' + lives + ' LIVES ♥', W / 2, 352);
  }
  g.font = 'bold 12px Courier New'; g.fillStyle = '#7bff4d';
  g.fillText('✓ PROGRESS SAVED — LEVEL ' + Math.min(50, level + 1) + ' UNLOCKED', W / 2, 332);
  const nw = WEAPONS.find(x => x.lvl === level + 1);
  if (nw) {
    g.font = 'bold 15px Courier New'; g.fillStyle = '#7ec8ff';
    g.fillText('NEXT LEVEL UNLOCKS WEAPON: ' + nw.name, W / 2, 372);
  }

  if (level >= 50) {
    if (button(W / 2 - 150, 400, 300, 46, 'CLAIM YOUR THRONE') || tap('Enter')) { state = 'victory'; stateTimer = 0; }
  } else {
    const nb = isBonusLevel(level + 1);
    if (button(W / 2 - 150, 390, 300, 46, nb ? 'ENTER BONUS ARENA ' + (level + 1) : 'NEXT: LEVEL ' + (level + 1)) || tap('Enter')) {
      sfx('select'); startLevel(level + 1, true);
    }
    if (button(W / 2 - 150, 446, 300, 34, 'LEVEL SELECT')) { sfx('select'); state = 'select'; }
  }
}

function drawGameover(dt) {
  stateTimer += dt;
  drawBackground(); drawDecals(); drawCorpses(); drawGibs(); drawParticles();
  g.fillStyle = 'rgba(20,0,0,0.7)'; g.fillRect(0, 0, W, H);
  g.font = 'bold 56px Courier New'; g.textAlign = 'center';
  g.fillStyle = '#000'; g.fillText('YOU DIED', W / 2 + 3, 203);
  g.fillStyle = '#d61f1f'; g.fillText('YOU DIED', W / 2, 200);
  g.font = 'bold 15px Courier New'; g.fillStyle = '#aaa';
  g.fillText('Torn apart on level ' + level + ' · ' + kills + ' kills this run', W / 2, 240);
  g.fillStyle = newBest ? '#ffe14d' : '#998';
  g.fillText('SCORE ' + score + (newBest ? '  ★ NEW RECORD ★' : '  ·  BEST ' + (save.best || 0)), W / 2, 264);
  if (stateTimer > 0.6) {
    if (button(W / 2 - 150, 290, 300, 44, 'RETRY LEVEL ' + level) || tap('Enter')) { sfx('select'); startLevel(level); }
    if (button(W / 2 - 150, 344, 300, 36, 'LEVEL SELECT')) { sfx('select'); state = 'select'; }
    if (button(W / 2 - 150, 390, 300, 36, 'MAIN MENU')) { sfx('select'); state = 'menu'; }
  }
}

function drawVictory(dt) {
  stateTimer += dt;
  g.fillStyle = '#0a0a0c'; g.fillRect(0, 0, W, H);
  for (let i = 0; i < 40; i++) {
    g.fillStyle = pick(BLOOD);
    g.globalAlpha = 0.5;
    g.beginPath();
    g.arc((i * 137 + stateTimer * 40) % W, (i * 89 + stateTimer * 90) % H, 2 + i % 3, 0, TAU);
    g.fill();
  }
  g.globalAlpha = 1;
  g.font = 'bold 52px Courier New'; g.textAlign = 'center';
  g.fillStyle = '#ffe14d';
  g.fillText('CARNAGE COMPLETE', W / 2, 170);
  g.font = 'bold 20px Courier New'; g.fillStyle = '#fff';
  g.fillText('DEATH ITSELF lies in pieces. All 50 bosses conquered.', W / 2, 220);
  g.fillText('All 50 powers and 16 weapons are yours. You ARE the apocalypse.', W / 2, 250);
  if (score > (save.best || 0)) { save.best = score; persist(); }
  g.fillStyle = '#ffe14d';
  g.fillText('FINAL SCORE: ' + score, W / 2, 285);
  g.font = 'bold 16px Courier New';
  g.fillText('CREATED BY VISHNU KARTHIKEYAN', W / 2, 315);
  drawStick(W / 2, 400, 2, '#fff', 1, { pose: 'cast', eyes: '#ffe14d' });
  if (button(W / 2 - 150, 430, 300, 40, 'BACK TO MENU')) { sfx('select'); state = 'menu'; }
}

function drawPause() {
  g.fillStyle = 'rgba(0,0,0,0.65)'; g.fillRect(0, 0, W, H);
  g.font = 'bold 40px Courier New'; g.textAlign = 'center';
  g.fillStyle = '#fff'; g.fillText('PAUSED', W / 2, 180);
  g.font = '14px Courier New'; g.fillStyle = '#aaa';
  g.fillText('P / ESC to resume · M to ' + (muted ? 'unmute' : 'mute'), W / 2, 215);
  if (button(W / 2 - 130, 250, 260, 40, 'RESUME') || tap('p') || tap('Escape')) { state = 'play'; }
  if (button(W / 2 - 130, 300, 260, 36, 'RESTART LEVEL')) { sfx('select'); startLevel(level); }
  if (button(W / 2 - 130, 346, 260, 36, 'QUIT TO MENU')) { sfx('select'); state = 'menu'; }
}

/* ---------------- main loop ---------------- */
let last = 0;
function frame(ts) {
  requestAnimationFrame(frame);
  const rawDt = Math.min(0.033, (ts - last) / 1000 || 0.016);
  let dt = rawDt;
  last = ts;
  nowT += rawDt;
  if (tap('m')) muted = !muted;
  musicLoop();

  if (hitstop > 0) { hitstop -= rawDt; dt *= 0.05; }
  else if (slowmo > 0) { slowmo -= rawDt; dt *= 0.35; } // kill-cam slow motion
  shake = Math.max(0, shake - 40 * rawDt * (shake * 0.1 + 1));
  flash = Math.max(0, flash - rawDt * 1.5);

  g.save();
  if (shake > 0.3 && (state === 'play' || state === 'pause')) {
    g.translate(rnd(-shake, shake) * 0.6, rnd(-shake, shake) * 0.6);
  }

  switch (state) {
    case 'menu': drawMenu(rawDt); break;
    case 'select': drawSelect(); break;
    case 'play':
      updatePlay(dt);
      updateParticles(dt);
      drawBackground(); drawDecals(); drawPlats(); drawCorpses(); drawGibs(); drawEffects(); drawEntities(); drawProjs(); drawParticles(); g.drawImage(vig, 0, 0); drawTexts(); drawHUD(); drawTouchControls();
      break;
    case 'pause':
      drawBackground(); drawDecals(); drawPlats(); drawCorpses(); drawGibs(); drawEffects(); drawEntities(); drawProjs(); drawParticles(); g.drawImage(vig, 0, 0); drawTexts(); drawHUD();
      drawPause();
      break;
    case 'powerup': updateParticles(dt); updateCorpses(dt); drawPowerup(rawDt); break;
    case 'gameover': updateParticles(dt); updateCorpses(dt); drawGameover(rawDt); break;
    case 'victory': drawVictory(rawDt); break;
  }

  g.restore();
  if (slowmo > 0 && state === 'play') {
    // cinematic letterbox during kill-cam
    g.fillStyle = 'rgba(0,0,0,0.85)';
    g.fillRect(0, 0, W, 26); g.fillRect(0, H - 26, W, 26);
  }
  if (flash > 0) {
    g.globalAlpha = flash;
    g.fillStyle = '#fff'; g.fillRect(0, 0, W, H);
    g.globalAlpha = 1;
  }

  for (const k in once) once[k] = false;
  mclick = false;
}
requestAnimationFrame(frame);
