import { useQuery } from '@tanstack/react-query';
import { EMIR_TURLERI, EMIR_TURU_ADLARI } from '#paylasilan/sozlesme/emir-turleri.ts';
import type { UrunRevizyonlariCevabi } from '#paylasilan/sozlesme/rota.ts';
import { Dugme, Girdi, Secim } from '../../ortak/arayuz/index.ts';
import { api } from '../../ortak/veri/api.ts';
import { anahtarlar } from './anahtarlar.ts';
import { sayiGirdisi } from './gorunum.ts';

type EmirTuru = (typeof EMIR_TURLERI)[number];
// rotaId null: emir türünün rotası (3296-3 a).
export interface PartiDegeri { anahtar: number; emirTuru: EmirTuru; adet: string; rotaId: number | null }

// Sunucudaki PARTI_EN_COK (sözleşme zod taşır; istemci değerini ithal etmez).
const PARTI_EN_COK = 8;

let sayac = 0;
export const partiAnahtari = (): number => ++sayac;

const SECENEKLER = EMIR_TURLERI.map((t) => ({ deger: t, baslik: EMIR_TURU_ADLARI[t] }));

// Binde bir hassasiyetle toplam (sunucudaki SIP-18 ile aynı); okunamayan sayı null.
function binde(metin: string): number | null {
  const m = /^(\d+)(?:\.(\d{1,3}))?$/.exec(sayiGirdisi(metin));
  return m === null ? null : Number(m[1]) * 1000 + Number((m[2] ?? '').padEnd(3, '0'));
}

// 3296-3 a: ürünün yürürlükte revizyonu olan rotaları; ürünün tek rotası varsa ya da Reçete ve Rota okunamıyorsa seçim gösterilmez.
function useSecilebilirRotalar(malzemeNo: number | null): { deger: string; baslik: string }[] {
  const q = useQuery({
    queryKey: anahtarlar.urunRotalari(malzemeNo ?? 0),
    queryFn: () => api.get<UrunRevizyonlariCevabi>(`/rota/urunler/${String(malzemeNo)}`),
    enabled: malzemeNo !== null,
    retry: false,
    staleTime: 60_000,
  });
  const yururlukte = new Set((q.data?.revizyonlar ?? []).filter((r) => r.durum === 'yururlukte').map((r) => r.rotaId));
  const rotalar = (q.data?.rotalar ?? []).filter((r) => yururlukte.has(r.id));
  return rotalar.length < 2 ? [] : rotalar.map((r) => ({ deger: String(r.id), baslik: r.ad }));
}

interface Ozellikler {
  sira: number;
  malzemeNo: number | null;
  miktar: string;
  partiler: PartiDegeri[];
  degistir: (partiler: PartiDegeri[]) => void;
  hata?: string;
}

// 3244 b: kalem üretim çeşidine göre partilere ayrılır (örnek 10 FAI + 90 seri). Parti yoksa kalem tek seri partidir; emir projeden
// açılırken her parti ayrı emir olur. Toplam kalem miktarına eşit olmalı; sunucu da denetler (SIP-18).
// 3296-3 a: aynı türden birden çok parti olur (iki seri teslim gibi); partiye elle rota seçilebilir, boşsa türün rotası.
export function KalemPartileri({ sira, malzemeNo, miktar, partiler, degistir, hata }: Ozellikler) {
  const rotalar = useSecilebilirRotalar(malzemeNo);
  const rotaSecenekleri = [{ deger: '', baslik: 'Türün rotası' }, ...rotalar];
  const ekle = () => {
    // İlk parti eklenirken kalem iki partiye bölünür: seri kalem miktarıyla, yeni tür boş; kullanıcı adedi seriden düşer.
    degistir(partiler.length === 0
      ? [{ anahtar: partiAnahtari(), emirTuru: 'fai', adet: '', rotaId: null }, { anahtar: partiAnahtari(), emirTuru: 'seri', adet: miktar, rotaId: null }]
      : [...partiler, { anahtar: partiAnahtari(), emirTuru: 'seri', adet: '', rotaId: null }]);
  };
  const yaz = (j: number, yama: Partial<PartiDegeri>) => degistir(partiler.map((p, k) => (k === j ? { ...p, ...yama } : p)));
  const toplam = partiler.reduce<number | null>((t, p) => { const b = binde(p.adet); return t === null || b === null ? null : t + b; }, 0);
  const hedef = binde(miktar);
  const tutuyor = toplam !== null && hedef !== null && toplam === hedef;
  return (
    <fieldset className="tc-sp-partiler" aria-label={`Kalem ${sira} üretim çeşidi`}>
      <legend>Üretim çeşidi</legend>
      {partiler.length === 0
        ? <p className="tc-sp-parti-bos">Tek parti: Seri, kalem miktarı kadar.</p>
        : partiler.map((p, j) => (
          <div key={p.anahtar} className={rotalar.length > 0 ? 'tc-sp-parti tc-sp-parti-rotali' : 'tc-sp-parti'}>
            <Secim
              etiket="Çeşit"
              aria-label={`Kalem ${sira} parti ${j + 1} çeşit`}
              secenekler={SECENEKLER}
              value={p.emirTuru}
              onChange={(o) => yaz(j, { emirTuru: o.target.value as EmirTuru })}
            />
            {rotalar.length > 0 && (
              <Secim
                etiket="Rota"
                aria-label={`Kalem ${sira} parti ${j + 1} rota`}
                secenekler={rotaSecenekleri.some((x) => x.deger === String(p.rotaId ?? ''))
                  ? rotaSecenekleri : [...rotaSecenekleri, { deger: String(p.rotaId), baslik: 'Yürürlükte değil' }]}
                value={p.rotaId === null ? '' : String(p.rotaId)}
                onChange={(o) => yaz(j, { rotaId: o.target.value === '' ? null : Number(o.target.value) })}
              />
            )}
            <Girdi etiket="Adet" aria-label={`Kalem ${sira} parti ${j + 1} adet`} inputMode="decimal" autoComplete="off" value={p.adet} onChange={(o) => yaz(j, { adet: o.target.value })} />
            <Dugme simge="trash" aria-label={`Kalem ${sira} parti ${j + 1} sil`} onClick={() => degistir(partiler.filter((_, k) => k !== j))} />
          </div>
        ))}
      <div className="tc-sp-parti-alt">
        {partiler.length > 0 && (
          <span className={tutuyor ? 'tc-sp-parti-toplam' : 'tc-sp-parti-toplam tc-sp-hata'} role={tutuyor ? undefined : 'status'}>
            {toplam === null || hedef === null ? 'Toplam hesaplanamadı' : `Toplam ${String(toplam / 1000)} / ${String(hedef / 1000)}`}
          </span>
        )}
        {hata !== undefined && <span className="tc-sp-hata" role="alert">{hata}</span>}
        <Dugme simge="plus" disabled={partiler.length >= PARTI_EN_COK} onClick={ekle}>Parti ekle</Dugme>
      </div>
    </fieldset>
  );
}
