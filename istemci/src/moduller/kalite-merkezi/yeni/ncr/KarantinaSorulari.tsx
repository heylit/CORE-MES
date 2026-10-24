import { useRef, useState, type ReactNode } from 'react';
import type { KmKarantinaKonumlariCevabi, KmKarantinaPartileriCevabi, KmOnaylaGovdesi } from '#paylasilan/sozlesme/kalite-merkezi.ts';
import { Girdi, Secim } from '../../../../ortak/arayuz/Alan.tsx';
import { useBildirim } from '../../../../ortak/arayuz/Bildirim.tsx';
import { Dugme } from '../../../../ortak/arayuz/Dugme.tsx';
import { Pencere } from '../../../../ortak/arayuz/Pencere.tsx';
import { api, ApiHatasi } from '../../../../ortak/veri/api.ts';
import { serbestMiktarHatasi } from './ncr-kurallari.ts';

export type KarantinaPartisi = KmKarantinaPartileriCevabi['partiler'][number];
export type SerbestMiktarlar = NonNullable<KmOnaylaGovdesi['serbestMiktarlar']>;
type Konum = KmKarantinaKonumlariCevabi['konumlar'][number];

const KONUM_ILETISI = 'önceki konumu bilinmiyor';

// KM-K90: kapanış partiyi serbest bırakırken partinin önceki konumu bilinmiyorsa sunucu 422 ile konum ister.
export const konumGerekli = (e: unknown): e is ApiHatasi => e instanceof ApiHatasi && e.durum === 422 && (e.sunucuIletisi ?? '').includes(KONUM_ILETISI);

// Kapanışta bırakılabilecek partiler; okunamazsa (yeni kayıt, bağlantı) boş liste: kapanış sorusuz gider, sunucu bütününü bırakır.
export async function birakilacakPartiler(ncrKimligi: string): Promise<KarantinaPartisi[]> {
  try {
    const c = await api.get<KmKarantinaPartileriCevabi>(`/kalite-merkezi/ncr/${encodeURIComponent(ncrKimligi)}/karantina-partileri`);
    return c.partiler.filter((p) => Number(p.redMiktar) > 0);
  } catch {
    return [];
  }
}

type Soru =
  | { tur: 'miktar'; partiler: KarantinaPartisi[]; bitir: (s: SerbestMiktarlar | null) => void }
  | { tur: 'konum'; ileti: string; konumlar: Konum[]; bitir: (id: number | null) => void };

function MiktarPenceresi({ partiler, bitir }: { partiler: KarantinaPartisi[]; bitir: (s: SerbestMiktarlar | null) => void }) {
  const { bildir } = useBildirim();
  const [degerler, degerlerYaz] = useState(() => partiler.map((p) => p.redMiktar));
  const tamam = () => {
    const secilen: SerbestMiktarlar = [];
    for (const [i, p] of partiler.entries()) {
      const v = (degerler[i] ?? '').trim().replace(',', '.');
      const hata = serbestMiktarHatasi(v, p.redMiktar);
      if (hata) { bildir('hata', hata); return; }
      // Bütünü bırakılan parti gönderilmez (320 a).
      if (Number(v) !== Number(p.redMiktar)) secilen.push({ partiId: p.partiId, miktar: v });
    }
    bitir(secilen);
  };
  return (
    <Pencere acik baslik="Serbest bırakılan adet" kapat={() => bitir(null)}
      alt={<><Dugme onClick={() => bitir(null)}>Vazgeç</Dugme><Dugme tur="birincil" onClick={tamam}>Kapat</Dugme></>}>
      <p>Kalan miktar karantinada kalır.</p>
      {partiler.map((p, i) => (
        <Girdi key={p.partiId} etiket={`Lot ${p.lotNo ?? p.partiId} (red: ${p.redMiktar})`} inputMode="decimal" value={degerler[i] ?? ''}
          onChange={(o) => degerlerYaz((d) => d.map((x, j) => (j === i ? o.target.value : x)))} />
      ))}
    </Pencere>
  );
}

function KonumPenceresi({ ileti, konumlar, bitir }: { ileti: string; konumlar: Konum[]; bitir: (id: number | null) => void }) {
  const { bildir } = useBildirim();
  const [secili, seciliYaz] = useState('');
  const tamam = () => {
    const id = Number(secili);
    if (!(id > 0)) { bildir('hata', 'Konum seçin.'); return; }
    bitir(id);
  };
  return (
    <Pencere acik baslik="Serbest bırakılacak konum" kapat={() => bitir(null)}
      alt={<><Dugme onClick={() => bitir(null)}>Vazgeç</Dugme><Dugme tur="birincil" onClick={tamam}>Serbest bırak</Dugme></>}>
      <p>{ileti}</p>
      <Secim etiket="Konum" required value={secili} onChange={(o) => seciliYaz(o.target.value)} bosSecenek="Seçin"
        secenekler={konumlar.map((k) => ({ deger: String(k.id), baslik: `${k.kod}${k.ad ? ` ${k.ad}` : ''}` }))} />
    </Pencere>
  );
}

// NCR kapanışının iki sorusu (320 a serbest miktar, KM-K90 konum): pencere açılır, cevap söz olarak döner; vazgeçilirse null.
export function useKarantinaSorulari(): { miktarSor: (p: KarantinaPartisi[]) => Promise<SerbestMiktarlar | null>; konumSor: (ileti: string) => Promise<number | null>; pencere: ReactNode } {
  const [soru, soruYaz] = useState<Soru | null>(null);
  const kapat = useRef(() => soruYaz(null));
  const miktarSor = (partiler: KarantinaPartisi[]) => new Promise<SerbestMiktarlar | null>((ok) => {
    soruYaz({ tur: 'miktar', partiler, bitir: (s) => { kapat.current(); ok(s); } });
  });
  const konumSor = async (ileti: string) => {
    let konumlar: Konum[] = [];
    try {
      konumlar = (await api.get<KmKarantinaKonumlariCevabi>('/kalite-merkezi/karantina-konumlari')).konumlar;
    } catch {
      konumlar = [];
    }
    return new Promise<number | null>((ok) => {
      soruYaz({ tur: 'konum', ileti, konumlar, bitir: (id) => { kapat.current(); ok(id); } });
    });
  };
  const pencere = soru === null ? null : soru.tur === 'miktar'
    ? <MiktarPenceresi partiler={soru.partiler} bitir={soru.bitir} />
    : <KonumPenceresi ileti={soru.ileti} konumlar={soru.konumlar} bitir={soru.bitir} />;
  return { miktarSor, konumSor, pencere };
}
