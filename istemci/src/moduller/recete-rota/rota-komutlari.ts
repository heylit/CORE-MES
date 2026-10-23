// Rota komutları (kart #1184): prototipin rota eylemleri rota modülünün VAR OLAN uçlarına gider (`/rota/urunler/:urunId/taslak-ac`,
// `/rota/revizyonlar/:id/{kaydet,onaya-gonder,geri-gonder,onayla,yururluge-al,iptal}`). Kural, yetki ve sürüm denetimi sahibindedir; burası
// yalnız alanları süzer ve türünü denetler (zod'suz: `paylasilan` sözleşmesi zod taşıdığı için istemciye değer olarak giremez, sunucu testi
// `rota-dilimi.test.ts` aynı tabloyla sahibin ucunu dener). Taslak kaydet bütün içeriği değiştirir; sürüm okunan
// revizyonun sürümüdür, başkası arada yazdıysa sahibi 409 döner.
type Nesne = Record<string, unknown>;
export interface RotaHazirKomut { yol: string; govde: Nesne; tekrarKorumali?: boolean }
// hafif: komut sonrası yalnız bağlı durum yeniden okunur (kaynak sürümleri ve takvim okunmaz); kaydet her düzenlemede koşabilir.
export interface RotaKomutu { hafif: true; hazirla: (girdi: Nesne) => RotaHazirKomut }

const gecersiz = (alan: string): Error => new Error(`Geçersiz ${alan}.`);
const nesne = (v: unknown): Nesne => (v !== null && typeof v === 'object' && !Array.isArray(v) ? v as Nesne : {});
const tamSayi = (v: unknown, alan: string): number => {
  if (typeof v !== 'number' || !Number.isInteger(v) || v <= 0) throw gecersiz(alan);
  return v;
};
const tamSayiVeyaBos = (v: unknown, alan: string): number | null => (v === null || v === undefined ? null : tamSayi(v, alan));
const sayiVeyaBos = (v: unknown, alan: string): number | null => {
  if (v === null || v === undefined) return null;
  if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) throw gecersiz(alan);
  return v;
};
const sayi = (v: unknown, alan: string): number => {
  const s = sayiVeyaBos(v, alan);
  if (s === null) throw gecersiz(alan);
  return s;
};
const secenek = <T extends string>(v: unknown, izinli: readonly T[], alan: string): T => {
  const bulunan = izinli.find((x) => x === v);
  if (bulunan === undefined) throw gecersiz(alan);
  return bulunan;
};
const dizi = (v: unknown, alan: string, azami: number): Nesne[] => {
  if (!Array.isArray(v) || v.length > azami) throw gecersiz(alan);
  return v.map(nesne);
};

const KAYNAK_TURLERI = ['makine', 'kisi', 'istasyon'] as const;
const ADIM_KAYNAK_TURLERI = [...KAYNAK_TURLERI, 'fason'] as const;
const BAGIMLILIKLAR = ['bagimsiz', 'bekleyen', 'akisli'] as const;
const KULLANIMLAR = ['tek', 'paralel'] as const;
const TASLAK_KAYNAKLARI = ['revizyon', 'bos'] as const;
const SURE_TURLERI = ['hazirlik', 'islem', 'degisim'] as const;

const kaynak = <T extends string>(v: unknown, izinli: readonly T[], alan: string): { tur: T; id: number } | null => {
  if (v === null || v === undefined) return null;
  const k = nesne(v);
  return { tur: secenek(k['tur'], izinli, alan), id: tamSayi(k['id'], alan) };
};

function adim(a: Nesne): Nesne {
  const ad = typeof a['ad'] === 'string' ? a['ad'].trim().slice(0, 80) : '';
  if (ad === '') throw gecersiz('adım adı');
  return {
    opNo: tamSayiVeyaBos(a['opNo'], 'OP numarası'),
    operasyonTipiId: tamSayi(a['operasyonTipiId'], 'operasyon'),
    ad,
    kaynak: kaynak(a['kaynak'], ADIM_KAYNAK_TURLERI, 'kaynak'),
    ayarSuresiDk: sayiVeyaBos(a['ayarSuresiDk'], 'hazırlık süresi'),
    birimSureDk: sayiVeyaBos(a['birimSureDk'], 'birim süre'),
    islemSuresiDk: sayiVeyaBos(a['islemSuresiDk'], 'işlem süresi'),
    degisimSuresiDk: sayiVeyaBos(a['degisimSuresiDk'], 'değişim süresi'),
    terminGun: tamSayiVeyaBos(a['terminGun'], 'termin günü'),
    bagimlilik: secenek(a['bagimlilik'], BAGIMLILIKLAR, 'bağımlılık'),
    devirAdedi: tamSayiVeyaBos(a['devirAdedi'], 'devir adedi'),
    firePayiYuzde: sayi(a['firePayiYuzde'], 'fire payı'),
    makineKullanimi: secenek(a['makineKullanimi'], KULLANIMLAR, 'makine kullanımı'),
    enKucukParca: tamSayiVeyaBos(a['enKucukParca'], 'en küçük parça'),
    yenidenAyar: a['yenidenAyar'] === true,
    adaylar: dizi(a['adaylar'], 'adaylar', 10).map((x) => {
      const k = kaynak(x['kaynak'], KAYNAK_TURLERI, 'aday kaynak');
      if (k === null) throw gecersiz('aday kaynak');
      return {
        kaynak: k, ayarSuresiDk: sayiVeyaBos(x['ayarSuresiDk'], 'aday hazırlık süresi'), birimSureDk: sayiVeyaBos(x['birimSureDk'], 'aday birim süre'),
        islemSuresiDk: sayiVeyaBos(x['islemSuresiDk'], 'aday işlem süresi'), degisimSuresiDk: sayiVeyaBos(x['degisimSuresiDk'], 'aday değişim süresi'),
      };
    }),
    bilesenler: dizi(a['bilesenler'], 'bileşenler', 30).map((x) => ({ malzemeId: tamSayi(x['malzemeId'], 'bileşen'), miktar: sayi(x['miktar'], 'bileşen miktarı'), fireYuzde: sayi(x['fireYuzde'], 'bileşen fire payı') })),
    yanUrunler: dizi(a['yanUrunler'], 'yan ürünler', 10).map((x) => ({ malzemeId: tamSayi(x['malzemeId'], 'yan ürün'), miktar: sayi(x['miktar'], 'yan ürün miktarı') })),
  };
}

const revizyonYolu = (girdi: Nesne, komut: string): string => `/rota/revizyonlar/${String(tamSayi(girdi['revizyonId'], 'revizyon'))}/${komut}`;
const surumGovdesi = (girdi: Nesne): Nesne => ({ surum: tamSayi(girdi['surum'], 'sürüm') });
const basit = (komut: string): RotaKomutu => ({ hafif: true, hazirla: (g) => ({ yol: revizyonYolu(g, komut), govde: surumGovdesi(g) }) });
const olcumYolu = (girdi: Nesne, ek: string): string => `/rota/adimlar/${String(tamSayi(girdi['adimId'], 'adım'))}/gerceklesen-sure${ek}`;
// Ölçümün tür, makine ve okunan son satırı (169 c): okunanId ekranın gördüğü son satırdır, arada yazan varsa sahibi 409 döner.
const olcumGovdesi = (g: Nesne): Nesne => ({
  tur: secenek(g['tur'], SURE_TURLERI, 'süre türü'), makineId: tamSayiVeyaBos(g['makineId'], 'makine'), okunanId: tamSayiVeyaBos(g['okunanId'], 'okunan satır'),
});

export const ROTA_KOMUTLARI: Readonly<Record<string, RotaKomutu>> = {
  // Taslak açma tekrar korumalıdır (sahibinde); kaynak yürürlükteki revizyon ya da boş rotadır.
  'rota-taslak-ac': {
    hafif: true,
    hazirla: (g) => {
      const k = nesne(g['kaynak']);
      const tur = secenek(k['tur'], TASLAK_KAYNAKLARI, 'taslak kaynağı');
      return {
        yol: `/rota/urunler/${String(tamSayi(g['urunId'], 'ürün'))}/taslak-ac`,
        govde: { kaynak: tur === 'revizyon' ? { tur, revizyonId: tamSayi(k['revizyonId'], 'revizyon') } : { tur } },
        tekrarKorumali: true,
      };
    },
  },
  'rota-kaydet': {
    hafif: true,
    hazirla: (g) => {
      const aciklama = typeof g['aciklama'] === 'string' && g['aciklama'].trim() !== '' ? g['aciklama'].trim().slice(0, 300) : null;
      return { yol: revizyonYolu(g, 'kaydet'), govde: { ...surumGovdesi(g), aciklama, adimlar: dizi(g['adimlar'], 'adımlar', 60).map(adim) } };
    },
  },
  'rota-onaya-gonder': basit('onaya-gonder'),
  'rota-geri-gonder': basit('geri-gonder'),
  'rota-yururluge-al': basit('yururluge-al'),
  'rota-iptal': basit('iptal'),
  // Süreler (169 c, 171 a): elle girilen değer ölçümdür, boş değer bekleyen ölçümü boşaltır; kabul ölçümü ürünün taslağına teorik süre
  // olarak yazar (değeri sahibi ölçüm satırından alır, ekran süre göndermez). İkisi de defter satırı yazdığı için tekrar korumalıdır.
  'rota-olcum-yaz': {
    hafif: true,
    hazirla: (g) => ({ yol: olcumYolu(g, ''), govde: { ...olcumGovdesi(g), sureDk: sayiVeyaBos(g['sureDk'], 'süre') }, tekrarKorumali: true }),
  },
  'rota-olcum-kabul': {
    hafif: true,
    hazirla: (g) => ({ yol: olcumYolu(g, '/kabul'), govde: { ...olcumGovdesi(g), olcumId: tamSayi(g['olcumId'], 'ölçüm') }, tekrarKorumali: true }),
  },
  'rota-onayla': {
    hafif: true,
    hazirla: (g) => ({ yol: revizyonYolu(g, 'onayla'), govde: { ...surumGovdesi(g), yururlugeAl: g['yururlugeAl'] === true } }),
  },
};
