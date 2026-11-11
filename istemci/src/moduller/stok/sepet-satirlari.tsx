import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../ortak/veri/api.ts';
import type {
  GelecekSepetCevabi, IstasyonSepetiCevabi, IstasyonSepetiSatiri, SepettenCekGovdesi, Teslim, TeslimAlGovdesi, TeslimCevabi, TeslimGonderGovdesi, TeslimReddetGovdesi,
} from '#paylasilan/sozlesme/stok.ts';
import { Dugme, Girdi, useBildirim } from '../../ortak/arayuz/index.ts';
import { ApiHatasi } from '../../ortak/veri/api.ts';
import { anahtarlar } from './anahtarlar.ts';
import { yeniIstekKimligi } from '../../ortak/veri/istek-kimligi.ts';
import { miktarGirdisi, miktarMetni, zamanMetni } from './gorunum.ts';
import { hataMetni, korumaliPost, useStokKomutu } from './ortak.tsx';
import { useAcilanKartBildirimi } from './kart-bildirimi.tsx';
import { useStatuAdi } from './statu.ts';
import { TeslimSatiri } from './TeslimSatiri.tsx';

// Malzeme · Teslim panelinin ve terminalin iki sepetinin (745) ortak satırları: gelen teslim, önceki istasyonda bekleyen, istasyonda duran.
const yeniKimlik = yeniIstekKimligi;

// 545 T4: çoğu teslim tam gelir; tek dokunuş gönderilen miktarı alır, "Eksik geldi" miktar alanını açar.
export function GelenTeslim({ t }: { t: Teslim }) {
  const [alinan, setAlinan] = useState(miktarMetni(t.miktar).replace(/\./g, ''));
  const [eksikAcik, setEksikAcik] = useState(false);
  const [redAcik, setRedAcik] = useState(false);
  const [neden, setNeden] = useState('');
  const al = useStokKomutu((g: TeslimAlGovdesi) => api.post(`/stok/teslimler/${t.id}/teslim-al`, g), `${t.no} teslim alındı.`);
  const red = useStokKomutu((g: TeslimReddetGovdesi) => api.post(`/stok/teslimler/${t.id}/reddet`, g), `${t.no} reddedildi.`);
  return (
    <TeslimSatiri t={t}>
      <div className="tc-stok-dugmeler">
        <Dugme tur="birincil" simge="check" yukleniyor={al.komut.isPending && !eksikAcik} disabled={al.komut.isPending}
          onClick={() => al.komut.mutate({ surum: t.surum, alinan: t.miktar })}>Teslim al, {miktarMetni(t.miktar)}</Dugme>
        <Dugme onClick={() => setEksikAcik((a) => !a)} aria-expanded={eksikAcik}>Eksik geldi</Dugme>
        <Dugme simge="x" onClick={() => setRedAcik((a) => !a)} aria-expanded={redAcik}>Reddet</Dugme>
      </div>
      {eksikAcik && (
        <div className="tc-stok-dugmeler">
          <Girdi etiket="Alınan miktar" inputMode="decimal" value={alinan} onChange={(o) => setAlinan(o.target.value)} />
          <Dugme tur="birincil" simge="check" yukleniyor={al.komut.isPending} disabled={alinan.trim() === ''}
            onClick={() => al.komut.mutate({ surum: t.surum, alinan: miktarGirdisi(alinan) })}>Bu miktarı al</Dugme>
        </div>
      )}
      {redAcik && (
        <div className="tc-stok-dugmeler">
          <Girdi etiket="Red nedeni" maxLength={200} value={neden} onChange={(o) => setNeden(o.target.value)} />
          <Dugme tur="tehlike" yukleniyor={red.komut.isPending} disabled={neden.trim() === ''} onClick={() => red.komut.mutate({ surum: t.surum, neden })}>Reddi gönder</Dugme>
        </div>
      )}
      {al.onayPenceresi}
    </TeslimSatiri>
  );
}

// 1338 a (madde 4): gelen teslimle aynı kalıp; tek dokunuş tamamını alır, "Eksik geldi" miktar alanını açar.
export function OncekiSepetSatiri({ istasyonId, x }: { istasyonId: number; x: GelecekSepetCevabi['satirlar'][number] }) {
  const statuAdi = useStatuAdi();
  const [kimlik, setKimlik] = useState(yeniKimlik);
  const [miktar, setMiktar] = useState(() => miktarMetni(x.miktar).replace(/\./g, ''));
  const [eksikAcik, setEksikAcik] = useState(false);
  const cek = useStokKomutu((g: SepettenCekGovdesi) => korumaliPost('/stok/teslim-kutusu/sepet/cek', g), 'Teslim alındı; malzeme istasyonunuza geçti.', () => setKimlik(yeniKimlik()));
  const cekGonder = (m: string) => cek.komut.mutate({
    istasyonId, kaynakIstasyonId: x.kaynak.id, malzemeId: x.malzemeId, partiId: x.partiId, statuId: x.statuId, miktar: m, kaynakKimligi: kimlik,
  });
  return (
    <li className="tc-stok-is tc-stok-teslim-satir">
      <div>
        <strong>{x.ad ?? x.kod ?? `Malzeme #${x.malzemeId}`} · {miktarMetni(x.miktar)}</strong>
        <span>{x.kaynak.ad} ({x.kaynak.kod}) · {statuAdi(x.statuId)}{x.partiEtiketi ? ` · ${x.partiEtiketi}` : ''}</span>
        {x.getiren && <span>{x.getiren}{x.gelis ? ` · ${zamanMetni(x.gelis)}` : ''}</span>}
        <div className="tc-stok-dugmeler">
          <Dugme tur="birincil" simge="check" yukleniyor={cek.komut.isPending && !eksikAcik} disabled={cek.komut.isPending}
            onClick={() => cekGonder(x.miktar)}>Teslim al, {miktarMetni(x.miktar)}</Dugme>
          <Dugme onClick={() => setEksikAcik((a) => !a)} aria-expanded={eksikAcik}>Eksik geldi</Dugme>
        </div>
        {eksikAcik && (
          <div className="tc-stok-dugmeler">
            <Girdi etiket="Alınan miktar" inputMode="decimal" value={miktar} onChange={(o) => setMiktar(o.target.value)} />
            <Dugme tur="birincil" simge="download" yukleniyor={cek.komut.isPending} disabled={miktar.trim() === ''} onClick={() => cekGonder(miktarGirdisi(miktar))}>Bu miktarı al</Dugme>
          </div>
        )}
      </div>
      {cek.onayPenceresi}
    </li>
  );
}

export const SONRAKI_YOK: Record<NonNullable<IstasyonSepetiSatiri['sonrakiYok']>, string | null> = {
  'son-adim': 'Rotanın son adımı: depoya ya da sevke teslim edin.',
  fason: 'Sonraki adım fason: Teslim et ile gönderin.',
  'rota-disi': null,
};

// emirli: gönderim satırın emriyle yazılır (iki sepet, 745); gelen sepet yoldaki teslimi emirden bulur. Panel sepeti emirsiz gönderir.
// Sarf yalnız sayımdan düşer (896 a): sepet satırında elle kullanım yoktur.
// kilitli: toplu gönderim sürerken satır düğmesi kapalıdır; aynı satır ikinci kimlikle iki kez gönderilmesin.
export function SepetSatiri({ istasyonId, x, emirli = false, kilitli = false }: {
  istasyonId: number; x: IstasyonSepetiSatiri; emirler: IstasyonSepetiCevabi['emirler']; emirli?: boolean; kilitli?: boolean;
}) {
  const statuAdi = useStatuAdi();
  const [kimlik, setKimlik] = useState(yeniKimlik);
  const kartiSoyle = useAcilanKartBildirimi('gidiyor');
  // Emirli gönderim emrin kartını açabilir (2931 a); açılan kart cevapta gelir.
  const gonder = useStokKomutu(async (g: TeslimGonderGovdesi) => {
    const c = await korumaliPost<TeslimCevabi>('/stok/teslimler/gonder', g);
    kartiSoyle(c.acilanKartlar);
    return c;
  },
    x.sonraki ? `${x.sonraki.ad} istasyonuna gönderildi; alan taraf onaylayınca stok taşınır.` : 'Gönderildi.', () => setKimlik(yeniKimlik()));
  const not = x.sonrakiYok ? SONRAKI_YOK[x.sonrakiYok] : null;
  const serbestVar = Number(x.miktar) > 0;
  return (
    <li className="tc-stok-is tc-stok-teslim-satir">
      <div>
        <strong>{x.ad ?? x.kod ?? `Malzeme #${x.malzemeId}`} · {miktarMetni(x.miktar)}</strong>
        <span>{statuAdi(x.statuId)}{x.partiEtiketi ? ` · ${x.partiEtiketi}` : ''}</span>
        {Number(x.yolda) > 0 && <span>{miktarMetni(x.yolda)} yolda; alan onaylayınca düşer</span>}
        {x.getiren && <span>{x.getiren}{x.gelis ? ` · ${zamanMetni(x.gelis)}` : ''}</span>}
        {x.sonraki && serbestVar && x.koken === 'uretim' && (
          <div className="tc-stok-dugmeler">
            <Dugme tur="birincil" simge="upload" disabled={kilitli} yukleniyor={gonder.komut.isPending} onClick={() => gonder.komut.mutate({
              malzemeId: x.malzemeId, miktar: x.miktar, partiId: x.partiId, statuId: x.statuId, kaynak: { istasyonId }, hedef: { istasyonId: x.sonraki!.istasyonId },
              not: null, kaynakKimligi: kimlik, ...(emirli ? { uretimEmriId: x.uretimEmriId } : {}),
            })}>Sonraki istasyona: {x.sonraki.ad} (OP {x.sonraki.opNo})</Dugme>
          </div>
        )}
        {not && <span className="tc-stok-not">{not}</span>}
      </div>
      {gonder.onayPenceresi}
    </li>
  );
}


// 2920 a: burada üretilen ve rotası belli satırlar tek dokunuşla sonraki istasyona gider; her satır ayrı teslim kaydıdır (satır
// düğmesiyle aynı uç ve gövde). Yalnız üretim kökenli satır: depodan gelen statüsüz girdi sunucuda "son işlenmiş hâl" sayılır
// (stok kurallar.ts sonrakiIstasyon) ve işlenmeden sonraki istasyona giderdi. Onay isteyen ya da reddedilen satır sepette kalır,
// nedeniyle listelenir ve satırın kendi düğmesiyle gönderilir; satır gidince listeden düşer. Tek satırda satır düğmesi yeter.
const satirAdi = (x: IstasyonSepetiSatiri): string => x.ad ?? x.kod ?? `Malzeme #${x.malzemeId}`;
const satirAnahtari = (x: IstasyonSepetiSatiri): string => `${x.malzemeId}-${x.partiId ?? 0}-${x.statuId ?? 0}`;
export const rotadaGidenler = (satirlar: readonly IstasyonSepetiSatiri[]): IstasyonSepetiSatiri[] =>
  satirlar.filter((x) => x.sonraki !== null && x.koken === 'uretim' && Number(x.miktar) > 0);

export function RotayaGoreGonder({ istasyonId, satirlar, suruyor }: {
  istasyonId: number; satirlar: readonly IstasyonSepetiSatiri[]; suruyor?: (s: boolean) => void;
}) {
  const istemci = useQueryClient();
  const { bildir } = useBildirim();
  const [kalanlar, setKalanlar] = useState<{ anahtar: string; metin: string }[]>([]);
  const gidenler = rotadaGidenler(satirlar);
  // Satırdan gönderilen ya da başka yoldan giden satır sepette serbest miktarı kalmayınca listeden düşer.
  const duranlar = new Set(satirlar.filter((x) => Number(x.miktar) > 0).map(satirAnahtari));
  const gorunenKalanlar = kalanlar.filter((k) => duranlar.has(k.anahtar));
  const gonder = useMutation({
    mutationFn: async () => {
      let giden = 0;
      const kalan: { anahtar: string; metin: string }[] = [];
      for (const x of gidenler) {
        const g: TeslimGonderGovdesi = {
          malzemeId: x.malzemeId, miktar: x.miktar, partiId: x.partiId, statuId: x.statuId, kaynak: { istasyonId }, hedef: { istasyonId: x.sonraki!.istasyonId },
          not: null, kaynakKimligi: yeniKimlik(),
        };
        try { await korumaliPost('/stok/teslimler/gonder', g); giden += 1; } catch (h) {
          const onayli = h instanceof ApiHatasi && h.govde.kod === 'ONAY_GEREKLI';
          kalan.push({ anahtar: satirAnahtari(x), metin: `${satirAdi(x)}: ${onayli ? 'onay istiyor, satırdan gönderin' : hataMetni(h)}` });
        }
      }
      return { giden, kalan };
    },
    onSuccess: ({ giden, kalan }) => {
      setKalanlar(kalan);
      const metin = `${giden} satır rotadaki sonraki istasyona gönderildi; alan taraf onaylayınca stok taşınır.`;
      if (kalan.length === 0) bildir('tamam', metin); else bildir('hata', `${metin} ${kalan.length} satır sepette kaldı.`);
    },
    onError: (h) => bildir('hata', hataMetni(h)),
    onMutate: () => suruyor?.(true),
    onSettled: () => { suruyor?.(false); return istemci.invalidateQueries({ queryKey: anahtarlar.hepsi }); },
  });
  if (gidenler.length < 2 && gorunenKalanlar.length === 0) return null;
  return (
    <>
      {gidenler.length >= 2 && (
        <div className="tc-stok-dugmeler">
          <Dugme tur="birincil" simge="upload" yukleniyor={gonder.isPending} onClick={() => gonder.mutate()}>Rotaya göre gönder ({gidenler.length} satır)</Dugme>
        </div>
      )}
      {gorunenKalanlar.length > 0 && (
        <div className="tc-stok-bilgi tc-stok-bilgi-uyari" role="alert">
          <ul aria-label="Sepette kalanlar">{gorunenKalanlar.map((k) => <li key={k.anahtar}>{k.metin}</li>)}</ul>
        </div>
      )}
    </>
  );
}
