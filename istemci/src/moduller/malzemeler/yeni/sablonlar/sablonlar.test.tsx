import { afterEach, describe, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { OKUYAN, YAZAN, YONETICI, json, sunucuKur, yeniEkranAc } from '../test-ortak.tsx';
import { SYS_TPL } from '../sabitler/index.ts';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const ADRES = '/malzemeler/sablonlar';
const hazir = SYS_TPL as { id: string; ad: string }[];
const kayitli = (kaldirabilir: string[]) => ({
  'GET /malzeme-katalogu-sablonlari': () => json(200, {
    sablonlar: [
      { ...hazir[0], sys: false, id: 'benim', ad: 'Benim' },
      { ...hazir[0], sys: false, id: 'baskasi', ad: 'Başkası' },
    ],
    surumler: { benim: 1, baskasi: 1 },
    kaldirabilir,
  }),
});
const silDugmeleri = () => screen.queryAllByRole('button', { name: /şablonunu sil$/ }).map((b) => b.getAttribute('aria-label'));

describe('M4 Şablonlar', () => {
  test('kayıtlı şablonlar üstte, hazır şablonlar altta; hazır şablonun özeti prototipteki gibi', async () => {
    sunucuKur(YONETICI, kayitli([]));
    yeniEkranAc(ADRES);
    const kayitliBolum = await screen.findByRole('region', { name: 'Kayıtlı şablonlar' });
    expect(within(kayitliBolum).getAllByRole('listitem')).toHaveLength(2);
    const hazirBolum = screen.getByRole('region', { name: 'Hazır şablonlar' });
    expect(within(hazirBolum).getAllByRole('listitem')).toHaveLength(hazir.length);
    const ilk = within(hazirBolum).getByRole('button', { name: new RegExp(`^${hazir[0]?.ad ?? ''}`) });
    // tplSummary: kalite, form ve seçimler virgülle; 110 karakteri aşan özet kısaltılır.
    const ozet = ilk.querySelector('small')?.textContent ?? '';
    expect(ozet.startsWith('42CrMo4, yuvarlak çubuk, Sıcak hadde (+AR)')).toBe(true);
    expect(ozet.length).toBeLessThanOrEqual(110);
    expect(ozet.endsWith('…')).toBe(true);
  });

  test('kayıtlı şablon yoksa yalnız hazır şablonlar görünür', async () => {
    sunucuKur(YONETICI, { 'GET /malzeme-katalogu-sablonlari': () => json(200, { sablonlar: [], surumler: {}, kaldirabilir: [] }) });
    yeniEkranAc(ADRES);
    expect(await screen.findByRole('region', { name: 'Hazır şablonlar' })).toBeTruthy();
    expect(screen.queryByRole('region', { name: 'Kayıtlı şablonlar' })).toBeNull();
  });

  // katalog-kurallari.test.tsx "şablon kaldırma düğmesi" senaryosunun yeni bileşene karşılığı.
  test('sil düğmesi yalnız sunucunun kaldırabilir dediği kayıtlı şablonda; hazır şablonda hiç yok (izinli)', async () => {
    sunucuKur(YAZAN, kayitli(['benim']));
    yeniEkranAc(ADRES);
    await screen.findByRole('region', { name: 'Kayıtlı şablonlar' });
    expect(silDugmeleri()).toEqual(['Benim şablonunu sil']);
  });

  test('yalnız okuyan sil düğmesi görmez, sunucu kaldırabilir dese de (reddedilen)', async () => {
    sunucuKur(OKUYAN, kayitli(['benim', 'baskasi']));
    yeniEkranAc(ADRES);
    await screen.findByRole('region', { name: 'Kayıtlı şablonlar' });
    expect(silDugmeleri()).toEqual([]);
  });

  test('şablona basınca sihirbaz şablonla açılır', async () => {
    sunucuKur(YONETICI, kayitli([]));
    yeniEkranAc(ADRES);
    fireEvent.click(await screen.findByRole('button', { name: /^Benim/ }));
    await waitFor(() => { expect(screen.getByTestId('adres').textContent).toBe('/malzemeler/yeni'); });
  });

  test('sil onaylanınca kaldır ucu çağrılır, bildirim çıkar, liste yenilenir; vazgeçince istek gitmez', async () => {
    const istekler = sunucuKur(YONETICI, { ...kayitli(['benim']), 'POST /malzeme-katalogu-sablonlari/benim/kaldir': () => json(200, { id: 'benim' }) });
    yeniEkranAc(ADRES);
    fireEvent.click(await screen.findByRole('button', { name: 'Benim şablonunu sil' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Vazgeç' }));
    expect(istekler.some((i) => i.yontem === 'POST')).toBe(false);

    fireEvent.click(screen.getByRole('button', { name: 'Benim şablonunu sil' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Sil' }));
    expect(await screen.findByText('Şablon silindi.')).toBeTruthy();
    expect(istekler.filter((i) => i.yontem === 'POST').map((i) => i.yol)).toEqual(['/malzeme-katalogu-sablonlari/benim/kaldir']);
    await waitFor(() => { expect(istekler.filter((i) => i.yol === '/malzeme-katalogu-sablonlari')).toHaveLength(2); });
  });

  test('sunucu silmeyi reddederse kendi iletisi gösterilir', async () => {
    sunucuKur(YONETICI, {
      ...kayitli(['benim']),
      'POST /malzeme-katalogu-sablonlari/benim/kaldir': () => json(403, { kod: 'YETKISIZ', mesaj: 'Bu şablonu yalnız kaydeden kaldırabilir.' }),
    });
    yeniEkranAc(ADRES);
    fireEvent.click(await screen.findByRole('button', { name: 'Benim şablonunu sil' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Sil' }));
    expect(await screen.findByText('Bu şablonu yalnız kaydeden kaldırabilir.')).toBeTruthy();
  });

  test('şablonlar okunamazsa hata ve yeniden dene', async () => {
    sunucuKur(YONETICI, { 'GET /malzeme-katalogu-sablonlari': () => json(500, { kod: 'HATA', mesaj: 'Şablonlar okunamadı.' }) });
    yeniEkranAc(ADRES);
    expect(await screen.findByText('Şablonlar okunamadı.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Yeniden dene' })).toBeTruthy();
  });
});
