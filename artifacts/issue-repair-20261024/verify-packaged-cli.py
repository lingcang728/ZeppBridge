import json
import os
from pathlib import Path
import sqlite3
import subprocess
import tempfile

root = Path(__file__).resolve().parents[2]
native = json.loads((Path(__file__).with_name('native-results-2.json')).read_text(encoding='utf-8'))
data = Path(native['data_dir']).resolve()
assert data.is_relative_to(Path(tempfile.gettempdir()).resolve())
assert data.parent.name.startswith('zeppbridge-beta11-native-')
env = {**os.environ, 'ZEPPBRIDGE_DATA_DIR': str(data)}
exe = root / 'release/zeppbridge-cli.exe'
commands = []

def cli(*args, expected=0):
    process = subprocess.run([str(exe), *args, '--json'], env=env, capture_output=True, text=True, timeout=30, creationflags=0x08000000)
    result = json.loads(process.stdout)
    commands.append({'args': list(args), 'exit': process.returncode, 'result': result})
    assert process.returncode == expected, (args, process.returncode, result, process.stderr)
    return result

with sqlite3.connect(data / 'zepp.db') as db:
    assert db.execute('PRAGMA user_version').fetchone()[0] == 43
    assert db.execute("SELECT COUNT(*) FROM workouts WHERE workout_id NOT LIKE 'packaged-cli-%'").fetchone()[0] == 0
    db.execute('DELETE FROM workout_edit_history')
    db.execute('DELETE FROM workout_local_state')
    db.execute('DELETE FROM workouts')
    for identifier in ['packaged-cli-1', 'packaged-cli-2']:
        db.execute('INSERT INTO workouts(workout_id,workout_type,start_time,end_time,source_scope,synced_at) VALUES(?,?,?,?,?,?)',
                   (identifier, 'run', '2026-10-23T01:00:00Z', '2026-10-23T01:05:00Z', 'user_fused', '2026-10-24T01:00:00Z'))

edit = cli('set-type', '--workout', 'packaged-cli-1', '--workout', 'packaged-cli-2', '--type', 'hiking')
cli('set-type', '--workout', 'packaged-cli-1', '--workout', 'missing-id', '--type', 'road_cycling', expected=1)
with sqlite3.connect(data / 'zepp.db') as db:
    assert db.execute('SELECT workout_type_override FROM workouts ORDER BY workout_id').fetchall() == [('hiking',), ('hiking',)]
hidden = cli('hide', '--workout', 'packaged-cli-1', '--workout', 'packaged-cli-2')
with sqlite3.connect(data / 'zepp.db') as db:
    assert db.execute('SELECT COUNT(*) FROM workouts_visible').fetchone()[0] == 0
    assert db.execute('SELECT COUNT(*) FROM workouts').fetchone()[0] == 2
export_file = data.parent / 'hidden-export.json'
cli('export', '--from', '2026-10-01', '--to', '2026-10-24', '--format', 'json', '--out', str(export_file))
exported = json.loads(export_file.read_text(encoding='utf-8'))
assert exported['data']['workouts'] == []

def edit_id(result):
    return result.get('id') or result.get('edit', {}).get('id') or result.get('editId')

cli('set-type', '--undo', edit_id(hidden))
cli('export', '--from', '2026-10-01', '--to', '2026-10-24', '--format', 'json', '--out', str(export_file))
assert len(json.loads(export_file.read_text(encoding='utf-8'))['data']['workouts']) == 2
cleared = cli('set-type', '--workout', 'packaged-cli-1', '--clear')
with sqlite3.connect(data / 'zepp.db') as db:
    assert db.execute('SELECT workout_type_override FROM workouts WHERE workout_id=?', ['packaged-cli-1']).fetchone()[0] is None
cli('set-type', '--undo', edit_id(cleared))
cli('set-type', '--undo', edit_id(edit))
with sqlite3.connect(data / 'zepp.db') as db:
    assert db.execute('SELECT workout_type_override FROM workouts').fetchall() == [(None,), (None,)]
cli('workout-details', '--status', '--channel', 'official')
report = {'passed': True, 'synthetic_only': True, 'data_dir': str(data), 'commands': commands}
Path(__file__).with_name('packaged-cli-results.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
print(f'Packaged CLI passed {len(commands)} commands with synthetic temporary data.')
