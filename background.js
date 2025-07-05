// Constants
const LOGS_STORAGE_KEY = 'websiteTrackerLogs';
const LAST_SENT_TIMESTAMP_KEY = 'websiteTrackerLastSent';
const API_ENDPOINT = 'https://uez62rtr20.execute-api.us-east-1.amazonaws.com/prod/users/premelon/entries';
const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;
const SEND_DATA_ALARM_NAME = 'sendDataAlarm';
const ALLOWLIST_MODE_KEY = 'allowlistModeEnabled';
const ALLOWLIST_DOMAINS_KEY = 'allowlistDomains';
const LIVE_MODE_KEY = 'liveModeEnabled';
const LAST_VISITED_DOMAIN_KEY = 'lastVisitedDomain';

// --- Helper Functions ---

/**
 * Extracts the top-level domain from a hostname.
 * Examples: 
 * - "reddit.com" -> "reddit.com"
 * - "www.reddit.com" -> "reddit.com"
 * - "old.reddit.com" -> "reddit.com"
 * - "subdomain.example.co.uk" -> "example.co.uk"
 * @param {string} hostname - The hostname to extract top-level domain from.
 * @returns {string} The top-level domain.
 */
function getTopLevelDomain(hostname) {
  // Remove "www." if it exists
  if (hostname.startsWith('www.')) {
    hostname = hostname.substring(4);
  }
  
  // Split by dots and get the last two parts for most domains
  const parts = hostname.split('.');
  
  // Handle special cases like .co.uk, .com.au, etc.
  if (parts.length >= 3) {
    const lastTwo = parts.slice(-2).join('.');
    // Check if it's a known multi-part TLD
    const multiPartTLDs = ['co.uk', 'com.au', 'co.nz', 'co.za', 'com.br', 'com.mx', 'org.uk', 'net.uk', 'gov.uk'];
    if (multiPartTLDs.some(tld => lastTwo.endsWith(tld))) {
      return parts.slice(-3).join('.');
    }
  }
  
  // For most domains, return the last two parts
  return parts.slice(-2).join('.');
}

/**
 * Generates a timestamp string in a format compatible with RFC 2822 (approximated).
 * Example: "Sat, 13 Jul 2024 15:30:00 +0000"
 * @param {Date} date - The date object to format. Defaults to now.
 * @returns {string} Formatted date string.
 */
function getRFC2822Timestamp(date = new Date()) {
  // toUTCString() returns "Sat, 13 Jul 2024 15:30:00 GMT"
  // RFC 2822 requires the offset as +0000 or -0000 for UTC.
  return date.toUTCString().replace('GMT', '+0000');
}

/**
 * Checks if two millisecond timestamps fall on the same calendar day in UTC.
 * @param {number} ts1 - First timestamp (milliseconds).
 * @param {number} ts2 - Second timestamp (milliseconds).
 * @returns {boolean} True if they are on the same UTC day, false otherwise.
 */
function isSameUTCDay(ts1, ts2) {
  if (!ts1 || !ts2) return false; // One or both timestamps are invalid/missing
  const date1 = new Date(ts1);
  const date2 = new Date(ts2);
  return date1.getUTCFullYear() === date2.getUTCFullYear() &&
         date1.getUTCMonth() === date2.getUTCMonth() &&
         date1.getUTCDate() === date2.getUTCDate();
}

// --- Core Logic Functions ---

/**
 * Records a website visit, respects allowlist, and triggers send if in live mode.
 * Only logs if the top-level domain is different from the previous visit.
 * @param {string} fullUrl - The full URL of the visited website.
 */
async function recordWebsiteVisit(fullUrl) {
  try {
    const settings = await chrome.storage.local.get([
      ALLOWLIST_MODE_KEY, 
      ALLOWLIST_DOMAINS_KEY, 
      LIVE_MODE_KEY,
      LAST_VISITED_DOMAIN_KEY
    ]);
    const allowlistModeEnabled = !!settings[ALLOWLIST_MODE_KEY];
    const allowlistedDomains = settings[ALLOWLIST_DOMAINS_KEY] || [];
    const liveModeEnabled = !!settings[LIVE_MODE_KEY];
    const lastVisitedDomain = settings[LAST_VISITED_DOMAIN_KEY] || null;

    const parsedUrl = new URL(fullUrl);
    let hostname = parsedUrl.hostname;

    // Remove "www." if it exists
    if (hostname.startsWith('www.')) {
      hostname = hostname.substring(4);
    }

    // Get the top-level domain for comparison
    const currentTopLevelDomain = getTopLevelDomain(hostname);
    
    // Check if this is the same top-level domain as the last visit
    if (lastVisitedDomain === currentTopLevelDomain) {
      console.log(`Same top-level domain as last visit (${currentTopLevelDomain}). Not logging.`);
      return;
    }

    if (allowlistModeEnabled) {
      if (!allowlistedDomains.includes(hostname)) {
        console.log(`Allowlist: ${hostname} not in list. Not logging.`);
        // Still update the last visited domain even for non-allowlisted sites
        await chrome.storage.local.set({ [LAST_VISITED_DOMAIN_KEY]: currentTopLevelDomain });
        console.log('Updated last visited domain to:', currentTopLevelDomain, '(non-allowlisted)');
        return;
      }
      console.log(`Allowlist: ${hostname} is in list. Proceeding.`);
    }

    const logEntry = {
      processedHostname: hostname,
      timestampRFC2822: getRFC2822Timestamp(),
      loggedAtMS: Date.now()
    };

    const data = await chrome.storage.local.get(LOGS_STORAGE_KEY);
    const logs = data[LOGS_STORAGE_KEY] || [];
    logs.push(logEntry);
    
    // Update both the logs and the last visited domain
    await chrome.storage.local.set({ 
      [LOGS_STORAGE_KEY]: logs,
      [LAST_VISITED_DOMAIN_KEY]: currentTopLevelDomain
    });
    
    console.log('Website logged:', logEntry.processedHostname, '@', logEntry.timestampRFC2822);
    console.log('Updated last visited domain to:', currentTopLevelDomain);

    if (liveModeEnabled) {
      console.log('Live mode enabled. Triggering immediate log send attempt.');
      // Call checkAndProcessLogs with isForced = true to send immediately.
      // This sends *all* accumulated logs, not just the current one.
      checkAndProcessLogs(true);
    }

  } catch (error) {
    console.error('Error recording website visit for URL:', fullUrl, error);
  }
}

/**
 * Compiles all log entries into a single string for the API.
 * @param {Array<Object>} logs - Array of log entries.
 * @returns {string} A single string with all log data.
 */
function compileLogData(logs) {
  if (!logs || logs.length === 0) return "";
  return logs
    .map(log => `opening ${log.processedHostname} at ${log.timestampRFC2822}`) // Use processedHostname
    .join('\n')
    .trim();
}

/**
 * Sends the compiled data string to the API.
 * @param {string} dataString - The compiled string of log data.
 * @returns {Promise<boolean>} True if the API request was successful, false otherwise.
 */
async function performApiSend(dataString) {
  if (!dataString) {
    console.log("No data string to send to API.");
    return true; // No data means nothing to fail on
  }

  const requestBody = {
    username: "premelon",
    eventName: "personalLaptopUse",
    data: dataString
  };

  console.log('Sending API request. Data length:', dataString.length);
  try {
    const response = await fetch(API_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody)
    });

    const responseText = await response.text();
    if (!response.ok) {
      console.error(`API request failed: ${response.status} - ${responseText}`);
      return false;
    }
    console.log('API request successful:', responseText);
    return true;
  } catch (error) {
    console.error('Error sending data to API:', error);
    return false;
  }
}

/**
 * Clears all logs from local storage.
 */
async function clearAllLogs() {
  try {
    await chrome.storage.local.remove(LOGS_STORAGE_KEY);
    console.log('All website logs cleared from storage.');
  } catch (error) {
    console.error('Error clearing logs:', error);
  }
}

/**
 * Updates the last sent timestamp in local storage to now.
 */
async function updateLastSentTimestamp() {
  try {
    await chrome.storage.local.set({ [LAST_SENT_TIMESTAMP_KEY]: Date.now() });
    console.log('Last sent timestamp updated.');
  } catch (error) {
    console.error('Error updating last sent timestamp:', error);
  }
}

/**
 * Checks conditions and, if met or forced, sends logs to the API.
 * @param {boolean} isForced - If true, sends logs regardless of time/day conditions.
 */
async function checkAndProcessLogs(isForced = false) {
  console.log(`Checking logs. Forced: ${isForced}`);
  try {
    const data = await chrome.storage.local.get([LOGS_STORAGE_KEY, LAST_SENT_TIMESTAMP_KEY]);
    const logs = data[LOGS_STORAGE_KEY] || [];
    const lastSentTimestamp = data[LAST_SENT_TIMESTAMP_KEY] || 0;

    if (logs.length === 0) {
      console.log('No logs to process.');
      return;
    }

    const now = Date.now();
    const timeSinceLastSend = now - lastSentTimestamp;
    const moreThan24Hours = timeSinceLastSend > TWENTY_FOUR_HOURS_MS;
    const differentUTCDay = !isSameUTCDay(lastSentTimestamp, now);

    console.log(`Logs found: ${logs.length}. Last sent: ${lastSentTimestamp ? new Date(lastSentTimestamp).toISOString() : 'Never'}.`);
    console.log(`More than 24 hours: ${moreThan24Hours}. Different UTC day: ${differentUTCDay}.`);

    if (isForced || moreThan24Hours || differentUTCDay) {
      console.log('Conditions met or forced. Preparing to send logs.');
      const dataString = compileLogData(logs);
      const success = await performApiSend(dataString);

      if (success) {
        await clearAllLogs();
        await updateLastSentTimestamp();
      } else {
        console.warn('API send failed. Logs will remain for next attempt.');
      }
    } else {
      console.log('Conditions not met for sending logs.');
    }
  } catch (error) {
    console.error('Error in checkAndProcessLogs:', error);
  }
}

// --- Event Listeners ---

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url && (tab.url.startsWith('http:') || tab.url.startsWith('https:'))) {
    console.log('Tab updated and complete:', tab.url);
    recordWebsiteVisit(tab.url); // Pass the full tab.url here
  }
});

chrome.tabs.onActivated.addListener(async (activeInfo) => {
  try {
    const tab = await chrome.tabs.get(activeInfo.tabId);
    if (tab && tab.url && (tab.url.startsWith('http:') || tab.url.startsWith('https:'))) {
      console.log('Tab activated:', tab.url);
      recordWebsiteVisit(tab.url); // Pass the full tab.url here
    }
  } catch (error) {
    // The tab might be closed before we can get it, or it might be a special tab without a URL
    if (error.message.includes('No tab with id') || error.message.includes('cannot be scripted')) {
      // console.warn(`Could not get tab info for tabId ${activeInfo.tabId}: ${error.message}`);
    } else {
      console.error('Error in onActivated listener:', error);
    }
  }
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === SEND_DATA_ALARM_NAME) {
    console.log('Hourly alarm triggered: checking logs.');
    // Don't force send from alarm if live mode might be on, as that handles its own forced sends.
    // The alarm still serves as a fallback for other conditions if live mode is off.
    chrome.storage.local.get(LIVE_MODE_KEY, (settings) => {
        if (!settings[LIVE_MODE_KEY]) {
            checkAndProcessLogs(false); // isForced = false
        }
    });
  }
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "forceSendData") {
    console.log('forceSendData message received from popup.');
    checkAndProcessLogs(true) // isForced = true
      .then(() => sendResponse({ status: "Data processing initiated (forced by popup)." }))
      .catch(error => {
        console.error("Error during forced send from popup:", error);
        sendResponse({ status: `Error: ${error.message}`});
      });
    return true; 
  }
});

chrome.runtime.onStartup.addListener(() => {
  console.log("Extension started up. Performing initial log check.");
  checkAndProcessLogs(); // isForced = false by default
});

// --- Initialization ---
// Create the alarm when the extension is installed or updated, or on browser startup.
chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create(SEND_DATA_ALARM_NAME, { periodInMinutes: 60 });
  console.log('Hourly alarm for sending data created/verified.');
  checkAndProcessLogs(); // isForced = false by default
});

console.log('Background script loaded. Logging and periodic checks are active.');
