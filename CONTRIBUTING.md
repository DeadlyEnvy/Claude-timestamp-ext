# Contributing

## The most likely fix you'll need to make

Anthropic will eventually change their DOM structure. When they do, the editor
selector in `content.js` will break and timestamps will silently stop
appearing.

To fix it:

1. Open claude.ai and press F12
2. Click into the message input area
3. In the Elements panel, find the contenteditable div and note its classes
4. Update the `findEditor()` function in `content.js` with the new selector
5. Test by sending a message and confirming the timestamp appears

## Design constraints

If you're submitting a PR, please keep these principles intact:

- **DOM-only.** The extension must never interact with the network layer. No
  fetch interception, no webRequest, no XHR hooks. This is the core security
  property.
- **No new permissions.** The manifest should remain as minimal as possible. If
  your change requires a new permission, it's probably the wrong approach.
- **No storage.** The extension should remain stateless. No localStorage, no
  chrome.storage.
- **No build step.** The code should remain readable as-is, with no
  transpilation, bundling, or minification.
- **No dependencies.** No npm, no external libraries. It's one JS file.

## Code style

Nothing formal. Keep it readable, comment the non-obvious parts, and don't
make it longer than it needs to be.
