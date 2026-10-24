import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import type { BelgeCevabi } from '#paylasilan/sozlesme/portal.ts';
import { CokSatir, Dugme, DurumKutusu, FormPenceresi, Rozet, SayfaBasligi, useBildirim, type RozetTonu } from '../../../../ortak/arayuz/index.ts';
import { useForm } from '../../../../ortak/veri/form.ts';
import { para, sayi, tarihSaat } from '../bicim.ts';
import { ibanBicimi, ibanGecerli, ONAY_TURLERI, onaylayabilirMi } from '../kurallar.ts';
import { sahibi } from '../sahibinde.tsx';
import type { GorunumOzellikleri } from '../sekmeler.ts';
import type { Depo, KoleksiyonAdi, Onay } from '../tipler.ts';
import { hataMetni, kaydet, kayit, koleksiyonOku, onayKarari, portalAnahtarlari, usePortal, usePortalDeposu, type PortalBaglami } from '../veri.ts';
import { ETKI_KOLEKSIYONLARI, kararBuradaMi, kararIletisi, onayEtkisi, type OnayEtkisi } from './etki.ts';
import './onaylar.css';

// Onay kartı (prototip approvalsView satırı) ve tek onayın sayfası. Karar penceresi prototipin apdecide penceresidir: ret gerekçe
// ister; kişi, zaman ve adım rolünü sunucu yazar.

export const ONAY_KOLEKSIYONLARI: readonly KoleksiyonAdi[] = ['approvals', 'users', 'parties', 'settings'];

export const DURUMLAR: Readonly<Record<Onay['status'], readonly [string, RozetTonu]>> = {
  pending: ['Onay bekliyor', 'uyari'], approved: ['Onaylandı', 'tamam'], rejected: ['Reddedildi', 'hata'],
};
const ADIM_DURUMLARI: Readonly<Record<Onay['status'], readonly [string, RozetTonu]>> = {
  pending: ['Bekliyor', 'uyari'], approved: ['Onayladı', 'tamam'], rejected: ['Reddetti', 'hata'],
};

// Onayın bağlı olduğu kaydın görünümü (prototip AP_REF).
const KAYIT_GORUNUMLERI: Readonly<Record<string, string>> = {
  orders: 'order', payments: 'pay', parties: 'party', requests: 'sale', priceReqs: 'pricereq', contracts: 'contract',
};

const firmaAdi = (d: Depo, kurumAdi: string, id: string | undefined): string => (id === 'firm' ? kurumAdi : (id && d.parties[id]?.name) || '');

// Prototip userLabel: "Ad (Firma)".
export function talepEden(d: Depo, kurumAdi: string, kimlik: string): string {
  const u = d.users[kimlik];
  return u ? `${u.name} (${firmaAdi(d, kurumAdi, u.partyId)})` : firmaAdi(d, kurumAdi, undefined);
}

// Taşınan kayıt yeni ekranda, taşınmayan sahibinde açılır (230 a). Satın alma onayı yalnız satın alma siparişine bağlanır.
export function kayitYolu(a: Onay, p: Pick<PortalBaglami, 'yol'>): string | null {
  const v = KAYIT_GORUNUMLERI[a.refCol];
  if (!v) return null;
  if (v === 'sale') return p.yol('sale', a.refId);
  return sahibi(v, v === 'order' ? 'purchase' : null).yol;
}

function nesne(x: unknown): Record<string, unknown> | null {
  return typeof x === 'object' && x !== null ? (x as Record<string, unknown>) : null;
}

function OnayNotu({ a }: { a: Onay }) {
  const y = nesne(a.payload);
  if (!y) return null;
  if (a.kind === 'discount') {
    const s = nesne(y['version']);
    if (!s) return null;
    return (
      <p className="tc-pt-onaylar-not">
        {`İskonto %${sayi(Number(s['discount'] ?? 0))}, ${String(s['payment'] ?? '')}, ${String(s['deliveryDays'] ?? '')} gün teslim. ${String(s['note'] ?? '')}`}
      </p>
    );
  }
  if (a.kind === 'iban') {
    const iban = typeof y['iban'] === 'string' ? y['iban'] : '';
    return (
      <p className="tc-pt-onaylar-not">
        {`Yeni hesap: ${String(y['bank'] ?? '')}, ${ibanBicimi(iban)}${ibanGecerli(iban) ? ' (IBAN biçimi doğrulandı)' : ''}. Kontrol: banka yazısı, imza sirküleri ve kayıtlı telefondan sözlü teyit.`}
      </p>
    );
  }
  if (a.kind === 'pricereq' && typeof y['price'] === 'number') return <p className="tc-pt-onaylar-not">{`Onaylanacak fiyat ${para(y['price'])}.`}</p>;
  return null;
}

export function OnayKarti({ a, depo, ayrinti = false }: { a: Onay; depo: Depo; ayrinti?: boolean }) {
  const p = usePortal();
  const [karar, setKarar] = useState<boolean | null>(null);
  const [durum, ton] = DURUMLAR[a.status];
  const kayitAdresi = kayitYolu(a, p);
  const verebilir = onaylayabilirMi(a, p.onaylayan);
  const baslik = `${ONAY_TURLERI[a.kind]}: ${a.title}`;
  return (
    <article className="tc-pt-onaylar-kart" aria-label={baslik}>
      <header className="tc-pt-onaylar-kart-bas">
        <div>
          {ayrinti ? <b>{baslik}</b> : <Link to={p.yol('approvals', a.id)}><b>{baslik}</b></Link>}
          <span className="tc-pt-onaylar-no">{a.no}</span>
        </div>
        <Rozet ton={ton}>{durum}</Rozet>
      </header>
      <p className="tc-pt-onaylar-bilgi">
        {a.amount !== null && <><b>{para(a.amount)}</b>, </>}
        {`talep eden ${talepEden(depo, p.kurumAdi, a.requestedBy)}, ${tarihSaat(a.at)}`}
        {kayitAdresi && <> · <Link to={kayitAdresi}>Kaydı aç</Link></>}
      </p>
      <OnayNotu a={a} />
      <ul className="tc-pt-onaylar-adimlar" aria-label="Onay adımları">
        {a.steps.map((s, i) => {
          const [m, t] = ADIM_DURUMLARI[s.status];
          return (
            <li key={`${s.role}-${String(i)}`}>
              <b>{s.role}</b>
              <Rozet ton={t}>{m}</Rozet>
              {s.u && <small>{depo.users[s.u]?.name ?? ''}</small>}
            </li>
          );
        })}
      </ul>
      {a.steps.filter((s) => s.note).map((s, i) => <p key={`${s.role}-not-${String(i)}`} className="tc-pt-onaylar-adim-notu">{`${s.role}: ${s.note ?? ''}`}</p>)}
      {verebilir && (kararBuradaMi(a) ? (
        <div className="tc-pt-onaylar-eylemler">
          <Dugme tur="birincil" simge="check" onClick={() => setKarar(true)}>Onayla</Dugme>
          <Dugme tur="tehlike" simge="x" onClick={() => setKarar(false)}>Reddet</Dugme>
        </div>
      ) : (
        <p className="tc-pt-onaylar-eski">
          {`${ONAY_TURLERI[a.kind]} kararı şimdilik eski ekranda verilir. `}
          <Link to={sahibi('approvals').yol}>Eski ekranda aç</Link>
        </p>
      ))}
      {karar !== null && <KararPenceresi a={a} ok={karar} kapat={() => setKarar(null)} />}
    </article>
  );
}

interface KararSonucu { onay: Onay | null; etkiHatasi: string | null }

// Karar verilir; onay karara bağlandıysa bağlı kaydın sonucu güncel sürümüyle yazılır. Karar yazıldıktan sonra sonucun yazımı
// düşerse karar geri alınamaz: kişiye ayrı bildirilir.
async function kararVer(a: Onay, ok: boolean, not: string, p: PortalBaglami): Promise<KararSonucu> {
  const cevap: BelgeCevabi = await onayKarari(a.id, ok, not);
  const yeni = cevap.belge ? kayit<Onay>(cevap.belge) : null;
  if (!yeni || yeni.status === 'pending') return { onay: yeni, etkiHatasi: null };
  const koleksiyon = ETKI_KOLEKSIYONLARI[a.kind];
  if (!koleksiyon) return { onay: yeni, etkiHatasi: null };
  try {
    const guncel = await koleksiyonOku(koleksiyon);
    const etki: OnayEtkisi | null = onayEtkisi(yeni, guncel[a.refId], { kullaniciKimligi: p.kisiKimligi, simdi: p.simdi, kurumAdi: p.kurumAdi });
    if (etki === null) return { onay: yeni, etkiHatasi: 'Bağlı kayıt okunamadı; kayıt güncellenmedi.' };
    await etkiYaz(etki);
    return { onay: yeni, etkiHatasi: null };
  } catch (e) {
    return { onay: yeni, etkiHatasi: hataMetni(e, 'Bağlı kayıt güncellenemedi.') };
  }
}

function etkiYaz(e: OnayEtkisi): Promise<BelgeCevabi> {
  switch (e.koleksiyon) {
    case 'orders': return kaydet('orders', e.kayit);
    case 'payments': return kaydet('payments', e.kayit);
    case 'parties': return kaydet('parties', e.kayit);
    case 'contracts': return kaydet('contracts', e.kayit);
  }
}

function KararPenceresi({ a, ok, kapat }: { a: Onay; ok: boolean; kapat: () => void }) {
  const p = usePortal();
  const istemci = useQueryClient();
  const { bildir } = useBildirim();
  const form = useForm<{ not: string }, KararSonucu>({
    ilk: { not: '' },
    dogrula: (v): Record<string, string> => (!ok && v.not.trim() === '' ? { not: 'Gerekçe yazın.' } : {}),
    kaydet: async (v) => {
      try {
        return await kararVer(a, ok, v.not.trim(), p);
      } finally {
        void istemci.invalidateQueries({ queryKey: portalAnahtarlari.koleksiyonlar });
      }
    },
    basarili: (s) => {
      kapat();
      bildir('tamam', s.onay ? kararIletisi(s.onay) : ok ? 'Onaylandı' : 'Reddedildi');
      if (s.etkiHatasi) bildir('hata', `Karar kaydedildi, ancak: ${s.etkiHatasi}`);
    },
    hataIletisi: 'Onay verilemedi.',
  });
  const sira = a.steps.find((s) => s.status === 'pending');
  return (
    <FormPenceresi acik kapat={kapat} baslik={`${ok ? 'Onayla' : 'Reddet'}: ${ONAY_TURLERI[a.kind]}`} form={form} kaydetMetni={ok ? 'Onayla' : 'Reddet'}>
      <p>{`${a.title}${a.amount !== null ? `, ${para(a.amount)}` : ''}. Sıradaki adım: ${sira?.role ?? ''}.`}</p>
      <CokSatir etiket={ok ? 'Not (isteğe bağlı)' : 'Gerekçe'} required={!ok} {...form.alan('not')} />
    </FormPenceresi>
  );
}

// Tek onay: kart ve geçmişi. Bildirim ve iş merkezi hareketleri onaya kimlikle gelir.
export function OnayAyrintisi({ id }: GorunumOzellikleri) {
  const p = usePortal();
  const { depo, yukleniyor, hata, yenile } = usePortalDeposu(ONAY_KOLEKSIYONLARI);
  if (yukleniyor) return <DurumKutusu durum="yukleniyor" />;
  if (hata) return <DurumKutusu durum="hata" mesaj="Onay okunamadı." yenile={yenile} />;
  const a = id ? depo.approvals[id] : undefined;
  if (!a) {
    return (
      <DurumKutusu durum="bos" mesaj="Onay kaydı bulunamadı.">
        <Link to={p.yol('approvals')}>Onay kutusuna dön</Link>
      </DurumKutusu>
    );
  }
  return (
    <div className="tc-pt-onaylar">
      <SayfaBasligi baslik={a.no} simge="check" alt={<Link to={p.yol('approvals')}>Onay kutusuna dön</Link>} />
      <OnayKarti a={a} depo={depo} ayrinti />
      <section className="tc-pt-pano" aria-labelledby="tc-pt-onaylar-gecmis">
        <header className="tc-pt-pano-bas"><h3 id="tc-pt-onaylar-gecmis">Geçmiş</h3></header>
        {(a.history ?? []).length === 0 ? <p className="tc-pt-bos">Geçmiş yok.</p> : (
          <ul className="tc-pt-onaylar-gecmis">
            {[...(a.history ?? [])].reverse().map((h, i) => (
              <li key={`${h.at}-${String(i)}`}>
                <span>{h.text}</span>
                <small>{`${talepEden(depo, p.kurumAdi, h.u ?? '') || firmaAdi(depo, p.kurumAdi, h.by)}, ${tarihSaat(h.at)}`}</small>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
