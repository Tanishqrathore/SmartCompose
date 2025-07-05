chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'LOGIN_WITH_GOOGLE') {
    chrome.identity.getAuthToken({ interactive: true }, function (token) {
      if (chrome.runtime.lastError) {
        console.error('Auth error:', chrome.runtime.lastError);
        sendResponse({
          success: false,
          error: chrome.runtime.lastError.message,
        });
      } else {
        console.log('Got token:', token);
        sendResponse({ success: true, token });
      }
    });
    return true;
  } else if (request.type === 'CHECK_LOGIN_STATUS') {
    chrome.identity.getAuthToken({ interactive: false }, function (token) {
      if (chrome.runtime.lastError) {
        console.warn('Silent auth check error:', chrome.runtime.lastError);
        sendResponse({
          success: false,
          error: chrome.runtime.lastError.message,
        });
      } else if (token) {
        console.log('Silent check: Got token:', token);
        sendResponse({ success: true, token });
      } else {
        console.log('Silent check: No token found.');
        sendResponse({ success: false, error: 'No token' });
      }
    });
    return true;
  }
});
