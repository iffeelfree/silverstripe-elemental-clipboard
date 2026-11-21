import React from 'react';
import { DropdownItem } from 'reactstrap';
import i18n from 'i18n';
import Icon from './Icon';
import { copyElement, copyArea } from '../lib/operations';

/**
 * HOC for ElementActions: adds "Copy to clipboard" and "Copy all to clipboard"
 * to the block's ••• menu. Same shape as elemental's DuplicateAction.
 */
const CopyActions = (MenuComponent) => (props) => {
  const { element, type, areaId, children } = props;

  if (!element || (type && type.broken)) {
    return <MenuComponent {...props} />;
  }

  const handleCopy = (event) => {
    event.stopPropagation();
    copyElement(element.id);
  };

  const handleCopyAll = (event) => {
    event.stopPropagation();
    copyArea(areaId);
  };

  return (
    <MenuComponent {...props}>
      {children}
      <DropdownItem divider role="separator" />
      {/* data-ec-copy kept so Turipark's save-layout-option.js can still position itself */}
      <DropdownItem
        className="ec-dropdown-item element-editor__actions-clipboard-copy"
        data-ec-copy={element.id}
        onClick={handleCopy}
      >
        <Icon name="copy" /> {i18n._t('ElementClipboard.COPY', 'Copy to clipboard')}
      </DropdownItem>
      {areaId && (
        <DropdownItem
          className="ec-dropdown-item element-editor__actions-clipboard-copy-all"
          data-ec-copy-all={areaId}
          onClick={handleCopyAll}
        >
          <Icon name="copyAll" /> {i18n._t('ElementClipboard.COPY_ALL', 'Copy all to clipboard')}
        </DropdownItem>
      )}
    </MenuComponent>
  );
};

export default CopyActions;
