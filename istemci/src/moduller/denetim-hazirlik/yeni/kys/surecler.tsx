import { useEffect, useState } from 'react';
import { Dugme, Girdi, Secim, Simge } from '../../../../ortak/arayuz/index.ts';
import { useForm } from '../../../../ortak/veri/form.ts';
import { useDenetim } from '../baglam.tsx';
import { PROC_TPL } from '../icerik/kys-yapi.ts';
import { PTYPE } from '../icerik/programlar.ts';
import { gostergeAylari, gostergeSon, gostergeTuttu } from '../kurallar/kys.ts';
import { kysNormalize, yeniKimlik } from '../normalize.ts';
import type { Surec, SurecTuru } from '../tipler.ts';
import { ayAdi, hedefMetni, sayiMetni } from './dokuman-metni.ts';
import { SatirOnayi } from '../program/ortak.tsx';
import { Bolum, kaydir, KISI_LISTESI, useKysGecisi } from './ortak.tsx';

// Süreçler (prototip kysSurec, procForm): süreç haritası, süreç kartı formu, aylık gösterge ve son 6 ay eğrisi.

const TURLER: readonly SurecTuru[] = ['y', 'a', 'd'];

// Kaplumbağa şemasındaki "Süreci düzenle" Süreçler sekmesine geçip formu açar (prototip data-pedit + ktab2).
export function useSureciDuzenle(): (id: string) => void {
  const d = useDenetim();
  const [, yaz] = useKysGecisi();
  return (id) => { yaz({ surec: id }); d.ekranDegistir((e) => { e.kys.tab = 'surec'; }); };
}
type Ton = 'iyi' | 'kotu' | 'soluk';
const ton = (ok: boolean | null): Ton => (ok === null ? 'soluk' : ok ? 'iyi' : 'kotu');

function Egri({ p }: { p: Surec }) {
  const ms = gostergeAylari(6);
  const vs = ms.map((m) => p.vals[m]);
  const nums = vs.filter((v): v is number => v !== undefined).concat(p.target === '' ? [] : [p.target]);
  if (!nums.length) return <span className="tc-dhk-soluk">Veri yok</span>;
  let mn = Math.min(...nums), mx = Math.max(...nums);
  if (mx === mn) { mx += 1; mn -= 1; }
  const W = 120, H = 34;
  const X = (i: number) => 4 + (i * (W - 8)) / 5;
  const Y = (v: number) => 4 + (H - 8) * (1 - (v - mn) / (mx - mn));
  const pts = vs.flatMap((v, i) => (v === undefined ? [] : [{ x: X(i), y: Y(v), ok: gostergeTuttu(p, v) }]));
  return (
    <svg className="tc-dhk-egri" viewBox={`0 0 ${String(W)} ${String(H)}`} aria-hidden="true">
      {p.target !== '' && <line className="tc-dhk-egri-hedef" x1="0" x2={W} y1={Y(p.target)} y2={Y(p.target)} strokeDasharray="3 3" />}
      {pts.length > 1 && <polyline className="tc-dhk-egri-cizgi" points={pts.map((q) => `${q.x.toFixed(1)},${q.y.toFixed(1)}`).join(' ')} fill="none" strokeWidth="1.5" />}
      {pts.map((q, i) => <circle key={i} className={`tc-dhk-d-${ton(q.ok) === 'soluk' ? 'yazi3' : ton(q.ok)}`} cx={q.x} cy={q.y} r="3" />)}
    </svg>
  );
}

interface SurecFormu {
  id: string; name: string; type: SurecTuru; owner: string; kpi: string; inputs: string; res: string; who: string; how: string; risk: string;
  outputs: string; dir: 'le' | 'ge'; target: string; unit: string; vals: Record<string, string>;
}
const formdan = (p: Surec): SurecFormu => ({
  ...p, target: p.target === '' ? '' : String(p.target), vals: Object.fromEntries(Object.entries(p.vals).map(([m, v]) => [m, String(v)])),
});
const bosSurec = (): Surec => ({
  id: `s${yeniKimlik()}`, type: 'a', name: '', owner: '', inputs: '', outputs: '', kpi: '', unit: '', target: '', dir: 'ge', res: '', who: '', how: '', risk: '', vals: {},
});

export function eksikMetni(p: Surec): string | null {
  const m = [!p.owner ? 'sahibi' : '', !p.kpi ? 'göstergesi' : '', p.kpi && p.target === '' ? 'hedefi' : ''].filter(Boolean);
  if (!m.length) return null;
  const t = m.length > 1 ? `${m.slice(0, -1).join(', ')} ve ${m[m.length - 1] ?? ''}` : m[0] ?? '';
  return `Sürecin ${t} eksik. Denetçi süreç sahibine ve göstergeye bakar.`;
}

export function Surecler() {
  const d = useDenetim();
  const P = d.profil.kys.procs;
  const [acik, acikYaz] = useState<Surec | null>(null);
  const yaz = d.yetki.yazabilir;
  const ac = (p: Surec) => { if (yaz) acikYaz(structuredClone(p)); };
  const [gecis, gecisYaz] = useKysGecisi();
  useEffect(() => {
    if (!gecis.surec) return;
    const p = P.find((x) => x.id === gecis.surec);
    gecisYaz({ surec: '' });
    if (p) ac(p);
  // Yalnız sekmeye gelişte bir kez.
  }, []);
  const sablonEkle = () => {
    d.degistir('Süreç şablonu', (t) => {
      for (const s of PROC_TPL) {
        t.kys.procs.push({
          id: `s${yeniKimlik()}`, type: s[0] as SurecTuru, name: s[1], owner: s[2], inputs: s[3], outputs: s[4], kpi: s[5], unit: s[6], target: s[7], dir: s[8],
          res: s[9], who: s[10], how: s[11], risk: s[12], vals: {},
        });
      }
    }, { bildirim: `${String(PROC_TPL.length)} süreç eklendi; sahiplerini ve hedeflerini düzenleyin` });
  };
  return (
    <>
      <Bolum baslik="Süreç haritası" simge="rotate" sag={yaz && (
        <>
          {!P.length && <Dugme simge="plus" onClick={sablonEkle}>Tipik üretim süreçlerini ekle</Dugme>}
          <Dugme tur="birincil" simge="plus" onClick={() => { acikYaz(bosSurec()); }}>Süreç ekle</Dugme>
        </>
      )}>
        {!P.length ? (
          <div className="tc-dhk-bos-kutu">
            <Simge ad="rotate" boyut="b" />
            <h4>Süreçlerinizi tanımlayın</h4>
            <p>Her sürecin sahibi, girdi ve çıktıları ile en az bir göstergesi olmalı. Tipik bir talaşlı imalat firmasının süreçleriyle başlayıp kendinize göre düzenleyebilirsiniz.</p>
          </div>
        ) : (
          <div className="tc-dhk-harita">
            {TURLER.map((t) => {
              const ps = P.filter((p) => p.type === t);
              return (
                <div key={t} className="tc-dhk-serit" data-tur={t}>
                  <div className="tc-dhk-ust-yazi">{`${PTYPE[t]} süreçler`}</div>
                  <div className="tc-dhk-serit-ogeler">
                    {ps.length ? ps.map((p, i) => {
                      const l = gostergeSon(p);
                      return (
                        <span key={p.id} className="tc-dhk-serit-oge">
                          {t === 'a' && i > 0 && <Simge ad="chev-right" boyut="k" />}
                          <button type="button" className="tc-dhk-cip" onClick={() => { ac(p); }} disabled={!yaz}>
                            <i className={`tc-dhk-isaret tc-dhk-isaret-${ton(l ? gostergeTuttu(p, l.v) : null)}`} aria-hidden="true" />{p.name}
                          </button>
                        </span>
                      );
                    }) : <span className="tc-dhk-soluk">Tanımlı süreç yok</span>}
                  </div>
                </div>
              );
            })}
            <div className="tc-dhk-musteri"><span>Müşteri şartları</span><Simge ad="chev-right" boyut="k" /><span>Müşteri memnuniyeti</span></div>
          </div>
        )}
      </Bolum>
      {acik && <SurecFormuKarti key={acik.id} surec={acik} yeni={!P.some((x) => x.id === acik.id)} kapat={() => { acikYaz(null); }} />}
      {P.length > 0 && (
        <Bolum baslik="Süreç göstergeleri" simge="chart" sag={<span className="tc-dhk-soluk">Son 6 ay · kesikli çizgi hedef</span>}>
          <div className="tc-dhk-surec-kartlari">
            {P.map((p) => {
              const l = gostergeSon(p), ok = l ? gostergeTuttu(p, l.v) : null, eksik = eksikMetni(p);
              return (
                <div key={p.id} className="tc-dhk-surec-karti">
                  <div className="tc-dhk-surec-ust">
                    <span className="tc-dhk-tur" data-tur={p.type}>{PTYPE[p.type]}</span><b>{p.name}</b>
                    {yaz && <Dugme onClick={() => { ac(p); }}>Düzenle</Dugme>}
                  </div>
                  <small className="tc-dhk-soluk">{[p.owner ? `Sahibi: ${p.owner}` : 'Sahibi yok', p.kpi || 'Gösterge tanımlı değil'].join(' · ')}</small>
                  <div className="tc-dhk-gosterge">
                    <div>
                      <div className="tc-dhk-deger"><span className={`tc-dhy-ton-${ok === null ? 'soluk' : ok ? 'iyi' : 'kotu'}`}>{l ? sayiMetni(l.v) : '–'}</span><span className="tc-dhk-soluk">{p.unit}</span></div>
                      <small className="tc-dhk-soluk">{(p.target !== '' ? `Hedef ${hedefMetni(p)}` : 'Hedef yok') + (l ? ` · ${ayAdi(l.m)}` : '')}</small>
                    </div>
                    <Egri p={p} />
                  </div>
                  {eksik && <div className="tc-dhk-uyari"><Simge ad="alert" boyut="k" /><span>{eksik}</span></div>}
                </div>
              );
            })}
          </div>
        </Bolum>
      )}
    </>
  );
}

// Süreç formu (prototip procForm): haritanın altında satır içi kart; silme aynı satırda sorulur.
function SurecFormuKarti({ surec, yeni, kapat }: { surec: Surec; yeni: boolean; kapat: () => void }) {
  const d = useDenetim();
  const [siliyor, siliyorYaz] = useState(false);
  const ms = gostergeAylari(6);
  const form = useForm<SurecFormu>({
    ilk: formdan(surec),
    dogrula: (v): Record<string, string> => (v.name.trim() ? {} : { name: 'Süreç adını girin' }),
    hataIletisi: 'Süreç kaydedilemedi.',
    kaydet: async (v) => {
      const nv = kysNormalize({ procs: [{ ...v, vals: v.vals }] }).procs[0];
      if (!nv) return;
      d.degistir('Süreç kaydı', (t) => {
        const i = t.kys.procs.findIndex((x) => x.id === nv.id);
        if (i >= 0) t.kys.procs[i] = nv; else t.kys.procs.push(nv);
      }, { bildirim: 'Süreç kaydedildi' });
      await Promise.resolve();
    },
    basarili: kapat,
  });
  const v = form.degerler;
  useEffect(() => { kaydir('tc-dhk-surec-formu'); }, []);
  return (
    <Bolum baslik={yeni ? 'Yeni süreç' : 'Süreci düzenle'} simge="rotate" sinif="tc-dhk-surec-formu">
      <form id="tc-dhk-surec-formu" className="tc-dhk-form" onSubmit={form.gonder} noValidate>
        <Girdi etiket="Süreç adı" placeholder="Örn. Üretim" required {...form.alan('name')} />
        <Secim etiket="Türü" value={v.type} onChange={(e) => { form.degistir({ type: e.target.value as SurecTuru }); }}
          secenekler={TURLER.map((k) => ({ deger: k, baslik: `${PTYPE[k]} süreç` }))} />
        <Girdi etiket="Süreç sahibi" placeholder="Görev veya kişi" list={KISI_LISTESI} {...form.alan('owner')} />
        <Girdi etiket="Gösterge" placeholder="Örn. Zamanında teslimat" {...form.alan('kpi')} />
        <Girdi etiket="Girdiler" {...form.alan('inputs')} />
        <Girdi etiket="Ne ile? Ekipman, altyapı" placeholder="Tezgâh, ölçüm cihazı, ERP modülü" {...form.alan('res')} />
        <Girdi etiket="Kim ile? Yetkinlik, rol" placeholder="CNC operatörü (seviye 2), kalite teknisyeni" {...form.alan('who')} />
        <Girdi etiket="Nasıl? Prosedür, talimat" placeholder="Doküman kodları, virgülle ayırın" {...form.alan('how')} />
        <Girdi etiket="Başlıca risk" placeholder="Örn. kalibrasyonsuz cihazla ölçüm" {...form.alan('risk')} />
        <Girdi etiket="Çıktılar" {...form.alan('outputs')} />
        <div className="tc-dhk-hedef">
          <Secim etiket="Yön" value={v.dir} onChange={(e) => { form.degistir({ dir: e.target.value === 'le' ? 'le' : 'ge' }); }}
            secenekler={[{ deger: 'ge', baslik: '≥ en az' }, { deger: 'le', baslik: '≤ en fazla' }]} />
          <Girdi etiket="Hedef" type="number" step="any" inputMode="decimal" {...form.alan('target')} />
          <Girdi etiket="Birim" placeholder="birim" {...form.alan('unit')} />
        </div>
        <fieldset className="tc-dhk-aylar tc-dhk-genis">
          <legend>Aylık değerler</legend>
          {ms.map((m) => (
            <Girdi key={m} etiket={ayAdi(m)} type="number" step="any" inputMode="decimal" value={v.vals[m] ?? ''}
              onChange={(e) => {
                const yeniV = { ...v.vals };
                if (e.target.value === '') delete yeniV[m]; else yeniV[m] = e.target.value;
                form.degistir({ vals: yeniV });
              }} />
          ))}
        </fieldset>
        {form.genelHata && <p className="tc-dhk-genis tc-dhy-ton-kotu" role="alert">{form.genelHata}</p>}
        <div className="tc-dhk-dugmeler tc-dhk-genis">
          <Dugme type="submit" tur="birincil" simge="check" yukleniyor={form.gonderiliyor}>Kaydet</Dugme>
          <button type="button" className="tc-dhp-baglanti" onClick={kapat}>Vazgeç</button>
          {!yeni && (siliyor
            ? (
              <SatirOnayi metin="Süreç silinsin mi?" evet="Sil" vazgec={() => { siliyorYaz(false); }}
                onayla={() => {
                  siliyorYaz(false);
                  d.degistir('Süreç silme', (t) => { t.kys.procs = t.kys.procs.filter((x) => x.id !== surec.id); }, { bildirim: 'Süreç silindi' });
                  kapat();
                }} />
            )
            : <Dugme simge="trash" onClick={() => { siliyorYaz(true); }}>Sil</Dugme>)}
        </div>
      </form>
    </Bolum>
  );
}
