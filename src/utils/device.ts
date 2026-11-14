export interface DeviceProfile {
  kind: 'mobile' | 'tablet' | 'desktop';
  os: 'android' | 'ios' | 'desktop';
  isTouch: boolean;
  label: string;
}

export function detectDeviceProfile(): DeviceProfile {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return {
      kind: 'desktop',
      os: 'desktop',
      isTouch: false,
      label: 'Računar',
    };
  }

  const ua = navigator.userAgent || '';
  const isAndroid = /Android/i.test(ua);
  const isIOS = /iPhone|iPad|iPod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isCoarse = window.matchMedia?.('(pointer: coarse)').matches ?? false;
  const width = window.innerWidth;

  const isTouch = isAndroid || isIOS || isCoarse || navigator.maxTouchPoints > 0;
  const os: DeviceProfile['os'] = isAndroid ? 'android' : isIOS ? 'ios' : 'desktop';

  let kind: DeviceProfile['kind'] = 'desktop';
  if (width < 768 && (isTouch || /Mobile/i.test(ua))) {
    kind = 'mobile';
  } else if (width < 1100 && isTouch) {
    kind = 'tablet';
  }

  const label =
    kind === 'mobile'
      ? os === 'ios'
        ? 'iPhone · direktna kamera'
        : os === 'android'
          ? 'Android · direktna kamera'
          : 'Mobilni uređaj'
      : kind === 'tablet'
        ? 'Tablet · prilagođen dodiru'
        : 'Računar · drag & drop i širi prikaz';

  return { kind, os, isTouch, label };
}
