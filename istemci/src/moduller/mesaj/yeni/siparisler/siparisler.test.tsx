import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import type { Kullanici } from '#paylasilan/kullanici.ts';
import type { Siparis, SiparisAyrintisi } from '#paylasilan/sozlesme/siparisler.ts';
import type { AdimliEmirOzeti } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import { ornekBelgeler } from '../ornek-veri.ts';
import { KAPILI, OKUYAN, YAZAN, mesajAc, sunucuKur, type SahteSunucu } from '../test-ortak.tsx';
import { siparisOzeti } from './veri.ts';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

// Uydurma sipariş ve emirler: yalnız özetin okuduğu alanlar doludur.
const siparis = (id: number, ek: Partial<Siparis> = {}) => ({
  id, no: `S-${id}`, durum: 'onayli', firmaAd: 'Örnek Firma', termin: '2026-11-02', surum: 1, ...ek,
}) as Siparis;
const satir = (id: number, miktar: string, birim: string | null = 'adet') => ({ id, malzemeAdi: `Örnek parça ${id}`, malzemeKodu: null, birim, miktar });
const ayrinti = (s: Siparis, satirlar: ReturnType<typeof satir>[]) => ({ ...s, satirlar }) as unknown as SiparisAyrintisi;
const emir = (id: number, siparisSatiriId: number, durum: string, adet = 10, altEmirIdleri: number[] = []) =>
  ({ id, siparisSatiriId, durum, adet, parti: { ustEmirId: null, bolunmeSira: null, altEmirIdleri, birlestigiEmirId: null } }) as unknown as AdimliEmirOzeti;

describe('M2 Siparişler: siparisOzeti', () => {
  it('üretilen biten yaprak emirlerin toplamı; iptal ve bölünmüş üst emir sayılmaz; açık siparişte durum bilinmez (837/2 a)', () => {
    const s = siparis(1);
    const a = ayrinti(s, [satir(101, '10'), satir(102, '5')]);
    const o = siparisOzeti(s, a, [emir(1, 101, 'bitti', 10), emir(2, 102, 'bitti', 5), emir(3, 102, 'iptal'), emir(4, 101, 'acik', 10, [1])]);
    expect(o).toMatchObject({ id: '1', no: 'S-1', musteri: 'Örnek Firma', urun: 'Örnek parça 101 +1 kalem', hedef: 15, birim: 'adet', durum: null, uretilen: 15 });
  });

  it('durum Siparişler\'in kendi durumundan: kapanan "Sevk edildi", açık sipariş emirden türetilmez', () => {
    const s = siparis(1);
    const a = ayrinti(s, [satir(101, '10')]);
    expect(siparisOzeti(s, a, [emir(1, 101, 'basladi')]).durum).toBeNull();
    expect(siparisOzeti(s, a, [emir(1, 101, 'bitti')]).durum).toBeNull();
    expect(siparisOzeti(siparis(1, { durum: 'kapandi' }), a, [emir(1, 101, 'acik')]).durum).toBe('sevk');
  });

  it('veri yoksa sıfır uydurulmaz: emir okunamazsa üretilen, birimler karışıksa hedef null', () => {
    const s = siparis(1);
    expect(siparisOzeti(s, ayrinti(s, [satir(101, '10')]), null)).toMatchObject({ durum: null, uretilen: null, hedef: 10 });
    expect(siparisOzeti(s, ayrinti(s, [satir(101, '10'), satir(102, '2', 'kg')]), [])).toMatchObject({ hedef: null, uretilen: null, birim: '' });
    expect(siparisOzeti(s, null, null)).toMatchObject({ urun: '', hedef: null, uretilen: null });
  });
});

const SIPARIS_OKUR: Kullanici = { ...KAPILI, islemler: [...KAPILI.islemler, 'siparisler.oku'] };
const liste = (satirlar: Siparis[]) => ({ satirlar, toplam: satirlar.length, sayfa: 1, sayfaBoyu: 200 });
// Sahte sunucu süzgeci yalnız yolu verir; açık ve sevk listesi son isteğin sorgusundan ayrılır.
const siparisUclari = (istekler: () => readonly string[]) => (yontem: string, yol: string) => {
  const json = (g: unknown) => new Response(JSON.stringify(g), { status: 200 });
  if (yontem !== 'GET') return null;
  if (yol === '/siparisler') return json(liste(istekler().at(-1)?.includes('durum=onayli') ? [siparis(7)] : []));
  if (yol === '/siparisler/7') return json(ayrinti(siparis(7), [satir(701, '20')]));
  return null;
};

describe('M2 Siparişler sekmesi', () => {
  it('reddedilen: siparisler.oku yoksa uç çağrılmaz, izin metni görünür', async () => {
    const s = sunucuKur({ ben: YAZAN, belgeler: ornekBelgeler() });
    mesajAc('/mesaj/yeni/siparisler');
    expect(await screen.findByText('Siparişleri görme iznin yok.')).toBeTruthy();
    expect(s.istekler.some((i) => i.includes('/siparisler'))).toBe(false);
  });

  it('izinli: açık sipariş kartı listelenir; emir okuma izni yoksa emir ucu çağrılmaz; ekran sipariş yazmaz', async () => {
    const s: SahteSunucu = sunucuKur({ ben: YAZAN, kullanici: SIPARIS_OKUR, belgeler: ornekBelgeler(), diger: siparisUclari(() => s.istekler) });
    mesajAc('/mesaj/yeni/siparisler');
    expect(await screen.findByText('#S-7')).toBeTruthy();
    expect(s.istekler).toContain('GET /siparisler?durum=onayli&sayfaBoyu=200&sirala=termin&yon=artan');
    expect(s.istekler.some((i) => i.startsWith('GET /adimli-emirler'))).toBe(false);
    expect(s.istekler.some((i) => !i.startsWith('GET ') && i.includes('/siparisler'))).toBe(false);
  });

  it('sipariş ayrıntısı salt okunur; not orders/<id>/not altına yazılır, sipariş kaydına iz yazılmaz', async () => {
    const s: SahteSunucu = sunucuKur({ ben: YAZAN, kullanici: SIPARIS_OKUR, belgeler: ornekBelgeler(), diger: siparisUclari(() => s.istekler) });
    mesajAc('/mesaj/yeni/siparisler');
    fireEvent.click(await screen.findByText('#S-7'));
    const sayfa = await screen.findByRole('dialog', { name: 'Sipariş' });
    expect(within(sayfa).queryByRole('button', { name: /Üretim gir|Siparişi düzenle|Sevk/ })).toBeNull();
    fireEvent.change(within(sayfa).getByLabelText('Not yaz'), { target: { value: 'Termin soruldu' } });
    fireEvent.click(within(sayfa).getByRole('button', { name: 'Notu gönder' }));
    await waitFor(() => { expect(s.yazmalar.some((y) => String(y.govde['yol']).startsWith('orders/7/not/'))).toBe(true); });
    expect(s.yazmalar.some((y) => y.govde['yol'] === 'orders/7')).toBe(false);
  });

  it('reddedilen: salt okur kişide sipariş ayrıntısında not yazma alanı ve iş ekleme yok', async () => {
    const s: SahteSunucu = sunucuKur({ ben: OKUYAN, kullanici: SIPARIS_OKUR, belgeler: ornekBelgeler(), diger: siparisUclari(() => s.istekler) });
    mesajAc('/mesaj/yeni/siparisler');
    fireEvent.click(await screen.findByText('#S-7'));
    const sayfa = await screen.findByRole('dialog', { name: 'Sipariş' });
    expect(within(sayfa).queryByLabelText('Not yaz')).toBeNull();
    expect(within(sayfa).queryByRole('button', { name: 'Görev' })).toBeNull();
  });
});
