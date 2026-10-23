import type { CekDurumu } from '../akislar.ts';
import { addDays, diffDays, fmtD, fmtDY, gross, pad, sum, type DuzenliOdeme, type FinansMotoru, type Islem } from '../motor.ts';

// Ana sayfanın "Yapılacaklar" kutusu (prototip inbox): geciken ve yaklaşan tahsilat ve ödemeler firma başına, takipteki
// çekler, bu haftanın düzenli ödemeleri ve 30 gün içindeki vergi günleri. Grup 0 gecikmiş, 1 bu hafta, 2 otuz gün içinde.

export type Eylem =
  | { tur: 'tahsilat' | 'odeme'; etiket: string; party: string; birincil?: true }
  | { tur: 'hesap'; etiket: string; party: string; yon: 'gelir' | 'gider' }
  | { tur: 'cek'; etiket: string; cekId: number; durum: CekDurumu; birincil?: true; tehlike?: true }
  | { tur: 'duzenli'; etiket: string; duzenliId: number; birincil?: true }
  | { tur: 'vergi'; etiket: string };

export interface IsKalemi {
  g: 0 | 1 | 2;
  date: string;
  kind: 'in' | 'out' | 'tax';
  baslik: string;
  alt: string;
  tutar: number;
  eylemler: Eylem[];
}

export const GRUPLAR: readonly (readonly [string, 0 | 1 | 2])[] = [['Gecikmiş', 0], ['Bu hafta', 1], ['30 gün içinde', 2]];

// Motorun iç işlevidir (dışarı verilmez); düzenli ödemenin bu ay girilip girilmediği aynı ölçütle bakılır.
function buAyOdendi(tx: readonly Islem[], r: DuzenliOdeme, ym: string): boolean {
  const a = Number(r.amount) || 0;
  return tx.some((t) => t.type === 'gider' && t.date.slice(0, 7) === ym && (t.recId === r.id || (!t.recId && t.cat === r.cat && Math.abs(gross(t) - a) <= a * 0.2)));
}

const enEski = (ts: readonly Islem[]) => ts.reduce((a, t) => (t.due < a ? t.due : a), '9');

export function yapilacaklar(motor: FinansMotoru): IsKalemi[] {
  const s = motor.durum, bugun = motor.bugun;
  const items: IsKalemi[] = [], w7 = addDays(bugun, 7), d30 = addDays(bugun, 30);
  const firmaya = (list: readonly Islem[]) => { const m: Record<string, Islem[]> = {}; for (const t of list) (m[t.party] = m[t.party] ?? []).push(t); return Object.entries(m); };
  const bol = (ts: readonly Islem[]) => ({
    late: ts.filter((t) => t.due < bugun), soon: ts.filter((t) => t.due >= bugun && t.due <= w7), mid: ts.filter((t) => t.due > w7 && t.due <= d30),
  });
  for (const [p, ts] of firmaya(motor.openItems('gelir'))) {
    const { late, soon, mid } = bol(ts);
    const eylemler: Eylem[] = [{ tur: 'tahsilat', etiket: 'Tahsilat gir', party: p, birincil: true }, { tur: 'hesap', etiket: 'Hesabı aç', party: p, yon: 'gelir' }];
    if (late.length) items.push({ g: 0, date: enEski(late), kind: 'in', baslik: `${p} ödemesi gecikti`, alt: `${late.length} fatura · en eskisi ${Math.max(...late.map((t) => diffDays(bugun, t.due)))} gün gecikmiş`, tutar: sum(late, gross), eylemler });
    if (soon.length) items.push({ g: 1, date: soon[0]!.due, kind: 'in', baslik: `${p} ödeme yapacak`, alt: `${soon.length} fatura · vade ${fmtD(enEski(soon))}`, tutar: sum(soon, gross), eylemler });
    if (mid.length) items.push({ g: 2, date: mid[0]!.due, kind: 'in', baslik: `${p} tahsilatı`, alt: `${mid.length} fatura · vade ${fmtD(enEski(mid))}`, tutar: sum(mid, gross), eylemler });
  }
  for (const [p, ts] of firmaya(motor.openItems('gider'))) {
    const { late, soon, mid } = bol(ts);
    const eylemler: Eylem[] = [{ tur: 'odeme', etiket: 'Ödeme gir', party: p, birincil: true }, { tur: 'hesap', etiket: 'Hesabı aç', party: p, yon: 'gider' }];
    if (late.length) items.push({ g: 0, date: late[0]!.due, kind: 'out', baslik: `${p} ödemesi gecikti`, alt: `${late.length} fatura · vade ${fmtD(late[0]!.due)}`, tutar: sum(late, gross), eylemler });
    if (soon.length) items.push({ g: 1, date: soon[0]!.due, kind: 'out', baslik: `${p} ödemesi`, alt: `${soon.length} fatura · vade ${fmtD(soon[0]!.due)}`, tutar: sum(soon, gross), eylemler });
    if (mid.length) items.push({ g: 2, date: mid[0]!.due, kind: 'out', baslik: `${p} ödemesi`, alt: `${mid.length} fatura · vade ${fmtD(mid[0]!.due)}`, tutar: sum(mid, gross), eylemler });
  }
  const grup = (due: string): 0 | 1 | 2 | -1 => (due < bugun ? 0 : due <= w7 ? 1 : due <= d30 ? 2 : -1);
  for (const q of s.cheques) {
    // Sunucudan gelmeyen çekin (yalnız testte) düğmesi olmaz; satırı yine görünür.
    const cekId = q._cekId ?? null;
    const cekEylemi = (e: Omit<Extract<Eylem, { tur: 'cek' }>, 'cekId'>): Eylem[] => (cekId === null ? [] : [{ ...e, cekId }]);
    const tur = q.kind.toLowerCase();
    if (q.dir === 'alinan' && ['portfoy', 'tahsilde'].includes(q.status)) {
      const g = grup(q.due); if (g === -1) continue;
      const eylemler: Eylem[] = [
        ...(q.status === 'portfoy' && g > 0 ? cekEylemi({ tur: 'cek', etiket: 'Bankaya verdim', durum: 'tahsilde' }) : []),
        ...cekEylemi({ tur: 'cek', etiket: 'Tahsil edildi', durum: 'tahsil', birincil: true }),
        ...(g === 0 ? cekEylemi({ tur: 'cek', etiket: 'Karşılıksız', durum: 'karsiliksiz', tehlike: true }) : []),
      ];
      items.push({
        g, date: q.due, kind: 'in', tutar: q.amount, eylemler,
        baslik: g === 0 ? `${q.party} ${tur}i tahsil edildi mi?` : q.status === 'portfoy' && g === 1 ? `${q.party} ${tur}ini bankaya verin` : `${q.party} ${tur}i`,
        alt: `${q.bank !== '—' ? q.bank + ' · ' : ''}vade ${fmtD(q.due)} · ${q.status === 'tahsilde' ? 'bankada' : 'portföyde'}`,
      });
    }
    if (q.dir === 'verilen' && q.status === 'bekliyor') {
      const g = grup(q.due); if (g === -1) continue;
      items.push({
        g, date: q.due, kind: 'out', tutar: q.amount, eylemler: cekEylemi({ tur: 'cek', etiket: 'Ödendi', durum: 'odendi', birincil: true }),
        baslik: g === 0 ? `Verilen çek ödendi mi? (${q.party})` : `Verilen ${tur} · hesapta para bulunmalı`, alt: `${q.party} · vade ${fmtD(q.due)}`,
      });
    }
  }
  const ym = bugun.slice(0, 7);
  for (const r of s.recurring) {
    const d = ym + '-' + pad(Math.min(Number(r.day) || 1, 28));
    if (d >= bugun && d <= w7 && !buAyOdendi(s.tx, r, ym)) {
      items.push({
        g: 1, date: d, kind: 'out', baslik: r.name, alt: `Düzenli ödeme · ayın ${r.day}. günü`, tutar: Number(r.amount) || 0,
        eylemler: r._duzenliId === undefined ? [] : [{ tur: 'duzenli', etiket: 'Ödendi', duzenliId: r._duzenliId, birincil: true }],
      });
    }
  }
  for (const e of motor.taxCalendar(30)) {
    items.push({ g: diffDays(e.date, bugun) <= 7 ? 1 : 2, date: e.date, kind: 'tax', baslik: e.name, alt: `Son gün ${fmtDY(e.date)} · dönem ${e.per}`, tutar: e.amount || 0, eylemler: [{ tur: 'vergi', etiket: 'Takvim' }] });
  }
  return items.sort((a, b) => a.g - b.g || (a.date < b.date ? -1 : 1));
}
