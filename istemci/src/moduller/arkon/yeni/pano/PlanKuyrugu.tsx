import { useEffect, useLayoutEffect, useRef, useState, type DragEvent } from 'react';
import {
  PLAN_ETIKETI, SIRA_ONAYI, adimIstegi, kuyrukAdimHedefi, kuyrukIsiMi, kuyrukSirasi, kuyrukTasimaIstegi, planEtiketi, planFarkOzeti, planReferanslari, planaOneriIstekleri,
  siraOnayi, siralamaIstegi, siralamayiGonder, tmiPlani, type KuyrukIstegi, type PlanReferansTuru, type PlanReferansi, type SiralamaIstegi,
} from '../../../../../../arkon/web/src/data/tmi-plan.ts';
import type { Pkg, Result } from '../../../../../../arkon/shared/model.ts';
import { Dugme, IsaretKutusu, OnayPenceresi, Simge } from '../../../../ortak/arayuz/index.ts';
import { useOturum } from '../../../../ortak/veri/oturum.ts';
import { dakikaMetni, gunAySaat, sayi } from '../cekirdek/bicim.ts';
import { istasyonBul, istasyonListesi } from '../cekirdek/tesis.ts';
import { suankiDurus } from '../cekirdek/vardiya.ts';
import { useArkon, useBelgeler, useSimdi } from '../veri/baglam.ts';
import {
  KART_DURUMLARI, OPTYPE_ADLARI, kalanMs, kartDurumu, seritSirala, takvimle, tasimaPlani, terminCoz, tmiIsi, type Tahmin,
} from './kurallar.ts';
import { Cip, IsMerkeziSuzgeci, Secmeli, SayfaCercevesi, gunlugeYaz, useSoyle, useYerelSecim, useYetkiDenetimi } from './ortak.tsx';
import { PlanliDuruslar } from './PlanliDuruslar.tsx';

// Plan Kuyruğu (pano-planlama.ts PlanApp, OrdersBoard) ve TMI menüsündeki Kuyruk (KuyrukApp): istasyon şeritleri, sıra, istasyon ataması,
// vardiya ve duruşa göre başlama ve bitiş tahmini. Kuyruk salt okunurdur; sıra ve istasyon yalnız Plan Kuyruğu'nda değişir.
// TMI işinin sırası Üretim Hazırlık'ındır (kart 527, 519 1 c): operatör bu sırayı izler, canlı plan kartta ve şerit başında referans olarak görünür;
// plan yalnız "Plana öner" ile taslağa gider.

const PAKET_ILETILERI = ['pkg', 'pkg-removed', 'pkg-approval', 'pkg-approved', 'progress'] as const;
const SONUC_ILETILERI = ['progress', 'result'] as const;

export function PlanKuyruguSayfasi() {
  const { ayarlar } = useArkon();
  const [sekme, sekmeYaz] = useYerelSecim<'orders' | 'downs'>('planTab', 'orders');
  const duruslar = ayarlar.planliDuruslar.filter((x) => x.active !== false).length;
  const ek = (
    <Secmeli etiket="Plan Kuyruğu görünümü" deger={sekme} degistir={sekmeYaz}
      secenekler={[{ k: 'orders', etiket: 'İş emirleri' }, { k: 'downs', etiket: 'Planlı duruşlar', sayi: duruslar || null }]} />
  );
  return (
    <SayfaCercevesi simge="list" baslik="Plan Kuyruğu" renk="hazard" ek={ek}>
      {sekme === 'orders' ? <IsEmirleri salt={false} /> : <PlanliDuruslar />}
    </SayfaCercevesi>
  );
}

export function KuyrukSayfasi() {
  return (
    <SayfaCercevesi simge="list" baslik="Plan Kuyruğu" renk="hazard" ek={<Cip renk="idle">Salt okunur</Cip>}>
      <IsEmirleri salt />
    </SayfaCercevesi>
  );
}

interface Onay { baslik: string; onayMetni: string; metin: string; devam: () => void }

function IsEmirleri({ salt }: { salt: boolean }) {
  const { depo, ayarlar, yetkiVar, saltOkunur } = useArkon();
  const izinli = useYetkiDenetimi();
  const soyle = useSoyle();
  const pk = useBelgeler<Pkg>('pkgs', PAKET_ILETILERI);
  const rs = useBelgeler<Result>('results', SONUC_ILETILERI);
  const [wc, wcYaz] = useYerelSecim('planWc', '');
  const [bitenler, bitenlerYaz] = useState(false);
  const [karsilastir, karsilastirYaz] = useYerelSecim('planKarsilastir', false);
  const [surukle, surukleYaz] = useState<string | null>(null);
  const [uzerinde, uzerindeYaz] = useState<string | null>(null);
  const [onay, onayYaz] = useState<Onay | null>(null);
  const simdi = useSimdi(60000);
  const oturum = useOturum();
  const planDuzenle = !salt && !saltOkunur && yetkiVar('plan.edit');
  // Kuyruk işlemi Arkon rolünden değil TMI yetkisinden gelir (522 2 a); sunucu ayrıca Arkon rolünü ve iş merkezi kapsamını denetler.
  const kuyrukDuzenle = !salt && !saltOkunur && (oturum.data?.islemler ?? []).includes('arkon.kuyruk-sirala');
  const duzenle = planDuzenle || kuyrukDuzenle;

  // Canlı plan sürümü paketlerden önce okunur: açılışta, sürüm yokken ve ret gelince önce sürüm, sonra paketler.
  const [planSurumu, planSurumuYaz] = useState<number | null>(null);
  const yenile = async () => {
    try { planSurumuYaz((await depo.Plan.surum()).planSurumu); } catch { planSurumuYaz(null); }
    pk.yenile();
    rs.yenile();
  };
  // Açılışta bir kez; düzenleme yetkisi yoksa sürüm okunmaz.
  useEffect(() => { if (planDuzenle) void yenile(); }, []);

  const R = Object.fromEntries(rs.liste.map((r) => [r.id, r]));
  const bitti = (p: Pkg) => R[p.id]?.state === 'done';
  const seritler = istasyonListesi(ayarlar.tesis).filter((s) => !wc || s.wc === wc);
  const bilinen = new Set(istasyonListesi(ayarlar.tesis, true).map((s) => s.id));
  const isler = pk.liste.filter((p) => bitenler || !bitti(p));
  const yeniden = () => { pk.yenile(); rs.yenile(); };

  const planaGonder = async (p: Pkg, st: string, istek: SiralamaIstegi | null) => {
    if (!istek) { soyle('Plan sırası değişmedi', 'bilgi'); return; }
    const r = await siralamayiGonder(istek, planSurumu, (g) => depo.Plan.sirala(g));
    if (r.sonuc === 'yazildi') {
      gunlugeYaz(depo, 'plan', 'plan taslağına sıra', p.no, st);
      soyle('Sıra taslağa yazıldı · onaylanıp canlıya alınınca geçerli', 'bilgi');
      yeniden();
      return;
    }
    soyle(r.ileti, 'hata');
    if (r.yenile) await yenile();
  };
  // Rotalı TMI işinin sırası planındır (A4, 147 a): plan taslağına yazılır; taslak onaylanıp canlıya alınınca değişir.
  const planaSirala = async (p: Pkg, st: string, onceki?: string | null) => {
    if (!tmiPlani(p)?.canli) { soyle('Plana yerleşmemiş iş sıralanamaz', 'hata'); return; }
    const once = seritSirala(isler.filter((x) => x.machine === st));
    const yeni = once.filter((x) => x.id !== p.id);
    const i = onceki ? yeni.findIndex((x) => x.id === onceki) : -1;
    yeni.splice(i < 0 ? yeni.length : i, 0, p);
    await planaGonder(p, st, siralamaIstegi(once, yeni, p));
  };
  const yaz = async (p: Pkg, st: string, onceki?: string | null) => {
    const plan = tasimaPlani(isler, p, st, onceki);
    for (const x of plan.yazilacaklar) await depo.DB.put('pkgs', x);
    if (plan.tasindi && p.status !== 'draft') {
      depo.Bus.send({ type: 'pkg-removed', id: p.id });
      depo.Bus.send({ type: 'pkg', id: p.id, no: p.no, rev: p.rev, version: p.version, machine: st });
    } else depo.Bus.send({ type: 'pkg-order', machine: st });
    gunlugeYaz(depo, 'plan', plan.tasindi ? 'istasyon değişti' : 'sıra değişti', p.no, plan.tasindi ? `${p.machine} → ${st}` : `${st} · ${plan.sira + 1}. sıra`);
    soyle(plan.tasindi ? `${p.no} → ${st}` : `${p.no} sırası güncellendi`);
    yeniden();
  };
  // Kuyruk isteği istasyonun bütün açık TMI işleriyle gider (gizli tamamlananlar dahil): sunucu da aynı işleri sayar, eksik liste 409 alır.
  const istasyonPaketleri = (st: string) => seritSirala(pk.liste.filter((x) => x.machine === st));
  const kuyrukGonder = async (p: Pkg | null, st: string, istek: KuyrukIstegi | null) => {
    if (!istek) { soyle('Kuyruk sırası değişmedi', 'bilgi'); return; }
    try {
      await depo.Kuyruk.sirala(istek);
      gunlugeYaz(depo, 'plan', 'kuyruk sırası', p?.no ?? st, st);
      soyle(p ? `${p.no} kuyruk sırası güncellendi` : `${st} kuyruk sırası güncellendi`);
    } catch (e) {
      soyle((e as { message?: string } | null)?.message || 'Kuyruk sırası yazılamadı', 'hata');
    }
    yeniden();
  };
  const kuyrukTasi = async (p: Pkg, st: string, onceki?: string | null) => {
    if (!kuyrukDuzenle) { soyle('Yetkin yok: Üretim kuyruğunun sırasını değiştirme', 'hata'); return; }
    await kuyrukGonder(p, st, kuyrukTasimaIstegi(st, istasyonPaketleri(st), p, onceki));
  };
  const planaDon = (st: string) => onayYaz({
    baslik: 'Plan sırasına dön', onayMetni: 'Plan sırasına dön',
    metin: `${st} istasyonunun Hazırlık sırası silinir; kuyruk yeniden canlı plan sırasıyla dizilir.`,
    devam: () => {
      void depo.Kuyruk.planaDon(st).then(
        () => { gunlugeYaz(depo, 'plan', 'kuyruk plan sırasına döndü', st); soyle(`${st} kuyruğu plan sırasında`); },
        (e: unknown) => { soyle((e as { message?: string } | null)?.message || 'Kuyruk plan sırasına dönemedi', 'hata'); },
      ).finally(yeniden);
    },
  });
  // Plana öner: kuyruğun dizilişi kaynak başına plan taslağına yazılır (A4 komutu); müdür onaylayıp canlıya alınca plan da böyle olur.
  const planaOner = async (st: string) => {
    if (!izinli('plan.edit')) return;
    const istekler = planaOneriIstekleri(istasyonPaketleri(st).filter(kuyrukIsiMi));
    if (!istekler.length) { soyle('Kuyruk planla aynı sırada', 'bilgi'); return; }
    for (const istek of istekler) {
      const r = await siralamayiGonder(istek, planSurumu, (g) => depo.Plan.sirala(g));
      if (r.sonuc !== 'yazildi') { soyle(r.ileti, 'hata'); if (r.yenile) await yenile(); return; }
    }
    gunlugeYaz(depo, 'plan', 'kuyruk plana önerildi', st, `${istekler.length} kaynak`);
    soyle('Kuyruk sırası plan taslağına yazıldı · onaylanıp canlıya alınınca geçerli', 'bilgi');
    await yenile();
  };
  // TMI'den gelen işin istasyonu TMI planından değişir; aynı şeritte sıra değiştirme serbesttir.
  const tasi = async (p: Pkg, st: string, onceki?: string | null) => {
    if (tmiIsi(p) && p.machine !== st) { soyle('İstasyon TMI planından değişir', 'hata'); return; }
    if (kuyrukIsiMi(p)) { await kuyrukTasi(p, st, onceki); return; }
    if (!izinli('plan.edit')) return;
    if (tmiPlani(p)) { await planaSirala(p, st, onceki); return; }
    const mt = istasyonBul(ayarlar.tesis, st).t;
    const pt = p.opType && Object.hasOwn(OPTYPE_ADLARI, p.opType) ? p.opType : 'cnc';
    if (bilinen.has(st) && mt !== pt) {
      onayYaz({
        baslik: 'İstasyon tipi farklı', onayMetni: 'Taşı',
        metin: `${p.no} bir ${OPTYPE_ADLARI[pt]} paketi; ${st} istasyonu ${OPTYPE_ADLARI[mt] ?? OPTYPE_ADLARI.cnc} tipinde. Yine de taşınsın mı?`,
        devam: () => { void yaz(p, st, onceki); },
      });
      return;
    }
    await yaz(p, st, onceki);
  };
  const adim = (p: Pkg, st: string, yon: -1 | 1) => {
    const L = seritSirala(isler.filter((x) => x.machine === st));
    if (kuyrukIsiMi(p)) {
      const h = kuyrukAdimHedefi(L, p, yon);
      if (h !== null) void kuyrukTasi(p, st, h);
      return;
    }
    if (tmiPlani(p)) {
      if (!izinli('plan.edit')) return;
      if (!tmiPlani(p)?.canli) { soyle('Plana yerleşmemiş iş sıralanamaz', 'hata'); return; }
      void planaGonder(p, st, adimIstegi(L, p, yon));
      return;
    }
    const i = L.findIndex((x) => x.id === p.id);
    const j = i + yon;
    if (j < 0 || j >= L.length) return;
    void tasi(p, st, yon < 0 ? L[j]!.id : L[j + 1]?.id);
  };
  const birak = (o: DragEvent, st: string, onceki?: string) => {
    o.preventDefault();
    o.stopPropagation();
    const x = pk.liste.find((q) => q.id === o.dataTransfer.getData('text/plain'));
    uzerindeYaz(null);
    if (x && x.id !== onceki) void tasi(x, st, onceki);
  };

  const kart = (p: Pkg, st: string, sc: Tahmin | undefined, ref: PlanReferansi | undefined) => {
    const r = R[p.id];
    const iyi = r?.good || 0;
    const termin = terminCoz(p.due, p.createdAt);
    const gec = !!(termin && sc && sc.end && sc.end > termin);
    const calisiyor = r?.state === 'running';
    const dur = KART_DURUMLARI[kartDurumu(p, r)];
    const oynar = kuyrukIsiMi(p) ? kuyrukDuzenle : planDuzenle;
    return (
      <div key={p.id} className="tc-ay3-kutu tc-ay3-kart" data-kayma={p.id} data-gec={gec || undefined} data-suruklenen={surukle === p.id || undefined}
        data-uzerinde={(surukle && surukle !== p.id && uzerinde === p.id) || undefined}
        draggable={oynar} aria-label={`${p.no} ${p.part || 'Adsız parça'}`}
        onDragStart={(o) => { surukleYaz(p.id); o.dataTransfer.setData('text/plain', p.id); }}
        onDragEnd={() => { surukleYaz(null); uzerindeYaz(null); }}
        onDragOver={(o) => { if (surukle) { o.preventDefault(); uzerindeYaz(p.id); } }}
        onDrop={(o) => birak(o, st, p.id)}>
        <div className="tc-ay3-kart-ust">
          <span className="mono">{p.no}</span>
          {p.priority === 'urgent' && <Cip renk="stop">Acil</Cip>}
          <Cip renk={dur.renk}>{calisiyor ? 'Çalışıyor' : dur.etiket}</Cip>
          <PlanCipi p={p} />
          {ref && ref.tur !== 'disi' && <PlanReferansCipi r={ref} />}
        </div>
        <b>{p.part || 'Adsız parça'}</b>
        <small className="tc-ay3-not">{p.op || ''} · Rev {p.rev}</small>
        <progress className="tc-ay3-cubuk" max={1} value={p.target ? Math.min(1, iyi / p.target) : 0} aria-label="İlerleme" />
        <div className="tc-ay3-iki"><span>{sayi(iyi)} / {sayi(p.target || 0)}</span><span>{dakikaMetni(kalanMs(p, r))}</span></div>
        <div className="tc-ay3-iki">
          <span>{sc?.start ? `Başlar ${gunAySaat(sc.start)}` : ''}</span>
          <span className={gec ? 'tc-ay3-gec' : undefined}>{sc?.end ? `Biter ${gunAySaat(sc.end)}` : sc ? 'Takvime sığmıyor' : ''}</span>
        </div>
        {p.due && <div className="tc-ay3-iki"><span>Termin {p.due}</span>{gec && <span className="tc-ay3-gec">Gecikecek</span>}</div>}
        {ref?.saat && <small className="tc-ay3-not">Planda {gunAySaat(Date.parse(ref.saat.baslangic))} – {gunAySaat(Date.parse(ref.saat.bitis))}</small>}
        {oynar && (
          <div className="tc-ay3-dugmeler">
            <button type="button" className="tc-ay3-secim" onClick={() => adim(p, st, -1)} aria-label="Yukarı"><Simge ad="up" boyut="k" /></button>
            <button type="button" className="tc-ay3-secim" onClick={() => adim(p, st, 1)} aria-label="Aşağı"><Simge ad="down" boyut="k" /></button>
            {planDuzenle && (
              <select className="tc-ay3-secim" aria-label="İstasyona taşı" value={bilinen.has(st) ? st : ''} disabled={tmiIsi(p)}
                title={tmiIsi(p) ? 'İstasyon TMI planından değişir' : undefined}
                onChange={(o) => { if (o.target.value) void tasi(p, o.target.value); }}>
                <option value="">Taşı…</option>
                {istasyonListesi(ayarlar.tesis).map((s) => <option key={s.id} value={s.id}>{s.id}</option>)}
              </select>
            )}
          </div>
        )}
      </div>
    );
  };

  const serit = (id: string, baslik: string, alt: string, L: readonly Pkg[], istasyonlu: boolean) => {
    const sirali = seritSirala(L);
    const sc = istasyonlu ? takvimle(id, sirali.map((p) => ({ ms: bitti(p) ? 0 : kalanMs(p, R[p.id]) })), simdi, ayarlar) : [];
    const toplam = sirali.reduce((t, p) => t + (bitti(p) ? 0 : kalanMs(p, R[p.id])), 0);
    const son = sc.length ? sc[sc.length - 1]!.end : null;
    const refler = istasyonlu ? planReferanslari(sirali) : new Map<Pkg, PlanReferansi>();
    const ozet = planFarkOzeti(refler.values());
    const hazirlikSirali = istasyonlu && sirali.some((p) => kuyrukSirasi(p) !== null);
    const oneri = istasyonlu && planDuzenle && ozet !== null && ozet.tur !== 'ayni';
    const yanYana = istasyonlu && karsilastir;
    const kartlar = (
      <>
        {sirali.map((p, i) => kart(p, id, sc[i], refler.get(p)))}
        {!sirali.length && <small className="tc-ay3-not tc-ay3-serit-bos">{duzenle ? 'İş emri sürükle' : 'İş yok'}</small>}
      </>
    );
    return (
      <section key={id} className="tc-ay3-kutu tc-ay3-serit" aria-label={`Şerit ${baslik}`} data-karsilastir={yanYana || undefined} data-uzerinde={(surukle && uzerinde === `serit:${id}`) || undefined}
        onDragOver={(o) => { if (surukle) { o.preventDefault(); if (uzerinde !== `serit:${id}` && !sirali.some((p) => p.id === uzerinde)) uzerindeYaz(`serit:${id}`); } }}
        onDrop={(o) => { if (istasyonlu) birak(o, id); else { o.preventDefault(); uzerindeYaz(null); } }}>
        <div className="tc-ay3-serit-bas">
          <b className="mono">{baslik}</b><small className="tc-ay3-not" title={alt}>{alt}</small>
          <div className="tc-ay3-not">{sirali.length} iş · {dakikaMetni(toplam)}{son ? ` · biter ${gunAySaat(son)}` : ''}</div>
          {istasyonlu && suankiDurus(id, simdi, ayarlar.planliDuruslar, ayarlar.tesis) && <Cip renk="done">Planlı duruşta</Cip>}
          {ozet && <Cip renk={REFERANS_RENGI[ozet.tur]} simge="gantt" baslik="Kuyruk Hazırlık'ın sırasıdır; plan referanstır">{ozet.metin}</Cip>}
        </div>
        {yanYana ? (
          <div className="tc-ay3-karsilastir">
            <PlanSutunu istasyon={id} refler={refler} />
            <div className="tc-ay3-karsilastir-sutun" role="group" aria-label={`Kuyruk ${baslik}`}>
              <small className="tc-ay3-not tc-ay3-karsilastir-bas"><Simge ad="list" boyut="k" />Kuyruk</small>
              {kartlar}
            </div>
          </div>
        ) : kartlar}
        {((kuyrukDuzenle && hazirlikSirali) || oneri) && (
          <div className="tc-ay3-dugmeler tc-ay3-serit-alt">
            {kuyrukDuzenle && hazirlikSirali && <Dugme simge="rotate" onClick={() => planaDon(id)}>Plan sırasına dön</Dugme>}
            {oneri && <Dugme simge="gantt" onClick={() => { void planaOner(id); }}>Plana öner</Dugme>}
          </div>
        )}
      </section>
    );
  };

  const sahipsiz = isler.filter((p) => !bilinen.has(p.machine));
  const kok = useKayma(`${karsilastir}|${wc}|${bitenler}`);
  return (
    <div className="tc-ay3-sayfa">
      <div className="tc-ay3-arac tc-ay3-kuyruk-arac">
        <IsMerkeziSuzgeci deger={wc} degistir={wcYaz} />
        <IsaretKutusu etiket="Tamamlananları göster" checked={bitenler} onChange={(o) => bitenlerYaz(o.target.checked)} />
        <IsaretKutusu etiket="Planla karşılaştır" checked={karsilastir} onChange={(o) => karsilastirYaz(o.target.checked)} />
        <span className="tc-ay3-bosluk" />
        <small className="tc-ay3-not">Tahminler vardiya, mola ve planlı duruşlara göre · kalan adet × çevrim süresi</small>
      </div>
      <div className="tc-ay3-seritler" ref={kok}>
        {sahipsiz.length > 0 && serit('-', 'Atanmamış', 'İstasyonu tanımsız', sahipsiz, false)}
        {seritler.map((s) => serit(s.id, s.id, s.name + (s.wcName ? ` · ${s.wcName}` : ''), isler.filter((p) => p.machine === s.id), true))}
      </div>
      <OnayPenceresi acik={onay !== null} baslik={onay?.baslik ?? ''} onayMetni={onay?.onayMetni}
        onayla={() => { const o = onay; onayYaz(null); o?.devam(); }} vazgec={() => onayYaz(null)}>
        <p>{onay?.metin}</p>
      </OnayPenceresi>
    </div>
  );
}

// Şeridin canlı plan sırası, kuyruğun yanında salt okunur: plandaki yeri kuyruktakinden farklı ya da plana yeni girmiş iş vurgulanır.
function PlanSutunu({ istasyon, refler }: { istasyon: string; refler: ReadonlyMap<Pkg, PlanReferansi> }) {
  const satirlar = [...refler].filter(([, r]) => r.tur !== 'disi')
    .map(([p, r]) => ({ p, r, d: tmiPlani(p)! }))
    .sort((a, b) => (a.d.sira ?? 0) - (b.d.sira ?? 0) || (a.d.kaynak?.tur ?? '').localeCompare(b.d.kaynak?.tur ?? '') || (a.d.kaynak?.id ?? 0) - (b.d.kaynak?.id ?? 0));
  return (
    <div className="tc-ay3-karsilastir-sutun" role="group" aria-label={`Canlı plan ${istasyon}`}>
      <small className="tc-ay3-not tc-ay3-karsilastir-bas" title="Canlı plan (referans); sıra kuyrukta değişir"><Simge ad="gantt" boyut="k" />Canlı plan</small>
      {satirlar.map(({ p, r, d }) => (
        <div key={p.id} className="tc-ay3-plan-satir" data-fark={r.tur === 'ayni' ? undefined : r.tur} aria-label={`${p.no} ${r.metin}`}>
          <b className="mono">{d.sira}.</b>
          <span className="tc-ay3-plan-ad"><span className="mono">{p.no}</span> {p.part || 'Adsız parça'}</span>
          <small className="tc-ay3-not">{r.saat ? `${gunAySaat(Date.parse(r.saat.baslangic))} – ${gunAySaat(Date.parse(r.saat.bitis))}` : r.metin}</small>
        </div>
      ))}
      {!satirlar.length && <small className="tc-ay3-not tc-ay3-serit-bos">Planda iş yok</small>}
    </div>
  );
}

// Sıra değişince kartlar eski yerinden yenisine kayar (FLIP): yeni yer ölçülür, kart eski yerine çekilir, sonra hareket süresiyle bırakılır.
// Yerler şerit kabına göre tutulur, kaydırma kayma sayılmaz; düzen (karşılaştırma, süzgeç) değişince yalnız yerler yenilenir.
function useKayma(duzen: string) {
  const kok = useRef<HTMLDivElement>(null);
  const once = useRef<{ duzen: string; yer: Map<string, { x: number; y: number }> } | null>(null);
  useLayoutEffect(() => {
    const k = kok.current;
    if (!k) return undefined;
    const kr = k.getBoundingClientRect();
    const ogeler = [...k.querySelectorAll<HTMLElement>('[data-kayma]')];
    const yer = new Map(ogeler.map((el) => {
      const r = el.getBoundingClientRect();
      return [el.dataset.kayma ?? '', { x: r.left - kr.left + k.scrollLeft, y: r.top - kr.top + k.scrollTop }] as const;
    }));
    const o = once.current;
    once.current = { duzen, yer };
    if (!o || o.duzen !== duzen) return undefined;
    const kayanlar = ogeler.filter((el) => {
      const a = o.yer.get(el.dataset.kayma ?? ''), b = yer.get(el.dataset.kayma ?? '');
      if (!a || !b || (a.x === b.x && a.y === b.y)) return false;
      el.style.setProperty('--kayma-x', `${a.x - b.x}px`);
      el.style.setProperty('--kayma-y', `${a.y - b.y}px`);
      el.setAttribute('data-kayiyor', '');
      return true;
    });
    if (!kayanlar.length) return undefined;
    void k.offsetHeight;
    const birak = () => { for (const el of kayanlar) el.removeAttribute('data-kayiyor'); };
    const a = requestAnimationFrame(birak);
    return () => { cancelAnimationFrame(a); birak(); };
  });
  return kok;
}

const REFERANS_RENGI: Record<PlanReferansTuru, 'idle' | 'hold' | 'stop' | 'cmm'> = { ayni: 'idle', farkli: 'hold', disi: 'stop', yeni: 'cmm' };

// Kuyruktaki işin canlı plandaki yeri; plan dışı iş PlanCipi'nin etiketiyle zaten görünür.
function PlanReferansCipi({ r }: { r: PlanReferansi }) {
  return <Cip renk={REFERANS_RENGI[r.tur]} simge="gantt" baslik="Canlı plan (referans)">{r.metin}</Cip>;
}

// Rotalı işin plan durumu ve taslaktaki sıra (hazirlik.ts PlanChip).
export function PlanCipi({ p, sira = false }: { p: Pkg; sira?: boolean }) {
  const e = planEtiketi(p);
  const d = tmiPlani(p);
  const o = siraOnayi(p);
  return (
    <>
      {e && <Cip renk={e === 'planlanmadi' ? 'idle' : e === 'kaynak-farkli' ? 'stop' : 'hold'} simge={e === 'hazirlik-bekliyor' ? 'clock' : 'alert'}>{PLAN_ETIKETI[e]}</Cip>}
      {o && <Cip renk={o === 'taslakta' ? 'idle' : 'hold'} simge="clock" baslik="Sıra canlıya plan onaylanıp canlıya alınınca geçer">{SIRA_ONAYI[o]}</Cip>}
      {sira && d?.canli && d.sira ? <small className="tc-ay3-not">Plan sırası {d.sira}</small> : null}
    </>
  );
}
