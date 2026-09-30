'use strict';
/* आरती संग्रह - vanilla JS port of the aarti app. Hash-routed, localStorage-backed. */

const displayVerse = (text) => text.replace(/,\s*\n\s*/g, ', ');
const deityNames = ['ganesh','deva','shiv','shiva','vishnu','hanuman','durga','lakshmi','krishna','ram','rama','sita','sarasvati','saraswati','parvati','radha','gauri','gayatri','shani','shanidev','surya','ganga','tulsi','vishvakarma','balaji','satyanarayan','narayan','brahmacharini','mahagauri','katyayni','skand','skamdmata','chandraghanta','vaishno','vaishnavi','bhairav','mahavir','ambe','jagdish','raghunath','badrinath','narmada','shailaputri','ahoi','chandra','brahma','mahadeva','vrihaspati','brihaspati','santoshi','shitla','som','uma','shankar','bhavani','raghuvar','hanumat','gange','ramachandra','shambhu','sambhu','mahesh','maheshvar','hari','har','harhar','parameshvar','jagadanandi','reva','savitri','rudra','narad','sarad','sharad','shyama','suraj','chhaya','vishvanath','shri','maiyaa'];
const deityPattern = new RegExp(`\\b(${deityNames.join('|')})\\b`, 'gi');
function nameCase(text){ return text.replace(deityPattern, (word) => word[0].toUpperCase() + word.slice(1)); }
function formatRomanTitle(text){ return nameCase(text.replace(/^([a-z])/, (c) => c.toUpperCase())); }
function formatRomanLyrics(text){
  return displayVerse(text).split('\n').map((raw) => {
    const line = raw.trim();
    if (!line) return '';
    const ending = (line.match(/([.।॥]+)\s*$/) || [])[1] || '';
    const refrain = /^\.+\s*/.test(line) || ending.length >= 3;
    const clean = line.replace(/^\.+\s*/, '').replace(/\s*[.।॥,]+\s*$/, '').trim();
    const cased = nameCase(clean.replace(/^([^a-zA-Z]*)([a-z])/, (m, prefix, letter) => prefix + letter.toUpperCase()));
    return cased + (refrain || ending.length === 2 || /[॥]/.test(ending) ? '.' : ',');
  }).join('\n');
}

const SIZES = { small: { label: 'छोटा', hi: 17, en: 16 }, normal: { label: 'सामान्य', hi: 20, en: 18 }, large: { label: 'बड़ा', hi: 24, en: 22 } };
const DONATION_UPI = 'gunja711@oksbi';
const DONATION_LINK = 'upi://pay?pa=gunja711%40oksbi&pn=Gunja+Tiwari&cu=INR&tn=Support+the+Aarti+app';

const store = {
  get(key, fallback) {
    try { const v = JSON.parse(localStorage.getItem(key)); return v === null || v === undefined ? fallback : v; }
    catch { return fallback; }
  },
  set(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch {} }
};

const state = {
  aartis: [],
  lang: 'hi',
  favorites: store.get('aarti-favorites.v1', []),
  recent: store.get('aarti-recent.v1', []),
  size: store.get('aarti-text-size.v1', 'normal'),
  query: '',
  category: 'सभी',
  installPrompt: null,
};
if (!Array.isArray(state.favorites)) state.favorites = [];
if (!Array.isArray(state.recent)) state.recent = [];
if (!(state.size in SIZES)) state.size = 'normal';
state.favorites = state.favorites.filter((id) => Number.isInteger(id) && id >= 1 && id <= 40);
state.recent = state.recent.filter((id) => Number.isInteger(id) && id >= 1 && id <= 40);

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/* ---------- sound ---------- */
const sound = (() => {
  let ctx = null, bellTimer = null, conchTimer = null, conchAudio = null;
  let bellOn = false, conchOn = false;
  const getCtx = async () => { if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)(); if (ctx.state === 'suspended') await ctx.resume(); return ctx; };
  const strike = (c) => {
    const t = c.currentTime;
    [784, 1209, 1791, 2325, 3170].forEach((hz, i) => {
      const osc = c.createOscillator(); const gain = c.createGain();
      osc.type = 'sine'; osc.frequency.setValueAtTime(hz, t);
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime([0.11, 0.07, 0.045, 0.025, 0.014][i], t + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + [1.25, 1.0, 0.75, 0.55, 0.38][i]);
      osc.connect(gain).connect(c.destination); osc.start(t); osc.stop(t + 1.4);
    });
  };
  const stopBell = () => { if (bellTimer) { clearInterval(bellTimer); bellTimer = null; } bellOn = false; renderSoundButtons(); };
  const stopConch = () => { if (conchTimer) { clearTimeout(conchTimer); conchTimer = null; } if (conchAudio) { conchAudio.pause(); conchAudio.currentTime = 0; } conchOn = false; renderSoundButtons(); };
  const ring = async () => {
    if (bellOn) { stopBell(); return; }
    stopConch();
    try { const c = await getCtx(); strike(c); bellTimer = setInterval(() => strike(c), 1150); bellOn = true; renderSoundButtons(); }
    catch { soundError('ध्वनि शुरू नहीं हुई। ब्राउज़र की ऑडियो अनुमति जाँचें।'); }
  };
  const blow = async () => {
    if (conchOn) { stopConch(); return; }
    stopBell();
    try {
      if (!conchAudio) conchAudio = new Audio('shankh.mp3');
      conchAudio.currentTime = 0;
      conchAudio.onended = () => { if (conchTimer) { clearTimeout(conchTimer); conchTimer = null; } conchOn = false; renderSoundButtons(); };
      await conchAudio.play(); conchOn = true; conchTimer = setTimeout(stopConch, 15000); renderSoundButtons();
    } catch { stopConch(); soundError('शंख की ध्वनि शुरू नहीं हुई। ब्राउज़र की ऑडियो अनुमति जाँचें।'); }
  };
  document.addEventListener('visibilitychange', () => { if (document.hidden) { stopBell(); stopConch(); } });
  window.addEventListener('pagehide', () => { stopBell(); stopConch(); });
  return { ring, blow, get bellOn() { return bellOn; }, get conchOn() { return conchOn; } };
})();
function soundError(msg) { const el = document.querySelector('.sound-error'); if (el) el.textContent = msg; }
function renderSoundButtons() {
  const bell = document.getElementById('btn-bell'), conch = document.getElementById('btn-conch');
  if (!bell || !conch) return;
  bell.setAttribute('aria-pressed', String(sound.bellOn));
  bell.innerHTML = (sound.bellOn ? '🔔 घंटी बंद करें' : '🔔 घंटी बजाएँ') + `<small>${sound.bellOn ? 'चल रही है · दोबारा दबाकर रोकें' : 'रोकने तक बजती रहेगी'}</small>`;
  conch.setAttribute('aria-pressed', String(sound.conchOn));
  conch.innerHTML = (sound.conchOn ? '🐚 शंख बंद करें' : '🐚 शंख बजाएँ') + `<small>${sound.conchOn ? 'बज रहा है · 15 सेकंड में रुकेगा' : '15 सेकंड में अपने आप रुकेगा'}</small>`;
}

/* ---------- shared pieces ---------- */
function soundControlsHtml() {
  return `<section class="group"><h2 class="group-label">पूजा की ध्वनि</h2>
    <div class="sound-buttons">
      <button class="sound-button" type="button" id="btn-bell" aria-pressed="${sound.bellOn}">${sound.bellOn ? '🔔 घंटी बंद करें' : '🔔 घंटी बजाएँ'}<small>${sound.bellOn ? 'चल रही है · दोबारा दबाकर रोकें' : 'रोकने तक बजती रहेगी'}</small></button>
      <button class="sound-button" type="button" id="btn-conch" aria-pressed="${sound.conchOn}">${sound.conchOn ? '🐚 शंख बंद करें' : '🐚 शंख बजाएँ'}<small>${sound.conchOn ? 'बज रहा है · 15 सेकंड में रुकेगा' : '15 सेकंड में अपने आप रुकेगा'}</small></button>
    </div>
    <p class="sound-error" role="alert"></p>
    <p class="sound-hint">एक समय पर एक ही ध्वनि बजेगी। पेज छोड़ने या फ़ोन लॉक करने पर ध्वनि रुक जाएगी। <a class="textlink" href="https://freesound.org/people/pbimal/sounds/570665/" target="_blank" rel="noopener noreferrer">शंख रिकॉर्डिंग: pbimal / Devraj Paudyal (CC0)</a></p></section>`;
}
function bindSoundButtons() {
  const bell = document.getElementById('btn-bell'), conch = document.getElementById('btn-conch');
  if (bell) bell.addEventListener('click', () => { void sound.ring(); });
  if (conch) conch.addEventListener('click', () => { void sound.blow(); });
}
function langSwitchHtml() {
  return `<div class="language-switch" role="group" aria-label="लिपि चुनें"><span class="language-label">लिपि / Script</span>
    <button type="button" data-lang="hi" aria-pressed="${state.lang === 'hi'}">हिंदी</button>
    <button type="button" data-lang="en" aria-pressed="${state.lang === 'en'}">English</button></div>`;
}
function bindLangSwitch() {
  document.querySelectorAll('.language-switch button').forEach((b) => b.addEventListener('click', () => { state.lang = b.dataset.lang; render(); }));
}
function aartiItemHtml(a) {
  const title = state.lang === 'hi' ? a.title : formatRomanTitle(a.romanTitle);
  const sub = state.lang === 'hi' ? a.opening : formatRomanLyrics(a.romanLyrics).split('\n')[0];
  return `<a class="aarti-item" href="#/aarti/${a.id}"><span class="item-no">${String(a.id).padStart(2, '0')}</span><span class="item-copy"><strong>${esc(title)}</strong><small>${esc(a.category)} · ${esc(sub)}</small></span><span class="item-arrow" aria-hidden="true">›</span></a>`;
}
function toggleFavorite(id) {
  state.favorites = state.favorites.includes(id) ? state.favorites.filter((x) => x !== id) : [...state.favorites, id];
  store.set('aarti-favorites.v1', state.favorites);
  render();
}

/* ---------- donation ---------- */
function donationHtml() {
  return `<section class="group"><h2 class="group-label big">Support this app</h2>
    <div class="donation-panel">
      <p class="donation-intro">If this collection is useful, you can support the cost of running the app with a voluntary UPI payment.</p>
      <button type="button" class="donation-button" id="donation-toggle" aria-expanded="false">Donation - support the app</button>
      <div id="donation-details" class="donation-details" hidden>
        <p class="donation-options-note">Choose a way to pay Gunja Tiwari. If your phone does not open a UPI app, copy the ID below into your UPI app.</p>
        <div class="donation-payee">
          <div class="upi-app-options"><a class="upi-intent" href="${DONATION_LINK}" target="_blank" rel="noopener noreferrer">Open UPI app</a></div>
          <span class="donation-label">Payee</span><strong>Gunja Tiwari</strong>
          <span class="donation-label">UPI ID</span><code>${DONATION_UPI}</code>
          <button type="button" class="copy-upi" id="copy-upi">Copy UPI ID</button>
          <span class="donation-note" role="alert" id="copy-note" hidden></span>
        </div>
        <div class="donation-qr"><img src="qr.png" alt="UPI payment QR for Gunja Tiwari"><span>On another device, scan with a UPI app.</span></div>
      </div>
    </div></section>`;
}
function bindDonation() {
  const toggle = document.getElementById('donation-toggle');
  if (!toggle) return;
  toggle.addEventListener('click', () => {
    const d = document.getElementById('donation-details');
    const open = d.hidden;
    d.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
  });
  const copy = document.getElementById('copy-upi');
  copy.addEventListener('click', async () => {
    let ok = false;
    try { await navigator.clipboard.writeText(DONATION_UPI); ok = true; }
    catch {
      const f = document.createElement('textarea');
      f.value = DONATION_UPI; f.style.position = 'fixed'; f.style.opacity = '0';
      document.body.appendChild(f); f.select(); ok = document.execCommand('copy'); f.remove();
    }
    copy.textContent = ok ? 'Copied' : 'Copy UPI ID';
    const note = document.getElementById('copy-note');
    if (!ok) { note.textContent = 'Copy failed. Select the UPI ID above to copy it.'; note.hidden = false; }
    else { note.hidden = true; setTimeout(() => { copy.textContent = 'Copy UPI ID'; }, 3000); }
  });
}

/* ---------- install ---------- */
function installHtml() {
  const standalone = (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || window.navigator.standalone === true;
  if (standalone) return `<section class="group"><h2 class="group-label">होम स्क्रीन ऐप</h2><p class="install-note">आरती ऐप आपकी होम स्क्रीन पर इंस्टॉल है। इंटरनेट के बिना भी चलता है।</p></section>`;
  if (state.installPrompt) {
    return `<section class="group"><h2 class="group-label big">होम स्क्रीन पर जोड़ें</h2>
      <div class="install-panel">
        <p class="install-lead">ऐप को फ़ोन की होम स्क्रीन पर जोड़ें - एक बार जुड़ने के बाद इंटरनेट के बिना भी चलेगा।</p>
        <button type="button" class="install-open" id="install-btn">अभी इंस्टॉल करें</button>
        <p class="install-steps">iPhone पर: Safari में Share बटन → "Add to Home Screen"</p>
      </div></section>`;
  }
  return `<section class="group"><h2 class="group-label big">होम स्क्रीन पर जोड़ें</h2>
    <div class="install-panel">
      <p class="install-lead">इस पेज को होम स्क्रीन पर जोड़ें - एक बार जुड़ने के बाद इंटरनेट के बिना भी चलेगा।</p>
      <p class="install-steps">Android (Chrome): मेनू (⋮) → "Install app" या "Add to Home screen" · iPhone (Safari): Share बटन → "Add to Home Screen"</p>
    </div></section>`;
}
function bindInstall() {
  const b = document.getElementById('install-btn');
  if (b) b.addEventListener('click', () => { if (state.installPrompt) { void state.installPrompt.prompt(); } });
}

/* ---------- views ---------- */
function homeHtml() {
  const q = state.query.trim().toLocaleLowerCase();
  const cats = ['सभी', ...new Set(state.aartis.map((a) => a.category))];
  const pinned = state.aartis.filter((a) => state.favorites.includes(a.id));
  const visited = state.recent.filter((id) => !state.favorites.includes(id)).map((id) => state.aartis.find((a) => a.id === id)).filter(Boolean);
  const result = state.aartis.filter((a) => (state.category === 'सभी' || a.category === state.category) && `${a.title} ${a.category} ${a.opening} ${a.romanTitle} ${a.romanLyrics}`.toLocaleLowerCase().includes(q));
  return `
  <header class="page-header">
    <p class="header-fact">हिंदी और Roman Hindi</p>
    <h1>40 लोकप्रिय आरतियाँ</h1>
    <p class="header-intro">आरती खोजें और पूरा पाठ यहीं पढ़ें। English विकल्प अनुवाद नहीं, हिंदी का रोमन उच्चारण है।</p>
  </header>
  ${langSwitchHtml()}
  ${soundControlsHtml()}
  ${donationHtml()}
  ${installHtml()}
  ${pinned.length ? `<section class="group"><h2 class="group-label big">★ पसंदीदा आरतियाँ</h2><div class="aarti-grid">${pinned.map((a) => `<div class="saved-row">${aartiItemHtml(a)}<button type="button" class="unpin" data-unpin="${a.id}" aria-label="${esc(a.title)} पसंदीदा से हटाएँ">हटाएँ</button></div>`).join('')}</div></section>` : ''}
  ${visited.length ? `<section class="group"><h2 class="group-label big">हाल में पढ़ी</h2><div class="aarti-grid">${visited.slice(0, 3).map(aartiItemHtml).join('')}</div></section>` : ''}
  <section class="group"><h2 class="group-label">खोजें</h2><label class="search-label" for="q">नाम, देवता या बोल</label><input id="q" class="search" type="search" value="${esc(state.query)}" placeholder="गणेश या Ganesh…"></section>
  <div class="chips" role="group" aria-label="देवता के अनुसार छाँटें">${cats.map((c) => `<button key="${esc(c)}" type="button" class="chip ${state.category === c ? 'active' : ''}" aria-pressed="${state.category === c}" data-cat="${esc(c)}">${esc(c)}</button>`).join('')}</div>
  <section class="group"><h2 class="group-label big">${result.length} आरतियाँ</h2><div class="aarti-grid">${result.map(aartiItemHtml).join('')}</div>${result.length === 0 ? '<p class="empty">इस खोज में कोई आरती नहीं मिली। दूसरी खोज करें या "सभी" चुनें।</p>' : ''}</section>
  <footer class="closing">यह चुना हुआ संग्रह है, लोकप्रियता का आधिकारिक क्रम नहीं। क्षेत्र के अनुसार बोल बदल सकते हैं।</footer>`;
}
function bindHome() {
  const q = document.getElementById('q');
  if (q) {
    q.addEventListener('input', () => {
      state.query = q.value;
      const pos = q.selectionStart;
      render();
      const q2 = document.getElementById('q');
      q2.focus(); q2.setSelectionRange(pos, pos);
    });
  }
  document.querySelectorAll('.chip').forEach((c) => c.addEventListener('click', () => { state.category = c.dataset.cat; render(); }));
  document.querySelectorAll('[data-unpin]').forEach((b) => b.addEventListener('click', () => toggleFavorite(Number(b.dataset.unpin))));
}
function detailHtml(id) {
  const a = state.aartis.find((x) => x.id === id);
  if (!a) return `<header class="page-header"><h1>आरती नहीं मिली</h1></header><a class="back" href="#/">‹ सभी आरतियाँ</a>`;
  const isFav = state.favorites.includes(id);
  const lyrics = (state.lang === 'hi' ? displayVerse(a.lyrics) : formatRomanLyrics(a.romanLyrics)).split('\n');
  const sizePx = SIZES[state.size][state.lang];
  return `
  <a class="back" href="#/">‹ सभी आरतियाँ</a>
  <header class="page-header">
    <p class="header-fact">${esc(a.category)}</p>
    <h1>${esc(state.lang === 'hi' ? a.title : formatRomanTitle(a.romanTitle))}</h1>
    <p class="header-intro">${state.lang === 'hi' ? 'पूरा पाठ' : 'Roman Hindi pronunciation, not a translation'}</p>
  </header>
  <div class="reading-tools">
    <button type="button" class="favorite-button" id="fav-toggle" aria-pressed="${isFav}">${isFav ? '★ पसंदीदा से हटाएँ' : '☆ पसंदीदा में जोड़ें'}</button>
    <div class="text-size" role="group" aria-label="अक्षर आकार"><span>अक्षर आकार</span>${Object.keys(SIZES).map((v) => `<button type="button" data-size="${v}" aria-pressed="${state.size === v}">${SIZES[v].label}</button>`).join('')}</div>
  </div>
  ${langSwitchHtml()}
  ${soundControlsHtml()}
  <section class="group"><h2 class="group-label big">${state.lang === 'hi' ? 'आरती' : 'Aarti'}</h2>
    <div class="lyrics" lang="${state.lang === 'hi' ? 'hi' : 'en'}" style="--reading-size:${sizePx}px">${lyrics.map((l) => `<div class="lyric-line">${l ? esc(l) : '&nbsp;'}</div>`).join('')}</div>
  </section>`;
}
function bindDetail(id) {
  const fav = document.getElementById('fav-toggle');
  if (fav) fav.addEventListener('click', () => toggleFavorite(id));
  document.querySelectorAll('.text-size button').forEach((b) => b.addEventListener('click', () => { state.size = b.dataset.size; store.set('aarti-text-size.v1', state.size); render(); }));
}

function render() {
  const root = document.getElementById('root');
  const m = location.hash.match(/^#\/aarti\/(\d+)/);
  if (m) {
    const id = Number(m[1]);
    root.innerHTML = `<div class="page">${detailHtml(id)}</div>`;
    if (state.aartis.some((a) => a.id === id)) {
      state.recent = [id, ...state.recent.filter((x) => x !== id)].slice(0, 6);
      store.set('aarti-recent.v1', state.recent);
    }
    bindDetail(id); bindLangSwitch(); bindSoundButtons();
  } else {
    root.innerHTML = `<div class="page">${homeHtml()}</div>`;
    bindHome(); bindLangSwitch(); bindSoundButtons(); bindDonation(); bindInstall();
  }
  window.scrollTo(0, 0);
}


/* ---------- donation nudge popup ---------- */
const NUDGE_COUNT_KEY = 'aarti-opens.v1';
const NUDGE_NEVER_KEY = 'aarti-donation-never.v1';
const NUDGE_FIRST = [5, 10, 20];

function nudgeShouldShow(count) {
  if (store.get(NUDGE_NEVER_KEY, false)) return false;
  if (NUDGE_FIRST.includes(count)) return true;
  return count > 20 && count % 10 === 0;
}

function showDonationNudge(count) {
  if (document.getElementById('nudge-overlay')) return;
  const overlay = document.createElement('div');
  overlay.className = 'nudge-overlay';
  overlay.id = 'nudge-overlay';
  overlay.innerHTML = `
    <div class="nudge-card" role="dialog" aria-modal="true" aria-labelledby="nudge-title">
      <h2 class="nudge-title" id="nudge-title">आरती संग्रह उपयोगी लगा?</h2>
      <p class="nudge-body">यह ऐप मुफ़्त है और मुफ़्त ही रहेगा। आपने इसे ${count} बार खोला है - अगर यह आपके लिए उपयोगी है, तो चाहें तो UPI से थोड़ा सहयोग कर सकते हैं।</p>
      <div class="nudge-pay">
        <a class="donation-button nudge-support" href="${DONATION_LINK}" target="_blank" rel="noopener noreferrer">ऐप को सहयोग करें (UPI)</a>
        <div class="nudge-upi-row"><span class="donation-label">UPI ID</span><code>${DONATION_UPI}</code><button type="button" class="copy-upi" id="nudge-copy">Copy</button></div>
        <div class="nudge-qr"><img src="qr.png" alt="UPI payment QR for Gunja Tiwari"></div>
      </div>
      <div class="nudge-actions">
        <button type="button" class="nudge-later" id="nudge-later">बाद में</button>
        ${count >= 20 ? '<button type="button" class="nudge-never" id="nudge-never">दोबारा न पूछें</button>' : ''}
      </div>
    </div>`;
  document.body.appendChild(overlay);
  const close = () => overlay.remove();
  document.getElementById('nudge-later').addEventListener('click', close);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  document.addEventListener('keydown', function esc(e) { if (e.key === 'Escape') { close(); document.removeEventListener('keydown', esc); } });
  const never = document.getElementById('nudge-never');
  if (never) never.addEventListener('click', () => { store.set(NUDGE_NEVER_KEY, true); close(); });
  document.getElementById('nudge-copy').addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    let ok = false;
    try { await navigator.clipboard.writeText(DONATION_UPI); ok = true; }
    catch {
      const f = document.createElement('textarea');
      f.value = DONATION_UPI; f.style.position = 'fixed'; f.style.opacity = '0';
      document.body.appendChild(f); f.select();
      try { ok = document.execCommand('copy'); } catch {}
      f.remove();
    }
    btn.textContent = ok ? 'Copied' : 'Copy';
    if (ok) setTimeout(() => { btn.textContent = 'Copy'; }, 3000);
  });
}

function maybeShowDonationNudge() {
  const count = store.get(NUDGE_COUNT_KEY, 0) + 1;
  store.set(NUDGE_COUNT_KEY, count);
  if (!nudgeShouldShow(count)) return;
  setTimeout(() => showDonationNudge(count), 1200);
}

{
    state.aartis = AARTIS_DATA;
    window.addEventListener('hashchange', render);
    window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); state.installPrompt = e; render(); });
    window.addEventListener('appinstalled', () => { state.installPrompt = null; render(); });
    render();
    maybeShowDonationNudge();
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('sw.js').catch((err) => console.warn('SW registration failed', err));
    }
}
