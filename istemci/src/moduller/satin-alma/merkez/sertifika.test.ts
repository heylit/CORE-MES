import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AcilisCevabi, SiparisBelgeleriCevabi, Talep } from '#paylasilan/sozlesme/satin-alma.ts';
import { ISTEK_KIMLIGI_BASLIGI } from '#paylasilan/istek-kimligi.ts';
// Uygulamadaki yükleme sırası: store önce (store ile taşıyıcı birbirini döngüsel ithal eder).
import './store.ts';
import { ekranliBagla, talepSatiri, sekme } from './test-ekrani.ts';

const K1 = '00000000-0000-4000-8000-000000000011';
const QA = '00000000-0000-4000-8000-0000000000a1';
// Firma, kalem ve belge adları uydurmadır.
const TALEP: Talep = {
  id: '00000000-0000-4000-8000-000000000001', no: 'ST-2026-001', baslik: 'Deneme çubuk alımı', birim: null, talepEdenKisiId: 5, talepEdenAdi: 'Deneme Kişi', teslimYontemi: null, uretimEmriId: null, uretimEmriNo: null,
  acanKisiId: 5, oncelik: 'normal', ihtiyacTarihi: null, notlar: '', durum: 'siparis_verildi', iptalNedeni: '', agirliklar: null,
  kalemler: [{ id: K1, katalogId: null, ad: 'Deneme çubuk', ozellik: '', miktar: '10', birim: 'kg', kategori: '' }],
  teklifIstekleri: [],
  teklifler: [{ id: QA, firmaId: 3, tedarikciAdi: 'Deneme Tedarik', teklifTarihi: '2026-10-05', gecerlilik: null, paraBirimi: 'TRY', kur: null, iskontoYuzdesi: '0',
    nakliye: '0', digerMasraf: '0', teslimSekli: '', nakliyeDahil: true, terminGun: 7, vadeGun: 30, avansYuzdesi: '0', garantiAy: null,
    teknikUygun: true, notlar: '', ilkToplam: null, revizyon: 0, fiyatlar: [{ kalemId: K1, birimFiyat: '100' }] }],
  karar: {
    mod: 'tek', teklifId: QA, bolunme: [], gerekce: '', kararVerenKisiId: 7, kararVerenAdi: 'Deneme Alıcı', kararTarihi: '2026-10-06', ogrenilenler: '', sabitKurlar: [],
    siparisler: [{ teklifId: QA, no: 'SP-2026-001', siparisNo: '', siparisTarihi: '2026-10-07', beklenenTeslim: null, vadeBaslangici: 'teslim', teslimDurumu: 'bekleniyor', kalite: null, logo: null,
      satirlar: [{ id: 41, kalemId: K1, miktar: '10', birim: 'kg', teslimAlinan: null, sonTeslimTarihi: null, fazlaTeslim: null }] }],
  },
  onaylar: [{ id: '00000000-0000-4000-8000-0000000000d1', zaman: '2026-10-06T10:00:00.000Z', kisiId: 9, kisiAdi: 'Deneme Müdür', sonuc: 'onay', dortGozsuz: false, notlar: '' }],
  hareketler: [], senaryolar: [], surum: 3, olusturma: '2026-10-01T08:00:00.000Z', guncelleme: '2026-10-07T08:00:00.000Z',
};
const ACILIS: AcilisCevabi = {
  kullanici: { id: 7, ad: 'Deneme Alıcı' }, talepler: [TALEP], tedarikciler: [], firmaKartlari: [], katalog: [],
  ayarlar: {
    sirket: '', agirliklar: { maliyet: 60, termin: 20, tedarikci: 10, garanti: 10 }, gecerlilikGun: 15, enAzTeklif: 1, fiyatUyariYuzdesi: '10', kurTarihi: null,
    kurlar: [{ paraBirimi: 'TRY', kur: null, aylikFaizYuzdesi: '3' }], kategoriler: [], birimler: [], onayLimitleri: [], dortGoz: true, surum: 1,
  },
};
const json = (govde: unknown) => new Response(JSON.stringify(govde), { status: 200, headers: { 'content-type': 'application/json' } });

afterEach(() => { vi.unstubAllGlobals(); document.body.innerHTML = ''; });

describe('sipariş satırına sertifika ve rapor', () => {
  it('pencere satırın belgelerini okur; yüklenen dosya özetiyle ve istek kimliğiyle satıra bağlanır, kaldırılabilir', async () => {
    let belgeler: SiparisBelgeleriCevabi = { belgeler: [] };
    const istekler: { yontem: string; yol: string; govde: unknown; kimlik: string | null }[] = [];
    vi.stubGlobal('fetch', vi.fn(async (adres: string, i?: RequestInit) => {
      const yol = String(adres).replace('/api', '');
      const yontem = i?.method ?? 'GET';
      istekler.push({ yontem, yol, govde: i?.body ? JSON.parse(String(i.body)) : undefined, kimlik: new Headers(i?.headers).get(ISTEK_KIMLIGI_BASLIGI) });
      if (yol === '/dosyalar/eksikler') return json({ eksikler: [] });
      if (yol === '/satin-alma-siparis-satirlari/41/belgeler') return json(belgeler);
      if (yol === '/satin-alma-siparis-satirlari/41/belge-ekle') {
        belgeler = { belgeler: [{ id: 77, ad: 'Deneme sertifika', tur: 'sertifika', harf: 'A', revKodu: null }] };
        return json(belgeler);
      }
      if (yol === '/satin-alma-siparis-satirlari/41/belgeler/77/kaldir') { belgeler = { belgeler: [] }; return json(belgeler); }
      return json(ACILIS);
    }));
    const kok = document.createElement('div');
    document.body.append(kok);
    const kapat = ekranliBagla(kok, { rol: 'buyer', sayfa: 'requests', yol: '/satin-alma/talepler', git: () => {} });
    await vi.waitFor(() => expect(sekme(kok, 'ordered')).not.toBeNull());
    sekme(kok, 'ordered')!.click();
    await vi.waitFor(() => expect(talepSatiri(kok, TALEP.id)).not.toBeNull());
    talepSatiri(kok, TALEP.id)!.click();
    await vi.waitFor(() => expect(sekme(kok, 'order')).not.toBeNull());
    sekme(kok, 'order')!.click();
    await vi.waitFor(() => expect(kok.querySelector('[data-act="order-certs"]')).not.toBeNull());
    kok.querySelector<HTMLElement>('[data-act="order-certs"]')!.click();
    await vi.waitFor(() => expect(document.querySelector('[data-cert-line="41"]')?.textContent).toContain('belge yok'));

    // jsdom'un File nesnesinde arrayBuffer yok; tarayıcıdaki karşılığı verilir.
    const dosya = { name: 'sertifika.pdf', arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer };
    Object.defineProperty(document.querySelector<HTMLInputElement>('#ce-dosya')!, 'files', { value: [dosya] });
    document.querySelector<HTMLInputElement>('#ce-ad')!.value = 'Deneme sertifika';
    document.querySelector<HTMLElement>('[data-act="cert-upload"]')!.click();
    await vi.waitFor(() => expect(document.querySelector('[data-cert-line="41"] a')?.getAttribute('href')).toBe('/api/satin-alma-siparis-satirlari/41/belgeler/77/dosya'));
    // 2138-2: kodsuz belgede merkezin harfi yazılmaz.
    expect(document.querySelector('[data-cert-line="41"] a')?.textContent).toBe('Deneme sertifika');
    const ekle = istekler.find((x) => x.yol.endsWith('/belge-ekle'))!;
    expect(ekle.govde).toMatchObject({ tur: 'sertifika', ad: 'Deneme sertifika', dosyaAdi: 'sertifika.pdf' });
    expect((ekle.govde as { ozet: string }).ozet).toMatch(/^[0-9a-f]{64}$/);
    expect(ekle.kimlik).toMatch(/^[0-9a-f-]{36}$/);

    document.querySelector<HTMLElement>('[data-act="cert-remove"][data-id="77"]')!.click();
    await vi.waitFor(() => expect(document.querySelector('[data-cert-line="41"]')?.textContent).toContain('belge yok'));
    expect(istekler.some((x) => x.yontem === 'POST' && x.yol === '/satin-alma-siparis-satirlari/41/belgeler/77/kaldir')).toBe(true);
    kapat();
  });

  it('revizyon kodu metin olarak yazılır: koddaki HTML çizilmez', async () => {
    const kod = '<img src=x onerror=alert(1)>';
    const belgeler: SiparisBelgeleriCevabi = { belgeler: [{ id: 78, ad: 'Deneme sertifika', tur: 'sertifika', harf: 'B', revKodu: kod }] };
    vi.stubGlobal('fetch', vi.fn(async (adres: string) => {
      const yol = String(adres).replace('/api', '');
      if (yol === '/dosyalar/eksikler') return json({ eksikler: [] });
      if (yol === '/satin-alma-siparis-satirlari/41/belgeler') return json(belgeler);
      return json(ACILIS);
    }));
    const kok = document.createElement('div');
    document.body.append(kok);
    const kapat = ekranliBagla(kok, { rol: 'buyer', sayfa: 'requests', yol: '/satin-alma/talepler', git: () => {} });
    await vi.waitFor(() => expect(sekme(kok, 'ordered')).not.toBeNull());
    sekme(kok, 'ordered')!.click();
    await vi.waitFor(() => expect(talepSatiri(kok, TALEP.id)).not.toBeNull());
    talepSatiri(kok, TALEP.id)!.click();
    await vi.waitFor(() => expect(sekme(kok, 'order')).not.toBeNull());
    sekme(kok, 'order')!.click();
    await vi.waitFor(() => expect(kok.querySelector('[data-act="order-certs"]')).not.toBeNull());
    kok.querySelector<HTMLElement>('[data-act="order-certs"]')!.click();
    await vi.waitFor(() => expect(document.querySelector('[data-cert-line="41"] a')).not.toBeNull());
    const a = document.querySelector('[data-cert-line="41"] a')!;
    expect(a.textContent).toBe(`Deneme sertifika (Rev ${kod})`);
    expect(document.querySelector('[data-cert-line="41"] img')).toBeNull();
    kapat();
  });
});
