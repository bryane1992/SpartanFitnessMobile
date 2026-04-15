import 'dotenv/config';

export default {
  expo: {
    name: 'GritOS',
    slug: 'spartan-fitness',
    version: '1.0.0',
    orientation: 'portrait',
    icon: './assets/app-icon.png',
    userInterfaceStyle: 'dark',
    splash: {
      image: './assets/splash-icon.png',
      resizeMode: 'contain',
      backgroundColor: '#0A0A0A',
    },
    ios: {
      supportsTablet: false,
      bundleIdentifier: 'com.gritos.app',
      buildNumber: '1',
      infoPlist: {
        NSLocationAlwaysAndWhenInUseUsageDescription:
          'GritOS tracks your runs and workouts with GPS to measure distance, pace, and route - even when the app is in the background.',
        NSLocationWhenInUseUsageDescription:
          'GritOS uses GPS to track your runs and measure distance and pace.',
        NSMotionUsageDescription:
          'GritOS uses motion data to track your workouts and improve accuracy.',
        UIBackgroundModes: ['location', 'audio'],
        BGTaskSchedulerPermittedIdentifiers: ['com.gritos.app.refresh'],
      },
      config: {
        usesNonExemptEncryption: false,
      },
    },
    android: {
      adaptiveIcon: {
        backgroundColor: '#0A0A0A',
        foregroundImage: './assets/android-icon-foreground.png',
      },
      package: 'com.gritos.app',
      versionCode: 1,
      permissions: [
        'ACCESS_COARSE_LOCATION',
        'ACCESS_FINE_LOCATION',
        'ACCESS_BACKGROUND_LOCATION',
        'FOREGROUND_SERVICE',
        'WAKE_LOCK',
      ],
    },
    plugins: [
      [
        'expo-location',
        {
          locationAlwaysAndWhenInUsePermission:
            'GritOS tracks your runs with GPS to measure distance and pace.',
          isBackgroundLocationEnabled: true,
        },
      ],
      'expo-sqlite',
    ],
    extra: {
      eas: {
        projectId: 'a798bcee-131b-4777-bca1-b4be26db20ab',
      },
      exerciseDbApiKey: process.env.EXERCISE_DB_KEY,
      claudeApiKey: process.env.CLAUDE_TOKEN,
      wodApiKey: process.env.WOD_TOKEN,
      supabaseUrl: process.env.PROJECT_URL,
      supabaseAnonKey: process.env.ANON_KEY,
    },
  },
};
