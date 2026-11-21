/* global window */
import i18n from 'i18n';
import { read, write } from './clipboard';
import { exportElement, exportArea, importParcel, duplicateElement } from './api';

/**
 * Elemental's redux action for "re-fetch this area's blocks"
 * (state/editor/editorActions.js forceReload). Not exported by elemental's
 * bundle, so we dispatch the plain action object.
 */
export const forceReload = (areaId) => ({
  type: 'FORCE_RELOAD',
  payload: { elementEditorId: areaId },
});

export function notify(text, type = 'success') {
  // Same toast mechanism elemental's own menu actions use.
  if (window.jQuery && window.jQuery.noticeAdd) {
    window.jQuery.noticeAdd({ text, type, stayTime: 3000, stay: type === 'error' });
  }
}

const fail = (label) => (err) => {
  // eslint-disable-next-line no-console
  console.error(`[ElementClipboard] ${label} failed:`, err);
  notify(`${label} failed: ${err.message}`, 'error');
};

export function copyElement(elementID) {
  return exportElement(elementID)
    .then((parcel) => {
      write(parcel);
      notify(i18n.sprintf(
        i18n._t('ElementClipboard.COPIED', 'Copied "%s" from %s'),
        parcel.source_element_title,
        parcel.source_page_title
      ));
    })
    .catch(fail('Copy'));
}

export function copyArea(areaID) {
  return exportArea(areaID)
    .then((parcel) => {
      write(parcel);
      notify(i18n.sprintf(i18n._t('ElementClipboard.COPIED_ALL', 'Copied %s'), parcel.source_element_title));
    })
    .catch(fail('Copy all'));
}

export function pasteInto(areaID, dispatch) {
  const parcel = read();
  if (!parcel) {
    notify(i18n._t('ElementClipboard.EMPTY', 'Nothing on clipboard'), 'warning');
    return Promise.resolve();
  }
  return importParcel(areaID, parcel)
    .then(() => {
      dispatch(forceReload(areaID));
      notify(i18n.sprintf(i18n._t('ElementClipboard.PASTED', 'Pasted "%s"'), parcel.source_element_title));
    })
    .catch(fail('Paste'));
}

export function duplicate(elementID, areaID, dispatch) {
  return duplicateElement(elementID)
    .then(() => dispatch(forceReload(areaID)))
    .catch(fail('Duplicate'));
}
