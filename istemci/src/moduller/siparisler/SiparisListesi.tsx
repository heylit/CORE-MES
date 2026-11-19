import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import type { SiparisAsamalariCevabi } from '#paylasilan/sozlesme/akis.ts';
import type { Siparis, SiparisListesiCevabi } from '#paylasilan/sozlesme/siparisler.ts';
import {
  LogoBelgeAramasi, Dugme, DurumKutusu, Girdi, Kart, KilitliSutunNotu, LOGO_DURUM_ADI, LogoRozetHucresi, Rozet, Sekmeler, Tablo, YETKI_ADI, useLogoRozetleri, type Sutun,
} from '../../ortak/arayuz/index.ts';
import { api, hataIletisi } from '../../ortak/veri/api.ts';
import { sorguMetni, useListeDurumu } from '../../ortak/veri/liste-durumu.ts';
import { anahtarlar } from './anahtarlar.ts';
import { FirmaSecici, type SecilenFirma } from './FirmaSecici.tsx';
import { SIPARIS_DURUMU, SIPARIS_SEKMELERI, kalanGun, paraMetni, tarihMetni, zamanMetni, type SiparisSekmesi } from './gorunum.ts';
import { AsamaRozeti } from './SiparisAkisi.tsx';
import { useFiyatGorur, useYazabilir } from './yazma.ts';
import './siparisler.css';

const SIRALAMA_ALANLARI = ['no', 'siparisTarihi', 'termin'] as const;
const DURUMLAR = ['tumu', 'taslak', 'onayli', 'kapandi', 'iptal', 'arsiv'] as const;

const SUTUNLAR: Sutun<Siparis>[] = [
  {
    anahtar: 'no',
    baslik: 'Sipariş',
    sirala: true,
    hucre: (s) => (
      <span className="tc-sp-ad">
        <strong className="mono">{s.no}</strong>
        {s.musteriSiparisNo && <span className="tc-sp-soluk">Müşteri no: {s.musteriSiparisNo}</span>}
        {s.logoBaglanacak === true && <span className="tc-sp-soluk">Logo'ya bağlanacak</span>}
      </span>
    ),
  },
  { anahtar: 'firma', baslik: 'Firma', hucre: (s) => s.firmaAd ?? `Firma ${s.firmaId}` },
  { anahtar: 'firmaKodu', baslik: 'Firma kodu', kirilmaz: true, hucre: (s) => s.firmaKodu ?? '—' },
  { anahtar: 'siparisTarihi', baslik: 'Tarih', sirala: true, kirilmaz: true, hucre: (s) => tarihMetni(s.siparisTarihi) },
  {
    anahtar: 'termin',
    baslik: 'Termin',
    sirala: true,
    hucre: (s) => {
      const acik = s.durum === 'taslak' || s.durum === 'onayli';
      const kalan = acik ? kalanGun(s.termin) : null;
      return (
        <span className="tc-sp-ad tc-sp-termin-hucre">
          <span>{tarihMetni(s.termin)}</span>
          {kalan && <span className={kalan.gecikti ? 'tc-sp-gecikme' : 'tc-sp-soluk'}>{kalan.metin}</span>}
        </span>
      );
    },
  },
  { anahtar: 'tutar', baslik: 'Tutar (KDV dahil)', hizala: 'sag', kirilmaz: true, hucre: (s) => paraMetni(s.genelToplam, s.paraBirimi) },
  { anahtar: 'durum', baslik: 'Durum', hucre: (s) => <Rozet ton={SIPARIS_DURUMU[s.durum].ton}>{SIPARIS_DURUMU[s.durum].etiket}</Rozet> },
];

const ARSIV_SUTUNU: Sutun<Siparis> = {
  anahtar: 'arsivleyen',
  baslik: 'Arşivleyen',
  hucre: (s) => (s.arsiv === null ? '—' : (
    <span className="tc-sp-ad">
      <span>{s.arsiv.kisi ?? '—'}</span>
      <span className="tc-sp-soluk">{zamanMetni(s.arsiv.an)}</span>
    </span>
  )),
  csv: (s) => (s.arsiv === null ? '' : `${s.arsiv.kisi ?? '—'} · ${zamanMetni(s.arsiv.an)}`),
};

// Satış siparişleri (asıl sayfa): durum sekmeleri, arama ve firma süzgeci; satır ayrıntıya gider.
export function SiparisListesi() {
  const gezin = useNavigate();
  const yazabilir = useYazabilir();
  const fiyatGorur = useFiyatGorur();
  const liste = useListeDurumu({
    suzgecler: { ara: '', durum: '' as string },
    suzgecDegerleri: { durum: ['taslak', 'onayli', 'kapandi', 'iptal', 'arsiv'] },
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
  // 3425 a: arşiv sekmesi durum süzgeci değil, ayrı sorgu alanıdır; öbür sekmeler arşivdekileri göstermez.
  const arsivde = sekme === 'arsiv';
  const sorgu = { ...liste.sorgu, ...(arsivde ? { durum: undefined, arsiv: 'evet' } : { arsiv: 'hayir' }), ...(firma === null ? {} : { firmaId: firma.id }) };
  const suzulu = liste.suzulu || firma !== null;
  const siparisler = useQuery({
    queryKey: anahtarlar.siparisListe(sorgu),
    queryFn: () => api.get<SiparisListesiCevabi>(`/siparisler${sorguMetni(sorgu)}`),
  });
  useEffect(() => { if (siparisler.data) liste.sayfaEsitle(siparisler.data.sayfa, liste.sorgu.sayfa); }, [siparisler.data]);
  // 3344: Logo'ya gidiş rozeti, görünen satırlar için tek istek.
  const logo = useLogoRozetleri('satis-siparisi', (siparisler.data?.satirlar ?? []).map((s) => s.id));
  const logoSutunu: Sutun<Siparis> = {
    anahtar: 'logo', baslik: 'Logo', hucre: (s) => <LogoRozetHucresi bilgi={logo.durum(s.id)} hata={logo.hata} />,
    csv: (s) => { const d = logo.durum(s.id); return d === null ? '' : LOGO_DURUM_ADI[d.durum]; },
  };
  // 3429-1 (B), 3429-2 (D): onaylı satırların aşaması ve termin riski, görünen sayfa için tek istek; okunamazsa rozet çizilmez, durum yine görünür.
  const onaylilar = (siparisler.data?.satirlar ?? []).filter((s) => s.durum === 'onayli').map((s) => s.id);
  const asamalar = useQuery({
    queryKey: anahtarlar.siparisAsamalari(onaylilar),
    queryFn: () => api.get<SiparisAsamalariCevabi>(`/akis/siparis-asamalari?idler=${onaylilar.join(',')}`),
    enabled: onaylilar.length > 0,
  });
  const asama = new Map((asamalar.data?.asamalar ?? []).map((a) => [a.siparisId, a]));
  const durumSutunu: Sutun<Siparis> = {
    anahtar: 'durum', baslik: 'Durum', kartTamSatir: true,
    hucre: (s) => (
      <span className="tc-sp-parti-cipleri">
        <Rozet ton={SIPARIS_DURUMU[s.durum].ton}>{SIPARIS_DURUMU[s.durum].etiket}</Rozet>
        {s.durum === 'onayli' && <AsamaRozeti asama={asama.get(s.id)?.asama} terminRiski={asama.get(s.id)?.terminRiski} />}
      </span>
    ),
    csv: (s) => SIPARIS_DURUMU[s.durum].etiket,
  };
  // Arşivde yalnız iptal edilmiş sipariş durur; hep aynı olan Durum sütunu yerine arşivleyen gösterilir.
  const temel = SUTUNLAR.filter((k) => (fiyatGorur || k.anahtar !== 'tutar') && (!arsivde || k.anahtar !== 'durum'));
  const sutunlar = [...temel.map((k) => (k.anahtar === 'durum' ? durumSutunu : k)), logoSutunu, ...(arsivde ? [ARSIV_SUTUNU] : [])];

  return (
    <section className="tc-sp">
      <Kart
        baslik="Satış siparişleri"
        sag={(
          <span className="tc-sp-islemler">
            <LogoBelgeAramasi tur="satis-siparisi" />
            {yazabilir && <Dugme tur="birincil" simge="plus" onClick={() => { void gezin('/siparisler/yeni'); }}>Yeni sipariş</Dugme>}
            <Dugme simge="rotate" aria-label="Yenile" onClick={() => { void siparisler.refetch(); }} yukleniyor={siparisler.isFetching} />
          </span>
        )}
      >
        {!fiyatGorur && <KilitliSutunNotu ne="Tutar sütunu" yetki={YETKI_ADI.siparisFiyati} />}
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
            sutunlar={sutunlar}
            satirlar={siparisler.data?.satirlar ?? []}
            satirAnahtari={(s) => s.id}
            satirSec={(s) => { void gezin(`/siparisler/${s.id}`); }}
            mesgul={siparisler.isPending}
            bosMesaj={siparisler.isPending ? 'Yükleniyor' : arsivde ? 'Arşivde sipariş yok.' : suzulu ? 'Bu süzgece uyan sipariş yok.' : 'Henüz satış siparişi yok.'}
            bosEylem={siparisler.isPending ? undefined : suzulu
              ? <Dugme simge="x" onClick={() => { liste.suzgecleriTemizle(); firmaYaz(null); }}>Süzgeci temizle</Dugme>
              : yazabilir && <Dugme simge="plus" onClick={() => { void gezin('/siparisler/yeni'); }}>Yeni sipariş</Dugme>}
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
