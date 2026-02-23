module.exports = function (api) {
  api.cache(true);
  return {
    presets: [
      ['babel-preset-expo', { jsxImportSource: 'nativewind' }],
      'nativewind/babel',
    ],
    plugins: [
      // Replace import.meta.env with process.env for web compatibility
      function () {
        return {
          visitor: {
            MetaProperty(path) {
              // import.meta.env -> process.env
              if (
                path.node.meta.name === 'import' &&
                path.node.property.name === 'meta' &&
                path.parent.type === 'MemberExpression' &&
                path.parent.property.name === 'env'
              ) {
                path.parentPath.replaceWithSourceString('process.env');
              }
              // bare import.meta -> { env: process.env }
              else if (
                path.node.meta.name === 'import' &&
                path.node.property.name === 'meta'
              ) {
                path.replaceWithSourceString('({ env: process.env })');
              }
            },
          },
        };
      },
      'react-native-reanimated/plugin',
    ],
  };
};
