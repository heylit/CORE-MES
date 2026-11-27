// Elle taşımada itme (2790 a, 2790-2 a, 2794): taşınan iş verilen tezgâhta verilen saatte kilitlenir; aynı emrin adımları rotadaki bağ
// türüne göre yeniden yaslanır. Bekleyen bağda ardıl öncül bitince, örtülü bağda ilk devir partisi gelince başlar ve öncülden önce bitmez;
// bağımsız adımın bağı yoktur, kımıldamaz. Başka emrin işi itilmez: itilen adım tezgâhtaki en yakın boş yere oturur (2794 2/3 b). Geri
// çekilen öncül şimdiye, donuk bölgeye ya da başlamış adıma çarparsa engelden sonraki ilk uygun yere oturur, taşınan iş onun arkasına kayar
// (3/3 b). Başlamış ve donuk adım kımıldamaz; onu geçersiz kılan ya da ufku aşan taşımanın tamamı yapılmaz (1/3 a). Taşınan işin kendisi
// sürüyorsa çağıran onu sabit vermez: durdurulmuş sayılır, kalanı taşınır (3414-6 a). Taşınan iş elle
// konduğu için donuk bölgede olabilir; sabit sayılması çağıranın kararıdır. Saf: takvim dışarıdan.

export type BagTuru = 'b' | 'o';
export interface TasimaIsi {
  id: string; job: string; opNo: string; m: string; S: number; C: number; lot1: number;
  // Başlamış, biten ya da donuk bölgedeki iş yerinde kalır.
  sabit: boolean; fas: boolean;
  // Sabitliğin nedeni; ileti ne yapılacağını buna göre söyler. Yoksa genel ileti yazılır.
  neden?: 'basladi' | 'bitti' | 'geride' | 'donuk';
}
export interface TasimaYeri { S: number; C: number; lot1: number }
export interface TasimaGirdisi {
  isler: ReadonlyMap<string, TasimaIsi>;
  // İşin öncülleri (aynı emirden) ve bağ türü; bağımsız adımın öncülü yoktur.
  onculler: ReadonlyMap<string, readonly (readonly [string, BagTuru])[]>;
  simdi: number; donuk: number; ufuk: number; tasimaSaat: number;
  // İşin m tezgâhında t'den sonraki ilk çalışma anında başlayan yeri; tezgâh işe uygun değilse null. Ufukta yer yoksa bitiş sonsuzdur.
  yer: (id: string, m: string, t: number) => TasimaYeri | null;
  saatMetni: (h: number) => string;
  tezgahAdi: (m: string) => string;
}
export interface TasimaSatiri { isId: string; tezgah: string; S: number; C: number; eskiTezgah: string; eskiS: number; tur: 'tasinan' | 'itilen' | 'cekilen' }
// bolme: payın taşınması adımın elle bölme kaydını da yazar (3791): kayıt payların adedi ve tezgâhıdır, taşınan payın tezgâhı yenidir.
export interface PayBolmesi { adim: string; kayit: { adet: number; m: string }[] }
export type TasimaSonucu = { gecerli: true; ileti: string | null; isler: TasimaSatiri[]; bolme?: PayBolmesi } | { gecerli: false; ileti: string; isler: [] };

const E = 1e-6;
const ADIM = 0.25;
const red = (ileti: string): TasimaSonucu => ({ gecerli: false, ileti, isler: [] });

export function tasimaItmesi(g: TasimaGirdisi, isId: string, m0: string, S0: number): TasimaSonucu {
  const x = g.isler.get(isId);
  if (x === undefined) return red('İş planda bulunamadı; sayfayı yenileyin.');
  const op = (id: string) => `OP ${g.isler.get(id)?.opNo ?? id}`;
  const yeni = new Map<string, TasimaYeri & { m: string; tur: TasimaSatiri['tur'] }>();
  const yeri = (id: string): TasimaYeri & { m: string } => yeni.get(id) ?? g.isler.get(id)!;
  const ardillar = new Map<string, string[]>();
  for (const [id, l] of g.onculler) for (const [p] of l) ardillar.set(p, [...(ardillar.get(p) ?? []), id]);
  const hazir = (p: string, ty: BagTuru) => { const q = yeri(p), f = g.isler.get(p)!.fas; return ty === 'o' && !f ? q.lot1 + g.tasimaSaat : q.C + (f ? 0 : g.tasimaSaat); };
  // Öncüllerin izin verdiği en erken başlangıç ve (örtülü bağda) en erken bitiş.
  const sinir = (id: string) => {
    let bas = Number.NEGATIVE_INFINITY, bit = Number.NEGATIVE_INFINITY;
    for (const [p, ty] of g.onculler.get(id) ?? []) {
      bas = Math.max(bas, hazir(p, ty));
      if (ty === 'o' && !g.isler.get(p)!.fas) bit = Math.max(bit, yeri(p).C + g.tasimaSaat);
    }
    return { bas, bit };
  };
  // Tezgâhta öteki işlerin dolu aralıkları: yeri değişen iş yeni yerinde, öteki eski yerinde sayılır.
  const dolu = (m: string, haric: string) => [...g.isler.values()].filter((i) => i.id !== haric && !i.fas).map((i) => ({ id: i.id, ...yeri(i.id) }))
    .filter((i) => i.m === m);
  const carpan = (m: string, id: string, y: TasimaYeri) => dolu(m, id).find((a) => a.S < y.C - E && a.C > y.S + E);
  // t'den sonra tezgâhtaki en yakın boş yer (başka işi itmez); örtülü bağda öncülden önce bitmeyecek kadar geç başlar.
  const bosYer = (id: string, m: string, t: number, bitSiniri: number): TasimaYeri | 'uygunsuz' | 'ufuk' => {
    for (let n = 0; n < 2000; n++) {
      const y = g.yer(id, m, t);
      if (y === null) return 'uygunsuz';
      if (y.C > g.ufuk + E) return 'ufuk';
      if (y.C < bitSiniri - E) { t = Math.max(t + ADIM, y.S + (bitSiniri - y.C)); continue; }
      const c = carpan(m, id, y);
      if (c === undefined) return y;
      t = Math.max(c.C, t + E);
    }
    return 'ufuk';
  };
  // Yerinden oynamayan adımın nedeni ve ne yapılacağı (3414).
  const sabitNedeni = (id: string): string => {
    const n = g.isler.get(id)?.neden;
    if (n === 'bitti') return `${op(id)} bitmiş; yeri değişmez. Taşıdığınız işi ondan önce bitecek bir saate bırakın.`;
    if (n === 'basladi') return `${op(id)} başlamış; yeri değişmez. Taşıdığınız işi ondan sonraya bırakın.`;
    if (n === 'geride') return `${op(id)} başlamamış ama başlama saati geçmiş; plan onu çalışıyor sayar ve yerinde tutar. Emri Yeniden planla ile şimdiden sonraya dizin ya da Ayarlar'da "Saati geçmiş, başlamamış iş taşınabilsin" seçeneğini açın.`;
    if (n === 'donuk') return `${op(id)} dondurulmuş bölgede; yeri değişmez. Ayarlar'da Dondurulmuş bölge kısaltılırsa taşınır.`;
    return `${op(id)} başlamış ya da donuk bölgede.`;
  };
  const bosRed = (id: string, m: string, r: 'uygunsuz' | 'ufuk') => red(r === 'uygunsuz'
    ? `${op(id)} ${g.tezgahAdi(m)} tezgâhında yerleşemiyor; taşıma yapılmadı.` : `${op(id)} sığmıyor: plan en geç ${g.saatMetni(g.ufuk)} tarihine kadar uzanıyor; taşıma yapılmadı.`);
  const alt = Math.max(g.simdi, g.donuk);
  // Geri çekme: öncül, ardılının başlangıcına yetişecek en geç boş yere çekilir; kendi öncülleri de gerekirse çekilir. Yer yoksa null.
  const cek = (id: string, ty: BagTuru, sonHazir: number, derinlik: number): boolean => {
    const i = g.isler.get(id)!;
    if (i.sabit || i.fas || derinlik > 50) return false;
    const hazirOf = (y: TasimaYeri) => (ty === 'o' ? y.lot1 : y.C) + g.tasimaSaat;
    for (let t = Math.min(i.S, sonHazir); t >= alt - E; t -= ADIM) {
      const y = g.yer(id, i.m, Math.max(t, alt));
      if (y === null) continue;
      if (hazirOf(y) > sonHazir + E || carpan(i.m, id, y) !== undefined) continue;
      // Başarısız denemenin öncüllerde bıraktığı izler de geri alınır.
      const once = new Map(yeni);
      yeni.set(id, { ...y, m: i.m, tur: 'cekilen' });
      if ((g.onculler.get(id) ?? []).every(([p, pty]) => hazir(p, pty) <= y.S + E || cek(p, pty, y.S, derinlik + 1))) return true;
      yeni.clear();
      for (const [k, v] of once) yeni.set(k, v);
    }
    return false;
  };

  if (x.sabit) return red(`${op(isId)} başlamış ya da donuk bölgede; taşınamaz.`);
  if (S0 < g.simdi - E) return red('İş geçmiş bir saate taşınamaz.');
  const yx = g.yer(isId, m0, S0);
  if (yx === null) return bosRed(isId, m0, 'uygunsuz');
  if (yx.C > g.ufuk + E) return bosRed(isId, m0, 'ufuk');
  yeni.set(isId, { ...yx, m: m0, tur: 'tasinan' });
  const notlar: string[] = [];
  // Öncülü taşınan işten sonra hazır olan: geri çekilir; çekilemezse en erken yerinde kalır ve taşınan iş onun arkasına kayar.
  for (const [p, ty] of g.onculler.get(isId) ?? []) {
    if (hazir(p, ty) <= yx.S + E) continue;
    if (cek(p, ty, yx.S, 0)) continue;
    const pi = g.isler.get(p)!;
    const engel = pi.sabit ? 'başlamış' : g.donuk > g.simdi + E ? 'donuk bölge' : 'şimdi';
    if (!pi.sabit && !pi.fas) {
      const s = sinir(p);
      const y = bosYer(p, pi.m, Math.max(alt, s.bas), s.bit);
      if (typeof y === 'string') return bosRed(p, pi.m, y);
      if (y.S < pi.S - E) yeni.set(p, { ...y, m: pi.m, tur: 'cekilen' });
    }
    notlar.push(`${op(p)} en erken ${g.saatMetni(yeri(p).S)} başlayabilir (${engel})`);
  }
  {
    const s = sinir(isId);
    if (yx.S < s.bas - E || yx.C < s.bit - E) {
      const y = g.yer(isId, m0, Math.max(S0, s.bas));
      const y2 = y === null ? null : y.C < s.bit - E ? g.yer(isId, m0, y.S + (s.bit - y.C)) : y;
      if (y2 === null || y2.C > g.ufuk + E) return red(`${op(isId)} sığmıyor: plan en geç ${g.saatMetni(g.ufuk)} tarihine kadar uzanıyor; taşıma yapılmadı.`);
      yeni.set(isId, { ...y2, m: m0, tur: 'tasinan' });
      notlar.push(`${op(isId)} ${g.saatMetni(y2.S)} saatine kaydı`);
    }
  }
  // Başka siparişin işiyle çakışma (3414-3): taşınan iş öteki işin önüne doğru bırakıldıysa (ondan önce ya da aynı anda başlıyorsa) öteki iş
  // arkadaki en yakın boş yere itilir; içine ya da arkasına doğru bırakıldıysa taşınan iş onun arkasındaki boşluğa oturur. Başlamış ve donuk
  // iş itilmez: taşınan iş onun da arkasına oturur.
  const otekiItilen: string[] = [];
  {
    const cakisan = (y: TasimaYeri) => dolu(m0, isId).filter((a) => g.isler.get(a.id)!.job !== x.job && a.S < y.C - E && a.C > y.S + E);
    let ym: TasimaYeri = yeri(isId), kaydi = false;
    for (let n = 0; n < 500; n++) {
      const engel = cakisan(ym).filter((a) => a.S < ym.S - E || g.isler.get(a.id)!.sabit);
      if (engel.length === 0) break;
      const y = g.yer(isId, m0, Math.max(...engel.map((a) => a.C)));
      if (y === null) return bosRed(isId, m0, 'uygunsuz');
      if (y.C > g.ufuk + E) return bosRed(isId, m0, 'ufuk');
      ym = y; kaydi = true;
    }
    if (kaydi) {
      yeni.set(isId, { ...ym, m: m0, tur: 'tasinan' });
      notlar.push(`${op(isId)} dolu yerin arkasındaki boşluğa, ${g.saatMetni(ym.S)} saatine yerleşti`);
    }
    for (const a of cakisan(ym).sort((p, q) => p.S - q.S)) {
      const s = sinir(a.id);
      const y = bosYer(a.id, a.m, Math.max(ym.C, s.bas), s.bit);
      if (typeof y === 'string') return bosRed(a.id, a.m, y);
      yeni.set(a.id, { ...y, m: a.m, tur: 'itilen' });
      otekiItilen.push(a.id);
    }
    if (otekiItilen.length > 0) notlar.push(`başka siparişin ${String(otekiItilen.length)} işi arkaya itildi`);
  }
  // İleri itme: yeri değişen her işin ardılı, öncüllerinin izin verdiği yerden önceyse tezgâhındaki en yakın boş yere itilir.
  const itilen: string[] = [];
  const fasonlar: string[] = [];
  const kuyruk = [...yeni.keys()];
  for (let n = 0; kuyruk.length > 0 && n < 10_000; n++) {
    const id = kuyruk.shift()!;
    for (const a of ardillar.get(id) ?? []) {
      const ai = g.isler.get(a)!;
      const s = sinir(a), y0 = yeri(a);
      if (y0.S >= s.bas - E && y0.C >= s.bit - E) continue;
      if (ai.sabit) return red(ai.neden === undefined ? `${op(a)} başlamış ya da donuk bölgede; taşıma onu sıraya aykırı bırakır, yapılmadı.` : `Taşıma yapılmadı: sonraki adım rota sırasının dışında kalırdı. ${sabitNedeni(a)}`);
      // Fason adım tezgâhta durmaz ve kilitlenmez; süresini motor plan uygulanınca kurar. Arkasındakiler bekleyecek diye aynı süreyle
      // kaydırılmış sayılır, kendisi sonuca girmez.
      if (ai.fas) {
        const S = Math.max(y0.S, s.bas);
        yeni.set(a, { S, C: y0.C + (S - y0.S), lot1: y0.lot1 + (S - y0.S), m: ai.m, tur: 'itilen' });
        if (!fasonlar.includes(a)) fasonlar.push(a);
        kuyruk.push(a);
        continue;
      }
      const y = bosYer(a, ai.m, s.bas, s.bit);
      if (typeof y === 'string') return bosRed(a, ai.m, y);
      yeni.set(a, { ...y, m: ai.m, tur: yeni.get(a)?.tur === 'cekilen' ? 'cekilen' : 'itilen' });
      if (!itilen.includes(a)) itilen.push(a);
      kuyruk.push(a);
    }
  }
  if (itilen.length > 0) notlar.push(`${itilen.map(op).join(', ')} ileri itildi`);
  if (fasonlar.length > 0) notlar.push(`${fasonlar.map(op).join(', ')} fason; süresi plan uygulanınca yeniden hesaplanır`);
  // Taşınan iş donuk bölgede başka işin yerine girerse operatörün yakın listesi değişir (Atölye N1).
  const xs = yeri(isId);
  if (xs.S < g.donuk - E && (otekiItilen.some((id) => g.isler.get(id)!.S < g.donuk - E) || dolu(m0, isId).some((a) => a.S < g.donuk - E && a.S < xs.C - E && a.C > xs.S + E))) {
    notlar.push(`${g.tezgahAdi(m0)} tezgâhında sıradaki iş değişir; operatör listesi güncellenir`);
  }
  const isler = [...yeni].map(([id, y]) => {
    const i = g.isler.get(id)!;
    return { isId: id, tezgah: y.m, S: y.S, C: y.C, eskiTezgah: i.m, eskiS: i.S, tur: y.tur };
  }).filter((r) => !g.isler.get(r.isId)!.fas && (r.tur === 'tasinan' || Math.abs(r.S - r.eskiS) > E || r.tezgah !== r.eskiTezgah));
  return { gecerli: true, ileti: notlar.length > 0 ? `${notlar.join('; ')}.` : null, isler };
}
