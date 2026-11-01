import { useQuery } from '@tanstack/react-query';
import type { OeeCevabi } from '#paylasilan/sozlesme/oee.ts';
import type { GidisatOlcusu } from '#paylasilan/sozlesme/pano.ts';
import { tesisGunu } from '#paylasilan/tesis-zamani.ts';
import { useKaynakBildir } from '../../ortak/arayuz/pano-baglami.ts';
import type { AnaSayfaKaynagi } from '../../ortak/rota/ana-sayfa.ts';
import { api } from '../../ortak/veri/api.ts';
import { anahtarlar } from './anahtarlar.ts';

const GUN_MS = 86_400_000;
const yuzde = (x: number | null): number | null => (x === null ? null : Math.round(x * 1000) / 10);

// Son 7 gün (OEE sayfasının varsayılanı, aynı sorgu anahtarı). Hesaplanamayan değer null kalır; iş merkezleri dağılımdır.
export function oeeOlculeri(c: OeeCevabi): GidisatOlcusu[] {
  const dagilim = c.isMerkezleri.flatMap((m) => (m.oee === null ? [] : [{ etiket: m.ad, deger: yuzde(m.oee) ?? 0 }]));
  return [
    { anahtar: 'tesis-oee', ad: 'Tesis OEE, son 7 gün', deger: yuzde(c.tesis.oee), birim: '%', kiyas: null, plan: null, seri: [], dagilim: [] },
    ...(dagilim.length > 0 ? [{ anahtar: 'is-merkezi-oee', ad: 'İş merkezi OEE, son 7 gün', deger: null, birim: '%', kiyas: null, plan: null, seri: [], dagilim }] : []),
  ];
}

function Oee() {
  const bas = tesisGunu(Date.now() - 6 * GUN_MS);
  const bit = tesisGunu(Date.now());
  const s = useQuery({ queryKey: anahtarlar.oee(bas, bit), queryFn: () => api.get<OeeCevabi>(`/oee?baslangic=${bas}&bitis=${bit}`) });
  useKaynakBildir(s.isError ? null : s.data === undefined ? undefined : oeeOlculeri(s.data));
  return null;
}

export const anaSayfaKaynaklari: AnaSayfaKaynagi[] = [
  { anahtar: 'oee-olcu', tur: 'gidisat', baslik: 'OEE', simge: 'gauge', sira: 400, islem: 'oee.oku', kaynak: Oee },
];
