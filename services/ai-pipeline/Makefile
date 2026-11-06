# ─────────────────────────────────────────────────────────────────────────────
# Rapto AI Pipeline — developer & CI targets
# Run from services/ai-pipeline. Eval targets need the service env vars
# (OPENAI_API_KEY, …); LLM-judge targets need: pip install -r requirements-eval.txt
# ─────────────────────────────────────────────────────────────────────────────
PYTHON      ?= python
SERVICE_URL ?= http://localhost:8001

.PHONY: test install install-eval eval-all eval-in-process eval-commitments eval-action-items \
        eval-decisions eval-blockers eval-risks eval-summary eval-deepeval eval-ci \
        eval-gate tracing-enable build-fixture

test:
	$(PYTHON) -m pytest -q

install:
	$(PYTHON) -m pip install -r requirements-dev.txt

install-eval:
	$(PYTHON) -m pip install -r requirements-eval.txt

# ── Evaluation ────────────────────────────────────────────────────────────────
eval-all:
	$(PYTHON) -m src.eval.run_all_evals --service-url $(SERVICE_URL)

eval-in-process:
	$(PYTHON) -m src.eval.run_all_evals --in-process

eval-commitments:
	$(PYTHON) -m src.eval.run_all_evals --service-url $(SERVICE_URL) --extractor commitments

eval-action-items:
	$(PYTHON) -m src.eval.run_all_evals --service-url $(SERVICE_URL) --extractor action_items

eval-decisions:
	$(PYTHON) -m src.eval.run_all_evals --service-url $(SERVICE_URL) --extractor decisions

eval-blockers:
	$(PYTHON) -m src.eval.run_all_evals --service-url $(SERVICE_URL) --extractor blockers

eval-risks:
	$(PYTHON) -m src.eval.run_all_evals --service-url $(SERVICE_URL) --extractor risks

eval-summary:
	$(PYTHON) -m src.eval.ragas_harness --all --service-url $(SERVICE_URL)

eval-deepeval:
	$(PYTHON) -m src.eval.deepeval_harness --all --service-url $(SERVICE_URL)

# ── CI Gate ───────────────────────────────────────────────────────────────────
# Fast, deterministic: matchers only. Absolute targets are recorded but the
# gate fails only on F1 regression > 3 points vs the committed baseline.
eval-ci:
	$(PYTHON) -m src.eval.run_all_evals --no-deepeval --no-enforce-targets --service-url $(SERVICE_URL) && $(PYTHON) -m src.eval.ci_gate

# Strict release gate: targets AND regression.
eval-gate:
	$(PYTHON) -m src.eval.run_all_evals --no-deepeval --service-url $(SERVICE_URL) && $(PYTHON) -m src.eval.ci_gate --enforce-targets

# ── Tracing ───────────────────────────────────────────────────────────────────
tracing-enable:
	@echo "Set LANGSMITH_TRACING_ENABLED=true and LANGSMITH_API_KEY in .env, then restart the service"

# ── Fixture Generation ────────────────────────────────────────────────────────
# make build-fixture ARGS="--meeting-id <id> --name standup_03 --meeting-type standup --service-url http://localhost:8001"
build-fixture:
	$(PYTHON) -m src.eval.fixtures_builder $(ARGS)
