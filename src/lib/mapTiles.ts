/*
 * 运动详情的在线地图图层（可选，默认本地画布）。
 *
 * 只有一个瓦片源，写在这里：CSP 的 img-src、opener 的署名链接放行、文档里的对外主机清单
 * 都要跟着它改。OSM 的瓦片使用政策要求带合规 Referer / UA（WebView2 默认带
 * `http://tauri.localhost/`，2026-10-13 用同内核 Edge 实测拿到的是真图），并且署名常显、
 * 不预取、不离线、不批量下载——地图组件按这几条配置，不要加「预先缓存周边瓦片」。
 *
 * 坐标系：现在能画的轨迹都来自旧连接器，2026-10-09 在真实库上叠 OSM 实测是 WGS-84，
 * 原样就贴路，不换算。官方 FIT / sportDetail 轨迹带 `zepp_coord_system`（1 = GCJ-02），
 * 接进来时要在入库或进这里之前换成 WGS-84。
 */

export interface TileProvider {
  /** Leaflet 的 URL 模板。 */
  url: string;
  /** CSP img-src 里放行的那一个源；改 url 必须同步改 tauri.conf.json。 */
  origin: string;
  maxZoom: number;
  /** 署名文字（不翻译，按 OSM 要求原样显示）。 */
  attribution: string;
  /** 点署名打开的页面；也登记在 capabilities 的 opener 放行名单里。 */
  attributionUrl: string;
}

export const MAP_TILES: TileProvider = {
  url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
  origin: 'https://tile.openstreetmap.org',
  maxZoom: 19,
  attribution: '© OpenStreetMap',
  attributionUrl: 'https://www.openstreetmap.org/copyright',
};

export type RouteViewMode = 'local' | 'map';

const CONSENT_KEY = 'zeppbridge-route-map-consent';
const MODE_KEY = 'zeppbridge-route-map-mode';

/** 用户点过「一直开」：以后打开地图不再提示。 */
export const mapAlwaysAllowed = (): boolean => {
  try {
    return window.localStorage.getItem(CONSENT_KEY) === 'always';
  } catch {
    return false;
  }
};

export const allowMapAlways = (): void => {
  try {
    window.localStorage.setItem(CONSENT_KEY, 'always');
  } catch {
    // 写不进就只在这次生效，下次再问。
  }
};

/** 运动详情一打开显示哪一种：只有「一直开」之后才可能记住地图，默认永远是本地画布。 */
export const initialRouteMode = (): RouteViewMode => {
  if (!mapAlwaysAllowed()) return 'local';
  try {
    return window.localStorage.getItem(MODE_KEY) === 'map' ? 'map' : 'local';
  } catch {
    return 'local';
  }
};

export const rememberRouteMode = (mode: RouteViewMode): void => {
  if (!mapAlwaysAllowed()) return;
  try {
    window.localStorage.setItem(MODE_KEY, mode);
  } catch {
    // 同上。
  }
};
