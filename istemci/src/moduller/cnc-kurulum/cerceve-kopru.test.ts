import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cerceveBetigi, cerceveKoprusu } from './cerceve-kopru.ts';
import type { CerceveAyari } from './cerceve-kopru.ts';
import { glbYaz } from './glb.ts';

// Çerçevenin üst penceresi testte pencerenin kendisidir (jsdom): giden istek postMessage casusundan okunur, cevap aynı
// pencereden gelen ileti olarak verilir.
interface Giden { kanal: string; yon: string; id: number; tip: string; veri: Record<string, unknown> }
type Cevap = { ok: boolean; veri?: unknown; durum?: number; hata?: string };

const ANAHTAR = 'cnc-kurulum-motoru.v1';
const AYAR: CerceveAyari = {
  kanal: 'cnc-kurulum',
  yazabilir: true,
  onek: 'cnc-kurulum-motoru.',
  degerler: { [ANAHTAR]: { deger: '{"machine":"f5a"}', surum: 3 } },
  catismaIletisi: 'Çatışma.',
  buyukIletisi: 'Büyük.',
  azamiBayt: 2000,
  beklemeMs: 800,
  aktarabilir: false,
  aktarimSimgesi: 'M12 15V4',
  durumAnahtari: 'cnc-kurulum-motoru.v1',
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
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

const yazilanlar = () => giden.filter((g) => g.tip === 'kayit-yaz').map((g) => g.veri);
// Kullanıcının bir alana yazması; köprü ancak bundan sonra sunucuya yazar.
const eylemYap = () => { document.body.dispatchEvent(new Event('input', { bubbles: true })); };

describe('çerçeve köprüsü', () => {
  it('KK-01: yerel depo açılış değerleriyle gelir; önekli anahtar beklemeden sonra ayrıştırılmış ve sürümüyle yazılır, ötekisi yazılmaz', async () => {
    cerceveKoprusu(window, AYAR, glbYaz);
    eylemYap();
    expect(window.localStorage.getItem(ANAHTAR)).toBe('{"machine":"f5a"}');
    window.localStorage.setItem(ANAHTAR, '{"machine":"puma"}');
    window.localStorage.setItem('gecici', 'x');
    expect(yazilanlar()).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(1000);
    expect(yazilanlar()).toEqual([{ anahtar: ANAHTAR, bicim: 'json', deger: { machine: 'puma' }, beklenenSurum: 3 }]);
    expect(window.localStorage.getItem('gecici')).toBe('x');
  });

  it('KK-02: art arda değişiklikler tek yazmada birleşir; sonraki yazma dönen sürümle gider; JSON olmayan değer metin olarak yazılır', async () => {
    cerceveKoprusu(window, AYAR, glbYaz);
    eylemYap();
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
    cerceveKoprusu(window, AYAR, glbYaz);
    eylemYap();
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
    cerceveKoprusu(window, AYAR, glbYaz);
    eylemYap();
    window.localStorage.setItem(ANAHTAR, '{"n":1}');
    await vi.advanceTimersByTimeAsync(1000);
    window.localStorage.setItem(ANAHTAR, '{"n":2}');
    await vi.advanceTimersByTimeAsync(10000);
    expect(uyarilar).toEqual(['Çatışma.']);
    expect(yazilanlar()).toHaveLength(1);
  });

  it('KK-05: sınırı aşan kayıt gönderilmez, bir kez uyarılır; bağlantı hatasında yeniden denenir', async () => {
    cerceveKoprusu(window, AYAR, glbYaz);
    eylemYap();
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
    expect(uyarilar).toEqual(['Büyük.', expect.stringMatching(/yeniden denenir/)]);
  });

  it('KK-05b: bağlantı hatası art arda bir kez söylenir, başarıdan sonraki hata yeniden söylenir; yetki reddi söylenir ve yazma durur', async () => {
    cerceveKoprusu(window, AYAR, glbYaz);
    eylemYap();
    let hata = true;
    cevaplar = () => (hata ? { ok: false, durum: 503, hata: 'Sunucu.' } : { ok: true, veri: { kayit: { surum: 30 } } });
    window.localStorage.setItem(ANAHTAR, '{"n":1}');
    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(7000);
    expect(yazilanlar()).toHaveLength(2);
    expect(uyarilar).toHaveLength(1);
    hata = false;
    await vi.advanceTimersByTimeAsync(7000);
    expect(yazilanlar()).toHaveLength(3);
    hata = true;
    window.localStorage.setItem(ANAHTAR, '{"n":2}');
    await vi.advanceTimersByTimeAsync(1000);
    expect(uyarilar).toHaveLength(2);
    cevaplar = () => ({ ok: false, durum: 403, hata: 'Yetki.' });
    await vi.advanceTimersByTimeAsync(7000);
    expect(uyarilar[2]).toMatch(/yetkiniz yok/);
    const sayi = yazilanlar().length;
    window.localStorage.setItem(ANAHTAR, '{"n":3}');
    await vi.advanceTimersByTimeAsync(20_000);
    expect(yazilanlar()).toHaveLength(sayi);
    expect(uyarilar).toHaveLength(3);
  });

  it('KK-06: yazma işlemi olmayan kişide değişiklik yalnız bellekte kalır; silme sürümle gider', async () => {
    cerceveKoprusu(window, { ...AYAR, yazabilir: false }, glbYaz);
    window.localStorage.setItem(ANAHTAR, '{"n":1}');
    await vi.advanceTimersByTimeAsync(1000);
    expect(giden.filter((g) => g.yon === 'istek' && g.tip !== undefined && g.kanal === 'cnc-kurulum')).toHaveLength(0);
    expect(window.localStorage.getItem(ANAHTAR)).toBe('{"n":1}');
    cerceveKoprusu(window, AYAR, glbYaz);
    eylemYap();
    window.localStorage.removeItem(ANAHTAR);
    await vi.advanceTimersByTimeAsync(1000);
    expect(giden.filter((g) => g.tip === 'kayit-sil').map((g) => g.veri)).toEqual([{ anahtar: ANAHTAR, beklenenSurum: 3 }]);
  });

  it('KK-13: açılışta ve görünüm sekmesine basınca yazılmaz; ilk kullanıcı eyleminde bekleyen değişiklik yazılır', async () => {
    document.body.innerHTML = '<header><nav class="views"><button id="sekme">G-kod</button></nav></header><button id="hazirla">Hazırla</button>';
    cerceveKoprusu(window, AYAR, glbYaz);
    window.localStorage.setItem(ANAHTAR, '{"machine":"f5a","gsim":null}');
    await vi.advanceTimersByTimeAsync(1000);
    document.getElementById('sekme')?.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    window.localStorage.setItem(ANAHTAR, '{"machine":"f5a","gsim":{"n":1}}');
    await vi.advanceTimersByTimeAsync(1000);
    window.dispatchEvent(new Event('pagehide'));
    await vi.advanceTimersByTimeAsync(1000);
    expect(yazilanlar()).toHaveLength(0);
    expect(window.localStorage.getItem(ANAHTAR)).toBe('{"machine":"f5a","gsim":{"n":1}}');
    document.getElementById('hazirla')?.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    await vi.advanceTimersByTimeAsync(1000);
    expect(yazilanlar()).toEqual([{ anahtar: ANAHTAR, bicim: 'json', deger: { machine: 'f5a', gsim: { n: 1 } }, beklenenSurum: 3 }]);
    document.body.innerHTML = '';
  });

  it('KK-14: eylemden sonra sekmeye basmak yazmayı yeniden kapatmaz', async () => {
    document.body.innerHTML = '<header><nav class="views"><button id="sekme">G-kod</button></nav></header>';
    cerceveKoprusu(window, AYAR, glbYaz);
    document.body.dispatchEvent(new Event('keydown', { bubbles: true }));
    document.getElementById('sekme')?.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    window.localStorage.setItem(ANAHTAR, '{"n":5}');
    await vi.advanceTimersByTimeAsync(1000);
    expect(yazilanlar()).toEqual([{ anahtar: ANAHTAR, bicim: 'json', deger: { n: 5 }, beklenenSurum: 3 }]);
    document.body.innerHTML = '';
  });

  it('KK-15: STEP okuyucusu çerçevede yoktur; prototipin çağırdığı köprü ilk çağrıda kabuktan ister, ret hatası iletiyle döner', async () => {
    cerceveKoprusu(window, AYAR, glbYaz);
    const al = (window as unknown as { __tmiStepOkuyucu: () => Promise<string> }).__tmiStepOkuyucu;
    expect(giden.filter((g) => g.tip === 'step-okuyucu')).toHaveLength(0);
    cevaplar = (tip) => (tip === 'step-okuyucu' ? { ok: true, veri: 'WASM-METNI' } : { ok: true });
    expect(await al()).toBe('WASM-METNI');
    cevaplar = () => ({ ok: false, durum: 503, hata: 'STEP okuyucu yüklenemedi.' });
    await expect(al()).rejects.toMatchObject({ message: 'STEP okuyucu yüklenemedi.' });
  });

  it('KK-07: gömülen betik kayıt metniyle kapatılamaz', () => {
    const betik = cerceveBetigi({ ...AYAR, degerler: { [ANAHTAR]: { deger: '</script><script>alert(1)</script>', surum: 1 } } });
    expect(betik.match(/<\/script>/g)).toHaveLength(1);
    expect(betik.endsWith('</script>')).toBe(true);
  });

  it('KK-08: aktarım kapalıyken düğme konmaz', async () => {
    document.body.innerHTML = '<header><div class="hbtns"><button class="hbtn" id="xDefs">Tanımlar</button></div></header>';
    cerceveKoprusu(window, AYAR, glbYaz);
    await vi.advanceTimersByTimeAsync(10);
    expect(document.getElementById('tmiAktar')).toBeNull();
    expect(giden).toHaveLength(0);
  });

  describe('model aktarımı', () => {
    const g = window as unknown as Record<string, unknown>;
    let kurulan: unknown[] = [];
    const dugme = () => document.getElementById('tmiAktar') as HTMLButtonElement;
    beforeEach(() => {
      kurulan = [];
      document.body.innerHTML = '<header><div class="hbtns"><button class="hbtn" id="xDefs">Tanımlar</button></div></header>';
      g['CNCDATA'] = { MACHINES: [
        { id: 'vmc', no: 'F-09', name: 'Dikey', kind: 'm_vmc' },
        { id: 'f5a', no: 'F-01', name: 'Beş eksen', kind: 'm_5ax' },
      ] };
      g['CNC3D'] = { build: (it: unknown) => { kurulan.push(it); return { kok: true }; }, dispose: () => {} };
    });
    afterEach(() => { delete g['CNCDATA']; delete g['CNC3D']; document.body.innerHTML = ''; });

    it('KK-09: düğme üst çubuğun sonunda (sağ köşe) simgeyle durur; basınca prototipte seçili makineyle toplu aktarım istenir, model burada üretilmez', async () => {
      const glb = vi.fn(() => new Uint8Array([1, 2, 3]));
      const degerler = { [ANAHTAR]: { deger: '{"machine":"f5a","mo":{"f5a":{"name":"Beş eksen A"}}}', surum: 3 } };
      cerceveKoprusu(window, { ...AYAR, aktarabilir: true, degerler }, glb);
      expect(document.querySelector('header .hbtns')?.lastElementChild).toBe(dugme());
      expect(dugme().className).toBe('hbtn');
      expect(dugme().querySelector('path')?.getAttribute('d')).toBe('M12 15V4');
      expect(giden).toHaveLength(0);
      dugme().click();
      await vi.advanceTimersByTimeAsync(10);
      expect(giden.map((x) => [x.tip, x.veri])).toEqual([['toplu-ac', { makineId: 'f5a' }]]);
      expect(kurulan).toEqual([]);
      expect(glb).not.toHaveBeenCalled();
    });

    it('KK-10: kayıtta seçili makine yoksa toplu aktarım makinesiz istenir', async () => {
      cerceveKoprusu(window, { ...AYAR, aktarabilir: true, degerler: {} }, () => new Uint8Array([9]));
      dugme().click();
      await vi.advanceTimersByTimeAsync(10);
      expect(giden.map((x) => [x.tip, x.veri])).toEqual([['toplu-ac', {}]]);
    });

    it('KK-11: ipucu seçili makinenin işaretli geleceğini söyler ve prototip başka tezgâh kaydedince değişir', async () => {
      const degerler = { [ANAHTAR]: { deger: '{"machine":"f5a"}', surum: 3 } };
      cerceveKoprusu(window, { ...AYAR, aktarabilir: true, degerler }, () => new Uint8Array([9]));
      expect(dugme().title).toBe('Çizim Merkezi\'ne aktar: tezgâhları seçin (F-01 · Beş eksen işaretli gelir)');
      expect(dugme().getAttribute('aria-label')).toBe(dugme().title);
      window.localStorage.setItem(ANAHTAR, '{"machine":"vmc"}');
      expect(dugme().title).toBe('Çizim Merkezi\'ne aktar: tezgâhları seçin (F-09 · Dikey işaretli gelir)');
      window.localStorage.setItem(ANAHTAR, '{}');
      expect(dugme().title).toBe('Çizim Merkezi\'ne aktar: tezgâhları seçin');
      expect(giden.filter((x) => x.tip !== 'kayit-yaz')).toHaveLength(0);
    });

    it('KK-12: toplu kipte düğme konmaz; makine listesi (elle eklenen ve düzeltilen dahil) yollanır, istenen makinenin modeli üretilir', async () => {
      const degerler = { [ANAHTAR]: { deger: '{"customMachines":[{"id":"ozel","no":"","name":"Elle","kind":"m_vmc"}],"mo":{"vmc":{"name":"Dikey A"}}}', surum: 3 } };
      cerceveKoprusu(window, { ...AYAR, aktarabilir: true, yazabilir: false, toplu: true, degerler }, () => new Uint8Array([7]));
      expect(dugme()).toBeNull();
      expect(giden.filter((x) => x.tip === 'makine-listesi').map((x) => x.veri)).toEqual([{ makineler: [
        { makineId: 'vmc', no: 'F-09', ad: 'Dikey A' },
        { makineId: 'f5a', no: 'F-01', ad: 'Beş eksen' },
        { makineId: 'ozel', no: null, ad: 'Elle' },
      ] }]);
      const komut = (veri: Record<string, unknown>) => window.dispatchEvent(new MessageEvent('message', { data: { kanal: 'cnc-kurulum', yon: 'komut', ...veri }, source: window }));
      komut({ tip: 'model-uret', makineId: 'f5a' });
      komut({ tip: 'model-uret', makineId: 'yok' });
      komut({ tip: 'baska', makineId: 'vmc' });
      await vi.advanceTimersByTimeAsync(10);
      expect(kurulan).toEqual([{ kind: 'm_5ax' }]);
      expect(giden.filter((x) => x.tip === 'model-aktar').map((x) => x.veri['makineId'])).toEqual(['f5a']);
      expect(giden.filter((x) => x.tip === 'model-hatasi').map((x) => x.veri)).toEqual([{ ileti: 'Makine modeli bulunamadı.', makineId: 'yok' }]);
    });
  });

  describe('üretim emri seçimi', () => {
    const EMIR = 'cnc-kurulum-motoru.emir';
    const EMIRLER = [
      { id: 7, uretimEmriId: 70, emirNo: 'UE-7', opNo: 10, ad: 'Tornalama', parcaNo: 'P-A', parcaAd: 'Deneme mil', adet: 20, istasyon: 'Deneme torna' },
      { id: 8, uretimEmriId: 80, emirNo: 'UE-8', opNo: 20, ad: 'Frezeleme', parcaNo: 'P-B', parcaAd: 'Deneme flanş', adet: 5, istasyon: 'Deneme freze' },
    ];
    const ETIKET_7 = 'UE-7 · OP10 Tornalama · P-A Deneme mil · 20 adet · Deneme torna';
    let parcaYazilan: string[] = [];
    // Prototipin kurulum kartı: Parça No girdisi ve kartın girdi dinleyicisi (prototip durumuna yazar).
    const kartCiz = () => {
      document.getElementById('sheet')!.innerHTML = '<div class="meta"><label>Parça No<input id="mPart" value=""></label></div><div class="sh">Genel</div>';
    };
    const girdi = () => document.getElementById('tmiEmir') as HTMLInputElement;
    const sec = (deger: string) => { girdi().value = deger; girdi().dispatchEvent(new Event('change', { bubbles: true })); };
    beforeEach(() => {
      parcaYazilan = [];
      document.body.innerHTML = '<div id="sideScroll"><div id="sheet"></div></div>';
      document.getElementById('sideScroll')!.addEventListener('input', (e) => {
        const h = e.target as HTMLInputElement;
        if (h.id === 'mPart') parcaYazilan.push(h.value);
      });
      kartCiz();
      cevaplar = (tip) => (tip === 'emirler' ? { ok: true, veri: { emirler: EMIRLER } } : { ok: true, veri: { kayit: { surum: 20 } } });
    });
    afterEach(() => { document.body.innerHTML = ''; });

    it('KK-15: açık emirler seçenek olur; emir seçimi bekleyen yazmalardan sonra emir seçme isteğiyle gider, emir anahtarı çerçeveden yazılmaz', async () => {
      cerceveKoprusu(window, { ...AYAR, emirAnahtari: EMIR }, glbYaz);
      await vi.advanceTimersByTimeAsync(10);
      expect(giden.filter((g) => g.tip === 'emirler')).toHaveLength(1);
      expect([...document.querySelectorAll('#tmiEmirler option')].map((o) => (o as HTMLOptionElement).value)).toEqual([ETIKET_7, 'UE-8 · OP20 Frezeleme · P-B Deneme flanş · 5 adet · Deneme freze']);
      eylemYap();
      window.localStorage.setItem(ANAHTAR, '{"machine":"nlx"}');
      sec(ETIKET_7);
      expect(girdi().disabled).toBe(true);
      await vi.advanceTimersByTimeAsync(1000);
      // Önce durum yazılır, sonra yazmanın döndürdüğü sürümle emir seçilir; Parça No'ya çerçeve yazmaz (sunucu doldurur).
      // Aynı penceredeki önceki testlerin köprüleri de eylemle yazabilir: yalnız bu köprünün değerlerine bakılır.
      const tipler = giden.map((g) => g.tip);
      const nlx = giden.findIndex((g) => g.tip === 'kayit-yaz' && (g.veri['deger'] as { machine?: string } | null)?.machine === 'nlx');
      expect(nlx).toBeGreaterThan(-1);
      expect(tipler.indexOf('emir-sec')).toBeGreaterThan(nlx);
      expect(giden.find((g) => g.tip === 'emir-sec')?.veri).toEqual({ isEmriId: 7, beklenenSurum: 20 });
      expect(parcaYazilan).toEqual([]);
      // Seçimden sonra çerçeve yeniden kurulana kadar yazma durur; emir anahtarı yerelden yazılmaz.
      window.localStorage.setItem(ANAHTAR, '{"machine":"f5a"}');
      window.localStorage.setItem(EMIR, '{"id":8}');
      window.localStorage.setItem(`${EMIR}.7`, '{}');
      await vi.advanceTimersByTimeAsync(1000);
      expect(yazilanlar().filter((v) => (v['deger'] as { machine?: string } | null)?.machine === 'f5a' || String(v['anahtar']).startsWith(EMIR))).toEqual([]);
    });

    it('KK-16: listede olmayan metin, boş alan ve aynı emir seçim değildir; reddedilen seçimde alan eski haline döner', async () => {
      cerceveKoprusu(window, { ...AYAR, emirAnahtari: EMIR, degerler: { [EMIR]: { deger: JSON.stringify(EMIRLER[0]), surum: 2 } } }, glbYaz);
      await vi.advanceTimersByTimeAsync(10);
      for (const deger of ['UE-9', '', ETIKET_7]) {
        sec(deger);
        expect(girdi().value).toBe(ETIKET_7);
      }
      cevaplar = (tip) => (tip === 'emir-sec' ? { ok: false, durum: 400, hata: 'Üretim emri açık değil.' } : { ok: true, veri: { kayit: { surum: 20 } } });
      sec('UE-8 · OP20 Frezeleme · P-B Deneme flanş · 5 adet · Deneme freze');
      await vi.advanceTimersByTimeAsync(1000);
      expect(uyarilar).toEqual(['Üretim emri açık değil.']);
      expect([girdi().value, girdi().disabled]).toEqual([ETIKET_7, false]);
      expect(giden.filter((g) => g.tip !== 'emirler').map((g) => g.tip)).toEqual(['emir-sec']);
      // Yoldaki seçim varken gelen ikinci değişiklik gönderilmez.
      cevaplar = (tip) => (tip === 'emir-sec' ? { ok: true, veri: { emir: EMIRLER[1] } } : { ok: true, veri: { kayit: { surum: 20 } } });
      sec('UE-8 · OP20 Frezeleme · P-B Deneme flanş · 5 adet · Deneme freze');
      girdi().dispatchEvent(new Event('change', { bubbles: true }));
      await vi.advanceTimersByTimeAsync(1000);
      expect(giden.filter((g) => g.tip === 'emir-sec')).toHaveLength(2);
    });

    describe('"seçildi" ve "Kurulum tamam"', () => {
      const SECIM = 'cnc-kurulum-motoru.secim';
      // Prototipin adım bilgisi ve kurulum kartı: 7 genel adım, 3 cep (T2 boş), ölçüm ve sarf; toplam 12 adım.
      const ciz = (aktif: number) => {
        document.getElementById('stepNo')!.textContent = String(aktif + 1);
        const genel = ['Tezgâh', 'Malzeme', 'Bağlama', 'Çene', 'Sıfırlama', 'Koordinat', 'Soğutma']
          .map((ad, i) => `<div class="srow${i === aktif ? ' on' : ''}" data-i="${String(i)}"><span>${ad}</span><b>Seçenek ${String(i)}</b></div>`).join('');
        document.getElementById('sheet')!.innerHTML = `<div class="sh">Genel</div>${genel}<div class="tlist">`
          + '<div class="trow" data-i="7"><span class="tn">T01</span><span class="tt">Freze<small>tutucu</small></span></div>'
          + (aktif === 8 ? '<div class="trow on" data-i="8"><span class="tn">T02</span><span class="tt">Boş<small>boş</small></span></div>' : '')
          + '<div class="trow" data-i="9"><span class="tn">T03</span><span class="tt">Matkap<small>tutucu</small></span></div></div>'
          + '<div class="sh">Ölçüm Aletleri <em>1</em></div><div class="chips" data-i="10"><span>Kumpas</span></div>'
          + '<div class="sh">Sarf Malzemeleri <em>0</em></div><div class="chips" data-i="11"><span class="mut">—</span></div>';
      };
      const tamam = () => document.getElementById('tmiTamam') as HTMLButtonElement;
      const adimlar = () => JSON.parse(window.localStorage.getItem(SECIM) ?? '{"adimlar":{}}').adimlar as Record<string, boolean>;
      beforeEach(() => {
        document.body.innerHTML = '<div id="stepInfo"><div class="step">ADIM <b id="stepNo">1</b> / <span id="stepTotal">12</span></div></div><div id="sideScroll"><div id="sheet"></div></div>';
        ciz(0);
      });
      const kur = async (ek: Partial<CerceveAyari> = {}) => {
        cerceveKoprusu(window, { ...AYAR, emirAnahtari: EMIR, secimAnahtari: SECIM, degerler: { ...AYAR.degerler, [EMIR]: { deger: JSON.stringify(EMIRLER[0]), surum: 2 } }, ...ek }, glbYaz);
        await vi.advanceTimersByTimeAsync(10);
      };

      it('KK-23: adımdan ayrılınca adım "seçildi" olur ve kartta ve adım bilgisinde görünür; açılıştaki çizim ve salt okuyan işaretlemez', async () => {
        await kur();
        ciz(1);
        await vi.advanceTimersByTimeAsync(10);
        expect(adimlar()).toEqual({});
        eylemYap();
        ciz(2);
        await vi.advanceTimersByTimeAsync(10);
        ciz(8);
        await vi.advanceTimersByTimeAsync(10);
        ciz(10);
        await vi.advanceTimersByTimeAsync(10);
        // Cep sırası tezgâha göre değişir: anahtar prototipin adım anahtarıdır.
        expect(adimlar()).toEqual({ material: true, fixture: true, T2: true });
        expect([...document.querySelectorAll('#sheet .tmiSecildi')].map((e) => e.getAttribute('data-i') ?? e.textContent)).toEqual(['1', '2']);
        ciz(2);
        await vi.advanceTimersByTimeAsync(10);
        expect(document.getElementById('tmiAdimRozet')!.hidden).toBe(false);
        expect(adimlar()['gauges']).toBe(true);
        expect(document.querySelector('.sh.tmiSecildi')?.textContent).toContain('Ölçüm');
        await vi.advanceTimersByTimeAsync(1000);
        expect(yazilanlar().filter((v) => v['anahtar'] === SECIM).length).toBeGreaterThan(0);
        document.body.innerHTML = '<div id="stepInfo"><div class="step"><b id="stepNo">1</b><span id="stepTotal">12</span></div></div><div id="sheet"></div>';
        window.localStorage.removeItem(SECIM);
        await kur({ yazabilir: false });
        eylemYap();
        ciz(1);
        await vi.advanceTimersByTimeAsync(10);
        expect(window.localStorage.getItem(SECIM)).toBeNull();
        expect(document.getElementById('tmiTamam')).toBeNull();
      });

      it('KK-24: bütün adımlar seçilince "Kurulum tamam" açılır; seçimler tek sırada gelir, onay kişi ve saatle döner; seçim değişince yeniden onay istenir', async () => {
        const kayit = { kisi: { ad: 'Deneme yazar' }, zaman: '2026-10-17T07:30:00Z', gecerli: true };
        cevaplar = (tip) => (tip === 'emirler' ? { ok: true, veri: { emirler: EMIRLER } }
          : tip === 'kurulum-tamam' ? { ok: true, veri: { kurulum: kayit } } : { ok: true, veri: { kayit: { surum: 20 } } });
        await kur({ saatDilimi: 'Europe/Istanbul' });
        expect(tamam().disabled).toBe(true);
        // Bulunulan adım tamamla seçilmiş sayılır.
        expect(tamam().textContent).toBe('Kurulum tamamTamam1/11');
        eylemYap();
        // Boş cep (T02) gerekmez; son adım (sarf) üstündeyken tamam verilebilir.
        for (const i of [1, 2, 3, 4, 5, 6, 7, 9, 10, 11]) { ciz(i); await vi.advanceTimersByTimeAsync(10); }
        expect(tamam().textContent).toBe('Kurulum tamamTamam11/11');
        expect(tamam().disabled).toBe(false);
        const tuslar: string[] = [];
        const dinle = (o: KeyboardEvent): void => { tuslar.push(o.key); };
        window.addEventListener('keydown', dinle);
        tamam().click();
        // Çark önce başa döner, sonra her adımı tek tek geçip en alttaki karta iner.
        await vi.advanceTimersByTimeAsync(6000);
        window.removeEventListener('keydown', dinle);
        expect(tuslar).toEqual(['Home', ...Array<string>(11).fill('ArrowDown')]);
        const kutu = document.getElementById('tmiSonOnay')!;
        expect(kutu.querySelector('span')!.textContent).toBe('11 seçim kontrol edildi');
        expect(adimlar()['cons']).toBe(true);
        const onayla = [...kutu.querySelectorAll('button')].find((b) => b.textContent === 'Onayla')!;
        onayla.click();
        await vi.advanceTimersByTimeAsync(1000);
        const istek = giden.find((g) => g.tip === 'kurulum-tamam');
        expect(istek?.veri).toEqual({ beklenenSurum: 3 });
        // Bekleyen işaretler önce yazılır.
        expect(giden.map((g) => g.tip).lastIndexOf('kayit-yaz')).toBeLessThan(giden.map((g) => g.tip).indexOf('kurulum-tamam'));
        expect(kutu.querySelector('span')!.textContent).toMatch(/^Kurulum tamam · Deneme yazar · 17\D10 10:30$/);
        expect(onayla.hidden).toBe(true);
        expect(tamam().className).toContain('tamam');
        expect(tamam().title).toMatch(/^Kurulum tamam: Deneme yazar · 17\D10 10:30$/);
        [...kutu.querySelectorAll('button')].find((b) => b.textContent === 'Kapat')!.click();
        expect(document.getElementById('tmiSonOnay')).toBeNull();
      });

      it('KK-27: Hazırlık görünümünde hangi emrin hazırlığı olduğu ve kurulumunun durumu görünür; emir seçilmemişse bu söylenir', async () => {
        document.body.insertAdjacentHTML('beforeend', '<div id="prepStage"><div class="info prinfo"><div id="prStepNo">HAZIRLIK</div></div></div><aside id="prepSide"><div id="prPanel"></div></aside>');
        cevaplar = (tip) => (tip === 'hazirlik' ? { ok: true, veri: { onaylar: [], kurulum: { kisi: { ad: 'Deneme yazar' }, zaman: '2026-10-17T07:30:00Z', gecerli: true } } }
          : tip === 'emirler' ? { ok: true, veri: { emirler: EMIRLER } } : { ok: true, veri: {} });
        await kur({ saatDilimi: 'Europe/Istanbul' });
        expect(document.getElementById('tmiHzEmir')!.textContent).toBe('UE-7 · OP10 Tornalama · P-A Deneme mil · 20 adet');
        const kart = document.getElementById('tmiHzKart')!;
        expect(kart.nextElementSibling?.id).toBe('prPanel');
        expect(kart.querySelector('b')!.textContent).toBe('UE-7 · OP10 Tornalama');
        expect(kart.querySelector('span')!.textContent).toBe('P-A Deneme mil · 20 adet · Deneme torna');
        expect(kart.querySelector('em')!.textContent).toMatch(/^✓ Kurulum tamam · Deneme yazar · 17\D10 10:30$/);
        document.body.innerHTML = '<div id="prepStage"><div class="info prinfo"></div></div><aside id="prepSide"><div id="prPanel"></div></aside>';
        cerceveKoprusu(window, { ...AYAR, emirAnahtari: EMIR, secimAnahtari: SECIM }, glbYaz);
        await vi.advanceTimersByTimeAsync(10);
        expect(document.getElementById('tmiHzEmir')!.textContent).toBe('Üretim emri seçilmedi · Kurulum ekranında seçin');
        expect(document.querySelector('#tmiHzKart b')!.textContent).toBe('Seçilmedi');
        expect(document.querySelector('#tmiHzKart em')).toBeNull();
      });

      it('KK-25: hazırlık okumasıyla gelen kurulum kaydı düğmede ve onay kaydında görünür; eskimiş kayıt yeniden onay ister', async () => {
        document.body.insertAdjacentHTML('beforeend', '<div id="prPanel"></div>');
        cevaplar = (tip) => (tip === 'hazirlik' ? { ok: true, veri: { onaylar: [], kurulum: { kisi: { ad: 'Deneme yazar' }, zaman: '2026-10-17T07:30:00Z', gecerli: false } } }
          : tip === 'emirler' ? { ok: true, veri: { emirler: EMIRLER } } : { ok: true, veri: {} });
        await kur({ saatDilimi: 'Europe/Istanbul' });
        expect(tamam().className).toContain('degisti');
        expect(tamam().textContent).toContain('Yeniden onayla');
        expect(document.getElementById('tmiKurulumKisi')!.textContent).toMatch(/^Deneme yazar · 17\D10 10:30 · değişti$/);
        expect(document.getElementById('tmiOnaylar')!.textContent).toMatch(/Kurulum tamamDeneme yazar · 17\D10 10:30 \(seçimler değişti\)/);
      });
    });

    it('KK-17: kart yeniden çizilince alan seçili emirle geri gelir; kapanmış emir "açık değil" diye görünür', async () => {
      const kapali = { ...EMIRLER[1]!, id: 99, emirNo: 'UE-99' };
      cerceveKoprusu(window, { ...AYAR, emirAnahtari: EMIR, degerler: { [EMIR]: { deger: JSON.stringify(kapali), surum: 2 } } }, glbYaz);
      await vi.advanceTimersByTimeAsync(10);
      expect(girdi().value).toBe('UE-99 · OP20 Frezeleme · P-B Deneme flanş · 5 adet · Deneme freze (açık değil)');
      kartCiz();
      await vi.advanceTimersByTimeAsync(10);
      expect(document.querySelectorAll('#tmiEmir')).toHaveLength(1);
      expect(girdi().value).toContain('UE-99');
    });

    it('KK-18: yazma işlemi olmayan kişide alan salt okunur; liste alınamazsa alan bunu söyler; anahtar verilmezse ya da toplu kipte alan konmaz', async () => {
      cevaplar = (tip) => (tip === 'emirler' ? { ok: false, durum: 403, hata: 'Yetki yok.' } : { ok: true, veri: {} });
      cerceveKoprusu(window, { ...AYAR, yazabilir: false, emirAnahtari: EMIR }, glbYaz);
      await vi.advanceTimersByTimeAsync(10);
      expect(girdi().readOnly).toBe(true);
      expect(girdi().placeholder).toBe('Emir listesi alınamadı');
      document.body.innerHTML = '<div id="sheet"><div class="meta"></div></div>';
      giden = [];
      cerceveKoprusu(window, AYAR, glbYaz);
      cerceveKoprusu(window, { ...AYAR, toplu: true, yazabilir: false, emirAnahtari: EMIR }, glbYaz);
      await vi.advanceTimersByTimeAsync(10);
      expect(document.getElementById('tmiEmir')).toBeNull();
      expect(giden.filter((g) => g.tip === 'emirler')).toHaveLength(0);
    });

    it('KK-18b (182 a): emir listesini göremeyen kişide liste istenmez, alan salt okunur ve nedenini söyler; görebilende istenir', async () => {
      cevaplar = (tip) => (tip === 'emirler' ? { ok: true, veri: { emirler: EMIRLER } } : { ok: true, veri: {} });
      cerceveKoprusu(window, { ...AYAR, yazabilir: true, emirAnahtari: EMIR, emirGorebilir: false }, glbYaz);
      await vi.advanceTimersByTimeAsync(10);
      expect(giden.filter((g) => g.tip === 'emirler')).toHaveLength(0);
      expect(girdi().readOnly).toBe(true);
      expect(girdi().placeholder).toBe('Emir listesini görme yetkiniz yok');
      document.body.innerHTML = '<div id="sheet"><div class="meta"></div></div>';
      giden = [];
      cerceveKoprusu(window, { ...AYAR, yazabilir: true, emirAnahtari: EMIR, emirGorebilir: true }, glbYaz);
      await vi.advanceTimersByTimeAsync(10);
      expect(giden.filter((g) => g.tip === 'emirler')).toHaveLength(1);
      expect(girdi().readOnly).toBe(false);
    });

    it('KK-22: alan kurulum görünümünde sahnenin üstünde ayrı çubuktur; panel yeniden çizilince çoğalmaz; açık emir yoksa alan bunu söyler', async () => {
      document.body.innerHTML = '<div id="stage"></div><aside id="side"><section id="detail"><h3>Tezgah</h3></section><div id="sideScroll"><div id="sheet"></div></div></aside>';
      kartCiz();
      cevaplar = (tip) => (tip === 'emirler' ? { ok: true, veri: { emirler: [] } } : { ok: true, veri: {} });
      cerceveKoprusu(window, { ...AYAR, emirAnahtari: EMIR }, glbYaz);
      await vi.advanceTimersByTimeAsync(10);
      const cubuk = girdi().closest('#tmiEmirCubugu')!;
      expect(cubuk.parentElement).toBe(document.body);
      expect(cubuk.getAttribute('data-page')).toBe('setup');
      expect(document.querySelector('#stage #tmiEmir, #side #tmiEmir')).toBeNull();
      expect(girdi().placeholder).toBe('Açık üretim emri yok');
      // Sağ panelde kurulum kartı üste, önizleme en alta iner.
      const duzen = document.getElementById('tmiDuzen')!.textContent;
      expect(duzen).toContain('#side #sideScroll{order:1}');
      expect(duzen).toContain('#side .previewBox{order:3');
      document.getElementById('detail')!.innerHTML = '<h3>Tezgah 2</h3>';
      kartCiz();
      await vi.advanceTimersByTimeAsync(10);
      expect(document.querySelectorAll('#tmiEmir')).toHaveLength(1);
      expect(document.querySelectorAll('#tmiDuzen')).toHaveLength(1);
    });
  });

  describe('hazırlık onay kaydı', () => {
    const ONAYLAR = [
      { adim: 'machine', olay: 'onay', imza: 'm1', kisi: { id: 3, ad: 'Deneme Operatör' }, zaman: '2026-10-16T09:05:00+03:00' },
      { adim: 'T1', olay: 'onay', imza: 'eski', kisi: { id: 3, ad: 'Deneme Operatör' }, zaman: '2026-10-16T09:06:00+03:00' },
      { adim: 'final', olay: 'tamam', imza: 'hepsi', kisi: { id: 4, ad: 'Deneme Yazar' }, zaman: '2026-10-16T09:10:00+03:00' },
    ];
    const durum = (fin: unknown) => JSON.stringify({ machine: 'f5a', prep: { done: { machine: 'm1', T1: 'yeni' }, fin } });
    beforeEach(() => {
      document.body.innerHTML = '<div id="prPanel"><div class="sh">Panel</div></div>';
      cevaplar = (tip) => (tip === 'hazirlik' ? { ok: true, veri: { onaylar: ONAYLAR } } : tip === 'emirler' ? { ok: true, veri: { emirler: [] } } : { ok: true, veri: { kayit: { surum: 30 } } });
    });
    afterEach(() => { document.body.innerHTML = ''; });
    const satirlar = () => [...document.querySelectorAll('#tmiOnaylar .srow')].map((r) => [...r.children].map((c) => c.textContent));

    it('KK-19: panelin sonunda seçili emir ve imzası hâlâ tutan onaylar kişi ve saatle listelenir; panel yeniden çizilince liste geri gelir, durum yazılınca yenilenir', async () => {
      cerceveKoprusu(window, {
        ...AYAR, emirAnahtari: 'cnc-kurulum-motoru.emir', saatDilimi: 'Europe/Istanbul',
        degerler: { [ANAHTAR]: { deger: durum(null), surum: 3 }, 'cnc-kurulum-motoru.emir': { deger: '{"id":7,"emirNo":"UE-7","parcaNo":"P-A"}', surum: 1 } },
      }, glbYaz);
      await vi.advanceTimersByTimeAsync(10);
      expect(satirlar()).toEqual([['Üretim emri', 'UE-7 · P-A'], ['Tezgâh', expect.stringMatching(/^Deneme Operatör · 16[./]10 09:05$/) as unknown as string]]);
      document.getElementById('prPanel')!.innerHTML = '<div>yeni çizim</div>';
      await vi.advanceTimersByTimeAsync(10);
      expect(satirlar()).toHaveLength(2);
      eylemYap();
      window.localStorage.setItem(ANAHTAR, durum({ ts: 1, sig: 'hepsi' }));
      await vi.advanceTimersByTimeAsync(1000);
      expect(giden.filter((g) => g.tip === 'hazirlik')).toHaveLength(2);
      expect(satirlar().map((r) => r[0])).toEqual(['Üretim emri', 'Tezgâh', 'Hazırlık tamamlandı']);
    });

    it('KK-20: geçerli onay yoksa "yok" yazar; toplu kipte liste konmaz', async () => {
      cevaplar = (tip) => (tip === 'hazirlik' ? { ok: true, veri: { onaylar: [] } } : tip === 'emirler' ? { ok: true, veri: { emirler: [] } } : { ok: true, veri: {} });
      cerceveKoprusu(window, AYAR, glbYaz);
      await vi.advanceTimersByTimeAsync(10);
      expect(satirlar()).toEqual([['Onaylanan adım', 'yok']]);
      document.body.innerHTML = '<div id="prPanel"></div>';
      giden = [];
      cerceveKoprusu(window, { ...AYAR, toplu: true, yazabilir: false }, glbYaz);
      await vi.advanceTimersByTimeAsync(10);
      expect(document.getElementById('tmiOnaylar')).toBeNull();
      expect(giden.filter((g) => g.tip === 'hazirlik')).toHaveLength(0);
    });
  });

  describe('takım stoğu (163 b, 164 b)', () => {
    const KART = { malzemeId: 4, kod: 'DB-1', ad: 'Freze 10' };
    const durum = JSON.stringify({ machine: 'f5a', inv: { 'f-10': { qty: 6, min: 1, loc: '', tmiStok: KART }, 'u-2': { qty: 3, min: 0, loc: '' } } });
    // Prototipin Kütüphane ayrıntısı: seçili satır `tr.cur`, adet alanı ve düğmeleri `.sgrid` içinde.
    const ayrintiCiz = (kimlik: string) => {
      document.querySelector('#libList tr.cur')?.classList.remove('cur');
      document.querySelector(`#libList tr[data-key="${kimlik}"]`)!.classList.add('cur');
      document.getElementById('libDetail')!.innerHTML = '<h3>Kalem</h3><div class="sgrid"><div class="stp"><button data-a="q-">−</button><input id="lQty" value="6"><button data-a="q+">+</button></div></div><div class="sh">Hangi tezgâhta aktif</div>';
    };
    beforeEach(() => {
      document.body.innerHTML = '<table id="libList"><tr data-key="f-10" data-id="f-10"></tr><tr data-key="u-2" data-id="lv_u-2"></tr></table><section id="libDetail"></section>';
      ayrintiCiz('f-10');
      cevaplar = (tip) => (tip === 'stok-kartlari' ? { ok: true, veri: { kartlar: [KART, { malzemeId: 9, kod: 'SF-3', ad: 'Uç' }], toplam: 25 } }
        : tip === 'hazirlik' ? { ok: true, veri: { onaylar: [] } } : tip === 'emirler' ? { ok: true, veri: { emirler: [] } } : { ok: true, veri: { kart: null } });
    });
    afterEach(() => { document.body.innerHTML = ''; });
    const bolum = () => document.getElementById('tmiStokKarti');
    const gizli = (a: string) => document.querySelector(`#libDetail button[data-a="${a}"]`)!.hasAttribute('hidden');

    it('KK-30: bağlı kalemde kart görünür, adet salt okunur, artırma gizlidir; azaltma yalnız stoktan düşebilende kalır; bağsız kalemde kart bağlayamayana bölüm yoktur', async () => {
      cerceveKoprusu(window, { ...AYAR, degerler: { [ANAHTAR]: { deger: durum, surum: 3 } }, stokDusebilir: true }, glbYaz);
      await vi.advanceTimersByTimeAsync(10);
      expect([...bolum()!.querySelectorAll('.srow > *')].map((e) => e.textContent)).toEqual(['DB-1', 'Freze 10']);
      expect(bolum()!.previousElementSibling?.className).toBe('sgrid');
      expect((document.getElementById('lQty') as HTMLInputElement).readOnly).toBe(true);
      expect([gizli('q+'), gizli('q-')]).toEqual([true, false]);
      expect(bolum()!.querySelector('[data-tmi]')).toBeNull();
      // Prototip ayrıntıyı yeniden çizince bölüm geri gelir; bağsız kalemde bölüm ve kısıt yoktur.
      ayrintiCiz('f-10');
      await vi.advanceTimersByTimeAsync(10);
      expect(bolum()).not.toBeNull();
      ayrintiCiz('u-2');
      await vi.advanceTimersByTimeAsync(10);
      expect(bolum()).toBeNull();
      expect((document.getElementById('lQty') as HTMLInputElement).readOnly).toBe(false);
      expect([gizli('q+'), gizli('q-')]).toEqual([false, false]);
      document.body.innerHTML = '<table id="libList"><tr data-key="f-10"></tr></table><section id="libDetail"></section>';
      ayrintiCiz('f-10');
      cerceveKoprusu(window, { ...AYAR, degerler: { [ANAHTAR]: { deger: durum, surum: 3 } } }, glbYaz);
      await vi.advanceTimersByTimeAsync(10);
      expect([gizli('q+'), gizli('q-')]).toEqual([true, true]);
    });

    it('KK-31: kartı yazabilen kişi kalemi arayıp bağlar, kartını değiştirir ya da bağı kaldırır; bağlama bekleyen yazmalardan sonra gider, ret iletisi görünür', async () => {
      vi.spyOn(window, 'confirm').mockReturnValue(true);
      cerceveKoprusu(window, { ...AYAR, degerler: { [ANAHTAR]: { deger: durum, surum: 3 } }, stokKartiBaglayabilir: true }, glbYaz);
      await vi.advanceTimersByTimeAsync(10);
      const dugme = (ad: string) => [...bolum()!.querySelectorAll('button')].find((b) => b.textContent === ad)!;
      ayrintiCiz('u-2');
      await vi.advanceTimersByTimeAsync(10);
      expect(bolum()!.textContent).toContain('Stok kartına bağlı değil');
      dugme('Stok kartına bağla').click();
      await vi.advanceTimersByTimeAsync(10);
      expect(giden.filter((g) => g.tip === 'stok-kartlari').map((g) => g.veri)).toEqual([{ metin: '', sayfa: 1 }]);
      expect([...bolum()!.querySelectorAll('[data-tmi-kart]')].map((r) => r.textContent)).toEqual(['DB-1Freze 10', 'SF-3Uç']);
      expect(bolum()!.textContent).toContain('25 karttan ilk 2 gösteriliyor');
      // Yazılan arama beklemeden sonra gider; alan odağını korur.
      const girdi = document.getElementById('tmiStokAra') as HTMLInputElement;
      girdi.focus();
      girdi.value = 'uç';
      girdi.dispatchEvent(new Event('input', { bubbles: true }));
      await vi.advanceTimersByTimeAsync(400);
      expect(giden.filter((g) => g.tip === 'stok-kartlari').map((g) => g.veri['metin'])).toEqual(['', 'uç']);
      expect(document.activeElement?.id).toBe('tmiStokAra');
      // Bağlama, önce bekleyen değişiklik yazılınca gider.
      eylemYap();
      window.localStorage.setItem(ANAHTAR, durum.replace('"qty":3', '"qty":2'));
      (bolum()!.querySelector('[data-tmi-kart="9"]') as HTMLElement).click();
      await vi.advanceTimersByTimeAsync(2000);
      expect(giden.map((g) => g.tip).filter((t) => t === 'kayit-yaz' || t === 'stok-karti-bagla')).toEqual(['kayit-yaz', 'stok-karti-bagla']);
      expect(giden.find((g) => g.tip === 'stok-karti-bagla')?.veri).toEqual({ kimlik: 'u-2', malzemeId: 9 });
      // Bağlı kalemde kart değiştirilir ya da bağ kaldırılır; ret iletisi bölümde görünür.
      ayrintiCiz('f-10');
      await vi.advanceTimersByTimeAsync(10);
      expect(bolum()!.querySelector('[data-tmi-kart]')).toBeNull();
      cevaplar = (tip) => (tip === 'stok-karti-bagla' ? { ok: false, durum: 403, hata: 'Yetkiniz yok.' } : { ok: true, veri: { kayit: { surum: 40 } } });
      dugme('Bağı kaldır').click();
      await vi.advanceTimersByTimeAsync(1000);
      expect(giden.filter((g) => g.tip === 'stok-karti-bagla').map((g) => g.veri)).toEqual([{ kimlik: 'u-2', malzemeId: 9 }, { kimlik: 'f-10', malzemeId: null }]);
      expect(bolum()!.querySelector('.cwarn')?.textContent).toBe('Yetkiniz yok.');
    });
  });

  // Salt onay kipi pencereye yakalama dinleyicisi koyar ve kaldırmaz: bu blok dosyanın sonunda kalmalı.
  describe('salt onay (yalnız hazırlık onayı olan kişi)', () => {
    it('KK-29: üst çubuk sığmayınca düğmeler "Diğer" menüsünde toplanır; menü açılır, dışarı tıklayınca kapanır; sığınca menü kalkar', async () => {
      document.body.className = '';
      document.body.innerHTML = '<header><nav class="views"><button data-view="setup">Kurulum</button></nav><div class="hbtns"><button class="hbtn" id="xCsv">CSV</button><button class="hbtn" id="xDefs">Tanımlar</button></div></header><main id="bos"></main>';
      const ust = document.querySelector('header')!;
      let genislik = 1400;
      Object.defineProperty(ust, 'scrollWidth', { configurable: true, get: () => genislik });
      Object.defineProperty(ust, 'clientWidth', { configurable: true, get: () => 1080 });
      cevaplar = () => ({ ok: true, veri: {} });
      cerceveKoprusu(window, { ...AYAR, yazabilir: true }, glbYaz);
      await vi.advanceTimersByTimeAsync(10);
      const menu = document.getElementById('tmiMenu')!;
      expect(menu.nextElementSibling?.className).toBe('hbtns');
      expect(document.body.classList.contains('tmiDarCubuk')).toBe(true);
      menu.click();
      expect(document.body.classList.contains('tmiMenuAcik')).toBe(true);
      expect(menu.getAttribute('aria-expanded')).toBe('true');
      document.getElementById('bos')!.click();
      expect(document.body.classList.contains('tmiMenuAcik')).toBe(false);
      genislik = 1000;
      window.dispatchEvent(new Event('resize'));
      expect(document.body.classList.contains('tmiDarCubuk')).toBe(false);
    });

    it('KK-28: emir seçiminden sonra yeniden kurulan çerçeve Ana Sayfa\'da değil Kurulum görünümünde açılır', async () => {
      document.body.innerHTML = '<header><nav class="views"><button data-view="home">Ana Sayfa</button><button data-view="setup">Kurulum</button><button data-view="prep">Hazırlık</button></nav></header>';
      document.body.setAttribute('data-view', 'home');
      for (const b of document.querySelectorAll<HTMLElement>('.views button')) b.addEventListener('click', () => { document.body.setAttribute('data-view', b.getAttribute('data-view')!); });
      cevaplar = () => ({ ok: true, veri: {} });
      cerceveKoprusu(window, { ...AYAR, yazabilir: true }, glbYaz);
      await vi.advanceTimersByTimeAsync(10);
      expect(document.body.getAttribute('data-view')).toBe('home');
      cerceveKoprusu(window, { ...AYAR, yazabilir: true, acilisGorunumu: 'setup' }, glbYaz);
      await vi.advanceTimersByTimeAsync(10);
      expect(document.body.getAttribute('data-view')).toBe('setup');
    });

    it('KK-26: Hazırlık seçili emrin kurulumudur: seçimi değiştiren kart, ok ve alan durur, "Yeni hazırlık" yoktur; program adımında seçim açıktır', async () => {
      document.body.setAttribute('data-view', 'prep');
      document.body.innerHTML = `<div id="prStepNo">HAZIRLIK · ADIM 1 / 9</div><div id="prSub">◀ ▶ seç · Enter onayla · ▲ ▼ adım</div>
        <div id="prCarWrap"><div class="pcard on" data-i="0"></div><button data-pc="1">›</button></div>
        <div id="prActs"><button data-pa="ok">Onayla</button><button data-pa="next">İleri</button></div>
        <div id="prPanel"><button data-pa="reset">Yeni hazırlık</button><input id="prQty" value="10"></div>`;
      document.body.setAttribute('data-view', 'prep');
      const olan: string[] = [];
      const kayit = (o: Event): void => { const t = o.target as Element; olan.push(`${o.type}:${t.getAttribute('data-pa') ?? t.getAttribute('data-pc') ?? t.className}`); };
      document.body.addEventListener('click', kayit);
      document.body.addEventListener('change', kayit);
      cevaplar = (tip) => (tip === 'hazirlik' ? { ok: true, veri: { onaylar: [] } } : { ok: true, veri: {} });
      cerceveKoprusu(window, { ...AYAR, yazabilir: true }, glbYaz);
      await vi.advanceTimersByTimeAsync(10);
      expect([...document.head.querySelectorAll('style')].some((st) => st.textContent?.includes('#prPanel [data-pa="reset"] { display: none !important; }'))).toBe(true);
      expect(document.body.classList.contains('tmiSecimKilitli')).toBe(true);
      expect(document.getElementById('prSub')!.textContent).toBe('Enter onayla · ▲ ▼ adım');
      expect([...document.head.querySelectorAll('style')].some((st) => st.textContent?.includes('.pcard:not(.on):not(.chk) { visibility: hidden'))).toBe(true);
      const tikla = (secici: string) => { document.querySelector(secici)!.dispatchEvent(new MouseEvent('click', { bubbles: true })); };
      tikla('.pcard'); tikla('[data-pc]'); tikla('[data-pa="reset"]'); tikla('[data-pa="ok"]'); tikla('[data-pa="next"]');
      document.getElementById('prQty')!.dispatchEvent(new Event('change', { bubbles: true }));
      expect(olan).toEqual(['click:ok', 'click:next']);
      olan.length = 0;
      document.getElementById('prStepNo')!.textContent = 'HAZIRLIK · ADIM 2 / 9';
      await vi.advanceTimersByTimeAsync(10);
      expect(document.body.classList.contains('tmiSecimKilitli')).toBe(false);
      tikla('.pcard'); tikla('[data-pc]'); tikla('[data-pa="reset"]');
      expect(olan).toEqual(['click:pcard on', 'click:1']);
      document.body.setAttribute('data-view', 'setup');
    });

    it('KK-21: sayfa Hazırlık görünümünde açılır, öteki görünümler gizlenir; seçimi değiştiren tıklama, tuş, kaydırma ve alanlar durur, onay ve adım gezintisi geçer', async () => {
      document.body.setAttribute('data-view', 'setup');
      document.body.innerHTML = `<header><nav class="views"><button data-view="setup">Kurulum</button><button data-view="prep">Hazırlık</button></nav><div class="hbtns"><button id="xDefs">Tanımlar</button></div></header>
        <div id="prCarWrap"><div class="pcard on" data-i="0"></div><button data-pc="1">›</button></div>
        <div id="prActs"><button data-pa="ok">Onayla</button></div><div id="prRail"><button data-g="tools">T</button></div>
        <div id="prPanel"><button data-pa="accAll">Hepsi</button><button data-sug="x">Öneri</button><input id="prQty" value="10"></div>`;
      const olan: string[] = [];
      document.querySelector('.views button[data-view="prep"]')!.addEventListener('click', () => { document.body.setAttribute('data-view', 'prep'); });
      document.getElementById('prCarWrap')!.addEventListener('click', () => { olan.push('kart'); });
      document.getElementById('prCarWrap')!.addEventListener('pointerdown', () => { olan.push('sürükle'); });
      document.getElementById('prCarWrap')!.addEventListener('wheel', () => { olan.push('kaydır'); });
      document.getElementById('prActs')!.addEventListener('click', (e) => { olan.push(`eylem:${(e.target as Element).getAttribute('data-pa') ?? ''}`); });
      document.getElementById('prRail')!.addEventListener('click', () => { olan.push('ray'); });
      document.getElementById('prPanel')!.addEventListener('click', (e) => { olan.push(`panel:${(e.target as Element).getAttribute('data-pa') ?? (e.target as Element).getAttribute('data-sug') ?? ''}`); });
      document.getElementById('prPanel')!.addEventListener('change', () => { olan.push('alan'); });
      window.addEventListener('keydown', (e) => { olan.push(`tuş:${e.key}`); });
      cevaplar = (tip) => (tip === 'hazirlik' ? { ok: true, veri: { onaylar: [] } } : tip === 'emirler' ? { ok: true, veri: { emirler: [] } } : { ok: true, veri: {} });
      cerceveKoprusu(window, { ...AYAR, yazabilir: true, saltOnay: true }, glbYaz);
      await vi.advanceTimersByTimeAsync(10);
      expect(document.body.getAttribute('data-view')).toBe('prep');
      expect([...document.head.querySelectorAll('style')].some((st) => st.textContent?.includes('.views button:not([data-view="prep"])'))).toBe(true);
      const tikla = (secici: string) => { document.querySelector(secici)!.dispatchEvent(new MouseEvent('click', { bubbles: true })); };
      tikla('.pcard'); tikla('[data-pc]'); tikla('[data-pa="accAll"]'); tikla('[data-sug]');
      tikla('[data-pa="ok"]'); tikla('[data-g]');
      document.querySelector('.pcard')!.dispatchEvent(new Event('pointerdown', { bubbles: true }));
      document.querySelector('.pcard')!.dispatchEvent(new WheelEvent('wheel', { bubbles: true, deltaY: 50 }));
      for (const key of ['ArrowRight', ' ', 'Enter', 'ArrowDown']) window.dispatchEvent(new KeyboardEvent('keydown', { key }));
      document.getElementById('prQty')!.dispatchEvent(new Event('change', { bubbles: true }));
      expect(olan).toEqual(['eylem:ok', 'ray', 'tuş:Enter', 'tuş:ArrowDown']);
      // Panel yeniden çizilince alanlar kapalı gelir.
      document.getElementById('prPanel')!.innerHTML = '<input id="prQty" value="10">';
      await vi.advanceTimersByTimeAsync(10);
      expect((document.getElementById('prQty') as HTMLInputElement).disabled).toBe(true);
    });
  });
});
