import { useId, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { agAraligiHatasi } from '#paylasilan/ag-araligi.ts';
import { kalipHatasi, numaraKur } from '#paylasilan/numara.ts';
import type { Ayar, AyarDegistirGovdesi, AyarlarCevabi } from '#paylasilan/sozlesme/ayarlar.ts';
import { AcKapa, Dugme, DurumKutusu, Girdi, Kart, Rozet, Secim, Sekmeler, Simge, useBildirim, type Sekme } from '../../ortak/arayuz/index.ts';
import { ayarEkranlari, gorunenAyarEkranlari, type AyarEkrani } from '../../ortak/rota/ayar-ekranlari.ts';
import { api, hataIletisi } from '../../ortak/veri/api.ts';
import { anahtarlar as ortakAnahtarlar } from '../../ortak/veri/anahtarlar.ts';
import { useOturum } from '../../ortak/veri/oturum.ts';
import { anahtarlar } from './anahtarlar.ts';
import { BaglantiHazirligi } from './BaglantiHazirligi.tsx';
import { GORUNUM_ANAHTARLARI, GorunumAyarlari } from './GorunumAyarlari.tsx';
import { Guncelleme } from './Guncelleme.tsx';
import { OrtakCihazlar } from './OrtakCihazlar.tsx';
import { SayfaAyarlari } from './SayfaAyarlari.tsx';
import { Yedekler } from './Yedekler.tsx';
import { KurumLogosu, SurumBilgisi } from './KurumAyarlari.tsx';
import './ayarlar.css';

type SayiAyari = Extract<Ayar, { tur: 'sayi' }>;
type NumaraAyari = Extract<Ayar, { tur: 'numara' }>;
type MetinAyari = Extract<Ayar, { tur: 'metin' }>;
type SecimAyari = Extract<Ayar, { tur: 'secim' }>;
type AyarDegeri = Ayar['deger'];

// Saklanan değer tanımın türüne uymuyorsa ayar değersiz gelir; satır bunu söyler, yeni değer kaydetmek onarır.
function GecersizIsareti({ ayar }: { ayar: Ayar }) {
  if (ayar.gecersiz !== true) return null;
  return <Rozet ton="uyari">Kayıtlı değer okunamıyor; yeni değer kaydedin.</Rozet>;
}

const sayiMetni = (deger: number | null): string => (deger === null ? '' : String(deger).replace('.', ','));

// Boş metin "boş" değerdir (null); virgül de nokta da ondalık ayırıcıdır. Sayı olmayan metin sunucuya gitmez.
export function sayiCoz(metin: string): { deger: number | null } | { hata: string } {
  const temiz = metin.trim().replace(',', '.');
  if (temiz === '') return { deger: null };
  if (!/^-?\d+(\.\d+)?$/.test(temiz)) return { hata: 'Sayı girin ya da boş bırakın.' };
  return { deger: Number(temiz) };
}

function SayiSatiri({ ayar, mesgul, degistir }: { ayar: SayiAyari; mesgul: boolean; degistir: (deger: number | null) => void }) {
  const [metin, setMetin] = useState(() => sayiMetni(ayar.deger));
  const [kayitli, setKayitli] = useState(ayar.deger);
  // Sunucu yeni değeri kabul edince kutu onu gösterir; yazılmakta olan metin başka değer gelmedikçe korunur.
  if (kayitli !== ayar.deger) { setKayitli(ayar.deger); setMetin(sayiMetni(ayar.deger)); }
  const cozum = sayiCoz(metin);
  const degisti = 'deger' in cozum && (cozum.deger !== ayar.deger || ayar.gecersiz === true);
  const gonder = (olay: FormEvent) => {
    olay.preventDefault();
    if ('deger' in cozum && degisti) degistir(cozum.deger);
  };
  return (
    <li className="tc-ayar">
      <div className="tc-ayar-metin">
        <p className="tc-ayar-baslik">{ayar.baslik}</p>
        <p className="tc-ayar-aciklama">{ayar.aciklama}</p>
        <GecersizIsareti ayar={ayar} />
      </div>
      <form className="tc-ayar-sayi" onSubmit={gonder}>
        <Girdi
          etiket={ayar.baslik}
          inputMode={ayar.ondalik === 0 ? 'numeric' : 'decimal'}
          value={metin}
          onChange={(olay) => setMetin(olay.target.value)}
          ipucu={`${sayiMetni(ayar.enAz)} ile ${sayiMetni(ayar.enCok)} arası; boş bırakılabilir.`}
          hata={'hata' in cozum ? cozum.hata : undefined}
          disabled={mesgul}
        />
        <Dugme type="submit" tur="birincil" simge="check" disabled={mesgul || !degisti}>Kaydet</Dugme>
      </form>
    </li>
  );
}

// Önizlemedeki belge alanı değerleri yer tutucudur; gerçek değeri numarayı isteyen modül verir.
const ORNEK_ALANLAR: Readonly<Record<string, string>> = { FIRMA: 'FRM', PROJE: 'PRJ', PARCA: 'PRC' };

export function numaraOnizlemesi(kalip: string, alanlar: readonly string[], tarih: Date): { ornek: string } | { hata: string } {
  const hata = kalipHatasi(kalip, alanlar);
  if (hata !== null) return { hata };
  const ornekAlanlar = Object.fromEntries(alanlar.map((a) => [a, ORNEK_ALANLAR[a] ?? a]));
  return { ornek: numaraKur(kalip, { yil: tarih.getFullYear(), ay: tarih.getMonth() + 1, sira: 1, alanlar: ornekAlanlar }) };
}

function NumaraSatiri({ ayar, mesgul, degistir }: { ayar: NumaraAyari; mesgul: boolean; degistir: (deger: string) => void }) {
  const [metin, setMetin] = useState(() => ayar.deger ?? '');
  const [kayitli, setKayitli] = useState(ayar.deger);
  if (kayitli !== ayar.deger) { setKayitli(ayar.deger); setMetin(ayar.deger ?? ''); }
  const temiz = metin.trim();
  const onizleme = numaraOnizlemesi(temiz, ayar.alanlar, new Date());
  const degisti = 'ornek' in onizleme && (temiz !== ayar.deger || ayar.gecersiz === true);
  const kullanilabilir = ['{YYYY}', '{YY}', '{AA}', '{SAYAC:n}', ...ayar.alanlar.map((a) => `{${a}}`)].join(' ');
  const gonder = (olay: FormEvent) => {
    olay.preventDefault();
    if (degisti) degistir(temiz);
  };
  return (
    <li className="tc-ayar">
      <div className="tc-ayar-metin">
        <p className="tc-ayar-baslik">{ayar.baslik}</p>
        <p className="tc-ayar-aciklama">{ayar.aciklama}</p>
        <GecersizIsareti ayar={ayar} />
      </div>
      <form className="tc-ayar-sayi" onSubmit={gonder}>
        <Girdi
          etiket={ayar.baslik}
          value={metin}
          onChange={(olay) => setMetin(olay.target.value.toLocaleUpperCase('tr-TR'))}
          ipucu={'ornek' in onizleme ? `Örnek: ${onizleme.ornek} · Alanlar: ${kullanilabilir}` : `Alanlar: ${kullanilabilir}`}
          hata={'hata' in onizleme ? onizleme.hata : undefined}
          disabled={mesgul}
        />
        <Dugme type="submit" tur="birincil" simge="check" disabled={mesgul || !degisti}>Kaydet</Dugme>
      </form>
    </li>
  );
}

// Sunucu baştaki ve sondaki boşluğu atar; kutu aynı ölçüyle karşılaştırır ki boşluk eklemek "değişti" sayılmasın.
function MetinSatiri({ ayar, mesgul, degistir }: { ayar: MetinAyari; mesgul: boolean; degistir: (deger: string) => void }) {
  const [metin, setMetin] = useState(ayar.deger ?? '');
  const [kayitli, setKayitli] = useState(ayar.deger);
  if (kayitli !== ayar.deger) { setKayitli(ayar.deger); setMetin(ayar.deger ?? ''); }
  const temiz = metin.trim();
  // Boş olabilen metinde boş değer "girilmemiş" demektir; biçimli metin sunucuyla aynı kuralla denetlenir.
  const hata = temiz === '' ? (ayar.bosOlabilir === true ? undefined : 'Metin boş olamaz.')
    : (ayar.bicim === 'ag-araligi' ? agAraligiHatasi(temiz) ?? undefined : undefined);
  const degisti = hata === undefined && (temiz !== ayar.deger || ayar.gecersiz === true);
  const gonder = (olay: FormEvent) => {
    olay.preventDefault();
    if (degisti) degistir(temiz);
  };
  return (
    <li className="tc-ayar">
      <div className="tc-ayar-metin">
        <p className="tc-ayar-baslik">{ayar.baslik}</p>
        <p className="tc-ayar-aciklama">{ayar.aciklama}</p>
        <GecersizIsareti ayar={ayar} />
      </div>
      <form className="tc-ayar-sayi" onSubmit={gonder}>
        <Girdi
          etiket={ayar.baslik}
          value={metin}
          maxLength={ayar.enUzun}
          onChange={(olay) => setMetin(olay.target.value)}
          ipucu={ayar.bicim === 'ag-araligi' ? 'Virgülle ayırın, örnek: 10.30.0.0/16. Boş bırakılabilir.' : `En çok ${String(ayar.enUzun)} karakter.`}
          hata={hata}
          disabled={mesgul}
        />
        <Dugme type="submit" tur="birincil" simge="check" disabled={mesgul || !degisti}>Kaydet</Dugme>
      </form>
    </li>
  );
}

// Seçim listeden yapılır; seçilen değer hemen kaydedilir, sunucu kabul edene kadar kutu kilitlidir.
function SecimSatiri({ ayar, mesgul, degistir }: { ayar: SecimAyari; mesgul: boolean; degistir: (deger: string) => void }) {
  return (
    <li className="tc-ayar">
      <div className="tc-ayar-metin">
        <p className="tc-ayar-baslik">{ayar.baslik}</p>
        <p className="tc-ayar-aciklama">{ayar.aciklama}</p>
        <GecersizIsareti ayar={ayar} />
      </div>
      <div className="tc-ayar-sayi">
        <Secim
          etiket={ayar.baslik}
          value={ayar.deger ?? ''}
          secenekler={ayar.secenekler.map((s) => ({ deger: s.deger, baslik: s.etiket }))}
          bosSecenek={ayar.deger === null ? 'Seçin' : undefined}
          onChange={(olay) => { if (olay.target.value !== '') degistir(olay.target.value); }}
          disabled={mesgul}
        />
      </div>
    </li>
  );
}

function AyarSatiri({ ayar, mesgul, degistir }: { ayar: Ayar; mesgul: boolean; degistir: (deger: AyarDegeri) => void }) {
  const aciklamaKimligi = useId();
  if (ayar.tur === 'sayi') return <SayiSatiri ayar={ayar} mesgul={mesgul} degistir={degistir} />;
  if (ayar.tur === 'numara') return <NumaraSatiri ayar={ayar} mesgul={mesgul} degistir={degistir} />;
  if (ayar.tur === 'metin') return <MetinSatiri ayar={ayar} mesgul={mesgul} degistir={degistir} />;
  if (ayar.tur === 'secim') return <SecimSatiri ayar={ayar} mesgul={mesgul} degistir={degistir} />;
  return (
    <li className="tc-ayar">
      <div className="tc-ayar-metin">
        <p className="tc-ayar-baslik">{ayar.baslik}</p>
        <p className="tc-ayar-aciklama" id={aciklamaKimligi}>{ayar.aciklama}</p>
        <GecersizIsareti ayar={ayar} />
      </div>
      {ayar.deger === null ? (
        // Anahtarın gösterecek konumu yok: iki değer de ayrı düğmeyle kaydedilir.
        <div className="tc-ayar-sayi">
          <Dugme simge="check" disabled={mesgul} onClick={() => degistir(true)}>Açık kaydet</Dugme>
          <Dugme simge="x" disabled={mesgul} onClick={() => degistir(false)}>Kapalı kaydet</Dugme>
        </div>
      ) : (
        <AcKapa etiket={ayar.baslik} aria-describedby={aciklamaKimligi} acik={ayar.deger} disabled={mesgul} degistir={degistir} />
      )}
    </li>
  );
}

export type AyarKategorisi = 'genel' | 'konum' | 'onay' | 'logo' | 'smartes' | 'pdks' | 'numara' | 'arkon' | 'gorunum';

// Numara kalıpları türünden, ötekiler anahtardan ayrılır: dört göz ayarları modül adıyla biter, dış bağlantıların (Logo,
// SmartES) ayarları kendi adlarıyla başlar, PDKS kart okuyucu ayarı `nizamiye.pdks-` ile; hepsi Bağlantılar'da kendi alt sekmesine düşer. Arkon ayarları (üretim anomalisi eşikleri)
// Modül ayarları'nda Arkon'un ekranının başında açılır (kart #1193). Tanınmayan yeni ayar kaybolmasın diye Genel'e düşer.
export function ayarKategorisi({ anahtar, tur }: { anahtar: string; tur: Ayar['tur'] }): AyarKategorisi {
  if (tur === 'numara') return 'numara';
  // Hareket dili ve açılış kendi sekmesinde önizlemeli kartlarla seçilir (kullanıcı isteği 2026-10-14).
  if ((GORUNUM_ANAHTARLARI as readonly string[]).includes(anahtar)) return 'gorunum';
  if (anahtar.startsWith('sevkiyat.fabrika-')) return 'konum';
  if (anahtar.startsWith('logo.')) return 'logo';
  if (anahtar.startsWith('smartes.')) return 'smartes';
  if (anahtar.startsWith('nizamiye.pdks-')) return 'pdks';
  if (anahtar.endsWith('.dort-goz')) return 'onay';
  if (anahtar.startsWith('arkon.')) return 'arkon';
  return 'genel';
}

function AyarListesi({ baslik, kategori, bossaGizle = false }: { baslik: string; kategori: AyarKategorisi; bossaGizle?: boolean }) {
  const istemci = useQueryClient();
  const { bildir } = useBildirim();
  const liste = useQuery({ queryKey: anahtarlar.liste, queryFn: () => api.get<AyarlarCevabi>('/ayarlar') });

  // Anahtar sunucunun kabul ettiği değeri gösterir: cevap gelene kadar yerinde kalır.
  const degistir = useMutation({
    mutationFn: ({ anahtar, deger }: { anahtar: string; deger: AyarDegeri }) =>
      api.post<Ayar>(`/ayarlar/${encodeURIComponent(anahtar)}/degistir`, { deger } satisfies AyarDegistirGovdesi),
    onSuccess: (guncel) => {
      istemci.setQueryData<AyarlarCevabi>(anahtarlar.liste, (onceki) =>
        onceki && { ayarlar: onceki.ayarlar.map((a) => (a.anahtar === guncel.anahtar ? guncel : a)) });
      // Başlıklar adı uzun süre önbellekte tutar; değiştiren kişi yenisini hemen görsün.
      if (guncel.anahtar === 'kabuk.kurum-adi') void istemci.invalidateQueries({ queryKey: ortakAnahtarlar.kurum });
      bildir('tamam', 'Ayar kaydedildi.');
    },
    onError: (hata) => { bildir('hata', hataIletisi(hata, 'Ayar kaydedilemedi.')); },
  });

  const ayarlar = liste.data?.ayarlar.filter((a) => ayarKategorisi(a) === kategori);
  if (bossaGizle && (liste.isPending || ayarlar?.length === 0)) return null;
  return (
    <Kart baslik={baslik}>
      {liste.isPending && <DurumKutusu durum="yukleniyor" />}
      {liste.isError && (
        <DurumKutusu durum="hata" mesaj={hataIletisi(liste.error, 'Ayarlar alınamadı.')} yenile={() => { void liste.refetch(); }} />
      )}
      {ayarlar && (
        <ul className="tc-ayarlar" aria-label={baslik}>
          {ayarlar.map((ayar) => (
            <AyarSatiri
              key={ayar.anahtar}
              ayar={ayar}
              mesgul={degistir.isPending}
              degistir={(deger) => degistir.mutate({ anahtar: ayar.anahtar, deger })}
            />
          ))}
        </ul>
      )}
    </Kart>
  );
}

// Modülün ayar ekranı burada da, kendi sayfasında da aynı bileşendir; değer kopyalanmaz, uçlar ve yazma yetkisi modülündür.
// Sistem ayarı modülün ekranının başında, Sistem Ayarları'nın kendi ucuyla okunur ve yazılır (ekran anahtarı -> kategori).
const MODUL_AYAR_LISTELERI: Readonly<Partial<Record<string, { kategori: AyarKategorisi; baslik: string }>>> = {
  arkon: { kategori: 'arkon', baslik: 'Üretim anomalisi' },
  'kart-okuyucu': { kategori: 'pdks', baslik: 'Kart okuyucu' },
};

function ModulAyarlari({ ekran }: { ekran: AyarEkrani }) {
  const baslikKimligi = useId();
  const liste = MODUL_AYAR_LISTELERI[ekran.anahtar];
  return (
    <section className="tc-ayar-modul" aria-labelledby={baslikKimligi} data-ayar-ekrani={ekran.anahtar}>
      <h2 className="tc-ayar-modul-baslik" id={baslikKimligi}>
        {ekran.simge && <Simge ad={ekran.simge} />}
        <span>{ekran.baslik}</span>
      </h2>
      {liste && <AyarListesi baslik={liste.baslik} kategori={liste.kategori} bossaGizle />}
      <ekran.ekran />
    </section>
  );
}

// Modül ekranları alt sekmelerle açılır: aynı anda yalnız seçilen modülün ekranı çizilir.
function ModulSekmeleri({ ekranlar }: { ekranlar: readonly AyarEkrani[] }) {
  const [secili, setSecili] = useState<string | null>(null);
  const gecerli = ekranlar.find((e) => e.anahtar === secili) ?? ekranlar[0];
  if (!gecerli) return null;
  return (
    <div className="tc-ayar-bolum">
      {ekranlar.length > 1 && (
        <Sekmeler
          etiket="Modüller"
          sekmeler={ekranlar.map((e) => ({ anahtar: e.anahtar, baslik: e.baslik, simge: e.simge }))}
          secili={gecerli.anahtar}
          sec={setSecili}
        />
      )}
      <ModulAyarlari key={gecerli.anahtar} ekran={gecerli} />
    </div>
  );
}

type BaglantiSekmesi = 'hazirlik' | 'logo' | 'smartes';

const BAGLANTI_SEKMELERI: readonly Sekme<BaglantiSekmesi>[] = [
  { anahtar: 'hazirlik', baslik: 'Hazırlık ve akış', simge: 'gauge' },
  { anahtar: 'logo', baslik: 'Logo', simge: 'upload' },
  { anahtar: 'smartes', baslik: 'SmartES', simge: 'bolt' },
];

// Her dış sistem kendi alt sekmesindedir: ayarları ve modülünün bağlantı ekranları birlikte. Hazırlık (adres, canlı deneme,
// akışlar) sistem ayrıntısını görene (yönetici) çıkar ve ilk sekmedir. Sabit sekmesi olmayan bağlantı ekranı (kart okuyucu gibi)
// kendi alt sekmesini açar; kimse göremiyorsa sekme çıkmaz.
function Baglantilar({ ekranlar, hazirlikGorur }: { ekranlar: readonly AyarEkrani[]; hazirlikGorur: boolean }) {
  const sabit = (anahtar: string) => BAGLANTI_SEKMELERI.some((s) => s.anahtar === anahtar);
  const sekmeler: readonly Sekme<string>[] = [
    ...BAGLANTI_SEKMELERI.filter((s) => s.anahtar !== 'hazirlik' || hazirlikGorur),
    ...ekranlar.filter((e) => !sabit(e.anahtar)).map((e) => ({ anahtar: e.anahtar, baslik: e.baslik, simge: e.simge })),
  ];
  const [secim, setSecili] = useState<string | null>(null);
  const secili = sekmeler.find((s) => s.anahtar === secim)?.anahtar ?? sekmeler[0]?.anahtar ?? 'logo';
  const sabitSecili = BAGLANTI_SEKMELERI.find((s) => s.anahtar === secili)?.anahtar ?? null;
  return (
    <>
      <Sekmeler etiket="Bağlantılar" sekmeler={sekmeler} secili={secili} sec={setSecili} />
      {sabitSecili === 'hazirlik' && <BaglantiHazirligi />}
      {sabitSecili === 'logo' && <AyarListesi baslik="Logo" kategori="logo" />}
      {sabitSecili === 'smartes' && <AyarListesi baslik="SmartES" kategori="smartes" bossaGizle />}
      {ekranlar.filter((e) => e.anahtar === secili).map((e) => <ModulAyarlari key={e.anahtar} ekran={e} />)}
    </>
  );
}

type SayfaSekmesi = 'genel' | 'gorunum' | 'sayfalar' | 'onay' | 'numara' | 'baglanti' | 'moduller' | 'guncelleme' | 'yedek' | 'cihazlar';

const SEKMELER: readonly Sekme<SayfaSekmesi>[] = [
  { anahtar: 'genel', baslik: 'Genel', simge: 'gear' },
  { anahtar: 'gorunum', baslik: 'Görünüm ve hareket', simge: 'eye' },
  { anahtar: 'sayfalar', baslik: 'Sayfalar', simge: 'list' },
  { anahtar: 'onay', baslik: 'Onay kuralları', simge: 'eye' },
  { anahtar: 'numara', baslik: 'Numara kuralları', simge: 'tag' },
  { anahtar: 'baglanti', baslik: 'Bağlantılar', simge: 'upload' },
  { anahtar: 'moduller', baslik: 'Modül ayarları', simge: 'grid' },
  { anahtar: 'guncelleme', baslik: 'Güncelleme', simge: 'download' },
  { anahtar: 'yedek', baslik: 'Yedekler', simge: 'box' },
  { anahtar: 'cihazlar', baslik: 'Ortak cihazlar', simge: 'laptop' },
];

// Sayfanın görünürlüğü yine `sayfa.ayarlar`dır; modül sekmesi yalnız modülün ayar menü maddesini gören kişiye çıkar.
// Kategoriler yalnız düzendir: her bölüm eskisi gibi kendi ucunu okur ve yazar.
export function SistemAyarlari({ ekranlar = ayarEkranlari }: { ekranlar?: readonly AyarEkrani[] }) {
  const islemler = useOturum().data?.islemler ?? [];
  const gorunen = gorunenAyarEkranlari(ekranlar, islemler);
  const moduller = gorunen.filter((e) => e.bolum === undefined);
  // Modülün ekranını göremeyen kişi o modülün sistem ayarlarını Genel'de bulur: ayar kaybolmaz.
  const genelde = Object.entries(MODUL_AYAR_LISTELERI).filter(([anahtar]) => !gorunen.some((e) => e.anahtar === anahtar));
  const baglantiEkranlari = gorunen.filter((e) => e.bolum === 'baglanti');
  // Güncelleme sekmesi yalnız paket yükleyebilene (bayraklı yönetici) çıkar.
  const guncelleyebilir = islemler.includes('ayarlar.guncelleme-yukle');
  // Yedekler sekmesi yalnız yedek alıp indirebilene (bayraklı yönetici) çıkar.
  const yedekleyebilir = islemler.includes('ayarlar.yedek-indir');
  // Ortak cihaz sekmesi yalnız cihaz kaydedebilene (bayraklı yönetici) çıkar.
  const cihazKaydedebilir = islemler.includes('oturum.ortak-cihaz');
  const sekmeler = SEKMELER.filter((s) => (s.anahtar !== 'moduller' || moduller.length > 0)
    && (s.anahtar !== 'guncelleme' || guncelleyebilir) && (s.anahtar !== 'yedek' || yedekleyebilir)
    && (s.anahtar !== 'cihazlar' || cihazKaydedebilir));
  const [secili, setSecili] = useState<SayfaSekmesi>('genel');
  const gecerli = sekmeler.some((s) => s.anahtar === secili) ? secili : 'genel';
  return (
    <div className="tc-ayar-sayfa">
      <Sekmeler etiket="Ayar kategorileri" sekmeler={sekmeler} secili={gecerli} sec={setSecili} />
      <div className="tc-ayar-bolum" role="tabpanel" aria-label={sekmeler.find((s) => s.anahtar === gecerli)?.baslik}>
        {gecerli === 'genel' && (
          <>
            <KurumLogosu />
            <AyarListesi baslik="Firma konumu" kategori="konum" bossaGizle />
            <AyarListesi baslik="Genel ayarlar" kategori="genel" bossaGizle />
            {genelde.map(([anahtar, l]) => l && <AyarListesi key={anahtar} baslik={l.baslik} kategori={l.kategori} bossaGizle />)}
            <SurumBilgisi />
          </>
        )}
        {gecerli === 'gorunum' && <GorunumAyarlari />}
        {gecerli === 'sayfalar' && <SayfaAyarlari />}
        {gecerli === 'onay' && (
          <AyarListesi baslik="Onay kuralları" kategori="onay" />
        )}
        {gecerli === 'numara' && (
          <>
            <p className="tc-ayar-aciklama">
              Firma kodu ({'{FIRMA}'}) <a href="/malzemeler/ayarlar">Malzeme ayarlarında</a> tanımlanır. Kalıbı değiştirmek yalnız yeni kayıtları etkiler.
            </p>
            <AyarListesi baslik="Numara kuralları" kategori="numara" />
          </>
        )}
        {gecerli === 'baglanti' && <Baglantilar ekranlar={baglantiEkranlari} hazirlikGorur={islemler.includes('saglik.ayrinti-oku')} />}
        {gecerli === 'moduller' && <ModulSekmeleri ekranlar={moduller} />}
        {gecerli === 'guncelleme' && <Guncelleme />}
        {gecerli === 'yedek' && <Yedekler />}
        {gecerli === 'cihazlar' && <OrtakCihazlar />}
      </div>
    </div>
  );
}
