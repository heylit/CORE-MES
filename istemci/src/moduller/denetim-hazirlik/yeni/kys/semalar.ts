// KYS semalari: prototipin akis, surec etkilesimi, kaplumbaga ve organizasyon cizimleri (denetim-hazirlik.html 4349-4529).
// Cizim burada yalniz geometri olarak kurulur; renk sinif adindan, sinif tasarim degiskeninden gelir (T12).

export type Boya =
  | 'yazi' | 'yazi2' | 'yazi3' | 'cizgi' | 'vurgu' | 'vurgu-zemin' | 'karar' | 'karar-zemin' | 'belge' | 'belge-zemin'
  | 'iyi' | 'kotu' | 'panel' | 'yan' | 'yan-zemin' | 'beyaz' | 'serit-a' | 'serit-b' | 'serit-cizgi' | 'zemin-acik' | 'vurgu-ustu';

export type SemaOgesi =
  | { tur: 'dikdortgen'; x: number; y: number; w: number; h: number; rx: number; dolgu: Boya; kenar?: Boya; kalinlik?: number; kesik?: string }
  | { tur: 'cokgen'; noktalar: readonly (readonly [number, number])[]; dolgu: Boya; kenar: Boya; kalinlik: number }
  | { tur: 'elips'; cx: number; cy: number; rx: number; ry: number; dolgu: Boya; kenar: Boya; kalinlik: number }
  | { tur: 'daire'; cx: number; cy: number; r: number; dolgu: Boya }
  | { tur: 'yol'; d: string; dolgu?: Boya; kenar: Boya; kalinlik: number; kesik?: string; ok: boolean }
  | {
    tur: 'metin'; x: number; y: number; satirlar: readonly string[]; boyut: number; aralik: number; kalin: number; renk: Boya;
    hiza: 'start' | 'middle' | 'end'; dikey: 'orta' | 'ust'; egik?: boolean; parcalar?: readonly { metin: string; renk: Boya }[];
  };

export interface Sema { w: number; h: number; baslik: string; ogeler: SemaOgesi[] }

export type AkisTuru = 'start' | 'end' | 'proc' | 'dec' | 'doc';
export interface AkisAdimi {
  k: AkisTuru; t: string; r?: string; id?: string; yes?: string; nol?: string;
  no?: { t: string; to: string };
}
export interface Akis { t: string; s: readonly AkisAdimi[] }

export const FLOWS: Readonly<Record<string, Akis>> = {
  dok: {
    t: 'Doküman kontrol akışı',
    s: [
      { k: 'start', t: 'Doküman ihtiyacı veya değişiklik talebi', r: 'surec' },
      { id: 'haz', k: 'proc', t: 'Dokümanı hazırla veya revize et', r: 'surec' },
      { k: 'proc', t: 'Format, kod ve içerik kontrolü', r: 'kys' },
      { k: 'dec', t: 'Uygun mu?', r: 'kys', no: { t: 'Düzeltme için iade et', to: 'haz' } },
      { k: 'proc', t: 'Onayla', r: 'ust' },
      { k: 'proc', t: 'Ana listeye işle, yayınla', r: 'kys' },
      { k: 'proc', t: 'Dağıt, eski revizyonları topla', r: 'kys' },
      { k: 'doc', t: 'Doküman ana listesi', r: 'kys' },
      { k: 'end', t: 'Bitiş' },
    ],
  },
  dof: {
    t: 'Uygunsuz çıktı ve düzeltici faaliyet akışı',
    s: [
      { k: 'start', t: 'Uygunsuzluk tespit edildi', r: 'cal' },
      { k: 'proc', t: 'Tanımla, etiketle, karantinaya al', r: 'cal' },
      { k: 'doc', t: 'Uygunsuzluk ve DÖF formu', r: 'kk' },
      { k: 'proc', t: 'Karar ver: yeniden işleme, tamir, olduğu gibi kullan, hurda, iade', r: 'kk' },
      { k: 'dec', t: 'Müşteri onayı gerekli mi?', r: 'kk', yes: 'Hayır', nol: 'Evet', no: { t: 'Müşteri onayını al', to: 'next' } },
      { k: 'dec', t: 'DÖF gerekli mi?', r: 'kys', no: { t: 'Kaydı kapat', to: 'end' } },
      { id: 'kok', k: 'proc', t: 'Kök neden analizi (5 Neden, balık kılçığı)', r: 'surec' },
      { k: 'proc', t: 'Düzeltici faaliyeti planla ve uygula', r: 'surec' },
      { k: 'proc', t: 'Etkinliği veriyle doğrula', r: 'kys' },
      { k: 'dec', t: 'Etkin mi?', r: 'kys', no: { t: 'Kök nedeni yeniden incele', to: 'kok' } },
      { k: 'end', t: 'DÖF\'ü kapat' },
    ],
  },
  ic: {
    t: 'İç denetim akışı',
    s: [
      { k: 'start', t: 'Yıllık iç denetim programı', r: 'kys' },
      { k: 'proc', t: 'Programı onayla', r: 'ust' },
      { k: 'proc', t: 'Denetim planı ve denetçi ataması', r: 'kys' },
      { k: 'proc', t: 'Planı denetlenenlere bildir', r: 'kys' },
      { k: 'proc', t: 'Denetimi yap: görüşme, gözlem, kayıt', r: 'ic' },
      { k: 'doc', t: 'İç denetim raporu', r: 'ic' },
      { k: 'dec', t: 'Uygunsuzluk var mı?', r: 'ic', yes: 'Evet', nol: 'Hayır', no: { t: 'Sonuçları YGG\'ye girdi olarak aktar', to: 'end' } },
      { k: 'proc', t: 'DÖF aç ve uygula', r: 'surec' },
      { k: 'proc', t: 'Etkinliği doğrula', r: 'ic' },
      { k: 'end', t: 'Sonuçlar YGG\'ye' },
    ],
  },
  ygg: {
    t: 'Yönetimin gözden geçirmesi akışı',
    s: [
      { k: 'start', t: 'YGG tarihini planla', r: 'kys' },
      { k: 'proc', t: 'Girdileri topla: hedefler, göstergeler, denetimler, DÖF, müşteri, tedarikçi, riskler', r: 'kys' },
      { k: 'proc', t: 'Toplantıyı yap', r: 'ust' },
      { k: 'proc', t: 'Kararlar: iyileştirme, KYS değişikliği, kaynak', r: 'ust' },
      { k: 'doc', t: 'YGG tutanağı', r: 'kys' },
      { id: 'tak', k: 'proc', t: 'Kararları sorumlu ve terminle takip et', r: 'kys' },
      { k: 'dec', t: 'Kararlar tamamlandı mı?', r: 'kys', no: { t: 'Termin revize et, üst yönetime bildir', to: 'tak' } },
      { k: 'end', t: 'Sonraki YGG\'de değerlendir' },
    ],
  },
  satin: {
    t: 'Satınalma ve tedarikçi akışı',
    s: [
      { k: 'start', t: 'Satınalma ihtiyacı', r: 'surec' },
      { k: 'dec', t: 'Onaylı tedarikçi var mı?', r: 'surec', no: { t: 'Tedarikçiyi değerlendir ve onayla', to: 'next' } },
      { k: 'proc', t: 'Siparişi şartlarıyla ver: resim, revizyon, sertifika, kabul kriteri', r: 'surec' },
      { k: 'proc', t: 'Teslim al', r: 'surec' },
      { k: 'proc', t: 'Giriş kontrolü', r: 'kk' },
      { k: 'dec', t: 'Uygun mu?', r: 'kk', no: { t: 'Uygunsuzluk kaydı, iade veya DÖF', to: 'per' } },
      { k: 'proc', t: 'Kabul et, stoğa al', r: 'surec' },
      { id: 'per', k: 'proc', t: 'Tedarikçi performansını güncelle', r: 'surec' },
      { k: 'end', t: 'Bitiş' },
    ],
  },
  egitim: {
    t: 'Eğitim ve yetkinlik akışı',
    s: [
      { k: 'start', t: 'Görev için yetkinlik şartları', r: 'surec' },
      { k: 'proc', t: 'Mevcut durumu yetkinlik matrisine işle', r: 'surec' },
      { k: 'dec', t: 'Boşluk var mı?', r: 'surec', yes: 'Evet', nol: 'Hayır', no: { t: 'İzlemeye devam et', to: 'end' } },
      { id: 'pln', k: 'proc', t: 'Eğitimi planla', r: 'kys' },
      { k: 'proc', t: 'Eğitimi ver, katılımı kaydet', r: 'kys' },
      { k: 'proc', t: 'Etkinliği değerlendir', r: 'surec' },
      { k: 'dec', t: 'Etkin mi?', r: 'surec', no: { t: 'Yöntemi değiştir, yeniden planla', to: 'pln' } },
      { k: 'doc', t: 'Yetkinlik matrisi güncel', r: 'kys' },
      { k: 'end', t: 'Bitiş' },
    ],
  },
  kal: {
    t: 'Kalibrasyon akışı',
    s: [
      { k: 'start', t: 'Kalibrasyon planı', r: 'kal' },
      { k: 'proc', t: 'Cihazı kalibrasyona gönder veya iç kalibrasyon yap', r: 'kal' },
      { k: 'proc', t: 'Sertifikayı kabul kriterine göre değerlendir', r: 'kal' },
      { k: 'dec', t: 'Kriteri sağlıyor mu?', r: 'kal', no: { t: 'Kullanımdan çek, geriye dönük etki değerlendir', to: 'end' } },
      { k: 'proc', t: 'Etiketle, listeyi güncelle', r: 'kal' },
      { k: 'doc', t: 'Cihaz listesi ve sertifika', r: 'kal' },
      { k: 'end', t: 'Kullanıma al' },
    ],
  },
  satis: {
    t: 'Teklif ve sözleşme gözden geçirme akışı',
    s: [
      { k: 'start', t: 'Müşteri talebi', r: 'surec' },
      { id: 'inc', k: 'proc', t: 'Şartları incele: teknik, kapasite, termin, yasal', r: 'surec' },
      { k: 'dec', t: 'Karşılanabilir mi?', r: 'surec', no: { t: 'Müşteriyle netleştir veya reddet', to: 'inc' } },
      { k: 'proc', t: 'Teklif ver', r: 'surec' },
      { k: 'proc', t: 'Siparişi al, teklifle karşılaştır', r: 'surec' },
      { k: 'dec', t: 'Uyumlu mu?', r: 'surec', no: { t: 'Farkları müşteriyle çöz', to: 'inc' } },
      { k: 'doc', t: 'Sözleşme gözden geçirme kaydı', r: 'surec' },
      { k: 'end', t: 'Planlamaya aktar' },
    ],
  },
  sikayet: {
    t: 'Müşteri şikâyeti akışı',
    s: [
      { k: 'start', t: 'Şikâyet veya iade alındı', r: 'surec' },
      { k: 'proc', t: 'Kaydet, müşteriye alındı bildir', r: 'kys' },
      { k: 'proc', t: 'Anlık önlem: stok ve sevkiyatı kontrol et', r: 'kk' },
      { id: 'kok', k: 'proc', t: 'Kök neden analizi ve DÖF', r: 'surec' },
      { k: 'proc', t: 'Müşteriye yanıt ver', r: 'kys' },
      { k: 'dec', t: 'Müşteri kabul etti mi?', r: 'kys', no: { t: 'Analizi derinleştir', to: 'kok' } },
      { k: 'end', t: 'Kapat, memnuniyet analizine ekle' },
    ],
  },
};

export interface RolSatiri { n: string; p: string }
export type SurecDurumu = 'iyi' | 'kotu' | null;
export interface SemaSureci {
  id: string; name: string; type: string; owner: string; inputs: string; outputs: string;
  res: string; who: string; kpi: string; risk: string;
}

export function wrapT(t: string, max: number): string[] {
  const w = String(t || '').split(/\s+/).filter(Boolean);
  const L: string[] = [];
  let c = '';
  w.forEach((x) => {
    if (c && (c + ' ' + x).length > max) { L.push(c); c = x; } else c = c ? c + ' ' + x : x;
  });
  if (c) L.push(c);
  return L.length ? L : [''];
}

interface MetinSecenegi { s?: number; lh?: number; w?: number; f?: Boya; a?: 'start' | 'middle' | 'end'; egik?: boolean }

// Prototip tl(): satirlar dikeyde ortalanir.
function tl(x: number, y: number, satirlar: readonly string[], o: MetinSecenegi = {}): SemaOgesi {
  const boyut = o.s ?? 12.5;
  const aralik = o.lh ?? boyut * 1.28;
  return {
    tur: 'metin', x, y: y - (satirlar.length - 1) * aralik / 2, satirlar, boyut, aralik, kalin: o.w ?? 400,
    renk: o.f ?? 'yazi', hiza: o.a ?? 'middle', dikey: 'orta', egik: o.egik,
  };
}

function ln(x1: number, y1: number, x2: number, y2: number, o: { c?: Boya; w?: number; d?: string; a?: boolean } = {}): SemaOgesi {
  return { tur: 'yol', d: `M${x1} ${y1}L${x2} ${y2}`, kenar: o.c ?? 'yazi2', kalinlik: o.w ?? 1.5, kesik: o.d, ok: o.a !== false };
}

function pl(pts: readonly (readonly [number, number])[], o: { c?: Boya; d?: string } = {}): SemaOgesi {
  return { tur: 'yol', d: 'M' + pts.map((p) => `${p[0]} ${p[1]}`).join('L'), kenar: o.c ?? 'yazi2', kalinlik: 1.5, kesik: o.d, ok: true };
}

function kes(n: string, k: number): string { return n.length > k ? n.slice(0, k - 1) + '…' : n; }

export function akisSemasi(key: string, rol: (k: string) => RolSatiri): Sema | null {
  const F = FLOWS[key];
  if (!F) return null;
  const laneW = 138, cx = laneW + 22 + 130, BW = 260, SW = 200, sx = cx + BW / 2 + 50 + SW / 2, gap = 34;
  let y = 22;
  const idx: Record<string, number> = {};
  F.s.forEach((s, i) => { if (s.id) idx[s.id] = i; });
  const S = F.s.map((s) => {
    const L = wrapT(s.t, s.k === 'dec' ? 20 : 32);
    const h = s.k === 'dec' ? Math.max(74, L.length * 15 + 44) : Math.max(42, L.length * 15 + 20);
    const o = { ...s, L, h, y, cy: y + h / 2 };
    y += h + gap;
    return o;
  });
  const H = y - gap + 22;
  const backs = S.filter((s) => s.no && s.no.to !== 'next' && s.no.to !== 'end').length;
  const W = sx + SW / 2 + 24 + backs * 14 + 10;
  const lanes: SemaOgesi[] = [];
  const body: SemaOgesi[] = [];
  let last: string | null = null;
  S.forEach((s, i) => {
    if (!s.r || s.r === last) return;
    let j = i;
    while (j + 1 < S.length && S[j + 1]!.r === s.r) j++;
    const y1 = i ? s.y - gap / 2 : 0;
    const sj = S[j]!;
    const y2 = j < S.length - 1 ? sj.y + sj.h + gap / 2 : H;
    const R = rol(s.r);
    lanes.push({ tur: 'dikdortgen', x: 0, y: y1, w: laneW, h: y2 - y1, rx: 0, dolgu: i % 2 ? 'serit-a' : 'serit-b' });
    if (i) lanes.push({ tur: 'yol', d: `M0 ${y1}L${W} ${y1}`, kenar: 'serit-cizgi', kalinlik: 1, ok: false });
    lanes.push(tl(10, (y1 + y2) / 2, wrapT(R.n, 18).concat(R.p ? [R.p] : []), { s: 11, a: 'start', f: 'yazi2', w: 700 }));
    last = s.r;
  });
  let bi = 0;
  S.forEach((s, i) => {
    const x0 = cx - BW / 2;
    if (s.k === 'start' || s.k === 'end') body.push({ tur: 'dikdortgen', x: x0, y: s.y, w: BW, h: s.h, rx: s.h / 2, dolgu: 'vurgu-zemin', kenar: 'vurgu', kalinlik: 1.6 });
    else if (s.k === 'dec') {
      body.push({ tur: 'cokgen', noktalar: [[cx, s.y], [cx + 120, s.cy], [cx, s.y + s.h], [cx - 120, s.cy]], dolgu: 'karar-zemin', kenar: 'karar', kalinlik: 1.6 });
    } else if (s.k === 'doc') {
      const b = s.y + s.h;
      body.push({
        tur: 'yol', d: `M${x0} ${s.y}H${x0 + BW}V${b - 6}Q${x0 + BW * 0.75} ${b - 16} ${cx} ${b - 6}T${x0} ${b - 6}Z`,
        dolgu: 'belge-zemin', kenar: 'belge', kalinlik: 1.6, ok: false,
      });
    } else body.push({ tur: 'dikdortgen', x: x0, y: s.y, w: BW, h: s.h, rx: 6, dolgu: 'beyaz', kenar: 'yazi2', kalinlik: 1.4 });
    body.push(tl(cx, s.k === 'doc' ? s.cy - 3 : s.cy, s.L, { s: 12.5, w: s.k === 'start' || s.k === 'end' ? 700 : 400 }));
    if (i < S.length - 1) {
      body.push(ln(cx, s.y + s.h, cx, S[i + 1]!.y));
      if (s.k === 'dec') body.push(tl(cx + 8, s.y + s.h + 12, [s.yes || 'Evet'], { s: 11, a: 'start', f: 'iyi', w: 700 }));
    }
    if (!s.no) return;
    const nl = wrapT(s.no.t, 24), sh = Math.max(40, nl.length * 15 + 18), rx = cx + 120, term = s.no.to === 'end';
    body.push(ln(rx, s.cy, sx - SW / 2, s.cy), tl((rx + sx - SW / 2) / 2, s.cy - 10, [s.nol || 'Hayır'], { s: 11, f: 'yan', w: 700 }));
    body.push({
      tur: 'dikdortgen', x: sx - SW / 2, y: s.cy - sh / 2, w: SW, h: sh, rx: term ? sh / 2 : 6,
      dolgu: term ? 'vurgu-zemin' : 'yan-zemin', kenar: term ? 'vurgu' : 'yan', kalinlik: 1.4,
    }, tl(sx, s.cy, nl, { s: 12 }));
    const sonraki = S[i + 1];
    if (s.no.to === 'next' && sonraki) {
      const jy = sonraki.y - 11;
      body.push(pl([[sx, s.cy + sh / 2], [sx, jy], [cx + 3, jy]]), { tur: 'daire', cx, cy: jy, r: 3, dolgu: 'yazi2' });
    } else if (!term) {
      const hedef = idx[s.no.to];
      const t2 = hedef === undefined ? undefined : S[hedef];
      if (t2) {
        const X = sx + SW / 2 + 16 + bi * 14, tx = t2.k === 'dec' ? cx + 120 : cx + BW / 2;
        bi++;
        body.push(pl([[sx + SW / 2, s.cy], [X, s.cy], [X, t2.cy], [tx, t2.cy]]));
      }
    }
  });
  return { w: W, h: H, baslik: F.t, ogeler: lanes.concat(body) };
}

const SUREC_SERITLERI: readonly (readonly [string, string])[] = [
  ['y', 'Yönetim süreçleri'], ['a', 'Ana süreçler (değer zinciri)'], ['d', 'Destek süreçleri'],
];

export function etkilesimSemasi(P: readonly SemaSureci[], firma: string, durum: (p: SemaSureci) => SurecDurumu): Sema {
  const W = 940, cL = 176, cR = 764, inner = cR - cL - 40, body: SemaOgesi[] = [], y = 20;
  const renk = (p: SemaSureci): Boya => { const d = durum(p); return d === null ? 'yazi3' : d; };
  function chips(list: readonly SemaSureci[], num: boolean) {
    const rows: { p: SemaSureci; w: number }[][] = [[]];
    let w = 0;
    list.forEach((p) => {
      const cw = Math.min(230, p.name.length * 6.7 + 40 + (num ? 18 : 0));
      if (w + cw > inner && rows[rows.length - 1]!.length) { rows.push([]); w = 0; }
      rows[rows.length - 1]!.push({ p, w: cw });
      w += cw + (num ? 30 : 12);
    });
    return rows;
  }
  const lanes = SUREC_SERITLERI.map((L) => {
    const rows = chips(P.filter((p) => p.type === L[0]), L[0] === 'a');
    return { k: L[0], t: L[1], rows, h: Math.max(1, rows.length) * 44 + 36, y: 0 };
  });
  const top = y + 34;
  let cy = top;
  lanes.forEach((L, i) => { L.y = cy; cy += L.h + (i < 2 ? 38 : 0); });
  const bottom = cy, H = bottom + 96;
  body.push(
    { tur: 'dikdortgen', x: cL, y: top - 24, w: cR - cL, h: bottom - top + 40, rx: 14, dolgu: 'zemin-acik', kenar: 'vurgu', kalinlik: 1.6 },
    tl(cL + 14, top - 10, [(firma || 'Firma') + ' · Kalite yönetim sistemi'], { s: 12.5, a: 'start', w: 700, f: 'vurgu' }),
  );
  const [ust, ana, alt] = lanes as [typeof lanes[0], typeof lanes[0], typeof lanes[0]];
  const aMid = ana.y + ana.h / 2;
  lanes.forEach((L) => {
    body.push(
      { tur: 'dikdortgen', x: cL + 16, y: L.y, w: cR - cL - 32, h: L.h, rx: 10, dolgu: L.k === 'a' ? 'vurgu-zemin' : 'panel', kenar: L.k === 'a' ? 'vurgu' : 'cizgi', kalinlik: 1 },
      tl(cL + 28, L.y + 15, [L.t], { s: 11.5, a: 'start', w: 700, f: 'yazi2' }),
    );
    let n = 0;
    if (!L.rows[0]!.length) body.push(tl(cL + 28, L.y + 40, ['Süreçler sekmesinde tanımlanmadı'], { s: 11.5, a: 'start', f: 'yazi3' }));
    L.rows.forEach((r, ri) => {
      let x = cL + 28;
      const yy = L.y + 30 + ri * 44;
      r.forEach((c, ci) => {
        n++;
        body.push(
          { tur: 'dikdortgen', x, y: yy, w: c.w, h: 32, rx: 8, dolgu: 'beyaz', kenar: 'yazi2', kalinlik: 1.2 },
          { tur: 'daire', cx: x + 14, cy: yy + 16, r: 4.5, dolgu: renk(c.p) },
        );
        if (L.k === 'a') body.push(tl(x + 30, yy + 16, [String(n)], { s: 10.5, w: 700, f: 'vurgu' }));
        body.push(tl(x + (L.k === 'a' ? 42 : 26), yy + 16, [kes(c.p.name, 30)], { s: 12, a: 'start' }));
        if (L.k === 'a' && ci < r.length - 1) body.push(ln(x + c.w + 2, yy + 16, x + c.w + 26, yy + 16));
        x += c.w + (L.k === 'a' ? 30 : 12);
      });
    });
  });
  const mx = (cL + cR) / 2;
  body.push(
    ln(mx, ust.y + ust.h + 2, mx, ana.y - 2),
    tl(mx + 8, ust.y + ust.h + 19, ['yönlendirir, kaynak sağlar'], { s: 10.5, a: 'start', f: 'yazi3' }),
    ln(mx, alt.y - 2, mx, ana.y + ana.h + 2),
    tl(mx + 8, alt.y - 19, ['destekler'], { s: 10.5, a: 'start', f: 'yazi3' }),
    { tur: 'dikdortgen', x: 10, y: aMid - 70, w: cL - 38, h: 140, rx: 10, dolgu: 'belge-zemin', kenar: 'belge', kalinlik: 1 },
    tl(10 + (cL - 38) / 2, aMid, ['Müşteri ve', 'ilgili taraf', 'şartları'], { s: 12.5, w: 700, f: 'belge' }),
    { tur: 'dikdortgen', x: cR + 28, y: aMid - 70, w: W - cR - 38, h: 140, rx: 10, dolgu: 'belge-zemin', kenar: 'belge', kalinlik: 1 },
    tl(cR + 28 + (W - cR - 38) / 2, aMid, ['Uygun ürün', 've müşteri', 'memnuniyeti'], { s: 12.5, w: 700, f: 'belge' }),
    ln(cL - 28, aMid, cL + 14, aMid),
    ln(cR - 14, aMid, cR + 26, aMid),
  );
  const fb = bottom + 46, sagX = cR + 28 + (W - cR - 38) / 2, solX = 10 + (cL - 38) / 2;
  body.push(
    pl([[sagX, aMid + 70], [sagX, fb], [solX, fb], [solX, aMid + 72]], { d: '6 4', c: 'vurgu' }),
    tl(W / 2, fb + 14, ['Geri bildirim, ölçme, iç denetim, YGG ve iyileştirme (PUKÖ)'], { s: 11.5, f: 'vurgu', w: 700 }),
    {
      tur: 'metin', x: W - 12, y: H - 12, satirlar: [''], boyut: 10.5, aralik: 0, kalin: 400, renk: 'yazi3', hiza: 'end', dikey: 'ust',
      parcalar: [
        { metin: '●', renk: 'iyi' }, { metin: ' hedefte  ', renk: 'yazi3' }, { metin: '●', renk: 'kotu' },
        { metin: ' hedef dışı  ', renk: 'yazi3' }, { metin: '●', renk: 'yazi3' }, { metin: ' veri yok', renk: 'yazi3' },
      ],
    },
  );
  return { w: W, h: H, baslik: 'Süreç etkileşim şeması', ogeler: body };
}

export interface KaplumbagaGirdisi {
  surec: SemaSureci; turAdi: string; nasil: readonly string[]; olcutler: readonly string[];
}

function parcala(v: string): string[] { return v ? v.split(/[,;\n]/) : []; }

export function kaplumbagaSemasi({ surec: p, turAdi, nasil, olcutler }: KaplumbagaGirdisi): Sema {
  const W = 960, H = 572, cx = W / 2, cy = H / 2, BW = 270, BH = 172, body: SemaOgesi[] = [];
  const box = [
    { t: 'Ne ile? Ekipman, altyapı, yazılım', v: parcala(p.res), x: 16, y: 12, ph: 'Tezgâh, ölçüm cihazı, ERP modülü…', io: false },
    { t: 'Kim ile? Yetkinlik, rol', v: parcala(p.who).concat(p.owner ? ['Süreç sahibi: ' + p.owner] : []), x: W - 16 - BW, y: 12, ph: 'Görev ve yetkinlik şartları…', io: false },
    { t: 'Girdiler', v: parcala(p.inputs), x: 16, y: cy - BH / 2, ph: 'Sipariş, malzeme, talimat…', io: true },
    { t: 'Çıktılar', v: parcala(p.outputs), x: W - 16 - BW, y: cy - BH / 2, ph: 'Uygun ürün, kayıt…', io: true },
    { t: 'Nasıl? Yöntem, prosedür, talimat', v: [...nasil], x: 16, y: H - 12 - BH, ph: 'Prosedür ve talimat kodları…', io: false },
    { t: 'Ölçütler: gösterge ve hedef', v: [...olcutler], x: W - 16 - BW, y: H - 12 - BH, ph: 'Gösterge, hedef, izleme sıklığı…', io: false },
  ];
  box.forEach((b) => {
    let lines: string[] = [];
    b.v.map((x) => x.trim()).filter(Boolean).slice(0, 5).forEach((x) => { wrapT('• ' + x, 38).forEach((q) => lines.push(q)); });
    const empty = !lines.length;
    if (empty) lines = [b.ph];
    lines = lines.slice(0, 7);
    body.push(
      { tur: 'dikdortgen', x: b.x, y: b.y, w: BW, h: BH, rx: 12, dolgu: b.io ? 'belge-zemin' : 'panel', kenar: b.io ? 'belge' : 'cizgi', kalinlik: 1.4 },
      tl(b.x + 14, b.y + 20, [b.t], { s: 12.5, a: 'start', w: 700, f: b.io ? 'belge' : 'yazi2' }),
      { tur: 'metin', x: b.x + 14, y: b.y + 46, satirlar: lines, boyut: 12, aralik: 17, kalin: 400, renk: empty ? 'yazi3' : 'yazi', hiza: 'start', dikey: 'ust', egik: empty },
    );
  });
  const L0 = 16 + BW, R0 = W - 16 - BW;
  body.push(ln(L0 + 2, cy, cx - 140, cy), ln(cx + 140, cy, R0 - 2, cy));
  ([[L0, 12 + BH / 2, cx - 96, cy - 66], [R0, 12 + BH / 2, cx + 96, cy - 66], [L0, H - 12 - BH / 2, cx - 96, cy + 66], [R0, H - 12 - BH / 2, cx + 96, cy + 66]] as const)
    .forEach((q) => body.push(ln(q[0], q[1], q[2], q[3], { d: '5 4', a: false, c: 'yazi3' })));
  body.push(
    { tur: 'elips', cx, cy, rx: 138, ry: 92, dolgu: 'vurgu-zemin', kenar: 'vurgu', kalinlik: 2 },
    tl(cx, cy - 18, wrapT(p.name, 22), { s: 15, w: 700, f: 'vurgu' }),
    tl(cx, cy + 22, [turAdi + ' süreç'], { s: 11.5, f: 'yazi2' }),
    tl(cx, cy + 40, [p.owner ? 'Sahibi: ' + p.owner : 'Sahibi tanımlı değil'], { s: 11.5, f: p.owner ? 'yazi2' : 'kotu' }),
  );
  return { w: W, h: H, baslik: 'Kaplumbağa diyagramı: ' + p.name, ogeler: body };
}

export function organizasyonSemasi(P: readonly SemaSureci[], rol: (k: string) => RolSatiri): Sema {
  const units: Record<string, string[]> = {}, order: string[] = [], gmP: string[] = [], ksP: string[] = [];
  P.forEach((p) => {
    const o = (p.owner || 'Sahibi atanmamış').trim();
    if (/genel\s*m[üu]d[üu]r|üst\s*yönetim/i.test(o)) { gmP.push(p.name); return; }
    if (/^kys|kalite\s*yönetim\s*temsil|yönetim\s*temsil/i.test(o)) { ksP.push(p.name); return; }
    if (!units[o]) { units[o] = []; order.push(o); }
    units[o].push(p.name);
  });
  if (!order.length && !P.length) ['Kalite', 'Üretim', 'Satınalma', 'Satış', 'İnsan kaynakları'].forEach((o) => { units[o] = []; order.push(o); });
  const per = Math.min(5, Math.max(1, order.length)), BW = 168, gx = 20, rowsN = Math.ceil(order.length / per);
  const W = Math.max(780, per * (BW + gx) + 40), cx = W / 2;
  const gm = rol('ust'), ks = rol('kys'), ic = rol('ic');
  const gmH = 58 + (gmP.length ? Math.min(3, gmP.length) * 15 + 6 : 0), ksH = 50 + (ksP.length ? Math.min(3, ksP.length) * 15 + 6 : 0);
  let maxL = 0;
  order.forEach((o) => { maxL = Math.max(maxL, units[o]!.length); });
  const UH = 50 + Math.max(1, Math.min(6, maxL)) * 16;
  const bus0 = Math.max(20 + gmH, 86 + ksH) + 22, H = bus0 + rowsN * (UH + 44) + 56;
  const conn: SemaOgesi[] = [], boxes: SemaOgesi[] = [];
  boxes.push(
    { tur: 'dikdortgen', x: cx - 115, y: 20, w: 230, h: gmH, rx: 10, dolgu: 'vurgu' },
    tl(cx, 40, ['Genel Müdür'], { s: 14, w: 700, f: 'beyaz' }),
    tl(cx, 58, [gm.p || 'atanmadı'], { s: 11.5, f: 'vurgu-ustu' }),
  );
  gmP.slice(0, 3).forEach((n, i) => boxes.push(tl(cx, 80 + i * 15, ['• ' + kes(n, 30)], { s: 10.5, f: 'vurgu-ustu' })));
  const kx = cx + 130;
  boxes.push(
    { tur: 'dikdortgen', x: kx, y: 86, w: 220, h: ksH, rx: 10, dolgu: 'vurgu-zemin', kenar: 'vurgu', kalinlik: 1, kesik: '5 3' },
    tl(kx + 110, 104, ['KYS sorumlusu'], { s: 12.5, w: 700, f: 'vurgu' }),
    tl(kx + 110, 121, [ks.p || 'atanmadı'], { s: 11, f: 'yazi2' }),
  );
  ksP.slice(0, 3).forEach((n, i) => boxes.push(tl(kx + 110, 142 + i * 15, ['• ' + kes(n, 30)], { s: 10.5, f: 'yazi2' })));
  conn.push(ln(cx, 20 + gmH, cx, bus0, { a: false }), ln(cx, 108, kx, 108, { a: false, d: '5 3', c: 'vurgu' }));
  let trunkX = cx;
  for (let r = 0; r < rowsN; r++) {
    const row = order.slice(r * per, (r + 1) * per), rw = row.length * (BW + gx) - gx, x0 = cx - rw / 2, bus = bus0 + r * (UH + 44), yT = bus + 14;
    if (r === 0 && rowsN > 1) {
      let best: number | null = null;
      for (let k = 1; k < row.length; k++) {
        const gxp = x0 + k * (BW + gx) - gx / 2;
        if (best === null || Math.abs(gxp - cx) < Math.abs(best - cx)) best = gxp;
      }
      trunkX = best === null ? x0 - gx / 2 : best;
    }
    conn.push(ln(Math.min(x0 + BW / 2, trunkX), bus, Math.max(x0 + rw - BW / 2, trunkX), bus, { a: false }));
    if (r > 0) conn.push(ln(trunkX, bus - (UH + 44), trunkX, bus, { a: false }));
    row.forEach((o, i) => {
      const x = x0 + i * (BW + gx);
      conn.push(ln(x + BW / 2, bus, x + BW / 2, yT, { a: false }));
      const birim = units[o]!;
      const satir = birim.slice(0, 6).map((n) => '• ' + kes(n, 24));
      if (birim.length > 6) satir.push('+' + (birim.length - 6) + ' süreç');
      boxes.push(
        { tur: 'dikdortgen', x, y: yT, w: BW, h: UH, rx: 10, dolgu: 'beyaz', kenar: 'yazi2', kalinlik: 1.3 },
        { tur: 'dikdortgen', x: x + 1, y: yT + 1, w: BW - 2, h: 29, rx: 9, dolgu: 'panel' },
        tl(x + BW / 2, yT + 15, [kes(o, 22)], { s: 12.5, w: 700 }),
        { tur: 'metin', x: x + 10, y: yT + 47, satirlar: satir, boyut: 11, aralik: 16, kalin: 400, renk: 'yazi2', hiza: 'start', dikey: 'ust' },
      );
    });
  }
  const not = tl(20, H - 22, ['İç denetçiler: ' + (ic.p || 'atanmadı') + ' · Denetçiler kendi alanlarını denetlemez. Kesikli çizgi: kurmay (danışma) bağı.'], { s: 11, a: 'start', f: 'yazi3' });
  return { w: W, h: H, baslik: 'Organizasyon şeması', ogeler: conn.concat(boxes, [not]) };
}
