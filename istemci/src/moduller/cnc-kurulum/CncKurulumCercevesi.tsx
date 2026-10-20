import { useEffect, useMemo, useState } from 'react';
import type { BenCevabi, KayitlarCevabi } from '#paylasilan/sozlesme/cnc-kurulum.ts';
import { TESIS_SAAT_DILIMI } from '#paylasilan/tesis-zamani.ts';
import { DurumKutusu, YalitilmisCerceve } from '../../ortak/arayuz/index.ts';
import { api, hataIletisi } from '../../ortak/veri/api.ts';
import { useOturum } from '../../ortak/veri/oturum.ts';
import { useYalitilmisGorunum } from '../../ortak/rota/cerceve-gorunumu.ts';
import { cerceveBetigi } from './cerceve-kopru.ts';
import type { CerceveAyari } from './cerceve-kopru.ts';
import { kopruHatasi, kopruKur } from './kopru.ts';
import { prototipYukle } from './prototip.ts';
import './cnc-kurulum.css';

// CNC Kurulum Motoru prototipi olduğu gibi yalıtılmış çerçevede açılır (TMI oturumuna, sayfasına ve deposuna erişemez); veri
// yalnız köprüyle TMI uçlarına gider (cerceve-kopru.ts çerçevede, kopru.ts kabukta).
// İçerik politikası dışarıya her isteği, form gönderimini ve taban adres değişimini kapatır (dış servis yok). Prototip 3B
// kütüphanesini ve STEP okuyucusunu (OpenCascade, WebAssembly) kendi içinde taşır: okuyucunun bağlayıcı kodu çağrı işlevlerini
// çalışırken üretir (new Function), bu yüzden 'unsafe-eval' ve 'wasm-unsafe-eval' açıktır. Çerçeve opak kökendedir ve dışarıya
// istek atamaz: eval satır içi betiğin zaten sahip olduğundan fazlasını açmaz. Yazı tipi sistemin yazı tipidir.
const POLITIKA = "default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval'; style-src 'unsafe-inline'; img-src data: blob:; media-src data: blob:; font-src data:; connect-src 'none'; worker-src 'none'; frame-src 'none'; form-action 'none'; base-uri 'none'";
export const KOK = '/cnc-kurulum';
const KANAL = 'cnc-kurulum';
const OKUMA_ISLEMLERI = ['sayfa.cnc-kurulum', 'cnc-kurulum.oku', 'cnc-kurulum.yaz'];
// Sözleşmedeki önekle aynı (paylasilan/sozlesme/cnc-kurulum.ts ANAHTAR_ONEKI); istemci sözleşmeyi değer olarak ithal etmez.
export const ONEK = 'cnc-kurulum-motoru.';
// Sunucunun JSON gövde sınırı 1 MiB'dir; zarf ve kaçış payı bırakılır.
const AZAMI_BAYT = 1_000_000;
const CATISMA = 'Kurulum kayıtları başka bir kişi tarafından değiştirildi; son değişikliğiniz kaydedilmedi. Sayfayı yenileyin.';
const BUYUK = 'Kurulum kaydı 1 MB sınırını aştı ve sunucuya yazılamadı (büyük NC programı olabilir). Daha küçük bir program yükleyin.';

// Köprü ve politika belgenin başına, prototip betiklerinden önce konur.
// 301 a: takım sayacı yalnız üretim sayımından büyür; prototipteki elle üretim kaydı aynı sayacı ikinci kez artırırdı.
const ELLE_URETIM_KAYDINI_GIZLE = '<style>#lfTrack .prod,#lwPanel .prod{display:none!important}</style>';

export function sayfaKur(prototip: string, betik: string): string {
  const bas = `<meta http-equiv="Content-Security-Policy" content="${POLITIKA}">\n${ELLE_URETIM_KAYDINI_GIZLE}\n${betik}\n`;
  // Değiştirme işlevle yapılır: metindeki $ dizileri değiştirme kalıbı olarak yorumlanmasın.
  return prototip.replace(/<head>/i, () => `<head>\n${bas}`);
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

export function CncKurulumCercevesi() {
  const oturum = useOturum();
  const [prototip, setPrototip] = useState<string | null>(null);
  const [hazirlik, setHazirlik] = useState<Hazirlik | null>(null);
  const [hata, setHata] = useState<string | null>(null);
  const [deneme, setDeneme] = useState(0);
  // Emir seçimiyle yeniden kurulan çerçeve, seçimin yapıldığı Kurulum görünümünde açılır.
  const [emirSecildi, setEmirSecildi] = useState(false);
  const gorunumIletisi = useYalitilmisGorunum(KOK);
  const kullanici = oturum.data;
  const girebilir = kullanici?.islemler.some((i) => OKUMA_ISLEMLERI.includes(i)) ?? false;

  // Prototip yalnız bu ekran açılınca yüklenir.
  useEffect(() => {
    let bitti = false;
    void prototipYukle().then(
      (metin) => { if (!bitti) setPrototip(metin); },
      () => { if (!bitti) setHata('CNC Kurulum Motoru yüklenemedi. Sayfayı yenileyin.'); },
    );
    return () => { bitti = true; };
  }, []);

  // Kimlik ve kayıtlar çerçeve kurulmadan önce okunur: prototip yerel deposunu açılışta eşzamanlı okur.
  useEffect(() => {
    if (!kullanici || !girebilir) return;
    let bitti = false;
    void (async () => {
      try {
        const [ben, kayitlar] = await Promise.all([
          api.get<BenCevabi>('/cnc-kurulum/ben'),
          api.get<KayitlarCevabi>('/cnc-kurulum/kayitlar'),
        ]);
        if (!bitti) setHazirlik({ ben, degerler: yerelDegerler(kayitlar) });
      } catch (e) {
        if (!bitti) setHata(hataIletisi(e, 'CNC Kurulum Motoru açılamadı.'));
      }
    })();
    return () => { bitti = true; };
  }, [kullanici, girebilir, deneme]);

  // Sayfa bir kez kurulur: yeniden kurulum çerçeveyi yeniden yükler ve açılıştaki kayıtlar eskimiş olur.
  const sayfa = useMemo(() => {
    if (prototip === null || hazirlik === null) return null;
    return sayfaKur(prototip, cerceveBetigi({
      kanal: KANAL,
      yazabilir: hazirlik.ben.yazabilir || hazirlik.ben.hazirlikOnaylayabilir,
      onek: ONEK,
      degerler: hazirlik.degerler,
      catismaIletisi: CATISMA,
      buyukIletisi: BUYUK,
      azamiBayt: AZAMI_BAYT,
      beklemeMs: 800,
      // Makine eşleştirme Çizim Merkezi'ndedir ("CNC makineleri"); çerçevede aktarım düğmesi yoktur.
      aktarabilir: false,
      aktarimSimgesi: '',
      durumAnahtari: `${ONEK}v1`,
      // Sözleşmedeki EMIR_ANAHTARI ile aynı.
      emirAnahtari: `${ONEK}emir`,
      // Sözleşmedeki SECIM_ANAHTARI ile aynı.
      secimAnahtari: `${ONEK}secim`,
      saltOnay: !hazirlik.ben.yazabilir && hazirlik.ben.hazirlikOnaylayabilir,
      saatDilimi: TESIS_SAAT_DILIMI,
      ...(emirSecildi ? { acilisGorunumu: 'setup' } : {}),
    }));
  }, [prototip, hazirlik, emirSecildi]);
  const yalnizHazirlik = hazirlik !== null && !hazirlik.ben.yazabilir && hazirlik.ben.hazirlikOnaylayabilir;
  const ilkDurum = hazirlik?.degerler[`${ONEK}v1`]?.deger;
  // Emir değişince kayıtlar yeniden okunur ve çerçeve yeniden kurulur (kurulum emir başınadır).
  const takimDegistirebilir = hazirlik?.ben.takimDegistirebilir ?? false;
  const isle = useMemo(
    () => kopruKur({}, yalnizHazirlik, ilkDurum, () => { setHazirlik(null); setEmirSecildi(true); setDeneme((d) => d + 1); }, takimDegistirebilir),
    [yalnizHazirlik, ilkDurum, takimDegistirebilir],
  );

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

  if (oturum.isPending) return <div className="tc-cnc-kurulum-durum"><DurumKutusu durum="yukleniyor" /></div>;
  if (!kullanici) return <div className="tc-cnc-kurulum-durum"><DurumKutusu durum="hata" mesaj="Oturum bulunamadı." /></div>;
  if (!girebilir) return <div className="tc-cnc-kurulum-durum"><DurumKutusu durum="hata" mesaj="Bu bölümü görme yetkiniz yok." /></div>;
  if (hata !== null) {
    return (
      <div className="tc-cnc-kurulum-durum">
        <DurumKutusu durum="hata" mesaj={hata} yenile={() => { setHata(null); setDeneme((d) => d + 1); }} />
      </div>
    );
  }
  if (sayfa === null) return <div className="tc-cnc-kurulum-durum"><DurumKutusu durum="yukleniyor" /></div>;
  return (
    <div className="tc-cnc-kurulum">
      {/* İzinler prototipin kullandıklarıdır: dışa aktarım (CSV, JSON indirme), onay pencereleri ve yazdırma. */}
      <YalitilmisCerceve
        baslik="CNC Kurulum Motoru"
        sinif="tc-cnc-kurulum-cerceve"
        sayfa={sayfa}
        izinler={['allow-downloads', 'allow-modals']}
        iletiGeldi={iletiGeldi}
      />
    </div>
  );
}
