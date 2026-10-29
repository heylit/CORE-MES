import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AcilisCevabi, Talep } from '#paylasilan/sozlesme/satin-alma.ts';
// Uygulamadaki yükleme sırası: store önce (store ile taşıyıcı birbirini döngüsel ithal eder).
import { S, V } from './store.ts';
import { YENILEME_MS, acilisOku, merkezAc, merkeziBagla } from './bagla.ts';

const talep = (id: string, no: string): Talep => ({
  id, no, baslik: 'Deneme talep', birim: null, talepEdenKisiId: 5, talepEdenAdi: 'Deneme Kişi', teslimYontemi: null, uretimEmriId: null, uretimEmriNo: null, acanKisiId: 5, oncelik: 'normal', ihtiyacTarihi: null,
  notlar: '', durum: 'taslak', iptalNedeni: '', agirliklar: null,
  kalemler: [{ id: '00000000-0000-4000-8000-0000000000c1', katalogId: null, ad: 'Deneme kalem', ozellik: '', miktar: '2', birim: 'adet', kategori: '' }],
  teklifIstekleri: [], teklifler: [], karar: null, onaylar: [], hareketler: [], senaryolar: [], surum: 1, olusturma: '2026-10-12T08:00:00.000Z', guncelleme: '2026-10-12T08:00:00.000Z',
});
const acilis = (talepler: Talep[]): AcilisCevabi => ({
  kullanici: { id: 7, ad: 'Deneme Alıcı' }, talepler, tedarikciler: [], firmaKartlari: [], katalog: [],
  ayarlar: {
    sirket: '', agirliklar: { maliyet: 60, termin: 20, tedarikci: 10, garanti: 10 }, gecerlilikGun: 15, enAzTeklif: 3, fiyatUyariYuzdesi: '10', kurTarihi: null,
    kurlar: [{ paraBirimi: 'TRY', kur: null, aylikFaizYuzdesi: '3' }], kategoriler: [], birimler: [], onayLimitleri: [], surum: 1,
  },
});
const json = (durum: number, govde: unknown) => new Response(JSON.stringify(govde), { status: durum, headers: { 'content-type': 'application/json' } });
const ILK = '00000000-0000-4000-8000-000000000101';
const YENI = '00000000-0000-4000-8000-000000000102';

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); document.body.innerHTML = ''; });

describe('Merkez bağlama', () => {
  // Karar 102 a: Ctrl K yalnız kabuğun ortak paletidir; satın alma tuşu almaz, kendi arama kutusu yerinde kalır.
  it('Ctrl K kabuğa bırakılır: tuş durdurulmaz, odak satın alma aramasına geçmez; arama kutusu yerinde', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json(200, acilis([talep(ILK, 'ST-2026-001')]))));
    const kok = document.createElement('div');
    document.body.append(kok);
    const kapat = merkeziBagla(kok, { rol: 'buyer', sayfa: 'requests', yol: '/satin-alma/talepler', git: () => {} });
    await vi.waitFor(() => expect(Object.keys(S.requests)).toEqual([ILK]));
    const icerik = kok.querySelector<HTMLElement>('#main')!;
    for (const ayar of [{ ctrlKey: true }, { metaKey: true }]) {
      const tus = new KeyboardEvent('keydown', { key: 'k', bubbles: true, cancelable: true, ...ayar });
      icerik.dispatchEvent(tus);
      expect(tus.defaultPrevented).toBe(false);
    }
    expect(document.activeElement?.id).not.toBe('gsearch');
    expect(kok.querySelector('#gsearch')).not.toBeNull();
    kapat();
  });

  it('ekran yeniden açılınca başka sayfada açılan talep sunucudan alınır; yenileme düşerse eldeki talepler kalır', async () => {
    const cevaplar = [() => json(200, acilis([talep(ILK, 'ST-2026-001')])), () => json(200, acilis([talep(ILK, 'ST-2026-001'), talep(YENI, 'ST-2026-002')])),
      () => json(500, { hata: { kod: 'SUNUCU', ileti: 'x' } })];
    const f = vi.fn(async () => cevaplar.shift()!());
    vi.stubGlobal('fetch', f);
    const ac = () => {
      const kok = document.createElement('div');
      document.body.append(kok);
      return merkeziBagla(kok, { rol: 'buyer', sayfa: 'requests', yol: '/satin-alma/talepler', git: () => {} });
    };
    let kapat = ac();
    await vi.waitFor(() => expect(Object.keys(S.requests)).toEqual([ILK]));
    kapat();
    // Ana sayfadan ya da Taleplerim'den talep açıldı; kullanıcı satın almaya döner.
    kapat = ac();
    await vi.waitFor(() => expect(Object.keys(S.requests).sort()).toEqual([ILK, YENI]));
    kapat();
    kapat = ac();
    await vi.waitFor(() => expect(f).toHaveBeenCalledTimes(3));
    await new Promise((r) => setTimeout(r, 0));
    expect(Object.keys(S.requests).sort()).toEqual([ILK, YENI]);
    expect(document.querySelector('[data-sa-merkez] #main')?.textContent).not.toContain('Sunucuya bağlanılamadı');
    kapat();
  });

  it('açık ekran başkasının açtığı talebi kendiliğinden alır; kullanıcı yazarken ya da pencere açıkken yenilemez; kapanınca durur', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    let talepler = [talep(ILK, 'ST-2026-001')];
    const f = vi.fn(async () => json(200, acilis(talepler)));
    vi.stubGlobal('fetch', f);
    const kok = document.createElement('div');
    document.body.append(kok);
    const kapat = merkeziBagla(kok, { rol: 'buyer', sayfa: 'requests', yol: '/satin-alma/talepler', git: () => {} });
    await vi.waitFor(() => expect(f).toHaveBeenCalled());
    const once = f.mock.calls.length;
    talepler = [...talepler, talep(YENI, 'ST-2026-002')];
    // Kullanıcı arama kutusuna yazıyor: yenileme beklenir.
    const ara = kok.querySelector<HTMLInputElement>('#gsearch')!;
    ara.focus();
    vi.advanceTimersByTime(YENILEME_MS);
    expect(f).toHaveBeenCalledTimes(once);
    ara.blur();
    // Pencere açık: yenileme beklenir.
    const pencere = kok.querySelector('#modal-root')!;
    pencere.append(document.createElement('div'));
    vi.advanceTimersByTime(YENILEME_MS);
    expect(f).toHaveBeenCalledTimes(once);
    pencere.innerHTML = '';
    vi.advanceTimersByTime(YENILEME_MS);
    await vi.waitFor(() => expect(Object.keys(S.requests).sort()).toEqual([ILK, YENI]));
    expect(f).toHaveBeenCalledTimes(once + 1);
    kapat();
    vi.advanceTimersByTime(YENILEME_MS * 3);
    expect(f).toHaveBeenCalledTimes(once + 1);
  });

  // 1237: Ctrl K sonucu talebi, komut yeni talep penceresini adresle açar.
  it('açılış adresi: talep ayrıntısı bölümüyle açılır; yeni talep penceresi veri gelince açılır; bilinmeyen bölüm yok sayılır', async () => {
    vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    expect(acilisOku(new URLSearchParams(''))).toBeNull();
    expect(acilisOku(new URLSearchParams(`talep=${ILK}&bolum=boyle-yok`))).toEqual({ talep: ILK, bolum: null, yeniTalep: false });
    vi.stubGlobal('fetch', vi.fn(async () => json(200, acilis([talep(ILK, 'ST-2026-001')]))));
    const kok = document.createElement('div');
    document.body.append(kok);
    const kapat = merkeziBagla(kok, { rol: 'buyer', sayfa: 'requests', yol: '/satin-alma/talepler', git: () => {} });
    merkezAc(acilisOku(new URLSearchParams(`talep=${ILK}&bolum=order`))!);
    expect([V.page, V.id, V.tab]).toEqual(['request', ILK, 'order']);
    await vi.waitFor(() => expect(kok.querySelector('#main')?.textContent).toContain('ST-2026-001'));
    merkezAc(acilisOku(new URLSearchParams('yeni=talep'))!);
    await vi.waitFor(() => expect(kok.querySelector('#modal-root')?.textContent).toContain('Yeni satın alma talebi'));
    kapat();
  });
});
