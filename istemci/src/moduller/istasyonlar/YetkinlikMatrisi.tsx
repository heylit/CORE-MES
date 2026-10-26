import { useState } from 'react';
import { DurumKutusu, Girdi, Simge } from '../../ortak/arayuz/index.ts';
import { SecimHucresi } from './Hucreler.tsx';
import { aramayaUyar } from './ListeAraclari.tsx';
import { kisileriBirlestir, type KisiAtamasi, type KisiOzeti } from './tesis.ts';
import { useTopluYaz, type TesisVerisi } from './tesisVerisi.ts';
import { SecimKutusu } from './TopluCubuk.tsx';

type Degisiklik = { kisiId: number; istasyonId: number; yetkin: boolean };

// 565 a: kişi ve istasyon yetkinliği tek tabloda; hücre, satır (kişi) ve sütun (istasyon) aç ve kapat. Hepsi tek toplu uçtan geçer: kişi
// kartındaki uçla aynı kural ve defter. Geçerlilik bitişi ve dayanak kişi kartında kalır; süresi dolan yetkinlik burada işaretlidir.
export function YetkinlikMatrisi({ v, yazabilir }: { v: TesisVerisi; yazabilir: boolean }) {
  const [ara, araYaz] = useState('');
  const [merkez, merkezYaz] = useState('');
  const t = useTopluYaz();
  if (v.yukleniyor || v.yetkinlikler === undefined) return <DurumKutusu durum="yukleniyor" />;
  if (v.hata) return <DurumKutusu durum="hata" yenile={v.yenile} />;
  if (v.yetkinlikler === null) return <DurumKutusu durum="hata" mesaj="Yetkinlikler alınamadı." yenile={v.yenile} />;

  const atamalar: KisiAtamasi[] = [
    ...(v.istasyonKisileri ?? []).map((a) => ({ tur: 'istasyon' as const, hedefId: a.istasyonId, ...a })),
    ...(v.makineKisileri ?? []).map((a) => ({ tur: 'makine' as const, hedefId: a.makineId, ...a })),
    ...(v.ekipUyeleri ?? []).map((a) => ({ tur: 'ekip' as const, hedefId: a.ekipId, ...a })),
  ];
  const kisiler = kisileriBirlestir(v.kisiler, atamalar).filter((k) => k.aktif && aramayaUyar(ara, [k.ad]));
  const merkezSecenekleri = v.merkezler.filter((m) => m.aktif).map((m) => ({ deger: String(m.id), baslik: `${m.kod} ${m.ad}` }));
  const gruplar = v.merkezler.filter((m) => m.aktif && (merkez === '' || String(m.id) === merkez))
    .map((m) => ({ m, istasyonlar: v.istasyonlar.filter((i) => i.aktif && i.isMerkeziId === m.id) }))
    .filter((g) => g.istasyonlar.length > 0);
  const sutunlar = gruplar.flatMap((g) => g.istasyonlar);
  const Y = new Map(v.yetkinlikler.map((y) => [y.kisiId, y]));
  const yetkin = (kisiId: number, istasyonId: number) => Y.get(kisiId)?.istasyonIdleri.includes(istasyonId) ?? false;
  const dolmus = (kisiId: number, istasyonId: number) => Y.get(kisiId)?.ayrintilar.find((a) => a.istasyonId === istasyonId)?.gecerli === false;
  const gonder = (l: Degisiklik[]) => { if (l.length > 0 && !t.mesgul) t.gonder({ yol: '/kisi-yetkinlikleri/toplu', govde: { degisiklikler: l } }); };
  const topluKutu = (etiket: string, ciftler: readonly [KisiOzeti, number][]) => {
    const acik = ciftler.filter(([k, i]) => yetkin(k.id, i)).length;
    return (
      <SecimKutusu etiket={etiket} secili={ciftler.length > 0 && acik === ciftler.length} kismen={acik > 0 && acik < ciftler.length}
        degistir={(d) => gonder(ciftler.filter(([k, i]) => yetkin(k.id, i) !== d).map(([k, i]) => ({ kisiId: k.id, istasyonId: i, yetkin: d })))} />
    );
  };

  return (
    <div className="tc-ist-bolum">
      <div className="tc-ist-arac">
        <Girdi etiket="Kişi ara" type="search" placeholder="Kişi adı" value={ara} onChange={(o) => araYaz(o.target.value)} />
        <label className="tc-alan"><span className="tc-alan-etiket">İş merkezi</span>
          <SecimHucresi etiket="İş merkezi süzgeci" deger={merkez} bos="Hepsi" secenekler={merkezSecenekleri} kaydet={merkezYaz} />
        </label>
      </div>
      <p className="tc-ist-ipucu">
        Yetkinlik kişinin çalışabildiği istasyonlardır; plan yetkin olmadığı istasyondaki işi uyarır. Satır ve sütun başındaki kutu o kişiyi ya da istasyonu
        topluca açar ve kapatır. Geçerlilik bitişi ve dayanak Personel'deki kişi kartında girilir.
      </p>
      {t.ret && <p role="alert" className="tc-ist-hata">{t.ret.ileti}</p>}
      {kisiler.length === 0 || sutunlar.length === 0 ? (
        <DurumKutusu durum="bos" mesaj={kisiler.length === 0 ? (ara.trim() === '' ? 'Kişi yok.' : 'Aramaya uyan kişi yok.') : 'Aktif istasyon yok.'} />
      ) : (
        <div className="tc-ist-matris-kap">
          <table className="tc-ist-matris tc-ist-yetkinlik" aria-label="Yetkinlik matrisi" aria-busy={t.mesgul}>
            <thead>
              <tr>
                <th scope="col" rowSpan={2}>Kişi</th>
                {gruplar.map((g) => <th key={g.m.id} scope="colgroup" colSpan={g.istasyonlar.length}>{g.m.kod}</th>)}
              </tr>
              <tr>
                {sutunlar.map((i) => (
                  <th key={i.id} scope="col" title={i.ad}>
                    <span className="tc-ist-mono">{i.kod}</span>
                    {yazabilir && <>{' '}{topluKutu(`${i.kod} sütununun hepsi`, kisiler.map((k) => [k, i.id] as [KisiOzeti, number]))}</>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {kisiler.map((k) => (
                <tr key={k.id}>
                  <th scope="row">
                    {yazabilir && <>{topluKutu(`${k.ad} satırının hepsi`, sutunlar.map((i) => [k, i.id] as [KisiOzeti, number]))}{' '}</>}
                    {k.ad}
                  </th>
                  {sutunlar.map((i) => {
                    const acik = yetkin(k.id, i.id);
                    const eski = acik && dolmus(k.id, i.id);
                    return (
                      <td key={i.id} className={eski ? 'tc-ist-yetkinlik-dolmus' : undefined} title={eski ? 'Süresi dolmuş: iş başlatmaz' : undefined}>
                        {yazabilir
                          ? <SecimKutusu etiket={`${k.ad} ${i.kod} yetkinliği`} secili={acik} degistir={(d) => gonder([{ kisiId: k.id, istasyonId: i.id, yetkin: d }])} />
                          : acik ? <span aria-label={`${k.ad} ${i.kod} yetkin${eski ? ', süresi dolmuş' : ''}`}><Simge ad={eski ? 'alert' : 'check'} boyut="k" /></span> : null}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
