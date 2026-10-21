import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import type { BenCevabi, KayitlarCevabi } from '#paylasilan/sozlesme/recete-rota.ts';
import { DurumKutusu, Simge, YalitilmisCerceve, useBildirim } from '../../ortak/arayuz/index.ts';
import { api, hataIletisi } from '../../ortak/veri/api.ts';
import { useOturum } from '../../ortak/veri/oturum.ts';
import { useTema } from '../../ortak/veri/tema.ts';
import { useYalitilmisGorunum } from '../../ortak/rota/cerceve-gorunumu.ts';
import { cerceveBetigi } from './cerceve-kopru.ts';
import type { CerceveAyari } from './cerceve-kopru.ts';
import type { AcilisSecenekleri } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import { cihazDegerleriOku, kopruHatasi, kopruKur } from './kopru.ts';
import type { AcilDeneme, AcilMusteri, EmirSecimi } from './kopru.ts';
import { EmirProjeSecimi } from './EmirProjeSecimi.tsx';
import { AcilMusteriSecimi } from './AcilMusteriSecimi.tsx';
import { gomuluYaziStili } from './yazi-tipleri.ts';
import { PLANLAMA_ISLEMI, planlamaYoluMu } from './planlama-menusu.ts';
import './recete-rota.css';

// Reçete ve Rota Motoru prototipi olduğu gibi yalıtılmış çerçevede açılır (TMI oturumuna, sayfasına ve deposuna erişemez); veri
// yalnız köprüyle TMI uçlarına gider (cerceve-kopru.ts çerçevede, kopru.ts kabukta).
// İçerik politikası dışarıya her isteği, form gönderimini ve taban adres değişimini kapatır (dış servis yok). Yazı tipi
// yalnız gömülü veriden: opak kökenden TMI adresine yazı tipi isteğini tarayıcı reddeder.
// Planlama motoru sayfanın kendi kurduğu iş parçacığında (blob:) koşar; iş parçacığı bu politikayı devralır, dışarı istek yine kapalıdır.
const POLITIKA = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; font-src data:; img-src data: blob:; media-src data: blob:; connect-src 'none'; worker-src blob:; frame-src 'none'; form-action 'none'; base-uri 'none'";
// Planlama çerçevesi ayrıca 'wasm-unsafe-eval' ister: HiGHS WebAssembly'dir (361 b); ikili kabuktan gelir, ağ yine kapalıdır.
export const PLANLAMA_POLITIKASI = POLITIKA.replace("script-src 'unsafe-inline'", "script-src 'unsafe-inline' 'wasm-unsafe-eval'");
export const KOK = '/recete-rota';
const KANAL = 'recete-rota';
// Çerçevenin gidebileceği sayfalar: malzeme yalnız Malzemeler ve Hizmetler'de açılır; istasyonun plan ayarı ve makine durumu İstasyonlar'da,
// vardiya, tatil ve kişi vardiyası Vardiya'da düzenlenir.
const GIDILEBILIR_YOLLAR: readonly string[] = ['/malzemeler', '/malzemeler/yeni', '/istasyonlar/is-merkezleri', '/istasyonlar/makineler', '/vardiya', '/vardiya/personel'];
// Emrin adımı içeriye ya da fasona emrin ayrıntısında alınır; çerçeve yalnız sayı kimlikli emir ayrıntısına gidebilir.
const gidilebilirMi = (yol: string): boolean => GIDILEBILIR_YOLLAR.includes(yol) || /^\/uretim-emirleri\/[1-9]\d{0,9}$/.test(yol);
const OKUMA_ISLEMLERI = ['sayfa.recete-rota', 'recete-rota.oku', 'recete-rota.yaz'];
// GET /plan/bedel-ayari yetkisi (237 a); yetkiyi sunucu verir, burası yalnız paneli çizip çizmemeyi seçer.
const BEDEL_OKUMA_ISLEMLERI = ['plan.yaz', 'plan.bedel-ayari', 'siparisler.fiyat-oku'];
// Sözleşmedeki önekle aynı (paylasilan/sozlesme/recete-rota.ts ANAHTAR_ONEKI); istemci sözleşmeyi değer olarak ithal etmez.
export const ONEK = 'recete-rota-motoru-v1';
// Sunucunun JSON gövde sınırı 1 MiB'dir; zarf ve kaçış payı bırakılır.
const AZAMI_BAYT = 1_000_000;
const CATISMA = 'Reçete ve rota kayıtları başka bir kişi tarafından değiştirildi; son değişikliğiniz kaydedilmedi. Sayfayı yenileyin.';
const BUYUK = 'Reçete ve rota kaydı 1 MB sınırını aştı ve sunucuya yazılamadı. Eski emirleri ya da plan stüdyosu senaryolarını silip yeniden deneyin.';
// Cihaza özel anahtarlar: operatör ekranının istasyon, makine ve kişi seçimi ("bu cihazda hatırlanır") ve plan
// stüdyosu tanıtımının görüldüğü. Ortak kayda giderlerse iki tablet birbirinin seçimini ezer ve sürüm çatışmasıyla yazma durur.
// Planlama çerçevesinin ekran tercihleri (açık sayfa, yakınlık, raf, menü, tema) de cihazdadır.
export const PLANLAMA_ANAHTARI = `${ONEK}:planlama`;
export const CIHAZ_ANAHTARLARI: readonly string[] = [`${ONEK}:op`, `${ONEK}:studio:intro`,
  ...['-ui4', '-mz', '-tk', '-br', '-nb', '-tema'].map((ek) => PLANLAMA_ANAHTARI + ek)];
const KAYIT_YAZISI = 'TMI\'de kayıtlı';
const OTURUM = 'Oturumunuz kapandı ya da yazma yetkiniz kalmadı; son değişiklikleriniz kaydedilmedi. Sayfayı yenileyip yeniden giriş yapın.';
const RET = 'Son değişikliğiniz sunucu tarafından reddedildi ve kaydedilmedi. Sonraki değişiklikte yeniden denenir; sürerse sayfayı yenileyin.';
const KAYDEDILMEDI = 'Son değişiklikler kaydedilmedi';
// Art arda değişiklikler tek yazmada birleşir: her yazma bütün belgeyi gönderir, aralık uzadıkça yazma seyrekleşir (kullanıcıya görünmez).
const BEKLEME_MS = 2000;
// Sunucu yanıt vermezse istek düşer: asılı tek istek komut ve kayıt zincirini kilitlemesin. Okuma sınırının (5 sn) çok üstünde.
const ZAMAN_ASIMI_MS = 30_000;
const SEKME_YAZISI = 'Yalnız bu sekmede (yazma yetkiniz yok)';
export const PLAN_VERISI_YOK = 'Plan için istasyon, makine ve iş merkezi verileri bu rolde okunamıyor; plan eksik veriyle çizilmez.';
// Planı istasyon, makine ve iş merkezinden çizen sekmeler (ikinci menü yolları). Ürün ve rota sekmeleri bu verisiz de doğrudur.
const PLAN_SEKMELERI = /^\/recete-rota\/(?:plan|kanban|studio)(?:\/|$)/;
export const MOTOR_OKUNAMADI = 'Plan motorunun yerleşimi okunamadı; plan ekranı kendi hesabıyla çiziliyor ve sıra sunucunun planından farklı olabilir. Canlıya almadan önce sayfayı yenileyin.';
// Rota modülünün `rota.onayla` işlemine giden düğmeler (onayla, düzeltmeye geri gönder, yürürlüğe al; sunucu/moduller/rota/uclar.ts).
// İşlemi olmayan kişiye gösterilmez: planlamacı "Onayla…" görüp 403 almasın (Akış A provası O1).
export const ONAY_DUGMELERI: readonly string[] = [
  '[data-act="revPanel"][data-v="approve"]', '[data-act="revApprove"]', '[data-act="revApproveOnly"]', '[data-act="revReturn"]', '[data-act="revActivate"]',
];
// Plan modülünün `plan.yaz` işlemine giden düğmeler: plan Canlıya al (kuyruğu yazar; canlıya alma yetkisi yoksa taslakta kalır) ve plan
// ayarlarının Düzenle yazısı. Senaryonun canlıya alması doğrudan `plan.canliya-al` ister. Yetkisiz kişi 403 almak için basmasın (plan akışı H6).
export const PLAN_YAZMA_DUGMELERI: readonly string[] = ['[data-act="planYaz"]', '#planCfg .cfg-ed'];
export const SENARYO_CANLIYA_ALMA_DUGMELERI: readonly string[] = ['[data-act="publishScenario"]'];
// Planlama çerçevesinde denemenin veri araçları: örnek veri yüklemek, içe aktarmak ve sıfırlamak ana tablonun (Reçete ve Rota kaydı)
// üstüne yazar. Uygulamada veri yalnız Reçete ve Rota bölümlerinden girer.
export const PLANLAMA_VERI_ARACLARI: readonly string[] = ['[data-act="set-yukle"]', '[data-act="iceri-ac"]', '[data-act="sifirla"]'];
// Çerçeve değişirken (Reçete ve Rota <-> planlama) eski çerçevenin bekleyen yazması sunucuya varsın: yeni çerçeve kaydı sonra okur.
const GECIS_MS = BEKLEME_MS + 1500;
type Tur = 'recete-rota' | 'planlama';

// Prototipin dış yazı tipi bağlantıları sayfadan çıkarılır (politika zaten kapatır; konsol hatası kalmasın), yerine gömülü
// yazı tipi gelir. Köprü ve politika belgenin başına, prototip betiklerinden önce konur.
// `sonStil` prototipin stillerinden sonra gelir (tema uyumu, rr-tema.css).
export function sayfaKur(prototip: string, betik: string, yaziStili: string, sonStil = '', politika = POLITIKA): string {
  const temiz = prototip.replace(/<link\b[^>]*fonts\.(?:googleapis|gstatic)\.com[^>]*>\s*/gi, '');
  const bas = `<meta http-equiv="Content-Security-Policy" content="${politika}">\n<style>${yaziStili}</style>\n${betik}\n`;
  // Değiştirme işlevle yapılır: metindeki $ dizileri değiştirme kalıbı olarak yorumlanmasın.
  const sayfa = temiz.replace(/<head>/i, () => `<head>\n${bas}`);
  return sonStil === '' ? sayfa : sayfa.replace(/<\/head>/i, () => `<style>${sonStil}</style>\n</head>`);
}

// Kayıtlar prototipin yazdığı metne geri çevrilir: json biçimi yeniden metne, metin biçimi olduğu gibi.
export function yerelDegerler(cevap: KayitlarCevabi): CerceveAyari['degerler'] {
  const sonuc: Record<string, { deger: string; surum: number }> = {};
  for (const k of cevap.kayitlar) {
    if (!k.anahtar.startsWith(ONEK)) continue;
    if (k.bicim === 'metin' && typeof k.deger !== 'string') continue;
    sonuc[k.anahtar] = { deger: k.bicim === 'metin' ? k.deger as string : JSON.stringify(k.deger), surum: k.surum };
  }
  return sonuc;
}

interface Hazirlik { tur: Tur; ben: BenCevabi; degerler: CerceveAyari['degerler'] }
interface Prototip { sayfa: string; yaziStili: string; sonStil: string }

// Reçete ve Rota prototipi ile planlama sayfası ayrı parça olarak, yalnız açılınca yüklenir.
async function prototipYukle(tur: Tur): Promise<Prototip> {
  if (tur === 'planlama') {
    const [m, p] = await Promise.all([import('./cerceve/planlama-modulu.html?raw'), import('./planlama-sayfasi.ts')]);
    return { sayfa: p.planlamaSayfasiKur(m.default), yaziStili: await p.planlamaYaziStili(), sonStil: '' };
  }
  // Tema uyumu uygulamanın yazı tipini de ister (rr-tema.css --font-ana).
  const [m, tema, p, yazi] = await Promise.all([
    import('./cerceve/recete-rota-motoru.html?raw'), import('./rr-tema.ts'), import('./planlama-sayfasi.ts'), gomuluYaziStili(),
  ]);
  return { sayfa: m.default, yaziStili: `${yazi}\n${await p.planlamaYaziStili()}`, sonStil: tema.RR_TEMA_STILI };
}

export function ReceteRotaCercevesi() {
  const oturum = useOturum();
  const { tema } = useTema();
  const { pathname } = useLocation();
  const istenenTur: Tur = planlamaYoluMu(pathname) ? 'planlama' : 'recete-rota';
  // Açık çerçevenin türü; adres öteki türe geçince eski çerçeve GECIS_MS ve yoldaki kayıt yazmaları bitene kadar durur.
  const [tur, setTur] = useState<Tur>(istenenTur);
  const yoldakiYazma = useRef(0);
  const [prototip, setPrototip] = useState<Prototip | null>(null);
  const [hazirlik, setHazirlik] = useState<Hazirlik | null>(null);
  const [hata, setHata] = useState<string | null>(null);
  const [deneme, setDeneme] = useState(0);
  const gorunumIletisi = useYalitilmisGorunum(KOK);
  const git = useNavigate();
  // Okuma yetkisi olmayan rolde prototip planı boş listelerle çizer ve sahte değer gösterir (plan akışı H4): kabuk o sekmelerde
  // çerçeveyi gizler (köprü sürer) ve nedenini söyler.
  const [planVerisiYok, setPlanVerisiYok] = useState(false);
  const planGizli = planVerisiYok && PLAN_SEKMELERI.test(pathname);
  // Motorun uygulayamadığı kısıt (307 a): plan yine çizilir; uyarı plan sekmelerinde kalıcı durur, kapanınca sonraki okumada geri gelir.
  const [motorUyarilari, setMotorUyarilari] = useState<readonly string[]>([]);
  const uyariGorunur = !planGizli && motorUyarilari.length > 0 && PLAN_SEKMELERI.test(pathname);
  const kullanici = oturum.data;
  // Planlama sayfası ayrıca planlama işlemini ister (353 a); işlemi olmayana çerçeve kurulmaz, kayıt okunmaz.
  const girebilir = (kullanici?.islemler.some((i) => OKUMA_ISLEMLERI.includes(i)) ?? false)
    && (istenenTur !== 'planlama' || (kullanici?.islemler.includes(PLANLAMA_ISLEMI) ?? false));
  const onaylayabilir = kullanici?.islemler.includes('rota.onayla') ?? false;
  const planYazabilir = kullanici?.islemler.includes('plan.yaz') ?? false;
  const canliyaAlabilir = kullanici?.islemler.includes('plan.canliya-al') ?? false;
  const bedelAyariOkunur = kullanici?.islemler.some((i) => BEDEL_OKUMA_ISLEMLERI.includes(i)) ?? false;

  useEffect(() => {
    if (istenenTur === tur) return undefined;
    let bekleme = 0;
    const gec = (): void => {
      if (yoldakiYazma.current > 0) { bekleme = window.setTimeout(gec, 250); return; }
      setPrototip(null); setHazirlik(null); setTur(istenenTur);
    };
    bekleme = window.setTimeout(gec, GECIS_MS);
    return () => { window.clearTimeout(bekleme); };
  }, [istenenTur, tur]);

  // Prototip (Reçete ve Rota yaklaşık 480 KB, planlama yaklaşık 2,3 MB) yalnız bu ekran açılınca ayrı parça olarak yüklenir.
  useEffect(() => {
    let bitti = false;
    prototipYukle(tur).then(
      (p) => { if (!bitti) setPrototip(p); },
      () => { if (!bitti) setHata('Reçete ve Rota yüklenemedi. Sayfayı yenileyin.'); },
    );
    return () => { bitti = true; };
  }, [tur]);

  // Kimlik ve kayıtlar çerçeve kurulmadan önce okunur: prototip yerel deposunu açılışta eşzamanlı okur.
  useEffect(() => {
    if (!kullanici || !girebilir) return;
    let bitti = false;
    void (async () => {
      try {
        const [ben, kayitlar] = await Promise.all([
          api.get<BenCevabi>('/recete-rota/ben'),
          api.get<KayitlarCevabi>('/recete-rota/kayitlar'),
        ]);
        if (!bitti) setHazirlik({ tur, ben, degerler: yerelDegerler(kayitlar) });
      } catch (e) {
        if (!bitti) setHata(hataIletisi(e, 'Reçete ve Rota açılamadı.'));
      }
    })();
    return () => { bitti = true; };
  }, [kullanici, girebilir, deneme, tur]);

  // Sayfa bir kez kurulur: yeniden kurulum çerçeveyi yeniden yükler ve açılıştaki kayıtlar eskimiş olur. Tema yalnız açılışta
  // geçer.
  const [ilkTema] = useState(tema);
  const sayfa = useMemo(() => {
    if (prototip === null || hazirlik === null || hazirlik.tur !== tur) return null;
    const planlama = tur === 'planlama';
    return sayfaKur(prototip.sayfa, cerceveBetigi({
      kanal: KANAL,
      yazabilir: hazirlik.ben.yazabilir,
      onek: ONEK,
      degerler: hazirlik.degerler,
      cihazAnahtarlari: CIHAZ_ANAHTARLARI,
      cihazDegerleri: cihazDegerleriOku(CIHAZ_ANAHTARLARI),
      catismaIletisi: CATISMA,
      buyukIletisi: BUYUK,
      azamiBayt: AZAMI_BAYT,
      beklemeMs: BEKLEME_MS,
      tema: ilkTema === 'dark' ? 'dark' : 'light',
      kayitYazisi: hazirlik.ben.yazabilir ? KAYIT_YAZISI : SEKME_YAZISI,
      kayitUyari: !hazirlik.ben.yazabilir,
      kisiAdi: hazirlik.ben.kisi.ad,
      oturumIletisi: OTURUM,
      reddIletisi: RET,
      kaydedilmediYazisi: KAYDEDILMEDI,
      zamanAsimiMs: ZAMAN_ASIMI_MS,
      gizliSeciciler: planlama ? PLANLAMA_VERI_ARACLARI : [
        ...(onaylayabilir ? [] : ONAY_DUGMELERI),
        ...(planYazabilir ? [] : PLAN_YAZMA_DUGMELERI),
        ...(canliyaAlabilir ? [] : SENARYO_CANLIYA_ALMA_DUGMELERI),
      ],
      bedelAyariOkunur,
      highsOkunur: planlama,
    }), prototip.yaziStili, prototip.sonStil, planlama ? PLANLAMA_POLITIKASI : undefined);
  }, [prototip, hazirlik, tur, ilkTema, onaylayabilir, planYazabilir, canliyaAlabilir, bedelAyariOkunur]);
  const kartTaslakAcabilir = kullanici?.islemler.includes('rota.yaz') ?? false;
  const bedelAyariYazabilir = kullanici?.islemler.includes('plan.bedel-ayari') ?? false;
  // Emir açılışında proje seçimi (224): köprü pencereyi sorar, cevabı bekler. Pencere başka bir istek gelince açık kalırsa önceki
  // soru vazgeçilmiş sayılır (tek pencere).
  const [secim, setSecim] = useState<{ secenekler: AcilisSecenekleri; coz: (s: EmirSecimi | null) => void } | null>(null);
  const secimRef = useRef(secim);
  secimRef.current = secim;
  // Acil sipariş denemesinin müşterisi (286 b): canlıya almadan önce aynı biçimde sorulur.
  const [acil, setAcil] = useState<{ denemeler: AcilDeneme[]; coz: (s: AcilMusteri[] | null) => void } | null>(null);
  const acilRef = useRef(acil);
  acilRef.current = acil;
  const { bildir } = useBildirim();
  const acikTur = useRef(tur);
  acikTur.current = tur;
  const isle = useMemo(() => kopruKur(CIHAZ_ANAHTARLARI, {
    kartTaslakAcabilir,
    highsVerilir: () => acikTur.current === 'planlama',
    bedelAyariYazabilir,
    motorDurumu: (okunamadi) => { if (okunamadi) bildir('hata', MOTOR_OKUNAMADI); },
    planVerisi: setPlanVerisiYok,
    motorUyarilari: setMotorUyarilari,
    emirSecimi: (secenekler) => new Promise<EmirSecimi | null>((coz) => {
      secimRef.current?.coz(null);
      setSecim({ secenekler, coz });
    }),
    acilMusteriSecimi: (denemeler) => new Promise<AcilMusteri[] | null>((coz) => {
      acilRef.current?.coz(null);
      setAcil({ denemeler, coz });
    }),
  }), [kartTaslakAcabilir, bedelAyariYazabilir, bildir]);

  // Kaynak ve köken denetimini YalitilmisCerceve yapar (yalnız bu çerçeve, opak köken); burada yalnız bilinen kanallar geçer.
  const iletiGeldi = (veri: unknown, yanitla: (ileti: unknown) => void) => {
    if (gorunumIletisi(veri, yanitla)) return;
    const m = veri as { kanal?: unknown; yon?: unknown; id?: unknown; tip?: unknown; veri?: unknown; tus?: unknown } | null;
    // Çerçevede basılan Ctrl K: kabuğun arama kutusu pencerenin tuş olayını dinler; aynı tuş burada yeniden verilir.
    if (m?.kanal === KANAL && m.yon === 'kisayol' && m.tus === 'arama') {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true, cancelable: true }));
      return;
    }
    if (m?.kanal === KANAL && m.yon === 'git') {
      const yol = (m as { yol?: unknown }).yol;
      if (typeof yol === 'string' && gidilebilirMi(yol)) void git(yol);
      return;
    }
    if (!m || m.kanal !== KANAL || m.yon !== 'istek' || typeof m.tip !== 'string' || typeof m.id !== 'number') return;
    const yanit = (govde: Record<string, unknown>) => { yanitla({ kanal: KANAL, yon: 'yanit', id: m.id, ...govde }); };
    const kayit = m.tip === 'kayit-yaz' || m.tip === 'kayit-sil';
    if (kayit) yoldakiYazma.current += 1;
    isle(m.tip, m.veri).finally(() => { if (kayit) yoldakiYazma.current -= 1; }).then(
      (sonuc) => { yanit({ ok: true, veri: sonuc }); },
      (e: unknown) => { yanit({ ok: false, ...kopruHatasi(e) }); },
    );
  };

  if (oturum.isPending) return <div className="tc-recete-rota-durum"><DurumKutusu durum="yukleniyor" /></div>;
  if (!kullanici) return <div className="tc-recete-rota-durum"><DurumKutusu durum="hata" mesaj="Oturum bulunamadı." /></div>;
  if (!girebilir) return <div className="tc-recete-rota-durum"><DurumKutusu durum="hata" mesaj="Bu bölümü görme yetkiniz yok." /></div>;
  if (hata !== null) {
    return (
      <div className="tc-recete-rota-durum">
        <DurumKutusu durum="hata" mesaj={hata} yenile={() => { setHata(null); setDeneme((d) => d + 1); }} />
      </div>
    );
  }
  if (sayfa === null) return <div className="tc-recete-rota-durum"><DurumKutusu durum="yukleniyor" /></div>;
  // Geçişte eski çerçeve aynı yerde gizli durur (yeniden kurulmaz): bekleyen yazması kabuğa ulaşsın.
  const gecis = istenenTur !== tur;
  return (
    <div className="tc-recete-rota">
      {gecis && <div className="tc-recete-rota-durum"><DurumKutusu durum="yukleniyor" /></div>}
      {!gecis && planGizli && <div className="tc-recete-rota-durum"><DurumKutusu durum="hata" mesaj={PLAN_VERISI_YOK} /></div>}
      {!gecis && uyariGorunur && (
        <ul className="tc-rr-uyari" role="status" aria-label="Plan motoru uyarıları">
          {motorUyarilari.map((u) => <li key={u}><Simge ad="alert" />{u}</li>)}
        </ul>
      )}
      <div className="tc-recete-rota-alan" hidden={gecis || planGizli}>
        <YalitilmisCerceve
          key={tur}
          baslik={tur === 'planlama' ? 'Planlama' : 'Reçete ve Rota'}
          sinif="tc-recete-rota-cerceve"
          sayfa={sayfa}
          iletiGeldi={iletiGeldi}
        />
      </div>
      {secim && <EmirProjeSecimi secenekler={secim.secenekler} bitir={(s) => { setSecim(null); secim.coz(s); }} />}
      {acil && <AcilMusteriSecimi denemeler={acil.denemeler} bitir={(s) => { setAcil(null); acil.coz(s); }} />}
    </div>
  );
}
