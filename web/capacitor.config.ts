import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.kpride.timecard',
  appName: 'TimeCard',
  webDir: 'dist',
  android: {
    // 실기기에서 https API 호출을 위해 기본 스킴을 https로 사용
    allowMixedContent: false,
  },
};

export default config;
