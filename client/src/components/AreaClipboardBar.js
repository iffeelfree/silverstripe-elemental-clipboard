/* global window */
import React from 'react';
import { useDispatch } from 'react-redux';
import i18n from 'i18n';
import Icon from './Icon';
import { useClipboard, clear } from '../lib/clipboard';
import { pasteInto, notify } from '../lib/operations';

/**
 * HOC for ElementToolbar: shows the clipboard strip (what's copied, Paste,
 * clear) above "Add new block" whenever something is on the clipboard.
 */
const AreaClipboardBar = (ToolbarComponent) => (props) => {
  const { areaId } = props;
  const parcel = useClipboard();
  const dispatch = useDispatch();

  if (!parcel) {
    return <ToolbarComponent {...props} />;
  }

  const handlePaste = () => {
    const message = i18n.sprintf(
      i18n._t('ElementClipboard.CONFIRM_PASTE', 'Paste "%s" (from "%s") to the bottom of this area?'),
      parcel.source_element_title,
      parcel.source_page_title
    );
    // eslint-disable-next-line no-alert
    if (window.confirm(message)) {
      pasteInto(areaId, dispatch);
    }
  };

  const handleClear = () => {
    clear();
    notify(i18n._t('ElementClipboard.CLEARED', 'Clipboard cleared'), 'warning');
  };

  return (
    <>
      <div className="ec-clipboard-bar">
        <Icon name="clipboardCheck" />
        <span className="ec-bar-label">
          {i18n._t('ElementClipboard.LABEL', 'Clipboard:')}{' '}
          <strong>{parcel.source_element_title}</strong>
          {' — '}{i18n._t('ElementClipboard.FROM', 'from')}{' '}
          <em>{parcel.source_page_title}</em>
        </span>
        <button className="ec-paste-btn" type="button" onClick={handlePaste}>
          <Icon name="paste" /> {i18n._t('ElementClipboard.PASTE', 'Paste block')}
        </button>
        <button className="ec-clear-btn" type="button" onClick={handleClear}>
          {i18n._t('ElementClipboard.CLEAR', 'clear')}
        </button>
      </div>
      <ToolbarComponent {...props} />
    </>
  );
};

export default AreaClipboardBar;
