import { useMemo, useState, type ReactNode } from 'react';
import type {
  AlternatifKurali, AlternatifZarfi, KapsamTuru, KaliteMuadili, DurumMuadili, MuadilTuru, ZarfKarti, ZarfSonucu,
} from '#paylasilan/sozlesme/malzeme-alternatifleri.ts';
import {
  Dugme, DurumKutusu, Girdi, OnayPenceresi, Rozet, Sekmeler, Simge, Tablo, useBildirim, type RozetTonu, type Sekme, type Sutun,
} from '../../../../ortak/arayuz/index.ts';
import { hataIletisi } from '../../../../ortak/veri/api.ts';
import type { EkranOzellikleri } from '../sekmeler.ts';
import type { KatalogKarti } from '../tipler.ts';
import { useKartlar } from '../veri.ts';
import { GrupSinirlari } from './GrupSinirlari.tsx';
import { KuralPenceresi, MuadilPenceresi, type MuadilAcilisi } from './pencereler.tsx';
import { useAlternatifTanimlari, useKartZarfi, useMuadilKaldir, type MuadilTablosu } from './veri.ts';
import './alternatifler.css';

// 3437 (sürüm 2 a): kartın kabul sınırı (zarf) kurallardan hesaplanır; dar kapsam geniş olanı ezer, boş alan miras kalır.
// Ekran yalnız gösterir ve yazanda düzenler; denetim ve hesap sunucudadır.
type Gorunum = 'zarf' | 'kurallar' | 'sinirlar' | 'muadiller' | 'kapali';

export const KAPSAM_ADI: Record<KapsamTuru, string> = { aile: 'Aile', sinif: 'Sınıf', kalite: 'Kalite', kart: 'Kart' };
export const MUADIL_ADI: Record<MuadilTuru, string> = { tam: 'Tam muadil', ust: 'Üst muadil', sartli: 'Şartlı' };
const MUADIL_TONU: Record<MuadilTuru, RozetTonu> = { tam: 'tamam', ust: 'bilgi', sartli: 'uyari' };
const SONUC: Record<Exclude<ZarfSonucu, 'disi'>, { ad: string; ton: RozetTonu }> = {
  ayni: { ad: 'Aynı nitelik', ton: 'tamam' }, icinde: { ad: 'Sınır içinde', ton: 'bilgi' }, sartli: { ad: 'Şartlı', ton: 'uyari' },
};

type Kaynak = AlternatifZarfi['pay']['kaynak'];
export function kaynakMetni(k: Kaynak): string {
  if (k === null) return 'Varsayılan';
  return k.kapsamTuru === 'kart' ? 'Kartın kuralı' : `${KAPSAM_ADI[k.kapsamTuru]} kuralı: ${k.kapsam}`;
}

export function payMetni(p: Pick<AlternatifZarfi['pay'], 'tur' | 'deger' | 'enAzMm'>): string {
  if (p.tur === 'tam') return 'Yalnız aynı ölçü';
  if (p.tur === 'mm') return `En çok +${p.deger} mm`;
  return `En çok +%${p.deger} (en az ${p.enAzMm} mm)`;
}

const sayi = (v: number) => v.toLocaleString('tr-TR', { maximumFractionDigits: 3 });
const olcuMetni = (o: Record<string, number>) => Object.entries(o).map(([a, v]) => `${a} ${sayi(v)}`).join(' · ');
const evetHayir = (v: boolean | null, evet: string, hayir: string) => (v === null ? 'Üstten' : v ? evet : hayir);

export function Alternatifler({ yetki }: EkranOzellikleri) {
  const tanimlar = useAlternatifTanimlari();
  const [gorunum, gorunumYaz] = useState<Gorunum>('zarf');
  const [kural, kuralYaz] = useState<{ kayit: AlternatifKurali | null; kapsamTuru?: KapsamTuru; kapsam?: string } | null>(null);
  if (tanimlar.isPending) return <DurumKutusu durum="yukleniyor" />;
  if (tanimlar.isError) return <DurumKutusu durum="hata" yenile={() => { void tanimlar.refetch(); }} />;
  const { kurallar, kaliteMuadilleri, durumMuadilleri } = tanimlar.data;
  const kapalilar = kurallar.filter((r) => r.kapali === true);
  const sekmeler: Sekme<Gorunum>[] = [
    { anahtar: 'zarf', baslik: 'Kart zarfı', simge: 'target' },
    { anahtar: 'kurallar', baslik: 'Kurallar', simge: 'list', sayi: kurallar.length },
    { anahtar: 'sinirlar', baslik: 'Grup sınırları', simge: 'target' },
    { anahtar: 'muadiller', baslik: 'Kalite ve durum muadilleri', simge: 'layers' },
    { anahtar: 'kapali', baslik: 'Kapalı kartlar', simge: 'lock', sayi: kapalilar.length },
  ];
  const kuralAc = (k: AlternatifKurali | null, kapsamTuru?: KapsamTuru, kapsam?: string) => kuralYaz({ kayit: k, kapsamTuru, kapsam });
  const kartKurali = (no: number) => {
    const var_ = kurallar.find((r) => r.kapsamTuru === 'kart' && r.kapsam === String(no)) ?? null;
    kuralAc(var_, 'kart', String(no));
  };
  return (
    <div className="tc-alt">
      <p className="tc-alt-not">
        Bir malzemenin aynısı yoksa hangi kalite, durum ve ölçünün kabul edildiğini burada belirlersiniz. Talep ve satın alma bu sınırları kullanır.
      </p>
      <Sekmeler etiket="İkame ve alternatifler" sekmeler={sekmeler} secili={gorunum} sec={gorunumYaz} />
      {gorunum === 'zarf' && <KartZarfiGorunumu yaz={yetki.tanimYaz} kartKurali={kartKurali} />}
      {gorunum === 'kurallar' && <KuralListesi kurallar={kurallar} yaz={yetki.tanimYaz} ac={kuralAc} />}
      {gorunum === 'sinirlar' && <GrupSinirlari yaz={yetki.tanimYaz} />}
      {gorunum === 'muadiller' && <Muadiller kalite={kaliteMuadilleri} durum={durumMuadilleri} yaz={yetki.tanimYaz} />}
      {gorunum === 'kapali' && <KapaliKartlar kurallar={kapalilar} yaz={yetki.tanimYaz} ac={kuralAc} />}
      {kural !== null && (
        <KuralPenceresi kayit={kural.kayit} kapsamTuru={kural.kapsamTuru} kapsam={kural.kapsam} kapat={() => kuralYaz(null)} />
      )}
    </div>
  );
}

const kartKodu = (k: KatalogKarti) => k.kayit.com.kod || `#${k.no}`;
const kartAdi = (k: KatalogKarti) => k.kayit.com.ad || 'Adsız kart';
const ARAMA_SINIRI = 30;

function KartZarfiGorunumu({ yaz, kartKurali }: { yaz: boolean; kartKurali: (no: number) => void }) {
  const kartlar = useKartlar();
  const [ara, araYaz] = useState('');
  const [secili, seciliYaz] = useState<number | null>(null);
  const hammaddeler = useMemo(() => (kartlar.data ?? []).filter((k) => k.kayit.tur === 'hammadde'), [kartlar.data]);
  const bulunan = useMemo(() => {
    const s = ara.trim().toLocaleLowerCase('tr');
    const l = s === '' ? hammaddeler : hammaddeler.filter((k) => `${kartKodu(k)} ${kartAdi(k)} ${k.kayit.grade ?? ''}`.toLocaleLowerCase('tr').includes(s));
    return l.slice(0, ARAMA_SINIRI);
  }, [ara, hammaddeler]);
  return (
    <div className="tc-alt-zarf" data-acik={secili !== null}>
      <section className="tc-alt-secici" aria-label="Hammadde kartları">
        <Girdi etiket="Kart ara" placeholder="Stok kodu, ad ya da kalite" value={ara} onChange={(e) => araYaz(e.target.value)} />
        {kartlar.isPending ? <DurumKutusu durum="yukleniyor" /> : kartlar.isError
          ? <DurumKutusu durum="hata" yenile={() => { void kartlar.refetch(); }} />
          : bulunan.length === 0 ? <p className="tc-alt-bos">Hammadde kartı bulunamadı.</p> : (
            <ul className="tc-alt-kartlar">
              {bulunan.map((k) => (
                <li key={k.kimlik}>
                  <button type="button" className="tc-alt-kart" aria-current={k.no === secili} onClick={() => seciliYaz(k.no)}>
                    <b className="tc-alt-kod">{kartKodu(k)}</b>
                    <span>{kartAdi(k)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
      </section>
      <section className="tc-alt-ayrinti" aria-label="Kartın zarfı">
        {secili === null
          ? <p className="tc-alt-bos">Kabul sınırlarını görmek için bir hammadde kartı seçin.</p>
          : <ZarfAyrintisi key={secili} no={secili} yaz={yaz} kartKurali={kartKurali} kapat={() => seciliYaz(null)} />}
      </section>
    </div>
  );
}

function ZarfAyrintisi({ no, yaz, kartKurali, kapat }: { no: number; yaz: boolean; kartKurali: (no: number) => void; kapat: () => void }) {
  const zarf = useKartZarfi(no);
  if (zarf.isPending) return <DurumKutusu durum="yukleniyor" />;
  if (zarf.isError) return <DurumKutusu durum="hata" yenile={() => { void zarf.refetch(); }} />;
  const { kart, zarf: z, kartlar } = zarf.data;
  return (
    <div className="tc-alt-govde">
      <Dugme className="tc-alt-don" simge="chev-left" onClick={kapat}>Listeye dön</Dugme>
      <header className="tc-alt-baslik">
        <h3 className="tc-alt-kod">{kart.kod ?? `#${kart.no}`}</h3>
        <span>{kart.ad ?? 'Adsız kart'}</span>
        {yaz && <Dugme simge="edit" onClick={() => kartKurali(kart.no)}>Bu kartın kuralı</Dugme>}
      </header>
      {z === null ? <p className="tc-alt-bos">Bu kartta kalite yok ya da kart hammadde değil; zarf hesaplanmaz.</p> : (
        <>
          {z.kapali && (
            <p className="tc-alt-kapali" role="note">
              <Simge ad="lock" boyut="k" /> Alternatif kapalı: yalnız aynı nitelikte malzeme kabul edilir. {z.gerekce}
            </p>
          )}
          <ZarfSinirlari z={z} />
          <h4 className="tc-alt-alt-baslik">Zarfa giren kartlar ({kartlar.length})</h4>
          <Tablo
            etiket="Zarfa giren kartlar" sutunlar={GIREN_SUTUNLARI} satirlar={kartlar} satirAnahtari={(k) => k.no}
            bosMesaj="Katalogda bu sınırlara giren başka kart yok."
          />
        </>
      )}
    </div>
  );
}

// Şartlı muadil kural açmadıkça kabul edilmez: seçenek soluk ve "kapalı" yazılı görünür.
function Secenekler({ s, sartliAcik }: { s: AlternatifZarfi['kalite']; sartliAcik: boolean }) {
  if (!s.acik) return <span>Yalnız aynısı ({s.istenen ?? 'yok'})</span>;
  return (
    <span className="tc-alt-secenekler">
      <span>{s.istenen ?? 'yok'}</span>
      {s.secenekler.length === 0 ? <span className="tc-alt-soluk">Muadil tanımlı değil</span>
        : s.secenekler.map((x) => (x.tur === 'sartli' && !sartliAcik
          ? <Rozet key={x.deger} ton="pasif" gorunum="cizgi">{x.deger} · Şartlı (kapalı)</Rozet>
          : <Rozet key={x.deger} ton={MUADIL_TONU[x.tur]} gorunum="cizgi">{x.deger} · {MUADIL_ADI[x.tur]}</Rozet>))}
    </span>
  );
}

// 3463-1b (Risk N1): kartta ya da grupta seçilen sınır o nitelikte kuralı ezer; satır bunu kaynağıyla söyler.
const sinirKaynagi = (k: Kaynak): string => (k === null ? 'Varsayılan' : k.kapsamTuru === 'kart' ? 'Kartın sınırı' : `${KAPSAM_ADI[k.kapsamTuru]} sınırı: ${k.kapsam}`);
const listeSiniri = (s: AlternatifZarfi['yuzey']) => (
  <span className="tc-alt-secenekler">
    <span>{s.istenen ?? 'yok'}</span>
    {s.secenekler.map((x) => <Rozet key={x.deger} ton={MUADIL_TONU[x.tur]} gorunum="cizgi">{x.deger} · {MUADIL_ADI[x.tur]}</Rozet>)}
  </span>
);

function ZarfSinirlari({ z }: { z: AlternatifZarfi }) {
  const olcuSiniri = z.olcu.find((o) => o.sinirKaynak !== null)?.sinirKaynak ?? null;
  const boyAraligi = z.boy !== null && (z.boy.enAz !== null || z.boy.enCok !== null);
  const satirlar: { ad: string; deger: ReactNode; kaynak: string; sinir: boolean }[] = [
    { ad: 'Kalite', deger: <Secenekler s={z.kalite} sartliAcik={z.sartliAcik} />, kaynak: (z.kalite.sinir ? sinirKaynagi : kaynakMetni)(z.kalite.kaynak), sinir: z.kalite.sinir },
    { ad: 'Durum', deger: <Secenekler s={z.durum} sartliAcik={z.sartliAcik} />, kaynak: (z.durum.sinir ? sinirKaynagi : kaynakMetni)(z.durum.kaynak), sinir: z.durum.sinir },
    { ad: 'Şartlı muadil', deger: z.sartliAcik ? 'Kabul edilir (açıkça onaylanır)' : 'Kabul edilmez', kaynak: kaynakMetni(z.sartliKaynak), sinir: false },
    {
      ad: 'Kesit ölçüsü',
      deger: z.olcu.length === 0 ? 'Ölçü yok'
        : `${z.olcu.map((o) => `${o.anahtar} ${sayi(o.enAz)} – ${sayi(o.enCok)} mm`).join(' · ')}${olcuSiniri === null ? ` (${payMetni(z.pay)})` : ''}`,
      kaynak: olcuSiniri === null ? kaynakMetni(z.pay.kaynak) : sinirKaynagi(olcuSiniri), sinir: olcuSiniri !== null,
    },
    ...(z.boy ? [{
      ad: 'Boy',
      deger: boyAraligi ? `${z.boy.enAz === null ? '…' : sayi(z.boy.enAz)} – ${z.boy.enCok === null ? '…' : sayi(z.boy.enCok)} mm`
        : `${z.boy.istenen === null ? 'Boy yok' : `${sayi(z.boy.istenen)} mm`} · ${z.boy.uzunKesilir ? 'uzun boy kesilir' : 'yalnız aynı boy'}`,
      kaynak: boyAraligi ? sinirKaynagi(z.boy.sinirKaynak) : kaynakMetni(z.boy.kaynak), sinir: boyAraligi,
    }] : []),
    {
      ad: 'Yüzey', deger: z.yuzey.sinir ? listeSiniri(z.yuzey) : z.yuzey.serbest ? 'Serbest' : `Aynı (${z.yuzey.istenen ?? 'yok'})`,
      kaynak: (z.yuzey.sinir ? sinirKaynagi : kaynakMetni)(z.yuzey.kaynak), sinir: z.yuzey.sinir,
    },
  ];
  return (
    <dl className="tc-alt-sinirlar">
      {satirlar.map((s) => (
        <div key={s.ad}>
          <dt>{s.ad}</dt>
          <dd>{s.deger}</dd>
          <dd className="tc-alt-kaynak">{s.sinir && <Rozet ton="bilgi">Seçilen sınır</Rozet>}<span>{s.kaynak}</span></dd>
        </div>
      ))}
    </dl>
  );
}

const GIREN_SUTUNLARI: readonly Sutun<ZarfKarti>[] = [
  { anahtar: 'kod', baslik: 'Stok kodu', mono: true, kirilmaz: true, hucre: (k) => <span title={k.ad ?? undefined}>{k.kod ?? `#${k.no}`}</span> },
  { anahtar: 'kalite', baslik: 'Kalite', hucre: (k) => k.kalite ?? '' },
  { anahtar: 'durum', baslik: 'Durum', hucre: (k) => k.durum ?? '' },
  { anahtar: 'olcu', baslik: 'Ölçü', kirilmaz: true, hucre: (k) => olcuMetni(k.olcu) },
  {
    anahtar: 'sonuc', baslik: 'Sonuç', hucre: (k) => (k.sonuc === 'disi' ? null : <Rozet ton={SONUC[k.sonuc].ton}>{SONUC[k.sonuc].ad}</Rozet>),
  },
  { anahtar: 'neden', baslik: 'Not', kes: true, hucre: (k) => k.nedenler.join('; ') },
];

function kuralOzeti(r: AlternatifKurali): string {
  const p: string[] = [];
  if (r.payTuru !== null) p.push(payMetni({ tur: r.payTuru, deger: r.payDeger ?? 0, enAzMm: r.payEnAzMm ?? 0 }));
  if (r.kaliteAcik !== null) p.push(r.kaliteAcik ? 'muadil kalite' : 'yalnız aynı kalite');
  if (r.durumAcik !== null) p.push(r.durumAcik ? 'muadil durum' : 'yalnız aynı durum');
  if (r.sartliAcik !== null) p.push(r.sartliAcik ? 'şartlı açık' : 'şartlı kapalı');
  if (r.boyUzunKesilir !== null) p.push(evetHayir(r.boyUzunKesilir, 'uzun boy kesilir', 'yalnız aynı boy'));
  if (r.yuzeySerbest !== null) p.push(evetHayir(r.yuzeySerbest, 'yüzey serbest', 'yüzey aynı'));
  if (r.kapali === true) p.push('alternatif kapalı');
  return p.length === 0 ? 'Hepsi üst kapsamdan' : p.join(' · ');
}

const kapsamMetni = (r: AlternatifKurali) => (r.kapsamTuru === 'kart' ? r.kapsamAdi ?? `Kart #${r.kapsam} (bulunamadı)` : r.kapsam);

function KuralListesi({ kurallar, yaz, ac }: { kurallar: readonly AlternatifKurali[]; yaz: boolean; ac: (k: AlternatifKurali | null) => void }) {
  const sutunlar: Sutun<AlternatifKurali>[] = [
    { anahtar: 'tur', baslik: 'Kapsam', hucre: (r) => <Rozet ton="pasif" gorunum="cizgi">{KAPSAM_ADI[r.kapsamTuru]}</Rozet> },
    { anahtar: 'kapsam', baslik: 'Uygulandığı yer', kes: true, hucre: kapsamMetni },
    { anahtar: 'ozet', baslik: 'Kural', kes: true, hucre: kuralOzeti },
    { anahtar: 'guncelleyen', baslik: 'Güncelleyen', hucre: (r) => r.guncelleyen ?? '' },
  ];
  return (
    <section className="tc-alt-bolum" aria-label="Kurallar">
      <p className="tc-alt-not">Kart kuralı kalite kuralını, kalite kuralı sınıfı, sınıf aileyi ezer. Boş bırakılan alan bir üst kapsamdan gelir; kural yoksa varsayılan geçerlidir.</p>
      {yaz && <div className="tc-alt-eylem"><Dugme tur="birincil" simge="plus" onClick={() => ac(null)}>Kural ekle</Dugme></div>}
      <Tablo
        etiket="Alternatif kuralları" sutunlar={sutunlar} satirlar={kurallar} satirAnahtari={(r) => r.id}
        satirSec={yaz ? (r) => ac(r) : undefined} bosMesaj="Kural yok; bütün kartlarda varsayılan sınırlar geçerli."
      />
    </section>
  );
}

function KapaliKartlar({ kurallar, yaz, ac }: { kurallar: readonly AlternatifKurali[]; yaz: boolean; ac: (k: AlternatifKurali) => void }) {
  const sutunlar: Sutun<AlternatifKurali>[] = [
    { anahtar: 'tur', baslik: 'Kapsam', hucre: (r) => KAPSAM_ADI[r.kapsamTuru] },
    { anahtar: 'kapsam', baslik: 'Uygulandığı yer', kes: true, hucre: kapsamMetni },
    { anahtar: 'gerekce', baslik: 'Gerekçe', kes: true, hucre: (r) => r.gerekce ?? '' },
    { anahtar: 'guncelleyen', baslik: 'Kapatan', hucre: (r) => r.guncelleyen ?? '' },
  ];
  return (
    <section className="tc-alt-bolum" aria-label="Kapalı kartlar">
      <p className="tc-alt-not">Alternatifi kapalı kartta yalnız aynı nitelikte malzeme kabul edilir (müşteri şartı, onaylı çizim gibi). Kapatmak için kartın kuralında “Alternatif kapalı” seçilir.</p>
      <Tablo
        etiket="Alternatifi kapalı kartlar" sutunlar={sutunlar} satirlar={kurallar} satirAnahtari={(r) => r.id}
        satirSec={yaz ? ac : undefined} bosMesaj="Alternatifi kapalı kart yok."
      />
    </section>
  );
}

type MuadilSatiri = { t: MuadilTablosu; deger: string; muadil: string; tur: MuadilTuru; notu: string | null; surum: number };

function Muadiller({ kalite, durum, yaz }: { kalite: readonly KaliteMuadili[]; durum: readonly DurumMuadili[]; yaz: boolean }) {
  const [acik, acikYaz] = useState<MuadilAcilisi | null>(null);
  const [silinecek, silinecekYaz] = useState<MuadilSatiri | null>(null);
  const kaldir = useMuadilKaldir();
  const { bildir } = useBildirim();
  const satirlar = (t: MuadilTablosu): MuadilSatiri[] => (t === 'kalite'
    ? kalite.map((m) => ({ t, deger: m.kalite, muadil: m.muadil, tur: m.tur, notu: m.notu, surum: m.surum }))
    : durum.map((m) => ({ t, deger: m.durum, muadil: m.muadil, tur: m.tur, notu: m.notu, surum: m.surum })));
  const sutunlar = (ad: string): Sutun<MuadilSatiri>[] => [
    { anahtar: 'deger', baslik: ad, mono: true, hucre: (m) => m.deger },
    { anahtar: 'muadil', baslik: 'Yerine kullanılabilir', mono: true, hucre: (m) => m.muadil },
    { anahtar: 'tur', baslik: 'Tür', hucre: (m) => <Rozet ton={MUADIL_TONU[m.tur]}>{MUADIL_ADI[m.tur]}</Rozet> },
    { anahtar: 'notu', baslik: 'Not', kes: true, hucre: (m) => m.notu ?? '' },
    ...(yaz ? [{
      anahtar: 'sil', baslik: '', hizala: 'sag' as const,
      hucre: (m: MuadilSatiri) => <Dugme simge="trash" aria-label={`${m.deger} ${m.muadil} muadilini kaldır`} onClick={(e) => { e.stopPropagation(); silinecekYaz(m); }} />,
    }] : []),
  ];
  const sil = () => {
    if (!silinecek) return;
    kaldir.mutate(silinecek, {
      onSuccess: () => { bildir('tamam', `${silinecek.deger} → ${silinecek.muadil} kaldırıldı`); silinecekYaz(null); },
      onError: (e) => bildir('hata', hataIletisi(e, 'Kaldırılamadı')),
    });
  };
  const tablo = (t: MuadilTablosu, baslik: string, ad: string) => (
    <section className="tc-alt-bolum" aria-label={baslik}>
      <header className="tc-alt-baslik">
        <h4 className="tc-alt-alt-baslik">{baslik}</h4>
        {yaz && <Dugme simge="plus" onClick={() => acikYaz({ t, kayit: null })}>Muadil ekle</Dugme>}
      </header>
      <Tablo
        etiket={baslik} sutunlar={sutunlar(ad)} satirlar={satirlar(t)} satirAnahtari={(m) => `${m.deger}|${m.muadil}`}
        satirSec={yaz ? (m) => acikYaz({ t, kayit: m }) : undefined} bosMesaj="Muadil tanımlı değil."
      />
    </section>
  );
  return (
    <div className="tc-alt-muadiller">
      <p className="tc-alt-not">Tam muadil doğrudan kullanılır; üst muadil genelde sorunsuzdur ama çoğu zaman pahalıdır; şartlı muadil uygulamaya bağlıdır, yalnız kuralda açılırsa ve açıkça onaylanarak kullanılır. Muadil tek yönlüdür: karşılıklı kullanılacaksa iki satır girin (6082 → 6061 ve 6061 → 6082).</p>
      {tablo('kalite', 'Kalite muadilleri', 'Kalite')}
      {tablo('durum', 'Durum muadilleri', 'Durum')}
      {acik !== null && <MuadilPenceresi acilis={acik} kapat={() => acikYaz(null)} />}
      <OnayPenceresi
        acik={silinecek !== null} baslik="Muadili kaldır" onayMetni="Kaldır" tehlikeli yukleniyor={kaldir.isPending}
        onayla={sil} vazgec={() => silinecekYaz(null)}
      >
        {silinecek && <p>{silinecek.deger} yerine {silinecek.muadil} artık önerilmez. Bu muadile dayanan zarflar daralır.</p>}
      </OnayPenceresi>
    </div>
  );
}
