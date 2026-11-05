import { useState, type FormEvent } from 'react';
import type { ArsivKarti, ArsivKartiCevabi } from '#paylasilan/sozlesme/malzemeler.ts';
import { Dugme, DurumKutusu, Girdi, Pencere, Rozet, Simge, Tablo, useBildirim, type Sutun } from '../../../../ortak/arayuz/index.ts';
import { hataIletisi } from '../../../../ortak/veri/api.ts';
import { TURLER } from '../sabitler/index.ts';
import type { EkranOzellikleri } from '../sekmeler.ts';
import { useArsiv, useArsivKarti, useArsivKaliciSil, useArsivdenGeriGetir } from '../veri.ts';
import './arsiv.css';

// Arşiv (2114c, 2114-3 a, 2114-4 a): katalogdan silinen kartlar ve başka modüllerdeki bağları. Kesin bağ da olası iz de kalıcı
// silmeyi engeller; geri getirme ve kalıcı silme yalnız onaycıda. Ekran yalnız gizler, denetim uçtadır.
type Suzgec = 'hepsi' | 'bagsiz' | 'kesin' | 'olasi';
type IzDurumu = 'bilinmiyor' | Exclude<Suzgec, 'hepsi'>;
type Iz = NonNullable<ArsivKartiCevabi['izler']>[number];

const SUZGECLER: readonly { anahtar: Suzgec; ad: string }[] = [
  { anahtar: 'hepsi', ad: 'Bütün kartlar' },
  { anahtar: 'bagsiz', ad: 'Bağı yok' },
  { anahtar: 'kesin', ad: 'Kesin bağı var' },
  { anahtar: 'olasi', ad: 'Yalnız olası iz' },
];

export function izDurumu(k: Pick<ArsivKarti, 'kesinAdet' | 'olasiAdet'>): IzDurumu {
  if (k.kesinAdet === null || k.olasiAdet === null) return 'bilinmiyor';
  if (k.kesinAdet > 0) return 'kesin';
  return k.olasiAdet > 0 ? 'olasi' : 'bagsiz';
}

const zamanMetni = (z: string): string => new Date(z).toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' });
const turAdi = (tur: string): string => TURLER[tur]?.ad ?? tur;

function IzRozeti({ kart }: { kart: ArsivKarti }) {
  const d = izDurumu(kart);
  if (d === 'bilinmiyor') return <Rozet ton="pasif"><Simge ad="help" boyut="k" />Bağ bilinmiyor</Rozet>;
  if (d === 'kesin') return <Rozet ton="hata"><Simge ad="lock" boyut="k" />{kart.kesinAdet} bağ</Rozet>;
  if (d === 'olasi') return <Rozet ton="uyari"><Simge ad="alert" boyut="k" />Olası iz</Rozet>;
  return <Rozet ton="tamam"><Simge ad="check" boyut="k" />Bağı yok</Rozet>;
}

export function Arsiv({ yetki }: EkranOzellikleri) {
  const liste = useArsiv();
  const [suzgec, suzgecYaz] = useState<Suzgec>('hepsi');
  const [secili, seciliYaz] = useState<string | null>(null);
  if (liste.isPending) return <DurumKutusu durum="yukleniyor" />;
  if (liste.isError) return <DurumKutusu durum="hata" yenile={() => { void liste.refetch(); }} />;
  const kartlar = liste.data.kartlar.filter((k) => suzgec === 'hepsi' || izDurumu(k) === suzgec);
  const seciliKart = liste.data.kartlar.find((k) => k.kimlik === secili) ?? null;
  return (
    <div className="tc-ar" data-acik={seciliKart !== null}>
      <section className="tc-ar-liste" aria-label="Arşivdeki kartlar">
        <p className="tc-ar-not">Katalogdan silinen kartlar burada durur. Bağları görünür; bağı olmayan kart kalıcı silinebilir ya da kataloğa geri getirilebilir.</p>
        <div className="tc-ar-suzgec" role="group" aria-label="Süzgeç">
          {SUZGECLER.map((s) => (
            <Dugme key={s.anahtar} tur={suzgec === s.anahtar ? 'birincil' : 'ikincil'} aria-pressed={suzgec === s.anahtar} onClick={() => suzgecYaz(s.anahtar)}>
              {s.ad}
            </Dugme>
          ))}
        </div>
        <small className="tc-ar-sayac">{kartlar.length} kart</small>
        {kartlar.length === 0 ? <p className="tc-ar-bos">Bu süzgeçte kart yok.</p> : (
          <ul className="tc-ar-kartlar">
            {kartlar.map((k) => (
              <li key={k.kimlik}>
                <button type="button" className="tc-ar-kart" data-tur={k.tur} aria-current={k.kimlik === secili} onClick={() => seciliYaz(k.kimlik)}>
                  <span className="tc-ar-kart-metin">
                    <b className="tc-ar-kod">{k.stokKodu}</b>
                    <span>{k.ad ?? 'Adsız kart'} · {turAdi(k.tur)}</span>
                  </span>
                  <IzRozeti kart={k} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="tc-ar-ayrinti" aria-label="Kartın bağları">
        {seciliKart === null
          ? <p className="tc-ar-bos">Bağlarını görmek için soldan bir kart seçin.</p>
          : <Ayrinti key={seciliKart.kimlik} kimlik={seciliKart.kimlik} onayci={yetki.onayla} kapat={() => seciliYaz(null)} />}
      </section>
    </div>
  );
}

function Ayrinti({ kimlik, onayci, kapat }: { kimlik: string; onayci: boolean; kapat: () => void }) {
  const ayrinti = useArsivKarti(kimlik);
  const geriGetir = useArsivdenGeriGetir();
  const [silAcik, silAcikYaz] = useState(false);
  const { bildir } = useBildirim();
  if (ayrinti.isPending) return <DurumKutusu durum="yukleniyor" />;
  if (ayrinti.isError) return <DurumKutusu durum="hata" yenile={() => { void ayrinti.refetch(); }} />;
  const { kart, izler } = ayrinti.data;
  const d = izDurumu(kart);
  const ozet = kart.logoyaGitti
    ? "Kart Logo'ya gönderilmiş; Logo'da kullanım dışı olarak durduğu için kalıcı silinemez."
    : d === 'bagsiz' ? 'Bu kartın bağı yok. Kalıcı silinebilir.'
      : d === 'bilinmiyor' ? 'Bağ sayımı bağlı değil; kartın bağları bilinmeden kalıcı silinmez.'
        : 'Kart başka kayıtlarda kullanılıyor; kalıcı silinemez. Bağlı kayıtlar değişince ya da kapanınca yeniden bakın.';
  const geri = () => geriGetir.mutate(kimlik, {
    onSuccess: () => { bildir('tamam', `${kart.stokKodu} kataloğa geri getirildi`); kapat(); },
    onError: (e) => bildir('hata', hataIletisi(e, 'Geri getirilemedi')),
  });
  return (
    <div className="tc-ar-govde">
      <Dugme className="tc-ar-don" simge="chev-left" onClick={kapat}>Listeye dön</Dugme>
      <header className="tc-ar-baslik">
        <h3 className="tc-ar-kod">{kart.stokKodu}</h3>
        <IzRozeti kart={kart} />
      </header>
      <dl className="tc-ar-bilgi">
        <div><dt>Ad</dt><dd>{kart.ad ?? 'Adsız kart'}</dd></div>
        <div><dt>Tür</dt><dd>{turAdi(kart.tur)}</dd></div>
        <div><dt>Silen</dt><dd>{kart.silen?.ad ?? 'Bilinmiyor'}</dd></div>
        <div><dt>Silinme</dt><dd>{zamanMetni(kart.silinme)}</dd></div>
      </dl>
      <p className="tc-ar-ozet" data-durum={kart.logoyaGitti ? 'kesin' : d}>{ozet}</p>
      <IzTablosu baslik="Kesin bağlar (veritabanı)" izler={izler?.filter((i) => i.tur === 'kesin') ?? null} bos="Veritabanında bu karta bağlı kayıt yok." />
      <IzTablosu
        baslik="Olası izler (kayıt içinde kartın kodu geçiyor; kesin değildir)"
        izler={izler?.filter((i) => i.tur === 'olasi') ?? null}
        bos="Kayıtların içinde kartın kodu bulunmadı."
      />
      {onayci ? (
        <div className="tc-ar-eylem">
          <Dugme tur="birincil" simge="rotate" yukleniyor={geriGetir.isPending} onClick={geri}>Kataloğa geri getir</Dugme>
          <Dugme tur="tehlike" simge="trash" disabled={d !== 'bagsiz' || kart.logoyaGitti} onClick={() => silAcikYaz(true)}>Kalıcı sil</Dugme>
        </div>
      ) : <p className="tc-ar-not">Geri getirme ve kalıcı silme onay yetkisi isteyen işlemlerdir.</p>}
      {silAcik && <KaliciSilPenceresi kart={kart} kapat={() => silAcikYaz(false)} silindi={kapat} />}
    </div>
  );
}

const IZ_SUTUNLARI: readonly Sutun<Iz>[] = [
  { anahtar: 'modul', baslik: 'Modül', hucre: (i) => i.modul },
  { anahtar: 'kayit', baslik: 'Kayıt', hucre: (i) => i.kayit },
  { anahtar: 'adet', baslik: 'Adet', hizala: 'sag', hucre: (i) => i.adet },
  { anahtar: 'ornek', baslik: 'Örnek', mono: true, hucre: (i) => i.ornek },
];

function IzTablosu({ baslik, izler, bos }: { baslik: string; izler: readonly Iz[] | null; bos: string }) {
  return (
    <div className="tc-ar-izler">
      <h4>{baslik}</h4>
      {izler === null
        ? <p className="tc-ar-bos">Bağ sayımı bağlı değil.</p>
        : <Tablo etiket={baslik} sutunlar={IZ_SUTUNLARI} satirlar={izler} satirAnahtari={(i) => `${i.modul}|${i.kayit}`} bosMesaj={bos} />}
    </div>
  );
}

// Kalıcı silme stok kodunu yeniden yazarak onaylanır (yanlış kartta basılan düğme kartı silmesin).
function KaliciSilPenceresi({ kart, kapat, silindi }: { kart: ArsivKarti; kapat: () => void; silindi: () => void }) {
  const [kod, kodYaz] = useState('');
  const sil = useArsivKaliciSil();
  const { bildir } = useBildirim();
  const uyar = kod.trim() === kart.stokKodu;
  const gonder = (o: FormEvent) => {
    o.preventDefault();
    if (!uyar) return;
    sil.mutate({ kimlik: kart.kimlik, stokKodu: kod.trim() }, {
      onSuccess: () => { bildir('tamam', `${kart.stokKodu} kalıcı silindi`); kapat(); silindi(); },
      onError: (e) => { bildir('hata', hataIletisi(e, 'Kalıcı silinemedi')); kapat(); },
    });
  };
  return (
    <Pencere
      acik
      kapat={kapat}
      baslik={`${kart.stokKodu} kalıcı silinsin mi?`}
      alt={(
        <>
          <Dugme onClick={kapat} disabled={sil.isPending} data-ilk-odak>Vazgeç</Dugme>
          <Dugme tur="tehlike" simge="trash" type="submit" form="arsiv-kalici-sil" disabled={!uyar} yukleniyor={sil.isPending}>Kalıcı sil</Dugme>
        </>
      )}
    >
      <form id="arsiv-kalici-sil" onSubmit={gonder}>
        <p className="tc-ar-not">Kart veritabanından kalıcı olarak kaldırılır, geri getirilemez. Kartın eski hali değişiklik geçmişinde kalır.</p>
        <Girdi etiket="Onaylamak için stok kodunu yazın" value={kod} maxLength={64} autoComplete="off" onChange={(o) => kodYaz(o.target.value)} />
      </form>
    </Pencere>
  );
}
