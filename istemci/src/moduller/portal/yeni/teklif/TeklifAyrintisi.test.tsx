import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { SIMDI } from '../ornek-veri.ts';
import { ac, json, sunucuKur, type Istek } from '../test-ortak.tsx';
import { CATISMA_ILETISI } from '../veri.ts';
import { siparisKur, surumOku, type SurumGirdisi } from './TeklifAyrintisi.tsx';
import { taslaklariSil } from './ortak.tsx';
import { SATICI_KISI, talepKur, teklifDeposu, yazmaCevabi } from './test-verisi.ts';

afterEach(() => { cleanup(); taslaklariSil(); vi.unstubAllGlobals(); vi.useRealTimers(); vi.restoreAllMocks(); });

interface Yazma { yol: string; veri: Record<string, unknown>; beklenenSurum?: number | null }
const yazmalar = (istekler: readonly Istek[]): Yazma[] =>
  istekler.filter((i) => i.yontem === 'POST' && i.yol === '/portal/belge/yaz').map((i) => i.govde as Yazma);

const girdi = (k: Partial<SurumGirdisi> = {}): SurumGirdisi => ({
  fiyatlar: ['100', '50'], iskonto: '0', teslim: '21', odeme: 'Peşin', gecerlilik: '2026-03-31', not: '', ...k,
});

describe('TeklifAyrintisi', () => {
  it('teklif görseline yalnız resim eklenir; resim olmayan dosya yüklenmez', async () => {
    const istekler = sunucuKur(SATICI_KISI, teklifDeposu(), yazmaCevabi);
    ac('/portal/yeni/sale?id=q1');
    const secici = (await screen.findByText('Resim ekle', {}, { timeout: 5000 })).closest('label')?.querySelector('input[type="file"]');
    expect(secici?.getAttribute('accept')).toBe('image/*');
    fireEvent.change(secici as HTMLInputElement, { target: { files: [new File(['%PDF'], 'cizim.pdf', { type: 'application/pdf' })] } });
    expect(await screen.findByText('Yalnızca resim dosyaları eklenebilir (JPG, PNG, WEBP).')).toBeTruthy();
    expect(istekler.some((i) => i.yol.startsWith('/portal/ek'))).toBe(false);
  });

  it('yarım kalan teklif formu sayfadan çıkıp dönünce korunur', async () => {
    sunucuKur(SATICI_KISI, teklifDeposu(), yazmaCevabi);
    ac('/portal/yeni/sale?id=q1');
    fireEvent.change(await screen.findByLabelText('Müşteriye not', { exact: false }, { timeout: 5000 }), { target: { value: 'Kaplama dahil' } });
    cleanup();
    ac('/portal/yeni/sale?id=q1');
    expect(((await screen.findByLabelText('Müşteriye not', { exact: false }, { timeout: 5000 })) as HTMLTextAreaElement).value).toBe('Kaplama dahil');
  });

  it('müşteride olan teklifte kabulü sorup okunan sürümle yazar', async () => {
    vi.useFakeTimers({ now: SIMDI, toFake: ['Date'] });
    const istekler = sunucuKur(SATICI_KISI, teklifDeposu(), yazmaCevabi);
    ac('/portal/yeni/sale?id=q2');
    fireEvent.click(await screen.findByRole('button', { name: 'Sürüm 1 için müşteri kabulünü kaydet' }, { timeout: 5000 }));
    fireEvent.click(await screen.findByRole('button', { name: 'Kabulü kaydet' }));
    await waitFor(() => { expect(yazmalar(istekler)).toHaveLength(1); });
    const y = yazmalar(istekler)[0];
    expect(y?.yol).toBe('requests/q2');
    expect(y?.beklenenSurum).toBe(1);
    expect(y?.veri).toMatchObject({ status: 'accepted', acceptedVersion: 1 });
    // Kimlik ve sürüm gövdeye girmez.
    expect(y?.veri).not.toHaveProperty('id');
    expect(y?.veri).not.toHaveProperty('surum');
    expect(await screen.findByText('Müşteri kabulü kaydedildi')).toBeTruthy();
  });

  it('kabul edilen teklifi önce sipariş, sonra talep yazarak siparişe dönüştürür', async () => {
    vi.useFakeTimers({ now: SIMDI, toFake: ['Date'] });
    const istekler = sunucuKur(SATICI_KISI, teklifDeposu(), yazmaCevabi);
    ac('/portal/yeni/sale?id=q4');
    fireEvent.click(await screen.findByRole('button', { name: 'Satış siparişine dönüştür' }, { timeout: 5000 }));
    await waitFor(() => { expect(yazmalar(istekler)).toHaveLength(2); });
    const [siparis, talep] = yazmalar(istekler);
    expect(siparis?.yol).toMatch(/^orders\/o/);
    expect(siparis?.beklenenSurum).toBeNull();
    // Sürüm 1'in yüzde 10 iskontosu birim fiyata uygulanır.
    expect((siparis?.veri['items'] as { price: number | null }[]).map((k) => k.price)).toEqual([90, 45]);
    expect(siparis?.veri).toMatchObject({ type: 'sales', partyId: 'c1', sourceNo: 'TKL-2026-q4' });
    expect(talep?.yol).toBe('requests/q4');
    expect(talep?.veri).toMatchObject({ status: 'ordered', orderId: siparis?.yol.slice('orders/'.length) });
  });

  it('yeni talepte teklifi hazırlatır; geçersiz fiyatla yazmaz', async () => {
    vi.useFakeTimers({ now: SIMDI, toFake: ['Date'] });
    // jsdom kaydırmayı yapmaz; gönderimden sonraki sayfa başına dönüş sınanmaz.
    vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
    const istekler = sunucuKur(SATICI_KISI, teklifDeposu(), yazmaCevabi);
    ac('/portal/yeni/sale?id=q1');
    const gonder = await screen.findByRole('button', { name: 'Teklifi gönder' }, { timeout: 5000 });
    fireEvent.change(screen.getByLabelText('Deneme braket birim fiyat'), { target: { value: '120,5' } });
    fireEvent.click(gonder);
    expect(await screen.findByText('Her kalem için sıfırdan büyük birim fiyat girin.')).toBeTruthy();
    expect(yazmalar(istekler)).toHaveLength(0);
    fireEvent.change(screen.getByLabelText('Deneme pim birim fiyat'), { target: { value: '30' } });
    fireEvent.change(screen.getByLabelText(/Teslim süresi/), { target: { value: '14' } });
    fireEvent.click(gonder);
    await waitFor(() => { expect(yazmalar(istekler)).toHaveLength(1); });
    const y = yazmalar(istekler)[0];
    expect(y?.veri).toMatchObject({ status: 'quoted', versions: [{ v: 1, prices: [120.5, 30], deliveryDays: 14 }] });
  });

  it('iskonto onay sınırını aşan sürümü göndermez, eski ekrana yönlendirir', async () => {
    vi.useFakeTimers({ now: SIMDI, toFake: ['Date'] });
    const istekler = sunucuKur(SATICI_KISI, teklifDeposu(), yazmaCevabi);
    ac('/portal/yeni/sale?id=q2');
    const gonder = await screen.findByRole('button', { name: 'Sürüm 2 olarak gönder' }, { timeout: 5000 });
    fireEvent.change(screen.getByLabelText('İskonto (%)'), { target: { value: '15' } });
    fireEvent.click(gonder);
    expect(await screen.findByText(/sınırını aşıyor/)).toBeTruthy();
    expect(yazmalar(istekler)).toHaveLength(0);
  });

  it('onay bekleyen talepte sürüm formu ve karar düğmesi yoktur', async () => {
    vi.useFakeTimers({ now: SIMDI, toFake: ['Date'] });
    const d = teklifDeposu();
    const q = talepKur({ id: 'q7', status: 'new', pendingApproval: 'a1' });
    sunucuKur(SATICI_KISI, { ...d, requests: { ...d.requests, q7: q } as typeof d.requests }, yazmaCevabi);
    ac('/portal/yeni/sale?id=q7');
    expect(await screen.findByText(/onayı bekleniyor/, {}, { timeout: 5000 })).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Eski portal ekranında karar verin' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Teklifi gönder' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Onayla' })).toBeNull();
  });

  it('sırası gelen onaycıya karar düğmeleri görünür ama pasiftir; karar eski ekranda (853 a)', async () => {
    vi.useFakeTimers({ now: SIMDI, toFake: ['Date'] });
    const d = teklifDeposu();
    const a1 = d.approvals['a1'];
    const q = talepKur({ id: 'q7', status: 'new', pendingApproval: 'a1' });
    const istekler = sunucuKur(SATICI_KISI, {
      ...d,
      requests: { ...d.requests, q7: q } as typeof d.requests,
      approvals: { ...d.approvals, a1: { ...a1, kind: 'discount', steps: [{ role: 'Satış', status: 'pending' }] } } as typeof d.approvals,
    }, yazmaCevabi);
    ac('/portal/yeni/sale?id=q7');
    expect(await screen.findByText(/onayı bekleniyor/, {}, { timeout: 5000 })).toBeTruthy();
    const onayla = screen.getByRole('button', { name: 'Onayla' }) as HTMLButtonElement;
    expect(onayla.disabled).toBe(true);
    expect((screen.getByRole('button', { name: 'Reddet' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByRole('link', { name: 'Eski portal ekranında karar verin' }).getAttribute('href')).toBe('/portal');
    fireEvent.click(onayla);
    expect(istekler.some((i) => i.yol.includes('/karar'))).toBe(false);
  });

  it('araya giren değişiklikte çatışma iletisi verir', async () => {
    vi.useFakeTimers({ now: SIMDI, toFake: ['Date'] });
    sunucuKur(SATICI_KISI, teklifDeposu(), (yontem, yol) =>
      (yontem === 'POST' && yol === '/portal/belge/yaz' ? json(409, { kod: 'CATISMA', mesaj: 'Sürüm uyuşmadı.' }) : null));
    ac('/portal/yeni/sale?id=q2');
    fireEvent.click(await screen.findByRole('button', { name: 'Sürüm 1 için müşteri kabulünü kaydet' }, { timeout: 5000 }));
    fireEvent.click(await screen.findByRole('button', { name: 'Kabulü kaydet' }));
    expect(await screen.findByText(CATISMA_ILETISI)).toBeTruthy();
  });

  it('olmayan kaydı bulunamadı diye gösterir', async () => {
    sunucuKur(SATICI_KISI, teklifDeposu());
    ac('/portal/yeni/sale?id=yok');
    expect(await screen.findByText('Bu kayıt bulunamadı veya bu hesapla erişiminiz yok.', {}, { timeout: 5000 })).toBeTruthy();
  });

  it('sürüm denetimi: fiyat, iskonto, teslim ve geçerlilik', () => {
    const q = talepKur({ id: 'q1', status: 'new' });
    const an = new Date(SIMDI).toISOString();
    expect(surumOku(q, girdi(), SIMDI, an)).toMatchObject({ surum: { v: 1, prices: [100, 50], discount: 0, deliveryDays: 21 } });
    expect(surumOku(q, girdi({ fiyatlar: ['100', '0'] }), SIMDI, an)).toEqual({ hata: 'Her kalem için sıfırdan büyük birim fiyat girin.' });
    expect(surumOku(q, girdi({ iskonto: '100' }), SIMDI, an)).toEqual({ hata: 'İskonto 0 ile 99 arasında olmalı.' });
    expect(surumOku(q, girdi({ teslim: '0' }), SIMDI, an)).toEqual({ hata: 'Teslim süresini gün olarak girin.' });
    expect(surumOku(q, girdi({ gecerlilik: '2026-03-01' }), SIMDI, an)).toEqual({ hata: 'Geçerlilik tarihi bugün veya ileri bir tarih olmalı.' });
  });

  it('siparişe dönüşüm: fiyatı görünmeyen kalem sıfır değil boş yazılır', () => {
    const q = talepKur({ id: 'q1', status: 'accepted' });
    const o = siparisKur(q, { v: 1, prices: [200, null], discount: 50, validUntil: '2026-03-31', deliveryDays: 10 }, 'SS-2026-0001', 'tmi-8', SIMDI);
    expect(o.items.map((k) => k.price)).toEqual([100, null]);
    expect(o.promisedDate).toBe('2026-03-26');
  });
});
