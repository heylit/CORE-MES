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

describe('R1 Ürün ve rotalar: izinli', () => {
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
  });

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
  });

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
  });

  it('giren eksik taslak onaya gönderilmez, eksik söylenir', async () => {
    const eksik = rotaDurumu([revizyonOrnegi('72', 'B', 'taslak', 4, [adimOrnegi({ ins: [] })])]);
    const istekler = sunucuKur(YONETICI, { durum: eksik });
    rrAc('/recete-rota/schema');
    const bolge = await bolumAc();
    fireEvent.click(await within(bolge).findByRole('button', { name: 'Onaya gönder…' }));
    fireEvent.click(within(bolge).getByRole('button', { name: 'Onaya gönder' }));
    await screen.findByText(/Rota eksik, onaya gönderilmedi/);
    expect(rotaYazmalari(istekler)).toEqual([]);
  });

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
  });

  it('ürün listesinden seçilen ürün şemada açılır', async () => {
    sunucuKur(YONETICI, { durum: rotaDurumu() });
    rrAc('/recete-rota/schema');
    const bolge = await bolumAc();
    fireEvent.click(within(bolge).getByRole('button', { name: 'Ürün listesi' }));
    const tablo = await within(bolge).findByRole('table', { name: 'Ürünler ve rotaları' });
    fireEvent.click(within(tablo).getByText('MM-0001'));
    await within(bolge).findByRole('button', { name: 'OP 10 Tornalama' });
  });
});

describe('R1 Ürün ve rotalar: reddedilen', () => {
  it('rota yazma işlemi olmayan düzenleme düğmelerini görmez, alanlar kapalı, istek gitmez', async () => {
    const istekler = sunucuKur(OKUYAN, { durum: rotaDurumu() });
    rrAc('/recete-rota/schema');
    const bolge = await bolumAc();
    fireEvent.click(await within(bolge).findByRole('button', { name: 'OP 10 Tornalama' }));
    expect(within(bolge).queryByRole('button', { name: 'Yeni rota' })).toBeNull();
    expect(within(bolge).queryByRole('button', { name: 'OP 10 sil' })).toBeNull();
    expect(within(bolge).queryByRole('button', { name: /Giren$/ })).toBeNull();
    expect(within(bolge).queryByRole('button', { name: 'Onaya gönder…' })).toBeNull();
    expect((within(bolge).getByLabelText('Hazırlık (dk / parti)') as HTMLInputElement).disabled).toBe(true);
    expect(istekler.filter((i) => i.yontem === 'POST')).toEqual([]);
  });

  it('onay işlemi olmayan onay bekleyen revizyonu onaylayamaz', async () => {
    sunucuKur({ ...YONETICI, islemler: YONETICI.islemler.filter((i) => i !== 'rota.onayla') }, {
      durum: rotaDurumu([revizyonOrnegi('72', 'B', 'onay', 2)]),
    });
    rrAc('/recete-rota/schema');
    const bolge = await bolumAc();
    await within(bolge).findByRole('button', { name: 'OP 10 Tornalama' });
    expect(within(bolge).queryByRole('button', { name: 'Onayla…' })).toBeNull();
  });
});
