import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Islem } from '#paylasilan/islemler.ts';
import type { Kullanici } from '#paylasilan/kullanici.ts';
import type { KisiEkIslemleriCevabi, RolIslemleriCevabi } from '#paylasilan/sozlesme/kisiler.ts';
import { BildirimSaglayici } from '../../ortak/arayuz/index.ts';
import { anahtarlar as ortakAnahtarlar } from '../../ortak/veri/anahtarlar.ts';
import { SayfaYetkileri, kaynak, kisiKomutu } from './SayfaYetkileri.tsx';

const ISLEMLER = ['sayfa.stok', 'stok.giris', 'stok.cikis', 'sayfa.personel', 'kisiler.yaz', 'kisiler.parola-degistir'];
const DEPOCU = { id: 1, ad: 'Depocu Deneme', kullaniciAdi: 'depocu.deneme', bayrakli: false, roldenGelen: ['sayfa.stok', 'stok.giris'], ek: [] as string[], alinan: [] as string[] };
const LISTE = {
  islemler: ISLEMLER,
  devredilmez: ['kisiler.parola-degistir'],
  kisiler: [DEPOCU, { id: 2, ad: 'Yönetici Deneme', kullaniciAdi: 'yonetici.deneme', bayrakli: true, roldenGelen: [], ek: [], alinan: [] }],
} satisfies KisiEkIslemleriCevabi;
const ROLLER = {
  islemler: ISLEMLER,
  roller: [{ id: 7, ad: 'Depo', yonetici: false, islemler: ['sayfa.stok', 'stok.giris'] }, { id: 1, ad: 'Sistem Yöneticisi', yonetici: true, islemler: ISLEMLER }],
} satisfies RolIslemleriCevabi;
const DUZENLER: Islem[] = ['kisiler.rol-yonet', 'ayarlar.yaz'];

const json = (durum: number, govde: unknown) => new Response(JSON.stringify(govde), { status: durum });
const kisiyle = (degisiklik: Partial<typeof DEPOCU>): KisiEkIslemleriCevabi => ({ ...LISTE, kisiler: [{ ...DEPOCU, ...degisiklik }, LISTE.kisiler[1]!] });

function ac(islemler: Islem[] = DUZENLER, yazma: (yol: string, govde: Record<string, unknown>) => Response = () => json(200, LISTE), liste: KisiEkIslemleriCevabi = LISTE) {
  const gonderilenler: { yol: string; govde: unknown }[] = [];
  vi.stubGlobal('fetch', vi.fn(async (adres: string, secenek: { body?: string } = {}) => {
    const yol = adres.replace('/api', '');
    if (yol === '/kisi-ek-islemleri') return json(200, liste);
    if (yol === '/rol-islemleri') return json(200, ROLLER);
    const govde = JSON.parse(secenek.body ?? '{}') as Record<string, unknown>;
    gonderilenler.push({ yol, govde });
    return yazma(yol, govde);
  }));
  const istemci = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  istemci.setQueryData<Kullanici>(ortakAnahtarlar.oturum, { id: 9, ad: 'Deneme', islemler });
  render(<QueryClientProvider client={istemci}><BildirimSaglayici><SayfaYetkileri /></BildirimSaglayici></QueryClientProvider>);
  return gonderilenler;
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const sayfaAc = (ad: string) => { fireEvent.click(screen.getByRole('button', { name: ad, expanded: false })); };
const kisiSec = async () => {
  fireEvent.change(await screen.findByLabelText('Kişi'), { target: { value: '1' } });
  sayfaAc('Stok');
};

describe('kaynak: kişide işlemin nereden geldiği (sunucuyla aynı hesap)', () => {
  it('rolden, ek, alındı, yok; alınan işlem ekten gelse de alınmış sayılır', () => {
    const kisi = { ...DEPOCU, ek: ['sayfa.personel', 'stok.giris'], alinan: ['stok.giris'] };
    expect(kaynak(kisi, 'sayfa.stok')).toBe('rolden');
    expect(kaynak(kisi, 'sayfa.personel')).toBe('ek');
    expect(kaynak(kisi, 'stok.giris')).toBe('alindi');
    expect(kaynak(kisi, 'stok.cikis')).toBe('yok');
    expect(kisiKomutu(kisi, 'sayfa.stok')).toEqual({ tur: 'kisit', kisiId: 1, islem: 'sayfa.stok', alindi: true });
    expect(kisiKomutu(kisi, 'stok.giris')).toEqual({ tur: 'kisit', kisiId: 1, islem: 'stok.giris', alindi: false });
    expect(kisiKomutu(kisi, 'sayfa.personel')).toEqual({ tur: 'ek', kisiId: 1, islem: 'sayfa.personel', verildi: false });
    expect(kisiKomutu(kisi, 'stok.cikis')).toEqual({ tur: 'ek', kisiId: 1, islem: 'stok.cikis', verildi: true });
    // Hem rolde hem ekte: eki kaldırmak kişiyi durdurmaz, bu yüzden kişiden alınır (Test N2).
    const ikisi = { ...DEPOCU, ek: ['sayfa.stok'] };
    expect(kaynak(ikisi, 'sayfa.stok')).toBe('ek');
    expect(kisiKomutu(ikisi, 'sayfa.stok')).toEqual({ tur: 'kisit', kisiId: 1, islem: 'sayfa.stok', alindi: true });
  });
});

describe('Sayfa yetkileri', () => {
  it('Sayfalar sekmesi ve "Tek kişi" ile açılır; tüm yetkili kişi listede yok; kişi seçilmeden sayfa listesi yok', async () => {
    ac();
    const secim = await screen.findByLabelText('Kişi');
    expect(screen.getByRole('tab', { name: /Sayfalar/ }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByRole('button', { name: 'Tek kişi' }).getAttribute('aria-pressed')).toBe('true');
    expect(within(secim).queryByText(/Yönetici Deneme/)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Stok' })).toBeNull();
    expect(screen.getByText('Yetkilerini görmek için bir kişi seçin.')).toBeTruthy();
  });

  it('kişide rolden gelen işleme basınca yalnız o kişiden alınır; cevapla "Alındı" olur; yeniden basınca geri verilir', async () => {
    const alinmis = kisiyle({ alinan: ['stok.giris'] });
    const gonderilen = ac(DUZENLER, (_y, g) => json(200, g['alindi'] === true ? alinmis : LISTE));
    await kisiSec();
    fireEvent.click(screen.getByRole('button', { name: 'Depocu Deneme: Stok girişi' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Depocu Deneme: Stok girişi' }).getAttribute('aria-pressed')).toBe('false'));
    expect(screen.getAllByText('Alındı').length).toBeGreaterThan(1);
    expect(screen.getByText('Kısıtlı')).toBeTruthy();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Depocu Deneme: Stok girişi' }).hasAttribute('disabled')).toBe(false));
    fireEvent.click(screen.getByRole('button', { name: 'Depocu Deneme: Stok girişi' }));
    await waitFor(() => expect(gonderilen).toHaveLength(2));
    expect(gonderilen).toEqual([
      { yol: '/kisiler/1/islem-kisiti-degistir', govde: { islem: 'stok.giris', alindi: true } },
      { yol: '/kisiler/1/islem-kisiti-degistir', govde: { islem: 'stok.giris', alindi: false } },
    ]);
  });

  it('kişide rolde olmayan işleme basınca ek verilir; devredilmez işlem kapalı', async () => {
    const gonderilen = ac(DUZENLER, () => json(200, kisiyle({ ek: ['stok.cikis'] })));
    await kisiSec();
    fireEvent.click(screen.getByRole('button', { name: 'Depocu Deneme: Stok çıkışı' }));
    await waitFor(() => expect(gonderilen).toEqual([{ yol: '/kisiler/1/ek-islem-degistir', govde: { islem: 'stok.cikis', verildi: true } }]));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Depocu Deneme: Stok çıkışı' }).getAttribute('aria-pressed')).toBe('true'));
    fireEvent.change(screen.getByLabelText('Sayfa ya da işlem ara'), { target: { value: 'parola' } });
    expect(screen.getByRole('button', { name: /Depocu Deneme: .*[Pp]arola/ }).hasAttribute('disabled')).toBe(true);
  });

  it('"Bütün rol" seçilince uyarı çıkar, role verilir; bütün yetkili rol değiştirilmez', async () => {
    const gonderilen = ac(DUZENLER, () => json(200, ROLLER));
    await screen.findByLabelText('Kişi');
    fireEvent.click(screen.getByRole('button', { name: 'Bütün rol' }));
    expect(screen.getByText('Değişiklik bu roldeki herkesi etkiler.')).toBeTruthy();
    expect(screen.queryByText('Kişiye ayrıca verildi')).toBeNull();
    fireEvent.change(screen.getByLabelText('Rol'), { target: { value: '7' } });
    sayfaAc('Stok');
    fireEvent.click(screen.getByRole('button', { name: 'Depo: Stok çıkışı' }));
    await waitFor(() => expect(gonderilen).toEqual([{ yol: '/roller/7/islem-degistir', govde: { islem: 'stok.cikis', verildi: true } }]));
    fireEvent.change(screen.getByLabelText('Rol'), { target: { value: '1' } });
    expect(screen.getByText('Bütün yetkileri veren rol değiştirilmez.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Sistem Yöneticisi: Stok çıkışı' }).hasAttribute('disabled')).toBe(true);
    expect(screen.queryByRole('button', { name: 'Hepsini al' })).toBeNull();
  });

  it('"Hepsini al" onay sorar; onaydan önce istek gitmez; sonra yalnız yapabildiği işlemler sırayla alınır', async () => {
    const gonderilen = ac();
    await kisiSec();
    fireEvent.click(screen.getByRole('button', { name: 'Hepsini al' }));
    expect(await screen.findByText(/hepsi alınsın mı\?/)).toBeTruthy();
    expect(gonderilen).toHaveLength(0);
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Hepsini al' }));
    await waitFor(() => expect(gonderilen).toHaveLength(2));
    expect(gonderilen).toEqual([
      { yol: '/kisiler/1/islem-kisiti-degistir', govde: { islem: 'sayfa.stok', alindi: true } },
      { yol: '/kisiler/1/islem-kisiti-degistir', govde: { islem: 'stok.giris', alindi: true } },
    ]);
  });

  it('düzenleme işareti olmayan kullanıcı yalnız görür; sunucu reddederse ileti çıkar', async () => {
    ac(['kisiler.rol-yonet']);
    await kisiSec();
    expect(screen.getByRole('button', { name: 'Depocu Deneme: Stok girişi' }).hasAttribute('disabled')).toBe(true);
    expect(screen.queryByRole('button', { name: 'Hepsini ver' })).toBeNull();
    cleanup();
    ac(DUZENLER, () => json(403, { kod: 'YETKI', mesaj: 'Kişiden yetkiyi yalnızca tüm yetkileri veren role sahip kişi alabilir ve geri verebilir.' }));
    await kisiSec();
    fireEvent.click(screen.getByRole('button', { name: 'Depocu Deneme: Stok girişi' }));
    expect(await screen.findByText(/yalnızca tüm yetkileri veren/)).toBeTruthy();
  });

  it('Eylemler: liste ile ayrıntı alt alta düşünce (ekran genişliğinden bağımsız) seçim ayrıntıya kaydırır ve "Listeye dön" görünür; yan yanayken ikisi de yok', async () => {
    const kaydir = vi.fn();
    const kaydirOnce = HTMLElement.prototype.scrollIntoView;
    HTMLElement.prototype.scrollIntoView = kaydir;
    const ustOnce = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetTop');
    let altAlta = false;
    Object.defineProperty(HTMLElement.prototype, 'offsetTop', {
      configurable: true, get(this: HTMLElement) { return altAlta && this.classList.contains('tc-sy-ayrinti') ? 900 : 0; },
    });
    try {
      ac();
      fireEvent.click(await screen.findByRole('tab', { name: /Eylemler/ }));
      fireEvent.click(screen.getByRole('button', { name: /^Stok\s*3 işlem$/, expanded: false }));
      fireEvent.click(screen.getByRole('button', { name: /^Stok girişi/ }));
      expect(kaydir).not.toHaveBeenCalled();
      expect(screen.queryByRole('button', { name: 'Listeye dön' })).toBeNull();
      cleanup();
      altAlta = true;
      ac();
      fireEvent.click(await screen.findByRole('tab', { name: /Eylemler/ }));
      fireEvent.click(screen.getByRole('button', { name: /^Stok\s*3 işlem$/, expanded: false }));
      fireEvent.click(screen.getByRole('button', { name: /^Stok girişi/ }));
      await waitFor(() => expect(kaydir).toHaveBeenCalled());
      expect(screen.getByRole('button', { name: 'Listeye dön' })).toBeTruthy();
    } finally {
      HTMLElement.prototype.scrollIntoView = kaydirOnce;
      if (ustOnce) Object.defineProperty(HTMLElement.prototype, 'offsetTop', ustOnce);
    }
  });

  it('Eylemler: işlem seçilince roller ve kişiler görünür; "Bu kişiden al", "Geri ver" ve "Kişiye ayrıca ver" çalışır; sekme değişince seçim kalır', async () => {
    const gonderilen = ac(DUZENLER, (yol, g) => json(200, yol.endsWith('islem-kisiti-degistir') && g['alindi'] === true ? kisiyle({ alinan: ['stok.giris'] }) : LISTE));
    fireEvent.change(await screen.findByLabelText('Kişi'), { target: { value: '1' } });
    fireEvent.click(screen.getByRole('tab', { name: /Eylemler/ }));
    fireEvent.click(screen.getByRole('button', { name: /^Stok\s*3 işlem$/, expanded: false }));
    fireEvent.click(screen.getByRole('button', { name: /^Stok girişi/ }));
    const ayrinti = screen.getByRole('heading', { name: 'Stok girişi' }).closest('.tc-sy-ayrinti') as HTMLElement;
    expect(within(ayrinti).getByText('Depo')).toBeTruthy();
    expect(within(ayrinti).getByText('Depocu Deneme')).toBeTruthy();
    expect(within(ayrinti).queryByText('Yönetici Deneme')).toBeNull();
    fireEvent.click(within(ayrinti).getByRole('button', { name: 'Bu kişiden al' }));
    expect(await within(ayrinti).findByText('Bu kişiden alındı')).toBeTruthy();
    fireEvent.click(await within(ayrinti).findByRole('button', { name: 'Geri ver' }));
    await waitFor(() => expect(gonderilen).toHaveLength(2));

    fireEvent.click(screen.getByRole('button', { name: /^Stok çıkışı/ }));
    fireEvent.change(within(ayrinti).getByLabelText('Kişiye ayrıca ver'), { target: { value: '1' } });
    await waitFor(() => expect(within(ayrinti).getByRole('button', { name: 'Ver' }).hasAttribute('disabled')).toBe(false));
    fireEvent.click(within(ayrinti).getByRole('button', { name: 'Ver' }));
    await waitFor(() => expect(gonderilen).toHaveLength(3));
    expect(gonderilen).toEqual([
      { yol: '/kisiler/1/islem-kisiti-degistir', govde: { islem: 'stok.giris', alindi: true } },
      { yol: '/kisiler/1/islem-kisiti-degistir', govde: { islem: 'stok.giris', alindi: false } },
      { yol: '/kisiler/1/ek-islem-degistir', govde: { islem: 'stok.cikis', verildi: true } },
    ]);

    fireEvent.click(screen.getByRole('tab', { name: /Sayfalar/ }));
    expect((screen.getByLabelText('Kişi') as HTMLSelectElement).value).toBe('1');
    fireEvent.click(screen.getByRole('tab', { name: /Eylemler/ }));
    expect(screen.getByRole('heading', { name: 'Stok çıkışı' })).toBeTruthy();
  });
});
