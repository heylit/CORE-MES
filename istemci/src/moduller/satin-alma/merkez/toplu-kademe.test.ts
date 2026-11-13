import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AcilisCevabi, Talep } from '#paylasilan/sozlesme/satin-alma.ts';
// Uygulamadaki yükleme sırası: store önce (store ile taşıyıcı birbirini döngüsel ithal eder).
import './store.ts';
import { ekranliBagla, talepSatiri, sekme } from './test-ekrani.ts';

const K1 = '00000000-0000-4000-8000-0000000000c1';
const Q1 = '00000000-0000-4000-8000-0000000000d1';
const talep: Talep = {
  id: '00000000-0000-4000-8000-000000000181', no: 'ST-2026-181', baslik: 'Deneme talep', birim: null, talepEdenKisiId: 5, talepEdenAdi: 'Deneme Kişi', teslimYontemi: null, uretimEmriId: null, uretimEmriNo: null, acanKisiId: 5,
  oncelik: 'normal', ihtiyacTarihi: null, notlar: '', durum: 'degerlendirme', iptalNedeni: '', agirliklar: null,
  kalemler: [{ id: K1, katalogId: null, ad: 'Deneme kalem', ozellik: '', miktar: '10', birim: 'adet', kategori: '' }],
  teklifIstekleri: [], teklifler: [], karar: null, onaylar: [], hareketler: [], senaryolar: [], surum: 1, olusturma: '2026-10-12T08:00:00.000Z', guncelleme: '2026-10-12T08:00:00.000Z',
};
const kademeliTeklif: Talep['teklifler'][number] = {
  id: Q1, firmaId: 41, tedarikciAdi: 'Örnek Kartlı Firma', teklifTarihi: '2026-10-12', gecerlilik: null, paraBirimi: 'TRY', kur: null, iskontoYuzdesi: '0', nakliye: '0', digerMasraf: '0',
  teslimSekli: '', nakliyeDahil: true, terminGun: null, vadeGun: 0, avansYuzdesi: '0', garantiAy: null, teknikUygun: true, notlar: '', ilkToplam: '80', revizyon: 0,
  fiyatlar: [{ kalemId: K1, birimFiyat: '10', basamaklar: [{ esik: '10', birimFiyat: '8' }, { esik: '50', birimFiyat: '6.5' }] }],
};
const acilis: AcilisCevabi = {
  kullanici: { id: 7, ad: 'Deneme Alıcı' }, talepler: [talep], tedarikciler: [], katalog: [],
  firmaKartlari: [{ id: 41, ad: 'Örnek Kartlı Firma' }, { id: 42, ad: 'Örnek Kartlı İkinci' }],
  ayarlar: {
    sirket: '', agirliklar: { maliyet: 60, termin: 20, tedarikci: 10, garanti: 10 }, gecerlilikGun: 15, enAzTeklif: 1, fiyatUyariYuzdesi: '10', kurTarihi: null,
    kurlar: [{ paraBirimi: 'TRY', kur: null, aylikFaizYuzdesi: '3' }], kategoriler: [], birimler: [], onayLimitleri: [], dortGoz: true, surum: 1,
  },
};

afterEach(() => { vi.unstubAllGlobals(); document.body.innerHTML = ''; });

const yazilanlar: Talep[] = [];
const bildirimler: string[] = [];
const bildirim = { bildir: (_ton: string, mesaj: string) => { bildirimler.push(mesaj); return bildirimler.length; }, kaldir: () => {} };
// Kaydedilmemiş tablo aynı talepte korunur; testler birbirinin tablosunu görmesin diye her biri kendi talebini açar.
let sira = 0;
async function ac(teklifler: Talep['teklifler'], kalemler: Talep['kalemler'] = talep.kalemler): Promise<HTMLElement> {
  const t: Talep = { ...talep, id: `00000000-0000-4000-8000-00000000018${++sira}`, teklifler, kalemler };
  const veri: AcilisCevabi = { ...acilis, talepler: [t] };
  yazilanlar.length = 0;
  bildirimler.length = 0;
  vi.stubGlobal('fetch', vi.fn(async (_adres: string, i?: RequestInit) => {
    if ((i?.method ?? 'GET') !== 'GET') { const g = JSON.parse(String(i!.body)) as Talep; yazilanlar.push(g); return new Response(JSON.stringify({ ...t, ...g, surum: 2 }), { status: 200, headers: { 'content-type': 'application/json' } }); }
    return new Response(JSON.stringify(veri), { status: 200, headers: { 'content-type': 'application/json' } });
  }));
  Element.prototype.scrollIntoView = () => {};
  window.scrollTo = () => {};
  const kok = document.createElement('div');
  document.body.append(kok);
  ekranliBagla(kok, { rol: 'buyer', sayfa: 'requests', yol: '/satin-alma/talepler', git: () => {}, bildirim });
  await vi.waitFor(() => expect(talepSatiri(kok, t.id)).not.toBeNull());
  talepSatiri(kok, t.id)!.click();
  await vi.waitFor(() => expect(sekme(kok, 'quotes')).not.toBeNull());
  sekme(kok, 'quotes')!.click();
  await vi.waitFor(() => expect(kok.querySelector('#bulk [data-bi]')).not.toBeNull());
  return kok;
}
const yaz = (kok: HTMLElement, secici: string, deger: string) => {
  const i = kok.querySelector<HTMLInputElement | HTMLSelectElement>(secici)!;
  i.value = deger;
  i.dispatchEvent(new Event('input', { bubbles: true }));
};
const bekle = () => new Promise((bitti) => { setTimeout(bitti, 0); });
const kaydet = async (kok: HTMLElement) => { kok.querySelector<HTMLElement>('[data-act="bulk-save"]')!.click(); await bekle(); };
const sonuc = (kok: HTMLElement, ad: string) => kok.querySelector(`#bulk [data-bres="${ad}"][data-col="0"]`)!.textContent ?? '';

describe('3181: teklif tablosunda kademeli fiyat', () => {
  it('Kademe ekle satır açar; toplam talep miktarında geçerli basamaktan hesaplanır, geçerli fiyat işaretlenir ve basamak kayda gider', async () => {
    const kok = await ac([]);
    yaz(kok, 'select[data-bf="supplierId"][data-col="0"]', '41');
    yaz(kok, '[data-bi][data-col="0"]', '10');
    expect(sonuc(kok, 'total')).toContain('100');
    expect(kok.querySelector('#bulk .flag')).toBeNull();
    kok.querySelector<HTMLElement>('[data-act="bulk-add-tier"][data-col="0"]')!.click();
    expect(document.activeElement).toBe(kok.querySelector('[data-bt="min"][data-col="0"][data-ti="0"]'));
    yaz(kok, '[data-bt="min"][data-col="0"][data-ti="0"]', '10');
    yaz(kok, '[data-bt="price"][data-col="0"][data-ti="0"]', '8');
    // 10 adet "10 ve üstü" basamağına düşer: 10 x 8.
    expect(sonuc(kok, 'total')).toContain('80');
    expect(kok.querySelector('[data-bt="price"][data-col="0"][data-ti="0"]')!.classList.contains('gecerli')).toBe(true);
    expect(kok.querySelector('[data-bi][data-col="0"]')!.classList.contains('gecerli')).toBe(false);
    // Ulaşılmayan basamak tabanı değiştirmez.
    yaz(kok, '[data-bt="min"][data-col="0"][data-ti="0"]', '11');
    expect(sonuc(kok, 'total')).toContain('100');
    expect(kok.querySelector('[data-bi][data-col="0"]')!.classList.contains('gecerli')).toBe(true);
    yaz(kok, '[data-bt="min"][data-col="0"][data-ti="0"]', '10');
    await kaydet(kok);
    expect(yazilanlar).toHaveLength(1);
    expect(yazilanlar[0]!.teklifler[0]!.fiyatlar).toEqual([expect.objectContaining({ kalemId: K1, birimFiyat: '10', basamaklar: [{ esik: '10', birimFiyat: '8' }] })]);
  });

  it('yarım basamak, sıfır eşik ve tekrar eden eşik kaydedilmez; tablo açık kalır', async () => {
    const kok = await ac([]);
    yaz(kok, 'select[data-bf="supplierId"][data-col="0"]', '41');
    yaz(kok, '[data-bi][data-col="0"]', '10');
    kok.querySelector<HTMLElement>('[data-act="bulk-add-tier"][data-col="0"]')!.click();
    yaz(kok, '[data-bt="min"][data-col="0"][data-ti="0"]', '10');
    await kaydet(kok);
    expect(bildirimler.at(-1)).toMatch(/1\. sütun: Her basamağa/);
    yaz(kok, '[data-bt="min"][data-col="0"][data-ti="0"]', '0');
    yaz(kok, '[data-bt="price"][data-col="0"][data-ti="0"]', '8');
    await kaydet(kok);
    expect(bildirimler.at(-1)).toMatch(/Her basamağa/);
    yaz(kok, '[data-bt="min"][data-col="0"][data-ti="0"]', '10');
    kok.querySelector<HTMLElement>('[data-act="bulk-add-tier"][data-col="0"]')!.click();
    yaz(kok, '[data-bt="min"][data-col="0"][data-ti="1"]', '10');
    yaz(kok, '[data-bt="price"][data-col="0"][data-ti="1"]', '7');
    await kaydet(kok);
    expect(bildirimler.at(-1)).toMatch(/Aynı eşik/);
    expect(yazilanlar).toEqual([]);
    expect(kok.querySelector<HTMLInputElement>('[data-bt="price"][data-col="0"][data-ti="1"]')!.value).toBe('7');
  });

  it('kayıtlı kademeli teklif basamaklarıyla açılır (rozet yok); kaldırılan basamak kayıttan silinir, en çok dört ek basamak', async () => {
    const kok = await ac([kademeliTeklif]);
    await vi.waitFor(() => expect(kok.querySelectorAll('[data-bt="min"][data-col="0"]')).toHaveLength(2));
    expect([...kok.querySelectorAll<HTMLInputElement>('[data-bt][data-col="0"]')].map((i) => i.value)).toEqual(['10', '8', '50', '6,5']);
    expect(kok.querySelector('#bulk .flag')).toBeNull();
    expect(sonuc(kok, 'total')).toContain('80');
    for (let i = 0; i < 2; i++) kok.querySelector<HTMLElement>('[data-act="bulk-add-tier"][data-col="0"]')!.click();
    expect(kok.querySelector('[data-act="bulk-add-tier"][data-col="0"]')).toBeNull();
    for (const ti of [3, 2, 1]) kok.querySelector<HTMLElement>(`[data-act="bulk-rm-tier"][data-col="0"][data-ti="${ti}"]`)!.click();
    await kaydet(kok);
    expect(yazilanlar[0]!.teklifler[0]!.fiyatlar[0]!.basamaklar).toEqual([{ esik: '10', birimFiyat: '8' }]);
    // Basamaklara dokunmayan sütun basamak alanını göndermez; ikinci sütun boş kalır.
    expect(yazilanlar[0]!.teklifler).toHaveLength(1);
  });

  it('bütün basamakları kaldırılan kalem boş listeyle gider (sunucu siler)', async () => {
    const kok = await ac([kademeliTeklif]);
    await vi.waitFor(() => expect(kok.querySelectorAll('[data-bt="min"][data-col="0"]')).toHaveLength(2));
    for (const ti of [1, 0]) kok.querySelector<HTMLElement>(`[data-act="bulk-rm-tier"][data-col="0"][data-ti="${ti}"]`)!.click();
    expect(sonuc(kok, 'total')).toContain('100');
    await kaydet(kok);
    expect(yazilanlar[0]!.teklifler[0]!.fiyatlar[0]!.basamaklar).toEqual([]);
  });

  it('basamak kutusunda Enter alt kalemin fiyatına geçer; ok tuşu kutuda kalır', async () => {
    const K2 = '00000000-0000-4000-8000-0000000000c2';
    const kok = await ac([], [...talep.kalemler, { ...talep.kalemler[0]!, id: K2, ad: 'Deneme ikinci kalem' }]);
    kok.querySelector<HTMLElement>(`[data-act="bulk-add-tier"][data-col="0"]`)!.click();
    const fiyat = kok.querySelector<HTMLInputElement>(`[data-bt="price"][data-bk="${K1}"][data-col="0"]`)!;
    fiyat.focus();
    fiyat.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    expect(document.activeElement).toBe(fiyat);
    fiyat.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(document.activeElement).toBe(kok.querySelector(`[data-bi="${K2}"][data-col="0"]`));
  });

  it('ortadaki basamak kaldırılınca o basamak gider, ötekiler değerleriyle kalır', async () => {
    const kok = await ac([kademeliTeklif]);
    await vi.waitFor(() => expect(kok.querySelectorAll('[data-bt="min"][data-col="0"]')).toHaveLength(2));
    kok.querySelector<HTMLElement>('[data-act="bulk-add-tier"][data-col="0"]')!.click();
    yaz(kok, '[data-bt="min"][data-col="0"][data-ti="2"]', '100');
    yaz(kok, '[data-bt="price"][data-col="0"][data-ti="2"]', '5');
    kok.querySelector<HTMLElement>('[data-act="bulk-rm-tier"][data-col="0"][data-ti="1"]')!.click();
    expect([...kok.querySelectorAll<HTMLInputElement>('[data-bt][data-col="0"]')].map((i) => i.value)).toEqual(['10', '8', '100', '5']);
    kok.querySelector<HTMLElement>('[data-act="bulk-rm-tier"][data-col="0"][data-ti="0"]')!.click();
    expect([...kok.querySelectorAll<HTMLInputElement>('[data-bt][data-col="0"]')].map((i) => i.value)).toEqual(['100', '5']);
    await kaydet(kok);
    expect(yazilanlar[0]!.teklifler[0]!.fiyatlar[0]!.basamaklar).toEqual([{ esik: '100', birimFiyat: '5' }]);
  });

  it('kaydetme başka denetime takılınca boş satırın altındaki basamak ekranda ve kayıtta kalır', async () => {
    const kok = await ac([]);
    yaz(kok, 'select[data-bf="supplierId"][data-col="0"]', '41');
    yaz(kok, 'select[data-bf="supplierId"][data-col="1"]', '41');
    yaz(kok, '[data-bi][data-col="0"]', '10');
    yaz(kok, '[data-bi][data-col="1"]', '9');
    for (let i = 0; i < 2; i++) kok.querySelector<HTMLElement>('[data-act="bulk-add-tier"][data-col="0"]')!.click();
    yaz(kok, '[data-bt="min"][data-col="0"][data-ti="1"]', '5');
    yaz(kok, '[data-bt="price"][data-col="0"][data-ti="1"]', '7');
    await kaydet(kok);
    expect(bildirimler.at(-1)).toMatch(/Aynı tedarikçi/);
    expect(yazilanlar).toHaveLength(0);
    expect([...kok.querySelectorAll<HTMLInputElement>('[data-bt][data-col="0"]')].map((i) => i.value)).toEqual(['', '', '5', '7']);
    yaz(kok, 'select[data-bf="supplierId"][data-col="1"]', '42');
    expect([...kok.querySelectorAll<HTMLInputElement>('[data-bt][data-col="0"]')].map((i) => i.value)).toEqual(['', '', '5', '7']);
    expect(sonuc(kok, 'total')).toContain('70');
    await kaydet(kok);
    expect(yazilanlar).toHaveLength(1);
    expect(yazilanlar[0]!.teklifler.find((t) => t.firmaId === 41)!.fiyatlar[0]!.basamaklar).toEqual([{ esik: '5', birimFiyat: '7' }]);
  });

  it('satırın en uygun fiyatı basamak fiyatından seçilir; iki basamaktan yalnız geçerli olan işaretlenir', async () => {
    const kok = await ac([]);
    yaz(kok, 'select[data-bf="supplierId"][data-col="0"]', '41');
    yaz(kok, 'select[data-bf="supplierId"][data-col="1"]', '42');
    yaz(kok, '[data-bi][data-col="0"]', '10');
    yaz(kok, '[data-bi][data-col="1"]', '9');
    const hucre = (j: number) => kok.querySelector(`#bulk tr[data-item="${K1}"] td[data-pc="${j}"]`)!;
    expect(hucre(1).classList.contains('best')).toBe(true);
    for (let i = 0; i < 2; i++) kok.querySelector<HTMLElement>('[data-act="bulk-add-tier"][data-col="0"]')!.click();
    yaz(kok, '[data-bt="min"][data-col="0"][data-ti="0"]', '5');
    yaz(kok, '[data-bt="price"][data-col="0"][data-ti="0"]', '9,5');
    yaz(kok, '[data-bt="min"][data-col="0"][data-ti="1"]', '10');
    yaz(kok, '[data-bt="price"][data-col="0"][data-ti="1"]', '8');
    // Talep 10 adet: birinci sütunda 8 geçerli, ikinci sütun 9.
    expect(hucre(0).classList.contains('best')).toBe(true);
    expect(hucre(1).classList.contains('best')).toBe(false);
    const gecerli = (ti: number) => kok.querySelector(`[data-bt="price"][data-col="0"][data-ti="${ti}"]`)!.classList.contains('gecerli');
    expect([gecerli(0), gecerli(1)]).toEqual([false, true]);
    expect(kok.querySelector('[data-bi][data-col="0"]')!.classList.contains('gecerli')).toBe(false);
  });

  it('eksi basamak eşiği ya da fiyatı kaydedilmez', async () => {
    const kok = await ac([]);
    yaz(kok, 'select[data-bf="supplierId"][data-col="0"]', '41');
    yaz(kok, '[data-bi][data-col="0"]', '10');
    kok.querySelector<HTMLElement>('[data-act="bulk-add-tier"][data-col="0"]')!.click();
    yaz(kok, '[data-bt="min"][data-col="0"][data-ti="0"]', '10');
    yaz(kok, '[data-bt="price"][data-col="0"][data-ti="0"]', '-8');
    await kaydet(kok);
    expect(yazilanlar).toHaveLength(0);
    yaz(kok, '[data-bt="price"][data-col="0"][data-ti="0"]', '8');
    yaz(kok, '[data-bt="min"][data-col="0"][data-ti="0"]', '-10');
    await kaydet(kok);
    expect(yazilanlar).toHaveLength(0);
  });

  it('tabloda ve tek teklif formunda düğme yazılıdır: Kademe ekle', async () => {
    const kok = await ac([kademeliTeklif]);
    await vi.waitFor(() => expect(kok.querySelector('[data-act="bulk-add-tier"][data-col="0"]')).not.toBeNull());
    expect(kok.querySelector('[data-act="bulk-add-tier"][data-col="0"]')!.textContent).toBe('Kademe ekle');
    document.querySelector<HTMLElement>('[data-act="edit-quote"]')!.click();
    await vi.waitFor(() => expect(document.querySelector('[data-act="add-tier"]')).not.toBeNull());
    expect(document.querySelector('[data-act="add-tier"]')!.textContent).toBe('Kademe ekle');
  });
});
