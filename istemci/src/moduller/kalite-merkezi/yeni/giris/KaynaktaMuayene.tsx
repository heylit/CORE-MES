import { useId, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { KmKaynaktaMuayeneOnayGovdesi, KmKaynaktaMuayeneSatiri } from '#paylasilan/sozlesme/kalite-merkezi.ts';
import { Dugme, Girdi, Pencere } from '../../../../ortak/arayuz/index.ts';
import { api, hataIletisi } from '../../../../ortak/veri/api.ts';
import { tekrarKorumaliGonder, yeniIstekKimligi } from '../../../../ortak/veri/istek-kimligi.ts';
import { MuayeneBelgeleri, useMuayeneBelgeleri } from '../../../uretim-emirleri/disari.ts';
import { GIRIS_ANAHTARI } from '../bugun/GirisKarari.tsx';
import { YOK, zamanKisa } from '../bicim.ts';
import { muayeneOnayIhlali } from './ortak.ts';

const sayi = (m: string): number => (m.trim() === '' ? 0 : Number(m));

// 3809: kaynağında muayene onayı. Kalite zorunlu belgeleri yükler, sağlam ve red adedini girer, onaylar; adım kapanır ve 3708 kuralı
// yürür (sonraki adım fasonsa aktarım, değilse dönüş muayenenin sağlamıyla sınırlı). Onay bir kez verilir.
export function KaynaktaMuayene({ satir, kapat }: { satir: KmKaynaktaMuayeneSatiri; kapat: () => void }) {
  const istemci = useQueryClient();
  const formKimligi = useId();
  const [saglam, saglamYaz] = useState('');
  const [red, redYaz] = useState('');
  const [kimlik, kimlikYaz] = useState(yeniIstekKimligi);
  const belgeler = useMuayeneBelgeleri(satir.uretimEmriId, satir.muayeneIsEmriId);
  const eksik = belgeler.data?.eksik ?? satir.eksik;
  const s = sayi(saglam);
  const r = sayi(red);
  const ihlal = eksik.length > 0 ? `Zorunlu belge eksik: ${eksik.join(', ')}.` : muayeneOnayIhlali(s, r, satir.gonderilen);
  const onayla = useMutation({
    mutationFn: (g: KmKaynaktaMuayeneOnayGovdesi) => tekrarKorumaliGonder(
      (d) => api.post<{ uretimEmriId: number }>(`/kalite-merkezi/kaynakta-muayene/${String(satir.muayeneIsEmriId)}/onay`, g, d), { istekKimligi: kimlik }),
    onSuccess: async () => {
      kimlikYaz(yeniIstekKimligi());
      await istemci.invalidateQueries({ queryKey: GIRIS_ANAHTARI });
      kapat();
    },
  });
  const ozetId = `${formKimligi}-ozet`;
  const kapali = ihlal !== null || belgeler.isPending;
  return (
    <Pencere
      acik tur="yan" kapat={() => { if (!onayla.isPending) kapat(); }}
      baslik={`Kaynağında muayene · ${satir.emirNo} · OP ${String(satir.opNo)}`}
      alt={(
        <>
          <Dugme onClick={kapat} disabled={onayla.isPending}>Vazgeç</Dugme>
          <Dugme tur="birincil" type="submit" form={formKimligi} yukleniyor={onayla.isPending} disabled={kapali} aria-describedby={ozetId}>
            Muayeneyi onayla
          </Dugme>
        </>
      )}
    >
      <div className="tc-km-gkk-alanlar">
        <dl className="tc-km-gkk-bilgi">
          <div><dt>Parça</dt><dd><b>{satir.parcaNo}</b> {satir.parcaAd}</dd></div>
          <div><dt>Firma</dt><dd>{satir.firmaAdi ?? YOK}</dd></div>
          <div><dt>Firmaya gönderilen</dt><dd><b>{satir.gonderilen} adet</b></dd></div>
          <div><dt>İlk gidiş</dt><dd>{zamanKisa(satir.ilkGidis)}</dd></div>
          <div><dt>Muayene süresi</dt><dd>{satir.sureSaat === null ? YOK : `${satir.sureSaat} saat`}</dd></div>
        </dl>
        <MuayeneBelgeleri emirId={satir.uretimEmriId} isEmriId={satir.muayeneIsEmriId} opNo={satir.opNo} />
        <form id={formKimligi} className="tc-km-gkk-alanlar" noValidate
          onSubmit={(e) => { e.preventDefault(); if (!kapali && !onayla.isPending) onayla.mutate({ saglam: s, red: r }); }}>
        <p id={ozetId} className={ihlal !== null && (s + r > 0 || eksik.length > 0) ? 'tc-km-gkk-hata' : 'tc-km-gkk-soluk'}>
          {ihlal ?? `${String(s)} sağlam, ${String(r)} red onaylanır; onay bir kez verilir.`}
        </p>
        <div className="tc-km-gkk-ikili">
          <Girdi etiket="Sağlam" type="number" inputMode="numeric" min={0} step={1} max={satir.gonderilen} value={saglam}
            disabled={onayla.isPending} onChange={(e) => { saglamYaz(e.target.value); }} />
          <Girdi etiket="Red" type="number" inputMode="numeric" min={0} step={1} max={satir.gonderilen} value={red}
            disabled={onayla.isPending} onChange={(e) => { redYaz(e.target.value); }} />
        </div>
        {onayla.isError && <p className="tc-km-gkk-hata" role="alert">{hataIletisi(onayla.error, 'Muayene onaylanamadı; yeniden deneyin.')}</p>}
        </form>
      </div>
    </Pencere>
  );
}
