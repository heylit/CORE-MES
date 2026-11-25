import { useCallback, useEffect, useMemo, useState } from 'react';
import type { AZAMI_HAZIRLIK_EMRI as SINIR, HazirlikCevabi, HazirlikMaddesi, HazirlikOzetiCevabi } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import { tmiBitti } from '../../../../../../arkon/web/src/data/biten-is.ts';
import { tmiEmirId } from '../../../../../../arkon/web/src/data/tmi-adim.ts';
import { api } from '../../../../ortak/veri/api.ts';
import { Simge } from '../../../../ortak/arayuz/index.ts';
import { HAZIRLIK_MADDE_BILGISI } from '../../../uretim-emirleri/disari.ts';
import { gorunum, hazirlikOzeti, hazirlikSatirlari, type HazirlikSatiri, type Ton as HazirlikTonu } from '../operator/HazirlikListesi.tsx';
import { Cip } from './denetimler.tsx';
import type { Pkg, Ton } from './tipler.ts';

// 2227: hazırlık matrisi (2060 a) Üretim Hazırlık listesinde. Kaynak emir ayrıntısındakiyle aynı uçtur; burada yalnız görünür,
// başlatma kuralı sunucuda değişmeden durur. Okunamazsa (yetki, ağ) çip çizilmez.

// Uç tek okumada en çok bu kadar emir alır; sözleşmedeki sınır değişirse tip uyuşmaz.
const AZAMI_HAZIRLIK_EMRI: typeof SINIR = 100;

// Kayıttaki değer tipine güvenilmez (eski paket): sayı değilse yok sayılır.
export const paketIsEmriId = (p: Pkg): number | null => {
  const id: unknown = p.tmi?.isEmriId;
  return typeof id === 'number' && Number.isSafeInteger(id) && id > 0 ? id : null;
};
const bitti = (p: Pkg): boolean => tmiBitti(p as { tmi?: { bitti?: unknown } | null });

// Bitmiş işin hazırlığı sorulmaz; aynı emrin paketleri tek kimlik.
export function hazirlikEmirleri(paketler: readonly Pkg[]): number[] {
  const l = new Set<number>();
  for (const p of paketler) {
    const id = bitti(p) ? null : tmiEmirId(p);
    if (id !== null) l.add(id);
  }
  return [...l].sort((a, b) => a - b);
}

export const hazirlikBeklenir = (p: Pkg): boolean => !bitti(p) && tmiEmirId(p) !== null;
export function paketHazirligi(harita: ReadonlyMap<number, HazirlikCevabi>, p: Pkg): HazirlikSatiri[] | null {
  const emir = bitti(p) ? null : tmiEmirId(p);
  const v = emir === null ? undefined : harita.get(emir);
  return v ? hazirlikSatirlari(v, paketIsEmriId(p)) : null;
}

export function useHazirlikOzeti(paketler: readonly Pkg[]): { harita: ReadonlyMap<number, HazirlikCevabi>; zaman: number | null; yenile: () => void } {
  const anahtar = hazirlikEmirleri(paketler).join(',');
  const [d, dYaz] = useState<{ harita: ReadonlyMap<number, HazirlikCevabi>; zaman: number }>({ harita: new Map(), zaman: 0 });
  const [n, nYaz] = useState(0);
  useEffect(() => {
    if (anahtar === '') { dYaz({ harita: new Map(), zaman: 0 }); return; }
    let canli = true;
    const idler = anahtar.split(',');
    const parcalar: string[][] = [];
    for (let i = 0; i < idler.length; i += AZAMI_HAZIRLIK_EMRI) parcalar.push(idler.slice(i, i + AZAMI_HAZIRLIK_EMRI));
    void Promise.all(parcalar.map((p) => api.get<HazirlikOzetiCevabi>(`/adimli-emirler/hazirlik-ozeti?emirler=${p.join(',')}`).catch(() => null)))
      .then((l) => {
        if (!canli) return;
        dYaz({ harita: new Map(l.flatMap((c) => (c ? c.emirler.map((e) => [e.emirId, e.hazirlik] as const) : []))), zaman: Date.now() });
      });
    return () => { canli = false; };
  }, [anahtar, n]);
  const yenile = useCallback(() => nYaz((x) => x + 1), []);
  return useMemo(() => ({ harita: d.harita, zaman: d.zaman || null, yenile }), [d, yenile]);
}

const CIP_TONU: Readonly<Record<HazirlikTonu, Ton>> = { hata: 'stop', uyari: 'hold', tamam: 'run', pasif: 'idle' };

// Paket kartı düğmedir; çip içinde ikinci düğme olmaz, ayrıntı paketin Yayınla sekmesindedir.
export function HazirlikPaketCipi({ satirlar }: { satirlar: readonly HazirlikSatiri[] | null }) {
  if (!satirlar) return null;
  const o = hazirlikOzeti(satirlar);
  return <Cip ton={CIP_TONU[o.ton]}>{o.metin}</Cip>;
}

// 3688: her adımın satırında 12 maddelik hazırlık matrisi (sabit sıra: durduranlar önce). Yalnız gösterim; işaretleme Adım Durumu sayfasındadır.
// Hücre rengi tek başına anlam taşımaz: simge ve ad (başlık ve erişilebilir ad) aynı durumu söyler.
// Sıra tek kaynakta: kayıt tipi yeni maddeyi eksik bırakırsa derleme durur; test HAZIRLIK_MADDELERI ile eşitliği denetler.
export const MADDE_SIRASI: Record<HazirlikMaddesi, number> = { cnc: 0, cizim: 1, yayin: 2, rota: 3, malzeme: 4, 'takim-omru': 5, 'takim-hazirla': 6, makine: 7, talimat: 8, 'ek-madde': 9, aparat: 10, 'olcu-aleti': 11 };
// Veri gelene kadar aynı yüksekliği ve aynı sarmayı ayırır: 12 boş hücre; satır veri gelince zıplamaz.
export function HazirlikMatrisiYerTutucu() {
  return (
    <span className="tc-ay2-takip-matris" aria-hidden="true" data-yukleniyor="">
      <span className="tc-ay2-takip-hucreler">{MADDE_ADLARI.map((m) => <span key={m} className="tc-ay2-takip-hucre" data-ton="pasif" />)}</span>
      <span className="tc-ay2-takip-not" />
    </span>
  );
}
const MADDE_ADLARI = (Object.keys(MADDE_SIRASI) as HazirlikMaddesi[]).sort((a, b) => MADDE_SIRASI[a] - MADDE_SIRASI[b]);
export function HazirlikMatrisiSeridi({ satirlar }: { satirlar: readonly HazirlikSatiri[] }) {
  const l = [...satirlar].sort((a, b) => MADDE_SIRASI[a.madde] - MADDE_SIRASI[b.madde]);
  const g = l.map((x) => ({ x, g: gorunum(x) }));
  const hata = g.filter((e) => e.x.hal === 'eksik' && e.g.ton === 'hata'); const uyari = g.filter((e) => e.x.hal === 'eksik' && e.g.ton === 'uyari');
  const say = (t: (e: (typeof g)[number]) => boolean) => g.filter(t).length;
  const muaf = say((e) => e.x.hal === 'muaf'); const bilinmiyor = say((e) => e.x.hal === 'bilinmiyor');
  const parcalar = [hata.length ? `${hata.length} eksik` : '', uyari.length ? `${uyari.length} uyarı` : '', muaf ? `${muaf} muaf` : '', bilinmiyor ? `${bilinmiyor} denetlenmiyor` : ''].filter(Boolean);
  const ozet = parcalar.length === 0 ? 'hepsi tamam' : parcalar.join(', ');
  const ad = (e: { x: HazirlikSatiri }) => HAZIRLIK_MADDE_BILGISI[e.x.madde].kisa;
  return (
    <span className="tc-ay2-takip-matris" role="group" aria-label={`Hazırlık matrisi: ${ozet}`}>
      <span className="tc-ay2-takip-hucreler">
        {g.map((e) => {
          const t = `${HAZIRLIK_MADDE_BILGISI[e.x.madde].ad}: ${e.g.ad}`;
          return <span key={e.x.madde} className="tc-ay2-takip-hucre" data-ton={e.g.ton} title={t} role="img" aria-label={t}><Simge ad={e.g.simge} boyut="k" /></span>;
        })}
      </span>
      <span className="tc-ay2-takip-not" aria-hidden="true">
        {hata.length ? <span data-ton="hata">Eksik: {hata.map(ad).join(' · ')}</span> : null}
        {uyari.length ? <span data-ton="uyari">Uyarı: {uyari.map(ad).join(' · ')}</span> : null}
      </span>
    </span>
  );
}
