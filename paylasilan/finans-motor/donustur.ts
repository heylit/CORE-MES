import type { z } from 'zod';
import type {
  amortismanCevabi, Belge, beklenenOdemelerCevabi, butceSatiri, Cek as SunucuCeki, dagilimSemasi, duzenliOdemeSemasi, esitlemeSemasi,
  faizSatiri, hesapSemasi, kapanisSatiri, kdvOraniSatiri, KurFaizOzeti, kurSatiri, mahsupSemasi, Odeme, oneriDurumuSatiri, ayarSemasi,
  SabitKiymetSatiri, skorSatiri, virmanSemasi,
} from '#paylasilan/sozlesme/finans.ts';
import type { FirmaSatiri } from '#paylasilan/sozlesme/musteri-tedarikci.ts';
import type { FinansMotoru, Islem, MotorDurumu } from './motor.ts';

// Sunucu verisi prototipin motor biçimine çevrilir: prototipte `verileriHazirla` ve `durumKur` (tam kip). Hesap ve sıra
// prototiple aynıdır; `donustur.test.ts` iki tarafı aynı girdiyle karşılaştırır.

export type Dagitim = z.output<typeof dagilimSemasi>;
export type Mahsup = z.output<typeof mahsupSemasi>;
export type Hesap = z.output<typeof hesapSemasi>;
export type Virman = z.output<typeof virmanSemasi>;
export type KurKaydi = z.output<typeof kurSatiri>;
export type KdvOrani = z.output<typeof kdvOraniSatiri>;
export type Faiz = z.output<typeof faizSatiri>;
export type DuzenliKayit = z.output<typeof duzenliOdemeSemasi>;
export type ButceKaydi = z.output<typeof butceSatiri>;
export type Esitleme = z.output<typeof esitlemeSemasi>;
export type OneriDurumu = z.output<typeof oneriDurumuSatiri>;
export type KapanisKaydi = z.output<typeof kapanisSatiri>;
export type Skor = z.output<typeof skorSatiri>;
export type FinansAyari = z.output<typeof ayarSemasi>;
export type AmortismanAyi = z.output<typeof amortismanCevabi>['aylar'][number];
export type BeklenenOdeme = z.output<typeof beklenenOdemelerCevabi>['odemeler'][number];
export type { Belge, Odeme, SunucuCeki, SabitKiymetSatiri, FirmaSatiri };

// Sunucudan okunan bütün finans verisi (prototipte `finans-yukle` cevabı); analiz bütün geçmişi ister.
export interface FinansHamVerisi {
  belgeler: Belge[];
  odemeler: Odeme[];
  dagitimlar: Dagitim[];
  mahsuplar: Mahsup[];
  cekler: SunucuCeki[];
  hesaplar: Hesap[];
  virmanlar: Virman[];
  kurlar: KurKaydi[];
  kdvOranlari: KdvOrani[];
  faizler: Faiz[];
  duzenliOdemeler: DuzenliKayit[];
  butce: ButceKaydi[];
  esitlemeler: Esitleme[];
  oneriler: OneriDurumu[];
  kapanis: KapanisKaydi[];
  skorlar: Skor[];
  sabitKiymetler: SabitKiymetSatiri[];
  firmalar: FirmaSatiri[];
  ayar: FinansAyari;
  amortisman: AmortismanAyi[];
  kurOzeti: KurFaizOzeti;
  beklenenOdemeler: BeklenenOdeme[];
  sirketAdi: string | null;
}

export const KAT = {
  urun_satisi: 'Ürün satışı', hizmet_geliri: 'Hizmet geliri', diger_gelir: 'Diğer gelir', kur_farki_geliri: 'Kur farkı geliri',
  mal_alimi: 'Mal / hammadde alımı', personel: 'Personel (net maaş)', sgk_stopaj: 'SGK & stopaj', kira: 'Kira', enerji: 'Enerji & faturalar',
  lojistik: 'Lojistik', pazarlama: 'Pazarlama', faiz: 'Finansman (faiz)', diger_gider: 'Diğer gider', kdv_vergi: 'KDV / vergi ödemesi',
  kredi_anapara: 'Kredi anapara', kur_farki_gideri: 'Kur farkı gideri',
  satis_iadesi: 'Satış iadesi', alis_iadesi: 'Alış iadesi',
} as const;
export type KategoriKodu = keyof typeof KAT;
export const KAT_KOD: Record<string, KategoriKodu> = Object.fromEntries(Object.entries(KAT).map(([k, v]) => [v, k as KategoriKodu]));
export const HESAP_TURU_ADI: Record<Hesap['tur'], string> = { kasa: 'Kasa', banka: 'Banka', kredi_karti: 'Kredi kartı' };
export const TEVKIFATLAR: readonly (readonly [string, string])[] = [['', 'Tevkifat yok'], ['2/10', '2/10'], ['3/10', '3/10'], ['4/10', '4/10'], ['5/10', '5/10'], ['7/10', '7/10'], ['9/10', '9/10']];

export const sayi = (v: unknown): number => Number(v) || 0;
export const yuvarla = (v: number): number => Math.round(v * 100) / 100;
const kategoriAdi = (k: string): string => KAT[k as KategoriKodu];

export interface HazirVeri extends Omit<FinansHamVerisi, 'kurlar' | 'faizler'> {
  firmaById: Map<number, FirmaSatiri>;
  etiket: Map<number, string>;
  etiketten: Map<string, number>;
  // Para birimi başına güncel kur (FNS-57): o güne kadarki son elle girilen kur; yoksa kayıtların kendi kuru.
  kurlar: Record<string, { tarih: string | null; kur: number }>;
  belgeById: Map<number, Belge>;
  odemeById: Map<number, Odeme>;
  cekById: Map<number, SunucuCeki>;
  hesapById: Map<number, Hesap>;
  duzenliById: Map<number, DuzenliKayit>;
  kurlar_listesi: KurKaydi[];
  faizler: Record<string, Faiz>;
  faizler_listesi: Faiz[];
}

export function verileriHazirla(d: FinansHamVerisi, bugun: string): HazirVeri {
  const firmaById = new Map(d.firmalar.map((f) => [f.id, f]));
  const adSayisi: Record<string, number> = {};
  for (const f of d.firmalar) adSayisi[f.ad] = (adSayisi[f.ad] || 0) + 1;
  const etiket = new Map(d.firmalar.map((f) => [f.id, adSayisi[f.ad]! > 1 ? `${f.ad} · ${f.kod || '#' + f.id}` : f.ad]));
  const etiketten = new Map([...etiket.entries()].map(([id, e]) => [e, id]));
  const kurlar: HazirVeri['kurlar'] = {};
  for (const k of d.kurlar) {
    const o = kurlar[k.paraBirimi];
    if (k.tarih <= bugun && (!o || (o.tarih !== null && o.tarih < k.tarih))) kurlar[k.paraBirimi] = { tarih: k.tarih, kur: sayi(k.kur) };
  }
  for (const x of [...d.belgeler, ...d.odemeler, ...d.cekler]) if (x.paraBirimi !== 'TRY' && !kurlar[x.paraBirimi]) kurlar[x.paraBirimi] = { tarih: null, kur: sayi(x.kur) };
  return {
    ...d, firmaById, etiket, etiketten, kurlar,
    belgeById: new Map(d.belgeler.map((b) => [b.id, b])), odemeById: new Map(d.odemeler.map((o) => [o.id, o])),
    cekById: new Map(d.cekler.map((c) => [c.id, c])), hesapById: new Map(d.hesaplar.map((h) => [h.id, h])),
    duzenliById: new Map(d.duzenliOdemeler.map((r) => [r.id, r])),
    kurlar_listesi: [...d.kurlar].sort((a, b) => (a.tarih < b.tarih ? -1 : 1)),
    faizler: gecerliFaizler(d.faizler, bugun), faizler_listesi: [...d.faizler].sort((a, b) => b.id - a.id),
  };
}

// O güne kadar başlamış son oran geçerlidir; aynı güne ikinci giriş öncekini düzeltir (sonra girilen kazanır).
export function gecerliFaizler(liste: readonly Faiz[], bugun: string): Record<string, Faiz> {
  const s: Record<string, Faiz> = {};
  for (const f of liste) {
    if (f.gecerlilikBaslangic > bugun) continue;
    const o = s[f.paraBirimi];
    if (!o || o.gecerlilikBaslangic < f.gecerlilikBaslangic || (o.gecerlilikBaslangic === f.gecerlilikBaslangic && o.id < f.id)) s[f.paraBirimi] = f;
  }
  return s;
}

// İade satırı asıl faturayı anar (260 a); siparişe bağlı satış ve alış faturası işaretlenir.
export function belgeAciklamasi(V: HazirVeri, b: Belge): string {
  if (b.tur === 'acilis') return 'Açılış bakiyesi';
  const bagli = b.satinAlmaSiparisi || b.siparisId ? ' (siparişe bağlı)' : '';
  if (b.tur === 'iade') {
    const asil = b.iadeBelgeId === null ? undefined : V.belgeById.get(b.iadeBelgeId);
    return `İade: ${asil ? asil.belgeNo || asil.aciklama || '#' + asil.id : '#' + String(b.iadeBelgeId)}${b.aciklama ? ' · ' + b.aciklama : ''}${bagli}`;
  }
  return (b.aciklama || b.belgeNo || (b.yon === 'gelir' ? 'Satış faturası' : 'Alış faturası')) + bagli;
}
export const firmaEtiketi = (V: HazirVeri, id: number | null | undefined): string | null =>
  (id === null || id === undefined ? null : V.etiket.get(id) || `#${id}`);
export const tlKuru = (V: HazirVeri, pb: string): number | null => (pb === 'TRY' ? 1 : V.kurlar[pb] ? V.kurlar[pb].kur : null);
const nakitYontemi = (o: Odeme): boolean => ['nakit', 'banka', 'kredi_karti'].includes(o.yontem);

export function hesapToplamiTl(V: HazirVeri): number {
  return V.hesaplar.reduce((t, h) => { const k = tlKuru(V, h.paraBirimi); return t + (k === null ? 0 : sayi(h.bakiye) * k); }, 0);
}

// Motor durumunu kurar ve motora verir. Belge parçalara bölünür: her dağıtım ve mahsup kapanan parça, kalan açık parça.
// Tutarlar TL'dir; tevkifatlı belgede KDV oranı, KDV dahil tutar belge toplamına eşit olacak biçimde etkin orandır.
export function durumKur(V: HazirVeri, motor: FinansMotoru): MotorDurumu {
  const bugun = motor.bugun;
  const s = motor.normalize(motor.emptyState());
  const a = V.ayar;
  s.company = { name: V.sirketAdi ?? a.sirketAdi, openingCash: 0, openingDate: '1900-01-01', threshold: sayi(a.nakitEsigi), expSales: sayi(a.beklenenAylikSatis), expTerm: a.beklenenTahsilGunu ?? 30 };
  s.settings = {
    sector: a.sektor, riskTol: a.riskToleransi, sims: a.simulasyonSayisi, chequeRisk: sayi(a.cekKarsiliksizOlasiligi), writeOffDays: a.batikGunu,
    anomalyZ: sayi(a.anomaliEsigi), weights: { likidite: a.agirlikLikidite, nakit: a.agirlikNakit, karlilik: a.agirlikKarlilik, verimlilik: a.agirlikVerimlilik, borcluluk: a.agirlikBorcluluk },
  };
  s.balance = { donen: sayi(a.bilancoDonen), stok: sayi(a.bilancoStok), kvb: sayi(a.bilancoKvb), toplamBorc: sayi(a.bilancoToplamBorc), ozkaynak: sayi(a.bilancoOzkaynak), birikmisKar: sayi(a.bilancoBirikmisKar) };
  s.setupDone = a.kurulumTamam;
  s.amort = Object.fromEntries(V.amortisman.map((x) => [x.ay, sayi(x.tutarTl)]));
  const dagitimlar: Record<number, Dagitim[]> = {}, mahsuplar: Record<number, { tutar: string; tarih: string; id: number }[]> = {};
  for (const x of V.dagitimlar) if (!x.iptal) (dagitimlar[x.belgeId] = dagitimlar[x.belgeId] ?? []).push(x);
  for (const m of V.mahsuplar) {
    if (m.iptal) continue;
    (mahsuplar[m.satisBelgeId] = mahsuplar[m.satisBelgeId] ?? []).push({ tutar: m.satisTutari, tarih: m.tarih, id: m.id });
    (mahsuplar[m.alisBelgeId] = mahsuplar[m.alisBelgeId] ?? []).push({ tutar: m.alisTutari, tarih: m.tarih, id: m.id });
  }
  for (const b of V.belgeler) {
    if (b.durum === 'iptal') continue;
    const kur = sayi(b.kur), toplam = sayi(b.toplam), netTl = sayi(b.tutar) * kur, toplamTl = sayi(b.toplamTl);
    const kdv = netTl > 0 ? (toplamTl / netTl - 1) * 100 : 0;
    const temel = {
      type: b.yon, cat: kategoriAdi(b.kategori), party: firmaEtiketi(V, b.firmaId) || kategoriAdi(b.kategori), kdv, due: b.vade, date: b.belgeTarihi, np: b.tur === 'acilis',
      desc: belgeAciklamasi(V, b),
      _belgeId: b.id, paraBirimi: b.paraBirimi,
    };
    const parca = (oran: number): number => yuvarla(netTl * oran);
    for (const x of dagitimlar[b.id] ?? []) {
      const o = V.odemeById.get(x.odemeId), nakit = o ? nakitYontemi(o) : false;
      s.tx.push({ ...temel, id: `b${b.id}-d${x.id}`, amount: parca(sayi(x.belgeTutari) / toplam), status: nakit ? 'odendi' : 'cek', paidDate: nakit ? x.tarih : null });
    }
    for (const m of mahsuplar[b.id] ?? []) s.tx.push({ ...temel, id: `b${b.id}-m${m.id}`, amount: parca(sayi(m.tutar) / toplam), status: 'cek', paidDate: null });
    if (sayi(b.kalan) > 0.004) s.tx.push({ ...temel, id: `b${b.id}`, amount: parca(sayi(b.kalan) / toplam), status: 'acik', paidDate: null });
  }
  // Dağıtılmamış nakit ödeme avanstır (FNS-17): kâr/zarara girmez, nakde girer.
  for (const o of V.odemeler) {
    if (o.iptal || !nakitYontemi(o) || sayi(o.kalan) <= 0.004) continue;
    const avans: Islem = {
      id: `o${o.id}`, _odemeId: o.id, type: o.yon, cat: o.yon === 'gelir' ? 'Diğer gelir' : 'Diğer gider', party: firmaEtiketi(V, o.firmaId) || 'Avans',
      desc: 'Avans (faturaya dağıtılmamış)', amount: yuvarla(sayi(o.kalan) * sayi(o.kur)), kdv: 0, date: o.tarih, due: o.tarih, status: 'odendi', paidDate: o.tarih, np: true,
    };
    s.tx.push(avans);
  }
  for (const c of V.cekler) {
    if (c.durum === 'iptal') continue;
    s.cheques.push({
      id: `c${c.id}`, _cekId: c.id, dir: c.yon, kind: c.tur === 'senet' ? 'Senet' : 'Çek', party: firmaEtiketi(V, c.firmaId), bank: c.banka || '—', no: c.seriNo || '—',
      date: c.duzenlemeTarihi, due: ['tahsil', 'odendi'].includes(c.durum) && c.sonucTarihi ? c.sonucTarihi : c.vade, amount: sayi(c.tutarTl), status: c.durum,
    });
  }
  for (const r of V.duzenliOdemeler) if (r.aktif) s.recurring.push({ id: `r${r.id}`, _duzenliId: r.id, name: r.ad, cat: kategoriAdi(r.kategori), amount: sayi(r.tutar), kdv: sayi(r.kdvOrani), day: r.ayinGunu });
  const buAy = bugun.slice(0, 7) + '-01', gecerli: Record<string, ButceKaydi> = {};
  for (const x of V.butce) { const o = gecerli[x.kategori]; if (x.baslangicAyi <= buAy && (!o || o.baslangicAyi < x.baslangicAyi)) gecerli[x.kategori] = x; }
  for (const [k, x] of Object.entries(gecerli)) { if (k === 'satis_hedefi') s.revenueTarget = sayi(x.aylikTutar); else s.budget[kategoriAdi(k)] = sayi(x.aylikTutar); }
  for (const k of V.kapanis) { const donem = s.closing[k.donem] = s.closing[k.donem] ?? {}; donem[k.madde] = k.isaretli; }
  for (const o of V.oneriler) s.reco[o.bulguKimligi] = { st: o.durum === 'kapatildi' ? 'yoksay' : o.durum, until: o.erteleBitis };
  s.history = V.skorlar.map((x) => ({ d: x.gun, score: x.skor, cash: sayi(x.nakit), src: 'sunucu' }));
  motor.durum = s;
  // Bugünkü nakit hesapların toplamıdır (FNS-29): açılış, motorun kendi akışı bu toplama denk gelecek biçimde kurulur.
  const akis = motor.cashToday();
  s.company.openingCash = yuvarla(hesapToplamiTl(V) - akis);
  motor.degisti();
  return s;
}
