import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.orbit.app',
  appName: 'Orbit',
  webDir: 'build',
  server: {
    // Dev: point at local SvelteKit dev server
    // Comment this out for production builds
    // url: 'http://localhost:5173',
    // cleartext: true,

    androidScheme: 'https',
    iosScheme: 'com.orbit.app',
    // Universal links / app links host
    hostname: 'owenstuckman.lol',
  },
  plugins: {
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
    BiometricAuth: {
      androidBiometricStrength: 'strong',
    },
  },
  ios: {
    // Associated domains for universal links
    // Add these in Xcode: com.orbit.app.* + applinks:owenstuckman.lol
  },
  android: {
    // Deep link intent filters defined in AndroidManifest.xml
  },
};

export default config;
