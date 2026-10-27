import { useQuery } from '@tanstack/react-query';
import type { IstasyonSepetiSatiri, IstasyonSepetleriCevabi, RefakatPartisi, TeslimKutusuCevabi } from '#paylasilan/sozlesme/stok.ts';
import { api } from '../../ortak/veri/api.ts';
import { istasyonSepetleriAnahtari } from './IstasyonSepetleri.tsx';
import { TESLIM_KUTUSU } from './is-malzeme-durumu.ts';
import { GelenTeslim, OncekiSepetSatiri, SepetSatiri } from './sepet-satirlari.tsx';

// Yarı mamul tek yol (752 b): refakat kartı okutulunca kartın parçası bu istasyonun iki sepetinde aranır. Önceki istasyonda bekliyorsa
// ya da buraya yoldaysa "Teslim al", buradaysa rotadaki sonraki istasyona tek dokunuş. Kart lotsuzsa (istisna kartı) emrin satırları gelir.
const kartinMi = (r: RefakatPartisi, x: { uretimEmriId: number | null; partiId: number | null }): boolean =>
  x.uretimEmriId === r.uretimEmriId && (r.partiId === null || x.partiId === r.partiId);

export function KartRotasi({ r }: { r: RefakatPartisi }) {
  const kutu = useQuery({ queryKey: TESLIM_KUTUSU, queryFn: () => api.get<TeslimKutusuCevabi>('/stok/teslim-kutusu') });
  const istasyonId = kutu.data ? kutu.data.buradakiIstasyonId ?? (kutu.data.istasyonlar.length === 1 ? kutu.data.istasyonlar[0]!.id : null) : null;
  const s = useQuery({
    queryKey: istasyonSepetleriAnahtari(istasyonId ?? 0, r.uretimEmriId),
    queryFn: () => api.get<IstasyonSepetleriCevabi>(`/stok/teslim-kutusu/istasyon-sepetleri?istasyonId=${istasyonId}&uretimEmriId=${r.uretimEmriId}`),
    enabled: istasyonId !== null,
    retry: false,
  });
  if (istasyonId === null || !s.data) return null;
  const yolda = s.data.gelen.yolda.filter((t) => kartinMi(r, t));
  const bekleyen = s.data.gelen.bekleyen.filter((x) => kartinMi(r, x));
  const cikan = s.data.cikan.filter((x: IstasyonSepetiSatiri) => kartinMi(r, x) && x.sonraki !== null);
  if (yolda.length + bekleyen.length + cikan.length === 0) return null;
  return (
    <ul className="tc-stok-isler tc-stok-teslim-liste" aria-label="Kartın parçası">
      {yolda.map((t) => <GelenTeslim key={`t-${t.id}`} t={t} />)}
      {bekleyen.map((x) => <OncekiSepetSatiri key={`${x.kaynak.id}-${x.malzemeId}-${x.partiId ?? 0}-${x.statuId ?? 0}`} istasyonId={istasyonId} x={x} />)}
      {cikan.map((x) => <SepetSatiri key={`${x.malzemeId}-${x.partiId ?? 0}-${x.statuId ?? 0}`} istasyonId={istasyonId} x={x} emirler={[]} emirli />)}
    </ul>
  );
}
