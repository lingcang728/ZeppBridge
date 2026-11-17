# 从 Microsoft Store 安装的 ZeppBridge

[English](microsoft-store.md)

商店版和 GitHub 下载的是同一个应用，只有三处不同。

## 数据放在哪

GitHub 版把库放在程序旁边的 `data/`。商店版用自己的目录：

```text
%LOCALAPPDATA%\Packages\LincStudio.ZeppBridge_pwftgd5x5w3va\LocalState\ZeppBridge\data
```

卸载商店版时 Windows 会连同这个目录（包括数据库）一起删掉。想留着就先做快照或导出。

## 从 GitHub 版搬过来

第一次启动时可以导入 GitHub 版的数据目录，或者从空库开始。导入前先关掉 GitHub 版（以及其他正在用这个库的程序）。导入只读源文件：把数据库复制到商店版自己的目录并检查完整性，原目录不动。失败或中途被打断不会留下导了一半的库，可以重试。

登录、官方授权和本机 API 密钥**不会**带过来：两版用的是不同的系统凭据服务。在商店版里重新登录，并把新的本机 API 密钥配给用它的客户端。

## CLI 与 MCP

商店包注册两套命令名：

| | CLI | MCP |
|---|---|---|
| 通用名称 | `zeppbridge-cli.exe` | `zeppbridge-mcp.exe` |
| 商店专用名称 | `zeppbridge-store-cli.exe` | `zeppbridge-store-mcp.exe` |

两版都装了的时候，通用名称启动哪一个由 Windows 决定。要确定用商店版就用 `zeppbridge-store-*`；要用 GitHub 版就写它程序旁边的完整路径。设置页给商店版生成的 MCP 配置已经用了商店专用名称和它的数据目录。

## 更新

商店版通过 Microsoft Store 更新，不带 GitHub 更新器。
