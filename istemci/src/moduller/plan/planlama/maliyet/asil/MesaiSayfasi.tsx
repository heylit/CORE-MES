import { Dugme, Rozet, Simge } from '../../../../../ortak/arayuz/index.ts';
import type { PlanlamaCalismasi } from '../../tipler.ts';
import {
  ekMesailer, GUN_TURU_ADI, gunYaz, kisiSaati, mesaiAtamasi, mesaiBedeli, mesaiSistemi, mesaiUcreti, pdDenge, pdKat, sayi, sayiOku, tl, tlSaat,
  vardiyaSaati, ymAyar, type GunTuru, type Takvim,
} from '../kurallar.ts';
import { carpanYaz, ekMesaiKaldirYaz, kisiBazliYaz, kisiUcretYaz, kisiYilYaz, mesaiKarariBul, mesaiKararlari, mesaiKuralYaz, type MesaiKurali, type Yaz } from '../yazmalar.ts';
import { Alan, AltNot, AsilKart, Kpi, MOTOR_KAPALI, Not, SayiGir, Segment } from './girdi.tsx';

// Ek mesai planının "Tüm satırlar"ı: bugünkü sayfanın kartları (zu-yan-sayfalar sMesaiPlani, zz6 msMesaiKartlar). Önerileri plan motoru
// hesaplar; motor tarayıcıda yoktur, kart görünür ve düğmesi kapalıdır (357 b).

type Y = (f: (z: Yaz) => boolean) => boolean;
// Motor varsayılanı (engine.betik W0.mesaiHafta); Kısıtlar sayfasında değişir.
const MESAI_HAFTA0 = 8;
const katYaz = (d: number): string => { const k = pdKat(d); return `×${sayi(k, k >= 10 ? 0 : 2)}`; };

export function MesaiSayfasi({ c, T, para, yaz }: { c: PlanlamaCalismasi; T: Takvim | null; para: boolean; yaz: Yaz | null }) {
  const D = c.D;
  const m = mesaiSistemi(D);
  const Y = ymAyar(D);
  const EK = ekMesailer(c);
  const y: Y = (f) => (yaz ? f(yaz) : false);
  const bedel = (i: number): number | null => { const e = EK[i]; return T && e ? mesaiBedeli(c, T, e) : null; };
  const tlL = EK.map((_, i) => bedel(i));
  const topTL = tlL.some((x) => x === null) ? null : tlL.reduce<number>((a, x) => a + (x ?? 0), 0);
  const topH = EK.reduce((a, e) => a + vardiyaSaati(D, e.vardiya), 0);
  const butce = sayiOku(c.param.mesaiHafta) ?? MESAI_HAFTA0;
  const red = mesaiKararlari(D).filter((k) => k.karar === 'red').length;
  return (
    <>
      <AsilKart simge="clock" baslik="Ek mesai planı">
        <Kpi l={[
          ['clock', 'Planlı ek mesai', `${sayi(topH, 1)} sa`, `${String(EK.length)} vardiya`],
          ['lira', 'Mesai maliyeti', para ? tl(topTL) : 'müdürde', m.kisiBazli ? 'kişi ücretinden, gün türüne göre çarpan' : `${sayi(mesaiUcreti(D), 0)} TL/sa, hafta sonu ×${sayi(Y.mesaiCarpan, 1)}`],
          ['gauge', 'Haftalık sınır', butce ? `${sayi(butce, 0)} sa` : 'yok', 'Kısıtlar sayfasında'],
        ]} />
        <div className="tc-tablo-kap">
          <table className="tc-tablo">
            <thead><tr><th>Tezgâh</th><th>Gün</th><th>Vardiya</th>{para && <th className="tc-pyk-num">Maliyet</th>}<th>Karar</th><th><span className="tc-gizli-etiket">İşlem</span></th></tr></thead>
            <tbody>
              {EK.length === 0 && <tr><td colSpan={6} className="tc-pyk-soluk">Planlı ek mesai yok.</td></tr>}
              {EK.map((e, i) => {
                const k = mesaiKarariBul(D, e);
                const ad = `${e.m} ${gunYaz(D, e.gun * 24)} ${e.vardiya}`;
                return (
                  <tr key={`${e.m}-${String(e.gun)}-${e.vardiya}-${String(i)}`}>
                    <td><b className="tc-pyk-mono">{e.m}</b></td>
                    <td>{gunYaz(D, e.gun * 24)}</td>
                    <td>{e.vardiya} · {sayi(vardiyaSaati(D, e.vardiya), 1)} sa</td>
                    {para && <td className="tc-pyk-num">{tl(bedel(i))}</td>}
                    <td>{k ? <><Rozet ton="tamam">Kabul</Rozet> <span className="tc-pyk-soluk">{k.kim}{k.net !== null && para ? ` · net ${tl(k.net)}` : ''}</span></> : <Rozet ton="pasif">Elle girildi</Rozet>}</td>
                    <td>{yaz && <Dugme simge="trash" aria-label={`${ad} ek mesaisini kaldır`} className="tc-pyk-ikon" onClick={() => { y((z) => ekMesaiKaldirYaz(z, i, ad)); }} />}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </AsilKart>
      <AsilKart simge="target" baslik="Plan önerisi" eylem={<Dugme simge="play" disabled title={MOTOR_KAPALI}>Önerileri hesapla</Dugme>}>
        <Not>Öneri için güncel plan gerekir. Plan, darboğaz tezgâhlara ek vardiya açmayı tek tek dener ve her birini motorla ölçer. {MOTOR_KAPALI}</Not>
        <Not>Darboğaz tezgâhın 1 saatinin değeri, orada tamponsuz kalan geç işlerin gecikme bedelleri toplamıdır. Net kazanç = önlenen gecikme bedeli × plan dengesi çarpanı ({katYaz(pdDenge(D))}, Termin ve kâr sayfası) − mesai maliyeti − ayar ve işleme farkı; artıysa plan "açılsın" der. Kabul edilen mesai planın takvimine girer, plan yeniden çözülünce kullanılır. Reddedilen öneri tekrar gelmez{red ? ` (${String(red)} red)` : ''}.</Not>
      </AsilKart>
      <div className="tc-pyk-ms">
        <AtamaKarti c={c} T={T} para={para} />
        <KisiKarti c={c} para={para} kapali={!yaz || !para} y={y} />
        {para && <KuralKarti c={c} kapali={!yaz} y={y} />}
      </div>
    </>
  );
}

function AtamaKarti({ c, T, para }: { c: PlanlamaCalismasi; T: Takvim | null; para: boolean }) {
  const D = c.D;
  const m = mesaiSistemi(D);
  const at = mesaiAtamasi(c);
  const ihlalN = at.liste.filter((a) => a.ihlal.length).length;
  return (
    <AsilKart simge="user" baslik="Ek vardiyaya kim gelir">
      {ihlalN > 0 && <p className="tc-pyk-ileti"><Simge ad="alert" boyut="k" /> {ihlalN} ek vardiyada sınır aşımı ya da eksik kişi var; vardiya bu hâliyle yasal ya da uygulanabilir olmayabilir.</p>}
      <div className="tc-tablo-kap">
        <table className="tc-tablo">
          <thead><tr><th>Ek vardiya</th><th>Kişiler</th>{para && <th className="tc-pyk-num">Bedel</th>}<th>Denetim</th></tr></thead>
          <tbody>
            {at.liste.length === 0 && <tr><td colSpan={4} className="tc-pyk-soluk">Planlı ek mesai yok.</td></tr>}
            {at.liste.map((a) => (
              <tr key={`${a.e.m}-${String(a.e.gun)}-${a.e.vardiya}-${String(a.i)}`} data-uyari={a.ihlal.length ? '' : undefined}>
                <td><b className="tc-pyk-mono">{a.e.m}</b> <span className="tc-pyk-soluk">{gunYaz(D, a.e.gun * 24)} · {a.e.vardiya} {sayi(a.h, 1)} sa · {GUN_TURU_ADI[a.tur]}</span></td>
                <td>{a.kisiler.length ? a.kisiler.map((p) => p.ad).join(', ') : <span className="tc-pyk-soluk">atanamadı</span>}</td>
                {para && <td className="tc-pyk-num">{tl(T ? mesaiBedeli(c, T, a.e) : null)}<AltNot>×{sayi(m.carp[a.tur], 1)}</AltNot></td>}
                <td>{a.ihlal.length ? <span className="tc-pyk-ileti"><Simge ad="alert" boyut="k" /> {a.ihlal.join('; ')}</span> : <Rozet ton="tamam">Uygun</Rozet>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Not>Her ek vardiyaya tezgâhın grubunda yetkin, o gün izinli olmayan, aynı vardiyada zaten çalışmayan ve bu yıl en az fazla mesai yapmış kişi atanır (operatör oranı kadar). Hafta içi gündüz vardiyasından çıkan kişi aynı gün 8 saatlik ek vardiyaya kalırsa günlük sınır aşılır; bu yüzden hafta içi ek vardiya çoğunlukla başka vardiyanın kişisiyle ya da kısa mesaiyle kurulur.</Not>
    </AsilKart>
  );
}

function KisiKarti({ c, para, kapali, y }: { c: PlanlamaCalismasi; para: boolean; kapali: boolean; y: Y }) {
  const D = c.D;
  const m = mesaiSistemi(D);
  const at = mesaiAtamasi(c);
  return (
    <AsilKart simge="user" baslik="Kişi ücretleri ve fazla mesai sayacı">
      <div className="tc-tablo-kap">
        <table className="tc-tablo">
          <thead><tr><th>Kişi</th>{para && <><th className="tc-pyk-num">Brüt aylık</th><th className="tc-pyk-num">Saat maliyeti</th></>}<th className="tc-pyk-num">Bu yıl yapılan</th><th className="tc-pyk-num">Planlı</th><th className="tc-pyk-num">Yıllık sınıra kalan</th></tr></thead>
          <tbody>
            {(D.personel ?? []).map((p) => {
              const u = m.ucret[p.id];
              const s = kisiSaati(p.id, m);
              const plan = at.plan[p.id] ?? 0;
              const topl = (u?.yil ?? 0) + plan;
              const asim = topl > m.yillikSinir;
              const ad = p.ad ?? p.id;
              return (
                <tr key={p.id} data-uyari={asim ? '' : undefined}>
                  <td><b>{ad}</b><AltNot>{p.vardiya ?? ''} · {(p.gruplar ?? []).join(', ')}{p.ayar ? ' · ayarcı' : ''}</AltNot></td>
                  {para && <>
                    <td className="tc-pyk-num"><SayiGir deger={u?.brut ?? null} ad={`${ad} brüt ücreti`} kapali={kapali} yaz={(v) => y((z) => kisiUcretYaz(z, D, p.id, v))} /></td>
                    <td className="tc-pyk-num">{s === null ? '—' : tlSaat(s)}<AltNot>fazla mesai {s === null ? '—' : tlSaat(s * m.carp.hi)}</AltNot></td>
                  </>}
                  <td className="tc-pyk-num"><SayiGir deger={u?.yil ?? null} ad={`${ad} bu yıl yaptığı fazla mesai`} max={2000} kapali={kapali} yaz={(v) => y((z) => kisiYilYaz(z, D, p.id, v))} /></td>
                  <td className="tc-pyk-num">{sayi(plan, 1)} sa</td>
                  <td className="tc-pyk-num"><b data-ton={asim ? 'hata' : undefined}>{sayi(m.yillikSinir - topl, 0)} sa</b></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <Not>Saat maliyeti = brüt × (1 + SGK işveren payı + yan hak) / aylık ücret saati. Ücretleri müdür ve yönetici görür. "Bu yıl yapılan" bordrodan girilir; uygulamada PDKS ve İK kayıtlarından gelmelidir.</Not>
    </AsilKart>
  );
}

const KURAL: [MesaiKurali, string, { min?: number; max?: number }][] = [
  ['aylikSaat', 'Aylık ücret saati', { min: 100, max: 300 }], ['sgk', 'SGK işveren payı %', { max: 60 }], ['yanHak', 'Yan haklar %', { max: 100 }],
  ['kisiEk', 'Yemek ve servis TL/kişi', { max: 10000 }],
];
const SINIR: [MesaiKurali, string, { min?: number; max?: number }][] = [
  ['gunlukSinir', 'Günlük çalışma sınırı sa', { min: 1, max: 24 }], ['geceSinir', 'Gece çalışma sınırı sa', { min: 1, max: 24 }], ['yillikSinir', 'Yıllık fazla mesai sınırı sa', { min: 0, max: 2000 }],
];
const CARP: [GunTuru, string][] = [['hi', 'Hafta içi çarpanı'], ['cmt', 'Cumartesi çarpanı'], ['paz', 'Pazar çarpanı'], ['tatil', 'Resmî tatil çarpanı']];

function KuralKarti({ c, kapali, y }: { c: PlanlamaCalismasi; kapali: boolean; y: Y }) {
  const D = c.D;
  const m = mesaiSistemi(D);
  const kural = ([k, ad, o]: (typeof KURAL)[number]) => (
    <Alan key={k} ad={ad}><SayiGir deger={m[k] as number | null} ad={ad} min={o.min} max={o.max} bosOlmaz kapali={kapali} yaz={(v) => v !== null && y((z) => mesaiKuralYaz(z, D, k, v))} /></Alan>
  );
  return (
    <AsilKart simge="book" baslik="Mesai kuralları">
      <div className="tc-pyk-sira">
        <Segment ad="Mesai bedeli" secenek={[['1', 'Kişi ücretinden'], ['0', 'Tek mesai ücreti']]} deger={m.kisiBazli ? '1' : '0'} kapali={kapali} sec={(v) => { y((z) => kisiBazliYaz(z, v === '1')); }} />
      </div>
      <div className="tc-pyk-alanlar">
        {KURAL.map(kural)}
        {CARP.map(([k, ad]) => (
          <Alan key={k} ad={ad}><SayiGir deger={m.carp[k]} ad={ad} min={1} max={4} bosOlmaz kapali={kapali} yaz={(v) => v !== null && y((z) => carpanYaz(z, D, k, v))} /></Alan>
        ))}
        {SINIR.map(kural)}
      </div>
      <Not>Varsayılanlar 4857 sayılı İş Kanunu'ndan bilinen değerlerdir (fazla çalışmada %50 zam, günlük 11 saat, gece 7,5 saat, yılda 270 saat); bu denemede belgeden doğrulanmadı. Pazar ve tatil çarpanları işyeri uygulamasına göre değişir; İK ve toplu sözleşmeyle kontrol edin. Ek vardiyanın bedeli = saat × operatör oranı × grubun ortalama saat maliyeti × gün çarpanı + yemek ve servis.</Not>
    </AsilKart>
  );
}
