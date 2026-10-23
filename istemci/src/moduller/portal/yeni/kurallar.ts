import {
  ayAnahtari, gunBasi, gunFarki, gunu, isoGun, kalanGun, kisaTarih, GUN_MS, type Ay,
} from './bicim.ts';
import type {
  Depo, Fatura, Firma, FirmaBelgesi, Gecmis, KatalogKalemi, Kalem, Ncr, Odeme, Onay, OnayKurallari, OnayTuru, Rfq, Siparis, SiparisTuru, Sozlesme,
  SozlesmeSatiri, TedarikciTeklifi, TeklifSurumu, TeklifTalebi,
} from './tipler.ts';

// Prototipin tarayıcıdaki hesapları (portal.html; v3 "geçersiz kılmaları" dahil) saf işlev olarak (soru 205 a). Ekran yalnız
// gösterir; koruma ve yetki kuralları sunucudadır. Her işlev depoyu ve şimdiki anı bağımsız değişken olarak alır.

export const KDV = 0.2;
const degerler = <T>(o: Readonly<Record<string, T>> | undefined): T[] => Object.values(o ?? {});
const topla = <T>(a: readonly T[], f: (x: T) => number): number => a.reduce((s, x) => s + f(x), 0);
export const yuvarla = (x: number): number => Math.round(x * 100) / 100;
const fiyat = (p: number | null): number => (p === null ? Number.NaN : p);
const sayiDegeri = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/* ---------- teklif ---------- */
export interface TeklifToplami { sub: number; disc: number; net: number; kdv: number; grand: number }

export function teklifTutari(kalemler: readonly Kalem[], fiyatlar: readonly (number | null)[], iskonto: number | undefined): TeklifToplami {
  const sub = topla(kalemler.map((it, i) => ({ it, p: fiyatlar[i] })), ({ it, p }) => it.qty * (p === null ? Number.NaN : sayiDegeri(p)));
  const disc = (sub * sayiDegeri(iskonto)) / 100;
  const net = sub - disc;
  const kdv = net * KDV;
  return { sub, disc, net, kdv, grand: net + kdv };
}

export const sonSurum = (q: TeklifTalebi): TeklifSurumu | null => (q.versions && q.versions.length > 0 ? q.versions[q.versions.length - 1] ?? null : null);

export function talepDurumu(q: TeklifTalebi, simdi: number): TeklifTalebi['status'] | 'expired' {
  if (q.status === 'quoted') {
    const v = sonSurum(q);
    const k = v ? kalanGun(v.validUntil, simdi) : null;
    if (k !== null && k < 0) return 'expired';
  }
  return q.status;
}

export function rfqDurumu(r: Rfq, simdi: number): Rfq['status'] | 'evaluating' {
  const k = kalanGun(r.deadline, simdi);
  if (r.status === 'open' && k !== null && k < 0) return 'evaluating';
  return r.status;
}

export const rfqTeklifleri = (d: Depo, rfqId: string): TedarikciTeklifi[] => degerler(d.bids).filter((b) => b.rfqId === rfqId);
export const gecerliTeklifler = (d: Depo, rfqId: string): TedarikciTeklifi[] => rfqTeklifleri(d, rfqId).filter((b) => b.status !== 'withdrawn');

/* ---------- sipariş, termin, teslimat ---------- */
export const siparisNet = (o: Siparis): number => topla(o.items, (it) => it.qty * fiyat(it.price));
export const siparisBrut = (o: Siparis): number => siparisNet(o) * (1 + (o.vat ?? KDV));
export const sevkMiktari = (o: Siparis, i: number): number => topla(o.deliveries ?? [], (t) => sayiDegeri(t.qtys[i]));
export const kabulMiktari = (o: Siparis, i: number): number =>
  topla((o.deliveries ?? []).filter((t) => t.status === 'received'), (t) => sayiDegeri((t.acceptedQtys ?? t.qtys)[i]));
export const redMiktari = (o: Siparis, i: number): number =>
  topla((o.deliveries ?? []).filter((t) => t.status === 'received'), (t) => sayiDegeri((t.rejectedQtys ?? [])[i]));
export const faturaMiktari = (o: Siparis, i: number): number => topla(o.invoices ?? [], (v) => sayiDegeri(v.qtys[i]));
export const toplamMiktar = (o: Siparis): number => topla(o.items, (it) => it.qty);
export const sevkOrani = (o: Siparis): number => Math.min(1, topla(o.items.map((_, i) => i), (i) => sevkMiktari(o, i)) / (toplamMiktar(o) || 1));
export const kabulOrani = (o: Siparis): number => Math.min(1, topla(o.items.map((_, i) => i), (i) => kabulMiktari(o, i)) / (toplamMiktar(o) || 1));
export const guncelTermin = (o: Siparis): string => o.revisedDate ?? o.promisedDate;
export const tamSevk = (o: Siparis): boolean => o.items.every((it, i) => sevkMiktari(o, i) >= it.qty);
export const tamKabul = (o: Siparis): boolean => o.items.every((it, i) => kabulMiktari(o, i) >= it.qty);
export const yoldakiler = (o: Siparis) => (o.deliveries ?? []).filter((t) => t.status === 'in_transit');
export const faturaToplami = (o: Siparis): number => topla(o.invoices ?? [], (v) => v.amount);
export const siparisOdemeleri = (d: Depo, o: Siparis): Odeme[] => degerler(d.payments).filter((p) => p.orderId === o.id);
export const odemeGecerli = (p: Odeme): boolean => p.status === 'confirmed' || p.status === 'sent';
export const odenen = (d: Depo, o: Siparis): number => topla(siparisOdemeleri(d, o).filter(odemeGecerli), (p) => p.amount);
export const bekleyenOdeme = (d: Depo, o: Siparis): number => topla(siparisOdemeleri(d, o).filter((p) => p.status === 'notified'), (p) => p.amount);
export const uygulananCeza = (o: Siparis): number => topla((o.penalties ?? []).filter((x) => x.status === 'applied'), (x) => x.amount);
export const siparisBakiyesi = (d: Depo, o: Siparis): number => Math.max(0, yuvarla(faturaToplami(o) - odenen(d, o) - uygulananCeza(o)));

export function gecikmeGunu(o: Siparis, simdi: number): number {
  if (o.status === 'cancelled' || tamSevk(o)) return 0;
  const k = kalanGun(guncelTermin(o), simdi);
  return k !== null && k < 0 ? -k : 0;
}

export type SiparisAsamasi =
  | 'cancelled' | 'approval' | 'apprej' | 'unconfirmed' | 'production' | 'late' | 'transit' | 'partial' | 'closed' | 'invoiced' | 'delivered';

export function siparisAsamasi(d: Depo, o: Siparis, simdi: number): SiparisAsamasi {
  if (o.status === 'cancelled') return 'cancelled';
  if (o.approvalState === 'pending') return 'approval';
  if (o.approvalState === 'rejected') return 'apprej';
  if (o.type === 'purchase' && !o.confirmedAt) return 'unconfirmed';
  if ((o.deliveries ?? []).length === 0) return gecikmeGunu(o, simdi) ? 'late' : 'production';
  if (yoldakiler(o).length > 0) return 'transit';
  if (!tamSevk(o)) return gecikmeGunu(o, simdi) ? 'late' : 'partial';
  if (faturaToplami(o) > 0 && siparisBakiyesi(d, o) <= 0.01) return 'closed';
  if (faturaToplami(o) > 0) return 'invoiced';
  return 'delivered';
}

export type Ton = 'iyi' | 'uyari' | 'hata' | 'bilgi' | 'notr';

export const ASAMA_ADLARI: Readonly<Record<SiparisAsamasi, readonly [string, Ton]>> = {
  approval: ['İç onay bekliyor', 'uyari'], apprej: ['Onay reddedildi', 'hata'],
  unconfirmed: ['Onay bekliyor', 'uyari'], production: ['Üretimde / hazırlanıyor', 'bilgi'], late: ['Gecikmede', 'hata'],
  partial: ['Kısmi teslim', 'uyari'], transit: ['Yolda', 'bilgi'], delivered: ['Teslim edildi', 'iyi'], invoiced: ['Faturalandı', 'iyi'],
  closed: ['Kapandı', 'iyi'], cancelled: ['İptal edildi', 'notr'],
};

export function asamaEtiketi(d: Depo, o: Siparis, simdi: number): { metin: string; ton: Ton } {
  const s = siparisAsamasi(d, o, simdi);
  const [ad, ton] = ASAMA_ADLARI[s];
  return { metin: s === 'late' ? `${ad} · ${String(gecikmeGunu(o, simdi))} gün` : ad, ton };
}

/* ---------- teslimat performansı ---------- */
export interface TeslimKaydi { o: Siparis; gecikme: number; zamaninda: boolean; miktar: number; red: number; alindi: boolean; ay: string; tam: boolean }

export function teslimKayitlari(d: Depo, suzgec?: (o: Siparis) => boolean): TeslimKaydi[] {
  const sonuc: TeslimKaydi[] = [];
  for (const o of degerler(d.orders).filter((x) => x.status !== 'cancelled' && (!suzgec || suzgec(x)))) {
    const toplam = toplamMiktar(o);
    for (const t of o.deliveries ?? []) {
      const gecikme = gunFarki(t.shipDate, o.promisedDate);
      const miktar = topla(t.qtys, sayiDegeri);
      const red = t.status === 'received' ? topla(t.rejectedQtys ?? [], sayiDegeri) : 0;
      sonuc.push({
        o, gecikme: Math.max(0, gecikme), zamaninda: gecikme <= 0, miktar, red, alindi: t.status === 'received', ay: ayAnahtari(t.shipDate),
        tam: t.status === 'received' && red === 0 && ((o.deliveries ?? []).length === 1 ? miktar >= toplam : true),
      });
    }
  }
  return sonuc;
}

export interface Performans {
  n: number; ontime: number | null; otif: number | null; avgDelay: number; qty: number; rej: number; ppm: number; rejRate: number;
}

export function performans(kayitlar: readonly TeslimKaydi[]): Performans {
  const n = kayitlar.length;
  const gec = kayitlar.filter((r) => !r.zamaninda);
  const alinan = kayitlar.filter((r) => r.alindi);
  const q = topla(alinan, (r) => r.miktar);
  const rj = topla(alinan, (r) => r.red);
  return {
    n,
    ontime: n ? (kayitlar.filter((r) => r.zamaninda).length / n) * 100 : null,
    otif: n ? (kayitlar.filter((r) => r.zamaninda && r.tam).length / n) * 100 : null,
    avgDelay: gec.length ? topla(gec, (r) => r.gecikme) / gec.length : 0,
    qty: q, rej: rj, ppm: q ? (rj / q) * 1e6 : 0, rejRate: q ? (rj / q) * 100 : 0,
  };
}

export interface TedarikciPuani extends Performans {
  nc: number; openNc: number; respDays: number | null; qScore: number; dScore: number; rScore: number; score: number | null; grade: 'A' | 'B' | 'C' | '—';
}

export function tedarikciPuani(d: Depo, tedarikciId: string): TedarikciPuani {
  const p = performans(teslimKayitlari(d, (o) => o.type === 'purchase' && o.partyId === tedarikciId));
  const nc = degerler(d.ncrs).filter((n) => n.kind === 'supplier' && n.partyId === tedarikciId);
  const openNc = nc.filter((n) => n.status !== 'closed').length;
  const yanitli = nc.filter((n): n is Ncr & { response: { at: string } } => Boolean(n.response));
  const respDays = yanitli.length ? topla(yanitli, (n) => Math.max(0, gunFarki(n.response.at, n.createdAt))) / yanitli.length : null;
  const qScore = Math.max(0, 100 - p.rejRate * 15 - openNc * 5);
  const dScore = p.otif ?? 100;
  const rScore = respDays === null ? 90 : Math.max(0, 100 - Math.max(0, respDays - 3) * 6);
  const score = p.n ? qScore * 0.4 + dScore * 0.4 + rScore * 0.2 : null;
  const grade = score === null ? '—' : score >= 88 ? 'A' : score >= 72 ? 'B' : 'C';
  return { ...p, nc: nc.length, openNc, respDays, qScore, dScore, rScore, score, grade };
}

export function aylikZamaninda(d: Depo, tur: SiparisTuru, aylar: readonly Ay[]): (number | null)[] {
  const kayitlar = teslimKayitlari(d, (o) => o.type === tur);
  return aylar.map((m) => {
    const r = kayitlar.filter((x) => x.ay === m.anahtar);
    return r.length ? (r.filter((x) => x.zamaninda).length / r.length) * 100 : null;
  });
}

/* ---------- finans: cari, yaşlandırma, nakit akışı ---------- */
export const ODEME_YONTEMLERI: Readonly<Record<Odeme['method'], string>> = {
  havale: 'Havale / EFT', cek: 'Çek', senet: 'Senet', kart: 'Kredi kartı', dbs: 'DBS', nakit: 'Nakit',
};

export function firmaFaturalari(d: Depo, firmaId: string): { o: Siparis; v: Fatura }[] {
  return degerler(d.orders).filter((o) => o.partyId === firmaId && o.status !== 'cancelled').flatMap((o) => (o.invoices ?? []).map((v) => ({ o, v })));
}

export interface EkstreSatiri {
  date: string; doc: string; desc: string; debit: number; credit: number; due?: string; pending?: boolean; view: 'order' | 'pay'; id: string; bal: number;
}

export function cariEkstre(d: Depo, firmaId: string): EkstreSatiri[] {
  const satirlar: Omit<EkstreSatiri, 'bal'>[] = [];
  for (const { o, v } of firmaFaturalari(d, firmaId)) {
    satirlar.push(v.credit
      ? { date: v.date, doc: v.no, desc: `İade / fark faturası, ${o.no}`, debit: 0, credit: -v.amount, view: 'order', id: o.id }
      : { date: v.date, doc: v.no, desc: `Fatura, ${o.no}`, debit: v.amount, credit: 0, due: v.dueDate, view: 'order', id: o.id });
  }
  for (const o of degerler(d.orders).filter((x) => x.partyId === firmaId)) {
    for (const x of (o.penalties ?? []).filter((c) => c.status === 'applied')) {
      satirlar.push({ date: gunu(x.at) ?? x.at, doc: x.no ?? 'Ceza', desc: `Gecikme cezası kesintisi, ${o.no}`, debit: 0, credit: x.amount, view: 'order', id: o.id });
    }
  }
  for (const p of degerler(d.payments).filter((x) => x.partyId === firmaId && x.status !== 'rejected' && x.status !== 'awaiting')) {
    satirlar.push({
      date: gunu(p.date ?? p.createdAt) ?? '', doc: p.no,
      desc: ODEME_YONTEMLERI[p.method] + (p.cheque ? ` no ${p.cheque.no}, vade ${kisaTarih(p.cheque.dueDate)}` : ''),
      debit: 0, credit: p.amount, pending: p.status === 'notified', view: 'pay', id: p.id,
    });
    if (p.status === 'bounced') {
      const son = p.history?.[p.history.length - 1]?.at ?? p.date ?? p.createdAt;
      satirlar.push({ date: gunu(son) ?? '', doc: p.no, desc: 'Karşılıksız çek iadesi', debit: p.amount, credit: 0, view: 'pay', id: p.id });
    }
  }
  satirlar.sort((a, b) => a.date.localeCompare(b.date));
  let bakiye = 0;
  return satirlar.map((r) => {
    if (!r.pending) bakiye += r.debit - r.credit;
    return { ...r, bal: bakiye };
  });
}

export function cariBakiye(d: Depo, firmaId: string): number {
  const r = cariEkstre(d, firmaId);
  return r.length ? r[r.length - 1]?.bal ?? 0 : 0;
}

export function tariheKadarBakiye(d: Depo, firmaId: string, gun: string): number {
  const r = cariEkstre(d, firmaId).filter((x) => x.date <= gun && !x.pending);
  return r.length ? r[r.length - 1]?.bal ?? 0 : 0;
}

export interface AcikKalem {
  o: Pick<Siparis, 'id' | 'no' | 'partyId' | 'type'>;
  v: Pick<Fatura, 'no' | 'dueDate' | 'amount'>;
  rest: number;
  dl: number | null;
  m: FaturaEslesmesi | null;
  bounced?: boolean;
}

type SiparisSuzgeci = (o: Pick<Siparis, 'type' | 'partyId'>) => boolean;

export function acikKalemler(d: Depo, simdi: number, suzgec?: SiparisSuzgeci): AcikKalem[] {
  const sonuc: AcikKalem[] = [];
  for (const o of degerler(d.orders).filter((x) => x.status !== 'cancelled' && (!suzgec || suzgec(x)))) {
    const faturalar = (o.invoices ?? []).map((v, i) => ({ v, i })).filter((x) => !x.v.credit).sort((a, b) => a.v.date.localeCompare(b.v.date));
    let kalan = odenen(d, o) + uygulananCeza(o) - topla((o.invoices ?? []).filter((v) => v.credit), (v) => v.amount);
    for (const { v, i } of faturalar) {
      const kullanilan = Math.min(kalan, v.amount);
      kalan -= kullanilan;
      const rest = yuvarla(v.amount - kullanilan);
      if (rest > 0.01) sonuc.push({ o, v, rest, dl: kalanGun(v.dueDate, simdi), m: o.type === 'purchase' ? faturaEslestir(d, o, i) : null });
    }
  }
  for (const p of degerler(d.payments)) {
    if (p.status !== 'bounced') continue;
    const tur: SiparisTuru = p.direction === 'in' ? 'sales' : 'purchase';
    if (suzgec && !suzgec({ type: tur, partyId: p.partyId })) continue;
    const gun = gunu(p.date) ?? '';
    sonuc.push({
      o: { id: p.orderId ?? '', no: p.no, partyId: p.partyId, type: 'sales' }, v: { no: p.no, dueDate: gun, amount: p.amount },
      rest: p.amount, dl: kalanGun(gun, simdi), m: null, bounced: true,
    });
  }
  return sonuc;
}

export const YASLANDIRMA_DILIMLERI = ['Vadesi gelmemiş', '1–30 gün', '31–60 gün', '60+ gün'] as const;

export function yaslandirma(kalemler: readonly AcikKalem[]): [number, number, number, number] {
  const b: [number, number, number, number] = [0, 0, 0, 0];
  for (const x of kalemler) {
    const gecen = -(x.dl ?? 0);
    const i = gecen <= 0 ? 0 : gecen <= 30 ? 1 : gecen <= 60 ? 2 : 3;
    b[i] += x.rest;
  }
  return b;
}

export const cekSenet = (p: Odeme) => p.cheque ?? p.senet;

export interface NakitTahmini { haftalar: string[]; giris: number[]; cikis: number[] }

export function nakitTahmini(d: Depo, simdi: number, haftaSayisi: number): NakitTahmini {
  const t0 = gunBasi(simdi);
  const haftalar: string[] = [];
  const giris: number[] = [];
  const cikis: number[] = [];
  for (let w = 0; w < haftaSayisi; w++) {
    haftalar.push(kisaTarih(isoGun(t0 + w * 7 * GUN_MS)));
    giris.push(0);
    cikis.push(0);
  }
  const dilim = (gun: string): number => {
    const k = Math.floor((new Date(`${gun}T12:00:00`).getTime() - t0) / GUN_MS / 7);
    return k < 0 ? 0 : k < haftaSayisi ? k : -1;
  };
  for (const x of acikKalemler(d, simdi)) {
    const k = dilim(x.v.dueDate);
    if (k < 0) continue;
    if (x.o.type === 'sales') giris[k] = (giris[k] ?? 0) + x.rest;
    else cikis[k] = (cikis[k] ?? 0) + x.rest;
  }
  for (const p of degerler(d.payments)) {
    const cs = cekSenet(p);
    const vade = cs?.dueDate;
    if (!vade) continue;
    const k = dilim(vade);
    const kalan = kalanGun(vade, simdi);
    if (k < 0 || (kalan !== null && kalan < 0)) continue;
    const durum = cs.status;
    if (p.direction === 'in' && p.status !== 'rejected' && p.status !== 'bounced' && (durum === 'portfoy' || durum === 'tahsilde')) giris[k] = (giris[k] ?? 0) + p.amount;
    if (p.direction === 'out' && p.cheque && p.cheque.status === 'verildi') cikis[k] = (cikis[k] ?? 0) + p.amount;
  }
  return { haftalar, giris, cikis };
}

// Aylık faturalanan tutar, KDV hariç.
export function aylikTutar(d: Depo, tur: SiparisTuru, aylar: readonly Ay[]): number[] {
  const siparisler = degerler(d.orders).filter((o) => o.type === tur && o.status !== 'cancelled');
  return aylar.map((m) => topla(siparisler, (o) => topla((o.invoices ?? []).filter((v) => ayAnahtari(v.date) === m.anahtar), (v) => v.amount / (1 + (o.vat ?? KDV)))));
}

/* ---------- fiyat listesi ---------- */
export function gecerliFiyat(c: KatalogKalemi, simdi: number): number | undefined {
  const g = (c.history ?? []).filter((x) => x.from <= isoGun(simdi));
  return (g[g.length - 1] ?? c.history[0])?.price;
}

export function gelecekFiyat(c: KatalogKalemi, simdi: number) {
  return (c.history ?? []).filter((x) => x.from > isoGun(simdi)).sort((a, b) => a.from.localeCompare(b.from))[0];
}

export function sonFiyatDegisimi(c: KatalogKalemi, simdi: number): number | null {
  const g = (c.history ?? []).filter((x) => x.from <= isoGun(simdi));
  const a = g[g.length - 2];
  const b = g[g.length - 1];
  if (!a || !b) return null;
  return ((b.price - a.price) / a.price) * 100;
}

/* ---------- onay motoru (TMI kuralları: sunucu/moduller/portal/kurallar.ts ile aynı yön) ---------- */
export const VARSAYILAN_KURALLAR: OnayKurallari = { payFin: 150000, discMgr: 10, priceMgr: 5, contractGM: 2000000, priceTol: 1 };

export const onayKurallari = (d: Depo): OnayKurallari => ({ ...VARSAYILAN_KURALLAR, ...(d.settings['main']?.rules ?? {}) });

export const ONAY_TURLERI: Readonly<Record<OnayTuru, string>> = {
  po: 'Satın alma siparişi', payment: 'Tedarikçi ödemesi', iban: 'IBAN değişikliği', discount: 'Teklif iskontosu', pricereq: 'Fiyat artışı', contract: 'Çerçeve sözleşme',
};

export const GENEL_MUDUR = 'Genel müdür';

export interface OnayKosulu { amount?: number; discount?: number; delta?: number; type?: SiparisTuru }

// Eşik tanımsızsa (satın alma limit tablosunda yoksa) adım istenir.
export function onayAdimlari(kurallar: OnayKurallari, tur: OnayTuru, k: OnayKosulu): string[] {
  const tutar = k.amount ?? 0;
  switch (tur) {
    case 'po': {
      const s: string[] = [];
      if (!(kurallar.poMgr !== undefined && tutar <= kurallar.poMgr)) s.push('Satın alma müdürü');
      if (!(kurallar.poGM !== undefined && tutar <= kurallar.poGM)) s.push(GENEL_MUDUR);
      return s;
    }
    case 'payment': return tutar > kurallar.payFin ? ['Finans müdürü'] : [];
    case 'iban': return ['Muhasebe', 'Finans müdürü'];
    case 'discount': return (k.discount ?? 0) > kurallar.discMgr ? ['Satış müdürü'] : [];
    case 'pricereq': return (k.delta ?? 0) > kurallar.priceMgr ? ['Satın alma müdürü'] : [];
    case 'contract': {
      const s = [k.type === 'sales' ? 'Satış müdürü' : 'Satın alma müdürü'];
      if (tutar > kurallar.contractGM) s.push(GENEL_MUDUR);
      return s;
    }
  }
}

// Kendi açtığı kayıt onay adımını atlamaz (kart #1583); yalnız genel müdürün kendi kaydında genel müdür adımı düşer.
export function adimAtla(tur: OnayTuru, adimlar: readonly string[], rol: string): string[] {
  if (tur === 'iban') return [...adimlar];
  return rol === GENEL_MUDUR ? adimlar.filter((s) => s !== GENEL_MUDUR) : [...adimlar];
}

export const siradakiAdim = (a: Onay) => (a.steps ?? []).find((s) => s.status === 'pending');

export interface Onaylayan { id: string; role: string; tmiRoller: readonly string[] }

// Çok bölümlü kişi her bölümünün adımını onaylar (tmiRoller); genel müdür her adımı. Kesin karar sunucudadır.
export function onaylayabilirMi(a: Onay, kisi: Onaylayan | null): boolean {
  if (!kisi || a.status !== 'pending') return false;
  if (a.requestedBy === kisi.id) return false;
  const s = siradakiAdim(a);
  if (!s) return false;
  if (a.steps.some((x) => x.u === kisi.id)) return false;
  return kisi.tmiRoller.includes(s.role) || kisi.role === GENEL_MUDUR;
}

// Geçmiş satırı: yapan firma ('firm') ve kişinin portal kullanıcısı. Kişi ve zaman sunucuda yeniden denetlenir ("kim yaptı" alanları).
export function gecmisEkle<T extends { history?: readonly Gecmis[] }>(kayit: T, metin: string, kullaniciKimligi: string, simdi: number): Gecmis[] {
  return [...(kayit.history ?? []), { at: new Date(simdi).toISOString(), by: 'firm', u: kullaniciKimligi, text: metin }];
}

export interface YeniOnayGirdisi {
  refCol: string; refId: string; title: string; amount: number | null; partyId?: string; steps: readonly string[]; payload?: unknown;
}

// Onay kaydı (prototip createApproval). Adım zincirini sunucu da hesaplar ve reddeder (B8); burada ekranın açılıştaki önerisidir.
export function yeniOnay(tur: OnayTuru, g: YeniOnayGirdisi, kimlik: string, no: string, kullaniciKimligi: string, simdi: number): Omit<Onay, 'surum'> {
  const an = new Date(simdi).toISOString();
  return {
    id: kimlik, no, kind: tur, refCol: g.refCol, refId: g.refId, title: g.title, amount: g.amount ?? null,
    ...(g.partyId === undefined ? {} : { partyId: g.partyId }), ...(g.payload === undefined ? {} : { payload: g.payload }),
    requestedBy: kullaniciKimligi, at: an, steps: g.steps.map((role) => ({ role, status: 'pending' as const })), status: 'pending',
    history: [{ at: an, by: 'firm', u: kullaniciKimligi, text: 'Onaya gönderildi' }],
  };
}

export function kaydinOnayi(d: Depo, koleksiyon: string, id: string): Onay | undefined {
  return degerler(d.approvals).filter((a) => a.refCol === koleksiyon && a.refId === id).sort((a, b) => b.at.localeCompare(a.at))[0];
}

/* ---------- belge uyumu ve risk ---------- */
export const BELGE_TURLERI = [
  'Vergi levhası', 'İmza sirküleri', 'Ticaret sicil gazetesi', 'Faaliyet belgesi', 'KVKK taahhütnamesi', 'ISO 9001', 'IATF 16949', 'ISO 14001', 'Diğer',
] as const;
export const ZORUNLU_BELGELER: Readonly<Record<Firma['type'], readonly string[]>> = {
  customer: ['Vergi levhası', 'İmza sirküleri'],
  supplier: ['Vergi levhası', 'İmza sirküleri', 'ISO 9001', 'KVKK taahhütnamesi'],
};

export const firmaBelgeleri = (d: Depo, firmaId: string): FirmaBelgesi[] => degerler(d.docs).filter((x) => x.partyId === firmaId);

export function belgeGecerli(b: FirmaBelgesi, simdi: number): boolean {
  if (b.status !== 'approved') return false;
  const k = kalanGun(b.expiresAt, simdi);
  return !b.expiresAt || (k !== null && k >= 0);
}

export interface BelgeUyumu {
  req: readonly string[]; missing: string[]; expired: FirmaBelgesi[]; expiring: FirmaBelgesi[]; pending: FirmaBelgesi[]; pct: number; ok: boolean;
}

export function belgeUyumu(d: Depo, firmaId: string, simdi: number): BelgeUyumu {
  const p = d.parties[firmaId];
  if (!p) return { req: [], missing: [], expired: [], expiring: [], pending: [], pct: 100, ok: true };
  const req = ZORUNLU_BELGELER[p.type] ?? [];
  const belgeler = firmaBelgeleri(d, firmaId);
  const missing: string[] = [];
  const expired: FirmaBelgesi[] = [];
  const expiring: FirmaBelgesi[] = [];
  for (const t of req) {
    const liste = belgeler.filter((x) => x.type === t);
    const gecerli = liste.filter((x) => belgeGecerli(x, simdi));
    if (gecerli.length > 0) {
      const enIyi = [...gecerli].sort((a, b) => (b.expiresAt ?? '9999').localeCompare(a.expiresAt ?? '9999'))[0];
      const k = enIyi ? kalanGun(enIyi.expiresAt, simdi) : null;
      if (enIyi?.expiresAt && k !== null && k <= 30) expiring.push(enIyi);
    } else {
      const onayli = liste.filter((x) => x.status === 'approved').sort((a, b) => (b.expiresAt ?? '').localeCompare(a.expiresAt ?? ''));
      if (onayli[0]) expired.push(onayli[0]);
      else missing.push(t);
    }
  }
  const pending = belgeler.filter((x) => x.status === 'pending');
  const tamam = req.length - missing.length - expired.length;
  return { req, missing, expired, expiring, pending, pct: req.length ? (tamam / req.length) * 100 : 100, ok: missing.length === 0 && expired.length === 0 };
}

// Blokajdaki tedarikçiye yeni satın alma siparişi açılmaz (yalnız ekranda; sunucuya taşıma ayrı iş, soru 205 a).
export function firmaBlokta(d: Depo, firmaId: string, simdi: number): boolean {
  const p = d.parties[firmaId];
  if (!p || p.type !== 'supplier') return false;
  return p.status === 'blocked' || !belgeUyumu(d, firmaId, simdi).ok;
}

export function blokNedeni(d: Depo, firmaId: string, simdi: number): string {
  const p = d.parties[firmaId];
  if (p?.status === 'blocked') return p.blockReason || 'Manuel blokaj';
  const c = belgeUyumu(d, firmaId, simdi);
  return [...c.missing.map((t) => `${t} eksik`), ...c.expired.map((x) => `${x.type} süresi doldu`)].join(', ');
}

/* ---------- sözleşme, endeks, ceza ---------- */
export function endeksSerisi(d: Depo, anahtar: string) {
  return d.settings['main']?.indexes?.[anahtar]?.values ?? [];
}

export function endeksSon(d: Depo, anahtar: string): number | null {
  const v = endeksSerisi(d, anahtar);
  return v.length ? v[v.length - 1]?.value ?? null : null;
}

export function endeksliFiyat(d: Depo, l: SozlesmeSatiri): number {
  if (!l.index || !l.index.key) return l.price;
  const guncel = endeksSon(d, l.index.key);
  if (!guncel) return l.price;
  return yuvarla(l.price * ((1 - l.index.share) + (l.index.share * guncel) / l.index.base));
}

export type SozlesmeDurumu = 'terminated' | 'approval' | 'rejected' | 'signing' | 'expired' | 'scheduled' | 'expiring' | 'active';

export function sozlesmeDurumu(c: Sozlesme, simdi: number): SozlesmeDurumu {
  if (c.terminated) return 'terminated';
  if (c.approval === 'pending') return 'approval';
  if (c.approval === 'rejected') return 'rejected';
  if (!c.signed?.firm || !c.signed?.party) return 'signing';
  const g = isoGun(simdi);
  if (g > c.endDate) return 'expired';
  if (g < c.startDate) return 'scheduled';
  const k = kalanGun(c.endDate, simdi);
  return k !== null && k <= 60 ? 'expiring' : 'active';
}

export const SOZLESME_DURUMLARI: Readonly<Record<SozlesmeDurumu, readonly [string, Ton]>> = {
  approval: ['İç onayda', 'uyari'], rejected: ['Reddedildi', 'hata'], signing: ['Karşı taraf onayı bekleniyor', 'uyari'], scheduled: ['Başlamadı', 'bilgi'],
  active: ['Yürürlükte', 'iyi'], expiring: ['Bitiyor', 'uyari'], expired: ['Süresi doldu', 'notr'], terminated: ['Feshedildi', 'notr'],
};

export const sozlesmeDegeri = (c: Sozlesme): number => topla(c.lines, (l) => l.qty * l.price);
export const sozlesmeSiparisleri = (d: Depo, c: Sozlesme): Siparis[] =>
  degerler(d.orders).filter((o) => o.contractId === c.id && o.status !== 'cancelled' && o.approvalState !== 'rejected');
export const tuketilen = (d: Depo, c: Sozlesme, l: SozlesmeSatiri): number =>
  topla(sozlesmeSiparisleri(d, c).flatMap((o) => o.items.filter((it) => it.code === l.code || it.name === l.name)), (it) => it.qty);

export function sozlesmeKullanimi(d: Depo, c: Sozlesme): number {
  const v = sozlesmeDegeri(c);
  return v ? topla(c.lines, (l) => Math.min(tuketilen(d, c, l), l.qty) * l.price) / v : 0;
}

export function sozlesmeZamani(c: Sozlesme, simdi: number): number {
  const a = new Date(c.startDate).getTime();
  const b = new Date(c.endDate).getTime();
  return Math.max(0, Math.min(1, (simdi - a) / (b - a)));
}

export function siparisSozlesmesi(d: Depo, o: Pick<Siparis, 'partyId' | 'type' | 'items'>, simdi: number): Sozlesme | undefined {
  return degerler(d.contracts).find((c) => c.partyId === o.partyId && c.type === o.type
    && ['active', 'expiring'].includes(sozlesmeDurumu(c, simdi))
    && o.items.some((it) => c.lines.some((l) => l.code && l.code === it.code)));
}

export interface CezaHesabi {
  c: Sozlesme;
  rows: { gecikme: number; deger: number; tutar: number; irsaliye: string }[];
  promise: string;
  total: number;
  cap: number;
  accruing: { gecikme: number; deger: number; tutar: number } | null;
  applied: number;
  waived: number;
}

export function gecikmeCezasi(d: Depo, o: Siparis, simdi: number): CezaHesabi | null {
  const c = o.contractId ? d.contracts[o.contractId] : undefined;
  if (!c || !c.penalty || !c.penalty.rate) return null;
  const muaf = c.penalty.grace ?? 0;
  const termin = o.termRequest?.status === 'approved' && o.revisedDate ? o.revisedDate : o.promisedDate;
  const rows: CezaHesabi['rows'] = [];
  let toplam = 0;
  for (const t of o.deliveries ?? []) {
    const gecikme = gunFarki(t.shipDate, termin) - muaf;
    if (gecikme > 0) {
      const deger = topla(o.items.map((it, i) => ({ it, i })), ({ it, i }) => sayiDegeri(t.qtys[i]) * fiyat(it.price));
      const tutar = deger * c.penalty.rate * gecikme;
      rows.push({ gecikme, deger, tutar, irsaliye: t.no });
      toplam += tutar;
    }
  }
  let accruing: CezaHesabi['accruing'] = null;
  if (!tamSevk(o) && o.status !== 'cancelled') {
    const gecikme = -(kalanGun(termin, simdi) ?? 0) - muaf;
    if (gecikme > 0) {
      const deger = topla(o.items.map((it, i) => ({ it, i })), ({ it, i }) => Math.max(0, it.qty - sevkMiktari(o, i)) * fiyat(it.price));
      accruing = { gecikme, deger, tutar: deger * c.penalty.rate * gecikme };
    }
  }
  const tavan = siparisNet(o) * c.penalty.cap;
  return {
    c, rows, promise: termin, total: yuvarla(Math.min(toplam, tavan)), cap: yuvarla(tavan), accruing,
    applied: uygulananCeza(o), waived: topla((o.penalties ?? []).filter((x) => x.status === 'waived'), (x) => x.amount),
  };
}

/* ---------- fatura: üçlü eşleştirme ---------- */
export type EslesmeDurumu = 'matched' | 'pending_grn' | 'variance' | 'approved' | 'disputed' | 'credited' | 'credit';

export interface EslesmeSatiri {
  it: Kalem; acc: number; rej: number; transit: number; invQty: number; invPrice: number | null; qtyFlag: '' | 'grn' | 'qty'; priceFlag: '' | 'price'; qv: number; pv: number;
}

export interface FaturaEslesmesi { status: EslesmeDurumu; rows: EslesmeSatiri[]; varNet: number; varGross: number; qv: number; pv: number }

const faturaSatirlari = (o: Siparis, v: Fatura) => v.lines ?? o.items.map((it, i) => ({ qty: sayiDegeri((v.qtys ?? [])[i]), price: it.price }));

export function faturaEslestir(d: Depo, o: Siparis, vi: number): FaturaEslesmesi {
  const v = (o.invoices ?? [])[vi];
  if (!v || v.credit) return { status: 'credit', rows: [], varNet: 0, varGross: 0, qv: 0, pv: 0 };
  const tol = onayKurallari(d).priceTol / 100;
  const satirlar = faturaSatirlari(o, v);
  const oncekiler = (o.invoices ?? []).slice(0, vi).filter((x) => !x.credit);
  let qv = 0;
  let pv = 0;
  let bekleyen = false;
  const rows = o.items.map((it, i): EslesmeSatiri => {
    const onceki = topla(oncekiler, (x) => sayiDegeri(faturaSatirlari(o, x)[i]?.qty));
    const L = satirlar[i] ?? { qty: 0, price: it.price };
    const acc = kabulMiktari(o, i);
    const rej = redMiktari(o, i);
    const transit = topla(yoldakiler(o), (t) => sayiDegeri(t.qtys[i]));
    const kullanilabilir = Math.max(0, acc - onceki);
    const r: EslesmeSatiri = { it, acc, rej, transit, invQty: L.qty, invPrice: L.price, qtyFlag: '', priceFlag: '', qv: 0, pv: 0 };
    const fazla = L.qty - kullanilabilir;
    if (fazla > 0.0001) {
      if (transit >= fazla) {
        bekleyen = true;
        r.qtyFlag = 'grn';
      } else {
        r.qv = (fazla - transit) * fiyat(L.price);
        r.qtyFlag = 'qty';
        qv += r.qv;
        if (transit > 0) bekleyen = true;
      }
    }
    if (it.price && L.price !== null && Math.abs(L.price - it.price) / it.price > tol) {
      r.pv = (L.price - it.price) * L.qty;
      r.priceFlag = 'price';
      pv += r.pv;
    }
    return r;
  });
  const kdv = 1 + (o.vat ?? KDV);
  const karar = v.decision?.status;
  const status: EslesmeDurumu = karar ?? (bekleyen && !qv && !pv ? 'pending_grn' : qv + pv > 0.01 ? 'variance' : bekleyen ? 'pending_grn' : 'matched');
  return { status, rows, varNet: yuvarla(qv + pv), varGross: yuvarla((qv + pv) * kdv), qv, pv };
}

export const ESLESME_DURUMLARI: Readonly<Record<EslesmeDurumu, readonly [string, Ton]>> = {
  matched: ['Eşleşti', 'iyi'], pending_grn: ['Teslim alma bekleniyor', 'uyari'], variance: ['Fark var', 'hata'], approved: ['Fark onaylandı', 'iyi'],
  disputed: ['İtiraz edildi', 'hata'], credited: ['Fark faturasıyla kapandı', 'iyi'], credit: ['İade / fark faturası', 'notr'],
};

// Fark, teslim alma bekleyen ve itirazlı fatura ödemeyi durdurur.
export const ODEMEYI_DURDURAN: readonly EslesmeDurumu[] = ['variance', 'pending_grn', 'disputed'];

export function satinAlmaFaturalari(d: Depo): { o: Siparis; v: Fatura; i: number; m: FaturaEslesmesi }[] {
  return degerler(d.orders).filter((o) => o.type === 'purchase' && o.status !== 'cancelled')
    .flatMap((o) => (o.invoices ?? []).flatMap((v, i) => (v.credit ? [] : [{ o, v, i, m: faturaEslestir(d, o, i) }])));
}

/* ---------- mutabakat ---------- */
export function babsHesabi(d: Depo, firmaId: string, ay: string): { count: number; amount: number } {
  const f = firmaFaturalari(d, firmaId).filter((x) => !x.v.credit && ayAnahtari(x.v.date) === ay);
  return { count: f.length, amount: yuvarla(topla(f, (x) => x.v.amount / (1 + (x.o.vat ?? KDV)))) };
}

/* ---------- IBAN ---------- */
export function ibanGecerli(s: string | null | undefined): boolean {
  const x = String(s ?? '').replace(/\s/g, '').toUpperCase();
  if (!/^TR\d{24}$/.test(x)) return false;
  const yeniden = x.slice(4) + x.slice(0, 4);
  let r = 0;
  for (const ch of yeniden) {
    const n = /[A-Z]/.test(ch) ? String(ch.charCodeAt(0) - 55) : ch;
    for (const h of n) r = (r * 10 + Number(h)) % 97;
  }
  return r === 1;
}

export const ibanBicimi = (s: string | null | undefined): string => String(s ?? '').replace(/\s/g, '').toUpperCase().replace(/(.{4})/g, '$1 ').trim();

export function ibanMaskesi(s: string | null | undefined): string {
  const x = String(s ?? '').replace(/\s/g, '');
  return x ? `${x.slice(0, 4)} **** **** **** ${x.slice(-6, -2)} ${x.slice(-2)}` : '—';
}

export { degerler, topla };
