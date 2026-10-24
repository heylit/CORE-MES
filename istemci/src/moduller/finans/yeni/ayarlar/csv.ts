import type { z } from 'zod';
import type { topluSatir } from '#paylasilan/sozlesme/finans.ts';
import type { CsvDegeri } from '../../../../ortak/veri/csv.ts';

// Prototipin CSV ice aktarimi (parseCSV, csvToTx) saf islev olarak; toplu-aktar govdesi bugunku bicimde kurulur.
// Durum ve odeme tarihi sutunlari okunur ama sunucuya gitmez: toplu aktarim yalniz acik belge acar (FNS-50).

export type TopluSatir = z.input<typeof topluSatir>;
export type Yon = 'gelir' | 'gider';
export interface CsvSonucu { ok: TopluSatir[]; bad: string[] }

const iki = (n: string) => n.padStart(2, '0');
const yuvarla = (v: number) => Math.round(v * 100) / 100;

export function csvSatirlari(metin: string): string[][] {
  const text = metin.replace(/^﻿/, '');
  const ilk = text.split(/\r?\n/)[0] ?? '';
  const ayrac = (ilk.match(/;/g) ?? []).length >= (ilk.match(/,/g) ?? []).length ? ';' : ',';
  const satirlar: string[][] = [];
  let satir: string[] = [], hucre = '', tirnak = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (tirnak) {
      if (ch === '"') { if (text[i + 1] === '"') { hucre += '"'; i++; } else tirnak = false; } else hucre += ch;
    } else if (ch === '"') tirnak = true;
    else if (ch === ayrac) { satir.push(hucre); hucre = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      satir.push(hucre); satirlar.push(satir); satir = []; hucre = '';
    } else hucre += ch;
  }
  if (hucre || satir.length) { satir.push(hucre); satirlar.push(satir); }
  return satirlar.filter((r) => r.some((x) => x.trim()));
}

export function csvTarihi(s: string): string | null {
  const t = (s || '').trim();
  let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${iki(m[2]!)}-${iki(m[3]!)}`;
  m = t.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})/);
  if (m) return `${m[3]}-${iki(m[2]!)}-${iki(m[1]!)}`;
  return null;
}

export function csvSayisi(s: string): number {
  let t = String(s || '').replace(/[₺\s]|TL/gi, '');
  if (t.includes(',') && t.includes('.')) t = t.lastIndexOf(',') > t.lastIndexOf('.') ? t.replace(/\./g, '').replace(',', '.') : t.replace(/,/g, '');
  else if (t.includes(',')) t = t.replace(',', '.');
  const n = Number(t);
  return Number.isFinite(n) ? n : NaN;
}

const anahtar = (s: string) => s.toLocaleLowerCase('tr').replace(/[^a-zçğıöşü0-9%]/g, '');

/** kategori: CSV'deki kategori metnini (prototip etiketi) sunucu koduna cevirir; taninmazsa o yonun ilk kategorisi. */
export function csvdenBelgeler(metin: string, kategori: (yon: Yon, etiket: string) => TopluSatir['kategori']): CsvSonucu {
  const rows = csvSatirlari(metin);
  if (rows.length < 2) return { ok: [], bad: ['Dosyada veri satırı yok'] };
  const h = rows[0]!.map(anahtar);
  const sutun = (...adlar: string[]) => { for (const n of adlar) { const i = h.findIndex((x) => x === n || x.startsWith(n)); if (i >= 0) return i; } return -1; };
  const ci = {
    date: sutun('tarih', 'belgetarihi'), type: sutun('tür', 'tur', 'tip'), cat: sutun('kategori'), party: sutun('cari', 'müşteri', 'tedarikçi'),
    desc: sutun('açıklama', 'aciklama'), amt: sutun('kdvhariç', 'kdvharic', 'tutar', 'matrah'), kdv: sutun('kdv%', 'kdvoranı', 'kdv'), due: sutun('vade'),
  };
  if (ci.date < 0 || ci.amt < 0 || ci.party < 0) return { ok: [], bad: ['Başlıkta Tarih, Cari ve KDV hariç (veya Tutar) sütunları bulunamadı'] };
  const ok: TopluSatir[] = [], bad: string[] = [];
  rows.slice(1).forEach((r, i) => {
    const ln = i + 2;
    const g = (k: keyof typeof ci) => (ci[k] >= 0 ? (r[ci[k]] ?? '').trim() : '');
    const tarih = csvTarihi(g('date')), tutar = csvSayisi(g('amt'));
    if (!tarih) { bad.push(`satır ${ln}: tarih okunamadı`); return; }
    if (!(tutar > 0)) { bad.push(`satır ${ln}: tutar okunamadı`); return; }
    if (!g('party')) { bad.push(`satır ${ln}: cari boş`); return; }
    const yon: Yon = /gider|alış|alis|ödeme|odeme|masraf/.test(g('type').toLocaleLowerCase('tr')) ? 'gider' : 'gelir';
    const kdvHam = csvSayisi(g('kdv'));
    ok.push({
      belgeTarihi: tarih, yon, kategori: kategori(yon, g('cat')), firma: g('party'), aciklama: g('desc') || (yon === 'gelir' ? 'Satış' : 'Gider'),
      tutar: yuvarla(tutar), kdvOrani: [0, 1, 10, 20].includes(kdvHam) ? kdvHam : 20, vade: csvTarihi(g('due')) ?? tarih,
    });
  });
  return { ok, bad };
}

// İndirilen şablon (prototipteki örnek iki satır); firma adları uydurmadır.
export const SABLON_BASLIKLARI = ['Tarih', 'Tür', 'Kategori', 'Cari', 'Açıklama', 'KDV hariç', 'KDV %', 'Vade', 'Durum', 'Ödeme tarihi'] as const;
export const SABLON_SATIRLARI: readonly (readonly CsvDegeri[])[] = [
  ['01.10.2026', 'gelir', 'Ürün satışı', 'Örnek Müşteri A.Ş.', 'Fatura 2026-001', 100000, 20, '31.10.2026', 'açık', ''],
  ['02.10.2026', 'gider', 'Mal / hammadde alımı', 'Örnek Tedarikçi', 'Alış faturası', 40000, 20, '02.10.2026', 'ödendi', '02.10.2026'],
];
