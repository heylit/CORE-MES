import { Simge } from '../../../../ortak/arayuz/index.ts';
import { durumMetni, isMalzemesiniAc, useIsMalzemeDurumu } from '../../baglanti.ts';

// İşin malzeme durumu terminalde (618, 615-1 b): eksik, istendi, gelen; dokununca Malzeme · Teslim paneli bu işle açılır.
// Sayım panelin "Bu iş" bölümüyle aynıdır (stok/is-malzeme-durumu.ts). Rotada girdi yoksa ya da yetki yoksa çip çıkmaz.
export function MalzemeCipi({ istasyon, emirId }: { istasyon: string; emirId: number | null }) {
  const { durum, istasyonId } = useIsMalzemeDurumu(istasyon, emirId);
  if (!durum || durum.girdi === 0 || istasyonId === null || emirId === null) return null;
  const { metin, ton } = durumMetni(durum);
  return (
    <button type="button" className="tc-ay1-malzeme-cip" data-ton={ton} onClick={() => isMalzemesiniAc({ istasyonId, uretimEmriId: emirId, malzemeId: null })}>
      <Simge ad="box" boyut="k" /><span>Malzeme</span><b>{metin}</b>
    </button>
  );
}
