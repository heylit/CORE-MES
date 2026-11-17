import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { ornekCalisma } from '../motor/ornek.ts';
import { planOku, type OkunanPlan, type PlanIslemi } from '../motor/kurallar.ts';
import type { PlanlamaCalismasi } from '../tipler.ts';
import type { KokpitEmri, KokpitIsi, KokpitModeli } from './kurallar.ts';
import { emirMalzemeleri, malzemeNedeni, malzemeVarsayimi, miktarYaz, terminYazisi, type AcikSiparisler } from './malzeme.ts';
import { EmirAdimlari } from './Yerlestirme.tsx';
import { siraKartlari } from './yerlestirme.ts';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

// 3369 a: emrin malzemesi rotadan önceki satır. Veriler uydurmadır (ORN-).
const zaman = (t: number): string => `g${String(Math.floor(t / 24))} ${String(t % 24).padStart(2, '0')}:00`;
const C = { D: { siparisler: [], tezgahlar: [], urunler: [], malzemeler: [{ kod: 'H1', ad: 'ORN-Çubuk Ø40', birim: 'kg' }, { kod: 'H2', ad: 'ORN-Levha', birim: 'adet' }] } } as unknown as PlanlamaCalismasi;
const op = (id: string, S: number, why: string | null): PlanIslemi => ({ id, job: id.split('.')[0] ?? '', m: 'T1', S, C: S + 4, su: 0, run: 4, fas: false, pin: false, Su: S, lot1: S + 1, why: why === null ? null : { t: why }, sl: null, famHit: false, act: false });
const plan = (mal: OkunanPlan['mal'], ops: PlanIslemi[] = []): OkunanPlan => ({
  ops: Object.fromEntries(ops.map((r) => [r.id, r])), fail: [], ozet: { wT: 0, late: 0, n: 0, suH: null, suN: null, famN: null, Cmax: null }, J: {}, util: {}, warn: [], dataVer: 1, ...(mal ? { mal } : {}),
});
const ACIK: AcikSiparisler = [
  { kod: 'H1', miktar: 25, tarih: '2026-11-20', siparisNo: 'ORN-SA-7', satir: 7001, tedarikci: 'ORN-Tedarikçi A' },
  { kod: 'H1', miktar: 10, tarih: null, siparisNo: 'ORN-TL-3', satir: -55, tedarikci: null },
];
const MAL: NonNullable<OkunanPlan['mal']> = {
  // 40 kg: 15 stok + 25 teslim günü belli sipariş; hazır anı 80.
  '1': [{ kod: 'H1', adim: '10', need: 40, t: 80, stok: 15, eksik: 0, pay: [{ tur: 'sa', kim: 7001, q: 25, gelis: 80, tb: false }] }],
  // Termini girilmemiş onaylı talep: plan 30'da gelmiş saydı.
  '2': [{ kod: 'H1', adim: '10', need: 10, t: 8, stok: 0, eksik: 0, pay: [{ tur: 'sa', kim: -55, q: 10, gelis: 30, tb: true }] }],
  // Siparişi verilmemiş 40 adet (motorun varsaydığı satır) ve stoktan 20.
  '3': [{ kod: 'H2', adim: null, need: 60, t: 8, stok: 20, eksik: 0, pay: [{ tur: 'yok', kim: null, q: 40, gelis: 30, tb: true }] }],
  '4': [{ kod: 'H1', adim: '10', need: 80, t: 8, stok: 80, eksik: 0, pay: [] }],
};

describe('Kokpit malzeme satırı: hesap (3369)', () => {
  it('pay stoktan, siparişten ve eksik olarak toplanır; durum en kötü paya göredir', () => {
    const { satirlar } = emirMalzemeleri(C, plan(MAL), ACIK, 8);
    expect(satirlar['1']?.[0]).toMatchObject({ ad: 'ORN-Çubuk Ø40', birim: 'kg', adimId: '1.10', ihtiyac: 40, stoktan: 15, siparisten: 25, eksik: 0, durum: 'geliyor', an: 80 });
    expect(satirlar['2']?.[0]).toMatchObject({ stoktan: 0, siparisten: 10, eksik: 0, durum: 'terminsiz', an: 30 });
    expect(satirlar['3']?.[0]).toMatchObject({ adimId: null, stoktan: 20, siparisten: 0, eksik: 40, durum: 'eksik', an: null, siparisler: [] });
    expect(satirlar['4']?.[0]).toMatchObject({ stoktan: 80, siparisten: 0, eksik: 0, durum: 'stokta', an: null, siparisler: [] });
    for (const l of Object.values(satirlar)) for (const x of l) expect(x.stoktan + x.siparisten + x.eksik).toBe(x.ihtiyac);
  });

  it('hem eksiği hem termini girilmemiş siparişi olan satır eksiktir; birden çok terminsiz payda an en geç sayılan geliştir', () => {
    const mal: NonNullable<OkunanPlan['mal']> = {
      '5': [{ kod: 'H1', adim: '10', need: 30, t: 8, stok: 0, eksik: 0, pay: [{ tur: 'sa', kim: -55, q: 10, gelis: 30, tb: true }, { tur: 'yok', kim: null, q: 20, gelis: 50, tb: true }] }],
      '6': [{ kod: 'H1', adim: '10', need: 30, t: 8, stok: 0, eksik: 0, pay: [{ tur: 'sa', kim: -55, q: 10, gelis: 30, tb: true }, { tur: 'sa', kim: 7001, q: 20, gelis: 50, tb: true }] }],
    };
    const { satirlar } = emirMalzemeleri(C, plan(mal), ACIK, 8);
    expect(satirlar['5']?.[0]).toMatchObject({ siparisten: 10, eksik: 20, durum: 'eksik', an: null });
    expect(satirlar['6']?.[0]).toMatchObject({ siparisten: 30, eksik: 0, durum: 'terminsiz', an: 50 });
  });

  it('sipariş no ve tedarikçi açık sipariş okumasından anahtarla eşlenir; eksi anahtar onaylı taleptir', () => {
    const { satirlar } = emirMalzemeleri(C, plan(MAL), ACIK, 8);
    expect(satirlar['1']?.[0]?.siparisler).toEqual([{ no: 'ORN-SA-7', tedarikci: 'ORN-Tedarikçi A', talep: false, miktar: 25 }]);
    expect(satirlar['2']?.[0]?.siparisler).toEqual([{ no: 'ORN-TL-3', tedarikci: null, talep: true, miktar: 10 }]);
  });

  it('satın alma okunamadıysa (null ya da yok) miktar ve termin kalır, sipariş no ve tedarikçi boştur', () => {
    for (const acik of [null, undefined]) {
      const x = emirMalzemeleri(C, plan(MAL), acik, 8).satirlar['1']?.[0];
      expect(x).toMatchObject({ siparisten: 25, durum: 'geliyor', an: 80 });
      expect(x?.siparisler).toEqual([{ no: null, tedarikci: null, talep: false, miktar: 25 }]);
    }
  });

  it('eski plan kaydında (mal yok) ve plan yokken satır yoktur', () => {
    expect(emirMalzemeleri(C, plan(undefined), ACIK, 8).satirlar).toEqual({});
    expect(emirMalzemeleri(C, null, ACIK, 8)).toEqual({ satirlar: {}, bekleyen: {} });
  });

  it('gelişi şimdiden önce olan siparişte an yazılmaz; tanımı olmayan malzemede kod yazar', () => {
    const x = emirMalzemeleri(C, plan({ '1': [{ kod: 'HX', adim: '10', need: 5, t: 6, stok: 0, eksik: 0, pay: [{ tur: 'sa', kim: null, q: 5, gelis: 6, tb: false }] }] }), ACIK, 8).satirlar['1']?.[0];
    expect(x).toMatchObject({ ad: 'HX', birim: '', durum: 'geliyor', an: null });
    expect(terminYazisi(x!, zaman, 'Torna')).toEqual({ ana: 'siparişte', alt: 'gelişi işin başlangıcından önce' });
  });

  it('malzemeyi bekleyerek yerleşen adım (nedeni malzeme) başlangıcıyla işaretlenir; neden cümlesi yalnız o adımda', () => {
    const { bekleyen } = emirMalzemeleri(C, plan(MAL, [op('1.10', 80, 'malzeme'), op('1.20', 90, 'rota'), op('4.10', 8, null)]), ACIK, 8);
    expect(bekleyen).toEqual({ '1.10': 80 });
    const e = { adimlar: [{ id: '1.10', ad: 'Torna', adaylar: [] }, { id: '1.20', ad: 'Freze', adaylar: [] }] } as unknown as KokpitEmri;
    expect(malzemeNedeni(e, 0, bekleyen, zaman)).toBe('1. adım (Torna) malzemeyi bekliyor; malzeme g3 08:00 geliyor.');
    expect(malzemeNedeni(e, 1, bekleyen, zaman)).toBeNull();
  });

  it('termin yazıları ve varsayım', () => {
    const { satirlar } = emirMalzemeleri(C, plan(MAL), ACIK, 8);
    expect(terminYazisi(satirlar['1']![0]!, zaman, 'Torna')).toEqual({ ana: 'g3 08:00 geliyor', alt: 'Torna bu tarihten önce başlamaz' });
    expect(terminYazisi(satirlar['2']![0]!, zaman, 'Torna')).toEqual({ ana: 'termin girilmemiş', alt: 'plan malzemeyi g1 06:00 gelmiş saydı' });
    expect(terminYazisi(satirlar['3']![0]!, zaman, null).ana).toBe('eksik');
    expect(terminYazisi(satirlar['4']![0]!, zaman, 'Torna')).toEqual({ ana: 'stokta', alt: null });
    expect([satirlar['1'], satirlar['2'], satirlar['3'], satirlar['4'], undefined].map(malzemeVarsayimi)).toEqual([false, true, true, false, false]);
    expect(miktarYaz(12.345, 'kg')).toBe('12,35 kg');
    expect(miktarYaz(40, '')).toBe('40');
  });

  it('plan kaydındaki malzeme payı okunur; bozuk satır atlanır, kayıtta yoksa boştur', () => {
    const c = ornekCalisma();
    expect(planOku(c)?.mal).toEqual({});
    const p = planOku({ ...c, plan: { ...c.plan!, mal: { '1': [{ kod: 'H1', adim: 10, need: 40, t: 80, stok: 15, eksik: 0, pay: [{ tur: 'sa', kim: 7001, q: 25, gelis: 80, tb: 0 }, { tur: 'yok', q: 'x' }] }, { need: 3 }], '2': 'bozuk' } } });
    expect(p?.mal).toEqual({ '1': [{ kod: 'H1', adim: '10', need: 40, t: 80, stok: 15, eksik: 0, pay: [{ tur: 'sa', kim: 7001, q: 25, gelis: 80, tb: false }] }] });
  });
});

describe('Kokpit malzeme satırı: ekran (3369)', () => {
  const is = (id: string, S: number, C2: number): KokpitIsi => ({ id, job: id.split('.')[0] ?? '', ad: id, m: 'T1', S, C: C2, basladi: false, fason: false, kilitli: false, sira: 0 });
  const emir = (id: string, durum: KokpitEmri['durum'], gecikme: number): KokpitEmri => ({ id, no: `ORN-UE-${id}`, urun: 'ORN-Flanş', adet: 8, termin: 100, bitis: 100 + gecikme, durum, gecikme, adimlar: [{ id: `${id}.10`, ad: 'Torna', adaylar: ['T1'] }] });
  const M: KokpitModeli = {
    simdi: 8, tezgahlar: [{ id: 'T1', kod: 'ORN-T1', ad: '', fason: false }],
    isler: { '1.10': is('1.10', 80, 110), '2.10': is('2.10', 8, 20), '3.10': is('3.10', 8, 20), '4.10': is('4.10', 8, 20) },
    emirler: [emir('1', 'gec', 10), emir('2', 'iyi', -80), emir('3', 'iyi', -80), emir('4', 'iyi', -80)], bas: 0, son: 336, acik: {}, durus: {},
  };
  const kart = (kok: string) => { const k = siraKartlari(M).find((x) => x.kok === kok); if (!k) throw new Error(kok); return k; };
  const ciz = (kok: string, acik: AcikSiparisler = ACIK, gorunum: 'tablo' | 'akis' = 'tablo') => {
    const malzeme = emirMalzemeleri(C, plan(MAL, [op('1.10', 80, 'malzeme')]), acik, 8);
    return render(<EmirAdimlari m={M} kart={kart(kok)} zaman={zaman} uygula={vi.fn()} surum={4} adimAc={vi.fn()} malzeme={malzeme} ilkGorunum={gorunum} />).container;
  };
  const hucre = (k: Element, ad: string): string => k.querySelector(`tr[data-malzeme] td[data-ad="${ad}"]`)?.textContent ?? '';

  it('malzeme satırı adımlardan önce gelir: şirket ve sipariş no, termin, stoktan ve siparişten miktar', () => {
    const k = ciz('1');
    const satirlar = [...k.querySelectorAll('tbody > tr')];
    expect(satirlar[0]?.getAttribute('data-malzeme')).toBe('H1');
    expect(satirlar[0]?.getAttribute('data-durum')).toBe('geliyor');
    expect(satirlar[1]?.getAttribute('data-adim-satir')).toBe('1.10');
    expect(hucre(k, 'Operasyon')).toBe('MalzemeORN-Çubuk Ø40 · 40 kg gerekli');
    expect(hucre(k, 'Bağımlılık')).toBe('Torna için');
    expect(hucre(k, 'Şirket')).toBe('ORN-Tedarikçi Asipariş ORN-SA-7');
    expect(hucre(k, 'Termin')).toBe('g3 08:00 geliyorTorna bu tarihten önce başlamaz');
    expect(hucre(k, 'Adet')).toBe('15 kg stoktan25 kg siparişten');
    expect(hucre(k, 'Durum')).toBe('Bekleniyor');
    // Malzeme satırında düğme ve giriş alanı yoktur: yalnız bilgi.
    expect(k.querySelector('tr[data-malzeme] button, tr[data-malzeme] input, tr[data-malzeme] select')).toBeNull();
  });

  it('geç emrin nedeni malzemeyse satırın üstünde yazar', () => {
    expect(ciz('1').querySelector('[data-emir-neden="malzeme"]')?.textContent).toBe('Neden geç: 1. adım (Torna) malzemeyi bekliyor; malzeme g3 08:00 geliyor.');
    expect(ciz('4').querySelector('[data-emir-neden]')).toBeNull();
  });

  it('termini girilmemiş talep ve eksik: plan malzemeyi gelmiş saydığı için emir "zamanında (malzeme varsayımıyla)" yazar', () => {
    const iki = ciz('2');
    expect(hucre(iki, 'Şirket')).toBe('—talep ORN-TL-3');
    expect(hucre(iki, 'Termin')).toBe('termin girilmemişplan malzemeyi g1 06:00 gelmiş saydı');
    expect(hucre(iki, 'Durum')).toBe('Termin yok');
    expect(iki.querySelector('[data-emir-ozet] b')?.textContent).toBe('zamanında (malzeme varsayımıyla)');
    cleanup();
    const uc = ciz('3');
    expect(hucre(uc, 'Şirket')).toBe('sipariş yok');
    expect(hucre(uc, 'Bağımlılık')).toBe('ilk adımdan önce');
    expect(hucre(uc, 'Adet')).toBe('20 adet stoktan40 adet eksik');
    expect(uc.querySelector('tr[data-malzeme]')?.getAttribute('data-durum')).toBe('eksik');
    expect(uc.querySelector('[data-emir-ozet] b')?.textContent).toBe('zamanında (malzeme varsayımıyla)');
  });

  it('stoktan karşılanan emirde satır "stokta" yazar, durum yazısı değişmez', () => {
    const k = ciz('4');
    expect(hucre(k, 'Termin')).toBe('stokta');
    expect(hucre(k, 'Adet')).toBe('80 kg stoktan');
    expect(hucre(k, 'Şirket')).toBe('—');
    expect(k.querySelector('[data-emir-ozet] b')?.textContent).toBe('zamanında');
  });

  it('satın almayı okuyamayan kişide şirket boş, sipariş numarasız; miktar ve termin yazar', () => {
    const k = ciz('1', null);
    expect(hucre(k, 'Şirket')).toBe('—sipariş');
    expect(hucre(k, 'Adet')).toBe('15 kg stoktan25 kg siparişten');
    expect(k.textContent).not.toContain('ORN-SA-7');
    expect(k.textContent).not.toContain('ORN-Tedarikçi');
  });

  it('malzeme verilmezse (eski plan kaydı) satır yoktur', () => {
    const k = render(<EmirAdimlari m={M} kart={kart('1')} zaman={zaman} uygula={vi.fn()} surum={4} adimAc={vi.fn()} />).container;
    expect(k.querySelector('tr[data-malzeme]')).toBeNull();
    expect(k.querySelector('[data-emir-neden]')).toBeNull();
  });

  it('akış görünümünde malzeme ilk kutudur', () => {
    const k = ciz('1', ACIK, 'akis');
    const ilk = k.querySelector('ol.tc-pyq-rota > li');
    expect(ilk?.getAttribute('data-malzeme')).toBe('H1');
    expect(ilk?.textContent).toBe('MalzemeORN-Çubuk Ø40g3 08:00 geliyor');
  });
});
