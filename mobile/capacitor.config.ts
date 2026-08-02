import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'ru.gamleetee.gamchat',
  appName: 'gamleetee Чат',
  webDir: 'www',
  server: {
    androidScheme: 'https',
    iosScheme: 'https'
  },
  plugins: {
    App: {
      disableBackButtonHandler: false
    }
  }
};

export default config;
