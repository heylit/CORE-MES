import { useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type {
  DegisiklikListesiSorgusu, DegisiklikSatiri, DenetimUclari, KayitListesiSorgusu, KayitSatiri,
} from '#paylasilan/sozlesme/denetim.ts';
import { Dugme, DurumKutusu, Girdi, Kart, Pencere, Secim, Simge, Tablo, type Sutun } from '../../ortak/arayuz/index.ts';
import { useOturum } from '../../ortak/veri/oturum.ts';
import { ucCagrisi } from '../../ortak/veri/uc-cagrisi.ts';
import { anahtarlar } from './anahtarlar.ts';
import './denetim.css';

const cagri = ucCagrisi<DenetimUclari>();
const SAYFA_BOYU = 50;

type Gorunum = 'komutlar' | 'degisiklikler';
const GORUNUMLER = [{ deger: 'komutlar', baslik: 'Komutlar' }, { deger: 'degisiklikler', baslik: 'Değişiklikler' }] as const;

interface Suzgec { kisi: string; baslangic: string; bitis: string; komut: string; tablo: string }
const BOS_SUZGEC: Suzgec = { kisi: '', baslangic: '', bitis: '', komut: '', tablo: '' };

// Defterdeki tablo adının ekrandaki karşılığı (392 a listesi); listede olmayan tablo kendi adıyla görünür.
const TABLO_ADLARI: Readonly<Record<string, string>> = {
  uretim_emri: 'Üretim emri',
  uretim_emirleri_is_emri: 'İş emri',
  siparisler_siparis_satiri: 'Sipariş satırı',
  malzeme_katalog_karti: 'Malzeme kartı',
  rol: 'Rol',
  rol_islemi: 'Rol yetkisi',
  kisi_rolu: 'Kişi rolü',
  kisi_islemi: 'Kişi yetkisi',
  kisi_is_merkezi: 'Kişi iş merkezi',
  ayar: 'Sistem ayarı',
};
const ISLEM_ADLARI: Readonly<Record<DegisiklikSatiri['islem'], string>> = { ekle: 'Ekleme', guncelle: 'Güncelleme', sil: 'Silme' };

const zaman = (z: string) => new Date(z).toLocaleString('tr-TR');
const komut = (k: { yontem: string; yol: string }) => `${k.yontem} ${k.yol}`;
const kimlikMetni = (k: KayitSatiri['kimlikler']) => Object.entries(k).map(([ad, deger]) => `${ad} ${deger}`).join(', ');
const kisiMetni = (k: KayitSatiri) => k.kisiAd ?? (k.kisiId === null ? 'Oturumsuz' : `#${k.kisiId}`);
const tabloAdi = (t: string) => TABLO_ADLARI[t] ?? t;
const anahtarMetni = (a: DegisiklikSatiri['anahtar']) => Object.entries(a).map(([ad, deger]) => `${ad} ${String(deger)}`).join(', ');
// Göçle ya da arka işle yapılan değişimde kişi yoktur.
const degistirenMetni = (d: DegisiklikSatiri) => d.kisiAd ?? (d.kisiId === null ? 'Sistem' : `#${d.kisiId}`);
const degerMetni = (d: unknown) => (d === null ? '—' : typeof d === 'string' ? d : JSON.stringify(d));

const SUTUNLAR: readonly Sutun<KayitSatiri>[] = [
  { anahtar: 'zaman', baslik: 'Zaman', kirilmaz: true, hucre: (k) => zaman(k.zaman) },
  { anahtar: 'kisi', baslik: 'Kişi', hucre: kisiMetni },
  { anahtar: 'komut', baslik: 'Komut', mono: true, hucre: komut },
  { anahtar: 'kayit', baslik: 'Kayıt', mono: true, hucre: (k) => kimlikMetni(k.kimlikler) },
];

const DEGISIKLIK_SUTUNLARI: readonly Sutun<DegisiklikSatiri>[] = [
  { anahtar: 'zaman', baslik: 'Zaman', kirilmaz: true, hucre: (d) => zaman(d.zaman) },
  { anahtar: 'kisi', baslik: 'Kişi', hucre: degistirenMetni },
  { anahtar: 'tablo', baslik: 'Kayıt türü', hucre: (d) => tabloAdi(d.tablo) },
  { anahtar: 'kayit', baslik: 'Kayıt', mono: true, hucre: (d) => anahtarMetni(d.anahtar) },
  { anahtar: 'islem', baslik: 'İşlem', hucre: (d) => ISLEM_ADLARI[d.islem] },
  { anahtar: 'alanlar', baslik: 'Alanlar', hucre: (d) => d.alanAdlari.join(', ') },
];

const tarihSuzgeci = (s: Suzgec) => ({
  ...(s.kisi === '' ? {} : { kisi: Number(s.kisi) }),
  ...(s.baslangic === '' ? {} : { baslangic: s.baslangic }),
  ...(s.bitis === '' ? {} : { bitis: s.bitis }),
});

function degisiklikSorgusuKur(s: Suzgec, sayfa: number): DegisiklikListesiSorgusu {
  return { sayfa, sayfaBoyu: SAYFA_BOYU, ...tarihSuzgeci(s), ...(s.tablo === '' ? {} : { tablo: s.tablo }) };
}

function sorguKur(s: Suzgec, sayfa: number): KayitListesiSorgusu {
  const bosluk = s.komut.indexOf(' ');
  return {
    sayfa,
    sayfaBoyu: SAYFA_BOYU,
    ...tarihSuzgeci(s),
    ...(bosluk < 0 ? {} : { yontem: s.komut.slice(0, bosluk) as NonNullable<KayitListesiSorgusu['yontem']>, yol: s.komut.slice(bosluk + 1) }),
  };
}

// Kayıt defteri yalnız okunur: değiştirme ve silme yoktur (tablo yalnız ekleme kabul eder). "Değişiklikler" görünümü aynı
// süzgeçlerle eski/yeni değer defterini (392 a) listeler; değer, gövde gibi `denetim.govde-oku` ister.
export function DenetimKaydi() {
  const oturum = useOturum();
  const [gorunum, gorunumYaz] = useState<Gorunum>('komutlar');
  const [suzgec, suzgecYaz] = useState<Suzgec>(BOS_SUZGEC);
  const [sayfa, sayfaYaz] = useState(1);
  const [secili, seciliYaz] = useState<KayitSatiri | null>(null);
  const [seciliDegisiklik, seciliDegisiklikYaz] = useState<DegisiklikSatiri | null>(null);
  const komutlar = gorunum === 'komutlar';
  const sorgu = sorguKur(suzgec, sayfa);
  const dSorgu = degisiklikSorgusuKur(suzgec, sayfa);
  const secenekler = useQuery({ queryKey: anahtarlar.suzgecler, queryFn: () => cagri.get('/denetim-kayitlari/suzgecler'), enabled: komutlar });
  const dSecenekler = useQuery({
    queryKey: anahtarlar.degisiklikSuzgecleri, queryFn: () => cagri.get('/denetim-degisiklikleri/suzgecler'), enabled: !komutlar,
  });
  const liste = useQuery({
    queryKey: anahtarlar.liste(sorgu),
    queryFn: () => cagri.get('/denetim-kayitlari', { sorgu }),
    placeholderData: keepPreviousData,
    enabled: komutlar,
  });
  const dListe = useQuery({
    queryKey: anahtarlar.degisiklikler(dSorgu),
    queryFn: () => cagri.get('/denetim-degisiklikleri', { sorgu: dSorgu }),
    placeholderData: keepPreviousData,
    enabled: !komutlar,
  });
  const degistir = (degisen: Partial<Suzgec>) => { suzgecYaz((s) => ({ ...s, ...degisen })); sayfaYaz(1); };
  // Oturum gelmeden yetki bilinmez; o sürede "yetkiniz yok" yazılmaz.
  const icerikOkur = oturum.data ? oturum.data.islemler.includes('denetim.govde-oku') : null;
  const kisiSecenekleri = (komutlar ? secenekler.data?.kisiler : dSecenekler.data?.kisiler) ?? [];

  return (
    <Kart baslik="Denetim Kaydı">
      <div className="tc-denetim">
        <div className="tc-denetim-suzgec">
          <Secim
            etiket="Görünüm" value={gorunum} secenekler={GORUNUMLER}
            onChange={(e) => { gorunumYaz(e.target.value as Gorunum); sayfaYaz(1); }}
          />
          <Secim
            etiket="Kişi" bosSecenek="Hepsi" value={suzgec.kisi} onChange={(e) => degistir({ kisi: e.target.value })}
            secenekler={kisiSecenekleri.map((k) => ({ deger: String(k.id), baslik: k.ad }))}
          />
          <Girdi etiket="Başlangıç" type="date" value={suzgec.baslangic} max={suzgec.bitis || undefined} onChange={(e) => degistir({ baslangic: e.target.value })} />
          <Girdi etiket="Bitiş" type="date" value={suzgec.bitis} min={suzgec.baslangic || undefined} onChange={(e) => degistir({ bitis: e.target.value })} />
          {komutlar ? (
            <Secim
              etiket="İşlem" bosSecenek="Hepsi" value={suzgec.komut} onChange={(e) => degistir({ komut: e.target.value })}
              secenekler={(secenekler.data?.komutlar ?? []).map((k) => ({ deger: komut(k), baslik: komut(k) }))}
            />
          ) : (
            <Secim
              etiket="Kayıt türü" bosSecenek="Hepsi" value={suzgec.tablo} onChange={(e) => degistir({ tablo: e.target.value })}
              secenekler={(dSecenekler.data?.tablolar ?? []).map((t) => ({ deger: t, baslik: tabloAdi(t) }))}
            />
          )}
          <Dugme onClick={() => { suzgecYaz(BOS_SUZGEC); sayfaYaz(1); }} disabled={suzgec === BOS_SUZGEC}>
            <Simge ad="x" boyut="k" />Temizle
          </Dugme>
        </div>
        {komutlar ? (
          <>
            {liste.isPending && <DurumKutusu durum="yukleniyor" />}
            {liste.isError && <DurumKutusu durum="hata" yenile={() => { void liste.refetch(); }} />}
            {liste.data && (
              <Tablo
                etiket="Denetim kayıtları"
                sutunlar={SUTUNLAR}
                satirlar={liste.data.satirlar}
                satirAnahtari={(k) => k.id}
                satirSec={seciliYaz}
                bosMesaj="Bu süzgece uyan kayıt yok"
                mesgul={liste.isPlaceholderData}
                sayfalama={{ sayfa: liste.data.sayfa, sayfaBoyu: liste.data.sayfaBoyu, toplam: liste.data.toplam, degistir: sayfaYaz }}
              />
            )}
          </>
        ) : (
          <>
            {dListe.isPending && <DurumKutusu durum="yukleniyor" />}
            {dListe.isError && <DurumKutusu durum="hata" yenile={() => { void dListe.refetch(); }} />}
            {dListe.data && (
              <Tablo
                etiket="Değişiklikler"
                sutunlar={DEGISIKLIK_SUTUNLARI}
                satirlar={dListe.data.satirlar}
                satirAnahtari={(d) => d.id}
                satirSec={seciliDegisiklikYaz}
                bosMesaj="Bu süzgece uyan değişiklik yok"
                mesgul={dListe.isPlaceholderData}
                sayfalama={{ sayfa: dListe.data.sayfa, sayfaBoyu: dListe.data.sayfaBoyu, toplam: dListe.data.toplam, degistir: sayfaYaz }}
              />
            )}
          </>
        )}
      </div>
      <Pencere acik={secili !== null} kapat={() => seciliYaz(null)} baslik={`Kayıt #${secili?.id ?? ''}`} tur="yan">
        {secili && <KayitAyrintisi kayit={secili} icerikOkur={icerikOkur} />}
      </Pencere>
      <Pencere acik={seciliDegisiklik !== null} kapat={() => seciliDegisiklikYaz(null)} baslik={`Değişiklik #${seciliDegisiklik?.id ?? ''}`} tur="yan">
        {seciliDegisiklik && <DegisiklikAyrintisi degisiklik={seciliDegisiklik} icerikOkur={icerikOkur} />}
      </Pencere>
    </Kart>
  );
}

function DegisiklikAyrintisi({ degisiklik, icerikOkur }: { degisiklik: DegisiklikSatiri; icerikOkur: boolean | null }) {
  return (
    <div className="tc-denetim-ayrinti">
      <dl className="tc-denetim-ozet">
        <dt>Zaman</dt><dd>{zaman(degisiklik.zaman)}</dd>
        <dt>Kişi</dt><dd>{degistirenMetni(degisiklik)}</dd>
        <dt>Kayıt türü</dt><dd>{tabloAdi(degisiklik.tablo)}</dd>
        <dt>Kayıt</dt><dd className="mono">{anahtarMetni(degisiklik.anahtar)}</dd>
        <dt>İşlem</dt><dd>{ISLEM_ADLARI[degisiklik.islem]}</dd>
      </dl>
      {icerikOkur === null && <DurumKutusu durum="yukleniyor" />}
      {icerikOkur === true && <DegisiklikDegerleri id={degisiklik.id} />}
      {icerikOkur === false && <p className="tc-denetim-uyari"><Simge ad="lock" boyut="k" />Eski ve yeni değeri görme yetkiniz yok.</p>}
    </div>
  );
}

const DEGER_SUTUNLARI: readonly Sutun<{ alan: string; eski: unknown; yeni: unknown }>[] = [
  { anahtar: 'alan', baslik: 'Alan', mono: true, hucre: (a) => a.alan },
  { anahtar: 'eski', baslik: 'Eski', hucre: (a) => degerMetni(a.eski) },
  { anahtar: 'yeni', baslik: 'Yeni', hucre: (a) => degerMetni(a.yeni) },
];

// Değerler yalnız `denetim.govde-oku` ile ayrı uçtan gelir; metin düz yazılır (React kaçırır).
function DegisiklikDegerleri({ id }: { id: number }) {
  const icerik = useQuery({
    queryKey: anahtarlar.degisiklikIcerigi(id), queryFn: () => cagri.get('/denetim-degisiklikleri/:id/icerik', { parametre: { id } }),
  });
  if (icerik.isPending) return <DurumKutusu durum="yukleniyor" />;
  if (icerik.isError) return <DurumKutusu durum="hata" yenile={() => { void icerik.refetch(); }} />;
  return <Tablo etiket="Eski ve yeni değerler" sutunlar={DEGER_SUTUNLARI} satirlar={icerik.data.alanlar} satirAnahtari={(a) => a.alan} bosMesaj="Alan yok" />;
}

function KayitAyrintisi({ kayit, icerikOkur }: { kayit: KayitSatiri; icerikOkur: boolean | null }) {
  return (
    <div className="tc-denetim-ayrinti">
      <dl className="tc-denetim-ozet">
        <dt>Zaman</dt><dd>{zaman(kayit.zaman)}</dd>
        <dt>Kişi</dt><dd>{kisiMetni(kayit)}</dd>
        <dt>Komut</dt><dd className="mono">{komut(kayit)}</dd>
        <dt>Kayıt</dt><dd className="mono">{kimlikMetni(kayit.kimlikler) || 'yok'}</dd>
      </dl>
      {icerikOkur === null && <DurumKutusu durum="yukleniyor" />}
      {icerikOkur === true && <KayitIcerigi id={kayit.id} />}
      {icerikOkur === false && <p className="tc-denetim-uyari"><Simge ad="lock" boyut="k" />İçerik görme yetkiniz yok.</p>}
    </div>
  );
}

// Gövde yalnız `denetim.govde-oku` ile ayrı uçtan gelir; metin düz yazılır (React kaçırır).
function KayitIcerigi({ id }: { id: number }) {
  const icerik = useQuery({ queryKey: anahtarlar.icerik(id), queryFn: () => cagri.get('/denetim-kayitlari/:id/govde', { parametre: { id } }) });
  if (icerik.isPending) return <DurumKutusu durum="yukleniyor" />;
  if (icerik.isError) return <DurumKutusu durum="hata" yenile={() => { void icerik.refetch(); }} />;
  return (
    <>
      <h3>Parametreler</h3>
      <pre className="tc-denetim-icerik">{icerik.data.parametre === null ? 'yok' : JSON.stringify(icerik.data.parametre, null, 2)}</pre>
      <h3>Gövde</h3>
      <pre className="tc-denetim-icerik">{icerik.data.govde === null ? 'yok' : JSON.stringify(icerik.data.govde, null, 2)}</pre>
    </>
  );
}
