import { useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import type { IkinciMenuMaddesi } from '#paylasilan/sayfa-tanimi.ts';
import { IKINCI_MENULER, maddeGorunurMu } from '#paylasilan/sayfalar.ts';
import type { ArkonBenCevabi, ArkonRolu, MakineDevralGovdesi } from '#paylasilan/sozlesme/arkon.ts';
import { DurumKutusu, useBildirim } from '../../ortak/arayuz/index.ts';
import { api, hataIletisi } from '../../ortak/veri/api.ts';
import { useEkranGorunur } from '../../ortak/rota/kalici.tsx';
import { cikistaCalistir, useCikis, useOturum } from '../../ortak/veri/oturum.ts';
import { useTema } from '../../ortak/veri/tema.ts';
import { yerelVeriyiTemizle } from '../../../../arkon/web/src/data/yerel-temizlik.ts';
import { anahtarlar } from './anahtarlar.ts';
import { EMIR_PARAMETRESI, KART_PARAMETRESI, bagla, emirParametresiOku, emirSeciminiGonder, temayiUygula, tohumla } from './baglanti.ts';
import type { MakineDoluRedi } from './baglanti.ts';
import { MakineDevralPenceresi, devralMetni } from './MakineDevralPenceresi.tsx';
import './arkon.css';

// Çıkışta Arkon'un cihazdaki verisi silinir, gönderilmemiş kayıt kuyruğu kalır (karar 102 a). TMI içinde Arkon hep sunucu kipindedir.
const yerelVeriyiSil = (): void => { void yerelVeriyiTemizle(window.localStorage, window.indexedDB).catch(() => { /* temizlenemeyen veri bir sonraki çıkışta yeniden denenir */ }); };
// Çıkış Arkon sayfası açık değilken de yapılabilir: ortak çıkış kancası sunucu çıkışı onaylayınca temizler. Modül rotalarla açılışta yüklenir.
cikistaCalistir(() => yerelVeriyiTemizle(window.localStorage, window.indexedDB));

// Derlenmiş Arkon'un adresi (arkon/sun.ts ARKON_YOLU); uygulamanın kök adresine göredir.
export const ARKON_ADRESI = `${import.meta.env.BASE_URL}arkon-mes/index.html`;

declare global {
  interface Window {
    // Arkon'un index.html'i açılırken bunu çağırır (modül betiklerinden önce): veri bağlantısı Arkon başlamadan kurulur.
    __tmiArkonBagla?: (pencere: Window & typeof globalThis) => void;
  }
}

type ArkonPenceresi = Window & typeof globalThis;
interface KopruKaydi { readonly cerceve: RefObject<HTMLIFrameElement | null>; readonly bagla: (pencere: ArkonPenceresi) => void }
// Aynı anda birden çok Arkon çerçevesi yaşar: kalıcı Üretim Terminali gizlenir ama kalkmaz; Kuyruk, Arkon MES ve Sistem Ayarları da
// kendi çerçevesini kurar. Köprü tek genel addır; çağrı, çağıran pencerenin çerçevesinin köprüsüne gider. Bir çerçeve kalkınca
// ötekilerin köprüsü silinmez: silinseydi yeniden yüklenen terminal köprüsüz açılır, Arkon kendi şeridiyle ve TMI bağlantısı olmadan çalışırdı.
const kopruler: KopruKaydi[] = [];

export function kopruSec(pencere: Window, ust: Window = window): KopruKaydi | null {
  try {
    // Önizleme Arkon'un içindeki ikinci çerçevededir: üst pencerelere çıkılarak TMI'deki çerçeve bulunur.
    for (let w: Window | null | undefined = pencere; w && w !== ust; w = w.parent === w ? null : w.parent) {
      const cerceve = w.frameElement;
      const kayit = cerceve ? kopruler.find((k) => k.cerceve.current === cerceve) : undefined;
      if (kayit) return kayit;
    }
  } catch { /* başka kökene çıkılamaz; son kurulan çerçeveye düşülür */ }
  return kopruler.at(-1) ?? null;
}

export function kopruKaydet(kayit: KopruKaydi, ust: Window = window): () => void {
  kopruler.push(kayit);
  ust.__tmiArkonBagla = (pencere) => { kopruSec(pencere, ust)?.bagla(pencere); };
  return () => {
    const sira = kopruler.indexOf(kayit);
    if (sira >= 0) kopruler.splice(sira, 1);
    if (kopruler.length === 0) delete ust.__tmiArkonBagla;
  };
}

const hashSayfasi = (hash: string): string => decodeURIComponent(hash.replace(/^#/, ''));

// Arkon sayfasının TMI adresi. Üretim Terminali'nde adres hep terminalde kalır: /arkon'a geçmek çerçeveyi yeniden kurup
// operatörün yarım işini kaybettirirdi ve Arkon MES sayfası olmayan rolde "sayfa bulunamadı" verirdi.
export const ARKON_KOKU = '/arkon';
// Arkon'un operatör ekranının adres işareti boştur; TMI adresinde `operator` adıyla durur, böylece /arkon girişi rolüne göre
// başka sayfayı açabilir.
export const OPERATOR_SAYFASI = 'operator';
const arkonSayfasi = (tmi: string): string => (tmi === OPERATOR_SAYFASI ? '' : tmi);
export const tmiAdresi = (kok: string, sayfa: string): string =>
  kok !== ARKON_KOKU ? kok : `${ARKON_KOKU}/${encodeURIComponent(sayfa === '' ? OPERATOR_SAYFASI : sayfa)}`;

// Açılan ekran kişinin Arkon rolündendir (sunucu rolü kişinin TMI rolünden çözer; ek Arkon işlemi değiştirmez): operatör
// operatör ekranından, Pano'yu görebilen öteki roller Pano'dan girer.
export function arkonGirisSayfasi(rol: ArkonRolu, islemler: readonly string[]): string {
  if (rol === 'operator') return OPERATOR_SAYFASI;
  const pano = IKINCI_MENULER.find((m) => m.kok === ARKON_KOKU)?.gruplar.flatMap((g): readonly IkinciMenuMaddesi[] => g.maddeler).find((m) => m.anahtar === 'pano');
  return pano !== undefined && maddeGorunurMu(pano, islemler) ? 'pano' : OPERATOR_SAYFASI;
}

// Arkon rolü operatör olan kişi Arkon MES'ten Üretim Terminali'ne girer: operatör ekranı orada tam ekran ve yarım iş korunarak açılır.
export const URETIM_TERMINALI_YOLU = '/uretim-terminali';
export const operatorTerminaleGirer = (rol: ArkonRolu, islemler: readonly string[]): boolean =>
  rol === 'operator' && islemler.includes('sayfa.uretim-terminali');

// Arkon MES değiştirilmeden çerçevede açılır. Sayfaları TMI'nin ikinci menüsündedir (paylasilan/sayfalar/arkon.ts, kabuk çizer);
// Arkon'un kendi şeridi gizlenir.
// Arkon'un sayfası TMI adresine yansır (/arkon/<sayfa>), TMI adresi değişince Arkon o sayfaya geçer.
// sabitSayfa: kökü Arkon'un tek sayfasını açan TMI sayfası (Kuyruk); TMI adresinde Arkon sayfası taşınmaz.
// kok null: çerçeve başka bir TMI sayfasının içindedir (Sistem Ayarları); adres o sayfanındır, Arkon'u izlemez.
// Yalın /arkon rolün giriş sayfasını yönlendirmeden açar: menü bağlantısı tıklandığı adreste kalır, çerçeve yeniden kurulmaz.
export function ArkonCercevesi({ kok = ARKON_KOKU, sabitSayfa }: { kok?: string | null; sabitSayfa?: string }) {
  const { sayfa: adresSayfasi = '' } = useParams();
  const oturum = useOturum();
  // Oturum çıkışsız kapanırsa (süre doldu) açık çerçeve de temizler.
  useEffect(() => { if (oturum.data === null) yerelVeriyiSil(); }, [oturum.data]);
  // Rol giriş sayfası yalnız Arkon MES'in kendisindedir; Üretim Terminali hep operatör ekranını açar.
  const girisSayfasi = kok === ARKON_KOKU && adresSayfasi === '';
  const gezin = useNavigate();
  const cikis = useCikis();
  const ben = useQuery({ queryKey: anahtarlar.ben, queryFn: () => api.get<ArkonBenCevabi>('/arkon/ben') });
  const kisi = ben.data?.kisi;
  const islemler = oturum.data?.islemler ?? [];
  // Giriş sayfası Arkon rolünü bekler; çerçeve de kişi gelince kurulur (hazir), o ana kadar sayfa önemsizdir.
  const sayfa = sabitSayfa ?? (girisSayfasi ? arkonSayfasi(kisi === undefined ? OPERATOR_SAYFASI : arkonGirisSayfasi(kisi.rol, islemler)) : arkonSayfasi(adresSayfasi));
  const terminale = girisSayfasi && sabitSayfa === undefined && kisi !== undefined && operatorTerminaleGirer(kisi.rol, islemler);
  const sayfaRef = useRef(sayfa);
  sayfaRef.current = sayfa;
  const cerceve = useRef<HTMLIFrameElement>(null);
  const [hazir, hazirYaz] = useState(false);
  // Çerçeve bir kez yüklenir; sonraki sayfa değişimleri adres işaretiyle (#) olur, Arkon'daki yarım iş kaybolmaz.
  const [ilkAdres, ilkAdresYaz] = useState<string | null>(null);
  const cikisRef = useRef(cikis.mutate);
  cikisRef.current = cikis.mutate;
  const { bildir } = useBildirim();
  const bildirRef = useRef(bildir);
  bildirRef.current = bildir;
  const gezinRef = useRef(gezin);
  gezinRef.current = gezin;
  // Gizli (kalıcı) çerçeve kullanıcıyı kendi adresine çekmez.
  const gorunur = useEkranGorunur();
  const gorunurRef = useRef(gorunur);
  gorunurRef.current = gorunur;
  const baglantiyiKapat = useRef<() => void>(() => {});
  // Makine başka işte doluyken reddedilen başlatmalar sırayla sorulur; onaylanan, o işi durdurup kullanıcınınkini başlatır.
  const [devralmalar, devralmalarYaz] = useState<MakineDoluRedi[]>([]);
  const siradaki = devralmalar[0] ?? null;
  const siradakiniKapat = () => devralmalarYaz((l) => l.slice(1));
  const devral = useMutation({
    mutationFn: (red: MakineDoluRedi) => api.post<{ tamam: true }>('/arkon/makine-devral', {
      emirId: red.devralEmirId, kullanimId: red.doluOlan.kullanimId, cid: red.cid, durdurulanEmirId: red.doluOlan.emir.id,
    } satisfies MakineDevralGovdesi),
    onSuccess: (_cevap, red) => { bildir('tamam', `${red.doluOlan.emir.emirNo} durduruldu; işiniz başlatıldı.`); siradakiniKapat(); },
    onError: (hata) => { bildir('hata', `TMI CORE: ${hataIletisi(hata, 'Makine devralınamadı.')}`); siradakiniKapat(); },
  });

  const { tema } = useTema();
  const temaRef = useRef(tema);
  temaRef.current = tema;

  const benRef = useRef({ cevap: ben.data, zaman: ben.dataUpdatedAt });
  benRef.current = { cevap: ben.data, zaman: ben.dataUpdatedAt };
  useEffect(() => {
    if (kisi === undefined) return;
    try {
      tohumla(window.localStorage, {
        kokAdres: window.location.origin,
        kisi,
        tema: temaRef.current,
      });
    } catch { /* depolama kapalıysa Arkon kendi girişini gösterir */ }
    const kopruyuKaldir = kopruKaydet({ cerceve, bagla: (pencere) => {
      // Çerçeve kendi içinde yeniden yüklenince eski sayfanın olay akışı sahipsiz kalır.
      baglantiyiKapat.current();
      const benVerisi = benRef.current;
      baglantiyiKapat.current = bagla(pencere, {
        ...(benVerisi.cevap === undefined ? {} : { ben: { cevap: benVerisi.cevap, zaman: benVerisi.zaman } }),
        cikis: () => cikisRef.current(),
        reddedildi: (ileti) => bildirRef.current('hata', `TMI CORE: ${ileti}`),
        makineDolu: (red) => devralmalarYaz((l) => [...l, red]),
        uyari: (ileti) => bildirRef.current('bilgi', `TMI CORE: ${ileti}`),
        git: (yol) => { void gezinRef.current(yol); },
      });
    } });
    ilkAdresYaz((a) => a ?? `${ARKON_ADRESI}#${encodeURIComponent(sayfaRef.current)}`);
    hazirYaz(true);
    return kopruyuKaldir;
  }, [kisi]);

  // Başka sayfaya geçince ve çıkışta çerçeve kalkar; olay akışı TMI penceresinde döndüğünden burada kapatılmazsa her ziyaret bir döngü daha ekler.
  useEffect(() => () => { baglantiyiKapat.current(); baglantiyiKapat.current = () => {}; }, []);

  // Ctrl K'den gelen emir yalnız Üretim Terminali'nde seçilir. İstek Arkon yüklenmiş pencereye bırakılır (boş çerçeve yüklenince
  // değişir) ve bırakılınca adresten silinir: yenilemede yeniden seçmez.
  const [arama, aramaYaz] = useSearchParams();
  const secilecekEmir = kok === URETIM_TERMINALI_YOLU ? emirParametresiOku(arama.get(EMIR_PARAMETRESI)) : null;
  const secilecekKart = secilecekEmir === null ? null : emirParametresiOku(arama.get(KART_PARAMETRESI));
  const yuklu = useRef(false);
  // Adresten silme bir sonraki çizimde görünür; arada gelen ikinci yükleme ya da etki aynı isteği yeniden göndermesin.
  const gonderilenEmir = useRef<number | null>(null);
  if (secilecekEmir === null) gonderilenEmir.current = null;
  const emirGonder = () => {
    const pencere = cerceve.current?.contentWindow;
    if (secilecekEmir === null || !pencere || !yuklu.current || gonderilenEmir.current === secilecekEmir) return;
    gonderilenEmir.current = secilecekEmir;
    emirSeciminiGonder(pencere, secilecekEmir, secilecekKart);
    aramaYaz((a) => { const y = new URLSearchParams(a); y.delete(EMIR_PARAMETRESI); y.delete(KART_PARAMETRESI); return y; }, { replace: true });
  };
  const emirGonderRef = useRef(emirGonder);
  emirGonderRef.current = emirGonder;

  // Arkon'da sayfa değişince TMI adresi güncellenir (geçmişe ikinci satır yazılmaz: çerçeve zaten yazdı).
  const yuklendi = () => {
    const pencere = cerceve.current?.contentWindow;
    if (pencere) temayiUygula(pencere, temaRef.current);
    yuklu.current = true;
    emirGonderRef.current();
    if (!pencere || kok === null) return;
    pencere.addEventListener('hashchange', () => {
      if (!gorunurRef.current) return;
      const yeni = hashSayfasi(pencere.location.hash);
      void gezin(tmiAdresi(kok, yeni), { replace: true });
    });
  };

  useEffect(() => {
    const pencere = cerceve.current?.contentWindow;
    if (pencere) temayiUygula(pencere, tema);
  }, [tema]);

  useEffect(() => { emirGonderRef.current(); }, [secilecekEmir, hazir]);

  useEffect(() => {
    const pencere = cerceve.current?.contentWindow;
    if (!pencere || pencere.location.href === 'about:blank') return;
    if (hashSayfasi(pencere.location.hash) !== sayfa) pencere.location.hash = encodeURIComponent(sayfa);
  }, [sayfa]);

  if (terminale) return <Navigate replace to={URETIM_TERMINALI_YOLU} />;
  const devralPenceresi = (
    <MakineDevralPenceresi
      red={siradaki}
      yukleniyor={devral.isPending}
      onayla={() => { if (siradaki !== null) devral.mutate(siradaki); }}
      vazgec={() => {
        if (siradaki !== null) bildir('bilgi', `TMI CORE: ${devralMetni(siradaki)} İşiniz başlatılmadı.`);
        siradakiniKapat();
      }}
    />
  );
  let icerik;
  if (ben.isError) {
    icerik = (
      <div className="tc-arkon-durum">
        <DurumKutusu durum="hata" mesaj={hataIletisi(ben.error, 'Üretim Hazırlık açılamadı.')} yenile={() => { void ben.refetch(); }} />
      </div>
    );
  } else if (!hazir || ilkAdres === null) {
    icerik = <div className="tc-arkon-durum"><DurumKutusu durum="yukleniyor" /></div>;
  } else {
    icerik = (
      <div className={kok === null ? 'tc-arkon tc-arkon-gomulu' : 'tc-arkon'}>
        <iframe
          ref={cerceve}
          className="tc-arkon-cerceve"
          title="Üretim Hazırlık"
          src={ilkAdres}
          allow="camera; fullscreen; clipboard-read; clipboard-write"
          onLoad={yuklendi}
        />
      </div>
    );
  }
  return <>{icerik}{devralPenceresi}</>;
}

export function UretimTerminali() {
  return <ArkonCercevesi kok="/uretim-terminali" />;
}

// Ana menüdeki Kuyruk: Arkon'un Plan Kuyruğu'nun salt okunur görünümü (arkon/web pano-planlama.ts KuyrukApp).
export const KUYRUK_SAYFASI = 'kuyruk';
export function PlanKuyrugu() {
  return <ArkonCercevesi kok="/kuyruk" sabitSayfa={KUYRUK_SAYFASI} />;
}

// Sistem Ayarları'ndaki Arkon bölümü: Arkon MES > Ayarlar ile aynı ekran, aynı kayıt (arkon/web ayarlar sayfası).
export const AYARLAR_SAYFASI = 'ayarlar';
export function ArkonAyarlari() {
  return <ArkonCercevesi kok={null} sabitSayfa={AYARLAR_SAYFASI} />;
}
