/* ==============================
   MEDIQUEUE - app.js
   Smart Hospital Locator System
   ============================== */

// ========== STATE ==========
const state = {
  user: null,
  appointments: [],
  reports: [],
  queueNumber: null,
  map: null,
  markers: [],
  userLat: null,
  userLng: null,
};

// ========== DOCTORS DATA ==========
const doctorsDB = {
  General:      ['Dr. A.K. Sharma', 'Dr. Priya Singh', 'Dr. Mohit Verma'],
  Cardiology:   ['Dr. R.S. Gupta', 'Dr. Neha Khanna', 'Dr. Arvind Mehta'],
  Orthopedics:  ['Dr. S.K. Jain', 'Dr. Rekha Yadav', 'Dr. Vikas Tiwari'],
  Neurology:    ['Dr. P.K. Mishra', 'Dr. Anita Roy', 'Dr. Sunil Das'],
  Pediatrics:   ['Dr. Kavita Sharma', 'Dr. Ravi Kumar', 'Dr. Meena Patel'],
  Dermatology:  ['Dr. Pooja Agarwal', 'Dr. Ajay Singh', 'Dr. Nisha Rani'],
  ENT:          ['Dr. Deepak Rao', 'Dr. Sunita Verma', 'Dr. Harish Malik'],
  Gynecology:   ['Dr. Madhuri Shah', 'Dr. Smita Joshi', 'Dr. Rekha Nair'],
};

// Sample nearby hospitals (shown when map API not available)
const sampleHospitals = [
  { name: 'Apollo Hospital', dist: '1.2 km', rating: 4.5, emergency: true  },
  { name: 'Fortis Hospital', dist: '2.1 km', rating: 4.3, emergency: true  },
  { name: 'Max Super Speciality', dist: '3.4 km', rating: 4.6, emergency: true  },
  { name: 'Kailash Hospital', dist: '1.8 km', rating: 4.1, emergency: false },
  { name: 'Metro Hospital', dist: '4.2 km', rating: 3.9, emergency: false },
  { name: 'Yatharth Hospital', dist: '2.7 km', rating: 4.2, emergency: true  },
];

// ========== AUTH ==========
function login(e) {
  e.preventDefault();
  const email = document.getElementById('login-email').value;
  const name = email.split('@')[0].replace(/\./g,' ')
               .replace(/\b\w/g, c => c.toUpperCase());
  state.user = { name, email };
  localStorage.setItem('mq_user', JSON.stringify(state.user));
  closeAuthModal();
  onUserLoaded();
  showToast(`Welcome back, ${name}!`, 'success');
}

function register(e) {
  e.preventDefault();
  const name  = document.getElementById('reg-name').value;
  const email = document.getElementById('reg-email').value;
  const phone = document.getElementById('reg-phone').value;
  state.user = { name, email, phone };
  localStorage.setItem('mq_user', JSON.stringify(state.user));
  closeAuthModal();
  onUserLoaded();
  showToast(`Account created! Welcome, ${name}!`, 'success');
}

function logout() {
  if(!confirm('Are you sure you want to logout?')) return;
  state.user = null;
  state.appointments = [];
  state.queueNumber = null;
  localStorage.clear();
  location.reload();
}

function closeAuthModal() {
  document.getElementById('auth-modal').style.display = 'none';
}

function switchAuth(tab) {
  document.getElementById('login-form').style.display    = tab === 'login'    ? 'block' : 'none';
  document.getElementById('register-form').style.display = tab === 'register' ? 'block' : 'none';
  document.getElementById('login-tab').classList.toggle('active',    tab === 'login');
  document.getElementById('register-tab').classList.toggle('active', tab === 'register');
}

function onUserLoaded() {
  if (!state.user) return;
  // Update UI with user info
  document.getElementById('dash-username').textContent = state.user.name;
  document.getElementById('profile-name-display').textContent  = state.user.name;
  document.getElementById('profile-email-display').textContent = state.user.email;
  document.getElementById('profile-name').value  = state.user.name;
  document.getElementById('profile-email').value = state.user.email;
  document.getElementById('profile-phone').value = state.user.phone || '';
  // Update avatar
  const avatarUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(state.user.name)}&background=2563eb&color=fff`;
  document.getElementById('nav-avatar').src = avatarUrl;
  document.getElementById('profile-pic').src = avatarUrl + '&size=120';
  // Load saved appointments
  const saved = localStorage.getItem('mq_appointments');
  if (saved) state.appointments = JSON.parse(saved);
  const savedReports = localStorage.getItem('mq_reports');
  if (savedReports) state.reports = JSON.parse(savedReports);
  updateDashStats();
}

// ========== NAVIGATION ==========
function showSection(name) {
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById(`section-${name}`).classList.add('active');
  document.querySelector(`[data-section="${name}"]`)?.classList.add('active');
  document.getElementById('topbar-title').textContent =
    { dashboard:'Dashboard', hospitals:'Nearby Hospitals', booking:'Book Appointment',
      appointments:'My Appointments', queue:'Queue Status', emergency:'Emergency',
      upload:'Upload Report', profile:'Profile' }[name] || name;
  // Section-specific actions
  if (name === 'appointments') renderAppointments();
  if (name === 'queue')        renderQueue();
  if (name === 'upload')       renderReports();
  // Close sidebar on mobile
  if (window.innerWidth < 900) document.getElementById('sidebar').classList.remove('open');
}

function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('open');
}

// Nav clicks
document.querySelectorAll('.nav-item').forEach(item => {
  item.addEventListener('click', e => {
    e.preventDefault();
    showSection(item.dataset.section);
  });
});

// ========== GOOGLE MAPS ==========
let map = null;

// Called by Google Maps API callback
function initMap() {
  // Map is initialized on demand when user clicks detect location
  console.log('Google Maps API loaded');
}

function detectLocation() {
  if (!navigator.geolocation) {
    showToast('Geolocation not supported by your browser', 'error');
    return;
  }
  showToast('Detecting your location...', '');
  navigator.geolocation.getCurrentPosition(
    pos => {
      state.userLat = pos.coords.latitude;
      state.userLng = pos.coords.longitude;
      loadMap(state.userLat, state.userLng);
      loadNearbyHospitals(state.userLat, state.userLng);
    },
    err => {
      showToast('Location access denied. Showing sample data.', 'warning');
      // Default to Greater Noida
      loadMap(28.4744, 77.5040);
      showSampleHospitals();
    }
  );
}

function loadMap(lat, lng) {
  const mapEl = document.getElementById('map');
  document.getElementById('map-loading').classList.add('hidden');

  // Check if Google Maps is available
  if (typeof google === 'undefined' || !google.maps) {
    // Show placeholder map with message
    mapEl.style.background = 'linear-gradient(135deg,#dbeafe,#eff6ff)';
    mapEl.style.display = 'flex';
    mapEl.style.alignItems = 'center';
    mapEl.style.justifyContent = 'center';
    mapEl.style.flexDirection = 'column';
    mapEl.style.color = '#2563eb';
    mapEl.style.fontFamily = 'Inter,sans-serif';
    mapEl.innerHTML = `
      <i class="fa-solid fa-map-location-dot" style="font-size:3rem;margin-bottom:12px"></i>
      <p style="font-weight:600;font-size:1rem">Map loaded for: ${lat.toFixed(4)}, ${lng.toFixed(4)}</p>
      <p style="font-size:0.85rem;color:#64748b;margin-top:6px">Add your Google Maps API key in index.html to enable live map</p>
    `;
    showSampleHospitals();
    return;
  }

  // Real Google Maps
  map = new google.maps.Map(mapEl, {
    center: { lat, lng },
    zoom: 14,
    styles: [
      { featureType:'poi.business', stylers:[{visibility:'off'}] },
    ]
  });

  // User location marker
  new google.maps.Marker({
    position: { lat, lng },
    map,
    title: 'Your Location',
    icon: {
      path: google.maps.SymbolPath.CIRCLE,
      scale: 10,
      fillColor: '#2563eb',
      fillOpacity: 1,
      strokeColor: '#fff',
      strokeWeight: 3,
    }
  });

  // Search for nearby hospitals using Places API
  const service = new google.maps.places.PlacesService(map);
  service.nearbySearch({
    location: { lat, lng },
    radius: 5000,
    type: 'hospital'
  }, (results, status) => {
    if (status === google.maps.places.PlacesServiceStatus.OK) {
      displayGoogleHospitals(results, lat, lng);
    } else {
      showSampleHospitals();
    }
  });
}

function displayGoogleHospitals(places, userLat, userLng) {
  const list = document.getElementById('hospital-list');
  list.innerHTML = '';
  state.markers.forEach(m => m.setMap(null));
  state.markers = [];

  places.slice(0, 10).forEach((place, i) => {
    // Map marker
    const marker = new google.maps.Marker({
      position: place.geometry.location,
      map,
      title: place.name,
      label: { text: String(i+1), color:'#fff', fontWeight:'bold' }
    });
    state.markers.push(marker);

    // Distance calc
    const dist = getDistance(
      userLat, userLng,
      place.geometry.location.lat(),
      place.geometry.location.lng()
    );

    // Info window
    const infoWin = new google.maps.InfoWindow({
      content: `<div style="font-family:Inter,sans-serif;padding:8px">
        <b>${place.name}</b><br>
        <small>${place.vicinity}</small><br>
        <small>⭐ ${place.rating || 'N/A'} &nbsp; 📍 ${dist} km</small>
      </div>`
    });
    marker.addListener('click', () => infoWin.open(map, marker));

    // List item
    list.insertAdjacentHTML('beforeend', hospitalItemHTML(place.name, `${dist} km`, place.rating));
  });
}

function showSampleHospitals() {
  const list = document.getElementById('hospital-list');
  list.innerHTML = '';
  sampleHospitals.forEach(h => {
    list.insertAdjacentHTML('beforeend', hospitalItemHTML(h.name, h.dist, h.rating, h.emergency));
  });
}

function hospitalItemHTML(name, dist, rating, emergency=false) {
  return `
    <div class="hospital-item">
      <div class="hosp-icon">
        <i class="fa-solid fa-hospital-user"></i>
      </div>
      <div>
        <div class="hosp-name">${name} ${emergency ? '<span style="color:#ef4444;font-size:0.75rem;">🚨 Emergency</span>' : ''}</div>
        <div class="hosp-dist">📍 ${dist} &nbsp; ⭐ ${rating || 'N/A'}</div>
      </div>
      <div class="hosp-actions">
        <button class="btn btn-secondary" onclick="showSection('booking');setHospital('${name}')">
          <i class="fa-solid fa-calendar-plus"></i> Book
        </button>
        <button class="btn btn-primary" onclick="getDirections('${name}')">
          <i class="fa-solid fa-diamond-turn-right"></i> Route
        </button>
      </div>
    </div>`;
}

function searchLocation() {
  const q = document.getElementById('search-location').value.trim();
  if (!q) return;
  if (typeof google === 'undefined') {
    showToast('Map not available. Add Google Maps API key.', 'warning');
    showSampleHospitals();
    return;
  }
  const geo = new google.maps.Geocoder();
  geo.geocode({ address: q }, (results, status) => {
    if (status === 'OK') {
      const loc = results[0].geometry.location;
      loadMap(loc.lat(), loc.lng());
    } else {
      showToast('Location not found. Try again.', 'error');
    }
  });
}

function setHospital(name) {
  document.getElementById('appt-hospital').value = name;
}

function getDirections(name) {
  const q = encodeURIComponent(name);
  window.open(`https://www.google.com/maps/search/${q}`, '_blank');
}

function getDistance(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2-lat1) * Math.PI/180;
  const dLng = (lng2-lng1) * Math.PI/180;
  const a = Math.sin(dLat/2)**2 +
            Math.cos(lat1*Math.PI/180) * Math.cos(lat2*Math.PI/180) * Math.sin(dLng/2)**2;
  return (R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))).toFixed(1);
}

// ========== APPOINTMENT BOOKING ==========
function loadDoctors() {
  const dept = document.getElementById('appt-dept').value;
  const sel  = document.getElementById('appt-doctor');
  sel.innerHTML = '<option value="">-- Choose Doctor --</option>';
  if (dept && doctorsDB[dept]) {
    doctorsDB[dept].forEach(d => {
      sel.insertAdjacentHTML('beforeend', `<option>${d}</option>`);
    });
  }
}

function bookAppointment(e) {
  e.preventDefault();
  if (!state.user) { showToast('Please login first', 'error'); return; }

  const hospital = document.getElementById('appt-hospital').value;
  const dept     = document.getElementById('appt-dept').value;
  const doctor   = document.getElementById('appt-doctor').value;
  const date     = document.getElementById('appt-date').value;
  const time     = document.getElementById('appt-time').value;
  const symptoms = document.getElementById('appt-symptoms').value;

  // Auto-assign queue number
  const qNum = Math.floor(Math.random() * 40) + 5;
  const wait  = qNum * 8; // 8 min per patient

  const appt = {
    id: Date.now(),
    hospital, dept, doctor, date, time, symptoms,
    status: 'upcoming',
    queueNumber: qNum,
    waitTime: wait,
    bookedAt: new Date().toISOString()
  };

  state.appointments.unshift(appt);
  state.queueNumber = qNum;
  localStorage.setItem('mq_appointments', JSON.stringify(state.appointments));
  updateDashStats();
  updateQueueBoard(qNum);

  // Show success
  document.getElementById('success-title').textContent = 'Appointment Confirmed! 🎉';
  document.getElementById('success-msg').textContent =
    `Dr. ${doctor} at ${hospital} on ${formatDate(date)} at ${time}`;
  document.getElementById('queue-ticket').innerHTML = `
    <div>Your Queue Number</div>
    <div class="ticket-num">${String(qNum).padStart(3,'0')}</div>
    <div style="font-size:0.85rem;margin-top:8px">Est. wait: ~${wait} mins</div>
  `;
  document.getElementById('success-modal').style.display = 'flex';

  // Reset form
  e.target.reset();
  document.getElementById('appt-doctor').innerHTML = '<option value="">-- Select Department First --</option>';

  showToast('Appointment booked successfully!', 'success');
  document.getElementById('stat-queue').textContent = `#${qNum}`;
}

// ========== RENDER APPOINTMENTS ==========
function renderAppointments(filter='all') {
  const list = document.getElementById('appointments-list');
  let appts = state.appointments;
  if (filter !== 'all') appts = appts.filter(a => a.status === filter);

  if (appts.length === 0) {
    list.innerHTML = `<div class="empty-state">
      <i class="fa-solid fa-calendar-xmark"></i>
      <p>No ${filter === 'all' ? '' : filter} appointments found.</p>
      <button class="btn btn-primary mt-10" onclick="showSection('booking')">Book Now</button>
    </div>`;
    return;
  }

  list.innerHTML = appts.map(a => `
    <div class="appt-card" id="appt-${a.id}">
      <div class="appt-icon"><i class="fa-solid fa-stethoscope"></i></div>
      <div class="appt-info">
        <div class="appt-hospital">${a.hospital}</div>
        <div class="appt-detail">
          ${a.doctor} &bull; ${a.dept} &bull; ${formatDate(a.date)} at ${a.time}
        </div>
        <div class="appt-detail" style="margin-top:4px">
          Queue: <b>#${String(a.queueNumber).padStart(3,'0')}</b> &bull;
          Est. wait: <b>~${a.waitTime} mins</b>
        </div>
      </div>
      <span class="appt-status status-${a.status}">${a.status}</span>
      <div class="appt-actions">
        ${a.status === 'upcoming' ? `
          <button class="btn btn-success" onclick="markCompleted(${a.id})">Done</button>
          <button class="btn btn-danger"  onclick="cancelAppt(${a.id})">Cancel</button>
        ` : ''}
      </div>
    </div>
  `).join('');

  // Update recent on dashboard
  const recent = document.getElementById('recent-appointments');
  const latest = state.appointments.slice(0,3);
  if (latest.length > 0) {
    recent.innerHTML = latest.map(a => `
      <div class="appt-card" style="margin-bottom:10px">
        <div class="appt-icon"><i class="fa-solid fa-stethoscope"></i></div>
        <div class="appt-info">
          <div class="appt-hospital">${a.hospital}</div>
          <div class="appt-detail">${a.doctor} &bull; ${formatDate(a.date)} at ${a.time}</div>
        </div>
        <span class="appt-status status-${a.status}">${a.status}</span>
      </div>
    `).join('');
  }
}

function filterAppts(filter, btn) {
  document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderAppointments(filter);
}

function markCompleted(id) {
  const a = state.appointments.find(a => a.id === id);
  if (a) { a.status = 'completed'; saveAndRender(); }
}

function cancelAppt(id) {
  if(!confirm('Cancel this appointment?')) return;
  const a = state.appointments.find(a => a.id === id);
  if (a) { a.status = 'cancelled'; saveAndRender(); }
}

function saveAndRender() {
  localStorage.setItem('mq_appointments', JSON.stringify(state.appointments));
  renderAppointments();
  updateDashStats();
}

// ========== QUEUE ==========
function renderQueue() {
  const div = document.getElementById('queue-display');
  const upcoming = state.appointments.filter(a => a.status === 'upcoming');

  if (upcoming.length === 0) {
    div.innerHTML = `<div class="empty-state">
      <i class="fa-solid fa-list-ol"></i>
      <p>Book an appointment to get a queue number</p>
      <button class="btn btn-primary mt-10" onclick="showSection('booking')">Book Appointment</button>
    </div>`;
    return;
  }

  const latest = upcoming[0];
  div.innerHTML = `
    <div class="my-queue-card">
      <div class="my-queue-label">Your Queue Number</div>
      <div class="my-queue-num">${String(latest.queueNumber).padStart(3,'0')}</div>
      <div class="my-queue-label" style="margin-top:8px">${latest.hospital} &bull; ${latest.doctor}</div>
      <div class="my-queue-wait">
        <i class="fa-solid fa-clock"></i>
        Estimated waiting time: <b>~${latest.waitTime} minutes</b>
        <br><small style="opacity:0.8">Position in queue: ${latest.queueNumber}</small>
      </div>
    </div>
  `;
  updateQueueBoard(latest.queueNumber);
}

function updateQueueBoard(myNum) {
  const serving = Math.max(1, myNum - Math.floor(Math.random()*5) - 3);
  document.getElementById('board-serving').textContent = String(serving).padStart(3,'0');
  document.getElementById('board-next').textContent    = String(serving+1).padStart(3,'0');
  document.getElementById('board-waiting').textContent = myNum - serving;
  document.getElementById('stat-queue').textContent    = `#${myNum}`;
}

// Auto-update queue every 30 seconds
setInterval(() => {
  const upcoming = state.appointments.filter(a => a.status === 'upcoming');
  if (upcoming.length > 0 && upcoming[0].waitTime > 0) {
    upcoming[0].waitTime = Math.max(0, upcoming[0].waitTime - 1);
    localStorage.setItem('mq_appointments', JSON.stringify(state.appointments));
    updateQueueBoard(upcoming[0].queueNumber);
  }
}, 30000);

// ========== EMERGENCY ==========
function triggerEmergency() {
  const btn = document.getElementById('sos-btn');
  btn.classList.remove('pulse');
  btn.classList.add('activated');
  btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i><span>CONNECTING...</span>`;

  showToast('🚨 Emergency triggered! Finding nearest hospital...', 'error');

  setTimeout(() => {
    btn.innerHTML = `<i class="fa-solid fa-circle-check"></i><span>HELP COMING</span><small>Ambulance dispatched</small>`;

    // Show nearest emergency hospital
    const nearest = sampleHospitals.filter(h => h.emergency)[0];
    const infoDiv = document.getElementById('emergency-hospital-info');
    const detDiv  = document.getElementById('emergency-hospital-details');
    infoDiv.style.display = 'block';
    detDiv.innerHTML = `
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:14px;margin-top:10px">
        <div class="report-info-item">
          <div class="report-info-label">Hospital</div>
          <div class="report-info-value">${nearest.name}</div>
        </div>
        <div class="report-info-item">
          <div class="report-info-label">Distance</div>
          <div class="report-info-value">${nearest.dist}</div>
        </div>
        <div class="report-info-item">
          <div class="report-info-label">ETA (Ambulance)</div>
          <div class="report-info-value">~8 minutes</div>
        </div>
      </div>
      <div style="margin-top:14px;padding:14px;background:#fef2f2;border-radius:10px;border:1px solid #fca5a5">
        <b style="color:#ef4444">Priority Queue Assigned</b>
        <p style="font-size:0.9rem;color:#64748b;margin-top:4px">
          You have been assigned <b>Priority #001</b> in the emergency queue at ${nearest.name}.
          Please stay calm and wait for the ambulance.
        </p>
      </div>
    `;
    showToast('Ambulance dispatched! ETA ~8 minutes', 'success');

    // Add emergency appointment
    const emergencyAppt = {
      id: Date.now(),
      hospital: nearest.name,
      dept: 'Emergency',
      doctor: 'Emergency Team',
      date: new Date().toISOString().split('T')[0],
      time: new Date().toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}),
      symptoms: 'EMERGENCY',
      status: 'upcoming',
      queueNumber: 1,
      waitTime: 8,
      bookedAt: new Date().toISOString(),
      isEmergency: true
    };
    state.appointments.unshift(emergencyAppt);
    localStorage.setItem('mq_appointments', JSON.stringify(state.appointments));
    updateDashStats();
  }, 2000);
}

// ========== UPLOAD REPORT ==========
function dragOver(e) {
  e.preventDefault();
  document.getElementById('upload-zone').classList.add('dragover');
}
function dragLeave(e) {
  document.getElementById('upload-zone').classList.remove('dragover');
}
function dropFile(e) {
  e.preventDefault();
  document.getElementById('upload-zone').classList.remove('dragover');
  const file = e.dataTransfer.files[0];
  if (file) processFile(file);
}
function handleFileUpload(e) {
  const file = e.target.files[0];
  if (file) processFile(file);
}

function processFile(file) {
  // Validate
  const allowed = ['application/pdf','image/jpeg','image/png','image/jpg'];
  if (!allowed.includes(file.type)) {
    showToast('Only PDF, JPG, PNG files allowed!', 'error'); return;
  }
  if (file.size > 10 * 1024 * 1024) {
    showToast('File too large! Max 10MB allowed.', 'error'); return;
  }

  showToast('Analyzing report...', '');

  // Simulate AI extraction after 1.5 seconds
  setTimeout(() => {
    const extractedInfo = simulateExtraction(file.name);
    showExtractedInfo(extractedInfo);

    // Save to reports list
    const report = {
      id: Date.now(),
      name: file.name,
      size: (file.size/1024).toFixed(1) + ' KB',
      type: file.type,
      uploadedAt: new Date().toISOString(),
      extracted: extractedInfo
    };
    state.reports.unshift(report);
    localStorage.setItem('mq_reports', JSON.stringify(state.reports));
    updateDashStats();
    renderReports();
    showToast('Report uploaded and analyzed!', 'success');
  }, 1500);
}

function simulateExtraction(filename) {
  // Simulated AI extraction result
  const names    = ['Anurag Tiwari','Rohit Kumar','Priya Sharma','Manvi Goyal'];
  const issues   = ['Hypertension','Diabetes Type 2','Viral Fever','Back Pain','Migraine'];
  const doctors  = ['Dr. A.K. Sharma (General)','Dr. R.S. Gupta (Cardiology)',
                    'Dr. Priya Singh (General)','Dr. S.K. Jain (Orthopedics)'];
  const bloodGrp = ['A+','B+','O+','AB+','O-'];
  const ages     = ['21','25','30','35','42','28'];

  return {
    'Patient Name': names[Math.floor(Math.random()*names.length)],
    'Age':          ages[Math.floor(Math.random()*ages.length)],
    'Blood Group':  bloodGrp[Math.floor(Math.random()*bloodGrp.length)],
    'Detected Issue': issues[Math.floor(Math.random()*issues.length)],
    'Suggested Doctor': doctors[Math.floor(Math.random()*doctors.length)],
    'Report Date':  new Date().toLocaleDateString('en-IN'),
  };
}

function showExtractedInfo(info) {
  const div = document.getElementById('report-info');
  div.innerHTML = Object.entries(info).map(([k,v]) => `
    <div class="report-info-item">
      <div class="report-info-label">${k}</div>
      <div class="report-info-value">${v}</div>
    </div>
  `).join('');
  document.getElementById('report-result').style.display = 'block';
}

function renderReports() {
  const div = document.getElementById('reports-list');
  if (state.reports.length === 0) {
    div.innerHTML = `<div class="empty-state">
      <i class="fa-solid fa-folder-open"></i><p>No reports uploaded yet</p>
    </div>`;
    return;
  }
  div.innerHTML = state.reports.map(r => `
    <div class="report-list-item">
      <i class="fa-solid ${r.type==='application/pdf' ? 'fa-file-pdf' : 'fa-file-image'}"
         style="color:${r.type==='application/pdf' ? '#ef4444' : '#2563eb'}"></i>
      <div class="report-meta">
        <div class="report-name">${r.name}</div>
        <div class="report-date">${formatDate(r.uploadedAt.split('T')[0])} &bull; ${r.size}</div>
      </div>
      <div style="font-size:0.8rem;color:#16a34a;font-weight:600">
        <i class="fa-solid fa-circle-check"></i> Analyzed
      </div>
    </div>
  `).join('');
}

// ========== PROFILE ==========
function saveProfile(e) {
  e.preventDefault();
  const name  = document.getElementById('profile-name').value;
  const email = document.getElementById('profile-email').value;
  const phone = document.getElementById('profile-phone').value;
  state.user = { ...state.user, name, email, phone };
  localStorage.setItem('mq_user', JSON.stringify(state.user));
  document.getElementById('profile-name-display').textContent  = name;
  document.getElementById('profile-email-display').textContent = email;
  document.getElementById('dash-username').textContent = name;
  const avatarUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=2563eb&color=fff`;
  document.getElementById('nav-avatar').src = avatarUrl;
  document.getElementById('profile-pic').src = avatarUrl + '&size=120';
  showToast('Profile saved successfully!', 'success');
}

// ========== UTILS ==========
function updateDashStats() {
  document.getElementById('stat-appointments').textContent = state.appointments.length;
  document.getElementById('stat-reports').textContent      = state.reports.length;
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' });
}

function showToast(msg, type='') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className   = `toast ${type} show`;
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove('show'), 3500);
}

function closeSuccessModal() {
  document.getElementById('success-modal').style.display = 'none';
}

// ========== SET MIN DATE FOR BOOKING ==========
function setMinDate() {
  const today = new Date().toISOString().split('T')[0];
  const dateInput = document.getElementById('appt-date');
  if (dateInput) dateInput.min = today;
}

// ========== INIT ==========
window.addEventListener('DOMContentLoaded', () => {
  setMinDate();

  // Load saved user
  const saved = localStorage.getItem('mq_user');
  if (saved) {
    state.user = JSON.parse(saved);
    document.getElementById('auth-modal').style.display = 'none';
    onUserLoaded();
  }
  // Initial renders
  renderAppointments();
});

// Close sidebar on outside click (mobile)
document.querySelector('.main-content').addEventListener('click', () => {
  if (window.innerWidth < 900) {
    document.getElementById('sidebar').classList.remove('open');
  }
});
