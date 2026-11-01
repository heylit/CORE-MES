import assert from 'node:assert/strict';
import { test } from 'node:test';
import { KONUM_TURLERI } from '#paylasilan/sozlesme/stok.ts';
import { tohumOku, turlarlaSina, type Uretec } from '#paylasilan/test-fiksturleri/tohumlu.ts';
import { AYRILMIS_KONUM_TURLERI, binde, bindenMetin, cikisOnerisi, type OneriSatiri } from './kurallar.ts';

// ADR 0025 kural 7, ilk değişmez: çıkış önerisi (DEP-05/06/07/08) hiçbir bakiyeden bakiyesinden fazlasını ayırmaz, istenenden ve
// kullanılabilir toplamdan fazlasını önermez. Girdiler tohumdan üretilir; veriler uydurmadır.
const tohum = tohumOku(process.env['TMIV2_TEST_TOHUM']);
const ONERI_DISI = new Set<string>(['fason', 'uretim_cikisi', 'istasyon', ...AYRILMIS_KONUM_TURLERI]);

// Binde birim: eksi bakiye, sıfır ve küsuratlı miktar da üretilir.
const miktar = (u: Uretec): string => bindenMetin(u.olasilik(0.15) ? 0n : BigInt(u.tamSayi(-2_000_000, 50_000_000)));
const satirlar = (u: Uretec): OneriSatiri[] => Array.from({ length: u.tamSayi(0, 12) }, (_, i) => ({
  bakiyeId: i + 1, konumId: u.tamSayi(1, 6), konumKod: `K${String(i)}`, konumTur: u.sec(KONUM_TURLERI),
  partiId: u.olasilik(0.5) ? u.tamSayi(1, 4) : null, partiEtiketi: null, miktar: miktar(u),
  ilkGiris: new Date(Date.UTC(2026, 0, u.tamSayi(1, 28), u.tamSayi(0, 23))).toISOString(),
}));

test('çıkış önerisi değişmezi: öneri bakiyeyi, istenen miktarı ve kullanılabilir toplamı aşmaz; her bakiye en çok bir kez', () => {
  turlarlaSina('stok çıkış önerisi', tohum === undefined ? {} : { tohum }, (u) => {
    const girdi = satirlar(u);
    const istenen = bindenMetin(BigInt(u.tamSayi(0, 200_000_000)));
    const sonuc = cikisOnerisi(girdi, istenen);
    const uygun = girdi.filter((s) => !ONERI_DISI.has(s.konumTur) && binde(s.miktar) > 0n);
    const mevcut = uygun.reduce((t, s) => t + binde(s.miktar), 0n);
    assert.equal(sonuc.veriYetersiz, uygun.length === 0);
    assert.equal(binde(sonuc.mevcut), mevcut);
    const kullanilan = new Set<number>();
    let toplam = 0n;
    for (const o of sonuc.oneriler) {
      const kaynak = uygun.find((s) => s.bakiyeId === o.bakiyeId);
      assert.ok(kaynak, `öneri kullanılamaz bakiyeden: ${String(o.bakiyeId)}`);
      assert.ok(!kullanilan.has(o.bakiyeId), `bakiye iki kez önerildi: ${String(o.bakiyeId)}`);
      kullanilan.add(o.bakiyeId);
      assert.ok(binde(o.miktar) > 0n && binde(o.miktar) <= binde(kaynak.miktar), `öneri bakiyeyi aşıyor: ${o.miktar} > ${kaynak.miktar}`);
      toplam += binde(o.miktar);
    }
    assert.ok(toplam <= binde(istenen) && toplam <= mevcut, `toplam öneri ${bindenMetin(toplam)} sınırı aşıyor`);
    if (!sonuc.veriYetersiz) {
      assert.equal(sonuc.yeterli, mevcut >= binde(istenen));
      if (sonuc.yeterli) assert.equal(toplam, binde(istenen));
      else assert.equal(toplam, mevcut);
    }
  });
});
