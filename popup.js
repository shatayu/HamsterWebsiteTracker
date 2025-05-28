console.log('This is a popup for real!');
console.log('Popup script loaded.');

document.addEventListener('DOMContentLoaded', () => {
  const sendButton = document.getElementById('sendApiRequestBtn');
  const statusMessage = document.getElementById('statusMessage'); // Assuming you add an element to show status

  if (sendButton) {
    sendButton.addEventListener('click', () => {
      console.log('Force send data button clicked.');
      if (statusMessage) statusMessage.textContent = 'Attempting to send data...';

      // Send a message to the background script to trigger data sending
      chrome.runtime.sendMessage({ action: "forceSendData" }, (response) => {
        if (chrome.runtime.lastError) {
          // Handle errors from sendMessage, e.g., if the background script isn't ready
          console.error('Error sending message to background script:', chrome.runtime.lastError.message);
          if (statusMessage) statusMessage.textContent = `Error: ${chrome.runtime.lastError.message}`;
          return;
        }
        
        if (response) {
          console.log('Response from background script:', response.status);
          if (statusMessage) statusMessage.textContent = `Status: ${response.status}`;
        } else {
          // This might happen if the background script doesn't send a response or closes the port before responding.
          console.warn('No response from background script or an issue occurred.');
          if (statusMessage) statusMessage.textContent = 'No response or issue with background script.';
        }
      });
    });
  } else {
    console.error('Button with ID sendApiRequestBtn not found.');
    if (statusMessage) statusMessage.textContent = 'Error: Send button not found.';
  }
});