import { useState } from 'react';
import { Dugme } from '../../../../ortak/arayuz/index.ts';
import { planGuncel } from '../durum.ts';
import type { PlanlamaEkranOzellikleri } from '../gorunumler.ts';
import type { PlanlamaCalismasi } from '../tipler.ts';
import { FormluAcilim, type AcilimFormu } from './AcilimFormu.tsx';
import { BosHarita, GorunumBasligi, IsiIzgarasi, Lejant, TumSatirlar, type Secim as HucreSecimi } from './IsiHaritasi.tsx';
import { OrtusmeKarti, PartiBolmeKarti, PartiTaramasiKarti, gorunumDegerlendiricisi } from './Degerlendirme.tsx';
import { fiyatTanimi, onemTanimi } from './formlar.ts';
import { KarTablosu } from './KarTablosu.tsx';
import { agirlikAyari, elleSinir, kayitliPlan, siparisAcilimi, siparisIsisi, type SiparisSatiri } from './kurallar.ts';

// Siparişler (ysiparis): sipariş × hafta termin riski (zz30-isi ISI.ysiparis), satırın altında sihirbazla önem ve fiyat (zz24-sade SADE.ysiparis,
// ortak sade kabuğu), "Tüm satırlar"da asıl sayfa (zz10 partiyi böl, zz11 parti taraması, zz16 örtüşme, zu-yan-sayfalar sSiparisKar). Motor isteyen araçlar
// yerinde pasif (357 b). Termin ve öncelik Üretim emirlerinden gelir; "Termini değiştir" yerinde pasif (222 a, Soru 466/1 a).

const TERMIN_SAHIBI = 'Termin Üretim emirlerinde değiştirilir.';

export function Siparisler({ calisma, komut, yetki, git, depo, yenile }: PlanlamaEkranOzellikleri) {
  const [secim, secimYaz] = useState<HucreSecimi | null>(null);
  const p = kayitliPlan(calisma);
  const fg = yetki.maliyetOku;
  const degerlendir = gorunumDegerlendiricisi(depo);

  const tum = (
    <TumSatirlar>
      {yetki.planYaz && (
        <>
          <PartiBolmeKarti c={calisma} p={p} degerlendir={degerlendir} yenile={yenile} />
          <PartiTaramasiKarti c={calisma} p={p} />
          <OrtusmeKarti c={calisma} p={p} komut={komut} />
        </>
      )}
      <KarTablosu c={calisma} p={p} fg={fg} komut={fg ? komut : null} />
    </TumSatirlar>
  );

  if (!calisma || !p) {
    return (
      <div className="tc-pys" data-parca="ysiparis">
        <GorunumBasligi simge="list" baslik="Siparişler" />
        <BosHarita metin="Plan kurulunca her siparişin hangi hafta biteceği burada görünür.">
          {yetki.planYaz && <Dugme tur="birincil" simge="play" onClick={() => { git('plan'); }}>Planı kur</Dugme>}
        </BosHarita>
        {tum}
      </div>
    );
  }

  const c: PlanlamaCalismasi = calisma;
  const V = siparisIsisi(c, p);
  const sinir = elleSinir(yetki);
  const onem = komut && agirlikAyari(c.D).kip === 'bedel' && sinir > 0 ? onemTanimi(c, sinir, komut, depo.ben.kisi.ad) : null;
  const fiyat = komut && fg ? fiyatTanimi(c, komut) : null;

  const acilim = (r: SiparisSatiri, ck: string) => {
    const A = siparisAcilimi(c.D, r); const s = r.s; const deg = { sip: s.id };
    const formlar: AcilimFormu[] = [
      { ad: 'Termini değiştir', etki: 'Yeni termin plana bir sonraki çözümde girer.', simge: 'flag', tanim: null, deg, kapali: TERMIN_SAHIBI },
      { ad: 'Öne al ya da geri bırak', etki: 'Motor önemli siparişin gecikmesini daha pahalı sayar, önce onu yetiştirir.', simge: 'up', tanim: onem, deg },
      { ad: 'Fiyat ve ödeme vadesi', etki: 'Kâr ve gecikme bedeli bu tutardan hesaplanır.', simge: 'lira', tanim: fiyat, deg },
    ];
    return (
      <FormluAcilim
        key={`${s.id}|${ck}`} baslik={A.baslik} simge="flag" ton={r.ton} neden={A.neden} bilgi={A.bilgi} formlar={formlar} kapat={() => { secimYaz(null); }}
        planEski={c.plan !== null && !planGuncel(c)} iyilestirYetkisi={yetki.planYaz}
        secenekler={[{ ad: `${s.id} çizelgede`, etki: 'Siparişin adımlarını tezgâh çizelgesinde gösterir.', simge: 'gantt', yap: () => { git('plan'); } }]}
      />
    );
  };

  return (
    <div className="tc-pys" data-parca="ysiparis">
      <GorunumBasligi
        simge="list" baslik="Siparişler" alt="Sipariş × hafta, termin riski" ust={V.ust}
        eylem={!planGuncel(c) && yetki.planYaz ? <Dugme tur="birincil" simge="play" onClick={() => { git('plan'); }}>Planı iyileştir</Dugme> : undefined}
      />
      <section className="tc-pys-ana" aria-label="Isı haritası">
        <Lejant ogeler={[
          { tur: 'kd', kd: 1, ad: '8 saatten az' }, { tur: 'kd', kd: 2, ad: 'Bir güne kadar' }, { tur: 'kd', kd: 3, ad: 'Üç güne kadar' }, { tur: 'kd', kd: 4, ad: 'Üç günden çok' },
          { tur: 'iyi', ad: 'Zamanında biter' }, { tur: 'is', ad: 'Üretimde' }, { tur: 'bayrak', ad: 'Termin haftası' },
        ]} />
        {V.satirlar.length
          ? <IsiIzgarasi etiket="Sipariş × hafta, termin riski" satirAd="Sipariş" genis="hafta" sutunlar={V.sutunlar} satirlar={V.satirlar} secim={secim} sec={secimYaz} gizliAd="zamanında" acilim={acilim} />
          : <BosHarita metin="Planda sipariş yok." />}
      </section>
      {tum}
    </div>
  );
}
