import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AcilisCevabi, Talep } from '#paylasilan/sozlesme/satin-alma.ts';
// Uygulamadaki yükleme sırası: store önce (store ile taşıyıcı birbirini döngüsel ithal eder).
import './store.ts';
import { merkeziBagla } from './bagla.ts';

const talep: Talep = {
  id: '00000000-0000-4000-8000-000000000101', no: 'ST-2026-001', baslik: 'Deneme talep', birim: null, talepEdenKisiId: 5, talepEdenAdi: 'Deneme Kişi', teslimYontemi: null, uretimEmriId: null, uretimEmriNo: null, acanKisiId: 5,
  oncelik: 'normal', ihtiyacTarihi: null, notlar: '', durum: 'degerlendirme', iptalNedeni: '', agirliklar: null,
  kalemler: [{ id: '00000000-0000-4000-8000-0000000000c1', katalogId: null, ad: 'Deneme kalem', ozellik: '', miktar: '10', birim: 'adet', kategori: '' }],
  teklifIstekleri: [], teklifler: [], karar: null, onaylar: [], hareketler: [], senaryolar: [], surum: 1, olusturma: '2026-10-12T08:00:00.000Z', guncelleme: '2026-10-12T08:00:00.000Z',
};
const acilis: AcilisCevabi = {
  kullanici: { id: 7, ad: 'Deneme Alıcı' }, talepler: [talep], tedarikciler: [], katalog: [],
  firmaKartlari: [{ id: 41, ad: 'Örnek Kartlı Firma' }, { id: 42, ad: 'Örnek Kartlı İkinci' }],
  ayarlar: {
    sirket: '', agirliklar: { maliyet: 60, termin: 20, tedarikci: 10, garanti: 10 }, gecerlilikGun: 15, enAzTeklif: 1, fiyatUyariYuzdesi: '10', kurTarihi: null,
    kurlar: [{ paraBirimi: 'TRY', kur: null, aylikFaizYuzdesi: '3' }], kategoriler: [], birimler: [], onayLimitleri: [], surum: 1,
  },
};

afterEach(() => { vi.unstubAllGlobals(); document.body.innerHTML = ''; });

const istekler: string[] = [];
async function ac(durum: Talep['durum']): Promise<{ kok: HTMLElement; kapat: () => void }> {
  const veri: AcilisCevabi = { ...acilis, talepler: [{ ...talep, durum }] };
  istekler.length = 0;
  vi.stubGlobal('fetch', vi.fn(async (_adres: string, i?: RequestInit) => {
    istekler.push(i?.method ?? 'GET');
    return new Response(JSON.stringify(veri), { status: 200, headers: { 'content-type': 'application/json' } });
  }));
  Element.prototype.scrollIntoView = () => {};
  window.scrollTo = () => {};
  const kok = document.createElement('div');
  document.body.append(kok);
  const kapat = merkeziBagla(kok, { rol: 'buyer', sayfa: 'requests', yol: '/satin-alma/talepler', git: () => {} });
  await vi.waitFor(() => expect(kok.querySelector(`tr[data-id="${talep.id}"]`)).not.toBeNull());
  kok.querySelector<HTMLElement>(`tr[data-id="${talep.id}"]`)!.click();
  await vi.waitFor(() => expect(kok.querySelector('[data-act="tab"][data-tab="quotes"]')).not.toBeNull());
  kok.querySelector<HTMLElement>('[data-act="tab"][data-tab="quotes"]')!.click();
  return { kok, kapat };
}

describe('teklif tablosu eksi değer (TMI A5)', () => {
  it('eksi fiyat sunucuya gitmez; tablo açık kalır, girilen değerler durur, hatalı hücre işaretlenir', async () => {
    const { kok, kapat } = await ac('degerlendirme');
    await vi.waitFor(() => expect(kok.querySelector('select[data-bf="supplierId"]')).not.toBeNull());
    const sec = kok.querySelector<HTMLSelectElement>('select[data-bf="supplierId"][data-col="0"]')!;
    sec.value = '41';
    sec.dispatchEvent(new Event('input', { bubbles: true }));
    const fiyat = kok.querySelector<HTMLInputElement>('[data-bi][data-col="0"]')!;
    fiyat.value = '-5';
    fiyat.dispatchEvent(new Event('input', { bubbles: true }));
    kok.querySelector<HTMLElement>('[data-act="bulk-save"]')!.click();
    await new Promise((bitti) => { setTimeout(bitti, 0); });
    expect(istekler.filter((y) => y !== 'GET')).toEqual([]);
    const ayni = kok.querySelector<HTMLInputElement>('[data-bi][data-col="0"]')!;
    expect([ayni.value, ayni.getAttribute('aria-invalid'), kok.querySelector<HTMLSelectElement>('select[data-bf="supplierId"][data-col="0"]')!.value]).toEqual(['-5', 'true', '41']);
    kapat();
  });
});
