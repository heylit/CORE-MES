import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { json, OKUYAN, rrAc, sunucuKur, YONETICI, type Istek } from '../test-ortak.tsx';
import { adimOrnegi, revizyonOrnegi, rotaDurumu } from './test-veri.ts';
import { ESKI_SURUM_EKI } from './useRotaDuzeni.ts';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); try { localStorage.clear(); } catch { /* test ortamında depo yoksa */ } });

// Kayıt 800 ms sonra gider: bekleme süresi ondan uzun.
const BEKLE = { timeout: 4000 };
const rotaYazmalari = (istekler: readonly Istek[]) => istekler.filter((i) => i.yontem === 'POST' && /^\/rota\/(urunler|revizyonlar)\//.test(i.yol));
const bolumAc = async () => {
  const bolge = await screen.findByRole('region', { name: 'Ürün ve rotalar' });
  await waitFor(() => { expect(bolge.querySelector('[data-parca="R1"]')).not.toBeNull(); });
  return bolge;
};

// 2558 b/4: ürün listesi, yeni rota ve tam ekran ⋯ menüsündedir.
const menuSec = (bolge: HTMLElement, ad: string) => {
  fireEvent.click(within(bolge).getByRole('button', { name: 'Diğer rota işlemleri' }));
  fireEvent.click(screen.getByRole('menuitem', { name: ad }));
};

// Görünüm tercihi tarayıcı deposunda kalır; tabloya geçen test şemaya döner ki sonraki test dosyaları şemayla açılsın.
const tabloyuKapat = (bolge: HTMLElement) => { fireEvent.click(within(bolge).getByRole('button', { name: /Akış şeması/ })); };

describe('R1 Ürün ve rotalar: izinli', () => {
  it('tam ekran düğmesi şemada ve tabloda durur; "Tam ekrandan çık" ve Esc tam ekrandan çıkarır (B-2482-R3)', async () => {
    sunucuKur(YONETICI, { durum: () => json(200, rotaDurumu()) });
    rrAc('/recete-rota/schema');
    const bolge = await bolumAc();
    const kok = () => bolge.querySelector('[data-parca="R1"]')!;
    menuSec(bolge, 'Tam ekranda aç (F)');
    expect(kok().classList.contains('tc-rr1-tam')).toBe(true);
    fireEvent.click(within(bolge).getByRole('button', { name: /Akış tablosu/ }));
    fireEvent.click(within(bolge).getByRole('button', { name: 'Tam ekrandan çık' }));
    expect(kok().classList.contains('tc-rr1-tam')).toBe(false);
    menuSec(bolge, 'Tam ekranda aç (F)');
    expect(kok().classList.contains('tc-rr1-tam')).toBe(true);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(kok().classList.contains('tc-rr1-tam')).toBe(false);
    tabloyuKapat(bolge);
  });

  it('F tam ekranı şemada ve tabloda açıp kapatır; alana yazarken F tam ekranı değiştirmez (B-2482-2)', async () => {
    sunucuKur(YONETICI, { durum: () => json(200, rotaDurumu()) });
    rrAc('/recete-rota/schema');
    const bolge = await bolumAc();
    const kok = () => bolge.querySelector('[data-parca="R1"]')!;
    fireEvent.keyDown(within(bolge).getByRole('button', { name: 'OP 10 Tornalama' }), { key: 'f' });
    expect(kok().classList.contains('tc-rr1-tam')).toBe(true);
    fireEvent.keyDown(within(bolge).getByRole('button', { name: 'OP 10 Tornalama' }), { key: 'F' });
    expect(kok().classList.contains('tc-rr1-tam')).toBe(false);
    fireEvent.click(within(bolge).getByRole('button', { name: /Akış tablosu/ }));
    const alan = await within(bolge).findByLabelText(/HM-0012 miktarı/);
    fireEvent.keyDown(alan, { key: 'f' });
    expect(kok().classList.contains('tc-rr1-tam')).toBe(false);
    fireEvent.keyDown(alan.closest('.tc-rr1-frow')!, { key: 'f' });
    expect(kok().classList.contains('tc-rr1-tam')).toBe(true);
    fireEvent.keyDown(kok(), { key: 'f' });
    expect(kok().classList.contains('tc-rr1-tam')).toBe(false);
    tabloyuKapat(bolge);
  });

  it('akış tablosunda adım satırının boş yerine tıklayınca düzenleme paneli açılır; satırdaki alan ve düğme adımı seçmez (B-2482-1)', async () => {
    sunucuKur(YONETICI, { durum: () => json(200, rotaDurumu()) });
    rrAc('/recete-rota/schema');
    const bolge = await bolumAc();
    fireEvent.click(within(bolge).getByRole('button', { name: /Akış tablosu/ }));
    const alan = await within(bolge).findByLabelText(/HM-0012 miktarı/);
    const satir = alan.closest('.tc-rr1-frow')!;
    const secili = () => satir.querySelector('.tc-rr1-fstep')?.classList.contains('tc-rr1-secili') ?? false;
    fireEvent.click(alan);
    fireEvent.click(within(bolge).getByLabelText('Operasyon'));
    expect(secili()).toBe(false);
    fireEvent.click(satir.querySelector('.tc-rr1-fst')!);
    expect(secili()).toBe(true);
    const panel = within(bolge).getByRole('complementary', { name: 'Düzenleme paneli' });
    expect(panel.textContent).toContain('Nerede yapılır');
    tabloyuKapat(bolge);
  });

  it('akış tablosunda giren miktarı boşaltılınca "zorunlu" iletisi çıkar, 0 gönderilmez; geçerli miktar kaydedilir (B-2484-6)', async () => {
    let durum = rotaDurumu();
    let kaydet: unknown = null;
    const istekler = sunucuKur(YONETICI, {
      durum: () => json(200, durum),
      yazmalar: {
        'POST /rota/urunler/11/taslak-ac': () => {
          durum = rotaDurumu([revizyonOrnegi('71', 'A', 'yururlukte', 3), revizyonOrnegi('72', 'B', 'taslak', 1)]);
          return json(200, { id: 72, durum: 'taslak', surum: 1 });
        },
        'POST /rota/revizyonlar/72/kaydet': (g) => { kaydet = g; return json(200, { id: 72, durum: 'taslak', surum: 2 }); },
      },
    });
    rrAc('/recete-rota/schema');
    const bolge = await bolumAc();
    fireEvent.click(within(bolge).getByRole('button', { name: /Akış tablosu/ }));
    const alan = await within(bolge).findByLabelText(/HM-0012 miktarı/);
    fireEvent.change(alan, { target: { value: '' } });
    fireEvent.blur(alan);
    expect((await within(bolge).findByRole('alert')).textContent).toBe('Miktar zorunlu.');
    fireEvent.change(alan, { target: { value: '0' } });
    fireEvent.blur(alan);
    expect((await within(bolge).findByRole('alert')).textContent).toBe('Sıfırdan büyük olmalı.');
    await new Promise((r) => { setTimeout(r, 1000); });
    expect(rotaYazmalari(istekler)).toEqual([]);

    fireEvent.change(alan, { target: { value: '3' } });
    fireEvent.blur(alan);
    await waitFor(() => { expect(kaydet).not.toBeNull(); }, BEKLE);
    expect(JSON.stringify(kaydet)).toContain('"bilesenler":[{"malzemeId":12,"miktar":3,');
    tabloyuKapat(bolge);
  });

  it('açılışta yazma yok; adımın hazırlık süresi değişince taslak açılır ve rota modülüne kaydedilir', async () => {
    let durum = rotaDurumu();
    let kaydet: unknown = null;
    const istekler = sunucuKur(YONETICI, {
      durum: () => json(200, durum),
      yazmalar: {
        'POST /rota/urunler/11/taslak-ac': () => {
          durum = rotaDurumu([revizyonOrnegi('71', 'A', 'yururlukte', 3), revizyonOrnegi('72', 'B', 'taslak', 1)]);
          return json(200, { id: 72, durum: 'taslak', surum: 1 });
        },
        'POST /rota/revizyonlar/72/kaydet': (g) => { kaydet = g; return json(200, { id: 72, durum: 'taslak', surum: 2 }); },
      },
    });
    rrAc('/recete-rota/schema');
    const bolge = await bolumAc();
    const kutu = await within(bolge).findByRole('button', { name: 'OP 10 Tornalama' });
    expect(within(bolge).getByText('HM-0012')).toBeTruthy();
    expect(rotaYazmalari(istekler)).toEqual([]);

    fireEvent.click(kutu);
    const panel = within(bolge).getByRole('complementary', { name: 'Düzenleme paneli' });
    const hazirlik = within(panel).getByLabelText('Hazırlık (dk / parti)');
    fireEvent.change(hazirlik, { target: { value: '45' } });
    fireEvent.blur(hazirlik);

    await waitFor(() => { expect(kaydet).not.toBeNull(); }, BEKLE);
    const [ac] = rotaYazmalari(istekler);
    expect(ac?.yol).toBe('/rota/urunler/11/taslak-ac');
    expect(ac?.govde).toEqual({ kaynak: { tur: 'revizyon', revizyonId: 71 } });
    // Bölümü olmayan kayıtlı 30 dk ayardır (1310 a): hazırlık 45 girilince toplam 75 olur.
    expect(kaydet).toMatchObject({ surum: 1, adimlar: [{
      opNo: 10, operasyonTipiId: 21, ayarSuresiDk: 75, hazirlikDk: 45, ayar: true, ayarDk: 30, islemSuresiDk: 5, bilesenler: [{ malzemeId: 12, miktar: 2, fireYuzde: 0 }],
    }] });
  }, 30000);

  it('1409 a: dal çarpanı dal etiketinde ayrı gösterilir; giren miktarı mamul başına kalır', async () => {
    const adimlar = [
      adimOrnegi({ dal: 'A', adetCarpani: 2 }),
      adimOrnegi({ id: 'o20', seq: 20, opNo: 20, dal: 'B', ins: [] }),
      adimOrnegi({ id: 'o30', seq: 30, opNo: 30, birlesen: ['A', 'B'], ins: [] }),
    ];
    sunucuKur(OKUYAN, { durum: rotaDurumu([revizyonOrnegi('71', 'A', 'yururlukte', 3, adimlar)]) });
    rrAc('/recete-rota/schema');
    const bolge = await bolumAc();
    await within(bolge).findByRole('button', { name: 'OP 10 Tornalama' });
    const etiketler = [...bolge.querySelectorAll('.tc-rr1-daletiket')].map((e) => e.textContent?.trim());
    // 2558 b/3: kol sütunundaki adımda dal etiketi tekrar edilmez; dal ve çarpanı kol başlığındadır. Birleşme adımı etiketini taşır.
    expect(etiketler).toEqual(['birleşir: A, B']);
    expect(within(bolge).getByRole('group', { name: 'Dal A kolu' }).textContent).toContain('1 mamul için 2 adet');
    // Bir mamul için giren 2 kg; çarpan girenin miktarını büyütmez.
    const giren = within(bolge).getAllByText('HM-0012')[0]?.closest('.tc-rr1-cip');
    expect(giren?.querySelector('.tc-rr1-cq')?.textContent).toMatch(/^2/);
  }, 30000);

  it('açık taslak onaya gönderilir; giren eksik rota onaya gitmez', async () => {
    const tam = rotaDurumu([revizyonOrnegi('71', 'A', 'yururlukte', 3), revizyonOrnegi('72', 'B', 'taslak', 4)]);
    const istekler = sunucuKur(YONETICI, {
      durum: tam,
      yazmalar: { 'POST /rota/revizyonlar/72/onaya-gonder': () => json(200, { id: 72, durum: 'onay', surum: 5 }) },
    });
    rrAc('/recete-rota/schema');
    const bolge = await bolumAc();
    fireEvent.click(await within(bolge).findByRole('button', { name: 'Onaya gönder…' }));
    fireEvent.click(within(bolge).getByRole('button', { name: 'Onaya gönder' }));
    await waitFor(() => { expect(istekler.some((i) => i.yol === '/rota/revizyonlar/72/onaya-gonder')).toBe(true); });
    expect(istekler.find((i) => i.yol === '/rota/revizyonlar/72/onaya-gonder')?.govde).toEqual({ surum: 4 });
    await screen.findByText(/Rev B onaya gönderildi/);
  }, 30000);

  it('1210 b: arkasında GKK olmayan fason adımı uyarılır, onaya gönderme durmaz', async () => {
    const fasonlu = rotaDurumu([revizyonOrnegi('72', 'B', 'taslak', 4, [
      adimOrnegi(), adimOrnegi({ id: 'o20', seq: 20, opNo: 20, stationId: null, fasonId: '7', setup: null, proc: null, cycle: null, terminGun: 3, ins: [] }),
    ])]);
    const istekler = sunucuKur(YONETICI, {
      durum: fasonlu,
      yazmalar: { 'POST /rota/revizyonlar/72/onaya-gonder': () => json(200, { id: 72, durum: 'onay', surum: 5 }) },
    });
    rrAc('/recete-rota/schema');
    const bolge = await bolumAc();
    expect((await within(bolge).findByText(/Fason dönüşünde GKK yok: OP 20/)).textContent).toContain('otomatik GKK');
    fireEvent.click(within(bolge).getByRole('button', { name: 'Onaya gönder…' }));
    fireEvent.click(within(bolge).getByRole('button', { name: 'Onaya gönder' }));
    await waitFor(() => { expect(istekler.some((i) => i.yol === '/rota/revizyonlar/72/onaya-gonder')).toBe(true); });
  }, 30000);

  it('giren eksik taslak onaya gönderilmez, eksik söylenir', async () => {
    const eksik = rotaDurumu([revizyonOrnegi('72', 'B', 'taslak', 4, [adimOrnegi({ ins: [] })])]);
    const istekler = sunucuKur(YONETICI, { durum: eksik });
    rrAc('/recete-rota/schema');
    const bolge = await bolumAc();
    fireEvent.click(await within(bolge).findByRole('button', { name: 'Onaya gönder…' }));
    fireEvent.click(within(bolge).getByRole('button', { name: 'Onaya gönder' }));
    await screen.findByText(/Rota eksik, onaya gönderilmedi/);
    expect(rotaYazmalari(istekler)).toEqual([]);
  }, 30000);

  it('başkası arada değiştirdiyse yerel taslak atılır ve ileti söylenir', async () => {
    const durum = rotaDurumu([revizyonOrnegi('71', 'A', 'yururlukte', 3), revizyonOrnegi('72', 'B', 'taslak', 1)]);
    sunucuKur(YONETICI, {
      durum,
      yazmalar: {
        'POST /rota/revizyonlar/72/kaydet': () => json(409, { kod: 'CAKISMA', mesaj: 'Kayıt başka yerde değişti.', ayrinti: { neden: 'eski-surum' } }),
      },
    });
    rrAc('/recete-rota/schema');
    const bolge = await bolumAc();
    fireEvent.click(await within(bolge).findByRole('button', { name: 'OP 10 Tornalama' }));
    const islem = within(bolge).getByLabelText('İşlem (dk / 1 adet)');
    fireEvent.change(islem, { target: { value: '7' } });
    fireEvent.blur(islem);
    await screen.findByText(new RegExp(ESKI_SURUM_EKI), {}, BEKLE);
  }, 30000);

  it('ürün listesinden seçilen ürün şemada açılır', async () => {
    sunucuKur(YONETICI, { durum: rotaDurumu() });
    rrAc('/recete-rota/schema');
    const bolge = await bolumAc();
    menuSec(bolge, 'Ürün listesi');
    const tablo = await within(bolge).findByRole('table', { name: 'Ürünler ve rotaları' });
    fireEvent.click(within(tablo).getByText('MM-0001'));
    await within(bolge).findByRole('button', { name: 'OP 10 Tornalama' });
  }, 30000);
});

describe('R1 Ürün ve rotalar: geri gönderme nedeni (ROT-3)', () => {
  it('onaylayan nedeni yazmadan geri gönderemez; neden sahibine gider ve taslakta görünür', async () => {
    let durum = rotaDurumu([revizyonOrnegi('71', 'A', 'yururlukte', 3), revizyonOrnegi('72', 'B', 'onay', 2)]);
    const istekler = sunucuKur(YONETICI, {
      durum: () => json(200, durum),
      yazmalar: {
        'POST /rota/revizyonlar/72/geri-gonder': () => {
          durum = rotaDurumu([revizyonOrnegi('71', 'A', 'yururlukte', 3), { ...revizyonOrnegi('72', 'B', 'taslak', 3), geriGondermeNedeni: 'Ayar süresini kontrol et.' }]);
          return json(200, { id: 72, durum: 'taslak', surum: 3 });
        },
      },
    });
    rrAc('/recete-rota/schema');
    const bolge = await bolumAc();
    fireEvent.click(await within(bolge).findByRole('button', { name: 'Onayla…' }));
    const geri = within(bolge).getByRole('button', { name: 'Düzeltmeye geri gönder' }) as HTMLButtonElement;
    expect(geri.disabled).toBe(true);
    fireEvent.change(within(bolge).getByLabelText('Geri gönderme nedeni'), { target: { value: '  Ayar süresini kontrol et. ' } });
    expect(geri.disabled).toBe(false);
    fireEvent.click(geri);
    await waitFor(() => { expect(rotaYazmalari(istekler)).toHaveLength(1); });
    expect(rotaYazmalari(istekler)[0]).toMatchObject({ yol: '/rota/revizyonlar/72/geri-gonder', govde: { surum: 2, neden: 'Ayar süresini kontrol et.' } });
    expect(await within(bolge).findByText('Rev B onaydan düzeltmeye geri gönderildi: Ayar süresini kontrol et.')).toBeTruthy();
  }, 30000);
});

describe('R1 Ürün ve rotalar: reddedilen', () => {
  it('rota yazma işlemi olmayan düzenleme düğmelerini görmez, alanlar kapalı, istek gitmez', async () => {
    const istekler = sunucuKur(OKUYAN, { durum: rotaDurumu() });
    rrAc('/recete-rota/schema');
    const bolge = await bolumAc();
    fireEvent.click(await within(bolge).findByRole('button', { name: 'OP 10 Tornalama' }));
    expect(within(bolge).queryByRole('button', { name: 'Yeni rota' })).toBeNull();
    // 2558 b/5: yazma yetkisi olmayan "Düzenle"yi görmez.
    expect(within(bolge).queryByRole('button', { name: 'Düzenle' })).toBeNull();
    expect(within(bolge).queryByRole('button', { name: 'OP 10 sil' })).toBeNull();
    expect(within(bolge).queryByRole('button', { name: /Giren$/ })).toBeNull();
    expect(within(bolge).queryByRole('button', { name: 'Onaya gönder…' })).toBeNull();
    expect((within(bolge).getByLabelText('Hazırlık (dk / parti)') as HTMLInputElement).disabled).toBe(true);
    expect(istekler.filter((i) => i.yontem === 'POST')).toEqual([]);
  }, 30000);

  it('3165 a: düzenleme, onaya gönderme ve taslak açma ayrı eylemdir; her düğme kendi eylemine bağlıdır', async () => {
    const ile = (...islemler: string[]) => ({ ...OKUYAN, islemler: [...OKUYAN.islemler, ...islemler] as typeof OKUYAN.islemler });
    const acikTaslak = rotaDurumu([revizyonOrnegi('71', 'A', 'yururlukte', 3), revizyonOrnegi('72', 'B', 'taslak', 4)]);
    const hazirlikKapali = async (bolge: HTMLElement) => {
      fireEvent.click(await within(bolge).findByRole('button', { name: 'OP 10 Tornalama' }));
      const duzenle = within(bolge).queryByRole('button', { name: 'Düzenle' });
      if (duzenle && duzenle.getAttribute('aria-pressed') !== 'true') fireEvent.click(duzenle);
      return (within(bolge).getByLabelText('Hazırlık (dk / parti)') as HTMLInputElement).disabled;
    };
    // Yalnız düzenleyen: açık taslağı düzenler, onaya gönderemez, yeni rota açamaz.
    sunucuKur(ile('rota.revizyon-yaz'), { durum: acikTaslak });
    rrAc('/recete-rota/schema');
    let bolge = await bolumAc();
    expect(await hazirlikKapali(bolge)).toBe(false);
    expect(within(bolge).queryByRole('button', { name: 'Onaya gönder…' })).toBeNull();
    expect(within(bolge).queryByRole('button', { name: 'Yeni rota' })).toBeNull();
    cleanup();
    // Yalnız düzenleyen, açık taslak yok: ilk düzenleme taslak açacağı için alan kapalıdır.
    sunucuKur(ile('rota.revizyon-yaz'), { durum: rotaDurumu() });
    rrAc('/recete-rota/schema');
    bolge = await bolumAc();
    expect(await hazirlikKapali(bolge)).toBe(true);
    cleanup();
    // Yalnız onaya gönderen: düğmeyi görür, alanlar kapalıdır.
    sunucuKur(ile('rota.onaya-gonder'), { durum: acikTaslak });
    rrAc('/recete-rota/schema');
    bolge = await bolumAc();
    expect(await within(bolge).findByRole('button', { name: 'Onaya gönder…' })).toBeTruthy();
    expect(await hazirlikKapali(bolge)).toBe(true);
    cleanup();
    // Bölünmüş eski anahtar hiçbir düğmeyi açmaz.
    sunucuKur(ile('rota.yaz'), { durum: acikTaslak });
    rrAc('/recete-rota/schema');
    bolge = await bolumAc();
    expect(await hazirlikKapali(bolge)).toBe(true);
    expect(within(bolge).queryByRole('button', { name: 'Onaya gönder…' })).toBeNull();
  }, 30000);

  it('3165 a: taslak açma eylemi olmayan, açık taslağı da olmayan Düzenle ve Excel görmez; kopyala, yeni rota ve Rev\'den taslak kendi eylemine bağlıdır', async () => {
    const ile = (...islemler: string[]) => ({ ...OKUYAN, islemler: [...OKUYAN.islemler, ...islemler] as typeof OKUYAN.islemler });
    const menu = (bolge: HTMLElement): string[] => {
      fireEvent.click(within(bolge).getByRole('button', { name: 'Diğer rota işlemleri' }));
      const adlar = screen.queryAllByRole('menuitem').map((m) => m.textContent?.trim() ?? '');
      fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
      return adlar;
    };
    const revizyonPaneli = async (bolge: HTMLElement) => {
      await within(bolge).findByRole('button', { name: 'OP 10 Tornalama' });
      fireEvent.click(within(bolge).getByRole('button', { name: 'Revizyon' }));
    };
    // Yalnız düzenleyen, açık taslak yok: Düzenle ve Excel yok (sunucu taslak açmayı reddeder).
    sunucuKur(ile('rota.revizyon-yaz'), { durum: rotaDurumu() });
    rrAc('/recete-rota/schema');
    let bolge = await bolumAc();
    await revizyonPaneli(bolge);
    expect(within(bolge).queryByRole('button', { name: 'Düzenle' })).toBeNull();
    expect(menu(bolge)).not.toContain('Excel ile rota adımları');
    expect(within(bolge).queryByRole('button', { name: 'Rotayı başka ürüne kopyala' })).toBeNull();
    expect(within(bolge).queryByRole('button', { name: "Rev A'dan yeni taslak aç" })).toBeNull();
    cleanup();
    // Yalnız düzenleyen, açık taslak var: Düzenle ve Excel var; kopyala ve yeni rota yok.
    sunucuKur(ile('rota.revizyon-yaz'), { durum: rotaDurumu([revizyonOrnegi('71', 'A', 'yururlukte', 3), revizyonOrnegi('72', 'B', 'taslak', 4)]) });
    rrAc('/recete-rota/schema');
    bolge = await bolumAc();
    await revizyonPaneli(bolge);
    expect(within(bolge).getByRole('button', { name: 'Düzenle' })).toBeTruthy();
    const adlar = menu(bolge);
    expect(adlar).toContain('Excel ile rota adımları');
    expect(adlar).not.toContain('Yeni rota');
    expect(within(bolge).queryByRole('button', { name: 'Rotayı başka ürüne kopyala' })).toBeNull();
    cleanup();
    // Yalnız taslak açan: Rev'den yeni taslak açar; Düzenle, kopyala, yeni rota yok.
    sunucuKur(ile('rota.taslak-ac'), { durum: rotaDurumu() });
    rrAc('/recete-rota/schema');
    bolge = await bolumAc();
    await revizyonPaneli(bolge);
    expect(within(bolge).getByRole('button', { name: "Rev A'dan yeni taslak aç" })).toBeTruthy();
    expect(within(bolge).queryByRole('button', { name: 'Düzenle' })).toBeNull();
    expect(within(bolge).queryByRole('button', { name: 'Rotayı başka ürüne kopyala' })).toBeNull();
    expect(menu(bolge)).not.toContain('Yeni rota');
    cleanup();
    // İkisi birlikte: Düzenle, Excel, yeni rota ve kopyala açılır.
    sunucuKur(ile('rota.revizyon-yaz', 'rota.taslak-ac'), { durum: rotaDurumu() });
    rrAc('/recete-rota/schema');
    bolge = await bolumAc();
    await revizyonPaneli(bolge);
    expect(within(bolge).getByRole('button', { name: 'Düzenle' })).toBeTruthy();
    expect(within(bolge).getByRole('button', { name: 'Rotayı başka ürüne kopyala' })).toBeTruthy();
    expect(menu(bolge)).toEqual(expect.arrayContaining(['Yeni rota', 'Excel ile rota adımları']));
  }, 30000);

  it('onay işlemi olmayan onay bekleyen revizyonu onaylayamaz', async () => {
    sunucuKur({ ...YONETICI, islemler: YONETICI.islemler.filter((i) => i !== 'rota.onayla') }, {
      durum: rotaDurumu([revizyonOrnegi('72', 'B', 'onay', 2)]),
    });
    rrAc('/recete-rota/schema');
    const bolge = await bolumAc();
    await within(bolge).findByRole('button', { name: 'OP 10 Tornalama' });
    expect(within(bolge).queryByRole('button', { name: 'Onayla…' })).toBeNull();
  }, 30000);
});
