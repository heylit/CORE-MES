import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AcilisCevabi, Talep, Teklif } from '#paylasilan/sozlesme/satin-alma.ts';
// Uygulamadaki yükleme sırası: store önce (store ile taşıyıcı birbirini döngüsel ithal eder).
import './store.ts';
import { merkeziBagla } from './bagla.ts';

const K1 = '00000000-0000-4000-8000-0000000000c1';
const K2 = '00000000-0000-4000-8000-0000000000c2';
const QA = '00000000-0000-4000-8000-0000000000a1';
const QB = '00000000-0000-4000-8000-0000000000b1';
const teklif = (id: string, firmaId: number, ad: string, fiyat: string): Teklif => ({
  id, firmaId, tedarikciAdi: ad, teklifTarihi: '2026-10-05', gecerlilik: null, paraBirimi: 'TRY', kur: null, iskontoYuzdesi: '0',
  nakliye: '0', digerMasraf: '0', teslimSekli: '', nakliyeDahil: true, terminGun: 7, vadeGun: 30, avansYuzdesi: '0', garantiAy: 12,
  teknikUygun: true, notlar: '', ilkToplam: null, revizyon: 0, fiyatlar: [{ kalemId: K1, birimFiyat: fiyat }, { kalemId: K2, birimFiyat: fiyat }],
});
const t: Talep = {
  id: '00000000-0000-4000-8000-000000000101', no: 'ST-2026-001', baslik: 'Deneme talep', birim: null, talepEdenKisiId: 5, talepEdenAdi: 'Deneme Kişi', teslimYontemi: null, uretimEmriId: null, uretimEmriNo: null, acanKisiId: 5,
  oncelik: 'normal', ihtiyacTarihi: null, notlar: '', durum: 'degerlendirme', iptalNedeni: '', agirliklar: null,
  kalemler: [{ id: K1, katalogId: null, ad: 'Deneme kalem', ozellik: '', miktar: '10', birim: 'adet', kategori: '' }, { id: K2, katalogId: null, ad: 'Deneme kalem 2', ozellik: '', miktar: '5', birim: 'adet', kategori: '' }],
  teklifIstekleri: [], teklifler: [teklif(QA, 3, 'Deneme A', '100'), teklif(QB, 4, 'Deneme B', '150')],
  karar: null, onaylar: [], hareketler: [], senaryolar: [], surum: 1, olusturma: '2026-10-12T08:00:00.000Z', guncelleme: '2026-10-12T08:00:00.000Z',
};
const acilis: AcilisCevabi = {
  kullanici: { id: 7, ad: 'Deneme Alıcı' }, talepler: [t], tedarikciler: [], firmaKartlari: [], katalog: [],
  ayarlar: {
    sirket: '', agirliklar: { maliyet: 60, termin: 20, tedarikci: 10, garanti: 10 }, gecerlilikGun: 15, enAzTeklif: 1, fiyatUyariYuzdesi: '10', kurTarihi: null,
    kurlar: [{ paraBirimi: 'TRY', kur: null, aylikFaizYuzdesi: '3' }], kategoriler: [], birimler: [], onayLimitleri: [], surum: 1,
  },
};

afterEach(() => { vi.unstubAllGlobals(); document.body.innerHTML = ''; });

describe('karşılaştır ve karar ver tek tabloda (kart #956)', () => {
  it('önerilen satır seçili gelir; başka satır seçilince gerekçe istenir, gerekçesiz onaya gitmez', async () => {
    const istekler: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (yol: string) => {
      istekler.push(String(yol));
      return new Response(JSON.stringify(acilis), { status: 200, headers: { 'content-type': 'application/json' } });
    }));
    const kok = document.createElement('div');
    document.body.append(kok);
    const kapat = merkeziBagla(kok, { rol: 'buyer', sayfa: 'requests', yol: '/satin-alma/talepler', git: () => {} });
    await vi.waitFor(() => expect(kok.querySelector(`tr[data-id="${t.id}"]`)).not.toBeNull());
    kok.querySelector<HTMLElement>(`tr[data-id="${t.id}"]`)!.click();
    await vi.waitFor(() => expect(kok.querySelector('.sa-karar')).not.toBeNull());

    expect(kok.querySelector('.fsec.open')?.getAttribute('data-sec')).toBe('compare');
    const satirlar = [...kok.querySelectorAll<HTMLElement>('.sa-karar-t tbody tr[data-qid]')];
    expect(satirlar.map((s) => s.dataset.qid)).toEqual([QA, QB]);
    expect(satirlar[0]!.textContent).toContain('Önerilen');
    expect(satirlar[0]!.classList.contains('sel')).toBe(true);
    expect(kok.querySelector<HTMLInputElement>(`input[name="d-sec"][value="${QA}"]`)?.checked).toBe(true);
    expect(kok.querySelector<HTMLElement>('#d-reason-wrap')!.hidden).toBe(true);
    // Ağırlıklar ve bölme varsayılan olarak kapalı ayrıntıdadır.
    expect(kok.querySelector<HTMLDetailsElement>('details.sa-detay')!.open).toBe(false);
    expect(kok.querySelector('details.sa-detay #d-split-panel')).not.toBeNull();

    satirlar[1]!.click();
    expect(kok.querySelector('.sa-karar-t tr.sel')?.getAttribute('data-qid')).toBe(QB);
    expect(kok.querySelector<HTMLInputElement>('#d-quote')!.value).toBe(QB);
    expect(kok.querySelector<HTMLElement>('#d-reason-wrap')!.hidden).toBe(false);

    const once = istekler.length;
    kok.querySelector<HTMLElement>('.sa-karar [data-act="save-decision"]')!.click();
    await new Promise((r) => setTimeout(r, 50));
    expect(istekler.slice(once).filter((y) => y.includes('/karar'))).toEqual([]);
    expect(document.activeElement?.id).toBe('d-reason');

    // Önerilene dönünce gerekçe kutusu yeniden gizlenir.
    satirlar[0]!.click();
    expect(kok.querySelector<HTMLElement>('#d-reason-wrap')!.hidden).toBe(true);
    kapat();
  });
});
