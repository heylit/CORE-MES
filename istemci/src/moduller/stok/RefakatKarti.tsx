import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import qrcode from 'qrcode-generator';
import type {
  RefakatIziCevabi, RefakatKolAcGovdesi, RefakatLotaBaglaCevabi, RefakatLotaBaglaGovdesi, RefakatPartisi, RefakatPartisiAcGovdesi, RefakatPartisiCevabi, RefakatPartisiKartiCevabi,
} from '#paylasilan/sozlesme/stok.ts';
import { Dugme, DurumKutusu, Girdi, Pencere } from '../../ortak/arayuz/index.ts';
import { api } from '../../ortak/veri/api.ts';
import { anahtarlar } from './anahtarlar.ts';
import { EmirSecici } from './EmirSecici.tsx';
import { birimliMiktar, zamanMetni } from './gorunum.ts';
import { yazdir } from './LotEtiketi.tsx';
import { hataMetni, korumaliPost, useIslem, useStokKomutu } from './ortak.tsx';
import './stok.css';

// Refakat partisi (kart #123): depo lotu okutup emre ayırınca kart basılır; teslim kartla yapılır, alan kartı okutur.
// Veri yoksa satır basılmaz.
// İstisna kartının (Soru 129) lotu depo bağlayana kadar boştur.
export const refakatLotSatiri = (r: RefakatPartisi): string =>
  [r.lotNo === null ? 'Lot bekliyor (istisna kartı)' : `Lot ${r.lotNo}`, r.dokumNo && `Döküm ${r.dokumNo}`, r.tedarikciPartiNo && `Parti ${r.tedarikciPartiNo}`, r.sertifikaNo && `Sertifika ${r.sertifikaNo}`].filter(Boolean).join(' · ');
export const refakatMalzemeSatiri = (r: RefakatPartisi): string =>
  [r.malzemeAd ?? `Kart ${r.malzemeId}`, r.malzemeKod, `verilen ${birimliMiktar(r.verilen, r.birim)}`].filter(Boolean).join(' · ');

const kac = (s: string): string => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
function qrSvg(metin: string): string {
  const q = qrcode(0, 'M');
  q.addData(metin);
  q.make();
  const n = q.getModuleCount();
  let d = '';
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (q.isDark(y, x)) d += `M${x} ${y}h1v1h-1z`;
  return `<svg viewBox="-2 -2 ${n + 4} ${n + 4}" xmlns="http://www.w3.org/2000/svg" shape-rendering="crispEdges" role="img" aria-label="QR: ${kac(metin)}">`
    + `<rect x="-2" y="-2" width="${n + 4}" height="${n + 4}" fill="#fff"/><path d="${d}" fill="#000"/></svg>`;
}
const tarih = (t: string | null): string => (t === null ? 'yok' : new Date(`${t}T00:00:00`).toLocaleDateString('tr-TR'));

// Kart kendi belgesinde basılır (100x150 mm, emrin refakat kartıyla aynı ölçü); kâğıt etiket olduğundan renk ve ölçü baskıdan gelir.
// QR partiyi taşır (RP:<id>): okutulunca emir, lot ve teslimler açılır.
export function refakatPartisiBelgesi({ refakat: r, kart: k }: RefakatPartisiKartiCevabi, basim: Date): string {
  const satirlar = k.adimlar.map((a) => `<tr><td>${a.opNo}</td><td>${kac(a.ad)}</td><td>${a.yer === null ? '-' : kac(a.yer)}${a.fason ? ' (fason)' : ''}</td><td>&#9744;</td></tr>`).join('');
  return `<!DOCTYPE html><html lang="tr"><head><meta charset="utf-8"><title>Refakat kartı ${kac(r.etiket)}</title><style>`
    + '@page{size:100mm 150mm;margin:0}*{box-sizing:border-box}html,body{margin:0;background:#fff;color:#000}'
    + 'body{font-family:Arial,sans-serif}.etk{width:100mm;height:150mm;padding:4mm;display:flex;flex-direction:column;overflow:hidden}'
    + '.ust{display:flex;gap:3mm}.ust svg{width:40mm;height:40mm;flex:none}.k{font-size:8pt;line-height:1.35}.buyuk{font:800 15pt monospace;line-height:1.1;overflow-wrap:anywhere}'
    + '.ad{font-weight:700;font-size:10pt;overflow-wrap:anywhere}.mono{font-family:monospace}.lot{margin-top:2mm;border:1px solid #000;padding:1.5mm;font-size:8pt;line-height:1.35}'
    + 'table{width:100%;border-collapse:collapse;font-size:8pt;margin-top:3mm}'
    + 'td,th{border-top:1px solid #000;padding:1mm;text-align:left;vertical-align:top}th{font-size:7pt}td:first-child,th:first-child{width:9mm}td:last-child,th:last-child{width:8mm;text-align:center}'
    + '.alt{margin-top:auto;font-size:7pt;border-top:1px solid #000;padding-top:1mm;display:flex;justify-content:space-between}'
    + '</style></head><body><div class="etk"><div class="ust">'
    + qrSvg(r.qr)
    + `<div><div class="k">REFAKAT KARTI</div><div class="buyuk">${kac(r.etiket)}</div><div class="ad">${kac(k.urun.ad)}</div>`
    + `<div class="k mono">Parça no: ${kac(k.urun.kod)}</div><div class="k">Adet ${k.adet} · Termin ${tarih(k.teslim)}</div></div></div>`
    + `<div class="lot"><strong>${kac(refakatLotSatiri(r))}</strong><br>${kac([r.malzemeAd ?? `Kart ${r.malzemeId}`, r.malzemeKod].filter(Boolean).join(' · '))}</div>`
    + `<table><thead><tr><th>Op</th><th>İş</th><th>İstasyon</th><th>Bitti</th></tr></thead><tbody>${satirlar}</tbody></table>`
    + `<div class="alt"><span>Basım ${basim.toLocaleDateString('tr-TR')}</span><span class="mono">${kac(r.etiket)}</span></div>`
    + '</div></body></html>';
}

// Kartın izi (kart #126): üst, alt ve birleşen kartlar, aynı lotun kartları, kartla üretilen partiler ve sevkler. Kart adına
// basınca pencere o kartı gösterir.
function RefakatIzi({ id, git }: { id: number; git: (id: number) => void }) {
  const q = useQuery({ queryKey: [...anahtarlar.hepsi, 'refakat-izi', id], queryFn: () => api.get<RefakatIziCevabi>(`/stok/refakat-partileri/${id}/iz`) });
  if (q.isPending) return <DurumKutusu durum="yukleniyor" />;
  if (q.isError) return <DurumKutusu durum="hata" mesaj={hataMetni(q.error)} yenile={() => void q.refetch()} />;
  const z = q.data;
  const kartlar = (baslik: string, l: RefakatPartisi[]) => l.length > 0 && (
    <div><strong>{baslik}</strong><ul className="tc-stok-liste">{l.map((k) => (
      <li key={k.id}><button type="button" className="tc-stok-bag" onClick={() => git(k.id)}>{k.etiket}</button>{k.durum === 'iptal' ? ' · iptal' : k.birlestigi ? ` · ${k.birlestigi.etiket} kartına birleşti` : ''}</li>
    ))}</ul></div>
  );
  const bos = [z.ustler, z.altlar, z.birlesenler, z.ayniLot, z.ciktilar, z.sevkler].every((l) => l.length === 0);
  return (
    <section className="tc-stok-form" aria-label="Kartın izi">
      <h3 className="tc-stok-alt-baslik">İz</h3>
      {bos && <p className="tc-stok-not">Bu kartla henüz üretim, sevk ya da bağlı kart yok.</p>}
      {kartlar('Üst kartlar', z.ustler)}
      {kartlar('Alt parti kartları', z.altlar)}
      {kartlar('Bu karta birleşenler', z.birlesenler)}
      {kartlar('Aynı lotun diğer kartları', z.ayniLot)}
      {z.ciktilar.length > 0 && (
        <div><strong>Üretilen partiler</strong><ul className="tc-stok-liste">{z.ciktilar.map((c) => (
          <li key={c.partiId}>{c.lotNo} · {c.malzemeAd ?? c.malzemeKod ?? `Kart ${c.malzemeId}`} · elde {birimliMiktar(c.eldeki, c.birim)}</li>
        ))}</ul></div>
      )}
      {z.sevkler.length > 0 && (
        <div><strong>Sevkler</strong><ul className="tc-stok-liste">{z.sevkler.map((x) => (
          <li key={x.hareketId}>{zamanMetni(x.zaman)} · {x.lotNo} · {birimliMiktar(x.miktar, x.birim)}{x.emirNo ? ` · ${x.emirNo}` : ''}</li>
        ))}</ul></div>
      )}
    </section>
  );
}

// Alt parti (kol) kartı: bölmeyle doğan kol bu kartın lotuyla kendi kartını alır. Seçimde yalnız bu emrin kolları listelenir.
function AltPartiKartiAc({ r, ac }: { r: RefakatPartisi; ac: (id: number) => void }) {
  const [emir, setEmir] = useState('');
  const komut = useStokKomutu((g: RefakatKolAcGovdesi) => korumaliPost<RefakatPartisiCevabi>(`/stok/refakat-partileri/${r.id}/kol-ac`, g).then((c) => {
    ac(c.refakat.id); return c;
  }), 'Alt parti kartı hazır.');
  const onek = `${r.emirNo ?? ''}/`;
  return (
    <section className="tc-stok-form" aria-label="Alt parti kartı">
      <h3 className="tc-stok-alt-baslik">Alt parti kartı</h3>
      <EmirSecici deger={emir} degistir={setEmir} zorunlu ipucu="Emir bölündüyse alt parti bu kartın lotuyla kendi kartını alır."
        suzgec={(e) => r.emirNo !== null && e.emirNo.startsWith(onek) && !e.emirNo.slice(onek.length).includes('/')} />
      {komut.komut.isError && <p className="tc-stok-bilgi tc-stok-bilgi-uyari" role="alert">{hataMetni(komut.komut.error)}</p>}
      <div><Dugme simge="route" disabled={emir === ''} yukleniyor={komut.komut.isPending} onClick={() => komut.komut.mutate({ uretimEmriId: Number(emir) })}>Alt parti kartı aç</Dugme></div>
    </section>
  );
}

// Lota bağlama (Soru 129, 131 a): depo gerçek lotu ya da eksik malzemenin geldiği refakat kartını okutur; lotsuz düşümler o lottan
// yeniden düşülür. Lot yetmezse yeten kısım bağlanır, kalan bekler.
function LotaBagla({ r, bagladi }: { r: RefakatPartisi; bagladi: (id: number) => void }) {
  const [kod, setKod] = useState('');
  const [sonuc, setSonuc] = useState<RefakatLotaBaglaCevabi | null>(null);
  const komut = useStokKomutu((g: RefakatLotaBaglaGovdesi) => korumaliPost<RefakatLotaBaglaCevabi>(`/stok/refakat-partileri/${r.id}/lota-bagla`, g).then((c) => {
    setSonuc(c); setKod(''); bagladi(c.refakat.id); return c;
  }), 'Lota bağlandı.');
  return (
    <section className="tc-stok-form" aria-label="Lota bağla">
      <h3 className="tc-stok-alt-baslik">Lota bağla</h3>
      <p className="tc-stok-not">Malzeme stokta yokken sayıldı; düşüm lotsuz yapıldı. Gerçek lotu ya da malzemenin geldiği refakat kartını okutun.</p>
      <Girdi etiket="Lot etiketi ya da refakat kartı" value={kod} onChange={(e) => setKod(e.target.value)} />
      {sonuc && Number(sonuc.bekleyen) > 0 && <p className="tc-stok-bilgi tc-stok-bilgi-uyari" role="status">{birimliMiktar(sonuc.baglanan, r.birim)} bağlandı; lotta yetmeyen {birimliMiktar(sonuc.bekleyen, r.birim)} bekliyor.</p>}
      {komut.komut.isError && <p className="tc-stok-bilgi tc-stok-bilgi-uyari" role="alert">{hataMetni(komut.komut.error)}</p>}
      <div><Dugme simge="tag" disabled={kod.trim() === ''} yukleniyor={komut.komut.isPending} onClick={() => komut.komut.mutate({ kod: kod.trim(), surum: r.surum })}>Lota bağla</Dugme></div>
    </section>
  );
}

// Kartı göster, bas; hiç teslimi olmayan kart iptal edilir.
export function RefakatKartPenceresi({ id: ilkId, kapat }: { id: number; kapat: () => void }) {
  const [id, setId] = useState(ilkId);
  const q = useQuery({ queryKey: [...anahtarlar.hepsi, 'refakat-karti', id], queryFn: () => api.get<RefakatPartisiKartiCevabi>(`/stok/refakat-partileri/${id}/kart`) });
  const iptal = useStokKomutu((g: { surum: number }) => api.post<RefakatPartisiCevabi>(`/stok/refakat-partileri/${id}/iptal-et`, g), 'Refakat kartı iptal edildi.', kapat);
  const r = q.data?.refakat;
  const merkez = useIslem('sayfa.etiket-merkezi');
  const depocu = useIslem('stok.transfer');
  const yonlendir = useNavigate();
  return (
    <Pencere acik kapat={kapat} baslik={r ? `Refakat kartı ${r.etiket}` : 'Refakat kartı'} tur="yan"
      alt={<>
        {merkez && r?.durum === 'acik' && r.partiId !== null && (
          <Dugme tur="ikincil" simge="printer" onClick={() => { void yonlendir(`/etiket-merkezi?tur=refakat-partisi&id=${String(id)}`); }}>Etiket Merkezi&apos;nde bas</Dugme>
        )}
        {r && r.durum === 'acik' && Number(r.verilen) === 0 && (
          <Dugme tur="ikincil" simge="x" yukleniyor={iptal.komut.isPending} onClick={() => iptal.komut.mutate({ surum: r.surum })}>Kartı iptal et</Dugme>
        )}
        <Dugme tur="birincil" simge="tag" disabled={!q.data || r?.durum !== 'acik'} onClick={() => q.data && yazdir(refakatPartisiBelgesi(q.data, new Date()))}>Yazdır</Dugme>
      </>}>
      {q.isPending && <DurumKutusu durum="yukleniyor" />}
      {q.isError && <DurumKutusu durum="hata" mesaj={hataMetni(q.error)} yenile={() => void q.refetch()} />}
      {q.data && r && (
        <div className="tc-stok-form">
          <p className="tc-stok-not">Kart 100x150 mm. Teslimde bu kart okutulur; alan da kartı okutup alır. Aynı lotun kalanı bu kartla verilir.</p>
          <div className="tc-stok-is tc-stok-okut-kaynak">
            <div>
              <strong>{r.etiket} · {q.data.kart.urun.ad}</strong>
              <span>{refakatLotSatiri(r)}</span>
              <span>{refakatMalzemeSatiri(r)}</span>
              {r.ust && <span>Üst kart {r.ust.etiket}</span>}
              {r.lotaBaglanmaZamani && <span>İstisna kartıydı; {zamanMetni(r.lotaBaglanmaZamani)} lota bağlandı.</span>}
              {r.birlestigi && <span>{r.birlestigi.etiket} kartına birleşti; okutulunca o kart açılır.</span>}
              {r.durum === 'iptal' && <span>Kart iptal edildi.</span>}
            </div>
          </div>
          {depocu && r.durum === 'acik' && r.birlestigi === null && r.partiId === null && <LotaBagla r={r} bagladi={setId} />}
          {r.durum === 'acik' && r.birlestigi === null && r.partiId !== null && <AltPartiKartiAc r={r} ac={setId} />}
          <RefakatIzi id={r.id} git={setId} />
        </div>
      )}
    </Pencere>
  );
}

// Emre ayır (Soru 116 b): lot okutulmuştur ya Okut sonucunda (`lotKodu`) ya da sepete eklenirken (`sepetSatirId`); emir seçilir.
// Aynı emir ve lotun kartı varsa o açılır; yoksa yeni kart. Sepet satırı karta geçince sepetten çıkar.
export function RefakatAcPenceresi({ kaynak, ad, kapat }: { kaynak: { lotKodu: string } | { sepetSatirId: number }; ad: string; kapat: () => void }) {
  const [emir, setEmir] = useState('');
  const [kart, setKart] = useState<number | null>(null);
  const ac = useStokKomutu((g: RefakatPartisiAcGovdesi) => korumaliPost<RefakatPartisiCevabi>('/stok/refakat-partileri/ac', g).then((c) => {
    setKart(c.refakat.id); return c;
  }), 'Refakat kartı hazır.');
  if (kart !== null) return <RefakatKartPenceresi id={kart} kapat={kapat} />;
  return (
    <Pencere acik kapat={kapat} baslik="Refakat kartına geç" tur="yan"
      alt={<Dugme tur="birincil" simge="tag" disabled={emir === ''} yukleniyor={ac.komut.isPending}
        onClick={() => ac.komut.mutate({ uretimEmriId: Number(emir), ...kaynak })}>Kartı aç</Dugme>}>
      <div className="tc-stok-form">
        <p className="tc-stok-not">{ad}. Lot bu emre bağlanır; bundan sonra malzeme refakat kartıyla teslim edilir.</p>
        <EmirSecici deger={emir} degistir={setEmir} zorunlu />
        {ac.komut.isError && <p className="tc-stok-bilgi tc-stok-bilgi-uyari" role="alert">{hataMetni(ac.komut.error)}</p>}
      </div>
    </Pencere>
  );
}
