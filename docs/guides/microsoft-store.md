# ZeppBridge from the Microsoft Store

[简体中文](microsoft-store.zh-CN.md)

The Store build is the same app as the GitHub download, with three differences.

## Where your data lives

The GitHub build keeps its library in `data/` next to the program. The Store build uses its own folder:

```text
%LOCALAPPDATA%\Packages\LincStudio.ZeppBridge_pwftgd5x5w3va\LocalState\ZeppBridge\data
```

Uninstalling the Store app makes Windows delete this folder, database included. Take a snapshot or export first if you want to keep anything.

## Moving over from the GitHub build

On first launch you can import a GitHub build's data folder or start with an empty library. Close the GitHub build (and anything else using that library) first. The import only reads the source: it copies the database into the Store build's own folder, checks it, and leaves the original untouched. If it fails or is interrupted, nothing is half-imported and you can try again.

Sign-in, the official authorization and local API keys are **not** copied: the two builds use different credential stores. Sign in again in the Store build, and give clients of the local API the new key.

## CLI and MCP

The Store package registers two pairs of command names:

| | CLI | MCP |
|---|---|---|
| Shared names | `zeppbridge-cli.exe` | `zeppbridge-mcp.exe` |
| Store-only names | `zeppbridge-store-cli.exe` | `zeppbridge-store-mcp.exe` |

If both builds are installed, Windows decides which one the shared names start. Use `zeppbridge-store-*` to be sure you get the Store build, or the full path next to the program for the GitHub build. The MCP configuration that Settings generates for the Store build already uses the Store-only name and its data folder.

## Updates

The Store build updates through the Microsoft Store; it has no built-in GitHub updater.
