import { useLayoutEffect, useMemo, useRef } from 'react';

// Betik her zaman açıktır. Aynı köken (`allow-same-origin`) ve üst gezinme (`allow-top-navigation*`) tipte bilerek
// yok: ikisinden biri verilirse çerçevedeki kod uygulamanın oturumuna ve sayfasına ulaşır, yalıtım kalmaz.
export type YalitimIzni = 'allow-downloads' | 'allow-forms' | 'allow-modals';
export type CerceveYetenegi = 'camera' | 'clipboard-write';

// Çerçevenin kökeni opaktır; tarayıcı iletinin kökenini "null" yazar.
const OPAK_KOKEN = 'null';

// Form izni yalnız `submit` olayını açar (ekran olayı kendisi işleyip veriyi köprüyle yollar); gönderimin kendisi bu
// politikayla her adrese kapalıdır. Politikayı modül değil bu bileşen koyar ve ilk sıraya koyar: tarayıcı birden çok
// politikanın hepsini uygular, sonradan gelen daha gevşek bir politika bunu açamaz.
const FORM_POLITIKASI = `<meta http-equiv="Content-Security-Policy" content="form-action 'none'">`;
// Belge türü bildiriminin hemen ardı: öncesine konan öğe belgeyi uyumluluk kipine düşürür. Yer belgenin başına
// sabitlenir; sayfanın içinde (yorumda, metinde) geçen bir etiket politikanın yerini kaydıramaz. Ayrıştırıcı bu
// noktadaki öğeyi `<head>`'e koyar.
const BELGE_TURU = /^\uFEFF?\s*<!doctype html[^>]*>/i;

// Belge türü bildiriminin ardına ekler; bildirim yoksa sayfa değişmez.
function turunArdina(sayfa: string, ek: string): string | null {
  const tur = BELGE_TURU.exec(sayfa);
  if (tur === null) return null;
  const son = tur[0].length;
  return `${sayfa.slice(0, son)}${ek}${sayfa.slice(son)}`;
}

// Belgenin başında bildirim yoksa politikanın güvenilir yeri yoktur; o sayfaya form izni verilmez.
function formIzni(sayfa: string, izinler: readonly YalitimIzni[]): { sayfa: string; izinler: readonly YalitimIzni[] } {
  if (!izinler.includes('allow-forms')) return { sayfa, izinler };
  const politikali = turunArdina(sayfa, FORM_POLITIKASI);
  return politikali === null ? { sayfa, izinler: izinler.filter((i) => i !== 'allow-forms') } : { sayfa: politikali, izinler };
}

// Prototip değişkeni -> kabuğun tasarım değişkeni ya da prototipin kendi değişkenlerinden karışım. Opak kökendeki çerçeve
// kabuğun değişkenlerini okuyamaz; değer açılışta kabuktan okunup yazılır (tema yalnız açılışta geçer).
export type TemaEslemesi = Readonly<Record<`--${string}`, `--${string}` | `color-mix(${string})`>>;
const DEGISKEN = /^--[a-z][a-z0-9-]*$/;
const KARISIM = /^color-mix\(in srgb, var\(--[a-z][a-z0-9-]*\) \d{1,3}%, var\(--[a-z][a-z0-9-]*\)\)$/;
// Okunan değer stilin dışına taşamasın: kural ya da öğe kapatan işaret taşıyan değer yazılmaz.
const GUVENSIZ = /[<>{};\\]/;

// Prototipin kendi tanımları sonra gelse ve tema seçicisi daha belirgin olsa da eşlenen değer geçer (!important).
export function temaStili(esleme: TemaEslemesi, oku: (ad: string) => string): string {
  const satirlar: string[] = [];
  for (const [ad, kaynak] of Object.entries(esleme)) {
    if (!DEGISKEN.test(ad) || !(DEGISKEN.test(kaynak) || KARISIM.test(kaynak))) throw new TypeError(`Geçersiz tema eşlemesi: ${ad} -> ${kaynak}`);
    const deger = DEGISKEN.test(kaynak) ? oku(kaynak).trim() : kaynak;
    if (deger === '' || GUVENSIZ.test(deger)) continue;
    satirlar.push(`${ad}:${deger}!important`);
  }
  return satirlar.length === 0 ? '' : `<style>:root{${satirlar.join(';')}}</style>`;
}

function temaEkle(sayfa: string, esleme: TemaEslemesi | undefined): string {
  if (esleme === undefined) return sayfa;
  const kok = getComputedStyle(document.documentElement);
  const stil = temaStili(esleme, (ad) => kok.getPropertyValue(ad));
  return stil === '' ? sayfa : (turunArdina(sayfa, stil) ?? sayfa);
}

interface Ozellikler {
  baslik: string;
  // Çerçeve penceresinin adı (`window.name`); içerideki sayfa gömülü olduğunu buradan anlayabilir.
  ad?: string;
  // Ölçüyü ve yerleşimi veren sınıf; çağıranın stil dosyasındadır.
  sinif?: string;
  // Çerçevenin belgesi. Opak kökende `localStorage` kullanan sayfanın başına `yalitimOnBetigi()` konur.
  sayfa: string;
  izinler?: readonly YalitimIzni[];
  yetenekler?: readonly CerceveYetenegi[];
  // Yalnız bu çerçevenin penceresinden gelen ileti; `yanitla` iletiyi gönderen pencereye yollar.
  iletiGeldi?: (veri: unknown, yanitla: (ileti: unknown) => void) => void;
  // Prototipin renklerini kabuğun tasarım değişkenlerine bağlar; belge türü bildirimi olmayan sayfada uygulanmaz.
  temaEslemesi?: TemaEslemesi;
}

// Güvenilmeyen ya da dışarıdan alınmış ekranı uygulamadan ayırır: çerçevedeki kod uygulamanın oturum çerezine,
// sayfasına ve deposuna erişemez, üst pencereyi başka adrese götüremez. Tek kapı `iletiGeldi`dir: ne geçeceğine
// çağıran karar verir, o yüzden işleyici yalnız kendi sabit istek listesini tanımalıdır.
export function YalitilmisCerceve({ baslik, ad, sinif, sayfa, izinler = [], yetenekler = [], iletiGeldi, temaEslemesi }: Ozellikler) {
  // Sayfa büyük olabilir (gömülü kitaplık); izin dizisi her çizimde yeni olduğundan metniyle karşılaştırılır.
  const izinMetni = izinler.join(' ');
  const eslemeMetni = JSON.stringify(temaEslemesi ?? null);
  // Önce tema, sonra form politikası: politika belge türünün hemen ardında, ilk sırada kalır.
  const belge = useMemo(() => formIzni(temaEkle(sayfa, temaEslemesi), izinler), [sayfa, izinMetni, eslemeMetni]);
  const cerceve = useRef<HTMLIFrameElement>(null);
  const isleyici = useRef(iletiGeldi);
  isleyici.current = iletiGeldi;

  // Çizimle aynı anda dinlenir: çerçevedeki sayfanın açılışta yolladığı ilk ileti kaçmaz.
  useLayoutEffect(() => {
    const dinle = (olay: MessageEvent) => {
      const pencere = cerceve.current?.contentWindow;
      // Kaynak: aynı biçimli iletiyi başka pencere yollayamaz. Köken: çerçeve gerçekten yalıtılmışsa "null"dur;
      // kısıtlama düşerse köprü de kapanır.
      if (!pencere || olay.source !== pencere || olay.origin !== OPAK_KOKEN) return;
      // Opak kökene adresle gönderilemez: hedef '*' olur, alıcıyı kaynak pencere belirler.
      isleyici.current?.(olay.data, (ileti) => { pencere.postMessage(ileti, '*'); });
    };
    window.addEventListener('message', dinle);
    return () => { window.removeEventListener('message', dinle); };
  }, []);

  return (
    <iframe
      ref={cerceve}
      name={ad}
      title={baslik}
      className={sinif}
      srcDoc={belge.sayfa}
      sandbox={['allow-scripts', ...belge.izinler].join(' ')}
      allow={yetenekler.length === 0 ? undefined : yetenekler.join('; ')}
    />
  );
}
