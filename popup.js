// Movebank API Configuration
const MOVEBANK_API = 'https://www.movebank.org/movebank/service/direct-read';

// State management
let currentUser = null;
let currentCredentials = null;
let studies = [];
let favorites = [];
let selectedStudy = null;
let selectedAnimal = null;

// Initialize the extension
document.addEventListener('DOMContentLoaded', init);

async function init() {
  // Check if user is already logged in
  const stored = await chrome.storage.local.get(['credentials', 'favorites']);
  
  if (stored.credentials) {
    currentCredentials = stored.credentials;
    showDashboard();
    loadStudies();
  } else {
    showLoginScreen();
  }

  if (stored.favorites) {
    favorites = stored.favorites;
  }

  setupEventListeners();
}

function setupEventListeners() {
  // Login
  document.getElementById('loginBtn').addEventListener('click', handleLogin);

  // Logout
  document.getElementById('logoutBtn').addEventListener('click', handleLogout);

  // Tabs
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  // Studies
  document.getElementById('refreshStudies').addEventListener('click', loadStudies);
  document.getElementById('studySearch').addEventListener('input', filterStudies);

  // Map
  document.getElementById('mapStudySelect').addEventListener('change', handleStudySelect);
  document.getElementById('mapAnimalSelect').addEventListener('change', handleAnimalSelect);
  document.getElementById('loadMapData').addEventListener('click', loadTrackingData);

  // Settings
  document.getElementById('autoRefresh').addEventListener('change', handleAutoRefresh);
  document.getElementById('showNotifications').addEventListener('change', handleNotifications);

  // Modal
  document.querySelector('.close').addEventListener('click', () => {
    document.getElementById('animalModal').classList.remove('show');
  });
}

async function handleLogin() {
  const username = document.getElementById('username').value.trim();
  const password = document.getElementById('password').value;
  const errorDiv = document.getElementById('loginError');

  if (!username || !password) {
    showError('Please enter both username and password');
    return;
  }

  errorDiv.textContent = '';
  const loginBtn = document.getElementById('loginBtn');
  loginBtn.textContent = 'Starting...';
  loginBtn.disabled = true;

  try {
    // Test credentials by fetching studies
    const credentials = btoa(`${username}:${password}`);
    const response = await fetch(`${MOVEBANK_API}?entity_type=study`, {
      headers: {
        'Authorization': `Basic ${credentials}`
      }
    });

    if (response.ok) {
      currentCredentials = credentials;
      await chrome.storage.local.set({ credentials });
      showDashboard();
      loadStudies();
    } else {
      throw new Error('Invalid credentials');
    }
  } catch (error) {
    showError('Failed to connect. Please try again.');
    loginBtn.textContent = 'Start';
    loginBtn.disabled = false;
  }
}

function showError(message) {
  const errorDiv = document.getElementById('loginError');
  errorDiv.textContent = message;
  errorDiv.classList.add('show');
  setTimeout(() => errorDiv.classList.remove('show'), 5000);
}

async function handleLogout() {
  await chrome.storage.local.remove('credentials');
  currentCredentials = null;
  studies = [];
  showLoginScreen();
}

function showLoginScreen() {
  document.getElementById('loginScreen').style.display = 'flex';
  document.getElementById('dashboard').style.display = 'none';
}

function showDashboard() {
  document.getElementById('loginScreen').style.display = 'none';
  document.getElementById('dashboard').style.display = 'flex';
}

function switchTab(tabName) {
  // Update tab buttons
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tabName);
  });

  // Update tab content
  document.querySelectorAll('.tab-content').forEach(content => {
    content.classList.remove('active');
  });
  document.getElementById(`${tabName}Tab`).classList.add('active');

  // Load tab-specific data
  if (tabName === 'favorites') {
    displayFavorites();
  }
}

async function loadStudies() {
  const loadingDiv = document.getElementById('studiesLoading');
  const listDiv = document.getElementById('studiesList');
  
  loadingDiv.style.display = 'block';
  listDiv.innerHTML = '';

  try {
    const response = await fetch(`${MOVEBANK_API}?entity_type=study`, {
      headers: {
        'Authorization': `Basic ${currentCredentials}`
      }
    });

    if (!response.ok) throw new Error('Failed to fetch studies');

    const text = await response.text();
    studies = parseCSV(text);
    
    displayStudies(studies);
    populateStudySelect(studies);
  } catch (error) {
    listDiv.innerHTML = '<p class="empty-state">Failed to load studies. Please try again.</p>';
  } finally {
    loadingDiv.style.display = 'none';
  }
}

function parseCSV(text) {
  const lines = text.trim().split('\n');
  if (lines.length < 2) return [];
  
  const headers = lines[0].split(',').map(h => h.trim());
  const data = [];
  
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',');
    const obj = {};
    headers.forEach((header, index) => {
      obj[header] = values[index] ? values[index].trim() : '';
    });
    data.push(obj);
  }
  
  return data;
}

function displayStudies(studiesList) {
  const listDiv = document.getElementById('studiesList');
  listDiv.innerHTML = '';

  if (studiesList.length === 0) {
    listDiv.innerHTML = '<p class="empty-state">No studies found</p>';
    return;
  }

  studiesList.forEach(study => {
    const card = createStudyCard(study);
    listDiv.appendChild(card);
  });
}

function createStudyCard(study) {
  const card = document.createElement('div');
  card.className = 'study-card';
  
  const isFavorite = favorites.includes(study.id);
  
  card.innerHTML = `
    <button class="star-btn ${isFavorite ? 'favorited' : ''}" data-id="${study.id}">
      ${isFavorite ? '⭐' : '☆'}
    </button>
    <h3>${study.name || 'Unnamed Study'}</h3>
    <p><strong>PI:</strong> ${study.principal_investigator_name || 'N/A'}</p>
    <p><strong>License:</strong> ${study.license_type || 'N/A'}</p>
    <p class="study-id">ID: ${study.id}</p>
  `;

  // Star button
  const starBtn = card.querySelector('.star-btn');
  starBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleFavorite(study.id);
    starBtn.classList.toggle('favorited');
    starBtn.textContent = starBtn.classList.contains('favorited') ? '⭐' : '☆';
  });

  // Card click - load animals
  card.addEventListener('click', () => loadAnimals(study));

  return card;
}

async function toggleFavorite(studyId) {
  const index = favorites.indexOf(studyId);
  if (index > -1) {
    favorites.splice(index, 1);
  } else {
    favorites.push(studyId);
  }
  await chrome.storage.local.set({ favorites });
}

function displayFavorites() {
  const listDiv = document.getElementById('favoritesList');
  const favoriteStudies = studies.filter(s => favorites.includes(s.id));
  
  if (favoriteStudies.length === 0) {
    listDiv.innerHTML = '<p class="empty-state">No favorites yet. Star studies to add them here!</p>';
    return;
  }
  
  listDiv.innerHTML = '';
  favoriteStudies.forEach(study => {
    const card = createStudyCard(study);
    listDiv.appendChild(card);
  });
}

async function loadAnimals(study) {
  const card = event.currentTarget;
  
  // Check if already loaded
  if (card.querySelector('.animal-list')) {
    card.querySelector('.animal-list').remove();
    return;
  }

  const animalList = document.createElement('div');
  animalList.className = 'animal-list';
  animalList.innerHTML = '<div class="loading"><div class="spinner"></div></div>';
  card.appendChild(animalList);

  try {
    const response = await fetch(
      `${MOVEBANK_API}?entity_type=individual&study_id=${study.id}`,
      {
        headers: {
          'Authorization': `Basic ${currentCredentials}`
        }
      }
    );

    if (!response.ok) throw new Error('Failed to fetch animals');

    const text = await response.text();
    const animals = parseCSV(text);

    animalList.innerHTML = '';
    
    if (animals.length === 0) {
      animalList.innerHTML = '<p style="padding: 8px; font-size: 12px; color: #999;">No animals found</p>';
      return;
    }

    animals.slice(0, 10).forEach(animal => {
      const item = document.createElement('div');
      item.className = 'animal-item';
      item.innerHTML = `
        <span>${animal.local_identifier || animal.individual_local_identifier || 'Unknown'}</span>
        <span class="badge">${animal.taxon_canonical_name || 'Unknown species'}</span>
      `;
      item.addEventListener('click', (e) => {
        e.stopPropagation();
        showAnimalDetails(study, animal);
      });
      animalList.appendChild(item);
    });

    if (animals.length > 10) {
      const more = document.createElement('p');
      more.style.cssText = 'padding: 8px; font-size: 12px; color: #999; text-align: center;';
      more.textContent = `+ ${animals.length - 10} more animals`;
      animalList.appendChild(more);
    }
  } catch (error) {
    animalList.innerHTML = '<p style="padding: 8px; font-size: 12px; color: #c33;">Failed to load animals</p>';
  }
}

function showAnimalDetails(study, animal) {
  const modal = document.getElementById('animalModal');
  const details = document.getElementById('animalDetails');
  
  details.innerHTML = `
    <h2>${animal.local_identifier || animal.individual_local_identifier || 'Unknown Animal'}</h2>
    <div class="settings-section">
      <h3>Basic Information</h3>
      <div class="stat-item">
        <span class="stat-label">Species:</span>
        <span class="stat-value">${animal.taxon_canonical_name || 'Unknown'}</span>
      </div>
      <div class="stat-item">
        <span class="stat-label">Sex:</span>
        <span class="stat-value">${animal.animal_sex || 'Unknown'}</span>
      </div>
      <div class="stat-item">
        <span class="stat-label">Study:</span>
        <span class="stat-value">${study.name}</span>
      </div>
      <div class="stat-item">
        <span class="stat-label">Individual ID:</span>
        <span class="stat-value">${animal.id}</span>
      </div>
    </div>
    <button class="btn btn-primary" onclick="viewOnMap('${study.id}', '${animal.id}', '${animal.local_identifier || animal.individual_local_identifier}')">
      View Tracking Data
    </button>
  `;
  
  modal.classList.add('show');
}

window.viewOnMap = function(studyId, animalId, animalName) {
  document.getElementById('animalModal').classList.remove('show');
  switchTab('map');
  
  // Set the selects
  document.getElementById('mapStudySelect').value = studyId;
  selectedStudy = studyId;
  
  // Load animals for this study then select the animal
  loadAnimalsForMap(studyId, animalId, animalName);
};

function populateStudySelect(studiesList) {
  const select = document.getElementById('mapStudySelect');
  select.innerHTML = '<option value="">Select a study...</option>';
  
  studiesList.forEach(study => {
    const option = document.createElement('option');
    option.value = study.id;
    option.textContent = study.name || `Study ${study.id}`;
    select.appendChild(option);
  });
}

async function handleStudySelect(e) {
  const studyId = e.target.value;
  selectedStudy = studyId;
  
  const animalSelect = document.getElementById('mapAnimalSelect');
  const loadBtn = document.getElementById('loadMapData');
  
  if (!studyId) {
    animalSelect.disabled = true;
    animalSelect.innerHTML = '<option value="">Select an animal...</option>';
    loadBtn.disabled = true;
    return;
  }

  loadAnimalsForMap(studyId);
}

async function loadAnimalsForMap(studyId, preselectedId = null, preselectedName = null) {
  const animalSelect = document.getElementById('mapAnimalSelect');
  const loadBtn = document.getElementById('loadMapData');
  
  animalSelect.disabled = true;
  animalSelect.innerHTML = '<option value="">Loading...</option>';
  
  try {
    const response = await fetch(
      `${MOVEBANK_API}?entity_type=individual&study_id=${studyId}`,
      {
        headers: {
          'Authorization': `Basic ${currentCredentials}`
        }
      }
    );

    if (!response.ok) throw new Error('Failed to fetch animals');

    const text = await response.text();
    const animals = parseCSV(text);

    animalSelect.innerHTML = '<option value="">Select an animal...</option>';
    animals.forEach(animal => {
      const option = document.createElement('option');
      option.value = animal.id;
      option.textContent = animal.local_identifier || animal.individual_local_identifier || `Animal ${animal.id}`;
      animalSelect.appendChild(option);
    });
    
    animalSelect.disabled = false;
    
    if (preselectedId) {
      animalSelect.value = preselectedId;
      selectedAnimal = preselectedId;
      loadBtn.disabled = false;
      loadTrackingData();
    }
  } catch (error) {
    animalSelect.innerHTML = '<option value="">Failed to load animals</option>';
  }
}

function handleAnimalSelect(e) {
  selectedAnimal = e.target.value;
  document.getElementById('loadMapData').disabled = !selectedAnimal;
}

async function loadTrackingData() {
  if (!selectedStudy || !selectedAnimal) return;

  const mapContainer = document.getElementById('mapContainer');
  const statsPanel = document.getElementById('trackStats');
  const maxPoints = document.getElementById('maxPoints').value;
  
  mapContainer.innerHTML = '<div class="loading"><div class="spinner"></div><p>Loading tracking data...</p></div>';
  statsPanel.style.display = 'none';

  try {
    const response = await fetch(
      `${MOVEBANK_API}?entity_type=event&study_id=${selectedStudy}&individual_id=${selectedAnimal}&attributes=timestamp,location_long,location_lat,visible&max_events_per_individual=${maxPoints}`,
      {
        headers: {
          'Authorization': `Basic ${currentCredentials}`
        }
      }
    );

    if (!response.ok) throw new Error('Failed to fetch tracking data');

    const text = await response.text();
    const events = parseCSV(text);
    
    // Filter visible events
    const validEvents = events.filter(e => 
      e.location_long && e.location_lat && e.visible !== 'false'
    );

    if (validEvents.length === 0) {
      mapContainer.innerHTML = '<div class="map-placeholder"><p>No tracking data available</p></div>';
      return;
    }

    renderMap(validEvents);
    displayStats(validEvents);
  } catch (error) {
    mapContainer.innerHTML = '<div class="map-placeholder"><p>Failed to load tracking data</p></div>';
  }
}

function renderMap(events) {
  const mapContainer = document.getElementById('mapContainer');
  
  // Calculate bounds
  const lats = events.map(e => parseFloat(e.location_lat));
  const longs = events.map(e => parseFloat(e.location_long));
  
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLong = Math.min(...longs);
  const maxLong = Math.max(...longs);
  
  // Create SVG map
  const width = mapContainer.clientWidth;
  const height = 300;
  
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', width);
  svg.setAttribute('height', height);
  svg.style.background = '#f0f8ff';
  
  // Scale functions
  const scaleX = (long) => ((long - minLong) / (maxLong - minLong)) * (width - 40) + 20;
  const scaleY = (lat) => ((maxLat - lat) / (maxLat - minLat)) * (height - 40) + 20;
  
  // Draw path
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  let d = `M ${scaleX(parseFloat(events[0].location_long))} ${scaleY(parseFloat(events[0].location_lat))}`;
  
  for (let i = 1; i < events.length; i++) {
    const x = scaleX(parseFloat(events[i].location_long));
    const y = scaleY(parseFloat(events[i].location_lat));
    d += ` L ${x} ${y}`;
  }
  
  path.setAttribute('d', d);
  path.setAttribute('class', 'track-line');
  svg.appendChild(path);
  
  // Draw points
  events.forEach((event, i) => {
    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('cx', scaleX(parseFloat(event.location_long)));
    circle.setAttribute('cy', scaleY(parseFloat(event.location_lat)));
    circle.setAttribute('r', i === 0 ? 6 : i === events.length - 1 ? 6 : 3);
    circle.setAttribute('fill', i === 0 ? '#4CAF50' : i === events.length - 1 ? '#f44336' : '#667eea');
    circle.setAttribute('stroke', 'white');
    circle.setAttribute('stroke-width', '2');
    
    // Tooltip
    const title = document.createElementNS('http://www.w3.org/2000/svg', 'title');
    title.textContent = `${event.timestamp || 'Unknown time'}\nLat: ${event.location_lat}, Long: ${event.location_long}`;
    circle.appendChild(title);
    
    svg.appendChild(circle);
  });
  
  mapContainer.innerHTML = '';
  mapContainer.appendChild(svg);
}

function displayStats(events) {
  const statsPanel = document.getElementById('trackStats');
  
  const startDate = new Date(events[0].timestamp);
  const endDate = new Date(events[events.length - 1].timestamp);
  const duration = (endDate - startDate) / (1000 * 60 * 60 * 24);
  
  // Calculate total distance (simplified)
  let totalDistance = 0;
  for (let i = 1; i < events.length; i++) {
    const lat1 = parseFloat(events[i-1].location_lat);
    const lon1 = parseFloat(events[i-1].location_long);
    const lat2 = parseFloat(events[i].location_lat);
    const lon2 = parseFloat(events[i].location_long);
    totalDistance += calculateDistance(lat1, lon1, lat2, lon2);
  }
  
  statsPanel.innerHTML = `
    <h3 style="margin-bottom: 10px;">Tracking Statistics</h3>
    <div class="stat-item">
      <span class="stat-label">Total Points:</span>
      <span class="stat-value">${events.length}</span>
    </div>
    <div class="stat-item">
      <span class="stat-label">Start Date:</span>
      <span class="stat-value">${startDate.toLocaleDateString()}</span>
    </div>
    <div class="stat-item">
      <span class="stat-label">End Date:</span>
      <span class="stat-value">${endDate.toLocaleDateString()}</span>
    </div>
    <div class="stat-item">
      <span class="stat-label">Duration:</span>
      <span class="stat-value">${duration.toFixed(0)} days</span>
    </div>
    <div class="stat-item">
      <span class="stat-label">Total Distance:</span>
      <span class="stat-value">${totalDistance.toFixed(0)} km</span>
    </div>
  `;
  
  statsPanel.classList.add('show');
}

function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth's radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

function filterStudies() {
  const query = document.getElementById('studySearch').value.toLowerCase();
  const filtered = studies.filter(s => 
    (s.name && s.name.toLowerCase().includes(query)) ||
    (s.principal_investigator_name && s.principal_investigator_name.toLowerCase().includes(query))
  );
  displayStudies(filtered);
}

function handleAutoRefresh(e) {
  if (e.target.checked) {
    chrome.alarms.create('refreshStudies', { periodInMinutes: 5 });
  } else {
    chrome.alarms.clear('refreshStudies');
  }
}

function handleNotifications(e) {
  chrome.storage.local.set({ showNotifications: e.target.checked });
}
