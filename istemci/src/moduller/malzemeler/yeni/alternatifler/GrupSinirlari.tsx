import { useState } from 'react';
import type { GrupSinirlariCevabi, KabulSiniri, KapsamTuru, MuadilTuru, SinirDegeri, SinirNiteligi } from '#paylasilan/sozlesme/malzeme-alternatifleri.ts';
import { Dugme, DurumKutusu, Girdi, OnayPenceresi, Pencere, Rozet, Secim, Tablo, useBildirim, type Secenek, type Sutun } from '../../../../ortak/arayuz/index.ts';
import { hataIletisi } from '../../../../ortak/veri/api.ts';
import { useGrupSinirlari, useSinirKaldir, useSinirKaydet } from './veri.ts';

// 3463-1b: grup şablonu. Aile, sınıf ya da kalitenin kabul sınırı o kapsamdaki bütün kartlara geçer; kart yalnız farkını kendi bölümünde
// yazar. Dar kapsam geniş olanı ezer (kart < kalite < sınıf < aile). Ekran yalnız gösterir ve yazanda düzenler; denetim sunucudadır.
type GrupKapsami = Exclude<KapsamTuru, 'kart'>;
const KAPSAMLAR: readonly Secenek[] = [{ deger: 'aile', baslik: 'Aile' }, { deger: 'sinif', baslik: 'Sınıf' }, { deger: 'kalite', baslik: 'Kalite' }];
const KAPSAM_ADI: Record<GrupKapsami, string> = { aile: 'Aile', sinif: 'Sınıf', kalite: 'Kalite' };
type KapsamSecenegi = GrupSinirlariCevabi['kapsamlar'][number];
// Sözleşmedeki SINIR_NITELIKLERI ile aynı sıra (istemci paylaşılandan yalnız tip alır).
const LISTE_NITELIKLERI: readonly SinirNiteligi[] = ['kalite', 'durum', 'yuzey'];
const SINIR_NITELIKLERI: readonly SinirNiteligi[] = [...LISTE_NITELIKLERI, 'd', 's', 'a', 'b', 't', 'D', 'h', 'l'];
// Harf formdan forma değişir (OLCU_ETIKETLERI); grup sınırı birden çok forma geçebildiği için ad genel tutulur, harf yanında kalır.
const NITELIK_ADI: Record<string, string> = {
  kalite: 'Kalite', durum: 'Durum', yuzey: 'Yüzey', d: 'Çap (d, mm)', s: 'Anahtar ağzı (s, mm)', a: 'Genişlik ya da kol (a, mm)',
  b: 'Kalınlık ya da yükseklik (b, mm)', t: 'Kalınlık ya da et (t, mm)', D: 'Dış çap (D, mm)', h: 'Yükseklik (h, mm)', l: 'Boy (l, mm)',
};
export const nitelikAdi = (n: string): string => NITELIK_ADI[n] ?? `${n} (mm)`;
const NITELIKLER: readonly Secenek[] = SINIR_NITELIKLERI.map((n) => ({ deger: n, baslik: nitelikAdi(n) }));
const TUR_ACIK: Record<MuadilTuru, string> = { tam: 'tam muadil', ust: 'üst muadil', sartli: 'şartlı muadil' };
const TURLER: readonly Secenek[] = (['tam', 'ust', 'sartli'] as const).map((t) => ({ deger: t, baslik: TUR_ACIK[t] }));
const listeMi = (n: SinirNiteligi): boolean => LISTE_NITELIKLERI.includes(n);
const sayi = (v: number) => v.toLocaleString('tr-TR', { maximumFractionDigits: 3 });
const kartSayisi = (kapsamlar: readonly KapsamSecenegi[], turu: string, kapsam: string): number =>
  kapsamlar.find((k) => k.kapsamTuru === turu && k.kapsam === kapsam)?.kart ?? 0;

export function sinirMetni(s: Pick<KabulSiniri, 'degerler' | 'alt' | 'ust'>): string {
  if (s.degerler !== null) return s.degerler.map((d) => `${d.deger} (${TUR_ACIK[d.tur]})`).join(', ');
  return `${s.alt === null ? '…' : sayi(s.alt)} – ${s.ust === null ? '…' : sayi(s.ust)} mm`;
}

export function GrupSinirlari({ yaz }: { yaz: boolean }) {
  const sinirlar = useGrupSinirlari();
  const [acik, acikYaz] = useState<KabulSiniri | 'yeni' | null>(null);
  if (sinirlar.isPending) return <DurumKutusu durum="yukleniyor" />;
  if (sinirlar.isError) return <DurumKutusu durum="hata" yenile={() => { void sinirlar.refetch(); }} />;
  const sutunlar: Sutun<KabulSiniri>[] = [
    { anahtar: 'tur', baslik: 'Kapsam', hucre: (s) => <Rozet ton="pasif" gorunum="cizgi">{KAPSAM_ADI[s.kapsamTuru as GrupKapsami]}</Rozet> },
    { anahtar: 'kapsam', baslik: 'Uygulandığı yer', mono: true, hucre: (s) => s.kapsam },
    { anahtar: 'nitelik', baslik: 'Nitelik', hucre: (s) => nitelikAdi(s.nitelik) },
    { anahtar: 'sinir', baslik: 'Kabul sınırı', kes: true, hucre: sinirMetni },
  ];
  return (
    <section className="tc-alt-bolum" aria-label="Grup sınırları">
      <p className="tc-alt-not">
        Aile, sınıf ya da kalite için seçilen sınır o gruptaki bütün kartlara geçer ve o nitelikte kuralın yerine kullanılır. Kart kendi farkını
        kartın Alternatifler bölümünde yazar; dar kapsam geniş olanı ezer.
      </p>
      {yaz && <div className="tc-alt-eylem"><Dugme tur="birincil" simge="plus" onClick={() => acikYaz('yeni')}>Sınır ekle</Dugme></div>}
      <Tablo
        etiket="Grup sınırları" sutunlar={sutunlar} satirlar={sinirlar.data.siniri} satirAnahtari={(s) => s.id}
        satirSec={yaz ? (s) => acikYaz(s) : undefined} bosMesaj="Grup sınırı yok; kartlar kurallarla ve kendi sınırlarıyla hesaplanır."
      />
      {acik !== null && <GrupSiniriPenceresi kayit={acik === 'yeni' ? null : acik} kapsamlar={sinirlar.data.kapsamlar} kapat={() => acikYaz(null)} />}
    </section>
  );
}

function GrupSiniriPenceresi({ kayit, kapsamlar, kapat }: { kayit: KabulSiniri | null; kapsamlar: readonly KapsamSecenegi[]; kapat: () => void }) {
  const kaydet = useSinirKaydet();
  const kaldir = useSinirKaldir();
  const { bildir } = useBildirim();
  const [kapsamTuru, kapsamTuruYaz] = useState<GrupKapsami>((kayit?.kapsamTuru as GrupKapsami | undefined) ?? 'sinif');
  const [kapsam, kapsamYaz] = useState(kayit?.kapsam ?? '');
  const [nitelik, nitelikYaz] = useState<SinirNiteligi>(kayit?.nitelik ?? 'kalite');
  const [degerler, degerlerYaz] = useState<SinirDegeri[]>(kayit?.degerler ? [...kayit.degerler] : []);
  const [yeni, yeniYaz] = useState('');
  const [alt, altYaz] = useState(kayit?.alt === null || kayit === null ? '' : String(kayit.alt));
  const [ust, ustYaz] = useState(kayit?.ust === null || kayit === null ? '' : String(kayit.ust));
  const [silOnayi, silOnayiYaz] = useState(false);
  const etkilenen = kartSayisi(kapsamlar, kapsamTuru, kapsam);
  const secenekler: readonly Secenek[] = [
    { deger: '', baslik: 'Seçin' },
    ...kapsamlar.filter((k) => k.kapsamTuru === kapsamTuru).map((k) => ({ deger: k.kapsam, baslik: `${k.kapsam} (${k.kart} kart)` })),
  ];
  const etkiMetni = `${KAPSAM_ADI[kapsamTuru]} ${kapsam}: ${etkilenen} hammadde kartı`;
  const liste = listeMi(nitelik);
  const sayiOku = (x: string): number | null => (x.trim() === '' ? null : Number(x.replace(',', '.')));
  const gonder = () => {
    const govde = { kapsamTuru, kapsam: kapsam.trim(), nitelik, degerler: liste ? degerler : null, alt: liste ? null : sayiOku(alt), ust: liste ? null : sayiOku(ust) };
    kaydet.mutate({ ...govde, ...(kayit ? { surum: kayit.surum } : {}) }, {
      onSuccess: () => { bildir('tamam', 'Grup sınırı kaydedildi'); kapat(); },
      onError: (e) => bildir('hata', hataIletisi(e, 'Grup sınırı kaydedilemedi')),
    });
  };
  const sil = () => {
    if (!kayit) return;
    kaldir.mutate({ id: kayit.id, surum: kayit.surum }, {
      onSuccess: () => { bildir('tamam', 'Grup sınırı kaldırıldı'); kapat(); },
      onError: (e) => bildir('hata', hataIletisi(e, 'Grup sınırı kaldırılamadı')),
    });
  };
  return (
    <>
    <Pencere
      acik
      kapat={kapat}
      baslik={kayit ? `${KAPSAM_ADI[kapsamTuru]} ${kayit.kapsam}: ${nitelikAdi(kayit.nitelik)} sınırı` : 'Grup sınırı ekle'}
      alt={(
        <div className="tc-mk-pencere-alt">
          {kayit && <Dugme simge="trash" onClick={() => silOnayiYaz(true)}>Sınırı kaldır</Dugme>}
          <span className="tc-kalt-sag">
            <Dugme onClick={kapat}>Vazgeç</Dugme>
            <Dugme tur="birincil" yukleniyor={kaydet.isPending} disabled={kapsam.trim() === ''} onClick={gonder}>Kaydet</Dugme>
          </span>
        </div>
      )}
    >
      <div className="tc-alt-form">
        {kayit === null && (
          <div className="tc-kalt-bagla tc-kalt-aralik">
            <Secim etiket="Kapsam" secenekler={KAPSAMLAR} value={kapsamTuru} onChange={(e) => { kapsamTuruYaz(e.target.value as GrupKapsami); kapsamYaz(''); }} />
            <Secim etiket="Uygulandığı yer" secenekler={secenekler} value={kapsam} onChange={(e) => kapsamYaz(e.target.value)} />
            <Secim etiket="Nitelik" secenekler={NITELIKLER} value={nitelik} onChange={(e) => { nitelikYaz(e.target.value as SinirNiteligi); degerlerYaz([]); }} />
          </div>
        )}
        {kapsam !== '' && (
          <p className="tc-alt-not" role="status">
            {etkilenen === 0 ? <Rozet ton="uyari">Bu kapsamda hammadde kartı yok</Rozet> : `Bu sınır ${etkiMetni} için geçerli olur.`}
          </p>
        )}
        {liste ? (
          <>
            <ul className="tc-kalt-liste">
              {degerler.map((d, i) => (
                <li key={d.deger} className="tc-kalt-satir">
                  <span className="mono">{d.deger}</span>
                  <Secim etiket="Tür" secenekler={TURLER} value={d.tur}
                    onChange={(e) => degerlerYaz(degerler.map((x, j) => (j === i ? { ...x, tur: e.target.value as MuadilTuru } : x)))} />
                  <Dugme simge="x" onClick={() => degerlerYaz(degerler.filter((_, j) => j !== i))} aria-label={`${d.deger} kaldır`}>Kaldır</Dugme>
                </li>
              ))}
            </ul>
            <div className="tc-kalt-bagla">
              <Girdi etiket="İzinli değer ekle" maxLength={60} value={yeni} onChange={(e) => yeniYaz(e.target.value)} />
              <Dugme simge="plus" disabled={!yeni.trim() || degerler.some((d) => d.deger === yeni.trim())}
                onClick={() => { degerlerYaz([...degerler, { deger: yeni.trim(), tur: degerler.length === 0 ? 'tam' : 'ust' }]); yeniYaz(''); }}>Ekle</Dugme>
            </div>
          </>
        ) : (
          <div className="tc-kalt-bagla tc-kalt-aralik">
            <Girdi etiket="En az (mm)" inputMode="decimal" value={alt} onChange={(e) => altYaz(e.target.value)} />
            <Girdi etiket="En çok (mm)" inputMode="decimal" value={ust} onChange={(e) => ustYaz(e.target.value)} />
          </div>
        )}
      </div>
    </Pencere>
    <OnayPenceresi
      acik={silOnayi} baslik="Grup sınırı kaldırılsın mı?" onayMetni="Sınırı kaldır" tehlikeli yukleniyor={kaldir.isPending}
      onayla={sil} vazgec={() => silOnayiYaz(false)}
    >
      <p>{etkiMetni} bu sınırı kaybeder; o nitelikte yeniden kurallar ve kartın kendi sınırı kullanılır.</p>
    </OnayPenceresi>
    </>
  );
}
