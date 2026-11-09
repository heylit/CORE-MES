import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AcilisCevabi, Talep } from '#paylasilan/sozlesme/satin-alma.ts';
// Uygulamadaki yükleme sırası: store önce (store ile taşıyıcı birbirini döngüsel ithal eder).
import { S, V, persistUndoable, UNDO } from './store.ts';
import { openModal, toast } from './ui.ts';
import { YENILEME_MS, acilisOku, ayrintidanDon, merkezAc, merkezAdresi, merkeziBagla } from './bagla.ts';
import { go } from './ui.ts';

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
    const pencere = document.querySelector('#modal-root')!;
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

  // 1237: Ctrl K sonucu talebi adresle açar. 2405 a: eski yeni talep adresi merkezde pencere açmaz.
  it('açılış adresi: talep ayrıntısı bölümüyle açılır; bilinmeyen bölüm yok sayılır; yeni talep adresi yok sayılır', async () => {
    vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    expect(acilisOku(new URLSearchParams(''))).toBeNull();
    expect(acilisOku(new URLSearchParams(`talep=${ILK}&bolum=boyle-yok`))).toEqual({ talep: ILK, bolum: null });
    expect(acilisOku(new URLSearchParams('yeni=talep'))).toBeNull();
    vi.stubGlobal('fetch', vi.fn(async () => json(200, acilis([talep(ILK, 'ST-2026-001')]))));
    const kok = document.createElement('div');
    document.body.append(kok);
    const kapat = merkeziBagla(kok, { rol: 'buyer', sayfa: 'requests', yol: '/satin-alma/talepler', git: () => {} });
    merkezAc(acilisOku(new URLSearchParams(`talep=${ILK}&bolum=order`))!);
    expect([V.page, V.id, V.tab]).toEqual(['request', ILK, 'order']);
    await vi.waitFor(() => expect(kok.querySelector('#main')?.textContent).toContain('ST-2026-001'));
    expect(kok.querySelector('[data-act="new-request"]')).toBeNull();
    kapat();
  });

  // 2412: talep ayrıntısı adreste durur; tarayıcının geri tuşu listeye döner, ileri tuşu ve yenileme ayrıntıyı yeniden açar.
  it('talep ayrıntısı adrese ?talep= ile yazılır; geri tuşu ve geri düğmesi listeye döner; adresle açılış ayrıntıyı açar', async () => {
    vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    window.history.replaceState(null, '', '/satin-alma/talepler');
    vi.stubGlobal('fetch', vi.fn(async () => json(200, acilis([talep(ILK, 'ST-2026-001')]))));
    const gidilen: [string, boolean][] = [];
    const git = (y: string, yerine?: boolean) => { gidilen.push([y, yerine === true]); if (yerine) window.history.replaceState(null, '', y); else window.history.pushState(null, '', y); };
    let kok = document.createElement('div');
    document.body.append(kok);
    let kapat = merkeziBagla(kok, { rol: 'buyer', sayfa: 'requests', yol: '/satin-alma/talepler', git });
    await vi.waitFor(() => expect(Object.keys(S.requests)).toEqual([ILK]));
    go('request', ILK);
    expect(gidilen.at(-1)).toEqual([`/satin-alma/talepler?talep=${ILK}`, false]);
    expect(kok.querySelector('[data-act="ayrinti-geri"]')?.textContent).toContain('Taleplere dön');
    // Bölüm değişince geçmişe kayıt eklenmez.
    const kayit = gidilen.length;
    go('request', ILK, 'quotes');
    expect(gidilen.length).toBe(kayit);
    // Tarayıcının geri tuşu: adreste talep kalmaz, liste açılır.
    window.history.replaceState(null, '', '/satin-alma/talepler');
    merkezAdresi(null);
    expect([V.page, V.id]).toEqual(['requests', null]);
    // İleri tuşu: adresteki talep yeniden açılır.
    window.history.replaceState(null, '', `/satin-alma/talepler?talep=${ILK}`);
    merkezAdresi({ talep: ILK, bolum: null });
    expect([V.page, V.id]).toEqual(['request', ILK]);
    // Adresle açılan ayrıntının geri düğmesi geçmişe değil listeye gider.
    const geri = vi.spyOn(window.history, 'back').mockImplementation(() => {});
    ayrintidanDon();
    expect(geri).not.toHaveBeenCalled();
    expect(V.page).toBe('requests');
    // İçeriden açılan ayrıntının geri düğmesi tarayıcı geçmişinde bir adım döner.
    go('request', ILK);
    ayrintidanDon();
    expect(geri).toHaveBeenCalledTimes(1);
    kapat();
    // Yenileme: adreste talep varken ekran ayrıntıyla açılır.
    window.history.replaceState(null, '', `/satin-alma/talepler?talep=${ILK}`);
    V.page = 'requests'; V.id = null;
    kok = document.createElement('div');
    document.body.append(kok);
    kapat = merkeziBagla(kok, { rol: 'buyer', sayfa: 'requests', yol: '/satin-alma/talepler', git });
    expect([V.page, V.id]).toEqual(['request', ILK]);
    kapat();
    window.history.replaceState(null, '', '/');
  });

  // 2422: onay ekranı da Onaylar yolunda ?talep= ile durur; geri düğmesi Onaylar listesine döner.
  it('onaylayanın ayrıntısı /satin-alma/onaylar?talep= adresinde; geri tuşu listeye döner', async () => {
    vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    window.history.replaceState(null, '', '/satin-alma/onaylar');
    vi.stubGlobal('fetch', vi.fn(async () => json(200, acilis([talep(ILK, 'ST-2026-001')]))));
    const gidilen: string[] = [];
    const git = (y: string, yerine?: boolean) => { gidilen.push(y); if (yerine) window.history.replaceState(null, '', y); else window.history.pushState(null, '', y); };
    const kok = document.createElement('div');
    document.body.append(kok);
    const kapat = merkeziBagla(kok, { rol: 'approver', sayfa: 'dash', yol: '/satin-alma/onaylar', git });
    await vi.waitFor(() => expect(Object.keys(S.requests)).toEqual([ILK]));
    go('request', ILK);
    expect(gidilen.at(-1)).toBe(`/satin-alma/onaylar?talep=${ILK}`);
    expect(kok.querySelector('[data-act="ayrinti-geri"]')?.textContent).toContain('Onay bekleyenlere dön');
    window.history.replaceState(null, '', '/satin-alma/onaylar');
    merkezAdresi(null);
    expect([V.page, V.id]).toEqual(['dash', null]);
    kapat();
    window.history.replaceState(null, '', '/');
  });

  // 2165: pencere ortak pencerenin yapısıyla, bildirim ve geri al kabuğun ortak bildirimiyle çizilir.
  it('pencere ortak pencere bölmeleriyle açılır; kapat düğmesi ve perde kapatır, yapışkan perde kapatmaz', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json(200, acilis([talep(ILK, 'ST-2026-001')]))));
    const kok = document.createElement('div');
    document.body.append(kok);
    const kapat = merkeziBagla(kok, { rol: 'buyer', sayfa: 'requests', yol: '/satin-alma/talepler', git: () => {} });
    await vi.waitFor(() => expect(Object.keys(S.requests)).toEqual([ILK]));
    // Kök ortak pencere gibi gövdededir: kabuğun üst çubuğu perdenin altında kalır.
    expect(document.querySelector('#modal-root')!.parentElement).toBe(document.body);
    expect(kok.querySelector('#modal-root')).toBeNull();
    openModal('<div class="mh"><h2>Deneme</h2></div><div class="mb"><input id="ilk"></div><div class="mf"><button data-act="close">Vazgeç</button></div>', true);
    const pencere = document.querySelector<HTMLElement>('#modal-root > .tc-perde > .tc-pencere.tc-pencere-orta.sa-pencere-dar')!;
    expect(pencere.getAttribute('role')).toBe('dialog');
    expect(pencere.querySelector('.mh')!.classList.contains('tc-pencere-ust')).toBe(true);
    expect(pencere.querySelector('.mb')!.classList.contains('tc-pencere-govde')).toBe(true);
    expect(pencere.querySelector('.mf')!.classList.contains('tc-pencere-alt')).toBe(true);
    const baslik = pencere.querySelector('h2')!;
    expect(baslik.classList.contains('tc-pencere-baslik')).toBe(true);
    expect(pencere.getAttribute('aria-labelledby')).toBe(baslik.id);
    expect(document.activeElement?.id).toBe('ilk');
    pencere.querySelector<HTMLElement>('.tc-pencere-kapat')!.click();
    expect(document.querySelector('#modal-root')!.innerHTML).toBe('');
    openModal('<div class="mh"><h2>Yapışkan</h2></div><div class="mb"></div>', false, true);
    document.querySelector<HTMLElement>('.tc-perde')!.click();
    expect(document.querySelector('.tc-pencere')).not.toBeNull();
    openModal('<div class="mh"><h2>Serbest</h2></div><div class="mb"></div>', 'wide');
    expect(document.querySelector('.tc-pencere.sa-pencere-genis')).not.toBeNull();
    document.querySelector<HTMLElement>('.tc-perde')!.click();
    expect(document.querySelector('#modal-root')!.innerHTML).toBe('');
    kapat();
    expect(document.querySelector('#modal-root')).toBeNull();
  });

  it('bildirim ve geri al ortak bildirime gider; Geri al eylemi işlemi geri alır, eski iskelet alanları yok', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json(200, acilis([talep(ILK, 'ST-2026-001')]))));
    const bildirimler: { ton: string; mesaj: string; eylem?: { etiket: string; yap: () => void } }[] = [];
    const kaldirilan: number[] = [];
    const bildirim = {
      bildir: (ton: 'tamam' | 'bilgi' | 'hata', mesaj: string, secenek?: { eylem?: { etiket: string; yap: () => void } }) => { bildirimler.push({ ton, mesaj, eylem: secenek?.eylem }); return bildirimler.length; },
      kaldir: (no: number) => { kaldirilan.push(no); },
    };
    const kok = document.createElement('div');
    document.body.append(kok);
    const kapat = merkeziBagla(kok, { rol: 'buyer', sayfa: 'requests', yol: '/satin-alma/talepler', git: () => {}, bildirim });
    await vi.waitFor(() => expect(Object.keys(S.requests)).toEqual([ILK]));
    expect(kok.querySelector('#toast')).toBeNull();
    expect(kok.querySelector('#undo')).toBeNull();
    persistUndoable('requests', ILK, null, 'Talep silindi');
    expect(S.requests[ILK]).toBeUndefined();
    const geriAl = bildirimler.at(-1)!;
    expect([geriAl.ton, geriAl.mesaj, geriAl.eylem?.etiket]).toEqual(['tamam', 'Talep silindi', 'Geri al']);
    geriAl.eylem!.yap();
    expect(UNDO.pending).toBeNull();
    expect(S.requests[ILK]).toBeDefined();
    expect(kaldirilan).toEqual([bildirimler.indexOf(geriAl) + 1]);
    expect(bildirimler.at(-1)).toMatchObject({ ton: 'tamam', mesaj: 'Geri alındı' });
    toast('Tedarikçi seçin.');
    expect(bildirimler.at(-1)).toMatchObject({ ton: 'bilgi', mesaj: 'Tedarikçi seçin.' });
    kapat();
    toast('Bağlı değilken');
    expect(bildirimler.at(-1)!.mesaj).toBe('Tedarikçi seçin.');
  });
});
