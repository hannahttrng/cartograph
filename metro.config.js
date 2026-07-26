const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
const { assetExts, sourceExts } = config.resolver;

config.transformer = {
	...config.transformer,
	babelTransformerPath: require.resolve('react-native-svg-transformer/expo'),
};
config.resolver = {
	...config.resolver,
	assetExts: assetExts.filter((extension) => extension !== 'svg'),
	sourceExts: [...sourceExts, 'svg'],
};

module.exports = config;