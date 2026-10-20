import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  Demirbas, DemirbasCevabi, DemirbasDurumu, DemirbasEkleGovdesi, DemirbaslarCevabi, DemirbasTuru, ElleDurum, IadeDurumu, KisiSecenekleriCevabi,
  Zimmet as ZimmetKaydi, ZimmetCevabi, ZimmetlerCevabi,
} from '#paylasilan/sozlesme/idari-isler.ts';
import { CokSatir, Dugme, DurumKutusu, Girdi, Kart, Pencere, Rozet, Secim, Simge, useBildirim } from '../../ortak/arayuz/index.ts';
import { api, hataIletisi } from '../../ortak/veri/api.ts';
import { anahtarlar } from './anahtarlar.ts';
import {
  DEMIRBAS_DURUMLARI, DEMIRBAS_DURUMU, DEMIRBAS_TURLERI, DEMIRBAS_TURU, IADE_DURUMLARI, IADE_DURUMU, SINIR, bugunTarihi, tarihMetni, tlMetni, zimmetSahibi,
} from './gorunum.ts';
import { useIslemVar, useKorumaliGonderim, yazmaIletisi } from './yazma.ts';
import './idari-isler.css';

const TURLER = DEMIRBAS_TURLERI.map((t) => ({ deger: t, baslik: DEMIRBAS_TURU[t].etiket }));
const ELLE_DURUMLAR: readonly ElleDurum[] = ['bosta', 'bakimda', 'kayip', 'hurda'];
// Virgül ya da nokta kuruş ayırıcısıdır; binlik ayırıcı yazılmaz.
const TUTAR = /^\d{1,12}([.,]\d{1,2})?$/;
const kucuk = (m: string) => m.toLocaleLowerCase('tr-TR');

// Demirbaş ve zimmet (170 a, 244 a): seri numaralı eşya, kimde olduğu, zimmetleme ve iade. İK'dan taşınan ve kişiye bağlanmamış zimmet
// uyarı şeridinde sayılır ve demirbaşın penceresinden kişiye bağlanır.
export function Zimmet() {
  const yazar = useIslemVar('idari-isler.zimmet-yaz');
  const [ara, araYaz] = useState('');
  const [durum, durumYaz] = useState<DemirbasDurumu | null>(null);
  const [secili, seciliYaz] = useState<number | null>(null);
  const [form, formYaz] = useState<{ demirbas: Demirbas | null } | null>(null);
  const liste = useQuery({ queryKey: anahtarlar.demirbaslar, queryFn: () => api.get<DemirbaslarCevabi>('/idari-isler/demirbaslar') });
  const hepsi = liste.data?.demirbaslar ?? [];
  const bagsiz = hepsi.filter((d) => d.acikZimmet !== null && d.acikZimmet.kisiId === null).length;
  const aranan = kucuk(ara.trim());
  const gorunen = hepsi.filter((d) => (durum === null || d.durum === durum) && (aranan === '' || [
    d.no, d.markaModel, d.seriNo, DEMIRBAS_TURU[d.tur].etiket, d.acikZimmet === null ? null : zimmetSahibi(d.acikZimmet),
  ].some((m) => m !== null && kucuk(m).includes(aranan))));
  const acik = hepsi.find((d) => d.id === secili) ?? null;

  return (
    <section className="tc-ii">
      <Kart
        baslik="Demirbaş ve zimmet"
        sag={(
          <span className="tc-ii-dugmeler">
            {yazar && <Dugme tur="birincil" simge="plus" onClick={() => formYaz({ demirbas: null })}>Demirbaş ekle</Dugme>}
            <Dugme simge="rotate" aria-label="Yenile" onClick={() => { void liste.refetch(); }} yukleniyor={liste.isFetching} />
          </span>
        )}
      >
        {bagsiz > 0 && (
          <p className="tc-ii-uyari" role="status">
            <Simge ad="alert" />
            <span>{bagsiz} zimmet İK'dan kişisiz taşındı; demirbaşı açıp kişiye bağlayın.</span>
          </p>
        )}
        <div className="tc-ii-iki">
          <Girdi etiket="Ara" type="search" placeholder="No, seri no, marka ya da kişi" value={ara} onChange={(o) => araYaz(o.target.value)} />
          <Secim etiket="Durum" bosSecenek="Hepsi" value={durum ?? ''} onChange={(o) => durumYaz(o.target.value === '' ? null : o.target.value as DemirbasDurumu)}
            secenekler={DEMIRBAS_DURUMLARI.map((d) => ({ deger: d, baslik: DEMIRBAS_DURUMU[d].etiket }))} />
        </div>
        {liste.isError ? (
          <DurumKutusu durum="hata" mesaj={hataIletisi(liste.error, 'Demirbaşlar alınamadı')} yenile={() => { void liste.refetch(); }} />
        ) : liste.isPending ? (
          <DurumKutusu durum="yukleniyor" />
        ) : gorunen.length === 0 ? (
          <DurumKutusu durum="bos" mesaj={hepsi.length === 0 ? 'Kayıtlı demirbaş yok.' : 'Aramaya uyan demirbaş yok.'} />
        ) : (
          <div className="tc-ii-kaydir">
            <table className="tc-ii-tablo">
              <thead>
                <tr>
                  <th scope="col">No</th><th scope="col">Tür</th><th scope="col">Marka ve model</th><th scope="col">Seri no</th><th scope="col">Durum</th>
                  <th scope="col">Kimde</th><th scope="col">Veriliş</th>
                </tr>
              </thead>
              <tbody>
                {gorunen.map((d) => (
                  <tr key={d.id} data-uyari={d.acikZimmet !== null && d.acikZimmet.kisiId === null ? 'yakin' : undefined}>
                    <td className="mono"><button type="button" className="tc-ii-bag" onClick={() => seciliYaz(d.id)}>{d.no}</button></td>
                    <td><Simge ad={DEMIRBAS_TURU[d.tur].simge} /> {DEMIRBAS_TURU[d.tur].etiket}</td>
                    <td>{d.markaModel ?? '—'}</td>
                    <td className="mono">{d.seriNo ?? '—'}</td>
                    <td><Rozet ton={DEMIRBAS_DURUMU[d.durum].ton}>{DEMIRBAS_DURUMU[d.durum].etiket}</Rozet></td>
                    <td>
                      {d.acikZimmet === null ? '—' : zimmetSahibi(d.acikZimmet)}
                      {d.acikZimmet !== null && d.acikZimmet.kisiId === null && <> <Rozet ton="uyari">Kişiye bağlanmamış</Rozet></>}
                    </td>
                    <td className="mono">{d.acikZimmet?.verilis == null ? '—' : tarihMetni(d.acikZimmet.verilis)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="tc-ii-soluk">Zimmetli demirbaşın durumu iadeyle değişir: sağlam iade boşa, hasarlı bakıma, kayıp kayba düşer.</p>
      </Kart>
      {acik !== null && (
        <DemirbasPenceresi demirbas={acik} yazar={yazar} kapat={() => seciliYaz(null)} duzenle={() => { formYaz({ demirbas: acik }); seciliYaz(null); }} />
      )}
      {form !== null && <DemirbasFormu demirbas={form.demirbas} kapat={() => formYaz(null)} />}
    </section>
  );
}

type Kip = 'ana' | 'zimmetle' | 'iade' | 'bagla';

function DemirbasPenceresi({ demirbas: d, yazar, kapat, duzenle }: { demirbas: Demirbas; yazar: boolean; kapat: () => void; duzenle: () => void }) {
  const istemci = useQueryClient();
  const { bildir } = useBildirim();
  const [kip, kipYaz] = useState<Kip>('ana');
  const [kisi, kisiYaz] = useState('');
  const [tarih, tarihYaz] = useState(bugunTarihi);
  const [iadeDurumu, iadeDurumuYaz] = useState<IadeDurumu>('saglam');
  const [metin, metinYaz] = useState('');
  const [hata, hataYaz] = useState<string | null>(null);
  const [bekliyor, bekliyorYaz] = useState(false);
  const gecmis = useQuery({
    queryKey: anahtarlar.zimmetGecmisi(d.id),
    queryFn: () => api.get<ZimmetlerCevabi>(`/idari-isler/demirbaslar/${d.id}/zimmetler`),
  });
  const kisiler = useQuery({
    queryKey: anahtarlar.kisiler,
    queryFn: () => api.get<KisiSecenekleriCevabi>('/idari-isler/kisi-secenekleri'),
    enabled: yazar && (kip === 'zimmetle' || kip === 'bagla'),
  });
  const z = d.acikZimmet;

  const gec = (k: Kip) => { kipYaz(k); kisiYaz(''); tarihYaz(bugunTarihi()); iadeDurumuYaz('saglam'); metinYaz(''); hataYaz(null); };

  const gonder = async () => {
    bekliyorYaz(true);
    hataYaz(null);
    const not = metin.trim() === '' ? null : metin.trim();
    try {
      if (kip === 'zimmetle') {
        await api.post<DemirbasCevabi>(`/idari-isler/demirbaslar/${d.id}/zimmetle`, { surum: d.surum, kisiId: Number(kisi), verilis: tarih, aciklama: not });
        bildir('tamam', `${d.no} zimmetlendi`);
      } else if (kip === 'iade' && z !== null) {
        await api.post<ZimmetCevabi>(`/idari-isler/zimmetler/${z.id}/iade`, { surum: z.surum, iade: tarih, iadeDurumu, iadeNotu: not });
        bildir('tamam', `${d.no} iade alındı`);
      } else if (kip === 'bagla' && z !== null) {
        await api.post<ZimmetCevabi>(`/idari-isler/zimmetler/${z.id}/kisiye-bagla`, { surum: z.surum, kisiId: Number(kisi) });
        bildir('tamam', `${d.no} zimmeti kişiye bağlandı`);
      }
      gec('ana');
    } catch (h) {
      hataYaz(yazmaIletisi(h, 'İşlem yapılamadı'));
    } finally {
      void istemci.invalidateQueries({ queryKey: anahtarlar.demirbaslar });
      bekliyorYaz(false);
    }
  };

  const eksik = (kip === 'zimmetle' || kip === 'bagla') && kisi === '' ? ['kişi'] : (kip === 'zimmetle' || kip === 'iade') && tarih === '' ? ['tarih'] : [];
  const kisiSecimi = (
    <Secim etiket="Kişi" bosSecenek={kisiler.isPending ? 'Yükleniyor' : 'Kişi seç'} value={kisi} onChange={(o) => kisiYaz(o.target.value)}
      secenekler={(kisiler.data?.kisiler ?? []).map((k) => ({ deger: String(k.id), baslik: k.ad }))} />
  );

  return (
    <Pencere acik kapat={kapat} baslik={`${d.no} ${DEMIRBAS_TURU[d.tur].etiket}`} tur="yan"
      alt={kip === 'ana' ? <Dugme onClick={kapat}>Kapat</Dugme> : (
        <span className="tc-ii-dugmeler">
          <Dugme onClick={() => gec('ana')}>Vazgeç</Dugme>
          <Dugme tur="birincil" simge="check" disabled={eksik.length > 0} yukleniyor={bekliyor} onClick={() => void gonder()}>
            {kip === 'zimmetle' ? 'Zimmetle' : kip === 'iade' ? 'İadeyi kaydet' : 'Bağla'}
          </Dugme>
        </span>
      )}
    >
      <div className="tc-ii-yigin">
        <p className="tc-ii-satir">
          <Rozet ton={DEMIRBAS_DURUMU[d.durum].ton}>{DEMIRBAS_DURUMU[d.durum].etiket}</Rozet>
          <span>{d.markaModel ?? '—'}</span>
          {d.seriNo !== null && <span className="mono">SN {d.seriNo}</span>}
          <span className="mono">{tlMetni(d.deger)}</span>
        </p>
        {d.aciklama !== null && <p className="tc-ii-soluk">{d.aciklama}</p>}
        {z !== null && (
          <p className="tc-ii-kutu">
            <strong>{zimmetSahibi(z)}</strong>
            {z.kisiId === null && <> <Rozet ton="uyari">Kişiye bağlanmamış</Rozet></>}
            <span className="tc-ii-soluk"> · {z.verilis === null ? 'veriliş tarihi yok' : `${tarihMetni(z.verilis)} tarihinden beri`}</span>
          </p>
        )}
        {yazar && kip === 'ana' && (
          <span className="tc-ii-dugmeler">
            {d.durum === 'bosta' && <Dugme tur="birincil" simge="plus" onClick={() => gec('zimmetle')}>Zimmetle</Dugme>}
            {z !== null && <Dugme simge="back" onClick={() => gec('iade')}>İade al</Dugme>}
            {z !== null && z.kisiId === null && <Dugme simge="check" onClick={() => gec('bagla')}>Kişiye bağla</Dugme>}
            <Dugme simge="wrench" onClick={duzenle}>Düzenle</Dugme>
          </span>
        )}
        {kip === 'zimmetle' && (
          <>
            {kisiSecimi}
            <Girdi etiket="Veriliş" type="date" required value={tarih} onChange={(o) => tarihYaz(o.target.value)} />
            <CokSatir etiket="Açıklama (isteğe bağlı)" maxLength={SINIR.not} value={metin} onChange={(o) => metinYaz(o.target.value)} />
          </>
        )}
        {kip === 'iade' && (
          <>
            <div className="tc-ii-secimler" role="radiogroup" aria-label="İade durumu">
              {IADE_DURUMLARI.map((i) => (
                <button key={i} type="button" role="radio" aria-checked={iadeDurumu === i} className="tc-ii-secim" onClick={() => iadeDurumuYaz(i)}>
                  {IADE_DURUMU[i]}
                </button>
              ))}
            </div>
            <Girdi etiket="İade tarihi" type="date" required value={tarih} onChange={(o) => tarihYaz(o.target.value)} />
            <CokSatir etiket="İade notu (isteğe bağlı)" maxLength={SINIR.not} value={metin} onChange={(o) => metinYaz(o.target.value)} />
          </>
        )}
        {kip === 'bagla' && (
          <>
            <p className="tc-ii-soluk">İK'daki ad: {z?.personelAdi ?? '—'}. Aynı kişiyi seçin.</p>
            {kisiSecimi}
          </>
        )}
        {hata !== null && <p className="tc-ii-hata" role="alert">{hata}</p>}
        <h3 className="tc-ii-ara-baslik">Zimmet geçmişi</h3>
        {gecmis.isError ? (
          <DurumKutusu durum="hata" mesaj={hataIletisi(gecmis.error, 'Geçmiş alınamadı')} yenile={() => { void gecmis.refetch(); }} />
        ) : gecmis.isPending ? (
          <DurumKutusu durum="yukleniyor" />
        ) : gecmis.data.zimmetler.length === 0 ? (
          <p className="tc-ii-soluk">Bu demirbaş hiç zimmetlenmedi.</p>
        ) : (
          <ul className="tc-ii-liste">{gecmis.data.zimmetler.map((g) => <GecmisSatiri key={g.id} z={g} />)}</ul>
        )}
      </div>
    </Pencere>
  );
}

function GecmisSatiri({ z }: { z: ZimmetKaydi }) {
  return (
    <li className="tc-ii-is">
      <span className="tc-ii-govde">
        <span className="tc-ii-satir">
          <strong>{zimmetSahibi(z)}</strong>
          {z.iade === null ? <Rozet ton="bilgi">Üzerinde</Rozet> : z.iadeDurumu !== null && <Rozet ton="pasif">{IADE_DURUMU[z.iadeDurumu]}</Rozet>}
          {z.ikdenTasindi && <Rozet ton="pasif">İK'dan</Rozet>}
        </span>
        <span className="tc-ii-soluk">
          <span className="mono">{z.verilis === null ? '—' : tarihMetni(z.verilis)}</span>
          {' – '}<span className="mono">{z.iade === null ? '' : tarihMetni(z.iade)}</span>
          {z.verenAd !== null && <> · Veren {z.verenAd}</>}
          {z.iadeAlanAd !== null && <> · Alan {z.iadeAlanAd}</>}
        </span>
        {z.aciklama !== null && <span className="tc-ii-soluk">{z.aciklama}</span>}
        {z.iadeNotu !== null && <span className="tc-ii-soluk">İade: {z.iadeNotu}</span>}
      </span>
    </li>
  );
}

function DemirbasFormu({ demirbas: d, kapat }: { demirbas: Demirbas | null; kapat: () => void }) {
  const istemci = useQueryClient();
  const gonderim = useKorumaliGonderim();
  const { bildir } = useBildirim();
  const [tur, turYaz] = useState<DemirbasTuru>(d?.tur ?? 'dizustu');
  const [markaModel, markaModelYaz] = useState(d?.markaModel ?? '');
  const [seriNo, seriNoYaz] = useState(d?.seriNo ?? '');
  const [deger, degerYaz] = useState(d?.deger ?? '');
  const [durum, durumYaz] = useState<ElleDurum>(d === null || d.durum === 'zimmetli' ? 'bosta' : d.durum);
  const [aciklama, aciklamaYaz] = useState(d?.aciklama ?? '');
  const [hata, hataYaz] = useState<string | null>(null);
  const [bekliyor, bekliyorYaz] = useState(false);
  const eksik = deger.trim() !== '' && !TUTAR.test(deger.trim()) ? ['değer'] : [];

  const gonder = async () => {
    bekliyorYaz(true);
    hataYaz(null);
    const govde: DemirbasEkleGovdesi = {
      tur, markaModel: markaModel.trim() === '' ? null : markaModel.trim(), seriNo: seriNo.trim() === '' ? null : seriNo.trim(),
      deger: deger.trim() === '' ? null : deger.trim().replace(',', '.'), aciklama: aciklama.trim() === '' ? null : aciklama.trim(),
    };
    try {
      const sonuc = d === null
        ? await gonderim<DemirbasCevabi>('/idari-isler/demirbaslar/ekle', govde)
        : await api.post<DemirbasCevabi>(`/idari-isler/demirbaslar/${d.id}/guncelle`, { surum: d.surum, ...govde, durum: d.durum === 'zimmetli' ? null : durum });
      bildir('tamam', `${sonuc.demirbas.no} ${d === null ? 'eklendi' : 'güncellendi'}`);
      kapat();
    } catch (h) {
      hataYaz(yazmaIletisi(h, 'Kaydedilemedi'));
    } finally {
      void istemci.invalidateQueries({ queryKey: anahtarlar.demirbaslar });
      bekliyorYaz(false);
    }
  };

  return (
    <Pencere acik kapat={kapat} baslik={d === null ? 'Demirbaş ekle' : `${d.no} düzenle`} tur="yan"
      alt={(
        <span className="tc-ii-dugmeler">
          <Dugme onClick={kapat}>Vazgeç</Dugme>
          <Dugme tur="birincil" simge="check" disabled={eksik.length > 0} yukleniyor={bekliyor} onClick={() => void gonder()}>Kaydet</Dugme>
        </span>
      )}
    >
      <div className="tc-ii-yigin">
        <Secim etiket="Tür" value={tur} secenekler={TURLER} onChange={(o) => turYaz(o.target.value as DemirbasTuru)} />
        <Girdi etiket="Marka ve model (isteğe bağlı)" maxLength={SINIR.markaModel} value={markaModel} onChange={(o) => markaModelYaz(o.target.value)} />
        <div className="tc-ii-iki">
          <Girdi etiket="Seri no (isteğe bağlı)" maxLength={SINIR.seriNo} value={seriNo} onChange={(o) => seriNoYaz(o.target.value)} />
          <Girdi etiket="Değer TL (isteğe bağlı)" inputMode="decimal" value={deger} onChange={(o) => degerYaz(o.target.value)} placeholder="30000,00" />
        </div>
        {d !== null && (d.durum === 'zimmetli'
          ? <p className="tc-ii-soluk">Durum: Zimmetli. İadeyle değişir.</p>
          : (
            <Secim etiket="Durum" value={durum} onChange={(o) => durumYaz(o.target.value as ElleDurum)} disabled={d.durum === 'hurda'}
              secenekler={ELLE_DURUMLAR.map((s) => ({ deger: s, baslik: DEMIRBAS_DURUMU[s].etiket }))} />
          ))}
        <CokSatir etiket="Açıklama (isteğe bağlı)" maxLength={SINIR.not} value={aciklama} onChange={(o) => aciklamaYaz(o.target.value)} />
        {eksik.length > 0 && <p className="tc-ii-soluk">Eksik: {eksik.join(', ')}</p>}
        {hata !== null && <p className="tc-ii-hata" role="alert">{hata}</p>}
      </div>
    </Pencere>
  );
}
