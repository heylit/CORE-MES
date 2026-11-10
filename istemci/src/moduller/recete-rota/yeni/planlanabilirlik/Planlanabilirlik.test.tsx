import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { json, OKUYAN, rrAc, sunucuKur, YONETICI } from '../test-ortak.tsx';
import { ornekEmirler, ornekRotalar } from './ornek.ts';

vi.mock('../../../../ortak/rota/cerceve-sayaclari.ts', () => ({ useCerceveSayacYazici: () => () => undefined }));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const ADRES = '/recete-rota/planlanabilirlik';
const VARDIYACI = { ...YONETICI, id: 9, islemler: [...YONETICI.islemler, 'sayfa.vardiya' as const] };
const sunucu = (kullanici = YONETICI, emir: () => Response = () => json(200, ornekEmirler())) => sunucuKur(kullanici, {
  yazmalar: { 'GET /plan/planlanabilirlik': emir, 'GET /plan/planlanabilirlik/rotalar': () => json(200, ornekRotalar()) },
});

describe('Planlanabilirlik (2779)', () => {
  it('özet neden türlerini sayar, zincir kök sayılmaz; kart listeyi süzer', async () => {
    sunucu();
    rrAc(ADRES);
    const ozet = await screen.findByRole('group', { name: 'Neden türüne göre' });
    const kartlar = within(ozet).getAllByRole('button');
    expect(kartlar.map((k) => k.textContent)).toEqual(expect.arrayContaining([expect.stringContaining('Ufukta yer yok')]));
    expect(within(ozet).queryByText('Önceki adımı bekliyor')).toBeNull();
    expect(screen.getByText('UE-0102')).toBeTruthy();
    fireEvent.click(within(ozet).getByRole('button', { name: /Ufukta yer yok/ }));
    expect(screen.queryByText('UE-0102')).toBeNull();
    expect(screen.getByText('UE-0101')).toBeTruthy();
    fireEvent.click(within(ozet).getByRole('button', { name: /Ufukta yer yok/ }));
    expect(screen.getByText('UE-0102')).toBeTruthy();
  });

  it('emir açılınca kök adımın kontrolleri, zincir tek satır ve düzeltme düğmesi görünür', async () => {
    sunucu(VARDIYACI);
    rrAc(ADRES);
    fireEvent.click(await screen.findByText('UE-0101'));
    const panel = screen.getByRole('region', { name: 'UE-0101 adımları' });
    expect(within(panel).getByText('OP 30, 40, 50: OP 20 düzelince yerleşir')).toBeTruthy();
    expect(within(panel).getByText('Adımın süresi kalan ufku aşıyor.')).toBeTruthy();
    expect(within(panel).getByText('yaklaşık')).toBeTruthy();
    expect(within(panel).getAllByRole('img', { name: 'Eksik' })).toHaveLength(2);
    expect(within(panel).getByRole('button', { name: /Vardiya başına personel/ })).toBeTruthy();
  });

  it('başka sayfaya geçiş yetkisi yoksa düğme yerine sayfanın adı yazılır', async () => {
    sunucu(OKUYAN);
    rrAc(ADRES);
    fireEvent.click(await screen.findByText('UE-0101'));
    const panel = screen.getByRole('region', { name: 'UE-0101 adımları' });
    expect(within(panel).queryByRole('button', { name: /Vardiya başına personel/ })).toBeNull();
    expect(within(panel).getByText('Vardiya başına personel')).toBeTruthy();
  });

  it('Reçete ve Rota içindeki düzeltme yeri o bölümü açar', async () => {
    sunucu();
    rrAc(ADRES);
    fireEvent.click(await screen.findByText('UE-0102'));
    fireEvent.click(within(screen.getByRole('region', { name: 'UE-0102 adımları' })).getByRole('button', { name: /Süreler/ }));
    await waitFor(() => expect(screen.getByRole('region', { name: 'Süreler' })).toBeTruthy());
  });

  it('rota sekmesi yalnız eksikli ürünü listeler ve açık emir etkisini yazar', async () => {
    sunucu();
    rrAc(ADRES);
    fireEvent.click(await screen.findByRole('tab', { name: /Ürün ve rotalar/ }));
    fireEvent.click(await screen.findByText('MM-0002'));
    expect(screen.queryByText('MM-0003')).toBeNull();
    expect(screen.getByText('Buradaki eksik bu ürünün 3 açık emrini etkiler.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Tümü/ }));
    expect(screen.getByText('MM-0003')).toBeTruthy();
  });

  it('cevap okunamazsa hata kutusu çıkar, sıfır uydurulmaz', async () => {
    sunucu(YONETICI, () => json(500, { kod: 'HATA', mesaj: 'Sunucu hatası.' }));
    rrAc(ADRES);
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.queryByRole('group', { name: 'Neden türüne göre' })).toBeNull();
  });
});
