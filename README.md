# SilverStripe Elemental Clipboard

Copy and paste elemental blocks between CMS pages via a persistent browser clipboard.

## Features

- **Copy** any elemental block from the `•••` action menu
- **Paste** it into any page's elemental area with one click
- Copies all `$db` fields, `$has_one` references, `has_many` children, and `many_many` children automatically — no per-element config needed
- Clipboard persists across page navigation (stored in `localStorage`)
- Works with SilverStripe 5 and 6

## Requirements

- SilverStripe Framework `^5 || ^6`
- `dnadesign/silverstripe-elemental` `^5`

## Installation

```bash
composer require ifeelfree/silverstripe-elemental-clipboard
```

Then run `dev/build?flush=1`.

## Usage

Once installed the clipboard is immediately active in the CMS. No configuration required.

1. Open any page with elemental blocks
2. Click `•••` on a block → **Copy to clipboard**
3. Navigate to any page
4. Click **Paste block** in the green clipboard strip

## Configuration

### Exclude specific relations from being copied

Add to your project's `_config/*.yml`:

```yaml
My\Element\ElementFoo:
  clipboard_exclude_relations:
    - LinkTracking
    - Tags
```

### Override which fields are copied for an element

```yaml
# Copy only these fields (overrides auto-discovery)
My\Element\ElementFoo:
  clipboard_fields:
    - Title
    - HTML

# Or exclude specific fields from auto-discovery
My\Element\ElementFoo:
  clipboard_exclude:
    - InternalNotes
```

## License

BSD-3-Clause
