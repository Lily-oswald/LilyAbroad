// Basic tab routing
function showTab(tab){
  // If user wants to open the edit tab, ensure authentication first
  if(tab==='edit'){
    ensureAuth().then(ok=>{ if(ok){ activateTab(tab); } }).catch(()=>{}); return;
  }
  activateTab(tab);
}

function activateTab(tab){
  document.querySelectorAll('.tab-link').forEach(l=>l.classList.remove('active'));
  const navLink = document.querySelector('.tab-link[data-tab="'+tab+'"]');
  if(navLink) navLink.classList.add('active');
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
  const openEditorBtn = document.getElementById('openEditor');
  if(openEditorBtn){ openEditorBtn.addEventListener('click', ()=>{ showTab('edit'); }); }
}

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

async function ensureAuth(){
  if(isAuthenticated()) return true;
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
    li.textContent = `${f.date?('['+f.date+'] '):''}${f.from} → ${f.to}  (${f.type || 'flight'})`;
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
  const fromCoords = fd.get('fromCoords').split(',').map(s=>parseFloat(s.trim()));
  const toCoords = fd.get('toCoords').split(',').map(s=>parseFloat(s.trim()));
  if(fromCoords.length!==2||toCoords.length!==2||fromCoords.some(isNaN)||toCoords.some(isNaN)){ alert('Please enter valid coordinates.'); return; }
  const flights = loadFlights();
  const obj = {from,to,type,date,fromCoords,toCoords};
  if(editingIndex!==null){ flights[editingIndex] = obj; editingIndex = null; submitBtn.textContent='Add'; cancelBtn.style.display='none'; }
  else { flights.push(obj); }
  saveFlights(flights);
  renderFlightsList();
  renderFlights();
  flightForm.reset();
});

// If the page loads with map hash, initialize
if(location.hash==='#map'){ showTab('map'); }
