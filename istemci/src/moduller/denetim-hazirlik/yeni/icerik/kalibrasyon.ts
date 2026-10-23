import type { Cihaz, KalibrasyonSonucu } from '../tipler.ts';

// Kalibrasyon sözlükleri (prototip). Cihaz listesi Kalibrasyon modülündedir (329 a); bunlar yalnız gösterim içindir.
export const KTUR: Record<Cihaz['tur'], string> = { dis: 'Dış (akredite lab)', ic: 'İç kalibrasyon', dog: 'Doğrulama / kontrol' };
export const KDUR: Record<Cihaz['st'], string> = { aktif: 'Kullanımda', yedek: 'Yedek', disi: 'Kullanım dışı', hurda: 'Hurda' };
export const KSON: Record<KalibrasyonSonucu, string> = { uygun: 'Uygun', sartli: 'Şartlı uygun', red: 'Uygun değil' };
export const KTIP: readonly string[] = ["Kumpas","Dijital kumpas","Mikrometre","İç çap mikrometresi","Komparatör saat","Mihengir / yükseklik mastarı","Tampon mastar","Halka mastar","Diş mastarı","Mastar bloğu seti","Açı ölçer","Pürüzlülük ölçüm cihazı","Sertlik ölçüm cihazı","CMM","Profil projektörü","Tork anahtarı","Terazi / baskül","Termometre","Nem ölçer","Manometre","Kaplama kalınlık ölçer","Radius mastarı","Sentil"];
