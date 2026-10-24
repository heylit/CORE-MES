import { describe, expect, it } from 'vitest';
import {
  arizaEkle, arizaKaldir, arizalar, girdiDegeri, girdiSaati, gruplar, isiSeviyesi, kilitDegistir, planOku, planSayilari, saatYaz,
  simdiSaati, siparisler, sureYaz, terminSaati, tezgahlar, yapilacaklar, yol,
} from './kurallar.ts';
import { ornekCalisma } from './ornek.ts';

describe('P1 kuralları', () => {
  it('kayıttaki planı okur; bozuk işlem düşer, plan yoksa null', () => {
    const c = ornekCalisma();
    (c.plan as unknown as { ops: Record<string, unknown> }).ops.bozuk = { id: 'bozuk', job: 'S1', m: 'T1', S: 'x', C: 3 };
    const p = planOku(c);
    expect(p).not.toBeNull();
    expect(Object.keys(p?.ops ?? {})).toHaveLength(5);
    expect(p?.ops['S2.20']?.fas).toBe(1);
    expect(planOku({ ...c, plan: null })).toBeNull();
    expect(planOku(null)).toBeNull();
  });

  it('saat planın başlangıç gününden yazılır; başlangıç yoksa —', () => {
    const c = ornekCalisma();
    expect(saatYaz(c.D, 9.5)).toBe('19.10 Pzt 09:30');
    expect(saatYaz(c.D, 33)).toBe('20.10 Sal 09:00');
    expect(saatYaz({ ...c.D, meta: {} }, 3)).toBe('—');
    expect(terminSaati(c.D, '2026-10-20 06:00')).toBe(30);
    expect(terminSaati(c.D, null)).toBeNull();
    expect(girdiSaati(c.D, girdiDegeri(c.D, 27.25))).toBe(27.25);
  });

  it('süre biçimi', () => {
    expect(sureYaz(0.5)).toBe('30 dk');
    expect(sureYaz(3)).toBe('3 sa');
    expect(sureYaz(52)).toBe('2 g 4 sa');
    expect(sureYaz(null)).toBe('—');
  });

  it('şimdi kayıttan, yoksa duvar saatinden', () => {
    const c = ornekCalisma();
    expect(simdiSaati(c)).toBe(8);
    const { simdi: _, ...d } = c;
    expect(simdiSaati(d as typeof c, new Date(2026, 9, 20, 6, 30).getTime())).toBe(30.5);
  });

  it('tezgâhlar kuyruk, doluluk ve geciken siparişle; plana giren fasoncu fason grubunda', () => {
    const c = ornekCalisma();
    const p = planOku(c);
    if (p === null) throw new Error('plan');
    const t = tezgahlar(c, p, 8);
    expect(t.map((x) => x.id)).toEqual(['T1', 'F1', '@K']);
    const t1 = t[0];
    expect(t1?.kuyruk.map((r) => r.id)).toEqual(['S1.10', 'S2.10']);
    expect(t1?.gecikenSiparis).toBe(1);
    expect(t1?.doluluk).toBe(0.82);
    expect(t[2]?.grup).toBe('fason');
    expect(t[2]?.doluluk).toBeNull();
    // Gruplar rotadaki ortalama sırayla: torna önce, freze ve fason sonra.
    expect(gruplar(t, p).map((g) => g.ad)[0]).toBe('Torna');
    expect(isiSeviyesi(null)).toBe('yok');
    expect([0.02, 0.2, 0.5, 0.82, 0.9].map(isiSeviyesi)).toEqual(['yok', 'dusuk', 'orta', 'yuksek', 'asiri']);
  });

  it('siparişler gecikene göre; durum ve pay terminden', () => {
    const c = ornekCalisma();
    const p = planOku(c);
    if (p === null) throw new Error('plan');
    const s = siparisler(c, p);
    expect(s.map((x) => [x.id, x.durum])).toEqual([['S2', 'gec'], ['S1', 'risk'], ['S3', 'iyi']]);
    expect(s[1]?.pay).toBe(3);
    const y = yol(s[0] ?? s[1] ?? (() => { throw new Error(); })());
    expect(y.adimlar.map((a) => a.bekleme)).toEqual([null, 0]);
    expect(y.islem).toBe(28);
  });

  it('özet sayıları ve yapılacaklar; veri bayatsa ilk karar yeniden çözmek', () => {
    const c = ornekCalisma();
    const p = planOku(c);
    if (p === null) throw new Error('plan');
    const n = planSayilari(c, p);
    expect(n).toMatchObject({ siparis: 3, gec: 1, zamaninda: 2, gecikme: 28, ayar: 1.5, sonBitis: 40, yerlesmeyen: 1 });
    expect(n.enYogun).toEqual({ id: 'T1', u: 0.82 });
    expect(n.ortDoluluk).toBeCloseTo(0.56);
    const l = yapilacaklar(c, p, siparisler(c, p), false);
    expect(l.map((x) => x.anahtar)).toEqual(['bayat', 'yerlesmeyen', 'gec-S2', 'malzeme']);
  });

  it('kilit ve arıza karar alanlarına yazılır', () => {
    const c = ornekCalisma();
    const p = planOku(c);
    const r = p?.ops['S1.10'];
    if (!r) throw new Error('işlem');
    kilitDegistir(c, r);
    expect(c.locks['S1.10']).toEqual({ m: 'T1', S: 9 });
    kilitDegistir(c, r);
    expect(c.locks).toEqual({});
    expect(arizaEkle(c, { m: 'T1', from: 20, to: 18 })).toBe(false);
    expect(arizaEkle(c, { m: 'T1', from: 30, to: 34 })).toBe(true);
    expect(arizaEkle(c, { m: 'T1', from: 20, to: 22 })).toBe(true);
    expect(arizalar(c, 'T1').map((a) => a.from)).toEqual([20, 30]);
    expect(arizaKaldir(c, 5)).toBe(false);
    expect(arizaKaldir(c, 0)).toBe(true);
    expect(arizalar(c, 'T1')).toEqual([{ i: 0, from: 30, to: 34 }]);
  });
});
