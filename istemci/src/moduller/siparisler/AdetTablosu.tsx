import { useQuery } from '@tanstack/react-query';
import type { AdetDenemesiCevabi, AdetDenemesiSatiri } from '#paylasilan/sozlesme/siparisler.ts';
import { Tablo, type Sutun } from '../../ortak/arayuz/index.ts';
import { api, hataIletisi } from '../../ortak/veri/api.ts';
import { anahtarlar } from './anahtarlar.ts';
import { miktarMetni, paraMetni, tarihMetni } from './gorunum.ts';

const tutar = (n: number | null, pb: string): string => (n === null || !Number.isFinite(n) ? '—' : paraMetni(n.toFixed(2), pb));
const sayi = (m: string | null | undefined): number | null => (m === null || m === undefined ? null : Number(m));

// Örnek sayfanın "Adet değişirse" tablosu: teklif yarım, aynı, iki ve dört kat adetle arkaya eklenerek ayrı denenir (aynı kâr).
// Fiyat seçili kârla maliyetten önerilir (iskonto hariç). Tek kalemli teklifte birim değerler, çok kalemlide toplamlar yazılır.
export function AdetTablosu({ teklifId, gecerlilik, kar, paraBirimi }: { teklifId: number; gecerlilik: string; kar: number | null; paraBirimi: string }) {
  const sorgu = { gecerlilik };
  const deneme = useQuery({
    queryKey: anahtarlar.adetDenemesi(teklifId, sorgu),
    queryFn: () => api.get<AdetDenemesiCevabi>(`/siparisler/teklifler/${teklifId}/adet-denemesi${gecerlilik === '' ? '' : `?gecerlilik=${gecerlilik}`}`),
  });
  const c = deneme.data;
  if (deneme.isPending) return <p className="tc-sp-ipucu" role="status">Adetler deneniyor…</p>;
  if (deneme.isError) return <p className="tc-sp-hata" role="alert">{hataIletisi(deneme.error, 'Adet denemesi yapılamadı.')}</p>;
  if (c === undefined || c.durum === 'cozucu-yok' || c.satirlar.length === 0) return null;
  const tek = c.satirlar.every((s) => s.kalemler.length === 1);
  const carp = (m: number | null): number | null => (m === null || kar === null ? null : m * (1 + kar / 100));
  const sutunlar: Sutun<AdetDenemesiSatiri>[] = [
    {
      anahtar: 'adet', baslik: 'Adet', hizala: 'sag', kirilmaz: true,
      hucre: (s) => <span className={s.carpan === '1' ? 'tc-sp-guclu' : undefined}>{s.kalemler.map((k) => miktarMetni(k.adet)).join(' + ')}</span>,
    },
    { anahtar: 'termin', baslik: 'Termin', hizala: 'sag', kirilmaz: true, hucre: (s) => tarihMetni(s.termin) },
    ...(tek ? [
      { anahtar: 'maliyet', baslik: 'Birim maliyet', hizala: 'sag', kirilmaz: true, hucre: (s: AdetDenemesiSatiri) => tutar(sayi(s.kalemler[0]?.birimMaliyet), paraBirimi) },
      { anahtar: 'fiyat', baslik: 'Birim fiyat', hizala: 'sag', kirilmaz: true, hucre: (s: AdetDenemesiSatiri) => tutar(carp(sayi(s.kalemler[0]?.birimMaliyet)), paraBirimi) },
    ] as Sutun<AdetDenemesiSatiri>[] : [
      { anahtar: 'maliyet', baslik: 'Maliyet', hizala: 'sag', kirilmaz: true, hucre: (s: AdetDenemesiSatiri) => tutar(sayi(s.maliyetToplami), paraBirimi) },
    ] as Sutun<AdetDenemesiSatiri>[]),
    { anahtar: 'toplam', baslik: 'Toplam fiyat', hizala: 'sag', kirilmaz: true, hucre: (s) => tutar(carp(sayi(s.maliyetToplami)), paraBirimi) },
  ];
  return (
    <section className="tc-sp-yigin" aria-label="Adet değişirse">
      <h3 className="tc-sp-alt-baslik">Adet değişirse <small className="tc-sp-soluk">arkaya ekleme, aynı kâr</small></h3>
      <Tablo etiket="Adet değişirse" sutunlar={sutunlar} satirlar={c.satirlar} satirAnahtari={(s) => s.carpan} bosMesaj="Deneme yok." />
      <p className="tc-sp-ipucu">Ayar süresi adede bölündüğü için birim fiyat adetle düşer; termin tezgâh doluluğu, malzeme ve fasonla uzar.</p>
    </section>
  );
}
