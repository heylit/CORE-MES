// Çerçevenin içinde, prototipin betiğinden ÖNCE koşan köprü. Prototip değiştirilmez: bütün durumunu tuttuğu yerel depo
// (localStorage) buradan TMI uçlarına gider. Çerçeve yalıtılmıştır (opak köken): tek kapı kabuğa giden iletidir; kabuk
// (kopru.ts) yalnız bilinen istek türlerini uca çevirir.
//
// Fonksiyon metin olarak sayfaya gömülür (`cerceveBetigi`): dışındaki hiçbir ada başvurmaz, ithal etmez.

import { glbYaz } from './glb.ts';

export interface CerceveAyari {
  // İleti kanalı; modülün adıdır.
  kanal: string;
  // Yazma işlemi yoksa değişiklikler yalnız açık sekmede kalır (sunucuya gitmez).
  yazabilir: boolean;
  // Kalıcı tutulan anahtarların öneki; öteki anahtarlar yalnız bellekte durur.
  onek: string;
  // Açılıştaki kayıtlar: anahtar, prototipin yazdığı metin ve sürüm.
  degerler: Readonly<Record<string, { deger: string; surum: number }>>;
  catismaIletisi: string;
  buyukIletisi: string;
  // İstek gövdesinin üst sınırı (sunucu gövde sınırının altında); aşan kayıt gönderilmez, kullanıcı bir kez uyarılır.
  azamiBayt: number;
  // Değişiklikten sonra yazmadan önce beklenen süre (art arda değişiklikler tek yazmada birleşir).
  beklemeMs: number;
  // Üst çubuğa toplu aktarım sayfasını açan düğme konur (toplu kipte modeller üretilir); kapalıysa ikisi de olmaz.
  aktarabilir: boolean;
  // Aktarım düğmesinin simgesi (24x24 SVG yolu); kabuğun simge setinden gelir, çerçeve ithal etmez.
  aktarimSimgesi: string;
  // Prototipin bütün durumunu tuttuğu anahtar (seçili makine ve elle eklenen makineler buradadır).
  durumAnahtari: string;
  // Toplu aktarım sayfası (kart #1196): çerçeve görünmez; düğme konmaz, makine listesi kabuğa yollanır ve kabuğun istediği
  // makinenin modeli üretilir. Bu kipte çerçeve kayıt yazmaz (yazabilir kapalı verilir).
  toplu?: boolean;
  // Kurulumda seçilen üretim emrinin anahtarı (önekle). Verilirse kurulum görünümüne emir çubuğu konur. Kurulum üretim emri
  // başınadır: emir yalnız emir seçme isteğiyle değişir (sunucu kurulumu emre saklar, yeni emrinkini açar; kabuk çerçeveyi
  // yeniden kurar). Bu anahtar ve emirlerin saklanan kurulumları (anahtar + '.') çerçeveden yazılmaz. Toplu kipte konmaz.
  emirAnahtari?: string;
  // Adımların "seçildi" işaretlerinin anahtarı: kişi bir adımda seçimini yapıp sonraki adıma geçince adım işaretlenir. Emirle
  // birlikte saklanır; bütün adımlar seçilince "Kurulum tamam" verilebilir. Emir anahtarı yoksa kullanılmaz.
  secimAnahtari?: string;
  // Yalnız hazırlık onayı olan kişi (yazma işlemi yok): sayfa Hazırlık görünümünde açılır, öteki görünümler ve üst çubuk
  // düğmeleri gizlenir; seçimi değiştiren her eylem (kart, kaydırma, ok tuşları, alanlar, dosya) durdurulur. Seçimler kurulumdan
  // gelir; kişi adımları sırayla onaylar. Sunucu zaten yalnız onay alanlarını alır; burası yerelde de seçim değişmesin diye.
  saltOnay?: boolean;
  // Onay saatlerinin gösterildiği saat dilimi (tesisin); verilmezse tarayıcınınki.
  saatDilimi?: string;
  // Çerçeve yeniden kurulunca açılacak görünüm (emir seçimi Kurulum'da yapılır; yeniden kurulan çerçeve orada kalmalı).
  acilisGorunumu?: string;
}

// Toplu aktarım listesindeki makine: ad ve numara prototipin gösterdiğiyle aynıdır.
export interface MakineOzeti { makineId: string; no: string | null; ad: string }

// Kabuğa giden model: ad ve numara prototipin gösterdiğiyle aynıdır (elle yapılan düzeltmeler dahil).
export interface ModelIletisi { makineId: string; no: string | null; ad: string; glb: Uint8Array }

type Nesne = Record<string, unknown>;
interface Hata { durum: number; message: string }

export function cerceveKoprusu(
  w: Window & typeof globalThis, ayar: CerceveAyari, glb: (kok: never, ad: string) => Uint8Array,
): void {
  const ust = w.parent;
  let sayac = 0;
  const bekleyen = new Map<number, { coz: (v: unknown) => void; reddet: (h: Hata) => void }>();

  // ----- kabukla konuşma -----
  const istek = <T>(tip: string, veri: Nesne): Promise<T> => new Promise<T>((coz, reddet) => {
    sayac += 1;
    bekleyen.set(sayac, { coz: coz as (v: unknown) => void, reddet });
    ust.postMessage({ kanal: ayar.kanal, yon: 'istek', id: sayac, tip, veri }, '*');
  });
  // Prototipin STEP okuyucusu (WASM) açılışta çerçevede yoktur; ilk STEP dosyasında kabuktan istenir.
  (w as unknown as { __tmiStepOkuyucu: () => Promise<string> }).__tmiStepOkuyucu = () => istek<string>('step-okuyucu', {});
  let gorunumAlindi = false;
  w.addEventListener('message', (olay: MessageEvent) => {
    if (olay.source !== ust) return;
    const m = olay.data as { kanal?: unknown; yon?: unknown; id?: unknown; ok?: unknown; veri?: unknown; hata?: unknown; durum?: unknown; tip?: unknown } | null;
    if (m === null || typeof m !== 'object') return;
    if (m.kanal === 'tmi-gorunum' && m.tip === 'gorunum') { gorunumAlindi = true; return; }
    if (m.kanal !== ayar.kanal || m.yon !== 'yanit' || typeof m.id !== 'number') return;
    const b = bekleyen.get(m.id);
    if (b === undefined) return;
    bekleyen.delete(m.id);
    if (m.ok === true) b.coz(m.veri);
    else b.reddet({ durum: typeof m.durum === 'number' ? m.durum : 0, message: typeof m.hata === 'string' ? m.hata : 'İşlem yapılamadı.' });
  });

  // Kabuğun görünüm sözleşmesi: `hazir` görünüm gelene kadar yinelenir. Prototip tek görünümdür, gelen görünüm yalnız alınır.
  let hazirKalan = 20;
  const hazir = (): void => {
    if (gorunumAlindi || hazirKalan <= 0) return;
    hazirKalan -= 1;
    ust.postMessage({ kanal: 'tmi-gorunum', surum: 1, tip: 'hazir' }, '*');
    w.setTimeout(hazir, 250);
  };
  hazir();

  // ----- yerel depo -----
  const emirKaydiMi = (anahtar: string): boolean => ayar.emirAnahtari !== undefined
    && (anahtar === ayar.emirAnahtari || anahtar.startsWith(`${ayar.emirAnahtari}.`));
  const kalici = (anahtar: string): boolean => ayar.yazabilir && anahtar.startsWith(ayar.onek) && !emirKaydiMi(anahtar);
  let degerler: Record<string, string> = Object.create(null) as Record<string, string>;
  const surumler = new Map<string, number | null>();
  for (const [anahtar, kayit] of Object.entries(ayar.degerler)) {
    degerler[anahtar] = kayit.deger;
    surumler.set(anahtar, kayit.surum);
  }
  const zamanlayicilar = new Map<string, number>();
  // Bir kayıt sunucuya yazılınca çağrılır (hazırlık onay kaydı yenilenir).
  let yazildi: ((anahtar: string) => void) | null = null;
  // Anahtar başına tek yazma yoldadır: sonraki yazma bir öncekinin döndürdüğü sürümle gider.
  const yolda = new Set<string>();
  const sirada = new Set<string>();
  let durdu = false;
  let buyukUyarildi = false;
  // Yeniden denenen ya da reddedilen kayıt kullanıcıya söylenir: sayfa kapanırsa değişiklik kaybolur.
  let yazmaUyarildi = false;
  const YAZMA_HATASI_ILETISI = 'Değişiklik sunucuya kaydedilemedi; bağlantı dönünce kendiliğinden yeniden denenir. Sayfayı kapatmayın; sorun sürerse son değişikliği not alın.';
  const YETKI_ILETISI = 'Bu değişikliği kaydetme yetkiniz yok; bundan sonraki değişiklikler kaydedilmez.';
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
      is = istek<{ kayit: { surum: number } }>('kayit-yaz', veri).then((c) => { surumler.set(anahtar, c.kayit.surum); yazildi?.(anahtar); });
    }
    yolda.add(anahtar);
    is.then(() => { yazmaUyarildi = false; }, (h: Hata) => {
      if (h.durum === 409) {
        // Ortak kayıtta başkasının yazdığının üstüne yazılmaz: yazma durur, kullanıcı sayfayı yeniler.
        durdu = true;
        w.alert(ayar.catismaIletisi);
      } else if (h.durum === 403 || h.durum === 401) {
        durdu = true;
        w.alert(YETKI_ILETISI);
      } else if (h.durum >= 400 && h.durum < 500) {
        // Sunucunun reddettiği kayıt (geçersiz değer) yinelenmez; sonraki değişiklik yeniden dener.
      } else {
        // Bağlantı ya da sunucu hatası: kayıt kaybolmasın, biraz sonra yeniden denenir.
        w.setTimeout(() => { yazmayiPlanla(anahtar); }, 5000);
        if (!yazmaUyarildi) { yazmaUyarildi = true; w.alert(YAZMA_HATASI_ILETISI); }
      }
    }).finally(() => {
      yolda.delete(anahtar);
      if (sirada.delete(anahtar)) yazmayiPlanla(anahtar);
    });
  };
  // Bakmak veri değiştirmez: prototip açılışta ve görünüm sekmesi değişince durumu varsayılanlarla tamamlayıp yeniden yazar.
  // Kullanıcı sekme şeridi dışında bir şeye dokunana ya da bir şey yazana kadar değişiklik yalnız bellekte kalır; ilk eylemde
  // bekleyenler de yazılır. Aynı anda açan iki kişi böylece birbirinin sürümünü eskitmez.
  let eylemVar = false;
  const ertelenen = new Set<string>();
  const yazmayiPlanla = (anahtar: string): void => {
    if (!kalici(anahtar) || durdu) return;
    if (!eylemVar) { ertelenen.add(anahtar); return; }
    const eski = zamanlayicilar.get(anahtar);
    if (eski !== undefined) w.clearTimeout(eski);
    zamanlayicilar.set(anahtar, w.setTimeout(() => { yerelYaz(anahtar); }, ayar.beklemeMs));
  };
  const eylem = (olay: Event): void => {
    if (eylemVar) return;
    const hedef = olay.target;
    if (olay.type === 'pointerdown' && hedef instanceof w.Element && hedef.closest('header .views') !== null) return;
    eylemVar = true;
    for (const anahtar of ertelenen) yazmayiPlanla(anahtar);
    ertelenen.clear();
  };
  for (const tur of ['pointerdown', 'keydown', 'input', 'change', 'paste', 'drop']) w.document.addEventListener(tur, eylem, true);
  const hepsiniYaz = (): void => { for (const [anahtar, z] of [...zamanlayicilar]) { w.clearTimeout(z); yerelYaz(anahtar); } };
  w.addEventListener('pagehide', hepsiniYaz);
  // Durum anahtarı değişince aktarım düğmesinin ipucu seçili makineyi gösterir (aktarım kapalıysa boş kalır).
  let durumDegisti: (() => void) | null = null;
  const depo = {
    getItem: (k: string): string | null => (has(String(k)) ? degerler[String(k)] ?? null : null),
    setItem: (k: string, v: string): void => {
      const anahtar = String(k);
      const deger = String(v);
      if (degerler[anahtar] === deger) return;
      degerler[anahtar] = deger;
      yazmayiPlanla(anahtar);
      if (anahtar === ayar.durumAnahtari) durumDegisti?.();
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
  // Sunucu durumu okuyacak bir komuttan önce (emir seçimi, kurulum tamam) bekleyen her değişiklik yazılır. Prototip durumunu
  // kısa beklemeyle (250 ms) depoya koyar: önce o beklenir.
  const bosalt = (): Promise<void> => new Promise((coz) => {
    w.setTimeout(() => {
      hepsiniYaz();
      const bak = (): void => { if (yolda.size === 0 && sirada.size === 0 && zamanlayicilar.size === 0) coz(); else w.setTimeout(bak, 50); };
      bak();
    }, 300);
  });
  const saat = (zaman: string): string => {
    const t = new Date(zaman);
    return Number.isNaN(t.getTime()) ? '' : t.toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: ayar.saatDilimi });
  };
  // Seçili emrin "kurulum tamam" kaydı (hazırlık okumasıyla gelir); değişince emir çubuğu yeniden çizilir.
  type KurulumKaydi = { kisi: { ad: string }; zaman: string; gecerli: boolean };
  let kurulum: KurulumKaydi | null = null;
  let kurulumDegisti: (() => void) | null = null;

  // ----- üretim emri seçimi -----
  // Prototip değiştirilmez: kurulum kartı her çiziminde yeniden kurulur, seçim satırı kart çizilince yeniden eklenir. Alan
  // prototipin kendi girdisidir (görünümünü alır), seçenekler emir listesinden gelir; yazarak da aranır.
  const emirAnahtari = ayar.emirAnahtari;
  if (emirAnahtari !== undefined && !ayar.toplu) {
    // Seçenek iş emridir (karar 266 a): hazırlık operasyon başınadır, emrin numarası operasyonla gösterilir.
    type EmirSecenegi = { id: number; uretimEmriId: number; emirNo: string; opNo: number; ad: string; parcaNo: string; parcaAd: string; adet: number; istasyon: string };
    const operasyon = (e: EmirSecenegi): string => `${e.emirNo} · OP${String(e.opNo)} ${e.ad}`;
    const etiket = (e: EmirSecenegi): string => `${operasyon(e)} · ${e.parcaNo} ${e.parcaAd} · ${String(e.adet)} adet · ${e.istasyon}`;
    let secenekler: EmirSecenegi[] | null = null;
    let listeHatasi = false;
    const secili = (): EmirSecenegi | null => {
      const metin = has(emirAnahtari) ? degerler[emirAnahtari] : undefined;
      if (metin === undefined) return null;
      try {
        const e = JSON.parse(metin) as Partial<EmirSecenegi> | null;
        // 266 a öncesinin seçimi (üretim emri, operasyonsuz) seçim sayılmaz; sunucu da saymaz.
        return e !== null && typeof e.id === 'number' && typeof e.uretimEmriId === 'number' && typeof e.emirNo === 'string' ? e as EmirSecenegi : null;
      } catch { return null; }
    };
    const gorunenDeger = (): string => {
      const e = secili();
      if (e === null) return '';
      const acik = secenekler === null || secenekler.some((x) => x.id === e.id);
      return acik ? etiket(e) : `${etiket(e)} (açık değil)`;
    };
    // Emir, kurulum görünümünde sahnenin üstünde ortalı bir çubuktur; sağ panelde seçilenler (kurulum kartı) üste, önizleme ve
    // tezgâh ayrıntısı küçülerek alta iner: kart adım adım dolarken baştan görünür. Çubuk sahneye değil gövdeye konur; sahne
    // sürüklemeyi yakalar, girdiye tıklamayı yutardı. data-page ile yalnız kurulum görünümünde çıkar.
    const DUZEN = [
      '#tmiEmirCubugu{position:fixed;top:64px;left:16px;right:406px;max-width:680px;margin:0 auto;z-index:3;padding:8px 12px;',
      'background:var(--panel2);border:1px solid var(--line);border-radius:12px;box-shadow:0 6px 18px rgba(0,0,0,.35)}',
      '#tmiEmirCubugu label{flex-direction:row;align-items:center;gap:10px;font-size:12px;white-space:nowrap}',
      '#tmiEmirCubugu input{font-size:14px;min-width:0}',
      '#stepInfo{top:76px}',
      '#side #sideScroll{order:1}',
      '#side .detail{order:2;max-height:24%;box-shadow:none;border-top:1px solid var(--line)}',
      '#side .previewBox{order:3;height:150px;border-top:1px solid var(--line);border-bottom:0}',
      '#tmiEmirCubugu{align-items:center}',
      '#tmiEmirCubugu label{flex:1 1 auto;min-width:0}',
      '#tmiTamam{display:flex;align-items:center;gap:6px;flex:0 0 auto}',
      '#tmiTamam em{font-style:normal;color:var(--muted);font-size:11px}',
      '#tmiTamam.hazir{border-color:var(--acc);color:var(--acc)}',
      '#tmiTamam.tamam{border-color:var(--ok);color:var(--ok)}',
      '#tmiTamam.degisti{border-color:var(--warn);color:var(--warn)}',
      '#tmiTamam:disabled{opacity:.6;cursor:default}',
      '#tmiKurulumKisi{font-size:11px;color:var(--muted);white-space:nowrap}',
      '.srow.tmiSecildi>span:first-child::after,.sh.tmiSecildi::after{content:"✓ seçildi";margin-left:8px;color:var(--ok);font-size:10px;font-weight:600;letter-spacing:0;text-transform:none}',
      '.trow.tmiSecildi .tn::after{content:" ✓";color:var(--ok)}',
      '#tmiAdimRozet{margin-left:8px;color:var(--ok);font-weight:600}',
      '#tmiSonOnay{position:fixed;left:50%;bottom:96px;transform:translateX(-50%);z-index:6;display:flex;align-items:center;gap:10px;',
      'max-width:calc(100% - 32px);padding:10px 12px;background:var(--panel2);border:1px solid var(--ok);border-radius:12px;box-shadow:0 10px 28px rgba(0,0,0,.45);font-size:13px}',
      '#tmiSonOnay span{flex:1 1 auto;min-width:0}',
      // Hazırlık, seçili emrin hazırlığıdır: emir hem sahnedeki bilgi kutusunda hem panelin başında görünür.
      '#tmiHzEmir{margin-top:6px;padding-top:6px;border-top:1px solid var(--line);font-size:12px;color:var(--text);white-space:normal}',
      '#tmiHzEmir b{color:var(--acc)}',
      '#tmiHzKart{flex:0 0 auto;padding:12px 16px;border-bottom:1px solid var(--line);background:var(--panel2);font-size:12.5px}',
      '#tmiHzKart small{display:block;color:var(--muted);font-size:11px;letter-spacing:.06em;text-transform:uppercase}',
      '#tmiHzKart b{display:block;font-size:15px;margin:2px 0}',
      '#tmiHzKart span{display:block;color:var(--muted)}',
      '#tmiHzKart em{display:block;margin-top:6px;font-style:normal;font-weight:600;color:var(--warn)}',
      '#tmiHzKart em.tamam{color:var(--ok)}',
      '#tmiSonOnay .hbtn.birincil{border-color:var(--acc);color:var(--acc)}',
      '@media (max-width:860px){#tmiEmirCubugu{right:16px}#side .previewBox{height:120px}#tmiKurulumKisi{display:none}}',
      '#tmiTamam span.kisa{display:none}',
      '@media (max-width:520px){#tmiTamam span.ad{display:none}#tmiTamam span.kisa{display:inline}}',
    ].join('');
    // ----- "seçildi" işaretleri ve "Kurulum tamam" -----
    // Prototipin adım sırası: yedi genel adım, her cep için bir takım adımı, ölçüm ve sarf. Adımın anahtarı prototipin
    // kendi adım anahtarıdır (cep sayısı değişince ölçüm ve sarfın sırası kayar, anahtarı kaymaz).
    const GENEL = ['machine', 'material', 'fixture', 'jaw', 'zero', 'wcs', 'coolant'];
    const adimAnahtari = (i: number, toplam: number): string => (i < GENEL.length ? GENEL[i] ?? ''
      : i === toplam - 2 ? 'gauges' : i === toplam - 1 ? 'cons' : `T${String(i - GENEL.length + 1)}`);
    const secimAnahtari = ayar.secimAnahtari;
    const isaretleyebilir = secimAnahtari !== undefined && ayar.yazabilir && ayar.saltOnay !== true;
    const isaretler = (): Record<string, unknown> => {
      if (secimAnahtari === undefined) return {};
      try {
        const d = JSON.parse(degerler[secimAnahtari] ?? 'null') as { adimlar?: unknown } | null;
        return d !== null && typeof d.adimlar === 'object' && d.adimlar !== null ? d.adimlar as Record<string, unknown> : {};
      } catch { return {}; }
    };
    const isaretle = (anahtar: string): void => {
      if (!isaretleyebilir || secimAnahtari === undefined || anahtar === '') return;
      const a = isaretler();
      if (a[anahtar] === true) return;
      depo.setItem(secimAnahtari, JSON.stringify({ adimlar: { ...a, [anahtar]: true } }));
    };
    const adimOku = (): { i: number; toplam: number } | null => {
      const no = Number(w.document.getElementById('stepNo')?.textContent);
      const toplam = Number(w.document.getElementById('stepTotal')?.textContent);
      return Number.isInteger(no) && no > 0 && Number.isInteger(toplam) && toplam >= no ? { i: no - 1, toplam } : null;
    };
    let adim: { i: number; toplam: number } | null = null;
    // Kurulum kartında görünen adımlar "Kurulum tamam" için gerekir: boş cepler kartta yoktur, gerekmez.
    type Gereken = { anahtar: string; ad: string; deger: string };
    const gerekenler = (): Gereken[] => {
      const kart = w.document.getElementById('sheet');
      const toplam = adim?.toplam ?? adimOku()?.toplam;
      if (kart === null || toplam === undefined) return [];
      const liste: Gereken[] = [];
      for (const el of kart.querySelectorAll<HTMLElement>('[data-i]')) {
        const anahtar = adimAnahtari(Number(el.getAttribute('data-i')), toplam);
        if (el.classList.contains('trow')) {
          const tt = el.querySelector('.tt');
          if (tt?.querySelector('small')?.textContent === 'boş') continue;
          liste.push({ anahtar, ad: el.querySelector('.tn')?.textContent ?? anahtar, deger: tt?.firstChild?.textContent ?? '' });
        } else if (el.classList.contains('chips')) {
          const baslik = el.previousElementSibling;
          liste.push({ anahtar, ad: baslik?.firstChild?.textContent?.trim() ?? anahtar, deger: `${String(el.querySelectorAll('span:not(.mut)').length)} kalem` });
        } else {
          liste.push({ anahtar, ad: el.querySelector('span')?.textContent ?? anahtar, deger: el.querySelector('b')?.textContent ?? '' });
        }
      }
      return liste;
    };
    let dugme: HTMLButtonElement | null = null;
    const dugmeCiz = (): void => {
      const belge = w.document;
      const b = dugme;
      if (b === null) return;
      const liste = gerekenler();
      const a = isaretler();
      // Bulunulan adım "Kurulum tamam" ile seçilmiş sayılır (son adımdan sonraki adım yoktur).
      const simdiki = adim === null ? '' : adimAnahtari(adim.i, adim.toplam);
      const secilen = liste.filter((g) => a[g.anahtar] === true || g.anahtar === simdiki).length;
      const hazir = secili() !== null && liste.length > 0 && secilen === liste.length;
      b.className = `hbtn ${kurulum?.gecerli === true ? 'tamam' : kurulum !== null ? 'degisti' : hazir ? 'hazir' : ''}`;
      b.disabled = !hazir && kurulum?.gecerli !== true;
      b.replaceChildren();
      const ad = belge.createElement('span');
      ad.className = 'ad';
      ad.textContent = kurulum?.gecerli === true ? '✓ Kurulum tamam' : kurulum !== null ? 'Yeniden onayla' : 'Kurulum tamam';
      // Dar ekranda kısa ad (emir alanına yer kalsın).
      const kisa = belge.createElement('span');
      kisa.className = 'kisa';
      kisa.textContent = kurulum?.gecerli === true ? '✓ Tamam' : kurulum !== null ? 'Yeniden' : 'Tamam';
      const sayi = belge.createElement('em');
      sayi.textContent = kurulum?.gecerli === true ? '' : `${String(secilen)}/${String(liste.length)}`;
      b.append(ad, kisa, sayi);
      b.title = kurulum?.gecerli === true ? `Kurulum tamam: ${kurulum.kisi.ad} · ${saat(kurulum.zaman)}`
        : kurulum !== null ? 'Kurulum tamamlandıktan sonra seçimler değişti; yeniden onaylayın.'
          : secili() === null ? 'Önce üretim emrini seçin.' : hazir ? 'Seçimleri onaylayıp kurulumu tamamlayın.' : 'Bütün adımları sırayla seçin.';
      b.setAttribute('aria-label', b.title);
      const kisi = belge.getElementById('tmiKurulumKisi');
      if (kisi !== null) kisi.textContent = kurulum === null ? '' : `${kurulum.kisi.ad} · ${saat(kurulum.zaman)}${kurulum.gecerli ? '' : ' · değişti'}`;
    };
    // Hazırlık görünümünde emir seçilmez; hangi emrin hazırlığı olduğu ve kurulumunun durumu okunur.
    const hazirlikEmriCiz = (): void => {
      const belge = w.document;
      const e = secili();
      const acik = e === null || secenekler === null || secenekler.some((x) => x.id === e.id);
      const durumMetni = e === null ? '' : kurulum?.gecerli === true ? `✓ Kurulum tamam · ${kurulum.kisi.ad} · ${saat(kurulum.zaman)}`
        : kurulum !== null ? 'Kurulum tamamlandıktan sonra seçimler değişti' : 'Kurulum henüz tamamlanmadı';
      const bilgi = belge.querySelector('#prepStage .prinfo');
      if (bilgi !== null) {
        let satir = belge.getElementById('tmiHzEmir');
        if (satir === null) { satir = belge.createElement('div'); satir.id = 'tmiHzEmir'; bilgi.appendChild(satir); }
        satir.replaceChildren();
        if (e === null) satir.textContent = 'Üretim emri seçilmedi · Kurulum ekranında seçin';
        else {
          const no = belge.createElement('b');
          no.textContent = operasyon(e);
          satir.append(no, ` · ${e.parcaNo} ${e.parcaAd} · ${String(e.adet)} adet${acik ? '' : ' (açık değil)'}`);
        }
      }
      const yan = belge.getElementById('prepSide');
      const panel = belge.getElementById('prPanel');
      if (yan !== null && panel !== null) {
        let kart = belge.getElementById('tmiHzKart');
        if (kart === null) { kart = belge.createElement('div'); kart.id = 'tmiHzKart'; yan.insertBefore(kart, panel); }
        kart.replaceChildren();
        const baslik = belge.createElement('small');
        baslik.textContent = 'Üretim emri';
        const no = belge.createElement('b');
        no.textContent = e === null ? 'Seçilmedi' : `${operasyon(e)}${acik ? '' : ' (açık değil)'}`;
        const ayrinti = belge.createElement('span');
        ayrinti.textContent = e === null ? 'Emri Kurulum ekranında seçin; hazırlık o emrin kurulumuyla açılır.'
          : `${e.parcaNo} ${e.parcaAd} · ${String(e.adet)} adet · ${e.istasyon}`;
        kart.append(baslik, no, ayrinti);
        if (e !== null) {
          const durum = belge.createElement('em');
          durum.className = kurulum?.gecerli === true ? 'tamam' : '';
          durum.textContent = durumMetni;
          kart.appendChild(durum);
        }
      }
    };
    const rozetCiz = (): void => {
      const belge = w.document;
      const a = isaretler();
      const toplam = adim?.toplam;
      const kart = belge.getElementById('sheet');
      if (kart !== null && toplam !== undefined) {
        for (const el of kart.querySelectorAll('[data-i]')) {
          const on = a[adimAnahtari(Number(el.getAttribute('data-i')), toplam)] === true;
          el.classList.toggle('tmiSecildi', on);
          if (el.classList.contains('chips')) el.previousElementSibling?.classList.toggle('tmiSecildi', on);
        }
      }
      const yer = belge.querySelector('#stepInfo .step');
      if (yer !== null && adim !== null) {
        let rozet = belge.getElementById('tmiAdimRozet');
        if (rozet === null) {
          rozet = belge.createElement('span');
          rozet.id = 'tmiAdimRozet';
          rozet.textContent = '✓ seçildi';
          yer.appendChild(rozet);
        }
        rozet.hidden = a[adimAnahtari(adim.i, adim.toplam)] !== true;
      }
      dugmeCiz();
    };
    // ----- çark: "SEÇİLDİ" damgası ve en altta "Kurulum tamam" kartı -----
    // Prototipin çarkı WebGL sahnesidir ve prototip değiştirilmez: sahne her çizimden önce (Scene.onBeforeRender) buradan
    // görülür. Seçildi işaretli adımın seçili kartına (tekli adımda ortadaki, çoklu adımda işaretli kartlar) damga eklenir;
    // son adımın altına "Kurulum tamam" kartı konur. Kurulum tamamlanırken çark baştan sona bir tur döner ve bu karta iner.
    type Vektor = { x: number; y: number; z: number; set(x: number, y: number, z: number): void };
    interface Nesne3 {
      children: Nesne3[]; userData: Record<string, unknown>; visible: boolean; position: Vektor; rotation: Vektor;
      scale: { setScalar(n: number): void }; add(...o: Nesne3[]): void; updateMatrixWorld(zorla?: boolean): void;
    }
    interface Malzeme3 { opacity: number; map: { needsUpdate: boolean } | null }
    interface Uc3 {
      Group: new () => Nesne3; Mesh: new (g: unknown, m: unknown) => Nesne3; PlaneGeometry: new (g: number, y: number) => unknown;
      MeshBasicMaterial: new (o: Record<string, unknown>) => Malzeme3; CanvasTexture: new (c: HTMLCanvasElement) => { encoding: number; needsUpdate: boolean };
      Scene: { prototype: { onBeforeRender: (...a: unknown[]) => void } }; sRGBEncoding?: number;
    }
    const YAZI = '"Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
    const YESIL = '#3fae5a', TURUNCU = '#ff8a1f', SARI = '#e8c33a';
    let cark: { sahne: unknown; davul: Nesne3 } | null = null;
    let son: { pivot: Nesne3; malzeme: Malzeme3; tuval: HTMLCanvasElement; iz: string; bas: number } | null = null;
    let damgaDokusu: unknown = null;
    // Turun sonunda çark son adımın bir altına (karta) iner: 0 son adım, 1 kart.
    let kay = 0, kayHedef = 0;
    const kartMi = (o: Nesne3): boolean => typeof o.userData['row'] === 'number' && o.userData['faceM'] !== undefined;
    const satirKartlari = (pivot: Nesne3): Nesne3[] => pivot.children[0]?.children.find((c) => c.children.some(kartMi))?.children.filter(kartMi) ?? [];
    const davulBul = (sahne: Nesne3): Nesne3 | null => sahne.children.find((g) => g.children.some((p) => satirKartlari(p).length > 0)) ?? null;
    const tuvalYaz = (tuval: HTMLCanvasElement, ciz: (x: CanvasRenderingContext2D) => void): void => {
      const x = tuval.getContext('2d');
      if (x === null) return;
      x.clearRect(0, 0, tuval.width, tuval.height);
      ciz(x);
    };
    const kutu = (x: CanvasRenderingContext2D, a: number, b: number, g: number, y: number, r: number): void => {
      x.beginPath(); x.moveTo(a + r, b); x.arcTo(a + g, b, a + g, b + y, r); x.arcTo(a + g, b + y, a, b + y, r); x.arcTo(a, b + y, a, b, r); x.arcTo(a, b, a + g, b, r); x.closePath();
    };
    const doku = (T: Uc3, tuval: HTMLCanvasElement) => {
      const d = new T.CanvasTexture(tuval);
      if (T.sRGBEncoding !== undefined) d.encoding = T.sRGBEncoding;
      return d;
    };
    const damgaMalzemesi = (T: Uc3): Malzeme3 => {
      if (damgaDokusu === null) {
        const tuval = w.document.createElement('canvas');
        tuval.width = 512; tuval.height = 180;
        tuvalYaz(tuval, (x) => {
          x.strokeStyle = YESIL; x.lineWidth = 12; kutu(x, 12, 12, 488, 156, 22); x.stroke();
          x.lineWidth = 3; kutu(x, 30, 30, 452, 120, 14); x.stroke();
          x.fillStyle = YESIL; x.font = `800 84px ${YAZI}`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('✓ SEÇİLDİ', 256, 94);
        });
        damgaDokusu = doku(T, tuval);
      }
      return new T.MeshBasicMaterial({ map: damgaDokusu, transparent: true, depthWrite: false, toneMapped: false });
    };
    const sonKartIzi = (): string => {
      const liste = gerekenler(), a = isaretler();
      const secilen = liste.filter((g) => a[g.anahtar] === true).length;
      return JSON.stringify([kurulum, secilen, liste.length, secili()?.id ?? null]);
    };
    const sonKartCiz = (tuval: HTMLCanvasElement): void => {
      const liste = gerekenler(), a = isaretler();
      const secilen = liste.filter((g) => a[g.anahtar] === true).length;
      const e = secili();
      tuvalYaz(tuval, (x) => {
        const G = tuval.width, Y = tuval.height;
        const gr = x.createLinearGradient(0, 0, 0, Y); gr.addColorStop(0, '#1d2633'); gr.addColorStop(1, '#10161e');
        x.fillStyle = gr; kutu(x, 0, 0, G, Y, 30); x.fill();
        const renk = kurulum?.gecerli === true ? YESIL : kurulum !== null ? SARI : TURUNCU;
        x.strokeStyle = renk; x.lineWidth = 6; kutu(x, 3, 3, G - 6, Y - 6, 28); x.stroke();
        x.textAlign = 'center'; x.textBaseline = 'middle';
        x.fillStyle = '#93a1b2'; x.font = `600 30px ${YAZI}`;
        x.fillText(e === null ? 'Üretim emri seçilmedi' : `${operasyon(e)} · ${e.parcaNo}`, G / 2, 70);
        if (kurulum?.gecerli === true) {
          x.save(); x.translate(G / 2, Y / 2 + 10); x.rotate(-0.06);
          x.strokeStyle = YESIL; x.lineWidth = 12; kutu(x, -400, -110, 800, 220, 26); x.stroke();
          x.fillStyle = YESIL; x.font = `800 92px ${YAZI}`; x.fillText('KURULUM TAMAM', 0, -28);
          x.font = `700 40px ${YAZI}`; x.fillText(`${kurulum.kisi.ad} · ${saat(kurulum.zaman)}`, 0, 58);
          x.restore();
        } else {
          x.fillStyle = '#f4f7fa'; x.font = `800 88px ${YAZI}`; x.fillText('KURULUM TAMAM', G / 2, Y / 2 - 10);
          x.fillStyle = renk; x.font = `700 38px ${YAZI}`;
          x.fillText(kurulum !== null ? 'Seçimler değişti · yeniden onaylayın'
            : secilen === liste.length && liste.length > 0 ? 'Bütün adımlar seçildi · onaylayın' : `${String(secilen)} / ${String(liste.length)} adım seçildi`, G / 2, Y / 2 + 80);
        }
      });
    };
    const carkCiz = (T: Uc3, sahne: Nesne3): void => {
      if (cark === null) {
        const davul = davulBul(sahne);
        if (davul === null) return;
        cark = { sahne, davul };
      }
      if (cark.sahne !== sahne) return;
      const davul = cark.davul;
      const toplam = adim?.toplam ?? adimOku()?.toplam;
      if (toplam === undefined) return;
      const pivotlar = davul.children.filter((p) => satirKartlari(p).length > 0);
      let aci = Math.PI * 2 / 18, yaricap = 8;
      for (const p of pivotlar) {
        const i = satirKartlari(p)[0]?.userData['row'] as number;
        if (i > 0) { aci = p.rotation.x / i; break; }
      }
      yaricap = pivotlar[0]?.children[0]?.position.z ?? yaricap;
      const a = isaretler();
      const simdi = w.performance.now();
      for (const p of pivotlar) {
        if (!p.visible) continue;
        const kartlar = satirKartlari(p);
        const anahtar = adimAnahtari(kartlar[0]?.userData['row'] as number, toplam);
        const isaretli = a[anahtar] === true;
        const coklu = anahtar === 'gauges' || anahtar === 'cons';
        let enIyi: Nesne3 | null = null;
        if (isaretli && !coklu) {
          for (const k of kartlar) if (k.visible && (enIyi === null || (k.userData['faceM'] as Malzeme3).opacity > (enIyi.userData['faceM'] as Malzeme3).opacity)) enIyi = k;
        }
        for (const k of kartlar) {
          const secik = isaretli && (coklu ? (k.userData['badge'] as Nesne3 | undefined)?.visible === true : k === enIyi);
          let d = k.userData['tmiDamga'] as Nesne3 | undefined;
          if (!secik) { if (d !== undefined) { d.visible = false; k.userData['tmiBas'] = null; } continue; }
          if (d === undefined) {
            d = new T.Mesh(new T.PlaneGeometry(1.3, 0.46), damgaMalzemesi(T));
            d.position.set(0.42, -0.24, 0.07);
            d.rotation.z = -0.16;
            k.add(d);
            k.userData['tmiDamga'] = d;
          }
          if (typeof k.userData['tmiBas'] !== 'number') k.userData['tmiBas'] = simdi;
          const t = Math.min(1, (simdi - (k.userData['tmiBas'] as number)) / 240);
          d.visible = k.visible;
          d.scale.setScalar(1 + 0.9 * (1 - t) * (1 - t));
          (d as unknown as { material: Malzeme3 }).material.opacity = (k.userData['faceM'] as Malzeme3).opacity * (0.35 + 0.6 * t);
        }
      }
      // Son kart: son adımın altında, satırlar gibi çarkın üstünde.
      if (son === null) {
        const tuval = w.document.createElement('canvas');
        tuval.width = 1024; tuval.height = 420;
        const malzeme = new T.MeshBasicMaterial({ map: doku(T, tuval), transparent: true, toneMapped: false, depthWrite: false });
        const kart = new T.Mesh(new T.PlaneGeometry(3.6, 1.48), malzeme);
        const satir = new T.Group();
        satir.position.z = yaricap;
        satir.add(kart);
        const pivot = new T.Group();
        pivot.add(satir);
        davul.add(pivot);
        son = { pivot, malzeme, tuval, iz: '', bas: 0 };
      }
      const iz = sonKartIzi();
      if (iz !== son.iz) {
        if (kurulum?.gecerli === true && !son.iz.includes('"gecerli":true')) son.bas = simdi;
        son.iz = iz;
        sonKartCiz(son.tuval);
        if (son.malzeme.map !== null) son.malzeme.map.needsUpdate = true;
      }
      kay += (kayHedef - kay) * 0.12;
      if (Math.abs(kayHedef - kay) < 0.001) kay = kayHedef;
      davul.rotation.x -= kay * aci;
      son.pivot.rotation.x = toplam * aci;
      const konum = -davul.rotation.x / aci;
      const gorunurluk = Math.max(0, Math.min(1, 1.15 - Math.abs(toplam - konum) * 0.3));
      son.pivot.visible = gorunurluk > 0.02;
      son.malzeme.opacity = gorunurluk;
      const bt = son.bas === 0 ? 1 : Math.min(1, (simdi - son.bas) / 320);
      son.pivot.children[0]?.children[0]?.scale.setScalar(1 + 0.25 * (1 - bt) * (1 - bt));
      davul.updateMatrixWorld(true);
    };
    const carkBagla = (): void => {
      const T = (w as unknown as { THREE?: Uc3 }).THREE;
      if (T?.Scene?.prototype === undefined) return;
      const asil = T.Scene.prototype.onBeforeRender;
      T.Scene.prototype.onBeforeRender = function (this: Nesne3, ...arg: unknown[]) {
        asil.apply(this, arg);
        try { carkCiz(T, this); } catch { /* çark çizimi prototipin çizimini durdurmaz */ }
      };
    };

    // ----- "Kurulum tamam": baştan sona tur, en alttaki karta iniş ve onay -----
    let tur = false;
    let sonda = false;
    const tus = (key: string): void => { w.dispatchEvent(new w.KeyboardEvent('keydown', { key })); };
    const onayKaldir = (): void => { w.document.getElementById('tmiSonOnay')?.remove(); };
    const sondanCik = (): void => {
      if (!sonda) return;
      sonda = false;
      kayHedef = 0;
      onayKaldir();
    };
    const onayGoster = (): void => {
      const belge = w.document;
      onayKaldir();
      const kutuEl = belge.createElement('div');
      kutuEl.id = 'tmiSonOnay';
      kutuEl.setAttribute('role', 'dialog');
      kutuEl.setAttribute('aria-label', 'Kurulum tamam');
      const metin = belge.createElement('span');
      const vazgec = belge.createElement('button');
      vazgec.type = 'button';
      vazgec.className = 'hbtn';
      const onayla = belge.createElement('button');
      onayla.type = 'button';
      onayla.className = 'hbtn birincil';
      onayla.textContent = 'Onayla';
      const ciz = (): void => {
        const tamam = kurulum?.gecerli === true;
        metin.textContent = tamam && kurulum !== null ? `Kurulum tamam · ${kurulum.kisi.ad} · ${saat(kurulum.zaman)}` : `${String(gerekenler().length)} seçim kontrol edildi`;
        vazgec.textContent = tamam ? 'Kapat' : 'Vazgeç';
        onayla.hidden = tamam;
      };
      vazgec.addEventListener('click', sondanCik);
      onayla.addEventListener('click', () => {
        onayla.disabled = true;
        vazgec.disabled = true;
        void bosalt().then(() => {
          const surum = surumler.get(ayar.durumAnahtari);
          if (surum === undefined || surum === null) throw { durum: 400, message: 'Kurulum henüz kaydedilmedi; bir seçim yapıp yeniden deneyin.' } satisfies Hata;
          return istek<{ kurulum: KurulumKaydi }>('kurulum-tamam', { beklenenSurum: surum });
        }).then(
          (c) => { kurulum = c.kurulum; onayla.disabled = false; vazgec.disabled = false; ciz(); dugmeCiz(); hazirlikEmriCiz(); vazgec.focus(); },
          (h: Hata) => { onayla.disabled = false; vazgec.disabled = false; metin.textContent = h.durum === 409 ? ayar.catismaIletisi : h.message; },
        );
      });
      ciz();
      kutuEl.append(metin, vazgec, onayla);
      belge.body.appendChild(kutuEl);
      // Kutu sağ panelin değil çarkın ortasına oturur.
      const sahneAlani = belge.getElementById('stage')?.getBoundingClientRect();
      if (sahneAlani !== undefined && sahneAlani.width > 0) {
        kutuEl.style.left = `${String(sahneAlani.left + sahneAlani.width / 2)}px`;
        kutuEl.style.maxWidth = `${String(Math.max(240, sahneAlani.width - 24))}px`;
      }
      (onayla.hidden ? vazgec : onayla).focus();
    };
    const sonaGit = (): void => {
      if (tur || sonda || secili() === null) return;
      if (adim !== null) isaretle(adimAnahtari(adim.i, adim.toplam));
      dugmeCiz();
      const b = dugme;
      if (b !== null && b.disabled) return;
      tur = true;
      tus('Home');
      const toplam = adim?.toplam ?? 1;
      const aralik = Math.max(90, Math.min(240, 4200 / toplam));
      let i = 0;
      const adimla = (): void => {
        i += 1;
        if (i < toplam) { tus('ArrowDown'); w.setTimeout(adimla, aralik); return; }
        tur = false;
        sonda = true;
        kayHedef = 1;
        w.setTimeout(onayGoster, 500);
      };
      // Çark önce başa döner, sonra adım adım aşağı iner.
      w.setTimeout(adimla, 700);
    };
    // Son adımda bir aşağı (tekerlek değil: tuş, düğme) "Kurulum tamam" kartına götürür; turda kişinin girdisi beklenir.
    w.addEventListener('keydown', (olay) => {
      if (!olay.isTrusted && !(olay instanceof w.KeyboardEvent && olay.key === 'Escape')) return;
      if (w.document.body.getAttribute('data-view') !== 'setup') return;
      const t = olay.target;
      if (t instanceof w.HTMLInputElement || t instanceof w.HTMLTextAreaElement) return;
      if (tur) { olay.stopImmediatePropagation(); olay.preventDefault(); return; }
      if (sonda) {
        if (t instanceof w.Element && t.closest('#tmiSonOnay') !== null && olay.key !== 'Escape') return;
        sondanCik();
        if (olay.key === 'Escape') { olay.preventDefault(); return; }
        return;
      }
      const sonAdim = adim !== null && adim.i === adim.toplam - 1;
      if (isaretleyebilir && sonAdim && ['ArrowDown', 'Enter', 's', 'S'].includes(olay.key)) { olay.stopImmediatePropagation(); olay.preventDefault(); sonaGit(); }
    }, true);
    w.addEventListener('click', (olay) => {
      const t = olay.target instanceof w.Element ? olay.target : null;
      if (t === null) return;
      if (tur && t.closest('#stage, #side') !== null) { olay.stopImmediatePropagation(); olay.preventDefault(); return; }
      if (t.closest('#bDown') !== null && isaretleyebilir && adim !== null && adim.i === adim.toplam - 1 && !sonda) { olay.stopImmediatePropagation(); sonaGit(); }
    }, true);
    w.addEventListener('pointerdown', (olay) => {
      const t = olay.target instanceof w.Element ? olay.target : null;
      if (sonda && t !== null && t.closest('#tmiSonOnay, #tmiEmirCubugu') === null && t.closest('#stage') !== null) sondanCik();
    }, true);
    w.addEventListener('wheel', (olay) => { if (tur) { olay.stopImmediatePropagation(); olay.preventDefault(); } else if (sonda) sondanCik(); }, { capture: true, passive: false });
    const tamamDugmesi = isaretleyebilir ? (): HTMLElement => {
      const belge = w.document;
      const kap = belge.createElement('span');
      kap.style.display = 'contents';
      const kisi = belge.createElement('span');
      kisi.id = 'tmiKurulumKisi';
      const b = belge.createElement('button');
      b.type = 'button';
      b.id = 'tmiTamam';
      b.addEventListener('click', sonaGit);
      dugme = b;
      kap.append(kisi, b);
      dugmeCiz();
      return kap;
    } : null;
    kurulumDegisti = (): void => { dugmeCiz(); hazirlikEmriCiz(); };
    const adimIzle = (): void => {
      carkBagla();
      const bilgi = w.document.getElementById('stepInfo');
      if (bilgi === null) return;
      adim = adimOku();
      new w.MutationObserver(() => {
        const yeni = adimOku();
        // Kişi adımdan ayrılınca adım seçilmiş sayılır; açılıştaki kendiliğinden çizim sayılmaz.
        if (adim !== null && yeni !== null && yeni.i !== adim.i && eylemVar) isaretle(adimAnahtari(adim.i, adim.toplam));
        adim = yeni;
        rozetCiz();
      }).observe(bilgi, { childList: true, subtree: true, characterData: true });
      const kart = w.document.getElementById('sheet');
      if (kart !== null) new w.MutationObserver(rozetCiz).observe(kart, { childList: true });
      rozetCiz();
    };

    // Tek seçim yoldadır: ikinci değişiklik eskimiş sürümle giderdi.
    let seciliyor = false;
    const yerlestir = (): void => {
      const belge = w.document;
      if (belge.body === null || belge.getElementById('tmiEmirCubugu') !== null) return;
      if (belge.getElementById('tmiDuzen') === null) {
        const stil = belge.createElement('style');
        stil.id = 'tmiDuzen';
        stil.textContent = DUZEN;
        belge.head.appendChild(stil);
      }
      const satir = belge.createElement('div');
      satir.id = 'tmiEmirCubugu';
      satir.className = 'meta';
      satir.setAttribute('data-page', 'setup');
      const kutu = belge.createElement('label');
      kutu.textContent = 'Üretim emri';
      const girdi = belge.createElement('input');
      girdi.id = 'tmiEmir';
      girdi.setAttribute('list', 'tmiEmirler');
      girdi.autocomplete = 'off';
      girdi.placeholder = listeHatasi ? 'Emir listesi alınamadı' : secenekler?.length === 0 ? 'Açık üretim emri yok' : 'Emir no ya da parça no yazın';
      girdi.readOnly = !ayar.yazabilir;
      girdi.value = gorunenDeger();
      const liste = belge.createElement('datalist');
      liste.id = 'tmiEmirler';
      for (const e of secenekler ?? []) {
        const o = belge.createElement('option');
        o.value = etiket(e);
        liste.appendChild(o);
      }
      girdi.addEventListener('change', () => {
        const e = (secenekler ?? []).find((x) => etiket(x) === girdi.value.trim());
        // Listede olmayan metin, boş alan ve aynı emir seçim değildir: alan önceki seçime döner. Emirsiz kuruluma dönülmez.
        if (seciliyor) return;
        if (e === undefined || e.id === secili()?.id || durdu) { girdi.value = gorunenDeger(); return; }
        seciliyor = true;
        girdi.disabled = true;
        void bosalt().then(() => {
          // Seçimden sonra çerçeve yeniden kurulur: eski durum yeni emrin kurulumunun üstüne yazılmasın diye yazma durur.
          durdu = true;
          return istek('emir-sec', { isEmriId: e.id, beklenenSurum: surumler.get(ayar.durumAnahtari) ?? null });
        }).then(
          () => { girdi.value = `${etiket(e)} · açılıyor`; },
          (h: Hata) => {
            seciliyor = false;
            girdi.disabled = false;
            girdi.value = gorunenDeger();
            if (h.durum === 409) { w.alert(ayar.catismaIletisi); return; }
            durdu = false;
            w.alert(h.message);
          },
        );
      });
      kutu.appendChild(girdi);
      kutu.appendChild(liste);
      satir.appendChild(kutu);
      if (tamamDugmesi !== null) satir.appendChild(tamamDugmesi());
      belge.body.appendChild(satir);
    };
    const izle = (): void => { yerlestir(); adimIzle(); hazirlikEmriCiz(); };
    const yenidenKur = (): void => { w.document.getElementById('tmiEmirCubugu')?.remove(); yerlestir(); hazirlikEmriCiz(); };
    istek<{ emirler: EmirSecenegi[] }>('emirler', {}).then(
      (c) => { secenekler = c.emirler; yenidenKur(); },
      () => { secenekler = []; listeHatasi = true; yenidenKur(); },
    );
    if (w.document.readyState === 'complete') izle();
    else w.addEventListener('load', izle, { once: true });
  }

  // ----- hazırlık onay kaydı ve salt onay -----
  // Prototip kimin ne zaman onayladığını göstermez: sunucunun defterinden, prototipte hâlâ geçerli olan (imzası tutan) onaylar
  // Hazırlık panelinin sonunda listelenir. Panel her adımda yeniden çizilir; liste çizimden sonra yeniden eklenir.
  if (!ayar.toplu) {
    type Onay = { adim: string; olay: string; imza: string | null; kisi: { ad: string }; zaman: string };
    let onaylar: Onay[] = [];
    const ADLAR: Record<string, string> = {
      machine: 'Tezgâh', prog: 'Program', fixture: 'Bağlama', jaw: 'Çene', material: 'Ham malzeme', zero: 'Sıfır noktası',
      mag: 'Magazin', cool: 'Soğutma', gauges: 'Ölçüm', cons: 'Sarf', final: 'Hazırlık tamamlandı',
    };
    const adimAdi = (adim: string): string => ADLAR[adim] ?? (/^T\d+$/.test(adim) ? `Takım ${adim}` : adim);
    const gecerliOnaylar = (): Onay[] => {
      let hazirlik: { done?: Record<string, unknown>; fin?: { sig?: unknown } | null } = {};
      try { hazirlik = (JSON.parse(degerler[ayar.durumAnahtari] ?? '{}') as { prep?: typeof hazirlik }).prep ?? {}; } catch { /* durum yoksa onay da yok */ }
      return onaylar.filter((o) => (o.olay === 'tamam' ? hazirlik.fin?.sig === o.imza : hazirlik.done?.[o.adim] === o.imza));
    };
    const kayitCiz = (): void => {
      const belge = w.document;
      const panel = belge.getElementById('prPanel');
      if (panel === null) return;
      belge.getElementById('tmiOnaylar')?.remove();
      const liste = gecerliOnaylar();
      const kutu = belge.createElement('div');
      kutu.id = 'tmiOnaylar';
      const baslik = belge.createElement('div');
      baslik.className = 'sh';
      baslik.textContent = 'Onay kaydı';
      kutu.appendChild(baslik);
      const satir = (sol: string, sag: string): void => {
        const s2 = belge.createElement('div');
        s2.className = 'srow';
        const a = belge.createElement('span');
        a.textContent = sol;
        const b = belge.createElement('b');
        b.textContent = sag;
        s2.append(a, b);
        kutu.appendChild(s2);
      };
      if (ayar.emirAnahtari !== undefined && has(ayar.emirAnahtari)) {
        try {
          const e = JSON.parse(degerler[ayar.emirAnahtari] ?? 'null') as { emirNo?: unknown; parcaNo?: unknown } | null;
          if (e !== null && typeof e.emirNo === 'string') satir('Üretim emri', `${e.emirNo}${typeof e.parcaNo === 'string' ? ` · ${e.parcaNo}` : ''}`);
        } catch { /* seçim okunamazsa satır yok */ }
      }
      if (kurulum !== null) satir('Kurulum tamam', `${kurulum.kisi.ad} · ${saat(kurulum.zaman)}${kurulum.gecerli ? '' : ' (seçimler değişti)'}`);
      if (liste.length === 0) satir('Onaylanan adım', 'yok');
      for (const o of liste) satir(adimAdi(o.adim), `${o.kisi.ad} · ${saat(o.zaman)}`);
      panel.appendChild(kutu);
    };
    let istekte = false;
    const kayitAl = (): void => {
      if (istekte) return;
      istekte = true;
      istek<{ onaylar: Onay[]; kurulum?: KurulumKaydi | null }>('hazirlik', {}).then(
        (c) => { onaylar = c.onaylar; kurulum = c.kurulum ?? null; kurulumDegisti?.(); },
        () => { /* kayıt alınamazsa liste boş kalır */ },
      ).finally(() => { istekte = false; kayitCiz(); });
    };
    yazildi = (anahtar) => { if (anahtar === ayar.durumAnahtari) kayitAl(); };
    const izle = (): void => {
      const panel = w.document.getElementById('prPanel');
      if (panel === null) return;
      new w.MutationObserver(() => {
        if (w.document.getElementById('tmiOnaylar') === null) kayitCiz();
        if (ayar.saltOnay) for (const g of panel.querySelectorAll('input, select, textarea')) (g as HTMLInputElement).disabled = true;
      }).observe(panel, { childList: true });
      kayitAl();
    };
    // Hazırlık seçili emrin kurulumudur (kullanıcı isteği 17.10.2026): seçim Kurulum'da yapılır, Hazırlık'ta yalnız onaylanır.
    // Hazırlık'ta seçimi değiştiren her eylem (kart, kaydırma, ok tuşları, alanlar, dosya) durdurulur; kurulumda olmayan
    // program adımı (ikinci adım) serbesttir. "Yeni hazırlık" (onayları sıfırlayıp baştan başlama) yoktur. Yalnız hazırlık
    // onayı olan kişide program adımı da kilitlidir ve sayfa Hazırlık görünümünde açılır.
    const IZINLI = new Set(['ok', 'prev', 'next', 'print', 'toTrial']);
    const SECIM_TUSLARI = new Set(['ArrowLeft', 'ArrowRight', 'a', 'A', 'd', 'D', ' ', 'Home', 'End']);
    const durdur = (olay: Event): void => { olay.stopImmediatePropagation(); olay.preventDefault(); };
    const hedef = (olay: Event): Element | null => (olay.target instanceof w.Element ? olay.target : null);
    const hazirlikta = (): boolean => w.document.body.getAttribute('data-view') === 'prep';
    const programAdimi = (): boolean => /ADIM 2 \//.test(w.document.getElementById('prStepNo')?.textContent ?? '');
    const kilitli = (): boolean => hazirlikta() && (ayar.saltOnay === true || !programAdimi());
    w.addEventListener('click', (olay) => {
      const t = hedef(olay);
      if (t === null) return;
      const pa = t.closest('[data-pa]')?.getAttribute('data-pa') ?? null;
      if (pa === 'reset' || (ayar.saltOnay === true && pa !== null && !IZINLI.has(pa))) { durdur(olay); return; }
      if (kilitli() && t.closest('#prCarWrap .pcard, #prCarWrap [data-pc], #prPanel [data-rm], #prPanel [data-sug], #prPanel [data-cat]') !== null) durdur(olay);
    }, true);
    w.addEventListener('keydown', (olay) => {
      const t = hedef(olay);
      if (kilitli() && SECIM_TUSLARI.has(olay.key) && !(t instanceof w.HTMLInputElement || t instanceof w.HTMLTextAreaElement)) durdur(olay);
    }, true);
    w.addEventListener('wheel', (olay) => {
      const t = hedef(olay);
      if (kilitli() && (t?.closest('#prCarWrap') || Math.abs(olay.deltaX) > Math.abs(olay.deltaY) || olay.shiftKey)) durdur(olay);
    }, { capture: true, passive: false });
    w.addEventListener('pointerdown', (olay) => { if (kilitli() && hedef(olay)?.closest('#prCarWrap')) olay.stopImmediatePropagation(); }, true);
    for (const tur of ['change', 'input']) {
      w.addEventListener(tur, (olay) => { if (kilitli() && hedef(olay)?.closest('#prPanel, #prFile')) durdur(olay); }, true);
    }
    w.addEventListener('drop', (olay) => { if (ayar.saltOnay === true || kilitli()) durdur(olay); }, true);
    const kur = (): void => {
      const belge = w.document;
      const stil = belge.createElement('style');
      stil.textContent = '#prPanel [data-pa="reset"] { display: none !important; } body.tmiSecimKilitli #prCarWrap [data-pc] { display: none !important; }'
        // Kurulumda seçilmeyen seçenekler gösterilmez; yalnız emrin kurulumu kalır.
        + ' body.tmiSecimKilitli #prCarWrap .pcard:not(.on):not(.chk) { visibility: hidden !important; }'
        + (ayar.saltOnay === true ? ' .views button:not([data-view="prep"]), header .hbtns > * { display: none !important; }' : '');
      belge.head.appendChild(stil);
      // Okları gizleyen sınıf adımla değişir (program adımında seçim açıktır).
      const ipucu = (): void => {
        const alt = belge.getElementById('prSub');
        if (alt !== null && kilitli() && alt.textContent?.includes('◀ ▶ seç · ')) alt.textContent = alt.textContent.replace('◀ ▶ seç · ', '');
      };
      const sinifla = (): void => { belge.body.classList.toggle('tmiSecimKilitli', kilitli()); ipucu(); };
      const alt = belge.getElementById('prSub');
      if (alt !== null) new w.MutationObserver(ipucu).observe(alt, { childList: true, characterData: true, subtree: true });
      const no = belge.getElementById('prStepNo');
      if (no !== null) new w.MutationObserver(sinifla).observe(no, { childList: true, characterData: true, subtree: true });
      new w.MutationObserver(sinifla).observe(belge.body, { attributes: true, attributeFilter: ['data-view'] });
      sinifla();
      const acilis = ayar.saltOnay === true ? 'prep' : ayar.acilisGorunumu;
      if (acilis !== undefined && belge.body.getAttribute('data-view') !== acilis) {
        belge.querySelector<HTMLElement>(`.views button[data-view="${acilis}"]`)?.click();
      }
    };
    if (w.document.readyState === 'complete') kur();
    else w.addEventListener('load', kur, { once: true });
    if (w.document.readyState === 'complete') izle();
    else w.addEventListener('load', izle, { once: true });
  }

  // ----- üst çubuk -----
  // Prototipin üst çubuğu dar çerçevede (1280 ekranda çerçeve ~1080 px) sığmaz, düğmeler çubuğun dışına taşar. Sığmadığında
  // düğmeler "Diğer" menüsünde toplanır; çubuk her boyut ve görünüm değişiminde yeniden ölçülür.
  if (!ayar.toplu) {
    const ustCubuk = (): void => {
      const belge = w.document;
      const ust = belge.querySelector('header');
      const dugmeler = ust?.querySelector<HTMLElement>('.hbtns');
      if (ust === null || ust === undefined || dugmeler === null || dugmeler === undefined || belge.getElementById('tmiMenu') !== null) return;
      const stil = belge.createElement('style');
      stil.textContent = '#tmiMenu{display:none;flex:none}'
        + ' body.tmiDarCubuk #tmiMenu{display:inline-flex;align-items:center;gap:6px;margin-left:auto}'
        + ' body.tmiDarCubuk header .hbtns{display:none!important}'
        + ' body.tmiDarCubuk.tmiMenuAcik header .hbtns{display:flex!important;position:fixed;top:56px;right:10px;margin:0;flex-direction:column;'
        + 'align-items:stretch;gap:6px;padding:8px;background:var(--panel);border:1px solid var(--line);border-radius:10px;'
        + 'box-shadow:0 10px 28px rgba(0,0,0,.45);z-index:8}'
        + ' body.tmiDarCubuk.tmiMenuAcik header .hbtns .hbtn{text-align:left}';
      belge.head.appendChild(stil);
      const menu = belge.createElement('button');
      menu.type = 'button';
      menu.id = 'tmiMenu';
      menu.className = 'hbtn';
      menu.textContent = '⋯ Diğer';
      menu.title = 'Diğer işlemler';
      menu.setAttribute('aria-haspopup', 'true');
      menu.setAttribute('aria-expanded', 'false');
      ust.insertBefore(menu, dugmeler);
      const ac = (acik: boolean): void => {
        belge.body.classList.toggle('tmiMenuAcik', acik);
        menu.setAttribute('aria-expanded', String(acik));
      };
      const gorunenVar = (): boolean => [...dugmeler.children].some((d) => d instanceof w.HTMLElement && w.getComputedStyle(d).display !== 'none');
      const olc = (): void => {
        const acik = belge.body.classList.contains('tmiMenuAcik');
        belge.body.classList.remove('tmiDarCubuk', 'tmiMenuAcik');
        const r = dugmeler.getBoundingClientRect();
        const u = ust.getBoundingClientRect();
        const tasiyor = ust.scrollWidth > ust.clientWidth + 1 || r.right > u.right + 1 || r.top < u.top - 1 || r.bottom > u.bottom + 1;
        belge.body.classList.toggle('tmiDarCubuk', tasiyor && gorunenVar());
        if (tasiyor) ac(acik);
        else menu.setAttribute('aria-expanded', 'false');
      };
      menu.addEventListener('click', (olay) => { olay.stopPropagation(); ac(!belge.body.classList.contains('tmiMenuAcik')); });
      // Menüden bir işlem seçilince ya da dışarı tıklanınca menü kapanır.
      belge.addEventListener('click', (olay) => {
        if (!belge.body.classList.contains('tmiMenuAcik') || olay.target === menu) return;
        ac(false);
      });
      belge.addEventListener('keydown', (olay) => { if (olay.key === 'Escape') ac(false); });
      w.addEventListener('resize', olc);
      new w.MutationObserver(olc).observe(belge.body, { attributes: true, attributeFilter: ['data-view'] });
      olc();
    };
    if (w.document.readyState === 'complete') ustCubuk();
    else w.addEventListener('load', ustCubuk, { once: true });
  }

  // ----- 3B model aktarımı -----
  // Düğme prototipin üst çubuğundaki düğmelerin sonuna (sağ üst köşe) konur ve onların görünümünü alır. Basınca kabuk toplu
  // aktarım sayfasını açar (kart #1238): orada bütün tezgâhlar listelenir, prototipte seçili olan işaretli gelir; tek düğmeyle
  // yalnız seçili makine gidiyordu ve seçim gizli bir sekmedeydi. Model prototipin kendi kütüphanesiyle (CNC3D, CNCDATA;
  // prototip betiği koşunca genel adlardır) toplu sayfanın görünmez çerçevesinde üretilir, kabuk Çizimlere yükler.
  if (!ayar.aktarabilir) return;
  type Makine = { id?: unknown; no?: unknown; name?: unknown; kind?: unknown };
  const durum = (): { machine?: unknown; customMachines?: unknown; mo?: unknown } => {
    try { return JSON.parse(degerler[ayar.durumAnahtari] ?? '{}') as { machine?: unknown; customMachines?: unknown; mo?: unknown }; } catch { return {}; }
  };
  // Prototipin makineleri, elle eklenenler ve elle yapılan düzeltmeler dahil.
  const makineler = (): Makine[] => {
    const d = durum();
    const veri = (w as unknown as { CNCDATA?: { MACHINES?: Makine[] } }).CNCDATA;
    const liste = [...(veri?.MACHINES ?? []), ...(Array.isArray(d.customMachines) ? d.customMachines as Makine[] : [])];
    const mo = d.mo !== null && typeof d.mo === 'object' ? d.mo as Record<string, Makine | undefined> : {};
    return liste.map((m) => ({ ...m, ...(mo[String(m.id)] ?? {}) }));
  };
  const makineBul = (id: string): Makine | null => makineler().find((x) => String(x.id) === id) ?? null;
  const seciliMakine = (): Makine | null => {
    const secili = durum().machine;
    return makineler().find((x) => x.id === secili) ?? null;
  };
  const ozet = (m: Makine): MakineOzeti => ({
    makineId: String(m.id),
    no: typeof m.no === 'string' && m.no !== '' ? m.no : null,
    ad: typeof m.name === 'string' && m.name !== '' ? m.name : String(m.id),
  });
  const modelUret = (id: string): Promise<unknown> => {
    let ileti: ModelIletisi;
    try {
      const m = makineBul(id);
      const kutuphane = (w as unknown as { CNC3D?: { build(it: unknown): unknown; dispose(o: unknown): void } }).CNC3D;
      if (!m || !kutuphane || typeof m.kind !== 'string') throw new Error('Makine modeli bulunamadı.');
      const o = ozet(m);
      const kok = kutuphane.build({ kind: m.kind });
      ileti = { ...o, glb: glb(kok as never, o.ad) };
      kutuphane.dispose(kok);
    } catch (e) {
      return istek('model-hatasi', { ileti: e instanceof Error ? e.message : 'Model üretilemedi.', makineId: id });
    }
    return istek('model-aktar', ileti as unknown as Nesne);
  };
  if (ayar.toplu) {
    // Kabuk istediği makineyi komutla ister; yanıt beklenmez, sonuç model-aktar ya da model-hatasi isteğiyle döner.
    w.addEventListener('message', (olay: MessageEvent) => {
      if (olay.source !== ust) return;
      const m = olay.data as { kanal?: unknown; yon?: unknown; tip?: unknown; makineId?: unknown } | null;
      if (m === null || typeof m !== 'object' || m.kanal !== ayar.kanal || m.yon !== 'komut' || m.tip !== 'model-uret' || typeof m.makineId !== 'string') return;
      modelUret(m.makineId).catch(() => { /* kabuk sonucu kendi bildirir */ });
    });
    const listeYolla = (): void => { istek('makine-listesi', { makineler: makineler().map(ozet) as unknown as Nesne[] }).catch(() => { /* kabuk listeyi kendisi bekler */ }); };
    if (w.document.readyState === 'complete') listeYolla();
    else w.addEventListener('load', listeYolla, { once: true });
    return;
  }
  const basla = (): void => {
    const belge = w.document;
    const dugme = belge.createElement('button');
    dugme.type = 'button';
    dugme.className = 'hbtn';
    dugme.id = 'tmiAktar';
    // Yalnız simge taşır: yazılı düğmelerin yan boşluğu gerekmez (dar ekranda üst çubuğa sığması için).
    dugme.style.paddingInline = '9px';
    const svg = belge.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const nitelikler: [string, string][] = [['viewBox', '0 0 24 24'], ['width', '14'], ['height', '14'], ['fill', 'none'],
      ['stroke', 'currentColor'], ['stroke-width', '2'], ['stroke-linecap', 'round'], ['stroke-linejoin', 'round'], ['aria-hidden', 'true']];
    for (const [k, v] of nitelikler) svg.setAttribute(k, v);
    const yol = belge.createElementNS('http://www.w3.org/2000/svg', 'path');
    yol.setAttribute('d', ayar.aktarimSimgesi);
    svg.appendChild(yol);
    dugme.appendChild(svg);
    const ipucu = (): void => {
      const m = seciliMakine();
      const o = m ? ozet(m) : null;
      const metin = o === null ? 'Çizim Merkezi\'ne aktar: tezgâhları seçin' : `Çizim Merkezi'ne aktar: tezgâhları seçin (${o.no === null ? '' : `${o.no} · `}${o.ad} işaretli gelir)`;
      dugme.title = metin;
      dugme.setAttribute('aria-label', metin);
    };
    dugme.addEventListener('click', () => {
      const m = seciliMakine();
      istek('toplu-ac', m ? { makineId: String(m.id) } : {}).catch(() => { /* kabuk açamazsa sayfa yerinde kalır */ });
    });
    ipucu();
    durumDegisti = ipucu;
    const cubuk = belge.querySelector<HTMLElement>('header .hbtns');
    if (cubuk === null) { belge.body.appendChild(dugme); return; }
    // Sabit yükseklikli başlıkta ikinci düğmeye dar ekranda yer kalmaz: düğmeler alt satıra kayıp başlıktan taşar. Düğmeler
    // tek satırda kalır, yer sekme şeridinden açılır (şerit dar ekranda zaten yatay kayar).
    cubuk.style.flexWrap = 'nowrap';
    cubuk.style.flexShrink = '0';
    const serit = belge.querySelector<HTMLElement>('header .views');
    if (serit !== null) { serit.style.flex = '0 1 auto'; serit.style.minWidth = '0'; serit.style.overflowX = 'auto'; }
    cubuk.appendChild(dugme);
  };
  // Prototipin betikleri köprüden sonra koşar: kütüphane ve üst çubuk sayfa yüklenince hazırdır, düğme de o zaman konur.
  if (w.document.readyState === 'complete') basla();
  else w.addEventListener('load', basla, { once: true });
}

// Sayfaya gömülecek betik: fonksiyon metni ve ayar JSON'u. `<` ve satır ayırıcılar kaçırılır ki kayıt metni betiği kapatamasın.
export function cerceveBetigi(ayar: CerceveAyari): string {
  const json = JSON.stringify(ayar).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
  const kac = (f: { toString(): string }): string => f.toString().replace(/<\/script/gi, '<\\/script');
  return `<script>(${kac(cerceveKoprusu)})(window, ${json}, ${kac(glbYaz)});</script>`;
}
