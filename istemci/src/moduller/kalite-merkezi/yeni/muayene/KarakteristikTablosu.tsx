import { useId, useState } from 'react';
import { Dugme, Girdi, Rozet, Secim, useBildirim } from '../../../../ortak/arayuz/index.ts';
import { devDurumu, karakteristikSonucu } from '../kurallar.ts';
import type { Cihaz, Karakteristik } from '../tipler.ts';

// Muayenenin ölçüm adımı: karakteristik başına tip, nominal, tolerans, ölçülen değer ve cihaz; sonuç toleranstan.
// Kalibrasyonu geçersiz cihaz seçilemez (kayıtlı satırda seçili olan görünür kalır).

function cihazSecenekleri(cihazlar: readonly Cihaz[], secili?: string) {
  return cihazlar.map((d) => {
    const s = devDurumu(d);
    return {
      deger: d._id,
      baslik: `${d.kod ?? ''} ${d.ad ?? ''}${s.kullanilir ? '' : ` (geçersiz: ${s.metin.toLocaleLowerCase('tr')})`}`.trim(),
      pasif: !s.kullanilir && d._id !== secili,
    };
  });
}

// Ortak Secim pasif seçenek çizmez; geçersiz cihaz listede görünür ama seçilemez. İşaretleme ortak alanla aynıdır.
function CihazSecimi({ etiket, deger, cihazlar, degistir }: { etiket: string; deger: string; cihazlar: readonly Cihaz[]; degistir: (d: string) => void }) {
  const id = useId();
  return (
    <div className="tc-alan">
      <label className="tc-alan-etiket" htmlFor={id}>{etiket}</label>
      <select id={id} className="tc-alan-kutu" value={deger} onChange={(e) => { degistir(e.target.value); }}>
        <option value="">Cihaz seçin</option>
        {cihazSecenekleri(cihazlar, deger).map((o) => <option key={o.deger} value={o.deger} disabled={o.pasif}>{o.baslik}</option>)}
      </select>
    </div>
  );
}

function Sonuc({ c }: { c: Karakteristik }) {
  const r = karakteristikSonucu(c);
  return r === 'OK' ? <Rozet ton="tamam">Uygun</Rozet> : r === 'NOK' ? <Rozet ton="hata">Ret</Rozet> : <span className="tc-km2-soluk">—</span>;
}

export function KarakteristikTablosu({ satirlar, cihazlar, degistir }: {
  satirlar: readonly Karakteristik[]; cihazlar: readonly Cihaz[]; degistir: (s: Karakteristik[]) => void;
}) {
  const { bildir } = useBildirim();
  const [toplu, topluYaz] = useState('');
  const yaz = (i: number, p: Partial<Karakteristik>) => { degistir(satirlar.map((c, k) => (k === i ? { ...c, ...p } : c))); };
  const dolu = satirlar.filter((c) => (c.ad ?? '').trim());
  const ok = dolu.filter((c) => karakteristikSonucu(c) === 'OK').length;
  const nok = dolu.filter((c) => karakteristikSonucu(c) === 'NOK').length;
  const topluAta = () => {
    if (!toplu) { bildir('hata', 'Önce bir cihaz seçin.'); return; }
    let n = 0;
    degistir(satirlar.map((c) => { if (!c.cihaz && c.tip !== 'Nitel') { n++; return { ...c, cihaz: toplu }; } return c; }));
    bildir('tamam', `${n} satıra cihaz atandı`);
  };
  return (
    <div className="tc-km2-kar">
      <div className="tc-km2-kar-ust">
        <h4>Karakteristikler</h4>
        <Dugme simge="plus" onClick={() => { degistir([...satirlar, {}]); }}>Satır ekle</Dugme>
      </div>
      {cihazlar.length > 0 && satirlar.length > 3 && (
        <div className="tc-km2-kar-toplu">
          <CihazSecimi etiket="Toplu cihaz" deger={toplu} cihazlar={cihazlar} degistir={topluYaz} />
          <Dugme onClick={topluAta}>Cihazı boş satırlara ata</Dugme>
        </div>
      )}
      {cihazlar.length === 0 && (
        <p className="tc-km2-not">Kayıtlı cihaz yok. Ölçümlerin izlenebilir olması için önce Cihaz ve kalibrasyon listesine cihaz ekleyin.</p>
      )}
      <ol className="tc-km2-kar-liste">
        {satirlar.map((c, i) => {
          const nitel = c.tip === 'Nitel';
          const ad = c.ad || `Satır ${i + 1}`;
          return (
            // Satırın kimliği yok; alanlar denetimli olduğundan sıra anahtarı silmede değer kaydırmaz.
            <li key={i} className="tc-km2-kar-satir" aria-label={ad}>
              <Girdi className="tc-km2-kar-ad" etiket="Karakteristik" placeholder="ör. Ø12 H7 delik" value={c.ad ?? ''} onChange={(e) => { yaz(i, { ad: e.target.value }); }} />
              <Secim
                etiket="Tip" value={nitel ? 'Nitel' : 'Değişken'} secenekler={[{ deger: 'Değişken', baslik: 'Değişken' }, { deger: 'Nitel', baslik: 'Nitel' }]}
                onChange={(e) => { yaz(i, { tip: e.target.value, olcum: '' }); }}
              />
              <Girdi etiket="Nominal" inputMode="decimal" disabled={nitel} value={c.nominal ?? ''} onChange={(e) => { yaz(i, { nominal: e.target.value }); }} />
              <Girdi etiket="Alt tol. (−)" inputMode="decimal" disabled={nitel} value={c.alt ?? ''} onChange={(e) => { yaz(i, { alt: e.target.value }); }} />
              <Girdi etiket="Üst tol. (+)" inputMode="decimal" disabled={nitel} value={c.ust ?? ''} onChange={(e) => { yaz(i, { ust: e.target.value }); }} />
              {nitel ? (
                <Secim
                  etiket="Ölçülen" value={c.olcum ?? ''} bosSecenek="—"
                  secenekler={[{ deger: 'Uygun', baslik: 'Uygun' }, { deger: 'Uygun değil', baslik: 'Uygun değil' }]}
                  onChange={(e) => { yaz(i, { olcum: e.target.value }); }}
                />
              ) : (
                <Girdi etiket="Ölçülen" inputMode="decimal" value={c.olcum ?? ''} onChange={(e) => { yaz(i, { olcum: e.target.value }); }} />
              )}
              <CihazSecimi etiket="Cihaz" deger={c.cihaz ?? ''} cihazlar={cihazlar} degistir={(v) => { yaz(i, { cihaz: v }); }} />
              <div className="tc-km2-kar-sonuc" aria-label="Sonuç"><Sonuc c={c} /></div>
              <Dugme tur="tehlike" simge="trash" aria-label={`${ad}: satırı sil`} onClick={() => { degistir(satirlar.filter((_, k) => k !== i)); }} />
            </li>
          );
        })}
      </ol>
      <p className="tc-km2-kucuk">Kalibrasyonu geçersiz cihazlar listede seçilemez (AS9100D 7.1.5).</p>
      {dolu.length > 0 && (
        <p className={`tc-km2-not ${nok ? 'tc-km2-not-hata' : ok === dolu.length ? 'tc-km2-not-tamam' : ''}`} role="status">
          {`${ok} uygun, ${nok} ret, ${dolu.length - ok - nok} sonuç bekliyor`}
        </p>
      )}
    </div>
  );
}
