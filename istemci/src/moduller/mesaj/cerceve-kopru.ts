// Çerçevenin içinde, prototipin betiğinden ÖNCE koşan köprü. Prototip değiştirilmez: yerel deposu (localStorage) ve depo
// çağrıları (window.claude.use: db, user, room, assets, downloads) buradan TMI uçlarına gider. Çerçeve yalıtılmıştır
// (opak köken): tek kapı kabuğa giden iletidir; kabuk (kopru.ts) yalnız bilinen istek türlerini uca çevirir.
//
// Fonksiyon metin olarak sayfaya gömülür (`cerceveBetigi`): dışındaki hiçbir ada başvurmaz, ithal etmez.

export interface CerceveAyari {
  // İleti kanalı; modülün adıdır.
  kanal: string;
  kisi: { id: number; ad: string };
  yazabilir: boolean;
  yonetici: boolean;
  // window.claude.use ile verilen yetenekler; listede olmayan null döner.
  yetenekler: readonly string[];
  // Yerel depo: 'ortak' herkesin aynı kaydı (sürüm denetimli), 'kisisel' kişinin kendi alanı, 'yok' yalnız bellekte.
  // Kalıcı tutulan anahtarlar önekle seçilir; öteki anahtarlar yalnız bellekte durur.
  yerel: {
    kapsam: 'ortak' | 'kisisel' | 'yok';
    onekler: readonly string[];
    degerler: Readonly<Record<string, { deger: string; surum: number }>>;
    catismaIletisi: string;
  };
  tema: 'light' | 'dark';
  yoklamaMs: number;
  azamiEkBayt: number;
}

export const yerelKoku = (ayar: Pick<CerceveAyari, 'kisi' | 'yerel'>): string =>
  ayar.yerel.kapsam === 'kisisel' ? `data/users/${String(ayar.kisi.id)}/yerel/anahtarlar` : 'yerel';

// Yerel depo anahtarı yol parçasına çevrilir (izinli karakterler dışı yüzde kodlanır).
export const anahtarParcasi = (anahtar: string): string =>
  encodeURIComponent(anahtar).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);

type Nesne = Record<string, unknown>;
// durum: kabuktan gelen HTTP durumu; prototip yalnız `code`u görür (window.claude sözleşmesi), köprü yetki reddini ondan ayırır.
interface Hata { code: string; message: string; durum?: number }
interface HamBelge { yol: string; kimlik: string; veri: Nesne; surum: number }

export function cerceveKoprusu(w: Window & typeof globalThis, ayar: CerceveAyari): void {
  const ust = w.parent;
  let sayac = 0;
  const bekleyen = new Map<number, { coz: (v: unknown) => void; reddet: (h: Hata) => void }>();

  // ----- kabukla konuşma -----
  const hataKodu = (durum: number): string => {
    if (durum === 400 || durum === 403 || durum === 404 || durum === 409 || durum === 422) return 'invalid_argument';
    if (durum === 413 || durum === 429) return 'resource_exhausted';
    return 'unavailable';
  };
  const istek = <T>(tip: string, veri: Nesne = {}): Promise<T> => new Promise<T>((coz, reddet) => {
    sayac += 1;
    bekleyen.set(sayac, { coz: coz as (v: unknown) => void, reddet });
    ust.postMessage({ kanal: ayar.kanal, yon: 'istek', id: sayac, tip, veri }, '*');
  });
  let gorunumAlindi = false;
  w.addEventListener('message', (olay: MessageEvent) => {
    if (olay.source !== ust) return;
    const m = olay.data as { kanal?: unknown; yon?: unknown; id?: unknown; ok?: unknown; veri?: unknown; hata?: unknown; durum?: unknown; tip?: unknown; anahtar?: unknown } | null;
    if (m === null || typeof m !== 'object') return;
    if (m.kanal === 'tmi-gorunum' && m.tip === 'gorunum') {
      if (!gorunumAlindi) komutlariBildir();
      gorunumAlindi = true;
      return;
    }
    if (m.kanal === 'tmi-gorunum' && m.tip === 'komut-calistir') { komutCalistir(m.anahtar); return; }
    if (m.kanal !== ayar.kanal || m.yon !== 'yanit' || typeof m.id !== 'number') return;
    const b = bekleyen.get(m.id);
    if (b === undefined) return;
    bekleyen.delete(m.id);
    if (m.ok === true) b.coz(m.veri);
    else {
      const durum = typeof m.durum === 'number' ? m.durum : 0;
      b.reddet({ code: hataKodu(durum), message: typeof m.hata === 'string' ? m.hata : 'İşlem yapılamadı.', durum });
    }
  });

  // ----- Ctrl K ve ortak palet (karar 102 a) -----
  // Ctrl K kabuğun ortak paletidir: çerçevede basılan tuş prototipin kendi aramasına ulaşmadan (yakalama evresi) kabuğa gider.
  w.addEventListener('keydown', (o: KeyboardEvent) => {
    if (!(o.ctrlKey || o.metaKey) || o.altKey || o.key.toLocaleLowerCase('tr') !== 'k') return;
    o.preventDefault();
    o.stopImmediatePropagation();
    ust.postMessage({ kanal: ayar.kanal, yon: 'kisayol', tus: 'arama' }, '*');
  }, true);
  // Bu sayfanın komutları paletin "Bu sayfa" grubunda görünür (kural 7); seçilen komut prototipin kendi düğmesi (data-act)
  // tıklanmış gibi çalışır. Prototipin arama penceresi düğmesiyle yerinde kalır.
  const KOMUTLAR: readonly { anahtar: string; baslik: string; aciklama: string; simge: string; sozcukler: string[]; eylem: string }[] = [
    { anahtar: 'mesaj-ara', baslik: 'Mesajlarda ara', aciklama: 'Kanal, mesaj, görev, toplantı, sipariş ve onay', simge: 'search', sozcukler: ['mesaj', 'kanal', 'görev', 'toplantı'], eylem: 'search' },
  ];
  const komutlariBildir = (): void => {
    ust.postMessage({ kanal: 'tmi-gorunum', surum: 1, tip: 'komutlar', komutlar: KOMUTLAR.map(({ anahtar, baslik, aciklama, simge, sozcukler }) => ({ anahtar, baslik, aciklama, simge, sozcukler })) }, '*');
  };
  const komutCalistir = (anahtar: unknown): void => {
    const k = KOMUTLAR.find((x) => x.anahtar === anahtar);
    if (k === undefined || w.document.body === null) return;
    const d = w.document.createElement('button');
    d.type = 'button';
    d.hidden = true;
    d.dataset['act'] = k.eylem;
    w.document.body.appendChild(d);
    d.click();
    d.remove();
  };

  // Kabuğun görünüm sözleşmesi: `hazir` görünüm gelene kadar yinelenir. Prototip tek görünümdür, gelen görünüm yalnız alınır.
  // Komut listesi her `hazir`la gider: kabuğun dinleyicisi kurulmadan yollanan ilk ileti kaybolabilir.
  let hazirKalan = 20;
  const hazir = (): void => {
    if (gorunumAlindi || hazirKalan <= 0) return;
    hazirKalan -= 1;
    ust.postMessage({ kanal: 'tmi-gorunum', surum: 1, tip: 'hazir' }, '*');
    komutlariBildir();
    w.setTimeout(hazir, 250);
  };
  hazir();

  w.document.documentElement.setAttribute('data-theme', ayar.tema);

  // ----- yerel depo -----
  // yerelKoku ile aynı (bu fonksiyon metin olarak gömülür, dışarıyı göremez).
  const kok = ayar.yerel.kapsam === 'kisisel' ? `data/users/${String(ayar.kisi.id)}/yerel/anahtarlar` : 'yerel';
  const parca = (anahtar: string): string =>
    encodeURIComponent(anahtar).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
  const kalici = (anahtar: string): boolean => ayar.yerel.kapsam !== 'yok' && ayar.yerel.onekler.some((o) => anahtar.startsWith(o));
  let degerler: Record<string, string> = Object.create(null) as Record<string, string>;
  const surumler = new Map<string, number | null>();
  for (const [anahtar, kayit] of Object.entries(ayar.yerel.degerler)) {
    degerler[anahtar] = kayit.deger;
    surumler.set(anahtar, kayit.surum);
  }
  const zamanlayicilar = new Map<string, number>();
  let durdu = false;
  // Yazılamayan kayıt sayfa kapanınca kaybolur: kullanıcı bilmeli. Art arda hatada bir kez uyarılır, başarı uyarıyı yeniden açar.
  // Bağlantı ya da sunucu hatasında kayıt artan beklemeyle yeniden denenir; uyarıdan sonra değişiklik sessizce kaybolmaz.
  let yazmaUyarildi = false;
  const YAZMA_HATASI_ILETISI = 'Değişiklik sunucuya kaydedilemedi; bağlantı dönünce kendiliğinden yeniden denenir. Sayfayı kapatmayın; sorun sürerse son değişikliği not alın.';
  const yenidenBekleme = new Map<string, number>();
  let yetkiUyarildi = false;
  const YETKI_ILETISI = 'Bu değişikliği kaydetme yetkiniz yok; değişiklik kaydedilmedi.';
  const yerelYaz = (anahtar: string): void => {
    zamanlayicilar.delete(anahtar);
    if (durdu) return;
    const yol = `${kok}/${parca(anahtar)}`;
    const ortak = ayar.yerel.kapsam === 'ortak';
    const beklenen = surumler.has(anahtar) ? surumler.get(anahtar) ?? null : null;
    const deger = Object.prototype.hasOwnProperty.call(degerler, anahtar) ? degerler[anahtar] : undefined;
    const is = deger === undefined
      ? istek('db-sil', { yol }).then(() => { surumler.set(anahtar, null); })
      : istek<{ belge: HamBelge }>('db-yaz', { yol, kip: 'tam', veri: { deger }, ...(ortak ? { beklenenSurum: beklenen } : {}) })
        .then((c) => { surumler.set(anahtar, c.belge.surum); });
    is.then(() => { yazmaUyarildi = false; yenidenBekleme.delete(anahtar); }, (h: Hata) => {
      // Yetki reddi çakışma ya da bağlantı sorunu değildir: kullanıcı bir kez uyarılır, yazma durmaz (yalnız bu değişiklik kaydedilmez).
      if (h.durum === 401 || h.durum === 403) {
        if (!yetkiUyarildi) { yetkiUyarildi = true; w.alert(YETKI_ILETISI); }
      } else if (ortak && h.code === 'invalid_argument') {
        // Ortak kayıtta başkasının yazdığının üstüne yazılmaz: yazma durur, kullanıcı sayfayı yeniler.
        durdu = true;
        w.alert(ayar.yerel.catismaIletisi);
      } else {
        // Arada yeni değişiklik planlandıysa o en son değeri yazar; ayrıca denenmez.
        if (h.code === 'unavailable' && !zamanlayicilar.has(anahtar)) {
          const sure = Math.min((yenidenBekleme.get(anahtar) ?? 2500) * 2, 60_000);
          yenidenBekleme.set(anahtar, sure);
          zamanlayicilar.set(anahtar, w.setTimeout(() => { yerelYaz(anahtar); }, sure));
        }
        if (!yazmaUyarildi) {
          yazmaUyarildi = true;
          w.alert(YAZMA_HATASI_ILETISI);
        }
      }
    });
  };
  const yazmayiPlanla = (anahtar: string): void => {
    if (!kalici(anahtar)) return;
    const eski = zamanlayicilar.get(anahtar);
    if (eski !== undefined) w.clearTimeout(eski);
    zamanlayicilar.set(anahtar, w.setTimeout(() => { yerelYaz(anahtar); }, 800));
  };
  const hepsiniYaz = (): void => { for (const [anahtar, z] of [...zamanlayicilar]) { w.clearTimeout(z); yerelYaz(anahtar); } };
  w.addEventListener('pagehide', hepsiniYaz);
  const depo = {
    getItem: (k: string): string | null => (Object.prototype.hasOwnProperty.call(degerler, String(k)) ? degerler[String(k)] ?? null : null),
    setItem: (k: string, v: string): void => {
      const anahtar = String(k);
      const deger = String(v);
      if (degerler[anahtar] === deger) return;
      degerler[anahtar] = deger;
      yazmayiPlanla(anahtar);
    },
    removeItem: (k: string): void => {
      const anahtar = String(k);
      if (!Object.prototype.hasOwnProperty.call(degerler, anahtar)) return;
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
  // Opak kökende kalıcı depo isteği reddedilir; veri zaten sunucuda kalıcıdır.
  try {
    const kalici = (w.navigator as Navigator | undefined)?.storage;
    if (kalici) Object.defineProperties(kalici, { persist: { configurable: true, value: () => Promise.resolve(true) }, persisted: { configurable: true, value: () => Promise.resolve(true) } });
  } catch { /* yok sayılır */ }

  // ----- belge deposu (db) -----
  const kopya = <T>(d: T): T => JSON.parse(JSON.stringify(d)) as T;
  const rastgele = (n: number): string => {
    const harfler = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    const sayilar = new Uint32Array(n);
    w.crypto.getRandomValues(sayilar);
    return Array.from(sayilar, (s) => harfler[s % harfler.length]).join('');
  };
  const meta = { fromCache: false, hasPendingWrites: false };
  const belgeAni = (id: string, b: HamBelge | null) => ({
    id, exists: b !== null, metadata: meta,
    data: (): Nesne | undefined => (b === null ? undefined : kopya(b.veri)),
  });
  type Filtre = { alan: string; islec: string; deger: unknown };
  interface Kosul { koleksiyon: string; filtreler: Filtre[]; sira: { alan: string; yon: 'asc' | 'desc' } | null; sinir: number | null }
  const sorguIstegi = (k: Kosul) => istek<{ belgeler: HamBelge[]; damga: number }>('db-sorgu', {
    koleksiyon: k.koleksiyon,
    ...(k.filtreler.length > 0 ? { filtreler: k.filtreler } : {}),
    ...(k.sira === null ? {} : { sira: k.sira }),
    ...(k.sinir === null ? {} : { sinir: k.sinir }),
  });
  const sorguAni = (belgeler: HamBelge[], onceki: HamBelge[] | null) => {
    const docs = belgeler.map((b) => belgeAni(b.kimlik, b));
    return {
      docs, size: docs.length, empty: docs.length === 0, metadata: meta,
      docChanges: () => {
        const eski = onceki ?? [];
        const degisim: { type: 'added' | 'modified' | 'removed'; doc: ReturnType<typeof belgeAni>; oldIndex: number; newIndex: number }[] = [];
        eski.forEach((b, i) => { if (!belgeler.some((y) => y.kimlik === b.kimlik)) degisim.push({ type: 'removed', doc: belgeAni(b.kimlik, b), oldIndex: i, newIndex: -1 }); });
        belgeler.forEach((b, i) => {
          const j = eski.findIndex((x) => x.kimlik === b.kimlik);
          if (j < 0) degisim.push({ type: 'added', doc: belgeAni(b.kimlik, b), oldIndex: -1, newIndex: i });
          else if (eski[j]?.surum !== b.surum) degisim.push({ type: 'modified', doc: belgeAni(b.kimlik, b), oldIndex: j, newIndex: i });
        });
        return degisim;
      },
    };
  };

  // Abonelikler damga değişince yeniden okunur; sonuç değiştiyse bildirilir.
  interface Abone { oku: () => Promise<unknown>; bildir: (sonuc: unknown, onceki: unknown) => void; hata?: ((h: Hata) => void) | undefined; son: string | null; sonVeri: unknown; acik: boolean }
  const aboneler = new Set<Abone>();
  const aboneYenile = async (a: Abone): Promise<void> => {
    try {
      const sonuc = await a.oku();
      const metin = JSON.stringify(sonuc);
      if (!a.acik || metin === a.son) return;
      const onceki = a.sonVeri;
      a.son = metin;
      a.sonVeri = sonuc;
      a.bildir(sonuc, onceki);
    } catch (h) {
      if (a.acik) a.hata?.(h as Hata);
    }
  };
  let sonDamga = -1;
  let yenileniyor = false;
  let yeniden = false;
  const yenile = async (): Promise<void> => {
    if (yenileniyor) { yeniden = true; return; }
    yenileniyor = true;
    try {
      do {
        yeniden = false;
        await Promise.all([...aboneler].map(aboneYenile));
      } while (yeniden);
    } finally {
      yenileniyor = false;
    }
  };
  let sonYoklama = 0;
  const yokla = async (): Promise<void> => {
    if (aboneler.size === 0) return;
    // Sekme arka plandayken seyrek bakılır.
    if (w.document.hidden && Date.now() - sonYoklama < 15_000) return;
    sonYoklama = Date.now();
    try {
      const { damga } = await istek<{ damga: number }>('damga');
      if (damga !== sonDamga) { sonDamga = damga; await yenile(); }
    } catch { /* bağlantı dönünce sonraki yoklama yeniler */ }
  };
  w.setInterval(() => { void yokla(); }, ayar.yoklamaMs);
  const aboneOl = (a: Omit<Abone, 'son' | 'sonVeri' | 'acik'>): (() => void) => {
    const abone: Abone = { ...a, son: null, sonVeri: null, acik: true };
    aboneler.add(abone);
    void aboneYenile(abone);
    return () => { abone.acik = false; aboneler.delete(abone); };
  };
  const yazdiktanSonra = <T>(is: Promise<T>): Promise<T> => is.then((s) => { void yenile(); return s; });

  const sorguKur = (k: Kosul): Nesne => ({
    where: (alan: string, islec: string, deger: unknown) => sorguKur({ ...k, filtreler: [...k.filtreler, { alan, islec, deger }] }),
    orderBy: (alan: string, yon?: 'asc' | 'desc') => sorguKur({ ...k, sira: { alan, yon: yon ?? 'asc' } }),
    limit: (n: number) => sorguKur({ ...k, sinir: n }),
    get: async () => sorguAni((await sorguIstegi(k)).belgeler, null),
    onSnapshot: (sonraki: (s: unknown) => void, hata?: (h: Hata) => void) => aboneOl({
      oku: async () => (await sorguIstegi(k)).belgeler,
      bildir: (sonuc, onceki) => { sonraki(sorguAni(sonuc as HamBelge[], onceki as HamBelge[] | null)); },
      hata,
    }),
  });
  const belgeKur = (yol: string): Nesne => {
    const id = yol.split('/').pop() ?? '';
    const oku = async () => (await istek<{ belge: HamBelge | null }>('db-getir', { yol })).belge;
    return {
      id, path: yol,
      get: async () => belgeAni(id, await oku()),
      set: (veri: Nesne) => yazdiktanSonra(istek('db-yaz', { yol, veri: kopya(veri), kip: 'tam' }).then(() => undefined)),
      update: (veri: Nesne) => yazdiktanSonra(istek('db-yaz', { yol, veri: kopya(veri), kip: 'birlestir' }).then(() => undefined)),
      delete: () => yazdiktanSonra(istek('db-sil', { yol }).then(() => undefined)),
      acquire: (s: { holder: string; ttlMs?: number; data?: Nesne }) => istek<{ alindi: boolean; surum: number | null; bitis: string | null }>('db-kilit', {
        yol, sahip: s.holder, sureMs: s.ttlMs ?? 30_000, ...(s.data === undefined ? {} : { veri: kopya(s.data) }),
      }).then((c) => (c.alindi
        ? { acquired: true, ...(c.surum === null ? {} : { version: c.surum }), ...(c.bitis === null ? {} : { expiresAt: c.bitis }), holder: s.holder }
        : { acquired: false, ...(c.bitis === null ? {} : { expiresAt: c.bitis }) })),
      onSnapshot: (sonraki: (s: unknown) => void, hata?: (h: Hata) => void) => aboneOl({
        oku,
        bildir: (sonuc) => { sonraki(belgeAni(id, sonuc as HamBelge | null)); },
        hata,
      }),
      collection: (alt: string) => koleksiyonKur(`${yol}/${alt}`),
    };
  };
  const koleksiyonKur = (yol: string): Nesne => ({
    ...sorguKur({ koleksiyon: yol, filtreler: [], sira: null, sinir: null }),
    path: yol,
    doc: (id?: string) => belgeKur(`${yol}/${id ?? rastgele(20)}`),
    add: async (veri: Nesne) => {
      const ref = belgeKur(`${yol}/${rastgele(20)}`) as { set: (v: Nesne) => Promise<void> };
      await ref.set(veri);
      return ref;
    },
  });
  const db = Object.freeze({ doc: belgeKur, collection: koleksiyonKur });

  // ----- kişi (user) -----
  const RENKLER = ['#0E8C89', '#7B5EA7', '#8A5A2B', '#B5487A', '#C2671C', '#2F6FB3', '#3E7D3A', '#9A3D3D'];
  const renk = (id: string): string => {
    let t = 0;
    for (const c of id) t = (t * 31 + c.charCodeAt(0)) % 1_000_003;
    return RENKLER[t % RENKLER.length] ?? '#8592A6';
  };
  const benId = String(ayar.kisi.id);
  let kisiler: Promise<{ id: number; ad: string }[]> | null = null;
  let kisilerAni = 0;
  const kisileriAl = (): Promise<{ id: number; ad: string }[]> => {
    if (kisiler === null || Date.now() - kisilerAni > 60_000) {
      kisilerAni = Date.now();
      kisiler = istek<{ kisiler: { id: number; ad: string }[] }>('kisiler').then((c) => c.kisiler).catch(() => []);
    }
    return kisiler;
  };
  const profil = (k: { id: number; ad: string }) => {
    const id = String(k.id);
    return { id, name: k.ad, avatarUrl: '', color: renk(id), email: null, isMe: id === benId, guest: false };
  };
  const kisi = Object.freeze({
    isOwner: async () => ayar.yonetici,
    canEdit: async () => ayar.yonetici,
    can: async (ad: string) => (ad === 'data.write' ? ayar.yazabilir : null),
    me: async () => ({ id: benId, name: ayar.kisi.ad, avatarUrl: '', color: renk(benId), email: null, isOwner: ayar.yonetici, canEdit: ayar.yonetici }),
    id: async () => benId,
    name: async () => ayar.kisi.ad,
    avatarUrl: async () => null,
    email: async () => null,
    profiles: async (idler: readonly string[] | string) => {
      const istenen = new Set(typeof idler === 'string' ? [idler] : idler);
      const sonuc: Record<string, ReturnType<typeof profil>> = {};
      for (const k of await kisileriAl()) if (istenen.has(String(k.id))) sonuc[String(k.id)] = profil(k);
      return sonuc;
    },
    search: async (q: string) => {
      const ara = String(q).toLocaleLowerCase('tr');
      return (await kisileriAl()).filter((k) => k.ad.toLocaleLowerCase('tr').includes(ara)).map(profil);
    },
  });

  // ----- oda (room): o an açık olanlar; kalıcı değildir -----
  interface Es { peer: string; by: string; isMe: boolean; sameTab: boolean; kind: 'viewer'; guest: false; presence: Nesne; updatedAt: number }
  let esler: Es[] = [];
  const esDinleyicileri = new Set<(d: { peers: Es[]; joined: Es[]; left: Es[]; updated: Es[] }) => void>();
  let odaZamanlayici: number | null = null;
  const odaYokla = async (yama: Nesne = {}): Promise<void> => {
    const c = await istek<{ esler: { kisiId: number; durum: Nesne; guncellendi: number }[] }>('oda', { durum: yama });
    const onceki = esler;
    esler = c.esler.map((e) => {
      const by = String(e.kisiId);
      return { peer: by, by, isMe: by === benId, sameTab: by === benId, kind: 'viewer' as const, guest: false as const, presence: e.durum, updatedAt: e.guncellendi };
    });
    const yeni = esler.filter((e) => !onceki.some((o) => o.peer === e.peer));
    const giden = onceki.filter((o) => !esler.some((e) => e.peer === o.peer));
    const degisen = esler.filter((e) => onceki.some((o) => o.peer === e.peer && JSON.stringify(o.presence) !== JSON.stringify(e.presence)));
    if (yeni.length + giden.length + degisen.length > 0) esDinleyicileri.forEach((d) => { d({ peers: esler, joined: yeni, left: giden, updated: degisen }); });
  };
  const odayiBaslat = (): void => {
    if (odaZamanlayici !== null) return;
    odaZamanlayici = w.setInterval(() => { void odaYokla().catch(() => undefined); }, 5000);
  };
  const oda = Object.freeze({
    presence: async (yama: Nesne) => { odayiBaslat(); await odaYokla(yama); },
    peers: () => esler,
    onPeers: (dinleyici: (d: { peers: Es[]; joined: Es[]; left: Es[]; updated: Es[] }) => void) => {
      esDinleyicileri.add(dinleyici);
      odayiBaslat();
      void odaYokla().catch(() => undefined);
      return () => { esDinleyicileri.delete(dinleyici); };
    },
    emit: async () => undefined,
    on: () => () => undefined,
    join: () => oda,
    leave: async () => undefined,
  });

  // ----- ekler (assets) ve /_blob/ adresleri -----
  const ekAdresleri = new Map<string, Promise<string>>();
  const base64 = (blob: Blob): Promise<string> => new Promise((coz, reddet) => {
    const okuyucu = new w.FileReader();
    okuyucu.onload = () => { coz(String(okuyucu.result).replace(/^data:[^,]*,/, '')); };
    okuyucu.onerror = () => { reddet(okuyucu.error ?? new Error('okunamadı')); };
    okuyucu.readAsDataURL(blob);
  });
  const ekler = Object.freeze({
    upload: async (blob: Blob, secenek?: { type?: string; name?: string }) => {
      if (blob.size > ayar.azamiEkBayt) throw { code: 'resource_exhausted', message: 'Dosya bu modülde en çok 700 KB olabilir.' } satisfies Hata;
      const tur = (secenek?.type ?? blob.type ?? '').split(';')[0]?.trim().toLowerCase() || 'application/octet-stream';
      const ad = secenek?.name ?? (blob as Blob & { name?: string }).name ?? 'dosya';
      const c = await istek<{ id: string; boyut: number; tur: string }>('ek-yukle', { ad: String(ad).slice(0, 200) || 'dosya', tur, veri: await base64(blob) });
      const url = w.URL.createObjectURL(blob);
      ekAdresleri.set(c.id, Promise.resolve(url));
      return { id: c.id, url, sizeBytes: c.boyut, contentType: c.tur };
    },
    list: async () => ({ assets: [], usage: { bytes: 0 } }),
    delete: async () => undefined,
  });
  const ekAdresi = (id: string): Promise<string> => {
    let adres = ekAdresleri.get(id);
    if (adres === undefined) {
      adres = istek<{ tur: string; veri: string }>('ek-oku', { id }).then((c) => {
        const ikili = w.atob(c.veri);
        const baytlar = new Uint8Array(ikili.length);
        for (let i = 0; i < ikili.length; i += 1) baytlar[i] = ikili.charCodeAt(i);
        return w.URL.createObjectURL(new w.Blob([baytlar], { type: c.tur }));
      });
      ekAdresleri.set(id, adres);
    }
    return adres;
  };
  const BLOB = /^\/_blob\/([0-9a-f]{32})$/;
  const adresiCevir = (el: Element): void => {
    for (const nitelik of ['src', 'href']) {
      const deger = el.getAttribute(nitelik);
      const eslesme = deger === null ? null : BLOB.exec(deger);
      if (eslesme?.[1] === undefined) continue;
      void ekAdresi(eslesme[1]).then((url) => { if (el.getAttribute(nitelik) === deger) el.setAttribute(nitelik, url); }, () => undefined);
    }
  };
  const tara = (kok: ParentNode): void => { kok.querySelectorAll('[src^="/_blob/"],[href^="/_blob/"]').forEach(adresiCevir); };
  new w.MutationObserver((kayitlar) => {
    for (const k of kayitlar) {
      if (k.type === 'attributes' && k.target instanceof w.Element) adresiCevir(k.target);
      k.addedNodes.forEach((d) => { if (d instanceof w.Element) { adresiCevir(d); tara(d); } });
    }
  }).observe(w.document, { subtree: true, childList: true, attributes: true, attributeFilter: ['src', 'href'] });

  // ----- indirme (downloads) -----
  const indirme = Object.freeze({
    save: async (s: { filename: string; data: Blob | string | ArrayBuffer | Uint8Array }) => {
      const blob = s.data instanceof w.Blob ? s.data : new w.Blob([s.data as BlobPart]);
      const a = w.document.createElement('a');
      a.href = w.URL.createObjectURL(blob);
      a.download = s.filename;
      w.document.body.appendChild(a);
      a.click();
      a.remove();
      w.setTimeout(() => { w.URL.revokeObjectURL(a.href); }, 30_000);
      return { status: 'saved' };
    },
  });

  // ----- window.claude -----
  const yetenekler: Record<string, unknown> = { db, user: kisi, room: oda, assets: ayar.yazabilir ? ekler : null, downloads: indirme };
  const cozulmus = new Map<string, Promise<unknown>>();
  const claude = Object.freeze({
    use: (ad: string): Promise<unknown> => {
      let p = cozulmus.get(ad);
      if (p === undefined) {
        // Söz betiğin ilk koşusunda değil, sonra çözülür (sözleşme).
        p = new Promise((coz) => { w.setTimeout(() => { coz(ayar.yetenekler.includes(ad) ? yetenekler[ad] ?? null : null); }, 0); });
        cozulmus.set(ad, p);
      }
      return p;
    },
  });
  try { Object.defineProperty(w, 'claude', { configurable: true, value: claude }); } catch { /* yetenek yok sayılır */ }
}

// Sayfaya gömülecek betik: fonksiyon metni ve ayar JSON'u. `<` ve satır ayırıcılar kaçırılır ki kişi adı betiği kapatamasın.
export function cerceveBetigi(ayar: CerceveAyari): string {
  const json = JSON.stringify(ayar).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
  const govde = cerceveKoprusu.toString().replace(/<\/script/gi, '<\\/script');
  return `<script>(${govde})(window, ${json});</script>`;
}
