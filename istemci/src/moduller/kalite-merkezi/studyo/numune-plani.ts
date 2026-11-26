import type { KmBalonGrubu, KmNumuneKurali } from '#paylasilan/sozlesme/kalite-merkezi-studyo.ts';

// 3689-2: numune planı düzenleyicisinin saf kuralları. İlk parça onayının tek kaynağı bu plandır: kapı (sayım kilidi) yalnız ilk parça
// kuralında seçilir, sunucu da aynı kuralı reddeder (kalite-merkezi/kurallar.ts `numunePlaniReddi`).
export type Zaman = KmNumuneKurali['ne'];
export const ZAMANLAR: readonly { ne: Zaman; ad: string }[] = [
  { ne: 'ilk', ad: 'İlk parça' }, { ne: 'her', ad: 'Her N parça' }, { ne: 'sure', ad: 'Her N dakika' }, { ne: 'vardiya', ad: 'Vardiya başı' }, { ne: 'son', ad: 'Son parça' },
];
export type Olcen = 'kalite' | 'operator' | 'ikisi';
export const OLCENLER: readonly { deger: Olcen; ad: string }[] = [{ deger: 'kalite', ad: 'Kalite' }, { deger: 'operator', ad: 'Operatör' }, { deger: 'ikisi', ad: 'Kalite + operatör' }];
export const olceniOku = (kim: KmNumuneKurali['kim']): Olcen => (kim.length > 1 ? 'ikisi' : kim[0] === 'operator' ? 'operator' : 'kalite');
export const olceniYaz = (o: Olcen): KmNumuneKurali['kim'] => (o === 'ikisi' ? ['kalite', 'operator'] : [o]);
export const nGerekir = (ne: Zaman): boolean => ne === 'her' || ne === 'sure';

let sayac = 0;
export const yeniKimlik = (): string => `k${Date.now().toString(36)}${(sayac += 1).toString(36)}`;

// Zaman değişince n ve kapı kurala uydurulur: n yalnız her/süre kuralında, kapı yalnız ilk parçada.
export function zamanYaz(k: KmNumuneKurali, ne: Zaman): KmNumuneKurali {
  const { n: _n, kapi: _k, ...geri } = k;
  return { ...geri, ne, ...(nGerekir(ne) ? { n: k.n ?? (ne === 'sure' ? 60 : 50) } : {}), ...(ne === 'ilk' ? { kapi: k.kapi ?? true } : {}) };
}

export function yeniKural(): KmNumuneKurali {
  return { kimlik: yeniKimlik(), ne: 'her', n: 50, kim: ['operator'], balonlar: 'kritik' };
}

// Şablonlar (kullanıcı metni): ilk parça kalite kapılı; ilk parça kalite + her 50 operatör + son parça kalite.
// VARSAYIM: her 50 parçadaki operatör kontrolü kritik balonlardır (ön izlemedeki "2 balon"); ilk ve son parça bütün balonlardır.
export const SABLONLAR: readonly { anahtar: string; ad: string; kurallar: () => KmNumuneKurali[] }[] = [
  { anahtar: 'ilk', ad: 'İlk parça kalite (kapılı)', kurallar: () => [{ kimlik: yeniKimlik(), ne: 'ilk', kim: ['kalite'], balonlar: 'hepsi', kapi: true }] },
  {
    anahtar: 'ilk-her-son', ad: 'İlk parça kalite · her 50 operatör · son parça kalite', kurallar: () => [
      { kimlik: yeniKimlik(), ne: 'ilk', kim: ['kalite'], balonlar: 'hepsi', kapi: true },
      { kimlik: yeniKimlik(), ne: 'her', n: 50, kim: ['operator'], balonlar: 'kritik' },
      { kimlik: yeniKimlik(), ne: 'son', kim: ['kalite'], balonlar: 'hepsi' },
    ],
  },
];

// Ölçülerin seçimi: hepsi, kritik ya da grup. Biçimde grup yoktur; grup seçilince kural o anın balon numaralarını taşır ("kayıt anında
// numaralara açılır"), sonradan gruba eklenen balon bu kurala kendiliğinden girmez.
export function olcuSecimi(b: KmNumuneKurali['balonlar'], gruplar: readonly KmBalonGrubu[]): string {
  if (b === 'hepsi' || b === 'kritik') return b;
  const g = gruplar.find((x) => x.balonlar.length === b.length && x.balonlar.every((n) => b.includes(n)));
  return g ? `g${String(g.id)}` : 'secili';
}
export function olcuYaz(deger: string, onceki: KmNumuneKurali['balonlar'], gruplar: readonly KmBalonGrubu[]): KmNumuneKurali['balonlar'] {
  if (deger === 'hepsi' || deger === 'kritik') return deger;
  const g = gruplar.find((x) => `g${String(x.id)}` === deger);
  return g && g.balonlar.length > 0 ? [...g.balonlar].sort((a, c) => a - c) : onceki;
}

export const ilkParcaAcik = (kurallar: readonly KmNumuneKurali[]): boolean => kurallar.some((k) => k.ne === 'ilk' && k.kapi === true);
// R1 geçiş (sunucu `plandanIlkParca` ile aynı): kapılı ilk parça varsa açık; kuralsız plan "İlk parça yok" (kapalı); kapılı ilk parça
// taşımayan planda karar rotadaki seçimde kalır (null).
export function ilkParcaKarari(kurallar: readonly KmNumuneKurali[]): boolean | null {
  if (ilkParcaAcik(kurallar)) return true;
  return kurallar.length === 0 ? false : null;
}

// Kaydetmeden önceki denetim (sunucunun reddiyle aynı): ilk hatanın iletisi ya da null.
export function planEksigi(kurallar: readonly KmNumuneKurali[]): string | null {
  for (const [i, k] of kurallar.entries()) {
    const sira = `${String(i + 1)}. kural`;
    if (k.kapi === true && k.ne !== 'ilk') return `${sira}: sayım kilidi (kapı) yalnız ilk parça kuralında seçilir; kaydetmeden önce kaldırın.`;
    if (nGerekir(k.ne) && !(Number.isInteger(k.n) && (k.n ?? 0) > 0)) return `${sira}: ${k.ne === 'sure' ? 'dakika' : 'parça sayısı'} pozitif tam sayı olmalı.`;
    if (Array.isArray(k.balonlar) && k.balonlar.length === 0) return `${sira}: en az bir ölçü seçin.`;
  }
  return null;
}

export const kurallarAyni = (a: readonly KmNumuneKurali[], b: readonly KmNumuneKurali[]): boolean => JSON.stringify(a) === JSON.stringify(b);
