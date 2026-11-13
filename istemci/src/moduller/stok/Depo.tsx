import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import type { GozKalemi, KayitCevabi } from '#paylasilan/sozlesme/atolye.ts';
import type { DepoRaflariGovdesi, HaritaEslemeCevabi, HaritaOzetiCevabi, KoduDegisenKonum } from '#paylasilan/sozlesme/stok.ts';
import { Dugme, DurumKutusu, useBildirim } from '../../ortak/arayuz/index.ts';
import { api } from '../../ortak/veri/api.ts';
import { DepoPaneli } from '../atolye/disari.ts';
import type { DepoYazimi } from '../atolye/disari.ts';
import { anahtarlar } from './anahtarlar.ts';
import { KodDegisimPenceresi } from './Etiketler.tsx';
import { SayfaBasi, hataMetni, useIslem } from './ortak.tsx';
import { RafKodGecisiUyarisi } from './RafKodGecisi.tsx';
import './stok.css';

// Depo: Fabrika Haritası'nın depo görünümü, yalnız stok deposu yapılmış bölümlerle (kart #1304). Raf ve göz haritada tek
// kayıttır; burada eklenen ya da düzenlenen raf haritada da aynıdır. Gözün stoğu stoktan okunur.
export function Depo() {
  // Gömülü depo paneli rafı raf eylemiyle, göz kalemini depo haritası eylemiyle yazar; panel ikisi birden olana yazılır (3165 a).
  const rafYazar = useIslem('stok.raf-yaz');
  const haritaYazar = useIslem('stok.harita-yaz');
  const tanimlar = rafYazar && haritaYazar;
  const istemci = useQueryClient();
  const { bildir } = useBildirim();
  // 3135 a: kayıttan sonraki eşleme kodu değişen konumları döner; eski etiket okunmaz, pencere yeniden basmayı önerir.
  const [degisenler, setDegisenler] = useState<KoduDegisenKonum[]>([]);
  // Harita yetkisi olmayan tanım yetkilisi yalnız depo bölümünün rafını ve göz kalemini stok uçlarıyla yazar (DEP-61). Raf
  // kaydından sonra yeni gözler stok konumu olur (eşleme), stok ekranları tazelenir.
  const depoYazimi = useMemo<DepoYazimi | null>(() => (tanimlar ? {
    rafKaydet: async (salonId: number, govde: DepoRaflariGovdesi) => {
      const c = await api.post<KayitCevabi>(`/stok/depo-bolumleri/${salonId}/raflari-kaydet`, govde);
      await api.post<HaritaEslemeCevabi>('/stok/konumlar/haritadan-esle', {}).then(
        (e) => { if (e.koduDegisenler.length > 0) setDegisenler(e.koduDegisenler); },
        () => { bildir('hata', 'Stok konumları eşlenemedi; Stok > Ayarlar\'da "Haritadan eşle" ile yeniden deneyin.'); },
      );
      void istemci.invalidateQueries({ queryKey: anahtarlar.hepsi });
      return c;
    },
    kalemYaz: (govde) => api.post<GozKalemi>('/stok/depo-goz-kalemleri/yaz', govde),
    kalemSil: async (id) => { await api.post<undefined>('/stok/depo-goz-kalemleri/sil', { id }); },
  } : null), [tanimlar, istemci, bildir]);
  const o = useQuery({ queryKey: [...anahtarlar.hepsi, 'harita-ozeti'], queryFn: () => api.get<HaritaOzetiCevabi>('/stok/harita-ozeti') });
  const salonIdler = useMemo(() => o.data?.bolumler.filter((b) => b.depoKod !== null).map((b) => b.salonId), [o.data]);
  return (
    <section className="tc-stok">
      <SayfaBasi baslik="Depo" aciklama="Raflar, bölmeler ve gözler. Göze basınca içindeki stok açılır." />
      <RafKodGecisiUyarisi />
      {o.isError && <DurumKutusu durum="hata" mesaj={hataMetni(o.error)} yenile={() => void o.refetch()} />}
      {o.isPending && <DurumKutusu durum="yukleniyor" />}
      {salonIdler && salonIdler.length === 0 && (
        <>
          <DurumKutusu durum="bos" mesaj="Fabrika Haritası'nda stok deposu yapılmış bölüm yok." />
          {haritaYazar && <Link to="/stok/ayarlar"><Dugme simge="tool">Ayarlar'da bölümü depo yap</Dugme></Link>}
        </>
      )}
      {salonIdler && salonIdler.length > 0 && <DepoPaneli salonIdler={salonIdler} depoYazimi={depoYazimi} />}
      {degisenler.length > 0 && <KodDegisimPenceresi degisenler={degisenler} kapat={() => setDegisenler([])} />}
    </section>
  );
}
