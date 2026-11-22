import { useMemo, useState } from 'react';
import type { KullanimYeri, MuadilTuru, SeciliAlternatif, ZarfKarti } from '#paylasilan/sozlesme/malzeme-alternatifleri.ts';
import { CokSatir, Dugme, Girdi, Pencere, Rozet, useBildirim } from '../../../../ortak/arayuz/index.ts';
import { hataIletisi } from '../../../../ortak/veri/api.ts';
import type { KatalogKarti } from '../tipler.ts';
import { TUR_ADI, YERLER, YER_ADI } from './tablo.ts';
import { useSeciliIslemi } from './veri.ts';

// 3572 a: kartı tek tek alternatif olarak ekleme ve kuraldan geleni "Önerilmesin". Sınır dışı kart da eklenir (K1: tanım yetkisiyle
// kabul edileni genişletir); talep eden listeden yalnız daraltır.
const EN_COK = 30;
const kod = (k: KatalogKarti) => k.kayit.com.kod || `#${String(k.no)}`;
const aktifMi = (k: KatalogKarti) => (k.kayit.onay?.durum ?? 'aktif') === 'aktif';

export function KartEklePenceresi({ ana, kartlar, kuraldan, disarida, kayit, kapat }: {
  ana: KatalogKarti; kartlar: readonly KatalogKarti[]; kuraldan: readonly ZarfKarti[]; disarida: ReadonlySet<number>;
  kayit: SeciliAlternatif | null; kapat: () => void;
}) {
  const islem = useSeciliIslemi();
  const { bildir } = useBildirim();
  const [ara, araYaz] = useState('');
  const [secilen, secilenYaz] = useState<number | null>(kayit?.alternatifNo ?? null);
  const [tur, turYaz] = useState<MuadilTuru>(kayit?.tur ?? 'tam');
  const [yerler, yerlerYaz] = useState<KullanimYeri[]>(kayit?.kullanimYerleri ?? [...YERLER]);
  const [notu, notuYaz] = useState(kayit?.notu ?? '');
  const sinirda = useMemo(() => new Set(kuraldan.map((k) => k.no)), [kuraldan]);
  const adaylar = useMemo(() => {
    const s = ara.trim().toLocaleLowerCase('tr');
    return kartlar
      .filter((k) => k.no !== ana.no && !disarida.has(k.no) && aktifMi(k))
      .filter((k) => s === '' || `${kod(k)} ${k.kayit.com.ad}`.toLocaleLowerCase('tr').includes(s))
      .sort((a, b) => Number(sinirda.has(b.no)) - Number(sinirda.has(a.no)) || a.no - b.no)
      .slice(0, EN_COK);
  }, [ara, kartlar, ana.no, disarida, sinirda]);
  const secilenKart = kartlar.find((k) => k.no === secilen) ?? null;
  const sinirDisi = secilen !== null && !sinirda.has(secilen);
  const gonder = () => {
    if (secilen === null || yerler.length === 0) return;
    islem.mutate({
      islem: 'kaydet', anaNo: ana.no, alternatifNo: secilen, tur, kullanimYerleri: yerler, notu: notu.trim() === '' ? null : notu.trim(),
      ...(kayit ? { surum: kayit.surum } : {}),
    }, {
      onSuccess: () => { bildir('tamam', `${secilenKart ? kod(secilenKart) : 'Kart'} alternatif listesinde`); kapat(); },
      onError: (e) => bildir('hata', hataIletisi(e, 'Alternatif eklenemedi')),
    });
  };
  return (
    <Pencere
      acik
      kapat={kapat}
      baslik={kayit ? 'Alternatif kartı düzenle' : 'Alternatif kart ekle'}
      alt={(
        <>
          <Dugme onClick={kapat}>Vazgeç</Dugme>
          <Dugme tur="birincil" disabled={secilen === null || yerler.length === 0} yukleniyor={islem.isPending} onClick={gonder}>{kayit ? 'Kaydet' : 'Ekle'}</Dugme>
        </>
      )}
    >
      <div className="tc-alt-form">
        {kayit ? <p className="mono">{kayit.kod ?? `#${String(kayit.alternatifNo)}`} <span className="tc-alt-soluk">{kayit.ad ?? ''}</span></p> : (
          <>
            <Girdi etiket="Kart ara" placeholder="Stok kodu ya da ad" value={ara} onChange={(e) => araYaz(e.target.value)} />
            {adaylar.length === 0 ? <p className="tc-alt-bos">Eklenebilecek aktif kart bulunamadı.</p> : (
              <ul className="tc-alt-kartlar" aria-label="Kartlar">
                {adaylar.map((k) => (
                  <li key={k.kimlik}>
                    <button type="button" className="tc-alt-kart" aria-current={k.no === secilen} onClick={() => secilenYaz(k.no)}>
                      <b className="tc-alt-kod">{kod(k)}</b>
                      <span>{k.kayit.com.ad}</span>
                      <Rozet ton={sinirda.has(k.no) ? 'tamam' : 'uyari'}>{sinirda.has(k.no) ? 'Sınır içinde' : 'Sınır dışı'}</Rozet>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {adaylar.length === EN_COK && <p className="tc-alt-soluk">{`İlk ${String(EN_COK)} kart; aramayı daraltın.`}</p>}
          </>
        )}
        <fieldset className="tc-kalt-cipler">
          <legend>Tür</legend>
          {(['tam', 'ust', 'sartli'] as const).map((t) => (
            <button key={t} type="button" className="tc-kalt-cip" aria-pressed={tur === t} onClick={() => turYaz(t)}>{TUR_ADI[t]}</button>
          ))}
        </fieldset>
        <fieldset className="tc-kalt-cipler">
          <legend>Nerede geçerli</legend>
          {YERLER.map((y) => (
            <button key={y} type="button" className="tc-kalt-cip" aria-pressed={yerler.includes(y)}
              onClick={() => yerlerYaz((l) => (l.includes(y) ? l.filter((x) => x !== y) : [...l, y]))}>{YER_ADI[y]}</button>
          ))}
          {yerler.length === 0 && <span className="tc-kalt-hata" role="alert">En az bir yer seçin.</span>}
        </fieldset>
        <CokSatir etiket="Not" maxLength={300} rows={2} value={notu} onChange={(e) => notuYaz(e.target.value)} />
        {sinirDisi && (
          <p className="tc-alt-kapali" role="note">
            Bu kart kabul sınırının dışında. Eklenirse yalnız seçtiğiniz yerlerde bu kartın yerine kabul edilir; Geçmiş'e yazılır.
          </p>
        )}
      </div>
    </Pencere>
  );
}

export function OnerilmesinPenceresi({ anaNo, kart, kayit, kapat }: {
  anaNo: number; kart: { no: number; kod: string | null }; kayit: SeciliAlternatif | null; kapat: () => void;
}) {
  const islem = useSeciliIslemi();
  const { bildir } = useBildirim();
  const [neden, nedenYaz] = useState('');
  const gonder = () => {
    if (neden.trim() === '') return;
    islem.mutate({ islem: 'onerilmesin', anaNo, alternatifNo: kart.no, neden: neden.trim(), ...(kayit ? { surum: kayit.surum } : {}) }, {
      onSuccess: () => { bildir('tamam', `${kart.kod ?? 'Kart'} artık önerilmiyor`); kapat(); },
      onError: (e) => bildir('hata', hataIletisi(e, 'İşaretlenemedi')),
    });
  };
  return (
    <Pencere
      acik
      kapat={kapat}
      baslik={`${kart.kod ?? `#${String(kart.no)}`} önerilmesin mi?`}
      alt={(
        <>
          <Dugme onClick={kapat}>Vazgeç</Dugme>
          <Dugme tur="birincil" disabled={neden.trim() === ''} yukleniyor={islem.isPending} onClick={gonder}>Önerilmesin</Dugme>
        </>
      )}
    >
      <div className="tc-alt-form">
        <p>Bu kart kural sınırına uysa da talepte, satın almada ve üretimde önerilmez ve kabul edilmez. Açık talep, sipariş ve emirdeki seçimler değişmez.</p>
        <Girdi etiket="Neden" maxLength={300} value={neden} onChange={(e) => nedenYaz(e.target.value)} />
      </div>
    </Pencere>
  );
}
