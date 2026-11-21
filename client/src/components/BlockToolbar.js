import React from 'react';
import PropTypes from 'prop-types';
import { useDispatch } from 'react-redux';
import i18n from 'i18n';
import Icon from './Icon';
import { copyElement, duplicate } from '../lib/operations';

const ToolbarButton = ({ icon, label, onClick, disabled = false }) => (
  <button
    type="button"
    className="ec-toolbar-btn btn btn-sm btn--no-text"
    title={label}
    aria-label={label}
    disabled={disabled}
    onClick={(event) => {
      event.stopPropagation();
      onClick();
    }}
  >
    <Icon name={icon} />
  </button>
);

ToolbarButton.propTypes = {
  icon: PropTypes.string.isRequired,
  label: PropTypes.string.isRequired,
  onClick: PropTypes.func.isRequired,
  disabled: PropTypes.bool,
};

/**
 * HOC for ElementActions: renders ACF-style icon buttons immediately before
 * the ••• dropdown, inside the header's actions area. Elemental's Header
 * already stops click/pointer propagation around ElementActions, so these
 * buttons don't toggle the block or start a drag.
 */
const BlockToolbar = (ActionsComponent) => (props) => {
  const { element, type, areaId } = props;
  const dispatch = useDispatch();

  if (!element || (type && type.broken)) {
    return <ActionsComponent {...props} />;
  }

  const cannotCreate = element.canCreate !== undefined && !element.canCreate;

  return (
    <div className="ec-block-actions">
      <div
        className="ec-block-toolbar"
        role="toolbar"
        aria-label={i18n._t('ElementClipboard.TOOLBAR', 'Block quick actions')}
      >
        <ToolbarButton
          icon="copy"
          label={i18n._t('ElementClipboard.COPY', 'Copy to clipboard')}
          onClick={() => copyElement(element.id)}
        />
        <ToolbarButton
          icon="duplicate"
          label={i18n._t('ElementClipboard.DUPLICATE', 'Duplicate')}
          disabled={cannotCreate}
          onClick={() => duplicate(element.id, areaId, dispatch)}
        />
      </div>
      <ActionsComponent {...props} />
    </div>
  );
};

export default BlockToolbar;
