# PawnIO (offline installer payload)

This folder holds the **official unmodified** `PawnIO_setup.exe` used by the
Watch X Windows installer so setup does **not** need network access.

```bash
npm run fetch:vendor
```

Silent install arguments (used by NSIS):

```text
PawnIO_setup.exe -install -silent
```

Source releases: https://github.com/namazso/PawnIO.Setup/releases
