import { birlesikAd } from '#paylasilan/uygulama.ts';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { Kullanici } from '#paylasilan/kullanici.ts';
import type { GirisCevabi, GirisGovdesi, KartGirisGovdesi, OturumCevabi, PinBelirleGovdesi } from '#paylasilan/sozlesme/oturum.ts';
import { Dugme, Girdi, Simge } from '../../ortak/arayuz/index.ts';
import { anahtarlar } from '../../ortak/veri/anahtarlar.ts';
import { api, hataIletisi } from '../../ortak/veri/api.ts';
import { girisGosterisiBaslat } from '../../ortak/veri/gorunum.ts';
import { kartTusu, OKUYUCU_BASI } from '../../ortak/veri/kart-degistir.ts';
import { useGirisKurumAdi, useGirisSesi } from '../../ortak/veri/kurum.ts';
import { GIRIS_LOGOSU_ADRESI } from '../../ortak/veri/kurum-logosu.ts';
import { GIRIS_YONTEMI_ANAHTARI as YONTEM_ANAHTARI, girisiYenidenDene, girisYonteminiHatirla } from '../../ortak/veri/oturum.ts';
import { DERLEME, derlemeTarihi } from '../../ortak/veri/surum.ts';
import { HARFLER, SVG_KUTUSU, svgYolu } from '../../ortak/arayuz/core-harfleri.ts';
import { bekleme, cihazTercihi, sesCal, sesHazirMi, sesSustur, sesTercihiYaz } from './sahne/ses.ts';
import type { Tekillik } from './sahne/tekillik.ts';
import './giris.css';

const PIN_HANE = 6;
const AG_YOK = 'Sunucuya ulaşılamadı';

type Kip = 'pin' | 'parola' | 'kart' | 'belirle';
type SakliKip = 'pin' | 'parola' | 'kart';
type PinAlani = 'pin' | 'yeni' | 'tekrar';

// Modül şeridi (2170): giriş ekranı uygulamanın kapsadığı işleri akan bir şerit olarak gösterir.
export const MODULLER: readonly string[] = [
  'Plan', 'İş emri', 'Rota', 'Terminal', 'OEE', 'Duruş', 'Stok', 'Satın alma', 'Sevkiyat', 'Kalite',
  'Kalibrasyon', 'Denetim', 'Çizim', '3B model', 'CNC kurulum', 'Etiket', 'Vardiya', 'İK', 'Maliyet', 'Bildirim',
];

// Slogan firma adı taşımaz (2170): ad sistem ayarındadır ve formun üstünde ayrıca görünür. İki satırlık levhadır (2184):
// ilk cümle sakin, ikinci satır büyük ve "CORE" altın.
export const SLOGAN_UST = 'Tahmin yok. Bahane yok.';
export const SLOGAN = `${SLOGAN_UST} CORE var.`;
// CORE altındaki yazı ölçek sınırı koymaz: atölyeden dev tesise (2184).
export const ALT_YAZI = 'Sanayinin işletim sistemi';

type SahneDurumu = 'yukleniyor' | 'acik' | 'yok';
// Kurum ayarı sahne başladıktan bu kadar sonra gelirse o açılışta ses çalmaz (sahne geri sarılmaz).
const GEC_SES_MS = 1500;

// Giriş sahnesi (kart 2148, karar 2148-1): CORE kelimesi tek noktadan doğar, O harfi yıldızlardan döner. three ve sahne kodu
// form çizildikten sonra ayrı parça olarak yüklenir; form sahneyi beklemez. WebGL2 yoksa ya da grafik birimi yoksa aynı harf
// hatları düz çizim olarak görünür. Süs çizimidir, ekran okuyucudan gizlidir; hareket azaltma tercihinde yalnız son kare çizilir.
// Açılış sesi (2170) açıksa sahneyle birlikte başlar; ikisi de yarım saniyelik ortak saat ızgarasına oturur. Açık olup olmadığını
// kurum ayarı belirler, giriş ekranındaki düğme yalnız bu cihazda değiştirir (kart 2175).
function GirisSahnesi() {
  const kap = useRef<HTMLDivElement>(null);
  const parlama = useRef<HTMLDivElement>(null);
  const alti = useRef<HTMLParagraphElement>(null);
  const sahne = useRef<Tekillik | null>(null);
  const zamanlayici = useRef(0);
  const [durum, durumYaz] = useState<SahneDurumu>(() => (typeof WebGL2RenderingContext === 'undefined' ? 'yok' : 'yukleniyor'));
  const kurumSesi = useGirisSesi();
  const [cihazSesi, cihazSesiYaz] = useState(cihazTercihi);
  const sesAcik = cihazSesi ?? kurumSesi.acik;
  // Zamanlayıcı ızgara anında en son gelen düzeyi okur.
  const sesDuzeyi = useRef(kurumSesi.duzey);
  sesDuzeyi.current = kurumSesi.duzey;
  // Açılışta ses yalnız bir kez ve sahnenin başında başlar: kurum ayarı geç gelirse sahne baştan alınmaz, o açılış sessiz geçer.
  const sahneBasi = useRef<number | null>(null);
  const calindi = useRef(false);

  // Sahne ve ses bir sonraki ızgara anında birlikte baştan başlar (aynı anda açan terminaller aynı vuruşta çalar).
  const sesleBaslat = () => {
    window.clearTimeout(zamanlayici.current);
    zamanlayici.current = window.setTimeout(() => { sahne.current?.bastan(); void sesCal(0, Date.now(), sesDuzeyi.current ?? undefined); }, bekleme(Date.now()));
  };

  useEffect(() => {
    const el = kap.current;
    if (el === null || typeof WebGL2RenderingContext === 'undefined') return undefined;
    let bitti = false;
    const hareketsiz = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    import('./sahne/tekillik.ts')
      .then(({ tekillikKur }) => {
        if (bitti) return;
        sahne.current = tekillikKur(el, { hareketsiz, parlama: parlama.current, alti: alti.current });
        sahneBasi.current = performance.now();
        durumYaz(sahne.current === null ? 'yok' : 'acik');
      })
      .catch(() => { if (!bitti) durumYaz('yok'); });
    return () => { bitti = true; window.clearTimeout(zamanlayici.current); sahne.current?.kapat(); sahne.current = null; sesSustur(); };
  }, []);

  // Tarayıcı dokunulmamış sayfada sesi başlatmaz; terminalde buna izin verilmişse ses açılışta da çalar, verilmemişse susar.
  const hazir = durum !== 'yukleniyor';
  useEffect(() => {
    if (!sesAcik || !hazir || calindi.current) return;
    if (sahneBasi.current !== null && performance.now() - sahneBasi.current > GEC_SES_MS) return;
    if (!sesHazirMi()) return;
    calindi.current = true;
    sesleBaslat();
  }, [sesAcik, hazir]);

  const sesDegistir = () => {
    const yeni = !sesAcik;
    calindi.current = true;
    cihazSesiYaz(yeni);
    sesTercihiYaz(yeni);
    if (yeni) sesleBaslat(); else { window.clearTimeout(zamanlayici.current); sesSustur(); }
  };

  return (
    <>
      <div className="tc-giris-sahne" data-durum={durum} aria-hidden="true">
        <div ref={kap} className="tc-giris-sahne-tuval" />
        <div ref={parlama} className="tc-giris-sahne-parlama" />
        {durum === 'yok' && (
          <svg className="tc-giris-sahne-yedek" viewBox={SVG_KUTUSU} focusable="false">
            {HARFLER.map((h) => <path key={h.ad} className={h.ad === 'O' ? 'tc-giris-sahne-o' : undefined} d={svgYolu(h)} fillRule="evenodd" />)}
          </svg>
        )}
        <p ref={alti} className="tc-giris-sahne-alti">{ALT_YAZI}</p>
      </div>
      <button type="button" className="tc-giris-ses" aria-pressed={sesAcik} onClick={sesDegistir} title="Açılış sesi: bu cihazda kurum ayarını değiştirir">
        <Simge ad={sesAcik ? 'ses' : 'ses-kapali'} boyut="k" />
        <span>{sesAcik ? 'Ses açık' : 'Ses kapalı'}</span>
      </button>
    </>
  );
}

// Canlı saat: tanıtım alt satırında, saniyede bir yenilenir.
function Saat() {
  const [simdi, simdiYaz] = useState(() => new Date());
  useEffect(() => {
    const z = window.setInterval(() => { simdiYaz(new Date()); }, 1000);
    return () => { window.clearInterval(z); };
  }, []);
  const iki = (n: number) => String(n).padStart(2, '0');
  return <time className="tc-giris-saat mono" dateTime={simdi.toISOString()}>{iki(simdi.getHours())}:{iki(simdi.getMinutes())}:{iki(simdi.getSeconds())}</time>;
}

// Asıl giriş PIN'dir (1832): ekran her açılışta PIN ile karşılar, parola o açılış için seçilir ve saklanmaz. İstasyon kartla
// girer (kart #1326, 1930): istasyon profilli oturum tarayıcıya kartı yazar (ortak/veri/oturum.ts), ekran orada kartla açılır.
function kayitliKip(): Kip {
  try {
    return window.localStorage.getItem(YONTEM_ANAHTARI) === 'kart' ? 'kart' : 'pin';
  } catch {
    return 'pin';
  }
}

function kipiSakla(kip: SakliKip): void {
  try {
    window.localStorage.setItem(YONTEM_ANAHTARI, kip);
  } catch {
    // Saklanamazsa ekran PIN ile açılır; giriş yine çalışır.
  }
}

const rakamlar = (metin: string): string => metin.replace(/\D/g, '').slice(0, PIN_HANE);

export function Giris() {
  const istemci = useQueryClient();
  const kurumAdi = useGirisKurumAdi();
  const markaAdi = birlesikAd(kurumAdi);
  const [kip, kipYaz] = useState<Kip>(kayitliKip);
  const [logoVar, logoVarYaz] = useState(false);
  const [kullaniciAdi, kullaniciAdiYaz] = useState('');
  const [parola, parolaYaz] = useState('');
  const [pinler, pinlerYaz] = useState<Record<PinAlani, string>>({ pin: '', yeni: '', tekrar: '' });
  const [etkin, etkinYaz] = useState<PinAlani>('pin');
  const [geciciPin, geciciPinYaz] = useState('');
  const [uyusmazlik, uyusmazlikYaz] = useState(false);

  // Açılış gösterisi oturum yazılmadan hemen önce kurulur: giriş anında oynar, kabuk arkasında hazırlanır.
  const oturumuYaz = (kullanici: Kullanici | null) => {
    if (kullanici !== null) girisGosterisiBaslat(GIRIS_LOGOSU_ADRESI);
    girisYonteminiHatirla(kullanici);
    istemci.setQueryData(anahtarlar.oturum, kullanici);
  };

  const giris = useMutation({
    mutationFn: (govde: GirisGovdesi) => girisiYenidenDene(() => api.post<GirisCevabi>('/oturum/giris', govde, { oturumBitirmez: true })),
    onSuccess: (cevap, govde) => {
      if (cevap.pinBelirlenecek) {
        geciciPinYaz(govde.pin ?? '');
        pinlerYaz({ pin: '', yeni: '', tekrar: '' });
        etkinYaz('yeni');
        kipYaz('belirle');
        return;
      }
      oturumuYaz(cevap.kullanici);
    },
    onError: () => {
      parolaYaz('');
      pinlerYaz((p) => ({ ...p, pin: '' }));
    },
  });

  const kartla = useMutation({
    mutationFn: (govde: KartGirisGovdesi) =>
      girisiYenidenDene(() => api.post<OturumCevabi>('/oturum/kart-giris', govde, { oturumBitirmez: true })),
    onSuccess: (cevap) => { oturumuYaz(cevap.kullanici); },
  });

  // 1917: istasyonda kart, yöntem ya da alan seçmeden okutulur. Okuyucunun hızlı yazdığı kart biçimindeki girdi Enter'da yakalanır
  // (1898 kuralı); Enter durdurulur ki PIN ya da parola formu gönderilmesin, alana düşen karakterler silinir. Kayıtsız cihazda
  // sunucu reddeder ve denemeyi saymaz. Yakalama aşamasında dinlenir: odaktaki alan Enter'ı görmeden karar verilir.
  const okuyucu = useRef(OKUYUCU_BASI);
  const kartOkut = useRef<(kart: string, ham: string) => void>(() => undefined);
  kartOkut.current = (kartNo, ham) => {
    if (kartla.isPending) return;
    parolaYaz('');
    pinlerYaz((p) => ({ ...p, pin: '' }));
    kullaniciAdiYaz((a) => (a.endsWith(ham) ? a.slice(0, -ham.length) : a));
    giris.reset();
    kartla.mutate({ kart: kartNo });
  };
  const arkaPlanKarti = kip !== 'belirle';
  useEffect(() => {
    if (!arkaPlanKarti) return undefined;
    const dinle = (o: KeyboardEvent) => {
      if (o.ctrlKey || o.altKey || o.metaKey) { okuyucu.current = OKUYUCU_BASI; return; }
      const ham = okuyucu.current.metin;
      const r = kartTusu(okuyucu.current, o.key, o.timeStamp);
      okuyucu.current = r.durum;
      if (r.kart === null) return;
      o.preventDefault();
      o.stopPropagation();
      kartOkut.current(r.kart.toUpperCase(), ham);
    };
    window.addEventListener('keydown', dinle, true);
    return () => { window.removeEventListener('keydown', dinle, true); okuyucu.current = OKUYUCU_BASI; };
  }, [arkaPlanKarti]);

  const belirle = useMutation({
    mutationFn: (govde: PinBelirleGovdesi) =>
      girisiYenidenDene(() => api.post<OturumCevabi>('/oturum/pin-belirle', govde, { oturumBitirmez: true })),
    onSuccess: (cevap) => { oturumuYaz(cevap.kullanici); },
    onError: () => { pinlerYaz((p) => ({ ...p, yeni: '', tekrar: '' })); etkinYaz('yeni'); },
  });

  const pinYaz = (alan: PinAlani, deger: string) => {
    const temiz = rakamlar(deger);
    pinlerYaz((p) => ({ ...p, [alan]: temiz }));
    uyusmazlikYaz(false);
    if (alan === 'yeni' && temiz.length === PIN_HANE) etkinYaz('tekrar');
  };

  const tus = (deger: string) => {
    const simdiki = pinler[etkin];
    pinYaz(etkin, deger === 'sil' ? simdiki.slice(0, -1) : simdiki + deger);
  };

  const yontemDegistir = (yeni: SakliKip) => {
    if (yeni === 'kart') kipiSakla(yeni);
    kipYaz(yeni);
    etkinYaz('pin');
    pinlerYaz((p) => ({ ...p, pin: '' }));
    giris.reset();
    kartla.reset();
  };

  const ilkAdimaDon = () => {
    geciciPinYaz('');
    pinlerYaz({ pin: '', yeni: '', tekrar: '' });
    etkinYaz('pin');
    belirle.reset();
    giris.reset();
    kipYaz('pin');
  };

  const gonder = (olay: FormEvent) => {
    olay.preventDefault();
    if (kip === 'parola') { giris.mutate({ kullaniciAdi, parola }); return; }
    if (kip === 'pin') { giris.mutate({ kullaniciAdi, pin: pinler.pin }); return; }
    // Kart ekranında gönderilecek alan yok: kartı arka plan dinleyicisi okur.
    if (kip === 'kart') return;
    if (pinler.yeni !== pinler.tekrar) { uyusmazlikYaz(true); return; }
    belirle.mutate({ kullaniciAdi, geciciPin, yeniPin: pinler.yeni });
  };

  const girisHatasi = giris.isError ? hataIletisi(giris.error, AG_YOK) : undefined;
  const kartHatasi = kartla.isError ? hataIletisi(kartla.error, AG_YOK) : undefined;
  const belirleHatasi = uyusmazlik
    ? 'İki PIN aynı değil.'
    : belirle.isError ? hataIletisi(belirle.error, AG_YOK) : undefined;
  const pinKipi = kip === 'pin' || kip === 'belirle';
  const hazir = kip === 'pin'
    ? pinler.pin.length === PIN_HANE
    : kip === 'belirle' ? pinler.yeni.length === PIN_HANE && pinler.tekrar.length === PIN_HANE : true;

  const pinGirdisi = (alan: PinAlani, etiket: string, hata?: string) => (
    <Girdi
      etiket={etiket}
      name={alan}
      type="password"
      inputMode="numeric"
      autoComplete={alan === 'pin' ? 'current-password' : 'new-password'}
      pattern={`[0-9]{${PIN_HANE}}`}
      maxLength={PIN_HANE}
      required
      className="tc-giris-pin"
      data-etkin={etkin === alan ? '' : undefined}
      value={pinler[alan]}
      onFocus={() => etkinYaz(alan)}
      onChange={(o) => pinYaz(alan, o.target.value)}
      hata={hata}
    />
  );

  return (
    <main className="tc-giris">
      {/* Sahne (ya da yedek çizimi) CORE yazar; firma adı formun üstünde küçük etiket olarak durur. */}
      <section className="tc-giris-tanitim" aria-label={markaAdi} data-theme="dark">
        {/* Gövde kalan yükseklikte ortalanır; alt satır panelin dibinde durur (2184). */}
        <div className="tc-giris-govde">
          <GirisSahnesi />
          <div className="tc-giris-tanitim-ic">
            <p className="tc-giris-baslik-buyuk">
              <span className="tc-giris-slogan-ust">{SLOGAN_UST}</span>{' '}
              <span className="tc-giris-slogan-ana"><b>CORE</b> var.</span>
            </p>
            <div className="tc-giris-serit">
              <ul className="tc-giris-serit-ic" aria-label="Modüller">
                {[...MODULLER, ...MODULLER].map((m, i) => <li key={i} aria-hidden={i >= MODULLER.length ? true : undefined}>{m}</li>)}
              </ul>
            </div>
          </div>
        </div>
        <p className="tc-giris-not">
          <span className="tc-giris-not-grup"><Simge ad="lock" boyut="k" /><span>Kurum içi sistem · yalnız iç ağda</span></span>
          <Saat />
          <span className="tc-giris-surum mono">{/^0\.0\.0/.test(DERLEME.surum) ? 'geliştirme' : DERLEME.surum} · {derlemeTarihi(DERLEME.tarih)}</span>
        </p>
      </section>

      <form className="tc-giris-kart" onSubmit={gonder} aria-labelledby="tc-giris-baslik" noValidate>
        <img
          className="tc-giris-kurum-logo"
          src={GIRIS_LOGOSU_ADRESI}
          alt="Kurum logosu"
          hidden={!logoVar}
          onLoad={() => { logoVarYaz(true); }}
          onError={() => { logoVarYaz(false); }}
        />
        <header className="tc-giris-ust">
          {kurumAdi && <span className="tc-giris-firma">{kurumAdi}</span>}
          <h1 id="tc-giris-baslik" className="tc-giris-baslik">
            {kip === 'belirle' ? 'PIN belirleyin' : 'Giriş'}
          </h1>
          <p className="tc-giris-aciklama">
            {kip === 'pin' && `Kullanıcı adınız ve ${PIN_HANE} haneli PIN'inizle girin.`}
            {kip === 'parola' && 'Kullanıcı adınız ve parolanızla girin. Parola yöneticiler ve henüz PIN\'i olmayanlar içindir; PIN\'i olan PIN ile girer.'}
            {kip === 'kart' && 'Kişi kartınızı okuyucuya yaklaştırın; ekrana dokunmanız gerekmez.'}
            {kip === 'belirle' && `Size verilen geçici PIN doğru. Yalnız sizin bileceğiniz ${PIN_HANE} haneli bir PIN seçin.`}
          </p>
        </header>

        {kip === 'belirle' && <p className="tc-giris-kisi"><Simge ad="user" boyut="k" /><span>{kullaniciAdi}</span></p>}
        {kip === 'kart' && (
          <div className={`tc-giris-okut${kartHatasi ? ' tc-giris-okut-hata' : ''}`} role="status" aria-live="polite">
            <span className="tc-giris-okut-simge"><Simge ad={kartHatasi ? 'alert' : 'scan'} boyut="b" /></span>
            <strong>{kartla.isPending ? 'Kart okunuyor' : 'Kartınızı okutun'}</strong>
            {kartHatasi && <span>{kartHatasi}</span>}
          </div>
        )}
        {(kip === 'pin' || kip === 'parola') && (
          <Girdi
            etiket="Kullanıcı adı"
            name="kullaniciAdi"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            autoFocus
            required
            value={kullaniciAdi}
            onChange={(o) => kullaniciAdiYaz(o.target.value)}
          />
        )}

        {kip === 'parola' && (
          <Girdi
            etiket="Parola"
            name="parola"
            type="password"
            autoComplete="current-password"
            required
            value={parola}
            onChange={(o) => parolaYaz(o.target.value)}
            hata={girisHatasi ?? kartHatasi}
          />
        )}
        {kip === 'pin' && pinGirdisi('pin', 'PIN', girisHatasi ?? kartHatasi)}
        {kip === 'belirle' && (
          <>
            {pinGirdisi('yeni', 'Yeni PIN')}
            {pinGirdisi('tekrar', 'Yeni PIN (tekrar)', belirleHatasi)}
          </>
        )}

        {pinKipi && (
          <div className="tc-giris-tuslar" role="group" aria-label="Rakam tuşları">
            {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((r) => (
              <button key={r} type="button" className="tc-giris-tus mono" onClick={() => tus(r)}>{r}</button>
            ))}
            <span aria-hidden="true" />
            <button type="button" className="tc-giris-tus mono" onClick={() => tus('0')}>0</button>
            <button type="button" className="tc-giris-tus" aria-label="Sil" onClick={() => tus('sil')}>
              <Simge ad="back" />
            </button>
          </div>
        )}

        {kip !== 'kart' && (
          <Dugme
            type="submit"
            tur="birincil"
            boyut="ana"
            simge={kip === 'belirle' ? 'check' : 'lock'}
            disabled={!hazir}
            yukleniyor={giris.isPending || belirle.isPending || kartla.isPending}
          >
            {kip === 'belirle' ? 'PIN\'i kaydet ve gir' : 'Giriş yap'}
          </Dugme>
        )}

        <div className="tc-giris-alt">
          {kip === 'pin' && (
            <button type="button" className="tc-giris-baglanti" onClick={() => yontemDegistir('parola')}>
              <Simge ad="user" boyut="k" />Parola ile gir
            </button>
          )}
          {kip === 'parola' && (
            <button type="button" className="tc-giris-baglanti" onClick={() => yontemDegistir('pin')}>
              <Simge ad="grid" boyut="k" />PIN ile gir
            </button>
          )}
          {kip === 'kart' && (
            <>
              <button type="button" className="tc-giris-baglanti" onClick={() => yontemDegistir('pin')}>
                <Simge ad="grid" boyut="k" />Kullanıcı adıyla gir
              </button>
              <button type="button" className="tc-giris-baglanti" onClick={() => yontemDegistir('parola')}>
                <Simge ad="user" boyut="k" />Parola ile gir
              </button>
            </>
          )}
          {kip === 'pin' && (
            <button type="button" className="tc-giris-baglanti" onClick={() => yontemDegistir('kart')}>
              <Simge ad="scan" boyut="k" />Kartla gir
            </button>
          )}
          {kip === 'belirle' && (
            <button type="button" className="tc-giris-baglanti" onClick={ilkAdimaDon}>
              <Simge ad="chev-left" boyut="k" />Geri
            </button>
          )}
          {kip !== 'belirle' && <span className="tc-giris-ipucu">PIN'inizi unuttuysanız yöneticiden yenisini isteyin.</span>}
        </div>
      </form>
    </main>
  );
}
