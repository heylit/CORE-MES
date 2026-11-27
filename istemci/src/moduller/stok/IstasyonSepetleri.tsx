import { useQuery } from '@tanstack/react-query';
import type { IsMalzemeleriCevabi, IstasyonSepetleriCevabi } from '#paylasilan/sozlesme/stok.ts';
import { DurumKutusu, Rozet, Simge } from '../../ortak/arayuz/index.ts';
import { api } from '../../ortak/veri/api.ts';
import { TESLIM_KUTUSU, useIsMalzemeleri } from './is-malzeme-durumu.ts';
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

// Terminal tüpleri adet gösterir; sepette kg ya da metre satırı da olabilir, onlar adete katılmaz. Birim işin girdilerinden bilinir
// (is-malzemeleri, kartın birimi). Girdi olmayan satır emrin ürünüyse (kodu ürün kodu) üretilen parçadır, adet sayılır. Birimi
// adet olmayan ya da bilinmeyen satır toplama girmez; bütün satırlar sepet penceresinde birimiyle görünür.
export function sepetAdetleri(d: IstasyonSepetleriCevabi, isler: IsMalzemeleriCevabi['isler'], uretimEmriId: number, urunKodu: string | null): { gelenAdet: number; cikanAdet: number } {
  const birimler = new Map(isler.filter((x) => x.uretimEmriId === uretimEmriId).flatMap((x) => x.malzemeler).map((m) => [m.malzemeId, m.birim] as const));
  const kodlar = new Map([...d.gelen.bekleyen, ...d.cikan].map((x) => [x.malzemeId, x.kod] as const));
  const adetMi = (malzemeId: number): boolean => {
    if (birimler.has(malzemeId)) return birimler.get(malzemeId)?.trim().toLocaleLowerCase('tr') === 'adet';
    const kod = kodlar.get(malzemeId) ?? null;
    return urunKodu !== null && kod !== null && kod === urunKodu;
  };
  const topla = (l: readonly { malzemeId: number; miktar: string }[]) => l.reduce((t, x) => (adetMi(x.malzemeId) ? t + Number(x.miktar) : t), 0);
  return { gelenAdet: topla(d.gelen.bekleyen) + topla(d.gelen.yolda), cikanAdet: topla(d.cikan) };
}

// Terminal çipi için iki sepetin satır sayısı ve tüpler için adetleri (aynı okumalar, aynı önbellek); okunamadıysa null.
export function useIstasyonSepetiSayilari(istasyonId: number | null, uretimEmriId: number | null, urunKodu: string | null = null): { gelen: number; cikan: number; gelenAdet: number | null; cikanAdet: number | null } | null {
  const s = useIstasyonSepetleri(istasyonId, uretimEmriId);
  const girdiler = useIsMalzemeleri(istasyonId, uretimEmriId);
  if (!s.data || uretimEmriId === null) return null;
  const d = s.data;
  const adet = girdiler.data ? sepetAdetleri(d, girdiler.data.isler, uretimEmriId, urunKodu) : null;
  return { gelen: d.gelen.bekleyen.length + d.gelen.yolda.length, cikan: d.cikan.length, gelenAdet: adet?.gelenAdet ?? null, cikanAdet: adet?.cikanAdet ?? null };
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
      <CikanBolumu istasyonId={istasyonId} cikan={cikan} />
    </div>
  );
}

function CikanBolumu({ istasyonId, cikan }: { istasyonId: number; cikan: IstasyonSepetleriCevabi['cikan'] }) {
  return (
    <section aria-label="Çıkan sepet">
      <h3 className="tc-stok-teslim-baslik"><Simge ad="upload" boyut="k" /> Çıkan {cikan.length > 0 && <Rozet ton="bilgi">{cikan.length}</Rozet>}</h3>
      {cikan.length === 0 ? <DurumKutusu durum="bos" mesaj="Bu istasyonda bu emrin parçası yok." /> : (
        <ul className="tc-stok-isler tc-stok-teslim-liste" aria-label="Çıkan">
          {cikan.map((x) => <SepetSatiri key={`${x.malzemeId}-${x.partiId ?? 0}-${x.statuId ?? 0}`} istasyonId={istasyonId} x={x} emirler={[]} emirli />)}
        </ul>
      )}
    </section>
  );
}

// 1337 a: iş bitince terminalin özetinde yalnız çıkan sepet ("Sonraki istasyona"); iki sepetle aynı okuma ve önbellek.
export function CikanSepet({ istasyonId, uretimEmriId }: { istasyonId: number; uretimEmriId: number }) {
  const s = useIstasyonSepetleri(istasyonId, uretimEmriId);
  if (s.isPending) return <DurumKutusu durum="yukleniyor" />;
  if (s.isError) return <DurumKutusu durum="hata" mesaj={hataMetni(s.error)} yenile={() => { void s.refetch(); }} />;
  return <CikanBolumu istasyonId={istasyonId} cikan={s.data.cikan} />;
}
