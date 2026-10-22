import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cerceveBetigi, cerceveKoprusu } from './cerceve-kopru.ts';
import type { CerceveAyari } from './cerceve-kopru.ts';

// Çerçevenin üst penceresi testte pencerenin kendisidir (jsdom): giden istek postMessage casusundan okunur, cevap aynı
// pencereden gelen ileti olarak verilir.
interface Giden { kanal: string; yon: string; id: number; tip: string; veri: Record<string, unknown> }
type Cevap = { ok: boolean; veri?: unknown; durum?: number; hata?: string };

const ANAHTAR = 'recete-rota-motoru-v1';
const AYAR: CerceveAyari = {
  kanal: 'recete-rota',
  yazabilir: true,
  onek: 'recete-rota-motoru-v1',
  degerler: { [ANAHTAR]: { deger: '{"name":"Deneme fabrika"}', surum: 3 } },
  cihazAnahtarlari: [`${ANAHTAR}:op`],
  cihazDegerleri: {},
  catismaIletisi: 'Çatışma.',
  buyukIletisi: 'Büyük.',
  azamiBayt: 2000,
  beklemeMs: 800,
  tema: 'dark',
  kayitYazisi: "TMI'de kayıtlı",
  kayitUyari: false,
  oturumIletisi: 'Oturum.',
  reddIletisi: 'Ret.',
  kaydedilmediYazisi: 'Kaydedilmedi.',
  zamanAsimiMs: 30_000,
  gizliSeciciler: [],
};

let giden: Giden[] = [];
let cevaplar: (tip: string, veri: Record<string, unknown>) => Cevap;
let uyarilar: string[] = [];

beforeEach(() => {
  vi.useFakeTimers();
  giden = [];
  uyarilar = [];
  let surum = 10;
  cevaplar = () => ({ ok: true, veri: { kayit: { surum: ++surum } } });
  vi.spyOn(window, 'alert').mockImplementation((ileti?: unknown) => { uyarilar.push(String(ileti)); });
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
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); document.body.innerHTML = ''; document.documentElement.removeAttribute('data-theme'); });

const yazilanlar = () => giden.filter((g) => g.tip === 'kayit-yaz').map((g) => g.veri);

describe('çerçeve köprüsü', () => {
  it('KK-01: yerel depo açılış değerleriyle gelir; önekli anahtar beklemeden sonra ayrıştırılmış ve sürümüyle yazılır, ötekisi yazılmaz', async () => {
    cerceveKoprusu(window, AYAR);
    expect(window.localStorage.getItem(ANAHTAR)).toBe('{"name":"Deneme fabrika"}');
    window.localStorage.setItem(ANAHTAR, '{"name":"Deneme 2"}');
    window.localStorage.setItem('gecici', 'x');
    expect(yazilanlar()).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(1000);
    expect(yazilanlar()).toEqual([{ anahtar: ANAHTAR, bicim: 'json', deger: { name: 'Deneme 2' }, beklenenSurum: 3 }]);
    expect(window.localStorage.getItem('gecici')).toBe('x');
  });

  it('KK-02: art arda değişiklikler tek yazmada birleşir; sonraki yazma dönen sürümle gider; JSON olmayan değer metin olarak yazılır', async () => {
    cerceveKoprusu(window, AYAR);
    window.localStorage.setItem(ANAHTAR, '{"n":1}');
    window.localStorage.setItem(ANAHTAR, '{"n":2}');
    await vi.advanceTimersByTimeAsync(1000);
    window.localStorage.setItem(ANAHTAR, 'duz metin');
    await vi.advanceTimersByTimeAsync(1000);
    expect(yazilanlar()).toEqual([
      { anahtar: ANAHTAR, bicim: 'json', deger: { n: 2 }, beklenenSurum: 3 },
      { anahtar: ANAHTAR, bicim: 'metin', deger: 'duz metin', beklenenSurum: 11 },
    ]);
  });

  it('KK-03: yazma yoldayken gelen değişiklik bekler, öncekinin sürümüyle gider (iki yazma aynı sürümle çıkmaz)', async () => {
    let cevapla: (() => void) | null = null;
    vi.mocked(window.postMessage).mockImplementation((ileti: unknown) => {
      const m = ileti as Giden;
      if (m.yon !== 'istek') return;
      giden.push(m);
      const surum = giden.length === 1 ? 20 : 21;
      cevapla = () => { window.dispatchEvent(new MessageEvent('message', { data: { kanal: m.kanal, yon: 'yanit', id: m.id, ok: true, veri: { kayit: { surum } } }, source: window })); };
    });
    cerceveKoprusu(window, AYAR);
    window.localStorage.setItem(ANAHTAR, '{"n":1}');
    await vi.advanceTimersByTimeAsync(1000);
    window.localStorage.setItem(ANAHTAR, '{"n":2}');
    await vi.advanceTimersByTimeAsync(1000);
    expect(yazilanlar()).toHaveLength(1);
    (cevapla as unknown as () => void)();
    await vi.advanceTimersByTimeAsync(1000);
    expect(yazilanlar().map((v) => v['beklenenSurum'])).toEqual([3, 20]);
  });

  it('KK-04: çatışmada (409) bir kez uyarır ve yazmayı durdurur', async () => {
    cevaplar = () => ({ ok: false, durum: 409, hata: 'değişti' });
    cerceveKoprusu(window, AYAR);
    window.localStorage.setItem(ANAHTAR, '{"n":1}');
    await vi.advanceTimersByTimeAsync(1000);
    window.localStorage.setItem(ANAHTAR, '{"n":2}');
    await vi.advanceTimersByTimeAsync(10000);
    expect(uyarilar).toEqual(['Çatışma.']);
    expect(yazilanlar()).toHaveLength(1);
  });

  it('KK-05: sınırı aşan kayıt gönderilmez, bir kez uyarılır; bağlantı hatasında yeniden denenir', async () => {
    cerceveKoprusu(window, AYAR);
    window.localStorage.setItem(ANAHTAR, JSON.stringify({ t: 'x'.repeat(3000) }));
    await vi.advanceTimersByTimeAsync(1000);
    window.localStorage.setItem(ANAHTAR, JSON.stringify({ t: 'y'.repeat(3000) }));
    await vi.advanceTimersByTimeAsync(1000);
    expect(yazilanlar()).toHaveLength(0);
    expect(uyarilar).toEqual(['Büyük.']);
    let ilk = true;
    cevaplar = () => { if (ilk) { ilk = false; return { ok: false, durum: 0, hata: 'ağ' }; } return { ok: true, veri: { kayit: { surum: 30 } } }; };
    window.localStorage.setItem(ANAHTAR, '{"n":3}');
    await vi.advanceTimersByTimeAsync(1000);
    expect(yazilanlar()).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(7000);
    expect(yazilanlar()).toHaveLength(2);
    expect(yazilanlar()[1]).toEqual({ anahtar: ANAHTAR, bicim: 'json', deger: { n: 3 }, beklenenSurum: 3 });
  });

  it('KK-06: yazma işlemi olmayan kişide değişiklik yalnız bellekte kalır; silme sürümle gider', async () => {
    cerceveKoprusu(window, { ...AYAR, yazabilir: false });
    window.localStorage.setItem(ANAHTAR, '{"n":1}');
    await vi.advanceTimersByTimeAsync(1000);
    expect(giden.filter((g) => g.yon === 'istek' && g.tip !== undefined && g.kanal === 'recete-rota')).toHaveLength(0);
    expect(window.localStorage.getItem(ANAHTAR)).toBe('{"n":1}');
    cerceveKoprusu(window, AYAR);
    window.localStorage.removeItem(ANAHTAR);
    await vi.advanceTimersByTimeAsync(1000);
    expect(giden.filter((g) => g.tip === 'kayit-sil').map((g) => g.veri)).toEqual([{ anahtar: ANAHTAR, beklenenSurum: 3 }]);
  });

  it('KK-07: gömülen betik kayıt metniyle kapatılamaz', () => {
    const betik = cerceveBetigi({ ...AYAR, degerler: { [ANAHTAR]: { deger: '</script><script>alert(1)</script>', surum: 1 } } });
    expect(betik.match(/<\/script>/g)).toHaveLength(1);
    expect(betik.endsWith('</script>')).toBe(true);
  });

  it('KK-08: window.claude hiçbir yetenek vermez; indirme dahil hepsi null döner, prototip yerel depoyla çalışır', async () => {
    cerceveKoprusu(window, AYAR);
    const claude = (window as unknown as { claude: { use: (ad: string) => Promise<unknown> } }).claude;
    const istenen = Promise.all([claude.use('db'), claude.use('user'), claude.use('downloads')]);
    await vi.advanceTimersByTimeAsync(0);
    expect(await istenen).toEqual([null, null, null]);
  });

  it('KK-09: TMI teması kök öğeye geçer; "Bu cihazda kayıtlı" yazısı TMI kayıt yazısıyla değişir, başka yazıya dokunulmaz', async () => {
    cerceveKoprusu(window, AYAR);
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    document.body.innerHTML = '<span class="sync" id="sync">Bu cihazda kayıtlı</span>';
    await vi.advanceTimersByTimeAsync(0);
    expect(document.getElementById('sync')?.textContent).toBe("TMI'de kayıtlı");
    document.getElementById('sync')!.textContent = 'Hesabına kaydedildi';
    await vi.advanceTimersByTimeAsync(0);
    expect(document.getElementById('sync')?.textContent).toBe('Hesabına kaydedildi');
  });

  it('KK-10: cihaz anahtarı ortak kayda gitmez, kabuğa cihaz-yaz olarak gider (yazma işlemi olmasa da); açılış değeri cihazdan gelir', async () => {
    const OP = `${ANAHTAR}:op`;
    cerceveKoprusu(window, { ...AYAR, yazabilir: false, degerler: { ...AYAR.degerler, [OP]: { deger: '{"sta":"sunucu"}', surum: 4 } }, cihazDegerleri: { [OP]: '{"sta":"s11"}' } });
    expect(window.localStorage.getItem(OP)).toBe('{"sta":"s11"}');
    window.localStorage.setItem(OP, '{"sta":"s21"}');
    window.localStorage.removeItem(OP);
    await vi.advanceTimersByTimeAsync(1000);
    expect(yazilanlar()).toHaveLength(0);
    expect(giden.filter((g) => g.tip === 'cihaz-yaz').map((g) => g.veri)).toEqual([{ anahtar: OP, deger: '{"sta":"s21"}' }, { anahtar: OP, deger: null }]);
  });

  it('KK-17: window.tmi.komut komutu kabuğa iletir, kabuğun cevabını (sonuç ve yeniden okunan durum) döner; hata durum koduyla reddedilir', async () => {
    cerceveKoprusu(window, AYAR);
    const tmi = (window as unknown as { tmi: { komut: (ad: string, govde?: Record<string, unknown>) => Promise<unknown>; durum: () => Promise<unknown> } }).tmi;
    cevaplar = (tip) => (tip === 'komut' ? { ok: true, veri: { sonuc: { id: 4 }, durum: { opdefs: [] } } } : { ok: true, veri: { opdefs: [] } });
    expect(await tmi.komut('operasyon-tipi-ekle', { kod: 'KES-1' })).toEqual({ sonuc: { id: 4 }, durum: { opdefs: [] } });
    expect(await tmi.durum()).toEqual({ opdefs: [] });
    expect(giden.filter((g) => g.tip === 'komut' || g.tip === 'durum-oku').map((g) => [g.tip, g.veri])).toEqual([
      ['komut', { ad: 'operasyon-tipi-ekle', govde: { kod: 'KES-1' } }],
      ['durum-oku', {}],
    ]);
    cevaplar = () => ({ ok: false, durum: 400, hata: 'Bilinmeyen komut: x' });
    await expect(tmi.komut('x')).rejects.toEqual({ durum: 400, message: 'Bilinmeyen komut: x' });
    expect(giden.at(-1)?.veri).toEqual({ ad: 'x', govde: {} });
  });

  const syncKur = async () => { document.body.innerHTML = '<p id="sync" hidden>Bu cihazda kayıtlı</p>'; await vi.advanceTimersByTimeAsync(0); };
  const sync = () => { const e = document.getElementById('sync')!; return { yazi: e.textContent, gizli: e.hidden }; };

  it('KK-19: sunucunun reddettiği kayıtta (400) kullanıcı bir kez uyarılır, yazı kaydedilmediğini gösterir; sonraki başarılı yazma yazıyı düzeltir', async () => {
    cevaplar = () => ({ ok: false, durum: 400, hata: 'Geçersiz' });
    cerceveKoprusu(window, AYAR);
    await syncKur();
    window.localStorage.setItem(ANAHTAR, '{"n":1}');
    await vi.advanceTimersByTimeAsync(3000);
    window.localStorage.setItem(ANAHTAR, '{"n":2}');
    await vi.advanceTimersByTimeAsync(3000);
    expect(uyarilar).toEqual(['Ret.']);
    expect(yazilanlar()).toHaveLength(2);
    expect(sync()).toEqual({ yazi: 'Kaydedilmedi.', gizli: false });
    cevaplar = () => ({ ok: true, veri: { kayit: { surum: 40 } } });
    window.localStorage.setItem(ANAHTAR, '{"n":3}');
    await vi.advanceTimersByTimeAsync(3000);
    expect(sync()).toEqual({ yazi: "TMI'de kayıtlı", gizli: true });
    expect(uyarilar).toEqual(['Ret.']);
  });

  it('KK-20: cevapsız istek zaman aşımına düşer: komut durum 0 ile reddedilir, kayıt yazısı uyarır ve kayıt yeniden denenir; geç gelen cevabın sürümü alınır', async () => {
    const cevapsiz: Giden[] = [];
    let sustur = true;
    vi.mocked(window.postMessage).mockImplementation((ileti: unknown) => {
      const m = ileti as Giden;
      if (m.yon !== 'istek') return;
      giden.push(m);
      if (sustur) { cevapsiz.push(m); return; }
      queueMicrotask(() => { window.dispatchEvent(new MessageEvent('message', { data: { kanal: m.kanal, yon: 'yanit', id: m.id, ok: true, veri: { kayit: { surum: 51 } } }, source: window })); });
    });
    cerceveKoprusu(window, AYAR);
    await syncKur();
    const tmi = (window as unknown as { tmi: { komut: (ad: string) => Promise<unknown> } }).tmi;
    const komut = tmi.komut('x');
    const red = expect(komut).rejects.toMatchObject({ durum: 0 });
    window.localStorage.setItem(ANAHTAR, '{"n":1}');
    await vi.advanceTimersByTimeAsync(31_000);
    await red;
    expect(sync()).toEqual({ yazi: 'Kaydedilmedi.', gizli: false });
    // Zaman aşımına düşen yazmanın cevabı sonradan gelir: sunucu yazmıştı, sürümü alınır ve yeniden deneme o sürümle gider.
    const ilkYazma = cevapsiz.find((g) => g.tip === 'kayit-yaz')!;
    window.dispatchEvent(new MessageEvent('message', { data: { kanal: ilkYazma.kanal, yon: 'yanit', id: ilkYazma.id, ok: true, veri: { kayit: { surum: 50 } } }, source: window }));
    sustur = false;
    await vi.advanceTimersByTimeAsync(10_000);
    expect(yazilanlar().map((v) => v['beklenenSurum'])).toEqual([3, 50]);
    expect(sync()).toEqual({ yazi: "TMI'de kayıtlı", gizli: true });
    expect(uyarilar).toEqual([]);
  });

  // Testler aynı pencereyi paylaşır ve önceki köprünün gözlemcisi kalır: oturum düşmüş köprü kayıt yazısını "kaydedilmedi"de tutar, bu yüzden
  // bu test kayıt yazısına bakan testlerden sonra gelir.
  it.each([401, 403])('KK-18: oturum düşünce (%i) yazma durur, kullanıcı bir kez uyarılır, kayıt yazısı kaydedilmediğini gösterir (P2)', async (durum) => {
    cevaplar = () => ({ ok: false, durum, hata: 'Oturum yok' });
    cerceveKoprusu(window, AYAR);
    await syncKur();
    window.localStorage.setItem(ANAHTAR, '{"n":1}');
    await vi.advanceTimersByTimeAsync(3000);
    window.localStorage.setItem(ANAHTAR, '{"n":2}');
    await vi.advanceTimersByTimeAsync(10000);
    expect(uyarilar).toEqual(['Oturum.']);
    expect(yazilanlar()).toHaveLength(1);
    expect(sync()).toEqual({ yazi: 'Kaydedilmedi.', gizli: false });
  });

  it('KK-21: yetkisiz eylemin düğmesi çerçevede gizlenir, öteki düğmeler görünür; seçici yoksa stil eklenmez', () => {
    const stiller = () => Array.from(document.head.querySelectorAll('style'));
    const once = stiller().length;
    cerceveKoprusu(window, AYAR);
    expect(stiller()).toHaveLength(once);
    cerceveKoprusu(window, { ...AYAR, gizliSeciciler: ['[data-act="revApprove"]', '[data-act="revPanel"][data-v="approve"]'] });
    document.body.innerHTML = '<button data-act="revApprove">Onayla</button><button data-act="revPanel" data-v="approve">Onayla…</button><button data-act="revPanel" data-v="submit">Onaya gönder…</button>';
    const gorunum = (s: string) => window.getComputedStyle(document.querySelector(s)!).display;
    expect(gorunum('[data-act="revApprove"]')).toBe('none');
    expect(gorunum('[data-v="approve"]')).toBe('none');
    expect(gorunum('[data-v="submit"]')).not.toBe('none');
    stiller().slice(once).forEach((e) => { e.remove(); });
  });

  describe('kabuk görünümü', () => {
    interface GorunumIletisi { kanal: string; surum: number; tip: string; gorunum?: string; sira?: number }
    let gorunumler: GorunumIletisi[];
    type Tmi = {
      kaydet: (f: (ad: string) => string) => void; bildir: (ad: string) => void; sayaclar: (s: Record<string, unknown>) => void;
      komutlar: (liste: unknown, calistir: (anahtar: string) => void) => void;
      komutOnerici: (oner: (metin: string) => unknown, calistir: (anahtar: string) => void) => void;
    };
    const tmi = () => (window as unknown as { tmiGorunum: Tmi }).tmiGorunum;
    const kabuktan = (gorunum: string, sira: number) => {
      window.dispatchEvent(new MessageEvent('message', { data: { kanal: 'tmi-gorunum', surum: 1, tip: 'gorunum', gorunum, sira }, source: window }));
    };
    const degisenler = () => gorunumler.filter((g) => g.tip === 'gorunum-degisti');
    beforeEach(() => {
      gorunumler = [];
      const onceki = vi.mocked(window.postMessage).getMockImplementation()!;
      vi.mocked(window.postMessage).mockImplementation(((ileti: unknown, ...geri: unknown[]) => {
        const m = ileti as GorunumIletisi;
        if (m.kanal === 'tmi-gorunum') { gorunumler.push(m); return; }
        (onceki as (...a: unknown[]) => void)(ileti, ...geri);
      }) as typeof window.postMessage);
    });

    it('KK-11: ilk görünüm gelene kadar hazir yinelenir; görünüm gelince yinelenmez ve kayıtlı dinleyiciye iletilir', async () => {
      cerceveKoprusu(window, AYAR);
      const uygulanan: string[] = [];
      tmi().kaydet((ad) => { uygulanan.push(ad); return ad; });
      await vi.advanceTimersByTimeAsync(600);
      const hazirlar = gorunumler.filter((g) => g.tip === 'hazir').length;
      expect(hazirlar).toBeGreaterThanOrEqual(2);
      kabuktan('plan', 1);
      expect(uygulanan).toEqual(['plan']);
      await vi.advanceTimersByTimeAsync(1000);
      expect(gorunumler.filter((g) => g.tip === 'hazir')).toHaveLength(hazirlar);
    });

    it('KK-12: dinleyici kaydından önce gelen görünüm saklanır, kayıtta uygulanır; geçersiz ileti yok sayılır', () => {
      cerceveKoprusu(window, AYAR);
      kabuktan('', 1);
      kabuktan('plan', 0);
      window.dispatchEvent(new MessageEvent('message', { data: { kanal: 'tmi-gorunum', surum: 2, tip: 'gorunum', gorunum: 'plan', sira: 1 }, source: window }));
      const uygulanan: string[] = [];
      tmi().kaydet((ad) => { uygulanan.push(ad); return ad; });
      expect(uygulanan).toEqual([]);
      kabuktan('kanban', 2);
      expect(uygulanan).toEqual(['kanban']);
    });

    it('KK-13: gelen görünüm sonradan kaydedilen dinleyiciye gider', () => {
      cerceveKoprusu(window, AYAR);
      kabuktan('studio', 3);
      const uygulanan: string[] = [];
      tmi().kaydet((ad) => { uygulanan.push(ad); return ad; });
      expect(uygulanan).toEqual(['studio']);
    });

    it('KK-14: içeride sekme değişince gorunum-degisti son alınan sırayla gider; ilk görünümden önce ve aynı görünüm için gitmez', () => {
      cerceveKoprusu(window, AYAR);
      tmi().kaydet((ad) => ad);
      tmi().bildir('schema');
      expect(degisenler()).toEqual([]);
      kabuktan('plan', 4);
      tmi().bildir('plan');
      expect(degisenler()).toEqual([]);
      tmi().bildir('stock');
      tmi().bildir('stock');
      expect(degisenler()).toEqual([{ kanal: 'tmi-gorunum', surum: 1, tip: 'gorunum-degisti', gorunum: 'stock', sira: 4 }]);
    });

    it('KK-15: dinleyicinin döndürdüğü görünüm esastır; aynı görünüm sonradan bildirilmez', () => {
      cerceveKoprusu(window, AYAR);
      tmi().kaydet((ad) => (ad === 'bilinmeyen' ? 'orders' : ad));
      kabuktan('bilinmeyen', 1);
      tmi().bildir('orders');
      expect(degisenler()).toEqual([]);
    });

    it('KK-17: dinleyici kaydından önce gelen görünüm uygulanana kadar açılış sekmesi bildirilmez (bölüm adresiyle doğrudan giriş)', () => {
      cerceveKoprusu(window, AYAR);
      kabuktan('stock', 1);
      tmi().bildir('schema');
      expect(degisenler()).toEqual([]);
      const uygulanan: string[] = [];
      tmi().kaydet((ad) => { uygulanan.push(ad); return ad; });
      expect(uygulanan).toEqual(['stock']);
      tmi().bildir('stock');
      expect(degisenler()).toEqual([]);
      tmi().bildir('plan');
      expect(degisenler()).toEqual([{ kanal: 'tmi-gorunum', surum: 1, tip: 'gorunum-degisti', gorunum: 'plan', sira: 1 }]);
    });

    it('KK-16: sayaçlar kabuğa tam eşlem olarak gider; geçersiz değer null olur, aynı eşlem yinelenmez, değişen eşlem yeniden gider', () => {
      cerceveKoprusu(window, AYAR);
      const sayaclar = () => gorunumler.filter((g) => g.tip === 'sayaclar');
      tmi().sayaclar({ orders: 2, stock: 0, plan: null, ops: -1, items: 1.5, schema: Number.NaN });
      tmi().sayaclar({ orders: 2, stock: 0, plan: null, ops: -1, items: 1.5, schema: Number.NaN });
      expect(sayaclar()).toEqual([{ kanal: 'tmi-gorunum', surum: 1, tip: 'sayaclar', sayaclar: { orders: 2, stock: 0, plan: null, ops: null, items: null, schema: null } }]);
      tmi().sayaclar({ orders: 3 });
      expect(sayaclar()).toHaveLength(2);
      expect(sayaclar()[1]).toMatchObject({ sayaclar: { orders: 3 } });
      const cokAnahtar: Record<string, unknown> = { 'Büyük': 1, '1sayi': 2, 'a_b': 3, [`a${'b'.repeat(64)}`]: 4, __proto__x: 5, 'gecerli-1': 6 };
      for (let i = 0; i < 70; i += 1) cokAnahtar[`k${i}`] = i;
      tmi().sayaclar(cokAnahtar);
      const gelen = Object.keys((sayaclar()[2] as unknown as { sayaclar: Record<string, number | null> }).sayaclar);
      expect(gelen).toHaveLength(64);
      expect(gelen).toContain('gecerli-1');
      expect(gelen).not.toContain('Büyük');
      expect(gelen).not.toContain('1sayi');
      expect(gelen).not.toContain('a_b');
      expect(gelen.some((k) => k.length > 64)).toBe(false);
      tmi().sayaclar(null as unknown as Record<string, unknown>);
      tmi().sayaclar([1] as unknown as Record<string, unknown>);
      expect(sayaclar()).toHaveLength(3);
    });

    it('KK-22: komut listesi kabuğa tam liste olarak gider; biçime uymayan madde atılır, aynı liste yinelenmez, boş liste grubu kaldırır', () => {
      cerceveKoprusu(window, AYAR);
      const komutlar = () => gorunumler.filter((g) => g.tip === 'komutlar') as unknown as { komutlar: { anahtar: string }[] }[];
      const liste = [
        { anahtar: 'gun-ozeti', baslik: 'Gün özeti', simge: 'book' },
        { anahtar: 'ariza', baslik: 'Arıza gir', simge: 'alert', aciklama: 'Tezgâh duruyor', sozcukler: ['bakım'] },
        { anahtar: 'Buyuk', baslik: 'Geçersiz anahtar', simge: 'book' },
        { anahtar: 'bos', baslik: '  ', simge: 'book' },
        { anahtar: 'uzun', baslik: 'x'.repeat(81), simge: 'book' },
        { anahtar: 'simgesiz', baslik: 'Simgesiz' },
        { anahtar: 'sozcuk', baslik: 'Sözcük', simge: 'book', sozcukler: Array.from({ length: 9 }, () => 'a') },
        { anahtar: 'gun-ozeti', baslik: 'İkinci kez', simge: 'book' },
        null, 'metin',
      ];
      tmi().komutlar(liste, () => undefined);
      tmi().komutlar(liste, () => undefined);
      expect(komutlar()).toEqual([{ kanal: 'tmi-gorunum', surum: 1, tip: 'komutlar', komutlar: [
        { anahtar: 'gun-ozeti', baslik: 'Gün özeti', simge: 'book' },
        { anahtar: 'ariza', baslik: 'Arıza gir', simge: 'alert', aciklama: 'Tezgâh duruyor', sozcukler: ['bakım'] },
      ] }]);
      tmi().komutlar(Array.from({ length: 40 }, (_, i) => ({ anahtar: `k${i}`, baslik: `K${i}`, simge: 'book' })), () => undefined);
      expect(komutlar()[1]!.komutlar).toHaveLength(32);
      tmi().komutlar([], () => undefined);
      expect(komutlar()[2]!.komutlar).toEqual([]);
    });

    it('KK-23: kabuğun seçtiği komut yalnız son bildirilen listede varsa çalışır; listede olmayan, bozuk ya da başka kanaldaki ileti yok sayılır', () => {
      cerceveKoprusu(window, AYAR);
      const calisan: string[] = [];
      const kabuktanKomut = (data: unknown) => { window.dispatchEvent(new MessageEvent('message', { data, source: window })); };
      tmi().komutlar([{ anahtar: 'gun-ozeti', baslik: 'Gün özeti', simge: 'book' }], (a) => { calisan.push(a); });
      kabuktanKomut({ kanal: 'tmi-gorunum', surum: 1, tip: 'komut-calistir', anahtar: 'gun-ozeti' });
      expect(calisan).toEqual(['gun-ozeti']);
      kabuktanKomut({ kanal: 'tmi-gorunum', surum: 1, tip: 'komut-calistir', anahtar: 'geri-al' });
      kabuktanKomut({ kanal: 'tmi-gorunum', surum: 2, tip: 'komut-calistir', anahtar: 'gun-ozeti' });
      kabuktanKomut({ kanal: AYAR.kanal, surum: 1, tip: 'komut-calistir', anahtar: 'gun-ozeti' });
      kabuktanKomut({ kanal: 'tmi-gorunum', surum: 1, tip: 'komut-calistir', anahtar: 7 });
      window.dispatchEvent(new MessageEvent('message', { data: { kanal: 'tmi-gorunum', surum: 1, tip: 'komut-calistir', anahtar: 'gun-ozeti' }, source: null }));
      expect(calisan).toEqual(['gun-ozeti']);
      tmi().komutlar([], (a) => { calisan.push(a); });
      kabuktanKomut({ kanal: 'tmi-gorunum', surum: 1, tip: 'komut-calistir', anahtar: 'gun-ozeti' });
      expect(calisan).toEqual(['gun-ozeti']);
    });

    it('KK-24: yazılan metne öneriler kabuğun sırasıyla döner (en çok 8, bozuk madde atılır); yalnız son önerideki anahtar çalışır; bozuk metin cevapsız kalır', () => {
      cerceveKoprusu(window, AYAR);
      // Önceki testlerin köprüleri de pencereyi dinler (boş önericiyle cevaplar); bu köprü en son kurulduğu için her sıranın son cevabıdır.
      const oneriler = () => gorunumler.filter((g) => g.tip === 'komut-onerileri') as unknown as { sira: number; komutlar: { anahtar: string }[] }[];
      const son = (sira: number) => oneriler().filter((o) => o.sira === sira).at(-1);
      const kabuktan = (data: unknown) => { window.dispatchEvent(new MessageEvent('message', { data, source: window })); };
      const sorulan: string[] = [];
      const calisan: string[] = [];
      tmi().komutOnerici((metin) => {
        sorulan.push(metin);
        if (metin === 'patla') throw new Error('x');
        return [{ anahtar: 'oneri-0', baslik: 'SP-109 öne al', simge: 'up' }, { anahtar: 'Bozuk', baslik: 'x', simge: 'up' },
          ...Array.from({ length: 10 }, (_, i) => ({ anahtar: `oneri-${i + 1}`, baslik: `Öneri ${i + 1}`, simge: 'up' }))];
      }, (a) => { calisan.push(`oneri:${a}`); });
      tmi().komutlar([{ anahtar: 'gun-ozeti', baslik: 'Gün özeti', simge: 'book' }], (a) => { calisan.push(`liste:${a}`); });
      kabuktan({ kanal: 'tmi-gorunum', surum: 1, tip: 'komut-metni', metin: 'sp-109 ö', sira: 3 });
      expect(son(3)!.komutlar).toHaveLength(8);
      expect(son(3)!.komutlar.map((k) => k.anahtar)).not.toContain('Bozuk');
      kabuktan({ kanal: 'tmi-gorunum', surum: 1, tip: 'komut-calistir', anahtar: 'oneri-0' });
      kabuktan({ kanal: 'tmi-gorunum', surum: 1, tip: 'komut-calistir', anahtar: 'gun-ozeti' });
      kabuktan({ kanal: 'tmi-gorunum', surum: 1, tip: 'komut-calistir', anahtar: 'oneri-9' });
      expect(calisan).toEqual(['oneri:oneri-0', 'liste:gun-ozeti']);
      kabuktan({ kanal: 'tmi-gorunum', surum: 1, tip: 'komut-metni', metin: 'x'.repeat(201), sira: 4 });
      kabuktan({ kanal: 'tmi-gorunum', surum: 1, tip: 'komut-metni', metin: 'a', sira: 0 });
      kabuktan({ kanal: 'tmi-gorunum', surum: 1, tip: 'komut-metni', metin: 7, sira: 5 });
      kabuktan({ kanal: 'tmi-gorunum', surum: 2, tip: 'komut-metni', metin: 'a', sira: 6 });
      expect(oneriler().filter((o) => o.sira !== 3)).toEqual([]);
      kabuktan({ kanal: 'tmi-gorunum', surum: 1, tip: 'komut-metni', metin: 'patla', sira: 7 });
      expect(son(7)!.komutlar).toEqual([]);
      kabuktan({ kanal: 'tmi-gorunum', surum: 1, tip: 'komut-calistir', anahtar: 'oneri-0' });
      expect(calisan).toEqual(['oneri:oneri-0', 'liste:gun-ozeti']);
      expect(sorulan).toEqual(['sp-109 ö', 'patla']);
    });
  });
});
