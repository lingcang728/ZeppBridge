"""Opt-in packaged smoke on an unshown Windows desktop and a fresh temp library.

Prepare only: python verify-native.py --help
Run after packaging: python verify-native.py --run --expected-version 3.0.9-beta.11
No mouse input, desktop switching, real-library access, login or product test API.
"""
import argparse
import csv
import ctypes as C
from ctypes import wintypes as W
import hashlib
import json
import os
from pathlib import Path
import socket
import shutil
import sqlite3
import subprocess
import tempfile
import time
import urllib.request


def wait_for(fn, timeout=40):
    deadline = time.monotonic() + timeout
    last = None
    while time.monotonic() < deadline:
        try:
            value = fn()
            if value:
                return value
        except Exception as exc:
            last = str(exc)
        time.sleep(0.25)
    raise AssertionError(f"Condition timed out: {last}")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--run', action='store_true', help='Explicitly start the newly packaged EXE')
    parser.add_argument('--exe', type=Path, default=Path(__file__).resolve().parents[2] / 'release/ZeppBridge.exe')
    parser.add_argument('--cli', type=Path, help='Optional newly packaged CLI; omitted checks are recorded')
    parser.add_argument('--expected-version', default='3.0.9-beta.11')
    parser.add_argument('--output', type=Path, default=Path(__file__).with_name('native-results.json'))
    args = parser.parse_args()
    if not args.run:
        print('Prepared only. Pass --run after the intended package is ready.')
        return
    if os.name != 'nt':
        raise SystemExit('Windows only')
    exe = args.exe.resolve(strict=True)
    # Read file metadata before launching: an old beta must never be used silently.
    version = subprocess.check_output(
        ['powershell.exe', '-NoProfile', '-NonInteractive', '-Command',
         '(Get-Item -LiteralPath $env:ZEPPBRIDGE_QA_EXE).VersionInfo.ProductVersion'],
        env={**os.environ, 'ZEPPBRIDGE_QA_EXE': str(exe)},
        creationflags=0x08000000, text=True).strip()
    if version != args.expected_version:
        raise SystemExit(f'Refusing package version {version!r}; expected {args.expected_version!r}')
    running = subprocess.check_output(['tasklist.exe', '/FI', 'IMAGENAME eq ZeppBridge.exe', '/FO', 'CSV', '/NH'],
                                      creationflags=0x08000000, text=True)
    if any(row and row[0].lower() == 'zeppbridge.exe' for row in csv.reader(running.splitlines())):
        raise SystemExit('Existing ZeppBridge process detected; refusing single-instance handoff to a real session')
    from playwright.sync_api import sync_playwright

    k = C.WinDLL('kernel32', use_last_error=True)
    u = C.WinDLL('user32', use_last_error=True)
    class STARTUPINFO(C.Structure):
        _fields_ = [('cb', W.DWORD), ('reserved', W.LPWSTR), ('desktop', W.LPWSTR), ('title', W.LPWSTR),
                    ('x', W.DWORD), ('y', W.DWORD), ('xs', W.DWORD), ('ys', W.DWORD),
                    ('xc', W.DWORD), ('yc', W.DWORD), ('fill', W.DWORD), ('flags', W.DWORD),
                    ('show', W.WORD), ('reserved2', W.WORD), ('reservedptr', C.c_void_p),
                    ('stdin', W.HANDLE), ('stdout', W.HANDLE), ('stderr', W.HANDLE)]
    class PROCESSINFO(C.Structure):
        _fields_ = [('process', W.HANDLE), ('thread', W.HANDLE), ('pid', W.DWORD), ('tid', W.DWORD)]
    class BASIC_LIMIT(C.Structure):
        _fields_ = [('process_time', C.c_longlong), ('job_time', C.c_longlong), ('flags', W.DWORD),
                    ('min_working', C.c_size_t), ('max_working', C.c_size_t), ('active_limit', W.DWORD),
                    ('affinity', C.c_size_t), ('priority', W.DWORD), ('scheduling', W.DWORD)]
    class IO_COUNTERS(C.Structure):
        _fields_ = [(name, C.c_ulonglong) for name in ['read_ops', 'write_ops', 'other_ops', 'read_bytes', 'write_bytes', 'other_bytes']]
    class EXTENDED_LIMIT(C.Structure):
        _fields_ = [('basic', BASIC_LIMIT), ('io', IO_COUNTERS), ('process_memory', C.c_size_t),
                    ('job_memory', C.c_size_t), ('peak_process_memory', C.c_size_t), ('peak_job_memory', C.c_size_t)]
    u.CreateDesktopW.argtypes = [W.LPCWSTR, W.LPCWSTR, C.c_void_p, W.DWORD, W.DWORD, C.c_void_p]
    u.CreateDesktopW.restype = W.HANDLE
    u.CloseDesktop.argtypes = [W.HANDLE]
    u.PostMessageW.argtypes = [W.HWND, W.UINT, W.WPARAM, W.LPARAM]
    u.IsWindowVisible.argtypes = [W.HWND]
    u.GetWindowThreadProcessId.argtypes = [W.HWND, C.POINTER(W.DWORD)]
    u.GetWindowTextW.argtypes = [W.HWND, W.LPWSTR, C.c_int]
    callback_type = C.WINFUNCTYPE(W.BOOL, W.HWND, W.LPARAM)
    u.EnumDesktopWindows.argtypes = [W.HANDLE, callback_type, W.LPARAM]
    k.CreateJobObjectW.argtypes = [C.c_void_p, W.LPCWSTR]
    k.CreateJobObjectW.restype = W.HANDLE
    k.SetInformationJobObject.argtypes = [W.HANDLE, C.c_int, C.c_void_p, W.DWORD]
    k.AssignProcessToJobObject.argtypes = [W.HANDLE, W.HANDLE]
    k.TerminateJobObject.argtypes = [W.HANDLE, W.UINT]
    k.CreateProcessW.argtypes = [W.LPCWSTR, W.LPWSTR, C.c_void_p, C.c_void_p, W.BOOL, W.DWORD,
                                 C.c_void_p, W.LPCWSTR, C.POINTER(STARTUPINFO), C.POINTER(PROCESSINFO)]
    k.ResumeThread.argtypes = [W.HANDLE]
    k.WaitForSingleObject.argtypes = [W.HANDLE, W.DWORD]
    k.CloseHandle.argtypes = [W.HANDLE]
    k.CreateFileW.argtypes = [W.LPCWSTR, W.DWORD, W.DWORD, C.c_void_p, W.DWORD, W.DWORD, W.HANDLE]
    k.CreateFileW.restype = W.HANDLE
    def checked(ok):
        if not ok:
            raise C.WinError(C.get_last_error())
        return ok

    root = Path(tempfile.mkdtemp(prefix='zeppbridge-beta11-native-')).resolve()
    source_exe = exe
    (root/'bin').mkdir()
    exe = root/'bin'/'ZeppBridge.exe'
    shutil.copy2(source_exe, exe)
    assert hashlib.sha256(source_exe.read_bytes()).digest() == hashlib.sha256(exe.read_bytes()).digest()
    data = root / 'library'
    data.mkdir()
    desktop_name = 'ZeppBridgeRepairQA_' + str(os.getpid())
    desktop = checked(u.CreateDesktopW(desktop_name, None, None, 0, 0x01FF, None))
    job = checked(k.CreateJobObjectW(None, None))
    limit = EXTENDED_LIMIT()
    limit.basic.flags = 0x2000  # JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE
    checked(k.SetInformationJobObject(job, 9, C.byref(limit), C.sizeof(limit)))
    env = dict(os.environ)
    env.update(ZEPPBRIDGE_DATA_DIR=str(data), ZEPPBRIDGE_UPDATE_ENDPOINT='http://127.0.0.1:1/latest.json')
    # Legacy relocation does not honor DATA_DIR isolation by itself. Redirect
    # every legacy/profile candidate and run an exact binary copy away from release/data.
    for key, dirname in [('APPDATA','roaming'), ('LOCALAPPDATA','local'), ('USERPROFILE','profile'), ('HOME','profile')]:
        folder = root/dirname
        folder.mkdir(exist_ok=True)
        env[key] = str(folder)
    with socket.socket() as sock:
        sock.bind(('127.0.0.1', 0))
        port = sock.getsockname()[1]
    env['WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS'] = f'--remote-debugging-port={port}'
    env['NO_PROXY'] = 'localhost,127.0.0.1,::1'
    envblock = C.create_unicode_buffer('\0'.join(f'{key}={value}' for key, value in sorted(env.items(), key=lambda x:x[0].upper())) + '\0\0')
    startup, proc = STARTUPINFO(), PROCESSINFO()
    startup.cb = C.sizeof(startup)
    startup.desktop = 'winsta0\\' + desktop_name
    startup.flags, startup.show = 1, 0  # SW_HIDE; desktop remains unshown even if app later shows its window.
    result = {'exe': str(source_exe), 'executed_copy': str(exe), 'sha256': hashlib.sha256(exe.read_bytes()).hexdigest(), 'version': version,
              'data_dir': str(data), 'desktop': desktop_name, 'cdp_port': port, 'checks': [], 'skipped': [], 'limitations': [
                  'No reporter hardware reproduction; no claim that #143 is fully resolved.',
                  'Native HWND close and existing restart IPC exercised; no new product test API.',
                  'No Shell tray menu selection: private desktop has no Explorer notification area.']}
    browser = None
    lock = None
    def passed(name, **details):
        result['checks'].append({'name': name, **details})
        print('PASS', name, flush=True)
    def logs():
        return '\n'.join(p.read_text(encoding='utf-8', errors='replace') for p in (data/'logs').glob('zeppbridge.log*'))
    def get_window():
        found = []
        @callback_type
        def visit(hwnd, _):
            title = C.create_unicode_buffer(512)
            u.GetWindowTextW(hwnd, title, len(title))
            if title.value == 'ZeppBridge':
                pid = W.DWORD()
                u.GetWindowThreadProcessId(hwnd, C.byref(pid))
                found.append((hwnd, pid.value))
            return True
        checked(u.EnumDesktopWindows(desktop, visit, 0))
        return found[0] if found else None
    try:
        checked(k.CreateProcessW(str(exe), C.create_unicode_buffer(subprocess.list2cmdline([str(exe)])),
                                 None, None, False, 0x00000404, envblock, str(root), C.byref(startup), C.byref(proc)))
        checked(k.AssignProcessToJobObject(job, proc.process))
        checked(k.ResumeThread(proc.thread) != 0xFFFFFFFF)
        k.CloseHandle(proc.thread)
        wait_for(lambda: 'Startup: database and application state ready' in logs()
                 and 'Main webview page load: Finished' in logs(), 60)
        passed('packaged native startup and webview load on private desktop')
        result['webview_processes'] = subprocess.check_output(
            ['powershell.exe', '-NoProfile', '-NonInteractive', '-Command',
             f'Get-CimInstance Win32_Process -Filter "ParentProcessId={proc.pid}" | Select-Object ProcessId,Name,CommandLine | ConvertTo-Json -Compress'],
            creationflags=0x08000000, text=True).strip()
        hwnd, pid = wait_for(get_window)
        assert pid == proc.pid, (pid, proc.pid)
        checked(u.PostMessageW(hwnd, 0x0010, 0, 0))
        wait_for(lambda: not u.IsWindowVisible(hwnd))
        assert k.WaitForSingleObject(proc.process, 0) == 258
        assert 'Main window hidden to tray' in logs()
        passed('native WM_CLOSE hides to tray and retains process')
        direct_http = urllib.request.build_opener(urllib.request.ProxyHandler({}))
        def cdp_up():
            with direct_http.open(f'http://127.0.0.1:{port}/json/version', timeout=1) as response:
                return json.load(response)
        wait_for(cdp_up, 60)
        with sync_playwright() as pw:
            def attach():
                connection = pw.chromium.connect_over_cdp(f'http://127.0.0.1:{port}', timeout=10000)
                page = wait_for(lambda: next((p for context in connection.contexts for p in context.pages
                                              if 'tauri.localhost' in p.url), None))
                page.wait_for_function('!!window.__TAURI_INTERNALS__')
                page.wait_for_function("window.__TAURI_INTERNALS__.invoke('app_is_ready')", timeout=60000)
                return connection, page
            browser, page = attach()
            def ipc(name, **values):
                return page.evaluate('(input)=>window.__TAURI_INTERNALS__.invoke(input.name,input.values)',
                                     {'name': name, 'values': values})
            runtime_version = ipc('plugin:app|version')
            assert runtime_version == args.expected_version, runtime_version
            assert str(data) in logs(), 'App did not confirm the isolated data directory'
            status = ipc('get_app_status')
            passed('packaged app ready in isolated library', runtime_version=runtime_version,
                   status_keys=sorted(status.keys()))
            # Synthetic fixture only: never read/copy a user database.
            with sqlite3.connect(data/'zepp.db') as db:
                db.execute("INSERT INTO workouts(workout_id,workout_type,start_time,end_time,source_scope,synced_at) VALUES(?,?,?,?,?,?)",
                           ('native-qa-synthetic', 'run', '2026-10-23T01:00:00Z', '2026-10-23T01:05:00Z', 'user_fused', '2026-10-24T01:00:00Z'))
            assert any(w['workout_id']=='native-qa-synthetic' for w in ipc('get_workout_page', limit=20, offset=0)['items'])
            edit = ipc('edit_workouts', workoutIds=['native-qa-synthetic'], changeType=False, workoutType=None, hidden=True)
            assert not ipc('get_workout_page', limit=20, offset=0)['items']
            assert ipc('get_hidden_workout_page', limit=20, offset=0)['total'] == 1
            assert ipc('undo_workout_edit', id=edit['id']) == 1
            assert ipc('get_workout_page', limit=20, offset=0)['total'] == 1
            passed('native IPC synthetic workout hide and undo restore')
            if args.cli:
                cli = args.cli.resolve(strict=True)
                completed = subprocess.run([str(cli), 'status', '--json'], env=env, cwd=root,
                                           capture_output=True, text=True, creationflags=0x08000000, timeout=30)
                assert completed.returncode == 0, completed.stderr
                cli_status = json.loads(completed.stdout)
                passed('packaged CLI reads same isolated library', cli=str(cli), keys=sorted(cli_status.keys()))
            else:
                result['skipped'].append('Packaged CLI not supplied; CLI acceptance not claimed.')
            lock = k.CreateFileW(str(data/'zepp.db.write-lock'), 0xC0000000, 0, None, 4, 0x80, None)
            if lock == C.c_void_p(-1).value:
                raise C.WinError(C.get_last_error())
            baseline = logs().count('收到退出请求')
            page.evaluate("() => { void window.__TAURI_INTERNALS__.invoke('plugin:process|restart'); return true; }")
            wait_for(lambda: logs().count('收到退出请求') > baseline)
            page.evaluate("() => { void window.__TAURI_INTERNALS__.invoke('plugin:process|restart'); return true; }")
            wait_for(lambda: logs().count('收到退出请求') >= baseline+2)
            time.sleep(1)
            assert k.WaitForSingleObject(proc.process, 0) == 258, 'Repeated restart bypassed active writer'
            passed('repeated restart waits while another writer owns library lock')
            k.CloseHandle(lock)
            lock = None
            wait_for(lambda: k.WaitForSingleObject(proc.process, 0) == 0)
            wait_for(lambda: '退出：写入已结束，继续退出' in logs())
            wait_for(cdp_up, 60)
            browser, page = attach()
            assert ipc('plugin:app|version') == args.expected_version
            assert ipc('get_workout_page', limit=20, offset=0)['total'] == 1
            assert 'Application panic:' not in logs()
            passed('writer release permits restart and persisted synthetic data survives')
            result['ok'] = True
    except Exception as exc:
        result['ok'] = False
        result['error'] = f'{type(exc).__name__}: {exc}'
        names = [entry['name'] for entry in result['checks']]
        if 'packaged app ready in isolated library' not in names:
            result['skipped'].extend([
                'Native IPC readiness and synthetic workout hide/undo: CDP was not attached.',
                'Repeated restart while write lock is held, writer-release restart and persistence: not executed.',
                'Packaged CLI in this script: not reached; see any separately recorded CLI result.'
            ])
        raise
    finally:
        if lock:
            k.CloseHandle(lock)
        k.TerminateJobObject(job, 0)
        k.CloseHandle(job)
        if proc.process:
            k.WaitForSingleObject(proc.process, 5000)
            k.CloseHandle(proc.process)
        u.CloseDesktop(desktop)
        result['log'] = logs()
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
        print(f'Report: {args.output}', flush=True)


if __name__ == '__main__':
    main()
