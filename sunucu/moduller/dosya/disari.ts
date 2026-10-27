// Dosyayı kullanan modüller bağı kendi yazma ucundan kurar ve kaldırır, dosyayı kendi okuma ucundan (ikili cevap) verir:
// okuma yetkisi ve veri kapsamı bağlayan modülündür (DS6 a). Bağ işlevleri yalnız modül adına bağlı tutamaktan alınır.
export type { BagSiniri, SaklananTur } from './kurallar.ts';
export type { BagGirdisi, DosyaTutamagi, ModulDeposuTutamagi, SaklananDosya } from './servis.ts';
export { denetimSatiri, depoDolulugu, dosyaTutamagi, eksikDosyalar, modulDeposuTutamagi } from './servis.ts';
