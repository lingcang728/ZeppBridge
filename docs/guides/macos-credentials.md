# macOS credential storage

[简体中文](macos-credentials.zh-CN.md)

ZeppBridge uses macOS Keychain by default. If your login keychain is managed,
locked, or you cannot supply its password, you can explicitly choose file
storage instead. This option addresses [issue #72](https://github.com/lingcang728/ZeppBridge/issues/72).
It does not require changing or resetting the system keychain.

## Use a file instead of Keychain

The file contains **plaintext tokens**. ZeppBridge creates `credentials.json`
with permissions `0600` (only your user can read and write it), and restricts its
data directory to `0700`. This provides less protection than Keychain: another
process running as your user can read it. Keep this file out of shared folders,
Git, and shared copies of your data directory.

1. Install the version containing this fix in `/Applications`.
2. **Quit ZeppBridge completely**, including the menu bar instance. Closing its
   window is not enough: a second launch only activates the existing process,
   which still has its original storage choice.
3. In Terminal, run:

   ```sh
   ZEPPBRIDGE_CREDENTIAL_STORE=file /Applications/ZeppBridge.app/Contents/MacOS/zeppbridge
   ```

   Adjust the application path if you installed it elsewhere. Keep the terminal
   open during this first run. This command sets the storage choice for that
   process; it contains no token and needs no administrator privileges.
4. Connect your Zepp account in Settings. Web sign-in, HAR import, and manual
   entry all use the selected file store. Existing health records are retained.
   If your token exists only in the locked keychain, sign in again: ZeppBridge
   cannot retrieve or migrate that inaccessible token.
5. After the sign-in is saved, quit the app. You can now launch it normally
   from Finder or the Dock. An existing `credentials.json` in the same data
   directory makes ZeppBridge keep using file storage without the environment
   variable.

Use **Settings → Advanced → Open data folder** to locate the active data
directory. `auth.json` still contains only account and region metadata. The
separate `credentials.json` holds the tokens, including the local API token if
you enable that feature. Both the app and its CLI use the same storage choice
when they use the same data directory.

## Selection and switching back

- `ZEPPBRIDGE_CREDENTIAL_STORE=file` explicitly selects file storage.
- `ZEPPBRIDGE_CREDENTIAL_STORE=keychain` explicitly selects Keychain, even if a
  credential file exists. `keyring` is an alias for `keychain`.
- Without a setting (or with an empty value), an existing credential file is
  reused; otherwise Keychain is used. A Keychain failure never silently writes
  tokens to disk.
- Unknown values are errors. Linux's `env` and `secret-service` choices are not
  supported on macOS.

Logging out deletes the Zepp token from the selected store and keeps your health
records. If the local API has a token, it stays in the file. When the last token
is deleted, the file is removed; a later launch with no explicit setting then
uses Keychain again. Repeat the file-storage launch command before reconnecting
if your keychain is still unavailable.

To return permanently to Keychain, quit the app, launch with `keychain` in the
command above, and sign in again. Once that succeeds, quit and remove only
`credentials.json` from the active data directory. This removes the old file
copy and any file-stored local API token; API clients may need a new token.
Switching storage does not migrate or erase entries in the other store.

## Verification boundary

The macOS CI tests cover file permissions, saving, restoring in a fresh process
without the environment variable, legacy metadata migration, local API tokens,
and logout. A real managed Mac still needs an end-to-end sign-in and sync check;
CI does not reproduce your organization's keychain policy or Touch ID prompts.
