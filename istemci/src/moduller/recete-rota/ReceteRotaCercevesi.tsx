import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { BenCevabi, KayitlarCevabi } from '#paylasilan/sozlesme/recete-rota.ts';
import { DurumKutusu, YalitilmisCerceve, useBildirim } from '../../ortak/arayuz/index.ts';
import { api, hataIletisi } from '../../ortak/veri/api.ts';
import { useOturum } from '../../ortak/veri/oturum.ts';
import { useTema } from '../../ortak/veri/tema.ts';
import { useYalitilmisGorunum } from '../../ortak/rota/cerceve-gorunumu.ts';
import { IKINCI_MENU_TANIMLARI, type IkinciMenu } from '../../ortak/rota/ikinci-menu.ts';
import { eskiAdresi } from './eski-adres.ts';
import { cerceveBetigi } from './cerceve-kopru.ts';
import type { CerceveAyari } from './cerceve-kopru.ts';
import type { AcilisSecenekleri } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import { cihazDegerleriOku, kopruHatasi, kopruKur } from './kopru.ts';
import type { AcilDeneme, AcilMusteri, EmirSecimi } from './kopru.ts';
import { EmirProjeSecimi } from './EmirProjeSecimi.tsx';
import { AcilMusteriSecimi } from './AcilMusteriSecimi.tsx';
import { gomuluYaziStili } from './yazi-tipleri.ts';
import './recete-rota.css';

// Reçete ve Rota Motoru prototipi olduğu gibi yalıtılmış çerçevede açılır (TMI oturumuna, sayfasına ve deposuna erişemez); veri
// yalnız köprüyle TMI uçlarına gider (cerceve-kopru.ts çerçevede, kopru.ts kabukta).
// İçerik politikası dışarıya her isteği, form gönderimini ve taban adres değişimini kapatır (dış servis yok). Yazı tipi
// yalnız gömülü veriden: opak kökenden TMI adresine yazı tipi isteğini tarayıcı reddeder.
const POLITIKA = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; font-src data:; img-src data: blob:; media-src data: blob:; connect-src 'none'; worker-src blob:; frame-src 'none'; form-action 'none'; base-uri 'none'";
export const KOK = '/recete-rota';
// Reçete ve Rota maddeleri yeni ekrandadır (541): çerçeve menünün görünümlerini eski adreste açar, çerçeve içindeki görünüm değişimi de
// adresi oraya çeker.
export const ESKI_MENULER: readonly IkinciMenu[] = IKINCI_MENU_TANIMLARI.map((m) => (m.kok !== KOK ? m : {
  ...m, gruplar: m.gruplar.map((g) => ({ ...g, maddeler: g.maddeler.map((d) => ({ ...d, yol: eskiAdresi(d.yol) })) })),
}));
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
export const CIHAZ_ANAHTARLARI: readonly string[] = [`${ONEK}:op`, `${ONEK}:studio:intro`];
const KAYIT_YAZISI = 'TMI\'de kayıtlı';
const OTURUM = 'Oturumunuz kapandı ya da yazma yetkiniz kalmadı; son değişiklikleriniz kaydedilmedi. Sayfayı yenileyip yeniden giriş yapın.';
const RET = 'Son değişikliğiniz sunucu tarafından reddedildi ve kaydedilmedi. Sonraki değişiklikte yeniden denenir; sürerse sayfayı yenileyin.';
const KAYDEDILMEDI = 'Son değişiklikler kaydedilmedi';
// Köprünün kabuğa ilettiği uyarılar (çerçevede modal izni yok): kabuk yalnız kendi verdiği bu metinleri gösterir.
const UYARILAR: readonly string[] = [CATISMA, BUYUK, OTURUM, RET];
// Art arda değişiklikler tek yazmada birleşir: her yazma bütün belgeyi gönderir, aralık uzadıkça yazma seyrekleşir (kullanıcıya görünmez).
const BEKLEME_MS = 2000;
// Sunucu yanıt vermezse istek düşer: asılı tek istek komut ve kayıt zincirini kilitlemesin. Okuma sınırının (5 sn) çok üstünde.
const ZAMAN_ASIMI_MS = 30_000;
const SEKME_YAZISI = 'Yalnız bu sekmede (yazma yetkiniz yok)';
export const MOTOR_OKUNAMADI = 'Plan motorunun yerleşimi okunamadı; plan ekranı kendi hesabıyla çiziliyor ve sıra sunucunun planından farklı olabilir. Canlıya almadan önce sayfayı yenileyin.';
// Rota modülünün `rota.onayla` işlemine giden düğmeler (onayla, düzeltmeye geri gönder, yürürlüğe al; sunucu/moduller/rota/uclar.ts).
// İşlemi olmayan kişiye gösterilmez: planlamacı "Onayla…" görüp 403 almasın (Akış A provası O1).
export const ONAY_DUGMELERI: readonly string[] = [
  '[data-act="revPanel"][data-v="approve"]', '[data-act="revApprove"]', '[data-act="revApproveOnly"]', '[data-act="revReturn"]', '[data-act="revActivate"]',
];
// Plan modülünün `plan.yaz` işlemine giden düğmeler: planın Onaya gönder'i (kuyruğu taslağa yazar, taslağı onaya gönderir) ve plan
// ayarlarının Düzenle yazısı. Yetkisiz kişi 403 almak için basmasın (plan akışı H6).
export const PLAN_YAZMA_DUGMELERI: readonly string[] = ['[data-act="planYaz"]', '#planCfg .cfg-ed'];
// Senaryonun "Onaya gönder"i (H0): gönderen plan.studyo taşır; canlıya alma yalnız Planlama stüdyosunun Onay sekmesindedir.
export const SENARYO_GONDERME_DUGMELERI: readonly string[] = ['[data-act="publishScenario"]'];

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

interface Hazirlik { ben: BenCevabi; degerler: CerceveAyari['degerler'] }
interface Prototip { sayfa: string; yaziStili: string; sonStil: string }

// Reçete ve Rota prototipi ayrı parça olarak, yalnız açılınca yüklenir.
async function prototipYukle(): Promise<Prototip> {
  // Tema uyumu uygulamanın yazı tipini de ister (rr-tema.css --font-ana).
  const [m, tema, p, yazi] = await Promise.all([
    import('./cerceve/recete-rota-motoru.html?raw'), import('./rr-tema.ts'), import('./planlama-sayfasi.ts'), gomuluYaziStili(),
  ]);
  return { sayfa: m.default, yaziStili: `${yazi}\n${await p.planlamaYaziStili()}`, sonStil: tema.RR_TEMA_STILI };
}

export function ReceteRotaCercevesi() {
  const oturum = useOturum();
  const { tema } = useTema();
  const yoldakiYazma = useRef(0);
  const [prototip, setPrototip] = useState<Prototip | null>(null);
  const [hazirlik, setHazirlik] = useState<Hazirlik | null>(null);
  const [hata, setHata] = useState<string | null>(null);
  const [deneme, setDeneme] = useState(0);
  const gorunumIletisi = useYalitilmisGorunum(KOK, ESKI_MENULER);
  const git = useNavigate();
  const kullanici = oturum.data;
  // Köprü yetkisi bilinen okumayı işlemi olmayana sormaz (195 a).
  const islemler = kullanici?.islemler;
  // İşlemi olmayana çerçeve kurulmaz, kayıt okunmaz.
  const girebilir = kullanici?.islemler.some((i) => OKUMA_ISLEMLERI.includes(i)) ?? false;
  const onaylayabilir = kullanici?.islemler.includes('rota.onayla') ?? false;
  const planYazabilir = kullanici?.islemler.includes('plan.yaz') ?? false;
  const senaryoGonderebilir = kullanici?.islemler.includes('plan.studyo') ?? false;
  const bedelAyariOkunur = kullanici?.islemler.some((i) => BEDEL_OKUMA_ISLEMLERI.includes(i)) ?? false;

  // Prototip (yaklaşık 480 KB) yalnız bu ekran açılınca ayrı parça olarak yüklenir.
  useEffect(() => {
    let bitti = false;
    prototipYukle().then(
      (p) => { if (!bitti) setPrototip(p); },
      () => { if (!bitti) setHata('Reçete ve Rota yüklenemedi. Sayfayı yenileyin.'); },
    );
    return () => { bitti = true; };
  }, []);

  // Kimlik ve kayıtlar çerçeve kurulmadan önce okunur: prototip yerel deposunu açılışta eşzamanlı okur.
  useEffect(() => {
    if (!kullanici || !girebilir) return;
    let bitti = false;
    void (async () => {
      try {
        const [ben, kayitlar] = await Promise.all([api.get<BenCevabi>('/recete-rota/ben'), api.get<KayitlarCevabi>('/recete-rota/kayitlar')]);
        if (!bitti) setHazirlik({ ben, degerler: yerelDegerler(kayitlar) });
      } catch (e) {
        if (!bitti) setHata(hataIletisi(e, 'Reçete ve Rota açılamadı.'));
      }
    })();
    return () => { bitti = true; };
  }, [kullanici, girebilir, deneme]);

  // Sayfa bir kez kurulur: yeniden kurulum çerçeveyi yeniden yükler ve açılıştaki kayıtlar eskimiş olur. Tema yalnız açılışta
  // geçer.
  const [ilkTema] = useState(tema);
  const sayfa = useMemo(() => {
    if (prototip === null || hazirlik === null) return null;
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
      gizliSeciciler: [
        ...(onaylayabilir ? [] : ONAY_DUGMELERI),
        ...(planYazabilir ? [] : PLAN_YAZMA_DUGMELERI),
        ...(senaryoGonderebilir ? [] : SENARYO_GONDERME_DUGMELERI),
      ],
      bedelAyariOkunur,
    }), prototip.yaziStili, prototip.sonStil);
  }, [prototip, hazirlik, ilkTema, onaylayabilir, planYazabilir, senaryoGonderebilir, bedelAyariOkunur]);
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
  const isle = useMemo(() => kopruKur(CIHAZ_ANAHTARLARI, {
    kartTaslakAcabilir,
    bedelAyariYazabilir,
    motorDurumu: (okunamadi) => { if (okunamadi) bildir('hata', MOTOR_OKUNAMADI); },
    emirSecimi: (secenekler) => new Promise<EmirSecimi | null>((coz) => {
      secimRef.current?.coz(null);
      setSecim({ secenekler, coz });
    }),
    acilMusteriSecimi: (denemeler) => new Promise<AcilMusteri[] | null>((coz) => {
      acilRef.current?.coz(null);
      setAcil({ denemeler, coz });
    }),
    ...(islemler === undefined ? {} : { islemler }),
  }), [kartTaslakAcabilir, bedelAyariYazabilir, bildir, islemler]);

  // Kaynak ve köken denetimini YalitilmisCerceve yapar (yalnız bu çerçeve, opak köken); burada yalnız bilinen kanallar geçer.
  const iletiGeldi = (veri: unknown, yanitla: (ileti: unknown) => void) => {
    if (gorunumIletisi(veri, yanitla)) return;
    const m = veri as { kanal?: unknown; yon?: unknown; id?: unknown; tip?: unknown; veri?: unknown; tus?: unknown } | null;
    // Çerçevede basılan Ctrl K: kabuğun arama kutusu pencerenin tuş olayını dinler; aynı tuş burada yeniden verilir.
    if (m?.kanal === KANAL && m.yon === 'kisayol' && m.tus === 'arama') {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true, cancelable: true }));
      return;
    }
    if (m?.kanal === KANAL && m.yon === 'uyari') {
      const metin = (m as { metin?: unknown }).metin;
      if (typeof metin === 'string' && UYARILAR.includes(metin)) bildir('hata', metin);
      return;
    }
    // Ortak kayıt açılışta bir kez okunur; çerçeve başkasının sonradan yazdığını görmek isteyince kayıt yeniden okunur ve sayfa yeniden kurulur.
    // Çerçevenin yoldaki yazmaları önce varır (çerçeve göndermeden önce bekleyenleri yazar).
    if (m?.kanal === KANAL && m.yon === 'yenile') {
      const yenile = (): void => {
        if (yoldakiYazma.current > 0) { window.setTimeout(yenile, 250); return; }
        setHazirlik(null); setDeneme((d) => d + 1);
      };
      yenile();
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
  return (
    <div className="tc-recete-rota">
      <div className="tc-recete-rota-alan">
        <YalitilmisCerceve baslik="Reçete ve Rota" sinif="tc-recete-rota-cerceve" sayfa={sayfa} iletiGeldi={iletiGeldi} />
      </div>
      {secim && <EmirProjeSecimi secenekler={secim.secenekler} bitir={(s) => { setSecim(null); secim.coz(s); }} />}
      {acil && <AcilMusteriSecimi denemeler={acil.denemeler} bitir={(s) => { setAcil(null); acil.coz(s); }} />}
    </div>
  );
}
