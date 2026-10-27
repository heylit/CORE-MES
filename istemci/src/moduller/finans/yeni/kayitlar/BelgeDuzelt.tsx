import { useState } from 'react';
import { DurumKutusu, Dugme, FormPenceresi, Girdi, Pencere, Secim, useBildirim } from '../../../../ortak/arayuz/index.ts';
import { hataIletisi } from '../../../../ortak/veri/api.ts';
import { useForm } from '../../../../ortak/veri/form.ts';
import { tl } from '../bicim.ts';
import type { Belge, Odeme } from '../donustur.ts';
import { CATS, type Islem, type IslemDurumu, type IslemTuru } from '../motor.ts';
import { useFinansKomutu, type FinansVerisi, type FinansYetkisi } from '../veri.ts';
import {
  belgeIptalKomutu, cariIpucu, cariOnerileri, duzeltIlkDegerleri, duzeltKomutu, kategoriSecenekleri, KDV_SECENEKLERI, odemeIptalKomutu,
  type DuzeltDegerleri,
} from './kurallar-duzelt.ts';

// Satıra tıklanınca açılan "Kaydı düzenle" penceresi (prototipte tx çekmecesi). Her satırda aynı form açılır; belge düzeltilir,
// avans ya da ödeme satırı kaydedilmez (prototipteki ileti). İptal finans.yonet ister; asıl denetim uçtadır.

const SUNUCU_ALANLARI: Record<string, keyof DuzeltDegerleri> = {
  belgeTarihi: 'date', vade: 'due', tutar: 'amount', aciklama: 'desc', firmaId: 'party', kategori: 'cat', kdvOrani: 'kdv',
};
const TURLER: readonly [IslemTuru, string][] = [['gelir', 'Gelir (satış)'], ['gider', 'Gider (alış / ödeme)']];
const DURUMLAR = ['acik', 'odendi', 'cek'] as const satisfies readonly IslemDurumu[];
const DUZELTILEMEZ = 'Bu kayıt düzeltilemez (avans ya da ödeme kaydı).';

export function KayitPenceresi({ txId, finans, yetki, kapat }: { txId: string; finans: FinansVerisi; yetki: FinansYetkisi; kapat: () => void }) {
  const t = finans.motor.durum.tx.find((x) => x.id === txId);
  if (!t) {
    return (
      <Pencere acik kapat={kapat} baslik="Kaydı düzenle" tur="yan" alt={<Dugme onClick={kapat}>Kapat</Dugme>}>
        <DurumKutusu durum="bos" mesaj="Kayıt bulunamadı." />
      </Pencere>
    );
  }
  const belge = t._belgeId !== undefined ? finans.V.belgeById.get(t._belgeId) : undefined;
  const odeme = t._odemeId !== undefined ? finans.V.odemeById.get(t._odemeId) : undefined;
  return <KayitDuzelt t={t} belge={belge} odeme={odeme} finans={finans} yetki={yetki} kapat={kapat} />;
}

// Prototipteki satır içi iki adımlı iptal: "İptal et" düğmesi "İptali onayla"ya döner.
function IptalDugmesi({ belge, odeme, kapat }: { belge: Belge | undefined; odeme: Odeme | undefined; kapat: () => void }) {
  const [soruyor, soruyorYaz] = useState(false);
  const komut = useFinansKomutu();
  const { bildir } = useBildirim();
  const iptalEt = () => {
    const k = belge ? belgeIptalKomutu(belge) : odeme ? odemeIptalKomutu(odeme) : null;
    if (!k) { soruyorYaz(false); bildir('hata', 'Bu kayıt iptal edilemez.'); return; }
    komut.mutate({ komutlar: [k] }, {
      onSuccess: () => { bildir('tamam', k.basari); kapat(); },
      onError: (h) => { soruyorYaz(false); bildir('hata', hataIletisi(h, 'İptal edilemedi.')); },
    });
  };
  return soruyor
    ? <Dugme tur="tehlike" yukleniyor={komut.isPending} onClick={iptalEt}>İptali onayla</Dugme>
    : <Dugme simge="x" onClick={() => soruyorYaz(true)}>İptal et</Dugme>;
}

function KayitDuzelt({ t, belge: b, odeme, finans, yetki, kapat }: {
  t: Islem; belge: Belge | undefined; odeme: Odeme | undefined; finans: FinansVerisi; yetki: FinansYetkisi; kapat: () => void;
}) {
  const { V, motor } = finans;
  const komut = useFinansKomutu();
  const { bildir } = useBildirim();
  const form = useForm<DuzeltDegerleri, string>({
    ilk: duzeltIlkDegerleri(t),
    hataIletisi: 'Belge düzeltilemedi.',
    alanEsle: (alan) => SUNUCU_ALANLARI[alan.split('.')[0] ?? ''] ?? null,
    dogrula: (d) => {
      if (!b) return {};
      const s = duzeltKomutu(V, b, d);
      return 'hata' in s ? { [s.alan]: s.hata } : {};
    },
    kaydet: async (d) => {
      if (!b) throw new Error(DUZELTILEMEZ);
      const s = duzeltKomutu(V, b, d);
      if ('hata' in s) throw new Error(s.hata);
      await komut.mutateAsync({ komutlar: [s.komut] });
      return s.komut.basari;
    },
    basarili: (ileti) => { bildir('tamam', ileti); kapat(); },
  });
  const d = form.degerler;
  const tutar = Number(d.amount) || 0, kdv = Number(d.kdv) || 0;
  const ipucu = cariIpucu(motor, d.type, d.party);
  const gelir = d.type === 'gelir';
  const turSec = (tur: IslemTuru) => form.degistir({ type: tur, cat: CATS[tur][0]?.k ?? '' });

  return (
    <FormPenceresi acik kapat={kapat} baslik="Kaydı düzenle" form={form} kaydetMetni="Değişiklikleri kaydet">
      <div className="tc-fk-form">
        <div className="tc-fk-cipler" role="radiogroup" aria-label="Tür">
          {TURLER.map(([k, l]) => (
            <Dugme key={k} role="radio" aria-checked={d.type === k} aria-pressed={d.type === k} onClick={() => turSec(k)}>{l}</Dugme>
          ))}
        </div>
        <Girdi etiket="Belge tarihi" type="date" required {...form.alan('date')} />
        <Secim etiket="Kategori" secenekler={kategoriSecenekleri(d.type).map((k) => ({ deger: k, baslik: k }))} {...form.alan('cat')} />
        <Girdi
          etiket={gelir ? 'Müşteri' : 'Tedarikçi / alıcı'} required list="tc-fk-cariler" autoComplete="off" placeholder="Cari adı" {...form.alan('party')}
        />
        <datalist id="tc-fk-cariler">{cariOnerileri(motor.durum.tx, d.type).map((e) => <option key={e} value={e} />)}</datalist>
        {ipucu && <p className="tc-fk-not" data-ton={ipucu.ton ?? undefined}>{ipucu.metin}</p>}
        <Girdi etiket="Açıklama" placeholder="Fatura numarası veya not" {...form.alan('desc')} />
        <Girdi etiket="Tutar (KDV hariç)" type="number" min="0" step="0.01" inputMode="decimal" required {...form.alan('amount')} />
        <Secim etiket="KDV oranı" secenekler={KDV_SECENEKLERI.map((k) => ({ deger: String(k), baslik: k ? `%${k}` : 'KDV yok' }))} {...form.alan('kdv')} />
        {tutar > 0 && <p className="tc-fk-not">KDV {tl(tutar * kdv / 100)}, KDV dahil toplam <b>{tl(tutar * (1 + kdv / 100))}</b></p>}
        <Secim
          etiket="Ödeme durumu"
          secenekler={[
            { deger: 'acik', baslik: `Vadeli, henüz ${gelir ? 'tahsil edilmedi' : 'ödenmedi'}` },
            { deger: 'odendi', baslik: gelir ? 'Tahsil edildi' : 'Ödendi' },
            { deger: 'cek', baslik: 'Çek veya senetle kapandı' },
          ]}
          value={d.status}
          onChange={(o) => { const v = DURUMLAR.find((x) => x === o.target.value); if (v) form.degistir({ status: v }); }}
        />
        {d.status === 'acik' && <Girdi etiket="Vade tarihi" type="date" {...form.alan('due')} />}
        {d.status === 'odendi' && <Girdi etiket={`${gelir ? 'Tahsil' : 'Ödeme'} tarihi`} type="date" {...form.alan('paidDate')} />}
        {d.status === 'cek' && <p className="tc-fk-not">Çeki veya senedi ayrıca Çek ve senet ekranına ekleyin; nakit, çek tahsil edildiğinde sayılır.</p>}
        {yetki.yonet && (
          <div className="tc-fk-dugmeler">
            <IptalDugmesi belge={b} odeme={odeme} kapat={kapat} />
          </div>
        )}
      </div>
    </FormPenceresi>
  );
}
