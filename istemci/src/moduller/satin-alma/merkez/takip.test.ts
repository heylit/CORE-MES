import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AcilisCevabi, SiparisTakibiCevabi, Talep } from '#paylasilan/sozlesme/satin-alma.ts';
import type { SiparisIrsaliyeleriCevabi } from '#paylasilan/sozlesme/stok.ts';
// Uygulamadaki yükleme sırası: store önce (store ile taşıyıcı birbirini döngüsel ithal eder).
import './store.ts';
import { merkeziBagla } from './bagla.ts';

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
    siparisler: [{ teklifId: QA, no: 'SP-2026-001', siparisNo: '', siparisTarihi: '2026-10-07', beklenenTeslim: null, teslimDurumu: 'bekleniyor', kalite: null, logo: null,
      satirlar: [{ id: 41, kalemId: K1, miktar: '10', birim: 'kg', teslimAlinan: null, sonTeslimTarihi: null, fazlaTeslim: null }] }],
  },
  onaylar: [{ id: '00000000-0000-4000-8000-0000000000d1', zaman: '2026-10-06T10:00:00.000Z', kisiId: 9, kisiAdi: 'Deneme Müdür', sonuc: 'onay', dortGozsuz: false, notlar: '' }],
  hareketler: [], senaryolar: [], surum: 3, olusturma: '2026-10-01T08:00:00.000Z', guncelleme: '2026-10-07T08:00:00.000Z',
};
const ACILIS: AcilisCevabi = {
  kullanici: { id: 7, ad: 'Deneme Alıcı' }, talepler: [TALEP], tedarikciler: [], firmaKartlari: [], katalog: [],
  ayarlar: {
    sirket: '', agirliklar: { maliyet: 60, termin: 20, tedarikci: 10, garanti: 10 }, gecerlilikGun: 15, enAzTeklif: 1, fiyatUyariYuzdesi: '10', kurTarihi: null,
    kurlar: [{ paraBirimi: 'TRY', kur: null, aylikFaizYuzdesi: '3' }], kategoriler: [], birimler: [], onayLimitleri: [], surum: 1,
  },
};
const json = (govde: unknown, durum = 200) => new Response(JSON.stringify(govde), { status: durum, headers: { 'content-type': 'application/json' } });

afterEach(() => { vi.unstubAllGlobals(); document.body.innerHTML = ''; });

describe('sipariş takibi ve ödeme planı (kart #1124)', () => {
  it('sipariş sekmesinde irsaliye ve fatura satırları ile plan görünür; plan düzenlenip talebin sürümüyle kaydedilir', async () => {
    let takip: SiparisTakibiCevabi = { siparisler: [{ teklifId: QA, satirIdleri: [41], paraBirimi: 'TRY', faturalar: [],
      odemePlani: [{ tur: 'vade', vade: '2026-11-06', yontem: 'banka', tutar: '1000' }] }] };
    const irsaliyeler: SiparisIrsaliyeleriCevabi = { irsaliyeler: [{ siparisSatirId: 41, malKabulId: 3, malKabulNo: 'MK-000003', irsaliyeNo: 'DN-IRS-9', zaman: '2026-10-10T07:00:00.000Z' }] };
    const istekler: { yontem: string; yol: string; govde: unknown }[] = [];
    vi.stubGlobal('fetch', vi.fn(async (adres: string, i?: RequestInit) => {
      const yol = String(adres).replace('/api', '');
      const yontem = i?.method ?? 'GET';
      const govde = i?.body ? JSON.parse(String(i.body)) as unknown : undefined;
      istekler.push({ yontem, yol, govde });
      if (yol === `/satin-alma-talepleri/${TALEP.id}/siparis-takibi`) return json(takip);
      if (yol === '/stok/siparis-irsaliyeleri?siparisSatirlari=41') return json(irsaliyeler);
      if (yol === `/satin-alma-talepleri/${TALEP.id}/odeme-plani`) {
        const g = govde as { satirlar: SiparisTakibiCevabi['siparisler'][number]['odemePlani'] };
        takip = { siparisler: [{ ...takip.siparisler[0]!, odemePlani: g.satirlar.map((x) => ({ ...x, tutar: String(Number(x.tutar)) })) }] };
        return json(takip);
      }
      return json(ACILIS);
    }));
    const kok = document.createElement('div');
    document.body.append(kok);
    const kapat = merkeziBagla(kok, { rol: 'buyer', sayfa: 'requests', yol: '/satin-alma/talepler', git: () => {} });
    await vi.waitFor(() => expect(kok.querySelector('[data-act="status-chip"][data-v="ordered"]')).not.toBeNull());
    kok.querySelector<HTMLElement>('[data-act="status-chip"][data-v="ordered"]')!.click();
    await vi.waitFor(() => expect(kok.querySelector(`tr[data-id="${TALEP.id}"]`)).not.toBeNull());
    kok.querySelector<HTMLElement>(`tr[data-id="${TALEP.id}"]`)!.click();
    await vi.waitFor(() => expect(kok.querySelector('.fsec-h[data-tab="order"]')).not.toBeNull());
    kok.querySelector<HTMLElement>('.fsec-h[data-tab="order"]')!.click();
    await vi.waitFor(() => expect(kok.querySelectorAll('[data-sa-takip]')).toHaveLength(2));
    const [irs, fat] = [...kok.querySelectorAll<HTMLElement>('[data-sa-takip]')];
    expect(irs!.dataset.saTakip).toBe('tamam');
    expect(irs!.textContent).toContain('Mal kabul: irsaliye girildi');
    expect(irs!.textContent).toContain('İrsaliye DN-IRS-9');
    expect(irs!.textContent).toContain('MK-000003');
    expect(fat!.dataset.saTakip).toBe('bekliyor');
    expect(fat!.textContent).toContain('Finans: fatura bekleniyor');
    expect(kok.querySelector('[data-sa-takip-paneli] tbody')!.textContent).toContain('06.11.2026');

    kok.querySelector<HTMLElement>('[data-act="odeme-plani"]')!.click();
    await vi.waitFor(() => expect(document.querySelectorAll('#op-rows tr[data-op-row]')).toHaveLength(1));
    document.querySelector<HTMLElement>('[data-act="odeme-plani-ekle"]')!.click();
    const satirlar = document.querySelectorAll<HTMLElement>('#op-rows tr[data-op-row]');
    expect(satirlar).toHaveLength(2);
    const alan = (tr: HTMLElement, ad: string) => tr.querySelector<HTMLInputElement | HTMLSelectElement>(`[data-op="${ad}"]`)!;
    alan(satirlar[0]!, 'tur').value = 'avans';
    alan(satirlar[0]!, 'vade').value = '2026-10-07';
    alan(satirlar[0]!, 'tutar').value = '300';
    alan(satirlar[1]!, 'yontem').value = 'cek';
    alan(satirlar[1]!, 'tutar').value = '700';
    document.querySelector<HTMLElement>('[data-act="odeme-plani-kaydet"]')!.click();
    await vi.waitFor(() => expect(kok.querySelector('[data-sa-takip-paneli] tbody')!.textContent).toContain('Çek'));
    const yaz = istekler.find((x) => x.yol.endsWith('/odeme-plani'))!;
    expect(yaz.govde).toEqual({ teklifId: QA, surum: 3, satirlar: [
      { tur: 'avans', vade: '2026-10-07', yontem: 'banka', tutar: '300.00' }, { tur: 'vade', vade: '2026-12-06', yontem: 'cek', tutar: '700.00' },
    ] });
    expect(kok.querySelector('[data-sa-takip-paneli] tbody')!.textContent).toContain('Avans');
    kapat();
  });

  it('fatura bağlıysa fatura satırı no, tarih ve vadeyle işaretlenir; plan düzenlenmez', async () => {
    const takip: SiparisTakibiCevabi = { siparisler: [{ teklifId: QA, satirIdleri: [41], paraBirimi: 'TRY', odemePlani: [],
      faturalar: [{ belgeNo: 'DN-F7', belgeTarihi: '2026-10-09', vade: '2026-11-09' }] }] };
    vi.stubGlobal('fetch', vi.fn(async (adres: string) => {
      const yol = String(adres).replace('/api', '');
      if (yol.endsWith('/siparis-takibi')) return json(takip);
      if (yol.startsWith('/stok/siparis-irsaliyeleri')) return json({ irsaliyeler: [] });
      return json(ACILIS);
    }));
    const kok = document.createElement('div');
    document.body.append(kok);
    const kapat = merkeziBagla(kok, { rol: 'buyer', sayfa: 'requests', yol: '/satin-alma/talepler', git: () => {} });
    await vi.waitFor(() => expect(kok.querySelector('[data-act="status-chip"][data-v="ordered"]')).not.toBeNull());
    kok.querySelector<HTMLElement>('[data-act="status-chip"][data-v="ordered"]')!.click();
    await vi.waitFor(() => expect(kok.querySelector(`tr[data-id="${TALEP.id}"]`)).not.toBeNull());
    kok.querySelector<HTMLElement>(`tr[data-id="${TALEP.id}"]`)!.click();
    await vi.waitFor(() => expect(kok.querySelector('.fsec-h[data-tab="order"]')).not.toBeNull());
    kok.querySelector<HTMLElement>('.fsec-h[data-tab="order"]')!.click();
    await vi.waitFor(() => expect(kok.querySelectorAll('[data-sa-takip]')).toHaveLength(2));
    const [irs, fat] = [...kok.querySelectorAll<HTMLElement>('[data-sa-takip]')];
    expect(irs!.dataset.saTakip).toBe('bekliyor');
    expect(fat!.dataset.saTakip).toBe('tamam');
    expect(fat!.textContent).toContain('Fatura DN-F7, 09.10.2026, vade 09.11.2026');
    expect(kok.querySelector('[data-act="odeme-plani"]')).toBeNull();
    kapat();
  });
});
