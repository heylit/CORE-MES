import type { OkutCozCevabi } from '#paylasilan/sozlesme/stok.ts';
import type { IsGirdisi } from '../../../stok/disari.ts';

// 1908 a: terminalde okutulan lot ya da malzeme etiketi çalışan işin rota girdisiyle karşılaştırılır. Yalnız gösterilir: kayıt yazılmaz,
// başlatma değişmez (karar 110 b). Doğru malzemenin lotu bu istasyonda görünmüyorsa uyarıdır; panelden alınır.
export interface LotEslesmesi { ton: 'run' | 'hold' | 'stop'; metin: string; malzemeId: number | null }

const girdiAdi = (g: IsGirdisi): string => g.ad ?? g.kod ?? `Malzeme #${g.malzemeId}`;
export const istenenler = (girdiler: readonly IsGirdisi[]): string => girdiler.map(girdiAdi).join(', ');

export function lotEslesmesi(girdiler: readonly IsGirdisi[], c: OkutCozCevabi, istasyonId: number): LotEslesmesi {
  if (c.tur !== 'malzeme') return { ton: 'stop', metin: c.tur === 'bilinmiyor' ? `Kod tanınmadı: ${c.kod}` : 'Lot ya da malzeme etiketi değil', malzemeId: null };
  const ad = c.malzeme.ad ?? c.malzeme.kod ?? `Malzeme #${c.malzeme.id}`;
  if (!girdiler.some((g) => g.malzemeId === c.malzeme.id)) {
    return { ton: 'stop', metin: `Yanlış malzeme: ${ad} · bu iş ${istenenler(girdiler)} istiyor`, malzemeId: null };
  }
  if (c.parti === null) return { ton: 'hold', metin: `Doğru malzeme: ${ad} · lot bilinmiyor; lot etiketi varsa onu okut`, malzemeId: c.malzeme.id };
  const burada = c.yerler.some((y) => y.istasyonId === istasyonId && y.partiId === c.parti!.id);
  return burada
    ? { ton: 'run', metin: `Doğru malzeme: ${ad} · lot ${c.parti.etiket}`, malzemeId: c.malzeme.id }
    : { ton: 'hold', metin: `Doğru malzeme: ${ad} · lot ${c.parti.etiket} bu istasyonda görünmüyor; Okut panelinden al`, malzemeId: c.malzeme.id };
}
