// occt-import-js tip tanımı yayımlamaz; tanım atölyedeki dosyadadır (ReadStepFile ve sonuç biçimi). Merkez IGES de okur:
// arayüz burada genişletilir (aynı ad, ambient birleşme).
declare module 'occt-import-js' {
  export interface Occt {
    ReadIgesFile(icerik: Uint8Array, ayar: OcctAyari | null): OcctSonucu;
  }
}
