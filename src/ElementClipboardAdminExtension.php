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
    public function onAfterInit(): void
    {
        $dist = dirname(__DIR__) . '/client/dist/';
        Requirements::customScript(file_get_contents($dist . 'elementClipboard.js'), 'element-clipboard-js');
        Requirements::customCSS(file_get_contents($dist . 'elementClipboard.css'), 'element-clipboard-css');
    }
}
