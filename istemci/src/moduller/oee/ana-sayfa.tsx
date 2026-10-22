import { useQuery } from '@tanstack/react-query';
import type { OeeCevabi } from '#paylasilan/sozlesme/oee.ts';
import { tesisGunu } from '#paylasilan/tesis-zamani.ts';
import { CubukListesiKarti, type CubukSatiri } from '../../ortak/arayuz/PanoGrafikleri.tsx';
import { SayiKarti } from '../../ortak/arayuz/SayiKarti.tsx';
import type { AnaSayfaKarti } from '../../ortak/rota/ana-sayfa.ts';
import { api } from '../../ortak/veri/api.ts';
import { anahtarlar } from './anahtarlar.ts';

const GUN_MS = 86_400_000;
const gunOnce = (gun: number): string => tesisGunu(Date.now() - gun * GUN_MS);
const yuzde = (x: number): string => `%${(x * 100).toLocaleString('tr-TR', { maximumFractionDigits: 1 })}`;
// OEE sayfasıyla aynı eşik: %60 altı zayıf (yalnız renk).
const ZAYIF = 0.6;

// İki kart OEE sayfasının varsayılan dönemini (son 7 gün) okur: sayfayla aynı sorgu anahtarı, tek istek.
function useHaftalikOee() {
  const bas = gunOnce(6);
  const bit = gunOnce(0);
  return useQuery({ queryKey: anahtarlar.oee(bas, bit), queryFn: () => api.get<OeeCevabi>(`/oee?baslangic=${bas}&bitis=${bit}`) });
}

function TesisOee() {
  const o = useHaftalikOee();
  const t = o.data?.tesis;
  // Hesaplanamayan OEE "Veri yok"tur; sıfır uydurulmaz.
  const metin = t?.oee == null ? undefined : yuzde(t.oee);
  const sayi = t === undefined ? undefined : t.oee === null ? null : undefined;
  const k = t?.kullanilabilirlik ?? null;
  const p = t?.performans ?? null;
  const q = t?.kalite ?? null;
  const alt = k !== null && p !== null && q !== null ? `Kullanım ${yuzde(k)} · Performans ${yuzde(p)} · Kalite ${yuzde(q)}` : 'Vardiya takvimine göre';
  return <SayiKarti baslik="Tesis OEE, son 7 gün" simge="gauge" metin={metin} sayi={sayi} altMetin={alt} yol="/oee" hata={o.isError} />;
}

function IsMerkeziOee() {
  const o = useHaftalikOee();
  const satirlar: CubukSatiri[] | undefined = o.data?.isMerkezleri.flatMap((m) => (m.oee === null ? [] : [{
    etiket: m.ad, deger: Math.round(m.oee * 1000) / 10, ...(m.oee < ZAYIF ? { ton: 'uyari' as const } : {}),
  }]));
  return (
    <CubukListesiKarti baslik="İş merkezi OEE, son 7 gün" simge="chart" birim="%" enUst={100} satirlar={satirlar}
      altMetin="Hesaplanamayan iş merkezi çizilmez" yol="/oee" hata={o.isError} />
  );
}

// OEE ucunun yetkisiyle görünür.
export const anaSayfaKartlari: AnaSayfaKarti[] = [
  { anahtar: 'oee-tesis', sira: 50, bolum: 'ozet', islem: 'oee.oku', ekran: TesisOee },
  { anahtar: 'oee-is-merkezi', sira: 190, bolum: 'grafik', islem: 'oee.oku', ekran: IsMerkeziOee },
];
