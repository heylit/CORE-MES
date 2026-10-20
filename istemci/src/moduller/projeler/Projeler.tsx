import { useEffect, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import type { Proje, ProjeDurumu, ProjeListesiCevabi, ProjeListesiSorgusu } from '#paylasilan/sozlesme/projeler.ts';
import { Dugme, DurumKutusu, Girdi, Kart, Rozet, Secim, Tablo, type Sutun } from '../../ortak/arayuz/index.ts';
import { api, hataIletisi } from '../../ortak/veri/api.ts';
import { sorguMetni, useListeDurumu } from '../../ortak/veri/liste-durumu.ts';
import { useOturum } from '../../ortak/veri/oturum.ts';
import { anahtarlar } from './anahtarlar.ts';
import { DURUMLAR, DURUM_METNI, DURUM_TONU, tarihMetni } from './gosterim.ts';
import { ProjeFormu } from './ProjeFormu.tsx';
import './projeler.css';

const SUTUNLAR: Sutun<Proje>[] = [
  { anahtar: 'kod', baslik: 'Proje no', sirala: true, mono: true, kirilmaz: true, hucre: (p) => p.kod },
  { anahtar: 'ad', baslik: 'Ad', sirala: true, hucre: (p) => p.ad },
  { anahtar: 'firma', baslik: 'Müşteri', hucre: (p) => p.firmaAd ?? '—' },
  { anahtar: 'baslangic', baslik: 'Başlangıç', sirala: true, mono: true, kirilmaz: true, hucre: (p) => tarihMetni(p.baslangic) },
  { anahtar: 'bitis', baslik: 'Bitiş', mono: true, kirilmaz: true, hucre: (p) => tarihMetni(p.bitis) },
  { anahtar: 'durum', baslik: 'Durum', hucre: (p) => <Rozet ton={DURUM_TONU[p.durum]}>{DURUM_METNI[p.durum]}</Rozet> },
];

const DURUM_SECENEKLERI = DURUMLAR.map((d) => ({ deger: d, baslik: DURUM_METNI[d] }));

export function Projeler() {
  const oturum = useOturum();
  const yazabilir = oturum.data?.islemler.includes('projeler.yaz') === true;
  const yonlendir = useNavigate();
  const [yeni, yeniYaz] = useState(false);
  const liste = useListeDurumu({
    suzgecler: { ara: '', durum: 'aktif' as ProjeDurumu | '' },
    suzgecDegerleri: { durum: DURUMLAR },
    siralamaAlanlari: ['kod', 'ad', 'baslangic'],
    sayfaBoyu: 50,
    adres: true,
  });
  const sorgu: ProjeListesiSorgusu = liste.sorgu;
  const l = useQuery({
    queryKey: anahtarlar.liste(sorgu),
    queryFn: () => api.get<ProjeListesiCevabi>(`/projeler${sorguMetni(sorgu)}`),
    placeholderData: keepPreviousData,
  });
  useEffect(() => { if (l.data) liste.sayfaEsitle(l.data.sayfa, liste.sorgu.sayfa); }, [l.data]);
  const suzulu = liste.suzgecler.ara.trim() !== '' || liste.suzgecler.durum !== '';

  return (
    <Kart
      baslik="Projeler"
      sag={yazabilir && <Dugme tur="birincil" simge="plus" onClick={() => { yeniYaz(true); }}>Proje ekle</Dugme>}
    >
      <div className="tc-prj-icerik">
        <div className="tc-prj-suzgec">
          <Girdi
            etiket="Ara" type="search" placeholder="Proje no ya da ad" value={liste.suzgecler.ara}
            onChange={(e) => { liste.suzgecDegistir({ ara: e.target.value }); }}
          />
          <Secim
            etiket="Durum" value={liste.suzgecler.durum} bosSecenek="Tümü" secenekler={DURUM_SECENEKLERI}
            onChange={(e) => { liste.suzgecDegistir({ durum: e.target.value as ProjeDurumu | '' }); }}
          />
        </div>
        {l.isError
          ? <DurumKutusu durum="hata" mesaj={hataIletisi(l.error, 'Projeler alınamadı')} yenile={() => { void l.refetch(); }} />
          : (
            <Tablo
              etiket="Projeler"
              sutunlar={SUTUNLAR}
              satirlar={l.data?.satirlar ?? []}
              satirAnahtari={(p) => p.id}
              mesgul={l.isPending}
              satirSec={(p) => { void yonlendir(`/projeler/${p.id}`); }}
              siralama={liste.siralama}
              siralamaDegistir={liste.siralamaDegistir}
              bosMesaj={suzulu ? 'Süzgece uyan proje yok' : 'Henüz proje yok'}
              {...(l.data ? { sayfalama: { sayfa: l.data.sayfa, sayfaBoyu: l.data.sayfaBoyu, toplam: l.data.toplam, degistir: liste.sayfaDegistir } } : {})}
            />
          )}
      </div>
      {yeni && <ProjeFormu proje={null} kapat={() => { yeniYaz(false); }} />}
    </Kart>
  );
}
