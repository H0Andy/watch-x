; Custom NSIS hooks for Watch X
; electron-builder already registers an uninstaller in Apps & Features.
;
; Offline install: PawnIO is shipped as the official unmodified installer
; under resources\vendor\PawnIO\ — no download during setup.

!macro customHeader
  !system "echo Building Watch X installer"
!macroend

!macro customInstall
  ; Ensure Start Menu shortcut folder exists
  CreateDirectory "$SMPROGRAMS\Watch X"

  ; Install bundled PawnIO (offline) if not already present.
  ; Path: $INSTDIR\resources\vendor\PawnIO\PawnIO_setup.exe (extraResources)
  StrCpy $0 "$INSTDIR\resources\vendor\PawnIO\PawnIO_setup.exe"
  IfFileExists "$0" 0 skip_pawnio

  ReadRegStr $1 HKLM "SYSTEM\CurrentControlSet\Services\PawnIO" "ImagePath"
  StrCmp $1 "" 0 skip_pawnio_already

  DetailPrint "Installing bundled PawnIO driver (offline, official installer)..."
  ClearErrors
  ; PawnIO_setup may request UAC itself if the NSIS process is not elevated.
  ExecWait '"$0" -install -silent' $2
  DetailPrint "PawnIO installer exit code: $2"
  Goto skip_pawnio

  skip_pawnio_already:
  DetailPrint "PawnIO already installed — skipping bundled installer"
  skip_pawnio:
!macroend

!macro customUnInstall
  ; Remove Start Menu shortcuts created by the installer
  RMDir /r "$SMPROGRAMS\Watch X"
  Delete "$DESKTOP\Watch X.lnk"
  ; Do not uninstall PawnIO — it may be shared with other tools.
!macroend
