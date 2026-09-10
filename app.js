// Basic tab routing
function showTab(tab){
  // If user wants to open the edit tab, ensure authentication first
  if(tab==='edit' || tab==='postcard-editor'){
    ensureAuth(true).then(ok=>{ if(ok){ activateTab(tab); } }).catch(()=>{}); return;
  }
  activateTab(tab);
}

function activateTab(tab){
  document.querySelectorAll('.tab-link').forEach(l=>l.classList.remove('active'));
  const navLink = document.querySelector('.tab-link[data-tab="'+tab+'"]');
  if(navLink) navLink.classList.add('active');
  const mobileNav = document.getElementById('mobileNav');
  if(mobileNav && mobileNav.value !== tab) mobileNav.value = tab;
  document.querySelectorAll('.tab-panel').forEach(p=>p.classList.remove('active'));
  const panel = document.getElementById(tab);
  if(panel) panel.classList.add('active');
  if(tab==='map') setTimeout(()=>{initMapIfNeeded()},50);
}

document.querySelectorAll('.tab-link').forEach(link=>{
  link.addEventListener('click', e=>{
    e.preventDefault();
      showTab(link.dataset.tab);
  });
});

const mobileNav = document.getElementById('mobileNav');
if(mobileNav){
  mobileNav.addEventListener('change', ()=>{
    showTab(mobileNav.value);
  });
}

// Slideshow
// Slideshow - populate from manifest if available, otherwise use defaults embedded earlier
let slides = [];
let cur = 0;
function createSlide(url){
  const d = document.createElement('div'); d.className='slide'; d.style.backgroundImage = `url('${url}')`;
  return d;
}
async function loadSlides(){
  const container = document.getElementById('slideshow');
  container.innerHTML = '';
  // try manifest
  try{
    const res = await fetch('assets/images/manifest.json');
    if(res.ok){
      const list = await res.json();
      if(Array.isArray(list) && list.length>0){
        list.forEach(p=>{ const url = 'assets/images/'+p; const s=createSlide(url); container.appendChild(s); });
      }
    }
  }catch(e){/* ignore */}
  // if still empty, fallback to a few remote photos
  if(container.children.length===0){
    const defaults = [
      'https://images.unsplash.com/photo-1508051123993-3d1b1d7f14a9?auto=format&fit=crop&w=1600&q=60',
      'https://images.unsplash.com/photo-1504198266280-5f07b8d7f6f3?auto=format&fit=crop&w=1600&q=60',
      'https://images.unsplash.com/photo-1528909514045-2fa4ac7a08ba?auto=format&fit=crop&w=1600&q=60'
    ];
    defaults.forEach(u=>{ container.appendChild(createSlide(u)); });
  }
  slides = Array.from(container.querySelectorAll('.slide'));
  if(slides.length>0) showSlide(0);
}

function showSlide(i){
  slides.forEach(s=>s.classList.remove('active'));
  if(slides[i]) slides[i].classList.add('active');
}

function startSlideshow(){
  if(!slides || slides.length<=1) return;
  setInterval(()=>{ cur=(cur+1)%slides.length; showSlide(cur); },5000);
}

loadSlides().then(startSlideshow).catch(()=>{});

// Home world clocks
function initWorldClocks(){
  const clockCards = Array.from(document.querySelectorAll('.world-clock'));
  if(clockCards.length===0) return;

  clockCards.forEach(card=>{
    const zone = card.dataset.timezone;
    card._clockFormatters = {
      time: new Intl.DateTimeFormat('en-US', {
        timeZone: zone,
        hour: 'numeric',
        minute: '2-digit',
        second: '2-digit',
        hour12: true
      }),
      date: new Intl.DateTimeFormat('en-US', {
        timeZone: zone,
        weekday: 'short',
        month: 'long',
        day: 'numeric',
        year: 'numeric'
      }),
      parts: new Intl.DateTimeFormat('en-US', {
        timeZone: zone,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
      })
    };
  });

  function updateWorldClocks(){
    const now = new Date();
    clockCards.forEach(card=>{
      const fmts = card._clockFormatters;
      const timeEl = card.querySelector('[data-role="time"]');
      const dateEl = card.querySelector('[data-role="date"]');
      const hourHand = card.querySelector('.clock-hour');
      const minuteHand = card.querySelector('.clock-minute');

      if(timeEl) timeEl.textContent = fmts.time.format(now).toUpperCase();
      if(dateEl) dateEl.textContent = fmts.date.format(now);

      const parts = fmts.parts.formatToParts(now);
      const hour = parseInt(parts.find(p=>p.type==='hour')?.value || '0', 10);
      const minute = parseInt(parts.find(p=>p.type==='minute')?.value || '0', 10);
      const second = parseInt(parts.find(p=>p.type==='second')?.value || '0', 10);

      const hourDegrees = ((hour % 12) + minute / 60) * 30;
      const minuteDegrees = (minute + second / 60) * 6;

      if(hourHand) hourHand.style.transform = `rotate(${hourDegrees}deg)`;
      if(minuteHand) minuteHand.style.transform = `rotate(${minuteDegrees}deg)`;
    });
  }

  updateWorldClocks();
  setInterval(updateWorldClocks, 1000);
}

initWorldClocks();

// Current conditions from Open-Meteo, refreshed every 15 minutes.
function weatherDescription(code){
  const descriptions = {
    0: 'Clear sky', 1: 'Mainly clear', 2: 'Partly cloudy', 3: 'Overcast',
    45: 'Fog', 48: 'Freezing fog',
    51: 'Light drizzle', 53: 'Drizzle', 55: 'Heavy drizzle',
    56: 'Light freezing drizzle', 57: 'Freezing drizzle',
    61: 'Light rain', 63: 'Rain', 65: 'Heavy rain',
    66: 'Light freezing rain', 67: 'Freezing rain',
    71: 'Light snow', 73: 'Snow', 75: 'Heavy snow', 77: 'Snow grains',
    80: 'Light showers', 81: 'Rain showers', 82: 'Heavy showers',
    85: 'Light snow showers', 86: 'Heavy snow showers',
    95: 'Thunderstorm', 96: 'Thunderstorm with hail', 99: 'Thunderstorm with heavy hail'
  };
  return descriptions[code] || 'Conditions unavailable';
}

async function updateWorldWeather(){
  await Promise.all(Array.from(document.querySelectorAll('.world-clock')).map(async card=>{
    const weatherEl = card.querySelector('[data-role="weather"]');
    if(!weatherEl) return;
    const controller = new AbortController();
    const timeout = setTimeout(()=>controller.abort(), 10000);
    try{
      const params = new URLSearchParams({
        latitude: card.dataset.latitude,
        longitude: card.dataset.longitude,
        current: 'temperature_2m,weather_code',
        temperature_unit: 'celsius'
      });
      const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`, {
        signal: controller.signal
      });
      if(!response.ok) throw new Error('Weather request failed');
      const data = await response.json();
      const temperature = data.current?.temperature_2m;
      if(!Number.isFinite(temperature)) throw new Error('Missing temperature');
      const fahrenheit = Math.round(temperature * 9 / 5 + 32);
      weatherEl.textContent = `${fahrenheit}°F / ${Math.round(temperature)}°C · ${weatherDescription(data.current.weather_code)}`;
    }catch(e){
      weatherEl.textContent = 'Weather unavailable';
    }finally{
      clearTimeout(timeout);
    }
  }));
}

updateWorldWeather();
setInterval(updateWorldWeather, 15 * 60 * 1000);

// Map and flights
let mapInitialized = false;
let map, flightsLayer;
const DEFAULT_MAP_ZOOM = 5;
let flightMarkers = [];
let flightPolylines = [];
const defaultFlights = [
  {from:'Chicago',to:'Barcelona',type:'flight',date:'2027-03-10',fromCoords:[41.8781,-87.6298],toCoords:[41.3851,2.1734]},
  {from:'Barcelona',to:'Athens',type:'flight',date:'2027-03-20',fromCoords:[41.3851,2.1734],toCoords:[37.9838,23.7275]},
  {from:'Athens',to:'Chicago',type:'flight',date:'2027-04-02',fromCoords:[37.9838,23.7275],toCoords:[41.8781,-87.6298]}
];

function loadFlights(){
  const raw = localStorage.getItem('flights');
  if(!raw) { localStorage.setItem('flights', JSON.stringify(defaultFlights)); return defaultFlights; }
  try{return JSON.parse(raw)}catch(e){localStorage.setItem('flights', JSON.stringify(defaultFlights)); return defaultFlights}
}

function saveFlights(flights){ localStorage.setItem('flights', JSON.stringify(flights)); }

function initMapIfNeeded(){
  if(mapInitialized) return;
  mapInitialized = true;
  map = L.map('mapid',{scrollWheelZoom:false}).setView([40,0],2);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'© OpenStreetMap contributors'}).addTo(map);
  flightsLayer = L.layerGroup().addTo(map);
  // single click zoom to the clicked location at a sensible default zoom level
  map.on('click', (e)=>{ try{ if(e && e.latlng) map.setView(e.latlng, DEFAULT_MAP_ZOOM); }catch(e){} });
  renderFlights();
  // wire the progress slider to adjust brown intensity
  const slider = document.getElementById('progressSlider');
  if(slider){
    slider.addEventListener('input', ()=>{
      const max = parseFloat(slider.max) || 100;
      const val = parseFloat(slider.value) || 0;
      const pct = max>0 ? Math.min(1, val/max) : Math.min(1, val/100);
      updateMapBrownsByProgress(pct);
    });
    // initialize based on current slider
    const initMax = parseFloat(slider.max) || 100;
    const initVal = parseFloat(slider.value) || 0;
    updateMapBrownsByProgress(initMax>0 ? Math.min(1, initVal/initMax) : Math.min(1, initVal/100));
  }
  // fitBounds button removed — map controls simplified
  document.getElementById('playFlights').addEventListener('click', ()=>{ toggleFlightAnimation(); });
  const backupBtn = document.getElementById('backupBtn');
  if(backupBtn){ backupBtn.addEventListener('click', ()=>{ backupToServer(); }); }
  const restoreBtn = document.getElementById('restoreBtn');
  if(restoreBtn){ restoreBtn.addEventListener('click', ()=>{ restoreFromServer(); }); }
  const publishBtn = document.getElementById('publishBtn');
  if(publishBtn){ publishBtn.addEventListener('click', ()=>{ ensureAuth().then(ok=>{ if(ok) publishToServer(); }); }); }
  const serverSettings = document.getElementById('serverSettings');
  if(serverSettings){ serverSettings.addEventListener('click', ()=>{ promptServerSettings(); }); }
  updateServerInfoUI();
}

// Top-left edit button shows a small authenticated menu with options
const topEditBtn = document.getElementById('topEditBtn');
const editMenu = document.getElementById('editMenu');
if(topEditBtn){
  topEditBtn.addEventListener('click', ()=>{
    if(editMenu){ editMenu.style.display = (editMenu.style.display==='block')? 'none' : 'block'; }
    else { showTab('edit'); }
  });
}

// Menu buttons
const menuEditMap = document.getElementById('menuEditMap');
const menuEditPostcards = document.getElementById('menuEditPostcards');
if(menuEditMap){ menuEditMap.addEventListener('click', ()=>{ if(editMenu) editMenu.style.display='none'; showTab('edit'); }); }
if(menuEditPostcards){ menuEditPostcards.addEventListener('click', ()=>{ if(editMenu) editMenu.style.display='none'; showTab('postcard-editor'); }); }

// Hide menu when clicking outside
document.addEventListener('click', (e)=>{
  if(!editMenu) return;
  const target = e.target;
  if(target===topEditBtn || topEditBtn.contains(target) || editMenu.contains(target)) return;
  if(editMenu.style.display==='block') editMenu.style.display='none';
});

function renderFlights(){
  flightsLayer.clearLayers();
  flightMarkers = [];
  flightPolylines = [];
  const flights = loadFlights();
  // place unique location pins
  const locMap = {};
  flights.forEach(f=>{
    locMap[f.from] = f.fromCoords;
    locMap[f.to] = f.toCoords;
  });
  Object.keys(locMap).forEach(name=>{
    const mk = L.circleMarker(locMap[name], {
      radius: 6,
      fillColor: '#BD8371',
      color: '#623E2A',
      weight: 1,
      fillOpacity: 1
    }).addTo(flightsLayer).bindPopup(name);
    flightMarkers.push(mk);
  });
  // draw legs
  flights.forEach(f=>{
    const p1 = f.fromCoords;
    const p2 = f.toCoords;
    const color = (f.type==='train')? '#4A6B8B' : (f.type==='boat')? '#2E8B57' : '#8B5E4A';
    const pl = L.polyline([p1,p2],{color:color,weight:3,opacity:0.9}).addTo(flightsLayer);
    flightPolylines.push(pl);
  });
  // update timeline below the map
  renderTimeline(flights);
}

function formatDateLabel(dstr){
  if(!dstr) return 'TBD';
  try{
    const d = new Date(dstr+'T00:00:00');
    const opts = {month:'short', day:'numeric', year:'numeric'};
    const parts = new Intl.DateTimeFormat('en', opts).format(d).toUpperCase().split(' ');
    // convert 'Mar 5, 2027' -> 'MAR 5 2027'
    return parts.join(' ');
  }catch(e){ return dstr; }
}

function formatRangeLabel(startStr, endStr){
  if(!startStr && !endStr) return 'TBD';
  if(!endStr) return formatDateLabel(startStr);
  try{
    const s = new Date(startStr+'T00:00:00');
    const e = new Date(endStr+'T00:00:00');
    const optsNoYear = {month:'short', day:'numeric'};
    const optsWithYear = {month:'short', day:'numeric', year:'numeric'};
    if(s.getFullYear() === e.getFullYear()){
      const sLbl = new Intl.DateTimeFormat('en', optsNoYear).format(s).toUpperCase();
      const eLbl = new Intl.DateTimeFormat('en', optsWithYear).format(e).toUpperCase();
      // eLbl already has year; produce: 'JAN 4 - FEB 13 2027'
      const eParts = eLbl.split(' ');
      const eYear = eParts[eParts.length-1];
      const eNoYear = eParts.slice(0,eParts.length-1).join(' ');
      return `${sLbl} - ${eNoYear} ${eYear}`;
    } else {
      const sLbl = new Intl.DateTimeFormat('en', optsWithYear).format(s).toUpperCase();
      const eLbl = new Intl.DateTimeFormat('en', optsWithYear).format(e).toUpperCase();
      return `${sLbl} - ${eLbl}`;
    }
  }catch(e){ return (startStr||'') + (endStr?(' - '+endStr):''); }
}

function renderTimeline(flights){
  const container = document.getElementById('timeline');
  if(!container) return;
  container.innerHTML = '';
  const heading = document.createElement('div'); heading.className='heading'; heading.textContent='FULL SCHEDULE';
  container.appendChild(heading);
  const list = document.createElement('div'); list.className='timeline-list';

  // sort flights by date, put TBD last
  const ordered = Array.from(flights).sort((a,b)=>{
    if(!a.date) return 1; if(!b.date) return -1;
    return new Date(a.date) - new Date(b.date);
  });

  // Render both flights and inferred stays: for each flight, show the flight event on its date,
  // then show the stay at the destination from that date until the next flight (or user-provided endDate)
  if(ordered.length===0){
    const p = document.createElement('div'); p.className='timeline-item'; p.textContent='No scheduled travel yet.'; list.appendChild(p);
  } else {
    for(let i=0;i<ordered.length;i++){
      const cur = ordered[i];
      const next = ordered[i+1];
      // Flight event
      const flightItem = document.createElement('div'); flightItem.className='timeline-item';
      const flightDateEl = document.createElement('div'); flightDateEl.className='timeline-date';
      flightDateEl.textContent = cur.date ? formatDateLabel(cur.date) : 'TBD';
      const flightEv = document.createElement('div'); flightEv.className='timeline-event';
      flightEv.textContent = (cur.date || true) ? ((cur.type==='flight')? `FLY TO ${cur.to.toUpperCase()}` : `${(cur.type||'TRAVEL').toUpperCase()} TO ${cur.to.toUpperCase()}`) : 'TBD';
      flightItem.appendChild(flightDateEl); flightItem.appendChild(flightEv);
      list.appendChild(flightItem);

      // Inferred stay: start at cur.date, end at cur.endDate || next.date
      const stayStart = cur.date || null;
      const stayEnd = cur.endDate || (next && next.date) || null;
      // Only render stay if we have at least some date info or to show TBD stay
      const stayItem = document.createElement('div'); stayItem.className='timeline-item';
      const stayDateEl = document.createElement('div'); stayDateEl.className='timeline-date';
      stayDateEl.textContent = (stayStart || stayEnd) ? formatRangeLabel(stayStart, stayEnd) : 'TBD';
      const stayEv = document.createElement('div'); stayEv.className='timeline-event';
      stayEv.textContent = cur.to ? `IN ${cur.to.toUpperCase()}` : 'TBD';
      stayItem.appendChild(stayDateEl); stayItem.appendChild(stayEv);
      list.appendChild(stayItem);
    }
  }

  // If no flights, show placeholder
  if(ordered.length===0){
    const p = document.createElement('div'); p.className='timeline-item'; p.textContent='No scheduled travel yet.'; list.appendChild(p);
  }

  container.appendChild(list);
}

// Compute a darker shade by mixing towards black. amount: 0..1
function darkenHex(hex, amount){
  const hc = hex.replace('#','');
  const r = parseInt(hc.substring(0,2),16);
  const g = parseInt(hc.substring(2,4),16);
  const b = parseInt(hc.substring(4,6),16);
  const nr = Math.max(0, Math.round(r*(1-amount)));
  const ng = Math.max(0, Math.round(g*(1-amount)));
  const nb = Math.max(0, Math.round(b*(1-amount)));
  return '#'+[nr,ng,nb].map(v=>v.toString(16).padStart(2,'0')).join('');
}

function updateMapBrownsByProgress(percent){
  // percent 0..1 -> map via sqrt to make small slider movements more visible, up to 90% darkening
  const pct = Math.min(1, Math.max(0, percent));
  const scale = Math.sqrt(pct) * 0.9;
  const baseFill = '#BD8371';
  const baseStroke = '#623E2A';
  const basePoly = '#8B5E4A';
  const newFill = darkenHex(baseFill, scale);
  const newStroke = darkenHex(baseStroke, scale);
  const newPoly = darkenHex(basePoly, scale);
  // update markers
  flightMarkers.forEach(mk=>{
    try{ mk.setStyle({fillColor:newFill, color:newStroke}); }catch(e){}
  });
  // update polylines
  flightPolylines.forEach(pl=>{
    try{ pl.setStyle({color:newPoly}); }catch(e){}
  });
  // also update slider thumb/track subtly by setting a CSS var used in styles
  document.documentElement.style.setProperty('--brown-1', newStroke);
  document.documentElement.style.setProperty('--brown-2', newFill);
}

// Animation state
let isAnimating = false;
let animMarker = null;
let animLine = null;
let animCancel = null;

function createTransportIcon(type){
  const emoji = (type==='train')? '🚆' : (type==='boat')? '⛴️' : '✈️';
  return L.divIcon({className:'plane-icon', html:`<span class="transport-emoji">${emoji}</span>`, iconSize:[28,28]});
}

function sleep(ms){ return new Promise(r=>setTimeout(r,ms)); }

async function animateFlightsSequentially(){
  const flights = loadFlights();
  if(flights.length===0) return;
  // compute total steps for slider
  const stepsPerLeg = 160;
  const duration = 2200;
  const totalSteps = flights.length * stepsPerLeg;
  const slider = document.getElementById('progressSlider');
  slider.max = totalSteps;
  slider.value = 0;
  document.getElementById('currentTransport').textContent = '';


  // create animation marker and line
  if(animMarker){ map.removeLayer(animMarker); animMarker=null; }
  if(animLine){ map.removeLayer(animLine); animLine=null; }
  animMarker = L.marker(flights[0].fromCoords,{icon:createTransportIcon(flights[0].type),zIndexOffset:1000}).addTo(map);
  animLine = L.polyline([], {color:'#FFDAB9',weight:4,opacity:0.95}).addTo(map);

  let stepCounter = 0;
  for(let idx=0; idx<flights.length && isAnimating; idx++){
    const f = flights[idx];
    const [lat1,lon1] = f.fromCoords; const [lat2,lon2] = f.toCoords;
    animLine.setLatLngs([]);
    animLine.setStyle({color: (f.type==='train')? '#4A6B8B' : (f.type==='boat')? '#2E8B57' : '#FFDAB9'});
    animMarker.setIcon(createTransportIcon(f.type));
    // show date in short month/day format (e.g., "Aug 7") if available, otherwise show type
    const curEl = document.getElementById('currentTransport');
    if(f.date){
      try{
        const d = new Date(f.date + 'T00:00:00');
        const fmt = new Intl.DateTimeFormat('en', {month:'short', day:'numeric'});
        curEl.textContent = fmt.format(d);
      }catch(e){ curEl.textContent = (f.type||'').toUpperCase(); }
    } else { curEl.textContent = (f.type||'').toUpperCase(); }
    // do not pan or change the map view during animation; user can pan/zoom manually
    const steps = stepsPerLeg;
    const stepTime = duration/steps;
    for(let i=0;i<=steps && isAnimating;i++){
      const t = i/steps;
      const lat = lat1 + (lat2-lat1)*t;
      const lon = lon1 + (lon2-lon1)*t;
      animMarker.setLatLng([lat,lon]);
      const pts = animLine.getLatLngs(); pts.push([lat,lon]); animLine.setLatLngs(pts);
      stepCounter++;
      slider.value = Math.min(stepCounter, totalSteps);
      await sleep(stepTime);
    }
    // small pause between legs
    await sleep(300);
  }

  // animation finished or cancelled
  isAnimating = false;
  const btn = document.getElementById('playFlights'); btn.textContent = 'Play';
  // remove anim marker and line
  if(animMarker){ map.removeLayer(animMarker); animMarker=null; }
  if(animLine){ map.removeLayer(animLine); animLine=null; }
  // reset slider and transport display
  slider.value = slider.max;
  document.getElementById('currentTransport').textContent = '—';
}

function toggleFlightAnimation(){
  isAnimating = !isAnimating;
  const btn = document.getElementById('playFlights');
  if(isAnimating){
    btn.textContent = 'Stop';
    animateFlightsSequentially().catch(()=>{});
  } else {
    btn.textContent = 'Play';
    // if manually stopped, cleanup will be done in animateFlightsSequentially loop
  }
}

// no saved view — we won't change the user's map view during animation

// Authentication for edit page
function isAuthenticated(){ return sessionStorage.getItem('editAuth')==='1'; }

function showPasswordModal(message, needConfirm=false){
  return new Promise(resolve=>{
    const modal = document.getElementById('pwModal');
    const msg = document.getElementById('pwMessage');
    const input = document.getElementById('pwInput');
    const confirm = document.getElementById('pwConfirm');
    const submit = document.getElementById('pwSubmit');
    const cancel = document.getElementById('pwCancel');
    msg.textContent = message;
    input.value = '';
    confirm.value = '';
    confirm.style.display = needConfirm ? 'block' : 'none';
    modal.style.display = 'flex';
    function cleanup(){ modal.style.display='none'; submit.removeEventListener('click',onSubmit); cancel.removeEventListener('click',onCancel); }
    function onSubmit(){ const v = input.value || ''; const c = confirm.value || ''; cleanup(); resolve({ok:true,value:v,confirm:c}); }
    function onCancel(){ cleanup(); resolve({ok:false}); }
    submit.addEventListener('click', onSubmit);
    cancel.addEventListener('click', onCancel);
  });
}

async function ensureAuth(requireFresh=false){
  if(!requireFresh && isAuthenticated()) return true;
  const saved = localStorage.getItem('editPassword');
  // if there is no saved password, set the provided secret once (Travelmore10$) hashed
  if(!saved){
    const preset = 'Travelmore10$';
    const hashed = await hashString(preset);
    localStorage.setItem('editPassword', hashed);
  }
  // proceed to prompt for password entry
  // prompt for password
  const p = await showPasswordModal('Enter password to access Edit Travel Path');
  if(!p.ok) return false;
  const enteredHash = await hashString(p.value);
  const stored = localStorage.getItem('editPassword');
  if(enteredHash===stored){ sessionStorage.setItem('editAuth','1'); return true; }
  alert('Incorrect password');
  return false;
}

async function hashString(s){
  const enc = new TextEncoder().encode(s);
  const buf = await crypto.subtle.digest('SHA-256', enc);
  const arr = Array.from(new Uint8Array(buf));
  return arr.map(b=>b.toString(16).padStart(2,'0')).join('');
}

// Editor UI
const flightForm = document.getElementById('flightForm');
const flightsList = document.getElementById('flightsList');
const submitBtn = document.getElementById('submitBtn');
const cancelBtn = document.getElementById('cancelEdit');
let editingIndex = null;

function renderFlightsList(){
  const flights = loadFlights();
  flightsList.innerHTML = '';
  flights.forEach((f,idx)=>{
    const li = document.createElement('li');
    const dateLabel = f.endDate ? (`[${f.date || 'TBD'} - ${f.endDate}] `) : (f.date ? (`[${f.date}] `) : '');
    li.textContent = `${dateLabel}${f.from} → ${f.to}  (${f.type || 'flight'})`;
    const edit = document.createElement('button'); edit.textContent='Edit'; edit.style.marginLeft='8px';
    edit.addEventListener('click',()=>{ populateFormForEdit(idx); });
    const del = document.createElement('button'); del.textContent='Delete'; del.style.marginLeft='8px';
    del.addEventListener('click',()=>{ const flights = loadFlights(); flights.splice(idx,1); saveFlights(flights); renderFlightsList(); renderFlights(); });
    li.appendChild(edit);
    li.appendChild(del);
    flightsList.appendChild(li);
  });
}
renderFlightsList();

function populateFormForEdit(idx){
  const flights = loadFlights();
  const f = flights[idx];
  flightForm.elements['from'].value = f.from;
  flightForm.elements['to'].value = f.to;
  flightForm.elements['type'].value = f.type || 'flight';
  flightForm.elements['date'].value = f.date || '';
  flightForm.elements['endDate'].value = f.endDate || '';
  flightForm.elements['fromCoords'].value = f.fromCoords.join(',');
  flightForm.elements['toCoords'].value = f.toCoords.join(',');
  editingIndex = idx;
  submitBtn.textContent = 'Update';
  cancelBtn.style.display = 'inline-block';
}

cancelBtn.addEventListener('click', ()=>{
  editingIndex = null; flightForm.reset(); submitBtn.textContent='Add'; cancelBtn.style.display='none';
});

flightForm.addEventListener('submit', e=>{
  e.preventDefault();
  const fd = new FormData(flightForm);
  const from = fd.get('from').trim();
  const to = fd.get('to').trim();
  const type = fd.get('type') || 'flight';
  const date = fd.get('date') || '';
  const endDate = fd.get('endDate') || '';
  const fromCoords = fd.get('fromCoords').split(',').map(s=>parseFloat(s.trim()));
  const toCoords = fd.get('toCoords').split(',').map(s=>parseFloat(s.trim()));
  if(fromCoords.length!==2||toCoords.length!==2||fromCoords.some(isNaN)||toCoords.some(isNaN)){ alert('Please enter valid coordinates.'); return; }
  const flights = loadFlights();
  const obj = {from,to,type,date,endDate,fromCoords,toCoords};
  if(editingIndex!==null){ flights[editingIndex] = obj; editingIndex = null; submitBtn.textContent='Add'; cancelBtn.style.display='none'; }
  else { flights.push(obj); }
  saveFlights(flights);
  renderFlightsList();
  renderFlights();
  flightForm.reset();
});

// If the page loads with map hash, initialize
if(location.hash==='#map'){ showTab('map'); }

// Backup / Restore to remote server
async function backupToServer(){
  const url = prompt('Enter backup server base URL (e.g. http://localhost:3000)');
  if(!url) return;
  const key = prompt('Enter backup key');
  if(key===null) return;
  const payload = loadFlights();
  try{
    const res = await fetch(url.replace(/\/$/, '') + '/backup', {
      method: 'POST', headers: {'Content-Type':'application/json','x-backup-key': key}, body: JSON.stringify(payload)
    });
    if(res.ok) alert('Backup saved to server'); else { const txt=await res.text(); alert('Backup failed: '+txt); }
  }catch(e){ alert('Backup failed: '+e.message); }
}

async function restoreFromServer(){
  const url = prompt('Enter backup server base URL (e.g. http://localhost:3000)');
  if(!url) return;
  const key = prompt('Enter backup key');
  if(key===null) return;
  try{
    const res = await fetch(url.replace(/\/$/, '') + '/backup', {headers:{'x-backup-key': key}});
    if(!res.ok){ const txt=await res.text(); alert('Restore failed: '+txt); return; }
    const data = await res.json();
    if(!Array.isArray(data)) { alert('Restore failed: invalid data'); return; }
    localStorage.setItem('flights', JSON.stringify(data));
    renderFlights(); renderFlightsList(); renderTimeline(data);
    alert('Restore complete');
  }catch(e){ alert('Restore failed: '+e.message); }
}

// Server URL/key management (store in localStorage for editor convenience)
function getServerConfig(){
  try{ return JSON.parse(localStorage.getItem('serverConfig')||'{}'); }catch(e){ return {}; }
}
function setServerConfig(cfg){ localStorage.setItem('serverConfig', JSON.stringify(cfg||{})); updateServerInfoUI(); }
function updateServerInfoUI(){ const info = document.getElementById('serverInfo'); if(!info) return; const cfg=getServerConfig(); info.textContent = cfg.url ? (`Server: ${cfg.url}`) : 'Server: (not set)'; }

function promptServerSettings(){
  const cfg = getServerConfig()||{};
  const url = prompt('Backup server base URL', cfg.url||'http://localhost:3000');
  if(url===null) return;
  const key = prompt('Backup key (will be saved locally)', cfg.key||'');
  if(key===null) return;
  setServerConfig({url:url.replace(/\/$/,'') , key});
}

async function publishToServer(){
  const cfg = getServerConfig();
  if(!cfg || !cfg.url){ alert('Server not configured — click Server... and enter URL/key'); return; }
  const payload = loadFlights();
  try{
    const res = await fetch(cfg.url + '/publish', {method:'POST', headers:{'Content-Type':'application/json','x-backup-key':cfg.key||''}, body: JSON.stringify(payload)});
    if(res.ok) alert('Published successfully'); else { const txt=await res.text(); alert('Publish failed: '+txt); }
  }catch(e){ alert('Publish failed: '+e.message); }
}

// Postcards
const postcardForm = document.getElementById('postcardForm');
const postcardImagesInput = document.getElementById('postcardImages');
const imagePreview = document.getElementById('imagePreview');
const postcardsList = document.getElementById('postcardsList');
const postcardsEditorList = document.getElementById('postcardsEditorList');
const postcardCancelBtn = document.getElementById('postcardCancel');
const postcardCoverSelect = document.getElementById('postcardCoverSelect');
const postcardModal = document.getElementById('postcardModal');
const postcardModalClose = document.getElementById('postcardModalClose');
const postcardModalCover = document.getElementById('postcardModalCover');
const postcardModalTitle = document.getElementById('postcardModalTitle');
const postcardModalDates = document.getElementById('postcardModalDates');
const postcardModalText = document.getElementById('postcardModalText');
const postcardModalImages = document.getElementById('postcardModalImages');

const POSTCARDS_KEY = 'postcards';
const MAX_EXTRA_IMAGES = 4;

function loadPostcards(){
  const raw = localStorage.getItem(POSTCARDS_KEY);
  if(!raw) return [];
  try{
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  }catch(e){
    return [];
  }
}

function savePostcards(items){
  localStorage.setItem(POSTCARDS_KEY, JSON.stringify(items || []));
}

function formatPostcardDateRange(startDate, endDate){
  if(!startDate && !endDate) return 'Dates not set';
  if(startDate && !endDate) return formatDateLabel(startDate);
  if(!startDate && endDate) return formatDateLabel(endDate);
  return formatRangeLabel(startDate, endDate);
}

function escapeHtml(str){
  return String(str || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function renderPostcardsList(){
  if(!postcardsList) return;
  const cards = loadPostcards();
  postcardsList.innerHTML = '';
  if(cards.length===0){
    const empty = document.createElement('div');
    empty.className = 'postcards-list-empty';
    empty.textContent = 'No postcards yet.';
    postcardsList.appendChild(empty);
    return;
  }

  cards.forEach(card=>{
    const el = document.createElement('article');
    el.className = 'postcard';
    el.setAttribute('role', 'button');
    el.setAttribute('tabindex', '0');
    const title = escapeHtml(card.city || 'Unknown City');
    const cover = escapeHtml(card.coverImage || '');
    el.innerHTML = `
      <img src="${cover}" alt="${title} postcard cover">
    `;
    const open = ()=>openPostcardModal(card);
    el.addEventListener('click', open);
    el.addEventListener('keydown', (e)=>{
      if(e.key==='Enter' || e.key===' '){ e.preventDefault(); open(); }
    });
    postcardsList.appendChild(el);
  });
}

function renderPostcardsEditorList(){
  if(!postcardsEditorList) return;
  const cards = loadPostcards();
  postcardsEditorList.innerHTML = '';
  if(cards.length===0){
    const li = document.createElement('li');
    li.textContent = 'No saved postcards yet.';
    postcardsEditorList.appendChild(li);
    return;
  }

  cards.forEach((card, idx)=>{
    const li = document.createElement('li');
    li.textContent = `${card.city || 'Unknown City'} — ${formatPostcardDateRange(card.startDate, card.endDate)}`;
    const del = document.createElement('button');
    del.type = 'button';
    del.textContent = 'Delete';
    del.addEventListener('click', ()=>{
      const next = loadPostcards();
      next.splice(idx, 1);
      savePostcards(next);
      renderPostcardsEditorList();
      renderPostcardsList();
    });
    li.appendChild(del);
    postcardsEditorList.appendChild(li);
  });
}

function openPostcardModal(card){
  if(!postcardModal) return;
  postcardModalCover.src = card.coverImage || '';
  postcardModalCover.alt = `${card.city || 'Postcard'} cover`;
  postcardModalTitle.textContent = (card.city || 'Unknown City').toUpperCase();
  postcardModalDates.textContent = formatPostcardDateRange(card.startDate, card.endDate);
  postcardModalText.textContent = card.text || '';
  postcardModalImages.innerHTML = '';
  (card.images || []).forEach((src, i)=>{
    const img = document.createElement('img');
    img.src = src;
    img.alt = `${card.city || 'Postcard'} detail image ${i+1}`;
    postcardModalImages.appendChild(img);
  });
  postcardModal.style.display = 'flex';
}

function closePostcardModal(){
  if(!postcardModal) return;
  postcardModal.style.display = 'none';
}

async function fileToDataUrl(file){
  return new Promise((resolve, reject)=>{
    const reader = new FileReader();
    reader.onload = ()=>resolve(String(reader.result || ''));
    reader.onerror = ()=>reject(new Error('Failed to read image'));
    reader.readAsDataURL(file);
  });
}

async function readImagesAsDataUrls(fileList){
  const files = Array.from(fileList || []);
  const items = [];
  for(const f of files){
    const data = await fileToDataUrl(f);
    items.push(data);
  }
  return items;
}

async function loadPostcardCovers(){
  if(!postcardCoverSelect) return;
  const fallback = [
    'athenspostcard.jpg',
    'barcelonapostcard.jpg',
    'lisbonpostcard.jpg',
    'madridpostcard.jpg',
    'mykonospostcard.jpg'
  ];

  let covers = fallback;
  try{
    const res = await fetch('assets/postcards/manifest.json');
    if(res.ok){
      const parsed = await res.json();
      if(Array.isArray(parsed) && parsed.length>0) covers = parsed;
    }
  }catch(e){
    // Keep fallback list when manifest is unavailable.
  }

  postcardCoverSelect.innerHTML = '<option value="">Select cover image</option>';
  covers.forEach(name=>{
    const opt = document.createElement('option');
    opt.value = `assets/postcards/${name}`;
    opt.textContent = name;
    postcardCoverSelect.appendChild(opt);
  });
}

if(postcardImagesInput){
  postcardImagesInput.addEventListener('change', ()=>{
    const files = Array.from(postcardImagesInput.files || []);
    if(files.length > MAX_EXTRA_IMAGES){
      alert(`Please select up to ${MAX_EXTRA_IMAGES} additional images.`);
      postcardImagesInput.value = '';
      imagePreview.innerHTML = '';
      return;
    }
    imagePreview.innerHTML = '';
    files.forEach(file=>{
      const url = URL.createObjectURL(file);
      const img = document.createElement('img');
      img.src = url;
      img.alt = file.name;
      imagePreview.appendChild(img);
    });
  });
}

if(postcardCancelBtn){
  postcardCancelBtn.addEventListener('click', ()=>{
    postcardForm.reset();
    imagePreview.innerHTML = '';
  });
}

if(postcardForm){
  postcardForm.addEventListener('submit', async (e)=>{
    e.preventDefault();
    const fd = new FormData(postcardForm);
    const city = String(fd.get('city') || '').trim();
    const startDate = String(fd.get('startDate') || '').trim();
    const endDate = String(fd.get('endDate') || '').trim();
    const text = String(fd.get('text') || '').trim();
    const coverImage = String(fd.get('coverImage') || '').trim();
    const files = Array.from(postcardImagesInput.files || []);

    if(!city){ alert('City is required.'); return; }
    if(!coverImage){ alert('Please select a cover image from assets/postcards.'); return; }
    if(files.length > MAX_EXTRA_IMAGES){ alert(`Please select up to ${MAX_EXTRA_IMAGES} additional images.`); return; }
    if(startDate && endDate && new Date(endDate) < new Date(startDate)){ alert('End date must be on or after start date.'); return; }

    const extraImages = await readImagesAsDataUrls(files);
    const card = {
      id: `pc_${Date.now()}`,
      city,
      startDate,
      endDate,
      text,
      coverImage,
      images: extraImages,
      createdAt: new Date().toISOString()
    };

    const all = loadPostcards();
    all.unshift(card);
    savePostcards(all);
    postcardForm.reset();
    imagePreview.innerHTML = '';
    renderPostcardsEditorList();
    renderPostcardsList();
    alert('Postcard saved.');
  });
}

if(postcardModalClose){
  postcardModalClose.addEventListener('click', closePostcardModal);
}
if(postcardModal){
  postcardModal.addEventListener('click', (e)=>{
    if(e.target === postcardModal) closePostcardModal();
  });
}
document.addEventListener('keydown', (e)=>{
  if(e.key==='Escape' && postcardModal && postcardModal.style.display==='flex') closePostcardModal();
});

loadPostcardCovers().then(()=>{});
renderPostcardsEditorList();
renderPostcardsList();
