import { useEffect, useMemo, useRef, useState } from 'react';
import { DurumKutusu, YalitilmisCerceve, useBildirim } from '../../ortak/arayuz/index.ts';
import { useYalitilmisGorunum } from '../../ortak/rota/cerceve-gorunumu.ts';
import { ApiHatasi, api, hataIletisi } from '../../ortak/veri/api.ts';
import { useOturum } from '../../ortak/veri/oturum.ts';
import { useTema } from '../../ortak/veri/tema.ts';
import { VERI_KANALI } from './acilis.ts';
import { kopruKur, KopruHatasi } from './kopru.ts';
import { sayfaKur } from './sayfa.ts';
import './ik.css';

interface Istek { kanal?: unknown; yon?: unknown; id?: unknown; tip?: unknown; veri?: unknown }
type Yanitla = (ileti: unknown) => void;

// İK uygulaması değiştirilmeden yalıtılmış çerçevede açılır (TMI oturumuna, sayfasına ve deposuna erişemez); sayfaları TMI'nin ikinci
// menüsündedir (paylasilan/sayfalar/ik.ts, kabuk çizer). İki sayfa aynı uygulamayı açar: kök, görünümün hangi menüden okunacağıdır.
// Veri istekleri köprüyle TMI uçlarına gider; ne geçeceğine kabuk karar verir.
export function IkCercevesi({ kok = '/ik' }: { kok?: string }) {
  const oturum = useOturum();
  const { tema } = useTema();
  const [paket, paketYaz] = useState<{ paket: string; yazi: string } | null>(null);
  const [yuklemeHatasi, hataYaz] = useState<string | null>(null);
  const gorunumIletisi = useYalitilmisGorunum(kok);
  // Sunucudaki değişiklik bildirimi (köprünün "degisti" yaması) çerçeveye son istek yapan pencere üzerinden gider.
  const yanit = useRef<Yanitla | null>(null);

  useEffect(() => {
    let bitti = false;
    // Paket büyüktür (yaklaşık 0,6 MB): yalnız bu sayfa açılınca yüklenir.
    void Promise.all([import('./uygulama/paket.ts'), import('./uygulama/yazi.ts')]).then(
      ([p, y]) => { if (!bitti) paketYaz({ paket: p.IK_PAKETI, yazi: y.IK_YAZI_TIPI }); },
      () => { if (!bitti) hataYaz('İnsan Kaynakları yüklenemedi.'); },
    );
    return () => { bitti = true; };
  }, []);

  const islemler = oturum.data?.islemler;
  const { bildir } = useBildirim();
  const kopru = useMemo(
    () => (islemler ? kopruKur(api, islemler, (veri) => yanit.current?.({ kanal: VERI_KANALI, yon: 'degisti', veri }), (m) => bildir('bilgi', m)) : null),
    [islemler, bildir],
  );

  // Sayfa bir kez kurulur: yeniden kurulum çerçeveyi yeniden yükler ve açık form kaybolur (borç 177). Tema açılışta sayfaya
  // yazılır, sonraki değişiklik çerçeveye iletiyle gider.
  const [ilkTema] = useState(tema);
  const sayfa = useMemo(
    () => (paket === null ? null : sayfaKur({ koken: window.location.origin, tema: ilkTema === 'dark' ? 'dark' : 'light', paket: paket.paket, yaziTipi: paket.yazi })),
    [paket, ilkTema],
  );
  useEffect(() => {
    yanit.current?.({ kanal: VERI_KANALI, yon: 'tema', tema: tema === 'dark' ? 'dark' : 'light' });
  }, [tema]);

  // Kaynak ve köken denetimini YalitilmisCerceve yapar (yalnız bu çerçeve, opak köken); burada yalnız bilinen kanallar geçer.
  const iletiGeldi = (veri: unknown, yanitla: Yanitla) => {
    if (gorunumIletisi(veri, yanitla)) return;
    const m = veri as Istek | null;
    if (kopru === null || !m || m.kanal !== VERI_KANALI || m.yon !== 'istek' || typeof m.tip !== 'string') return;
    yanit.current = yanitla;
    kopru.isle(m.tip, m.veri).then(
      (sonuc) => { yanitla({ kanal: VERI_KANALI, yon: 'yanit', id: m.id, ok: true, veri: sonuc }); },
      (e: unknown) => {
        yanitla({
          kanal: VERI_KANALI, yon: 'yanit', id: m.id, ok: false,
          kod: e instanceof ApiHatasi ? e.govde.kod : e instanceof KopruHatasi ? e.kod : 'SUNUCU',
          hata: hataIletisi(e, e instanceof Error ? e.message : 'İşlem yapılamadı.'),
        });
      },
    );
  };

  if (yuklemeHatasi !== null) return <div className="tc-ik-durum"><DurumKutusu durum="hata" mesaj={yuklemeHatasi} /></div>;
  if (oturum.isError) return <div className="tc-ik-durum"><DurumKutusu durum="hata" mesaj={hataIletisi(oturum.error, 'Oturum okunamadı.')} /></div>;
  if (sayfa === null || kopru === null) return <div className="tc-ik-durum"><DurumKutusu durum="yukleniyor" /></div>;
  return (
    <div className="tc-ik">
      {/* İzinler uygulamanın kullandıklarıdır: yedek ve Excel dışa aktarımı (indirme), formlar (form), yazdırma (modal). */}
      <YalitilmisCerceve
        baslik="İnsan Kaynakları"
        sinif="tc-ik-cerceve"
        sayfa={sayfa}
        izinler={['allow-downloads', 'allow-forms', 'allow-modals']}
        yetenekler={['clipboard-write']}
        iletiGeldi={iletiGeldi}
      />
    </div>
  );
}

export function IkIslemlerimCercevesi() {
  return <IkCercevesi kok="/ik-islemlerim" />;
}
