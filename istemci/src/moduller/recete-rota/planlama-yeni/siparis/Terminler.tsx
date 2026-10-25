import { useEffect, useMemo, useState } from 'react';
import { Dugme, Kart, Rozet, Tablo, useBildirim, type Sutun } from '../../../../ortak/arayuz/index.ts';
import { planGuncel } from '../durum.ts';
import type { PlanlamaEkranOzellikleri } from '../gorunumler.ts';
import type { CalismaKomutu } from '../kayit.ts';
import { kaynakKur, stokOku, type StokKaynagi } from '../malzeme/kaynak.ts';
import { alimPlani, bitenler, calismaSimdisi, motorGirdisi, planIslemleri, tabanMs, tahsisEt, type AlimPlaniSatiri } from '../malzeme/kurallar.ts';
import { TedarikTerminiKarti } from '../malzeme/TedarikTermini.tsx';
import type { Fasoncu, PlanVerisi, PlanlamaCalismasi } from '../tipler.ts';
import { FormluAcilim, type AcilimFormu } from './AcilimFormu.tsx';
import { MalzemeBekleyenKarti, gorunumDegerlendiricisi } from './Degerlendirme.tsx';
import { fasonTanimi } from './formlar.ts';
import { BosHarita, GorunumBasligi, IsiIzgarasi, Lejant, TumSatirlar, type AcilimSecenegi, type Secim } from './IsiHaritasi.tsx';
import { SayiGirdisi } from './SayiGirdisi.tsx';
import {
  AYAR_SINIRI, KAT_SINIRI, fasonDurumu, fasonKalemleri, fasonSatirlari, malzemeKalemleri, fasonTerminiYaz, gunYaz, katsayi, kayitliPlan, sayi, sinirliSayi,
  saatYaz, tarihGirdisi, terminAyari, terminIsisi, terminUyarisi, type FasonSatiri, type FasonTerminAyari, type TerminSatiri,
} from './kurallar.ts';

// Terminler: kalem × gün (zz30-isi ISI.terminler), satırın altında sihirbazla dönüş tarihi (zz25-sade-takvim SADE.terminler fason, ortak sade
// kabuğu), "Tüm satırlar"da varsayılan termin, katsayılar, termin bekleyen malzemeler ve fason dönüş terminleri (zv-termin sTerminler).
// Malzeme kalemleri Malzeme satın alma planının (P4) hesabındandır, kaynağı da onunkidir: stok ve açık sipariş stoktan (518 a). Satın alma
// siparişi satın almanındır (222 a); malzeme başına tedarik termini burada da girilir, kayıt Satın Alma'nındır (533 a, 534 1 a). İşi ileri atmak siparişin başlama tarihini yazar; o tarih
// Üretim emirlerindendir, düğme yerinde pasif (222 a, Soru 466/1 a).

const ILERI_SAHIBI = 'İşin başlama tarihi Üretim emirlerinde değiştirilir.';

const tarih = (D: PlanVerisi, t: number | null | undefined) => (t == null || !Number.isFinite(t) ? '—' : <span className="mono">{gunYaz(D, t)}</span>);

function AyarKarti({ D, komut, uyar }: { D: PlanVerisi; komut: CalismaKomutu | null; uyar: (ileti: string) => void }) {
  const A = terminAyari(D);
  const yaz = (k: keyof FasonTerminAyari, metin: string) => {
    const s = AYAR_SINIRI[k]; const x = sinirliSayi(metin, s.min, s.max);
    if (x === null) { uyar('Geçerli bir sayı girin.'); return; }
    if (x === A[k] || !komut) return;
    komut.degistir('Varsayılan termin ayarı', (t) => {
      (t.D as Record<string, unknown>).terminAyar = { ...(typeof t.D.terminAyar === 'object' && t.D.terminAyar ? t.D.terminAyar : {}), [k]: x };
    }, { ayrinti: `${k}: ${A[k]} → ${x}` });
  };
  return (
    <Kart baslik="Varsayılan fason dönüşü" simge="gear">
      <div className="tc-pys-alanlar">
        {(Object.keys(AYAR_SINIRI) as (keyof FasonTerminAyari)[]).map((k) => (
          <label key={k} className="tc-pys-alan">
            <span>{AYAR_SINIRI[k].ad}</span>
            {komut
              ? <SayiGirdisi deger={A[k]} etiket={AYAR_SINIRI[k].ad} min={AYAR_SINIRI[k].min} max={AYAR_SINIRI[k].max} adim={AYAR_SINIRI[k].adim} yaz={(m) => { yaz(k, m); }} />
              : <b className="mono">{sayi(A[k], 2)}</b>}
          </label>
        ))}
      </div>
      <p className="tc-pys-kucuk">
        Dönüş termini girilmeyen fasonda plan dönüşü fasoncunun süresi × katsayı + adetle orantılı ek günle varsayar ve satın almaya referans termin verir;
        girilen termin kesin süredir ve katsayının yerine geçer. Plana girmesine {sayi(A.esik, 0)} gün kalmış ve termini olmayan fason için uyarı çıkar.
        Malzemede katsayı yoktur: termin Satın Alma'dan gelir, girilmemişse malzeme olması gereken tarihte gelmiş sayılır.
      </p>
    </Kart>
  );
}

type KatSatiri = { tur: 'fas'; x: Fasoncu };

function KatsayiKarti({ D, komut, uyar }: { D: PlanVerisi; komut: CalismaKomutu | null; uyar: (ileti: string) => void }) {
  const A = terminAyari(D);
  const yaz = (r: KatSatiri, k: 'terminKat' | 'terminEk', metin: string) => {
    const s = KAT_SINIRI[k]; const x = metin.trim() === '' ? null : sinirliSayi(metin, s.min, s.max);
    if (metin.trim() !== '' && x === null) { uyar('Geçerli bir sayı girin.'); return; }
    if (!komut) return;
    const kimlik = r.x.id; const once = r.x[k];
    komut.degistir('Fasoncu termin katsayısı', (t) => {
      const o = (t.D.fasoncular ?? []).find((y) => y.id === kimlik) as Record<string, unknown> | undefined;
      if (!o) return false;
      if (x == null) delete o[k]; else o[k] = x;
      return true;
    }, { ayrinti: `${kimlik} ${k === 'terminKat' ? 'katsayı' : 'ek gün'}: ${once == null ? 'genel' : String(once as number)} → ${x ?? 'genel'}` });
  };
  const gir = (r: KatSatiri, k: 'terminKat' | 'terminEk', genel: number, ad: string) => {
    const v = r.x[k] == null ? null : Number(r.x[k]);
    return komut
      ? <SayiGirdisi deger={v} etiket={ad} min={KAT_SINIRI[k].min} max={KAT_SINIRI[k].max} adim={0.1} yer={sayi(genel, 2)} yaz={(m) => { yaz(r, k, m); }} />
      : <span className="mono">{v == null ? '—' : sayi(v, 2)}</span>;
  };
  const fas: KatSatiri[] = (D.fasoncular ?? []).map((x) => ({ tur: 'fas', x }));
  const fasSut: Sutun<KatSatiri>[] = [
    { anahtar: 'fasoncu', baslik: 'Fasoncu', hucre: (r) => <><b>{r.x.ad ?? r.x.id}</b><small className="tc-pys-not mono">{r.x.id}</small></> },
    { anahtar: 'sure', baslik: 'Süre', hizala: 'sag', hucre: (r) => <span className="mono">{sayi(+(r.x.sureGun ?? 0) || 1, 1)} gün</span> },
    { anahtar: 'kat', baslik: 'Katsayı ×', hizala: 'sag', hucre: (r) => gir(r, 'terminKat', A.katFas, `${r.x.ad ?? r.x.id} katsayı`) },
    { anahtar: 'ek', baslik: 'Ek gün / 100 adet', hizala: 'sag', hucre: (r) => gir(r, 'terminEk', A.ekFas, `${r.x.ad ?? r.x.id} ek gün`) },
    { anahtar: 'donus', baslik: 'Varsayılan dönüş', hizala: 'sag', hucre: (r) => (
      <><b className="mono">{sayi((+(r.x.sureGun ?? 0) || 1) * katsayi(r.x, 'terminKat', A.katFas), 1)} gün</b><small className="tc-pys-not">{r.x.terminKat != null ? 'firmanın kendi' : 'genel'}</small></>) },
  ];
  return (
    <Kart baslik="Fasoncu başına katsayı" simge="list">
      <p className="tc-pys-kucuk">Varsayılan dönüş fason firmasına göre değişir. Boş bırakılan alan genel katsayıyı kullanır (gri yazılan değer).</p>
      <Tablo etiket="Fasoncu katsayıları" sutunlar={fasSut} satirlar={fas} satirAnahtari={(r) => r.x.id} bosMesaj="Fasoncu yok." />
    </Kart>
  );
}

function FasonDonusu({ D, x, komut }: { D: PlanVerisi; x: FasonSatiri; komut: CalismaKomutu | null }) {
  if (!komut) return tarih(D, x.T);
  return (
    <input
      className="tc-alan-kutu tc-pys-tarih" type="date" value={tarihGirdisi(D, x.T)} aria-label={`${x.id} fason dönüş termini`}
      onChange={(e) => {
        const v = e.target.value;
        komut.degistir(v ? 'Fason dönüş termini girildi' : 'Fason dönüş termini silindi', (t) => { fasonTerminiYaz(t, x.id, v); }, { ayrinti: `${x.id}: ${v || '—'}` });
      }}
    />
  );
}

export function FasonTerminKarti({ c, L, komut, sadeceBos }: { c: PlanlamaCalismasi; L: FasonSatiri[]; komut: CalismaKomutu | null; sadeceBos: boolean }) {
  const D = c.D; const A = terminAyari(D);
  const l = sadeceBos ? L.filter((x) => x.T == null) : L;
  const sut: Sutun<FasonSatiri>[] = [
    { anahtar: 'is', baslik: 'İş', hucre: (x) => <><b className="mono">{x.id}</b><small className="tc-pys-not">{x.s.ad ?? ''} · {sayi(x.adet, 0)} adet</small></> },
    { anahtar: 'fasoncu', baslik: 'Fasoncu', hucre: (x) => x.f?.ad ?? x.r.m },
    { anahtar: 'durum', baslik: 'Durum', hucre: (x) => { const [d, ton] = fasonDurumu(x); return <Rozet ton={ton}>{d}</Rozet>; } },
    { anahtar: 'cikis', baslik: 'Çıkış', kirilmaz: true, hucre: (x) => tarih(D, x.r.S) },
    { anahtar: 'gerekli', baslik: 'Gerekli dönüş', kirilmaz: true, hucre: (x) => tarih(D, x.ger) },
    { anahtar: 'engec', baslik: 'En geç', kirilmaz: true, hucre: (x) => tarih(D, x.enGec) },
    { anahtar: 'termin', baslik: 'Dönüş termini', hucre: (x) => <><FasonDonusu D={D} x={x} komut={komut} /><small className="tc-pys-not">referans {saatYaz(D, x.ref ?? x.tahmini).slice(0, 9)}</small></> },
    { anahtar: 'planda', baslik: 'Planda dönüş', kirilmaz: true, hucre: (x) => <>{tarih(D, x.r.C)}<small className="tc-pys-not">{x.T == null ? 'referans terminden' : 'terminden'}</small></> },
  ];
  return (
    <Kart baslik="Fason dönüş terminleri" simge="truck">
      <Tablo etiket="Fason dönüş terminleri" sutunlar={sut} satirlar={l} satirAnahtari={(x) => x.id} bosMesaj={sadeceBos ? 'Termini beklenen fason yok.' : 'Planda fason yok.'} />
      <p className="tc-pys-kucuk">
        Gerekli dönüş: işin sonraki adımının planlanan başlangıcı (son adımsa sipariş termini). En geç: siparişin terminini kaçırmadan dönebileceği son gün.
        Termin girilmeyen fasonda dönüş, fasoncunun süresi × katsayısından (fasoncunun kendi katsayısı, yoksa genel {sayi(A.katFas, 2)})
        {A.ekFas ? ` + 100 adet başına ${sayi(A.ekFas, 1)} gün` : ''} tahmin edilir; girilen termin kesin süredir ve plan onu kullanır.
      </p>
    </Kart>
  );
}

// Malzeme satın alma planının satırları (MalzemePlani.tsx ile aynı girdi); stok okunurken undefined, plan yoksa null.
function useAlimPlani({ calisma, depo }: Pick<PlanlamaEkranOzellikleri, 'calisma' | 'depo'>): AlimPlaniSatiri[] | null | undefined {
  const [stok, stokYaz] = useState<StokKaynagi | null | undefined>(undefined);
  useEffect(() => {
    let bitti = false;
    void stokOku().then((s) => { if (!bitti) stokYaz(s); });
    return () => { bitti = true; };
  }, []);
  return useMemo(() => {
    const D = calisma?.D;
    const taban = D?.meta?.baslangic ? tabanMs(D.meta.baslangic) : null;
    if (!calisma || !D || taban === null) return null;
    if (stok === undefined) return undefined;
    const islemler = planIslemleri(calisma.plan);
    if (calisma.plan === null || islemler.length === 0) return null;
    const k = kaynakKur(D, taban, stok);
    const biten = bitenler(depo.durum?.emirler ?? depo.receteRotaKaydi, D);
    const g = motorGirdisi({ D, malzemeler: k.malzemeler, alimlar: k.alimlar, islemler, biten, simdi: calismaSimdisi(calisma), taban });
    return alimPlani(g, taban, tahsisEt(g, taban));
  }, [calisma, stok, depo.durum, depo.receteRotaKaydi]);
}

export function Terminler({ calisma, komut, yetki, git, depo, yenile }: PlanlamaEkranOzellikleri) {
  const [secim, secimYaz] = useState<Secim | null>(null);
  const alim = useAlimPlani({ calisma, depo });
  const { bildir } = useBildirim();
  const uyar = (ileti: string) => { bildir('hata', ileti); };
  const p = kayitliPlan(calisma);
  const L = calisma && p ? fasonSatirlari(calisma, p) : [];
  const degerlendir = gorunumDegerlendiricisi(depo);
  const taban = calisma?.D.meta?.baslangic ? tabanMs(calisma.D.meta.baslangic) : null;

  const tum = calisma && (
    <TumSatirlar>
      <AyarKarti D={calisma.D} komut={komut} uyar={uyar} />
      <KatsayiKarti D={calisma.D} komut={komut} uyar={uyar} />
      {p
        ? (
          <>
            {alim && taban !== null && <TedarikTerminiKarti D={calisma.D} l={alim} taban={taban} yazar={yetki.planYaz} yenile={yenile} />}
            <MalzemeBekleyenKarti degerlendir={degerlendir} yenile={yenile} D={calisma.D} plandan={alim} />
            <FasonTerminKarti c={calisma} L={L} komut={komut} sadeceBos />
          </>
        )
        : <Kart baslik="Terminler" simge="flag"><p className="tc-pys-kucuk">Önce plan kurulmalı.</p></Kart>}
    </TumSatirlar>
  );

  if (!calisma || !p) {
    return (
      <div className="tc-pys" data-parca="terminler">
        <GorunumBasligi simge="flag" baslik="Malzeme ve fason terminleri" />
        <BosHarita metin="Henüz plan yok; malzemenin ve fasonun ne zaman gerektiği plandan çıkar.">
          {yetki.planYaz && <Dugme tur="birincil" simge="play" onClick={() => { git('plan'); }}>Planı kur</Dugme>}
        </BosHarita>
        {tum}
      </div>
    );
  }

  const c = calisma;
  const V = terminIsisi(c, [...malzemeKalemleri(c.D, alim ?? [], calismaSimdisi(c)), ...fasonKalemleri(c.D, L)]);
  const u = terminUyarisi(p);
  const fason = komut ? fasonTanimi(c, L, komut) : null;
  const acilim = (r: TerminSatiri, ck: string) => {
    const k = r.kalem;
    const cizelge = (j: string): AcilimSecenegi => ({ ad: `${j} çizelgede`, etki: 'Bu kalemi bekleyen siparişin adımlarını tezgâh çizelgesinde gösterir.', simge: 'gantt', yap: () => { git('plan'); } });
    const formlar: AcilimFormu[] = k.grup === 'fas'
      ? [{ ad: k.x.T == null ? 'Dönüş tarihini gir' : 'Dönüş tarihini değiştir', etki: 'Girilen gün kesin süre sayılır; plan onu kullanır.', simge: 'flag', tanim: fason, deg: { is: k.x.id }, adim: 1 }]
      : [];
    const j1 = k.grup === 'fas' ? k.x.r.job : k.m.isler[0];
    const secenekler: AcilimSecenegi[] = [
      ...(j1 ? [cizelge(j1)] : []),
      ...(k.grup === 'mal' ? [{ ad: 'Satın alma planı', etki: 'Bütün malzemelerin sipariş günlerini ve miktarlarını gösterir.', simge: 'box' as const, yap: () => { git('malzplan'); } }] : []),
    ];
    return (
      <FormluAcilim
        key={`${r.k}|${ck}`} baslik={`${r.ad} · ${k.durum}`} simge={r.simge} ton={r.ton} neden={k.neden} bilgi={k.bilgi.slice(0, 4)} formlar={formlar} secenekler={secenekler}
        planEski={c.plan !== null && !planGuncel(c)} iyilestirYetkisi={yetki.planYaz} kapat={() => { secimYaz(null); }}
      />
    );
  };
  const ileri = u ? <Dugme simge="next" disabled title={ILERI_SAHIBI}>{u.js.length} işi ileri at</Dugme> : null;

  return (
    <div className="tc-pys" data-parca="terminler">
      <GorunumBasligi simge="flag" baslik="Malzeme ve fason terminleri" alt="Kalem × gün, neyi bekliyor" ust={V.ust} eylem={ileri ?? undefined} />
      <section className="tc-pys-ana" aria-label="Isı haritası">
        <Lejant
          ogeler={[{ tur: 'kd', kd: 2, ad: 'Bekleme' }, { tur: 'kd', kd: 4, ad: 'İşi kaydıran bekleme' }, { tur: 'iyi', ad: 'Zamanında geliş' }, { tur: 'is', ad: 'Yolda / fasoncuda' }, { tur: 'tahmin', ad: 'Tahmini tarih' }, { tur: 'bayrak', ad: 'Plan istiyor' }]}
          simgeler={[['box', 'Malzeme'], ['truck', 'Fason']]}
        />
        <IsiIzgarasi etiket="Kalem × gün, neyi bekliyor" satirAd="Kalem" genis="gun" sutunlar={V.sutunlar} satirlar={V.satirlar} secim={secim} sec={secimYaz} gizliAd="zamanında gelenler" acilim={acilim} />
      </section>
      {tum}
    </div>
  );
}
