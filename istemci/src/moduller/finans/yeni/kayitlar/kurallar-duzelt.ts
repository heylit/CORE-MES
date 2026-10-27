import { firmaCoz } from '../akislar.ts';
import type { Komut } from '../akislar.ts';
import { KAT, KAT_KOD, firmaEtiketi, sayi, yuvarla, type Belge, type HazirVeri, type KategoriKodu, type Odeme } from '../donustur.ts';
import { addDays, CATS, fmt, nf, sum, type FinansMotoru, type Islem } from '../motor.ts';

// Belge düzeltme ve iptal (prototipte tam kipin txForm ve İptal et yakalayıcıları). Saf: komutu kurar, göndermez.

// Form belgenin kayıtlı değerleriyle açılır (Soru 844/1); yalnız uca giden alanlar formdadır (844/2).
export interface DuzeltDegerleri { date: string; cat: string; party: string; desc: string; amount: string; kdv: string; due: string }

export const KDV_SECENEKLERI = [20, 10, 1, 0] as const;

// Döviz belgesinde tutar, tevkifatlı belgede KDV oranı formda değişmez (gönderimde belgenin kendi değeri gider).
export const tutarKilitli = (b: Belge): boolean => b.paraBirimi !== 'TRY';
export const kdvKilitli = (b: Belge): boolean => b.tevkifatPay !== null;

export function duzeltIlkDegerleri(V: HazirVeri, b: Belge): DuzeltDegerleri {
  return {
    date: b.belgeTarihi, cat: KAT[b.kategori as KategoriKodu] ?? '', party: firmaEtiketi(V, b.firmaId) ?? '', desc: b.aciklama ?? '',
    amount: String(sayi(b.tutar)), kdv: String(sayi(b.kdvOrani)), due: b.vade,
  };
}

export const kategoriSecenekleri = (b: Belge): string[] => {
  const liste = CATS[b.yon].map((c) => c.k);
  const simdiki = KAT[b.kategori as KategoriKodu];
  return simdiki && !liste.includes(simdiki) ? [simdiki, ...liste] : liste;
};

export const kdvSecenekleri = (b: Belge): number[] => {
  const o = sayi(b.kdvOrani);
  return (KDV_SECENEKLERI as readonly number[]).includes(o) ? [...KDV_SECENEKLERI] : [o, ...KDV_SECENEKLERI];
};

// Cari önerileri prototipteki gibi geçmiş kayıtlardaki adlardan gelir (844/3); uç yalnız etkin ve eşleşen firmayı kabul eder.
export const cariOnerileri = (tx: readonly Islem[], yon: 'gelir' | 'gider'): string[] =>
  [...new Set(tx.filter((x) => x.type === yon).map((x) => x.party))].sort();

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
