console.log('Email_Write');

const limit = 10;
let savedRange = null;

async function showLoginModal() {
  return new Promise(async (resolve, reject) => {
    // 🧼 Remove any existing modal
    document.getElementById('ai-login-modal-overlay')?.remove();

    // 🧱 Create overlay
    const overlay = document.createElement('div');
    overlay.id = 'ai-login-modal-overlay';

    // 📦 Create content box
    const content = document.createElement('div');
    content.id = 'ai-login-modal-content';

    // ❌ Close button
    const closeBtn = document.createElement('span');
    closeBtn.textContent = '✖';
    closeBtn.style.position = 'absolute';
    closeBtn.style.top = '10px';
    closeBtn.style.right = '15px';
    closeBtn.style.cursor = 'pointer';
    closeBtn.style.fontSize = '16px';
    closeBtn.onclick = () => {
      overlay.remove();
      reject('User cancelled login');
    };

    // 📝 Title
    const title = document.createElement('h3');
    title.textContent = 'Login Required';
    title.style.marginBottom = '10px';

    // 🗯️ Message
    const messagePara = document.createElement('p');
    messagePara.textContent =
      'Please log in with your Google account to use SmartCompose+.';
    messagePara.style.marginBottom = '20px';

    // 🔘 Login button
    const loginButton = document.createElement('button');
    loginButton.id = 'ai-login-button';
    loginButton.textContent = 'Login';

    loginButton.addEventListener('click', async () => {
      loginButton.disabled = true;
      loginButton.textContent = 'Logging in...';
      loginButton.style.animation = 'glow 1s infinite alternate';

      try {
        // 🚀 Step 1: Open Google OAuth screen
        const response = await chrome.runtime.sendMessage({
          type: 'START_GOOGLE_LOGIN',
        });

        // Check for id_token instead of code
        if (!response.success || !response.id_token) {
          throw new Error(
            response.error || 'No ID token received from auth flow'
          );
        }

        // 📡 Step 2: Send auth code to your backend
        const backendRes = await fetch(
          'http://localhost:8080/api/auth/google/verify',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: response.id_token }),
          }
        );

        if (!backendRes.ok) {
          throw new Error('Backend rejected auth code');
        }

        const data = await backendRes.json();
        if (!data.sessionKey) {
          throw new Error('No sessionKey returned by backend');
        }

        // 💾 Step 3: Store session key in extension cache
        console.log(data.sessionKey);

        chrome.storage.local.set({ sessionKey: data.sessionKey });

        overlay.remove();
        resolve(); // 🎉 Auth complete
      } catch (err) {
        console.error('[Login Error]', err);
        alert('Login failed: ' + err.message);
        overlay.remove();
        reject(err);
      } finally {
        loginButton.textContent = 'Login with Google';
        loginButton.disabled = false;
        loginButton.style.animation = '';
      }
    });

    // 🧩 Add all pieces
    content.appendChild(closeBtn);
    content.appendChild(title);
    content.appendChild(messagePara);
    content.appendChild(loginButton);
    overlay.appendChild(content);
    document.body.appendChild(overlay);
  });
}

function showErrorModal(message, wrapper, originalText) {
  document.getElementById('ai-error-modal-overlay')?.remove();

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

  okButton.addEventListener('click', () => {
    if (wrapper && wrapper.parentNode) {
      wrapper.parentNode.replaceChild(
        document.createTextNode(originalText || ''),
        wrapper
      );
    }

    overlay.remove();
    if (message == 'Please login') {
      showLoginModal();
    }
  });

  content.appendChild(title);
  content.appendChild(messagePara);
  content.appendChild(okButton);
  overlay.appendChild(content);

  document.body.appendChild(overlay);
}

function addLoader(component) {
  const loader = document.createElement('div');
  loader.className = 'loader-overlay';
  loader.setAttribute('data-loader', 'true');
  loader.innerHTML = `
    <div class="blinking-dots">
      <span></span>
      <span></span>
      <span></span>
    </div>
  `;

  component.style.position = 'relative';
  component.appendChild(loader);
}

function removeLoader(component) {
  const loader = component.querySelector('[data-loader="true"]');
  if (loader) loader.remove();
}

async function typeChunkText(target, text, delay = 2) {
  for (const char of text) {
    target.appendChild(document.createTextNode(char));
    await new Promise((r) => setTimeout(r, delay));
  }
}
async function typeChunkTextToTextarea(textarea, chunk, delay = 2) {
  for (const char of chunk) {
    textarea.value += char;
    await new Promise((resolve) => setTimeout(resolve, delay));
  }
}
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
    addLoader(rewrittenSpan);
    const response = await fetch(url, {
      method: 'POST',
      headers: headers,
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

    removeLoader(rewrittenSpan);
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
    removeLoader(rewrittenSpan);
    console.error('❌ Stream error:', err);
    if (err.message == 'Please login') {
      showLoginModal();
    } else {
      showErrorModal(err.message, wrapper, originalText);
    }
  }
}

function addTextareaLoader(textarea) {
  if (
    !textarea ||
    textarea.parentElement.classList.contains('textarea-loader-wrapper')
  )
    return;

  const wrapper = document.createElement('div');
  wrapper.className = 'textarea-loader-wrapper';

  textarea.parentNode.insertBefore(wrapper, textarea);
  wrapper.appendChild(textarea);

  const loader = document.createElement('div');
  loader.className = 'loader-overlay';
  loader.setAttribute('data-loader', 'true');
  loader.innerHTML = `
    <div class="blinking-dots">
      <span></span><span></span><span></span>
    </div>
  `;

  wrapper.appendChild(loader);
}

function removeTextareaLoader(textarea) {
  const wrapper = textarea.parentElement;
  if (!wrapper || !wrapper.classList.contains('textarea-loader-wrapper'))
    return;

  // Remove loader
  const loader = wrapper.querySelector("[data-loader='true']");
  if (loader) loader.remove();

  // Move textarea out and remove wrapper
  wrapper.parentNode.insertBefore(textarea, wrapper);
  wrapper.remove();
}

async function streamSSEToTextarea(url, payload, headers, targetTextarea) {
  try {
    addTextareaLoader(targetTextarea);
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(
        errorData.error || `Request failed with status ${response.status}`
      );
    }

    if (!response.body) {
      throw new Error('Streaming failed: No response body.');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';
    let bufferedText = '';
    removeTextareaLoader(targetTextarea);
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
              await typeChunkTextToTextarea(targetTextarea, parts[i]);
              targetTextarea.appendChild(document.createElement('br'));
              targetTextarea.appendChild(document.createElement('br'));
            }
            bufferedText = parts[parts.length - 1];
          }
        }
      }
    }
    if (bufferedText.trim()) {
      await typeChunkTextToTextarea(targetTextarea, bufferedText);
    }
  } catch (err) {
    showErrorModal(err.message, null, null);
  }
}

function showRewriteOverlay(originalText) {
  document.getElementById('ai-rewrite-overlay')?.remove();

  const overlay = document.createElement('div');
  overlay.id = 'ai-rewrite-overlay';
  overlay.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 10000;
    background-color: rgba(0, 0, 0, 0.5); /* Semi-transparent black for overlay */
    backdrop-filter: blur(5px); /* BLUR BACKGROUND */
    -webkit-backdrop-filter: blur(5px); /* For Safari support */
  `;

  // Inner content div to apply image-like styling
  const contentDiv = document.createElement('div');
  contentDiv.style.cssText = `
    background: white;
    border-radius: 8px; /* Rounded corners */
    box-shadow: 0 4px 12px rgba(0,0,0,0.15); /* Softer, slightly larger shadow */
    padding: 24px; /* Generous padding */
    width: 480px; /* Specific width */
    box-sizing: border-box; /* Include padding in width */
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol"; /* Consistent font */
    color: #333; /* Default text color */
    position: relative; /* For positioning close button */
  `;

  contentDiv.innerHTML = `
    <h3 style="margin-top: 0; margin-bottom: 15px; font-size: 20px; font-weight: 500; color: #333;">AI Rewrite</h3>
    <label style="font-weight: 500; font-size: 14px; color: #333; display: block; margin-bottom: 5px;">Original Text:</label><br/>
    <textarea id="ai-original-text" readonly style="width: 100%; height: 100px; margin-bottom: 15px; padding: 8px; border: 1px solid #dcdcdc; border-radius: 4px; font-size: 14px; color: #333; resize: vertical; box-sizing: border-box;">${originalText}</textarea>

    <label style="font-weight: 500; font-size: 14px; color: #333; display: block; margin-bottom: 5px;">Suggestions (optional):</label><br/>
    <textarea id="ai-suggestion-text" placeholder="e.g., Make it more polite or summarize it" style="width: 100%; height: 80px; margin-bottom: 20px; padding: 8px; border: 1px solid #dcdcdc; border-radius: 4px; font-size: 14px; color: #333; resize: vertical; box-sizing: border-box;"></textarea>

    <div style="display: flex; justify-content: flex-end; gap: 10px;">
      <button id="ai-close-overlay">Close</button>
      <button id="ai-apply-btn">Apply</button>
      <button id="ai-rewrite-btn">Rewrite with AI</button>
    </div>
  `;

  overlay.appendChild(contentDiv);
  document.body.appendChild(overlay);

  const originalTextArea = document.getElementById('ai-original-text');
  const suggestionTextArea = document.getElementById('ai-suggestion-text');
  const applyBtn = document.getElementById('ai-apply-btn');
  const rewriteBtn = document.getElementById('ai-rewrite-btn');
  const closeOverlayBtn = document.getElementById('ai-close-overlay');

  // Helper function to apply common button styles and hover effects
  const applyButtonHoverStyles = (
    button,
    baseBgColor,
    hoverBgColor,
    textColor
  ) => {
    button.style.cssText = `
      padding: 8px 16px;
      border: none;
      border-radius: 6px;
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
      background: ${baseBgColor};
      color: ${textColor};
      transition: background-color 0.2s ease, transform 0.2s ease, box-shadow 0.2s ease;
    `;
    button.onmouseover = () => {
      button.style.transform = 'scale(1.03)';
      button.style.boxShadow = '0 2px 8px rgba(0,0,0,0.1)';
      button.style.backgroundColor = hoverBgColor;
    };
    button.onmouseout = () => {
      button.style.transform = 'scale(1)';
      button.style.boxShadow = 'none';
      button.style.backgroundColor = baseBgColor;
    };
  };

  // Apply styles to main modal buttons
  applyButtonHoverStyles(closeOverlayBtn, '#e0e0e0', '#d0d0d0', '#333');
  applyButtonHoverStyles(applyBtn, '#27ae60', '#229954', 'white');
  applyButtonHoverStyles(rewriteBtn, '#007bff', '#0056b3', 'white');

  closeOverlayBtn.onclick = () => {
    overlay.remove();
  };

  // Preserve original logic for Apply button, with updated button styling
  applyBtn.onclick = () => {
    const updatedText = originalTextArea.value;
    const initialOriginalText = savedRange?.toString(); // Saved for revert

    if (savedRange) {
      savedRange.deleteContents();

      const wrapper = document.createElement('span');
      wrapper.textContent = updatedText;
      wrapper.style.backgroundColor = '#b7d9ff';
      wrapper.style.borderRadius = '4px';
      wrapper.style.padding = '2px 4px';
      wrapper.className = 'ai-edit-block';

      const buttonContainer = document.createElement('span');
      buttonContainer.style.marginLeft = '6px';

      const approveBtn = document.createElement('button');
      approveBtn.textContent = 'Looks good!';
      // Apply hover styles for approve button
      applyButtonHoverStyles(approveBtn, '#4caf50', '#429e46', 'white');
      // Make approve button smaller
      approveBtn.style.padding = '1px 6px';
      approveBtn.style.fontSize = '11px';
      approveBtn.style.marginRight = '4px'; // Specific margin

      const revertBtn = document.createElement('button');
      revertBtn.textContent = 'Revert';
      // Apply hover styles for revert button
      applyButtonHoverStyles(revertBtn, '#800020', '#6b001a', 'white');
      // Make revert button smaller
      revertBtn.style.padding = '1px 6px';
      revertBtn.style.fontSize = '11px';

      buttonContainer.appendChild(approveBtn);
      buttonContainer.appendChild(revertBtn);

      savedRange.insertNode(buttonContainer);
      savedRange.insertNode(wrapper);

      approveBtn.onclick = () => {
        wrapper.style.backgroundColor = '';
        buttonContainer.remove();
        if (window.getSelection) {
          const selection = window.getSelection();
          if (selection.empty) {
            selection.empty();
          } else if (selection.removeAllRanges) {
            // Added for robustness
            selection.removeAllRanges();
          }
        }
      };

      revertBtn.onclick = () => {
        wrapper.textContent = initialOriginalText;
        wrapper.style.backgroundColor = '';
        buttonContainer.remove();
      };
    }

    document.getElementById('ai-rewrite-overlay')?.remove();
  };

  // Preserve original logic for Rewrite button
  rewriteBtn.onclick = async () => {
    rewriteBtn.innerHTML = 'Rewriting...';
    rewriteBtn.disabled = true;
    rewriteBtn.style.animation = 'glow 1s infinite alternate';

    try {
      const { sessionKey } = await chrome.storage.local.get('sessionKey');
      if (!sessionKey) {
        await showLoginModal();
        overlay.remove(); // This closes the modal if login is required and user cancels/fails
        rewriteBtn.innerHTML = 'Rewrite with AI';
        rewriteBtn.disabled = false;
        rewriteBtn.style.animation = '';
        return;
      }

      const headers = {
        'Content-Type': 'application/json',
        Authorization: sessionKey,
      };

      const payload = {
        emailContent: originalTextArea.value,
        userInput: suggestionTextArea.value,
      };
      originalTextArea.value = '';
      // Calls streamSSEToTextarea, which targets the modal's originalTextArea
      // The modal remains open after rewrite for user to click 'Apply'
      await streamSSEToTextarea(
        'http://localhost:8080/api/email/rewrite',
        payload,
        headers,
        originalTextArea
      );
    } catch (error) {
      console.error('Error during AI rewrite:', error);
      alert(`Rewrite failed: ${error.message}`);
    } finally {
      rewriteBtn.innerHTML = 'Rewrite with AI';
      rewriteBtn.disabled = false;
      rewriteBtn.style.animation = '';
    }
  };
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
  // const url = 'http://localhost:8080/api/email/rewrite';

  // const payload = {
  //   emailContent: originalText,
  //   tone: 'professional',
  //   length: null,
  //   userInput: '',
  // };
  try {
    if (originalText.length > limit) {
      throw new Error(
        `The text selection is too large, please select a smaller text for accurate results.`
      );
    }
    const result = await chrome.storage.local.get('sessionKey');
    const sessionKey = result.sessionKey;

    if (!sessionKey) {
      await showLoginModal();
      return;
    }
    showRewriteOverlay(originalText);
    // const headers = {
    //   'Content-Type': 'application/json',
    //   Authorization: sessionKey,
    // };

    // await streamSSEWithInjection(url, payload, 1, originalText, headers); // Pass headers
  } catch (err) {
    console.error('Rewrite failed:', err);
    showErrorModal(err.message, null, null);
  } finally {
    pen.innerText = '✨';
    pen.style.display = 'none';
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
    button.style.backgroundColor = '#800020';
    button.style.color = '#ffffff';
    button.style.border = '1px solid #ffffff';
  } else if (className.includes('ai-subject-button')) {
    button.style.backgroundColor = 'rgba(15, 136, 138, 0.85)';
    button.style.color = '#ffffff';
    button.style.border = '1px solid #ffffff';
  }

  return button;
};

function createStyleButton() {
  document.querySelector(`.add-style-btn`)?.remove();

  const btn = document.createElement('button');

  btn.textContent = '✒️';
  btn.className = 'add-style-btn'; // Assign a class for potential external styling
  btn.setAttribute('data-tooltip', 'Add your own writing style'); // Tooltip
  btn.style.cssText = `
       padding: 5px; /* Equal padding on all sides for a squarish look */
        font-size: 16px; /* Adjust font size to make the pen icon visible within the small button */

        cursor: pointer;
        border: 1px solid #ccc;
        border-radius: 6px; /* Keep consistent border-radius */
        background: white;
        color: #333;
        box-shadow: 0 1px 3px rgba(0,0,0,0.1);
        transition: background 0.2s ease;
        white-space: nowrap; /* Ensure no wrapping, though less critical for single icon */

        /* Positioning/Sizing for a small button */
        width: 32px; /* Explicit width for squarish shape, adjust as needed */
        height: 32px; /* Explicit height for squarish shape, adjust as needed */
        display: inline-flex; /* Use flex to center the icon */
        align-items: center; /* Vertically center the icon */
        justify-content: center; /* Horizontally center the icon */
        box-sizing: border-box; /* Include padding/border in width/height */

        /* Margin adjustment (may need fine-tuning based on final position) */
        margin-left: 5px; /* Small margin to separate from AI Write button */
    `;
  // Add hover effects for better UX
  btn.onmouseover = () => (btn.style.background = '#e0e0e0');
  btn.onmouseout = () => (btn.style.background = 'white');

  btn.addEventListener('click', () => {
    // Prevent multiple style box overlays
    if (document.getElementById('style-input-overlay')) {
      console.warn('Style input overlay already open. Preventing duplicate.');
      return;
    }

    // --- Create Overlay Container ---
    const overlay = document.createElement('div');
    overlay.id = 'style-input-overlay';
    overlay.style.cssText = `
            position: fixed; /* Fixed position to cover the entire viewport */
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.5); /* Semi-transparent black background */
            display: flex;
            justify-content: center;
            align-items: center;
            z-index: 10000; /* High z-index to ensure it's on top */
        `;

    // --- Create Style Box (the actual modal content) ---
    const styleBox = document.createElement('div');
    styleBox.className = 'style-input-box';
    styleBox.style.cssText = `
            background: white;
            padding: 20px;
            border-radius: 8px;
            box-shadow: 0 5px 15px rgba(0, 0, 0, 0.3);
            width: 90%; /* Responsive width */
            max-width: 500px; /* Max width for readability */
            display: flex;
            flex-direction: column;
            gap: 10px;
            position: relative;
        `;

    const title = document.createElement('h3');
    title.textContent = 'Paste Your Writing Style';
    title.style.margin = '0 0 10px 0';
    title.style.color = '#333';
    title.style.textAlign = 'center';

    const textarea = document.createElement('textarea');
    textarea.placeholder = 'Paste your writing style here (max 100 words)...';
    textarea.style.cssText = `
            width: 100%;
            height: 120px; /* Slightly taller textarea */
            font-size: 14px;
            padding: 10px;
            border: 1px solid #ddd;
            border-radius: 5px;
            resize: vertical; /* Allow vertical resizing */
            box-sizing: border-box; /* Include padding in element's total width/height */
            outline: none;
        `;

    const wordCountDisplay = document.createElement('div');
    wordCountDisplay.style.cssText = `
            font-size: 11px;
            color: #777;
            text-align: right;
            margin-top: -5px; /* Adjust spacing */
        `;
    let currentWordCount = 0;
    const maxWords = 100;

    // Word limit logic
    textarea.addEventListener('input', () => {
      const text = textarea.value.trim();
      const words = text.split(/\s+/).filter((word) => word.length > 0);
      currentWordCount = words.length;

      if (currentWordCount > maxWords) {
        // Trim the text to 100 words
        textarea.value =
          words.slice(0, maxWords).join(' ') + (text.endsWith(' ') ? ' ' : '');
        currentWordCount = maxWords; // Update count after trimming
        wordCountDisplay.style.color = 'red'; // Indicate limit reached
      } else {
        wordCountDisplay.style.color = '#777'; // Reset color
      }
      wordCountDisplay.textContent = `${currentWordCount}/${maxWords} words`;
    });

    // Initialize word count display
    textarea.dispatchEvent(new Event('input'));

    const btnRow = document.createElement('div');
    btnRow.style.cssText = `
            display: flex;
            justify-content: flex-end; /* Align buttons to the right */
            gap: 10px; /* Space between buttons */
            margin-top: 15px; /* Space above buttons */
        `;

    const saveBtn = document.createElement('button');
    saveBtn.textContent = 'Save Style';
    saveBtn.style.cssText = `
            padding: 8px 16px;
            background: #007bff;
            color: white;
            border: none;
            border-radius: 5px;
            cursor: pointer;
            font-size: 14px;
            transition: background 0.2s ease;
        `;
    saveBtn.onmouseover = () => (saveBtn.style.background = '#0056b3');
    saveBtn.onmouseout = () => (saveBtn.style.background = '#007bff');

    const closeBtn = document.createElement('button');
    closeBtn.textContent = 'Close';
    closeBtn.style.cssText = `
            padding: 8px 16px;
            border: 1px solid #ccc;
            background: white;
            border-radius: 5px;
            cursor: pointer;
            font-size: 14px;
            transition: background 0.2s ease;
        `;
    closeBtn.onmouseover = () => (closeBtn.style.background = '#f0f0f0');
    closeBtn.onmouseout = () => (closeBtn.style.background = 'white');

    // Event listeners for the overlay buttons
    closeBtn.addEventListener('click', () => {
      if (overlay.parentNode) {
        overlay.remove(); // Removes the entire overlay
      }
    });

    // saveBtn.addEventListener('click', () => {
    //   const text = textarea.value.trim();
    //   if (text === '') {
    //     // Use === '' to specifically check if empty after trim
    //     alert('Please enter some text!');
    //     return;
    //   }
    //   // Ensure the final text respects the word limit
    //   const words = text.split(/\s+/).filter((word) => word.length > 0);
    //   const finalTextStyle = words.slice(0, maxWords).join(' ');

    //   console.log('User style saved:', finalTextStyle);
    //   // Here you would typically save `finalTextStyle` to chrome.storage.local
    //   // or pass it to another part of your extension.

    //   if (overlay.parentNode) {
    //     overlay.remove(); // Removes the entire overlay
    //   }
    // });

    // --- MODIFIED saveBtn.addEventListener for API Call ---
    saveBtn.addEventListener('click', async () => {
      // Made async to use await
      const text = textarea.value.trim();
      if (text === '') {
        alert('Please enter some text!');
        return;
      }
      const words = text.split(/\s+/).filter((word) => word.length > 0);
      const finalTextStyle = words.slice(0, maxWords).join(' ');

      console.log('Attempting to save user style:', finalTextStyle);

      // TODO: Get the actual sessionKey dynamically.
      const result = await chrome.storage.local.get('sessionKey');
      const sessionKey = result.sessionKey;

      if (!sessionKey) {
        await showLoginModal();
        return;
      }

      const endpoint = '/api/email/style';
      const headers = {
        'Content-Type': 'application/json',
        Authorization: sessionKey, // Add the Authorization header
      };

      try {
        const response = await fetch(`http://localhost:8080${endpoint}`, {
          method: 'POST',
          headers: headers,
          body: JSON.stringify({
            emailContent: null, // As per your controller's expected body
            tone: null,
            length: null,
            userInput: finalTextStyle, // Send the content from the textarea
          }),
        });

        if (response.ok) {
          const result = await response.text(); // Or .json() if your body is JSON
          console.log('Style saved successfully:', result);
          alert('Style saved successfully!'); // Provide user feedback
          if (overlay.parentNode) {
            overlay.remove();
          }
        } else {
          const errorText = await response.json();
          throw new Error(errorText.error);
        }
      } catch (error) {
        if (error.message == 'Please login') {
          showLoginModal();
          return;
        } else {
          alert(`Error saving style: ${error.message}`);
        }
      }
    });
    // --- END MODIFIED saveBtn.addEventListener ---

    // Assemble the style box
    btnRow.appendChild(saveBtn);
    btnRow.appendChild(closeBtn);
    styleBox.appendChild(title);
    styleBox.appendChild(textarea);
    styleBox.appendChild(wordCountDisplay); // Add word count display below textarea
    styleBox.appendChild(btnRow);

    // Append style box to the overlay
    overlay.appendChild(styleBox);

    // Inject the overlay into the document body
    document.body.appendChild(overlay);
    textarea.focus(); // Focus on the textarea when the overlay appears
  });

  console.log('Style button created (not yet injected):', btn);
  return btn; // Return the created button
}

const injectButton = async (val) => {
  // again if not stored
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
    subjectButton.style.marginRight = '5px';
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
  const btst = createStyleButton();
  const container = document.createElement('div');
  container.className = 'ai-toolbar-container';
  container.append(aiButton, btst, toneDropdown, lengthDropdown);
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

    const result = await chrome.storage.local.get('sessionKey');
    const sessionKey = result.sessionKey;

    if (!sessionKey) {
      await showLoginModal();
      return;
    }

    const headers = {
      'Content-Type': 'application/json',
      Authorization: sessionKey,
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

      await streamSSEWithInjection(url, payload, 0, '', headers);
    } else {
      const response = await fetch(`http://localhost:8080${endpoint}`, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify({
          emailContent: getEmailContent(),
          tone: tone || 'professional',
          length: length || 'appropriate',
          userInput: composeBox?.innerText.trim() || '',
        }),
      });

      if (!response.ok) {
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
    if (error.message == 'Please login') {
      showLoginModal();
    } else {
      console.log(error.message);
      showErrorModal(error.message, null, null);
    }
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
