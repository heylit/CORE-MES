import type { ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { BaglantiAkisDurumu, LogoHazirlikCevabi, LogoKontrolCevabi } from '#paylasilan/sozlesme/logo.ts';
import type { SmartesHazirlikCevabi, SmartesKontrolCevabi } from '#paylasilan/sozlesme/smartes.ts';
import { Dugme, DurumKutusu, Kart, Rozet, Simge, type RozetTonu } from '../../ortak/arayuz/index.ts';
import type { SimgeAdi } from '../../ortak/tasarim/simgeler.ts';
import { api, hataIletisi } from '../../ortak/veri/api.ts';
import { anahtarlar } from './anahtarlar.ts';

// Logo köprüsü ve SmartES için tek sayfa: ortam ve ayar durumu, yalnız okuyan canlı deneme ve veri akışları (yön başına).
// Veri iki modülün kendi uçlarından gelir; burada yalnız gösterilir. Deneme düğmeyle başlar, sayfa açılınca dış sisteme istek gitmez.

type AkisGorunumu = BaglantiAkisDurumu | 'baglanti-yok';

const AKIS: Record<AkisGorunumu, { metin: string; ton: RozetTonu }> = {
  hazir: { metin: 'Hazır', ton: 'tamam' },
  kapali: { metin: 'Kapalı', ton: 'pasif' },
  'ayar-eksik': { metin: 'Ayar eksik', ton: 'uyari' },
  baglanmadi: { metin: 'Modül bağlanmadı', ton: 'bilgi' },
  'kodda-yok': { metin: 'Kodda yok', ton: 'pasif' },
  'baglanti-yok': { metin: 'Bağlantı yok', ton: 'hata' },
};

const ADIM: Record<'tamam' | 'hata' | 'atlandi', { metin: string; ton: RozetTonu }> = {
  tamam: { metin: 'Tamam', ton: 'tamam' },
  hata: { metin: 'Hata', ton: 'hata' },
  atlandi: { metin: 'Atlandı', ton: 'pasif' },
};

const ZAMAN = new Intl.DateTimeFormat('tr-TR', { dateStyle: 'short', timeStyle: 'short' });
const zamanMetni = (iso: string): string => ZAMAN.format(new Date(iso));

interface Kontrol {
  zaman: string;
  ulasildi: boolean;
  adimlar: readonly { ad: string; sonuc: 'tamam' | 'hata' | 'atlandi'; sureMs: number | null; ileti: string }[];
}

interface Akis {
  anahtar: string;
  baslik: string;
  aciklama: string;
  durum: BaglantiAkisDurumu;
  sayilar: string | null;
  sonHata: string | null;
}

// Denenmiş ve ulaşılamamış bağlantıda "hazır" akış çalışamaz: ekranda bağlantı yok görünür.
export const akisGorunumu = (durum: BaglantiAkisDurumu, kontrol: Kontrol | undefined): AkisGorunumu =>
  durum === 'hazir' && kontrol !== undefined && !kontrol.ulasildi ? 'baglanti-yok' : durum;

// Sistemin genel hali: anahtar açık, ortam tamam ve son deneme hatasızsa çalışmaya hazırdır.
export function genelDurum(baglanti: 'kapali' | 'acik' | 'ortam-degiskeni-yok', kontrol: Kontrol | undefined): { metin: string; ton: RozetTonu } {
  if (baglanti === 'ortam-degiskeni-yok') return { metin: 'Ortam değişkeni eksik', ton: 'uyari' };
  if (kontrol !== undefined && !kontrol.ulasildi) return { metin: 'Bağlantı yok', ton: 'hata' };
  if (kontrol !== undefined && kontrol.adimlar.some((a) => a.sonuc !== 'tamam')) return { metin: 'Bağlantıda sorun var', ton: 'uyari' };
  if (baglanti === 'kapali') return { metin: kontrol ? 'Bağlantı çalışıyor, anahtar kapalı' : 'Anahtar kapalı', ton: 'pasif' };
  return kontrol ? { metin: 'Çalışmaya hazır', ton: 'tamam' } : { metin: 'Açık, denenmedi', ton: 'bilgi' };
}

const sayiMetni = (parcalar: readonly [number | null, string][]): string | null => {
  const yazilan = parcalar.filter(([n]) => n !== null).map(([n, ad]) => `${(n ?? 0).toLocaleString('tr-TR')} ${ad}`);
  return yazilan.length === 0 ? null : yazilan.join(' · ');
};

function AkisGrubu({ baslik, simge, akislar, kontrol }: { baslik: string; simge: SimgeAdi; akislar: readonly Akis[]; kontrol: Kontrol | undefined }) {
  return (
    <section className="tc-hazirlik-grup" aria-label={baslik}>
      <h3 className="tc-hazirlik-baslik"><Simge ad={simge} /><span>{baslik}</span></h3>
      <ul className="tc-hazirlik-akislar">
        {akislar.map((a) => {
          const g = AKIS[akisGorunumu(a.durum, kontrol)];
          return (
            <li key={a.anahtar} className="tc-hazirlik-akis">
              <div className="tc-hazirlik-akis-ust">
                <span className="tc-hazirlik-akis-ad">{a.baslik}</span>
                <Rozet ton={g.ton}>{g.metin}</Rozet>
              </div>
              <p className="tc-ayar-aciklama">{a.aciklama}</p>
              {a.sayilar && <p className="tc-ayar-aciklama">{a.sayilar}</p>}
              {a.sonHata && <p className="tc-hazirlik-hata">Son okuma: {a.sonHata}</p>}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function KontrolSonucu({ kontrol }: { kontrol: Kontrol }) {
  return (
    <section aria-label="Bağlantı denemesi">
      <h3 className="tc-hazirlik-baslik"><Simge ad="gauge" /><span>Son deneme · {zamanMetni(kontrol.zaman)}</span></h3>
      <ol className="tc-hazirlik-adimlar">
        {kontrol.adimlar.map((a) => (
          <li key={a.ad} className="tc-hazirlik-adim">
            <Rozet ton={ADIM[a.sonuc].ton}>{ADIM[a.sonuc].metin}</Rozet>
            <span className="tc-hazirlik-akis-ad">{a.ad}</span>
            <span className="tc-ayar-aciklama">{a.ileti}{a.sureMs === null ? '' : ` (${a.sureMs.toLocaleString('tr-TR')} ms)`}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

interface SistemOzellikleri {
  baslik: string;
  baglanti: 'kapali' | 'acik' | 'ortam-degiskeni-yok';
  ortam: readonly [string, string][];
  ayarlar: readonly [string, boolean][];
  gruplar: readonly { baslik: string; simge: SimgeAdi; akislar: readonly Akis[] }[];
  kontrol: { veri: Kontrol | undefined; yukleniyor: boolean; hata: unknown; dene: () => void };
  not: string;
}

function Sistem({ baslik, baglanti, ortam, ayarlar, gruplar, kontrol, not }: SistemOzellikleri) {
  const genel = genelDurum(baglanti, kontrol.veri);
  return (
    <Kart
      baslik={baslik}
      sag={<Dugme simge="rotate" yukleniyor={kontrol.yukleniyor} onClick={kontrol.dene}>Bağlantıyı dene</Dugme>}
    >
      <div className="tc-hazirlik">
        <p role="status" className="tc-hazirlik-ozet"><Rozet ton={genel.ton}>{genel.metin}</Rozet></p>
        <dl className="tc-hazirlik-liste">
          {ortam.map(([ad, deger]) => <Satir key={ad} ad={ad} deger={deger} />)}
          {ayarlar.map(([ad, acik]) => (
            <Satir key={ad} ad={ad} deger={<Rozet ton={acik ? 'tamam' : 'pasif'}>{acik ? 'Açık' : 'Kapalı'}</Rozet>} />
          ))}
        </dl>
        <p className="tc-ayar-aciklama">{not}</p>
        {kontrol.hata !== null && <DurumKutusu durum="hata" mesaj={hataIletisi(kontrol.hata, 'Deneme yapılamadı.')} yenile={kontrol.dene} />}
        {kontrol.veri && <KontrolSonucu kontrol={kontrol.veri} />}
        <div className="tc-hazirlik-gruplar">
          {gruplar.map((g) => <AkisGrubu key={g.baslik} {...g} kontrol={kontrol.veri} />)}
        </div>
      </div>
    </Kart>
  );
}

function Satir({ ad, deger }: { ad: string; deger: ReactNode }) {
  return <><dt>{ad}</dt><dd>{deger}</dd></>;
}

// Deneme sorgusu düğmeyle başlar; dış sistem yavaş olabilir, otomatik yenilenmez ve yinelenmez.
const DENEME = { enabled: false, retry: false, staleTime: Infinity, gcTime: Infinity } as const;

function LogoBolumu() {
  const h = useQuery({ queryKey: anahtarlar.logoHazirlik, queryFn: () => api.get<LogoHazirlikCevabi>('/logo/hazirlik') });
  const k = useQuery({ queryKey: anahtarlar.logoKontrol, queryFn: () => api.get<LogoKontrolCevabi>('/logo/hazirlik/kontrol'), ...DENEME });
  if (h.isPending) return <Kart baslik="Logo Tiger köprüsü"><DurumKutusu durum="yukleniyor" /></Kart>;
  if (h.isError) {
    return <Kart baslik="Logo Tiger köprüsü"><DurumKutusu durum="hata" mesaj={hataIletisi(h.error, 'Logo durumu alınamadı.')} yenile={() => { void h.refetch(); }} /></Kart>;
  }
  const d = h.data;
  const akis = (yon: 'tmi-logo' | 'logo-tmi'): Akis[] => d.akislar.filter((a) => a.yon === yon).map((a) => ({
    ...a,
    sayilar: sayiMetni([[a.gonderilen, a.yon === 'logo-tmi' ? 'okundu' : 'gönderildi'], [a.hatali, 'hatalı']]) ?? (a.sonDeneme ? `son okuma ${zamanMetni(a.sonDeneme)}` : null),
    sonHata: null,
  }));
  return (
    <Sistem
      baslik="Logo Tiger köprüsü"
      baglanti={d.baglanti}
      ortam={[
        ['Köprü adresi', d.ortam.adres ?? 'Tanımlı değil (TMIV2_LOGO_KOPRU_ADRESI)'],
        ['Köprü anahtarı', d.ortam.anahtarTanimli ? 'Tanımlı' : 'Tanımlı değil (TMIV2_LOGO_KOPRU_ANAHTARI)'],
      ]}
      ayarlar={d.ayarlar.map((a) => [a.baslik, a.acik] as const)}
      gruplar={[
        { baslik: 'TMI → Logo', simge: 'upload', akislar: akis('tmi-logo') },
        { baslik: 'Logo → TMI', simge: 'download', akislar: akis('logo-tmi') },
      ]}
      kontrol={{ veri: k.data, yukleniyor: k.isFetching, hata: k.isError ? k.error : null, dene: () => { void k.refetch(); } }}
      not="Deneme yalnız okur: ambar listesi, deneme malzemesinin “var mı” kaydı ve birim seti listesi. Logo’ya yazma isteği gitmez. Firma ve dönem köprünün kendi ayarındadır."
    />
  );
}

function SmartesBolumu() {
  const h = useQuery({ queryKey: anahtarlar.smartesHazirlik, queryFn: () => api.get<SmartesHazirlikCevabi>('/smartes/hazirlik') });
  const k = useQuery({ queryKey: anahtarlar.smartesKontrol, queryFn: () => api.get<SmartesKontrolCevabi>('/smartes/hazirlik/kontrol'), ...DENEME });
  if (h.isPending) return <Kart baslik="SmartES MES"><DurumKutusu durum="yukleniyor" /></Kart>;
  if (h.isError) {
    return <Kart baslik="SmartES MES"><DurumKutusu durum="hata" mesaj={hataIletisi(h.error, 'SmartES durumu alınamadı.')} yenile={() => { void h.refetch(); }} /></Kart>;
  }
  const d = h.data;
  const akis = (yon: 'tmi-smartes' | 'smartes-tmi'): Akis[] => d.akislar.filter((a) => a.yon === yon).map((a) => ({
    ...a,
    sayilar: [sayiMetni([[a.islenen, 'kayıt'], [a.hatali, 'hatalı']]), a.sonDeneme ? `son ${zamanMetni(a.sonDeneme)}` : null].filter(Boolean).join(' · ') || null,
  }));
  return (
    <Sistem
      baslik="SmartES MES"
      baglanti={d.baglanti}
      ortam={[
        ['Servis adresi', d.ortam.adres ?? 'Tanımlı değil (TMIV2_SMARTES_ADRESI)'],
        ['Ad alanı', d.ortam.adAlani ?? 'Varsayılan'],
      ]}
      ayarlar={[['SmartES bağlantısı', d.baglanti !== 'kapali']]}
      gruplar={[
        { baslik: 'TMI → SmartES', simge: 'upload', akislar: akis('tmi-smartes') },
        { baslik: 'SmartES → TMI', simge: 'download', akislar: akis('smartes-tmi') },
      ]}
      kontrol={{ veri: k.data, yukleniyor: k.isFetching, hata: k.isError ? k.error : null, dene: () => { void k.refetch(); } }}
      not="Deneme yalnız okur: servis tanımı (WSDL) ve son bir saatin üretim listesi. Okunan satır kaydedilmez, işaretlenmez; MES verisi değişmez."
    />
  );
}

export function BaglantiHazirligi() {
  return (
    <div className="tc-ayar-bolum">
      <p className="tc-ayar-aciklama">
        Ayarları değiştirmek için Logo ve SmartES sekmelerine geçin. Adres ve anahtar sunucunun ortam değişkenlerindedir; değişince sunucu yeniden başlatılır.
      </p>
      <LogoBolumu />
      <SmartesBolumu />
    </div>
  );
}
