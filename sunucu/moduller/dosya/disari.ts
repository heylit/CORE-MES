// Dosyayı kullanan modüller bağı kendi yazma ucundan kurar ve kaldırır, dosyayı kendi okuma ucundan (ikili cevap) verir:
// okuma yetkisi ve veri kapsamı bağlayan modülündür (DS6 a). Bağ işlevleri yalnız modül adına bağlı tutamaktan alınır.
export type { BagSiniri } from './kurallar.ts';
export type { BagGirdisi, DosyaTutamagi } from './servis.ts';
export { denetimSatiri, dosyaTutamagi, eksikDosyalar } from './servis.ts';
