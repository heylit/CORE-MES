import { describe, expect, it } from 'vitest';
import type { Perm } from '../cekirdek/tipler.ts';
import { IS_TURLERI } from '../hazirlik/kurallar.ts';
import type { OpType } from '../hazirlik/tipler.ts';
import { EYLEMLER, eylemGorunur, gorunenEylemler, sayimAdi, sayimArtiEtiketi, sayimArtiIletisi, sayimEksiAria, sayimEksiEtiketi, sayimEksiIletisi } from './eylemler.ts';
import { durumDugmeleri, isSekmeleri, mobilGorunumler } from './kurallar.ts';
import type { Is, KontrolTakvimi } from './tipler.ts';

// 3550 D, dilim 1: eylem kataloğu bugünkü kapılarla aynı görünürlüğü verir (Operator.tsx'in önceki `uretir` ve `duzeltir` kuralları). Değerler uydurmadır.

const TURLER = Object.keys(IS_TURLERI) as OpType[];
const ROLLER: Record<string, readonly Perm[]> = { operator: ['prod.run'], vardiya: ['prod.run', 'prod.fix'], duzeltici: ['prod.fix'], kalite: ['q.meas', 'q.decide'], yok: [] };
const izinli = (liste: readonly Perm[]) => (k: Perm) => liste.includes(k);

// Eski kural: prod.run -> durum, sayım, toplu, hatalı; prod.fix -> eksi ve sayım düzelt; önizlemede hiçbiri.
const ESKI = (liste: readonly Perm[], onizleme: boolean): string[] => {
  const uretir = !onizleme && liste.includes('prod.run'), duzeltir = !onizleme && liste.includes('prod.fix');
  return [...(uretir ? ['durum', 'sayim-arti', 'toplu', 'hatali'] : []), ...(duzeltir ? ['sayim-eksi', 'sayim-duzelt'] : [])];
};

describe('eylem kataloğu', () => {
  it('her tür ve rol için görünen eylemler bugünkü kapılarla aynıdır', () => {
    for (const tur of TURLER) for (const [rol, liste] of Object.entries(ROLLER)) for (const onizleme of [false, true]) {
      expect([...gorunenEylemler(tur, izinli(liste), onizleme)].sort(), `${tur} ${rol} ${String(onizleme)}`).toEqual(ESKI(liste, onizleme).sort());
    }
  });
  it('katalogda her eylem bir kez geçer ve bilinmeyen eylem görünmez', () => {
    expect(new Set(EYLEMLER.map((e) => e.id)).size).toBe(EYLEMLER.length);
    expect(eylemGorunur('yok' as never, 'cnc', () => true)).toBe(false);
  });
  it('durum düğmeleri izne bağlı tek eylemdir; düğme listesi durumdan gelir', () => {
    for (const durum of ['queued', 'setup', 'running', 'paused', 'stopped', 'done']) expect(durumDugmeleri(durum).length).toBeGreaterThan(0);
    expect(eylemGorunur('durum', 'depo', izinli(['prod.run']))).toBe(true);
    expect(eylemGorunur('durum', 'depo', izinli(['q.meas']))).toBe(false);
  });
  it('sayım tuşunun adı türden gelir; talaşlı ve tesviyede bugünkü İyi +1 kalır', () => {
    expect(sayimArtiEtiketi('cnc')).toBe('İyi +1');
    expect(sayimArtiEtiketi('tesviye')).toBe('İyi +1');
    expect(sayimArtiEtiketi('depo')).toBe('Toplanan +1');
    expect(sayimArtiEtiketi('mark')).toBe('Markalanan +1');
    expect(sayimArtiEtiketi('montaj')).toBe('Monte edilen +1');
    expect(sayimArtiIletisi('cnc', '35')).toBe('İyi parça +1 · 35');
    expect(sayimArtiIletisi('depo', '35')).toBe('Toplanan +1 · 35');
  });
});

describe('eksi tuşu ve sayım adı', () => {
  it('sayım adı tür tablosundan gelir; eksi tuşu artı tuşuyla aynı adı taşır', () => {
    for (const tur of TURLER) {
      expect(sayimAdi(tur)).toBe(IS_TURLERI[tur].cnt);
      expect(sayimArtiEtiketi(tur).replace(' +1', '').replace('İyi', 'İyi parça')).toBe(sayimAdi(tur));
      expect(sayimEksiEtiketi(tur).replace(' −1', '').replace('İyi', 'İyi parça')).toBe(sayimAdi(tur));
    }
    expect(sayimEksiEtiketi('cnc')).toBe('İyi −1');
    expect(sayimEksiAria('cnc')).toBe('İyi parça eksi bir');
    expect(sayimEksiIletisi('cnc', '33')).toBe('İyi parça −1 · 33');
    expect(sayimEksiEtiketi('depo')).toBe('Toplanan −1');
    expect(sayimEksiAria('depo')).toBe('Toplanan eksi bir');
  });
});

describe('sabit sekme sırası', () => {
  const BOS: KontrolTakvimi = { due: [], next: null, who: {}, why: {} };
  const o = { pkg: { plan: [{ id: 1 }], files: [{}], steps: [] } } as unknown as Is;
  const ids = (l: { id: string }[]) => l.map((x) => x.id);
  it('telefonda İşler üretimin yanında, Analiz her türde vardır; tür paneli yalnız araya girer', () => {
    expect(ids(mobilGorunumler(o, false, false, 'P', 'gauge', BOS, 0, true))).toEqual(['prod', 'queue', 'draw', 'steps', 'ana']);
    expect(ids(mobilGorunumler(o, false, true, 'P', 'gauge', BOS, 0, true))).toEqual(['prod', 'queue', 'st', 'draw', 'steps', 'ana']);
    expect(ids(mobilGorunumler(o, true, true, 'P', 'gauge', BOS, 0, true))).toEqual(['ozet', 'prod', 'queue', 'st', 'draw', 'steps', 'ana']);
  });
  it('genişte sıra tür paneli, Resim, Adımlar, İşler, Analiz; Talimatlar Adımlar öncesine eklenir', () => {
    expect(ids(isSekmeleri(o, true, 'P', 'gauge', BOS, false, 2))).toEqual(['st', 'draw', 'steps', 'isler', 'ana']);
    expect(ids(isSekmeleri(o, false, 'P', 'gauge', BOS, false, 2))).toEqual(['draw', 'steps', 'isler', 'ana']);
  });
});
