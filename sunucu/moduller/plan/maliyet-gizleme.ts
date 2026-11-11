// Planlama çalışmasının para alanları yalnız maliyet okuyana gider (223 a: fiyat ve maliyet görünümü finans.maliyet-oku). Ekran bu
// alanları zaten gizler; burası veriyi de vermez. Liste adlıdır (kara liste): planlama sayfası çalışmanın neredeyse tamamını okur, beyaz
// liste sayfayı kırardı. Ödünü: çalışmaya sonradan eklenen para alanı kendiliğinden düşmez; maliyet-gizleme.test.ts alan kaynak
// tablosundaki para alanlarının ve adı para söyleyen kaynak alanlarının bu listede olduğunu ölçer. Sayfanın kendi para alanları (fasoncu
// fiyatı gibi) kaynak tablosunda yoktur; yenisi eklenirse buraya elle eklenir.
// Maliyet okumayan planlamacı da çalışmayı yazar (plan.yaz). Yazdığı çalışmada düşen alanlar yoktur; kayıttaki değerleri geri konur ki
// planlamacının kaydı ücretleri, gelirleri ve gider tablolarını silmesin. Yeni varlığın değeri yoktur, uydurulmaz.

type Nesne = Record<string, unknown>;
const nesneMi = (v: unknown): v is Nesne => typeof v === 'object' && v !== null && !Array.isArray(v);

// Varlık dizisi, kimlik alanı ve düşen alanlar.
export const VARLIK_PARA_ALANLARI = [
  { dizi: 'tezgahlar', kimlik: 'id', alanlar: ['ucret', 'ucretIst'] },
  { dizi: 'malzemeler', kimlik: 'kod', alanlar: ['birimFiyat', 'fiyatTahmini', 'kgRef'] },
  { dizi: 'siparisler', kimlik: 'id', alanlar: ['gelir', 'cezaGun', 'cezaOran', 'cezaTavan'] },
  { dizi: 'fasoncular', kimlik: 'id', alanlar: ['saatFiyat', 'fiyat', 'tasima'] },
] as const;
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
export const IZ_PARA_OLAYLARI: readonly string[] = [
  'Tezgâh saat maliyeti değişti', 'Maliyet ayarı değişti', 'Ücret değişti', 'Fason fiyatı değişti', 'Talaş satış fiyatı değişti',
  'Sipariş fiyatı değişti', 'Kişi ücreti', 'Mesai bedeli', 'Dolaylı personel eklendi', 'Dolaylı personel silindi', 'Elektrik birim fiyatı',
  'Gider kalemi eklendi', 'Gider kalemi silindi', 'Gider tutarı', 'Genel gider hesabı', 'Makine saat maliyeti hesaptan', 'Tezgâh maliyet bilgisi',
  'Gecikme bedeli verisi değişti',
];
const izParaMi = (x: unknown): x is Nesne => nesneMi(x) && typeof x['ne'] === 'string' && IZ_PARA_OLAYLARI.includes(x['ne']);
const izAnahtari = (x: Nesne): string => JSON.stringify([x['t'] ?? null, x['kim'] ?? null, x['ne']]);

function veriyiSuz(D: Nesne): Nesne {
  const y: Nesne = { ...D };
  for (const a of UST_PARA_ALANLARI) delete y[a];
  for (const { ust, alanlar } of IC_PARA_ALANLARI) {
    const u = y[ust];
    if (!nesneMi(u)) continue;
    const k: Nesne = { ...u };
    for (const a of alanlar) delete k[a];
    y[ust] = k;
  }
  for (const { dizi, alanlar } of VARLIK_PARA_ALANLARI) {
    const d = y[dizi];
    if (!Array.isArray(d)) continue;
    y[dizi] = d.map((x: unknown) => {
      if (!nesneMi(x)) return x;
      const k: Nesne = { ...x };
      // Boş değer (69 a: okunamayan ücret null) tutar taşımaz, varlığın biçimi değişmesin diye kalır.
      for (const a of alanlar) if (k[a] !== null) delete k[a];
      return k;
    });
  }
  return y;
}

function veriyiBirlestir(yeni: Nesne, eski: Nesne): Nesne {
  const y: Nesne = { ...yeni };
  for (const a of UST_PARA_ALANLARI) {
    if (eski[a] === undefined) delete y[a];
    else y[a] = eski[a];
  }
  for (const { ust, alanlar } of IC_PARA_ALANLARI) {
    const u = y[ust];
    const e = eski[ust];
    if (!nesneMi(u)) continue;
    const k: Nesne = { ...u };
    for (const a of alanlar) {
      if (nesneMi(e) && e[a] !== undefined) k[a] = e[a];
      else delete k[a];
    }
    y[ust] = k;
  }
  for (const { dizi, kimlik, alanlar } of VARLIK_PARA_ALANLARI) {
    const d = y[dizi];
    if (!Array.isArray(d)) continue;
    const eskiDizi = Array.isArray(eski[dizi]) ? (eski[dizi] as unknown[]).filter(nesneMi) : [];
    const eskiler = new Map(eskiDizi.map((x) => [String(x[kimlik]), x]));
    y[dizi] = d.map((x: unknown) => {
      if (!nesneMi(x)) return x;
      const e = eskiler.get(String(x[kimlik]));
      const k: Nesne = { ...x };
      for (const a of alanlar) {
        if (e !== undefined && e[a] !== undefined) k[a] = e[a];
        else delete k[a];
      }
      return k;
    });
  }
  return y;
}

// Senaryo veri kopyası (D) taşır; hafif senaryoda kopya yoktur.
const senaryolar = (S: Nesne): Nesne[] => (Array.isArray(S['senaryolar']) ? (S['senaryolar'] as unknown[]).filter(nesneMi) : []);

// Bekleyen değişikliğin geri yaması (787 a) düşen alana dönüyorsa eski değerini taşır; o geri adımın değeri düşer.
const paraAlaniMi = (yol: unknown): boolean => {
  if (!Array.isArray(yol)) return false;
  const p = yol.map(String);
  return p.some((x) => (UST_PARA_ALANLARI as readonly string[]).includes(x))
    || IC_PARA_ALANLARI.some(({ ust, alanlar }) => p.includes(ust) && alanlar.some((a) => p.includes(a)))
    || VARLIK_PARA_ALANLARI.some(({ dizi, alanlar }) => p.includes(dizi) && alanlar.some((a) => p.includes(a)));
};

function bekleyeniSuz(b: unknown): unknown {
  if (!Array.isArray(b)) return b;
  return b.map((x: unknown) => {
    if (!nesneMi(x) || !Array.isArray(x['geri'])) return x;
    return { ...x, geri: (x['geri'] as unknown[]).map((g) => (nesneMi(g) && paraAlaniMi(g['yol']) ? { ...g, once: null } : g)) };
  });
}

// Okuma: çalışmanın (S) para alanları düşmüş kopyası. Çalışma biçimi tanınmıyorsa (D yok) olduğu gibi döner.
export function maliyetsizCalisma(S: unknown): unknown {
  if (!nesneMi(S)) return S;
  const y: Nesne = { ...S };
  if (nesneMi(S['D'])) y['D'] = veriyiSuz(S['D']);
  if (Array.isArray(S['senaryolar'])) {
    y['senaryolar'] = (S['senaryolar'] as unknown[]).map((s) => (nesneMi(s) && nesneMi(s['D']) ? { ...s, D: veriyiSuz(s['D']) } : s));
  }
  if (S['bekleyen'] !== undefined) y['bekleyen'] = bekleyeniSuz(S['bekleyen']);
  if (Array.isArray(S['iz'])) y['iz'] = (S['iz'] as unknown[]).map((x) => (izParaMi(x) ? { ...x, ayrinti: '' } : x));
  return y;
}

// Yazma: maliyet okumayanın gönderdiği çalışmaya kayıttaki para alanları geri konur (senaryo kimliğiyle eşlenir). Kayıt yoksa ya da
// biçimi tanınmıyorsa düşen alan boş kalır. Bekleyen geri yamasının eski değeri kayıttakidir (aynı kimlik ve yolda).
export function maliyetiGeriKoy(yeni: unknown, eski: unknown): unknown {
  if (!nesneMi(yeni)) return yeni;
  const e = nesneMi(eski) ? eski : {};
  const y: Nesne = { ...yeni };
  if (nesneMi(yeni['D'])) y['D'] = veriyiBirlestir(yeni['D'], nesneMi(e['D']) ? e['D'] : {});
  if (Array.isArray(yeni['senaryolar'])) {
    const eskiler = new Map(senaryolar(e).map((s) => [String(s['id']), s]));
    y['senaryolar'] = (yeni['senaryolar'] as unknown[]).map((s) => {
      if (!nesneMi(s) || !nesneMi(s['D'])) return s;
      const es = eskiler.get(String(s['id']));
      return { ...s, D: veriyiBirlestir(s['D'], es !== undefined && nesneMi(es['D']) ? es['D'] : {}) };
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
        geri: (b['geri'] as unknown[]).map((g) => {
          if (!nesneMi(g) || !paraAlaniMi(g['yol'])) return g;
          const anahtar = JSON.stringify([g['yol'], g['id'] ?? null]);
          const eg = eskiGeri.find((x) => JSON.stringify([x['yol'], x['id'] ?? null]) === anahtar);
          return { ...g, once: eg !== undefined ? eg['once'] : null };
        }),
      };
    });
  }
  if (Array.isArray(yeni['iz'])) {
    const eskiIz = new Map((Array.isArray(e['iz']) ? (e['iz'] as unknown[]).filter(izParaMi) : []).map((x) => [izAnahtari(x), x]));
    y['iz'] = (yeni['iz'] as unknown[]).map((x) => {
      if (!izParaMi(x)) return x;
      const ex = eskiIz.get(izAnahtari(x));
      return { ...x, ayrinti: ex !== undefined ? ex['ayrinti'] : '' };
    });
  }
  return y;
}
