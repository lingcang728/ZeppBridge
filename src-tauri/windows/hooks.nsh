; "Delete the application data" on uninstall.
;
; The Tauri template only removes %APPDATA% / %LOCALAPPDATA% folders named after the
; bundle id. ZeppBridge keeps its library in data\ next to the exe (database, auth
; metadata, WebView login state), its tokens in Windows Credential Manager, and 2.x may
; have left a copy in %APPDATA%\zeppbridge\ZeppBridge that the next launch moves back in.
; With the box ticked nothing was removed, and a reinstall brought the old account and
; devices back (user report, 2026-10). Updates run with /UPDATE and never reach this.

!macro NSIS_HOOK_PREUNINSTALL
  ${If} $DeleteAppDataCheckboxState = 1
  ${AndIf} $UpdateMode <> 1
    ; While the exe still exists, let it delete the tokens of the accounts recorded in
    ; its data folder (src-tauri/src/uninstall.rs). Entry names are per account id.
    IfFileExists "$INSTDIR\${MAINBINARYNAME}.exe" 0 +2
      ExecWait '"$INSTDIR\${MAINBINARYNAME}.exe" --purge-credentials'
  ${EndIf}
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
  ; The workout-feedback toast registers a display name for its AppUserModelID and the
  ; zeppbridge: link its buttons use (src-tauri/src/feedback_toast.rs). Both point at this
  ; install, so they go with it whether or not the data box is ticked.
  ${If} $UpdateMode <> 1
    DeleteRegKey HKCU "Software\Classes\zeppbridge"
    DeleteRegKey HKCU "Software\Classes\AppUserModelId\com.zeppbridge.app"
  ${EndIf}
  ${If} $DeleteAppDataCheckboxState = 1
  ${AndIf} $UpdateMode <> 1
    RmDir /r "$INSTDIR\data"
    RMDir "$INSTDIR"
    SetShellVarContext current
    RmDir /r "$APPDATA\zeppbridge\ZeppBridge"
    RMDir "$APPDATA\zeppbridge"
  ${EndIf}
!macroend
