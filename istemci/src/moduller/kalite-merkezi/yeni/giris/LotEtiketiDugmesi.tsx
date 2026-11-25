import { Link } from 'react-router-dom';
import { etiketMerkeziAdresi } from '#paylasilan/etiket-sabitleri.ts';
import { Dugme } from '../../../../ortak/arayuz/index.ts';
import { useOturum } from '../../../../ortak/veri/oturum.ts';

// 3713: kapanan GKK'nın lotunun etiketi Etiket Merkezi'nde lot seçili açılır (önizleme, yazıcı ve baskı defteri orada). Kalite Merkezi ile
// Etiket Merkezi aynı kattadır (ADR 0006): ithal yerine ortak adres kalıbı kullanılır. Etiket Merkezi sayfasını açamayan kişi düğmeyi görmez.
export function LotEtiketiDugmesi({ partiId, lotNo, ikon = false }: { partiId: number; lotNo: string | null; ikon?: boolean }) {
  const izinli = (useOturum().data?.islemler ?? []).includes('sayfa.etiket-merkezi');
  if (!izinli) return null;
  const ad = `${lotNo ?? 'Lot'} etiketini bas`;
  return (
    <Link to={etiketMerkeziAdresi('lot', [partiId])} aria-label={ad} title={ad} className="tc-km-gkk-etiket-baglanti" onClick={(e) => { e.stopPropagation(); }}>
      <Dugme tur={ikon ? 'ikincil' : 'birincil'} simge="printer" tabIndex={-1} className={ikon ? 'tc-km-gkk-ikon-dugme' : undefined}>{ikon ? null : 'Etiketi bas'}</Dugme>
    </Link>
  );
}
