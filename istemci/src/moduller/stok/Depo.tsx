import { useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import type { GozKalemi, KayitCevabi } from '#paylasilan/sozlesme/atolye.ts';
import type { DepoRaflariGovdesi, HaritaEslemeCevabi, HaritaOzetiCevabi } from '#paylasilan/sozlesme/stok.ts';
import { Dugme, DurumKutusu } from '../../ortak/arayuz/index.ts';
import { api } from '../../ortak/veri/api.ts';
import { DepoPaneli } from '../atolye/disari.ts';
import type { DepoYazimi } from '../atolye/disari.ts';
import { anahtarlar } from './anahtarlar.ts';
import { SayfaBasi, hataMetni, useIslem } from './ortak.tsx';
import './stok.css';

// Depo: Fabrika Haritası'nın depo görünümü, yalnız stok deposu yapılmış bölümlerle (kart #1304). Raf ve göz haritada tek
// kayıttır; burada eklenen ya da düzenlenen raf haritada da aynıdır. Gözün stoğu stoktan okunur.
export function Depo() {
  const tanimlar = useIslem('stok.tanim');
  const istemci = useQueryClient();
  // Harita yetkisi olmayan tanım yetkilisi yalnız depo bölümünün rafını ve göz kalemini stok uçlarıyla yazar (DEP-61). Raf
  // kaydından sonra yeni gözler stok konumu olur (eşleme), stok ekranları tazelenir.
  const depoYazimi = useMemo<DepoYazimi | null>(() => (tanimlar ? {
    rafKaydet: async (salonId: number, govde: DepoRaflariGovdesi) => {
      const c = await api.post<KayitCevabi>(`/stok/depo-bolumleri/${salonId}/raflari-kaydet`, govde);
      await api.post<HaritaEslemeCevabi>('/stok/konumlar/haritadan-esle', {}).catch(() => undefined);
      void istemci.invalidateQueries({ queryKey: anahtarlar.hepsi });
      return c;
    },
    kalemYaz: (govde) => api.post<GozKalemi>('/stok/depo-goz-kalemleri/yaz', govde),
    kalemSil: async (id) => { await api.post<undefined>('/stok/depo-goz-kalemleri/sil', { id }); },
  } : null), [tanimlar, istemci]);
  const o = useQuery({ queryKey: [...anahtarlar.hepsi, 'harita-ozeti'], queryFn: () => api.get<HaritaOzetiCevabi>('/stok/harita-ozeti') });
  const salonIdler = useMemo(() => o.data?.bolumler.filter((b) => b.depoKod !== null).map((b) => b.salonId), [o.data]);
  return (
    <section className="tc-stok">
      <SayfaBasi baslik="Depo" alt="Raflar, bölmeler ve gözler. Göze basınca içindeki stok açılır." />
      {o.isError && <DurumKutusu durum="hata" mesaj={hataMetni(o.error)} yenile={() => void o.refetch()} />}
      {o.isPending && <DurumKutusu durum="yukleniyor" />}
      {salonIdler && salonIdler.length === 0 && (
        <>
          <DurumKutusu durum="bos" mesaj="Fabrika Haritası'nda stok deposu yapılmış bölüm yok." />
          {tanimlar && <Link to="/stok/ayarlar"><Dugme simge="tool">Ayarlar'da bölümü depo yap</Dugme></Link>}
        </>
      )}
      {salonIdler && salonIdler.length > 0 && <DepoPaneli salonIdler={salonIdler} depoYazimi={depoYazimi} />}
    </section>
  );
}
