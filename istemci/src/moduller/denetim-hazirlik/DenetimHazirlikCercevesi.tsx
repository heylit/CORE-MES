import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { BenCevabi, OlcuAletleriCevabi, SorguCevabi } from '#paylasilan/sozlesme/denetim-hazirlik.ts';
import { DurumKutusu, YalitilmisCerceve } from '../../ortak/arayuz/index.ts';
import { api, hataIletisi } from '../../ortak/veri/api.ts';
import { useOturum } from '../../ortak/veri/oturum.ts';
import { useTema } from '../../ortak/veri/tema.ts';
import { useYalitilmisGorunum } from '../../ortak/rota/cerceve-gorunumu.ts';
import { anahtarParcasi, cerceveBetigi, yerelKoku } from './cerceve-kopru.ts';
import type { CerceveAyari } from './cerceve-kopru.ts';
import { ekBetikler } from './ek-betikler.ts';
import { kopruHatasi, kopruKur } from './kopru.ts';
import { OLCU_ALETI_YOLU, olcuAletiBetigi } from './olcu-aleti.ts';
import { gomuluYaziStili } from './yazi-tipleri.ts';
import './denetim-hazirlik.css';

// Denetim Hazırlığı prototipi olduğu gibi yalıtılmış çerçevede açılır (TMI oturumuna, sayfasına ve deposuna erişemez); veri yalnız
// köprüyle TMI uçlarına gider (cerceve-kopru.ts çerçevede, kopru.ts kabukta).
// İçerik politikası dışarıya her isteği, form gönderimini ve taban adres değişimini kapatır (dış servis yok). Yazı tipi
// yalnız gömülü veriden: opak kökenden TMI adresine yazı tipi isteğini tarayıcı reddeder.
const POLITIKA = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; font-src data:; img-src data: blob:; media-src data: blob:; connect-src 'none'; frame-src 'none'; form-action 'none'; base-uri 'none'";
export const KOK = '/denetim-hazirlik';
const KANAL = 'denetim-hazirlik';
// Sunucu sınırıyla aynı (paylasilan/sozlesme/denetim-hazirlik.ts AZAMI_EK_BAYT); istemci sözleşmeyi değer olarak ithal etmez.
const AZAMI_EK_BAYT = 700 * 1024;
// Prototipin tüm durumu bu yerel depo anahtarında durur (ek-betikler.ts ve prototipteki KEY ile aynı).
const OLCU_ALETI_DEPO_ANAHTARI = 'kalite-denetim-v4';
const OKUMA_ISLEMLERI = ['sayfa.denetim-hazirlik', 'denetim-hazirlik.oku', 'denetim-hazirlik.yaz'];

// Prototipin yerel deposu: kapsam ve kalıcı tutulan anahtar önekleri.
export const YEREL: Pick<CerceveAyari['yerel'], 'kapsam' | 'onekler' | 'catismaIletisi'> = { kapsam: 'ortak', onekler: ['kalite-denetim'], catismaIletisi: 'Bu kayıt başka bir kişi tarafından değiştirildi; sayfayı yenileyin.' };
// Prototipin kullandığı window.claude yetenekleri.
export const YETENEKLER: readonly string[] = [];

// Prototipin dış yazı tipi bağlantıları sayfadan çıkarılır (politika zaten kapatır; konsol hatası kalmasın), yerine gömülü
// yazı tipi gelir. Google Takvim bağlantısı da çıkar: atölyede internet yok, takvime ekleme .ics indirmesiyle kalır.
// Köprü ve politika belgenin başına, prototip betiklerinden önce konur.
export function sayfaKur(prototip: string, betik: string, yaziStili: string): string {
  const temiz = prototip
    .replace(/<link\b[^>]*fonts\.(?:googleapis|gstatic)\.com[^>]*>\s*/gi, '')
    .replace(/<a\b[^<]*gcalUrl\([^<]*>Google Takvim<\/a>/g, '')
    .replace(/function gcalUrl\(([^)]*)\)\{[^\n]*\}/, () => 'function gcalUrl(){return "";}');
  const bas = `<meta http-equiv="Content-Security-Policy" content="${POLITIKA}">\n<style>${yaziStili}</style>\n${betik}\n`;
  // Değiştirme işlevle yapılır: metindeki $ dizileri değiştirme kalıbı olarak yorumlanmasın.
  return temiz.replace(/<head>/i, () => `<head>\n${bas}`);
}

// Yerel depo kayıtları belge yolundan anahtara çevrilir.
export function yerelDegerler(cevap: SorguCevabi): CerceveAyari['yerel']['degerler'] {
  const sonuc: Record<string, { deger: string; surum: number }> = {};
  for (const b of cevap.belgeler) {
    const deger = b.veri['deger'];
    if (typeof deger !== 'string') continue;
    try { sonuc[decodeURIComponent(b.kimlik)] = { deger, surum: b.surum }; } catch { /* bozuk anahtar atlanır */ }
  }
  return sonuc;
}

interface Hazirlik { ben: BenCevabi; yerel: CerceveAyari['yerel']['degerler']; aletler: OlcuAletleriCevabi['aletler'] }

// 329 a: ölçü aletleri Kalibrasyonda yönetilir; çerçeve adres veremez, yalnız bu tek hedefe gidilir.
export const KALIBRASYON_YOLU = OLCU_ALETI_YOLU;
export const kalibrasyonaGitIstegiMi = (m: { kanal?: unknown; yon?: unknown; tip?: unknown } | null): boolean => m !== null && m.kanal === KANAL && m.yon === 'istek' && m.tip === 'kalibrasyona-git';

export function DenetimHazirlikCercevesi() {
  const oturum = useOturum();
  const { tema } = useTema();
  const [prototip, setPrototip] = useState<string | null>(null);
  const [yaziStili, setYaziStili] = useState<string | null>(null);
  const [ekBetik, setEkBetik] = useState<string | null>(null);
  const [hazirlik, setHazirlik] = useState<Hazirlik | null>(null);
  const [hata, setHata] = useState<string | null>(null);
  const [deneme, setDeneme] = useState(0);
  const gorunumIletisi = useYalitilmisGorunum(KOK);
  const gezin = useNavigate();
  const kullanici = oturum.data;
  const girebilir = kullanici?.islemler.some((i) => OKUMA_ISLEMLERI.includes(i)) ?? false;

  useEffect(() => {
    let bitti = false;
    void import('./cerceve/denetim-hazirlik.html?raw').then((m) => { if (!bitti) setPrototip(m.default); });
    void gomuluYaziStili().then((stil) => { if (!bitti) setYaziStili(stil); });
    void ekBetikler().then((b) => { if (!bitti) setEkBetik(b); }, () => { if (!bitti) setEkBetik(''); });
    return () => { bitti = true; };
  }, []);

  // Kimlik, gerekirse boş depoda başlangıç kurulumu (yönetici) ve yerel depo kayıtları çerçeve kurulmadan önce okunur:
  // prototip yerel deposunu açılışta eşzamanlı okur.
  useEffect(() => {
    if (!kullanici || !girebilir) return;
    let bitti = false;
    void (async () => {
      try {
        let ben = await api.get<BenCevabi>('/denetim-hazirlik/ben');
        if (ben.kurulumGerekli && ben.yonetici) {
          await api.post('/denetim-hazirlik/kurulum');
          ben = await api.get<BenCevabi>('/denetim-hazirlik/ben');
        }
        let yerel: CerceveAyari['yerel']['degerler'] = {};
        if (YEREL.kapsam !== 'yok') {
          const kok = yerelKoku({ kisi: ben.kisi, yerel: { ...YEREL, degerler: {} } });
          yerel = yerelDegerler(await api.get<SorguCevabi>(`/denetim-hazirlik/sorgu?koleksiyon=${encodeURIComponent(kok)}`));
        }
        const { aletler } = await api.get<OlcuAletleriCevabi>('/denetim-hazirlik/olcu-aletleri');
        if (!bitti) setHazirlik({ ben, yerel, aletler });
      } catch (e) {
        if (!bitti) setHata(hataIletisi(e, 'Denetim Hazırlığı açılamadı.'));
      }
    })();
    return () => { bitti = true; };
  }, [kullanici, girebilir, deneme]);

  // Sayfa bir kez kurulur: yeniden kurulum çerçeveyi yeniden yükler ve açılıştaki yerel depo değerleri eskimiş olur.
  // Tema yalnız açılışta geçer.
  const [ilkTema] = useState(tema);
  const sayfa = useMemo(() => {
    if (prototip === null || yaziStili === null || ekBetik === null || hazirlik === null) return null;
    const { ben, yerel, aletler } = hazirlik;
    return sayfaKur(prototip, cerceveBetigi({
      kanal: KANAL,
      kisi: ben.kisi,
      yazabilir: ben.yazabilir,
      yonetici: ben.yonetici,
      yetenekler: YETENEKLER,
      yerel: { ...YEREL, degerler: yerel },
      tema: ilkTema === 'dark' ? 'dark' : 'light',
      // Açık her sekme sürekli istek atar; değişiklik damgası 10 sn gecikmeyle de yeter.
      yoklamaMs: 10_000,
      azamiEkBayt: AZAMI_EK_BAYT,
    }) + ekBetik + olcuAletiBetigi({ kanal: KANAL, depoAnahtari: OLCU_ALETI_DEPO_ANAHTARI, yoklamaMs: 20_000, aletler }), yaziStili);
  }, [prototip, yaziStili, ekBetik, hazirlik, ilkTema]);
  const isle = useMemo(() => kopruKur(), []);

  // Kaynak ve köken denetimini YalitilmisCerceve yapar (yalnız bu çerçeve, opak köken); burada yalnız bilinen kanallar geçer.
  const iletiGeldi = (veri: unknown, yanitla: (ileti: unknown) => void) => {
    if (gorunumIletisi(veri, yanitla)) return;
    const m = veri as { kanal?: unknown; yon?: unknown; id?: unknown; tip?: unknown; veri?: unknown; tus?: unknown } | null;
    // Çerçevede basılan Ctrl K: kabuğun arama kutusu pencerenin tuş olayını dinler; aynı tuş burada yeniden verilir.
    if (m?.kanal === KANAL && m.yon === 'kisayol' && m.tus === 'arama') {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true, cancelable: true }));
      return;
    }
    if (kalibrasyonaGitIstegiMi(m)) { void gezin(KALIBRASYON_YOLU); return; }
    if (!m || m.kanal !== KANAL || m.yon !== 'istek' || typeof m.tip !== 'string' || typeof m.id !== 'number') return;
    const yanit = (govde: Record<string, unknown>) => { yanitla({ kanal: KANAL, yon: 'yanit', id: m.id, ...govde }); };
    isle(m.tip, m.veri).then(
      (sonuc) => { yanit({ ok: true, veri: sonuc }); },
      (e: unknown) => { yanit({ ok: false, ...kopruHatasi(e) }); },
    );
  };

  if (oturum.isPending) return <div className="tc-denetim-hazirlik-durum"><DurumKutusu durum="yukleniyor" /></div>;
  if (!kullanici) return <div className="tc-denetim-hazirlik-durum"><DurumKutusu durum="hata" mesaj="Oturum bulunamadı." /></div>;
  if (!girebilir) return <div className="tc-denetim-hazirlik-durum"><DurumKutusu durum="hata" mesaj="Bu bölümü görme yetkiniz yok." /></div>;
  if (hata !== null) {
    return (
      <div className="tc-denetim-hazirlik-durum">
        <DurumKutusu durum="hata" mesaj={hata} yenile={() => { setHata(null); setDeneme((d) => d + 1); }} />
      </div>
    );
  }
  if (sayfa === null) return <div className="tc-denetim-hazirlik-durum"><DurumKutusu durum="yukleniyor" /></div>;
  return (
    <div className="tc-denetim-hazirlik">
      {/* İzinler prototipin kullandıklarıdır: dışa aktarım (indirme), formlar ve onay pencereleri. */}
      <YalitilmisCerceve
        baslik="Denetim Hazırlığı"
        sinif="tc-denetim-hazirlik-cerceve"
        sayfa={sayfa}
        izinler={['allow-downloads', 'allow-forms', 'allow-modals']}
        iletiGeldi={iletiGeldi}
      />
    </div>
  );
}
