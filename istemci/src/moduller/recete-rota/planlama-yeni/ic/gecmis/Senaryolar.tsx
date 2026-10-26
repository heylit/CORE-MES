import { useState, type ReactNode } from 'react';
import type { SenaryolarCevabi } from '#paylasilan/sozlesme/plan.ts';
import { Rozet, Simge } from '../../../../../ortak/arayuz/index.ts';
import { KucukDugme, Serit, VeriKarti, VeriTablosu, sayiYazi, type Sutun } from '../veri/ortak.tsx';
import {
  eskiTabanli, GOSTERGE_SATIRLARI, gostergeFarki, KARSILASTIRMA_SINIRI, karsilastirmaSec, SENARYO_DURUM_ADI, senaryoSirasi, senaryoZamani,
  tarihiDegisenler, yukuDegisenler, type Senaryo,
} from './kurallar.ts';

// Geçmiş > Senaryolar (02-orta.betik sSenaryolar, 641 a): plan modülünün taslakları ve canlıyla yan yana karşılaştırma. Ekran okur; taslağı
// kaydetmek, onaya göndermek ve canlıya almak Planlama atölyesindedir (`planlamaAc`). Verilmezse o düğme pasiftir.
export function SenaryolarBolumu({ v, planlamaAc }: { v: SenaryolarCevabi | null; planlamaAc: (() => void) | null }) {
  const [sec, secYaz] = useState<number[]>([]);
  if (!v) return <Serit ton="uyari" simge="alert">Senaryolar okunamadı. Sayfayı yenileyin; sürerse plan modülü kapalı olabilir.</Serit>;
  const l = senaryoSirasi(v.senaryolar);
  const secilen = sec.map((id) => l.find((s) => s.id === id)).filter((s): s is Senaryo => !!s && !!s.gostergeler);
  const ac = <KucukDugme ad="Planlama atölyesi" simge="layers" metin="Planlama atölyesi" yap={() => planlamaAc?.()} kapali={!planlamaAc} not="Atölye bu ekrandan açılamıyor." />;
  const sutunlar: readonly Sutun<Senaryo>[] = [
    {
      anahtar: 'sec', baslik: 'Karşılaştır', gizliBaslik: true, hucre: (s) => (
        <input
          type="checkbox" className="tc-pyg-sec" aria-label={`${s.ad} karşılaştır`} checked={sec.includes(s.id)}
          disabled={!s.gostergeler || (!sec.includes(s.id) && sec.length >= KARSILASTIRMA_SINIRI)} onChange={() => { secYaz((x) => karsilastirmaSec(x, s.id)); }}
        />
      ),
    },
    {
      anahtar: 'ad', baslik: 'Senaryo', hucre: (s) => (
        <span className="tc-pyg-ad">
          <b>{s.ad}</b>
          <span className="tc-pyi-k">{`${s.acan ?? '—'} · ${senaryoZamani(s.acilma)} · canlı s.${String(s.tabanPlanSurumu)} üstünde`}</span>
          {eskiTabanli(s, v.canliSurum) && <Rozet ton="uyari" gorunum="cizgi">Canlı değişti</Rozet>}
          {s.durum === 'acik' && s.onay?.geriNeden && <span className="tc-pyi-k">{`Geri gönderildi: ${s.onay.geriNeden}`}</span>}
        </span>
      ),
    },
    { anahtar: 'durum', baslik: 'Durum', hucre: (s) => <Rozet ton={SENARYO_DURUM_ADI[s.durum][1]}>{SENARYO_DURUM_ADI[s.durum][0]}</Rozet> },
    { anahtar: 'gecikme', baslik: 'Gecikme (sa)', sag: true, hucre: (s) => <Fark s={s} v={v} i={0} /> },
    { anahtar: 'geciken', baslik: 'Geciken emir', sag: true, hucre: (s) => <Fark s={s} v={v} i={1} /> },
    { anahtar: 'degisiklik', baslik: 'Değişiklik', sag: true, hucre: (s) => <span className="mono">{String(s.degisiklikler.length)}</span> },
  ];
  return (
    <>
      <Serit ton="tamam" simge="flag" eylem={ac}>
        {`Canlı plan: sürüm ${String(v.canliSurum)}. Canlıya giden her değişiklik önce bir taslağa düşer; kaydetme, onaya gönderme ve canlıya alma Planlama atölyesindedir.`}
      </Serit>
      <VeriKarti baslik="Senaryolar" simge="flag" ek={String(l.length)} sag={<span className="tc-pyi-k">{`Karşılaştırmak için en çok ${String(KARSILASTIRMA_SINIRI)} taslak seçin; ilk sütun canlıdır.`}</span>}>
        <VeriTablosu
          etiket="Senaryolar" sutunlar={sutunlar} satirlar={l} anahtar={(s) => String(s.id)}
          bos="Taslak yok. Planlamada yapılan her değişiklik bir taslağa düşer; taslak adıyla kaydedilir ve burada canlıyla karşılaştırılır."
        />
      </VeriKarti>
      {secilen.length > 0 && <Karsilastirma v={v} l={secilen} />}
    </>
  );
}

function FarkHucresi({ canli, x, kucukIyi, basamak }: { canli: number | null; x: number | null; kucukIyi: boolean; basamak: number }) {
  const f = gostergeFarki(canli, x, kucukIyi);
  return (
    <span className="mono">
      {sayiYazi(x, basamak)}
      {f && <small data-ton={f.iyi ? 'iyi' : 'kotu'}>{` ${f.d > 0 ? '+' : '−'}${sayiYazi(Math.abs(f.d), basamak)}`}</small>}
    </span>
  );
}
function Fark({ s, v, i }: { s: Senaryo; v: SenaryolarCevabi; i: number }) {
  const g = GOSTERGE_SATIRLARI[i]; if (!g) return null;
  return <FarkHucresi canli={g.al(v.canli)} x={s.gostergeler ? g.al(s.gostergeler) : null} kucukIyi={g.kucukIyi} basamak={g.basamak} />;
}

function Tablo({ etiket, bas, children }: { etiket: string; bas: string[]; children: ReactNode }) {
  return (
    <div className="tc-tablo-kap">
      <table className="tc-tablo tc-pyi-tablo tc-pyg-karsi" aria-label={etiket}>
        <thead><tr>{bas.map((b, i) => <th key={`${b}-${String(i)}`} scope="col" className={i ? 'tc-tablo-sag' : undefined}>{b}</th>)}</tr></thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

function Karsilastirma({ v, l }: { v: SenaryolarCevabi; l: Senaryo[] }) {
  const bas = (ilk: string) => [ilk, `Canlı s.${String(v.canliSurum)}`, ...l.map((s) => s.ad)];
  const emir = tarihiDegisenler(l); const yuk = yukuDegisenler(l);
  const notlar = l.flatMap((s) => [...(s.etki?.yeniUyarilar ?? []).map((u) => [s.ad, 'Yeni uyarı', u] as const), ...s.bekleyenler.map((u) => [s.ad, 'Canlıya alınamaz', u] as const)]);
  return (
    <VeriKarti baslik="Karşılaştırma" simge="eye" sag={<span className="tc-pyi-k">Fark canlıya göredir; yeşil iyileşme, kırmızı kötüleşme.</span>}>
      <Tablo etiket="Göstergeler" bas={bas('Gösterge')}>
        {GOSTERGE_SATIRLARI.map((g) => (
          <tr key={g.ad}>
            <th scope="row">{g.birim ? `${g.ad} (${g.birim})` : g.ad}</th>
            <td className="tc-tablo-sag"><span className="mono">{sayiYazi(g.al(v.canli), g.basamak)}</span></td>
            {l.map((s) => <td key={s.id} className="tc-tablo-sag"><FarkHucresi canli={g.al(v.canli)} x={s.gostergeler ? g.al(s.gostergeler) : null} kucukIyi={g.kucukIyi} basamak={g.basamak} /></td>)}
          </tr>
        ))}
        <tr>
          <th scope="row">Darboğaz</th>
          <td className="tc-tablo-sag">{v.canli.darbogaz?.ad ?? '—'}</td>
          {l.map((s) => <td key={s.id} className="tc-tablo-sag">{s.gostergeler?.darbogaz?.ad ?? '—'}</td>)}
        </tr>
      </Tablo>
      {emir.length > 0 && (
        <Tablo etiket="Bitişi değişen emirler" bas={bas('Emir')}>
          {emir.map((e) => (
            <tr key={e.emirNo}>
              <th scope="row" className="mono">{e.emirNo}</th>
              <td className="tc-tablo-sag mono">{senaryoZamani(e.canli)}</td>
              {e.senaryo.map((x, i) => <td key={l[i]?.id ?? i} className="tc-tablo-sag mono">{x === undefined ? 'aynı' : x === null ? 'yerleşmedi' : senaryoZamani(x)}</td>)}
            </tr>
          ))}
        </Tablo>
      )}
      {yuk.length > 0 && (
        <Tablo etiket="Yükü değişen istasyonlar" bas={bas('İstasyon')}>
          {yuk.map((e) => (
            <tr key={e.ad}>
              <th scope="row">{e.ad}</th>
              <td className="tc-tablo-sag mono">{e.canli === null ? '—' : `%${sayiYazi(e.canli)}`}</td>
              {e.senaryo.map((x, i) => <td key={l[i]?.id ?? i} className="tc-tablo-sag mono">{x === undefined ? 'aynı' : x === null ? '—' : `%${sayiYazi(x)}`}</td>)}
            </tr>
          ))}
        </Tablo>
      )}
      {notlar.length > 0 && (
        <ul className="tc-pyi-olaylar" aria-label="Uyarılar">
          {notlar.map(([ad, tur, u], i) => (
            <li key={`${ad}-${String(i)}`} className="tc-pyi-olay" data-ton={tur === 'Yeni uyarı' ? 'uyari' : 'hata'}><Simge ad="alert" boyut="k" /><span><b>{ad}</b>{` · ${tur}: ${u}`}</span></li>
          ))}
        </ul>
      )}
    </VeriKarti>
  );
}
