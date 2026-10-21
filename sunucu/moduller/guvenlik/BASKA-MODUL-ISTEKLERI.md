# guvenlik: başka modül istekleri

| Modül | İstek | Neden |
|---|---|---|
| ayarlar | KAPANDI (Aşama 1): son yedek sağlık modülünün `surecYedegi` okumasıyla (Sistem Ayarları yedek listesi) | Koruma "Yedek" maddesi |
| ayarlar | KAPANDI (Aşama 1): `guncellemeKanaliDurumu` | Koruma "Güncelleme imzası" |
| denetim | Yazılır durum KAPANDI (Aşama 1, `denetimDurumu`); yönetici işlemleri süzgeci AÇIK | Yönetici işlemleri ve koruma "Denetim kaydı"; bugün `/denetim` bağlantısı |
| smartes | AÇIK (Aşama 1.6): `smartes/ayar.ts` `kurumIciMi` kopyası çekirdekteki tek işlevi (`#cekirdek/kurum-ici.ts`) kullansın | Tek kural, tek test |
