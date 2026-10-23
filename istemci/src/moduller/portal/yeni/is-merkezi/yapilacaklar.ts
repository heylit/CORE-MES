import { kalanGun, kisaTarih, once, para, sayi, sureMetni, yuzde } from '../bicim.ts';
import type { PortalIzinleri } from '../izinler.ts';
import {
  acikKalemler, belgeUyumu, cekSenet, degerler, faturaMiktari, firmaBlokta, gecerliTeklifler, gecikmeCezasi, gecikmeGunu, guncelTermin,
  ODEME_YONTEMLERI, ONAY_TURLERI, onaylayabilirMi, rfqDurumu, satinAlmaFaturalari, sevkMiktari, siparisAsamasi, sozlesmeDurumu, yoldakiler,
  type Onaylayan,
} from '../kurallar.ts';
import type { Depo, Gecmis } from '../tipler.ts';

// İş merkezinin "Yapılacaklar" listesi ve son hareketler (prototip firmTodo, firmTodoExtra, todoNeeds, events). Saf: depo, an ve kişi verilir.

export type IsTonu = 'bad' | 'warn' | '';

export interface Is {
  // Gidilecek görünüm ve kayıt.
  v: string;
  id?: string;
  tone: IsTonu;
  t: string;
  s?: string;
  w?: string;
}

export interface Adlar {
  // Firma kimliğinden ad ('firm' kurumun kendisidir).
  firma: (id: string) => string;
  kullanici: (id: string | undefined) => string;
}

export function adlarKur(d: Depo, kurumAdi: string): Adlar {
  return {
    firma: (id) => (id === 'firm' ? kurumAdi : d.parties[id]?.name ?? 'Silinmiş firma'),
    kullanici: (id) => (id === undefined ? '' : d.users[id]?.name ?? ''),
  };
}

function temelIsler(d: Depo, simdi: number, ad: Adlar): Is[] {
  const t: Is[] = [];
  const O = degerler(d.orders);
  const sonAn = (h: Gecmis[] | undefined, yedek: string): string => h?.[h.length - 1]?.at ?? yedek;
  for (const q of degerler(d.requests).filter((x) => x.status === 'new' || x.status === 'revision')) {
    t.push({ v: 'sale', id: q.id, tone: 'warn', t: (q.status === 'new' ? 'Teklif hazırlayın: ' : 'Revize teklif bekleniyor: ') + q.title, s: ad.firma(q.customerId), w: once(sonAn(q.history, q.createdAt), simdi) });
  }
  for (const q of degerler(d.requests).filter((x) => x.status === 'accepted')) {
    t.push({ v: 'sale', id: q.id, tone: '', t: `Siparişe dönüştürün: ${q.title}`, s: `${ad.firma(q.customerId)} sürüm ${String(q.acceptedVersion ?? '')} teklifini kabul etti` });
  }
  for (const r of degerler(d.rfqs).filter((x) => rfqDurumu(x, simdi) === 'evaluating')) {
    t.push({ v: 'rfq', id: r.id, tone: 'warn', t: `Kazanan tedarikçiyi seçin: ${r.title}`, s: `${String(gecerliTeklifler(d, r.id).length)} teklif geldi`, w: kisaTarih(r.deadline) });
  }
  for (const o of O.filter((x) => x.type === 'purchase' && x.termRequest?.status === 'pending')) {
    const tr = o.termRequest;
    if (tr) t.push({ v: 'order', id: o.id, tone: 'warn', t: `Termin değişikliği onayı: ${o.no}`, s: `${ad.firma(o.partyId)}, yeni tarih ${kisaTarih(tr.date)}`, w: once(tr.at, simdi) });
  }
  for (const o of O.filter((x) => x.type === 'purchase' && yoldakiler(x).length > 0)) {
    const yol = yoldakiler(o);
    t.push({ v: 'order', id: o.id, tone: '', t: `Teslim alın: ${o.no}`, s: `${ad.firma(o.partyId)}, irsaliye ${yol.map((x) => x.no).join(', ')}`, w: kisaTarih(yol[0]?.shipDate) });
  }
  for (const o of O.filter((x) => siparisAsamasi(d, x, simdi) === 'late')) {
    t.push({
      v: 'order', id: o.id, tone: 'bad', t: (o.type === 'sales' ? 'Müşteri siparişi gecikmede: ' : 'Tedarikçi gecikmesi: ') + o.no,
      s: `${ad.firma(o.partyId)}, termin ${kisaTarih(guncelTermin(o))}`, w: `${String(gecikmeGunu(o, simdi))} gün`,
    });
  }
  for (const o of O.filter((x) => x.type === 'sales' && x.items.some((_, i) => sevkMiktari(x, i) > faturaMiktari(x, i)) && yoldakiler(x).length === 0)) {
    t.push({ v: 'order', id: o.id, tone: '', t: `Faturalayın: ${o.no}`, s: `${ad.firma(o.partyId)}, teslim edilen miktar faturalanmadı` });
  }
  for (const p of degerler(d.payments).filter((x) => x.status === 'notified')) {
    t.push({ v: 'pay', id: p.id, tone: 'warn', t: `Tahsilatı onaylayın: ${para(p.amount)}`, s: `${ad.firma(p.partyId)}, ${ODEME_YONTEMLERI[p.method]}`, w: once(p.createdAt, simdi) });
  }
  for (const n of degerler(d.ncrs).filter((x) => x.kind === 'supplier' && x.status === 'answered')) {
    t.push({ v: 'ncr', id: n.id, tone: 'warn', t: `8D yanıtını değerlendirin: ${n.no}`, s: `${ad.firma(n.partyId)}, ${n.defect}` });
  }
  for (const n of degerler(d.ncrs).filter((x) => x.kind === 'customer' && x.status === 'open')) {
    t.push({ v: 'ncr', id: n.id, tone: 'bad', t: `Müşteri şikayetine yanıt verin: ${n.no}`, s: `${ad.firma(n.partyId)}, ${n.defect}`, w: sureMetni(n.dueDate, simdi) });
  }
  for (const p of degerler(d.priceReqs).filter((x) => x.status === 'pending')) {
    t.push({
      v: 'pricereq', id: p.id, tone: 'warn', t: `Fiyat güncelleme talebi: ${p.item}`,
      s: `${ad.firma(p.partyId)}, ${yuzde(((p.newPrice - p.oldPrice) / p.oldPrice) * 100)} artış`, w: `Geçerlilik ${kisaTarih(p.effectiveDate)}`,
    });
  }
  for (const p of degerler(d.payments)) {
    const c = cekSenet(p);
    const k = kalanGun(c?.dueDate, simdi);
    if (p.direction !== 'in' || p.status !== 'confirmed' || !c || c.status !== 'portfoy' || k === null || k > 7) continue;
    t.push({ v: 'pay', id: p.id, tone: k < 0 ? 'bad' : '', t: `${p.cheque ? 'Çeki' : 'Senedi'} tahsile verin: ${para(p.amount)}`, s: `${ad.firma(p.partyId)}, vade ${kisaTarih(c.dueDate)}`, w: sureMetni(c.dueDate, simdi) });
  }
  for (const x of acikKalemler(d, simdi, (o) => o.type === 'purchase').filter((k) => (k.dl ?? 0) <= 7)) {
    t.push({ v: 'order', id: x.o.id, tone: (x.dl ?? 0) < 0 ? 'bad' : 'warn', t: `Tedarikçi ödemesi: ${para(x.rest)}`, s: `${ad.firma(x.o.partyId)}, fatura ${x.v.no}`, w: sureMetni(x.v.dueDate, simdi) });
  }
  return t;
}

function ekIsler(d: Depo, simdi: number, ad: Adlar, iz: PortalIzinleri, kisi: Onaylayan | null): Is[] {
  const t: Is[] = [];
  for (const a of degerler(d.approvals).filter((x) => onaylayabilirMi(x, kisi))) {
    t.push({ v: 'approvals', tone: 'warn', t: `Onayınız bekleniyor: ${ONAY_TURLERI[a.kind]}`, s: a.title + (a.amount !== null ? `, ${para(a.amount)}` : ''), w: once(a.at, simdi) });
  }
  if (iz.var(['docs', 'partners', 'quality'])) {
    for (const b of degerler(d.docs).filter((x) => x.status === 'pending')) t.push({ v: 'party', id: b.partyId, tone: '', t: `Belge onayı: ${b.type}`, s: `${ad.firma(b.partyId)} yükledi`, w: once(b.at, simdi) });
  }
  if (iz.var('partners')) {
    for (const p of degerler(d.parties)) {
      const c = belgeUyumu(d, p.id, simdi);
      for (const b of c.expired) {
        t.push({ v: 'party', id: p.id, tone: p.type === 'supplier' ? 'bad' : 'warn', t: `${b.type} süresi doldu: ${p.name}`, s: p.type === 'supplier' ? 'Yeni satın alma siparişi blokajda' : 'Güncel belge isteyin', w: kisaTarih(b.expiresAt) });
      }
      for (const b of c.expiring) t.push({ v: 'party', id: p.id, tone: 'warn', t: `${b.type} süresi yaklaşıyor: ${p.name}`, s: 'Yenilenmiş belge isteyin', w: sureMetni(b.expiresAt, simdi) });
      for (const m of c.missing) t.push({ v: 'party', id: p.id, tone: 'bad', t: `${m} eksik: ${p.name}`, s: 'Zorunlu belge' });
    }
  }
  for (const a of degerler(d.activities)) {
    const f = a.followUp;
    const k = kalanGun(f?.date, simdi);
    if (!f || f.done || k === null || k > 2) continue;
    t.push({ v: 'party', id: a.partyId, tone: k < 0 ? 'bad' : '', t: `Takip: ${f.text}`, s: `${ad.firma(a.partyId)}, ${ad.kullanici(a.u)}`, w: sureMetni(f.date, simdi) });
  }
  for (const c of degerler(d.contracts)) {
    const st = sozlesmeDurumu(c, simdi);
    if (st === 'expiring') t.push({ v: 'contract', id: c.id, tone: 'warn', t: `Sözleşme bitiyor: ${c.title}`, s: `${ad.firma(c.partyId)}, yenileme görüşmesi başlatın`, w: sureMetni(c.endDate, simdi) });
    if (st === 'signing') t.push({ v: 'contract', id: c.id, tone: '', t: `Karşı taraf imzası bekleniyor: ${c.no}`, s: ad.firma(c.partyId) });
  }
  if (iz.var(['finance', 'purchase'])) {
    for (const x of satinAlmaFaturalari(d).filter((f) => f.m.status === 'variance')) {
      t.push({ v: 'invmatch', id: `${x.o.id}|${String(x.i)}`, tone: 'bad', t: `Fatura farkı: ${x.v.no}`, s: `${ad.firma(x.o.partyId)}, fark ${para(x.m.varGross)}`, w: kisaTarih(x.v.date) });
    }
  }
  if (iz.var('finance')) {
    for (const x of degerler(d.recons).filter((r) => r.status === 'disagreed')) {
      t.push({ v: 'recons', tone: 'bad', t: `Mutabakat farkı: ${ad.firma(x.partyId)}`, s: x.no + (x.response?.note ? `, ${x.response.note}` : '') });
    }
    for (const o of degerler(d.orders).filter((x) => x.type === 'purchase')) {
      const pc = gecikmeCezasi(d, o, simdi);
      if (pc && pc.total - pc.applied - pc.waived > 1) t.push({ v: 'order', id: o.id, tone: '', t: `Gecikme cezası değerlendirin: ${o.no}`, s: `${ad.firma(o.partyId)}, hesaplanan ${para(pc.total - pc.applied - pc.waived)}` });
    }
  }
  return t;
}

type Gerek = Parameters<PortalIzinleri['var']>[0];

const IS_IZINLERI: readonly (readonly [string, Gerek])[] = [
  ['Tedarikçi ödemesi', 'finance'], ['Faturalayın', ['sales', 'finance']], ['Gecikme cezası', 'finance'], ['Müşteri siparişi gecikmede', ['sales']],
  ['Tedarikçi gecikmesi', ['purchase', 'receive']], ['Teslim alın', ['receive', 'purchase']], ['Termin değişikliği', ['purchase']],
  ['Tahsilatı onaylayın', 'finance'], ['Çeki', 'finance'], ['Senedi', 'finance'], ['Takip', ['partners']],
];

// İşi görmek için gereken izin (prototip todoNeeds); null: herkese.
function isGeregi(d: Depo, x: Is, kisiAdi: string): Gerek | null {
  const bas = (...a: string[]) => a.some((k) => x.t.startsWith(k));
  if (bas('8D yanıtını', 'Müşteri şikayetine')) return ['quality'];
  if (bas('Belge onayı')) return ['docs', 'quality'];
  if (bas('Takip:')) return x.s !== undefined && kisiAdi !== '' && x.s.endsWith(kisiAdi) ? null : ['admin'];
  if (x.v === 'party' && /süresi doldu|süresi yaklaşıyor| eksik/.test(x.t)) {
    const p = x.id === undefined ? undefined : d.parties[x.id];
    return p?.type === 'supplier' ? ['purchase', 'quality', 'docs'] : ['sales', 'finance'];
  }
  if (x.v === 'contract') {
    const c = x.id === undefined ? undefined : d.contracts[x.id];
    return c?.type === 'sales' ? ['sales'] : ['purchase'];
  }
  return IS_IZINLERI.find(([k]) => x.t.startsWith(k))?.[1] ?? null;
}

// Görünümü açılamayan iş listeye girmez (sipariş, onay ve firma kartı ayrıca süzülür).
export function yapilacaklar(d: Depo, simdi: number, ad: Adlar, iz: PortalIzinleri, kisi: Onaylayan | null, kisiAdi: string): Is[] {
  const hepsi = [...temelIsler(d, simdi, ad), ...ekIsler(d, simdi, ad, iz, kisi)];
  return hepsi
    .filter((x) => (['approvals', 'order', 'party'].includes(x.v) ? x.v !== 'party' || iz.var(['partners', 'docs', 'quality']) : iz.gorunumAcik(x.v)))
    .filter((x) => {
      const g = isGeregi(d, x, kisiAdi);
      return g === null || iz.var(g);
    });
}

export function ozetSatiri(t: readonly Is[]): string {
  const acil = t.filter((x) => x.tone === 'bad').length;
  const bugun = t.filter((x) => x.tone === 'warn').length;
  if (t.length === 0) return 'Bekleyen işiniz yok. Yeni bir iş başlatmak için aşağıdaki kısayolları kullanın.';
  if (acil) return `${String(acil)} acil iş sizi bekliyor; toplam ${String(t.length)} açık iş var.`;
  if (bugun) return `${String(bugun)} iş yanıtınızı bekliyor; acil iş yok.`;
  return `Acil iş yok; ${String(t.length)} iş takipte.`;
}

export interface Hareket { at: string; by: string; u?: string; text: string; v: string; id?: string; label: string }

// Son hareketler: kayıtların geçmiş satırları, kişinin kendi yaptıkları dışında, yeniden eskiye.
export function sonHareketler(d: Depo, kisiKimligi: string | null, ad: Adlar): Hareket[] {
  const ev: Hareket[] = [];
  const ekle = (h: Gecmis[] | undefined, v: string, id: string, label: string) => {
    for (const x of h ?? []) ev.push({ at: x.at, by: x.by, ...(x.u === undefined ? {} : { u: x.u }), text: x.text, v, id, label });
  };
  for (const x of degerler(d.requests)) ekle(x.history, 'sale', x.id, `${x.no} ${x.title}`);
  for (const x of degerler(d.orders)) ekle(x.history, 'order', x.id, `${x.no} ${ad.firma(x.partyId)}`);
  for (const x of degerler(d.ncrs)) ekle(x.history, 'ncr', x.id, `${x.no} ${x.defect}`);
  for (const x of degerler(d.payments)) ekle(x.history, 'pay', x.id, `${x.no} ${para(x.amount)}`);
  for (const x of degerler(d.priceReqs)) ekle(x.history, 'pricereq', x.id, `${x.no} ${x.item}`);
  for (const x of degerler(d.rfqs)) ekle(x.history, 'rfq', x.id, `${x.no} ${x.title}`);
  for (const x of degerler(d.contracts)) ekle(x.history, 'contract', x.id, `${x.no} ${ad.firma(x.partyId)}`);
  for (const x of degerler(d.recons)) ekle(x.history, 'recons', x.id, x.no);
  for (const x of degerler(d.docs)) ekle(x.history, 'party', x.partyId, `${x.type}, ${ad.firma(x.partyId)}`);
  for (const x of degerler(d.approvals)) ekle(x.history, 'approvals', x.id, `${x.no} ${ONAY_TURLERI[x.kind]}`);
  for (const x of degerler(d.parties)) ekle(x.history, 'party', x.id, x.name);
  for (const b of degerler(d.bids)) {
    for (const h of b.history ?? []) {
      ev.push({ at: h.at, by: h.by, ...(h.u === undefined ? {} : { u: h.u }), text: h.text, v: 'rfq', id: b.rfqId, label: `${d.rfqs[b.rfqId]?.no ?? ''} ${ad.firma(b.supplierId)}` });
    }
  }
  for (const m of degerler(d.messages)) {
    const [tur, kimlik] = m.thread.split(':');
    const v = tur === 'req' ? 'sale' : tur === 'rfq' ? 'rfq' : tur === 'ord' ? 'order' : tur === 'ncr' ? 'ncr' : 'home';
    const kayit = tur === 'req' ? d.requests[kimlik ?? ''] : tur === 'rfq' ? d.rfqs[kimlik ?? ''] : tur === 'ord' ? d.orders[kimlik ?? ''] : tur === 'ncr' ? d.ncrs[kimlik ?? ''] : undefined;
    const baslik = kayit === undefined ? 'Kayıt' : `${kayit.no} ${'title' in kayit ? kayit.title : 'defect' in kayit ? kayit.defect : ''}`;
    ev.push({
      at: m.at, by: m.from, ...(m.u === undefined ? {} : { u: m.u }), text: `Mesaj: ${m.text.length > 80 ? `${m.text.slice(0, 80)}…` : m.text}`,
      v, ...(kimlik === undefined || v === 'home' ? {} : { id: kimlik }), label: baslik,
    });
  }
  return ev.filter((e) => e.at && (e.u ? e.u !== kisiKimligi : e.by !== 'firm')).sort((a, b) => b.at.localeCompare(a.at));
}

export function hareketYapan(h: Pick<Hareket, 'u' | 'by'>, d: Depo, ad: Adlar): string {
  const u = h.u === undefined ? undefined : d.users[h.u];
  return u ? `${u.name} (${ad.firma(h.by || u.partyId)})` : ad.firma(h.by);
}

// Bölüm ve alt görünüm sayaçları (prototip navFor).
export function menuSayaclari(d: Depo, simdi: number, kisi: Onaylayan | null): Record<string, number> {
  const O = degerler(d.orders);
  const s: Record<string, number> = {
    approvals: degerler(d.approvals).filter((a) => onaylayabilirMi(a, kisi)).length,
    sales: degerler(d.requests).filter((q) => q.status === 'new' || q.status === 'revision').length,
    sorders: O.filter((o) => o.type === 'sales' && siparisAsamasi(d, o, simdi) === 'late').length,
    purchase: degerler(d.rfqs).filter((x) => rfqDurumu(x, simdi) === 'evaluating').length,
    porders: O.filter((o) => o.type === 'purchase' && (yoldakiler(o).length > 0 || o.termRequest?.status === 'pending')).length,
    pricereqs: degerler(d.priceReqs).filter((p) => p.status === 'pending').length,
    contracts: degerler(d.contracts).filter((c) => ['expiring', 'signing', 'approval'].includes(sozlesmeDurumu(c, simdi))).length,
    docs: degerler(d.docs).filter((x) => x.status === 'pending').length + degerler(d.parties).filter((p) => p.type === 'supplier' && firmaBlokta(d, p.id, simdi)).length,
    quality: degerler(d.ncrs).filter((n) => (n.kind === 'supplier' && n.status === 'answered') || (n.kind === 'customer' && n.status === 'open')).length,
    payments: degerler(d.payments).filter((p) => p.status === 'notified').length,
    invoices: satinAlmaFaturalari(d).filter((x) => x.m.status === 'variance').length,
    recons: degerler(d.recons).filter((x) => x.status === 'disagreed').length,
  };
  return Object.fromEntries(Object.entries(s).filter(([, n]) => n > 0));
}

export const sayiMetni = (n: number): string => sayi(n, 0);
