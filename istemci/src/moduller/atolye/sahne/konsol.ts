import { setConsoleFunction } from 'three';

// Windows'ta tarayıcı WebGL'i Direct3D'ye çevirir; three'nin kendi gölge paketleme kodundaki sabitler (255/256 gibi)
// için HLSL derleyicisi X4122 "çift duyarlıkta tam gösterilemez" uyarısı yazar. Gölge ve görüntü doğrudur; three bu
// bilgi günlüğünü konsola uyarı olarak basar. Yalnız bu uyarıdan oluşan günlük susturulur; derleme hatası, başka
// uyarı ve three'nin öbür iletileri olduğu gibi konsola gider.

const PROGRAM_GUNLUGU = 'THREE.WebGLProgram: Program Info Log:';

export function yalnizHassasiyetUyarisi(gunluk: string): boolean {
  const satirlar = gunluk.split('\n').map((s) => s.trim()).filter((s) => s !== '');
  return satirlar.length > 0 && satirlar.every((s) => /warning X4122:/.test(s));
}

interface YiginIzi { isStackTrace: true; getError: (ileti: string) => Error }
const yiginIziMi = (o: unknown): o is YiginIzi => typeof o === 'object' && o !== null && (o as { isStackTrace?: unknown }).isStackTrace === true;

let kuruldu = false;

export function konsoluSuzgecle(): void {
  if (kuruldu) return;
  kuruldu = true;
  setConsoleFunction((tur: 'log' | 'warn' | 'error', ileti: string, ...ekler: unknown[]) => {
    if (tur === 'warn' && ileti === PROGRAM_GUNLUGU && typeof ekler[0] === 'string' && yalnizHassasiyetUyarisi(ekler[0])) return;
    const ilk = ekler[0];
    if (yiginIziMi(ilk)) console[tur](ilk.getError(ileti));
    else console[tur](ileti, ...ekler);
  });
}
