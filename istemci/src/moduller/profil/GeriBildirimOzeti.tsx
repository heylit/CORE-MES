import { useQuery } from '@tanstack/react-query';
import type { GeriBildirimOzetiCevabi } from '#paylasilan/sozlesme/profil.ts';
import { DurumKutusu, Kart, Tablo, type Sutun } from '../../ortak/arayuz/index.ts';
import { api, hataIletisi } from '../../ortak/veri/api.ts';
import { anahtarlar } from './anahtarlar.ts';
import { BOS, sayiMetni } from './gorunum.ts';
import './profil.css';

type KategoriSatiri = GeriBildirimOzetiCevabi['kategoriler'][number];
type AySatiri = GeriBildirimOzetiCevabi['aylar'][number];

const AY_ADLARI = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
const ayMetni = (ay: string): string => {
  const [y, a] = ay.split('-').map(Number) as [number, number];
  return `${AY_ADLARI[a - 1] ?? ay} ${y}`;
};
// Süre saatle gelir; bir günden uzunsa gün olarak okunur. Yanıtlanan yoksa tire (sıfır uydurulmaz).
const sureMetni = (saat: number | null): string => {
  if (saat === null) return BOS;
  return saat >= 24 ? `${sayiMetni(Math.round((saat / 24) * 10) / 10)} gün` : `${sayiMetni(saat)} saat`;
};

const KATEGORI_SUTUNLARI: readonly Sutun<KategoriSatiri>[] = [
  { anahtar: 'ad', baslik: 'Kategori', hucre: (s) => s.ad ?? 'Kategorisiz' },
  { anahtar: 'sikayet', baslik: 'Şikayet', hizala: 'sag', mono: true, hucre: (s) => sayiMetni(s.sikayet) },
  { anahtar: 'istek', baslik: 'İstek', hizala: 'sag', mono: true, hucre: (s) => sayiMetni(s.istek) },
  { anahtar: 'oneri', baslik: 'Öneri', hizala: 'sag', mono: true, hucre: (s) => sayiMetni(s.oneri) },
  { anahtar: 'acik', baslik: 'Açık', hizala: 'sag', mono: true, hucre: (s) => sayiMetni(s.acik) },
];
const AY_SUTUNLARI: readonly Sutun<AySatiri>[] = [
  { anahtar: 'ay', baslik: 'Ay', hucre: (s) => ayMetni(s.ay) },
  { anahtar: 'gelen', baslik: 'Gelen', hizala: 'sag', mono: true, hucre: (s) => sayiMetni(s.gelen) },
  { anahtar: 'sure', baslik: 'İlk yanıta kadar (ortanca)', hizala: 'sag', mono: true, hucre: (s) => sureMetni(s.ilkYanitOrtancaSaat) },
  { anahtar: 'cozulen', baslik: 'Çözülen ya da kapanan', hizala: 'sag', mono: true, hucre: (s) => sayiMetni(s.cozulen) },
];

// Toplam ve eğilim (2192-0 a): son altı ayın kategori dağılımı ve ay ay gelen, yanıt süresi, çözülen.
export function GeriBildirimOzeti() {
  const sorgu = useQuery({ queryKey: anahtarlar.ozet, queryFn: () => api.get<GeriBildirimOzetiCevabi>('/profil/geri-bildirim-ozeti') });
  if (sorgu.isPending) return <DurumKutusu durum="yukleniyor" />;
  if (sorgu.isError) return <DurumKutusu durum="hata" mesaj={hataIletisi(sorgu.error, 'Özet alınamadı')} yenile={() => { void sorgu.refetch(); }} />;
  return (
    <div className="tc-profil tc-gbm-izgara">
      <Kart baslik="Kategoriye göre, son altı ay" simge="tag">
        <Tablo etiket="Kategoriye göre" sutunlar={KATEGORI_SUTUNLARI} satirlar={sorgu.data.kategoriler}
          satirAnahtari={(s) => s.kategoriId ?? 0} bosMesaj="Son altı ayda kayıt yok" />
      </Kart>
      <Kart baslik="Ay ay" simge="chart">
        <Tablo etiket="Ay ay" sutunlar={AY_SUTUNLARI} satirlar={sorgu.data.aylar} satirAnahtari={(s) => s.ay} bosMesaj="Kayıt yok" />
        <p className="tc-profil-soluk">Yanıt süresi yalnız yanıtlanmış kayıtlardan hesaplanır.</p>
      </Kart>
    </div>
  );
}
