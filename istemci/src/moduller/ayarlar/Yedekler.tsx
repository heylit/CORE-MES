import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  Yedek, YedekAlCevabi, YedekDiziniCevabi, YedekDiziniKaynagi, YedekDurumu, YedekIndirmeIzniCevabi, YedeklerCevabi,
} from '#paylasilan/sozlesme/ayarlar.ts';
import { Dugme, DurumKutusu, Girdi, Kart, Rozet, Tablo, useBildirim, type Sutun } from '../../ortak/arayuz/index.ts';
import { api, hataIletisi } from '../../ortak/veri/api.ts';
import { derlemeTarihi } from '../../ortak/veri/surum.ts';
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
          <KlasorSecimi dizin={veri.dizin} kaynak={veri.kaynak} />
          <Tablo etiket="Veritabanı yedekleri" sutunlar={SUTUNLAR} satirlar={veri.yedekler} satirAnahtari={(y) => y.ad} bosMesaj="Yedek yok." />
        </>
      )}
    </Kart>
  );
}
