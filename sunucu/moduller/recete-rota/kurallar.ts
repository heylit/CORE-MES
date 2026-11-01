import type { IsMerkezi, Istasyon, Makine, MakineDurumuDegeri, OperasyonTipi } from '#paylasilan/sozlesme/istasyonlar.ts';
import { OPERASYON_GRUP_ADLARI } from '#paylasilan/sozlesme/istasyonlar.ts';
import { aramaSade } from '#paylasilan/kayit-aramasi.ts';
import type { KatalogMalzemeOzeti } from '#paylasilan/sozlesme/malzemeler.ts';
import type { DurumEmirleri, DurumMalzemesi, DurumRotaAdimi as DurumRotaAdimiCikti, DurumRotaRevizyonu, DurumMaliyeti } from '#paylasilan/sozlesme/recete-rota.ts';
import type { DurumCevabi } from '#paylasilan/sozlesme/planlama.ts';
import { girdiOlabilirMi } from '../rota/disari.ts';
import type { DurumRotaAdimi, DurumRotaRevizyonu as DurumRotaRevizyonuGirdisi } from '../rota/disari.ts';
import type { Hareket } from '#paylasilan/sozlesme/stok.ts';
import type { Vardiya } from '#paylasilan/sozlesme/vardiya.ts';

// Reçete ve Rota kayıt deposunun saf kuralları.

// Yazma yalnız kayıt istemcinin bildiği sürümdeyse olur; null "kayıt hiç yok" demektir. Ortak kayıtta başkasının yazdığının
// üstüne yazılmaz.
export function surumUyarMi(mevcut: number | null, beklenen: number | null): boolean {
  return mevcut === beklenen;
}

// Metin biçimli değer dizedir; json biçiminde her JSON değeri geçer.
export function degerBicimeUyarMi(bicim: 'json' | 'metin', deger: unknown): boolean {
  return bicim === 'json' || typeof deger === 'string';
}

// Elle sıra, dondurma ve elle makine ataması canlı planındır (plan tabloları; plan-ekran-verisi-yeri.md 5.2): ana kayıt yazılırken ekranın
// gönderdiği `qorder`, `frozen`, `frozenAt` ve atamanın makinesi (`assign[iş].resId`) yazılmaz, kayıttaki eski hâl olduğu gibi kalır
// (silinmez). Eski kayıtta yoksa yeni kayıtta da olmaz. Atamanın kişisi (`personId`) kayıtta kalır, gönderilen yazılır.
const PLAN_ALANLARI = ['qorder', 'frozen', 'frozenAt'] as const;
export function planAlanlariniKoru(yeni: unknown, eski: unknown): unknown {
  const y = nesne(yeni);
  if (y === null) return yeni;
  const e = nesne(eski);
  const sonuc: Record<string, unknown> = { ...y };
  for (const k of PLAN_ALANLARI) {
    if (e !== null && Object.prototype.hasOwnProperty.call(e, k)) sonuc[k] = e[k];
    else delete sonuc[k];
  }
  const yeniAtama = nesne(y['assign']), eskiAtama = nesne(e?.['assign']);
  if (yeniAtama !== null || eskiAtama !== null) {
    const atama: Record<string, unknown> = {};
    for (const is of new Set([...Object.keys(yeniAtama ?? {}), ...Object.keys(eskiAtama ?? {})])) {
      const { resId: _gonderilen, ...geri } = nesne(yeniAtama?.[is]) ?? {};
      const eskiMakine = nesne(eskiAtama?.[is])?.['resId'];
      const satir = eskiMakine === undefined ? geri : { ...geri, resId: eskiMakine };
      if (Object.keys(satir).length > 0) atama[is] = satir;
    }
    sonuc['assign'] = atama;
  }
  return sonuc;
}

// Sahibinden okunan ve ekranın açılışta olduğu gibi değiştirdiği dilimler ana kayda yazılmaz; kayıttaki kopya bayatlar (309 b): iş merkezi,
// istasyon, makine, kişi, emir listesi, takvimin vardiya ve tatilleri, plan ayarının plan modülündeki beş alanı. Öteki dilimler kopya değildir,
// olduğu gibi kalır: malzemede kartsız kalem ve kalemin yerel alanları, rotada ve revizyonda adımın çıktı kartı, çıkan ve giren statüsü
// (ekran yeniden açılışta bunları yalnız kayıttan okur), henüz rota modülüne gitmemiş yerel revizyon, plan ayarının yerel alanları.
export const BAGLI_DILIMLER = ['wcs', 'stations', 'machines', 'people', 'emirler'] as const;
export const BAGLI_ALANLAR = { cal: ['shifts', 'holidays'], settings: ['rule', 'dir', 'buffer', 'freezeDays', 'peopleLimit'] } as const;
export function bagliDilimleriAyikla(deger: unknown): unknown {
  const d = nesne(deger);
  if (d === null) return deger;
  const sonuc: Record<string, unknown> = { ...d };
  for (const k of BAGLI_DILIMLER) delete sonuc[k];
  for (const [dilim, alanlar] of Object.entries(BAGLI_ALANLAR)) {
    const ic = nesne(d[dilim]);
    if (ic === null) continue;
    const kalan: Record<string, unknown> = { ...ic };
    for (const a of alanlar) delete kalan[a];
    if (Object.keys(kalan).length === 0) delete sonuc[dilim];
    else sonuc[dilim] = kalan;
  }
  return sonuc;
}

// PostgreSQL jsonb dizede U+0000 kabul etmez; bu değer sunucu hatası yerine doğrulama hatasıyla döner.
export function nulKarakteriVarMi(deger: unknown): boolean {
  return JSON.stringify(deger).includes('\\u0000');
}

// Değerin JSON metni UTF-8 bayt olarak bu sınırı aşamaz: köprü de 1 MB üstünü göndermez; uca doğrudan gelen büyük değer
// tabloyu şişirmesin (sızma testi B3).
export const DEGER_AZAMI_BAYT = 1_000_000;
export function degerCokBuyukMu(deger: unknown): boolean {
  return new TextEncoder().encode(JSON.stringify(deger)).length > DEGER_AZAMI_BAYT;
}

// ----- Bağlı durum çevirisi (kart #1104): sahibi modüllerin kayıtları prototipin `st` biçimine. Saf; veritabanı ve saat yok. -----

const KATALOG_TURU_PROTOTIP: Readonly<Record<KatalogMalzemeOzeti['tur'], DurumMalzemesi['type']>> = {
  hammadde: 'ham', yarimamul: 'yari', mamul: 'mamul', sarf: 'sarf', demirbas: 'demirbas', hizmet: 'hizmet',
  // Prototipte ticari mal türü yok; satın alınan kalem gibi görünür, reçetede girdi olmaması girdiOlabilir ile söylenir (kart #1218).
  ticari_mal: 'ham',
};

// numeric metin -> sayı; metin yoksa ya da sayı değilse null (sıfır uydurulmaz).
export function metindenSayi(metin: string | null | undefined): number | null {
  if (metin === null || metin === undefined || metin.trim() === '') return null;
  const sayi = Number(metin);
  return Number.isFinite(sayi) ? sayi : null;
}

export function malzemeCevir(
  ozet: KatalogMalzemeOzeti,
  stok: { serbest: string; kritikSeviye: string | null } | undefined,
): DurumMalzemesi {
  return {
    id: String(ozet.id),
    kayitNo: ozet.id,
    code: ozet.kod,
    name: ozet.ad ?? ozet.kod,
    type: KATALOG_TURU_PROTOTIP[ozet.tur],
    unit: ozet.birim,
    cost: null,
    stock: metindenSayi(stok?.serbest),
    min: metindenSayi(stok?.kritikSeviye),
    aktif: ozet.onayDurumu === 'aktif',
    kategori: ozet.kategori,
    kategoriAdi: ozet.kategoriAdi,
    girdiOlabilir: girdiOlabilirMi(ozet.tur),
  };
}

export function operasyonCevir(t: OperasyonTipi): NonNullable<DurumCevabi['opdefs']>[number] {
  return {
    id: String(t.id),
    code: t.kod,
    abbr: t.kisaltma,
    name: t.ad,
    group: t.grup,
    groupName: OPERASYON_GRUP_ADLARI[t.grup],
    stationId: t.varsayilanIstasyonId === null ? null : String(t.varsayilanIstasyonId),
    setup: metindenSayi(t.varsayilanAyarDk),
    cycle: metindenSayi(t.varsayilanBirimDk),
    aktif: t.aktif,
  };
}

export function isMerkeziCevir(m: IsMerkezi): NonNullable<DurumCevabi['wcs']>[number] {
  return { id: String(m.id), code: m.kod, name: m.ad, week: null, aktif: m.aktif };
}

// Plan ayarı satırı olmayan istasyon sahibinin kuralıyla verim %100, operatör 1 sayılır (istasyonlar/disari.ts planAyarlari).
export function istasyonCevir(
  i: Istasyon,
  ayar: { verimYuzde: string; operatorIhtiyaci: string } | undefined,
  aktifMakineSayisi: number,
): NonNullable<DurumCevabi['stations']>[number] {
  return {
    id: String(i.id),
    code: i.kod,
    name: i.ad,
    wcId: String(i.isMerkeziId),
    eff: ayar === undefined ? 100 : metindenSayi(ayar.verimYuzde),
    opPer: ayar === undefined ? 1 : metindenSayi(ayar.operatorIhtiyaci),
    count: aktifMakineSayisi,
    cost: null,
    aktif: i.aktif,
  };
}

const MAKINE_DURUMU_PROTOTIP = { calisir: 'aktif', bakim: 'bakim', ariza: 'ariza' } as const;

// Durum satırı olmayan makine çalışır sayılır (istasyonlar/disari.ts makineDurumlari).
export function makineCevir(m: Makine, durum: MakineDurumuDegeri | undefined): NonNullable<DurumCevabi['machines']>[number] {
  return {
    id: String(m.id),
    code: m.kod,
    name: m.ad,
    stationId: m.istasyonId === null ? null : String(m.istasyonId),
    status: MAKINE_DURUMU_PROTOTIP[durum ?? 'calisir'],
    aktif: m.aktif,
  };
}

// Kişinin istasyonu: ataması varsa en büyük yüzdeli atama, yoksa yetkin olduğu ilk aktif istasyon; iş merkezi o istasyonunkidir.
export function kisiCevir(
  kisi: { id: number; ad: string; sicilNo: string | null },
  istasyonId: number | undefined,
  istasyonIsMerkezi: ReadonlyMap<number, number>,
  yetkinlikler: readonly number[],
  makine: { makineler: readonly number[]; enCok: number | null } = { makineler: [], enCok: null },
): NonNullable<DurumCevabi['people']>[number] {
  const istasyon = istasyonId !== undefined && istasyonIsMerkezi.has(istasyonId) ? istasyonId : yetkinlikler.find((y) => istasyonIsMerkezi.has(y));
  const merkez = istasyon === undefined ? undefined : istasyonIsMerkezi.get(istasyon);
  return {
    id: String(kisi.id),
    name: kisi.ad,
    code: kisi.sicilNo,
    role: null,
    stationId: istasyon === undefined ? null : String(istasyon),
    stationAtama: istasyon !== undefined && istasyon === istasyonId,
    wcId: merkez === undefined ? null : String(merkez),
    shiftId: null,
    skills: yetkinlikler.map(String),
    cost: null,
    active: true,
    machines: makine.makineler.map(String),
    maxMachines: makine.enCok,
  };
}

export function vardiyaCevir(v: Vardiya): DurumCevabi['cal']['shifts'][number] {
  return {
    id: String(v.id),
    name: v.ad,
    start: v.baslangic,
    end: v.bitis,
    breaks: v.molalar.map((m) => ({ start: m.baslangic, end: m.bitis })),
    netDakika: v.netDakika,
  };
}

// ----- Emir dilimi (kart #1185): uretim-emirleri kayıtları prototipin `st.orders`, `opStatus` ve `opProg` biçimine. -----

// Sahibinin `EmirDilimiSatiri` biçimi (uretim-emirleri/disari.ts); kurallar başka modülü ithal etmediği için yapısal olarak tanımlıdır.
export interface EmirKaydi {
  id: number;
  emirNo: string;
  malzemeNo: number;
  adet: number;
  baslangic: string | null;
  teslim: string | null;
  oncelik: number;
  aciklama: string | null;
  kaynakRotaRevizyonId: number | null;
  durum: 'taslak' | 'planli' | 'basladi' | 'bitti' | 'iptal';
  emirTuru: string;
  acilma: string;
  bitis: string | null;
  ustEmirId: number | null;
  bolunmeSira: number | null;
  birlestigiEmirId: number | null;
  birlesmeOpNo: number | null;
  surum: number;
  // Adım alanları rotasız emrin adımlarını göstermek içindir (uretim-emirleri B13).
  isEmirleri: readonly {
    sira: number; opNo: number; durum: 'bekliyor' | 'calisiyor' | 'tamam'; saglamAdet: number | null; canliAdet: number | null;
    ad: string; operasyonTipiId: number; istasyonId: number | null; ayarSuresiDk: string | null; birimSureDk: string | null;
    // Emirdeki üretim yeri (UE-URY): kaynak fason ise adım dışarıda yapılır; termin yalnız fasonda dolu.
    kaynak?: { tur: string; id: number } | null; terminGun?: number | null;
    // Rotadan gelen adım 'rota'dır; kola konan rework, tamir ya da ek adım türünü taşır. Verilmezse rota adımı sayılır.
    tur?: 'rota' | 'rework' | 'tamir' | 'ek';
    // 1476-D: çok katmanlı emirde adımın düğümü (kök "0"), düğüm ürününün rotasındaki op numarası ve kök başına adedi; emir içindeki
    // öncüller (op_no). Tek katmanlı emirde düğüm yoktur.
    dugum?: { ad: string; malzemeNo: number; kaynakOpNo: number; birimCarpani?: string } | null;
    onculler?: readonly { opNo: number }[] | null;
  }[];
}

// 697: durum anahtarındaki sıra (`emir|root|sıra`) adımın rotadaki yeridir; okuyanlar (sayfa, motor girdisi, değerlendirme) öyle eşler. Ek adım
// rotada yoktur ama iş emri sırası alır: rota adımının yeri, sırasından önündeki ek adımların sayısı düşülerek bulunur. Ek adımın yeri yoktur.
// Rotasız emrin (revizyonsuz) bütün adımları kendi adımlarıdır (adim-ekle 'ek' yazar); orada sıra adımın yeridir (rotasizAdimlariCevir).
const ekAdimMi = (i: EmirKaydi['isEmirleri'][number]): boolean => (i.tur ?? 'rota') !== 'rota';
const kokAdimiMi = (i: EmirKaydi['isEmirleri'][number]): boolean => i.dugum == null || i.dugum.ad === '0';
// 701: kolun iş emri sırası 1'den başlar, ilk adımı ise rotanın n+1. adımıdır (n: ayrıldığı yer, kolCevir); kolun yeri n kadar kayar.
// 1476-D: çok katmanlı emirde alt düğüm adımları kökten önce sıralanır ve kökün rotasında yer almaz; kök adımın yeri yalnız kökün rota
// adımları arasındaki sırasıdır. Alt düğüm adımı kendi düğümüyle gider (dugumleriCevir).
function rotaYeri(e: EmirKaydi, sira: number, kolKaymasi = 0): number | null {
  if (e.kaynakRotaRevizyonId === null) return sira;
  const i = e.isEmirleri.find((x) => x.sira === sira);
  if (i !== undefined && (ekAdimMi(i) || !kokAdimiMi(i))) return null;
  if (e.isEmirleri.some((x) => !kokAdimiMi(x))) {
    return kolKaymasi + e.isEmirleri.filter((x) => x.sira <= sira && kokAdimiMi(x) && !ekAdimMi(x)).length;
  }
  return kolKaymasi + sira - e.isEmirleri.filter((x) => x.sira < sira && ekAdimMi(x)).length;
}

// 1476-D: çok katmanlı emrin alt düğümleri motorun montaj bağına (plan motor/girdi.betik): her düğüm kendi ürününün rotasıyla ayrı iş olur,
// çıktısını tüketen üst adımı bekletir. Tüketen adım üst düğümde, öncülleri arasında bu düğümün bir adımı bulunan ilk adımdır (emrin kendi
// kaydı; emir açılırken patlatmadan kurulur). carpan kök başına, birim üst düğüm başına adettir; okunamayan çarpan null (uydurulmaz).
// 1559 a: emirde fasona alınan bitmemiş düğüm adımı firmasını ve termin gününü taşır (kökte opYer'in işi); motor onu fason adım gibi kurar.
export function dugumleriCevir(e: EmirKaydi): NonNullable<DurumEmirleri['orders'][number]['dugumler']> | undefined {
  const gruplar = new Map<string, EmirKaydi['isEmirleri'][number][]>();
  for (const i of [...e.isEmirleri].sort((a, b) => a.sira - b.sira)) {
    if (i.dugum == null || i.dugum.ad === '0' || ekAdimMi(i)) continue;
    gruplar.set(i.dugum.ad, [...(gruplar.get(i.dugum.ad) ?? []), i]);
  }
  if (gruplar.size === 0) return undefined;
  const carpan = (d: string): number | null => {
    if (d === '0') return 1;
    const n = Number(gruplar.get(d)?.[0]?.dugum?.birimCarpani);
    return Number.isFinite(n) && n > 0 ? n : null;
  };
  const kok = [...e.isEmirleri].filter((i) => kokAdimiMi(i)).sort((a, b) => a.sira - b.sira);
  return [...gruplar].map(([d, adimlar]) => {
    const ust = d.slice(0, d.lastIndexOf('.'));
    const kendi = new Set(adimlar.map((a) => a.opNo));
    const tuketen = (ust === '0' ? kok : gruplar.get(ust) ?? []).find((a) => (a.onculler ?? []).some((o) => kendi.has(o.opNo)));
    const c = carpan(d), uc = carpan(ust);
    return {
      dugum: d, itemId: String(adimlar[0]!.dugum!.malzemeNo), carpan: c, birim: c === null || uc === null ? null : c / uc, ust,
      ustOpNo: tuketen === undefined ? null : tuketen.dugum?.kaynakOpNo ?? tuketen.opNo,
      adimlar: adimlar.map((a) => ({
        opNo: a.opNo, kaynakOpNo: a.dugum!.kaynakOpNo, durum: a.durum,
        ...(a.durum !== 'tamam' && a.kaynak?.tur === 'fason' ? { fasonId: String(a.kaynak.id), terminGun: a.terminGun ?? null } : {}),
      })),
    };
  });
}
function kolAyrilmaYeri(e: EmirKaydi, ana: EmirKaydi): number {
  // Bölünme sırası ana emrin sırasıdır; önündeki ek adımlar rotada yer tutmaz.
  const b = e.bolunmeSira ?? 1;
  return ana.kaynakRotaRevizyonId === null ? b - 1 : b - 1 - ana.isEmirleri.filter((x) => x.sira < b && ekAdimMi(x)).length;
}

const EMIR_DURUMU_PROTOTIP = { taslak: 'taslak', planli: 'serbest', basladi: 'uretimde', bitti: 'tamam', iptal: 'iptal' } as const;

// Alt emir ana emrin hangi adımından ayrılıp hangisinde katılır: ayrılma adımı bölünme sırasından, katılma adımı ana emrin o op numaralı iş emrinin
// sırasından gelir. Bölünme sırası 1 olan ve katılmayan alt emir tam rotalı partidir (kol değildir). Katılmayan ve ortadan ayrılan kol
// ana emrin sonuna kadar yürür (VARSAYIM: katılma adımı = adım sayısı + 1).
export function kolCevir(e: EmirKaydi, ana: EmirKaydi | undefined): DurumEmirleri['orders'][number]['kol'] {
  if (ana === undefined || e.ustEmirId === null) return null;
  const n = kolAyrilmaYeri(e, ana);
  if (e.birlesmeOpNo !== null) {
    const katilma = ana.isEmirleri.find((i) => i.opNo === e.birlesmeOpNo);
    const m = katilma === undefined ? null : rotaYeri(ana, katilma.sira);
    return m === null ? null : { n, m };
  }
  return n > 0 ? { n, m: (ana.kaynakRotaRevizyonId === null ? ana.isEmirleri : ana.isEmirleri.filter((i) => !ekAdimMi(i))).length + 1 } : null;
}

// Rotasız emrin iş emri -> prototipin adım satırı. Süre numeric metnidir; okunamayan süre bilinmiyordur (null), sıfır uydurulmaz.
export interface RotasizIsEmri {
  sira: number; opNo: number; ad: string; operasyonTipiId: number | null; istasyonId: number | null; ayarSuresiDk: string | null; birimSureDk: string | null;
  durum: 'bekliyor' | 'calisiyor' | 'tamam';
}
export function rotasizAdimlariCevir(isEmirleri: readonly RotasizIsEmri[]): NonNullable<DurumEmirleri['orders'][number]['adimlar']> {
  return [...isEmirleri].sort((a, b) => a.sira - b.sira).map((i) => ({
    seq: i.sira, opNo: i.opNo, ad: i.ad, opId: i.operasyonTipiId === null ? null : String(i.operasyonTipiId), stationId: i.istasyonId === null ? null : String(i.istasyonId),
    setup: metindenSayi(i.ayarSuresiDk), cycle: metindenSayi(i.birimSureDk), durum: i.durum,
  }));
}


// Sahibinin açık adım satırı (uretim-emirleri planlanacakIsEmirleri): adimAdedi önceki biten adımın hurdası düşülmüş adettir (tek kaynak).
export interface AcikAdimKaydi { emirNo: string; opNo: number; adet: number; adimAdedi?: number }

export function adimAdetleriCevir(adimlar: readonly AcikAdimKaydi[]): NonNullable<DurumCevabi['adimAdetleri']> {
  const y: NonNullable<DurumCevabi['adimAdetleri']> = {};
  for (const a of adimlar) if (a.adimAdedi !== undefined && a.adimAdedi !== a.adet) y[`${a.emirNo}|${String(a.opNo)}`] = a.adimAdedi;
  return y;
}

// kapanislar: sahibinin (uretim-emirleri) onaylı kapanış sonucu; haritada olmayan bitmiş emir onay bekliyordur (null).
export function emirleriCevir(emirler: readonly EmirKaydi[], kapanislar: ReadonlyMap<number, 'tamamlandi' | 'saglamsiz' | null> = new Map()): DurumEmirleri {
  const kimlige = new Map(emirler.map((e) => [e.id, e]));
  const opStatus: DurumEmirleri['opStatus'] = {};
  const opProg: DurumEmirleri['opProg'] = {};
  const opYer: NonNullable<DurumEmirleri['opYer']> = {};
  const orders = emirler.map((e): DurumEmirleri['orders'][number] => {
    // Sayfa kolu kol (n, m) geçerliyse rotanın n+1. adımından kurar; kol değilse emir kendi sırasıyla rotanın başından yürür.
    const kol = kolCevir(e, e.ustEmirId === null ? undefined : kimlige.get(e.ustEmirId));
    const kolKaymasi = kol?.n ?? 0;
    for (const i of e.isEmirleri) {
      const yer = rotaYeri(e, i.sira, kolKaymasi);
      if (yer === null) continue;
      const anahtar = `${String(e.id)}|root|${String(yer)}`;
      if (i.durum !== 'bekliyor') opStatus[anahtar] = i.durum;
      // Biten adımın ilerlemesi prototipte durumdan okunur; ilerleme yalnız süren adımın kendi sayacıdır (sayım yoksa yazılmaz).
      if (i.durum === 'calisiyor' && i.canliAdet !== null && i.canliAdet > 0) opProg[anahtar] = i.canliAdet;
      if (e.kaynakRotaRevizyonId !== null && i.durum !== 'tamam') {
        const fason = i.kaynak?.tur === 'fason' ? String(i.kaynak.id) : null;
        opYer[anahtar] = {
          fasonId: fason, terminGun: fason === null ? null : i.terminGun ?? null, stationId: i.istasyonId === null ? null : String(i.istasyonId),
          setup: metindenSayi(i.ayarSuresiDk), cycle: metindenSayi(i.birimSureDk),
        };
      }
    }
    const dugumler = e.kaynakRotaRevizyonId === null ? undefined : dugumleriCevir(e);
    return {
      id: String(e.id), kayitNo: e.id, no: e.emirNo, itemId: String(e.malzemeNo), qty: e.adet, start: e.baslangic, due: e.teslim, priority: e.oncelik,
      note: e.aciklama, rev: e.kaynakRotaRevizyonId === null ? null : String(e.kaynakRotaRevizyonId), status: EMIR_DURUMU_PROTOTIP[e.durum],
      created: Date.parse(e.acilma), doneAt: e.bitis === null ? null : Date.parse(e.bitis), tur: e.emirTuru,
      parentId: e.ustEmirId === null ? null : String(e.ustEmirId), kol,
      birlestigiId: e.birlestigiEmirId === null ? null : String(e.birlestigiEmirId), surum: e.surum,
      ...(e.kaynakRotaRevizyonId === null ? { rotasiz: true, adimlar: rotasizAdimlariCevir(e.isEmirleri) } : {}),
      ...(dugumler === undefined ? {} : { dugumler }),
      ...(e.durum === 'bitti' ? { kapanisSonucu: kapanislar.get(e.id) ?? null } : {}),
    };
  });
  return { orders, opStatus, opProg, opYer };
}

// 677 a: motorun tatili hem resmî tatil hem kapalı gündür (Vardiya yalnız kapalı gün yazar; plan stüdyosunun kapattığı gün de kapalıdır).
export function tatilTarihleri(gunler: readonly { tarih: string; tur: 'tatil' | 'kapali' }[]): string[] {
  return gunler.map((g) => g.tarih);
}

// ----- Statü türetme (kart #1107): rotanın statülü adımı malzemesi için kendiliğinden statü açar. -----


const CIKIS_ETIKETI: Readonly<Record<NonNullable<Hareket['cikisNedeni']>, string>> = {
  uretime_sarf: 'Üretime sarf', sevk: 'Sevk', fire: 'Fire', numune: 'Numune', diger: 'Stok çıkışı', tedarikci_iade: 'Tedarikçiye iade',
};

// Stok hareketi -> prototipin `moves` satırı (kart #1186). Statü kimliği prototipin "step:<adım>" anahtarına çevrilir; tanımsız statü
// "statu:<id>" olur. Net etkisi olmayan hareket (konum taşıması, geri alınan hareket, geri alma satırı) listeye girmez. Eskiden yeniye.
export function hareketleriCevir(hareketler: readonly Hareket[], statuAnahtari: ReadonlyMap<number, string>): NonNullable<DurumCevabi['moves']> {
  const anahtar = (id: number | null): string => (id === null ? '' : statuAnahtari.get(id) ?? `statu:${String(id)}`);
  const satirlar: NonNullable<DurumCevabi['moves']> = [];
  for (const h of hareketler) {
    if (h.tur === 'geri_alma' || h.geriAlindi) continue;
    const miktar = metindenSayi(h.miktar);
    if (miktar === null) continue;
    const t = Date.parse(h.zaman);
    const emir = h.uretimEmriId === null ? '' : ` (emir ${String(h.uretimEmriId)})`;
    const ek = h.aciklama === null || h.aciklama.trim() === '' ? '' : `: ${h.aciklama.trim()}`;
    const ortak = { t, itemId: String(h.malzemeId), batch: null } as const;
    if (h.tur === 'transfer') {
      if (h.kaynakStatuId === null && h.hedefStatuId === null) continue;
      const not = `Statü atlatma${ek}`;
      satirlar.push({ ...ortak, id: `h${String(h.id)}-k`, qty: -miktar, note: not, status: anahtar(h.kaynakStatuId) });
      satirlar.push({ ...ortak, id: `h${String(h.id)}-h`, qty: miktar, note: not, status: anahtar(h.hedefStatuId) });
      continue;
    }
    const girisYonlu = h.tur === 'giris' || h.tur === 'sayim_fazla';
    const not = h.tur === 'giris' ? (h.girisKaynagi === 'uretim' ? `Üretim girişi${emir}` : `Mal kabul girişi${emir}`)
      : h.tur === 'cikis' ? `${CIKIS_ETIKETI[h.cikisNedeni ?? 'diger']}${emir}` : 'Sayım düzeltmesi';
    satirlar.push({ ...ortak, id: `h${String(h.id)}`, qty: girisYonlu ? miktar : -miktar, note: `${not}${ek}`, status: '' });
  }
  const sira = (id: string): number => Number(/^h(\d+)/.exec(id)?.[1] ?? 0);
  return satirlar.sort((x, y) => x.t - y.t || sira(x.id) - sira(y.id) || Number(x.id.endsWith('-h')) - Number(y.id.endsWith('-h')));
}

export interface TuretilenStatu { malzemeNo: string; ad: string; kaynakAdim: string; renk: string; tur: 'HM' | 'YM' | 'MM' }

const STATU_TURU_PROTOTIP: Readonly<Record<string, TuretilenStatu['tur']>> = { ham: 'HM', yari: 'YM', mamul: 'MM' };
export const STATU_RENKLERI = ['#2F6FDE', '#1F9E6A', '#9A7400', '#8A4FD3', '#C8102E', '#0E8A9A', '#B5560F', '#4B5D7A'] as const;

const nesne = (d: unknown): Record<string, unknown> | null => (typeof d === 'object' && d !== null && !Array.isArray(d) ? (d as Record<string, unknown>) : null);
const metinMi = (d: unknown): d is string => typeof d === 'string' && d.trim() !== '';

// Adım çıktısının ait olduğu malzeme (taşınan malzeme), prototipin flowCard kuralıyla aynı: adım önceki adımın çıktısını tüketiyorsa
// (zincirin bağımsız olmayan ilk adımı) onun malzemesini taşır, o adım başka bir karta dönüşmüşse o kartı; ilk ve bağımsız adım ilk
// girdisini taşır (HM girerse HM, YM girerse YM statüsü); girdisi yoksa ya da girdi statü açmayan türdeyse rota sahibini (kullanıcı kararı
// 14.10.2026). Liste sıralı adımlardır.
// Öncül listesi olan adımda (1248 a) "önceki" sıra değil öncüldür (1348 a): öncülsüz dal başı ilk girdisini taşır; tek öncüllü adım öncülün
// parçasını taşır, yalnız başka dala geçen ve kendi girdisi olan adım kendi girdisini; birden çok dalı birleştiren adımda dalların
// parçaları tüketilir, adım rota sahibini taşır. Başka öncülün zaten beklediği öncül sayılmaz (birleştirmede ana hattın eski adımı).
function tasinanMalzemeler(adimlar: readonly Record<string, unknown>[], sahipId: string, turu: ReadonlyMap<string, { malzemeNo: string; tur: TuretilenStatu['tur'] }>): ({ malzemeNo: string; tur: TuretilenStatu['tur'] } | undefined)[] {
  const bagimsiz = (a: Record<string, unknown> | undefined): boolean => a?.['dep'] === 'bagimsiz';
  const ilkGirdi = (adim: Record<string, unknown>): string | undefined => {
    const girdiler = Array.isArray(adim['ins']) ? adim['ins'].map(nesne) : [];
    return girdiler.map((g) => g?.['itemId']).find((x): x is string => metinMi(x) && turu.has(x));
  };
  const onculler = dalOnculleri(adimlar);
  const kimlikler: string[] = [];
  const devralinan = (ana: number): string => {
    const donusen = adimlar[ana]?.['outItem'];
    return metinMi(donusen) && turu.has(donusen) ? donusen : kimlikler[ana] ?? sahipId;
  };
  adimlar.forEach((adim, i) => {
    const liste = onculler[i];
    if (liste !== null && liste !== undefined) {
      const tek = liste.length === 1 ? liste[0]! : undefined;
      if (liste.length > 1) kimlikler.push(sahipId);
      else if (tek === undefined) kimlikler.push(ilkGirdi(adim) ?? sahipId);
      else kimlikler.push((adim['dal'] ?? null) !== (adimlar[tek]?.['dal'] ?? null) ? ilkGirdi(adim) ?? devralinan(tek) : devralinan(tek));
      return;
    }
    let ana = -1;
    if (i > 0 && !bagimsiz(adim)) for (let j = i - 1; j >= 0; j--) { ana = j; if (!bagimsiz(adimlar[j]) || j === 0) break; }
    kimlikler.push(ana >= 0 ? devralinan(ana) : ilkGirdi(adim) ?? sahipId);
  });
  return kimlikler.map((k) => turu.get(k) ?? turu.get(sahipId));
}

// Sıralı adımların öncülleri (sıra konumuyla): adımın `onculler` dizisi (seq ile) varsa ondan, başka öncülün atası olan öncül atılarak;
// dizi yoksa null (eski sıra kuralı). Bilinmeyen ya da kendinden sonraki seq atlanır.
function dalOnculleri(adimlar: readonly Record<string, unknown>[]): (number[] | null)[] {
  const konum = new Map<unknown, number>();
  adimlar.forEach((a, i) => { if (!konum.has(a['seq'])) konum.set(a['seq'], i); });
  const dogrudan = adimlar.map((a, i): number[] | null => {
    const ham = a['onculler'];
    if (!Array.isArray(ham)) return null;
    const l = ham.map((o) => konum.get(nesne(o)?.['seq'])).filter((k): k is number => k !== undefined && k < i);
    return [...new Set(l)].sort((x, y) => x - y);
  });
  const atalar: Set<number>[] = [];
  dogrudan.forEach((l, i) => {
    const s = new Set<number>();
    for (const k of l ?? []) { s.add(k); for (const x of atalar[k] ?? []) s.add(x); }
    atalar[i] = s;
  });
  return dogrudan.map((l) => (l === null ? null : l.filter((k) => !l.some((d) => d !== k && atalar[d]?.has(k)))));
}

// Statülü adım: rotanın son olmayan ve çıktısı gerçek bir karta ya da tanımlı bir statüye bağlanmamış adımı (prototipte adımın
// otomatik "OP <no>" kartı). Yalnız ham, yarı mamul ve mamul malzemenin rotası statü açar; statü, adımın taşıdığı malzemenindir. Ad, adımın OP numarası (yerel adımda sırası) ve
// operasyon tanımının adıdır (prototipin statusLabel etiketi; tanım bulunamazsa "OP <no>"). Kaynak adım, malzemeyi de taşıyan adım kimliğidir.
// Belge bozuksa ilgili parça atlanır.
export function statuleriTuret(belge: unknown): TuretilenStatu[] {
  const kok = nesne(belge);
  const malzemeler = Array.isArray(kok?.['items']) ? (kok['items'] as unknown[]) : [];
  const operasyonlar = Array.isArray(kok?.['opdefs']) ? (kok['opdefs'] as unknown[]) : [];
  const rotalar: Record<string, unknown> = nesne(kok?.['routes']) ?? {};
  const opAdi = new Map<string, string>();
  for (const o of operasyonlar.map(nesne)) if (o && metinMi(o['id']) && metinMi(o['name'])) opAdi.set(o['id'], o['name'].trim());
  const cikti: TuretilenStatu[] = [];
  const gorulen = new Set<string>();
  const turu = new Map<string, { malzemeNo: string; tur: TuretilenStatu['tur'] }>();
  for (const m of malzemeler.map(nesne)) {
    const t = m && typeof m['type'] === 'string' ? STATU_TURU_PROTOTIP[m['type']] : undefined;
    if (m && t !== undefined && metinMi(m['id']) && metinMi(m['code'])) turu.set(m['id'], { malzemeNo: m['code'].trim(), tur: t });
  }
  for (const m of malzemeler.map(nesne)) {
    if (!m || !metinMi(m['id']) || !metinMi(m['code'])) continue;
    const tur = typeof m['type'] === 'string' ? STATU_TURU_PROTOTIP[m['type']] : undefined;
    if (tur === undefined) continue;
    const malzemeNo = m['code'].trim();
    const ham = nesne(rotalar[m['id']])?.['steps'];
    if (!Array.isArray(ham)) continue;
    // Prototip adımları seq sırasıyla okur (stepsOf); son adım sıralı listenin sonudur.
    const adimlar = ham
      .map((a: unknown, i) => ({ adim: nesne(a), i }))
      .filter((x): x is { adim: Record<string, unknown>; i: number } => x.adim !== null)
      .map(({ adim, i }) => ({ adim, seq: typeof adim['seq'] === 'number' && Number.isFinite(adim['seq']) ? adim['seq'] : i + 1 }))
      .sort((x, y) => x.seq - y.seq);
    const tasinan = tasinanMalzemeler(adimlar.map((x) => x.adim), m['id'], turu);
    adimlar.slice(0, -1).forEach(({ adim, seq }, sira) => {
      if (!metinMi(adim['id']) || gorulen.has(adim['id'])) return;
      if (metinMi(adim['outItem']) || metinMi(adim['outStatus'])) return;
      gorulen.add(adim['id']);
      const tasiyan = tasinan[sira] ?? { malzemeNo, tur };
      const opAd = metinMi(adim['opId']) ? opAdi.get(adim['opId']) : undefined;
      // Bağlı adımda ad OP numarasıyla kurulur: adım taşınınca sırası değişir, statünün adı değişmez.
      const no = typeof adim['opNo'] === 'number' && Number.isInteger(adim['opNo']) ? adim['opNo'] : seq;
      cikti.push({
        malzemeNo: tasiyan.malzemeNo,
        ad: opAd === undefined ? `OP ${String(no)}` : `OP ${String(no)} ${opAd}`,
        kaynakAdim: adim['id'],
        renk: STATU_RENKLERI[sira % STATU_RENKLERI.length] ?? STATU_RENKLERI[0],
        tur: tasiyan.tur,
      });
    });
  }
  return cikti;
}

// Adımın çıktı kartı (kart #1289): rotada ara adımın "çıkan" kalemi, parçanın dönüştüğü karttır (prototipin outItem alanı). Son adımın
// çıktısı ürünün kendisidir, null döner. Kalem belgede ham, yarı mamul ya da mamul olarak bulunmalıdır (statüdeki taşınan kuralıyla aynı);
// bulunamazsa ya da kimlik sayı değilse null. Belge bozuksa null.
export function adimCiktisiBul(belge: unknown, malzemeNo: number, opNo: number): number | null {
  const kok = nesne(belge);
  const ham = nesne(nesne(kok?.['routes'])?.[String(malzemeNo)])?.['steps'];
  if (!Array.isArray(ham)) return null;
  const adimlar = ham.map(nesne).filter((a): a is Record<string, unknown> => a !== null)
    .map((adim, i) => ({ adim, seq: typeof adim['seq'] === 'number' && Number.isFinite(adim['seq']) ? adim['seq'] : i + 1 }))
    .sort((x, y) => x.seq - y.seq);
  const kimlik = adimKimligi(malzemeNo, opNo);
  const yer = adimlar.findIndex((x) => x.adim['id'] === kimlik);
  if (yer < 0 || yer === adimlar.length - 1) return null;
  const cikti = adimlar[yer]?.adim['outItem'];
  if (!metinMi(cikti) || !/^\d+$/.test(cikti)) return null;
  const malzemeler = Array.isArray(kok?.['items']) ? (kok['items'] as unknown[]).map(nesne) : [];
  const kalem = malzemeler.find((m) => m?.['id'] === cikti);
  return kalem && typeof kalem['type'] === 'string' && STATU_TURU_PROTOTIP[kalem['type']] !== undefined ? Number(cikti) : null;
}

// Sayımda okunan belge (kart #1289): kayıtlı belgenin `routes` alanı çerçevenin son yazdığı andır; rota o yazımdan sonra onaylanıp
// yürürlüğe girdiyse orada yoktur ve statü açılmaz. Ürünün rotası rota modülünün yürürlükteki hâliyle değiştirilir; adımın "çıkan" kalemi
// ve statü bağı yalnız çerçevede tutulduğundan kayıtlı belgedeki aynı adımdan (yürürlükteki rota, sonra revizyonlar) taşınır. Rota modülünde
// yürürlükte rota yoksa belge olduğu gibi okunur.
export function sayimBelgesi(belge: unknown, malzemeNo: number, yururlukteki: { steps: readonly { id: string; opNo: number }[] } | undefined): unknown {
  const kok = nesne(belge);
  if (kok === null || yururlukteki === undefined) return belge;
  const anahtar = String(malzemeNo);
  const rotalar: Record<string, unknown> = { ...(nesne(kok['routes']) ?? {}) };
  const kayitliAdimlar = (veri: unknown): Record<string, unknown>[] => {
    const ham = nesne(veri)?.['steps'];
    return Array.isArray(ham) ? ham.map(nesne).filter((a): a is Record<string, unknown> => a !== null) : [];
  };
  const revizyonlar = (Array.isArray(kok['routeRevs']) ? (kok['routeRevs'] as unknown[]).map(nesne) : [])
    .filter((r): r is Record<string, unknown> => r !== null && r['itemId'] === anahtar)
    .sort((a, b) => Number(b['status'] === 'yururlukte') - Number(a['status'] === 'yururlukte'));
  const kaynaklar = [kayitliAdimlar(rotalar[anahtar]), ...revizyonlar.map((r) => kayitliAdimlar(r['data']))];
  const steps = yururlukteki.steps.map((adim) => {
    const eski = kaynaklar.flatMap((l) => l).find((x) => x['id'] === adim.id || x['id'] === `o${String(adim.opNo)}`);
    if (eski === undefined) return adim;
    return { ...adim, ...(metinMi(eski['outItem']) ? { outItem: eski['outItem'] } : {}), ...(metinMi(eski['outStatus']) ? { outStatus: eski['outStatus'] } : {}) };
  });
  rotalar[anahtar] = { ...(nesne(rotalar[anahtar]) ?? {}), steps };
  return { ...kok, routes: rotalar };
}

// Sayımda okunan belge, adımın çıktı kartı ve statü bağı tablodan (geçiş planı adım 4): ürünün adımları yürürlükteki rotadan (yoksa kayıtlı
// belgenin `routes` alanından), "çıkan" kalem ve statü bağı recete_rota_adim_bagi satırından okunur; adımda belgeden kalan bağ alanı yok sayılır.
// Belge bozuksa ya da ürünün adımı yoksa belge olduğu gibi döner.
export function sayimBelgesiTablodan(
  belge: unknown, malzemeNo: number, yururlukteki: { steps: readonly { id: string; opNo: number }[] } | undefined, baglar: readonly AdimBagiSatiri[],
): unknown {
  const kok = nesne(belge);
  if (kok === null) return belge;
  const anahtar = String(malzemeNo);
  const rotalar: Record<string, unknown> = { ...(nesne(kok['routes']) ?? {}) };
  const kayitli = nesne(rotalar[anahtar]);
  const ham: readonly unknown[] | null = yururlukteki?.steps ?? (Array.isArray(kayitli?.['steps']) ? (kayitli['steps'] as unknown[]) : null);
  if (ham === null) return belge;
  const bag = new Map(baglar.filter((b) => b.malzemeId === malzemeNo).map((b) => [b.opNo, b]));
  const steps = ham.map((a) => {
    const adim = nesne(a);
    if (adim === null) return a;
    const { outItem: _cikti, outStatus: _statu, ...geri } = adim;
    const op = adimOpNo(adim);
    const b = op === null ? undefined : bag.get(op);
    return {
      ...geri,
      ...(b?.ciktiMalzemeId != null ? { outItem: String(b.ciktiMalzemeId) } : {}),
      ...(b?.ciktiStatu != null ? { outStatus: b.ciktiStatu } : {}),
    };
  });
  rotalar[anahtar] = { ...(kayitli ?? {}), steps };
  return { ...kok, routes: rotalar };
}

// Sayımda okunan kart ve operasyon sunucudan (geçiş planı R0): sayfa açılışı artık kaydı yazmadığından belgedeki kart listesi eski kalabilir.
// Ürünün adımlarının andığı kartlar (ürün, çıktı, girdi) sunucunun kaydıyla değiştirilir ya da eklenir; operasyon adları sunucunun
// tanımıdır. Belgede olup sunucuda olmayan kalem olduğu gibi kalır.
export function sayimKartKimlikleri(belge: unknown, malzemeNo: number): number[] {
  const ham = nesne(nesne(nesne(belge)?.['routes'])?.[String(malzemeNo)])?.['steps'];
  const kimlikler = new Set<number>([malzemeNo]);
  for (const a of Array.isArray(ham) ? ham.map(nesne) : []) {
    const cikti = kartNo(a?.['outItem']);
    if (cikti !== null) kimlikler.add(cikti);
    for (const g of Array.isArray(a?.['ins']) ? (a['ins'] as unknown[]).map(nesne) : []) { const k = kartNo(g?.['itemId']); if (k !== null) kimlikler.add(k); }
  }
  return [...kimlikler];
}
export function sunucuKaynaklariyla(
  belge: unknown, kartlar: readonly { id: string; code: string; type: string }[], operasyonlar: readonly { id: string; name: string }[],
): unknown {
  const kok = nesne(belge);
  if (kok === null) return belge;
  const birlestir = <T extends { id: string }>(eski: unknown, yeni: readonly T[]): unknown[] => {
    const liste = Array.isArray(eski) ? (eski as unknown[]) : [];
    const yeniler = new Map(yeni.map((x) => [x.id, x]));
    const kalan = liste.filter((x) => { const id = nesne(x)?.['id']; return !(typeof id === 'string' && yeniler.has(id)); });
    return [...kalan, ...yeni.map((x) => ({ ...(nesne(liste.find((y) => nesne(y)?.['id'] === x.id)) ?? {}), ...x }))];
  };
  return { ...kok, items: birlestir(kok['items'], kartlar), opdefs: birlestir(kok['opdefs'], operasyonlar) };
}

// Gölge karşılaştırma (geçiş planı): belgenin adım bağı tablodakiyle aynı değilse sayım artık belgeden farklı okur. Fark, tabloya
// yazılamayan bağdır (katalogda olmayan çıktı kartı, tanımlı olmayan statü, sayı olmayan kimlik).
export function bagFarklari(belgeden: JsondanSatirlar, tablodaki: readonly AdimBagiSatiri[]): string[] {
  const metin = (b: AdimBagiSatiri | undefined) => (b === undefined ? 'bağ yok' : `çıktı ${b.ciktiMalzemeId === null ? '-' : String(b.ciktiMalzemeId)}, statü ${b.ciktiStatu ?? '-'}`);
  const anahtar = (b: AdimBagiSatiri) => `${String(b.malzemeId)} revizyon ${String(b.revizyonId)} OP ${String(b.opNo)}`;
  const tablo = new Map(tablodaki.map((b) => [anahtar(b), b]));
  const fark = belgeden.adimBaglari.flatMap((b) => {
    const t = tablo.get(anahtar(b));
    return t !== undefined && t.ciktiMalzemeId === b.ciktiMalzemeId && t.ciktiStatu === b.ciktiStatu ? [] : [`${anahtar(b)}: belgede ${metin(b)}, tabloda ${metin(t)}`];
  });
  return [...belgeden.atlananlar, ...fark];
}

// Bağı belgede değişen ürünler: önceki belge yoksa (ilk yazma) bağı olan her ürün. Karşılaştırma belgenin kendi satırlarıyladır (sunucu
// revizyonuyla süzülmeden önce).
export function bagiDegisenUrunler(eski: JsondanSatirlar | null, yeni: JsondanSatirlar): Set<number> {
  const grupla = (s: JsondanSatirlar | null): Map<number, string> => {
    const g = new Map<number, string[]>();
    for (const b of s?.adimBaglari ?? []) g.set(b.malzemeId, [...(g.get(b.malzemeId) ?? []), JSON.stringify([b.revizyonId, b.opNo, b.ciktiMalzemeId, b.ciktiStatu])]);
    return new Map([...g].map(([m, l]) => [m, l.sort().join('|')]));
  };
  const [e, y] = [grupla(eski), grupla(yeni)];
  if (eski === null) return new Set(y.keys());
  return new Set([...new Set([...e.keys(), ...y.keys()])].filter((m) => e.get(m) !== y.get(m)));
}

// ----- Tablolara taşıma (geçiş planı adım 3): JSON'da yalnız duran parçaların tablo satırları. -----

export interface StatuTanimiSatiri { kimlik: string; kod: string; ad: string; tur: string; renk: string; sira: number }
export interface AdimBagiSatiri { revizyonId: number; malzemeId: number; opNo: number; ciktiMalzemeId: number | null; ciktiStatu: string | null }
export interface GirenStatusuSatiri { revizyonId: number; malzemeId: number; opNo: number; girenMalzemeId: number; statu: string | null; girenOpNo: number | null }
export interface StatuKartiSatiri { malzemeId: number; statu: string }
export interface JsondanSatirlar {
  statuTanimlari: StatuTanimiSatiri[];
  adimBaglari: AdimBagiSatiri[];
  girenStatuleri: GirenStatusuSatiri[];
  statuKartlari: StatuKartiSatiri[];
  // Tabloya sığmayan değer (sayı olmayan kart kimliği, OP numarası çözülemeyen adım): taşımada sessizce düşmez, sayılır.
  atlananlar: string[];
}

// Kart kimliği sunucunun yazdığı biçimdedir: başında sıfır ve boşluk olmayan, `int` sütununa sığan sayı. Başka biçim kart sayılmaz (göçteki
// kopyayla aynı kural); iki farklı yazımın aynı karta düşüp satırı ikilemesi de böylece olmaz.
const kartNo = (d: unknown): number | null => (typeof d === 'string' && /^[1-9]\d{0,8}$/.test(d) ? Number(d) : null);
// Sayım adımı kimliğiyle eşler (`<malzeme>-o<opNo>`, eski `o<opNo>`); kimlikte OP yoksa adımın OP alanı. OP 0 çözülemez.
const adimOpNo = (adim: Record<string, unknown>): number | null => {
  const m = typeof adim['id'] === 'string' ? /(?:^|-)o(\d{1,9})$/.exec(adim['id']) : null;
  if (m) return Number(m[1]) > 0 ? Number(m[1]) : null;
  return typeof adim['opNo'] === 'number' && Number.isInteger(adim['opNo']) && adim['opNo'] > 0 && adim['opNo'] < 1e9 ? adim['opNo'] : null;
};

// Bağ revizyonundadır (kullanıcı onayı 16.10.2026): her revizyon kendi adımlarıyla okunur. `routes` ürünün yürürlükteki hâlidir; yürürlükteki
// revizyonda önce o okunur. Yürürlükte revizyonu olmayan üründe `routes` revizyonsuz kalır (tabloya yazılamaz). Revizyon içinde aynı OP'nin
// ilk bulunan adımı geçerlidir.
function urunRevizyonlari(kok: Record<string, unknown>, malzeme: string): { revizyon: string | null; adimlar: Record<string, unknown>[] }[] {
  const adimlarOf = (veri: unknown): Record<string, unknown>[] => {
    const ham = nesne(veri)?.['steps'];
    return Array.isArray(ham) ? ham.map(nesne).filter((a): a is Record<string, unknown> => a !== null) : [];
  };
  const revizyonlar = (Array.isArray(kok['routeRevs']) ? (kok['routeRevs'] as unknown[]).map(nesne) : [])
    .filter((r): r is Record<string, unknown> => r !== null && r['itemId'] === malzeme);
  const rota = adimlarOf(nesne(kok['routes'])?.[malzeme]);
  const yururlukte = revizyonlar.some((r) => r['status'] === 'yururlukte');
  return [
    ...(yururlukte || rota.length === 0 ? [] : [{ revizyon: null, adimlar: rota }]),
    ...revizyonlar.map((r) => ({
      revizyon: typeof r['id'] === 'string' ? r['id'] : null,
      adimlar: [...(r['status'] === 'yururlukte' ? rota : []), ...adimlarOf(r['data'])],
    })),
  ];
}

// recete_rota_statu_tanimi kısıtlarının aynısı: uymayan tanım yazılmaz, atlananlara düşer.
const STATU_TANIMI_TURLERI: ReadonlySet<string> = new Set(['uretim', 'kalite', 'ret', 'giris']);
export const statuTanimiGecerliMi = (s: { kimlik: string; kod: string; ad: string; tur: string; renk: string }): boolean =>
  /^[A-Za-z0-9_-]{1,40}$/.test(s.kimlik) && s.kod.trim() !== '' && s.kod.length <= 5 && s.ad.trim() !== '' && STATU_TANIMI_TURLERI.has(s.tur)
  && /^#[0-9A-Fa-f]{6}$/.test(s.renk);

export function jsondanSatirlar(belge: unknown): JsondanSatirlar {
  const sonuc: JsondanSatirlar = { statuTanimlari: [], adimBaglari: [], girenStatuleri: [], statuKartlari: [], atlananlar: [] };
  const kok = nesne(belge);
  if (kok === null) return sonuc;
  const statuler = Array.isArray(kok['statuses']) ? (kok['statuses'] as unknown[]).map(nesne) : [];
  statuler.forEach((s, sira) => {
    if (s === null || !metinMi(s['id'])) return;
    const satir = {
      kimlik: s['id'], kod: metinMi(s['code']) ? s['code'] : s['id'], ad: metinMi(s['name']) ? s['name'] : s['id'],
      tur: typeof s['kind'] === 'string' ? s['kind'] : '', renk: typeof s['color'] === 'string' ? s['color'] : '', sira,
    };
    if (!statuTanimiGecerliMi(satir)) { sonuc.atlananlar.push(`statü ${satir.kimlik}: tanım tablonun kuralına uymuyor`); return; }
    if (!sonuc.statuTanimlari.some((x) => x.kimlik === satir.kimlik)) sonuc.statuTanimlari.push(satir);
  });
  const urunler = new Set<string>([
    ...Object.keys(nesne(kok['routes']) ?? {}),
    ...(Array.isArray(kok['routeRevs']) ? (kok['routeRevs'] as unknown[]).map((r) => nesne(r)?.['itemId']).filter(metinMi) : []),
  ]);
  for (const urun of [...urunler].sort()) {
    const malzemeId = kartNo(urun);
    for (const grup of urunRevizyonlari(kok, urun)) {
      const revizyonId = kartNo(grup.revizyon);
      const gorulen = new Set<number>();
      let revizyonsuz = false;
      for (const adim of grup.adimlar) {
        const opNo = adimOpNo(adim);
        if (opNo === null) { sonuc.atlananlar.push(`${urun}: OP numarası çözülemeyen adım ${String(adim['id'])}`); continue; }
        if (gorulen.has(opNo)) continue;
        gorulen.add(opNo);
        const cikti = metinMi(adim['outItem']) ? adim['outItem'] : null;
        const statu = metinMi(adim['outStatus']) ? adim['outStatus'] : null;
        const girenler = (Array.isArray(adim['ins']) ? adim['ins'].map(nesne) : []).filter((g): g is Record<string, unknown> => g !== null && metinMi(g['status']));
        if (cikti === null && statu === null && girenler.length === 0) continue;
        if (malzemeId === null) { sonuc.atlananlar.push(`${urun}: kart kimliği sayı değil`); continue; }
        // Sunucuda olmayan revizyonun (bağlanmadan önceki yerel rota) bağı tabloya yazılamaz; revizyon başına bir kez sayılır.
        if (revizyonId === null) {
          if (!revizyonsuz) sonuc.atlananlar.push(`${urun}: sunucuda olmayan rota revizyonu (${grup.revizyon ?? 'yürürlükteki revizyon yok'})`);
          revizyonsuz = true;
          continue;
        }
        if (cikti !== null || statu !== null) {
          const ciktiNo = cikti === null ? null : kartNo(cikti);
          if (cikti !== null && ciktiNo === null) sonuc.atlananlar.push(`${urun} OP ${String(opNo)}: çıktı kartı sayı değil (${cikti})`);
          if (ciktiNo !== null || statu !== null) sonuc.adimBaglari.push({ revizyonId, malzemeId, opNo, ciktiMalzemeId: ciktiNo, ciktiStatu: statu });
        }
        const girenGorulen = new Set<number>();
        for (const g of girenler) {
          const giren = kartNo(g['itemId']);
          const deger = g['status'] as string;
          if (giren === null) { sonuc.atlananlar.push(`${urun} OP ${String(opNo)}: giren kart sayı değil`); continue; }
          // Aynı giren kart adımda bir kez tutulur (tablonun anahtarı); ilk girdi geçerlidir.
          if (girenGorulen.has(giren)) continue;
          girenGorulen.add(giren);
          if (!deger.startsWith('step:')) { sonuc.girenStatuleri.push({ revizyonId, malzemeId, opNo, girenMalzemeId: giren, statu: deger, girenOpNo: null }); continue; }
          const m = /^step:(\d{1,9})-o(\d{1,9})$/.exec(deger);
          if (m === null || Number(m[1]) !== giren || Number(m[2]) === 0) { sonuc.atlananlar.push(`${urun} OP ${String(opNo)}: giren statüsü çözülemedi (${deger})`); continue; }
          sonuc.girenStatuleri.push({ revizyonId, malzemeId, opNo, girenMalzemeId: giren, statu: null, girenOpNo: Number(m[2]) });
        }
      }
    }
  }
  const kartlar = Array.isArray(kok['statusCards']) ? (kok['statusCards'] as unknown[]).map(nesne) : [];
  const kartGorulen = new Set<string>();
  for (const k of kartlar) {
    if (k === null || !metinMi(k['status'])) continue;
    const malzemeId = kartNo(k['itemId']);
    if (malzemeId === null) { sonuc.atlananlar.push(`statülü kart: kart kimliği sayı değil (${String(k['itemId'])})`); continue; }
    const anahtar = `${String(malzemeId)}:${k['status']}`;
    if (kartGorulen.has(anahtar)) continue;
    kartGorulen.add(anahtar);
    sonuc.statuKartlari.push({ malzemeId, statu: k['status'] });
  }
  return sonuc;
}

// Belgedeki revizyon kimliği sunucuda o ürünün revizyonu değilse (silinmiş ya da başka ürünün kimliği) satır yazılmaz, atlananlara düşer.
export function sunucuRevizyonlariyla(s: JsondanSatirlar, revizyonlar: readonly { id: number; malzemeId: number }[]): JsondanSatirlar {
  const urunu = new Map(revizyonlar.map((r) => [r.id, r.malzemeId]));
  const uyar = (x: { revizyonId: number; malzemeId: number }) => urunu.get(x.revizyonId) === x.malzemeId;
  const yok = [...new Set([...s.adimBaglari, ...s.girenStatuleri].filter((x) => !uyar(x)).map((x) => `${String(x.malzemeId)}: revizyon ${String(x.revizyonId)} sunucuda bu ürünün değil`))];
  return { ...s, adimBaglari: s.adimBaglari.filter(uyar), girenStatuleri: s.girenStatuleri.filter(uyar), atlananlar: [...s.atlananlar, ...yok] };
}

// ----- Rota (kart #1184): rota modülünün revizyonları prototipin `routes` ve `routeRevs` biçimine. -----

const REVIZYON_DURUMU_PROTOTIP = { taslak: 'taslak', onay_bekliyor: 'onay', onayli: 'onayli', yururlukte: 'yururlukte', iptal: null } as const;
const BAGIMLILIK_PROTOTIP = { bekleyen: 'bagimli', akisli: 'ortulu', bagimsiz: 'bagimsiz' } as const;
const KULLANIM_PROTOTIP = { tek: 'tek', paralel: 'bol' } as const;

const kimlik = (n: number | null): string | null => (n === null ? null : String(n));
const zamanMs = (iso: string | null): number | null => {
  if (iso === null) return null;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : null;
};

// Adım kimliği malzeme ve OP numarasıdır (`<malzeme>-o<opNo>`): iki ürünün OP 10'u aynı kimliği almaz, adım taşınsa da kimlik ve statü
// değişmez (kullanıcı kararı 14.10.2026).
export const adimKimligi = (malzemeId: number | string, opNo: number): string => `${String(malzemeId)}-o${String(opNo)}`;

function adimCevir(a: DurumRotaAdimi, sira: number, malzemeId: number, makineIstasyonu: ReadonlyMap<number, number>, seqOf: ReadonlyMap<number, number>): DurumRotaAdimiCikti {
  const k = a.kaynak;
  const makine = k?.tur === 'makine' ? k.id : null;
  const istasyon = k?.tur === 'istasyon' ? k.id : makine === null ? null : makineIstasyonu.get(makine) ?? null;
  const aday = a.adaylar.filter((x) => x.kaynak.tur === 'istasyon');
  return {
    id: adimKimligi(malzemeId, a.opNo),
    opNo: a.opNo,
    seq: (sira + 1) * 10,
    opId: String(a.operasyonTipiId),
    name: a.ad,
    stationId: kimlik(istasyon),
    machineId: kimlik(makine),
    kisiId: k?.tur === 'kisi' ? String(k.id) : null,
    fasonId: k?.tur === 'fason' ? String(k.id) : null,
    terminGun: a.terminGun,
    setup: metindenSayi(a.ayarSuresiDk),
    proc: metindenSayi(a.islemSuresiDk ?? a.birimSureDk),
    chg: metindenSayi(a.degisimSuresiDk),
    cycle: metindenSayi(a.birimSureDk),
    dep: BAGIMLILIK_PROTOTIP[a.bagimlilik],
    depQty: a.devirAdedi,
    rejectPct: metindenSayi(a.firePayiYuzde) ?? 0,
    split: KULLANIM_PROTOTIP[a.makineKullanimi],
    minLot: a.enKucukParca,
    resetup: a.yenidenAyar,
    // setup toplamdır (hazırlık + ayar); ayarlı adımda plan ayarcı arar (1310 a).
    hazirlik: metindenSayi(a.hazirlikDk),
    ayarli: a.ayar,
    ayarDk: metindenSayi(a.ayarDk),
    ilkParca: a.ilkParca,
    dal: a.dal,
    birlesen: a.birlesen,
    adetCarpani: a.adetCarpani,
    onculler: a.onculler === null ? null : a.onculler.flatMap((o) => {
      const seq = seqOf.get(o.opNo);
      return seq === undefined ? [] : [{ seq, tur: o.tur }];
    }),
    alts: aday.map((x) => String(x.kaynak.id)),
    altTimes: Object.fromEntries(aday.map((x) => [String(x.kaynak.id), { setup: metindenSayi(x.ayarSuresiDk), cycle: metindenSayi(x.birimSureDk) }])),
    digerAdaylar: a.adaylar.filter((x) => x.kaynak.tur !== 'istasyon').map((x) => ({
      tur: x.kaynak.tur === 'kisi' ? 'kisi' as const : 'makine' as const,
      id: String(x.kaynak.id),
      setup: metindenSayi(x.ayarSuresiDk),
      proc: metindenSayi(x.islemSuresiDk ?? x.birimSureDk),
      chg: metindenSayi(x.degisimSuresiDk),
      cycle: metindenSayi(x.birimSureDk),
    })),
    ins: a.bilesenler.map((b) => ({ itemId: String(b.malzemeId), qty: metindenSayi(b.miktar) ?? 0, scrap: metindenSayi(b.fireYuzde) ?? 0 })),
    outs: a.yanUrunler.map((y) => ({ itemId: String(y.malzemeId), qty: metindenSayi(y.miktar) ?? 0, kind: 'yan' as const })),
  };
}

// Prototip adım sırasını `seq` ile tutar ve sürükleyince 10, 20, 30... diye yeniden numaralar: `seq` adımın sırasıdır, adımın kimliği
// sunucudaki OP numarasıdır (`opNo`, adım kimliği `<malzeme>-o<opNo>`). Sıra revizyonların verildiği sıradır. Yürürlükteki revizyonun rotası `routes` olur; yürürlüğü olmayan ürünün kaydı yoktur.
export function rotaDilimiCevir(
  revizyonlar: readonly DurumRotaRevizyonuGirdisi[],
  makineIstasyonu: ReadonlyMap<number, number>,
): { routes: Record<string, DurumRotaRevizyonu['data']>; routeRevs: DurumRotaRevizyonu[] } {
  const routes: Record<string, DurumRotaRevizyonu['data']> = {};
  const routeRevs: DurumRotaRevizyonu[] = [];
  for (const r of revizyonlar) {
    const status = REVIZYON_DURUMU_PROTOTIP[r.durum];
    if (status === null) continue;
    const seqOf = new Map(r.adimlar.map((a, i) => [a.opNo, (i + 1) * 10]));
    const data = { base: null, steps: r.adimlar.map((a, i) => adimCevir(a, i, r.malzemeId, makineIstasyonu, seqOf)) };
    routeRevs.push({
      id: String(r.id), itemId: String(r.malzemeId), no: r.harf, status, surum: r.surum, note: r.aciklama ?? '',
      created: zamanMs(r.acilma) ?? 0, approvedAt: zamanMs(r.yururlugeAlma ?? r.onaylama), data,
    });
    if (status === 'yururlukte') routes[String(r.malzemeId)] = data;
  }
  return { routes, routeRevs };
}

// Birim maliyetler (kart #1187): finansın kayıtları prototipin kimlik metinleriyle anahtarlanır. Kaydı olmayan kalem haritada yoktur.
export type MaliyetKayitlari = ReadonlyMap<number, DurumMaliyeti['malzeme'][string]>;
const maliyetHaritasi = (k: MaliyetKayitlari): DurumMaliyeti['malzeme'] =>
  Object.fromEntries([...k].map(([id, g]) => [String(id), { birimMaliyet: g.birimMaliyet, paraBirimi: g.paraBirimi, surum: g.surum }]));
export function maliyetCevir(
  malzeme: MaliyetKayitlari, istasyon: MaliyetKayitlari, kisi: MaliyetKayitlari, yazabilir: boolean,
): DurumMaliyeti {
  return { yazabilir, malzeme: maliyetHaritasi(malzeme), istasyon: maliyetHaritasi(istasyon), kisi: maliyetHaritasi(kisi) };
}

// Genel aramanın rota kaynağı (kart #1241): yalnız yürürlükte rotası olan kalem sonuçtur. Kodu tam tutan önce, sonra koddan
// başlayan, sonra öteki (malzemelerin verdiği sıra korunur). Sonuç kalemin "Ürün ve rotalar" bölümünü o kalem seçili açar.
export interface RotaAramaAdayi { id: number; kod: string; ad: string | null }
export interface RotaAramaSonucu { anahtar: string; baslik: string; aciklama: string | null; yol: `/${string}` }
export function rotaAramaSonuclari(
  adaylar: readonly RotaAramaAdayi[], rotaHarfi: ReadonlyMap<number, string>, metin: string, sinir: number,
): RotaAramaSonucu[] {
  // Türkçe harf farkı genel aramanın sadeleştirmesiyle kalkar ("mil" yazan "MIL-..." kodunu tam tutmuş sayılır).
  const sade = (x: string): string => aramaSade(x.trim());
  const m = sade(metin);
  const derece = (kod: string): number => { const k = sade(kod); return k === m ? 0 : k.startsWith(m) ? 1 : 2; };
  return adaylar
    .filter((a) => rotaHarfi.has(a.id))
    .map((a, sira) => ({ a, sira, d: derece(a.kod) }))
    .sort((x, y) => x.d - y.d || x.sira - y.sira)
    .slice(0, Math.max(0, sinir))
    .map(({ a }) => ({
      anahtar: String(a.id),
      baslik: a.kod,
      aciklama: [a.ad?.trim() ?? '', `Rota ${rotaHarfi.get(a.id) ?? ''} · yürürlükte`].filter((p) => p !== '').join(' · '),
      yol: `/recete-rota/schema?kayit=${String(a.id)}`,
    }));
}
