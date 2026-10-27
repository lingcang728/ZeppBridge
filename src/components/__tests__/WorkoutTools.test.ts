import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as Vue from 'vue';
import { createRenderer, defineComponent, h, nextTick, ssrContextKey } from 'vue';
import { parse, compileScript } from '@vue/compiler-sfc';
import { compile } from '@vue/compiler-dom';
import WorkoutTools from '../WorkoutTools.vue';
import workoutToolsSource from '../WorkoutTools.vue?raw';
import { lastWorkoutEditId } from '../../lib/workoutEditHistory';
import { setLocale } from '../../i18n';

const api = vi.hoisted(() => ({
  getWorkoutTypeOptions: vi.fn(async () => [{ key: 'run' }]),
  editWorkouts: vi.fn(async () => ({ id: 'edit-1', changed: 2 })),
  undoWorkoutEdit: vi.fn(async () => 2),
  markDataChanged: vi.fn(),
}));

// Vitest's node transform supplies ssrRender; compile the same template for the
// in-memory client renderer so event wiring is exercised too.
const descriptor = parse(workoutToolsSource).descriptor;
const bindings = compileScript(descriptor, { id: 'workout-tools-test' }).bindings;
(WorkoutTools as unknown as { render: unknown }).render = new Function('Vue', compile(descriptor.template!.content, {
  mode: 'function', prefixIdentifiers: true, bindingMetadata: bindings,
}).code)(Vue);
vi.mock('../../composables/useTauriApi', () => ({
  tauriApi: api, toUserMessage: (_error: unknown, fallback: string) => fallback,
}));
vi.mock('../../composables/useSyncController', () => ({ useSyncController: () => api }));
vi.mock('../workout/TypePicker.vue', () => ({ default: defineComponent({
  emits: ['update:modelValue'],
  setup(_props, { emit }) { return () => h('button', { onClick: () => emit('update:modelValue', 'run') }, 'pick-run'); },
}) }));

// Exercise real Vue events/state without requiring a second browser or DOM package.
type Node = { type: string; text: string; props: Record<string, unknown>; children: Node[]; parent: Node | null };
const node = (type: string, text = ''): Node => ({ type, text, props: {}, children: [], parent: null });
const detach = (child: Node) => {
  if (child.parent) child.parent.children.splice(child.parent.children.indexOf(child), 1);
  child.parent = null;
};
const renderer = createRenderer<Node, Node>({
  createElement: (tag) => node(tag), createText: (text) => node('#text', text), createComment: (text) => node('#comment', text),
  setText: (el, text) => { el.text = text; }, setElementText: (el, text) => { el.text = text; el.children = []; },
  parentNode: (el) => el.parent,
  nextSibling: (el) => el.parent?.children[el.parent.children.indexOf(el) + 1] ?? null,
  patchProp: (el, key, _previous, value) => { el.props[key] = value; },
  insert: (child, parent, anchor) => { detach(child); child.parent = parent; const i = anchor ? parent.children.indexOf(anchor) : -1; parent.children.splice(i < 0 ? parent.children.length : i, 0, child); },
  remove: detach,
});
const all = (root: Node): Node[] => [root, ...root.children.flatMap(all)];
const textOf = (root: Node): string => root.text + root.children.map(textOf).join('');
const flush = async () => { await Promise.resolve(); await nextTick(); await Promise.resolve(); await nextTick(); };
const mount = (ids: string[], hidden = false, single = false) => {
  const root = node('root');
  const changed = vi.fn();
  const app = renderer.createApp(WorkoutTools, { ids, hidden, single, onChanged: changed });
  app.provide(ssrContextKey, {});
  app.mount(root);
  const click = async (label: string) => {
    const button = all(root).find((el) => el.type === 'button' && textOf(el) === label);
    expect(button, `button ${label}`).toBeDefined();
    expect(button!.props.disabled).not.toBe(true);
    await (button!.props.onClick as () => unknown)();
    await flush();
  };
  return { root, app, changed, click };
};

beforeEach(async () => {
  vi.clearAllMocks(); lastWorkoutEditId.value = null;
  await setLocale('en');
});

describe('workout edit controls', () => {
  it('sends every selected ID, including selections from earlier pages', async () => {
    const mounted = mount(['page-1', 'page-2']);
    expect(textOf(mounted.root)).toContain('2 selected');
    await mounted.click('pick-run');
    await mounted.click('Apply type');
    expect(api.editWorkouts).toHaveBeenCalledWith(['page-1', 'page-2'], true, 'run', null);
    expect(mounted.changed).toHaveBeenCalledWith(null);
    mounted.app.unmount();
  });

  it('keeps undo available after detail hiding navigates to a new list component', async () => {
    const detail = mount(['detail-id']);
    await detail.click('Hide on this device');
    expect(api.editWorkouts).toHaveBeenCalledWith(['detail-id'], false, null, true);
    detail.app.unmount();
    const list = mount([]);
    await list.click('Undo last change');
    expect(api.undoWorkoutEdit).toHaveBeenCalledWith('edit-1');
    expect(lastWorkoutEditId.value).toBeNull();
    list.app.unmount();
  });

  it('on a detail page offers only hiding, without the multi-select framing', async () => {
    const mounted = mount(['detail-id'], false, true);
    const buttons = all(mounted.root).filter((el) => el.type === 'button').map(textOf);
    expect(buttons).toEqual(['Hide on this device']);
    expect(textOf(mounted.root)).not.toContain('selected');
    await mounted.click('Hide on this device');
    expect(api.editWorkouts).toHaveBeenCalledWith(['detail-id'], false, null, true);
    expect(api.getWorkoutTypeOptions).not.toHaveBeenCalled();
    mounted.app.unmount();
  });

  it('restores hidden records and clears type overrides with distinct backend arguments', async () => {
    const mounted = mount(['hidden-id'], true);
    await mounted.click('Show again');
    expect(api.editWorkouts).toHaveBeenLastCalledWith(['hidden-id'], false, null, false);
    await mounted.click('Restore automatic detection');
    expect(api.editWorkouts).toHaveBeenLastCalledWith(['hidden-id'], true, null, null);
    mounted.app.unmount();
  });

  it('retains the undo receipt on a backend conflict and exposes an alert', async () => {
    lastWorkoutEditId.value = 'conflicting-edit';
    api.undoWorkoutEdit.mockRejectedValueOnce(new Error('conflict'));
    const mounted = mount([]);
    await mounted.click('Undo last change');
    expect(lastWorkoutEditId.value).toBe('conflicting-edit');
    expect(all(mounted.root).some((el) => el.props.role === 'alert')).toBe(true);
    mounted.app.unmount();
  });
});
