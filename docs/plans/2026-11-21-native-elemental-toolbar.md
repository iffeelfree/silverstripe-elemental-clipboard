# Native elemental toolbar for clipboard actions — scoping plan

**Status:** scoping / investigation
**Date:** 2026-11-21
**Goal:** Replace the DOM-injection approach with proper elemental React integration, and add an ACF Extended–style icon toolbar on each block header (copy, paste, duplicate…), plus area-level copy all / paste.

## Verdict

Feasible. Elemental 6 already uses the extension points we need, through the admin Injector. Its own Duplicate, Archive and Move menu items are added exactly this way. The main cost is new build tooling (webpack/JSX), not unknown APIs.

## Current state (what we're replacing)

- `client/dist/elementClipboard.js` is vanilla JS inlined with `Requirements::customScript` from `ElementClipboardAdminExtension::onAfterInit`.
- A `setInterval(refreshAllAreas, 600)` poll scrapes the DOM:
  - It finds `.action-menu.element-editor-header__actions-dropdown`.
  - It reads the element ID from `#element-icon-{N}` and the area ID from `.element-editor__container[data-schema]`.
  - It appends `<button class="dropdown-item">` nodes into React-owned markup.
- After a paste it calls `window.location.reload()`.
- Turipark's `app/client/admin/save-layout-option.js` ("Save as layout option") copies the same hack and depends on our `[data-ec-copy]` button to position itself.

**Problems:** React can re-render over the injected nodes. The poll costs CPU and causes flicker. The selectors are private markup that can break on any elemental release. A full page reload throws away unsaved state. Keyboard and a11y behaviour doesn't match reactstrap's dropdown.

## Elemental extension points (verified in Turipark: elemental 6.2.3, admin 3.2.3)

From `vendor/dnadesign/silverstripe-elemental/client/src/boot/`:

| Injector name | What it is | Our use |
|---|---|---|
| `ElementActions` | The ••• dropdown, rendered inside `.element-editor-header__actions` | **Dropdown items** through `Injector.transform('element-actions')` HOCs. This is how `DuplicateAction` works. We can also wrap it to render **icon buttons just before the ••• toggle**, which is the ACF-style toolbar slot. |
| `ElementHeader` | Block header (drag handle, icon, title, actions) | Alternative toolbar slot. It's harder to target, because a HOC can only wrap the whole header. |
| `ElementToolbar` | The area toolbar holding "Add new block" | **Paste / Copy all** buttons next to "Add new block". This replaces the green strip, or hosts it. |
| `HoverBar` | The hover "+" between blocks | Stretch goal: a **"Paste here"** action at a position. |

Useful internals:
- **HOC pattern:** `const Action = (MenuComponent) => (props) => <MenuComponent {...props}>{props.children}<Item/></MenuComponent>`. Props include `element` (`id`, `canCreate`…), `type` (`broken`, `title`, `icon`) and `areaId`.
- **Refresh without reload:** `MoveAction` calls `actions.editor.forceReload(areaId)`, which is redux `{ type: 'FORCE_RELOAD', payload: { elementEditorId: areaId } }`. `ElementEditor` watches `forceRefetchElements` and re-fetches `api/readElements/{areaId}`.
- **Native duplicate:** `POST {controllerLink}/api/duplicate` with an `X-SecurityID` header. A toolbar "duplicate" icon can call this rather than reinventing it.
- **Not importable** from a third-party bundle (to verify in the spike): elemental's own modules (`AbstractAction`, `ElementEditorContext`, `state/editor/elementConfig`). Admin's exposed modules *are* importable as webpack externals: `react`, `reactstrap`, `lib/Injector`, `lib/Backend`, `lib/Config`, `i18n` and `classnames`. `AbstractAction` is about 20 lines around reactstrap's `DropdownItem`, so we can re-implement it.

## ACF Extended parity map

| ACFE layout control | Elemental today | Plan |
|---|---|---|
| Copy layout | Our dropdown item (hack) | Toolbar icon + native dropdown item |
| Paste layout (after this one) | Area strip, appends to bottom | Toolbar icon "paste below", needs a position param on `import` |
| Duplicate / clone | Native, in the dropdown | Toolbar icon calling the native endpoint |
| Add layout between | Native `HoverBar` "+" | Leave as is (maybe add "Paste here") |
| Collapse | Native caret | Leave as is |
| Remove | Native Archive, in the dropdown | Optional toolbar icon (needs a confirm) |
| Toggle / disable layout | No equivalent (closest is Unpublish) | Out of scope |
| Copy / paste all layouts | Our "Copy all" + strip | Area toolbar buttons beside "Add new block" |

## Target architecture

1. **Build pipeline:** `package.json` + `webpack.config.js` using `@silverstripe/webpack-config` (the same as elemental), with source in `client/src/` and built output committed to `client/dist/`. Externals come from admin, so the bundle stays small and shares React with the CMS.
2. **Asset loading:** replace inline `customScript` with `SilverStripe\Admin\LeftAndMain: extra_requirements_javascript/css` pointing at `ifeelfree/silverstripe-elemental-clipboard:client/dist/js/bundle.js`. This keeps the files cacheable and ordered after the admin and elemental bundles. Register the transforms on `DOMContentLoaded`, before Injector loads.
3. **Clipboard store:** a tiny module around `localStorage` with a `useClipboard()` hook (`useSyncExternalStore`). It subscribes to a custom event and the `storage` event, which also gives cross-tab sync for free. **No polling.**
4. **Components**, each registered as an Injector transform:
   - `CopyAction` / `CopyAllAction`: native dropdown items (`element-actions`).
   - `BlockToolbar`: wraps `ElementActions` and renders icon buttons (copy, paste-below, duplicate) before the •••. It hides buttons for `type.broken` and respects `canCreate`.
   - `AreaClipboardBar`: wraps `ElementToolbar` and shows Paste / Copy all / clear next to "Add new block". It shows the parcel title as the strip does today.
5. **Server:**
   - Keep `ElementClipboardController`, but accept `X-SecurityID` as a header, as `lib/Backend` sends it.
   - Add an optional `insertAfterID` / sort position to `import`.
   - Return the new element IDs.
6. **After paste:** dispatch `FORCE_RELOAD` for the area, then toast through `jQuery.noticeAdd`, as elemental does. Drop `window.location.reload()`.
7. **Save as layout option:** the same HOC pattern. Either move it into this module as an optional feature or expose a documented transform order so Turipark's app code can add its own HOC. Decide in phase 3.

## Phases

### Phase 0: Spike — done 2026-11-21, result: GO
- [x] Webpack build with `@silverstripe/webpack-config` 3.5 (npm works; no yarn needed). Output is about 10 KB of JS and 2 KB of CSS.
- [x] Imports that resolve as admin externals: `lib/Injector`, `lib/Config`, `lib/Backend`, `react`, `reactstrap`, `react-redux`, `prop-types`, `i18n`. No elemental modules are exposed, as expected.
- [x] `controllerLink` is readable from `Config.getSection('DNADesign\\Elemental\\Controllers\\ElementalAreaController')`. The toolbar's duplicate icon calls elemental's own `api/duplicate` through it.
- [x] Dispatching `{ type: 'FORCE_RELOAD', payload: { elementEditorId: areaId } }` through react-redux's `useDispatch` re-fetches the area in place. Both paste and duplicate now refresh without a page reload.
- [x] An icon toolbar before the ••• (wrapping `ElementActions`) lays out correctly, and clicks don't toggle the block or start a drag.

#### Spike results (Turipark local, elemental 6.2.3)

Spike commit: `6ccff4a` on `feature/native-toolbar`. It went further than planned and already covers most of phase 1.

Checked in the CMS:
- **Menu items:** "Copy to clipboard" and "Copy all to clipboard" render as native ••• items. Turipark's "Save as layout option" still positions itself between them, through the kept `data-ec-copy` attribute.
- **Copy:** shows a CMS notice, and the clipboard strip appears straight away (no polling).
- **Duplicate icon:** the new block appears through a list refresh, with no page reload.
- **Paste:** the confirm dialog appears, the block is appended, and the list refreshes in place.
- **Copy all and clear:** both work, and the strip appears and disappears reactively.
- **Console:** no errors from the bundle. The debugbar "Maximum header size exceeded" errors were already there.

**Bugs found that 1.x already has** (not caused by the spike; fix in phase 1):
1. **Export reads the Live stage.** `ElementClipboardController` extends `Controller`, so it never switches to draft reading mode.
   - Copying a draft-only block returns `404 Element not found` (block 1468).
   - "Copy all" skips draft-only blocks, and copies the published version of a block instead of its draft edits.
   - **Fix:** read from the draft stage in `export` and `exportall`, as `import` already does.
2. **Paste publishes straight to Live.** The pasted block (1469) had no draft badge, so `YamlFixture`/`FixtureFactory` wrote it to Live. On a real site, a paste immediately shows on the public page.
   - **Fix:** write the new records to the draft stage only, so they follow the normal publish flow.
3. **Copy all writes the area summary into `source_element_title`** ("Layout: Works (2 blocks)"). This works, but it's semantically muddled. Add a `kind: 'element' | 'area'` field to the parcel.

Test blocks 1468 and 1469 were archived afterwards.

**Still open from the spike:**
- Paste still uses `window.confirm`. Decide whether to keep it, since ACF has no confirm.
- Turipark's `composer.json` and `composer.lock` point at `dev-feature/native-toolbar` (uncommitted there). Revert them, or keep them while phase 1–2 continue.

### Phase 1: Parity, no visible change
- [x] Native Copy / Copy all dropdown items. *(spike)*
- [x] Area clipboard bar through `ElementToolbar`. *(spike)*
- [x] Clipboard store + hook. Delete the poll and the DOM scraping. *(spike)*
- [x] Paste refreshes through `FORCE_RELOAD`. *(spike)*
- [x] Export and Copy all read the draft stage (bug 1 above). *(`96da3fc`)*
- [x] Paste writes draft only and doesn't publish (bug 2 above). *(`96da3fc`)*
  - **Root cause:** the controller is a plain `Controller`, so it ran on LIVE. Versioned writes on LIVE go to both tables (`Versioned.php`, "If we're editing Live, then write to (table)_Live as well as (table)").
  - **Fix:** each action is wrapped in `Versioned::withVersionedMode()` on DRAFT. The endpoints also now require `CMS_ACCESS`, and return a 403 JSON response otherwise.
  - **Verified in Turipark:**
    - A draft-only block copies with 200 (it returned 404 before).
    - A pasted block shows the draft badge.
    - Copy all includes draft-only blocks (3 of 3).
    - An unauthenticated request gets 403.
  - **1.x:** both bugs are also in 1.x, so backport this to the `1.x` branch if SS5 sites need it.
- [ ] Add `kind` to the parcel (bug 3 above).
- [ ] Send the token as an `X-SecurityID` header instead of a query string. `SecurityToken::checkRequest` already accepts the header.
- [ ] Add ESLint (`@silverstripe/eslint-config`), plus a Jest test for the clipboard store.

### Phase 2: ACF-style block toolbar
- [ ] Icon toolbar: copy, paste below, duplicate (native endpoint), plus tooltips and `aria-label`s.
- [ ] Positional paste (`insertAfterID`) in the controller.
- [ ] Config to switch the toolbar on or off, and to choose which buttons show (some sites may want menu-only).

### Phase 3: Polish and ecosystem
- [ ] "Paste here" in `HoverBar` (stretch).
- [ ] Decide where Save as layout option lives, then migrate it to a HOC.
- [ ] Update the README and the vault note (`concepts/ss-elemental-clipboard.md`). Both are currently missing Copy all and elemental `^6`.

## Decisions

1. **Elemental 6 only (decided 2026-11-21).** 2.0 targets SS6 / elemental `^6`. 1.x keeps the current DOM-injection JS for SS5 / elemental 5, with bug fixes only. Elemental 5's React internals differ (GraphQL/Apollo reads, a different refetch path), so supporting both isn't worth it.

### Branching and release steps (before any 2.0 code lands on `main`)

The repo has no tags yet, and local sites track it loosely:

| Site | Constraint | Elemental |
|---|---|---|
| `turiparkcom` | `dev-main` | 6.2.3 |
| `test` | `*@dev` | 5.4.10 |

- [ ] Tag the current `main` (`51416e7`) as `1.0.0` and create a `1.x` branch from it.
- [ ] Do the 2.0 work on a feature branch, not on `main`. Turipark's `dev-main` would otherwise pull in half-finished work on the next `composer update`.
- [ ] Point the `test` site (elemental 5) at `^1.0` so it stays on the old code.
- [ ] For phase 0–2 testing, point Turipark at the feature branch (`dev-<branch>`). Move it to `^2.0` once 2.0.0 is tagged.
- [ ] In 2.0's `composer.json`, require `silverstripe/framework ^6`, `silverstripe/admin ^3` and `dnadesign/silverstripe-elemental ^6`.
- [ ] Delete the stale `cursor/fix-has-many-child-fk` branch, local and remote, if it's already merged. That fix landed as `fc7609b`, but check before deleting.

## Open questions (need a decision)

1. **Toolbar default:** should it be on by default, or opt-in through YAML?
2. **Green strip vs toolbar buttons:** should the area clipboard keep the full-width strip (more visible), or become compact buttons beside "Add new block" (more ACF-like)?
3. **Save as layout option:** move it into this module, or keep it in Turipark app code as a separate HOC?

## Risks

- **Elemental internals:** Injector component names and HOC props are semi-public. They aren't guaranteed to stay the same within 6.x. Pin `^6`, and add a smoke check when upgrading elemental.
- **Build tooling:** this is the first JS build in the module. Node/yarn become a dev dependency, and `client/dist` must be rebuilt and committed.
- **Header space:** on narrow content areas, extra icons compete with the title and status badges. They may need to collapse into the ••• below a breakpoint.
