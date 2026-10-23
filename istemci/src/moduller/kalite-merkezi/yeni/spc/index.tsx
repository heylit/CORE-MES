import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Dugme, OnayPenceresi, Rozet, SayfaBasligi, Tablo, useBildirim, type Sutun,
} from '../../../../ortak/arayuz/index.ts';
import { Belge, BelgeBasi, Imza } from '../Belge.tsx';
import { iki, rozetTonu, sayiMetni, trd, YOK } from '../bicim.ts';
import { bugun } from '../kurallar.ts';
import { useOnizleme } from '../Onizleme.tsx';
import type { EkranOzellikleri, KmSayaci } from '../sekmeler.ts';
import { oneriler, seriler, type Seri } from '../spc.ts';
import type { OlcumSerisi } from '../tipler.ts';
import { useKmKomutu, type KmVerisi } from '../veri.ts';
import { CizgiGrafigi, CubukGrafigi } from './Grafik.tsx';
import { dagilim, spcSayaci } from './hesap.ts';
import { SeriFormu } from './SeriFormu.tsx';
import './spc.css';

export const OlcumAnaliziSayaci: KmSayaci = (veri) => spcSayaci(seriler(veri));

const tolerans = (x: Seri) => `${sayiMetni(x.nom)} −${sayiMetni(x.nom - x.lo)} / +${sayiMetni(x.hi - x.nom)}`;
const donem = (s: Seri) => (s.noktalar.length ? `${trd(s.noktalar[0]!.t)} – ${trd(s.noktalar[s.noktalar.length - 1]!.t)}` : '');

function SpcBelgesi({ veri, s }: { veri: KmVerisi; s: Seri }) {
  return (
    <Belge>
      <BelgeBasi veri={veri} kod="KF-SPC" ad="Süreç yeterlilik özeti" />
      <table>
        <tbody>
          <tr><th>Parça no / adı</th><td>{`${s.pn} ${s.pa}`}</td><th>Karakteristik</th><td>{s.ad}</td></tr>
          <tr><th>Nominal / tolerans</th><td>{`${sayiMetni(s.nom)} (LSL ${sayiMetni(s.lo)}, USL ${sayiMetni(s.hi)})`}</td><th>Ölçüm sayısı</th><td>{s.n}</td></tr>
          <tr><th>Dönem</th><td>{donem(s)}</td><th>Hazırlanma</th><td>{trd(bugun())}</td></tr>
        </tbody>
      </table>
      <table>
        <thead><tr><th>Ortalama</th><th>σ kısa</th><th>σ toplam</th><th>Cp</th><th>Cpk</th><th>Pp</th><th>Ppk</th><th>Tolerans dışı</th><th>Kontrol altında</th></tr></thead>
        <tbody>
          <tr>
            <td>{sayiMetni(s.ort)}</td><td>{sayiMetni(s.sw)}</td><td>{sayiMetni(s.ss)}</td><td>{iki(s.cp)}</td><td><b>{iki(s.cpk)}</b></td>
            <td>{iki(s.pp)}</td><td>{iki(s.ppk)}</td><td>{s.tolDisi}</td><td>{s.kontrolde ? 'Evet' : 'Hayır'}</td>
          </tr>
        </tbody>
      </table>
      <h3>{`Sonuç: ${s.durum.metin}`}</h3>
      <ul>{oneriler(s).map((t) => <li key={t}>{t}</li>)}</ul>
      <h3>Ölçümler</h3>
      <p className="small">{s.noktalar.map((p) => sayiMetni(p.v)).join('; ')}</p>
      <Imza />
    </Belge>
  );
}

function Ayrinti({ veri, s, yaz, silebilir, olcumEkle, sil }: {
  veri: KmVerisi; s: Seri; yaz: boolean; silebilir: boolean; olcumEkle: () => void; sil: (r: OlcumSerisi) => void;
}) {
  const onizle = useOnizleme();
  const x = s.noktalar.map((p) => p.v);
  const etiket = x.map((_, i) => String(i + 1));
  const kotu = new Set([...s.r1, ...s.r2]);
  const sabit = (v: number | undefined) => x.map(() => v ?? null);
  const kutular = dagilim(s);
  const elle = s.kimlikler.map((id) => veri.spc.find((r) => r._id === id)).filter((r): r is OlcumSerisi => !!r);
  const elleSutun: Sutun<OlcumSerisi>[] = [
    { anahtar: 'no', baslik: 'Seri', hucre: (r) => r.no ?? '', mono: true },
    { anahtar: 'tarih', baslik: 'Tarih', hucre: (r) => trd(r.tarih), kirilmaz: true },
    { anahtar: 'deger', baslik: 'Değer', hucre: (r) => (r.degerler ?? []).length, hizala: 'sag' },
    { anahtar: 'olcen', baslik: 'Ölçen', hucre: (r) => r.olcen ?? '' },
    ...(silebilir ? [{ anahtar: 'sil', baslik: '', hucre: (r: OlcumSerisi) => <Dugme tur="tehlike" simge="trash" onClick={() => { sil(r); }}>Sil</Dugme> }] : []),
  ];
  const ozet: [string, string, string?][] = [
    [sayiMetni(s.ort), 'Ortalama'],
    [sayiMetni(s.sw), 'σ (kısa dönem)'],
    [iki(s.cp), 'Cp'],
    [iki(s.cpk), 'Cpk', rozetTonu(s.durum.ton)],
    [iki(s.ppk), 'Ppk (uzun dönem)'],
    [String(s.tolDisi ?? 0), 'Tolerans dışı', s.tolDisi ? 'hata' : undefined],
    [s.n < 2 ? YOK : s.kontrolde ? 'Evet' : 'Hayır', 'Kontrol altında'],
  ];
  return (
    <section className="tc-km2-panel" id="tc-km2-spc-ayrinti" aria-label={`${s.pn}: ${s.ad}`}>
      <SayfaBasligi
        baslik={`${s.pn}: ${s.ad}`} simge="chart"
        alt={`Tolerans ${tolerans(s)} | ${s.n} ölçüm | ${donem(s)}`}
        eylemler={[
          ...(yaz ? [{ anahtar: 'ekle', baslik: 'Bu karakteristiğe ölçüm ekle', simge: 'plus' as const, sec: olcumEkle }] : []),
          { anahtar: 'rapor', baslik: 'Rapor', simge: 'printer' as const, sec: () => { onizle(`SPC ${s.pn} ${s.ad}`, `SPC_${s.pn}`, <SpcBelgesi veri={veri} s={s} />); } },
        ]}
      />
      <dl className="tc-km2-ozet">
        {ozet.map(([d, t, ton]) => <div key={t} data-ton={ton}><dd>{d}</dd><dt>{t}</dt></div>)}
      </dl>
      <div className="tc-km2-iki-sutun">
        <div>
          <h3 className="tc-km2-bolum">Bireysel değerler (I) grafiği</h3>
          <CizgiGrafigi
            etiket="Bireysel değerler grafiği" xEtiketleri={etiket} yBicim={sayiMetni} boy="uzun"
            ipucu={(i) => `#${i + 1} ${trd(s.noktalar[i]?.t)} ${s.noktalar[i]?.kaynak ?? ''}`}
            seriler={[
              { ad: 'Ölçüm', degerler: x, renk: 'grafik', nokta: true, noktaRengi: (i) => (x[i]! < s.lo || x[i]! > s.hi || kotu.has(i) ? 'hata' : 'grafik') },
              { ad: 'Ortalama', degerler: sabit(s.ort), renk: 'tamam' },
              { ad: 'Kontrol sınırları (UCL / LCL)', degerler: sabit(s.ucl), renk: 'uyari', kesik: true },
              { ad: '_lcl', degerler: sabit(s.lcl), renk: 'uyari', kesik: true, gostergedeYok: true },
              { ad: 'Tolerans (LSL / USL)', degerler: sabit(s.hi), renk: 'hata' },
              { ad: '_lsl', degerler: sabit(s.lo), renk: 'hata', gostergedeYok: true },
            ]}
          />
        </div>
        <div>
          <h3 className="tc-km2-bolum">Dağılım ve tolerans</h3>
          <CubukGrafigi
            etiket="Dağılım ve tolerans" boy="uzun"
            xBaslik={`LSL ${sayiMetni(s.lo)}   nominal ${sayiMetni(s.nom)}   USL ${sayiMetni(s.hi)}`}
            kategoriler={kutular.map((b) => sayiMetni((b.a + b.b) / 2))}
            seriler={[{ ad: 'Adet', degerler: kutular.map((b) => b.adet), renk: (i) => (kutular[i]?.disarida ? 'hata' : 'tamam') }]}
          />
        </div>
      </div>
      <h3 className="tc-km2-bolum">Hareketli aralık (MR) grafiği</h3>
      <CizgiGrafigi
        etiket="Hareketli aralık grafiği" xEtiketleri={etiket.slice(1)} yBicim={sayiMetni} boy="kisa" yMin={0} gostergeli={false}
        yMax={Math.max(s.mrUcl ?? 0, ...(s.mr ?? [0])) * 1.08 || 1}
        seriler={[
          { ad: 'MR', degerler: s.mr ?? [], renk: 'grafik', nokta: true },
          { ad: 'MR̄', degerler: (s.mr ?? []).map(() => s.mrOrt ?? null), renk: 'tamam' },
          { ad: 'UCL', degerler: (s.mr ?? []).map(() => s.mrUcl ?? null), renk: 'uyari', kesik: true },
        ]}
      />
      <h3 className="tc-km2-bolum">Değerlendirme</h3>
      <ul className="tc-km2-oneriler">{oneriler(s).map((t) => <li key={t}>{t}</li>)}</ul>
      {elle.length > 0 && (
        <>
          <h3 className="tc-km2-bolum">Elle girilen seriler</h3>
          <Tablo etiket="Elle girilen seriler" satirlar={elle} sutunlar={elleSutun} satirAnahtari={(r) => r._id} />
        </>
      )}
      <p className="tc-km2-kucuk">
        Kontrol sınırları hareketli aralıktan (σ = MR̄ / 1,128) hesaplanır. Kural 1: 3σ dışındaki nokta; kural 2: ortalamanın aynı tarafında 8 ardışık nokta.
        Cp/Cpk kısa dönem, Pp/Ppk toplam standart sapmayla hesaplanır.
      </p>
    </section>
  );
}

export function OlcumAnalizi({ veri, yetki, gecis, gecisTamam }: EkranOzellikleri) {
  const komut = useKmKomutu(yetki.rol);
  const { bildir } = useBildirim();
  const L = useMemo(() => seriler(veri), [veri]);
  const [sec, secYaz] = useState('');
  const [form, formYaz] = useState<{ on?: Record<string, unknown> } | null>(null);
  const [silinecek, silinecekYaz] = useState<OlcumSerisi | null>(null);
  const ayrinti = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!gecis) return;
    gecisTamam();
    if (gecis.ac === 'yeni') { if (yetki.yaz) formYaz({ on: gecis.on }); } else if (gecis.ac) secYaz(gecis.ac);
  }, [gecis, yetki.yaz]);

  const s = L.find((x) => x.k === sec) ?? L[0];
  const sutunlar: Sutun<Seri>[] = [
    { anahtar: 'ad', baslik: 'Karakteristik', hucre: (x) => <b>{x.ad}</b> },
    { anahtar: 'pn', baslik: 'Parça', hucre: (x) => <>{x.pn}<span className="tc-km2-iki">{x.pa}</span></> },
    { anahtar: 'tol', baslik: 'Tolerans', hucre: tolerans },
    { anahtar: 'n', baslik: 'n', hucre: (x) => x.n, hizala: 'sag' },
    { anahtar: 'ort', baslik: 'Ortalama', hucre: (x) => sayiMetni(x.ort), hizala: 'sag', mono: true },
    { anahtar: 'cpk', baslik: 'Cpk', hucre: (x) => <b>{iki(x.cpk)}</b>, hizala: 'sag', mono: true },
    { anahtar: 'kontrol', baslik: 'Kontrol', hucre: (x) => (x.n < 2 ? YOK : x.kontrolde ? <Rozet ton="tamam">Kontrol altında</Rozet> : <Rozet ton="hata">Kontrol dışı</Rozet>) },
    { anahtar: 'yetenek', baslik: 'Yetenek', hucre: (x) => <Rozet ton={rozetTonu(x.durum.ton)}>{x.durum.metin}</Rozet> },
  ];

  return (
    <div className="tc-km2-spc">
      <SayfaBasligi
        baslik="Ölçüm analizi (SPC)" simge="chart"
        alt="Muayene kayıtlarındaki ve elle girilen ölçümlerden kontrol grafiği ve süreç yeteneği (Cp, Cpk). Cpk 1,33 ve üzeri yetenekli kabul edilir."
        birincil={yetki.yaz ? { etiket: 'Ölçüm serisi ekle', simge: 'plus', yap: () => { formYaz({}); } } : undefined}
      />
      <Tablo
        etiket="Ölçüm serileri" satirlar={L} sutunlar={sutunlar} satirAnahtari={(x) => x.k}
        satirSec={(x) => { secYaz(x.k); ayrinti.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' }); }}
        bosMesaj="Henüz ölçüm verisi yok. Muayenelerde girilen değişken ölçümler burada otomatik toplanır. Seri ölçümleri (CMM raporu, proses kontrol) doğrudan da ekleyebilirsiniz."
      />
      <div ref={ayrinti}>
        {s && (
          <Ayrinti
            veri={veri} s={s} yaz={yetki.yaz} silebilir={yetki.silebilir('spc')}
            olcumEkle={() => { formYaz({ on: { parcaNo: s.pn, parcaAdi: s.pa, ad: s.ad, nominal: sayiMetni(s.nom).replace(/\./g, ''), alt: sayiMetni(s.nom - s.lo), ust: sayiMetni(s.hi - s.nom) } }); }}
            sil={silinecekYaz}
          />
        )}
      </div>
      {form && <SeriFormu veri={veri} yetki={yetki} on={form.on} kapat={() => { formYaz(null); }} kaydedildi={secYaz} />}
      <OnayPenceresi
        acik={silinecek !== null} baslik="Kaydı sil" onayMetni="Sil" tehlikeli
        onayla={() => {
          const r = silinecek; silinecekYaz(null);
          if (r) void komut.sil('spc', r._id).then(() => { bildir('tamam', 'Kayıt silindi'); }, () => { bildir('hata', 'Kayıt silinemedi.'); });
        }}
        vazgec={() => { silinecekYaz(null); }}
      >
        {silinecek && <p><b>{silinecek.no}</b> kalıcı olarak silinecek.</p>}
      </OnayPenceresi>
    </div>
  );
}
