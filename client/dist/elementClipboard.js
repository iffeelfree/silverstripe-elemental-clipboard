/**
 * elementClipboard.js
 *
 * Copy/paste elemental blocks via localStorage.
 * Vanilla JS — no framework, no build step beyond your existing setup.
 *
 * The clipboard stores a populate-compatible fixture parcel so the
 * same format works for both the CMS clipboard and saved layout files.
 */

(function () {
  'use strict';

  const STORAGE_KEY  = 'ss_element_clipboard';
  const EXPORT_URL    = '/admin/elementclipboard/export';
  const EXPORTALL_URL = '/admin/elementclipboard/exportall';
  const IMPORT_URL    = '/admin/elementclipboard/import';

  // ---------------------------------------------------------------------------
  // localStorage — read/write/clear the clipboard parcel
  // ---------------------------------------------------------------------------

  const clip = {
    write(parcel)  { localStorage.setItem(STORAGE_KEY, JSON.stringify(parcel)); },
    read()         { try { return JSON.parse(localStorage.getItem(STORAGE_KEY)); } catch { return null; } },
    clear()        { localStorage.removeItem(STORAGE_KEY); refreshAllAreas(); },
    has()          { return !!localStorage.getItem(STORAGE_KEY); },
  };

  // ---------------------------------------------------------------------------
  // Silverstripe CSRF token
  // ---------------------------------------------------------------------------

  function getSecurityID() {
    return document.querySelector('input[name="SecurityID"]')?.value ?? '';
  }

  // ---------------------------------------------------------------------------
  // Toast notification
  // ---------------------------------------------------------------------------

  function toast(message, type = 'success') {
    const el = document.createElement('div');
    el.className = `ec-toast ec-toast--${type}`;
    el.textContent = message;
    document.body.appendChild(el);
    requestAnimationFrame(() => el.classList.add('ec-toast--visible'));
    setTimeout(() => { el.classList.remove('ec-toast--visible'); setTimeout(() => el.remove(), 300); }, 3000);
  }

  // ---------------------------------------------------------------------------
  // COPY — fetch fixture parcel from server, store in localStorage
  // ---------------------------------------------------------------------------

  async function copyElement(elementID) {
    try {
      const url    = `${EXPORT_URL}?elementID=${elementID}&SecurityID=${encodeURIComponent(getSecurityID())}`;
      const res    = await fetch(url, { credentials: 'same-origin' });
      const parcel = await res.json();

      if (parcel.error) throw new Error(parcel.error);

      clip.write(parcel);
      toast(`Copied: "${parcel.source_element_title}" from ${parcel.source_page_title}`);
      refreshAllAreas();

    } catch (err) {
      console.error('[ElementClipboard] Copy failed:', err);
      toast(`Copy failed: ${err.message}`, 'error');
    }
  }

  async function copyAllElements(areaID) {
    try {
      const url    = `${EXPORTALL_URL}?areaID=${areaID}&SecurityID=${encodeURIComponent(getSecurityID())}`;
      const res    = await fetch(url, { credentials: 'same-origin' });
      const parcel = await res.json();

      if (parcel.error) throw new Error(parcel.error);

      clip.write(parcel);
      toast(`Copied: ${parcel.source_element_title}`);
      refreshAllAreas();

    } catch (err) {
      console.error('[ElementClipboard] Copy all failed:', err);
      toast(`Copy all failed: ${err.message}`, 'error');
    }
  }

  // ---------------------------------------------------------------------------
  // PASTE — POST fixture parcel to server, append to target area, reload
  // ---------------------------------------------------------------------------

  async function pasteElement(areaID) {
    const parcel = clip.read();
    if (!parcel) { toast('Nothing on clipboard', 'warning'); return; }

    const confirmed = window.confirm(
      `Paste "${parcel.source_element_title}" (from "${parcel.source_page_title}") to the bottom of this area?`
    );
    if (!confirmed) return;

    try {
      const res  = await fetch(`${IMPORT_URL}?SecurityID=${encodeURIComponent(getSecurityID())}`, {
        method:      'POST',
        credentials: 'same-origin',
        headers:     { 'Content-Type': 'application/json' },
        body:        JSON.stringify({ areaID, parcel }),
      });
      const data = await res.json();

      if (data.error) throw new Error(data.error);

      toast(`Pasted "${parcel.source_element_title}" — reloading...`);
      setTimeout(() => window.location.reload(), 1200);

    } catch (err) {
      console.error('[ElementClipboard] Paste failed:', err);
      toast(`Paste failed: ${err.message}`, 'error');
    }
  }

  // ---------------------------------------------------------------------------
  // Inject "Copy to clipboard" into a single block's ••• action menu
  //
  // actionMenuEl  = div#element-editor-actions-{N}
  //                 (rendered by ActionMenu with class action-menu)
  // Called both from injectIntoArea (for already-loaded blocks) and from
  // the MutationObserver (for blocks that arrive via GraphQL after the area mounts).
  // ---------------------------------------------------------------------------

  function injectCopyBtn(actionMenuEl) {
    if (actionMenuEl.querySelector('[data-ec-copy]')) return;

    const dropdown = actionMenuEl.querySelector('.action-menu__dropdown');
    if (!dropdown) return;

    // Derive element ID from the block icon: <i id="element-icon-{N}">
    const blockEl   = actionMenuEl.closest('.element-editor__element');
    const iconEl    = blockEl?.querySelector('[id^="element-icon-"]');
    const elementID = iconEl?.id.replace('element-icon-', '');
    if (!elementID) return;

    // Derive area ID from the closest elemental area container
    const areaEl = actionMenuEl.closest('.element-editor__container');
    const areaID = areaEl?.dataset.schema && JSON.parse(areaEl.dataset.schema)['elemental-area-id'];

    const divider = document.createElement('div');
    divider.className = 'dropdown-divider';
    dropdown.appendChild(divider);
    dropdown.appendChild(buildCopyButton(elementID));

    if (areaID) {
      dropdown.appendChild(buildCopyAllButton(areaID));
    }
  }

  // ---------------------------------------------------------------------------
  // Inject clipboard bar + paste button into a single elemental area node
  // ---------------------------------------------------------------------------

  function injectIntoArea(areaEl) {
    // Area ID lives in data-schema JSON: {"elemental-area-id": X, ...}
    const areaID = areaEl.dataset.schema && JSON.parse(areaEl.dataset.schema)['elemental-area-id'];
    if (!areaID) return;

    const parcel    = clip.read();
    const parcelKey = parcel?.exported_at ?? null;

    // 1. Combined clipboard strip — only re-render when the parcel actually changes.
    //    Use exported_at as a cache key so the 600ms poll doesn't thrash the DOM.
    const existingBar = areaEl.previousElementSibling?.dataset.ecBar
      ? areaEl.previousElementSibling
      : null;

    if (existingBar?.dataset.ecBarKey !== parcelKey) {
      existingBar?.remove();
      if (parcel) {
        const strip = buildClipboardStrip(parcel, areaID);
        strip.dataset.ecBarKey = parcelKey;
        areaEl.insertAdjacentElement('beforebegin', strip);
      }
    }

    // 2. Copy buttons — find every action menu wrapper inside this area
    areaEl.querySelectorAll('.action-menu.element-editor-header__actions-dropdown').forEach(injectCopyBtn);
  }

  // ---------------------------------------------------------------------------
  // DOM builders
  // ---------------------------------------------------------------------------

  function buildClipboardStrip(parcel, areaID) {
    const bar = document.createElement('div');
    bar.className = 'ec-clipboard-bar';
    bar.dataset.ecBar = '1';
    bar.innerHTML = `
      <svg class="ec-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" aria-hidden="true">
        <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/>
        <rect x="9" y="3" width="6" height="4" rx="1"/><path d="m9 12 2 2 4-4"/>
      </svg>
      <span class="ec-bar-label">Clipboard: <strong>${esc(parcel.source_element_title)}</strong> &mdash; from <em>${esc(parcel.source_page_title)}</em></span>
      <button class="ec-paste-btn" type="button" data-ec-paste="${areaID}">
        <svg class="ec-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" aria-hidden="true">
          <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/>
          <rect x="9" y="3" width="6" height="4" rx="1"/><path d="M12 12v6m-3-3 3 3 3-3"/>
        </svg>
        Paste block
      </button>
      <button class="ec-clear-btn" type="button">clear</button>
    `;
    bar.querySelector('.ec-paste-btn').addEventListener('click', () => pasteElement(areaID));
    bar.querySelector('.ec-clear-btn').addEventListener('click', () => {
      clip.clear();
      toast('Clipboard cleared', 'warning');
    });
    return bar;
  }

  function buildCopyButton(elementID) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'ec-dropdown-item dropdown-item';
    btn.dataset.ecCopy = elementID;
    btn.innerHTML = `
      <svg class="ec-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" aria-hidden="true">
        <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/>
        <rect x="9" y="3" width="6" height="4" rx="1"/>
      </svg> Copy to clipboard
    `;
    btn.addEventListener('click', () => copyElement(elementID));
    return btn;
  }

  function buildCopyAllButton(areaID) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'ec-dropdown-item dropdown-item';
    btn.dataset.ecCopyAll = areaID;
    btn.innerHTML = `
      <svg class="ec-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" aria-hidden="true">
        <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/>
        <rect x="9" y="3" width="6" height="4" rx="1"/>
        <path d="M4 15h2M4 11h2M4 7h2"/>
      </svg> Copy all to clipboard
    `;
    btn.addEventListener('click', () => copyAllElements(areaID));
    return btn;
  }

  // ---------------------------------------------------------------------------
  // Refresh — called after copy/clear and by the poll
  // ---------------------------------------------------------------------------

  function refreshAllAreas() {
    document.querySelectorAll('.element-editor__container').forEach(injectIntoArea);
    document.querySelectorAll('.action-menu.element-editor-header__actions-dropdown').forEach(injectCopyBtn);
  }

  // ---------------------------------------------------------------------------
  // Poll every 600 ms — handles async GraphQL block loading without needing
  // a MutationObserver that races against React's render cycle.
  // injectCopyBtn and injectIntoArea are both idempotent (guard on data-ec-*).
  // ---------------------------------------------------------------------------

  console.log('[ElementClipboard] loaded');
  window.__ecLoaded = true;

  setInterval(refreshAllAreas, 600);

  // ---------------------------------------------------------------------------
  // Utility
  // ---------------------------------------------------------------------------

  function esc(str) {
    return String(str ?? '')
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

})();
