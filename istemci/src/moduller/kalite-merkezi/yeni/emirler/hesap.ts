import type { Emir, Lot, Muayene, Ncr } from '../tipler.ts';
import type { KmVerisi } from '../veri.ts';


export interface EmirBaglari { lot: Lot[]; insp: Muayene[]; ncr: Ncr[] }

// Lot, muayene ve NCR kayıtları iş emrine numarayla bağlanır (kayıttaki "İş emri / sipariş" alanı).
export function emirBaglari(veri: KmVerisi, no: unknown): EmirBaglari {
  const k = String(no ?? '').trim();
  if (!k) return { lot: [], insp: [], ncr: [] };
  return {
    lot: veri.lot.filter((l) => l.tip !== 'reset' && (l.emir === k || l.siparis === k)),
    insp: veri.insp.filter((i) => i.emir === k),
    ncr: veri.ncr.filter((n) => n.emir === k),
  };
}

export function retSayisi(b: EmirBaglari): number {
  return b.lot.filter((l) => l.karar === 'Ret').length + b.insp.filter((i) => i.sonuc === 'Ret').length;
}

export interface IzSatiri { tarih?: string; kol: 'lot' | 'insp' | 'ncr'; kimlik: string; no?: string; tur: string; durum?: string; ayrinti: string }

export function izlenebilirlik(b: EmirBaglari): IzSatiri[] {
  return [
    ...b.lot.map((l): IzSatiri => ({ tarih: l.tarih, kol: 'lot', kimlik: l._id, no: l.no, tur: 'Lot kabul', durum: l.karar, ayrinti: `N ${l.N ?? ''}` })),
    ...b.insp.map((i): IzSatiri => ({ tarih: i.tarih, kol: 'insp', kimlik: i._id, no: i.no, tur: `${i.tur ?? ''} muayene`, durum: i.sonuc, ayrinti: i.lot ? `lot ${i.lot}` : '' })),
    ...b.ncr.map((n): IzSatiri => ({ tarih: n.tarih, kol: 'ncr', kimlik: n._id, no: n.no, tur: 'NCR', durum: n.durum, ayrinti: n.hataTipi ?? '' })),
  ].sort((a, b) => (a.tarih ?? '').localeCompare(b.tarih ?? ''));
}

export const emirSirasi = (liste: readonly Emir[]): Emir[] => [...liste].sort((a, b) => (b.termin ?? '').localeCompare(a.termin ?? ''));
export const emirAranan = (x: Emir): string => [x.no, x.parcaNo, x.parcaAdi, x.musteri, x.proje].join(' ');

const sayi = (v: string | undefined): number | null => {
  const x = parseFloat(String(v ?? '').replace(',', '.'));
  return Number.isNaN(x) ? null : x;
};

export type CsvSonucu = { hata: string } | { kayitlar: Partial<Emir>[]; atlanan: number };

// ERP'den alınan liste: ayırıcı ilk satırdan (; sekme ,), başlık adları Türkçe ya da İngilizce olabilir.
// Numarası boş ya da zaten kayıtlı satır atlanır.
export function emirCsvAyristir(metin: string, mevcut: readonly Emir[]): CsvSonucu {
  const satirlar = metin.split(/\r?\n/).filter((x) => x.trim());
  if (satirlar.length < 2) return { hata: 'Dosya boş.' };
  const ayirici = [';', '\t', ','].find((s) => satirlar[0]!.includes(s)) ?? ';';
  const temiz = (x: string) => x.replace(/^"|"$/g, '').trim();
  const H = satirlar[0]!.split(ayirici).map((x) => temiz(x).toLocaleLowerCase('tr'));
  const sutun = (re: RegExp) => H.findIndex((h) => re.test(h));
  const ix = {
    no: sutun(/^(no|numara|iş emri|is emri|sipariş|siparis|order)/), pn: sutun(/parça|parca|part|malzeme kodu/),
    ad: sutun(/ad|tanım|tanim|description/), mk: sutun(/miktar|adet|qty|quantity/), tr: sutun(/termin|teslim|tarih|date/), tip: sutun(/tür|tur|tip|type/),
  };
  if (ix.no < 0 || ix.pn < 0) return { hata: 'Başlıkta en az "no" ve "parça no" sütunları olmalı.' };
  const kayitli = new Set(mevcut.map((x) => x.no));
  const kayitlar: Partial<Emir>[] = [];
  let atlanan = 0;
  for (const s of satirlar.slice(1)) {
    const c = s.split(ayirici).map(temiz);
    const no = c[ix.no];
    if (!no || kayitli.has(no)) { atlanan++; continue; }
    let tr = ix.tr >= 0 ? c[ix.tr] ?? '' : '';
    const m = /^(\d{1,2})[./](\d{1,2})[./](\d{4})$/.exec(tr);
    if (m) tr = `${m[3]}-${m[2]!.padStart(2, '0')}-${m[1]!.padStart(2, '0')}`;
    const tipHam = ix.tip >= 0 ? c[ix.tip] ?? '' : '';
    const tip = /sat/i.test(tipHam) ? 'Satınalma siparişi' : /müş|mus|cust/i.test(tipHam) ? 'Müşteri siparişi' : 'İş emri';
    kayitlar.push({
      no, tip, durum: 'Açık', parcaNo: c[ix.pn] ?? '', parcaAdi: ix.ad >= 0 ? c[ix.ad] ?? '' : '',
      miktar: ix.mk >= 0 ? sayi(c[ix.mk]) : null, termin: /^\d{4}-\d{2}-\d{2}$/.test(tr) ? tr : '',
    });
  }
  return { kayitlar, atlanan };
}
