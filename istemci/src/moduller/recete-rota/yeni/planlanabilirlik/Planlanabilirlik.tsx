import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import type { PlanlanabilirlikCevabi, RotaPlanlanabilirlikCevabi } from '#paylasilan/sozlesme/plan.ts';
import type { PlanlanamamaNedeni } from '#paylasilan/sozlesme/planlanamama-sabitleri.ts';
import { Dugme, DurumKutusu, Rozet, Sekmeler, Simge, Tablo, type Sutun } from '../../../../ortak/arayuz/index.ts';
import { api } from '../../../../ortak/veri/api.ts';
import { useYetki } from '../../../../ortak/veri/yetki.ts';
import { sayi, tarih, zaman } from '../bicim.ts';
import type { EkranOzellikleri } from '../sekmeler.ts';
import {
  adimSatirlari, DURUM_GOSTERIMI, eksikAdimlar, emirNedenleri, gecis, KONTROL_ADLARI, NEDEN_ADLARI, ozet, suzgeceUyar, zincirMetni,
  type Adim, type Emir, type Kontrol,
} from './kurallar.ts';

// 2779 (2781): neden planlanamıyor? Emir sekmesi planlanamayan açık emirleri ve kök nedenlerin özetini, Ürün ve rotalar sekmesi emir
// yokken rotanın kendi eksiklerini gösterir. Kontrolleri plan sunucusu ölçer; ekran yalnız okur, her eksikten düzeltme yerine geçer.

type Gorunum = 'emir' | 'rota';
type Urun = RotaPlanlanabilirlikCevabi['urunler'][number];
type Git = EkranOzellikleri['git'];

export const EMIR_YOLU = '/plan/planlanabilirlik';
export const ROTA_YOLU = '/plan/planlanabilirlik/rotalar';

export function Planlanabilirlik({ git, kimlik }: EkranOzellikleri) {
  const [gorunum, gorunumYaz] = useState<Gorunum>('emir');
  return (
    <div className="tc-rry-bolum tc-rrp" data-parca="R3">
      <p className="tc-rrp-ipucu"><Simge ad="help" boyut="k" />Planlanamayan adımın her kontrolü ayrı satırdır; kırmızı satırdan düzeltileceği sayfaya geçin.</p>
      <Sekmeler<Gorunum> etiket="Planlanabilirlik görünümü" secili={gorunum} sec={gorunumYaz}
        sekmeler={[{ anahtar: 'emir', baslik: 'Üretim emirleri', simge: 'list' }, { anahtar: 'rota', baslik: 'Ürün ve rotalar', simge: 'layers' }]} />
      {gorunum === 'emir' ? <EmirGorunumu git={git} kimlik={kimlik} /> : <RotaGorunumu git={git} />}
    </div>
  );
}

function EmirGorunumu({ git, kimlik }: { git: Git; kimlik: string | null }) {
  const q = useQuery({ queryKey: ['plan', 'planlanabilirlik'], queryFn: () => api.get<PlanlanabilirlikCevabi>(EMIR_YOLU) });
  const [suzgec, suzgecYaz] = useState<PlanlanamamaNedeni | null>(null);
  const [acik, acikYaz] = useState<number | null>(() => (kimlik !== null && Number.isFinite(Number(kimlik)) ? Number(kimlik) : null));
  if (q.isPending) return <DurumKutusu durum="yukleniyor" />;
  if (q.isError) return <DurumKutusu durum="hata" mesaj="Planlanabilirlik alınamadı" hata={q.error} yenile={() => { void q.refetch(); }} />;
  const c = q.data;
  const satirlar = c.emirler.filter((e) => suzgeceUyar(e, suzgec));
  const secili = acik === null ? null : c.emirler.find((e) => e.uretimEmriId === acik) ?? null;
  const sutunlar: Sutun<Emir>[] = [
    { anahtar: 'no', baslik: 'Emir', mono: true, kirilmaz: true, hucre: (e) => e.emirNo },
    { anahtar: 'urun', baslik: 'Ürün', hucre: (e) => <><b>{e.urunKodu}</b> {e.urunAdi}</> },
    { anahtar: 'adet', baslik: 'Adet', hizala: 'sag', hucre: (e) => sayi(e.adet) },
    { anahtar: 'termin', baslik: 'Termin', kirilmaz: true, hucre: (e) => tarih(e.termin) },
    {
      anahtar: 'neden', baslik: 'Düzeltilecek', csv: (e) => emirNedenleri(e).map((k) => NEDEN_ADLARI[k]).join('; '),
      hucre: (e) => {
        const l = emirNedenleri(e);
        return l.length === 0 ? <span className="tc-rrp-soluk">Ölçülemedi</span>
          : <span className="tc-rrp-cipler">{l.map((k) => <Rozet key={k} ton="hata" gorunum="cizgi">{NEDEN_ADLARI[k]}</Rozet>)}</span>;
      },
    },
  ];
  return (
    <div className="tc-rrp-govde">
      <p className="tc-rrp-soluk">
        {c.motorZamani === null ? 'Plan motoru henüz çalışmadı: ufuk ve önceki adım kontrolleri ölçülemez.' : `Son plan: ${zaman(c.motorZamani)}.`}
        {' '}{`${sayi(c.acikEmir)} açık emirden ${sayi(c.emirler.length)} emir planlanamıyor.`}
      </p>
      <Ozet emirler={c.emirler} secili={suzgec} sec={suzgecYaz} />
      <Tablo<Emir>
        etiket="Planlanamayan emirler"
        sutunlar={sutunlar}
        satirlar={satirlar}
        satirAnahtari={(e) => e.uretimEmriId}
        satirSec={(e) => { acikYaz(e.uretimEmriId === acik ? null : e.uretimEmriId); }}
        bosMesaj={c.emirler.length === 0 ? 'Planlanamayan açık emir yok.' : 'Bu nedende emir yok.'}
        arac={{ csv: { ad: 'planlanamayan-emirler' } }}
      />
      {secili !== null && (
        <section className="tc-rrp-panel" aria-label={`${secili.emirNo} adımları`}>
          <h3 className="tc-rrp-baslik">
            <span>{secili.emirNo} <small className="tc-rrp-soluk">{secili.urunKodu} {secili.urunAdi}</small></span>
            <Dugme simge="x" onClick={() => { acikYaz(null); }} aria-label="Kapat" />
          </h3>
          <Adimlar adimlar={secili.adimlar} emirNo={secili.emirNo} urunId={secili.urunId} git={git} />
        </section>
      )}
    </div>
  );
}

// Üst özet: neden türü başına emir sayısı; seçilen tür listeyi süzer, yeniden seçmek süzgeci kaldırır.
function Ozet({ emirler, secili, sec }: { emirler: readonly Emir[]; secili: PlanlanamamaNedeni | null; sec: (k: PlanlanamamaNedeni | null) => void }) {
  const satirlar = ozet(emirler);
  if (satirlar.length === 0) return null;
  return (
    <div className="tc-rrp-ozet" role="group" aria-label="Neden türüne göre">
      {satirlar.map((s) => (
        <button key={s.kod} type="button" className="tc-rrp-ozet-kart" aria-pressed={secili === s.kod} onClick={() => { sec(secili === s.kod ? null : s.kod); }}>
          <b>{`${sayi(s.emir)} emir`}</b>
          <span>{NEDEN_ADLARI[s.kod]}</span>
          <small>{`${sayi(s.adim)} adım`}</small>
        </button>
      ))}
    </div>
  );
}

function RotaGorunumu({ git }: { git: Git }) {
  const q = useQuery({ queryKey: ['plan', 'planlanabilirlik', 'rotalar'], queryFn: () => api.get<RotaPlanlanabilirlikCevabi>(ROTA_YOLU) });
  const [hepsi, hepsiYaz] = useState(false);
  const [acik, acikYaz] = useState<number | null>(null);
  if (q.isPending) return <DurumKutusu durum="yukleniyor" />;
  if (q.isError) return <DurumKutusu durum="hata" mesaj="Rota kontrolleri alınamadı" hata={q.error} yenile={() => { void q.refetch(); }} />;
  const eksikli = q.data.urunler.filter((u) => eksikAdimlar(u.adimlar).length > 0);
  const satirlar = hepsi ? q.data.urunler : eksikli;
  const secili = acik === null ? null : q.data.urunler.find((u) => u.urunId === acik) ?? null;
  const sutunlar: Sutun<Urun>[] = [
    { anahtar: 'kod', baslik: 'Ürün', mono: true, kirilmaz: true, hucre: (u) => u.urunKodu },
    { anahtar: 'ad', baslik: 'Ad', hucre: (u) => u.urunAdi },
    { anahtar: 'adim', baslik: 'Eksikli adım', hizala: 'sag', hucre: (u) => `${sayi(eksikAdimlar(u.adimlar).length)} / ${sayi(u.adimlar.length)}` },
    { anahtar: 'emir', baslik: 'Açık emir', hizala: 'sag', hucre: (u) => sayi(u.acikEmir) },
  ];
  return (
    <div className="tc-rrp-govde">
      <p className="tc-rrp-soluk">
        Yürürlükteki rotalar emir olmadan denetlenir: süre, istasyon, makine, yetkin kişi ve vardiya. Malzeme, ufuk ve önceki adım emre bağlıdır, burada ölçülmez.
      </p>
      <Tablo<Urun>
        etiket="Ürün rotalarının kontrolü"
        sutunlar={sutunlar}
        satirlar={satirlar}
        satirAnahtari={(u) => u.urunId}
        satirSec={(u) => { acikYaz(u.urunId === acik ? null : u.urunId); }}
        bosMesaj={hepsi ? 'Yürürlükteki rota yok.' : 'Eksiği olan rota yok.'}
        arac={{
          sag: (
            <Dugme simge="list" aria-pressed={hepsi} onClick={() => { hepsiYaz(!hepsi); }}>
              {hepsi ? 'Yalnız eksikli' : `Tümü (${sayi(q.data.urunler.length)})`}
            </Dugme>
          ),
        }}
      />
      {secili !== null && (
        <section className="tc-rrp-panel" aria-label={`${secili.urunKodu} rotası`}>
          <h3 className="tc-rrp-baslik">
            <span>{secili.urunKodu} <small className="tc-rrp-soluk">{secili.urunAdi}</small></span>
            <Dugme simge="x" onClick={() => { acikYaz(null); }} aria-label="Kapat" />
          </h3>
          {secili.acikEmir > 0 && <p className="tc-rrp-soluk">{`Buradaki eksik bu ürünün ${sayi(secili.acikEmir)} açık emrini etkiler.`}</p>}
          <Adimlar adimlar={hepsi ? secili.adimlar : eksikAdimlar(secili.adimlar)} emirNo={null} urunId={secili.urunId} git={git} />
        </section>
      )}
    </div>
  );
}

function Adimlar({ adimlar, emirNo, urunId, git }: { adimlar: readonly Adim[]; emirNo: string | null; urunId: number; git: Git }) {
  return (
    <ol className="tc-rrp-adimlar">
      {adimSatirlari(adimlar, emirNo).map((s) => (s.tur === 'zincir'
        ? <li key={`z${s.oplar.join('-')}`} className="tc-rrp-zincir"><Simge ad="clock" boyut="k" />{zincirMetni(s)}</li>
        : (
          <li key={s.adim.opNo} className="tc-rrp-adim">
            <h4>{`OP ${String(s.adim.opNo)} ${s.adim.ad}`}{s.adim.istasyon !== null && <small className="tc-rrp-soluk"> · {s.adim.istasyon}</small>}</h4>
            <ul className="tc-rrp-kontroller">
              {s.adim.kontroller.map((k) => <KontrolSatiri key={k.kod} k={k} urunId={urunId} git={git} />)}
            </ul>
          </li>
        )))}
    </ol>
  );
}

function KontrolSatiri({ k, urunId, git }: { k: Kontrol; urunId: number; git: Git }) {
  const g = DURUM_GOSTERIMI[k.durum];
  return (
    <li className="tc-rrp-kontrol" data-durum={k.durum}>
      <span className="tc-rrp-durum" role="img" aria-label={g.ad} title={g.ad}><Simge ad={g.simge} boyut="k" /></span>
      <span className="tc-rrp-kontrol-metin">
        <b>{KONTROL_ADLARI[k.kod]}</b>
        {k.yaklasik === true && <Rozet ton="bilgi" gorunum="cizgi">yaklaşık</Rozet>}
        <span>{k.metin}</span>
      </span>
      {k.durum === 'eksik' && <Duzelt kod={k.kod} urunId={urunId} git={git} />}
    </li>
  );
}

// Geçiş yetkisi yoksa düğme yerine sayfanın adı yazılır: kullanıcı kime başvuracağını bilir.
function Duzelt({ kod, urunId, git }: { kod: PlanlanamamaNedeni; urunId: number; git: Git }) {
  const g = gecis(kod);
  const yetki = useYetki();
  const git2 = useNavigate();
  if (g === null) return null;
  if (g.tur === 'sekme') {
    return <Dugme simge="next" onClick={() => { if (g.urunlu) git(g.anahtar, String(urunId)); else git(g.anahtar); }}>{g.baslik}</Dugme>;
  }
  if (!yetki.var(g.islem)) return <span className="tc-rrp-soluk">{g.baslik}</span>;
  return <Dugme simge="next" onClick={() => { void git2(g.yol); }}>{g.baslik}</Dugme>;
}
