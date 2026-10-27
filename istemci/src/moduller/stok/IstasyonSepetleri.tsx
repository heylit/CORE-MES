import { useQuery } from '@tanstack/react-query';
import type { IstasyonSepetleriCevabi } from '#paylasilan/sozlesme/stok.ts';
import { DurumKutusu, Rozet, Simge } from '../../ortak/arayuz/index.ts';
import { api } from '../../ortak/veri/api.ts';
import { TESLIM_KUTUSU } from './is-malzeme-durumu.ts';
import { hataMetni } from './ortak.tsx';
import { GelenTeslim, OncekiSepetSatiri, SepetSatiri } from './sepet-satirlari.tsx';
import './stok.css';

// Terminalin iki sepeti (745, karar 758 a): seçili emir için gelen (önceki istasyonda üretilen; Teslim al çeker) ve çıkan (burada
// üretilen; sonraki istasyona gönderilir). Düğmeler Malzeme · Teslim panelinin satırlarıdır; bir komut bütün stok okumalarını yeniler.
export const istasyonSepetleriAnahtari = (istasyonId: number, uretimEmriId: number) => [...TESLIM_KUTUSU, 'istasyon-sepetleri', istasyonId, uretimEmriId] as const;

const useIstasyonSepetleri = (istasyonId: number | null, uretimEmriId: number | null) => useQuery({
  queryKey: istasyonSepetleriAnahtari(istasyonId ?? 0, uretimEmriId ?? 0),
  queryFn: () => api.get<IstasyonSepetleriCevabi>(`/stok/teslim-kutusu/istasyon-sepetleri?istasyonId=${istasyonId}&uretimEmriId=${uretimEmriId}`),
  enabled: istasyonId !== null && uretimEmriId !== null,
  refetchInterval: 60_000,
  retry: false,
});

// Terminal çipi için iki sepetin sayısı (aynı okuma, aynı önbellek); okunamadıysa null.
export function useIstasyonSepetiSayilari(istasyonId: number | null, uretimEmriId: number | null): { gelen: number; cikan: number } | null {
  const s = useIstasyonSepetleri(istasyonId, uretimEmriId);
  return s.data ? { gelen: s.data.gelen.bekleyen.length + s.data.gelen.yolda.length, cikan: s.data.cikan.length } : null;
}

export function IstasyonSepetleri({ istasyonId, uretimEmriId }: { istasyonId: number; uretimEmriId: number }) {
  const s = useIstasyonSepetleri(istasyonId, uretimEmriId);
  if (s.isPending) return <DurumKutusu durum="yukleniyor" />;
  if (s.isError) return <DurumKutusu durum="hata" mesaj={hataMetni(s.error)} yenile={() => { void s.refetch(); }} />;
  const { gelen, cikan } = s.data;
  const gelenSayi = gelen.bekleyen.length + gelen.yolda.length;
  return (
    <div className="tc-stok-iki">
      <section aria-label="Gelen sepet">
        <h3 className="tc-stok-teslim-baslik"><Simge ad="download" boyut="k" /> Gelen {gelenSayi > 0 && <Rozet ton="bilgi">{gelenSayi}</Rozet>}</h3>
        {gelenSayi === 0 ? <DurumKutusu durum="bos" mesaj="Önceki istasyondan bekleyen parça yok." /> : (
          <ul className="tc-stok-isler tc-stok-teslim-liste" aria-label="Gelen">
            {gelen.yolda.map((t) => <GelenTeslim key={`t-${t.id}`} t={t} />)}
            {gelen.bekleyen.map((x) => <OncekiSepetSatiri key={`${x.kaynak.id}-${x.malzemeId}-${x.partiId ?? 0}-${x.statuId ?? 0}`} istasyonId={istasyonId} x={x} />)}
          </ul>
        )}
      </section>
      <section aria-label="Çıkan sepet">
        <h3 className="tc-stok-teslim-baslik"><Simge ad="upload" boyut="k" /> Çıkan {cikan.length > 0 && <Rozet ton="bilgi">{cikan.length}</Rozet>}</h3>
        {cikan.length === 0 ? <DurumKutusu durum="bos" mesaj="Bu istasyonda bu emrin parçası yok." /> : (
          <ul className="tc-stok-isler tc-stok-teslim-liste" aria-label="Çıkan">
            {cikan.map((x) => <SepetSatiri key={`${x.malzemeId}-${x.partiId ?? 0}-${x.statuId ?? 0}`} istasyonId={istasyonId} x={x} emirler={[]} emirli />)}
          </ul>
        )}
      </section>
    </div>
  );
}
