import { Suspense, useEffect, useRef, useState, type ReactNode } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { etkinGorunum } from '#paylasilan/rol-gorunumleri.ts';
import { SAYFALAR, yolKapaliMi } from '#paylasilan/sayfalar.ts';
import { AcilisGosterisi, AnaSayfa, BildirimSaglayici, BildirimSayfaIzleyici, DurumKutusu, HataSiniri, Kabuk, Karsilama, Kart, useBildirim } from './ortak/arayuz/index.ts';
import { anaSayfaKaynaklari, anaSayfaKartlari, rolKaynaklari, rolKartlari, type AnaSayfaKarti } from './ortak/rota/ana-sayfa.ts';
import { modulRotalari, rotaPlani, type ModulRotasi } from './ortak/rota/kesif.ts';
import { hizliIsler } from './ortak/rota/hizli-isler.ts';
import { IKINCI_MENU_TANIMLARI, adresMaddesiKapaliMi } from './ortak/rota/ikinci-menu.ts';
import { KaliciEkranlar } from './ortak/rota/kalici.tsx';
import { komutlar } from './ortak/rota/komutlar.ts';
import { ustEylemler } from './ortak/rota/ust-eylemler.ts';
import { rolSeritleri, ustSeritler } from './ortak/rota/ust-seritler.ts';
import { hataIletisi } from './ortak/veri/api.ts';
import { baglantiDonusunuDinle } from './ortak/veri/baglanti.ts';
import { useBostaCikis } from './ortak/veri/bosta-cikis.ts';
import { useGorunum, useHareketUygula } from './ortak/veri/gorunum.ts';
import { useKapaliSayfalar } from './ortak/veri/kapali-sayfalar.ts';
import { useKurumLogosu } from './ortak/veri/kurum-logosu.ts';
import { gorunurSayfalar, useCikis, useOturum } from './ortak/veri/oturum.ts';
import { sorguIstemcisi } from './ortak/veri/sorgu-istemcisi.ts';
import { Giris } from './moduller/oturum/Giris.tsx';
import { YapimAsamasinda } from './moduller/YapimAsamasinda.tsx';
import './app.css';

// Rolün açılış sayfası yalnız uygulama ana sayfadan açıldığında ve bir kez uygulanır: menüden ana sayfaya dönülebilir.
// hedef bu kullanıcıya kurulmuş bir ekran değilse (sayfa görünmüyor ya da rota henüz yok) ana sayfada kalınır.
function AcilisYonlendirmesi({ hedef }: { hedef: string | null }) {
  const konum = useLocation();
  const git = useNavigate();
  const yapildi = useRef(false);
  useEffect(() => {
    if (yapildi.current) return;
    yapildi.current = true;
    if (hedef !== null && konum.pathname === '/') void git(hedef, { replace: true });
  }, [hedef, konum.pathname, git]);
  return null;
}

// Ekranlar ilk açılışta yüklenir (tembel-rotalar.ts); yüklenirken ve hata verince yalnız içerik alanı değişir, kabuk kalır.
// Sınır adres değişince sıfırlanır: hatalı ekrandan çıkan kullanıcı gittiği sayfayı görür.
function EkranAlani({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  return (
    <HataSiniri sifirla={pathname}>
      <Suspense fallback={<DurumKutusu durum="yukleniyor" />}>{children}</Suspense>
    </HataSiniri>
  );
}

// Menüde göremediği bölümü adresle açan kişi ekranı değil "yetkiniz yok" görür (195 a); menüdeki süzgeçle aynı kural.
function AdresKorumasi({ islemler, children }: { islemler: readonly string[]; children: ReactNode }) {
  const { pathname } = useLocation();
  if (adresMaddesiKapaliMi(IKINCI_MENU_TANIMLARI, pathname, islemler)) {
    return <Kart baslik="Yetkiniz yok"><DurumKutusu durum="bos" mesaj="Bu bölümü görme yetkiniz yok." /></Kart>;
  }
  return children;
}

// Rotası olmayan adres: kayıtlı ama kişinin göremediği sayfaysa (ör. /terminal yönlendirmesinin hedefi) yetki, değilse yokluk söylenir.
function SayfaYok({ islemler }: { islemler: readonly string[] }) {
  const { pathname } = useLocation();
  const sayfa = SAYFALAR.find((s) => pathname === s.yol || pathname.startsWith(`${s.yol}/`));
  if (sayfa !== undefined && !islemler.includes(sayfa.islem)) {
    return <Kart baslik="Yetkiniz yok"><DurumKutusu durum="bos" mesaj="Bu sayfayı görme yetkiniz yok." /></Kart>;
  }
  return <Kart baslik="Sayfa bulunamadı"><DurumKutusu durum="bos" mesaj="Aradığınız sayfa yok ya da yetkiniz yok" /></Kart>;
}

function Icerik({ rotalar, kartlar }: { rotalar: readonly ModulRotasi[]; kartlar: readonly AnaSayfaKarti[] }) {
  const oturum = useOturum();
  const cikis = useCikis();
  const { bildir } = useBildirim();
  const kapali = useKapaliSayfalar(Boolean(oturum.data));
  const logo = useKurumLogosu(Boolean(oturum.data));
  const gorunum = useGorunum(Boolean(oturum.data));
  useHareketUygula(gorunum.data?.hareket, gorunum.data?.gecisHizi);
  useBostaCikis(oturum.data?.cihazProfili === 'istasyon', () => { cikis.mutate(); });

  if (oturum.isPending) return <div className="tc-acilis"><DurumKutusu durum="yukleniyor" /></div>;
  // Oturum bir kez okunduysa yeniden okumanın hatası (güncelleme, bağlantı kopması) ekranı kapatmaz: kullanıcı çalışmaya
  // devam eder, durumu kabuktaki bağlantı şeridi yazar. Oturumun gerçekten bittiğini sunucunun cevabı (null) söyler.
  if (oturum.isError && oturum.data === undefined) {
    return (
      <div className="tc-acilis">
        <DurumKutusu durum="hata" mesaj={hataIletisi(oturum.error, 'Sunucuya ulaşılamadı')} yenile={() => { void oturum.refetch(); }} />
      </div>
    );
  }
  const kullanici = oturum.data;
  if (kullanici === null) return <Giris />;

  const sayfalar = gorunurSayfalar(kullanici);
  const plan = rotaPlani(rotalar, sayfalar);
  const acilis = plan.ekranlar.some((r) => r.yol === kullanici.acilisSayfasi) && !yolKapaliMi(kullanici.acilisSayfasi ?? '', kapali)
    ? kullanici.acilisSayfasi ?? null
    : null;
  // Kapalı sayfanın işlemi pano için düşer: o sayfanın kartları ana sayfadan da kalkar. Rotalar durur; kabuk "kapalı" yazar.
  const kapaliIslemler = new Set(SAYFALAR.filter((s) => yolKapaliMi(s.yol, kapali)).map((s) => s.islem as string));
  // Rolün varsayılan görünümü (1390 a): menü, ana sayfa kartları ve rolle sınırlı şerit; yetki değişmez.
  const rolGorunumu = etkinGorunum(kullanici.roller);
  const panoIslemleri = kapaliIslemler.size === 0 ? kullanici.islemler : kullanici.islemler.filter((i) => !kapaliIslemler.has(i));
  return (
    <BrowserRouter>
      <BildirimSayfaIzleyici />
      <AcilisYonlendirmesi hedef={acilis} />
      <Karsilama kisiId={kullanici.id} ad={kullanici.ad} />
      <Kabuk
        sayfalar={sayfalar}
        kullaniciAdi={kullanici.ad}
        islemler={kullanici.islemler}
        kapali={kapali}
        logo={logo.data?.logo ?? null}
        anaSayfa={acilis ?? '/'}
        ustEylemler={ustEylemler}
        ustSeritler={rolSeritleri(ustSeritler, kullanici.roller)}
        hizliIsler={hizliIsler}
        komutlar={komutlar}
        kisiId={kullanici.id}
        menuSirasi={rolGorunumu.sayfalar === null ? undefined : rolGorunumu.sayfaSirasi}
        cikis={() => cikis.mutate(undefined, { onError: (hata) => bildir('hata', hataIletisi(hata, 'Çıkış yapılamadı')) })}
      >
        <EkranAlani>
          <AdresKorumasi islemler={kullanici.islemler}>
          <Routes>
            <Route path="/" element={<AnaSayfa kartlar={rolKartlari(kartlar, rolGorunumu.kartlar)} kaynaklar={rolKaynaklari(anaSayfaKaynaklari, rolGorunumu.kaynaklar)} islemler={panoIslemleri} ad={kullanici.ad} />} />
            {plan.ekranlar.map((r) => (
              <Route key={r.yol} path={r.yol} element={r.kalici === true ? null : <r.ekran />} />
            ))}
            {plan.yerTutucular.map((s) => (
              <Route key={s.yol} path={s.yol} element={<YapimAsamasinda baslik={s.baslik} />} />
            ))}
            <Route path="*" element={<SayfaYok islemler={kullanici.islemler} />} />
          </Routes>
          </AdresKorumasi>
        </EkranAlani>
        <KaliciEkranlar rotalar={plan.ekranlar.filter((r) => r.kalici === true)} />
      </Kabuk>
    </BrowserRouter>
  );
}

// rotalar, kartlar: testin keşfi beklemeden kendi rotasını ve kartını verebilmesi için; uygulama varsayılanı kullanır.
export function App({ rotalar = modulRotalari, kartlar = anaSayfaKartlari }: {
  rotalar?: readonly ModulRotasi[];
  kartlar?: readonly AnaSayfaKarti[];
}) {
  const [istemci] = useState(sorguIstemcisi);
  useEffect(() => baglantiDonusunuDinle(() => { void istemci.invalidateQueries(); }), [istemci]);
  return (
    <QueryClientProvider client={istemci}>
      <BildirimSaglayici>
        <Icerik rotalar={rotalar} kartlar={kartlar} />
        <AcilisGosterisi />
      </BildirimSaglayici>
    </QueryClientProvider>
  );
}
