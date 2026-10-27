import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { KmOlcumGovdesi, KmResim } from '#paylasilan/sozlesme/kalite-merkezi-studyo.ts';
import { DurumKutusu, Secim, useBildirim } from '../../../ortak/arayuz/index.ts';
import type { Balon, Olcum } from '../../../ortak/cizim/kurallar.ts';
import type { TeknikResimKontrolu } from '../../../ortak/cizim/TeknikResim.tsx';
import { hataIletisi } from '../../../ortak/veri/api.ts';
import { cizimBalonu, cizimOlcumleri, sonOlcumler, yeniOlcumler } from './kurallar.ts';
import { studyoAnahtari, useBalonYeriYaz, useEmirOlcumleri, useResimDosyasi, useStudyoParcasi } from './veri.ts';

// Kalite formu (798): parçanın teknik resmi, balonları ve emrin ölçümleri tek kayıttır (kalite_merkezi_olcum). Aynı form Kalite Merkezi
// stüdyosunda ve Arkon terminalinde ("Ölç") açılır; iki yerden girilen ölçü aynı kayda düşer. Yazımı form yapmaz, açan verir: stüdyo
// Kalite Merkezi ucuna, terminal kendi sunucusuna yazar (o da aynı işlemde Kalite Merkezi'ne yazar, kaynak terminalin rolüdür).

const TeknikResim = lazy(async () => ({ default: (await import('../../../ortak/cizim/TeknikResim.tsx')).TeknikResim }));
const BOS_SATIR: readonly never[] = [];

export type OlcumYazimi = KmOlcumGovdesi;
export type OlcumYazici = (g: OlcumYazimi) => Promise<unknown>;

type BalonYeri = Pick<Balon, 'yer' | 'yerKipi'>;

// Resmin dosyası gelince ortak parçaya verilir; parça dosyayı adının uzantısından (PDF, STEP, IGES, STL) tanır.
// `yerYaz` verilince taşınan balonun yeri (913 a) hemen kendi ucuna yazılır; verilmezse yer, açanın balonlarYaz'ına (plan taslağına) gider.
// Yazılan yer cevap gelene dek ekranda tutulur: yoksa balon bir an eski yerine sıçrar.
export function Resim({ resim, kontrol, yerYaz = false }: { resim: KmResim; kontrol: Omit<TeknikResimKontrolu, 'anahtar' | 'dosyalar' | 'anaResim'>; yerYaz?: boolean }) {
  const dosya = useResimDosyasi(resim);
  const { bildir } = useBildirim();
  const yeriYaz = useBalonYeriYaz(resim.malzemeNo);
  const [bekleyen, bekleyenYaz] = useState<Record<number, BalonYeri>>({});
  const balonlar = useMemo(() => (kontrol.balonlar ?? []).map((b) => {
    const y = bekleyen[b.id];
    return y ? { ...b, yer: y.yer ?? null, yerKipi: y.yerKipi ?? null } : b;
  }), [kontrol.balonlar, bekleyen]);
  const balonYeriYaz = useCallback((no: number, yer: Balon['yer'], yerKipi: Balon['yerKipi']) => {
    const balon = resim.balonlar.find((b) => b.no === no);
    if (!balon) return;
    bekleyenYaz((o) => ({ ...o, [no]: { yer: yer ?? null, yerKipi: yerKipi ?? null } }));
    const birak = () => { bekleyenYaz((o) => Object.fromEntries(Object.entries(o).filter(([k]) => Number(k) !== no))); };
    yeriYaz.mutate({ balon, yer: yer ?? null, yerKipi: yerKipi ?? null }, {
      onSuccess: birak,
      onError: (h) => { birak(); bildir('hata', hataIletisi(h, 'Balon yeri kaydedilemedi.')); },
    });
  }, [resim.balonlar, yeriYaz, bildir]);
  if (dosya.isError) return <DurumKutusu durum="hata" mesaj={hataIletisi(dosya.error, 'Resim dosyası alınamadı')} yenile={() => { void dosya.refetch(); }} />;
  if (!dosya.data) return <DurumKutusu durum="yukleniyor" />;
  const ad = dosya.data.ad ?? resim.ad;
  const tam: TeknikResimKontrolu = {
    ...kontrol,
    ...(yerYaz ? { balonlar, balonYeriYaz } : {}),
    anahtar: `km-resim-${String(resim.id)}-${resim.ozet}`,
    dosyalar: [{ kind: resim.tur === 'resim' ? 'pdf' : 'model', name: ad, bytes: dosya.data.bayt, merkez: resim.merkezBelgeId, merkezOzet: resim.ozet }],
    anaResim: ad,
  };
  return <Suspense fallback={<DurumKutusu durum="yukleniyor" />}><TeknikResim kontrol={tam} /></Suspense>;
}

// Formun kaydı: emrin son ölçümleri, gönderilen ve cevabı beklenen ölçüler. Gönderilen ölçü kayıt yenilenene dek ekranda kalır; ret
// gelirse geri alınır. `engel` yazmayı durduran nedeni döner (yetki, kaydedilmemiş plan); yoksa null.
export function useKaliteFormu({ resim, uretimEmriId, numuneId, yaz, engel }: {
  resim: KmResim | null; uretimEmriId: number | null; numuneId?: number | undefined; yaz: OlcumYazici; engel: () => string | null;
}) {
  const istemci = useQueryClient();
  const { bildir } = useBildirim();
  const olcumler = useEmirOlcumleri(uretimEmriId);
  const sonlar = useMemo(() => sonOlcumler(olcumler.data?.olcumler ?? []), [olcumler.data]);
  const kmBalonlari = resim?.balonlar ?? BOS_SATIR;
  const balonlar = useMemo(() => kmBalonlari.map(cizimBalonu), [kmBalonlari]);
  const kayitli = useMemo(() => cizimOlcumleri(kmBalonlari, sonlar), [kmBalonlari, sonlar]);
  const [bekleyen, bekleyenYaz] = useState<Record<number, Olcum>>({});
  const gosterilen = useMemo(() => ({ ...kayitli, ...bekleyen }), [kayitli, bekleyen]);
  const olcumlerYaz = useCallback((yeni: Record<number, Olcum>) => {
    const neden = engel();
    if (neden !== null) { bildir('bilgi', neden); return; }
    if (uretimEmriId === null) { bildir('bilgi', 'Ölçüm yazmak için üretim emri seçin.'); return; }
    const satirlar = yeniOlcumler(kmBalonlari, gosterilen, yeni);
    if (!satirlar.length) return;
    const nolar = Object.keys(yeni).map(Number).filter((no) => yeni[no] !== gosterilen[no]);
    bekleyenYaz((o) => ({ ...o, ...Object.fromEntries(nolar.map((no) => [no, yeni[no]])) }));
    const birak = () => { bekleyenYaz((o) => Object.fromEntries(Object.entries(o).filter(([no]) => !nolar.includes(Number(no))))); };
    const yenile = () => istemci.invalidateQueries({ queryKey: studyoAnahtari.emirOlcumleri(uretimEmriId) });
    yaz({ uretimEmriId, ...(numuneId !== undefined ? { numuneId } : {}), olcumler: satirlar }).then(
      async () => { await yenile(); birak(); },
      (h: unknown) => { birak(); void yenile(); bildir('hata', hataIletisi(h, 'Ölçüm kaydedilemedi.')); },
    );
  }, [engel, uretimEmriId, numuneId, kmBalonlari, gosterilen, yaz, istemci, bildir]);
  useEffect(() => { bekleyenYaz({}); }, [resim?.id, uretimEmriId]);
  return { olcumler, balonlar, gosterilen, olcumlerYaz };
}

// Terminalin açtığı form: parçanın etkin resimlerinden biri seçilir, balonlar salt okunur, ölçü girilir. `yazabilir` yoksa yalnız görünür.
export function KaliteFormu({ malzemeNo, uretimEmriId, numuneId, yaz, yazabilir, ek }: {
  malzemeNo: number; uretimEmriId: number; numuneId?: number | undefined; yaz: OlcumYazici; yazabilir: boolean;
  ek?: Partial<Omit<TeknikResimKontrolu, 'anahtar' | 'dosyalar' | 'anaResim' | 'balonlar' | 'balonlarYaz' | 'olcumler' | 'olcumlerYaz'>>;
}) {
  const parca = useStudyoParcasi(malzemeNo);
  const resimler = useMemo(() => (parca.data?.resimler ?? []).filter((r) => r.aktif), [parca.data]);
  const [resimId, resimIdYaz] = useState<number | null>(null);
  const resim = resimler.find((r) => r.id === resimId) ?? resimler[0] ?? null;
  const engel = useCallback(() => (yazabilir ? null : 'Ölçüm yazma yetkiniz yok.'), [yazabilir]);
  const f = useKaliteFormu({ resim, uretimEmriId, numuneId, yaz, engel });
  return (
    <section aria-label="Kalite formu">
      {resimler.length > 1 ? (
        <Secim etiket="Resim" value={String(resim?.id ?? '')} onChange={(o) => { resimIdYaz(Number(o.target.value)); }}
          secenekler={resimler.map((r) => ({ deger: String(r.id), baslik: `${r.ad}${r.revizyon ? ` · Rev ${r.revizyon}` : ''}` }))} />
      ) : null}
      {parca.isError ? <DurumKutusu durum="hata" mesaj={hataIletisi(parca.error, 'Resimler alınamadı')} yenile={() => { void parca.refetch(); }} />
        : f.olcumler.isError ? <DurumKutusu durum="hata" mesaj={hataIletisi(f.olcumler.error, 'Ölçümler alınamadı')} yenile={() => { void f.olcumler.refetch(); }} />
          : resim ? (
            <Resim resim={resim} kontrol={{
              ...ek, balonlar: f.balonlar, balonlarYaz: () => undefined, olcumler: f.gosterilen, olcumlerYaz: f.olcumlerYaz, saltOkunur: true,
              ...(yazabilir ? {} : { olcumYok: true }),
            }} />
          ) : <DurumKutusu durum={parca.isPending ? 'yukleniyor' : 'bos'} mesaj="Bu parçanın Kalite Merkezi'nde resmi yok." />}
    </section>
  );
}
