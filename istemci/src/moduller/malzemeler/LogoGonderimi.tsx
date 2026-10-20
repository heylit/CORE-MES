import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  LogoDurumuCevabi, LogoEksik, LogoGonderimDurumu, LogoKarsiligi, LogoKarsilikCesidi,
} from '#paylasilan/sozlesme/malzemeler.ts';
import {
  Dugme, DurumKutusu, Girdi, Kart, Pencere, Rozet, Secim, Simge, Tablo, useBildirim, type RozetTonu, type Secenek, type Sutun,
} from '../../ortak/arayuz/index.ts';
import { api } from '../../ortak/veri/api.ts';
import { useOturum } from '../../ortak/veri/oturum.ts';
import './malzemeler.css';

// Logo gönderimi (kart #232): gönderimi bağlantı işi yapar; bu sayfa durumu salt okunur gösterir, karşılıkları tanım yazan doldurur.
// Prototipin ekranı değişmez; sayfa kabuğun kendi sayfasıdır (kullanıcı kararı LG5 = a).
export const LOGO_ANAHTARI = ['malzemeler', 'logo-durumu'] as const;

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

// Tür karşılığı kodla birlikte Logo'daki adıyla yazılır ("10 Hammadde"); birim kodu olduğu gibi.
const karsilikSutunlari = (cesit: LogoKarsilikCesidi, turAdi: (kod: string) => string): readonly Sutun<LogoKarsiligi>[] => [
  { anahtar: 'tmi', baslik: cesit === 'tur' ? 'TMI türü' : 'TMI birimi', hucre: (k) => (cesit === 'tur' ? TUR_ADLARI[k.tmiDegeri] ?? k.tmiDegeri : k.tmiDegeri) },
  {
    anahtar: 'logo', baslik: cesit === 'tur' ? 'Logo kart türü' : 'Logo birim seti', mono: true,
    hucre: (k) => (k.logoDegeri === null ? <Rozet ton="pasif">Boş</Rozet> : turAdi(k.logoDegeri)),
  },
];

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
          <Girdi
            etiket="Logo birim seti"
            ipucu="Logo'daki birim seti kodu (boşluksuz); boş bırakılırsa karşılık silinir ve bu birimdeki kartlar gönderilmez."
            value={deger}
            maxLength={40}
            onChange={(o) => degerYaz(o.target.value)}
            hata={kaydet.isError ? 'Kaydedilemedi' : undefined}
          />
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

function useLogoDurumu() {
  return useQuery({ queryKey: LOGO_ANAHTARI, queryFn: () => api.get<LogoDurumuCevabi>('/malzeme-logo-durumu') });
}

// Karşılıklar bir ayardır: Logo gönderimi sayfasında ve Sistem Ayarları'nda aynı bileşen (ayar-ekranlari.tsx).
export function LogoKarsiliklari() {
  const oturum = useOturum();
  const [duzenlenen, duzenlenenYaz] = useState<LogoKarsiligi | null>(null);
  const durum = useLogoDurumu();
  // Satır seçimi oturumun işlemine bağlı: tablo oturum gelmeden çizilirse yazan da salt okur görürdü.
  if (durum.isPending || oturum.isPending) return <DurumKutusu durum="yukleniyor" />;
  if (durum.isError) return <DurumKutusu durum="hata" yenile={() => { void durum.refetch(); }} />;
  const { karsiliklar, kartTuruSecenekleri } = durum.data;
  const yazabilir = durum.data.karsilikYazabilir && oturum.data?.islemler.includes('malzemeler.tanim-yaz') === true;
  const turAdi = (kod: string): string => {
    const t = kartTuruSecenekleri.find((x) => x.kod === kod);
    return t ? `${t.kod} ${t.ad}` : kod;
  };
  const tablo = (cesit: LogoKarsilikCesidi) => (
    <Tablo
      etiket={cesit === 'tur' ? 'Tür karşılıkları' : 'Birim karşılıkları'}
      sutunlar={karsilikSutunlari(cesit, cesit === 'tur' ? turAdi : (kod) => kod)}
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
