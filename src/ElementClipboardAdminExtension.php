<?php

namespace Ifeelfree\ElementalClipboard;

use SilverStripe\Core\Extension;
use SilverStripe\View\Requirements;

/**
 * Loads clipboard JS + CSS into the CMS admin.
 * Registered via _config/elementclipboard.yml
 */
class ElementClipboardAdminExtension extends Extension
{
    public function init(): void
    {
        Requirements::javascript('ifeelfree/silverstripe-elemental-clipboard:client/dist/elementClipboard.js');
        Requirements::css('ifeelfree/silverstripe-elemental-clipboard:client/dist/elementClipboard.css');
    }
}
