import { useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { Ayrinti } from '#paylasilan/sozlesme/saglik.ts';
import type {
  GuncellemeKanali, GuncellemeKuruluSurum, GuncellemeListePaketi, GuncellemePaketi, GuncellemePaketleriCevabi, GuncellemeParcasiCevabi,
  GuncellemeParcasiGovdesi, GuncellemeUygulamaIstegi, GuncellemeUygulamaSonucu,
} from '#paylasilan/sozlesme/ayarlar.ts';
import { Dugme, DurumKutusu, Kart, OnayPenceresi, Rozet, Tablo, useBildirim, type RozetTonu, type Sutun } from '../../ortak/arayuz/index.ts';
import { api, hataIletisi } from '../../ortak/veri/api.ts';
import { yeniIstekKimligi } from '../../ortak/veri/istek-kimligi.ts';
import { useOturum } from '../../ortak/veri/oturum.ts';
import { DERLEME, derlemeTarihi, kisaCommit } from '../../ortak/veri/surum.ts';
import { anahtarlar } from './anahtarlar.ts';

// Sunucunun parça boyu ve paket sınırı (`paylasilan/sozlesme/ayarlar.ts`); sözleşme zod taşıdığı için burada sayı olarak durur.
export const PARCA_BAYT = 512 * 1024;
const AZAMI_BAYT = 200 * 1024 * 1024;

const KAPALI_METNI: Readonly<Record<Exclude<GuncellemeKanali, 'acik'>, string>> = {
  'dizin-yok': 'Sunucuda güncelleme klasörü tanımlı değil (TMIV2_GUNCELLEME_DIZINI).',
  'anahtar-yok': 'Sunucuda paket imza anahtarı tanımlı değil (TMIV2_GUNCELLEME_ANAHTARI).',
  'anahtar-gecersiz': 'Sunucudaki paket imza anahtarı geçersiz (TMIV2_GUNCELLEME_ANAHTARI).',
};

function parcaBase64(parca: Blob): Promise<string> {
  return new Promise((coz, reddet) => {
    const okuyucu = new FileReader();
    okuyucu.onload = () => { coz(String(okuyucu.result).replace(/^data:[^,]*,/, '')); };
    okuyucu.onerror = () => { reddet(new Error('Dosya okunamadı.')); };
    okuyucu.readAsDataURL(parca);
  });
}

// Parçalar sırayla gider: sunucu yükleme durumunu parça parça yazar. Yarıda kalan yükleme bir gün sonra sunucuda atılır.
export async function paketYukle(dosya: Blob, ilerle: (alinan: number, toplam: number) => void): Promise<GuncellemePaketi> {
  const kimlik = yeniIstekKimligi();
  const toplam = Math.ceil(dosya.size / PARCA_BAYT);
  for (let sira = 0; sira < toplam; sira++) {
    const govde: GuncellemeParcasiGovdesi = {
      boyut: dosya.size, sira, veri: await parcaBase64(dosya.slice(sira * PARCA_BAYT, (sira + 1) * PARCA_BAYT)),
    };
    const cevap = await api.post<GuncellemeParcasiCevabi>(`/guncelleme/yuklemeler/${kimlik}/parca`, govde);
    ilerle(cevap.alinan, cevap.toplam);
  }
  return api.post<GuncellemePaketi>(`/guncelleme/yuklemeler/${kimlik}/bitir`, {});
}

// Sunucuda henüz uygulanmamış göçler: adlar zaman damgasıyla başlar, sıralı karşılaştırma yeter.
// sonGoc undefined: sunucunun göç durumu okunamadı (yetki ya da hata); null: hiç göç uygulanmamış.
export function yeniGocSayisi(gocler: readonly string[], sonGoc: string | null | undefined): number | null {
  if (sonGoc === undefined) return null;
  return sonGoc === null ? gocler.length : gocler.filter((g) => g > sonGoc).length;
}

const SONUC_ROZETI: Readonly<Record<GuncellemeUygulamaSonucu['sonuc'], { ton: RozetTonu; metin: string }>> = {
  kuruldu: { ton: 'tamam', metin: 'Kuruldu' },
  'geri-alindi': { ton: 'uyari', metin: 'Geri alındı' },
  basarisiz: { ton: 'hata', metin: 'Başarısız' },
};

interface Silinecek { tur: 'paketler' | 'surumler'; commit: string; ad: string }

// Satırdaki düğme satır seçimini tetiklemez; neden silinemediği düğmenin ipucundadır.
function silDugmesi(silinemez: string | null, ad: string, sec: () => void) {
  return (
    <Dugme
      simge="trash" disabled={silinemez !== null} title={silinemez ?? undefined} aria-label={`${ad} sil`}
      onClick={(olay) => { olay.stopPropagation(); sec(); }}
    >
      Sil
    </Dugme>
  );
}

function sutunlar(
  sonGoc: string | null | undefined, calisan: string | null, sil: (p: GuncellemeListePaketi) => void,
): readonly Sutun<GuncellemeListePaketi>[] {
  return [
    { anahtar: 'surum', baslik: 'Sürüm', hucre: (p) => p.surum },
    { anahtar: 'commit', baslik: 'Commit', mono: true, kirilmaz: true, hucre: (p) => kisaCommit(p.commit) },
    { anahtar: 'tarih', baslik: 'Derleme', kirilmaz: true, hucre: (p) => derlemeTarihi(p.tarih, true) },
    { anahtar: 'degisiklik', baslik: 'Değişiklik', hizala: 'sag', hucre: (p) => p.degisiklikler.length },
    { anahtar: 'goc', baslik: 'Yeni göç', hizala: 'sag', hucre: (p) => yeniGocSayisi(p.gocler, sonGoc) ?? '?' },
    { anahtar: 'yuklenme', baslik: 'Yüklendi', kirilmaz: true, hucre: (p) => derlemeTarihi(p.yuklenme, true) },
    {
      anahtar: 'durum', baslik: 'Durum',
      hucre: (p) => {
        if (p.commit === calisan) return <Rozet ton="tamam">Çalışan sürüm</Rozet>;
        return p.uygulanamaz === null ? <Rozet ton="bilgi">Uygulanabilir</Rozet> : <Rozet ton="pasif">Uygulanamaz</Rozet>;
      },
    },
    { anahtar: 'sil', baslik: '', hucre: (p) => silDugmesi(p.silinemez, `${p.surum} paketini`, () => { sil(p); }) },
  ];
}

function surumSutunlari(
  uygulaniyor: string | null, sil: (s: GuncellemeKuruluSurum) => void,
): readonly Sutun<GuncellemeKuruluSurum>[] {
  return [
    { anahtar: 'surum', baslik: 'Sürüm', hucre: (s) => s.surum ?? 'Paketi silinmiş' },
    { anahtar: 'commit', baslik: 'Commit', mono: true, kirilmaz: true, hucre: (s) => kisaCommit(s.commit) },
    { anahtar: 'tarih', baslik: 'Derleme', kirilmaz: true, hucre: (s) => (s.tarih === null ? '?' : derlemeTarihi(s.tarih, true)) },
    {
      anahtar: 'durum', baslik: 'Durum',
      hucre: (s) => {
        if (s.calisan) return <Rozet ton="tamam">Çalışan sürüm</Rozet>;
        return s.commit === uygulaniyor ? <Rozet ton="uyari">Kuruluyor</Rozet> : <Rozet ton="pasif">Eski sürüm</Rozet>;
      },
    },
    { anahtar: 'sil', baslik: '', hucre: (s) => silDugmesi(s.silinemez, `${s.surum ?? kisaCommit(s.commit) ?? ''} sürümünü`, () => { sil(s); }) },
  ];
}

function PaketAyrintisi({ paket, yeniGoc }: { paket: GuncellemePaketi; yeniGoc: number | null }) {
  return (
    <section className="tc-ayar-metin tc-guncelleme-ayrinti" aria-label={`${paket.surum} değişiklikleri`}>
      <p className="tc-ayar-baslik">{paket.surum} ile gelenler</p>
      <p className="tc-ayar-aciklama">
        {paket.gocler.length} göç taşır; {yeniGoc === null ? 'sunucuda kaçının yeni olduğu okunamadı' : `${yeniGoc} tanesi sunucuda henüz yok`}.
      </p>
      {paket.not !== null && <p className="tc-ayar-aciklama">{paket.not}</p>}
      {paket.degisiklikler.length === 0
        ? <p className="tc-ayar-aciklama">Pakette değişiklik listesi yok.</p>
        : <ul className="tc-guncelleme-liste">{paket.degisiklikler.map((d, i) => <li key={i}>{d}</li>)}</ul>}
    </section>
  );
}

export function Guncelleme() {
  const istemci = useQueryClient();
  const { bildir } = useBildirim();
  const secici = useRef<HTMLInputElement>(null);
  const [ilerleme, setIlerleme] = useState<{ alinan: number; toplam: number } | null>(null);
  const [secilen, setSecilen] = useState<string | null>(null);
  const [onay, setOnay] = useState(false);
  const [uygulaniyor, setUygulaniyor] = useState(false);
  const [silinecek, setSilinecek] = useState<Silinecek | null>(null);
  const [siliniyor, setSiliniyor] = useState(false);
  // Yeni göç sayısı sunucunun son göçüyle çıkar; o bilgi yalnız sağlık ayrıntısını okuyabilene açıktır.
  const okur = useOturum().data?.islemler.includes('saglik.ayrinti-oku') === true;
  const ayrinti = useQuery({ queryKey: anahtarlar.saglikAyrinti, queryFn: () => api.get<Ayrinti>('/saglik/ayrinti'), enabled: okur });
  const liste = useQuery({
    queryKey: anahtarlar.guncellemePaketleri,
    queryFn: () => api.get<GuncellemePaketleriCevabi>('/guncelleme/paketler'),
  });

  const secildi = async (dosya: File | undefined) => {
    if (secici.current) secici.current.value = '';
    if (!dosya) return;
    if (dosya.size === 0 || dosya.size > AZAMI_BAYT) { bildir('hata', 'Paket boş olamaz; en çok 200 MB olabilir.'); return; }
    setIlerleme({ alinan: 0, toplam: Math.ceil(dosya.size / PARCA_BAYT) });
    try {
      const paket = await paketYukle(dosya, (alinan, toplam) => { setIlerleme({ alinan, toplam }); });
      bildir('tamam', `${paket.surum} (${kisaCommit(paket.commit) ?? ''}) paketi yüklendi ve imzası doğrulandı.`);
    } catch (hata) {
      bildir('hata', hataIletisi(hata, 'Paket yüklenemedi.'));
    } finally {
      setIlerleme(null);
      await istemci.invalidateQueries({ queryKey: anahtarlar.guncellemePaketleri });
    }
  };

  const uygula = async (paket: GuncellemeListePaketi) => {
    setUygulaniyor(true);
    try {
      await api.post<GuncellemeUygulamaIstegi>(`/guncelleme/paketler/${paket.commit}/uygula`, {});
      bildir('tamam', `${paket.surum} uygulanacak: önce yedek alınır, sunucu birkaç dakika kapalı kalır. Sonra sayfayı yenileyin.`);
      setOnay(false);
    } catch (hata) {
      bildir('hata', hataIletisi(hata, 'Uygulama istenemedi.'));
    } finally {
      setUygulaniyor(false);
      await istemci.invalidateQueries({ queryKey: anahtarlar.guncellemePaketleri });
    }
  };

  const sil = async (hedef: Silinecek) => {
    setSiliniyor(true);
    try {
      await api.post<{ commit: string }>(`/guncelleme/${hedef.tur}/${hedef.commit}/sil`, {});
      bildir('tamam', `${hedef.ad} silindi.`);
      setSilinecek(null);
    } catch (hata) {
      bildir('hata', hataIletisi(hata, 'Silinemedi.'));
    } finally {
      setSiliniyor(false);
      await istemci.invalidateQueries({ queryKey: anahtarlar.guncellemePaketleri });
    }
  };

  const kanal = liste.data?.kanal;
  const sonGoc = ayrinti.data?.sonGoc;
  const paketler = liste.data?.paketler ?? [];
  const gosterilen = paketler.find((p) => p.commit === secilen) ?? paketler[0];
  const calisan = liste.data ? liste.data.calisan.commit ?? DERLEME.commit : DERLEME.commit;
  const bekleyen = liste.data?.bekleyen ?? null;
  const surumler = liste.data?.surumler ?? [];
  const kuruluyor = liste.data?.uygulaniyor?.commit ?? null;
  const sonUygulama = liste.data?.sonUygulama ?? null;
  const uygulamaEngeli = !liste.data || kanal !== 'acik' || !gosterilen ? 'Uygulanacak paket yok.'
    : !liste.data.guncelleyici ? 'Sunucu güncelleyiciyle açılmadı; paket uygulanamaz ("npm run baslat").'
      : kuruluyor !== null ? `${kisaCommit(kuruluyor) ?? ''} şu an kuruluyor.`
      : bekleyen !== null ? `${kisaCommit(bekleyen.commit) ?? ''} uygulanmayı bekliyor; sunucu birazdan yeniden başlar.`
      : liste.data.yedek.dizin === null ? 'Yedek klasörü seçilmedi; yedeksiz güncelleme yapılmaz. Sistem Ayarları > Yedekler bölümünden klasör seçin.'
      : !liste.data.yedek.hazir ? `Yedek klasörü sunucuda yok (${liste.data.yedek.dizin}); Yedekler bölümünden geçerli bir klasör seçin.`
        : gosterilen.uygulanamaz;
  return (
    <>
      <Kart baslik="Güncelleme paketi yükle">
        {liste.isPending && <DurumKutusu durum="yukleniyor" />}
        {liste.isError && (
          <DurumKutusu durum="hata" mesaj={hataIletisi(liste.error, 'Güncelleme kanalı okunamadı.')} yenile={() => { void liste.refetch(); }} />
        )}
        {kanal !== undefined && (
          <div className="tc-ayar">
            <div className="tc-ayar-metin">
              <p className="tc-ayar-baslik">
                {kanal === 'acik' ? <Rozet ton="tamam">Kanal açık</Rozet> : <Rozet ton="pasif">Kanal kapalı</Rozet>}
              </p>
              <p className="tc-ayar-aciklama">
                {kanal === 'acik'
                  ? 'İmzalı .tmip paketini seçin; en çok 200 MB. Paket saklanır; uygulamak için aşağıdan seçin.'
                  : KAPALI_METNI[kanal]}
              </p>
              {ilerleme && <p className="tc-ayar-aciklama" role="status">Yükleniyor: {ilerleme.alinan} / {ilerleme.toplam} parça</p>}
            </div>
            <div className="tc-ayar-sayi">
              <input
                ref={secici} type="file" accept=".tmip" hidden aria-label="Güncelleme paketi"
                onChange={(olay) => { void secildi(olay.target.files?.[0]); }}
              />
              <Dugme
                tur="birincil" simge="upload" disabled={kanal !== 'acik'} yukleniyor={ilerleme !== null}
                onClick={() => secici.current?.click()}
              >
                Paket yükle
              </Dugme>
            </div>
          </div>
        )}
      </Kart>
      <Kart baslik="Yüklenen paketler">
        <div className="tc-ayar">
          <div className="tc-ayar-metin">
            <p className="tc-ayar-aciklama">
              {uygulamaEngeli ?? `${gosterilen?.surum ?? ''} uygulanabilir: önce veritabanı ${liste.data?.yedek.dizin ?? ''} klasörüne yedeklenir, sonra kurulur ve göçler koşar; sorun olursa önceki sürüme dönülür.`}
            </p>
            {sonUygulama && (
              <p className="tc-ayar-aciklama" role="status">
                Son uygulama: {sonUygulama.surum} <Rozet ton={SONUC_ROZETI[sonUygulama.sonuc].ton}>{SONUC_ROZETI[sonUygulama.sonuc].metin}</Rozet>{' '}
                {derlemeTarihi(sonUygulama.bitis, true)}
                {sonUygulama.hata !== null && ` · ${sonUygulama.adim ?? ''}: ${sonUygulama.hata}`}
              </p>
            )}
          </div>
          <Dugme simge="rotate" disabled={uygulamaEngeli !== null} onClick={() => { setOnay(true); }}>Uygula</Dugme>
        </div>
        {liste.data && (
          <Tablo
            etiket="Yüklenen güncelleme paketleri" satirlar={paketler}
            sutunlar={sutunlar(sonGoc, calisan, (p) => { setSilinecek({ tur: 'paketler', commit: p.commit, ad: `${p.surum} paketi` }); })} satirAnahtari={(p) => p.commit}
            satirSec={(p) => { setSecilen(p.commit); }} bosMesaj="Yüklenmiş paket yok."
          />
        )}
        {gosterilen && <PaketAyrintisi paket={gosterilen} yeniGoc={yeniGocSayisi(gosterilen.gocler, sonGoc)} />}
      </Kart>
      {kanal === 'acik' && (
        <Kart baslik="Kurulu sürümler">
          <p className="tc-ayar-aciklama">
            Uygulanan her sürüm sunucuda kendi klasöründe kalır. Eski sürümü silmek yer açar; çalışan sürüm silinemez.
          </p>
          <Tablo
            etiket="Kurulu sürümler" satirlar={surumler} satirAnahtari={(s) => s.commit}
            sutunlar={surumSutunlari(kuruluyor, (s) => {
              setSilinecek({ tur: 'surumler', commit: s.commit, ad: `${s.surum ?? kisaCommit(s.commit) ?? ''} sürümü` });
            })}
            bosMesaj="Güncelleyiciyle kurulmuş sürüm yok."
          />
        </Kart>
      )}
      {silinecek && (
        <OnayPenceresi
          acik baslik={`${silinecek.ad} silinsin mi?`} onayMetni="Sil" tehlikeli yukleniyor={siliniyor}
          onayla={() => { void sil(silinecek); }} vazgec={() => { setSilinecek(null); }}
        >
          <p>
            {silinecek.tur === 'paketler'
              ? 'Paket dosyası sunucudan silinir; bu sürümü yeniden uygulamak için paket yeniden yüklenmelidir.'
              : 'Sürüm klasörü sunucudan silinir. Veritabanına ve çalışan sürüme dokunulmaz.'}
          </p>
        </OnayPenceresi>
      )}
      {gosterilen && (
        <OnayPenceresi
          acik={onay} baslik={`${gosterilen.surum} uygulansın mı?`} onayMetni="Uygula" tehlikeli yukleniyor={uygulaniyor}
          onayla={() => { void uygula(gosterilen); }} vazgec={() => { setOnay(false); }}
        >
          <p>
            Sunucu durur, veritabanı yedeklenir, yeni sürüm kurulur ve {yeniGocSayisi(gosterilen.gocler, sonGoc) ?? '?'} yeni göç koşar.
            Bu sürede kimse sistemi kullanamaz. Bir adım bozulursa önceki sürüm ve yedekteki veritabanı geri gelir.
          </p>
        </OnayPenceresi>
      )}
    </>
  );
}
