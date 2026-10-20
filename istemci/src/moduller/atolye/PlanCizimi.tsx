import type { PointerEvent as ReactPointerEvent, ReactNode, Ref } from 'react';
import type { MakineDurumu } from '../../ortak/arayuz/index.ts';
import type { Taslak } from './duzenleyici-durumu.ts';
import { gecisAraligi, kenarNoktasi } from './gecis.ts';
import { koseler, odaKenarlari } from './sahne/geometri.ts';
import { makineCinsi } from './kurallar.ts';
import { PlanSimgesi, rafSimgesi } from './plan-simgeleri.tsx';

// İki boyutlu kuşbakışı plan: düzenleyicinin tuvali ve WebGL olmayan cihazda haritanın kendisi.
// Ölçü birimi metredir (viewBox); renk ve çizgi kalınlığı sınıflardan gelir.

export interface GorunumKutusu {
  x: number;
  y: number;
  g: number;
  d: number;
}

interface Ozellikler {
  taslak: Taslak;
  sutunlar: readonly string[];
  satirlar: readonly string[];
  secili: string | null;
  isaretli?: ReadonlySet<string>;
  // Nesne anahtarı -> durum.
  durumlar?: ReadonlyMap<string, MakineDurumu>;
  rota?: readonly { x: number; z: number }[] | null;
  kutu: GorunumKutusu;
  duzenlenir?: boolean;
  etiket: string;
  svgRef?: Ref<SVGSVGElement>;
  ogeBas?: (anahtar: string, o: ReactPointerEvent) => void;
  bosBas?: (o: ReactPointerEvent) => void;
  // Fabrika planında bölümün zeminine basmak (seçer; sürükleme bölümün başlığından).
  bolumBas?: (anahtar: string, o: ReactPointerEvent) => void;
  dondurBas?: (anahtar: string, o: ReactPointerEvent) => void;
  ucBas?: (anahtar: string, uc: 'bas' | 'son', o: ReactPointerEvent) => void;
  // Zeminin hemen üstünde, öğelerin altında (kroki).
  altlik?: ReactNode;
  // Her şeyin üstünde (kılavuz, ölçü, çizim önizlemesi).
  ust?: ReactNode;
}

// Simge kenarı: öğenin kısa kenarıyla orantılı, okunur alt sınır ve göze batmayan üst sınır arasında (metre).
const simgeBoyu = (g: number, d: number, oran: number, azami: number): number => Math.min(azami, Math.max(0.36, Math.min(g, d) * oran));

// Yazı kutuya sığmazsa sonu kesilir (harf genişliği yazı boyunun yaklaşık yarısı).
function kisalt(metin: string, genislik: number, boy: number): string {
  const sigan = Math.max(3, Math.floor(genislik / (boy * 0.48)));
  return metin.length <= sigan ? metin : `${metin.slice(0, sigan - 1).trimEnd()}…`;
}

const nokta = (k: [number, number][]): string => k.map(([x, z]) => `${x.toFixed(3)},${z.toFixed(3)}`).join(' ');

export function PlanCizimi({
  taslak: t, sutunlar, satirlar, secili, isaretli, durumlar, rota, kutu, duzenlenir = false, etiket, svgRef,
  ogeBas, bosBas, bolumBas, dondurBas, ucBas, altlik, ust,
}: Ozellikler) {
  const { genislik: G, derinlik: D, hucreBoyu: H } = t.salon;
  const sinif = (anahtar: string, temel: string) =>
    [temel, anahtar === secili && 'tc-plan-secili', isaretli?.has(anahtar) && 'tc-plan-hatali'].filter(Boolean).join(' ');
  const bas = (anahtar: string) => (o: ReactPointerEvent) => { o.stopPropagation(); ogeBas?.(anahtar, o); };
  const girisler = t.bolumler
    ? t.bolumler.flatMap((b) => (b.giris ? [{ anahtar: `giris:${b.salonId}`, ...b.giris }] : []))
    : t.salon.giris ? [{ anahtar: 'giris', ...t.salon.giris }] : [];

  return (
    <svg
      ref={svgRef}
      className={`tc-plan${duzenlenir ? ' tc-plan-duzen' : ''}`}
      viewBox={`${kutu.x} ${kutu.y} ${kutu.g} ${kutu.d}`}
      role="img"
      aria-label={etiket}
      onPointerDown={(o) => bosBas?.(o)}
    >
      {t.bolumler ? (
        <>
          {t.bolumler.map((b) => (
            <g key={b.anahtar} className={sinif(b.anahtar, 'tc-plan-bolum')} transform={yerDonusumu(b)} onPointerDown={(o) => { if (bolumBas) { o.stopPropagation(); bolumBas(b.anahtar, o); } }}>
              <rect className="tc-plan-zemin" x={0} y={0} width={b.genislik} height={b.derinlik} />
            </g>
          ))}
          {altlik}
          {t.bolumler.map((b) => (
            <g key={b.anahtar} transform={yerDonusumu(b)} pointerEvents="none">
              <ZeminCizgileri G={b.genislik} D={b.derinlik} H={b.hucreBoyu} sutunlar={b.sutunlar} satirlar={b.satirlar} metre={duzenlenir} />
            </g>
          ))}
        </>
      ) : (
        <>
          <rect className="tc-plan-zemin" x={0} y={0} width={G} height={D} />
          {altlik}
          <ZeminCizgileri G={G} D={D} H={H} sutunlar={sutunlar} satirlar={satirlar} metre={duzenlenir} />
        </>
      )}

      {t.alanlar.map((a) => {
        const oda = a.tur === 'oda' || a.tur === 'cam_oda';
        return (
          <g key={a.anahtar} className={sinif(a.anahtar, 'tc-plan-alan')} data-tur={a.tur} onPointerDown={bas(a.anahtar)}>
            <polygon className="tc-plan-alan-dolgu" points={nokta(koseler(a))} />
            {oda && odaKenarlari(a).map((p, i) => (
              <line key={i} className="tc-plan-oda-duvar" x1={p.bas[0]} y1={p.bas[1]} x2={p.son[0]} y2={p.son[1]} />
            ))}
            {a.tur === 'yuruyus_yolu' || a.tur === 'palet' ? (
              <PlanSimgesi ad={a.tur} x={a.x} z={a.z} boy={simgeBoyu(a.genislik, a.derinlik, 0.7, 1.4)} />
            ) : (
              <AlanEtiketi a={a} />
            )}
          </g>
        );
      })}

      {t.duvarlar.map((d) => (
        <g key={d.anahtar} className={sinif(d.anahtar, 'tc-plan-duvar')} data-cam={d.cam} onPointerDown={bas(d.anahtar)}>
          <line x1={d.basX} y1={d.basZ} x2={d.sonX} y2={d.sonZ} strokeWidth={d.kalinlik} />
          <line className="tc-plan-tutamak-cizgi" x1={d.basX} y1={d.basZ} x2={d.sonX} y2={d.sonZ} />
        </g>
      ))}

      {t.raflar.map((r) => {
        const boy = r.bolmeSayisi * r.bolmeGenisligi;
        const k = koseler({ ...r, genislik: boy });
        const bolmeler = Array.from({ length: r.bolmeSayisi - 1 }, (_, i) => i + 1);
        // Simge ilk bölmede (kod ortada kalır); tek bölmeli rafta kodun üstünde.
        const sb = Math.min(0.9, Math.max(0.3, Math.min(r.derinlik * 0.8, r.bolmeGenisligi * 0.7)));
        const yerelX = r.bolmeSayisi > 1 ? -boy / 2 + r.bolmeGenisligi / 2 : 0;
        const yerelZ = r.bolmeSayisi > 1 ? 0 : -0.25 - sb / 2;
        const aci = (r.donus * Math.PI) / 180;
        const sx = r.x + yerelX * Math.cos(aci) - yerelZ * Math.sin(aci);
        const sz = r.z + yerelX * Math.sin(aci) + yerelZ * Math.cos(aci);
        return (
          <g key={r.anahtar} className={sinif(r.anahtar, 'tc-plan-raf')} data-aktif={r.aktif} data-tur={r.tur} onPointerDown={bas(r.anahtar)}>
            <polygon points={nokta(k)} />
            <g transform={`translate(${r.x} ${r.z}) rotate(${r.donus})`}>
              {bolmeler.map((b) => (
                <line key={b} className="tc-plan-bolme" x1={-boy / 2 + b * r.bolmeGenisligi} y1={-r.derinlik / 2} x2={-boy / 2 + b * r.bolmeGenisligi} y2={r.derinlik / 2} />
              ))}
            </g>
            <PlanSimgesi ad={rafSimgesi(r.tur)} x={sx} z={sz} boy={sb} />
            <text className="tc-plan-kod" x={r.x} y={r.z + 0.18} fontSize={0.5} textAnchor="middle">{r.kod}</text>
          </g>
        );
      })}

      {[
        // Makinesi yerleşik istasyon çerçevedir (arkada); nesne makinedir ve kendi durumunu taşır.
        ...t.istasyonlar.map((i) => ({ ...i, cerceve: t.makineler.some((m) => m.istasyonId === i.istasyonId), sinifAdi: 'tc-plan-istasyon' })),
        ...t.makineler.map((m) => ({ ...m, tip: m.tip ?? 'talasli' as const, cerceve: false, sinifAdi: 'tc-plan-istasyon tc-plan-makine' })),
      ].map((i) => {
        const durum = durumlar?.get(i.anahtar);
        if (i.cerceve) {
          return (
            <g key={i.anahtar} className={sinif(i.anahtar, `${i.sinifAdi} tc-plan-cerceve`)} data-aktif={i.aktif} onPointerDown={bas(i.anahtar)}>
              <polygon points={nokta(koseler(i))} />
              <text className="tc-plan-ad" x={i.x} y={i.z - i.derinlik / 2 + 0.4} fontSize={0.3} textAnchor="middle">{kisalt(`${i.kod} · ${i.ad}`, i.genislik - 0.4, 0.3)}</text>
            </g>
          );
        }
        // Yazının yaklaşık genişliği (ortalamak için; harf genişliği yazı boyunun yarısı kadar).
        const kodGen = i.kod.length * 0.48 * 0.62;
        const sb = i.derinlik >= 2 ? simgeBoyu(i.genislik, i.derinlik, 0.4, 1.5) : Math.min(0.9, Math.max(0.4, i.derinlik * 0.6));
        const yaziGen = Math.min(i.genislik - sb - 0.5, Math.max(kodGen * 0.875 + 0.5, i.ad.length * 0.26 * 0.52));
        return (
          <g key={i.anahtar} className={sinif(i.anahtar, i.sinifAdi)} data-aktif={i.aktif} data-durum={durum} onPointerDown={bas(i.anahtar)}>
            <polygon points={nokta(koseler(i))} />
            <g transform={`translate(${i.x} ${i.z}) rotate(${i.donus})`}>
              {/* Ön yüz: operatör tarafı (+z). */}
              <polygon className="tc-plan-on" points={`-0.25,${i.derinlik / 2 - 0.05} 0.25,${i.derinlik / 2 - 0.05} 0,${i.derinlik / 2 - 0.35}`} />
              {durum && <circle className="tc-plan-durum" cx={i.genislik / 2 - 0.3} cy={-i.derinlik / 2 + 0.3} r={0.18} />}
            </g>
            {i.derinlik >= 2 ? (
              <>
                <PlanSimgesi ad={makineCinsi(i.tip, i.ad)} x={i.x} z={i.z - 0.25 - sb / 2} boy={sb} />
                <text className="tc-plan-kod" x={i.x} y={i.z + 0.2} fontSize={0.48} textAnchor="middle">{i.kod}</text>
                {i.modelId !== null && <g className="tc-plan-model"><PlanSimgesi ad="model" x={i.x + kodGen / 2 + 0.28} z={i.z + 0.03} boy={0.4} /></g>}
                <text className="tc-plan-ad" x={i.x} y={i.z + 0.65} fontSize={0.34} textAnchor="middle">{kisalt(i.ad, i.genislik - 0.4, 0.34)}</text>
              </>
            ) : (
              // Sığ istasyon (tezgah, dar makine): simge solda, kod ve ad sağında.
              <>
                <PlanSimgesi ad={makineCinsi(i.tip, i.ad)} x={i.x - yaziGen / 2 - 0.08} z={i.z} boy={sb} />
                <text className="tc-plan-kod" x={i.x - yaziGen / 2 + sb / 2 + 0.08} y={i.z + 0.02} fontSize={0.42} textAnchor="start">{i.kod}</text>
                {i.modelId !== null && (
                  <g className="tc-plan-model"><PlanSimgesi ad="model" x={i.x - yaziGen / 2 + sb / 2 + 0.08 + kodGen * 0.875 + 0.25} z={i.z - 0.13} boy={0.36} /></g>
                )}
                <text className="tc-plan-ad" x={i.x - yaziGen / 2 + sb / 2 + 0.08} y={i.z + 0.36} fontSize={0.26} textAnchor="start">{kisalt(i.ad, yaziGen, 0.26)}</text>
              </>
            )}
          </g>
        );
      })}

      {t.gecisler.map((g) => {
        const b = g.salonId === null ? undefined : t.bolumler?.find((o) => o.salonId === g.salonId);
        const bg = b ? b.genislik : G;
        const bd = b ? b.derinlik : D;
        const [s0, s1] = gecisAraligi(g, bg, bd);
        const p0 = kenarNoktasi(g.kenar, s0, bg, bd);
        const p1 = kenarNoktasi(g.kenar, s1, bg, bd);
        // Simge geçişin hemen içinde (duvar çizgisinin üstünde kalmaz).
        const ic = 0.75;
        const sx = (p0.x + p1.x) / 2 + (g.kenar === 'sol' ? ic : g.kenar === 'sag' ? -ic : 0);
        const sz = (p0.z + p1.z) / 2 + (g.kenar === 'arka' ? ic : g.kenar === 'on' ? -ic : 0);
        return (
          <g key={g.anahtar} className={sinif(g.anahtar, 'tc-plan-gecis')} data-tur={g.tur} transform={b ? yerDonusumu(b) : undefined} onPointerDown={bas(g.anahtar)}>
            <line x1={p0.x} y1={p0.z} x2={p1.x} y2={p1.z} strokeWidth={0.45} />
            <circle cx={sx} cy={sz} r={0.42} />
            <PlanSimgesi ad={`gecis_${g.tur}`} x={sx} z={sz} boy={0.56} />
          </g>
        );
      })}

      {girisler.map((g) => (
        <g key={g.anahtar} className={sinif(g.anahtar, 'tc-plan-giris')} onPointerDown={bas(g.anahtar)}>
          <circle cx={g.x} cy={g.z} r={0.45} />
          <PlanSimgesi ad="giris" x={g.x} z={g.z} boy={0.6} />
          <text className="tc-plan-ad" x={g.x} y={g.z - 0.65} fontSize={0.4} textAnchor="middle">Giriş</text>
        </g>
      ))}

      {/* Bölüm başlığı: bölümü sürükleme tutamağı (fabrika planı). */}
      {t.bolumler?.map((b) => (
        <g key={b.anahtar} className={sinif(b.anahtar, 'tc-plan-bolum-baslik')} transform={yerDonusumu(b)} onPointerDown={bas(b.anahtar)}>
          <rect x={0} y={-3} width={Math.max(6, Math.min(b.genislik, (b.kod.length + b.ad.length) * 0.62 + 3))} height={2} rx={0.3} />
          <text x={0.5} y={-1.65} fontSize={1} textAnchor="start">{kisalt(`${b.kod} · ${b.ad}`, Math.max(6, b.genislik) - 1, 1)}</text>
        </g>
      ))}

      {rota && rota.length > 1 && <polyline className="tc-plan-rota" points={rota.map((n) => `${n.x},${n.z}`).join(' ')} />}

      {duzenlenir && secili && <Tutamaklar t={t} secili={secili} dondurBas={dondurBas} ucBas={ucBas} />}
      {ust}
    </svg>
  );
}

const yerDonusumu = (b: { x: number; z: number; donus: number }): string => `translate(${b.x} ${b.z}) rotate(${b.donus})`;

// Zemin çizgileri: düzenlerken metre ızgarası, her zaman hücreler ve adları.
function ZeminCizgileri({ G, D, H, sutunlar, satirlar, metre }: { G: number; D: number; H: number; sutunlar: readonly string[]; satirlar: readonly string[]; metre: boolean }) {
  return (
    <>
      {metre && Array.from({ length: Math.max(0, Math.ceil(G) - 1) }, (_, i) => i + 1).map((x) => <line key={`mx${x}`} className="tc-plan-izgara" x1={x} y1={0} x2={x} y2={D} />)}
      {metre && Array.from({ length: Math.max(0, Math.ceil(D) - 1) }, (_, i) => i + 1).map((z) => (
        <line key={`mz${z}`} className="tc-plan-izgara" x1={0} y1={z} x2={G} y2={z} />
      ))}
      {sutunlar.map((s, i) => (
        <g key={`s${s}`}>
          {i > 0 && <line className="tc-plan-hucre" x1={i * H} y1={0} x2={i * H} y2={D} />}
          <text className="tc-plan-hucre-adi" x={(i + 0.5) * H} y={-0.35} fontSize={0.6} textAnchor="middle">{s}</text>
        </g>
      ))}
      {satirlar.map((s, i) => (
        <g key={`r${s}`}>
          {i > 0 && <line className="tc-plan-hucre" x1={0} y1={i * H} x2={G} y2={i * H} />}
          <text className="tc-plan-hucre-adi" x={-0.45} y={(i + 0.5) * H + 0.2} fontSize={0.6} textAnchor="middle">{s}</text>
        </g>
      ))}
    </>
  );
}

// Bölge etiketi: simge ve ad sol üst köşede (ortadaki istasyon, palet ya da rafın altında kalmaz).
function AlanEtiketi({ a }: { a: Taslak['alanlar'][number] }) {
  const s = Math.min(0.9, Math.max(0.45, Math.min(a.genislik, a.derinlik) * 0.25));
  const aci = (a.donus * Math.PI) / 180;
  const yer = (lx: number, lz: number) => ({
    x: a.x + lx * Math.cos(aci) - lz * Math.sin(aci),
    z: a.z + lx * Math.sin(aci) + lz * Math.cos(aci),
  });
  const simge = yer(-a.genislik / 2 + 0.25 + s / 2, -a.derinlik / 2 + 0.25 + s / 2);
  const yazi = yer(-a.genislik / 2 + 0.4 + s, -a.derinlik / 2 + 0.25 + s * 0.68);
  return (
    <>
      <PlanSimgesi ad={a.tur} x={simge.x} z={simge.z} boy={s} />
      <text className="tc-plan-ad" x={yazi.x} y={yazi.z} fontSize={0.42} textAnchor="start">{a.ad}</text>
    </>
  );
}

function Tutamaklar({ t, secili, dondurBas, ucBas }: {
  t: Taslak;
  secili: string;
  dondurBas?: (anahtar: string, o: ReactPointerEvent) => void;
  ucBas?: (anahtar: string, uc: 'bas' | 'son', o: ReactPointerEvent) => void;
}) {
  const duvar = t.duvarlar.find((d) => d.anahtar === secili);
  if (duvar) {
    return (
      <g className="tc-plan-tutamaklar">
        <circle cx={duvar.basX} cy={duvar.basZ} r={0.3} onPointerDown={(o) => { o.stopPropagation(); ucBas?.(secili, 'bas', o); }} />
        <circle cx={duvar.sonX} cy={duvar.sonZ} r={0.3} onPointerDown={(o) => { o.stopPropagation(); ucBas?.(secili, 'son', o); }} />
      </g>
    );
  }
  const oge = [...t.istasyonlar, ...t.makineler, ...t.alanlar].find((o) => o.anahtar === secili)
    ?? t.raflar.map((r) => ({ ...r, genislik: r.bolmeSayisi * r.bolmeGenisligi })).find((r) => r.anahtar === secili);
  if (!oge) return null;
  const a = (oge.donus * Math.PI) / 180;
  const uzaklik = oge.derinlik / 2 + 0.8;
  const hx = oge.x + uzaklik * Math.sin(a);
  const hz = oge.z - uzaklik * Math.cos(a);
  return (
    <g className="tc-plan-tutamaklar">
      <line x1={oge.x} y1={oge.z} x2={hx} y2={hz} />
      <circle cx={hx} cy={hz} r={0.32} aria-label="Döndür" onPointerDown={(o) => { o.stopPropagation(); dondurBas?.(secili, o); }} />
    </g>
  );
}
