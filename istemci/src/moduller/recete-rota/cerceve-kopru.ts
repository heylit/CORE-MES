// Çerçevenin içinde, prototipin betiğinden ÖNCE koşan köprü. Prototip değiştirilmez: durumunu tuttuğu yerel depo
// (localStorage) buradan TMI uçlarına gider; window.claude hiçbir yetenek vermez (db, user, indirme yok):
// kayıt atölyede ortaktır ve yerel depo köprüsünden geçer. Çerçeve yalıtılmıştır (opak köken): tek kapı kabuğa
// giden iletidir; kabuk (kopru.ts) yalnız bilinen istek türlerini uca çevirir.
//
// Fonksiyon metin olarak sayfaya gömülür (`cerceveBetigi`): dışındaki hiçbir ada başvurmaz, ithal etmez.

export interface CerceveAyari {
  // İleti kanalı; modülün adıdır.
  kanal: string;
  // Yazma işlemi yoksa değişiklikler yalnız açık sekmede kalır (sunucuya gitmez).
  yazabilir: boolean;
  // Kalıcı tutulan anahtarların öneki; öteki anahtarlar yalnız bellekte durur.
  onek: string;
  // Açılıştaki kayıtlar: anahtar, prototipin yazdığı metin ve sürüm.
  degerler: Readonly<Record<string, { deger: string; surum: number }>>;
  // Cihaza özel anahtarlar (operatör ekranının istasyon seçimi gibi): ortak kayda gitmez, kabuğun tarayıcı deposunda durur.
  cihazAnahtarlari: readonly string[];
  cihazDegerleri: Readonly<Record<string, string>>;
  catismaIletisi: string;
  buyukIletisi: string;
  // İstek gövdesinin üst sınırı (sunucu gövde sınırının altında); aşan kayıt gönderilmez, kullanıcı bir kez uyarılır.
  azamiBayt: number;
  // Değişiklikten sonra yazmadan önce beklenen süre (art arda değişiklikler tek yazmada birleşir).
  beklemeMs: number;
  // TMI teması: prototip kök öğedeki data-theme ile açık ve koyu görünümü taşır.
  tema: 'light' | 'dark';
  // Prototipin kayıt yeri yazısı ("Bu cihazda kayıtlı") yerine gösterilen metin: veri cihazda değil TMI'dedir.
  kayitYazisi: string;
  // Kayıt yazısı yalnız uyarıysa görünür (yazma yetkisi yok); kayıt TMI'deyken söylenecek bir şey yoktur.
  kayitUyari: boolean;
  // Oturumdaki kişinin adı: onay menüsündeki "Onaylayan" kutusu salt okunur ve bununla dolar (onaylayanı sunucu da oturumdan yazar).
  kisiAdi?: string | null;
  // Oturum düştüğünde ya da yazma yetkisi kalmadığında (401, 403) bir kez gösterilen uyarı: yazma durur, değişiklik kaydedilmez.
  oturumIletisi: string;
  // Sunucunun reddettiği kayıtta (400) bir kez gösterilen uyarı; başarılı bir yazmadan sonra yeniden gösterilebilir.
  reddIletisi: string;
  // Son değişiklik kaydedilemediği sürece kayıt yazısının yerine görünen metin.
  kaydedilmediYazisi: string;
  // Kabuğa giden isteğin cevap bekleme sınırı: asılı tek istek komut ve kayıt zincirini kilitlemesin.
  zamanAsimiMs: number;
  // Oturumdaki kişinin yetkisi olmayan eylemlerin düğmeleri (CSS seçicisi): prototip değişmeden çerçevede gizlenir. Sunucu yine reddeder;
  // gizleme yalnız kişinin yapamayacağı işi ona göstermemek içindir.
  gizliSeciciler: readonly string[];
  // Plan öncelik ayarlarını okuyabilir mi (237 a: plan.yaz, plan.bedel-ayari ya da siparisler.fiyat-oku). Okuyamayana `tmi.bedelAyari`
  // verilmez; prototip paneli bu işlev yoksa çizmez, sunucunun 403'ü kutu olarak görünmez.
  bedelAyariOkunur?: boolean;
  // HiGHS çözücüsünü kabuktan isteyebilir mi (yalnız planlama çerçevesi, 361 b): `tmi.highs()` -> { betik, wasm }.
  highsOkunur?: boolean;
}

type Nesne = Record<string, unknown>;
interface Hata { durum: number; message: string; eskiSurum?: true; alan?: string; zamanAsimi?: true }

export function cerceveKoprusu(w: Window & typeof globalThis, ayar: CerceveAyari): void {
  const ust = w.parent;
  let sayac = 0;
  const bekleyen = new Map<number, { coz: (v: unknown) => void; reddet: (h: Hata) => void }>();

  // ----- kabukla konuşma -----
  // Cevap süresinde gelmezse istek durum 0 ile reddedilir (bağlantı hatası gibi). `gec` verilirse süresi geçen isteğin sonradan gelen
  // başarılı cevabı ona gider: sunucu yazmayı yapmış olabilir, dönen sürüm kaybolmasın.
  const istek = <T>(tip: string, veri: Nesne, gec?: (v: T) => void): Promise<T> => new Promise<T>((coz, reddet) => {
    sayac += 1;
    const id = sayac;
    const zamanlayici = w.setTimeout(() => {
      if (gec === undefined) bekleyen.delete(id);
      else bekleyen.set(id, { coz: gec as (v: unknown) => void, reddet: () => undefined });
      reddet({ durum: 0, message: 'Sunucu yanıt vermedi.', zamanAsimi: true });
    }, ayar.zamanAsimiMs);
    bekleyen.set(id, {
      coz: (v) => { w.clearTimeout(zamanlayici); coz(v as T); },
      reddet: (h) => { w.clearTimeout(zamanlayici); reddet(h); },
    });
    ust.postMessage({ kanal: ayar.kanal, yon: 'istek', id, tip, veri }, '*');
  });
  // Çerçevedeki tuş kabuğa ulaşmaz (ayrı belge, opak köken): Ctrl K kabuğa iletilir, kabuk üst çubuktaki aramayı açar.
  w.document.addEventListener('keydown', (o: KeyboardEvent) => {
    if (!(o.ctrlKey || o.metaKey) || o.altKey || o.key.toLocaleLowerCase('tr') !== 'k') return;
    o.preventDefault();
    ust.postMessage({ kanal: ayar.kanal, yon: 'kisayol', tus: 'arama' }, '*');
  });
  w.addEventListener('message', (olay: MessageEvent) => {
    if (olay.source !== ust) return;
    const m = olay.data as { kanal?: unknown; yon?: unknown; id?: unknown; ok?: unknown; veri?: unknown; hata?: unknown; durum?: unknown; tip?: unknown; eskiSurum?: unknown; alan?: unknown } | null;
    if (m === null || typeof m !== 'object') return;
    if (m.kanal === 'tmi-gorunum') { gorunumGeldi(olay.data); return; }
    if (m.kanal !== ayar.kanal || m.yon !== 'yanit' || typeof m.id !== 'number') return;
    const b = bekleyen.get(m.id);
    if (b === undefined) return;
    bekleyen.delete(m.id);
    if (m.ok === true) b.coz(m.veri);
    else b.reddet({ durum: typeof m.durum === 'number' ? m.durum : 0, message: typeof m.hata === 'string' ? m.hata : 'İşlem yapılamadı.', ...(m.eskiSurum === true ? { eskiSurum: true as const } : {}), ...(typeof m.alan === 'string' ? { alan: m.alan } : {}) });
  });

  // Kabuğun görünüm sözleşmesi (ortak/rota/cerceve-iletisi.ts): görünüm adı ikinci menü maddesinin anahtarıdır. Prototip
  // `window.tmiGorunum` ile dinleyici kaydeder ve içeride sekme değişince bildirir; `hazir`, ilk görünüm gelene kadar yinelenir.
  let gorunumAlindi = false;
  let sira = 0;
  let son: string | null = null;
  let dinleyici: ((ad: string) => string) | null = null;
  let bekleyenGorunum: string | null = null;
  let sonSayaclar: string | null = null;
  const uygula = (ad: string): void => {
    if (dinleyici === null) { bekleyenGorunum = ad; return; }
    son = dinleyici(ad);
  };
  const gorunumGeldi = (veri: unknown): void => {
    const g = veri as { surum?: unknown; tip?: unknown; gorunum?: unknown; sira?: unknown };
    if (g.surum !== 1 || g.tip !== 'gorunum' || typeof g.gorunum !== 'string' || g.gorunum === '') return;
    if (typeof g.sira !== 'number' || !Number.isInteger(g.sira) || g.sira < 1) return;
    gorunumAlindi = true;
    sira = g.sira;
    uygula(g.gorunum);
  };
  Object.defineProperty(w, 'tmiGorunum', {
    configurable: true,
    value: Object.freeze({
      kaydet: (f: (ad: string) => string): void => {
        dinleyici = f;
        if (bekleyenGorunum !== null) { const ad = bekleyenGorunum; bekleyenGorunum = null; uygula(ad); }
      },
      // İlk görünüm alınmadan ve alınan görünüm dinleyiciye uygulanmadan bildirilmez: prototipin açılış sekmesi kabuğun
      // istediği bölümün yerine adrese yazılmasın. Aynı görünüm yinelenmez.
      bildir: (ad: string): void => {
        if (!gorunumAlindi || bekleyenGorunum !== null || ad === son) return;
        son = ad;
        ust.postMessage({ kanal: 'tmi-gorunum', surum: 1, tip: 'gorunum-degisti', gorunum: ad, sira }, '*');
      },
      // Menü rozetleri: her ileti öncekinin tamamının yerine geçer; aynı değerler yinelenmez. Biçime uymayan eşlem gönderilmez.
      sayaclar: (sayaclar: Record<string, unknown>): void => {
        if (sayaclar === null || typeof sayaclar !== 'object' || Array.isArray(sayaclar)) return;
        const temiz: Record<string, number | null> = {};
        // Kabuk sözleşmesi (ortak/rota/cerceve-iletisi.ts): anahtar menü maddesi anahtarı biçimindedir, en çok 64 anahtar ve 64 karakter;
        // uymayan tek anahtar bütün iletinin reddine yol açacağı için burada atılır.
        for (const [anahtar, deger] of Object.entries(sayaclar)) {
          if (Object.keys(temiz).length >= 64) break;
          if (anahtar.length > 64 || !/^[a-z][a-z0-9-]*$/.test(anahtar)) continue;
          temiz[anahtar] = typeof deger === 'number' && Number.isSafeInteger(deger) && deger >= 0 ? deger : null;
        }
        const metin = JSON.stringify(temiz);
        if (metin === sonSayaclar) return;
        sonSayaclar = metin;
        ust.postMessage({ kanal: 'tmi-gorunum', surum: 1, tip: 'sayaclar', sayaclar: temiz }, '*');
      },
    }),
  });
  // Bağlı koleksiyonlar (kart #1104, #1106): prototipin eylemi `komut(ad, govde)` ile sahibi modülün var olan ucuna gider; kabuk yalnız
  // izinli komut tablosundakini geçirir (kopru.ts). Başarıda `{ sonuc, durum, ek }` döner: durum yeniden okunmuş bağlı dilimlerdir,
  // ek makine notu ve kişi görevi gibi sürümsüz alanlardır (okunamazsa null; `kaynakOku()` ile yeniden istenir). Güncellemenin
  // sürümünü kabuk tutar (kayıtlar `kaynakOku()` ile okunduğu andaki sürüm), çerçeve sürüm taşımaz. Hata `{ durum, message, eskiSurum? }`
  // ile reddedilir (durum 400: izinsiz komut ya da geçersiz gövde; eskiSurum: kayıt okunduktan sonra başkası değiştirdi).
  Object.defineProperty(w, 'tmi', {
    configurable: true,
    value: Object.freeze({
      komut: (ad: string, govde?: Nesne): Promise<{ sonuc: unknown; durum: unknown }> => istek('komut', { ad, govde: govde ?? {} }),
      durum: (): Promise<unknown> => istek('durum-oku', {}),
      kaynakOku: (): Promise<{ durum: unknown; ek: unknown }> => istek('kaynak-oku', {}),
      // Stok sekmesi (kart #1169): kartların statü kırılımı ve bakiye satırları stoktan, statü tanımları Reçete ve Rota'dan.
      stokOku: (malzemeIdler: number[]): Promise<unknown> => istek('stok-oku', { malzemeIdler }),
      // Canlı plan sürümü ve son canlıya alma (eşzamanlı planlama uyarısı).
      planSurumu: (): Promise<unknown> => istek('plan-surum', {}),
      // Plan öncelik ayarları: { ayar, yazabilir }; yazma `plan-bedel-ayari` komutuyla.
      ...(ayar.bedelAyariOkunur === false ? {} : { bedelAyari: (): Promise<unknown> => istek('bedel-ayari-oku', {}) }),
      ...(ayar.highsOkunur === true ? { highs: (): Promise<unknown> => istek('highs-oku', {}) } : {}),
      kisiAdi: ayar.kisiAdi ?? null,
      // Termini girilmemiş fason adımın süre tahmini: { malzemeNo, operasyonTipiId, firmaId, adet }[] -> { gunler: (number|null)[] }.
      fasonTahminleri: (sorgular: unknown[]): Promise<unknown> => istek('fason-tahmin', { sorgular }),
      // Malzeme yalnız Malzemeler ve Hizmetler'de açılır: çerçeve kabuğa gitmek istediği sayfayı söyler, kabuk yalnız izinli yola gider.
      git: (yol: string): void => { ust.postMessage({ kanal: ayar.kanal, yon: 'git', yol }, '*'); },
    }),
  });
  let hazirKalan = 20;
  const hazir = (): void => {
    if (gorunumAlindi || hazirKalan <= 0) return;
    hazirKalan -= 1;
    ust.postMessage({ kanal: 'tmi-gorunum', surum: 1, tip: 'hazir' }, '*');
    w.setTimeout(hazir, 250);
  };
  hazir();

  // ----- yerel depo -----
  const cihazda = (anahtar: string): boolean => ayar.cihazAnahtarlari.includes(anahtar);
  const kalici = (anahtar: string): boolean => ayar.yazabilir && anahtar.startsWith(ayar.onek) && !cihazda(anahtar);
  let degerler: Record<string, string> = Object.create(null) as Record<string, string>;
  const surumler = new Map<string, number | null>();
  for (const [anahtar, kayit] of Object.entries(ayar.degerler)) {
    if (ayar.cihazAnahtarlari.includes(anahtar)) continue;
    degerler[anahtar] = kayit.deger;
    surumler.set(anahtar, kayit.surum);
  }
  for (const [anahtar, deger] of Object.entries(ayar.cihazDegerleri)) {
    if (ayar.cihazAnahtarlari.includes(anahtar)) degerler[anahtar] = deger;
  }
  const zamanlayicilar = new Map<string, number>();
  // Anahtar başına tek yazma yoldadır: sonraki yazma bir öncekinin döndürdüğü sürümle gider.
  const yolda = new Set<string>();
  const sirada = new Set<string>();
  let durdu = false;
  let buyukUyarildi = false;
  let reddUyarildi = false;
  const has = (anahtar: string): boolean => Object.prototype.hasOwnProperty.call(degerler, anahtar);

  const yerelYaz = (anahtar: string): void => {
    zamanlayicilar.delete(anahtar);
    if (durdu) return;
    if (yolda.has(anahtar)) { sirada.add(anahtar); return; }
    const beklenen = surumler.get(anahtar) ?? null;
    let is: Promise<void>;
    if (!has(anahtar)) {
      if (beklenen === null) return;
      is = istek('kayit-sil', { anahtar, beklenenSurum: beklenen }).then(() => { surumler.set(anahtar, null); });
    } else {
      const metin = degerler[anahtar] ?? '';
      // JSON ise ayrıştırılmış saklanır (sunucuda sorgulanabilir); değilse düz metin.
      let govde: Nesne;
      try { govde = { bicim: 'json', deger: JSON.parse(metin) as unknown }; } catch { govde = { bicim: 'metin', deger: metin }; }
      const veri = { anahtar, ...govde, beklenenSurum: beklenen };
      if (new w.TextEncoder().encode(JSON.stringify(veri)).length > ayar.azamiBayt) {
        if (!buyukUyarildi) { buyukUyarildi = true; w.alert(ayar.buyukIletisi); }
        return;
      }
      is = istek<{ kayit: { surum: number } }>('kayit-yaz', veri, (c) => { surumler.set(anahtar, c.kayit.surum); })
        .then((c) => { surumler.set(anahtar, c.kayit.surum); });
    }
    yolda.add(anahtar);
    is.then(() => { kayitSorunu(false); }, (h: Hata) => {
      kayitSorunu(true);
      if (h.durum === 409) {
        // Ortak kayıtta başkasının yazdığının üstüne yazılmaz: yazma durur, kullanıcı sayfayı yeniler.
        durdu = true;
        w.alert(ayar.catismaIletisi);
      } else if (h.durum === 403 || h.durum === 401) {
        // Oturum düştü ya da yetki kalktı: sonraki yazmalar da reddedilir; kullanıcı yeniden girene kadar değişiklik kaydedilmez.
        durdu = true;
        w.alert(ayar.oturumIletisi);
      } else if (h.durum >= 400 && h.durum < 500) {
        // Sunucunun reddettiği kayıt (geçersiz değer) yinelenmez; sonraki değişiklik yeniden dener.
        if (!reddUyarildi) { reddUyarildi = true; w.alert(ayar.reddIletisi); }
      } else {
        // Bağlantı ya da sunucu hatası ya da zaman aşımı: kayıt kaybolmasın, biraz sonra yeniden denenir.
        w.setTimeout(() => { yazmayiPlanla(anahtar); }, 5000);
      }
    }).finally(() => {
      yolda.delete(anahtar);
      if (sirada.delete(anahtar)) yazmayiPlanla(anahtar);
    });
  };
  const yazmayiPlanla = (anahtar: string): void => {
    if (cihazda(anahtar)) {
      // Kabuğa bırakılır; yazılamazsa (tarayıcı deposu kapalı) değer bu sekmede kalır.
      istek('cihaz-yaz', { anahtar, deger: has(anahtar) ? degerler[anahtar] ?? null : null }).catch(() => undefined);
      return;
    }
    if (!kalici(anahtar) || durdu) return;
    const eski = zamanlayicilar.get(anahtar);
    if (eski !== undefined) w.clearTimeout(eski);
    zamanlayicilar.set(anahtar, w.setTimeout(() => { yerelYaz(anahtar); }, ayar.beklemeMs));
  };
  const hepsiniYaz = (): void => { for (const [anahtar, z] of [...zamanlayicilar]) { w.clearTimeout(z); yerelYaz(anahtar); } };
  w.addEventListener('pagehide', hepsiniYaz);
  const depo = {
    getItem: (k: string): string | null => (has(String(k)) ? degerler[String(k)] ?? null : null),
    setItem: (k: string, v: string): void => {
      const anahtar = String(k);
      const deger = String(v);
      if (degerler[anahtar] === deger) return;
      degerler[anahtar] = deger;
      yazmayiPlanla(anahtar);
    },
    removeItem: (k: string): void => {
      const anahtar = String(k);
      if (!has(anahtar)) return;
      delete degerler[anahtar];
      yazmayiPlanla(anahtar);
    },
    clear: (): void => {
      const anahtarlar = Object.keys(degerler);
      degerler = Object.create(null) as Record<string, string>;
      anahtarlar.forEach(yazmayiPlanla);
    },
    key: (i: number): string | null => Object.keys(degerler)[i] ?? null,
    get length(): number { return Object.keys(degerler).length; },
  };
  try { Object.defineProperty(w, 'localStorage', { configurable: true, value: depo }); } catch { /* tarayıcı izin vermezse bellek dışı kalır */ }

  // ----- görünüm -----
  w.document.documentElement.setAttribute('data-theme', ayar.tema);
  if (ayar.gizliSeciciler.length > 0) {
    const stil = w.document.createElement('style');
    stil.textContent = `${ayar.gizliSeciciler.join(',')}{display:none!important}`;
    (w.document.head ?? w.document.documentElement).appendChild(stil);
    // Prototipin stilleri bu betikten sonra gelir: kural belge yüklenince sona taşınır ki !important'ı saymayan ortamda (jsdom) da onları ezsin.
    w.document.addEventListener('DOMContentLoaded', () => { (w.document.head ?? w.document.documentElement).appendChild(stil); });
  }
  // Prototip hesap deposu yokken kayıt yerini "Bu cihazda kayıtlı" yazar; veri TMI'de olduğu için yalnız bu yazı değişir.
  const CIHAZ_YAZISI = 'Bu cihazda kayıtlı';
  // Son yazma kaydedilemediyse kayıt yazısı bunu söyler ve görünür; başarılı yazmada eski hâline döner.
  let kaydedilmedi = false;
  const yaziKoy = (e: HTMLElement): void => {
    e.textContent = kaydedilmedi ? ayar.kaydedilmediYazisi : ayar.kayitYazisi;
    e.hidden = !kaydedilmedi && !ayar.kayitUyari;
  };
  // Çerçeve kapanırken gözlemci son kez koşabilir; o anda belge yoktur.
  const syncOgesi = (): HTMLElement | null => w.document?.getElementById('sync') ?? null;
  // Prototip her çizimde yazıyı yeniden koyar; yalnız onun yazısı değiştirilir, başka yazıya dokunulmaz.
  const kayitYazisiDuzelt = (): void => {
    const e = syncOgesi();
    if (e !== null && e.textContent === CIHAZ_YAZISI) yaziKoy(e);
  };
  function kayitSorunu(sorunVar: boolean): void {
    if (kaydedilmedi === sorunVar) return;
    kaydedilmedi = sorunVar;
    if (!sorunVar) reddUyarildi = false;
    const e = syncOgesi();
    if (e !== null && [CIHAZ_YAZISI, ayar.kayitYazisi, ayar.kaydedilmediYazisi].includes(e.textContent ?? '')) yaziKoy(e);
  }
  new w.MutationObserver(kayitYazisiDuzelt).observe(w.document, { childList: true, subtree: true, characterData: true });

  // ----- window.claude -----
  // Hiçbir yetenek verilmez (hepsi null döner); prototip yerel depoyla çalışır.
  const cozulmus = new Map<string, Promise<unknown>>();
  const claude = Object.freeze({
    use: (ad: string): Promise<unknown> => {
      let p = cozulmus.get(ad);
      if (p === undefined) {
        // Söz betiğin ilk koşusunda değil, sonra çözülür (sözleşme).
        p = new Promise((coz) => { w.setTimeout(() => { coz(null); }, 0); });
        cozulmus.set(ad, p);
      }
      return p;
    },
  });
  try { Object.defineProperty(w, 'claude', { configurable: true, value: claude }); } catch { /* yetenek yok sayılır */ }
}

// Sayfaya gömülecek betik: fonksiyon metni ve ayar JSON'u. `<` ve satır ayırıcılar kaçırılır ki kayıt metni betiği kapatamasın.
export function cerceveBetigi(ayar: CerceveAyari): string {
  const json = JSON.stringify(ayar).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
  const govde = cerceveKoprusu.toString().replace(/<\/script/gi, '<\\/script');
  return `<script>(${govde})(window, ${json});</script>`;
}
