import { describe, expect, it } from 'vitest';
import type { Pkg, PlannedDown } from '../../../../../../arkon/shared/model.ts';
import { ILK_AYARLAR } from '../cekirdek/ayarlar.ts';
import {
  csvDosyaAdi, csvMetni, durusHatasi, enCokUretim, enDusukOee, halkaYaylari, kartDurumu, karoSinifi, karoSiniflari, onayBekliyor, seritKonumu,
  tasimaPlani, yeniDurus, type PanoKarosu,
} from './kurallar.ts';

// A3 kuralları: eskisinde ayrı işlev olmayan, ekran içinden çıkarılmış hesaplar. Adlar uydurmadır.

const paket = (id: string, ek: Partial<Pkg> = {}): Pkg => ({ id, no: id, machine: 'S1', seq: undefined, due: '', createdAt: 0, status: 'published', ...ek } as unknown as Pkg);

describe('A3 kuralları', () => {
  it('CSV: BOM, noktalı virgül, iki ondalık virgülle, gerektiğinde tırnak', () => {
    expect(csvMetni([['a', 1.005, 2.5, null], ['x;y', 'tırnak "z"', undefined, 3]])).toBe('﻿a;1;2,5;\r\n"x;y";"tırnak ""z""";;3');
    expect(csvDosyaAdi('rapor 05.10/ş')).toBe('rapor_05.10_ş.csv');
  });

  it('taşıma: şerit 10\'ar adımla yeniden sıralanır, değişmeyen yazılmaz, başka şeride geçenin makinesi boşalır', () => {
    const a = paket('a', { seq: 10 });
    const b = paket('b', { seq: 20 });
    const c = paket('c', { seq: 30, machine: 'S2', mc: 'M9' });
    const ayni = tasimaPlani([a, b], b, 'S1', 'a');
    expect(ayni.yazilacaklar.map((x) => [x.id, x.seq])).toEqual([['b', 10], ['a', 20]]);
    expect(ayni.tasindi).toBe(false);
    const gecen = tasimaPlani([a, b, c], c, 'S1');
    expect(gecen.tasindi).toBe(true);
    expect(gecen.yazilacaklar).toEqual([{ ...c, seq: 30, machine: 'S1', mc: '' }]);
    expect(tasimaPlani([a, b], a, 'S1', 'a').yazilacaklar).toEqual([]);
  });

  it('onay bekleme ve kart durumu', () => {
    const p = paket('p', { apReq: { at: 10, by: 'x' } } as Partial<Pkg>);
    expect(onayBekliyor(p)).toBe(true);
    expect(onayBekliyor({ ...p, approval: { ok: true, at: 11, by: 'y' } } as Pkg)).toBe(false);
    expect(onayBekliyor(null)).toBe(false);
    expect(kartDurumu(p, null)).toBe('review');
    expect(kartDurumu(p, { state: 'running' } as never)).toBe('production');
    expect(kartDurumu(p, { state: 'done' } as never)).toBe('done');
    expect(kartDurumu(paket('d', { status: 'draft' }), { state: 'running' } as never)).toBe('draft');
  });

  it('planlı duruş: kayıt öncesi denetim ve yeni kaydın ilk değerleri', () => {
    const d = { reason: 'D-07', from: 10, to: 20, scope: 'st', target: 'S1' } as PlannedDown;
    expect(durusHatasi(d)).toBeNull();
    expect(durusHatasi({ ...d, reason: '' })).toBe('Neden seç');
    expect(durusHatasi({ ...d, to: 10 })).toBe('Bitiş başlangıçtan sonra olmalı');
    expect(durusHatasi({ ...d, scope: 'wc', target: '' })).toBe('İş merkezi seç');
    expect(durusHatasi({ ...d, scope: 'all', target: '' })).toBeNull();
    const simdi = new Date(2026, 2, 9, 15).getTime();
    const y = yeniDurus(simdi, { ...ILK_AYARLAR, durusNedenleri: [{ code: 'U-1', l: 'A', cat: 'u', durum: 'durdu' }, { code: 'D-1', l: 'B', cat: 'p', durum: 'durdu' }] }, 'k');
    expect(y).toMatchObject({ id: 'dn-k', isNew: true, reason: 'D-1', from: new Date(2026, 2, 10, 8).getTime(), rep: 'none', days: [1, 2, 3, 4, 5] });
    expect(y.to - y.from).toBe(2 * 3600e3);
    expect(seritKonumu(-1, 0)).toBe(0);
    expect(seritKonumu(7 * 864e5 * 2, 0)).toBe(100);
  });

  it('halka: dilimler yüzdeyle, aralarında boşlukla; ölçekte kalan boş, toplam sıfırsa yay yok', () => {
    expect(halkaYaylari([{ deger: 3, renk: 'run' }, { deger: 1, renk: 'stop' }])).toEqual([
      { renk: 'run', dizi: '74.40 25.60', kayma: '25.00' },
      { renk: 'stop', dizi: '24.40 75.60', kayma: '-50.00' },
    ]);
    expect(halkaYaylari([{ deger: 5, renk: 'run' }, { deger: 0, renk: 'stop' }])).toEqual([{ renk: 'run', dizi: '100.00 0.00', kayma: '25.00' }]);
    expect(halkaYaylari([{ deger: 0.68, renk: 'hazard' }], 1)).toEqual([{ renk: 'hazard', dizi: '68.00 32.00', kayma: '25.00' }]);
    expect(halkaYaylari([{ deger: 0, renk: 'run' }])).toEqual([]);
    expect(halkaYaylari([], 1)).toEqual([]);
  });

  it('istasyon sınıfı tek ve kesin: çalışan, plansız, planlı (pencere ya da planlı neden), diğer', () => {
    const k = (state: string, etiket: string, dn = false) => ({ state, look: { durum: 'sirada', etiket }, dn: dn ? {} : null }) as unknown as PanoKarosu;
    const liste = [k('running', 'Çalışıyor', true), k('stopped', 'Durdu'), k('stopped', 'Planlı duruş'), k('none', 'Veri yok', true), k('setup', 'Ayar')];
    expect(liste.map(karoSinifi)).toEqual(['calisiyor', 'plansiz', 'planli', 'planli', 'diger']);
    expect(karoSiniflari(liste)).toEqual({ calisiyor: 1, plansiz: 1, planli: 2, diger: 1 });
  });

  it('kısa listeler: verisi olmayan istasyon girmez, sıra ve adet', () => {
    const k = (id: string, oee: number | null, good: number) => ({ s: { id }, c: { oee, good } }) as unknown as PanoKarosu;
    const liste = [k('a', 0.8, 10), k('b', null, 0), k('c', 0.4, 30), k('d', 0.6, 20), k('e', 0.9, 5)];
    expect(enDusukOee(liste).map((x) => x.s.id)).toEqual(['c', 'd', 'a']);
    expect(enCokUretim(liste, 2).map((x) => x.s.id)).toEqual(['c', 'd']);
  });
});
