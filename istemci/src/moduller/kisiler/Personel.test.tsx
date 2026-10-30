import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { HataGovdesi } from '#paylasilan/hata.ts';
import type { Kullanici } from '#paylasilan/kullanici.ts';
import type { OturumCevabi } from '#paylasilan/sozlesme/oturum.ts';
import type { KisiOzeti, PersonelCevabi, RollerCevabi } from '#paylasilan/sozlesme/kisiler.ts';
import { BildirimSaglayici } from '../../ortak/arayuz/index.ts';
import { ULASILAMADI_ILETISI } from '../../ortak/veri/api.ts';
import { Personel } from './Personel.tsx';

const YONETICI: Kullanici = { id: 1, ad: 'Deneme Yönetici', islemler: ['kisiler.oku', 'kisiler.rol-yonet', 'sayfa.personel'] };
const YAZAR: Kullanici = { id: 3, ad: 'Deneme Yazar', islemler: ['kisiler.oku', 'kisiler.yaz', 'sayfa.personel'] };
const OKUYUCU: Kullanici = { id: 2, ad: 'Deneme Okuyucu', islemler: ['kisiler.oku', 'sayfa.personel'] };

const ROLLER = {
  roller: [
    { id: 1, ad: 'Depo', yonetici: false },
    { id: 2, ad: 'Operatör', yonetici: false },
    { id: 3, ad: 'Yönetici', yonetici: true },
  ],
} satisfies RollerCevabi;

const AYSE: KisiOzeti = { id: 10, ad: 'Ayşe Deneme', aktif: true, girisVar: true, kullaniciAdi: 'ayse.deneme', pinVar: false, sicilNo: null, gorev: null, surum: 1, ozlukIk: false, ozlukCikisTarihi: null, roller: [{ id: 2, ad: 'Operatör', yonetici: false }] };
const MEHMET: KisiOzeti = { id: 11, ad: 'Mehmet Deneme', aktif: false, girisVar: false, kullaniciAdi: null, pinVar: false, sicilNo: null, gorev: null, surum: 1, ozlukIk: false, ozlukCikisTarihi: null, roller: [] };

const json = (durum: number, govde: unknown) => new Response(JSON.stringify(govde), { status: durum });

interface Kurulum {
  kullanici: Kullanici | (() => Kullanici);
  kisiler?: KisiOzeti[];
  // Atama ve alma isteklerine verilecek cevap.
  yazma?: (yol: string, govde: { rolId: number }) => Response;
}

function sunucuKur({ kullanici, kisiler = [AYSE, MEHMET], yazma }: Kurulum) {
  const istekler: { yol: string; govde: unknown }[] = [];
  vi.stubGlobal('fetch', vi.fn(async (adres: string, secenek?: { body?: string }) => {
    const yol = adres.replace('/api', '');
    const govde = secenek?.body === undefined ? undefined : JSON.parse(secenek.body);
    istekler.push({ yol, govde });
    if (yol === '/oturum') return json(200, { kullanici: typeof kullanici === 'function' ? kullanici() : kullanici } satisfies OturumCevabi);
    if (yol === '/kisiler') return json(200, { kisiler } satisfies PersonelCevabi);
    if (yol === '/roller') return json(200, ROLLER);
    if (yazma && /^\/kisiler\/\d+\/rol-(ata|al)$/.test(yol)) return yazma(yol, govde);
    return json(404, { kod: 'BULUNAMADI', mesaj: 'Adres bulunamadı.' });
  }));
  return istekler;
}

function ac(adres = '/personel') {
  const istemci = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={istemci}>
      <MemoryRouter initialEntries={[adres]}><BildirimSaglayici><Personel /></BildirimSaglayici></MemoryRouter>
    </QueryClientProvider>,
  );
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('Personel', () => {
  it('kişi listesini gösterir: ad, durum, giriş, roller; rolü olmayana "yok" yazar', async () => {
    sunucuKur({ kullanici: OKUYUCU });
    ac();
    await screen.findByText('Ayşe Deneme');
    const satirlar = screen.getAllByRole('row');
    const ayse = within(satirlar.find((s) => s.textContent?.includes('Ayşe Deneme'))!);
    expect(ayse.getByText('Aktif')).toBeTruthy();
    expect(ayse.getByText('Parola')).toBeTruthy();
    expect(ayse.getByText('ayse.deneme')).toBeTruthy();
    expect(ayse.getByText('Operatör')).toBeTruthy();
    const mehmet = within(satirlar.find((s) => s.textContent?.includes('Mehmet Deneme'))!);
    expect(mehmet.getByText('Pasif')).toBeTruthy();
    expect(mehmet.getByText('Yok', { selector: 'td' })).toBeTruthy();
  });

  it('kisiler.rol-yonet yoksa düğme görünmez (liste geldikten ve oturum çözüldükten sonra bakılır)', async () => {
    const istekler = sunucuKur({ kullanici: OKUYUCU });
    ac();
    await screen.findByText('Ayşe Deneme');
    await waitFor(() => expect(istekler.map((i) => i.yol)).toContain('/oturum'));
    await new Promise((coz) => setTimeout(coz, 20));
    expect(screen.queryByRole('button', { name: /rollerini düzenle/ })).toBeNull();
    expect(istekler.map((i) => i.yol)).not.toContain('/roller');
  });

  it('kisiler.rol-yonet varsa her kişi için düğme görünür', async () => {
    sunucuKur({ kullanici: YONETICI });
    ac();
    await screen.findByText('Ayşe Deneme');
    expect(await screen.findByRole('button', { name: 'Ayşe Deneme rollerini düzenle' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Mehmet Deneme rollerini düzenle' })).toBeTruthy();
  });

  it('İK\'ya bağlı kişide ad, sicil no ve görev salt okunur; çıkış tarihi ipucunda (1302 a, 1315)', async () => {
    const IKLI: KisiOzeti = { ...AYSE, sicilNo: 'S-1', gorev: 'Ayarcı', ozlukIk: true, ozlukCikisTarihi: '2026-11-30' };
    sunucuKur({ kullanici: YAZAR, kisiler: [IKLI, MEHMET] });
    ac();
    fireEvent.click(await screen.findByRole('button', { name: 'Ayşe Deneme düzenle' }));
    const pencere = within(await screen.findByRole('dialog'));
    for (const etiket of ['Ad', 'Sicil no', 'Görev']) expect((pencere.getByLabelText(etiket, { exact: false }) as HTMLInputElement).readOnly).toBe(true);
    expect(pencere.getByText(/İK personel kartından gelir.*Çıkış: 2026-11-30/)).toBeTruthy();
  });

  it('İK\'ya bağlı olmayan kişide alanlar düzenlenir', async () => {
    sunucuKur({ kullanici: YAZAR });
    ac();
    fireEvent.click(await screen.findByRole('button', { name: 'Ayşe Deneme düzenle' }));
    const pencere = within(await screen.findByRole('dialog'));
    for (const etiket of ['Ad', 'Sicil no', 'Görev']) expect((pencere.getByLabelText(etiket, { exact: false }) as HTMLInputElement).readOnly).toBe(false);
    expect(pencere.queryByText(/İK personel kartından gelir/)).toBeNull();
  });

  it('atama: seçilen rol sunucuya gider, liste yeni rolle güncellenir, seçeneklerden düşer', async () => {
    const istekler = sunucuKur({
      kullanici: YONETICI,
      yazma: () => json(200, { ...AYSE, roller: [...AYSE.roller, { id: 1, ad: 'Depo', yonetici: false }] } satisfies KisiOzeti),
    });
    ac();
    fireEvent.click(await screen.findByRole('button', { name: 'Ayşe Deneme rollerini düzenle' }));
    const pencere = within(await screen.findByRole('dialog'));
    const secim = await pencere.findByLabelText('Atanacak rol');
    expect((pencere.getByRole('button', { name: 'Ata' }) as HTMLButtonElement).disabled).toBe(true);
    expect(within(secim).queryByRole('option', { name: 'Operatör' })).toBeNull();

    fireEvent.change(secim, { target: { value: '1' } });
    fireEvent.click(pencere.getByRole('button', { name: 'Ata' }));

    await pencere.findByRole('button', { name: 'Depo rolünü al' });
    expect(istekler.find((i) => i.yol === '/kisiler/10/rol-ata')?.govde).toEqual({ rolId: 1, surum: 1 });
    expect(within(secim).queryByRole('option', { name: 'Depo' })).toBeNull();
    expect(await screen.findByText('Rol atandı.')).toBeTruthy();
  });

  it('alma: rol sunucuya gider ve satırdan kalkar', async () => {
    const istekler = sunucuKur({
      kullanici: YONETICI,
      yazma: () => json(200, { ...AYSE, roller: [] } satisfies KisiOzeti),
    });
    ac();
    fireEvent.click(await screen.findByRole('button', { name: 'Ayşe Deneme rollerini düzenle' }));
    const pencere = within(await screen.findByRole('dialog'));
    fireEvent.click(await pencere.findByRole('button', { name: 'Operatör rolünü al' }));

    await waitFor(() => expect(pencere.queryByRole('button', { name: 'Operatör rolünü al' })).toBeNull());
    expect(istekler.find((i) => i.yol === '/kisiler/10/rol-al')?.govde).toEqual({ rolId: 2, surum: 1 });
    expect(await pencere.findByText('Bu kişinin rolü yok.')).toBeTruthy();
    expect(await screen.findByText('Rol alındı.')).toBeTruthy();
  });

  it('sunucu reddederse sunucunun iletisi gösterilir ve rol yerinde kalır', async () => {
    const red = { kod: 'GECERSIZ', mesaj: 'Girişi olan kişinin en az bir rolü olmalı.' } satisfies HataGovdesi;
    sunucuKur({ kullanici: YONETICI, yazma: () => json(422, red) });
    ac();
    fireEvent.click(await screen.findByRole('button', { name: 'Ayşe Deneme rollerini düzenle' }));
    const pencere = within(await screen.findByRole('dialog'));
    fireEvent.click(await pencere.findByRole('button', { name: 'Operatör rolünü al' }));

    expect((await screen.findByRole('alert')).textContent).toBe(red.mesaj);
    expect(pencere.getByRole('button', { name: 'Operatör rolünü al' })).toBeTruthy();
  });

  const BEN: KisiOzeti = {
    id: YONETICI.id, ad: 'Deneme Yönetici', aktif: true, girisVar: true, kullaniciAdi: 'deneme.yonetici', pinVar: false, sicilNo: null, gorev: null, surum: 1, ozlukIk: false, ozlukCikisTarihi: null,
    roller: [{ id: 2, ad: 'Operatör', yonetici: false }, { id: 4, ad: 'Rol Yönetimi', yonetici: false }],
  };
  const sayac = (istekler: { yol: string }[], yol: string) => istekler.filter((i) => i.yol === yol).length;

  it('kendi rolü değişen kullanıcıda oturum yeniden okunur; düğmeler yeni işlemlere göre çizilir', async () => {
    let rolAlindi = false;
    const istekler = sunucuKur({
      kullanici: () => (rolAlindi ? OKUYUCU : YONETICI),
      kisiler: [BEN, AYSE],
      yazma: () => {
        rolAlindi = true;
        return json(200, { ...BEN, roller: [BEN.roller[0]!] } satisfies KisiOzeti);
      },
    });
    ac();
    fireEvent.click(await screen.findByRole('button', { name: 'Deneme Yönetici rollerini düzenle' }));
    const pencere = within(await screen.findByRole('dialog'));
    await waitFor(() => expect(sayac(istekler, '/oturum')).toBe(1));
    fireEvent.click(await pencere.findByRole('button', { name: 'Rol Yönetimi rolünü al' }));

    await waitFor(() => expect(sayac(istekler, '/oturum')).toBe(2));
    await waitFor(() => expect(screen.queryByRole('button', { name: /rollerini düzenle/ })).toBeNull());
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('başkasının rolü değişince oturum yeniden okunmaz; düğmeler yerinde kalır', async () => {
    const istekler = sunucuKur({
      kullanici: YONETICI,
      kisiler: [BEN, AYSE],
      yazma: () => json(200, { ...AYSE, roller: [] } satisfies KisiOzeti),
    });
    ac();
    fireEvent.click(await screen.findByRole('button', { name: 'Ayşe Deneme rollerini düzenle' }));
    const pencere = within(await screen.findByRole('dialog'));
    fireEvent.click(await pencere.findByRole('button', { name: 'Operatör rolünü al' }));
    await pencere.findByText('Bu kişinin rolü yok.');
    await new Promise((coz) => setTimeout(coz, 30));

    expect(sayac(istekler, '/oturum')).toBe(1);
    expect(screen.getByRole('button', { name: 'Deneme Yönetici rollerini düzenle' })).toBeTruthy();
  });

  describe('bayraklı rol alma onayı', () => {
    const MUDUR: KisiOzeti = {
      id: 12, ad: 'Veli Deneme', aktif: true, girisVar: true, kullaniciAdi: 'veli.deneme', pinVar: false, sicilNo: null, gorev: null, surum: 1, ozlukIk: false, ozlukCikisTarihi: null,
      roller: [{ id: 3, ad: 'Yönetici', yonetici: true }, { id: 2, ad: 'Operatör', yonetici: false }],
    };
    const ONAY = 'Rol alınsın mı?';
    const alinan = (istekler: { yol: string }[]) => istekler.filter((i) => i.yol.endsWith('/rol-al'));

    async function bayrakliyiAl(istekler: { yol: string }[]) {
      fireEvent.click(await screen.findByRole('button', { name: 'Veli Deneme rollerini düzenle' }));
      const pencere = within(await screen.findByRole('dialog'));
      fireEvent.click(await pencere.findByRole('button', { name: 'Yönetici rolünü al' }));
      const onay = within(await screen.findByRole('dialog', { name: ONAY }));
      expect(alinan(istekler)).toHaveLength(0);
      return { pencere, onay };
    }

    it('bayraklı rolde onay penceresi çıkar; vazgeçilirse istek gitmez, rol kalır', async () => {
      const istekler = sunucuKur({ kullanici: YONETICI, kisiler: [MUDUR], yazma: () => json(200, MUDUR) });
      ac();
      const { pencere, onay } = await bayrakliyiAl(istekler);
      expect(onay.getByText('Bu rol bütün yetkileri verir. Veli Deneme kişisinden alınsın mı?')).toBeTruthy();

      fireEvent.click(onay.getByRole('button', { name: 'Vazgeç' }));
      await waitFor(() => expect(screen.queryByRole('dialog', { name: ONAY })).toBeNull());
      expect(alinan(istekler)).toHaveLength(0);
      expect(pencere.getByRole('button', { name: 'Yönetici rolünü al' })).toBeTruthy();
    });

    it('onaylanınca istek gider ve rol alınır', async () => {
      const istekler = sunucuKur({
        kullanici: YONETICI,
        kisiler: [MUDUR],
        yazma: () => json(200, { ...MUDUR, roller: [MUDUR.roller[1]!] } satisfies KisiOzeti),
      });
      ac();
      const { pencere, onay } = await bayrakliyiAl(istekler);
      fireEvent.click(onay.getByRole('button', { name: 'Rolü al' }));

      await waitFor(() => expect(alinan(istekler)).toHaveLength(1));
      expect(alinan(istekler)[0]).toMatchObject({ yol: '/kisiler/12/rol-al', govde: { rolId: 3, surum: 1 } });
      await waitFor(() => expect(pencere.queryByRole('button', { name: 'Yönetici rolünü al' })).toBeNull());
      await waitFor(() => expect(screen.queryByRole('dialog', { name: ONAY })).toBeNull());
    });

    it('bayraksız rolde pencere çıkmaz, tek dokunuşla alınır', async () => {
      const istekler = sunucuKur({
        kullanici: YONETICI,
        kisiler: [MUDUR],
        yazma: () => json(200, { ...MUDUR, roller: [MUDUR.roller[0]!] } satisfies KisiOzeti),
      });
      ac();
      fireEvent.click(await screen.findByRole('button', { name: 'Veli Deneme rollerini düzenle' }));
      const pencere = within(await screen.findByRole('dialog'));
      fireEvent.click(await pencere.findByRole('button', { name: 'Operatör rolünü al' }));

      await waitFor(() => expect(alinan(istekler)).toHaveLength(1));
      expect(screen.queryByRole('dialog', { name: ONAY })).toBeNull();
    });
  });

  it('sunucuya ulaşılamazsa nedeni ve yeniden denemeyi yazar', async () => {
    sunucuKur({ kullanici: YONETICI, yazma: () => { throw new TypeError('Failed to fetch'); } });
    ac();
    fireEvent.click(await screen.findByRole('button', { name: 'Ayşe Deneme rollerini düzenle' }));
    const pencere = within(await screen.findByRole('dialog'));
    fireEvent.click(await pencere.findByRole('button', { name: 'Operatör rolünü al' }));
    expect((await screen.findByRole('alert')).textContent).toBe(ULASILAMADI_ILETISI);
  });

  describe('Ctrl K isteği (kart #1236)', () => {
    // Zorunlu alanın etiketi yıldızla biter; ad baştan eşlenir.
    const etiketli = (ad: string) => new RegExp(`^${ad}`);
    const YAZAR: Kullanici = { id: 3, ad: 'Deneme Yazar', islemler: ['kisiler.oku', 'kisiler.yaz', 'sayfa.personel'] };

    it('?kisi=<id> yazabilene o kişinin düzenleme formunu dolu açar', async () => {
      sunucuKur({ kullanici: YAZAR, kisiler: [{ ...AYSE, sicilNo: 'S-1', gorev: 'Tornacı' }, MEHMET] });
      ac('/personel?kisi=10');
      const pencere = within(await screen.findByRole('dialog', { name: 'Düzenle: Ayşe Deneme' }));
      expect((pencere.getByLabelText(etiketli('Ad')) as HTMLInputElement).value).toBe('Ayşe Deneme');
      expect((pencere.getByLabelText(etiketli('Sicil no')) as HTMLInputElement).value).toBe('S-1');
      expect((pencere.getByLabelText(etiketli('Görev')) as HTMLInputElement).value).toBe('Tornacı');
    });

    it('?yeni=1 boş kişi formunu açar', async () => {
      sunucuKur({ kullanici: YAZAR });
      ac('/personel?yeni=1');
      const pencere = within(await screen.findByRole('dialog', { name: 'Kişi ekle' }));
      expect((pencere.getByLabelText(etiketli('Ad')) as HTMLInputElement).value).toBe('');
    });

    it('reddedilen: yazamayana pencere açılmaz, liste görünür', async () => {
      sunucuKur({ kullanici: OKUYUCU });
      ac('/personel?kisi=10');
      await screen.findByText('Ayşe Deneme');
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
      cleanup();
      sunucuKur({ kullanici: OKUYUCU });
      ac('/personel?yeni=1');
      await screen.findByText('Ayşe Deneme');
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    });

    it('bilinmeyen kişide pencere açılmaz', async () => {
      sunucuKur({ kullanici: YAZAR });
      ac('/personel?kisi=999');
      await screen.findByText('Ayşe Deneme');
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    });

    it('?gorunum=matris yalnız rol yönetene matrisi açar', async () => {
      sunucuKur({ kullanici: OKUYUCU });
      ac('/personel?gorunum=matris');
      await screen.findByText('Ayşe Deneme');
      expect(screen.queryByRole('tab', { name: /Yetki matrisi/ })).toBeNull();
    });
  });
});
