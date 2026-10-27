import { firmaCoz } from '../akislar.ts';
import type { Komut } from '../akislar.ts';
import { KAT_KOD, sayi, yuvarla, type Belge, type HazirVeri, type Odeme } from '../donustur.ts';
import { addDays, CATS, fmt, nf, sum, type FinansMotoru, type Islem, type IslemDurumu, type IslemTuru } from '../motor.ts';

// Belge düzeltme ve iptal (prototipte tam kipin txForm ve İptal et yakalayıcıları). Saf: komutu kurar, göndermez.

// Form prototipteki gibi satırın kendi değerleriyle açılır; tür, ödeme durumu ve ödeme tarihi gönderilmez (tam kipte de gitmiyordu).
export interface DuzeltDegerleri {
  type: IslemTuru; date: string; cat: string; party: string; desc: string; amount: string; kdv: string; status: IslemDurumu; due: string; paidDate: string;
}

export const KDV_SECENEKLERI = [20, 10, 1, 0] as const;

// Döviz belgesinde tutar, tevkifatlı belgede KDV oranı gönderilmez; belgenin kendi değeri gider (tam kipteki gibi).
export const tutarKilitli = (b: Belge): boolean => b.paraBirimi !== 'TRY';
export const kdvKilitli = (b: Belge): boolean => b.tevkifatPay !== null;

// Listede olmayan oran (kısmi satırın hesaplanmış oranı) prototipteki seçim kutusu gibi ilk seçeneğe düşer.
const kdvSecimi = (k: number): string => String((KDV_SECENEKLERI as readonly number[]).includes(k) ? k : KDV_SECENEKLERI[0]);

export function duzeltIlkDegerleri(t: Islem): DuzeltDegerleri {
  return {
    type: t.type, date: t.date, cat: t.cat, party: t.party, desc: t.desc ?? '', amount: String(t.amount), kdv: kdvSecimi(t.kdv ?? 0),
    status: t.status, due: t.due || t.date, paidDate: t.paidDate || t.date,
  };
}

// Kategori ve cari önerileri seçili türe göredir (prototipte tür düğmesi ikisini de yeniler).
export const kategoriSecenekleri = (tur: IslemTuru): string[] => CATS[tur].map((c) => c.k);
export const cariOnerileri = (tx: readonly Islem[], tur: IslemTuru): string[] =>
  [...new Set(tx.filter((x) => x.type === tur).map((x) => x.party))].sort();

export function duzeltKomutu(V: HazirVeri, b: Belge, d: DuzeltDegerleri): { komut: Komut } | { alan: keyof DuzeltDegerleri; hata: string } {
  let firmaId: number | null = null;
  if (b.firmaId !== null) {
    const fr = firmaCoz(V, d.party, b.yon);
    if ('hata' in fr) return { alan: 'party', hata: fr.hata };
    firmaId = fr.id;
  }
  if (!d.date) return { alan: 'date', hata: 'Belge tarihi gerekli.' };
  const tutar = tutarKilitli(b) ? sayi(b.tutar) : yuvarla(sayi(d.amount));
  if (!(tutar > 0)) return { alan: 'amount', hata: 'Tutar sıfırdan büyük olmalı.' };
  const govde = {
    kategori: KAT_KOD[d.cat] ?? b.kategori, firmaId, belgeNo: b.belgeNo, aciklama: d.desc.trim() || null, belgeTarihi: d.date, vade: d.due || d.date,
    paraBirimi: b.paraBirimi, kur: sayi(b.kur), tutar, kdvOrani: kdvKilitli(b) ? sayi(b.kdvOrani) : sayi(d.kdv),
    tevkifatPay: b.tevkifatPay, tevkifatPayda: b.tevkifatPayda, surum: b.surum,
  };
  return { komut: { uc: 'POST /finans/belgeler/:id/duzelt', parametre: { id: b.id }, govde, tekrar: false, basari: 'Belge düzeltildi.' } };
}

export const belgeIptalKomutu = (b: Belge): Komut =>
  ({ uc: 'POST /finans/belgeler/:id/iptal', parametre: { id: b.id }, govde: { surum: b.surum }, tekrar: false, basari: 'Belge iptal edildi; ödemesi varsa avansa döndü.' });
export const odemeIptalKomutu = (o: Odeme): Komut =>
  ({ uc: 'POST /finans/odemeler/:id/iptal', parametre: { id: o.id }, govde: { surum: o.surum }, tekrar: false, basari: 'Ödeme iptal edildi.' });

// Firma alanının altındaki ipucu (prototipte partyHint): müşteride risk notu, tedarikçide son 12 ay.
export function cariIpucu(motor: FinansMotoru, yon: 'gelir' | 'gider', party: string): { metin: string; ton: 'iyi' | 'uyari' | 'risk' | null } | null {
  if (!party) return null;
  if (yon === 'gelir') {
    const c = motor.runAnalysis().cs.byParty[party];
    if (!c) return { metin: 'Yeni müşteri. İlk satışlarda vadeyi kısa tutmak riski azaltır.', ton: null };
    const ton = ({ A: 'iyi', B: 'iyi', C: 'uyari', D: 'risk' } as const)[c.grade as 'A' | 'B' | 'C' | 'D'] ?? null;
    const metin = `Risk notu ${c.grade || '—'} (puan ${c.score ?? '—'})${c.avgDelay !== null && c.avgDelay !== undefined ? `, ağırlıklı ortalama gecikme ${nf(c.avgDelay)} gün` : ''}`
      + `${c.term ? `, olağan vade ${nf(c.term)} gün` : ''}. Açık bakiye ${fmt(c.openBal)}.${c.grade === 'D' ? ' Peşin veya teminatlı çalışmanız önerilir.' : ''}`;
    return { metin, ton };
  }
  const n = motor.durum.tx.filter((t) => t.type === 'gider' && t.party === party);
  if (!n.length) return null;
  const son = n.filter((t) => t.date > addDays(motor.bugun, -365));
  return { metin: `Bu cariye son 12 ayda ${son.length} kayıt, toplam ${fmt(sum(son, (t) => t.amount))}.`, ton: null };
}
