chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'START_GOOGLE_LOGIN') {
    const clientId =
      '1090138335899-7eqhud4rft3ont45lj195m98er5ls1ff.apps.googleusercontent.com';
    const scopes = 'openid email profile';

    // Note: We generate a random nonce for security (replay attack protection)
    const nonce = Math.random().toString(36).substring(2, 15);

    // IMPORTANT: The redirect URI must be EXACTLY what chrome.identity.getRedirectURL() provides.
    // It's constructed from your extension's ID.
    const redirectUri = chrome.identity.getRedirectURL('google');
    console.log(redirectUri);

    // Construct the URL to ask for an ID token directly
    let authUrl = `https://accounts.google.com/o/oauth2/v2/auth?`;
    authUrl += `client_id=${clientId}`;
    authUrl += `&response_type=id_token`; // Ask for an id_token
    authUrl += `&redirect_uri=${encodeURIComponent(redirectUri)}`;
    authUrl += `&scope=${encodeURIComponent(scopes)}`;
    authUrl += `&nonce=${nonce}`; // Include the nonce
    authUrl += `&prompt=select_account`;

    console.log('Starting auth flow with URL:', authUrl);

    chrome.identity.launchWebAuthFlow(
      { url: authUrl, interactive: true },
      (redirectedTo) => {
        if (chrome.runtime.lastError || !redirectedTo) {
          console.error('Auth flow failed:', chrome.runtime.lastError?.message);
          return sendResponse({
            success: false,
            error:
              chrome.runtime.lastError?.message ||
              'Auth flow was cancelled or failed.',
          });
        }

        // The id_token is in the URL fragment, not search params
        const params = new URLSearchParams(
          new URL(redirectedTo).hash.substring(1)
        );
        const idToken = params.get('id_token');

        if (!idToken) {
          console.error('No id_token found in redirect URL.');
          return sendResponse({
            success: false,
            error: 'No id_token found in redirect.',
          });
        }

        // Success! Send the id_token back to the content script.
        console.log('Successfully received id_token.');
        return sendResponse({ success: true, id_token: idToken });
      }
    );

    return true; // Keep message channel open for async response
  }
});
