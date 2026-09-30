import 'tsx/cjs';
import type { ConfigContext, ExpoConfig } from 'expo/config';
import { selectAdAppId } from './ads.config';

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: config.name ?? 'AclaraDoc',
  slug: config.slug ?? 'aclaradoc',
  plugins: [
    ...(config.plugins ?? []),
    ['react-native-google-mobile-ads', {
      androidAppId: selectAdAppId(process.env.EAS_BUILD_PROFILE === 'production'),
      androidSdk: 'classic',
      delayAppMeasurementInit: true,
    }],
  ],
  extra: {
    ...config.extra,
    ads: {
      enabled: process.env.ACLARADOC_ADS_ENABLED !== 'false',
      production: process.env.EAS_BUILD_PROFILE === 'production',
    },
  },
});
