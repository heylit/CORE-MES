import { useNavigate } from 'react-router-dom';
import type { Belge } from '#paylasilan/finans-motor/donustur.ts';
import { Dugme } from '../../../ortak/arayuz/index.ts';
import { useYetki } from '../../../ortak/veri/yetki.ts';
import { eslemeYolu, useSatinAlmaAcik, type EslemeDonusu } from './acik.ts';

// 2675 (2671 b): fatura ayrıntısından eşleme sayfasına adres. Yalnız siparişten gelen, iptal olmayan gider belgesinde ve
// eşlemeyi okuyabilene (uçla aynı: finans.oku ya da finans.maliyet-oku); düzenleme sayfada finans.yaz ister.
export function eslemeyeUygun(b: Pick<Belge, 'yon' | 'durum' | 'satinAlmaSiparisi'>): boolean {
  return b.yon === 'gider' && b.durum !== 'iptal' && b.satinAlmaSiparisi !== null;
}

// Arayüz B3: düzenleme formunda kaydedilmemiş değişiklik varken sayfa değişmez; düğme pasif ve neden yazılı.
export function EslemeBaglantisi({ belge, kaydedilmemis = false }: { belge: Belge; kaydedilmemis?: boolean }) {
  const git = useNavigate();
  const yetki = useYetki();
  const acik = useSatinAlmaAcik();
  if (!acik || !eslemeyeUygun(belge) || !yetki.herhangi('finans.oku', 'finans.maliyet-oku')) return null;
  const durum: EslemeDonusu = { faturaAyrintisindan: true };
  return (
    <>
      <Dugme simge="list" disabled={kaydedilmemis} onClick={() => { void git(eslemeYolu(belge.id), { state: durum }); }}>Sipariş satırlarına eşle</Dugme>
      {kaydedilmemis && <p className="tc-fk-not">Eşlemeye geçmeden önce değişiklikleri kaydedin ya da geri alın.</p>}
    </>
  );
}
