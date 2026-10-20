import { useState, type ComponentProps, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { Kullanici } from '#paylasilan/kullanici.ts';
import type { GirisCevabi, GirisGovdesi, OturumCevabi, PinBelirleGovdesi } from '#paylasilan/sozlesme/oturum.ts';
import { Dugme, Girdi, Simge } from '../../ortak/arayuz/index.ts';
import { anahtarlar } from '../../ortak/veri/anahtarlar.ts';
import { api, hataIletisi } from '../../ortak/veri/api.ts';
import { girisGosterisiBaslat } from '../../ortak/veri/gorunum.ts';
import { GIRIS_LOGOSU_ADRESI } from '../../ortak/veri/kurum-logosu.ts';
import { DERLEME } from '../../ortak/veri/surum.ts';
import './giris.css';

const PIN_HANE = 6;
const YONTEM_ANAHTARI = 'tmi.giris.yontem';
const AG_YOK = 'Sunucuya ulaşılamadı';

type Kip = 'pin' | 'parola' | 'belirle';
type PinAlani = 'pin' | 'yeni' | 'tekrar';

const TANITIM: readonly { simge: ComponentProps<typeof Simge>['ad']; metin: string }[] = [
  { simge: 'gantt', metin: 'Plan, iş emri ve rota tek yerde' },
  { simge: 'scan', metin: 'Her adımın izlenebilir üretim kaydı' },
  { simge: 'gauge', metin: 'İstasyon ve makine durumu anlık' },
  { simge: 'box', metin: 'Malzeme ve stok hareketi izli' },
];

const KONTUR = 'M60 60 H300 A40 40 0 0 1 340 100 V220 H100 A40 40 0 0 1 60 180 Z';

// Yerel çizim: takım yolunu çizen freze, parçanın dış konturu ve cebi. Süs çizimidir, ekran okuyucudan gizlidir;
// hareket azaltma tercihinde çizim durur ve tam görünür.
function TakimYolu() {
  return (
    <svg className="tc-giris-cizim" viewBox="0 0 400 300" aria-hidden="true" focusable="false">
      <g className="tc-giris-cizim-olcu mono">
        <line x1="40" y1="270" x2="360" y2="270" />
        <line x1="40" y1="262" x2="40" y2="278" />
        <line x1="360" y1="262" x2="360" y2="278" />
        <text x="200" y="290">320.00</text>
      </g>
      <rect className="tc-giris-cizim-ham" x="40" y="40" width="320" height="200" rx="6" />
      <path className="tc-giris-cizim-yol" pathLength={100} d={KONTUR} />
      <path className="tc-giris-cizim-cep" pathLength={100} d="M140 110 H260 V170 H140 Z" />
      <g className="tc-giris-cizim-delik">
        <circle cx="100" cy="100" r="10" />
        <circle cx="300" cy="180" r="10" />
      </g>
      <g className="tc-giris-cizim-takim">
        <circle r="7" />
        <line x1="-14" y1="0" x2="14" y2="0" />
        <line x1="0" y1="-14" x2="0" y2="14" />
        {/* Takım çizginin ucunda gider: çizim süresi ve tutma payı stil dosyasındaki animasyonla aynıdır. */}
        <animateMotion path={KONTUR} dur="9s" repeatCount="indefinite" calcMode="linear" keyPoints="0;1;1" keyTimes="0;0.7;1" />
      </g>
    </svg>
  );
}

// Yönetici kendi bilgisayarında parolayla girer; seçim tarayıcıda kalır ki her açılışta yeniden seçilmesin.
function kayitliKip(): Kip {
  try {
    return window.localStorage.getItem(YONTEM_ANAHTARI) === 'parola' ? 'parola' : 'pin';
  } catch {
    return 'pin';
  }
}

function kipiSakla(kip: 'pin' | 'parola'): void {
  try {
    window.localStorage.setItem(YONTEM_ANAHTARI, kip);
  } catch {
    // Saklanamazsa ekran PIN ile açılır; giriş yine çalışır.
  }
}

const rakamlar = (metin: string): string => metin.replace(/\D/g, '').slice(0, PIN_HANE);

export function Giris() {
  const istemci = useQueryClient();
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
    istemci.setQueryData(anahtarlar.oturum, kullanici);
  };

  const giris = useMutation({
    mutationFn: (govde: GirisGovdesi) => api.post<GirisCevabi>('/oturum/giris', govde, { oturumBitirmez: true }),
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

  const belirle = useMutation({
    mutationFn: (govde: PinBelirleGovdesi) =>
      api.post<OturumCevabi>('/oturum/pin-belirle', govde, { oturumBitirmez: true }),
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

  const yontemDegistir = (yeni: 'pin' | 'parola') => {
    kipiSakla(yeni);
    kipYaz(yeni);
    etkinYaz('pin');
    giris.reset();
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
    if (pinler.yeni !== pinler.tekrar) { uyusmazlikYaz(true); return; }
    belirle.mutate({ kullaniciAdi, geciciPin, yeniPin: pinler.yeni });
  };

  const girisHatasi = giris.isError ? hataIletisi(giris.error, AG_YOK) : undefined;
  const belirleHatasi = uyusmazlik
    ? 'İki PIN aynı değil.'
    : belirle.isError ? hataIletisi(belirle.error, AG_YOK) : undefined;
  const pinKipi = kip !== 'parola';
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
      <section className="tc-giris-tanitim" aria-label="TMI Core" data-theme="dark">
        <TakimYolu />
        <div className="tc-giris-tanitim-ic">
          <div className="tc-giris-marka">
            <span className="tc-giris-isaret mono">TMI</span>
            <span className="tc-giris-ad">CORE</span>
          </div>
          <p className="tc-giris-baslik-buyuk">Plandan sevke, her adım kayıt altında.</p>
          <p className="tc-giris-slogan">Üretim planlama ve izlenebilirlik</p>
          <ul className="tc-giris-ozellikler">
            {TANITIM.map((o) => (
              <li key={o.simge}><span className="tc-giris-ozellik-simge"><Simge ad={o.simge} /></span><span>{o.metin}</span></li>
            ))}
          </ul>
          <p className="tc-giris-not">
            <Simge ad="lock" boyut="k" /><span>Kurum içi sistem · yalnız iç ağda</span>
            <span className="tc-giris-surum mono">v{DERLEME.surum}</span>
          </p>
        </div>
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
          <h1 id="tc-giris-baslik" className="tc-giris-baslik">
            {kip === 'belirle' ? 'PIN belirleyin' : 'Giriş'}
          </h1>
          <p className="tc-giris-aciklama">
            {kip === 'pin' && `Kullanıcı adınız ve ${PIN_HANE} haneli PIN'inizle girin.`}
            {kip === 'parola' && 'Kullanıcı adınız ve parolanızla girin.'}
            {kip === 'belirle' && `Size verilen geçici PIN doğru. Yalnız sizin bileceğiniz ${PIN_HANE} haneli bir PIN seçin.`}
          </p>
        </header>

        {kip === 'belirle' ? (
          <p className="tc-giris-kisi"><Simge ad="user" boyut="k" /><span>{kullaniciAdi}</span></p>
        ) : (
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
            hata={girisHatasi}
          />
        )}
        {kip === 'pin' && pinGirdisi('pin', 'PIN', girisHatasi)}
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

        <Dugme
          type="submit"
          tur="birincil"
          boyut="ana"
          simge={kip === 'belirle' ? 'check' : 'lock'}
          disabled={!hazir}
          yukleniyor={giris.isPending || belirle.isPending}
        >
          {kip === 'belirle' ? 'PIN\'i kaydet ve gir' : 'Giriş yap'}
        </Dugme>

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
