import { useState } from 'react';
import { Dugme, Girdi, Kart, Secim, Simge } from '../../../../ortak/arayuz/index.ts';
import { planGuncel } from '../durum.ts';
import type { PlanlamaEkranOzellikleri } from '../gorunumler.ts';
import type { PlanlamaCalismasi, Siparis } from '../tipler.ts';
import {
  Acilim, BosHarita, GorunumBasligi, IsiIzgarasi, Lejant, MotorKapali, TumSatirlar, izinYok, type AcilimSecenegi, type Secim as HucreSecimi,
} from './IsiHaritasi.tsx';
import { PartiBolmeKarti, SiparisKari, DegerlendirmeKarti, gorunumDegerlendiricisi } from './Degerlendirme.tsx';
import {
  CARPANLAR, agirlikAyari, elleCarpan, elleSinir, fiyatDenetle, kayitliPlan, sayi, siparisAcilimi, siparisIsisi, tl, type SiparisSatiri,
} from './kurallar.ts';

// Siparişler (ysiparis): sipariş × hafta termin riski (zz30-isi ISI.ysiparis), satırın altında önem ve fiyat formu (zz24-sade SADE.ysiparis),
// "Tüm satırlar"da asıl sayfa (zu-yan-sayfalar sSiparisKar, zz10 elle bölme, zz11 parti taraması). Maliyet, kâr, parti bölme ve taraması
// motoru yeniden koşturur; kapalı gelir (357 b). Termin ve öncelik Üretim emirlerinden gelir, burada yazılmaz (222 a).

type FormAdi = 'onem' | 'fiyat';
const FORM_AD: Record<FormAdi, string> = { onem: 'Öne al ya da geri bırak', fiyat: 'Fiyat ve ödeme vadesi' };
const FORM_ETKI: Record<FormAdi, string> = {
  onem: 'Motor önemli siparişin gecikmesini daha pahalı sayar, önce onu yetiştirir.',
  fiyat: 'Kâr ve gecikme bedeli bu tutardan hesaplanır.',
};

function OnemFormu({ s, sinir, kaydet }: { s: Siparis; sinir: number; kaydet: (v: number, g: string) => boolean }) {
  const secenek = CARPANLAR.filter(([v]) => v <= sinir);
  const simdiki = elleCarpan(s);
  const [v, vYaz] = useState(String(secenek.some(([x]) => x === simdiki) ? simdiki : 1));
  const [g, gYaz] = useState(s.elleKim && s.elleKim !== 'geçiş' && typeof s.elleGerekce === 'string' ? s.elleGerekce : '');
  const [hata, hataYaz] = useState<string | null>(null);
  return (
    <form className="tc-pys-f" aria-label={FORM_AD.onem} noValidate onSubmit={(e) => {
      e.preventDefault();
      if (g.trim().length < 3) { hataYaz('Gerekçe en az üç harf olmalı.'); return; }
      kaydet(Number(v), g.trim());
    }}>
      <Secim etiket="Önemi" value={v} onChange={(e) => { vYaz(e.target.value); }} secenekler={secenek.map(([x, ad]) => ({ deger: String(x), baslik: ad }))}
        ipucu="×2: bir saatlik gecikmesi iki kat pahalı sayılır, motor öne alır" />
      <Girdi etiket="Gerekçe" value={g} required onChange={(e) => { gYaz(e.target.value); hataYaz(null); }} ipucu="Örnek: müşteri hat duruşunda" hata={hata ?? undefined} />
      <Dugme tur="birincil" type="submit" simge="check">Kaydet</Dugme>
    </form>
  );
}

function FiyatFormu({ s, kaydet }: { s: Siparis; kaydet: (gelir: number, vade: number | null) => boolean }) {
  const [gelir, gelirYaz] = useState(s.gelir == null ? '' : String(s.gelir));
  const [vade, vadeYaz] = useState(s.vade == null ? '' : String(s.vade as number));
  const [hata, hataYaz] = useState<string | null>(null);
  return (
    <form className="tc-pys-f" aria-label={FORM_AD.fiyat} noValidate onSubmit={(e) => {
      e.preventDefault();
      const x = fiyatDenetle(gelir, vade);
      if (typeof x === 'string') { hataYaz(x); return; }
      kaydet(x.gelir, x.vade);
    }}>
      <Girdi etiket="Tutar (TL)" type="number" min={0} required value={gelir} onChange={(e) => { gelirYaz(e.target.value); hataYaz(null); }} />
      <Girdi etiket="Ödeme vadesi (gün)" type="number" min={0} max={365} step={1} value={vade} onChange={(e) => { vadeYaz(e.target.value); hataYaz(null); }} ipucu="Boş: peşin" />
      {hata && <p className="tc-pys-hata" role="alert">{hata}</p>}
      <Dugme tur="birincil" type="submit" simge="check">Kaydet</Dugme>
    </form>
  );
}

export function Siparisler({ calisma, komut, yetki, git, depo, yenile }: PlanlamaEkranOzellikleri) {
  const [secim, secimYaz] = useState<HucreSecimi | null>(null);
  const [form, formYaz] = useState<FormAdi | null>(null);
  const [son, sonYaz] = useState<string | null>(null);
  const p = kayitliPlan(calisma);
  const fg = yetki.maliyetOku;
  const degerlendir = gorunumDegerlendiricisi(depo);
  const secilebilir = (calisma?.D.siparisler ?? []).map((x) => ({ id: x.id, ad: x.ad ?? x.id, adet: x.adet }));

  const tum = (
    <TumSatirlar>
      {yetki.planYaz && (
        <>
          <PartiBolmeKarti siparisler={secilebilir} degerlendir={degerlendir} yenile={yenile} />
          <MotorKapali baslik="Parti taraması" ne="En çok geciken iş emirleri için 1-6 parti ve iş emirleri arası birleşimler motorla denenir." />
        </>
      )}
      {fg
        ? p
          ? (
            <DegerlendirmeKarti baslik="Siparişler: maliyet ve kâr" ne="Maliyet son plandaki tezgâh seçimi, ayar, fason, malzeme ve beklemeden motorun derlemesiyle hesaplanır; kâr oranı, önerilen fiyat ve net kâr bununla gelir." istek={{ tur: 'siparis-kari' }} degerlendir={degerlendir} yenile={yenile}>
              {(c) => <SiparisKari cevap={c} />}
            </DegerlendirmeKarti>
          )
          : <Kart baslik="Siparişler: maliyet ve kâr"><p className="tc-pys-kucuk">Maliyet plandan çıkar (tezgâh, ayar, fason). Önce plan kurulmalı.</p></Kart>
        : (
          <Kart baslik="Siparişler: maliyet ve kâr">
            <p className="tc-pys-kucuk"><Simge ad="lock" boyut="k" /> Fiyat, maliyet ve kâr bilgisini müdür ve yönetici görür ve girer (karar 180, öneri a).</p>
          </Kart>
        )}
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
  const izinli: FormAdi[] = [
    ...(komut && agirlikAyari(c.D).kip === 'bedel' && sinir > 0 ? ['onem' as const] : []),
    ...(komut && fg ? ['fiyat' as const] : []),
  ];

  const sec = (s: HucreSecimi | null) => { secimYaz(s); formYaz(s ? izinli[0] ?? null : null); sonYaz(null); };

  const onemKaydet = (id: string, v: number, g: string): boolean => {
    const s0 = c.D.siparisler.find((x) => x.id === id); if (!s0 || !komut) return false;
    const once = elleCarpan(s0);
    const ok = komut.degistir('Elle çarpan değişti', (t) => {
      const s = t.D.siparisler.find((x) => x.id === id); if (!s) return false;
      Object.assign(s, { elle: v, elleGerekce: g, elleKim: depo.ben.kisi.ad });
      return true;
    }, { ayrinti: `${id}: ×${sayi(once, 2)} → ×${sayi(v, 2)} · ${g}` });
    if (ok) { sonYaz(`${id} önemi ×${sayi(v, 2)} oldu`); formYaz(null); }
    return ok;
  };
  const fiyatKaydet = (id: string, gelir: number, vade: number | null): boolean => {
    const s0 = c.D.siparisler.find((x) => x.id === id); if (!s0 || !komut) return false;
    const ok = komut.degistir('Sipariş fiyatı değişti', (t) => {
      const s = t.D.siparisler.find((x) => x.id === id); if (!s) return false;
      Object.assign(s, { gelir });
      if (vade == null) delete (s as Record<string, unknown>).vade; else Object.assign(s, { vade });
      return true;
    }, { ayrinti: `${id}: ${tl(s0.gelir)} → ${tl(gelir)}, vade ${s0.vade == null ? '—' : String(s0.vade as number)} → ${vade ?? '—'} gün` });
    if (ok) { sonYaz(`${id} fiyatı kaydedildi`); formYaz(null); }
    return ok;
  };

  const acilim = (r: SiparisSatiri) => {
    const A = siparisAcilimi(c.D, r); const s = r.s;
    let govde;
    if (form === 'onem') govde = <OnemFormu key={`onem-${s.id}`} s={s} sinir={sinir} kaydet={(v, g) => onemKaydet(s.id, v, g)} />;
    else if (form === 'fiyat') govde = <FiyatFormu key={`fiyat-${s.id}`} s={s} kaydet={(g, v) => fiyatKaydet(s.id, g, v)} />;
    else if (son) govde = (
      <>
        <p className="tc-pys-son" role="status"><Simge ad="check" boyut="k" /><span><b>{son}</b> {planGuncel(c) ? 'Kaydedildi.' : 'Plan bu değişikliği henüz içermiyor; Planlama motorunda plan yeniden kurulunca girer.'}</span></p>
        {izinli[0] && <Dugme simge="edit" onClick={() => { formYaz(izinli[0]!); sonYaz(null); }}>Yeniden düzenle</Dugme>}
      </>
    );
    else govde = izinli.length ? null : izinYok;
    const secenekler: AcilimSecenegi[] = [
      ...izinli.filter((f) => f !== form && !(son && f === izinli[0])).map((f) => ({ ad: FORM_AD[f], etki: FORM_ETKI[f], simge: f === 'onem' ? 'up' as const : 'lira' as const, yap: () => { formYaz(f); sonYaz(null); } })),
    ];
    return <Acilim baslik={A.baslik} ton={r.ton} neden={A.neden} bilgi={A.bilgi} form={govde} secenekler={secenekler} kapat={() => { sec(null); }} />;
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
          ? <IsiIzgarasi etiket="Sipariş × hafta, termin riski" satirAd="Sipariş" genis="hafta" sutunlar={V.sutunlar} satirlar={V.satirlar} secim={secim} sec={sec} gizliAd="zamanında" acilim={acilim} />
          : <BosHarita metin="Planda sipariş yok." />}
      </section>
      {tum}
    </div>
  );
}
