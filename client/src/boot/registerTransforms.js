import Injector from 'lib/Injector';
import CopyActions from '../components/CopyActions';
import BlockToolbar from '../components/BlockToolbar';
import AreaClipboardBar from '../components/AreaClipboardBar';

export default () => {
  // "Copy to clipboard" / "Copy all to clipboard" in the block's ••• menu,
  // added the same way elemental adds Duplicate, Archive, Move.
  Injector.transform('element-clipboard-actions', (updater) => {
    updater.component('ElementActions', CopyActions, 'ElementActionsWithClipboard');
  }, { after: 'element-actions' });

  // ACF-style icon buttons rendered just before the ••• toggle.
  // Wraps ElementActions after every menu-item transform, so it is outermost.
  Injector.transform('element-clipboard-toolbar', (updater) => {
    updater.component('ElementActions', BlockToolbar, 'ElementActionsWithClipboardToolbar');
  }, { after: 'element-clipboard-actions' });

  // Clipboard strip (paste / clear) above the area's "Add new block" toolbar.
  Injector.transform('element-clipboard-area', (updater) => {
    updater.component('ElementToolbar', AreaClipboardBar, 'ElementToolbarWithClipboard');
  });
};
