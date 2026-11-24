import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useInRouterContext, useSearchParams } from 'react-router-dom';
import type { Ayrinti } from '#paylasilan/sozlesme/saglik.ts';
import { Pencere, Simge } from '../../ortak/arayuz/index.ts';
import type { UstEylem, UstEylemOzellikleri } from '../../ortak/rota/ust-eylemler.ts';
import { api } from '../../ortak/veri/api.ts';
import { useOturum } from '../../ortak/veri/oturum.ts';
import { anahtarlar } from './anahtarlar.ts';
import { adresiCoz, adresiYaz, type IzlemeAdresi } from './kapanma-yorumu.ts';
import { SistemIzleme, VARSAYILAN_ADRES } from './SistemIzleme.tsx';
import './sistem-durumu.css';

// Uyarılar arka planda oluşur (yedek, iş, disk); yönetici sayfa açmadan görsün diye çubuk kendisi yoklar.
const UYARI_YOKLAMA_MS = 60_000;

function useUyariSayisi() {
  const ayrinti = useQuery({
    queryKey: anahtarlar.sistemAyrinti,
    queryFn: () => api.get<Ayrinti>('/saglik/ayrinti'),
    refetchInterval: UYARI_YOKLAMA_MS,
    refetchOnWindowFocus: true,
    retry: false,
  });
  return ayrinti.data?.uyarilar.length ?? 0;
}

// Düğme Hesap menüsünde durduğundan uyarı kişi düğmesinin köşesinde işaretle duyurulur; sayı menü maddesinin penceresindedir.
function SistemIsareti() {
  const sayi = useUyariSayisi();
  if (sayi === 0) return null;
  return <span className="tc-kabuk-kisi-isaret" role="img" aria-label={`Sistem durumu, ${sayi} uyarı`} title={`Sistem durumu, ${sayi} uyarı`} />;
}

// Kararlar, korumalar ve yorumlu grafikler Sistem ve Güvenlik sayfasındadır (2231); pencere kısa özettir ve oraya götürür.
// Sayfayı görme yetkisi olmayana bağlantı verilmez. Yönlendirici dışında (tek başına çizim) düz bağlantıdır.
function SayfaBaglantisi({ kapat }: { kapat: () => void }) {
  const oturum = useOturum();
  const yonlendirici = useInRouterContext();
  if (oturum.data?.islemler.includes('sayfa.guvenlik') !== true) return null;
  const icerik = <><Simge ad="lock" boyut="k" />Sistem ve Güvenlik'e git<Simge ad="chev-right" boyut="k" /></>;
  return yonlendirici
    ? <Link className="tc-sistem-git" to="/guvenlik" onClick={kapat}>{icerik}</Link>
    : <a className="tc-sistem-git" href="/guvenlik">{icerik}</a>;
}

// Düğme ve pencere iki biçimde bağlanır: yönlendirici içinde açıklık ve sekme adreste (`?sistem=kapanmalar&kayit=12`) tutulur, bildirim
// bağlantısı pencereyi doğrudan o kayda açar; yönlendirici dışında (tek başına çizim) durum yereldedir.
interface DugmeOzellikleri { adres: IzlemeAdresi | null; adresYaz: (a: IzlemeAdresi | null) => void; acmaIstegi: number }

function SistemDugmesiGovdesi({ adres, adresYaz, acmaIstegi }: DugmeOzellikleri) {
  // Açma isteği her yeni değerde bir kez işlenir; adresYaz her çizimde yeni işlevdir, bağımlılıkta tekrar açmaz.
  const gorulen = useRef(0);
  useEffect(() => {
    if (acmaIstegi === gorulen.current) return;
    gorulen.current = acmaIstegi;
    if (acmaIstegi > 0) adresYaz(VARSAYILAN_ADRES);
  }, [acmaIstegi, adresYaz]);
  const sayi = useUyariSayisi();
  const etiket = sayi > 0 ? `Sistem durumu, ${sayi} uyarı` : 'Sistem durumu';
  return (
    <>
      <button type="button" className="tc-kabuk-tema tc-sistem-dugme" onClick={() => { adresYaz(VARSAYILAN_ADRES); }} aria-haspopup="dialog" aria-label={etiket} title={etiket}>
        <Simge ad="cpu" />
        {sayi > 0 && <span className="tc-sistem-sayac" aria-hidden="true">{sayi > 99 ? '99+' : sayi}</span>}
      </button>
      {adres !== null && (
        <Pencere acik kapat={() => { adresYaz(null); }} baslik="Sistem izleme" tur="tam">
          <SistemIzleme adres={adres} degistir={adresYaz} sayfaBaglantisi={<SayfaBaglantisi kapat={() => { adresYaz(null); }} />} />
        </Pencere>
      )}
    </>
  );
}

function YonlendiriciDugmesi({ acmaIstegi = 0 }: UstEylemOzellikleri) {
  const [parametreler, parametreYaz] = useSearchParams();
  const adres = adresiCoz(parametreler);
  return (
    <SistemDugmesiGovdesi
      adres={adres} acmaIstegi={acmaIstegi}
      adresYaz={(yeni) => { parametreYaz(adresiYaz(parametreler, yeni), { replace: true }); }}
    />
  );
}

function YalinDugme({ acmaIstegi = 0 }: UstEylemOzellikleri) {
  const [adres, adresYaz] = useState<IzlemeAdresi | null>(null);
  return <SistemDugmesiGovdesi adres={adres} adresYaz={adresYaz} acmaIstegi={acmaIstegi} />;
}

function SistemDugmesi(o: UstEylemOzellikleri) {
  return useInRouterContext() ? <YonlendiriciDugmesi {...o} /> : <YalinDugme {...o} />;
}

// Ayrı sayfa yok (sistem durumu 15.10.2026'da panodan kalktı); ayrıntıyı okuyan çubuktan açar, yeni işlem gerekmez.
// Çubukta yer tutmaz, Hesap menüsünden açılır (516 a); uyarı varsa kişi düğmesinde işaret çıkar.
export const ustEylemler: readonly UstEylem[] = [{
  anahtar: 'sistem-durumu', sira: 70, islem: 'saglik.ayrinti-oku', yer: 'hesap', hesapMaddesi: { baslik: 'Sistem durumu', simge: 'cpu' },
  dugme: SistemDugmesi, isaret: SistemIsareti,
}];
