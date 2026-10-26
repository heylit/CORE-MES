import { describe, expect, it } from 'vitest';
import type { AnlikVardiya } from '../cekirdek/vardiya.ts';
import {
  cagriTonu, cubukDugmeleri, durumDugmeleri, numuneAraligi, durusOnerileri, hurdaUyarisi, kalanSure, kaliteIstasyonuNumuneleri, lotKarariEksigi, lotKarariOku, lotSayisi, tonDurumu, vardiyaHesabi, vardiyaOzeti, type VardiyaOzetGirdisi,
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

describe('600 a: kalite istasyonu', () => {
  const numune = (id: string, ek: Record<string, unknown>) => ({ id, pkgId: 'p', no: 'IE-1', part: 'P', rev: 'A', machine: 'TOR', by: 'x', at: 1, reason: '', items: [1], crit: false, cnt: 1, status: 'waiting', results: {}, ...ek }) as never;
  it('yalnız bu istasyona gelen açık numuneler, eskiden yeniye', () => {
    const l = [numune('b', { kaliteIstasyonu: 'KAL', at: 5 }), numune('a', { kaliteIstasyonu: 'KAL', at: 2, status: 'measuring' }), numune('c', { kaliteIstasyonu: 'KAL2' }),
      numune('d', { kaliteIstasyonu: 'KAL', status: 'approved' }), numune('e', {})];
    expect(kaliteIstasyonuNumuneleri(l, 'KAL').map((r) => r.id)).toEqual(['a', 'b']);
  });
  it('lot kararının eksiği: boş sınıf sayılmamıştır, Red kusur ve gerekçe ister', () => {
    const b = (k: number | null | 'hata', m: number | null | 'hata' = null) => ({ Kritik: k, Majör: m, Minör: null });
    expect([lotSayisi(''), lotSayisi(' 3 '), lotSayisi('-1'), lotSayisi('1.5')]).toEqual([null, 3, 'hata', 'hata']);
    expect(lotKarariEksigi('kabul', b(null), '')).toMatch(/kusurlu sayılarını/);
    expect(lotKarariEksigi('kabul', b(0, 0), '')).toBeNull();
    expect(lotKarariEksigi('kabul', b('hata'), '')).toMatch(/tam sayı/);
    expect(lotKarariEksigi('ret', b(0, 0), 'çapak')).toMatch(/en az bir kusurlu/);
    expect(lotKarariEksigi('ret', b(0, 2), ' ')).toMatch(/gerekçe/);
    expect(lotKarariEksigi('ret', b(0, 2), 'çapak')).toBeNull();
  });
  it('sonuç belgesindeki lot kararı', () => {
    const lk = { karar: 'kabul', bulunan: { Kritik: 0, Majör: 0, Minör: null }, at: 1 };
    expect(lotKarariOku({ lotKarari: lk })).toEqual(lk);
    expect(lotKarariOku({ lotKarari: { ...lk, karar: 'x' } })).toBeNull();
    expect(lotKarariOku({})).toBeNull();
    expect(lotKarariOku(null)).toBeNull();
  });
});

describe('telefon eylem çubuğu (618)', () => {
  it('her durumda ana eylem ve varsa Durdur; Bitir, Hazırlık ve Resim çubukta yok; hiçbiri basılı tutma istemez', () => {
    const etiketler = (d: string) => cubukDugmeleri(d).map((x) => x.etiket);
    expect(etiketler('queued')).toEqual(['İşi Başlat']);
    expect(etiketler('setup')).toEqual(['Üretime Geç']);
    expect(etiketler('running')).toEqual(['Durdur', 'Duraklat']);
    expect(etiketler('paused')).toEqual(['Durdur', 'Devam Et']);
    expect(etiketler('stopped')).toEqual(['Yeniden Başlat']);
    expect(etiketler('done')).toEqual(['Sıradaki İş']);
    for (const d of ['queued', 'setup', 'running', 'paused', 'stopped', 'done']) expect(cubukDugmeleri(d).every((x) => !x.tut && x.eylem !== 'finish')).toBe(true);
  });
});

describe('numune çizgisi aralığı (664)', () => {
  const kural = (ek: object) => ({ id: 'k', when: 'every', n: 50, ...ek }) as unknown as Parameters<typeof numuneAraligi>[0];
  it('sayıyla tekrarda aralıkta sayılan ve sıradaki numunenin parça sırası; taban işe dönüşte sayılmış parçalardır', () => {
    expect(numuneAraligi(kural({}), { good: 38, baseGood: 0, startedAt: 0 }, 0)).toEqual({ n: 50, birim: 'parça', gecen: 38, hedef: 50 });
    expect(numuneAraligi(kural({}), { good: 62, baseGood: 0, startedAt: 0 }, 0)).toEqual({ n: 50, birim: 'parça', gecen: 12, hedef: 100 });
    expect(numuneAraligi(kural({}), { good: 15, baseGood: 10, startedAt: 0 }, 0)).toEqual({ n: 50, birim: 'parça', gecen: 5, hedef: 60 });
  });
  it('süreyle tekrarda geçen dakika; başlamamış işte ve ilk, son, vardiya kuralında çizgi yok', () => {
    expect(numuneAraligi(kural({ when: 'time', n: 60 }), { good: 0, baseGood: 0, startedAt: 1000 }, 1000 + 75 * 60000)).toEqual({ n: 60, birim: 'dk', gecen: 15, hedef: null });
    expect(numuneAraligi(kural({ when: 'time', n: 60 }), { good: 0, baseGood: 0, startedAt: 0 }, 5000)).toBeNull();
    for (const when of ['first', 'last', 'shift']) expect(numuneAraligi(kural({ when }), { good: 10, baseGood: 0, startedAt: 1 }, 2)).toBeNull();
  });
});
