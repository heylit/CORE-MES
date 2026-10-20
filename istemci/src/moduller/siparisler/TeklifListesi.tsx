import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import type { Teklif, TeklifListesiCevabi } from '#paylasilan/sozlesme/siparisler.ts';
import { Dugme, DurumKutusu, Girdi, Kart, Rozet, Sekmeler, Tablo, type Sutun } from '../../ortak/arayuz/index.ts';
import { api, hataIletisi } from '../../ortak/veri/api.ts';
import { sorguMetni, useListeDurumu } from '../../ortak/veri/liste-durumu.ts';
import { anahtarlar } from './anahtarlar.ts';
import { FirmaSecici, type SecilenFirma } from './FirmaSecici.tsx';
import { TEKLIF_DURUMU, TEKLIF_SEKMELERI, tarihMetni, type TeklifSekmesi } from './gorunum.ts';
import { useYazabilir } from './yazma.ts';
import './siparisler.css';

const SIRALAMA_ALANLARI = ['no', 'olusturma'] as const;
const DURUMLAR = ['tumu', 'yeni', 'verildi', 'revizyon', 'kabul', 'red', 'siparis'] as const;

const SUTUNLAR: Sutun<Teklif>[] = [
  {
    anahtar: 'no',
    baslik: 'Teklif',
    sirala: true,
    hucre: (t) => (
      <span className="tc-sp-ad">
        <strong>{t.baslik}</strong>
        <span className="tc-sp-soluk mono">{t.no}</span>
      </span>
    ),
  },
  { anahtar: 'firma', baslik: 'Firma', hucre: (t) => t.firmaAd ?? `Firma ${t.firmaId}` },
  { anahtar: 'istenen', baslik: 'İstenen teslim', kirilmaz: true, hucre: (t) => tarihMetni(t.istenenTarih) },
  { anahtar: 'surum', baslik: 'Son sürüm', kirilmaz: true, hucre: (t) => (t.sonSurumNo === null ? '—' : `Sürüm ${t.sonSurumNo}`) },
  { anahtar: 'olusturma', baslik: 'Açılış', sirala: true, kirilmaz: true, hucre: (t) => tarihMetni(t.olusturma) },
  { anahtar: 'durum', baslik: 'Durum', hucre: (t) => <Rozet ton={TEKLIF_DURUMU[t.durum].ton}>{TEKLIF_DURUMU[t.durum].etiket}</Rozet> },
];

// Teklifler (prototipte "Müşteri teklif talepleri"): durum sekmeleri, arama ve firma süzgeci; satır teklif föyüne gider.
export function TeklifListesi() {
  const gezin = useNavigate();
  const yazabilir = useYazabilir();
  const liste = useListeDurumu({
    suzgecler: { ara: '', durum: '' as string },
    suzgecDegerleri: { durum: ['yeni', 'verildi', 'revizyon', 'kabul', 'red', 'siparis'] },
    siralamaAlanlari: SIRALAMA_ALANLARI,
    adres: true,
  });
  const [arama, aramaYaz] = useState(liste.suzgecler.ara);
  const [firma, firmaYaz] = useState<SecilenFirma | null>(null);

  useEffect(() => {
    const sayac = setTimeout(() => { if (arama !== liste.suzgecler.ara) liste.suzgecDegistir({ ara: arama }); }, 300);
    return () => clearTimeout(sayac);
  }, [arama]);

  const sekme: TeklifSekmesi = DURUMLAR.find((d) => d === liste.suzgecler.durum) ?? 'tumu';
  const sorgu = { ...liste.sorgu, ...(firma === null ? {} : { firmaId: firma.id }) };
  const teklifler = useQuery({
    queryKey: anahtarlar.teklifListe(sorgu),
    queryFn: () => api.get<TeklifListesiCevabi>(`/siparisler/teklifler${sorguMetni(sorgu)}`),
  });
  useEffect(() => { if (teklifler.data) liste.sayfaEsitle(teklifler.data.sayfa, liste.sorgu.sayfa); }, [teklifler.data]);

  return (
    <section className="tc-sp">
      <Kart
        baslik="Teklifler"
        sag={(
          <span className="tc-sp-islemler">
            {yazabilir && <Dugme tur="birincil" simge="plus" onClick={() => { void gezin('/siparisler/teklifler/yeni'); }}>Yeni teklif</Dugme>}
            <Dugme simge="rotate" aria-label="Yenile" onClick={() => { void teklifler.refetch(); }} yukleniyor={teklifler.isFetching} />
          </span>
        )}
      >
        <Sekmeler
          etiket="Teklif durumu"
          sekmeler={TEKLIF_SEKMELERI}
          secili={sekme}
          sec={(d) => liste.suzgecDegistir({ durum: d === 'tumu' ? '' : d })}
        />
        <div className="tc-sp-arac">
          <Girdi
            etiket="Ara"
            type="search"
            placeholder="Teklif no, konu ya da firma"
            value={arama}
            onChange={(o) => aramaYaz(o.target.value)}
            autoComplete="off"
          />
          <FirmaSecici
            etiket="Firma"
            bosSecenek="Tüm firmalar"
            deger={firma}
            degistir={(f) => { firmaYaz(f); liste.sayfaDegistir(1); }}
          />
        </div>
        {teklifler.isError ? (
          <DurumKutusu durum="hata" mesaj={hataIletisi(teklifler.error, 'Teklifler alınamadı')} yenile={() => { void teklifler.refetch(); }} />
        ) : (
          <Tablo
            etiket="Teklifler"
            sutunlar={SUTUNLAR}
            satirlar={teklifler.data?.satirlar ?? []}
            satirAnahtari={(t) => t.id}
            satirSec={(t) => { void gezin(`/siparisler/teklifler/${t.id}`); }}
            mesgul={teklifler.isPending}
            bosMesaj={teklifler.isPending ? 'Yükleniyor' : 'Bu süzgece uyan teklif yok.'}
            siralama={liste.siralama}
            siralamaDegistir={liste.siralamaDegistir}
            {...(teklifler.data
              ? { sayfalama: { sayfa: teklifler.data.sayfa, sayfaBoyu: teklifler.data.sayfaBoyu, toplam: teklifler.data.toplam, degistir: liste.sayfaDegistir } }
              : {})}
          />
        )}
      </Kart>
    </section>
  );
}
