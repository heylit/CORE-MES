import { Link } from 'react-router-dom';
import { etiketMerkeziAdresi } from '#paylasilan/etiket-sabitleri.ts';
import { Simge } from '../../../../ortak/arayuz/Simge.tsx';
import { useOturum } from '../../../../ortak/veri/oturum.ts';

// 3713: kapanan GKK'nın lotunun etiketi Etiket Merkezi'nde lot seçili açılır (önizleme, yazıcı ve baskı defteri orada). Kalite Merkezi ile
// Etiket Merkezi aynı kattadır (ADR 0006): ithal yerine ortak adres kalıbı kullanılır. Etiket Merkezi sayfasını açamayan kişi düğmeyi görmez.
// Bağlantı düğme gibi çizilir (düğme sınıfları); bağlantının içinde düğme öğesi yoktur.
export function LotEtiketiDugmesi({ partiId, lotNo, ikon = false }: { partiId: number; lotNo: string | null; ikon?: boolean }) {
  const izinli = (useOturum().data?.islemler ?? []).includes('sayfa.etiket-merkezi');
  if (!izinli) return null;
  const ad = `${lotNo ?? 'Lot'} etiketini bas`;
  return (
    <Link
      to={etiketMerkeziAdresi('lot', [partiId])} aria-label={ad} title={ad} onClick={(e) => { e.stopPropagation(); }}
      className={ikon ? 'tc-dugme tc-dugme-ikincil tc-dugme-normal tc-km-gkk-etiket-dugme tc-km-gkk-ikon-dugme' : 'tc-dugme tc-dugme-birincil tc-dugme-normal tc-km-gkk-etiket-dugme'}
    >
      <Simge ad="printer" />{ikon ? null : 'Etiketi bas'}
    </Link>
  );
}
