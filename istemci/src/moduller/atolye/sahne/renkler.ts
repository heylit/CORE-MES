import { Color, LinearSRGBColorSpace } from 'three';

// Sahnenin bütün renkleri tasarım değişkenlerinden okunur (tokens.css); kodda renk değeri yazılmaz.
// Malzeme renkleri temaya göre değişmez (fiziksel nesne); yalnız arka plan ve durum renkleri temalıdır.
const DEGISKENLER = {
  arka: '--sahne-arka',
  zemin: '--sahne3b-zemin', derz: '--sahne3b-derz', leke: '--sahne3b-leke', yag: '--sahne3b-yag', beton: '--sahne3b-beton',
  duvar: '--sahne3b-duvar', supurgelik: '--sahne3b-supurgelik', kapi: '--sahne3b-kapi', pencere: '--sahne3b-pencere',
  pencereIsik: '--sahne3b-pencere-isik', panel: '--sahne3b-panel', boya: '--sahne3b-boya', boyaOrta: '--sahne3b-boya-orta',
  koyu: '--sahne3b-koyu', siyah: '--sahne3b-siyah', celik: '--sahne3b-celik', celikKoyu: '--sahne3b-celik-koyu', alu: '--sahne3b-alu',
  krom: '--sahne3b-krom', galv: '--sahne3b-galv', vurgu: '--sahne3b-vurgu', mavi: '--sahne3b-mavi', sari: '--sahne3b-sari',
  turuncu: '--sahne3b-turuncu', kirmizi: '--sahne3b-kirmizi', kolon: '--sahne3b-kolon', raf: '--sahne3b-raf', rafKiris: '--sahne3b-raf-kiris',
  ahsap: '--sahne3b-ahsap', karton: '--sahne3b-karton', ahsapUst: '--sahne3b-ahsap-ust', kaucuk: '--sahne3b-kaucuk', ic: '--sahne3b-ic',
  kutu: '--sahne3b-kutu', kutuGri: '--sahne3b-kutu-gri', granit: '--sahne3b-granit', granitAcik: '--sahne3b-granit-acik',
  cam: '--sahne3b-cam', camLazer: '--sahne3b-cam-lazer', camOda: '--sahne3b-cam-oda',
  isik: '--sahne3b-isik', gok: '--sahne3b-gok', yer: '--sahne3b-yer', ortam: '--sahne3b-ortam', ortamZemin: '--sahne3b-ortam-zemin',
  lamba: '--sahne3b-lamba', gun: '--sahne3b-gun',
  andonYesil: '--sahne3b-andon-yesil', andonSari: '--sahne3b-andon-sari', andonKirmizi: '--sahne3b-andon-kirmizi',
  andonYesilSonuk: '--sahne3b-andon-yesil-sonuk', andonSariSonuk: '--sahne3b-andon-sari-sonuk', andonKirmiziSonuk: '--sahne3b-andon-kirmizi-sonuk',
  ekran: '--sahne3b-ekran', ekranYazi: '--sahne3b-ekran-yazi', ekranSoluk: '--sahne3b-ekran-soluk', ekranCubuk: '--sahne3b-ekran-cubuk',
  ekranIlerleme: '--sahne3b-ekran-ilerleme', ekranAlarm: '--sahne3b-ekran-alarm', ekranCalisiyor: '--sahne3b-ekran-calisiyor',
  ekranDurakli: '--sahne3b-ekran-durakli', ekranDurdu: '--sahne3b-ekran-durdu', ekranBekliyor: '--sahne3b-ekran-bekliyor',
  rota: '--sahne3b-rota', kivilcim: '--sahne3b-kivilcim', kivilcimHale: '--sahne3b-kivilcim-hale',
  cizgi: '--sahne3b-cizgi', bolgeKirmizi: '--sahne3b-bolge-kirmizi', bolgeYesil: '--sahne3b-bolge-yesil', bolgeMavi: '--sahne3b-bolge-mavi',
  tarama: '--sahne3b-tarama', ok: '--sahne3b-ok', odaYazi: '--sahne3b-oda-yazi',
  calisiyor: '--run', durakli: '--hold', durdu: '--stop', bekliyor: '--idle', secim: '--hazard',
} as const;

export type RenkAdi = keyof typeof DEGISKENLER;
// `metin`: tuval dokuları için CSS rengi olduğu gibi. Malzeme rengi doğrusal uzayda okunur: sahne aydınlatması
// (ACES ton eşleme, pozlama) bu değerlerle ayarlıdır; malzemenin görünen tonu tasarım değişkenindeki tondur.
export type Palet = Record<RenkAdi, Color> & { metin: Record<RenkAdi, string> };

export function paletOku(kok: Element = document.documentElement): Palet {
  const stil = getComputedStyle(kok);
  const renkler = {} as Record<RenkAdi, Color>;
  const metin = {} as Record<RenkAdi, string>;
  for (const [ad, degisken] of Object.entries(DEGISKENLER) as [RenkAdi, string][]) {
    const deger = stil.getPropertyValue(degisken).trim();
    // Değişken yoksa (test ortamı) nötr gri: sahne kurulur, renk uydurulmaz.
    metin[ad] = deger === '' ? 'rgb(128,128,128)' : deger;
    const renk = new Color();
    if (deger === '') renk.setRGB(0.5, 0.5, 0.5);
    else if (ad === 'arka') renk.setStyle(deger);
    else renk.setStyle(deger, LinearSRGBColorSpace);
    renkler[ad] = renk;
  }
  return Object.assign(renkler, { metin });
}

// Malzeme dışı renkler (arka plan) değişti mi: yalnız arka plan temalıdır, sahne yeniden kurulmaz.
export const malzemeImzasi = (p: Palet): string =>
  (Object.keys(DEGISKENLER) as RenkAdi[]).filter((k) => !['arka', 'calisiyor', 'durakli', 'durdu', 'bekliyor', 'secim'].includes(k)).map((k) => p.metin[k]).join('|');
