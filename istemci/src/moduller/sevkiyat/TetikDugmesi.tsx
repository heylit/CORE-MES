// İşin depo durumu (960, 3348 a): Tüm işler kalemi taşıyan iş plan onayıyla depoya düşer; ayrı "Sevk et" düğmesi yoktur. Burada yalnız
// durum gösterilir: depoda (çıkış ya da kabul bekliyor) ya da depodan çıktı. Kalemsiz (elle açılmış) işte rozet yoktur.
import type { TumIsSatiri } from '#paylasilan/sozlesme/sevkiyat.ts';
import { Rozet } from '../../ortak/arayuz/index.ts';

export function TetikDugmesi({ kalemler }: { kalemler: readonly TumIsSatiri[] | undefined }) {
  if (!kalemler?.length || kalemler.some((k) => k.tasima !== 'biz')) return null;
  const gelis = kalemler.every((k) => k.yon === 'gelis');
  if (kalemler.every((k) => k.asama === 'tamamlandi')) return <Rozet ton="tamam">{gelis ? 'Kabul edildi' : 'Depodan çıktı'}</Rozet>;
  if (kalemler.some((k) => k.is?.tetiklendi)) return <Rozet ton="uyari">{gelis ? 'Kabul bekliyor' : 'Çıkış bekliyor'}</Rozet>;
  return null;
}

// İşe bağlı kalemler: gün planının işleri bu haritadan durumunu bulur.
export function isKalemleri(satirlar: readonly TumIsSatiri[] | undefined): ReadonlyMap<number, TumIsSatiri[]> {
  const harita = new Map<number, TumIsSatiri[]>();
  for (const s of satirlar ?? []) if (s.is) harita.set(s.is.id, [...(harita.get(s.is.id) ?? []), s]);
  return harita;
}
