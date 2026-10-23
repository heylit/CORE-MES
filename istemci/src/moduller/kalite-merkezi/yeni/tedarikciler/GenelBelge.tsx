import type { KmAlan, FormVerisi } from '../AdimliForm.tsx';
import { Belge, BelgeBasi, Imza } from '../Belge.tsx';
import { trd } from '../bicim.ts';
import type { KmVerisi } from '../veri.ts';

// Uygulamanın genericDocHTML'i: alan başına bir satır (etiket, değer), başlık ve imza.
function deger(a: KmAlan, v: unknown): string {
  if (v === null || v === undefined || v === '') return '';
  if (a.tur === 'secim') {
    const s = (a.secenekler ?? []).find((o) => String(Array.isArray(o) ? o[0] : o) === String(v));
    return String(Array.isArray(s) ? s[1] : v);
  }
  if (a.tur === 'isaretler') return Array.isArray(v) ? v.join(', ') : String(v);
  if (a.tur === 'evet') return v ? a.evetMetni ?? 'Evet' : '';
  if (a.tur === 'tarih') return trd(String(v));
  return String(v);
}

export function GenelBelge({ veri, kod, ad, alanlar, d }: { veri: Pick<KmVerisi, 'ayarlar' | 'tpl'>; kod: string; ad: string; alanlar: readonly KmAlan[]; d: FormVerisi }) {
  return (
    <Belge>
      <BelgeBasi veri={veri} kod={kod} ad={ad} />
      <table>
        <tbody>
          {alanlar.map((a) => <tr key={a.k}><th className="dh-f">{a.etiket}</th><td className="tc-km4-cok-satir">{deger(a, d[a.k])}</td></tr>)}
        </tbody>
      </table>
      <Imza />
    </Belge>
  );
}
