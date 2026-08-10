const { withGradleProperties } = require('@expo/config-plugins');

module.exports = function withCustomGradleProperties(config) {
  return withGradleProperties(config, (config) => {
    // Filter out the default jvmargs so we can replace it
    config.modResults = config.modResults.filter(
      (item) => item.type !== 'property' || item.key !== 'org.gradle.jvmargs'
    );
    
    // Add our customized high-memory jvmargs
    config.modResults.push({
      type: 'property',
      key: 'org.gradle.jvmargs',
      value: '-Xmx4096m -XX:MaxMetaspaceSize=1024m -XX:+HeapDumpOnOutOfMemoryError',
    });
    return config;
  });
};
