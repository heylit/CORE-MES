import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { Ayrinti, OtomatikAcilis } from '#paylasilan/sozlesme/saglik.ts';
import type {
  GuncellemeGecmisKaydi, GuncellemeKanali, GuncellemeKuruluSurum, GuncellemeListePaketi, GuncellemePaketi, GuncellemePaketleriCevabi,
  GuncellemeParcasiCevabi, GuncellemeParcasiGovdesi, GuncellemeUygulamaIstegi, GuncellemeUygulamaSonucu, PaketTaramaSayilari, PaketTaramasi,
  BekciDurumu, SunucuSureciCevabi, YenidenBaslatCevabi,
} from '#paylasilan/sozlesme/ayarlar.ts';
import { Dugme, DurumKutusu, Kart, OnayPenceresi, Rozet, Simge, Tablo, useBildirim, type RozetTonu, type Sutun } from '../../ortak/arayuz/index.ts';
import { api, hataIletisi } from '../../ortak/veri/api.ts';
import { yeniIstekKimligi } from '../../ortak/veri/istek-kimligi.ts';
import { useOturum } from '../../ortak/veri/oturum.ts';
import { DERLEME, derlemeTarihi, kisaCommit } from '../../ortak/veri/surum.ts';
import { anahtarlar } from './anahtarlar.ts';
import { GuncellemeIlerlemesi } from './GuncellemeIlerlemesi.tsx';

// Sunucunun parça boyu ve paket sınırı (`paylasilan/sozlesme/ayarlar.ts`); sözleşme zod taşıdığı için burada sayı olarak durur.
export const PARCA_BAYT = 512 * 1024;
const AZAMI_BAYT = 300 * 1024 * 1024;
const AZAMI_MB = AZAMI_BAYT / 1024 / 1024;

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

const MB = 1024 * 1024;
// Küçük pakette tam MB sıfır görünmesin diye 10 MB altı tek ondalıkla yazılır.
const mbMetni = (bayt: number): string =>
  (bayt / MB).toLocaleString('tr-TR', { maximumFractionDigits: bayt < 10 * MB ? 1 : 0 });

interface Yukleme { alinan: number; toplam: number; bayt: number }

// Son parçadan sonra sunucu paketin imzasını ve içeriğini doğrular; o süre aktarımdan ayrı yazılır, ekran donmuş görünmesin.
function YuklemeIlerlemesi({ alinan, toplam, bayt }: Yukleme) {
  const yuzde = Math.floor((alinan / toplam) * 100);
  const bitti = alinan >= toplam;
  return (
    <div className="tc-guncelleme-aktarim" role="status">
      <progress max={toplam} value={alinan} aria-label={bitti ? 'Yükleme tamam' : `Yükleme yüzde ${String(yuzde)}`} />
      <p className="tc-ayar-aciklama">
        {bitti
          ? <><b>{mbMetni(bayt)} MB aktarıldı.</b> İmza ve içerik doğrulanıyor…</>
          : <><b>%{yuzde}</b> · {mbMetni(Math.min(alinan * PARCA_BAYT, bayt))} / {mbMetni(bayt)} MB aktarıldı</>}
      </p>
    </div>
  );
}

const ACILIS: Readonly<Record<OtomatikAcilis['durum'], { ton: RozetTonu; metin: string; uyari: string | null }>> = {
  kurulu: { ton: 'tamam', metin: 'Kurulu', uyari: null },
  kapali: {
    ton: 'uyari', metin: 'Kurulu, kapalı',
    uyari: 'Görev kapalı ya da "Başlangıçta" tetikleyicisi yok; bilgisayar başlarken sunucu açılmaz. Bilgi işlem Görev Zamanlayıcı\'dan düzeltir.',
  },
  'kurulu-degil': {
    ton: 'uyari', metin: 'Kurulu değil',
    uyari: 'Görev yok ya da sunucu hesabı göremiyor. Elektrik kesintisinden sonra sunucu kendiliğinden açılmaz; görevi bilgi işlem yönetici hesabıyla kurar (kurulum belgesi: servis, 3. bölüm).',
  },
  bilinmiyor: { ton: 'pasif', metin: 'Bilinmiyor', uyari: 'Görev Zamanlayıcı okunamadı.' },
};

const BEKCI_ROZETI: Readonly<Record<BekciDurumu, { ton: RozetTonu; metin: string }>> = {
  var: { ton: 'tamam', metin: 'Bekçi açık' },
  yok: { ton: 'uyari', metin: 'Bekçi yok' },
  bilinmiyor: { ton: 'pasif', metin: 'Bekçi bilinmiyor' },
};

const BEKCISIZ_METNI: Readonly<Record<Exclude<BekciDurumu, 'var'>, string>> = {
  yok: 'Sunucu bekçiyle açılmadı (ör. konsoldan "npm run baslat"). Kapanırsa kendiliğinden açılmaz; yeniden başlatma sunucu bilgisayarından yapılır. Bekçiyle açmak için kurulum belgesi: kurulum/servis.md.',
  bilinmiyor: 'Sunucunun bekçiyle açıldığı doğrulanamadı; kapanırsa açılmayabilir. Yeniden başlatma sunucu bilgisayarından yapılır.',
};

// Açılış bu süreyi geçince ekran beklemeyi sürdürür ama uyarır: .env'deki değişiklik açılışı bozmuş olabilir.
export const GEC_ACILIS_SN = 5 * 60;
const YOKLAMA_MS = 3000;

export function sureMetni(sn: number): string {
  const dk = Math.floor(sn / 60);
  return dk === 0 ? `${String(sn)} sn` : `${String(dk)} dk ${String(sn % 60)} sn`;
}

interface Suren { baslangic: number; oncekiAcilis: string; kapandi: boolean }

// Sunucu kapanınca yoklama hata verir (kapandı görüldü); açılış anı değişince yeni süreç gelmiştir.
function YenidenBaslatma() {
  const { bildir } = useBildirim();
  const [onay, setOnay] = useState(false);
  const [isteniyor, setIsteniyor] = useState(false);
  const [suren, setSuren] = useState<Suren | null>(null);
  const [sonSure, setSonSure] = useState<number | null>(null);
  const [an, setAn] = useState(() => Date.now());
  const durum = useQuery({
    queryKey: anahtarlar.sunucuSureci,
    queryFn: () => api.get<SunucuSureciCevabi>('/sunucu-sureci'),
    refetchInterval: suren ? YOKLAMA_MS : false,
    retry: suren ? false : 3,
  });
  useEffect(() => {
    if (!suren) return undefined;
    const sayac = setInterval(() => { setAn(Date.now()); }, 1000);
    return () => { clearInterval(sayac); };
  }, [suren]);
  useEffect(() => {
    if (!suren) return;
    if (durum.isError && !suren.kapandi) { setSuren({ ...suren, kapandi: true }); return; }
    if (durum.data && durum.data.acilis !== suren.oncekiAcilis) {
      const sn = Math.round((Date.now() - suren.baslangic) / 1000);
      setSuren(null);
      setSonSure(sn);
      bildir('tamam', `Sunucu yeniden açıldı (${sureMetni(sn)}).`);
    }
  }, [durum.data, durum.isError, suren, bildir]);

  const baslat = async () => {
    setIsteniyor(true);
    try {
      const cevap = await api.post<YenidenBaslatCevabi>('/sunucu-sureci/yeniden-baslat', {});
      setSuren({ baslangic: Date.now(), oncekiAcilis: cevap.acilis, kapandi: false });
      setAn(Date.now());
      setSonSure(null);
      setOnay(false);
    } catch (hata) {
      bildir('hata', hataIletisi(hata, 'Yeniden başlatma istenemedi.'));
      setOnay(false);
      void durum.refetch();
    } finally {
      setIsteniyor(false);
    }
  };

  const veri = durum.data;
  const gecen = suren ? Math.max(0, Math.round((an - suren.baslangic) / 1000)) : 0;
  const gec = suren !== null && gecen >= GEC_ACILIS_SN;
  const engel = suren ? 'Yeniden başlatma sürüyor.'
    : !veri ? null
      : veri.bekci !== 'var' ? BEKCISIZ_METNI[veri.bekci]
        : veri.guncellemeSuruyor ? 'Güncelleme istendi ya da kuruluyor. Bitmeden sunucu yeniden başlatılamaz; güncelleme sonunda sunucu zaten yeniden açılır.'
          : null;
  const rozet = suren
    ? (gec ? { ton: 'hata' as const, metin: `Açılmadı · ${String(Math.floor(gecen / 60))} dk` } : { ton: 'bilgi' as const, metin: `Sürüyor · ${sureMetni(gecen)}` })
    : veri?.guncellemeSuruyor === true && veri.bekci === 'var' ? { ton: 'pasif' as const, metin: 'Güncelleme sürüyor' }
      : veri ? BEKCI_ROZETI[veri.bekci] : null;
  return (
    <>
      <div className="tc-ayar">
        <div className="tc-ayar-metin">
          <p className="tc-ayar-baslik">{suren ? 'Yeniden başlatılıyor' : 'Yeniden başlat'} {rozet && <Rozet ton={rozet.ton}>{rozet.metin}</Rozet>}</p>
          {durum.isPending && <DurumKutusu durum="yukleniyor" />}
          {durum.isError && !suren && (
            <DurumKutusu durum="hata" mesaj={hataIletisi(durum.error, 'Sunucu süreci okunamadı.')} yenile={() => { void durum.refetch(); }} />
          )}
          {suren ? (
            <div role="status">
              <p className="tc-ayar-aciklama tc-ayar-simgeli">
                <Simge ad="check" boyut="k" /> İstendi{suren.kapandi && <> · <Simge ad="check" boyut="k" /> Sunucu kapandı</>} · <Simge ad="rotate" boyut="k" /> Yeniden açılıyor
              </p>
              <progress aria-label="Yeniden başlatma sürüyor" />
              <p className={gec ? 'tc-ayar-aciklama tc-ayar-simgeli' : 'tc-ayar-aciklama'}>
                {gec
                  ? <><Simge ad="alert" boyut="k" /> Sunucu {String(Math.floor(gecen / 60))} dakikadır cevap vermiyor. .env'deki son değişiklik açılışı bozmuş olabilir. Sunucu bilgisayarında günlük: <code>TMIV2-GUNLUK\bekci.log</code>. Ekran beklemeyi sürdürür.</>
                  : 'Bu sayfayı kapatmanız işi durdurmaz. Açılış 1 ile 3 dakika sürebilir.'}
              </p>
            </div>
          ) : (
            <>
              {sonSure !== null && <p className="tc-ayar-aciklama tc-ayar-simgeli" role="status"><Simge ad="check" boyut="k" /> Sunucu yeniden açıldı ({sureMetni(sonSure)}); .env yeniden okundu.</p>}
              {engel !== null
                ? <p className="tc-ayar-aciklama tc-ayar-simgeli"><Simge ad="alert" boyut="k" /> {engel}</p>
                : veri && sonSure === null && <p className="tc-ayar-aciklama">.env değişikliğinden sonra kullanın. Sunucu kapanır, bekçi yeniden açar; açılış 1 ile 3 dakika sürebilir, o sürede kimse sistemi kullanamaz.</p>}
              {veri && <p className="tc-ayar-aciklama tc-ayar-simgeli"><Simge ad="clock" boyut="k" /> Sunucu {derlemeTarihi(veri.acilis, true)} tarihinden beri açık.</p>}
            </>
          )}
        </div>
        <Dugme simge="rotate" disabled={!veri || engel !== null} title={engel ?? undefined} onClick={() => { setOnay(true); }}>
          Sunucuyu yeniden başlat
        </Dugme>
      </div>
      <OnayPenceresi
        acik={onay} baslik="Sunucu yeniden başlatılsın mı?" onayMetni="Yeniden başlat" tehlikeli yukleniyor={isteniyor}
        onayla={() => { void baslat(); }} vazgec={() => { setOnay(false); }}
      >
        <ul>
          <li>Sunucu süren işleri en çok 10 sn bekleyip kapanır, bekçi yeniden açar.</li>
          <li>Açılış 1 ile 3 dakika sürer; o sürede kimse sistemi kullanamaz, terminaller bağlantıyı bekler.</li>
          <li>.env yeniden okunur. Kapı (TMIV2_PORT) ya da güncelleme klasörü değiştiyse bekçinin de sunucu bilgisayarında yeniden açılması gerekir.</li>
        </ul>
      </OnayPenceresi>
    </>
  );
}

// Otomatik açılış yalnız gösterilir: görevi kurmak ve değiştirmek yönetici hesabı ister, uygulamanın işi değildir. null: sunucu
// Windows'ta değil; undefined: sağlık ayrıntısı okunamadı (yetki) ya da eski sunucu.
function SunucuAcilisi({ acilis }: { acilis: OtomatikAcilis | null | undefined }) {
  const durum = ACILIS[acilis?.durum ?? 'bilinmiyor'];
  const uyari = acilis === null ? 'Sunucu Windows\'ta çalışmıyor; Görev Zamanlayıcı okunmadı.' : durum.uyari;
  return (
    <Kart baslik="Sunucu açılışı" simge="bolt">
      {acilis !== undefined && (
        <>
          <p>Bilgisayar başlarken otomatik açılış <Rozet ton={durum.ton}>{durum.metin}</Rozet></p>
          {acilis && <p className="tc-ayar-aciklama">Görev adı: {acilis.gorevAdi}</p>}
          {uyari !== null && <p className="tc-ayar-aciklama tc-ayar-simgeli"><Simge ad="alert" boyut="k" /> {uyari}</p>}
        </>
      )}
      <YenidenBaslatma />
    </Kart>
  );
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

// Paket taraması (2163): rozet bütün ağacın en yüksek seviyesini söyler (2160-1 b). Kritik ve yüksek hata, orta ve düşük bilgi tonundadır:
// geliştirme araçlarındaki orta seviyeli açık her pakette bulunabilir, uyarı rengini sürekli yakmasın.
export function taramaRozeti(tarama: PaketTaramasi | null): { ton: RozetTonu; metin: string } {
  if (tarama === null) return { ton: 'pasif', metin: 'Tarama yok' };
  if (tarama.durum === 'yapilamadi') return { ton: 'uyari', metin: 'Yapılamadı' };
  const { kritik, yuksek, orta, dusuk } = tarama.tum;
  if (kritik > 0) return { ton: 'hata', metin: `${kritik} kritik` };
  if (yuksek > 0) return { ton: 'hata', metin: `${yuksek} yüksek` };
  if (orta > 0) return { ton: 'bilgi', metin: `${orta} orta` };
  if (dusuk > 0) return { ton: 'bilgi', metin: `${dusuk} düşük` };
  return { ton: 'tamam', metin: 'Açık yok' };
}

const sayilarMetni = (s: PaketTaramaSayilari): string => `${s.kritik} kritik, ${s.yuksek} yüksek, ${s.orta} orta, ${s.dusuk} düşük`;

function TaramaAyrintisi({ tarama }: { tarama: PaketTaramasi | null }) {
  if (tarama === null) return <p className="tc-ayar-aciklama">Paket taraması yok: paket bu özellikten önce hazırlanmış.</p>;
  if (tarama.durum === 'yapilamadi') {
    return (
      <p className="tc-ayar-aciklama" role="note">
        <Simge ad="alert" boyut="k" /> Paket taraması yapılamadı ({derlemeTarihi(tarama.zaman, true)}): paket imzalı ve geçerli, açık durumu bilinmiyor.
      </p>
    );
  }
  return (
    <>
      <p className="tc-ayar-aciklama"><Simge ad="scan" boyut="k" /> Paket taraması, {derlemeTarihi(tarama.zaman, true)}</p>
      <p className="tc-ayar-aciklama">Sunucuda çalışan paketler: {sayilarMetni(tarama.canli)}</p>
      <p className="tc-ayar-aciklama">Bütün paketler (geliştirme araçları dahil): {sayilarMetni(tarama.tum)}</p>
    </>
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
    {
      anahtar: 'tarama', baslik: 'Paket taraması',
      hucre: (p) => { const r = taramaRozeti(p.tarama); return <Rozet ton={r.ton}>{r.metin}</Rozet>; },
    },
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

// Kurulumdan önce çalışan ve kurulan sürüm yan yana: hangi yayınların atlandığı buradan okunur.
const GECMIS_SUTUNLARI: readonly Sutun<GuncellemeGecmisKaydi>[] = [
  { anahtar: 'bitis', baslik: 'Tarih', kirilmaz: true, hucre: (k) => derlemeTarihi(k.bitis, true) },
  { anahtar: 'onceki', baslik: 'Önceki', hucre: (k) => k.onceki ?? '?' },
  { anahtar: 'surum', baslik: 'Kurulan', hucre: (k) => k.surum },
  { anahtar: 'commit', baslik: 'Commit', mono: true, kirilmaz: true, hucre: (k) => kisaCommit(k.commit) },
  { anahtar: 'sonuc', baslik: 'Sonuç', hucre: (k) => <Rozet ton={SONUC_ROZETI[k.sonuc].ton}>{SONUC_ROZETI[k.sonuc].metin}</Rozet> },
  { anahtar: 'hata', baslik: 'Ayrıntı', hucre: (k) => (k.hata === null ? '' : `${k.adim ?? ''}: ${k.hata}`) },
];

function PaketAyrintisi({ paket, yeniGoc }: { paket: GuncellemeListePaketi; yeniGoc: number | null }) {
  return (
    <section className="tc-ayar-metin tc-guncelleme-ayrinti" aria-label={`${paket.surum} değişiklikleri`}>
      <p className="tc-ayar-baslik">{paket.surum} ile gelenler</p>
      <p className="tc-ayar-aciklama">
        {paket.gocler.length} göç taşır; {yeniGoc === null ? 'sunucuda kaçının yeni olduğu okunamadı' : `${yeniGoc} tanesi sunucuda henüz yok`}.
      </p>
      {paket.not !== null && <p className="tc-ayar-aciklama">{paket.not}</p>}
      {paket.atlama !== null && <p className="tc-ayar-aciklama" role="note"><Simge ad="alert" boyut="k" /> {paket.atlama}</p>}
      <TaramaAyrintisi tarama={paket.tarama} />
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
  const [ilerleme, setIlerleme] = useState<Yukleme | null>(null);
  const [secilen, setSecilen] = useState<string | null>(null);
  const [onay, setOnay] = useState(false);
  const [uygulaniyor, setUygulaniyor] = useState(false);
  const [istenen, setIstenen] = useState<{ commit: string; an: string } | null>(null);
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
    if (dosya.size === 0 || dosya.size > AZAMI_BAYT) { bildir('hata', `Paket boş olamaz; en çok ${String(AZAMI_MB)} MB olabilir.`); return; }
    setIlerleme({ alinan: 0, toplam: Math.ceil(dosya.size / PARCA_BAYT), bayt: dosya.size });
    try {
      const paket = await paketYukle(dosya, (alinan, toplam) => { setIlerleme({ alinan, toplam, bayt: dosya.size }); });
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
      const istek = await api.post<GuncellemeUygulamaIstegi>(`/guncelleme/paketler/${paket.commit}/uygula`, {});
      setIstenen({ commit: istek.commit, an: istek.istenme });
      bildir('tamam', `${paket.surum} uygulanacak: önce yedek alınır, sunucu birkaç dakika kapalı kalır. Adımlar bu sayfada görünür.`);
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
  // Eski sunucu alanı taşımaz.
  const gecmis = liste.data?.gecmis ?? [];
  const uygulamaEngeli = !liste.data || kanal !== 'acik' || !gosterilen ? 'Uygulanacak paket yok.'
    : !liste.data.guncelleyici ? 'Sunucu güncelleyiciyle açılmadı; paket uygulanamaz ("npm run baslat").'
      : kuruluyor !== null ? `${kisaCommit(kuruluyor) ?? ''} şu an kuruluyor.`
      : bekleyen !== null ? `${kisaCommit(bekleyen.commit) ?? ''} için kurulum istendi; ilerleme aşağıda.`
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
                  ? `İmzalı .tmip paketini seçin; en çok ${String(AZAMI_MB)} MB. Paket saklanır; uygulamak için aşağıdan seçin.`
                  : KAPALI_METNI[kanal]}
              </p>
              {ilerleme && <YuklemeIlerlemesi {...ilerleme} />}
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
        <GuncellemeIlerlemesi veri={liste.data} istenen={istenen} />
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
      {kanal === 'acik' && (
        <Kart baslik="Uygulama geçmişi">
          <p className="tc-ayar-aciklama">
            Her uygulama, sonucu ne olursa olsun buraya yazılır; kayıt silinmez. Önceki ile kurulan arasındaki yayınlar atlanmıştır.
          </p>
          <Tablo
            etiket="Uygulama geçmişi" satirlar={gecmis} sutunlar={GECMIS_SUTUNLARI}
            satirAnahtari={(k) => `${k.bitis}-${k.commit}`} bosMesaj="Güncelleyici henüz paket uygulamadı."
          />
        </Kart>
      )}
      <SunucuAcilisi acilis={ayrinti.data?.otomatikAcilis} />
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
          {gosterilen.atlama !== null && <p><Simge ad="alert" boyut="k" /> {gosterilen.atlama}</p>}
        </OnayPenceresi>
      )}
    </>
  );
}
