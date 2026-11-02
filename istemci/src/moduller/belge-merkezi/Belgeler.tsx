import { useEffect, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import type { BelgeListesiCevabi, BelgeListesiSorgusu, BelgeSatiri, BelgeTuru } from '#paylasilan/sozlesme/belge-merkezi.ts';
import { Dugme, DurumKutusu, Girdi, Kart, Rozet, Sekmeler, Simge, Tablo, type Sekme, type Sutun } from '../../ortak/arayuz/index.ts';
import { api, hataIletisi } from '../../ortak/veri/api.ts';
import { sorguMetni, useListeDurumu } from '../../ortak/veri/liste-durumu.ts';
import { anahtarlar } from './anahtarlar.ts';
import { useYetki } from './komut.ts';
import { YeniBelge } from './formlar.tsx';
import { TUR_ADI, TUR_SIMGESI, zamanMetni } from './gosterim.ts';
import './belge-merkezi.css';

const SUTUNLAR: Sutun<BelgeSatiri>[] = [
  {
    anahtar: 'ad', baslik: 'Belge', sirala: true,
    hucre: (b) => <span className="tc-cz-ad"><Simge ad={TUR_SIMGESI[b.tur]} />{b.ad}</span>,
  },
  { anahtar: 'tur', baslik: 'Tür', hucre: (b) => TUR_ADI[b.tur] },
  { anahtar: 'dosya', baslik: 'Dosya', mono: true, hucre: (b) => b.dosyaTuru.toUpperCase() },
  {
    anahtar: 'revizyon', baslik: 'Revizyon', kirilmaz: true,
    hucre: (b) => (b.yayindakiHarf === null
      ? <Rozet ton="uyari">Taslak {b.sonHarf}</Rozet>
      : <span className="tc-cz-rev"><Rozet ton="tamam">{b.yayindakiHarf}</Rozet>{b.sonHarf !== b.yayindakiHarf && <Rozet ton="uyari">Taslak {b.sonHarf}</Rozet>}</span>),
  },
  { anahtar: 'bag', baslik: 'Bağ', hizala: 'sag', mono: true, hucre: (b) => b.bagSayisi },
  { anahtar: 'guncellendi', baslik: 'Güncellendi', sirala: true, kirilmaz: true, mono: true, hucre: (b) => zamanMetni(b.guncellendi) },
];

// 3B modeller iki sekmede: bir makineye (istasyona) eşleşmiş model makinenindir, geri kalanı (bağsız dahil) malzemenin. Veri aynıdır.
type UcBSekmesi = 'makine' | 'malzeme';
const UC_B_SEKMELERI: Sekme<UcBSekmesi>[] = [
  { anahtar: 'makine', baslik: 'Makineler 3B', simge: 'gear' },
  { anahtar: 'malzeme', baslik: 'Malzemeler 3B', simge: 'box' },
];

// Bölümü kabuğun ikinci menüsü seçer (paylasilan/sayfalar/belge-merkezi.ts): tür, bütün belgeler ya da arşiv.
export function Belgeler({ tur, arsiv = false }: { tur?: BelgeTuru; arsiv?: boolean }) {
  const yonlendir = useNavigate();
  const { yazar } = useYetki();
  const [yeni, yeniYaz] = useState(false);
  // Ctrl K komutu (komutlar.ts) `?yeni=1` ile gelir: pencere yalnız yazara ve arşiv dışında açılır. Kapatınca parametre
  // adresten düşer ki geri tuşu ve yenileme pencereyi yeniden açmasın.
  const [adres, adresYaz] = useSearchParams();
  const komutla = adres.get('yeni') === '1';
  const pencereAcik = (yeni || komutla) && yazar && !arsiv;
  const pencereyiKapat = () => {
    yeniYaz(false);
    if (komutla) { const p = new URLSearchParams(adres); p.delete('yeni'); adresYaz(p, { replace: true }); }
  };
  const [ucB, ucBYaz] = useState<UcBSekmesi>('makine');
  const ucBGorunumu = tur === '3b-model' && !arsiv;
  const liste = useListeDurumu({
    suzgecler: { ara: '' },
    siralamaAlanlari: ['ad', 'guncellendi'],
    sayfaBoyu: 50,
    adres: true,
  });
  const sorgu: BelgeListesiSorgusu = {
    ...liste.sorgu, ...(tur ? { tur } : {}), ...(ucBGorunumu ? { makine: ucB === 'makine' ? 'evet' : 'hayir' } : {}), arsiv: arsiv ? 'evet' : 'hayir',
  };
  const l = useQuery({
    queryKey: anahtarlar.liste(sorgu),
    queryFn: () => api.get<BelgeListesiCevabi>(`/cizimler${sorguMetni(sorgu)}`),
    placeholderData: keepPreviousData,
  });
  useEffect(() => { if (l.data) liste.sayfaEsitle(l.data.sayfa, liste.sorgu.sayfa); }, [l.data]);
  const baslik = arsiv ? 'Arşiv' : tur ? TUR_ADI[tur] : 'Tüm belgeler';
  const aranan = liste.suzgecler.ara.trim() !== '';

  return (
    <Kart
      baslik={baslik}
      sag={yazar && !arsiv && <Dugme tur="birincil" simge="upload" onClick={() => { yeniYaz(true); }}>Yeni belge</Dugme>}
    >
      <div className="tc-cz-icerik">
        {ucBGorunumu && <Sekmeler etiket="3B modeller" sekmeler={UC_B_SEKMELERI} secili={ucB} sec={(s) => { ucBYaz(s); liste.sayfaDegistir(1); }} />}
        <Girdi etiket="Ara" type="search" placeholder="Belge adı" value={liste.suzgecler.ara} onChange={(e) => { liste.suzgecDegistir({ ara: e.target.value }); }} />
        {l.isError
          ? <DurumKutusu durum="hata" mesaj={hataIletisi(l.error, 'Belgeler alınamadı')} yenile={() => { void l.refetch(); }} />
          : (
            <Tablo
              etiket={baslik}
              sutunlar={SUTUNLAR}
              satirlar={l.data?.satirlar ?? []}
              satirAnahtari={(b) => b.id}
              mesgul={l.isPending}
              satirSec={(b) => { void yonlendir(`/cizimler/belge/${b.id}`); }}
              siralama={liste.siralama}
              siralamaDegistir={liste.siralamaDegistir}
              bosMesaj={aranan ? 'Aramaya uyan belge yok' : arsiv ? 'Arşivde belge yok'
                : ucBGorunumu ? (ucB === 'makine' ? 'Makineyle eşleşmiş 3B model yok' : 'Makineye bağlı olmayan 3B model yok') : 'Henüz belge yok'}
              {...(l.data ? { sayfalama: { sayfa: l.data.sayfa, sayfaBoyu: l.data.sayfaBoyu, toplam: l.data.toplam, degistir: liste.sayfaDegistir } } : {})}
            />
          )}
      </div>
      {pencereAcik && <YeniBelge ilkTur={tur ?? 'teknik-resim'} kapat={pencereyiKapat} />}
    </Kart>
  );
}
