# Claude Timestamp

A minimal Chrome/Brave extension that prepends the current date and time to
every message you send on claude.ai.

Claude doesn't have a built-in clock. It knows today's date but not the current
time unless it burns a tool call to check. This extension solves that by
injecting a timestamp into each outgoing message — functionally identical to
typing it yourself, just automatic.

## What it does

Before each message is sent, the extension inserts a line like:

    [Sat, Mar 28, 2026, 2:15 PM EDT]

at the top of your message. Claude sees this as part of your text and can
reference the time naturally throughout the conversation. Timezone is
auto-detected from your browser.

## What it doesn't do

- **No network access.** It never touches fetch, XMLHttpRequest, WebSocket, or
  any network API. It cannot see requests, responses, auth tokens, or session
  cookies.
- **No storage.** No localStorage, no chrome.storage, no cookies. Nothing is
  persisted anywhere.
- **No background process.** No service worker, no background page. The content
  script runs only on claude.ai pages.
- **No broad permissions.** The manifest requests nothing beyond a content
  script scoped to `https://claude.ai/*`.

## Why this design

The obvious way to build this would be to operate at the network layer —
intercepting API requests and modifying them in transit. That approach is more
robust against DOM changes, but it requires permissions that are dangerously
overpowered for the task. Any extension with network-level access has a much
larger attack surface if forked or compromised.

This extension takes the opposite approach. It puts text into a text box.
That's the entire capability surface. It never touches the network layer, so
the permissions footprint is as small as it can possibly be.

The tradeoff is fragility — if Anthropic changes their DOM structure, the
editor selector may break. But a broken selector is obvious (timestamps stop
appearing) and easy to fix. That's a better failure mode than "secure by
default but one patch away from dangerous."

## Installation

1. Clone or download this repo
2. Open `chrome://extensions/` (or `brave://extensions/`)
3. Enable **Developer mode** (toggle in the top right)
4. Click **Load unpacked**
5. Select the `claude-timestamp-ext` folder
6. Navigate to claude.ai — you should see a console log confirming the
   extension is active:
   `[Claude Timestamp] Extension loaded. Timestamps will be prepended to outgoing messages.`

## How it works

Claude.ai uses a [Tiptap](https://tiptap.dev/) editor (built on
[ProseMirror](https://prosemirror.net/)) with a `contenteditable` div. The
extension:

1. Listens for Enter keydown (without Shift) and send button clicks in the
   capturing phase
2. Moves the cursor to position 0 in the editor
3. Inserts the timestamp via `document.execCommand('insertText')`, which
   triggers the input events that ProseMirror/Tiptap expect, keeping the
   editor's internal state in sync
4. Lets the original event propagate normally to trigger the send

The timestamp is generated fresh at send time, so it reflects the moment you
actually sent the message.

## Known limitations

- **DOM fragility.** The editor is found via
  `div[contenteditable="true"].ProseMirror`. If Anthropic changes their
  markup, this selector will break. The extension will simply stop prepending
  timestamps — it won't error or interfere. Update the selector in
  `content.js` to fix.

- **`execCommand` deprecation.** This API is deprecated but universally
  supported. It's currently the most reliable way to programmatically edit
  contenteditable fields in a way that framework-managed editors recognize.
  If browsers eventually remove it, the insertion method will need updating.

- **Send button heuristic.** The send button is detected by DOM proximity to
  the editor. If this heuristic misses, timestamps won't be prepended when
  clicking the button (Enter key still works).

## Auditing

The entire extension is ~120 lines of JavaScript in a single file
(`content.js`), a 12-line manifest, and two icon PNGs. You can read the whole
thing in a few minutes. There is no minification, no build step, no
dependencies.

## Uninstallation

Go to `chrome://extensions/` (or `brave://extensions/`), find "Claude
Timestamp," and click **Remove**. No data to clean up — the extension stores
nothing.

## License

MIT. See [LICENSE](LICENSE).
