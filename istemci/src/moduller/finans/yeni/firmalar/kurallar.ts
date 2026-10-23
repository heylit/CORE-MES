import type { FirmaTuru } from '#paylasilan/sozlesme/musteri-tedarikci.ts';
import { kisaTarih, tl } from '../bicim.ts';
import { sayi, type HazirVeri } from '../donustur.ts';
import { addDays, gross, real, sum, type FinansMotoru, type Islem } from '../motor.ts';

// Firmalar ve cari hesabın saf kuralları (prototipte tam kipin firma ekleri, `ekstre`, `VIEWS.carid` ve `pasifOnKontrol`).

export const FIRMA_TUR_ADI: Record<FirmaTuru, string> = { musteri: 'Müşteri', tedarikci: 'Tedarikçi', ikisi: 'Müşteri ve tedarikçi' };
export const LOGO_DURUM_ADI = { bekliyor: 'Bekliyor', gonderildi: 'Gönderildi', hata: 'Hata' } as const;
// Cari hesabın tarafı: tedarikçi gider, müşteri ve "ikisi" gelir (prototipteki gibi).
export const firmaTarafi = (tur: FirmaTuru): 'gelir' | 'gider' => (tur === 'tedarikci' ? 'gider' : 'gelir');

// Listedeki "Açık alacak" ve "Açık borç": açık belgelerin kalanı, belgenin kuruyla TL.
export function acikBakiye(V: HazirVeri, firmaId: number, yon: 'gelir' | 'gider'): number {
  return V.belgeler.filter((b) => b.firmaId === firmaId && b.yon === yon && b.durum === 'acik').reduce((t, b) => t + sayi(b.kalan) * sayi(b.kur), 0);
}

// FNS-60 ön denetimi: kalan kayıt varsa pasife alma onayı yerine neden gösterilir. Asıl kural sunucudadır.
export function pasifOnKontrol(V: HazirVeri, firmaId: number): string | null {
  const belgeler = V.belgeler.filter((b) => b.firmaId === firmaId && b.durum === 'acik');
  const avanslar = V.odemeler.filter((o) => o.firmaId === firmaId && !o.iptal && sayi(o.kalan) > 0.004);
  const cekler = V.cekler.filter((c) => c.firmaId === firmaId && ['portfoy', 'tahsilde', 'bekliyor'].includes(c.durum));
  const kalan: string[] = [];
  if (belgeler.length) kalan.push(`${belgeler.length} açık fatura (${tl(sum(belgeler, (b) => sayi(b.kalan) * sayi(b.kur)))})`);
  if (avanslar.length) kalan.push(`${avanslar.length} faturaya dağıtılmamış ödeme (${tl(sum(avanslar, (o) => sayi(o.kalan) * sayi(o.kur)))})`);
  if (cekler.length) kalan.push(`${cekler.length} sonuçlanmamış çek/senet (${tl(sum(cekler, (c) => sayi(c.tutarTl)))})`);
  return kalan.length ? `Firma pasife alınamaz: ${kalan.join(', ')} var. Alınacak ve verilecek ödeme kalmayınca pasife alınabilir.` : null;
}

export interface EkstreSatiri { no: number; date: string; desc: string; d: number; c: number; o: number; bal: number }

// Hesap ekstresi: faturalar borç, tahsilat/ödeme ve çekler alacak; karşılıksız çek borca geri eklenir. Çekle kapanan fatura
// çek alındığı gün düşer. Sıra tarih, aynı günde önce fatura.
export function ekstre(motor: FinansMotoru, party: string, side: 'gelir' | 'gider'): EkstreSatiri[] {
  const rows: Omit<EkstreSatiri, 'bal' | 'no'>[] = [];
  const dirQ = side === 'gelir' ? 'alinan' : 'verilen';
  for (const t of motor.durum.tx) {
    if (t.party !== party || t.type !== side) continue;
    const adv = t.np && /Avans/.test(t.desc ?? '');
    if (!adv) rows.push({ date: t.date, desc: (t.desc ?? '') + (t.desc === 'Açılış bakiyesi' ? '' : ` · ${t.cat}`), d: gross(t), c: 0, o: 0 });
    if (t.status === 'odendi' && t.paidDate) rows.push({ date: t.paidDate, desc: side === 'gelir' ? (adv ? 'Avans tahsilatı' : 'Tahsilat') : (adv ? 'Avans ödemesi' : 'Ödeme'), d: 0, c: gross(t), o: 1 });
  }
  for (const q of motor.durum.cheques) {
    if (q.party !== party || q.dir !== dirQ) continue;
    rows.push({ date: q.date ?? q.due, desc: `${q.kind} ${q.dir === 'alinan' ? 'alındı' : 'verildi'} · ${q.bank && q.bank !== '—' ? q.bank + ' · ' : ''}vade ${kisaTarih(q.due)}`, d: 0, c: q.amount, o: 1 });
    if (q.status === 'karsiliksiz') rows.push({ date: q.due, desc: `Karşılıksız ${q.kind.toLocaleLowerCase('tr')} (borca geri eklendi)`, d: q.amount, c: 0, o: 2 });
  }
  rows.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.o - b.o));
  let bal = 0;
  return rows.map((r, no) => { bal += r.d - r.c; return { ...r, no, bal }; });
}

// "Ekstreyi indir" (prototipteki sütunlar).
export const EKSTRE_CSV_BASLIKLARI = ['Tarih', 'Açıklama', 'Borç', 'Alacak', 'Bakiye'] as const;
export const ekstreCsvSatirlari = (rows: readonly EkstreSatiri[]): (string | number | null)[][] =>
  rows.map((r) => [r.date.split('-').reverse().join('.'), r.desc, r.d ? Math.round(r.d * 100) / 100 : null, r.c ? Math.round(r.c * 100) / 100 : null, Math.round(r.bal * 100) / 100]);

export interface CariOzet {
  acik: Islem[];
  acikToplam: number;
  gecikmis: number;
  elimizdekiCekler: number;
  hacim12: number;
  cekler: FinansMotoru['durum']['cheques'];
}

// Cari hesabın üst özeti ve listeleri (prototipte VIEWS.carid).
export function cariOzet(motor: FinansMotoru, party: string, side: 'gelir' | 'gider'): CariOzet {
  const bugun = motor.bugun;
  const acik = motor.openItems(side).filter((t) => t.party === party).sort((a, b) => (a.due < b.due ? -1 : 1));
  const cekler = motor.durum.cheques.filter((q) => q.party === party).sort((a, b) => (a.due < b.due ? 1 : -1));
  return {
    acik,
    acikToplam: sum(acik, gross),
    gecikmis: sum(acik.filter((t) => t.due < bugun), gross),
    elimizdekiCekler: sum(cekler.filter((q) => ['portfoy', 'tahsilde', 'bekliyor'].includes(q.status)), (q) => q.amount),
    hacim12: sum(motor.durum.tx.filter((t) => t.party === party && t.type === side && real(t) && t.date > addDays(bugun, -365)), (t) => t.amount),
    cekler,
  };
}

export const CEK_DURUM_ADI: Record<string, string> = {
  portfoy: 'Portföyde', tahsilde: 'Bankada tahsilde', ciro: 'Ciro edildi', tahsil: 'Tahsil edildi', karsiliksiz: 'Karşılıksız', bekliyor: 'Ödenecek', odendi: 'Ödendi',
};
export const NOT_METNI: Record<string, string> = { A: 'Düzenli ödüyor', B: 'Genelde zamanında', C: 'Sık gecikiyor', D: 'Yüksek risk' };
