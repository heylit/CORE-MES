import type {
  AdimOlcusu, Bolum, BolumTuru, EmirAkisiCevabi, HammaddePartisi, KartAni, KartKonumu, KartRotasi, Olcu, Serit, StatuKalisi,
} from '#paylasilan/sozlesme/akis.ts';

// Akış Süresi hesabı (kart #1338). Saf: veritabanı ve saat yok; "şimdi" girdidir. Kurallar AKS-<n> numarasıyla KURAL-TEST.md'dedir.

export type UretimOlayi = 'baslat' | 'bitir' | 'duraklat' | 'durdur' | 'devam' | 'ayar';

export interface AkisAdimi {
  id: number;
  opNo: number;
  sira: number;
  istasyon: string | null;
  fason: boolean;
  terminGun: number | null;
  baslama: string | null;
  bitis: string | null;
  birimSureDk: number | null;
  ayarSuresiDk: number | null;
  bagimlilik: 'bekleyen' | 'akisli' | 'bagimsiz';
  // Akışlı adımın girdisi önceki adımdan bu kadar sağlam çıkınca hazırdır; başka bağımlılıkta null.
  devirAdedi: number | null;
}

export interface AkisHareketi {
  id: number;
  zaman: string;
  tur: 'giris' | 'cikis' | 'transfer' | 'sayim_fazla' | 'sayim_eksik' | 'geri_alma';
  malzemeId: number;
  partiId: number | null;
  miktar: string;
  kaynakStatuId: number | null;
  hedefStatuId: number | null;
  cikisNedeni: string | null;
}

export interface AkisOlayi { isEmriId: number | null; zaman: string; olay: UretimOlayi; kisiId?: number; durusNedeniId?: number | null }
export interface AkisSayimi { isEmriId: number | null; zaman: string; tur: 'saglam' | 'hurda'; adet: number; kisiId?: number; hurdaNedeniId?: number | null }

export interface AkisGirdisi {
  simdi: string;
  emir: { id: number; emirNo: string; malzemeNo: number | null; adet: number; durum: string; baslama: string | null; teslim: string | null };
  adimlar: readonly AkisAdimi[];
  olaylar: readonly AkisOlayi[];
  sayimlar: readonly AkisSayimi[];
  fason: readonly { isEmriId: number; yon: 'gidis' | 'donus'; zaman: string; adet: number }[];
  hareketler: readonly AkisHareketi[];
  statuler: ReadonlyMap<number, { ad: string; tur: 'HM' | 'YM' | 'MM' | null }>;
  partiGirisleri: ReadonlyMap<number, { lotNo: string | null; malKabul: string | null }>;
  sevk: { hazir: string | null; sevk: string | null } | null;
}

const an = (z: string): number => Date.parse(z);
const metin = (ms: number): string => new Date(ms).toISOString();
const DK = 60_000;
// Dakika bir ondalıkla: ekranda saniye gürültüsü göstermez.
const dk = (ms: number): number => Math.round(ms / DK * 10) / 10;
const enKucuk = (d: readonly (number | null)[]): number | null => d.reduce<number | null>((a, b) => (b === null ? a : a === null ? b : Math.min(a, b)), null);
const enBuyuk = (d: readonly (number | null)[]): number | null => d.reduce<number | null>((a, b) => (b === null ? a : a === null ? b : Math.max(a, b)), null);
// Stok miktarı numeric metindir; binde bir tam sayıya çevrilir, kayan nokta birikmez.
const binde = (m: string): number => Math.round(Number(m) * 1000);

interface Aralik { tur: BolumTuru; bas: number; bit: number; acik: boolean }

// AKS-1: adımın olayları sırayla bir durum makinesi işler. "ayar" hazırlığı, "baslat"/"devam" işlemeyi, "duraklat" duraklamayı,
// "durdur" duruşu başlatır; "bitir" kapatır. Kapanmamış son durum "şimdi"ye kadar sürer (açık). Olay yoksa iş emrinin başlama
// ve bitişi işleme sayılır. AKS-3: bitirilip yeniden açılan adımda bitir ile sonraki olay arası beklemedir; yeniden açılıp
// başlamamış adımın beklemesi emir sürüyorsa "şimdi"ye kadar açıktır.
export function adimAraliklari(
  adim: AkisAdimi, olaylar: readonly { zaman: string; olay: UretimOlayi }[], simdi: number, surer = true,
): Aralik[] {
  const sirali = [...olaylar].sort((a, b) => an(a.zaman) - an(b.zaman));
  if (sirali.length === 0) {
    if (adim.baslama === null) return [];
    const bit = adim.bitis === null ? simdi : an(adim.bitis);
    return [{ tur: 'isleme', bas: an(adim.baslama), bit, acik: adim.bitis === null }];
  }
  const sonuc: Aralik[] = [];
  let durum: BolumTuru | null = null;
  let bas = 0;
  let sonBitir: number | null = null;
  const kapat = (t: number) => {
    if (durum !== null && t > bas) sonuc.push({ tur: durum, bas, bit: t, acik: false });
  };
  for (const o of sirali) {
    const t = an(o.zaman);
    const yeni: BolumTuru | null = o.olay === 'ayar' ? 'hazirlik' : o.olay === 'baslat' || o.olay === 'devam' ? 'isleme'
      : o.olay === 'duraklat' ? 'duraklama' : o.olay === 'durdur' ? 'durus' : null;
    kapat(t);
    if (durum === null && sonBitir !== null && yeni !== null && t > sonBitir) sonuc.push({ tur: 'bekleme', bas: sonBitir, bit: t, acik: false });
    if (yeni !== null) sonBitir = null;
    if (o.olay === 'bitir') sonBitir = t;
    durum = yeni;
    bas = t;
  }
  if (durum === null && sonBitir !== null && adim.bitis === null && surer && simdi > sonBitir) {
    sonuc.push({ tur: 'bekleme', bas: sonBitir, bit: simdi, acik: true });
  }
  if (durum !== null) {
    const bit = adim.bitis !== null && an(adim.bitis) > bas ? an(adim.bitis) : simdi;
    if (bit > bas) sonuc.push({ tur: durum, bas, bit, acik: adim.bitis === null });
  }
  return sonuc;
}

// AKS-2: fason adım ilk gidişten son dönüşe kadar fasondadır; dönen adet gidenin altındaysa "şimdi"ye kadar sürer.
export function fasonAraligi(hareketler: readonly { yon: 'gidis' | 'donus'; zaman: string; adet: number }[], simdi: number): Aralik | null {
  const gidis = hareketler.filter((h) => h.yon === 'gidis');
  if (gidis.length === 0) return null;
  const donus = hareketler.filter((h) => h.yon === 'donus');
  const bas = enKucuk(gidis.map((h) => an(h.zaman))) ?? simdi;
  const giden = gidis.reduce((t, h) => t + h.adet, 0);
  const donen = donus.reduce((t, h) => t + h.adet, 0);
  const acik = donen < giden;
  const bit = acik ? simdi : (enBuyuk(donus.map((h) => an(h.zaman))) ?? simdi);
  return { tur: 'fason', bas, bit: Math.max(bas, bit), acik };
}

interface Giris { zaman: number; kalan: number }

// AKS-4: statüde kalış, ilk giren ilk çıkar. Statüye giriş: üretim girişi ya da statü çevirmesiyle gelen miktar. Çıkış: statüden
// çevirme, sarf ya da sevk çıkışı. Aynı statüde konum değiştirmek (teslim) ne giriş ne çıkıştır. Geri alma (sayım düzeltmesi)
// beklemiş parça değildir: en son girişten düşülür, kalış yazılmaz. Sayım farkı (sayim_fazla/eksik) hesaba girmez.
export function statuKalislari(
  hareketler: readonly AkisHareketi[], statuler: AkisGirdisi['statuler'], simdi: number,
): StatuKalisi[] {
  const kuyruk = new Map<number, Giris[]>();
  const ozet = new Map<number, { giren: number; cikan: number; kalisToplam: number; enUzun: number | null }>();
  const ozetAl = (s: number) => {
    let o = ozet.get(s);
    if (!o) { o = { giren: 0, cikan: 0, kalisToplam: 0, enUzun: null }; ozet.set(s, o); }
    return o;
  };
  const sirali = [...hareketler].sort((a, b) => an(a.zaman) - an(b.zaman) || a.id - b.id);
  for (const h of sirali) {
    const t = an(h.zaman);
    const miktar = binde(h.miktar);
    if (miktar <= 0) continue;
    const giris = (h.tur === 'giris' || h.tur === 'transfer') && h.hedefStatuId !== null && h.hedefStatuId !== h.kaynakStatuId ? h.hedefStatuId : null;
    const cikis = (h.tur === 'transfer' && h.kaynakStatuId !== null && h.kaynakStatuId !== h.hedefStatuId) || (h.tur === 'cikis' && h.kaynakStatuId !== null)
      ? h.kaynakStatuId : null;
    if (h.tur === 'geri_alma' && h.kaynakStatuId !== null) {
      const q = kuyruk.get(h.kaynakStatuId) ?? [];
      let kalan = miktar;
      for (let i = q.length - 1; i >= 0 && kalan > 0; i--) {
        const g = q[i]!;
        const al = Math.min(g.kalan, kalan);
        g.kalan -= al;
        kalan -= al;
      }
      kuyruk.set(h.kaynakStatuId, q.filter((g) => g.kalan > 0));
      ozetAl(h.kaynakStatuId).giren -= miktar - kalan;
      continue;
    }
    if (cikis !== null) {
      const q = kuyruk.get(cikis) ?? [];
      const o = ozetAl(cikis);
      let kalan = miktar;
      while (kalan > 0 && q.length > 0) {
        const g = q[0]!;
        const al = Math.min(g.kalan, kalan);
        const kalis = t - g.zaman;
        o.kalisToplam += kalis * al;
        o.cikan += al;
        o.enUzun = o.enUzun === null ? kalis : Math.max(o.enUzun, kalis);
        g.kalan -= al;
        kalan -= al;
        if (g.kalan === 0) q.shift();
      }
      kuyruk.set(cikis, q);
    }
    if (giris !== null) {
      const q = kuyruk.get(giris) ?? [];
      q.push({ zaman: t, kalan: miktar });
      kuyruk.set(giris, q);
      ozetAl(giris).giren += miktar;
    }
  }
  return [...ozet.entries()].map(([statuId, o]) => {
    const bekleyen = (kuyruk.get(statuId) ?? []).filter((g) => g.kalan > 0);
    const s = statuler.get(statuId);
    const eski = enKucuk(bekleyen.map((g) => g.zaman));
    return {
      statuId,
      ad: s?.ad ?? `Statü ${String(statuId)}`,
      tur: s?.tur ?? null,
      girenAdet: Math.max(0, o.giren) / 1000,
      cikanAdet: o.cikan / 1000,
      bekleyenAdet: bekleyen.reduce((t, g) => t + g.kalan, 0) / 1000,
      ortalamaKalisDk: o.cikan > 0 ? dk(o.kalisToplam / o.cikan) : null,
      enUzunKalisDk: o.enUzun === null ? null : dk(o.enUzun),
      enEskiBekleyenDk: eski === null ? null : dk(Math.max(0, simdi - eski)),
    };
  });
}

// AKS-5: hammadde partisi mal kabulüyle gelir (giriş zamanı partiden geriye okunur). Emirde ilk kullanılması: o partinin sarfı,
// HM türündeki statüden çevrilmesi ya da (ikisi de yoksa) ilk adımın başlaması; hangisi önceyse. Emrin kendi ürün partisi
// hammadde değildir. Mal kabulü olmayan partinin giriş zamanı bilinmez (null), uydurulmaz.
export function hammaddePartileri(g: AkisGirdisi, uretimBasladi: number | null): HammaddePartisi[] {
  const kimlikler = new Set<number>();
  for (const h of g.hareketler) {
    if (h.partiId === null || h.malzemeId === g.emir.malzemeNo) continue;
    kimlikler.add(h.partiId);
  }
  return [...kimlikler].sort((a, b) => a - b).map((partiId) => {
    const giris = g.partiGirisleri.get(partiId);
    const kullanimlar = g.hareketler
      .filter((h) => h.partiId === partiId && ((h.tur === 'cikis' && h.cikisNedeni === 'uretime_sarf')
        || (h.tur === 'transfer' && h.kaynakStatuId !== null && h.kaynakStatuId !== h.hedefStatuId && g.statuler.get(h.kaynakStatuId)?.tur === 'HM')))
      .map((h) => an(h.zaman));
    const kullanim = enKucuk([...kullanimlar, uretimBasladi]);
    const malKabul = giris?.malKabul ?? null;
    return {
      partiId,
      lotNo: giris?.lotNo ?? null,
      malKabul,
      kullanim: kullanim === null ? null : metin(kullanim),
      beklemeDk: malKabul === null || kullanim === null ? null : dk(Math.max(0, kullanim - an(malKabul))),
    };
  });
}

const olcu = (bas: number | null, bit: number | null, simdi: number, surer: boolean): Olcu => {
  if (bas === null) return { dk: null, acik: false };
  if (bit !== null) return { dk: dk(Math.max(0, bit - bas)), acik: false };
  return surer ? { dk: dk(Math.max(0, simdi - bas)), acik: true } : { dk: null, acik: false };
};
const toplam = (a: readonly Aralik[], tur: BolumTuru): number => a.filter((x) => x.tur === tur).reduce((t, x) => t + (x.bit - x.bas), 0);
const bolum = (a: Aralik): Bolum => ({ tur: a.tur, baslangic: metin(a.bas), bitis: metin(a.bit), acik: a.acik });

// AKS-6: damgalar ve ölçüler. Uçtan uca: en eski hammadde mal kabulünden sevke. Hammadde bekleme: mal kabulden üretimin
// başlamasına. Üretim akış: ilk adımın ilk olayından son adımın bitişine. Sevk bekleme: sevke hazırdan sevke. Bitmemiş ölçü
// emir sürüyorsa "şimdi"ye kadar açık gösterilir; iptal emirde açık ölçü yoktur. Akış verimi: işleme toplamı ÷ üretim akış süresi.
export function emirAkisi(g: AkisGirdisi): Omit<EmirAkisiCevabi, 'emir'> {
  const simdi = an(g.simdi);
  const surer = g.emir.durum !== 'iptal';
  const adimlar = [...g.adimlar].sort((a, b) => a.sira - b.sira || a.opNo - b.opNo);
  const araliklar = new Map<number, Aralik[]>();
  for (const a of adimlar) {
    if (a.fason) {
      const f = fasonAraligi(g.fason.filter((h) => h.isEmriId === a.id), simdi);
      araliklar.set(a.id, f === null ? [] : [f]);
    } else {
      araliklar.set(a.id, adimAraliklari(a, g.olaylar.filter((o) => o.isEmriId === a.id), simdi, surer));
    }
  }
  const ilkOlay = (id: number): number | null => enKucuk((araliklar.get(id) ?? []).filter((x) => x.tur !== 'bekleme').map((x) => x.bas));
  const uretimBasladi = enKucuk([...adimlar.map((a) => ilkOlay(a.id)), g.emir.baslama === null ? null : an(g.emir.baslama)]);
  const son = adimlar.at(-1);
  const uretimBitti = son?.bitis === null || son === undefined ? null : an(son.bitis);
  const saglamlar = (id: number) => g.sayimlar.filter((s) => s.isEmriId === id && s.tur === 'saglam');

  // Önceki adımın ilk bitişi: parça o an devredilir; adım sonradan yeniden açılsa da değişmez. Fasonda bitiş yoksa bütün adedin
  // döndüğü an.
  const ilkBitis = (o: AkisAdimi): number | null => {
    const bitir = enKucuk(g.olaylar.filter((x) => x.isEmriId === o.id && x.olay === 'bitir').map((x) => an(x.zaman)));
    if (bitir !== null) return bitir;
    if (o.bitis !== null) return an(o.bitis);
    const f = o.fason ? araliklar.get(o.id)?.[0] : undefined;
    return f !== undefined && !f.acik ? f.bit : null;
  };
  // Önceki adımdan toplam `adet` sağlam (fasonda dönen) çıktığı an; düzeltme satırları toplamdan düşer.
  const adedeUlasti = (o: AkisAdimi, adet: number): number | null => {
    const kayitlar = o.fason
      ? g.fason.filter((h) => h.isEmriId === o.id && h.yon === 'donus')
      : saglamlar(o.id);
    let toplamAdet = 0;
    for (const k of [...kayitlar].sort((x, y) => an(x.zaman) - an(y.zaman))) {
      toplamAdet += k.adet;
      if (toplamAdet >= adet) return an(k.zaman);
    }
    return null;
  };

  // AKS-3: adımın önündeki bekleme, girdisinin hazır olduğu andan adımın ilk olayına kadardır. Girdi hazır, adımın bağımlılığına
  // göre: bekleyende önceki adımın ilk bitişi; akışlıda önceki adımdan devir adedi kadar sağlam (fasonda dönen) çıktığı an, adede
  // ulaşmadan biterse ilk bitişi; bağımsızda bekleme yoktur. Devir adedi yoksa 1 sayılır. İlk adımın önündeki bekleme hammadde
  // şeridindedir. Başlamamış adımın girdisi hazırsa bekleme sürer.
  const beklemeler = new Map<number, Aralik | null>();
  adimlar.forEach((a, i) => {
    const onceki = adimlar[i - 1];
    if (onceki === undefined || a.bagimlilik === 'bagimsiz') { beklemeler.set(a.id, null); return; }
    const hazir = a.bagimlilik === 'akisli'
      ? adedeUlasti(onceki, a.devirAdedi !== null && a.devirAdedi > 0 ? a.devirAdedi : 1) ?? ilkBitis(onceki)
      : ilkBitis(onceki);
    if (hazir === null) { beklemeler.set(a.id, null); return; }
    const basla = ilkOlay(a.id);
    if (basla === null) {
      beklemeler.set(a.id, surer && simdi > hazir ? { tur: 'bekleme', bas: hazir, bit: simdi, acik: true } : null);
      return;
    }
    beklemeler.set(a.id, basla > hazir ? { tur: 'bekleme', bas: hazir, bit: basla, acik: false } : null);
  });

  const hammadde = hammaddePartileri(g, uretimBasladi);
  const malKabul = enKucuk(hammadde.map((h) => (h.malKabul === null ? null : an(h.malKabul))));
  const sevkeHazir = g.sevk?.hazir == null ? null : an(g.sevk.hazir);
  const sevk = g.sevk?.sevk == null ? null : an(g.sevk.sevk);

  const seritler: Serit[] = [];
  if (malKabul !== null) {
    const bit = uretimBasladi ?? (surer ? simdi : null);
    if (bit !== null && bit > malKabul) {
      seritler.push({ anahtar: 'hammadde', tur: 'hammadde', baslik: 'Hammadde', altBaslik: null,
        bolumler: [{ tur: 'bekleme', baslangic: metin(malKabul), bitis: metin(bit), acik: uretimBasladi === null }] });
    }
  }
  for (const a of adimlar) {
    const b = beklemeler.get(a.id);
    const liste = [...(b ? [b] : []), ...(araliklar.get(a.id) ?? [])];
    seritler.push({ anahtar: `adim-${String(a.id)}`, tur: 'adim', baslik: `OP${String(a.opNo)}`, altBaslik: a.fason ? 'Fason' : a.istasyon,
      bolumler: liste.map(bolum) });
  }
  const sevkBolumleri: Bolum[] = [];
  if (uretimBitti !== null && sevkeHazir !== null && sevkeHazir > uretimBitti) {
    sevkBolumleri.push({ tur: 'bekleme', baslangic: metin(uretimBitti), bitis: metin(sevkeHazir), acik: false });
  }
  if (sevkeHazir !== null) {
    const bit = sevk ?? (surer ? simdi : null);
    if (bit !== null && bit > sevkeHazir) sevkBolumleri.push({ tur: 'sevk', baslangic: metin(sevkeHazir), bitis: metin(bit), acik: sevk === null });
  }
  if (sevkBolumleri.length > 0) seritler.push({ anahtar: 'sevk', tur: 'sevk', baslik: 'Sevk', altBaslik: null, bolumler: sevkBolumleri });

  const adimOlculeri: AdimOlcusu[] = adimlar.map((a) => {
    const ar = araliklar.get(a.id) ?? [];
    const basladi = ar.length > 0;
    const isleme = toplam(ar, 'isleme');
    const saglam = saglamlar(a.id).reduce((t, s) => t + s.adet, 0);
    const b = beklemeler.get(a.id);
    const yenidenAcilma = toplam(ar, 'bekleme');
    return {
      isEmriId: a.id,
      opNo: a.opNo,
      istasyon: a.istasyon,
      fason: a.fason,
      beklemeDk: b || yenidenAcilma > 0 ? dk((b ? b.bit - b.bas : 0) + yenidenAcilma) : null,
      hazirlikDk: basladi && !a.fason ? dk(toplam(ar, 'hazirlik')) : null,
      islemeDk: basladi && !a.fason ? dk(isleme) : null,
      duraklamaDk: basladi && !a.fason ? dk(toplam(ar, 'duraklama')) : null,
      durusDk: basladi && !a.fason ? dk(toplam(ar, 'durus')) : null,
      fasonDk: a.fason && basladi ? dk(toplam(ar, 'fason')) : null,
      saglamAdet: Math.max(0, saglam),
      cevrimBirimDk: !a.fason && saglam > 0 ? dk(isleme / saglam) : null,
      standartBirimDk: a.birimSureDk,
      standartHazirlikDk: a.ayarSuresiDk,
      terminGun: a.terminGun,
    };
  });
  const islemeToplam = adimOlculeri.some((a) => a.islemeDk !== null)
    ? adimlar.reduce((t, a) => t + (a.fason ? 0 : toplam(araliklar.get(a.id) ?? [], 'isleme')), 0) : null;
  const uretimAkis = olcu(uretimBasladi, uretimBitti, simdi, surer);
  const akisMs = uretimBasladi === null ? null : (uretimBitti ?? simdi) - uretimBasladi;

  return {
    simdi: metin(simdi),
    damgalar: {
      malKabul: malKabul === null ? null : metin(malKabul),
      uretimBasladi: uretimBasladi === null ? null : metin(uretimBasladi),
      uretimBitti: uretimBitti === null ? null : metin(uretimBitti),
      sevkeHazir: sevkeHazir === null ? null : metin(sevkeHazir),
      sevk: sevk === null ? null : metin(sevk),
    },
    olculer: {
      uctanUca: olcu(malKabul, sevk, simdi, surer),
      hammaddeBekleme: olcu(malKabul, uretimBasladi, simdi, surer),
      uretimAkis,
      sevkBekleme: olcu(sevkeHazir, sevk, simdi, surer),
      islemeToplamDk: islemeToplam === null ? null : dk(islemeToplam),
      akisVerimi: islemeToplam === null || akisMs === null || akisMs <= 0 ? null : Math.min(1, Math.round(islemeToplam / akisMs * 1000) / 1000),
    },
    seritler,
    adimlar: adimOlculeri,
    statuler: statuKalislari(g.hareketler, g.statuler, simdi),
    hammadde,
  };
}

export interface SevkKaydi {
  hazirZamani: string;
  kaldirildi: string | null;
  isDurumu: 'havuzda' | 'planlandi' | 'yolda' | 'tamamlandi' | null;
  isDurumZamani: string | null;
  isIptalEdildi: boolean;
}

// AKS-7: sevke hazır anı bekleme listesine düştüğü andır. Sevk anı, sevkiyat işinin tamamlandığı andır; işe çevrilmeden
// listeden kaldırılan (müşteri kendisi aldı) kaydın kaldırıldığı an da sevk sayılır. Yolda olan ve iptal edilen iş sevk değildir.
export function sevkAni(k: SevkKaydi | null): { hazir: string | null; sevk: string | null } | null {
  if (k === null) return null;
  const sevk = k.isDurumu === 'tamamlandi' && !k.isIptalEdildi ? k.isDurumZamani : k.kaldirildi;
  return { hazir: k.hazirZamani, sevk };
}

export interface KartAniGirdisi {
  acilis: string;
  hammadde: readonly HammaddePartisi[];
  teslimler: readonly {
    durum: 'yolda' | 'teslim' | 'red' | 'iptal'; gonderim: string; kapanis: string | null; miktar: string; alinan: string | null; kaynak: string; hedef: string;
    gonderen?: string | null; kapatan?: string | null;
  }[];
  adimlar: readonly { id: number; opNo: number; istasyon: string | null; fason: boolean }[];
  olaylar: readonly AkisOlayi[];
  sayimlar: readonly AkisSayimi[];
  fason: readonly { isEmriId: number; yon: 'gidis' | 'donus'; zaman: string; adet: number }[];
  sevk: { hazir: string | null; sevk: string | null } | null;
  // Kişi, duruş nedeni ve hurda nedeni adları; haritada olmayan null yazılır.
  adlar?: { kisi: ReadonlyMap<number, string>; durus: ReadonlyMap<number, string>; hurda: ReadonlyMap<number, string> };
}

// AKS-8 (kart #708): kartın anları zamana göre tek dizidir; aynı anda olanlar akış sırasıyla (kabul, açılış, teslim, adım, sevk)
// dizilir. Teslim gönderimi ve kapanışı ayrı andır; iptal teslimin kapanışı an değildir. Sayım kaydındaki adetle yazılır (düzeltme
// kendi işaretini taşır). Adımı bilinmeyen olay ve sayım yine an olur (adımsız).
export function kartAnlari(g: KartAniGirdisi): KartAni[] {
  const adim = new Map(g.adimlar.map((a) => [a.id, a]));
  const adimli = (isEmriId: number | null) => {
    const a = isEmriId === null ? undefined : adim.get(isEmriId);
    return { isEmriId: a === undefined ? null : a.id, opNo: a?.opNo ?? null, yer: a === undefined ? null : a.fason ? 'Fason' : a.istasyon };
  };
  const bos = { isEmriId: null, opNo: null, kim: null, neden: null };
  const ad = (harita: 'kisi' | 'durus' | 'hurda', id: number | null | undefined): string | null =>
    (id == null ? null : g.adlar?.[harita].get(id) ?? null);
  const anlar: (KartAni & { sira: number })[] = [];
  for (const h of g.hammadde) if (h.malKabul !== null) anlar.push({ zaman: h.malKabul, tur: 'mal_kabul', ...bos, yer: h.lotNo, miktar: null, sira: 0 });
  anlar.push({ zaman: g.acilis, tur: 'kart_acildi', ...bos, yer: null, miktar: null, sira: 1 });
  for (const t of g.teslimler) {
    const yer = `${t.kaynak} → ${t.hedef}`;
    anlar.push({ zaman: t.gonderim, tur: 'teslim_gonderildi', ...bos, yer, miktar: t.miktar, kim: t.gonderen ?? null, sira: 2 });
    if (t.kapanis !== null && t.durum === 'teslim') anlar.push({ zaman: t.kapanis, tur: 'teslim_alindi', ...bos, yer, miktar: t.alinan, kim: t.kapatan ?? null, sira: 2 });
    if (t.kapanis !== null && t.durum === 'red') anlar.push({ zaman: t.kapanis, tur: 'teslim_reddedildi', ...bos, yer, miktar: t.miktar, kim: t.kapatan ?? null, sira: 2 });
  }
  for (const o of g.olaylar) {
    anlar.push({ zaman: o.zaman, tur: o.olay, ...adimli(o.isEmriId), miktar: null, kim: ad('kisi', o.kisiId), neden: ad('durus', o.durusNedeniId), sira: 3 });
  }
  for (const s of g.sayimlar) {
    anlar.push({ zaman: s.zaman, tur: s.tur, ...adimli(s.isEmriId), miktar: String(s.adet), kim: ad('kisi', s.kisiId), neden: ad('hurda', s.hurdaNedeniId), sira: 3 });
  }
  for (const f of g.fason) {
    anlar.push({ zaman: f.zaman, tur: f.yon === 'gidis' ? 'fason_gidis' : 'fason_donus', ...adimli(f.isEmriId), miktar: String(f.adet), kim: null, neden: null, sira: 3 });
  }
  if (g.sevk?.hazir != null) anlar.push({ zaman: g.sevk.hazir, tur: 'sevke_hazir', ...bos, yer: null, miktar: null, sira: 4 });
  if (g.sevk?.sevk != null) anlar.push({ zaman: g.sevk.sevk, tur: 'sevk', ...bos, yer: null, miktar: null, sira: 4 });
  return anlar
    .map((x, i) => ({ x, i }))
    .sort((a, b) => an(a.x.zaman) - an(b.x.zaman) || a.x.sira - b.x.sira || a.i - b.i)
    .map(({ x: { sira: _sira, ...k } }) => k);
}

// AKS-9 (kart #708): kartın bir adımdaki penceresi, kartın süre özeti için. Kartın o adımdaki ilk sayımından önce başka bir
// sayım (başka kartın ya da kartsız) varsa pencere o sayımın anında, yoksa adımın başlamasında açılır; kartın son sayımından
// sonra başka sayım varsa kartın son sayımında, yoksa adımın bitişinde (sürüyorsa null: şimdi) kapanır. Hazırlık kartın
// sayılır yalnız pencere adımın başlamasında açılıyorsa. Kartın o adımda sayımı yoksa pencere adımın tamamıdır.
export function kartPenceresi(
  adim: { baslama: string | null; bitis: string | null },
  sayimlar: readonly { zaman: string; kartin: boolean }[],
): { baslama: string | null; bitis: string | null; hazirlikKartin: boolean } {
  const kartin = sayimlar.filter((s) => s.kartin).map((s) => an(s.zaman));
  if (adim.baslama === null || kartin.length === 0) return { baslama: adim.baslama, bitis: adim.bitis, hazirlikKartin: true };
  const ilk = Math.min(...kartin);
  const son = Math.max(...kartin);
  const digerleri = sayimlar.filter((s) => !s.kartin).map((s) => an(s.zaman));
  const once = enBuyuk(digerleri.filter((t) => t < ilk));
  const sonra = digerleri.some((t) => t > son);
  const bas = once !== null && once > an(adim.baslama) ? once : null;
  return {
    baslama: bas === null ? adim.baslama : metin(bas),
    bitis: sonra ? metin(son) : adim.bitis,
    hazirlikKartin: bas === null,
  };
}

// AKS-10 (kart #708): kartın yeri son anından okunur; sayım anı yeri değiştirmez. Kabul ve açılış depoda, teslim gönderimi
// yolda; teslim alındı, reddedildi, adım bitti ve fasondan dönüş bekliyor; ayar ayarda, başlat ve devam üretimde, duraklat
// duraklatıldı, durdur durdu, fason gidişi fasonda; sevke hazır ve sevk kendi adıyla. Açık olmayan kart kapandıdır. Rotada adım
// bittiyse geçti, kartın o adımda anı varsa şimdi, yoksa sıradadır; hurda kartın o adımdaki hurda anlarının toplamıdır. Lead karta yüklemeden sevke; sevk yoksa kapalı kartta son
// ana, açık kartta şimdiye kadar (açık).
export function kartKonumu(
  kart: { durum: string; acilis: string },
  anlar: readonly KartAni[],
  adimlar: readonly {
    id: number; opNo: number; baslama: string | null; bitis: string | null; plan?: KartRotasi[number]['plan']; taban?: KartRotasi[number]['taban'];
  }[],
  simdi: string,
): { konum: KartKonumu; rota: KartRotasi; lead: Olcu; sonAn: KartAni | null } {
  const yerAnlari = anlar.filter((a) => a.tur !== 'saglam' && a.tur !== 'hurda');
  const son = yerAnlari.at(-1) ?? null;
  const sonAn = anlar.at(-1) ?? null;
  const durumu: Record<KartAni['tur'], KartKonumu['durum']> = {
    mal_kabul: 'depoda', kart_acildi: 'depoda', teslim_gonderildi: 'yolda', teslim_alindi: 'bekliyor', teslim_reddedildi: 'bekliyor',
    ayar: 'ayarda', baslat: 'uretimde', devam: 'uretimde', duraklat: 'duraklatildi', durdur: 'durdu', bitir: 'bekliyor',
    saglam: 'uretimde', hurda: 'uretimde', fason_gidis: 'fasonda', fason_donus: 'bekliyor', sevke_hazir: 'sevke_hazir', sevk: 'sevk_edildi',
  };
  const kapali = kart.durum !== 'acik';
  const konum: KartKonumu = {
    durum: kapali ? 'kapandi' : son === null ? 'depoda' : durumu[son.tur],
    isEmriId: son?.isEmriId ?? null,
    opNo: son?.opNo ?? null,
    yer: son?.yer ?? null,
    beri: son?.zaman ?? kart.acilis,
  };
  const anliAdimlar = new Set(anlar.map((a) => a.isEmriId).filter((x): x is number => x !== null));
  const rota: KartRotasi = adimlar.map((a) => ({
    isEmriId: a.id, opNo: a.opNo, durum: a.bitis !== null ? 'gecti' : anliAdimlar.has(a.id) ? 'simdi' : 'sirada',
    baslama: a.baslama, bitis: a.bitis, plan: a.plan ?? null, taban: a.taban ?? null,
    hurdaAdet: Math.max(0, anlar.filter((x) => x.isEmriId === a.id && x.tur === 'hurda').reduce((t, x) => t + Number(x.miktar ?? 0), 0)),
  }));
  const sevk = anlar.find((a) => a.tur === 'sevk')?.zaman ?? null;
  const bitis = sevk ?? (kapali ? sonAn?.zaman ?? kart.acilis : null);
  const lead = olcu(an(kart.acilis), bitis === null ? null : an(bitis), an(simdi), !kapali);
  return { konum, rota, lead, sonAn };
}

// Kartın lotundan üretime sarf edilen miktar (binde bir hassas, numeric metin); sarf yoksa null.
export function kartSarfi(hareketler: readonly AkisHareketi[], partiId: number | null): string | null {
  if (partiId === null) return null;
  const sarflar = hareketler.filter((h) => h.partiId === partiId && h.tur === 'cikis' && h.cikisNedeni === 'uretime_sarf');
  if (sarflar.length === 0) return null;
  return (sarflar.reduce((t, h) => t + binde(h.miktar), 0) / 1000).toFixed(3);
}
