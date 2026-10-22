import { useContext, useEffect, useId, useMemo, useRef, useState, type RefObject } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { SAYFALAR } from '#paylasilan/sayfalar.ts';
import { CERCEVE_KANALI, kabukKoprusuKur, type CerceveKomutu, type KabukKoprusu } from './cerceve-iletisi.ts';
import { useCerceveSayacYazici } from './cerceve-sayaclari.ts';
import { IKINCI_MENU_TANIMLARI, etkinMadde, menuMaddeleri, type IkinciMenu } from './ikinci-menu.ts';
import { useEkranGorunur } from './kalici.tsx';
import { PaletSorgusuBaglami, cerceveKomutlarindan, useSayfaKomutlari } from './sayfa-komutlari.ts';

const KOMUTSUZ: readonly CerceveKomutu[] = [];

// Yazım durunca palet metni bu kadar beklenip çerçeveye sorulur (kural 8): her harf ayrı soru olmasın.
export const KOMUT_METNI_BEKLEME_MS = 150;

interface CerceveKomutYazicilari {
  komutlar: (komutlar: readonly CerceveKomutu[]) => void;
  komutOnerileri: (komutlar: readonly CerceveKomutu[]) => void;
}

// Çerçevenin bildirdiği komutlar (kural 7) ve yazılana önerdikleri (kural 8) paletin "Bu sayfa" grubuna gider; seçilen
// komut köprüyle çerçeveye döner. Kaynak adı bileşene özgüdür: aynı modülde iki çerçeve birbirinin listesini silmez.
// Çerçeve kalkınca ya da ekran gizlenince liste kabukta silinir. Metin yalnız komut listesi bildirmiş çerçeveye sorulur:
// komutu olmayan modül her harfte ileti almaz.
function useCerceveKomutlari(kok: string, kopru: { current: KabukKoprusu | null }): CerceveKomutYazicilari {
  const [liste, listeYaz] = useState<readonly CerceveKomutu[]>(KOMUTSUZ);
  const [oneriler, onerileriYaz] = useState<readonly CerceveKomutu[]>(KOMUTSUZ);
  const kaynak = `${kok}#${useId()}`;
  const gorunur = useEkranGorunur();
  const paletSorgusu = useContext(PaletSorgusuBaglami);
  const calistir = useMemo(() => (anahtar: string) => { kopru.current?.komutCalistir(anahtar); }, [kopru]);
  const komutlar = useMemo(() => cerceveKomutlarindan(liste, calistir), [liste, calistir]);
  const oneriKomutlari = useMemo(() => cerceveKomutlarindan(oneriler, calistir, true), [oneriler, calistir]);
  useSayfaKomutlari(kaynak, komutlar);
  useSayfaKomutlari(`${kaynak}#oneri`, oneriKomutlari);

  const komutuVar = liste.length > 0;
  useEffect(() => {
    if (paletSorgusu === null || !gorunur || !komutuVar) {
      onerileriYaz(KOMUTSUZ);
      return undefined;
    }
    let zamanlayici: ReturnType<typeof setTimeout> | undefined;
    const sor = (sorgu: string | null) => {
      clearTimeout(zamanlayici);
      // Yeni metin eski önerileri geçersiz kılar: başka metnin önerisi Enter'la çalışmasın.
      onerileriYaz(KOMUTSUZ);
      kopru.current?.komutMetni('');
      if (sorgu === null || sorgu.trim() === '') return;
      zamanlayici = setTimeout(() => { kopru.current?.komutMetni(sorgu); }, KOMUT_METNI_BEKLEME_MS);
    };
    sor(paletSorgusu.deger());
    const birak = paletSorgusu.dinle(sor);
    return () => { birak(); clearTimeout(zamanlayici); kopru.current?.komutMetni(''); };
  }, [paletSorgusu, gorunur, komutuVar, kopru]);

  return useMemo(() => ({ komutlar: listeYaz, komutOnerileri: onerileriYaz }), []);
}

// Yalıtılmış çerçevenin kökeni; tarayıcı iletinin kökenini "null" yazar.
const OPAK_KOKEN = 'null';

// Çerçeve kabuğu yalnız kayıtlı bir sayfaya ya da onun altına götürebilir (kural 6); sayfanın kendi yetki denetimi
// orada yine çalışır. Önek sınırı `/` ya da `?`: `/malzemelerx` `/malzemeler`in altı değildir.
const SAYFA_YOLLARI = SAYFALAR.map((s) => s.yol);
export function sahibinSayfasiMi(yol: string, sayfaYollari: readonly string[] = SAYFA_YOLLARI): boolean {
  return sayfaYollari.some((s) => yol === s || yol.startsWith(`${s}/`) || yol.startsWith(`${s}?`));
}

interface Ayar {
  cerceve: RefObject<HTMLIFrameElement>;
  // Modülün ikinci menüsünün kök yolu; görünüm adları o menünün madde anahtarlarıdır.
  kok: string;
  // Çerçevenin kökeni; verilmezse uygulamanın kökeni (aynı kökenden sunulan ve srcDoc çerçeve).
  koken?: string;
  // Testin kendi menüsünü verebilmesi için.
  menuler?: readonly IkinciMenu[];
}

// Çerçeveli modülün bağlaması: adres tek kaynaktır. İkinci menüde tıklanan madde adresi değiştirir, adresteki
// maddenin anahtarı çerçeveye gider; kullanıcı çerçevenin içinde görünüm değiştirirse adres o maddenin yoluna
// çekilir (geçmişe ikinci satır yazılmaz). Dönen değer adresteki görünümdür; menüde olmayan adreste null.
export function useCerceveGorunumu({ cerceve, kok, koken, menuler = IKINCI_MENU_TANIMLARI }: Ayar): string | null {
  const konum = useLocation();
  const gezin = useNavigate();
  const menu = menuler.find((m) => m.kok === kok);
  const maddeler = menu === undefined ? [] : menuMaddeleri(menu);
  const gorunum = etkinMadde(maddeler, konum.pathname)?.anahtar ?? null;
  const kopru = useRef<KabukKoprusu | null>(null);
  const guncel = useRef({ maddeler, gezin });
  guncel.current = { maddeler, gezin };
  const sayaclar = useCerceveSayacYazici(kok);
  const { komutlar, komutOnerileri } = useCerceveKomutlari(kok, kopru);

  useEffect(() => {
    const k = kabukKoprusuKur({
      cerceve: () => cerceve.current?.contentWindow,
      koken: koken ?? window.location.origin,
      sayaclar,
      komutlar,
      komutOnerileri,
      sahibeGit: (yol) => { if (sahibinSayfasiMi(yol)) void guncel.current.gezin(yol); },
      gorunumDegisti: (yeni) => {
        // Menüde olmayan görünüm adı adresi değiştirmez ve köprüde kabul edilmiş sayılmaz.
        const madde = guncel.current.maddeler.find((m) => m.anahtar === yeni);
        if (madde === undefined) return false;
        void guncel.current.gezin(madde.yol, { replace: true });
        return true;
      },
    });
    kopru.current = k;
    return () => { k.kapat(); kopru.current = null; komutlar(KOMUTSUZ); komutOnerileri(KOMUTSUZ); };
  }, [cerceve, koken, sayaclar, komutlar, komutOnerileri]);

  // Her gezinmede (aynı maddeye yeniden tıklamak dahil) sorulur; köprü aynı görünümü yalnız çerçeve sapmışsa yeniden gönderir.
  useEffect(() => {
    if (gorunum !== null) kopru.current?.gorunumGonder(gorunum);
  }, [gorunum, konum.key, cerceve, koken]);

  return gorunum;
}

type Yanitla = (ileti: unknown) => void;

// Yalıtılmış çerçevenin (YalitilmisCerceve) kökeni opaktır ve penceresine yalnız `iletiGeldi`'nin `yanitla`sı ulaşır;
// yukarıdaki hook çerçeve penceresini ve adresli gönderimi beklediği için orada çalışmaz. Görünüm sözleşmesi aynıdır:
// köprü yerel bir kanaldan beslenir, cevap `yanitla` ile gider. Dönen işlev `iletiGeldi`'nin başında çağrılır; görünüm
// iletisini (ikinci menü sayıları dahil) işler ve true döner, başka iletiyi modülün kendi kanalına bırakır (false).
export function useYalitilmisGorunum(kok: string, menuler: readonly IkinciMenu[] = IKINCI_MENU_TANIMLARI): (veri: unknown, yanitla: Yanitla) => boolean {
  const konum = useLocation();
  const gezin = useNavigate();
  const menu = menuler.find((m) => m.kok === kok);
  const maddeler = menu === undefined ? [] : menuMaddeleri(menu);
  const gorunum = etkinMadde(maddeler, konum.pathname)?.anahtar ?? null;
  // Gizli kalıcı ekrandaki çerçeve kişiyi başka sayfaya çekemez (kalici.tsx).
  const gorunur = useEkranGorunur();
  const guncel = useRef({ maddeler, gezin, gorunur });
  guncel.current = { maddeler, gezin, gorunur };
  const yanitla = useRef<Yanitla | null>(null);
  // Sabit nesneler: köprü iletinin kaynağını bu nesneyle karşılaştırır, gönderimi buradan yapar. Kaynak ve köken
  // denetimini YalitilmisCerceve yapmıştır; buraya yalnız o çerçevenin iletisi gelir.
  const kanal = useRef(new EventTarget());
  const hedef = useRef({ postMessage: (ileti: unknown) => { yanitla.current?.(ileti); } });
  const kopru = useRef<KabukKoprusu | null>(null);
  const sayaclar = useCerceveSayacYazici(kok);
  const { komutlar, komutOnerileri } = useCerceveKomutlari(kok, kopru);

  useEffect(() => {
    const k = kabukKoprusuKur({
      pencere: kanal.current as unknown as Window,
      cerceve: () => (yanitla.current === null ? null : hedef.current as unknown as Window),
      koken: OPAK_KOKEN,
      sayaclar,
      komutlar,
      komutOnerileri,
      sahibeGit: (yol) => { if (guncel.current.gorunur && sahibinSayfasiMi(yol)) void guncel.current.gezin(yol); },
      gorunumDegisti: (yeni) => {
        const madde = guncel.current.maddeler.find((m) => m.anahtar === yeni);
        if (madde === undefined || !guncel.current.gorunur) return false;
        void guncel.current.gezin(madde.yol, { replace: true });
        return true;
      },
    });
    kopru.current = k;
    return () => { k.kapat(); kopru.current = null; komutlar(KOMUTSUZ); komutOnerileri(KOMUTSUZ); };
  }, [sayaclar, komutlar, komutOnerileri]);

  useEffect(() => {
    if (gorunum !== null) kopru.current?.gorunumGonder(gorunum);
  }, [gorunum, konum.key]);

  return (veri, cevapla) => {
    const m = veri as { kanal?: unknown } | null;
    if (m === null || typeof m !== 'object' || m.kanal !== CERCEVE_KANALI) return false;
    yanitla.current = cevapla;
    const olay = Object.assign(new Event('message'), { data: veri, origin: OPAK_KOKEN, source: hedef.current });
    kanal.current.dispatchEvent(olay);
    return true;
  };
}
