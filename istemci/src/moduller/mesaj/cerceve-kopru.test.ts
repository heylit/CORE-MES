import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { anahtarParcasi, cerceveBetigi, cerceveKoprusu, yerelKoku } from './cerceve-kopru.ts';
import type { CerceveAyari } from './cerceve-kopru.ts';

// Çerçevenin üst penceresi testte pencerenin kendisidir (jsdom): giden istek postMessage casusundan okunur, cevap aynı
// pencereden gelen ileti olarak verilir.
interface Giden { kanal: string; yon: string; id: number; tip: string; veri: Record<string, unknown> }

const AYAR: CerceveAyari = {
  kanal: 'mesaj',
  kisi: { id: 7, ad: 'Deneme Kişi' },
  yazabilir: true,
  yonetici: false,
  yetenekler: ['db', 'user'],
  yerel: { kapsam: 'kisisel', onekler: ['kalici:'], degerler: { 'kalici:a': { deger: 'ilk', surum: 3 } }, catismaIletisi: 'Çatışma.' },
  tema: 'dark',
  yoklamaMs: 2500,
  azamiEkBayt: 1000,
};

let giden: Giden[] = [];
let cevaplar: (tip: string, veri: Record<string, unknown>) => { ok: boolean; veri?: unknown; durum?: number; hata?: string };

beforeEach(() => {
  vi.useFakeTimers();
  giden = [];
  cevaplar = () => ({ ok: true, veri: {} });
  vi.spyOn(window, 'postMessage').mockImplementation((ileti: unknown) => {
    const m = ileti as Giden;
    if (m.yon !== 'istek') return;
    giden.push(m);
    const c = cevaplar(m.tip, m.veri);
    queueMicrotask(() => {
      window.dispatchEvent(new MessageEvent('message', { data: { kanal: m.kanal, yon: 'yanit', id: m.id, ...c }, source: window }));
    });
  });
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

const kur = (ayar: CerceveAyari = AYAR) => {
  cerceveKoprusu(window, ayar);
  return window as unknown as Window & { claude: { use: (ad: string) => Promise<unknown> } };
};

describe('çerçeve köprüsü', () => {
  it('CK-01: yerel depo açılış değerleriyle gelir; önekli anahtar beklemeden sonra kişinin alanına yazılır, ötekisi yazılmaz', async () => {
    kur();
    expect(window.localStorage.getItem('kalici:a')).toBe('ilk');
    window.localStorage.setItem('kalici:b', 'iki');
    window.localStorage.setItem('gecici', 'x');
    expect(giden.filter((g) => g.tip === 'db-yaz')).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(1000);
    const yazilan = giden.filter((g) => g.tip === 'db-yaz');
    expect(yazilan.map((g) => g.veri)).toEqual([{ yol: `data/users/7/yerel/anahtarlar/${anahtarParcasi('kalici:b')}`, kip: 'tam', veri: { deger: 'iki' } }]);
    expect(window.localStorage.getItem('gecici')).toBe('x');
    // Kök koleksiyon yoludur (tek sayıda parça): belge yolu sunucuda 400 alır.
    for (const kapsam of ['kisisel', 'ortak'] as const) expect(yerelKoku({ kisi: AYAR.kisi, yerel: { ...AYAR.yerel, kapsam } }).split('/').length % 2).toBe(1);
  });

  it('CK-02: ortak yerel kayıt sürümle yazılır; çatışmada uyarır ve yazmayı durdurur', async () => {
    const uyari = vi.spyOn(window, 'alert').mockImplementation(() => undefined);
    cevaplar = (tip) => (tip === 'db-yaz' ? { ok: false, durum: 409, hata: 'Değişti.' } : { ok: true, veri: {} });
    kur({ ...AYAR, yerel: { ...AYAR.yerel, kapsam: 'ortak' } });
    window.localStorage.setItem('kalici:a', 'yeni');
    await vi.advanceTimersByTimeAsync(1000);
    expect(giden.find((g) => g.tip === 'db-yaz')?.veri).toEqual({ yol: 'yerel/kalici%3Aa', kip: 'tam', veri: { deger: 'yeni' }, beklenenSurum: 3 });
    expect(uyari).toHaveBeenCalledWith('Çatışma.');
    window.localStorage.setItem('kalici:a', 'daha');
    await vi.advanceTimersByTimeAsync(1000);
    expect(giden.filter((g) => g.tip === 'db-yaz')).toHaveLength(1);
  });

  // Akış A düzeltme planı (O1 kalıbı): 403 yetki reddidir, çakışma ya da bağlantı sorunu değildir; yazma yalnız o değişiklik için reddedilir.
  it('CK-02c: 403 alan yerel kayıtta yetki iletisi bir kez gösterilir, çakışma ya da bağlantı iletisi gösterilmez; yazma durmaz', async () => {
    for (const kapsam of ['ortak', 'kisisel'] as const) {
      const uyari = vi.spyOn(window, 'alert').mockImplementation(() => undefined);
      giden = [];
      cevaplar = (tip) => (tip === 'db-yaz' ? { ok: false, durum: 403, hata: 'Bu işlem için yetkiniz yok.' } : { ok: true, veri: {} });
      kur({ ...AYAR, yerel: { ...AYAR.yerel, kapsam } });
      window.localStorage.setItem('kalici:a', `${kapsam}-1`);
      await vi.advanceTimersByTimeAsync(1000);
      window.localStorage.setItem('kalici:a', `${kapsam}-2`);
      await vi.advanceTimersByTimeAsync(1000);
      expect(giden.filter((g) => g.tip === 'db-yaz'), kapsam).toHaveLength(2);
      expect(uyari, kapsam).toHaveBeenCalledTimes(1);
      expect(uyari.mock.calls[0]?.[0], kapsam).toMatch(/yetkiniz yok/);
      expect(uyari.mock.calls[0]?.[0], kapsam).not.toMatch(/Çatışma|Bağlantı/);
      uyari.mockRestore();
    }
  });

  it('CK-02b: yerel kayıt sunucuya yazılamazsa kullanıcı bir kez uyarılır; yazma sürer, başarıdan sonraki hata yeniden uyarır', async () => {
    const uyari = vi.spyOn(window, 'alert').mockImplementation(() => undefined);
    let basarili = false;
    cevaplar = (tip) => (tip === 'db-yaz' && !basarili ? { ok: false, durum: 500, hata: 'Sunucu.' } : { ok: true, veri: { belge: { surum: 4 } } });
    kur();
    window.localStorage.setItem('kalici:a', 'bir');
    await vi.advanceTimersByTimeAsync(1000);
    window.localStorage.setItem('kalici:a', 'iki');
    await vi.advanceTimersByTimeAsync(1000);
    expect(giden.filter((g) => g.tip === 'db-yaz')).toHaveLength(2);
    expect(uyari).toHaveBeenCalledTimes(1);
    expect(uyari.mock.calls[0]?.[0]).toMatch(/kaydedilemedi/);
    basarili = true;
    window.localStorage.setItem('kalici:a', 'uc');
    await vi.advanceTimersByTimeAsync(1000);
    basarili = false;
    window.localStorage.setItem('kalici:a', 'dort');
    await vi.advanceTimersByTimeAsync(1000);
    expect(uyari).toHaveBeenCalledTimes(2);
  });

  it('CK-02c: bağlantı ya da sunucu hatasında kayıt artan beklemeyle yeniden denenir ve son değer yazılır; geçersiz istek denenmez', async () => {
    const uyari = vi.spyOn(window, 'alert').mockImplementation(() => undefined);
    let kalanHata = 2;
    cevaplar = (tip) => {
      if (tip !== 'db-yaz') return { ok: true, veri: {} };
      if (kalanHata > 0) { kalanHata -= 1; return { ok: false, durum: 503, hata: 'Sunucu.' }; }
      return { ok: true, veri: { belge: { surum: 4 } } };
    };
    kur();
    window.localStorage.setItem('kalici:a', 'bir');
    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(5000);
    expect(giden.filter((g) => g.tip === 'db-yaz')).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(10_000);
    const yazilan = giden.filter((g) => g.tip === 'db-yaz');
    expect(yazilan).toHaveLength(3);
    expect(yazilan[2]?.veri.veri).toEqual({ deger: 'bir' });
    expect(uyari).toHaveBeenCalledTimes(1);
    expect(uyari.mock.calls[0]?.[0]).toMatch(/yeniden denenir/);
    await vi.advanceTimersByTimeAsync(120_000);
    expect(giden.filter((g) => g.tip === 'db-yaz')).toHaveLength(3);

    cevaplar = (tip) => (tip === 'db-yaz' ? { ok: false, durum: 400, hata: 'Geçersiz.' } : { ok: true, veri: {} });
    window.localStorage.setItem('kalici:a', 'iki');
    await vi.advanceTimersByTimeAsync(120_000);
    expect(giden.filter((g) => g.tip === 'db-yaz')).toHaveLength(4);
  });

  it('CK-03: window.claude listedeki yeteneği verir, ötekine null döner', async () => {
    const w = kur();
    const db = w.claude.use('db');
    const oda = w.claude.use('room');
    await vi.advanceTimersByTimeAsync(1);
    expect(await db).not.toBeNull();
    expect(await oda).toBeNull();
  });

  it('CK-04: sıralı ve sınırlı sorgu aboneliği koşulu sunucuya taşır, belgeleri kimlikleriyle verir; yazma aboneliği yeniler', async () => {
    let surum = 1;
    cevaplar = (tip) => (tip === 'db-sorgu'
      ? { ok: true, veri: { belgeler: [{ yol: 'kanallar/k1', kimlik: 'k1', veri: { ad: 'genel', surum }, surum }], damga: surum } }
      : { ok: true, veri: { belge: { yol: 'kanallar/k1', kimlik: 'k1', veri: {}, surum: 2 }, damga: 2 } });
    const w = kur();
    const sozDb = w.claude.use('db');
    await vi.advanceTimersByTimeAsync(1);
    const db = await sozDb as { collection: (y: string) => { orderBy: (a: string, y: string) => { limit: (n: number) => { onSnapshot: (f: (s: { docs: { id: string; data: () => unknown }[] }) => void) => () => void } } }; doc: (y: string) => { set: (v: unknown) => Promise<void> } };
    const anlar: unknown[][] = [];
    db.collection('kanallar').orderBy('createdAt', 'desc').limit(50).onSnapshot((s) => { anlar.push(s.docs.map((d) => [d.id, d.data()])); });
    await vi.advanceTimersByTimeAsync(1);
    expect(giden.find((g) => g.tip === 'db-sorgu')?.veri).toEqual({ koleksiyon: 'kanallar', sira: { alan: 'createdAt', yon: 'desc' }, sinir: 50 });
    expect(anlar).toEqual([[['k1', { ad: 'genel', surum: 1 }]]]);
    surum = 2;
    await db.doc('kanallar/k1').set({ ad: 'genel' });
    await vi.advanceTimersByTimeAsync(1);
    expect(anlar).toHaveLength(2);
  });

  it('CK-05: kişi yeteneği TMI kişisini ve yazma iznini verir', async () => {
    const w = kur();
    const soz = w.claude.use('user');
    await vi.advanceTimersByTimeAsync(1);
    const kisi = await soz as { me: () => Promise<{ id: string; name: string; isOwner: boolean }>; can: (a: string) => Promise<boolean | null> };
    expect(await kisi.me()).toMatchObject({ id: '7', name: 'Deneme Kişi', isOwner: false });
    expect(await kisi.can('data.write')).toBe(true);
  });

  it('CK-06: gömülecek betik ayarı kaçırır ve fonksiyonu kendi kendine yeten metin olarak taşır', () => {
    const betik = cerceveBetigi({ ...AYAR, kisi: { id: 1, ad: '</script><b>' } });
    expect(betik.startsWith('<script>(')).toBe(true);
    expect(betik.match(/<\/script/gi)).toHaveLength(1);
    expect(betik).toContain('\\u003c/script>');
  });

  // Karar 102 a: Ctrl K kabuğun ortak paletidir; çerçevenin komutu paletin "Bu sayfa" grubundan çalışır.
  it('CK-07: Ctrl K prototipe ulaşmadan kabuğa gider; başka tuş prototipte kalır', () => {
    const ust: unknown[] = [];
    vi.mocked(window.postMessage).mockImplementation((ileti: unknown) => { ust.push(ileti); });
    kur();
    const prototip = vi.fn();
    document.addEventListener('keydown', prototip);
    for (const ayar of [{ ctrlKey: true }, { metaKey: true }]) {
      const tus = new KeyboardEvent('keydown', { key: 'k', bubbles: true, cancelable: true, ...ayar });
      document.body.dispatchEvent(tus);
      expect(tus.defaultPrevented).toBe(true);
    }
    expect(prototip).not.toHaveBeenCalled();
    expect(ust.filter((i) => (i as { yon?: unknown }).yon === 'kisayol')).toEqual([
      { kanal: 'mesaj', yon: 'kisayol', tus: 'arama' }, { kanal: 'mesaj', yon: 'kisayol', tus: 'arama' },
    ]);
    // Reddedilen: Ctrl Alt K, düz k ve Ctrl J kabuğa gitmez.
    ust.length = 0;
    for (const ayar of [{ key: 'k', ctrlKey: true, altKey: true }, { key: 'k' }, { key: 'j', ctrlKey: true }]) {
      document.body.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...ayar }));
    }
    expect(prototip).toHaveBeenCalledTimes(3);
    expect(ust.filter((i) => (i as { yon?: unknown }).yon === 'kisayol')).toEqual([]);
    document.removeEventListener('keydown', prototip);
  });

  it('CK-08: komut listesi hazırla gider; seçilen komut prototipin düğmesini çalıştırır, bilinmeyen anahtar ve yabancı kaynak çalışmaz', () => {
    const ust: unknown[] = [];
    vi.mocked(window.postMessage).mockImplementation((ileti: unknown) => { ust.push(ileti); });
    kur();
    expect(ust).toContainEqual({ kanal: 'tmi-gorunum', surum: 1, tip: 'komutlar', komutlar: [expect.objectContaining({ anahtar: 'mesaj-ara', baslik: 'Mesajlarda ara', simge: 'search' })] });
    const eylemler: string[] = [];
    const tik = (o: Event) => { const a = (o.target as HTMLElement).dataset['act']; if (a !== undefined) eylemler.push(a); };
    window.addEventListener('click', tik);
    const gonder = (data: unknown, source: MessageEventSource | null = window) => { window.dispatchEvent(new MessageEvent('message', { data, source })); };
    gonder({ kanal: 'tmi-gorunum', surum: 1, tip: 'komut-calistir', anahtar: 'yok' });
    gonder({ kanal: 'tmi-gorunum', surum: 1, tip: 'komut-calistir', anahtar: 'mesaj-ara' }, null);
    expect(eylemler).toEqual([]);
    gonder({ kanal: 'tmi-gorunum', surum: 1, tip: 'komut-calistir', anahtar: 'mesaj-ara' });
    // Testte önceki köprüler de aynı pencerede dinler: her biri aynı düğmeyi çalıştırır.
    expect(eylemler.length).toBeGreaterThan(0);
    expect(new Set(eylemler)).toEqual(new Set(['search']));
    expect(document.querySelector('button[data-act]')).toBeNull();
    window.removeEventListener('click', tik);
  });
});
