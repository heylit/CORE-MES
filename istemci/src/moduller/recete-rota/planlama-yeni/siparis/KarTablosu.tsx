import { Dugme, Kart, Simge, Tablo, useBildirim, type Sutun } from '../../../../ortak/arayuz/index.ts';
import type { SimgeAdi } from '../../../../ortak/tasarim/simgeler.ts';
import { planGuncel } from '../durum.ts';
import type { CalismaKomutu } from '../kayit.ts';
import type { PlanlamaCalismasi, Siparis } from '../tipler.ts';
import { useDegerlendirme } from './Degerlendirme.tsx';
import type { Degerlendirici, SiparisKariSatiri } from './degerlendirme.ts';
import { MotorNotu } from './IsiHaritasi.tsx';
import {
  KAR_ORANLARI, fiyatYuvarla, hedefKarOrani, onerilenFiyat, saat, sayi, siparisZamani, tl, type KayitliPlan,
} from './kurallar.ts';
import { SayiGirdisi } from './SayiGirdisi.tsx';

// "Siparişler: maliyet ve kâr" (zu-yan-sayfalar sSiparisKar): gösterge satırı, toplu fiyat, sipariş tablosu, alt not. Tutar, vade ve hedef kâr
// oranı çalışmanın kendi alanlarıdır, burada yazılır (karar 180). Maliyet, kâr oranı, önerilen fiyat, bekleme ve net kâr motorun sipariş
// maliyetinden gelir; motor bağlanana dek hücre boş, Uygula pasif (357 b). Gecikme plandandır.

const BASLIK = 'Siparişler: maliyet ve kâr';
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

interface Satir { s: Siparis; m: SiparisKariSatiri | null; planda: boolean }

export function KarTablosu({ c, p, fg, komut, degerlendir }: {
  c: PlanlamaCalismasi | null; p: KayitliPlan | null; fg: boolean; komut: CalismaKomutu | null; degerlendir: Degerlendirici | null;
}) {
  const d = useDegerlendirme<'siparis-kari'>(fg && c && p ? { tur: 'siparis-kari' } : null, degerlendir);
  const { bildir } = useBildirim();
  if (!fg) return <Kart baslik={BASLIK}><p className="tc-pys-kucuk"><Simge ad="lock" boyut="k" /> Fiyat, maliyet ve kâr bilgisini müdür ve yönetici görür ve girer (karar 180, öneri a).</p></Kart>;
  if (!c || !p) return <Kart baslik={BASLIK}><p className="tc-pys-kucuk">Maliyet plandan çıkar (tezgâh, ayar, fason). Önce plan kurulmalı.</p></Kart>;
  const D = c.D;
  const M = d.tur === 'sonuc' ? d.cevap.sonuc : null;
  const satirlar: Satir[] = D.siparisler.filter((s) => !s.havuz).map((s) => ({ s, m: M?.satirlar.find((x) => x.siparisId === s.id) ?? null, planda: Boolean(p.J[s.id]) }));
  const top = (f: (m: SiparisKariSatiri) => number | null): number | null => (M ? satirlar.reduce((a, r) => a + (r.m ? f(r.m) ?? 0 : 0), 0) : null);
  const tutar = satirlar.reduce((a, r) => a + (r.s.gelir ?? 0), 0);
  const maliyet = top((m) => m.toplam); const gec = top((m) => m.gecikmeBedeli); const net = top((m) => m.net);
  const oner = (r: Satir): number | null => (r.m && !r.m.eksik.length ? onerilenFiyat(r.m.toplam, hedefKarOrani(D, r.s)) : null);

  const yaz = (r: Satir, ne: string, ayrinti: string, fn: (s: Siparis) => void, planKoru = false) => {
    komut?.degistir(ne, (t) => { const s = t.D.siparisler.find((x) => x.id === r.s.id); if (!s) return false; fn(s); return true; }, { ayrinti, planKoru });
  };
  const sayiOku = (metin: string, max?: number): number | null | undefined => {
    if (metin.trim() === '') return null;
    const v = Number(metin);
    if (!Number.isFinite(v) || v < 0 || (max != null && v > max)) { bildir('hata', 'Geçerli bir sayı girin.'); return undefined; }
    return v;
  };
  const fiyatYaz = (l: { r: Satir; f: number; o: number }[]) => {
    if (!l.length) { bildir('hata', 'Önerilen fiyat çıkan sipariş yok (maliyeti eksik ya da fiyatı var).'); return; }
    komut?.degistir('Sipariş fiyatı maliyetten', (t) => {
      for (const { r, f } of l) { const s = t.D.siparisler.find((x) => x.id === r.s.id); if (s) Object.assign(s, { gelir: f }); }
      return true;
    }, { ayrinti: l.map(({ r, f, o }) => `${r.s.id}: ${tl(r.s.gelir)} → ${tl(f)} (%${String(o)})`).join('; ') });
  };
  const fiyatlar = (l: Satir[]) => l.flatMap((r) => { const o = oner(r); return o == null ? [] : [{ r, f: fiyatYuvarla(o), o: hedefKarOrani(D, r.s) }]; });
  const fiyatsiz = satirlar.filter((r) => r.s.gelir == null);
  const yazilir = Boolean(komut);

  const sutunlar: Sutun<Satir>[] = [
    { anahtar: 'siparis', baslik: 'Sipariş', hucre: (r) => <><b className="mono">{r.s.id}</b><small className="tc-pys-not">{r.s.ad ?? r.s.id} · {sayi(r.s.adet, 0)} adet</small></> },
    { anahtar: 'maliyet', baslik: 'Maliyet', hizala: 'sag', hucre: (r) => (!r.planda ? <span className="tc-pys-kucuk">Planda yok.</span> : (
      <><b className="mono">{r.m && !r.m.eksik.length ? tl(r.m.toplam) : '—'}</b>
        {r.m && r.m.eksik.length > 0 && <span className="tc-pys-uyari"><Simge ad="alert" boyut="k" />{r.m.eksik.join(', ')} yok</span>}</>)) },
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
      const g = r.m && r.m.kar != null && r.m.toplam ? r.m.kar / r.m.toplam : null;
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
            {(o == null || r.s.gelir == null || Math.abs(r.s.gelir - o) >= 1) && (
              <Dugme simge="check" disabled={o == null || !yazilir} onClick={() => { fiyatYaz(fiyatlar([r])); }}>Uygula</Dugme>
            )}
          </span>
          {fark != null && Math.abs(fark) >= 1 && <small className="tc-pys-not">{fark > 0 ? `tutar ${tl(fark)} üstünde` : `tutar ${tl(-fark)} altında`}</small>}
        </>
      );
    } },
    { anahtar: 'gecikme', baslik: 'Gecikme', hizala: 'sag', hucre: (r) => {
      if (!r.planda) return '—';
      const z = siparisZamani(D, p, r.s);
      if (z.T == null) return <span className="tc-pys-kucuk">plana sığmadı</span>;
      if (z.T > 0.05) return <><span className="mono">{saat(z.T)}</span><small className="tc-pys-not mono">{tl(r.m?.gecikmeBedeli)}</small></>;
      return z.erken != null && z.erken > 0.05 ? <span className="tc-pys-kucuk">erken {saat(z.erken)}</span> : 'yok';
    } },
    { anahtar: 'bekleme', baslik: 'Bekleme', hizala: 'sag', mono: true, hucre: (r) => (r.m?.bekleme && Math.abs(r.m.bekleme.tl) >= 0.5 ? eksiTl(r.m.bekleme.tl) : r.m ? 'yok' : '—') },
    { anahtar: 'net', baslik: 'Net kâr', hizala: 'sag', hucre: (r) => <><b className="mono" data-ton={r.m?.net != null && r.m.net < 0 ? 'hata' : undefined}>{tl(r.m?.net)}</b>{r.m?.finansman ? <small className="tc-pys-not">finansman {tl(r.m.finansman)}</small> : null}</> },
  ];

  return (
    <Kart baslik={BASLIK} baslikEki={<span className="tc-pys-kucuk">plandan</span>}>
      <Gostergeler l={[
        { simge: 'lira', ad: 'Toplam tutar', deger: tl(tutar), not: `${String(satirlar.filter((r) => r.s.gelir != null).length)} fiyatlı sipariş` },
        { simge: 'layers', ad: 'Toplam maliyet', deger: tl(maliyet), not: 'malzeme, işleme, ayar, genel gider, fason, ek mesai' },
        { simge: 'chart', ad: 'Brüt kâr oranı', deger: yuzde(maliyet ? (tutar - maliyet) / maliyet : null), not: 'maliyet üstüne' },
        { simge: 'clock', ad: 'Gecikme bedeli', deger: tl(gec), not: 'bu planda', ton: gec == null ? undefined : gec > 0 ? 'uyari' : 'tamam' },
        { simge: 'pause', ad: 'Bekleme maliyeti', deger: eksiTl(M?.bekleme), not: 'plandaki bekleme' },
        { simge: 'check', ad: 'Net kâr', deger: tl(net), not: 'gecikme, finansman, bekleme düşülmüş', ton: net != null && net < 0 ? 'hata' : undefined },
      ]} />
      <div className="tc-pys-sira">
        <span className="tc-pys-kucuk tc-pys-sira-ara">Önerilen fiyat = maliyet × (1 + hedef kâr oranı). Uygula siparişin tutarını değiştirir; gecikme bedeli ve öncelik tutardan yeniden hesaplanır.</span>
        <Dugme simge="lira" disabled={!M || !yazilir || !fiyatsiz.length} onClick={() => { fiyatYaz(fiyatlar(fiyatsiz)); }}>Fiyatsızlara önerilen fiyatı yaz</Dugme>
      </div>
      <Tablo etiket={BASLIK} sutunlar={sutunlar} satirlar={satirlar} satirAnahtari={(r) => r.s.id} bosMesaj="Planda sipariş yok." />
      <p className="tc-pys-kucuk">
        Maliyet son plandaki tezgâh seçimi, ayar ve fasondan; malzeme kg fiyatı ve fire payıyla. Kâr oranı maliyet üstünedir. Net kâr = tutar − maliyet − gecikme
        bedeli − finansman (tutar × günlük oran × vade) − bekleme maliyeti. Bekleme plandan çıkar: malzemenin hazır olmasından ilk adıma ve adımlar arasında
        bekleyen değerin finansmanı. Ayar Maliyetler sayfasında. Vade bir saatlik gecikmenin bedelini değiştirmez: gecikme ödemeyi vadeden bağımsız olarak aynı süre kaydırır.
        {!planGuncel(c) && <b> Veri plandan sonra değişti; maliyet yeniden çözülünce güncellenir.</b>}
      </p>
      {!degerlendir && <MotorNotu ne="Maliyet, kâr oranı, önerilen fiyat, bekleme ve net kâr motorun sipariş maliyetinden gelir." />}
    </Kart>
  );
}
