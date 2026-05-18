const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

// Allow Metro to resolve source from base-rn and base-tokens (outside project root)
const baseRnPath = path.resolve(__dirname, '../../tap/base-rn');
const baseTokensPath = path.resolve(__dirname, '../../tap/base-tokens');

config.watchFolders = [baseRnPath, baseTokensPath];

// CRITICAL: Only resolve node_modules from THIS project, not from linked packages.
// This prevents Metro from picking up base-rn's own react-native copy.
config.resolver.nodeModulesPaths = [
  path.resolve(__dirname, 'node_modules'),
];

// Block duplicate react-native copies from linked packages
// (but allow base-tokens to resolve through them)
config.resolver.blockList = [
  new RegExp(path.resolve(baseRnPath, 'node_modules/react-native').replace(/[/\\]/g, '[/\\\\]') + '.*'),
  new RegExp(path.resolve(baseRnPath, 'node_modules/react').replace(/[/\\]/g, '[/\\\\]') + '[/\\\\].*'),
  new RegExp(path.resolve(baseRnPath, 'node_modules/react-native-reanimated').replace(/[/\\]/g, '[/\\\\]') + '.*'),
];

module.exports = config;
