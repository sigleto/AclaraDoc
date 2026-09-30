// Android-only advertising. No iOS app/ad unit has been authorized/configured.
module.exports = {
  dependencies: {
    'react-native-google-mobile-ads': { platforms: { ios: null } },
  },
};
