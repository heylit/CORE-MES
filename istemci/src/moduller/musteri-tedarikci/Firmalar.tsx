import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useLocation, useSearchParams } from 'react-router-dom';
import type { FirmaListesiCevabi, FirmaSatiri } from '#paylasilan/sozlesme/musteri-tedarikci.ts';
import { Dugme, DurumKutusu, Girdi, Kart, Rozet, Secim, Simge, Tablo, type Sutun } from '../../ortak/arayuz/index.ts';
import { api, hataIletisi } from '../../ortak/veri/api.ts';
import { sorguMetni, useListeDurumu } from '../../ortak/veri/liste-durumu.ts';
import { useOturum } from '../../ortak/veri/oturum.ts';
import { anahtarlar } from './anahtarlar.ts';
import { FirmaAyrinti } from './FirmaAyrinti.tsx';
import { FirmaFormu } from './FirmaFormu.tsx';
import { LogoBaglaPenceresi } from './LogoBaglaPenceresi.tsx';
import { TUR_ETIKETI, menuSuzgeci } from './gorunum.ts';
import { useYazabilir } from './yazma.ts';
import './musteri-tedarikci.css';

const DURUM_SECENEKLERI = [
  { deger: 'true', baslik: 'Aktif' },
  { deger: 'false', baslik: 'Pasif' },
] as const;

const SIRALAMA_ALANLARI = ['kod', 'ad'] as const;

// Logo bağı: firma Logo kaydına bağlıysa (kayıt no var) cari koduyla "Bağlı"; değilse yazabilene satırda "Logo'ya bağla" (3065).
// Ayrıntıdaki düğmeyle aynı pencere açılır; bağlama davranışı değişmez. Düğme satırı seçmez.
function logoSutunu(bagla: ((f: FirmaSatiri) => void) | null): Sutun<FirmaSatiri> {
  return {
    anahtar: 'logo',
    baslik: 'Logo',
    csv: (f) => (f.logoKayitNo === null ? null : f.logoCariKodu),
    hucre: (f) => {
      if (f.logoKayitNo !== null) {
        return (
          <span className="tc-mt-logo-bag">
            <Rozet ton="tamam">Bağlı</Rozet>
            {f.logoCariKodu && <span className="mono">{f.logoCariKodu}</span>}
          </span>
        );
      }
      if (bagla === null) return <span className="tc-mt-yok">Bağlı değil</span>;
      return (
        <Dugme simge="search" aria-label={`${f.ad} firmasını Logo'ya bağla`} onClick={(o) => { o.stopPropagation(); bagla(f); }}>
          Logo&apos;ya bağla
        </Dugme>
      );
    },
  };
}

const SUTUNLAR: Sutun<FirmaSatiri>[] = [
  { anahtar: 'kod', baslik: 'Kod', mono: true, sirala: true, hucre: (f) => f.kod },
  {
    anahtar: 'ad',
    baslik: 'Ad',
    sirala: true,
    hucre: (f) => (
      <span className="tc-mt-ad">
        <strong>{f.ad}</strong>
        {!f.aktif && <Rozet ton="pasif">Pasif</Rozet>}
      </span>
    ),
  },
  { anahtar: 'tur', baslik: 'Tür', hucre: (f) => TUR_ETIKETI[f.tur] },
  { anahtar: 'fason', baslik: 'Fason', hucre: (f) => (f.fason ? <Rozet ton="uyari">Fason</Rozet> : <span className="tc-mt-yok">Hayır</span>) },
  { anahtar: 'il', baslik: 'İl', hucre: (f) => f.il },
  { anahtar: 'adres', baslik: 'Adres sayısı', hizala: 'sag', hucre: (f) => String(f.adresSayisi) },
  {
    anahtar: 'konum',
    baslik: 'Koordinat',
    hucre: (f) => (f.koordinatli
      ? <span className="tc-mt-konum" title="Koordinatı var"><Simge ad="target" boyut="k" /><span className="tc-mt-gizli">Koordinatı var</span></span>
      : null),
  },
];

// Ana liste ve üç menü maddesi (müşteriler, tedarikçiler, fason) aynı ekrandır; madde yolu sunucuya giden sabit süzgeci verir.
export function Firmalar() {
  const yol = useLocation().pathname;
  const menu = menuSuzgeci(yol);
  const yazabilir = useYazabilir();
  const liste = useListeDurumu({
    suzgecler: { ara: '', aktif: true as boolean | '' },
    suzgecTurleri: { aktif: 'mantik' },
    siralamaAlanlari: SIRALAMA_ALANLARI,
    adres: true,
  });
  const [arama, aramaYaz] = useState(liste.suzgecler.ara);
  const [secili, seciliYaz] = useState<number | null>(null);
  const [yeni, yeniYaz] = useState(false);
  const [baglanan, baglananYaz] = useState<number | null>(null);

  useEffect(() => {
    const sayac = setTimeout(() => { if (arama !== liste.suzgecler.ara) liste.suzgecDegistir({ ara: arama }); }, 300);
    return () => clearTimeout(sayac);
  }, [arama]);
  useEffect(() => { seciliYaz(null); baglananYaz(null); }, [yol]);

  // Ctrl K buraya `yeni=1` (komut: form açılır) ya da `firma=<id>` (kayıt sonucu: kart açılır) ile gelir. İstek bir kez
  // karşılanır ve adresten düşer: geri ya da yenileme formu yeniden açmaz. Yetki oturum gelince bilinir; o zamana kadar beklenir.
  const [adres, adresYaz] = useSearchParams();
  const oturumHazir = useOturum().data !== undefined;
  useEffect(() => {
    const yeniIstegi = adres.get('yeni') === '1';
    const firma = Number(adres.get('firma'));
    const firmaIstegi = Number.isSafeInteger(firma) && firma > 0;
    if (!adres.has('yeni') && !adres.has('firma')) return;
    if (yeniIstegi && !oturumHazir) return;
    if (yeniIstegi && yazabilir) yeniYaz(true);
    if (firmaIstegi) seciliYaz(firma);
    const kalan = new URLSearchParams(adres);
    kalan.delete('yeni');
    kalan.delete('firma');
    adresYaz(kalan, { replace: true });
  }, [adres, oturumHazir, yazabilir]);

  const sorgu = { ...liste.sorgu, ...(menu.tur ? { tur: menu.tur } : {}), ...(menu.fason ? { fason: true } : {}) };
  const firmalar = useQuery({
    queryKey: anahtarlar.liste(sorgu),
    queryFn: () => api.get<FirmaListesiCevabi>(`/musteri-tedarikci/firmalar${sorguMetni(sorgu)}`),
  });
  useEffect(() => { if (firmalar.data) liste.sayfaEsitle(firmalar.data.sayfa, liste.sorgu.sayfa); }, [firmalar.data]);

  const logo = logoSutunu(yazabilir ? (f) => baglananYaz(f.id) : null);
  const sutunlar = [...SUTUNLAR.slice(0, 4), logo, ...SUTUNLAR.slice(4)];

  return (
    <section className="tc-mt">
      <Kart
        baslik={menu.baslik}
        sag={(
          <span className="tc-mt-islemler">
            {yazabilir && <Dugme tur="birincil" simge="plus" onClick={() => yeniYaz(true)}>Yeni firma</Dugme>}
            <Dugme simge="rotate" aria-label="Yenile" onClick={() => { void firmalar.refetch(); }} yukleniyor={firmalar.isFetching} />
          </span>
        )}
      >
        <div className="tc-mt-arac">
          <Girdi
            etiket="Ara"
            type="search"
            placeholder="Kod, ad ya da vergi no"
            value={arama}
            onChange={(o) => aramaYaz(o.target.value)}
            autoComplete="off"
          />
          <Secim
            etiket="Durum"
            bosSecenek="Tümü"
            secenekler={DURUM_SECENEKLERI}
            value={liste.suzgecler.aktif === '' ? '' : String(liste.suzgecler.aktif)}
            onChange={(o) => liste.suzgecDegistir({ aktif: o.target.value === '' ? '' : o.target.value === 'true' })}
          />
        </div>
        {firmalar.isError ? (
          <DurumKutusu durum="hata" mesaj={hataIletisi(firmalar.error, 'Firmalar alınamadı')} yenile={() => { void firmalar.refetch(); }} />
        ) : (
          <Tablo
            etiket="Firmalar"
            sutunlar={sutunlar}
            satirlar={firmalar.data?.satirlar ?? []}
            satirAnahtari={(f) => f.id}
            satirSec={(f) => seciliYaz(f.id)}
            mesgul={firmalar.isPending}
            bosMesaj={firmalar.isPending ? 'Yükleniyor' : 'Bu süzgece uyan firma yok.'}
            siralama={liste.siralama}
            siralamaDegistir={liste.siralamaDegistir}
            {...(firmalar.data
              ? { sayfalama: { sayfa: firmalar.data.sayfa, sayfaBoyu: firmalar.data.sayfaBoyu, toplam: firmalar.data.toplam, degistir: liste.sayfaDegistir } }
              : {})}
          />
        )}
      </Kart>
      {secili !== null && <FirmaAyrinti id={secili} kapat={() => seciliYaz(null)} />}
      {yazabilir && baglanan !== null && <LogoBaglaPenceresi id={baglanan} kapat={() => baglananYaz(null)} />}
      {yazabilir && yeni && (
        <FirmaFormu
          firma={null}
          varsayilanTur={menu.tur ?? (menu.fason ? 'tedarikci' : 'musteri')}
          varsayilanFason={menu.fason === true}
          kapat={() => yeniYaz(false)}
          kaydedildi={(f) => { yeniYaz(false); seciliYaz(f.id); }}
        />
      )}
    </section>
  );
}
