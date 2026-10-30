import { aramaSade } from '#paylasilan/kayit-aramasi.ts';
import { BOLUM_ISLEMLERI, type Bolum, type KaynakTuru } from '#paylasilan/sozlesme/kaynak-izi.ts';

// KI-1 (1322 a): bölüm, sahibinin okuma işlemlerinden birini taşıyana görünür; görünmeyen bölümün sorgusu atılmaz.
export const bolumGorunur = (islemler: readonly string[], bolum: Bolum): boolean =>
  (BOLUM_ISLEMLERI[bolum] as readonly string[]).some((i) => islemler.includes(i));

export const gorunurBolumler = (islemler: readonly string[]): Bolum[] =>
  (Object.keys(BOLUM_ISLEMLERI) as Bolum[]).filter((b) => bolumGorunur(islemler, b));

export interface AramaAdayi { tur: KaynakTuru; id: number; kod: string | null; ad: string; aktif: boolean; ust: string | null }

// KI-2: metin kodda ya da adda geçer (Türkçe harf duyarsız); kodu tam tutan önce, sonra aktif, sonra tür (istasyon, makine,
// kişi) ve ada göre. Boş metin hepsidir.
export function kaynakSuz(adaylar: readonly AramaAdayi[], metin: string): AramaAdayi[] {
  const m = aramaSade(metin.trim());
  const sira = { istasyon: 0, makine: 1, kisi: 2 } as const;
  const tam = (a: AramaAdayi) => (a.kod !== null && aramaSade(a.kod) === m ? 0 : 1);
  return adaylar
    .filter((a) => m === '' || aramaSade(a.ad).includes(m) || (a.kod !== null && aramaSade(a.kod).includes(m)))
    .sort((a, b) => tam(a) - tam(b) || Number(b.aktif) - Number(a.aktif) || sira[a.tur] - sira[b.tur] || a.ad.localeCompare(b.ad, 'tr'));
}

// KI-3: OEE penceresi son yedi gündür (bugün dahil).
export function sonYediGun(bugun: string): { baslangic: string; bitis: string } {
  const g = new Date(`${bugun}T00:00:00Z`);
  g.setUTCDate(g.getUTCDate() - 6);
  return { baslangic: g.toISOString().slice(0, 10), bitis: bugun };
}
