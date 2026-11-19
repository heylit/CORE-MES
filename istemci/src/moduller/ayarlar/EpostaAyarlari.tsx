import { useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { tesisSaati } from '#paylasilan/tesis-zamani.ts';
import {
  EPOSTA_ALT_BILGI_EN_UZUN, EPOSTA_BASLIK_EN_UZUN, EPOSTA_DUGME_EN_UZUN, EPOSTA_GOVDE_EN_UZUN, EPOSTA_KIP_ADLARI, EPOSTA_KONULARI, EPOSTA_KONU_ADLARI,
  EPOSTA_KONU_EN_UZUN, EPOSTA_SABLON_AD_EN_UZUN, EPOSTA_SERITLERI, EPOSTA_SERIT_ADLARI, EPOSTA_SIMGELERI, EPOSTA_TABLO_ADLARI, EPOSTA_TABLO_ALANLARI,
  EPOSTA_VARSAYILAN_DUGME, EPOSTA_YER_TUTUCULARI, bilinmeyenYerTutucular, sablonDoldur, type EpostaDegerleri, type EpostaKonusu, type EpostaSablonIcerigi,
  type EpostaSeridi, type EpostaSimgesi, type EpostaSonucu, type EpostaTabloAlani, type EpostaYerTutucusu,
} from '#paylasilan/sozlesme/eposta-sabitleri.ts';
import type {
  EpostaDefterCevabi, EpostaDefterSatiri, EpostaDenemeCevabi, EpostaDurumuCevabi, EpostaOzelSablonu, EpostaSablonlariCevabi, EpostaSablonu,
  EpostaSinamaCevabi, EpostaTetikleyiciDegistirGovdesi, EpostaTetikleyiciSatiri, EpostaTetikleyicileriCevabi,
} from '#paylasilan/sozlesme/bildirim-eposta.ts';
import type { BildirimOnemi } from '#paylasilan/sozlesme/bildirim.ts';
import {
  AcKapa, CokSatir, Dugme, DurumKutusu, Girdi, IsaretKutusu, Kart, OnayPenceresi, Pencere, Rozet, SayiKarti, Secim, Sekmeler, Simge, Tablo, useBildirim,
  type RozetTonu, type Sekme, type Sutun,
} from '../../ortak/arayuz/index.ts';
import type { SimgeAdi } from '../../ortak/tasarim/simgeler.ts';
import { api, hataIletisi } from '../../ortak/veri/api.ts';
import { useKurumLogosu } from '../../ortak/veri/kurum-logosu.ts';
import type { AyarListesiEki } from './SistemAyarlari.tsx';
import './eposta.css';

// E-posta kanalı (ADR 0015, 3397): sunucu bağlantısı ortam değişkenindedir ve burada yalnız okunur; gönderim ayarları, tür başına
// tetikleyici, konu başına şablon ve gönderim defteri buradan yönetilir. Uçlar `bildirim.eposta-yonet` ister.
const ANAHTAR = {
  durum: ['ayarlar', 'eposta', 'durum'] as const,
  tetikleyiciler: ['ayarlar', 'eposta', 'tetikleyiciler'] as const,
  sablonlar: ['ayarlar', 'eposta', 'sablonlar'] as const,
  defter: (sayfa: number, sonuc: string) => ['ayarlar', 'eposta', 'defter', sayfa, sonuc] as const,
};

type EpostaSekmesi = 'sunucu' | 'tetik' | 'sablon' | 'defter';
const SEKMELER: readonly Sekme<EpostaSekmesi>[] = [
  { anahtar: 'sunucu', baslik: 'Sunucu', simge: 'mail' },
  { anahtar: 'tetik', baslik: 'Tetikleyiciler', simge: 'bolt' },
  { anahtar: 'sablon', baslik: 'Şablonlar', simge: 'file' },
  { anahtar: 'defter', baslik: 'Gönderim defteri', simge: 'list' },
];

const ONEM_SIMGESI: Record<BildirimOnemi, SimgeAdi> = { bilgi: 'bell', uyari: 'alert', acil: 'alert' };
const ONEM_TONU: Record<BildirimOnemi, RozetTonu> = { bilgi: 'bilgi', uyari: 'uyari', acil: 'hata' };
const ONEM_ADI: Record<BildirimOnemi, string> = { bilgi: 'Bilgi', uyari: 'Uyarı', acil: 'Acil' };
const SONUC_ADI: Record<EpostaSonucu, string> = { gonderildi: 'Gönderildi', gonderilemedi: 'Gönderilemedi', atlandi: 'Atlandı' };
const SONUC_TONU: Record<EpostaSonucu, RozetTonu> = { gonderildi: 'tamam', gonderilemedi: 'hata', atlandi: 'pasif' };
const YER_TUTUCU_ADI: Record<EpostaYerTutucusu, string> = {
  alici_adi: 'Alıcı adı', olay: 'Olay', kayit_no: 'Kayıt no', tarih: 'Tarih', gecikme_gunu: 'Gecikme günü', istasyon: 'İstasyon', kayit_baglantisi: 'Kayıt bağlantısı',
  onem: 'Önem', kademe: 'Kademe',
};
// E-posta simgeleri ortak simge setinin adlarıdır; ekranda aynı çizim görünür.
const SIMGE: Record<EpostaSimgesi, SimgeAdi> = {
  cart: 'cart', 'clipboard-check': 'clipboard-check', tag: 'tag', calendar: 'calendar', route: 'route', clock: 'clock', bell: 'bell', alert: 'alert',
};
const SIMGE_ADI: Record<EpostaSimgesi, string> = {
  cart: 'Sepet', 'clipboard-check': 'Onaylı liste', tag: 'Etiket', calendar: 'Takvim', route: 'Rota', clock: 'Saat', bell: 'Zil', alert: 'Uyarı',
};
const SINIF_ADI: Record<EpostaTetikleyiciSatiri['sinif'], string> = { bilgi: 'Bilgi', gorev: 'Görev', hatirlatma: 'Hatırlatma' };

const zaman = (deger: string) => new Date(deger).toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' });

export function EpostaAyarlari({ gonderimAyarlari }: { gonderimAyarlari: (ek: AyarListesiEki) => ReactNode }) {
  const [secili, setSecili] = useState<EpostaSekmesi>('sunucu');
  return (
    <div className="tc-eposta">
      <Sekmeler etiket="E-posta" sekmeler={SEKMELER} secili={secili} sec={setSecili} />
      <div className="tc-ayar-bolum" role="tabpanel" aria-label={SEKMELER.find((s) => s.anahtar === secili)?.baslik}>
        {secili === 'sunucu' && <Sunucu gonderimAyarlari={gonderimAyarlari} />}
        {secili === 'tetik' && <Tetikleyiciler />}
        {secili === 'sablon' && <Sablonlar />}
        {secili === 'defter' && <Defter />}
      </div>
    </div>
  );
}

// --- Sunucu -------------------------------------------------------------------------------------------------------------

function KilitliSatir({ baslik, deger, aciklama = 'Sunucunun ortam ayarındadır; buradan değişmez.' }: { baslik: string; deger: string | null; aciklama?: string }) {
  return (
    <li className="tc-ayar">
      <div className="tc-ayar-metin">
        <p className="tc-ayar-baslik">{baslik}</p>
        <p className="tc-ayar-aciklama">{aciklama}</p>
      </div>
      <p className="tc-eposta-kilitli"><Simge ad="lock" boyut="k" /> {deger ?? 'Tanımlı değil'}</p>
    </li>
  );
}

function Sunucu({ gonderimAyarlari }: { gonderimAyarlari: (ek: AyarListesiEki) => ReactNode }) {
  const { bildir } = useBildirim();
  const istemci = useQueryClient();
  const durum = useQuery({ queryKey: ANAHTAR.durum, queryFn: () => api.get<EpostaDurumuCevabi>('/bildirimler/eposta/durum') });
  const deneme = useMutation({
    mutationFn: () => api.post<EpostaDenemeCevabi>('/bildirimler/eposta/deneme', {}),
    onSuccess: (r) => {
      bildir(r.sonuc === 'gonderildi' ? 'tamam' : 'hata', r.sonuc === 'gonderildi' ? 'Deneme e-postası iş adresinize gönderildi.' : `Deneme e-postası gitmedi: ${r.neden ?? SONUC_ADI[r.sonuc]}`);
      void durum.refetch();
    },
    onError: (h) => { bildir('hata', hataIletisi(h, 'Deneme e-postası gönderilemedi.')); },
  });
  const sina = useMutation({
    mutationFn: () => api.post<EpostaSinamaCevabi>('/bildirimler/eposta/sina', {}),
    onSuccess: (r) => { bildir(r.tamam ? 'tamam' : 'hata', r.tamam ? 'Posta sunucusuna bağlanıldı.' : `Bağlantı kurulamadı: ${r.neden ?? ''}`); },
    onError: (h) => { bildir('hata', hataIletisi(h, 'Bağlantı sınanamadı.')); },
  });

  if (durum.isPending) return <Kart baslik="Posta sunucusu"><DurumKutusu durum="yukleniyor" /></Kart>;
  if (durum.isError) {
    return (
      <Kart baslik="Posta sunucusu">
        <DurumKutusu durum="hata" mesaj={hataIletisi(durum.error, 'E-posta durumu alınamadı.')} yenile={() => { void durum.refetch(); }} />
      </Kart>
    );
  }
  const d = durum.data;
  const hazir = d.ortam === 'hazir';
  const rozet = !hazir ? <Rozet ton="pasif">Tanımsız</Rozet> : d.ayarAcik ? <Rozet ton="tamam">Açık</Rozet> : <Rozet ton="uyari">Kapalı</Rozet>;
  return (
    <>
      <Kart baslik="Posta sunucusu" sag={rozet}>
        {!hazir && (
          <p className="tc-ayar-aciklama">
            {EPOSTA_KIP_ADLARI[d.kip]} adresi ortam ayarında tanımlı değil ({d.kip === 'dis-servis' ? 'TMIV2_POSTA_DIS_SUNUCUSU' : 'TMIV2_POSTA_SUNUCUSU'}).
            Tanımlanana dek e-posta kuyruğa girmez ve gönderilmez. Sunucu türü aşağıdaki gönderim ayarlarından değişir.
          </p>
        )}
        {hazir && !d.ayarAcik && (
          <p className="tc-ayar-aciklama">Gönderim kapalıyken e-postalar kuyrukta bekler; açılınca sırayla gider.</p>
        )}
        <div className="tc-eposta-sayilar">
          <SayiKarti baslik="Kuyrukta" simge="clock" sayi={d.kuyrukta} />
          <SayiKarti baslik="Son 24 saatte giden" simge="mail" sayi={d.son24Gonderilen} />
          <SayiKarti baslik="Son 24 saatte hata" simge="alert" sayi={d.son24Hata} ton="hata" />
          <SayiKarti baslik="İş e-postası olmayan kişi" simge="users" sayi={d.epostasizKisi} ton="uyari" altMetin="İK kartında iş e-postası" />
        </div>
        <ul className="tc-ayarlar" aria-label="Sunucu bağlantısı">
          <KilitliSatir baslik="Sunucu türü" deger={EPOSTA_KIP_ADLARI[d.kip]} aciklama="Aşağıdaki gönderim ayarlarından seçilir; adres ortam ayarındadır." />
          <KilitliSatir baslik="Sunucu adresi" deger={d.adres} />
          <KilitliSatir baslik="Güvenlik" deger={d.guvenlik === null ? null : d.guvenlik === 'yok' ? 'Şifresiz' : d.guvenlik.toUpperCase()} />
          <KilitliSatir baslik="İzinli alan adları" deger={d.alanAdlari.length === 0 ? null : d.alanAdlari.join(', ')} />
          <KilitliSatir baslik="Gönderen adres" deger={d.gonderen} />
        </ul>
        <p className="tc-ayar-aciklama">
          {d.sonGonderim === null ? 'Henüz e-posta gönderilmedi.' : `Son gönderim: ${zaman(d.sonGonderim)}`}
        </p>
        <div className="tc-eposta-eylemler">
          <Dugme simge="mail" disabled={!hazir} yukleniyor={deneme.isPending} onClick={() => { deneme.mutate(); }}>Kendime deneme gönder</Dugme>
          <Dugme simge="check" disabled={!hazir} yukleniyor={sina.isPending} onClick={() => { sina.mutate(); }}>Bağlantıyı sına</Dugme>
        </div>
      </Kart>
      {gonderimAyarlari({
        // Açmak kuyruğu hemen gönderir; dış servise geçmek içeriği firma dışına çıkarır: ikisi de önce onay ister.
        onayMetni: (anahtar, deger) => {
          if (anahtar === 'bildirim.eposta' && deger === true) {
            return hazir
              ? `Gönderimi aç: kuyruktaki ${String(d.kuyrukta)} e-posta ${EPOSTA_KIP_ADLARI[d.kip]} üzerinden hemen gidecek.`
              : `Gönderimi aç: ${EPOSTA_KIP_ADLARI[d.kip]} adresi ortam ayarında tanımlanınca e-postalar gitmeye başlar.`;
          }
          if (anahtar === 'bildirim.eposta-kipi' && deger === 'dis-servis' && d.kip !== 'dis-servis') {
            return `E-postalar bundan sonra ${EPOSTA_KIP_ADLARI['dis-servis']} üzerinden, firma dışındaki sunucudan gidecek.${d.ayarAcik ? ` Gönderim açık; kuyruktaki ${String(d.kuyrukta)} e-posta da bu yoldan gider.` : ''}`;
          }
          return null;
        },
        kaydedilince: () => { void istemci.invalidateQueries({ queryKey: ANAHTAR.durum }); },
      })}
    </>
  );
}

// --- Tetikleyiciler -----------------------------------------------------------------------------------------------------

const tekrarMetni = (s: EpostaTetikleyiciSatiri): string =>
  (s.tekrarGun === null || s.tekrarEnCok === null ? 'Yok' : `${s.tekrarGun} günde bir, en çok ${s.tekrarEnCok} kez`);
const kademeMetni = (s: EpostaTetikleyiciSatiri): string => {
  if (s.yukseltGun === null) return 'Yok';
  const kime = [s.yukseltRolIdleri.length > 0 ? `${s.yukseltRolIdleri.length} rol` : null, s.yukseltKisiIdleri.length > 0 ? `${s.yukseltKisiIdleri.length} kişi` : null];
  return `${s.yukseltGun} gün sonra ${kime.filter(Boolean).join(', ')}`;
};

function Tetikleyiciler() {
  const liste = useQuery({ queryKey: ANAHTAR.tetikleyiciler, queryFn: () => api.get<EpostaTetikleyicileriCevabi>('/bildirimler/eposta/tetikleyiciler') });
  const [konu, setKonu] = useState('');
  const [arama, setArama] = useState('');
  const [acik, setAcik] = useState<EpostaTetikleyiciSatiri['tur'] | null>(null);

  if (liste.isPending) return <Kart baslik="Tetikleyiciler"><DurumKutusu durum="yukleniyor" /></Kart>;
  if (liste.isError) {
    return (
      <Kart baslik="Tetikleyiciler">
        <DurumKutusu durum="hata" mesaj={hataIletisi(liste.error, 'Tetikleyiciler alınamadı.')} yenile={() => { void liste.refetch(); }} />
      </Kart>
    );
  }
  const aranan = arama.trim().toLocaleLowerCase('tr');
  const satirlar = liste.data.satirlar
    .filter((s) => konu === '' || s.konu === konu)
    .filter((s) => aranan === '' || s.baslik.toLocaleLowerCase('tr').includes(aranan));
  const secili = liste.data.satirlar.find((s) => s.tur === acik) ?? null;
  const sutunlar: readonly Sutun<EpostaTetikleyiciSatiri>[] = [
    {
      anahtar: 'olay', baslik: 'Olay', csv: (s) => s.baslik,
      hucre: (s) => <span className="tc-eposta-olay-hucre"><Simge ad={ONEM_SIMGESI[s.onem]} boyut="k" /><span>{s.baslik}</span></span>,
    },
    { anahtar: 'konu', baslik: 'Konu', hucre: (s) => EPOSTA_KONU_ADLARI[s.konu] },
    { anahtar: 'sinif', baslik: 'Sınıf', hucre: (s) => SINIF_ADI[s.sinif] },
    {
      anahtar: 'eposta', baslik: 'E-posta', csv: (s) => (s.eposta ? 'Açık' : 'Kapalı'),
      hucre: (s) => <Rozet ton={s.eposta ? 'tamam' : 'pasif'}>{s.eposta ? 'Açık' : 'Kapalı'}</Rozet>,
    },
    { anahtar: 'zaman', baslik: 'Ne zaman', hucre: (s) => (s.zaman === 'hemen' ? 'Hemen' : 'Günlük özet') },
    { anahtar: 'tekrar', baslik: 'Tekrar', hucre: tekrarMetni },
    { anahtar: 'kademe', baslik: 'Kademe', hucre: kademeMetni },
  ];
  return (
    <Kart baslik="Tetikleyiciler">
      <p className="tc-ayar-aciklama">
        Olay başına e-postanın gidip gitmeyeceğini, ne zaman gideceğini, iş açık kaldıkça tekrarını ve kademesini seçin. Alıcılar bildirimin
        alıcılarıdır (Bildirim yönetimi, Bildirim alıcıları); operatöre e-posta gitmez.
      </p>
      <Tablo
        etiket="E-posta tetikleyicileri"
        sutunlar={sutunlar}
        satirlar={satirlar}
        satirAnahtari={(s) => s.tur}
        satirSec={(s) => { setAcik(s.tur); }}
        bosMesaj="Bu süzgece uyan olay yok."
        arac={{
          arama: { deger: arama, degistir: setArama, etiket: 'Olay ara' },
          suzgec: {
            etiket: 'Konu', secili: konu, sec: setKonu,
            secenekler: [{ deger: '', baslik: 'Bütün konular' }, ...EPOSTA_KONULARI.map((k) => ({ deger: k, baslik: EPOSTA_KONU_ADLARI[k] }))],
          },
          csv: { ad: 'eposta-tetikleyicileri' },
        }}
      />
      {secili && (
        <TetikleyiciPenceresi
          key={`${secili.tur}:${String(secili.surum)}`}
          satir={secili}
          roller={liste.data.roller}
          kisiler={liste.data.kisiler}
          kapat={() => { setAcik(null); }}
        />
      )}
    </Kart>
  );
}

const sayiMi = (m: string): number | null => (/^\d{1,3}$/.test(m.trim()) ? Number(m.trim()) : null);

function TetikleyiciPenceresi({ satir, roller, kisiler, kapat }: {
  satir: EpostaTetikleyiciSatiri;
  roller: EpostaTetikleyicileriCevabi['roller'];
  kisiler: EpostaTetikleyicileriCevabi['kisiler'];
  kapat: () => void;
}) {
  const istemci = useQueryClient();
  const { bildir } = useBildirim();
  const [eposta, setEposta] = useState(satir.eposta);
  const [ozet, setOzet] = useState(satir.zaman === 'ozet');
  const [tekrar, setTekrar] = useState(satir.tekrarGun !== null);
  const [tekrarGun, setTekrarGun] = useState(String(satir.tekrarGun ?? 3));
  const [tekrarEnCok, setTekrarEnCok] = useState(String(satir.tekrarEnCok ?? 3));
  const [kademe, setKademe] = useState(satir.yukseltGun !== null);
  const [kademeGun, setKademeGun] = useState(String(satir.yukseltGun ?? 2));
  const [rolIdleri, setRolIdleri] = useState(satir.yukseltRolIdleri);
  const [kisiIdleri, setKisiIdleri] = useState(satir.yukseltKisiIdleri);
  const [sablonId, setSablonId] = useState(satir.sablonId);
  const sablonlar = useQuery({ queryKey: ANAHTAR.sablonlar, queryFn: () => api.get<EpostaSablonlariCevabi>('/bildirimler/eposta/sablonlar') });
  const kisiAdi = new Map(kisiler.map((k) => [k.id, k.ad]));
  const kaydet = useMutation({
    mutationFn: (g: EpostaTetikleyiciDegistirGovdesi) => api.post<EpostaTetikleyicileriCevabi>(`/bildirimler/eposta/tetikleyiciler/${satir.tur}/degistir`, g),
    onSuccess: (guncel) => {
      istemci.setQueryData(ANAHTAR.tetikleyiciler, guncel);
      bildir('tamam', 'Tetikleyici kaydedildi.');
      kapat();
    },
    onError: (h) => {
      bildir('hata', hataIletisi(h, 'Tetikleyici kaydedilemedi.'));
      void istemci.invalidateQueries({ queryKey: ANAHTAR.tetikleyiciler });
    },
  });
  const gunHatasi = (m: string, enCok: number): string | undefined => {
    const n = sayiMi(m);
    return n === null || n < 1 || n > enCok ? `1 ile ${enCok} arasında olmalı.` : undefined;
  };
  const hatalar = {
    tekrarGun: tekrar ? gunHatasi(tekrarGun, 60) : undefined,
    tekrarEnCok: tekrar ? gunHatasi(tekrarEnCok, 10) : undefined,
    kademeGun: kademe ? gunHatasi(kademeGun, 60) : undefined,
    kademeKime: kademe && rolIdleri.length + kisiIdleri.length === 0 ? 'En az bir rol ya da kişi seçin.' : undefined,
  };
  const gecerli = Object.values(hatalar).every((h) => h === undefined);
  const gonder = () => {
    kaydet.mutate({
      eposta, zaman: ozet ? 'ozet' : 'hemen',
      tekrarGun: tekrar ? sayiMi(tekrarGun) : null, tekrarEnCok: tekrar ? sayiMi(tekrarEnCok) : null,
      yukseltGun: kademe ? sayiMi(kademeGun) : null, yukseltRolIdleri: kademe ? rolIdleri : [], yukseltKisiIdleri: kademe ? kisiIdleri : [],
      sablonId, surum: satir.surum,
    });
  };
  const eklenebilir = kisiler.filter((k) => !kisiIdleri.includes(k.id));
  return (
    <Pencere
      acik
      kapat={kapat}
      baslik={satir.baslik}
      tur="yan"
      alt={(
        <div className="tc-eposta-eylemler">
          <Dugme onClick={kapat}>Vazgeç</Dugme>
          <Dugme tur="birincil" simge="check" disabled={!gecerli} yukleniyor={kaydet.isPending} onClick={gonder}>Kaydet</Dugme>
        </div>
      )}
    >
      <div className="tc-eposta-form">
        <p className="tc-eposta-olay">
          <Rozet ton={ONEM_TONU[satir.onem]}>{ONEM_ADI[satir.onem]}</Rozet>
          <Rozet ton="bilgi">{sablonId === null ? `${EPOSTA_KONU_ADLARI[satir.konu]} şablonu` : sablonlar.data?.ozel.find((o) => o.id === sablonId)?.ad ?? 'Şablon'}</Rozet>
          <Rozet ton="pasif">{SINIF_ADI[satir.sinif]}</Rozet>
        </p>
        <div className="tc-ayar">
          <div className="tc-ayar-metin">
            <p className="tc-ayar-baslik">E-posta gönder</p>
            <p className="tc-ayar-aciklama">Kapalıyken bu olay yalnız uygulama içinde bildirilir.</p>
          </div>
          <AcKapa etiket="E-posta gönder" acik={eposta} degistir={setEposta} />
        </div>
        <Secim
          etiket="Şablon"
          value={sablonId === null ? '' : String(sablonId)}
          disabled={!eposta}
          secenekler={[
            { deger: '', baslik: `${EPOSTA_KONU_ADLARI[satir.konu]} (sistem şablonu)` },
            ...(sablonlar.data?.ozel ?? []).map((o) => ({ deger: String(o.id), baslik: o.ad })),
          ]}
          onChange={(o) => { setSablonId(o.target.value === '' ? null : Number(o.target.value)); }}
        />
        <fieldset className="tc-eposta-grup" disabled={!eposta}>
          <legend>Ne zaman</legend>
          <IsaretKutusu etiket="Hemen değil, günlük özette gönder" checked={ozet} onChange={(o) => { setOzet(o.target.checked); }} />
          <IsaretKutusu etiket="İş açık kaldıkça tekrarla" checked={tekrar} onChange={(o) => { setTekrar(o.target.checked); }} />
          {tekrar && (
            <div className="tc-eposta-satir">
              <Girdi etiket="Kaç günde bir" inputMode="numeric" value={tekrarGun} hata={hatalar.tekrarGun} onChange={(o) => { setTekrarGun(o.target.value); }} />
              <Girdi etiket="En çok kaç kez" inputMode="numeric" value={tekrarEnCok} hata={hatalar.tekrarEnCok} onChange={(o) => { setTekrarEnCok(o.target.value); }} />
            </div>
          )}
          <p className="tc-ayar-aciklama">Tekrar ve kademe, görev ve hatırlatma yapılınca, bilgi okununca durur.</p>
        </fieldset>
        <fieldset className="tc-eposta-grup" disabled={!eposta}>
          <legend>Kademe</legend>
          <IsaretKutusu etiket="İş açık kalırsa üst kademeye de gönder" checked={kademe} onChange={(o) => { setKademe(o.target.checked); }} />
          {kademe && (
            <>
              <Girdi etiket="Kaç gün sonra" inputMode="numeric" value={kademeGun} hata={hatalar.kademeGun} onChange={(o) => { setKademeGun(o.target.value); }} />
              <div className="tc-cagri-rolleri" role="group" aria-label="Kademe rolleri">
                {roller.map((r) => (
                  <IsaretKutusu
                    key={r.id}
                    etiket={r.ad}
                    checked={rolIdleri.includes(r.id)}
                    onChange={(o) => { setRolIdleri(o.target.checked ? [...rolIdleri, r.id] : rolIdleri.filter((x) => x !== r.id)); }}
                  />
                ))}
              </div>
              <ul className="tc-alici-kisiler" aria-label="Kademe kişileri">
                {kisiIdleri.map((id) => (
                  <li key={id}>
                    <Dugme simge="x" aria-label={`${kisiAdi.get(id) ?? `Kişi ${id}`} çıkar`} onClick={() => { setKisiIdleri(kisiIdleri.filter((x) => x !== id)); }}>
                      {kisiAdi.get(id) ?? `Kişi ${id}`}
                    </Dugme>
                  </li>
                ))}
              </ul>
              <Secim
                etiket="Kişi ekle"
                value=""
                bosSecenek="Kişi seçin"
                hata={hatalar.kademeKime}
                disabled={eklenebilir.length === 0}
                secenekler={eklenebilir.map((k) => ({ deger: String(k.id), baslik: k.ad }))}
                onChange={(o) => { const id = Number(o.target.value); if (id > 0) setKisiIdleri([...kisiIdleri, id]); }}
              />
            </>
          )}
        </fieldset>
      </div>
    </Pencere>
  );
}

// --- Şablonlar ----------------------------------------------------------------------------------------------------------

// Ön izleme uydurma ORN- değerleriyle doldurulur; gerçek kayıt okunmaz.
function ornekDegerler(olay: string): EpostaDegerleri {
  const t = tesisSaati(Date.now());
  return {
    alici_adi: 'Deneme Kişi', olay, kayit_no: 'ORN-0042', tarih: `${t.slice(8, 10)}.${t.slice(5, 7)}.${t.slice(0, 4)} ${t.slice(11, 16)}`,
    gecikme_gunu: '2', istasyon: 'ORN-TZG-01', kayit_baglantisi: 'Kayda git', onem: 'Uyarı', kademe: '3 / 5: Gecikti',
  };
}

// 3435-2 a: altı sistem şablonu (konu başına, silinmez, varsayılana döner) ve yöneticinin açtığı şablonlar. Olay şablonu tetikleyiciden seçer.
type SablonSecimi = { tur: 'sistem'; konu: EpostaKonusu } | { tur: 'ozel'; id: number } | { tur: 'yeni'; ad: string; icerik: EpostaSablonIcerigi };
const icerigi = (s: EpostaSablonu | EpostaOzelSablonu): EpostaSablonIcerigi => ({
  simge: s.simge, konuKalibi: s.konuKalibi, baslikKalibi: s.baslikKalibi, govde: s.govde, tabloAlanlari: s.tabloAlanlari,
  dugmeYazisi: s.dugmeYazisi, onayDugmesi: s.onayDugmesi, altBilgi: s.altBilgi, serit: s.serit, logo: s.logo,
});

function Sablonlar() {
  const liste = useQuery({ queryKey: ANAHTAR.sablonlar, queryFn: () => api.get<EpostaSablonlariCevabi>('/bildirimler/eposta/sablonlar') });
  const tetik = useQuery({ queryKey: ANAHTAR.tetikleyiciler, queryFn: () => api.get<EpostaTetikleyicileriCevabi>('/bildirimler/eposta/tetikleyiciler') });
  const [secim, setSecim] = useState<SablonSecimi>({ tur: 'sistem', konu: 'satin-alma' });
  if (liste.isPending) return <Kart baslik="Şablonlar"><DurumKutusu durum="yukleniyor" /></Kart>;
  if (liste.isError) {
    return (
      <Kart baslik="Şablonlar">
        <DurumKutusu durum="hata" mesaj={hataIletisi(liste.error, 'Şablonlar alınamadı.')} yenile={() => { void liste.refetch(); }} />
      </Kart>
    );
  }
  const { satirlar, ozel } = liste.data;
  const sistem = secim.tur === 'sistem' ? satirlar.find((s) => s.konu === secim.konu) : undefined;
  const ozelSablon = secim.tur === 'ozel' ? ozel.find((s) => s.id === secim.id) : undefined;
  const olaylar = tetik.data?.satirlar ?? [];
  const kullananlar = sistem ? olaylar.filter((o) => o.sablonId === null && o.konu === sistem.konu)
    : ozelSablon ? olaylar.filter((o) => o.sablonId === ozelSablon.id) : [];
  const olay = kullananlar[0]?.baslik ?? 'Örnek olay';
  const kaynak = sistem ?? ozelSablon;
  const kopyala = () => {
    if (kaynak) setSecim({ tur: 'yeni', ad: `${'ad' in kaynak ? kaynak.ad : EPOSTA_KONU_ADLARI[kaynak.konu]} (kopya)`.slice(0, EPOSTA_SABLON_AD_EN_UZUN), icerik: icerigi(kaynak) });
  };
  const genel = satirlar.find((s) => s.konu === 'genel');
  const yeni = () => { if (genel) setSecim({ tur: 'yeni', ad: '', icerik: icerigi(genel) }); };
  const secili = (s: SablonSecimi) => (s.tur === 'sistem' && secim.tur === 'sistem' && s.konu === secim.konu) || (s.tur === 'ozel' && secim.tur === 'ozel' && s.id === secim.id);
  return (
    <Kart
      baslik="Şablonlar"
      sag={(
        <div className="tc-eposta-eylemler">
          <Dugme simge="file" disabled={kaynak === undefined} onClick={kopyala}>Kopyala</Dugme>
          <Dugme simge="plus" disabled={genel === undefined} onClick={yeni}>Yeni şablon</Dugme>
        </div>
      )}
    >
      <p className="tc-ayar-aciklama">
        Gövdeye yalnız listedeki alanlar girer; müşteri, tedarikçi, fiyat ve parça no yazılmaz. Olaya şablon Tetikleyiciler'den seçilir; seçilmeyen olay
        konusunun sistem şablonunu kullanır.
      </p>
      <div className="tc-eposta-sablonlar">
        <ul className="tc-eposta-sablon-listesi" aria-label="Şablonlar">
          {satirlar.map((s) => (
            <li key={s.konu}>
              <button type="button" className="tc-eposta-sablon-secimi" aria-current={secili({ tur: 'sistem', konu: s.konu }) || undefined} onClick={() => { setSecim({ tur: 'sistem', konu: s.konu }); }}>
                <Simge ad={SIMGE[s.simge]} boyut="k" />
                <span>
                  <span className="tc-eposta-sablon-adi">{EPOSTA_KONU_ADLARI[s.konu]}</span>
                  <span className="tc-ayar-aciklama">Sistem şablonu · {s.olaySayisi} olay{s.surum === null ? '' : ' · değiştirildi'}</span>
                </span>
              </button>
            </li>
          ))}
          {ozel.map((s) => (
            <li key={s.id}>
              <button type="button" className="tc-eposta-sablon-secimi" aria-current={secili({ tur: 'ozel', id: s.id }) || undefined} onClick={() => { setSecim({ tur: 'ozel', id: s.id }); }}>
                <Simge ad={SIMGE[s.simge]} boyut="k" />
                <span>
                  <span className="tc-eposta-sablon-adi">{s.ad}</span>
                  <span className="tc-ayar-aciklama">Yeni · {s.olaySayisi} olay</span>
                </span>
              </button>
            </li>
          ))}
          {secim.tur === 'yeni' && (
            <li><span className="tc-eposta-sablon-secimi" aria-current><Simge ad="plus" boyut="k" /><span className="tc-eposta-sablon-adi">Yeni şablon</span></span></li>
          )}
        </ul>
        {sistem && (
          <SablonDuzenleyici
            key={`s:${sistem.konu}:${String(sistem.surum)}`}
            hedef={{ tur: 'sistem', konu: sistem.konu, surum: sistem.surum }}
            icerik={icerigi(sistem)}
            olay={olay}
            kullananlar={kullananlar.map((o) => o.baslik)}
            sonra={setSecim}
          />
        )}
        {ozelSablon && (
          <SablonDuzenleyici
            key={`o:${String(ozelSablon.id)}:${String(ozelSablon.surum)}`}
            hedef={{ tur: 'ozel', id: ozelSablon.id, ad: ozelSablon.ad, surum: ozelSablon.surum }}
            icerik={icerigi(ozelSablon)}
            olay={olay}
            kullananlar={kullananlar.map((o) => o.baslik)}
            sonra={setSecim}
          />
        )}
        {secim.tur === 'yeni' && (
          <SablonDuzenleyici key={`y:${secim.ad}`} hedef={{ tur: 'yeni', ad: secim.ad }} icerik={secim.icerik} olay={olay} kullananlar={[]} sonra={setSecim} />
        )}
      </div>
    </Kart>
  );
}

type SablonHedefi = { tur: 'sistem'; konu: EpostaKonusu; surum: number | null } | { tur: 'ozel'; id: number; ad: string; surum: number } | { tur: 'yeni'; ad: string };

const SERIT_SINIFI: Record<Exclude<EpostaSeridi, 'yok'>, string> = {
  onem: 'tc-eposta-serit-onem', sari: 'tc-eposta-serit-sari', turuncu: 'tc-eposta-serit-turuncu', kirmizi: 'tc-eposta-serit-kirmizi',
  mavi: 'tc-eposta-serit-mavi', yesil: 'tc-eposta-serit-yesil',
};

function SablonDuzenleyici({ hedef, icerik, olay, kullananlar, sonra }: {
  hedef: SablonHedefi; icerik: EpostaSablonIcerigi; olay: string; kullananlar: readonly string[]; sonra: (s: SablonSecimi) => void;
}) {
  const istemci = useQueryClient();
  const { bildir } = useBildirim();
  const [ad, setAd] = useState(hedef.tur === 'sistem' ? '' : hedef.ad);
  const [simge, setSimge] = useState<EpostaSimgesi>(icerik.simge);
  const [serit, setSerit] = useState<EpostaSeridi>(icerik.serit);
  const [konuKalibi, setKonuKalibi] = useState(icerik.konuKalibi);
  const [baslikKalibi, setBaslikKalibi] = useState(icerik.baslikKalibi ?? '');
  const [govde, setGovde] = useState(icerik.govde);
  const [alanlar, setAlanlar] = useState<EpostaTabloAlani[]>(icerik.tabloAlanlari);
  const [dugmeYazisi, setDugmeYazisi] = useState(icerik.dugmeYazisi ?? '');
  const [onayDugmesi, setOnayDugmesi] = useState(icerik.onayDugmesi);
  const [altBilgi, setAltBilgi] = useState(icerik.altBilgi ?? '');
  const [logo, setLogo] = useState(icerik.logo);
  const kurumLogosu = useKurumLogosu();
  const [silinsin, setSilinsin] = useState(false);
  const govdesi = (varsayilan = false) => ({
    simge, konuKalibi, baslikKalibi, govde, tabloAlanlari: alanlar, dugmeYazisi, onayDugmesi, altBilgi, serit, logo, ...(varsayilan ? { varsayilan: true } : {}),
  });
  const basari = (guncel: EpostaSablonlariCevabi, mesaj: string, secim?: SablonSecimi) => {
    istemci.setQueryData(ANAHTAR.sablonlar, guncel);
    void istemci.invalidateQueries({ queryKey: ANAHTAR.tetikleyiciler });
    bildir('tamam', mesaj);
    if (secim) sonra(secim);
  };
  const hataVar = (h: unknown) => {
    bildir('hata', hataIletisi(h, 'Şablon kaydedilemedi.'));
    void istemci.invalidateQueries({ queryKey: ANAHTAR.sablonlar });
  };
  const yaz = useMutation({
    mutationFn: (varsayilan: boolean) => {
      if (hedef.tur === 'sistem') return api.post<EpostaSablonlariCevabi>(`/bildirimler/eposta/sablonlar/${hedef.konu}/degistir`, { ...govdesi(varsayilan), surum: hedef.surum });
      if (hedef.tur === 'ozel') return api.post<EpostaSablonlariCevabi>(`/bildirimler/eposta/ozel-sablonlar/${String(hedef.id)}/degistir`, { ad, ...govdesi(), surum: hedef.surum });
      return api.post<EpostaSablonlariCevabi>('/bildirimler/eposta/ozel-sablonlar/yeni', { ad, ...govdesi() });
    },
    onSuccess: (guncel, varsayilan) => {
      if (hedef.tur === 'yeni') {
        const acilan = guncel.ozel.find((o) => o.ad.trim().toLocaleLowerCase('tr') === ad.trim().toLocaleLowerCase('tr'));
        basari(guncel, 'Şablon açıldı.', acilan ? { tur: 'ozel', id: acilan.id } : undefined);
      } else basari(guncel, varsayilan ? 'Şablon varsayılana döndü.' : 'Şablon kaydedildi.');
    },
    onError: hataVar,
  });
  const sil = useMutation({
    mutationFn: () => (hedef.tur === 'ozel' ? api.post<EpostaSablonlariCevabi>(`/bildirimler/eposta/ozel-sablonlar/${String(hedef.id)}/sil`, { surum: hedef.surum }) : Promise.reject(new Error('Silinemez'))),
    onSuccess: (guncel) => { setSilinsin(false); basari(guncel, 'Şablon silindi; kullanan olaylar konularının şablonuna döndü.', { tur: 'sistem', konu: 'genel' }); },
    onError: (h) => { setSilinsin(false); hataVar(h); },
  });
  const deneme = useMutation({
    mutationFn: () => api.post<EpostaDenemeCevabi>('/bildirimler/eposta/deneme', hedef.tur === 'ozel' ? { ozelSablonId: hedef.id } : { konu: hedef.tur === 'sistem' ? hedef.konu : 'genel' }),
    onSuccess: (r) => { bildir(r.sonuc === 'gonderildi' ? 'tamam' : 'hata', r.sonuc === 'gonderildi' ? 'Kayıtlı şablonla deneme e-postası gönderildi.' : `Deneme gitmedi: ${r.neden ?? SONUC_ADI[r.sonuc]}`); },
    onError: (h) => { bildir('hata', hataIletisi(h, 'Deneme e-postası gönderilemedi.')); },
  });
  const bilinmeyen = (m: string) => {
    const l = bilinmeyenYerTutucular(m);
    return l.length === 0 ? undefined : `Bilinmeyen alan: ${l.map((a) => `{${a}}`).join(', ')}`;
  };
  const hatalar = {
    ad: hedef.tur !== 'sistem' && ad.trim() === '' ? 'Şablon adı boş olamaz.' : undefined,
    konu: konuKalibi.trim() === '' ? 'Konu boş olamaz.' : bilinmeyen(konuKalibi),
    baslik: bilinmeyen(baslikKalibi),
    govde: govde.trim() === '' ? 'Gövde boş olamaz.' : bilinmeyen(govde),
    altBilgi: bilinmeyen(altBilgi),
  };
  const gecerli = Object.values(hatalar).every((h) => h === undefined);
  const ilk = { ad: hedef.tur === 'sistem' ? '' : hedef.ad, ...icerik, baslikKalibi: icerik.baslikKalibi ?? '', dugmeYazisi: icerik.dugmeYazisi ?? '', altBilgi: icerik.altBilgi ?? '' };
  const degisti = hedef.tur === 'yeni' || ad !== ilk.ad || simge !== ilk.simge || serit !== ilk.serit || konuKalibi !== ilk.konuKalibi || baslikKalibi !== ilk.baslikKalibi
    || govde !== ilk.govde || alanlar.join() !== ilk.tabloAlanlari.join() || dugmeYazisi !== ilk.dugmeYazisi || onayDugmesi !== ilk.onayDugmesi || altBilgi !== ilk.altBilgi || logo !== ilk.logo;
  const d = ornekDegerler(olay);
  const onizlemeKonu = sablonDoldur(konuKalibi, d).replace(/\s*·\s*$/, '').trim();
  const onizlemeBaslik = sablonDoldur(baslikKalibi, d).trim() || olay;
  const onizlemeAlt = sablonDoldur(altBilgi, d).trim() || 'Bu e-postayı kimin alacağını sistem yöneticin belirler.';
  const tablo = alanlar.flatMap((a) => (d[a] === null || d[a] === '' ? [] : [[EPOSTA_TABLO_ADLARI[a], d[a]] as const]));
  const ekle = (y: EpostaYerTutucusu) => { setGovde(`${govde}{${y}}`); };
  return (
    <div className="tc-eposta-sablon">
      <div className="tc-eposta-form">
        {hedef.tur !== 'sistem' && (
          <Girdi etiket="Şablon adı" value={ad} maxLength={EPOSTA_SABLON_AD_EN_UZUN} hata={hatalar.ad} onChange={(o) => { setAd(o.target.value); }} />
        )}
        <div className="tc-eposta-simgeler" role="radiogroup" aria-label="E-posta simgesi">
          {EPOSTA_SIMGELERI.map((s) => (
            <button
              key={s}
              type="button"
              role="radio"
              aria-checked={simge === s}
              aria-label={SIMGE_ADI[s]}
              title={SIMGE_ADI[s]}
              className="tc-eposta-simge-secimi"
              onClick={() => { setSimge(s); }}
            >
              <Simge ad={SIMGE[s]} />
            </button>
          ))}
        </div>
        <Secim
          etiket="Renk şeridi"
          value={serit}
          secenekler={EPOSTA_SERITLERI.map((s) => ({ deger: s, baslik: EPOSTA_SERIT_ADLARI[s] }))}
          onChange={(o) => { setSerit(o.target.value as EpostaSeridi); }}
        />
        <Girdi etiket="Konu satırı" value={konuKalibi} maxLength={EPOSTA_KONU_EN_UZUN} hata={hatalar.konu} onChange={(o) => { setKonuKalibi(o.target.value); }} />
        <Girdi
          etiket="Başlık"
          value={baslikKalibi}
          maxLength={EPOSTA_BASLIK_EN_UZUN}
          hata={hatalar.baslik}
          ipucu="Boşsa olayın adı yazılır."
          onChange={(o) => { setBaslikKalibi(o.target.value); }}
        />
        <CokSatir
          etiket="Gövde"
          rows={7}
          value={govde}
          maxLength={EPOSTA_GOVDE_EN_UZUN}
          hata={hatalar.govde}
          ipucu={`${govde.length}/${EPOSTA_GOVDE_EN_UZUN}`}
          onChange={(o) => { setGovde(o.target.value); }}
        />
        <div className="tc-eposta-yer-tutucular" role="group" aria-label="Alan ekle">
          {EPOSTA_YER_TUTUCULARI.map((y) => (
            <Dugme key={y} simge="plus" onClick={() => { ekle(y); }}>{YER_TUTUCU_ADI[y]}</Dugme>
          ))}
        </div>
        <fieldset className="tc-eposta-grup">
          <legend>Bilgi tablosu</legend>
          <div className="tc-cagri-rolleri">
            {EPOSTA_TABLO_ALANLARI.map((a) => (
              <IsaretKutusu
                key={a}
                etiket={EPOSTA_TABLO_ADLARI[a]}
                checked={alanlar.includes(a)}
                onChange={(o) => { setAlanlar(o.target.checked ? EPOSTA_TABLO_ALANLARI.filter((x) => x === a || alanlar.includes(x)) : alanlar.filter((x) => x !== a)); }}
              />
            ))}
          </div>
        </fieldset>
        <fieldset className="tc-eposta-grup">
          <legend>Düğmeler</legend>
          <Girdi
            etiket="Düğme yazısı"
            value={dugmeYazisi}
            maxLength={EPOSTA_DUGME_EN_UZUN}
            ipucu={`Boşsa "${EPOSTA_VARSAYILAN_DUGME}".`}
            onChange={(o) => { setDugmeYazisi(o.target.value); }}
          />
          <IsaretKutusu etiket="Onay olaylarında Onayla / Reddet düğmesi" checked={onayDugmesi} onChange={(o) => { setOnayDugmesi(o.target.checked); }} />
        </fieldset>
        <IsaretKutusu etiket="Kurum logosunu üst bilgiye koy" checked={logo} onChange={(o) => { setLogo(o.target.checked); }} />
        {logo && kurumLogosu.data?.logo === null && (
          <p className="tc-ayar-aciklama">Kurum logosu yüklü değil; Sistem Ayarları &gt; Genel&apos;den yükleyin. Yüklenene dek e-posta logosuz gider.</p>
        )}
        <CokSatir
          etiket="Alt bilgi"
          rows={2}
          value={altBilgi}
          maxLength={EPOSTA_ALT_BILGI_EN_UZUN}
          hata={hatalar.altBilgi}
          ipucu="Boşsa sistemin cümlesi yazılır."
          onChange={(o) => { setAltBilgi(o.target.value); }}
        />
        <div className="tc-eposta-eylemler">
          {hedef.tur === 'sistem' && hedef.surum !== null && (
            <Dugme simge="rotate" disabled={yaz.isPending} onClick={() => { yaz.mutate(true); }}>Varsayılana dön</Dugme>
          )}
          {hedef.tur === 'ozel' && <Dugme simge="trash" tur="tehlike" disabled={yaz.isPending} onClick={() => { setSilinsin(true); }}>Sil</Dugme>}
          {hedef.tur === 'yeni' && <Dugme onClick={() => { sonra({ tur: 'sistem', konu: 'genel' }); }}>Vazgeç</Dugme>}
          {hedef.tur !== 'yeni' && (
            <Dugme simge="mail" disabled={degisti} yukleniyor={deneme.isPending} onClick={() => { deneme.mutate(); }}>Kendime deneme gönder</Dugme>
          )}
          <Dugme tur="birincil" simge="check" disabled={!degisti || !gecerli} yukleniyor={yaz.isPending} onClick={() => { yaz.mutate(false); }}>
            {hedef.tur === 'yeni' ? 'Şablonu aç' : 'Kaydet'}
          </Dugme>
        </div>
      </div>
      <section className="tc-eposta-onizleme" aria-label="Ön izleme">
        <p className="tc-eposta-onizleme-konu"><Simge ad="mail" boyut="k" /> {onizlemeKonu || olay}</p>
        <div className="tc-eposta-zarf">
          {logo && kurumLogosu.data?.logo != null && (
            <div className="tc-eposta-logo"><img src={kurumLogosu.data.logo} alt="Kurum logosu" /></div>
          )}
          <div className={serit === 'yok' ? 'tc-eposta-serit-bosluk' : `tc-eposta-serit ${SERIT_SINIFI[serit]}`} />
          <div className="tc-eposta-ust">
            <span className="tc-eposta-simge"><Simge ad={SIMGE[simge]} /></span>
            <div>
              <p className="tc-eposta-baslik">{onizlemeBaslik}</p>
              <p className="tc-ayar-aciklama">{d.kayit_no} · {d.tarih}</p>
            </div>
          </div>
          {sablonDoldur(govde, d).trim().split(/\n{2,}/).map((p, i) => <p key={i} className="tc-eposta-paragraf">{p}</p>)}
          {tablo.length > 0 && (
            <dl className="tc-eposta-tablo">
              {tablo.map(([a, v]) => (
                <div key={a}><dt>{a}</dt><dd>{v}</dd></div>
              ))}
            </dl>
          )}
          <div className="tc-eposta-dugmeler">
            <span className="tc-eposta-dugme">{dugmeYazisi.trim() || EPOSTA_VARSAYILAN_DUGME}</span>
            {onayDugmesi && <span className="tc-eposta-dugme tc-eposta-dugme-ikincil" title="Yalnız onay olaylarında">Onayla</span>}
            {onayDugmesi && <span className="tc-eposta-dugme tc-eposta-dugme-ikincil" title="Yalnız ret olan onay olaylarında">Reddet</span>}
          </div>
          <p className="tc-eposta-alt">Bu e-posta CORE MES tarafından kurumunuz adına gönderildi. {onizlemeAlt}</p>
        </div>
        <p className="tc-ayar-aciklama">
          {kullananlar.length === 0 ? 'Bu şablonu kullanan olay yok. Olaya Tetikleyiciler\'den atanır.' : `Bu şablonu kullanan olaylar: ${kullananlar.slice(0, 5).join(', ')}${kullananlar.length > 5 ? ` ve ${String(kullananlar.length - 5)} olay daha` : ''}.`}
        </p>
      </section>
      {silinsin && hedef.tur === 'ozel' && (
        <OnayPenceresi
          acik
          baslik={`${hedef.ad} silinsin mi?`}
          onayMetni="Sil"
          tehlikeli
          yukleniyor={sil.isPending}
          onayla={() => { sil.mutate(); }}
          vazgec={() => { setSilinsin(false); }}
        >
          <p>Bu şablonu kullanan {kullananlar.length} olay konusunun sistem şablonuna döner.</p>
        </OnayPenceresi>
      )}
    </div>
  );
}

// --- Gönderim defteri ---------------------------------------------------------------------------------------------------

function Defter() {
  const [sayfa, setSayfa] = useState(1);
  const [sonuc, setSonuc] = useState('');
  const liste = useQuery({
    queryKey: ANAHTAR.defter(sayfa, sonuc),
    queryFn: () => api.get<EpostaDefterCevabi>(`/bildirimler/eposta/defter?sayfa=${sayfa}${sonuc === '' ? '' : `&sonuc=${sonuc}`}`),
  });
  const durum = useQuery({ queryKey: ANAHTAR.durum, queryFn: () => api.get<EpostaDurumuCevabi>('/bildirimler/eposta/durum') });
  const sutunlar: readonly Sutun<EpostaDefterSatiri>[] = [
    { anahtar: 'zaman', baslik: 'Zaman', kirilmaz: true, hucre: (s) => zaman(s.zaman), csv: (s) => s.zaman },
    { anahtar: 'kisi', baslik: 'Kişi', hucre: (s) => s.kisiAdi ?? '—' },
    { anahtar: 'olay', baslik: 'Olay', hucre: (s) => s.baslik },
    { anahtar: 'kayit', baslik: 'Kayıt no', mono: true, hucre: (s) => <span className="tc-eposta-kayit-no">{s.kayitNo ?? '—'}</span> },
    { anahtar: 'sonuc', baslik: 'Sonuç', hucre: (s) => <Rozet ton={SONUC_TONU[s.sonuc]}>{SONUC_ADI[s.sonuc]}</Rozet>, csv: (s) => SONUC_ADI[s.sonuc] },
    { anahtar: 'neden', baslik: 'Neden', hucre: (s) => s.neden ?? '' },
  ];
  return (
    <Kart baslik="Gönderim defteri" sag={durum.data && durum.data.kuyrukta > 0 ? <Rozet ton="bilgi">{durum.data.kuyrukta} kuyrukta</Rozet> : undefined}>
      <p className="tc-ayar-aciklama">Her gönderim denemesi buraya yazılır ve silinmez. Kuyruktaki e-posta gönderilince defterde görünür.</p>
      {liste.isError ? (
        <DurumKutusu durum="hata" mesaj={hataIletisi(liste.error, 'Gönderim defteri alınamadı.')} yenile={() => { void liste.refetch(); }} />
      ) : (
        <Tablo
          etiket="Gönderim defteri"
          sutunlar={sutunlar}
          satirlar={liste.data?.satirlar ?? []}
          satirAnahtari={(s) => s.id}
          yukleniyor={liste.isPending}
          bosMesaj="Henüz gönderim yok."
          arac={{
            suzgec: {
              etiket: 'Sonuç', secili: sonuc, sec: (d) => { setSonuc(d); setSayfa(1); },
              secenekler: [{ deger: '', baslik: 'Hepsi' }, ...(['gonderildi', 'gonderilemedi', 'atlandi'] as const).map((s) => ({ deger: s, baslik: SONUC_ADI[s] }))],
            },
          }}
          sayfalama={liste.data && { sayfa: liste.data.sayfa, sayfaBoyu: liste.data.sayfaBoyu, toplam: liste.data.toplam, degistir: setSayfa }}
        />
      )}
    </Kart>
  );
}
