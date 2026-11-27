import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { BildirimSaglayici } from '../../../../ortak/arayuz/index.ts';
import { api } from '../../../../ortak/veri/api.ts';
import { PLANLAMA_ISLEMI } from '../../planlama-menusu.ts';
import { BOS_SECIM, ACILIS_OLCEGI, type PlanlamaSecimi } from '../gorunumler.ts';
import type { CalismaKomutu } from '../kayit.ts';
import { ornekCalisma } from '../motor/ornek.ts';
import { saatiSabitle } from '../test-saati.ts';
import type { PlanlamaCalismasi } from '../tipler.ts';
import type { PlanlamaDeposu } from '../veri.ts';
import { yetkiKur } from '../yetki.ts';
import { Kokpit } from './index.tsx';
import { IKI_KILITLI, payBirlesmesi, type KokpitIsi, type KokpitModeli } from './kurallar.ts';

// Kart 3751: bölünmüş adımın payları sağ tık menüsünden, telefondaki alt sayfadan ve Emirler görünümünde sürükleyip kardeşe bırakarak birleşir.
// Veri uydurmadır (ORN-); sunucu çağrısı yoktur, taslak komutu sahte api'de yakalanır.
saatiSabitle(ornekCalisma);
beforeEach(() => { localStorage.clear(); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); localStorage.clear(); });

// --- kural ---
const TEZGAHLAR = [{ id: 'M1', kod: 'ORN-TZ1', ad: '', fason: false }, { id: 'M2', kod: 'ORN-TZ2', ad: '', fason: false }, { id: 'M3', kod: 'ORN-TZ3', ad: '', fason: false }];
function model(adetler: readonly number[], ek: { elle?: boolean; basladi?: boolean; sayilan?: Record<number, number> } = {}): Pick<KokpitModeli, 'isler' | 'tezgahlar'> {
  const n = adetler.length, isler: Record<string, KokpitIsi> = {};
  adetler.forEach((adet, i) => {
    const no = i + 1, id = no === 1 ? 'E1.a1' : `E1.a1~${String(no)}`, sayilan = ek.sayilan?.[no];
    isler[id] = {
      id, job: 'E1', ad: 'Torna', m: TEZGAHLAR[i % 3]!.id, S: i * 4, C: i * 4 + 3, basladi: ek.basladi === true && no === 1, fason: false, kilitli: false, sira: 0,
      ...(no > 1 ? { adim: 'E1.a1' } : {}), pay: { no, n, asil: 'E1.a1', adet, ...(ek.elle === false ? {} : { elle: true as const }), ...(sayilan !== undefined ? { sayilan } : {}) },
    };
  });
  return { isler, tezgahlar: TEZGAHLAR };
}

describe('payBirlesmesi (3751)', () => {
  it('üç paydan ikisi: adetler toplanır, hedef pay kendi tezgâhında kalır, öteki pay aynen; komut elle-bol', () => {
    const r = payBirlesmesi(model([60, 20, 20]), 'E1.a1~3', 'E1.a1');
    expect(r.hata).toBeNull();
    expect(r.komut).toEqual({ tur: 'elle-bol', isId: 'E1.a1', paylar: [{ adet: 80, tezgah: 'M1' }, { adet: 20, tezgah: 'M2' }] });
    expect(r).toMatchObject({ hedef: 'E1.a1', adet: 80, kalan: 2, dondu: false });
    expect(r.cumle).toBe('20 + 60 = 80 adet · ORN-TZ1 tezgâhında kalır · 2 pay kalır');
  });

  it('iki pay tek kalırsa bölme kalkar (elle-bol-sil) ve yeri sistem seçer; aynı paya ya da başka adıma bırakmak birleşmez', () => {
    const m = model([30, 20]);
    const r = payBirlesmesi(m, 'E1.a1~2', 'E1.a1');
    expect(r.komut).toEqual({ tur: 'elle-bol-sil', isId: 'E1.a1' });
    expect(r.cumle).toBe('20 + 30 = 50 adet · tek pay kalır, bölme kalkar; yerini sistem seçer');
    expect(payBirlesmesi(m, 'E1.a1', 'E1.a1').komut).toBeNull();
    expect(payBirlesmesi(m, 'E1.a1', 'YOK').hata).toBe('Yalnız aynı adımın başka payına bırakılır.');
    expect(payBirlesmesi(m, 'YOK', 'E1.a1').hata).toBe('Pay planda yok; plan değişmiş olabilir.');
  });

  it('rotada paralel bölmenin payları birleşince kayıt elle bölmeye döner ve cümle bunu söyler', () => {
    const r = payBirlesmesi(model([10, 10, 10], { elle: false }), 'E1.a1~2', 'E1.a1~3');
    expect(r.komut).toEqual({ tur: 'elle-bol', isId: 'E1.a1', paylar: [{ adet: 10, tezgah: 'M1' }, { adet: 20, tezgah: 'M3' }] });
    expect(r.cumle).toContain('rotadaki paralel bölme elle bölmeye döner');
  });

  it('başlamış adımda çalışan pay sürüklenip kardeşe bırakılırsa hedef çalışan pay olur; sayımlı iki pay birleşmez', () => {
    const r = payBirlesmesi(model([30, 20, 10], { basladi: true }), 'E1.a1', 'E1.a1~2');
    expect(r).toMatchObject({ hedef: 'E1.a1', dondu: true, adet: 50 });
    expect(r.komut).toEqual({ tur: 'elle-bol', isId: 'E1.a1', paylar: [{ adet: 50, tezgah: 'M1' }, { adet: 10, tezgah: 'M3' }] });
    expect(r.cumle).toContain('hedef odur');
    const iki = payBirlesmesi(model([30, 20, 10], { basladi: true, sayilan: { 2: 4 } }), 'E1.a1~2', 'E1.a1');
    expect(iki).toMatchObject({ komut: null, hata: IKI_KILITLI });
    // Başlamamış adımda sayımsız pay kilitli değildir: hedef bırakılan paydır.
    expect(payBirlesmesi(model([30, 20, 10]), 'E1.a1', 'E1.a1~2')).toMatchObject({ hedef: 'E1.a1~2', dondu: false });
  });

  it('bütün paylar tek paya birleşir; hedef varsa çalışan pay; iki kilitli payda reddedilir', () => {
    expect(payBirlesmesi(model([10, 10, 10]), 'E1.a1~3', 'hepsi')).toMatchObject({ komut: { tur: 'elle-bol-sil', isId: 'E1.a1' }, adet: 30, kalan: 1, hedef: 'E1.a1~3' });
    expect(payBirlesmesi(model([10, 10, 10], { basladi: true }), 'E1.a1~3', 'hepsi')).toMatchObject({ hedef: 'E1.a1' });
    expect(payBirlesmesi(model([10, 10, 10], { basladi: true, sayilan: { 3: 1 } }), 'E1.a1~2', 'hepsi').hata).toBe(IKI_KILITLI);
  });
});

// --- ekran ---
const DEPO = { durum: null, planSurumu: null, senaryolar: null, calismaSurumu: 4, receteRotaKaydi: null } as unknown as PlanlamaDeposu;
function komutKur(): CalismaKomutu {
  return { degistir: vi.fn(() => false), geriAl: vi.fn(() => true), geriAlinabilir: () => false, geriAdimlari: () => [], geriDon: () => true, yinele: vi.fn(() => true), yinelenebilir: () => false, kaydet: () => Promise.resolve(4) };
}
// ORN-2'nin 20 numaralı adımı n paya elle bölünmüş gibi yazılır (pay 1 = adımın kimliği).
function bolunmusCalisma(n: number): PlanlamaCalismasi {
  const c = structuredClone(ornekCalisma());
  const plan = c.plan as unknown as { ops: Record<string, Record<string, unknown>> };
  const a = plan.ops['2.20']!;
  const diger = c.D.tezgahlar.map((t) => t.id).find((t) => t !== a['m'])!;
  a['pay'] = { no: 1, n, asil: '2.20', adet: 30, elle: 1 };
  for (let no = 2; no <= n; no++) plan.ops[`2.20~${String(no)}`] = { ...a, m: diger, S: Number(a['S']) + no, C: Number(a['C']) + no, pay: { no, n, asil: '2.20', adet: 10, elle: 1 } };
  return c;
}
function ac(n = 3, secim: PlanlamaSecimi = BOS_SECIM) {
  const post = vi.spyOn(api, 'post').mockImplementation((() => new Promise(() => undefined)) as never);
  render(
    <MemoryRouter initialEntries={['/']}><BildirimSaglayici>
      <Kokpit
        depo={DEPO} calisma={bolunmusCalisma(n)} komut={komutKur()} git={vi.fn()} yenile={vi.fn()} yetki={yetkiKur([PLANLAMA_ISLEMI, 'plan.yaz'])}
        olcek={ACILIS_OLCEGI} olcekSec={vi.fn()} kaydir={vi.fn()} secim={secim} sec={vi.fn()}
      />
    </BildirimSaglayici></MemoryRouter>,
  );
  return post;
}
const komutlar = (post: ReturnType<typeof ac>) => post.mock.calls.filter((c) => String(c[0]).endsWith('/taslagim/komut')).map((c) => (c[1] as { komut: unknown }).komut);
// Emirler ağacında 2 numaralı emir ve 20 numaralı adımın payları açılır.
function emirlerdePaylar(): HTMLElement {
  const bolum = screen.getByRole('region', { name: 'Emirler' });
  fireEvent.click(bolum.querySelector<HTMLElement>('button[data-agac="2"]')!);
  fireEvent.click(bolum.querySelector<HTMLElement>('[data-adim-satiri="2.20"]')!);
  return bolum;
}
// jsdom'da PointerEvent yoktur; fare olayı üstüne pointerType eklenir.
function imlecOlayiKur(): () => void {
  const eski = (window as { PointerEvent?: unknown }).PointerEvent;
  class Imlec extends MouseEvent { pointerType: string; constructor(t: string, i: PointerEventInit = {}) { super(t, i); this.pointerType = i.pointerType ?? 'mouse'; } }
  (window as { PointerEvent?: unknown }).PointerEvent = Imlec;
  return () => { (window as { PointerEvent?: unknown }).PointerEvent = eski; };
}

describe('Kokpit: pay birleştirme (3751)', () => {
  it('sağ tık menüsünde kardeş paylar sonuç adediyle ve "Bütün payları birleştir" vardır; seçince onay çubuğu açılır, Uygula taslağa elle-bol yazar', async () => {
    const post = ac(3);
    const bolum = emirlerdePaylar();
    fireEvent.contextMenu(bolum.querySelector<HTMLElement>('[data-is="2.20~3"]')!);
    const grup = within(screen.getByRole('menu')).getByRole('group', { name: 'Şununla birleştir' });
    const ogeler = within(grup).getAllByRole('menuitem');
    expect(ogeler.map((x) => x.textContent)).toEqual([
      expect.stringMatching(/^Pay 1\/3 · .+ · 30 adetbirleşince 40 adet$/), expect.stringMatching(/^Pay 2\/3 · .+ · 10 adetbirleşince 20 adet$/), 'Bütün payları birleştirtek pay kalır, bölme kalkar',
    ]);
    // "Bütün payları birleştir" birleştirme simgesini taşır (kapat X'i değil).
    expect(ogeler[2]!.querySelector('svg path')?.getAttribute('d')).toBe(ogeler[0]!.querySelector('svg path')?.getAttribute('d'));
    fireEvent.click(ogeler[0]!);
    expect(screen.queryByRole('menu')).toBeNull();
    const onay = screen.getByRole('group', { name: 'Birleştirmeyi onayla' });
    expect(onay.querySelector('[data-onay-tur]')?.textContent).toBe('Birleştir');
    expect(within(onay).getByRole('status').textContent).toMatch(/^10 \+ 30 = 40 adet · .+ tezgâhında kalır · 2 pay kalır · Uygula taslağınıza yazar, plan "Canlıya al" ile değişir$/);
    expect(komutlar(post)).toEqual([]);
    fireEvent.click(within(onay).getByRole('button', { name: 'Uygula' }));
    await waitFor(() => { expect(komutlar(post)).toHaveLength(1); });
    expect(komutlar(post)[0]).toMatchObject({ tur: 'elle-bol', isId: '2.20', paylar: [{ adet: 40 }, { adet: 10 }] });
    expect(screen.queryByRole('group', { name: 'Birleştirmeyi onayla' })).toBeNull();
  });

  it('Esc ve Vazgeç onay çubuğunu kapatır, taslağa bir şey yazılmaz', () => {
    const post = ac(2);
    const bolum = emirlerdePaylar();
    fireEvent.contextMenu(bolum.querySelector<HTMLElement>('[data-is="2.20~2"]')!);
    // İki paylı adımda "Bütün payları birleştir" yoktur (tek kardeşle aynı iş).
    expect(within(screen.getByRole('menu')).queryByRole('menuitem', { name: /Bütün payları/ })).toBeNull();
    fireEvent.click(within(screen.getByRole('menu')).getByRole('menuitem', { name: /Pay 1\/2/ }));
    expect(within(screen.getByRole('group', { name: 'Birleştirmeyi onayla' })).getByRole('status').textContent).toContain('tek pay kalır, bölme kalkar');
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('group', { name: 'Birleştirmeyi onayla' })).toBeNull();
    fireEvent.contextMenu(bolum.querySelector<HTMLElement>('[data-is="2.20~2"]')!);
    fireEvent.click(within(screen.getByRole('menu')).getByRole('menuitem', { name: /Pay 1\/2/ }));
    fireEvent.click(within(screen.getByRole('group', { name: 'Birleştirmeyi onayla' })).getByRole('button', { name: 'Vazgeç' }));
    expect(screen.queryByRole('group', { name: 'Birleştirmeyi onayla' })).toBeNull();
    expect(komutlar(post)).toEqual([]);
  });

  it('Emirler görünümünde pay sürüklenince ipucu birleştirmeyi söyler, kardeşler işaretlenir; sol listedeki kardeş satırına bırakınca onay çubuğu açılır', async () => {
    const geri = imlecOlayiKur();
    try {
      const post = ac(3);
      const bolum = emirlerdePaylar();
      const kaynak = bolum.querySelector<HTMLElement>('[data-is="2.20~3"]')!;
      expect(getComputedStyle(kaynak).cursor === 'grab' || kaynak.hasAttribute('data-pay')).toBe(true);
      fireEvent.pointerDown(kaynak, { button: 0, pointerType: 'mouse', clientX: 0, clientY: 0 });
      fireEvent.pointerMove(kaynak, { pointerType: 'mouse', clientX: 40, clientY: 0 });
      // 3791: tutulan pay hayalet çubuk olarak imleci izler (taşıma kipi açık) ve ipucu hem birleştirmeyi hem taşımayı söyler.
      expect(bolum.querySelector('.tc-pyq-tahta[data-tasima]')).not.toBeNull();
      expect(kaynak.hasAttribute('data-tasinan')).toBe(true);
      expect(screen.getByText(/Kardeş payın üstüne bırakın: birleşir · başka yere bırakın: iş taşınır/)).toBeTruthy();
      expect([...bolum.querySelectorAll<HTMLElement>('.tc-pyq-is[data-birles-aday]')].map((x) => x.dataset['is'])).toEqual(['2.20', '2.20~2']);
      // Hedef sol listedeki pay satırının tamamıdır: satırın başlık hücresinin üstüne gelinir.
      const satir = bolum.querySelector<HTMLElement>('[data-pay-satir="2.20~2"]')!;
      fireEvent.pointerMove(satir.querySelector<HTMLElement>('.tc-pyq-bas')!, { pointerType: 'mouse', clientX: 10, clientY: 40 });
      expect(satir.hasAttribute('data-birles-hedef')).toBe(true);
      expect(screen.getByText(/^Birleştir: 10 \+ 10 = 20 adet · .+ · 2 pay kalır · bırakın · Esc vazgeçer$/)).toBeTruthy();
      fireEvent.pointerUp(document, { pointerType: 'mouse' });
      // Bırakmanın ardından tarayıcının gönderdiği tıklama hedef payı seçmez (yutulur).
      fireEvent.click(satir);
      await new Promise((r) => { setTimeout(r, 0); });
      const onay = screen.getByRole('group', { name: 'Birleştirmeyi onayla' });
      fireEvent.click(within(onay).getByRole('button', { name: 'Uygula' }));
      await waitFor(() => { expect(komutlar(post)).toEqual([{ tur: 'elle-bol', isId: '2.20', paylar: [{ adet: 30, tezgah: expect.any(String) }, { adet: 20, tezgah: expect.any(String) }] }]); });
    } finally { geri(); }
  });

  it('pay kardeş olmayan yere (satır dışı) bırakılırsa birleşmez; Esc tutmayı bırakır', () => {
    const geri = imlecOlayiKur();
    try {
      const post = ac(3);
      const bolum = emirlerdePaylar();
      const kaynak = bolum.querySelector<HTMLElement>('[data-is="2.20~3"]')!;
      fireEvent.pointerDown(kaynak, { button: 0, pointerType: 'mouse', clientX: 0, clientY: 0 });
      fireEvent.pointerMove(kaynak, { pointerType: 'mouse', clientX: 40, clientY: 0 });
      fireEvent.pointerUp(document, { pointerType: 'mouse' });
      expect(screen.queryByRole('group', { name: 'Birleştirmeyi onayla' })).toBeNull();
      expect(bolum.querySelector('.tc-pyq-tahta[data-birlesme]')).toBeNull();
      // Klavye yolu: çift tık payı tutar; Esc vazgeçer.
      fireEvent.doubleClick(kaynak);
      expect(bolum.querySelector('.tc-pyq-tahta[data-birlesme]')).not.toBeNull();
      fireEvent.keyDown(document, { key: 'Escape' });
      expect(bolum.querySelector('.tc-pyq-tahta[data-birlesme]')).toBeNull();
      // Çift tıkla tutulan pay tıklanan kardeşe bırakılır.
      fireEvent.doubleClick(kaynak);
      fireEvent.click(bolum.querySelector<HTMLElement>('[data-is="2.20"]')!);
      expect(within(screen.getByRole('group', { name: 'Birleştirmeyi onayla' })).getByRole('status').textContent).toMatch(/^10 \+ 30 = 40 adet/);
      expect(komutlar(post)).toEqual([]);
    } finally { geri(); }
  });

  it('telefon: pay kartında Birleştir alt sayfası açılır; pay ve kardeş seçilir, onay bölümünde Uygula taslağa yazar ve sayfa kapanır; Esc önce onayı kapatır', async () => {
    const post = ac(3, { ...BOS_SECIM, siparis: '2', adim: '2.20' });
    const kart = document.querySelector<HTMLElement>('.tc-pyq-pano[data-kip="sayfa"]')!;
    fireEvent.click(within(kart).getByRole('button', { name: 'Birleştir' }));
    const sayfa = screen.getByRole('complementary', { name: 'Payları birleştir' });
    expect(within(within(sayfa).getByRole('group', { name: 'Birleşecek pay' })).getAllByRole('button').map((b) => b.getAttribute('aria-pressed'))).toEqual(['true', 'false', 'false']);
    const liste = within(sayfa).getByRole('list', { name: 'Şununla birleştir' });
    expect(within(liste).getAllByRole('button').map((b) => b.querySelector('small')?.textContent)).toEqual(['birleşince 40 adet', 'birleşince 40 adet', '50 adet, tek pay']);
    fireEvent.click(within(liste).getAllByRole('button')[1]!);
    expect(within(sayfa).getByRole('group', { name: 'Birleştirmeyi onayla' }).textContent).toContain('30 + 10 = 40 adet');
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(within(sayfa).queryByRole('group', { name: 'Birleştirmeyi onayla' })).toBeNull();
    fireEvent.click(within(liste).getByRole('button', { name: /Bütün payları birleştir/ }));
    fireEvent.click(within(within(sayfa).getByRole('group', { name: 'Birleştirmeyi onayla' })).getByRole('button', { name: 'Uygula' }));
    await waitFor(() => { expect(komutlar(post)).toEqual([{ tur: 'elle-bol-sil', isId: '2.20' }]); });
  });

  // 3791: pay da taşınır; kardeşin üstüne değil kendi satırına bırakılınca normal taşıma gibi önizleme ve onay çubuğu açılır.
  it('pay kendi satırında başka saate bırakılınca birleşme değil taşıma onayı açılır; Vazgeç yazmaz', () => {
    const geri = imlecOlayiKur();
    try {
      const post = ac(3);
      const bolum = emirlerdePaylar();
      const kaynak = bolum.querySelector<HTMLElement>('[data-is="2.20~3"]')!;
      const alan = kaynak.closest<HTMLElement>('[data-satir]')!.querySelector<HTMLElement>('.tc-pyq-alan')!;
      fireEvent.pointerDown(kaynak, { button: 0, pointerType: 'mouse', clientX: 0, clientY: 0 });
      fireEvent.pointerMove(alan, { pointerType: 'mouse', clientX: 40, clientY: 0 });
      fireEvent.pointerMove(alan, { pointerType: 'mouse', clientX: 400, clientY: 0 });
      expect(screen.queryByText(/Birleştir: /)).toBeNull();
      fireEvent.pointerUp(document, { pointerType: 'mouse' });
      expect(screen.queryByRole('group', { name: 'Birleştirmeyi onayla' })).toBeNull();
      const onay = screen.getByRole('group', { name: 'Taşımayı onayla' });
      expect(onay.querySelector('[data-onay-tur]')?.textContent).toBe('Taşı');
      fireEvent.click(within(onay).getByRole('button', { name: 'Vazgeç' }));
      expect(screen.queryByRole('group', { name: 'Taşımayı onayla' })).toBeNull();
      expect(komutlar(post)).toEqual([]);
    } finally { geri(); }
  });

  it('Tezgâh görünümünde pay tutulur: uyarı yok, hayalet çubuk imleci izler (taşıma kipi açık)', () => {
    const geri = imlecOlayiKur();
    try {
      ac(3);
      fireEvent.click(within(screen.getByRole('group', { name: 'Görünüm' })).getByRole('button', { name: 'Tezgâhlar' }));
      const bolum = document.body;
      const kaynak = bolum.querySelector<HTMLElement>('.tc-pyq-tahta [data-is="2.20~3"]');
      expect(kaynak).not.toBeNull();
      fireEvent.pointerDown(kaynak!, { button: 0, pointerType: 'mouse', clientX: 0, clientY: 0 });
      fireEvent.pointerMove(kaynak!, { pointerType: 'mouse', clientX: 40, clientY: 0 });
      expect(bolum.querySelector('.tc-pyq-tahta[data-tasima]')).not.toBeNull();
      expect(kaynak!.hasAttribute('data-tasinan')).toBe(true);
      expect(document.body.textContent).not.toMatch(/Pay burada sürüklenmez|yerini "Bölmeyi yönet" değiştirir/);
      fireEvent.keyDown(document, { key: 'Escape' });
      expect(bolum.querySelector('.tc-pyq-tahta[data-tasima]')).toBeNull();
    } finally { geri(); }
  });

  // Test1 C1: Tezgâhlar görünümünde pay 2+ (~3) için aday tezgâhlar adımın kimliğinden okunur; payın kendi kimliğiyle aranırsa bulunamaz ve
  // bırakma "bu adım bu tezgâhta yapılamaz" diye geri çevrilirdi.
  it('Tezgâhlar görünümünde ~3 payı başka bir aday tezgâh satırına bırakılınca taşıma onayı açılır (aday tezgâhlar adımdan)', () => {
    const geri = imlecOlayiKur();
    try {
      const post = ac(3);
      fireEvent.click(within(screen.getByRole('group', { name: 'Görünüm' })).getByRole('button', { name: 'Tezgâhlar' }));
      const kaynak = document.body.querySelector<HTMLElement>('.tc-pyq-tahta [data-is="2.20~3"]')!;
      // Hedef: adımın ilk payının tezgâh satırı (adımın aday tezgâhı).
      const alan = document.body.querySelector<HTMLElement>('.tc-pyq-tahta [data-is="2.20"]')!.closest<HTMLElement>('[data-satir]')!.querySelector<HTMLElement>('.tc-pyq-alan')!;
      fireEvent.pointerDown(kaynak, { button: 0, pointerType: 'mouse', clientX: 0, clientY: 0 });
      fireEvent.pointerMove(alan, { pointerType: 'mouse', clientX: 40, clientY: 0 });
      fireEvent.pointerMove(alan, { pointerType: 'mouse', clientX: 400, clientY: 0 });
      fireEvent.pointerUp(document, { pointerType: 'mouse' });
      expect(screen.getByRole('group', { name: 'Taşımayı onayla' }).querySelector('[data-onay-tur]')?.textContent).toBe('Taşı');
      expect(komutlar(post)).toEqual([]);
    } finally { geri(); }
  });
});
