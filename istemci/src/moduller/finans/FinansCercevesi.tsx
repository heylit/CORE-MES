import { useEffect, useMemo, useRef, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { DurumKutusu, YalitilmisCerceve, yalitimOnBetigi } from '../../ortak/arayuz/index.ts';
import { useOturum } from '../../ortak/veri/oturum.ts';
import { useTema } from '../../ortak/veri/tema.ts';
import { useYalitilmisGorunum } from '../../ortak/rota/cerceve-gorunumu.ts';
import { IKINCI_MENU_TANIMLARI, ikinciMenuyuSuz, menuMaddeleri } from '../../ortak/rota/ikinci-menu.ts';
import { CERCEVE_KANALI, CERCEVE_SURUMU, cercevedenIletiMi, type KabuktanIleti } from '../../ortak/rota/cerceve-iletisi.ts';
import { kopruHatasi, kopruKur } from './kopru.ts';
import { gomuluYaziStili } from './yazi-tipleri.ts';
import { prototipYukle } from './prototip.ts';
import './finans.css';

// Finans prototipi olduğu gibi yalıtılmış çerçevede açılır (TMI oturumuna, sayfasına ve deposuna erişemez); menü kabuktadır
// (ikinci menü), veri yalnız köprüyle TMI uçlarına gider.
// İçerik politikası dışarıya her isteği, form gönderimini ve taban adres değişimini kapatır (dış servis yok).
// Yazı tipi yalnız gömülü veriden: opak kökenden TMI adresine yazı tipi isteğini tarayıcı reddeder.
const POLITIKA = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; font-src data:; img-src 'self' data: blob:; connect-src 'none'; form-action 'none'; base-uri 'none'";
export const KOK = '/finans';

export interface GomuluAyar {
  koken: string;
  kapsam: 'firma' | 'tam';
  islemler: readonly string[];
  kullanici: { id: number; ad: string };
  tema: 'light' | 'dark';
}

// Ayar betiğe JSON olarak gömülür; `<` ve satır ayırıcılar kaçırılır ki kişi adı betiği kapatamasın.
export function ayarBetigi(ayar: GomuluAyar): string {
  const json = JSON.stringify(ayar).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
  return `<script>window.__FINANS_GOMULU=${json};</script>`;
}

// Grafik kitaplığı (chart.js 4.4.1, MIT) yerel paketten satır içi betik olarak gelir; dış adres yok.
// Ön betik en başta: prototipin tema tercihi opak kökende de bellek içi depoda durur.
export function sayfaKur(prototip: string, ayar: GomuluAyar, grafik = '', yaziStili = ''): string {
  const kitaplik = grafik ? `<script>${grafik.replace(/<\/script/gi, '<\\/script')}</script>\n` : '';
  const bas = `${yalitimOnBetigi()}\n<meta http-equiv="Content-Security-Policy" content="${POLITIKA}">\n<style>${yaziStili}</style>\n${ayarBetigi(ayar)}\n${kitaplik}`;
  // Değiştirme işlevle yapılır: kitaplık metnindeki $ dizileri değiştirme kalıbı olarak yorumlanmasın.
  return prototip.replace(/<head>/i, () => `<head>\n${bas}`);
}

// Yetkisi olmayan alt adreste prototip başka görünüm (Firmalar) açıyordu: adres ile içerik ayrışıyordu. Kişi o maddenin
// işlemini taşımıyorsa açabildiği ilk maddeye gider; hiçbirini açamıyorsa null.
export function izinliYol(yol: string, islemler: readonly string[]): string | null {
  const menu = IKINCI_MENU_TANIMLARI.find((m) => m.kok === KOK);
  const suzulmus = menu === undefined ? null : ikinciMenuyuSuz(menu, islemler);
  const izinli = suzulmus === null ? [] : menuMaddeleri(suzulmus);
  const temiz = yol.length > 1 ? yol.replace(/\/+$/, '') : yol;
  if (izinli.some((m) => m.yol === temiz)) return temiz;
  return izinli[0]?.yol ?? null;
}

interface Ozellikler {
  // Verilirse çerçeve adresten değil bu ikinci menü maddesinden açılır ve içerideki geçiş adresi değiştirmez
  // (Sistem Ayarları'ndaki finans bölümü: adres /ayarlar'dır, finans menüsünde karşılığı yoktur).
  sabitGorunum?: string;
}

export function FinansCercevesi({ sabitGorunum }: Ozellikler = {}) {
  const oturum = useOturum();
  const { tema } = useTema();
  const [prototip, setPrototip] = useState<string | null>(null);
  const [grafik, setGrafik] = useState<string | null>(null);
  const [yaziStili, setYaziStili] = useState<string | null>(null);
  const gorunumIletisi = useYalitilmisGorunum(KOK);
  const sabitSira = useRef(0);
  const temaYolu = useRef<((ileti: unknown) => void) | null>(null);
  const { pathname } = useLocation();

  useEffect(() => {
    let bitti = false;
    void prototipYukle().then((html) => { if (!bitti) setPrototip(html); });
    void import('../../../../node_modules/chart.js/dist/chart.umd.js?raw').then((m) => { if (!bitti) setGrafik(m.default); });
    void gomuluYaziStili().then((stil) => { if (!bitti) setYaziStili(stil); });
    return () => { bitti = true; };
  }, []);

  const kullanici = oturum.data;
  // Sayfa bir kez kurulur: yeniden kurulum çerçeveyi yeniden yükler ve açık form kaybolur. Tema açılışta sayfaya yazılır,
  // sonraki değişiklik çerçeveye iletiyle gider.
  const [ilkTema] = useState(tema);
  const sayfa = useMemo(() => {
    if (prototip === null || grafik === null || yaziStili === null || !kullanici) return null;
    return sayfaKur(prototip, {
      koken: window.location.origin,
      // Finans rakamlarını gören tam ekranı, yalnız firma yetkisi olan Firmalar'ı görür.
      kapsam: kullanici.islemler.includes('finans.oku') ? 'tam' : 'firma',
      islemler: kullanici.islemler,
      kullanici: { id: kullanici.id, ad: kullanici.ad },
      tema: ilkTema === 'dark' ? 'dark' : 'light',
    }, grafik, yaziStili);
  }, [prototip, grafik, yaziStili, kullanici, ilkTema]);
  useEffect(() => {
    temaYolu.current?.({ kanal: 'finans', yon: 'tema', tema: tema === 'dark' ? 'dark' : 'light' });
  }, [tema]);
  const isle = useMemo(() => kopruKur(), []);

  // Kaynak ve köken denetimini YalitilmisCerceve yapar (yalnız bu çerçeve, opak köken); burada yalnız bilinen kanallar geçer.
  const iletiGeldi = (veri: unknown, yanitla: (ileti: unknown) => void) => {
    temaYolu.current = yanitla;
    if (sabitGorunum !== undefined) {
      if (cercevedenIletiMi(veri)) {
        if (veri.tip === 'hazir') {
          sabitSira.current += 1;
          const ileti: KabuktanIleti = { kanal: CERCEVE_KANALI, surum: CERCEVE_SURUMU, tip: 'gorunum', gorunum: sabitGorunum, sira: sabitSira.current };
          yanitla(ileti);
        }
        return;
      }
    } else if (gorunumIletisi(veri, yanitla)) return;
    const m = veri as { kanal?: unknown; yon?: unknown; id?: unknown; tip?: unknown; veri?: unknown } | null;
    if (!m || m.kanal !== 'finans' || m.yon !== 'istek' || typeof m.tip !== 'string' || typeof m.id !== 'number') return;
    const yanit = (govde: Record<string, unknown>) => { yanitla({ kanal: 'finans', yon: 'yanit', id: m.id, ...govde }); };
    isle(m.tip, m.veri).then(
      (sonuc) => { yanit({ ok: true, veri: sonuc }); },
      (e: unknown) => { yanit({ ok: false, ...kopruHatasi(e) }); },
    );
  };

  if (oturum.isPending || sayfa === null) return <div className="tc-finans-durum"><DurumKutusu durum="yukleniyor" /></div>;
  if (!kullanici) return <div className="tc-finans-durum"><DurumKutusu durum="hata" mesaj="Oturum bulunamadı." /></div>;
  if (!kullanici.islemler.includes('musteri-tedarikci.oku') && !kullanici.islemler.includes('finans.oku')) {
    return <div className="tc-finans-durum"><DurumKutusu durum="hata" mesaj="Finans bölümünü görme yetkiniz yok." /></div>;
  }
  if (sabitGorunum === undefined) {
    const hedef = izinliYol(pathname, kullanici.islemler);
    if (hedef !== null && hedef !== pathname) return <Navigate to={hedef} replace />;
  }
  return (
    <div className={sabitGorunum === undefined ? 'tc-finans' : 'tc-finans tc-finans-gomulu'}>
      {/* İzinler prototipin kullandıklarıdır: dışa aktarım (indirme), kayıt pencereleri (form) ve yazdırma (modal). */}
      <YalitilmisCerceve
        baslik="Finans ve Muhasebe"
        sinif="tc-finans-cerceve"
        sayfa={sayfa}
        izinler={['allow-downloads', 'allow-forms', 'allow-modals']}
        iletiGeldi={iletiGeldi}
      />
    </div>
  );
}
