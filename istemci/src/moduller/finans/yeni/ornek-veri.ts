import { addDays, type FinansMotoru, type MotorDurumu } from './motor.ts';

// Testlerin ortak girdisi. Firma ve kişi adları uydurmadır; bugün 15.10.2026.
export const ORNEK_BUGUN = '2026-10-15';

// Açılış nakdi 100.000; açık bir satış, iki açık alış, bir alınan çek, bir düzenli ödeme ve ödenmiş geçmiş.
export function ornekDurum(m: FinansMotoru): MotorDurumu {
  m.setToday(ORNEK_BUGUN);
  const s = m.emptyState();
  s.company.openingCash = 100000; s.company.openingDate = '2026-01-01'; s.company.threshold = 20000;
  s.scen.newBiz = false;
  s.tx.push(
    { id: 's1', type: 'gelir', cat: 'Satış', party: 'Deneme Musteri', date: '2026-10-01', due: '2026-10-29', amount: 50000, kdv: 20, status: 'acik' },
    { id: 'a1', type: 'gider', cat: 'Mal / hammadde', party: 'Deneme Tedarik', date: '2026-10-05', due: '2026-10-20', amount: 10000, kdv: 20, status: 'acik' },
    { id: 'a2', type: 'gider', cat: 'Mal / hammadde', party: 'Deneme Tedarik', date: '2026-09-01', due: '2026-10-01', amount: 2000, kdv: 20, status: 'acik' },
    { id: 's0', type: 'gelir', cat: 'Satış', party: 'Deneme Musteri', date: '2026-08-01', due: '2026-08-15', amount: 30000, kdv: 20, status: 'odendi', paidDate: '2026-08-15' },
  );
  s.cheques.push({ id: 'c1', dir: 'alinan', kind: 'Çek', party: 'Deneme Musteri', bank: 'B', no: '1', due: '2026-11-14', amount: 5000, status: 'portfoy' });
  s.recurring.push({ id: 'r1', name: 'Kira', cat: 'Kira', amount: 8000, day: 5 });
  return s;
}

// Son 12 ayda her ay bir satış ve bir alış (24 ödenmiş kayıt).
export function zenginlestir(s: MotorDurumu): void {
  for (let i = 1; i <= 12; i++) {
    const ay = addDays(ORNEK_BUGUN, -30 * i);
    s.tx.push({ id: 'zs' + i, type: 'gelir', cat: 'Satış', party: 'Deneme Musteri', date: ay, due: addDays(ay, 30), amount: 40000, kdv: 20, status: 'odendi', paidDate: addDays(ay, 30) });
    s.tx.push({ id: 'za' + i, type: 'gider', cat: 'Mal / hammadde', party: 'Deneme Tedarik', date: ay, due: addDays(ay, 20), amount: 25000, kdv: 20, status: 'odendi', paidDate: addDays(ay, 20) });
  }
}

export function bilancoDoldur(s: MotorDurumu): void {
  s.balance = { ...s.balance, donen: 400000, stok: 100000, kvb: 200000, toplamBorc: 250000, ozkaynak: 500000 };
}

// Bütün modelleri (anomali, Markov, karşılıksız çek, bütçe aşımı, geriye dönük sınama) çalıştıran geniş veri.
export function genisDurum(m: FinansMotoru): MotorDurumu {
  const s = ornekDurum(m);
  s.scen.newBiz = true;
  zenginlestir(s);
  bilancoDoldur(s);
  const musteriler = ['Deneme A', 'Deneme B', 'Deneme C', 'Deneme D'];
  for (let i = 1; i <= 20; i++) {
    const tarih = addDays(ORNEK_BUGUN, -17 * i);
    const party = musteriler[i % 4]!;
    const gec = (i % 4) * 9;
    const odendi = i > 3 && i % 5 !== 0;
    s.tx.push({ id: 'g' + i, type: 'gelir', cat: 'Ürün satışı', party, date: tarih, due: addDays(tarih, 30), amount: 10000 + i * 731, kdv: 20,
      status: odendi ? 'odendi' : 'acik', paidDate: odendi ? addDays(tarih, 30 + gec) : null });
    s.tx.push({ id: 'k' + i, type: 'gider', cat: i === 2 ? 'Enerji & faturalar' : 'Kira', party: 'Deneme Kiraci', date: tarih, due: tarih, amount: i === 2 ? 90000 : 6000 + (i % 3) * 50, kdv: 20,
      status: 'odendi', paidDate: tarih });
    s.tx.push({ id: 'e' + i, type: 'gider', cat: 'Enerji & faturalar', party: 'Deneme Enerji', date: tarih, due: addDays(tarih, 10), amount: 3000 + (i % 4) * 100, kdv: 20,
      status: i < 3 ? 'acik' : 'odendi', paidDate: i < 3 ? null : addDays(tarih, 10) });
  }
  s.cheques.push(
    { id: 'c2', dir: 'alinan', kind: 'Çek', party: 'Deneme B', date: '2026-06-01', due: '2026-07-01', amount: 7000, status: 'karsiliksiz' },
    { id: 'c3', dir: 'alinan', kind: 'Senet', party: 'Deneme C', date: '2026-09-01', due: '2026-11-01', amount: 9000, status: 'tahsilde' },
    { id: 'c4', dir: 'alinan', kind: 'Çek', party: 'Deneme C', date: '2026-09-10', due: '2026-12-01', amount: 21000, status: 'portfoy' },
    { id: 'c5', dir: 'verilen', kind: 'Çek', party: 'Deneme Tedarik', date: '2026-09-15', due: '2026-10-19', amount: 4000, status: 'bekliyor' },
    { id: 'c6', dir: 'alinan', kind: 'Çek', party: 'Deneme A', date: '2026-04-01', due: '2026-05-01', amount: 3000, status: 'tahsil' },
  );
  s.budget = { Kira: 1000, 'Enerji & faturalar': 500 };
  s.revenueTarget = 900000;
  s.amort = { '2026-09': 1500, '2026-08': 1500 };
  return s;
}
