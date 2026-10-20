// Belgeyi gösteren modül (malzemeler, istasyonlar, atölye, Arkon, kalibrasyon) bağı kendi yazma ucundan kurar ve kaldırır,
// dosyayı kendi okuma ucundan verir: okuma yetkisi ve veri kapsamı bağlayan modülündür. Merkez o modülleri ithal etmez.
export type { BagliBelge, KayitBelgesiTuru, YayindakiBelge, YayindakiBelgeDosyasi, YayindakiOnizleme } from './servis.ts';
export {
  belgeAcVeBagla, kaydaBagla, kaydaBagliBelgeler, kayitlaraBagliBelgeler, kayittakiBelgeDosyasi, kayittanKaldir, yayindakiBelgeDosyasi, yayindakiBelgeler,
  yayindakiOnizleme, yayindakiOnizlemeKaresi,
} from './servis.ts';
