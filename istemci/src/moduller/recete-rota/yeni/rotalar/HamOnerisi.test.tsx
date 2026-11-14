import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import type { HamOnerisiCevabi } from '#paylasilan/sozlesme/rota.ts';
import type { Kullanici } from '#paylasilan/kullanici.ts';
import { json, OKUYAN, rrAc, sunucuKur, YONETICI, type Istek } from '../test-ortak.tsx';
import { adimOrnegi, revizyonOrnegi, rotaDurumu } from './test-veri.ts';
// 3248: açılış yatay hattır; bu dosya dikey akış şemasını ("Akış şeması") sınar.
beforeEach(() => { try { localStorage.setItem('tc-rr1-gorunum', 'dikey'); } catch { /* test ortamında depo yoksa */ } });

afterEach(() => { cleanup(); vi.unstubAllGlobals(); try { localStorage.clear(); } catch { /* test ortamında depo yoksa */ } });

// 1709 (1726 a, 1727 a): ürünün 3B analizinden hammadde önerisi. Veriler uydurmadır.
const BEKLE = { timeout: 4000 };
const ONERI_YOLU = '/rota/urunler/11/ham-onerisi';
const kayitlar = (istekler: readonly Istek[]) => istekler.filter((i) => i.yontem === 'POST' && i.yol === '/rota/revizyonlar/72/kaydet');
const ONERI: HamOnerisiCevabi = {
  model: { belgeAdi: 'Model mil.step', harf: 'A', revKodu: '07' }, payMm: 2, neden: null,
  oneriler: [{ malzemeNo: 12, kod: 'HM-0012', ad: null, kalite: 'C45', form: 'cubuk', olcu: { d: 30, l: 3000 }, aile: 'metal', kaliteKodu: 'C45', yogunluk: 7.85, kesimBoyuMm: 44, hamHacimMm3: 100_000 }],
};

function kur(ins: { itemId: string; qty: number; scrap: number }[], kisi: Kullanici = YONETICI, cevap: HamOnerisiCevabi = ONERI) {
  return sunucuKur(kisi, {
    durum: rotaDurumu([revizyonOrnegi('72', 'B', 'taslak', 4, [adimOrnegi({ ins })])]),
    yazmalar: {
      [`GET ${ONERI_YOLU}`]: () => json(200, cevap),
      'POST /rota/revizyonlar/72/kaydet': () => json(200, { id: 72, durum: 'taslak', surum: 5 }),
    },
  });
}
const adimPaneli = async () => {
  const bolge = await screen.findByRole('region', { name: 'Ürün ve rotalar' });
  // 2558 b/5: sayfa görüntüleme kipinde açılır; yazma yetkisi olan test "Düzenle" ile düzenleme kipine geçer.
  await waitFor(() => { expect(bolge.querySelector('.tc-rr1-rcol, .tc-rr1-emptycv, .tc-rr1-ftab')).not.toBeNull(); });
  const duzenle = within(bolge).queryByRole('button', { name: 'Düzenle' });
  if (duzenle) fireEvent.click(duzenle);
  fireEvent.click(await within(bolge).findByRole('button', { name: 'OP 10 Tornalama' }));
  return within(bolge).getByRole('complementary', { name: 'Düzenleme paneli' });
};

describe('1709 rota bileşeninde hammadde önerisi', () => {
  it('ham girdisi olmayan taslakta öneri ve kg miktarı görünür; Ekle girdiyi miktarıyla rotaya kaydeder', async () => {
    const istekler = kur([]);
    rrAc('/recete-rota/schema');
    const panel = await adimPaneli();
    const grup = await within(panel).findByRole('group', { name: 'Önerilen hammadde' });
    expect(within(grup).getByText('0,785 kg')).toBeTruthy();
    // 2138-2: merkezin harfi değil revizyon kodu.
    expect(within(grup).getByText(/Model mil.step \(Rev 07\)/)).toBeTruthy();
    fireEvent.click(within(grup).getByRole('button', { name: 'HM-0012 önerisini giren olarak ekle' }));
    await within(panel).findByText('Girenler (1)');
    // Ham girdi eklenince öneri kalkar (sunucu taklidi kayıttan sonra eski durumu döndürdüğü için kayıttan önce bakılır).
    expect(within(panel).queryByRole('group', { name: 'Önerilen hammadde' })).toBeNull();
    await waitFor(() => { expect(kayitlar(istekler)).toHaveLength(1); }, BEKLE);
    expect(kayitlar(istekler)[0]?.govde).toMatchObject({ adimlar: [{ bilesenler: [{ malzemeId: 12, miktar: 0.785 }] }] });
  });

  it('2138-2: kodsuz modelde yalnız model adı yazılır, merkezin harfi görünmez', async () => {
    kur([], YONETICI, { ...ONERI, model: { ...ONERI.model!, revKodu: null } });
    rrAc('/recete-rota/schema');
    const panel = await adimPaneli();
    const grup = await within(panel).findByRole('group', { name: 'Önerilen hammadde' });
    const ipucu = within(grup).getByText(/Önerilen hammadde: Model mil.step/);
    expect(ipucu.textContent).toBe('Önerilen hammadde: Model mil.step 3B analizinden, en az talaş önce.');
  });

  it('rotada ham girdi varken öneri istenmez ve görünmez', async () => {
    const istekler = kur([{ itemId: '12', qty: 2, scrap: 0 }]);
    rrAc('/recete-rota/schema');
    const panel = await adimPaneli();
    await within(panel).findByText('Girenler (1)');
    expect(within(panel).queryByRole('group', { name: 'Önerilen hammadde' })).toBeNull();
    expect(istekler.some((i) => i.yol === ONERI_YOLU)).toBe(false);
  });

  it('rota yazma yetkisi olmayan okuyucu öneriyi görmez, istek de gitmez', async () => {
    const istekler = kur([], OKUYAN);
    rrAc('/recete-rota/schema');
    const panel = await adimPaneli();
    await within(panel).findByText('Girenler (0)');
    expect(within(panel).queryByRole('group', { name: 'Önerilen hammadde' })).toBeNull();
    expect(istekler.some((i) => i.yol === ONERI_YOLU)).toBe(false);
  });

  // 1741: yerleşik kalitede sunucu yoğunluğu bilmez; hammadde kartının aile ve kalite koduyla Malzemeler tablosundan gelir.
  it('yerleşik kalitede (yoğunluk null) kg, kartın kalitesinin tablo yoğunluğuyla hesaplanır', async () => {
    const oneri = ONERI.oneriler[0]!;
    kur([], YONETICI, { ...ONERI, oneriler: [{ ...oneri, kalite: 'S235', aile: 'metal', kaliteKodu: 'S235', yogunluk: null }] });
    rrAc('/recete-rota/schema');
    const panel = await adimPaneli();
    const grup = await within(panel).findByRole('group', { name: 'Önerilen hammadde' });
    expect(await within(grup).findByText('0,785 kg', {}, BEKLE)).toBeTruthy();
  });

  it('kalite tabloda da yoksa miktar boş kalır, kullanıcı yazar', async () => {
    const oneri = ONERI.oneriler[0]!;
    kur([], YONETICI, { ...ONERI, oneriler: [{ ...oneri, kalite: 'X', aile: 'metal', kaliteKodu: 'YOK-KALITE', yogunluk: null }] });
    rrAc('/recete-rota/schema');
    const panel = await adimPaneli();
    const grup = await within(panel).findByRole('group', { name: 'Önerilen hammadde' });
    expect(within(grup).getByText('Miktar: siz yazın')).toBeTruthy();
  });
});
