/**
 * 同一时刻、同参数的只读查询合成一次 IPC（性能审计 04）。
 *
 * 设置页一进来，好几张卡同时挂载、各自去读同一样东西：应用状态读三次，覆盖账本、存储估计、备份列表、
 * 未知运动编号、本机接口状态各读两次——前后相隔一两百毫秒，参数一模一样。这里让它们拿同一份结果。
 *
 * 只有在「中间什么都没变」时才复用，规则很窄：
 * - 只登记在 SHARED 里的只读命令；
 * - 还在读的、或者回来不到 REUSE_MS 的才复用；
 * - 期间任何一个会写的命令完成了、或者后端发来了任何事件（同步进度、补拉进度、登录……），
 *   之前的结果一律不再复用——写完再读的人一定读到写之后的状态。
 * 失败的不复用；复用的人拿一份拷贝。
 */
const SHARED = new Set([
  'get_app_status',
  'get_coverage_ledger',
  'get_storage_estimate',
  'list_backups',
  'get_pending_restore',
  'get_unknown_workout_codes',
  'get_local_api_status',
]);

/** 这些前缀 / 命令只读，完成时不算「状态变了」。其余命令完成都当作可能写过。 */
const READ_ONLY = /^(get_|list_|plugin:event\||plugin:app\||app_is_ready$|ai_task_list$|ai_exchange_list$|training_plan_state$)/;

export const REUSE_MS = 1000;

type Flight = { epoch: number; settledAt: number | null; promise: Promise<unknown> };

let epoch = 0;
const flights = new Map<string, Flight>();

/** 状态可能变了：之前读的都不再复用。 */
export const stateChanged = () => {
  epoch += 1;
  flights.clear();
};

export const sharedCall = <T>(command: string, args: Record<string, unknown> | undefined, send: () => Promise<T>): Promise<T> => {
  if (!SHARED.has(command)) {
    const result = send();
    if (!READ_ONLY.test(command)) void result.then(stateChanged, stateChanged);
    return result;
  }
  const key = `${command}:${args ? JSON.stringify(args) : ''}`;
  const now = Date.now();
  const hit = flights.get(key);
  // 复用的人拿一份拷贝：两张卡的响应式状态不能共用同一个对象（谁原地改了另一张也跟着变）。
  if (hit && hit.epoch === epoch && (hit.settledAt === null || now - hit.settledAt < REUSE_MS)) {
    return hit.promise.then((value) => structuredClone(value)) as Promise<T>;
  }
  const flight: Flight = { epoch, settledAt: null, promise: Promise.resolve() };
  flight.promise = send().then(
    (value) => {
      flight.settledAt = Date.now();
      return value;
    },
    (cause: unknown) => {
      if (flights.get(key) === flight) flights.delete(key);
      throw cause;
    },
  );
  flights.set(key, flight);
  return flight.promise as Promise<T>;
};

/** 测试用。 */
export const resetSharedReads = () => {
  epoch = 0;
  flights.clear();
};
