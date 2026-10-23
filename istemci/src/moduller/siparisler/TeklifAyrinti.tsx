import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { PlanTaslaklariCevabi, SiparisDonusumCevabi, TeklifAyrintiCevabi } from '#paylasilan/sozlesme/siparisler.ts';
import { CokSatir, Dugme, DurumKutusu, Girdi, Kart, OnayPenceresi, Pencere, Rozet, Tablo, useBildirim, type Sutun } from '../../ortak/arayuz/index.ts';
import { api, hataIletisi } from '../../ortak/veri/api.ts';
import { anahtarlar } from './anahtarlar.ts';
import { AtolyeTaslaklari } from './AtolyeTaslaklari.tsx';
import { ISKONTO_ONAY_ESIGI, PLAN_TASLAGI_GORUNUMU, TEKLIF_DURUMU, belirsizSayi, bosYap, bugun, miktarMetni, paraMetni, sayiGirdisi, tarihMetni, zamanMetni, BELIRSIZ_SAYI } from './gorunum.ts';
import { MalzemeSecici } from './MalzemeSecici.tsx';
import { SayfaBasligi } from './SayfaBasligi.tsx';
import { TeklifSurumu } from './TeklifSurumu.tsx';
import { TerminFiyat } from './TerminFiyat.tsx';
import { surumCakismasiMi, useFiyatGorur, useIskontoOnaylar, useKorumaliGonderim, useTerminDener, useTerminOnaylar, useYazabilir, yazmaIletisi } from './yazma.ts';
import './siparisler.css';

type Satir = TeklifAyrintiCevabi['satirlar'][number];
type Dialog = 'kabul' | 'iskonto' | 'termin' | 'revizyon' | 'red' | 'siparis';

const NOT_BASLIGI = { revizyon: 'Revizyon iste', red: 'Teklifi reddet' } as const;

export function TeklifAyrinti() {
  const id = Number(useParams()['id']);
  const gezin = useNavigate();
  const istemci = useQueryClient();
  const { bildir } = useBildirim();
  const yazabilir = useYazabilir();
  const iskontoOnaylar = useIskontoOnaylar();
  const fiyatGorur = useFiyatGorur();
  const terminDener = useTerminDener();
  const terminOnaylar = useTerminOnaylar();
  const donustur = useKorumaliGonderim();
  const [dialog, dialogYaz] = useState<Dialog | null>(null);
  const [not, notYaz] = useState('');
  const [hata, hataYaz] = useState<string | null>(null);
  const [kartSatiri, kartSatiriYaz] = useState<Satir | null>(null);
  const [donusum, donusumYaz] = useState({ musteriSiparisNo: '', siparisTarihi: bugun(), termin: '', kdvOrani: '20' });

  const teklif = useQuery({
    queryKey: anahtarlar.teklif(id),
    queryFn: () => api.get<TeklifAyrintiCevabi>(`/siparisler/teklifler/${id}`),
    enabled: Number.isInteger(id) && id > 0,
  });
  const taslaklar = useQuery({
    queryKey: anahtarlar.planTaslaklari(id),
    queryFn: () => api.get<PlanTaslaklariCevabi>(`/siparisler/teklifler/${id}/plan-taslaklari`),
    enabled: Number.isInteger(id) && id > 0,
  });

  const yenile = (cevap: TeklifAyrintiCevabi) => {
    istemci.setQueryData(anahtarlar.teklif(id), cevap);
    void istemci.invalidateQueries({ queryKey: anahtarlar.teklifListeleri });
  };
  const kapat = () => { dialogYaz(null); notYaz(''); hataYaz(null); };
  const hatayiYaz = (h: unknown, varsayilan: string) => {
    hataYaz(yazmaIletisi(h, varsayilan));
    if (surumCakismasiMi(h)) void istemci.invalidateQueries({ queryKey: anahtarlar.teklif(id) });
  };

  const komut = useMutation({
    mutationFn: ({ yol, govde }: { yol: string; govde: object; basari: string }) => api.post<TeklifAyrintiCevabi>(`/siparisler/teklifler/${id}/${yol}`, govde),
    onSuccess: (cevap, { basari }) => { yenile(cevap); void istemci.invalidateQueries({ queryKey: anahtarlar.planTaslaklari(id) }); void istemci.invalidateQueries({ queryKey: anahtarlar.atolyeTaslaklari }); bildir('tamam', basari); kapat(); },
    onError: (h) => hatayiYaz(h, 'İşlem yapılamadı.'),
  });
  const siparise = useMutation({
    mutationFn: (govde: object) => donustur<SiparisDonusumCevabi>(`/siparisler/teklifler/${id}/siparise-donustur`, govde),
    onSuccess: (cevap) => {
      yenile(cevap.teklif);
      void istemci.invalidateQueries({ queryKey: anahtarlar.siparisListeleri });
      bildir('tamam', 'Satış siparişi taslağı açıldı.');
      kapat();
      void gezin(`/siparisler/${cevap.siparisId}`);
    },
    onError: (h) => hatayiYaz(h, 'Sipariş açılamadı.'),
  });
  const kartBagla = useMutation({
    mutationFn: ({ satirId, malzemeNo, surum }: { satirId: number; malzemeNo: number; surum: number }) =>
      api.post<TeklifAyrintiCevabi>(`/siparisler/teklifler/${id}/satirlar/${satirId}/kart-bagla`, { surum, malzemeNo }),
    onSuccess: (cevap) => { yenile(cevap); bildir('tamam', 'Malzeme seçildi.'); kartSatiriYaz(null); },
    onError: (h) => { kartSatiriYaz(null); bildir('hata', yazmaIletisi(h, 'Malzeme seçilemedi.')); if (surumCakismasiMi(h)) void istemci.invalidateQueries({ queryKey: anahtarlar.teklif(id) }); },
  });

  if (teklif.isPending) return <DurumKutusu durum="yukleniyor" />;
  if (teklif.isError) return <DurumKutusu durum="hata" mesaj={hataIletisi(teklif.error, 'Teklif alınamadı')} yenile={() => { void teklif.refetch(); }} />;
  const t = teklif.data;
  const durum = TEKLIF_DURUMU[t.durum];
  const son = t.surumler.at(-1) ?? null;
  const gosterilen = t.kabulSurumu === null ? son : (t.surumler.find((s) => s.surumNo === t.kabulSurumu) ?? son);
  const kartsiz = t.satirlar.filter((s) => s.malzemeNo === null).length;
  const surumVerilir = t.durum === 'yeni' || t.durum === 'onay-bekliyor' || t.durum === 'verildi' || t.durum === 'revizyon';
  const kartDegisir = t.durum !== 'red' && t.durum !== 'siparis';

  const sutunlar: Sutun<Satir>[] = [
    { anahtar: 'tanim', baslik: 'Kalem', hucre: (s) => s.tanim },
    {
      anahtar: 'kart',
      baslik: 'Malzeme kartı',
      hucre: (s) => (
        <span className="tc-sp-kart-sec">
          {s.malzemeNo === null ? <Rozet ton="uyari">Kart yok</Rozet> : <span className="mono">{s.malzemeKodu ?? `Kart ${s.malzemeNo}`}</span>}
          {yazabilir && kartDegisir && (
            <Dugme simge="search" aria-label={`${s.tanim} için malzeme ${s.malzemeNo === null ? 'seç' : 'değiştir'}`} onClick={() => kartSatiriYaz(s)} />
          )}
        </span>
      ),
    },
    { anahtar: 'miktar', baslik: 'Miktar', hizala: 'sag', kirilmaz: true, hucre: (s) => `${miktarMetni(s.miktar)}${s.birim ? ` ${s.birim}` : ''}` },
  ];

  // 63 b: onay bekleyen teklifte iskonto ve termin onayı ayrı bekler; hangisinin beklendiği sürümden ve plan taslağından okunur.
  const bekleyenTaslak = taslaklar.data?.taslaklar.find((x) => x.gorunum === 'onay-bekliyor') ?? null;
  const iskontoBekler = t.durum === 'onay-bekliyor' && son !== null && son.iskontoOnaylayan === null && son.iskontoOrani !== null && Number(son.iskontoOrani) > ISKONTO_ONAY_ESIGI;
  const iskontoOnaylanir = iskontoOnaylar && t.durum === 'onay-bekliyor' && son !== null && (son.iskontoOrani === null || iskontoBekler);
  const terminOnaylanir = terminOnaylar && t.durum === 'onay-bekliyor' && bekleyenTaslak !== null;
  const islemler = (yazabilir || iskontoOnaylanir || terminOnaylanir) && (
    <>
      {iskontoOnaylanir && <Dugme tur="birincil" simge="check" onClick={() => dialogYaz('iskonto')}>İskontoyu onayla</Dugme>}
      {terminOnaylanir && <Dugme tur="birincil" simge="gantt" onClick={() => dialogYaz('termin')}>Termini onayla</Dugme>}
      {yazabilir && t.durum === 'yeni' && <Dugme simge="edit" onClick={() => { void gezin(`/siparisler/teklifler/${t.id}/duzenle`); }}>Düzenle</Dugme>}
      {yazabilir && t.durum === 'verildi' && son && <Dugme tur="birincil" simge="check" onClick={() => dialogYaz('kabul')}>Müşteri kabulünü kaydet</Dugme>}
      {yazabilir && t.durum === 'verildi' && <Dugme simge="rotate" onClick={() => dialogYaz('revizyon')}>Revizyon iste</Dugme>}
      {yazabilir && t.durum === 'kabul' && <Dugme tur="birincil" simge="next" onClick={() => { donusumYaz((d) => (d.termin === '' && t.istenenTarih !== null ? { ...d, termin: t.istenenTarih } : d)); dialogYaz('siparis'); }}>Satış siparişine dönüştür</Dugme>}
      {yazabilir && surumVerilir && <Dugme tur="tehlike" simge="x" onClick={() => dialogYaz('red')}>Reddet</Dugme>}
    </>
  );

  const notOnayla = () => {
    if (dialog !== 'revizyon' && dialog !== 'red') return;
    if (not.trim() === '') { hataYaz('Not zorunlu.'); return; }
    hataYaz(null);
    komut.mutate({
      yol: dialog === 'red' ? 'reddet' : 'revizyon-iste',
      govde: { surum: t.surum, not: not.trim() },
      basari: dialog === 'red' ? 'Teklif reddedildi.' : 'Revizyon istendi.',
    });
  };
  const siparisOnayla = () => {
    const d = donusum;
    if (d.siparisTarihi === '' || d.termin === '' || d.kdvOrani.trim() === '') { hataYaz('Sipariş tarihi, termin ve KDV oranı zorunlu.'); return; }
    if (belirsizSayi(d.kdvOrani)) { hataYaz(BELIRSIZ_SAYI); return; }
    hataYaz(null);
    siparise.mutate({ surum: t.surum, musteriSiparisNo: bosYap(d.musteriSiparisNo), siparisTarihi: d.siparisTarihi, termin: d.termin, kdvOrani: sayiGirdisi(d.kdvOrani) });
  };

  return (
    <section className="tc-sp">
      <SayfaBasligi
        baslik={t.baslik}
        alt={`${t.firmaAd ?? `Firma ${t.firmaId}`}, ${zamanMetni(t.olusturma)} tarihinde açıldı. İstenen teslim: ${tarihMetni(t.istenenTarih)}.`}
        ek={(<><span className="tc-sp-belge mono">{t.no}</span><Rozet ton={durum.ton}>{durum.etiket}</Rozet></>)}
        geriYol="/siparisler/teklifler"
        geriMetni="Tekliflere dön"
        islemler={islemler || undefined}
      />

      {t.durum === 'yeni' && (
        <p className="tc-sp-bildirim" role="status">
          <strong>Fiyat bekleniyor</strong> {fiyatGorur ? 'Kalemlere fiyat girip ilk sürümü verin.' : 'Fiyatı fiyat yetkisi olan girip ilk sürümü verir.'}
        </p>
      )}
      {t.durum === 'onay-bekliyor' && son && (iskontoBekler || bekleyenTaslak === null) && (
        <p className="tc-sp-bildirim" role="status">
          <strong>İskonto onayı bekliyor</strong>
          {` Sürüm ${son.surumNo} %${ISKONTO_ONAY_ESIGI} sınırını aşıyor; müdür onaylayınca müşteriye gider. Onaylanmazsa yeni sürüm verin ya da reddedin.`}
        </p>
      )}
      {t.durum === 'onay-bekliyor' && bekleyenTaslak !== null && (
        <p className="tc-sp-bildirim" role="status">
          <strong>Termin onayı bekliyor</strong>
          {` İstenen termin ${tarihMetni(bekleyenTaslak.termin)} ${bekleyenTaslak.gecikenSayisi} siparişi geciktiriyor; plancı onaylayınca teklif müşteriye gider. Satış taslağı o zamana kadar planda yer tutar.`}
        </p>
      )}
      {t.durum === 'verildi' && son && (
        <p className="tc-sp-bildirim" role="status"><strong>Teklif müşteride</strong> Müşteri kabulünü telefon ya da e-postayla bildirdiyse buradan kaydedin.</p>
      )}
      {t.durum === 'revizyon' && <p className="tc-sp-bildirim" role="status"><strong>Müşteri revizyon istedi</strong> {t.not ?? 'Not bırakılmadı.'}</p>}
      {t.durum === 'kabul' && (
        <p className="tc-sp-bildirim tc-sp-bildirim-tamam" role="status">
          <strong>{`Müşteri sürüm ${t.kabulSurumu ?? ''} teklifini kabul etti`}</strong>
          {' '}Siparişe dönüştürün; fiyatlar kabul edilen sürümden alınır.
          {kartsiz > 0 && ` ${kartsiz} satırda malzeme seçilmedi; dönüştürmeden önce malzemeden seçin.`}
        </p>
      )}
      {t.durum === 'red' && <p className="tc-sp-bildirim tc-sp-bildirim-hata" role="status"><strong>Teklif reddedildi</strong> {t.not ?? 'Gerekçe belirtilmedi.'}</p>}
      {t.durum === 'siparis' && (
        <p className="tc-sp-bildirim tc-sp-bildirim-tamam" role="status">
          <strong>Satış siparişi açıldı</strong>
          {' '}
          {t.siparisId !== null && <Link to={`/siparisler/${t.siparisId}`}>Siparişe git</Link>}
        </p>
      )}

      <div className="tc-sp-iki">
        <div className="tc-sp-sutun">
          <Kart baslik="Müşterinin talebi">
            <Tablo etiket="Talep kalemleri" sutunlar={sutunlar} satirlar={t.satirlar} satirAnahtari={(s) => s.id} bosMesaj="Satır yok." />
            {t.aciklama && <p className="tc-sp-not">{t.aciklama}</p>}
          </Kart>
          {gosterilen && <TeklifSurumu teklif={t} surum={gosterilen} kabul={t.kabulSurumu === gosterilen.surumNo} />}
          {yazabilir && fiyatGorur && surumVerilir && <TerminFiyat key={t.surum} teklif={t} />}
        </div>
        <div className="tc-sp-sutun">
          {(taslaklar.data?.taslaklar.length ?? 0) > 0 && (
            <Kart baslik="Plan taslakları">
              <ul className="tc-sp-surumler" aria-label="Plan taslakları">
                {taslaklar.data?.taslaklar.map((x) => (
                  <li key={x.id}>
                    <span>
                      <Rozet ton={PLAN_TASLAGI_GORUNUMU[x.gorunum].ton}>{PLAN_TASLAGI_GORUNUMU[x.gorunum].etiket}</Rozet>
                      {' '}<span className="tc-sp-soluk">{`${x.surumNo === null ? '' : `Sürüm ${x.surumNo} · `}${zamanMetni(x.olusturma)}`}</span>
                    </span>
                    <span>
                      {`Termin ${tarihMetni(x.termin)}`}
                      {x.gecerlilik !== null && x.tur === 'satis' && ` · ${tarihMetni(x.gecerlilik)} tarihine kadar`}
                      {x.karOrani !== null && ` · %${miktarMetni(x.karOrani)} kâr`}
                      {x.onaylayan !== null && <> <Rozet ton="bilgi">{`Termin onayı: ${x.onaylayan}`}</Rozet></>}
                    </span>
                  </li>
                ))}
              </ul>
            </Kart>
          )}
          <Kart baslik="Sürüm geçmişi">
            {t.surumler.length === 0 ? (
              <p className="tc-sp-soluk">Henüz sürüm verilmedi.</p>
            ) : (
              <ul className="tc-sp-surumler">
                {t.surumler.slice().reverse().map((s) => (
                  <li key={s.surumNo}>
                    <span><strong>{`Sürüm ${s.surumNo}`}</strong> <span className="tc-sp-soluk">{zamanMetni(s.olusturma)}</span></span>
                    <span>{fiyatGorur && paraMetni(s.toplam, t.paraBirimi)}{s.iskontoOnaylayan !== null && <> <Rozet ton="bilgi">{`İskonto onayı: ${s.iskontoOnaylayan}`}</Rozet></>}{t.kabulSurumu === s.surumNo && <> <Rozet ton="tamam">Kabul edilen</Rozet></>}</span>
                  </li>
                ))}
              </ul>
            )}
          </Kart>
        </div>
      </div>
      {(terminDener || terminOnaylar) && <AtolyeTaslaklari />}

      <OnayPenceresi
        acik={dialog === 'kabul' && son !== null}
        baslik="Müşteri kabulünü kaydet"
        onayMetni="Kabulü kaydet"
        yukleniyor={komut.isPending}
        vazgec={kapat}
        onayla={() => { if (son) komut.mutate({ yol: 'kabul', govde: { surum: t.surum, surumNo: son.surumNo }, basari: 'Kabul kaydedildi.' }); }}
      >
        <div className="tc-sp-yigin">
          <p>{`${t.no}: müşteri sürüm ${son?.surumNo ?? ''} teklifini kabul etti.`}</p>
          {hata !== null && <p className="tc-sp-hata" role="alert">{hata}</p>}
        </div>
      </OnayPenceresi>

      <OnayPenceresi
        acik={dialog === 'iskonto' && son !== null}
        baslik="İskontoyu onayla"
        onayMetni="Onayla"
        yukleniyor={komut.isPending}
        vazgec={kapat}
        onayla={() => komut.mutate({ yol: 'iskonto-onayla', govde: { surum: t.surum }, basari: 'İskonto onaylandı; teklif müşteride.' })}
      >
        <div className="tc-sp-yigin">
          <p>{`${t.no} sürüm ${son?.surumNo ?? ''}: %${son?.iskontoOrani === null || son === null ? '' : miktarMetni(son.iskontoOrani)} iskonto onaylanır ve teklif müşteriye gider.`}</p>
          {hata !== null && <p className="tc-sp-hata" role="alert">{hata}</p>}
        </div>
      </OnayPenceresi>

      <OnayPenceresi
        acik={dialog === 'termin' && bekleyenTaslak !== null}
        baslik="Termini onayla"
        onayMetni="Onayla"
        yukleniyor={komut.isPending}
        vazgec={kapat}
        onayla={() => komut.mutate({ yol: 'termin-onayla', govde: { surum: t.surum }, basari: 'Termin onaylandı.' })}
      >
        <div className="tc-sp-yigin">
          <p>{`${t.no}: ${tarihMetni(bekleyenTaslak?.termin ?? null)} termini ${bekleyenTaslak?.gecikenSayisi ?? 0} siparişi geciktirir. Onaylanınca satış taslağı planda kalır.`}</p>
          {hata !== null && <p className="tc-sp-hata" role="alert">{hata}</p>}
        </div>
      </OnayPenceresi>

      <Pencere
        acik={dialog === 'revizyon' || dialog === 'red'}
        kapat={kapat}
        baslik={dialog === 'red' ? NOT_BASLIGI.red : NOT_BASLIGI.revizyon}
        alt={(
          <>
            <Dugme onClick={kapat} disabled={komut.isPending}>Vazgeç</Dugme>
            <Dugme tur={dialog === 'red' ? 'tehlike' : 'birincil'} onClick={notOnayla} yukleniyor={komut.isPending}>{dialog === 'red' ? 'Reddet' : 'Revizyon iste'}</Dugme>
          </>
        )}
      >
        <div className="tc-sp-yigin">
          <CokSatir etiket={dialog === 'red' ? 'Red gerekçesi' : 'Revizyon notu'} required value={not} onChange={(o) => notYaz(o.target.value)} maxLength={500} />
          {hata !== null && <p className="tc-sp-hata" role="alert">{hata}</p>}
        </div>
      </Pencere>

      <Pencere
        acik={dialog === 'siparis'}
        kapat={kapat}
        baslik="Satış siparişine dönüştür"
        alt={(
          <>
            <Dugme onClick={kapat} disabled={siparise.isPending}>Vazgeç</Dugme>
            <Dugme tur="birincil" simge="next" onClick={siparisOnayla} yukleniyor={siparise.isPending}>Taslak sipariş aç</Dugme>
          </>
        )}
      >
        <div className="tc-sp-yigin">
          <p className="tc-sp-ipucu">Kalemler ve iskontolu fiyatlar kabul edilen sürümden alınır; sipariş taslak olarak açılır.</p>
          <Girdi etiket="Müşteri sipariş no" autoComplete="off" value={donusum.musteriSiparisNo} onChange={(o) => donusumYaz({ ...donusum, musteriSiparisNo: o.target.value })} />
          <Girdi etiket="Sipariş tarihi" type="date" required value={donusum.siparisTarihi} onChange={(o) => donusumYaz({ ...donusum, siparisTarihi: o.target.value })} />
          <Girdi etiket="Termin" type="date" required value={donusum.termin} onChange={(o) => donusumYaz({ ...donusum, termin: o.target.value })} />
          <Girdi etiket="KDV oranı (%)" required inputMode="decimal" autoComplete="off" value={donusum.kdvOrani} onChange={(o) => donusumYaz({ ...donusum, kdvOrani: o.target.value })} />
          {hata !== null && <p className="tc-sp-hata" role="alert">{hata}</p>}
        </div>
      </Pencere>

      <MalzemeSecici
        acik={kartSatiri !== null}
        kapat={() => kartSatiriYaz(null)}
        sec={(kart) => { if (kartSatiri) kartBagla.mutate({ satirId: kartSatiri.id, malzemeNo: kart.no, surum: t.surum }); else kartSatiriYaz(null); }}
      />
    </section>
  );
}
