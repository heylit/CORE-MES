import { Simge, useBildirim } from '../../../../ortak/arayuz/index.ts';
import { sayi } from '../cekirdek/bicim.ts';
import { Anahtar, Bolmeli, KartBasligi } from './denetimler.tsx';
import {
  HAZIR_NUMUNE_PLANLARI, OLCENLER, numuneEtiketi, numuneOlaylari, numuneOlculeri, numunePlani, numunePlaniYaz, yeniKimlik,
} from './kurallar.ts';
import type { NumuneKurali, NumuneZamani, Pkg } from './tipler.ts';

const ZAMANLAR: readonly (readonly [NumuneZamani, string])[] = [
  ['first', 'Başta (ilk parça)'], ['every', 'Her N parça'], ['time', 'Her N dakika'], ['shift', 'Vardiya başı'], ['last', 'Sonda (son parça)'],
];

// Hazırlık › Numune planı sekmesi (istasyonlar.ts SampTab): kurallar ve parça eksenindeki önizleme.
export function NumuneSekmesi({ paket, yama }: { paket: Pkg; yama: (ch: Partial<Pkg>) => void }) {
  const { bildir } = useBildirim();
  const kurallar = numunePlani(paket);
  const eski = !(paket.samp && paket.samp.length);
  const kaydet = (rs: NumuneKurali[]) => yama(numunePlaniYaz(paket, rs) as Partial<Pkg>);
  const guncelle = (id: string, ch: Partial<NumuneKurali>) => kaydet(kurallar.map((r) => (r.id === id ? { ...r, ...ch } : r)));
  const ekle = () => kaydet([...kurallar, { id: yeniKimlik(), when: 'every', n: 50, who: ['q'], items: 'all' }]);
  const sil = (id: string) => kaydet(kurallar.filter((r) => r.id !== id));
  const hedef = +paket.target || 500;
  const olaylar = numuneOlaylari(kurallar, hedef, +paket.cycle || 30);
  const nQ = olaylar.filter((e) => e.who === 'q').length;
  const nO = olaylar.filter((e) => e.who === 'op').length;
  return (
    <div className="tc-ay2-kurallar">
      <section className="tc-ay2-kart tc-ay2-genis" aria-label="Numune planı">
        <KartBasligi
          simge={<Simge ad="target" />} ton="done" baslik="Numune planı"
          aciklama={'Numune ne zaman alınır, kim ölçer, hangi ölçüler · ' + sayi(hedef) + ' parçalık iş için'}
        />
        {eski && paket.plan.length ? (
          <div className="tc-ay2-bilgi">
            <Simge ad="alert" />
            <span>Bu paket eski usul ölçü başına sıklıkla çalışıyor; aşağıdaki kurallar ondan türetildi. Değiştirdiğin anda numune planı geçerli olur.</span>
          </div>
        ) : null}
        {!paket.plan.length ? <p className="tc-ay2-soluk">Önce <b>Kontrol planı</b> sekmesinde ölçüleri ekle.</p> : null}
        <div className="tc-ay2-zaman">
          <div className="tc-ay2-zaman-ust">
            <span className="tc-ay2-ust-yazi">Önizleme · parça sayısına göre</span>
            <span className="tc-ay2-lejant">
              <span data-ton={OLCENLER.q.ton}><i aria-hidden="true" /><b>{nQ}</b> kalite numunesi</span>
              <span data-ton={OLCENLER.op.ton}><i aria-hidden="true" /><b>{nO}</b> operatör ölçümü</span>
            </span>
          </div>
          {kurallar.map((r, ri) => (
            <div key={r.id} className="tc-ay2-serit">
              <span className="tc-ay2-serit-no">{ri + 1}</span>
              <svg viewBox="0 0 100 10" preserveAspectRatio="none" role="img" aria-label={(ri + 1) + '. kural · ' + olaylar.filter((e) => e.ri === ri).length + ' numune'}>
                <line className="tc-ay2-serit-cizgi" x1="0" x2="100" y1="5" y2="5" />
                {olaylar.filter((e) => e.ri === ri).map((e, i) => (
                  <rect key={i} className="tc-ay2-serit-olay" data-ton={OLCENLER[e.who].ton} x={(e.at / hedef) * 100 - 0.4} y="1" width="0.8" height="8">
                    <title>{sayi(e.at) + '. parça · ' + numuneEtiketi(r) + ' · ' + OLCENLER[e.who].l}</title>
                  </rect>
                ))}
              </svg>
            </div>
          ))}
          <div className="tc-ay2-eksen"><span>1</span><span>{sayi(Math.round(hedef / 2))}</span><span>{sayi(hedef)}</span></div>
        </div>
      </section>
      {kurallar.map((r, ri) => {
        const olculer = numuneOlculeri(paket, r);
        const kim = r.who || ['q'];
        return (
          <section key={r.id} className="tc-ay2-kart" aria-label={(ri + 1) + '. numune kuralı'}>
            <div className="tc-ay2-kb">
              <span className="tc-ay2-kural-no">{ri + 1}</span>
              <div>
                <b>{numuneEtiketi(r)}</b>
                <small>{kim.map((w) => OLCENLER[w].l).join(' → ')}{kim.length > 1 ? ' → (tekrar)' : ''} · {olculer.length} ölçü</small>
              </div>
              <button type="button" className="tc-ay2-arac tc-ay2-sag" aria-label="Kuralı sil" onClick={() => sil(r.id)}><Simge ad="trash" /></button>
            </div>
            <div className="tc-ay2-alan">
              <span className="tc-ay2-ust-yazi">Ne zaman</span>
              <Bolmeli
                etiket="Ne zaman" deger={r.when} secenekler={ZAMANLAR}
                degistir={(when) => guncelle(r.id, { when, n: when === 'time' ? (r.when === 'time' ? r.n : 60) : when === 'every' ? (r.when === 'every' ? r.n : 50) : r.n })}
              />
            </div>
            {r.when === 'every' || r.when === 'time' ? (
              <div className="tc-ay2-alan">
                <span className="tc-ay2-ust-yazi">{r.when === 'every' ? 'Kaç parçada bir' : 'Kaç dakikada bir'}</span>
                <div className="tc-ay2-satir">
                  <input type="number" min="1" className="tc-ay2-kisa" aria-label={r.when === 'every' ? 'Kaç parçada bir' : 'Kaç dakikada bir'} value={r.n} onChange={(e) => guncelle(r.id, { n: Math.max(1, +e.target.value || 1) })} />
                  <span className="tc-ay2-soluk">{r.when === 'every' ? 'parça' : 'dk'}</span>
                  {(r.when === 'every' ? [10, 25, 50, 100] : [30, 60, 120]).map((v) => (
                    <button key={v} type="button" className="tc-ay2-hazir" aria-pressed={r.n === v} onClick={() => guncelle(r.id, { n: v })}>{v}</button>
                  ))}
                </div>
              </div>
            ) : null}
            <div className="tc-ay2-alan">
              <span className="tc-ay2-ust-yazi">Kim ölçer · sırayla döner</span>
              <div className="tc-ay2-olcen-sirasi">
                {kim.map((w, k) => (
                  <span key={k} className="tc-ay2-olcen" data-ton={OLCENLER[w].ton}>
                    <button type="button" title="Dokun: kalite ↔ operatör" onClick={() => guncelle(r.id, { who: kim.map((x, j) => (j === k ? (x === 'q' ? 'op' : 'q') : x)) })}>
                      <small>{k + 1}.</small><Simge ad={OLCENLER[w].simge} boyut="k" />{OLCENLER[w].l}
                    </button>
                    {kim.length > 1 ? (
                      <button type="button" className="tc-ay2-olcen-sil" aria-label={(k + 1) + '. ölçeni çıkar'} onClick={() => guncelle(r.id, { who: kim.filter((_, j) => j !== k) })}>×</button>
                    ) : null}
                  </span>
                ))}
                {r.when !== 'first' && r.when !== 'last' ? (
                  <button type="button" className="tc-ay2-hazir" onClick={() => guncelle(r.id, { who: [...kim, kim[kim.length - 1] === 'q' ? 'op' : 'q'] })}>
                    <Simge ad="plus" boyut="k" />Sıraya ekle
                  </button>
                ) : null}
              </div>
              {kim.length > 1 ? (
                <small className="tc-ay2-soluk">
                  1. numuneyi {OLCENLER[kim[0]!].l.toLowerCase()}, 2. numuneyi {OLCENLER[kim[1]!].l.toLowerCase()} ölçer{kim.length > 2 ? ', …' : ''}; liste bitince başa döner.
                </small>
              ) : null}
            </div>
            <div className="tc-ay2-alan">
              <span className="tc-ay2-ust-yazi">Hangi ölçüler</span>
              <Bolmeli
                etiket="Hangi ölçüler" deger={Array.isArray(r.items) ? 'sel' : r.items || 'all'}
                secenekler={[['all', 'Tümü · ' + paket.plan.length], ['crit', 'Kritikler (KK) · ' + paket.plan.filter((b) => b.crit).length], ['sel', 'Seçili']]}
                degistir={(v) => guncelle(r.id, { items: v === 'sel' ? olculer.map((b) => b.id) : v })}
              />
              {Array.isArray(r.items) ? (
                <div className="tc-ay2-hazirlar">
                  {paket.plan.map((b) => {
                    const secili = (r.items as number[]).includes(b.id);
                    return (
                      <button
                        key={b.id} type="button" className="tc-ay2-olcu-cip" aria-pressed={secili}
                        onClick={() => guncelle(r.id, { items: secili ? (r.items as number[]).filter((x) => x !== b.id) : [...(r.items as number[]), b.id] })}
                      ><b>{b.id}</b>{b.nom}</button>
                    );
                  })}
                </div>
              ) : null}
            </div>
            {r.when === 'first' ? (
              <Anahtar acik={!!r.gate} degistir={(v) => guncelle(r.id, { gate: v })} baslik="İlk parça kapısı" aciklama="Bu ölçüler kalitede karara bağlanana kadar sayılan parçalar karar bekler; üretim durmaz" />
            ) : null}
          </section>
        );
      })}
      <section className="tc-ay2-kart tc-ay2-genis" aria-label="Numune kuralı ekle">
        <button type="button" className="tc-ay2-ekle" onClick={ekle}><Simge ad="plus" /><b>Numune kuralı ekle</b></button>
        <div className="tc-ay2-hazirlar">
          <span className="tc-ay2-ust-yazi">Hazır planlar</span>
          {HAZIR_NUMUNE_PLANLARI.map((x, i) => (
            <button
              key={i} type="button" className="tc-ay2-hazir" data-ton="done"
              onClick={() => { kaydet(x.r.map((r) => ({ id: yeniKimlik(), ...r }))); bildir('tamam', 'Numune planı uygulandı'); }}
            ><i aria-hidden="true" />{x.l}</button>
          ))}
        </div>
      </section>
    </div>
  );
}
