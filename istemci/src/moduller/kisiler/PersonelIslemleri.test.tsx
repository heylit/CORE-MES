import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { HataGovdesi } from '#paylasilan/hata.ts';
import type { Kullanici } from '#paylasilan/kullanici.ts';
import type { OturumCevabi } from '#paylasilan/sozlesme/oturum.ts';
import type { KisiOzeti, PersonelCevabi, RollerCevabi } from '#paylasilan/sozlesme/kisiler.ts';
import { BildirimSaglayici } from '../../ortak/arayuz/index.ts';
import { Personel } from './Personel.tsx';

const OKUYUCU: Kullanici = { id: 2, ad: 'Deneme Okuyucu', islemler: ['kisiler.oku', 'sayfa.personel'] };
const IK: Kullanici = { id: 5, ad: 'Deneme İK', islemler: ['kisiler.oku', 'kisiler.yaz', 'sayfa.personel'] };
const TAM: Kullanici = {
  id: 1,
  ad: 'Deneme Yönetici',
  islemler: ['kisiler.oku', 'kisiler.yaz', 'kisiler.rol-yonet', 'kisiler.parola-degistir', 'sayfa.personel'],
};

const ROLLER = {
  roller: [
    { id: 2, ad: 'Operatör', yonetici: false },
    { id: 3, ad: 'Yönetici', yonetici: true },
  ],
} satisfies RollerCevabi;

const kisi = (ozet: Partial<KisiOzeti> & Pick<KisiOzeti, 'id' | 'ad'>): KisiOzeti => ({
  aktif: true, girisVar: true, kullaniciAdi: null, pinVar: false, sicilNo: null, gorev: null, roller: [], surum: 1, ozlukIk: false, ozlukCikisTarihi: null, ...ozet,
});
const AYSE = kisi({ id: 10, ad: 'Ayşe Deneme', roller: [{ id: 2, ad: 'Operatör', yonetici: false }] });
const MEHMET = kisi({ id: 11, ad: 'Mehmet Deneme', aktif: false, girisVar: false });
const YETKILI = kisi({ id: 12, ad: 'Veli Deneme', roller: [{ id: 3, ad: 'Yönetici', yonetici: true }] });

const json = (durum: number, govde: unknown) => new Response(JSON.stringify(govde), { status: durum });

type Istek = { yol: string; govde: unknown };

function sunucuKur(kullanici: Kullanici, kisiler: KisiOzeti[], komut?: (yol: string) => Response): Istek[] {
  const istekler: Istek[] = [];
  vi.stubGlobal('fetch', vi.fn(async (adres: string, secenek?: { body?: string }) => {
    const yol = adres.replace('/api', '');
    const govde = secenek?.body === undefined ? undefined : JSON.parse(secenek.body);
    istekler.push({ yol, govde });
    if (yol === '/oturum') return json(200, { kullanici } satisfies OturumCevabi);
    if (yol === '/kisiler' && govde === undefined) return json(200, { kisiler } satisfies PersonelCevabi);
    if (yol === '/roller') return json(200, ROLLER);
    if (komut && govde !== undefined) return komut(yol);
    return json(404, { kod: 'BULUNAMADI', mesaj: 'Adres bulunamadı.' });
  }));
  return istekler;
}

function ac() {
  const istemci = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={istemci}>
      <MemoryRouter><BildirimSaglayici><Personel /></BildirimSaglayici></MemoryRouter>
    </QueryClientProvider>,
  );
}

const komutlar = (istekler: Istek[]) => istekler.filter((i) => i.govde !== undefined);
const dugme = (ad: string) => screen.queryByRole('button', { name: ad });
// Zorunlu alanın etiketine " *" eklenir.
const etiketli = (etiket: string) => new RegExp(`^${etiket}`);
const yaz = (etiket: string, deger: string) => fireEvent.change(screen.getByLabelText(etiketli(etiket)), { target: { value: deger } });
const bekle = () => new Promise((coz) => setTimeout(coz, 20));

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('Personel: kişi, hesap ve parola işlemleri', () => {
  it('okuyucuda işlem düğmesi yok; kisiler.yaz sahibinde kişi düğmeleri var, hesap açma ve roller yok', async () => {
    sunucuKur(OKUYUCU, [AYSE, MEHMET]);
    ac();
    await screen.findByText('Ayşe Deneme');
    await bekle();
    for (const ad of ['Kişi ekle', 'Ayşe Deneme düzenle', 'Ayşe Deneme pasife al', 'Mehmet Deneme hesap aç', 'Ayşe Deneme parolasını değiştir']) {
      expect(dugme(ad), ad).toBeNull();
    }
    cleanup();
    vi.unstubAllGlobals();

    sunucuKur(IK, [AYSE, MEHMET]);
    ac();
    expect(await screen.findByRole('button', { name: 'Kişi ekle' })).toBeTruthy();
    expect(dugme('Ayşe Deneme düzenle')).toBeTruthy();
    expect(dugme('Ayşe Deneme pasife al')).toBeTruthy();
    expect(dugme('Mehmet Deneme yeniden aktif yap')).toBeTruthy();
    expect(dugme('Mehmet Deneme hesap aç')).toBeNull();
    expect(dugme('Ayşe Deneme rollerini düzenle')).toBeNull();
    expect(dugme('Ayşe Deneme parolasını değiştir')).toBeNull();
  });

  it('kişi ekleme: ad boşken kaydedilemez; doldurulunca sunucuya gider ve liste yeni kişiyi gösterir', async () => {
    const yeni = kisi({ id: 20, ad: 'Zeynep Deneme', girisVar: false, sicilNo: 'S-7', gorev: 'Operatör' });
    const istekler = sunucuKur(IK, [AYSE], () => json(200, yeni));
    ac();
    fireEvent.click(await screen.findByRole('button', { name: 'Kişi ekle' }));
    const pencere = within(await screen.findByRole('dialog', { name: 'Kişi ekle' }));
    expect((pencere.getByRole('button', { name: 'Kaydet' }) as HTMLButtonElement).disabled).toBe(true);

    yaz('Ad', 'Zeynep Deneme');
    yaz('Sicil no', 'S-7');
    yaz('Görev', 'Operatör');
    fireEvent.click(pencere.getByRole('button', { name: 'Kaydet' }));

    expect(await screen.findByText('Kişi eklendi.')).toBeTruthy();
    expect(komutlar(istekler)).toEqual([{ yol: '/kisiler', govde: { ad: 'Zeynep Deneme', sicilNo: 'S-7', gorev: 'Operatör' } }]);
    expect(screen.getByText('Zeynep Deneme')).toBeTruthy();
    expect(screen.queryByRole('dialog', { name: 'Kişi ekle' })).toBeNull();
  });

  it('kişi ekleme istek kimliğiyle gider; 500 sonrası yeniden gönderim aynı kimliği taşır (ikinci kişi açılmaz)', async () => {
    const yeni = kisi({ id: 21, ad: 'Deneme Yeni', girisVar: false });
    const kimlikler: (string | null)[] = [];
    vi.stubGlobal('fetch', vi.fn(async (adres: string, secenek?: { body?: string; headers?: Record<string, string> }) => {
      const yol = adres.replace('/api', '');
      if (yol === '/oturum') return json(200, { kullanici: IK } satisfies OturumCevabi);
      if (yol === '/kisiler' && secenek?.body === undefined) return json(200, { kisiler: [AYSE] } satisfies PersonelCevabi);
      kimlikler.push(secenek?.headers?.['istek-kimligi'] ?? null);
      return kimlikler.length === 1 ? json(500, { kod: 'SUNUCU_HATASI', mesaj: 'Geçici hata.' }) : json(200, yeni);
    }));
    ac();
    fireEvent.click(await screen.findByRole('button', { name: 'Kişi ekle' }));
    await screen.findByRole('dialog', { name: 'Kişi ekle' });
    yaz('Ad', 'Deneme Yeni');
    fireEvent.click(screen.getByRole('button', { name: 'Kaydet' }));

    expect(await screen.findByText('Kişi eklendi.', undefined, { timeout: 3000 })).toBeTruthy();
    expect(kimlikler).toHaveLength(2);
    expect(kimlikler[0]).toMatch(/^[0-9a-f-]{36}$/);
    expect(kimlikler[1]).toBe(kimlikler[0]);
  });

  it('eski sürüm (409): ileti gösterilir ve liste sunucudan yeniden okunur', async () => {
    const red: HataGovdesi = {
      kod: 'CAKISMA',
      mesaj: 'Bu kayıt siz açtıktan sonra değiştirildi. Sayfayı yenileyip değişikliğinizi yeniden yapın.',
      ayrinti: { neden: 'eski-surum' },
    };
    const istekler = sunucuKur(IK, [AYSE], () => json(409, red));
    ac();
    fireEvent.click(await screen.findByRole('button', { name: 'Ayşe Deneme pasife al' }));
    fireEvent.click(within(await screen.findByRole('dialog', { name: 'Pasife alınsın mı?' })).getByRole('button', { name: 'Pasife al' }));

    expect(await screen.findByText(red.mesaj)).toBeTruthy();
    await waitFor(() => expect(istekler.filter((i) => i.yol === '/kisiler' && i.govde === undefined)).toHaveLength(2));
    expect(komutlar(istekler)).toEqual([{ yol: '/kisiler/10/pasife-al', govde: { surum: 1 } }]);
  });

  it('düzenleme: form kişinin değerleriyle açılır, değişiklik düzenle ucuna gider', async () => {
    const mevcut = { ...AYSE, sicilNo: 'A-1', gorev: 'Depo' };
    const istekler = sunucuKur(IK, [mevcut], () => json(200, { ...mevcut, gorev: 'Kalite' }));
    ac();
    fireEvent.click(await screen.findByRole('button', { name: 'Ayşe Deneme düzenle' }));
    await screen.findByRole('dialog', { name: 'Düzenle: Ayşe Deneme' });
    expect((screen.getByLabelText(etiketli('Sicil no')) as HTMLInputElement).value).toBe('A-1');
    yaz('Görev', 'Kalite');
    fireEvent.click(screen.getByRole('button', { name: 'Kaydet' }));

    expect(await screen.findByText('Kişi güncellendi.')).toBeTruthy();
    expect(komutlar(istekler)).toEqual([{ yol: '/kisiler/10/duzenle', govde: { ad: 'Ayşe Deneme', sicilNo: 'A-1', gorev: 'Kalite', surum: 1 } }]);
  });

  it('sunucu reddederse sunucunun iletisi gösterilir ve form açık kalır', async () => {
    const red = { kod: 'CAKISMA', mesaj: 'Bu sicil numarası başka bir kişide kayıtlı.' } satisfies HataGovdesi;
    sunucuKur(IK, [AYSE], () => json(409, red));
    ac();
    fireEvent.click(await screen.findByRole('button', { name: 'Kişi ekle' }));
    yaz('Ad', 'Zeynep');
    fireEvent.click(screen.getByRole('button', { name: 'Kaydet' }));

    expect((await screen.findByRole('alert')).textContent).toBe(red.mesaj);
    expect(screen.getByRole('dialog', { name: 'Kişi ekle' })).toBeTruthy();
  });

  it('pasife alma: sıradan kişi de onayla; vazgeçilirse istek gitmez; durum ve düğme değişir, yeniden aktif yapılır', async () => {
    const istekler = sunucuKur(IK, [AYSE], (yol) => json(200, { ...AYSE, aktif: yol.endsWith('/aktif-yap') }));
    ac();
    fireEvent.click(await screen.findByRole('button', { name: 'Ayşe Deneme pasife al' }));
    fireEvent.click(within(await screen.findByRole('dialog', { name: 'Pasife alınsın mı?' })).getByRole('button', { name: 'Vazgeç' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Pasife alınsın mı?' })).toBeNull());
    expect(komutlar(istekler)).toHaveLength(0);

    fireEvent.click(screen.getByRole('button', { name: 'Ayşe Deneme pasife al' }));
    fireEvent.click(within(await screen.findByRole('dialog', { name: 'Pasife alınsın mı?' })).getByRole('button', { name: 'Pasife al' }));
    expect(await screen.findByText('Kişi pasife alındı.')).toBeTruthy();
    expect(screen.queryByRole('dialog')).toBeNull();
    const satir = within(screen.getAllByRole('row').find((s) => s.textContent?.includes('Ayşe Deneme'))!);
    expect(satir.getByText('Pasif')).toBeTruthy();

    fireEvent.click(await screen.findByRole('button', { name: 'Ayşe Deneme yeniden aktif yap' }));
    expect(await screen.findByText('Kişi yeniden aktif yapıldı.')).toBeTruthy();
    expect(komutlar(istekler).map((i) => i.yol)).toEqual(['/kisiler/10/pasife-al', '/kisiler/10/aktif-yap']);
  });

  it('bayraklı kişi onayla pasife alınır; vazgeçilirse istek gitmez; kendi satırında pasife al yok', async () => {
    const ben = kisi({ id: TAM.id, ad: TAM.ad });
    const istekler = sunucuKur(TAM, [YETKILI, ben], () => json(200, { ...YETKILI, aktif: false }));
    ac();
    fireEvent.click(await screen.findByRole('button', { name: 'Veli Deneme pasife al' }));
    const onay = within(await screen.findByRole('dialog', { name: 'Pasife alınsın mı?' }));
    fireEvent.click(onay.getByRole('button', { name: 'Vazgeç' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Pasife alınsın mı?' })).toBeNull());
    expect(komutlar(istekler)).toHaveLength(0);
    expect(dugme('Deneme Yönetici pasife al')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Veli Deneme pasife al' }));
    fireEvent.click(within(await screen.findByRole('dialog', { name: 'Pasife alınsın mı?' })).getByRole('button', { name: 'Pasife al' }));
    await waitFor(() => expect(komutlar(istekler)).toHaveLength(1));
    expect(komutlar(istekler)[0]?.yol).toBe('/kisiler/12/pasife-al');
  });

  it('hesap açma: yalnız girişsiz kişide ve kisiler.rol-yonet ile; kullanıcı adı, parola ve rol gider', async () => {
    const acilmis = { ...MEHMET, girisVar: true, roller: [{ id: 2, ad: 'Operatör', yonetici: false }] };
    const istekler = sunucuKur(TAM, [AYSE, MEHMET], () => json(200, acilmis));
    ac();
    await screen.findByText('Ayşe Deneme');
    expect(dugme('Ayşe Deneme hesap aç')).toBeNull();
    fireEvent.click(await screen.findByRole('button', { name: 'Mehmet Deneme hesap aç' }));
    await screen.findByRole('dialog', { name: 'Hesap aç: Mehmet Deneme' });
    const secim = await screen.findByLabelText(etiketli('Rol'));
    await within(secim).findByRole('option', { name: 'Operatör' });
    expect((screen.getByRole('button', { name: 'Hesabı aç' }) as HTMLButtonElement).disabled).toBe(true);

    expect((screen.getByLabelText(etiketli('Kullanıcı adı')) as HTMLInputElement).value).toBe('mehmet.deneme');
    yaz('Kullanıcı adı', 'mehmet.d');
    yaz('İlk parola', 'gizli-parola-1');
    fireEvent.change(secim, { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Hesabı aç' }));

    expect(await screen.findByText('Hesap açıldı.')).toBeTruthy();
    expect(komutlar(istekler)).toEqual([
      { yol: '/kisiler/11/hesap-ac', govde: { kullaniciAdi: 'mehmet.d', parola: 'gizli-parola-1', rolId: 2, surum: 1 } },
    ]);
    await waitFor(() => expect(dugme('Mehmet Deneme hesap aç')).toBeNull());
  });

  it('başkasının parolası: kisiler.parola-degistir ile, eski parola sorulmadan; girişsiz kişide düğme yok', async () => {
    const istekler = sunucuKur(TAM, [AYSE, MEHMET], () => json(200, { tamam: true }));
    ac();
    fireEvent.click(await screen.findByRole('button', { name: 'Ayşe Deneme parolasını değiştir' }));
    await screen.findByRole('dialog', { name: 'Parola değiştir: Ayşe Deneme' });
    expect(screen.queryByLabelText(etiketli('Eski parola'))).toBeNull();
    expect(dugme('Mehmet Deneme parolasını değiştir')).toBeNull();
    yaz('Yeni parola', 'yeni-parola-9');
    fireEvent.click(screen.getByRole('button', { name: 'Parolayı değiştir' }));

    expect(await screen.findByText('Parola değiştirildi.')).toBeTruthy();
    expect(komutlar(istekler)).toEqual([{ yol: '/kisiler/10/parola-degistir', govde: { yeniParola: 'yeni-parola-9', surum: 1 } }]);
  });

  it('PIN ver: kisiler.parola-degistir ile; kendine, bayraklıya ve girişsize düğme yok; yalnız 6 rakam gider', async () => {
    const BEN = kisi({ id: TAM.id, ad: 'Deneme Yönetici' });
    const istekler = sunucuKur(TAM, [AYSE, MEHMET, YETKILI, BEN], () => json(200, { tamam: true }));
    ac();
    fireEvent.click(await screen.findByRole('button', { name: 'Ayşe Deneme için PIN ver' }));
    await screen.findByRole('dialog', { name: 'PIN ver: Ayşe Deneme' });
    for (const ad of ['Mehmet Deneme için PIN ver', 'Veli Deneme için PIN ver', 'Deneme Yönetici için PIN ver']) {
      expect(dugme(ad), ad).toBeNull();
    }
    const gonder = screen.getByRole('button', { name: 'PIN ver' }) as HTMLButtonElement;
    yaz('Geçici PIN', '48a29');
    expect(gonder.disabled).toBe(true);
    yaz('Geçici PIN', '482913');
    fireEvent.click(gonder);

    expect(await screen.findByText('Geçici PIN verildi. Kişi ilk girişte kendi PIN\'ini belirleyecek.')).toBeTruthy();
    expect(komutlar(istekler)).toEqual([{ yol: '/kisiler/10/pin-ver', govde: { pin: '482913', surum: 1 } }]);
    cleanup();
    vi.unstubAllGlobals();

    sunucuKur(IK, [AYSE]);
    ac();
    await screen.findByText('Ayşe Deneme');
    await bekle();
    expect(dugme('Ayşe Deneme için PIN ver')).toBeNull();
  });

  it('kendi parolası: yalnız kendi satırında, işlem istemez, eski parola sorulur; başkasının düğmesi yok', async () => {
    const istekler = sunucuKur(OKUYUCU, [AYSE, kisi({ id: OKUYUCU.id, ad: OKUYUCU.ad })], () => json(200, { tamam: true }));
    ac();
    await screen.findByText('Ayşe Deneme');
    await waitFor(() => expect(dugme('Parolamı değiştir')).toBeTruthy());
    expect(dugme('Ayşe Deneme parolasını değiştir')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Parolamı değiştir' }));
    await screen.findByRole('dialog', { name: 'Parolamı değiştir' });
    yaz('Eski parola', 'eski-parola-1');
    yaz('Yeni parola', 'yeni-parola-9');
    fireEvent.click(screen.getByRole('button', { name: 'Parolayı değiştir' }));

    expect(await screen.findByText('Parola değiştirildi.')).toBeTruthy();
    expect(komutlar(istekler)).toEqual([
      { yol: '/hesabim/parola-degistir', govde: { eskiParola: 'eski-parola-1', yeniParola: 'yeni-parola-9' } },
    ]);
  });

  it('kendi parolasında bekleme (401) oturumu bitirmez; sunucunun iletisi gösterilir', async () => {
    const bitti = vi.fn();
    window.addEventListener('oturum:bitti', bitti);
    const red = { kod: 'OTURUM_YOK', mesaj: 'Çok sık deneme. 2 sn sonra yeniden deneyin.' } satisfies HataGovdesi;
    sunucuKur(OKUYUCU, [AYSE, kisi({ id: OKUYUCU.id, ad: OKUYUCU.ad })], () => json(401, red));
    ac();
    await waitFor(() => expect(dugme('Parolamı değiştir')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Parolamı değiştir' }));
    await screen.findByRole('dialog', { name: 'Parolamı değiştir' });
    yaz('Eski parola', 'eski-parola-1');
    yaz('Yeni parola', 'yeni-parola-9');
    fireEvent.click(screen.getByRole('button', { name: 'Parolayı değiştir' }));

    expect((await screen.findByRole('alert')).textContent).toBe(red.mesaj);
    expect(bitti).not.toHaveBeenCalled();
    window.removeEventListener('oturum:bitti', bitti);
  });

  it('bayraklı kişinin satırında düzenle yalnız bayraklı kullanıcıya görünür; sıradan satırda herkese', async () => {
    const ben = kisi({ id: TAM.id, ad: TAM.ad, roller: [{ id: 3, ad: 'Yönetici', yonetici: true }] });
    sunucuKur(TAM, [AYSE, YETKILI, ben]);
    ac();
    expect(await screen.findByRole('button', { name: 'Veli Deneme düzenle' })).toBeTruthy();
    expect(dugme('Ayşe Deneme düzenle')).toBeTruthy();
    cleanup();
    vi.unstubAllGlobals();

    // Kullanıcının kendi satırında bayraklı rol yoksa bayraklı satırın düğmesi gizlenir; sıradan satırınki durur.
    sunucuKur(TAM, [AYSE, YETKILI, kisi({ id: TAM.id, ad: TAM.ad })]);
    ac();
    expect(await screen.findByRole('button', { name: 'Ayşe Deneme düzenle' })).toBeTruthy();
    expect(dugme('Veli Deneme düzenle')).toBeNull();
  });

  it('bayrak bilinmiyorsa (null) düzenle düğmesi durur; sunucunun 403 iletisi görünür, form açık kalır', async () => {
    const gizli = kisi({ id: 12, ad: 'Veli Deneme', roller: [{ id: 3, ad: 'Yönetici', yonetici: null }] });
    const red = { kod: 'YETKI_YOK', mesaj: 'Tüm yetkileri veren role sahip kişinin kaydını yalnızca bu role sahip bir kişi düzenleyebilir.' } satisfies HataGovdesi;
    sunucuKur(IK, [AYSE, gizli], () => json(403, red));
    ac();
    expect(await screen.findByRole('button', { name: 'Ayşe Deneme düzenle' })).toBeTruthy();
    fireEvent.click(await screen.findByRole('button', { name: 'Veli Deneme düzenle' }));
    await screen.findByRole('dialog', { name: 'Düzenle: Veli Deneme' });
    yaz('Ad', 'Veli Yeni');
    fireEvent.click(screen.getByRole('button', { name: 'Kaydet' }));

    expect((await screen.findByRole('alert')).textContent).toBe(red.mesaj);
    expect(screen.getByRole('dialog', { name: 'Düzenle: Veli Deneme' })).toBeTruthy();
  });
});
