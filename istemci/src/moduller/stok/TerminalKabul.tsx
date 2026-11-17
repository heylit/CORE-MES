import { useState } from 'react';
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AcikSiparisSatiri, AcikSiparisSatirlariCevabi, FasonIsleriCevabi, KonumlarCevabi, MalKabulCevabi, MalKabulGovdesi } from '#paylasilan/sozlesme/stok.ts';
import { Dugme, KodOkuyucu, Simge } from '../../ortak/arayuz/index.ts';
import { api } from '../../ortak/veri/api.ts';
import { useGonderimKilidi } from '../../ortak/veri/korumali-komut.ts';
import { useOturum } from '../../ortak/veri/oturum.ts';
import { anahtarlar } from './anahtarlar.ts';
import { birimliMiktar } from './gorunum.ts';
import { hataMetni, korumaliPost } from './ortak.tsx';
import { PanelMalKabul } from './PanelMalKabul.tsx';
import { fasonDonusGovdesi, firmadaKalan, type FasonIsi } from './TerminalFasonDonusu.tsx';
import { bekleyenKabuller, fasonSatiriMi } from './TerminalMalKabul.tsx';

// 3388 a: depo terminalinde mal kabul standart terminal düzenindedir (sıradaki işler, kadran, Kabul +1 / Ret +1, Başlat-Bitir). Bu dosya
// terminale işleri ve yazan pencereleri verir; düzen terminalindir. Kabul edilen adet terminalde sayılır, Stok'a Bitir'de tek kayıtla yazılır.

export interface KabulIsi {
  satir: AcikSiparisSatiri;
  tur: 'fason' | 'satin-alma';
  // Fason işi (firmadaki parça); bulunamazsa null. Satın almada hep null.
  fason: FasonIsi | null;
  // Sayılabilecek en çok adet: fasonda firmada kalan, satın almada null (kabul okutmayla, birimiyle yapılır).
  hedef: number | null;
}

// Firmanın fason kutusu sipariş satırında yoktur: kutuların işleri okunur, iş emri ile eşlenir (kutu sayısı firma sayısı kadardır).
function useFasonIsleri(etkin: boolean) {
  const kutular = useQuery({ queryKey: anahtarlar.liste('fason-kutulari', {}), queryFn: () => api.get<KonumlarCevabi>('/stok/konumlar?tur=fason&sayfaBoyu=200'), enabled: etkin });
  const idler = (kutular.data?.satirlar ?? []).map((k) => k.id);
  const isler = useQueries({
    queries: idler.map((kutu) => ({ queryKey: anahtarlar.liste('fason-isleri', { kutu }), queryFn: () => api.get<FasonIsleriCevabi>(`/stok/fason-isleri?konumId=${String(kutu)}`) })),
  });
  const harita = new Map<number, FasonIsi>();
  for (const q of isler) for (const x of q.data?.isler ?? []) if (!harita.has(x.isEmriId)) harita.set(x.isEmriId, x);
  return { harita, yukleniyor: etkin && (kutular.isPending || isler.some((q) => q.isPending)), hata: kutular.error ?? isler.find((q) => q.error)?.error ?? null };
}

export const kabulIsleri = (satirlar: readonly AcikSiparisSatiri[], fasonlar: ReadonlyMap<number, FasonIsi>): KabulIsi[] => bekleyenKabuller(satirlar).map((satir) => {
  if (!fasonSatiriMi(satir)) return { satir, tur: 'satin-alma', fason: null, hedef: null };
  const fason = fasonlar.get(satir.isEmriId!) ?? null;
  return { satir, tur: 'fason', fason, hedef: fason ? firmadaKalan(fason) : null };
});

// Terminalin mal kabul işleri; yetkisizde istek gitmez ve liste null'dır.
export function useKabulIsleri(): { isler: KabulIsi[] | null; yukleniyor: boolean; hata: string | null; yenile: () => void } {
  const giris = (useOturum().data?.islemler ?? []).includes('stok.giris');
  const acik = useQuery({ queryKey: anahtarlar.liste('acik-siparis-satirlari', {}), queryFn: () => api.get<AcikSiparisSatirlariCevabi>('/stok/acik-siparis-satirlari'), enabled: giris });
  const f = useFasonIsleri(giris && (acik.data?.satirlar ?? []).some(fasonSatiriMi));
  const hata = acik.error ?? f.hata;
  return {
    isler: giris && acik.data && !f.yukleniyor ? kabulIsleri(acik.data.satirlar, f.harita) : null,
    yukleniyor: giris && (acik.isPending || f.yukleniyor),
    hata: hata ? hataMetni(hata) : null,
    yenile: () => { void acik.refetch(); },
  };
}

export const kabulKalani = (is: KabulIsi): string => birimliMiktar(is.satir.kalanMiktar, is.satir.birim);

// Bitir'deki onay: dönen kart, kabul ve firmada kalan; yazınca parça karantinaya girer ve GKK'ya düşer. Mal kabulde ret yoktur:
// uygunsuzluk GKK'nin kararıdır. "Malzeme dönmedi" ikinci dokunuşla hizmet teslimi yazar.
export function FasonKabulOnayi({ is, kabul, vazgec, yazildi }: { is: KabulIsi; kabul: number; vazgec: () => void; yazildi: (ileti: string) => void }) {
  const istemci = useQueryClient();
  const kilitli = useGonderimKilidi();
  const [donmedi, donmediYaz] = useState(false);
  const yaz = useMutation({
    mutationFn: (g: MalKabulGovdesi) => korumaliPost<MalKabulCevabi>('/stok/mal-kabul', g),
    onSuccess: (c, g) => {
      void istemci.invalidateQueries({ queryKey: anahtarlar.hepsi });
      yazildi(g.satirlar[0] && 'fasonIsi' in g.satirlar[0] ? `${String(kabul)} adet karantinaya girdi (${c.belge.no}); GKK kuyruğunda.` : `Hizmet teslimi yazıldı (${c.belge.no}); stok değişmedi.`);
    },
  });
  const f = is.fason;
  const kalan = is.hedef ?? 0;
  const kartAdi = f ? [f.donenKart.kod, f.donenKart.ad].filter(Boolean).join(' · ') : '—';
  const gonder = (g: MalKabulGovdesi) => kilitli(() => yaz.mutateAsync(g));
  return (
    <div className="tc-stok-fk" aria-label="Kabul onayı" role="group">
      <dl className="tc-stok-fd-ozet">
        <div><dt>Dönen kart</dt><dd>{kartAdi}</dd></div>
        <div><dt>Kabul</dt><dd>{kabul} adet</dd></div>
        <div><dt>Firmada kalan</dt><dd>{f ? `${String(Math.max(0, kalan - kabul))} adet` : '—'}</dd></div>
        <div><dt>Giriş yeri</dt><dd>Karantina, karar bekliyor</dd></div>
        <div><dt>Sonra</dt><dd>GKK kuyruğu</dd></div>
      </dl>
      {!f ? <p className="tc-stok-not tc-stok-uyari-yazi" role="alert">Bu işin firmada parçası bulunamadı; yalnız "Malzeme dönmedi" yazılabilir.</p> : null}
      {kabul > kalan && f ? <p className="tc-stok-fd-uyari" role="alert"><Simge ad="alert" />Firmada {kalan} adet var; en çok {kalan} kabul edilir.</p> : null}
      {yaz.isError ? <p className="tc-stok-fd-uyari" role="alert"><Simge ad="alert" />{hataMetni(yaz.error)}</p> : null}
      <div className="tc-stok-fd-alt">
        <Dugme onClick={vazgec} disabled={yaz.isPending}>Vazgeç</Dugme>
        <Dugme disabled={yaz.isPending} onClick={() => { if (!donmedi) { donmediYaz(true); return; } gonder(fasonDonusGovdesi(is.satir, 'donmedi', null, '')); }}>
          {donmedi ? 'Emin misiniz? Tekrar dokunun' : 'Malzeme dönmedi'}
        </Dugme>
        <Dugme tur="birincil" boyut="ana" simge="check" yukleniyor={yaz.isPending} disabled={!f || kabul <= 0 || kabul > kalan || yaz.isPending}
          onClick={() => gonder(fasonDonusGovdesi(is.satir, 'dondu', f, String(kabul)))}>Kabulü yaz</Dugme>
      </div>
    </div>
  );
}

// Satın alma kabulü okutmayla: malzemenin kodu okutulur, Stok'un hızlı kabulü açılır (sipariş eşleşmesi, parti, ambalaj, raf).
export function SatinAlmaKabulu() {
  const [kod, kodYaz] = useState<string | null>(null);
  return (
    <div className="tc-stok-form">
      <KodOkuyucu okundu={(k) => kodYaz(k.trim() || null)} sik ipucu="Malzemenin ya da kolinin kodunu okutun." />
      {kod ? <PanelMalKabul key={kod} kod={kod} /> : null}
    </div>
  );
}
