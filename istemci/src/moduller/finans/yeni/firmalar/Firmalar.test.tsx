import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import type { Kullanici } from '#paylasilan/kullanici.ts';
import { ISTEK_KIMLIGI_BASLIGI } from '#paylasilan/istek-kimligi.ts';
import { ornekHamVeri } from '../ornek-ham-veri.ts';
import { FIRMACI, finansAc, json, OKUYAN, sunucuKur, YAZAN, type Istek } from '../test-ortak.tsx';
import { ornekFirma } from './test-veri.ts';

// Açılışta günlük skor kendiliğinden yazılabilir (F0); testler yalnız ekranın kendi yazmalarına bakar.
const kayitYazmasi = (i: Istek) => i.yontem === 'POST' && i.yol !== '/finans/skorlar/kaydet';
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const ekle = (k: Kullanici, id: number, ...islem: string[]): Kullanici => ({ ...k, id, islemler: [...k.islemler, ...islem] as Kullanici['islemler'] });
const KART_YAZAN = ekle(FIRMACI, 11, 'musteri-tedarikci.yaz');
const TAM = ekle(YAZAN, 12, 'musteri-tedarikci.yaz');
const LISTE = '/finans/firmalar';

const kartCevabi = (o: Parameters<typeof ornekFirma>[0] = {}) => () => json(200, { firma: ornekFirma(o), adresler: [] });
// Firma 4 finansta kaydı olmayan firmadır: pasife alma ön denetiminden geçer.
const hamBos = () => { const h = ornekHamVeri(); h.firmalar.push({ ...h.firmalar[0]!, id: 4, ad: 'Bos Firma', kod: 'B1' }); return h; };

describe('Firmalar listesi', () => {
  it('yalnız firma yetkisi: rakam sütunu yok, finans verisi okunmaz, yeni firma yok', async () => {
    const istekler = sunucuKur(FIRMACI);
    finansAc(LISTE);
    await screen.findByRole('row', { name: /Deneme Tedarik/ });
    expect(screen.queryByRole('columnheader', { name: 'Açık alacak' })).toBeNull();
    expect(screen.queryByRole('button', { name: /Yeni firma/ })).toBeNull();
    expect(istekler.some((i) => i.yol.startsWith('/finans/'))).toBe(false);
  });

  it('finans.oku olana açık alacak ve borç görünür; süzgeç sunucuya gider', async () => {
    const istekler = sunucuKur(OKUYAN);
    finansAc(LISTE);
    await screen.findByRole('columnheader', { name: /Açık alacak/ });
    expect(screen.getByRole('columnheader', { name: /Açık borç/ })).toBeTruthy();
    const ilk = istekler.filter((i) => i.yol === '/musteri-tedarikci/firmalar').length;
    fireEvent.click(within(screen.getByRole('group', { name: 'Firma türü' })).getByRole('button', { name: 'Tedarikçiler' }));
    await waitFor(() => expect(istekler.filter((i) => i.yol === '/musteri-tedarikci/firmalar').length).toBeGreaterThan(ilk));
  });

  it('musteri-tedarikci.yaz ile yeni firma açılır: tek uca, istek kimliğiyle; sonra kart açılır', async () => {
    const basliklar: (string | null)[] = [];
    const istekler = sunucuKur(KART_YAZAN, {
      'POST /musteri-tedarikci/firmalar/ekle': () => json(200, { firma: ornekFirma({ id: 9, ad: 'Yeni Firma' }) }),
      'GET /musteri-tedarikci/firmalar/9': kartCevabi({ id: 9, ad: 'Yeni Firma' }),
    });
    const asil = globalThis.fetch as unknown as (a: string, s?: RequestInit) => Promise<Response>;
    vi.stubGlobal('fetch', vi.fn((a: string, s?: RequestInit) => { basliklar.push(new Headers(s?.headers).get(ISTEK_KIMLIGI_BASLIGI)); return asil(a, s); }));
    finansAc(LISTE);
    fireEvent.click(await screen.findByRole('button', { name: /Yeni firma/ }));
    const form = await screen.findByRole('dialog', { name: 'Yeni firma' });
    fireEvent.change(within(form).getByLabelText(/^Ad\s*\*?$/), { target: { value: 'Yeni Firma' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Kaydet' }));
    await screen.findByRole('heading', { name: 'Yeni Firma' });
    const yazma = istekler.filter(kayitYazmasi);
    expect(yazma).toHaveLength(1);
    expect(yazma[0]!.yol).toBe('/musteri-tedarikci/firmalar/ekle');
    expect(yazma[0]!.govde).toMatchObject({ ad: 'Yeni Firma', tur: 'musteri', ulkeKodu: 'TR', paraBirimi: 'TRY', vadeGunu: null });
    expect(basliklar.some((b) => b !== null)).toBe(true);
  });
});

describe('Firma kartı', () => {
  it('yetkisiz: düzenle ve durum düğmeleri görünmez, cari hesap rakamları finans.oku ister', async () => {
    sunucuKur(FIRMACI, { 'GET /musteri-tedarikci/firmalar/1': kartCevabi() });
    finansAc(`${LISTE}?firma=1`);
    await screen.findByRole('heading', { name: 'Deneme Musteri' });
    expect(screen.queryByRole('button', { name: /Düzenle/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Pasife al/ })).toBeNull();
    expect(screen.queryByRole('region', { name: 'Hesap' })).toBeNull();
  });

  it('finans.oku: cari hesap görünür; finans.yaz yoksa tahsilat düğmeleri yok', async () => {
    sunucuKur(OKUYAN, { 'GET /musteri-tedarikci/firmalar/1': kartCevabi() });
    finansAc(`${LISTE}?firma=1`);
    const hesap = await screen.findByRole('region', { name: 'Hesap' });
    expect(within(hesap).getByRole('table', { name: 'Hesap ekstresi' })).toBeTruthy();
    expect(within(hesap).getByRole('button', { name: 'Ekstreyi indir' })).toBeTruthy();
    expect(within(hesap).queryByRole('button', { name: /Tahsil edildi|Tahsilat gir|mahsup/ })).toBeNull();
  });

  it('finans.yaz: "Tahsil edildi" o faturayı seçili getirerek tahsilat formunu açar', async () => {
    sunucuKur(YAZAN, { 'GET /musteri-tedarikci/firmalar/1': kartCevabi() });
    finansAc(`${LISTE}?firma=1`);
    const hesap = await screen.findByRole('region', { name: 'Hesap' });
    const dugmeler = await within(hesap).findAllByRole('button', { name: 'Tahsil edildi' });
    await waitFor(() => expect((screen.getByRole('button', { name: /Kayıt gir/ }) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(dugmeler[0]!);
    const form = await screen.findByRole('dialog', { name: 'Müşteriden para geldi' });
    expect(within(form).getAllByRole('checkbox').some((k) => (k as HTMLInputElement).checked)).toBe(true);
  });

  it('açık kaydı olan firmada pasife alma onay yerine nedeni gösterir, uca gitmez (FNS-60)', async () => {
    const istekler = sunucuKur(TAM, { 'GET /musteri-tedarikci/firmalar/1': kartCevabi() });
    finansAc(`${LISTE}?firma=1`);
    await screen.findByRole('region', { name: 'Hesap' });
    fireEvent.click(screen.getByRole('button', { name: /Pasife al/ }));
    await screen.findByText(/Firma pasife alınamaz: .*açık fatura/);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(istekler.some(kayitYazmasi)).toBe(false);
  });

  it('kaydı olmayan firma satır içi onayla pasife alınır: finansın ucuna, sürümle', async () => {
    const istekler = sunucuKur(TAM, {
      'GET /musteri-tedarikci/firmalar/4': kartCevabi({ id: 4, ad: 'Bos Firma', kod: 'B1' }),
      'POST /finans/firmalar/4/pasif': () => json(200, { firma: ornekFirma({ id: 4, ad: 'Bos Firma', kod: 'B1', aktif: false, surum: 4 }) }),
    }, hamBos());
    finansAc(`${LISTE}?firma=4`);
    await screen.findByRole('region', { name: 'Hesap' });
    fireEvent.click(screen.getByRole('button', { name: /Pasife al/ }));
    expect(istekler.some(kayitYazmasi)).toBe(false);
    fireEvent.click(await screen.findByRole('button', { name: 'Pasife almayı onayla' }));
    await waitFor(() => expect(istekler.find(kayitYazmasi)?.yol).toBe('/finans/firmalar/4/pasif'));
    expect(istekler.find(kayitYazmasi)!.govde).toEqual({ surum: 3 });
    await screen.findByRole('button', { name: /Aktif yap/ });
  });

  it('rakam yetkisi olmayanda sunucunun FNS-60 nedeni kartta kalır', async () => {
    sunucuKur(KART_YAZAN, {
      'GET /musteri-tedarikci/firmalar/1': kartCevabi(),
      'POST /finans/firmalar/1/pasif': () => json(422, { kod: 'GECERSIZ', mesaj: 'Firmanın kapanmamış faturası var.' }),
    });
    finansAc(`${LISTE}?firma=1`);
    await screen.findByRole('heading', { name: 'Deneme Musteri' });
    fireEvent.click(screen.getByRole('button', { name: /Pasife al/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Pasife almayı onayla' }));
    await screen.findByText('Firmanın kapanmamış faturası var.');
  });

  it("düzenleme Logo'ya gönderilmiş kartta kodu kilitler ve sürümle günceller", async () => {
    const istekler = sunucuKur(KART_YAZAN, {
      'GET /musteri-tedarikci/firmalar/1': kartCevabi({ logoKayitNo: 5, logoCariKodu: 'L-1' }),
      'POST /musteri-tedarikci/firmalar/1/guncelle': () => json(200, { firma: ornekFirma({ ad: 'Yeni ad', logoKayitNo: 5, logoCariKodu: 'L-1', surum: 4 }) }),
    });
    finansAc(`${LISTE}?firma=1`);
    fireEvent.click(await screen.findByRole('button', { name: /Düzenle/ }));
    const form = await screen.findByRole('dialog', { name: 'Firmayı düzenle' });
    expect((within(form).getByLabelText('Kod') as HTMLInputElement).disabled).toBe(true);
    fireEvent.change(within(form).getByLabelText(/^Ad\s*\*?$/), { target: { value: 'Yeni ad' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Kaydet' }));
    await screen.findByRole('heading', { name: 'Yeni ad' });
    const yazma = istekler.find(kayitYazmasi)!;
    expect(yazma.yol).toBe('/musteri-tedarikci/firmalar/1/guncelle');
    expect(yazma.govde).toMatchObject({ ad: 'Yeni ad', kod: 'M1', logoCariKodu: 'L-1', surum: 3 });
  });
});
