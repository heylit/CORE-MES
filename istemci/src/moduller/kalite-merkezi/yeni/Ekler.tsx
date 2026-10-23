import { useRef, useState } from 'react';
import { Girdi, Secim } from '../../../ortak/arayuz/Alan.tsx';
import { useBildirim } from '../../../ortak/arayuz/Bildirim.tsx';
import { Dugme } from '../../../ortak/arayuz/Dugme.tsx';
import { OnayPenceresi } from '../../../ortak/arayuz/OnayPenceresi.tsx';
import { Pencere } from '../../../ortak/arayuz/Pencere.tsx';
import { Simge } from '../../../ortak/arayuz/Simge.tsx';
import { hataIletisi } from '../../../ortak/veri/api.ts';
import { trd } from './bicim.ts';
import { bugun } from './kurallar.ts';
import { BELGE_TUR, KOL_AD } from './sabitler.ts';
import type { BelgeBagi, BelgeKaydi, KmKoleksiyonu } from './tipler.ts';
import { useKmKomutu, yeniDosyaKimligi, type KmKomutu, type KmVerisi } from './veri.ts';
import type { KmYetkisi } from './yetki.ts';

export const DOSYA_SINIRI = 20 * 1024 * 1024;
export const FOTO_KENARI = 1600;
const FOTO = 'Fotoğraf';

export const belgeleri = (veri: Pick<KmVerisi, 'belge'>, kol: string, kimlik: string, balon?: number | string | null): BelgeKaydi[] =>
  veri.belge.filter((x) => x.bagli && x.bagli.col === kol && x.bagli.id === kimlik && (balon === null || balon === undefined || Number(x.bagli.balon) === Number(balon)));

export const resimMi = (b: Pick<BelgeKaydi, 'mime'>): boolean => /^image\//.test(b.mime ?? '');

// Fotoğraf 1600 piksel kenara ve JPEG'e küçültülür; küçültülemezse olduğu gibi gider.
async function kucult(dosya: File): Promise<Blob> {
  if (!/^image\//.test(dosya.type) || dosya.type === 'image/svg+xml') return dosya;
  try {
    const bmp = await createImageBitmap(dosya);
    const k = Math.min(1, FOTO_KENARI / Math.max(bmp.width || 1, bmp.height || 1));
    const tuval = document.createElement('canvas');
    tuval.width = Math.round(bmp.width * k);
    tuval.height = Math.round(bmp.height * k);
    tuval.getContext('2d')?.drawImage(bmp, 0, 0, tuval.width, tuval.height);
    const b = await new Promise<Blob | null>((ok) => tuval.toBlob(ok, 'image/jpeg', 0.82));
    return b ?? dosya;
  } catch {
    return dosya;
  }
}

export interface BelgeBilgisi { tur: string; belgeNo?: string; gecerlilik?: string; duzenleyen?: string; bagli?: BelgeBagi | null; not?: string }

// Uygulamanın addBelge'si: yalnız fotoğraf (JPG/PNG) ya da PDF, en çok 20 MB; içerik dosya deposuna, bilgisi `belge` kaydına.
export async function belgeEkle(komut: KmKomutu, kisi: string, dosya: File, bilgi: BelgeBilgisi): Promise<string> {
  const resim = /^image\//.test(dosya.type);
  const pdf = dosya.type === 'application/pdf' || /\.pdf$/i.test(dosya.name);
  if (!resim && !pdf) throw new Error('Fotoğraf (JPG/PNG) veya PDF yükleyin.');
  const blob = resim ? await kucult(dosya) : dosya;
  if (blob.size > DOSYA_SINIRI) throw new Error('Dosya 20 MB sınırını aşıyor.');
  const assetId = yeniDosyaKimligi();
  await komut.dosyaYukle(assetId, blob);
  const kayit: Partial<BelgeKaydi> = {
    ad: dosya.name || 'fotograf.jpg', assetId, mime: resim ? blob.type || 'image/jpeg' : 'application/pdf', boyut: blob.size, tarih: bugun(), yukleyen: kisi, ...bilgi,
  } as Partial<BelgeKaydi>;
  const { kimlik } = await komut.kaydet('belge', kayit);
  return kimlik;
}

export function BelgeBilgisiPenceresi({ dosya, tur, kapat, kaydet }: { dosya: File; tur?: string; kapat: () => void; kaydet: (b: Omit<BelgeBilgisi, 'bagli'>) => void }) {
  const [b, bYaz] = useState({ tur: tur && tur !== FOTO ? tur : BELGE_TUR[1]!, belgeNo: '', gecerlilik: '', duzenleyen: '' });
  return (
    <Pencere acik kapat={kapat} baslik="Belge bilgisi"
      alt={<><Dugme tur="ikincil" onClick={kapat}>Vazgeç</Dugme><Dugme onClick={() => kaydet({ ...b, belgeNo: b.belgeNo.trim(), duzenleyen: b.duzenleyen.trim() })}>Kaydet</Dugme></>}>
      <p className="tc-km-soluk">{dosya.name}</p>
      <div className="tc-km-alanlar">
        <Secim etiket="Belge türü" value={b.tur} onChange={(o) => bYaz({ ...b, tur: o.target.value })}
          secenekler={BELGE_TUR.filter((x) => x !== FOTO).map((x) => ({ deger: x, baslik: x }))} />
        <Girdi etiket="Belge / sertifika no" value={b.belgeNo} onChange={(o) => bYaz({ ...b, belgeNo: o.target.value })} />
        <Girdi etiket="Geçerlilik sonu (varsa)" type="date" value={b.gecerlilik} onChange={(o) => bYaz({ ...b, gecerlilik: o.target.value })} />
        <Girdi etiket="Düzenleyen (firma / lab)" value={b.duzenleyen} onChange={(o) => bYaz({ ...b, duzenleyen: o.target.value })} />
      </div>
    </Pencere>
  );
}

// Belgeyi görüntüleme: resim yerinde, PDF yeni sekmede açılır; silme onay işlemiyle de (260 a).
export function BelgeGoruntule({ belge, veri, yetki, kapat }: { belge: BelgeKaydi; veri: KmVerisi; yetki: KmYetkisi; kapat: () => void }) {
  const komut = useKmKomutu(yetki.rol);
  const { bildir } = useBildirim();
  const [soruyor, soruyorYaz] = useState(false);
  const adres = belge.assetId ? komut.dosyaAdresi(belge.assetId) : null;
  const bagli = belge.bagli;
  const canli = bagli ? (veri[bagli.col as KmKoleksiyonu] as readonly { _id: string; no?: unknown }[] | undefined)?.find((x) => x._id === bagli.id) : undefined;
  const sil = async () => {
    try {
      await komut.sil('belge', belge._id);
      if (belge.assetId) await komut.dosyaSil(belge.assetId).catch(() => undefined);
      bildir('tamam', 'Kayıt silindi');
      kapat();
    } catch (e) {
      bildir('hata', hataIletisi(e, 'Belge silinemedi.'));
    }
  };
  return (
    <>
      <Pencere acik kapat={kapat} baslik={`${belge.tur ?? ''}${belge.belgeNo ? ` ${belge.belgeNo}` : ''}`} tur="yan"
        alt={(
          <>
            {adres && <a className="tc-km-baglanti" href={adres} download={belge.ad}><Simge ad="download" />İndir</a>}
            {yetki.silebilir('belge') && <Dugme tur="tehlike" simge="trash" onClick={() => soruyorYaz(true)}>Sil</Dugme>}
          </>
        )}>
        <p className="tc-km-soluk">
          {belge.ad} | {trd(belge.tarih)} | {belge.yukleyen ?? ''}{belge.gecerlilik ? ` | geçerlilik ${trd(belge.gecerlilik)}` : ''}
          {bagli ? ` | ${KOL_AD[bagli.col as KmKoleksiyonu] ?? ''} ${String(canli?.no ?? bagli.no ?? '')}${bagli.balon ? ` balon ${bagli.balon}` : ''}` : ''}
        </p>
        {adres && resimMi(belge) && <img className="tc-km-belge-resim" src={adres} alt={belge.ad ?? ''} />}
        {adres && !resimMi(belge) && <a className="tc-km-baglanti" href={adres} target="_blank" rel="noopener"><Simge ad="file" />PDF'i aç</a>}
        {!adres && <p>Dosya bulunamadı.</p>}
      </Pencere>
      <OnayPenceresi acik={soruyor} baslik="Belgeyi sil" tehlikeli onayMetni="Sil" onayla={() => { soruyorYaz(false); void sil(); }} vazgec={() => soruyorYaz(false)}>
        Belge ve dosyası silinir. Bu işlem geri alınamaz.
      </OnayPenceresi>
    </>
  );
}

interface EkOzellikleri {
  veri: KmVerisi;
  yetki: KmYetkisi;
  kol: string;
  kimlik: string;
  no?: string;
  parcaNo?: string;
  tur?: string;
  balon?: number | string | null;
  sadeceFoto?: boolean;
}

// Kayda bağlı fotoğraf ve belgeler (uygulamadaki attachHTML): küçük resimler, fotoğraf çek, belge ekle.
export function Ekler({ veri, yetki, kol, kimlik, no = '', parcaNo = '', tur, balon = null, sadeceFoto = false }: EkOzellikleri) {
  const komut = useKmKomutu(yetki.rol);
  const { bildir } = useBildirim();
  const [bekleyen, bekleyenYaz] = useState<File | null>(null);
  const [acik, acikYaz] = useState<BelgeKaydi | null>(null);
  const foto = useRef<HTMLInputElement>(null);
  const belge = useRef<HTMLInputElement>(null);
  const L = belgeleri(veri, kol, kimlik, balon);
  const bagli: BelgeBagi = { col: kol, id: kimlik, no, ...(parcaNo ? { parcaNo } : {}), ...(balon === null ? {} : { balon }) } as BelgeBagi;

  const yukle = async (dosya: File, bilgi: BelgeBilgisi, ileti: string) => {
    bildir('bilgi', `${ileti} yükleniyor…`);
    try {
      await belgeEkle(komut, veri.kisi, dosya, { ...bilgi, bagli });
      bildir('tamam', `${ileti} eklendi`);
    } catch (e) {
      bildir('hata', hataIletisi(e, e instanceof Error ? e.message : 'Dosya yüklenemedi.'));
    }
  };

  return (
    <div className="tc-km-ekler">
      <p className="tc-km-ekler-baslik"><b>{sadeceFoto ? 'Fotoğraflar' : 'Fotoğraf ve belgeler'}</b>{L.length > 0 && <span className="tc-km-soluk"> {L.length}</span>}</p>
      <div className="tc-km-ekler-izgara">
        {L.map((b) => (
          <button key={b._id} type="button" className="tc-km-ek" title={`${b.tur ?? ''}: ${b.ad ?? ''}`} onClick={() => acikYaz(b)}>
            {resimMi(b) && b.assetId ? <img src={komut.dosyaAdresi(b.assetId)} alt={b.ad ?? ''} /> : <span className="tc-km-ek-pdf">PDF</span>}
            <small>{b.tur === FOTO ? String(b.aciklama ?? trd(b.tarih)) : b.tur}</small>
          </button>
        ))}
        {yetki.yaz && (
          <>
            <Dugme tur="ikincil" simge="camera" onClick={() => foto.current?.click()}>Fotoğraf çek</Dugme>
            {!sadeceFoto && <Dugme tur="ikincil" simge="upload" onClick={() => belge.current?.click()}>Belge ekle</Dugme>}
          </>
        )}
        <input ref={foto} type="file" accept="image/*" capture="environment" hidden aria-label="Fotoğraf"
          onChange={(o) => { const f = o.target.files?.[0]; o.target.value = ''; if (f) void yukle(f, { tur: FOTO }, 'Fotoğraf'); }} />
        <input ref={belge} type="file" accept="application/pdf,image/*" hidden aria-label="Belge"
          onChange={(o) => { const f = o.target.files?.[0]; o.target.value = ''; if (f) bekleyenYaz(f); }} />
      </div>
      {bekleyen && (
        <BelgeBilgisiPenceresi dosya={bekleyen} tur={tur} kapat={() => bekleyenYaz(null)}
          kaydet={(b) => { const f = bekleyen; bekleyenYaz(null); void yukle(f, b, 'Belge'); }} />
      )}
      {acik && <BelgeGoruntule belge={acik} veri={veri} yetki={yetki} kapat={() => acikYaz(null)} />}
    </div>
  );
}
