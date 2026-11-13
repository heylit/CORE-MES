// Okuma uçları oturumla açılır: seçim listeleri her ekranda gerekir.
// makine-durumu: makineyi arızalı, bakımda ya da çalışıyor yapmak (263 a).
// Tanım yazımı sekiz eyleme bölündü (3165 a): her yazma ucu bunlardan tek birini ister (kümeler `paylasilan/islemler.ts`'te).
// `istasyonlar.yaz` artık hiçbir ucu açmaz; var olan rol ve kişi satırları kaybolmasın diye katalogda kalır, kaldırılması ayrı karttır.
export const ISTASYONLAR_ISLEMLERI = [
  'istasyonlar.yaz', 'istasyonlar.makine-durumu',
  'istasyonlar.istasyon-yaz', 'istasyonlar.makine-yaz', 'istasyonlar.is-merkezi-yaz', 'istasyonlar.kisi-ata',
  'istasyonlar.ekip-yaz', 'istasyonlar.yetkinlik-yaz', 'istasyonlar.aparat-yaz', 'istasyonlar.tanim-yaz',
] as const;
