import json
import os
import stat
import subprocess
import textwrap
from pathlib import Path


REPO_ROOT = Path("/Users/hd/Developer/cortana-external")
BACKTESTER_ROOT = REPO_ROOT / "backtester"
DAYTIME_FLOW = BACKTESTER_ROOT / "scripts" / "daytime_flow.sh"
NIGHTTIME_FLOW = BACKTESTER_ROOT / "scripts" / "nighttime_flow.sh"
TREND_SWEEP = REPO_ROOT / "tools" / "stock-discovery" / "trend_sweep.sh"
OPERATOR_WORKFLOW = BACKTESTER_ROOT / "scripts" / "operator_workflow.sh"


def _write_executable(path: Path, content: str) -> None:
    path.write_text(content, encoding="utf-8")
    path.chmod(path.stat().st_mode | stat.S_IXUSR)


def _shell_env(bin_dir: Path) -> dict[str, str]:
    env = os.environ.copy()
    env["PATH"] = f"{bin_dir}:{env['PATH']}"
    return env


def test_daytime_flow_fails_fast_when_market_data_preflight_is_unreachable(tmp_path):
    bin_dir = tmp_path / "bin"
    bin_dir.mkdir()
    _write_executable(
        bin_dir / "curl",
        "#!/usr/bin/env bash\nexit 1\n",
    )

    env = _shell_env(bin_dir)
    env["LOCAL_RUNS_ROOT"] = str(tmp_path / "runs")
    env["MARKET_DATA_SELF_HEAL"] = "0"

    result = subprocess.run(
        ["bash", str(DAYTIME_FLOW)],
        cwd=str(BACKTESTER_ROOT),
        env=env,
        capture_output=True,
        text=True,
        check=False,
    )

    assert result.returncode != 0
    assert "Market data preflight" in result.stdout
    assert "- Unable to reach http://localhost:3033/market-data/ready" in result.stdout
    assert "- Start apps/external-service and try again." in result.stdout


def test_market_data_preflight_auto_restarts_service_once_when_ready_is_unreachable(tmp_path):
    bin_dir = tmp_path / "bin"
    bin_dir.mkdir()
    state_file = tmp_path / "curl-state.txt"
    launch_log = tmp_path / "launchctl.log"
    preflight = BACKTESTER_ROOT / "scripts" / "market_data_preflight.sh"

    _write_executable(
        bin_dir / "curl",
        textwrap.dedent(
            f"""\
            #!/usr/bin/env bash
            set -euo pipefail
            state_file="{state_file}"
            count=0
            if [[ -f "$state_file" ]]; then
              count=$(cat "$state_file")
            fi
            count=$((count + 1))
            printf '%s' "$count" >"$state_file"
            url="${{@: -1}}"
            if [[ "$count" -eq 1 ]]; then
              exit 1
            fi
            if [[ "$url" == *"/market-data/ready" ]]; then
              printf '%s\\n' '{{"data":{{"ready":true,"operatorState":"healthy","operatorAction":""}}}}'
              exit 0
            fi
            if [[ "$url" == *"/market-data/ops" ]]; then
              printf '%s\\n' '{{"data":{{"health":{{"providers":{{"schwab":"configured","schwabTokenStatus":"healthy","providerMetrics":{{}}}}}},"serviceOperatorState":"healthy","serviceOperatorAction":""}}}}'
              exit 0
            fi
            exit 1
            """
        ),
    )
    _write_executable(
        bin_dir / "launchctl",
        textwrap.dedent(
            f"""\
            #!/usr/bin/env bash
            printf '%s\\n' "$*" >>"{launch_log}"
            exit 0
            """
        ),
    )

    env = _shell_env(bin_dir)

    result = subprocess.run(
        [
            "bash",
            "-c",
            f"source '{preflight}' && ensure_market_data_runtime_ready http://localhost:3033 1",
        ],
        cwd=str(BACKTESTER_ROOT),
        env=env,
        capture_output=True,
        text=True,
        check=False,
    )

    assert result.returncode == 0
    assert "Auto-restarted com.cortana.fitness-service after http://localhost:3033/market-data/ready was unreachable." in result.stdout
    assert "kickstart -k" in launch_log.read_text(encoding="utf-8")


def test_nighttime_flow_forces_progress_and_unbuffered_python(tmp_path):
    bin_dir = tmp_path / "bin"
    bin_dir.mkdir()
    uv_log = tmp_path / "uv.log"
    _write_executable(
        bin_dir / "uv",
        textwrap.dedent(
            f"""\
            #!/usr/bin/env bash
            set -euo pipefail
            printf '%s\\n' "ARGS:$*" >>"{uv_log}"
            printf '%s\\n' "NIGHTLY_PROGRESS=${{NIGHTLY_PROGRESS:-}}" >>"{uv_log}"
            if [[ "$1" == "run" && "$2" == "python" && "$3" == "-u" && "$4" == "nightly_discovery.py" ]]; then
              printf '%s\\n' "Nightly discovery progress: screening 1/1 TEST"
              exit 0
            fi
            exit 0
            """
        ),
    )

    env = _shell_env(bin_dir)
    env["REQUIRE_MARKET_DATA_SERVICE"] = "0"
    env["RUN_MARKET_DATA_OPS"] = "0"
    env["RUN_PREDICTION_ACCURACY"] = "0"
    env["RUN_CRYPTO_DAILY_REFRESH"] = "0"
    env["NIGHTLY_LIMIT"] = "1"
    env["SKIP_LIVE_PREFILTER_REFRESH"] = "1"
    env["LOCAL_RUNS_ROOT"] = str(tmp_path / "runs")
    env["RUN_STAMP"] = "run-1"

    result = subprocess.run(
        ["bash", str(NIGHTTIME_FLOW)],
        cwd=str(BACKTESTER_ROOT),
        env=env,
        capture_output=True,
        text=True,
        check=False,
    )

    assert result.returncode == 0
    assert "Nightly discovery progress: screening 1/1 TEST" in result.stdout

    uv_invocation = uv_log.read_text(encoding="utf-8")
    assert "ARGS:run python -u nightly_discovery.py --limit 1 --skip-live-prefilter-refresh" in uv_invocation
    assert "NIGHTLY_PROGRESS=1" in uv_invocation
    manifest_path = tmp_path / "runs" / "run-1" / "run-manifest.json"
    assert manifest_path.exists()
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    assert manifest["artifact_family"] == "run_manifest"
    assert manifest["producer"] == "backtester.nighttime_flow"
    assert manifest["run_kind"] == "nighttime_flow"
    assert any(stage["name"] == "nightly_discovery" for stage in manifest["stages"])
    assert any(artifact["label"] == "nightly-discovery-view" for artifact in manifest["artifacts"])


def test_daytime_flow_writes_run_manifest_and_strategy_artifacts(tmp_path):
    bin_dir = tmp_path / "bin"
    bin_dir.mkdir()
    uv_log = tmp_path / "uv.log"
    leader_basket_path = tmp_path / "leader-baskets-latest.json"
    leader_basket_path.write_text(json.dumps({"buckets": {}, "priority": {"symbols": []}}) + "\n", encoding="utf-8")
    _write_executable(
        bin_dir / "uv",
        textwrap.dedent(
            f"""\
            #!/usr/bin/env bash
            set -euo pipefail
            printf '%s\\n' "ARGS:$*" >>"{uv_log}"
            if [[ "$1" == "run" && "$2" == "python" && "$3" == "canslim_alert.py" ]]; then
              output_json=""
              while [[ $# -gt 0 ]]; do
                if [[ "$1" == "--output-json" ]]; then
                  output_json="$2"
                  shift 2
                  continue
                fi
                shift
              done
              cat >"$output_json" <<'JSON'
            {{"artifact_family":"strategy_alert","schema_version":1,"producer":"backtester.canslim_alert","status":"ok","degraded_status":"healthy","generated_at":"2026-04-03T13:30:00Z","known_at":"2026-04-03T13:30:00Z","strategy":"canslim","summary":{{"scanned":10}},"signals":[],"warnings":[]}}
            JSON
              printf '%s\\n' "CANSLIM Scan"
              exit 0
            fi
            if [[ "$1" == "run" && "$2" == "python" && "$3" == "dipbuyer_alert.py" ]]; then
              output_json=""
              while [[ $# -gt 0 ]]; do
                if [[ "$1" == "--output-json" ]]; then
                  output_json="$2"
                  shift 2
                  continue
                fi
                shift
              done
              cat >"$output_json" <<'JSON'
            {{"artifact_family":"strategy_alert","schema_version":1,"producer":"backtester.dipbuyer_alert","status":"degraded","degraded_status":"degraded_safe","generated_at":"2026-04-03T13:30:00Z","known_at":"2026-04-03T13:30:00Z","strategy":"dip_buyer","summary":{{"scanned":10}},"signals":[],"inputs":{{"source_counts":{{"schwab":7,"cache":3}},"analysis_error_count":0}},"warnings":["tape_previous_session_fallback"]}}
            JSON
              printf '%s\\n' "Dip Buyer Scan"
              exit 0
            fi
            if [[ "$1" == "run" && "$2" == "python" && "$3" == "advisor.py" ]]; then
              printf '%s\\n' "Advisor output"
              exit 0
            fi
            if [[ "$1" == "run" && "$2" == "python" && "$3" == *"local_output_formatter.py" ]]; then
              cat
              exit 0
            fi
            exit 0
            """
        ),
    )

    env = _shell_env(bin_dir)
    env["LOCAL_RUNS_ROOT"] = str(tmp_path / "runs")
    env["RUN_STAMP"] = "run-2"
    env["REQUIRE_MARKET_DATA_SERVICE"] = "0"
    env["RUN_MARKET_INTEL"] = "0"
    env["RUN_DYNAMIC_WATCHLIST_REFRESH"] = "0"
    env["RUN_MARKET_DATA_OPS"] = "0"
    env["RUN_CRYPTO_DAILY_REFRESH"] = "0"
    env["RUN_DEEP_DIVE"] = "0"
    env["LEADER_BASKET_PATH"] = str(leader_basket_path)

    result = subprocess.run(
        ["bash", str(DAYTIME_FLOW)],
        cwd=str(BACKTESTER_ROOT),
        env=env,
        capture_output=True,
        text=True,
        check=False,
    )

    assert result.returncode == 0
    manifest_path = tmp_path / "runs" / "run-2" / "run-manifest.json"
    assert manifest_path.exists()
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    assert manifest["artifact_family"] == "run_manifest"
    assert manifest["producer"] == "backtester.daytime_flow"


def test_operator_workflow_premarket_runs_market_brief_canary_and_runtime_health(tmp_path):
    bin_dir = tmp_path / "bin"
    bin_dir.mkdir()
    uv_log = tmp_path / "uv.log"

    _write_executable(
        bin_dir / "uv",
        textwrap.dedent(
            f"""\
            #!/usr/bin/env bash
            set -euo pipefail
            printf '%s\\n' "$*" >>"{uv_log}"
            case "$3" in
              market_brief_snapshot.py)
                printf '%s\\n' "brief"
                ;;
              pre_open_canary.py)
                printf '%s\\n' "canary"
                ;;
              runtime_health_snapshot.py)
                printf '%s\\n' "health"
                ;;
            esac
            """
        ),
    )

    env = _shell_env(bin_dir)
    result = subprocess.run(
        ["bash", str(OPERATOR_WORKFLOW), "premarket"],
        cwd=str(BACKTESTER_ROOT),
        env=env,
        capture_output=True,
        text=True,
        check=False,
    )

    assert result.returncode == 0
    assert "Workflow: PREMARKET" in result.stdout
    assert "== Market Brief ==" in result.stdout
    assert "== Pre-Open Canary ==" in result.stdout
    assert "== Runtime Health ==" in result.stdout
    uv_calls = uv_log.read_text(encoding="utf-8")
    assert "run python market_brief_snapshot.py --operator" in uv_calls
    assert "run python pre_open_canary.py" in uv_calls
    assert "run python runtime_health_snapshot.py --pretty" in uv_calls


def test_operator_workflow_open_runs_daytime_flow(tmp_path):
    bin_dir = tmp_path / "bin"
    bin_dir.mkdir()
    fake_daytime = tmp_path / "fake-daytime.sh"
    _write_executable(fake_daytime, "#!/usr/bin/env bash\nprintf '%s\\n' 'daytime-ok'\n")

    env = _shell_env(bin_dir)
    env["DAYTIME_FLOW_SCRIPT"] = str(fake_daytime)

    result = subprocess.run(
        ["bash", str(OPERATOR_WORKFLOW), "open"],
        cwd=str(BACKTESTER_ROOT),
        env=env,
        capture_output=True,
        text=True,
        check=False,
    )

    assert result.returncode == 0
    assert "Workflow: OPEN" in result.stdout
    assert "== Daytime Flow ==" in result.stdout
    assert "daytime-ok" in result.stdout


def test_operator_workflow_midday_runs_brief_dipbuyer_and_watchlist(tmp_path):
    bin_dir = tmp_path / "bin"
    bin_dir.mkdir()
    uv_log = tmp_path / "uv.log"
    fake_watch = tmp_path / "fake-watch.sh"
    _write_executable(fake_watch, "#!/usr/bin/env bash\nprintf '%s\\n' 'watch-ok'\n")

    _write_executable(
        bin_dir / "uv",
        textwrap.dedent(
            f"""\
            #!/usr/bin/env bash
            set -euo pipefail
            printf '%s\\n' "$*" >>"{uv_log}"
            case "$3" in
              market_brief_snapshot.py)
                printf '%s\\n' "brief"
                ;;
              dipbuyer_alert.py)
                printf '%s\\n' "dipbuyer"
                ;;
            esac
            """
        ),
    )

    env = _shell_env(bin_dir)
    env["WATCHLIST_WATCH_SCRIPT"] = str(fake_watch)

    result = subprocess.run(
        ["bash", str(OPERATOR_WORKFLOW), "midday"],
        cwd=str(BACKTESTER_ROOT),
        env=env,
        capture_output=True,
        text=True,
        check=False,
    )

    assert result.returncode == 0
    assert "Workflow: MIDDAY" in result.stdout
    assert "== Market Brief ==" in result.stdout
    assert "== Dip Buyer ==" in result.stdout
    assert "== Watchlist Pulse ==" in result.stdout
    assert "watch-ok" in result.stdout
    uv_calls = uv_log.read_text(encoding="utf-8")
    assert "run python market_brief_snapshot.py --operator" in uv_calls
    assert "run python dipbuyer_alert.py --limit 8 --min-score 6 --universe-size 120" in uv_calls


def test_operator_workflow_close_runs_brief_lifecycle_and_accuracy(tmp_path):
    bin_dir = tmp_path / "bin"
    bin_dir.mkdir()
    uv_log = tmp_path / "uv.log"

    _write_executable(
        bin_dir / "uv",
        textwrap.dedent(
            f"""\
            #!/usr/bin/env bash
            set -euo pipefail
            printf '%s\\n' "$*" >>"{uv_log}"
            case "$3" in
              market_brief_snapshot.py)
                printf '%s\\n' "brief"
                ;;
              trade_lifecycle_report.py)
                printf '%s\\n' "lifecycle"
                ;;
              prediction_accuracy_report.py)
                printf '%s\\n' "accuracy"
                ;;
            esac
            """
        ),
    )

    env = _shell_env(bin_dir)
    result = subprocess.run(
        ["bash", str(OPERATOR_WORKFLOW), "close"],
        cwd=str(BACKTESTER_ROOT),
        env=env,
        capture_output=True,
        text=True,
        check=False,
    )

    assert result.returncode == 0
    assert "Workflow: CLOSE" in result.stdout
    uv_calls = uv_log.read_text(encoding="utf-8")
    assert "run python market_brief_snapshot.py --operator" in uv_calls
    assert "run python trade_lifecycle_report.py" in uv_calls
    assert "run python prediction_accuracy_report.py" in uv_calls


def test_operator_workflow_night_runs_nighttime_flow(tmp_path):
    bin_dir = tmp_path / "bin"
    bin_dir.mkdir()
    fake_night = tmp_path / "fake-night.sh"
    _write_executable(fake_night, "#!/usr/bin/env bash\nprintf '%s\\n' 'night-ok'\n")

    env = _shell_env(bin_dir)
    env["NIGHTTIME_FLOW_SCRIPT"] = str(fake_night)

    result = subprocess.run(
        ["bash", str(OPERATOR_WORKFLOW), "night"],
        cwd=str(BACKTESTER_ROOT),
        env=env,
        capture_output=True,
        text=True,
        check=False,
    )

    assert result.returncode == 0
    assert "Workflow: NIGHT" in result.stdout
    assert "== Nighttime Flow ==" in result.stdout
    assert "night-ok" in result.stdout


def test_operator_workflow_health_runs_runtime_canary_and_ops_highway(tmp_path):
    bin_dir = tmp_path / "bin"
    bin_dir.mkdir()
    uv_log = tmp_path / "uv.log"

    _write_executable(
        bin_dir / "uv",
        textwrap.dedent(
            f"""\
            #!/usr/bin/env bash
            set -euo pipefail
            printf '%s\\n' "$*" >>"{uv_log}"
            case "$3" in
              runtime_health_snapshot.py)
                printf '%s\\n' "health"
                ;;
              pre_open_canary.py)
                printf '%s\\n' "canary"
                ;;
              ops_highway_snapshot.py)
                printf '%s\\n' "ops"
                ;;
            esac
            """
        ),
    )

    env = _shell_env(bin_dir)
    result = subprocess.run(
        ["bash", str(OPERATOR_WORKFLOW), "health"],
        cwd=str(BACKTESTER_ROOT),
        env=env,
        capture_output=True,
        text=True,
        check=False,
    )

    assert result.returncode == 0
    assert "Workflow: HEALTH" in result.stdout
    uv_calls = uv_log.read_text(encoding="utf-8")
    assert "run python runtime_health_snapshot.py --pretty" in uv_calls
    assert "run python pre_open_canary.py" in uv_calls
    assert "run python ops_highway_snapshot.py --pretty" in uv_calls


def test_trend_sweep_preserves_existing_watchlist_when_x_auth_is_unavailable(tmp_path):
    bin_dir = tmp_path / "bin"
    bin_dir.mkdir()
    _write_executable(
        bin_dir / "bird",
        textwrap.dedent(
            """\
            #!/usr/bin/env bash
            echo "Missing required credentials"
            exit 1
            """
        ),
    )

    sync_stub = tmp_path / "sync_bird_auth.sh"
    _write_executable(
        sync_stub,
        "#!/usr/bin/env bash\nexit 0\n",
    )

    watchlist_path = tmp_path / "dynamic_watchlist.json"
    existing_payload = {
        "updated_at": "2026-03-24T10:00:00-04:00",
        "source": "x_twitter_sweep",
        "tickers": [{"symbol": "NVDA", "mentions": 7, "first_seen": "2026-03-20", "last_seen": "2026-03-24"}],
    }
    watchlist_path.write_text(json.dumps(existing_payload, indent=2) + "\n", encoding="utf-8")

    env = _shell_env(bin_dir)
    env["WATCHLIST_FILE"] = str(watchlist_path)
    env["BIRD_AUTH_ENV_PATH"] = str(tmp_path / "x-twitter-bird.env")
    env["BIRD_SYNC_AUTH_CMD"] = str(sync_stub)
    env["BIRD_COOKIE_SOURCE"] = "chrome"
    env["BIRD_CHROME_PROFILE_DIR"] = str(tmp_path / "openclaw-profile")

    result = subprocess.run(
        ["bash", str(TREND_SWEEP)],
        cwd=str(REPO_ROOT),
        env=env,
        capture_output=True,
        text=True,
        check=False,
    )

    assert result.returncode == 0
    assert "X/Twitter auth unavailable; using the previous dynamic watchlist." in result.stdout
    assert json.loads(watchlist_path.read_text(encoding="utf-8")) == existing_payload
