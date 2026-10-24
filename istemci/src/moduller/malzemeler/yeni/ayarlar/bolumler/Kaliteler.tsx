import { useState } from 'react';
import { Dugme, Girdi, OnayPenceresi, Secim, Tablo, type Sutun } from '../../../../../ortak/arayuz/index.ts';
import { gecerliAileSinif, type Duzen } from '../duzen.ts';
import type { Aile, Kalite } from '../kaynak.ts';
import {
  favoriDegistir, kaliteGizleDegistir, kaliteKaydet, kaliteKimligi, kaliteSil, kalitelerTopluGizle, type KaliteGirdisi,
} from '../islemler.ts';
import { BolumBasligi, BosHucre, EklendiIsareti, Kullan, Kutu, Sayac, Secici, SilDugmesi, YeniDugmesi } from '../parcalar.tsx';

const ESDEGERLER = ['W.Nr', 'AISI/SAE', 'UNS', 'JIS', 'Ticari adlar'] as const;
const kucuk = (s: string) => s.toLocaleLowerCase('tr');

export function aileSecenekleri(d: Duzen, tumu: boolean) {
  return Object.entries(d.t.FAMS).filter(([, f]) => tumu || !f.gizli).map(([k, f]) => ({ deger: k, baslik: f.ad, alt: f.gizli ? 'gizli' : undefined }));
}

function KaliteFormu({ d, aile, sinif, g }: { d: Duzen; aile: string; sinif: string; g: Kalite | null }) {
  const F = d.t.FAMS[aile] as Aile;
  const ozellikler = d.t.PROPS.filter((p) => !p.f || p.f.includes(aile));
  const [form, formYaz] = useState<KaliteGirdisi>(() => ({
    kod: g?.kod ?? '', ad: g?.ad ?? '', std: g?.std ?? '',
    stds: (g?.stds ?? []).filter((x) => x !== g?.std).join(', '),
    eq: { ...(g?.eq ?? {}) },
    p: Object.fromEntries(Object.entries(g?.p ?? {}).map(([k, x]) => [k, typeof x === 'number' ? String(x).replace('.', ',') : x])),
  }));
  const [esdegerAcik, esdegerAcikYaz] = useState(Boolean(g && Object.keys(g.eq ?? {}).length));
  const secimli = new Set(ozellikler.filter((p) => Array.isArray(p.sel)).map((p) => p.k));
  const kapat = () => d.sec({ yeni: null, kaliteDuz: null });
  const kaydet = () => {
    const s = kaliteKaydet(d.v, d.t, aile, sinif, form, g ? g.kod : null, secimli);
    if (!s.tamam) { d.bildir('hata', s.ileti); return; }
    if (s.yogunlukYok) d.bildir('bilgi', 'Uyarı: yoğunluk girilmedi; bu kalitede ağırlık hesaplanamaz.');
    kapat();
    d.degis(s.ayar, s.ileti);
  };
  return (
    <Kutu baslik={g ? `${g.kod} kalitesini düzenle` : `Yeni kalite: ${F.classes[sinif]?.ad ?? ''}`}>
      <div className="tc-ma-alanlar">
        <Girdi etiket="Kalite kodu" maxLength={16} placeholder="ör. S460MC" className="tc-ma-buyuk" disabled={Boolean(g)} value={form.kod} onChange={(e) => formYaz({ ...form, kod: e.target.value })} />
        <Girdi etiket="Kalite adı" maxLength={60} placeholder="boşsa kod kullanılır" value={form.ad} onChange={(e) => formYaz({ ...form, ad: e.target.value })} />
        <Girdi etiket="Ana standart" placeholder="ör. EN 10149-2" value={form.std} onChange={(e) => formYaz({ ...form, std: e.target.value })} />
        <Girdi etiket="Diğer standartlar" placeholder="virgülle ayır" value={form.stds} onChange={(e) => formYaz({ ...form, stds: e.target.value })} />
      </div>
      <details className="tc-ma-liste" open={esdegerAcik} onToggle={(e) => esdegerAcikYaz((e.currentTarget as HTMLDetailsElement).open)}>
        <summary><span className="tc-ma-liste-ad"><b>Eşdeğerler</b><small>isteğe bağlı</small></span></summary>
        <div className="tc-ma-alanlar">
          {ESDEGERLER.map((k) => (
            <Girdi key={k} etiket={k} value={form.eq[k] ?? ''} onChange={(e) => formYaz({ ...form, eq: { ...form.eq, [k]: e.target.value } })} />
          ))}
        </div>
      </details>
      <details className="tc-ma-liste" open>
        <summary><span className="tc-ma-liste-ad"><b>Teknik değerler</b><small>yoğunluk ağırlık hesabı için gerekli</small></span></summary>
        <div className="tc-ma-alanlar">
          {ozellikler.map((p) => {
            const etiket = `${p.ad}${p.k === 'ro' ? ' *' : ''}${p.u && p.u !== '*' ? ` (${p.u})` : ''}`;
            const deger = form.p[p.k] ?? '';
            const yaz = (x: string) => formYaz({ ...form, p: { ...form.p, [p.k]: x } });
            return Array.isArray(p.sel)
              ? <Secim key={p.k} etiket={etiket} bosSecenek="—" value={deger} onChange={(e) => yaz(e.target.value)} secenekler={p.sel.map((x) => ({ deger: x, baslik: x }))} />
              : <Girdi key={p.k} etiket={etiket} inputMode={p.sel ? undefined : 'decimal'} value={deger} onChange={(e) => yaz(e.target.value)} />;
          })}
        </div>
      </details>
      <div className="tc-ma-eylemler">
        <Dugme tur="birincil" simge="check" onClick={kaydet}>{g ? 'Değişiklikleri kaydet' : 'Kaliteyi ekle'}</Dugme>
        <Dugme onClick={kapat}>Vazgeç</Dugme>
      </div>
    </Kutu>
  );
}

export function Kaliteler({ d }: { d: Duzen }) {
  const [ara, araYaz] = useState('');
  const [silinecek, silinecekYaz] = useState<string | null>(null);
  const { aile, sinif } = gecerliAileSinif(d);
  const F = d.t.FAMS[aile] as Aile;
  const c = F.classes[sinif];
  const satiriAcik = !d.ro && (d.secim.yeni === 'kalite' || d.secim.kaliteDuz !== null);

  const secici = (
    <Secici<string>
      satirlar={[
        { anahtar: 'aile', baslik: 'Aile', secenekler: aileSecenekleri(d, true), secili: aile, sec: (k) => d.sec({ aile: k, sinif: '', kaliteDuz: null, yeni: d.secim.yeni === 'kalite' ? null : d.secim.yeni }) },
        {
          anahtar: 'sinif', baslik: 'Sınıf', bosMesaj: 'Bu ailede sınıf yok.', secili: sinif, sec: (k) => d.sec({ sinif: k, kaliteDuz: null }),
          secenekler: Object.entries(F.classes).map(([k, x]) => ({ deger: k, baslik: x.ad, alt: String(x.grades.length) })),
        },
      ]}
      ozet={c && <><b data-aile={aile}>{F.ad}</b> › <b>{c.ad}</b> · {c.grades.length} kalite</>}
    />
  );
  const baslik = (
    <BolumBasligi
      baslik="Kaliteler" aciklama="Kullanmadığın kaliteleri kapat; kalite listesinde ve aramada görünmezler. Kendi kalitelerini sınıfına ekle."
      eylem={c && !d.ro && <YeniDugmesi acik={d.secim.yeni === 'kalite'} etiket="Yeni kalite" degistir={() => d.sec({ yeni: d.secim.yeni === 'kalite' ? null : 'kalite', kaliteDuz: null })} />}
    />
  );
  if (!c) return <>{baslik}{secici}<p className="tc-ma-yardim">Bu ailede sınıf yok; önce "Aileler ve sınıflar"dan sınıf ekle.</p></>;

  const duzenlenen = d.secim.kaliteDuz ? c.grades.find((g) => g.kod === d.secim.kaliteDuz) ?? null : null;
  const gizliSayisi = c.grades.filter((g) => g.gizli).length;
  const q = kucuk(ara.trim());
  const satirlar = c.grades.filter((g) => !q || kucuk([g.kod, g.ad, g.std ?? '', ...Object.values(g.eq ?? {})].join(' ')).includes(q));
  const yerlesik = c.grades.filter((g) => !g.ozel).map((g) => g.kod);

  const sutunlar: Sutun<Kalite>[] = [
    {
      anahtar: 'kullan', baslik: 'Kullan', hucre: (g) => (g.ozel
        ? <Kullan ad={g.kod} acik kilitli />
        : <Kullan ad={g.kod} acik={!g.gizli} kilitli={d.ro} degistir={() => d.degis(kaliteGizleDegistir(d.v, kaliteKimligi(aile, sinif, g.kod)))} />),
    },
    {
      anahtar: 'sik', baslik: 'Sık', hucre: (g) => {
        const id = kaliteKimligi(aile, sinif, g.kod);
        const fav = d.v.favoriler.includes(id);
        return (
          <button
            type="button" className="tc-ma-yildiz" aria-pressed={fav} disabled={d.ro} title="Sık kullanılanlar"
            aria-label={`${g.kod}: sık kullanılanlara ${fav ? 'ekli' : 'ekle'}`} onClick={() => d.degis(favoriDegistir(d.v, id))}
          >★</button>
        );
      },
    },
    { anahtar: 'kod', baslik: 'Kod', mono: true, hucre: (g) => <b>{g.kod}</b> },
    { anahtar: 'ad', baslik: 'Kalite', hucre: (g) => <span className="tc-ma-ad">{g.ad}{g.ozel ? <EklendiIsareti /> : null}</span> },
    { anahtar: 'std', baslik: 'Standart', hucre: (g) => g.std ?? '' },
    { anahtar: 'esdeger', baslik: 'Eşdeğer', hucre: (g) => Object.values(g.eq ?? {}).slice(0, 2).join(', ') },
    {
      anahtar: 'islem', baslik: '', kirilmaz: true, hucre: (g) => (g.ozel && !d.ro ? (
        <span className="tc-ma-eylemler">
          <Dugme simge="edit" onClick={() => d.sec({ kaliteDuz: g.kod, yeni: null })}>Düzenle</Dugme>
          <SilDugmesi ad={g.kod} sil={() => silinecekYaz(g.kod)} />
        </span>
      ) : <BosHucre />),
    },
  ];

  return (
    <>
      {baslik}
      {secici}
      {satiriAcik && <KaliteFormu key={`${aile}|${sinif}|${d.secim.kaliteDuz ?? 'yeni'}`} d={d} aile={aile} sinif={sinif} g={duzenlenen} />}
      <div className="tc-ma-liste-arac">
        <Sayac kullanimda={c.grades.length - gizliSayisi} gizli={gizliSayisi} eklendi={c.grades.filter((g) => g.ozel).length} />
        {!d.ro && (
          <>
            <Dugme onClick={() => d.degis(kalitelerTopluGizle(d.v, aile, sinif, yerlesik, false))}>Tümünü kullan</Dugme>
            <Dugme onClick={() => d.degis(kalitelerTopluGizle(d.v, aile, sinif, yerlesik, true))}>Hiçbirini kullanma</Dugme>
          </>
        )}
      </div>
      <Tablo
        etiket={`${c.ad} kaliteleri`} sutunlar={sutunlar} satirlar={satirlar} satirAnahtari={(g) => g.kod}
        arac={c.grades.length > 8 ? { arama: { deger: ara, degistir: araYaz, etiket: 'Kalitelerde ara', yerTutucu: 'Kalitelerde ara: kod, ad, W.Nr' } } : undefined}
      />
      <OnayPenceresi
        acik={silinecek !== null} baslik={`${silinecek ?? ''} silinsin mi?`} tehlikeli onayMetni="Sil" vazgec={() => silinecekYaz(null)}
        onayla={() => {
          if (silinecek) {
            if (d.secim.kaliteDuz === silinecek) d.sec({ kaliteDuz: null });
            d.degis(kaliteSil(d.v, aile, sinif, silinecek));
          }
          silinecekYaz(null);
        }}
      />
    </>
  );
}
