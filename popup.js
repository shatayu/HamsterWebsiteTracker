console.log('This is a popup for real!');

document.addEventListener('DOMContentLoaded', () => {
  const sendButton = document.getElementById('sendApiRequestBtn');

  if (sendButton) {
    sendButton.addEventListener('click', () => {
      const apiUrl = 'https://uez62rtr20.execute-api.us-east-1.amazonaws.com/prod/users/premelon/entries';
      const requestBody = {
        username: "premelon",
        eventName: "phoneUse", 
        data: "output" // As per your instruction, using the string "output" for now
      };

      console.log('Sending API request to??:', apiUrl);
      console.log('Request body:', requestBody);

      fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // Add any other headers if required, like Authorization headers
        },
        body: JSON.stringify(requestBody)
      })
      .then(response => {
        if (!response.ok) {
          // If response is not OK, throw an error to be caught by the .catch block
          return response.text().then(text => { 
            throw new Error(`API request failed with status ${response.status}: ${text}`); 
          });
        }
        return response.json(); // Or response.text() if the response is not JSON
      })
      .then(data => {
        console.log('API request successful:', data);
        // You can add any further actions here, like showing a success message in the popup
      })
      .catch(error => {
        console.error('Error sending API request:', error);
        // You can display an error message in the popup here
      });
    });
  } else {
    console.error('Button with ID sendApiRequestBtn not found.');
  }
});