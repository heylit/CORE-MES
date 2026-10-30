import { useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import type { Alet, ListeCevabi, TurListesiCevabi } from '#paylasilan/sozlesme/kalibrasyon.ts';
import { tesisGunu } from '#paylasilan/tesis-zamani.ts';
import { Dugme, DurumKutusu, Girdi, Kart, Rozet, Tablo, type Sutun } from '../../ortak/arayuz/index.ts';
import { api, hataIletisi } from '../../ortak/veri/api.ts';
import { useOturum } from '../../ortak/veri/oturum.ts';
import { AletAyrinti, type AdresFormu } from './AletAyrinti.tsx';
import { AletTuru } from './alet-simgeleri.tsx';
import { Turler } from './Turler.tsx';
import { anahtarlar } from './anahtarlar.ts';
import { AletFormu } from './formlar.tsx';
import { DURUM_TONU, aletlerCsv, durumMetni, tarihMetni } from './gosterim.ts';
import './kalibrasyon.css';

// Bölümü kabuğun ikinci menüsü seçer (paylasilan/sayfalar/kalibrasyon.ts); her bölüm kendi adresindedir.
type SekmeAnahtari = 'aletler' | 'turler';

// Açık alet ve pencere adreste durur ki genel arama ve Ctrl K komutları onları açabilsin (kart #1243):
// `?alet=<id>` ayrıntıyı, `&form=kalibrasyon|duzenle` aletin formunu, `?yeni=1` yeni alet ya da tür formunu açar.
const ADRES_FORMLARI: readonly AdresFormu[] = ['kalibrasyon', 'duzenle'];
const aletKimligi = (deger: string | null): number | null => (deger !== null && /^[1-9]\d{0,9}$/.test(deger) ? Number(deger) : null);
const adresFormu = (deger: string | null): AdresFormu | null => ADRES_FORMLARI.find((f) => f === deger) ?? null;

const SUTUNLAR: Sutun<Alet>[] = [
  { anahtar: 'no', baslik: 'Alet no', hucre: (a) => a.no, mono: true },
  { anahtar: 'tur', baslik: 'Tür', hucre: (a) => <AletTuru tur={a.tur} /> },
  { anahtar: 'ad', baslik: 'Ad / aralık', hucre: (a) => [a.ad, a.olcmeAraligi].filter((m) => m !== null).join(' · ') },
  { anahtar: 'yer', baslik: 'Yer', hucre: (a) => a.yer },
  { anahtar: 'periyot', baslik: 'Periyot (gün)', hucre: (a) => a.periyotGun, hizala: 'sag', mono: true },
  { anahtar: 'son', baslik: 'Son kalibrasyon', hucre: (a) => tarihMetni(a.sonKalibrasyon), mono: true },
  { anahtar: 'vade', baslik: 'Vade', hucre: (a) => tarihMetni(a.vade), mono: true },
  { anahtar: 'durum', baslik: 'Durum', hucre: (a) => <Rozet ton={DURUM_TONU[a.durum]}>{durumMetni(a)}</Rozet> },
];

// Ekrandaki (aramaya uyan) satırlar iner; Arkon ölçü aletleri sekmesindeki dışa aktarmanın karşılığı.
function csvIndir(aletler: readonly Alet[]) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([aletlerCsv(aletler)], { type: 'text/csv;charset=utf-8' }));
  a.download = `olcu-aletleri-${tesisGunu(Date.now())}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export function OlcuAletleri({ sekme = 'aletler' }: { sekme?: SekmeAnahtari }) {
  const oturum = useOturum();
  const yazabilir = oturum.data?.islemler.includes('kalibrasyon.yaz') === true;
  const [ara, araYaz] = useState('');
  const [adres, adresYaz] = useSearchParams();
  const secili = aletKimligi(adres.get('alet'));
  const form = adresFormu(adres.get('form'));
  const adresteYeni = adres.get('yeni') === '1';
  const [yeniAlet, yeniAletYaz] = useState(false);
  const adresiDegistir = (degistir: (a: URLSearchParams) => void) => {
    adresYaz((onceki) => {
      const yeni = new URLSearchParams(onceki);
      degistir(yeni);
      return yeni;
    }, { replace: true });
  };
  const seciliYaz = (id: number | null) => {
    adresiDegistir((a) => {
      if (id === null) a.delete('alet'); else a.set('alet', String(id));
      a.delete('form');
    });
  };
  const yeniKapandi = () => { adresiDegistir((a) => { a.delete('yeni'); }); };

  const liste = useQuery({
    queryKey: anahtarlar.liste(ara.trim()),
    queryFn: () => api.get<ListeCevabi>(`/olcu-aletleri${ara.trim() === '' ? '' : `?ara=${encodeURIComponent(ara.trim())}`}`),
    placeholderData: keepPreviousData,
  });
  const turler = useQuery({ queryKey: anahtarlar.turler, queryFn: () => api.get<TurListesiCevabi>('/olcu-aleti-turleri') });
  const turListesi = turler.data?.turler ?? [];

  return (
    <Kart
      baslik="Ölçü aletleri"
      sag={sekme === 'aletler' && (
        <>
          <Dugme simge="download" disabled={!liste.data?.aletler.length} onClick={() => { if (liste.data) csvIndir(liste.data.aletler); }}>CSV</Dugme>
          {yazabilir && <Dugme tur="birincil" simge="plus" onClick={() => { yeniAletYaz(true); }}>Alet ekle</Dugme>}
        </>
      )}
    >
      <div className="tc-kal-icerik">
        {sekme === 'turler' && (
          turler.isError
            ? <DurumKutusu durum="hata" mesaj={hataIletisi(turler.error, 'Türler alınamadı')} yenile={() => { void turler.refetch(); }} />
            : turler.isPending ? <DurumKutusu durum="yukleniyor" /> : <Turler turler={turListesi} yazabilir={yazabilir} yeni={adresteYeni} yeniKapandi={yeniKapandi} />
        )}
        {sekme === 'aletler' && (
          <>
            {liste.data && (
              <p className="tc-kal-ozet">
                <Rozet ton={liste.data.ozet.vadesiGecen > 0 ? 'hata' : 'pasif'}>Kalibrasyonu geçmiş: {liste.data.ozet.vadesiGecen}</Rozet>
                <Rozet ton={liste.data.ozet.yaklasan > 0 ? 'uyari' : 'pasif'}>30 gün içinde: {liste.data.ozet.yaklasan}</Rozet>
              </p>
            )}
            <Girdi etiket="Ara" type="search" placeholder="Alet no, tür, ad veya yer" value={ara} onChange={(e) => araYaz(e.target.value)} />
            {liste.isPending && <DurumKutusu durum="yukleniyor" />}
            {liste.isError && <DurumKutusu durum="hata" mesaj={hataIletisi(liste.error, 'Aletler alınamadı')} yenile={() => { void liste.refetch(); }} />}
            {liste.data && (
              <Tablo
                etiket="Ölçü aletleri"
                sutunlar={SUTUNLAR}
                satirlar={liste.data.aletler}
                satirAnahtari={(a) => a.id}
                satirSec={(a) => { seciliYaz(a.id); }}
                bosMesaj={ara.trim() === '' ? 'Henüz ölçü aleti yok' : 'Aramaya uyan alet yok'}
              />
            )}
          </>
        )}
      </div>
      {secili !== null && sekme === 'aletler' && (
        <AletAyrinti
          id={secili}
          yazabilir={yazabilir}
          turler={turListesi}
          kapat={() => { seciliYaz(null); }}
          form={form}
          formKapandi={() => { adresiDegistir((a) => { a.delete('form'); }); }}
        />
      )}
      {sekme === 'aletler' && yazabilir && (yeniAlet || adresteYeni) && (
        <AletFormu alet={null} turler={turListesi} kapat={() => { yeniAletYaz(false); yeniKapandi(); }} />
      )}
    </Kart>
  );
}

export const AletTurleri = () => <OlcuAletleri sekme="turler" />;
