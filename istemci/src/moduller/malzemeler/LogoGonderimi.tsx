import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { BirimSetleriCevabi, LogoBaglantiDurumu } from '#paylasilan/sozlesme/logo.ts';
import type {
  LogoDurumuCevabi, LogoEksik, LogoGonderimDurumu, LogoKarsiligi, LogoKarsilikCesidi,
} from '#paylasilan/sozlesme/malzemeler.ts';
import {
  Dugme, DurumKutusu, Girdi, Kart, OnayPenceresi, Pencere, Rozet, Secim, Simge, Tablo, useBildirim, type RozetTonu, type Secenek, type Sutun,
} from '../../ortak/arayuz/index.ts';
import { api, hataIletisi } from '../../ortak/veri/api.ts';
import { useOturum } from '../../ortak/veri/oturum.ts';
import './malzemeler.css';

// Logo gönderimi (kart #232): gönderimi bağlantı işi yapar; bu sayfa durumu salt okunur gösterir, karşılıkları tanım yazan doldurur.
// Prototipin ekranı değişmez; sayfa kabuğun kendi sayfasıdır (kullanıcı kararı LG5 = a).
export const LOGO_ANAHTARI = ['malzemeler', 'logo-durumu'] as const;
// Birim kavramının sahibi malzemelerdir (soru 144 a); Logo birim seti listesi Logo modülünün tablosundadır, bu sayfadan yönetilir.
export const BIRIM_SETI_ANAHTARI = ['malzemeler', 'logo-birim-setleri'] as const;

type BirimSeti = BirimSetleriCevabi['setler'][number];

type DurumKarti = LogoDurumuCevabi['kartlar'][number];

const DURUM: Record<LogoGonderimDurumu, { ad: string; ton: RozetTonu; simge: 'clock' | 'check' | 'alert' }> = {
  bekliyor: { ad: 'Bekliyor', ton: 'uyari', simge: 'clock' },
  gonderildi: { ad: 'Gönderildi', ton: 'tamam', simge: 'check' },
  hata: { ad: 'Hata', ton: 'hata', simge: 'alert' },
};

export const EKSIK_ADLARI: Record<LogoEksik, string> = {
  stok_kodu: 'stok kodu',
  ad: 'ad',
  birim: 'birim',
  tur_karsiligi: 'tür karşılığı',
  birim_karsiligi: 'birim karşılığı',
};

const TUR_ADLARI: Record<string, string> = { hammadde: 'Hammadde', yarimamul: 'Yarı mamul', mamul: 'Mamul', sarf: 'Sarf', demirbas: 'Demirbaş', ticari_mal: 'Ticari mal' };
// Kart #1218 (TM2): ticari mal yalnız Logo ticari mal kartına gider, öteki türler o kodu alamaz; sunucu da aynısını denetler.
const LOGO_TICARI_MAL_KODU = '1';
const turunSecenekleri = (tmiDegeri: string, hepsi: readonly Secenek[]): readonly Secenek[] =>
  hepsi.filter((s) => (tmiDegeri === 'ticari_mal') === (s.deger === LOGO_TICARI_MAL_KODU));

const zamanMetni = (z: string | null): string | null =>
  z === null ? null : new Date(z).toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' });

const KART_SUTUNLARI: readonly Sutun<DurumKarti>[] = [
  { anahtar: 'kod', baslik: 'Stok kodu', mono: true, kirilmaz: true, hucre: (k) => k.kod },
  { anahtar: 'ad', baslik: 'Ad', hucre: (k) => k.ad },
  {
    anahtar: 'durum', baslik: 'Durum', kirilmaz: true,
    // Hizmet kartı Logo'ya ayrı hizmet kartı olarak gider; bağlantı bunu yapana kadar bekler, eksik sayılmaz (kart #163).
    hucre: (k) => (
      <span className="tc-logo-durum">
        {k.tur === 'hizmet' && k.durum === 'bekliyor'
          ? <Rozet ton="bilgi"><Simge ad="clock" boyut="k" />Hizmet kartı bağlantısı bekliyor</Rozet>
          : <Rozet ton={DURUM[k.durum].ton}><Simge ad={DURUM[k.durum].simge} boyut="k" />{DURUM[k.durum].ad}</Rozet>}
        {/* Logo'daki kartın adı değişince yeni ad bağlantıyla gider; gidene kadar burada görünür (kart #783). */}
        {k.guncelleme?.durum === 'bekliyor' && <Rozet ton="uyari"><Simge ad="clock" boyut="k" />Ad güncellemesi bekliyor</Rozet>}
        {k.guncelleme?.durum === 'hata' && <Rozet ton="hata"><Simge ad="alert" boyut="k" />Ad güncelleme hatası</Rozet>}
      </span>
    ),
  },
  {
    anahtar: 'eksikler', baslik: 'Eksikler',
    hucre: (k) => (k.eksikler.length === 0 ? null : <span className="tc-logo-eksik">{k.eksikler.map((e) => EKSIK_ADLARI[e]).join(', ')}</span>),
  },
  { anahtar: 'hata', baslik: 'Son hata', hucre: (k) => (k.guncelleme?.durum === 'hata' ? k.guncelleme.hata : k.hata) },
  { anahtar: 'kayitNo', baslik: 'Logo kayıt no', mono: true, hucre: (k) => k.kayitNo },
  { anahtar: 'zaman', baslik: 'Zaman', kirilmaz: true, hucre: (k) => zamanMetni(k.zaman) },
];

function useBirimSetleri() {
  return useQuery({ queryKey: BIRIM_SETI_ANAHTARI, queryFn: () => api.get<BirimSetleriCevabi>('/logo/birim-setleri') });
}

const birimSetiBasligi = (b: BirimSeti): string => (b.ad === null ? b.kod : `${b.kod} ${b.ad}`);

// Tür karşılığı kodla birlikte Logo'daki adıyla yazılır ("10 Hammadde"); birim kodu olduğu gibi. Birim seti listesi okunduysa
// listede geçerli olmayan kayıtlı birim karşılığı "Geçersiz" rozetiyle görünür; o birimdeki kart gönderimde hata alır (LB9 a).
const karsilikSutunlari = (
  cesit: LogoKarsilikCesidi, turAdi: (kod: string) => string, gecerliMi: (kod: string) => boolean,
): readonly Sutun<LogoKarsiligi>[] => [
  { anahtar: 'tmi', baslik: cesit === 'tur' ? 'TMI türü' : 'TMI birimi', hucre: (k) => (cesit === 'tur' ? TUR_ADLARI[k.tmiDegeri] ?? k.tmiDegeri : k.tmiDegeri) },
  {
    anahtar: 'logo', baslik: cesit === 'tur' ? 'Logo kart türü' : 'Logo birim seti', mono: true,
    hucre: (k) => {
      if (k.logoDegeri === null) return <Rozet ton="pasif">Boş</Rozet>;
      if (cesit === 'birim' && !gecerliMi(k.logoDegeri)) {
        return <span className="tc-logo-durum">{k.logoDegeri}<Rozet ton="hata"><Simge ad="alert" boyut="k" />Geçersiz</Rozet></span>;
      }
      return turAdi(k.logoDegeri);
    },
  },
];

// Birim karşılığı yalnız geçerli birim setlerinden seçilir. Kayıtlı değer listede yoksa seçenek olarak kalır: pencere açıp kapatmak onu sessizce silmesin.
function BirimSetiSecimi({ deger, degerYaz, hata }: { deger: string; degerYaz: (d: string) => void; hata: string | undefined }) {
  const liste = useBirimSetleri();
  if (liste.isPending) return <DurumKutusu durum="yukleniyor" />;
  if (liste.isError) return <DurumKutusu durum="hata" yenile={() => { void liste.refetch(); }} />;
  const gecerliler = liste.data.setler.filter((b) => b.gecerli);
  const secenekler: Secenek[] = gecerliler.map((b) => ({ deger: b.kod, baslik: birimSetiBasligi(b) }));
  if (deger !== '' && !gecerliler.some((b) => b.kod === deger)) secenekler.unshift({ deger, baslik: `${deger} (listede yok)` });
  return (
    <Secim
      etiket="Logo birim seti"
      ipucu={gecerliler.length === 0
        ? 'Logo birim seti listesi boş; listeye kod eklenince seçilebilir.'
        : 'Boş seçilirse karşılık silinir ve bu birimdeki kartlar gönderilmez.'}
      secenekler={secenekler}
      bosSecenek="Boş"
      value={deger}
      onChange={(o) => degerYaz(o.target.value)}
      hata={hata}
    />
  );
}

function KarsilikPenceresi({ karsilik, turSecenekleri, kapat }: { karsilik: LogoKarsiligi; turSecenekleri: readonly Secenek[]; kapat: () => void }) {
  const [deger, degerYaz] = useState(karsilik.logoDegeri ?? '');
  const istemci = useQueryClient();
  const { bildir } = useBildirim();
  const kaydet = useMutation({
    mutationFn: (logoDegeri: string | null) => api.post('/malzeme-logo-karsiliklari/kaydet', { cesit: karsilik.cesit, tmiDegeri: karsilik.tmiDegeri, logoDegeri }),
    onSuccess: async () => {
      await istemci.invalidateQueries({ queryKey: LOGO_ANAHTARI });
      bildir('tamam', 'Kaydedildi');
      kapat();
    },
  });
  const gonder = (o: FormEvent) => {
    o.preventDefault();
    kaydet.mutate(deger.trim() === '' ? null : deger.trim());
  };
  const formKimligi = `logo-karsilik-${karsilik.cesit}`;
  const ad = karsilik.cesit === 'tur' ? TUR_ADLARI[karsilik.tmiDegeri] ?? karsilik.tmiDegeri : karsilik.tmiDegeri;
  return (
    <Pencere
      acik
      kapat={kapat}
      baslik={`${ad}: Logo ${karsilik.cesit === 'tur' ? 'kart türü' : 'birim seti'}`}
      alt={(
        <>
          <Dugme onClick={kapat}>Vazgeç</Dugme>
          {!(karsilik.cesit === 'tur' && karsilik.tmiDegeri === 'demirbas') && (
            <Dugme tur="birincil" type="submit" form={formKimligi} yukleniyor={kaydet.isPending}>Kaydet</Dugme>
          )}
        </>
      )}
    >
      <form id={formKimligi} onSubmit={gonder}>
        {karsilik.cesit === 'birim' ? (
          <BirimSetiSecimi deger={deger} degerYaz={degerYaz} hata={kaydet.isError ? 'Kaydedilemedi' : undefined} />
        ) : karsilik.tmiDegeri === 'demirbas' ? (
          <p className="tc-logo-not">Demirbaş şimdilik Logo'ya gönderilmez; karşılığı boş kalır.</p>
        ) : (
          <Secim
            etiket="Logo kart türü"
            ipucu="Boş seçilirse karşılık silinir ve bu türdeki kartlar gönderilmez."
            secenekler={turunSecenekleri(karsilik.tmiDegeri, turSecenekleri)}
            bosSecenek="Boş"
            value={deger}
            onChange={(o) => degerYaz(o.target.value)}
            hata={kaydet.isError ? 'Kaydedilemedi' : undefined}
          />
        )}
      </form>
    </Pencere>
  );
}

const BAGLANTI_NOTU: Record<LogoBaglantiDurumu, string> = {
  acik: 'Logo bağlantısı açık.',
  kapali: 'Logo bağlantısı kapalı.',
  'ortam-degiskeni-yok': 'Logo bağlantısının ortam değişkenleri yok.',
};

function BirimSetiPenceresi({ kapat }: { kapat: () => void }) {
  const [kod, kodYaz] = useState('');
  const [ad, adYaz] = useState('');
  const istemci = useQueryClient();
  const { bildir } = useBildirim();
  const ekle = useMutation({
    mutationFn: () => api.post('/logo/birim-setleri/ekle', { kod: kod.trim(), ad: ad.trim() === '' ? null : ad.trim() }),
    onSuccess: async () => {
      await istemci.invalidateQueries({ queryKey: BIRIM_SETI_ANAHTARI });
      bildir('tamam', 'Birim seti eklendi');
      kapat();
    },
  });
  const gonder = (o: FormEvent) => {
    o.preventDefault();
    ekle.mutate();
  };
  return (
    <Pencere
      acik
      kapat={kapat}
      baslik="Logo birim seti ekle"
      alt={(
        <>
          <Dugme onClick={kapat}>Vazgeç</Dugme>
          <Dugme tur="birincil" type="submit" form="logo-birim-seti-ekle" yukleniyor={ekle.isPending}>Ekle</Dugme>
        </>
      )}
    >
      <form id="logo-birim-seti-ekle" onSubmit={gonder}>
        <Girdi
          etiket="Kod"
          ipucu="Logo'daki birim seti kodu, boşluksuz."
          required
          value={kod}
          maxLength={40}
          onChange={(o) => kodYaz(o.target.value)}
          hata={ekle.isError ? hataIletisi(ekle.error, 'Eklenemedi') : undefined}
        />
        <Girdi etiket="Ad" value={ad} maxLength={80} onChange={(o) => adYaz(o.target.value)} />
      </form>
    </Pencere>
  );
}

// Köprüden okunan liste esastır; liste hiç okunmadıysa elle eklenen kod geçerlidir. Elle ekleme ve kaldırma yalnız yöneticide (LB11 a).
function BirimSetleri() {
  const oturum = useOturum();
  const liste = useBirimSetleri();
  const [ekleniyor, ekleniyorYaz] = useState(false);
  const [kaldirilacak, kaldirilacakYaz] = useState<BirimSeti | null>(null);
  const istemci = useQueryClient();
  const { bildir } = useBildirim();
  const kaldir = useMutation({
    mutationFn: (b: BirimSeti) => api.post(`/logo/birim-setleri/${encodeURIComponent(b.kod)}/kaldir`, {}),
    onSuccess: async () => {
      kaldirilacakYaz(null);
      bildir('tamam', 'Birim seti kaldırıldı');
      await istemci.invalidateQueries({ queryKey: BIRIM_SETI_ANAHTARI });
    },
    onError: (e) => {
      kaldirilacakYaz(null);
      bildir('hata', hataIletisi(e, 'Kaldırılamadı'));
    },
  });
  if (liste.isPending || oturum.isPending) return <DurumKutusu durum="yukleniyor" />;
  if (liste.isError) return <DurumKutusu durum="hata" yenile={() => { void liste.refetch(); }} />;
  const yazabilir = oturum.data?.islemler.includes('logo.birim-seti-yaz') === true;
  const { setler, sonOkuma, baglanti } = liste.data;
  const sutunlar: readonly Sutun<BirimSeti>[] = [
    { anahtar: 'kod', baslik: 'Kod', mono: true, kirilmaz: true, hucre: (b) => b.kod },
    { anahtar: 'ad', baslik: 'Ad', hucre: (b) => b.ad },
    {
      anahtar: 'kaynak', baslik: 'Kaynak',
      hucre: (b) => [b.kopruListesinde ? 'Logo listesi' : null, b.elle ? 'Elle' : null].filter(Boolean).join(', '),
    },
    {
      anahtar: 'durum', baslik: 'Durum', kirilmaz: true,
      hucre: (b) => (b.gecerli ? <Rozet ton="tamam"><Simge ad="check" boyut="k" />Geçerli</Rozet> : <Rozet ton="hata"><Simge ad="alert" boyut="k" />Geçersiz</Rozet>),
    },
    ...(yazabilir ? [{
      anahtar: 'islem', baslik: 'İşlem',
      hucre: (b: BirimSeti) => (b.elle
        ? <Dugme tur="tehlike" simge="trash" aria-label={`${b.kod} kaldır`} onClick={() => kaldirilacakYaz(b)}>Kaldır</Dugme>
        : null),
    }] : []),
  ];
  return (
    <>
      <Kart
        baslik="Logo birim setleri"
        sag={yazabilir ? <Dugme tur="birincil" simge="plus" onClick={() => ekleniyorYaz(true)}>Birim seti ekle</Dugme> : undefined}
      >
        <p className="tc-logo-not">
          {BAGLANTI_NOTU[baglanti]}{' '}
          {sonOkuma === null
            ? "Liste Logo'dan henüz okunmadı; elle eklenen kodlar geçerlidir."
            : `Liste Logo'dan son okundu: ${zamanMetni(sonOkuma) ?? ''}. Yalnız Logo listesindeki kodlar geçerlidir.`}
        </p>
        <Tablo etiket="Logo birim setleri" sutunlar={sutunlar} satirlar={setler} satirAnahtari={(b) => b.kod} bosMesaj="Birim seti yok" />
      </Kart>
      {ekleniyor && <BirimSetiPenceresi kapat={() => ekleniyorYaz(false)} />}
      <OnayPenceresi
        acik={kaldirilacak !== null}
        baslik="Birim seti kaldırılsın mı?"
        onayMetni="Kaldır"
        tehlikeli
        yukleniyor={kaldir.isPending}
        onayla={() => { if (kaldirilacak) kaldir.mutate(kaldirilacak); }}
        vazgec={() => kaldirilacakYaz(null)}
      >
        {kaldirilacak?.kod}
      </OnayPenceresi>
    </>
  );
}

function useLogoDurumu() {
  return useQuery({ queryKey: LOGO_ANAHTARI, queryFn: () => api.get<LogoDurumuCevabi>('/malzeme-logo-durumu') });
}

// Karşılıklar bir ayardır: Logo gönderimi sayfasında ve Sistem Ayarları'nda aynı bileşen (ayar-ekranlari.tsx).
export function LogoKarsiliklari() {
  const oturum = useOturum();
  const [duzenlenen, duzenlenenYaz] = useState<LogoKarsiligi | null>(null);
  const durum = useLogoDurumu();
  const birimSetleri = useBirimSetleri();
  // Satır seçimi oturumun işlemine bağlı: tablo oturum gelmeden çizilirse yazan da salt okur görürdü.
  if (durum.isPending || oturum.isPending) return <DurumKutusu durum="yukleniyor" />;
  if (durum.isError) return <DurumKutusu durum="hata" yenile={() => { void durum.refetch(); }} />;
  const { karsiliklar, kartTuruSecenekleri } = durum.data;
  const yazabilir = durum.data.karsilikYazabilir && oturum.data?.islemler.includes('malzemeler.tanim-yaz') === true;
  const turAdi = (kod: string): string => {
    const t = kartTuruSecenekleri.find((x) => x.kod === kod);
    return t ? `${t.kod} ${t.ad}` : kod;
  };
  // Liste okunamadıysa rozet yok: geçerlilik bilinmiyor.
  const gecerliMi = (kod: string): boolean => birimSetleri.data?.setler.some((b) => b.kod === kod && b.gecerli) ?? true;
  const tablo = (cesit: LogoKarsilikCesidi) => (
    <Tablo
      etiket={cesit === 'tur' ? 'Tür karşılıkları' : 'Birim karşılıkları'}
      sutunlar={karsilikSutunlari(cesit, cesit === 'tur' ? turAdi : (kod) => kod, gecerliMi)}
      satirlar={karsiliklar.filter((k) => k.cesit === cesit)}
      satirAnahtari={(k) => k.tmiDegeri}
      satirSec={yazabilir ? duzenlenenYaz : undefined}
      bosMesaj={cesit === 'tur' ? 'Tür yok' : 'Kartlarda birim yok'}
    />
  );
  return (
    <>
      <Kart baslik="Logo karşılıkları">
        <p className="tc-logo-not">
          {yazabilir ? 'Değiştirmek için satıra dokunun. ' : ''}Karşılığı boş olan tür ya da birimdeki kartlar gönderilmez.
        </p>
        <div className="tc-logo-karsiliklar">{tablo('tur')}{tablo('birim')}</div>
      </Kart>
      <BirimSetleri />
      {duzenlenen && (
        <KarsilikPenceresi
          key={`${duzenlenen.cesit}:${duzenlenen.tmiDegeri}`}
          karsilik={duzenlenen}
          turSecenekleri={kartTuruSecenekleri.map((t) => ({ deger: t.kod, baslik: `${t.kod} ${t.ad}` }))}
          kapat={() => duzenlenenYaz(null)}
        />
      )}
    </>
  );
}

export function LogoGonderimi() {
  const durum = useLogoDurumu();
  const icerik = (() => {
    if (durum.isPending) return <DurumKutusu durum="yukleniyor" />;
    if (durum.isError) return <DurumKutusu durum="hata" yenile={() => { void durum.refetch(); }} />;
    return (
      <>
        <Kart baslik="Logo gönderimi">
          <p className="tc-logo-not">Gönderimi Logo bağlantısı yapar; burada yalnız durum görünür. Eksiği olan kart gönderilmez.</p>
          <Tablo etiket="Logo gönderim durumu" sutunlar={KART_SUTUNLARI} satirlar={durum.data.kartlar} satirAnahtari={(k) => k.id} bosMesaj="Logo'ya gidecek kart yok" />
        </Kart>
        <LogoKarsiliklari />
      </>
    );
  })();
  return <div className="tc-logo-sayfa">{icerik}</div>;
}
