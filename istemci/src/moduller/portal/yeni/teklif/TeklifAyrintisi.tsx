import { useState, type ChangeEvent, type FormEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  CokSatir, Dugme, DurumKutusu, Girdi, OnayPenceresi, Rozet, SayfaBasligi, Secim,
} from '../../../../ortak/arayuz/index.ts';
import { gunEkle, isoGun, kalanGun, para, sayi, sayiOku, tarih, tarihSaat, YOK } from '../bicim.ts';
import {
  adimAtla, KDV, ONAY_TURLERI, onayAdimlari, onayKurallari, gecmisEkle, siradakiAdim, talepDurumu, teklifTutari, yuvarla,
} from '../kurallar.ts';
import { sahibi } from '../sahibinde.tsx';
import type { GorunumOzellikleri } from '../sekmeler.ts';
import type { Depo, Gecmis, KoleksiyonAdi, Onay, Siparis, TeklifTalebi } from '../tipler.ts';
import {
  belgeNoAl, ekYukle, hataMetni, kaydet, usePortal, usePortalDeposu, usePortalKomutu, yeniKimlik,
} from '../veri.ts';
import {
  DurumRozeti, Galeri, GECERLILIK_GUNU, IslemGecmisi, KalemTablosu, ODEME_KOSULLARI, sonSurumu, talep, talepYaz, TESLIM_GUNU, TeklifSayfasi, tutar,
  VARSAYILAN_VADE, type Surum, type Talep,
} from './ortak.tsx';
import './teklif.css';

// Teklif talebi ayrıntısı (prototip saleDetail): durum bandı, müşterinin talebi, gösterilen teklif sürümü, yeni sürüm formu,
// mesajlar, sürüm geçmişi ve işlem geçmişi. Kural ve yetki sunucudadır; ekran prototipin yazdığı belgeyi yazar.

const KOLEKSIYONLAR: readonly KoleksiyonAdi[] = ['requests', 'parties', 'users', 'approvals', 'messages', 'settings', 'orders'];

const durum = (q: Talep, simdi: number) => talepDurumu(q as TeklifTalebi, simdi);
const bekleyenOnay = (d: Depo, q: Talep): Onay | null => (q.pendingApproval ? d.approvals[q.pendingApproval] ?? null : null);

export function TeklifAyrintisi({ id }: GorunumOzellikleri) {
  const p = usePortal();
  const { depo, yukleniyor, hata, yenile } = usePortalDeposu(KOLEKSIYONLAR);
  const [kabulSoruluyor, setKabulSoruluyor] = useState(false);
  const { simdi, izin } = p;
  const q = talep(depo, id);

  const kabul = usePortalKomutu(async (x: Talep) => {
    const v = sonSurumu(x);
    if (!v) return;
    await talepYaz({
      ...x, status: 'accepted', acceptedVersion: v.v, acceptedAt: new Date().toISOString(),
      history: gecmisEkle(x, `Sürüm ${String(v.v)} için müşteri kabulü satış ekibince kaydedildi`, p.kisiKimligi, Date.now()),
    });
    setKabulSoruluyor(false);
  }, 'Müşteri kabulü kaydedildi');

  const siparis = usePortalKomutu(async (x: Talep) => {
    const v = x.versions?.find((s) => s.v === x.acceptedVersion) ?? sonSurumu(x);
    if (!v) return;
    const o = siparisKur(x, v, await belgeNoAl('orders', 'SS', 4), p.kisiKimligi, Date.now());
    // Prototipin sırası: önce sipariş (sunucu dönüşümü bu yazıda Siparişler'e yapar), sonra talep.
    await kaydet('orders', o);
    await talepYaz({
      ...x, status: 'ordered', orderId: o.id, history: gecmisEkle(x, `Satış siparişine dönüştürüldü: ${o.no}`, p.kisiKimligi, Date.now()),
    });
  }, 'Satış siparişi açıldı');

  if (yukleniyor) return <DurumKutusu durum="yukleniyor" mesaj="Teklif talebi yükleniyor…" />;
  if (hata) return <DurumKutusu durum="hata" mesaj="Teklif talebi okunamadı." yenile={yenile} />;
  if (!q) {
    return (
      <DurumKutusu durum="bos" mesaj="Bu kayıt bulunamadı veya bu hesapla erişiminiz yok.">
        <Dugme onClick={() => p.git('sales')}>Listeye dön</Dugme>
      </DurumKutusu>
    );
  }

  const st = durum(q, simdi);
  const v = sonSurumu(q);
  const onay = bekleyenOnay(depo, q);
  const onayBekliyor = onay?.status === 'pending';
  const hazirlanabilir = ['new', 'revision', 'quoted', 'expired'].includes(st) && !onayBekliyor && izin.gonderimAcik('quote');
  const gosterilen = q.acceptedVersion ? q.versions?.find((x) => x.v === q.acceptedVersion) ?? v : v;
  const oncekiSurum = gosterilen && q.versions ? q.versions[q.versions.indexOf(gosterilen) - 1] : undefined;
  const firma = (fid: string) => (fid === 'firm' ? p.kurumAdi : depo.parties[fid]?.name ?? 'Silinmiş firma');
  const yapan = (h: Pick<Gecmis, 'u' | 'by'>) => {
    const u = h.u === undefined ? undefined : depo.users[h.u];
    return u ? `${u.name} (${firma(h.by || u.partyId)})` : firma(h.by);
  };
  const siparisNo = q.orderId ? depo.orders[q.orderId]?.no : undefined;

  return (
    <div className="tc-pt-teklif">
      <SayfaBasligi
        baslik={q.title} simge="tag"
        alt={<span className="tc-pt-teklif-baslik-alt"><span className="tc-pt-teklif-no">{q.no}</span><DurumRozeti q={q} simdi={simdi} />{`${firma(q.customerId)}, ${tarih(q.createdAt)} tarihinde istendi.`}</span>}
      />
      <Dugme className="tc-pt-teklif-don" simge="chev-left" onClick={() => p.git('sales')}>Teklif taleplerine dön</Dugme>

      {st === 'revision' && <Bant ton="uyari" baslik="Müşteri revizyon istedi">{q.revisionNote || 'Not bırakılmadı.'}</Bant>}
      {st === 'accepted' && (
        <Bant ton="iyi" baslik={`Müşteri sürüm ${String(q.acceptedVersion ?? '')} teklifini kabul etti`}>
          Siparişe dönüştürün; termin ve kalemler kabul edilen sürümden alınır.
          {izin.eylemAcik('toorder') && (
            <div className="tc-pt-teklif-eylemler">
              <Dugme tur="birincil" simge="cart" yukleniyor={siparis.isPending} onClick={() => siparis.mutate(q)}>Satış siparişine dönüştür</Dugme>
            </div>
          )}
        </Bant>
      )}
      {st === 'ordered' && (
        <Bant ton="iyi" baslik="Satış siparişi açıldı">
          <Link to={sahibi('order', 'sales').yol}>{siparisNo ?? 'Siparişe git'}</Link>
        </Bant>
      )}
      {st === 'rejected' && <Bant ton="hata" baslik="Müşteri teklifi reddetti">{q.rejectNote || 'Gerekçe belirtilmedi.'}</Bant>}
      {st === 'expired' && <Bant ton="uyari" baslik="Teklifin geçerlilik süresi doldu">Güncel fiyatlarla yeni sürüm gönderebilirsiniz.</Bant>}
      {st === 'quoted' && v && (
        <Bant ton="bilgi" baslik="Teklif müşteride">
          Müşteri kabulünü telefon ya da e-postayla bildirdiyse buradan kaydedin.
          {izin.eylemAcik('custaccept') && (
            <div className="tc-pt-teklif-eylemler">
              <Dugme tur="birincil" simge="check" onClick={() => setKabulSoruluyor(true)}>{`Sürüm ${String(v.v)} için müşteri kabulünü kaydet`}</Dugme>
            </div>
          )}
        </Bant>
      )}
      {onay && <OnayBandi a={onay} yapan={(uid) => depo.users[uid]?.name ?? uid} yol={p.yol('approvals', onay.id)} />}

      <div className="tc-pt-izgara">
        <div className="tc-pt-yan">
          <section className="tc-pt-pano" aria-labelledby="tc-pt-teklif-talep">
            <header className="tc-pt-pano-bas">
              <h3 id="tc-pt-teklif-talep">Müşterinin talebi</h3>
              <p>{`İstenen teslim: ${tarih(q.neededBy)}`}</p>
            </header>
            <KalemTablosu kalemler={q.items} birim={q.currency} />
            {q.note && <p className="tc-pt-teklif-not">{q.note}</p>}
            <Galeri ekler={q.photos} />
          </section>
          {gosterilen && <TeklifSayfasi q={q} v={gosterilen} onceki={oncekiSurum} simdi={simdi} />}
          {hazirlanabilir && <SurumFormu key={`${q.id}-${String(q.surum)}`} q={q} depo={depo} />}
        </div>
        <div className="tc-pt-yan">
          <Mesajlar konu={`req:${q.id}`} karsiTaraf={firma(q.customerId)} depo={depo} yapan={yapan} />
          <SurumGecmisi q={q} />
          <IslemGecmisi gecmis={q.history} yapan={yapan} />
        </div>
      </div>

      {v && (
        <OnayPenceresi
          acik={kabulSoruluyor} baslik="Müşteri kabulü kaydedilsin mi?" onayMetni="Kabulü kaydet" yukleniyor={kabul.isPending}
          onayla={() => kabul.mutate(q)} vazgec={() => setKabulSoruluyor(false)}
        >
          <p>{`${firma(q.customerId)}, sürüm ${String(v.v)}: genel toplam ${para(tutar(q, v).grand, q.currency)} (KDV dahil), ${v.deliveryDays === undefined ? YOK : String(v.deliveryDays)} gün teslim.`}</p>
        </OnayPenceresi>
      )}
    </div>
  );
}

// "Siparişe dönüştür" (prototip toorder): kalemler kabul edilen sürümün iskontolu fiyatıyla, termin teslim süresinden. Fiyatı
// görmeyen kişide sürüm fiyatı boş gelir; sipariş fiyatı sıfır yazılmaz, boş kalır (Siparişler fiyatı kendi teklifinden alır).
export function siparisKur(q: Talep, v: Surum, no: string, kisi: string, simdi: number): Omit<Siparis, 'surum'> {
  const k = 1 - (Number(v.discount) || 0) / 100;
  const an = new Date(simdi).toISOString();
  // Ortak sipariş tipi açık durumu ('open') ve ödeme koşulunu yazmaz; belge prototipin biçimiyle yazılır.
  const belge = {
    id: yeniKimlik('o', simdi), no, type: 'sales', partyId: q.customerId, title: q.title,
    items: q.items.map((it, i) => {
      const f = v.prices[i] ?? null;
      return { code: '', name: it.name, unit: it.unit, qty: it.qty, price: f === null ? null : yuvarla(f * k) };
    }),
    currency: q.currency ?? 'TRY', vat: KDV, createdAt: an, promisedDate: gunEkle(simdi, Number(v.deliveryDays) || TESLIM_GUNU), confirmedAt: an,
    payment: v.payment, deliveries: [], invoices: [], status: 'open', sourceNo: q.no,
    history: [{ at: an, by: 'firm', u: kisi, text: `${q.no} teklifinden sipariş oluşturuldu` }],
  };
  return belge as unknown as Omit<Siparis, 'surum'>;
}

const BANT_TONU = { iyi: 'tamam', uyari: 'uyari', hata: 'hata', bilgi: 'bilgi' } as const;

function Bant({ ton, baslik, children }: { ton: keyof typeof BANT_TONU; baslik: string; children?: ReactNode }) {
  return (
    <div className="tc-pt-teklif-bant" data-ton={ton} role="status">
      <b>{baslik}</b>
      <div>{children}</div>
    </div>
  );
}

// Teklife bağlı onay (prototip apBanner). Karar Onaylarım'da verilir; burada durum ve adımlar görünür.
function OnayBandi({ a, yapan, yol }: { a: Onay; yapan: (uid: string) => string; yol: string }) {
  if (a.status === 'approved') return null;
  if (a.status === 'rejected') {
    return <Bant ton="hata" baslik={`${ONAY_TURLERI[a.kind]} onayı reddedildi (${a.no})`}>{a.steps.find((s) => s.status === 'rejected')?.note ?? ''}</Bant>;
  }
  const s = siradakiAdim(a);
  return (
    <Bant ton="uyari" baslik={`${ONAY_TURLERI[a.kind]} onayı bekleniyor (${a.no})`}>
      {`Talep eden ${yapan(a.requestedBy)}. Sıradaki onaycı: ${s?.role ?? ''}.`}
      <ul className="tc-pt-teklif-adimlar">
        {a.steps.map((x, i) => (
          <li key={`${x.role}-${String(i)}`}>
            <b>{x.role}</b>
            <Rozet ton={x.status === 'approved' ? 'tamam' : x.status === 'rejected' ? 'hata' : 'uyari'}>
              {x.status === 'approved' ? 'Onayladı' : x.status === 'rejected' ? 'Reddetti' : 'Bekliyor'}
            </Rozet>
            {x.u && <small>{yapan(x.u)}</small>}
          </li>
        ))}
      </ul>
      <Link to={yol}>Onaylarım'da aç</Link>
    </Bant>
  );
}

const girdiMetni = (n: number | null | undefined): string => (n === null || n === undefined || Number.isNaN(n) ? '' : String(n).replace('.', ','));

export interface SurumGirdisi { fiyatlar: string[]; iskonto: string; teslim: string; odeme: string; gecerlilik: string; not: string }

// Yeni sürümün denetimi (prototip quote gönderimi). Hata metni döner; geçerliyse sürüm gövdesi.
export function surumOku(q: Talep, g: SurumGirdisi, simdi: number, an: string): { hata: string } | { surum: Surum } {
  const fiyatlar = q.items.map((_, i) => sayiOku(g.fiyatlar[i]));
  if (fiyatlar.some((f) => Number.isNaN(f) || f <= 0)) return { hata: 'Her kalem için sıfırdan büyük birim fiyat girin.' };
  const iskonto = sayiOku(g.iskonto) || 0;
  if (iskonto < 0 || iskonto >= 100) return { hata: 'İskonto 0 ile 99 arasında olmalı.' };
  const teslim = Number.parseInt(g.teslim, 10);
  if (!(teslim > 0)) return { hata: 'Teslim süresini gün olarak girin.' };
  const kalan = kalanGun(g.gecerlilik, simdi);
  if (!g.gecerlilik || kalan === null || kalan < 0) return { hata: 'Geçerlilik tarihi bugün veya ileri bir tarih olmalı.' };
  return {
    surum: {
      v: (q.versions?.length ?? 0) + 1, prices: fiyatlar, discount: iskonto, deliveryDays: teslim, payment: g.odeme, validUntil: g.gecerlilik,
      note: g.not.trim(), createdAt: an,
    },
  };
}

function SurumFormu({ q, depo }: { q: Talep; depo: Depo }) {
  const p = usePortal();
  const v = sonSurumu(q);
  const birim = q.currency;
  const vade = `${String(VARSAYILAN_VADE)} gün vadeli`;
  const gecerliMi = v ? (kalanGun(v.validUntil, p.simdi) ?? -1) >= 0 : false;
  const [g, setG] = useState<SurumGirdisi>(() => ({
    fiyatlar: q.items.map((_, i) => girdiMetni(v?.prices[i])),
    iskonto: girdiMetni(v?.discount ?? 0),
    teslim: v?.deliveryDays === undefined ? '' : String(v.deliveryDays),
    odeme: v?.payment ?? vade,
    gecerlilik: v && gecerliMi ? v.validUntil : gunEkle(p.simdi, GECERLILIK_GUNU),
    not: v?.note ?? '',
  }));
  const [ekler, setEkler] = useState<string[]>([]);
  const [yukleniyor, setYukleniyor] = useState(false);
  const [hata, setHata] = useState<string | null>(null);

  const gonder = usePortalKomutu(async (s: Surum) => {
    await talepYaz({
      ...q, status: 'quoted', photos: [...(q.photos ?? []), ...ekler], versions: [...(q.versions ?? []), s],
      history: gecmisEkle(q, `Sürüm ${String(s.v)} gönderildi`, p.kisiKimligi, Date.now()),
    });
    window.scrollTo?.(0, 0);
  }, v ? `Sürüm ${String(v.v + 1)} müşteriye gönderildi` : 'Sürüm 1 müşteriye gönderildi');

  const fiyatlar = q.items.map((_, i) => sayiOku(g.fiyatlar[i]));
  const canli = teklifTutari(q.items, fiyatlar.map((f) => (Number.isNaN(f) ? 0 : f)), sayiOku(g.iskonto) || 0);
  const alan = (k: keyof Omit<SurumGirdisi, 'fiyatlar'>) => (o: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    setG((x) => ({ ...x, [k]: o.target.value }));
  };

  const yolla = (o: FormEvent) => {
    o.preventDefault();
    const okunan = surumOku(q, g, p.simdi, new Date().toISOString());
    if ('hata' in okunan) { setHata(okunan.hata); return; }
    // İskonto onay sınırını aşan sürüm onaya gider (prototip beforePut). H2: onay Siparişler'in iskontoOnayla ucuna bağlanacak;
    // uç gelene kadar bu ekran onaya göndermez, sunucu da onaysız sürümü reddeder.
    const adimlar = adimAtla('discount', onayAdimlari(onayKurallari(depo), 'discount', { discount: okunan.surum.discount ?? 0 }), p.kullanici?.role ?? '');
    if (adimlar.length > 0) {
      setHata(`İskonto %${sayi(onayKurallari(depo).discMgr)} sınırını aşıyor; bu sürüm ${adimlar.join(' → ')} onayından sonra müşteriye gider. Onaya gönderme bu ekranda henüz yok; eski portal ekranından gönderin.`);
      return;
    }
    setHata(null);
    gonder.mutate(okunan.surum);
  };

  const dosyaSec = async (o: ChangeEvent<HTMLInputElement>) => {
    const dosyalar = [...(o.target.files ?? [])];
    o.target.value = '';
    if (dosyalar.length === 0) return;
    setYukleniyor(true);
    try {
      for (const d of dosyalar) {
        const veri = await base64(d);
        const c = await ekYukle(d.name, d.type || 'application/octet-stream', veri);
        setEkler((x) => [...x, c.id]);
      }
    } catch (e) {
      setHata(hataMetni(e, 'Dosya yüklenemedi.'));
    } finally {
      setYukleniyor(false);
    }
  };

  return (
    <section className="tc-pt-pano" aria-labelledby="tc-pt-teklif-form">
      <header className="tc-pt-pano-bas">
        <h2 id="tc-pt-teklif-form">{v ? 'Yeni sürüm hazırla' : 'Teklif hazırla'}</h2>
        <p>{v ? 'Önceki sürümün değerleri dolduruldu.' : 'Fiyatları girin; toplamlar otomatik hesaplanır.'}</p>
      </header>
      <form className="tc-pt-teklif-form" aria-label={v ? 'Yeni sürüm hazırla' : 'Teklif hazırla'} noValidate onSubmit={yolla}>
        <div className="tc-pt-teklif-kaydir">
          <table className="tc-pt-teklif-tablo">
            <thead>
              <tr>
                <th>Kalem</th><th className="tc-pt-teklif-sag">Miktar</th>
                <th className="tc-pt-teklif-sag">{`Birim fiyat (${birim ?? 'TRY'})`}</th><th className="tc-pt-teklif-sag">Tutar</th>
              </tr>
            </thead>
            <tbody>
              {q.items.map((it, i) => (
                <tr key={`${it.name}-${String(i)}`}>
                  <td><span className="tc-pt-teklif-ad">{it.name}</span></td>
                  <td className="tc-pt-teklif-sag tc-pt-teklif-kirilmaz">{`${sayi(it.qty)} ${it.unit}`}</td>
                  <td className="tc-pt-teklif-sag">
                    <input
                      className="tc-alan-kutu tc-pt-teklif-fiyat" type="text" inputMode="decimal" required aria-label={`${it.name} birim fiyat`}
                      value={g.fiyatlar[i] ?? ''} onChange={(o) => { const d = o.target.value; setG((x) => ({ ...x, fiyatlar: x.fiyatlar.map((f, j) => (j === i ? d : f)) })); }}
                    />
                  </td>
                  <td className="tc-pt-teklif-sag tc-pt-teklif-kirilmaz">{Number.isNaN(fiyatlar[i] ?? Number.NaN) ? YOK : para(it.qty * (fiyatlar[i] ?? 0), birim)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="tc-pt-teklif-satir">
          <Girdi etiket="İskonto (%)" inputMode="decimal" value={g.iskonto} onChange={alan('iskonto')} />
          <Girdi etiket="Teslim süresi (gün)" type="number" min={1} required value={g.teslim} onChange={alan('teslim')} />
          <Secim etiket="Ödeme koşulu" value={g.odeme} onChange={alan('odeme')} secenekler={odemeSecenekleri(g.odeme)} />
          <Girdi etiket="Geçerlilik tarihi" type="date" required min={isoGun(p.simdi)} value={g.gecerlilik} onChange={alan('gecerlilik')} />
        </div>
        <CokSatir etiket="Müşteriye not" value={g.not} onChange={alan('not')} placeholder="Fiyata kaplama dahildir, nakliye alıcıya aittir vb." />
        <div className="tc-pt-teklif-yukle">
          <label className="tc-dugme tc-dugme-ikincil tc-dugme-normal">
            <span>Görsel (numune fotoğrafı, çizim)</span>
            <input type="file" accept="image/*,application/pdf" multiple disabled={yukleniyor} onChange={(o) => { void dosyaSec(o); }} />
          </label>
          {ekler.length > 0 && <span className="tc-pt-teklif-ipucu">{`${String(ekler.length)} dosya eklendi`}</span>}
        </div>
        {hata && <p className="tc-pt-teklif-hata" role="alert">{hata}</p>}
        <div className="tc-pt-teklif-alt">
          <div className="tc-pt-teklif-canli" aria-live="polite">
            KDV hariç toplam <b>{para(canli.net, birim)}</b>
            <span className="tc-pt-teklif-ipucu">{`KDV dahil ${para(canli.grand, birim)}`}</span>
          </div>
          <Dugme tur="birincil" type="submit" yukleniyor={gonder.isPending || yukleniyor}>{v ? `Sürüm ${String(v.v + 1)} olarak gönder` : 'Teklifi gönder'}</Dugme>
        </div>
      </form>
    </section>
  );
}

// Kayıtlı koşul listede yoksa da seçili kalır (eski kayıt).
const odemeSecenekleri = (secili: string) =>
  [...ODEME_KOSULLARI, ...(ODEME_KOSULLARI.includes(secili as (typeof ODEME_KOSULLARI)[number]) ? [] : [secili])].map((x) => ({ deger: x, baslik: x }));

function base64(d: Blob): Promise<string> {
  return new Promise((coz, reddet) => {
    const r = new FileReader();
    r.onload = () => { coz(String(r.result).replace(/^data:[^,]*,/, '')); };
    r.onerror = () => { reddet(r.error ?? new Error('Dosya okunamadı.')); };
    r.readAsDataURL(d);
  });
}

function SurumGecmisi({ q }: { q: Talep }) {
  if (!q.versions?.length) return null;
  const sirali = [...q.versions].reverse();
  return (
    <section className="tc-pt-pano" aria-labelledby="tc-pt-teklif-surumler">
      <header className="tc-pt-pano-bas"><h3 id="tc-pt-teklif-surumler">Sürüm geçmişi</h3></header>
      <ul className="tc-pt-teklif-surumler">
        {sirali.map((v, i) => (
          <li key={v.v} data-guncel={i === 0 || undefined}>
            <span><b>{`Sürüm ${String(v.v)}`}</b> {tarih(v.createdAt)}</span>
            <span>
              {para(tutar(q, v).net, q.currency)}
              {q.acceptedVersion === v.v && <Rozet ton="tamam">Kabul edilen</Rozet>}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

// Kaydın mesajları (prototip thread): karşı taraf aynı kaydın içinde görür.
function Mesajlar({ konu, karsiTaraf, depo, yapan }: { konu: string; karsiTaraf: string; depo: Depo; yapan: (h: Pick<Gecmis, 'u' | 'by'>) => string }) {
  const p = usePortal();
  const [metin, setMetin] = useState('');
  const mesajlar = Object.values(depo.messages).filter((m) => m.thread === konu).sort((a, b) => a.at.localeCompare(b.at));
  const gonder = usePortalKomutu(async (t: string) => {
    await kaydet('messages', { id: yeniKimlik('m'), thread: konu, from: 'firm', u: p.kisiKimligi, text: t, at: new Date().toISOString() });
    setMetin('');
  });
  const yolla = (o: FormEvent) => {
    o.preventDefault();
    const t = metin.trim();
    if (t) gonder.mutate(t);
  };
  return (
    <section className="tc-pt-pano" aria-labelledby="tc-pt-teklif-mesaj">
      <header className="tc-pt-pano-bas"><h3 id="tc-pt-teklif-mesaj">{`Mesajlar – ${karsiTaraf}`}</h3></header>
      {mesajlar.length === 0 ? <p className="tc-pt-bos">Soru veya not yazın; karşı taraf bu kaydın içinde görür.</p> : (
        <ul className="tc-pt-teklif-mesajlar">
          {mesajlar.map((m) => (
            <li key={m.id} data-ben={m.from === 'firm' || undefined}>
              <small>{`${yapan({ u: m.u, by: m.from })}, ${tarihSaat(m.at)}`}</small>
              {m.text}
            </li>
          ))}
        </ul>
      )}
      <form className="tc-pt-teklif-mesaj-form" aria-label="Mesaj gönder" onSubmit={yolla}>
        <input className="tc-alan-kutu" type="text" aria-label="Mesaj" placeholder="Mesaj yazın" autoComplete="off" value={metin} onChange={(o) => setMetin(o.target.value)} />
        <Dugme tur="birincil" type="submit" yukleniyor={gonder.isPending}>Gönder</Dugme>
      </form>
    </section>
  );
}
