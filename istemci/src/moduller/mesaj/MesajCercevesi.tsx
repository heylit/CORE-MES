import { useEffect, useMemo, useState } from 'react';
import type { BenCevabi, SorguCevabi } from '#paylasilan/sozlesme/mesaj.ts';
import { DurumKutusu, YalitilmisCerceve } from '../../ortak/arayuz/index.ts';
import { api, hataIletisi } from '../../ortak/veri/api.ts';
import { useOturum } from '../../ortak/veri/oturum.ts';
import { useTema } from '../../ortak/veri/tema.ts';
import { useYalitilmisGorunum } from '../../ortak/rota/cerceve-gorunumu.ts';
import { anahtarParcasi, cerceveBetigi, yerelKoku } from './cerceve-kopru.ts';
import type { CerceveAyari } from './cerceve-kopru.ts';
import { kopruHatasi, kopruKur } from './kopru.ts';
import { gomuluYaziStili } from './yazi-tipleri.ts';
import './mesaj.css';

// Mesaj prototipi olduğu gibi yalıtılmış çerçevede açılır (TMI oturumuna, sayfasına ve deposuna erişemez); veri yalnız
// köprüyle TMI uçlarına gider (cerceve-kopru.ts çerçevede, kopru.ts kabukta).
// İçerik politikası dışarıya her isteği, form gönderimini ve taban adres değişimini kapatır (dış servis yok). Yazı tipi
// yalnız gömülü veriden: opak kökenden TMI adresine yazı tipi isteğini tarayıcı reddeder.
const POLITIKA = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; font-src data:; img-src data: blob:; media-src data: blob:; connect-src 'none'; frame-src 'none'; form-action 'none'; base-uri 'none'";
export const KOK = '/mesaj';
const KANAL = 'mesaj';
// Sunucu sınırıyla aynı (paylasilan/sozlesme/mesaj.ts AZAMI_EK_BAYT); istemci sözleşmeyi değer olarak ithal etmez.
const AZAMI_EK_BAYT = 700 * 1024;
const OKUMA_ISLEMLERI = ['sayfa.mesaj', 'mesaj.oku', 'mesaj.yaz'];

// Prototipin yerel deposu: kapsam ve kalıcı tutulan anahtar önekleri.
export const YEREL: Pick<CerceveAyari['yerel'], 'kapsam' | 'onekler' | 'catismaIletisi'> = { kapsam: 'kisisel', onekler: ['mesai:'], catismaIletisi: 'Bu kayıt başka bir kişi tarafından değiştirildi; sayfayı yenileyin.' };
// Prototipin kullandığı window.claude yetenekleri.
export const YETENEKLER: readonly string[] = ['db', 'user', 'room', 'assets', 'downloads'];

// Prototipin dış yazı tipi bağlantıları sayfadan çıkarılır (politika zaten kapatır; konsol hatası kalmasın), yerine gömülü
// yazı tipi gelir. Köprü ve politika belgenin başına, prototip betiklerinden önce konur.
// 311 a: üretim adedi yalnız Üretim Terminali'nden girilir; giriş düğmesi, satır içi giriş ve MES aktarımı gizlenir (sunucu da reddeder).
const URETIM_GIRISINI_GIZLE = '[data-act="o-entry"],#entInl,[data-act="imp"][data-v="prod"]{display:none!important}';

export function sayfaKur(prototip: string, betik: string, yaziStili: string): string {
  const temiz = prototip.replace(/<link\b[^>]*fonts\.(?:googleapis|gstatic)\.com[^>]*>\s*/gi, '');
  const bas = `<meta http-equiv="Content-Security-Policy" content="${POLITIKA}">\n<style>${yaziStili}\n${URETIM_GIRISINI_GIZLE}</style>\n${betik}\n`;
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

interface Hazirlik { ben: BenCevabi; yerel: CerceveAyari['yerel']['degerler'] }

export function MesajCercevesi() {
  const oturum = useOturum();
  const { tema } = useTema();
  const [prototip, setPrototip] = useState<string | null>(null);
  const [yaziStili, setYaziStili] = useState<string | null>(null);
  const [hazirlik, setHazirlik] = useState<Hazirlik | null>(null);
  const [hata, setHata] = useState<string | null>(null);
  const [deneme, setDeneme] = useState(0);
  const gorunumIletisi = useYalitilmisGorunum(KOK);
  const kullanici = oturum.data;
  const girebilir = kullanici?.islemler.some((i) => OKUMA_ISLEMLERI.includes(i)) ?? false;

  useEffect(() => {
    let bitti = false;
    void import('./cerceve/mesaj.html?raw').then((m) => { if (!bitti) setPrototip(m.default); });
    void gomuluYaziStili().then((stil) => { if (!bitti) setYaziStili(stil); });
    return () => { bitti = true; };
  }, []);

  // Kimlik, gerekirse boş depoda başlangıç kurulumu (yönetici) ve yerel depo kayıtları çerçeve kurulmadan önce okunur:
  // prototip yerel deposunu açılışta eşzamanlı okur.
  useEffect(() => {
    if (!kullanici || !girebilir) return;
    let bitti = false;
    void (async () => {
      try {
        let ben = await api.get<BenCevabi>('/mesaj/ben');
        if (ben.kurulumGerekli && ben.yonetici) {
          await api.post('/mesaj/kurulum');
          ben = await api.get<BenCevabi>('/mesaj/ben');
        }
        let yerel: CerceveAyari['yerel']['degerler'] = {};
        if (YEREL.kapsam !== 'yok') {
          const kok = yerelKoku({ kisi: ben.kisi, yerel: { ...YEREL, degerler: {} } });
          yerel = yerelDegerler(await api.get<SorguCevabi>(`/mesaj/sorgu?koleksiyon=${encodeURIComponent(kok)}`));
        }
        if (!bitti) setHazirlik({ ben, yerel });
      } catch (e) {
        if (!bitti) setHata(hataIletisi(e, 'Mesaj açılamadı.'));
      }
    })();
    return () => { bitti = true; };
  }, [kullanici, girebilir, deneme]);

  // Sayfa bir kez kurulur: yeniden kurulum çerçeveyi yeniden yükler ve açılıştaki yerel depo değerleri eskimiş olur.
  // Tema yalnız açılışta geçer.
  const [ilkTema] = useState(tema);
  const sayfa = useMemo(() => {
    if (prototip === null || yaziStili === null || hazirlik === null) return null;
    const { ben, yerel } = hazirlik;
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
    }), yaziStili);
  }, [prototip, yaziStili, hazirlik, ilkTema]);
  const isle = useMemo(() => kopruKur(), []);

  // Kaynak ve köken denetimini YalitilmisCerceve yapar (yalnız bu çerçeve, opak köken); burada yalnız bilinen kanallar geçer.
  const iletiGeldi = (veri: unknown, yanitla: (ileti: unknown) => void) => {
    if (gorunumIletisi(veri, yanitla)) return;
    const m = veri as { kanal?: unknown; yon?: unknown; id?: unknown; tip?: unknown; veri?: unknown } | null;
    if (!m || m.kanal !== KANAL || m.yon !== 'istek' || typeof m.tip !== 'string' || typeof m.id !== 'number') return;
    const yanit = (govde: Record<string, unknown>) => { yanitla({ kanal: KANAL, yon: 'yanit', id: m.id, ...govde }); };
    isle(m.tip, m.veri).then(
      (sonuc) => { yanit({ ok: true, veri: sonuc }); },
      (e: unknown) => { yanit({ ok: false, ...kopruHatasi(e) }); },
    );
  };

  if (oturum.isPending) return <div className="tc-mesaj-durum"><DurumKutusu durum="yukleniyor" /></div>;
  if (!kullanici) return <div className="tc-mesaj-durum"><DurumKutusu durum="hata" mesaj="Oturum bulunamadı." /></div>;
  if (!girebilir) return <div className="tc-mesaj-durum"><DurumKutusu durum="hata" mesaj="Bu bölümü görme yetkiniz yok." /></div>;
  if (hata !== null) {
    return (
      <div className="tc-mesaj-durum">
        <DurumKutusu durum="hata" mesaj={hata} yenile={() => { setHata(null); setDeneme((d) => d + 1); }} />
      </div>
    );
  }
  if (sayfa === null) return <div className="tc-mesaj-durum"><DurumKutusu durum="yukleniyor" /></div>;
  return (
    <div className="tc-mesaj">
      {/* İzinler prototipin kullandıklarıdır: dışa aktarım (indirme), formlar ve onay pencereleri. */}
      <YalitilmisCerceve
        baslik="Mesaj"
        sinif="tc-mesaj-cerceve"
        sayfa={sayfa}
        izinler={['allow-downloads', 'allow-forms', 'allow-modals']}
        iletiGeldi={iletiGeldi}
      />
    </div>
  );
}
