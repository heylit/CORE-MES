// Dosyayı kullanan modüller bağı kendi yazma ucundan kurar ve kaldırır, dosyayı kendi okuma ucundan (ikili cevap) verir:
// okuma yetkisi ve veri kapsamı bağlayan modülündür (DS6 a). Bağ işlevleri yalnız modül adına bağlı tutamaktan alınır.
export type { BagSiniri, SaklananTur } from './kurallar.ts';
export { DOSYA_SINIRI, ekMime } from './kurallar.ts';
export type { BagGirdisi, DosyaTutamagi, MedyaTutamagi, ModulDeposuTutamagi, SaklananDosya } from './servis.ts';
export { denetimSatiri, depoDolulugu, diskKunyeOzetleri, dosyaTutamagi, eksikDosyalar, medyaTutamagi, modulDeposuTutamagi } from './servis.ts';
