/* global window */
import Config from 'lib/Config';
import backend from 'lib/Backend';

const ELEMENTAL_CONFIG_KEY = 'DNADesign\\Elemental\\Controllers\\ElementalAreaController';

const securityID = () => encodeURIComponent(Config.get('SecurityID') || '');

const endpoint = (action) => {
  const base = (Config.get('baseUrl') || '/').replace(/\/?$/, '/');
  return `${base}admin/elementclipboard/${action}`;
};

async function request(url, options = {}) {
  const res = await window.fetch(url, { credentials: 'same-origin', ...options });
  let data;
  try {
    data = await res.json();
  } catch (e) {
    throw new Error(`HTTP ${res.status}`);
  }
  if (!res.ok || data.error) {
    throw new Error(data.error || `HTTP ${res.status}`);
  }
  return data;
}

export const exportElement = (elementID) =>
  request(`${endpoint('export')}?elementID=${encodeURIComponent(elementID)}&SecurityID=${securityID()}`);

export const exportArea = (areaID) =>
  request(`${endpoint('exportall')}?areaID=${encodeURIComponent(areaID)}&SecurityID=${securityID()}`);

export const importParcel = (areaID, parcel) =>
  request(`${endpoint('import')}?SecurityID=${securityID()}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ areaID, parcel }),
  });

/**
 * Elemental's own duplicate endpoint, called exactly as DuplicateAction does.
 */
export const duplicateElement = (elementID) => {
  const { controllerLink } = Config.getSection(ELEMENTAL_CONFIG_KEY) || {};
  if (!controllerLink) {
    return Promise.reject(new Error('Elemental controller link not found in client config'));
  }
  return backend.post(
    `${controllerLink.replace(/\/$/, '')}/api/duplicate`,
    { id: elementID },
    { 'X-SecurityID': Config.get('SecurityID') }
  );
};
