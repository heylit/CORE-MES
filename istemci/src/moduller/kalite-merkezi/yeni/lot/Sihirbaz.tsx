import { type ReactNode } from 'react';
import { Dugme, Girdi } from '../../../../ortak/arayuz/index.ts';
import {
  AQL_DEGERLERI, aqlHucresi, butunAnahtarlar, HARFLER, KOD_TABLOSU, kodHarfi, NUMUNELER, SEVIYELER, SIKI, YUZDE_YUZ, type AqlPlani,
} from '../aql.ts';
import type { KmVerisi } from '../veri.ts';
import { CizgiGrafigi } from '../spc/Grafik.tsx';
import { GecisSemasi } from './GecisSemasi.tsx';
import {
  aqlMetni, ocEgrisi, ocOzeti, planHucreleri, SINIF_ANAHTARI, SINIFLAR, tedarikciAdi, yuzde, type Sinif,
} from './hesap.ts';
import { PlanBelgesi, type PlanSecimi } from './LotBelgesi.tsx';
import { AnaTablo, KodTablosu } from './Tablolar.tsx';

export interface SihirbazDurumu extends PlanSecimi { step: number; cls: Sinif }

const ADIMLAR = ['Parti büyüklüğü', 'Seviye ve kod harfi', 'Muayene sıkılığı', 'AQL seçimi', 'Önizleme'];
const SIKILIKLAR = ['Normal', SIKI];

const SEVIYE_BILGISI: Record<string, string> = {
  'S-1': 'En küçük numune. Tahribatlı veya çok pahalı testlerde, yüksek risk kabul edilebiliyorsa.',
  'S-2': 'Çok küçük numune; tahribatlı testler için.',
  'S-3': 'Küçük numune; pahalı fonksiyonel testler için.',
  'S-4': 'Özel seviyelerin en ayırt edicisi; maliyetli ama makul güvence.',
  I: 'Genel seviyelerin en küçüğü. Muayene pahalı, süreç kararlı ise.',
  II: 'Varsayılan seviye. Sözleşmede aksi yazmıyorsa bunu kullanın.',
  III: 'En ayırt edici. Kritik ürün, yeni tedarikçi veya zayıf kalite geçmişi varsa.',
};

const SINIF_BILGISI: Record<Sinif, { t: string; g: string; oneri: string[] }> = {
  Kritik: { t: 'Emniyeti tehlikeye atan veya ürünün görevini yapmasını engelleyen hata.', g: 'Savunmada çoğunlukla %100 muayene ve sıfır kabul istenir. Örnekleme ancak sözleşme izin veriyorsa.', oneri: [YUZDE_YUZ, '0.065', '0.10'] },
  Majör: { t: 'Arızaya yol açabilecek veya kullanılabilirliği önemli ölçüde azaltan hata.', g: 'Yaygın aralık 0,40 ile 1,0 arası.', oneri: ['0.40', '0.65', '1.0'] },
  Minör: { t: 'Kullanımı önemli ölçüde etkilemeyen, standarttan sapma.', g: 'Yaygın aralık 1,5 ile 4,0 arası.', oneri: ['1.5', '2.5', '4.0'] },
};

export function yolMetni(p: AqlPlani | null | undefined, sev: string): string {
  if (!p || (p.yuzde100 && p.kod === '—')) return 'Örnekleme yok: partinin tamamı muayene edilir, tek uygunsuz birim partiyi reddeder.';
  const adimlar = p.yol.map((i) => HARFLER[i]);
  const ilk = aqlHucresi(p.yol[0]!, p.j, sev);
  let t = `${p.kod} satırı ile ${aqlMetni(AQL_DEGERLERI[p.j]!)} sütununun kesişimi`;
  if (adimlar.length > 1) t += ` ${ilk === '↓' ? 'aşağı' : 'yukarı'} ok gösteriyor; ilk plana kadar ${adimlar.join(' → ')} yolu izlendi`;
  t += `. Kullanılan plan: ${p.kodK} satırı, n = ${p.n}, kabul ${p.ac}, ret ${p.re}.`;
  if (p.yuzde100 && p.kod !== '—') t += ' Numune parti büyüklüğüne eşit veya büyük olduğu için %100 muayene yapılır.';
  return t;
}

function Cipler({ secenekler, secili, sec, etiket }: { secenekler: readonly { deger: string; baslik: string }[]; secili: string; sec: (d: string) => void; etiket: string }) {
  return (
    <div className="tc-km2-cipler" role="group" aria-label={etiket}>
      {secenekler.map((o) => <Dugme key={o.deger} aria-pressed={o.deger === secili} onClick={() => { sec(o.deger); }}>{o.baslik}</Dugme>)}
    </div>
  );
}

function Kart({ secili, pasif, sec, baslik, rozet, alt, metin }: { secili: boolean; pasif?: boolean; sec: () => void; baslik: string; rozet?: string; alt?: string; metin: string }) {
  return (
    <button type="button" className="tc-km2-secim" aria-pressed={secili} disabled={pasif} onClick={sec}>
      <span className="tc-km2-secim-bas"><b>{baslik}</b>{rozet && <em>{rozet}</em>}</span>
      {alt && <span className="tc-km2-secim-alt">{alt}</span>}
      <span className="tc-km2-secim-metin">{metin}</span>
    </button>
  );
}

export function Sihirbaz({ veri, f, degistir, onizle, lotOlustur, varsayilanYap, ayarYetkisi, yazYetkisi }: {
  veri: KmVerisi;
  f: SihirbazDurumu;
  degistir: (p: Partial<SihirbazDurumu>) => void;
  onizle: () => void;
  lotOlustur: () => void;
  varsayilanYap: () => void;
  ayarYetkisi: boolean;
  yazYetkisi: boolean;
}) {
  const N = Math.floor(Number(f.N)) || 0;
  const okN = N >= 2;
  const L = okN ? kodHarfi(N, f.lvl) : null;
  const rows = okN ? planHucreleri(N, f.lvl, f, f.sev) : [];
  const cur = rows.find((r) => r.c === f.cls);
  const st = Math.min(f.step, okN ? 4 : 0);
  const lotSatiri = KOD_TABLOSU.find((x) => N >= x[0] && N <= x[1]);
  const anahtarlar = butunAnahtarlar(veri.lot);

  let govde: ReactNode = null;
  if (st === 0) {
    govde = (
      <div className="tc-km2-sh-izgara">
        <div>
          <h3 className="tc-km2-soru">Partide kaç birim var?</h3>
          <p className="tc-km2-kucuk">Aynı koşullarda üretilmiş ve muayeneye birlikte sunulan birimlerin toplamı. Karışık lotları ayrı partiler olarak değerlendirin.</p>
          <Girdi
            etiket="Parti büyüklüğü" type="number" min={2} inputMode="numeric" placeholder="ör. 1500" value={f.N} className="tc-km2-buyuk-girdi"
            onChange={(e) => { degistir({ N: e.target.value }); }}
            onKeyDown={(e) => { if (e.key === 'Enter' && Number(f.N) >= 2) degistir({ step: 1 }); }}
            hata={N === 1 ? 'Parti en az 2 birim olmalı.' : undefined}
          />
          <Cipler etiket="Hazır parti büyüklükleri" secili={String(N)} sec={(d) => { degistir({ N: d }); }} secenekler={[50, 200, 500, 1200, 3200, 10000].map((v) => ({ deger: String(v), baslik: v.toLocaleString('tr-TR') }))} />
        </div>
        <aside className="tc-km2-yan">
          {okN && lotSatiri ? (
            <><b>Tablo 1'de satır</b><p>{`${lotSatiri[0].toLocaleString('tr-TR')}${lotSatiri[1] === Infinity ? ' ve üzeri' : ` – ${lotSatiri[1].toLocaleString('tr-TR')}`} aralığı. Bir sonraki adımda bu satırdan muayene seviyesine göre kod harfi seçilecek.`}</p></>
          ) : (
            <><b>Nasıl çalışır?</b><p>Beş adımda planı belirlersiniz: parti, seviye, sıkılık, her hata sınıfı için AQL ve önizleme. Her adımda standart tablonun ilgili kısmı vurgulanır.</p></>
          )}
        </aside>
      </div>
    );
  } else if (st === 1) {
    govde = (
      <>
        <h3 className="tc-km2-soru">Hangi muayene seviyesi?</h3>
        <p className="tc-km2-kucuk">Seviye, numunenin partiye göre ne kadar büyük olacağını belirler. Kartlardan ya da aşağıdaki tablodan bir sütun seçin.</p>
        <div className="tc-km2-secimler">
          {SEVIYELER.map((l) => {
            const c = kodHarfi(N, l) ?? '';
            return (
              <Kart
                key={l} secili={l === f.lvl} sec={() => { degistir({ lvl: l }); }} baslik={l} rozet={l === 'II' ? 'varsayılan' : undefined}
                alt={`Kod ${c}, n ${NUMUNELER[HARFLER.indexOf(c)] ?? ''}`} metin={SEVIYE_BILGISI[l] ?? ''}
              />
            );
          })}
        </div>
        <h4 className="tc-km2-bolum">Tablo 1: kod harfleri <span className="tc-km2-kucuk">Parti satırı ve seçili seviye sütunu vurgulu</span></h4>
        <KodTablosu N={N} seviye={f.lvl} sec={(lvl) => { degistir({ lvl }); }} />
      </>
    );
  } else if (st === 2) {
    const kk = f.key ? anahtarlar.find((x) => x.k === f.key) : undefined;
    govde = (
      <>
        <h3 className="tc-km2-soru">Muayene sıkılığı ne olmalı?</h3>
        <p className="tc-km2-kucuk">Yeni bir parça veya tedarikçiyle normal muayeneyle başlanır. Lot geçmişi varsa sistem sıkılığı geçiş kurallarına göre belirler.</p>
        <div className="tc-km2-dar-alan">
          <label className="tc-alan">
            <span className="tc-alan-etiket">Parça ve tedarikçi (isteğe bağlı)</span>
            <select
              className="tc-alan-kutu" value={f.key}
              onChange={(e) => { const x = anahtarlar.find((a) => a.k === e.target.value); degistir({ key: e.target.value, ...(x && x.s.st !== 'Durduruldu' ? { sev: x.s.st } : {}) }); }}
            >
              <option value="">Seçilmedi, elle belirle</option>
              {anahtarlar.map((x) => <option key={x.k} value={x.k}>{`${x.son.parcaNo ?? ''} / ${tedarikciAdi(veri.sup, x.son.tedarikci)} (${x.s.st})`}</option>)}
            </select>
          </label>
        </div>
        {kk && (
          <p className={`tc-km2-not ${kk.s.st === 'Normal' ? 'tc-km2-not-tamam' : kk.s.st === SIKI ? '' : 'tc-km2-not-hata'}`}>
            <b>{`Geçmişe göre: ${kk.s.st}.`}</b> {kk.s.sonraki}
          </p>
        )}
        <div className="tc-km2-secimler">
          {SIKILIKLAR.map((s) => (
            <Kart
              key={s} secili={s === f.sev} pasif={kk?.s.st === 'Durduruldu'} sec={() => { degistir({ sev: s }); }} baslik={s}
              metin={s === 'Normal' ? 'Başlangıç sıkılığı. Kalite geçmişi iyi veya bilinmiyorsa.' : '5 lot içinde 2 ret sonrasında uygulanır. Aynı numunede daha düşük kabul sayısı veya daha büyük numune.'}
            />
          ))}
        </div>
        <GecisSemasi />
      </>
    );
  } else if (st === 3) {
    const bilgi = SINIF_BILGISI[f.cls];
    const p = cur?.p;
    const secili = f[SINIF_ANAHTARI[f.cls]];
    const aqlSec = (a: string) => { degistir({ [SINIF_ANAHTARI[f.cls]]: a }); };
    govde = (
      <>
        <h3 className="tc-km2-soru">Her hata sınıfı için AQL seçin</h3>
        <p className="tc-km2-kucuk">Önce sınıfı seçin, sonra öneri düğmelerinden ya da ana tablodan bir sütuna tıklayın. Seçtiğiniz sütunda kod harfinden plana giden yol vurgulanır.</p>
        <div className="tc-km2-secimler" role="tablist" aria-label="Hata sınıfı">
          {rows.map((r) => (
            <Kart
              key={r.c} secili={r.c === f.cls} sec={() => { degistir({ cls: r.c }); }} baslik={r.c} alt={`AQL ${aqlMetni(r.a)}`}
              metin={r.p ? `n ${r.p.n}, Ac ${r.p.ac}, Re ${r.p.re}` : '—'}
            />
          ))}
        </div>
        <div className="tc-km2-sh-izgara">
          <div>
            <p><b>{`${f.cls}:`}</b> {bilgi.t}</p>
            <p className="tc-km2-kucuk">{bilgi.g}</p>
            <Cipler etiket="Önerilen AQL" secili={secili} sec={aqlSec} secenekler={bilgi.oneri.map((a) => ({ deger: a, baslik: aqlMetni(a) }))} />
            <p className="tc-km2-kucuk">Tüm AQL değerleri</p>
            <Cipler etiket="Tüm AQL değerleri" secili={secili} sec={aqlSec} secenekler={(f.cls === 'Kritik' ? [YUZDE_YUZ, ...AQL_DEGERLERI] : AQL_DEGERLERI).map((a) => ({ deger: a, baslik: aqlMetni(a) }))} />
          </div>
          <aside className="tc-km2-yan"><b>Tablo nasıl okundu?</b><p>{yolMetni(p, f.sev)}</p></aside>
        </div>
        {secili === YUZDE_YUZ && <p className="tc-km2-not">%100 muayene seçili: tabloya bakılmaz. Örnekleme yapmak isterseniz tablodan bir sütun seçin.</p>}
        <h4 className="tc-km2-bolum">{`Ana tablo: ${f.sev.toLocaleLowerCase('tr')} muayene`} <span className="tc-km2-kucuk">Hücreler kabul / ret; ↓ alttaki, ↑ üstteki ilk planı kullan</span></h4>
        <AnaTablo
          siddet={f.sev} sec={aqlSec}
          vurgu={p && p.j >= 0 ? { j: p.j, yol: p.yol, start: p.yol[0]!, end: p.yol[p.yol.length - 1]! } : { j: -1, yol: [], start: L ? HARFLER.indexOf(L) : -1, end: -1 }}
        />
      </>
    );
  } else {
    const p = cur?.p;
    const oc = p && cur ? ocOzeti(p, cur.a, N) : null;
    const egri = p && cur ? ocEgrisi(N, f.lvl, cur.a, f.sev, p) : null;
    govde = (
      <div className="tc-km2-sh-izgara tc-km2-sh-onizleme">
        <div>
          <h3 className="tc-km2-soru">Plan önizlemesi</h3>
          <p className="tc-km2-kucuk">Bu plan yazdırılabilir, lot kaydına aktarılabilir ya da varsayılan yapılabilir.</p>
          <div className="tc-km2-belge-cerceve"><PlanBelgesi veri={veri} f={f} /></div>
        </div>
        <div>
          <div className="tc-km2-oc-bas">
            <h4 className="tc-km2-bolum">OC eğrisi</h4>
            <label className="tc-alan tc-km2-satir-ici">
              <span className="tc-alan-etiket">Sınıf</span>
              <select className="tc-alan-kutu" value={f.cls} onChange={(e) => { degistir({ cls: e.target.value as Sinif }); }}>
                {SINIFLAR.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
          </div>
          {p && egri && oc && (
            <>
              <CizgiGrafigi
                etiket="OC eğrisi" xEtiketleri={egri.xs} yMin={0} yMax={1} yBicim={(v) => `${Math.round(v * 100)}%`} ipucuBicim={(v) => `%${(v * 100).toFixed(1)}`} boy="orta"
                xBaslik="Partideki hata oranı (%)" yBaslik="Kabul olasılığı"
                seriler={[
                  { ad: `${f.sev} (n ${p.n}, Ac ${p.ac})`, degerler: egri.ys, renk: 'tamam', kalin: true, egri: true },
                  ...(egri.obur ? [{ ad: `${f.sev === SIKI ? 'Normal' : SIKI} (n ${egri.obur.n}, Ac ${egri.obur.ac})`, degerler: egri.yt, renk: 'uyari' as const, kesik: true, egri: true }] : []),
                ]}
              />
              <dl className="tc-km2-ozet">
                <div><dd>{oc.aqldeKabul != null ? yuzde(oc.aqldeKabul) : '—'}</dd><dt>AQL'de kabul olasılığı</dt></div>
                <div><dd>{yuzde(oc.p95)}</dd><dt>%95 kabul edilen hata oranı</dt></div>
                <div><dd>{yuzde(oc.p10)}</dd><dt>LTPD: %10 kabul</dt></div>
                <div><dd>{yuzde(oc.aoql)}</dd><dt>AOQL</dt></div>
              </dl>
              <p className="tc-km2-kucuk">{`Okuma: partideki gerçek hata oranı %${(oc.p10 * 100).toFixed(2).replace('.', ',')} olduğunda bu plan partiyi yalnızca %10 olasılıkla kabul eder.`}</p>
            </>
          )}
          <div className="tc-km2-eylemler">
            {yazYetkisi && <Dugme tur="birincil" simge="plus" onClick={lotOlustur}>Bu planla lot kaydı oluştur</Dugme>}
            <Dugme simge="printer" onClick={onizle}>Planı yazdır / indir</Dugme>
            {ayarYetkisi && <Dugme simge="gear" onClick={varsayilanYap}>Varsayılan yap</Dugme>}
          </div>
        </div>
      </div>
    );
  }

  return (
    <section className="tc-km2-panel tc-km2-sihirbaz" aria-label="Numune planı sihirbazı">
      <ol className="tc-km2-adimlar">
        {ADIMLAR.map((t, i) => (
          <li key={t}>
            <button
              type="button" className={i === st ? 'tc-km2-adim-simdi' : i < st ? 'tc-km2-adim-bitti' : undefined}
              disabled={i > 0 && !okN} aria-current={i === st ? 'step' : undefined} onClick={() => { degistir({ step: i }); }}
            >
              <span className="tc-km2-adim-no">{i < st ? '✓' : i + 1}</span><span>{t}</span>
            </button>
          </li>
        ))}
      </ol>
      <div className="tc-km2-sh-ozet">
        {okN ? (
          <>
            <span><small>Parti</small><b>{N.toLocaleString('tr-TR')}</b></span>
            <span><small>Seviye</small><b>{f.lvl}</b></span>
            <span><small>Kod harfi</small><b>{L}</b></span>
            <span><small>Sıkılık</small><b>{f.sev === 'Normal' ? 'Normal' : 'Sıkı'}</b></span>
            {rows.map((r) => (
              <span key={r.c} className={r.c === f.cls && st === 3 ? 'tc-km2-sh-on' : undefined}>
                <small>{r.c}</small><b>{r.p ? `${r.p.n} / ${r.p.ac} / ${r.p.re}` : '—'}</b>
              </span>
            ))}
          </>
        ) : <span className="tc-km2-kucuk">Parti büyüklüğünü girerek başlayın.</span>}
      </div>
      <div className="tc-km2-sh-govde">{govde}</div>
      <div className="tc-km2-sh-gezinme">
        <Dugme simge="chev-left" disabled={st === 0} onClick={() => { degistir({ step: Math.max(0, f.step - 1) }); }}>Geri</Dugme>
        <span className="tc-km2-kucuk">{`Adım ${st + 1} / 5`}</span>
        {st < 4
          ? <Dugme tur="birincil" simge="chev-right" disabled={!okN} onClick={() => { degistir({ step: Math.min(4, f.step + 1) }); }}>{`İleri: ${ADIMLAR[st + 1]}`}</Dugme>
          : <Dugme simge="rotate" onClick={() => { degistir({ step: 0, N: '', key: '' }); }}>Yeni plan</Dugme>}
      </div>
    </section>
  );
}
