import { useState } from 'react';
import { DurumKutusu, Dugme, FormPenceresi, Girdi, OnayPenceresi, Pencere, Secim, useBildirim } from '../../../../ortak/arayuz/index.ts';
import { hataIletisi } from '../../../../ortak/veri/api.ts';
import { useForm } from '../../../../ortak/veri/form.ts';
import { firmaEtiketleri } from '../akislar.ts';
import { tl, YOK } from '../bicim.ts';
import type { Belge, Odeme } from '../donustur.ts';
import { useFinansKomutu, type FinansVerisi, type FinansYetkisi } from '../veri.ts';
import {
  belgeIptalKomutu, cariIpucu, duzeltIlkDegerleri, duzeltKomutu, kategoriSecenekleri, kdvKilitli, kdvSecenekleri, odemeIptalKomutu, tutarKilitli,
  type DuzeltDegerleri,
} from './kurallar-duzelt.ts';

// Satıra tıklanınca açılan düzeltme penceresi (prototipte "Kaydı düzenle" çekmecesi). Belgenin satırı düzeltilir; avans
// satırı düzeltilmez, yalnız iptal edilir. İptal finans.yonet ister; asıl denetim uçtadır.

const SUNUCU_ALANLARI: Record<string, keyof DuzeltDegerleri> = {
  belgeTarihi: 'date', vade: 'due', tutar: 'amount', aciklama: 'desc', firmaId: 'party', kategori: 'cat', kdvOrani: 'kdv',
};

export function KayitPenceresi({ txId, finans, yetki, kapat }: { txId: string; finans: FinansVerisi; yetki: FinansYetkisi; kapat: () => void }) {
  const t = finans.motor.durum.tx.find((x) => x.id === txId);
  const belge = t?._belgeId !== undefined ? finans.V.belgeById.get(t._belgeId) : undefined;
  const odeme = t?._odemeId !== undefined ? finans.V.odemeById.get(t._odemeId) : undefined;
  if (belge && yetki.yaz) return <BelgeDuzelt belge={belge} finans={finans} yetki={yetki} kapat={kapat} />;
  return <KayitAyrintisi belge={belge} odeme={odeme} yetki={yetki} kapat={kapat} />;
}

function IptalDugmesi({ ad, komutKur, kapat }: { ad: string; komutKur: () => ReturnType<typeof belgeIptalKomutu>; kapat: () => void }) {
  const [soruyor, soruyorYaz] = useState(false);
  const komut = useFinansKomutu();
  const { bildir } = useBildirim();
  const iptalEt = () => {
    const k = komutKur();
    komut.mutate({ komutlar: [k] }, {
      onSuccess: () => { soruyorYaz(false); bildir('tamam', k.basari); kapat(); },
      onError: (h) => { soruyorYaz(false); bildir('hata', hataIletisi(h, 'İptal edilemedi.')); },
    });
  };
  return (
    <>
      <Dugme tur="tehlike" simge="x" onClick={() => soruyorYaz(true)}>İptal et</Dugme>
      <OnayPenceresi
        acik={soruyor} baslik={`${ad} iptal edilsin mi?`} onayMetni="İptali onayla" tehlikeli yukleniyor={komut.isPending}
        onayla={iptalEt} vazgec={() => soruyorYaz(false)}
      >
        <p>İptal edilen kayıt listeden ve hesaplardan çıkar; geri alınmaz.</p>
      </OnayPenceresi>
    </>
  );
}

function BelgeDuzelt({ belge: b, finans, yetki, kapat }: { belge: Belge; finans: FinansVerisi; yetki: FinansYetkisi; kapat: () => void }) {
  const { V, motor } = finans;
  const komut = useFinansKomutu();
  const { bildir } = useBildirim();
  const form = useForm<DuzeltDegerleri, string>({
    ilk: duzeltIlkDegerleri(V, b),
    hataIletisi: 'Belge düzeltilemedi.',
    alanEsle: (alan) => SUNUCU_ALANLARI[alan.split('.')[0] ?? ''] ?? null,
    dogrula: (d) => { const s = duzeltKomutu(V, b, d); return 'hata' in s ? { [s.alan]: s.hata } : {}; },
    kaydet: async (d) => {
      const s = duzeltKomutu(V, b, d);
      if ('hata' in s) throw new Error(s.hata);
      await komut.mutateAsync({ komutlar: [s.komut] });
      return s.komut.basari;
    },
    basarili: (ileti) => { bildir('tamam', ileti); kapat(); },
  });
  const d = form.degerler;
  const tutar = Number(d.amount) || 0, kdv = Number(d.kdv) || 0;
  const ipucu = cariIpucu(motor, b.yon, d.party);
  const firmali = b.firmaId !== null;

  return (
    <FormPenceresi acik kapat={kapat} baslik="Kaydı düzenle" form={form} kaydetMetni="Değişiklikleri kaydet">
      <div className="tc-fk-form">
        <p className="tc-fk-not">{b.yon === 'gelir' ? 'Gelir (satış)' : 'Gider (alış / ödeme)'}{b.belgeNo ? ` · belge no ${b.belgeNo}` : ''}</p>
        <Girdi etiket="Belge tarihi" type="date" required {...form.alan('date')} />
        <Secim etiket="Kategori" secenekler={kategoriSecenekleri(b).map((k) => ({ deger: k, baslik: k }))} {...form.alan('cat')} />
        {firmali && (
          <>
            <Girdi
              etiket={b.yon === 'gelir' ? 'Müşteri' : 'Tedarikçi / alıcı'} required list="tc-fk-firmalar" autoComplete="off"
              placeholder="Cari adı" {...form.alan('party')}
            />
            <datalist id="tc-fk-firmalar">{firmaEtiketleri(V, b.yon).map((e) => <option key={e} value={e} />)}</datalist>
            {ipucu && <p className="tc-fk-not" data-ton={ipucu.ton ?? undefined}>{ipucu.metin}</p>}
          </>
        )}
        <Girdi etiket="Açıklama" placeholder="Fatura numarası veya not" {...form.alan('desc')} />
        <Girdi
          etiket={`Tutar (KDV hariç${b.paraBirimi !== 'TRY' ? `, ${b.paraBirimi}` : ''})`} type="number" min="0" step="0.01" inputMode="decimal"
          disabled={tutarKilitli(b)} {...(tutarKilitli(b) ? { ipucu: 'Döviz belgesinde tutar ve kur değişmez; yanlışsa belgeyi iptal edip yeniden girin.' } : {})}
          {...form.alan('amount')}
        />
        <Secim
          etiket="KDV oranı" disabled={kdvKilitli(b)} secenekler={kdvSecenekleri(b).map((k) => ({ deger: String(k), baslik: k ? `%${k}` : 'KDV yok' }))}
          {...(kdvKilitli(b) ? { ipucu: `Tevkifatlı belge (${b.tevkifatPay}/${b.tevkifatPayda}); KDV oranı değişmez.` } : {})}
          {...form.alan('kdv')}
        />
        {tutar > 0 && !tutarKilitli(b) && (
          <p className="tc-fk-not">KDV {tl(tutar * kdv / 100)}, KDV dahil toplam <b>{tl(tutar * (1 + kdv / 100))}</b></p>
        )}
        <Girdi etiket="Vade tarihi" type="date" {...form.alan('due')} />
        {yetki.yonet && (
          <div className="tc-fk-dugmeler">
            <IptalDugmesi ad="Belge" komutKur={() => belgeIptalKomutu(b)} kapat={kapat} />
          </div>
        )}
      </div>
    </FormPenceresi>
  );
}

// Düzeltilemeyen satır (avans) ya da yazma yetkisi olmayan kullanıcı: bilgi ve (yonet ise) iptal.
function KayitAyrintisi({ belge, odeme, yetki, kapat }: { belge: Belge | undefined; odeme: Odeme | undefined; yetki: FinansYetkisi; kapat: () => void }) {
  const iptal = yetki.yonet && (belge || odeme);
  return (
    <Pencere acik kapat={kapat} baslik="Kayıt" tur="yan" alt={<Dugme onClick={kapat}>Kapat</Dugme>}>
      <div className="tc-fk-form">
        {!belge && !odeme && <DurumKutusu durum="bos" mesaj="Kayıt bulunamadı." />}
        {odeme && (
          <>
            <p className="tc-fk-not">Bu kayıt düzeltilemez (avans ya da ödeme kaydı).</p>
            <p>{odeme.yon === 'gelir' ? 'Faturaya dağıtılmamış tahsilat' : 'Faturaya dağıtılmamış ödeme'}: <b>{tl(Number(odeme.kalan) * Number(odeme.kur))}</b></p>
            <p className="tc-fk-not">Faturaya düşmek için "Avansı faturaya mahsup et" olayını kullanın.</p>
          </>
        )}
        {belge && !yetki.yaz && <p className="tc-fk-not">Düzeltme yetkiniz yok. Belge no: {belge.belgeNo ?? YOK}</p>}
        {iptal && (
          <div className="tc-fk-dugmeler">
            <IptalDugmesi ad={belge ? 'Belge' : 'Ödeme'} komutKur={() => (belge ? belgeIptalKomutu(belge) : odemeIptalKomutu(odeme!))} kapat={kapat} />
          </div>
        )}
      </div>
    </Pencere>
  );
}
