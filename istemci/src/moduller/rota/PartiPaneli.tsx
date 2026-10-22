import { useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import type {
  AdimliEmirAyrintisi, AdimliEmirCevabi, AdimliEmirOzeti, BirlesmePlaniGovdesi, EkAdim, IsEmriTuru, PartiBirlestirGovdesi,
} from '#paylasilan/sozlesme/uretim-emirleri.ts';
import { Dugme, Simge, useBildirim } from '../../ortak/arayuz/index.ts';
import type { SimgeAdi } from '../../ortak/tasarim/simgeler.ts';
import { api, hataIletisi } from '../../ortak/veri/api.ts';
import { yeniIstekKimligi } from '../../ortak/veri/istek-kimligi.ts';
import { dalla } from './gorunum.ts';

type Adim = AdimliEmirAyrintisi['isEmirleri'][number];
const ACIK = ['taslak', 'planli', 'basladi'];
const sirala = <T extends { sira: number }>(l: readonly T[]) => [...l].sort((a, b) => a.sira - b.sira);
const turu = (a: { tur?: IsEmriTuru | undefined }): IsEmriTuru => a.tur ?? 'rota';

export const EK_ADIM_ETIKETI: Record<EkAdim['tur'], { ad: string; simge: SimgeAdi }> = {
  rework: { ad: 'Rework', simge: 'rotate' }, tamir: { ad: 'Tamir', simge: 'wrench' }, ek: { ad: 'Ek adım', simge: 'plus' },
};

// Parti kolu (PB-K2, Soru 121 a): bölünen adım bitmemiş, sonrakiler başlamamışsa bölünür; çalışan adımda yalnız üretilmemiş adet
// ayrılır (adedi sunucu denetler). Önceki adımların bitmesi gerekmez.
export function bolunebilirAdimlar(d: AdimliEmirAyrintisi): Adim[] {
  if (!ACIK.includes(d.durum) || d.arsiv) return [];
  const sirali = sirala(d.isEmirleri);
  return sirali.filter((a, i) => a.durum !== 'tamam' && sirali.slice(i + 1).every((x) => x.durum === 'bekliyor'));
}

// Alt parti üst emrine ya da aynı adımdan bölünmüş kardeşine birleşir; kendi alt partisi açıksa birleşmez. Kaynağın kalan adımları rotadan
// gelmeli (bitmemiş rework, tamir ya da ek adım birleşmeyi engeller) ve iki taraf aynı op numarasında beklemeli; kalan adımların
// eşitliğini sunucu denetler.
export function birlesmeHedefleri(d: AdimliEmirAyrintisi, emirler: readonly AdimliEmirOzeti[]): AdimliEmirOzeti[] {
  const p = d.parti;
  if (!p || p.ustEmirId === null || p.altEmirIdleri.length > 0 || !ACIK.includes(d.durum) || d.arsiv) return [];
  const kalan = sirala(d.isEmirleri).filter((a) => a.durum !== 'tamam');
  const ilk = kalan[0];
  if (ilk === undefined || kalan.some((a) => a.durum !== 'bekliyor' || turu(a) !== 'rota')) return [];
  return emirler.filter((e) => e.id !== d.id && ACIK.includes(e.durum) && !e.arsiv
    && (e.id === p.ustEmirId || (e.parti?.ustEmirId === p.ustEmirId && e.parti.bolunmeSira === p.bolunmeSira))
    && (e.durum === 'taslak') === (d.durum === 'taslak')
    && e.siradaki?.durum === 'bekliyor' && e.siradaki.opNo === ilk.opNo);
}

// Liste dal sırasıyla: alt partiler üst emrin hemen altında; üstü listede olmayan parti kök gibi durur.
export const dalSirasi = <T extends Pick<AdimliEmirOzeti, 'id' | 'parti'>>(emirler: readonly T[]) =>
  dalla(emirler, (e) => e.id, (e) => e.parti?.ustEmirId ?? null);

export function PartiPaneli({ d, emirler, yaz, ac }: { d: AdimliEmirAyrintisi; emirler: readonly AdimliEmirOzeti[]; yaz: boolean; ac: (id: number) => void }) {
  const istemci = useQueryClient();
  const { bildir } = useBildirim();
  const git = useNavigate();
  const [hedefId, hedefIdYaz] = useState('');
  const [silahli, silahliYaz] = useState(false);
  // Birleştirme ve plan kaldırma yinelenirse parti iki kez birleşir: aynı onayın yeniden gönderimi aynı kimlikle gider. Komut başına ayrı
  // kimlik; girdi değişince yenilenir, yoksa sunucu kimliği başka istekte kullanılmış sayar.
  const birlesKimligi = useRef(yeniIstekKimligi());
  const planKimligi = useRef(yeniIstekKimligi());
  const yenile = async () => {
    await istemci.invalidateQueries({ queryKey: ['rotalar', 'emirler'] });
    await istemci.invalidateQueries({ queryKey: ['rotalar', 'plan'] });
  };
  const adaylar = bolunebilirAdimlar(d);
  // 185 a: parti bölme (rework, tamir ve ek adımlı kol dahil) plan motorundadır; panel bölmeyi gösterir, bölünebilen emirde motora götürür.
  const bolunebilir = adaylar.length > 0;
  const hedefler = birlesmeHedefleri(d, emirler);
  const no = (id: number) => emirler.find((e) => e.id === id)?.emirNo ?? `#${id}`;
  const birlestir = useMutation({
    mutationFn: ({ hedef, g }: { hedef: number; g: PartiBirlestirGovdesi }) =>
      api.post<AdimliEmirCevabi>(`/adimli-emirler/${hedef}/birlestir`, g, { istekKimligi: birlesKimligi.current }),
    onSuccess: async (_c, v) => { birlesKimligi.current = yeniIstekKimligi(); bildir('tamam', `${d.emirNo} ${no(v.hedef)} ile birleştirildi.`); silahliYaz(false); await yenile(); ac(v.hedef); },
    onError: (x) => { silahliYaz(false); bildir('hata', hataIletisi(x, 'Partiler birleştirilemedi.')); },
  });
  const planKaldir = useMutation({
    mutationFn: (g: BirlesmePlaniGovdesi) => api.post<AdimliEmirCevabi>(`/adimli-emirler/${d.id}/birlesme-plani`, g, { istekKimligi: planKimligi.current }),
    onSuccess: async () => { planKimligi.current = yeniIstekKimligi(); bildir('tamam', `${d.emirNo} birleşme planı kaldırıldı; kol kalan adımları kendisi yapar.`); await yenile(); },
    onError: (x) => bildir('hata', hataIletisi(x, 'Birleşme planı kaldırılamadı.')),
  });
  const p = d.parti;
  const bolunmeAdimi = p?.bolunmeSira != null ? d.isEmirleri.find((a) => a.sira === p.bolunmeSira) : undefined;
  const hedef = hedefler.find((e) => String(e.id) === hedefId) ?? (hedefler.length === 1 ? hedefler[0] : undefined);
  if (!p?.ustEmirId && !p?.altEmirIdleri.length && p?.birlestigiEmirId == null && !(yaz && bolunebilir)) return null;
  return (
    <div className="tc-satir tc-parti" role="group" aria-label="Parti">
      {p?.ustEmirId != null && (
        <span>Parti: <button type="button" className="tc-baglanti" onClick={() => ac(p.ustEmirId!)}>{no(p.ustEmirId)}</button>
          {bolunmeAdimi ? ` emrinden, OP ${bolunmeAdimi.opNo} adımında bölündü` : ' emrinden bölündü'}</span>
      )}
      {p?.ustEmirId != null && p.birlesmeOpNo != null && (
        <span><Simge ad="layers" boyut="k" /> {d.durum === 'iptal' ? 'Katıldı' : 'Katılacak'}: {no(p.ustEmirId)} OP {p.birlesmeOpNo}</span>
      )}
      {yaz && p?.ustEmirId != null && p.birlesmeOpNo != null && ACIK.includes(d.durum) && !d.arsiv && (
        <Dugme simge="x" yukleniyor={planKaldir.isPending} onClick={() => planKaldir.mutate({ birlesmeOpNo: null, surum: d.surum })}>Birleşme planını kaldır</Dugme>
      )}
      {p?.birlestigiEmirId != null && (
        <span>Birleştiği parti: <button type="button" className="tc-baglanti" onClick={() => ac(p.birlestigiEmirId!)}>{no(p.birlestigiEmirId)}</button></span>
      )}
      {p && p.altEmirIdleri.length > 0 && (
        <span>Alt partiler: {p.altEmirIdleri.map((id) => <button key={id} type="button" className="tc-baglanti" onClick={() => ac(id)}>{no(id)}</button>)}</span>
      )}
      <span className="tc-grow" />
      <div className="tc-arac">
        {yaz && bolunebilir && (
          <Dugme simge="layers" title="Emirler sekmesinde emri aç, Böl bölümünden partiye ya da kola ayır; rework, tamir ve ek adım orada eklenir."
            onClick={() => { void git('/recete-rota'); }}>Plan motorunda böl</Dugme>
        )}
        {yaz && hedefler.length > 1 && (
          <select className="tc-inp tc-inp-orta" aria-label="Birleşeceği parti" value={hedefId} onChange={(x) => { hedefIdYaz(x.target.value); silahliYaz(false); birlesKimligi.current = yeniIstekKimligi(); }}>
            <option value="">Birleşeceği parti…</option>
            {hedefler.map((e) => <option key={e.id} value={e.id}>{e.emirNo} · {e.adet} adet</option>)}
          </select>
        )}
        {yaz && hedef && (
          <Dugme tur={silahli ? 'tehlike' : 'ikincil'} simge="box" yukleniyor={birlestir.isPending}
            onClick={() => { if (silahli) birlestir.mutate({ hedef: hedef.id, g: { kaynakEmirId: d.id, surum: hedef.surum, kaynakSurum: d.surum } }); else silahliYaz(true); }}>
            {silahli ? `Emin misin? ${d.emirNo} kapanır, adedi ${hedef.emirNo} partisine geçer` : `${hedef.emirNo} ile birleştir`}
          </Dugme>
        )}
      </div>
    </div>
  );
}
