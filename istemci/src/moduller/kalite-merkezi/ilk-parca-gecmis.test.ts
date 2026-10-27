import { describe, expect, it, vi } from 'vitest';
import type { KmGecmisCevabi, KmIlkParcaBekleyenCevabi } from '#paylasilan/sozlesme/kalite-merkezi.ts';
import { GECMIS_BETIGI, ILK_PARCA_BETIGI } from './acilis.ts';
import { KITAPLIK_KIMLIKLERI, sayfaKur } from './sayfa.ts';
import { KM_PAKETI } from './uygulama/paket.ts';

const json = (durum: number, govde: unknown) => new Response(JSON.stringify(govde), { status: durum, headers: { 'Content-Type': 'application/json' } });
const bekle = () => new Promise((r) => setTimeout(r, 0));
const esc = (m: unknown) => String(m ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c);

const LISTE = {
  emirler: [
    { uretimEmriId: 7, emirNo: 'UE-7', parcaNo: 'P-7', parcaAd: 'Deneme mil', isEmriId: 70, opNo: 20, adet: 10, kararBekleyenAdet: 4 },
    { uretimEmriId: 9, emirNo: 'UE-9', parcaNo: 'P-9', parcaAd: 'Deneme flanş', isEmriId: null, opNo: null, adet: 20, kararBekleyenAdet: 2 },
  ],
} satisfies KmIlkParcaBekleyenCevabi;

// 325 a: Bugün görünümüne eklenen ilk parça bölümü; uygulamanın vToday nesnesi sahte, betik gerçektir.
describe('Kalite Merkezi ilk parça bölümü (Bugün görünümü)', () => {
  function kur(onaylayabilir: boolean, cevaplar: (adres: string, s?: { method?: string; body?: string }) => Response) {
    const dugmeler = new Map<string, { onclick?: () => void; nitelik: Record<string, string> }>();
    const belge = {
      querySelectorAll: (s: string) => {
        const eslesen = /\[(data-ip-(?:onay|ret))\]/.exec(s);
        if (!eslesen) return [];
        return [...dugmeler.entries()].filter(([k]) => k.startsWith(`${eslesen[1]}=`)).map(([, d]) => Object.assign(d, { getAttribute: (n: string) => d.nitelik[n] ?? null }));
      },
    };
    const vToday = { html: () => '<div class="today-h"></div><section class="tiles"></section>', mount: vi.fn() };
    const fetch = vi.fn(async (adres: string, s?: { method?: string; body?: string }) => cevaplar(adres, s));
    const toast = vi.fn();
    const render = vi.fn(() => {
      dugmeler.clear();
      const h = vToday.html();
      for (const m of h.matchAll(/data-(ip-onay|ip-ret)="(\d+)"(?: data-ip-is="(\d+)")?/g)) {
        dugmeler.set(`data-${m[1]}=${m[2]}`, { nitelik: { [`data-${m[1]}`]: m[2]!, ...(m[3] ? { 'data-ip-is': m[3] } : {}) } });
      }
      vToday.mount();
    });
    const confirmBox = vi.fn((_b: string, _m: string, _e: string, onYes: () => void) => { onYes(); });
    const UI = { view: 'today' };
    new Function('window', 'document', 'vToday', 'UI', 'render', 'sico', 'esc', 'toast', 'confirmBox', ILK_PARCA_BETIGI)(
      { __TMI_KM: { onaylayabilir }, fetch }, belge, vToday, UI, render, () => '<svg></svg>', esc, toast, confirmBox,
    );
    return { vToday, fetch, toast, render, confirmBox, dugmeler, UI };
  }
  const varsayilan = (adres: string, s?: { method?: string }) => {
    if (adres === 'api/ilk-parca/bekleyenler') return json(200, LISTE);
    if (s?.method === 'POST') return json(200, { adet: 4 });
    return json(404, { hata: 'yok' });
  };

  it('onay yetkisi olana liste çizilir: emir, parça, adet ve karar bekleyen adet; Onayla ve Reddet düğmesi her satırda', async () => {
    const k = kur(true, varsayilan);
    expect(k.vToday.html()).not.toContain('tmiIlkParca');
    await bekle(); await bekle();
    expect(k.render).toHaveBeenCalledTimes(1);
    const h = k.vToday.html();
    expect(h).toContain('UE-7 | Op 20 | P-7');
    expect(h).toContain('UE-9 | P-9');
    expect(h).toContain('data-ip-onay="7" data-ip-is="70"');
    expect(h).toContain('emir 10 adet | karar bekleyen 4 adet');
    expect(h).toContain('data-ip-onay="9"');
    expect(h).toContain('data-ip-ret="9"');
    expect(h.indexOf('tmiIlkParca')).toBeLessThan(h.indexOf('<section class="tiles">'));
    expect(k.fetch).toHaveBeenCalledTimes(1);
  });

  it('onay yetkisi olmayana bölüm çizilmez ve liste istenmez', async () => {
    const k = kur(false, varsayilan);
    expect(k.vToday.html()).toBe('<div class="today-h"></div><section class="tiles"></section>');
    await bekle();
    expect(k.fetch).not.toHaveBeenCalled();
  });

  it('liste boşsa ya da okunamazsa bölüm görünmez', async () => {
    const bos = kur(true, () => json(200, { emirler: [] }));
    bos.vToday.html();
    await bekle(); await bekle();
    expect(bos.vToday.html()).not.toContain('tmiIlkParca');
    const hatali = kur(true, () => json(403, { hata: 'Yetkiniz yok.' }));
    hatali.vToday.html();
    await bekle(); await bekle();
    expect(hatali.vToday.html()).not.toContain('tmiIlkParca');
  });

  it('Onayla kararı hemen gönderir; başarıda emir listeden düşer ve bildirim gelir; sunucu reddederse ileti gösterilir', async () => {
    let ret = false;
    let kalan: KmIlkParcaBekleyenCevabi['emirler'] = LISTE.emirler;
    const k = kur(true, (adres, s) => {
      if (s?.method === 'POST') {
        if (ret) return json(409, { hata: 'Emir artık açık değil.' });
        kalan = kalan.filter((e) => `api/ilk-parca/${e.uretimEmriId}/karar` !== adres);
        return json(200, { adet: 4 });
      }
      return json(200, { emirler: kalan });
    });
    k.vToday.html();
    await bekle(); await bekle();
    k.render();
    k.dugmeler.get('data-ip-onay=7')!.onclick!();
    await bekle(); await bekle();
    expect(k.fetch).toHaveBeenCalledWith('api/ilk-parca/7/karar', { method: 'POST', body: JSON.stringify({ karar: 'onay', isEmriId: 70 }) });
    expect(k.toast).toHaveBeenCalledWith('İlk parça onaylandı: 4 adet');
    expect(k.vToday.html()).not.toContain('data-ip-onay="7"');
    expect(k.vToday.html()).toContain('data-ip-onay="9"');
    ret = true;
    k.render();
    k.dugmeler.get('data-ip-onay=9')!.onclick!();
    await bekle(); await bekle();
    expect(k.toast).toHaveBeenLastCalledWith('Emir artık açık değil.', 'bad');
  });

  it('Reddet önce sorar; onaylanırsa ret gider, onaylanmazsa hiçbir şey gitmez', async () => {
    const k = kur(true, varsayilan);
    k.vToday.html();
    await bekle(); await bekle();
    k.render();
    k.confirmBox.mockImplementationOnce(() => undefined);
    k.dugmeler.get('data-ip-ret=9')!.onclick!();
    expect(k.confirmBox).toHaveBeenCalledTimes(1);
    expect(k.confirmBox.mock.calls[0]![1]).toContain('UE-9 emrinin karar bekleyen 2 adedi reddedilir');
    expect(k.fetch.mock.calls.filter(([, s]) => s?.method === 'POST')).toEqual([]);
    k.dugmeler.get('data-ip-ret=9')!.onclick!();
    await bekle(); await bekle();
    expect(k.fetch).toHaveBeenCalledWith('api/ilk-parca/9/karar', { method: 'POST', body: JSON.stringify({ karar: 'ret' }) });
    expect(k.toast).toHaveBeenCalledWith('İlk parça reddedildi: 4 adet');
  });

  it('(ret) emir no, parça ve ret sorusu HTML olarak değil metin olarak yazılır', async () => {
    const kotu = '<img src=x onerror=alert(1)>';
    const k = kur(true, (adres) => adres === 'api/ilk-parca/bekleyenler'
      ? json(200, { emirler: [{ uretimEmriId: 5, emirNo: kotu, parcaNo: kotu, parcaAd: kotu, isEmriId: null, opNo: null, adet: 1, kararBekleyenAdet: 1 }] })
      : json(200, { adet: 1 }));
    k.vToday.html();
    await bekle(); await bekle();
    const h = k.vToday.html();
    expect(h).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(h).not.toContain(kotu);
    k.render();
    k.confirmBox.mockImplementationOnce(() => undefined);
    k.dugmeler.get('data-ip-ret=5')!.onclick!();
    expect(String(k.confirmBox.mock.calls[0]![1])).not.toContain(kotu);
  });

  it('paket betiğin bağlandığı yerleri bir kez taşır; kurulan sayfada betikler uygulamadan sonra gelir', () => {
    expect(KM_PAKETI.split('const vToday={').length).toBe(2);
    expect(KM_PAKETI.split('<section class="tiles">').length).toBe(2);
    expect(KM_PAKETI.split('function historyFor(').length).toBe(2);
    const kitapliklar = Object.fromEntries(KITAPLIK_KIMLIKLERI.map((k) => [k, ''])) as Parameters<typeof sayfaKur>[0]['kitapliklar'];
    const sayfa = sayfaKur({ paket: KM_PAKETI, koken: 'http://localhost:4101', grafik: '', kitapliklar, kimlik: { kisi: { id: 7, ad: 'Deneme Kişi' }, yonetici: false, kisiler: [], onaylayabilir: true } });
    for (const b of [ILK_PARCA_BETIGI, GECMIS_BETIGI]) {
      expect(sayfa.split(b).length).toBe(2);
      expect(sayfa.indexOf(b)).toBeGreaterThan(sayfa.indexOf('const vToday={'));
    }
  });
});

// 326 a: kayıt geçmişi penceresine eklenen salt okunur "Önceki sürümler" bölümü.
describe('Kalite Merkezi kayıt geçmişi bölümü', () => {
  const GECMIS = {
    surumler: [
      { surum: 12, yazan: 'Deneme ikinci', yazildi: '2026-10-19T10:00:00+03:00', degistiren: 'Deneme birinci', degisti: '2026-10-19T11:00:00+03:00', govde: { no: 'NCR-1', durum: 'Açık', tanim: 'ikinci', guncelleme: 'a' } },
      { surum: 8, yazan: 'Deneme birinci', yazildi: '2026-10-18T10:00:00+03:00', degistiren: 'Deneme ikinci', degisti: '2026-10-19T10:00:00+03:00', govde: { no: 'NCR-1', durum: 'Açık', tanim: 'ilk', foto: 'data:image/png;base64,AAAA' } },
    ],
  } satisfies KmGecmisCevabi;

  function kur(cevap: () => Response | Promise<Response>, simdiki: Record<string, unknown> | null = { _id: 'n1', no: 'NCR-1', durum: 'Kapalı', tanim: 'ikinci', guncelleme: 'b' }) {
    const kap = { innerHTML: '', appendChild: (b: { innerHTML: string; isConnected: boolean; id: string }) => { kap.cocuk = b; }, cocuk: null as null | { innerHTML: string; isConnected: boolean; id: string } };
    const asil = vi.fn();
    const fetch = vi.fn(async (_adres: string) => cevap());
    const belge = {
      querySelector: (s: string) => (s === '#modal2 .mbody' ? kap : null),
      createElement: () => ({ innerHTML: '', isConnected: true, id: '' }),
    };
    const kapsayici: { historyFor: (...a: unknown[]) => unknown } = { historyFor: asil };
    new Function('window', 'document', 'S', 'esc', 'kapsayici', `var historyFor = kapsayici.historyFor; ${GECMIS_BETIGI}; kapsayici.historyFor = historyFor;`)(
      { fetch }, belge, { ncr: simdiki === null ? [] : [simdiki] }, esc, kapsayici,
    );
    return { gecmis: kapsayici.historyFor, asil, kap, fetch };
  }

  it('uygulamanın kendi geçmişi korunur; sunucudan gelen sürümler değiştiren kişi, zaman ve değişen alanlarla yazılır', async () => {
    const k = kur(() => json(200, GECMIS));
    k.gecmis('ncr', 'n1');
    expect(k.asil).toHaveBeenCalledWith('ncr', 'n1');
    expect(k.fetch).toHaveBeenCalledWith('api/gecmis/ncr/n1');
    expect(k.kap.cocuk!.innerHTML).toContain('Yükleniyor');
    await bekle(); await bekle();
    const h = k.kap.cocuk!.innerHTML;
    expect(h).toContain('Önceki sürümler');
    expect(h).toContain('Deneme birinci');
    expect(h).toContain('Önceki hâli');
    // En yeni sürüm şimdiki kayıtla, öteki bir sonraki sürümle karşılaştırılır; "guncelleme" ve "_id" değişiklik sayılmaz.
    expect(h).toContain('<td>durum</td><td>Açık</td><td>Kapalı</td>');
    expect(h).toContain('<td>tanim</td><td>ilk</td><td>ikinci</td>');
    expect(h).toContain('<td>foto</td><td>(dosya)</td><td>—</td>');
    expect(h).not.toContain('<td>guncelleme</td>');
    expect(h.indexOf('Deneme birinci')).toBeLessThan(h.indexOf('<td>tanim</td>'));
    expect(h).not.toMatch(/<button|<input|contenteditable/);
  });

  it('(ret) kişi adı, alan adı ve değerler HTML olarak değil metin olarak yazılır', async () => {
    const kotu = '<img src=x onerror=alert(1)>';
    const k = kur(() => json(200, { surumler: [{ surum: 3, yazan: kotu, yazildi: '2026-10-18T10:00:00+03:00', degistiren: kotu, degisti: '2026-10-19T10:00:00+03:00', govde: { [kotu]: kotu, tanim: kotu } }] }));
    k.gecmis('ncr', 'n1');
    await bekle(); await bekle();
    const h = k.kap.cocuk!.innerHTML;
    expect(h).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(h).not.toContain(kotu);
  });

  it('geçmişi olmayan, okunamayan ve silinmiş kayıt ayrı ayrı anlatılır', async () => {
    const bos = kur(() => json(200, { surumler: [] }));
    bos.gecmis('ncr', 'n1');
    await bekle(); await bekle();
    expect(bos.kap.cocuk!.innerHTML).toContain('önceki sürümü yok');
    const red = kur(() => json(403, { hata: 'Yetkiniz yok.' }));
    red.gecmis('ncr', 'n1');
    await bekle(); await bekle();
    expect(red.kap.cocuk!.innerHTML).toContain('okunamadı');
    const silinmis = kur(() => json(200, GECMIS), null);
    silinmis.gecmis('ncr', 'n1');
    await bekle(); await bekle();
    expect(silinmis.kap.cocuk!.innerHTML).toContain('Kayıt silindi.');
  });

  it('kayıt kimliği adrese kaçışlanarak girer; pencere yoksa istek atılmaz', () => {
    const k = kur(() => json(200, { surumler: [] }));
    k.gecmis('ncr', 'a/b c');
    expect(k.fetch).toHaveBeenCalledWith('api/gecmis/ncr/a%2Fb%20c');
  });
});
