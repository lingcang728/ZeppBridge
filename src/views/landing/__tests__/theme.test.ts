import { afterEach, describe, expect, it, vi } from 'vitest';
import { applyLandingTheme, landingTheme, toggleLandingTheme } from '../theme';
afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });
describe('website instant theme switch', () => {
  it('uses system preference when storage is blocked and never snapshots the root', async () => {
    const startViewTransition=vi.fn();
    vi.stubGlobal('document',{documentElement:{dataset:{},style:{}},startViewTransition});
    vi.stubGlobal('window',{ localStorage:{getItem:()=>{throw new Error('blocked')},setItem:()=>{throw new Error('blocked')}},matchMedia:()=>({matches:true}) });
    applyLandingTheme();
    expect(landingTheme.value).toBe('dark');
    toggleLandingTheme({x:100,y:30}); toggleLandingTheme();
    expect(landingTheme.value).toBe('dark');
    expect(document.documentElement.style.colorScheme).toBe('only dark');
    expect(startViewTransition).not.toHaveBeenCalled();
  });
  it('honors a saved explicit choice over the system preference', async () => {
    const setItem=vi.fn();
    vi.stubGlobal('document',{documentElement:{dataset:{},style:{}}});
    vi.stubGlobal('window',{localStorage:{getItem:()=> 'light',setItem},matchMedia:()=>({matches:true})});
    applyLandingTheme();expect(landingTheme.value).toBe('light');
    toggleLandingTheme();expect(setItem).toHaveBeenCalledWith('zeppbridge-landing-theme','dark');
  });
});
