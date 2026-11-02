import { aramaSade } from '#paylasilan/kayit-aramasi.ts';
import type { KisiOzeti } from '#paylasilan/sozlesme/kisiler.ts';

export type DurumSuzgeci = 'tumu' | 'aktif' | 'pasif';

// Liste bütünüyle istemcidedir; arama sunucudaki arama_sade kuralıyla aynı eşlemeyi kullanır ("ışık" ile "IŞIK" aynıdır).
export function kisileriSuz<K extends Pick<KisiOzeti, 'ad' | 'aktif' | 'sicilNo' | 'gorev' | 'kullaniciAdi'>>(
  kisiler: readonly K[], q: string, durum: DurumSuzgeci,
): K[] {
  const aranan = aramaSade(q.trim());
  return kisiler.filter((k) => {
    if (durum === 'aktif' && !k.aktif) return false;
    if (durum === 'pasif' && k.aktif) return false;
    if (aranan === '') return true;
    return [k.ad, k.sicilNo, k.gorev, k.kullaniciAdi].some((d) => d !== null && aramaSade(d).includes(aranan));
  });
}

// Aynı adla kayıtlı başka kişi: aynı ad yasak değildir (iki kişi aynı adı taşıyabilir), yalnız uyarılır.
export function ayniAdliKisiler<K extends Pick<KisiOzeti, 'id' | 'ad'>>(kisiler: readonly K[], ad: string, haricId: number | null): K[] {
  const aranan = aramaSade(ad.trim().replace(/\s+/g, ' '));
  if (aranan === '') return [];
  return kisiler.filter((k) => k.id !== haricId && aramaSade(k.ad.trim().replace(/\s+/g, ' ')) === aranan);
}
