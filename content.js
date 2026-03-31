/**
 * Claude Timestamp Extension
 * 
 * Prepends the current date/time to every outgoing message on claude.ai.
 * 
 * Security posture:
 *   - DOM-only: never touches network layer, auth tokens, or request/response bodies
 *   - No background service worker, no storage, no external requests
 *   - Scoped exclusively to claude.ai via manifest
 *   - Functionally equivalent to the user typing the timestamp themselves
 * 
 * Implementation notes:
 *   - Claude.ai uses a ProseMirror contenteditable editor (not a <textarea>)
 *   - ProseMirror structures content as <p> elements inside the contenteditable div
 *   - We use document.execCommand('insertText') to insert the timestamp because
 *     ProseMirror listens for beforeinput/input events triggered by execCommand,
 *     keeping its internal document model in sync with the DOM change
 *   - execCommand is deprecated but still universally supported and is the most
 *     reliable way to programmatically edit contenteditable fields in a way that
 *     framework-managed editors will recognize
 */
(function () {
  'use strict';

  // --- Configuration ---
  // Timezone auto-detected from the browser. Format is US English, 12-hour.
  // Example output: [Sat, Mar 28, 2026, 2:15 PM EDT]
  function getTimestamp() {
    const now = new Date();
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const formatted = now.toLocaleString('en-US', {
      timeZone: tz,
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      timeZoneName: 'short'
    });
    return '[' + formatted + ']';
  }

  // --- Editor detection ---
  // Claude.ai's message input is a contenteditable div managed by ProseMirror.
  // This selector may need updating if Anthropic changes their DOM structure.
  function findEditor() {
    const el = document.querySelector(
      'div[contenteditable="true"].ProseMirror'
    );
    // Fallback: any contenteditable div if the class-based selector fails
    return el || document.querySelector('div[contenteditable="true"]');
  }

  function editorHasContent(editor) {
    const text = editor.innerText.trim();
    return text.length > 0;
  }

  // Check if the editor already starts with a timestamp to prevent stacking.
  // Matches the pattern: [Day, Mon DD, YYYY, H:MM AM/PM TZ]
  function editorAlreadyHasTimestamp(editor) {
    const text = editor.innerText.trimStart();
    return /^\[[A-Z][a-z]{2},\s/.test(text);
  }

  // --- Timestamp injection ---
  // Moves cursor to position 0 in the editor, inserts the timestamp line,
  // then lets the original event (Enter / click) propagate to send the message.
  function prependTimestamp(editor) {
    const timestamp = getTimestamp();
    const sel = window.getSelection();
    if (!sel) return false;

    // Find the first text-containing node in the editor.
    // ProseMirror wraps lines in <p> elements, so the first text node
    // is typically inside the first <p>.
    let targetNode = editor;
    let offset = 0;

    // Walk into the first child nodes to find the actual text node
    // or at minimum the first element we can position a cursor in.
    let walker = editor;
    while (walker.firstChild) {
      walker = walker.firstChild;
    }
    targetNode = walker;

    // Position cursor at the very start
    const range = document.createRange();
    if (targetNode.nodeType === Node.TEXT_NODE) {
      range.setStart(targetNode, 0);
    } else {
      range.setStart(targetNode, 0);
    }
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);

    // Insert timestamp + newline via execCommand so ProseMirror stays in sync.
    // The newline separates the timestamp from the user's actual message.
    document.execCommand('insertText', false, timestamp + '\n');

    return true;
  }

  // --- Event interception ---
  // We listen in the CAPTURING phase so we act before Claude's own handlers.
  // We do NOT call preventDefault or stopPropagation — the original event
  // continues to propagate normally and triggers the send.

  // Track whether we just injected a timestamp to avoid double-injection
  // if both keydown and click fire for the same send action.
  let justInjected = false;

  function handleSendAttempt() {
    if (justInjected) return;
    const editor = findEditor();
    if (!editor || !editorHasContent(editor)) return;
    if (editorAlreadyHasTimestamp(editor)) return;

    if (prependTimestamp(editor)) {
      justInjected = true;
      // Reset the guard after a longer delay to be safe
      setTimeout(() => { justInjected = false; }, 2000);
    }
  }

  // Enter key (without Shift, which is newline in Claude.ai)
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      const editor = findEditor();
      if (editor && editor.contains(document.activeElement) || document.activeElement === editor) {
        handleSendAttempt();
      }
    }
  }, true); // true = capturing phase

  // Send button click
  // The send button is typically a <button> near the editor with an SVG arrow.
  // We use event delegation: any click that reaches a <button> inside the
  // composer/input area triggers a check.
  document.addEventListener('click', function (e) {
    const button = e.target.closest('button');
    if (!button) return;

    // Heuristic: the send button is near the editor in the DOM.
    // Check if there's an editor with content in the same form/container.
    const editor = findEditor();
    if (!editor || !editorHasContent(editor)) return;

    // Exclude buttons that are clearly not the send button:
    // dropdowns, menus, model selectors, popover triggers, etc.
    if (isNonSendButton(button)) return;

    // Check if this button is plausibly a send button:
    // - It has an aria-label suggesting "send"
    // - OR it's within the immediate vicinity of the editor
    const ariaLabel = (button.getAttribute('aria-label') || '').toLowerCase();
    const isSendButton =
      ariaLabel.includes('send') ||
      // Fallback: button is within a reasonable ancestor of the editor
      buttonIsNearEditor(button, editor);

    if (isSendButton) {
      handleSendAttempt();
    }
  }, true); // true = capturing phase

  // Exclude buttons that are UI controls rather than the send button.
  // The model selector, attachment menus, and other dropdowns share the
  // same composer area, so proximity alone can't distinguish them.
  function isNonSendButton(button) {
    // Buttons that open menus or popups
    if (button.getAttribute('aria-haspopup')) return true;
    if (button.getAttribute('aria-expanded') !== null) return true;

    // Buttons with roles indicating non-send controls
    const role = (button.getAttribute('role') || '').toLowerCase();
    if (['combobox', 'listbox', 'menu', 'menuitem', 'option', 'tab'].includes(role)) return true;

    // Check aria-label for known non-send patterns
    const ariaLabel = (button.getAttribute('aria-label') || '').toLowerCase();
    const nonSendLabels = ['model', 'attach', 'upload', 'menu', 'close', 'cancel',
                           'stop', 'toggle', 'expand', 'collapse', 'settings',
                           'copy', 'edit', 'delete', 'retry', 'regenerate'];
    if (nonSendLabels.some(label => ariaLabel.includes(label))) return true;

    // Buttons inside elements with popover-like roles
    const popoverParent = button.closest('[role="dialog"], [role="menu"], [role="listbox"], [role="combobox"], [data-radix-popper-content-wrapper]');
    if (popoverParent) return true;

    return false;
  }

  // Check if a button and the editor share a common ancestor within 4 levels.
  // This is a conservative heuristic to avoid triggering on unrelated buttons
  // (e.g., sidebar navigation, settings, model selector dropdowns).
  function buttonIsNearEditor(button, editor) {
    let ancestor = editor;
    for (let i = 0; i < 4; i++) {
      if (!ancestor || ancestor === document.body) return false;
      ancestor = ancestor.parentElement;
      if (ancestor && ancestor.contains(button)) return true;
    }
    return false;
  }

  // --- Startup confirmation ---
  console.log('[Claude Timestamp] Extension loaded. Timestamps will be prepended to outgoing messages.');

})();
