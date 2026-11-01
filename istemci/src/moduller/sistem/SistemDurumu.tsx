import { useQuery } from '@tanstack/react-query';
import type { Ayrinti, GeriYuklemeDenemesi, IsDurumuOzeti, SaglikCevabi, TabloBuyuklugu, Uyari, VeritabaniBuyumesi } from '#paylasilan/sozlesme/saglik.ts';
import { Dugme, DurumKutusu, Kart, Rozet, Simge, Tablo } from '../../ortak/arayuz/index.ts';
import type { RozetTonu, Sutun } from '../../ortak/arayuz/index.ts';
import { api, hataIletisi } from '../../ortak/veri/api.ts';
import { useOturum } from '../../ortak/veri/oturum.ts';
import { anahtarlar } from './anahtarlar.ts';
import { isAdi, ortamAdi } from './is-adlari.ts';
import { Performans } from './Performans.tsx';
import { sureMetni } from './sure.ts';
import './sistem-durumu.css';

const YOK = 'yok';

// Veritabanının durumu herkese açık sağlık cevabından gelir; ayrıntı ucu yalnız gecikmeyi taşır.
function AyrintiListesi({ ayrinti, saglikli }: { ayrinti: Ayrinti; saglikli: boolean }) {
  const gecikmeMs = saglikli ? ayrinti.veritabaniGecikmeMs : null;
  return (
    <dl className="tc-sistem-liste">
      <dt>Veritabanı</dt>
      <dd>
        <Rozet ton={saglikli ? 'tamam' : 'hata'}>{saglikli ? 'Çalışıyor' : 'Sorun var'}</Rozet>
        {' '}{gecikmeMs === null ? YOK : `${gecikmeMs} ms`}
      </dd>
      <dt>Son göç</dt>
      <dd>{ayrinti.sonGoc ?? YOK}</dd>
      <dt>Commit</dt>
      <dd>{ayrinti.commit === null ? YOK : ayrinti.commit.slice(0, 7)}</dd>
      <dt>Çalışma süresi</dt>
      <dd>{sureMetni(ayrinti.calismaSuresiSn)}</dd>
      <dt>Ortam</dt>
      <dd>{ortamAdi(ayrinti.ortam)}</dd>
      <dt>Son geri yükleme denemesi</dt>
      <dd><DenemeSatiri deneme={ayrinti.geriYuklemeDenemesi ?? null} /></dd>
    </dl>
  );
}

const SONUC: Record<NonNullable<IsDurumuOzeti['sonSonuc']>, { metin: string; ton: RozetTonu }> = {
  tamam: { metin: 'Tamam', ton: 'tamam' },
  hata: { metin: 'Hata', ton: 'hata' },
  atlandi: { metin: 'Atlandı', ton: 'pasif' },
  bekliyor: { metin: 'Bekliyor', ton: 'uyari' },
};

const zamanMetni = (iso: string | null): string =>
  iso === null ? YOK : new Date(iso).toLocaleString('tr-TR', { dateStyle: 'medium', timeStyle: 'medium' });

// Yedeğin ayrı veritabanına yüklenerek denenmesi (1670): `npm run geri-yukle-deneme` yazar; sonuç ve tarih.
function DenemeSatiri({ deneme }: { deneme: GeriYuklemeDenemesi | null }) {
  if (deneme === null) return <>{YOK}</>;
  const basarili = deneme.sonuc === 'basarili';
  return (
    <>
      <Rozet ton={basarili ? 'tamam' : 'hata'}>{basarili ? 'Başarılı' : 'Başarısız'}</Rozet>
      {' '}{zamanMetni(deneme.zaman)}
    </>
  );
}

// Süren turda sonuç önceki turundur; son çalışma bu yüzden başlama anıdır.
const IS_SUTUNLARI: readonly Sutun<IsDurumuOzeti>[] = [
  { anahtar: 'ad', baslik: 'İş', hucre: (i) => <span title={i.ad}>{isAdi(i.ad)}</span> },
  { anahtar: 'sonBaslama', baslik: 'Son çalışma', hucre: (i) => zamanMetni(i.sonBaslama), kirilmaz: true },
  {
    anahtar: 'sonSonuc', baslik: 'Sonuç',
    hucre: (i) => (i.sonSonuc === null ? YOK : <Rozet ton={SONUC[i.sonSonuc].ton}>{SONUC[i.sonSonuc].metin}</Rozet>),
  },
  // Hata ve bekleme nedeni aynı anda dolu olmaz: sonuç hangisiyse onun açıklaması.
  { anahtar: 'sonHata', baslik: 'Açıklama', hucre: (i) => i.sonHata ?? i.sonNeden ?? YOK },
];

function IsTablosu({ isler }: { isler: readonly IsDurumuOzeti[] }) {
  return (
    <section aria-label="Zamanlanmış işler">
      <h3 className="tc-sistem-baslik">Zamanlanmış işler</h3>
      {/* Tablonun boş durumu ikinci bir durum bölgesi açar; kartın durumu tek kalsın diye boş liste düz metindir. */}
      {isler.length === 0
        ? <p>İş yok</p>
        : <Tablo etiket="Zamanlanmış işler" sutunlar={IS_SUTUNLARI} satirlar={isler} satirAnahtari={(i) => i.ad} />}
    </section>
  );
}

// Uyarıyı sunucu hesaplar (yedek alınmadı, iş asıldı ya da hata verdi, disk az); ekran yalnız listeler.
const SAYI = new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 1 });

function baytMetni(bayt: number): string {
  const birimler = ['B', 'KB', 'MB', 'GB', 'TB'] as const;
  let deger = bayt;
  let i = 0;
  while (deger >= 1024 && i < birimler.length - 1) {
    deger /= 1024;
    i += 1;
  }
  return `${SAYI.format(deger)} ${birimler[i]}`;
}

const TABLO_SUTUNLARI: readonly Sutun<TabloBuyuklugu>[] = [
  { anahtar: 'ad', baslik: 'Tablo', hucre: (t) => t.ad, mono: true },
  { anahtar: 'toplamBayt', baslik: 'Boyut', hucre: (t) => baytMetni(t.toplamBayt), hizala: 'sag', kirilmaz: true },
  { anahtar: 'dizinBayt', baslik: 'Dizin', hucre: (t) => baytMetni(t.dizinBayt), hizala: 'sag', kirilmaz: true },
  { anahtar: 'canliSatir', baslik: 'Satır', hucre: (t) => SAYI.format(t.canliSatir), hizala: 'sag' },
  { anahtar: 'oluOraniYuzde', baslik: 'Ölü satır', hucre: (t) => (t.oluOraniYuzde === null ? YOK : `%${SAYI.format(t.oluOraniYuzde)}`), hizala: 'sag' },
  { anahtar: 'sonAutovacuum', baslik: 'Son autovacuum', hucre: (t) => zamanMetni(t.sonAutovacuum), kirilmaz: true },
];

// Saklama kararı (1764 a) için ölçü: veritabanı ve en büyük tablolar. Değerler sunucudan; ekran eşik ya da yorum eklemez.
function VeritabaniBuyumesiBolumu({ buyume }: { buyume: VeritabaniBuyumesi | null }) {
  return (
    <section aria-labelledby="tc-sistem-vt-buyume">
      <h3 id="tc-sistem-vt-buyume" className="tc-sistem-baslik"><Simge ad="layers" boyut="k" /> Veritabanı büyümesi</h3>
      {buyume === null ? <p>Ölçü yok</p> : (
        <>
          <dl className="tc-sistem-liste">
            <dt>Veritabanı boyutu</dt>
            <dd>{baytMetni(buyume.boyutBayt)}</dd>
            <dt>XID yaşı</dt>
            <dd>{buyume.xidYasi === null ? YOK : SAYI.format(buyume.xidYasi)}</dd>
            <dt>En uzun açık işlem</dt>
            <dd>{buyume.enUzunTxSn === null ? YOK : `${SAYI.format(buyume.enUzunTxSn)} sn`}</dd>
          </dl>
          {buyume.tablolar.length === 0
            ? <p>Tablo yok</p>
            : <Tablo etiket="En büyük tablolar" sutunlar={TABLO_SUTUNLARI} satirlar={buyume.tablolar} satirAnahtari={(t) => t.ad} />}
          <p className="tc-sistem-soluk">En büyük {buyume.tablolar.length} tablo; boyut dizin dahil, satır sayıları PostgreSQL tahminidir.</p>
        </>
      )}
    </section>
  );
}

function UyariListesi({ uyarilar }: { uyarilar: readonly Uyari[] }) {
  if (uyarilar.length === 0) return null;
  return (
    <section aria-labelledby="tc-sistem-uyarilar" className="tc-sistem-uyarilar">
      <h3 id="tc-sistem-uyarilar" className="tc-sistem-baslik">Uyarılar</h3>
      <ul>
        {uyarilar.map((u) => <li key={`${u.tur}:${u.ileti}`}><Simge ad="alert" boyut="k" />{u.ileti}</li>)}
      </ul>
    </section>
  );
}

export function SistemDurumu() {
  const oturum = useOturum();
  const ayrintiGorur = oturum.data?.islemler.includes('saglik.ayrinti-oku') === true;
  const saglik = useQuery({ queryKey: anahtarlar.saglik, queryFn: () => api.get<SaglikCevabi>('/saglik') });
  const ayrinti = useQuery({
    queryKey: anahtarlar.sistemAyrinti,
    queryFn: () => api.get<Ayrinti>('/saglik/ayrinti'),
    enabled: ayrintiGorur,
  });
  const yenile = () => {
    void saglik.refetch();
    if (ayrintiGorur) void ayrinti.refetch();
  };
  // Yenilemede hata gelirse react-query eski veriyi tutar; sağlıklı saymak için son istek de başarılı olmalı.
  const saglikli = saglik.isSuccess && saglik.data.durum === 'ok';

  return (
    <Kart baslik="Sistem durumu" sag={<Dugme simge="rotate" onClick={yenile} aria-label="Yenile" yukleniyor={saglik.isFetching} />}>
      {saglik.isPending && <DurumKutusu durum="yukleniyor" />}
      {!saglik.isPending && (
        <p role="status">
          {saglikli
            ? <Rozet ton="tamam">Sistem çalışıyor</Rozet>
            : <Rozet ton="hata">Sistemde sorun var</Rozet>}
        </p>
      )}
      {ayrintiGorur && !saglik.isPending && ayrinti.data && <UyariListesi uyarilar={ayrinti.data.uyarilar} />}
      {ayrintiGorur && !saglik.isPending && ayrinti.data && <Performans />}
      {ayrintiGorur && !saglik.isPending && ayrinti.data && <AyrintiListesi ayrinti={ayrinti.data} saglikli={saglikli} />}
      {ayrintiGorur && !saglik.isPending && ayrinti.data && <VeritabaniBuyumesiBolumu buyume={ayrinti.data.veritabaniBuyumesi ?? null} />}
      {ayrintiGorur && !saglik.isPending && ayrinti.data && <IsTablosu isler={ayrinti.data.isler} />}
      {ayrintiGorur && ayrinti.isError && <p role="alert">{hataIletisi(ayrinti.error, 'Ayrıntı alınamadı')}</p>}
    </Kart>
  );
}
