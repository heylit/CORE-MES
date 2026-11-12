import { useRef, useState } from 'react';
import { Dugme, Kart, Simge } from '../../../../ortak/arayuz/index.ts';
import { planGuncel } from '../durum.ts';
import type { PlanlamaEkranOzellikleri } from '../gorunumler.ts';
import type { CalismaKomutu } from '../kayit.ts';
import type { PlanlamaCalismasi } from '../tipler.ts';
import { FormluAcilim } from './AcilimFormu.tsx';
import { PlanSecenekleriKarti, TeklifKarti, TerminUzatmaKarti, useGorunumDegerlendiricisi } from './Degerlendirme.tsx';
import { BosHarita, GorunumBasligi, IsiIzgarasi, Lejant, TumSatirlar, type Secim } from './IsiHaritasi.tsx';
import {
  dengeAcilimi, dengeAdi, dengeEtkin, dengeIsisi, dengeKatYazi, kayitliPlan, planDengesi, siparisMaliyetleri, type DengeSatiri,
} from './kurallar.ts';
import { useEmirNo } from '../ortak/emir-no.ts';

// Termin ve kâr (denge): sipariş × termin uzatması (zz30-isi ISI.denge), "Tüm satırlar"da plan dengesi çubuğu ve motorla hesaplanan kartlar
// (zw-denge sDenge). Plan seçenekleri, teklif ve uzatma önerisi motoru birkaç kez koşturur; hesap sunucunun değerlendirme ucundadır.
// "Motorla ölç" ayrı hesap açmaz: Tüm satırlardaki uzatma önerisi kartını açıp oraya götürür, ölçüm orada istenir (2171). Termin uzatması siparişin terminini yazar; termin Üretim emirlerinden gelir, form yerinde pasif (222 a,
// Soru 466/1 a). Görünüm maliyet okumasıyla açılır (gorunumAcik).

const UZAT_SAHIBI = 'Termin Üretim emirlerinde değiştirilir; plan yeniden çözülünce yeni terminle yerleşir.';
const MOTORLA_OLC = 'Uzatma etkisini motorla ölç';

const OLCEK = [0, 25, 50, 75, 100] as const;

function DengeCubugu({ c, komut, yazabilir }: { c: PlanlamaCalismasi; komut: CalismaKomutu | null; yazabilir: boolean }) {
  const d0 = planDengesi(c); const etkin = dengeEtkin(c.D);
  const [d, dYaz] = useState(d0);
  const [onceki, oncekiYaz] = useState(d0);
  if (onceki !== d0) { oncekiYaz(d0); dYaz(d0); }
  const acik = yazabilir && etkin && komut !== null;
  const bitir = () => {
    if (!komut || d === d0) return;
    komut.degistir('Plan dengesi değişti', (t) => { (t.D as Record<string, unknown>).planDenge = d; }, { ayrinti: `${dengeAdi(d0)} ${dengeKatYazi(d0)} → ${dengeAdi(d)} ${dengeKatYazi(d)}` });
  };
  return (
    <Kart baslik="Plan dengesi" simge="gauge">
      <div className="tc-pys-cubuk">
        <div className="tc-pys-cubuk-uc"><span><Simge ad="clock" boyut="k" />Termin önce</span><span>Kâr önce<Simge ad="lira" boyut="k" /></span></div>
        <input
          type="range" min={0} max={100} step={5} value={d} disabled={!acik} aria-label="Plan dengesi: termin ile kâr arası"
          onChange={(e) => { dYaz(Number(e.target.value)); }} onPointerUp={bitir} onKeyUp={bitir} onBlur={bitir}
        />
        <div className="tc-pys-cubuk-olcek" aria-hidden="true">{OLCEK.map((x) => <span key={x}>{dengeKatYazi(x)}</span>)}</div>
      </div>
      <p className="tc-pys-deger"><b>{dengeAdi(d)}</b> <span className="mono">gecikme bedeli {dengeKatYazi(d)}</span></p>
      <p className="tc-pys-kucuk">
        Plan, gecikme bedeli ile maliyetlerin toplamını en aza indirir. Çubuk termine kaydıkça bir saatlik gecikme amaçta daha pahalı sayılır: plan ek fason ya
        da pahalı tezgâhla da olsa yetiştirmeye çalışır. Kâra kaydıkça ucuz yol seçilir, gecikme kabul edilir. Ortada gecikme gerçek bedeliyle sayılır.
        Gösterilen tutarlar her zaman gerçek TL'dir.
      </p>
      {!etkin && (
        <p className="tc-pys-kucuk"><b>Çubuk etkisizdir: plan sırasına ve ağırlığına yalnız üretim emrinin önceliği girer.</b> Gecikme bedeli amaçta sayılmaz.</p>
      )}
      {!yazabilir && <p className="tc-pys-kucuk"><Simge ad="lock" boyut="k" /> Plan dengesini müdür ve yönetici ayarlar.</p>}
      {c.plan !== null && !planGuncel(c) && <p className="tc-pys-kucuk">Denge plandan sonra değişti; plan yeniden çözülünce uygulanır.</p>}
    </Kart>
  );
}

export function TerminVeKar({ calisma, komut, yetki, git, depo, yenile }: PlanlamaEkranOzellikleri) {
  const [secim, secimYaz] = useState<Secim | null>(null);
  const p = kayitliPlan(calisma);
  // Dengeyi eski sayfada müdür ve yönetici değiştirirdi (fiyat görür ve plan.kilitle); 223 a: fiyat görme maliyet okuma, sayfa içi kilit plan.yaz.
  const yazabilir = yetki.maliyetOku && yetki.planYaz;
  const degerlendir = useGorunumDegerlendiricisi(depo, komut);
  const emirNo = useEmirNo(depo.receteRotaKaydi, depo.durum?.emirler);
  const uzatma = useRef<HTMLDivElement>(null);
  const olc = () => {
    const el = uzatma.current; if (!el) return;
    const d = el.closest('details'); if (d) d.open = true;
    const az = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.scrollIntoView?.({ behavior: az ? 'auto' : 'smooth', block: 'start' });
    el.querySelector<HTMLElement>('button')?.focus({ preventScroll: true });
  };

  const tum = calisma && (
    <TumSatirlar>
      <DengeCubugu c={calisma} komut={komut} yazabilir={yazabilir} />
      <PlanSecenekleriKarti degerlendir={degerlendir} yenile={yenile} komut={komut} alabilir={yazabilir} kim={depo.ben.kisi.ad} simdikiDenge={planDengesi(calisma)} />
      <TeklifKarti siparisler={calisma.D.siparisler} degerlendir={degerlendir} yenile={yenile} />
      <div ref={uzatma} data-parca="uzatma"><TerminUzatmaKarti planVar={p !== null} degerlendir={degerlendir} yenile={yenile} /></div>
    </TumSatirlar>
  );

  if (!calisma || !p) {
    return (
      <div className="tc-pys" data-parca="denge">
        <GorunumBasligi simge="gauge" baslik="Termin ve kâr dengesi" />
        <BosHarita metin="Plan kurulunca geç biten siparişler ve termin uzatmasının etkisi burada görünür.">
          {yetki.planYaz && <Dugme tur="birincil" simge="play" onClick={() => { git('plan'); }}>Planı kur</Dugme>}
        </BosHarita>
        {tum}
      </div>
    );
  }

  const V = dengeIsisi(calisma.D, p, yetki.maliyetOku ? siparisMaliyetleri(calisma, depo.durum?.emirler ?? null) : null, emirNo);
  const acilim = (r: DengeSatiri, ck: string) => {
    const A = dengeAcilimi(r, ck, V.sutunlar.find((x) => x.k === ck)?.ad ?? '');
    return (
      <FormluAcilim
        key={`${r.k}|${ck}`} baslik={A.baslik} simge="gauge" ton={A.ton} neden={A.neden} kapat={() => { secimYaz(null); }}
        formlar={[{ ad: `Termini ${String(A.gun)} gün uzat`, etki: 'Müşterinin kabul ettiği uzatma termine yazılır.', simge: 'flag', tanim: null, deg: { sip: r.ad, gun: String(A.gun) }, kapali: UZAT_SAHIBI }]}
        secenekler={[
          { ad: MOTORLA_OLC, etki: 'Her siparişe uzatmayı tek tek dener, diğerlerinin yeniden yerleşmesiyle ölçer.', simge: 'play', yap: () => { secimYaz(null); olc(); } },
          { ad: `${r.ad} çizelgede`, etki: 'Siparişin adımlarını tezgâh çizelgesinde gösterir.', simge: 'gantt', yap: () => { git('plan'); } },
        ]}
      />
    );
  };

  return (
    <div className="tc-pys" data-parca="denge">
      <GorunumBasligi
        simge="gauge" baslik="Termin ve kâr dengesi" alt="Sipariş × termin uzatması, kalan gecikme" ust={V.ust}
        eylem={V.yalnizGec ? <Dugme simge="play" onClick={olc} title="Uzatma önerisi kartını açar; ölçüm sunucudaki motorla yapılır.">{MOTORLA_OLC}</Dugme> : undefined}
      />
      <section className="tc-pys-ana" aria-label="Isı haritası">
        <Lejant ogeler={[{ tur: 'kd', kd: 1, ad: '8 saatten az' }, { tur: 'kd', kd: 2, ad: 'Bir güne kadar' }, { tur: 'kd', kd: 3, ad: 'Üç güne kadar' }, { tur: 'kd', kd: 4, ad: 'Üç günden çok' }, { tur: 'iyi', ad: 'Zamanında' }]} />
        {V.satirlar.length
          ? <IsiIzgarasi etiket="Sipariş × termin uzatması, kalan gecikme" satirAd="Sipariş" genis="kalem" sutunlar={V.sutunlar} satirlar={V.satirlar} secim={secim} sec={secimYaz} acilim={acilim} />
          : <BosHarita metin="Terminli sipariş yok." />}
        <p className="tc-pys-kucuk">Uzatma sütunları kalan gecikmeyi şimdiki plandan hesaplar (gecikme eksi uzatma); diğer siparişlerin yeniden yerleşmesi motorla ölçülünce görünür.</p>
      </section>
      {tum}
    </div>
  );
}
