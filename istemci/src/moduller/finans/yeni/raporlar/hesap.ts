import type { z } from 'zod';
import type { ayarGuncelleGovdesi } from '#paylasilan/sozlesme/finans.ts';
import type { MakineDurumu, RozetTonu } from '../../../../ortak/arayuz/index.ts';
import type { FinansAyari } from '../donustur.ts';
import { AMORT, CATS, irr, isPnl, npv, PNL_GIDER, sum, ymAdd, ymLong, type Bilanco, type Derece, type FinansMotoru, type MotorDurumu } from '../motor.ts';
import type { SekmeAnahtari } from '../sekmeler.ts';

// Raporlar bölümünün saf hesapları (prototipte VIEWS.durum, gelirtab, arac, aysonu, karne). Ekran yalnız bunları çizer.

// Sağlık skoru rengi (prototip scoreColor): 65 ve üstü iyi, 50 ve üstü dikkat, altı risk; skor yoksa renk yok.
export const skorDurumu = (s: number | null): MakineDurumu | undefined => (s === null ? undefined : s >= 65 ? 'calisiyor' : s >= 50 ? 'durakli' : 'durdu');

// Gösterge ve not dereceleri ortak rozet tonuna (prototipte .pill ok/warn/risk/neutral).
export const DERECE_TONU: Record<Derece | 'na', RozetTonu> = { ok: 'tamam', warn: 'uyari', risk: 'hata', neutral: 'pasif', na: 'pasif' };
export const DERECE_ADI: Record<Derece, string> = { ok: 'İyi', warn: 'Dikkat', risk: 'Risk', neutral: 'Veri yok' };

// Bulgunun önem etiketi (prototip findingCard): fırsat alanı kendi adıyla.
export const onemAdi = (sev: number, alan: string): string => (alan === 'Fırsat' ? 'Fırsat' : ['', 'İzle', 'Önemli', 'Kritik'][sev] ?? '');
export const onemTonu = (sev: number, alan: string): RozetTonu => (alan === 'Fırsat' ? 'bilgi' : sev >= 3 ? 'hata' : sev === 2 ? 'uyari' : 'pasif');

// Bulgunun "İlgili ekran" bağı prototipin görünüm adıdır; yeni ekranda sekme anahtarına çevrilir (prototip ALIAS).
const BAG: Record<string, SekmeAnahtari> = {
  cari: 'firmalar', cariler: 'firmalar', cek: 'cekler', islem: 'kayitlar', kayit: 'kayitlar', nakit: 'nakit', butce: 'butce', vergi: 'vergi',
  oran: 'durum', danisman: 'durum', modeller: 'tahminler', surec: 'ay-sonu', home: 'ana-sayfa', ayar: 'ayarlar',
};
export const ilgiliSekme = (bag: string): SekmeAnahtari | null => BAG[bag] ?? null;

// Model bölümleri (Tahminler > Teknik ayrıntılar); bulgunun "Nasıl hesaplandı?" bağı buraya iner. "ratio" bir model değildir.
export const MODELLER = [
  ['mc', 'Nakit simülasyonu'], ['holt', 'Satış tahmini'], ['markov', 'Alacak tahsil modeli'],
  ['cust', 'Müşteri riski'], ['altman', 'Altman ve DuPont'], ['anom', 'Anomaliler'],
] as const;
export type ModelAnahtari = (typeof MODELLER)[number][0];
export const modelVar = (m: string | null): m is ModelAnahtari => MODELLER.some(([k]) => k === m);
export const modelCapasi = (m: ModelAnahtari): string => `m-${m}`;

// Öneri süzgeci (prototip ui.fFilter); sayılar sekmede gösterilir.
export const ONERI_SUZGECLERI = [['acik', 'Açık'], ['uygulaniyor', 'Uygulanıyor'], ['ertelendi', 'Ertelenen'], ['yoksay', 'Kapatılan'], ['tum', 'Tümü']] as const;
export type OneriSuzgeci = (typeof ONERI_SUZGECLERI)[number][0];

// Ekrandaki öneri durumu -> uç gövdesindeki durum (prototip tam kip: yoksay -> kapatildi; ertele 7 gün).
export const ONERI_UCU = '/finans/oneriler/durum';
export function oneriGovdesi(bulguKimligi: string, st: 'acik' | 'uygulaniyor' | 'ertelendi' | 'yoksay', erteleBitis: string) {
  const durum = st === 'yoksay' ? 'kapatildi' : st;
  return { bulguKimligi, durum, ...(durum === 'ertelendi' ? { erteleBitis } : {}) };
}

// Bilanço özeti ayarın parçasıdır: gövde kayıtlı ayardan kurulur, yalnız bilanço alanları değişir (prototip ayarGovdesi).
// Çapraz kur payı gönderilmez (sunucu kayıtlıyı korur). Boş ya da sıfır alan null gider (prototip `bos`).
export const AYAR_UCU = '/finans/ayar/guncelle';
const bos = (v: number): number | null => (v === 0 || Number.isNaN(v) ? null : v);
const sayiYa = (v: string | null): number | null => (v === null ? null : Number(v));
// Dönüş tipi uç gövdesinin girdisidir: alan eksik ya da fazla olursa derleme kırılır.
export function bilancoGovdesi(a: FinansAyari, b: Bilanco): z.input<typeof ayarGuncelleGovdesi> {
  return {
    sirketAdi: a.sirketAdi, sektor: a.sektor, nakitEsigi: Number(a.nakitEsigi), beklenenAylikSatis: sayiYa(a.beklenenAylikSatis), beklenenTahsilGunu: a.beklenenTahsilGunu,
    riskToleransi: a.riskToleransi, simulasyonSayisi: a.simulasyonSayisi, cekKarsiliksizOlasiligi: Number(a.cekKarsiliksizOlasiligi), batikGunu: a.batikGunu,
    anomaliEsigi: Number(a.anomaliEsigi), agirlikLikidite: a.agirlikLikidite, agirlikNakit: a.agirlikNakit, agirlikKarlilik: a.agirlikKarlilik,
    agirlikVerimlilik: a.agirlikVerimlilik, agirlikBorcluluk: a.agirlikBorcluluk,
    bilancoDonen: bos(b.donen), bilancoStok: bos(b.stok), bilancoKvb: bos(b.kvb), bilancoToplamBorc: bos(b.toplamBorc), bilancoOzkaynak: bos(b.ozkaynak), bilancoBirikmisKar: bos(b.birikmisKar),
    kurulumTamam: a.kurulumTamam, surum: a.surum,
  };
}
export const BILANCO_ALANLARI: readonly [keyof Bilanco, string, string][] = [
  ['donen', 'Dönen varlıklar', 'Aktif: I. Dönen Varlıklar'], ['stok', 'Stoklar', '15 Stoklar grubu'],
  ['kvb', 'Kısa vadeli borçlar', 'Pasif: III. Kısa Vadeli Yabancı Kaynaklar'], ['toplamBorc', 'Toplam borçlar', 'Kısa + uzun vadeli yabancı kaynaklar'],
  ['ozkaynak', 'Özkaynaklar', 'Pasif: V. Özkaynaklar'], ['birikmisKar', 'Geçmiş yıllar kârları', '57 hesap; zarar varsa eksi'],
];
export const bilancoEksik = (b: Bilanco): boolean => !(Number(b.donen) && Number(b.kvb) && Number(b.ozkaynak));

/* ---------- Gelir tablosu ---------- */
export interface GelirSatiri { ad: string; aylar: number[]; toplam: number }
export interface GelirTablosuVerisi {
  aylar: string[];
  gelirler: GelirSatiri[];
  giderler: GelirSatiri[];
  toplamGelir: GelirSatiri;
  toplamGider: GelirSatiri;
  net: GelirSatiri;
  marj: (number | null)[];
  toplamMarj: number | null;
  gider: { ad: string; tutar: number }[];
}
const satir = (ad: string, aylar: number[]): GelirSatiri => ({ ad, aylar, toplam: sum(aylar) });

// Tamamlanmış aylar, KDV hariç, fatura tarihine göre (prototip VIEWS.gelirtab); amortisman ayrı satır.
export function gelirTablosu(motor: FinansMotoru, n: number): GelirTablosuVerisi {
  const m = motor.completeMonths(n);
  const gcat: Record<string, number[]> = {}, xcat: Record<string, number[]> = {};
  for (const t of motor.durum.tx) {
    if (!isPnl(t)) continue;
    const i = m.findIndex((r) => r.ym === t.date.slice(0, 7));
    if (i < 0) continue;
    const o = t.type === 'gelir' ? gcat : xcat;
    (o[t.cat] = o[t.cat] ?? new Array<number>(n).fill(0))[i]! += t.amount;
  }
  const gelirler = CATS.gelir.filter((c) => gcat[c.k]).map((c) => satir(c.k, gcat[c.k]!));
  const giderler = PNL_GIDER.filter((k) => xcat[k]).map((k) => satir(k, xcat[k]!));
  if (m.some((r) => r.amort)) giderler.push(satir(AMORT, m.map((r) => r.amort || 0)));
  const G = m.map((r) => r.gelir), X = m.map((r) => r.gider), N = m.map((r) => r.net);
  const byCat: Record<string, number> = {};
  for (const r of m) for (const [k, v] of Object.entries(r.byCat)) byCat[k] = (byCat[k] || 0) + v;
  return {
    aylar: m.map((r) => r.ym), gelirler, giderler,
    toplamGelir: satir('Toplam gelir', G), toplamGider: satir('Toplam gider', X), net: satir('Net kâr (vergi öncesi)', N),
    marj: m.map((r) => (r.gelir ? r.net / r.gelir : null)), toplamMarj: sum(G) ? sum(N) / sum(G) : null,
    gider: Object.entries(byCat).sort((a, b) => b[1] - a[1]).map(([ad, tutar]) => ({ ad, tutar })),
  };
}

// CSV: ay, gelir, gider, net (prototip plCsv); tutar yuvarlanır.
export function gelirCsvSatirlari(motor: FinansMotoru, n: number): { basliklar: string[]; satirlar: (string | number)[][] } {
  return { basliklar: ['Ay', 'Gelir', 'Gider', 'Net kâr'], satirlar: motor.completeMonths(n).map((r) => [ymLong(r.ym), Math.round(r.gelir), Math.round(r.gider), Math.round(r.net)]) };
}

/* ---------- Karar araçları ---------- */
export type Araclar = MotorDurumu['tools'];

export function basabas(be: Araclar['be']) {
  const katki = be.price - be.varCost;
  const adet = katki > 0 ? be.fixed / katki : null;
  const guvenlik = adet && be.units ? (be.units - adet) / be.units : null;
  return { katki, adet, ciro: adet === null ? null : adet * be.price, guvenlik };
}
export function basabasEgrisi(be: Araclar['be']) {
  const katki = be.price - be.varCost, adet = katki > 0 ? be.fixed / katki : be.units, enCok = Math.max(be.units, adet) * 1.6 || 100;
  const xs = Array.from({ length: 9 }, (_, i) => Math.round(enCok * i / 8));
  return { xs, ciro: xs.map((x) => x * be.price), maliyet: xs.map((x) => be.fixed + x * be.varCost) };
}

export function yatirim(inv: Araclar['inv']) {
  const akis = [-inv.cost].concat(Array.from({ length: inv.years }, (_, i) => inv.cash + (i === inv.years - 1 ? inv.salvage : 0)));
  const nbd = npv(inv.rate / 100, akis), iko = irr(akis);
  let kum = 0, donus: number | null = null;
  for (let t = 1; t < akis.length; t++) { const once = kum; kum += akis[t]!; if (donus === null && kum >= inv.cost) donus = t - 1 + (inv.cost - once) / akis[t]!; }
  let birikim = -inv.cost;
  const bugunku = [birikim];
  for (let t = 1; t <= inv.years; t++) { birikim += (inv.cash + (t === inv.years ? inv.salvage : 0)) / Math.pow(1 + inv.rate / 100, t); bugunku.push(birikim); }
  return { nbd, iko, donus, bugunku };
}

// Aylık taksit (annüite); faiz sıfırsa eşit bölünür. Taşınabilirlik son 3 tamamlanmış ayın net nakit akışına oranla.
export function kredi(ln: Araclar['loan'], aylikAkis: number) {
  const r = ln.rate / 100;
  const taksit = r ? ln.amount * r / (1 - Math.pow(1 + r, -ln.months)) : ln.amount / ln.months;
  const oran = aylikAkis > 0 ? taksit / aylikAkis : null;
  const ton: Derece = aylikAkis <= 0 || (oran !== null && oran > 0.5) ? 'risk' : oran !== null && oran > 0.3 ? 'warn' : 'ok';
  return { taksit, toplamFaiz: taksit * ln.months - ln.amount, oran, ton };
}
export const sonUcAyAkisi = (motor: FinansMotoru): number => sum(motor.completeMonths(3), (x) => x.cashIn - x.cashOut) / 3;

/* ---------- Ay sonu kapanışı ---------- */
// Madde anahtarları sunucudaki kapanış kaydının `madde` alanıdır; sıra ve metin prototiptekidir (CLOSE_ITEMS).
export const KAPANIS_MADDELERI: readonly [string, string, string][] = [
  ['banka', 'Banka mutabakatı', 'Banka ekstresi ile kayıtlardaki bakiye eşleşiyor mu?'],
  ['kasa', 'Kasa sayımı', 'Fiziki nakit ile kasa kaydı aynı mı?'],
  ['cari', 'Cari hesap mutabakatı', 'Büyük müşteri ve tedarikçilerle bakiye teyidi (BA/BS formlarıyla tutarlılık)'],
  ['fatura', 'Eksik fatura kontrolü', 'E-fatura ve e-arşiv dahil tüm faturalar kaydedildi mi?'],
  ['cek', 'Çek ve senet portföy kontrolü', 'Vadesi gelenler tahsile verildi mi, durumlar güncel mi?'],
  ['stok', 'Stok sayımı veya kontrolü', 'Kayıttaki stok ile depodaki stok tutarlı mı?'],
  ['bordro', 'Bordro ve SGK', 'Maaş, SGK ve stopaj tutarları muhasebeye iletildi mi?'],
  ['kdv', 'KDV ön kontrolü', 'Hesaplanan ve indirilecek KDV mali müşavirin hesabıyla uyumlu mu?'],
  ['butce', 'Bütçe karşılaştırması', 'Aşılan kalemlerin nedeni not edildi mi?'],
  ['danisman', 'Danışman bulgularının gözden geçirilmesi', 'Açık kritik bulgular için sorumlu ve tarih belirlendi mi?'],
];
export const KAPANIS_UCU = '/finans/kapanis/isaretle';

// Seçilebilen üç ay (bu ay ve önceki iki); ayın ilk yarısında geçen ay açılır (prototip ui.closeYm).
export const kapanisAylari = (bugun: string): string[] => [0, -1, -2].map((k) => ymAdd(bugun.slice(0, 7), k));
export const ilkKapanisAyi = (bugun: string): string => (Number(bugun.slice(8, 10)) <= 15 ? ymAdd(bugun.slice(0, 7), -1) : bugun.slice(0, 7));
export const kapanisIlerlemesi = (isaretli: Record<string, boolean> | undefined): number => KAPANIS_MADDELERI.filter(([k]) => isaretli?.[k]).length;
