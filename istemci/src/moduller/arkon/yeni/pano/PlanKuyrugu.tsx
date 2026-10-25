import { useEffect, useState, type DragEvent } from 'react';
import {
  PLAN_ETIKETI, SIRA_ONAYI, adimIstegi, planEtiketi, siraOnayi, siralamaIstegi, siralamayiGonder, tmiPlani, type SiralamaIstegi,
} from '../../../../../../arkon/web/src/data/tmi-plan.ts';
import type { Pkg, Result } from '../../../../../../arkon/shared/model.ts';
import { IsaretKutusu, OnayPenceresi, Simge } from '../../../../ortak/arayuz/index.ts';
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

interface Onay { metin: string; devam: () => void }

function IsEmirleri({ salt }: { salt: boolean }) {
  const { depo, ayarlar, yetkiVar, saltOkunur } = useArkon();
  const izinli = useYetkiDenetimi();
  const soyle = useSoyle();
  const pk = useBelgeler<Pkg>('pkgs', PAKET_ILETILERI);
  const rs = useBelgeler<Result>('results', SONUC_ILETILERI);
  const [wc, wcYaz] = useYerelSecim('planWc', '');
  const [bitenler, bitenlerYaz] = useState(false);
  const [surukle, surukleYaz] = useState<string | null>(null);
  const [uzerinde, uzerindeYaz] = useState<string | null>(null);
  const [onay, onayYaz] = useState<Onay | null>(null);
  const simdi = useSimdi(60000);
  const duzenle = !salt && !saltOkunur && yetkiVar('plan.edit');

  // Canlı plan sürümü paketlerden önce okunur: açılışta, sürüm yokken ve ret gelince önce sürüm, sonra paketler.
  const [planSurumu, planSurumuYaz] = useState<number | null>(null);
  const yenile = async () => {
    try { planSurumuYaz((await depo.Plan.surum()).planSurumu); } catch { planSurumuYaz(null); }
    pk.yenile();
    rs.yenile();
  };
  // Açılışta bir kez; düzenleme yetkisi yoksa sürüm okunmaz.
  useEffect(() => { if (duzenle) void yenile(); }, []);

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
  // TMI'den gelen işin istasyonu TMI planından değişir; aynı şeritte sıra değiştirme serbesttir.
  const tasi = async (p: Pkg, st: string, onceki?: string | null) => {
    if (!izinli('plan.edit')) return;
    if (tmiIsi(p) && p.machine !== st) { soyle('İstasyon TMI planından değişir', 'hata'); return; }
    if (tmiPlani(p)) { await planaSirala(p, st, onceki); return; }
    const mt = istasyonBul(ayarlar.tesis, st).t;
    const pt = p.opType && Object.hasOwn(OPTYPE_ADLARI, p.opType) ? p.opType : 'cnc';
    if (bilinen.has(st) && mt !== pt) {
      onayYaz({
        metin: `${p.no} bir ${OPTYPE_ADLARI[pt]} paketi; ${st} istasyonu ${OPTYPE_ADLARI[mt] ?? OPTYPE_ADLARI.cnc} tipinde. Yine de taşınsın mı?`,
        devam: () => { void yaz(p, st, onceki); },
      });
      return;
    }
    await yaz(p, st, onceki);
  };
  const adim = (p: Pkg, st: string, yon: -1 | 1) => {
    const L = seritSirala(isler.filter((x) => x.machine === st));
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

  const kart = (p: Pkg, st: string, sc: Tahmin | undefined) => {
    const r = R[p.id];
    const iyi = r?.good || 0;
    const termin = terminCoz(p.due, p.createdAt);
    const gec = !!(termin && sc && sc.end && sc.end > termin);
    const calisiyor = r?.state === 'running';
    const dur = KART_DURUMLARI[kartDurumu(p, r)];
    return (
      <div key={p.id} className="tc-ay3-kutu tc-ay3-kart" data-gec={gec || undefined} data-uzerinde={uzerinde === p.id || undefined}
        draggable={duzenle} aria-label={`${p.no} ${p.part || 'Adsız parça'}`}
        onDragStart={(o) => { surukleYaz(p.id); o.dataTransfer.setData('text/plain', p.id); }}
        onDragEnd={() => { surukleYaz(null); uzerindeYaz(null); }}
        onDragOver={(o) => { if (surukle) { o.preventDefault(); uzerindeYaz(p.id); } }}
        onDrop={(o) => birak(o, st, p.id)}>
        <div className="tc-ay3-kart-ust">
          <span className="mono">{p.no}</span>
          {p.priority === 'urgent' && <Cip renk="stop">Acil</Cip>}
          <Cip renk={dur.renk}>{calisiyor ? 'Çalışıyor' : dur.etiket}</Cip>
          <PlanCipi p={p} />
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
        {duzenle && (
          <div className="tc-ay3-dugmeler">
            <button type="button" className="tc-ay3-secim" onClick={() => adim(p, st, -1)} aria-label="Yukarı"><Simge ad="up" boyut="k" /></button>
            <button type="button" className="tc-ay3-secim" onClick={() => adim(p, st, 1)} aria-label="Aşağı"><Simge ad="down" boyut="k" /></button>
            <select className="tc-ay3-secim" aria-label="İstasyona taşı" value={bilinen.has(st) ? st : ''} disabled={tmiIsi(p)}
              title={tmiIsi(p) ? 'İstasyon TMI planından değişir' : undefined}
              onChange={(o) => { if (o.target.value) void tasi(p, o.target.value); }}>
              <option value="">Taşı…</option>
              {istasyonListesi(ayarlar.tesis).map((s) => <option key={s.id} value={s.id}>{s.id}</option>)}
            </select>
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
    return (
      <section key={id} className="tc-ay3-kutu tc-ay3-serit" aria-label={`Şerit ${baslik}`} data-uzerinde={(surukle && uzerinde === `serit:${id}`) || undefined}
        onDragOver={(o) => { if (surukle) { o.preventDefault(); if (uzerinde !== `serit:${id}` && !sirali.some((p) => p.id === uzerinde)) uzerindeYaz(`serit:${id}`); } }}
        onDrop={(o) => { if (istasyonlu) birak(o, id); else { o.preventDefault(); uzerindeYaz(null); } }}>
        <div>
          <b className="mono">{baslik}</b> <small className="tc-ay3-not">{alt}</small>
          <div className="tc-ay3-not">{sirali.length} iş · {dakikaMetni(toplam)}{son ? ` · biter ${gunAySaat(son)}` : ''}</div>
          {istasyonlu && suankiDurus(id, simdi, ayarlar.planliDuruslar, ayarlar.tesis) && <Cip renk="done">Planlı duruşta</Cip>}
        </div>
        {sirali.map((p, i) => kart(p, id, sc[i]))}
        {!sirali.length && <small className="tc-ay3-not">{duzenle ? 'İş emri sürükle' : 'İş yok'}</small>}
      </section>
    );
  };

  const sahipsiz = isler.filter((p) => !bilinen.has(p.machine));
  return (
    <div className="tc-ay3-sayfa">
      <div className="tc-ay3-arac">
        <IsMerkeziSuzgeci deger={wc} degistir={wcYaz} />
        <IsaretKutusu etiket="Tamamlananları göster" checked={bitenler} onChange={(o) => bitenlerYaz(o.target.checked)} />
        <span className="tc-ay3-bosluk" />
        <small className="tc-ay3-not">Tahminler vardiya, mola ve planlı duruşlara göre · kalan adet × çevrim süresi</small>
      </div>
      <div className="tc-ay3-seritler">
        {sahipsiz.length > 0 && serit('-', 'Atanmamış', 'İstasyonu tanımsız', sahipsiz, false)}
        {seritler.map((s) => serit(s.id, s.id, s.name + (s.wcName ? ` · ${s.wcName}` : ''), isler.filter((p) => p.machine === s.id), true))}
      </div>
      <OnayPenceresi acik={onay !== null} baslik="İstasyon tipi farklı" onayMetni="Taşı"
        onayla={() => { const o = onay; onayYaz(null); o?.devam(); }} vazgec={() => onayYaz(null)}>
        <p>{onay?.metin}</p>
      </OnayPenceresi>
    </div>
  );
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
