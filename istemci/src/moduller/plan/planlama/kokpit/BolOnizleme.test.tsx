import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { BildirimSaglayici } from '../../../../ortak/arayuz/index.ts';
import { api } from '../../../../ortak/veri/api.ts';
import { PLANLAMA_ISLEMI } from '../../planlama-menusu.ts';
import { ACILIS_OLCEGI, BOS_SECIM } from '../gorunumler.ts';
import type { CalismaKomutu } from '../kayit.ts';
import { planKurSifirla } from '../motor/coz.ts';
import { ornekCalisma } from '../motor/ornek.ts';
import { saatiSabitle } from '../test-saati.ts';
import type { PlanlamaDeposu } from '../veri.ts';
import { yetkiKur } from '../yetki.ts';
import { Kokpit } from './index.tsx';

// Kart 3792: Planda böl > Etkisini gör bölünmüş planı tahtada taslak olarak gösterir. Veri uydurmadır (ORN-); sunucu sahtedir:
// komut taslak satırı olur, değerlendirme bölünmüş planı döner.
saatiSabitle(ornekCalisma);
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); planKurSifirla(); });

const DEPO = { durum: null, planSurumu: null, senaryolar: null, calismaSurumu: 4, receteRotaKaydi: null } as unknown as PlanlamaDeposu;
const komutKur = (): CalismaKomutu => ({ degistir: () => false, geriAl: vi.fn(() => true), geriAlinabilir: () => false, geriAdimlari: () => [], geriDon: () => true, yinele: vi.fn(() => true), yinelenebilir: () => false, kaydet: () => Promise.resolve(4) });
type Satir = { komut: Record<string, unknown>; ne: string; t: number; hata: null };

// 2.20 iki paya bölünür (ikinci pay başka tezgâhta, aynı başlangıçta); sonraki 2.30 bir saat erkene çekilir.
function bolunmusPlan(): Record<string, unknown> {
  const c = structuredClone(ornekCalisma());
  const plan = c.plan as unknown as Record<string, unknown> & { ops: Record<string, Record<string, unknown>> };
  const a = plan.ops['2.20']!, b = plan.ops['2.30']!;
  const diger = c.D.tezgahlar.map((t) => t.id).find((t) => t !== a['m'])!;
  const S = Number(a['S']), C = Number(a['C']);
  plan.ops['2.20~2'] = { ...a, m: diger, pay: { no: 2, n: 2, asil: '2.20', adet: 15, elle: 1 } };
  plan.ops['2.20~2']!['C'] = S + (C - S) / 2;
  a['C'] = S + (C - S) / 2;
  a['pay'] = { no: 1, n: 2, asil: '2.20', adet: 15, elle: 1 };
  b['S'] = Number(b['S']) - 1; b['C'] = Number(b['C']) - 1;
  return plan;
}

function sunucuKur() {
  const gorunum = () => { const { down: _, ...c } = { ...ornekCalisma(), bekleyen: [] }; return c; };
  let satirlar: Satir[] = [];
  const cevap = () => ({ taslak: satirlar.length === 0 ? null : { surum: 10 + satirlar.length, tabanSurum: 4, satirlar }, calisma: gorunum(), surum: 4 });
  vi.spyOn(api, 'get').mockImplementation(((yol: string) => {
    if (yol === '/plan/taslagim') return Promise.resolve(cevap());
    if (yol.startsWith('/plan/planlama-degerlendirmesi/')) return Promise.resolve({ durum: 'bitti', cevap: { calismaSurumu: 4, dataVer: ornekCalisma().dataVer, baslangic: null, simdi: 0, maliyetGorunur: false, sonuc: { tur: 'plan-uygula', plan: bolunmusPlan() } } });
    return Promise.resolve(null);
  }) as never);
  const post = vi.spyOn(api, 'post').mockImplementation(((yol: string, govde: unknown) => {
    if (yol === '/plan/taslagim/komut') satirlar = [...satirlar, { komut: (govde as { komut: Record<string, unknown> }).komut, ne: 'Planda böl', t: 1, hata: null }];
    if (yol === '/plan/taslagim/geri-al') satirlar = satirlar.slice(0, -1);
    if (yol === '/plan/taslagim/diz') satirlar = [...satirlar, { komut: { tur: 'diz', isler: ['2'] }, ne: 'Plan yeniden dizildi', t: 2, hata: null }];
    if (yol === '/plan/taslagim/degerlendirme') return Promise.resolve({ is: 'ORN-is' });
    return Promise.resolve(cevap());
  }) as never);
  return post;
}

function ac() {
  // Önizleme açılınca ilk pay görünüme getirilir (jsdom'da CSS.escape yok).
  vi.stubGlobal('CSS', { escape: (x: string) => x });
  const post = sunucuKur();
  render(
    <MemoryRouter initialEntries={['/?duzen=klasik']}><BildirimSaglayici>
      <Kokpit
        depo={DEPO} calisma={ornekCalisma()} komut={komutKur()} git={vi.fn()} yenile={vi.fn()} yetki={yetkiKur([PLANLAMA_ISLEMI, 'plan.yaz'])}
        olcek={ACILIS_OLCEGI} olcekSec={vi.fn()} kaydir={vi.fn()} secim={BOS_SECIM} sec={vi.fn()}
      />
    </BildirimSaglayici></MemoryRouter>,
  );
  return post;
}
const yollar = (post: ReturnType<typeof ac>, son: string) => post.mock.calls.filter((c) => String(c[0]).endsWith(son));

// 2.20'yi menüden böl paneliyle açar, ilk parçanın adedini değiştirip (öneriyi bozar: değer korunacak mı görülsün) Etkisini gör der.
async function etkisiniGor(): Promise<string[]> {
  fireEvent.contextMenu(document.querySelector<HTMLElement>('[data-is="2.20"]')!);
  fireEvent.click(within(screen.getByRole('menu')).getByRole('menuitem', { name: /Planda böl/ }));
  const panel = screen.getByRole('complementary', { name: 'Planda böl' });
  const adetler = within(panel).getAllByLabelText('Adet') as HTMLInputElement[];
  const toplam = Number(adetler[0]!.value) + Number(adetler[1]!.value);
  fireEvent.change(adetler[0]!, { target: { value: String(toplam - 1) } });
  fireEvent.change(adetler[1]!, { target: { value: '1' } });
  fireEvent.click(within(panel).getByRole('button', { name: 'Etkisini gör' }));
  await screen.findByRole('group', { name: 'Bölmeyi onayla' });
  return [String(toplam - 1), '1'];
}
const taslakCubuklari = () => [...document.querySelectorAll<HTMLElement>('.tc-pyq-tahta [data-taslak]')];

describe('Kokpit: bölmenin etkisi tahtada taslak olarak görünür (3792)', () => {
  it('Etkisini gör sonrası paylar taslak çubuğu olur (makas, "taslak" rozeti), eski yer alt şeritte yazılıdır, üst şerit ve onay çubuğu çıkar; plan yazılmaz', async () => {
    const post = ac();
    await waitFor(() => { expect(api.get).toHaveBeenCalledWith('/plan/taslagim'); });
    expect(taslakCubuklari()).toEqual([]);
    await etkisiniGor();
    expect(taslakCubuklari().map((b) => b.dataset['is']).sort()).toEqual(['2.20', '2.20~2']);
    for (const b of taslakCubuklari()) {
      expect(b.querySelector('[data-taslak-rozet]')?.textContent).toBe('taslak');
      expect(b.querySelector('[data-makas]')).not.toBeNull();
    }
    expect(document.querySelector('.tc-pyq-tahta [data-bol-eski="2.20"]')?.textContent).toMatch(/^eski yer · .+ \d\d:\d\d–\d\d:\d\d$/);
    const serit = screen.getByRole('region', { name: 'Değişiklikleriniz' });
    expect(serit.textContent).toContain('Önizleme: bölmenin taslağı · plan değişmedi');
    expect(serit.textContent).toContain('Canlıya al, bölme uygulanınca ya da vazgeçilince açılır');
    expect((within(serit).getByRole('button', { name: 'Onaya gönder' }) as HTMLButtonElement).disabled).toBe(true);
    const onay = screen.getByRole('group', { name: 'Bölmeyi onayla' });
    expect(onay.querySelector('[data-onay-tur]')?.textContent).toMatch(/Böl$/);
    expect(onay.querySelector('[data-bol-cumle="uzun"]')?.textContent).toMatch(/iki|2 paya bölünür/);
    expect(onay.querySelector('[data-bol-cumle="uzun"]')?.textContent).toMatch(/eski yer: .+ · Uygula taslağınıza yazar, plan "Canlıya al" ile değişir$/);
    expect(onay.querySelector('[data-bol-not]')?.textContent).toBe('Uygula taslağa yazar; plan Canlıya al ile değişir.');
    expect(within(onay).getAllByRole('button').map((b) => b.textContent)).toEqual(['Düzenle', 'Vazgeç', 'Uygula']);
    // Panel gizlenir (Düzenle yalnız onay çubuğundadır); komut yazıldı, canlı plan yazılmadı.
    expect(document.querySelector('.tc-pyq-elle-bol')?.hasAttribute('hidden')).toBe(true);
    expect(yollar(post, '/taslagim/komut')).toHaveLength(1);
    expect(yollar(post, '/taslagim/diz')).toHaveLength(0);
  });

  it('önizlemede tahta salt okunurdur: çift tık işi tutmaz, sağ tık menü açmaz', async () => {
    ac();
    await waitFor(() => { expect(api.get).toHaveBeenCalledWith('/plan/taslagim'); });
    await etkisiniGor();
    const is = document.querySelector<HTMLElement>('.tc-pyq-tahta [data-is="2.30"]')!;
    fireEvent.doubleClick(is);
    expect(screen.queryByText(/Bırakmak için tıklayın/)).toBeNull();
    fireEvent.contextMenu(is);
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('Vazgeç bölmeyi taslaktan geri alır, önizleme kalkar ve panel girilen değerlerle yeniden açılır; Esc de aynısını yapar', async () => {
    const post = ac();
    await waitFor(() => { expect(api.get).toHaveBeenCalledWith('/plan/taslagim'); });
    const girilen = await etkisiniGor();
    fireEvent.click(within(screen.getByRole('group', { name: 'Bölmeyi onayla' })).getByRole('button', { name: 'Vazgeç' }));
    await waitFor(() => { expect(screen.queryByRole('group', { name: 'Bölmeyi onayla' })).toBeNull(); });
    expect(yollar(post, '/taslagim/geri-al')).toHaveLength(1);
    expect(taslakCubuklari()).toEqual([]);
    const panel = screen.getByRole('complementary', { name: 'Planda böl' });
    expect((within(panel).getAllByLabelText('Adet') as HTMLInputElement[]).map((x) => x.value)).toEqual(girilen);
    // Esc: ikinci deneme.
    fireEvent.click(within(panel).getByRole('button', { name: 'Etkisini gör' }));
    await screen.findByRole('group', { name: 'Bölmeyi onayla' });
    fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() => { expect(screen.queryByRole('group', { name: 'Bölmeyi onayla' })).toBeNull(); });
    expect(yollar(post, '/taslagim/geri-al')).toHaveLength(2);
    expect((within(screen.getByRole('complementary', { name: 'Planda böl' })).getAllByLabelText('Adet') as HTMLInputElement[]).map((x) => x.value)).toEqual(girilen);
  });

  it('Düzenle önizlemeyi kapatır ve paneli aynı değerlerle açar', async () => {
    const post = ac();
    await waitFor(() => { expect(api.get).toHaveBeenCalledWith('/plan/taslagim'); });
    const girilen = await etkisiniGor();
    fireEvent.click(within(screen.getByRole('group', { name: 'Bölmeyi onayla' })).getByRole('button', { name: 'Düzenle' }));
    await waitFor(() => { expect(screen.queryByRole('group', { name: 'Bölmeyi onayla' })).toBeNull(); });
    expect(yollar(post, '/taslagim/geri-al')).toHaveLength(1);
    expect((within(screen.getByRole('complementary', { name: 'Planda böl' })).getAllByLabelText('Adet') as HTMLInputElement[]).map((x) => x.value)).toEqual(girilen);
  });

  it('Uygula bugünkü gibi dizmeyi taslağa yazar; önizleme ve panel kapanır', async () => {
    const post = ac();
    await waitFor(() => { expect(api.get).toHaveBeenCalledWith('/plan/taslagim'); });
    await etkisiniGor();
    fireEvent.click(within(screen.getByRole('group', { name: 'Bölmeyi onayla' })).getByRole('button', { name: 'Uygula' }));
    await waitFor(() => { expect(yollar(post, '/taslagim/diz').map((c) => c.slice(0, 2))).toEqual([['/plan/taslagim/diz', { taslakSurumu: 11, is: 'ORN-is' }]]); });
    await waitFor(() => { expect(screen.queryByRole('group', { name: 'Bölmeyi onayla' })).toBeNull(); });
    expect(document.querySelector('.tc-pyq-elle-bol')).toBeNull();
  });
});
