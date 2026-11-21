/* global window */
import { useSyncExternalStore } from 'react';

/**
 * localStorage-backed clipboard with a React subscription hook.
 *
 * Replaces the old 600 ms DOM poll: components re-render when the parcel
 * changes in this tab (custom event) or in another tab (storage event).
 */

const STORAGE_KEY = 'ss_element_clipboard';
const CHANGE_EVENT = 'element-clipboard:change';

// useSyncExternalStore needs a referentially stable snapshot, so cache the
// parsed parcel against the raw string it came from.
let cachedRaw;
let cachedParcel = null;

function readRaw() {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch (e) {
    return null;
  }
}

export function read() {
  const raw = readRaw();
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    try {
      cachedParcel = raw ? JSON.parse(raw) : null;
    } catch (e) {
      cachedParcel = null;
    }
  }
  return cachedParcel;
}

function notifyChange() {
  window.dispatchEvent(new window.Event(CHANGE_EVENT));
}

export function write(parcel) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(parcel));
  } catch (e) {
    // Storage full or blocked: the copy simply doesn't persist.
  }
  notifyChange();
}

export function clear() {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch (e) {
    // ignore
  }
  notifyChange();
}

function subscribe(callback) {
  const onStorage = (event) => {
    if (event.key === STORAGE_KEY || event.key === null) {
      callback();
    }
  };
  window.addEventListener(CHANGE_EVENT, callback);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(CHANGE_EVENT, callback);
    window.removeEventListener('storage', onStorage);
  };
}

export function useClipboard() {
  return useSyncExternalStore(subscribe, read, () => null);
}
