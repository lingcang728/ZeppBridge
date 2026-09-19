# Data preservation during macOS updates

The September 14 reporter video shows ZeppBridge 2.2.2 updating to 2.4.0,
followed by an empty device list and a missing account. In 2.2.2, a writable
`ZeppBridge.app/Contents/MacOS/data` was used as the data directory. Replacing
the app bundle could therefore remove both the database and account metadata.
This was a storage-location problem; the video does not establish a Keychain failure.

Current builds use the user Application Support data directory for app bundles
and copy a surviving legacy bundle library there, including a consistent SQLite
snapshot. The bundle rule also applies when the app is under a build-cache path.
The account token remains in the selected credential store.

The migration tolerates Finder leftovers (`.DS_Store`, `logs/`, `webview/`,
interrupted staging folders) at the destination — those are moved aside, never
deleted. It stops only when the destination holds real data of its own, because
two accounts' libraries are never merged. Symbolic links inside the bundle are
recreated as links rather than followed or refused, and a bundle library whose
SQLite file will not open for an online backup is copied verbatim so the normal
corruption-recovery path can take over.

Before downloading and again before installing an in-app update, ZeppBridge
checks the resolved executable and data locations. An unreadable path or a
custom data directory inside the bundle, including a symlink into it, stops the
update. The app does not silently switch accounts or create an empty library.

If an old version still has data inside its bundle, quit it and **copy the entire
data folder outside the app before updating**, retaining the original. The
default macOS destination is
`~/Library/Application Support/com.zeppbridge.ZeppBridge/data`.
Do not overwrite an existing destination library. If `ZEPPBRIDGE_DATA_DIR` is
set, point it at the preserved external directory. Launch the new version and
verify the account, devices and history before removing any backup.

These checks run in the version performing the update. They cannot protect an
already installed 2.2.2 updater retroactively. Startup migration cannot recover
a bundle that has already been replaced; recovery then requires a surviving
copy (for example Time Machine), or signing in again and synchronizing cloud
history. Local-only settings need a backup.

## 高频心率调查 / High-frequency heart-rate investigation

On September 19, a read-only request to the configured account's
`/users/me/fileInfo/events`, with `eventType=second_heart_rate` and
`subType=real_data`, returned seven daily index entries. Each entry contained
millisecond timestamps and `SEC_HR` file references with `fileId`, `s`, `e`, `u`
and `dateString`. The index did **not** contain BPM measurements or download URLs.
The public [reference client](https://github.com/m4ary/zepp-health-cli) also
implements this index only.

No verified download/decoder contract was obtained in this investigation.
Consequently the minute-level source is retained, and this change does **not**
claim to deliver high-frequency BPM data. Millisecond timestamp precision is
not millisecond sampling. A follow-up needs a verified file retrieval contract
and decoded measurements before changing the source or claiming raw export
contains those measurements. No interpolation or invented samples are used.

中文：视频中的旧版把数据放在 app 包内，替换 app 时可能一起删除。新版已有外部
数据目录和迁移逻辑，本次补上安装前检查以及整包替换回归测试。已经被旧更新器
删除的数据无法凭空恢复。心率目前只确认高频文件索引存在，尚未取得可验证的
文件下载及解码协议，因此不能称为已解决，也不能宣称已有毫秒级心率导出。

Español: La versión antigua podía guardar datos dentro del paquete de la app.
La actualización podía eliminarlos al reemplazarlo. Esta corrección comprueba
la ubicación antes de instalar. No recupera datos ya eliminados. Se confirmó
un índice de archivos de frecuencia cardíaca de alta frecuencia, pero no un
protocolo verificado para descargarlos y decodificarlos; esa parte sigue pendiente.
