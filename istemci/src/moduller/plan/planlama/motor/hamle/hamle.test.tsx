import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { DegerlendirmeCevabi } from '#paylasilan/sozlesme/planlama.ts';
import type { CalismaKomutu } from '../../kayit.ts';
import type { PlanlamaCalismasi } from '../../tipler.ts';
import { KAYDEDILEMEDI, planKurSifirla } from '../coz.ts';
import type { OkunanPlan } from '../kurallar.ts';
import { ornekCalisma } from '../ornek.ts';
import { HamleOnizlemesi } from './Onizleme.tsx';
import {
  BAYAT, DAHA_IYISI_YOK, FASON_SIRASI, HAMLE_ESKIDI, hamleIste, hamleSifirla, hamleUygula, hamleYapisi, komsuSirasi, KUYRUK_BASI, KUYRUK_SONU, onizlemeAl,
  SIRA_TUTULMADI, siraAdimi, YETKISIZ_HAMLE, type Hamleci,
} from './hamle.ts';

afterEach(() => { cleanup(); planKurSifirla(); hamleSifirla(); });

// 2129-1 b: önizlemeli hamle. Sunucu cevabı uydurmadır.
const PLAN = { ops: { 'O1.10': { id: 'O1.10', job: 'O1', m: '100', S: 8, C: 9 } }, fail: [], J: { O1: { C: 9, T: 0 } }, ozet: { wT: 0.5, late: 0, n: 2 }, dataVer: 4 };
const iyilestirCevabi = (dataVer: number, plan: Record<string, unknown> | null = PLAN): DegerlendirmeCevabi => ({
  calismaSurumu: 7, dataVer, baslangic: '2026-10-19', simdi: 9, maliyetGorunur: true,
  sonuc: { tur: 'plan-iyilestir', plan, gecikmeOnce: 3, gecikmeSonra: plan ? 0.5 : null, degisen: plan ? [{ siparisId: 'O1', once: 12, sonra: 9, durum: 'zamanina-girdi' }] : [] },
});
const oneAlCevabi = (dataVer: number): DegerlendirmeCevabi => ({
  calismaSurumu: 7, dataVer, baslangic: '2026-10-19', simdi: 9, maliyetGorunur: true,
  sonuc: { tur: 'one-al', siparisId: 'O1', plan: null, yol: null, neden: 'Sipariş daha erken bitirilemiyor.', bitisOnce: 12, bitisSonra: null, gecikmeOnce: 3, gecikmeSonra: null, degisen: [] },
});
function komutKur(c: PlanlamaCalismasi, surum: number | null = 7) {
  const durum = { c, ne: [] as string[] };
  const komut = {
    kaydet: vi.fn(async () => surum),
    degistir: vi.fn((ne: string, fn: (t: PlanlamaCalismasi) => boolean | void) => {
      const t = structuredClone(durum.c); if (fn(t) === false) return false;
      t.dataVer = durum.c.dataVer + 1; durum.c = t; durum.ne.push(ne); return true;
    }),
  } as unknown as CalismaKomutu;
  return { komut, durum };
}
const calisma = () => ({ ...ornekCalisma(), dataVer: 4 } as PlanlamaCalismasi);

describe('hamle önizlemesi (2129-1 b)', () => {
  it('iyileştirme önizlenir; çalışma Uygula denene dek değişmez, Uygula planı güncel veri sürümüyle "öneri" kaynağıyla yazar', async () => {
    const c = calisma(); const { komut, durum } = komutKur(c);
    const iste = vi.fn(async () => iyilestirCevabi(4));
    expect(await hamleIste({ komut, iste }, { tur: 'plan-iyilestir' })).toBeNull();
    expect(iste).toHaveBeenCalledWith(7, { tur: 'plan-iyilestir' });
    expect(durum.c).toBe(c);
    expect(onizlemeAl()).toMatchObject({ tur: 'plan-iyilestir', ad: 'Plan iyileştirildi', gecikmeOnce: 3, gecikmeSonra: 0.5 });
    expect(hamleUygula(komut, 'Deneme Kisi', 1000)).toBeNull();
    expect(durum.ne).toEqual(['Plan iyileştirildi']);
    expect(durum.c.plan).toMatchObject({ ops: PLAN.ops, dataVer: 5, kim: 'Deneme Kisi', zaman: 1000, kaynak: 'oneri', oneriKaynak: 'plan-iyilestir' });
    expect(onizlemeAl()).toBeNull();
  });

  it('daha iyisi yoksa ya da öne alınamazsa önizleme kurulmaz, neden döner', async () => {
    const { komut } = komutKur(calisma());
    expect(await hamleIste({ komut, iste: async () => iyilestirCevabi(4, null) }, { tur: 'plan-iyilestir' })).toBe(DAHA_IYISI_YOK);
    expect(await hamleIste({ komut, iste: async () => oneAlCevabi(4) }, { tur: 'one-al', siparisId: 'O1' })).toBe('Sipariş daha erken bitirilemiyor.');
    expect(onizlemeAl()).toBeNull();
  });

  it('kaydedilemezse sunucuya gitmez; önizlemeden sonra veri değiştiyse Uygula yazmaz', async () => {
    const k1 = komutKur(calisma(), null); const iste = vi.fn(async () => iyilestirCevabi(4));
    expect(await hamleIste({ komut: k1.komut, iste }, { tur: 'plan-iyilestir' })).toBe(KAYDEDILEMEDI);
    expect(iste).not.toHaveBeenCalled();
    const c = calisma(); const k2 = komutKur(c);
    await hamleIste({ komut: k2.komut, iste: async () => iyilestirCevabi(3) }, { tur: 'plan-iyilestir' });
    expect(hamleUygula(k2.komut, 'x')).toBe(HAMLE_ESKIDI);
    expect(k2.durum.c).toBe(c);
  });

  it('düğme yapısı: hamleci yoksa yetki, plan bayatsa neden, yoksa iş', () => {
    expect(hamleYapisi(null, () => undefined)).toEqual({ yap: null, not: YETKISIZ_HAMLE });
    const h = { kapali: BAYAT, suruyor: false } as Hamleci;
    expect(hamleYapisi(h, () => undefined)).toEqual({ yap: null, not: BAYAT });
    const f = vi.fn(); const y = hamleYapisi({ kapali: null, suruyor: false } as Hamleci, f);
    y.yap?.(); expect(f).toHaveBeenCalled();
  });

  it('şerit: gecikme önce ve sonra, değişen sipariş, Uygula ve Vazgeç', () => {
    const uygula = vi.fn(); const vazgec = vi.fn(); const c = calisma();
    const h = { kapali: null, suruyor: false, iyilestir: vi.fn(), oneAl: vi.fn(), sirala: vi.fn(), uygula, vazgec,
      onizleme: { tur: 'plan-iyilestir', ad: 'Plan iyileştirildi', plan: PLAN, dataVer: 4, gecikmeOnce: 3, gecikmeSonra: 0.5,
        degisen: [{ siparisId: 'O1', once: 12, sonra: 9, durum: 'zamanina-girdi' }], siparisId: null, yol: null, bitisOnce: null, bitisSonra: null, tezgah: null } } as Hamleci;
    render(<HamleOnizlemesi h={h} D={c.D} ad={(j) => `Sip ${j}`} />);
    const bolge = screen.getByRole('region', { name: 'Hamle önizlemesi' });
    expect(bolge.textContent).toContain('Plan iyileştirildi');
    expect(bolge.textContent).toContain('Sip O1');
    expect(bolge.textContent).toContain('zamanına girdi');
    // 2999 a: motorun ölçüsü öncelik ağırlıklıdır; ağırlıksız toplamla karışmasın diye adıyla yazılır.
    expect(bolge.textContent).toContain('Ağırlıklı gecikme');
    fireEvent.click(screen.getByRole('button', { name: 'Uygula' }));
    fireEvent.click(screen.getByRole('button', { name: 'Vazgeç' }));
    expect(uygula).toHaveBeenCalledOnce(); expect(vazgec).toHaveBeenCalledOnce();
  });
});

// 2149: tezgâh sırası hamlesi. Sunucu cevabı uydurmadır.
const siraCevabi = (dataVer: number, plan: Record<string, unknown> | null = PLAN, neden: string | null = null): DegerlendirmeCevabi => ({
  calismaSurumu: 7, dataVer, baslangic: '2026-10-19', simdi: 9, maliyetGorunur: true,
  sonuc: { tur: 'sira-degistir', tezgah: '100', sira: ['O2.10', 'O1.10'], plan, neden, gecikmeOnce: 3, gecikmeSonra: plan ? 4 : null,
    degisen: plan ? [{ siparisId: 'O1', once: 9, sonra: 11, durum: 'gecikmeye-dustu' }] : [] },
});
const op = (id: string, m: string, S: number, x: Partial<{ act: boolean; fas: boolean }> = {}) => ({ id, job: id.split('.')[0]!, m, S, C: S + 1, act: false, fas: false, ...x });
const PLAN_OKU = { ops: { 'O1.10': op('O1.10', '100', 8), 'O2.10': op('O2.10', '100', 10), 'O3.10': op('O3.10', '100', 12), 'O4.10': op('O4.10', '@F', 9, { fas: true }), 'O5.10': op('O5.10', '100', 6, { act: true }) } } as unknown as OkunanPlan;

describe('tezgâh sırası hamlesi (2149)', () => {
  it('sıra önizlenir, Uygula planı "sira-degistir" kaynağıyla yazar; plan kötüleşse de önizlenir', async () => {
    const c = calisma(); const { komut, durum } = komutKur(c);
    const iste = vi.fn(async () => siraCevabi(4));
    expect(await hamleIste({ komut, iste }, { tur: 'sira-degistir', tezgah: '100', sira: ['O2.10', 'O1.10'] })).toBeNull();
    expect(iste).toHaveBeenCalledWith(7, { tur: 'sira-degistir', tezgah: '100', sira: ['O2.10', 'O1.10'] });
    expect(onizlemeAl()).toMatchObject({ tur: 'sira-degistir', ad: '100 sırası değişti', tezgah: '100', gecikmeOnce: 3, gecikmeSonra: 4 });
    expect(hamleUygula(komut, 'Deneme Kisi', 1000)).toBeNull();
    expect(durum.c.plan).toMatchObject({ dataVer: 5, kaynak: 'oneri', oneriKaynak: 'sira-degistir' });
  });

  it('motor sırayı tutamazsa ya da reddederse önizleme kurulmaz, sunucunun nedeni döner', async () => {
    const { komut } = komutKur(calisma());
    expect(await hamleIste({ komut, iste: async () => siraCevabi(4, null, 'O2.10 sabit; sıradaki yeri değişmez.') }, { tur: 'sira-degistir', tezgah: '100', sira: ['O2.10', 'O1.10'] }))
      .toBe('O2.10 sabit; sıradaki yeri değişmez.');
    expect(await hamleIste({ komut, iste: async () => siraCevabi(4, null) }, { tur: 'sira-degistir', tezgah: '100', sira: ['O2.10', 'O1.10'] })).toBe(SIRA_TUTULMADI);
    expect(onizlemeAl()).toBeNull();
  });

  it('komşu sırası: bir öne ve bir arkaya iki adım, sınırda null', () => {
    const q = ['a', 'b', 'c'];
    expect(komsuSirasi(q, 'b', -1)).toEqual(['b', 'a']);
    expect(komsuSirasi(q, 'b', 1)).toEqual(['c', 'b']);
    expect(komsuSirasi(q, 'a', -1)).toBeNull();
    expect(komsuSirasi(q, 'c', 1)).toBeNull();
    expect(komsuSirasi(q, 'x', 1)).toBeNull();
  });

  it('sıra adımı: başlamış iş kuyrukta sayılmaz; başta, sonda, fasonda ve yetkisizde pasif, nedeniyle', () => {
    const sirala = vi.fn(); const h = { kapali: null, suruyor: false, sirala } as unknown as Hamleci;
    expect(siraAdimi(h, PLAN_OKU, 'O1.10', -1)).toEqual({ yap: null, not: KUYRUK_BASI });
    expect(siraAdimi(h, PLAN_OKU, 'O3.10', 1)).toEqual({ yap: null, not: KUYRUK_SONU });
    expect(siraAdimi(h, PLAN_OKU, 'O4.10', 1)).toEqual({ yap: null, not: FASON_SIRASI });
    expect(siraAdimi(h, PLAN_OKU, 'O5.10', 1).yap).toBeNull();
    expect(siraAdimi(null, PLAN_OKU, 'O2.10', -1)).toEqual({ yap: null, not: YETKISIZ_HAMLE });
    expect(siraAdimi({ ...h, kapali: BAYAT }, PLAN_OKU, 'O2.10', -1)).toEqual({ yap: null, not: BAYAT });
    siraAdimi(h, PLAN_OKU, 'O2.10', -1).yap?.();
    siraAdimi(h, PLAN_OKU, 'O2.10', 1).yap?.();
    expect(sirala.mock.calls).toEqual([['100', ['O2.10', 'O1.10']], ['100', ['O3.10', 'O2.10']]]);
  });
});
