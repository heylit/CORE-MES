import { Dugme, Kart, Simge, Tablo, useBildirim, type Sutun } from '../../../../ortak/arayuz/index.ts';
import type { SimgeAdi } from '../../../../ortak/tasarim/simgeler.ts';
import { planGuncel } from '../durum.ts';
import type { CalismaKomutu } from '../kayit.ts';
import type { PlanlamaCalismasi, Siparis } from '../tipler.ts';
import { agAyar, maliyetBaglami, siparisMaliyeti, wipAyar, type SiparisMaliyeti } from '../maliyet/kurallar.ts';
import { MotorNotu } from './IsiHaritasi.tsx';
import { KAR_ORANLARI, hedefKarOrani, onerilenFiyat, saat, sayi, tl, urunAdi, type KayitliPlan } from './kurallar.ts';
import { SayiGirdisi } from './SayiGirdisi.tsx';

// "Siparişler: maliyet ve kâr" (zu-yan-sayfalar sSiparisKar): gösterge satırı, toplu fiyat, sipariş tablosu, alt not. Tutar, vade ve hedef kâr
// oranı çalışmanın kendi alanlarıdır, burada yazılır (karar 180). Maliyet, bekleme ve gecikme bedeli Maliyetler (P3) hesabıyla plandan çıkar
// (ymSipMaliyet); önerilen fiyatı tutara yazan düğmeler yerinde pasif (486/1 a).

const BASLIK = 'Siparişler: maliyet ve kâr';
const YAZMA_PASIF = 'Önerilen fiyatı tutara yazma (Uygula, fiyatsızlara yaz) yerinde pasif.';
const yuzde = (x: number | null | undefined): string => (x == null || !Number.isFinite(x) ? '—' : `%${sayi(x * 100, 1)}`);
const eksiTl = (x: number | null | undefined): string => (x != null && x < 0 ? `−${tl(-x)}` : tl(x));

interface Gosterge { simge: SimgeAdi; ad: string; deger: string; not: string; ton?: 'uyari' | 'hata' | 'tamam' }
function Gostergeler({ l }: { l: readonly Gosterge[] }) {
  return (
    <div className="tc-pys-kpi">
      {l.map((g) => <div key={g.ad} data-ton={g.ton}><small><Simge ad={g.simge} boyut="k" />{g.ad}</small><b className="mono">{g.deger}</b><span>{g.not}</span></div>)}
    </div>
  );
}

interface Satir { s: Siparis; x: SiparisMaliyeti | null }

// emirler: sunucunun iş emri durumu; biten adımların maliyeti ondan bulunur (1410 a).
export function KarTablosu({ c, p, fg, komut, emirler = null }: { c: PlanlamaCalismasi | null; p: KayitliPlan | null; fg: boolean; komut: CalismaKomutu | null; emirler?: unknown }) {
  const { bildir } = useBildirim();
  if (!fg) return <Kart baslik={BASLIK} simge="lock"><p className="tc-pys-kucuk"><Simge ad="lock" boyut="k" /> Fiyat, maliyet ve kâr bilgisini müdür ve yönetici görür ve girer (karar 180, öneri a).</p></Kart>;
  if (!c || !p) return <Kart baslik={BASLIK} simge="list"><p className="tc-pys-kucuk">Maliyet plandan çıkar (tezgâh, ayar, fason). Önce plan kurulmalı.</p></Kart>;
  const D = c.D;
  const b = maliyetBaglami(c, emirler);
  const satirlar: Satir[] = D.siparisler.filter((s) => !s.havuz).map((s) => ({ s, x: b ? siparisMaliyeti(b, s) : null }));
  const top = (f: (x: SiparisMaliyeti) => number | null): number => satirlar.reduce((a, r) => a + (r.x ? f(r.x) ?? 0 : 0), 0);
  const tutar = top((x) => x.tutar); const maliyet = top((x) => x.top); const gec = top((x) => x.gec); const net = top((x) => x.net);
  const W = b?.W ?? null; const wa = wipAyar(D);
  const oner = (r: Satir): number | null => (r.x && !r.x.eksik.length ? onerilenFiyat(r.x.top, hedefKarOrani(D, r.s)) : null);

  const yaz = (r: Satir, ne: string, ayrinti: string, fn: (s: Siparis) => void, planKoru = false) => {
    komut?.degistir(ne, (t) => { const s = t.D.siparisler.find((x) => x.id === r.s.id); if (!s) return false; fn(s); return true; }, { ayrinti, planKoru });
  };
  const sayiOku = (metin: string, max?: number): number | null | undefined => {
    if (metin.trim() === '') return null;
    const v = Number(metin);
    if (!Number.isFinite(v) || v < 0 || (max != null && v > max)) { bildir('hata', 'Geçerli bir sayı girin.'); return undefined; }
    return v;
  };
  const yazilir = Boolean(komut);

  const sutunlar: Sutun<Satir>[] = [
    { anahtar: 'siparis', baslik: 'Sipariş', hucre: (r) => <><b className="mono">{r.s.id}</b><small className="tc-pys-not">{urunAdi(D, r.s.urun)} · {sayi(r.s.adet, 0)} adet</small></> },
    { anahtar: 'maliyet', baslik: 'Maliyet', hizala: 'sag', csv: (r) => (r.x && !r.x.eksik.length ? String(Math.round(r.x.top)) : ''), hucre: (r) => {
      const x = r.x;
      if (!x) return <span className="tc-pys-kucuk">Planda yok.</span>;
      return (
        <><b className="mono">{x.eksik.length ? '—' : tl(x.top)}</b>
          <small className="tc-pys-dok">
            <span>malzeme {tl(x.mal)}</span>{x.talas ? <span>talaş −{tl(x.talas)}</span> : null}<span>işleme {tl(x.isl)}</span><span>ayar {tl(x.ayar)}</span>
            {x.gg === null ? <span>genel gider —</span> : x.gg ? <span>genel gider {tl(x.gg)}</span> : null}{x.mes ? <span>ek mesai {tl(x.mes)}</span> : null}{x.fas ? <span>fason {tl(x.fas)}</span> : null}
          </small>
          {x.eksik.length > 0 && <span className="tc-pys-uyari"><Simge ad="alert" boyut="k" />{x.eksik.join(', ')} yok</span>}</>
      );
    } },
    { anahtar: 'tutar', baslik: 'Tutar · vade', hizala: 'sag', csv: (r) => (r.s.gelir == null ? '' : String(r.s.gelir)), hucre: (r) => (
      <span className="tc-pys-iki">
        {yazilir
          ? <SayiGirdisi sinif="tc-pys-ag-sayi" deger={r.s.gelir ?? null} etiket={`${r.s.id} tutar`} min={0} adim={100} yer="fiyatsız"
            yaz={(m) => { const v = sayiOku(m); if (v !== undefined) yaz(r, 'Gecikme bedeli verisi değişti', `${r.s.id} tutar: ${r.s.gelir ?? '—'} → ${v ?? '—'}`, (s) => { Object.assign(s, { gelir: v }); }); }} />
          : <b className="mono">{tl(r.s.gelir)}</b>}
        <span className="tc-pys-vade">
          {yazilir
            ? <SayiGirdisi sinif="tc-pys-ag-sayi" deger={r.s.vade == null ? null : Number(r.s.vade)} etiket={`${r.s.id} ödeme vadesi`} min={0} max={365} adim={1} yer="vade"
              yaz={(m) => {
                const v = sayiOku(m, 365); if (v === undefined) return;
                yaz(r, 'Ödeme vadesi değişti', `${r.s.id}: ${r.s.vade == null ? '—' : String(r.s.vade as number)} → ${v ?? '—'} gün`, (s) => { if (v == null) delete (s as Record<string, unknown>).vade; else Object.assign(s, { vade: v }); }, true);
              }} />
            : <span className="mono">{r.s.vade == null ? '—' : String(r.s.vade as number)}</span>}
          <small>gün</small>
        </span>
      </span>) },
    { anahtar: 'oran', baslik: 'Kâr oranı', hizala: 'sag', hucre: (r) => {
      const g = r.x && r.x.kar != null && r.x.top ? r.x.kar / r.x.top : null;
      return <b className="mono" data-ton={g != null && g < hedefKarOrani(D, r.s) / 100 ? 'uyari' : undefined}>{yuzde(g)}</b>;
    } },
    { anahtar: 'hedef', baslik: 'Hedef · önerilen fiyat', hizala: 'sag', csv: (r) => String(hedefKarOrani(D, r.s)), hucre: (r) => {
      const h = hedefKarOrani(D, r.s); const o = oner(r);
      const fark = o != null && r.s.gelir != null ? r.s.gelir - o : null;
      return (
        <>
          <span className="tc-pys-oner">
            <select className="tc-alan-kutu tc-pys-secim" value={String(h)} disabled={!yazilir} aria-label={`${r.s.id} hedef kâr oranı`}
              onChange={(e) => { const v = Number(e.target.value); yaz(r, 'Hedef kâr oranı değişti', `${r.s.id}: %${String(h)} → %${String(v)}`, (s) => { Object.assign(s, { karOran: v }); }, true); }}>
              {[...new Set([...KAR_ORANLARI, h])].sort((a, b) => a - b).map((x) => <option key={x} value={String(x)}>%{sayi(x, 1)}</option>)}
            </select>
            <b className="mono">{tl(o)}</b>
            {o != null && (r.s.gelir == null || Math.abs(r.s.gelir - o) >= 1) && <Dugme simge="check" disabled title={YAZMA_PASIF}>Uygula</Dugme>}
          </span>
          {fark != null && Math.abs(fark) >= 1 && <small className="tc-pys-not">{fark > 0 ? `tutar ${tl(fark)} üstünde` : `tutar ${tl(-fark)} altında`}</small>}
        </>
      );
    } },
    { anahtar: 'gecikme', baslik: 'Gecikme', hizala: 'sag', hucre: (r) => {
      const x = r.x; if (!x) return '—';
      if (x.T != null && x.T > 0.05) return <><span className="tc-pys-gec">{saat(x.T)}</span><small className="tc-pys-not mono">{tl(x.gec)}</small></>;
      return x.erken > 0.05 ? <span className="tc-pys-kucuk">erken {saat(x.erken)}</span> : 'yok';
    } },
    { anahtar: 'bekleme', baslik: 'Bekleme', hizala: 'sag', csv: (r) => (r.x?.bek ? String(Math.round(r.x.bek.tl)) : ''), hucre: (r) => {
      const k = r.x?.bek;
      if (!k || Math.abs(k.tl) < 0.5) return r.x ? 'yok' : '—';
      const parca = ([['ilk', 'malzeme'], ['ara', 'adımlar arası'], ['son', 'termine kadar']] as const).filter(([a]) => k[a] >= 0.5);
      return (
        <><b className="mono" data-ton={k.tl < 0 ? 'tamam' : undefined}>{eksiTl(k.tl)}</b>
          <small className="tc-pys-dok">
            {parca.map(([a, ad]) => <span key={a}>{ad} {tl(k[a])}</span>)}
            {k.tah <= -0.5 && <span>erken tahsilat −{tl(-k.tah)}</span>}<span>{sayi(k.saat, 0)} sa</span>
          </small></>
      );
    } },
    { anahtar: 'net', baslik: 'Net kâr', hizala: 'sag', hucre: (r) => <><b className="mono" data-ton={r.x?.net != null && r.x.net < 0 ? 'hata' : undefined}>{tl(r.x?.net)}</b>{r.x?.fin ? <small className="tc-pys-not">finansman {tl(r.x.fin)}</small> : null}</> },
  ];

  return (
    <Kart baslik={BASLIK} simge="list" baslikEki={<span className="tc-pys-kucuk">plandan</span>}>
      <Gostergeler l={[
        { simge: 'lira', ad: 'Toplam tutar', deger: tl(tutar), not: `${String(satirlar.filter((r) => r.s.gelir != null).length)} fiyatlı sipariş` },
        { simge: 'layers', ad: 'Toplam maliyet', deger: tl(maliyet), not: 'malzeme, işleme, ayar, genel gider, fason, ek mesai' },
        { simge: 'chart', ad: 'Brüt kâr oranı', deger: yuzde(maliyet ? (tutar - maliyet) / maliyet : null), not: 'maliyet üstüne' },
        { simge: 'clock', ad: 'Gecikme bedeli', deger: tl(gec), not: 'bu planda', ton: gec > 0 ? 'uyari' : 'tamam' },
        { simge: 'pause', ad: 'Bekleme maliyeti', deger: eksiTl(W?.tl), not: `${sayi(W?.saat ?? 0, 0)} sa bekleme${W && W.tah < -0.5 ? ` · erken tahsilat −${tl(-W.tah)}` : ''}${wa.ac ? '' : ' · plan amacında değil'}` },
        { simge: 'check', ad: 'Net kâr', deger: tl(net), not: 'gecikme, finansman, bekleme düşülmüş', ton: net < 0 ? 'hata' : undefined },
      ]} />
      <div className="tc-pys-sira">
        <span className="tc-pys-kucuk tc-pys-sira-ara">Önerilen fiyat = maliyet × (1 + hedef kâr oranı). Uygula siparişin tutarını değiştirir; gecikme bedeli ve öncelik tutardan yeniden hesaplanır.</span>
        <Dugme simge="lira" disabled title={YAZMA_PASIF}>Fiyatsızlara önerilen fiyatı yaz</Dugme>
      </div>
      <Tablo etiket={BASLIK} sutunlar={sutunlar} satirlar={satirlar} satirAnahtari={(r) => r.s.id} bosMesaj="Planda sipariş yok." />
      <p className="tc-pys-kucuk">
        Maliyet son plandaki tezgâh seçimi, ayar ve fasondan; malzeme kg fiyatı ve fire payıyla. Kâr oranı maliyet üstünedir. Net kâr = tutar − maliyet − gecikme
        bedeli − finansman (tutar × %{sayi(agAyar(D).fin, 2)}/gün × vade) − bekleme maliyeti. Bekleme plandan çıkar: malzemenin hazır olmasından ilk adıma ve
        adımlar arasında bekleyen değerin finansmanı. {wa.vadeBas === 'termin' ? 'Vade terminde başladığı için son adımdan termine kadar bekleme de sayılır.'
          : 'Vade üretim bitince başladığı için erken biten siparişin parası erken gelir; bu kazanç bekleme maliyetinden düşülür (erken tahsilat).'} Ayar Maliyetler
        sayfasında. Talaş kredisi, net ağırlık ve talaş fiyatı girilmiş üründe malzemeden düşülür. Vade bir saatlik gecikmenin bedelini değiştirmez: gecikme ödemeyi
        vadeden bağımsız olarak aynı süre kaydırır.
        {!planGuncel(c) && <b> Veri plandan sonra değişti; maliyet yeniden çözülünce güncellenir.</b>}
      </p>
      <MotorNotu ne={YAZMA_PASIF} />
    </Kart>
  );
}
