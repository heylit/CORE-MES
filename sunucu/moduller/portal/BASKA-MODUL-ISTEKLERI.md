# portal: başka modül istekleri

- `kisiler` (`sunucu/moduller/kisiler/disari.ts`): `kisileriListele(db: Db)`; var olan imza, değişiklik istenmez. Etkin kişilerin no ve adı
  çerçevedeki kişi aramasına ve ada çevirmeye gider (`GET /portal/kisiler`).
- `kisiler` (`sunucu/moduller/kisiler/disari.ts`): `kisiGorevi(db: Db, kisiId: number): Promise<string | null>` (kart #1163, #1174 ile geldi).
  Portal açılışta kişinin görevini unvan olarak yazar (`users/tmi-<no>.unvan`).
- `denetim`, `oturum` (yalnız testte): `denetimYaz`, `kimlikCozucu`; `kisiler`: `yoneticiOlustur`, `rolAta`, `rolAl` (testte geçici rol).
