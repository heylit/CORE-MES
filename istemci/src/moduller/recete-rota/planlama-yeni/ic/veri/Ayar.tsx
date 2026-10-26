import type { CalismaKomutu } from '../../kayit.ts';
import type { PlanlamaCalismasi } from '../../tipler.ts';
import { aileler, matrisDenetle, matrisOku, matrisYaz, tanimsizGecis } from './kurallar.ts';
import { VeriKarti, sayiYazi } from './ortak.tsx';

// Ayar matrisi (02-orta.betik sAyar): aileler arası ayar süresi. Matris yalnız planlama çalışmasındadır (kaynak alanı değil); plan yazma ile
// çalışma komutundan yazılır (223 a: veri.yaz kalkar). Hücre kutudan çıkınca yazılır; boş hücre tam ayar alır, köşegen aynı aile katsayısıdır.

export function AyarMatrisi({ c, komut, planYaz, uyar }: { c: PlanlamaCalismasi; komut: CalismaKomutu | null; planYaz: boolean; uyar: (ileti: string) => void }) {
  const yaz = komut && planYaz ? komut : null;
  const a = aileler(c.D); const mx = matrisOku(c.D); const bos = tanimsizGecis(c.D);
  const degis = (den: string, ye: string, girdi: string) => {
    if (!yaz) return;
    const o = matrisDenetle(girdi);
    if ('hata' in o) { uyar(o.hata); return; }
    if ((mx.get(`${den}|${ye}`) ?? null) === o.dk) return;
    yaz.degistir('Ayar matrisi', (t) => { matrisYaz(t, den, ye, o.dk); }, { ayrinti: `${den} → ${ye}: ${o.dk === null ? 'tam ayar' : `${o.dk} dk`}` });
  };
  return (
    <VeriKarti baslik="Aileler arası ayar süresi (dakika)" sag={<span className="tc-pyi-k">{a.length} aile</span>}>
      <div className="tc-pyi-kap">
        <table className="tc-pyi-izgara" aria-label="Aileler arası ayar süresi">
          <thead><tr><th scope="col">Önceki ↓ / sonraki →</th>{a.map((x) => <th key={x} scope="col">{x}</th>)}</tr></thead>
          <tbody>
            {a.map((x) => (
              <tr key={x}>
                <th scope="row">{x}</th>
                {a.map((y) => {
                  if (x === y) return <td key={y} data-kosegen="" title={`Aynı aile: tam ayar × ${String(c.w.famK)}`}>× {sayiYazi(c.w.famK, 2)}</td>;
                  const v = mx.get(`${x}|${y}`);
                  return (
                    <td key={y} data-ton={v === undefined ? 'uyari' : undefined}>
                      <input
                        key={String(v ?? '')} type="number" min={0} step={5} defaultValue={v ?? ''} placeholder="tam" aria-label={`${x} sonra ${y} ayar dakikası`} disabled={!yaz}
                        onBlur={(e) => { if (e.target.value !== String(v ?? '')) degis(x, y, e.target.value); }}
                        onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="tc-pyi-k">
        Satır: tezgâhtaki önceki işin ailesi; sütun: sıradaki işin ailesi. Boş hücre (sarı) tam ayar alır. Köşegen aynı aile kısalmasıdır; katsayı Kısıtlar sayfasında. {bos} geçiş tanımsız.
      </p>
    </VeriKarti>
  );
}
