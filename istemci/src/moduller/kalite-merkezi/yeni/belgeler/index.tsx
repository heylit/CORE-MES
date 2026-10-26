import { useEffect, useMemo, useRef, useState } from 'react';
import { IsaretKutusu, Secim } from '../../../../ortak/arayuz/Alan.tsx';
import { useBildirim } from '../../../../ortak/arayuz/Bildirim.tsx';
import { Dugme } from '../../../../ortak/arayuz/Dugme.tsx';
import { Pencere } from '../../../../ortak/arayuz/Pencere.tsx';
import { Rozet } from '../../../../ortak/arayuz/Rozet.tsx';
import { SayfaBasligi } from '../../../../ortak/arayuz/SayfaBasligi.tsx';
import type { Sutun } from '../../../../ortak/arayuz/Tablo.tsx';
import { hataIletisi } from '../../../../ortak/veri/api.ts';
import { trd, YOK } from '../bicim.ts';
import { belgeEkle, BelgeBilgisiPenceresi, BelgeGoruntule, type BelgeBilgisi } from '../Ekler.tsx';
import { KayitListesi } from '../KayitListesi.tsx';
import { gunKaldi, izNo, parcaDizini } from '../kurallar.ts';
import { BELGE_TUR, KOL_AD } from '../sabitler.ts';
import type { EkranOzellikleri, KmSayaci } from '../sekmeler.ts';
import type { BelgeBagi, BelgeKaydi, KmKoleksiyonu } from '../tipler.ts';
import { useKmKomutu, type KmVerisi } from '../veri.ts';
import '../gostergeler/k4.css';

// Belge bağlanabilen kayıtlar (uygulamanın newBelge seçenekleri): parça, lot, cihaz, tedarikçi, iş emri.
export function baglanacaklar(v: KmVerisi): { bagi: BelgeBagi; baslik: string }[] {
  return [
    ...parcaDizini(v).map((p) => ({ bagi: { col: 'parca', id: `p-${p.k}`, no: p.no, parcaNo: p.no }, baslik: `Parça ${p.no} ${p.ad || ''}`.trim() })),
    ...v.lot.filter((l) => l.tip !== 'reset').map((l) => ({ bagi: { col: 'lot', id: l._id, no: l.no ?? '', parcaNo: l.parcaNo ?? '' }, baslik: `Lot ${l.no ?? ''} ${l.parcaNo ?? ''}` })),
    ...v.dev.map((d) => ({ bagi: { col: 'dev', id: d._id, no: d.kod ?? '', parcaNo: '' }, baslik: `Cihaz ${d.kod ?? ''} ${d.ad ?? ''}` })),
    ...v.sup.map((s) => ({ bagi: { col: 'sup', id: s._id, no: s.kod || s.ad || '', parcaNo: '' }, baslik: `Tedarikçi ${s.ad ?? ''}` })),
    ...v.emir.map((e) => ({ bagi: { col: 'emir', id: e._id, no: e.no ?? '', parcaNo: e.parcaNo ?? '' }, baslik: `${e.tip ?? ''} ${e.no ?? ''}` })),
  ];
}

const varsayilanTur = (col: string): string => (col === 'dev' ? 'Kalibrasyon sertifikası' : col === 'sup' ? 'Tedarikçi sistem sertifikası' : 'Malzeme sertifikası');

function BagliKayit({ veri, b }: { veri: KmVerisi; b: BelgeKaydi }) {
  const g = b.bagli;
  if (!g) return <>{YOK}</>;
  // İş emri bağı sahibindeki satırın ya da onunla eşleşen eski kendi kaydının kimliğidir (592 B1 c).
  const canli = g.col === 'emir'
    ? veri.emir.find((x) => x._id === g.id || x.eskiKimlikler?.includes(g.id)) ?? veri.eskiEmir?.find((x) => x._id === g.id)
    : (veri[g.col as KmKoleksiyonu] as readonly Record<string, unknown>[] | undefined)?.find((x) => x._id === g.id);
  return (
    <>
      {KOL_AD[g.col as KmKoleksiyonu] ?? g.col} {(canli && izNo(canli)) || g.no || ''}
      {g.parcaNo && <span className="tc-km-soluk"> {g.parcaNo}</span>}
      {!canli && g.col !== 'parca' && <span className="tc-km4-kotu"> (kayıt yok)</span>}
    </>
  );
}

function BagSecimi({ secenekler, kapat, sec }: { secenekler: { bagi: BelgeBagi; baslik: string }[]; kapat: () => void; sec: (b: BelgeBagi) => void }) {
  const [i, iYaz] = useState('0');
  return (
    <Pencere acik kapat={kapat} baslik="Belge nereye bağlanacak?"
      alt={<><Dugme tur="ikincil" onClick={kapat}>Vazgeç</Dugme><Dugme onClick={() => { const s = secenekler[Number(i)]; if (s) sec(s.bagi); }}>Devam</Dugme></>}>
      <Secim etiket="Kayıt" value={i} onChange={(o) => iYaz(o.target.value)} secenekler={secenekler.map((s, n) => ({ deger: String(n), baslik: s.baslik }))} />
    </Pencere>
  );
}

export function Belgeler({ veri, yetki, gecis, gecisTamam }: EkranOzellikleri) {
  const komut = useKmKomutu(yetki.rol);
  const { bildir } = useBildirim();
  const dosyaGirdisi = useRef<HTMLInputElement>(null);
  const [acik, acikYaz] = useState<BelgeKaydi | null>(null);
  const [dosya, dosyaYaz] = useState<File | null>(null);
  const [bag, bagYaz] = useState<BelgeBagi | null>(null);
  const [hazirBag, hazirBagYaz] = useState<{ bagi: BelgeBagi; tur?: string } | null>(null);
  const [yakin, yakinYaz] = useState(false);
  const secenekler = useMemo(() => baglanacaklar(veri), [veri]);

  useEffect(() => {
    if (!gecis) return;
    if (gecis.ac === 'yeni' && yetki.yaz) {
      const on = (gecis.on ?? {}) as { tur?: string; bagli?: BelgeBagi };
      hazirBagYaz(on.bagli ? { bagi: on.bagli, ...(on.tur ? { tur: on.tur } : {}) } : null);
      dosyaGirdisi.current?.click();
    } else if (gecis.ac) {
      const b = veri.belge.find((x) => x._id === gecis.ac);
      if (b) acikYaz(b);
    }
    gecisTamam();
  }, [gecis, gecisTamam, veri.belge, yetki.yaz]);

  const yukle = () => {
    if (!secenekler.length) {
      bildir('hata', 'Önce bir parça, lot, cihaz veya tedarikçi kaydı olmalı.');
      return;
    }
    hazirBagYaz(null);
    dosyaGirdisi.current?.click();
  };
  const dosyaSecildi = (f: File) => {
    dosyaYaz(f);
    if (hazirBag) bagYaz(hazirBag.bagi);
  };
  const bitir = () => { dosyaYaz(null); bagYaz(null); hazirBagYaz(null); };
  const kaydet = async (f: File, bagi: BelgeBagi, b: Omit<BelgeBilgisi, 'bagli'>) => {
    bitir();
    bildir('bilgi', 'Belge yükleniyor…');
    try {
      await belgeEkle(komut, veri.kisi, f, { ...b, bagli: bagi });
      bildir('tamam', 'Belge eklendi');
    } catch (e) {
      bildir('hata', hataIletisi(e, e instanceof Error ? e.message : 'Belge yüklenemedi.'));
    }
  };

  const satirlar = useMemo(() => {
    const L = [...veri.belge].sort((a, b) => (b.tarih ?? '').localeCompare(a.tarih ?? ''));
    return yakin ? L.filter((x) => x.gecerlilik && (gunKaldi(x.gecerlilik) ?? 0) <= 30) : L;
  }, [veri.belge, yakin]);

  const sutunlar: Sutun<BelgeKaydi>[] = [
    { anahtar: 'belgeNo', baslik: 'Belge', hucre: (b) => <><b>{b.belgeNo || b.ad}</b><span className="tc-km-iki">{b.ad}</span></>, csv: (b) => b.belgeNo || b.ad || '' },
    { anahtar: 'tur', baslik: 'Tür', hucre: (b) => b.tur ?? '' },
    { anahtar: 'bagli', baslik: 'Bağlı olduğu kayıt', hucre: (b) => <BagliKayit veri={veri} b={b} />, csv: (b) => `${b.bagli?.col ?? ''} ${b.bagli?.no ?? ''}` },
    {
      anahtar: 'gecerlilik', baslik: 'Geçerlilik', kirilmaz: true, csv: (b) => b.gecerlilik ?? '',
      hucre: (b) => {
        if (!b.gecerlilik) return YOK;
        const k = gunKaldi(b.gecerlilik) ?? 0;
        return <>{trd(b.gecerlilik)}{k < 0 ? <span className="tc-km4-kotu"> süresi doldu</span> : k <= 30 ? <> <Rozet ton="uyari">{`${k} gün`}</Rozet></> : null}</>;
      },
    },
    { anahtar: 'yukleyen', baslik: 'Yükleyen', hucre: (b) => <>{b.yukleyen ?? ''}<span className="tc-km-iki">{trd(b.tarih)}</span></>, csv: (b) => b.yukleyen ?? '' },
  ];
  const canliAcik = acik ? veri.belge.find((b) => b._id === acik._id) : undefined;

  return (
    <div className="tc-km4">
      <SayfaBasligi
        baslik="Belgeler ve sertifikalar"
        simge="file"
        alt="Malzeme ve uygunluk sertifikaları, kalibrasyon sertifikaları, test raporları ve fotoğraflar. Her belge bir lota, parçaya, cihaza, tedarikçiye ya da kayda bağlıdır."
        {...(yetki.yaz ? { birincil: { etiket: 'Belge yükle', simge: 'upload', yap: yukle } } : {})}
      />
      <KayitListesi<BelgeKaydi>
        etiket="Belgeler"
        satirlar={satirlar}
        sutunlar={sutunlar}
        ara={(x) => [x.ad, x.belgeNo, x.tur, x.duzenleyen, x.bagli?.no, x.bagli?.parcaNo].join(' ')}
        aramaYeri="Belge no, parça, lot, düzenleyen ara"
        suzgec={{ etiket: 'Tür', ilk: '', secenekler: [{ deger: '', baslik: 'Tüm türler' }, ...BELGE_TUR.map((t) => ({ deger: t, baslik: t }))], uyar: (b, t) => b.tur === t }}
        sag={<IsaretKutusu etiket="Süresi dolan / 30 gün içinde" checked={yakin} onChange={(o) => yakinYaz(o.target.checked)} />}
        ac={(b) => acikYaz(b)}
        bos="Henüz belge yok. Belgeleri ilgili kaydın içinden (lot, muayene, NCR, cihaz, parça) ya da buradan yükleyebilirsiniz."
      />
      <input ref={dosyaGirdisi} type="file" accept="application/pdf,image/*" hidden aria-label="Yüklenecek belge"
        onChange={(o) => { const f = o.target.files?.[0]; o.target.value = ''; if (f) dosyaSecildi(f); }} />
      {dosya && !bag && <BagSecimi secenekler={secenekler} kapat={bitir} sec={bagYaz} />}
      {dosya && bag && (
        <BelgeBilgisiPenceresi dosya={dosya} tur={hazirBag?.tur ?? varsayilanTur(bag.col)} kapat={bitir} kaydet={(b) => void kaydet(dosya, bag, b)} />
      )}
      {canliAcik && <BelgeGoruntule belge={canliAcik} veri={veri} yetki={yetki} kapat={() => acikYaz(null)} />}
    </div>
  );
}

export const BelgelerSayaci: KmSayaci = null;
