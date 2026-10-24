import { useState, type ReactNode } from 'react';
import { Dugme, Girdi, Kart, Rozet, Secim, Simge, Tablo, type Sutun } from '../../../../ortak/arayuz/index.ts';
import type { PlanlamaDeposu } from '../veri.ts';
import type { CalismaKomutu } from '../kayit.ts';
import {
  DEGERLENDIRME_ACIK, MALZEME_DURUM_AD, TERMIN_SECENEK_AD, degerlendirici, degerlendirmeHatasi, esitPartiler, partiAdetleriDenetle, secenegiAl,
  type DegerlendirmeCevabi, type DegerlendirmeIstegi, type DegerlendirmeTuru, type Degerlendirici, type MalzemeTerminiSatiri,
  type PlanSecenegi, type SiparisKariSatiri, type TerminSecenegiSatiri, type TerminUzatmaSatiri,
} from './degerlendirme.ts';
import { MotorKapali } from './IsiHaritasi.tsx';
import { dengeAdi, saat, sayi, tl } from './kurallar.ts';

// Değerlendirme ucuna bağlı kartlar. Kapı kapalıyken (DEGERLENDIRME_ACIK) kilit kartı çizilir ve istek gitmez (357 b). Hesap pahalıdır
// (motor birkaç kez koşar): eski sayfadaki gibi düğmeyle istenir, açılışta istenmez. Sonuç yalnız çizilir; çalışmaya yazan tek eylem plan
// seçeneğini almaktır (yalnız plan alanları). Termin uzatma, parti bölme ve fiyat uygulama kaynak alanını yazar, burada yazılmaz (222 a).

export function gorunumDegerlendiricisi(depo: PlanlamaDeposu): Degerlendirici | null {
  return DEGERLENDIRME_ACIK && depo.calismaSurumu !== null ? degerlendirici(depo.calismaSurumu) : null;
}

type Durum<K extends DegerlendirmeTuru> = { tur: 'bos' } | { tur: 'bekliyor' } | { tur: 'hata'; metin: string; yenile: boolean } | { tur: 'sonuc'; cevap: DegerlendirmeCevabi<K> };

interface KartOzellikleri<K extends DegerlendirmeTuru> {
  baslik: string;
  ne: string;
  istek: Extract<DegerlendirmeIstegi, { tur: K }> | null;
  degerlendir: Degerlendirici | null;
  yenile: () => void;
  girdi?: ReactNode;
  children: (cevap: DegerlendirmeCevabi<K>) => ReactNode;
}

export function DegerlendirmeKarti<K extends DegerlendirmeTuru>({ baslik, ne, istek, degerlendir, yenile, girdi, children }: KartOzellikleri<K>) {
  const [d, dYaz] = useState<Durum<K>>({ tur: 'bos' });
  if (degerlendir === null) return <MotorKapali baslik={baslik} ne={ne} />;
  const hesapla = () => {
    if (istek === null) return;
    dYaz({ tur: 'bekliyor' });
    degerlendir(istek).then(
      (cevap) => { dYaz({ tur: 'sonuc', cevap: cevap as DegerlendirmeCevabi<K> }); },
      (h: unknown) => { dYaz({ tur: 'hata', ...degerlendirmeHatasi(h) }); },
    );
  };
  return (
    <Kart baslik={baslik} sag={<Dugme simge="play" onClick={hesapla} disabled={istek === null || d.tur === 'bekliyor'}>{d.tur === 'sonuc' ? 'Yeniden hesapla' : 'Hesapla'}</Dugme>}>
      <p className="tc-pys-kucuk">{ne}</p>
      {girdi}
      {d.tur === 'bekliyor' && <p className="tc-pys-kucuk" role="status"><Simge ad="clock" boyut="k" /> Hesaplanıyor; bir dakikaya kadar sürebilir.</p>}
      {d.tur === 'hata' && (
        <div className="tc-pys-hata" role="alert">
          <p>{d.metin}</p>
          {d.yenile && <Dugme simge="rotate" onClick={yenile}>Yenile</Dugme>}
        </div>
      )}
      {d.tur === 'sonuc' && children(d.cevap)}
    </Kart>
  );
}

const fark = (x: number | null, bicim: (v: number) => string): string => (x == null ? '—' : `${x > 0 ? '+' : ''}${bicim(x)}`);

export function PlanSecenekleri({ cevap, komut, alabilir, kim }: { cevap: DegerlendirmeCevabi<'plan-secenekleri'>; komut: CalismaKomutu | null; alabilir: boolean; kim: string }) {
  const kar = cevap.maliyetGorunur;
  const al = (x: PlanSecenegi) => {
    komut?.degistir('Plan seçeneği alındı', (t) => secenegiAl(t, x, cevap.dataVer, kim, Date.now()), {
      ayrinti: `${dengeAdi(x.denge)}${x.ekMesai.length ? `, ${String(x.ekMesai.length)} ek mesai vardiyası kabul` : ''}`, planKoru: true,
    });
  };
  const sutunlar: Sutun<PlanSecenegi>[] = [
    { anahtar: 'denge', baslik: 'Denge', hucre: (x) => dengeAdi(x.denge) },
    { anahtar: 'geciken', baslik: 'Geciken', hizala: 'sag', mono: true, hucre: (x) => `${String(x.geciken)} / ${String(x.isSayisi)}` },
    { anahtar: 'gecikme', baslik: 'Gecikme', hizala: 'sag', mono: true, hucre: (x) => saat(x.gecikmeSaat) },
    { anahtar: 'mesai', baslik: 'Ek mesai', hizala: 'sag', hucre: (x) => (x.ekMesai.length ? `${String(x.ekMesai.length)} vardiya${kar ? ` · ${tl(x.ekMesaiTl)}` : ''}` : '—') },
    ...(kar ? [{ anahtar: 'kar', baslik: 'Net kâr', hizala: 'sag' as const, mono: true, hucre: (x: PlanSecenegi) => (x.eksik ? <>{tl(x.netKar)} <Rozet ton="uyari">{x.eksik} fiyatsız</Rozet></> : tl(x.netKar)) }] : []),
    ...(alabilir && komut ? [{ anahtar: 'al', baslik: '', csv: false as const, hucre: (x: PlanSecenegi) => <Dugme simge="check" onClick={() => { al(x); }}>Bu planı al</Dugme> }] : []),
  ];
  return <Tablo etiket="Plan seçenekleri" sutunlar={sutunlar} satirlar={cevap.sonuc.secenekler} satirAnahtari={(x) => x.denge} bosMesaj="Seçenek kurulamadı." />;
}

export function TerminSecenekleri({ cevap }: { cevap: DegerlendirmeCevabi<'termin-secenekleri'> }) {
  const kar = cevap.maliyetGorunur; const s = cevap.sonuc;
  const sutunlar: Sutun<TerminSecenegiSatiri>[] = [
    { anahtar: 'secenek', baslik: 'Seçenek', hucre: (x) => TERMIN_SECENEK_AD[x.secenek] },
    { anahtar: 'termin', baslik: 'Termin', mono: true, kirilmaz: true, hucre: (x) => x.termin ?? '—' },
    { anahtar: 'bitis', baslik: 'Bitiş', mono: true, kirilmaz: true, hucre: (x) => x.bitis ?? '—' },
    { anahtar: 'gecikme', baslik: 'Gecikme', hizala: 'sag', mono: true, hucre: (x) => saat(x.gecikmeSaat) },
    { anahtar: 'diger', baslik: 'Diğer siparişler', hizala: 'sag', mono: true, hucre: (x) => fark(x.digerGecikmeFarki, saat) },
    ...(kar ? [
      { anahtar: 'net', baslik: 'Net kâr', hizala: 'sag' as const, mono: true, hucre: (x: TerminSecenegiSatiri) => tl(x.netKar) },
      { anahtar: 'toplam', baslik: 'Toplam kâr', hizala: 'sag' as const, mono: true, hucre: (x: TerminSecenegiSatiri) => tl(x.toplamKar) },
    ] : []),
  ];
  return (
    <>
      {!s.yerlesti && <p className="tc-pys-kucuk"><Simge ad="alert" boyut="k" /> Sipariş plana yerleşemedi; tarihler tahmindir.</p>}
      <Tablo etiket="Termin seçenekleri" sutunlar={sutunlar} satirlar={s.satirlar} satirAnahtari={(x) => x.secenek} bosMesaj="Seçenek yok." />
      <p className="tc-pys-kucuk">Söz verilen termin Üretim emirlerinde girilir; plan yeniden çözülünce yeni terminle yerleşir.</p>
    </>
  );
}

export function TerminUzatma({ cevap }: { cevap: DegerlendirmeCevabi<'termin-uzatma'> }) {
  const kar = cevap.maliyetGorunur;
  const sutunlar: Sutun<TerminUzatmaSatiri>[] = [
    { anahtar: 'siparis', baslik: 'Sipariş', mono: true, hucre: (x) => x.siparisId },
    { anahtar: 'yeni', baslik: 'Yeni termin', mono: true, kirilmaz: true, hucre: (x) => x.yeniTermin },
    { anahtar: 'gecikme', baslik: 'Gecikme', hizala: 'sag', mono: true, hucre: (x) => `${saat(x.gecikmeSimdi)} → ${saat(x.gecikmeUzatinca)}` },
    { anahtar: 'plan', baslik: 'Plana etkisi', hizala: 'sag', mono: true, hucre: (x) => `${fark(x.gecikmeSaatFarki, saat)} · ${fark(x.gecikenFarki, (v) => `${String(v)} iş`)}` },
    ...(kar ? [{ anahtar: 'kar', baslik: 'Net kâr farkı', hizala: 'sag' as const, mono: true, hucre: (x: TerminUzatmaSatiri) => fark(x.netKarFarki, tl) }] : []),
  ];
  return (
    <>
      <Tablo etiket="Termin uzatma önerisi" sutunlar={sutunlar} satirlar={cevap.sonuc.satirlar} satirAnahtari={(x) => x.siparisId} bosMesaj="Geciken sipariş yok." />
      <p className="tc-pys-kucuk">Müşteri uzatmayı kabul ederse termin Üretim emirlerinde değiştirilir.</p>
    </>
  );
}

const MALZEME_TON: Record<MalzemeTerminiSatiri['durum'], 'hata' | 'uyari' | 'tamam' | 'pasif' | 'bilgi'> = {
  hizlandir: 'hata', 'plan-once-istiyor': 'uyari', ertelenebilir: 'bilgi', uygun: 'tamam', 'bagli-is-yok': 'pasif', 'siparis-yok': 'uyari',
};

export function MalzemeTerminleri({ cevap }: { cevap: DegerlendirmeCevabi<'malzeme-terminleri'> }) {
  const sutunlar: Sutun<MalzemeTerminiSatiri>[] = [
    { anahtar: 'kod', baslik: 'Malzeme', mono: true, hucre: (x) => x.kod },
    { anahtar: 'tedarikci', baslik: 'Tedarikçi', hucre: (x) => x.tedarikci ?? '—' },
    { anahtar: 'soz', baslik: 'Söz', mono: true, kirilmaz: true, hucre: (x) => x.soz ?? '—' },
    { anahtar: 'enGec', baslik: 'Plan en geç', mono: true, kirilmaz: true, hucre: (x) => x.enGec ?? '—' },
    { anahtar: 'fark', baslik: 'Fark', hizala: 'sag', mono: true, hucre: (x) => (x.farkGun == null ? '—' : `${sayi(x.farkGun, 0)} g`) },
    { anahtar: 'durum', baslik: 'Durum', hucre: (x) => <Rozet ton={MALZEME_TON[x.durum]}>{MALZEME_DURUM_AD[x.durum]}</Rozet>, csv: (x) => MALZEME_DURUM_AD[x.durum] },
  ];
  return <Tablo etiket="Malzeme terminleri" sutunlar={sutunlar} satirlar={cevap.sonuc.satirlar} satirAnahtari={(x) => `${x.tur}-${x.satinalmaSira ?? ''}-${x.kod}`} bosMesaj="Satın alınan malzeme yok." />;
}

export function PartiBolme({ cevap }: { cevap: DegerlendirmeCevabi<'parti-bolme'> }) {
  const s = cevap.sonuc;
  return (
    <>
      <p className="tc-pys-kucuk">
        {s.darbogaz
          ? <>Darboğaz: <b>{s.darbogaz.adim}</b> · <span className="mono">{s.darbogaz.makineId}</span>{s.darbogaz.alternatifler.length ? `; alternatif tezgâh ${s.darbogaz.alternatifler.join(', ')}` : '; alternatif tezgâh yok'}.</>
          : 'Darboğaz bulunamadı.'}
      </p>
      {s.sonuc && (
        <>
          <Tablo etiket="Partiler" sutunlar={[
            { anahtar: 'id', baslik: 'Parti', mono: true, hucre: (x) => x.siparisId },
            { anahtar: 'adet', baslik: 'Adet', hizala: 'sag', mono: true, hucre: (x) => sayi(x.adet, 0) },
            { anahtar: 'makine', baslik: 'Tezgâh', mono: true, hucre: (x) => x.makineId },
          ]} satirlar={s.sonuc.partiler} satirAnahtari={(x) => x.siparisId} />
          <p className="tc-pys-deger">Gecikme <b className="mono">{saat(s.sonuc.gecikmeOnce)} → {saat(s.sonuc.gecikmeSonra)}</b>{cevap.maliyetGorunur && <> · <span className="mono">{tl(s.sonuc.tl)}</span></>}</p>
          <p className="tc-pys-kucuk">Bölme siparişleri değiştirir; iş emri Üretim emirlerinde bölünür (222 a).</p>
        </>
      )}
    </>
  );
}

export function SiparisKari({ cevap }: { cevap: DegerlendirmeCevabi<'siparis-kari'> }) {
  const sutunlar: Sutun<SiparisKariSatiri>[] = [
    { anahtar: 'siparis', baslik: 'Sipariş', mono: true, hucre: (x) => x.siparisId },
    { anahtar: 'toplam', baslik: 'Maliyet', hizala: 'sag', mono: true, hucre: (x) => tl(x.toplam) },
    { anahtar: 'tutar', baslik: 'Tutar', hizala: 'sag', mono: true, hucre: (x) => tl(x.tutar) },
    { anahtar: 'kar', baslik: 'Kâr', hizala: 'sag', mono: true, hucre: (x) => tl(x.kar) },
    { anahtar: 'gecikme', baslik: 'Gecikme bedeli', hizala: 'sag', mono: true, hucre: (x) => tl(x.gecikmeBedeli) },
    { anahtar: 'net', baslik: 'Net', hizala: 'sag', mono: true, hucre: (x) => (x.eksik.length ? <>{tl(x.net)} <Rozet ton="uyari">eksik</Rozet></> : tl(x.net)), csv: (x) => x.net },
  ];
  return <Tablo etiket="Siparişler: maliyet ve kâr" sutunlar={sutunlar} satirlar={cevap.sonuc.satirlar} satirAnahtari={(x) => x.siparisId} bosMesaj="Sipariş yok." />;
}

export function SiparisSecimi({ secenekler, deger, degistir }: { secenekler: readonly { id: string; ad: string }[]; deger: string; degistir: (id: string) => void }) {
  return (
    <Secim etiket="Sipariş" value={deger} onChange={(e) => { degistir(e.target.value); }}
      secenekler={[{ deger: '', baslik: 'Seçin' }, ...secenekler.map((s) => ({ deger: s.id, baslik: `${s.id} · ${s.ad}` }))]} />
  );
}

export const UZATMA_GUNLERI = [1, 2, 3, 5] as const;
export function GunSecimi({ deger, degistir }: { deger: (typeof UZATMA_GUNLERI)[number]; degistir: (g: (typeof UZATMA_GUNLERI)[number]) => void }) {
  return (
    <Secim etiket="Uzatma" value={String(deger)} onChange={(e) => { degistir(Number(e.target.value) as (typeof UZATMA_GUNLERI)[number]); }}
      secenekler={UZATMA_GUNLERI.map((g) => ({ deger: String(g), baslik: `${String(g)} gün` }))} />
  );
}

interface SecimliKart { siparisler: readonly { id: string; ad: string; adet: number }[]; degerlendir: Degerlendirici | null; yenile: () => void }

export function PartiBolmeKarti({ siparisler, degerlendir, yenile }: SecimliKart) {
  const [id, idYaz] = useState('');
  const [n, nYaz] = useState(2);
  const [dagitim, dagitimYaz] = useState<'ayni' | 'dag'>('ayni');
  // Elle değiştirilen adetler metin olarak tutulur (boş alan yazılırken geçerli olsun); sipariş ya da parti sayısı değişince eşit dağılıma döner.
  const [elle, elleYaz] = useState<string[] | null>(null);
  const s = siparisler.find((x) => x.id === id);
  const esit = s ? esitPartiler(s.adet, n) : null;
  const metin = elle ?? esit?.map(String) ?? null;
  const adetler = metin?.map((x) => (x.trim() === '' ? NaN : Number(x))) ?? null;
  const hata = s && adetler ? partiAdetleriDenetle(s.adet, adetler) : null;
  const sec = (yeniId: string, yeniN: number) => { idYaz(yeniId); nYaz(yeniN); elleYaz(null); };
  return (
    <DegerlendirmeKarti
      baslik="Partiyi böl" ne="İş emri seçilip parti sayısı verilir; partiler eşit dağıtılır, istenirse adetleri tek tek değiştirilir ve bölmenin gecikmeye etkisi motorla ölçülür."
      istek={s && adetler && !hata ? { tur: 'parti-bolme', siparisId: s.id, dagitim, adetler } : null} degerlendir={degerlendir} yenile={yenile}
      girdi={(
        <div className="tc-pys-f">
          <SiparisSecimi secenekler={siparisler} deger={id} degistir={(x) => { sec(x, n); }} />
          <Secim etiket="Parti sayısı" value={String(n)} onChange={(e) => { sec(id, Number(e.target.value)); }}
            secenekler={Array.from({ length: 19 }, (_, i) => ({ deger: String(i + 2), baslik: String(i + 2) }))} />
          <Secim etiket="Tezgâh" value={dagitim} onChange={(e) => { dagitimYaz(e.target.value === 'dag' ? 'dag' : 'ayni'); }}
            secenekler={[{ deger: 'ayni', baslik: 'Bütün partiler aynı tezgâhlarda, sırayla' }, { deger: 'dag', baslik: 'Darboğaz adımında tezgâhlara dağılır' }]} />
          {s && !metin && <p className="tc-pys-hata" role="alert">{`${String(s.adet)} adet ${String(n)} partiye bölünemez.`}</p>}
          {s && metin && (
            <div className="tc-pys-partiler" role="group" aria-label="Parti adetleri">
              {metin.map((x, i) => (
                <Girdi key={i} etiket={`${String(i + 1)}. parti`} type="number" min={1} max={s.adet - 1} step={1} value={x}
                  onChange={(e) => { const y = [...metin]; y[i] = e.target.value; elleYaz(y); }} />
              ))}
            </div>
          )}
          {s && metin && (
            <div className="tc-pys-satir">
              {hata && <p className="tc-pys-hata" role="alert">{hata}</p>}
              {elle && <Dugme simge="grid" onClick={() => { elleYaz(null); }}>Eşit dağıt</Dugme>}
            </div>
          )}
        </div>
      )}
    >
      {(c) => <PartiBolme cevap={c} />}
    </DegerlendirmeKarti>
  );
}

export function TerminSecenekleriKarti({ siparisler, degerlendir, yenile }: SecimliKart) {
  const [id, idYaz] = useState('');
  return (
    <DegerlendirmeKarti
      baslik="Teklif: termin ve kâr" ne="Siparişe söz verilebilecek en erken tarih ve daha geç termin seçenekleri bugünkü planın üstünde denenir; havuzdaki sipariş plana alınmış gibi hesaplanır."
      istek={id ? { tur: 'termin-secenekleri', siparisId: id } : null} degerlendir={degerlendir} yenile={yenile}
      girdi={<div className="tc-pys-f"><SiparisSecimi secenekler={siparisler} deger={id} degistir={idYaz} /></div>}
    >
      {(c) => <TerminSecenekleri cevap={c} />}
    </DegerlendirmeKarti>
  );
}

export function TerminUzatmaKarti({ degerlendir, yenile }: Omit<SecimliKart, 'siparisler'>) {
  const [gun, gunYaz] = useState<(typeof UZATMA_GUNLERI)[number]>(2);
  return (
    <DegerlendirmeKarti
      baslik="Termin uzatma önerisi" ne="Geciken siparişlerden gecikme bedeli en büyük altısı için termin uzatılmış gibi plan yeniden kurulur; planı en çok iyileştiren üstte gelir."
      istek={{ tur: 'termin-uzatma', gun }} degerlendir={degerlendir} yenile={yenile}
      girdi={<div className="tc-pys-f"><GunSecimi deger={gun} degistir={gunYaz} /></div>}
    >
      {(c) => <TerminUzatma cevap={c} />}
    </DegerlendirmeKarti>
  );
}
