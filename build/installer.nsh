; Custom NSIS hooks for Watch X
; electron-builder already registers an uninstaller in Apps & Features.

!macro customHeader
  !system "echo Building Watch X installer"
!macroend

!macro customInstall
  ; Ensure Start Menu shortcut folder exists
  CreateDirectory "$SMPROGRAMS\Watch X"
!macroend

!macro customUnInstall
  ; Remove Start Menu shortcuts created by the installer
  RMDir /r "$SMPROGRAMS\Watch X"
  Delete "$DESKTOP\Watch X.lnk"
!macroend
