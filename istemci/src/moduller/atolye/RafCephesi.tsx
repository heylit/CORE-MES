import type { KeyboardEvent } from 'react';
import type { Raf } from '#paylasilan/sozlesme/atolye.ts';
import { hucreAnahtari } from './kurallar.ts';

// Rafın önden görünüşü (2B): şerit bütün rafı küçük gösterir ve bölme seçtirir; cephe tek bölmeyi tam karşıdan,
// katlar ve gözlerle çizer. Göz durumu Stok'tan (3012 a): stokta kalem sayısıyla ya da boş. stok null ise (stok görme
// yetkisi yok ya da okunmadı) göz "—" yazar ve renk almaz; "boş" demek yanlış bilgi olur.

// Hücre anahtarı (bölme-kat-göz) -> stoktaki kalem sayısı; stoksuz göz anahtarda yoktur.
export type RafStogu = ReadonlyMap<string, number> | null;

const gozKademesi = (stok: RafStogu, anahtar: string): string | undefined => (stok === null ? undefined : (stok.get(anahtar) ?? 0) > 0 ? 'az' : 'bos');

const tusla = (f: () => void) => (o: KeyboardEvent) => {
  if (o.key === 'Enter' || o.key === ' ') { o.preventDefault(); f(); }
};

type RafBoyu = Pick<Raf, 'kod' | 'bolmeSayisi' | 'katSayisi' | 'gozSayisi'>;

export function RafSeridi({ raf, stok, bolme, sec }: {
  raf: RafBoyu; stok: RafStogu; bolme: number; sec: (bolme: number) => void;
}) {
  const H = 12;
  const G = 10;
  const bolmeEni = raf.gozSayisi * G + 4;
  const en = raf.bolmeSayisi * bolmeEni;
  const boy = raf.katSayisi * H + 4;
  return (
    <svg className="tc-atolye-serit-raf" viewBox={`0 0 ${en} ${boy}`} role="group" aria-label={`${raf.kod} bölmeleri`}>
      {Array.from({ length: raf.bolmeSayisi }, (_, i) => {
        const b = i + 1;
        return (
          <g
            key={b}
            className="tc-atolye-serit-bolme"
            data-secili={b === bolme || undefined}
            role="button"
            tabIndex={0}
            aria-label={`Bölme ${b}`}
            aria-pressed={b === bolme}
            onClick={() => sec(b)}
            onKeyDown={tusla(() => sec(b))}
          >
            <rect className="tc-atolye-serit-zemin" x={i * bolmeEni + 1} y={1} width={bolmeEni - 2} height={boy - 2} rx={1.5} />
            {Array.from({ length: raf.katSayisi }, (_, k) => Array.from({ length: raf.gozSayisi }, (_, g) => {
              return (
                <rect
                  key={`${k}-${g}`}
                  className="tc-atolye-hucre"
                  data-kademe={gozKademesi(stok, hucreAnahtari(b, k + 1, g + 1))}
                  x={i * bolmeEni + 2 + g * G + 0.5}
                  y={boy - 2 - (k + 1) * H + 0.5}
                  width={G - 1}
                  height={H - 1}
                  rx={1}
                />
              );
            }))}
            <text className="tc-atolye-serit-no" x={i * bolmeEni + bolmeEni / 2} y={boy - 3}>{String(b).padStart(2, '0')}</text>
          </g>
        );
      })}
    </svg>
  );
}

export function BolmeCephesi({ raf, bolme, stok, secili, sec }: {
  raf: RafBoyu;
  bolme: number;
  stok: RafStogu;
  secili: { kat: number; goz: number } | null;
  sec: (kat: number, goz: number) => void;
}) {
  const GE = 120;
  const KB = 84;
  const DIK = 10;
  const ZEMIN = 18;
  // Kat adları rafın solundaki boşlukta.
  const SOL = 26;
  const en = SOL + raf.gozSayisi * GE + DIK * 2;
  const boy = raf.katSayisi * KB + ZEMIN;
  return (
    <svg className="tc-atolye-cephe" viewBox={`0 0 ${en} ${boy}`} role="group" aria-label={`${raf.kod} bölme ${bolme} önden`}>
      <rect className="tc-atolye-cephe-dikme" x={SOL} y={0} width={DIK} height={boy - ZEMIN + 4} />
      <rect className="tc-atolye-cephe-dikme" x={en - DIK} y={0} width={DIK} height={boy - ZEMIN + 4} />
      <rect className="tc-atolye-cephe-zemin" x={SOL - 6} y={boy - ZEMIN + 4} width={en - SOL + 6} height={ZEMIN - 4} />
      {Array.from({ length: raf.katSayisi }, (_, ki) => {
        const kat = ki + 1;
        const y = boy - ZEMIN - kat * KB;
        return (
          <g key={kat}>
            <rect className="tc-atolye-cephe-kiris" x={SOL + DIK} y={y + KB - 6} width={en - SOL - DIK * 2} height={6} />
            <text className="tc-atolye-cephe-kat" x={SOL / 2} y={y + KB / 2}>K{kat}</text>
            {Array.from({ length: raf.gozSayisi }, (_, gi) => {
              const goz = gi + 1;
              const anahtar = hucreAnahtari(bolme, kat, goz);
              const kalem = stok?.get(anahtar) ?? 0;
              const metin = stok === null ? '—' : kalem > 0 ? `${kalem} kalem` : 'boş';
              const etiket = `Kat ${kat} göz ${goz}: ${stok === null ? 'stok bilgisi yok' : kalem > 0 ? `stokta ${kalem} kalem` : 'boş'}`;
              const x = SOL + DIK + gi * GE;
              return (
                <g
                  key={goz}
                  className="tc-atolye-cephe-goz"
                  data-kademe={gozKademesi(stok, anahtar)}
                  data-secili={secili?.kat === kat && secili.goz === goz ? true : undefined}
                  role="button"
                  tabIndex={0}
                  aria-label={etiket}
                  aria-pressed={secili?.kat === kat && secili.goz === goz}
                  onClick={() => sec(kat, goz)}
                  onKeyDown={tusla(() => sec(kat, goz))}
                >
                  <title>{etiket}</title>
                  <rect className="tc-atolye-cephe-bosluk" x={x + 3} y={y + 3} width={GE - 6} height={KB - 12} rx={3} />
                  {kalem > 0 && <rect className="tc-atolye-cephe-dolu" x={x + 8} y={y + 10} width={GE - 16} height={KB - 26} rx={2} />}
                  <text className="tc-atolye-cephe-yuzde" x={x + GE / 2} y={y + KB - 16}>{metin}</text>
                  <rect className="tc-atolye-cephe-cerceve" x={x + 1.5} y={y + 1.5} width={GE - 3} height={KB - 9} rx={4} />
                </g>
              );
            })}
          </g>
        );
      })}
    </svg>
  );
}
