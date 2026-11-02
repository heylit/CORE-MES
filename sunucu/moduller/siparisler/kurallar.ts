// Saf iş kuralları; veritabanı ve saat yok. Kural numaraları KURAL-TEST.md'de testlerine bağlıdır.
import type { FirmaTuru } from '#paylasilan/sozlesme/musteri-tedarikci.ts';
import { ISKONTO_ONAY_ESIGI, TERMIN_ARALIKLARI, type TerminAraligi } from '#paylasilan/sozlesme/siparisler.ts';
import type {
  AdetCarpani, AdetDenemesiSatiri, MaliyetKalemi, PlanBloguTuru, PlanSeridi, Siparis, SiparisAyrintisi, SiparisDurumu, TeklifAyrintiCevabi, TeklifAyrintisi, TeklifDurumu, TeklifSatiri, TerminDenemesiCevabi,
  TerminDenemesiKalemi,
} from '#paylasilan/sozlesme/siparisler.ts';

export const SIPARIS_YOK = 'Sipariş bulunamadı.';

// Termine kalan gün (termin - bugün): eksi gecikmiştir; 0 bugün teslim edilecek olandır.
export function terminAraligi(kalanGun: number): TerminAraligi {
  if (kalanGun < 0) return 'gecikmis';
  if (kalanGun <= 3) return '0-3';
  if (kalanGun <= 7) return '4-7';
  if (kalanGun <= 14) return '8-14';
  return '15+';
}

export function terminDagilimi(kalanlar: readonly { kalan: number; sayi: number }[]): { aralik: TerminAraligi; sayi: number }[] {
  const toplam = new Map<TerminAraligi, number>(TERMIN_ARALIKLARI.map((a) => [a, 0]));
  for (const k of kalanlar) { const a = terminAraligi(k.kalan); toplam.set(a, (toplam.get(a) ?? 0) + k.sayi); }
  return TERMIN_ARALIKLARI.map((aralik) => ({ aralik, sayi: toplam.get(aralik) ?? 0 }));
}
export const FIRMA_YOK = 'Firma bulunamadı.';
export const FIRMA_PASIF = 'Pasif firmaya sipariş açılamaz.';
export const FIRMA_MUSTERI_DEGIL = 'Firma müşteri değil; satış siparişi yalnız müşteri firmaya açılır.';
export const MALZEME_YOK = 'Malzeme kartı bulunamadı.';
export const MALZEME_AKTIF_DEGIL = 'Onaylanmamış ya da iptal edilmiş malzeme kartı siparişe girmez.';
export const MALZEME_SATILMAZ = 'Bu türdeki kart satılmaz; yalnız mamul, yarı mamul ve ticari mal siparişe girer.';
export const MUSTERI_NO_KULLANILIYOR = 'Bu müşteri sipariş numarası bu firmada başka bir siparişte kullanılıyor.';
export const YALNIZ_TASLAK = 'Yalnız taslak sipariş değiştirilir.';
// Numara Logo fiş numarası olur; kalıp Sistem Ayarları'nda daha uzun numara üretirse kayıt açılmaz.
export const NUMARA_UZUN = 'Numara kalıbı 16 karakteri aşan numara üretiyor; Sistem Ayarları > Numara kurallarında kalıbı kısaltın.';

// SIP-02: satılan kart türleri. Hizmet ve sarf satış siparişine girmez (VARSAYIM; NOTLAR.md).
export const SATILAN_TURLER = ['mamul', 'yarimamul', 'ticari_mal'] as const;

// SIP-01: müşteri ya da iki yönlü firma; pasif firma yeni seçilemez, taslağın zaten bağlı olduğu firma pasifleşse de kalabilir.
export function firmaReddi(
  firma: { tur: FirmaTuru; aktif: boolean } | null, firmaId: number, mevcutFirmaId: number | null,
): string | null {
  if (firma === null) return FIRMA_YOK;
  if (firma.tur === 'tedarikci') return FIRMA_MUSTERI_DEGIL;
  if (!firma.aktif && firmaId !== mevcutFirmaId) return FIRMA_PASIF;
  return null;
}

// SIP-02: kart var, aktif ve satılan türde olmalı.
export function malzemeReddi(kart: { tur: string; onayDurumu: string } | null): string | null {
  if (kart === null) return MALZEME_YOK;
  if (!(SATILAN_TURLER as readonly string[]).includes(kart.tur)) return MALZEME_SATILMAZ;
  if (kart.onayDurumu !== 'aktif') return MALZEME_AKTIF_DEGIL;
  return null;
}

// SIP-04: durum geçişleri. Taslak onaylanır; onaylı kapanır; taslak ve onaylı iptal edilir. Kapanmış ve iptal son durumdur.
export type DurumKomutu = 'onayla' | 'kapat' | 'iptal';
const GECISLER: Readonly<Record<DurumKomutu, { kaynak: readonly SiparisDurumu[]; hedef: SiparisDurumu }>> = {
  onayla: { kaynak: ['taslak'], hedef: 'onayli' },
  kapat: { kaynak: ['onayli'], hedef: 'kapandi' },
  iptal: { kaynak: ['taslak', 'onayli'], hedef: 'iptal' },
};
const DURUM_ADI: Readonly<Record<SiparisDurumu, string>> = { taslak: 'taslak', onayli: 'onaylı', kapandi: 'kapanmış', iptal: 'iptal edilmiş' };
const KOMUT_ADI: Readonly<Record<DurumKomutu, string>> = { onayla: 'onaylanamaz', kapat: 'kapatılamaz', iptal: 'iptal edilemez' };

export function gecisHedefi(komut: DurumKomutu): SiparisDurumu {
  return GECISLER[komut].hedef;
}

export function gecisReddi(durum: SiparisDurumu, komut: DurumKomutu): string | null {
  return GECISLER[komut].kaynak.includes(durum) ? null : `${DURUM_ADI[durum]} sipariş ${KOMUT_ADI[komut]}.`.replace(/^./, (h) => h.toLocaleUpperCase('tr'));
}

// SIP-03: içerik yalnız taslakta değişir; onaylı kayıt onaysız değişmez.
export function duzenlemeReddi(durum: SiparisDurumu): string | null {
  return durum === 'taslak' ? null : YALNIZ_TASLAK;
}

// Aramada no ve müşteri sipariş no büyük-küçük harf duyarsız aranır (SQL tarafı ILIKE).
export function aramaKalibi(ara: string | undefined): string | null {
  const m = ara?.trim();
  if (!m) return null;
  return `%${m.replace(/[\\%_]/g, (k) => `\\${k}`)}%`;
}

// ---- Satış teklifi ----

export const TEKLIF_YOK = 'Teklif bulunamadı.';
export const YALNIZ_YENI_TEKLIF = 'Talep yalnız ilk sürüm verilmeden düzenlenir.';
export const FIYAT_EKSIK = 'Teklifin her satırına bir fiyat verilmeli.';
export const SURUM_YOK = 'Bu teklifte böyle bir sürüm yok.';
export const KARTSIZ_SATIR = 'Kartı bağlanmamış satır var; siparişe dönüştürmeden önce her satıra malzeme kartı bağlanmalı.';
export const KART_BAGLANAMAZ = 'Reddedilmiş ya da siparişe dönüşmüş teklifin satırı değişmez.';

// TKL-05: teklif durum geçişleri. Sürüm yeni, verilmiş ve revizyondaki teklife verilir; kabul ve revizyon verilmiş teklife;
// red kabulden önce; siparişe yalnız kabul edilmiş teklif döner. Red ve sipariş son durumdur.
export type TeklifKomutu = 'surum' | 'iskonto-onay' | 'termin-onay' | 'revizyon' | 'kabul' | 'red' | 'siparis';
const TEKLIF_GECISLERI: Readonly<Record<TeklifKomutu, { kaynak: readonly TeklifDurumu[]; hedef: TeklifDurumu }>> = {
  surum: { kaynak: ['yeni', 'onay-bekliyor', 'verildi', 'revizyon'], hedef: 'verildi' },
  'iskonto-onay': { kaynak: ['onay-bekliyor'], hedef: 'verildi' },
  'termin-onay': { kaynak: ['onay-bekliyor'], hedef: 'verildi' },
  revizyon: { kaynak: ['verildi'], hedef: 'revizyon' },
  kabul: { kaynak: ['verildi'], hedef: 'kabul' },
  red: { kaynak: ['yeni', 'onay-bekliyor', 'verildi', 'revizyon'], hedef: 'red' },
  siparis: { kaynak: ['kabul'], hedef: 'siparis' },
};
const TEKLIF_DURUM_ADI: Readonly<Record<TeklifDurumu, string>> = {
  yeni: 'yeni', 'onay-bekliyor': 'onay bekliyor', verildi: 'verildi', revizyon: 'revizyon bekliyor', kabul: 'kabul edildi', red: 'reddedildi', siparis: 'siparişe dönüştü',
};
const TEKLIF_KOMUT_ADI: Readonly<Record<TeklifKomutu, string>> = {
  surum: 'yeni sürüm verilemez', 'iskonto-onay': 'onaylanacak iskonto yok', 'termin-onay': 'onaylanacak termin yok', revizyon: 'revizyon istenemez', kabul: 'kabul edilemez', red: 'reddedilemez', siparis: 'siparişe dönüştürülemez',
};

export function teklifHedefi(komut: TeklifKomutu): TeklifDurumu {
  return TEKLIF_GECISLERI[komut].hedef;
}

// 291 a: eşiği aşan iskontolu sürüm müşteriye gitmeden müdür onayı bekler; müdür onaylamazsa yeni sürüm ya da red verilir.
export function iskontoOnayiGerekir(iskontoOrani: string): boolean {
  return Number(iskontoOrani) > ISKONTO_ONAY_ESIGI;
}

// TKL-15 (63 b): iskonto ve termin onayı ayrı verilir; teklif ikisi de bitmeden müşteriye gitmez.
export function onayHedefi(bekleyen: { iskonto: boolean; termin: boolean }): TeklifDurumu {
  return bekleyen.iskonto || bekleyen.termin ? 'onay-bekliyor' : 'verildi';
}
export function surumHedefi(iskontoOrani: string, terminOnayiBekler = false): TeklifDurumu {
  return onayHedefi({ iskonto: iskontoOnayiGerekir(iskontoOrani), termin: terminOnayiBekler });
}
export const ONAYLANACAK_ISKONTO_YOK = 'Onaylanacak iskonto yok.';
export const ONAYLANACAK_TERMIN_YOK = 'Plancı onayı bekleyen satış taslağı yok.';

// 293 ve 273: ayar açıkken sürümü veren kişi kendi iskontosunu ya da terminini onaylayamaz; kapalıyken onay yetkisi yeter.
export function dortGozReddi(acik: boolean, surumuVeren: number, onaylayan: number, konu: 'iskonto' | 'termin' = 'iskonto'): string | null {
  return acik && surumuVeren === onaylayan ? `Dört göz kuralı açık: kendi verdiğiniz sürümün ${konu === 'iskonto' ? 'iskontosunu' : 'terminini'} başka bir yetkili onaylamalı.` : null;
}

export function teklifGecisReddi(durum: TeklifDurumu, komut: TeklifKomutu): string | null {
  return TEKLIF_GECISLERI[komut].kaynak.includes(durum) ? null : `Teklif durumu "${TEKLIF_DURUM_ADI[durum]}"; ${TEKLIF_KOMUT_ADI[komut]}.`;
}

// TKL-03: talep satırları yalnız ilk sürümden önce değişir (verilmiş fiyat satıra bağlıdır).
export function talepDuzenlemeReddi(durum: TeklifDurumu): string | null {
  return durum === 'yeni' ? null : YALNIZ_YENI_TEKLIF;
}

// TKL-04: sürümde her talep satırının tam bir fiyatı olur; fazla, eksik ya da yinelenen satır reddedilir.
export function fiyatReddi(satirIdleri: readonly number[], fiyatSatirlari: readonly number[]): string | null {
  const verilen = new Set(fiyatSatirlari);
  if (verilen.size !== fiyatSatirlari.length || verilen.size !== satirIdleri.length) return FIYAT_EKSIK;
  return satirIdleri.every((id) => verilen.has(id)) ? null : FIYAT_EKSIK;
}

// TKL-06: siparişe dönüşmeden her satırın kartı bağlı olmalı.
export function kartsizSatirReddi(malzemeNolari: readonly (number | null)[]): string | null {
  return malzemeNolari.every((m) => m !== null) ? null : KARTSIZ_SATIR;
}

export function kartBaglamaReddi(durum: TeklifDurumu): string | null {
  return durum === 'red' || durum === 'siparis' ? KART_BAGLANAMAZ : null;
}

// SIP-10 (180): fiyat, iskonto, tutar ve toplamlar yalnız fiyat ve maliyet görene gider; görmeyene null (sıfır uydurulmaz).
export function siparisFiyatsiz(s: Siparis): Siparis {
  return { ...s, araToplam: null, kdvTutari: null, genelToplam: null };
}
export function siparisAyrintisiFiyatsiz(s: SiparisAyrintisi): SiparisAyrintisi {
  return { ...siparisFiyatsiz(s), satirlar: s.satirlar.map((m) => ({ ...m, birimFiyat: null, tutar: null })) };
}
export function teklifFiyatsiz(t: TeklifAyrintisi): TeklifAyrintiCevabi {
  return {
    ...t,
    surumler: t.surumler.map((v) => ({
      ...v, iskontoOrani: null, toplam: null,
      fiyatlar: v.fiyatlar.map((f) => ({ satirId: f.satirId, birimFiyat: null, iskontoluFiyat: null, tutar: null })),
    })),
  };
}

// SIP-11 (201 a): fiyatı yalnız fiyat görme yetkisi olan girer; öteki yazar kalemi fiyatsız açar ve düzenlerken önceki fiyatı silemez.
// Fiyatsız kalemli sipariş onaylanmaz.
export const FIYAT_YETKISI_YOK = 'Fiyatı yalnız fiyat görme yetkisi olan girer; kalemleri fiyatsız gönderin.';
export const SIPARIS_FIYAT_EKSIK = 'Fiyatı girilmemiş kalem var; sipariş fiyatlar girilmeden onaylanamaz.';

export function fiyatYazmaReddi(fiyatYazar: boolean, satirlar: readonly { birimFiyat: string | null }[]): string | null {
  return !fiyatYazar && satirlar.some((s) => s.birimFiyat !== null) ? FIYAT_YETKISI_YOK : null;
}

// Fiyatı görmeyen düzenlemede satır, aynı sırada aynı kart duruyorsa önceki fiyatını korur; yeni ya da yeri değişen kalem fiyatsızdır.
export function fiyatlariKoru<T extends { malzemeNo: number; birimFiyat: string | null }>(
  onceki: readonly { malzemeNo: number; birimFiyat: string | null }[], yeni: readonly T[],
): T[] {
  return yeni.map((s, i) => (onceki[i]?.malzemeNo === s.malzemeNo ? { ...s, birimFiyat: onceki[i]?.birimFiyat ?? null } : s));
}

export function fiyatEksikReddi(satirlar: readonly { birimFiyat: string | null }[]): string | null {
  return satirlar.some((s) => s.birimFiyat === null) ? SIPARIS_FIYAT_EKSIK : null;
}

// ---- Teklif termin ve fiyat denemesi (44) ----

export const TERMIN_DENEMESI_YOK = 'Termin denemesi kullanılamıyor (planlama motoru bağlı değil); fiyat ve termin elle girilir.';
export const DENENECEK_KALEM_YOK = 'Teklifte kartı bağlı kalem yok; fiyat ve termin elle girilir.';
export const GENEL_GIDER_YOK = 'Genel gider oranı tanımlı değil (Finans).';
export const TERMIN_CIKMADI = 'Motor teklifin bütün kalemlerini yerleştiremedi; termin çıkmadı. Eksik veriyi tamamlayın ya da fiyat ve termini elle verin.';

// Motorun bir kalem için verdiği yerleşim. TL'ler motorun ücretlerinden gelir; ücret ya da fiyat eksikse null.
export interface DenemeIslemi {
  opId: string;
  tezgah: string;
  fason: boolean;
  baslangic: string;
  bitis: string;
  ayarSaat: number;
  islemeSaat: number;
  // Motor işlemin ayar ve işleme bedelini tek tutar verir; fasonda fason bedelidir.
  tl: number | null;
}
export interface DenemeKalemi {
  satirId: number;
  yerlesti: boolean;
  bitis: string | null;
  planTermini: string | null;
  malzemeTl: number | null;
  malzemeGelisi: string | null;
  satinalma: { kod: string; miktar: number; birim: string | null; gelis: string }[];
  islemler: DenemeIslemi[];
  eksikVeri: string[];
}
export interface DenemeSonucu {
  planSurumu: string | null;
  kalemler: DenemeKalemi[];
  kayanlar: { siparis: string; once: string; sonra: string; termin: string | null; gecikir: boolean }[];
  plan: PlanSeridi | null;
}

const tl = (n: number | null): string | null => (n === null || !Number.isFinite(n) ? null : n.toFixed(2));
const toplamVeyaNull = (sayilar: readonly (number | null)[]): number | null =>
  sayilar.some((n) => n === null || !Number.isFinite(n)) ? null : sayilar.reduce<number>((a, n) => a + (n ?? 0), 0);

// TKL-14: maliyet aynı yerleşimden çıkar: malzeme, her işlemin (ayar dahil) tutarı, fason bedeli ve tezgâh saatine genel gider.
// Biri bilinmiyorsa toplam null (sıfır uydurulmaz); yerleşmeyen kalemin maliyeti yoktur.
export function kalemMaliyeti(k: DenemeKalemi, adet: number, genelGiderSaatBasi: number | null): {
  dokum: MaliyetKalemi[]; toplam: number | null; birim: number | null;
} {
  const dokum: MaliyetKalemi[] = [{ tur: 'malzeme', ad: 'Malzeme', tezgah: null, saat: null, tutar: tl(k.malzemeTl) }];
  const tutarlar: (number | null)[] = [k.malzemeTl];
  let makineSaati = 0;
  for (const i of k.islemler) {
    if (i.fason) {
      dokum.push({ tur: 'fason', ad: i.opId, tezgah: i.tezgah, saat: null, tutar: tl(i.tl) });
      tutarlar.push(i.tl);
      continue;
    }
    makineSaati += i.ayarSaat + i.islemeSaat;
    dokum.push({ tur: 'isleme', ad: i.opId, tezgah: i.tezgah, saat: (i.ayarSaat + i.islemeSaat).toFixed(2), tutar: tl(i.tl) });
    tutarlar.push(i.tl);
  }
  const genel = genelGiderSaatBasi === null ? null : makineSaati * genelGiderSaatBasi;
  dokum.push({ tur: 'genel-gider', ad: 'Genel gider', tezgah: null, saat: makineSaati.toFixed(2), tutar: tl(genel) });
  tutarlar.push(genel);
  const toplam = k.yerlesti && adet > 0 ? toplamVeyaNull(tutarlar) : null;
  return { dokum, toplam, birim: toplam === null ? null : toplam / adet };
}

// 59 a: termin, geçerlilik tarihinden itibaren gün olarak da yazılır. Tarihler gündür; saat dilimi karışmaz.
export function gunFarki(bas: string, son: string): number {
  return Math.round((Date.parse(`${son}T00:00:00Z`) - Date.parse(`${bas}T00:00:00Z`)) / 86_400_000);
}

const enGec = (tarihler: readonly string[]): string | null => (tarihler.length === 0 ? null : [...tarihler].sort().at(-1) ?? null);

// TKL-13 (64 a, 62 a, 48 b, 63 b): bütün kartlı kalemler tek denemede yerleşir; teklifin plan termini en geç kalemin terminidir,
// yerleşmeyen kalem varsa plan termini yoktur. Kartsız kalem plansızdır. İstenen termin bir siparişi geciktiriyorsa plancı onayı gerekir.
export function denemeCevabi(
  satirlar: readonly Pick<TeklifSatiri, 'id' | 'sira' | 'malzemeNo' | 'tanim' | 'miktar'>[], sonuc: DenemeSonucu | null,
  g: { gecerlilik: string | null; istenenTermin: string | null; genelGiderSaatBasi: number | null },
): TerminDenemesiCevabi {
  const motor = new Map((sonuc?.kalemler ?? []).map((k) => [k.satirId, k]));
  const kalemler: TerminDenemesiKalemi[] = satirlar.map((s) => {
    const k = s.malzemeNo === null ? undefined : motor.get(s.id);
    const ortak = { satirId: s.id, sira: s.sira, tanim: s.tanim, malzemeNo: s.malzemeNo, adet: s.miktar, plansiz: s.malzemeNo === null };
    if (k === undefined) {
      return {
        ...ortak, yerlesti: false, bitis: null, planTermini: null, malzemeGelisi: null, satinalma: [], birimMaliyet: null, toplamMaliyet: null, dokum: null,
        eksikVeri: [],
      };
    }
    const m = kalemMaliyeti(k, Number(s.miktar), g.genelGiderSaatBasi);
    const eksik = g.genelGiderSaatBasi === null ? [...k.eksikVeri, GENEL_GIDER_YOK] : k.eksikVeri;
    return {
      ...ortak, yerlesti: k.yerlesti, bitis: k.bitis, planTermini: k.planTermini, malzemeGelisi: k.malzemeGelisi,
      satinalma: k.satinalma.map((a) => ({ kod: a.kod, miktar: String(a.miktar), birim: a.birim, gelis: a.gelis })),
      birimMaliyet: m.birim === null ? null : m.birim.toFixed(4), toplamMaliyet: tl(m.toplam), dokum: m.dokum, eksikVeri: eksik,
    };
  });
  const planli = kalemler.filter((k) => !k.plansiz);
  const planTermini = sonuc === null || planli.length === 0 || planli.some((k) => k.planTermini === null)
    ? null : enGec(planli.map((k) => k.planTermini ?? ''));
  const termin = g.istenenTermin ?? planTermini;
  const kayanlar = sonuc?.kayanlar ?? [];
  return {
    durum: sonuc === null && planli.length > 0 ? 'cozucu-yok' : 'hazir',
    planSurumu: sonuc?.planSurumu ?? null,
    gecerlilik: g.gecerlilik,
    istenenTermin: g.istenenTermin,
    planTermini,
    termin,
    terminGun: termin !== null && g.gecerlilik !== null ? gunFarki(g.gecerlilik, termin) : null,
    yetisir: g.istenenTermin === null ? null : planTermini !== null && planTermini <= g.istenenTermin,
    onayGerekli: g.istenenTermin !== null && kayanlar.some((k) => k.gecikir),
    satinalmaGerekli: kalemler.some((k) => k.satinalma.length > 0),
    kalemler,
    maliyetToplami: planli.length === 0 ? null : tl(toplamVeyaNull(planli.map((k) => (k.toplamMaliyet === null ? null : Number(k.toplamMaliyet))))),
    genelGiderSaatBasi: tl(g.genelGiderSaatBasi),
    kayanlar,
    plan: sonuc?.plan ?? null,
  };
}

// Adet değişirse: çarpan 1 kalemi olduğu gibi bırakır; ötekiler tam adede yuvarlanır, en az 1 (örnek sayfa: yarım, iki ve dört kat).
export function carpilmisAdet(miktar: string, carpan: AdetCarpani): string {
  if (carpan === '1') return miktar;
  return Math.max(1, Math.round(Number(miktar) * Number(carpan))).toFixed(3);
}

// Aynı adetleri veren çarpan tabloyu tekrarlamaz (ör. tek adetlik teklifte yarım kat); teklifin kendi adedi (çarpan 1) hep kalır.
export function adetSatirlari(satirlar: readonly AdetDenemesiSatiri[]): AdetDenemesiSatiri[] {
  const anahtar = (s: AdetDenemesiSatiri): string => s.kalemler.map((k) => Number(k.adet)).join('|');
  const gorulen = new Set(satirlar.filter((s) => s.carpan === '1').map(anahtar));
  return satirlar.filter((s) => {
    if (s.carpan === '1') return true;
    const a = anahtar(s);
    if (gorulen.has(a)) return false;
    gorulen.add(a);
    return true;
  });
}

// TKL-16 (180, 65 a): maliyet toplamı fiyat ya da maliyet görene, döküm ve genel gider oranı yalnız maliyet okuyana gider; görmeyene null.
export function denemeSuzgeci(c: TerminDenemesiCevabi, gorur: { toplam: boolean; dokum: boolean }): TerminDenemesiCevabi {
  return {
    ...c,
    maliyetToplami: gorur.toplam ? c.maliyetToplami : null,
    genelGiderSaatBasi: gorur.dokum ? c.genelGiderSaatBasi : null,
    kalemler: c.kalemler.map((k) => ({
      ...k,
      birimMaliyet: gorur.toplam ? k.birimMaliyet : null,
      toplamMaliyet: gorur.toplam ? k.toplamMaliyet : null,
      dokum: gorur.dokum ? k.dokum : null,
    })),
  };
}

// Satış taslağının planda tuttuğu yer: kalemlerin bütün işlemleri, tezgâh ve zamanıyla.
export function kilitler(sonuc: DenemeSonucu): { satirId: number; opId: string; tezgah: string; baslangic: string; bitis: string }[] {
  return sonuc.kalemler.flatMap((k) => k.islemler.map((i) => ({ satirId: k.satirId, opId: i.opId, tezgah: i.tezgah, baslangic: i.baslangic, bitis: i.bitis })));
}

// Planlama motorunun (Reçete ve Rota teklifDene) girdi ve sonuç biçimi; yalnız siparişlerin kullandığı alanlar. Kalemler sırayla eşleşir.
// Anlar tesis anı (ISO), günler 'GGGG-AA-GG'. Motor çalışması yoksa sonuç null'dır.
export interface MotorYerlesimi { makineId: string; baslangic: string }
export interface MotorGirdisi {
  kalemler: { malzemeNo: number; adet: number }[];
  gecerlilik: string;
  istenenTermin: string | null;
  taslakId: string | null;
  taslaklar: { id: string; gecerlilik: string; kalemler: { malzemeNo: number; adet: number; termin: string; yerlesim: Record<string, MotorYerlesimi> }[] }[];
}
export interface MotorSonucu {
  kalemler: {
    tamam: boolean;
    bitis: string | null;
    planTermini: string | null;
    malzeme: { gelis: string | null }[];
    satinalma: { kod: string; birim: string; miktar: number; gelis: string }[];
    islemler: { adim: string; makineId: string; fason: boolean; baslangic: string; bitis: string; ayarSaat: number; islemeSaat: number; tl: number | null }[];
    malzemeTl: number | null;
    eksik: string[];
  }[];
  kayan: { siparis: string; emirNo: string | null; once: string; sonra: string; termin: string | null }[];
  // Plan denemesi şeridi; Reçete ve Rota vermiyorsa yoktur.
  plan?: MotorPlani | null;
}
export interface MotorPlani {
  baslangic: string;
  bitis: string;
  kapaliGunler: string[];
  hatlar: { makineId: string; ad: string; fason: boolean }[];
  bloklar: {
    makineId: string; tur: PlanBloguTuru; is: string; emirNo: string | null; kalem: number | null; adim: string; baslangic: string; bitis: string; gecikir: boolean;
  }[];
}

// Şerit etiketi: sipariş emir noyla, satış taslağı teklif noyla bilinir (taslak kimliği yalnız siparişlerin iç anahtarıdır).
export function planSeridi(p: MotorPlani | null | undefined, teklifNolari: ReadonlyMap<string, string>): PlanSeridi | null {
  if (p === undefined || p === null) return null;
  return {
    baslangic: p.baslangic, bitis: p.bitis, kapaliGunler: p.kapaliGunler, hatlar: p.hatlar,
    bloklar: p.bloklar.map((b) => ({
      makineId: b.makineId, tur: b.tur, kalem: b.kalem, adim: b.adim, baslangic: b.baslangic, bitis: b.bitis, gecikir: b.gecikir,
      etiket: b.tur === 'siparis' ? (b.emirNo ?? b.is) : b.tur === 'satis-taslagi' ? (teklifNolari.get(b.is) ?? b.is) : TEKLIF_ETIKETI,
    })),
  };
}
export const TEKLIF_ETIKETI = 'Bu teklif';

const enGecAn = (anlar: readonly (string | null)[]): string | null =>
  anlar.reduce<string | null>((a, x) => (x === null || (a !== null && Date.parse(a) >= Date.parse(x)) ? a : x), null);

// Motor sonucunu teklifin satırlarına çevirir: kalem sırası denemeye verilen sırayla aynıdır. Kayan siparişin termini motorda
// tesis anıdır; gün olarak ilk on karakteri alınır, gecikme anla karşılaştırılır.
export function motorSonucu(satirIdleri: readonly number[], r: MotorSonucu, teklifNolari: ReadonlyMap<string, string> = new Map()): DenemeSonucu {
  return {
    planSurumu: null,
    plan: planSeridi(r.plan, teklifNolari),
    kalemler: r.kalemler.flatMap((k, i) => {
      const satirId = satirIdleri[i];
      if (satirId === undefined) return [];
      return [{
        satirId, yerlesti: k.tamam, bitis: k.bitis, planTermini: k.planTermini, malzemeTl: k.malzemeTl,
        malzemeGelisi: enGecAn(k.malzeme.map((m) => m.gelis)),
        satinalma: k.satinalma.map((a) => ({ kod: a.kod, miktar: a.miktar, birim: a.birim, gelis: a.gelis })),
        islemler: k.islemler.map((o) => ({
          opId: o.adim, tezgah: o.makineId, fason: o.fason, baslangic: o.baslangic, bitis: o.bitis, ayarSaat: o.ayarSaat, islemeSaat: o.islemeSaat, tl: o.tl,
        })),
        eksikVeri: k.eksik,
      }];
    }),
    kayanlar: r.kayan.map((x) => ({
      siparis: x.emirNo ?? x.siparis, once: x.once, sonra: x.sonra, termin: x.termin === null ? null : x.termin.slice(0, 10),
      gecikir: x.termin !== null && Date.parse(x.sonra) > Date.parse(x.termin),
    })),
  };
}

// 49: yer tutan satış taslakları motora kilitli iş olarak gider: kalem başına termin ve adım başına makine ile başlangıç.
// Satış taslağı yalnız termin çıkınca yazılır (TERMIN_CIKMADI); termini yoksa motora verilecek kalem termini de yoktur, gönderilmez.
export function motorTaslaklari(t: readonly {
  taslakId: number; gecerlilik: string; termin: string | null;
  kalemler: readonly { satirId: number; malzemeNo: number | null; adet: string }[];
  kilitler: readonly { satirId: number; opId: string; tezgah: string; baslangic: string }[];
}[]): MotorGirdisi['taslaklar'] {
  return t.flatMap((x) => {
    const termin = x.termin;
    if (termin === null) return [];
    return [{
      id: String(x.taslakId), gecerlilik: x.gecerlilik,
      kalemler: x.kalemler.flatMap((k) => (k.malzemeNo === null ? [] : [{
        malzemeNo: k.malzemeNo, adet: Number(k.adet), termin,
        yerlesim: Object.fromEntries(x.kilitler.filter((y) => y.satirId === k.satirId).map((y) => [y.opId, { makineId: y.tezgah, baslangic: y.baslangic }])),
      }])),
    }];
  });
}

// TKL-17 (49): yer tutan satış taslağı yalnız istenen termin değişince yeniden yerleşir; geçerliliği geçmişse yeri kalkmıştır.
export function yenidenYerlesirMi(mevcut: { istenenTermin: string | null; gecerli: boolean } | null, istenenTermin: string | null): boolean {
  return mevcut === null || !mevcut.gecerli || mevcut.istenenTermin !== istenenTermin;
}

// Takvimde siparişin durum adı ve kapanmışlığı (891); iptal takvime gelmez.
export const TAKVIM_SIPARIS_DURUMU: Readonly<Record<Exclude<SiparisDurumu, 'iptal'>, { ad: string; bitti: boolean }>> = {
  taslak: { ad: 'Taslak', bitti: false },
  onayli: { ad: 'Onaylı', bitti: false },
  kapandi: { ad: 'Kapandı', bitti: true },
};
