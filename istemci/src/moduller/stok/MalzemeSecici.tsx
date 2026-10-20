import { useQuery } from '@tanstack/react-query';
import type { AraCevabi, MalzemeOzetiCevabi } from '#paylasilan/sozlesme/stok.ts';
import { api } from '../../ortak/veri/api.ts';
import { anahtarlar } from './anahtarlar.ts';
import { AramaSecici } from './AramaSecici.tsx';
import { MALZEME_TURU, miktarMetni } from './gorunum.ts';

// Depocu kart numarasını bilmeyebilir: alan ad, stok kodu ya da kart numarasıyla katalogda arar (stok içi arama,
// malzemeler `malzemeAra`); okuyucu kart numarasını yazıp geçebilir. Değer yine kart numarasıdır.
export function MalzemeSecici({ etiket, deger, degistir }: { etiket: string; deger: string; degistir: (v: string) => void }) {
  const id = /^\d{1,9}$/.test(deger) ? Number(deger) : null;
  const metin = id === null && deger.trim().length >= 2 ? deger.trim() : null;
  const o = useQuery({ queryKey: anahtarlar.malzemeOzeti(id ?? 0), queryFn: () => api.get<MalzemeOzetiCevabi>(`/stok/malzemeler/${id}/ozet`), enabled: id !== null && id > 0, retry: false });
  const a = useQuery({ queryKey: [...anahtarlar.hepsi, 'kart-ara', metin], queryFn: () => api.get<AraCevabi>(`/stok/ara?q=${encodeURIComponent(metin!)}`), enabled: metin !== null });
  const kartlar = metin === null ? [] : (a.data?.sonuclar ?? []).flatMap((x) => (x.tur === 'malzeme' ? [x] : [])).slice(0, 8);
  const ozet = o.data?.ozet;
  const ipucu = metin !== null ? (a.isPending ? 'Katalogda aranıyor…' : kartlar.length === 0 ? 'Eşleşen kart yok; adı ya da kodu kısaltın.' : 'Listeden kartı seçin.')
    : id === null ? 'Adını, stok kodunu ya da kart numarasını yazın; okutabilirsiniz.'
      : o.isPending ? 'Kart aranıyor…'
        : ozet ? `${ozet.ad ?? ozet.kod} · ${MALZEME_TURU[ozet.tur]} · ${ozet.kod}${ozet.birim ? ` · ${ozet.birim}` : ''}${ozet.kullanilabilir ? '' : ' · kullanılabilir değil'}`
          : 'Kart bulunamadı.';
  return (
    <AramaSecici etiket={etiket} deger={deger} degistir={degistir} ipucu={ipucu} yerTutucu="Ad, stok kodu ya da kart no"
      secili={id !== null && ozet ? `${ozet.ad ?? ozet.kod} · ${ozet.kod}` : null}
      secenekler={kartlar.map((k) => ({ deger: String(k.malzemeId), baslik: k.ad ?? k.kod, alt: `${k.kod} · #${k.malzemeId}`, sag: `Stok ${miktarMetni(k.toplam)}` }))} />
  );
}

export function useMalzemeOzeti(deger: string) {
  const id = /^\d{1,9}$/.test(deger) ? Number(deger) : 0;
  return useQuery({ queryKey: anahtarlar.malzemeOzeti(id), queryFn: () => api.get<MalzemeOzetiCevabi>(`/stok/malzemeler/${id}/ozet`), enabled: id > 0, retry: false });
}
