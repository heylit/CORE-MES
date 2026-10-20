import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import type { AdimliEmirOzeti, AdimliListeCevabi, EmirDurumu } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import { DurumKutusu, Kart, Rozet, Tablo, type RozetTonu, type Sutun } from '../../ortak/arayuz/index.ts';
import { api, hataIletisi } from '../../ortak/veri/api.ts';
import { anahtarlar } from './anahtarlar.ts';
import { tarihMetni } from './gosterim.ts';

// Emir listesini okuyabilen işlemler: üretim emirleri ucunun okuma kümesi (GET /adimli-emirler). Yetkisi olmayana bölüm gösterilmez.
export const EMIR_OKUMA_ISLEMLERI = ['sayfa.uretim-emirleri', 'sayfa.rota', 'uretim-emirleri.yaz', 'uretim-emirleri.fason', 'plan.yaz'] as const;

const DURUM: Record<EmirDurumu, { metin: string; ton: RozetTonu }> = {
  taslak: { metin: 'Taslak', ton: 'pasif' },
  planli: { metin: 'Planlı', ton: 'bilgi' },
  basladi: { metin: 'Başladı', ton: 'uyari' },
  bitti: { metin: 'Bitti', ton: 'tamam' },
  iptal: { metin: 'İptal', ton: 'hata' },
};

const SUTUNLAR: Sutun<AdimliEmirOzeti>[] = [
  // Emir ayrıntısı Rota'nın emir listesindedir; numarayla aranmış olarak açılır.
  { anahtar: 'emirNo', baslik: 'Emir no', mono: true, kirilmaz: true, hucre: (e) => <Link to={`/uretim-emirleri?ara=${encodeURIComponent(e.emirNo)}`}>{e.emirNo}</Link> },
  { anahtar: 'urun', baslik: 'Ürün', hucre: (e) => `${e.urun.kod} · ${e.urun.ad}` },
  { anahtar: 'adet', baslik: 'Adet', hizala: 'sag', mono: true, hucre: (e) => e.adet },
  { anahtar: 'ilerleme', baslik: 'Adım', hizala: 'sag', mono: true, hucre: (e) => `${e.tamamAdim}/${e.adimSayisi}` },
  { anahtar: 'teslim', baslik: 'Teslim', mono: true, kirilmaz: true, hucre: (e) => tarihMetni(e.teslim) },
  { anahtar: 'durum', baslik: 'Durum', hucre: (e) => <Rozet ton={DURUM[e.durum].ton}>{DURUM[e.durum].metin}</Rozet> },
];

export function ProjeEmirleri({ projeId }: { projeId: number }) {
  const sorgu = useQuery({
    queryKey: anahtarlar.emirler(projeId),
    queryFn: () => api.get<AdimliListeCevabi>(`/adimli-emirler?projeId=${projeId}`),
  });
  // Süzgeç sunucudadır; projeId'si tutmayan satır (süzgeci bilmeyen sunucu) gösterilmez, başka projenin emri karışmaz.
  const emirler = (sorgu.data?.emirler ?? []).filter((e) => e.projeId === projeId);
  return (
    <Kart baslik="Üretim emirleri">
      {sorgu.isError
        ? <DurumKutusu durum="hata" mesaj={hataIletisi(sorgu.error, 'Üretim emirleri alınamadı')} yenile={() => { void sorgu.refetch(); }} />
        : (
          <Tablo
            etiket="Projenin üretim emirleri"
            sutunlar={SUTUNLAR}
            satirlar={emirler}
            satirAnahtari={(e) => e.id}
            mesgul={sorgu.isPending}
            bosMesaj="Bu projeye bağlı üretim emri yok"
          />
        )}
    </Kart>
  );
}
