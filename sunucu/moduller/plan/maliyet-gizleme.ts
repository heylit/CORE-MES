// Planlama çalışmasının para alanları yalnız maliyet okuyana gider (223 a: fiyat ve maliyet görünümü finans.maliyet-oku). Ekran bu
// alanları zaten gizler; burası veriyi de vermez. Liste adlıdır (kara liste): planlama sayfası çalışmanın neredeyse tamamını okur, beyaz
// liste sayfayı kırardı. Ödünü: çalışmaya sonradan eklenen para alanı kendiliğinden düşmez; maliyet-gizleme.test.ts alan kaynak
// tablosundaki para alanlarının ve adı para söyleyen kaynak alanlarının bu listede olduğunu ölçer. Sayfanın kendi para alanları (fasoncu
// fiyatı gibi) kaynak tablosunda yoktur; yenisi eklenirse buraya elle eklenir.
// Maliyet okumayan planlamacı da çalışmayı yazar (plan.yaz). Yazdığı çalışmada düşen alanlar yoktur; kayıttaki değerleri geri konur ki
// planlamacının kaydı ücretleri, gelirleri ve gider tablolarını silmesin. Yeni varlığın değeri yoktur, uydurulmaz.
// İki küme var (2897): maliyet alanları finans.maliyet-oku ister; sipariş geliri, cezası ve gelirden türeyen TL (planın TL özeti, nabız
// ölçüsü, mesai kararının neti) maliyet ve sipariş fiyatı yetkisini birlikte ister (sipariş fiyatı yalnız siparisler.fiyat-oku'yadır).

type Nesne = Record<string, unknown>;
const nesneMi = (v: unknown): v is Nesne => typeof v === 'object' && v !== null && !Array.isArray(v);

// Okuyanın görebildiği: maliyet (finans.maliyet-oku) ve gelir (maliyet ile siparisler.fiyat-oku birlikte).
export interface Gorunum { maliyet: boolean; gelir: boolean }
const HICBIRI: Gorunum = { maliyet: false, gelir: false };

interface Kume {
  varlik: readonly { dizi: string; kimlik: string; alanlar: readonly string[] }[];
  ust: readonly string[];
  ic: readonly { ust: string; alanlar: readonly string[] }[];
  iz: readonly string[];
}

// Varlık dizisi, kimlik alanı ve düşen alanlar.
const MALIYET_VARLIK = [
  { dizi: 'tezgahlar', kimlik: 'id', alanlar: ['ucret', 'ucretIst'] },
  { dizi: 'malzemeler', kimlik: 'kod', alanlar: ['birimFiyat', 'fiyatTahmini', 'kgRef'] },
  { dizi: 'fasoncular', kimlik: 'id', alanlar: ['saatFiyat', 'fiyat', 'tasima'] },
] as const;
const GELIR_VARLIK = [
  { dizi: 'siparisler', kimlik: 'id', alanlar: ['gelir', 'cezaGun', 'cezaOran', 'cezaTavan'] },
  // Mesai kararının neti kabul edilen ek mesainin gelirden düşülmüş TL karşılığıdır; yeni ekran boş yazar, eski kayıtta dolu olabilir.
  { dizi: 'mesaiKarar', kimlik: '', alanlar: ['net'] },
] as const;
export const VARLIK_PARA_ALANLARI = [MALIYET_VARLIK[0], MALIYET_VARLIK[1], GELIR_VARLIK[0], MALIYET_VARLIK[2]] as const;
// Çalışmanın (D) üst alanları: fiyat listeleri ve gider tablosu bütünüyle düşer.
export const UST_PARA_ALANLARI = ['talasFiyat', 'kgFiyat', 'maliyetSis'] as const;
// Üst alanın içindeki para alanları: alanın geri kalanı (mesai sınırları, plan amacı) planlamanın girdisidir, kalır.
// planTL.genelGider burada değildir: kayda hiç girmez ve okuyamayana null ile genelGiderGizli gider (2601 a, 2668 a, Güvenlik K1;
// motor-ayari-kurallar.ts genelGiderAlanlariniCikar). Ekran "gizli" yazısını o null'dan çizer, alan düşerse ayrım kaybolurdu.
export const IC_PARA_ALANLARI = [
  { ust: 'mesaiSis', alanlar: ['ucret'] },
  { ust: 'planTL', alanlar: ['operatorUcret'] },
  { ust: 'ayarlar', alanlar: ['mesaiUcret', 'ayarciUcret'] },
] as const;

// Değişiklik izinin (S.iz) para ayrıntısı taşıyan olayları: maliyet sayfalarının yazdığı olay adları (istemci planlama/maliyet/yazmalar.ts,
// siparis). Satır kalır (kim, ne zaman, ne), tutar taşıyan ayrıntı düşer.
const IZ_GELIR_OLAYLARI = ['Sipariş fiyatı değişti', 'Gecikme bedeli verisi değişti'];
export const IZ_PARA_OLAYLARI: readonly string[] = [
  'Tezgâh saat maliyeti değişti', 'Maliyet ayarı değişti', 'Ücret değişti', 'Fason fiyatı değişti', 'Talaş satış fiyatı değişti',
  'Kişi ücreti', 'Mesai bedeli', 'Dolaylı personel eklendi', 'Dolaylı personel silindi', 'Elektrik birim fiyatı',
  'Gider kalemi eklendi', 'Gider kalemi silindi', 'Gider tutarı', 'Genel gider hesabı', 'Makine saat maliyeti hesaptan', 'Tezgâh maliyet bilgisi',
  ...IZ_GELIR_OLAYLARI,
];

const MALIYET: Kume = { varlik: MALIYET_VARLIK, ust: UST_PARA_ALANLARI, ic: IC_PARA_ALANLARI, iz: IZ_PARA_OLAYLARI.filter((x) => !IZ_GELIR_OLAYLARI.includes(x)) };
const GELIR: Kume = { varlik: GELIR_VARLIK, ust: [], ic: [], iz: IZ_GELIR_OLAYLARI };

const izAnahtari = (x: Nesne): string => JSON.stringify([x['t'] ?? null, x['kim'] ?? null, x['ne']]);
// Kimliksiz satır (mesai kararı) tezgâh, gün ve vardiyasıyla eşlenir.
const satirAnahtari = (x: Nesne, kimlik: string): string => (kimlik !== '' ? String(x[kimlik]) : JSON.stringify([x['m'] ?? null, x['gun'] ?? null, x['vardiya'] ?? null]));

function veriyiSuz(D: Nesne, k: Kume): Nesne {
  const y: Nesne = { ...D };
  for (const a of k.ust) delete y[a];
  for (const { ust, alanlar } of k.ic) {
    const u = y[ust];
    if (!nesneMi(u)) continue;
    const z: Nesne = { ...u };
    for (const a of alanlar) delete z[a];
    y[ust] = z;
  }
  for (const { dizi, alanlar } of k.varlik) {
    const d = y[dizi];
    if (!Array.isArray(d)) continue;
    y[dizi] = d.map((x: unknown) => {
      if (!nesneMi(x)) return x;
      const z: Nesne = { ...x };
      // Boş değer (69 a: okunamayan ücret null) tutar taşımaz, varlığın biçimi değişmesin diye kalır.
      for (const a of alanlar) if (z[a] !== null) delete z[a];
      return z;
    });
  }
  return y;
}

function veriyiBirlestir(yeni: Nesne, eski: Nesne, k: Kume): Nesne {
  const y: Nesne = { ...yeni };
  for (const a of k.ust) {
    if (eski[a] === undefined) delete y[a];
    else y[a] = eski[a];
  }
  for (const { ust, alanlar } of k.ic) {
    const u = y[ust];
    const e = eski[ust];
    if (!nesneMi(u)) continue;
    const z: Nesne = { ...u };
    for (const a of alanlar) {
      if (nesneMi(e) && e[a] !== undefined) z[a] = e[a];
      else delete z[a];
    }
    y[ust] = z;
  }
  for (const { dizi, kimlik, alanlar } of k.varlik) {
    const d = y[dizi];
    if (!Array.isArray(d)) continue;
    const eskiDizi = Array.isArray(eski[dizi]) ? (eski[dizi] as unknown[]).filter(nesneMi) : [];
    const eskiler = new Map(eskiDizi.map((x) => [satirAnahtari(x, kimlik), x]));
    y[dizi] = d.map((x: unknown) => {
      if (!nesneMi(x)) return x;
      const e = eskiler.get(satirAnahtari(x, kimlik));
      const z: Nesne = { ...x };
      for (const a of alanlar) {
        if (e !== undefined && e[a] !== undefined) z[a] = e[a];
        else delete z[a];
      }
      return z;
    });
  }
  return y;
}

// --- gelirden türeyen TL (2897): planın TL özeti, nabız ölçüsü ve imzası, sabit referans ---
// Planın kaydı (motor/degerlendir.js planKaydi) ozet.tl taşır; ekran önceki özeti oncekiOzet'e koyar. tl maliyet, gelir ve cezadan türer.
// Nabız satırının imzası ölçünün TL'sini de içeren eski sayfa metnidir; ekran okumaz, bütünüyle düşer.
const OZET_ALANLARI = ['ozet', 'oncekiOzet', 'o'] as const;
function tlsiz(x: unknown): unknown {
  if (!nesneMi(x)) return x;
  const y: Nesne = { ...x };
  for (const a of OZET_ALANLARI) if (nesneMi(y[a]) && (y[a] as Nesne)['tl'] !== undefined) { const { tl: _t, ...kalan } = y[a] as Nesne; y[a] = kalan; }
  if ('imza' in y) delete y['imza'];
  return y;
}
// Yazmada: düşen TL ve imza aynı plan (aynı veri sürümü ve çözüm zamanı) ya da aynı nabız satırıysa kayıttakidir; yeni planınki boştur
// (gelir göremeyenin çözdüğü planın TL'si yoktur, eski planınki ona ait değildir).
function tlGeriKoy(yeni: unknown, eski: unknown): unknown {
  if (!nesneMi(yeni)) return yeni;
  const y = tlsiz(yeni) as Nesne;
  if (!nesneMi(eski)) return y;
  for (const a of OZET_ALANLARI) {
    if (nesneMi(y[a]) && nesneMi(eski[a]) && (eski[a] as Nesne)['tl'] !== undefined) y[a] = { ...(y[a] as Nesne), tl: (eski[a] as Nesne)['tl'] };
  }
  if (eski['imza'] !== undefined) y['imza'] = eski['imza'];
  return y;
}
const ayniPlan = (a: Nesne, b: Nesne): boolean => a['dataVer'] === b['dataVer'] && (a['zaman'] ?? null) === (b['zaman'] ?? null);
const nabizAnahtari = (x: Nesne): string => JSON.stringify([x['t'] ?? null, x['ne'] ?? null]);

function turevSuz(S: Nesne, y: Nesne): void {
  if (nesneMi(S['plan'])) y['plan'] = tlsiz(S['plan']);
  if (Array.isArray(S['nabiz'])) y['nabiz'] = (S['nabiz'] as unknown[]).map(tlsiz);
  if (nesneMi(S['nbSabit'])) y['nbSabit'] = tlsiz(S['nbSabit']);
}
function turevGeriKoy(yeni: Nesne, eski: Nesne, y: Nesne): void {
  if (nesneMi(yeni['plan'])) y['plan'] = nesneMi(eski['plan']) && ayniPlan(yeni['plan'], eski['plan']) ? tlGeriKoy(yeni['plan'], eski['plan']) : tlsiz(yeni['plan']);
  if (Array.isArray(yeni['nabiz'])) {
    const eskiler = new Map((Array.isArray(eski['nabiz']) ? (eski['nabiz'] as unknown[]).filter(nesneMi) : []).map((x) => [nabizAnahtari(x), x]));
    y['nabiz'] = (yeni['nabiz'] as unknown[]).map((x) => (nesneMi(x) ? tlGeriKoy(x, eskiler.get(nabizAnahtari(x))) : x));
  }
  if (nesneMi(yeni['nbSabit'])) y['nbSabit'] = nesneMi(eski['nbSabit']) && eski['nbSabit']['ad'] === yeni['nbSabit']['ad'] ? tlGeriKoy(yeni['nbSabit'], eski['nbSabit']) : tlsiz(yeni['nbSabit']);
}

// Senaryo veri kopyası (D) taşır; hafif senaryoda kopya yoktur, plan ve özet kalır.
const senaryolar = (S: Nesne): Nesne[] => (Array.isArray(S['senaryolar']) ? (S['senaryolar'] as unknown[]).filter(nesneMi) : []);

// Bekleyen değişikliğin geri yaması (787 a) düşen alana dönüyorsa eski değerini taşır; o geri adımın değeri düşer.
const kumeAlaniMi = (yol: unknown, k: Kume): boolean => {
  if (!Array.isArray(yol)) return false;
  const p = yol.map(String);
  return p.some((x) => k.ust.includes(x))
    || k.ic.some(({ ust, alanlar }) => p.includes(ust) && alanlar.some((a) => p.includes(a)))
    || k.varlik.some(({ dizi, alanlar }) => p.includes(dizi) && alanlar.some((a) => p.includes(a)));
};

const kumeler = (g: Gorunum): Kume[] => [...(g.maliyet ? [] : [MALIYET]), ...(g.gelir ? [] : [GELIR])];

// Okuma: çalışmanın (S) okuyanın göremediği para alanları düşmüş kopyası. Çalışma biçimi tanınmıyorsa (D yok) olduğu gibi döner.
export function maliyetsizCalisma(S: unknown, g: Gorunum = HICBIRI): unknown {
  if (!nesneMi(S)) return S;
  const ks = kumeler(g);
  if (ks.length === 0) return S;
  const suz = (D: Nesne): Nesne => ks.reduce((d, k) => veriyiSuz(d, k), D);
  const izMi = (x: unknown): boolean => nesneMi(x) && typeof x['ne'] === 'string' && ks.some((k) => k.iz.includes(x['ne'] as string));
  const geriMi = (yol: unknown): boolean => ks.some((k) => kumeAlaniMi(yol, k));
  const y: Nesne = { ...S };
  if (nesneMi(S['D'])) y['D'] = suz(S['D']);
  if (!g.gelir) turevSuz(S, y);
  if (Array.isArray(S['senaryolar'])) {
    y['senaryolar'] = (S['senaryolar'] as unknown[]).map((s) => {
      if (!nesneMi(s)) return s;
      const z: Nesne = nesneMi(s['D']) ? { ...s, D: suz(s['D']) } : { ...s };
      if (!g.gelir) { if (nesneMi(s['plan'])) z['plan'] = tlsiz(s['plan']); return tlsiz(z) as Nesne; }
      return z;
    });
  }
  if (Array.isArray(S['bekleyen'])) {
    y['bekleyen'] = (S['bekleyen'] as unknown[]).map((x: unknown) => {
      if (!nesneMi(x) || !Array.isArray(x['geri'])) return x;
      return { ...x, geri: (x['geri'] as unknown[]).map((r) => (nesneMi(r) && geriMi(r['yol']) ? { ...r, once: null } : r)) };
    });
  }
  if (Array.isArray(S['iz'])) y['iz'] = (S['iz'] as unknown[]).map((x) => (izMi(x) ? { ...(x as Nesne), ayrinti: '' } : x));
  return y;
}

// Yazma: okuyanın göremediği alanlara kayıttakiler geri konur (senaryo kimliğiyle eşlenir). Kayıt yoksa ya da biçimi tanınmıyorsa düşen
// alan boş kalır. Bekleyen geri yamasının eski değeri kayıttakidir (aynı kimlik ve yolda).
export function maliyetiGeriKoy(yeni: unknown, eski: unknown, g: Gorunum = HICBIRI): unknown {
  if (!nesneMi(yeni)) return yeni;
  const ks = kumeler(g);
  if (ks.length === 0) return yeni;
  const e = nesneMi(eski) ? eski : {};
  const birlestir = (D: Nesne, ed: Nesne): Nesne => ks.reduce((d, k) => veriyiBirlestir(d, ed, k), D);
  const izMi = (x: unknown): x is Nesne => nesneMi(x) && typeof x['ne'] === 'string' && ks.some((k) => k.iz.includes(x['ne'] as string));
  const geriMi = (yol: unknown): boolean => ks.some((k) => kumeAlaniMi(yol, k));
  const y: Nesne = { ...yeni };
  if (nesneMi(yeni['D'])) y['D'] = birlestir(yeni['D'], nesneMi(e['D']) ? e['D'] : {});
  if (!g.gelir) turevGeriKoy(yeni, e, y);
  if (Array.isArray(yeni['senaryolar'])) {
    const eskiler = new Map(senaryolar(e).map((s) => [String(s['id']), s]));
    y['senaryolar'] = (yeni['senaryolar'] as unknown[]).map((s) => {
      if (!nesneMi(s)) return s;
      const es = eskiler.get(String(s['id']));
      const z: Nesne = nesneMi(s['D']) ? { ...s, D: birlestir(s['D'], es !== undefined && nesneMi(es['D']) ? es['D'] : {}) } : { ...s };
      if (g.gelir) return z;
      const t = tlGeriKoy(z, es) as Nesne;
      if (nesneMi(s['plan'])) t['plan'] = es !== undefined && nesneMi(es['plan']) && ayniPlan(s['plan'], es['plan']) ? tlGeriKoy(s['plan'], es['plan']) : tlsiz(s['plan']);
      return t;
    });
  }
  if (Array.isArray(yeni['bekleyen'])) {
    const eskiBekleyen = new Map((Array.isArray(e['bekleyen']) ? (e['bekleyen'] as unknown[]).filter(nesneMi) : []).map((b) => [String(b['id']), b]));
    y['bekleyen'] = (yeni['bekleyen'] as unknown[]).map((b) => {
      if (!nesneMi(b) || !Array.isArray(b['geri'])) return b;
      const eb = eskiBekleyen.get(String(b['id']));
      const eskiGeri = eb !== undefined && Array.isArray(eb['geri']) ? (eb['geri'] as unknown[]).filter(nesneMi) : [];
      return {
        ...b,
        geri: (b['geri'] as unknown[]).map((r) => {
          if (!nesneMi(r) || !geriMi(r['yol'])) return r;
          const anahtar = JSON.stringify([r['yol'], r['id'] ?? null]);
          const eg = eskiGeri.find((x) => JSON.stringify([x['yol'], x['id'] ?? null]) === anahtar);
          return { ...r, once: eg !== undefined ? eg['once'] : null };
        }),
      };
    });
  }
  if (Array.isArray(yeni['iz'])) {
    const eskiIz = new Map((Array.isArray(e['iz']) ? (e['iz'] as unknown[]).filter(izMi) : []).map((x) => [izAnahtari(x), x]));
    y['iz'] = (yeni['iz'] as unknown[]).map((x) => {
      if (!izMi(x)) return x;
      const ex = eskiIz.get(izAnahtari(x));
      return { ...x, ayrinti: ex !== undefined ? ex['ayrinti'] : '' };
    });
  }
  return y;
}
