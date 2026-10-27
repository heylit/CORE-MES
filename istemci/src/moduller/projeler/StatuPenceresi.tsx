import { useId, useState, type FormEvent } from 'react';
import type { GuncelStatu, ProjeYonetimiCevabi, StatuYazGovdesi } from '#paylasilan/sozlesme/projeler.ts';
import { CokSatir, Dugme, Girdi, Pencere, Secim } from '../../ortak/arayuz/index.ts';
import { api, hataIletisi } from '../../ortak/veri/api.ts';
import { bosIseNull, useYonetimKomutu } from './komut.ts';

// Renk tek başına anlam taşımaz: statü adı her zaman yazılır; elle yazılmış statü ayrıca ekran okuyucuya söylenir.
export function StatuCipi({ statu, tikla }: { statu: Pick<GuncelStatu, 'ad' | 'ton' | 'serbest'> | null; tikla?: () => void }) {
  const ad = statu?.ad ?? 'Statü yok';
  const ozellik = { className: 'tc-prj-statu', 'data-ton': statu?.ton ?? 'pasif', 'data-serbest': statu?.serbest === true ? 'true' : undefined };
  const ek = statu?.serbest === true ? <span className="tc-gizli-etiket"> (elle yazıldı)</span> : null;
  if (tikla === undefined) return <span {...ozellik}>{ad}{ek}</span>;
  return <button type="button" {...ozellik} aria-label={`Statü: ${ad}. Değiştir`} onClick={tikla}>{ad}{ek}</button>;
}

const YAZ = 'yaz';

export function StatuPenceresi({ projeId, yonetim, kapat }: { projeId: number; yonetim: ProjeYonetimiCevabi; kapat: () => void }) {
  const kimlik = useId();
  const [secim, secimYaz] = useState(yonetim.statu?.statuId != null ? String(yonetim.statu.statuId) : '');
  const [metin, metinYaz] = useState('');
  const [not, notYaz] = useState('');
  const [hatalar, hatalarYaz] = useState<{ secim?: string; metin?: string }>({});
  const komut = useYonetimKomutu<StatuYazGovdesi>(
    projeId,
    (govde, istekKimligi) => api.post(`/projeler/${projeId}/statu`, govde, { istekKimligi }),
    kapat,
  );
  const secenekler = [
    ...yonetim.statuler.map((s) => ({ deger: String(s.id), baslik: s.ad })),
    ...(yonetim.serbestStatu ? [{ deger: YAZ, baslik: 'Listede yok, yazacağım' }] : []),
  ];
  const ilet = (o: FormEvent) => {
    o.preventDefault();
    if (secim === '') { hatalarYaz({ secim: 'Bir statü seçin.' }); return; }
    if (secim === YAZ && metin.trim() === '') { hatalarYaz({ metin: 'Statüyü yazın.' }); return; }
    komut.mutate({
      statuId: secim === YAZ ? null : Number(secim),
      metin: secim === YAZ ? metin.trim() : null,
      not: bosIseNull(not),
    });
  };
  return (
    <Pencere
      acik
      kapat={kapat}
      baslik="Statü değiştir"
      alt={(
        <>
          <Dugme onClick={kapat} disabled={komut.isPending}>Vazgeç</Dugme>
          <Dugme tur="birincil" type="submit" form={kimlik} yukleniyor={komut.isPending}>Kaydet</Dugme>
        </>
      )}
    >
      <form id={kimlik} className="tc-form" onSubmit={ilet} noValidate>
        <div className="tc-form-tam">
          <Secim
            etiket="Statü" required value={secim} bosSecenek="Seçin" secenekler={secenekler} hata={hatalar.secim}
            ipucu={yonetim.serbestStatu ? undefined : 'Listede olmayan statü yazılamaz; liste "Statü listesi" sayfasındadır.'}
            onChange={(e) => { secimYaz(e.target.value); hatalarYaz({}); }}
          />
        </div>
        {secim === YAZ && (
          <div className="tc-form-tam">
            <Girdi
              etiket="Statü metni" required value={metin} maxLength={80}
              ipucu="Yalnız bu projeye yazılır, listeye eklenmez."
              hata={hatalar.metin}
              onChange={(e) => { metinYaz(e.target.value); hatalarYaz({}); }}
            />
          </div>
        )}
        <div className="tc-form-tam">
          <CokSatir etiket="Not" value={not} maxLength={500} ipucu="İsteğe bağlı; statü geçmişinde görünür." onChange={(e) => { notYaz(e.target.value); }} />
        </div>
        {komut.isError && <p className="tc-form-tam tc-prj-hata" role="alert">{hataIletisi(komut.error, 'Statü kaydedilemedi')}</p>}
      </form>
    </Pencere>
  );
}
