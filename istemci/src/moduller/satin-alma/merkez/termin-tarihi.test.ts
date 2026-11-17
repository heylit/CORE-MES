import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AcilisCevabi, Talep } from '#paylasilan/sozlesme/satin-alma.ts';
// Uygulamadaki yükleme sırası: store önce (store ile taşıyıcı birbirini döngüsel ithal eder).
import './store.ts';
import { ekranliBagla, talepSatiri, sekme } from './test-ekrani.ts';
import { terminGunu, terminTarihi } from './calc.ts';
import { addDays, todayStr } from './util.ts';
import { S } from './store.ts';
import { quoteModal } from './ui.ts';

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
    kurlar: [{ paraBirimi: 'TRY', kur: null, aylikFaizYuzdesi: '3' }], kategoriler: [], birimler: [], onayLimitleri: [], dortGoz: true, surum: 1,
  },
};

afterEach(() => { vi.unstubAllGlobals(); document.body.innerHTML = ''; });

const istekler: string[] = [];
const bildirimler: string[] = [];
const bildirim = { bildir: (_ton: string, mesaj: string) => { bildirimler.push(mesaj); return bildirimler.length; }, kaldir: () => {} };
async function ac(durum: Talep['durum'], teklifler: Talep['teklifler'] = []): Promise<{ kok: HTMLElement; kapat: () => void }> {
  const veri: AcilisCevabi = { ...acilis, talepler: [{ ...talep, durum, teklifler }] };
  istekler.length = 0;
  bildirimler.length = 0;
  vi.stubGlobal('fetch', vi.fn(async (_adres: string, i?: RequestInit) => {
    istekler.push(i?.method ?? 'GET');
    return new Response(JSON.stringify(veri), { status: 200, headers: { 'content-type': 'application/json' } });
  }));
  Element.prototype.scrollIntoView = () => {};
  window.scrollTo = () => {};
  const kok = document.createElement('div');
  document.body.append(kok);
  const kapat = ekranliBagla(kok, { rol: 'buyer', sayfa: 'requests', yol: '/satin-alma/talepler', git: () => {}, bildirim });
  await vi.waitFor(() => expect(talepSatiri(kok, talep.id)).not.toBeNull());
  talepSatiri(kok, talep.id)!.click();
  await vi.waitFor(() => expect(sekme(kok, 'quotes')).not.toBeNull());
  sekme(kok, 'quotes')!.click();
  return { kok, kapat };
}

const yaz = (i: HTMLInputElement, v: string): void => { i.value = v; i.dispatchEvent(new Event('input', { bubbles: true })); };

describe('termin gün ve tarih hesabı', () => {
  it('takvim günüyle sayılır, ay sonunu geçer; boş tarih ya da boş gün boş kalır', () => {
    expect(terminTarihi('2026-11-20', 15)).toBe('2026-12-05');
    expect(terminGunu('2026-11-20', '2026-12-05')).toBe(15);
    expect(terminGunu('2026-11-20', '2026-11-18')).toBe(-2);
    expect(terminTarihi('2026-11-20', null)).toBe('');
    expect(terminGunu('2026-11-20', '')).toBeNull();
  });
});

describe('teklif formunda termin tarihi', () => {
  it('kayıtlı teklif (15 gün, teklif 20.11) form ve tabloda 05.12 ile açılır (tablo durumu ilk açılışta kurulur, bu yüzden ilk sırada)', async () => {
    const kayitli: Talep['teklifler'] = [{ id: '00000000-0000-4000-8000-0000000000a1', firmaId: 41, tedarikciAdi: 'Örnek Kartlı Firma', teklifTarihi: '2026-11-20', gecerlilik: null,
      paraBirimi: 'TRY', kur: null, iskontoYuzdesi: '0', nakliye: '0', digerMasraf: '0', teslimSekli: '', nakliyeDahil: true, terminGun: 15, vadeGun: 0, avansYuzdesi: '0',
      garantiAy: null, teknikUygun: true, notlar: '', ilkToplam: null, revizyon: 0, fiyatlar: [{ kalemId: talep.kalemler[0]!.id, birimFiyat: '100' }] }];
    const { kapat } = await ac('degerlendirme', kayitli);
    await vi.waitFor(() => expect(S.requests[talep.id]?.quotes?.length).toBe(1));
    quoteModal(S.requests[talep.id]!, S.requests[talep.id]!.quotes![0]);
    await vi.waitFor(() => expect(document.querySelector('#q-lead-date')).not.toBeNull());
    expect(document.querySelector<HTMLInputElement>('#q-lead-date')!.value).toBe('2026-12-05');
    document.querySelector<HTMLElement>('[data-act="close"]')?.click();
    // Teklifler sekmesindeki tablo kayıtlı teklifi ilk sütunda gösterir.
    await vi.waitFor(() => expect(document.querySelector('#bulk [data-btermin][data-col="0"]')).not.toBeNull());
    expect(document.querySelector<HTMLInputElement>('#bulk [data-btermin][data-col="0"]')!.value).toBe('2026-12-05');
    kapat();
  });
  it('tek teklif formu: tarih girilince gün, gün girilince tarih dolar; teklif tarihi değişince gün kalır', async () => {
    const { kapat } = await ac('degerlendirme');
    // Teklifsiz talepte tablo açık gelir; tek teklif formu doğrudan açılır.
    quoteModal(S.requests[talep.id]!);
    await vi.waitFor(() => expect(document.querySelector('#q-lead-date')).not.toBeNull());
    const gun = document.querySelector<HTMLInputElement>('#q-lead')!, tarih = document.querySelector<HTMLInputElement>('#q-lead-date')!;
    yaz(document.querySelector<HTMLInputElement>('#q-date')!, '2026-11-20');
    yaz(tarih, '2026-12-05');
    expect(gun.value).toBe('15');
    yaz(gun, '10');
    expect(tarih.value).toBe('2026-11-30');
    yaz(document.querySelector<HTMLInputElement>('#q-date')!, '2026-11-25');
    expect([gun.value, tarih.value]).toEqual(['10', '2026-12-05']);
    yaz(tarih, '');
    expect(gun.value).toBe('');
    kapat();
  });
  it('teklif tablosu: her sütunda tarih ve gün birbirini doldurur, saklanan gündür', async () => {
    const { kok, kapat } = await ac('degerlendirme');
    await vi.waitFor(() => expect(kok.querySelector('#bulk [data-btermin][data-col="1"]')).not.toBeNull());
    yaz(kok.querySelector<HTMLInputElement>('#bulk [data-bf="date"][data-col="1"]')!, '2026-11-20');
    yaz(kok.querySelector<HTMLInputElement>('#bulk [data-btermin][data-col="1"]')!, '2026-11-27');
    expect(kok.querySelector<HTMLInputElement>('#bulk [data-bf="leadDays"][data-col="1"]')!.value).toBe('7');
    expect(kok.querySelector<HTMLInputElement>('#bulk [data-bf="leadDays"][data-col="0"]')!.value).toBe('');
    yaz(kok.querySelector<HTMLInputElement>('#bulk [data-bf="leadDays"][data-col="1"]')!, '30');
    expect(kok.querySelector<HTMLInputElement>('#bulk [data-btermin][data-col="1"]')!.value).toBe('2026-12-20');
    kapat();
  });
  it('teklif tarihinden önceki termin tarihi eksi gün verir; kayıt sunucuya gitmez, tarih alanında ileti çıkar', async () => {
    const { kok, kapat } = await ac('degerlendirme');
    await vi.waitFor(() => expect(kok.querySelector('#bulk [data-btermin][data-col="0"]')).not.toBeNull());
    const sec = kok.querySelector<HTMLSelectElement>('#bulk select[data-bf="supplierId"][data-col="0"]')!;
    sec.value = '41';
    sec.dispatchEvent(new Event('input', { bubbles: true }));
    yaz(kok.querySelector<HTMLInputElement>('#bulk [data-bi][data-col="0"]')!, '12');
    yaz(kok.querySelector<HTMLInputElement>('#bulk [data-bf="date"][data-col="0"]')!, '2026-11-20');
    yaz(kok.querySelector<HTMLInputElement>('#bulk [data-btermin][data-col="0"]')!, '2026-11-18');
    expect(kok.querySelector<HTMLInputElement>('#bulk [data-bf="leadDays"][data-col="0"]')!.value).toBe('-2');
    kok.querySelector<HTMLElement>('[data-act="bulk-save"]')!.click();
    await new Promise((bitti) => { setTimeout(bitti, 0); });
    expect(istekler.filter((y) => y !== 'GET')).toEqual([]);
    expect(bildirimler.at(-1)).toBe('Termin tarihi teklif tarihinden önce olamaz.');
    expect(kok.querySelector<HTMLInputElement>('#bulk [data-btermin][data-col="0"]')!.getAttribute('aria-invalid')).toBe('true');
    kapat();
  });
  it('teklif tarihi boşsa taban bugündür', async () => {
    const { kapat } = await ac('degerlendirme');
    quoteModal(S.requests[talep.id]!);
    await vi.waitFor(() => expect(document.querySelector('#q-lead-date')).not.toBeNull());
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-25T09:00:00'));
    try {
      yaz(document.querySelector<HTMLInputElement>('#q-date')!, '');
      yaz(document.querySelector<HTMLInputElement>('#q-lead')!, '10');
      expect(document.querySelector<HTMLInputElement>('#q-lead-date')!.value).toBe(addDays(todayStr(), 10));
      expect(document.querySelector<HTMLInputElement>('#q-lead-date')!.value).toBe('2026-12-05');
    } finally { vi.useRealTimers(); }
    kapat();
  });
});
