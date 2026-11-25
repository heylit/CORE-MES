import { DurumKutusu } from '../../../../ortak/arayuz/index.ts';
import { kabulArdindan, kabulGirisYeri, kabulHesabi, useKabulTuru } from './kabul-adimi.ts';
import type { PanelOzellikleri } from './IstasyonPanelleri.tsx';

// 3703: mal kabul modundaki depo adımının sağ paneli. Toplama listesi yerine Stok'a ne yazılacağını söyler; kayıt Bitir'in açtığı
// "Kabulü yaz" penceresinde yazılır (operator/KabulYazma.tsx). Ürün ve adet paketten gelir; raf bilinmiyorsa boş kalır.
export function KabulAdimPaneli({ api }: PanelOzellikleri) {
  const { is, paket, kayit } = api;
  const k = useKabulTuru(is.no, paket?.tmi?.fasonDonusu);
  const h = kabulHesabi(is.good, kayit.kabulYazilan ?? 0, is.target);
  if (k.yukleniyor) return <DurumKutusu durum="yukleniyor" />;
  if (k.hata) return <DurumKutusu durum="hata" mesaj={k.hata} />;
  if (k.tur === null) return <p className="tc-ay2-soluk" role="status">Mal kabul için stok girişi yetkisi gerekir.</p>;
  const fason = k.tur === 'fason';
  const alanlar: [string, string][] = [
    ['Kayıt', fason ? 'Mal kabul belgesi · fason dönüşü' : 'Stok kaydı yok; yalnız sayılır'],
    ['Ürün', [paket.partNo, paket.part].filter(Boolean).join(' · ') || '—'],
    ['Kabul edilecek', `${String(h.yazilacak)} adet`],
    ['Hedefe kalan', `${String(h.kalan)} adet`],
    ...(fason && k.fason ? [['Firma', `${k.fason.satir.tedarikciAdi} · ${k.fason.satir.siparisNo || k.fason.satir.talepNo}`] as [string, string]] : []),
    ['Giriş yeri', kabulGirisYeri(k.tur)],
    ['Ardından', kabulArdindan(k.tur)],
  ];
  return (
    <div className="tc-ay2-panel tc-ay2-kabul">
      <span className="tc-ay2-ust-yazi">Stok'a yazılacak</span>
      <dl className="tc-ay1-depo-bilgi">{alanlar.map(([e, d]) => <div key={e}><dt>{e}</dt><dd>{d}</dd></div>)}</dl>
      {fason ? <p className="tc-ay2-soluk">Uygunsuzluk kararı GKK'nındır; terminalde ret yoktur.</p> : <p className="tc-ay2-soluk">Ara stok Stok'a yazılmaz; sayım yalnız adımı ilerletir.</p>}
    </div>
  );
}
