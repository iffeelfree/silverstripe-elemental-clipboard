import React, { useEffect, useRef } from 'react';
import PropTypes from 'prop-types';
import { useDispatch } from 'react-redux';
import i18n from 'i18n';
import Icon from './Icon';
import {
  copyElement,
  copyArea,
  duplicate,
  archive,
  unpublish,
} from '../lib/operations';

const ToolbarButton = ({ icon, label, onClick, disabled = false }) => (
  <button
    type="button"
    className={`ec-toolbar-btn ec-toolbar-btn--${icon} btn btn-sm btn--no-text`}
    aria-label={label}
    data-ec-tooltip={label}
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

const denied = (label, allowed) => (allowed
  ? label
  : i18n.inject(
    i18n._t('ElementClipboard.PERMISSION_DENY', '{action}, insufficient permissions'),
    { action: label }
  ));

/**
 * HOC for ElementActions: renders ACF-style icon buttons immediately before
 * the ••• dropdown, inside the header's actions area. Elemental's Header
 * already stops click/pointer propagation around ElementActions, so these
 * buttons don't toggle the block or start a drag.
 */
const BlockToolbar = (ActionsComponent) => (props) => {
  const { element, type, areaId } = props;
  const dispatch = useDispatch();
  const wrapperRef = useRef(null);

  // The ••• toggle gets our CSS tooltip (from its aria-label), so drop its
  // native title to avoid showing two tooltips at once.
  useEffect(() => {
    const toggle = wrapperRef.current
      && wrapperRef.current.querySelector('.element-editor-header__actions-toggle[title]');
    if (toggle) {
      toggle.removeAttribute('title');
    }
  });

  if (!element || (type && type.broken)) {
    return <ActionsComponent {...props} />;
  }

  const can = (flag) => element[flag] === undefined || Boolean(element[flag]);
  const canCreate = can('canCreate');
  const canDelete = can('canDelete');
  const canUnpublish = can('canUnpublish');

  return (
    <div className="ec-block-actions" ref={wrapperRef}>
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
        {areaId && (
          <ToolbarButton
            icon="copyAll"
            label={i18n._t('ElementClipboard.COPY_ALL', 'Copy all to clipboard')}
            onClick={() => copyArea(areaId)}
          />
        )}
        <ToolbarButton
          icon="duplicate"
          label={i18n._t('ElementClipboard.DUPLICATE', 'Duplicate')}
          disabled={!canCreate}
          onClick={() => duplicate(element.id, areaId, dispatch)}
        />
        {element.isPublished && (
          <ToolbarButton
            icon="unpublish"
            label={denied(i18n._t('ElementArchiveAction.UNPUBLISH', 'Unpublish'), canUnpublish)}
            disabled={!canUnpublish}
            onClick={() => unpublish(element, type && type.title, areaId, dispatch)}
          />
        )}
        <ToolbarButton
          icon="archive"
          label={denied(i18n._t('ElementArchiveAction.ARCHIVE', 'Archive'), canDelete)}
          disabled={!canDelete}
          onClick={() => archive(element, areaId, dispatch)}
        />
      </div>
      <ActionsComponent {...props} />
    </div>
  );
};

export default BlockToolbar;
