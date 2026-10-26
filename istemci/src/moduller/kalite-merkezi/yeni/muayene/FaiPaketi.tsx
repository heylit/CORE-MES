import { useEffect, useState } from 'react';
import { DurumKutusu } from '../../../../ortak/arayuz/index.ts';
import { trd, YOK } from '../bicim.ts';
import { parcaAnahtari } from '../kurallar.ts';
import { FAI_CHK, KOL_AD } from '../sabitler.ts';
import type { BelgeBagi, BelgeKaydi, KmKoleksiyonu, Muayene, Resim } from '../tipler.ts';
import type { KmKomutu, KmVerisi } from '../veri.ts';
import { olculen, toleransMetni } from './MuayeneBelgesi.tsx';
import { pdfSayfalari } from './pdf.ts';
import './fai-paketi.css';

// AS9102 ilk parça muayene paketi: kapak, Form 1-2-3, balonlu resim, fotoğraflar ve ek belge sayfaları.
// Ek belge ve resim dosyaları bu cihazda okunur; PDF sayfaları resme çevrilir.

interface Balon { n?: number; p?: number; ax?: number; ay?: number; bx?: number; by?: number; sinif?: string }
type BalonluResim = Resim & { kaynakModel?: string; bagli?: string; assetId?: string; cizimNo?: string };

export interface FaiIcerigi {
  muayene: Muayene;
  belgeler: BelgeKaydi[];
  fotograflar: BelgeKaydi[];
  ncrNo: string[];
  resim?: BalonluResim;
}

// Pakete giren kayıtlar: muayeneye, parçaya, aynı parçanın (ve lotun) lot kabul kayıtlarına ve siparişe bağlı belgeler.
export function faiIcerigi(veri: KmVerisi, i: Muayene): FaiIcerigi {
  const cizimler = veri.cizim as readonly BalonluResim[];
  const d = i.cizimId ? cizimler.find((x) => x._id === i.cizimId) : undefined;
  let resim = d;
  if (d && d.dosyaTip === 'step') {
    const img = cizimler.find((x) => x.kaynakModel === d._id || (x._id === d.bagli && x.dosyaTip !== 'step'));
    if (img) resim = img;
  }
  const emir = i.emir ? veri.emir.find((e) => e.no === i.emir) : undefined;
  const pk = parcaAnahtari(i.parcaNo);
  const lotlar = veri.lot.filter((l) => parcaAnahtari(l.parcaNo) === pk && (!i.lot || l.lotNo === i.lot)).map((l) => l._id);
  const belgeler = veri.belge.filter((b) => b.tur !== 'Fotoğraf' && b.bagli && (
    (b.bagli.col === 'insp' && b.bagli.id === i._id)
    || (b.bagli.col === 'parca' && parcaAnahtari((b.bagli as BelgeBagi & { parcaNo?: string }).parcaNo || b.bagli.no) === pk)
    || (b.bagli.col === 'lot' && lotlar.includes(b.bagli.id ?? ''))
    || (!!emir && b.bagli.col === 'emir' && (b.bagli.id === emir._id || !!emir.eskiKimlikler?.includes(b.bagli.id)))));
  const fotograflar = veri.belge.filter((b) => b.tur === 'Fotoğraf' && b.bagli?.col === 'insp' && b.bagli.id === i._id);
  const ncrNo = veri.ncr.filter((n) => (n.tanim ?? '').includes(i.no ?? '\u0000')).map((n) => n.no ?? '');
  return { muayene: i, belgeler, fotograflar, ncrNo, resim };
}

const tokenRengi = (ad: string) => getComputedStyle(document.documentElement).getPropertyValue(ad).trim() || 'black';

// Balonlar resmin ilk sayfasına çizilir (renk sınıfa göre: kritik, minör, diğerleri).
async function balonluResim(r: BalonluResim, adres: string): Promise<string | null> {
  if (r.dosyaTip === 'step') return null;
  const blob = await (await fetch(adres)).blob();
  let c: HTMLCanvasElement;
  let W: number;
  if (r.dosyaTip === 'pdf') {
    const p = await pdfSayfalari(blob, 1, 2000);
    if (!p.tuvaller[0]) return null;
    c = p.tuvaller[0];
    W = p.en;
  } else {
    const u = URL.createObjectURL(blob);
    try {
      const im = await new Promise<HTMLImageElement>((ok, red) => { const i = new Image(); i.onload = () => { ok(i); }; i.onerror = red; i.src = u; });
      W = im.naturalWidth;
      const k = Math.min(1, 2400 / W);
      c = document.createElement('canvas');
      c.width = Math.round(W * k);
      c.height = Math.round(im.naturalHeight * k);
      c.getContext('2d')?.drawImage(im, 0, 0, c.width, c.height);
    } finally {
      URL.revokeObjectURL(u);
    }
  }
  const ctx = c.getContext('2d');
  if (!ctx) return null;
  const k = c.width / W;
  const yr = Math.max(7, W / 150) * k;
  const renk = { Kritik: tokenRengi('--stop'), Minör: tokenRengi('--done'), diger: tokenRengi('--run') };
  for (const b of ((r.balonlar ?? []) as Balon[]).filter((x) => (x.p || 1) === 1)) {
    const col = b.sinif === 'Kritik' ? renk.Kritik : b.sinif === 'Minör' ? renk.Minör : renk.diger;
    const [ax, ay, bx, by] = [b.ax ?? 0, b.ay ?? 0, b.bx ?? 0, b.by ?? 0].map((v) => v * k) as [number, number, number, number];
    ctx.strokeStyle = col;
    ctx.lineWidth = Math.max(1, k);
    ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
    ctx.fillStyle = 'white';
    ctx.beginPath(); ctx.arc(bx, by, yr, 0, 7); ctx.fill();
    ctx.lineWidth = Math.max(1.5, 1.4 * k); ctx.stroke();
    ctx.fillStyle = col;
    ctx.font = `bold ${yr * 1.1}px Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(b.n ?? ''), bx, by);
  }
  return c.toDataURL('image/jpeg', 0.85);
}

interface Ek { b: BelgeKaydi; src: string[] }

async function ekleriHazirla(icerik: FaiIcerigi, adres: (k: string) => string): Promise<{ resim: string | null; ekler: Ek[]; fotolar: { p: BelgeKaydi; u: string }[] }> {
  let resim: string | null = null;
  try { resim = icerik.resim?.assetId ? await balonluResim(icerik.resim, adres(icerik.resim.assetId)) : null; } catch { resim = null; }
  const ekler: Ek[] = [];
  for (const b of icerik.belgeler.slice(0, 12)) {
    if (!b.assetId) continue;
    try {
      if (/^image\//.test(b.mime ?? '')) ekler.push({ b, src: [adres(b.assetId)] });
      else ekler.push({ b, src: (await pdfSayfalari(await (await fetch(adres(b.assetId))).blob(), 6, 1300)).resimler });
    } catch { /* okunamayan ek pakete girmez; Form 2 listesinde kalır */ }
  }
  const fotolar = icerik.fotograflar.slice(0, 24).filter((p) => p.assetId).map((p) => ({ p, u: adres(p.assetId!) }));
  return { resim, ekler, fotolar };
}

function Baslik({ firma, no, ad, alt }: { firma?: string; no?: string; ad: string; alt?: string }) {
  return (
    <div className="km-fp-h">
      <div><b>{firma}</b><span>AS9102 İlk Parça Muayenesi</span></div>
      <div className="km-fp-t">{ad}</div>
      <div><span>FAI no</span><b>{no}</b><span>{alt}</span></div>
    </div>
  );
}

function Imzalar({ i }: { i: Muayene }) {
  return (
    <table className="km-fp-imza">
      <tbody>
        <tr><th>Muayene eden</th><th>Kalite onayı</th><th>Müşteri onayı (gerekirse)</th></tr>
        <tr><td>{i.muayeneci}<br /><small>{trd(i.tarih)}</small></td><td /><td /></tr>
      </tbody>
    </table>
  );
}

export function FaiPaketi({ veri, icerik, komut }: { veri: KmVerisi; icerik: FaiIcerigi; komut: KmKomutu }) {
  const [hazir, hazirYaz] = useState<Awaited<ReturnType<typeof ekleriHazirla>> | null>(null);
  const [hata, hataYaz] = useState(false);
  useEffect(() => {
    let canli = true;
    ekleriHazirla(icerik, komut.dosyaAdresi).then((h) => { if (canli) hazirYaz(h); }, () => { if (canli) hataYaz(true); });
    return () => { canli = false; };
  }, [icerik, komut]);
  if (hata) return <DurumKutusu durum="hata" mesaj="FAI paketi hazırlanamadı." />;
  if (!hazir) return <DurumKutusu durum="yukleniyor" mesaj="FAI paketi hazırlanıyor…" />;
  const i = icerik.muayene;
  const g = veri.ayarlar;
  const sup = i.tedarikci ? veri.sup.find((s) => s._id === i.tedarikci) : undefined;
  const emir = i.emir ? veri.emir.find((e) => e.no === i.emir) : undefined;
  const dw = icerik.resim;
  const ch = i.chars ?? [];
  const ok = ch.filter((c) => c.sonuc === 'OK').length;
  const nok = ch.filter((c) => c.sonuc === 'NOK').length;
  const kapsam = i.faiKapsam || 'Tam FAI';
  const hd = (ad: string, alt?: string) => <Baslik firma={g.firma} no={i.no} ad={ad} alt={alt} />;
  return (
    <div className="km-fp">
      <section className="km-fp-pg">
        {hd('Kapak')}
        <h1 className="km-fp-buyuk">İlk Parça Muayene Paketi</h1>
        <table>
          <tbody>
            <tr><th>Parça no / adı</th><td>{`${i.parcaNo ?? ''} ${i.parcaAdi ?? ''}`}</td></tr>
            <tr><th>Revizyon</th><td>{i.rev}</td></tr>
            <tr><th>Lot / seri</th><td>{i.lot}</td></tr>
            <tr><th>Sipariş / iş emri</th><td>{`${i.emir ?? ''}${emir?.musteri ? ` (${emir.musteri})` : ''}`}</td></tr>
            <tr><th>FAI nedeni / kapsam</th><td>{`${i.faiNeden ?? ''} / ${kapsam}`}</td></tr>
            <tr><th>Tedarikçi</th><td>{sup ? sup.ad : 'İç üretim'}</td></tr>
            <tr><th>Sonuç</th><td><b>{i.sonuc}</b>{` | ${ch.length} karakteristik: ${ok} uygun, ${nok} uygun değil`}</td></tr>
            <tr>
              <th>İçerik</th>
              <td>{`Form 1, Form 2, Form 3${hazir.resim ? ', balonlu resim' : ''}${hazir.fotolar.length ? `, ${hazir.fotolar.length} fotoğraf` : ''}${hazir.ekler.length ? `, ${hazir.ekler.length} ek belge` : ''}`}</td>
            </tr>
          </tbody>
        </table>
        <Imzalar i={i} />
      </section>
      <section className="km-fp-pg">
        {hd('Form 1', 'Parça numarası izlenebilirliği')}
        <table>
          <tbody>
            <tr><th>1. Parça numarası</th><td>{i.parcaNo}</td><th>2. Parça adı</th><td>{i.parcaAdi}</td></tr>
            <tr><th>3. Seri numarası</th><td>{i.lot}</td><th>4. FAI rapor no</th><td>{i.no}</td></tr>
            <tr><th>5. Parça revizyonu</th><td>{i.rev}</td><th>6. Resim numarası</th><td>{dw?.cizimNo}</td></tr>
            <tr><th>7. Resim revizyonu</th><td>{dw?.rev || i.rev}</td><th>8. Ek değişiklikler</th><td /></tr>
            <tr><th>9. Üretim süreci referansı</th><td /><th>10. Kuruluş adı</th><td>{g.firma}</td></tr>
            <tr><th>11. Tedarikçi kodu</th><td>{sup?.kod}</td><th>12. Satınalma siparişi</th><td>{i.emir}</td></tr>
            <tr><th>13. Detay / montaj</th><td>Detay</td><th>14. FAI kapsamı</th><td>{kapsam}</td></tr>
            <tr><th>FAI nedeni</th><td colSpan={3}>{i.faiNeden}</td></tr>
          </tbody>
        </table>
        <h3>AS9102 kontrolleri</h3>
        <table><tbody>{FAI_CHK.map((x) => <tr key={x}><td>{x}</td><td className="km-fp-dar">{(i.fchk ?? []).includes(x) ? 'Evet' : 'Hayır'}</td></tr>)}</tbody></table>
        <Imzalar i={i} />
      </section>
      <section className="km-fp-pg">
        {hd('Form 2', 'Ürün hesabı: malzeme, özel proses, fonksiyonel test')}
        <table>
          <thead><tr><th>#</th><th>Tür</th><th>Belge / sertifika no</th><th>Düzenleyen</th><th>Geçerlilik</th><th>Bağlı kayıt</th></tr></thead>
          <tbody>
            {icerik.belgeler.length ? icerik.belgeler.map((b, ix) => (
              <tr key={b._id}>
                <td>{ix + 1}</td><td>{b.tur}</td><td>{b.belgeNo || b.ad}</td><td>{String(b.duzenleyen ?? '')}</td><td>{trd(b.gecerlilik)}</td>
                <td>{`${KOL_AD[(b.bagli?.col ?? '') as KmKoleksiyonu] ?? ''} ${b.bagli?.no ?? ''}`}</td>
              </tr>
            )) : (
              <tr><td colSpan={6}>Bu parça, lot veya siparişe bağlı sertifika yok. Belgeleri "Belgeler ve sertifikalar" bölümünden ya da lot kaydından ekleyin.</td></tr>
            )}
          </tbody>
        </table>
        <Imzalar i={i} />
      </section>
      <section className="km-fp-pg">
        {hd('Form 3', 'Karakteristik hesabı')}
        <table>
          <thead><tr><th>Balon</th><th>Karakteristik / gereksinim</th><th>Nominal</th><th>Tolerans</th><th>Ölçülen</th><th>Yöntem</th><th>Cihaz</th><th>Uygun</th></tr></thead>
          <tbody>
            {ch.map((c, ix) => {
              const dv = c.cihaz ? veri.dev.find((x) => x._id === c.cihaz) : undefined;
              return (
                <tr key={`${ix}-${c.ad ?? ''}`} className={c.sonuc === 'NOK' ? 'km-fp-nok' : undefined}>
                  <td>{String(c.balon || ix + 1)}</td><td>{c.ad}</td><td>{c.tip === 'Nitel' ? 'Nitel' : c.nominal}</td><td>{toleransMetni(c)}</td>
                  <td>{olculen(c)}</td><td>{String(c.kanal ?? '')}</td><td>{dv ? dv.kod : YOK}</td><td>{c.sonuc === 'OK' ? 'Evet' : c.sonuc === 'NOK' ? <b>Hayır</b> : YOK}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {icerik.ncrNo.length > 0 && <p><b>İlgili uygunsuzluklar:</b> {icerik.ncrNo.join(', ')}</p>}
        <Imzalar i={i} />
      </section>
      {hazir.resim && dw && (
        <section className="km-fp-pg km-fp-yatay">
          {hd('Balonlu resim', `${dw.parcaNo ?? ''} rev ${dw.rev ?? ''}`)}
          <img className="km-fp-resim" src={hazir.resim} alt="Balonlu resim" />
        </section>
      )}
      {hazir.fotolar.length > 0 && (
        <section className="km-fp-pg">
          {hd('Fotoğraflar')}
          <div className="km-fp-foto">
            {hazir.fotolar.map((x) => (
              <figure key={x.p._id}>
                <img src={x.u} alt="" />
                <figcaption>{`${x.p.bagli?.balon ? `Balon ${x.p.bagli.balon} | ` : ''}${trd(x.p.tarih)} ${x.p.yukleyen ?? ''}`}</figcaption>
              </figure>
            ))}
          </div>
        </section>
      )}
      {hazir.ekler.flatMap((c) => c.src.map((s, pi) => (
        <section key={`${c.b._id}-${pi}`} className="km-fp-pg">
          {hd(`Ek: ${c.b.tur ?? ''}`, `${c.b.belgeNo || c.b.ad || ''}${c.src.length > 1 ? ` (${pi + 1}/${c.src.length})` : ''}`)}
          <img className="km-fp-resim" src={s} alt="" />
        </section>
      )))}
    </div>
  );
}
