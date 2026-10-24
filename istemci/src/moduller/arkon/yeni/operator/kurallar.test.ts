import { describe, expect, it } from 'vitest';
import type { AnlikVardiya } from '../cekirdek/vardiya.ts';
import {
  cagriTonu, durumDugmeleri, durusOnerileri, hurdaUyarisi, kalanSure, tonDurumu, vardiyaHesabi, vardiyaOzeti, type VardiyaOzetGirdisi,
} from './kurallar.ts';
import type { Is, KontrolTakvimi } from './tipler.ts';

// Operatör ekranının yeni yazılan saf hesapları. Değerler uydurmadır.

const BOS: KontrolTakvimi = { due: [], next: null, who: {}, why: {} };
const is = (ek: Partial<Is> = {}): Is => ({ no: 'IE-1', part: 'Deneme', op: 'Op 10', due: '—', urgent: false, target: 100, cycle: 30, state: 'running', good: 0, scrap: 0, meas: {}, pins: [], ...ek } as Is);
const VARDIYA: AnlikVardiya = { s: 0, e: 8 * 3600e3, name: 'A', breaks: [], label: 'Vardiya A', tanimsiz: false };
const ortam = { planliMi: () => false, durusPencereleri: () => [] };
const girdi: VardiyaOzetGirdisi = { kisi: 'Deneme Operator', istasyon: 'IST-1', cevrim: 30, olcumUygun: 2, olcumRed: 1, cagriSureleri: [], cagriAcik: false, nedenAdi: (k) => k };

describe('A1 operatör kuralları', () => {
  it('durum düğmeleri: geri alması zor olan Durdur ve Bitir basılı tutulur, her durumda bir ana düğme vardır', () => {
    for (const d of ['queued', 'setup', 'running', 'paused', 'stopped', 'done']) {
      const l = durumDugmeleri(d);
      expect(l.filter((x) => x.ana).length).toBe(1);
      for (const x of l) expect(!!x.tut).toBe(x.eylem === 'stop' || x.eylem === 'finish');
    }
    expect(durumDugmeleri('running').map((x) => x.eylem)).toEqual(['stop', 'pause', 'finish']);
  });

  it('ton ve çağrı renkleri tasarımdaki durum adlarına düşer', () => {
    expect(['run', 'hold', 'stop', 'done', 'hazard', 'idle'].map((t) => tonDurumu(t as 'run'))).toEqual(['calisiyor', 'durakli', 'durdu', 'bitti', 'ayar', 'sirada']);
    expect(['bakim', 'kalite', 'malzeme', 'amir', 'ayarci', 'yok'].map(cagriTonu)).toEqual(['stop', 'done', 'hold', 'hazard', 'idle', 'idle']);
  });

  it('duruş önerileri: takvimdeki planlı duruş başa gelir', () => {
    const l = durusOnerileri({
      o: is({ good: 95, toolsAt: { t: 0 } }), D: BOS, takimlar: [{ id: 't', name: 'T1', life: 100 }], planliDurus: { reason: 'P-01', title: 'Bakım' }, molada: true,
      sonDurusNedeni: 'D-02', siradaki: is({ no: 'IE-2', ready: {} }),
    });
    expect(l.map((x) => x.code)).toEqual(['P-01', 'D-04', 'D-08', 'D-02', 'D-01']);
    expect(durusOnerileri({ o: is(), D: BOS, takimlar: [], planliDurus: null, molada: false, sonDurusNedeni: null, siradaki: null })).toEqual([]);
  });

  it('hurda uyarısı oran sınırında, yoksa son 20 parçada üç hurdada', () => {
    expect(hurdaUyarisi(is({ good: 18, scrap: 1 }), { scrapPct: 10, scrapMin: 20 }, [])).toEqual({ tur: 'oran', oran: 10 });
    expect(hurdaUyarisi(is({ good: 18, scrap: 0 }), { scrapPct: 10, scrapMin: 20 }, [])).toBeNull();
    expect(hurdaUyarisi(is({ good: 50, scrap: 2 }), { scrapPct: 0, scrapMin: 0 }, [40, 45])).toBeNull();
    expect(hurdaUyarisi(is({ good: 50, scrap: 2 }), { scrapPct: 0, scrapMin: 0 }, [31, 40, 45])).toEqual({ tur: 'artis', adet: 3 });
  });

  it('vardiya özeti kayıt yokken sıfır uydurmaz; tanımsız vardiyada OEE yazmaz', () => {
    const bos = vardiyaHesabi({ ev: [], cn: [], sh: VARDIYA }, 3600e3, ortam);
    const oz = vardiyaOzeti(bos, girdi);
    expect(oz.headline).toBe('Bu vardiyada henüz üretim kaydı yok.');
    expect(oz.best).toBe('—');
    expect(bos.expected).toBeNull();
    expect(vardiyaOzeti(vardiyaHesabi({ ev: [], cn: [], sh: { ...VARDIYA, tanimsiz: true } }, 3600e3, ortam), girdi).headline).toBe('Vardiya tanımsız; OEE hesaplanmadı.');
    expect(vardiyaOzeti(bos, { ...girdi, cagriSureleri: [60e3, 120e3], cagriAcik: true })).toMatchObject({ calls: 3, callAvg: '90 sn', mOk: 2, mNok: 1 });
  });

  it('kalan süre negatif adette sıfırdır', () => {
    expect(kalanSure(-3, 30)).toBe('00:00:00');
    expect(kalanSure(10, 30)).toBe('00:05:00');
  });
});
