/**
 * TMI taşıyıcısı: Satın Alma Merkezi'nin ekranları değişmeden TMI CORE'a bağlanır (kullanıcı kararı, sürüm 6).
 * Açılış `GET /satin-alma-acilis`; yazma kayıt türüne göre TMI komutu. Ekranın İngilizce veri biçimi ile TMI'nin Türkçe
 * sözleşmesi arasındaki eşleme yalnız burada. Kural sunucuda denetlenir; burası yalnız taşır.
 */
import type {
  AcilisCevabi, Ayarlar, KatalogKaydetYazimi, KatalogKaydi, SatinAlmaUclari, SiparisCikisi, Talep, TalepGovdesi, Tedarikci,
} from '#paylasilan/sozlesme/satin-alma.ts';
import type { FirmaCevabi, FirmaEkleGovdesi } from '#paylasilan/sozlesme/musteri-tedarikci.ts';
import type { SiparisIrsaliyeleriCevabi, SonPartilerCevabi } from '#paylasilan/sozlesme/stok.ts';
import { eskiSurumMu } from '#paylasilan/hata.ts';
import { ApiHatasi, api } from '../../../ortak/veri/api.ts';
import { tekrarKorumaliGonder, yeniIstekKimligi, yenidenDenenebilirMi, type Deneme } from '../../../ortak/veri/istek-kimligi.ts';
import { ucCagrisi } from '../../../ortak/veri/uc-cagrisi.ts';
import { FIRMA_KARTLARI, S, applyLocal, notify, scheduleRender, type Backend, type Coll, type Entity, type Transport } from './store.ts';
import type {
  AppUser, Approval, Award, AwardOrder, Currency, ExcessLine, Material, Priority, PurchaseRequest, Quality, Quote, RequestStatus, Settings, SimScenario,
  Supplier, SupplierStatus,
} from './tipler.ts';

const uc = ucCagrisi<SatinAlmaUclari>();
// Cevap bu sürede gelmezse istek kesilir (TMI kalıbı; modülün sabiti).
export const ISTEK_ZAMAN_ASIMI_MS = 15_000;
const sure = { zamanAsimiMs: ISTEK_ZAMAN_ASIMI_MS };
// Sunucuda tekrar korumalı uca (talep açma, katalog kaydı) tek kimlikle gider; cevabı yitirilen gönderim aynı
// kimlikle yeniden denenir, komut en çok bir kez uygulanır.
export const korumali = <T>(gonder: (deneme: Deneme) => Promise<T>, istekKimligi?: string): Promise<T> =>
  tekrarKorumaliGonder(gonder, { zamanAsimiMs: ISTEK_ZAMAN_ASIMI_MS, ...(istekKimligi ? { istekKimligi } : {}) });

/* ---------------- değer eşlemesi ---------------- */
const DURUM: Record<RequestStatus, Talep['durum']> = {
  draft: 'taslak', rfq: 'teklif_isteniyor', eval: 'degerlendirme', approval: 'onayda', ordered: 'siparis_verildi', received: 'teslim_alindi', cancelled: 'iptal',
};
const ONCELIK: Record<Priority, Talep['oncelik']> = { low: 'dusuk', normal: 'normal', urgent: 'acil' };
// 236 a: tedarikçinin onay durumu Kalite Merkezi'nindir; ekranın durumu ondan türer ve yazılmaz. "Aday" ve "Askıda" tedarikçiye sipariş
// verilmez (ekranda askıda işareti); kaydı olmayan tedarikçi engellenmez.
const KALITE_EKRAN_DURUMU: Record<NonNullable<Tedarikci['kaliteDurumu']>, SupplierStatus> = { 'Onaylı': 'approved', 'Şartlı onaylı': 'trial', 'Aday': 'suspended', 'Askıda': 'suspended' };
const ters = <A extends string, B extends string>(r: Record<A, B>) => Object.fromEntries(Object.entries(r).map(([a, b]) => [b, a])) as Record<B, A>;
const DURUM_T = ters(DURUM);
const ONCELIK_T = ters(ONCELIK);
const KALITE_T: Record<'sorunsuz' | 'kismi_sorun' | 'red_iade', Quality> = { sorunsuz: 'ok', kismi_sorun: 'partial', red_iade: 'rejected' };

// Ekran sayıyla çalışır; sunucuya ondalık metin gider (bilimsel gösterim yok, sondaki sıfırlar atılır).
const ond = (n: number, basamak = 4): string => {
  const m = n.toFixed(basamak);
  return m.includes('.') ? m.replace(/0+$/, '').replace(/\.$/, '') : m;
};
const ondN = (n: number | null | undefined, basamak = 4): string | null => (n === null || n === undefined || Number.isNaN(n) ? null : ond(n, basamak));
const sayi = (d: string | null | undefined): number | null => (d === null || d === undefined ? null : Number(d));
const tarihN = (d: string | undefined | null): string | null => (d ? d : null);
const ms = (iso: string): number => (iso ? Date.parse(iso) : Date.now());

/* ---------------- sunucudan ekrana ---------------- */
// Ekranın göremediği sunucu bilgileri: kayıt yazılırken geri konur.
const talepSunucu = new Map<string, { talepEden: number; kararVeren: number | null; surum: number }>();
const sunucudaki = { suppliers: new Set<string>(), materials: new Set<string>() };

function kullaniciEkle(id: number | null, ad: string | null): string {
  if (id === null) return '';
  const k = String(id);
  if (!S.users[k] && ad !== null) S.users[k] = { id: k, email: '', name: ad };
  return k;
}

export function talepEkrana(t: Talep): PurchaseRequest {
  talepSunucu.set(t.id, { talepEden: t.talepEdenKisiId ?? 0, kararVeren: t.karar?.kararVerenKisiId ?? null, surum: t.surum });
  kullaniciEkle(t.talepEdenKisiId, t.talepEdenAdi);
  const k = t.karar;
  const siparisi = (qid: string | null) => k?.siparisler.find((x) => x.teklifId === qid);
  // Teslim bilgisi stoktaki mal kabulden (SAT-38): bütün satırlar tam kabul edilince son kabul tarihi; kalite GKK'dan.
  const teslimTarihi = (x: SiparisCikisi): string => (x.teslimDurumu === 'tamam' ? x.satirlar.map((r) => r.sonTeslimTarihi ?? '').sort().at(-1) ?? '' : '');
  const tekSiparis = k?.mod === 'tek' ? siparisi(k.teklifId) : undefined;
  const fazlasi = (x: SiparisCikisi): ExcessLine[] => x.satirlar.flatMap((r) => r.fazlaTeslim === null ? [] : [{
    item: t.kalemler.find((i) => i.id === r.kalemId)?.ad ?? '', qty: Number(r.fazlaTeslim), unit: r.birim,
  }]);
  const award: Award | null = k === null ? null : {
    mode: k.mod === 'tek' ? 'single' : 'split',
    quoteId: k.teklifId,
    splits: Object.fromEntries(k.bolunme.map((b) => [b.kalemId, b.teklifId])),
    reason: k.gerekce,
    by: k.kararVerenAdi ?? '',
    decidedAt: k.kararTarihi,
    approvals: t.onaylar.map((o): Approval => ({
      id: o.id, at: ms(o.zaman), by: kullaniciEkle(o.kisiId, o.kisiAdi), name: o.kisiAdi ?? '', decision: o.sonuc === 'onay' ? 'approved' : 'rejected', note: o.notlar,
    })),
    lessons: k.ogrenilenler,
    fx: Object.fromEntries(k.sabitKurlar.map((s) => [s.paraBirimi, Number(s.kur)])),
    ...(tekSiparis ? {
      orderNo: tekSiparis.no ?? '', poNo: tekSiparis.siparisNo, orderDate: tekSiparis.siparisTarihi ?? '', expectedDate: tekSiparis.beklenenTeslim ?? '',
      deliveredDate: teslimTarihi(tekSiparis), excess: fazlasi(tekSiparis), ...(tekSiparis.kalite ? { quality: KALITE_T[tekSiparis.kalite] } : {}),
      logo: tekSiparis.logo,
    } : {}),
    lines: k.siparisler.flatMap((x) => x.satirlar.map((r) => ({ id: r.id, itemId: r.kalemId, quoteId: x.teklifId }))),
    ...(k.mod === 'bolunmus' ? {
      orders: Object.fromEntries(k.siparisler.map((s): [string, AwardOrder] => [s.teklifId, {
        orderNo: s.no ?? '', poNo: s.siparisNo, orderDate: s.siparisTarihi ?? '', expectedDate: s.beklenenTeslim ?? '', deliveredDate: teslimTarihi(s),
        quality: s.kalite ? KALITE_T[s.kalite] : '', excess: fazlasi(s), logo: s.logo,
      }])),
    } : {}),
  };
  return {
    id: t.id, no: t.no, title: t.baslik, department: t.birim ?? '', requester: t.talepEdenAdi ?? '', priority: ONCELIK_T[t.oncelik],
    needDate: t.ihtiyacTarihi ?? '', notes: t.notlar, status: DURUM_T[t.durum], ...(t.iptalNedeni ? { cancelReason: t.iptalNedeni } : {}), teslimYontemi: t.teslimYontemi,
    uretimEmriId: t.uretimEmriId, uretimEmriNo: t.uretimEmriNo,
    weights: t.agirliklar === null ? null : { cost: t.agirliklar.maliyet, lead: t.agirliklar.termin, supplier: t.agirliklar.tedarikci, warranty: t.agirliklar.garanti },
    items: t.kalemler.map((i) => ({ id: i.id, materialId: i.katalogId, name: i.ad, spec: i.ozellik, qty: sayi(i.miktar), unit: i.birim, category: i.kategori })),
    rfqs: t.teklifIstekleri.map((r) => ({ supplierId: String(r.firmaId), sentAt: r.gonderim, dueDate: r.sonTarih ?? '' })),
    quotes: t.teklifler.map((q): Quote => ({
      id: q.id, supplierId: q.firmaId === null ? '' : String(q.firmaId), supplierName: q.tedarikciAdi, date: q.teklifTarihi, validUntil: q.gecerlilik ?? '',
      currency: q.paraBirimi, fxRate: sayi(q.kur), prices: Object.fromEntries(q.fiyatlar.map((f) => [f.kalemId, Number(f.birimFiyat)])),
      discountPct: Number(q.iskontoYuzdesi), shipping: Number(q.nakliye), otherCost: Number(q.digerMasraf), deliveryTerm: q.teslimSekli,
      deliveryIncluded: q.nakliyeDahil, leadDays: q.terminGun, payDays: q.vadeGun, advancePct: Number(q.avansYuzdesi), warrantyMonths: q.garantiAy,
      compliant: q.teknikUygun, note: q.notlar, ...(q.ilkToplam !== null ? { firstTotal: Number(q.ilkToplam) } : {}), revisions: q.revizyon,
    })),
    award,
    log: t.hareketler.map((h) => ({ id: h.id, at: ms(h.zaman), by: kullaniciEkle(h.kisiId, h.kisiAdi), t: h.metin })),
    scenarios: t.senaryolar.map((s): SimScenario => {
      const alloc: Record<string, Record<string, number>> = {};
      for (const p of s.paylar) (alloc[p.kalemId] ??= {})[p.teklifId] = Number(p.miktar);
      return {
        id: s.id, name: s.ad, alloc, itemBal: Object.fromEntries(s.dengeler.map((d) => [d.kalemId, sayi(d.denge)])), createdAt: ms(s.olusturma),
        by: kullaniciEkle(s.kisiId, s.kisiAdi),
      };
    }),
    createdAt: ms(t.olusturma), updatedAt: ms(t.guncelleme), version: t.surum,
  };
}

export function tedarikciEkrana(t: Tedarikci): Supplier {
  const id = String(t.firmaId);
  sunucudaki.suppliers.add(id);
  return {
    id, name: t.ad, categories: t.kategoriler, contact: t.yetkili ?? '', phone: t.telefon ?? '', email: t.eposta ?? '', city: t.sehir ?? '',
    taxNo: t.vergiNo ?? '', status: t.kaliteDurumu === null ? 'approved' : KALITE_EKRAN_DURUMU[t.kaliteDurumu], kaliteDurumu: t.kaliteDurumu, active: t.firmaAktif, rating: t.puan, notes: t.notlar,
    evals: t.degerlendirmeler.map((d) => ({ id: d.id, date: d.tarih, rating: d.puan, text: d.metin, name: d.degerlendiren, by: kullaniciEkle(d.kisiId, d.kisiAdi) })),
    createdAt: ms(t.olusturma), version: t.surum,
  };
}

function katalogEkrana(k: KatalogKaydi): Material {
  sunucudaki.materials.add(k.id);
  return {
    id: k.id, code: k.kod, name: k.ad, category: k.kategori, unit: k.birim, spec: k.ozellik, notes: k.notlar, aliases: k.takmaAdlari, malzemeNo: k.malzemeNo,
    createdAt: ms(k.olusturma), version: k.surum,
  };
}

// SA2: ad, kategori ve birim malzeme kartındadır; katalog yalnız kartı ve kendi alanlarını yazar.
export function katalogSunucuya(m: Material, surum: number | null): KatalogKaydetYazimi {
  if (m.malzemeNo === undefined) throw new Error('Katalog kalemi bir malzeme kartına bağlanmalı.');
  return { id: m.id, malzemeNo: m.malzemeNo, ozellik: m.spec ?? '', notlar: m.notes ?? '', takmaAdlari: m.aliases ?? [], surum };
}

function ayarEkrana(a: Ayarlar): Settings {
  const currencies = Object.fromEntries(a.kurlar.map((k) => [k.paraBirimi, { rate: sayi(k.kur), monthly: sayi(k.aylikFaizYuzdesi) ?? 0 }])) as Settings['currencies'];
  return {
    company: a.sirket, currencies,
    weights: { cost: a.agirliklar.maliyet, lead: a.agirliklar.termin, supplier: a.agirliklar.tedarikci, warranty: a.agirliklar.garanti },
    validityDays: a.gecerlilikGun, minQuotes: a.enAzTeklif, priceAlertPct: Number(a.fiyatUyariYuzdesi), ratesDate: a.kurTarihi ?? '',
    categories: a.kategoriler, departments: a.birimler.map((b) => ({ name: b.ad, budget: Number(b.yillikButce) })),
    approvalLimits: a.onayLimitleri.map((l) => ({ max: sayi(l.azamiTutar), role: l.seviye })), version: a.surum,
  };
}

/* ---------------- ekrandan sunucuya ---------------- */
export function talepSunucuya(r: PurchaseRequest): TalepGovdesi {
  const sun = talepSunucu.get(r.id);
  const a = r.award ?? null;
  const benim = S.me ? Number(S.me.id) : null;
  // Siparişte yalnız satın almanın alanları gider; teslim ve kalite stoktan ve GKK'dan okunur, yazılmaz.
  const siparis = (qid: string, o: Partial<AwardOrder>) => ({
    teklifId: qid, siparisNo: o.poNo ?? '', siparisTarihi: tarihN(o.orderDate), beklenenTeslim: tarihN(o.expectedDate),
  });
  const siparisler = a === null ? [] : a.mode === 'split'
    ? Object.entries(a.orders ?? {}).filter(([, o]) => !!(o.poNo || o.orderDate || o.expectedDate)).map(([qid, o]) => siparis(qid, o))
    : a.quoteId && (a.poNo || a.orderDate || a.expectedDate)
      ? [siparis(a.quoteId, { poNo: a.poNo ?? '', orderDate: a.orderDate ?? '', expectedDate: a.expectedDate ?? '' })]
      : [];
  return {
    id: r.id, baslik: r.title.trim() || 'Adsız talep', birim: r.department || null, talepEdenKisiId: sun?.talepEden || null,
    oncelik: ONCELIK[r.priority], ihtiyacTarihi: tarihN(r.needDate), notlar: r.notes ?? '', durum: DURUM[r.status], iptalNedeni: r.cancelReason ?? '', uretimEmriId: r.uretimEmriId ?? null,
    agirliklar: r.weights ? { maliyet: r.weights.cost, termin: r.weights.lead, tedarikci: r.weights.supplier, garanti: r.weights.warranty } : null,
    kalemler: r.items.map((i) => ({
      id: i.id, katalogId: i.materialId ?? null, ad: i.name.trim() || 'Adsız kalem', ozellik: i.spec ?? '', miktar: ondN(i.qty), birim: i.unit || 'adet', kategori: i.category ?? '',
    })),
    teklifIstekleri: (r.rfqs ?? []).map((q) => ({ firmaId: Number(q.supplierId), gonderim: q.sentAt, sonTarih: tarihN(q.dueDate) })),
    teklifler: (r.quotes ?? []).map((q) => ({
      id: q.id, firmaId: q.supplierId ? Number(q.supplierId) : null, tedarikciAdi: q.supplierName ?? '', teklifTarihi: q.date, gecerlilik: tarihN(q.validUntil),
      paraBirimi: q.currency, kur: q.currency === 'TRY' ? null : ondN(q.fxRate, 6), iskontoYuzdesi: ond(q.discountPct || 0, 3), nakliye: ond(q.shipping || 0),
      digerMasraf: ond(q.otherCost || 0), teslimSekli: q.deliveryTerm ?? '', nakliyeDahil: q.deliveryIncluded, terminGun: q.leadDays, vadeGun: q.payDays || 0,
      avansYuzdesi: ond(q.advancePct || 0, 3), garantiAy: q.warrantyMonths, teknikUygun: q.compliant, notlar: q.note ?? '',
      ilkToplam: ondN(q.firstTotal ?? null), revizyon: q.revisions ?? 0,
      fiyatlar: Object.entries(q.prices ?? {}).filter(([, p]) => typeof p === 'number' && !Number.isNaN(p)).map(([kalemId, p]) => ({ kalemId, birimFiyat: ond(p) })),
    })),
    karar: a === null ? null : {
      mod: a.mode === 'single' ? 'tek' : 'bolunmus', teklifId: a.mode === 'single' ? a.quoteId : null,
      bolunme: a.mode === 'split' ? Object.entries(a.splits ?? {}).map(([kalemId, teklifId]) => ({ kalemId, teklifId })) : [],
      gerekce: a.reason ?? '', kararVerenKisiId: sun?.kararVeren ?? benim, kararTarihi: a.decidedAt, ogrenilenler: a.lessons ?? '',
      sabitKurlar: Object.entries(a.fx ?? {}).filter(([c]) => c !== 'TRY').map(([c, k]) => ({ paraBirimi: c as Currency, kur: ond(k, 6) })),
      siparisler,
    },
    // Onay ve geçmiş yalnız eklenir: kişi ve zaman sunucunun.
    onaylar: (a?.approvals ?? []).map((o) => ({
      id: o.id, zaman: '', kisiId: null, kisiAdi: null, sonuc: o.decision === 'approved' ? 'onay' : 'ret', dortGozsuz: false, notlar: o.note ?? '',
    })),
    hareketler: (r.log ?? []).map((h) => ({ id: h.id, zaman: '', kisiId: null, kisiAdi: null, metin: h.t })),
    senaryolar: (r.scenarios ?? []).map((s) => ({
      id: s.id, ad: s.name, kisiId: null, kisiAdi: null, olusturma: new Date(s.createdAt).toISOString(),
      paylar: Object.entries(s.alloc).flatMap(([kalemId, q]) => Object.entries(q).map(([teklifId, m]) => ({ kalemId, teklifId, miktar: ond(m) }))),
      dengeler: Object.entries(s.itemBal ?? {}).map(([kalemId, d]) => ({ kalemId, denge: ondN(d) })),
    })),
  };
}

/* ---------------- yazma kuyruğu ----------------
   Sonucu bilinmeyen hatada (ağ, zaman aşımı, 5xx) değişiklik atılmaz (S-07): kuyrukta kalır, ekranda "kaydedilmedi" görünür,
   bağlantı dönünce ya da artan beklemeyle yeniden gönderilir. Tekrar korumalı yazım (talep açma, katalog kaydı) aynı gövde ve
   aynı kimlikle yeniden gider (S-09): kimlik başka gövdeyle gelirse sunucu reddeder, ilk gönderim uygulanmışsa ikinci kez
   yazılmaz. Sürümlü kayıtta en yeni hâl gider. Sunucunun reddettiği (4xx) değişiklik bugünkü gibi bırakılır, ekran yenilenir. */
type Veri = Entity | Settings | null;
interface Belirsiz { d: Veri; kimlik: string }
interface Bekleyen { mesgul: boolean; sonraki: Veri | undefined; belirsiz: Belirsiz | null }
const Q = new Map<string, Bekleyen>();
export const YENIDEN_DENEME_MS = [2_000, 5_000, 15_000, 30_000] as const;

function write(coll: Coll | 'settings', id: string, data: Veri): void {
  const anahtar = `${coll}:${id}`;
  const w = Q.get(anahtar) ?? { mesgul: false, sonraki: undefined, belirsiz: null };
  Q.set(anahtar, w);
  w.sonraki = data;
  if (!w.mesgul) void kuyruk(coll, id, w);
}

const korumaliYazimMi = (coll: Coll | 'settings', id: string, d: Veri): boolean =>
  d !== null && ((coll === 'requests' && !talepSunucu.has(id)) || coll === 'materials');

async function kuyruk(coll: Coll | 'settings', id: string, w: Bekleyen): Promise<void> {
  w.mesgul = true;
  let deneme = 0;
  while (w.belirsiz !== null || w.sonraki !== undefined) {
    let is: Belirsiz;
    if (w.belirsiz !== null && (w.sonraki === undefined || korumaliYazimMi(coll, id, w.belirsiz.d))) is = w.belirsiz;
    else { is = { d: w.sonraki as Veri, kimlik: yeniIstekKimligi() }; w.sonraki = undefined; }
    w.belirsiz = null;
    try {
      await yaz(coll, id, is.d, is.kimlik);
      deneme = 0;
      kayitDurumu(true);
    } catch (h) {
      if (yenidenDenenebilirMi(h)) {
        w.belirsiz = is;
        kayitDurumu(false);
        await baglantiyiBekle(YENIDEN_DENEME_MS[Math.min(deneme, YENIDEN_DENEME_MS.length - 1)]!);
        deneme += 1;
        continue;
      }
      w.sonraki = undefined;
      await hata(h);
    }
  }
  w.mesgul = false;
}

const bekleyenVarMi = (): boolean => [...Q.values()].some((w) => w.belirsiz !== null);
// Topbar'daki uyarı: bekleyen değişiklik varken görünür; yeniden çizim yalnız içerik alanını değiştirir, uyarıyı silmez.
function kayitDurumu(gitti: boolean): void {
  const ilk = S.online;
  S.online = gitti && !bekleyenVarMi();
  const el = document.getElementById('kayit-uyari');
  if (el) { el.hidden = S.online; el.textContent = S.online ? '' : 'Kaydedilmedi; bağlantı dönünce gönderilecek'; }
  if (ilk && !S.online) notify('Sunucuya ulaşılamadı; değişiklik kaydedilmedi, bağlantı dönünce gönderilecek.');
}
function baglantiyiBekle(ms: number): Promise<void> {
  return new Promise((coz) => {
    const bitti = () => { clearTimeout(z); window.removeEventListener('online', bitti); coz(); };
    const z = setTimeout(bitti, ms);
    window.addEventListener('online', bitti);
  });
}

async function yaz(coll: Coll | 'settings', id: string, d: Veri, kimlik: string): Promise<void> {
  if (coll === 'settings') {
    const s = d as Settings;
    const a = await uc.post('/satin-alma-ayarlari/kaydet', { govde: {
      sirket: s.company ?? '', agirliklar: { maliyet: s.weights.cost, termin: s.weights.lead, tedarikci: s.weights.supplier, garanti: s.weights.warranty },
      gecerlilikGun: s.validityDays, enAzTeklif: s.minQuotes, fiyatUyariYuzdesi: ond(s.priceAlertPct),
      // Kur ve faiz finansındır (SA3 a, 937 b): yalnız para birimi listesi gider.
      kurlar: (Object.keys(s.currencies) as Currency[]).map((c) => ({ paraBirimi: c })),
      kategoriler: s.categories, birimler: s.departments.map((b) => ({ ad: b.name, yillikButce: ond(b.budget, 2) })),
      onayLimitleri: s.approvalLimits.map((l) => ({ azamiTutar: ondN(l.max, 2), seviye: l.role })), surum: s.version ?? 1,
    }, ...sure });
    applyLocal('settings', id, ayarEkrana(a));
    return;
  }
  if (coll === 'requests') {
    const sun = talepSunucu.get(id);
    if (d === null) {
      if (sun) await uc.post('/satin-alma-talepleri/:id/sil', { parametre: { id }, govde: { surum: sun.surum }, ...sure });
      talepSunucu.delete(id);
      return;
    }
    const g = talepSunucuya(d as PurchaseRequest);
    const t = sun === undefined
      ? await korumali((deneme) => uc.post('/satin-alma-talepleri/ac', { ...deneme, govde: g }), kimlik)
      : await uc.post('/satin-alma-talepleri/:id/kaydet', { parametre: { id }, govde: { ...g, surum: sun.surum }, ...sure });
    applyLocal('requests', id, talepEkrana(t));
    return;
  }
  if (coll === 'materials') {
    const m = d as Material | null;
    const surum = (S.materials[id]?.version ?? 1);
    if (m === null) {
      if (sunucudaki.materials.has(id)) await uc.post('/satin-alma-katalogu/:id/sil', { parametre: { id }, govde: { surum }, ...sure });
      sunucudaki.materials.delete(id);
      return;
    }
    const govde = katalogSunucuya(m, sunucudaki.materials.has(id) ? (m.version ?? 1) : null);
    const k = await korumali((deneme) => uc.post('/satin-alma-katalogu/kaydet', { ...deneme, govde }), kimlik)
    applyLocal('materials', id, katalogEkrana(k));
    return;
  }
  // Tedarikçi: firma kartı finansındır, orada düzenlenir; burada seçilir ya da ortak listeye açılır (firmaEkle). Ekrandaki kimlik firma kimliğidir.
  // Satın alma yalnız kendi alanlarını (puan, not, kategori, değerlendirme) yazar; onay durumu Kalite Merkezi'nindir.
  const s = d as Supplier | null;
  if (s === null) {
    if (sunucudaki.suppliers.has(id)) await uc.post('/satin-alma-tedarikcileri/:id/sil', { parametre: { id: Number(id) }, ...sure });
    sunucudaki.suppliers.delete(id);
    return;
  }
  const yeni = !sunucudaki.suppliers.has(id);
  const firmaId = Number(id);
  const t = await uc.post('/satin-alma-tedarikcileri/kaydet', { govde: {
    firmaId, puan: s.rating, notlar: s.notes ?? '', kategoriler: s.categories ?? [],
    degerlendirmeler: (s.evals ?? []).map((e) => ({ id: e.id, tarih: e.date, puan: e.rating, metin: e.text ?? '', degerlendiren: e.name ?? '' })),
    surum: yeni ? null : (s.version ?? 1),
  }, ...sure });
  applyLocal('suppliers', String(t.firmaId), tedarikciEkrana(t));
}

async function hata(h: unknown): Promise<void> {
  if (h instanceof ApiHatasi && eskiSurumMu(h.govde)) {
    notify('Bu kayıt bu arada başka biri tarafından değiştirildi. Güncel hâli yüklendi; değişikliğinizi tekrar yapın.');
  } else if (h instanceof ApiHatasi && h.durum < 500) {
    notify(h.message);
  } else {
    S.online = false;
    notify('Sunucuya ulaşılamadı; değişiklik kaydedilemedi.');
  }
  // Ekran sunucunun gerçek hâline döner: reddedilen değişiklik ekranda kalmaz.
  try { await yukle(); } catch { scheduleRender(); }
}

/* ---------------- yükleme ---------------- */
const kimlikle = <T extends { id: string }>(l: T[]): Record<string, T> => Object.fromEntries(l.map((x) => [x.id, x]));

async function yukle(): Promise<void> {
  const a: AcilisCevabi = await uc.get('/satin-alma-acilis', sure);
  talepSunucu.clear(); sunucudaki.suppliers.clear(); sunucudaki.materials.clear();
  S.users = {};
  const ben: AppUser = { id: String(a.kullanici.id), email: '', name: a.kullanici.ad };
  S.users[ben.id] = ben;
  S.me = ben;
  S.requests = kimlikle(a.talepler.map(talepEkrana));
  S.suppliers = kimlikle(a.tedarikciler.map(tedarikciEkrana));
  FIRMA_KARTLARI.splice(0, FIRMA_KARTLARI.length, ...a.firmaKartlari.map((f) => ({ id: String(f.id), ad: f.ad })));
  S.materials = kimlikle(a.katalog.map(katalogEkrana));
  S.settings = ayarEkrana(a.ayarlar);
  // Henüz gitmemiş değişiklik sunucudan gelen hâlin üstünde kalır: yeniden yükleme onu ekrandan silmez (S-07).
  for (const [anahtar, w] of Q) {
    const d = w.sonraki !== undefined ? w.sonraki : w.belirsiz?.d;
    if (d === undefined) continue;
    const [coll, id] = [anahtar.slice(0, anahtar.indexOf(':')) as Coll | 'settings', anahtar.slice(anahtar.indexOf(':') + 1)];
    if (coll === 'settings') S.settings = d as Settings;
    else if (d === null) delete S[coll][id];
    else (S[coll] as Record<string, Entity>)[id] = d as Entity;
  }
  S.ready = true; S.online = !bekleyenVarMi(); S.ver++;
  scheduleRender();
}

const backend: Backend = {
  // Veri sunucuda; kenar çubuğunda tarayıcı notu yok.
  statusHTML: () => '',
  // TCMB'den kur çekme kalkar: TMI'de dış servis çağrısı yok (kırmızı çizgi). Elle kur girişi kalır.
  tcmb: false,
  exportData: () => Promise.reject(new Error('Yedek TMI tarafından alınır.')),
  importData: () => Promise.reject(new Error('Yedekten geri yükleme TMI tarafından yapılır.')),
  deleteSamples: () => Promise.reject(new Error('Örnek veri yok.')),
  fetchTcmb: () => Promise.reject(new Error('Dış servis çağrısı yok.')),
  async firmaAra(metin) {
    const c = await uc.get('/satin-alma-firma-secenekleri', { sorgu: { ara: metin }, ...sure });
    return c.firmalar.map((f) => ({ id: String(f.id), ad: f.ad, tedarikci: f.tedarikci }));
  },
  async firmaEkle(kimlik, g) {
    const govde: FirmaEkleGovdesi = { ad: g.ad, tur: 'tedarikci', vergiNo: g.vergiNo, il: g.il, telefon: g.telefon, ePosta: g.ePosta };
    const c = await korumali((deneme) => api.post<FirmaCevabi>('/musteri-tedarikci/firmalar/ekle', govde, {
      istekKimligi: deneme.istekKimligi, zamanAsimiMs: deneme.zamanAsimiMs, ...(deneme.sinyal ? { sinyal: deneme.sinyal } : {}),
    }), kimlik);
    return { id: String(c.firma.id), ad: c.firma.ad };
  },
  async malzemeAra(metin) {
    const c = await uc.get('/satin-alma-malzeme-secenekleri', { sorgu: { ara: metin }, ...sure });
    return c.malzemeler;
  },
  async siparisKalemiDegistir(id, kalemId, miktar, birim, gerekce) {
    const sun = talepSunucu.get(id);
    if (sun === undefined) return false;
    try {
      const t = await uc.post('/satin-alma-talepleri/:id/siparis-kalemi-degistir', { parametre: { id }, govde: { kalemId, miktar: ond(miktar), birim, gerekce, surum: sun.surum }, ...sure });
      applyLocal('requests', id, talepEkrana(t));
      return true;
    } catch (h) {
      await hata(h);
      return false;
    }
  },
  async teslimYontemi(id, teslimYontemi) {
    const sun = talepSunucu.get(id);
    if (sun === undefined) return false;
    try {
      const t = await uc.post('/satin-alma-talepleri/:id/teslim-yontemi', { parametre: { id }, govde: { teslimYontemi, surum: sun.surum }, ...sure });
      applyLocal('requests', id, talepEkrana(t));
      return true;
    } catch (h) {
      await hata(h);
      return false;
    }
  },
  async siparisKapat(id, teklifId, gerekce) {
    const sun = talepSunucu.get(id);
    if (sun === undefined) return false;
    try {
      const t = await uc.post('/satin-alma-talepleri/:id/siparis-kapat', { parametre: { id }, govde: { teklifId, gerekce, surum: sun.surum }, ...sure });
      applyLocal('requests', id, talepEkrana(t));
      return true;
    } catch (h) {
      await hata(h);
      return false;
    }
  },
  async siparisFaturalari(talepId, teklifId) {
    try {
      return (await uc.get('/satin-alma-siparis-faturalari', { sorgu: { talepId, teklifId }, ...sure })).faturalar;
    } catch (h) {
      await hata(h);
      return null;
    }
  },
  async siparisBelgeleri(satirId) {
    try {
      return (await uc.get('/satin-alma-siparis-satirlari/:id/belgeler', { parametre: { id: satirId }, ...sure })).belgeler;
    } catch (h) {
      await hata(h);
      return null;
    }
  },
  async siparisBelgesiEkle(satirId, kimlik, govde) {
    try {
      return (await korumali((deneme) => uc.post('/satin-alma-siparis-satirlari/:id/belge-ekle', { ...deneme, parametre: { id: satirId }, govde }), kimlik)).belgeler;
    } catch (h) {
      await hata(h);
      return null;
    }
  },
  async siparisBelgesiKaldir(satirId, belgeId) {
    try {
      return (await uc.post('/satin-alma-siparis-satirlari/:id/belgeler/:belgeId/kaldir', { parametre: { id: satirId, belgeId }, ...sure })).belgeler;
    } catch (h) {
      await hata(h);
      return null;
    }
  },
  async malzemePartileri(malzemeNo) {
    try {
      return (await api.get<SonPartilerCevabi>(`/stok/malzemeler/${malzemeNo}/son-partiler`, sure)).partiler;
    } catch (h) {
      await hata(h);
      return null;
    }
  },
  async siparisTakibi(talepId) {
    try {
      return await uc.get('/satin-alma-talepleri/:id/siparis-takibi', { parametre: { id: talepId }, ...sure });
    } catch (h) {
      await hata(h);
      return null;
    }
  },
  // Plan talebin sürümüyle yazılır ve sürümü bir artırır: sonraki kayıt eski sürümle gitmesin diye yerel sürüm de artar.
  async odemePlaniKaydet(talepId, teklifId, satirlar) {
    const sun = talepSunucu.get(talepId);
    if (sun === undefined) return null;
    try {
      const c = await uc.post('/satin-alma-talepleri/:id/odeme-plani', { parametre: { id: talepId }, govde: { teklifId, satirlar, surum: sun.surum }, ...sure });
      sun.surum += 1;
      return c;
    } catch (h) {
      await hata(h);
      return null;
    }
  },
  async siparisIrsaliyeleri(siparisSatirIdler) {
    try {
      return (await api.get<SiparisIrsaliyeleriCevabi>(`/stok/siparis-irsaliyeleri?siparisSatirlari=${siparisSatirIdler.join(',')}`, sure)).irsaliyeler;
    } catch (h) {
      await hata(h);
      return null;
    }
  },
  // Kopan bağlantıda aynı kimlikle yinelenir; sunucu ilk cevabı verir, geçmişe ikinci satır yazılmaz.
  async siparisFaturasiBagla(talepId, teklifId, belgeId, bagla) {
    try {
      const c = await korumali((deneme) => uc.post('/satin-alma-talepleri/:id/siparis-faturasi', { ...deneme, parametre: { id: talepId }, govde: { teklifId, belgeId, bagla } }));
      return c.faturalar;
    } catch (h) {
      await hata(h);
      return null;
    }
  },
};

export const transport: Transport = {
  async init() {
    try {
      await yukle();
    } catch (h) {
      const el = document.getElementById('main');
      if (el) el.innerHTML = h instanceof ApiHatasi && h.durum === 403
        ? '<div class="panel"><div class="empty"><h3>Satın almaya erişiminiz yok</h3><p>Yetki için yöneticinize başvurun.</p></div></div>'
        : '<div class="panel"><div class="empty"><h3>Sunucuya bağlanılamadı</h3><p>Biraz sonra sayfayı yenileyin.</p></div></div>';
    }
  },
  async yenile() {
    try { await yukle(); } catch { /* bağlantı yoksa eldeki görünüm kalır; yazma yolu durumu ayrıca bildirir */ }
  },
  write,
  // Sayfa kapanırken bekleyen yazma sıradan gönderilir (TMI isteği keepalive taşımaz; kayıp riski V-37).
  writeOnUnload: (coll, id, data) => write(coll, id, data),
  canWrite: () => S.ready,
  backend,
};
