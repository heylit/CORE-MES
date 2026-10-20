import { useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { DenetimUclari, KayitListesiSorgusu, KayitSatiri } from '#paylasilan/sozlesme/denetim.ts';
import { Dugme, DurumKutusu, Girdi, Kart, Pencere, Secim, Simge, Tablo, type Sutun } from '../../ortak/arayuz/index.ts';
import { useOturum } from '../../ortak/veri/oturum.ts';
import { ucCagrisi } from '../../ortak/veri/uc-cagrisi.ts';
import { anahtarlar } from './anahtarlar.ts';
import './denetim.css';

const cagri = ucCagrisi<DenetimUclari>();
const SAYFA_BOYU = 50;

interface Suzgec { kisi: string; baslangic: string; bitis: string; komut: string }
const BOS_SUZGEC: Suzgec = { kisi: '', baslangic: '', bitis: '', komut: '' };

const zaman = (z: string) => new Date(z).toLocaleString('tr-TR');
const komut = (k: { yontem: string; yol: string }) => `${k.yontem} ${k.yol}`;
const kimlikMetni = (k: KayitSatiri['kimlikler']) => Object.entries(k).map(([ad, deger]) => `${ad} ${deger}`).join(', ');
const kisiMetni = (k: KayitSatiri) => k.kisiAd ?? (k.kisiId === null ? 'Oturumsuz' : `#${k.kisiId}`);

const SUTUNLAR: readonly Sutun<KayitSatiri>[] = [
  { anahtar: 'zaman', baslik: 'Zaman', kirilmaz: true, hucre: (k) => zaman(k.zaman) },
  { anahtar: 'kisi', baslik: 'Kişi', hucre: kisiMetni },
  { anahtar: 'komut', baslik: 'Komut', mono: true, hucre: komut },
  { anahtar: 'kayit', baslik: 'Kayıt', mono: true, hucre: (k) => kimlikMetni(k.kimlikler) },
];

function sorguKur(s: Suzgec, sayfa: number): KayitListesiSorgusu {
  const bosluk = s.komut.indexOf(' ');
  return {
    sayfa,
    sayfaBoyu: SAYFA_BOYU,
    ...(s.kisi === '' ? {} : { kisi: Number(s.kisi) }),
    ...(s.baslangic === '' ? {} : { baslangic: s.baslangic }),
    ...(s.bitis === '' ? {} : { bitis: s.bitis }),
    ...(bosluk < 0 ? {} : { yontem: s.komut.slice(0, bosluk) as NonNullable<KayitListesiSorgusu['yontem']>, yol: s.komut.slice(bosluk + 1) }),
  };
}

// Kayıt defteri yalnız okunur: değiştirme ve silme yoktur (tablo yalnız ekleme kabul eder).
export function DenetimKaydi() {
  const oturum = useOturum();
  const [suzgec, suzgecYaz] = useState<Suzgec>(BOS_SUZGEC);
  const [sayfa, sayfaYaz] = useState(1);
  const [secili, seciliYaz] = useState<KayitSatiri | null>(null);
  const sorgu = sorguKur(suzgec, sayfa);
  const secenekler = useQuery({ queryKey: anahtarlar.suzgecler, queryFn: () => cagri.get('/denetim-kayitlari/suzgecler') });
  const liste = useQuery({
    queryKey: anahtarlar.liste(sorgu),
    queryFn: () => cagri.get('/denetim-kayitlari', { sorgu }),
    placeholderData: keepPreviousData,
  });
  const degistir = (degisen: Partial<Suzgec>) => { suzgecYaz((s) => ({ ...s, ...degisen })); sayfaYaz(1); };
  // Oturum gelmeden yetki bilinmez; o sürede "yetkiniz yok" yazılmaz.
  const icerikOkur = oturum.data ? oturum.data.islemler.includes('denetim.govde-oku') : null;

  return (
    <Kart baslik="Denetim Kaydı">
      <div className="tc-denetim">
        <div className="tc-denetim-suzgec">
          <Secim
            etiket="Kişi" bosSecenek="Hepsi" value={suzgec.kisi} onChange={(e) => degistir({ kisi: e.target.value })}
            secenekler={(secenekler.data?.kisiler ?? []).map((k) => ({ deger: String(k.id), baslik: k.ad }))}
          />
          <Girdi etiket="Başlangıç" type="date" value={suzgec.baslangic} max={suzgec.bitis || undefined} onChange={(e) => degistir({ baslangic: e.target.value })} />
          <Girdi etiket="Bitiş" type="date" value={suzgec.bitis} min={suzgec.baslangic || undefined} onChange={(e) => degistir({ bitis: e.target.value })} />
          <Secim
            etiket="İşlem" bosSecenek="Hepsi" value={suzgec.komut} onChange={(e) => degistir({ komut: e.target.value })}
            secenekler={(secenekler.data?.komutlar ?? []).map((k) => ({ deger: komut(k), baslik: komut(k) }))}
          />
          <Dugme onClick={() => { suzgecYaz(BOS_SUZGEC); sayfaYaz(1); }} disabled={suzgec === BOS_SUZGEC}>
            <Simge ad="x" boyut="k" />Temizle
          </Dugme>
        </div>
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
      </div>
      <Pencere acik={secili !== null} kapat={() => seciliYaz(null)} baslik={`Kayıt #${secili?.id ?? ''}`} tur="yan">
        {secili && <KayitAyrintisi kayit={secili} icerikOkur={icerikOkur} />}
      </Pencere>
    </Kart>
  );
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
