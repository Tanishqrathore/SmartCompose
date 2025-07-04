console.log('Email_Write');

let savedRange = null;

//for output streaming
async function streamSSEWithInjection(url, payload, flag, originalText) {
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
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok || !response.body) {
      throw new Error(`Streaming failed: ${response.statusText}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';

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
            console.log(chunk);
            rewrittenSpan.appendChild(document.createTextNode(chunk));
          }
        }
      }
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
    await streamSSEWithInjection(url, payload, 1, originalText);
  } catch (err) {
    console.error('Rewrite failed:', err);
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

const injectButton = (val) => {
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

    if (endpoint !== '/api/email/subject') {
      const url = `http://localhost:8080${endpoint}`;
      const payload = {
        emailContent: getEmailContent(),
        tone: tone || 'professional',
        length: length || 'appropriate',
        userInput: composeBox?.innerText.trim() || '',
      };
      await streamSSEWithInjection(url, payload, 0, '');
    } else {
      const response = await fetch(`http://localhost:8080${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          emailContent: getEmailContent(),
          tone: tone || 'professional',
          length: length || 'appropriate',
          userInput: composeBox?.innerText.trim() || '',
        }),
      });

      if (!response.ok) throw new Error('API Request Failed');
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
