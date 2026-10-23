import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { DurumKutusu, YalitilmisCerceve, yalitimOnBetigi } from '../../ortak/arayuz/index.ts';
import { ApiHatasi, hataIletisi } from '../../ortak/veri/api.ts';
import { useOturum } from '../../ortak/veri/oturum.ts';
import { useTema } from '../../ortak/veri/tema.ts';
import { adrestekiGorunum, disSayfaYolu, malzemeEtiketiYolu, type KatalogGorunumu } from './gorunumler.ts';
import { BIRIM_DONUSUMU_EKI } from './birim-donusumu-eki.ts';
import { ETIKET_MERKEZI_EKI } from './etiket-merkezi-eki.ts';
import { kopruKur } from './kopru.ts';
import { KG_FIYATI_EKI } from './kg-fiyati-eki.ts';
import { ROTALI_KART_EKI } from './rotali-kart-eki.ts';
import { YAZI_TIPLERI, yaziTipiStili } from './yazi-tipleri.ts';
import './malzemeler.css';

// Prototip (Malzeme Kataloğu) birebir yerleşir: kendi arayüzüyle yalıtılmış çerçevede açılır (TMI oturumuna,
// sayfasına ve deposuna erişemez), verisi yalnız köprüyle TMI'ye yazılır.
// Pencere adı gömülü modu açar; içerik politikası dışarıya her isteği kapatır (kırmızı çizgi: dış servis yok).
export const CERCEVE_ADI = 'tmi-malzemeler';
// Yazı tipi yalnız gömülü veriden: opak kökenden TMI adresine yazı tipi isteğini tarayıcı reddeder.
const POLITIKA = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; font-src data:; img-src 'self' data: blob:; media-src blob: mediastream:; connect-src 'none'; form-action 'none'; base-uri 'none'";

// Prototipin görünüm şeridi TMI'nin ikinci menüsüyle aynıdır; iki menü görünmesin diye çerçevede gizlenir (dosyasına dokunulmaz).
function hataKodu(e: unknown): { kod?: 'cakisma' | 'kategori-yok' | 'gerekce-kisa' } {
  if (!(e instanceof ApiHatasi)) return {};
  if (e.durum === 409) return { kod: 'cakisma' };
  if (e.durum !== 400) return {};
  if (e.govde.alan === 'kayit.g.kat') return { kod: 'kategori-yok' };
  return e.govde.alan === 'ozet.mukerrer_gerekcesi' ? { kod: 'gerekce-kisa' } : {};
}

// Ekran yalnız sunucunun kendi iletisini olduğu gibi gösterir (#234 madde 18); köprünün iç hatası genel iletiyle kalır.
function sunucuIletisiMi(e: unknown): { sunucuIletisi?: true } {
  return e instanceof ApiHatasi && e.sunucuIletisi !== null ? { sunucuIletisi: true } : {};
}

export const SERIT_GIZLE = '.top .views{display:none !important}';

// Prototip gömülü modda geniş ekranda kendi yan menüsünü açar (`html.yanmenu`); TMI'nin ikinci menüsüyle yan yana üç gezinme olurdu.
// Sınıf, prototipin başlıktaki betiği koyduktan sonra kaldırılır: araçlar (QR okut, Ayarlar, birim, not) prototipin dar ekran düzeniyle
// üst satırda kalır, hiçbiri gizlenmez (kullanıcı kararı B3 = a, 08.10.2026).
export const YAN_MENU_KAPAT = "<script>document.documentElement.classList.remove('yanmenu')</script>";

// Prototip QR çözücüyü (`window.jsQR`) yoksa dış adresten yüklemeye çalışır; politika bunu kapatır. Depodaki aynı sürüm (jsqr 1.4.0)
// prototipten önce sayfaya gömülür, böylece prototip dışarı gitmez (kırmızı çizgi).
export function qrKitapligi(kaynak: string): string {
  return `<script>${kaynak.replace(/<\/script/gi, '<\\/script')}</script>`;
}

// Ön betik en başta: prototipin tercih ve taslak deposu, kendi betikleri çalışmadan önce yerinde olmalı.
// Ek, prototipin betiğinden sonra gövdenin sonuna konur: prototipin genel işlevlerini sarabilmesi için onlar tanımlanmış olmalı.
export function sayfaKur(prototip: string, yaziStili: string = yaziTipiStili(), kitaplik = '', ek = ''): string {
  const bas = `${yalitimOnBetigi()}\n<meta http-equiv="Content-Security-Policy" content="${POLITIKA}">\n<style>${yaziStili}\n${SERIT_GIZLE}</style>\n${kitaplik}`;
  const sayfa = prototip.replace(/<head>/i, `<head>\n${bas}`).replace(/<\/head>/i, `${YAN_MENU_KAPAT}\n</head>`);
  return ek ? sayfa.replace(/<\/body>(?![\s\S]*<\/body>)/i, `${ek}\n</body>`) : sayfa;
}

function base64(veri: Uint8Array): string {
  let ikili = '';
  for (let i = 0; i < veri.length; i += 0x8000) ikili += String.fromCharCode(...veri.subarray(i, i + 0x8000));
  return btoa(ikili);
}

// Yazı tiplerini uygulama kendi kökeninden okur ve stile veri olarak gömer. Okunamayan tip atlanır: ekran yedek
// yazı tipiyle açılır, açılmamazlık etmez.
export async function gomuluYaziStili(): Promise<string> {
  let stil = yaziTipiStili();
  await Promise.all(YAZI_TIPLERI.map(async (y) => {
    try {
      const cevap = await fetch(y.adres);
      if (!cevap.ok) return;
      const veri = base64(new Uint8Array(await cevap.arrayBuffer()));
      stil = stil.replace(`url(${y.adres})`, `url(data:font/woff2;base64,${veri})`);
    } catch { /* yedek yazı tipi */ }
  }));
  return stil;
}

interface Istek { id?: unknown; tip: string; veri?: unknown }

function istekMi(veri: unknown): veri is Istek {
  if (veri === null || typeof veri !== 'object') return false;
  const m = veri as Record<string, unknown>;
  return m['kanal'] === 'hammadde' && m['yon'] === 'istek' && typeof m['tip'] === 'string';
}

// Adres görünümü seçer (ikinci menü); tanımsız alt adres köke döner.
export function MalzemeKatalogu() {
  const { pathname } = useLocation();
  const gezin = useNavigate();
  const gorunum = adrestekiGorunum(pathname);
  useEffect(() => {
    if (gorunum === null) void gezin('/malzemeler', { replace: true });
  }, [gorunum, gezin]);
  return <KatalogCercevesi gorunum={gorunum ?? 'cat'} sinif="tc-malzeme-cerceve" />;
}

// Prototip çerçevesi: görünümü dışarıdan alır. Aynı çerçeve Sistem Ayarları'nda yalnız ayar görünümüyle açılır (ayar-ekranlari.tsx).
export function KatalogCercevesi({ gorunum, sinif }: { gorunum: KatalogGorunumu; sinif: string }) {
  const oturum = useOturum();
  const { tema } = useTema();
  const [sayfa, setSayfa] = useState<string | null>(null);
  const gezin = useNavigate();
  // Çerçeve bir kez yüklenir: görünüm ilk açılışta hazır cevabıyla, sonra olayla gider; prototipteki yarım iş kaybolmaz.
  const gorunumRef = useRef(gorunum);
  gorunumRef.current = gorunum;
  const yanitlaRef = useRef<((ileti: unknown) => void) | null>(null);

  useEffect(() => {
    yanitlaRef.current?.({ kanal: 'hammadde', yon: 'olay', tip: 'gorunum', veri: gorunum });
  }, [gorunum]);

  useEffect(() => {
    let bitti = false;
    void Promise.all([
      import('./katalog/katalog.html?raw'), gomuluYaziStili(), import('../../../../node_modules/jsqr/dist/jsQR.js?raw'),
    ]).then(([m, yaziStili, qr]) => { if (!bitti) setSayfa(sayfaKur(m.default, yaziStili, qrKitapligi(qr.default), qrKitapligi(KG_FIYATI_EKI) + qrKitapligi(ROTALI_KART_EKI) + qrKitapligi(ETIKET_MERKEZI_EKI) + qrKitapligi(BIRIM_DONUSUMU_EKI))); });
    return () => { bitti = true; };
  }, []);

  const kullanici = oturum.data;
  const etiketMerkezi = (kullanici?.islemler ?? []).includes('sayfa.etiket-merkezi');
  const isle = useMemo(
    () => (kullanici ? kopruKur({ kullanici: { id: kullanici.id, ad: kullanici.ad }, islemler: kullanici.islemler, tema: tema === 'dark' ? 'koyu' : 'acik' }) : null),
    [kullanici, tema],
  );

  if (oturum.isPending || sayfa === null) return <DurumKutusu durum="yukleniyor" />;
  if (!kullanici || !isle) return <DurumKutusu durum="hata" mesaj="Oturum bulunamadı." />;

  const iletiGeldi = (veri: unknown, yanitla: (ileti: unknown) => void) => {
    if (!istekMi(veri)) return;
    yanitlaRef.current = yanitla;
    const yanit = (ok: boolean, govde: Record<string, unknown>) => { yanitla({ kanal: 'hammadde', yon: 'yanit', id: veri.id, ok, ...govde }); };
    // Çerçeve kabuğun adresini değiştiremez; başka modülün sayfasına giden bağlantı buradan, yalnız bilinen anahtarla.
    // Excel kitaplığı depodaki sürümüdür (exceljs 4.4.0) ve yalnız Excel açılınca çerçeveye metin olarak gider; prototip dış adrese gitmez.
    if (veri.tip === 'kitaplik-excel') {
      void import('../../../../node_modules/exceljs/dist/exceljs.min.js?raw').then(
        (m) => { yanit(true, { veri: m.default }); },
        () => { yanit(false, { hata: 'Excel kitaplığı yüklenemedi.' }); },
      );
      return;
    }
    if (veri.tip === 'git') {
      const yol = disSayfaYolu(veri.veri);
      if (yol === null) { yanit(false, { hata: 'Sayfa bulunamadı.' }); return; }
      yanit(true, { veri: null });
      void gezin(yol);
      return;
    }
    // 269 a: kartın etiketi Etiket Merkezi'nde; yalnız merkezi açabilen kullanıcıda, son okunan listedeki kartın no'suyla.
    if (veri.tip === 'etiket-merkezi') {
      if (!etiketMerkezi) { yanit(false, { hata: 'Sayfa bulunamadı.' }); return; }
      void isle('kart-no', veri.veri).then((no) => {
        const yol = malzemeEtiketiYolu(no);
        if (yol === null) { yanit(false, { hata: 'Kart bulunamadı.' }); return; }
        yanit(true, { veri: null });
        void gezin(yol);
      }, () => { yanit(false, { hata: 'Kart bulunamadı.' }); });
      return;
    }
    isle(veri.tip, veri.veri).then(
      (sonuc) => {
        const hazir = veri.tip === 'hazir' && sonuc !== null && typeof sonuc === 'object';
        yanit(true, { veri: hazir ? { ...sonuc, gorunum: gorunumRef.current, etiketMerkezi } : sonuc });
      },
      // Eski sürüm (409) ve listede olmayan kategori ayrı işaretlenir: prototip genel "tekrar dene" yerine sunucunun iletisini gösterir,
      // kategoride kategori açmaya yönlendirir.
      (e: unknown) => { yanit(false, { hata: hataIletisi(e, e instanceof Error ? e.message : 'İşlem yapılamadı.'), ...hataKodu(e), ...sunucuIletisiMi(e) }); },
    );
  };

  // İzinler prototipin kullandıklarıdır: dışa aktarım (indirme), etiket yazdırma (modal), QR okuma (kamera), kopyalama (pano).
  return (
    <YalitilmisCerceve
      key={tema}
      ad={CERCEVE_ADI}
      baslik="Malzeme Kataloğu"
      sinif={sinif}
      sayfa={sayfa}
      izinler={['allow-downloads', 'allow-modals']}
      yetenekler={['camera', 'clipboard-write']}
      iletiGeldi={iletiGeldi}
    />
  );
}
