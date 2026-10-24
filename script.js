/* ==========================================================
   PENGATURAN — ubah di sini saja
   ========================================================== */
const CONFIG = {
    // Animasi pembuka saat mesin dinyalakan
    showIntro: true,
    ownerName: 'Mr. McElwee',   // nama yang tampil setelah "Welcome,"
    introDuration: 3600,        // ms, lama animasi pembuka sebelum dial muncul

    // Suara peringatan seatbelt (berulang selama seatbelt belum dipakai)
    seatbeltSound: 'speedometer_sound.mp3',
    seatbeltVolume: 0.6,

    // true  = peringatan hanya aktif kalau mesin hidup
    // false = aktif terus selama seatbelt belum dipakai
    warnOnlyWhenEngineOn: true,

    gearCount: 7,            // gear maju tertinggi yang ditampilkan (0 sampai 7)
    zeroGearLabel: 'N',      // tampilan gear 0 (netral/mundur), contoh: 'N' atau 'R'
    rpmScaleMax: 9,          // dipakai untuk membaca RPM asli (x1000)
    redline: 0.8,            // batas zona merah RPM (0 sampai 1)
    lowFuel: 0.2,            // di bawah ini segmen fuel jadi merah
    lowHealth: 0.3,          // di bawah ini segmen health jadi merah
    startupSweep: true,      // jarum menyapu penuh setelah animasi pembuka
    odometerUnit: 'mi',      // 'mi' atau 'km' (input setOdometer tetap dalam mil)

    // Format input setRPM: 'auto' = nilai 0 sampai 1 dibaca apa adanya, nilai di atas 1.5
    // dianggap RPM asli (misal 2500) dan dibagi (rpmScaleMax x 1000). Bisa juga 'normalized' atau 'raw'.
    rpmInput: 'auto',

    // true = selalu tampilkan panel debug. Di FiveM cukup tambahkan ?debug di akhir URL.
    debug: false
};

/* ========================================================== */

const SCALES = {
    0: { max: 240, red: 180, minor: 10, factor: 3.6,      unit: 'km/h' },
    1: { max: 140, red: 100, minor: 5,  factor: 2.236936, unit: 'mph' },
    2: { max: 120, red: 100, minor: 5,  factor: 1.943844, unit: 'knots' }
};

const NEEDLE_START = 160;    // derajat, posisi angka 0
const NEEDLE_SWEEP = 220;    // derajat, sampai angka maksimum

let elements = {};
let speedMode = 1;           // 0: KMH, 1: MPH, 2: Knots
let lastSpeed = 0;           // m/s
let lastRpm = 0;
let lastFuel = 1;
let lastHealth = 1;
let sweeping = false;
let introTimer = null;
let sweepTimers = [];

const state = {
    engine: false,
    seatbelts: false
};

const R_RPM = 104;
const C_RPM = 2 * Math.PI * R_RPM;
const ARC_RPM = C_RPM * (NEEDLE_SWEEP / 360);

const R_BAND = 162;
const C_BAND = 2 * Math.PI * R_BAND;

const SEG_COUNT = 8;

const clamp01 = n => Math.min(1, Math.max(0, Number(n) || 0));

// Menerima true/false, 1/0, dan teks "true"/"false"/"1"/"0" supaya tidak salah baca.
function toBool(v) {
    if (typeof v === 'string') {
        const t = v.trim().toLowerCase();
        return !(t === '' || t === 'false' || t === '0' || t === 'off' || t === 'null' || t === 'undefined');
    }
    return !!v;
}

/* ---------- Seatbelt alarm ---------- */

let seatbeltAudio = null;

function initAudio() {
    if (!CONFIG.seatbeltSound) return;
    seatbeltAudio = new Audio(CONFIG.seatbeltSound);
    seatbeltAudio.loop = true;
    seatbeltAudio.volume = CONFIG.seatbeltVolume;
}

function setAlarm(on) {
    if (!seatbeltAudio) return;
    if (on) {
        if (seatbeltAudio.paused) {
            const p = seatbeltAudio.play();
            if (p && p.catch) p.catch(() => {});
        }
    } else if (!seatbeltAudio.paused) {
        seatbeltAudio.pause();
        seatbeltAudio.currentTime = 0;
    }
}

function updateSeatbeltWarning() {
    const warn = !state.seatbelts && (!CONFIG.warnOnlyWhenEngineOn || state.engine);

    elements.warning.classList.toggle('show', warn);
    elements.seatbelts.classList.toggle('ok', state.seatbelts);
    elements.seatbelts.classList.toggle('bad', warn);
    setAlarm(warn);
}

/* ---------- Jarum, RPM, dan animasi ---------- */

function drawNeedle(frac) {
    const f = Math.min(1.02, Math.max(0, frac));
    elements.needle.style.transform = `rotate(${NEEDLE_START + NEEDLE_SWEEP * f}deg)`;
}

function renderSpeed() {
    const sc = SCALES[speedMode] || SCALES[0];
    const value = lastSpeed * sc.factor;

    elements.speed.textContent = Math.round(value);
    elements.speedUnit.textContent = sc.unit;
    if (!sweeping) drawNeedle(value / sc.max);
}

function applyRpm(v) {
    elements.rpmArc.style.strokeDasharray = `${ARC_RPM * v} ${C_RPM}`;
    elements.hubInner.style.setProperty('--rpm', v.toFixed(3));
    elements.hud.classList.toggle('redline', !sweeping && state.engine && v >= CONFIG.redline);
}

function clearSweep() {
    sweepTimers.forEach(clearTimeout);
    sweepTimers = [];
    sweeping = false;
    elements.hud.classList.remove('sweeping');
}

function sweepNeedle() {
    clearSweep();
    if (!CONFIG.startupSweep) { renderSpeed(); applyRpm(lastRpm); return; }

    sweeping = true;
    elements.hud.classList.add('sweeping');
    drawNeedle(1);
    applyRpm(1);
    sweepTimers.push(setTimeout(() => { drawNeedle(0); applyRpm(0); }, 700));
    sweepTimers.push(setTimeout(() => {
        sweeping = false;
        elements.hud.classList.remove('sweeping');
        renderSpeed();
        applyRpm(lastRpm);
    }, 1450));
}

function playIntro() {
    clearTimeout(introTimer);

    if (!CONFIG.showIntro) {
        sweepNeedle();
        return;
    }

    elements.hud.classList.add('intro-on');
    introTimer = setTimeout(() => {
        elements.hud.classList.remove('intro-on');
        sweepNeedle();
    }, CONFIG.introDuration);
}

function stopIntro() {
    clearTimeout(introTimer);
    elements.hud.classList.remove('intro-on');
    clearSweep();
}

/* ---------- Fungsi publik (sama seperti template asli) ---------- */

/**
 * @param {boolean} state - true jika mesin hidup.
 */
function setEngine(on) {
    const was = state.engine;
    state.engine = toBool(on);

    elements.engine.classList.toggle('on', state.engine);
    elements.hud.classList.toggle('engine-off', !state.engine);

    if (state.engine && !was) playIntro();
    if (!state.engine && was) {
        stopIntro();
        elements.hud.classList.remove('redline');
        renderSpeed();
        applyRpm(lastRpm);
    }

    updateSeatbeltWarning();
}

/**
 * @param {number} speed - Kecepatan dalam meter per detik (m/s).
 */
function setSpeed(speed) {
    lastSpeed = Number(speed) || 0;
    renderSpeed();
}

/**
 * @param {number} rpm - Nilai RPM dari 0 sampai 1.
 */
function setRPM(rpm) {
    const n = Number(rpm) || 0;
    const raw = CONFIG.rpmInput === 'raw' || (CONFIG.rpmInput === 'auto' && n > 1.5);
    lastRpm = clamp01(raw ? n / (CONFIG.rpmScaleMax * 1000) : n);
    if (!sweeping) applyRpm(lastRpm);
}

function setSegments(segs, textEl, chipEl, value, lowLimit) {
    const v = clamp01(value);
    const lit = v <= 0 ? 0 : Math.max(1, Math.round(v * SEG_COUNT));
    const low = v <= lowLimit;

    segs.forEach((seg, i) => {
        seg.classList.toggle('lit', i < lit);
        seg.classList.toggle('low', low);
    });
    textEl.textContent = `${Math.round(v * 100)}%`;
    chipEl.classList.toggle('low', low);
}

/**
 * @param {number} fuel - Level bensin dari 0 sampai 1.
 */
function setFuel(fuel) {
    lastFuel = fuel;
    setSegments(elements.fuelSegs, elements.fuel, elements.fuelChip, fuel, CONFIG.lowFuel);
}

/**
 * @param {number} health - Kondisi kendaraan dari 0 sampai 1.
 */
function setHealth(health) {
    lastHealth = health;
    setSegments(elements.healthSegs, elements.health, elements.healthChip, health, CONFIG.lowHealth);
}

/**
 * @param {number|string} gear - Gear saat ini (0 sampai 7). 0 dianggap netral/mundur.
 */
function setGear(gear) {
    const n = Math.min(CONFIG.gearCount, Math.max(0, Math.floor(Number(gear) || 0)));
    const label = n === 0 ? CONFIG.zeroGearLabel : String(n);
    const el = elements.gear;

    if (el.textContent !== label) {
        el.textContent = label;
        el.classList.remove('pop');
        void el.offsetWidth;
        el.classList.add('pop');
    }
}

/**
 * @param {number} state - 0: Off, 1: On, 2: High Beam.
 */
function setHeadlights(level) {
    level = Number(level) || 0;
    const el = elements.headlights;
    el.classList.toggle('on', level === 1);
    el.classList.toggle('high', level === 2);
}

/**
 * Sein dan kunci sudah dihapus dari tampilan. Dua fungsi ini sengaja dibiarkan kosong
 * supaya server yang masih memanggilnya tidak menimbulkan error.
 */
function setLeftIndicator() {}
function setRightIndicator() {}

/**
 * @param {boolean} state - true jika seatbelt dipakai.
 */
function setSeatbelts(on) {
    state.seatbelts = toBool(on);
    updateSeatbeltWarning();
}

/**
 * @param {number} mode - 0: KMH, 1: MPH, 2: Knots.
 */
function setSpeedMode(mode) {
    speedMode = SCALES[mode] ? Number(mode) : 1;
    buildScale();
    renderSpeed();
}

/**
 * @param {number} distance - Jarak dalam mil.
 */
function setOdometer(distance) {
    const miles = Math.max(0, Number(distance) || 0);
    const km = CONFIG.odometerUnit === 'km';
    const value = km ? miles * 1.609344 : miles;

    elements.odometer.textContent = String(Math.floor(value)).padStart(7, '0');
    elements.odoUnit.textContent = km ? 'km' : 'mi';
}

/**
 * Tambahan: tampilkan atau sembunyikan seluruh HUD (alarm ikut berhenti saat disembunyikan).
 * @param {boolean} visible
 */
function setVisible(visible) {
    visible = toBool(visible);
    elements.hud.classList.toggle('hidden', !visible);
    if (!visible) setAlarm(false);
    else updateSeatbeltWarning();
}

/* ---------- Pembuatan elemen dial ---------- */

const NS = 'http://www.w3.org/2000/svg';

function svgEl(name, attrs) {
    const el = document.createElementNS(NS, name);
    Object.keys(attrs).forEach(k => el.setAttribute(k, attrs[k]));
    return el;
}

function buildScale() {
    const sc = SCALES[speedMode] || SCALES[0];
    const g = document.getElementById('ticks');
    g.textContent = '';

    const steps = Math.round(sc.max / sc.minor);

    for (let i = 0; i <= steps; i++) {
        const val = i * sc.minor;
        const frac = val / sc.max;
        const major = val % 20 === 0;
        const red = val >= sc.red;
        const angle = (NEEDLE_START + NEEDLE_SWEEP * frac) * Math.PI / 180;
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        const r1 = 156;
        const r2 = major ? 141 : 149;

        g.appendChild(svgEl('line', {
            x1: 180 + r1 * cos, y1: 180 + r1 * sin,
            x2: 180 + r2 * cos, y2: 180 + r2 * sin,
            class: 'tick' + (major ? ' major' : '') + (red ? ' red' : '')
        }));

        if (major) {
            const t = svgEl('text', {
                x: 180 + 125 * cos,
                y: 180 + 125 * sin,
                class: 'tick-label' + (red ? ' red' : '')
            });
            t.textContent = val;
            g.appendChild(t);
        }
    }

    // pita merah di tepi luar
    const redFrac = sc.red / sc.max;
    const band = document.getElementById('redBand');
    band.setAttribute('transform', `rotate(${NEEDLE_START + NEEDLE_SWEEP * redFrac} 180 180)`);
    band.style.strokeDasharray = `${C_BAND * (NEEDLE_SWEEP / 360) * (1 - redFrac)} ${C_BAND}`;
}

function buildArcs() {
    const track = document.getElementById('rpmTrack');
    track.setAttribute('transform', `rotate(${NEEDLE_START} 180 180)`);
    track.style.strokeDasharray = `${ARC_RPM} ${C_RPM}`;

    elements.rpmArc.setAttribute('transform', `rotate(${NEEDLE_START} 180 180)`);
    elements.rpmArc.style.strokeDasharray = `0 ${C_RPM}`;
}

function buildSegments(groupId, mirror) {
    const g = document.getElementById(groupId);
    const segs = [];

    for (let i = 0; i < SEG_COUNT; i++) {
        let deg = 128 + (152 - 128) * i / (SEG_COUNT - 1);
        if (mirror) deg = 180 - deg;
        const a = deg * Math.PI / 180;
        const cos = Math.cos(a);
        const sin = Math.sin(a);

        const seg = svgEl('line', {
            x1: 180 + 141 * cos, y1: 180 + 141 * sin,
            x2: 180 + 155 * cos, y2: 180 + 155 * sin,
            class: 'seg'
        });
        g.appendChild(seg);
        segs.push(seg);
    }
    return segs;
}

/* ---------- Pesan dari server (opsional) dan panel debug ---------- */

const API_NAMES = ['setEngine', 'setSpeed', 'setRPM', 'setFuel', 'setHealth', 'setGear',
    'setHeadlights', 'setLeftIndicator', 'setRightIndicator', 'setSeatbelts',
    'setSpeedMode', 'setOdometer', 'setVisible'];

// Jika server mengirim lewat postMessage, contoh: { action: 'setSpeed', value: 25 }
window.addEventListener('message', ev => {
    const d = ev.data;
    if (!d || typeof d !== 'object') return;
    const name = d.action || d.type || d.fn || d.name;
    if (!API_NAMES.includes(name) || typeof window[name] !== 'function') return;
    const args = Array.isArray(d.args) ? d.args : [d.value !== undefined ? d.value : (d.state !== undefined ? d.state : d.data)];
    window[name](...args);
});

function installDebug() {
    const log = {};
    const errors = [];
    const messages = [];

    const panel = document.createElement('pre');
    panel.style.cssText = 'position:fixed;top:8px;left:8px;margin:0;padding:8px 10px;z-index:9999;' +
        'background:rgba(0,0,0,.78);color:#8ff0a4;font:12px/1.35 Consolas,monospace;border-radius:6px;' +
        'pointer-events:none;max-width:420px;white-space:pre-wrap';
    document.body.appendChild(panel);

    let queued = false;
    const render = () => {
        if (queued) return;
        queued = true;
        requestAnimationFrame(() => {
            queued = false;
            const rows = API_NAMES.map(n => {
                const e = log[n];
                return e ? `${n.padEnd(18)} ${e.args.map(a => JSON.stringify(a)).join(', ')}  x${e.count}`
                         : `${n.padEnd(18)} (belum dipanggil)`;
            });
            panel.textContent = 'DEBUG\n' + rows.join('\n') +
                (messages.length ? '\n\nMESSAGE:\n' + messages.join('\n') : '') +
                (errors.length ? '\n\nERROR:\n' + errors.slice(-3).join('\n') : '');
        });
    };

    API_NAMES.forEach(name => {
        const original = window[name];
        window[name] = function (...args) {
            const e = log[name] || (log[name] = { args, count: 0 });
            e.args = args;
            e.count++;
            render();
            return original.apply(this, args);
        };
    });

    window.addEventListener('error', ev => { errors.push(ev.message); render(); });
    window.addEventListener('message', ev => {
        let text;
        try { text = JSON.stringify(ev.data); } catch (e) { text = String(ev.data); }
        messages.push(text.slice(0, 110));
        if (messages.length > 4) messages.shift();
        render();
    });
    render();
}

/* ---------- Inisialisasi ---------- */

function init() {
    elements = {
        hud: document.getElementById('hud'),
        warning: document.getElementById('warning'),
        engine: document.getElementById('engine'),
        seatbelts: document.getElementById('seatbelts'),
        headlights: document.getElementById('headlights'),
        speed: document.getElementById('speed'),
        speedUnit: document.getElementById('speedUnit'),
        gear: document.getElementById('gear'),
        odometer: document.getElementById('odometer'),
        odoUnit: document.getElementById('odoUnit'),
        needle: document.getElementById('needle'),
        rpmArc: document.getElementById('rpmArc'),
        hubInner: document.querySelector('.hub-inner'),
        fuel: document.getElementById('fuel'),
        fuelChip: document.getElementById('fuelChip'),
        health: document.getElementById('health'),
        healthChip: document.getElementById('healthChip')
    };

    document.getElementById('owner').textContent = CONFIG.ownerName;

    buildScale();
    buildArcs();
    elements.fuelSegs = buildSegments('fuelSegs', false);
    elements.healthSegs = buildSegments('healthSegs', true);
    initAudio();

    setEngine(false);
    setSpeed(0);
    setRPM(0);
    setFuel(1);
    setHealth(1);
    setGear(0);
    setHeadlights(0);
    setSeatbelts(false);
    setOdometer(0);

    if (CONFIG.debug || /[?&]debug\b/.test(location.search)) installDebug();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
