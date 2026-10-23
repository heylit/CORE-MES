import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { KmKimlikCevabi } from '#paylasilan/sozlesme/kalite-merkezi.ts';
import { DurumKutusu, YalitilmisCerceve, useBildirim } from '../../ortak/arayuz/index.ts';
import { useYalitilmisGorunum } from '../../ortak/rota/cerceve-gorunumu.ts';
import { api } from '../../ortak/veri/api.ts';
import { useOturum } from '../../ortak/veri/oturum.ts';
import { VERI_KANALI } from './acilis.ts';
import { kitapliklariYukle } from './kitapliklar.ts';
import type { Kitapliklar } from './kitapliklar.ts';
import { kopruKur } from './kopru.ts';
import type { ApiIstegi } from './kopru.ts';
import { sayfaKur } from './sayfa.ts';
import './kalite-merkezi.css';

export const KOK = '/kalite-merkezi';

// Dosya ikili cevaptır: aynı kökene oturum çereziyle düz istek (api.get JSON okur).
async function dosyaOku(yol: string): Promise<Blob | null> {
  const r = await fetch(`/api${yol}`, { credentials: 'include' });
  return r.ok ? r.blob() : null;
}

interface Istek { kanal?: unknown; yon?: unknown; id?: unknown; tip?: unknown; veri?: unknown; tus?: unknown }

// 329 a: ölçü aletleri Kalibrasyonda yönetilir; uygulamanın ekleme ve düzenleme yolları kullanıcıyı oraya gönderir. Çerçeve adres
// veremez: yalnız bu tek hedefe gidilir.
export const KALIBRASYON_YOLU = '/kalibrasyon';
export const kalibrasyonaGitIstegiMi = (m: Istek | null): boolean => m !== null && m.kanal === VERI_KANALI && m.yon === 'istek' && m.tip === 'kalibrasyona-git';
// Çerçevede basılan Ctrl K (karar 102 a, acilis.ts PALET_BETIGI): kabuğun arama kutusu pencerenin tuş olayını dinler; aynı tuş kabukta yeniden verilir.
export const kisayolIstegiMi = (m: Istek | null): boolean => m !== null && m.kanal === VERI_KANALI && m.yon === 'kisayol' && m.tus === 'arama';

// Kalite Merkezi değiştirilmeden yalıtılmış çerçevede açılır (TMI oturumuna, sayfasına ve deposuna erişemez); menü kabuktadır
// (ikinci menü). Uygulamanın yerel sunucuya attığı istekler köprüyle TMI uçlarına gider.
export function KaliteMerkeziCercevesi() {
  const oturum = useOturum();
  const { bildir } = useBildirim();
  const [paket, setPaket] = useState<{ paket: string; kitapliklar: Kitapliklar } | null>(null);
  const [kimlik, setKimlik] = useState<KmKimlikCevabi | null>(null);
  const [hata, setHata] = useState<string | null>(null);
  const okur = oturum.data?.islemler.includes('kalite-merkezi.oku') === true;
  const gorunumIletisi = useYalitilmisGorunum(KOK);
  const gezin = useNavigate();

  useEffect(() => {
    let bitti = false;
    // Paket ve kitaplıklar büyüktür (yaklaşık 20 MB): yalnız bu sayfa açılınca yüklenir.
    void Promise.all([import('./uygulama/paket.ts'), kitapliklariYukle()]).then(
      ([p, k]) => { if (!bitti) setPaket({ paket: p.KM_PAKETI, kitapliklar: k }); },
      () => { if (!bitti) setHata('Kalite Merkezi yüklenemedi.'); },
    );
    return () => { bitti = true; };
  }, []);

  // Uygulamanın girişi TMI oturumudur: kişi ve yönetici bilgisi sayfa kurulmadan alınır.
  useEffect(() => {
    if (!okur) return undefined;
    let bitti = false;
    void api.get<KmKimlikCevabi>('/kalite-merkezi/kimlik').then(
      (k) => { if (!bitti) setKimlik(k); },
      () => { if (!bitti) setHata('Kalite Merkezi yüklenemedi.'); },
    );
    return () => { bitti = true; };
  }, [okur]);

  const sayfa = useMemo(
    () => (paket === null || kimlik === null ? null : sayfaKur({
      paket: paket.paket, koken: window.location.origin, grafik: paket.kitapliklar.grafik, kitapliklar: paket.kitapliklar.lib, pdfWasm: paket.kitapliklar.pdfWasm, kimlik,
    })),
    [paket, kimlik],
  );
  const kopru = useMemo(() => kopruKur(api, dosyaOku), []);

  // Kaynak ve köken denetimini YalitilmisCerceve yapar (yalnız bu çerçeve, opak köken); burada yalnız bilinen kanallar geçer.
  const iletiGeldi = (veri: unknown, yanitla: (ileti: unknown) => void) => {
    if (gorunumIletisi(veri, yanitla)) return;
    const m = veri as Istek | null;
    if (kalibrasyonaGitIstegiMi(m)) { void gezin(KALIBRASYON_YOLU); return; }
    if (kisayolIstegiMi(m)) {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true, cancelable: true }));
      return;
    }
    if (!m || m.kanal !== VERI_KANALI || m.yon !== 'istek' || m.tip !== 'api' || typeof m.id !== 'number') return;
    const g = m.veri as Partial<ApiIstegi> | null;
    if (!g || typeof g.adres !== 'string' || typeof g.yontem !== 'string') return;
    void kopru.isle({ adres: g.adres, yontem: g.yontem, govde: g.govde ?? null }).then((c) => {
      // Uygulama yazma hatasında genel bir ileti gösterir; sunucunun nedeni (yetki, kural) kabukta bildirilir.
      if (c.durum >= 400 && c.durum !== 404) {
        const ileti = (c.json as { hata?: unknown } | undefined)?.hata;
        bildir('hata', `Kalite Merkezi: ${typeof ileti === 'string' ? ileti : 'İşlem yapılamadı.'}`);
      }
      yanitla({ kanal: VERI_KANALI, yon: 'yanit', id: m.id, ...c });
    });
  };

  if (hata !== null) return <div className="tc-km-durum"><DurumKutusu durum="hata" mesaj={hata} /></div>;
  if (oturum.isPending) return <div className="tc-km-durum"><DurumKutusu durum="yukleniyor" /></div>;
  if (!okur) return <div className="tc-km-durum"><DurumKutusu durum="hata" mesaj="Kalite Merkezi'ni görme yetkiniz yok." /></div>;
  if (sayfa === null) return <div className="tc-km-durum"><DurumKutusu durum="yukleniyor" /></div>;
  return (
    <div className="tc-km">
      {/* İzinler uygulamanın kullandıklarıdır: dışa aktarım ve yedek (indirme), kayıt formları (form), yazdırma (modal). */}
      <YalitilmisCerceve
        baslik="Kalite Merkezi"
        sinif="tc-km-cerceve"
        sayfa={sayfa}
        izinler={['allow-downloads', 'allow-forms', 'allow-modals']}
        iletiGeldi={iletiGeldi}
      />
    </div>
  );
}
