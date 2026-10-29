import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import type { AcikEmirlerCevabi, MalzemeSecenekleriCevabi, OnTalep, OnTalepleriCevabi, Talebim, TaleplerimCevabi } from '#paylasilan/sozlesme/satin-alma.ts';
import { BildirimSaglayici } from '../../../ortak/arayuz/index.ts';
import { BELIRSIZ_MIKTAR } from '../../../ortak/veri/miktar.ts';
import { TalepAc } from './TalepAc.tsx';
import { Taleplerim } from './Taleplerim.tsx';
import { TaleplerimSayfasi } from './TaleplerimSayfasi.tsx';
import { anahtarlar } from './ortak.ts';
import { rotalar } from '../rotalar.tsx';
import { SAYFALAR } from '#paylasilan/sayfalar.ts';

const json = (durum: number, govde: unknown) => new Response(JSON.stringify(govde), { status: durum });
const KARTLAR = { malzemeler: [{ no: 7, kod: 'HM-00007', ad: 'Deneme rulman', birim: 'adet', kategori: 'Rulman', katalogId: null }] } satisfies MalzemeSecenekleriCevabi;
const HIZMETLER = { malzemeler: [{ no: 11, kod: 'HZ-00011', ad: 'Deneme kaplama', birim: 'saat', kategori: null, katalogId: null }] } satisfies MalzemeSecenekleriCevabi;
const EMIRLER = { emirler: [{ id: 31, emirNo: 'UE-000031', parcaNo: 'P-31', parcaAd: 'Deneme parça' }] } satisfies AcikEmirlerCevabi;
const talep = (n: number, ek: Partial<Talebim> = {}): Talebim => ({
  id: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`, no: `ST-2026-${String(n).padStart(3, '0')}`, baslik: `Deneme talep ${n}`, durum: 'taslak',
  ihtiyacTarihi: null, olusturma: '2026-10-09T08:00:00Z', uretimEmriNo: null, kaynak: 'elle',
  kalemler: [{ ad: 'Deneme rulman', miktar: '3', birim: 'adet', kartBekliyor: false, uygulanan: null, fasonAdim: null }], ...ek,
});
const ON_TALEP: OnTalep = {
  kaynak: 'fason', isEmriId: 501, uretimEmriId: 31, emirNo: 'UE-000031', opNo: 30, adim: 'Deneme ısıl işlem', parca: { no: 9, kod: 'MM-00009', ad: 'Deneme flanş' },
  urun: 'Deneme flanş', miktar: 12, birim: 'adet', gerekenTarih: '2026-11-03', terminGun: 4, firmaAdi: 'Deneme Fason A',
};
const ON_TALEPLER = { onTalepler: [ON_TALEP], yoksayilanlar: [] } satisfies OnTalepleriCevabi;
const PLAN_TALEBI: OnTalep = {
  kaynak: 'plan', malzeme: { no: 7, kod: 'HM-00007', ad: 'Deneme rulman' }, miktar: 6.5, birim: 'adet', gerekenTarih: '2026-11-10',
  emirler: ['UE-000031', 'UE-000032'], stokBilinmiyor: true, hesap: { eksik: 10, siparis: 2, talep: 1.5, yoksayilan: 0 },
};
let onListe: OnTalepleriCevabi = ON_TALEPLER;

interface Cagri { yol: string; govde: unknown; kimlik: string | undefined }
// ag.kopuk: hızlı açma isteği cevapsız kalır (sunucuya ulaşılamaz).
function sunucuKur(ag = { kopuk: false }): Cagri[] {
  const cagrilar: Cagri[] = [];
  vi.stubGlobal('fetch', vi.fn(async (adres: string, istek?: RequestInit) => {
    const yol = adres.replace('/api', '');
    cagrilar.push({ yol, govde: istek?.body ? JSON.parse(String(istek.body)) : null, kimlik: (istek?.headers as Record<string, string> | undefined)?.['istek-kimligi'] });
    if (yol.startsWith('/satin-alma-malzeme-secenekleri?')) return json(200, yol.includes('tur=hizmet') ? HIZMETLER : KARTLAR);
    if (yol === '/satin-alma-acik-emirler') return json(200, EMIRLER);
    if (yol === '/satin-alma-on-talepleri') return json(200, onListe);
    if (yol === '/satin-alma-on-talepleri/yoksay') return json(200, { tamam: true });
    if (yol === '/satin-alma-talepleri/hizli-ac') {
      if (ag.kopuk) throw new TypeError('Failed to fetch');
      return json(200, talep(1, { no: 'ST-2026-042' }));
    }
    if (yol.startsWith('/satin-alma-taleplerim?')) {
      const sinir = Number(new URL(yol, 'http://x').searchParams.get('sinir'));
      const hepsi = Array.from({ length: 12 }, (_, i) => talep(i + 1, i === 0
        ? { durum: 'onayda', kaynak: 'fason', kalemler: [{ ad: 'Deneme serbest', miktar: '2', birim: 'adet', kartBekliyor: true, uygulanan: 'MM-00009 · Deneme flanş', fasonAdim: 'UE-000031 · Op 30' }] }
        : {}));
      return json(200, { talepler: hepsi.slice(0, sinir), toplam: hepsi.length } satisfies TaleplerimCevabi);
    }
    return json(404, { kod: 'BULUNAMADI', mesaj: 'Adres bulunamadı.' });
  }));
  return cagrilar;
}
const sar = (cocuk: ReactNode) => render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><BildirimSaglayici>{cocuk}</BildirimSaglayici></QueryClientProvider>,
);

afterEach(() => { cleanup(); vi.unstubAllGlobals(); onListe = ON_TALEPLER; });

describe('Ana sayfadan talep (#375)', () => {
  it('kartlı ve adıyla yazılan kalemle talep gönderir; gövdede kişi alanı yok, kartsız kalem kart bekler', async () => {
    const cagrilar = sunucuKur();
    sar(<TalepAc />);
    fireEvent.change(screen.getByLabelText('Malzeme'), { target: { value: 'rulman' } });
    fireEvent.click(await screen.findByRole('option', { name: /HM-00007 Deneme rulman/ }));
    fireEvent.change(screen.getByLabelText(/^Miktar/), { target: { value: '3,5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Kalem ekle' }));
    fireEvent.click(screen.getByRole('button', { name: 'Adıyla yazın' }));
    expect(screen.getByText('kart bekliyor')).toBeTruthy();
    fireEvent.change(screen.getByLabelText(/Kalem adı/), { target: { value: 'Deneme serbest' } });
    fireEvent.change(screen.getByLabelText(/Birim/), { target: { value: 'adet' } });
    fireEvent.change(screen.getAllByLabelText(/^Miktar/)[1]!, { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Talebi gönder' }));
    await screen.findByText('ST-2026-042 açıldı; satın almaya düştü.');
    const g = cagrilar.find((c) => c.yol === '/satin-alma-talepleri/hizli-ac')!.govde as Record<string, unknown>;
    expect(g.kalemler).toEqual([
      { malzemeNo: 7, ad: '', birim: '', miktar: '3.5', aciklama: '', uygulananMalzemeNo: null, isEmriId: null },
      { malzemeNo: null, ad: 'Deneme serbest', birim: 'adet', miktar: '2', aciklama: '', uygulananMalzemeNo: null, isEmriId: null },
    ]);
    expect(Object.keys(g).sort()).toEqual(['aciklama', 'id', 'ihtiyacTarihi', 'kalemler', 'tur', 'uretimEmriId']);
    expect(g.uretimEmriId).toBeNull();
    expect(g.tur).toBe('malzeme');
  });

  it('isteğe bağlı üretim emri: açık emirler listelenir, seçilen emir gövdeye girer; seçilmezse null gider', async () => {
    const cagrilar = sunucuKur();
    sar(<TalepAc />);
    const secim = await screen.findByLabelText(/Üretim emri/);
    await screen.findByRole('option', { name: /UE-000031 · P-31 Deneme parça/ });
    expect((secim as HTMLSelectElement).value).toBe('');
    fireEvent.change(secim, { target: { value: '31' } });
    serbestKalem('2');
    fireEvent.click(screen.getByRole('button', { name: 'Talebi gönder' }));
    await screen.findByText('ST-2026-042 açıldı; satın almaya düştü.');
    expect((cagrilar.find((c) => c.yol === '/satin-alma-talepleri/hizli-ac')!.govde as { uretimEmriId: number | null }).uretimEmriId).toBe(31);
    await waitFor(() => expect((screen.getByLabelText(/Üretim emri/) as HTMLSelectElement).value).toBe(''));
  });

  it('Taleplerim satırında emir no görünür', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json(200, { talepler: [talep(1, { uretimEmriNo: 'UE-000031' })], toplam: 1 } satisfies TaleplerimCevabi)));
    sar(<Taleplerim />);
    expect((await screen.findByText(/üretim emri UE-000031/)).textContent).toContain('UE-000031');
  });

  it('#1192: kalem alanı odaklanınca açılır liste olur; ok ve Enter ile seçilir, satırda kategori ve birim görünür', async () => {
    const cagrilar = sunucuKur();
    sar(<TalepAc />);
    const kutu = screen.getByRole('combobox', { name: 'Malzeme' });
    fireEvent.focus(kutu);
    expect(kutu.getAttribute('aria-expanded')).toBe('true');
    expect((await screen.findByRole('option', { name: /HM-00007/ })).textContent).toContain('Rulman · adet');
    expect(cagrilar.some((c) => c.yol === '/satin-alma-malzeme-secenekleri?ara=&tur=malzeme')).toBe(true);
    fireEvent.keyDown(kutu, { key: 'ArrowDown' });
    fireEvent.keyDown(kutu, { key: 'Enter' });
    expect(screen.getByText('Deneme rulman')).toBeTruthy();
    expect(screen.queryByRole('combobox', { name: 'Malzeme' })).toBeNull();
  });

  it('#1192: Hizmet seçilince liste yalnız hizmet kartlarını ister, kalemler sıfırlanır ve talep hizmet türüyle gider', async () => {
    const cagrilar = sunucuKur();
    sar(<TalepAc />);
    fireEvent.click(screen.getByRole('button', { name: 'Adıyla yazın' }));
    fireEvent.click(screen.getByRole('button', { name: 'Hizmet' }));
    expect(screen.getByRole('button', { name: 'Hizmet' }).getAttribute('aria-pressed')).toBe('true');
    const kutu = screen.getByRole('combobox', { name: 'Hizmet' });
    fireEvent.change(kutu, { target: { value: 'kaplama' } });
    await waitFor(() => expect(cagrilar.some((c) => c.yol === '/satin-alma-malzeme-secenekleri?ara=kaplama&tur=hizmet')).toBe(true));
    expect(cagrilar.filter((c) => c.yol.startsWith('/satin-alma-malzeme-secenekleri?')).every((c) => c.yol.endsWith('tur=hizmet'))).toBe(true);
    fireEvent.click(await screen.findByRole('option', { name: /HZ-00011/ }));
    fireEvent.change(screen.getByLabelText(/^Miktar/), { target: { value: '8' } });
    fireEvent.click(screen.getByRole('button', { name: 'Talebi gönder' }));
    await screen.findByText('ST-2026-042 açıldı; satın almaya düştü.');
    const g = cagrilar.find((c) => c.yol === '/satin-alma-talepleri/hizli-ac')!.govde as { tur: string; kalemler: unknown[] };
    expect([g.tur, g.kalemler]).toEqual(['hizmet', [{ malzemeNo: 11, ad: '', birim: '', miktar: '8', aciklama: '', uygulananMalzemeNo: null, isEmriId: null }]]);
  });

  it('gönderilen talep ana sayfadaki satın alma sayılarını da yeniler', async () => {
    sunucuKur();
    const istemci = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const yenile = vi.spyOn(istemci, 'invalidateQueries');
    render(<QueryClientProvider client={istemci}><BildirimSaglayici><TalepAc /></BildirimSaglayici></QueryClientProvider>);
    fireEvent.click(screen.getByRole('button', { name: 'Adıyla yazın' }));
    fireEvent.change(screen.getByLabelText(/Kalem adı/), { target: { value: 'Deneme serbest' } });
    fireEvent.change(screen.getByLabelText(/Birim/), { target: { value: 'adet' } });
    fireEvent.change(screen.getByLabelText(/^Miktar/), { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Talebi gönder' }));
    await screen.findByText('ST-2026-042 açıldı; satın almaya düştü.');
    expect(yenile.mock.calls.map((c) => c[0]?.queryKey)).toContainEqual(anahtarlar.ozet);
  });

  it('eksik kalemle gönderilmez; kart sayfasına yeni sekmede bağlantı vardır', async () => {
    const cagrilar = sunucuKur();
    sar(<TalepAc />);
    fireEvent.click(screen.getByRole('button', { name: 'Talebi gönder' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/malzemeyi seçin/);
    expect(cagrilar.some((c) => c.yol === '/satin-alma-talepleri/hizli-ac')).toBe(false);
    const bag = screen.getByRole('link');
    expect([bag.getAttribute('target'), bag.getAttribute('rel')]).toEqual(['_blank', 'noopener']);
  });

  const serbestKalem = (miktar: string) => {
    fireEvent.click(screen.getByRole('button', { name: 'Adıyla yazın' }));
    fireEvent.change(screen.getByLabelText(/Kalem adı/), { target: { value: 'Deneme serbest' } });
    fireEvent.change(screen.getByLabelText(/Birim/), { target: { value: 'adet' } });
    fireEvent.change(screen.getByLabelText(/^Miktar/), { target: { value: miktar } });
  };
  const gonderilenMiktar = (cagrilar: Cagri[]) =>
    (cagrilar.filter((c) => c.yol === '/satin-alma-talepleri/hizli-ac').at(-1)!.govde as { kalemler: { miktar: string }[] }).kalemler[0]!.miktar;

  it('Y2, denetim #37: "12.5" ve "12,5" on iki buçuk, "1.250,5" bin iki yüz elli buçuk; virgülsüz "1.250" belirsiz, okunamayan miktar gönderilmez', async () => {
    const cagrilar = sunucuKur();
    sar(<TalepAc />);
    const gonderilenler: string[] = [];
    for (const [i, girilen] of ['12.5', '12,5', '1.250,5'].entries()) {
      if (i > 0) await screen.findByRole('button', { name: 'Adıyla yazın' });
      serbestKalem(girilen);
      fireEvent.click(screen.getByRole('button', { name: 'Talebi gönder' }));
      await waitFor(() => expect(cagrilar.filter((c) => c.yol === '/satin-alma-talepleri/hizli-ac').length).toBe(i + 1));
      gonderilenler.push(gonderilenMiktar(cagrilar));
    }
    expect(gonderilenler).toEqual(['12.5', '12.5', '1250.5']);
    await screen.findByRole('button', { name: 'Adıyla yazın' });
    const once = cagrilar.length;
    serbestKalem('1.250');
    for (const [yanlis, ileti] of [['1.250', BELIRSIZ_MIKTAR], ['iki', 'Miktarı sayı olarak yazın']] as const) {
      fireEvent.change(screen.getByLabelText(/^Miktar/), { target: { value: yanlis } });
      fireEvent.click(screen.getByRole('button', { name: 'Talebi gönder' }));
      await waitFor(() => expect(screen.getByRole('alert').textContent).toContain(ileti));
    }
    expect(cagrilar.slice(once).some((c) => c.yol === '/satin-alma-talepleri/hizli-ac')).toBe(false);
  });

  it('KD-010: ağ kopunca elle yeniden gönderim aynı kimlikle gider; form değişince kimlik yenilenir', async () => {
    const ag = { kopuk: true };
    const cagrilar = sunucuKur(ag);
    sar(<TalepAc />);
    serbestKalem('2');
    fireEvent.click(screen.getByRole('button', { name: 'Talebi gönder' }));
    await screen.findByRole('alert', {}, { timeout: 8000 });
    const ac = () => cagrilar.filter((c) => c.yol === '/satin-alma-talepleri/hizli-ac');
    const ilk = ac()[0]!;
    expect(new Set(ac().map((c) => c.kimlik))).toEqual(new Set([ilk.kimlik]));
    expect(ilk.kimlik).toBe((ilk.govde as { id: string }).id);
    ag.kopuk = false;
    const dugme = screen.getByRole('button', { name: 'Talebi gönder' }) as HTMLButtonElement;
    await waitFor(() => expect(dugme.disabled).toBe(false));
    fireEvent.click(screen.getByRole('button', { name: 'Talebi gönder' }));
    await screen.findByText('ST-2026-042 açıldı; satın almaya düştü.');
    expect([ac().at(-1)!.kimlik, (ac().at(-1)!.govde as { id: string }).id]).toEqual([ilk.kimlik, ilk.kimlik]);
    serbestKalem('3');
    fireEvent.click(screen.getByRole('button', { name: 'Talebi gönder' }));
    await waitFor(() => expect(gonderilenMiktar(cagrilar)).toBe('3'));
    expect(ac().at(-1)!.kimlik).not.toBe(ilk.kimlik);
  }, 15_000);

  it('Taleplerim son 10 talebi durumuyla gösterir, kart bekleyeni işaretler; "Tümü" hepsini açar', async () => {
    const cagrilar = sunucuKur();
    sar(<Taleplerim />);
    await screen.findByText('ST-2026-001');
    expect(screen.getAllByRole('listitem')).toHaveLength(10);
    expect(screen.getByText('Onayda')).toBeTruthy();
    expect(screen.getByText('1 kalem kart bekliyor')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Tümü (12)' }));
    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(12));
    expect(cagrilar.map((c) => c.yol)).toContain('/satin-alma-taleplerim?sinir=500');
  });
});

describe('Planlama menüsünde Taleplerim sayfası (12.10.2026)', () => {
  it('menüde Planlama grubundadır; rotası ön talepleri, kişinin taleplerini ve talep formunu üç bölümde açar', async () => {
    expect(SAYFALAR.find((x) => x.yol === '/taleplerim')).toMatchObject({ islem: 'sayfa.taleplerim', grup: 'Planlama', baslik: 'Taleplerim' });
    expect(rotalar.find((r) => r.yol === '/taleplerim')?.ekran).toBe(TaleplerimSayfasi);
    sunucuKur();
    sar(<TaleplerimSayfasi />);
    expect(await screen.findByText('UE-000031')).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: /^Taleplerim/ }));
    expect(await screen.findByText('ST-2026-001')).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: /^Yeni talep/ }));
    expect(screen.getByLabelText('Malzeme')).toBeTruthy();
  });

  it('898 a: ön talep "Talebe çevir" formu hizmet, emir, parça ve fason bağıyla doldurur; gönderimde bağ gövdeye girer', async () => {
    const cagrilar = sunucuKur();
    sar(<TaleplerimSayfasi />);
    fireEvent.click(await screen.findByRole('button', { name: 'Talebe çevir' }));
    expect(screen.getByRole('button', { name: 'Hizmet' }).getAttribute('aria-pressed')).toBe('true');
    expect((screen.getByRole('button', { name: 'Malzeme' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText('Deneme flanş')).toBeTruthy();
    expect((screen.getByLabelText(/Kalem adı/) as HTMLInputElement).value).toBe('Deneme ısıl işlem');
    expect((screen.getByLabelText('İstenen tarih') as HTMLInputElement).value).toBe('2026-11-03');
    await waitFor(() => expect((screen.getByLabelText(/Üretim emri/) as HTMLSelectElement).value).toBe('31'));
    fireEvent.click(screen.getByRole('button', { name: 'Talebi gönder' }));
    await screen.findByText('ST-2026-042 açıldı; satın almaya düştü.');
    const g = cagrilar.find((c) => c.yol === '/satin-alma-talepleri/hizli-ac')!.govde as Record<string, unknown>;
    expect([g.tur, g.uretimEmriId, g.ihtiyacTarihi, g.kalemler]).toEqual(['hizmet', 31, '2026-11-03', [
      { malzemeNo: null, ad: 'Deneme ısıl işlem', birim: 'adet', miktar: '12', aciklama: '', uygulananMalzemeNo: 9, isEmriId: 501 },
    ]]);
    expect(screen.getByRole('tab', { name: /^Taleplerim/ }).getAttribute('aria-selected')).toBe('true');
  });

  it('898 a: yoksayma nedenle gider; "Diğer" seçilince not zorunludur', async () => {
    const cagrilar = sunucuKur();
    sar(<TaleplerimSayfasi />);
    fireEvent.click(await screen.findByRole('button', { name: 'Yoksay' }));
    const pencere = screen.getByRole('dialog');
    fireEvent.change(screen.getByLabelText('Neden'), { target: { value: 'Diğer' } });
    fireEvent.click(within(pencere).getByRole('button', { name: 'Yoksay' }));
    expect(within(pencere).getByRole('alert').textContent).toBe('Nedeni yazın.');
    fireEvent.change(screen.getByLabelText('Neden'), { target: { value: 'Başka talepte var' } });
    fireEvent.change(screen.getByLabelText('Not'), { target: { value: 'ST-2026-009' } });
    fireEvent.click(within(pencere).getByRole('button', { name: 'Yoksay' }));
    await screen.findByText('Ön talep yoksayıldı.');
    expect(cagrilar.find((c) => c.yol === '/satin-alma-on-talepleri/yoksay')!.govde).toEqual({ kaynak: 'fason', isEmriId: 501, neden: 'Başka talepte var: ST-2026-009' });
  });

  it('898 a Dal 2: plan ihtiyacı hesabıyla görünür; talebe çevirince malzeme kartı ve kalan miktarla dolar; yoksayma malzemeyle gider', async () => {
    onListe = { onTalepler: [PLAN_TALEBI], yoksayilanlar: [] };
    const cagrilar = sunucuKur();
    sar(<TaleplerimSayfasi />);
    expect(await screen.findByText(/Eksik 10 − açık sipariş 2 − açık talep 1,5/)).toBeTruthy();
    expect(screen.getByText('Stok kaydı yok')).toBeTruthy();
    expect(screen.getByText('Bekleyen fason ön talep yok.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Yoksay' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Yoksay' }));
    await screen.findByText('Ön talep yoksayıldı.');
    expect(cagrilar.find((c) => c.yol === '/satin-alma-on-talepleri/yoksay')!.govde).toEqual({ kaynak: 'plan', malzemeNo: 7, neden: 'Stokta var, sayım güncel değil' });
    fireEvent.click(screen.getByRole('button', { name: 'Talebe çevir' }));
    expect(screen.getByRole('button', { name: 'Malzeme' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByText('Plan ihtiyacı', { selector: '.sa-talep-kaynak *' })).toBeTruthy();
    expect((screen.getByLabelText('İstenen tarih') as HTMLInputElement).value).toBe('2026-11-10');
    fireEvent.click(screen.getByRole('button', { name: 'Talebi gönder' }));
    await screen.findByText('ST-2026-042 açıldı; satın almaya düştü.');
    const g = cagrilar.find((c) => c.yol === '/satin-alma-talepleri/hizli-ac')!.govde as Record<string, unknown>;
    expect([g.tur, g.uretimEmriId, g.kalemler]).toEqual(['malzeme', null, [
      { malzemeNo: 7, ad: '', birim: '', miktar: '6.5', aciklama: '', uygulananMalzemeNo: null, isEmriId: null },
    ]]);
  });

  it('898 a Dal 2: fason adım ve plan ihtiyacı birlikte seçilince birleştirme kapalıdır', async () => {
    onListe = { onTalepler: [ON_TALEP, PLAN_TALEBI], yoksayilanlar: [] };
    sunucuKur();
    sar(<TaleplerimSayfasi />);
    fireEvent.click(await screen.findByLabelText('UE-000031 Op 30 Deneme ısıl işlem seç'));
    fireEvent.click(screen.getByLabelText('HM-00007 seç'));
    expect(screen.getByText(/fason adım ve plan ihtiyacı ayrı talep olur/)).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Tek talepte birleştir' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('898 a: Taleplerim bölümü durumla süzer, arar; satır açılınca uygulanan parça ve fason adım görünür', async () => {
    sunucuKur();
    sar(<TaleplerimSayfasi />);
    fireEvent.click(screen.getByRole('tab', { name: /^Taleplerim/ }));
    await screen.findByText('ST-2026-012');
    fireEvent.click(screen.getByRole('button', { name: 'Onayda', pressed: false }));
    await waitFor(() => expect(screen.queryByText('ST-2026-012')).toBeNull());
    const satir = screen.getByRole('button', { name: /ST-2026-001/ });
    expect(screen.getByText('Fason adım')).toBeTruthy();
    fireEvent.click(satir);
    expect(screen.getByText('Parça: MM-00009 · Deneme flanş · Fason: UE-000031 · Op 30')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Hepsi' }));
    fireEvent.change(screen.getByLabelText('Ara'), { target: { value: 'talep 12' } });
    await waitFor(() => expect(screen.getAllByRole('button', { name: /ST-2026-0/ })).toHaveLength(1));
  });
});
