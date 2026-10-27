import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Dugme, Rozet, Simge } from '../../../../../ortak/arayuz/index.ts';
import { planGuncel } from '../../durum.ts';
import type { PlanlamaGorunumu } from '../../gorunumler.ts';
import type { PlanlamaCalismasi } from '../../tipler.ts';
import {
  agAyar, baslangicMs, birimMaliyet, fasonTalasId, genelGiderHesabi, kgFiyatlari, kgSatiri, maliyetSistemi, malzemeler, mesaiSistemi, ML_CINS, ML_FORM,
  norm, planMaliyeti, sayi, sayiGirdisi, takvimKur, talasFiyatlari, tl, tlEksi, tlSaat, wipAyar, ymAyar, yuzde, type MaliyetBaglami,
} from '../kurallar.ts';
import {
  ayarlar, beklemeAcikYaz, erkenSevkYaz, fasonAlanYaz, fasonFiyatAlani, kgAlanYaz, kgEkleYaz, kgSilYaz, kgVarMi, maliyetAyariYaz, netKgYaz, talasYaz,
  tezUcretYaz, ucretYaz, vadeBasYaz, type Yaz,
} from '../yazmalar.ts';
import { Alan, AltNot, AsilKart, Kilit, Not, SayiGir, Segment } from './girdi.tsx';

// Maliyetler sayfasının "Tüm satırlar"ı: bugünkü sayfanın kartları (zu-yan-sayfalar sMaliyetler, ymBeklemeKart; zv-termin "Bu planın bütün
// maliyeti"; zz6 genel gider ve mesai bedeli satırları). Girdiler satır içidir; her biri tek değişiklik yazar.

interface Ozellik { c: PlanlamaCalismasi; b: MaliyetBaglami | null; para: boolean; yaz: Yaz | null; kim: string; git: (g: PlanlamaGorunumu) => void }
const sayiOf = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

export function MaliyetSayfasi({ c, b, para, yaz, kim, git }: Ozellik) {
  const D = c.D;
  const Y = ymAyar(D);
  const kapali = !yaz || !para;
  const y = (f: (z: Yaz) => boolean): boolean => (yaz ? f(yaz) : false);
  const bedelDegil = agAyar(D).kip !== 'bedel';
  // Plan amacı motor ayarıdır (771 a, 773 a); sunucu çalışmaya güncel ayarı yazar, burada yalnız gösterilir.
  const amac = (
    <AsilKart simge="target" baslik="Plan neyi en aza indirir">
      <div className="tc-pyk-sira">
        <Segment ad="Plan amacı" secenek={[['tl', 'Tek TL toplamı'], ['sira', 'Önce gecikme (sıralı)']]} deger={Y.amac} kapali sec={() => undefined} />
        <Link to="/plan/motor-ayarlari">Motor ayarlarında değiştir</Link>
        <Alan ad="Tampon riski katsayısı">
          {para ? <SayiGir deger={Y.risk} ad="Tampon riski katsayısı" max={1} bosOlmaz kapali={kapali} yaz={(v) => y((z) => maliyetAyariYaz(z, D, 'risk', v))} /> : <b className="tc-pyk-mono">{sayi(Y.risk, 2)}</b>}
        </Alan>
      </div>
      <Not>
        {Y.amac === 'tl'
          ? `Plan tek bir TL toplamını en aza indirir: gecikme saati × siparişin 1 saatlik gecikme bedeli, tampon ihlali × bedel × risk katsayısı, işleme, ayar, fason ve ek mesai TL. ${wipAyar(D).ac ? ' Yarı mamul ve mamul bekleme maliyeti de toplama girer.' : ''} Ek mesai ve fason ancak önlediği gecikme bedelinden ucuzsa plana girer. Eşit TL'de az değişiklik, sonra az ayar seçilir.`
          : 'Plan önce ağırlıklı gecikme saatine, sonra tampon ihlaline, değişiklik sayısına, ayar süresine, boşta kalmaya ve bitişe bakar; TL maliyete yalnız bunlar eşitse bakar.'}
        {bedelDegil && <b> Ağırlık şimdi öncelik sınıfından geliyor; tek TL toplamı yalnız gecikme bedeli kipinde çalışır (Öncelik ve ağırlık).</b>}
      </Not>
    </AsilKart>
  );
  if (!para) return <>{amac}<Kilit ad="Maliyetler" /></>;
  return (
    <>
      {b && <PlanMaliyetKarti b={b} />}
      {amac}
      <TezgahKarti c={c} kapali={kapali} y={y} />
      <div className="tc-pyk-iki">
        <IscilikKarti c={c} kapali={kapali} y={y} git={git} />
        <FasonFiyatKarti c={c} kapali={kapali} y={y} />
      </div>
      <KgKarti c={c} kapali={kapali} y={y} kim={kim} />
      <TalasKarti c={c} kapali={kapali} y={y} kim={kim} />
      <BeklemeKarti c={c} kapali={kapali} y={y} />
      <ErkenSevkKarti c={c} kapali={kapali} y={y} />
    </>
  );
}

type Y = (f: (z: Yaz) => boolean) => boolean;

function PlanMaliyetKarti({ b }: { b: MaliyetBaglami }) {
  const t = planMaliyeti(b);
  const sat: [Parameters<typeof Simge>[0]['ad'], string, number | null, string, boolean][] = [
    ['box', 'Malzeme', t.mal, 'kg fiyatı × fire dahil miktar', false], ['rotate', 'Talaş satışı', t.talas ? -t.talas : 0, 'malzemeden düşülür', false],
    ['cpu', 'İşleme', t.isl, 'tezgâh saat maliyeti', true], ['wrench', 'Ayar', t.ayar, 'tezgâh + ayarcı', true],
    ['layers', 'Genel gider', t.gg, 'tezgâh saati × yük oranı', true], ['truck', 'Fason', t.fas, 'fiyat + taşıma', true],
    ['clock', 'Ek mesai', t.mesTop, t.mesTop !== null && t.mesTop - t.mes > 1 ? `${tl(t.mesTop - t.mes)} işe düşmüyor` : 'vardiya × ücret × çarpan', true],
    ['pause', 'Bekleme finansmanı', t.fin, 'yarı mamul', true], ['lira', 'Erken tahsilat', t.tah, 'vade üretim bitince başlar', true],
    ['alert', 'Gecikme bedeli', t.gec, 'sipariş başına bedel × saat', true],
  ];
  const top = sat.reduce((a, x) => a + (x[2] ?? 0), 0);
  return (
    <AsilKart simge="chart" baslik="Bu planın bütün maliyeti">
      <div className="tc-tablo-kap">
        <table className="tc-tablo">
          <thead><tr><th>Kalem</th><th className="tc-pyk-num">TL</th><th>Plan amacında</th></tr></thead>
          <tbody>
            {sat.map(([sm, ad, v, alt, amac]) => (
              <tr key={ad}>
                <td><Simge ad={sm} boyut="k" /> {ad}<AltNot>{alt}</AltNot></td>
                <td className="tc-pyk-num"><b>{v === null ? tl(null) : tlEksi(v)}</b></td>
                <td>{amac ? <Rozet ton="tamam">evet</Rozet> : <Rozet ton="pasif">sabit</Rozet>}</td>
              </tr>
            ))}
            <tr className="tc-pyk-toplam"><td><b>Toplam</b></td><td className="tc-pyk-num"><b>{tl(top)}</b></td><td /></tr>
          </tbody>
        </table>
      </div>
      <Not>
        Siparişler sayfasındaki kâr aynı kalemlerden hesaplanır. Malzeme ve talaş plana göre değişmez (sabit); diğerleri plan amacına girer ve plan bunların toplamını en aza indirir.
        {t.eksik > 0 && <b> {String(t.eksik)} siparişin maliyeti eksik veri yüzünden tam değil.</b>}
        {!planGuncel(b.c) && ' Veri plandan sonra değişti; plan yeniden çözülünce güncellenir.'}
      </Not>
    </AsilKart>
  );
}

function TezgahKarti({ c, kapali, y }: { c: PlanlamaCalismasi; kapali: boolean; y: Y }) {
  const D = c.D;
  const Y = ymAyar(D);
  return (
    <AsilKart simge="cpu" baslik="Tezgâh saat maliyeti">
      <div className="tc-tablo-kap">
        <table className="tc-tablo">
          <thead><tr><th>Tezgâh</th><th>Grup</th><th className="tc-pyk-num">Makine TL/sa</th><th className="tc-pyk-num">Operatör payı</th><th className="tc-pyk-num">Toplam TL/sa</th></tr></thead>
          <tbody>
            {D.tezgahlar.map((m) => {
              const pay = m.opOran ?? 1;
              const op = Y.operatorUcret !== null ? Y.operatorUcret * pay : 0;
              return (
                <tr key={m.id}>
                  <td><b className="tc-pyk-mono">{m.id}</b><AltNot>{m.ad ?? ''}</AltNot></td>
                  <td>{m.grup ?? ''}</td>
                  <td className="tc-pyk-num"><SayiGir deger={m.ucret} ad={`${m.id} saat maliyeti`} adim={10} bosOlmaz kapali={kapali} yaz={(v) => v !== null && y((z) => tezUcretYaz(z, D, m.id, v))} /></td>
                  <td className="tc-pyk-num">{sayi(pay, 2)}</td>
                  <td className="tc-pyk-num"><b>{m.ucret === null || m.ucret === undefined ? '—' : sayi(m.ucret + op, 0)}</b></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <Not>Makine saat maliyeti doğrudan giderdir: enerji, bakım, sarf. Amortisman ve kira genel giderde durur (211 a). Operatör ücreti ayrıca girilirse operatör payıyla eklenir (yarım operatörlü tezgâhta yarısı); boşsa makine maliyetine dahil sayılır.</Not>
    </AsilKart>
  );
}

function IscilikKarti({ c, kapali, y, git }: { c: PlanlamaCalismasi; kapali: boolean; y: Y; git: (g: PlanlamaGorunumu) => void }) {
  const D = c.D;
  const Y = ymAyar(D);
  const A = ayarlar(D);
  const kalem = maliyetSistemi(D).kip === 'kalem';
  const kisi = mesaiSistemi(D).kisiBazli;
  const ort = kalem && baslangicMs(D) !== null ? genelGiderHesabi(c, takvimKur(c)).ort : null;
  return (
    <AsilKart simge="user" baslik="İşçilik ve mesai">
      <div className="tc-pyk-alanlar">
        <Alan ad="Ayarcı ücreti TL/sa"><SayiGir deger={sayiOf(A.ayarciUcret)} ad="Ayarcı ücreti" adim={10} max={100000} bosOlmaz kapali={kapali} yaz={(v) => v !== null && y((z) => ucretYaz(z, D, 'ayarciUcret', v))} /></Alan>
        <Alan ad="Operatör ücreti TL/sa"><SayiGir deger={Y.operatorUcret} ad="Operatör ücreti TL/sa" adim={10} yer="makineye dahil" kapali={kapali} yaz={(v) => y((z) => maliyetAyariYaz(z, D, 'operatorUcret', v))} /></Alan>
        {kisi
          ? <Alan ad="Mesai bedeli"><button type="button" className="tc-pyk-bag" onClick={() => { git('mesaiplan'); }}>kişi ücretinden, Ek mesai planı</button></Alan>
          : <>
            <Alan ad="Mesai ücreti TL/sa"><SayiGir deger={sayiOf(A.mesaiUcret)} ad="Mesai ücreti" adim={10} max={100000} bosOlmaz kapali={kapali} yaz={(v) => v !== null && y((z) => ucretYaz(z, D, 'mesaiUcret', v))} /></Alan>
            <Alan ad="Hafta sonu ve tatil mesai çarpanı"><SayiGir deger={Y.mesaiCarpan} ad="Hafta sonu ve tatil mesai çarpanı" min={1} max={3} yer="1" bosOlmaz kapali={kapali} yaz={(v) => y((z) => maliyetAyariYaz(z, D, 'mesaiCarpan', v))} /></Alan>
          </>}
        {kalem
          ? <Alan ad="Genel gider"><b className="tc-pyk-mono">{ort === null ? '—' : tlSaat(ort)} ort.</b><button type="button" className="tc-pyk-bag" onClick={() => { git('giderler'); }}>kalemlerden, tezgâh başına</button></Alan>
          : <Alan ad="Genel gider TL/tezgâh saati"><SayiGir deger={Y.genelGider} ad="Genel gider TL/tezgâh saati" adim={10} max={100000} yer="yok" kapali={kapali} yaz={(v) => y((z) => maliyetAyariYaz(z, D, 'genelGider', v))} /></Alan>}
        <Alan ad="Varsayılan hedef kâr oranı %"><SayiGir deger={Y.karHedef} ad="Varsayılan hedef kâr oranı %" max={300} bosOlmaz kapali={kapali} yaz={(v) => y((z) => maliyetAyariYaz(z, D, 'karHedef', v))} /></Alan>
      </div>
      <Not>Finansman oranı (%{sayi(agAyar(D).fin, 2)}/gün) Öncelik ve ağırlık sayfasındadır. Genel gider ürün maliyetinde ve teklifte sayılır, plan amacına girmez: kira ve amortisman iş hangi tezgâhta yapılırsa yapılsın aynıdır.</Not>
    </AsilKart>
  );
}

function FasonFiyatKarti({ c, kapali, y }: { c: PlanlamaCalismasi; kapali: boolean; y: Y }) {
  const D = c.D;
  const tal = fasonTalasId(D);
  return (
    <AsilKart simge="truck" baslik="Fason fiyatları">
      <div className="tc-tablo-kap">
        <table className="tc-tablo">
          <thead><tr><th>Fasoncu</th><th className="tc-pyk-num">Fiyat</th><th className="tc-pyk-num">Taşıma</th><th className="tc-pyk-num">Süre</th></tr></thead>
          <tbody>
            {(D.fasoncular ?? []).map((f) => {
              const k = fasonFiyatAlani(D, f.id);
              const ad = f.ad ?? f.id;
              return (
                <tr key={f.id}>
                  <td><b>{ad}</b><AltNot>{f.id}</AltNot></td>
                  <td className="tc-pyk-num">
                    <SayiGir deger={sayiOf(f[k])} ad={k === 'saatFiyat' ? `${ad} saat fiyatı` : `${ad} fiyatı`} kapali={kapali} yaz={(v) => y((z) => fasonAlanYaz(z, D, f.id, k, v))} />
                    {' '}<span className="tc-pyk-soluk">{f.id === tal && tal !== '' ? 'TL/sa' : 'TL/adet'}</span>
                  </td>
                  <td className="tc-pyk-num"><SayiGir deger={sayiOf(f.tasima)} ad={`${ad} taşıma`} yer="0" kapali={kapali} yaz={(v) => y((z) => fasonAlanYaz(z, D, f.id, 'tasima', v))} /> <span className="tc-pyk-soluk">TL/adet</span></td>
                  <td className="tc-pyk-num">{sayi(f.sureGun ?? null, 1)} gün</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <Not>Talaşlı fason tezgâh saatiyle fiyatlanır (işin en kısa tezgâh süresi × saat fiyatı).</Not>
    </AsilKart>
  );
}

function KgKarti({ c, kapali, y, kim }: { c: PlanlamaCalismasi; kapali: boolean; y: Y; kim: string }) {
  const D = c.D;
  const ml = malzemeler(D);
  const kg = kgFiyatlari(D) ?? [];
  const fiyatsiz = ml.filter((m) => birimMaliyet(D, m) === null);
  return (
    <AsilKart simge="box" baslik="Malzeme kg fiyatları">
      <div className="tc-tablo-kap">
        <table className="tc-tablo">
          <thead><tr><th>Cins</th><th>Kalite</th><th>Form</th><th className="tc-pyk-num">TL/kg</th><th className="tc-pyk-num">Fire %</th><th>Kullanan malzemeler</th><th>Güncelleme</th><th><span className="tc-gizli-etiket">İşlem</span></th></tr></thead>
          <tbody>
            {kg.length === 0 && <tr><td colSpan={8} className="tc-pyk-soluk">Fiyat yok.</td></tr>}
            {kg.map((r) => {
              const l = ml.filter((m) => kgSatiri(D, m)?.id === r.id);
              return (
                <tr key={r.id}>
                  <td>{r.cins || '—'}</td>
                  <td><b>{r.kalite}</b></td>
                  <td>{r.form || 'her form'}</td>
                  <td className="tc-pyk-num"><SayiGir deger={r.fiyat} ad={`${r.kalite} kg fiyatı`} bosOlmaz kapali={kapali} yaz={(v) => y((z) => kgAlanYaz(z, D, r.id, 'fiyat', v, kim))} /></td>
                  <td className="tc-pyk-num"><SayiGir deger={r.fire} ad={`${r.kalite} fire payı`} max={200} yer="0" kapali={kapali} yaz={(v) => y((z) => kgAlanYaz(z, D, r.id, 'fire', v, kim))} /></td>
                  <td>
                    {l.length
                      ? <span className="tc-pyk-cipler">{l.map((m) => { const bm = birimMaliyet(D, m); return <span key={m.kod} className="tc-pyk-cip" title={m.ad}>{m.kod} · {bm === null ? 'kg ağırlığı yok' : `${sayi(bm, 2)} TL/${m.birim}`}</span>; })}</span>
                      : <span className="tc-pyk-soluk">yok</span>}
                  </td>
                  <td><span className="tc-pyk-soluk">{r.tarih ?? '—'} · {r.kim}</span></td>
                  <td>{!l.length && !kapali && <Dugme simge="trash" aria-label="Sil" className="tc-pyk-ikon" onClick={() => { y((z) => kgSilYaz(z, D, r.id)); }} />}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {!kapali && <KgFormu c={c} y={y} kim={kim} />}
      <Not>
        Malzemenin birim maliyeti buradan anlık gelir: kalite ve form eşleşen satır, yoksa kalitenin "her form" satırı. Birimi kg olmayan malzemede bir birimin ağırlığı gerekir. Fire payı (talaş ve hurda) ihtiyacı büyütür; malzeme planı ve maliyet ikisi de bunu sayar.
        {fiyatsiz.length > 0 && <> <b>Kg fiyatı bulunmayan malzeme:</b> {fiyatsiz.map((m) => m.kod).join(', ')}.</>}
      </Not>
    </AsilKart>
  );
}

function KgFormu({ c, y, kim }: { c: PlanlamaCalismasi; y: Y; kim: string }) {
  const [hata, hataYaz] = useState<string | null>(null);
  const gonder = (o: FormEvent<HTMLFormElement>) => {
    o.preventDefault();
    const f = o.currentTarget;
    const al = (k: string): string => (f.elements.namedItem(k) as HTMLInputElement | HTMLSelectElement | null)?.value ?? '';
    const kal = al('kalite').trim(), fo = al('form');
    const fi = sayiGirdisi(al('fiyat'));
    if (!kal) { hataYaz('Kalite yazın.'); return; }
    if (!fi.tamam || fi.deger === null || !(fi.deger > 0)) { hataYaz('Kg fiyatı girin.'); return; }
    if (kgVarMi(c.D, kal, fo)) { hataYaz('Bu kalite ve form için fiyat zaten var.'); return; }
    const v = fi.deger;
    if (y((z) => kgEkleYaz(z, { cins: al('cins'), kalite: kal, form: fo, fiyat: v }, kim))) { hataYaz(null); f.reset(); }
  };
  return (
    <form className="tc-pyk-yeni" noValidate onSubmit={gonder} aria-label="Kg fiyatı ekle">
      <select className="tc-alan-kutu" name="cins" aria-label="Cins">{ML_CINS.map((x) => <option key={x}>{x}</option>)}</select>
      <input className="tc-alan-kutu" name="kalite" placeholder="Kalite" aria-label="Kalite" required />
      <select className="tc-alan-kutu" name="form" aria-label="Form"><option value="">Her form</option>{ML_FORM.map((x) => <option key={x}>{x}</option>)}</select>
      <input className="tc-alan-kutu" name="fiyat" inputMode="decimal" placeholder="TL/kg" aria-label="TL/kg" required />
      <Dugme type="submit" tur="birincil" simge="plus">Ekle</Dugme>
      {hata && <p className="tc-pyk-ileti" role="alert"><Simge ad="alert" boyut="k" />{hata}</p>}
    </form>
  );
}

function TalasKarti({ c, kapali, y, kim }: { c: PlanlamaCalismasi; kapali: boolean; y: Y; kim: string }) {
  const D = c.D;
  const kg = kgFiyatlari(D) ?? [];
  const l = [...talasFiyatlari(D)].sort((a, b) => a.cins.localeCompare(b.cins, 'tr') || a.kalite.localeCompare(b.kalite, 'tr'));
  return (
    <AsilKart simge="rotate" baslik="Malzeme talaş satış fiyatları">
      <div className="tc-tablo-kap">
        <table className="tc-tablo">
          <thead><tr><th>Cins</th><th>Kalite</th><th className="tc-pyk-num">Talaş TL/kg</th><th className="tc-pyk-num">Hammadde oranı</th><th>Güncelleme</th></tr></thead>
          <tbody>
            {l.length === 0 && <tr><td colSpan={5} className="tc-pyk-soluk">Kg fiyatı girilen kalite yok.</td></tr>}
            {l.map((t) => {
              const f = kg.filter((r) => norm(r.kalite) === norm(t.kalite) && r.fiyat !== null).map((r) => r.fiyat as number);
              const kf = f.length ? Math.min(...f) : null;
              return (
                <tr key={t.kalite}>
                  <td>{t.cins || '—'}</td>
                  <td><b>{t.kalite}</b></td>
                  <td className="tc-pyk-num"><SayiGir deger={t.fiyat} ad={`${t.kalite} talaş satış fiyatı`} kapali={kapali} yaz={(v) => y((z) => talasYaz(z, D, t.kalite, v, kim))} /></td>
                  <td className="tc-pyk-num">{kf && t.fiyat !== null ? yuzde(t.fiyat / kf) : '—'}</td>
                  <td><span className="tc-pyk-soluk">{t.tarih ?? '—'} · {t.kim}</span></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <Not>Kalite başına tek fiyat; kg fiyatı eklenen her kalite burada da görünür. Talaşın değeri malzeme maliyetinden düşülür: (hammadde kg × (1 + fire) − net parça kg) × adet × talaş fiyatı (214 a). Hammadde oranı talaş fiyatının en düşük kg fiyatına oranıdır.</Not>
    </AsilKart>
  );
}

function BeklemeKarti({ c, kapali, y }: { c: PlanlamaCalismasi; kapali: boolean; y: Y }) {
  const D = c.D;
  const w = wipAyar(D);
  const f = agAyar(D).fin;
  return (
    <AsilKart simge="pause" baslik="Bekleme maliyeti">
      <div className="tc-pyk-sira"><span>Plan amacına katılsın</span><Segment ad="Bekleme maliyeti plan amacında" secenek={[['1', 'Açık'], ['0', 'Kapalı']]} deger={w.ac ? '1' : '0'} kapali={kapali} sec={(v) => { y((z) => beklemeAcikYaz(z, v === '1')); }} /></div>
      <div className="tc-pyk-sira"><span>Ödeme vadesi başlar</span><Segment ad="Ödeme vadesi başlangıcı" secenek={[['bitis', 'Üretim bitince'], ['termin', 'Terminde']]} deger={w.vadeBas} kapali={kapali} sec={(v) => { y((z) => vadeBasYaz(z, v === 'bitis' ? 'bitis' : 'termin')); }} /></div>
      <Not>{w.vadeBas === 'termin' ? 'Erken biten iş termine kadar bekler; bekleyen değerin finansmanı maliyettir.' : 'Erken biten iş teslim edilir ve vade o gün başlar: termine kalan gün kadar ödeme erken gelir, tutar × finansman oranı × gün kazanılır. Bu kazanç plan amacında eksi maliyet olarak sayılır.'}</Not>
      <Not>Bekleme süresi plandan çıkar, sabit bir rota değeri değildir: malzemenin hazır olmasından ilk adıma, bir adımın bitişinden sonrakinin başlamasına ve son adımdan termine kadar. Bekleyen değer malzeme ile o ana kadar biten adımların maliyetidir. Finansman oranı %{sayi(f, 2)}/gün (aylık %{sayi(f * 30, 1)}, yıllık %{sayi(f * 365, 0)}); Öncelik ve ağırlık sayfasındaki oranın aynısıdır.</Not>
      <Not>Alan ve iç taşıma genel giderde kalır; bozulma riski ayrıca eklenmez, hurda payıyla karşılanır (212 a).</Not>
      <div className="tc-tablo-kap">
        <table className="tc-tablo">
          <thead><tr><th>Ürün</th><th className="tc-pyk-num">Net parça kg</th></tr></thead>
          <tbody>
            {D.urunler.map((u) => (
              <tr key={u.id}>
                <td><b className="tc-pyk-mono">{u.id}</b><AltNot>{u.ad ?? ''}</AltNot></td>
                <td className="tc-pyk-num"><SayiGir deger={sayiOf(u.netKg)} ad={`${u.id} Net parça kg`} kapali={kapali} yaz={(v) => y((z) => netKgYaz(z, D, u.id, v))} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Not>Net parça ağırlığı talaş için gerekir: hammadde ağırlığı (fire dahil) ile net ağırlık farkı, kg fiyatları tablosundaki talaş satış fiyatıyla malzeme maliyetinden düşülür (214 a).</Not>
    </AsilKart>
  );
}

function ErkenSevkKarti({ c, kapali, y }: { c: PlanlamaCalismasi; kapali: boolean; y: Y }) {
  const D = c.D;
  const l = D.siparisler.filter((s) => !s.havuz);
  return (
    <AsilKart simge="truck" baslik="Erken sevk kabul eden siparişler">
      <Not>İşaretli siparişte müşteri malı termin öncesi alır ve fatura teslimde başlar: erken biten işin ödemesi erken gelir. İşaretsizde vade terminde başlar. Varsayılan işaretsiz.</Not>
      <div className="tc-pyk-es">
        {l.map((s) => (
          <label key={s.id} className="tc-pyk-es-sip">
            <input type="checkbox" checked={s.erkenSevk === true} disabled={kapali} onChange={(o) => { y((z) => erkenSevkYaz(z, D, s.id, o.currentTarget.checked)); }} />
            <span className="tc-pyk-mono">{s.id}</span>
          </label>
        ))}
      </div>
    </AsilKart>
  );
}
