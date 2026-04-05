/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  webpack: (config, { isServer }) => {
    if (isServer) {
      // Externalize typeorm on server side to avoid bundling optional drivers
      config.externals = config.externals || [];
      config.externals.push({
        'typeorm': 'typeorm',
        'typeorm/globals': 'typeorm/globals',
        'typeorm/driver/DriverFactory': 'typeorm/driver/DriverFactory',
      });

      // Suppress warnings for optional typeorm drivers not included
      config.ignoreWarnings = config.ignoreWarnings || [];
      config.ignoreWarnings.push({
        module: /node_modules\/typeorm/,
        message: /Can't resolve.*(?:react-native-sqlite-storage|@sap\/hana-client|mysql|oracle|pg)/,
      });
      config.ignoreWarnings.push({
        module: /node_modules\/typeorm/,
        message: /Critical dependency: the request of a dependency is an expression/,
      });
    }

    return config;
  },
};

export default nextConfig;
