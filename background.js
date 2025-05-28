chrome.tabs.onActivated.addListener(activeInfo => {
  chrome.tabs.get(activeInfo.tabId, (tab) => {
    if (tab && tab.url) {
      try {
        const url = new URL(tab.url);
        if (url.hostname) {
          console.log(url.hostname);
        }
      } catch (e) {
        // Handle cases where tab.url is not a valid URL (e.g., chrome:// URLs)
        // or if URL constructor fails for other reasons.
      }
    }
  });
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (tab.active && changeInfo.url) {
    try {
      const url = new URL(changeInfo.url);
      if (url.hostname) {
        console.log(url.hostname);
      }
    } catch (e) {
      // Similar error handling as above
    }
  }
});
