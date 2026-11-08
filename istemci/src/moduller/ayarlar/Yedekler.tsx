import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  DosyaDeposuDurumu, Yedek, YedekAlani, YedekAlCevabi, YedekDiziniCevabi, YedekDiziniKaynagi, YedekDurumu, YedekIndirmeIzniCevabi, YedeklerCevabi,
} from '#paylasilan/sozlesme/ayarlar.ts';
import type { DisKopyaKaydi, GunIciKoruma as GunIciKorumaVerisi, WalArsivi } from '#paylasilan/sozlesme/saglik.ts';
import { Dugme, DurumKutusu, Girdi, Kart, Rozet, Tablo, useBildirim, type Sutun } from '../../ortak/arayuz/index.ts';
import { api, hataIletisi } from '../../ortak/veri/api.ts';
import { derlemeTarihi } from '../../ortak/veri/surum.ts';
import { useSaglikAyrintisi } from '../sistem/disari.ts';
import { anahtarlar } from './anahtarlar.ts';

const KAPALI_METNI: Readonly<Record<Exclude<YedekDurumu, 'acik'>, string>> = {
  'dizin-yok': 'Yedek klasörü seçilmedi ya da sunucuda yok (TMIV2_YEDEK_DIZINI de tanımlı değil). Aşağıdan klasör seçin; kurulum: kurulum/yedek.md.',
  'anahtar-yok': 'Yedek anahtarı yok ya da geçersiz (TMIV2_YEDEK_ANAHTARI). Yedekler şifreli alınır; anahtarı bilgi işlem verir, kurulum: kurulum/yedek.md.',
};

const KAYNAK_METNI: Readonly<Record<YedekDiziniKaynagi, string>> = {
  ayar: 'Bu ekrandan seçildi.',
  ortam: 'Sunucu ayarından (TMIV2_YEDEK_DIZINI) geliyor.',
};

// Süren yedek bitene kadar liste kısa aralıkla yenilenir; sonra durur.
const SUREN_YENILEME_MS = 3000;

export function boyutMetni(bayt: number): string {
  if (bayt < 1024 * 1024) return `${(bayt / 1024).toLocaleString('tr-TR', { maximumFractionDigits: 1 })} KB`;
  return `${(bayt / 1024 / 1024).toLocaleString('tr-TR', { maximumFractionDigits: 1 })} MB`;
}

// Yedek alanı ve depo GB ölçeğinde büyür; 1 GB altı liste boyutuyla aynı yazılır.
export function alanMetni(bayt: number): string {
  if (bayt < 1024 ** 3) return boyutMetni(bayt);
  return `${(bayt / 1024 ** 3).toLocaleString('tr-TR', { maximumFractionDigits: 1 })} GB`;
}

// Kart 1763: yedeğin ve dosya deposunun büyüyünce isteyeceği yer. Bilinmeyen değer yazılmaz, uydurulmaz.
function YedekAlaniSatiri({ alan, depo }: { alan: YedekAlani | null; depo: DosyaDeposuDurumu }) {
  const alanMetinleri = alan === null ? null : [
    alan.gereken === null
      ? 'Henüz yedek yok; gereken yer ilk yedekten sonra hesaplanır.'
      : `Tahmini yedek alanı ${alanMetni(alan.gereken)} (son yedek ${alanMetni(alan.sonBoyut ?? 0)} × ${String(alan.adet)} yedek).`,
    `Şimdiki yedekler ${alanMetni(alan.mevcut)}.`,
    alan.bosYer === null ? 'Yedek diskinin boş yeri okunamadı.' : `Yedek diskinde boş ${alanMetni(alan.bosYer)}.`,
  ].join(' ');
  return (
    <div className="tc-ayar">
      <div className="tc-ayar-metin">
        <p className="tc-ayar-baslik">
          Yedek alanı
          {alan?.yetmiyor === true && <>{' '}<Rozet ton="uyari">Yedek alanı yetmeyecek</Rozet></>}
          {depo.uyari && <>{' '}<Rozet ton="uyari">Dosya deposu dolmak üzere</Rozet></>}
        </p>
        {alanMetinleri !== null && <p className="tc-ayar-aciklama">{alanMetinleri}</p>}
        <p className="tc-ayar-aciklama">
          {`Dosya deposu ${alanMetni(depo.bayt)} / ${alanMetni(depo.sinir)}. Dosyalar veritabanında durur ve her yedeğe girer; depo büyüdükçe yedek de büyür.`}
        </p>
      </div>
    </div>
  );
}

// Taban yedeğin klasör adı kurulum/yedek.md'de yyyyMMdd'dir; başka adsa olduğu gibi yazılır.
export function tabanMetni(ad: string): string {
  const e = /^(\d{4})(\d{2})(\d{2})$/.exec(ad);
  return e === null ? ad : `${e[3] ?? ''}.${e[2] ?? ''}.${e[1] ?? ''}`;
}

function walMetni(w: WalArsivi | null): string {
  if (w === null) return 'WAL arşivinin durumu okunamadı.';
  if (!w.acik) return 'WAL arşivi kapalı: gün içi kayıt yalnız gece yedeğiyle korunur. Kurulum: kurulum/yedek.md, Gün içi kayıp.';
  const son = w.sonArsivZamani === null ? 'Henüz arşivlenmiş WAL yok.' : `Son arşiv ${derlemeTarihi(w.sonArsivZamani, true)}.`;
  const hata = w.hataSayisi === 0 ? 'Arşiv hatası yok.'
    : `Arşiv hatası ${String(w.hataSayisi)}${w.sonHataZamani === null ? '' : `, sonuncusu ${derlemeTarihi(w.sonHataZamani, true)}`}.`;
  return `${son} ${hata}`;
}

function disKopyaMetni(son: DisKopyaKaydi | null, basarili: DisKopyaKaydi | null): string {
  if (basarili === null) return son === null ? 'Şifreli dış kopya hiç alınmamış.' : 'Başarılı şifreli dış kopya yok.';
  const parcalar = [`Son dış kopya ${derlemeTarihi(basarili.zaman, true)}.`];
  if (basarili.walAdet !== null) {
    parcalar.push(`${String(basarili.walAdet)} WAL dosyası${basarili.walBayt === null ? '' : ` (${alanMetni(basarili.walBayt)})`}.`);
  }
  if (son !== null && son.sonuc === 'basarisiz') parcalar.push(`Son deneme ${derlemeTarihi(son.zaman, true)} başarısız: ${son.hata ?? 'ayrıntı yok'}.`);
  return parcalar.join(' ');
}

// Taban yedeğin klasörünü uygulama okuyamaz (2283-1 a+e: yalnız PostgreSQL hesabı ve yönetici); son taban dış kopya kaydından gelir.
function tabanSatiri(basarili: DisKopyaKaydi | null): string {
  if (basarili === null || basarili.taban === null) return 'Son taban yedek dış kopya kaydından okunur; henüz kayıt yok.';
  return `Son taban yedek ${tabanMetni(basarili.taban)}${basarili.tabanBayt === null ? '' : `, ${alanMetni(basarili.tabanBayt)}`} (son dış kopyadaki).`;
}

// Kart 2282b: gece yedeğinin arasındaki kaybı WAL arşivi ve şifreli dış kopya kapatır (2276-1 a, 2283-2 a). Veri sağlık ayrıntısındandır;
// işlemi (saglik.ayrinti-oku) olmayana bölüm çıkmaz.
export function GunIciKorumaBolumu({ veri }: { veri: GunIciKorumaVerisi }) {
  const { walArsivi: w, sonDisKopya: son, sonBasariliDisKopya: basarili } = veri;
  const walRozeti = w === null ? <Rozet ton="pasif">Bilinmiyor</Rozet>
    : !w.acik ? <Rozet ton="pasif">WAL arşivi kapalı</Rozet>
      : veri.walUyarisi !== null ? <Rozet ton="uyari">WAL arşivi takıldı</Rozet>
        : <Rozet ton="tamam">WAL arşivi açık</Rozet>;
  const uyarilar = [veri.walUyarisi, veri.disKopyaUyarisi].filter((u): u is string => u !== null);
  return (
    <div className="tc-ayar">
      <div className="tc-ayar-metin">
        <p className="tc-ayar-baslik">
          Gün içi koruma {walRozeti}
          {veri.disKopyaUyarisi !== null && <>{' '}<Rozet ton="uyari">Dış kopya eski ya da eksik</Rozet></>}
        </p>
        <p className="tc-ayar-aciklama">{walMetni(w)}</p>
        <p className="tc-ayar-aciklama">{tabanSatiri(basarili)}</p>
        <p className="tc-ayar-aciklama">{disKopyaMetni(son, basarili)}</p>
        {uyarilar.map((u) => <p key={u} className="tc-ayar-aciklama" role="alert"><Rozet ton="uyari">Uyarı</Rozet> {u}</p>)}
      </div>
    </div>
  );
}

function GunIciKoruma() {
  const ayrinti = useSaglikAyrintisi();
  const veri = ayrinti?.data?.gunIciKoruma;
  if (ayrinti === null || ayrinti.isPending) return null;
  if (ayrinti.isError) return <DurumKutusu durum="hata" mesaj={hataIletisi(ayrinti.error, 'Gün içi koruma okunamadı.')} yenile={() => { void ayrinti.refetch(); }} />;
  return veri === undefined ? null : <GunIciKorumaBolumu veri={veri} />;
}

// İndirme iki adımdır (145 a): önce izin komutu (denetim kaydına kişi ve yedek adıyla düşer), sonra tarayıcı dosyayı o izinle bir
// kez indirir.
function IndirDugmesi({ ad }: { ad: string }) {
  const { bildir } = useBildirim();
  const izin = useMutation({
    mutationFn: () => api.post<YedekIndirmeIzniCevabi>(`/yedekler/${encodeURIComponent(ad)}/indirme-izni`, {}),
    onSuccess: ({ izin: anahtar }) => {
      const baglanti = document.createElement('a');
      baglanti.href = `/api/yedekler/${encodeURIComponent(ad)}/indir?izin=${encodeURIComponent(anahtar)}`;
      baglanti.download = ad;
      baglanti.click();
    },
    onError: (hata) => { bildir('hata', hataIletisi(hata, 'Yedek indirilemedi.')); },
  });
  return (
    <Dugme simge="download" yukleniyor={izin.isPending} aria-label={`${ad} indir`} onClick={() => { izin.mutate(); }}>İndir</Dugme>
  );
}

const SUTUNLAR: readonly Sutun<Yedek>[] = [
  { anahtar: 'zaman', baslik: 'Alındı', kirilmaz: true, hucre: (y) => derlemeTarihi(y.zaman, true) },
  { anahtar: 'tur', baslik: 'Tür', hucre: (y) => (y.tur === 'gece' ? <Rozet ton="bilgi">Gece</Rozet> : <Rozet ton="pasif">Elle</Rozet>) },
  { anahtar: 'boyut', baslik: 'Boyut', hizala: 'sag', kirilmaz: true, hucre: (y) => boyutMetni(y.boyut) },
  {
    anahtar: 'indir', baslik: 'İndir',
    hucre: (y) => <IndirDugmesi ad={y.ad} />,
  },
];

// Klasör sunucuda denetlenir (mutlak, var, yazılabilir); kutu yalnız boşluğu ayıklar. Güncelleme öncesi yedek de bu klasöre yazılır.
function KlasorSecimi({ dizin, kaynak }: { dizin: string | null; kaynak: YedekDiziniKaynagi | null }) {
  const istemci = useQueryClient();
  const { bildir } = useBildirim();
  const [metin, setMetin] = useState(dizin ?? '');
  const [kayitli, setKayitli] = useState(dizin);
  if (kayitli !== dizin) { setKayitli(dizin); setMetin(dizin ?? ''); }
  const degistir = useMutation({
    mutationFn: (yeni: string | null) => api.post<YedekDiziniCevabi>('/yedekler/dizin/degistir', { dizin: yeni }),
    onSuccess: () => { bildir('tamam', 'Yedek klasörü kaydedildi.'); },
    onError: (hata) => { bildir('hata', hataIletisi(hata, 'Yedek klasörü değiştirilemedi.')); },
    onSettled: () => istemci.invalidateQueries({ queryKey: anahtarlar.yedekler }),
  });
  const temiz = metin.trim();
  const degisti = temiz !== '' && (temiz !== dizin || kaynak !== 'ayar');
  const gonder = (olay: FormEvent) => {
    olay.preventDefault();
    if (degisti) degistir.mutate(temiz);
  };
  return (
    <div className="tc-ayar">
      <div className="tc-ayar-metin">
        <p className="tc-ayar-baslik">Yedek klasörü</p>
        <p className="tc-ayar-aciklama">
          {dizin === null ? 'Klasör seçilmedi.' : `${dizin} · ${kaynak === null ? '' : KAYNAK_METNI[kaynak]}`} Gece yedeği,
          elle yedek ve güncelleme öncesi yedek bu klasöre yazılır. Veritabanıyla aynı diskte olmasın.
        </p>
      </div>
      <form className="tc-ayar-sayi" onSubmit={gonder}>
        <Girdi
          etiket="Yedek klasörü" value={metin} onChange={(olay) => setMetin(olay.target.value)}
          placeholder={'D:\\TMIV2-YEDEK'} ipucu="Sunucudaki klasörün tam adresi, sürücü harfiyle. Klasör önceden açılmış olmalı."
          disabled={degistir.isPending}
        />
        <Dugme type="submit" tur="birincil" simge="check" disabled={degistir.isPending || !degisti}>Kaydet</Dugme>
        {kaynak === 'ayar' && (
          <Dugme tur="ikincil" simge="rotate" disabled={degistir.isPending} onClick={() => { degistir.mutate(null); }}>
            Sunucu ayarına dön
          </Dugme>
        )}
      </form>
    </div>
  );
}

export function Yedekler() {
  const istemci = useQueryClient();
  const { bildir } = useBildirim();
  const liste = useQuery({
    queryKey: anahtarlar.yedekler,
    queryFn: () => api.get<YedeklerCevabi>('/yedekler'),
    refetchInterval: (sorgu) => (sorgu.state.data?.suruyor ? SUREN_YENILEME_MS : false),
  });
  const al = useMutation({
    mutationFn: () => api.post<YedekAlCevabi>('/yedekler/al', {}),
    onSuccess: () => { bildir('tamam', 'Yedek alınmaya başlandı; bitince listede görünür.'); },
    onError: (hata) => { bildir('hata', hataIletisi(hata, 'Yedek başlatılamadı.')); },
    onSettled: () => istemci.invalidateQueries({ queryKey: anahtarlar.yedekler }),
  });

  const veri = liste.data;
  return (
    <Kart baslik="Veritabanı yedekleri">
      {liste.isPending && <DurumKutusu durum="yukleniyor" />}
      {liste.isError && (
        <DurumKutusu durum="hata" mesaj={hataIletisi(liste.error, 'Yedekler okunamadı.')} yenile={() => { void liste.refetch(); }} />
      )}
      {veri && (
        <>
          <div className="tc-ayar">
            <div className="tc-ayar-metin">
              <p className="tc-ayar-baslik">
                {veri.durum === 'acik' ? <Rozet ton="tamam">Yedek açık</Rozet> : <Rozet ton="pasif">Yedek kapalı</Rozet>}
                {veri.suruyor && <Rozet ton="bilgi">Yedek alınıyor</Rozet>}
              </p>
              <p className="tc-ayar-aciklama">
                {veri.durum === 'acik'
                  ? `Sunucu her gece ${String(veri.saat).padStart(2, '0')}:00'den sonra yedek alır. ${String(veri.saklamaGun)} günden eski yedekler silinir; en yeni ${String(veri.enAzKalan)} yedek her zaman kalır. Yedek bütün veriyi taşır ve şifrelidir; açmak için yedek anahtarı gerekir.`
                  : KAPALI_METNI[veri.durum]}
              </p>
              {veri.sonHata && (
                <p className="tc-ayar-aciklama" role="alert">
                  <Rozet ton="uyari">Son yedek alınamadı</Rozet> {derlemeTarihi(veri.sonHata.zaman, true)}: {veri.sonHata.ileti}
                </p>
              )}
            </div>
            <div className="tc-ayar-sayi">
              <Dugme
                tur="birincil" simge="download" disabled={veri.durum !== 'acik' || veri.suruyor !== null} yukleniyor={al.isPending}
                onClick={() => { al.mutate(); }}
              >
                Şimdi yedek al
              </Dugme>
            </div>
          </div>
          <GunIciKoruma />
          <YedekAlaniSatiri alan={veri.alan} depo={veri.dosyaDeposu} />
          <KlasorSecimi dizin={veri.dizin} kaynak={veri.kaynak} />
          <Tablo etiket="Veritabanı yedekleri" sutunlar={SUTUNLAR} satirlar={veri.yedekler} satirAnahtari={(y) => y.ad} bosMesaj="Yedek yok." />
        </>
      )}
    </Kart>
  );
}
