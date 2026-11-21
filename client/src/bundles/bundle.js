/* global window */
import registerTransforms from '../boot/registerTransforms';

// Same timing as elemental's own boot: transforms must be registered before
// the admin Injector loads, which happens after DOMContentLoaded handlers run.
window.document.addEventListener('DOMContentLoaded', () => {
  registerTransforms();
});
