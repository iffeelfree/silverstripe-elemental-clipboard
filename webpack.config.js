const Path = require('path');
const { JavascriptWebpackConfig, CssWebpackConfig } = require('@silverstripe/webpack-config');

const PATHS = {
  ROOT: Path.resolve(),
  SRC: Path.resolve('client/src'),
  DIST: Path.resolve('client/dist'),
};

const config = [
  // React, Injector, reactstrap etc. are externals provided by silverstripe/admin,
  // so this bundle shares the CMS's copies instead of shipping its own.
  new JavascriptWebpackConfig('js', PATHS, 'ifeelfree/silverstripe-elemental-clipboard')
    .setEntry({
      bundle: `${PATHS.SRC}/bundles/bundle.js`,
    })
    .getConfig(),
  new CssWebpackConfig('css', PATHS)
    .setEntry({
      bundle: `${PATHS.SRC}/styles/bundle.scss`,
    })
    .getConfig(),
];

// Use WEBPACK_CHILD=js or WEBPACK_CHILD=css to run a single config
module.exports = (process.env.WEBPACK_CHILD)
  ? config.find((entry) => entry.name === process.env.WEBPACK_CHILD)
  : config;
