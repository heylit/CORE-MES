import { useEffect } from 'react';
import { useBildirim } from '../../../../ortak/arayuz/index.ts';
import { AdimliForm, type FormVerisi, type KmAlan } from '../AdimliForm.tsx';
import { iki, sayiMetni } from '../bicim.ts';
import { bugun, devDurumu } from '../kurallar.ts';
import { degerleriAyir, istatistik, sayiOku, seriAnahtari, seriler } from '../spc.ts';
import type { OlcumSerisi } from '../tipler.ts';
import { siradakiNo, useKmKomutu, type KmVerisi } from '../veri.ts';
import type { KmYetkisi } from '../yetki.ts';

// Kayıt tipinin adlandırılmış alanları (serbest alan imzası olmadan): değerler formda tek metindir.
type Bilinen<T> = { [K in keyof T as string extends K ? never : K]: T[K] };
type SeriDegeri = Partial<Omit<Bilinen<OlcumSerisi>, '_id' | 'degerler'>> & { degerler?: string };
const seri = (d: FormVerisi): SeriDegeri => d as SeriDegeri;
type Degistir = (alan: string, deger: unknown) => void;

function alanlar(veri: KmVerisi): KmAlan[] {
  return [
    { k: 'no', etiket: 'Seri no', zorunlu: true },
    { k: 'tarih', etiket: 'Ölçüm tarihi', tur: 'tarih', zorunlu: true },
    { k: 'parcaNo', etiket: 'Parça no', zorunlu: true, liste: 'parca' },
    { k: 'parcaAdi', etiket: 'Parça adı' },
    { k: 'ad', etiket: 'Karakteristik', zorunlu: true, genis: 'tam', ipucu: 'ör. Ø12 H7 delik' },
    { k: 'nominal', etiket: 'Nominal', zorunlu: true, ipucu: '12' },
    { k: 'alt', etiket: 'Alt tolerans (−)', ipucu: '0' },
    { k: 'ust', etiket: 'Üst tolerans (+)', ipucu: '0,018' },
    {
      k: 'cihaz', etiket: 'Ölçüm cihazı', tur: 'secim', genis: 'tam',
      secenekler: [['', '—'] as const, ...veri.dev.filter((d) => devDurumu(d).kullanilir).map((d) => [d._id, `${d.kod ?? ''} ${d.ad ?? ''}`.trim()] as const)],
    },
    { k: 'olcen', etiket: 'Ölçen', liste: 'kisi' },
    {
      k: 'degerler', etiket: 'Ölçülen değerler', tur: 'cokSatir', zorunlu: true, genis: 'tam',
      ipucu: "Değerleri boşluk, satır başı veya noktalı virgülle ayırın; ondalık için virgül ya da nokta kullanabilirsiniz. CMM veya Excel'den doğrudan yapıştırabilirsiniz.",
    },
  ];
}

// Ölçülen değerlerin anlık özeti; bilinen bir karakteristik yazılınca nominal ve tolerans boşsa önceki seriden dolar.
function Onizleme({ veri, d, degistir }: { veri: KmVerisi; d: SeriDegeri; degistir: Degistir }) {
  const anahtar = seriAnahtari(d.parcaNo, d.ad);
  useEffect(() => {
    if (d.nominal) return;
    const s = seriler(veri).find((x) => x.k === anahtar);
    if (!s) return;
    degistir('nominal', sayiMetni(s.nom).replace(/\./g, ''));
    degistir('alt', sayiMetni(s.nom - s.lo));
    degistir('ust', sayiMetni(s.hi - s.nom));
    if (!d.parcaAdi) degistir('parcaAdi', s.pa);
  // Yalnız parça ya da karakteristik değişince bakılır.
  }, [anahtar]);
  const v = degerleriAyir(d.degerler);
  if (!v.length) return null;
  const nom = sayiOku(d.nominal);
  const lo = nom == null ? null : nom - Math.abs(sayiOku(d.alt) ?? 0);
  const hi = nom == null ? null : nom + Math.abs(sayiOku(d.ust) ?? 0);
  const ort = v.reduce((a, b) => a + b, 0) / v.length;
  const disari = lo == null || hi == null ? 0 : v.filter((x) => x < lo - 1e-12 || x > hi + 1e-12).length;
  let cp = '';
  if (lo != null && hi != null && hi > lo && v.length > 1) {
    const st = istatistik({ noktalar: v.map((x) => ({ v: x })), lo, hi });
    cp = `, Cp ${iki(st.cp)}, Cpk ${iki(st.cpk)}`;
  }
  return (
    <p className={`tc-km2-not ${disari ? 'tc-km2-not-hata' : 'tc-km2-not-tamam'}`} role="status">
      <b>{`${v.length} değer okundu.`}</b>
      {` Ortalama ${sayiMetni(ort)}, en küçük ${sayiMetni(Math.min(...v))}, en büyük ${sayiMetni(Math.max(...v))}${cp}`}
      {disari > 0 && <b>{`, ${disari} tolerans dışı`}</b>}.
    </p>
  );
}

export function SeriFormu({ veri, yetki, on, kapat, kaydedildi }: {
  veri: KmVerisi; yetki: KmYetkisi; on?: Partial<SeriDegeri>; kapat: () => void; kaydedildi: (anahtar: string) => void;
}) {
  const komut = useKmKomutu(yetki.rol);
  const { bildir } = useBildirim();
  const A = alanlar(veri);
  return (
    <AdimliForm
      baslik="Ölçüm serisi ekle"
      alanlar={A}
      ilk={{ no: siradakiNo(veri.spc, 'SER'), tarih: bugun(), ...on }}
      adimlar={[{ baslik: 'Ölçüm serisi', alanlar: A.map((a) => a.k), icerik: (d, degistir) => <Onizleme veri={veri} d={seri(d)} degistir={degistir} /> }]}
      denetle={(h) => {
        const d = seri(h);
        return [
        ...(d.degerler && degerleriAyir(d.degerler).length < 2 ? [{ metin: 'En az 2 sayısal değer girin.', adim: 0, alan: 'degerler' }] : []),
        ...(d.nominal && sayiOku(d.nominal) == null ? [{ metin: 'Nominal değer sayı olmalı.', adim: 0, alan: 'nominal' }] : []),
        ];
      }}
      kaydet={async (h) => {
        const d = seri(h);
        const degerler = degerleriAyir(d.degerler);
        if (degerler.length < 2) { bildir('hata', 'En az 2 sayısal değer girin.'); return; }
        if (sayiOku(d.nominal) == null) { bildir('hata', 'Nominal değer sayı olmalı.'); return; }
        await komut.kaydet('spc', { ...d, degerler });
        bildir('tamam', `${degerler.length} ölçüm kaydedildi`);
        kapat();
        kaydedildi(seriAnahtari(d.parcaNo, d.ad));
      }}
      kapat={kapat}
    />
  );
}
