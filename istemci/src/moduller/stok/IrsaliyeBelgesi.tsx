import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { IrsaliyeBelgeleriCevabi, IrsaliyeBelgesi, IrsaliyeEkleGovdesi } from '#paylasilan/sozlesme/stok-irsaliye.ts';
import { Dugme, DurumKutusu, Kart, OnayPenceresi, Simge, useBildirim } from '../../ortak/arayuz/index.ts';
import { api } from '../../ortak/veri/api.ts';
import { DosyaHatasi, dosyaYukle } from '../belge-merkezi/disari.ts';
import { anahtarlar } from './anahtarlar.ts';
import { irsaliyePdfi, sayfaReddi } from './irsaliye-pdf.ts';
import { hataMetni, korumaliPost, useIslem } from './ortak.tsx';

// 3063: mal kabulün irsaliye belgesi. Fotoğraf ve dosyalar istemcide tek PDF olur (irsaliye-pdf.ts), `/dosyalar` ile yüklenir ve
// mal kabule eklenir; belge Çizim ve Dosya Merkezi'nde "İrsaliyeler" altında da durur. Kaldırılan belge orada arşive alınır.

const KABUL = 'image/*,application/pdf,.pdf,.png,.jpg,.jpeg,.webp';
let sayac = 0;
export interface IrsaliyeSayfasi { anahtar: number; dosya: File; resim: string | null }

export function irsaliyeAdresi(malKabulId: number, belgeId: number): string {
  return `/api/stok/mal-kabuller/${malKabulId}/irsaliyeler/${belgeId}`;
}

// Sayfaları PDF yapar, yükler ve mal kabule ekler. Mal kabul komutundan sonra ayrı çağrılır: mal kabul kaydı bundan etkilenmez.
export async function irsaliyeEkle(malKabulId: number, sayfalar: readonly IrsaliyeSayfasi[], ilerleme: (oran: number) => void): Promise<IrsaliyeBelgeleriCevabi> {
  const pdf = await irsaliyePdfi(sayfalar.map((s) => s.dosya));
  const ozet = await dosyaYukle(pdf, ilerleme);
  const govde: IrsaliyeEkleGovdesi = { ozet, dosyaAdi: 'irsaliye.pdf' };
  return korumaliPost<IrsaliyeBelgeleriCevabi>(`/stok/mal-kabuller/${malKabulId}/irsaliye-ekle`, govde);
}

// Fotoğraf çek ve Dosya seç aynı düzeyde ikincildir; formun birincil düğmesi çağıranındır (Arayüz notu, 3063).
export function IrsaliyeSecici({ sayfalar, degistir, kilitli = false }: { sayfalar: IrsaliyeSayfasi[]; degistir: (s: IrsaliyeSayfasi[]) => void; kilitli?: boolean }) {
  const kamera = useRef<HTMLInputElement>(null);
  const dosya = useRef<HTMLInputElement>(null);
  const [hata, setHata] = useState<string | null>(null);
  useEffect(() => () => { for (const s of sayfalar) if (s.resim) URL.revokeObjectURL(s.resim); }, []);
  const ekle = (liste: FileList | null) => {
    setHata(null);
    const yeni: IrsaliyeSayfasi[] = [];
    for (const f of Array.from(liste ?? [])) {
      const red = sayfaReddi(f, sayfalar.length + yeni.length);
      if (red) { setHata(red); break; }
      yeni.push({ anahtar: ++sayac, dosya: f, resim: f.type.startsWith('image/') ? URL.createObjectURL(f) : null });
    }
    if (yeni.length) degistir([...sayfalar, ...yeni]);
  };
  const cikar = (a: number) => {
    const s = sayfalar.find((x) => x.anahtar === a);
    if (s?.resim) URL.revokeObjectURL(s.resim);
    degistir(sayfalar.filter((x) => x.anahtar !== a));
  };
  return (
    <div className="tc-stok-irsaliye" role="group" aria-label="İrsaliye belgesi">
      <div className="tc-stok-irsaliye-ust">
        <span className="tc-stok-irsaliye-baslik">İrsaliye belgesi</span>
        <Dugme tur="ikincil" simge="camera" disabled={kilitli} onClick={() => kamera.current?.click()}>Fotoğraf çek</Dugme>
        <Dugme tur="ikincil" simge="upload" disabled={kilitli} onClick={() => dosya.current?.click()}>Dosya seç</Dugme>
      </div>
      <input ref={kamera} hidden type="file" accept="image/*" capture="environment" aria-label="Fotoğraf çek" onChange={(e) => { ekle(e.target.files); e.target.value = ''; }} />
      <input ref={dosya} hidden type="file" accept={KABUL} multiple aria-label="Dosya seç" onChange={(e) => { ekle(e.target.files); e.target.value = ''; }} />
      {sayfalar.length > 0 ? (
        <ol className="tc-stok-irsaliye-sayfalar" aria-label="İrsaliye sayfaları">
          {sayfalar.map((s, i) => (
            <li key={s.anahtar}>
              {s.resim ? <img src={s.resim} alt={`Sayfa ${i + 1}`} /> : <span className="tc-stok-irsaliye-pdf"><Simge ad="file" />PDF</span>}
              <span className="tc-stok-irsaliye-no">{i + 1}</span>
              <Dugme simge="x" aria-label={`Sayfa ${i + 1}'i çıkar`} disabled={kilitli} onClick={() => cikar(s.anahtar)} />
            </li>
          ))}
        </ol>
      ) : <p className="tc-stok-not">İsteğe bağlı. Sayfalar tek PDF olur ve mal kabulde saklanır.</p>}
      {hata && <p className="tc-stok-bilgi tc-stok-bilgi-uyari" role="alert">{hata}</p>}
    </div>
  );
}

function BelgeSatiri({ malKabulId, b, kaldirabilir, kaldir }: { malKabulId: number; b: IrsaliyeBelgesi; kaldirabilir: boolean; kaldir: () => void }) {
  const adres = irsaliyeAdresi(malKabulId, b.id);
  return (
    <li>
      <span className="tc-stok-irsaliye-ad"><Simge ad="file" />{b.ad}</span>
      <span className="tc-stok-irsaliye-eylem">
        <a className="tc-stok-bag" href={adres} target="_blank" rel="noopener"><Simge ad="eye" boyut="k" />Aç</a>
        <a className="tc-stok-bag" href={adres} download="irsaliye.pdf"><Simge ad="download" boyut="k" />İndir</a>
        {kaldirabilir && <button type="button" className="tc-stok-bag tc-stok-irsaliye-kaldir" onClick={kaldir}><Simge ad="trash" boyut="k" />Kaldır</button>}
      </span>
    </li>
  );
}

// Mal kabul ayrıntısının "İrsaliye belgeleri" kartı: aç, indir, sonradan ekle, kaldır (mal kabul yapabilen, 3058 c).
export function IrsaliyeBelgeleri({ malKabulId }: { malKabulId: number }) {
  const yazabilir = useIslem('stok.giris');
  const istemci = useQueryClient();
  const { bildir } = useBildirim();
  const anahtar = anahtarlar.ayrinti('mal-kabul-irsaliyeleri', malKabulId);
  const l = useQuery({ queryKey: anahtar, queryFn: () => api.get<IrsaliyeBelgeleriCevabi>(`/stok/mal-kabuller/${malKabulId}/irsaliyeler`) });
  const [sayfalar, setSayfalar] = useState<IrsaliyeSayfasi[]>([]);
  const [ekleAcik, setEkleAcik] = useState(false);
  const [oran, setOran] = useState<number | null>(null);
  const [kaldirilacak, setKaldirilacak] = useState<IrsaliyeBelgesi | null>(null);
  const yenile = async (c: IrsaliyeBelgeleriCevabi) => {
    istemci.setQueryData(anahtar, c);
    await istemci.invalidateQueries({ queryKey: ['stok', 'liste', 'mal-kabul-satirlari'] });
  };
  const ekle = useMutation({
    mutationFn: () => irsaliyeEkle(malKabulId, sayfalar, setOran),
    onSuccess: async (c) => { await yenile(c); setSayfalar([]); setEkleAcik(false); bildir('tamam', 'İrsaliye eklendi.'); },
    onError: (e) => bildir('hata', e instanceof DosyaHatasi ? e.message : hataMetni(e)),
    onSettled: () => setOran(null),
  });
  const kaldir = useMutation({
    mutationFn: (b: IrsaliyeBelgesi) => korumaliPost<IrsaliyeBelgeleriCevabi>(`/stok/mal-kabuller/${malKabulId}/irsaliyeler/${b.id}/kaldir`, {}),
    onSuccess: async (c) => { await yenile(c); setKaldirilacak(null); bildir('tamam', 'İrsaliye mal kabulden kaldırıldı; Çizim ve Dosya Merkezi\'nde arşivde.'); },
    onError: (e) => bildir('hata', hataMetni(e)),
  });
  const belgeler = l.data?.belgeler ?? [];
  const ipucu = useMemo(() => (oran === null ? null : `Yükleniyor: %${Math.round(oran * 100)}`), [oran]);
  return (
    <Kart baslik="İrsaliye belgeleri" sag={yazabilir && !ekleAcik ? <Dugme tur="ikincil" simge="plus" onClick={() => setEkleAcik(true)}>Belge ekle</Dugme> : undefined}>
      {l.isPending ? <DurumKutusu durum="yukleniyor" />
        : l.isError ? <DurumKutusu durum="hata" mesaj={hataMetni(l.error)} yenile={() => void l.refetch()} />
          : belgeler.length === 0 && !ekleAcik ? <p className="tc-stok-not">Bu mal kabulde irsaliye belgesi yok.</p>
            : <ul className="tc-stok-irsaliye-belgeler">{belgeler.map((b) => <BelgeSatiri key={b.id} malKabulId={malKabulId} b={b} kaldirabilir={yazabilir} kaldir={() => setKaldirilacak(b)} />)}</ul>}
      {ekleAcik && (
        <div className="tc-stok-form">
          <IrsaliyeSecici sayfalar={sayfalar} degistir={setSayfalar} kilitli={ekle.isPending} />
          {ipucu && <p className="tc-stok-not">{ipucu}</p>}
          <div className="tc-stok-sag">
            <Dugme tur="ikincil" disabled={ekle.isPending} onClick={() => { setSayfalar([]); setEkleAcik(false); }}>Vazgeç</Dugme>
            <Dugme tur="birincil" simge="upload" yukleniyor={ekle.isPending} disabled={sayfalar.length === 0} onClick={() => ekle.mutate()}>Ekle</Dugme>
          </div>
        </div>
      )}
      <OnayPenceresi acik={kaldirilacak !== null} baslik="İrsaliyeyi kaldır" onayMetni="Kaldır" tehlikeli yukleniyor={kaldir.isPending}
        onayla={() => { if (kaldirilacak) kaldir.mutate(kaldirilacak); }} vazgec={() => setKaldirilacak(null)}>
        <p>{kaldirilacak?.ad}</p>
        <p className="tc-stok-not">İrsaliye mal kabulden kalkar ve Çizim ve Dosya Merkezi'nde arşivde saklanır. Kim ve ne zaman kaldırdığı kayda yazılır.</p>
      </OnayPenceresi>
    </Kart>
  );
}
