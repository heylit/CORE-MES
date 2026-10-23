import { butunAnahtarlar } from '../aql.ts';
import { Belge, BelgeBasi, Imza } from '../Belge.tsx';
import { trd } from '../bicim.ts';
import { bugun } from '../kurallar.ts';
import type { Lot } from '../tipler.ts';
import type { KmVerisi } from '../veri.ts';
import { aqlMetni, bulunanlar, planHucreleri, SINIFLAR, tedarikciAdi, type LotDegeri } from './hesap.ts';

// Lot kabul kaydı (KF-12); yazdırılan belge bugünkü düzende kalır (203 a).
export function LotBelgesi({ veri, l }: { veri: KmVerisi; l: LotDegeri }) {
  const b = bulunanlar(l);
  return (
    <Belge>
      <BelgeBasi veri={veri} kod="KF-12" ad="Numune alma planı ve lot kabul kaydı" />
      <table>
        <tbody>
          <tr><th>Kayıt no</th><td>{l.no}</td><th>Tarih</th><td>{trd(l.tarih)}</td></tr>
          <tr><th>Parça no / adı</th><td>{`${l.parcaNo ?? ''} ${l.parcaAdi ?? ''}`}</td><th>Lot / parti</th><td>{l.lotNo}</td></tr>
          <tr><th>Tedarikçi</th><td>{tedarikciAdi(veri.sup, l.tedarikci)}</td><th>Sipariş / iş emri</th><td>{l.siparis}</td></tr>
          <tr><th>Parti büyüklüğü</th><td>{l.N}</td><th>Seviye / sıkılık</th><td>{`${l.seviye ?? ''} / ${l.siddet ?? ''}${l.yenidenSunum ? ' (yeniden sunum)' : ''}`}</td></tr>
        </tbody>
      </table>
      <table>
        <thead><tr><th>Sınıf</th><th>AQL</th><th>Kod</th><th>n</th><th>Ac</th><th>Re</th><th>Bulunan</th><th>Sonuç</th></tr></thead>
        <tbody>
          {SINIFLAR.map((c) => {
            const p: Partial<NonNullable<Lot['plan']>[string]> = l.plan?.[c] ?? {};
            const f = b[c];
            return (
              <tr key={c}>
                <td>{c}</td><td>{aqlMetni(p.aql ?? '')}</td><td>{p.kod}</td><td>{p.n}</td><td>{p.ac}</td><td>{p.re}</td><td>{f}</td>
                <td>{f != null && p.ac != null ? (f <= p.ac ? 'Kabul' : 'Ret') : ''}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p><b>Lot kararı:</b> {l.karar}{l.not ? ` | ${l.not}` : ''}</p>
      <p className="small">Plan kaynağı: ISO 2859-1 / ANSI-ASQ Z1.4 tek örnekleme.</p>
      <Imza hazirlayan={l.muayeneci} />
    </Belge>
  );
}

export interface PlanSecimi { N: string; lvl: string; sev: string; kr: string; mj: string; mn: string; key: string }

// Numune alma planı (KF-12): sihirbazın son adımında önizlenir, yazdırılır.
export function PlanBelgesi({ veri, f }: { veri: KmVerisi; f: PlanSecimi }) {
  const N = Math.floor(Number(f.N)) || 0;
  const rows = planHucreleri(N, f.lvl, f, f.sev);
  const k = f.key ? butunAnahtarlar(veri.lot).find((x) => x.k === f.key) : undefined;
  return (
    <Belge>
      <BelgeBasi veri={veri} kod="KF-12" ad="Numune alma planı" />
      <table>
        <tbody>
          <tr><th>Parti büyüklüğü</th><td>{N.toLocaleString('tr-TR')}</td><th>Muayene seviyesi</th><td>{f.lvl}</td></tr>
          <tr><th>Sıkılık</th><td>{f.sev}</td><th>Kod harfi</th><td>{rows[1]?.p?.kod ?? '—'}</td></tr>
          {k && <tr><th>Parça / tedarikçi</th><td colSpan={3}>{`${k.son.parcaNo ?? ''} / ${tedarikciAdi(veri.sup, k.son.tedarikci)}`}</td></tr>}
          <tr><th>Hazırlanma</th><td>{trd(bugun())}</td><th>Dayanak</th><td>ISO 2859-1 / ANSI-ASQ Z1.4, tek örnekleme</td></tr>
        </tbody>
      </table>
      <table>
        <thead><tr><th>Sınıf</th><th>AQL</th><th>Kod</th><th>Numune (n)</th><th>Kabul (Ac)</th><th>Ret (Re)</th><th>Not</th></tr></thead>
        <tbody>
          {rows.map((r) => (r.p ? (
            <tr key={r.c}><td>{r.c}</td><td>{aqlMetni(r.a)}</td><td>{r.p.kodK}</td><td><b>{r.p.n}</b></td><td><b>{r.p.ac}</b></td><td><b>{r.p.re}</b></td><td>{r.p.not}</td></tr>
          ) : null))}
        </tbody>
      </table>
      <h3>Uygulama</h3>
      <ol>
        <li>Partiden rastgele numune çekin; sınıflar farklı n veriyorsa en büyük numuneyi çekip her sınıfı kendi n'i kadar birimde değerlendirin.</li>
        <li>Her sınıfta bulunan uygun olmayan birimleri sayın.</li>
        <li>Bulunan ≤ Ac ise sınıf kabul, ≥ Re ise ret. Herhangi bir sınıf ret ise parti reddedilir ve NCR açılır.</li>
        <li>Kabul edilen partide numunede bulunan uygunsuz birimler yine ayrılır.</li>
      </ol>
      <Imza />
    </Belge>
  );
}
