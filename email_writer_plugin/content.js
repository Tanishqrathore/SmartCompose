console.log('Email_Write');

const limit = 1000;
let savedRange = null;

async function showLoginModal() {
  return new Promise(async (resolve) => {
    // First, try to get a token silently by sending a message to background.js
    // The background script will handle the chrome.identity.getAuthToken({ interactive: false })
    try {
      const silentResponse = await chrome.runtime.sendMessage({
        type: 'CHECK_LOGIN_STATUS',
      });

      if (silentResponse && silentResponse.success && silentResponse.token) {
        console.log('User is already logged in, token:', silentResponse.token);
        await chrome.storage.local.set({
          googleAccessToken: silentResponse.token,
        });
        resolve(); // User is already logged in, no modal needed, resolve
        return;
      }
    } catch (e) {
      console.warn('Silent login check failed or no token:', e);
      // Continue to show the modal if silent check fails or no token
    }

    // If no token (or silent check failed), show the login modal
    document.getElementById('ai-login-modal-overlay')?.remove(); // Remove any existing login modal

    const overlay = document.createElement('div');
    overlay.id = 'ai-login-modal-overlay'; // NEW ID

    const content = document.createElement('div');
    content.id = 'ai-login-modal-content'; // NEW ID

    const title = document.createElement('h3');
    title.textContent = 'Login Required';

    const messagePara = document.createElement('p');
    messagePara.textContent =
      'Please log in with your Google account to use SmartCompose+.';

    const loginButton = document.createElement('button');
    loginButton.id = 'ai-login-button';
    loginButton.textContent = 'Login with Google';

    loginButton.addEventListener('click', async () => {
      loginButton.textContent = 'Logging in...';
      loginButton.disabled = true;
      loginButton.style.animation = 'glow 1s infinite alternate';

      try {
        // Send message to background script to initiate interactive OAuth flow
        const response = await chrome.runtime.sendMessage({
          type: 'LOGIN_WITH_GOOGLE',
        });

        if (response.success && response.token) {
          console.log('Successfully logged in, token:', response.token);
          await chrome.storage.local.set({ googleAccessToken: response.token });
          overlay.remove();
          resolve();
        } else {
          console.error('Login failed:', response.error);
          showErrorModal(`Google login failed: ${response.error}`, null, null);
          overlay.remove();
          resolve();
        }
      } catch (error) {
        console.error('Error during login message:', error);
        showErrorModal(
          `An error occurred during login: ${error.message}`,
          null,
          null
        );
        overlay.remove();
        resolve();
      } finally {
        loginButton.textContent = 'Login with Google';
        loginButton.disabled = false;
        loginButton.style.animation = '';
      }
    });

    content.appendChild(title);
    content.appendChild(messagePara);
    content.appendChild(loginButton);
    overlay.appendChild(content);
    document.body.appendChild(overlay);
  });
}

function showErrorModal(message, wrapper, originalText) {
  // Remove any existing modal first
  document.getElementById('ai-error-modal-overlay')?.remove();

  // Create modal elements
  const overlay = document.createElement('div');
  overlay.id = 'ai-error-modal-overlay';

  const content = document.createElement('div');
  content.id = 'ai-error-modal-content';

  const title = document.createElement('h3');
  title.textContent = 'Content Generation Failed';

  const messagePara = document.createElement('p');
  messagePara.textContent = message;

  const okButton = document.createElement('button');
  okButton.id = 'ai-error-modal-ok-btn';
  okButton.textContent = 'OK';

  // Event listener for the OK button
  okButton.addEventListener('click', () => {
    // 1. Revert the UI to its original state
    if (wrapper && wrapper.parentNode) {
      wrapper.parentNode.replaceChild(
        document.createTextNode(originalText || ''),
        wrapper
      );
    }
    // 2. Close the modal
    overlay.remove();
  });

  // Assemble the modal
  content.appendChild(title);
  content.appendChild(messagePara);
  content.appendChild(okButton);
  overlay.appendChild(content);

  // Add the modal to the page
  document.body.appendChild(overlay);
}

async function typeChunkText(target, text, delay = 2) {
  for (const char of text) {
    target.appendChild(document.createTextNode(char));
    await new Promise((r) => setTimeout(r, delay));
  }
}

/**
 * Streams Server-Sent Events (SSE) and injects the content into the page.
 * @param {string} url - The URL for the SSE endpoint.
 * @param {object} payload - The payload to send with the request.
 * @param {number} flag - A flag to determine injection method (0 for compose box, 1 for selected range).
 * @param {string} originalText - The original text, used for reverting changes.
 * @param {object} headers - The headers object to include in the fetch request.
 */
async function streamSSEWithInjection(
  url,
  payload,
  flag,
  originalText,
  headers
) {
  const wrapper = document.createElement('span');
  const rewrittenSpan = document.createElement('span');

  rewrittenSpan.setAttribute('style', 'color:#555; white-space: pre-wrap;');
  wrapper.setAttribute(
    'style',
    'background-color:#b7d9ff; padding:1px 3px; border-radius:3px;'
  );
  wrapper.appendChild(rewrittenSpan);

  if (flag === 0) {
    const composeBox =
      document.querySelector(
        '[contenteditable="true"][aria-label="Message Body"]'
      ) || document.querySelector('[contenteditable="true"]');
    composeBox.innerHTML = '';
    composeBox.appendChild(wrapper);
  } else if (flag === 1 && savedRange) {
    savedRange.deleteContents();
    savedRange.insertNode(wrapper);
  }

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: headers, // Use the passed headers here
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(
        errorData.error || `Request failed with status ${response.status}`
      );
    }

    if (!response.body) {
      throw new Error(`Streaming failed: Response body is empty.`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';
    let bufferedText = '';

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop();

      for (const line of lines) {
        if (line.startsWith('data:')) {
          const chunk = line.slice(5);
          if (chunk !== '[DONE]') {
            bufferedText += chunk;

            const parts = bufferedText.split('*');
            for (let i = 0; i < parts.length - 1; i++) {
              await typeChunkText(rewrittenSpan, parts[i]);
              rewrittenSpan.appendChild(document.createElement('br'));
              rewrittenSpan.appendChild(document.createElement('br'));
            }
            bufferedText = parts[parts.length - 1];
          }
        }
      }
    }
    if (bufferedText.trim()) {
      await typeChunkText(rewrittenSpan, bufferedText);
    }
    // ✅ Stream done — now inject buttons
    const buttonContainer = document.createElement('span');
    buttonContainer.setAttribute(
      'style',
      'margin-left:6px; font-size:11px; display:inline-flex; gap:4px;'
    );

    const applyBtn = document.createElement('button');
    applyBtn.textContent = 'Apply';
    applyBtn.setAttribute(
      'style',
      'background-color: rgba(15, 136, 138, 0.85); color: white; border: none; border-radius: 3px; padding: 0px 5px; cursor: pointer;'
    );

    const revertBtn = document.createElement('button');
    revertBtn.textContent = 'Revert';
    revertBtn.setAttribute(
      'style',
      'background:#800020; color:white; border:none; border-radius:3px; padding:0px 5px; cursor:pointer;'
    );

    applyBtn.classList.add('ai-glow-button');
    revertBtn.classList.add('ai-glow-button');

    buttonContainer.append(applyBtn, revertBtn);
    wrapper.appendChild(buttonContainer);

    applyBtn.addEventListener('click', () => {
      rewrittenSpan.removeAttribute('style');
      buttonContainer.remove();
      wrapper.replaceWith(rewrittenSpan);
      window.getSelection().removeAllRanges();
    });

    revertBtn.addEventListener('click', () => {
      wrapper.replaceWith(document.createTextNode(originalText));
      window.getSelection().removeAllRanges();
    });

    console.log('✅ Stream complete, buttons added');
  } catch (err) {
    console.error('❌ Stream error:', err);
    showErrorModal(err.message, wrapper, originalText);
  }
}

// AI Rewrite feature
const pen = document.createElement('div');
pen.id = 'rewrite-pen';
pen.innerText = '✨';
pen.title = 'Rewrite with AI ✨';
document.body.appendChild(pen);

function getSelectedTextAndRange() {
  const selection = window.getSelection();
  if (!selection.rangeCount) return null;
  const range = selection.getRangeAt(0);
  const text = range.toString();
  console.log(text);
  return { range, text };
}

document.addEventListener('mouseup', () => {
  setTimeout(() => {
    const data = getSelectedTextAndRange();
    if (data && data.text.trim()) {
      savedRange = data.range.cloneRange();
      const rect = savedRange.getBoundingClientRect();
      pen.style.top = `${window.scrollY + rect.top - 30}px`;
      pen.style.left = `${window.scrollX + rect.left}px`;
      pen.style.display = 'block';
    } else {
      pen.style.display = 'none';
    }
  }, 10);
});

pen.addEventListener('click', async () => {
  if (!savedRange) return;
  const originalText = savedRange.toString().trim();
  if (!originalText) return;

  pen.innerText = '⏳';
  pen.style.display = 'block';
  const url = 'http://localhost:8080/api/email/rewrite';

  const payload = {
    emailContent: originalText,
    tone: 'professional',
    length: null,
    userInput: '',
  };
  try {
    if (originalText.length > limit) {
      throw new Error(
        `The text selection is too large, please select a smaller text for accurate results.`
      );
    }
    // Retrieve the stored Google Access Token for rewrite
    const result = await chrome.storage.local.get('googleAccessToken');
    const googleAccessToken = result.googleAccessToken;

    if (!googleAccessToken) {
      throw new Error('User not authenticated. Please log in.');
    }

    const headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${googleAccessToken}`, // Send token in header
    };

    await streamSSEWithInjection(url, payload, 1, originalText, headers); // Pass headers
  } catch (err) {
    console.error('Rewrite failed:', err);
    showErrorModal(err.message, null, null);
  } finally {
    pen.innerText = '✨';
    pen.style.display = 'none';
    savedRange = null;
  }
});

function getEmailContent() {
  const selectors = [
    '.h7',
    '.a3s.aiL',
    '.gmail_quote',
    '[role="presentation"]',
  ];
  for (const selector of selectors) {
    const content = document.querySelector(selector);
    if (content) return content.innerText.trim();
  }
  return '';
}

const findComposeToolbar = () => {
  const selectors = ['.btC', '.aDh', '[role="toolbar"]', '.gU.Up'];
  for (const selector of selectors) {
    const toolbar = document.querySelector(selector);
    if (toolbar) return toolbar;
  }
  return null;
};

const createDropdown = (className, placeholder, options, tooltipText) => {
  document.querySelector(`.${className}`)?.remove();

  const select = document.createElement('select');
  select.className = className;
  select.setAttribute('title', tooltipText);

  const defaultOption = document.createElement('option');
  defaultOption.innerText = placeholder;
  defaultOption.disabled = true;
  defaultOption.selected = true;
  select.appendChild(defaultOption);

  options.forEach((optionText) => {
    const option = document.createElement('option');
    option.innerText = optionText.charAt(0).toUpperCase() + optionText.slice(1);
    option.value = optionText;
    select.appendChild(option);
  });

  return select;
};

const createButton = (className, text, tooltip) => {
  document.querySelector(`.${className}`)?.remove();

  const button = document.createElement('div');
  button.className = `T-I J-J5-Ji aoO v7 T-I-atl L3 T-I JW ${className}`;
  button.innerHTML = text;
  button.setAttribute('role', 'button');
  button.setAttribute('data-tooltip', tooltip);

  if (
    className.includes('ai-write-button') ||
    className.includes('ai-reply-button')
  ) {
    button.style.backgroundColor = '#800020'; // deep red
    button.style.color = '#ffffff';
    button.style.border = '1px solid #ffffff';
  } else if (className.includes('ai-subject-button')) {
    button.style.backgroundColor = 'rgba(15, 136, 138, 0.85)'; // cyan/blue
    button.style.color = '#ffffff';
    button.style.border = '1px solid #ffffff';
  }

  return button;
};

const injectButton = async (val) => {
  await showLoginModal();

  // After showLoginModal resolves, re-check for token before proceeding
  const result = await chrome.storage.local.get('googleAccessToken');
  const accessToken = result.googleAccessToken;

  if (!accessToken) {
    console.log('User is not logged in after modal, not injecting buttons.');
    return; // Stop execution if no access token
  }
  const toolbar = findComposeToolbar();
  if (!toolbar) return console.log('No toolbar found');

  console.log('Injecting buttons and dropdowns');

  const aiButton = createButton(
    val ? 'ai-write-button' : 'ai-reply-button',
    val ? 'AI Write' : 'AI Reply',
    val ? 'Generate Email' : 'Generate AI Reply'
  );

  const subjectButton = val
    ? createButton('ai-subject-button', 'Subject', 'Generate Subject')
    : null;
  aiButton.style.borderRadius = '18px';
  if (subjectButton) subjectButton.style.borderRadius = '18px';
  const toneDropdown = createDropdown(
    'ai-tone-dropdown',
    'Select Tone',
    ['professional', 'funny', 'sarcastic', 'casual', 'serious'],
    'Set tone of AI response'
  );

  const lengthDropdown = createDropdown(
    'ai-length-dropdown',
    'Length',
    ['crisp', 'short', 'appropriate', 'long'],
    'Set size of AI response'
  );
  toneDropdown.style.marginRight = '3px';
  lengthDropdown.style.marginRight = '5px';

  if (subjectButton) {
    subjectButton.style.marginRight = '5px'; // Push subject button away from send
  }
  const composeBox = document.querySelector(
    '[role="textbox"][g_editable="true"]'
  );

  aiButton.addEventListener('click', async () => {
    await handleButtonClick(
      aiButton,
      val ? '/api/email/write' : '/api/email/generate',
      toneDropdown.value,
      lengthDropdown.value,
      composeBox
    );
  });

  subjectButton?.addEventListener('click', async () => {
    await handleButtonClick(
      subjectButton,
      '/api/email/subject',
      toneDropdown.value,
      lengthDropdown.value,
      composeBox
    );
  });

  const container = document.createElement('div');
  container.className = 'ai-toolbar-container';
  container.append(aiButton, toneDropdown, lengthDropdown);
  if (subjectButton) container.appendChild(subjectButton);

  toolbar.insertBefore(container, toolbar.firstChild);

  if (composeBox) {
    composeBox.focus();
    const event = new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      key: ' ',
    });
    composeBox.dispatchEvent(event);
  }
};

/**
 * Handles the click event for AI buttons, making a request to the backend.
 * @param {HTMLElement} button - The button element that was clicked.
 * @param {string} endpoint - The API endpoint to call (e.g., '/api/email/write').
 * @param {string} tone - The selected tone for the AI response.
 * @param {string} length - The selected length for the AI response.
 * @param {HTMLElement | null} composeBox - The email compose box element.
 */
const handleButtonClick = async (
  button,
  endpoint,
  tone,
  length,
  composeBox
) => {
  try {
    button.innerHTML = 'Generating...';
    button.disabled = true;
    button.style.animation = 'glow 1s infinite alternate';

    // 1. Retrieve the stored Google Access Token
    const result = await chrome.storage.local.get('googleAccessToken');
    const googleAccessToken = result.googleAccessToken;

    if (!googleAccessToken) {
      throw new Error('User not authenticated. Please log in.');
    }

    // 2. Define common headers including the Authorization header
    const commonHeaders = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${googleAccessToken}`, // Send the access token as a Bearer token
    };

    if (endpoint !== '/api/email/subject') {
      const url = `http://localhost:8080${endpoint}`;
      const payload = {
        emailContent: getEmailContent(),
        tone: tone || 'professional',
        length: length || 'appropriate',
        userInput: composeBox?.innerText.trim() || '',
      };
      if (payload.emailContent.length + payload.userInput.length > limit) {
        throw new Error(
          'The user input is too large,Please try again with a smaller input'
        );
      }
      // Pass the commonHeaders to streamSSEWithInjection
      await streamSSEWithInjection(url, payload, 0, '', commonHeaders);
    } else {
      const response = await fetch(`http://localhost:8080${endpoint}`, {
        method: 'POST',
        headers: commonHeaders, // Use the commonHeaders here
        body: JSON.stringify({
          emailContent: getEmailContent(),
          tone: tone || 'professional',
          length: length || 'appropriate',
          userInput: composeBox?.innerText.trim() || '',
        }),
      });

      if (!response.ok) {
        // Assuming your backend sends JSON errors
        const errorData = await response.json();
        throw new Error(
          errorData.error || `API Request Failed with status ${response.status}`
        );
      }
      const generatedReply = await response.text();

      if (endpoint === '/api/email/subject') {
        const subjectBox = document.querySelector('input[name="subjectbox"]');
        if (subjectBox) subjectBox.value = generatedReply;
        else console.error('Subject box not found');
      } else {
        if (composeBox) {
          composeBox.focus();
          composeBox.innerHTML = '';
          document.execCommand('insertText', false, generatedReply);
        }
      }
    }
  } catch (error) {
    console.error('Error generating reply:', error);
    showErrorModal(error.message, null, null);
  } finally {
    button.innerHTML =
      endpoint === '/api/email/subject'
        ? 'Subject'
        : button.className.includes('ai-write-button')
        ? 'AI Write'
        : 'AI Reply';
    button.disabled = false;
    button.style.animation = '';
  }
};

const observer = new MutationObserver((mutations) => {
  mutations.forEach(({ addedNodes }) => {
    if (
      [...addedNodes].some(
        (node) =>
          node.nodeType === Node.ELEMENT_NODE &&
          (node.matches('.aDh,.btC,[role="dialog"]') ||
            node.querySelector('.aDh,.btC,[role="dialog"]'))
      )
    ) {
      setTimeout(() => {
        injectButton(window.location.hash.includes('compose=new') ? 1 : 0);
      }, 100);
    }
  });
});

observer.observe(document.body, { childList: true, subtree: true });
