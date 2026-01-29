// Background service worker for Movebank extension

// Listen for alarm events (auto-refresh)
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'refreshStudies') {
    // Could trigger a notification or update badge
    checkForNewData();
  }
});

async function checkForNewData() {
  const { credentials, showNotifications } = await chrome.storage.local.get([
    'credentials',
    'showNotifications'
  ]);

  if (!credentials || !showNotifications) return;

  // Check for new tracking data
  // This is a placeholder for actual implementation
  console.log('Checking for new tracking data...');
}

// Handle extension installation
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    console.log('Movebank Animal Tracker installed successfully!');
    
    // Set default settings
    chrome.storage.local.set({
      maxPoints: 500,
      showNotifications: false
    });
  }
});

// Handle messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'fetchData') {
    fetchMovebankData(request.url, request.credentials)
      .then(data => sendResponse({ success: true, data }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true; // Indicates async response
  }
});

async function fetchMovebankData(url, credentials) {
  const response = await fetch(url, {
    headers: {
      'Authorization': `Basic ${credentials}`
    }
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  return await response.text();
}

// Keep service worker alive
let keepAliveInterval;

function keepAlive() {
  if (keepAliveInterval) return;
  
  keepAliveInterval = setInterval(() => {
    chrome.runtime.getPlatformInfo(() => {
      // This will keep the service worker alive
    });
  }, 20000); // Every 20 seconds
}

keepAlive();

// Clean up on shutdown
chrome.runtime.onSuspend.addListener(() => {
  if (keepAliveInterval) {
    clearInterval(keepAliveInterval);
  }
});
