import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import type { Siparis, SiparisListesiCevabi } from '#paylasilan/sozlesme/siparisler.ts';
import { Dugme, DurumKutusu, Girdi, Kart, Rozet, Sekmeler, Tablo, type Sutun } from '../../ortak/arayuz/index.ts';
import { api, hataIletisi } from '../../ortak/veri/api.ts';
import { sorguMetni, useListeDurumu } from '../../ortak/veri/liste-durumu.ts';
import { anahtarlar } from './anahtarlar.ts';
import { FirmaSecici, type SecilenFirma } from './FirmaSecici.tsx';
import { SIPARIS_DURUMU, SIPARIS_SEKMELERI, kalanGun, paraMetni, tarihMetni, type SiparisSekmesi } from './gorunum.ts';
import { useFiyatGorur, useYazabilir } from './yazma.ts';
import './siparisler.css';

const SIRALAMA_ALANLARI = ['no', 'siparisTarihi', 'termin'] as const;
const DURUMLAR = ['tumu', 'taslak', 'onayli', 'kapandi', 'iptal'] as const;

const SUTUNLAR: Sutun<Siparis>[] = [
  {
    anahtar: 'no',
    baslik: 'Sipariş',
    sirala: true,
    hucre: (s) => (
      <span className="tc-sp-ad">
        <strong className="mono">{s.no}</strong>
        {s.musteriSiparisNo && <span className="tc-sp-soluk">Müşteri no: {s.musteriSiparisNo}</span>}
      </span>
    ),
  },
  { anahtar: 'firma', baslik: 'Firma', hucre: (s) => s.firmaAd ?? `Firma ${s.firmaId}` },
  { anahtar: 'siparisTarihi', baslik: 'Tarih', sirala: true, kirilmaz: true, hucre: (s) => tarihMetni(s.siparisTarihi) },
  {
    anahtar: 'termin',
    baslik: 'Termin',
    sirala: true,
    hucre: (s) => {
      const acik = s.durum === 'taslak' || s.durum === 'onayli';
      const kalan = acik ? kalanGun(s.termin) : null;
      return (
        <span className="tc-sp-ad">
          <span>{tarihMetni(s.termin)}</span>
          {kalan && <span className={kalan.gecikti ? 'tc-sp-gecikme' : 'tc-sp-soluk'}>{kalan.metin}</span>}
        </span>
      );
    },
  },
  { anahtar: 'tutar', baslik: 'Tutar (KDV dahil)', hizala: 'sag', kirilmaz: true, hucre: (s) => paraMetni(s.genelToplam, s.paraBirimi) },
  { anahtar: 'durum', baslik: 'Durum', hucre: (s) => <Rozet ton={SIPARIS_DURUMU[s.durum].ton}>{SIPARIS_DURUMU[s.durum].etiket}</Rozet> },
];

// Satış siparişleri (asıl sayfa): durum sekmeleri, arama ve firma süzgeci; satır ayrıntıya gider.
export function SiparisListesi() {
  const gezin = useNavigate();
  const yazabilir = useYazabilir();
  const fiyatGorur = useFiyatGorur();
  const liste = useListeDurumu({
    suzgecler: { ara: '', durum: '' as string },
    suzgecDegerleri: { durum: ['taslak', 'onayli', 'kapandi', 'iptal'] },
    siralamaAlanlari: SIRALAMA_ALANLARI,
    adres: true,
  });
  const [arama, aramaYaz] = useState(liste.suzgecler.ara);
  const [firma, firmaYaz] = useState<SecilenFirma | null>(null);

  useEffect(() => {
    const sayac = setTimeout(() => { if (arama !== liste.suzgecler.ara) liste.suzgecDegistir({ ara: arama }); }, 300);
    return () => clearTimeout(sayac);
  }, [arama]);

  const sekme: SiparisSekmesi = DURUMLAR.find((d) => d === liste.suzgecler.durum) ?? 'tumu';
  // Firma süzgeci adrese yazılmaz: seçili firmanın adı yalnız bu oturumda bellidir.
  const sorgu = { ...liste.sorgu, ...(firma === null ? {} : { firmaId: firma.id }) };
  const siparisler = useQuery({
    queryKey: anahtarlar.siparisListe(sorgu),
    queryFn: () => api.get<SiparisListesiCevabi>(`/siparisler${sorguMetni(sorgu)}`),
  });
  useEffect(() => { if (siparisler.data) liste.sayfaEsitle(siparisler.data.sayfa, liste.sorgu.sayfa); }, [siparisler.data]);

  return (
    <section className="tc-sp">
      <Kart
        baslik="Satış siparişleri"
        sag={(
          <span className="tc-sp-islemler">
            {yazabilir && <Dugme tur="birincil" simge="plus" onClick={() => { void gezin('/siparisler/yeni'); }}>Yeni sipariş</Dugme>}
            <Dugme simge="rotate" aria-label="Yenile" onClick={() => { void siparisler.refetch(); }} yukleniyor={siparisler.isFetching} />
          </span>
        )}
      >
        <Sekmeler
          etiket="Sipariş durumu"
          sekmeler={SIPARIS_SEKMELERI}
          secili={sekme}
          sec={(d) => liste.suzgecDegistir({ durum: d === 'tumu' ? '' : d })}
        />
        <div className="tc-sp-arac">
          <Girdi
            etiket="Ara"
            type="search"
            placeholder="Sipariş no, müşteri sipariş no ya da firma"
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
        {siparisler.isError ? (
          <DurumKutusu durum="hata" mesaj={hataIletisi(siparisler.error, 'Siparişler alınamadı')} yenile={() => { void siparisler.refetch(); }} />
        ) : (
          <Tablo
            etiket="Satış siparişleri"
            sutunlar={fiyatGorur ? SUTUNLAR : SUTUNLAR.filter((k) => k.anahtar !== 'tutar')}
            satirlar={siparisler.data?.satirlar ?? []}
            satirAnahtari={(s) => s.id}
            satirSec={(s) => { void gezin(`/siparisler/${s.id}`); }}
            mesgul={siparisler.isPending}
            bosMesaj={siparisler.isPending ? 'Yükleniyor' : 'Bu süzgece uyan sipariş yok.'}
            siralama={liste.siralama}
            siralamaDegistir={liste.siralamaDegistir}
            {...(siparisler.data
              ? { sayfalama: { sayfa: siparisler.data.sayfa, sayfaBoyu: siparisler.data.sayfaBoyu, toplam: siparisler.data.toplam, degistir: liste.sayfaDegistir } }
              : {})}
          />
        )}
      </Kart>
    </section>
  );
}
