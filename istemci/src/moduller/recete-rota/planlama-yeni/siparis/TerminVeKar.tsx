import { useState } from 'react';
import { Dugme, Kart, Simge } from '../../../../ortak/arayuz/index.ts';
import { planGuncel } from '../durum.ts';
import type { PlanlamaEkranOzellikleri } from '../gorunumler.ts';
import type { CalismaKomutu } from '../kayit.ts';
import type { PlanlamaCalismasi } from '../tipler.ts';
import { DegerlendirmeKarti, PlanSecenekleri, TerminSecenekleriKarti, TerminUzatmaKarti, gorunumDegerlendiricisi } from './Degerlendirme.tsx';
import { Acilim, BosHarita, GorunumBasligi, IsiIzgarasi, Lejant, TumSatirlar, type Secim } from './IsiHaritasi.tsx';
import {
  dengeAcilimi, dengeAdi, dengeEtkin, dengeIsisi, dengeKatYazi, kayitliPlan, planDengesi, type DengeSatiri,
} from './kurallar.ts';

// Termin ve kâr (denge): sipariş × termin uzatması (zz30-isi ISI.denge), "Tüm satırlar"da plan dengesi çubuğu ve motorla hesaplanan kartlar
// (zw-denge sDenge). Plan seçenekleri, teklif ve uzatma önerisi motoru birkaç kez koşturur; kapalı gelir (357 b). Termin uzatması
// siparişin terminini yazar; termin Üretim emirlerinden gelir (222 a). Görünüm maliyet okumasıyla açılır (gorunumAcik).

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
    <Kart baslik="Plan dengesi">
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
        <p className="tc-pys-kucuk"><b>Çubuk yalnız plan amacı "Tek TL toplamı" ve ağırlık kipi "bedel" iken etkilidir</b> (Maliyetler ve Öncelik ve ağırlık sayfaları).</p>
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
  const degerlendir = gorunumDegerlendiricisi(depo);
  const secilebilir = (calisma?.D.siparisler ?? []).map((x) => ({ id: x.id, ad: x.ad ?? x.id, adet: x.adet }));

  const tum = calisma && (
    <TumSatirlar>
      <DengeCubugu c={calisma} komut={komut} yazabilir={yazabilir} />
      <DegerlendirmeKarti baslik="Plan seçenekleri" ne="Aynı veriyle termin önce, dengeli ve kâr önce planlar kurulur, ek mesai adaylarıyla birlikte yan yana karşılaştırılır; seçilen plan çalışmaya alınır." istek={{ tur: 'plan-secenekleri' }} degerlendir={degerlendir} yenile={yenile}>
        {(c) => <PlanSecenekleri cevap={c} komut={komut} alabilir={yetki.planYaz} kim={depo.ben.kisi.ad} />}
      </DegerlendirmeKarti>
      <TerminSecenekleriKarti siparisler={secilebilir} degerlendir={degerlendir} yenile={yenile} />
      <TerminUzatmaKarti degerlendir={degerlendir} yenile={yenile} />
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

  const V = dengeIsisi(calisma.D, p);
  const acilim = (r: DengeSatiri, ck: string) => {
    const A = dengeAcilimi(r, ck, V.sutunlar.find((x) => x.k === ck)?.ad ?? '');
    return (
      <Acilim
        baslik={A.baslik} ton={A.ton} neden={A.neden} kapat={() => { secimYaz(null); }}
        form={<p className="tc-pys-kucuk">Müşteri uzatmayı kabul ederse termin Üretim emirlerinde değiştirilir; plan yeniden çözülünce yeni terminle yerleşir.</p>}
      />
    );
  };

  return (
    <div className="tc-pys" data-parca="denge">
      <GorunumBasligi simge="gauge" baslik="Termin ve kâr dengesi" alt="Sipariş × termin uzatması, kalan gecikme" ust={V.ust} />
      <section className="tc-pys-ana" aria-label="Isı haritası">
        <Lejant ogeler={[{ tur: 'kd', kd: 1, ad: '8 saatten az' }, { tur: 'kd', kd: 2, ad: 'Bir güne kadar' }, { tur: 'kd', kd: 3, ad: 'Üç güne kadar' }, { tur: 'kd', kd: 4, ad: 'Üç günden çok' }, { tur: 'iyi', ad: 'Zamanında' }]} />
        {V.satirlar.length
          ? <IsiIzgarasi etiket="Sipariş × termin uzatması, kalan gecikme" satirAd="Sipariş" genis="kalem" sutunlar={V.sutunlar} satirlar={V.satirlar} secim={secim} sec={secimYaz} acilim={acilim} />
          : <BosHarita metin="Terminli sipariş yok." />}
        <p className="tc-pys-kucuk">Uzatma sütunları kalan gecikmeyi şimdiki plandan hesaplar (gecikme eksi uzatma); diğer siparişlerin yeniden yerleşmesi motorla ölçülünce görünür. Kâr sütunu sipariş maliyetiyle, plan motoru bu ekrana bağlanınca gelir.</p>
      </section>
      {tum}
    </div>
  );
}
