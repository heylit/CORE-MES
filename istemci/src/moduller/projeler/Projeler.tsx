import { useEffect, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import type { Proje, ProjeDurumu, ProjeListesiCevabi, ProjeListesiSorgusu, StatuListesiCevabi } from '#paylasilan/sozlesme/projeler.ts';
import {
  Dugme, DurumKutusu, KademeRozeti, LogoBelgeAramasi, Girdi, Kart, LOGO_DURUM_ADI, LogoRozeti, Rozet, Secim, Tablo, useLogoRozetleri, type Sutun,
} from '../../ortak/arayuz/index.ts';
import { api, hataIletisi } from '../../ortak/veri/api.ts';
import { sorguMetni, useListeDurumu } from '../../ortak/veri/liste-durumu.ts';
import { useOturum } from '../../ortak/veri/oturum.ts';
import { anahtarlar } from './anahtarlar.ts';
import { DURUMLAR, DURUM_METNI, DURUM_TONU, GOREV_ISLEMI, tarihMetni } from './gosterim.ts';
import { ProjeFormu } from './ProjeFormu.tsx';
import { Ilerleme } from './ProjeGorevleri.tsx';
import { StatuCipi } from './StatuPenceresi.tsx';
import './projeler.css';

const SUTUNLAR: Sutun<Proje>[] = [
  { anahtar: 'kod', baslik: 'Proje no', sirala: true, mono: true, kirilmaz: true, hucre: (p) => p.kod },
  { anahtar: 'ad', baslik: 'Ad', sirala: true, hucre: (p) => p.ad },
  { anahtar: 'firma', baslik: 'Müşteri', hucre: (p) => p.firmaAd ?? '—' },
  { anahtar: 'firmaKodu', baslik: 'Firma kodu', hucre: (p) => p.firmaKodu ?? '—' },
  { anahtar: 'baslangic', baslik: 'Başlangıç', sirala: true, mono: true, kirilmaz: true, hucre: (p) => tarihMetni(p.baslangic) },
  {
    // 3588: bitişi yaklaşan ya da geçen proje, bildirimle aynı rozeti taşır (ortak parça).
    anahtar: 'bitis', baslik: 'Bitiş', mono: true, kirilmaz: true, csv: (p) => p.bitis ?? '',
    hucre: (p) => (p.kademe == null ? tarihMetni(p.bitis) : <span className="tc-prj-bitis-hucre">{tarihMetni(p.bitis)}<KademeRozeti kademe={p.kademe} /></span>),
  },
  { anahtar: 'statu', baslik: 'Statü', hucre: (p) => <StatuCipi statu={p.statu} />, csv: (p) => p.statu?.ad ?? '' },
  { anahtar: 'ilerleme', baslik: 'Görev ilerlemesi', hucre: (p) => <Ilerleme deger={p.ilerleme} />, csv: (p) => p.ilerleme },
  { anahtar: 'durum', baslik: 'Durum', hucre: (p) => <Rozet ton={DURUM_TONU[p.durum]}>{DURUM_METNI[p.durum]}</Rozet> },
];

const DURUM_SECENEKLERI = DURUMLAR.map((d) => ({ deger: d, baslik: DURUM_METNI[d] }));

export function Projeler() {
  const oturum = useOturum();
  const yazabilir = oturum.data?.islemler.includes('projeler.yaz') === true;
  const dagitir = oturum.data?.islemler.includes(GOREV_ISLEMI) === true;
  const yonlendir = useNavigate();
  const [yeni, yeniYaz] = useState(false);
  const liste = useListeDurumu({
    suzgecler: { ara: '', durum: 'aktif' as ProjeDurumu | '', statuId: '' as number | '' },
    suzgecTurleri: { statuId: 'sayi' },
    suzgecDegerleri: { durum: DURUMLAR },
    siralamaAlanlari: ['kod', 'ad', 'baslangic'],
    sayfaBoyu: 50,
    adres: true,
  });
  const sorgu: ProjeListesiSorgusu = liste.sorgu;
  const statuler = useQuery({ queryKey: anahtarlar.statuler, queryFn: () => api.get<StatuListesiCevabi>('/projeler/statuler') });
  const statuSecenekleri = (statuler.data?.statuler ?? []).map((s) => ({ deger: String(s.id), baslik: s.etkin ? s.ad : `${s.ad} (kapalı)` }));
  const l = useQuery({
    queryKey: anahtarlar.liste(sorgu),
    queryFn: () => api.get<ProjeListesiCevabi>(`/projeler${sorguMetni(sorgu)}`),
    placeholderData: keepPreviousData,
  });
  useEffect(() => { if (l.data) liste.sayfaEsitle(l.data.sayfa, liste.sorgu.sayfa); }, [l.data]);
  // 3344: Logo'ya gidiş rozeti, görünen satırlar için tek istek.
  const logo = useLogoRozetleri('proje', (l.data?.satirlar ?? []).map((p) => p.id));
  // Proje listesi dokuz sütunla 1280'de sığmıyor: Logo durumu Durum hücresinde, "Logo: …" önekiyle proje durumunun altında.
  // 3768: Firma kodu bizim firma kodumuzdur (3399 a), müşteri kodu değil. Görünen satırların hiçbirinde yoksa sütun çizilmez: kod
  // listesi tanımlı olmayan kurulumda boş sütun müşterinin kodu eksikmiş gibi okunuyordu.
  const kodlu = (l.data?.satirlar ?? []).some((p) => p.firmaKodu !== null);
  const sutunlar: Sutun<Proje>[] = SUTUNLAR.filter((s) => kodlu || s.anahtar !== 'firmaKodu').map((s) => (s.anahtar !== 'durum' ? s : {
    ...s,
    baslik: 'Durum · Logo',
    hucre: (p: Proje) => {
      const d = logo.durum(p.id);
      return (
        <span className="tc-logo-rozet-hucre">
          <Rozet ton={DURUM_TONU[p.durum]}>{DURUM_METNI[p.durum]}</Rozet>
          <LogoRozeti bilgi={d} hata={logo.hata} baslik />
          {!logo.hata && d?.neden && <small className="tc-logo-rozet-neden" title={d.neden}>{d.neden}</small>}
        </span>
      );
    },
    csv: (p: Proje) => { const d = logo.durum(p.id); return d === null ? DURUM_METNI[p.durum] : `${DURUM_METNI[p.durum]}; Logo: ${LOGO_DURUM_ADI[d.durum]}`; },
  }));
  const suzulu = liste.suzgecler.ara.trim() !== '' || liste.suzgecler.durum !== '' || liste.suzgecler.statuId !== '';

  return (
    <Kart
      baslik="Projeler"
      sag={(
        <span className="tc-prj-islemler">
          <LogoBelgeAramasi tur="proje" />
          {yazabilir && <Dugme tur="birincil" simge="plus" onClick={() => { yeniYaz(true); }}>Proje ekle</Dugme>}
        </span>
      )}
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
          <Secim
            etiket="Statü" value={String(liste.suzgecler.statuId)} bosSecenek="Tümü" secenekler={statuSecenekleri}
            onChange={(e) => { liste.suzgecDegistir({ statuId: e.target.value === '' ? '' : Number(e.target.value) }); }}
          />
        </div>
        {l.isError
          ? <DurumKutusu durum="hata" mesaj={hataIletisi(l.error, 'Projeler alınamadı')} yenile={() => { void l.refetch(); }} />
          : (
            <div className="tc-prj-liste-tablo">
              <Tablo
                etiket="Projeler"
                sutunlar={sutunlar}
                satirlar={l.data?.satirlar ?? []}
                satirAnahtari={(p) => p.id}
                mesgul={l.isPending}
                satirSec={(p) => { void yonlendir(`/projeler/${p.id}`); }}
                siralama={liste.siralama}
                siralamaDegistir={liste.siralamaDegistir}
                bosMesaj={suzulu ? 'Süzgece uyan proje yok' : 'Henüz proje yok'}
                // Başlangıç süzgeci "Aktif" olduğundan yeni kurulumda da süzgeç dolu görünür; ilk projeyi açan düğme süzgeçliyken de durur.
                bosEylem={l.isPending ? undefined : (
                  <div className="tc-durum-eylemler">
                    {suzulu && <Dugme simge="x" onClick={liste.suzgecleriTemizle}>Süzgeci temizle</Dugme>}
                    {yazabilir && <Dugme simge="plus" onClick={() => { yeniYaz(true); }}>Proje ekle</Dugme>}
                  </div>
                )}
                {...(l.data ? { sayfalama: { sayfa: l.data.sayfa, sayfaBoyu: l.data.sayfaBoyu, toplam: l.data.toplam, degistir: liste.sayfaDegistir } } : {})}
              />
            </div>
          )}
      </div>
      {yeni && (
        <ProjeFormu
          proje={null} kapat={() => { yeniYaz(false); }}
          acildi={(p, sablon) => {
            // 3458-2 a: yeni projede ilk iş görevleri dağıtmaktır; görev yazamayan ya da "Şablonsuz" seçen projeye gider.
            void yonlendir(sablon === null || !dagitir ? `/projeler/${p.id}` : `/projeler/${p.id}/gorev-dagit${sablon === '' ? '' : `?sablon=${sablon}`}`);
          }}
        />
      )}
    </Kart>
  );
}
