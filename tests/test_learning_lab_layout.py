from html.parser import HTMLParser
from pathlib import Path


ROOT = Path(__file__).parents[1]
LAB = ROOT / "learning-lab"


class _WorkMapParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.in_work_map = False
        self.content = []

    def handle_starttag(self, tag, attrs):
        if tag == "pre" and ("id", "gpu-work-map") in attrs:
            self.in_work_map = True

    def handle_endtag(self, tag):
        if tag == "pre":
            self.in_work_map = False

    def handle_data(self, data):
        if self.in_work_map:
            self.content.append(data)


def test_learning_lab_has_platform_neutral_static_entrypoint():
    html = (LAB / "learn" / "paint-pixels" / "index.html").read_text()

    assert '<main id="lesson"' in html
    assert 'src="../../src/app.mjs"' in html
    assert 'href="../../styles.css"' in html
    assert "Paint Pixels in Parallel" in html
    assert "Question + configuration" in html


def test_learning_lab_exposes_accessible_progress_and_feedback_regions():
    html = (LAB / "learn" / "paint-pixels" / "index.html").read_text()
    app = (LAB / "src" / "app.mjs").read_text()
    scene = (LAB / "src" / "processing-scene.mjs").read_text()

    assert 'aria-label="Lesson progress"' in html
    assert 'id="step-content"' in html
    assert 'id="step-content" class="step-content"' in html
    assert 'id="step-content" class="step-content" aria-live=' not in html
    assert 'id="processing-panel"' in html
    assert 'id="processing-scene"' in html
    assert 'id="processing-status"' in html
    assert 'role="tablist"' not in app
    assert 'role="tab"' not in app
    assert 'role="button" tabindex="${active ? 0 : -1}"' in scene
    assert 'data-scene-status' in scene


def test_learning_lab_styles_support_reduced_motion_and_small_screens():
    css = (LAB / "styles.css").read_text()

    assert "prefers-reduced-motion: reduce" in css
    assert "@media (max-width: 760px)" in css
    assert ":focus-visible" in css


def test_visual_lesson_supports_three_stages_keyboard_and_reduced_motion():
    app = (LAB / "src" / "app.mjs").read_text()
    scene = (LAB / "src" / "processing-scene.mjs").read_text()
    css = (LAB / "styles.css").read_text()

    assert 'const STEP_LABELS = ["Question", "Run", "Compare"]' in app
    assert 'new Set(["Enter", " "])' in app
    assert 'prefers-reduced-motion: reduce' in app
    assert 'data-scene-status' in scene
    assert "Focus or select a worker" in scene
    assert ".processing-lanes { grid-template-columns: 1fr; }" in css


def test_configuration_exposes_workload_and_workgroup_choices():
    app = (LAB / "src" / "app.mjs").read_text()

    assert 'id="experiment-pixels"' in app
    assert 'id="experiment-group"' in app
    assert "active workgroups" in app
    assert 'data-prediction="${value}"' in app


def test_triton_caption_describes_vectorized_program_work():
    content = (LAB / "src" / "lesson-content.mjs").read_text()

    assert "A program ID selects a pixel" not in content
    assert "Triton program that handles vector lanes" in content


def test_learning_lab_does_not_present_simulated_values_as_gpu_measurements():
    content = "\n".join(
        path.read_text()
        for path in LAB.rglob("*")
        if path.is_file() and path.suffix in {".html", ".css", ".mjs", ".md"}
    )

    assert "fake benchmark" not in content.lower()
    assert "simulated gpu time" not in content.lower()
    assert "Slowed visual · not timing" in content


def test_repository_readme_links_to_the_beginner_learning_lab():
    readme = (ROOT / "README.md").read_text()

    assert "learning-lab/" in readme
    assert "Paint Pixels in Parallel" in readme


def test_learning_lab_has_real_gpu_stage_and_explicit_modal_confirmation():
    html = (LAB / "learn" / "paint-pixels" / "index.html").read_text()
    app = (LAB / "src" / "app.mjs").read_text()
    run_controls = (LAB / "src" / "run-controls.mjs").read_text()

    assert 'id="execution-mode"' in html
    assert '"Real CPU + GPU runs"' in app
    assert 'from "./webgpu-runner.mjs"' in app
    assert 'data-run="cpu"' in run_controls
    assert 'data-run="webgpu"' in run_controls
    assert 'data-prediction="${value}" aria-pressed="${state.session.prediction === value}"' in app
    assert "Run CPU" in run_controls
    assert "Run GPU" in run_controls
    assert "Real dispatch and validated result" in (LAB / "src" / "dispatch-replay.mjs").read_text()
    assert "Compare results" in app
    assert 'runWebGpuPaint({ pixels: launchConfig.pixels, groupSize: launchConfig.groupSize })' in app
    assert 'elements.back.disabled = state.lesson.stepIndex === 0 || Boolean(state.running)' in app
    assert 'fetch("/api/capabilities")' in app
    assert "Other hardware" in app
    assert "Modal NVIDIA run is billable" in app
    assert 'fetch("/api/run"' in app
    assert 'confirmed: provider === "modal-triton"' in app
    assert "Run on your Apple GPU" in app
    assert "Run once on Modal" in app


def test_public_site_has_home_trails_and_nested_lesson_routes():
    home = (LAB / "index.html").read_text()
    trails = (LAB / "trails" / "index.html").read_text()
    lesson = (LAB / "learn" / "paint-pixels" / "index.html").read_text()

    assert "See parallel work come alive" in home
    assert 'id="primary-lesson-link"' in home
    assert 'href="./trails/"' in home
    assert 'id="trail-list"' in trails
    assert 'href="../../"' in lesson


def test_homepage_leads_with_guided_expedition_and_optional_hardware():
    home = (LAB / "index.html").read_text()

    assert 'aria-label="Primary navigation"' in home
    assert 'id="primary-lesson-link"' in home
    assert "Configure" in home
    assert "Run" in home
    assert "Compare" in home
    assert "No GPU, install, or account required" in home
    assert "Take it further" in home
    assert 'id="featured-lesson"' in home
    assert 'src="./src/home.mjs"' in home

    styles = (LAB / "styles.css").read_text()
    assert ".progress-list { margin: 0; grid-template-columns: repeat(3, 1fr);" in styles


def test_homepage_gpu_work_map_has_aligned_fixed_width_edges():
    parser = _WorkMapParser()
    home = (LAB / "index.html").read_text()
    parser.feed(home)

    lines = "".join(parser.content).strip("\n").splitlines()

    assert lines
    assert len(lines) == 12
    assert {len(line) for line in lines} == {40}
    assert lines[0].startswith("╔═ GPU WORK MAP ")
    assert lines[-1] == "╚" + "═" * 38 + "╝"
    assert 'id="gpu-work-map" role="img"' in home
    assert 'aria-label="One CPU instruction distributed across many GPU workers"' in home


def test_trail_map_renders_from_shared_catalog():
    trails = (LAB / "trails" / "index.html").read_text()

    assert 'aria-label="Primary navigation"' in trails
    assert "Choose your next trail" in trails
    assert 'id="trail-list"' in trails
    assert 'src="../src/trails.mjs"' in trails


def test_mac_setup_and_cost_boundary_are_documented():
    readme = (LAB / "README.md").read_text()
    requirements = (LAB / "requirements-mac.txt").read_text()

    assert "python learning-lab/server.py" in readme
    assert "Apple silicon" in readme
    assert "billable" in readme
    assert requirements.strip() == "mlx==0.32.0"
