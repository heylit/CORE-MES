import { useMemo, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  CokSatir, Dugme, DurumKutusu, FormPenceresi, Girdi, IsaretKutusu, Pencere, Rozet, Secim, useBildirim, type Secenek,
} from '../../../ortak/arayuz/index.ts';
import { hataIletisi } from '../../../ortak/veri/api.ts';
import { useForm } from '../../../ortak/veri/form.ts';
import { yeniIstekKimligi } from '../../../ortak/veri/istek-kimligi.ts';
import {
  acikKalemler, akisKomutu, aktifHesaplar, bosDegerler, cekDugmeleri, cekDurumKomutu, cekEkAlanIster, duzenliOdendiKomutu, firmaCoz,
  firmaEtiketleri, gecerliKdvOranlari, OLAY_KATEGORILERI, OLAYLAR, olayTarafi, paraBirimleri, planAlloc, takiptekiCekler,
  type AkisDegerleri, type CekDurumu, type KomutSonucu, type OdemeSekli, type OlayTuru,
} from './akislar.ts';
import { kisaTarih, paraMetni, tl } from './bicim.ts';
import { firmaEtiketi, HESAP_TURU_ADI, sayi, TEVKIFATLAR, type Hesap, type HazirVeri, type SunucuCeki } from './donustur.ts';
import { addDays, diffDays, gross, ymLong } from './motor.ts';
import { OlaySecici } from './OlaySecici.tsx';
import { satisSevkleriOku, satisSiparisleriOku, useFinansKomutu, useFinansYetkisi, type FinansVerisi } from './veri.ts';

// Sunucunun alan adı formdakiyle aynı değil: hata ilgili alanın altına düşsün diye çevrilir.
const SUNUCU_ALANLARI: Record<string, keyof AkisDegerleri> = {
  firmaId: 'party', tutar: 'amount', belgeTarihi: 'date', tarih: 'date', vade: 'due', kdvOrani: 'kdv', hesapId: 'hesap', kur: 'pbKur', aciklama: 'desc',
  siparisId: 'siparis', sevkiyatIsiId: 'sevk', gercekBakiye: 'gercek', kaynakHesapId: 'kaynak', hedefHesapId: 'hedef', satisTutari: 'satisTutari', alisTutari: 'alisTutari',
};

// Ön denetim iletisinin form hatalarındaki yeri: hiçbir alana bağlı değildir.
const ON_DENETIM = '_on';

const VADE_KISAYOLLARI = [0, 15, 30, 45, 60, 90] as const;

// Kayıt çekmecesi: önce "Ne oldu?", sonra olayın formu; ikisi de yan penceredir (prototipteki çekmece). Form penceresi
// kaydedilmemiş değişiklikte kapatmadan önce sorar; seçici ve çekin durumu form değildir, düz pencerede açılır.
export function KayitCekmecesi({ acik, tur, ilk, finans, kapat, sec }: {
  acik: boolean;
  tur: OlayTuru | null;
  ilk?: Partial<AkisDegerleri> | undefined;
  finans: FinansVerisi;
  kapat: () => void;
  sec: (tur: OlayTuru | null) => void;
}) {
  if (tur === null || tur === 'cekdurum') {
    return (
      <Pencere acik={acik} kapat={kapat} baslik={tur ? OLAYLAR[tur].baslik : 'Ne oldu?'} tur="yan">
        {tur === null ? <OlaySecici sec={(t) => sec(t)} /> : <CekDurumu finans={finans} geri={() => sec(null)} />}
      </Pencere>
    );
  }
  return <KayitFormu key={tur} acik={acik} tur={tur} ilk={ilk} finans={finans} kapat={kapat} geri={() => sec(null)} />;
}

// Tek seçimli düğme şeridi (prototipte .seg ve .chips): seçili olan aria-pressed taşır.
function Serit<D extends string>({ etiket, secenekler, secili, sec }: { etiket: string; secenekler: readonly (readonly [D, string])[]; secili: D; sec: (d: D) => void }) {
  return (
    <div className="tc-fy-serit" role="group" aria-label={etiket}>
      <span className="tc-fy-serit-etiket">{etiket}</span>
      <div className="tc-fy-serit-dugmeler">
        {secenekler.map(([d, b]) => (
          <button key={d} type="button" className="tc-fy-serit-dugme" aria-pressed={d === secili} onClick={() => sec(d)}>{b}</button>
        ))}
      </div>
    </div>
  );
}

const hesapSecenekleri = (V: HazirVeri, turler?: readonly Hesap['tur'][] | null, pb?: string | null): Secenek[] =>
  aktifHesaplar(V, turler).filter((h) => !pb || h.paraBirimi === pb).map((h) => ({ deger: String(h.id), baslik: `${h.ad} · ${HESAP_TURU_ADI[h.tur]} · ${h.paraBirimi}` }));

export function KayitFormu({ acik, tur, ilk, finans, kapat, geri }: {
  acik: boolean;
  tur: Exclude<OlayTuru, 'cekdurum'>;
  ilk?: Partial<AkisDegerleri> | undefined;
  finans: FinansVerisi;
  kapat: () => void;
  geri: () => void;
}) {
  const { V, motor } = finans;
  const { bildir } = useBildirim();
  const komut = useFinansKomutu();
  // Tekrar korumalı uçta aynı formdan yeniden gönderim tek kayıt açar: kimlik form açılırken üretilir.
  const [istekKimligi] = useState(yeniIstekKimligi);
  const olay = OLAYLAR[tur];
  const side = olayTarafi(tur);
  const form = useForm<AkisDegerleri, unknown>({
    ilk: { ...bosDegerler(tur, motor.bugun), hesap: aktifHesaplar(V)[0]?.id.toString() ?? '', ...ilk },
    hataIletisi: 'Kayıt yapılamadı.',
    alanEsle: (alan) => SUNUCU_ALANLARI[alan.split('.')[0] ?? ''] ?? null,
    // Ön denetim (firma yok, tutar yok) sunucuya gitmez; iletisi formun genel hatası olarak görünür.
    dogrula: (d): Record<string, string> => { const s = akisKomutu(tur, d, V, motor); return 'hata' in s ? { [ON_DENETIM]: s.hata } : {}; },
    kaydet: async (d) => {
      const sonuc = akisKomutu(tur, d, V, motor);
      if ('hata' in sonuc) throw new Error(sonuc.hata);
      await komut.mutateAsync({ komutlar: sonuc.komutlar, istekKimligi });
      return sonuc.komutlar.at(-1)?.basari;
    },
    basarili: (ileti) => { bildir('tamam', typeof ileti === 'string' ? ileti : 'Kaydedildi.'); kapat(); },
  });
  const d = form.degerler;
  const dg = form.degistir;

  const onDenetim = form.hata(ON_DENETIM);

  return (
    <FormPenceresi acik={acik} kapat={kapat} baslik={olay.baslik} form={form} kaydetMetni={GONDER_ETIKETI[tur]}>
      <div className="tc-fy-form">
        <div className="tc-fy-form-ust">
          <Dugme simge="chev-left" onClick={geri}>Olay seç</Dugme>
          <p className="tc-fy-not">{olay.aciklama}</p>
        </div>
        <FormGovdesi tur={tur} d={d} dg={dg} hata={form.hata} V={V} finans={finans} side={side} />
        {onDenetim && <DurumKutusu durum="hata" mesaj={onDenetim} />}
      </div>
    </FormPenceresi>
  );
}


const GONDER_ETIKETI: Record<Exclude<OlayTuru, 'cekdurum'>, string> = {
  satis: 'Satışı kaydet', alis: 'Alışı kaydet', tahsilat: 'Tahsilatı kaydet', cekal: 'Çeki kaydet', odeme: 'Ödemeyi kaydet', cekver: 'Çeki kaydet',
  sabit: 'Ödemeyi kaydet', banka: 'Bakiyeyi eşitle', virman: 'Aktarımı kaydet', mahsup: 'Mahsup et', avans: 'Mahsup et',
  iadesat: 'İadeyi kaydet', iadealis: 'İadeyi kaydet',
};

interface GovdeOzellikleri {
  tur: Exclude<OlayTuru, 'cekdurum'>;
  d: AkisDegerleri;
  dg: (yama: Partial<AkisDegerleri>) => void;
  hata: (yol: string) => string | undefined;
  V: HazirVeri;
  finans: FinansVerisi;
  side: 'gelir' | 'gider';
}

function FormGovdesi(p: GovdeOzellikleri) {
  switch (p.tur) {
    case 'satis': case 'alis': return <FaturaAlanlari {...p} />;
    case 'tahsilat': case 'odeme': case 'cekal': case 'cekver': return <OdemeAlanlari {...p} />;
    case 'sabit': return <SabitAlanlari {...p} />;
    case 'banka': return <BankaAlanlari {...p} />;
    case 'virman': return <VirmanAlanlari {...p} />;
    case 'mahsup': return <MahsupAlanlari {...p} />;
    case 'avans': return <AvansAlanlari {...p} />;
    case 'iadesat': case 'iadealis': return <IadeAlanlari {...p} />;
  }
}

/* ---------- Ortak alan parçaları ---------- */
function FirmaAlani({ d, dg, hata, V, side, etiket }: GovdeOzellikleri & { etiket: string }) {
  const liste = useMemo(() => firmaEtiketleri(V, side), [V, side]);
  const kimlik = `tc-fy-firmalar-${side}`;
  return (
    <>
      <Girdi etiket={etiket} required list={kimlik} value={d.party} hata={hata('party')} autoComplete="off"
        placeholder="Adını yazın veya listeden seçin" onChange={(e) => dg({ party: e.target.value, secili: [], siparis: '', sevk: '' })} />
      <datalist id={kimlik}>{liste.map((f) => <option key={f} value={f} />)}</datalist>
    </>
  );
}

function ParaBirimiAlani({ d, dg, V }: GovdeOzellikleri) {
  return (
    <>
      <Secim etiket="Para birimi" value={d.pb} secenekler={paraBirimleri(V).map((p) => ({ deger: p, baslik: p }))}
        onChange={(e) => { const pb = e.target.value; dg({ pb, pbKur: pb === 'TRY' ? '' : String(V.kurlar[pb]?.kur ?? '') }); }} />
      {d.pb !== 'TRY' && (
        <Girdi etiket={`Kur (1 ${d.pb} = ? TRY)`} type="number" min="0" step="0.000001" inputMode="decimal" value={d.pbKur} onChange={(e) => dg({ pbKur: e.target.value })} />
      )}
    </>
  );
}

function CekAlanlari({ d, dg, side, senetSecimi }: GovdeOzellikleri & { senetSecimi?: boolean }) {
  return (
    <div className="tc-fy-grup">
      {d.method !== 'senet' && <Girdi etiket="Banka" value={d.cbank} placeholder="Banka adı" onChange={(e) => dg({ cbank: e.target.value })} />}
      <Girdi etiket="Seri / numara" value={d.cno} onChange={(e) => dg({ cno: e.target.value })} />
      <Girdi etiket={side === 'gelir' ? 'Çekin / senedin vadesi (paranın bankaya geçeceği gün)' : 'Çekin / senedin vadesi (hesapta para bulunması gereken gün)'}
        type="date" value={d.cdue} onChange={(e) => dg({ cdue: e.target.value })} />
      {senetSecimi && (
        <Secim etiket="Belge türü" value={d.ckind} secenekler={[{ deger: 'Çek', baslik: 'Çek' }, { deger: 'Senet', baslik: 'Senet' }]}
          onChange={(e) => dg({ ckind: e.target.value === 'Senet' ? 'Senet' : 'Çek' })} />
      )}
    </div>
  );
}

// Firmanın açık bakiyesi (prototipte partyHint).
function FirmaIpucu({ d, finans, side }: GovdeOzellikleri) {
  const party = d.party.trim();
  if (!party) return null;
  const acik = acikKalemler(finans.motor, side, party);
  if (!acik.length) return <p className="tc-fy-not">{party} için açık kalem yok.</p>;
  const gec = acik.filter((t) => t.due < finans.motor.bugun);
  return (
    <p className="tc-fy-not">
      Açık {side === 'gelir' ? 'alacak' : 'borç'} {tl(acik.reduce((t, x) => t + gross(x), 0))} ({acik.length} kalem)
      {gec.length > 0 && <> · <Rozet ton="uyari">{gec.length} gecikmiş</Rozet></>}
    </p>
  );
}

/* ---------- Satış ve alış ---------- */
function FaturaAlanlari(p: GovdeOzellikleri) {
  const { d, dg, hata, V, finans, side, tur } = p;
  const kategoriler = tur === 'satis' ? OLAY_KATEGORILERI.satis : OLAY_KATEGORILERI.alis;
  const kdvler = gecerliKdvOranlari(V, finans.motor.bugun);
  const k = sayi(d.kdv), a = sayi(d.amount);
  const net = d.incl ? a / (1 + k / 100) : a;
  const yontemler: readonly (readonly [OdemeSekli, string])[] = side === 'gelir'
    ? [['vadeli', 'Vadeli, sonra gelecek'], ['pesin', 'Peşin, para geldi'], ['cek', 'Çek / senet aldım']]
    : [['vadeli', 'Vadeli, sonra ödeyeceğim'], ['pesin', 'Hemen ödedim'], ['cek', 'Çek / senet verdim']];
  return (
    <div className="tc-fy-alanlar">
      <FirmaAlani {...p} etiket={side === 'gelir' ? 'Müşteri' : 'Tedarikçi'} />
      <FirmaIpucu {...p} />
      <Serit etiket={side === 'gelir' ? 'Ne sattınız?' : 'Ne için?'} secenekler={kategoriler} secili={d.cat} sec={(cat) => dg({ cat })} />
      <Girdi etiket="Fatura tarihi" type="date" required value={d.date} hata={hata('date')} onChange={(e) => dg({ date: e.target.value })} />
      <Girdi etiket="Fatura no / not" value={d.desc} placeholder="İsteğe bağlı" onChange={(e) => dg({ desc: e.target.value })} />
      {tur === 'satis' && <SiparisAlanlari {...p} />}
      <Girdi etiket="Tutar" type="number" min="0" step="0.01" inputMode="decimal" required value={d.amount} hata={hata('amount')} placeholder="0,00"
        onChange={(e) => dg({ amount: e.target.value })} />
      <Secim etiket="KDV" value={d.kdv} hata={hata('kdv')} secenekler={kdvler.map((o) => ({ deger: String(o), baslik: o ? `%${o}` : 'KDV yok' }))}
        onChange={(e) => dg({ kdv: e.target.value })} />
      <ParaBirimiAlani {...p} />
      <Secim etiket="Tevkifat" value={d.tevk} secenekler={TEVKIFATLAR.map(([deger, baslik]) => ({ deger, baslik }))} onChange={(e) => dg({ tevk: e.target.value })} />
      <IsaretKutusu etiket="Girdiğim tutar KDV dahil" checked={d.incl} onChange={(e) => dg({ incl: e.target.checked })} />
      {a > 0 && <p className="tc-fy-not">KDV hariç {paraMetni(net, d.pb)} · KDV dahil {paraMetni(net * (1 + k / 100), d.pb)}</p>}
      <Serit etiket={side === 'gelir' ? 'Para ne zaman geliyor?' : 'Ne zaman ödenecek?'} secenekler={yontemler} secili={d.method} sec={(method) => dg({ method })} />
      {d.method === 'vadeli' && (
        <div className="tc-fy-grup">
          <Girdi etiket="Vade tarihi" type="date" value={d.due} hata={hata('due')} onChange={(e) => dg({ due: e.target.value })} />
          <div className="tc-fy-cipler" role="group" aria-label="Vade kısayolu">
            {VADE_KISAYOLLARI.map((g) => (
              <button key={g} type="button" className="tc-fy-serit-dugme" onClick={() => dg({ due: addDays(d.date || finans.motor.bugun, g) })}>{g ? `+${g} gün` : 'Bugün'}</button>
            ))}
          </div>
        </div>
      )}
      {d.method === 'pesin' && <Secim etiket="Hesap" value={d.hesap} hata={hata('hesap')} bosSecenek="Hesap seçin" secenekler={hesapSecenekleri(V)} onChange={(e) => dg({ hesap: e.target.value })} />}
      {d.method === 'cek' && <CekAlanlari {...p} senetSecimi />}
    </div>
  );
}

// 260 a ve 302 a: satış faturası firmanın siparişine ve o siparişin sevkine bağlanabilir; faturalı sevk seçilemez (FNS-68).
function SiparisAlanlari({ d, dg, V }: GovdeOzellikleri) {
  const fr = firmaCoz(V, d.party, 'gelir');
  const firmaId = 'id' in fr ? fr.id : null;
  const siparisler = useQuery({ queryKey: ['finans', 'yeni', 'satis-siparisleri', firmaId], queryFn: () => satisSiparisleriOku(firmaId!), enabled: firmaId !== null });
  const siparisId = d.siparis ? Number(d.siparis) : null;
  const sevkler = useQuery({ queryKey: ['finans', 'yeni', 'satis-sevkleri', siparisId], queryFn: () => satisSevkleriOku(siparisId!), enabled: siparisId !== null });
  const DURUM: Record<string, string> = { onayli: 'Onaylı', kapandi: 'Kapandı' };
  const SEVK: Record<string, string> = { havuzda: 'Bekliyor', planlandi: 'Planlandı', yolda: 'Yolda', tamamlandi: 'Teslim edildi' };
  const sevkFaturasi = (id: number) => V.belgeler.find((b) => b.tur === 'fatura' && b.durum !== 'iptal' && b.sevkiyatIsiId === id) ?? null;
  return (
    <>
      <Secim etiket="Sipariş (isteğe bağlı)" value={d.siparis} bosSecenek="Siparişsiz" onChange={(e) => dg({ siparis: e.target.value, sevk: '' })}
        secenekler={(siparisler.data?.siparisler ?? []).map((s) => ({
          deger: String(s.id), baslik: `${s.no} · ${DURUM[s.durum] ?? s.durum} · ${kisaTarih(s.siparisTarihi)}${s.musteriSiparisNo ? ' · ' + s.musteriSiparisNo : ''}`,
        }))} />
      <label className="tc-fy-gizli-etiket" htmlFor="tc-fy-sevk">Sevk (isteğe bağlı)</label>
      <select id="tc-fy-sevk" className="tc-alan-kutu" value={d.sevk} disabled={siparisId === null} onChange={(e) => dg({ sevk: e.target.value })}>
        <option value="">Sevksiz</option>
        {(sevkler.data?.sevkler ?? []).map((s) => {
          const fat = sevkFaturasi(s.id);
          return (
            <option key={s.id} value={String(s.id)} disabled={fat !== null}>
              {`${kisaTarih(s.tarih)}${s.belgeNo ? ' · ' + s.belgeNo : ''} · ${SEVK[s.durum] ?? s.durum}${fat ? ' · Faturalandı' + (fat.belgeNo ? ` (${fat.belgeNo})` : '') : ''}`}
            </option>
          );
        })}
      </select>
    </>
  );
}

/* ---------- Tahsilat, ödeme, çek alma ve verme ---------- */
function OdemeAlanlari(p: GovdeOzellikleri) {
  const { d, dg, hata, V, finans, side, tur } = p;
  const motor = finans.motor;
  const cekli = tur === 'cekal' || tur === 'cekver';
  const party = d.party.trim();
  const kalemler = party ? acikKalemler(motor, side, party) : [];
  const yontemler: readonly (readonly [OdemeSekli, string])[] = cekli ? [['cek', 'Çek'], ['senet', 'Senet']] : [['banka', 'Havale / nakit / kart'], ['cek', 'Çek'], ['senet', 'Senet']];
  const tutar = sayi(d.amount) || d.secili.reduce((t, id) => { const k = kalemler.find((x) => x.id === id); return t + (k ? gross(k) : 0); }, 0);
  const plan = party && tutar ? planAlloc(motor, side, party, tutar, d.secili.length ? d.secili : null) : null;
  const hesapPb = d.method === 'banka' ? V.hesapById.get(Number(d.hesap))?.paraBirimi ?? 'TRY' : d.pb;
  const caprazGerekir = kalemler.filter((k) => !d.secili.length || d.secili.includes(k.id)).some((k) => (k.paraBirimi ?? 'TRY') !== hesapPb);
  const sec = (id: string, isaretli: boolean) => dg({ secili: isaretli ? [...d.secili, id] : d.secili.filter((x) => x !== id) });
  return (
    <div className="tc-fy-alanlar">
      <FirmaAlani {...p} etiket={side === 'gelir' ? 'Kimden geldi?' : 'Kime ödendi?'} />
      <FirmaIpucu {...p} />
      <Serit etiket="Ödeme şekli" secenekler={yontemler} secili={d.method} sec={(method) => dg({ method })} />
      <Girdi etiket={side === 'gelir' ? 'Gelen tutar (KDV dahil)' : 'Ödenen tutar (KDV dahil)'} type="number" min="0" step="0.01" inputMode="decimal"
        value={d.amount} hata={hata('amount')} placeholder="Boş bırakırsanız seçilen faturaların toplamı" onChange={(e) => dg({ amount: e.target.value })} />
      {d.method === 'banka'
        ? <Secim etiket="Hesap" value={d.hesap} hata={hata('hesap')} bosSecenek="Hesap seçin" secenekler={hesapSecenekleri(V)} onChange={(e) => dg({ hesap: e.target.value })} />
        : <ParaBirimiAlani {...p} />}
      {d.method === 'banka' && caprazGerekir && (
        <Girdi etiket="Çapraz kur (1 belge birimi = ? ödeme birimi)" type="number" min="0" step="0.00000001" inputMode="decimal" value={d.capraz} onChange={(e) => dg({ capraz: e.target.value })} />
      )}
      <Girdi etiket={`${side === 'gelir' ? 'Tahsil' : 'Ödeme'} tarihi`} type="date" required value={d.date} hata={hata('date')} onChange={(e) => dg({ date: e.target.value })} />
      {d.method !== 'banka' && <CekAlanlari {...p} />}
      <fieldset className="tc-fy-faturalar">
        <legend>Hangi faturaları kapatıyor?</legend>
        {!party && <p className="tc-fy-not">Önce {side === 'gelir' ? 'müşteriyi' : 'tedarikçiyi'} seçin; açık faturaları burada listelenir.</p>}
        {party && !kalemler.length && (
          <p className="tc-fy-not">{party} için açık fatura yok. Girdiğiniz tutar avans olarak kaydedilir.</p>
        )}
        {kalemler.map((t) => {
          const gec = diffDays(motor.bugun, t.due);
          return (
            <label key={t.id} className="tc-fy-fatura">
              <input type="checkbox" checked={d.secili.includes(t.id)} onChange={(e) => sec(t.id, e.target.checked)} />
              <span><b>{t.desc}</b><small>{kisaTarih(t.date)} tarihli · vade {kisaTarih(t.due)}{gec > 0 && <> · <Rozet ton="hata">{gec} gün gecikti</Rozet></>}</small></span>
              <b className="tc-fy-tutar">{tl(gross(t))}</b>
            </label>
          );
        })}
      </fieldset>
      {plan && (
        <p className="tc-fy-not" role="status">
          Toplam {tl(tutar)}:
          {plan.full.length > 0 && ` ${plan.full.length} fatura tamamen kapanacak`}
          {plan.part[0] && `, 1 fatura kısmen kapanacak (kalan ${tl(gross(plan.part[0].t) - plan.part[0].paid)})`}
          {plan.left > 0.5 && `, ${tl(plan.left)} hiçbir faturayla eşleşmedi, avans olarak kaydedilecek`}.
        </p>
      )}
    </div>
  );
}

/* ---------- Maaş, SGK, vergi, kredi ---------- */
function SabitAlanlari(p: GovdeOzellikleri) {
  const { d, dg, hata, V, finans } = p;
  const motor = finans.motor;
  const ym = motor.bugun.slice(0, 7);
  const komut = useFinansKomutu();
  const { bildir } = useBildirim();
  const odendi = (duzenliId: number) => {
    const s = duzenliOdendiKomutu(V, motor, duzenliId);
    if ('hata' in s) { bildir('hata', s.hata); return; }
    komut.mutate({ komutlar: s.komutlar, istekKimligi: yeniIstekKimligi() }, {
      onSuccess: () => bildir('tamam', s.komutlar[0]!.basari),
      onError: (h) => bildir('hata', hataIletisi(h, 'Kaydedilemedi.')),
    });
  };
  return (
    <div className="tc-fy-alanlar">
      <section className="tc-fy-grup" aria-label="Bu ayın düzenli ödemeleri">
        <h3 className="tc-fy-alt-baslik">Bu ayın düzenli ödemeleri ({ymLong(ym)})</h3>
        {motor.durum.recurring.length === 0 && <p className="tc-fy-not">Henüz düzenli ödeme tanımlanmadı. Ayarlar &gt; Nakit ve düzenli ödemeler'den tanımlanır.</p>}
        {motor.durum.recurring.map((r) => {
          const gecti = motor.durum.tx.find((t) => t.type === 'gider' && t.date.slice(0, 7) === ym && (t.recId === r.id || t.cat === r.cat));
          return (
            <div key={r.id} className="tc-fy-satir">
              <span><b>{r.name}</b><small>Her ayın {r.day}. günü · {r.cat}</small></span>
              <b className="tc-fy-tutar">{tl(r.amount)}</b>
              {gecti ? <Rozet ton="tamam">Ödendi {kisaTarih(gecti.date)}</Rozet>
                : r._duzenliId !== undefined && <Dugme simge="check" yukleniyor={komut.isPending} onClick={() => odendi(r._duzenliId!)}>Ödendi</Dugme>}
            </div>
          );
        })}
        <p className="tc-fy-not">Tutar bu ay farklıysa aşağıdaki formdan girin.</p>
      </section>
      <Serit etiket="Başka bir ödeme" secenekler={OLAY_KATEGORILERI.sabit} secili={d.cat} sec={(cat) => dg({ cat })} />
      {d.cat === 'kredi'
        ? (
          <>
            <Girdi etiket="Anapara" type="number" min="0" step="0.01" inputMode="decimal" value={d.principal} onChange={(e) => dg({ principal: e.target.value })} />
            <Girdi etiket="Faiz" type="number" min="0" step="0.01" inputMode="decimal" value={d.interest} onChange={(e) => dg({ interest: e.target.value })} />
            <p className="tc-fy-not">Anapara ve faiz ayrımı bankanın ödeme planında yazar. Bilmiyorsanız tamamını anaparaya yazın; yalnızca faiz gider sayılır.</p>
          </>
        )
        : <Girdi etiket="Tutar" type="number" min="0" step="0.01" inputMode="decimal" value={d.amount} hata={hata('amount')} onChange={(e) => dg({ amount: e.target.value })} />}
      <Girdi etiket="Ödeme tarihi" type="date" value={d.date} hata={hata('date')} onChange={(e) => dg({ date: e.target.value })} />
      <Secim etiket="Hesap" value={d.hesap} hata={hata('hesap')} bosSecenek="Hesap seçin" secenekler={hesapSecenekleri(V)} onChange={(e) => dg({ hesap: e.target.value })} />
      <Girdi etiket="Açıklama" value={d.desc} placeholder="Örn. ayın maaşları" onChange={(e) => dg({ desc: e.target.value })} />
    </div>
  );
}

/* ---------- Banka ve kasa bakiyesi ---------- */
function BankaAlanlari({ d, dg, hata, V }: GovdeOzellikleri) {
  return (
    <div className="tc-fy-alanlar">
      <div className="tc-fy-grup">
        {aktifHesaplar(V).map((h) => (
          <div key={h.id} className="tc-fy-satir"><span>{h.ad} · {HESAP_TURU_ADI[h.tur]}</span><b className="tc-fy-tutar">{paraMetni(h.bakiye, h.paraBirimi)}</b></div>
        ))}
        {aktifHesaplar(V).length === 0 && <p className="tc-fy-not">Hesap yok.</p>}
      </div>
      <Secim etiket="Hesap" value={d.hesap} hata={hata('hesap')} bosSecenek="Hesap seçin" secenekler={hesapSecenekleri(V)} onChange={(e) => dg({ hesap: e.target.value })} />
      <Girdi etiket="Hesabın gerçek bakiyesi" type="number" step="0.01" inputMode="decimal" required value={d.gercek} hata={hata('gercek')} onChange={(e) => dg({ gercek: e.target.value })} />
      <p className="tc-fy-not">Fark, eşitleme kaydı olarak yazılır; kâr/zararı etkilemez ve silinmez.</p>
    </div>
  );
}

/* ---------- Virman, mahsup, avans, iade ---------- */
function VirmanAlanlari({ d, dg, hata, V }: GovdeOzellikleri) {
  return (
    <div className="tc-fy-alanlar">
      <Secim etiket="Çıkan hesap" value={d.kaynak} hata={hata('kaynak')} bosSecenek="Hesap seçin" secenekler={hesapSecenekleri(V)} onChange={(e) => dg({ kaynak: e.target.value })} />
      <Secim etiket="Giren hesap" value={d.hedef} hata={hata('hedef')} bosSecenek="Hesap seçin" secenekler={hesapSecenekleri(V)} onChange={(e) => dg({ hedef: e.target.value })} />
      <Girdi etiket="Tarih" type="date" value={d.date} hata={hata('date')} onChange={(e) => dg({ date: e.target.value })} />
      <Girdi etiket="Tutar" type="number" min="0" step="0.01" inputMode="decimal" required value={d.amount} hata={hata('amount')} onChange={(e) => dg({ amount: e.target.value })} />
      <Girdi etiket="Açıklama" maxLength={300} value={d.aciklama} onChange={(e) => dg({ aciklama: e.target.value })} />
    </div>
  );
}

const belgeSecenegi = (V: HazirVeri, b: HazirVeri['belgeler'][number], ek = ''): Secenek =>
  ({ deger: String(b.id), baslik: `${firmaEtiketi(V, b.firmaId) ?? ''} · ${kisaTarih(b.belgeTarihi)}${ek} · kalan ${paraMetni(b.kalan, b.paraBirimi)}` });

function MahsupAlanlari({ d, dg, hata, V }: GovdeOzellikleri) {
  const acik = (yon: 'gelir' | 'gider') => V.belgeler.filter((b) => b.durum === 'acik' && b.yon === yon && (!d.party || firmaEtiketi(V, b.firmaId) === d.party));
  return (
    <div className="tc-fy-alanlar">
      <p className="tc-fy-not">Aynı firmanın satış ve alış faturası para hareketi olmadan birbirini kapatır; kasaya ve kâr/zarara girmez.</p>
      <Secim etiket="Satış faturası (alacak)" value={d.satis} bosSecenek="Seçin" secenekler={acik('gelir').map((b) => belgeSecenegi(V, b))} onChange={(e) => dg({ satis: e.target.value })} />
      <Secim etiket="Alış faturası (borç)" value={d.alis} bosSecenek="Seçin" secenekler={acik('gider').map((b) => belgeSecenegi(V, b))} onChange={(e) => dg({ alis: e.target.value })} />
      <Girdi etiket="Satış faturasında kapanacak" type="number" min="0" step="0.01" required value={d.satisTutari} hata={hata('satisTutari')} onChange={(e) => dg({ satisTutari: e.target.value })} />
      <Girdi etiket="Alış faturasında kapanacak (farklı para biriminde)" type="number" min="0" step="0.01" value={d.alisTutari} hata={hata('alisTutari')} onChange={(e) => dg({ alisTutari: e.target.value })} />
      <Girdi etiket="Tarih" type="date" value={d.date} hata={hata('date')} onChange={(e) => dg({ date: e.target.value })} />
    </div>
  );
}

function AvansAlanlari({ d, dg, hata, V }: GovdeOzellikleri) {
  const odemeler = V.odemeler.filter((o) => !o.iptal && sayi(o.kalan) > 0 && (!d.party || firmaEtiketi(V, o.firmaId) === d.party));
  const belgeler = V.belgeler.filter((b) => b.durum === 'acik' && (!d.party || firmaEtiketi(V, b.firmaId) === d.party));
  return (
    <div className="tc-fy-alanlar">
      <Secim etiket="Dağıtılmamış ödeme" value={d.odeme} bosSecenek="Seçin" onChange={(e) => dg({ odeme: e.target.value })}
        secenekler={odemeler.map((o) => ({ deger: String(o.id), baslik: `${firmaEtiketi(V, o.firmaId) ?? ''} · ${kisaTarih(o.tarih)} · kalan ${paraMetni(o.kalan, o.paraBirimi)}` }))} />
      <Secim etiket="Kapatılacak fatura" value={d.belge} bosSecenek="Seçin" onChange={(e) => dg({ belge: e.target.value })}
        secenekler={belgeler.map((b) => belgeSecenegi(V, b, ` · ${b.yon === 'gelir' ? 'satış' : 'alış'}`))} />
      <Girdi etiket="Kapanacak tutar (fatura biriminde)" type="number" min="0" step="0.01" required value={d.amount} hata={hata('amount')} onChange={(e) => dg({ amount: e.target.value })} />
      <Girdi etiket="Çapraz kur (gerekirse)" type="number" min="0" step="0.00000001" value={d.capraz} onChange={(e) => dg({ capraz: e.target.value })} />
      <Girdi etiket="Tarih" type="date" value={d.date} hata={hata('date')} onChange={(e) => dg({ date: e.target.value })} />
    </div>
  );
}

// İade faturası (260 a): asıl faturanın ters yönünde ayrı belgedir; firma, para birimi, kur, KDV ve tevkifat asıl faturadan gelir.
function IadeAlanlari({ d, dg, hata, V, tur }: GovdeOzellikleri) {
  const asilYon = tur === 'iadesat' ? 'gelir' : 'gider';
  const faturalar = V.belgeler.filter((b) => b.tur === 'fatura' && b.durum !== 'iptal' && b.yon === asilYon && (!d.party || firmaEtiketi(V, b.firmaId) === d.party))
    .sort((a, b) => (a.belgeTarihi < b.belgeTarihi ? 1 : a.belgeTarihi > b.belgeTarihi ? -1 : b.id - a.id));
  const satis = asilYon === 'gelir';
  if (!faturalar.length) return <p className="tc-fy-not">{d.party ? `${d.party} için ` : ''}iade edilecek {satis ? 'satış' : 'alış'} faturası yok.</p>;
  return (
    <div className="tc-fy-alanlar">
      <p className="tc-fy-not">{satis ? 'Satış' : 'Alış'} faturasının iadesi ayrı belge olarak girer. KDV, para birimi ve kur asıl faturadan gelir; iadeler asıl faturanın toplamını geçemez.</p>
      <Secim etiket={`İade edilen ${satis ? 'satış' : 'alış'} faturası`} value={d.asil} bosSecenek="Seçin" onChange={(e) => dg({ asil: e.target.value })}
        secenekler={faturalar.map((b) => ({ deger: String(b.id), baslik: `${firmaEtiketi(V, b.firmaId) ?? ''} · ${kisaTarih(b.belgeTarihi)} · ${b.belgeNo || b.aciklama || '#' + b.id} · toplam ${paraMetni(b.toplam, b.paraBirimi)}` }))} />
      <Girdi etiket="İade tutarı (KDV hariç)" type="number" min="0" step="0.01" inputMode="decimal" required value={d.amount} hata={hata('amount')} onChange={(e) => dg({ amount: e.target.value })} />
      <Girdi etiket="Tarih" type="date" value={d.date} hata={hata('date')} onChange={(e) => dg({ date: e.target.value })} />
      <CokSatir etiket="İade fatura no / not" maxLength={500} rows={2} value={d.aciklama} placeholder="İsteğe bağlı" onChange={(e) => dg({ aciklama: e.target.value })} />
    </div>
  );
}

/* ---------- Çekin durumu ---------- */
function CekDurumu({ finans, geri }: { finans: FinansVerisi; geri: () => void }) {
  const { V, motor } = finans;
  const cekler = takiptekiCekler(V);
  const [ek, ekYaz] = useState<{ cek: SunucuCeki; durum: CekDurumu } | null>(null);
  return (
    <div className="tc-fy-form">
      <div className="tc-fy-form-ust">
        <Dugme simge="chev-left" onClick={geri}>Olay seç</Dugme>
        <p className="tc-fy-not">{OLAYLAR.cekdurum.aciklama}</p>
      </div>
      {cekler.length === 0 && <DurumKutusu durum="bos" mesaj="Takipte çek veya senet yok." />}
      {cekler.map((c) => {
        const g = diffDays(c.vade, motor.bugun);
        return (
          <div key={c.id} className="tc-fy-cek">
            <div className="tc-fy-satir">
              <span>
                <b>{firmaEtiketi(V, c.firmaId)}</b>
                <small>{c.yon === 'alinan' ? 'Alınan' : 'Verilen'} {c.tur === 'senet' ? 'senet' : 'çek'} · {c.banka ?? '—'} · vade {kisaTarih(c.vade)} ({g < 0 ? `${Math.abs(g)} gün geçti` : `${g} gün kaldı`})</small>
              </span>
              <b className="tc-fy-tutar">{paraMetni(c.tutar, c.paraBirimi)}</b>
            </div>
            <CekDugmeleri finans={finans} cek={c} ekAc={(durum) => ekYaz({ cek: c, durum })} />
            {ek?.cek.id === c.id && <CekEkFormu finans={finans} cek={c} durum={ek.durum} kapat={() => ekYaz(null)} />}
          </div>
        );
      })}
      <p className="tc-fy-not">"Tahsil edildi" seçildiğinde tutar nakde eklenir. "Ciro ettim" seçilirse nakde eklenmez; çek bir borcu kapatmak için başkasına verilmiştir.</p>
    </div>
  );
}

function sonucuGonder(sonuc: KomutSonucu, komut: ReturnType<typeof useFinansKomutu>, bildir: ReturnType<typeof useBildirim>['bildir'], sonra?: () => void) {
  if ('hata' in sonuc) { bildir('hata', sonuc.hata); return; }
  komut.mutate({ komutlar: sonuc.komutlar, istekKimligi: yeniIstekKimligi() }, {
    onSuccess: () => { bildir('tamam', sonuc.komutlar[0]!.basari); sonra?.(); },
    onError: (h) => bildir('hata', hataIletisi(h, 'İşlem yapılamadı.')),
  });
}

function CekDugmeleri({ finans, cek, ekAc }: { finans: FinansVerisi; cek: SunucuCeki; ekAc: (durum: CekDurumu) => void }) {
  const komut = useFinansKomutu();
  const { bildir } = useBildirim();
  const { yonet } = useFinansYetkisi();
  const tikla = (durum: CekDurumu) => {
    if (cekEkAlanIster(durum)) { ekAc(durum); return; }
    sonucuGonder(cekDurumKomutu(finans.V, finans.motor, cek, durum), komut, bildir);
  };
  return (
    <div className="tc-fy-dugmeler">
      {cekDugmeleri(cek, yonet).map((b) => (
        <Dugme key={b.durum} tur={b.tehlike ? 'tehlike' : 'ikincil'} yukleniyor={komut.isPending} onClick={() => tikla(b.durum)}>{b.baslik}</Dugme>
      ))}
    </div>
  );
}

function CekEkFormu({ finans, cek, durum, kapat }: { finans: FinansVerisi; cek: SunucuCeki; durum: CekDurumu; kapat: () => void }) {
  const { V, motor } = finans;
  const komut = useFinansKomutu();
  const { bildir } = useBildirim();
  const [hesap, hesapYaz] = useState(hesapSecenekleri(V, ['banka'], cek.paraBirimi)[0]?.deger ?? '');
  const [party, partyYaz] = useState('');
  const [tarih, tarihYaz] = useState(motor.bugun);
  const ister = cekEkAlanIster(durum);
  const liste = firmaEtiketleri(V, 'gider');
  let alanlar: ReactNode;
  if (ister === 'hesap') {
    alanlar = <Secim etiket="Hesap" value={hesap} bosSecenek="Hesap seçin" secenekler={hesapSecenekleri(V, ['banka'], cek.paraBirimi)} onChange={(e) => hesapYaz(e.target.value)} />;
  } else {
    alanlar = (
      <>
        <Girdi etiket="Ciro edilen tedarikçi" list="tc-fy-ciro" required value={party} onChange={(e) => partyYaz(e.target.value)} autoComplete="off" />
        <datalist id="tc-fy-ciro">{liste.map((f) => <option key={f} value={f} />)}</datalist>
        <p className="tc-fy-not">Tedarikçinin açık faturaları en eski vadeden başlayarak kapatılır; artan avans olur.</p>
      </>
    );
  }
  return (
    <form className="tc-fy-grup" aria-label={durum === 'ciro' ? 'Çeki ciro et' : 'Çek sonucu'}
      onSubmit={(e) => { e.preventDefault(); sonucuGonder(cekDurumKomutu(V, motor, cek, durum, { hesap, party, tarih }), komut, bildir, kapat); }}>
      {alanlar}
      <Girdi etiket="Tarih" type="date" value={tarih} onChange={(e) => tarihYaz(e.target.value)} />
      <div className="tc-fy-dugmeler">
        <Dugme onClick={kapat}>Vazgeç</Dugme>
        <Dugme type="submit" tur="birincil" simge="check" yukleniyor={komut.isPending}>{durum === 'ciro' ? 'Ciroyu kaydet' : 'Kaydet'}</Dugme>
      </div>
    </form>
  );
}
