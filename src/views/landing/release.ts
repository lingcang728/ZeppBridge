/* 落地页读取 /api/release 得到的最新发行信息的形状（从 LandingPage.vue 搬出来）。 */

export type DownloadPlatform = 'windows' | 'macos';

export interface ReleaseAsset {
  /** 这个下载项还没有经过真实设备验证。目前只有 Linux 的四个包会带上它。 */
  preview?: boolean;
  name: string;
  url: string;
  size: number;
  digest: string | null;
}

export interface LatestRelease {
  version: string;
  tagName: string;
  publishedAt: string;
  releaseUrl: string;
  downloads: {
    windowsExe: ReleaseAsset;
    windowsMsi: ReleaseAsset;
    macosDmg: ReleaseAsset;
    /*
     * Linux 四个包。**可选**：它们从 2.0.0 才开始有，而这个页面还要能对着
     * 更早的 latest release 正常渲染。
     *
     * `preview` 由 /api/release 给，不写死在页面上——写死的话，等哪天真的
     * 有人在 Linux 上跑通了登录和密钥环，没人会记得回来删那句话。
     */
    linuxDeb?: ReleaseAsset;
    linuxRpm?: ReleaseAsset;
    linuxAppImage?: ReleaseAsset;
    linuxFlatpak?: ReleaseAsset;
  };
}
