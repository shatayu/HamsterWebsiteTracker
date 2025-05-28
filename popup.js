console.log('This is a popup for real!');
console.log('Popup script loaded.');

// Defined to match background.js for consistency, though not strictly necessary to redefine here
const LOGS_STORAGE_KEY = 'websiteTrackerLogs';

function updateLogSummary() {
  const totalElement = document.getElementById('logSummaryTotal');
  const breakdownListElement = document.querySelector('#logSummaryBreakdown ul');

  if (!totalElement || !breakdownListElement) {
    console.error('Log summary elements not found in popup.html');
    return;
  }

  chrome.storage.local.get(LOGS_STORAGE_KEY, (result) => {
    if (chrome.runtime.lastError) {
      console.error('Error fetching logs:', chrome.runtime.lastError.message);
      totalElement.textContent = 'Error loading summary.';
      breakdownListElement.innerHTML = ''; // Clear any old list items
      return;
    }

    const logs = result[LOGS_STORAGE_KEY] || [];

    totalElement.textContent = `Total logged entries since last sync: ${logs.length}`;

    const siteCounts = logs.reduce((acc, logEntry) => {
      const site = logEntry.processedHostname || 'unknown_site';
      acc[site] = (acc[site] || 0) + 1;
      return acc;
    }, {});

    breakdownListElement.innerHTML = ''; // Clear previous list

    if (Object.keys(siteCounts).length === 0 && logs.length > 0) {
        const li = document.createElement('li');
        li.textContent = 'Error: Logs found but hostnames are missing.';
        breakdownListElement.appendChild(li);
    } else if (Object.keys(siteCounts).length === 0) {
        const li = document.createElement('li');
        li.textContent = 'No sites logged yet.';
        breakdownListElement.appendChild(li);
    } else {
      Object.entries(siteCounts)
        .sort(([, countA], [, countB]) => countB - countA) // Sort by count, descending
        .forEach(([site, count]) => {
          const li = document.createElement('li');
          li.textContent = `${site}: ${count}`;
          breakdownListElement.appendChild(li);
        });
    }
  });
}

document.addEventListener('DOMContentLoaded', () => {
  const sendButton = document.getElementById('sendApiRequestBtn');
  const statusMessageElement = document.getElementById('statusMessage');

  // Initial load of log summary
  updateLogSummary();

  if (sendButton) {
    sendButton.addEventListener('click', () => {
      console.log('Force send data button clicked.');
      if (statusMessageElement) statusMessageElement.textContent = 'Attempting to send data...';

      chrome.runtime.sendMessage({ action: "forceSendData" }, (response) => {
        if (chrome.runtime.lastError) {
          console.error('Error sending message to background:', chrome.runtime.lastError.message);
          if (statusMessageElement) statusMessageElement.textContent = `Error: ${chrome.runtime.lastError.message}`;
          return;
        }
        
        if (response) {
          console.log('Response from background:', response.status);
          if (statusMessageElement) statusMessageElement.textContent = `Status: ${response.status}`;
          // If data sending was initiated (or potentially completed and logs cleared),
          // refresh the summary. The background script handles actual log clearing.
          if (response.status && !response.status.toLowerCase().includes('error')) {
            // Add a small delay to allow storage to update, then refresh summary
            setTimeout(updateLogSummary, 500); 
          }
        } else {
          console.warn('No response from background script.');
          if (statusMessageElement) statusMessageElement.textContent = 'No response from background script.';
        }
      });
    });
  } else {
    console.error('Button with ID sendApiRequestBtn not found.');
    if (statusMessageElement) statusMessageElement.textContent = 'Error: Send button not found.';
  }
});

// Listen for storage changes to keep the summary up-to-date if logs are cleared by the background script
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'local' && changes[LOGS_STORAGE_KEY]) {
    console.log('Detected storage change for logs. Updating summary.');
    updateLogSummary();
  }
});