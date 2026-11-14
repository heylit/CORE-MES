import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { EMIR_DURUMU } from '#paylasilan/sozlesme/emir-durumu.ts';
import { EMIR_TURU_ADLARI } from '#paylasilan/sozlesme/emir-turleri.ts';
import type { BitisBaglaGovdesi, Proje, ProjeSiparisKalemi, ProjeSiparisKalemleriCevabi } from '#paylasilan/sozlesme/projeler.ts';
import type { AdimliEmirOzeti, AdimliListeCevabi } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import { Dugme, DurumKutusu, Kart, Rozet, Tablo, useBildirim, type Sutun } from '../../ortak/arayuz/index.ts';
import { api, hataIletisi } from '../../ortak/veri/api.ts';
import { anahtarlar } from './anahtarlar.ts';
import { tarihMetni } from './gosterim.ts';

// Ondalık metin sondaki sıfırlar atılarak yazılır (10.000 -> 10, 2.500 -> 2,5).
const miktarMetni = (m: string): string => m.replace(/\.?0+$/, '').replace('.', ',');

// 3244 b: bitişin sipariş terminine bağı. Bağlıysa termin kayınca bitiş de kayar; elle değişen bitiş bağı koparır, "Siparişe bağla" geri bağlar.
export function BitisBagi({ proje, yazabilir }: { proje: Proje; yazabilir: boolean }) {
  const istemci = useQueryClient();
  const { bildir } = useBildirim();
  const bagla = useMutation({
    mutationFn: () => api.post<Proje>(`/projeler/${proje.id}/bitis-bagla`, { surum: proje.surum } satisfies BitisBaglaGovdesi),
    onSuccess: async (kayit) => {
      istemci.setQueryData(anahtarlar.ayrinti(proje.id), kayit);
      await istemci.invalidateQueries({ queryKey: anahtarlar.kok });
    },
    onError: (h) => { bildir('hata', hataIletisi(h, 'Bitiş bağlanamadı')); },
  });
  if (proje.siparisId === null) return null;
  if (proje.bitisBagli) return <Rozet ton="pasif" gorunum="cizgi">Sipariş terminine bağlı</Rozet>;
  return (
    <span className="tc-prj-bag">
      <Rozet ton="uyari" gorunum="cizgi">Elle</Rozet>
      {yazabilir && proje.durum === 'aktif' && (
        <Dugme simge="route" yukleniyor={bagla.isPending} onClick={() => { bagla.mutate(); }}>Siparişe bağla</Dugme>
      )}
    </span>
  );
}

function KalemEmirleri({ kalem, emirler }: { kalem: ProjeSiparisKalemi; emirler: AdimliEmirOzeti[] }) {
  if (emirler.length === 0) return <span className="tc-prj-soluk">Emir yok</span>;
  return (
    <ul className="tc-prj-kalem-emirleri">
      {emirler.map((e) => (
        <li key={e.id}>
          <Link to={`/uretim-emirleri?ara=${encodeURIComponent(e.emirNo)}`}>{e.emirNo}</Link>
          {e.emirTuru !== undefined && <span className="tc-prj-soluk">{EMIR_TURU_ADLARI[e.emirTuru]}</span>}
          <span className="tc-prj-soluk">{e.adet} ad · teslim {tarihMetni(e.teslim)}</span>
          <Rozet ton={EMIR_DURUMU[e.durum].ton}>{EMIR_DURUMU[e.durum].etiket}</Rozet>
          {e.teslim !== null && e.teslim !== kalem.termin && <Rozet ton="uyari" gorunum="cizgi">Teslim termin dışı</Rozet>}
        </li>
      ))}
    </ul>
  );
}

// 3244 (madde 12): siparişten gelen kalemler terminleri, üretim çeşidi partileri ve açılan emirleriyle. Emirler yalnız emir okuyabilene.
export function ProjeKalemleri({ proje, emirleriGorur, yazabilir }: { proje: Proje; emirleriGorur: boolean; yazabilir: boolean }) {
  const sorgu = useQuery({
    queryKey: anahtarlar.kalemler(proje.id),
    queryFn: () => api.get<ProjeSiparisKalemleriCevabi>(`/projeler/${proje.id}/siparis-kalemleri`),
  });
  const emirSorgusu = useQuery({
    queryKey: anahtarlar.emirler(proje.id),
    queryFn: () => api.get<AdimliListeCevabi>(`/adimli-emirler?projeId=${proje.id}`),
    enabled: emirleriGorur,
  });
  const emirler = (emirSorgusu.data?.emirler ?? []).filter((e) => e.projeId === proje.id);
  const sutunlar: Sutun<ProjeSiparisKalemi>[] = [
    { anahtar: 'sira', baslik: 'Kalem', hizala: 'sag', mono: true, hucre: (k) => k.sira },
    {
      anahtar: 'malzeme', baslik: 'Malzeme',
      hucre: (k) => (k.malzemeKodu === null ? `#${k.malzemeNo}` : `${k.malzemeKodu} · ${k.malzemeAdi ?? ''}`),
    },
    { anahtar: 'miktar', baslik: 'Miktar', hizala: 'sag', mono: true, hucre: (k) => `${miktarMetni(k.miktar)} ${k.birim ?? ''}`.trim() },
    {
      anahtar: 'termin', baslik: 'Termin',
      hucre: (k) => (
        <span className="tc-prj-bag">
          <span className="tc-prj-tarih">{tarihMetni(k.termin)}</span>
          {k.terminElle ? <Rozet ton="uyari" gorunum="cizgi">Elle</Rozet> : <Rozet ton="pasif" gorunum="cizgi">Sipariş termini</Rozet>}
        </span>
      ),
    },
    {
      anahtar: 'partiler', baslik: 'Üretim çeşidi',
      hucre: (k) => (k.partiler.length === 0
        ? EMIR_TURU_ADLARI.seri
        : (
          <span className="tc-prj-parti-cipleri">
            {k.partiler.map((p) => <Rozet key={p.id} ton="bilgi" gorunum="cizgi">{`${miktarMetni(p.adet)} ${EMIR_TURU_ADLARI[p.emirTuru]}`}</Rozet>)}
          </span>
        )),
    },
    ...(emirleriGorur
      ? [{
        anahtar: 'emirler', baslik: 'Üretim emirleri',
        hucre: (k: ProjeSiparisKalemi) => <KalemEmirleri kalem={k} emirler={emirler.filter((e) => e.siparisSatiriId === k.id)} />,
      }]
      : []),
  ];
  const veri = sorgu.data;
  return (
    <Kart baslik={veri?.siparisNo ? `Sipariş kalemleri · ${veri.siparisNo}` : 'Sipariş kalemleri'}>
      {sorgu.isError
        ? <DurumKutusu durum="hata" mesaj={hataIletisi(sorgu.error, 'Sipariş kalemleri alınamadı')} yenile={() => { void sorgu.refetch(); }} />
        : (
          <>
            {veri && veri.siparisTermini !== null && (
              <p className="tc-prj-bag">
                <span>Sipariş termini {tarihMetni(veri.siparisTermini)} · Proje bitişi {tarihMetni(proje.bitis)}</span>
                <BitisBagi proje={proje} yazabilir={yazabilir} />
              </p>
            )}
            <Tablo
              etiket="Projenin sipariş kalemleri"
              sutunlar={sutunlar}
              satirlar={veri?.kalemler ?? []}
              satirAnahtari={(k) => k.id}
              mesgul={sorgu.isPending}
              bosMesaj="Bu proje siparişten açılmadı"
            />
            {emirSorgusu.isError && <DurumKutusu durum="hata" mesaj={hataIletisi(emirSorgusu.error, 'Üretim emirleri alınamadı')} />}
          </>
        )}
    </Kart>
  );
}
