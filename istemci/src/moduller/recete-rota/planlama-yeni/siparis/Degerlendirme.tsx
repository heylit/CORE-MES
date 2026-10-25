import { useEffect, useState, type ReactNode } from 'react';
import { Dugme, Kart, Rozet, Secim, Simge, Tablo, type Sutun } from '../../../../ortak/arayuz/index.ts';
import type { SimgeAdi } from '../../../../ortak/tasarim/simgeler.ts';
import type { PlanlamaDeposu } from '../veri.ts';
import type { CalismaKomutu } from '../kayit.ts';
import type { PlanVerisi, PlanlamaCalismasi } from '../tipler.ts';
import {
  DEGERLENDIRME_ACIK, MALZEME_DURUM_AD, TERMIN_SECENEK_AD, degerlendirici, degerlendirmeHatasi, esitPartiler, partiAdetleriDenetle, secenegiAl,
  type DegerlendirmeCevabi, type DegerlendirmeIstegi, type DegerlendirmeTuru, type Degerlendirici, type MalzemeTerminiSatiri,
  type PlanSecenegi, type TerminSecenegiSatiri, type TerminUzatmaSatiri,
} from './degerlendirme.ts';
import { MotorNotu } from './IsiHaritasi.tsx';
import {
  PARTI_EN_COK, darbogaz, dengeAdi, dengeKatYazi, gunYaz, kasayaBol, partiAdaylari, partiKurali, partiKuraliDenetle, saat, saatOku, sayi, simdi,
  taramaKapsami, taramaSecenekSayisi, tl, type KayitliPlan,
} from './kurallar.ts';

// Plan motorunu isteyen kartlar (zw-denge sDenge, zz10 ebFormHtml, zz11 btKart, zv-termin sTerminler). Kart eski düzeniyle yerinde durur;
// motor bağlanana dek (DEGERLENDIRME_ACIK) hesap düğmesi pasif, altında not (357 b, TASARIM KORUMA). Hesap pahalıdır: eski sayfadaki gibi
// düğmeyle istenir. Çalışmaya yazan tek eylem plan seçeneğini almaktır (yalnız plan alanları); termin uzatma ve parti bölme kaynak alanını
// yazar, yerinde pasiftir (222 a).

export function gorunumDegerlendiricisi(depo: PlanlamaDeposu): Degerlendirici | null {
  return DEGERLENDIRME_ACIK && depo.calismaSurumu !== null ? degerlendirici(depo.calismaSurumu) : null;
}

type Durum<K extends DegerlendirmeTuru> = { tur: 'bos' } | { tur: 'bekliyor' } | { tur: 'hata'; metin: string; yenile: boolean } | { tur: 'sonuc'; cevap: DegerlendirmeCevabi<K> };

function DurumSatiri<K extends DegerlendirmeTuru>({ d, yenile }: { d: Durum<K>; yenile: () => void }) {
  if (d.tur === 'bekliyor') return <p className="tc-pys-kucuk" role="status"><Simge ad="clock" boyut="k" /> Hesaplanıyor; bir dakikaya kadar sürebilir.</p>;
  if (d.tur === 'hata') {
    return (
      <div className="tc-pys-hata" role="alert">
        <p>{d.metin}</p>
        {d.yenile && <Dugme simge="rotate" onClick={yenile}>Yenile</Dugme>}
      </div>
    );
  }
  return null;
}

// Eski sayfada kendiliğinden hesaplanan liste (sipariş kârı, termin bekleyen malzeme): uç açıkken görünüm açılınca bir kez istenir.
export function useDegerlendirme<K extends DegerlendirmeTuru>(istek: Extract<DegerlendirmeIstegi, { tur: K }> | null, degerlendir: Degerlendirici | null): Durum<K> {
  const [d, dYaz] = useState<Durum<K>>({ tur: 'bos' });
  const anahtar = istek === null || degerlendir === null ? null : JSON.stringify(istek);
  useEffect(() => {
    if (anahtar === null || degerlendir === null) return undefined;
    let canli = true;
    dYaz({ tur: 'bekliyor' });
    // İstek nesnesi her çizimde yenidir; içeriği anahtardan okunur.
    degerlendir(JSON.parse(anahtar) as Extract<DegerlendirmeIstegi, { tur: K }>).then(
      (cevap) => { if (canli) dYaz({ tur: 'sonuc', cevap: cevap as DegerlendirmeCevabi<K> }); },
      (h: unknown) => { if (canli) dYaz({ tur: 'hata', ...degerlendirmeHatasi(h) }); },
    );
    return () => { canli = false; };
  }, [anahtar, degerlendir]);
  return d;
}

interface KartOzellikleri<K extends DegerlendirmeTuru> {
  baslik: string;
  simge?: SimgeAdi;
  baslikEki?: ReactNode;
  aciklama: ReactNode;
  // Eski sayfadaki düğmenin adı ve yeri: kart başlığında ya da seçim satırında (pm-sira).
  dugme: string;
  yeniden?: string;
  yer: 'baslik' | 'sira';
  birincil?: boolean;
  girdi?: ReactNode;
  // Hesabın istenemediği eski durum (plan yok gibi): düğme pasif, not yazılır.
  engel?: string | null;
  istek: Extract<DegerlendirmeIstegi, { tur: K }> | null;
  degerlendir: Degerlendirici | null;
  yenile: () => void;
  children: (cevap: DegerlendirmeCevabi<K>) => ReactNode;
}

export function DegerlendirmeKarti<K extends DegerlendirmeTuru>({
  baslik, simge, baslikEki, aciklama, dugme, yeniden, yer, birincil, girdi, engel, istek, degerlendir, yenile, children,
}: KartOzellikleri<K>) {
  const [d, dYaz] = useState<Durum<K>>({ tur: 'bos' });
  const hesapla = () => {
    if (istek === null || degerlendir === null) return;
    dYaz({ tur: 'bekliyor' });
    degerlendir(istek).then(
      (cevap) => { dYaz({ tur: 'sonuc', cevap: cevap as DegerlendirmeCevabi<K> }); },
      (h: unknown) => { dYaz({ tur: 'hata', ...degerlendirmeHatasi(h) }); },
    );
  };
  const kapali = degerlendir === null;
  const ad = d.tur === 'sonuc' && yeniden ? yeniden : dugme;
  const dg = (
    <Dugme tur={birincil && d.tur !== 'sonuc' ? 'birincil' : undefined} simge="play" onClick={hesapla}
      disabled={kapali || Boolean(engel) || istek === null || d.tur === 'bekliyor'}>{ad}</Dugme>
  );
  return (
    <Kart baslik={baslik} simge={simge} baslikEki={baslikEki} sag={yer === 'baslik' ? dg : undefined}>
      {yer === 'sira' ? <div className="tc-pys-sira">{girdi}{dg}</div> : girdi}
      <p className="tc-pys-kucuk">{aciklama}</p>
      {engel && <p className="tc-pys-kucuk">{engel}</p>}
      {kapali && <MotorNotu />}
      <DurumSatiri d={d} yenile={yenile} />
      {d.tur === 'sonuc' && children(d.cevap)}
    </Kart>
  );
}

const fark = (x: number | null, bicim: (v: number) => string): string => (x == null ? '—' : `${x > 0 ? '+' : ''}${bicim(x)}`);
const sa = (x: number | null | undefined): string => (x == null || !Number.isFinite(x) ? '—' : `${sayi(x, 1)} sa`);

// ---- Termin ve kâr: plan seçenekleri, teklif, termin uzatma (zw-denge sDenge k2-k4) ----

export function PlanSecenekleri({ cevap, komut, alabilir, kim, simdikiDenge }: {
  cevap: DegerlendirmeCevabi<'plan-secenekleri'>; komut: CalismaKomutu | null; alabilir: boolean; kim: string; simdikiDenge: number;
}) {
  const fg = cevap.maliyetGorunur; const l = cevap.sonuc.secenekler;
  const enK = Math.max(...l.map((x) => x.netKar ?? -Infinity));
  const al = (x: PlanSecenegi) => {
    komut?.degistir('Plan dengesi seçildi', (t) => secenegiAl(t, x, cevap.dataVer, kim, Date.now()), {
      ayrinti: `${dengeAdi(x.denge)} (gecikme bedeli ${dengeKatYazi(x.denge)})${x.ekMesai.length ? `, ${String(x.ekMesai.length)} ek mesai vardiyası kabul` : ''}`, planKoru: true,
    });
  };
  const sutunlar: Sutun<PlanSecenegi>[] = [
    { anahtar: 'secenek', baslik: 'Seçenek', hucre: (x) => <><b>{dengeAdi(x.denge)}</b><small className="tc-pys-not">gecikme bedeli {dengeKatYazi(x.denge)}{x.denge === simdikiDenge ? ' · şimdiki ayar' : ''}</small></> },
    { anahtar: 'mesai', baslik: 'Ek mesai', hucre: (x) => (x.ekMesai.length ? <><span className="mono">{x.ekMesai.length} vardiya</span>{fg && <small className="tc-pys-not">{tl(x.ekMesaiTl)}</small>}</> : <span className="tc-pys-kucuk">yok</span>) },
    { anahtar: 'geciken', baslik: 'Geciken', hizala: 'sag', mono: true, hucre: (x) => `${String(x.geciken)} / ${String(x.isSayisi)}` },
    { anahtar: 'gecikme', baslik: 'Gecikme', hizala: 'sag', mono: true, hucre: (x) => sa(x.gecikmeSaat) },
    ...(fg ? [
      // Sözleşme taslağında seçenek başına gecikme bedeli yok (DEVIR); sütun yerinde, değer gelene dek boş.
      { anahtar: 'bedel', baslik: 'Gecikme bedeli', hizala: 'sag' as const, mono: true, hucre: () => '—' },
      { anahtar: 'net', baslik: 'Net kâr', hizala: 'sag' as const, hucre: (x: PlanSecenegi) => (
        <><b className="mono">{tl(x.netKar)}</b>{x.netKar != null && x.netKar === enK && <> <Rozet ton="tamam">en kârlı</Rozet></>}{x.eksik > 0 && <small className="tc-pys-not">{x.eksik} siparişte eksik veri</small>}</>) },
    ] : []),
    { anahtar: 'al', baslik: '', csv: false, hucre: (x) => (fg && alabilir && komut ? <Dugme onClick={() => { al(x); }}>Bu planı al</Dugme> : null) },
  ];
  return (
    <>
      <Tablo etiket="Plan seçenekleri" sutunlar={sutunlar} satirlar={l} satirAnahtari={(x) => x.denge} bosMesaj="Seçenek kurulamadı." />
      <p className="tc-pys-kucuk">
        Ek mesai: Ek mesai sayfasının ölçtüğü adaylardan, o seçeneğin çarpanıyla kazanç bırakanlar plana eklenerek denendi; seçenek alınınca bu vardiyalar
        kabul edilmiş olarak Ek mesai planına girer. Net kâr: tutar − malzeme + talaş − işleme, ayar, genel gider, fason, ek mesai − gecikme bedeli (gerçek,
        çarpansız) − finansman ve bekleme.
      </p>
    </>
  );
}

export function PlanSecenekleriKarti({ degerlendir, yenile, ...o }: { degerlendir: Degerlendirici | null; yenile: () => void; komut: CalismaKomutu | null; alabilir: boolean; kim: string; simdikiDenge: number }) {
  return (
    <DegerlendirmeKarti
      baslik="Plan seçenekleri" simge="layers" dugme="Seçenekleri hesapla" yeniden="Yeniden hesapla" yer="baslik" birincil
      aciklama="Aynı veriyle termin önce, dengeli ve kâr önce üç plan kurulur; sonuçlar yan yana görünür. Müdür birini seçerse çubuk o konuma gelir ve plan çalışmaya alınır."
      istek={{ tur: 'plan-secenekleri' }} degerlendir={degerlendir} yenile={yenile}
    >
      {(c) => <PlanSecenekleri cevap={c} {...o} />}
    </DegerlendirmeKarti>
  );
}

export function TerminSecenekleri({ cevap }: { cevap: DegerlendirmeCevabi<'termin-secenekleri'> }) {
  const fg = cevap.maliyetGorunur; const s = cevap.sonuc;
  const enI = Math.max(...s.satirlar.map((x) => x.toplamKar ?? -Infinity));
  const sutunlar: Sutun<TerminSecenegiSatiri>[] = [
    { anahtar: 'termin', baslik: 'Termin', hucre: (x) => <><b>{TERMIN_SECENEK_AD[x.secenek]}</b><small className="tc-pys-not mono">{x.termin ?? '—'}</small></> },
    { anahtar: 'bitis', baslik: 'Planlanan bitiş', mono: true, kirilmaz: true, hucre: (x) => x.bitis ?? '—' },
    { anahtar: 'gecikme', baslik: 'Gecikme', hizala: 'sag', hucre: (x) => (x.gecikmeSaat != null && x.gecikmeSaat > 0.05 ? <span className="mono">{sa(x.gecikmeSaat)}</span> : <Rozet ton="tamam">zamanında</Rozet>) },
    ...(fg ? [
      { anahtar: 'net', baslik: 'Siparişin net kârı', hizala: 'sag' as const, mono: true, hucre: (x: TerminSecenegiSatiri) => tl(x.netKar) },
      { anahtar: 'diger', baslik: 'Diğer siparişlere etkisi', hizala: 'sag' as const, mono: true, hucre: (x: TerminSecenegiSatiri) => fark(x.digerKarFarki, tl) },
      { anahtar: 'toplam', baslik: 'Toplam', hizala: 'sag' as const, hucre: (x: TerminSecenegiSatiri) => <><b className="mono">{tl(x.toplamKar)}</b>{x.toplamKar != null && x.toplamKar === enI && <> <Rozet ton="tamam">en iyi</Rozet></>}</> },
    ] : [
      { anahtar: 'diger', baslik: 'Diğer siparişlerde gecikme', hizala: 'sag' as const, mono: true, hucre: (x: TerminSecenegiSatiri) => fark(x.digerGecikmeFarki, sa) },
    ]),
  ];
  return (
    <>
      {!s.yerlesti && <p className="tc-pys-uyari"><Simge ad="alert" boyut="k" /> Sipariş plana yerleşemedi; tarihler tahmindir.</p>}
      <Tablo etiket="Termin seçenekleri" sutunlar={sutunlar} satirlar={s.satirlar} satirAnahtari={(x) => x.secenek} bosMesaj="Seçenek yok." />
      <p className="tc-pys-kucuk">
        Diğer siparişlere etki, {s.taban === 'siparissiz' ? 'siparişsiz plan' : 'girilen terminli plan'} ile karşılaştırılır: erken termin verilen sipariş öne geçince
        başkaları gecikebilir. Ek mesai bu tabloya girmez; Ek mesai sayfasındaki öneri ayrıca bakılır.
      </p>
    </>
  );
}

export function TeklifKarti({ siparisler, degerlendir, yenile }: { siparisler: PlanVerisi['siparisler']; degerlendir: Degerlendirici | null; yenile: () => void }) {
  const ilk = (siparisler.find((s) => s.havuz) ?? siparisler[0])?.id ?? '';
  const [id, idYaz] = useState(ilk);
  const tid = siparisler.some((s) => s.id === id) ? id : ilk;
  return (
    <DegerlendirmeKarti
      baslik="Teklif: termin ve kâr" simge="tag" dugme="Termin seçeneklerini hesapla" yer="sira"
      girdi={(
        <label className="tc-pys-ym-alan"><span>Sipariş</span>
          <select className="tc-alan-kutu tc-pys-secim" value={tid} aria-label="Teklif siparişi" onChange={(e) => { idYaz(e.target.value); }}>
            {siparisler.map((s) => <option key={s.id} value={s.id}>{s.id}{s.havuz ? ' (havuzda, teklif)' : ''}</option>)}
          </select>
        </label>
      )}
      aciklama="Siparişe söz verilebilecek en erken tarih ve daha geç termin seçenekleri bugünkü planın üstünde denenir. Havuzdaki sipariş teklif sayılır: plana alınmış gibi hesaplanır, plan değişmez."
      istek={tid ? { tur: 'termin-secenekleri', siparisId: tid } : null} degerlendir={degerlendir} yenile={yenile}
    >
      {(c) => <TerminSecenekleri cevap={c} />}
    </DegerlendirmeKarti>
  );
}

export function TerminUzatma({ cevap }: { cevap: DegerlendirmeCevabi<'termin-uzatma'> }) {
  const fg = cevap.maliyetGorunur; const g = cevap.sonuc.gun;
  if (!cevap.sonuc.satirlar.length) return <p className="tc-pys-kucuk">Planda geciken sipariş yok.</p>;
  const sutunlar: Sutun<TerminUzatmaSatiri>[] = [
    { anahtar: 'siparis', baslik: 'Sipariş', hucre: (x) => <><b>{x.siparisId}</b><small className="tc-pys-not">{g} gün uzatma</small></> },
    { anahtar: 'simdi', baslik: 'Gecikme şimdi', hizala: 'sag', mono: true, hucre: (x) => sa(x.gecikmeSimdi) },
    { anahtar: 'uzatinca', baslik: 'Uzatınca', hizala: 'sag', hucre: (x) => (x.gecikmeUzatinca > 0.05 ? <span className="mono">{sa(x.gecikmeUzatinca)}</span> : <Rozet ton="tamam">zamanında</Rozet>) },
    { anahtar: 'plan', baslik: 'Plandaki toplam gecikme', hizala: 'sag', hucre: (x) => (
      <><span className="mono">{x.gecikmeSaatFarki < -0.05 ? '−' : x.gecikmeSaatFarki > 0.05 ? '+' : ''}{sa(Math.abs(x.gecikmeSaatFarki))}</span>
        {x.gecikenFarki < 0 && <small className="tc-pys-not">{-x.gecikenFarki} sipariş daha zamanında</small>}</>) },
    ...(fg ? [{ anahtar: 'kar', baslik: 'Plan kârı', hizala: 'sag' as const, hucre: (x: TerminUzatmaSatiri) => <b className="mono">{fark(x.netKarFarki, tl)}</b> }] : []),
    { anahtar: 'oneri', baslik: 'Öneri', hucre: (x) => ((x.netKarFarki != null ? x.netKarFarki > 0.5 : x.gecikmeSaatFarki < -0.05) ? <Rozet ton="tamam">ister</Rozet> : <Rozet ton="pasif">ödemez</Rozet>) },
    // Termini yazmak Üretim emirlerinindir (222 a); düğme yerinde, pasif.
    { anahtar: 'uzat', baslik: '', csv: false, hucre: () => <Dugme disabled title="Termin Üretim emirlerinde değiştirilir">Müşteri kabul etti, uzat</Dugme> },
  ];
  return (
    <>
      <Tablo etiket="Termin uzatma önerisi" sutunlar={sutunlar} satirlar={cevap.sonuc.satirlar} satirAnahtari={(x) => x.siparisId} />
      <p className="tc-pys-kucuk">
        Karşılaştırma kural tabanlı ilk planla yapılır; uzatmanın etkisi taban plana göredir. Uzatılan sipariş aciliyetini kaybedip daha geç bitebilir; plan kârını
        düşüren uzatma "ödemez" olarak işaretlenir. Termin ancak müşteri kabul ederse uzatılır; uzatma Üretim emirlerinde termine yazılır ve plan yeniden çözülmelidir.
      </p>
    </>
  );
}

export const UZATMA_GUNLERI = [1, 2, 3, 5] as const;
export type UzatmaGunu = (typeof UZATMA_GUNLERI)[number];

export function TerminUzatmaKarti({ planVar, degerlendir, yenile }: { planVar: boolean; degerlendir: Degerlendirici | null; yenile: () => void }) {
  const [gun, gunYaz] = useState<UzatmaGunu>(2);
  return (
    <DegerlendirmeKarti
      baslik="Termin uzatma önerisi" simge="flag" dugme="Önerileri hesapla" yer="sira" engel={planVar ? null : 'Önce planı çözün.'}
      girdi={(
        <div className="tc-pys-seg" role="group" aria-label="Uzatma süresi">
          {UZATMA_GUNLERI.map((g) => <button key={g} type="button" aria-pressed={g === gun} onClick={() => { gunYaz(g); }}>{g} gün</button>)}
        </div>
      )}
      aciklama="Geciken siparişlerden gecikme bedeli en büyük altısı için termin seçilen gün kadar uzatılmış gibi plan yeniden kurulur. Planı en çok iyileştiren üstte; müşteriyle konuşmak için dayanaktır."
      istek={{ tur: 'termin-uzatma', gun }} degerlendir={degerlendir} yenile={yenile}
    >
      {(c) => <TerminUzatma cevap={c} />}
    </DegerlendirmeKarti>
  );
}

// ---- Siparişler: partiyi böl, parti taraması (zz10 ebFormHtml, zz11 btKart) ----

export function PartiBolme({ cevap }: { cevap: DegerlendirmeCevabi<'parti-bolme'> }) {
  const s = cevap.sonuc;
  if (!s.sonuc) return null;
  return (
    <>
      <Tablo etiket="Partiler" sutunlar={[
        { anahtar: 'id', baslik: 'Parti', mono: true, hucre: (x) => x.siparisId },
        { anahtar: 'adet', baslik: 'Adet', hizala: 'sag', mono: true, hucre: (x) => sayi(x.adet, 0) },
        { anahtar: 'makine', baslik: 'Tezgâh', mono: true, hucre: (x) => x.makineId },
      ]} satirlar={s.sonuc.partiler} satirAnahtari={(x) => x.siparisId} />
      <p className="tc-pys-deger">Gecikme <b className="mono">{sa(s.sonuc.gecikmeOnce)} → {sa(s.sonuc.gecikmeSonra)}</b> (en geç parti){cevap.maliyetGorunur && <> · <span className="mono">{tl(s.sonuc.tl)}</span></>}</p>
    </>
  );
}

export function PartiBolmeKarti({ c, p, degerlendir, yenile }: { c: PlanlamaCalismasi | null; p: KayitliPlan | null; degerlendir: Degerlendirici | null; yenile: () => void }) {
  const D = c?.D ?? null;
  const l = D && p ? partiAdaylari(D, p) : [];
  const [secilen, secilenYaz] = useState<string | null>(null);
  const [n, nYaz] = useState(2);
  const [dagitim, dagitimYaz] = useState<'ayni' | 'dag'>('ayni');
  // Elle değiştirilen adetler metin olarak tutulur (boş alan yazılırken geçerli olsun); iş emri ya da parti sayısı değişince eşit dağılıma döner.
  const [elle, elleYaz] = useState<string[] | null>(null);
  const [d, dYaz] = useState<Durum<'parti-bolme'>>({ tur: 'bos' });
  const baslik = 'Partiyi böl';
  const baslikEki = <span className="tc-pys-kucuk">iş emri seçin, parti sayısını verin</span>;
  if (!c || !D || !p) return <Kart baslik={baslik} simge="ruler" baslikEki={baslikEki}><p className="tc-pys-kucuk">Önce plan kurulmalı.</p></Kart>;
  const s = l.find((x) => x.id === secilen) ?? l[0];
  if (!s) return <Kart baslik={baslik} simge="ruler" baslikEki={baslikEki}><p className="tc-pys-kucuk">Bölünebilecek iş emri yok: plandaki iş emirleri başlamış ya da tek adet.</p></Kart>;
  // Darboğaz ve parti kuralı plandan ve rotadan hesaplanır (eski sayfa gibi, motor gerekmez).
  const dar = darbogaz(D, p, s.id, simdi(c));
  const kural = partiKurali(D, s.id, dar);
  const tez = dar ? [dar.m, ...dar.alt] : [];
  const nGercek = Math.min(n, s.adet);
  const esit = esitPartiler(s.adet, nGercek);
  const metin = elle ?? (esit ? kasayaBol(esit, kural.kasa, kural.qmin) ?? esit : []).map(String);
  const adetler = metin.map((x) => (x.trim() === '' ? NaN : Number(x)));
  const hata = partiAdetleriDenetle(s.adet, adetler) ?? partiKuraliDenetle(adetler, kural.kasa, kural.qmin);
  const T = p.J[s.id]?.T ?? 0;
  const sec = (id: string, yeniN: number) => { secilenYaz(id); nYaz(yeniN); elleYaz(null); dYaz({ tur: 'bos' }); };
  const olc = () => {
    if (!degerlendir || hata) return;
    dYaz({ tur: 'bekliyor' });
    degerlendir({ tur: 'parti-bolme', siparisId: s.id, dagitim, adetler }).then(
      (cevap) => { dYaz({ tur: 'sonuc', cevap }); }, (h: unknown) => { dYaz({ tur: 'hata', ...degerlendirmeHatasi(h) }); },
    );
  };
  return (
    <Kart baslik={baslik} simge="ruler" baslikEki={baslikEki}>
      <form className="tc-pys-eb" aria-label="Partiyi böl" noValidate onSubmit={(e) => { e.preventDefault(); olc(); }}>
        <Secim etiket="İş emri" value={s.id} onChange={(e) => { sec(e.target.value, n); }}
          secenekler={l.map((x) => { const t = p.J[x.id]?.T ?? 0; return { deger: x.id, baslik: `${x.id} · ${String(x.adet)} adet${t > 0.05 ? ` · ${sayi(t, 1)} sa gecikme` : ''}` }; })} />
        <div className="tc-pys-eb-ust">
          <Secim etiket="Parti sayısı" value={String(nGercek)} onChange={(e) => { sec(s.id, Number(e.target.value)); }}
            secenekler={Array.from({ length: Math.min(PARTI_EN_COK, s.adet) - 1 }, (_, i) => ({ deger: String(i + 2), baslik: String(i + 2) }))} />
          {dar && dar.alt.length > 0 && (
            <Secim etiket="Tezgâh" value={dagitim} onChange={(e) => { dagitimYaz(e.target.value === 'dag' ? 'dag' : 'ayni'); }}
              secenekler={[{ deger: 'ayni', baslik: 'Bütün partiler aynı tezgâhlarda, sırayla' },
                { deger: 'dag', baslik: `${dar.k} adımında partiler ${tez.join(', ')} arasında dağılır` }]} />
          )}
          <Dugme simge="grid" onClick={() => { elleYaz(null); }}>Eşit dağıt</Dugme>
        </div>
        <div className="tc-pys-partiler" role="group" aria-label="Parti adetleri">
          {metin.map((x, i) => (
            <label key={i} className="tc-pys-parti">
              <span>{i + 1}. parti{dagitim === 'dag' && dar && dar.alt.length > 0 && <> <small className="tc-pys-kucuk">{tez[i % tez.length]}</small></>}</span>
              <input className="tc-alan-kutu" type="number" min={1} max={s.adet - 1} step={1} value={x} aria-label={`${String(i + 1)}. parti adedi`}
                onChange={(e) => { const y = [...metin]; y[i] = e.target.value; elleYaz(y); }} />
            </label>
          ))}
        </div>
        <p className="tc-pys-kucuk">
          {s.id}: {s.adet} adet, termin {gunYaz(D, saatOku(D, s.termin))}{T > 0.05 ? `, şimdi ${sayi(T, 1)} sa gecikiyor` : ', zamanında'}.
          {dar && ` Darboğaz adımı ${dar.k} (${dar.m}).`} Partiler {s.id}/1, /2 … adıyla ayrı iş emri olur; termin, öncelik ve malzeme oranı aynı kalır.
        </p>
        <p className="tc-pys-kucuk"><Simge ad="ruler" boyut="k" /> {kural.k ?? ''} adımında en küçük parti {kural.qmin} adet{kural.kasa > 1 ? `, kasa ${String(kural.kasa)} adet` : ''}.</p>
        {hata && <p className="tc-pys-uyari" role="alert"><Simge ad="alert" boyut="k" /> {hata}</p>}
        <div className="tc-pys-dugmeler">
          <Dugme tur="birincil" type="submit" simge="ruler" disabled={!degerlendir || Boolean(hata) || d.tur === 'bekliyor'}>Böl</Dugme>
        </div>
        {/* 451/2: bölme Üretim emirlerinde yapılır; burada yalnız etkisi ölçülür (motor bağlanınca). */}
        <MotorNotu ne="İş emri Üretim emirlerinde bölünür; burada bölmenin gecikmeye etkisi ölçülür." />
        <DurumSatiri d={d} yenile={yenile} />
        {d.tur === 'sonuc' && <PartiBolme cevap={d.cevap} />}
      </form>
    </Kart>
  );
}

// Seçimde en çok 6 iş emri, iş emri başına 1-20 parti (zz11 btKart, BT_MAKS_N).
export const TARAMA_EN_COK = 6;
const TAM_TARAMA_DK = 10;
const KOORDINAT_TUR = 5;

export function PartiTaramasiKarti({ c, p }: { c: PlanlamaCalismasi | null; p: KayitliPlan | null }) {
  const [k, kYaz] = useState(3);
  const baslik = 'Parti taraması';
  const baslikEki = <span className="tc-pys-kucuk">1-{PARTI_EN_COK} parti, iş emirleri arası birleşimler</span>;
  if (!c || !p) return <Kart baslik={baslik} simge="grid" baslikEki={baslikEki}><p className="tc-pys-kucuk">Önce plan kurulmalı.</p></Kart>;
  const D = c.D;
  const A = taramaKapsami(D, p, k).map((s) => { const dar = darbogaz(D, p, s.id, simdi(c)); return { s, n: taramaSecenekSayisi(s.adet, dar, partiKurali(D, s.id, dar)) }; });
  const top = A.reduce((a, x) => a * x.n, 1);
  return (
    // Tarama motoru yüzlerce kez koşturur; değerlendirme sözleşmesinde yok, uç açılınca da pasif kalır.
    <Kart baslik={baslik} simge="grid" baslikEki={baslikEki} sag={<Dugme simge="rotate" disabled>Tara</Dugme>}>
      <div className="tc-pys-eb-ust">
        <Secim etiket="En çok geciken kaç iş emri" value={String(k)} onChange={(e) => { kYaz(Number(e.target.value)); }}
          secenekler={Array.from({ length: TARAMA_EN_COK }, (_, i) => ({ deger: String(i + 1), baslik: String(i + 1) }))} />
      </div>
      <p className="tc-pys-kucuk">
        {A.length ? (
          <>
            {A.map(({ s, n }, i) => <span key={s.id}>{i ? ' · ' : ''}<b className="mono">{s.id}</b>{typeof s.ust === 'string' && s.ust ? ' yarı mamul' : ''} {s.adet} adet, {n} seçenek</span>)}
            {'. '}
            {A.length < 2 ? 'Tek iş emri: bütün seçenekler denenir.'
              : `Çapraz ${sayi(top, 0)} birleşim. Önce her iş emri tek başına denenir; ölçülen hızla hepsi ${String(TAM_TARAMA_DK)} dakikaya sığıyorsa bütün birleşimler denenir, sığmıyorsa koordinat taraması yapılır: her iş emrinin bütün seçenekleri ötekiler en iyide sabitken denenir, değişiklik kalmayana kadar (en çok ${String(KOORDINAT_TUR)} tur).`}
          </>
        ) : 'Geciken ve bölünebilen iş emri yok.'}
      </p>
      <MotorNotu />
    </Kart>
  );
}

// ---- Terminler: malzeme termin bekleyenler (zv-termin malKart) ----

const MALZEME_TON: Record<MalzemeTerminiSatiri['durum'], 'hata' | 'uyari' | 'tamam' | 'pasif' | 'bilgi'> = {
  hizlandir: 'hata', 'plan-once-istiyor': 'uyari', ertelenebilir: 'bilgi', uygun: 'tamam', 'bagli-is-yok': 'pasif', 'siparis-yok': 'uyari',
};

export function MalzemeBekleyenKarti({ degerlendir, yenile }: { degerlendir: Degerlendirici | null; yenile: () => void }) {
  const d = useDegerlendirme<'malzeme-terminleri'>({ tur: 'malzeme-terminleri' }, degerlendir);
  const satirlar = d.tur === 'sonuc' ? d.cevap.sonuc.satirlar.filter((x) => x.soz == null) : [];
  const sutunlar: Sutun<MalzemeTerminiSatiri>[] = [
    { anahtar: 'malzeme', baslik: 'Malzeme', mono: true, hucre: (x) => x.kod },
    { anahtar: 'durum', baslik: 'Durum', hucre: (x) => <Rozet ton={MALZEME_TON[x.durum]}>{MALZEME_DURUM_AD[x.durum]}</Rozet>, csv: (x) => MALZEME_DURUM_AD[x.durum] },
    { anahtar: 'miktar', baslik: 'Miktar', hizala: 'sag', mono: true, hucre: (x) => sayi(x.miktar, 0) },
    { anahtar: 'gerekli', baslik: 'Gerekli geliş', mono: true, kirilmaz: true, hucre: (x) => x.plan ?? '—' },
    { anahtar: 'referans', baslik: 'Referans termin', mono: true, kirilmaz: true, hucre: (x) => x.enGec ?? '—' },
    { anahtar: 'termin', baslik: 'Termin', hucre: (x) => <input className="tc-alan-kutu tc-pys-tarih" type="date" disabled aria-label={`${x.kod} termin`} /> },
    { anahtar: 'siparisler', baslik: 'Siparişler', mono: true, hucre: (x) => x.isler.join(', ') },
    // İleri at işin başlama tarihini yazar; o tarih Üretim emirlerindendir (222 a). Yerinde, pasif.
    { anahtar: 'islem', baslik: 'İşlem', csv: false, hucre: () => <Dugme simge="next" disabled title="Başlama tarihi Üretim emirlerinde değiştirilir">İleri at</Dugme> },
  ];
  return (
    <Kart baslik="Malzeme: termin bekleyenler" simge="box">
      <Tablo etiket="Malzeme: termin bekleyenler" sutunlar={sutunlar} satirlar={satirlar} satirAnahtari={(x) => `${x.tur}-${x.satinalmaSira ?? ''}-${x.kod}`}
        bosMesaj={d.tur === 'sonuc' ? 'Termini beklenen malzeme yok.' : 'Satın alma listesi plan motoruyla gelir.'} />
      <p className="tc-pys-kucuk">
        Siparişi verilmemiş satıra termin girmek siparişi o terminle verir. İleri at: işin serbest bırakılma zamanını tahmini gelişe (muayene dahil) taşır; plan
        yeniden çözülünce iş o tarihten önce başlamaz.
      </p>
      {!degerlendir && <MotorNotu />}
      <DurumSatiri d={d} yenile={yenile} />
    </Kart>
  );
}
