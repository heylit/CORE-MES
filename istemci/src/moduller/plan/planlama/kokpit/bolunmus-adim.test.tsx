import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { derle, girdiKur, planOku, plandanBitenler } from '../motor/kurallar.ts';
import { ornekCalisma } from '../motor/ornek.ts';
import { planKurSifirla } from '../motor/coz.ts';
import type { PlanlamaCalismasi } from '../tipler.ts';
import {
  ElleBol, bolunemezNedeni, esitParcalar, ilkParcalar, kalaniBirlestir, kalaniYenidenBol, kilitliPay, parcaDenetimi, secilenleriBirlestir, type Parca,
} from './ElleBol.tsx';
import {
  onizlemeBitisi, adimBaglari, adimKimligi, adimPaylari, adimSonu, modelKur, payIlerlemeYazisi, payNedeni, payYazisi, payYonleri, tasinabilir, type KokpitModeli,
} from './kurallar.ts';
import { sahteTaslak } from './taslak-test-yardim.ts';

// Kart 3681: bölünmüş adımın payları Kokpit'te görünür ve yönetilir. Çalışma uydurmadır (ORN-); sunucu çağrısı yoktur.
afterEach(() => { cleanup(); vi.restoreAllMocks(); planKurSifirla(); });

type Ops = Record<string, Record<string, unknown>>;
// ORN-2'nin 20 numaralı adımı 50 adet; planda iki paya bölünmüş gibi yazılır (pay 1 = adımın kimliği, pay 2 = "~2").
function bolunmusKur(payEk: { p1?: Record<string, unknown>; p2?: Record<string, unknown> } = {}, bolme?: Record<string, unknown>) {
  const c = structuredClone(ornekCalisma());
  const plan = c.plan as unknown as { ops: Ops; bolme?: Record<string, unknown> };
  const a = plan.ops['2.20']!;
  const digerTezgah = c.D.tezgahlar.map((t) => t.id).find((t) => t !== a['m']) ?? 'x';
  a['pay'] = { no: 1, n: 2, asil: '2.20', adet: 30, elle: 1, ...payEk.p1 };
  plan.ops['2.20~2'] = { ...a, m: digerTezgah, S: Number(a['S']) + 2, C: Number(a['C']) + 5, pay: { no: 2, n: 2, asil: '2.20', adet: 20, elle: 1, ...payEk.p2 } };
  if (bolme) plan.bolme = bolme;
  const p = planOku(c), cx = derle(girdiKur(c, plandanBitenler(c, p)));
  return { c, p, cx, m: modelKur(c, p, cx, (id) => `ORN-${id}`), digerTezgah };
}

describe('Kokpit modeli: bölünmüş adımın payları (3681 A)', () => {
  it('pay 2 kendi kimliğiyle işe girer ve adımı taşır; bölünmemiş adımın işi ve payı değişmez; adımın bitişi son payın bitişidir', () => {
    const { m, digerTezgah } = bolunmusKur();
    expect(adimPaylari(m, '2.20').map((x) => [x.id, x.m === digerTezgah, x.pay?.no])).toEqual([['2.20', false, 1], ['2.20~2', true, 2]]);
    const p2 = m.isler['2.20~2']!;
    expect(adimKimligi(p2)).toBe('2.20');
    expect(p2).toMatchObject({ job: '2', ad: m.isler['2.20']!.ad, adim: '2.20' });
    expect(adimSonu(m, '2.20')).toBe(p2.C);
    expect(m.isler['2.40']?.pay).toBeUndefined();
    expect(adimPaylari(m, '2.40')).toHaveLength(1);
    expect(adimKimligi(m.isler['2.40']!)).toBe('2.40');
    // Ardıl payların hepsini bekler: bağ yönü pay 2'nin bitişine bakar.
    const e = m.emirler.find((x) => x.id === '2')!;
    expect(e.adimlar.map((a) => a.id)).toEqual(['2.20', '2.30', '2.40']);
    expect(adimBaglari([e], m.isler).every((b) => typeof b.ters === 'boolean')).toBe(true);
  });

  it('pay yazısı "1/2 · 15 adet", dar yerde "1/2"; ilerleme sayılan/adet; neden elle ya da rotadaki paralel böl; sayım yoksa sıfır uydurulmaz', () => {
    const { m } = bolunmusKur({ p1: { adet: 15, sayilan: 5 }, p2: { adet: 15 } });
    const x1 = m.isler['2.20']!, x2 = m.isler['2.20~2']!;
    expect(payYazisi(x1)).toBe('1/2 · 15 adet');
    expect(payYazisi(x2, true)).toBe('2/2');
    expect(payIlerlemeYazisi(x1)).toBe('5/15');
    expect(payIlerlemeYazisi(x2)).toBeNull();
    expect(payNedeni(x1)).toBe('elle bölündü');
    const oto = bolunmusKur({ p1: { elle: undefined } });
    expect(payNedeni(oto.m.isler['2.20']!)).toBe('rotada paralel böl');
    expect(payYazisi(m.isler['2.40']!)).toBeNull();
  });

  it('3791: pay da taşınır (elle bölünen ve rotada paralel bölünen); yalnız biten pay taşınmaz', () => {
    const { m } = bolunmusKur();
    expect(tasinabilir(m.isler['2.20~2']!)).toBeNull();
    expect(tasinabilir(m.isler['2.20']!)).toBeNull();
    const oto = bolunmusKur({ p1: { elle: undefined }, p2: { elle: undefined } });
    expect(tasinabilir(oto.m.isler['2.20']!)).toBeNull();
    expect(tasinabilir(oto.m.isler['2.20~2']!)).toBeNull();
    expect(tasinabilir({ ...m.isler['2.20~2']!, bitti: true })).toBe('Biten iş taşınmaz');
  });

  it('3791: taşınan payın önizlemedeki bitişi emrin bitişine girer (bölünmüş adımın bitişi son paydır)', () => {
    const { m } = bolunmusKur();
    const e = m.emirler.find((y) => y.adimlar.some((a) => a.id === '2.20'))!;
    const taban = onizlemeBitisi(m, e, [])!;
    const p2 = m.isler['2.20~2']!;
    expect(onizlemeBitisi(m, e, [{ isId: '2.20~2', C: p2.C + 100 }])).toBeGreaterThan(taban + 50);
  });

  it('seçili adımın payları başka satırdaysa "N pay aşağıda / yukarıda" sayılır', () => {
    const { m, digerTezgah } = bolunmusKur();
    const a = m.isler['2.20']!.m;
    expect(payYonleri(m, '2.20', [a, digerTezgah], a)).toEqual({ asagi: 1, yukari: 0, satirlar: [digerTezgah] });
    expect(payYonleri(m, '2.20', [a, digerTezgah], digerTezgah)).toEqual({ asagi: 0, yukari: 1, satirlar: [a] });
    expect(payYonleri(m, null, [a, digerTezgah], a)).toEqual({ asagi: 0, yukari: 0, satirlar: [] });
  });

  it('motorun uygulayamadığı bölmenin nedeni modele geçer; yoksa model alanı da yoktur (D)', () => {
    const { m } = bolunmusKur({}, { '2.20': { kod: 'tezgah', metin: 'Parça 2\'nin tezgâhı rotada yok' } });
    expect(m.bolme).toEqual({ '2.20': { kod: 'tezgah', metin: 'Parça 2\'nin tezgâhı rotada yok' } });
    expect(bolunmusKur().m.bolme).toBeUndefined();
  });

  it('eski kayıtta pay alanı yoksa model bölünmemiş gibi kurulur', () => {
    const c = ornekCalisma(), p = planOku(c), cx = derle(girdiKur(c, plandanBitenler(c, p)));
    const m = modelKur(c, p, cx, (id) => id);
    expect(Object.values(m.isler).some((x) => x.pay !== undefined || x.adim !== undefined)).toBe(false);
  });
});

const P = (adet: number, tezgah: string, sayilan?: number, ilk?: number): Parca => ({ adet: String(adet), tezgah, ...(sayilan !== undefined ? { sayilan, ilk: ilk ?? adet } : {}) });
const toplam = (l: readonly Parca[]): number => l.reduce((t, p) => t + Number(p.adet), 0);

describe('Başlamış adımı bölme kuralları (3681 C)', () => {
  it('başlamış 30 adet, 8 sayılmış: Eşit 2 kalan 22\'yi paylaştırır, 1. pay 8+11 = 19, 2. pay 11; çalışan tezgâh 1. pay', () => {
    const l = ilkParcalar(30, ['A', 'B'], null, { calisan: 'B', sayimlar: { B: 8 } });
    expect(l).toEqual([{ adet: '19', tezgah: 'B', sayilan: 8, ilk: 19 }, { adet: '11', tezgah: 'A', sayilan: 0 }]);
    expect(parcaDenetimi(l, 30).hata).toBeNull();
    const e3 = esitParcalar(l, 3, 30, ['A', 'B', 'C']);
    expect(e3.map((p) => p.adet)).toEqual(['16', '7', '7']);
    expect(toplam(e3)).toBe(30);
    expect(e3[0]).toMatchObject({ tezgah: 'B', sayilan: 8 });
    expect(e3.map((p) => p.tezgah)).toEqual(['B', 'A', 'C']);
  });

  it('1. pay (çalışan) ve sayımı olan pay kilitlidir; sayımı olmayan ikinci pay serbesttir', () => {
    const l = [P(19, 'B', 8), P(11, 'A', 0)];
    expect(kilitliPay(l, 0, true)).toBe(true);
    expect(kilitliPay(l, 1, true)).toBe(false);
    expect(kilitliPay([P(10, 'B', 4), P(10, 'A', 3)], 1, true)).toBe(true);
    expect(kilitliPay(l, 0, false)).toBe(false);
  });

  it('payın adedi sayılandan az olamaz; kayıtta zaten sayılandan az kalmış (fazla sayım) değişmemiş pay hata sayılmaz', () => {
    expect(parcaDenetimi([P(5, 'B', 8, 19), P(25, 'A', 0)], 30).hata).toBe('Parça 1 adedi sayılandan az (sayılan 8).');
    expect(parcaDenetimi([P(15, 'B', 18, 15), P(15, 'A', 0)], 30).hata).toBeNull();
  });

  it('15/15 biten pay ile 5/15 süren pay: Kalanı yeniden böl, kalan 10\'u biten payın boşalan tezgâhı dahil 5+5 paylaştırır', () => {
    const l = [P(15, 'T2', 5), P(15, 'T1', 15)];
    const y = kalaniYenidenBol(l, 30, ['T1', 'T2']);
    expect(y.map((p) => [p.tezgah, p.adet])).toEqual([['T2', '10'], ['T1', '20']]);
    expect(toplam(y)).toBe(30);
    expect(parcaDenetimi(y, 30).hata).toBeNull();
  });

  it('Kalanı birleştir: kalan tek paya verilir, sayımı olan öteki pay sayılanında kapanır; sayımı olmayan ikinci pay kalkar', () => {
    const l = [P(15, 'T2', 5), P(15, 'T1', 15)];
    expect(kalaniBirlestir(l, 0, 30).map((p) => [p.tezgah, p.adet])).toEqual([['T2', '15'], ['T1', '15']]);
    expect(kalaniBirlestir([P(19, 'B', 8), P(11, 'A', 0)], 0, 30).map((p) => [p.tezgah, p.adet])).toEqual([['B', '30']]);
  });
});

describe('Payları birleştirme (3681 B)', () => {
  const U = [P(10, 'A'), P(10, 'B'), P(10, 'C')];
  it('üç paydan ikisi hedefte birleşir: adetler toplanır, hedef kendi tezgâhında kalır, iki pay kalır', () => {
    const r = secilenleriBirlestir(U, [0, 2], 2, false);
    expect(r.hata).toBeNull();
    expect(r.l.map((p) => [p.tezgah, p.adet])).toEqual([['B', '10'], ['C', '20']]);
  });
  it('iki payı birleştirmek tek pay bırakır (bölme kalkar); tek ya da hedefsiz seçim reddedilir', () => {
    expect(secilenleriBirlestir(U.slice(0, 2), [0, 1], 0, false).l.map((p) => [p.tezgah, p.adet])).toEqual([['A', '20']]);
    expect(secilenleriBirlestir(U, [0], 0, false).hata).toBe('En az iki pay seçin.');
    expect(secilenleriBirlestir(U, [0, 1], 2, false).hata).toBe('En az iki pay seçin.');
  });
  it('başlamış adımda sayımı olan ya da çalışan pay hedef olmadan birleşmez', () => {
    const l = [P(19, 'B', 8), P(11, 'A', 0)];
    expect(secilenleriBirlestir(l, [0, 1], 1, true).hata).toMatch(/Sayımı olan ya da çalışan pay/);
    expect(secilenleriBirlestir(l, [0, 1], 0, true).l.map((p) => [p.tezgah, p.adet, p.sayilan])).toEqual([['B', '30', 8]]);
  });
  it('neden yazısı: fason ve bitmiş adım bölünmez, başlamış adım bölünür', () => {
    expect(bolunemezNedeni({ basladi: true, fason: false }, 30)).toBeNull();
    expect(bolunemezNedeni({ basladi: true, bitti: true, fason: false }, 30)).toBe('Bitmiş adım bölünmez');
    expect(bolunemezNedeni({ basladi: false, fason: true }, 30)).toBe('Fason adım bölünmez');
  });
});

// Bölme penceresi: başlamış adım. Model elle kurulur (tezgâhlar A ve B, çalışan B).
function baslamisModel(sayilan1 = 8, payAdet1 = 19): Pick<KokpitModeli, 'isler' | 'emirler' | 'tezgahlar' | 'bolme'> {
  const taban = { job: 'ORN-1', ad: 'Frezeleme', S: 0, C: 10, fason: false, kilitli: false, sira: 0 };
  return {
    isler: {
      'ORN-1.20': { ...taban, id: 'ORN-1.20', m: 'ORN-F2', basladi: true, pay: { no: 1, n: 2, asil: 'ORN-1.20', adet: payAdet1, elle: true, sayilan: sayilan1 } },
      'ORN-1.20~2': { ...taban, id: 'ORN-1.20~2', adim: 'ORN-1.20', m: 'ORN-F1', basladi: false, pay: { no: 2, n: 2, asil: 'ORN-1.20', adet: 30 - payAdet1, elle: true } },
    },
    emirler: [{ id: 'ORN-1', no: 'ORN-0001', adet: 30, adimlar: [{ id: 'ORN-1.20', ad: 'Frezeleme', adaylar: ['ORN-F1', 'ORN-F2', 'ORN-F3'] }] }],
    tezgahlar: [{ id: 'ORN-F1', kod: 'F1', ad: '', fason: false }, { id: 'ORN-F2', kod: 'F2', ad: '', fason: false }, { id: 'ORN-F3', kod: 'F3', ad: '', fason: false }],
  } as unknown as Pick<KokpitModeli, 'isler' | 'emirler' | 'tezgahlar' | 'bolme'>;
}
function ac(m: ReturnType<typeof baslamisModel>, kayitli: { adet: number; m: string }[] | null = null) {
  const c = ornekCalisma() as unknown as PlanlamaCalismasi;
  if (kayitli !== null) (c as unknown as Record<string, unknown>)['elleBol'] = { 'ORN-1.20': kayitli };
  const { t, yazilan } = sahteTaslak(c.dataVer);
  render(<ElleBol c={c} m={m} isId="ORN-1.20" taslak={t} yazabilir kapat={vi.fn()} />);
  return { yazilan, panel: screen.getByRole('complementary', { name: 'Planda böl' }) };
}
const adetler = (panel: HTMLElement) => within(panel).getAllByLabelText('Adet') as HTMLInputElement[];
const tezgahlar = (panel: HTMLElement) => within(panel).getAllByLabelText('Tezgâh') as HTMLSelectElement[];

describe('Bölme penceresi: başlamış adım (3681 C, B, D)', () => {
  it('başlamış adım bölünebilir: paylar planın paylarından gelir, çalışan pay 1. ve kilitli, sayılan yazılır, silinemez', async () => {
    const { yazilan, panel } = ac(baslamisModel(), [{ adet: 19, m: 'ORN-F2' }, { adet: 11, m: 'ORN-F1' }]);
    expect(adetler(panel).map((x) => x.value)).toEqual(['19', '11']);
    expect(tezgahlar(panel).map((x) => x.value)).toEqual(['ORN-F2', 'ORN-F1']);
    expect(tezgahlar(panel).map((x) => x.disabled)).toEqual([true, false]);
    expect(panel.querySelector('[data-sayilan-ozet]')?.textContent).toBe('sayılan 8, kalan 22');
    expect(panel.querySelectorAll('[data-sayilan]')[0]?.textContent).toBe('Çalışıyor · sayılan 8 · tezgâh sabit, silinemez, adet en az 8');
    expect((within(panel).getByRole('button', { name: "Parça 1'i sil" }) as HTMLButtonElement).title).toBe('Çalışan pay silinemez');
    expect(within(panel).queryByText('Başlamış adım bölünmez.')).toBeNull();
    fireEvent.change(adetler(panel)[0]!, { target: { value: '5' } });
    expect(within(panel).getByRole('alert').textContent).toBe('Parça 1 adedi sayılandan az (sayılan 8).');
    const uyari = within(panel).getByRole('alert');
    expect(adetler(panel).every((x) => x.getAttribute('aria-describedby') === uyari.id && x.getAttribute('aria-invalid') === 'true')).toBe(true);
    expect(uyari.id).not.toBe('');
    fireEvent.change(adetler(panel)[0]!, { target: { value: '16' } });
    fireEvent.change(adetler(panel)[1]!, { target: { value: '14' } });
    fireEvent.click(within(panel).getByRole('button', { name: 'Etkisini gör' }));
    await screen.findByRole('region', { name: 'Bölmenin etkisi' });
    expect(yazilan).toEqual([{ tur: 'elle-bol', isId: 'ORN-1.20', paylar: [{ adet: 16, tezgah: 'ORN-F2' }, { adet: 14, tezgah: 'ORN-F1' }] }]);
  });

  it('bölünmemiş başlamış adım: Eşit 2 kalan adedi paylaştırır (30 adet, 8 sayılmış: 19 + 11), 1. pay çalışan tezgâh', () => {
    const m = baslamisModel();
    m.isler = { 'ORN-1.20': { ...m.isler['ORN-1.20']!, pay: undefined, sayilan: 8 } } as typeof m.isler;
    const { panel } = ac(m);
    expect(adetler(panel).map((x) => x.value)).toEqual(['19', '11']);
    expect(tezgahlar(panel)[0]!.value).toBe('ORN-F2');
    fireEvent.click(within(panel).getByRole('button', { name: 'Eşit 3' }));
    expect(adetler(panel).map((x) => x.value)).toEqual(['16', '7', '7']);
    expect(panel.querySelector('[data-toplam]')?.textContent).toMatch(/^Toplam 30 \/ 30 adet · kalan eşit dağıtıldı\./);
  });

  it('Seçilenleri birleştir: iki payı seçince hedef pay çıkar; hedefte birleşir; tek pay kalırsa gönderme bölmeyi kaldırır', async () => {
    const { yazilan, panel } = ac(baslamisModel(), [{ adet: 19, m: 'ORN-F2' }, { adet: 11, m: 'ORN-F1' }]);
    fireEvent.click(within(panel).getByRole('checkbox', { name: 'Parça 1 · F2 birleştirmek için seç' }));
    fireEvent.click(within(panel).getByRole('checkbox', { name: 'Parça 2 · F1 birleştirmek için seç' }));
    fireEvent.change(within(panel).getByLabelText(/^Hedef pay/), { target: { value: '0' } });
    fireEvent.click(within(panel).getByRole('button', { name: 'Seçilenleri birleştir' }));
    expect(adetler(panel).map((x) => x.value)).toEqual(['30']);
    expect(within(panel).getByText(/Tek pay kaldı: bölme kalkar/)).toBeTruthy();
    fireEvent.click(within(panel).getByRole('button', { name: 'Etkisini gör' }));
    await screen.findByRole('region', { name: 'Bölmenin etkisi' });
    expect(yazilan).toEqual([{ tur: 'elle-bol-sil', isId: 'ORN-1.20' }]);
  });

  it('seçim yokken Seçilenleri birleştir devre dışıdır ve "En az 2 pay seçin." yazar; Kalanı yeniden böl ve Kalanı birleştir kendi cümleleriyle açıklanır', () => {
    const { panel } = ac(baslamisModel(), [{ adet: 19, m: 'ORN-F2' }, { adet: 11, m: 'ORN-F1' }]);
    expect((within(panel).getByRole('button', { name: 'Seçilenleri birleştir' }) as HTMLButtonElement).disabled).toBe(true);
    expect(panel.querySelector('[data-birlestir-not]')?.textContent).toBe('En az 2 pay seçin.');
    expect(panel.querySelector('[data-yeniden-bol-not]')?.textContent).toMatch(/biten payın boşalan tezgâhı dahil bütün paylara eşit dağıtılır/);
    expect(panel.querySelector('[data-kalan-birlestir-not]')?.textContent).toMatch(/kalan 22 adet tek paya \(F2\) verilir/);
  });

  it('Bölmeyi kaldır: başka payda sayım varken kapalı ve nedeni yazılı; yalnız çalışan payda sayım varsa açık ve sayımın korunduğu yazılı', () => {
    const m = baslamisModel(5, 15);
    m.isler['ORN-1.20']!.pay = { no: 1, n: 2, asil: 'ORN-1.20', adet: 15, elle: true, sayilan: 5 };
    m.isler['ORN-1.20~2']!.pay = { no: 2, n: 2, asil: 'ORN-1.20', adet: 15, elle: true, sayilan: 15 };
    const { panel } = ac(m, [{ adet: 15, m: 'ORN-F2' }, { adet: 15, m: 'ORN-F1' }]);
    expect((within(panel).getByRole('button', { name: 'Bölmeyi kaldır' }) as HTMLButtonElement).disabled).toBe(true);
    expect(panel.querySelector('[data-kaldir-not]')?.textContent).toMatch(/Sayımı olan pay var/);
    cleanup();
    const { panel: tek } = ac(baslamisModel(), [{ adet: 19, m: 'ORN-F2' }, { adet: 11, m: 'ORN-F1' }]);
    expect((within(tek).getByRole('button', { name: 'Bölmeyi kaldır' }) as HTMLButtonElement).disabled).toBe(false);
    expect(tek.querySelector('[data-kaldir-not]')?.textContent).toMatch(/sayımı korunur/);
  });

  it('Kalanı birleştir ve Kalanı yeniden böl yalnız başlamış adımda çıkar; yeniden böl biten payın tezgâhını da kullanır', () => {
    const m = baslamisModel(5, 15);
    m.isler['ORN-1.20']!.pay = { no: 1, n: 2, asil: 'ORN-1.20', adet: 15, elle: true, sayilan: 5 };
    m.isler['ORN-1.20~2']!.pay = { no: 2, n: 2, asil: 'ORN-1.20', adet: 15, elle: true, sayilan: 15 };
    const { panel } = ac(m, [{ adet: 15, m: 'ORN-F2' }, { adet: 15, m: 'ORN-F1' }]);
    fireEvent.click(within(panel).getByRole('button', { name: 'Kalanı yeniden böl' }));
    expect(adetler(panel).map((x) => x.value)).toEqual(['10', '20']);
    expect(tezgahlar(panel).map((x) => x.value)).toEqual(['ORN-F2', 'ORN-F1']);
    expect(within(panel).getByRole('button', { name: 'Kalanı birleştir' })).toBeTruthy();
    cleanup();
    const { panel: yeni } = ac({ ...baslamisModel(), isler: { 'ORN-1.20': { ...baslamisModel().isler['ORN-1.20']!, basladi: false, pay: undefined } } } as unknown as ReturnType<typeof baslamisModel>);
    expect(within(yeni).queryByRole('button', { name: 'Kalanı yeniden böl' })).toBeNull();
    expect(within(yeni).queryByRole('button', { name: 'Kalanı birleştir' })).toBeNull();
  });

  it('motorun bölmeyi uygulayamama nedeni pencerede yazılır; form yine de düzenlenebilir', () => {
    const m = { ...baslamisModel(), bolme: { 'ORN-1.20': { kod: 'tezgah', metin: "Parça 2'nin tezgâhı rotada yok" } } };
    const { panel } = ac(m, [{ adet: 19, m: 'ORN-F2' }, { adet: 11, m: 'ORN-F1' }]);
    expect(panel.querySelector('[data-bolme-neden]')?.textContent).toBe("Kayıtlı bölme planda uygulanamadı: Parça 2'nin tezgâhı rotada yok.");
    expect(adetler(panel)).toHaveLength(2);
  });
});
