import { useQuery } from '@tanstack/react-query';
import type { PiktogramAdi } from '#paylasilan/etiket-piktogramlari.ts';
import { TUM_SAYFALAR } from '#paylasilan/sayfalar.ts';
import type { EtiketDurumu, EtiketlerCevabi } from '#paylasilan/sozlesme/etiket-merkezi.ts';
import { DurumKutusu, Kart, Rozet, Tablo, type RozetTonu, type Sutun } from '../../ortak/arayuz/index.ts';
import { api } from '../../ortak/veri/api.ts';
import { anahtarlar } from './anahtarlar.ts';
import { Simge } from './Onizleme.tsx';
import './etiket-merkezi.css';

type Etiket = EtiketlerCevabi['etiketler'][number];

const ETIKET_DURUMU_ADLARI: Record<EtiketDurumu, string> = { hazir: 'Basılıyor', 'ilk-tur': 'İlk tur', 'ikinci-tur': 'İkinci tur' };
const DURUM_TONU: Record<EtiketDurumu, RozetTonu> = { hazir: 'tamam', 'ilk-tur': 'uyari', 'ikinci-tur': 'pasif' };
// Sahip modül anahtarla gelir; kullanıcı modülü ana menüdeki adıyla tanır.
const modulAdi = (modul: string): string => TUM_SAYFALAR.find((s) => s.yol === `/${modul}`)?.baslik ?? modul;

// Basılı etiketin sağ üst karosundaki piktogramın aynısı; listede tür ilk bakışta tanınır. Yeni tür eklenene kadar yazıcı simgesi görünür.
const TUR_SIMGESI: Readonly<Record<string, PiktogramAdi>> = {
  konum: 'konum', raf: 'raf', malzeme: 'malzeme', lot: 'lot', refakat: 'refakat', istasyon: 'tezgah', 'kalite-durum': 'kalite',
  'hatali-parca': 'hatali', 'sevk-koli': 'koli', kalibrasyon: 'kumpas', 'seri-no': 'seri', 'fason-gidis': 'fason', deneme: 'yazici',
};

const SUTUNLAR: readonly Sutun<Etiket>[] = [
  {
    anahtar: 'ad', baslik: 'Etiket', csv: (e) => e.ad,
    hucre: (e) => (
      <span className="tc-etk-tur">
        <svg className="tc-etk-tur-simge" viewBox="0 0 48 48" aria-hidden="true"><Simge ad={TUR_SIMGESI[e.kod] ?? 'yazici'} karo="siyah" /></svg>
        {e.ad}
      </span>
    ),
  },
  { anahtar: 'sahip', baslik: 'Sahip modül', hucre: (e) => modulAdi(e.sahipModul) },
  { anahtar: 'tetik', baslik: 'Ne zaman basılır', hucre: (e) => e.tetik },
  { anahtar: 'alanlar', baslik: 'İçerik', hucre: (e) => e.alanlar },
  { anahtar: 'sablonlar', baslik: 'Şablonlar', hucre: (e) => (e.sablonlar.length === 0 ? '-' : e.sablonlar.map((s) => s.ad).join(', ')) },
  {
    anahtar: 'durum', baslik: 'Durum',
    hucre: (e) => <Rozet ton={DURUM_TONU[e.durum]}>{ETIKET_DURUMU_ADLARI[e.durum]}</Rozet>,
    csv: (e) => ETIKET_DURUMU_ADLARI[e.durum],
  },
  { anahtar: 'disari', baslik: 'Bugün başka yerde', hucre: (e) => e.disaridakiYol ?? '-' },
];

// Bütün etiketler Etiket Merkezi'nden basılır (1288); başka ekranda basılan tür taşınana kadar burada görünür.
export function Etiketler() {
  const liste = useQuery({ queryKey: anahtarlar.etiketler, queryFn: () => api.get<EtiketlerCevabi>('/etiket-merkezi/etiketler') });
  if (liste.isPending) return <Kart baslik="Etiketler"><DurumKutusu durum="yukleniyor" /></Kart>;
  if (liste.isError) return <Kart baslik="Etiketler"><DurumKutusu durum="hata" yenile={() => { void liste.refetch(); }} /></Kart>;
  return (
    <Kart baslik="Etiketler">
      <p className="tc-etk-not">Sistemdeki bütün etiket türleri. "Basılıyor" olanlar Hazır şablonlardan basılır; "İlk tur" ve "İkinci tur" sırada bekleyenlerdir. "Bugün başka yerde" sütunundaki ekranlar Etiket Merkezi'ne taşınacak.</p>
      <Tablo etiket="Etiketler" sutunlar={SUTUNLAR} satirlar={liste.data.etiketler} satirAnahtari={(e) => e.kod} bosMesaj="Etiket türü yok." />
    </Kart>
  );
}
